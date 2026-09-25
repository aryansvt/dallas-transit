import {
  buildSchedule,
  type GeographicJourney,
  type RoutingSchedule,
  type TransitLeg,
} from '@dallas-transit/router';
import { freshness, usable } from './freshness.js';
import {
  matchSnapshot,
  matches,
  predicted,
  stopEvent,
  type MatchedSnapshot,
} from './match.js';
import type { LiveJourney, LiveLeg, Snapshot, TransferRisk } from './types.js';

export function overlayJourney(
  journey: GeographicJourney,
  schedule: RoutingSchedule,
  snapshot: Snapshot | null,
  now: number,
  anchor: number,
  agencyIds: readonly string[] = [],
  observe?: (diagnostics: Record<string, number>) => void,
): LiveJourney {
  if (
    journey.publicationId !== schedule.publicationId ||
    journey.serviceDate !== schedule.serviceDate
  )
    throw new Error('journey-context-mismatch');
  const matched = matchSnapshot(snapshot, schedule, anchor, now);
  observe?.(matched.diagnostics);
  const legs: LiveLeg[] = [];
  const reasons = new Set<string>();
  for (const [legIndex, leg] of journey.legs.entries()) {
    if (leg.kind !== 'transit') continue;
    const trip = schedule.trips.find((t) => t.id === leg.tripId);
    if (
      !trip ||
      trip.routeId !== leg.routeId ||
      trip.events[leg.boardingOccurrence]?.sequence !== leg.boardingSequence ||
      trip.events[leg.alightingOccurrence]?.sequence !==
        leg.alightingSequence ||
      trip.events[leg.boardingOccurrence]?.stopId !== leg.boardingStopId ||
      trip.events[leg.alightingOccurrence]?.stopId !== leg.alightingStopId
    )
      throw new Error('journey-leg-mismatch');
    const match = matched.trips.get(leg.tripId);
    const state = match
      ? freshness(
          snapshot,
          now,
          match.update.timestamp ?? snapshot?.sourceTimestamp,
        )
      : 'SCHEDULED_FALLBACK';
    const valid = usable(state);
    const board = valid ? match?.stops.get(leg.boardingSequence) : undefined;
    const alight = valid ? match?.stops.get(leg.alightingSequence) : undefined;
    const departureTime =
      board?.relationship === 0
        ? predicted(board.departure, leg.departureTime, anchor)
        : null;
    const arrivalTime =
      alight?.relationship === 0
        ? predicted(alight.arrival, leg.arrivalTime, anchor)
        : null;
    const cancelled = valid && match?.update.identity.relationship === 3;
    const vehicle = matched.vehicles.get(leg.tripId);
    const current = vehicle ? stopEvent(trip, vehicle) : null;
    const occurrence = current ? trip.events.indexOf(current) : -1;
    const boarding =
      vehicle && occurrence > leg.boardingOccurrence
        ? 'DEPARTED'
        : departureTime !== null && departureTime + anchor >= now
          ? 'UPCOMING'
          : 'UNKNOWN';
    const live: LiveLeg = {
      legIndex,
      freshness:
        usable(state) &&
        !cancelled &&
        departureTime === null &&
        arrivalTime === null &&
        board?.relationship !== 1 &&
        alight?.relationship !== 1
          ? 'SCHEDULED_FALLBACK'
          : state,
      updatedAt: match?.update.timestamp ?? snapshot?.sourceTimestamp ?? null,
      departureTime,
      arrivalTime,
      departureDelay:
        departureTime === null ? null : departureTime - leg.departureTime,
      cancelled: Boolean(cancelled),
      boardingSkipped: board?.relationship === 1,
      alightingSkipped: alight?.relationship === 1,
      vehicle: vehicle
        ? { ...vehicle, freshness: freshness(snapshot, now, vehicle.timestamp) }
        : null,
      stopsRemaining:
        occurrence >= leg.boardingOccurrence &&
        occurrence <= leg.alightingOccurrence
          ? leg.alightingOccurrence -
            occurrence +
            (vehicle?.status === 'STOPPED' ? 0 : 1)
          : null,
      boarding,
    };
    if (live.cancelled) reasons.add('A selected service is cancelled.');
    if (live.boardingSkipped || live.alightingSkipped)
      reasons.add('A selected boarding or exit stop is skipped.');
    legs.push(live);
  }
  const transfers: TransferRisk[] = [];
  for (let i = 1; i < legs.length; i++) {
    const a = legs[i - 1]!,
      b = legs[i]!;
    const inbound = journey.legs[a.legIndex] as TransitLeg,
      outbound = journey.legs[b.legIndex] as TransitLeg;
    const between = journey.legs.slice(a.legIndex + 1, b.legIndex);
    const walking = between.reduce(
      (sum, l) =>
        sum + (l.kind === 'transfer' ? l.arrivalTime - l.departureTime : 0),
      0,
    );
    const allowance = schedule.stops.find(
      (s) => s.id === outbound.boardingStopId,
    )!.changeSeconds;
    const requiredSeconds = walking + allowance;
    const knownLink =
      inbound.alightingStopId === outbound.boardingStopId ||
      between.some(
        (l) =>
          l.kind === 'transfer' &&
          l.fromStopId === inbound.alightingStopId &&
          l.toStopId === outbound.boardingStopId,
      );
    const slack =
      a.arrivalTime !== null && b.departureTime !== null
        ? b.departureTime - a.arrivalTime - requiredSeconds
        : null;
    const inboundUncertainty = matched.trips
      .get(inbound.tripId)
      ?.stops.get(inbound.alightingSequence)?.arrival?.uncertainty;
    const outboundUncertainty = matched.trips
      .get(outbound.tripId)
      ?.stops.get(outbound.boardingSequence)?.departure?.uncertainty;
    // Missing GTFS uncertainty means unknown, not a zero-error guarantee.
    // Evaluate point estimates while explicitly exposing that limitation.
    const uncertainty = (inboundUncertainty ?? 0) + (outboundUncertainty ?? 0);
    const disrupted =
      a.cancelled || b.cancelled || a.alightingSkipped || b.boardingSkipped;
    const reliable =
      a.freshness === 'LIVE' && b.freshness === 'LIVE' && knownLink;
    const status = disrupted
      ? 'INFEASIBLE'
      : !reliable || slack === null
        ? 'UNKNOWN'
        : slack + uncertainty < 0
          ? 'INFEASIBLE'
          : slack - uncertainty < 60
            ? 'AT_RISK'
            : 'FEASIBLE';
    let reason = disrupted
      ? 'A required service or transfer stop is unavailable.'
      : status === 'UNKNOWN'
        ? 'Fresh timing is needed for both services.'
        : status === 'INFEASIBLE'
          ? 'Updated times do not leave the required change time.'
          : status === 'AT_RISK'
            ? 'Less than one minute remains beyond the required change time, or prediction uncertainty overlaps it.'
            : 'Updated times leave the required change time.';
    if (
      !disrupted &&
      status !== 'UNKNOWN' &&
      (inboundUncertainty == null || outboundUncertainty == null)
    )
      reason += ' Based on predictions; uncertainty was not fully provided.';
    transfers.push({
      inboundLeg: a.legIndex,
      outboundLeg: b.legIndex,
      status,
      requiredSeconds,
      remainingSeconds: slack,
      reason,
    });
    if (status === 'INFEASIBLE') reasons.add(reason);
  }
  const relevant =
    snapshot?.publicationId === schedule.publicationId &&
    usable(freshness(snapshot, now))
      ? snapshot.alerts.filter((alert) => {
          if (
            alert.periods.length &&
            !alert.periods.some(
              (p) =>
                (p.start === null || p.start <= now) &&
                (p.end === null || now < p.end),
            )
          )
            return false;
          return alert.selectors.some((s) => {
            if (s.agencyId && !agencyIds.includes(s.agencyId)) return false;
            if (!s.agencyId && !s.routeId && !s.stopId && !s.trip) return false;
            return journey.legs.some((l) => {
              if (l.kind !== 'transit') return false;
              const trip = schedule.trips.find((t) => t.id === l.tripId)!;
              return (
                (!s.routeId || s.routeId === l.routeId) &&
                (!s.trip || matches(s.trip, trip, schedule.serviceDate)) &&
                (!s.stopId ||
                  trip.events
                    .slice(l.boardingOccurrence, l.alightingOccurrence + 1)
                    .some((e) => e.stopId === s.stopId))
              );
            });
          });
        })
      : [];
  const deduped = new Map(
    relevant.map((a) => [
      JSON.stringify([a.title, a.description]),
      { id: a.id, title: a.title, description: a.description },
    ]),
  );
  const feedState =
    snapshot?.publicationId === schedule.publicationId
      ? freshness(snapshot, now)
      : 'UNAVAILABLE';
  return {
    publicationId: journey.publicationId,
    serviceDate: journey.serviceDate,
    checkedAt: now,
    validUntil: Math.min(
      now + 45,
      ...[
        ...(snapshot?.sourceTimestamp != null
          ? [
              {
                time: Math.min(snapshot.sourceTimestamp, snapshot.receivedAt),
                state: feedState,
              },
            ]
          : []),
        ...legs.flatMap((l) => [
          ...(l.updatedAt !== null
            ? [{ time: l.updatedAt, state: l.freshness }]
            : []),
          ...(l.vehicle?.timestamp != null
            ? [{ time: l.vehicle.timestamp, state: l.vehicle.freshness }]
            : []),
        ]),
      ]
        .filter((entry) => usable(entry.state))
        .map((entry) => entry.time + (entry.state === 'LIVE' ? 120 : 300) + 1),
    ),
    freshness:
      usable(feedState) && !legs.some((l) => usable(l.freshness) || l.vehicle)
        ? 'SCHEDULED_FALLBACK'
        : feedState,
    legs,
    transfers,
    alerts: [...deduped.values()].slice(0, 20),
    replan: { suggested: reasons.size > 0, reasons: [...reasons] },
  };
}

/** Request-local schedule view; the router and durable schedule remain unchanged. */
export function adjustedSchedule(
  schedule: RoutingSchedule,
  snapshot: Snapshot | null,
  now: number,
  anchor: number,
): RoutingSchedule {
  const matched: MatchedSnapshot = matchSnapshot(
    snapshot,
    schedule,
    anchor,
    now,
  );
  return buildSchedule({
    ...schedule,
    trips: schedule.trips.flatMap((trip) => {
      const match = matched.trips.get(trip.id);
      if (
        !match ||
        freshness(
          snapshot,
          now,
          match.update.timestamp ?? snapshot?.sourceTimestamp,
        ) !== 'LIVE'
      )
        return [trip];
      if (match.update.identity.relationship === 3) return [];
      const events = trip.events.map((e) => {
        const update = match.stops.get(e.sequence);
        if (!update || update.relationship === 2) return e;
        if (update.relationship === 1)
          return { ...e, pickup: 1 as const, dropOff: 1 as const };
        return {
          ...e,
          arrival: predicted(update.arrival, e.arrival, anchor) ?? e.arrival,
          departure:
            predicted(update.departure, e.departure, anchor) ?? e.departure,
        };
      });
      let previous = -1;
      for (const e of events)
        for (const time of [e.arrival, e.departure])
          if (time !== null) {
            // Partial predictions can contradict the unobserved schedule. Exclude this
            // run from replanning rather than inventing delay propagation or a ride.
            if (time < previous) return [];
            previous = time;
          }
      return [{ ...trip, events }];
    }),
  });
}

/** A plan chosen using predictions still carries original timetable values as
 * its fallback. Forecasts belong only to the separately expiring live overlay.
 * Scheduled inter-leg chronology can be missed when a delayed run was selected;
 * that is honest schedule fallback, not a promise the connection remains live.
 */
export function scheduledBase(
  journey: GeographicJourney,
  schedule: RoutingSchedule,
): GeographicJourney {
  let previousArrival = journey.requestedDepartureTime;
  const legs = journey.legs.map((leg) => {
    if (leg.kind === 'transit') {
      const trip = schedule.trips.find((t) => t.id === leg.tripId)!;
      const departureTime = trip.events[leg.boardingOccurrence]!.departure!;
      const arrivalTime = trip.events[leg.alightingOccurrence]!.arrival!;
      previousArrival = arrivalTime;
      return { ...leg, departureTime, arrivalTime };
    }
    if (leg.kind === 'transfer' || leg.phase === 'egress') {
      const duration = leg.arrivalTime - leg.departureTime;
      const departureTime = previousArrival;
      previousArrival += duration;
      return { ...leg, departureTime, arrivalTime: previousArrival };
    }
    previousArrival = leg.arrivalTime;
    return leg;
  });
  return {
    ...journey,
    legs,
    arrivalTime: previousArrival,
    durationSeconds: Math.max(
      0,
      previousArrival - journey.requestedDepartureTime,
    ),
  };
}

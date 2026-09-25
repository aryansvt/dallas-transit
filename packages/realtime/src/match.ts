import type {
  RoutingSchedule,
  ScheduledTrip,
  StopEvent,
} from '@dallas-transit/router';
import type {
  EventPrediction,
  Snapshot,
  StopUpdate,
  TripIdentity,
  TripUpdate,
  Vehicle,
} from './types.js';
import { freshness, usable } from './freshness.js';

export function matches(
  identity: TripIdentity,
  trip: ScheduledTrip,
  date: string,
): boolean {
  // Require an explicit operating date: a bare trip ID cannot distinguish yesterday's overnight run.
  return (
    identity.tripId === trip.id &&
    identity.date === date.replaceAll('-', '') &&
    (identity.routeId === null || identity.routeId === trip.routeId) &&
    (identity.startTime === null ||
      identity.startTime === trip.events[0]?.departure) &&
    [0, 3].includes(identity.relationship)
  );
}
export function stopEvent(
  trip: ScheduledTrip,
  update: { sequence: number | null; stopId: string | null },
): StopEvent | null {
  const found = trip.events.filter(
    (e) =>
      (update.sequence === null || update.sequence === e.sequence) &&
      (update.stopId === null || update.stopId === e.stopId),
  );
  return (update.sequence !== null || update.stopId !== null) &&
    found.length === 1
    ? found[0]!
    : null;
}
export function predicted(
  p: EventPrediction | null,
  scheduled: number | null,
  anchor: number,
): number | null {
  if (!p || scheduled === null || (p.time === null && p.delay === null))
    return null;
  const value = p.time !== null ? p.time - anchor : scheduled + p.delay!;
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    Math.abs(value - scheduled) <= 21600
    ? value
    : null;
}
export interface MatchedTrip {
  update: TripUpdate;
  stops: Map<number, StopUpdate>;
}
export interface MatchedSnapshot {
  trips: Map<string, MatchedTrip>;
  vehicles: Map<string, Vehicle>;
  diagnostics: Record<string, number>;
}
export function matchSnapshot(
  snapshot: Snapshot | null,
  schedule: RoutingSchedule,
  anchor: number,
  now: number,
): MatchedSnapshot {
  const result: MatchedSnapshot = {
    trips: new Map(),
    vehicles: new Map(),
    diagnostics: {},
  };
  const note = (code: string) => {
    result.diagnostics[code] = (result.diagnostics[code] ?? 0) + 1;
  };
  if (!snapshot) return result;
  if (snapshot.publicationId !== schedule.publicationId) {
    note('publication-mismatch');
    return result;
  }
  const trips = new Map(schedule.trips.map((t) => [t.id, t]));
  const duplicates = <T extends { identity: TripIdentity }>(values: T[]) => {
    const counts = new Map<string, number>();
    for (const value of values)
      counts.set(
        value.identity.tripId,
        (counts.get(value.identity.tripId) ?? 0) + 1,
      );
    return counts;
  };
  const updateCounts = duplicates(snapshot.trips),
    vehicleCounts = duplicates(snapshot.vehicles);
  for (const update of snapshot.trips) {
    const trip = trips.get(update.identity.tripId);
    if (!trip || !matches(update.identity, trip, schedule.serviceDate)) {
      note('unmatched-trip');
      continue;
    }
    if (updateCounts.get(trip.id) !== 1) {
      note('ambiguous-trip');
      continue;
    }
    const stops = new Map<number, StopUpdate>();
    let previousSequence = -1,
      previousTime = -1,
      valid = true;
    for (const s of update.stops) {
      const event = stopEvent(trip, s);
      if (
        !event ||
        stops.has(event.sequence) ||
        event.sequence <= previousSequence ||
        ![0, 1, 2].includes(s.relationship)
      ) {
        valid = false;
        break;
      }
      previousSequence = event.sequence;
      for (const [p, scheduled] of [
        [s.arrival, event.arrival],
        [s.departure, event.departure],
      ] as const) {
        const time = predicted(p, scheduled, anchor);
        if (p && (p.time !== null || p.delay !== null) && time === null)
          valid = false;
        if (time !== null) {
          if (time < previousTime) valid = false;
          previousTime = time;
        }
      }
      stops.set(event.sequence, s);
    }
    if (!valid) {
      note('invalid-stops-or-chronology');
      continue;
    }
    result.trips.set(trip.id, { update, stops });
  }
  for (const vehicle of snapshot.vehicles) {
    const trip = trips.get(vehicle.identity.tripId);
    if (
      !trip ||
      !matches(vehicle.identity, trip, schedule.serviceDate) ||
      vehicleCounts.get(trip.id) !== 1
    ) {
      note('unmatched-or-ambiguous-vehicle');
      continue;
    }
    if (
      (vehicle.sequence !== null || vehicle.stopId !== null) &&
      !stopEvent(trip, vehicle)
    ) {
      note('unmatched-vehicle-stop');
      continue;
    }
    if (usable(freshness(snapshot, now, vehicle.timestamp)))
      result.vehicles.set(trip.id, vehicle);
  }
  return result;
}

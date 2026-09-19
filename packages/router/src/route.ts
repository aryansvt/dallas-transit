import { scheduleIndexes } from './schedule.js';
import type {
  Journey,
  JourneyLeg,
  RoutingRequest,
  RoutingResult,
  RoutingSchedule,
} from './types.js';
import { integer, serviceDate } from './validation.js';

/** Four rides is a bounded local-journey default; callers may explicitly raise it. */
export const DEFAULT_MAX_TRANSFERS = 3;

interface Label {
  readonly time: number;
  readonly previous: Label | null;
  readonly leg: JourneyLeg | null;
}

function reconstruct(
  schedule: RoutingSchedule,
  request: RoutingRequest,
  label: Label,
  boardings: number,
): Journey {
  const legs: JourneyLeg[] = [];
  for (
    let cursor: Label | null = label;
    cursor !== null;
    cursor = cursor.previous
  )
    if (cursor.leg) legs.push(cursor.leg);
  legs.reverse();
  return {
    publicationId: schedule.publicationId,
    serviceDate: schedule.serviceDate,
    originStopId: request.originStopId,
    destinationStopId: request.destinationStopId,
    requestedDepartureTime: request.departureTime,
    arrivalTime: label.time,
    durationSeconds: label.time - request.departureTime,
    boardingCount: boardings,
    transferCount: Math.max(0, boardings - 1),
    legs,
  };
}

/** Marked-pattern, boarding-round search. No schedule or predecessor is mutated. */
export function route(
  schedule: RoutingSchedule,
  request: RoutingRequest,
): RoutingResult {
  integer(request.departureTime, 'departureTime');
  serviceDate(request.serviceDate);
  const maxTransfers = request.maxTransfers ?? DEFAULT_MAX_TRANSFERS;
  integer(maxTransfers, 'maxTransfers', Number.MAX_SAFE_INTEGER - 1);
  if (request.serviceDate !== schedule.serviceDate)
    return { status: 'no-journey', reason: 'service-date-not-loaded' };
  const index = scheduleIndexes(schedule);
  const origin = index.stopIndex.get(request.originStopId);
  const destination = index.stopIndex.get(request.destinationStopId);
  if (origin === undefined || destination === undefined)
    return { status: 'no-journey', reason: 'unknown-stop' };
  const initial: Label = {
    time: request.departureTime,
    previous: null,
    leg: null,
  };
  if (origin === destination)
    return {
      status: 'ok',
      journeys: [reconstruct(schedule, request, initial, 0)],
    };
  if (schedule.trips.length === 0)
    return { status: 'no-journey', reason: 'no-service' };

  // Round 0 is the origin. Later maps contain only strict improvements with
  // exactly k boardings. Earlier arrivals with fewer boardings dominate safely
  // because transfer eligibility depends only on stop and time, never trip pairs.
  let previous = new Map<number, Label>([[origin, initial]]);
  const best = new Float64Array(schedule.stops.length).fill(Infinity);
  // Do not seed best with round 0: interchange links are unavailable before a
  // ride. A later return to the origin can unlock a link and is a distinct state.
  const journeys: Journey[] = [];
  let destinationArrival = Infinity;
  for (let round = 1; round <= maxTransfers + 1 && previous.size > 0; round++) {
    const markedPatterns = new Set<number>();
    for (const stop of previous.keys())
      for (const pattern of index.patternsAtStop[stop]!)
        markedPatterns.add(pattern);
    const current = new Map<number, Label>();
    let destinationLabel: Label | undefined;

    // Canonical pattern/trip/occurrence order makes equal-cost ties repeatable.
    for (const patternIndex of [...markedPatterns].sort((a, b) => a - b)) {
      const pattern = schedule.patterns[patternIndex]!;
      for (const tripIndex of pattern.tripIndexes) {
        const trip = schedule.trips[tripIndex]!;
        const tripStops = index.tripStops[tripIndex]!;
        let boarding:
          { label: Label; occurrence: number; departure: number } | undefined;
        for (
          let occurrence = 0;
          occurrence < trip.events.length;
          occurrence++
        ) {
          const event = trip.events[occurrence]!;
          const stop = tripStops[occurrence]!;
          // Alight BEFORE considering boarding this occurrence: even equal-time
          // events must have a strictly later alighting position in the trip.
          if (boarding && event.dropOff === 0 && event.arrival !== null) {
            const improvesStop = event.arrival < best[stop]!;
            const improvesDestination =
              stop === destination &&
              event.arrival < (destinationLabel?.time ?? destinationArrival);
            if (improvesStop || improvesDestination) {
              const boarded = trip.events[boarding.occurrence]!;
              const label: Label = {
                time: event.arrival,
                previous: boarding.label,
                leg: {
                  kind: 'transit',
                  tripId: trip.id,
                  routeId: trip.routeId,
                  patternId: pattern.id,
                  boardingStopId: boarded.stopId,
                  boardingOccurrence: boarding.occurrence,
                  boardingSequence: boarded.sequence,
                  departureTime: boarding.departure,
                  alightingStopId: event.stopId,
                  alightingOccurrence: occurrence,
                  alightingSequence: event.sequence,
                  arrivalTime: event.arrival,
                },
              };
              if (improvesStop) {
                best[stop] = label.time;
                current.set(stop, label);
              }
              if (improvesDestination) destinationLabel = label;
            }
          }
          // Scan every trip, not just the first departure: overtaking is allowed.
          // The first feasible occurrence on THIS trip reaches all later visits.
          if (!boarding && event.pickup === 0 && event.departure !== null) {
            const label = previous.get(stop);
            const change =
              round === 1 ? 0 : schedule.stops[stop]!.changeSeconds;
            if (label && label.time + change <= event.departure)
              boarding = { label, occurrence, departure: event.departure };
          }
        }
      }
    }
    // Results end at a transit alighting. Links are for interchange, not access
    // or egress. Keep destination labels separately from link reachability.
    if (destinationLabel) {
      destinationArrival = destinationLabel.time;
      journeys.push(reconstruct(schedule, request, destinationLabel, round));
    }

    // Directed transfer closure within the same boarding round. FIFO relaxation
    // supports chains without requiring precomputed transitive closure. Strict
    // improvement prevents zero-duration cycles from constructing cyclic paths.
    const queue = [...current.keys()].sort((a, b) => a - b);
    const queued = new Set(queue);
    for (let head = 0; head < queue.length; head++) {
      const from = queue[head]!;
      queued.delete(from);
      const label = current.get(from)!;
      for (const linkIndex of index.transfersAtStop[from]!) {
        const link = schedule.transfers[linkIndex]!;
        const to = index.stopIndex.get(link.toStopId)!;
        const arrival = label.time + link.durationSeconds;
        if (arrival >= best[to]!) continue;
        best[to] = arrival;
        current.set(to, {
          time: arrival,
          previous: label,
          leg: {
            kind: 'transfer',
            transferId: link.id,
            fromStopId: link.fromStopId,
            toStopId: link.toStopId,
            departureTime: label.time,
            arrivalTime: arrival,
          },
        });
        if (!queued.has(to)) {
          queue.push(to);
          queued.add(to);
        }
      }
    }
    previous = current;
  }
  journeys.sort(
    (a, b) =>
      a.arrivalTime - b.arrivalTime || a.transferCount - b.transferCount,
  );
  return journeys.length
    ? { status: 'ok', journeys }
    : { status: 'no-journey', reason: 'unreachable' };
}

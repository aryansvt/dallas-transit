import type {
  RoutePattern,
  RoutingSchedule,
  ScheduleInput,
  ScheduledTrip,
} from './types.js';
import { compareIds, identifier, integer, serviceDate } from './validation.js';

interface ScheduleIndexes {
  readonly stopIndex: ReadonlyMap<string, number>;
  readonly patternsAtStop: readonly (readonly number[])[];
  readonly transfersAtStop: readonly (readonly number[])[];
  readonly tripStops: readonly (readonly number[])[];
}

// Maps stay private: Object.freeze(new Map()) does not prevent set().
const indexes = new WeakMap<RoutingSchedule, ScheduleIndexes>();

export function scheduleIndexes(schedule: RoutingSchedule): ScheduleIndexes {
  const result = indexes.get(schedule);
  if (!result)
    throw new Error('Use buildSchedule to construct a routing schedule');
  return result;
}

export function buildSchedule(input: ScheduleInput): RoutingSchedule {
  identifier(input.publicationId, 'publicationId');
  serviceDate(input.serviceDate);
  const stopIndex = new Map<string, number>();
  const stops = input.stops
    .map((stop) => {
      identifier(stop.id, 'stop id');
      integer(stop.changeSeconds, 'changeSeconds');
      return Object.freeze({ ...stop });
    })
    .sort((a, b) => compareIds(a.id, b.id));
  stops.forEach((stop, index) => {
    if (stopIndex.has(stop.id)) throw new Error(`Duplicate stop: ${stop.id}`);
    stopIndex.set(stop.id, index);
  });
  function requireStop(id: string): number {
    const index = stopIndex.get(id);
    if (index === undefined) throw new Error(`Unknown stop: ${id}`);
    return index;
  }
  const active = new Set(input.activeServiceIds);
  for (const id of active) identifier(id, 'service id');
  const tripIds = new Set<string>();
  const trips: ScheduledTrip[] = [];
  for (const trip of input.trips) {
    identifier(trip.id, 'trip id');
    identifier(trip.routeId, 'route id');
    identifier(trip.serviceId, 'service id');
    if (tripIds.has(trip.id)) throw new Error(`Duplicate trip: ${trip.id}`);
    tripIds.add(trip.id);
    if (trip.events.length < 2)
      throw new Error(`Trip ${trip.id} needs two visits`);
    let lastSequence = -1;
    let lastTime = -1;
    const events = trip.events.map((event) => {
      requireStop(event.stopId);
      integer(event.sequence, 'sequence');
      if (event.sequence <= lastSequence)
        throw new Error(`Unordered sequence: ${trip.id}`);
      lastSequence = event.sequence;
      integer(event.pickup, 'pickup', 3);
      integer(event.dropOff, 'dropOff', 3);
      for (const time of [event.arrival, event.departure]) {
        if (time === null) continue;
        integer(time, 'service seconds');
        if (time < lastTime) throw new Error(`Backwards time: ${trip.id}`);
        lastTime = time;
      }
      return Object.freeze({ ...event });
    });
    if (active.has(trip.serviceId))
      trips.push(Object.freeze({ ...trip, events: Object.freeze(events) }));
  }
  trips.sort((a, b) => compareIds(a.id, b.id));

  // Exact ordered visit behavior; neither route_id nor direction defines a pattern.
  const grouped = new Map<string, number[]>();
  trips.forEach((trip, index) => {
    const key = JSON.stringify([
      trip.routeId,
      trip.events.map((event) => [event.stopId, event.pickup, event.dropOff]),
    ]);
    const group = grouped.get(key);
    if (group) group.push(index);
    else grouped.set(key, [index]);
  });
  const patterns: RoutePattern[] = [...grouped.entries()]
    .sort(([a], [b]) => compareIds(a, b))
    .map(([, tripIndexes], index) => {
      const trip = trips[tripIndexes[0]!]!;
      return Object.freeze({
        id: `pattern:${index}`,
        routeId: trip.routeId,
        stopIds: Object.freeze(trip.events.map((event) => event.stopId)),
        tripIndexes: Object.freeze(tripIndexes),
      });
    });
  const patternsAtStop: number[][] = stops.map(() => []);
  patterns.forEach((pattern, index) => {
    for (const stop of new Set(pattern.stopIds))
      patternsAtStop[requireStop(stop)]!.push(index);
  });
  const transferIds = new Set<string>();
  const transfers = (input.transfers ?? [])
    .map((link) => {
      identifier(link.id, 'transfer id');
      if (transferIds.has(link.id))
        throw new Error(`Duplicate transfer: ${link.id}`);
      transferIds.add(link.id);
      requireStop(link.fromStopId);
      requireStop(link.toStopId);
      integer(link.durationSeconds, 'transfer duration');
      return Object.freeze({ ...link });
    })
    .sort((a, b) => compareIds(a.id, b.id));
  const transfersAtStop: number[][] = stops.map(() => []);
  transfers.forEach((link, index) =>
    transfersAtStop[requireStop(link.fromStopId)]!.push(index),
  );
  const result: RoutingSchedule = Object.freeze({
    publicationId: input.publicationId,
    serviceDate: input.serviceDate,
    activeServiceIds: Object.freeze([...active].sort(compareIds)),
    stops: Object.freeze(stops),
    trips: Object.freeze(trips),
    patterns: Object.freeze(patterns),
    transfers: Object.freeze(transfers),
    eventCount: trips.reduce((sum, trip) => sum + trip.events.length, 0),
  });
  indexes.set(result, {
    stopIndex,
    patternsAtStop,
    transfersAtStop,
    tripStops: trips.map((trip) =>
      trip.events.map((event) => requireStop(event.stopId)),
    ),
  });
  return result;
}

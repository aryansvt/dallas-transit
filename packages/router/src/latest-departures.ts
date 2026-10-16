import { DEFAULT_MAX_TRANSFERS } from './route.js';
import { scheduleIndexes } from './schedule.js';
import type { LatestDeparturesRequest, RoutingSchedule } from './types.js';
import { identifier, integer, serviceDate } from './validation.js';

/** Reverse round-based scan from the targets. For each origin, entry k is the
 * latest boarding that still alights at some target by its deadline using at
 * most k + 1 rides, or null. It tracks only time and rides and builds no
 * journeys; it mirrors the forward rules exactly so the forward window search
 * can start from these instants without missing a journey.
 */
export function latestDepartures(
  schedule: RoutingSchedule,
  request: LatestDeparturesRequest,
): ReadonlyMap<string, readonly (number | null)[]> {
  serviceDate(request.serviceDate);
  const maxTransfers = request.maxTransfers ?? DEFAULT_MAX_TRANSFERS;
  integer(maxTransfers, 'maxTransfers', 16);
  for (const target of request.targets) {
    identifier(target.stopId, 'target stop id');
    if (!Number.isFinite(target.arrivalDeadline))
      throw new RangeError('arrivalDeadline must be finite');
  }
  const index = scheduleIndexes(schedule);
  const rides = maxTransfers + 1;
  const results = new Map<string, (number | null)[]>(
    request.originStopIds.map((id) => [id, Array<null>(rides).fill(null)]),
  );
  if (request.serviceDate !== schedule.serviceDate) return results;
  const n = schedule.stops.length;
  // alight: latest arrival that still makes it; legacy: same via legacy links only
  const alight = new Float64Array(n).fill(-Infinity);
  const legacy = new Float64Array(n).fill(-Infinity);
  const board = new Float64Array(n).fill(-Infinity);
  let marked = new Set<number>();
  const raise = (stop: number, time: number) => {
    if (time <= alight[stop]!) return;
    alight[stop] = time;
    marked.add(stop);
  };
  for (const target of request.targets) {
    const stop = index.stopIndex.get(target.stopId);
    if (stop !== undefined) raise(stop, target.arrivalDeadline);
  }
  const incoming: number[][] = schedule.stops.map(() => []);
  schedule.transfers.forEach((link, i) =>
    incoming[index.stopIndex.get(link.toStopId)!]!.push(i),
  );
  for (let round = 0; round < rides; round++) {
    const patterns = new Set<number>();
    for (const stop of marked)
      for (const p of index.patternsAtStop[stop]!) patterns.add(p);
    marked = new Set();
    const improved = new Set<number>();
    for (const p of patterns)
      for (const ti of schedule.patterns[p]!.tripIndexes) {
        const trip = schedule.trips[ti]!,
          tripStops = index.tripStops[ti]!;
        let reaches = false;
        for (let i = trip.events.length - 1; i >= 0; i--) {
          const event = trip.events[i]!,
            stop = tripStops[i]!;
          // board before alighting here: forward alights first at one visit
          if (
            reaches &&
            event.pickup === 0 &&
            event.departure !== null &&
            event.departure > board[stop]!
          ) {
            board[stop] = event.departure;
            improved.add(stop);
          }
          if (
            event.dropOff === 0 &&
            event.arrival !== null &&
            event.arrival <= alight[stop]!
          )
            reaches = true;
        }
      }
    // alight reads stayed fixed during the scan, so each round adds one ride
    const queue: number[] = [];
    for (const stop of improved) {
      const ready = board[stop]! - schedule.stops[stop]!.changeSeconds;
      if (ready > legacy[stop]!) {
        legacy[stop] = ready;
        raise(stop, ready);
        queue.push(stop);
      }
      // a pedestrian link is one complete hop straight to the boarding
      for (const li of incoming[stop]!) {
        const link = schedule.transfers[li]!;
        if (link.pedestrian)
          raise(
            index.stopIndex.get(link.fromStopId)!,
            ready - link.durationSeconds,
          );
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const to = queue[head]!;
      for (const li of incoming[to]!) {
        const link = schedule.transfers[li]!;
        if (link.pedestrian) continue;
        const from = index.stopIndex.get(link.fromStopId)!;
        const time = legacy[to]! - link.durationSeconds;
        if (time <= legacy[from]!) continue;
        legacy[from] = time;
        raise(from, time);
        queue.push(from);
      }
    }
    for (const [id, values] of results) {
      const stop = index.stopIndex.get(id);
      if (stop !== undefined && board[stop]! > -Infinity)
        values[round] = board[stop]!;
    }
  }
  return results;
}

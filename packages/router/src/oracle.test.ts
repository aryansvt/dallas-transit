import { expect, it } from 'vitest';
import { routeToStops } from './index.js';
import type { RoutingSchedule } from './index.js';
import {
  assertJourney,
  query,
  randomSchedule,
  seededRandom,
} from './test-support.js';

/** Test-only exhaustive ride enumeration: no pattern scans or earliest-label pruning.
 * Link shortest paths are computed by independent bounded Bellman-Ford relaxation.
 * Deliberately tiny networks keep the exponential ride enumeration inexpensive. */
function exhaustive(
  schedule: RoutingSchedule,
  departure: number,
  maxBoardings: number,
) {
  const outcomes: number[][] = [];
  function explore(
    stop: string,
    time: number,
    boardings: number,
    walking: number,
    risk: number,
  ): void {
    if (boardings === maxBoardings) return;
    const reachable: { stop: string; time: number; walking: number }[] = [];
    function links(
      at: string,
      arr: number,
      walk: number,
      seen: Set<string>,
      used: boolean,
      anyLink: boolean,
    ) {
      reachable.push({ stop: at, time: arr, walking: walk });
      if (!boardings || used) return;
      for (const l of schedule.transfers)
        if (
          l.fromStopId === at &&
          !seen.has(l.toStopId) &&
          !(l.pedestrian && anyLink)
        )
          links(
            l.toStopId,
            arr + l.durationSeconds,
            walk + (l.pedestrian ? l.durationSeconds : 0),
            new Set([...seen, l.toStopId]),
            !!l.pedestrian,
            true,
          );
    }
    links(stop, time, walking, new Set([stop]), false, false);
    for (const reach of reachable) {
      const ready =
        reach.time +
        (boardings
          ? schedule.stops.find((s) => s.id === reach.stop)!.changeSeconds
          : 0);
      for (const t of schedule.trips)
        for (let b = 0; b < t.events.length; b++) {
          const boarding = t.events[b]!;
          if (
            boarding.stopId !== reach.stop ||
            boarding.pickup !== 0 ||
            boarding.departure === null ||
            boarding.departure < ready
          )
            continue;
          const nextRisk =
            risk +
            (boardings ? Math.max(0, 300 - (boarding.departure - ready)) : 0);
          for (let a = b + 1; a < t.events.length; a++) {
            const alight = t.events[a]!;
            if (alight.dropOff !== 0 || alight.arrival === null) continue;
            if (alight.stopId === 'D')
              outcomes.push([
                boardings + 1,
                alight.arrival,
                reach.walking,
                nextRisk,
              ]);
            explore(
              alight.stopId,
              alight.arrival,
              boardings + 1,
              reach.walking,
              nextRisk,
            );
          }
        }
    }
  }
  explore('A', departure, 0, 0, 0);
  return uniqueMetrics(
    outcomes.filter(
      (b) =>
        !outcomes.some(
          (a) => a.every((v, i) => v <= b[i]!) && a.some((v, i) => v < b[i]!),
        ),
    ),
  );
}
function uniqueMetrics(values: number[][]) {
  return [...new Set(values.map((v) => JSON.stringify(v)))]
    .sort()
    .map((v) => JSON.parse(v) as number[]);
}

it('matches exhaustive Pareto enumeration and itinerary invariants on 160 deterministic small networks', () => {
  const random = seededRandom(739391);
  for (let fixture = 0; fixture < 160; fixture++) {
    const schedule = randomSchedule(random);
    for (const departureTime of [90, 140, 200]) {
      const result = query(schedule, { departureTime, maxTransfers: 2 });
      const actual =
        result.status === 'ok'
          ? uniqueMetrics(
              result.journeys.map((j) => [
                j.boardingCount,
                j.arrivalTime,
                j.walkingDurationSeconds,
                j.scheduledTransferRisk,
              ]),
            )
          : [];
      expect(actual, `fixture ${fixture}, departure ${departureTime}`).toEqual(
        exhaustive(schedule, departureTime, 3),
      );
      const batched = routeToStops(
        schedule,
        {
          serviceDate: schedule.serviceDate,
          originStopId: 'A',
          departureTime,
          maxTransfers: 2,
        },
        ['B', 'C', 'D'],
      ).get('D')!;
      const batchedMetrics =
        batched.status === 'ok'
          ? uniqueMetrics(
              batched.journeys.map((j) => [
                j.boardingCount,
                j.arrivalTime,
                j.walkingDurationSeconds,
                j.scheduledTransferRisk,
              ]),
            )
          : [];
      expect(batchedMetrics).toEqual(actual);
      if (result.status === 'ok')
        result.journeys.forEach((j) => assertJourney(schedule, j));
    }
  }
});

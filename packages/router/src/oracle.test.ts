import { expect, it } from 'vitest';
import { buildSchedule } from './index.js';
import type { RoutingSchedule } from './index.js';
import { assertJourney, input, query, trip, visit } from './test-support.js';

/** Test-only exhaustive ride enumeration: no pattern scans or earliest-label pruning.
 * Link shortest paths are computed by independent bounded Bellman-Ford relaxation.
 * Deliberately tiny networks keep the exponential ride enumeration inexpensive. */
function exhaustive(
  schedule: RoutingSchedule,
  departure: number,
  maxBoardings: number,
) {
  const arrivals = new Map<number, number>();
  const linksFrom = (origin: string, time: number) => {
    const times = new Map<string, number>([[origin, time]]);
    for (let pass = 1; pass < schedule.stops.length; pass++)
      for (const link of schedule.transfers) {
        const reached = times.get(link.fromStopId);
        if (
          reached !== undefined &&
          reached + link.durationSeconds <
            (times.get(link.toStopId) ?? Infinity)
        )
          times.set(link.toStopId, reached + link.durationSeconds);
      }
    return times;
  };
  function explore(stop: string, time: number, boardings: number): void {
    if (boardings === maxBoardings) return;
    const reachable = boardings
      ? linksFrom(stop, time)
      : new Map([[stop, time]]);
    for (const [boardStop, reached] of reachable) {
      const ready =
        reached +
        (boardings
          ? schedule.stops.find((s) => s.id === boardStop)!.changeSeconds
          : 0);
      for (const candidate of schedule.trips)
        for (let b = 0; b < candidate.events.length; b++) {
          const board = candidate.events[b]!;
          if (
            board.stopId !== boardStop ||
            board.pickup !== 0 ||
            board.departure === null ||
            board.departure < ready
          )
            continue;
          for (let a = b + 1; a < candidate.events.length; a++) {
            const alight = candidate.events[a]!;
            if (alight.dropOff !== 0 || alight.arrival === null) continue;
            if (alight.stopId === 'D')
              arrivals.set(
                boardings + 1,
                Math.min(
                  arrivals.get(boardings + 1) ?? Infinity,
                  alight.arrival,
                ),
              );
            explore(alight.stopId, alight.arrival, boardings + 1);
          }
        }
    }
  }
  explore('A', departure, 0);
  let best = Infinity;
  return [...arrivals]
    .sort(([a], [b]) => a - b)
    .filter(([, arrival]) => {
      if (arrival >= best) return false;
      best = arrival;
      return true;
    })
    .sort((a, b) => a[1] - b[1]);
}

it('matches exhaustive Pareto enumeration and itinerary invariants on 160 deterministic small networks', () => {
  let state = 739391;
  const random = (n: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * n);
  };
  const stops = ['A', 'B', 'C', 'D'];
  for (let fixture = 0; fixture < 160; fixture++) {
    const trips = Array.from({ length: 5 }, (_, i) => {
      let time = 90 + random(100);
      return trip(`trip-${i}`, [], [], {
        routeId: `route-${random(2)}`,
        serviceId: random(5) === 0 ? 'inactive' : 'weekday',
        events: Array.from({ length: 2 + random(3) }, (_, j) => {
          time += random(35);
          const arrival = time;
          time += random(5);
          return visit(stops[random(4)]!, arrival, j * 3, {
            departure: time,
            pickup: random(7) === 0 ? 1 : 0,
            dropOff: random(7) === 0 ? 1 : 0,
          });
        }),
      });
    });
    const schedule = buildSchedule(
      input(trips, {
        stops: stops.map((id) => ({ id, changeSeconds: random(6) })),
        transfers: Array.from({ length: 3 }, (_, i) => ({
          id: `link-${i}`,
          fromStopId: stops[random(4)]!,
          toStopId: stops[random(4)]!,
          durationSeconds: random(8),
        })),
      }),
    );
    for (const departureTime of [90, 140, 200]) {
      const result = query(schedule, { departureTime, maxTransfers: 2 });
      const actual =
        result.status === 'ok'
          ? result.journeys.map((j) => [j.boardingCount, j.arrivalTime])
          : [];
      expect(actual, `fixture ${fixture}, departure ${departureTime}`).toEqual(
        exhaustive(schedule, departureTime, 3),
      );
      if (result.status === 'ok')
        result.journeys.forEach((j) => assertJourney(schedule, j));
    }
  }
});

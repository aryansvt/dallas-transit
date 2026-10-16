import { expect } from 'vitest';
import { buildSchedule, route } from './index.js';
import type {
  Journey,
  RoutingRequest,
  RoutingSchedule,
  ScheduleInput,
  ScheduledTrip,
  StopEvent,
  TransitLeg,
} from './index.js';

export const day = '2026-09-18';
/** Tiny seconds-based timetables make connection arithmetic visible in tests. */
export function visit(
  stopId: string,
  time: number,
  sequence: number,
  overrides: Partial<StopEvent> = {},
): StopEvent {
  return {
    stopId,
    arrival: time,
    departure: time,
    sequence,
    pickup: 0,
    dropOff: 0,
    ...overrides,
  };
}
export function trip(
  id: string,
  stops: string[],
  times: number[],
  overrides: Partial<ScheduledTrip> = {},
): ScheduledTrip {
  return {
    id,
    routeId: id,
    serviceId: 'weekday',
    events: stops.map((stop, i) => visit(stop, times[i]!, (i + 1) * 10)),
    ...overrides,
  };
}
export function input(
  trips: readonly ScheduledTrip[],
  overrides: Partial<ScheduleInput> = {},
): ScheduleInput {
  return {
    publicationId: 'fixture-v1',
    serviceDate: day,
    activeServiceIds: ['weekday'],
    stops: ['A', 'B', 'C', 'D', 'E', 'X', 'Y', 'Z'].map((id) => ({
      id,
      changeSeconds: 0,
    })),
    trips,
    ...overrides,
  };
}
export function query(
  schedule: RoutingSchedule,
  overrides: Partial<RoutingRequest> = {},
) {
  return route(schedule, {
    serviceDate: day,
    originStopId: 'A',
    destinationStopId: 'D',
    departureTime: 90,
    ...overrides,
  });
}
export function journeys(
  schedule: RoutingSchedule,
  overrides: Partial<RoutingRequest> = {},
): readonly Journey[] {
  const result = query(schedule, overrides);
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error(result.reason);
  return result.journeys;
}
export function rides(journey: Journey): readonly TransitLeg[] {
  return journey.legs.filter((leg) => leg.kind === 'transit');
}
export function network() {
  // A--B--C--D: three rides; a slow A--D alternative and a missed B connection.
  return buildSchedule(
    input([
      trip('slow-direct', ['A', 'D'], [100, 500]),
      trip('feeder', ['A', 'B'], [100, 150]),
      trip('missed', ['B', 'D'], [149, 180]),
      trip('catchable', ['B', 'D'], [170, 300]),
      trip('middle', ['B', 'C'], [150, 200]),
      trip('final', ['C', 'D'], [200, 250]),
    ]),
  );
}

/** Deterministic LCG so seeded fixtures are identical on every machine. */
export function seededRandom(seed: number) {
  let state = seed;
  return (n: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * n);
  };
}
/** Tiny random A-D network with restrictions, inactive service and links. */
export function randomSchedule(random: (n: number) => number) {
  const stops = ['A', 'B', 'C', 'D'];
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
  return buildSchedule(
    input(trips, {
      stops: stops.map((id) => ({ id, changeSeconds: random(6) })),
      transfers: Array.from({ length: 3 }, (_, i) => ({
        id: `link-${i}`,
        fromStopId: stops[random(4)]!,
        toStopId: stops[random(4)]!,
        durationSeconds: random(8),
        ...(random(2)
          ? {
              pedestrian: {
                distanceMeters: random(20),
                provenance: 'synthetic',
              },
            }
          : {}),
      })),
    }),
  );
}

export function assertJourney(
  schedule: RoutingSchedule,
  journey: Journey,
): void {
  let time = journey.requestedDepartureTime;
  let stop = journey.originStopId;
  let boardings = 0;
  expect(journey.publicationId).toBe(schedule.publicationId);
  expect(journey.serviceDate).toBe(schedule.serviceDate);
  for (const leg of journey.legs) {
    expect(leg.departureTime).toBeGreaterThanOrEqual(time);
    expect(leg.arrivalTime).toBeGreaterThanOrEqual(leg.departureTime);
    if (leg.kind === 'transit') {
      const usedTrip = schedule.trips.find((t) => t.id === leg.tripId)!;
      const board = usedTrip.events[leg.boardingOccurrence]!;
      const alight = usedTrip.events[leg.alightingOccurrence]!;
      expect(schedule.activeServiceIds).toContain(usedTrip.serviceId);
      expect(leg.boardingStopId).toBe(stop);
      expect(board).toMatchObject({
        stopId: stop,
        sequence: leg.boardingSequence,
        departure: leg.departureTime,
        pickup: 0,
      });
      expect(alight).toMatchObject({
        stopId: leg.alightingStopId,
        sequence: leg.alightingSequence,
        arrival: leg.arrivalTime,
        dropOff: 0,
      });
      expect(leg.alightingOccurrence).toBeGreaterThan(leg.boardingOccurrence);
      expect(leg.alightingSequence).toBeGreaterThan(leg.boardingSequence);
      if (boardings > 0)
        expect(leg.departureTime).toBeGreaterThanOrEqual(
          time + schedule.stops.find((s) => s.id === stop)!.changeSeconds,
        );
      stop = leg.alightingStopId;
      boardings++;
    } else {
      const link = schedule.transfers.find((t) => t.id === leg.transferId)!;
      expect(boardings).toBeGreaterThan(0);
      expect(leg.fromStopId).toBe(stop);
      expect(leg.arrivalTime - leg.departureTime).toBe(link.durationSeconds);
      expect(link).toMatchObject({ fromStopId: stop, toStopId: leg.toStopId });
      stop = leg.toStopId;
    }
    time = leg.arrivalTime;
  }
  expect(stop).toBe(journey.destinationStopId);
  expect(journey.arrivalTime).toBe(time);
  expect(journey.durationSeconds).toBe(time - journey.requestedDepartureTime);
  expect(journey.boardingCount).toBe(boardings);
  expect(journey.transferCount).toBe(Math.max(0, boardings - 1));
  if (boardings) expect(journey.legs.at(-1)?.kind).toBe('transit');
}

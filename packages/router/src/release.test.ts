import { expect, it } from 'vitest';
import { buildSchedule, composeGeographicJourneys } from './index.js';
import { input, trip, journeys, query } from './test-support.js';
const pedestrian = {
  distanceMeters: 375,
  provenance: 'synthetic verified crossing',
};
it('routes 232 -> directed pedestrian interchange -> 236 -> 227 and counts walk separately from change time', () => {
  const schedule = buildSchedule(
    input(
      [
        trip('232', ['A', 'B'], [100, 200]),
        trip('236', ['C', 'E'], [620, 700]),
        trip('227', ['E', 'D'], [820, 900]),
      ],
      {
        stops: ['A', 'B', 'C', 'D', 'E'].map((id) => ({
          id,
          changeSeconds: 120,
        })),
        transfers: [
          {
            id: 'crossing',
            fromStopId: 'B',
            toStopId: 'C',
            durationSeconds: 300,
            pedestrian,
          },
        ],
      },
    ),
  );
  const j = journeys(schedule)[0]!;
  expect(j).toMatchObject({
    arrivalTime: 900,
    transferCount: 2,
    walkingDurationSeconds: 300,
    walkingDistanceMeters: 375,
    scheduledTransferRisk: 600,
  });
  expect(j.legs.map((l) => l.kind)).toEqual([
    'transit',
    'transfer',
    'transit',
    'transit',
  ]);
  // each boarding after the first carries its own share of the journey risk
  expect(
    j.legs.map((l) => (l.kind === 'transit' ? l.scheduledTransferRisk : '-')),
  ).toEqual([undefined, '-', 300, 300]);
  expect(query(buildSchedule({ ...schedule, transfers: [] })).status).toBe(
    'no-journey',
  );
  expect(
    query(
      buildSchedule({
        ...schedule,
        transfers: [
          {
            id: 'reverse',
            fromStopId: 'C',
            toStopId: 'B',
            durationSeconds: 300,
            pedestrian,
          },
        ],
      }),
    ).status,
  ).toBe('no-journey');
  const origin = { latitude: 32, longitude: -96 },
    destination = { latitude: 33, longitude: -96 };
  const result = composeGeographicJourneys(
    schedule,
    {
      origin,
      destination,
      serviceDate: schedule.serviceDate,
      departureTime: 90,
    },
    [
      {
        publicationId: schedule.publicationId,
        stopId: 'A',
        coordinate: origin,
        walk: {
          origin,
          destination: origin,
          durationSeconds: 10,
          distanceMeters: 12,
        },
      },
    ],
    [
      {
        publicationId: schedule.publicationId,
        stopId: 'D',
        coordinate: destination,
        walk: {
          origin: destination,
          destination,
          durationSeconds: 20,
          distanceMeters: 24,
        },
      },
    ],
  );
  expect(result).toMatchObject({
    status: 'ok',
    journeys: [
      {
        walkingDurationSeconds: 330,
        walkingDistanceMeters: 411,
        interchangeDurationSeconds: 300,
      },
    ],
  });
});
it('splits scheduled transfer risk per boarding and sums to the journey value', () => {
  const schedule = buildSchedule(
    input(
      [
        trip('X', ['A', 'B'], [100, 200]),
        trip('Y', ['B', 'C'], [620, 700]),
        trip('Z', ['C', 'D'], [880, 960]),
      ],
      {
        stops: ['A', 'B', 'C', 'D'].map((id) => ({ id, changeSeconds: 120 })),
      },
    ),
  );
  const j = journeys(schedule)[0]!;
  // B: ready 320, leaves 620, 300 spare -> 0. C: ready 820, leaves 880 -> 240
  expect(
    j.legs.map((l) => (l.kind === 'transit' ? l.scheduledTransferRisk : '-')),
  ).toEqual([undefined, 0, 240]);
  expect(j.scheduledTransferRisk).toBe(240);
});
it('cannot concatenate pedestrian links or mix them with legacy links to evade the envelope', () => {
  const base = input([
    trip('first', ['A', 'B'], [100, 150]),
    trip('last', ['E', 'D'], [800, 900]),
  ]);
  for (const measured of [true, false]) {
    const s = buildSchedule({
      ...base,
      transfers: [
        {
          id: 'one',
          fromStopId: 'B',
          toStopId: 'C',
          durationSeconds: 10,
          pedestrian,
        },
        {
          id: 'two',
          fromStopId: 'C',
          toStopId: 'E',
          durationSeconds: 10,
          ...(measured ? { pedestrian } : {}),
        },
        { id: 'cycle', fromStopId: 'C', toStopId: 'B', durationSeconds: 0 },
      ],
    });
    expect(query(s).status).toBe('no-journey');
  }
  expect(() =>
    buildSchedule({
      ...base,
      transfers: [
        {
          id: 'too-long',
          fromStopId: 'B',
          toStopId: 'E',
          durationSeconds: 1801,
          pedestrian,
        },
      ],
    }),
  ).toThrow(/envelope/);
});
it('does not discard a later less-walking predecessor that catches the same departure', () => {
  const s = buildSchedule(
    input(
      [
        trip('early', ['A', 'B'], [100, 150]),
        trip('later', ['A', 'C'], [100, 240]),
        trip('finish', ['C', 'D'], [600, 700]),
      ],
      {
        transfers: [
          {
            id: 'walk',
            fromStopId: 'B',
            toStopId: 'C',
            durationSeconds: 30,
            pedestrian,
          },
        ],
      },
    ),
  );
  const j = journeys(s)[0]!;
  expect(j.walkingDurationSeconds).toBe(0);
  expect(
    j.legs.filter((l) => l.kind === 'transit').map((l) => l.routeId),
  ).toEqual(['later', 'finish']);
});
it('keeps an intermediate later but safer path needed to win a final risk tie', () => {
  const s = buildSchedule(
    input([
      trip('tight', ['A', 'B'], [100, 190]),
      trip('safe', ['A', 'C'], [100, 110]),
      trip('tight2', ['B', 'E'], [200, 240]),
      trip('safe2', ['C', 'E'], [500, 550]),
      trip('last', ['E', 'D'], [900, 1000]),
    ]),
  );
  const j = journeys(s)[0]!;
  expect(j.scheduledTransferRisk).toBe(0);
  expect(
    j.legs.filter((l) => l.kind === 'transit').map((l) => l.routeId),
  ).toEqual(['safe', 'safe2', 'last']);
});
it('retains separate same-route trips rather than inferring a stay-seated ride', () => {
  const s = buildSchedule(
    input([
      trip('a', ['A', 'B'], [100, 200], { routeId: '883E' }),
      trip('b', ['B', 'D'], [550, 650], { routeId: '883E' }),
    ]),
  );
  expect(journeys(s)[0]).toMatchObject({ boardingCount: 2, transferCount: 1 });
});

import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  latestDepartures,
  routeToStops,
  type RoutingSchedule,
} from './index.js';
import {
  day,
  input,
  randomSchedule,
  seededRandom,
  trip,
} from './test-support.js';

const latest = (
  schedule: RoutingSchedule,
  deadline: number,
  overrides: { earliestDeparture?: number; maxTransfers?: number } = {},
) =>
  latestDepartures(schedule, {
    serviceDate: day,
    originStopIds: ['A'],
    targets: [{ stopId: 'D', arrivalDeadline: deadline }],
    earliestDeparture: 0,
    maxTransfers: 1,
    ...overrides,
  }).get('A');

// three direct A-D trips and one faster A-B-D connection
const network = (changeAtB = 0) =>
  buildSchedule(
    input(
      [
        trip('direct-1', ['A', 'D'], [100, 400]),
        trip('direct-2', ['A', 'D'], [200, 500]),
        trip('direct-3', ['A', 'D'], [300, 600]),
        trip('feeder', ['A', 'B'], [350, 380]),
        trip('connection', ['B', 'D'], [390, 480]),
      ],
      {
        stops: ['A', 'B', 'D'].map((id) => ({
          id,
          changeSeconds: id === 'B' ? changeAtB : id === 'A' ? 1000 : 0,
        })),
      },
    ),
  );

describe('reverse latest-departure pass', () => {
  it('reports the latest departure per ride count, arriving exactly at the deadline counts', () => {
    expect(latest(network(), 500)).toEqual([200, 350]);
    expect(latest(network(), 499)).toEqual([100, 350]);
  });

  it('returns nulls when no journey meets the deadline', () => {
    expect(latest(network(), 399)).toEqual([null, null]);
  });

  it('needs the change allowance before a connection but not before the first ride', () => {
    // 380 + 20 misses the 390 connection; A's large allowance never applies
    expect(latest(network(20), 500)).toEqual([200, 200]);
  });

  it('ignores departures before the window start', () => {
    expect(latest(network(), 499, { earliestDeparture: 150 })).toEqual([
      null,
      350,
    ]);
  });

  it('keeps 24:00+ service on the same service date', () => {
    const schedule = buildSchedule(
      input([trip('late', ['A', 'D'], [86500, 87300])]),
    );
    expect(latest(schedule, 87300, { maxTransfers: 0 })).toEqual([86500]);
  });

  it('chains legacy links but never chains a pedestrian link', () => {
    const schedule = buildSchedule(
      input(
        [
          trip('to-b', ['A', 'B'], [100, 200]),
          trip('from-e', ['E', 'D'], [230, 300]),
          trip('to-x', ['A', 'X'], [150, 200]),
          trip('from-z', ['Z', 'D'], [230, 300]),
        ],
        {
          transfers: [
            { id: 'b-c', fromStopId: 'B', toStopId: 'C', durationSeconds: 10 },
            { id: 'c-e', fromStopId: 'C', toStopId: 'E', durationSeconds: 10 },
            {
              id: 'x-y',
              fromStopId: 'X',
              toStopId: 'Y',
              durationSeconds: 10,
              pedestrian: { distanceMeters: 10, provenance: 'synthetic' },
            },
            { id: 'y-z', fromStopId: 'Y', toStopId: 'Z', durationSeconds: 10 },
          ],
        },
      ),
    );
    // to-x at 150 would need pedestrian x-y then legacy y-z
    expect(latest(schedule, 300)).toEqual([null, 100]);
  });

  it('matches the forward engine on 160 seeded networks', () => {
    const random = seededRandom(271828);
    for (let fixture = 0; fixture < 160; fixture++) {
      const base = randomSchedule(random);
      // larger allowances than the oracle's so missed connections are common
      const schedule = buildSchedule({
        ...base,
        stops: base.stops.map((s) => ({ ...s, changeSeconds: random(30) })),
      });
      const instants = [
        ...new Set(
          schedule.trips.flatMap((t) =>
            t.events
              .filter(
                (e) =>
                  e.stopId === 'A' && e.pickup === 0 && e.departure !== null,
              )
              .map((e) => e.departure!),
          ),
        ),
      ];
      for (const [deadline, earliestDeparture] of [
        [180, 0],
        [220, 0],
        [260, 120],
        [300, 0],
        [340, 150],
      ] as const) {
        const deadlines = { C: deadline - 30, D: deadline };
        // brute force: latest first boarding of any on-time journey from any instant
        const expected: (number | null)[] = [null, null, null];
        for (const departureTime of instants.filter(
          (t) => t >= earliestDeparture,
        )) {
          const results = routeToStops(
            schedule,
            {
              serviceDate: day,
              originStopId: 'A',
              departureTime,
              maxTransfers: 2,
            },
            ['C', 'D'],
          );
          for (const [stop, result] of results) {
            if (result.status !== 'ok') continue;
            for (const j of result.journeys) {
              if (
                !j.legs.length ||
                j.arrivalTime > deadlines[stop as 'C' | 'D']
              )
                continue;
              for (let k = j.boardingCount - 1; k < 3; k++)
                expected[k] = Math.max(
                  expected[k] ?? -1,
                  j.legs[0]!.departureTime,
                );
            }
          }
        }
        expect(
          latestDepartures(schedule, {
            serviceDate: day,
            originStopIds: ['A'],
            targets: [
              { stopId: 'C', arrivalDeadline: deadlines.C },
              { stopId: 'D', arrivalDeadline: deadlines.D },
            ],
            earliestDeparture,
            maxTransfers: 2,
          }).get('A'),
          `fixture ${fixture}, deadline ${deadline}`,
        ).toEqual(expected);
      }
    }
  });
});

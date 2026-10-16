import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  latestDepartures,
  routeToStops,
  routeWindow,
  type Journey,
  type RoutingResult,
  type RoutingSchedule,
  type WindowRequest,
} from './index.js';
import {
  day,
  input,
  network as threeRides,
  randomSchedule,
  seededRandom,
  trip,
} from './test-support.js';

const latest = (
  schedule: RoutingSchedule,
  deadline: number,
  overrides: { maxTransfers?: number } = {},
) =>
  latestDepartures(schedule, {
    serviceDate: day,
    originStopIds: ['A'],
    targets: [{ stopId: 'D', arrivalDeadline: deadline }],
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
    for (const [fixture, schedule] of seededNetworks()) {
      const instants = departureInstants(schedule);
      for (const deadline of [180, 220, 260, 300, 340]) {
        const deadlines = { C: deadline - 30, D: deadline };
        // brute force: latest first boarding of any on-time journey from any instant
        const expected: (number | null)[] = [null, null, null];
        for (const departureTime of instants)
          for (const [stop, result] of routeToStops(
            schedule,
            {
              serviceDate: day,
              originStopId: 'A',
              departureTime,
              maxTransfers: 2,
            },
            ['C', 'D'],
          )) {
            if (result.status !== 'ok') continue;
            for (const j of result.journeys) {
              if (j.arrivalTime > deadlines[stop as 'C' | 'D']) continue;
              for (let k = j.boardingCount - 1; k < 3; k++)
                expected[k] = Math.max(
                  expected[k] ?? -1,
                  j.legs[0]!.departureTime,
                );
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
            maxTransfers: 2,
          }).get('A'),
          `fixture ${fixture}, deadline ${deadline}`,
        ).toEqual(expected);
      }
    }
  });
});

const window = (
  schedule: RoutingSchedule,
  departureTimes: readonly number[],
  overrides: Partial<WindowRequest> = {},
  destinations = ['D'],
) =>
  routeWindow(
    schedule,
    { serviceDate: day, originStopId: 'A', departureTimes, ...overrides },
    destinations,
  );
const okJourneys = (result: RoutingResult | undefined) => {
  if (result?.status !== 'ok') throw new Error(JSON.stringify(result));
  return result.journeys;
};
const metrics = (journeys: readonly Journey[]) =>
  [
    ...new Set(
      journeys.map((j) =>
        JSON.stringify([
          j.requestedDepartureTime,
          j.arrivalTime,
          j.boardingCount,
          j.walkingDurationSeconds,
          j.scheduledTransferRisk,
        ]),
      ),
    ),
  ].sort();

describe('range RAPTOR departure window', () => {
  it('finds the same journeys as a depart-at search for one departure', () => {
    const schedule = threeRides();
    const departAt = routeToStops(
      schedule,
      { serviceDate: day, originStopId: 'A', departureTime: 100 },
      ['D'],
    ).get('D');
    expect(window(schedule, [100]).get('D')).toEqual(departAt);
  });

  it('uses each journey first boarding as its departure, not the scanned instant', () => {
    const schedule = buildSchedule(
      input([
        trip('early', ['A', 'D'], [100, 200]),
        trip('late', ['A', 'D'], [150, 260]),
      ]),
    );
    expect(
      okJourneys(window(schedule, [90, 150]).get('D')).map((j) => [
        j.requestedDepartureTime,
        j.arrivalTime,
        j.durationSeconds,
      ]),
    ).toEqual([
      [150, 260, 110],
      [100, 200, 100],
    ]);
  });

  it('keeps an arrival exactly at the deadline and drops later ones', () => {
    const arrivals = (deadline: number) =>
      okJourneys(
        window(threeRides(), [100], { arrivalDeadline: deadline }).get('D'),
      ).map((j) => j.arrivalTime);
    expect(arrivals(300)).toEqual([250, 300]);
    expect(arrivals(299)).toEqual([250]);
    expect(
      window(threeRides(), [100], { arrivalDeadline: 249 }).get('D'),
    ).toEqual({ status: 'no-journey', reason: 'unreachable' });
  });

  it('rejects empty, oversized and invalid departure sets', () => {
    const schedule = threeRides();
    expect(() => window(schedule, [])).toThrow(RangeError);
    expect(() =>
      window(
        schedule,
        Array.from({ length: 65 }, (_, i) => i),
      ),
    ).toThrow(RangeError);
    expect(() => window(schedule, [1.5])).toThrow(RangeError);
    expect(() => window(schedule, [100], { arrivalDeadline: NaN })).toThrow(
      RangeError,
    );
  });

  it('equals the Pareto profile of independent depart-at runs on 160 seeded networks', () => {
    for (const [fixture, schedule] of seededNetworks(314159)) {
      const instants = departureInstants(schedule);
      if (!instants.length) continue;
      for (const deadline of [Infinity, 260]) {
        const independent = instants.flatMap((departureTime) =>
          [
            ...routeToStops(
              schedule,
              {
                serviceDate: day,
                originStopId: 'A',
                departureTime,
                maxTransfers: 2,
              },
              ['C', 'D'],
            ).values(),
          ].flatMap((r) =>
            r.status === 'ok'
              ? r.journeys
                  .filter((j) => j.arrivalTime <= deadline)
                  .map((j) => ({
                    ...j,
                    requestedDepartureTime: j.legs[0]!.departureTime,
                  }))
              : [],
          ),
        );
        const results = window(
          schedule,
          instants,
          {
            maxTransfers: 2,
            ...(deadline === Infinity ? {} : { arrivalDeadline: deadline }),
          },
          ['C', 'D'],
        );
        for (const stop of ['C', 'D']) {
          const result = results.get(stop)!;
          expect(
            result.status === 'ok' ? metrics(result.journeys) : [],
            `fixture ${fixture}, ${stop}, deadline ${deadline}`,
          ).toEqual(
            metrics(
              profile(independent.filter((j) => j.destinationStopId === stop)),
            ),
          );
        }
      }
    }
  });
});

/** Later departure, earlier arrival, fewer rides, less walking, lower risk. */
function profile(journeys: readonly Journey[]) {
  const key = (j: Journey) => [
    -j.requestedDepartureTime,
    j.arrivalTime,
    j.boardingCount,
    j.walkingDurationSeconds,
    j.scheduledTransferRisk,
  ];
  return journeys.filter((b) =>
    journeys.every((a) => {
      const [ka, kb] = [key(a), key(b)];
      return !(
        ka.every((v, i) => v <= kb[i]!) && ka.some((v, i) => v < kb[i]!)
      );
    }),
  );
}
function* seededNetworks(seed = 271828) {
  const random = seededRandom(seed);
  for (let fixture = 0; fixture < 160; fixture++) {
    const base = randomSchedule(random);
    // larger allowances than the oracle's so missed connections are common
    yield [
      fixture,
      buildSchedule({
        ...base,
        stops: base.stops.map((s) => ({ ...s, changeSeconds: random(30) })),
      }),
    ] as const;
  }
}
function departureInstants(schedule: RoutingSchedule) {
  return [
    ...new Set(
      schedule.trips.flatMap((t) =>
        t.events
          .filter(
            (e) => e.stopId === 'A' && e.pickup === 0 && e.departure !== null,
          )
          .map((e) => e.departure!),
      ),
    ),
  ];
}

import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  composeGeographicJourneys,
  validateGeographicRequest,
  type ArriveByRequest,
  type GeographicCompositionResult,
  type GeographicPolicy,
  type WalkingCandidate,
} from './index.js';
import { day, input, trip } from './test-support.js';

const origin = { latitude: 32, longitude: -96 };
const destination = { latitude: 33, longitude: -96 };
const by = (
  arrivalTime: number,
  extra: Partial<ArriveByRequest> = {},
): ArriveByRequest => ({
  origin,
  destination,
  serviceDate: day,
  arrivalTime,
  ...extra,
});
function candidate(
  stopId: string,
  durationSeconds: number,
  phase: 'access' | 'egress',
): WalkingCandidate {
  const coordinate = { latitude: 32.5, longitude: -96 };
  return {
    publicationId: 'fixture-v1',
    stopId,
    coordinate,
    walk: {
      origin: phase === 'access' ? origin : coordinate,
      destination: phase === 'access' ? coordinate : destination,
      durationSeconds,
      distanceMeters: durationSeconds,
    },
  };
}
const plan = (
  trips: Parameters<typeof input>[0],
  request: ArriveByRequest,
  policy: Partial<GeographicPolicy> = {},
  access = [candidate('A', 300, 'access')],
  egress = [candidate('D', 120, 'egress')],
) =>
  composeGeographicJourneys(
    buildSchedule(input(trips)),
    request,
    access,
    egress,
    policy,
  );
const summary = (result: GeographicCompositionResult) => {
  if (result.status !== 'ok') throw new Error(result.reason);
  return result.journeys.map((j) => ({
    leave: j.requestedDepartureTime,
    arrive: j.arrivalTime,
    transfers: j.transferCount,
  }));
};

// three direct A-D trips; with 300 s access and 120 s egress
const directs = [
  trip('early', ['A', 'D'], [28800, 30000]),
  trip('mid', ['A', 'D'], [29400, 31200]),
  trip('late', ['A', 'D'], [30600, 32700]),
];

describe('arrive-by geographic composition', () => {
  it('leaves as late as possible instead of arriving as early as possible', () => {
    const result = plan(directs, by(32400));
    expect(summary(result)).toEqual([
      { leave: 29100, arrive: 31320, transfers: 0 },
    ]);
    if (result.status !== 'ok') return;
    expect(result.journeys[0]).toMatchObject({
      durationSeconds: 2220,
      legs: [
        {
          kind: 'walk',
          phase: 'access',
          departureTime: 29100,
          arrivalTime: 29400,
        },
        { kind: 'transit', tripId: 'mid', departureTime: 29400 },
        {
          kind: 'walk',
          phase: 'egress',
          departureTime: 31200,
          arrivalTime: 31320,
        },
      ],
    });
  });

  it('moves the deadline earlier by the arrival buffer', () => {
    expect(summary(plan(directs, by(31700)))[0]!.leave).toBe(29100);
    expect(
      summary(plan(directs, by(31700, { arrivalBufferSeconds: 480 })))[0]!
        .leave,
    ).toBe(28500);
  });

  it('counts arriving exactly at the deadline as on time', () => {
    expect(summary(plan(directs, by(31320)))[0]!.leave).toBe(29100);
    expect(summary(plan(directs, by(31319)))[0]!.leave).toBe(28500);
  });

  it('rounds the leave time down and compares fractional walks exactly', () => {
    const fractional = (arrivalTime: number) =>
      summary(
        plan(
          directs,
          by(arrivalTime),
          {},
          [candidate('A', 300.4, 'access')],
          [candidate('D', 120.5, 'egress')],
        ),
      )[0];
    expect(fractional(31321)).toEqual({
      leave: 29099,
      arrive: 31320.5,
      transfers: 0,
    });
    expect(fractional(31320)!.leave).toBe(28499);
  });

  it('returns no journey without scanning when nothing meets the deadline', () => {
    expect(plan(directs, by(30119))).toEqual({
      status: 'no-journey',
      reason: 'transit-unreachable',
      transitSearches: 0,
      windowDepartures: 0,
    });
  });

  it('keeps an earlier direct option beside a later connection', () => {
    const trips = [
      trip('direct', ['A', 'D'], [28800, 31000]),
      trip('feeder', ['A', 'B'], [30000, 30300]),
      trip('connection', ['B', 'D'], [30400, 31100]),
    ];
    const result = plan(trips, by(31300));
    expect(summary(result)).toEqual([
      { leave: 29700, arrive: 31220, transfers: 1 },
      { leave: 28500, arrive: 31120, transfers: 0 },
    ]);
    expect(result).toMatchObject({ windowDepartures: 2 });
    // a one-departure budget keeps only the latest
    const budget = plan(trips, by(31300), { maxWindowDepartures: 1 });
    expect(summary(budget)).toEqual([
      { leave: 29700, arrive: 31220, transfers: 1 },
    ]);
    expect(budget).toMatchObject({ windowDepartures: 1 });
  });

  it('uses 24:00+ service on the same service date', () => {
    expect(
      summary(plan([trip('night', ['A', 'D'], [86400, 87900])], by(88200))),
    ).toEqual([{ leave: 86100, arrive: 88020, transfers: 0 }]);
  });

  it('never reaches into the previous service day', () => {
    // effective deadline before 00:00
    expect(plan(directs, by(300, { arrivalBufferSeconds: 600 }))).toMatchObject(
      { status: 'no-journey', windowDepartures: 0 },
    );
    // leaving 100 s before 00:00 to catch a 00:03:20 departure is excluded
    const trips = [
      trip('too-early', ['A', 'D'], [200, 300]),
      trip('ok', ['A', 'D'], [400, 500]),
    ];
    expect(summary(plan(trips, by(1000)))).toEqual([
      { leave: 100, arrive: 620, transfers: 0 },
    ]);
    expect(plan([trips[0]!], by(1000))).toMatchObject({ status: 'no-journey' });
  });

  it('searches only the configured window before the deadline', () => {
    // leaving 08:10 for a 10:12 deadline is outside the default two hours
    const trips = [trip('long', ['A', 'D'], [29700, 35000])];
    expect(plan(trips, by(36720))).toMatchObject({ status: 'no-journey' });
    expect(
      summary(plan(trips, by(36720), { arriveByWindowSeconds: 10800 })),
    ).toEqual([{ leave: 29400, arrive: 35120, transfers: 0 }]);
  });

  it('does not let an access stop that is also an egress stop hide journeys', () => {
    // the loop returns to A late; the forward search never routes A to A
    const trips = [
      trip('direct', ['A', 'D'], [30000, 30600]),
      trip('loop', ['A', 'B', 'A'], [31000, 31200, 31500]),
    ];
    expect(
      summary(
        plan(
          trips,
          by(31600),
          {},
          [candidate('A', 300, 'access')],
          [candidate('D', 120, 'egress'), candidate('A', 60, 'egress')],
        ),
      ),
    ).toEqual([{ leave: 29700, arrive: 30720, transfers: 0 }]);
  });

  it('rejects mixed or incomplete time modes', () => {
    const both = { ...by(32400), departureTime: 28800 };
    expect(() => validateGeographicRequest(both)).toThrow();
    expect(() =>
      validateGeographicRequest({
        origin,
        destination,
        serviceDate: day,
        departureTime: 28800,
        arrivalBufferSeconds: 60,
      } as never),
    ).toThrow();
    expect(() => validateGeographicRequest(by(-1))).toThrow();
    expect(() =>
      validateGeographicRequest(by(100, { arrivalBufferSeconds: 1.5 })),
    ).toThrow();
  });
});

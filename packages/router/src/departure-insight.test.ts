import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  composeGeographicJourneys,
  departureInsight,
  validateGeographicRequest,
  MAX_EARLIER_SHIFT_SECONDS,
  MIN_EARLIER_SAVING_SECONDS,
  MIN_LATER_SHIFT_SECONDS,
  NEAR_SAME_ARRIVAL_SECONDS,
  type DepartAtRequest,
  type WalkingCandidate,
} from './index.js';
import { day, input, trip } from './test-support.js';

const origin = { latitude: 32, longitude: -96 };
const destination = { latitude: 33, longitude: -96 };
const at = (
  departureTime: number,
  extra: Partial<DepartAtRequest> = {},
): DepartAtRequest => ({
  origin,
  destination,
  serviceDate: day,
  departureTime,
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
// the main depart-at result first, then the hint beside it
const hint = (
  trips: Parameters<typeof input>[0],
  request: DepartAtRequest,
  now = 0,
  access = [candidate('A', 300, 'access')],
  egress = [candidate('D', 120, 'egress')],
) => {
  const schedule = buildSchedule(input(trips));
  const main = composeGeographicJourneys(schedule, request, access, egress);
  const journeys = main.status === 'ok' ? main.journeys : [];
  return departureInsight(schedule, request, access, egress, journeys, now);
};

// 300 s access, 120 s egress, 120 s boarding margin: catching `missed` means
// leaving by 28380; otherwise `next` arrives at 31920
const missed = trip('missed', ['A', 'D'], [28800, 30000]);
const next = trip('next', ['A', 'D'], [30600, 31800]);
const noRush = {
  kind: 'no-rush',
  departureTime: 30180,
  arrivalChangeSeconds: 0,
};

describe('departure-time insight', () => {
  it('starts from the agreed guardrails', () => {
    expect({
      MIN_EARLIER_SAVING_SECONDS,
      MAX_EARLIER_SHIFT_SECONDS,
      NEAR_SAME_ARRIVAL_SECONDS,
      MIN_LATER_SHIFT_SECONDS,
    }).toEqual({
      MIN_EARLIER_SAVING_SECONDS: 600,
      MAX_EARLIER_SHIFT_SECONDS: 900,
      NEAR_SAME_ARRIVAL_SECONDS: 120,
      MIN_LATER_SHIFT_SECONDS: 300,
    });
  });

  it('suggests leaving a few minutes earlier to catch a ride just missed', () => {
    // no-rush also applies here; leaving earlier wins
    expect(hint([missed, next], at(28560))).toEqual({
      kind: 'leave-earlier',
      departureTime: 28380,
      arrivalChangeSeconds: -1800,
    });
  });

  it('never suggests a time that has passed', () => {
    expect(hint([missed, next], at(28560), 28380)).toMatchObject({
      kind: 'leave-earlier',
    });
    expect(hint([missed, next], at(28560), 28381)).toEqual(noRush);
    expect(hint([missed, next], at(28560), 30181)).toBeUndefined();
  });

  it('never suggests leaving before the earliest allowed time', () => {
    expect(
      hint([missed, next], at(28560, { earliestDepartureTime: 28381 })),
    ).toEqual(noRush);
  });

  it('suggests leaving at most fifteen minutes earlier', () => {
    expect(hint([missed, next], at(28380 + 900))).toMatchObject({
      kind: 'leave-earlier',
      departureTime: 28380,
    });
    expect(hint([missed, next], at(28380 + 901))).toEqual(noRush);
  });

  it('suggests leaving earlier only when it saves at least ten minutes', () => {
    const saves = (arrival: number) =>
      hint([trip('missed', ['A', 'D'], [28800, arrival]), next], at(28560));
    expect(saves(31200)).toEqual({
      kind: 'leave-earlier',
      departureTime: 28380,
      arrivalChangeSeconds: -600,
    });
    expect(saves(31201)).toEqual(noRush);
  });

  it('respects the transfer limit of the request', () => {
    const trips = [
      trip('feeder', ['A', 'B'], [28800, 29000]),
      trip('connection', ['B', 'D'], [29100, 30000]),
      next,
    ];
    expect(hint(trips, at(28560))).toMatchObject({ kind: 'leave-earlier' });
    expect(hint(trips, at(28560, { maxTransfers: 0 }))).toEqual(noRush);
  });

  it('says there is no need to rush when leaving later arrives at the same time', () => {
    expect(hint([next], at(28800))).toEqual(noRush);
  });

  it('allows a later ride that arrives at most two minutes later', () => {
    const later = (arrival: number) =>
      hint([next, trip('later', ['A', 'D'], [30900, arrival])], at(28800));
    expect(later(31920)).toEqual({
      kind: 'no-rush',
      departureTime: 30480,
      arrivalChangeSeconds: 120,
    });
    expect(later(31921)).toEqual(noRush);
  });

  it('stays quiet when leaving later saves less than five minutes', () => {
    expect(hint([next], at(30180 - 300))).toEqual(noRush);
    expect(hint([next], at(30180 - 299))).toBeUndefined();
  });

  it('gives no insight without a journey', () => {
    expect(hint([next], at(31000))).toBeUndefined();
  });

  it('skips leaving earlier when that deadline would fall before 00:00', () => {
    expect(hint([trip('dawn', ['A', 'D'], [400, 450])], at(0))).toBeUndefined();
  });

  it('accepts fractional walks and rounds the suggestion down', () => {
    expect(
      hint(
        [missed, next],
        at(28560),
        0,
        [candidate('A', 300.4, 'access')],
        [candidate('D', 120.5, 'egress')],
      ),
    ).toEqual({
      kind: 'leave-earlier',
      departureTime: 28379,
      arrivalChangeSeconds: -1800,
    });
  });

  it('needs a finite now', () => {
    expect(() => hint([missed, next], at(28560), Number.NaN)).toThrow();
  });

  it('takes earliestDepartureTime only as a nonnegative integer with departureTime', () => {
    expect(() =>
      validateGeographicRequest(at(28560, { earliestDepartureTime: 28000 })),
    ).not.toThrow();
    expect(() =>
      validateGeographicRequest(at(28560, { earliestDepartureTime: 1.5 })),
    ).toThrow();
    expect(() =>
      validateGeographicRequest({
        origin,
        destination,
        serviceDate: day,
        arrivalTime: 32400,
        earliestDepartureTime: 28000,
      } as never),
    ).toThrow();
  });
});

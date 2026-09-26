import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  composeGeographicJourneys,
  geographicPolicy,
  validateCoordinate,
  type GeographicRequest,
  type WalkingCandidate,
  type GeographicCompositionResult,
} from './index.js';
import { day, input, trip } from './test-support.js';

const request: GeographicRequest = {
  origin: { latitude: 32, longitude: -96 },
  destination: { latitude: 33, longitude: -96 },
  serviceDate: day,
  departureTime: 0,
};
function candidate(
  stopId: string,
  durationSeconds: number,
  phase: 'access' | 'egress',
  distanceMeters = durationSeconds,
): WalkingCandidate {
  const coordinate = { latitude: 32.5, longitude: -96 };
  return {
    publicationId: 'fixture-v1',
    stopId,
    coordinate,
    walk: {
      origin: phase === 'access' ? request.origin : coordinate,
      destination: phase === 'access' ? coordinate : request.destination,
      durationSeconds,
      distanceMeters,
    },
  };
}
function journeys(result: GeographicCompositionResult) {
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error(result.reason);
  return result.journeys;
}

describe('geographic composition without providers or persistence', () => {
  it('misses 08:04 after six minutes of access and boards a later trip without an initial change allowance', () => {
    const schedule = buildSchedule(
      input(
        [
          trip('missed', ['A', 'D'], [29040, 29400]),
          trip('later', ['A', 'D'], [29220, 30000]),
        ],
        {
          stops: [
            { id: 'A', changeSeconds: 600 },
            { id: 'D', changeSeconds: 0 },
          ],
        },
      ),
    );
    const [j] = journeys(
      composeGeographicJourneys(
        schedule,
        { ...request, departureTime: 28800 },
        [candidate('A', 360, 'access', 420)],
        [candidate('D', 120, 'egress', 150)],
      ),
    );
    expect(j).toMatchObject({
      requestedDepartureTime: 28800,
      arrivalTime: 30120,
      durationSeconds: 1320,
      boardingCount: 1,
      transferCount: 0,
      walkingDurationSeconds: 480,
      walkingDistanceMeters: 570,
      legs: [
        {
          kind: 'walk',
          phase: 'access',
          departureTime: 28800,
          arrivalTime: 29160,
        },
        {
          kind: 'transit',
          tripId: 'later',
          departureTime: 29220,
          arrivalTime: 30000,
        },
        {
          kind: 'walk',
          phase: 'egress',
          departureTime: 30000,
          arrivalTime: 30120,
        },
      ],
    });
  });
  it('does not round fractional access down into a missed departure', () => {
    const schedule = buildSchedule(
      input([
        trip('too-early', ['A', 'D'], [10, 20]),
        trip('catchable', ['A', 'D'], [11, 30]),
      ]),
    );
    const [j] = journeys(
      composeGeographicJourneys(
        schedule,
        request,
        [candidate('A', 10.1, 'access')],
        [candidate('D', 0.5, 'egress')],
      ),
    );
    expect(j?.arrivalTime).toBe(30.5);
    expect(j?.legs[1]).toMatchObject({ tripId: 'catchable' });
  });
  it('a later alighting with short egress wins final arrival', () => {
    const schedule = buildSchedule(
      input([trip('through', ['A', 'C', 'D'], [100, 200, 230])]),
    );
    const result = journeys(
      composeGeographicJourneys(
        schedule,
        request,
        [candidate('A', 10, 'access')],
        [candidate('C', 300, 'egress'), candidate('D', 20, 'egress')],
      ),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ egressStopId: 'D', arrivalTime: 250 });
  });
  it('keeps access alternatives separate when earlier intermediate arrival has more walking', () => {
    const schedule = buildSchedule(
      input([
        trip('early-high-walk', ['A', 'X'], [50, 100]),
        trip('later-low-walk', ['B', 'X'], [100, 110]),
        trip('connection', ['X', 'D'], [120, 200]),
      ]),
    );
    const access = [candidate('A', 50, 'access'), candidate('B', 10, 'access')];
    const egress = [candidate('D', 10, 'egress')];
    const result = composeGeographicJourneys(schedule, request, access, egress);
    expect(journeys(result)[0]).toMatchObject({
      accessStopId: 'B',
      arrivalTime: 210,
      transferCount: 1,
      walkingDurationSeconds: 20,
    });
    expect(
      composeGeographicJourneys(
        schedule,
        request,
        [...access].reverse(),
        egress,
      ),
    ).toEqual(result);
  });
  it('prefers fewer transfers at equal final arrival even with more walking', () => {
    const schedule = buildSchedule(
      input([
        trip('direct', ['A', 'D'], [50, 200]),
        trip('feeder', ['B', 'X'], [20, 100]),
        trip('connection', ['X', 'D'], [100, 200]),
      ]),
    );
    const result = journeys(
      composeGeographicJourneys(
        schedule,
        request,
        [candidate('A', 50, 'access'), candidate('B', 10, 'access')],
        [candidate('D', 10, 'egress')],
      ),
    );
    expect(
      result.map((j) => [j.transferCount, j.walkingDurationSeconds]),
    ).toEqual([
      [0, 60],
      [1, 20],
    ]);
  });
  it('retains a later but lower-walking alternative and uses duration, not distance, to rank', () => {
    const schedule = buildSchedule(
      input([
        trip('early', ['A', 'D'], [100, 200]),
        trip('late', ['B', 'D'], [100, 250]),
      ]),
    );
    const result = journeys(
      composeGeographicJourneys(
        schedule,
        request,
        [candidate('A', 50, 'access', 20), candidate('B', 10, 'access', 100)],
        [candidate('D', 10, 'egress')],
      ),
    );
    expect(
      result.map((j) => [j.arrivalTime, j.walkingDurationSeconds]),
    ).toEqual([
      [210, 60],
      [260, 20],
    ]);
  });
  it('keeps distinct services with equivalent metrics in stable order', () => {
    const schedule = buildSchedule(
      input([
        trip('a', ['A', 'D'], [100, 200]),
        trip('b', ['B', 'D'], [100, 200]),
      ]),
    );
    const a = candidate('A', 10, 'access');
    const b = candidate('B', 10, 'access');
    const e = candidate('D', 10, 'egress');
    expect(composeGeographicJourneys(schedule, request, [a, b], [e])).toEqual(
      composeGeographicJourneys(schedule, request, [b, a], [e]),
    );
    expect(
      journeys(composeGeographicJourneys(schedule, request, [b, a], [e])),
    ).toHaveLength(2);
  });
  it('preserves explicit interchange legs and keeps their unmeasured walking separate', () => {
    const schedule = buildSchedule(
      input(
        [trip('a', ['A', 'B'], [50, 100]), trip('b', ['C', 'D'], [140, 200])],
        {
          transfers: [
            {
              id: 'passage',
              fromStopId: 'B',
              toStopId: 'C',
              durationSeconds: 30,
            },
          ],
        },
      ),
    );
    const [j] = journeys(
      composeGeographicJourneys(
        schedule,
        request,
        [candidate('A', 10, 'access')],
        [candidate('D', 10, 'egress')],
      ),
    );
    expect(j).toMatchObject({
      interchangeDurationSeconds: 30,
      walkingDurationSeconds: 20,
      boardingCount: 2,
      transferCount: 1,
    });
    expect(j?.legs.map((l) => l.kind)).toEqual([
      'walk',
      'transit',
      'transfer',
      'transit',
      'walk',
    ]);
    expect(
      composeGeographicJourneys(
        schedule,
        { ...request, maxTransfers: 0 },
        [candidate('A', 10, 'access')],
        [candidate('D', 10, 'egress')],
      ),
    ).toMatchObject({ status: 'no-journey', reason: 'transit-unreachable' });
  });
  it('keeps overnight access and transit in the same unwrapped service day', () => {
    const schedule = buildSchedule(
      input([trip('night', ['A', 'D'], [87300, 91800])]),
    );
    expect(
      journeys(
        composeGeographicJourneys(
          schedule,
          { ...request, departureTime: 86300 },
          [candidate('A', 700, 'access')],
          [candidate('D', 60, 'egress')],
        ),
      )[0],
    ).toMatchObject({ arrivalTime: 91860, durationSeconds: 5560 });
  });
  it('distinguishes empty access, empty egress, wrong date and transit disconnection', () => {
    const schedule = buildSchedule(input([]));
    const a = [candidate('A', 0, 'access')];
    const e = [candidate('D', 0, 'egress')];
    expect(composeGeographicJourneys(schedule, request, [], e)).toMatchObject({
      reason: 'no-reachable-access-stops',
    });
    expect(composeGeographicJourneys(schedule, request, a, [])).toMatchObject({
      reason: 'no-reachable-egress-stops',
    });
    expect(composeGeographicJourneys(schedule, request, a, e)).toMatchObject({
      reason: 'transit-unreachable',
    });
    expect(
      composeGeographicJourneys(
        schedule,
        { ...request, serviceDate: '2026-09-19' },
        a,
        e,
      ),
    ).toMatchObject({ reason: 'service-date-not-loaded' });
  });
  it('does not present same-stop access/egress as a transit or direct-walking journey', () => {
    expect(
      composeGeographicJourneys(
        buildSchedule(input([])),
        request,
        [candidate('A', 0, 'access')],
        [candidate('A', 0, 'egress')],
      ),
    ).toEqual({
      status: 'no-journey',
      reason: 'transit-unreachable',
      transitSearches: 0,
    });
  });
  it('rejects mixed publications, duplicate stops, endpoint mismatches and overflow', () => {
    const schedule = buildSchedule(input([]));
    const a = candidate('A', 0, 'access');
    const e = candidate('D', 0, 'egress');
    expect(() =>
      composeGeographicJourneys(
        schedule,
        request,
        [{ ...a, publicationId: 'other' }],
        [e],
      ),
    ).toThrow(/publication/);
    expect(() =>
      composeGeographicJourneys(schedule, request, [a, a], [e]),
    ).toThrow(/Duplicate/);
    expect(() =>
      composeGeographicJourneys(
        schedule,
        request,
        [{ ...a, walk: e.walk }],
        [e],
      ),
    ).toThrow(/endpoints/);
    expect(() =>
      composeGeographicJourneys(
        schedule,
        { ...request, departureTime: 2147483647 },
        [candidate('A', 1, 'access')],
        [e],
      ),
    ).toThrow(/access arrival/);
  });
});

describe('geographic validation and budgets', () => {
  it.each([
    null,
    {},
    { latitude: NaN, longitude: 0 },
    { latitude: Infinity, longitude: 0 },
    { latitude: 0, longitude: -Infinity },
    { latitude: 91, longitude: 0 },
    { latitude: -91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: 0, longitude: -181 },
    { latitude: '32', longitude: 0 },
  ])('rejects invalid coordinate %j', (value) => {
    expect(() => validateCoordinate(value)).toThrow();
  });
  it.each([
    { latitude: 90, longitude: 180 },
    { latitude: -90, longitude: -180 },
    { latitude: 0, longitude: 0 },
  ])('accepts boundary coordinate %j', (value) => {
    expect(() => validateCoordinate(value)).not.toThrow();
  });
  it.each([
    { radiusMeters: 0 },
    { radiusMeters: 5001 },
    { providerConcurrency: 9 },
    { maxAccessCandidates: 17 },
    { maxEgressCandidates: 0 },
    { maxProviderCalls: 7 },
    { maxTransitSearches: 15 },
    { maxJourneys: 1.5 },
    { providerTimeoutMs: NaN },
  ])('rejects invalid or inconsistent bounds %j', (overrides) => {
    expect(() => geographicPolicy(overrides)).toThrow();
  });
});

it('keeps distinct tied services but suppresses endpoint variants of the same trip', () => {
  const schedule = buildSchedule(
    input([
      trip('one', ['A', 'B', 'D'], [100, 100, 200]),
      trip('two', ['A', 'D'], [100, 200]),
    ]),
  );
  const decisions: string[] = [];
  const result = journeys(
    composeGeographicJourneys(
      schedule,
      request,
      [candidate('A', 0, 'access'), candidate('B', 0, 'access')],
      [candidate('D', 0, 'egress')],
      {},
      (_j, d) => decisions.push(d),
    ),
  );
  expect(result).toHaveLength(2);
  expect(decisions).toContain('same-rides');
});
it('reserves a later direct alternative under the three-result cap without changing earliest-first ordering', () => {
  const schedule = buildSchedule(
    input([
      trip('f1', ['A', 'B'], [100, 200]),
      trip('f2', ['B', 'C'], [500, 550]),
      trip('f3', ['C', 'D'], [850, 900]),
      trip('m1', ['A', 'E'], [100, 400]),
      trip('m2', ['E', 'D'], [750, 950]),
      trip('direct', ['A', 'D'], [100, 1000]),
      trip('other', ['X', 'D'], [100, 1100]),
    ]),
  );
  const result = journeys(
    composeGeographicJourneys(
      schedule,
      request,
      [candidate('A', 50, 'access'), candidate('X', 0, 'access')],
      [candidate('D', 0, 'egress')],
    ),
  );
  expect(result).toHaveLength(3);
  expect(result.map((j) => j.arrivalTime)).toEqual([900, 1000, 1100]);
  expect(result.map((j) => j.transferCount)).toEqual([2, 0, 0]);
});

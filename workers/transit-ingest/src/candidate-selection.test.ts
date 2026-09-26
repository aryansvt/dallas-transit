import { expect, it } from 'vitest';
import { diversifyCandidates, type NearbyStop } from './nearby-stops.js';
import { geographicFixture } from './geographic-fixture.js';
import { planGeographicJourney } from './geographic-planner.js';
it('does not let redundant buses starve separate useful rail stations, including beyond 1200 m', () => {
  const stop = (
    id: string,
    distance: number,
    modes: number[],
    services: string[],
  ): NearbyStop => ({
    publicationId: 'p',
    stopId: id,
    name: id,
    coordinate: { latitude: 32, longitude: -96 },
    candidateDistanceMeters: distance,
    modes,
    services,
  });
  const buses = Array.from({ length: 15 }, (_, i) =>
    stop(`bus${i}`, i + 1, [3], ['same:0']),
  );
  const rail = stop('rail', 1500, [2], ['line:0']),
    rail2 = stop('rail2', 1600, [2], ['line:0']);
  const all = [...buses, rail, rail2, stop('other', 200, [3], ['other:1'])];
  expect(
    diversifyCandidates(all, 6)
      .slice(0, 4)
      .map((s) => s.stopId),
  ).toEqual(['bus0', 'rail', 'rail2', 'other']);
  expect(diversifyCandidates([...all].reverse(), 6)).toEqual(
    diversifyCandidates(all, 6),
  );
});
it('refills a rejected first walk rather than stopping at the old candidate cap', async () => {
  const f = geographicFixture();
  const candidates = {
    async find() {
      return {
        status: 'ok' as const,
        publicationId: f.schedule.publicationId,
        access: [f.access[1]!, f.access[2]!, f.access[0]!],
        egress: [f.egress[1]!],
        originLookupMs: 0,
        destinationLookupMs: 0,
      };
    },
  };
  const result = await planGeographicJourney(
    f.schedule,
    f.request,
    { candidates, walkingProvider: f.provider },
    {
      maxAccessCandidates: 1,
      maxEgressCandidates: 1,
      maxProviderCalls: 4,
      maxTransitSearches: 1,
    },
  );
  expect(result).toMatchObject({
    status: 'ok',
    journeys: [{ accessStopId: 'B', egressStopId: 'D' }],
  });
  expect(result.metrics.providerCalls).toBe(3);
  expect(result.walkingAttempts[0]).toMatchObject({
    stopId: 'X',
    rejection: 'no-pedestrian-route',
  });
  const noRefill = await planGeographicJourney(
    f.schedule,
    f.request,
    { candidates, walkingProvider: f.provider },
    {
      maxAccessCandidates: 1,
      maxEgressCandidates: 1,
      maxProviderCalls: 2,
      maxTransitSearches: 1,
    },
  );
  expect(noRefill).toMatchObject({
    status: 'no-journey',
    reason: 'no-reachable-access-stops',
    metrics: { providerCalls: 2 },
  });
});

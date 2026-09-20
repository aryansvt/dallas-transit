import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSchedule } from '@dallas-transit/router';
import { geographicFixture } from './geographic-fixture.js';
import { planGeographicJourney } from './geographic-planner.js';
import {
  fixtureWalkingProvider,
  type WalkingProvider,
} from './walking-provider.js';
import type { CandidateSource } from './nearby-stops.js';

afterEach(() => vi.useRealTimers());
describe('bounded geographic orchestration', () => {
  it('chooses farther stops with faster provider routes and discards unreachable nearby stops', async () => {
    const f = geographicFixture();
    const result = await planGeographicJourney(f.schedule, f.request, {
      candidates: f.candidates,
      walkingProvider: f.provider,
    });
    expect(result).toMatchObject({
      status: 'ok',
      incomplete: false,
      journeys: [
        {
          accessStopId: 'B',
          egressStopId: 'D',
          arrivalTime: 30000,
          walkingDurationSeconds: 240,
          walkingDistanceMeters: 300,
        },
      ],
      metrics: {
        accessCandidates: 3,
        egressCandidates: 2,
        providerCalls: 5,
        transitSearches: 4,
      },
    });
    expect(
      result.walkingAttempts.find((a) => a.stopId === 'X')?.result,
    ).toEqual({ status: 'no-route' });
    expect(result.metrics.providerCallMs).toHaveLength(5);
    expect(result.metrics.totalMs).toBeGreaterThanOrEqual(
      result.metrics.compositionMs,
    );
  });
  it.each(['access', 'egress'] as const)(
    'distinguishes no nearby %s stops',
    async (phase) => {
      const f = geographicFixture();
      const request = {
        ...f.request,
        [phase === 'access' ? 'origin' : 'destination']: {
          latitude: 0,
          longitude: 0,
        },
      };
      const result = await planGeographicJourney(f.schedule, request, {
        candidates: f.candidates,
        walkingProvider: f.provider,
      });
      expect(result).toMatchObject({
        status: 'no-journey',
        reason: `no-nearby-${phase}-stops`,
        metrics: { providerCalls: 0, transitSearches: 0 },
      });
    },
  );
  it.each(['access', 'egress'] as const)(
    'distinguishes no reachable %s stops',
    async (phase) => {
      const f = geographicFixture();
      const provider = fixtureWalkingProvider(
        f.routes.filter((r) =>
          phase === 'access'
            ? r.origin !== f.request.origin
            : r.destination !== f.request.destination,
        ),
      );
      expect(
        await planGeographicJourney(f.schedule, f.request, {
          candidates: f.candidates,
          walkingProvider: provider,
        }),
      ).toMatchObject({
        status: 'no-journey',
        reason: `no-reachable-${phase}-stops`,
      });
    },
  );
  it('reports unconfigured provider and unavailable publications without external calls', async () => {
    const f = geographicFixture();
    expect(
      await planGeographicJourney(f.schedule, f.request, {
        candidates: f.candidates,
      }),
    ).toMatchObject({
      status: 'no-journey',
      reason: 'walking-provider-unavailable',
      metrics: { providerCalls: 0 },
    });
    for (const reason of ['no-publication', 'publication-changed'] as const) {
      const candidates: CandidateSource = {
        async find() {
          return { status: 'unavailable', reason };
        },
      };
      expect(
        await planGeographicJourney(f.schedule, f.request, {
          candidates,
          walkingProvider: f.provider,
        }),
      ).toMatchObject({ status: 'no-journey', reason });
    }
  });
  it('does not claim unreachable when failed providers leave reachability unknown', async () => {
    const f = geographicFixture();
    const provider: WalkingProvider = {
      id: 'failed',
      async route(request, signal) {
        if (request.origin.latitude === f.request.origin.latitude)
          throw new Error('outage');
        return f.provider.route(request, signal);
      },
    };
    expect(
      await planGeographicJourney(f.schedule, f.request, {
        candidates: f.candidates,
        walkingProvider: provider,
      }),
    ).toMatchObject({
      status: 'no-journey',
      reason: 'walking-provider-unavailable',
      incomplete: true,
    });
  });
  it('marks surviving journeys incomplete if another candidate failed', async () => {
    const f = geographicFixture();
    const provider: WalkingProvider = {
      id: 'partial',
      async route(request, signal) {
        if (request.destination.latitude === f.access[0]!.coordinate.latitude)
          return { status: 'ok', route: { durationSeconds: -1 } };
        return f.provider.route(request, signal);
      },
    };
    expect(
      await planGeographicJourney(f.schedule, f.request, {
        candidates: f.candidates,
        walkingProvider: provider,
      }),
    ).toMatchObject({ status: 'ok', incomplete: true });
  });
  it('returns transit-unreachable only after valid pedestrian candidates have no transit connection', async () => {
    const f = geographicFixture();
    const schedule = buildSchedule({ ...f.schedule, trips: [] });
    expect(
      await planGeographicJourney(schedule, f.request, {
        candidates: f.candidates,
        walkingProvider: f.provider,
      }),
    ).toMatchObject({
      status: 'no-journey',
      reason: 'transit-unreachable',
      metrics: { transitSearches: 4 },
    });
  });
  it('bounds active provider work without relying on wall-clock races', async () => {
    const f = geographicFixture();
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const provider: WalkingProvider = {
      id: 'controlled',
      async route(request, signal) {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        const result = await f.provider.route(request, signal);
        active--;
        return result;
      },
    };
    const pending = planGeographicJourney(
      f.schedule,
      f.request,
      { candidates: f.candidates, walkingProvider: provider },
      { providerConcurrency: 2 },
    );
    // Microtask drains only; completions are explicitly released, never timed.
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(active).toBe(2);
    for (let i = 0; i < 5; i++) {
      expect(releases[i]).toBeDefined();
      releases[i]!();
      for (let turn = 0; turn < 30; turn++) await Promise.resolve();
    }
    expect((await pending).status).toBe('ok');
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });
  it('stops scheduling after timeout even if a provider ignores cancellation', async () => {
    vi.useFakeTimers();
    const f = geographicFixture();
    let calls = 0;
    const provider: WalkingProvider = {
      id: 'stuck',
      route() {
        calls++;
        return new Promise(() => {});
      },
    };
    const pending = planGeographicJourney(
      f.schedule,
      f.request,
      { candidates: f.candidates, walkingProvider: provider },
      { providerConcurrency: 2, providerTimeoutMs: 50 },
    );
    await vi.advanceTimersByTimeAsync(51);
    expect(await pending).toMatchObject({
      status: 'no-journey',
      reason: 'walking-provider-unavailable',
      metrics: { providerCalls: 2 },
    });
    expect(calls).toBe(2);
  });
  it('rejects invalid candidate providers and budgets before pedestrian work', async () => {
    const f = geographicFixture();
    const candidates: CandidateSource = {
      async find() {
        return {
          status: 'ok',
          publicationId: f.schedule.publicationId,
          access: [{ ...f.access[0]!, publicationId: 'other' }],
          egress: f.egress,
          originLookupMs: 0,
          destinationLookupMs: 0,
        };
      },
    };
    await expect(
      planGeographicJourney(f.schedule, f.request, {
        candidates,
        walkingProvider: f.provider,
      }),
    ).rejects.toThrow(/candidate/);
    await expect(
      planGeographicJourney(
        f.schedule,
        f.request,
        { candidates: f.candidates, walkingProvider: f.provider },
        { maxTransitSearches: 1 },
      ),
    ).rejects.toThrow(/product/);
  });
});

// Cancellation is an operational outcome, never evidence of no route.
describe('geographic request cancellation', () => {
  it('does no work when already canceled', async () => {
    const f = geographicFixture();
    const controller = new AbortController();
    controller.abort(new Error('canceled'));
    const find = vi.spyOn(f.candidates, 'find');
    const walk = vi.spyOn(f.provider, 'route');
    await expect(
      planGeographicJourney(f.schedule, f.request, {
        candidates: f.candidates,
        walkingProvider: f.provider,
        signal: controller.signal,
      }),
    ).rejects.toThrow('canceled');
    expect(find).not.toHaveBeenCalled();
    expect(walk).not.toHaveBeenCalled();
  });
  it('forwards the signal to candidates and stops before provider calls after candidate cancellation', async () => {
    const f = geographicFixture();
    const controller = new AbortController();
    const find: CandidateSource = {
      async find(_query, _policy, _expected, signal) {
        expect(signal).toBe(controller.signal);
        controller.abort(new Error('canceled'));
        return { status: 'unavailable', reason: 'no-publication' };
      },
    };
    const walk = vi.spyOn(f.provider, 'route');
    await expect(
      planGeographicJourney(f.schedule, f.request, {
        candidates: find,
        walkingProvider: f.provider,
        signal: controller.signal,
      }),
    ).rejects.toThrow('canceled');
    expect(walk).not.toHaveBeenCalled();
  });
  it('aborts the running provider and starts no queued calls', async () => {
    const f = geographicFixture();
    const controller = new AbortController();
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    let callSignal: AbortSignal | undefined;
    const provider: WalkingProvider = {
      id: 'controlled',
      route: vi.fn(async (_input, signal) => {
        callSignal = signal;
        enter();
        return new Promise(() => {});
      }),
    };
    const result = planGeographicJourney(
      f.schedule,
      f.request,
      {
        candidates: f.candidates,
        walkingProvider: provider,
        signal: controller.signal,
      },
      { providerConcurrency: 1 },
    );
    const rejected = expect(result).rejects.toThrow('canceled');
    await entered;
    controller.abort(new Error('canceled'));
    await rejected;
    expect(provider.route).toHaveBeenCalledTimes(1);
    expect(callSignal?.aborted).toBe(true);
  });
});

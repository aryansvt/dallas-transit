import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureWalkingProvider,
  requestWalkingRoute,
  validateWalkingResult,
  type WalkingProvider,
} from './walking-provider.js';
const request = {
  origin: { latitude: 32, longitude: -96 },
  destination: { latitude: 33, longitude: -97 },
};
const route = { ...request, durationSeconds: 30, distanceMeters: 40 };
afterEach(() => vi.useRealTimers());

describe('validated pedestrian-provider boundary', () => {
  it('preserves provider metrics, copies endpoints and is deterministic', async () => {
    const provider = fixtureWalkingProvider([route]);
    const first = await requestWalkingRoute(provider, request, 100);
    expect(first).toEqual({ status: 'ok', route });
    expect(await requestWalkingRoute(provider, request, 100)).toEqual(first);
    expect(first.status === 'ok' && first.route.origin).not.toBe(route.origin);
  });
  it('represents an unavailable route without fabricating a path', async () => {
    expect(
      await requestWalkingRoute(fixtureWalkingProvider([]), request, 100),
    ).toEqual({ status: 'no-route' });
  });
  it('accepts zero-distance and zero-duration routes', () => {
    expect(
      validateWalkingResult(
        {
          status: 'ok',
          route: { ...route, durationSeconds: 0, distanceMeters: 0 },
        },
        request,
      ).status,
    ).toBe('ok');
  });
  it.each([
    null,
    [],
    {},
    { status: 'success', route },
    { status: 'ok' },
    { status: 'unavailable', reason: 'secret-error' },
    { status: 'ok', route: { ...route, durationSeconds: -1 } },
    { status: 'ok', route: { ...route, distanceMeters: -1 } },
    { status: 'ok', route: { ...route, durationSeconds: NaN } },
    { status: 'ok', route: { ...route, distanceMeters: Infinity } },
    { status: 'ok', route: { ...route, durationSeconds: '30' } },
    {
      status: 'ok',
      route: { ...route, origin: { latitude: 91, longitude: 0 } },
    },
    { status: 'ok', route: { ...route, origin: request.destination } },
  ])('rejects malformed or mismatched response %j', (value) => {
    expect(validateWalkingResult(value, request)).toEqual({
      status: 'unavailable',
      reason: 'invalid-response',
    });
  });
  it('represents thrown/rejected provider errors without leaking messages', async () => {
    const provider: WalkingProvider = {
      id: 'broken',
      route() {
        throw new Error('private-url');
      },
    };
    expect(await requestWalkingRoute(provider, request, 100)).toEqual({
      status: 'unavailable',
      reason: 'provider-error',
    });
  });
  it('times out and aborts using a deterministic clock', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const provider: WalkingProvider = {
      id: 'stalled',
      route(_request, abort) {
        signal = abort;
        return new Promise(() => {});
      },
    };
    const pending = requestWalkingRoute(provider, request, 50);
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toEqual({ status: 'unavailable', reason: 'timeout' });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects malformed request/configuration before calling a provider', async () => {
    const provider = fixtureWalkingProvider([]);
    await expect(
      requestWalkingRoute(
        provider,
        { ...request, origin: { latitude: NaN, longitude: 0 } },
        100,
      ),
    ).rejects.toThrow();
    await expect(requestWalkingRoute(provider, request, 0)).rejects.toThrow();
    expect(() => fixtureWalkingProvider([route, route])).toThrow(/Duplicate/);
  });
});

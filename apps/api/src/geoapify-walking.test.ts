import { afterEach, expect, it, vi } from 'vitest';
import {
  geoapifyWalkingProvider,
  parseGeoapifyWalking,
} from './geoapify-walking.js';
const request = {
  origin: { latitude: 32.8, longitude: -96.8 },
  destination: { latitude: 32.801, longitude: -96.8 },
};
const response = () => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        mode: 'walk',
        units: 'metric',
        distance_units: 'meters',
        distance: 112,
        time: 90,
        legs: [{ distance: 112, time: 90 }],
      },
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [-96.8, 32.8],
            [-96.8, 32.801],
          ],
        ],
      },
    },
  ],
});
const signal = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());
it('requires no provider for identical endpoints', async () => {
  const fetcher = vi.fn();
  const result = await geoapifyWalkingProvider('key', fetcher).route(
    { origin: request.origin, destination: request.origin },
    signal(),
  );
  expect(result).toMatchObject({
    status: 'ok',
    route: { distanceMeters: 0, durationSeconds: 0 },
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it('adds no scheduling delay to an 80ms controlled provider response', async () => {
  vi.useFakeTimers();
  const provider = geoapifyWalkingProvider(
    'key',
    () =>
      new Promise((resolve) =>
        setTimeout(() => resolve(Response.json(response())), 80),
      ),
  );
  const start = Date.now();
  const pending = provider.route(request, signal());
  await vi.advanceTimersByTimeAsync(80);
  expect(await pending).toMatchObject({ status: 'ok' });
  expect(Date.now() - start).toBe(80);
});
it('requests exactly two waypoints in explicit walk mode and normalizes route metrics', async () => {
  const fetcher = vi.fn(async () => Response.json(response()));
  const provider = geoapifyWalkingProvider('private-key', fetcher);
  expect(await provider.route(request, signal())).toEqual({
    status: 'ok',
    route: { ...request, distanceMeters: 112, durationSeconds: 90 },
  });
  const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.protocol).toBe('https:');
  expect(url.searchParams.get('mode')).toBe('walk');
  expect(url.searchParams.get('waypoints')!.split('|')).toHaveLength(2);
  expect(init.redirect).toBe('error');
});
it.each([
  'shape',
  'point',
  'endpoint',
  'distance',
  'duration',
  'speed',
  'units',
  'leg',
] as const)('rejects malformed or impossible %s', (kind) => {
  const value = response();
  const f = value.features[0]!;
  if (kind === 'shape') f.geometry.type = 'LineString';
  if (kind === 'point') f.geometry.coordinates[0]![0] = [200, 100];
  if (kind === 'endpoint') f.geometry.coordinates[0]![0] = [-95, 33];
  if (kind === 'distance') f.properties.distance = -1;
  if (kind === 'duration') f.properties.time = Infinity;
  if (kind === 'speed') {
    f.properties.time = 1;
    f.properties.legs[0]!.time = 1;
  }
  if (kind === 'units') f.properties.distance_units = 'miles';
  if (kind === 'leg') f.properties.legs = [];
  expect(parseGeoapifyWalking(value, request)).toEqual({
    status: 'unavailable',
    reason: 'invalid-response',
  });
});
it.each([401, 429, 500])('sanitizes provider HTTP %i', async (status) => {
  const provider = geoapifyWalkingProvider(
    'private-key',
    async () => new Response('secret', { status }),
  );
  expect(await provider.route(request, signal())).toEqual({
    status: 'unavailable',
    reason: 'provider-error',
  });
});
it('rejects declared and streamed oversized bodies', async () => {
  for (const res of [
    new Response('{}', { headers: { 'content-length': '1048577' } }),
    new Response('x'.repeat(1048577)),
  ]) {
    expect(
      await geoapifyWalkingProvider('key', async () => res).route(
        request,
        signal(),
      ),
    ).toEqual({ status: 'unavailable', reason: 'invalid-response' });
  }
});
it('bounds latency at 3 seconds even if fetch ignores abort and distinguishes caller cancellation', async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  const provider = geoapifyWalkingProvider('key', (_url, init) => {
    signals.push(init!.signal!);
    return new Promise(() => {});
  });
  const pending = provider.route(request, signal());
  await vi.advanceTimersByTimeAsync(3000);
  expect(await pending).toEqual({ status: 'unavailable', reason: 'timeout' });
  expect(signals[0]!.aborted).toBe(true);
  const controller = new AbortController();
  const canceled = provider.route(request, controller.signal);
  const checked = expect(canceled).rejects.toThrow('canceled');
  controller.abort(new Error('canceled'));
  await checked;
  expect(signals[1]!.aborted).toBe(true);
});

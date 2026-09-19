import { describe, expect, it, vi } from 'vitest';
import {
  parseValhallaWalking,
  valhallaWalkingProvider,
} from './valhalla-walking.js';
import { requestWalkingRoute } from './walking-provider.js';
const request = {
  origin: { latitude: 32.7812, longitude: -96.8056 },
  destination: { latitude: 32.780915, longitude: -96.805443 },
};
function response() {
  return {
    trip: {
      status: 0,
      units: 'kilometers',
      locations: [
        { lat: 32.7812, lon: -96.8056 },
        { lat: 32.780915, lon: -96.805443 },
      ],
      summary: { time: 40, length: 0.045 },
      legs: [{ summary: { time: 40, length: 0.045 } }],
    },
  };
}
describe('Valhalla adapter without external network', () => {
  it('requests pedestrian routing, propagates cancellation, and converts kilometers to meters', async () => {
    const mock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(response()));
    const result = await requestWalkingRoute(
      valhallaWalkingProvider('http://localhost:8002/route', mock),
      request,
      100,
    );
    expect(result).toEqual({
      status: 'ok',
      route: { ...request, durationSeconds: 40, distanceMeters: 45 },
    });
    const options = mock.mock.calls[0]![1]!;
    expect(JSON.parse(options.body as string)).toMatchObject({
      costing: 'pedestrian',
      units: 'kilometers',
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.redirect).toBe('error');
  });
  it.each([170, 171, 441, 442])(
    'represents documented unavailable path code %s',
    async (error_code) => {
      const mock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ error_code }, { status: 400 }));
      expect(
        await requestWalkingRoute(
          valhallaWalkingProvider('http://localhost:8002/route', mock),
          request,
          100,
        ),
      ).toEqual({ status: 'no-route' });
    },
  );
  it.each([401, 404, 429, 500])(
    'does not call HTTP %s a proven no-route',
    async (status) => {
      const mock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ error_code: 442 }, { status }));
      expect(
        await requestWalkingRoute(
          valhallaWalkingProvider('http://localhost:8002/route', mock),
          request,
          100,
        ),
      ).toEqual({ status: 'unavailable', reason: 'provider-error' });
    },
  );
  it('rejects invalid JSON and excessive bodies', async () => {
    for (const body of ['not JSON', 'x'.repeat(1024 * 1024 + 1)]) {
      const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
      expect(
        await requestWalkingRoute(
          valhallaWalkingProvider('http://localhost:8002/route', mock),
          request,
          100,
        ),
      ).toEqual({ status: 'unavailable', reason: 'invalid-response' });
    }
  });
  it('rejects malformed summaries, mismatched endpoints and unsupported ferries', () => {
    const valid = response();
    for (const value of [
      null,
      {},
      { trip: { ...valid.trip, units: 'miles' } },
      { trip: { ...valid.trip, legs: [] } },
      { trip: { ...valid.trip, summary: { time: -1, length: 1 } } },
      {
        trip: {
          ...valid.trip,
          summary: { time: 40, length: 0.045, has_ferry: true },
        },
      },
      {
        trip: {
          ...valid.trip,
          locations: [{ lat: 91, lon: 0 }, valid.trip.locations[1]],
        },
      },
    ])
      expect(parseValhallaWalking(value, request)).toEqual({
        status: 'unavailable',
        reason: 'invalid-response',
      });
  });
  it('accepts provider-reported zero values and documented coordinate precision', () => {
    const value = response();
    value.trip.summary = { time: 0, length: 0 };
    value.trip.legs = [{ summary: { time: 0, length: 0 } }];
    expect(
      parseValhallaWalking(value, {
        ...request,
        origin: { latitude: 32.78120001, longitude: -96.8056 },
      }),
    ).toMatchObject({
      status: 'ok',
      route: { durationSeconds: 0, distanceMeters: 0 },
    });
  });
  it.each([
    'bad-url',
    'file:///route',
    'https://secret@example.org/route',
    'https://example.org/route?key=secret',
    'https://example.org/other',
  ])('rejects unsafe or malformed configuration', (endpoint) => {
    expect(() => valhallaWalkingProvider(endpoint)).toThrow();
  });
  it('represents network failure without leaking endpoint details', async () => {
    const mock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('endpoint detail'));
    expect(
      await requestWalkingRoute(
        valhallaWalkingProvider('http://localhost:8002/route', mock),
        request,
        100,
      ),
    ).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });
});

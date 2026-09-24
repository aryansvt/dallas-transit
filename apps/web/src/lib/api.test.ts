import { afterEach, expect, it, vi } from 'vitest';
import { ClientError, errorMessage, liveClient, parseJourneys } from './api';
import { previewResponse } from '../preview/fixtures';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('accepts M5 fixtures and additive fields but rejects broken references', () => {
  const data = previewResponse();
  expect(parseJourneys({ ...data, future: true }).status).toBe('ok');
  expect(() =>
    parseJourneys({ ...data, references: { ...data.references, routes: [] } }),
  ).toThrow('INVALID_RESPONSE');
  expect(() =>
    parseJourneys({ ...data, journeys: [...data.journeys, data.journeys[0]] }),
  ).toThrow('INVALID_RESPONSE');
  expect(() =>
    parseJourneys({
      ...data,
      journeys: [{ ...data.journeys[0], serviceDate: '2026-09-19' }],
    }),
  ).toThrow('INVALID_RESPONSE');
});
it.each([
  'INVALID_REQUEST',
  'WALKING_NOT_CONFIGURED',
  'WALKING_UNAVAILABLE',
  'WALKING_TIMEOUT',
  'REQUEST_TIMEOUT',
  'SERVER_BUSY',
  'DATABASE_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'NO_PUBLICATION',
  'PUBLICATION_CHANGED',
  'REQUEST_CANCELED',
  'INTERNAL_ERROR',
])('maps %s to rider copy', (code) => {
  const text = errorMessage(new ClientError(code));
  expect(text.length).toBeGreaterThan(20);
  expect(text).not.toContain(code);
});
it('posts coordinates in JSON, never URL parameters; signals are consumed', async () => {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify(previewResponse())),
  );
  vi.stubGlobal('fetch', fetcher);
  const request = {
    origin: { latitude: 32, longitude: -96 },
    destination: { latitude: 33, longitude: -96 },
    serviceDate: '2026-09-18',
    departureTime: 28800,
  };
  await liveClient.journeys(request, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/journeys',
    expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify(request),
      signal: expect.any(AbortSignal),
    }),
  );
});
it('separates operational errors from valid empty results', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(JSON.stringify({ error: { code: 'SERVER_BUSY' } }), {
        status: 503,
      }),
  );
  await expect(
    liveClient.places('museum', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
  const response = previewResponse();
  expect(
    parseJourneys({
      ...response,
      status: 'no-journey',
      journeys: [],
      reason: 'transit-unreachable',
    }).status,
  ).toBe('no-journey');
});
it('validates place capability state and malicious payloads', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          status: 'unavailable',
          reason: 'not-configured',
          places: [],
        }),
      ),
  );
  expect(
    (await liveClient.places('museum', new AbortController().signal)).status,
  ).toBe('unavailable');
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({ status: 'ok', places: [{ name: 'broken' }] }),
      ),
  );
  await expect(
    liveClient.places('museum', new AbortController().signal),
  ).rejects.toThrow('INVALID_RESPONSE');
});
it('propagates cancellation through fetch and reports intentional cancellation', async () => {
  vi.stubGlobal(
    'fetch',
    (_url: string, options: RequestInit) =>
      new Promise((_resolve, reject) =>
        options.signal!.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      ),
  );
  const control = new AbortController();
  const request = liveClient.places('museum', control.signal);
  control.abort();
  await expect(request).rejects.toMatchObject({ code: 'REQUEST_CANCELED' });
});

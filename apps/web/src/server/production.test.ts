import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { proxyConfig } from './config';
import { transitProxy } from './transit-proxy';
import { securityHeaders } from './security';
import manifest from '../app/manifest';
import { ClientError, errorMessage, liveClient } from '../lib/api';

const env = {
  NODE_ENV: 'production',
  TRANSIT_API_ORIGIN: 'https://api.example.invalid',
  TRANSIT_PROXY_KEY: 'test-proxy-key-'.repeat(4),
};
const req = (suffix = 'places/search?q=station') =>
  new Request(`https://web.example/api/v1/${suffix}`, {
    headers: {
      cookie: 'private',
      authorization: 'private',
      'x-linefinder-key': 'attacker',
      'x-forwarded-for': '1.2.3.4',
    },
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('requires production server configuration, rejects credentials/paths/insecure origins', () => {
  expect(proxyConfig({}).origin).toBe('http://127.0.0.1:3001');
  for (const origin of [
    undefined,
    'http://api.example',
    'https://u:p@api.example',
    'https://api.example/path',
    'https://api.example/?url=evil',
    'https://api.example/#frag',
  ])
    expect(() => proxyConfig({ ...env, TRANSIT_API_ORIGIN: origin })).toThrow(
      'server-only',
    );
  expect(() => proxyConfig({ ...env, TRANSIT_PROXY_KEY: undefined })).toThrow();
  expect(proxyConfig(env).origin).toBe(env.TRANSIT_API_ORIGIN);
});
it('forwards only allowlisted paths and server authentication with no caches or redirects', async () => {
  const fetcher = vi.fn(async () =>
    Response.json(
      { places: [] },
      {
        headers: {
          'set-cookie': 'upstream',
          'cache-control': 'public,max-age=9999',
        },
      },
    ),
  );
  const result = await transitProxy(req(), ['places', 'search'], env, fetcher);
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(result.headers.get('set-cookie')).toBeNull();
  const [target, options] = fetcher.mock.calls[0]! as unknown as [
    URL,
    RequestInit,
  ];
  expect(target.href).toBe(
    'https://api.example.invalid/v1/places/search?q=station',
  );
  expect(options).toMatchObject({
    cache: 'no-store',
    redirect: 'error',
    headers: { 'x-linefinder-key': env.TRANSIT_PROXY_KEY },
  });
  expect(JSON.stringify(options.headers)).not.toMatch(
    /attacker|private|1\.2\.3\.4/,
  );
});
it('does not accept targets, unknown/duplicate queries, traversal, cross-site or oversized requests', async () => {
  const fetcher = vi.fn();
  for (const query of [
    'url=https://evil.example',
    'q=a&q=b',
    `q=${'x'.repeat(257)}`,
  ])
    expect(
      (
        await transitProxy(
          req(`places/search?${query}`),
          ['places', 'search'],
          env,
          fetcher,
        )
      ).status,
    ).toBe(400);
  for (const path of [
    ['..', 'health'],
    ['https:', 'evil.example'],
    ['routes', '../health'],
    ['health'],
  ])
    expect((await transitProxy(req(), path, env, fetcher)).status).toBe(404);
  expect(
    (
      await transitProxy(
        new Request(req(), { headers: { 'sec-fetch-site': 'cross-site' } }),
        ['places', 'search'],
        env,
        fetcher,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await transitProxy(
        new Request('https://web.example/api/v1/journeys', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'x'.repeat(4097),
        }),
        ['journeys'],
        env,
        fetcher,
      )
    ).status,
  ).toBe(413);
  expect(fetcher).not.toHaveBeenCalled();
});
it('maps suspension HTML, network failure and internal provider errors to safe unavailable responses', async () => {
  for (const fetcher of [
    async () => new Response('<h1>Suspended</h1>', { status: 503 }),
    async () => {
      throw new Error('provider-secret');
    },
    async () =>
      Response.json(
        { error: { code: 'PRIVATE_ERROR', message: 'provider-secret' } },
        { status: 500 },
      ),
  ]) {
    const result = await transitProxy(
      req(),
      ['places', 'search'],
      env,
      fetcher,
    );
    expect(await result.json()).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  }
  const partial = await transitProxy(
    req(),
    ['places', 'search'],
    env,
    async () =>
      Response.json(
        { error: { code: 'DATABASE_UNAVAILABLE', message: 'private' } },
        { status: 503 },
      ),
  );
  expect(await partial.json()).toEqual({
    error: { code: 'DATABASE_UNAVAILABLE' },
  });
});
it('bounds response bytes and cancels slow response bodies at the deadline', async () => {
  const huge = await transitProxy(req(), ['places', 'search'], env, async () =>
    Response.json({ data: 'x'.repeat(2 * 1024 * 1024) }),
  );
  expect(huge.status).toBe(503);
  vi.useFakeTimers();
  const canceled = vi.fn();
  const pending = transitProxy(
    req(),
    ['places', 'search'],
    env,
    async () =>
      new Response(new ReadableStream({ cancel: canceled }), {
        headers: { 'content-type': 'application/json' },
      }),
  );
  await vi.advanceTimersByTimeAsync(32000);
  expect((await pending).status).toBe(504);
  expect(canceled).toHaveBeenCalledOnce();
});
it('preserves useful rate-limit and no-publication states without private error bodies', async () => {
  const busy = await transitProxy(req(), ['places', 'search'], env, async () =>
    Response.json(
      { error: { code: 'SERVER_BUSY', message: 'private' } },
      { status: 429 },
    ),
  );
  expect(busy.headers.get('retry-after')).toBe('2');
  expect(await busy.json()).toEqual({ error: { code: 'SERVER_BUSY' } });
  const empty = await transitProxy(req(), ['places', 'search'], env, async () =>
    Response.json({ error: { code: 'NO_PUBLICATION' } }, { status: 503 }),
  );
  expect(await empty.json()).toEqual({ error: { code: 'NO_PUBLICATION' } });
});
it('propagates browser cancellation without retrying upstream', async () => {
  const abort = new AbortController();
  const fetcher = vi.fn(
    async (_target: unknown, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        options?.signal?.addEventListener(
          'abort',
          () => reject(new Error('canceled')),
          { once: true },
        ),
      ),
  );
  const pending = transitProxy(
    new Request(req(), { signal: abort.signal }),
    ['places', 'search'],
    env,
    fetcher,
  );
  abort.abort();
  expect((await pending).status).toBe(503);
  expect(fetcher).toHaveBeenCalledOnce();
});
it('uses useful unavailable copy even for hosting HTML and transport failures', async () => {
  for (const fetcher of [
    async () => new Response('Suspended', { status: 503 }),
    async () => {
      throw new TypeError('Network error');
    },
  ]) {
    vi.stubGlobal('fetch', fetcher);
    await expect(
      liveClient.places('station', new AbortController().signal),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  }
  expect(errorMessage(new ClientError('SERVICE_UNAVAILABLE'))).toContain(
    'temporarily unavailable',
  );
});
it('sets compatible restrictive headers without production eval or inline scripts', () => {
  const headers = securityHeaders('test-nonce', true);
  expect(headers['Content-Security-Policy']).toContain("'nonce-test-nonce'");
  expect(headers['Content-Security-Policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers['Content-Security-Policy']).toContain(
    'https://api.mapbox.com',
  );
  expect(headers['Content-Security-Policy']).not.toMatch(
    /unsafe-eval|script-src[^;]*unsafe-inline|geoapify/,
  );
  expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['Permissions-Policy']).toContain('geolocation=(self)');
});
it('provides matching install icons, stable scope and standalone theme', async () => {
  const data = manifest();
  expect(data).toMatchObject({
    name: 'LineFinder',
    short_name: 'LineFinder',
    id: '/',
    scope: '/',
    start_url: '/',
    display: 'standalone',
    theme_color: '#f6f5f0',
  });
  for (const icon of data.icons!) {
    const file = await readFile(
      new URL(`../../public${icon.src}`, import.meta.url),
    );
    expect(file.subarray(1, 4).toString()).toBe('PNG');
    expect(`${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`).toBe(
      icon.sizes,
    );
  }
});

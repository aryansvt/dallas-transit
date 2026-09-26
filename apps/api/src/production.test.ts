import { expect, it } from 'vitest';
import { readServerConfig } from './config.js';
import { authorized, requestBudget } from './admission.js';
import { buildApp } from './app.js';
import { apiFixture } from './fixture.js';

const key = 'deterministic-test-key-'.repeat(3);
const env = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@dpg-example-a/db',
  GEOAPIFY_API_KEY: 'fixture-key',
  TRANSIT_PROXY_KEY: key,
};
it('binds production on all interfaces with the Render port, preserving local defaults', () => {
  expect(readServerConfig({ ...env, PORT: '10000' })).toMatchObject({
    host: '0.0.0.0',
    port: 10000,
  });
  expect(readServerConfig({})).toMatchObject({ host: '127.0.0.1', port: 3001 });
  expect(() => readServerConfig({ ...env, HOST: '127.0.0.1' })).toThrow(
    '0.0.0.0',
  );
  for (const name of ['DATABASE_URL', 'GEOAPIFY_API_KEY', 'TRANSIT_PROXY_KEY'])
    expect(() => readServerConfig({ ...env, [name]: undefined })).toThrow(name);
});
it('has a deterministic bounded refill with no caller identity', () => {
  let now = 0;
  const take = requestBudget(() => now);
  for (let n = 0; n < 30; n++) expect(take(4)).toBe(true);
  expect(take(1)).toBe(false);
  now = 1999;
  expect(take(4)).toBe(false);
  now = 2000;
  expect(take(4)).toBe(true);
  now = 1_000_000;
  expect(take(120)).toBe(true);
  expect(take(1)).toBe(false);
  expect(authorized(key, key)).toBe(true);
  expect(authorized(`${key}x`, key)).toBe(false);
  expect(authorized(['bad'], key)).toBe(false);
});
it('protects API routes, leaves health probes accessible, sets headers and limits admission', async () => {
  const fixture = apiFixture();
  const app = buildApp(
    {},
    {
      config: readServerConfig(env),
      repository: fixture.repository,
      walkingProvider: fixture.provider,
    },
  );
  try {
    expect((await app.inject('/health')).statusCode).toBe(200);
    expect((await app.inject('/ready')).statusCode).toBe(200);
    const forbidden = await app.inject({
      url: '/v1/places/search?q=stop',
      headers: { 'x-forwarded-for': '1.2.3.4', origin: 'https://evil.example' },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.headers['access-control-allow-origin']).toBeUndefined();
    expect(forbidden.headers['cache-control']).toBe('no-store');
    expect(forbidden.headers['x-frame-options']).toBe('DENY');
    expect(forbidden.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    // Invalid requests still consume admission, before parsing or SQL/provider work.
    let limited = false;
    for (let n = 0; n < 40; n++) {
      const result = await app.inject({
        method: 'POST',
        url: '/v1/journeys',
        headers: { 'x-linefinder-key': key },
        payload: {},
      });
      if (result.statusCode === 429) {
        limited = true;
        expect(result.json().error.code).toBe('SERVER_BUSY');
        break;
      }
    }
    expect(limited).toBe(true);
  } finally {
    await app.close();
  }
});

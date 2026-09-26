import { describe, expect, it } from 'vitest';
import { readServerConfig } from './config.js';

describe('server configuration', () => {
  it('requires Geoapify only in production and rejects conflicting walking providers', () => {
    const database = 'postgresql://localhost/transit';
    expect(() =>
      readServerConfig({ NODE_ENV: 'production', DATABASE_URL: database }),
    ).toThrow('GEOAPIFY_API_KEY');
    expect(
      readServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: database,
        GEOAPIFY_API_KEY: 'fixture-key',
        TRANSIT_PROXY_KEY: 'test-key-'.repeat(8),
      }).geoapifyKey,
    ).toBe('fixture-key');
    expect(() =>
      readServerConfig({
        GEOAPIFY_API_KEY: 'private',
        WALKING_VALHALLA_URL: 'http://localhost:8002/route',
      }),
    ).toThrow('only');
    expect(() => readServerConfig({ GEOAPIFY_API_KEY: '' })).toThrow(
      'nonempty',
    );
  });
  it('defaults to a loopback listener on port 3001', () => {
    expect(readServerConfig({})).toMatchObject({
      host: '127.0.0.1',
      port: 3001,
      poolSize: 4,
      scheduleEntries: 2,
      journeyTimeoutMs: 15000,
    });
  });

  it('accepts explicit host and port overrides', () => {
    expect(readServerConfig({ HOST: '0.0.0.0', PORT: '4100' })).toMatchObject({
      host: '0.0.0.0',
      port: 4100,
    });
  });

  it.each(['', '0', '65536', '-1', '3.5', '3001oops', 'Infinity'])(
    'rejects invalid port %j',
    (port) => {
      expect(() => readServerConfig({ PORT: port })).toThrow(
        'PORT must be an integer',
      );
    },
  );

  it('rejects an empty host', () => {
    expect(() => readServerConfig({ HOST: ' ' })).toThrow(
      'HOST must not be empty',
    );
  });
  it.each([
    { DATABASE_POOL_SIZE: '0' },
    { DATABASE_POOL_SIZE: '17' },
    { JOURNEY_TIMEOUT_MS: '99' },
    { JOURNEY_TIMEOUT_MS: '30001' },
    { SCHEDULE_CACHE_ENTRIES: '5' },
    { SCHEDULE_CACHE_TTL_MS: 'Infinity' },
    { JOURNEY_CONCURRENCY: '0' },
    { TRANSIT_CHANGE_SECONDS: '-1' },
    { DATABASE_URL: 'http://example.org' },
    { DATABASE_URL: 'not-a-url' },
    { NODE_ENV: 'production' },
    { WALKING_VALHALLA_URL: '' },
    { WALKING_VALHALLA_URL: 'http://user:secret@example.org/route' },
    { WALKING_VALHALLA_URL: 'https://example.org/route?key=secret' },
  ])(
    'rejects unsafe or unbounded configuration without leaking values %j',
    (env) => {
      expect(() => readServerConfig(env)).toThrow();
      try {
        readServerConfig(env);
      } catch (error) {
        expect(String(error)).not.toContain('secret');
      }
    },
  );
});

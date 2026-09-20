import { geographicPolicy } from '@dallas-transit/router';
import { valhallaWalkingProvider } from '@dallas-transit/transit-ingest/runtime';

// Server-owned; request overrides cannot raise these budgets.
export const API_POLICY = geographicPolicy({
  radiusMeters: 1200,
  maxAccessCandidates: 4,
  maxEgressCandidates: 4,
  maxProviderCalls: 8,
  providerConcurrency: 2,
  providerTimeoutMs: 3000,
  maxTransitSearches: 16,
  maxJourneys: 3,
});
export const MAX_TRANSFERS = 3;

export function readServerConfig(env: NodeJS.ProcessEnv = process.env) {
  const integer = (
    name: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const raw = env[name] ?? String(fallback);
    const value = Number(raw);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    )
      throw new Error(`${name} must be an integer between ${min} and ${max}`);
    return value;
  };
  const host = env.HOST ?? '127.0.0.1';
  if (!host.trim()) throw new Error('HOST must not be empty');
  if (env.NODE_ENV === 'production' && !env.DATABASE_URL)
    throw new Error('DATABASE_URL is required in production');
  const databaseUrl =
    env.DATABASE_URL ??
    'postgresql://dallas_dev:local_only_password@127.0.0.1:5432/dallas_transit';
  try {
    const url = new URL(databaseUrl);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2 ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new Error('DATABASE_URL must identify a PostgreSQL database');
  }
  const walkingUrl = env.WALKING_VALHALLA_URL;
  if (walkingUrl !== undefined) valhallaWalkingProvider(walkingUrl);
  return Object.freeze({
    host,
    port: integer('PORT', 3001, 1, 65535),
    databaseUrl,
    walkingUrl,
    sourceKey: 'dart' as string,
    journeyTimeoutMs: integer('JOURNEY_TIMEOUT_MS', 15000, 100, 30000),
    poolSize: integer('DATABASE_POOL_SIZE', 4, 1, 16),
    scheduleEntries: integer('SCHEDULE_CACHE_ENTRIES', 2, 1, 4),
    scheduleTtlMs: integer('SCHEDULE_CACHE_TTL_MS', 300000, 1000, 3600000),
    journeyConcurrency: integer('JOURNEY_CONCURRENCY', 4, 1, 8),
    changeSeconds: integer('TRANSIT_CHANGE_SECONDS', 120, 0, 1800),
  });
}
export type ApiConfig = ReturnType<typeof readServerConfig>;

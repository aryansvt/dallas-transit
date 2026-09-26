import { geographicPolicy } from '@dallas-transit/router';
import {
  databaseConnection,
  valhallaWalkingProvider,
} from '@dallas-transit/transit-ingest/runtime';
import { geoapifyWalkingProvider } from './geoapify-walking.js';

// Server-owned; request overrides cannot raise these budgets.
export const API_POLICY = geographicPolicy({
  radiusMeters: 1200,
  maxAccessCandidates: 6,
  maxEgressCandidates: 6,
  maxProviderCalls: 16,
  providerConcurrency: 2,
  providerTimeoutMs: 3000,
  maxTransitSearches: 36,
  maxJourneys: 3,
});
export const MAX_TRANSFERS = 3;

/** Only static, non-secret messages from configuration validation may be logged. */
export class ServerConfigurationError extends Error {}

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
      throw new ServerConfigurationError(
        `${name} must be an integer between ${min} and ${max}`,
      );
    return value;
  };
  const production = env.NODE_ENV === 'production';
  const host = env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1');
  if (!host.trim())
    throw new ServerConfigurationError('HOST must not be empty');
  if (production && host !== '0.0.0.0')
    throw new ServerConfigurationError('HOST must be 0.0.0.0 in production');
  if (env.NODE_ENV === 'production' && !env.DATABASE_URL)
    throw new ServerConfigurationError(
      'DATABASE_URL is required in production',
    );
  const databaseUrl =
    env.DATABASE_URL ??
    'postgresql://dallas_dev:local_only_password@127.0.0.1:5432/dallas_transit';
  try {
    databaseConnection(databaseUrl);
  } catch {
    throw new ServerConfigurationError(
      'DATABASE_URL must identify a PostgreSQL database with supported TLS settings',
    );
  }
  const walkingUrl = env.WALKING_VALHALLA_URL;
  const geoapifyKey = env.GEOAPIFY_API_KEY;
  if (geoapifyKey !== undefined) {
    try {
      geoapifyWalkingProvider(geoapifyKey);
    } catch {
      throw new ServerConfigurationError(
        'GEOAPIFY_API_KEY must be a nonempty server API key without whitespace',
      );
    }
  }
  if (geoapifyKey && walkingUrl)
    throw new ServerConfigurationError(
      'Configure only GEOAPIFY_API_KEY for production walking',
    );
  if (env.NODE_ENV === 'production' && !geoapifyKey)
    throw new ServerConfigurationError(
      'GEOAPIFY_API_KEY is required in production',
    );
  if (walkingUrl !== undefined) {
    try {
      valhallaWalkingProvider(walkingUrl);
    } catch {
      throw new ServerConfigurationError(
        'WALKING_VALHALLA_URL must be an HTTP(S) /route endpoint without credentials, query, or fragment',
      );
    }
  }
  const proxyKey = env.TRANSIT_PROXY_KEY;
  if (
    (production || proxyKey !== undefined) &&
    !/^[A-Za-z0-9_-]{32,128}$/.test(proxyKey ?? '')
  )
    throw new ServerConfigurationError(
      'TRANSIT_PROXY_KEY must be a 32–128 character random server-only key',
    );
  return Object.freeze({
    proxyKey,
    host,
    port: integer('PORT', 3001, 1, 65535),
    databaseUrl,
    walkingUrl,
    geoapifyKey,
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

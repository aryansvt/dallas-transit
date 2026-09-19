import { DEFAULT_MAX_TRANSFERS } from './route.js';
import { integer, serviceDate } from './validation.js';
import type {
  Coordinate,
  GeographicPolicy,
  GeographicRequest,
  WalkingRoute,
} from './geographic-types.js';

export const DEFAULT_GEOGRAPHIC_POLICY: GeographicPolicy = Object.freeze({
  radiusMeters: 1200,
  maxAccessCandidates: 4,
  maxEgressCandidates: 4,
  maxProviderCalls: 8,
  providerConcurrency: 2,
  providerTimeoutMs: 5000,
  maxTransitSearches: 16,
  maxJourneys: 3,
});

export function validateCoordinate(
  value: unknown,
): asserts value is Coordinate {
  if (typeof value !== 'object' || value === null)
    throw new Error('Invalid coordinate');
  const c = value as Partial<Coordinate>;
  if (
    typeof c.latitude !== 'number' ||
    !Number.isFinite(c.latitude) ||
    Math.abs(c.latitude) > 90 ||
    typeof c.longitude !== 'number' ||
    !Number.isFinite(c.longitude) ||
    Math.abs(c.longitude) > 180
  )
    throw new Error(
      'Coordinate requires finite latitude [-90,90] and longitude [-180,180]',
    );
}

export function sameCoordinate(a: Coordinate, b: Coordinate): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

export function validateWalkingRoute(
  value: unknown,
): asserts value is WalkingRoute {
  if (typeof value !== 'object' || value === null)
    throw new Error('Invalid walking route');
  const r = value as Partial<WalkingRoute>;
  validateCoordinate(r.origin);
  validateCoordinate(r.destination);
  for (const metric of [r.durationSeconds, r.distanceMeters])
    if (
      typeof metric !== 'number' ||
      !Number.isFinite(metric) ||
      metric < 0 ||
      metric > 2147483647
    )
      throw new Error(
        'Walking metrics must be finite nonnegative numbers <= 2147483647',
      );
}

export function validateGeographicRequest(request: GeographicRequest): void {
  validateCoordinate(request.origin);
  validateCoordinate(request.destination);
  serviceDate(request.serviceDate);
  integer(request.departureTime, 'departureTime');
  // A service-facing budget in addition to the core's independently overridable limit.
  integer(request.maxTransfers ?? DEFAULT_MAX_TRANSFERS, 'maxTransfers', 8);
}

export function geographicPolicy(
  overrides: Partial<GeographicPolicy> = {},
): GeographicPolicy {
  const policy = { ...DEFAULT_GEOGRAPHIC_POLICY, ...overrides };
  const maxima: GeographicPolicy = {
    radiusMeters: 5000,
    maxAccessCandidates: 16,
    maxEgressCandidates: 16,
    maxProviderCalls: 32,
    providerConcurrency: 8,
    providerTimeoutMs: 30000,
    maxTransitSearches: 256,
    maxJourneys: 10,
  };
  for (const key of Object.keys(maxima) as (keyof GeographicPolicy)[]) {
    integer(policy[key], key, maxima[key]);
    if (policy[key] === 0) throw new Error(`${key} must be positive`);
  }
  if (
    policy.maxAccessCandidates + policy.maxEgressCandidates >
    policy.maxProviderCalls
  )
    throw new Error('Candidate sum exceeds maxProviderCalls');
  if (
    policy.maxAccessCandidates * policy.maxEgressCandidates >
    policy.maxTransitSearches
  )
    throw new Error('Candidate product exceeds maxTransitSearches');
  return Object.freeze(policy);
}

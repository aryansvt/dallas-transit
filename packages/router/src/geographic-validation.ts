import { DEFAULT_MAX_TRANSFERS } from './route.js';
import { integer, serviceDate } from './validation.js';
import type {
  ArriveByRequest,
  Coordinate,
  DepartAtRequest,
  GeographicPolicy,
  GeographicRequest,
  WalkingRoute,
} from './geographic-types.js';

export const DEFAULT_GEOGRAPHIC_POLICY: GeographicPolicy = Object.freeze({
  radiusMeters: 1200,
  stationRadiusMeters: 2200,
  shortlistLimit: 32,
  maxWalkingDurationSeconds: 1800,
  maxWalkingDistanceMeters: 2500,
  maxAccessCandidates: 6,
  maxEgressCandidates: 6,
  maxProviderCalls: 16,
  providerConcurrency: 2,
  providerTimeoutMs: 5000,
  maxTransitSearches: 36,
  maxJourneys: 3,
  arriveByWindowSeconds: 7200,
  maxWindowDepartures: 4,
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

export function isArriveBy(
  request: GeographicRequest,
): request is ArriveByRequest {
  return (request as Partial<ArriveByRequest>).arrivalTime !== undefined;
}

/** Earliest time worth searching, and the effective arrival deadline. */
export function departureWindow(
  request: GeographicRequest,
  policy: Pick<GeographicPolicy, 'arriveByWindowSeconds'>,
): { readonly earliest: number; readonly deadline: number } {
  if (!isArriveBy(request))
    return { earliest: request.departureTime, deadline: Infinity };
  const deadline = request.arrivalTime - (request.arrivalBufferSeconds ?? 0);
  // one service date: the window never reaches before 00:00
  const window =
    policy.arriveByWindowSeconds ??
    DEFAULT_GEOGRAPHIC_POLICY.arriveByWindowSeconds!;
  return { earliest: Math.max(0, deadline - window), deadline };
}

export function validateGeographicRequest(request: GeographicRequest): void {
  validateCoordinate(request.origin);
  validateCoordinate(request.destination);
  serviceDate(request.serviceDate);
  const loose = request as Partial<DepartAtRequest & ArriveByRequest>;
  if (isArriveBy(request)) {
    if (loose.departureTime !== undefined)
      throw new Error('Use departureTime or arrivalTime, not both');
    integer(request.arrivalTime, 'arrivalTime');
    integer(request.arrivalBufferSeconds ?? 0, 'arrivalBufferSeconds', 86400);
  } else {
    if (loose.arrivalBufferSeconds !== undefined)
      throw new Error('arrivalBufferSeconds needs arrivalTime');
    integer(request.departureTime, 'departureTime');
  }
  // A service-facing budget in addition to the core's independently overridable limit.
  integer(request.maxTransfers ?? DEFAULT_MAX_TRANSFERS, 'maxTransfers', 8);
}

export function geographicPolicy(
  overrides: Partial<GeographicPolicy> = {},
): GeographicPolicy {
  const policy = { ...DEFAULT_GEOGRAPHIC_POLICY, ...overrides };
  const maxima: GeographicPolicy = {
    radiusMeters: 5000,
    stationRadiusMeters: 5000,
    shortlistLimit: 64,
    maxWalkingDurationSeconds: 3600,
    maxWalkingDistanceMeters: 5000,
    maxAccessCandidates: 16,
    maxEgressCandidates: 16,
    maxProviderCalls: 32,
    providerConcurrency: 8,
    providerTimeoutMs: 30000,
    maxTransitSearches: 256,
    maxJourneys: 10,
    arriveByWindowSeconds: 14400,
    maxWindowDepartures: 16,
  };
  for (const key of Object.keys(maxima) as (keyof GeographicPolicy)[]) {
    integer(policy[key]!, key, maxima[key]!);
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

import {
  sameCoordinate,
  validateCoordinate,
  validateWalkingRoute,
  type Coordinate,
  type WalkingRoute,
} from '@dallas-transit/router';

export interface WalkingRequest {
  readonly origin: Coordinate;
  readonly destination: Coordinate;
}
export type WalkingResult =
  | { readonly status: 'ok'; readonly route: WalkingRoute }
  | { readonly status: 'no-route' }
  | {
      readonly status: 'unavailable';
      readonly reason:
        'not-configured' | 'timeout' | 'provider-error' | 'invalid-response';
    };

/** Time-independent pedestrian routes. Implementations must honor cancellation.
 * Unknown return type forces validation at the external-data boundary.
 * No endpoint, authentication, or engine-specific fields enter the router.
 */
export interface WalkingProvider {
  readonly id: string;
  route(request: WalkingRequest, signal: AbortSignal): Promise<unknown>;
}

export function validateWalkingResult(
  value: unknown,
  request: WalkingRequest,
): WalkingResult {
  try {
    if (typeof value !== 'object' || value === null) throw new Error();
    const result = value as Partial<WalkingResult>;
    if (result.status === 'no-route') return { status: 'no-route' };
    if (
      result.status === 'unavailable' &&
      [
        'not-configured',
        'timeout',
        'provider-error',
        'invalid-response',
      ].includes(result.reason ?? '')
    )
      return { status: 'unavailable', reason: result.reason! };
    if (result.status !== 'ok') throw new Error();
    validateWalkingRoute(result.route);
    if (
      !sameCoordinate(result.route.origin, request.origin) ||
      !sameCoordinate(result.route.destination, request.destination)
    )
      throw new Error();
    return {
      status: 'ok',
      route: {
        origin: { ...result.route.origin },
        destination: { ...result.route.destination },
        durationSeconds: result.route.durationSeconds,
        distanceMeters: result.route.distanceMeters,
      },
    };
  } catch {
    return { status: 'unavailable', reason: 'invalid-response' };
  }
}

export async function requestWalkingRoute(
  provider: WalkingProvider,
  request: WalkingRequest,
  timeoutMs: number,
): Promise<WalkingResult> {
  validateCoordinate(request.origin);
  validateCoordinate(request.destination);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw new Error('Invalid provider timeout');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<WalkingResult>((resolve) => {
      timer = setTimeout(() => {
        // Resolve before abort listeners can reject the provider operation.
        resolve({ status: 'unavailable', reason: 'timeout' });
        controller.abort();
      }, timeoutMs);
    });
    const response = Promise.resolve()
      .then(() => provider.route(request, controller.signal))
      .then((value) => validateWalkingResult(value, request))
      .catch((): WalkingResult => ({
        status: 'unavailable',
        reason: 'provider-error',
      }));
    return await Promise.race([response, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Exact recorded fixture values, never geographic interpolation or invented paths.
 * Only local validation/test code should select this provider.
 */
export function fixtureWalkingProvider(
  routes: readonly WalkingRoute[],
): WalkingProvider {
  const key = (request: WalkingRequest) =>
    JSON.stringify([
      request.origin.latitude,
      request.origin.longitude,
      request.destination.latitude,
      request.destination.longitude,
    ]);
  const table = new Map<string, WalkingRoute>();
  for (const route of routes) {
    validateWalkingRoute(route);
    if (table.has(key(route)))
      throw new Error('Duplicate fixture walking route');
    table.set(key(route), structuredClone(route));
  }
  return {
    id: 'deterministic-fixture',
    async route(request) {
      const found = table.get(key(request));
      return found
        ? { status: 'ok', route: structuredClone(found) }
        : { status: 'no-route' };
    },
  };
}

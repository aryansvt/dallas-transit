import { sameCoordinate, validateCoordinate } from '@dallas-transit/router';
import {
  validateWalkingResult,
  type WalkingProvider,
  type WalkingRequest,
  type WalkingResult,
} from './walking-provider.js';

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected object');
  return value as Record<string, unknown>;
}

/** Documented native Valhalla /route JSON, with explicit kilometer units.
 * No street graph, transit routing, or endpoint default is included.
 */
export function parseValhallaWalking(
  value: unknown,
  request: WalkingRequest,
): WalkingResult {
  try {
    const trip = record(record(value).trip);
    if (
      trip.status !== 0 ||
      trip.units !== 'kilometers' ||
      !Array.isArray(trip.locations) ||
      trip.locations.length !== 2 ||
      !Array.isArray(trip.legs) ||
      trip.legs.length !== 1
    )
      throw new Error('Malformed trip');
    for (const [i, expected] of [
      request.origin,
      request.destination,
    ].entries()) {
      const location = record(trip.locations[i]);
      const coordinate = { latitude: location.lat, longitude: location.lon };
      validateCoordinate(coordinate);
      // Valhalla serializes location coordinates to six decimal places.
      const rounded = {
        latitude: Number(expected.latitude.toFixed(6)),
        longitude: Number(expected.longitude.toFixed(6)),
      };
      if (
        !sameCoordinate(coordinate, expected) &&
        !sameCoordinate(coordinate, rounded)
      )
        throw new Error('Mismatched endpoint');
    }
    const summary = record(trip.summary);
    const leg = record(record(trip.legs[0]).summary);
    if (
      typeof summary.time !== 'number' ||
      typeof summary.length !== 'number' ||
      summary.time !== leg.time ||
      summary.length !== leg.length ||
      summary.has_ferry === true
    )
      throw new Error('Invalid summary');
    return validateWalkingResult(
      {
        status: 'ok',
        route: {
          ...request,
          durationSeconds: summary.time,
          distanceMeters: summary.length * 1000,
        },
      },
      request,
    );
  } catch {
    return { status: 'unavailable', reason: 'invalid-response' };
  }
}

export function valhallaWalkingProvider(
  endpoint: string,
  fetchRoute: typeof fetch = fetch,
): WalkingProvider {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('Invalid Valhalla endpoint URL');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith('/route')
  )
    throw new Error(
      'Valhalla URL must be an HTTP(S) /route endpoint without credentials, query, or fragment',
    );
  return {
    id: 'valhalla',
    async route(request, signal): Promise<WalkingResult> {
      validateCoordinate(request.origin);
      validateCoordinate(request.destination);
      try {
        const response = await fetchRoute(url, {
          method: 'POST',
          signal,
          redirect: 'error',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Client-Id': 'dallas-transit-local-validation',
          },
          body: JSON.stringify({
            locations: [request.origin, request.destination].map((c) => ({
              lat: c.latitude,
              lon: c.longitude,
              type: 'break',
            })),
            costing: 'pedestrian',
            units: 'kilometers',
            directions_type: 'none',
          }),
        });
        if (response.status === 429 || response.status >= 500) {
          await response.body?.cancel();
          return { status: 'unavailable', reason: 'provider-error' };
        }
        // Bound even a malformed/hostile streamed response; cancellation propagates
        // through Node fetch while the orchestration deadline remains active.
        const reader = response.body?.getReader();
        if (!reader)
          return { status: 'unavailable', reason: 'invalid-response' };
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > 1024 * 1024) {
              await reader.cancel();
              return { status: 'unavailable', reason: 'invalid-response' };
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        let value: unknown;
        try {
          value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return { status: 'unavailable', reason: 'invalid-response' };
        }
        if (!response.ok) {
          // Only documented path/connectivity failures mean no route. A bad URL,
          // unsupported request, missing data or quota failure is not disconnection.
          const code =
            typeof value === 'object' && value !== null
              ? (value as Record<string, unknown>).error_code
              : undefined;
          return response.status === 400 &&
            [170, 171, 441, 442].includes(code as number)
            ? { status: 'no-route' }
            : { status: 'unavailable', reason: 'provider-error' };
        }
        return parseValhallaWalking(value, request);
      } catch {
        return {
          status: 'unavailable',
          reason: signal.aborted ? 'timeout' : 'provider-error',
        };
      }
    },
  };
}

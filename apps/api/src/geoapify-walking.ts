import { providerJson, ProviderError } from '@dallas-transit/shared';
import { validateCoordinate, type Coordinate } from '@dallas-transit/router';
import type {
  WalkingProvider,
  WalkingRequest,
  WalkingResult,
} from '@dallas-transit/transit-ingest/runtime';

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
// Used only for sanity checks, never as a substitute walking route.
function meters(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function parseGeoapifyWalking(
  value: unknown,
  request: WalkingRequest,
): WalkingResult {
  try {
    if (
      !record(value) ||
      value.type !== 'FeatureCollection' ||
      !Array.isArray(value.features) ||
      value.features.length !== 1
    )
      throw new Error();
    const f = value.features[0];
    if (
      !record(f) ||
      f.type !== 'Feature' ||
      !record(f.properties) ||
      !record(f.geometry)
    )
      throw new Error();
    const p = f.properties,
      g = f.geometry;
    if (
      p.mode !== 'walk' ||
      p.units !== 'metric' ||
      p.distance_units !== 'meters' ||
      p.ferry === true ||
      !Array.isArray(p.legs) ||
      p.legs.length !== 1 ||
      g.type !== 'MultiLineString' ||
      !Array.isArray(g.coordinates) ||
      g.coordinates.length !== 1
    )
      throw new Error();
    const line = g.coordinates[0];
    if (!Array.isArray(line) || line.length < 2 || line.length > 10000)
      throw new Error();
    const points: Coordinate[] = line.map((point: unknown) => {
      if (!Array.isArray(point) || point.length !== 2) throw new Error();
      const c = { longitude: point[0], latitude: point[1] };
      validateCoordinate(c);
      return c;
    });
    if (
      meters(points[0]!, request.origin) > 100 ||
      meters(points.at(-1)!, request.destination) > 100
    )
      throw new Error();
    const d = p.distance,
      t = p.time,
      leg = p.legs[0];
    if (
      typeof d !== 'number' ||
      !Number.isFinite(d) ||
      d < 0 ||
      d > 50000 ||
      typeof t !== 'number' ||
      !Number.isFinite(t) ||
      t < 0 ||
      t > 86400 ||
      (d > 0 && (t <= 0 || d / t > 3)) ||
      (d === 0 && t !== 0) ||
      !record(leg) ||
      leg.distance !== d ||
      leg.time !== t
    )
      throw new Error();
    let geometryLength = 0;
    for (let i = 1; i < points.length; i++)
      geometryLength += meters(points[i - 1]!, points[i]!);
    // Allow snapping and rounded summaries, reject grossly contradictory metrics.
    if (
      Math.abs(geometryLength - d) > Math.max(100, d * 0.2) ||
      d + 200 < meters(request.origin, request.destination)
    )
      throw new Error();
    return {
      status: 'ok',
      route: {
        origin: { ...request.origin },
        destination: { ...request.destination },
        durationSeconds: t,
        distanceMeters: d,
      },
    };
  } catch {
    return { status: 'unavailable', reason: 'invalid-response' };
  }
}
export function geoapifyWalkingProvider(
  key: string,
  fetcher: typeof fetch = fetch,
): WalkingProvider {
  if (!key.trim() || key.length > 512 || /\s/.test(key))
    throw new Error('GEOAPIFY_API_KEY must be a nonempty server API key');
  return {
    id: 'geoapify',
    async route(request, signal): Promise<WalkingResult> {
      signal.throwIfAborted();
      validateCoordinate(request.origin);
      validateCoordinate(request.destination);
      // Identical endpoints require no pedestrian path and no external request.
      // This permits exact-stop journeys during an outage without inventing a walk.
      if (
        request.origin.latitude === request.destination.latitude &&
        request.origin.longitude === request.destination.longitude
      )
        return {
          status: 'ok',
          route: {
            origin: { ...request.origin },
            destination: { ...request.destination },
            durationSeconds: 0,
            distanceMeters: 0,
          },
        };
      const url = new URL('https://api.geoapify.com/v1/routing');
      url.searchParams.set('apiKey', key);
      url.searchParams.set(
        'waypoints',
        [request.origin, request.destination]
          .map((p) => `${p.latitude},${p.longitude}`)
          .join('|'),
      );
      url.searchParams.set('mode', 'walk');
      url.searchParams.set('units', 'metric');
      url.searchParams.set('format', 'geojson');
      try {
        return parseGeoapifyWalking(
          await providerJson(url, signal, fetcher, 3000, 1048576),
          request,
        );
      } catch (error) {
        signal.throwIfAborted();
        return {
          status: 'unavailable',
          reason:
            error instanceof ProviderError && error.code === 'timeout'
              ? 'timeout'
              : error instanceof ProviderError &&
                  error.code === 'invalid-response'
                ? 'invalid-response'
                : 'provider-error',
        };
      }
    },
  };
}

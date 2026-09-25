export interface Place {
  /** Temporary provider data must never enter device storage. */
  temporary?: boolean;
  transit?: { stopId: string; publicationId: string };
  name: string;
  context?: string;
  latitude: number;
  longitude: number;
}
export type PlaceSearchResponse =
  | { status: 'ok'; places: Place[] }
  | {
      status: 'unavailable';
      reason: 'not-configured' | 'provider-unavailable';
      places: [];
    };

export function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<Place>;
  return (
    typeof p.name === 'string' &&
    (p.temporary === undefined || typeof p.temporary === 'boolean') &&
    (p.transit === undefined ||
      (typeof p.transit === 'object' &&
        p.transit !== null &&
        typeof p.transit.stopId === 'string' &&
        p.transit.stopId.length > 0 &&
        p.transit.stopId.length <= 256 &&
        typeof p.transit.publicationId === 'string' &&
        /^[0-9a-f-]{36}$/i.test(p.transit.publicationId))) &&
    p.name.trim().length > 0 &&
    p.name.length <= 160 &&
    (p.context === undefined ||
      (typeof p.context === 'string' && p.context.length <= 240)) &&
    typeof p.latitude === 'number' &&
    Number.isFinite(p.latitude) &&
    Math.abs(p.latitude) <= 90 &&
    typeof p.longitude === 'number' &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.longitude) <= 180
  );
}
/** Copy the public fields only; discard provider IDs, tracking fields and arbitrary JSON. */
export function copyPlace(p: Place): Place {
  return {
    ...(p.temporary ? { temporary: true } : {}),
    ...(p.transit
      ? {
          transit: {
            stopId: p.transit.stopId,
            publicationId: p.transit.publicationId,
          },
        }
      : {}),
    name: p.name.trim(),
    ...(p.context ? { context: p.context.trim() } : {}),
    latitude: p.latitude,
    longitude: p.longitude,
  };
}

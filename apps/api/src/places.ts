import {
  copyPlace,
  isPlace,
  type PlaceSearchResponse,
} from '@dallas-transit/shared';
import { abortable } from './async.js';
import { object } from './contracts.js';

/** Explicit server injection point. A real adapter/terms decision requires human approval. */
export interface PlaceSearchProvider {
  search(
    query: string,
    options: { limit: number; signal: AbortSignal },
  ): Promise<unknown>;
}
export const placeQuerySchema = object({
  q: { type: 'string', minLength: 2, maxLength: 160 },
});
export const placeResponseSchema = object(
  {
    status: { enum: ['ok', 'unavailable'] },
    reason: { enum: ['not-configured', 'provider-unavailable'] },
    places: {
      type: 'array',
      maxItems: 6,
      items: object(
        {
          name: { type: 'string', minLength: 1, maxLength: 160 },
          context: { type: 'string', maxLength: 240 },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
        },
        ['name', 'latitude', 'longitude'],
      ),
    },
  },
  ['status', 'places'],
);

export async function searchPlaces(
  provider: PlaceSearchProvider | undefined,
  query: string,
  signal: AbortSignal,
): Promise<PlaceSearchResponse> {
  signal.throwIfAborted();
  if (!provider)
    return { status: 'unavailable', reason: 'not-configured', places: [] };
  try {
    const result = await abortable(
      provider.search(query, { limit: 6, signal }),
      signal,
    );
    signal.throwIfAborted();
    if (!Array.isArray(result) || result.length > 6 || !result.every(isPlace))
      throw new Error('Invalid places');
    return { status: 'ok', places: result.map(copyPlace) };
  } catch {
    signal.throwIfAborted();
    return {
      status: 'unavailable',
      reason: 'provider-unavailable',
      places: [],
    };
  }
}

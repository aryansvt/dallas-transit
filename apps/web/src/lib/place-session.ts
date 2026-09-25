import {
  mergeSuggestions,
  ProviderError,
  type PlaceSearchSession,
  type PlaceSearchResponse,
  type SearchContext,
  type SearchFailure,
  type PlaceSuggestion,
} from '@dallas-transit/shared';
import { MapboxSearchSession } from './mapbox-search';

export function placeSession(
  local: (
    query: string,
    signal: AbortSignal,
    context: SearchContext,
  ) => Promise<PlaceSearchResponse>,
  token?: string,
): PlaceSearchSession {
  const external = token ? new MapboxSearchSession(token) : undefined;
  let controller = new AbortController();
  return {
    async suggest(query, context, signal) {
      controller.abort();
      controller = new AbortController();
      const combined = AbortSignal.any([signal, controller.signal]);
      const [stops, places] = await Promise.allSettled([
        local(query, combined, context),
        external?.suggest(query, context, combined) ??
          Promise.resolve(undefined),
      ]);
      combined.throwIfAborted();
      const failures: { source: 'stops' | 'places'; reason: SearchFailure }[] =
        [];
      let transit: PlaceSuggestion[] = [];
      if (stops.status === 'fulfilled' && stops.value.status === 'ok')
        transit = stops.value.places.map((p, i) => ({
          id: p.transit
            ? `${p.transit.publicationId}:${p.transit.stopId}`
            : `local:${i}`,
          name: p.name,
          ...(p.context ? { context: p.context } : {}),
          kind: p.transit ? 'transit' : 'place',
          place: p,
        }));
      else failures.push({ source: 'stops', reason: 'provider-unavailable' });
      if (places.status === 'rejected')
        failures.push({
          source: 'places',
          reason:
            places.reason instanceof ProviderError
              ? places.reason.code
              : 'provider-unavailable',
        });
      else if (!places.value)
        failures.push({ source: 'places', reason: 'not-configured' });
      const result = places.status === 'fulfilled' ? places.value : undefined;
      return {
        suggestions: mergeSuggestions(
          query,
          transit,
          result?.suggestions ?? [],
        ),
        failures,
        ...(result ? { attribution: result.attribution } : {}),
      };
    },
    async retrieve(suggestion, signal) {
      if (suggestion.place) {
        external?.close();
        return suggestion.place;
      }
      if (!external) throw new ProviderError('provider-unavailable');
      return external.retrieve(suggestion, signal);
    },
    close() {
      controller.abort();
      external?.close();
    },
  };
}

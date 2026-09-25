import type { Place } from './places.js';

/** Suggestions may lack coordinates until the user selects one. */
export interface PlaceSuggestion {
  id: string;
  name: string;
  context?: string;
  kind: 'transit' | 'place';
  place?: Place;
}
export type SearchFailure =
  | 'not-configured'
  | 'timeout'
  | 'rate-limited'
  | 'unauthorized'
  | 'provider-unavailable'
  | 'invalid-response';
export interface SearchResults {
  suggestions: PlaceSuggestion[];
  failures: { source: 'places' | 'stops'; reason: SearchFailure }[];
  attribution?: string;
}
export interface SearchContext {
  serviceDate: string;
  publicationId?: string;
  proximity?: { latitude: number; longitude: number };
}
export interface PlaceSearchSession {
  suggest(
    query: string,
    context: SearchContext,
    signal: AbortSignal,
  ): Promise<SearchResults>;
  retrieve(suggestion: PlaceSuggestion, signal: AbortSignal): Promise<Place>;
  close(): void;
}

export const searchName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Lexical tiers, not relevance scores. Provider order breaks ties. Only shared
 * identities are deduplicated: similar names cannot establish equivalence. */
export function mergeSuggestions(
  query: string,
  transit: PlaceSuggestion[],
  external: PlaceSuggestion[],
): PlaceSuggestion[] {
  const q = searchName(query);
  const tier = (s: PlaceSuggestion) => {
    const name = searchName(s.name);
    if (name === q) return s.kind === 'transit' ? 0 : 1;
    if (
      s.kind === 'transit' &&
      /\b(station|stop|transit)\b/.test(q) &&
      name.startsWith(q)
    )
      return 2;
    return s.kind === 'place' ? 3 : 4;
  };
  const seen = new Set<string>();
  return [...transit, ...external]
    .filter((s) => {
      const key = `${s.kind}:${s.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => tier(a) - tier(b))
    .slice(0, 6);
}

import {
  copyPlace,
  isPlace,
  ProviderError,
  providerJson,
  type Place,
  type PlaceSuggestion,
  type SearchContext,
} from '@dallas-transit/shared';

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const invalid = (): never => {
  throw new ProviderError('invalid-response');
};

/** Provider IDs never leave this adapter: public handles are session-local. */
export class MapboxSearchSession {
  private token = '';
  private started = 0;
  private calls = 0;
  private generation = 0;
  private ids = new Map<string, string>();
  private active = new AbortController();
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = Date.now,
    private readonly uuid = () => crypto.randomUUID(),
  ) {
    if (!/^pk\.[A-Za-z0-9._-]+$/.test(accessToken))
      throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN must be a public pk. token');
  }
  close() {
    this.active.abort();
    this.active = new AbortController();
    this.token = '';
    this.calls = 0;
    this.ids.clear();
    this.generation++;
  }
  private url(path: string) {
    const url = new URL(`https://api.mapbox.com/search/searchbox/v1/${path}`);
    url.searchParams.set('access_token', this.accessToken);
    url.searchParams.set('session_token', this.token);
    return url;
  }
  async suggest(
    query: string,
    context: SearchContext,
    signal: AbortSignal,
  ): Promise<{ suggestions: PlaceSuggestion[]; attribution: string }> {
    signal.throwIfAborted();
    if (query.trim().length < 2 || query.length > 160)
      throw new Error('Invalid search query');
    // Rotate conservatively before documented 180-second / 50-suggest expiry.
    if (
      !this.token ||
      this.now() - this.started >= 175000 ||
      this.calls >= 49
    ) {
      this.close();
      this.token = this.uuid();
      this.started = this.now();
    }
    this.active.abort();
    this.active = new AbortController();
    this.ids.clear();
    const generation = ++this.generation;
    const url = this.url('suggest');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('limit', '6');
    url.searchParams.set('language', 'en');
    url.searchParams.set(
      'types',
      'poi,address,street,neighborhood,locality,place',
    );
    // Regional ranking bias, not a claim about the user's location or a boundary.
    const p = context.proximity ?? { longitude: -96.85, latitude: 32.95 };
    if (!isPlace({ ...p, name: 'bias' })) throw new Error('Invalid proximity');
    url.searchParams.set('proximity', `${p.longitude},${p.latitude}`);
    this.calls++;
    const combined = AbortSignal.any([signal, this.active.signal]);
    const value = await providerJson(url, combined, this.fetcher);
    combined.throwIfAborted();
    if (
      !record(value) ||
      !Array.isArray(value.suggestions) ||
      value.suggestions.length > 6 ||
      !text(value.attribution, 2048)
    )
      return invalid();
    const seen = new Set<string>();
    const suggestions: PlaceSuggestion[] = [];
    for (const s of value.suggestions) {
      if (
        !record(s) ||
        !text(s.name, 160) ||
        !text(s.mapbox_id, 1024) ||
        !text(s.place_formatted, 240) ||
        !text(s.feature_type, 40)
      )
        return invalid();
      if (seen.has(s.mapbox_id)) continue;
      seen.add(s.mapbox_id);
      const id = `${generation}:${suggestions.length}`;
      this.ids.set(id, s.mapbox_id);
      suggestions.push({
        id,
        name: s.name,
        context:
          typeof s.full_address === 'string' && s.full_address.length <= 240
            ? s.full_address
            : s.place_formatted,
        kind: 'place',
      });
    }
    return { suggestions, attribution: value.attribution };
  }
  async retrieve(
    suggestion: PlaceSuggestion,
    signal: AbortSignal,
  ): Promise<Place> {
    const id = this.ids.get(suggestion.id);
    if (!id || this.now() - this.started >= 175000) {
      this.close();
      throw new ProviderError('provider-unavailable');
    }
    const url = this.url(`retrieve/${encodeURIComponent(id)}`);
    const combined = AbortSignal.any([signal, this.active.signal]);
    try {
      const value = await providerJson(url, combined, this.fetcher);
      combined.throwIfAborted();
      if (
        !record(value) ||
        value.type !== 'FeatureCollection' ||
        !Array.isArray(value.features) ||
        value.features.length !== 1
      )
        return invalid();
      const f = value.features[0];
      if (
        !record(f) ||
        f.type !== 'Feature' ||
        !record(f.properties) ||
        f.properties.mapbox_id !== id ||
        !record(f.geometry) ||
        f.geometry.type !== 'Point' ||
        !Array.isArray(f.geometry.coordinates) ||
        f.geometry.coordinates.length !== 2
      )
        return invalid();
      const place = {
        name: f.properties.name,
        context: suggestion.context,
        longitude: f.geometry.coordinates[0],
        latitude: f.geometry.coordinates[1],
        temporary: true,
      };
      if (!isPlace(place)) return invalid();
      return copyPlace(place);
    } finally {
      this.close();
    }
  }
}

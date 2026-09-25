import { expect, it, vi } from 'vitest';
import { mergeSuggestions, type PlaceSuggestion } from '@dallas-transit/shared';
import { placeSession } from './place-session';
const stop = (name: string, id = name): PlaceSuggestion => ({
  id,
  name,
  kind: 'transit',
});
const poi = (name: string, id = name): PlaceSuggestion => ({
  id,
  name,
  kind: 'place',
});
it('ranks exact stations over POIs, exact POIs over partial stops, preserves ambiguous identities', () => {
  expect(
    mergeSuggestions(
      'West End Station',
      [stop('West End Station')],
      [poi('West End Station')],
    ).map((s) => s.kind),
  ).toEqual(['transit', 'place']);
  expect(
    mergeSuggestions('Museum', [stop('Museum Road')], [poi('Museum')])[0]!.kind,
  ).toBe('place');
  expect(
    mergeSuggestions(
      'Main',
      [stop('Main', '1'), stop('Main', '2'), stop('Main', '1')],
      [poi('Main', '1')],
    ),
  ).toHaveLength(3);
  expect(
    mergeSuggestions(
      'museum',
      [stop('Other')],
      Array.from({ length: 6 }, (_, i) => poi(`Museum ${i}`)),
    ),
  ).toHaveLength(6);
});
it('returns local stops when external search is not configured', async () => {
  const s = placeSession(async () => ({
    status: 'ok',
    places: [
      {
        name: 'West End Station',
        latitude: 32.8,
        longitude: -96.8,
        transit: {
          stopId: '1',
          publicationId: '00000000-0000-4000-8000-000000000001',
        },
      },
    ],
  }));
  const r = await s.suggest(
    'West End Station',
    { serviceDate: '2026-09-25' },
    new AbortController().signal,
  );
  expect(r.suggestions[0]!.kind).toBe('transit');
  expect(r.failures).toEqual([{ source: 'places', reason: 'not-configured' }]);
});
it('retains local results on Mapbox rate limits', async () => {
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('private body', { status: 429 }));
  const s = placeSession(
    async () => ({
      status: 'ok',
      places: [{ name: 'Station', latitude: 32.8, longitude: -96.8 }],
    }),
    'pk.test',
  );
  try {
    expect(
      await s.suggest(
        'Station',
        { serviceDate: '2026-09-25' },
        new AbortController().signal,
      ),
    ).toMatchObject({
      suggestions: [{ name: 'Station' }],
      failures: [{ source: 'places', reason: 'rate-limited' }],
    });
  } finally {
    s.close();
    fetcher.mockRestore();
  }
});
it('combined latency follows the slower source, not the sum', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                Response.json({ suggestions: [], attribution: 'Mapbox' }),
              ),
            180,
          ),
        ),
    );
  const s = placeSession(
    () =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ status: 'ok', places: [] }), 120),
      ),
    'pk.test',
  );
  try {
    let finished = false;
    const start = Date.now();
    const pending = s
      .suggest(
        'museum',
        { serviceDate: '2026-09-25' },
        new AbortController().signal,
      )
      .then((r) => {
        finished = true;
        return r;
      });
    await vi.advanceTimersByTimeAsync(179);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(Date.now() - start).toBe(180);
  } finally {
    s.close();
    fetcher.mockRestore();
    vi.useRealTimers();
  }
});
it('runs both sources concurrently and retains external results when stop search fails', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({
      suggestions: [
        {
          name: 'Museum',
          mapbox_id: 'id',
          feature_type: 'poi',
          place_formatted: 'Dallas',
        },
      ],
      attribution: 'Mapbox',
    }),
  );
  let release!: () => void;
  const s = placeSession(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            status: 'unavailable',
            reason: 'provider-unavailable',
            places: [],
          });
      }),
    'pk.test',
  );
  try {
    const result = s.suggest(
      'museum',
      { serviceDate: '2026-09-25' },
      new AbortController().signal,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    release();
    expect(await result).toMatchObject({
      suggestions: [{ name: 'Museum' }],
      failures: [{ source: 'stops' }],
    });
  } finally {
    s.close();
    fetcher.mockRestore();
  }
});

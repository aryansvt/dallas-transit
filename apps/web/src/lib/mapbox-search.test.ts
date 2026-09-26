import { afterEach, expect, it, vi } from 'vitest';
import { MapboxSearchSession } from './mapbox-search';
const context = { serviceDate: '2026-09-25' };
const signal = () => new AbortController().signal;
const suggestion = {
  name: 'Museum',
  mapbox_id: 'private-id',
  feature_type: 'poi',
  place_formatted: 'Dallas, Texas',
  tracking: 'discard',
};
const suggest = () => ({
  suggestions: [suggestion, suggestion],
  attribution: '© Mapbox',
});
const retrieve = () => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Museum', mapbox_id: 'private-id' },
      geometry: { type: 'Point', coordinates: [-96.8, 32.8] },
    },
  ],
});
afterEach(() => vi.useRealTimers());
it('normalizes, deduplicates IDs, retrieves only selection and rotates after selection', async () => {
  const urls: URL[] = [];
  const fetcher = vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    urls.push(url);
    return Response.json(
      url.pathname.includes('retrieve') ? retrieve() : suggest(),
    );
  });
  let n = 0;
  const session = new MapboxSearchSession(
    'pk.test',
    fetcher,
    Date.now,
    () => `session-${++n}`,
  );
  const first = await session.suggest('mus', context, signal());
  expect(first.suggestions).toHaveLength(1);
  expect(JSON.stringify(first)).not.toContain('private-id');
  expect(JSON.stringify(first)).not.toContain('tracking');
  const second = await session.suggest('museum', context, signal());
  expect(urls[0]!.searchParams.get('session_token')).toBe(
    urls[1]!.searchParams.get('session_token'),
  );
  expect(urls[0]!.searchParams.get('bbox')).toBeNull();
  expect(await session.retrieve(second.suggestions[0]!, signal())).toEqual({
    name: 'Museum',
    context: 'Dallas, Texas',
    longitude: -96.8,
    latitude: 32.8,
    temporary: true,
  });
  expect(urls[2]!.searchParams.get('session_token')).toBe('session-1');
  await session.suggest('museum', context, signal());
  expect(urls[3]!.searchParams.get('session_token')).toBe('session-2');
  session.close();
});
it('rotates on abandonment, age and request cap, using consented proximity only when supplied', async () => {
  let time = 0,
    count = 0;
  const urls: URL[] = [];
  const session = new MapboxSearchSession(
    'pk.test',
    async (input) => {
      urls.push(new URL(String(input)));
      return Response.json(suggest());
    },
    () => time,
    () => `s${++count}`,
  );
  await session.suggest(
    'museum',
    { ...context, proximity: { latitude: 33.1, longitude: -96.6 } },
    signal(),
  );
  expect(urls[0]!.searchParams.get('proximity')).toBe('-96.6,33.1');
  time = 175000;
  await session.suggest('museum', context, signal());
  expect(count).toBe(2);
  for (let i = 0; i < 49; i++)
    await session.suggest('museum', context, signal());
  expect(count).toBe(3);
  session.close();
  await session.suggest('museum', context, signal());
  expect(count).toBe(4);
});
it.each([
  [429, 'rate-limited'],
  [401, 'unauthorized'],
  [403, 'unauthorized'],
  [503, 'provider-unavailable'],
] as const)('sanitizes HTTP %i', async (status, code) => {
  const s = new MapboxSearchSession(
    'pk.test',
    async () => new Response('private body', { status }),
  );
  await expect(s.suggest('museum', context, signal())).rejects.toMatchObject({
    code,
    message: code,
  });
});
it.each([
  null,
  {},
  { suggestions: [suggestion], attribution: 1 },
  { suggestions: [{ ...suggestion, name: null }], attribution: 'Mapbox' },
])('rejects malformed suggestions %#', async (value) => {
  const s = new MapboxSearchSession('pk.test', async () =>
    Response.json(value),
  );
  await expect(s.suggest('museum', context, signal())).rejects.toMatchObject({
    code: 'invalid-response',
  });
});
it('rejects malformed Retrieve geometry and expires its handles', async () => {
  let n = 0;
  const s = new MapboxSearchSession('pk.test', async () =>
    Response.json(
      n++ === 0 ? suggest() : { type: 'FeatureCollection', features: [] },
    ),
  );
  const result = await s.suggest('museum', context, signal());
  await expect(
    s.retrieve(result.suggestions[0]!, signal()),
  ).rejects.toMatchObject({ code: 'invalid-response' });
  await expect(
    s.retrieve(result.suggestions[0]!, signal()),
  ).rejects.toMatchObject({ code: 'provider-unavailable' });
});
it('times out uncooperative requests, cancels superseded requests, and cancels on close', async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  const s = new MapboxSearchSession('pk.test', (_url, init) => {
    signals.push(init!.signal!);
    return new Promise(() => {});
  });
  const first = s.suggest('museum', context, signal()).catch((e) => e);
  const second = s.suggest('library', context, signal()).catch((e) => e);
  expect(signals[0]!.aborted).toBe(true);
  await first;
  await vi.advanceTimersByTimeAsync(3000);
  expect(await second).toMatchObject({ code: 'timeout' });
  expect(signals[1]!.aborted).toBe(true);
  const third = s.suggest('school', context, signal()).catch((e) => e);
  s.close();
  await third;
  expect(signals[2]!.aborted).toBe(true);
});

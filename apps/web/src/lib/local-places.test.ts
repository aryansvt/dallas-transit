import { expect, it } from 'vitest';
import {
  addRecent,
  emptyPlaces,
  isSaved,
  MAX_RECENT,
  MAX_SAVED,
  readPlaces,
  savedFull,
  toggleSaved,
  writePlaces,
} from './local-places';
import { previewDestination as place } from '../preview/fixtures';
it('never stores temporary search data through recents, saves or direct writes', () => {
  const temporary = { ...place, temporary: true };
  expect(addRecent(emptyPlaces(), temporary)).toEqual(emptyPlaces());
  expect(toggleSaved(emptyPlaces(), temporary)).toEqual(emptyPlaces());
  let raw = '';
  writePlaces(
    {
      setItem: (_key, value) => {
        raw = value;
      },
    },
    { version: 1, recent: [temporary], saved: [temporary] },
  );
  expect(JSON.parse(raw)).toEqual(emptyPlaces());
  expect(
    readPlaces({
      getItem: () =>
        JSON.stringify({ version: 1, recent: [temporary], saved: [temporary] }),
    }),
  ).toEqual(emptyPlaces());
});
it('validates storage version, structure, lengths and coordinates', () => {
  for (const raw of [
    '{',
    'null',
    '{}',
    '{"version":2,"recent":[],"saved":[]}',
    'x'.repeat(24001),
  ])
    expect(readPlaces({ getItem: () => raw })).toEqual(emptyPlaces());
  const data = readPlaces({
    getItem: () =>
      JSON.stringify({
        version: 1,
        recent: [place, { ...place, latitude: 999 }],
        saved: [{ ...place, internalId: 'private' }],
      }),
  });
  expect(data.recent).toHaveLength(1);
  expect(data.saved[0]).not.toHaveProperty('internalId');
});
it('bounds and deduplicates recents and saved places', () => {
  let data = emptyPlaces();
  for (let i = 0; i < 20; i++) {
    data = addRecent(data, { ...place, name: String(i) });
    data = toggleSaved(data, { ...place, name: String(i) });
  }
  expect(data.recent).toHaveLength(MAX_RECENT);
  expect(data.saved).toHaveLength(MAX_SAVED);
  data = addRecent(data, data.recent[0]!);
  expect(data.recent).toHaveLength(MAX_RECENT);
  data = toggleSaved(data, data.saved[0]!);
  expect(data.saved).toHaveLength(MAX_SAVED - 1);
});
it('never silently drops a saved place when the list is full', () => {
  let data = emptyPlaces();
  for (let i = 0; i < MAX_SAVED; i++)
    data = toggleSaved(data, { ...place, name: String(i) });
  expect(savedFull(data)).toBe(true);
  const extra = { ...place, name: 'One too many' };
  expect(toggleSaved(data, extra)).toBe(data);
  expect(data.saved.map((p) => p.name)).toContain('0');
  // unsaving still works when full
  expect(isSaved(toggleSaved(data, data.saved[0]!), data.saved[0]!)).toBe(
    false,
  );
  // a full list survives a storage round trip
  let raw = '';
  writePlaces({ setItem: (_key, value) => (raw = value) }, data);
  expect(raw.length).toBeLessThan(24000);
  expect(readPlaces({ getItem: () => raw }).saved).toHaveLength(MAX_SAVED);
});
it('handles denied reads and writes without breaking planning', () => {
  expect(
    readPlaces({
      getItem() {
        throw new Error();
      },
    }),
  ).toEqual(emptyPlaces());
  expect(
    writePlaces(
      {
        setItem() {
          throw new Error();
        },
      },
      emptyPlaces(),
    ),
  ).toBe(false);
});
it('stores only a version and public place fields', () => {
  let encoded = '';
  writePlaces(
    {
      setItem(_key, value) {
        encoded = value;
      },
    },
    addRecent(emptyPlaces(), place),
  );
  expect(JSON.parse(encoded)).toEqual({
    version: 1,
    recent: [place],
    saved: [],
  });
});

import { expect, it } from 'vitest';
import {
  addRecent,
  emptyPlaces,
  readPlaces,
  toggleSaved,
  writePlaces,
} from './local-places';
import { previewDestination as place } from '../preview/fixtures';
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
  for (let i = 0; i < 8; i++) {
    data = addRecent(data, { ...place, name: String(i) });
    data = toggleSaved(data, { ...place, name: String(i) });
  }
  expect(data.recent).toHaveLength(5);
  expect(data.saved).toHaveLength(5);
  data = addRecent(data, data.recent[0]!);
  expect(data.recent).toHaveLength(5);
  data = toggleSaved(data, data.saved[0]!);
  expect(data.saved).toHaveLength(4);
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

import { expect, it } from 'vitest';
import {
  generateTransferCandidates,
  nextTransferCandidate,
  type TransferStop,
  type TransferPair,
} from './transfer-candidates.js';
const stop = (
  id: string,
  route = id,
  mode = 3,
  direction = 0,
): TransferStop => ({
  id,
  name: id,
  parent: null,
  services: [
    {
      route,
      direction,
      mode,
      pickupDates: ['2026-09-26'],
      dropoffDates: ['2026-09-26'],
    },
  ],
});
const pair = (to: string, distance = 100, from = 'a'): TransferPair => ({
  from,
  to,
  distance,
});
it('preserves rail and route/direction diversity despite redundant close bus stops', () => {
  const buses = Array.from({ length: 30 }, (_, i) => stop(`b${i}`, 'bus'));
  const stops = [
    stop('a'),
    ...buses,
    stop('rail', 'line', 2),
    stop('opposite', 'bus', 3, 1),
  ];
  const pairs = [
    ...buses.map((s, i) => pair(s.id, i + 1)),
    pair('rail', 700),
    pair('opposite', 400),
  ];
  const result = generateTransferCandidates('p', stops, pairs);
  expect(result[0]?.to).toBe('rail');
  expect(result.map((c) => c.to)).toContain('opposite');
  expect(result.filter((c) => c.to.startsWith('b'))).toHaveLength(2);
  expect(
    generateTransferCandidates('p', [...stops].reverse(), [...pairs].reverse()),
  ).toEqual(result);
});
it('requires overlapping active dates and directional alighting/boarding eligibility', () => {
  const a = stop('a'),
    b = stop('b'),
    c = stop('c');
  a.services[0]!.pickupDates = [];
  b.services[0]!.dropoffDates = [];
  c.services[0]!.pickupDates = ['2026-09-27'];
  const result = generateTransferCandidates(
    'p',
    [a, b, c],
    [pair('b'), pair('a', 100, 'b'), pair('c')],
  );
  expect(result.map((r) => [r.from, r.to])).toEqual([['a', 'b']]);
});
it('keeps endpoint envelopes separate and supports explicit station parents', () => {
  const a = stop('a'),
    b = stop('b'),
    r = stop('r', 'rail', 2);
  expect(
    generateTransferCandidates(
      'p',
      [a, b, r],
      [pair('b', 501), pair('r', 801)],
    ),
  ).toEqual([]);
  a.parent = b.parent = 'station';
  expect(
    generateTransferCandidates('p', [a, b], [pair('b', 700)]),
  ).toHaveLength(1);
});
it('suppresses already boardable service and keeps new directions', () => {
  expect(
    generateTransferCandidates(
      'p',
      [stop('a', 'same'), stop('b', 'same'), stop('c', 'same', 3, 1)],
      [pair('b'), pair('c')],
    ).map((c) => c.to),
  ).toEqual(['c']);
});
it('bounds output and refills rejected walks without treating rejection as coverage', () => {
  const stops = [
    stop('a'),
    ...Array.from({ length: 30 }, (_, i) => stop(`b${i}`)),
  ];
  const result = generateTransferCandidates(
    'p',
    stops,
    stops.slice(1).map((s) => pair(s.id)),
  );
  expect(result).toHaveLength(12);
  const first = nextTransferCandidate(result, [], new Set())!;
  const next = nextTransferCandidate(result, [], new Set([first.to]));
  expect(next).toBeDefined();
  expect(next?.to).not.toBe(first.to);
  expect(
    nextTransferCandidate(result, [], new Set(result.map((c) => c.to))),
  ).toBeUndefined();
  expect(
    nextTransferCandidate(result, result.slice(0, 6), new Set()),
  ).toBeUndefined();
});
it('preserves the Frankford route-232 to route-236 topology without IDs in policy', () => {
  const result = generateTransferCandidates(
    'p',
    [
      stop('inbound', '232'),
      stop('near', '236'),
      stop('redundant', '236'),
      stop('outbound', '236'),
    ],
    [
      { ...pair('near', 207, 'inbound'), bearing: 125 },
      { ...pair('redundant', 336, 'inbound'), bearing: 165 },
      { ...pair('outbound', 375, 'inbound'), bearing: 55 },
    ],
  );
  expect(result.map((c) => c.to)).toEqual(['near', 'outbound']);
  expect(nextTransferCandidate(result, [], new Set(['near']))?.to).toBe(
    'outbound',
  );
});
it('deduplicates ordered pairs but independently retains reverse connectivity', () => {
  const result = generateTransferCandidates(
    'p',
    [stop('a'), stop('b')],
    [pair('b'), pair('b'), pair('a', 100, 'b')],
  );
  expect(result).toHaveLength(2);
});
it('preserves multiple modes and suppresses accepted redundant coverage on refill', () => {
  const stops = [
    stop('a'),
    stop('bus', 'bus'),
    stop('backup', 'bus'),
    stop('light', 'light', 0),
    stop('heavy', 'heavy', 2),
  ];
  const result = generateTransferCandidates(
    'p',
    stops,
    stops.slice(1).map((s) => pair(s.id)),
  );
  expect(new Set(result.flatMap((c) => c.modes))).toEqual(new Set([0, 2, 3]));
  const accepted = result.filter((c) => c.to !== 'backup');
  expect(
    nextTransferCandidate(result, accepted, new Set(accepted.map((c) => c.to))),
  ).toBeUndefined();
});

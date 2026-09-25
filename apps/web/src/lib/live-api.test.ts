import { it, expect } from 'vitest';
import { parseLive } from './api';
const base = {
  publicationId: 'p',
  serviceDate: '2026-09-18',
  checkedAt: 100,
  validUntil: 145,
  freshness: 'UNAVAILABLE',
  legs: [],
  transfers: [],
  alerts: [],
  replan: { suggested: false, reasons: [] },
};
it('accepts scheduled fallback and rejects malformed or unbounded live payloads', () => {
  expect(parseLive(base)).toEqual(base);
  for (const value of [
    null,
    { ...base, freshness: 'probably-live' },
    { ...base, checkedAt: Infinity },
    { ...base, legs: Array(5).fill({}) },
    { ...base, alerts: Array(21).fill({}) },
    { ...base, replan: { suggested: true, reasons: [{}] } },
  ])
    expect(() => parseLive(value)).toThrow();
});

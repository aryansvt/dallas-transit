import { describe, expect, it } from 'vitest';
import { parseGtfsDate, parseServiceTime } from './time.js';

describe('GTFS service-day times', () => {
  it.each([
    ['24:15:00', 24, 15, 0, 87300],
    ['25:30:00', 25, 30, 0, 91800],
    ['26:06:00', 26, 6, 0, 93960],
    ['0:00:01', 0, 0, 1, 1],
    ['99:59:59', 99, 59, 59, 359999],
  ] as const)('preserves %s', (text, hours, minutes, seconds, total) => {
    expect(parseServiceTime(text)).toEqual({
      hours,
      minutes,
      seconds,
      secondsFromServiceDayStart: total,
    });
  });
  it.each([
    '24:60:00',
    '25:30:60',
    '-1:00:00',
    '12:5:00',
    '12:00',
    '12:00:00Z',
    ' 24:00:00',
    '1.5:00:00',
    '',
  ])('rejects %s', (value) =>
    expect(() => parseServiceTime(value)).toThrow('Invalid GTFS time'),
  );
  it('bounds integer storage without a DART-specific hour ceiling', () => {
    expect(parseServiceTime('1000:00:00').secondsFromServiceDayStart).toBe(
      3600000,
    );
    expect(() => parseServiceTime('596524:00:00')).toThrow(
      'exceeds signed 32-bit',
    );
  });
});
describe('GTFS service dates', () => {
  it('retains date-only identity including leap day', () =>
    expect(parseGtfsDate('20240229')).toBe('2024-02-29'));
  it.each([
    '20260229',
    '20260931',
    '20260001',
    '00000101',
    '2026-09-18',
    '20261301',
    '2026091',
  ])('rejects %s', (value) =>
    expect(() => parseGtfsDate(value)).toThrow('Invalid GTFS date'),
  );
});

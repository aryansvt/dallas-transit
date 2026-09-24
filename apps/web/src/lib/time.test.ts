import { describe, expect, it } from 'vitest';
import {
  civilInstant,
  departureAt,
  duration,
  leaveNow,
  serviceAnchor,
  serviceTime,
} from './time';
describe('Dallas civil and service-day time', () => {
  it('selects Dallas date and seconds even when UTC is the next day', () => {
    expect(leaveNow(new Date('2026-09-19T04:15:00Z'))).toEqual({
      serviceDate: '2026-09-18',
      departureTime: 83700,
    });
  });
  it('uses current Dallas civil date after midnight, without automatic lookback', () => {
    expect(leaveNow(new Date('2026-09-19T05:15:00Z'))).toEqual({
      serviceDate: '2026-09-19',
      departureTime: 900,
    });
    expect(departureAt('2026-09-19', '00:15', true)).toEqual({
      serviceDate: '2026-09-18',
      departureTime: 87300,
    });
  });
  it('formats overnight values with the correct instant and date context', () => {
    expect(serviceTime('2026-09-18', 91800)).toEqual({
      clock: '1:30 AM',
      dayLabel: 'next day',
      iso: '2026-09-19T06:30:00.000Z',
    });
    expect(serviceTime('2026-09-18', 173700).dayLabel).toContain('Sep 20');
  });
  it('honors the GTFS noon-minus-twelve-elapsed-hours anchor on spring DST day', () => {
    expect(new Date(serviceAnchor('2026-03-08')).toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(departureAt('2026-03-08', '03:30').departureTime).toBe(12600);
    expect(serviceTime('2026-03-08', 12600).clock).toBe('3:30 AM');
    expect(departureAt('2026-03-08', '00:30').departureTime).toBe(5400);
    expect(() => departureAt('2026-11-01', '00:30')).toThrow('previous day');
  });
  it('rejects ambiguous/nonexistent civil departures rather than guessing', () => {
    expect(() => civilInstant('2026-11-01', '01:30')).toThrow('twice');
    expect(() => civilInstant('2026-03-08', '02:30')).toThrow('skipped');
    expect(() => civilInstant('2026-02-30', '12:00')).toThrow('valid');
  });
  it('uses standard time for winter and preserves fractional arrivals', () => {
    expect(civilInstant('2026-12-01', '08:00').toISOString()).toBe(
      '2026-12-01T14:00:00.000Z',
    );
    expect(serviceTime('2026-09-18', 31428.71).iso).toBe(
      '2026-09-18T13:43:48.710Z',
    );
  });
  it('formats elapsed duration independently of civil dates', () => {
    expect(duration(61)).toBe('2 min');
    expect(duration(6900)).toBe('1 hr 55 min');
  });
});

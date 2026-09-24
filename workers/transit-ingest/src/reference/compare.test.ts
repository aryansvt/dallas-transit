import { describe, expect, it } from 'vitest';
import { buildSchedule } from '@dallas-transit/router';
import {
  compare,
  frontier,
  inSearchWindow,
  normalizeOtp,
  serviceDayEpoch,
  validateItinerary,
  type Itinerary,
  type OtpItinerary,
} from './compare.js';
import { activeServices } from './feed.js';

const date = '2026-09-18';
const ride = {
  trip: 't',
  route: 'r',
  from: 'A',
  to: 'B',
  departure: 86460,
  arrival: 86520,
  serviceDate: date,
};
const journey: Itinerary = {
  departure: 86460,
  arrival: 86520,
  transfers: 0,
  rides: [ride],
};
const schedule = buildSchedule({
  publicationId: 'fixture',
  serviceDate: date,
  activeServiceIds: ['s'],
  stops: ['A', 'B', 'C'].map((id) => ({ id, changeSeconds: 120 })),
  trips: [
    {
      id: 't',
      routeId: 'r',
      serviceId: 's',
      events: [
        {
          stopId: 'A',
          sequence: 1,
          arrival: 86400,
          departure: 86400,
          pickup: 0,
          dropOff: 0,
        },
        {
          stopId: 'A',
          sequence: 3,
          arrival: 86460,
          departure: 86460,
          pickup: 0,
          dropOff: 0,
        },
        {
          stopId: 'B',
          sequence: 7,
          arrival: 86520,
          departure: 86520,
          pickup: 0,
          dropOff: 0,
        },
        {
          stopId: 'C',
          sequence: 9,
          arrival: 86580,
          departure: 86580,
          pickup: 1,
          dropOff: 1,
        },
      ],
    },
  ],
});

describe('reference calendar and clock', () => {
  const calendar = [
    {
      service_id: 'weekday',
      monday: 1,
      tuesday: 1,
      wednesday: 1,
      thursday: 1,
      friday: 1,
      saturday: 0,
      sunday: 0,
      start_date: '2026-09-14',
      end_date: '2026-09-18',
    },
  ];
  it('uses inclusive ranges and weekdays, with exception additions and removals taking precedence', () => {
    expect(activeServices(date, calendar, [])).toEqual(['weekday']);
    expect(activeServices('2026-09-14', calendar, [])).toEqual(['weekday']);
    expect(activeServices('2026-09-19', calendar, [])).toEqual([]);
    expect(activeServices('2026-09-21', calendar, [])).toEqual([]);
    expect(
      activeServices(date, calendar, [
        { service_id: 'weekday', date, exception_type: 2 },
        { service_id: 'special', date, exception_type: 1 },
      ]),
    ).toEqual(['special']);
    expect(
      activeServices(
        date,
        [],
        [{ service_id: 'special', date, exception_type: 1 }],
      ),
    ).toEqual(['special']);
    expect(() => activeServices('2026-02-30', calendar, [])).toThrow();
  });
  it('keeps >24h in the original service day and handles DST using noon minus 12h', () => {
    expect(new Date((serviceDayEpoch(date) + 90000) * 1000).toISOString()).toBe(
      '2026-09-19T06:00:00.000Z',
    );
    expect(new Date(serviceDayEpoch('2026-03-08') * 1000).toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(new Date(serviceDayEpoch('2026-11-01') * 1000).toISOString()).toBe(
      '2026-11-01T06:00:00.000Z',
    );
    expect(() => serviceDayEpoch('2026-02-30')).toThrow();
  });
});

describe('OTP normalization and witness validation', () => {
  const epoch = serviceDayEpoch(date);
  const otp: OtpItinerary = {
    startTime: (epoch + 86460) * 1000,
    endTime: (epoch + 86520) * 1000,
    numberOfTransfers: 0,
    legs: [
      {
        transitLeg: true,
        startTime: (epoch + 86460) * 1000,
        endTime: (epoch + 86520) * 1000,
        serviceDate: date,
        from: { stop: { gtfsId: 'dart:A' } },
        to: { stop: { gtfsId: 'dart:B' } },
        trip: { gtfsId: 'dart:t' },
        route: { gtfsId: 'dart:r' },
      },
    ],
  };
  it('normalizes epoch milliseconds without truncating overnight times or raw IDs', () => {
    expect(normalizeOtp(otp, date)).toEqual(journey);
    expect(() => normalizeOtp({ ...otp, startTime: NaN }, date)).toThrow();
    expect(() => normalizeOtp({ ...otp, numberOfTransfers: 1 }, date)).toThrow(
      /Transfer count|transfer count/,
    );
    expect(() =>
      normalizeOtp(
        { ...otp, legs: [{ ...otp.legs[0]!, transitLeg: false }] },
        date,
      ),
    ).toThrow(/walking/);
    expect(() =>
      normalizeOtp(
        { ...otp, legs: [{ ...otp.legs[0]!, trip: { gtfsId: 'other:t' } }] },
        date,
      ),
    ).toThrow(/namespace/);
  });
  it('replays repeated-stop occurrences, pickup/dropoff and boarding boundaries', () => {
    expect(validateItinerary(journey, schedule, 'A', 'B', 86460, 0)).toEqual(
      [],
    );
    expect(validateItinerary(journey, schedule, 'A', 'B', 86461, 0)).toContain(
      'Connection/chronology: t',
    );
    const backwards = {
      ...journey,
      rides: [
        { ...ride, from: 'B', to: 'A', departure: 86520, arrival: 86460 },
      ],
    };
    expect(
      validateItinerary(backwards, schedule, 'B', 'A', 86400, 0),
    ).toContain('No matching ordered visits: t');
    const prohibited = {
      ...journey,
      arrival: 86580,
      rides: [{ ...ride, to: 'C', arrival: 86580 }],
    };
    expect(
      validateItinerary(prohibited, schedule, 'A', 'C', 86400, 0),
    ).toContain('No matching ordered visits: t');
    expect(
      validateItinerary(
        { ...journey, rides: [{ ...ride, serviceDate: '2026-09-19' }] },
        schedule,
        'A',
        'B',
        86400,
        0,
      ),
    ).toContain('Adjacent service date: 2026-09-19');
  });
  it('rejects teleporting transfers, insufficient change time and inconsistent final times', () => {
    const double = {
      ...journey,
      transfers: 1,
      rides: [ride, { ...ride, departure: 86521, arrival: 86580 }],
    };
    const errors = validateItinerary(double, schedule, 'A', 'B', 86400, 0);
    expect(errors).toContain('Transfer count/bound');
    expect(errors).toContain('Connection/chronology: t');
    expect(errors).toContain('Endpoint times');
  });
});

describe('rider-visible comparison', () => {
  it('ignores trip identity but compares route, stop, departure and arrival structure', () => {
    expect(
      compare(
        [journey],
        [{ ...journey, rides: [{ ...ride, trip: 'equivalent-trip' }] }],
      ).status,
    ).toBe('agreement');
    for (const change of [
      { route: 'other' },
      { from: 'C' },
      { to: 'C' },
      { departure: 86470 },
    ]) {
      expect(
        compare([journey], [{ ...journey, rides: [{ ...ride, ...change }] }])
          .status,
      ).toBe('valid alternative itinerary');
    }
  });
  it('retains the earlier-transfer/later-direct frontier, ignores dominated later departures, and flags missing alternatives', () => {
    const faster = { ...journey, arrival: 86500, transfers: 1 };
    const later = { ...journey, arrival: 86600 };
    expect(frontier([journey, faster, later])).toEqual([journey, faster]);
    expect(compare([journey, faster], [later, faster, journey]).status).toBe(
      'agreement',
    );
    expect(compare([journey, faster], [journey]).status).toBe('unresolved');
    expect(
      compare([journey], [{ ...journey, arrival: journey.arrival + 1 }]).status,
    ).toBe('unresolved');
  });
  it('distinguishes no journey from existence disagreements', () => {
    expect(compare([], []).status).toBe('agreement');
    expect(compare([journey], []).status).toBe('unresolved');
    expect(compare([], [journey]).status).toBe('unresolved');
  });
  it('uses a closed departure search window without wrapping at midnight', () => {
    expect(inSearchWindow(journey, 86460)).toBe(true);
    expect(inSearchWindow(journey, 86461)).toBe(false);
    expect(inSearchWindow(journey, 79260)).toBe(true);
    expect(inSearchWindow(journey, 79259)).toBe(false);
  });
});

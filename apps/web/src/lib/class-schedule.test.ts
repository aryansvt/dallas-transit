import { describe, expect, it } from 'vitest';
import type { ClassSeries } from './ics';
import {
  classDestination,
  importSchedule,
  MAX_CLASSES,
  nextClass,
  ongoingClass,
  readSchedule,
  SCHEDULE_KEY,
  writeSchedule,
} from './class-schedule';
import { PRESETS_KEY, readPresets, setPreset, writePresets } from './presets';

const series = (extra: Partial<ClassSeries> = {}): ClassSeries => ({
  id: 'cs3345',
  title: 'CS 3345.001 Data Structures',
  location: 'ECSW 1.315',
  startDate: '2026-08-18',
  startTime: '10:00',
  minutes: 75,
  weekdays: [2, 4],
  interval: 1,
  until: '2026-12-03T23:59',
  exdates: ['2026-11-24T10:00', '2026-11-26T10:00'],
  ...extra,
});
const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
};
const broken = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('quota');
  },
};
const ics = (...events: string[]) =>
  [
    'BEGIN:VCALENDAR',
    ...events.map((e) =>
      ['BEGIN:VEVENT', e, 'DURATION:PT50M', 'END:VEVENT'].join('\r\n'),
    ),
    'END:VCALENDAR',
  ].join('\r\n');

describe('schedule storage', () => {
  it('round-trips classes under a versioned key', () => {
    const storage = memory();
    expect(writeSchedule(storage, [series()])).toBe(true);
    expect(JSON.parse(storage.data[SCHEDULE_KEY]!)).toMatchObject({
      version: 1,
    });
    expect(readSchedule(storage)).toEqual([series()]);
  });

  it.each([
    ['missing', undefined],
    ['corrupt', '{not json'],
    ['old version', JSON.stringify({ version: 2, classes: [series()] })],
    ['wrong shape', JSON.stringify({ version: 1, classes: 'x' })],
    ['oversized', JSON.stringify({ version: 1, pad: 'x'.repeat(300000) })],
  ])('reads %s data as no schedule', (_, raw) => {
    expect(
      readSchedule(memory(raw === undefined ? {} : { [SCHEDULE_KEY]: raw })),
    ).toEqual([]);
  });

  it('drops invalid classes and keeps the rest', () => {
    const raw = JSON.stringify({
      version: 1,
      classes: [
        series(),
        series({ id: 'bad-time', startTime: '25:00' }),
        series({ id: 'no-days', weekdays: [] }),
        series({ id: 'bad-minutes', minutes: 0 }),
        { id: 'partial' },
      ],
    });
    expect(
      readSchedule(memory({ [SCHEDULE_KEY]: raw })).map((c) => c.id),
    ).toEqual(['cs3345']);
  });

  it('survives storage that throws', () => {
    expect(readSchedule(broken)).toEqual([]);
    expect(writeSchedule(broken, [series()])).toBe(false);
  });
});

describe('importSchedule', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('keeps classes that still meet and counts the ones that ended', () => {
    const result = importSchedule(
      ics(
        'UID:ended\r\nDTSTART:20260818T100000\r\nSUMMARY:Orientation',
        'UID:weekly\r\nDTSTART:20260818T100000\r\nRRULE:FREQ=WEEKLY;COUNT=10',
        'UID:zoned\r\nDTSTART;TZID=Asia/Tokyo:20260818T100000',
      ),
      now,
    );
    expect(result.classes.map((c) => c.id)).toEqual(['weekly']);
    expect(result).toMatchObject({ ended: 1, skipped: { 'time-zone': 1 } });
  });

  it(`refuses more than ${MAX_CLASSES} upcoming classes`, () => {
    const many = Array.from(
      { length: MAX_CLASSES + 1 },
      (_, i) => `UID:c${i}\r\nDTSTART:20260902T100000`,
    );
    expect(() => importSchedule(ics(...many), now)).toThrow('too-many');
  });
});

describe('next and ongoing classes', () => {
  const classes = [
    series(),
    series({
      id: 'cs4349',
      location: 'JSOM 2.106',
      startTime: '13:00',
      weekdays: [1, 3],
    }),
  ];

  it('finds the next class across classes and over a weekend', () => {
    // Friday afternoon: next is Monday's 13:00 class
    expect(nextClass(classes, new Date('2026-09-04T20:00:00Z'))).toMatchObject({
      series: { id: 'cs4349' },
      start: new Date('2026-09-07T18:00:00Z'),
      end: new Date('2026-09-07T19:15:00Z'),
    });
  });

  it('skips a class that has started and excluded dates', () => {
    // Tuesday 10:30 in class; Thanksgiving week is excluded
    expect(
      nextClass(classes, new Date('2026-09-01T15:30:00Z'))?.series.id,
    ).toBe('cs4349');
    expect(
      nextClass([series()], new Date('2026-11-23T12:00:00Z'))?.start,
    ).toEqual(new Date('2026-12-01T16:00:00Z'));
  });

  it('looks two weeks ahead and no further', () => {
    expect(nextClass(classes, new Date('2026-12-04T12:00:00Z'))).toBeNull();
    expect(
      nextClass(
        [series({ until: '2027-12-31T23:59' })],
        new Date('2026-12-04T12:00:00Z'),
      )?.start,
    ).toEqual(new Date('2026-12-08T16:00:00Z'));
  });

  it('reports the class under way, ending exclusively', () => {
    expect(
      ongoingClass(classes, new Date('2026-09-01T15:30:00Z')),
    ).toMatchObject({
      series: { id: 'cs3345' },
      end: new Date('2026-09-01T16:15:00Z'),
    });
    expect(ongoingClass(classes, new Date('2026-09-01T16:15:00Z'))).toBeNull();
  });
});

describe('classDestination', () => {
  it('uses the verified entrance of a known building', () => {
    expect(classDestination(series())).toEqual({
      place: {
        name: 'ECSW 1.315',
        context: 'Engineering and Computer Science West, UT Dallas',
        latitude: 32.98658,
        longitude: -96.752007,
      },
    });
  });

  it('names a building without an official entrance, and nothing else', () => {
    expect(classDestination(series({ location: 'ROC 2.103' }))).toEqual({
      building: 'Research and Operations Center',
    });
    expect(classDestination(series({ location: 'Online' }))).toBeNull();
  });
});

describe('presets', () => {
  const home = { name: 'Home', latitude: 32.99, longitude: -96.75 };

  it('stores Home and School under a versioned key', () => {
    const storage = memory();
    const next = setPreset(
      setPreset(readPresets(storage), 'home', home),
      'school',
      { name: 'UT Dallas', latitude: 32.987, longitude: -96.748 },
    );
    expect(writePresets(storage, next)).toBe(true);
    expect(readPresets(storage)).toEqual(next);
    expect(JSON.parse(storage.data[PRESETS_KEY]!).version).toBe(1);
    expect(setPreset(next, 'home', null).home).toBeNull();
  });

  it('never stores a temporary place and survives bad data', () => {
    const empty = readPresets(memory());
    expect(setPreset(empty, 'home', { ...home, temporary: true })).toBe(empty);
    expect(readPresets(memory({ [PRESETS_KEY]: '[' }))).toEqual(empty);
    expect(
      readPresets(
        memory({
          [PRESETS_KEY]: JSON.stringify({ version: 1, home: { name: 1 } }),
        }),
      ),
    ).toEqual(empty);
    expect(readPresets(broken)).toEqual(empty);
    expect(writePresets(broken, empty)).toBe(false);
  });
});

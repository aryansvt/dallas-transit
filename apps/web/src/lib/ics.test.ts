import { describe, expect, it } from 'vitest';
import { IcsError, occurrences, parseIcs, type ClassSeries } from './ics';

const calendar = (...events: string[]) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    'X-WR-TIMEZONE:America/Chicago',
    'BEGIN:VTIMEZONE',
    'TZID:America/Chicago',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0500',
    'DTSTART:19700308T020000',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
const event = (...lines: string[]) =>
  ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
// a fall 2026 Tuesday/Thursday class with Thanksgiving week off
const dataStructures = event(
  'DTSTART;TZID=America/Chicago:20260818T100000',
  'DTEND;TZID=America/Chicago:20260818T111500',
  'RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20261204T055959Z;BYDAY=TU,TH',
  'EXDATE;TZID=America/Chicago:20261124T100000,20261126T100000',
  'UID:cs3345-001@example.edu',
  'SUMMARY:CS 3345.001 Data Structures',
  'LOCATION:ECSW 1.315',
);
const only = (text: string): ClassSeries => {
  const { classes } = parseIcs(text);
  expect(classes).toHaveLength(1);
  return classes[0]!;
};
const between = (series: ClassSeries, from: string, to: string) =>
  occurrences(series, new Date(from), new Date(to)).map(
    (o): [string, string] => [o.start.toISOString(), o.end.toISOString()],
  );
const at = (time: string, ...lines: string[]) =>
  calendar(
    event(
      `DTSTART${time}`,
      'DURATION:PT50M',
      'UID:x@example.edu',
      'SUMMARY:Class',
      ...lines,
    ),
  );

describe('parseIcs', () => {
  it('reads a weekly class as Dallas wall-clock time', () => {
    expect(only(calendar(dataStructures))).toEqual({
      id: 'cs3345-001@example.edu',
      title: 'CS 3345.001 Data Structures',
      location: 'ECSW 1.315',
      startDate: '2026-08-18',
      startTime: '10:00',
      minutes: 75,
      weekdays: [2, 4],
      interval: 1,
      until: '2026-12-03T23:59',
      exdates: ['2026-11-24T10:00', '2026-11-26T10:00'],
    });
  });

  it('reads UTC, floating and aliased Central times as Dallas time', () => {
    for (const time of [
      ':20260818T150000Z',
      ':20260818T100000',
      ';TZID="Central Standard Time":20260818T100000',
      ';TZID=US/Central:20260818T100000',
    ])
      expect(only(at(time))).toMatchObject({
        startDate: '2026-08-18',
        startTime: '10:00',
        minutes: 50,
        weekdays: [2],
        count: 1,
      });
  });

  it('skips and counts what it cannot place in Dallas time', () => {
    const result = parseIcs(
      calendar(
        dataStructures,
        event('DTSTART;TZID=Europe/London:20260818T100000', 'UID:a'),
        event('DTSTART;VALUE=DATE:20260818', 'UID:b', 'SUMMARY:Holiday'),
        event(
          'DTSTART:20260818T100000',
          'DURATION:PT1H',
          'RRULE:FREQ=DAILY;COUNT=3',
          'UID:c',
        ),
        event(
          'DTSTART:20260818T100000',
          'DURATION:PT1H',
          'STATUS:CANCELLED',
          'UID:d',
        ),
        event('DTSTART:2026-08-18 10:00', 'UID:e'),
        event('DTSTART:20260818T100000', 'DTEND:20260818T090000', 'UID:f'),
      ),
    );
    expect(result.classes.map((c) => c.id)).toEqual(['cs3345-001@example.edu']);
    expect(result.skipped).toEqual({
      'time-zone': 1,
      'all-day': 1,
      recurrence: 1,
      cancelled: 1,
      invalid: 2,
    });
  });

  it('unfolds long lines and unescapes text', () => {
    expect(
      only(
        calendar(
          event(
            'DTSTART:20260818T100000',
            'DURATION:PT1H15M',
            'UID:folded@example.edu',
            'SUMMARY:CS 4349.002 Advanced\\, Algorithm',
            ' s and Data Structures',
            'location:JSOM 2.106\\; overflow\\nroom',
          ),
        ),
      ),
    ).toMatchObject({
      title: 'CS 4349.002 Advanced, Algorithms and Data Structures',
      location: 'JSOM 2.106; overflow room',
      minutes: 75,
    });
  });

  it('applies a moved class from a RECURRENCE-ID override', () => {
    const { classes } = parseIcs(
      calendar(
        event(
          'DTSTART;TZID=America/Chicago:20260825T130000',
          'DTEND;TZID=America/Chicago:20260825T141500',
          'RECURRENCE-ID;TZID=America/Chicago:20260825T100000',
          'UID:cs3345-001@example.edu',
          'SUMMARY:CS 3345.001 Data Structures',
          'LOCATION:JSOM 1.118',
        ),
        dataStructures,
      ),
    );
    const [master, moved] = classes;
    expect(master!.exdates).toContain('2026-08-25T10:00');
    expect(moved).toMatchObject({
      id: 'cs3345-001@example.edu@2026-08-25T10:00',
      location: 'JSOM 1.118',
      startDate: '2026-08-25',
      startTime: '13:00',
      count: 1,
    });
  });

  it('drops one class cancelled through a RECURRENCE-ID override', () => {
    const { classes, skipped } = parseIcs(
      calendar(
        dataStructures,
        event(
          'DTSTART;TZID=America/Chicago:20260901T100000',
          'DTEND;TZID=America/Chicago:20260901T111500',
          'RECURRENCE-ID;TZID=America/Chicago:20260901T100000',
          'STATUS:CANCELLED',
          'UID:cs3345-001@example.edu',
        ),
      ),
    );
    expect(classes).toHaveLength(1);
    expect(classes[0]!.exdates).toContain('2026-09-01T10:00');
    expect(skipped).toEqual({ cancelled: 1 });
  });

  it.each([
    ['', 'not-calendar'],
    ['hello', 'not-calendar'],
    ['BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260818T100000', 'invalid'],
    [`BEGIN:VCALENDAR\r\n${'X'.repeat(1_000_001)}`, 'too-large'],
    [calendar(...Array(501).fill(dataStructures)), 'too-many'],
  ])('rejects a malformed or oversized file (%#)', (text, code) => {
    if (code === 'invalid')
      return expect(parseIcs(text)).toEqual({
        classes: [],
        skipped: { invalid: 1 },
      });
    expect(() => parseIcs(text)).toThrow(new IcsError(code as never));
  });
});

describe('occurrences', () => {
  const series = only(calendar(dataStructures));

  it('repeats on each weekday and keeps the wall clock across DST', () => {
    expect(
      between(series, '2026-10-28T00:00:00Z', '2026-11-04T00:00:00Z'),
    ).toEqual([
      ['2026-10-29T15:00:00.000Z', '2026-10-29T16:15:00.000Z'],
      ['2026-11-03T16:00:00.000Z', '2026-11-03T17:15:00.000Z'],
    ]);
  });

  it('skips excluded dates', () => {
    expect(
      between(series, '2026-11-23T00:00:00Z', '2026-11-30T00:00:00Z'),
    ).toEqual([]);
  });

  it('includes the last class on the UNTIL day and nothing after', () => {
    expect(
      between(series, '2026-12-01T00:00:00Z', '2027-01-01T00:00:00Z').map(
        ([start]) => start,
      ),
    ).toEqual(['2026-12-01T16:00:00.000Z', '2026-12-03T16:00:00.000Z']);
  });

  it('includes a class already under way at the window start', () => {
    expect(
      between(series, '2026-08-18T15:30:00Z', '2026-08-18T16:00:00Z'),
    ).toEqual([['2026-08-18T15:00:00.000Z', '2026-08-18T16:15:00.000Z']]);
  });

  it('counts excluded dates toward COUNT and honours INTERVAL', () => {
    const counted = only(
      at(
        ':20260818T100000',
        'RRULE:FREQ=WEEKLY;COUNT=3',
        'EXDATE:20260825T100000',
      ),
    );
    expect(
      between(counted, '2026-08-01T00:00:00Z', '2026-12-01T00:00:00Z').map(
        ([start]) => start.slice(0, 10),
      ),
    ).toEqual(['2026-08-18', '2026-09-01']);
    const biweekly = only(
      at(':20260818T100000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH'),
    );
    expect(
      between(biweekly, '2026-08-17T00:00:00Z', '2026-09-05T00:00:00Z').map(
        ([start]) => start.slice(0, 10),
      ),
    ).toEqual(['2026-08-18', '2026-08-20', '2026-09-01', '2026-09-03']);
  });

  it('treats a date-only UNTIL and EXDATE as whole Dallas days', () => {
    const series = only(
      at(
        ':20260818T100000',
        'RRULE:FREQ=WEEKLY;UNTIL=20260901',
        'EXDATE;VALUE=DATE:20260825',
      ),
    );
    expect(
      between(series, '2026-08-01T00:00:00Z', '2026-12-01T00:00:00Z').map(
        ([start]) => start.slice(0, 10),
      ),
    ).toEqual(['2026-08-18', '2026-09-01']);
  });
});

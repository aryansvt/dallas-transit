import { civilInstant, dallasParts, validDate } from './time';

/** One class in Dallas wall-clock time, so a 10:00 class stays at 10:00
 * across daylight saving time. Small enough to keep on the device. */
export interface ClassSeries {
  readonly id: string;
  readonly title: string;
  readonly location: string;
  readonly startDate: string;
  readonly startTime: string;
  readonly minutes: number;
  /** 0 is Sunday. */
  readonly weekdays: readonly number[];
  /** Weeks between repeats. */
  readonly interval: number;
  /** Last allowed start, inclusive, as YYYY-MM-DDTHH:MM. */
  readonly until?: string;
  readonly count?: number;
  /** Excluded starts as YYYY-MM-DDTHH:MM, or whole days as YYYY-MM-DD. */
  readonly exdates: readonly string[];
}
export type SkipReason =
  'all-day' | 'time-zone' | 'recurrence' | 'cancelled' | 'invalid';
export class IcsError extends Error {
  constructor(readonly code: 'not-calendar' | 'too-large' | 'too-many') {
    super(code);
  }
}

export const MAX_ICS_LENGTH = 1_000_000;
export const MAX_ICS_EVENTS = 500;
/** Recurrences stop this many days after the first class. */
export const MAX_SCAN_DAYS = 400;
const DAY = 86400000;
// floating times are read as Dallas time too
const DALLAS_ZONES = new Set([
  'America/Chicago',
  'Central Standard Time',
  'US/Central',
]);
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}
type Wall = { date: string; time?: string };

function property(line: string): Prop | null {
  // the value starts at the first colon outside a quoted parameter
  let quoted = false;
  let i = 0;
  for (; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) break;
  }
  if (i === line.length) return null;
  const [name = '', ...params] = line.slice(0, i).split(';');
  return {
    name: name.trim().toUpperCase(),
    params: Object.fromEntries(
      params.map((p) => {
        const [key = '', ...rest] = p.split('=');
        return [key.toUpperCase(), rest.join('=').replace(/^"|"$/g, '')];
      }),
    ),
    value: line.slice(i + 1),
  };
}

function wall(
  value: string,
  params: Record<string, string>,
): Wall | 'time-zone' | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(
    value.trim(),
  );
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!validDate(date)) return null;
  if (!m[4]) return { date };
  if (+m[4] > 23 || +m[5]! > 59 || +m[6]! > 60) return null;
  const time = `${m[4]}:${m[5]}`;
  if (m[7]) return dallasParts(new Date(`${date}T${time}:${m[6]}Z`));
  if (params.TZID && !DALLAS_ZONES.has(params.TZID)) return 'time-zone';
  return { date, time };
}

const text = (p?: Prop) =>
  (p?.value ?? '')
    .replace(/\\([\\;,nN])/g, (_, c: string) => ('nN'.includes(c) ? ' ' : c))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
const minutesBetween = (a: Wall, b: Wall) =>
  (Date.parse(`${b.date}T${b.time}:00Z`) -
    Date.parse(`${a.date}T${a.time}:00Z`)) /
  60000;
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** A class, a skip reason, or a moved or cancelled occurrence of a class. */
function build(
  props: Prop[],
):
  | { series: ClassSeries; recurrenceOf?: string }
  | { uid: string; cancelled: string }
  | SkipReason {
  const get = (name: string) => props.find((p) => p.name === name);
  const all = (name: string) => props.filter((p) => p.name === name);
  const uid = text(get('UID'));
  const recurrence = get('RECURRENCE-ID');
  const moved = recurrence && wall(recurrence.value, recurrence.params);
  if (get('STATUS')?.value.trim().toUpperCase() === 'CANCELLED')
    return moved && moved !== 'time-zone' && moved.time
      ? { uid, cancelled: `${moved.date}T${moved.time}` }
      : 'cancelled';
  const dtstart = get('DTSTART');
  const start = dtstart && wall(dtstart.value, dtstart.params);
  if (start === 'time-zone' || moved === 'time-zone') return 'time-zone';
  if (!start || (recurrence && !moved?.time)) return 'invalid';
  if (!start.time) return 'all-day';
  const dtend = get('DTEND');
  const end = dtend && wall(dtend.value, dtend.params);
  if (end === 'time-zone') return 'time-zone';
  const duration = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(
    get('DURATION')?.value.trim() ?? '',
  );
  const minutes = end
    ? end.time
      ? minutesBetween(start, end)
      : NaN
    : duration
      ? +(duration[1] ?? 0) * 60 +
        +(duration[2] ?? 0) +
        +(duration[3] ?? 0) / 60
      : NaN;
  if (!(minutes >= 1 && minutes <= 1440)) return 'invalid';
  let weekdays = [weekday(start.date)];
  let interval = 1;
  let until: string | undefined;
  let count: number | undefined = 1;
  const rule = get('RRULE');
  if (rule && !recurrence) {
    const parts = Object.fromEntries(
      rule.value.split(';').map((kv) => {
        const [key = '', value = ''] = kv.split('=');
        return [key.trim().toUpperCase(), value.trim().toUpperCase()];
      }),
    );
    if (parts.FREQ !== 'WEEKLY') return 'recurrence';
    count = undefined;
    if (parts.BYDAY) {
      const days = parts.BYDAY.split(',').map((d) => WEEKDAYS.indexOf(d));
      if (days.includes(-1)) return 'recurrence';
      weekdays = [...new Set(days)].sort((a, b) => a - b);
    }
    for (const [key, max] of [
      ['INTERVAL', 52],
      ['COUNT', MAX_SCAN_DAYS],
    ] as const) {
      if (parts[key] === undefined) continue;
      const n = Number(parts[key]);
      if (!Number.isInteger(n) || n < 1 || n > max) return 'invalid';
      if (key === 'INTERVAL') interval = n;
      else count = n;
    }
    if (parts.UNTIL) {
      const last = wall(parts.UNTIL, {});
      if (!last || last === 'time-zone') return 'invalid';
      until = `${last.date}T${last.time ?? '23:59'}`;
    }
  }
  const exdates: string[] = [];
  for (const p of all('EXDATE'))
    for (const value of p.value.split(',')) {
      const x = wall(value, p.params);
      if (x === 'time-zone') return 'time-zone';
      if (!x) return 'invalid';
      exdates.push(x.time ? `${x.date}T${x.time}` : x.date);
    }
  const movedFrom = moved ? `${moved.date}T${moved.time}` : undefined;
  return {
    series: {
      id: movedFrom
        ? `${uid}@${movedFrom}`
        : uid || `${start.date}T${start.time}`,
      title: text(get('SUMMARY')) || 'Class',
      location: text(get('LOCATION')),
      startDate: start.date,
      startTime: start.time,
      minutes: Math.round(minutes),
      weekdays,
      interval,
      ...(until ? { until } : {}),
      ...(count ? { count } : {}),
      exdates,
    },
    ...(movedFrom ? { recurrenceOf: movedFrom } : {}),
  };
}

/** Weekly classes from an iCalendar file. Events this cannot place exactly in
 * Dallas time are skipped and counted, never guessed. */
export function parseIcs(input: string): {
  classes: ClassSeries[];
  skipped: Partial<Record<SkipReason, number>>;
} {
  if (input.length > MAX_ICS_LENGTH) throw new IcsError('too-large');
  if (!/^﻿?\s*BEGIN:VCALENDAR/i.test(input)) throw new IcsError('not-calendar');
  const events: Prop[][] = [];
  let current: Prop[] | null = null;
  // alarms and other blocks inside an event are ignored
  let nested = 0;
  for (const line of input.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    const p = property(line);
    if (!p) continue;
    const kind = p.value.trim().toUpperCase();
    if (p.name === 'BEGIN') {
      if (current) nested++;
      else if (kind === 'VEVENT') {
        if (events.length >= MAX_ICS_EVENTS) throw new IcsError('too-many');
        current = [];
      }
    } else if (p.name === 'END' && current) {
      if (nested) nested--;
      else if (kind === 'VEVENT') {
        events.push(current);
        current = null;
      }
    } else if (current && !nested) current.push(p);
  }
  const skipped: Partial<Record<SkipReason, number>> = {};
  const skip = (reason: SkipReason) =>
    (skipped[reason] = (skipped[reason] ?? 0) + 1);
  if (current) skip('invalid');
  const classes = new Map<string, ClassSeries>();
  const moves: { uid: string; from: string }[] = [];
  for (const props of events) {
    const built = build(props);
    if (typeof built === 'string') {
      skip(built);
      continue;
    }
    if ('cancelled' in built) {
      skip('cancelled');
      moves.push({ uid: built.uid, from: built.cancelled });
      continue;
    }
    if (classes.has(built.series.id)) continue;
    classes.set(built.series.id, built.series);
    if (built.recurrenceOf)
      moves.push({
        uid: built.series.id.slice(0, -built.recurrenceOf.length - 1),
        from: built.recurrenceOf,
      });
  }
  // a moved or cancelled class gives up its original slot
  for (const { uid, from } of moves) {
    const master = classes.get(uid);
    if (master)
      classes.set(uid, { ...master, exdates: [...master.exdates, from] });
  }
  return {
    classes: [...classes.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
    skipped,
  };
}

/** Classes that overlap [from, to), in order. */
export function occurrences(
  series: ClassSeries,
  from: Date,
  to: Date,
): { start: Date; end: Date }[] {
  const first = Date.parse(`${series.startDate}T12:00:00Z`);
  // weeks count from the Monday of the first class
  const monday = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY;
  const found: { start: Date; end: Date }[] = [];
  let n = 0;
  for (let day = first; day < first + MAX_SCAN_DAYS * DAY; day += DAY) {
    if (
      !series.weekdays.includes(new Date(day).getUTCDay()) ||
      Math.floor((day - monday) / (7 * DAY)) % series.interval
    )
      continue;
    const date = new Date(day).toISOString().slice(0, 10);
    const start = `${date}T${series.startTime}`;
    if (series.until && start > series.until) break;
    if (series.count && ++n > series.count) break;
    if (series.exdates.some((x) => start.startsWith(x))) continue;
    let instant: Date;
    try {
      instant = civilInstant(date, series.startTime);
    } catch {
      continue; // a skipped or repeated hour at a DST change
    }
    if (instant >= to) break;
    const end = new Date(instant.getTime() + series.minutes * 60000);
    if (end > from) found.push({ start: instant, end });
  }
  return found;
}

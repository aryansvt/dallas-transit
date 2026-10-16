import type { Place } from '@dallas-transit/shared';
import {
  IcsError,
  MAX_SCAN_DAYS,
  occurrences,
  parseIcs,
  type ClassSeries,
} from './ics';
import { matchBuilding } from './utd-buildings';

export const SCHEDULE_KEY = 'dallas-transit.schedule.v1';
export const MAX_CLASSES = 80;
/** Next-class trips arrive this many minutes before class starts. */
export const CLASS_BUFFER_MINUTES = 10;
/** Far enough to cover a weekend or a short break. */
export const NEXT_CLASS_DAYS = 14;
const DAY = 86400000;
export interface ClassTime {
  series: ClassSeries;
  start: Date;
  end: Date;
}

const wall = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const short = (v: unknown, max = 200): v is string =>
  typeof v === 'string' && v.length <= max;
const whole = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
function isClassSeries(v: unknown): v is ClassSeries {
  if (!v || typeof v !== 'object') return false;
  const c = v as Partial<ClassSeries>;
  return (
    short(c.id, 600) &&
    short(c.title) &&
    short(c.location) &&
    short(c.startDate) &&
    wall.test(`${c.startDate}T${c.startTime}`) &&
    whole(c.minutes, 1, 1440) &&
    Array.isArray(c.weekdays) &&
    c.weekdays.length > 0 &&
    c.weekdays.every((d) => whole(d, 0, 6)) &&
    whole(c.interval, 1, 52) &&
    (c.until === undefined || wall.test(c.until)) &&
    (c.count === undefined || whole(c.count, 1, MAX_SCAN_DAYS)) &&
    Array.isArray(c.exdates) &&
    c.exdates.length <= 400 &&
    c.exdates.every(
      (x) => typeof x === 'string' && (wall.test(x) || wall.test(`${x}T00:00`)),
    )
  );
}

/** Missing, corrupt or oversized data reads as no schedule. */
export function readSchedule(storage: Pick<Storage, 'getItem'>): ClassSeries[] {
  try {
    const raw = storage.getItem(SCHEDULE_KEY);
    if (!raw || raw.length > 200000) return [];
    const data = JSON.parse(raw) as { version?: unknown; classes?: unknown };
    if (data.version !== 1 || !Array.isArray(data.classes)) return [];
    return data.classes.filter(isClassSeries).slice(0, MAX_CLASSES);
  } catch {
    return [];
  }
}
export function writeSchedule(
  storage: Pick<Storage, 'setItem'>,
  classes: readonly ClassSeries[],
) {
  try {
    storage.setItem(SCHEDULE_KEY, JSON.stringify({ version: 1, classes }));
    return true;
  } catch {
    return false;
  }
}

/** Parse a calendar file and keep the classes that still meet. The file
 * itself is never stored. */
export function importSchedule(text: string, now: Date) {
  const { classes, skipped } = parseIcs(text);
  const later = new Date(now.getTime() + MAX_SCAN_DAYS * DAY);
  const upcoming = classes.filter((c) => occurrences(c, now, later).length);
  if (upcoming.length > MAX_CLASSES) throw new IcsError('too-many');
  return {
    classes: upcoming,
    skipped,
    ended: classes.length - upcoming.length,
  };
}

const earliest = (times: ClassTime[]) =>
  times.reduce<ClassTime | null>(
    (best, t) => (!best || t.start < best.start ? t : best),
    null,
  );
/** The next class to start after now, within NEXT_CLASS_DAYS. */
export function nextClass(
  classes: readonly ClassSeries[],
  now: Date,
): ClassTime | null {
  const until = new Date(now.getTime() + NEXT_CLASS_DAYS * DAY);
  return earliest(
    classes.flatMap((series) =>
      occurrences(series, now, until)
        .filter((o) => o.start > now)
        .slice(0, 1)
        .map((o) => ({ series, ...o })),
    ),
  );
}
/** The class under way at an instant; a class ends exclusively. */
export function ongoingClass(
  classes: readonly ClassSeries[],
  at: Date,
): ClassTime | null {
  const after = new Date(at.getTime() + 1);
  return earliest(
    classes.flatMap((series) =>
      occurrences(series, at, after)
        .filter((o) => o.start <= at)
        .map((o) => ({ series, ...o })),
    ),
  );
}

/** A trip destination for a class: a verified entrance, or the building name
 * when the official map has no entrance for it. */
export function classDestination(
  series: ClassSeries,
): { place: Place } | { building: string } | null {
  const found = matchBuilding(series.location);
  if (!found) return null;
  const { building, room } = found;
  if (!building.entrance) return { building: building.name };
  return {
    place: {
      name: room ? `${building.code} ${room}` : building.code,
      context: `${building.name}, UT Dallas`,
      latitude: building.entrance.latitude,
      longitude: building.entrance.longitude,
    },
  };
}

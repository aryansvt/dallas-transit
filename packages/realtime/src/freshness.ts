import type { Freshness, Snapshot } from './types.js';

// Two missed 60-second trip-update cycles age predictions; five expire them.
export function freshness(
  snapshot: Snapshot | null,
  now: number,
  entityTime?: number | null,
): Freshness {
  if (!snapshot) return 'UNAVAILABLE';
  if (snapshot.sourceTimestamp === null || entityTime === null)
    return 'SCHEDULED_FALLBACK';
  const timestamps = [
    snapshot.sourceTimestamp,
    snapshot.receivedAt,
    ...(entityTime === undefined ? [] : [entityTime]),
  ];
  if (timestamps.some((t) => t > now + 30)) return 'SCHEDULED_FALLBACK';
  const age = Math.max(...timestamps.map((t) => now - t));
  return age <= 120 ? 'LIVE' : age <= 300 ? 'AGING' : 'STALE';
}
export const usable = (state: Freshness) =>
  state === 'LIVE' || state === 'AGING';

/** GTFS service anchor is local noon minus twelve elapsed hours, including DST. */
export function serviceAnchor(date: string, timezone: string): number {
  const target = Date.parse(`${date}T12:00:00Z`);
  if (
    !Number.isFinite(target) ||
    new Date(target).toISOString().slice(0, 10) !== date
  )
    throw new Error('invalid-date');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
    );
    const wall = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    );
    if (wall === target) return (guess - 43200000) / 1000;
    guess += target - wall;
  }
  throw new Error('unsupported-timezone');
}

/** A GTFS time belongs to a service date, and never wraps at midnight. */
export interface ServiceTime {
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly secondsFromServiceDayStart: number;
}

export function parseServiceTime(value: string): ServiceTime {
  const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid GTFS time: ${JSON.stringify(value)}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const secondsFromServiceDayStart = hours * 3600 + minutes * 60 + seconds;
  if (
    !Number.isSafeInteger(secondsFromServiceDayStart) ||
    secondsFromServiceDayStart > 2147483647
  )
    throw new Error(
      `GTFS time exceeds signed 32-bit service seconds: ${JSON.stringify(value)}`,
    );
  return { hours, minutes, seconds, secondsFromServiceDayStart };
}

/** ISO date text, not a timezone-dependent JavaScript timestamp. */
export function parseGtfsDate(value: string): string {
  if (!/^\d{8}$/.test(value))
    throw new Error(`Invalid GTFS date: ${JSON.stringify(value)}`);
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (
    value.startsWith('0000') ||
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== iso
  ) {
    throw new Error(`Invalid GTFS date: ${JSON.stringify(value)}`);
  }
  return iso;
}

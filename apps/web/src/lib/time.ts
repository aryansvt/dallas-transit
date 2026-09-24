export const DALLAS_TIMEZONE = 'America/Chicago';
const civil = new Intl.DateTimeFormat('en-CA', {
  timeZone: DALLAS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const clock = new Intl.DateTimeFormat('en-US', {
  timeZone: DALLAS_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
});

export function dallasParts(instant: Date) {
  const p = Object.fromEntries(
    civil.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    second: Number(p.second),
  };
}
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}
export function shiftDate(date: string, days: number) {
  if (!validDate(date)) throw new Error('Choose a valid date.');
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
/** Enumerate the two Dallas UTC offsets, then round-trip through Intl. Reject DST gaps/folds. */
export function civilInstant(date: string, time: string): Date {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('Choose a valid date and time.');
  const wall = Date.parse(`${date}T${time}:00Z`);
  const candidates = [5, 6]
    .map((hours) => new Date(wall + hours * 3600000))
    .filter((instant) => {
      const p = dallasParts(instant);
      return p.date === date && p.time === time;
    });
  if (candidates.length !== 1)
    throw new Error(
      candidates.length === 0
        ? 'That time is skipped when Dallas clocks move forward. Choose another time.'
        : 'That time happens twice when Dallas clocks move back. Choose a time outside the repeated hour.',
    );
  return candidates[0]!;
}
/** GTFS measures service seconds from local noon minus twelve elapsed hours. */
export function serviceAnchor(serviceDate: string) {
  return civilInstant(serviceDate, '12:00').getTime() - 12 * 3600000;
}
export function departureAt(
  date: string,
  time: string,
  previousServiceDay = false,
) {
  const instant = civilInstant(date, time);
  const serviceDate = previousServiceDay ? shiftDate(date, -1) : date;
  const departureTime = Math.floor(
    (instant.getTime() - serviceAnchor(serviceDate)) / 1000,
  );
  if (departureTime < 0)
    throw new Error(
      'This early time needs the previous day’s overnight service. Select that option below.',
    );
  return { serviceDate, departureTime };
}
export function leaveNow(now = new Date()) {
  const serviceDate = dallasParts(now).date;
  const departureTime = Math.floor(
    (now.getTime() - serviceAnchor(serviceDate)) / 1000,
  );
  if (departureTime < 0)
    throw new Error(
      'Choose Depart at and the previous day’s overnight service for this early departure.',
    );
  return { serviceDate, departureTime };
}
export function serviceInstant(serviceDate: string, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 2147483647)
    throw new Error('Invalid journey time');
  return new Date(serviceAnchor(serviceDate) + seconds * 1000);
}
export function serviceTime(serviceDate: string, seconds: number) {
  const instant = serviceInstant(serviceDate, seconds);
  const actualDate = dallasParts(instant).date;
  const dayLabel =
    actualDate === serviceDate
      ? ''
      : actualDate === shiftDate(serviceDate, 1)
        ? 'next day'
        : new Intl.DateTimeFormat('en-US', {
            timeZone: DALLAS_TIMEZONE,
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }).format(instant);
  return { clock: clock.format(instant), dayLabel, iso: instant.toISOString() };
}
export function duration(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}
export function displayDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`));
}

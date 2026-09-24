import {
  parseGtfs,
  parseGtfsDate,
  type NormalizedRecord,
} from '@dallas-transit/gtfs';
import {
  buildSchedule,
  type ScheduledTrip,
  type StopEvent,
} from '@dallas-transit/router';
import { openArchive } from '../archive.js';

export const DART_SHA256 =
  '799d22360a94f4ee683c238ab0f0f467922e29a1b45671f87d4895865a55c46f';
type Calendar = NormalizedRecord<'calendar.txt'>;
type Exception = NormalizedRecord<'calendar_dates.txt'>;

/** Exceptions override the inclusive weekly calendar; a dates-only feed is valid. */
export function activeServices(
  date: string,
  calendar: readonly Calendar[],
  exceptions: readonly Exception[],
): string[] {
  parseGtfsDate(date.replaceAll('-', ''));
  const weekday = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;
  const day = weekday[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
  const active = new Set(
    calendar
      .filter((c) => c.start_date <= date && date <= c.end_date && c[day] === 1)
      .map((c) => c.service_id),
  );
  for (const exception of exceptions) {
    if (exception.date !== date) continue;
    if (exception.exception_type === 1) active.add(exception.service_id);
    else active.delete(exception.service_id);
  }
  return [...active].sort();
}

/** Developer-only archive adapter. No activation, SQL, or production exports. */
export async function readReferenceFeed(path: string) {
  const archive = await openArchive(path);
  try {
    if (archive.hash !== DART_SHA256)
      throw new Error(
        'Reference corpus requires the retained DART recent ZIP SHA-256; refusing a different publication',
      );
    const calendar: Calendar[] = [];
    const exceptions: Exception[] = [];
    const stops: NormalizedRecord<'stops.txt'>[] = [];
    const trips: ScheduledTrip[] = [];
    const events = new Map<string, StopEvent[]>();
    for await (const { data } of parseGtfs(
      'agency.txt',
      archive.read('agency.txt'),
    )) {
      if (data.agency_timezone !== 'America/Chicago')
        throw new Error('Unexpected feed timezone');
    }
    if (archive.has('calendar.txt'))
      for await (const { data } of parseGtfs(
        'calendar.txt',
        archive.read('calendar.txt'),
      ))
        calendar.push(data);
    if (archive.has('calendar_dates.txt'))
      for await (const { data } of parseGtfs(
        'calendar_dates.txt',
        archive.read('calendar_dates.txt'),
      ))
        exceptions.push(data);
    for await (const { data } of parseGtfs(
      'stops.txt',
      archive.read('stops.txt'),
    ))
      stops.push(data);
    for await (const { data } of parseGtfs(
      'trips.txt',
      archive.read('trips.txt'),
    )) {
      const visits: StopEvent[] = [];
      events.set(data.trip_id, visits);
      trips.push({
        id: data.trip_id,
        routeId: data.route_id,
        serviceId: data.service_id,
        events: visits,
      });
    }
    for await (const { data } of parseGtfs(
      'stop_times.txt',
      archive.read('stop_times.txt'),
    )) {
      const visits = events.get(data.trip_id);
      if (!visits) throw new Error(`Unknown trip ${data.trip_id}`);
      visits.push({
        stopId: data.stop_id,
        sequence: data.stop_sequence,
        arrival: data.arrival_time,
        departure: data.departure_time,
        pickup: (data.pickup_type ?? 0) as StopEvent['pickup'],
        dropOff: (data.drop_off_type ?? 0) as StopEvent['dropOff'],
      });
    }
    for (const visits of events.values())
      visits.sort((a, b) => a.sequence - b.sequence);
    return {
      hash: archive.hash,
      stops,
      trips,
      calendar,
      exceptions,
      schedule(date: string) {
        return buildSchedule({
          publicationId: archive.hash,
          serviceDate: date,
          activeServiceIds: activeServices(date, calendar, exceptions),
          stops: stops.map((s) => ({ id: s.stop_id, changeSeconds: 120 })),
          trips,
        });
      },
    };
  } finally {
    await archive.close();
  }
}

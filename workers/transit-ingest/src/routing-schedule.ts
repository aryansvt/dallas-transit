import { performance } from 'node:perf_hooks';
import {
  buildSchedule,
  type RoutingSchedule,
  type ScheduledTrip,
  type StopEvent,
} from '@dallas-transit/router';
import { parseGtfsDate } from '@dallas-transit/gtfs';
import type { Database } from './database.js';

export interface RoutingLoadOptions {
  readonly sourceKey: string;
  readonly serviceDate: string;
  /** Explicit scenario assumption; the current DART feed supplies no buffers. */
  readonly changeSeconds: number;
}

export type RoutingLoadResult =
  | { readonly status: 'no-publication'; readonly serviceDate: string }
  | {
      readonly status: 'loaded';
      readonly schedule: RoutingSchedule;
      readonly metrics: {
        readonly extractionMs: number;
        readonly buildMs: number;
        readonly totalMs: number;
        readonly stops: number;
        readonly patterns: number;
        readonly trips: number;
        readonly events: number;
        readonly untimedVisits: number;
        readonly conditionalPickupVisits: number;
        readonly conditionalDropOffVisits: number;
        /** Process snapshots, including runtime/adapter overhead; not peak memory. */
        readonly memoryBefore: {
          readonly rss: number;
          readonly heapUsed: number;
        };
        readonly memoryAfter: {
          readonly rss: number;
          readonly heapUsed: number;
        };
      };
    };

interface TripRow {
  trip_id: string;
  route_id: string;
  service_id: string;
}
interface EventRow {
  trip_id: string;
  stop_id: string;
  stop_sequence: number;
  arrival_time: number | null;
  departure_time: number | null;
  pickup_type: StopEvent['pickup'] | null;
  drop_off_type: StopEvent['dropOff'] | null;
}

/** Read-only adaptation on a dedicated, idle client (owns its transaction).
 * A repeatable-read snapshot keeps activation, services, trips and events coherent
 * even if another connection activates a correction or resets static data. */
export async function loadRoutingSchedule(
  db: Pick<Database, 'query'>,
  options: RoutingLoadOptions,
): Promise<RoutingLoadResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.serviceDate))
    throw new Error('Expected date YYYY-MM-DD');
  const day = parseGtfsDate(options.serviceDate.replaceAll('-', ''));
  if (
    !Number.isInteger(options.changeSeconds) ||
    options.changeSeconds < 0 ||
    options.changeSeconds > 2147483647
  )
    throw new Error(
      'changeSeconds must be a nonnegative signed-32-bit integer',
    );
  const started = performance.now();
  const { rss, heapUsed } = process.memoryUsage();
  const memoryBefore = { rss, heapUsed };
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const selected = await db.query<{ feed_id: string }>(
      `SELECT feed_id FROM static_gtfs.feed_activation WHERE source_key = $1 AND service_date = $2::date`,
      [options.sourceKey, day],
    );
    const publication = selected.rows[0];
    if (!publication) {
      await db.query('COMMIT');
      return { status: 'no-publication', serviceDate: day };
    }
    const feedId = publication.feed_id;
    // Evaluate the calendar function once per service, not once per stop event.
    const services = await db.query<{ service_id: string }>(
      `SELECT service_id FROM static_gtfs.services WHERE feed_id = $1
       AND static_gtfs.service_is_active(feed_id, service_id, $2::date) ORDER BY service_id`,
      [feedId, day],
    );
    const activeServiceIds = services.rows.map((row) => row.service_id);
    const stopRows = await db.query<{ stop_id: string }>(
      'SELECT stop_id FROM static_gtfs.stops WHERE feed_id = $1 ORDER BY stop_id',
      [feedId],
    );
    const tripRows = await db.query<TripRow>(
      `SELECT trip_id, route_id, service_id FROM static_gtfs.trips
       WHERE feed_id = $1 AND service_id = ANY($2::text[]) ORDER BY trip_id`,
      [feedId, activeServiceIds],
    );
    const eventsByTrip = new Map<string, StopEvent[]>();
    const trips: ScheduledTrip[] = tripRows.rows.map((row) => {
      const events: StopEvent[] = [];
      eventsByTrip.set(row.trip_id, events);
      return {
        id: row.trip_id,
        routeId: row.route_id,
        serviceId: row.service_id,
        events,
      };
    });
    let untimedVisits = 0;
    let conditionalPickupVisits = 0;
    let conditionalDropOffVisits = 0;
    // Cursor limits transient pg row objects to 5000; no geometry or raw CSV loads.
    await db.query(
      `DECLARE routing_events NO SCROLL CURSOR FOR
       SELECT st.trip_id, st.stop_id, st.stop_sequence, st.arrival_time, st.departure_time,
              st.pickup_type, st.drop_off_type
       FROM static_gtfs.stop_times st JOIN static_gtfs.trips t USING (feed_id, trip_id)
       WHERE st.feed_id = $1 AND t.service_id = ANY($2::text[])
       ORDER BY st.trip_id, st.stop_sequence`,
      [feedId, activeServiceIds],
    );
    for (;;) {
      const batch = await db.query<EventRow>(
        'FETCH FORWARD 5000 FROM routing_events',
      );
      if (!batch.rows.length) break;
      for (const row of batch.rows) {
        const events = eventsByTrip.get(row.trip_id);
        if (!events)
          throw new Error('Routing extraction encountered an unselected trip');
        const pickup = row.pickup_type ?? 0;
        const dropOff = row.drop_off_type ?? 0;
        if (row.arrival_time === null || row.departure_time === null)
          untimedVisits++;
        if (pickup >= 2) conditionalPickupVisits++;
        if (dropOff >= 2) conditionalDropOffVisits++;
        events.push({
          stopId: row.stop_id,
          sequence: row.stop_sequence,
          arrival: row.arrival_time,
          departure: row.departure_time,
          pickup,
          dropOff,
        });
      }
    }
    await db.query('CLOSE routing_events');
    await db.query('COMMIT');
    const extractionMs = performance.now() - started;
    const buildStarted = performance.now();
    const schedule = buildSchedule({
      publicationId: feedId,
      serviceDate: day,
      activeServiceIds,
      stops: stopRows.rows.map((row) => ({
        id: row.stop_id,
        changeSeconds: options.changeSeconds,
      })),
      trips,
    });
    const buildMs = performance.now() - buildStarted;
    const memory = process.memoryUsage();
    return {
      status: 'loaded',
      schedule,
      metrics: {
        extractionMs,
        buildMs,
        totalMs: performance.now() - started,
        stops: schedule.stops.length,
        patterns: schedule.patterns.length,
        trips: schedule.trips.length,
        events: schedule.eventCount,
        untimedVisits,
        conditionalPickupVisits,
        conditionalDropOffVisits,
        memoryBefore,
        memoryAfter: { rss: memory.rss, heapUsed: memory.heapUsed },
      },
    };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

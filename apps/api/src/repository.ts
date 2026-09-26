import type { Coordinate, GeographicJourney } from '@dallas-transit/router';
import {
  loadRoutingSchedule,
  postgisCandidateSource,
  NEARBY_STOP_SQL,
  nearbyQueryParameters,
  type CandidateSource,
} from '@dallas-transit/transit-ingest/runtime';
import type { ApiConfig } from './config.js';
import { ApiDatabase } from './database.js';
import { ApiError } from './errors.js';
import { searchStops } from './stop-search.js';
import type { ScheduleSource } from './schedules.js';

import type {
  StopDetails,
  RouteDetails,
  TripDetails,
  References,
} from '@dallas-transit/shared';
export type {
  StopDetails,
  RouteDetails,
  TripDetails,
  References,
} from '@dallas-transit/shared';
export interface Readiness {
  database: boolean;
  schema: boolean;
  schedule: boolean;
}
export interface TransitRepository extends ScheduleSource {
  searchStops?(
    query: string,
    date: string,
    expected: string | undefined,
    signal: AbortSignal,
  ): Promise<import('@dallas-transit/shared').Place[]>;
  candidates: CandidateSource;
  readiness(signal: AbortSignal): Promise<Readiness>;
  metadata(
    kind: 'stop' | 'route',
    id: string,
    date: string,
    expected: string | undefined,
    signal: AbortSignal,
  ): Promise<{
    publicationId: string;
    serviceDate: string;
    data: StopDetails | RouteDetails;
  }>;
  nearby(
    point: Coordinate,
    date: string,
    signal: AbortSignal,
  ): Promise<{
    publicationId: string;
    serviceDate: string;
    stops: {
      stopId: string;
      name: string;
      coordinate: Coordinate;
      candidateDistanceMeters: number;
    }[];
  }>;
  references(
    publicationId: string,
    journeys: readonly GeographicJourney[],
    signal: AbortSignal,
  ): Promise<References>;
  close(): Promise<void>;
}

const stopColumns = `stop_id AS "stopId", stop_name AS name, stop_code AS code,
  platform_code AS "platformCode", parent_station AS "parentStationId",
  json_build_object('latitude',stop_lat::float8,'longitude',stop_lon::float8) AS coordinate`;
const routeColumns = `r.route_id AS "routeId", r.route_short_name AS "shortName", r.route_long_name AS "longName",
  r.route_type AS type, r.route_color AS color, r.route_text_color AS "textColor", a.agency_timezone AS "agencyTimezone"`;
export const STOP_LOOKUP_SQL = `SELECT ${stopColumns} FROM static_gtfs.stops WHERE feed_id=$1 AND stop_id=$2`;
export const ROUTE_LOOKUP_SQL = `SELECT ${routeColumns} FROM static_gtfs.routes r JOIN static_gtfs.agencies a USING(feed_id,agency_id) WHERE r.feed_id=$1 AND r.route_id=$2`;

export function postgresRepository(
  config: ApiConfig,
  database = new ApiDatabase(config),
  now: () => Date = () => new Date(),
): TransitRepository {
  const publication = async (
    db: Pick<import('pg').Client, 'query'>,
    date: string,
  ) => {
    const selected = await db.query<{ feed_id: string }>(
      'SELECT feed_id FROM static_gtfs.feed_activation WHERE source_key=$1 AND service_date=$2::date',
      [config.sourceKey, date],
    );
    return selected.rows[0]?.feed_id ?? null;
  };
  return {
    searchStops: (query, date, expected, signal) =>
      database.use(signal, (db) =>
        searchStops(db, config.sourceKey, query, date, expected),
      ),
    publication: (date, signal) =>
      database.use(signal, (db) => publication(db, date)),
    load: (date, signal) =>
      database.use(signal, async (db) => {
        const loaded = await loadRoutingSchedule(db, {
          sourceKey: config.sourceKey,
          serviceDate: date,
          changeSeconds: config.changeSeconds,
        });
        return loaded.status === 'loaded'
          ? { schedule: loaded.schedule, preparationMs: loaded.metrics.totalMs }
          : null;
      }),
    candidates: {
      find: (
        request,
        policy,
        expected,
        signal = new AbortController().signal,
      ) =>
        database.use(signal, (db) =>
          postgisCandidateSource(db, config.sourceKey).find(
            request,
            policy,
            expected,
            signal,
          ),
        ),
    },
    readiness: (signal) =>
      database.use(signal, async (db) => {
        await db.query('SELECT 1');
        const schema = await db.query<{ valid: boolean }>(`SELECT
        to_regclass('public.transit_schema_migrations') IS NOT NULL
        AND to_regclass('static_gtfs.feed_activation') IS NOT NULL
        AND to_regclass('static_gtfs.stop_times') IS NOT NULL
        AND to_regclass('static_gtfs.stops_search_name') IS NOT NULL
        AND to_regprocedure('static_gtfs.service_is_active(uuid,text,date)') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_extension WHERE extname='postgis') AS valid`);
        if (!schema.rows[0]?.valid)
          return { database: true, schema: false, schedule: false };
        const ledger = await db.query<{ valid: boolean }>(
          `SELECT count(*) = 2 AS valid FROM public.transit_schema_migrations WHERE name IN ('001_static_gtfs.sql', '002_stop_search.sql')`,
        );
        if (!ledger.rows[0]?.valid)
          return { database: true, schema: false, schedule: false };
        // Validate the read surface without loading rows or preparing a schedule.
        await db.query(`SELECT s.stop_id, s.stop_lat, s.geom, r.route_id, t.trip_id, a.agency_timezone, st.arrival_time
        FROM static_gtfs.stops s, static_gtfs.routes r, static_gtfs.trips t, static_gtfs.agencies a, static_gtfs.stop_times st LIMIT 0`);
        const active = await db.query<{ valid: boolean }>(
          'SELECT EXISTS (SELECT 1 FROM static_gtfs.feed_activation WHERE source_key=$1 AND service_date=$2::date) AS valid',
          [
            config.sourceKey,
            new Intl.DateTimeFormat('en-CA', {
              timeZone: 'America/Chicago',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(now()),
          ],
        );
        return {
          database: true,
          schema: true,
          schedule: active.rows[0]!.valid,
        };
      }),
    metadata: (kind, id, date, expected, signal) =>
      database.use(signal, async (db) => {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const feed = await publication(db, date);
        if (!feed) throw new ApiError('NO_PUBLICATION');
        if (expected && expected !== feed)
          throw new ApiError('PUBLICATION_CHANGED');
        const rows =
          kind === 'stop'
            ? await db.query<StopDetails>(STOP_LOOKUP_SQL, [feed, id])
            : await db.query<RouteDetails>(ROUTE_LOOKUP_SQL, [feed, id]);
        await db.query('COMMIT');
        const data = rows.rows[0];
        if (!data) throw new ApiError('NOT_FOUND');
        return { publicationId: feed, serviceDate: date, data };
      }),
    nearby: (point, date, signal) =>
      database.use(signal, async (db) => {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const feed = await publication(db, date);
        if (!feed) throw new ApiError('NO_PUBLICATION');
        const rows = await db.query<{
          stopId: string;
          name: string;
          latitude: number;
          longitude: number;
          distance: number;
        }>(NEARBY_STOP_SQL, [...nearbyQueryParameters(feed, point, 1200, 8)]);
        await db.query('COMMIT');
        return {
          publicationId: feed,
          serviceDate: date,
          stops: rows.rows.map((s) => ({
            stopId: s.stopId,
            name: s.name,
            coordinate: { latitude: s.latitude, longitude: s.longitude },
            candidateDistanceMeters: s.distance,
          })),
        };
      }),
    references: (feed, journeys, signal) =>
      database.use(signal, async (db) => {
        const stops = new Set<string>();
        const trips = new Set<string>();
        const routes = new Set<string>();
        for (const journey of journeys)
          for (const leg of journey.legs) {
            if (leg.kind === 'transit') {
              trips.add(leg.tripId);
              routes.add(leg.routeId);
              stops.add(leg.boardingStopId);
              stops.add(leg.alightingStopId);
            } else if (leg.kind === 'walk') stops.add(leg.stopId);
            else {
              stops.add(leg.fromStopId);
              stops.add(leg.toStopId);
            }
          }
        // Explicit publication keys remain coherent even if activation changes now.
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const stopRows = await db.query<StopDetails>(
          `SELECT ${stopColumns} FROM static_gtfs.stops WHERE feed_id=$1 AND stop_id=ANY($2::text[]) ORDER BY stop_id COLLATE "C"`,
          [feed, [...stops]],
        );
        const routeRows = await db.query<RouteDetails>(
          `SELECT ${routeColumns} FROM static_gtfs.routes r JOIN static_gtfs.agencies a USING(feed_id,agency_id) WHERE r.feed_id=$1 AND route_id=ANY($2::text[]) ORDER BY route_id COLLATE "C"`,
          [feed, [...routes]],
        );
        const tripRows = await db.query<TripDetails>(
          `SELECT trip_id AS "tripId", trip_headsign AS headsign, direction_id AS "directionId" FROM static_gtfs.trips WHERE feed_id=$1 AND trip_id=ANY($2::text[]) ORDER BY trip_id COLLATE "C"`,
          [feed, [...trips]],
        );
        if (
          stopRows.rows.length !== stops.size ||
          routeRows.rows.length !== routes.size ||
          tripRows.rows.length !== trips.size
        )
          throw new ApiError('DATABASE_UNAVAILABLE');
        await db.query('COMMIT');
        return {
          stops: stopRows.rows,
          routes: routeRows.rows,
          trips: tripRows.rows,
        };
      }),
    close: () => database.close(),
  };
}

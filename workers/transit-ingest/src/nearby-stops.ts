import { performance } from 'node:perf_hooks';
import {
  geographicPolicy,
  validateGeographicRequest,
  type Coordinate,
  type GeographicPolicy,
  type GeographicRequest,
} from '@dallas-transit/router';
import type { Database } from './database.js';

export interface NearbyStop {
  readonly publicationId: string;
  readonly stopId: string;
  readonly name: string;
  readonly coordinate: Coordinate;
  /** Geodesic pruning only. Never pedestrian route length. */
  readonly candidateDistanceMeters: number;
  readonly services?: readonly string[];
  readonly modes?: readonly number[];
}
export type NearbyResult =
  | {
      readonly status: 'unavailable';
      readonly reason: 'no-publication' | 'publication-changed';
    }
  | {
      readonly status: 'ok';
      readonly publicationId: string;
      readonly access: readonly NearbyStop[];
      readonly egress: readonly NearbyStop[];
      readonly originLookupMs: number;
      readonly destinationLookupMs: number;
    };

export interface CandidateSource {
  find(
    request: GeographicRequest,
    policy: GeographicPolicy,
    expectedPublicationId: string,
    signal?: AbortSignal,
  ): Promise<NearbyResult>;
}

// Geometry GiST bounds first; geography supplies accurate meter filtering/order.
// A geography cast alone cannot use Milestone 2's geometry expression index.
export const NEARBY_STOP_SQL = `
SELECT feed_id AS "publicationId", stop_id AS "stopId", stop_name AS name,
       stop_lat::float8 AS latitude, stop_lon::float8 AS longitude,
       ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) AS distance
FROM static_gtfs.stops
WHERE feed_id = $1 AND COALESCE(location_type,0) = 0
  AND (geom && ST_MakeEnvelope($4,$5,$6,$7,4326)
       OR geom && ST_MakeEnvelope($8,$5,$9,$7,4326))
  AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, $10)
ORDER BY distance, stop_id COLLATE "C"
LIMIT $11`;

/** Spatial shortlist plus date/permission eligibility. The separate station
 * envelope does not extend the ordinary bus search radius. */
export const SERVICE_CANDIDATE_SQL = `
WITH active AS MATERIALIZED (
 SELECT service_id FROM static_gtfs.services WHERE feed_id=$1
 AND static_gtfs.service_is_active(feed_id,service_id,$12::date)
), spatial AS (
 SELECT *, ST_Distance(geom::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) distance
 FROM static_gtfs.stops WHERE feed_id=$1 AND COALESCE(location_type,0)=0
 AND (geom && ST_MakeEnvelope($4,$5,$6,$7,4326) OR geom && ST_MakeEnvelope($8,$5,$9,$7,4326))
 AND ST_DWithin(geom::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,$10)
), eligible AS (
 SELECT s.feed_id AS "publicationId", s.stop_id AS "stopId",s.stop_name AS name,
 s.stop_lat::float8 latitude,s.stop_lon::float8 longitude,s.distance,
 array_agg(DISTINCT t.route_id || ':' || COALESCE(t.direction_id::text,'?')) services,
 array_agg(DISTINCT r.route_type) modes,
 bool_or(r.route_type IN (0,1,2)) station
 FROM spatial s JOIN static_gtfs.stop_times st USING(feed_id,stop_id)
 JOIN static_gtfs.trips t USING(feed_id,trip_id)
 JOIN active a USING(service_id) JOIN static_gtfs.routes r USING(feed_id,route_id)
 WHERE CASE WHEN $14::boolean THEN COALESCE(st.pickup_type,0)=0 AND st.departure_time >= $13
 ELSE COALESCE(st.drop_off_type,0)=0 AND st.arrival_time >= $13 END
 GROUP BY s.feed_id,s.stop_id,s.stop_name,s.stop_lat,s.stop_lon,s.distance
), ranked AS (
 SELECT *,row_number() OVER(PARTITION BY station ORDER BY distance,"stopId" COLLATE "C") n
 FROM eligible WHERE distance <= $15 OR station
)
SELECT * FROM ranked WHERE n <= CASE WHEN station THEN 2 ELSE $11 END ORDER BY distance,"stopId" COLLATE "C"`;

/** Greedy service coverage: nearest first, then unseen modes, then unseen
 * route/direction signatures. Distance and ID break ties. No route IDs are policy. */
export function diversifyCandidates(
  stops: readonly NearbyStop[],
  limit: number,
): NearbyStop[] {
  const remaining = [...stops].sort(
    (a, b) =>
      a.candidateDistanceMeters - b.candidateDistanceMeters ||
      (a.stopId < b.stopId ? -1 : 1),
  );
  const result: NearbyStop[] = [],
    modes = new Set<number>(),
    services = new Set<string>();
  while (remaining.length && result.length < limit) {
    let chosen = 0;
    if (result.length)
      for (let i = 1; i < remaining.length; i++) {
        const score = (s: NearbyStop) => [
          (s.modes ?? []).some((m) => !modes.has(m)) ? 1 : 0,
          (s.modes ?? []).some((m) => [0, 1, 2].includes(m)) ? 1 : 0,
          (s.services ?? []).filter((r) => !services.has(r)).length,
        ];
        const a = score(remaining[i]!),
          b = score(remaining[chosen]!);
        if (
          a[0]! > b[0]! ||
          (a[0] === b[0] && (a[1]! > b[1]! || (a[1] === b[1] && a[2]! > b[2]!)))
        )
          chosen = i;
      }
    const s = remaining.splice(chosen, 1)[0]!;
    result.push(s);
    for (const m of s.modes ?? []) modes.add(m);
    for (const r of s.services ?? []) services.add(r);
  }
  return result;
}

/** Conservative WGS84 bounding rectangles, including poles/date-line wrapping.
 * 110000 m/degree is below the ellipsoid's minimum meridional degree length.
 * Longitude uses the most poleward latitude the radius can reach. These bounds
 * only prune SQL candidates; PostGIS computes every returned meter distance.
 */
export function nearbyQueryParameters(
  publicationId: string,
  point: Coordinate,
  radiusMeters: number,
  limit: number,
): readonly unknown[] {
  const latitudeDelta = radiusMeters / 110000;
  const south = Math.max(-90, point.latitude - latitudeDelta);
  const north = Math.min(90, point.latitude + latitudeDelta);
  const extremeLatitude = Math.max(Math.abs(south), Math.abs(north));
  const longitudeDelta =
    extremeLatitude === 90
      ? 180
      : Math.min(
          180,
          latitudeDelta / Math.cos((extremeLatitude * Math.PI) / 180),
        );
  let west = point.longitude - longitudeDelta;
  let east = point.longitude + longitudeDelta;
  let secondWest = west;
  let secondEast = east;
  if (longitudeDelta === 180) {
    west = secondWest = -180;
    east = secondEast = 180;
  } else if (west < -180) {
    secondWest = west + 360;
    secondEast = 180;
    west = -180;
  } else if (east > 180) {
    secondWest = -180;
    secondEast = east - 360;
    east = 180;
  }
  return [
    publicationId,
    point.longitude,
    point.latitude,
    west,
    south,
    east,
    north,
    secondWest,
    secondEast,
    radiusMeters,
    limit,
  ];
}

/** Dedicated idle client; both endpoints use one read-only activation snapshot.
 * A correction after schedule loading returns publication-changed, never mixed IDs.
 */
export function postgisCandidateSource(
  db: Pick<Database, 'query'>,
  sourceKey: string,
): CandidateSource {
  if (!sourceKey.trim()) throw new Error('sourceKey must be nonempty');
  return {
    async find(request, limits, expectedPublicationId) {
      validateGeographicRequest(request);
      const policy = geographicPolicy(limits);
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const selected = await db.query<{ feed_id: string }>(
          'SELECT feed_id FROM static_gtfs.feed_activation WHERE source_key=$1 AND service_date=$2::date',
          [sourceKey, request.serviceDate],
        );
        const publication = selected.rows[0]?.feed_id;
        if (!publication || publication !== expectedPublicationId) {
          await db.query('COMMIT');
          return {
            status: 'unavailable',
            reason: publication ? 'publication-changed' : 'no-publication',
          };
        }
        const lookup = async (coordinate: Coordinate, access: boolean) => {
          const started = performance.now();
          const rows = await db.query<{
            publicationId: string;
            stopId: string;
            name: string;
            latitude: number;
            longitude: number;
            distance: number;
            services: string[];
            modes: number[];
          }>(SERVICE_CANDIDATE_SQL, [
            ...nearbyQueryParameters(
              publication,
              coordinate,
              Math.max(policy.radiusMeters, policy.stationRadiusMeters ?? 2200),
              policy.shortlistLimit ?? 32,
            ),
            request.serviceDate,
            request.departureTime,
            access,
            policy.radiusMeters,
          ]);
          return {
            ms: performance.now() - started,
            stops: diversifyCandidates(
              rows.rows.map((row): NearbyStop => ({
                publicationId: row.publicationId,
                stopId: row.stopId,
                name: row.name,
                coordinate: {
                  latitude: row.latitude,
                  longitude: row.longitude,
                },
                candidateDistanceMeters: row.distance,
                services: row.services,
                modes: row.modes,
              })),
              policy.shortlistLimit ?? 32,
            ),
          };
        };
        const access = await lookup(request.origin, true);
        const egress = await lookup(request.destination, false);
        await db.query('COMMIT');
        return {
          status: 'ok',
          publicationId: publication,
          access: access.stops,
          egress: egress.stops,
          originLookupMs: access.ms,
          destinationLookupMs: egress.ms,
        };
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    },
  };
}

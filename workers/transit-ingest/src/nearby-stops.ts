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
  db: Database,
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
        const lookup = async (coordinate: Coordinate, count: number) => {
          const started = performance.now();
          const rows = await db.query<{
            publicationId: string;
            stopId: string;
            name: string;
            latitude: number;
            longitude: number;
            distance: number;
          }>(NEARBY_STOP_SQL, [
            ...nearbyQueryParameters(
              publication,
              coordinate,
              policy.radiusMeters,
              count,
            ),
          ]);
          return {
            ms: performance.now() - started,
            stops: rows.rows.map((row): NearbyStop => ({
              publicationId: row.publicationId,
              stopId: row.stopId,
              name: row.name,
              coordinate: { latitude: row.latitude, longitude: row.longitude },
              candidateDistanceMeters: row.distance,
            })),
          };
        };
        const access = await lookup(request.origin, policy.maxAccessCandidates);
        const egress = await lookup(
          request.destination,
          policy.maxEgressCandidates,
        );
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

import { copyPlace, isPlace, type Place } from '@dallas-transit/shared';
import type { Client } from 'pg';
import { ApiError } from './errors.js';

export const STOP_SEARCH_SQL = `SELECT stop_id AS "stopId", stop_name AS name,
  stop_lat::float8 AS latitude, stop_lon::float8 AS longitude
  FROM static_gtfs.stops
  WHERE feed_id=$1 AND to_tsvector('simple',regexp_replace(stop_name, '[^[:alnum:]]+', ' ', 'g')) @@ to_tsquery('simple',$2)
  ORDER BY CASE WHEN lower(stop_name)=lower($3) THEN 0
    WHEN starts_with(lower(stop_name),lower($3)) THEN 1 ELSE 2 END,
    lower(stop_name) COLLATE "C", stop_id COLLATE "C"
  LIMIT $4`;

export async function searchStops(
  db: Pick<Client, 'query'>,
  source: string,
  query: string,
  date: string,
  expected?: string,
): Promise<Place[]> {
  const q = query.trim();
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (q.length < 2 || q.length > 160 || words.length > 20)
    throw new ApiError('INVALID_REQUEST');
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout = '1500ms'");
  const active = await db.query<{ feed_id: string }>(
    'SELECT feed_id FROM static_gtfs.feed_activation WHERE source_key=$1 AND service_date=$2::date',
    [source, date],
  );
  const feed = active.rows[0]?.feed_id;
  if (!feed) throw new ApiError('NO_PUBLICATION');
  if (expected && expected !== feed) throw new ApiError('PUBLICATION_CHANGED');
  const rows = words.length
    ? (
        await db.query<{
          stopId: string;
          name: string;
          latitude: number;
          longitude: number;
        }>(STOP_SEARCH_SQL, [
          feed,
          words.map((w) => `${w}:*`).join(' & '),
          q,
          6,
        ])
      ).rows
    : [];
  const places = rows.map((row) => {
    const place = {
      name: row.name,
      context: `DART stop · ${row.stopId}`,
      latitude: row.latitude,
      longitude: row.longitude,
      transit: { stopId: row.stopId, publicationId: feed },
    };
    if (!isPlace(place)) throw new ApiError('DATABASE_UNAVAILABLE');
    return copyPlace(place);
  });
  await db.query('COMMIT');
  return places;
}

import { parseGtfsDate } from '@dallas-transit/gtfs';
import { transaction, type Database } from './database.js';

export function isoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Expected date YYYY-MM-DD');
  return parseGtfsDate(value.replaceAll('-', ''));
}

export async function activateFeed(
  db: Database,
  feedId: string,
  from: string,
  through: string,
): Promise<number> {
  const start = isoDate(from);
  const end = isoDate(through);
  return transaction(db, async () => {
    const result = await db.query<{ source_key: string; valid: boolean }>(
      `SELECT source_key,
      $2::date >= coverage_start AND $3::date <= coverage_end AND $2::date <= $3::date AND $3::date - $2::date <= 3660 AS valid
      FROM static_gtfs.feed_versions WHERE feed_id = $1`,
      [feedId, start, end],
    );
    const feed = result.rows[0];
    if (!feed?.valid)
      throw new Error(
        'Unknown feed or activation range outside its coverage (maximum 3661 dates)',
      );
    const activated = await db.query(
      `INSERT INTO static_gtfs.feed_activation (source_key, service_date, feed_id)
      SELECT $1, $2::date + n, $4::uuid FROM generate_series(0, $3::date - $2::date) AS n
      ON CONFLICT (source_key, service_date) DO UPDATE SET feed_id = EXCLUDED.feed_id, activated_at = now()`,
      [feed.source_key, start, end, feedId],
    );
    return activated.rowCount ?? 0;
  });
}

export async function inspectFeeds(
  db: Database,
  sourceKey: string,
  day?: string,
): Promise<unknown> {
  const publications = await db.query(
    `SELECT feed_id, source_key, archive_sha256, feed_version,
    coverage_start::text, coverage_end::text, max_service_seconds, row_counts, diagnostics, import_ms,
    (SELECT count(*)::integer FROM static_gtfs.feed_activation a WHERE a.feed_id = f.feed_id) AS activated_dates
    FROM static_gtfs.feed_versions f WHERE source_key = $1 ORDER BY imported_at`,
    [sourceKey],
  );
  if (!day) return publications.rows;
  const selection = await db.query(
    `SELECT a.feed_id, a.service_date::text, f.feed_version,
    (SELECT count(*)::integer FROM static_gtfs.trips t WHERE t.feed_id = a.feed_id
       AND static_gtfs.service_is_active(t.feed_id, t.service_id, a.service_date)) AS scheduled_trips
    FROM static_gtfs.feed_activation a JOIN static_gtfs.feed_versions f USING (feed_id)
    WHERE a.source_key = $1 AND a.service_date = $2::date`,
    [sourceKey, isoDate(day)],
  );
  return {
    publications: publications.rows,
    selection: selection.rows[0] ?? null,
  };
}

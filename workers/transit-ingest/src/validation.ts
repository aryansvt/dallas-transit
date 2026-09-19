import type { Database } from './database.js';

export async function validateImportedFeed(
  db: Database,
  feedId: string,
): Promise<Record<string, number>> {
  // A newly inserted feed UUID has no useful distribution statistics until this
  // transaction analyzes it. In particular, refreshes must not reuse estimates
  // that only describe the preceding publication.
  await db.query(
    'ANALYZE static_gtfs.trips, static_gtfs.stop_times, static_gtfs.shape_points, static_gtfs.shapes',
  );
  // GTFS file rows need not be sorted by trip or sequence. Validate after loading.
  const invalidTrip = await db.query<{
    trip_id: string;
    source_record: number;
  }>(
    `SELECT t.trip_id, t.source_record
    FROM static_gtfs.trips t WHERE t.feed_id = $1 AND NOT EXISTS (
      SELECT 1 FROM static_gtfs.stop_times s WHERE s.feed_id = t.feed_id AND s.trip_id = t.trip_id
    ) LIMIT 1`,
    [feedId],
  );
  if (invalidTrip.rows[0])
    throw new Error(
      `trips.txt record ${invalidTrip.rows[0].source_record}: trip ${invalidTrip.rows[0].trip_id} has no stop times`,
    );
  // One ordered window scan avoids joining the large stop_times table twice for
  // each trip's endpoints. This also handles interleaved/unsorted source rows.
  const endpoints = await db.query<{ source_record: number; trip_id: string }>(
    `SELECT source_record, trip_id FROM (
    SELECT source_record, trip_id, count(*) OVER visits AS visit_count,
      first_value(arrival_time) OVER visits AS first_time, last_value(arrival_time) OVER visits AS last_time
    FROM static_gtfs.stop_times WHERE feed_id = $1
    WINDOW visits AS (PARTITION BY trip_id ORDER BY stop_sequence ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
    ) s WHERE visit_count < 2 OR first_time IS NULL OR last_time IS NULL LIMIT 1`,
    [feedId],
  );
  if (endpoints.rows[0])
    throw new Error(
      `stop_times.txt record ${endpoints.rows[0].source_record}: trip ${endpoints.rows[0].trip_id} needs at least two visits and timed endpoints`,
    );
  const chronology = await db.query<{
    source_record: number;
    trip_id: string;
    stop_sequence: number;
  }>(
    `SELECT source_record, trip_id, stop_sequence FROM (
    SELECT source_record, trip_id, stop_sequence, arrival_time,
      max(departure_time) OVER (PARTITION BY trip_id ORDER BY stop_sequence ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS previous_departure
    FROM static_gtfs.stop_times WHERE feed_id = $1
    ) s WHERE arrival_time < previous_departure LIMIT 1`,
    [feedId],
  );
  if (chronology.rows[0])
    throw new Error(
      `stop_times.txt record ${chronology.rows[0].source_record}: backwards chronology for trip ${chronology.rows[0].trip_id} sequence ${chronology.rows[0].stop_sequence}`,
    );
  const shortShape = await db.query<{ shape_id: string }>(
    `SELECT shape_id FROM static_gtfs.shape_points WHERE feed_id = $1 GROUP BY shape_id HAVING count(*) < 2 LIMIT 1`,
    [feedId],
  );
  if (shortShape.rows[0])
    throw new Error(
      `shapes.txt: shape ${shortShape.rows[0].shape_id} has fewer than two points`,
    );
  await db.query(
    `UPDATE static_gtfs.shapes s SET geom = p.geom FROM (
    SELECT shape_id, ST_MakeLine(ST_SetSRID(ST_MakePoint(shape_pt_lon::double precision, shape_pt_lat::double precision),4326) ORDER BY shape_pt_sequence) AS geom
    FROM static_gtfs.shape_points WHERE feed_id = $1 GROUP BY shape_id
    ) p WHERE s.feed_id = $1 AND s.shape_id = p.shape_id`,
    [feedId],
  );
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  // Report known DART anomalies without modifying points, distances, or times.
  const result = await db.query<Record<string, number>>(
    `SELECT
    (SELECT count(*)::integer FROM static_gtfs.trips WHERE feed_id = $1 AND trip_headsign IS NULL) AS missing_headsigns,
    (SELECT count(*)::integer FROM static_gtfs.stops WHERE feed_id = $1 AND coalesce(wheelchair_boarding,0) = 0) AS unknown_stop_accessibility,
    (SELECT count(*)::integer FROM static_gtfs.stop_times WHERE feed_id = $1 AND (arrival_time > 86400 OR departure_time > 86400)) AS after_midnight_rows,
    (SELECT count(*)::integer FROM static_gtfs.stop_times WHERE feed_id = $1 AND arrival_time IS NULL) AS untimed_intermediate_rows,
    (SELECT count(*)::integer FROM static_gtfs.stop_times WHERE feed_id = $1 AND (pickup_type = 1 OR drop_off_type = 1)) AS restricted_visits,
    (SELECT count(*)::integer FROM (SELECT trip_id FROM static_gtfs.stop_times WHERE feed_id = $1 GROUP BY trip_id HAVING count(*) > count(DISTINCT stop_id)) r) AS trips_revisiting_stops,
    (SELECT count(*)::integer FROM static_gtfs.stop_times st JOIN static_gtfs.trips t USING (feed_id,trip_id)
      JOIN (SELECT shape_id, (array_agg(shape_dist_traveled ORDER BY shape_pt_sequence DESC))[1] AS final_distance
        FROM static_gtfs.shape_points WHERE feed_id = $1 GROUP BY shape_id) s USING (shape_id)
      WHERE st.feed_id = $1 AND st.shape_dist_traveled > s.final_distance) AS stop_distances_past_shape_end,
    (SELECT count(*)::integer FROM (
      SELECT shape_dist_traveled AS distance, lag(shape_dist_traveled) OVER (PARTITION BY trip_id ORDER BY stop_sequence) AS previous
      FROM static_gtfs.stop_times WHERE feed_id = $1) d WHERE distance = previous) AS equal_adjacent_stop_distances,
    (SELECT count(*)::integer FROM (
      SELECT shape_dist_traveled AS distance, lag(shape_dist_traveled) OVER (PARTITION BY shape_id ORDER BY shape_pt_sequence) AS previous
      FROM static_gtfs.shape_points WHERE feed_id = $1) d WHERE distance < previous) AS decreasing_shape_distances`,
    [feedId],
  );
  return result.rows[0] ?? {};
}

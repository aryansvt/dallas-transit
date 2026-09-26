import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectDatabase,
  localDatabaseUrl,
  migrate,
  resetStaticData,
  type Database,
} from './database.js';
import { importFeed, type ImportResult } from './importer.js';
import { activateFeed, inspectFeeds } from './activation.js';
import { fixtureFiles, writeZip } from './test-support.js';

const databaseName = `static_gtfs_test_${randomUUID().replaceAll('-', '')}`;
let admin: Database;
let db: Database;
let directory: string;
let original: ImportResult;
let archivePath: string;
const source = {
  sourceKey: 'fixture',
  sourceUrl: 'https://example.org/feed.zip',
  batchSize: 2,
};

beforeAll(async () => {
  const connection = process.env.TEST_DATABASE_URL ?? localDatabaseUrl;
  admin = await connectDatabase(connection);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  const isolated = new URL(connection);
  isolated.pathname = `/${databaseName}`;
  db = await connectDatabase(isolated.toString());
  directory = await mkdtemp(join(tmpdir(), 'gtfs-integration-'));
  archivePath = join(directory, 'original.zip');
  await writeZip(archivePath, await fixtureFiles());
  await migrate(db);
});

afterAll(async () => {
  if (db) await db.end();
  if (admin) {
    // Name is generated locally above; never accepts a user's database name.
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await admin.end();
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('static ingestion on real PostgreSQL/PostGIS', () => {
  it('applies each migration exactly once and has PostGIS', async () => {
    await migrate(db);
    expect(
      (
        await db.query<{ name: string }>(
          'SELECT name FROM public.transit_schema_migrations ORDER BY name',
        )
      ).rows.map((row) => row.name),
    ).toEqual([
      '001_static_gtfs.sql',
      '002_stop_search.sql',
      '003_pedestrian_interchanges.sql',
    ]);
    expect(
      (
        await db.query<{ version: string }>(
          'SELECT postgis_version() AS version',
        )
      ).rows[0]?.version,
    ).toMatch(/^3\./);
  });
  it('imports a multi-agency feed, source precision, loop visits, overnight times and optional values', async () => {
    original = await importFeed(db, { ...source, archivePath });
    expect(original.reused).toBe(false);
    expect(original.rowCounts).toMatchObject({
      'agency.txt': 2,
      'routes.txt': 2,
      'stops.txt': 3,
      'trips.txt': 3,
      'stop_times.txt': 7,
      'shapes.txt': 5,
      shapes: 2,
      services: 2,
    });
    const visits = await db.query(
      `SELECT stop_id, stop_sequence, arrival_time, departure_time, pickup_type, drop_off_type
      FROM static_gtfs.stop_times WHERE feed_id = $1 AND trip_id = 'night' ORDER BY stop_sequence`,
      [original.feedId],
    );
    expect(visits.rows).toEqual([
      {
        stop_id: 's1',
        stop_sequence: 1,
        arrival_time: 87300,
        departure_time: 87300,
        pickup_type: 0,
        drop_off_type: 0,
      },
      {
        stop_id: 's2',
        stop_sequence: 3,
        arrival_time: 91800,
        departure_time: 91860,
        pickup_type: 2,
        drop_off_type: 3,
      },
      {
        stop_id: 's1',
        stop_sequence: 5,
        arrival_time: 93960,
        departure_time: 93960,
        pickup_type: 0,
        drop_off_type: 0,
      },
    ]);
    expect(
      (
        await db.query(
          `SELECT stop_lat::text, ST_SRID(geom) AS srid FROM static_gtfs.stops WHERE feed_id = $1 AND stop_id = 's1'`,
          [original.feedId],
        )
      ).rows[0],
    ).toEqual({ stop_lat: '32.123456789012345678', srid: 4326 });
    expect(
      (
        await db.query(
          `SELECT trip_headsign, wheelchair_accessible, bikes_allowed FROM static_gtfs.trips WHERE feed_id = $1 AND trip_id = 'night'`,
          [original.feedId],
        )
      ).rows[0],
    ).toEqual({
      trip_headsign: null,
      wheelchair_accessible: null,
      bikes_allowed: null,
    });
    expect(
      (
        await db.query(
          `SELECT ST_NPoints(geom) AS points FROM static_gtfs.shapes WHERE feed_id = $1 AND shape_id = 'loop'`,
          [original.feedId],
        )
      ).rows[0]?.points,
    ).toBe(3);
    expect(
      (
        await db.query(
          `SELECT data->>'DIRECTIONNAME' AS label FROM static_gtfs.supplemental_records WHERE feed_id = $1 AND file_name = 'route_direction.txt' AND source_record = 2`,
          [original.feedId],
        )
      ).rows[0]?.label,
    ).toBe('CIRCULAR ');
    expect(
      (await db.query('SELECT * FROM static_gtfs.feed_activation')).rows,
    ).toHaveLength(0);
  });
  it('retains weekly service plus added and removed exceptions and never extrapolates dates', async () => {
    for (const [service, day, active] of [
      ['week', '2026-09-17', true],
      ['week', '2026-09-18', false],
      ['week', '2026-09-19', true],
      ['week', '2026-09-20', false],
      ['special', '2026-09-20', true],
      ['special', '2026-09-19', false],
      ['week', '2026-09-21', false],
    ] as const) {
      const result = await db.query(
        'SELECT static_gtfs.service_is_active($1,$2,$3) AS active',
        [original.feedId, service, day],
      );
      expect(result.rows[0]?.active, `${service} ${day}`).toBe(active);
    }
  });
  it('reports geometry/distance anomalies without modifying source distances', async () => {
    expect(original.diagnostics).toMatchObject({
      missing_headsigns: 1,
      unknown_stop_accessibility: 2,
      after_midnight_rows: 3,
      restricted_visits: 1,
      trips_revisiting_stops: 1,
      stop_distances_past_shape_end: 1,
      equal_adjacent_stop_distances: 1,
    });
    expect(
      (
        await db.query(
          `SELECT shape_dist_traveled::text AS distance FROM static_gtfs.stop_times WHERE feed_id = $1 AND trip_id = 'night' AND stop_sequence = 5`,
          [original.feedId],
        )
      ).rows[0]?.distance,
    ).toBe('2.1266');
  });
  it('reuses exact publication bytes without duplicating records', async () => {
    const again = await importFeed(db, { ...source, archivePath });
    expect(again.feedId).toBe(original.feedId);
    expect(again.reused).toBe(true);
    expect(
      (await db.query('SELECT * FROM static_gtfs.feed_versions')).rows,
    ).toHaveLength(1);
    expect(
      (await db.query('SELECT * FROM static_gtfs.stop_times')).rows,
    ).toHaveLength(7);
  });
  it('rejects out-of-coverage activation and activates an explicit inclusive date range', async () => {
    await expect(
      activateFeed(db, original.feedId, '2026-09-14', '2026-09-21'),
    ).rejects.toThrow('outside its coverage');
    expect(
      await activateFeed(db, original.feedId, '2026-09-14', '2026-09-20'),
    ).toBe(7);
    const inspection = await inspectFeeds(db, 'fixture', '2026-09-17');
    expect(inspection).toMatchObject({
      selection: { feed_id: original.feedId, scheduled_trips: 2 },
    });
    expect(await inspectFeeds(db, 'fixture', '2026-09-21')).toMatchObject({
      selection: null,
    });
  });
  it('isolates churned IDs and stages future data without replacing current or prior-night data', async () => {
    const files = await fixtureFiles();
    files['routes.txt'] = files['routes.txt']!.replace(
      'rail,TEST',
      'new-rail,TEST',
    );
    files['trips.txt'] = files['trips.txt']!.replace(
      'rail,week',
      'new-rail,week',
    );
    for (const file of ['calendar.txt', 'calendar_dates.txt', 'feed_info.txt'])
      files[file] = files[file]!.replaceAll('20260914', '20260921')
        .replaceAll('20260918', '20260925')
        .replaceAll('20260919', '20260926')
        .replaceAll('20260920', '20260927');
    files['feed_info.txt'] = files['feed_info.txt']!.replace(
      'synthetic-1',
      'synthetic-2',
    );
    const future = join(directory, 'future.zip');
    await writeZip(future, files);
    const imported = await importFeed(db, { ...source, archivePath: future });
    expect(imported.feedId).not.toBe(original.feedId);
    expect(await inspectFeeds(db, 'fixture', '2026-09-17')).toMatchObject({
      selection: { feed_id: original.feedId },
    });
    expect(await inspectFeeds(db, 'fixture', '2026-09-21')).toMatchObject({
      selection: null,
    });
    await activateFeed(db, imported.feedId, '2026-09-21', '2026-09-27');
    expect(await inspectFeeds(db, 'fixture', '2026-09-21')).toMatchObject({
      selection: { feed_id: imported.feedId },
    });
    expect(await inspectFeeds(db, 'fixture', '2026-09-20')).toMatchObject({
      selection: { feed_id: original.feedId },
    });
    const routes = await db.query(
      `SELECT feed_id,route_id FROM static_gtfs.routes WHERE route_short_name = 'BLUE' ORDER BY route_id`,
    );
    expect(routes.rows).toEqual([
      { feed_id: imported.feedId, route_id: 'new-rail' },
      { feed_id: original.feedId, route_id: 'rail' },
    ]);
  });
  it('replaces only requested dates for a corrected publication, even if feed_version is reused', async () => {
    const files = await fixtureFiles();
    files['info.txt'] += 'Correction\n';
    const path = join(directory, 'correction.zip');
    await writeZip(path, files);
    const corrected = await importFeed(db, { ...source, archivePath: path });
    expect(corrected.feedId).not.toBe(original.feedId);
    await activateFeed(db, corrected.feedId, '2026-09-18', '2026-09-19');
    expect(await inspectFeeds(db, 'fixture', '2026-09-18')).toMatchObject({
      selection: { feed_id: corrected.feedId },
    });
    expect(await inspectFeeds(db, 'fixture', '2026-09-17')).toMatchObject({
      selection: { feed_id: original.feedId },
    });
  });
  it.each([
    [
      'trip without visits',
      (files: Record<string, string>) => {
        files['stop_times.txt'] = files['stop_times.txt']!.split('\n')
          .filter((line) => !line.startsWith('event,'))
          .join('\n');
      },
      /trips.txt record .*has no stop times/,
    ],
    [
      'single visit trip',
      (files: Record<string, string>) => {
        files['stop_times.txt'] = files['stop_times.txt']!.split('\n')
          .filter((line) => !line.startsWith('event,12:30'))
          .join('\n');
      },
      /stop_times.txt record .*at least two visits/,
    ],
    [
      'untimed endpoint',
      (files: Record<string, string>) => {
        files['stop_times.txt'] = files['stop_times.txt']!.replace(
          'event,12:30:00,12:30:00',
          'event,,',
        );
      },
      /stop_times.txt record .*timed endpoints/,
    ],
    [
      'missing service',
      (files: Record<string, string>) => {
        files['trips.txt'] = files['trips.txt']!.replace(
          'bus,week,night',
          'bus,missing,night',
        );
      },
      /trips.txt records .*missing/,
    ],
    [
      'missing shape',
      (files: Record<string, string>) => {
        delete files['shapes.txt'];
      },
      /trips.txt records .*shape/,
    ],
    [
      'conflicting calendar exception',
      (files: Record<string, string>) => {
        files['calendar_dates.txt'] += 'week,20260918,1\n';
      },
      /calendar_dates.txt records .*duplicate/,
    ],
    [
      'foreign key',
      (files: Record<string, string>) => {
        files['stop_times.txt'] = files['stop_times.txt']!.replace(
          'event,12:30:00,12:30:00,s2',
          'event,12:30:00,12:30:00,missing',
        );
      },
      /stop_times.txt records .*missing/,
    ],
    [
      'duplicate occurrence',
      (files: Record<string, string>) => {
        files['stop_times.txt'] +=
          'night,26:06:00,26:06:00,s1,5,,0,0,2.1266,1\n';
      },
      /stop_times.txt records .*duplicate/,
    ],
    [
      'backwards chronology',
      (files: Record<string, string>) => {
        files['stop_times.txt'] = files['stop_times.txt']!.replace(
          '26:06:00,26:06:00',
          '24:00:00,24:00:00',
        );
      },
      /stop_times.txt record .*backwards chronology/,
    ],
    [
      'missing route',
      (files: Record<string, string>) => {
        files['trips.txt'] = files['trips.txt']!.replace(
          'bus,week,night',
          'missing,week,night',
        );
      },
      /trips.txt records .*missing/,
    ],
    [
      'ambiguous agency',
      (files: Record<string, string>) => {
        files['routes.txt'] = files['routes.txt']!.replace(
          'bus,TEST,a',
          'bus,TEST,',
        );
      },
      /agency_id is required/,
    ],
    [
      'invalid required time',
      (files: Record<string, string>) => {
        files['stop_times.txt'] = files['stop_times.txt']!.replace(
          '26:06:00',
          '26:60:00',
        );
      },
      /stop_times.txt record .*arrival_time/,
    ],
  ] as const)(
    'rolls back a failed %s import and leaves activation unchanged',
    async (_name, change, error) => {
      const before = (
        await db.query(
          'SELECT feed_id FROM static_gtfs.feed_versions ORDER BY feed_id',
        )
      ).rows;
      const activation = (
        await db.query(
          'SELECT * FROM static_gtfs.feed_activation ORDER BY service_date',
        )
      ).rows;
      const files = await fixtureFiles();
      change(files);
      const path = join(directory, 'invalid.zip');
      await writeZip(path, files);
      await expect(
        importFeed(db, { ...source, archivePath: path }),
      ).rejects.toThrow(error);
      expect(
        (
          await db.query(
            'SELECT feed_id FROM static_gtfs.feed_versions ORDER BY feed_id',
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await db.query(
            'SELECT * FROM static_gtfs.feed_activation ORDER BY service_date',
          )
        ).rows,
      ).toEqual(activation);
      expect(
        (
          await db.query(
            `SELECT error FROM static_gtfs.import_attempts WHERE status = 'failed' ORDER BY started_at DESC LIMIT 1`,
          )
        ).rows[0]?.error,
      ).toMatch(error);
    },
  );
  it('supports a calendar_dates-only feed with omitted agency IDs in a single-agency feed', async () => {
    const files = await fixtureFiles();
    files['agency.txt'] =
      'agency_name,agency_url,agency_timezone\nOnly Agency,https://example.org,America/Chicago\n';
    files['routes.txt'] = files['routes.txt']!.replace(
      'bus,TEST,a',
      'bus,TEST,',
    ).replace('rail,TEST,b', 'rail,TEST,');
    files['fare_attributes.txt'] = files['fare_attributes.txt']!.replace(
      'USD,0,,,a',
      'USD,0,,,',
    );
    files['calendar_dates.txt'] =
      'service_id,date,exception_type\nweek,20260917,1\nspecial,20260920,1\n';
    delete files['calendar.txt'];
    delete files['feed_info.txt'];
    const path = join(directory, 'exceptions.zip');
    await writeZip(path, files);
    const imported = await importFeed(db, {
      ...source,
      sourceKey: 'exceptions',
      archivePath: path,
    });
    expect(
      (
        await db.query(
          'SELECT coverage_start::text,coverage_end::text FROM static_gtfs.feed_versions WHERE feed_id = $1',
          [imported.feedId],
        )
      ).rows[0],
    ).toEqual({ coverage_start: '2026-09-17', coverage_end: '2026-09-20' });
    expect(
      (
        await db.query(
          'SELECT agency_id FROM static_gtfs.routes WHERE feed_id = $1',
          [imported.feedId],
        )
      ).rows,
    ).toEqual([{ agency_id: '' }, { agency_id: '' }]);
  });
  it('explicit reset removes static data while preserving schema and migration history', async () => {
    await resetStaticData(db);
    expect(
      (await db.query('SELECT * FROM static_gtfs.feed_versions')).rows,
    ).toEqual([]);
    expect(
      (await db.query('SELECT * FROM static_gtfs.stop_times')).rows,
    ).toEqual([]);
    expect(
      (await db.query('SELECT * FROM static_gtfs.feed_activation')).rows,
    ).toEqual([]);
    expect(
      (
        await db.query<{ name: string }>(
          'SELECT name FROM public.transit_schema_migrations ORDER BY name',
        )
      ).rows.map((row) => row.name),
    ).toEqual([
      '001_static_gtfs.sql',
      '002_stop_search.sql',
      '003_pedestrian_interchanges.sql',
    ]);
  });
  it('serializes concurrent identical imports into one complete publication', async () => {
    const connection = new URL(
      process.env.TEST_DATABASE_URL ?? localDatabaseUrl,
    );
    connection.pathname = `/${databaseName}`;
    const second = await connectDatabase(connection.toString());
    try {
      const results = await Promise.all([
        importFeed(db, { ...source, sourceKey: 'concurrent', archivePath }),
        importFeed(second, { ...source, sourceKey: 'concurrent', archivePath }),
      ]);
      expect(results[0].feedId).toBe(results[1].feedId);
      expect(results.map((r) => r.reused).sort()).toEqual([false, true]);
      expect(
        (await db.query('SELECT * FROM static_gtfs.feed_versions')).rows,
      ).toHaveLength(1);
      expect(
        (await db.query('SELECT * FROM static_gtfs.stop_times')).rows,
      ).toHaveLength(7);
    } finally {
      await second.end();
    }
  });
  it('refuses a checksum mismatch in an applied migration', async () => {
    await db.query(
      `UPDATE public.transit_schema_migrations SET sha256 = 'changed'`,
    );
    await expect(migrate(db)).rejects.toThrow('Applied migration changed');
  });
});

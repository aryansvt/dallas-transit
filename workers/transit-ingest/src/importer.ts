import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import {
  parseGtfs,
  schemas,
  supplementalFiles,
  type GtfsFile,
  type NormalizedRecord,
  type ParsedRecord,
} from '@dallas-transit/gtfs';
import { openArchive, type Archive } from './archive.js';
import { transaction, type Database } from './database.js';
import { validateImportedFeed } from './validation.js';

const tables = {
  'agency.txt': 'agencies',
  'routes.txt': 'routes',
  'stops.txt': 'stops',
  'calendar.txt': 'calendars',
  'calendar_dates.txt': 'calendar_dates',
  'shapes.txt': 'shape_points',
  'trips.txt': 'trips',
  'stop_times.txt': 'stop_times',
  'feed_info.txt': 'feed_info',
  'fare_attributes.txt': 'fare_attributes',
  'fare_rules.txt': 'fare_rules',
} as const;
const order: readonly GtfsFile[] = [
  'feed_info.txt',
  'agency.txt',
  'stops.txt',
  'routes.txt',
  'calendar.txt',
  'calendar_dates.txt',
  'shapes.txt',
  'trips.txt',
  'stop_times.txt',
  'fare_attributes.txt',
  'fare_rules.txt',
  ...supplementalFiles,
];

export interface ImportOptions {
  archivePath: string;
  sourceKey: string;
  sourceUrl: string;
  batchSize?: number;
  onProgress?: (file: GtfsFile, rows: number) => void;
}
export interface ImportResult {
  feedId: string;
  archiveSha256: string;
  reused: boolean;
  elapsedMs: number;
  rowCounts: Record<string, number>;
  diagnostics: Record<string, number>;
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const detail =
    error && typeof error === 'object' && 'detail' in error
      ? String(error.detail)
      : '';
  return `${message}${detail ? ` (${detail})` : ''}`;
}

async function insertBatch(
  db: Database,
  feedId: string,
  file: GtfsFile,
  batch: ParsedRecord<GtfsFile>[],
  agencyId: string | undefined,
): Promise<void> {
  try {
    if (supplementalFiles.includes(file)) {
      await db.query(
        `INSERT INTO static_gtfs.supplemental_records (feed_id, file_name, source_record, data)
        SELECT $1, $2, record, data FROM jsonb_to_recordset($3::jsonb) AS x(record integer, data jsonb)`,
        [
          feedId,
          file,
          JSON.stringify(batch.map((r) => ({ record: r.record, data: r.raw }))),
        ],
      );
      return;
    }
    const table = tables[file as keyof typeof tables];
    // Identifiers here are internal constants, never feed content or CLI arguments.
    const columns = [
      'feed_id',
      'source_record',
      'extra',
      ...Object.keys(schemas[file]),
    ].join(', ');
    const rows = batch.map((r) => {
      const data: Record<string, unknown> = { ...r.data };
      if (file === 'agency.txt' && data.agency_id === null) data.agency_id = '';
      if (
        (file === 'routes.txt' || file === 'fare_attributes.txt') &&
        data.agency_id === null
      ) {
        if (agencyId === undefined)
          throw new Error(
            `record ${r.record}: agency_id is required for a multi-agency feed`,
          );
        data.agency_id = agencyId;
      }
      return {
        ...data,
        feed_id: feedId,
        source_record: r.record,
        extra: r.extra,
      };
    });
    if (file === 'calendar.txt' || file === 'calendar_dates.txt') {
      await db.query(
        `INSERT INTO static_gtfs.services (feed_id, service_id)
        SELECT DISTINCT $1::uuid, service_id FROM jsonb_to_recordset($2::jsonb) AS x(service_id text) ON CONFLICT DO NOTHING`,
        [feedId, JSON.stringify(rows)],
      );
    }
    if (file === 'shapes.txt') {
      await db.query(
        `INSERT INTO static_gtfs.shapes (feed_id, shape_id)
        SELECT DISTINCT $1::uuid, shape_id FROM jsonb_to_recordset($2::jsonb) AS x(shape_id text) ON CONFLICT DO NOTHING`,
        [feedId, JSON.stringify(rows)],
      );
    }
    await db.query(
      `INSERT INTO static_gtfs.${table} (${columns})
      SELECT ${columns} FROM jsonb_populate_recordset(NULL::static_gtfs.${table}, $1::jsonb)`,
      [JSON.stringify(rows)],
    );
  } catch (error) {
    throw new Error(
      `${file} records ${batch[0]?.record}..${batch.at(-1)?.record}: ${errorText(error)}`,
      { cause: error },
    );
  }
}

async function load(
  db: Database,
  archive: Archive,
  feedId: string,
  options: ImportOptions,
): Promise<Pick<ImportResult, 'rowCounts' | 'diagnostics'>> {
  const rowCounts: Record<string, number> = {};
  let agencyId: string | undefined;
  let info: NormalizedRecord<'feed_info.txt'> | undefined;
  for (const file of order) {
    if (!archive.has(file)) continue;
    let count = 0;
    let batch: ParsedRecord<GtfsFile>[] = [];
    for await (const row of parseGtfs(file, archive.read(file))) {
      if (file === 'feed_info.txt')
        info = row.data as NormalizedRecord<'feed_info.txt'>;
      batch.push(row);
      count++;
      if (batch.length >= (options.batchSize ?? 2000)) {
        await insertBatch(db, feedId, file, batch, agencyId);
        batch = [];
      }
    }
    if (batch.length) await insertBatch(db, feedId, file, batch, agencyId);
    rowCounts[file] = count;
    if (file === 'agency.txt') {
      const agencies = await db.query<{ agency_id: string }>(
        'SELECT agency_id FROM static_gtfs.agencies WHERE feed_id = $1',
        [feedId],
      );
      if (
        agencies.rows.length === 0 ||
        (agencies.rows.length > 1 &&
          agencies.rows.some((a) => a.agency_id === ''))
      )
        throw new Error(
          'agency.txt: nonempty agency_id is required when more than one agency exists',
        );
      agencyId =
        agencies.rows.length === 1 ? agencies.rows[0]?.agency_id : undefined;
    }
    options.onProgress?.(file, count);
  }
  for (const file of [
    'agency.txt',
    'routes.txt',
    'stops.txt',
    'trips.txt',
    'stop_times.txt',
  ])
    if (!rowCounts[file])
      throw new Error(`${file}: required table has no records`);
  if (archive.has('info.txt')) {
    const chunks: Buffer[] = [];
    for await (const chunk of archive.read('info.txt')) chunks.push(chunk);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    await db.query(
      'INSERT INTO static_gtfs.supplemental_documents (feed_id,file_name,content) VALUES ($1,$2,$3)',
      [feedId, 'info.txt', content],
    );
  }
  const dates = await db.query<{ start: string | null; end: string | null }>(
    `SELECT min(start)::text AS start, max(finish)::text AS end FROM (
    SELECT start_date AS start, end_date AS finish FROM static_gtfs.calendars WHERE feed_id = $1
    UNION ALL SELECT date,date FROM static_gtfs.calendar_dates WHERE feed_id = $1 AND exception_type = 1
    ) d`,
    [feedId],
  );
  const start = info?.feed_start_date ?? dates.rows[0]?.start;
  const end = info?.feed_end_date ?? dates.rows[0]?.end;
  if (!start || !end)
    throw new Error(
      'No service coverage: calendar rows or added calendar_dates are required',
    );
  const diagnostics = await validateImportedFeed(db, feedId);
  const shapes = await db.query<{ count: number }>(
    'SELECT count(*)::integer AS count FROM static_gtfs.shapes WHERE feed_id = $1',
    [feedId],
  );
  const services = await db.query<{ count: number }>(
    'SELECT count(*)::integer AS count FROM static_gtfs.services WHERE feed_id = $1',
    [feedId],
  );
  rowCounts.shapes = shapes.rows[0]?.count ?? 0;
  rowCounts.services = services.rows[0]?.count ?? 0;
  await db.query(
    `UPDATE static_gtfs.feed_versions SET coverage_start = $2, coverage_end = $3, feed_version = $4,
    row_counts = $5::jsonb, diagnostics = $6::jsonb,
    max_service_seconds = (SELECT coalesce(max(departure_time),0) FROM static_gtfs.stop_times WHERE feed_id = $1)
    WHERE feed_id = $1`,
    [
      feedId,
      start,
      end,
      info?.feed_version ?? null,
      JSON.stringify(rowCounts),
      JSON.stringify(diagnostics),
    ],
  );
  return { rowCounts, diagnostics };
}

/** Idempotence is (logical source, exact ZIP bytes), never a raw GTFS identifier. */
export async function importFeed(
  db: Database,
  options: ImportOptions,
): Promise<ImportResult> {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(options.sourceKey))
    throw new Error(
      'sourceKey must be 1..64 lowercase letters/digits/underscore/hyphen',
    );
  const source = new URL(options.sourceUrl);
  if (
    !['https:', 'http:'].includes(source.protocol) ||
    source.username ||
    source.password ||
    source.search ||
    source.hash
  )
    throw new Error(
      'sourceUrl must be a public HTTP(S) URL without credentials, query, or fragment',
    );
  if (
    options.batchSize !== undefined &&
    (!Number.isInteger(options.batchSize) ||
      options.batchSize < 1 ||
      options.batchSize > 10000)
  )
    throw new Error('batchSize must be an integer in 1..10000');
  const started = performance.now();
  const archive = await openArchive(options.archivePath);
  const attempt = randomUUID();
  try {
    await db.query(
      `INSERT INTO static_gtfs.import_attempts (attempt_id,source_key,source_url,archive_sha256,status) VALUES ($1,$2,$3,$4,'running')`,
      [attempt, options.sourceKey, options.sourceUrl, archive.hash],
    );
    const result = await transaction(db, async () => {
      const existing = await db.query<{
        feed_id: string;
        row_counts: Record<string, number>;
        diagnostics: Record<string, number>;
      }>(
        `SELECT feed_id, row_counts, diagnostics FROM static_gtfs.feed_versions WHERE source_key = $1 AND archive_sha256 = $2`,
        [options.sourceKey, archive.hash],
      );
      if (existing.rows[0]) {
        await db.query(
          `UPDATE static_gtfs.import_attempts SET status = 'succeeded', finished_at = now(), feed_id = $2 WHERE attempt_id = $1`,
          [attempt, existing.rows[0].feed_id],
        );
        return {
          feedId: existing.rows[0].feed_id,
          reused: true,
          rowCounts: existing.rows[0].row_counts,
          diagnostics: existing.rows[0].diagnostics,
        };
      }
      const feedId = randomUUID();
      await db.query(
        `INSERT INTO static_gtfs.feed_versions (feed_id,source_key,source_url,archive_sha256,archive_name,coverage_start,coverage_end,manifest)
        VALUES ($1,$2,$3,$4,$5,'0001-01-01','0001-01-01',$6::jsonb)`,
        [
          feedId,
          options.sourceKey,
          options.sourceUrl,
          archive.hash,
          basename(options.archivePath),
          JSON.stringify(archive.manifest),
        ],
      );
      const loaded = await load(db, archive, feedId, options);
      await db.query(
        'UPDATE static_gtfs.feed_versions SET import_ms = $2 WHERE feed_id = $1',
        [feedId, Math.round(performance.now() - started)],
      );
      await db.query(
        `UPDATE static_gtfs.import_attempts SET status = 'succeeded', finished_at = now(), feed_id = $2 WHERE attempt_id = $1`,
        [attempt, feedId],
      );
      return { feedId, reused: false, ...loaded };
    });
    return {
      ...result,
      archiveSha256: archive.hash,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    try {
      await db.query(
        `UPDATE static_gtfs.import_attempts SET status = 'failed', finished_at = now(), error = $2 WHERE attempt_id = $1`,
        [attempt, errorText(error).slice(0, 4000)],
      );
    } catch (auditError) {
      throw new AggregateError(
        [error, auditError],
        `${errorText(error)}; unable to persist failure audit (attempt may remain running)`,
      );
    }
    throw error;
  } finally {
    await archive.close();
  }
}

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

export type Database = pg.Client;
export const localDatabaseUrl =
  'postgresql://dallas_dev:local_only_password@127.0.0.1:5432/dallas_transit';

export async function connectDatabase(
  connectionString: string,
): Promise<Database> {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    application_name: 'dallas-transit-static-ingest',
  });
  await client.connect();
  return client;
}

/** Serializes static data mutations, including migrations and explicit reset. */
export async function transaction<T>(
  db: Database,
  action: () => Promise<T>,
): Promise<T> {
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(74002)');
    const result = await action();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export async function migrate(db: Database): Promise<void> {
  const directory = new URL('../migrations/', import.meta.url);
  await transaction(db, async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS public.transit_schema_migrations (
      name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const name of (await readdir(directory))
      .filter((n) => /^\d+_.*\.sql$/.test(n))
      .sort()) {
      const sql = (await readFile(new URL(name, directory), 'utf8')).replaceAll(
        '\r\n',
        '\n',
      );
      const hash = createHash('sha256').update(sql).digest('hex');
      const previous = await db.query<{ sha256: string }>(
        'SELECT sha256 FROM public.transit_schema_migrations WHERE name = $1',
        [name],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].sha256 !== hash)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await db.query(sql);
      await db.query(
        'INSERT INTO public.transit_schema_migrations (name, sha256) VALUES ($1, $2)',
        [name, hash],
      );
    }
  });
}

export async function resetStaticData(db: Database): Promise<void> {
  await transaction(db, async () => {
    await db.query(
      'TRUNCATE static_gtfs.feed_versions, static_gtfs.import_attempts CASCADE',
    );
  });
}

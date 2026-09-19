import { parseArgs } from 'node:util';
import {
  connectDatabase,
  localDatabaseUrl,
  migrate,
  resetStaticData,
} from './database.js';
import { importFeed } from './importer.js';
import { activateFeed, inspectFeeds } from './activation.js';

const help = `Static GTFS ingestion (run from repository root):
  pnpm gtfs migrate
  pnpm gtfs import --archive <local.zip> --source-url <public-url> [--source dart]
  pnpm gtfs activate --feed <uuid> --from YYYY-MM-DD --through YYYY-MM-DD
  pnpm gtfs inspect [--source dart] [--date YYYY-MM-DD]
  pnpm gtfs reset-static-data --confirm-delete-static-data
DATABASE_URL defaults to the local Compose development database. Import stages only.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      archive: { type: 'string' },
      'source-url': { type: 'string' },
      source: { type: 'string', default: 'dart' },
      feed: { type: 'string' },
      from: { type: 'string' },
      through: { type: 'string' },
      date: { type: 'string' },
      'confirm-delete-static-data': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help || positionals.length === 0) {
    process.stdout.write(help);
    return;
  }
  const command = positionals[0];
  if (
    positionals.length !== 1 ||
    !['migrate', 'import', 'activate', 'inspect', 'reset-static-data'].includes(
      command ?? '',
    )
  )
    throw new Error(help);
  function required(
    name: 'archive' | 'source-url' | 'feed' | 'from' | 'through',
  ): string {
    const value = values[name];
    if (!value) throw new Error(`--${name} is required`);
    return value;
  }
  const db = await connectDatabase(
    process.env.DATABASE_URL ?? localDatabaseUrl,
  );
  try {
    let result: unknown;
    switch (command) {
      case 'migrate':
        await migrate(db);
        result = { migrated: true };
        break;
      case 'import':
        result = await importFeed(db, {
          archivePath: required('archive'),
          sourceUrl: required('source-url'),
          sourceKey: values.source,
          onProgress: (file, rows) =>
            process.stderr.write(`${file}: ${rows} rows\n`),
        });
        break;
      case 'activate':
        result = {
          activatedDates: await activateFeed(
            db,
            required('feed'),
            required('from'),
            required('through'),
          ),
        };
        break;
      case 'inspect':
        result = await inspectFeeds(db, values.source, values.date);
        break;
      case 'reset-static-data':
        if (!values['confirm-delete-static-data'])
          throw new Error(
            'Reset deletes ALL imported static publications and activations. Pass --confirm-delete-static-data explicitly.',
          );
        await resetStaticData(db);
        result = { staticDataDeleted: true };
        break;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await db.end();
  }
}

try {
  await main();
} catch (error) {
  let message = error instanceof Error ? error.message : String(error);
  if (process.env.DATABASE_URL)
    message = message.replaceAll(process.env.DATABASE_URL, '[DATABASE_URL]');
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

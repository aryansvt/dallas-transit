import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { parseServiceTime } from '@dallas-transit/gtfs';
import { route, DEFAULT_MAX_TRANSFERS } from '@dallas-transit/router';
import { connectDatabase, localDatabaseUrl } from './database.js';
import { loadRoutingSchedule } from './routing-schedule.js';
import { isoDate } from './activation.js';

const help = `Read-only routing integration validation (one schedule load, multiple queries):
pnpm routing:validate --date YYYY-MM-DD --change-seconds 120 --query origin,destination,HH:MM:SS [--query ...]
  --source dart       Logical source (default dart)
  --max-transfers 3   Maximum transfers per journey (default ${DEFAULT_MAX_TRANSFERS})
  --runs 1           Repetitions per query for timing (1-1000, default 1)
Change seconds must be explicit: this is a scenario assumption, not a verified station buffer.
Stop IDs are local to the date-selected publication. Times never wrap at midnight.
DATABASE_URL defaults to local Compose. No activation/import or geographic links are created.
`;

function nonnegative(value: string, name: string, max = 2147483647): number {
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > max
  )
    throw new Error(`Invalid ${name}`);
  return Number(value);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      date: { type: 'string' },
      source: { type: 'string', default: 'dart' },
      'change-seconds': { type: 'string' },
      'max-transfers': {
        type: 'string',
        default: String(DEFAULT_MAX_TRANSFERS),
      },
      runs: { type: 'string', default: '1' },
      query: { type: 'string', multiple: true },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return;
  }
  if (
    !values.date ||
    values['change-seconds'] === undefined ||
    !values.query?.length
  )
    throw new Error(help);
  const serviceDate = isoDate(values.date);
  const changeSeconds = nonnegative(values['change-seconds'], 'change-seconds');
  const maxTransfers = nonnegative(values['max-transfers'], 'max-transfers');
  const runs = nonnegative(values.runs, 'runs', 1000);
  if (runs === 0) throw new Error('runs must be positive');
  const queries = values.query.map((text) => {
    const fields = text.split(',');
    const [originStopId, destinationStopId, departure] = fields;
    if (
      fields.length !== 3 ||
      !originStopId ||
      !destinationStopId ||
      !departure
    )
      throw new Error('Expected --query origin,destination,HH:MM:SS');
    return {
      serviceDate,
      originStopId,
      destinationStopId,
      departureTime: parseServiceTime(departure).secondsFromServiceDayStart,
      maxTransfers,
    };
  });
  const db = await connectDatabase(
    process.env.DATABASE_URL ?? localDatabaseUrl,
  );
  try {
    const loaded = await loadRoutingSchedule(db, {
      sourceKey: values.source,
      serviceDate,
      changeSeconds,
    });
    if (loaded.status !== 'loaded') {
      process.stdout.write(`${JSON.stringify(loaded)}\n`);
      return;
    }
    const results = queries.map((request) => {
      const latencies: number[] = [];
      let result = route(loaded.schedule, request);
      // Time every requested repetition; the call above is an explicit warm-up.
      for (let run = 0; run < runs; run++) {
        const start = performance.now();
        result = route(loaded.schedule, request);
        latencies.push(performance.now() - start);
      }
      return { request, latencyMs: latencies, result };
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          publicationId: loaded.schedule.publicationId,
          serviceDate,
          changeSeconds,
          warmupRuns: 1,
          metrics: loaded.metrics,
          queries: results,
        },
        null,
        2,
      )}\n`,
    );
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

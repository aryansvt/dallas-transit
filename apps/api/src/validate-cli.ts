import { parseArgs } from 'node:util';
import type { GeographicRequest } from '@dallas-transit/router';
import type { WalkingProvider } from '@dallas-transit/transit-ingest/runtime';
import { buildApp } from './app.js';
import { readServerConfig } from './config.js';
import { apiFixture } from './fixture.js';
import { ApiDatabase } from './database.js';
import {
  postgresRepository,
  STOP_LOOKUP_SQL,
  ROUTE_LOOKUP_SQL,
} from './repository.js';

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'fixture' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'pnpm api:validate --mode fixture|retained-dart\nBoth modes use explicitly synthetic walking, no external walking requests.\nRetained mode only reads the existing September 18, 2026 DART activation.',
    );
    return;
  }
  if (!['fixture', 'retained-dart'].includes(values.mode))
    throw new Error('Invalid validation mode');
  const retained = values.mode === 'retained-dart';
  const config = readServerConfig(retained ? process.env : {});
  const fixture = apiFixture();
  const database = retained ? new ApiDatabase(config) : undefined;
  const repository = database
    ? postgresRepository(config, database)
    : fixture.repository;
  // Constant values are deliberately artificial, not straight-line approximations
  // or claims of street connectivity. This provider cannot be selected by server config.
  const synthetic: WalkingProvider = {
    id: 'synthetic-validation-only',
    async route(request, signal) {
      signal.throwIfAborted();
      return {
        status: 'ok',
        route: { ...request, durationSeconds: 60, distanceMeters: 100 },
      };
    },
  };
  const events: Record<string, unknown>[] = [];
  const started = performance.now();
  const memoryBefore = process.memoryUsage();
  const app = buildApp(
    {
      logger: {
        level: 'info',
        stream: {
          write(line) {
            events.push(JSON.parse(line) as Record<string, unknown>);
          },
        },
      },
    },
    {
      config,
      repository,
      walkingProvider: retained ? synthetic : fixture.provider,
    },
  );
  try {
    await app.ready();
    const health = await app.inject('/health');
    const ready = await app.inject('/ready');
    const startupMs = performance.now() - started;
    const inputs: { name: string; request: GeographicRequest }[] = retained
      ? [
          {
            name: 'West End to CityLine/Bush',
            request: {
              origin: { latitude: 32.7812, longitude: -96.8056 },
              destination: { latitude: 33.0024, longitude: -96.7029 },
              serviceDate: '2026-09-18',
              departureTime: 28800,
            },
          },
          {
            name: 'Rowlett to DFW',
            request: {
              origin: { latitude: 32.9043, longitude: -96.5632 },
              destination: { latitude: 32.9076, longitude: -97.0392 },
              serviceDate: '2026-09-18',
              departureTime: 28800,
            },
          },
        ]
      : [{ name: 'synthetic network', request: fixture.request }];
    const observations: unknown[] = [];
    let publicationId: string | undefined;
    for (const input of inputs)
      for (let sample = 1; sample <= 2; sample++) {
        const requestStarted = performance.now();
        const response = await app.inject({
          method: 'POST',
          url: '/v1/journeys',
          payload: input.request,
        });
        const totalMs = performance.now() - requestStarted;
        const body = response.json();
        publicationId = body.publicationId;
        const timing = events.findLast(
          (e) => e.endpoint === '/v1/journeys' && e.msg === 'request completed',
        );
        observations.push({
          scenario: input.name,
          sample,
          httpStatus: response.statusCode,
          status: body.status,
          returnedJourneys: body.journeys?.length ?? 0,
          publicationId,
          totalMs,
          timing,
          firstJourney: body.journeys?.[0],
          error: body.error,
        });
        if (response.statusCode !== 200 || body.status !== 'ok')
          process.exitCode = 1;
      }
    const metadata: unknown[] = [];
    for (const path of retained
      ? ['/v1/stops/22749', '/v1/routes/27253']
      : ['/v1/stops/A', '/v1/routes/bus']) {
      const at = performance.now();
      const response = await app.inject(`${path}?serviceDate=2026-09-18`);
      metadata.push({
        path,
        httpStatus: response.statusCode,
        totalMs: performance.now() - at,
        body: response.json(),
      });
      if (response.statusCode !== 200) process.exitCode = 1;
    }
    const queryPlans: unknown[] = [];
    if (database && publicationId)
      for (const [name, sql, id] of [
        ['stop', STOP_LOOKUP_SQL, '22749'],
        ['route', ROUTE_LOOKUP_SQL, '27253'],
      ] as const) {
        const plan = await database.use(new AbortController().signal, (db) =>
          db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, [
            publicationId,
            id,
          ]),
        );
        queryPlans.push({ name, plan: plan.rows[0]['QUERY PLAN'] });
      }
    console.log(
      JSON.stringify(
        {
          mode: values.mode,
          walking: 'SYNTHETIC ONLY',
          startupMs,
          healthStatus: health.statusCode,
          readinessStatus: ready.statusCode,
          readiness: ready.json(),
          observations,
          metadata,
          queryPlans,
          memorySnapshots: {
            before: memoryBefore,
            after: process.memoryUsage(),
          },
        },
        null,
        2,
      ),
    );
    if (health.statusCode !== 200 || ready.statusCode !== 200)
      process.exitCode = 1;
  } finally {
    await app.close();
  }
}
try {
  await main();
} catch {
  console.error(
    'API validation failed. Check mode, database availability and activation.',
  );
  process.exitCode = 1;
}

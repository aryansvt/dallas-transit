/* global AbortSignal */
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { planGeographicJourney } from '../workers/transit-ingest/dist/geographic-planner.js';
/** Local-only release diagnostics. Never imported by HTTP handlers.
 * Optional --validate-walks makes exactly six sequential Geoapify calls, no retry
 * and no persistence. Do not turn this into a network-wide preparation job. */
import { readFileSync } from 'node:fs';
import {
  connectDatabase,
  localDatabaseUrl,
  migrate,
} from '../workers/transit-ingest/dist/database.js';
import { loadRoutingSchedule } from '../workers/transit-ingest/dist/routing-schedule.js';
import { postgisCandidateSource } from '../workers/transit-ingest/dist/nearby-stops.js';
import {
  buildSchedule,
  route,
  composeGeographicJourneys,
} from '../packages/router/dist/index.js';
import { API_POLICY } from '../apps/api/dist/config.js';
import { geoapifyWalkingProvider } from '../apps/api/dist/geoapify-walking.js';
const args = new Set(process.argv.slice(2));
if (
  [...args].some(
    (a) => !['--validate-walks', '--prepare-local-copy', '--perf'].includes(a),
  )
)
  throw new Error('Unknown option');
const url = new URL(localDatabaseUrl); // Deliberately ignore DATABASE_URL/cloud credentials.
if (args.has('--prepare-local-copy')) {
  const admin = await connectDatabase(localDatabaseUrl);
  try {
    if (
      !(
        await admin.query(
          "SELECT 1 FROM pg_database WHERE datname='m9c_benchmark_20260926'",
        )
      ).rows.length
    )
      await admin.query(
        'CREATE DATABASE m9c_benchmark_20260926 TEMPLATE dallas_transit',
      );
  } finally {
    await admin.end();
  }
}
url.pathname = '/m9c_benchmark_20260926';
const db = await connectDatabase(url.toString());
try {
  if (args.has('--prepare-local-copy')) await migrate(db);
  const request = {
    serviceDate: '2026-09-26',
    departureTime: 40200,
    origin: { latitude: 32.993161, longitude: -96.749201 },
    destination: { latitude: 32.95033, longitude: -96.82058 },
  };
  const start = performance.now();
  const loaded = await loadRoutingSchedule(db, {
    sourceKey: 'dart',
    serviceDate: request.serviceDate,
    changeSeconds: 120,
  });
  if (loaded.status !== 'loaded')
    throw new Error('Retained publication not available');
  const schedule = loaded.schedule;
  console.log(
    'schedule',
    JSON.stringify({
      publication: schedule.publicationId,
      loadMs: performance.now() - start,
      metrics: loaded.metrics,
      links: schedule.transfers,
    }),
  );
  const candidates = await postgisCandidateSource(db, 'dart').find(
    request,
    API_POLICY,
    schedule.publicationId,
  );
  console.log(
    'eligible shortlists in selection order (first six proposed; remainder refill only)',
    JSON.stringify(
      candidates.status === 'ok'
        ? {
            access: candidates.access.map((s) => [
              s.stopId,
              Math.round(s.candidateDistanceMeters),
              s.services,
            ]),
            egress: candidates.egress.map((s) => [
              s.stopId,
              Math.round(s.candidateDistanceMeters),
              s.services,
            ]),
            lookupMs:
              candidates.originLookupMs + candidates.destinationLookupMs,
          }
        : candidates,
    ),
  );
  const matrix = [
    ['walking-gap', '34287', '18216', '2026-09-26', 40320, 3],
    ['silver', '33598', '33597', '2026-09-26', 40800, 3],
    ['bus-silver-gap', '33157', '33597', '2026-09-26', 40200, 3],
    ['rail-heavy', '32562', '32553', '2026-09-26', 28800, 3],
    ['short-local', '19754', '19756', '2026-09-18', 14700, 3],
    ['cross-Dallas', '26691', '15913', '2026-09-26', 28800, 3],
    ['weekend', '22749', '26895', '2026-09-26', 28800, 3],
    ['overnight', '33286', '15842', '2026-09-18', 86400, 3],
    ['diversity', '33221', '33318', '2026-09-18', 28800, 3],
    ['no-route', '32562', '32553', '2026-09-26', 28800, 0],
  ];
  const refs = await db.query(
    'SELECT route_id,route_short_name FROM static_gtfs.routes WHERE feed_id=$1',
    [schedule.publicationId],
  );
  const names = new Map(refs.rows.map((r) => [r.route_id, r.route_short_name]));
  const summarize = (r) =>
    r.status === 'ok'
      ? r.journeys.map((j) => ({
          arrival: j.arrivalTime,
          transfers: j.transferCount,
          walking: j.walkingDurationSeconds,
          risk: j.scheduledTransferRisk,
          routes: j.legs
            .filter((l) => l.kind === 'transit')
            .map((l) => names.get(l.routeId) ?? l.routeId),
        }))
      : r;
  const views = new Map([[schedule.serviceDate, loaded]]);
  for (const [
    name,
    originStopId,
    destinationStopId,
    serviceDate,
    departureTime,
    maxTransfers,
  ] of matrix) {
    let view = views.get(serviceDate);
    if (!view) {
      view = await loadRoutingSchedule(db, {
        sourceKey: 'dart',
        serviceDate,
        changeSeconds: 120,
      });
      views.set(serviceDate, view);
    }
    if (view.status !== 'loaded') {
      console.log(name, 'no publication');
      continue;
    }
    const t = performance.now();
    const result = route(view.schedule, {
      originStopId,
      destinationStopId,
      serviceDate,
      departureTime,
      maxTransfers,
    });
    console.log(
      name,
      JSON.stringify({
        ms: performance.now() - t,
        result: summarize(result),
        rss: process.memoryUsage().rss,
      }),
    );
  }
  if (args.has('--perf')) {
    const synthetic = buildSchedule({
      ...schedule,
      transfers: [
        {
          id: 'perf-crossing',
          fromStopId: '33777',
          toStopId: '19300',
          durationSeconds: 480,
          pedestrian: {
            distanceMeters: 500,
            provenance: 'synthetic performance-only',
          },
        },
        {
          id: 'perf-station',
          fromStopId: '34288',
          toStopId: '33598',
          durationSeconds: 60,
          pedestrian: {
            distanceMeters: 60,
            provenance: 'synthetic performance-only',
          },
        },
      ],
    });
    for (const view of [schedule, synthetic]) {
      const result = await planGeographicJourney(
        view,
        request,
        {
          candidates: postgisCandidateSource(db, 'dart'),
          walkingProvider: {
            id: 'synthetic-performance-only',
            async route(r) {
              return {
                status: 'ok',
                route: { ...r, durationSeconds: 300, distanceMeters: 400 },
              };
            },
          },
        },
        API_POLICY,
      );
      console.log(
        'PERFORMANCE ONLY: synthetic walking, not travel evidence',
        JSON.stringify({
          links: view.transfers.length,
          metrics: result.metrics,
          rss: process.memoryUsage().rss,
        }),
      );
    }
  }
  if (args.has('--validate-walks')) {
    const { parseEnv } = await import('node:util');
    const env = parseEnv(
      readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8'),
    );
    if (!env.GEOAPIFY_API_KEY)
      throw new Error('Existing local Geoapify configuration unavailable');
    const provider = geoapifyWalkingProvider(env.GEOAPIFY_API_KEY);
    const ids = ['34287', '33598', '33777', '19300', '18216', '33597', '34288'];
    const rows = await db.query(
      'SELECT stop_id,stop_lat::float8 latitude,stop_lon::float8 longitude FROM static_gtfs.stops WHERE feed_id=$1 AND stop_id=ANY($2::text[])',
      [schedule.publicationId, ids],
    );
    const point = (id) => {
      const s = rows.rows.find((s) => s.stop_id === id);
      if (!s) throw new Error('Benchmark stop missing');
      return { latitude: s.latitude, longitude: s.longitude };
    };
    const pairs = [
      ['access-bus', request.origin, point('34287')],
      ['access-rail', request.origin, point('33598')],
      ['interchange', point('33777'), point('19300')],
      ['egress-bus', point('18216'), request.destination],
      ['egress-rail', point('33597'), request.destination],
      ['bus-rail', point('34288'), point('33598')],
    ];
    const evidence = new Map();
    for (const [name, origin, destination] of pairs) {
      const result = await provider.route(
        { origin, destination },
        AbortSignal.timeout(10000),
      );
      evidence.set(name, result);
      console.log('walking validation', name, JSON.stringify(result));
    }
    const links = [
      ['interchange', '33777', '19300'],
      ['bus-rail', '34288', '33598'],
    ].flatMap(([key, fromStopId, toStopId]) => {
      const r = evidence.get(key);
      return r?.status === 'ok'
        ? [
            {
              id: key,
              fromStopId,
              toStopId,
              durationSeconds: Math.ceil(r.route.durationSeconds),
              pedestrian: {
                distanceMeters: r.route.distanceMeters,
                provenance:
                  'Geoapify session-only validation; no persistence permission inferred',
              },
            },
          ]
        : [];
    });
    const linked = buildSchedule({
      ...schedule,
      transfers: [...schedule.transfers, ...links],
    });
    const candidate = (name, id) => {
      const r = evidence.get(name);
      return r?.status === 'ok' &&
        r.route.durationSeconds <= 1800 &&
        r.route.distanceMeters <= 2500
        ? [
            {
              publicationId: schedule.publicationId,
              stopId: id,
              coordinate: point(id),
              walk: r.route,
            },
          ]
        : [];
    };
    const access = [
      ...candidate('access-bus', '34287'),
      ...candidate('access-rail', '33598'),
    ];
    const egress = [
      ...candidate('egress-bus', '18216'),
      ...candidate('egress-rail', '33597'),
    ];
    const t = performance.now();
    const result = composeGeographicJourneys(
      linked,
      request,
      access,
      egress,
      API_POLICY,
      (j, decision) =>
        console.log(
          'composition decision',
          JSON.stringify({
            access: j.accessStopId,
            egress: j.egressStopId,
            arrival: j.arrivalTime,
            decision,
          }),
        ),
    );
    console.log(
      'measured endpoints/session-only links',
      JSON.stringify({
        ms: performance.now() - t,
        result: summarize(result),
        rss: process.memoryUsage().rss,
      }),
    );
    console.log(
      'bus-rail measured link',
      JSON.stringify(
        summarize(
          route(linked, {
            ...request,
            originStopId: '33157',
            destinationStopId: '33597',
          }),
        ),
      ),
    );
  }
} finally {
  await db.end();
}

import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { parseServiceTime } from '@dallas-transit/gtfs';
import {
  geographicPolicy,
  route,
  validateCoordinate,
  validateGeographicRequest,
  type Coordinate,
  type GeographicPolicy,
  type GeographicRequest,
} from '@dallas-transit/router';
import { connectDatabase, localDatabaseUrl } from './database.js';
import { loadRoutingSchedule } from './routing-schedule.js';
import {
  NEARBY_STOP_SQL,
  nearbyQueryParameters,
  postgisCandidateSource,
} from './nearby-stops.js';
import { geographicFixture } from './geographic-fixture.js';
import { planGeographicJourney } from './geographic-planner.js';
import { valhallaWalkingProvider } from './valhalla-walking.js';

const help = `Local geographic validation; JSON results, no HTTP endpoint:
pnpm journey:validate --mode fixture --origin '32,-96' --destination '32.01,-96' --date 2026-09-18 --departure 08:00:00 [--runs 10]
pnpm journey:validate --mode candidates --origin '32.780915,-96.805443' --destination '33.002166,-96.703144' --date 2026-09-18 --departure 08:00:00 --change-seconds 120 [--explain]
Modes:
  fixture     Artificial network and explicit test walking table; no SQL or network.
  candidates  Read-only DART SQL candidates plus separate stop-to-stop transit queries.
              Transit queries assume presence at the stop at the requested time.
              They are NOT full geographic journeys or evidence of pedestrian access.
  provider    Full journey through an explicitly configured Valhalla /route URL.
              Set --valhalla-url or WALKING_VALHALLA_URL. No default/public endpoint.
              One run, no warm-up/retry; obtain permission for the selected service.
Options: --source dart --radius-meters 1200 --access-count 4 --egress-count 4
         --provider-calls 8 --provider-concurrency 2 --provider-timeout-ms 5000
         --transit-searches 16 --max-journeys 3 --max-transfers 3 --runs 1
Counts/radius have validated upper bounds. Budget overrides must cover the candidate sum/product.
Fixture inputs are synthetic, not real Dallas walking routes. No provider URL/key is assumed.
DATABASE_URL uses existing local Compose defaults. --change-seconds is a required explicit
scenario for candidates mode, not verified station walking. --explain is read-only EXPLAIN ANALYZE.
`;

function coordinate(text: string): Coordinate {
  const parts = text.split(',');
  if (parts.length !== 2 || parts.some((p) => !p.trim()))
    throw new Error('Expected latitude,longitude');
  const result = { latitude: Number(parts[0]), longitude: Number(parts[1]) };
  validateCoordinate(result);
  return result;
}
function number(text: string, name: string, max = 2147483647): number {
  if (
    !/^\d+$/.test(text) ||
    !Number.isSafeInteger(Number(text)) ||
    Number(text) > max
  )
    throw new Error(`Invalid ${name}`);
  return Number(text);
}
const print = (value: unknown) =>
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean' },
      mode: { type: 'string' },
      origin: { type: 'string' },
      destination: { type: 'string' },
      date: { type: 'string' },
      departure: { type: 'string' },
      source: { type: 'string', default: 'dart' },
      'change-seconds': { type: 'string' },
      runs: { type: 'string', default: '1' },
      explain: { type: 'boolean' },
      'valhalla-url': { type: 'string' },
      'radius-meters': { type: 'string' },
      'access-count': { type: 'string' },
      'egress-count': { type: 'string' },
      'provider-calls': { type: 'string' },
      'provider-concurrency': { type: 'string' },
      'provider-timeout-ms': { type: 'string' },
      'transit-searches': { type: 'string' },
      'max-journeys': { type: 'string' },
      'max-transfers': { type: 'string', default: '3' },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return;
  }
  if (
    !values.mode ||
    !['fixture', 'candidates', 'provider'].includes(values.mode) ||
    !values.origin ||
    !values.destination ||
    !values.date ||
    !values.departure
  )
    throw new Error(help);
  const request: GeographicRequest = {
    origin: coordinate(values.origin),
    destination: coordinate(values.destination),
    serviceDate: values.date,
    departureTime: parseServiceTime(values.departure)
      .secondsFromServiceDayStart,
    maxTransfers: number(values['max-transfers'], 'max-transfers', 8),
  };
  validateGeographicRequest(request);
  const override: Partial<Record<keyof GeographicPolicy, number>> = {};
  const names = {
    'radius-meters': 'radiusMeters',
    'access-count': 'maxAccessCandidates',
    'egress-count': 'maxEgressCandidates',
    'provider-calls': 'maxProviderCalls',
    'provider-concurrency': 'providerConcurrency',
    'provider-timeout-ms': 'providerTimeoutMs',
    'transit-searches': 'maxTransitSearches',
    'max-journeys': 'maxJourneys',
  } as const;
  for (const [flag, key] of Object.entries(names)) {
    const value = values[flag as keyof typeof names];
    if (value !== undefined) override[key] = number(value, flag);
  }
  const policy = geographicPolicy(override);
  const runs = number(values.runs, 'runs', 1000);
  if (runs === 0) throw new Error('runs must be positive');
  const endpoint = values['valhalla-url'] ?? process.env.WALKING_VALHALLA_URL;
  if (values.mode === 'provider' && !endpoint) {
    print({
      mode: 'provider',
      status: 'unavailable',
      reason: 'walking-provider-not-configured',
      request,
      policy,
    });
    process.exitCode = 2;
    return;
  }
  if (values.mode === 'fixture') {
    const f = geographicFixture();
    const metrics = [];
    let result = await planGeographicJourney(
      f.schedule,
      request,
      { candidates: f.candidates, walkingProvider: f.provider },
      policy,
    );
    for (let i = 0; i < runs; i++) {
      result = await planGeographicJourney(
        f.schedule,
        request,
        { candidates: f.candidates, walkingProvider: f.provider },
        policy,
      );
      metrics.push(result.metrics);
    }
    print({
      mode: 'deterministic-fixture',
      pedestrianValidation: 'synthetic-only',
      request,
      policy,
      warmupRuns: 1,
      runs: metrics,
      result,
    });
    return;
  }
  if (values['change-seconds'] === undefined)
    throw new Error('database modes require explicit --change-seconds');
  if (values.mode === 'provider' && runs !== 1)
    throw new Error(
      'provider mode permits one run only; no automatic network benchmarking',
    );
  const walkingProvider =
    values.mode === 'provider' ? valhallaWalkingProvider(endpoint!) : undefined;
  const changeSeconds = number(values['change-seconds'], 'change-seconds');
  const db = await connectDatabase(
    process.env.DATABASE_URL ?? localDatabaseUrl,
  );
  try {
    const loaded = await loadRoutingSchedule(db, {
      sourceKey: values.source,
      serviceDate: request.serviceDate,
      changeSeconds,
    });
    if (loaded.status !== 'loaded') {
      print({ mode: values.mode, request, result: loaded });
      return;
    }
    const source = postgisCandidateSource(db, values.source);
    if (walkingProvider) {
      const result = await planGeographicJourney(
        loaded.schedule,
        request,
        { candidates: source, walkingProvider },
        policy,
      );
      print({
        mode: 'real-provider',
        provider: walkingProvider.id,
        request,
        policy,
        changeSeconds,
        publicationId: loaded.schedule.publicationId,
        scheduleMetrics: loaded.metrics,
        result,
      });
      return;
    }
    let candidates = await source.find(
      request,
      policy,
      loaded.schedule.publicationId,
    );
    const timings = [];
    for (let i = 0; i < runs; i++) {
      candidates = await source.find(
        request,
        policy,
        loaded.schedule.publicationId,
      );
      if (candidates.status === 'ok')
        timings.push({
          originLookupMs: candidates.originLookupMs,
          destinationLookupMs: candidates.destinationLookupMs,
        });
    }
    if (candidates.status !== 'ok') {
      print({ mode: 'candidates', request, candidates });
      return;
    }
    const transit = [];
    for (const access of candidates.access)
      for (const egress of candidates.egress) {
        if (access.stopId === egress.stopId) continue;
        const started = performance.now();
        const result = route(loaded.schedule, {
          serviceDate: request.serviceDate,
          departureTime: request.departureTime,
          originStopId: access.stopId,
          destinationStopId: egress.stopId,
          maxTransfers: request.maxTransfers!,
        });
        transit.push({
          accessStopId: access.stopId,
          egressStopId: egress.stopId,
          transitMs: performance.now() - started,
          result,
        });
      }
    const queryPlans = [];
    if (values.explain)
      for (const [coordinate, count] of [
        [request.origin, policy.maxAccessCandidates],
        [request.destination, policy.maxEgressCandidates],
      ] as const) {
        queryPlans.push(
          (
            await db.query(
              `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${NEARBY_STOP_SQL}`,
              [
                ...nearbyQueryParameters(
                  loaded.schedule.publicationId,
                  coordinate,
                  policy.radiusMeters,
                  count,
                ),
              ],
            )
          ).rows,
        );
      }
    print({
      mode: 'candidate-and-transit-only',
      pedestrianValidation: 'deferred-no-live-provider',
      request,
      policy,
      changeSeconds,
      publicationId: loaded.schedule.publicationId,
      scheduleMetrics: loaded.metrics,
      warmupRuns: 1,
      timings,
      candidates,
      providerCalls: 0,
      transitSearches: transit.length,
      transitAssumption:
        'Traveler already at each access stop at requested departure; no geographic arrival claim',
      transit,
      queryPlans,
    });
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

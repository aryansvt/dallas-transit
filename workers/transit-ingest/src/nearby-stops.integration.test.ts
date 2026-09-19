import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  geographicPolicy,
  type GeographicRequest,
} from '@dallas-transit/router';
import { activateFeed } from './activation.js';
import {
  connectDatabase,
  localDatabaseUrl,
  migrate,
  type Database,
} from './database.js';
import { importFeed } from './importer.js';
import { postgisCandidateSource } from './nearby-stops.js';
import { fixtureFiles, writeZip } from './test-support.js';
import { loadRoutingSchedule } from './routing-schedule.js';
import { fixtureWalkingProvider } from './walking-provider.js';
import { planGeographicJourney } from './geographic-planner.js';

const databaseName = `geographic_test_${randomUUID().replaceAll('-', '')}`;
let admin: Database;
let db: Database;
let directory: string;
let publicationId: string;
let correctionId: string;
const request: GeographicRequest = {
  serviceDate: '2026-09-20',
  departureTime: 43100,
  origin: { latitude: Number('32.123456789012345678'), longitude: -96.001 },
  destination: { latitude: 32.125, longitude: -96.003 },
};
const source = {
  sourceKey: 'fixture',
  sourceUrl: 'https://example.org/synthetic.zip',
};

beforeAll(async () => {
  const connection = process.env.TEST_DATABASE_URL ?? localDatabaseUrl;
  admin = await connectDatabase(connection);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  const isolated = new URL(connection);
  isolated.pathname = `/${databaseName}`;
  db = await connectDatabase(isolated.toString());
  directory = await mkdtemp(join(tmpdir(), 'geographic-integration-'));
  await migrate(db);
  const files = await fixtureFiles();
  files['stops.txt'] += [
    's0,000,Equal distance,,32.124,-96.002,,,0',
    'east,004,Date line east,,0,179.9997,,,0',
    'west,005,Date line west,,0,-179.9997,,,0',
    'north,006,North pole,,89.9999,-120,,,0',
    '',
  ].join('\n');
  const archivePath = join(directory, 'original.zip');
  await writeZip(archivePath, files);
  publicationId = (await importFeed(db, { ...source, archivePath })).feedId;
  await activateFeed(db, publicationId, '2026-09-14', '2026-09-20');
  const correctionPath = join(directory, 'correction.zip');
  await writeZip(correctionPath, {
    ...files,
    'stops.txt': files['stops.txt']!.replace('Second', 'Corrected second'),
  });
  correctionId = (
    await importFeed(db, { ...source, archivePath: correctionPath })
  ).feedId;
});
afterAll(async () => {
  if (db) await db.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await admin.end();
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function lookup(
  query = request,
  overrides: Parameters<typeof geographicPolicy>[0] = {},
  expected = publicationId,
) {
  return postgisCandidateSource(db, 'fixture').find(
    query,
    geographicPolicy(overrides),
    expected,
  );
}
describe('real PostGIS geographic candidates', () => {
  it('selects separate origin and destination candidates using the activated publication', async () => {
    const result = await lookup();
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error();
    expect(result.access[0]?.stopId).toBe('s1');
    expect(result.egress[0]?.stopId).toBe('s3');
    expect(
      [...result.access, ...result.egress].every(
        (s) => s.publicationId === publicationId,
      ),
    ).toBe(true);
    expect(result.originLookupMs).toBeGreaterThan(0);
    expect(result.destinationLookupMs).toBeGreaterThan(0);
  });
  it('enforces exact meter radius and count limits', async () => {
    const narrow = await lookup(request, { radiusMeters: 1 });
    expect(narrow).toMatchObject({
      access: [{ stopId: 's1' }],
      egress: [{ stopId: 's3' }],
    });
    const limited = await lookup(request, {
      maxAccessCandidates: 1,
      maxEgressCandidates: 2,
    });
    expect(limited.status).toBe('ok');
    if (limited.status !== 'ok') throw new Error();
    expect(limited.access).toHaveLength(1);
    expect(limited.egress).toHaveLength(2);
    expect(limited.egress.every((s) => s.candidateDistanceMeters <= 1200)).toBe(
      true,
    );
  });
  it('orders by exact geographic distance then code-unit stop ID deterministically', async () => {
    const query = {
      ...request,
      origin: { latitude: 32.124, longitude: -96.002 },
    };
    const a = await lookup(query);
    const b = await lookup(query);
    if (a.status !== 'ok' || b.status !== 'ok') throw new Error();
    expect(a.access).toEqual(b.access);
    expect(a.access.map((s) => s.stopId)).toEqual(['s0', 's2', 's1', 's3']);
    expect(a.access.map((s) => s.candidateDistanceMeters)).toEqual(
      [...a.access.map((s) => s.candidateDistanceMeters)].sort((x, y) => x - y),
    );
  });
  it('returns no candidates outside the radius', async () => {
    expect(
      await lookup({
        ...request,
        origin: { latitude: 0, longitude: 0 },
        destination: { latitude: 0, longitude: 0 },
      }),
    ).toMatchObject({ status: 'ok', access: [], egress: [] });
  });
  it.each([
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: Infinity },
  ])('rejects malformed coordinates before querying %j', async (origin) => {
    await expect(lookup({ ...request, origin })).rejects.toThrow(/Coordinate/);
    expect((await db.query('SELECT 1 AS healthy')).rows[0]).toEqual({
      healthy: 1,
    });
  });
  it('handles date-line and polar candidate bounds without losing reachable geographic neighbors', async () => {
    const result = await lookup(
      {
        ...request,
        origin: { latitude: 0, longitude: 180 },
        destination: { latitude: 90, longitude: 0 },
      },
      { radiusMeters: 100 },
    );
    if (result.status !== 'ok') throw new Error();
    expect(result.access.map((s) => s.stopId).sort()).toEqual(['east', 'west']);
    expect(result.egress.map((s) => s.stopId)).toEqual(['north']);
    const opposite = await lookup(
      { ...request, origin: { latitude: 0, longitude: -180 } },
      { radiusMeters: 100 },
    );
    if (opposite.status !== 'ok') throw new Error();
    expect(opposite.access.map((s) => s.stopId).sort()).toEqual([
      'east',
      'west',
    ]);
  });
  it('does not choose an unactivated newest publication or a different source', async () => {
    expect(await lookup({ ...request, serviceDate: '2026-09-21' })).toEqual({
      status: 'unavailable',
      reason: 'no-publication',
    });
    expect(
      await postgisCandidateSource(db, "fixture' OR TRUE --").find(
        request,
        geographicPolicy(),
        publicationId,
      ),
    ).toEqual({ status: 'unavailable', reason: 'no-publication' });
    const result = await lookup();
    if (result.status !== 'ok') throw new Error();
    expect(result.access.find((s) => s.stopId === 's2')?.name).toBe('Second');
  });
  it('composes real SQL-loaded transit with explicitly synthetic provider legs', async () => {
    const query = {
      ...request,
      destination: { latitude: 32.124, longitude: -96.002 },
    };
    const loaded = await loadRoutingSchedule(db, {
      sourceKey: 'fixture',
      serviceDate: query.serviceDate,
      changeSeconds: 120,
    });
    if (loaded.status !== 'loaded') throw new Error();
    const nearby = await lookup(query);
    if (nearby.status !== 'ok') throw new Error();
    const walkingProvider = fixtureWalkingProvider([
      {
        origin: query.origin,
        destination: nearby.access.find((s) => s.stopId === 's1')!.coordinate,
        durationSeconds: 60,
        distanceMeters: 75,
      },
      {
        origin: nearby.egress.find((s) => s.stopId === 's2')!.coordinate,
        destination: query.destination,
        durationSeconds: 10,
        distanceMeters: 12,
      },
    ]);
    expect(
      await planGeographicJourney(loaded.schedule, query, {
        candidates: postgisCandidateSource(db, 'fixture'),
        walkingProvider,
      }),
    ).toMatchObject({
      status: 'ok',
      journeys: [
        {
          accessStopId: 's1',
          egressStopId: 's2',
          arrivalTime: 45010,
          walkingDurationSeconds: 70,
        },
      ],
    });
  });
  it('isolates corrected publication IDs and detects stale schedules', async () => {
    await activateFeed(db, correctionId, '2026-09-19', '2026-09-19');
    const changed = { ...request, serviceDate: '2026-09-19' };
    expect(await lookup(changed)).toEqual({
      status: 'unavailable',
      reason: 'publication-changed',
    });
    const selected = await lookup(changed, {}, correctionId);
    if (selected.status !== 'ok') throw new Error();
    expect(selected.access.every((s) => s.publicationId === correctionId)).toBe(
      true,
    );
    expect(selected.access.find((s) => s.stopId === 's2')?.name).toBe(
      'Corrected second',
    );
    expect(await lookup()).toMatchObject({ status: 'ok', publicationId });
  });
});

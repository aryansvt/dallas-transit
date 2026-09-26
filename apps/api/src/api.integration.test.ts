import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  activateFeed,
  connectDatabase,
  importFeed,
  migrate,
} from '@dallas-transit/transit-ingest';
import { fixtureFiles, writeZip } from '@dallas-transit/transit-ingest/testing';
import type { WalkingProvider } from '@dallas-transit/transit-ingest/runtime';
import type pg from 'pg';
import { buildApp } from './app.js';
import { readServerConfig, type ApiConfig } from './config.js';
import { ApiDatabase } from './database.js';
import { postgresRepository } from './repository.js';
import { ApiError } from './errors.js';
import { deferred } from './test-support.js';
import { STOP_SEARCH_SQL } from './stop-search.js';

const databaseName = `journey_api_test_${randomUUID().replaceAll('-', '')}`;
let admin: pg.Client;
let db: pg.Client;
let directory: string;
let config: ApiConfig;
let originalId: string;
let correctedId: string;
const signal = new AbortController().signal;
const date = '2026-09-17';
const request = {
  origin: { latitude: 32.12345, longitude: -96.001 },
  destination: { latitude: 32.125, longitude: -96.003 },
  serviceDate: date,
  departureTime: 28800,
};
const provider: WalkingProvider = {
  id: 'synthetic-integration',
  async route(input) {
    return {
      status: 'ok',
      route: { ...input, durationSeconds: 30.5, distanceMeters: 40 },
    };
  },
};

beforeAll(async () => {
  const base =
    process.env.TEST_DATABASE_URL ?? readServerConfig({}).databaseUrl;
  admin = await connectDatabase(base);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  const isolated = new URL(base);
  isolated.pathname = `/${databaseName}`;
  config = {
    ...readServerConfig({
      DATABASE_URL: isolated.toString(),
      DATABASE_POOL_SIZE: '2',
    }),
    sourceKey: 'fixture',
  };
  db = await connectDatabase(config.databaseUrl);
  directory = await mkdtemp(join(tmpdir(), 'journey-api-integration-'));
});
afterAll(async () => {
  if (db) await db.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await admin.end();
  }
  if (directory) {
    const target = resolve(directory);
    if (
      !target.startsWith(resolve(tmpdir()) + sep) ||
      !target.split(sep).at(-1)?.startsWith('journey-api-integration-')
    )
      throw new Error('Unsafe test cleanup');
    await rm(target, { recursive: true, force: true });
  }
});

describe('API with actual PostGIS and pooled clients', () => {
  it('reports missing schema, then migrations without activation, then usable schedule capability', async () => {
    const repository = postgresRepository(config);
    const app = buildApp({}, { config, repository });
    try {
      const missing = await app.inject('/ready');
      expect(missing.statusCode).toBe(503);
      expect(missing.json()).toMatchObject({
        database: true,
        schema: false,
        schedule: false,
      });
      await migrate(db);
      const empty = await app.inject('/ready');
      expect(empty.statusCode).toBe(503);
      expect(empty.json().schema).toBe(true);
      const files = await fixtureFiles();
      files['trips.txt'] += 'bus,week,api-direct,Airport,0,,loop\n';
      files['stop_times.txt'] +=
        'api-direct,08:02:00,08:02:00,s1,10,,,,0,1\napi-direct,08:20:00,08:20:00,s3,30,,,,1,1\n';
      const original = join(directory, 'original.zip');
      await writeZip(original, files);
      originalId = (
        await importFeed(db, {
          sourceKey: 'fixture',
          sourceUrl: 'https://example.org/synthetic.zip',
          archivePath: original,
        })
      ).feedId;
      await activateFeed(db, originalId, '2026-09-14', '2026-09-20');
      files['stops.txt'] = files['stops.txt']!.replace(
        'Second',
        'Corrected Second',
      );
      const corrected = join(directory, 'corrected.zip');
      await writeZip(corrected, files);
      correctedId = (
        await importFeed(db, {
          sourceKey: 'fixture',
          sourceUrl: 'https://example.org/correction.zip',
          archivePath: corrected,
        })
      ).feedId;
      const ready = await app.inject('/ready');
      expect(ready.statusCode).toBe(200);
      expect(ready.json().capabilities).toEqual({
        metadata: true,
        journeys: false,
        walkingConfigured: false,
      });
    } finally {
      await app.close();
    }
  });
  it('loads once for coherent date-selected journeys, then releases and closes the pool', async () => {
    const database = new ApiDatabase(config);
    const repository = postgresRepository(config, database);
    const load = vi.spyOn(repository, 'load');
    const app = buildApp({}, { config, repository, walkingProvider: provider });
    try {
      for (let i = 0; i < 2; i++) {
        const r = await app.inject({
          method: 'POST',
          url: '/v1/journeys',
          payload: request,
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().status).toBe('ok');
        expect(r.json().publicationId).toBe(originalId);
        expect(r.json().references.trips).toContainEqual({
          tripId: 'api-direct',
          headsign: 'Airport',
          directionId: 0,
        });
      }
      expect(load).toHaveBeenCalledTimes(1);
      expect(database.pool.idleCount).toBe(database.pool.totalCount);
      const removed = await app.inject({
        method: 'POST',
        url: '/v1/journeys',
        payload: { ...request, serviceDate: '2026-09-18' },
      });
      expect(removed.statusCode).toBe(200);
      expect(removed.json().status).toBe('no-journey');
      const absent = await app.inject({
        method: 'POST',
        url: '/v1/journeys',
        payload: { ...request, serviceDate: '2026-10-19' },
      });
      expect(absent.statusCode).toBe(503);
      expect(absent.json().error.code).toBe('NO_PUBLICATION');
    } finally {
      await app.close();
    }
    expect(database.pool.totalCount).toBe(0);
  });
  it('reads publication/date-scoped metadata and nearby stops without full schedule preparation', async () => {
    const repository = postgresRepository(config);
    const load = vi.spyOn(repository, 'load');
    const app = buildApp({}, { config, repository });
    try {
      const stop = await app.inject(`/v1/stops/s1?serviceDate=${date}`);
      expect(stop.statusCode).toBe(200);
      expect(stop.json()).toMatchObject({
        publicationId: originalId,
        data: { name: 'First, Main', coordinate: { longitude: -96.001 } },
      });
      const route = await app.inject(`/v1/routes/bus?serviceDate=${date}`);
      expect(route.statusCode).toBe(200);
      expect(route.json().data.agencyTimezone).toBe('America/Chicago');
      for (const kind of ['stops', 'routes']) {
        expect(
          (await app.inject(`/v1/${kind}/absent?serviceDate=${date}`))
            .statusCode,
        ).toBe(404);
        expect(
          (await app.inject(`/v1/${kind}/s1?serviceDate=2026-10-19`)).json()
            .error.code,
        ).toBe('NO_PUBLICATION');
      }
      const near = await app.inject(
        `/v1/stops/nearby?serviceDate=${date}&latitude=32.124&longitude=-96.002`,
      );
      expect(near.statusCode).toBe(200);
      expect(near.json().stops[0].stopId).toBe('s2');
      expect(load).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('invalidates a warm schedule on correction and retries an activation change between load and candidates exactly once', async () => {
    const repository = postgresRepository(config);
    const load = vi.spyOn(repository, 'load');
    const app = buildApp({}, { config, repository, walkingProvider: provider });
    const send = () =>
      app.inject({ method: 'POST', url: '/v1/journeys', payload: request });
    try {
      expect((await send()).json().publicationId).toBe(originalId);
      await activateFeed(db, correctedId, date, date);
      expect((await send()).json().publicationId).toBe(correctedId);
      expect(load).toHaveBeenCalledTimes(2);
      const meta = await app.inject(`/v1/stops/s2?serviceDate=${date}`);
      expect(meta.json().data.name).toBe('Corrected Second');
      expect(
        (
          await app.inject(
            `/v1/stops/s2?serviceDate=${date}&publicationId=${originalId}`,
          )
        ).json().error.code,
      ).toBe('PUBLICATION_CHANGED');
      const find = repository.candidates.find;
      const spy = vi
        .spyOn(repository.candidates, 'find')
        .mockImplementationOnce(async (...args) => {
          await activateFeed(db, originalId, date, date);
          return find(...args);
        })
        .mockImplementation(find);
      const correctedDuringRequest = await send();
      expect(correctedDuringRequest.statusCode).toBe(200);
      expect(correctedDuringRequest.json().publicationId).toBe(originalId);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(load).toHaveBeenCalledTimes(3);
    } finally {
      await app.close();
      await activateFeed(db, originalId, date, date);
    }
  });
  it('destroys canceled active clients, releases failures, and leaves the pool usable', async () => {
    const database = new ApiDatabase(config);
    try {
      const started = deferred<void>();
      const controller = new AbortController();
      const operation = database.use(controller.signal, async (client) => {
        const query = client.query('SELECT pg_sleep(30)');
        started.resolve();
        await query;
        throw new Error('Must not continue');
      });
      const rejected = expect(operation).rejects.toMatchObject({
        code: 'REQUEST_CANCELED',
      });
      await started.promise;
      controller.abort(new ApiError('REQUEST_CANCELED'));
      await rejected;
      await expect(
        database.use(signal, (client) => client.query('SELECT missing_column')),
      ).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
      expect(
        (
          await database.use(signal, (client) =>
            client.query('SELECT 1 AS value'),
          )
        ).rows[0].value,
      ).toBe(1);
      expect(database.pool.idleCount).toBe(database.pool.totalCount);
    } finally {
      await database.close();
    }
    expect(database.pool.totalCount).toBe(0);
  });
  it('cleans a canceled pool-acquisition waiter when its client eventually arrives', async () => {
    const database = new ApiDatabase({ ...config, poolSize: 1 });
    const held = await database.pool.connect();
    const controller = new AbortController();
    const action = vi.fn(async () => 1);
    const pending = database.use(controller.signal, action);
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'REQUEST_CANCELED',
    });
    controller.abort(new ApiError('REQUEST_CANCELED'));
    await rejection;
    held.release();
    await database.use(signal, (client) => client.query('SELECT 1'));
    expect(action).not.toHaveBeenCalled();
    await database.close();
    expect(database.pool.totalCount).toBe(0);
  });
  it('searches authoritative publication-scoped stops with deterministic token prefixes and bounded results', async () => {
    // A realistic stop-count fixture gives useful indexed-query latency evidence.
    await db.query(
      `INSERT INTO static_gtfs.stops(feed_id,stop_id,stop_name,stop_lat,stop_lon,source_record)
      SELECT $1, 'bulk-' || i, 'Synthetic Road ' || i, 32.8, -96.8, 1 FROM generate_series(1,12000) AS i`,
      [originalId],
    );
    const names = [
      'West End Station',
      'CityLine/Bush Station',
      'UT Dallas Station',
      'Downtown Garland Station',
      ...Array.from({ length: 9 }, () => 'Main Street'),
    ];
    for (const [i, name] of names.entries())
      await db.query(
        'INSERT INTO static_gtfs.stops(feed_id,stop_id,stop_name,stop_lat,stop_lon,source_record) VALUES($1,$2,$3,32.8,-96.8,1)',
        [originalId, `search-${String(i).padStart(2, '0')}`, name],
      );
    await db.query(
      'INSERT INTO static_gtfs.stops(feed_id,stop_id,stop_name,stop_lat,stop_lon,source_record) VALUES($1,$2,$3,32.8,-96.8,1)',
      [correctedId, 'search-other', 'West End Station Other Publication'],
    );
    const repository = postgresRepository(config);
    const app = buildApp({}, { config, repository });
    const search = (q: string, extra = '') =>
      app.inject(
        `/v1/places/search?q=${encodeURIComponent(q)}&serviceDate=${date}${extra}`,
      );
    try {
      for (const [q, name] of [
        ['West End Station', 'West End Station'],
        ['cityline bu', 'CityLine/Bush Station'],
        ['UT Dal', 'UT Dallas Station'],
        ['Garland', 'Downtown Garland Station'],
      ]) {
        const response = await search(q!);
        expect(response.statusCode).toBe(200);
        expect(response.json().places).toEqual([
          expect.objectContaining({
            name,
            transit: { stopId: expect.any(String), publicationId: originalId },
          }),
        ]);
        expect(response.body).not.toContain('source_record');
        expect(response.body).not.toContain('parentStation');
      }
      const first = (await search('Main')).json();
      expect(first.places).toHaveLength(6);
      expect(first).toEqual((await search('Main')).json());
      expect(
        first.places.map(
          (p: { transit: { stopId: string } }) => p.transit.stopId,
        ),
      ).toEqual([
        'search-04',
        'search-05',
        'search-06',
        'search-07',
        'search-08',
        'search-09',
      ]);
      expect(
        (
          await search('West End Station', `&publicationId=${correctedId}`)
        ).json().status,
      ).toBe('unavailable');
      expect((await app.inject('/v1/places/search?q=Station')).statusCode).toBe(
        400,
      );
      await db.query('ANALYZE static_gtfs.stops');
      const plan = await db.query(`EXPLAIN (FORMAT JSON) ${STOP_SEARCH_SQL}`, [
        originalId,
        'station:*',
        'Station',
        6,
      ]);
      expect(JSON.stringify(plan.rows)).toContain('stops_search_name');
      const timings: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await search('Station');
        timings.push(performance.now() - start);
      }
      timings.sort((a, b) => a - b);
      console.info(
        `Stop-search fixture warm latency: median=${timings[10]!.toFixed(1)}ms p95=${timings[18]!.toFixed(1)}ms`,
      );
      expect(
        await db.query(
          "SELECT indexname FROM pg_indexes WHERE schemaname='static_gtfs' AND indexname='stops_search_name'",
        ),
      ).toMatchObject({ rowCount: 1 });
      vi.spyOn(repository, 'searchStops').mockRejectedValueOnce(
        new Error('private database details'),
      );
      const failure = await search('Station');
      expect(failure.json()).toEqual({
        status: 'unavailable',
        reason: 'provider-unavailable',
        places: [],
      });
    } finally {
      await app.close();
    }
  });
});

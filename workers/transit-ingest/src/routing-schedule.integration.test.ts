import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { route } from '@dallas-transit/router';
import { activateFeed } from './activation.js';
import {
  connectDatabase,
  localDatabaseUrl,
  migrate,
  type Database,
} from './database.js';
import { importFeed } from './importer.js';
import { loadRoutingSchedule } from './routing-schedule.js';
import { fixtureFiles, writeZip } from './test-support.js';

const databaseName = `routing_test_${randomUUID().replaceAll('-', '')}`;
let admin: Database;
let db: Database;
let directory: string;
let originalId: string;
let files: Record<string, string>;
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
  directory = await mkdtemp(join(tmpdir(), 'routing-integration-'));
  await migrate(db);
  files = await fixtureFiles();
  files['trips.txt'] +=
    'bus,week,first,First,0,,loop\nrail,week,second,Second,0,,line\n';
  files['stop_times.txt'] += [
    'first,08:00:00,08:00:00,s1,10,,,,0,1',
    'first,08:10:00,08:10:00,s2,30,,,,1,1',
    'second,08:10:00,08:10:00,s2,11,,,,0,1',
    'second,08:20:00,08:20:00,s3,31,,,,1,1',
    '',
  ].join('\n');
  const archivePath = join(directory, 'original.zip');
  await writeZip(archivePath, files);
  originalId = (await importFeed(db, { ...source, archivePath })).feedId;
  await activateFeed(db, originalId, '2026-09-14', '2026-09-20');
});

afterAll(async () => {
  if (db) await db.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await admin.end();
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function load(day: string, changeSeconds = 0) {
  const result = await loadRoutingSchedule(db, {
    sourceKey: 'fixture',
    serviceDate: day,
    changeSeconds,
  });
  if (result.status !== 'loaded')
    throw new Error('Fixture should be activated');
  return result;
}

describe('database-to-router boundary', () => {
  it('returns no publication outside activation and does not choose the newest feed', async () => {
    expect(
      await loadRoutingSchedule(db, {
        sourceKey: 'fixture',
        serviceDate: '2026-09-21',
        changeSeconds: 0,
      }),
    ).toEqual({ status: 'no-publication', serviceDate: '2026-09-21' });
    expect(
      await loadRoutingSchedule(db, {
        sourceKey: 'unknown',
        serviceDate: '2026-09-17',
        changeSeconds: 0,
      }),
    ).toMatchObject({ status: 'no-publication' });
  });
  it.each([
    ['2026-09-17', ['first', 'night', 'second', 'train']],
    ['2026-09-18', []], // Friday weekly service removed by exception.
    ['2026-09-19', ['first', 'night', 'second', 'train']], // Saturday addition.
    ['2026-09-20', ['event']], // Exception-only service.
  ])('loads the selected service set on %s', async (day, expected) => {
    const { schedule } = await load(day);
    expect(schedule.trips.map((t) => t.id)).toEqual(expected);
    expect(schedule.publicationId).toBe(originalId);
    expect(schedule.serviceDate).toBe(day);
  });
  it('routes exact transfer legs from SQL, applies null defaults, and reports counts', async () => {
    const { schedule, metrics } = await load('2026-09-17');
    const result = route(schedule, {
      serviceDate: schedule.serviceDate,
      originStopId: 's1',
      destinationStopId: 's3',
      departureTime: 28800,
      maxTransfers: 1,
    });
    expect(result).toMatchObject({
      status: 'ok',
      journeys: [
        {
          arrivalTime: 30000,
          boardingCount: 2,
          transferCount: 1,
          durationSeconds: 1200,
          legs: [
            {
              tripId: 'first',
              boardingSequence: 10,
              alightingSequence: 30,
              departureTime: 28800,
              arrivalTime: 29400,
            },
            {
              tripId: 'second',
              boardingSequence: 11,
              alightingSequence: 31,
              departureTime: 29400,
              arrivalTime: 30000,
            },
          ],
        },
      ],
    });
    expect(metrics).toMatchObject({
      stops: 3,
      trips: 4,
      events: 9,
      untimedVisits: 0,
      conditionalPickupVisits: 1,
      conditionalDropOffVisits: 1,
    });
    expect(metrics.totalMs).toBeGreaterThan(0);
  });
  it('enforces change-time input and refuses prohibited/conditional endpoints', async () => {
    const { schedule } = await load('2026-09-17', 1);
    const request = {
      serviceDate: schedule.serviceDate,
      originStopId: 's1',
      destinationStopId: 's3',
      departureTime: 28800,
    };
    expect(route(schedule, request).status).toBe('no-journey');
    expect(
      route(schedule, {
        ...request,
        destinationStopId: 's2',
        departureTime: 87300,
      }).status,
    ).toBe('no-journey');
    expect(schedule.trips.find((t) => t.id === 'night')?.events).toMatchObject([
      { sequence: 1, departure: 87300 },
      { sequence: 3, arrival: 91800, pickup: 2, dropOff: 3 },
      { sequence: 5, arrival: 93960 },
    ]);
  });
  it('routes exception-only service and treats selected no-service days normally', async () => {
    const { schedule } = await load('2026-09-20');
    expect(
      route(schedule, {
        serviceDate: schedule.serviceDate,
        originStopId: 's1',
        destinationStopId: 's2',
        departureTime: 43200,
      }),
    ).toMatchObject({
      status: 'ok',
      journeys: [{ arrivalTime: 45000, legs: [{ tripId: 'event' }] }],
    });
    const inactive = (await load('2026-09-18')).schedule;
    expect(
      route(inactive, {
        serviceDate: inactive.serviceDate,
        originStopId: 's1',
        destinationStopId: 's2',
        departureTime: 0,
      }),
    ).toEqual({ status: 'no-journey', reason: 'no-service' });
  });
  it('selects a correction coherently, preserves prior activation, and tolerates reused raw IDs', async () => {
    const changed = { ...files };
    changed['stops.txt'] = changed['stops.txt']!.replaceAll('s2', 's2-new');
    changed['stop_times.txt'] = changed['stop_times.txt']!.replaceAll(
      ',s2,',
      ',s2-new,',
    );
    const archivePath = join(directory, 'correction.zip');
    await writeZip(archivePath, changed);
    const correction = await importFeed(db, { ...source, archivePath });
    // Merely staging a correction must not alter date selection.
    expect((await load('2026-09-19')).schedule.publicationId).toBe(originalId);
    await activateFeed(db, correction.feedId, '2026-09-19', '2026-09-19');
    const selected = (await load('2026-09-19')).schedule;
    expect(selected.publicationId).toBe(correction.feedId);
    expect(selected.stops.map((s) => s.id)).toEqual(['s1', 's2-new', 's3']);
    expect(
      selected.trips.find((t) => t.id === 'first')?.events[1]?.stopId,
    ).toBe('s2-new');
    expect((await load('2026-09-17')).schedule.publicationId).toBe(originalId);
    expect(
      route(selected, {
        serviceDate: selected.serviceDate,
        originStopId: 's1',
        destinationStopId: 's3',
        departureTime: 28800,
      }),
    ).toMatchObject({
      status: 'ok',
      journeys: [{ publicationId: correction.feedId, arrivalTime: 30000 }],
    });
  });
  it('rolls back a failed read and leaves its client usable', async () => {
    const otherName = `routing_empty_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${otherName}`);
    const connection = new URL(
      process.env.TEST_DATABASE_URL ?? localDatabaseUrl,
    );
    connection.pathname = `/${otherName}`;
    const empty = await connectDatabase(connection.toString());
    try {
      await expect(
        loadRoutingSchedule(empty, {
          sourceKey: 'fixture',
          serviceDate: '2026-09-17',
          changeSeconds: 0,
        }),
      ).rejects.toThrow();
      expect((await empty.query('SELECT 1 AS healthy')).rows).toEqual([
        { healthy: 1 },
      ]);
    } finally {
      await empty.end();
      await admin.query(`DROP DATABASE ${otherName} WITH (FORCE)`);
    }
  });
});

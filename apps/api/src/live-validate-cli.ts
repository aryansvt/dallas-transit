import { buildSchedule } from '@dallas-transit/router';
import {
  encodeFixture,
  parseFeed,
  overlayJourney,
} from '@dallas-transit/realtime';
import { performance } from 'node:perf_hooks';
import { buildApp } from './app.js';
import { apiFixture } from './fixture.js';
import { readServerConfig } from './config.js';
import { serviceAnchor } from '@dallas-transit/realtime';
import type { JourneyResponse } from '@dallas-transit/shared';

const fixture = apiFixture();
const now =
  serviceAnchor(fixture.request.serviceDate, 'America/Chicago') + 28800;
const trips = Array.from({ length: 2000 }, (_, i) => ({
  ...fixture.schedule.trips[0]!,
  id: `benchmark-${i}`,
}));
const schedule = buildSchedule({
  ...fixture.schedule,
  trips: [...fixture.schedule.trips, ...trips],
});
const entity = schedule.trips.map((t) => ({
  id: t.id,
  tripUpdate: {
    trip: { tripId: t.id, startDate: '20260918' },
    timestamp: now,
    stopTimeUpdate: t.events.map((e) => ({
      stopId: e.stopId,
      stopSequence: e.sequence,
      arrival: { delay: 0 },
      departure: { delay: 0 },
    })),
  },
}));
const bytes = encodeFixture({
  header: { gtfsRealtimeVersion: '2.0', timestamp: now },
  entity,
});
const snapshot = parseFeed(bytes, schedule.publicationId, now);
const app = buildApp(
  {},
  {
    config: readServerConfig({}),
    repository: fixture.repository,
    walkingProvider: fixture.provider,
    now: () => now,
    realtime: {
      current: () => snapshot,
      refresh: async () => {},
      close: async () => {},
    },
  },
);
try {
  const planned = (
    await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: fixture.request,
    })
  ).json<JourneyResponse>();
  if (planned.status !== 'ok') throw new Error('fixture-plan-failed');
  const samples = {
    parse: [] as number[],
    normalize: [] as number[],
    overlay: [] as number[],
    api: [] as number[],
  };
  for (let i = 0; i < 50; i++) {
    const feed = parseFeed(bytes, schedule.publicationId, now);
    samples.parse.push(feed.metrics.parseMs);
    samples.normalize.push(feed.metrics.normalizeMs);
    const started = performance.now();
    overlayJourney(
      planned.journeys[0]!,
      schedule,
      feed,
      now,
      serviceAnchor(schedule.serviceDate, 'America/Chicago'),
    );
    samples.overlay.push(performance.now() - started);
    const api = performance.now();
    const response = await app.inject(
      `/v1/journeys/${planned.liveJourneyIds![0]}/live`,
    );
    if (response.statusCode !== 200) throw new Error('live-fixture-failed');
    samples.api.push(performance.now() - api);
  }
  const summary = Object.fromEntries(
    Object.entries(samples).map(([key, values]) => {
      values.sort((a, b) => a - b);
      return [
        key,
        {
          medianMs: values[Math.floor(values.length / 2)],
          p95Ms: values[Math.floor(values.length * 0.95)],
        },
      ];
    }),
  );
  console.info(
    JSON.stringify(
      {
        fixtureTrips: schedule.trips.length,
        payloadBytes: bytes.length,
        iterations: 50,
        ...summary,
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}

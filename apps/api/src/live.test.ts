import { afterEach, expect, it, vi } from 'vitest';
import {
  parseFeed,
  encodeFixture,
  serviceAnchor,
  type SnapshotSource,
} from '@dallas-transit/realtime';
import { buildApp } from './app.js';
import { apiFixture } from './fixture.js';
import { readServerConfig } from './config.js';
import { JourneyService } from './service.js';
import { LiveJourneys } from './live.js';
import { configuredRealtime } from './realtime-config.js';
import type { JourneyResponse } from '@dallas-transit/shared';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function setup(cancellation = false) {
  const fixture = apiFixture();
  const clock =
    serviceAnchor(fixture.request.serviceDate, 'America/Chicago') +
    fixture.request.departureTime;
  const feed = parseFeed(
    encodeFixture({
      header: { gtfsRealtimeVersion: '2.0', timestamp: clock },
      entity: cancellation
        ? [
            {
              id: 'cancel',
              tripUpdate: {
                trip: {
                  tripId: 'first',
                  startDate: '20260918',
                  scheduleRelationship: 3,
                },
              },
            },
          ]
        : [],
    }),
    fixture.schedule.publicationId,
    clock,
  );
  const source: SnapshotSource = {
    current: () => feed,
    refresh: async () => {},
    close: vi.fn(async () => {}),
  };
  const app = buildApp(
    {},
    {
      config: readServerConfig({}),
      repository: fixture.repository,
      walkingProvider: fixture.provider,
      realtime: source,
      now: () => clock,
    },
  );
  apps.push(app);
  return {
    ...fixture,
    app,
    clock,
    source,
    plan: async () =>
      (
        await app.inject({
          method: 'POST',
          url: '/v1/journeys',
          payload: fixture.request,
        })
      ).json<Extract<JourneyResponse, { status: 'ok' }>>(),
  };
}
it('extends existing journey lifecycle with opaque IDs and bounded live state', async () => {
  const f = setup(true);
  const plan = await f.plan();
  const id = plan.liveJourneyIds![0]!;
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  const response = await f.app.inject(`/v1/journeys/${id}/live`);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    publicationId: plan.publicationId,
    replan: { suggested: true },
    freshness: 'LIVE',
  });
  expect(response.body.length).toBeLessThan(20000);
  expect(response.body).not.toMatch(/https:|secret|protobuf/);
  expect(response.headers['cache-control']).toBe('no-store');
});
it('keeps static planning usable without realtime configuration', async () => {
  const f = apiFixture();
  const app = buildApp(
    {},
    {
      config: readServerConfig({}),
      repository: f.repository,
      walkingProvider: f.provider,
    },
  );
  apps.push(app);
  const plan = (
    await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: f.request,
    })
  ).json<Extract<JourneyResponse, { status: 'ok' }>>();
  expect(plan.status).toBe('ok');
  expect(
    (await app.inject(`/v1/journeys/${plan.liveJourneyIds![0]}/live`)).json(),
  ).toMatchObject({ freshness: 'UNAVAILABLE', replan: { suggested: false } });
});
it('rejects malformed handles and arbitrary rider-stop/coordinate inputs', async () => {
  const f = setup();
  const plan = await f.plan();
  const id = plan.liveJourneyIds![0];
  expect((await f.app.inject('/v1/journeys/not-valid/live')).statusCode).toBe(
    400,
  );
  expect(
    (
      await f.app.inject(
        '/v1/journeys/11111111-1111-4111-8111-111111111111/live',
      )
    ).statusCode,
  ).toBe(404);
  for (const payload of [
    {},
    { confirmedStopId: 'unknown' },
    { coordinate: { latitude: 900, longitude: 0 } },
    { coordinate: f.request.origin, confirmedStopId: 'A' },
    { providerUrl: 'https://example.org' },
  ])
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/v1/journeys/${id}/replan`,
          payload,
        })
      ).statusCode,
    ).toBe(400);
});
it('reuses routing, avoids cancelled service and deduplicates repeated replans', async () => {
  const f = setup(true);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(f.clock * 1000);
  const plan = await f.plan();
  const id = plan.liveJourneyIds![0];
  const response = await f.app.inject({
    method: 'POST',
    url: `/v1/journeys/${id}/replan`,
    payload: { coordinate: f.request.origin },
  });
  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.status).toBe('ok');
  expect(body.reason).toContain('cancelled');
  expect(
    body.result.journeys.every((j: { legs: { tripId?: string }[] }) =>
      j.legs.every((l) => l.tripId !== 'first'),
    ),
  ).toBe(true);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: `/v1/journeys/${id}/replan`,
        payload: { coordinate: f.request.origin },
      })
    ).json(),
  ).toMatchObject({ status: 'cooldown' });
  expect((await f.app.inject(`/v1/journeys/${id}/live`)).statusCode).toBe(200);
});
it('preserves original session after replan failure and applies cooldown to failures', async () => {
  const f = setup();
  const plan = await f.plan();
  const id = plan.liveJourneyIds![0];
  f.provider.route = async () => ({
    status: 'unavailable',
    reason: 'network-error',
  });
  const response = await f.app.inject({
    method: 'POST',
    url: `/v1/journeys/${id}/replan`,
    payload: { coordinate: f.request.origin },
  });
  expect(response.statusCode).toBe(503);
  expect((await f.app.inject(`/v1/journeys/${id}/live`)).statusCode).toBe(200);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: `/v1/journeys/${id}/replan`,
        payload: { coordinate: f.request.origin },
      })
    ).json(),
  ).toMatchObject({ status: 'cooldown' });
});
it('honors cancelled clients and expires bounded active sessions', async () => {
  const f = apiFixture();
  let clock = 0;
  const service = new JourneyService(
    f.repository,
    readServerConfig({}),
    f.provider,
  );
  const live = new LiveJourneys(service, undefined, () => clock);
  const plan = live.register(
    await service.journey(f.request, new AbortController().signal, {}),
  );
  if (plan.status !== 'ok') throw new Error();
  const id = plan.liveJourneyIds![0]!;
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await expect(live.state(id, controller.signal)).rejects.toThrow('cancelled');
  await expect(
    live.replan(id, { coordinate: f.request.origin }, controller.signal),
  ).rejects.toThrow('cancelled');
  clock = 3601;
  await expect(
    live.state(id, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await service.close();
});
it('requires deliberate authorized configuration with no guessed provider URL', () => {
  expect(
    configuredRealtime({ DART_REALTIME_KEY: 'must-not-use' }, () => {}),
  ).toBeUndefined();
  expect(() =>
    configuredRealtime({ DART_REALTIME_AUTHORIZED: 'true' }, () => {}),
  ).toThrow();
  expect(() =>
    configuredRealtime(
      {
        DART_REALTIME_AUTHORIZED: 'true',
        DART_REALTIME_PUBLICATION_ID: '11111111-1111-4111-8111-111111111111',
        DART_REALTIME_FEED_URLS: 'http://example.org',
        DART_REALTIME_INTERVAL_MS: '5000',
      },
      () => {},
    ),
  ).toThrow();
});

import { deferred } from './test-support.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import { buildApp } from './app.js';
import { apiFixture } from './fixture.js';
import { readServerConfig } from './config.js';
import { ApiError } from './errors.js';

const apps: ReturnType<typeof buildApp>[] = [];
function setup(offset = 0, provider = true, timeout = 15000) {
  const fixture = apiFixture(offset);
  const app = buildApp(
    {},
    {
      config: readServerConfig({ JOURNEY_TIMEOUT_MS: String(timeout) }),
      repository: fixture.repository,
      ...(provider ? { walkingProvider: fixture.provider } : {}),
    },
  );
  apps.push(app);
  return {
    ...fixture,
    app,
    send: (payload: unknown = fixture.request) =>
      app.inject({
        method: 'POST',
        url: '/v1/journeys',
        payload: payload as object,
      }),
  };
}
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('V1 journey contract', () => {
  it('preserves useful partial results and logs safe categories without provider details or coordinates', async () => {
    const f = apiFixture();
    const records: Record<string, unknown>[] = [];
    const find = f.repository.candidates.find;
    f.repository.candidates.find = async (...args) => {
      const found = await find(...args);
      if (found.status !== 'ok') return found;
      return {
        ...found,
        access: [
          ...found.access,
          {
            ...found.access[0]!,
            stopId: 'B',
            coordinate: f.references.stops[1]!.coordinate,
          },
        ],
      };
    };
    const route = f.provider.route;
    f.provider.route = async (input, signal) => {
      if (
        input.destination.latitude ===
        f.references.stops[1]!.coordinate.latitude
      )
        throw new Error('private-provider-token');
      return route(input, signal);
    };
    const app = buildApp(
      {
        logger: {
          stream: {
            write(line) {
              records.push(JSON.parse(line) as Record<string, unknown>);
            },
          },
        },
      },
      {
        config: readServerConfig({}),
        repository: f.repository,
        walkingProvider: f.provider,
      },
    );
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: f.request,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().incomplete).toBe(true);
    expect(response.json().journeys.length).toBeGreaterThan(0);
    expect(records).toContainEqual(
      expect.objectContaining({
        endpoint: '/v1/journeys',
        cache: 'miss',
        providerFailure: 'provider-error',
        statusCode: 200,
      }),
    );
    expect(JSON.stringify(records)).not.toMatch(
      /private-provider-token|-96|latitude|longitude/,
    );
    for (const record of records)
      for (const field of ['err', 'req', 'body', 'url'])
        expect(record).not.toHaveProperty(field);
  });
  it('serializes exact direct and transfer journeys plus names/headsigns, without runtime diagnostics', async () => {
    const f = setup();
    const response = await f.send();
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.journeys).toHaveLength(2);
    const [transfer, direct] = body.journeys;
    expect(transfer).toMatchObject({
      publicationId: f.schedule.publicationId,
      serviceDate: '2026-09-18',
      accessStopId: 'A',
      egressStopId: 'D',
      requestedDepartureTime: 28800,
      arrivalTime: 30040.5,
      durationSeconds: 1240.5,
      boardingCount: 2,
      transferCount: 1,
      walkingDurationSeconds: 70.75,
      walkingDistanceMeters: 101,
      interchangeDurationSeconds: 0,
    });
    expect(transfer.legs.map((l: { kind: string }) => l.kind)).toEqual([
      'walk',
      'transit',
      'transit',
      'walk',
    ]);
    expect(transfer.legs[1]).toMatchObject({
      tripId: 'first',
      routeId: 'bus',
      boardingStopId: 'A',
      alightingStopId: 'B',
      boardingSequence: 1,
      alightingSequence: 11,
      boardingOccurrence: 0,
      alightingOccurrence: 1,
      departureTime: 28900,
      arrivalTime: 29200,
    });
    expect(direct).toMatchObject({
      arrivalTime: 30640.5,
      boardingCount: 1,
      transferCount: 0,
    });
    expect(direct.legs.map((l: { kind: string }) => l.kind)).toEqual([
      'walk',
      'transit',
      'walk',
    ]);
    expect(transfer.legs[0]).toMatchObject({
      phase: 'access',
      origin: f.request.origin,
      durationSeconds: 30.25,
      distanceMeters: 50.5,
      arrivalTime: 28830.25,
    });
    expect(body.references.trips).toContainEqual({
      tripId: 'first',
      headsign: 'first',
      directionId: 0,
    });
    expect(body).not.toHaveProperty('metrics');
    expect(body).not.toHaveProperty('walkingAttempts');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['server']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('allows the product override of direct transit only', async () => {
    const f = setup();
    const response = await f.send({ ...f.request, maxTransfers: 0 });
    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .journeys.map((j: { transferCount: number }) => j.transferCount),
    ).toEqual([0]);
  });
  it('preserves after-midnight and fractional walking values', async () => {
    const f = setup(57600);
    const response = await f.send();
    expect(response.statusCode).toBe(200);
    expect(response.json().journeys[0]).toMatchObject({
      requestedDepartureTime: 86400,
      arrivalTime: 87640.5,
    });
  });
  it.each([
    { origin: { latitude: 91, longitude: -96 } },
    { origin: { latitude: '32', longitude: -96 } },
    { destination: { latitude: 32, longitude: -181 } },
    { origin: null },
    { serviceDate: '2026-02-30' },
    { serviceDate: '20260918' },
    { serviceDate: 20260918 },
    { departureTime: '08:00:00' },
    { departureTime: -1 },
    { departureTime: 0.5 },
    { departureTime: 2147483648 },
    { maxTransfers: 4 },
    { maxTransfers: -1 },
    { maxTransfers: 1.5 },
    { maxTransfers: '2' },
    { providerUrl: 'http://example.org/route' },
    { radiusMeters: 5000 },
    { origin: { latitude: 32, longitude: -96, extra: true } },
  ])(
    'rejects malformed or unsupported input before schedule work: %j',
    async (change) => {
      const f = setup();
      const load = vi.spyOn(f.repository, 'publication');
      const response = await f.send({ ...f.request, ...change });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_REQUEST');
      expect(load).not.toHaveBeenCalled();
    },
  );
  it('bounds bytes and handles JSON, media type, missing input and unsupported query', async () => {
    const f = setup();
    for (const [payload, expected] of [
      ['{bad', 400],
      [' '.repeat(4097), 413],
    ] as const) {
      const r = await f.app.inject({
        method: 'POST',
        url: '/v1/journeys',
        headers: { 'content-type': 'application/json' },
        payload,
      });
      expect(r.statusCode).toBe(expected);
      expect(r.json()).toHaveProperty('error.code');
    }
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/v1/journeys',
          payload: 'text',
        })
      ).statusCode,
    ).toBe(415);
    expect((await f.send({})).statusCode).toBe(400);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/v1/journeys?deadline=99999',
          payload: f.request,
        })
      ).statusCode,
    ).toBe(400);
  });
  it('returns 200 for a bounded, valid no-journey outcome', async () => {
    const f = setup();
    const r = await f.send({ ...f.request, departureTime: 100000 });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      status: 'no-journey',
      reason: 'transit-unreachable',
      journeys: [],
      incomplete: false,
    });
  });
  it('reports missing provider configuration before doing database work', async () => {
    const f = setup(0, false);
    const load = vi.spyOn(f.repository, 'publication');
    const r = await f.send();
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe('WALKING_NOT_CONFIGURED');
    expect(load).not.toHaveBeenCalled();
  });
  it('does not misreport provider failures as no journey or expose raw errors', async () => {
    const f = setup();
    f.provider.route = async () => {
      throw new Error('secret-provider-body postgres://private /internal/file');
    };
    const r = await f.send();
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe('WALKING_UNAVAILABLE');
    expect(r.body).not.toMatch(/secret|postgres|internal|stack/);
  });
  it('distinguishes no publication, database failure, and unexpected service failure', async () => {
    const f = setup();
    expect(
      (await f.send({ ...f.request, serviceDate: '2026-09-19' })).json().error
        .code,
    ).toBe('NO_PUBLICATION');
    f.repository.publication = async () => {
      throw new ApiError('DATABASE_UNAVAILABLE');
    };
    expect((await f.send()).statusCode).toBe(503);
    f.repository.publication = async () => {
      throw new Error('SQL SELECT password FROM /private');
    };
    const r = await f.send();
    expect(r.statusCode).toBe(500);
    expect(r.json().error.code).toBe('INTERNAL_ERROR');
    expect(r.body).not.toMatch(/SELECT|password|private|stack/);
  });
  it('reuses a prepared schedule and retries one publication correction before provider calls', async () => {
    const f = setup();
    const load = vi.spyOn(f.repository, 'load');
    const find = f.repository.candidates.find;
    const lookup = vi
      .spyOn(f.repository.candidates, 'find')
      .mockResolvedValueOnce({
        status: 'unavailable',
        reason: 'publication-changed',
      })
      .mockImplementation(find);
    expect((await f.send()).statusCode).toBe(200);
    expect(load).toHaveBeenCalledTimes(2);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect((await f.send()).statusCode).toBe(200);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('stops retrying after a second correction', async () => {
    const f = setup();
    const find = vi.spyOn(f.repository.candidates, 'find').mockResolvedValue({
      status: 'unavailable',
      reason: 'publication-changed',
    });
    const provider = vi.spyOn(f.provider, 'route');
    const r = await f.send();
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe('PUBLICATION_CHANGED');
    expect(find).toHaveBeenCalledTimes(2);
    expect(provider).not.toHaveBeenCalled();
  });
});

describe('deadlines, concurrency and shutdown', () => {
  it('times out an incomplete uploaded JSON body before planning', async () => {
    const f = setup(0, true, 100);
    const entered = deferred<void>();
    const load = vi.spyOn(f.repository, 'load');
    f.app.addHook('onRequest', async () => {
      entered.resolve();
    });
    const address = await f.app.listen({ host: '127.0.0.1', port: 0 });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const result = deferred<{ status: number; body: string }>();
    const client = httpRequest(
      `${address}/v1/journeys`,
      { method: 'POST', headers: { 'content-type': 'application/json' } },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (part: string) => {
          body += part;
        });
        response.on('end', () =>
          result.resolve({ status: response.statusCode!, body }),
        );
      },
    );
    client.on('error', () => {});
    client.write('{');
    await entered.promise;
    await vi.advanceTimersByTimeAsync(100);
    const response = await result.promise;
    expect(response.status).toBe(504);
    expect(JSON.parse(response.body).error.code).toBe('REQUEST_TIMEOUT');
    expect(load).not.toHaveBeenCalled();
    client.destroy();
  });
  it('aborts preparation on a whole-request deadline before starting walking work', async () => {
    const f = setup(0, true, 100);
    await f.app.ready();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const entered = deferred<void>();
    let buildSignal: AbortSignal | undefined;
    f.repository.load = async (_date, signal) => {
      buildSignal = signal;
      entered.resolve();
      return new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        }),
      );
    };
    const walk = vi.spyOn(f.provider, 'route');
    const response = f.send().then((r) => r);
    await entered.promise;
    await vi.advanceTimersByTimeAsync(100);
    expect((await response).json().error.code).toBe('REQUEST_TIMEOUT');
    expect(buildSignal?.aborted).toBe(true);
    expect(walk).not.toHaveBeenCalled();
  });
  it.each([
    [3000, 15000, 'WALKING_TIMEOUT'],
    [100, 100, 'REQUEST_TIMEOUT'],
  ] as const)(
    'distinguishes provider and whole-request deadline (%s)',
    async (advance, timeout, code) => {
      const f = setup(0, true, timeout);
      await f.app.ready();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const entered = deferred<void>();
      const signals: AbortSignal[] = [];
      f.provider.route = async (_request, signal) => {
        signals.push(signal);
        entered.resolve();
        return new Promise(() => {});
      };
      const response = f.send().then((r) => r);
      await entered.promise;
      await vi.advanceTimersByTimeAsync(advance);
      const r = await response;
      expect(r.statusCode).toBe(504);
      expect(r.json().error.code).toBe(code);
      expect(signals.every((s) => s.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('rejects excess concurrent journeys with no unbounded queue', async () => {
    const f = apiFixture();
    const config = readServerConfig({ JOURNEY_CONCURRENCY: '1' });
    const entered = deferred<void>();
    const done = deferred<unknown>();
    f.provider.route = async () => {
      entered.resolve();
      return done.promise;
    };
    const app = buildApp(
      {},
      { config, repository: f.repository, walkingProvider: f.provider },
    );
    apps.push(app);
    const first = app
      .inject({ method: 'POST', url: '/v1/journeys', payload: f.request })
      .then((r) => r);
    await entered.promise;
    const second = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: f.request,
    });
    expect(second.statusCode).toBe(503);
    expect(second.json().error.code).toBe('SERVER_BUSY');
    done.resolve({ status: 'no-route' });
    await first;
  });
  it('aborts provider work on shutdown and closes owned resources', async () => {
    const f = setup();
    const entered = deferred<void>();
    let providerSignal: AbortSignal | undefined;
    const close = vi.spyOn(f.repository, 'close');
    f.provider.route = async (_input, signal) => {
      providerSignal = signal;
      entered.resolve();
      return new Promise(() => {});
    };
    const response = f.send().then((r) => r);
    await entered.promise;
    await f.app.close();
    expect((await response).json().error.code).toBe('SERVICE_UNAVAILABLE');
    expect(providerSignal?.aborted).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('detects a real client disconnect after upload, aborts work, and writes no response', async () => {
    const f = setup();
    const entered = deferred<void>();
    const aborted = deferred<void>();
    f.provider.route = async (_input, signal) => {
      signal.addEventListener('abort', () => aborted.resolve(), { once: true });
      entered.resolve();
      return new Promise(() => {});
    };
    const address = await f.app.listen({ host: '127.0.0.1', port: 0 });
    const client = httpRequest(`${address}/v1/journeys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const response = vi.fn();
    client.on('response', response);
    client.on('error', () => {});
    client.end(JSON.stringify(f.request));
    await entered.promise;
    const closed = new Promise<void>((resolve) =>
      client.once('close', resolve),
    );
    client.destroy();
    await closed;
    await aborted.promise;
    expect(response).not.toHaveBeenCalled();
  });
});

describe('metadata and probes', () => {
  it.each([
    ['stops', 'A', 'stopId'],
    ['routes', 'bus', 'routeId'],
  ])(
    'reads date-scoped %s and returns 404 only for absence',
    async (kind, id, key) => {
      const f = setup();
      const load = vi.spyOn(f.repository, 'load');
      const found = await f.app.inject(
        `/v1/${kind}/${id}?serviceDate=2026-09-18`,
      );
      expect(found.statusCode).toBe(200);
      expect(found.json().data[key!]).toBe(id);
      expect(
        (await f.app.inject(`/v1/${kind}/missing?serviceDate=2026-09-18`))
          .statusCode,
      ).toBe(404);
      expect(
        (await f.app.inject(`/v1/${kind}/${id}?serviceDate=2026-09-19`))
          .statusCode,
      ).toBe(503);
      expect((await f.app.inject(`/v1/${kind}/${id}`)).statusCode).toBe(400);
      expect(
        (await f.app.inject(`/v1/${kind}/${id}?serviceDate=2026-02-30`))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await f.app.inject(
            `/v1/${kind}/${id}?serviceDate=2026-09-18&serviceDate=2026-09-19`,
          )
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await f.app.inject(
            `/v1/${kind}/${id}?serviceDate=2026-09-18&publicationId=22222222-2222-4222-8222-222222222222`,
          )
        ).json().error.code,
      ).toBe('PUBLICATION_CHANGED');
      expect(load).not.toHaveBeenCalled();
    },
  );
  it('exposes bounded nearby candidates with honest distance semantics', async () => {
    const f = setup();
    const r = await f.app.inject(
      '/v1/stops/nearby?serviceDate=2026-09-18&latitude=32&longitude=-96',
    );
    expect(r.statusCode).toBe(200);
    expect(r.json().stops[0].candidateDistanceMeters).toBe(10);
    expect(
      (
        await f.app.inject(
          '/v1/stops/nearby?serviceDate=2026-09-18&latitude=nope&longitude=-96',
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.app.inject(
          '/v1/stops/nearby?serviceDate=2026-09-18&latitude=32&longitude=-96&limit=100',
        )
      ).statusCode,
    ).toBe(400);
  });
  it('separates liveness, database/schema readiness and walking capability without schedule builds', async () => {
    const f = setup(0, false);
    const load = vi.spyOn(f.repository, 'load');
    expect((await f.app.inject('/health')).json()).toEqual({ status: 'ok' });
    const ready = await f.app.inject('/ready');
    expect(ready.statusCode).toBe(200);
    expect(ready.json().capabilities).toEqual({
      metadata: true,
      journeys: false,
      walkingConfigured: false,
    });
    f.repository.readiness = async () => ({
      database: true,
      schema: false,
      schedule: false,
    });
    expect((await f.app.inject('/ready')).statusCode).toBe(503);
    f.repository.readiness = async () => {
      throw new Error('connection secret');
    };
    const down = await f.app.inject('/ready');
    expect(down.statusCode).toBe(503);
    expect(down.body).not.toContain('secret');
    expect((await f.app.inject('/health')).statusCode).toBe(200);
    expect(load).not.toHaveBeenCalled();
  });
});

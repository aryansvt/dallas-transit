import Fastify, {
  LogController,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import {
  valhallaWalkingProvider,
  type WalkingProvider,
} from '@dallas-transit/transit-ingest/runtime';
import { abortable, Capacity } from './async.js';
import { readServerConfig, type ApiConfig } from './config.js';
import {
  dateQuerySchema,
  errors,
  journeyRequest,
  journeyRequestSchema,
  journeyResponseSchema,
  nearbyQuerySchema,
  nearbyResponseSchema,
  object,
  queryCoordinate,
  routeSchema,
  serviceDate,
  stopSchema,
} from './contracts.js';
import { ApiError } from './errors.js';
import { ApiDatabase } from './database.js';
import { postgresRepository, type TransitRepository } from './repository.js';
import { JourneyService, type JourneyObservation } from './service.js';

interface RequestScope {
  executing: boolean;
  signal: AbortSignal;
  check(): void;
  cleanup(): void;
  started: number;
  observation: JourneyObservation;
}
interface AppDependencies {
  config?: ApiConfig;
  repository?: TransitRepository;
  walkingProvider?: WalkingProvider;
}

// Construction opens no socket. Tests inject repositories/providers, never public services.
export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: AppDependencies = {},
) {
  const config = dependencies.config ?? readServerConfig();
  const app = Fastify({
    ...options,
    bodyLimit: 4096,
    requestTimeout: 10000,
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
      },
    },
  });
  const repository =
    dependencies.repository ??
    postgresRepository(
      config,
      new ApiDatabase(config, () => {
        app.log.warn(
          { code: 'DATABASE_UNAVAILABLE' },
          'idle database connection failed',
        );
      }),
    );
  const provider =
    dependencies.walkingProvider ??
    (config.walkingUrl
      ? valhallaWalkingProvider(config.walkingUrl)
      : undefined);
  const service = new JourneyService(repository, config, provider);
  const journeys = new Capacity(config.journeyConcurrency);
  const reads = new Capacity(16);
  const scopes = new WeakMap<FastifyRequest, RequestScope>();

  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff');
    if (request.routeOptions.url === '/health') return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      service.shutdown.signal,
    ]);
    const started = performance.now();
    const budget =
      request.routeOptions.url === '/v1/journeys'
        ? config.journeyTimeoutMs
        : 5000;
    const timer = setTimeout(
      () => controller.abort(new ApiError('REQUEST_TIMEOUT')),
      budget,
    );
    timer.unref();
    const disconnected = () => {
      if (!reply.raw.writableEnded)
        controller.abort(new ApiError('REQUEST_CANCELED'));
    };
    request.raw.once('aborted', disconnected);
    reply.raw.once('close', disconnected);
    const scope: RequestScope = {
      executing: false,
      signal,
      started,
      observation: {},
      check() {
        // Synchronous transit work cannot yield to the timer; enforce the elapsed
        // deadline again before any next async phase or successful response.
        if (performance.now() - started >= budget && !signal.aborted)
          controller.abort(new ApiError('REQUEST_TIMEOUT'));
        signal.throwIfAborted();
      },
      cleanup() {
        clearTimeout(timer);
        request.raw.removeListener('aborted', disconnected);
        reply.raw.removeListener('close', disconnected);
        signal.removeEventListener('abort', beforeHandlerAbort);
      },
    };
    const beforeHandlerAbort = () => {
      if (scope.executing) return; // The handler's abortable wait owns its response.
      const failure = signal.reason as ApiError;
      app.log.warn(
        {
          requestId: request.id,
          endpoint: request.routeOptions.url ?? 'unmatched',
          code: failure.code,
        },
        'request failed',
      );
      if (reply.raw.destroyed || failure.code === 'REQUEST_CANCELED') {
        scope.cleanup();
        reply.hijack();
      } else if (!reply.sent) {
        // Bound slow/incomplete body upload as well as planning. Close this
        // connection because unread request bytes must not become another request.
        reply
          .header('connection', 'close')
          .code(failure.statusCode)
          .send(failure.body(request.id));
      }
    };
    scopes.set(request, scope);
    signal.addEventListener('abort', beforeHandlerAbort, { once: true });
    if (signal.aborted) beforeHandlerAbort();
  });
  app.addHook('onResponse', async (request, reply) => {
    const scope = scopes.get(request);
    scope?.cleanup();
    app.log.info(
      {
        requestId: request.id,
        endpoint: request.routeOptions.url ?? 'unmatched',
        statusCode: reply.statusCode,
        durationMs: scope ? Math.round(performance.now() - scope.started) : 0,
        ...scope?.observation,
      },
      'request completed',
    );
  });
  const execute = async <T>(
    request: FastifyRequest,
    reply: FastifyReply,
    capacity: Capacity,
    action: (scope: RequestScope) => Promise<T>,
  ) => {
    const scope = scopes.get(request)!;
    scope.executing = true;
    scope.check();
    const release = capacity.enter();
    try {
      const value = await abortable(action(scope), scope.signal);
      scope.check();
      if (reply.raw.destroyed) {
        scope.cleanup();
        return reply.hijack();
      }
      return value;
    } finally {
      release();
    }
  };
  app.setErrorHandler(
    (
      error: Error & {
        code?: string;
        validation?: unknown;
        statusCode?: number;
      },
      request,
      reply,
    ) => {
      if (reply.sent) return;
      const scope = scopes.get(request);
      let failure: ApiError;
      if (scope?.signal.aborted && scope.signal.reason instanceof ApiError)
        failure = scope.signal.reason;
      else if (error instanceof ApiError) failure = error;
      else if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE')
        failure = new ApiError('REQUEST_TOO_LARGE');
      else if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE')
        failure = new ApiError('UNSUPPORTED_MEDIA_TYPE');
      else if (error.validation || error.statusCode === 400)
        failure = new ApiError('INVALID_REQUEST');
      else failure = new ApiError('INTERNAL_ERROR');
      app.log.warn(
        {
          requestId: request.id,
          endpoint: request.routeOptions.url ?? 'unmatched',
          code: failure.code,
        },
        'request failed',
      );
      if (reply.raw.destroyed || failure.code === 'REQUEST_CANCELED') {
        scope?.cleanup();
        reply.hijack();
        return;
      }
      reply.code(failure.statusCode).send(failure.body(request.id));
    },
  );
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(new ApiError('NOT_FOUND').body(request.id)),
  );
  app.addHook('preClose', async () => {
    service.stop();
  });
  app.addHook('onClose', async () => {
    await service.close();
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (request, reply) =>
    execute(request, reply, reads, async ({ signal }) => {
      let readiness;
      try {
        readiness = await repository.readiness(signal);
      } catch {
        signal.throwIfAborted();
        readiness = { database: false, schema: false, schedule: false };
      }
      const ready =
        readiness.database && readiness.schema && readiness.schedule;
      if (!ready) reply.code(503);
      return {
        status: ready ? 'ready' : 'unready',
        ...readiness,
        capabilities: {
          metadata: ready,
          journeys: ready && Boolean(provider),
          walkingConfigured: Boolean(provider),
        },
      };
    }),
  );
  app.post(
    '/v1/journeys',
    {
      schema: {
        body: journeyRequestSchema,
        querystring: object({}),
        response: { 200: journeyResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      const input = journeyRequest(request.body);
      return execute(
        request,
        reply,
        journeys,
        ({ signal, observation, check }) =>
          service.journey(input, signal, observation, check),
      );
    },
  );
  for (const kind of ['stop', 'route'] as const) {
    app.get<{
      Params: { id: string };
      Querystring: { serviceDate: string; publicationId?: string };
    }>(
      `/v1/${kind}s/:id`,
      {
        schema: {
          params: object({
            id: { type: 'string', minLength: 1, maxLength: 256 },
          }),
          querystring: dateQuerySchema,
          response: {
            200: object({
              publicationId: { type: 'string' },
              serviceDate: { type: 'string' },
              data: kind === 'stop' ? stopSchema : routeSchema,
            }),
            ...errors,
          },
        },
      },
      async (request, reply) => {
        const date = serviceDate(request.query.serviceDate);
        return execute(request, reply, reads, ({ signal }) =>
          repository.metadata(
            kind,
            request.params.id,
            date,
            request.query.publicationId,
            signal,
          ),
        );
      },
    );
  }
  app.get<{
    Querystring: { serviceDate: string; latitude: string; longitude: string };
  }>(
    '/v1/stops/nearby',
    {
      schema: {
        querystring: nearbyQuerySchema,
        response: { 200: nearbyResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      const date = serviceDate(request.query.serviceDate);
      const point = queryCoordinate(request.query);
      return execute(request, reply, reads, ({ signal }) =>
        repository.nearby(point, date, signal),
      );
    },
  );
  return app;
}

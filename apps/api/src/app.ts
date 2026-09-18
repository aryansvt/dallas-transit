import Fastify, { type FastifyServerOptions } from 'fastify';

// Creating the app does not open a socket, so tests can use Fastify injection.
export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get('/health', async () => ({ status: 'ok' }));
  // No backing-service dependencies exist yet; this only reports app readiness.
  app.get('/ready', async () => ({ status: 'ready' }));

  return app;
}

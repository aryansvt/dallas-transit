import { buildApp } from './app.js';
import { readServerConfig, ServerConfigurationError } from './config.js';
import { configuredRealtime } from './realtime-config.js';

async function start() {
  const config = readServerConfig();
  const realtime = configuredRealtime(process.env, (event) => {
    app.log.info(event, 'realtime refresh');
  });
  const realtimeAgencyIds = realtime
    ? (process.env.DART_REALTIME_AGENCY_IDS?.split(',') ?? [])
    : [];
  if (
    realtimeAgencyIds.length > 8 ||
    realtimeAgencyIds.some((id) => !id || id.length > 256)
  )
    throw new Error('Invalid verified agency mapping');
  const app = buildApp(
    { logger: true },
    { config, ...(realtime ? { realtime, realtimeAgencyIds } : {}) },
  );
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    // Render gets a bounded shutdown even if an upstream socket fails to close.
    const deadline = setTimeout(() => {
      app.log.error(
        { code: 'SHUTDOWN_TIMEOUT' },
        'API shutdown exceeded deadline',
      );
      process.exit(1);
    }, 25000);
    deadline.unref();
    void app
      .close()
      .catch(() => {
        app.log.error({ code: 'SHUTDOWN_FAILED' }, 'API shutdown failed');
        process.exit(1);
      })
      .finally(() => clearTimeout(deadline));
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, shutdown);
  app.addHook('onClose', async () => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.removeListener(signal, shutdown);
  });
  try {
    // Probe shared resources once before serving. A missing provider or database
    // permits liveness/diagnostics; /ready reports capability explicitly.
    await app.inject({ method: 'GET', url: '/ready' });
    await app.listen({ host: config.host, port: config.port });
    realtime?.start();
  } catch {
    app.log.error({ code: 'STARTUP_FAILED' }, 'API startup failed');
    process.exitCode = 1;
    await app.close();
  }
}
try {
  await start();
} catch (error) {
  console.error(
    error instanceof ServerConfigurationError
      ? error.message
      : 'API configuration or startup failed. Check server configuration.',
  );
  process.exitCode = 1;
}

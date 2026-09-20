import { buildApp } from './app.js';
import { readServerConfig } from './config.js';

async function start() {
  const config = readServerConfig();
  const app = buildApp({ logger: true }, { config });
  const shutdown = () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
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
  } catch {
    app.log.error({ code: 'STARTUP_FAILED' }, 'API startup failed');
    process.exitCode = 1;
    await app.close();
  }
}
try {
  await start();
} catch {
  console.error(
    'API configuration or startup failed. Check server configuration.',
  );
  process.exitCode = 1;
}

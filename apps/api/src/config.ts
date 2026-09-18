export function readServerConfig(env: NodeJS.ProcessEnv = process.env) {
  const rawPort = env.PORT ?? '3001';
  const port = Number(rawPort);
  if (
    !/^\d+$/.test(rawPort) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const host = env.HOST ?? '127.0.0.1';
  if (host.trim().length === 0) {
    throw new Error('HOST must not be empty');
  }

  return { host, port };
}

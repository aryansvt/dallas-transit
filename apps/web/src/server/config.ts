// Imported only by Next server entry points. Never expose through next.config.env.
export function proxyConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const production = env.NODE_ENV === 'production';
  try {
    if (production && !env.TRANSIT_API_ORIGIN) throw new Error();
    const origin = new URL(env.TRANSIT_API_ORIGIN ?? 'http://127.0.0.1:3001');
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== '/'
    )
      throw new Error();
    if (production && origin.protocol !== 'https:') throw new Error();
    const key = env.TRANSIT_PROXY_KEY;
    if (
      (production || key !== undefined) &&
      !/^[A-Za-z0-9_-]{32,128}$/.test(key ?? '')
    )
      throw new Error();
    return { origin: origin.origin, key };
  } catch {
    throw new Error(
      'Configure a server-only TRANSIT_API_ORIGIN (HTTPS in production) and 32–128 character TRANSIT_PROXY_KEY.',
    );
  }
}

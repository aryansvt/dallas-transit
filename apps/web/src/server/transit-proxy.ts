import { proxyConfig } from './config';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const failure = (code = 'SERVICE_UNAVAILABLE', status = 503) =>
  Response.json(
    { error: { code } },
    {
      status,
      headers: {
        ...headers,
        ...(status === 429 ? { 'Retry-After': '2' } : {}),
      },
    },
  );

async function boundedBody(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal,
) {
  if (!stream) return '';
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        cancel();
        throw new RangeError('Body too large');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/** Fixed route allowlist, no forwarding of cookies, host, authorization or IPs. */
export async function transitProxy(
  request: Request,
  path: string[],
  env: Record<string, string | undefined> = process.env,
  fetcher = fetch,
) {
  const route = path.join('/');
  const allowed =
    request.method === 'POST'
      ? /^journeys(?:\/[a-f0-9-]{36}\/replan)?$/i.test(route)
      : request.method === 'GET' &&
        /^(?:places\/search|stops\/nearby|(?:stops|routes)\/[^/\\]+|journeys\/[a-f0-9-]{36}\/live)$/i.test(
          route,
        );
  if (
    !allowed ||
    path.some((p) => p === '.' || p === '..' || /[/\\?#\u0000-\u001f]/.test(p))
  )
    return failure('NOT_FOUND', 404);
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    return failure('INVALID_REQUEST', 403);
  if (
    request.method === 'POST' &&
    request.headers.get('content-type')?.split(';')[0]?.trim() !==
      'application/json'
  )
    return failure('INVALID_REQUEST', 415);
  const timer = new AbortController();
  const deadline = setTimeout(() => timer.abort(), 32000);
  const signal = AbortSignal.any([request.signal, timer.signal]);
  try {
    const config = proxyConfig(env);
    signal.throwIfAborted();
    let body: string | undefined;
    if (request.method === 'POST') {
      try {
        body = await boundedBody(request.body, 4096, signal);
      } catch (error) {
        if (error instanceof RangeError)
          return failure('REQUEST_TOO_LARGE', 413);
        throw error;
      }
    }
    const target = new URL(
      `/v1/${path.map(encodeURIComponent).join('/')}`,
      config.origin,
    );
    const input = new URL(request.url);
    // Unknown parameters (including proxy targets) never reach the API.
    const permitted =
      route === 'places/search'
        ? ['q', 'serviceDate', 'publicationId']
        : route === 'stops/nearby'
          ? ['latitude', 'longitude', 'serviceDate']
          : /^(stops|routes)\//.test(route)
            ? ['serviceDate', 'publicationId']
            : [];
    for (const [key, value] of input.searchParams) {
      if (
        !permitted.includes(key) ||
        target.searchParams.has(key) ||
        value.length > 256
      )
        return failure('INVALID_REQUEST', 400);
      target.searchParams.set(key, value);
    }
    const response = await fetcher(target, {
      method: request.method,
      cache: 'no-store',
      redirect: 'error',
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(config.key ? { 'x-linefinder-key': config.key } : {}),
      },
      ...(body !== undefined ? { body } : {}),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      await response.body?.cancel();
      return failure();
    }
    const text = await boundedBody(response.body, 2 * 1024 * 1024, signal);
    const data: unknown = JSON.parse(text);
    if (response.ok) return Response.json(data, { headers });
    const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
    const codes = [
      'INVALID_REQUEST',
      'REQUEST_TOO_LARGE',
      'NOT_FOUND',
      'NO_PUBLICATION',
      'WALKING_NOT_CONFIGURED',
      'WALKING_UNAVAILABLE',
      'WALKING_TIMEOUT',
      'PUBLICATION_CHANGED',
      'DATABASE_UNAVAILABLE',
      'SERVER_BUSY',
      'REQUEST_TIMEOUT',
      'SERVICE_UNAVAILABLE',
    ];
    return failure(
      typeof code === 'string' && codes.includes(code)
        ? code
        : 'SERVICE_UNAVAILABLE',
      response.status >= 400 && response.status < 600 ? response.status : 503,
    );
  } catch {
    return failure(
      timer.signal.aborted ? 'REQUEST_TIMEOUT' : 'SERVICE_UNAVAILABLE',
      timer.signal.aborted ? 504 : 503,
    );
  } finally {
    clearTimeout(deadline);
  }
}

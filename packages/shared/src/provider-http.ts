/** Transport errors contain codes only, never URLs, credentials or bodies. */
export class ProviderError extends Error {
  constructor(
    readonly code:
      | 'timeout'
      | 'rate-limited'
      | 'unauthorized'
      | 'provider-unavailable'
      | 'invalid-response',
  ) {
    super(code);
  }
}
export async function providerJson(
  url: URL,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = 3000,
  maxBytes = 262144,
): Promise<unknown> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_, reject) => {
      cancel = () =>
        reject(signal.aborted ? signal.reason : new ProviderError('timeout'));
      combined.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => controller.abort(), timeoutMs);
    });
    const work = async () => {
      const response = await fetcher(url, {
        signal: combined,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
      if (combined.aborted) {
        await response.body?.cancel();
        combined.throwIfAborted();
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderError(
          response.status === 429
            ? 'rate-limited'
            : [401, 403].includes(response.status)
              ? 'unauthorized'
              : 'provider-unavailable',
        );
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        throw new ProviderError('invalid-response');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ProviderError('invalid-response');
      const chunks: Uint8Array[] = [];
      let size = 0;
      const stop = () => {
        void reader.cancel().catch(() => {});
      };
      combined.addEventListener('abort', stop, { once: true });
      try {
        for (;;) {
          combined.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new ProviderError('invalid-response');
          }
          chunks.push(value);
        }
      } finally {
        combined.removeEventListener('abort', stop);
        reader.releaseLock();
      }
      combined.throwIfAborted();
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        return JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        ) as unknown;
      } catch {
        throw new ProviderError('invalid-response');
      }
    };
    return await Promise.race([work(), aborted]);
  } catch (error) {
    signal.throwIfAborted();
    if (controller.signal.aborted) throw new ProviderError('timeout');
    throw error instanceof ProviderError
      ? error
      : new ProviderError('provider-unavailable');
  } finally {
    clearTimeout(timer);
    if (cancel) combined.removeEventListener('abort', cancel);
  }
}

import { afterEach, expect, it, vi } from 'vitest';
import { providerJson } from './provider-http.js';
const url = new URL('https://example.invalid/?key=private');
afterEach(() => vi.useRealTimers());
it('cancels a late body even when an uncooperative fetch resolves after cancellation', async () => {
  let complete!: (value: Response) => void;
  const controller = new AbortController();
  const pending = providerJson(
    url,
    controller.signal,
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const checked = expect(pending).rejects.toThrow('canceled');
  controller.abort(new Error('canceled'));
  await checked;
  const cancel = vi.fn();
  complete(new Response(new ReadableStream({ cancel })));
  await Promise.resolve();
  await Promise.resolve();
  expect(cancel).toHaveBeenCalled();
});
it('bounds streamed-body latency and cancels the reader', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{'));
      },
      cancel,
    }),
  );
  const pending = providerJson(
    url,
    new AbortController().signal,
    async () => response,
  );
  const checked = expect(pending).rejects.toMatchObject({ code: 'timeout' });
  await vi.advanceTimersByTimeAsync(3000);
  await checked;
  expect(cancel).toHaveBeenCalled();
});
it('rejects invalid JSON and sanitizes thrown provider URLs', async () => {
  await expect(
    providerJson(
      url,
      new AbortController().signal,
      async () => new Response('{'),
    ),
  ).rejects.toMatchObject({ code: 'invalid-response' });
  await expect(
    providerJson(url, new AbortController().signal, async () => {
      throw new Error(url.toString());
    }),
  ).rejects.toMatchObject({ message: 'provider-unavailable' });
});

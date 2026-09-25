import { afterEach, expect, it, vi } from 'vitest';
import {
  SnapshotGroup,
  SnapshotLifecycle,
  httpFeedProvider,
} from './lifecycle.js';
import { freshness } from './freshness.js';
import { MAX_FEED_BYTES } from './parse.js';
import { now, publicationId, tripEntity, wire } from './test-support.js';
afterEach(() => vi.useRealTimers());

it('starts at most one polling loop and releases it on shutdown', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
  const fetcher = vi.fn(async () => wire());
  const lifecycle = new SnapshotLifecycle({ fetch: fetcher }, publicationId);
  lifecycle.start();
  lifecycle.start();
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await lifecycle.close();
  await vi.advanceTimersByTimeAsync(120000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('shares one fetch across rapid updates and enforces a responsible minimum interval', async () => {
  let clock = now;
  const fetcher = vi.fn(async () => wire());
  const lifecycle = new SnapshotLifecycle({ fetch: fetcher }, publicationId, {
    now: () => clock,
  });
  await Promise.all(Array.from({ length: 100 }, () => lifecycle.refresh()));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await lifecycle.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);
  clock += 60;
  await lifecycle.refresh();
  expect(fetcher).toHaveBeenCalledTimes(2);
  await lifecycle.close();
  expect(
    () =>
      new SnapshotLifecycle({ fetch: fetcher }, publicationId, {
        intervalMs: 5000,
      }),
  ).toThrow();
});
it('preserves last valid feed on outage, expires it and recovers with a newer snapshot', async () => {
  let clock = now;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(wire())
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(wire([], now + 1000));
  const lifecycle = new SnapshotLifecycle({ fetch: fetcher }, publicationId, {
    now: () => clock,
  });
  await lifecycle.refresh();
  clock += 360;
  await lifecycle.refresh();
  expect(freshness(lifecycle.current(publicationId), clock)).toBe('STALE');
  expect(lifecycle.current('another-publication')).toBeNull();
  clock += 600;
  await lifecycle.refresh();
  expect(lifecycle.current(publicationId)).toBeNull();
  clock = now + 1020;
  await lifecycle.refresh();
  expect(freshness(lifecycle.current(publicationId), clock)).toBe('LIVE');
  await lifecycle.close();
});
it('rejects out-of-order and equal feed clocks without refreshing receipt time', async () => {
  let clock = now;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(wire())
    .mockResolvedValueOnce(wire([], now - 1))
    .mockResolvedValueOnce(wire());
  const observe = vi.fn();
  const lifecycle = new SnapshotLifecycle({ fetch: fetcher }, publicationId, {
    now: () => clock,
    observe,
  });
  await lifecycle.refresh();
  clock += 60;
  await lifecycle.refresh();
  clock += 60;
  await lifecycle.refresh();
  expect(lifecycle.current(publicationId)?.receivedAt).toBe(now);
  expect(
    observe.mock.calls.filter(([e]) => e.status === 'out-of-order'),
  ).toHaveLength(2);
  await lifecycle.close();
});
it('drops a regressed entity clock under a newer feed clock', async () => {
  let clock = now;
  const old = tripEntity();
  old.tripUpdate.timestamp = now - 1;
  const lifecycle = new SnapshotLifecycle(
    {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(wire())
        .mockResolvedValueOnce(wire([old], now + 60)),
    },
    publicationId,
    { now: () => clock },
  );
  await lifecycle.refresh();
  clock += 60;
  await lifecycle.refresh();
  expect(lifecycle.current(publicationId)?.trips).toHaveLength(0);
  await lifecycle.close();
});
it('times out an uncooperative provider and closes an in-flight refresh', async () => {
  vi.useFakeTimers();
  let received: AbortSignal | undefined;
  const lifecycle = new SnapshotLifecycle(
    {
      fetch: async (signal) => {
        received = signal;
        return new Promise(() => {});
      },
    },
    publicationId,
    { timeoutMs: 100 },
  );
  const waiting = lifecycle.refresh();
  await vi.advanceTimersByTimeAsync(101);
  await waiting;
  expect(received?.aborted).toBe(true);
  expect(lifecycle.current(publicationId)).toBeNull();
  await lifecycle.close();
  const other = new SnapshotLifecycle(
    { fetch: async () => new Promise(() => {}) },
    publicationId,
  );
  void other.refresh();
  await other.close();
  expect(other.current(publicationId)).toBeNull();
});
it('retains valid data when protobuf is malformed', async () => {
  let clock = now;
  const lifecycle = new SnapshotLifecycle(
    {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(wire())
        .mockResolvedValueOnce(new Uint8Array([255])),
    },
    publicationId,
    { now: () => clock },
  );
  await lifecycle.refresh();
  clock += 60;
  await lifecycle.refresh();
  expect(lifecycle.current(publicationId)?.trips).toHaveLength(2);
  await lifecycle.close();
});
it('handles separate products without lending a fresh vehicle envelope to old predictions', async () => {
  const a = new SnapshotLifecycle(
    { fetch: async () => wire() },
    publicationId,
    { now: () => now + 301 },
  );
  const b = new SnapshotLifecycle(
    { fetch: async () => wire([], now + 301) },
    publicationId,
    { now: () => now + 301 },
  );
  const group = new SnapshotGroup([a, b]);
  await group.refresh();
  expect(freshness(group.current(publicationId), now + 301)).toBe('STALE');
  await group.close();
});
it('validates content type, status, advertised size and actual streamed size', async () => {
  const responses = [
    new Response('', { status: 503 }),
    new Response('html', { headers: { 'content-type': 'text/html' } }),
    new Response('x', {
      headers: {
        'content-type': 'application/protobuf',
        'content-length': String(MAX_FEED_BYTES + 1),
      },
    }),
    new Response(new Uint8Array(MAX_FEED_BYTES + 1), {
      headers: { 'content-type': 'application/protobuf' },
    }),
  ];
  for (const response of responses) {
    const fetcher = vi.fn(async () => response);
    await expect(
      httpFeedProvider(
        'https://example.org/documented-feed',
        {},
        fetcher,
      ).fetch(new AbortController().signal),
    ).rejects.toThrow();
  }
});
it('accepts protobuf with charset metadata, disables redirects and keeps auth server-side', async () => {
  const bytes = wire();
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(bytes, {
        headers: { 'content-type': 'application/x-protobuf; charset=binary' },
      }),
  );
  expect(
    await httpFeedProvider(
      'https://example.org/feed',
      { 'Test-Key': 'fixture-secret' },
      fetcher,
    ).fetch(new AbortController().signal),
  ).toEqual(new Uint8Array(bytes));
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    redirect: 'error',
    headers: { 'Test-Key': 'fixture-secret' },
  });
  expect(() => httpFeedProvider('http://example.org/feed')).toThrow();
  expect(() =>
    httpFeedProvider('https://example.org/feed?key=secret'),
  ).toThrow();
});

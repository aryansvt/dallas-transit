import { MAX_FEED_BYTES, parseFeed } from './parse.js';
import type { Snapshot } from './types.js';

export interface FeedProvider {
  fetch(signal: AbortSignal): Promise<Uint8Array>;
}
/** Only server/operator-supplied URLs, never a browser-controlled proxy. */
export function httpFeedProvider(
  url: string,
  headers: Readonly<Record<string, string>> = {},
  fetcher: typeof fetch = fetch,
): FeedProvider {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search
  )
    throw new Error('invalid-provider-url');
  return {
    async fetch(signal) {
      const response = await fetcher(url, {
        headers: {
          Accept:
            'application/x-protobuf, application/protobuf, application/octet-stream',
          ...headers,
        },
        signal,
        redirect: 'error',
      });
      if (!response.ok) throw new Error('provider-unavailable');
      const type = response.headers.get('content-type')?.split(';')[0]?.trim();
      if (
        ![
          'application/x-protobuf',
          'application/protobuf',
          'application/octet-stream',
        ].includes(type ?? '')
      ) {
        await response.body?.cancel();
        throw new Error('content-type');
      }
      const size = Number(response.headers.get('content-length'));
      if (!Number.isFinite(size) || size > MAX_FEED_BYTES) {
        await response.body?.cancel();
        throw new Error('payload-size');
      }
      if (!response.body) throw new Error('empty-body');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          signal.throwIfAborted();
          const next = await reader.read();
          if (next.done) break;
          length += next.value.length;
          if (length > MAX_FEED_BYTES) throw new Error('payload-size');
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    },
  };
}
export interface SnapshotSource {
  current(publicationId: string): Snapshot | null;
  refresh(): Promise<void>;
  close(): Promise<void>;
}
export interface FeedObservation {
  status: 'ok' | 'failed' | 'out-of-order';
  parseMs?: number;
  normalizeMs?: number;
  diagnostics?: Record<string, number>;
}

/** One bounded, single-flight feed lifecycle per process. Clients never initiate extra polls. */
export class SnapshotLifecycle implements SnapshotSource {
  private snapshot: Snapshot | null = null;
  private flight: Promise<void> | null = null;
  private nextRefresh = 0;
  private running = false;
  private readonly shutdown = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly provider: FeedProvider,
    private readonly publicationId: string,
    private readonly options: {
      intervalMs?: number;
      timeoutMs?: number;
      now?: () => number;
      observe?: (event: FeedObservation) => void;
    } = {},
  ) {
    if (
      (options.intervalMs ?? 60000) < 60000 ||
      (options.timeoutMs ?? 5000) < 1
    )
      throw new Error('invalid-poll-policy');
  }
  private now() {
    return this.options.now?.() ?? Date.now() / 1000;
  }
  current(publicationId: string) {
    if (publicationId !== this.publicationId || !this.snapshot) return null;
    // Retain a short stale window for an honest explanation, then erase the payload.
    if (this.now() - this.snapshot.receivedAt > 900) this.snapshot = null;
    return this.snapshot;
  }
  refresh(): Promise<void> {
    if (this.flight) return this.flight;
    if (this.shutdown.signal.aborted || this.now() < this.nextRefresh)
      return Promise.resolve();
    this.nextRefresh = this.now() + (this.options.intervalMs ?? 60000) / 1000;
    this.flight = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.options.timeoutMs ?? 5000,
      );
      const signal = AbortSignal.any([controller.signal, this.shutdown.signal]);
      let aborted: (() => void) | undefined;
      try {
        const bytes = await Promise.race([
          this.provider.fetch(signal),
          new Promise<never>((_, reject) => {
            aborted = () => reject(new Error('provider-aborted'));
            signal.addEventListener('abort', aborted, { once: true });
            if (signal.aborted) aborted();
          }),
        ]);
        signal.throwIfAborted();
        const next = parseFeed(bytes, this.publicationId, this.now());
        if (
          this.snapshot?.sourceTimestamp !== null &&
          this.snapshot?.sourceTimestamp !== undefined &&
          (next.sourceTimestamp === null ||
            next.sourceTimestamp <= this.snapshot.sourceTimestamp)
        ) {
          this.options.observe?.({ status: 'out-of-order' });
          return;
        }
        // Entity clocks may regress even while the envelope advances. Drop those
        // entities; retaining them under the newer envelope would fake freshness.
        for (const kind of ['trips', 'vehicles'] as const) {
          const old = new Map(
            this.snapshot?.[kind].map((v) => [
              JSON.stringify(v.identity),
              v.timestamp,
            ]) ?? [],
          );
          const values = next[kind].filter((v) => {
            const before = old.get(JSON.stringify(v.identity));
            return (
              before == null || (v.timestamp !== null && v.timestamp >= before)
            );
          });
          if (kind === 'trips') next.trips = values as Snapshot['trips'];
          else next.vehicles = values as Snapshot['vehicles'];
        }
        this.snapshot = next;
        this.options.observe?.({
          status: 'ok',
          ...next.metrics,
          diagnostics: next.diagnostics,
        });
      } catch {
        this.options.observe?.({ status: 'failed' });
      } finally {
        clearTimeout(timeout);
        if (aborted) signal.removeEventListener('abort', aborted);
      }
    })().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  start() {
    if (this.running || this.shutdown.signal.aborted) return;
    this.running = true;
    const poll = async () => {
      await this.refresh();
      if (!this.shutdown.signal.aborted) {
        this.timer = setTimeout(
          () => void poll(),
          this.options.intervalMs ?? 60000,
        );
        this.timer.unref();
      }
    };
    void poll();
  }
  async close() {
    this.shutdown.abort();
    clearTimeout(this.timer);
    await this.flight;
    this.snapshot = null;
  }
}

/** Independently retained feed products; conservative combined age never promotes an old product to live. */
export class SnapshotGroup implements SnapshotSource {
  constructor(readonly sources: readonly SnapshotLifecycle[]) {
    if (sources.length > 3) throw new Error('too-many-feeds');
  }
  start() {
    this.sources.forEach((s) => s.start());
  }
  async refresh() {
    await Promise.all(this.sources.map((s) => s.refresh()));
  }
  current(publicationId: string): Snapshot | null {
    const snapshots = this.sources
      .map((s) => s.current(publicationId))
      .filter((s): s is Snapshot => s !== null);
    if (!snapshots.length) return null;
    return {
      publicationId,
      sourceTimestamp: snapshots.some((s) => s.sourceTimestamp === null)
        ? null
        : Math.min(...snapshots.map((s) => s.sourceTimestamp!)),
      receivedAt: Math.min(...snapshots.map((s) => s.receivedAt)),
      trips: snapshots.flatMap((s) => s.trips),
      vehicles: snapshots.flatMap((s) => s.vehicles),
      alerts: snapshots.flatMap((s) => s.alerts),
      diagnostics: {},
      metrics: { parseMs: 0, normalizeMs: 0 },
    };
  }
  async close() {
    await Promise.all(this.sources.map((s) => s.close()));
  }
}

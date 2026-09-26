import type { RoutingSchedule } from '@dallas-transit/router';
import { abortable, Capacity } from './async.js';
import { ApiError } from './errors.js';

export interface PreparedSchedule {
  readonly expiresAt?: number;
  readonly schedule: RoutingSchedule;
  readonly preparationMs: number;
}
export interface ScheduleSource {
  publication(date: string, signal: AbortSignal): Promise<string | null>;
  load(date: string, signal: AbortSignal): Promise<PreparedSchedule | null>;
}
interface Flight {
  controller: AbortController;
  promise: Promise<PreparedSchedule>;
  waiters: number;
}

/** Immutable schedules only, never journey results or mutable request state. */
export class PreparedSchedules {
  private readonly entries = new Map<
    string,
    { value: PreparedSchedule; expires: number; date: string }
  >();
  private readonly flights = new Map<string, Flight>();
  private readonly builds = new Capacity(1);
  private closed = false;
  constructor(
    private readonly source: ScheduleSource,
    private readonly options: {
      sourceKey: string;
      changeSeconds: number;
      maximum: number;
      ttlMs: number;
    },
    private readonly now: () => number = Date.now,
  ) {}

  async get(date: string, signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.closed) throw new ApiError('SERVICE_UNAVAILABLE');
    const publication = await this.source.publication(date, signal);
    signal.throwIfAborted();
    if (this.closed) throw new ApiError('SERVICE_UNAVAILABLE');
    const key = JSON.stringify([
      this.options.sourceKey,
      publication,
      date,
      this.options.changeSeconds,
    ]);
    for (const [other, entry] of this.entries) {
      if (entry.expires <= this.now() || (entry.date === date && other !== key))
        this.entries.delete(other);
    }
    if (!publication) throw new ApiError('NO_PUBLICATION');
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { ...cached.value, cache: 'hit' as const, key };
    }
    let flight = this.flights.get(key);
    // The last waiter may have canceled while the adapter is still releasing
    // its client. A new caller must not inherit that caller's cancellation.
    if (flight?.controller.signal.aborted) throw new ApiError('SERVER_BUSY');
    const joined = Boolean(flight);
    if (!flight) {
      const release = this.builds.enter();
      const controller = new AbortController();
      flight = {
        controller,
        waiters: 0,
        promise: Promise.resolve()
          .then(async () => {
            const value = await this.source.load(date, controller.signal);
            controller.signal.throwIfAborted();
            if (!value) throw new ApiError('NO_PUBLICATION');
            if (
              value.schedule.publicationId !== publication ||
              value.schedule.serviceDate !== date
            )
              throw new ApiError('PUBLICATION_CHANGED');
            if (!this.closed) {
              this.entries.set(key, {
                value,
                date,
                expires: Math.min(
                  this.now() + this.options.ttlMs,
                  value.expiresAt ?? Infinity,
                ),
              });
              while (this.entries.size > this.options.maximum)
                this.entries.delete(this.entries.keys().next().value!);
            }
            return value;
          })
          .finally(() => {
            this.flights.delete(key);
            release();
          }),
      };
      this.flights.set(key, flight);
    }
    flight.waiters++;
    try {
      const value = await abortable(flight.promise, signal);
      signal.throwIfAborted();
      return {
        ...value,
        cache: joined ? ('shared' as const) : ('miss' as const),
        key,
      };
    } finally {
      if (--flight.waiters === 0 && this.flights.get(key) === flight)
        flight.controller.abort(new ApiError('REQUEST_CANCELED'));
    }
  }
  invalidate(key: string) {
    this.entries.delete(key);
  }
  async close() {
    this.closed = true;
    this.entries.clear();
    for (const flight of this.flights.values())
      flight.controller.abort(new ApiError('SERVICE_UNAVAILABLE'));
    await Promise.allSettled([...this.flights.values()].map((f) => f.promise));
  }
}

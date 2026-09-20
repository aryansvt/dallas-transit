import pg from 'pg';
import { abortable, Capacity } from './async.js';
import { ApiError } from './errors.js';
import type { ApiConfig } from './config.js';

/** A pool-owned idle client is reserved for the entire adapter transaction. */
export class ApiDatabase {
  readonly pool: pg.Pool;
  private readonly capacity: Capacity;
  constructor(config: ApiConfig, onIdleError: () => void = () => {}) {
    this.pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: config.poolSize,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30000,
      statement_timeout: 5000,
      idle_in_transaction_session_timeout: 5000,
      application_name: 'dallas-transit-api',
    });
    // Idle errors must be observed; never emit credential-bearing pg errors.
    this.pool.on('error', onIdleError);
    this.capacity = new Capacity(config.poolSize + 16);
  }
  async use<T>(
    signal: AbortSignal,
    action: (db: Pick<pg.Client, 'query'>) => Promise<T>,
  ): Promise<T> {
    signal.throwIfAborted();
    const leave = this.capacity.enter();
    let client: pg.PoolClient | undefined;
    let acquisitionSettled = false;
    let released = false;
    const release = (destroy = false) => {
      if (client && !released) {
        released = true;
        client.release(destroy);
      }
    };
    const cancel = () => release(true);
    try {
      const acquiring = this.pool
        .connect()
        .then((acquired) => {
          client = acquired;
          if (signal.aborted) release(true);
          return acquired;
        })
        .finally(() => {
          acquisitionSettled = true;
          if (signal.aborted) leave();
        });
      await abortable(acquiring, signal);
      signal.throwIfAborted();
      signal.addEventListener('abort', cancel, { once: true });
      // Preserve pg's query API, checking cancellation before every cursor fetch
      // and transaction step. Destroying on abort interrupts an active query.
      const guarded = new Proxy(client!, {
        get(target, property) {
          if (property === 'query')
            return (...args: Parameters<pg.Client['query']>) => {
              signal.throwIfAborted();
              return target.query(...args);
            };
          return Reflect.get(target, property);
        },
      });
      const result = await action(guarded);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      release(true); // Failed/uncertain transactions never reenter the pool.
      signal.throwIfAborted();
      if (error instanceof ApiError) throw error;
      throw new ApiError('DATABASE_UNAVAILABLE');
    } finally {
      signal.removeEventListener('abort', cancel);
      release();
      // A canceled pg-pool acquisition cannot be dequeued via its public API.
      // Keep admission occupied until it settles (<= connectionTimeoutMillis).
      if (acquisitionSettled) leave();
    }
  }
  async close() {
    await this.pool.end();
  }
}

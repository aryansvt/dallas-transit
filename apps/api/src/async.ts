import { ApiError } from './errors.js';

/** Waiter cancellation does not implicitly cancel a shared operation. */
export async function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        cancel = () => reject(signal.reason);
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
      }),
    ]);
  } finally {
    if (cancel) signal.removeEventListener('abort', cancel);
  }
}

/** No queue: capacity is bounded independently of client arrival rate. */
export class Capacity {
  private active = 0;
  constructor(private readonly maximum: number) {}
  enter() {
    if (this.active >= this.maximum) throw new ApiError('SERVER_BUSY');
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }
}

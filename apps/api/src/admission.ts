import { timingSafeEqual } from 'node:crypto';

export function authorized(actual: unknown, expected: string): boolean {
  return (
    typeof actual === 'string' &&
    Buffer.byteLength(actual) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
}

/** Single-instance token budget. No caller identity or IP address is retained.
 * A burst of 120 units refills at two/second; planning costs four units.
 */
export function requestBudget(now = () => performance.now()) {
  let tokens = 120;
  let updated = now();
  return (cost: number) => {
    const current = now();
    tokens = Math.min(120, tokens + Math.max(0, current - updated) / 500);
    updated = current;
    if (tokens < cost) return false;
    tokens -= cost;
    return true;
  };
}

export function integer(
  value: number,
  name: string,
  maximum = 2147483647,
): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new RangeError(`${name} must be a nonnegative integer <= ${maximum}`);
}

export function identifier(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${name} must be a nonempty string`);
}

export function serviceDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    throw new Error('Expected service date YYYY-MM-DD');
  const day = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(day.valueOf()) ||
    day.toISOString().slice(0, 10) !== value
  )
    throw new Error('Invalid service date');
}

/** Code-unit ordering is independent of the host's language/locale. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

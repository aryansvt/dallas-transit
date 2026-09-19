import { parseGtfsDate, parseServiceTime } from './time.js';

export type Scalar = string | number | null;
export interface Field<T extends Scalar = Scalar> {
  readonly required: boolean;
  readonly parse: (value: string) => T;
}

export const text: Field<string> = { required: true, parse: (v) => v };
export const id: Field<string> = {
  required: true,
  parse(v) {
    if (
      v.trim() !== v ||
      [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      throw new Error(
        'Expected an unpadded identifier without control characters',
      );
    return v;
  },
};
export function optional<T extends Scalar>(field: Field<T>): Field<T | null> {
  return { required: false, parse: (v) => (v === '' ? null : field.parse(v)) };
}
export function integer(min = 0, max = 2147483647): Field<number> {
  return {
    required: true,
    parse(v) {
      const n = Number(v);
      if (!/^\d+$/.test(v) || !Number.isSafeInteger(n) || n < min || n > max)
        throw new Error(`Expected integer in ${min}..${max}`);
      return n;
    },
  };
}
export function enumeration(...values: number[]): Field<number> {
  return {
    required: true,
    parse(v) {
      const n = integer().parse(v);
      if (!values.includes(n))
        throw new Error(`Expected one of ${values.join(', ')}`);
      return n;
    },
  };
}
/** Decimal text is preserved for PostgreSQL numeric, avoiding premature rounding. */
export function decimal(min: number, max = Number.MAX_VALUE): Field<string> {
  return {
    required: true,
    parse(v) {
      const n = Number(v);
      if (
        !/^-?\d+(\.\d+)?$/.test(v) ||
        !Number.isFinite(n) ||
        n < min ||
        n > max
      )
        throw new Error(`Expected decimal in ${min}..${max}`);
      return v;
    },
  };
}
export const date: Field<string> = { required: true, parse: parseGtfsDate };
export const time: Field<number> = {
  required: true,
  parse: (v) => parseServiceTime(v).secondsFromServiceDayStart,
};
export const url: Field<string> = {
  required: true,
  parse(v) {
    const parsed = new URL(v);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error('Expected public HTTP(S) URL without credentials');
    return v;
  },
};
export const timezone: Field<string> = {
  required: true,
  parse(v) {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return v;
  },
};
export const color: Field<string> = {
  required: true,
  parse(v) {
    if (!/^[0-9a-fA-F]{6}$/.test(v))
      throw new Error('Expected six hexadecimal color digits');
    return v;
  },
};

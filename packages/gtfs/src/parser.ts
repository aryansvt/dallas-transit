import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';
import { schemas, type GtfsFile, type NormalizedRecord } from './schema.js';
import type { Scalar } from './fields.js';

export interface ParsedRecord<F extends GtfsFile> {
  /** One-based CSV record number including header; quoted newlines do not increment it. */
  record: number;
  data: NormalizedRecord<F>;
  raw: Record<string, string>;
  extra: Record<string, string>;
}

async function* decode(
  source: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const chunk of source)
    yield decoder.decode(chunk, { stream: true });
  yield decoder.decode();
}

export async function* parseGtfs<F extends GtfsFile>(
  file: F,
  source: AsyncIterable<Uint8Array>,
): AsyncGenerator<ParsedRecord<F>> {
  let headerSeen = false;
  let record = 1;
  const schema = schemas[file];
  const parser = parse({
    bom: true,
    skip_empty_lines: false,
    max_record_size: 1024 * 1024,
    columns: (headers: string[]) => {
      headerSeen = true;
      if (
        headers.some((h) => !h || h.trim() !== h) ||
        new Set(headers).size !== headers.length
      )
        throw new Error('Empty, padded, or duplicate header');
      for (const [name, field] of Object.entries(schema)) {
        if (field.required && !headers.includes(name))
          throw new Error(`Missing required column ${name}`);
      }
      return headers;
    },
  });
  // Attach rejection handling immediately; pipeline propagates source/UTF-8 failures.
  const pumping = pipeline(Readable.from(decode(source)), parser).catch(
    (error: unknown) => error,
  );
  try {
    for await (const value of parser) {
      record++;
      const raw = value as Record<string, string>;
      const data: Record<string, Scalar> = {};
      const extra: Record<string, string> = {};
      for (const [name, field] of Object.entries(schema)) {
        const input = raw[name] ?? '';
        try {
          if (input.includes('\0')) throw new Error('NUL is not allowed');
          if (field.required && input.trim() === '')
            throw new Error('Required value is empty');
          data[name] = field.parse(input);
        } catch (error) {
          throw new Error(
            `${name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      for (const [name, input] of Object.entries(raw)) {
        if (input.includes('\0'))
          throw new Error(`${name}: NUL is not allowed`);
        if (!Object.hasOwn(schema, name))
          Object.defineProperty(extra, name, {
            value: input,
            enumerable: true,
          });
      }
      if (
        file === 'routes.txt' &&
        !data.route_short_name &&
        !data.route_long_name
      )
        throw new Error('route_short_name or route_long_name is required');
      if (
        file === 'calendar.txt' &&
        String(data.start_date) > String(data.end_date)
      )
        throw new Error('start_date follows end_date');
      if (
        file === 'feed_info.txt' &&
        ((data.feed_start_date === null) !== (data.feed_end_date === null) ||
          (data.feed_start_date &&
            data.feed_end_date &&
            data.feed_start_date > data.feed_end_date))
      )
        throw new Error('Invalid feed date range');
      if (file === 'stop_times.txt') {
        if ((data.arrival_time === null) !== (data.departure_time === null))
          throw new Error(
            'arrival_time and departure_time must both be present or absent',
          );
        if (data.arrival_time === null && data.timepoint !== 0)
          throw new Error(
            'Exact/default timepoint requires arrival_time and departure_time',
          );
        if (Number(data.departure_time) < Number(data.arrival_time))
          throw new Error('departure_time precedes arrival_time');
      }
      yield { record, data: data as NormalizedRecord<F>, raw, extra };
    }
    const failure = await pumping;
    if (failure) throw failure;
    if (!headerSeen) throw new Error('Missing CSV header');
  } catch (error) {
    throw new Error(
      `${file} record ${record}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    parser.destroy();
    await pumping;
  }
}

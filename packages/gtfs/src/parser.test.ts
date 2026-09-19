import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { parseGtfs } from './parser.js';
import type { GtfsFile } from './schema.js';

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of source) result.push(item);
  return result;
}

async function records(file: GtfsFile, csv: string) {
  return collect(parseGtfs(file, Readable.from([Buffer.from(csv)])));
}
const stopHeader =
  'trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type,timepoint';

describe('streaming CSV normalization', () => {
  it('handles BOM, CRLF, quoted commas/newlines/escaped quotes, UTF-8 chunk boundaries and extra columns', async () => {
    const csv =
      '\ufeffagency_id,agency_name,agency_url,agency_timezone,custom\r\na,"Café, ""Rail""\nBus",https://example.org,America/Chicago,kept\r\n';
    const bytes = Buffer.from(csv);
    const chunks = Array.from(bytes, (byte) => Buffer.from([byte]));
    const result = await collect(
      parseGtfs('agency.txt', Readable.from(chunks)),
    );
    expect(result[0]).toMatchObject({
      record: 2,
      data: { agency_name: 'Café, "Rail"\nBus', agency_phone: null },
      extra: { custom: 'kept' },
    });
  });
  it('preserves overnight times and restrictions without filling optional headsigns', async () => {
    const result = await records(
      'stop_times.txt',
      `${stopHeader}\nt,24:15:00,25:30:00,s,4,1,3,0\n`,
    );
    expect(result[0]?.data).toMatchObject({
      arrival_time: 87300,
      departure_time: 91800,
      stop_sequence: 4,
      pickup_type: 1,
      drop_off_type: 3,
      stop_headsign: null,
    });
  });
  it('preserves decimal accuracy', async () => {
    const result = await records(
      'stops.txt',
      'stop_id,stop_name,stop_lat,stop_lon\ns,Test,32.123456789012345678,-96.001000\n',
    );
    expect(result[0]?.data).toMatchObject({
      stop_lat: '32.123456789012345678',
      stop_lon: '-96.001000',
      wheelchair_boarding: null,
    });
  });
  it('accepts untimed intermediate estimated visits without inventing times', async () => {
    expect(
      (await records('stop_times.txt', `${stopHeader}\nt,,,s,2,,,0\n`))[0]
        ?.data,
    ).toMatchObject({ arrival_time: null, departure_time: null });
  });
  it('accepts a header-only exception file', async () =>
    expect(
      await records('calendar_dates.txt', 'service_id,date,exception_type\n'),
    ).toEqual([]));
  it.each([
    [
      'calendar_dates.txt',
      'service_id,date\n',
      'Missing required column exception_type',
    ],
    [
      'calendar_dates.txt',
      'service_id,date,date,exception_type\n',
      'duplicate header',
    ],
    [
      'calendar_dates.txt',
      'service_id,date,exception_type\na,20260230,1\n',
      'record 2: date',
    ],
    [
      'calendar_dates.txt',
      'service_id,date,exception_type\n,20260918,1\n',
      'service_id: Required',
    ],
    [
      'calendar_dates.txt',
      'service_id,date,exception_type\na,20260918,3\n',
      'exception_type',
    ],
    [
      'calendar_dates.txt',
      'service_id,date,exception_type\na,20260918,1,extra\n',
      'Invalid Record Length',
    ],
    [
      'stops.txt',
      'stop_id,stop_name,stop_lat,stop_lon\ns,X,91,-96\n',
      'stop_lat',
    ],
    [
      'stops.txt',
      'stop_id,stop_name,stop_lat,stop_lon\ns,X,32,NaN\n',
      'stop_lon',
    ],
    [
      'stop_times.txt',
      `${stopHeader}\nt,26:06:00,25:00:00,s,1,0,0,1\n`,
      'departure_time precedes',
    ],
    ['stop_times.txt', `${stopHeader}\nt,,,s,1,,,\n`, 'timepoint requires'],
    [
      'stop_times.txt',
      `${stopHeader}\nt,24:15:00,,s,1,0,0,0\n`,
      'both be present',
    ],
    [
      'stop_times.txt',
      `${stopHeader}\nt,24:15:00,24:15:00,s,-1,0,0,1\n`,
      'stop_sequence',
    ],
    ['calendar_dates.txt', '', 'Missing CSV header'],
  ] as const)('rejects invalid %s with context', async (file, csv, message) => {
    await expect(records(file, csv)).rejects.toThrow(message);
  });
  it('rejects invalid UTF-8 instead of replacing bytes', async () => {
    await expect(
      collect(parseGtfs('agency.txt', Readable.from([Buffer.from([0xff])]))),
    ).rejects.toThrow('agency.txt');
  });
  it('propagates source failures and allows early consumer cancellation', async () => {
    async function* broken() {
      yield Buffer.from('service_id,date,exception_type\n');
      throw new Error('read failed');
    }
    await expect(
      collect(parseGtfs('calendar_dates.txt', broken())),
    ).rejects.toThrow('read failed');
    let read = 0;
    async function* large() {
      yield Buffer.from('service_id,date,exception_type\n');
      for (let i = 0; i < 100000; i++) {
        read++;
        yield Buffer.from(`s${i},20260918,1\n`);
      }
    }
    for await (const row of parseGtfs('calendar_dates.txt', large())) {
      expect(row.record).toBe(2);
      break;
    }
    expect(read).toBeLessThan(100000);
  });
});

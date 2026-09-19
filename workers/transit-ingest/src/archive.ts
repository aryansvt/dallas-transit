import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { schemas, requiredFiles } from '@dallas-transit/gtfs';

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_MEMBER_BYTES = 1024 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * MAX_MEMBER_BYTES;

export interface Archive {
  hash: string;
  manifest: { file: string; bytes: number; crc32: number }[];
  has(file: string): boolean;
  read(file: string): AsyncGenerator<Buffer>;
  close(): Promise<void>;
}

/** Private byte snapshot: identity and parsing always refer to the same publication. No extraction. */
export async function openArchive(path: string): Promise<Archive> {
  if (
    !(await stat(path)).isFile() ||
    (await stat(path)).size > MAX_ARCHIVE_BYTES
  )
    throw new Error('Expected a GTFS ZIP file no larger than 256 MiB');
  const directory = await mkdtemp(join(tmpdir(), 'dallas-gtfs-'));
  let zip: ZipFile | undefined;
  try {
    const snapshot = join(directory, 'feed.zip');
    await copyFile(path, snapshot);
    if ((await stat(snapshot)).size > MAX_ARCHIVE_BYTES)
      throw new Error('GTFS ZIP exceeds 256 MiB');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(snapshot))
      hash.update(chunk as Buffer);
    zip = await new Promise<ZipFile>((resolve, reject) =>
      yauzl.open(
        snapshot,
        {
          lazyEntries: true,
          autoClose: false,
          strictFileNames: true,
          validateEntrySizes: true,
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      ),
    );
    const openedZip = zip;
    const entries = new Map<string, Entry>();
    let total = 0;
    await new Promise<void>((resolve, reject) => {
      openedZip.on('error', reject);
      openedZip.on('end', resolve);
      openedZip.on('entry', (entry: Entry) => {
        try {
          const name = entry.fileName;
          if (
            !/^[a-z_]+\.txt$/.test(name) ||
            (!Object.hasOwn(schemas, name) && name !== 'info.txt')
          )
            throw new Error(
              `Unsupported archive member: ${name}; implement its semantics before importing`,
            );
          if (entries.has(name))
            throw new Error(`Duplicate archive member: ${name}`);
          if (
            (entry.generalPurposeBitFlag & 1) !== 0 ||
            ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
          )
            throw new Error(
              `Encrypted/symlink member is not supported: ${name}`,
            );
          total += entry.uncompressedSize;
          if (
            entries.size >= 32 ||
            entry.uncompressedSize > MAX_MEMBER_BYTES ||
            total > MAX_TOTAL_BYTES
          )
            throw new Error(
              'Archive exceeds member/count/expanded-size limits',
            );
          if (name === 'info.txt' && entry.uncompressedSize > 1024 * 1024)
            throw new Error('info.txt exceeds 1 MiB');
          entries.set(name, entry);
          openedZip.readEntry();
        } catch (error) {
          reject(error);
        }
      });
      openedZip.readEntry();
    });
    for (const file of requiredFiles)
      if (!entries.has(file)) throw new Error(`Missing required file: ${file}`);
    if (!entries.has('calendar.txt') && !entries.has('calendar_dates.txt'))
      throw new Error('calendar.txt or calendar_dates.txt is required');
    return {
      hash: hash.digest('hex'),
      manifest: [...entries.values()].map((e) => ({
        file: e.fileName,
        bytes: e.uncompressedSize,
        crc32: e.crc32,
      })),
      has: (file) => entries.has(file),
      async *read(file) {
        const entry = entries.get(file);
        if (!entry) throw new Error(`Missing archive member: ${file}`);
        const stream = await new Promise<NodeJS.ReadableStream>(
          (resolve, reject) =>
            openedZip.openReadStream(entry, (error, result) =>
              error ? reject(error) : resolve(result),
            ),
        );
        let checksum = 0;
        let bytes = 0;
        for await (const chunk of stream) {
          const buffer = chunk as Buffer;
          bytes += buffer.length;
          if (bytes > entry.uncompressedSize)
            throw new Error(`${file}: expanded size exceeds declaration`);
          checksum = crc32(buffer, checksum);
          yield buffer;
        }
        if (checksum !== entry.crc32 || bytes !== entry.uncompressedSize)
          throw new Error(`${file}: ZIP CRC/size mismatch`);
      },
      async close() {
        openedZip.close();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    zip?.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

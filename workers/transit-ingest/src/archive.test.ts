import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openArchive } from './archive.js';
import { fixtureFiles, writeZip } from './test-support.js';

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of source) result.push(item);
  return result;
}

const directories: string[] = [];
async function archivePath() {
  const directory = await mkdtemp(join(tmpdir(), 'gtfs-test-'));
  directories.push(directory);
  return join(directory, 'fixture.zip');
}
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe('GTFS archive boundary', () => {
  it('streams a private snapshot and identifies exact original bytes', async () => {
    const path = await archivePath();
    const files = await fixtureFiles();
    await writeZip(path, files);
    const archive = await openArchive(path);
    try {
      await writeZip(path, { ...files, 'info.txt': 'changed' });
      expect(
        Buffer.concat(await collect(archive.read('info.txt'))).toString(),
      ).toBe(files['info.txt']);
      expect(archive.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(archive.manifest).toHaveLength(16);
    } finally {
      await archive.close();
    }
  });
  it('rejects bad CRC rather than silently reading corrupted bytes', async () => {
    const path = await archivePath();
    await writeZip(path, await fixtureFiles(), true);
    const archive = await openArchive(path);
    try {
      await expect(collect(archive.read('agency.txt'))).rejects.toThrow('CRC');
    } finally {
      await archive.close();
    }
  });
  it.each([
    '../escape.txt',
    'nested/stops.txt',
    'frequencies.txt',
    'transfers.txt',
    'pathways.txt',
  ])('rejects unsupported/unsafe member %s', async (name) => {
    const path = await archivePath();
    await writeZip(path, { ...(await fixtureFiles()), [name]: 'unsupported' });
    await expect(openArchive(path)).rejects.toThrow();
  });
  it('requires core files and a service definition', async () => {
    const path = await archivePath();
    const files = await fixtureFiles();
    delete files['calendar.txt'];
    delete files['calendar_dates.txt'];
    await writeZip(path, files);
    await expect(openArchive(path)).rejects.toThrow(
      'calendar.txt or calendar_dates.txt',
    );
    delete files['stops.txt'];
    await writeZip(path, files);
    await expect(openArchive(path)).rejects.toThrow(
      'Missing required file: stops.txt',
    );
  });
});

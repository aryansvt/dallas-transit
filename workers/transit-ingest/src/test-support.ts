import { readFile, readdir, writeFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';

export async function fixtureFiles(): Promise<Record<string, string>> {
  const directory = new URL('../test/fixtures/tiny/', import.meta.url);
  const files: Record<string, string> = {};
  for (const file of await readdir(directory))
    files[file] = await readFile(new URL(file, directory), 'utf8');
  return files;
}

/** Tiny uncompressed ZIP writer solely for tests: no archive-writing dependency. */
export async function writeZip(
  path: string,
  files: Record<string, string>,
  corruptCrc = false,
): Promise<void> {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = Buffer.from(name);
    const content = Buffer.from(text);
    const checksum = corruptCrc ? 0 : crc32(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(content.length, 20);
    entry.writeUInt32LE(content.length, 24);
    entry.writeUInt16LE(filename.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(header, filename, content);
    central.push(entry, filename);
    offset += header.length + filename.length + content.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  await writeFile(path, Buffer.concat([...local, directory, end]));
}

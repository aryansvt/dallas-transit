import { readFile } from 'node:fs/promises';
import { connectDatabase, localDatabaseUrl } from './database.js';
import {
  publishPedestrianEvidence,
  type PedestrianEvidence,
} from './pedestrian-links.js';
// Explicit owner administrative boundary. No provider invocation or generation.
async function main() {
  if (process.argv[2] === '--help') {
    console.log(
      'Usage: pedestrian-cli.js publish evidence.json --rights-reviewed',
    );
    console.log(
      'Evidence requires publicationId, evidenceId, rightsReference, validFrom, validThrough, retainUntil and directed links with pedestrian distance/provenance. No provider calls. Insert once; no overwrite.',
    );
    return;
  }
  const [command, file, confirmation, ...extra] = process.argv.slice(2);
  if (
    command !== 'publish' ||
    !file ||
    confirmation !== '--rights-reviewed' ||
    extra.length
  )
    throw new Error(
      'Usage: pedestrian-cli.js publish evidence.json --rights-reviewed',
    );
  const evidence = JSON.parse(
    await readFile(file, 'utf8'),
  ) as PedestrianEvidence;
  const db = await connectDatabase(
    process.env.DATABASE_URL ?? localDatabaseUrl,
  );
  try {
    await publishPedestrianEvidence(db, evidence);
    console.log(
      'Pedestrian evidence published. Restart schedule caches and enforce the retention deadline.',
    );
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    'Pedestrian publication failed. Verify reviewed evidence, retention permission, schema and publication. No graph is partially published.',
  );
  process.exitCode = 1;
});

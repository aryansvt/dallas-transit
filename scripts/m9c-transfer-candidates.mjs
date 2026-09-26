import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import {
  connectDatabase,
  localDatabaseUrl,
} from '../workers/transit-ingest/dist/database.js';
import {
  generateTransferCandidates,
  loadTransferCandidateInputs,
  TRANSFER_CANDIDATE_POLICY,
} from '../workers/transit-ingest/dist/transfer-candidates.js';

// Fixed loopback local copy. Deliberately ignore environment/cloud configuration.
// No provider imports, migrations, writes, evidence output or network generation.
if (process.argv.length > 2) throw new Error('No arguments accepted');
const url = new URL(localDatabaseUrl);
url.pathname = '/m9c_benchmark_20260926';
const db = await connectDatabase(url.toString());
try {
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const publication = (
    await db.query(`SELECT f.feed_id,f.feed_version FROM static_gtfs.feed_versions f
    JOIN static_gtfs.feed_activation a USING(feed_id) WHERE a.source_key='dart' AND a.service_date='2026-09-26'`)
  ).rows[0];
  if (!publication) throw new Error('Retained publication unavailable');
  const { stops, pairs } = await loadTransferCandidateInputs(
    db,
    publication.feed_id,
  );
  const candidates = generateTransferCandidates(
    publication.feed_id,
    stops,
    pairs,
  );
  const counts = new Map(),
    bands = { '0-100': 0, '100-250': 0, '250-500': 0, '500-800': 0 };
  const modes = {};
  const byId = new Map(stops.map((s) => [s.id, s]));
  const type = (id) =>
    byId.get(id).services.some((s) => [0, 1, 2].includes(s.mode))
      ? 'rail'
      : 'bus';
  for (const c of candidates) {
    counts.set(c.from, (counts.get(c.from) ?? 0) + 1);
    bands[
      c.distance <= 100
        ? '0-100'
        : c.distance <= 250
          ? '100-250'
          : c.distance <= 500
            ? '250-500'
            : '500-800'
    ]++;
    const k = `${type(c.from)}->${type(c.to)}`;
    modes[k] = (modes[k] ?? 0) + 1;
  }
  const sorted = [...counts.values()].sort((a, b) => a - b);
  const example = (c) => ({
    from: c.from,
    fromName: byId.get(c.from).name,
    to: c.to,
    toName: byId.get(c.to).name,
    meters: Math.round(c.distance),
  });
  console.log(
    JSON.stringify(
      {
        publication,
        policy: TRANSFER_CANDIDATE_POLICY,
        total: candidates.length,
        sources: counts.size,
        median: sorted[Math.ceil(sorted.length * 0.5) - 1],
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        max: sorted.at(-1),
        bands,
        modes,
        frankford: candidates
          .filter((c) => c.from === '33777' && c.to === '19300')
          .map(example),
        stations: ['33598', '33597']
          .flatMap((id) => [
            ...candidates.filter((c) => c.from === id).slice(0, 2),
            ...candidates.filter((c) => c.to === id).slice(0, 2),
          ])
          .map(example),
        comparisons: [989596, 274292, 69256].map((baseline) => ({
          baseline,
          reductionPercent: 100 * (1 - candidates.length / baseline),
        })),
      },
      null,
      2,
    ),
  );
  await db.query('ROLLBACK');
} finally {
  await db.end();
}

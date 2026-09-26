import { buildSchedule, type TransferLink } from '@dallas-transit/router';
import { transaction, type Database } from './database.js';

export interface PedestrianEvidence {
  publicationId: string;
  evidenceId: string;
  /** Explicit owner-reviewed permission to retain this evidence; never inferred. */
  rightsReference: string;
  validFrom: string;
  validThrough: string;
  retainUntil: string;
  links: readonly TransferLink[];
}

/** Explicit administrative operation; insert once, never overwrite a feed's graph.
 * Provider validation tooling must not call this automatically. */
export async function publishPedestrianEvidence(
  db: Database,
  evidence: PedestrianEvidence,
) {
  if (
    !evidence.rightsReference?.trim() ||
    !evidence.evidenceId?.trim() ||
    !Number.isFinite(Date.parse(evidence.retainUntil)) ||
    Date.parse(evidence.retainUntil) <= Date.now()
  )
    throw new Error(
      'Evidence needs explicit retention permission and a future retention deadline',
    );
  if (
    evidence.links.length > 100000 ||
    evidence.links.some((l) => !l.pedestrian || l.fromStopId === l.toStopId)
  )
    throw new Error('Expected bounded directed pedestrian evidence');
  // Reuse the core's strict metric/provenance validation before opening a transaction.
  buildSchedule({
    publicationId: evidence.publicationId,
    serviceDate: evidence.validFrom,
    activeServiceIds: [],
    trips: [],
    stops: [
      ...new Set(evidence.links.flatMap((l) => [l.fromStopId, l.toStopId])),
    ].map((id) => ({ id, changeSeconds: 0 })),
    transfers: evidence.links,
  });
  await transaction(db, async () => {
    await db.query(
      `INSERT INTO static_gtfs.pedestrian_graphs
      (feed_id,evidence_id,rights_reference,valid_from,valid_through,retain_until) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        evidence.publicationId,
        evidence.evidenceId,
        evidence.rightsReference,
        evidence.validFrom,
        evidence.validThrough,
        evidence.retainUntil,
      ],
    );
    for (const link of evidence.links)
      await db.query(
        `INSERT INTO static_gtfs.pedestrian_links
      (feed_id,link_id,from_stop_id,to_stop_id,duration_seconds,distance_meters,provenance) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          evidence.publicationId,
          link.id,
          link.fromStopId,
          link.toStopId,
          link.durationSeconds,
          link.pedestrian!.distanceMeters,
          link.pedestrian!.provenance,
        ],
      );
  });
}

export async function loadPedestrianLinks(
  db: Pick<Database, 'query'>,
  publication: string,
  day: string,
): Promise<TransferLink[]> {
  const result = await db.query<TransferLink>(
    `SELECT link_id id,from_stop_id AS "fromStopId",to_stop_id AS "toStopId",
    duration_seconds AS "durationSeconds",json_build_object('distanceMeters',distance_meters,'provenance',provenance) pedestrian
    FROM static_gtfs.pedestrian_links JOIN static_gtfs.pedestrian_graphs USING(feed_id)
    WHERE feed_id=$1 AND $2::date BETWEEN valid_from AND valid_through AND retain_until > now()
    ORDER BY link_id COLLATE "C"`,
    [publication, day],
  );
  return result.rows;
}

/** Bound schedule caching to the evidence retention deadline as well as its TTL. */
export async function pedestrianExpiry(
  db: Pick<Database, 'query'>,
  publication: string,
  day: string,
): Promise<number | undefined> {
  const result = await db.query<{ expires: string }>(
    `SELECT retain_until::text expires FROM static_gtfs.pedestrian_graphs
 WHERE feed_id=$1 AND $2::date BETWEEN valid_from AND valid_through AND retain_until > now()`,
    [publication, day],
  );
  return result.rows[0] ? Date.parse(result.rows[0].expires) : undefined;
}

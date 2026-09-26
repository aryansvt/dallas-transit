import type { Database } from './database.js';

/** Preparation only: these are not TransferLinks or proof of pedestrian access. */
export const TRANSFER_CANDIDATE_POLICY = Object.freeze({
  ordinaryMeters: 500,
  stationMeters: 800,
  acceptedPerSource: 6,
  attemptsPerSource: 12,
  publicationLimit: 100000,
});
export interface TransferService {
  route: string;
  direction: number | null;
  mode: number;
  pickupDates: string[];
  dropoffDates: string[];
}
export interface TransferStop {
  id: string;
  name: string;
  parent: string | null;
  services: TransferService[];
}
export interface TransferPair {
  from: string;
  to: string;
  distance: number;
  /** Geodesic heading only; quadrant diversity is not a crossing permission. */
  bearing?: number | null;
}
export interface TransferCandidate extends TransferPair {
  publicationId: string;
  /** Route/direction/mode/date coverage added beyond boarding at the source. */
  coverage: string[];
  modes: number[];
  station: boolean;
}
const rail = (s: TransferStop) =>
  s.services.some((r) => [0, 1, 2].includes(r.mode));
const key = (s: TransferService, date: string) =>
  JSON.stringify([s.route, s.direction, s.mode, date]);
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Recompute marginal utility after every validation outcome. Rejections consume
 * attempts, not coverage. Caller alone validates walking; this invokes no provider. */
export function nextTransferCandidate(
  candidates: readonly TransferCandidate[],
  accepted: readonly TransferCandidate[],
  attempted: ReadonlySet<string>,
  alternativesTo: readonly TransferCandidate[] = [],
): TransferCandidate | undefined {
  const policy = TRANSFER_CANDIDATE_POLICY;
  if (
    accepted.length >= policy.acceptedPerSource ||
    attempted.size >= policy.attemptsPerSource
  )
    return undefined;
  const covered = new Set(accepted.flatMap((c) => c.coverage));
  const modes = new Set(accepted.flatMap((c) => c.modes));
  const gain = (c: TransferCandidate) =>
    c.coverage.filter((k) => !covered.has(k)).length;
  const approach = (c: TransferCandidate) =>
    c.bearing == null ? 'unknown' : Math.floor(c.bearing / 90);
  const approaches = new Set(
    alternativesTo.flatMap((c) =>
      c.coverage.map((k) => JSON.stringify([k, approach(c)])),
    ),
  );
  const newApproach = (c: TransferCandidate) =>
    c.coverage.filter((k) => !approaches.has(JSON.stringify([k, approach(c)])))
      .length;
  return candidates
    .filter((c) => !attempted.has(c.to) && gain(c) > 0)
    .sort(
      (a, b) =>
        Number(b.modes.some((m) => !modes.has(m))) -
          Number(a.modes.some((m) => !modes.has(m))) ||
        Number(b.station) - Number(a.station) ||
        (alternativesTo.length ? newApproach(b) - newApproach(a) : 0) ||
        gain(b) - gain(a) ||
        a.distance - b.distance ||
        compare(a.to, b.to),
    )[0];
}

/** Directed same-publication candidates, retaining one coverage layer and a
 * bounded second layer for failed-walk refill. No nearest-N endpoint policy. */
export function generateTransferCandidates(
  publicationId: string,
  stops: readonly TransferStop[],
  pairs: readonly TransferPair[],
): TransferCandidate[] {
  const byId = new Map(stops.map((s) => [s.id, s]));
  const groups = new Map<string, TransferCandidate[]>();
  const seen = new Set<string>();
  for (const pair of pairs) {
    const a = byId.get(pair.from),
      b = byId.get(pair.to);
    const identity = JSON.stringify([pair.from, pair.to]);
    if (!a || !b || a.id === b.id || seen.has(identity)) continue;
    seen.add(identity);
    const station =
      rail(a) || rail(b) || Boolean(a.parent && a.parent === b.parent);
    if (
      !Number.isFinite(pair.distance) ||
      pair.distance < 0 ||
      pair.distance >
        (station
          ? TRANSFER_CANDIDATE_POLICY.stationMeters
          : TRANSFER_CANDIDATE_POLICY.ordinaryMeters)
    )
      continue;
    const arrivalDates = new Set(a.services.flatMap((s) => s.dropoffDates));
    const local = new Set(
      a.services.flatMap((s) => s.pickupDates.map((d) => key(s, d))),
    );
    const coverage = new Set<string>(),
      modes = new Set<number>();
    for (const service of b.services)
      for (const date of service.pickupDates) {
        const k = key(service, date);
        if (arrivalDates.has(date) && !local.has(k)) {
          coverage.add(k);
          modes.add(service.mode);
        }
      }
    if (!coverage.size) continue;
    const candidate = {
      ...pair,
      publicationId,
      station,
      coverage: [...coverage].sort(compare),
      modes: [...modes].sort((a, b) => a - b),
    };
    const group = groups.get(a.id) ?? [];
    group.push(candidate);
    groups.set(a.id, group);
  }
  const result: TransferCandidate[] = [];
  for (const source of [...groups.keys()].sort(compare)) {
    const remaining = groups.get(source)!;
    const attempted = new Set<string>();
    const primary: TransferCandidate[] = [];
    // Two coverage passes retain alternatives without filling the list with
    // dozens of equivalent nearby stops. No rejected candidate is evidence.
    for (let layer = 0; layer < 2; layer++) {
      const selected: TransferCandidate[] = [];
      while (true) {
        const next = nextTransferCandidate(
          remaining,
          selected,
          attempted,
          layer ? primary : [],
        );
        if (!next) break;
        selected.push(next);
        attempted.add(next.to);
        result.push(next);
        if (!layer) primary.push(next);
      }
    }
  }
  if (result.length > TRANSFER_CANDIDATE_POLICY.publicationLimit)
    throw new Error(
      'Transfer candidate publication exceeds 100000; generation stopped',
    );
  return result;
}

/** Caller uses an idle local connection. No migration, persistence or provider.
 * Calendar exceptions are evaluated for every date in this publication. */
export async function loadTransferCandidateInputs(
  db: Database,
  publicationId: string,
) {
  const stops = await db.query<TransferStop>(
    `WITH dates AS MATERIALIZED (
    SELECT s.service_id, array_agg(d::date::text ORDER BY d) days
    FROM static_gtfs.services s JOIN static_gtfs.feed_versions f USING(feed_id)
    CROSS JOIN LATERAL generate_series(f.coverage_start::timestamp,f.coverage_end::timestamp,interval '1 day') d
    WHERE s.feed_id=$1 AND static_gtfs.service_is_active(s.feed_id,s.service_id,d::date)
    GROUP BY s.service_id
  ), permissions AS MATERIALIZED (
    SELECT st.stop_id,t.route_id,t.direction_id,r.route_type,t.service_id,
      bool_or(coalesce(st.pickup_type,0)=0) pickup,
      bool_or(coalesce(st.drop_off_type,0)=0) dropoff
    FROM static_gtfs.stop_times st
    JOIN static_gtfs.trips t USING(feed_id,trip_id) JOIN static_gtfs.routes r USING(feed_id,route_id)
    WHERE st.feed_id=$1
    GROUP BY st.stop_id,t.route_id,t.direction_id,r.route_type,t.service_id
  ), signatures AS (
    SELECT stop_id,route_id,direction_id,route_type,
      array_agg(DISTINCT day) FILTER(WHERE pickup) pickup,
      array_agg(DISTINCT day) FILTER(WHERE dropoff) dropoff
    FROM permissions JOIN dates USING(service_id) CROSS JOIN LATERAL unnest(days) day
    GROUP BY stop_id,route_id,direction_id,route_type
  ) SELECT s.stop_id id,s.stop_name name,s.parent_station parent,
    json_agg(json_build_object('route',g.route_id,'direction',g.direction_id,'mode',g.route_type,
    'pickupDates',coalesce(g.pickup,ARRAY[]::text[]),'dropoffDates',coalesce(g.dropoff,ARRAY[]::text[]))) services
    FROM static_gtfs.stops s JOIN signatures g USING(stop_id)
    WHERE s.feed_id=$1 AND coalesce(s.location_type,0)=0
    GROUP BY s.stop_id,s.stop_name,s.parent_station ORDER BY s.stop_id COLLATE "C"`,
    [publicationId],
  );
  const pairs = await db.query<TransferPair>(
    `SELECT a.stop_id "from",b.stop_id "to",
    ST_Distance(a.geom::geography,b.geom::geography) distance,
    degrees(ST_Azimuth(a.geom::geography,b.geom::geography)) bearing
    FROM static_gtfs.stops a JOIN static_gtfs.stops b ON a.feed_id=b.feed_id AND a.stop_id<>b.stop_id
    WHERE a.feed_id=$1
    AND (abs(ST_Y(a.geom)) > 85 OR abs(ST_X(a.geom)) > 179
      OR b.geom && ST_Expand(a.geom,$2/110000.0/cos(radians(abs(ST_Y(a.geom))+$2/110000.0))))
    AND ST_DWithin(a.geom::geography,b.geom::geography,$2)
    ORDER BY a.stop_id COLLATE "C",b.stop_id COLLATE "C"`,
    [publicationId, TRANSFER_CANDIDATE_POLICY.stationMeters],
  );
  return { stops: stops.rows, pairs: pairs.rows };
}

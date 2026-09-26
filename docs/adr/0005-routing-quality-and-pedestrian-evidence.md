# ADR 0005 - Validated pedestrian connectivity and multicriteria routing

## Status

Accepted for M9C implementation, with deployment/evidence publication separately
controlled by the owner. Extends ADRs 0001, 0002 and 0004 without changing them.

## Decision

The production router remains our round-based TypeScript implementation. A
publication-scoped graph supplies directed, complete pedestrian stop-to-stop
paths through TransferLink. Provider calls never run in routing loops. Links
carry distance and provenance; duration excludes the outbound boarding allowance.
Only explicitly pedestrian links count as walking. Legacy interchanges retain
their old semantics. A pedestrian link cannot chain with another link between
rides; each complete path is bounded at 2500 m and 1800 seconds. No reverse edge,
colocation, stop-name equivalence or road crossing is inferred.

A graph is inserted once per feed, with evidence ID, explicit retention-rights
reference, date validity and retention deadline. Loading uses the same read-only
publication snapshot as the timetable. An absent/expired graph supplies no links.
No provider-derived graph is published by default. Expired stored evidence needs
owner-authorized cleanup; expiry filtering is not physical deletion. Refresh a
publication's evidence through an explicit lifecycle decision, not silent edits.

Endpoint discovery considers active service, time and pickup/drop-off permissions.
Ordinary stops retain a 1200 m geographic envelope; up to two nearest active rail
locations (GTFS modes 0/1/2) may use 2200 m. These are candidates, not walking
claims. A bounded shortlist (32) is ordered by nearest, uncovered mode, distinct
station, then uncovered route/direction coverage, with distance/ID tie breaks.
Six successful walks per endpoint allow ordinary coverage plus station diversity;
sixteen calls total allow bounded rejection/refill. Walks above 1800 seconds or
2500 m are rejected. At most 36 logical stop pairs share up to six timetable scans (one per access
state), returning at most three journeys. Egress bounds apply only when every
target dominates the continuation; access states remain independent.
This is a bounded heuristic, not proof of globally optimal geographic discovery.

Ranking stays arrival, transfers, total measured walking, scheduled transfer risk.
Risk is the sum of max(0, 300 - spare connection seconds), where spare time is
outbound departure minus inbound arrival, interchange duration and outbound change
allowance. Five minutes is an explicit policy threshold, not a probability,
empirical reliability model or live confidence. More spare time beyond that
threshold is tied. All objectives are monotone and participate in label dominance;
arrival alone cannot discard a less-walking or lower-risk predecessor. Link state
also participates because pedestrian chaining has different future eligibility.
An onboard state compares walking/risk once downstream times become identical.
Destination bounds only prune provably dominated continuations. Directed static
reachability overapproximates feasible paths and cheaply rejects impossible pairs;
its cache holds at most 32 origin bitsets per schedule.

Equivalent states retain up to three distinct ride signatures; this bounds equal
cost diversity without changing reachable objective values. Geographic composition
removes dominated objectives, deduplicates variants of the same actual trip
sequence, reserves earliest/fewer-transfer/less-walking extremes and fills up to
three. Final display order is always the locked lexicographic order. Same-route
separate trips remain separate boardings. No stay-seated block inference is added.

## Consequences

### Sparse transfer preparation

`transfer-candidates.ts` is a separate, provider-free preparation boundary, not
endpoint discovery or routing. Ordinary transfers use a 500 m geodesic envelope;
rail interfaces and explicit shared parent stations may use 800 m. This station
envelope is a candidate search allowance, never a walkability assertion. It does
not use the 2200 m endpoint rail envelope. Calendars and exceptions supply actual
overlapping source-alighting/destination-boarding dates for the publication.

Candidates must add route/direction/mode/date coverage beyond boarding at the
source itself. Greedy selection favors uncovered modes, station interfaces and
marginal coverage, then distance and stop ID. Two coverage passes retain bounded
fallbacks rather than filling a list with equivalent stops. The fallback pass
prefers a different geographic quadrant for the same service coverage, preserving
alternate approaches around intersections instead of two stops along the same
approach. Bearings are not pedestrian crossing evidence. Each source has at
most twelve directed validation candidates and six accepted links. After a
rejection, `nextTransferCandidate` recomputes utility using only accepted coverage;
attempted destinations still consume the twelve-attempt budget. The 100000
publication safety limit is unchanged. No evidence is created by selection.

`node scripts/m9c-transfer-candidates.mjs` performs a read-only dry-run against the
existing loopback benchmark copy after the ingest workspace is built. It never
loads provider credentials or publishes links. This heuristic intentionally omits
walks to redundant same-service stops; calendar overlap does not prove a timed
connection. Station names, proximity, parent IDs and route modes do not replace
directed pedestrian validation. Any eventual evidence remains subject to the
publication, rights, expiry and retention rules above.

More labels and station candidates cost memory/CPU/provider quota. Exhaustive tiny
network tests cover four-objective correctness; local feed benchmarks measure the
cost without asserting cloud capacity. The graph is intentionally opt-in while
pedestrian safety and retention permissions remain unresolved. Automatic adjacent
service-day composition is deferred: correct date-scoped publications, identities,
connection stitching and response semantics need a separate design, not a simple
union of two results. Explicit >24:00 queries remain supported.

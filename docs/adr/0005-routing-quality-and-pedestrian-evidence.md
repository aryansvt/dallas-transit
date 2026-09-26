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

More labels and station candidates cost memory/CPU/provider quota. Exhaustive tiny
network tests cover four-objective correctness; local feed benchmarks measure the
cost without asserting cloud capacity. The graph is intentionally opt-in while
pedestrian safety and retention permissions remain unresolved. Automatic adjacent
service-day composition is deferred: correct date-scoped publications, identities,
connection stitching and response semantics need a separate design, not a simple
union of two results. Explicit >24:00 queries remain supported.

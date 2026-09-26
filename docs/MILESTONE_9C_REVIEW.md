# M9C release routing review

## Status and scope

Implementation is local and uncommitted. Nothing was deployed or changed in
Render, Vercel, Mapbox or production Postgres. DART realtime remains disabled.
Base commit: `c7ecaec152c1c9eda7f4b6919b0604162f4ccd15`.

Pass 1 identified absent inter-stop walking links, proximity-only endpoint
pruning, a 1200 m station exclusion, incomplete walking totals and missing
scheduled-risk ordering. Pass 2 implements the boundaries and regression tests.
An approved production pedestrian graph is still an owner/data prerequisite;
this review does not claim network-wide walking coverage or final release approval.

## Architecture and behavior

See [ADR 0005](adr/0005-routing-quality-and-pedestrian-evidence.md).

- Directed pedestrian evidence is publication-scoped, opt-in and immutable through
  the publishing API. It carries measured distance, provenance, validity dates,
  retention deadline and an explicit rights reference. Migration 003 is additive.
- Pedestrian duration and outbound boarding allowance are separate. One complete
  pedestrian link may connect successive rides; mixed/concatenated pedestrian
  links cannot evade the 2500 m / 1800 s envelope. Legacy links are not relabeled
  as measured walks. All actual pedestrian legs count in walking totals.
- Endpoint selection uses active service/date/time and pickup/drop-off eligibility.
  Ordinary stops use 1200 m, up to two rail locations use 2200 m, and a service-aware
  shortlist retains mode and route/direction coverage. Up to six valid endpoints
  per side, sixteen walking calls including refill, 36 logical pairs (at most six shared scans), three final results.
- Labels preserve arrival/boardings/walking/risk tradeoffs. Risk is summed spare
  connection shortfall below five minutes, after walking and change allowance.
  It is scheduled information, not live confidence or a probability.
- Directed reachability is a safe impossibility precheck: ignoring time and
  permissions overapproximates feasible paths. A 32-origin cache bounds its memory.
  Completed-journey bounds also prune only dominated continuations. Egress stops
  share one scan per access state; all targets must dominate before a common
  continuation is pruned. Separate access walks are never merged.
- Alternatives preserve earliest arrival and useful transfer/walking extremes.
  Equal metric triples no longer erase different services. Variants using the
  same actual ride sequence are deduplicated. Output order remains locked.
- Shared presentation uses Bus 244, named rail lines and TRE, and explicit modes.
  Pedestrian transfers show walking/distance; same-route separate trips say to
  change vehicles. Badge precedence prioritizes unique arrival, then transfers,
  then walking, with factual zero-transfer fallback. No Recommended label.
- Duration math, option count and the deployed map hotfix are preserved.

## Frozen benchmark inputs and methodology

The diagnostic harness is `scripts/m9c-audit.mjs`. It connects only to the fixed
loopback diagnostic database, never `DATABASE_URL`. `--prepare-local-copy` creates
`m9c_benchmark_20260926` from retained `dallas_transit` if absent and applies
migrations to that copy. It never resets or imports over retained data.

Current archive: `V738-218-217-20260921`, coverage September 21 through October 18,
2026; SHA-256 `9feefb82d05b3ff3f3df6d4a687595e072a536a6766aaa8229d29875a88b30de`.
Local publication ID: `9f42f7e3-9992-44bc-a3e1-e8d411b613a3`. Saturday extraction:
6977 stops, 211 patterns, 5953 trips and 293707 stop events. Retained September
14-20 publication is used for the explicitly older cases below. IDs are scoped to
the selected feed, never assumed globally stable.

Northside proxy: `(32.993161, -96.749201)`, the Synergy Park/Northside stop,
not a claim about the owner's original apartment entrance. AMC building proxy:
`(32.95033, -96.82058)`. Departure: September 26, 2026, 11:10 Dallas time
(service seconds 40200). Change allowance: 120 seconds. Owner must still confirm
actual entrance pins and pedestrian crossing/platform access.

The source for the AMC building proxy is the OpenStreetMap-based
[Mapcarta listing](https://mapcarta.com/W454296692); it is not pedestrian evidence.
Google is a discrepancy lead, not an oracle. Witnesses are replayed against the
retained schedule and explicitly identified walking evidence.

## Benchmark A

The unlinked schedule reproduces 244 -> 238 -> 227, alighting at stop 18216 at
13:05:36. With the measured endpoint walks, arrival is approximately 13:10
(121 displayed minutes from 11:10).

The measured directed connection 33777 -> 19300 enables:

| Ride                  | Scheduled witness                                     |
| --------------------- | ----------------------------------------------------- |
| 232, trip 9098320     | 34287 11:15:11 -> 33777 11:27                         |
| Pedestrian connection | 33777 -> 19300, validated for this diagnostic session |
| 236, trip 9099888     | 19300 11:51:41 -> 33245 12:09                         |
| 227, trip 9096030     | 33245 12:20 -> 18216 12:25:36                         |

Measured end-to-end composition arrived approximately **12:30**, displayed
**81 minutes**. All walking, including the interchange, is counted. The existing
RAPTOR architecture finds this without production route/stop exceptions.

## Benchmark B and provider boundary

UT Dallas rail stop 33598 was seventh by proximity in Pass 1; it is now second in
the service-aware access order. Knoll Trail 33597 is approximately 1420 m from
the AMC proxy in PostGIS and is now third in the egress order. Addison station
33596 is also retained: two distinct locations on one line are not interchangeable.

Silver trip 9136792 runs 33598 11:36 -> 33597 11:43. Measured endpoint walks yield
approximately **12:07 arrival**, displayed **58 minutes**. The measured bus-stop
34288 -> rail-stop 33598 connection also enables 244 -> Silver, arriving at Knoll
Trail 11:43 from the 33157 starting-stop query.

Exactly **six sequential Geoapify requests**, no retries, were made using existing
local configuration: access to 34287; access to 33598; 33777 -> 19300; 18216 to AMC;
33597 to AMC; 34288 -> 33598. All returned valid walking responses. Raw responses,
walking geometry and a reusable provider-derived graph were not written to files
or databases. Links existed only in the diagnostic process. No indefinite
persistence permission is inferred. This document records aggregate benchmark
outcomes, not a reusable provider dataset. No additional provider calls are needed
for unit/integration tests.

## Other frozen cases

Times are observed schedule results, not promises or copied Google expectations.
All use a 120-second change allowance and at most three transfers unless noted.
These are stop-to-stop checks; they do not claim measured endpoint walking.

| Case                       | Date and service time            | Stops          | Observed outcome                         |
| -------------------------- | -------------------------------- | -------------- | ---------------------------------------- |
| Rail-heavy                 | 2026-09-26 08:00                 | 32562 -> 32553 | Blue -> Orange, 10:08:30                 |
| Short local/repeated visit | 2026-09-18 04:05                 | 19754 -> 19756 | 017, 04:08:59                            |
| Cross-Dallas               | 2026-09-26 08:00                 | 26691 -> 15913 | Blue -> Red, 09:12                       |
| Weekend                    | 2026-09-26 08:00                 | 22749 -> 26895 | Red, 08:53                               |
| Overnight                  | 2026-09-18 24:00                 | 33286 -> 15842 | 001, 24:43                               |
| Diversity                  | 2026-09-18 08:00                 | 33221 -> 33318 | 214 -> 205 at 08:51; direct 016 at 08:54 |
| No route under constraint  | 2026-09-26 08:00, zero transfers | 32562 -> 32553 | Unreachable                              |

The rail-heavy core can retain equal-cost choices with different transfer stops;
geographic deduplication collapses those using identical actual trip sequences.
An initial cross-Dallas probe used a nonexistent stop ID and reported unknown-stop;
its corrected IDs above were checked against the selected publication.

## Regression and validation evidence

The independent exhaustive oracle enumerates rides and permitted simple link
paths on 160 deterministic tiny networks, at three departure times each. It now
compares all four Pareto objectives, including random pedestrian/legacy links.
It does not call the production dominance helper. Each generated network also
compares batched egress searches with individual searches. Existing overtaking, repeated
visits, service calendars, restrictions and >24:00 tests remain.

Additional tests cover directed/asymmetric links, absent links, chain/cycle bounds,
exactly-once allowance, the three-bus walking witness, later safer/less-walking
predecessors, metric accounting, service diversity, refill exhaustion, real SQL
station envelopes/inactive service, graph validity/corrections/immutability,
retention-bounded schedule caching, cap diversity, same-route vehicle changes,
rail naming and factual badges.

Validation commands and final results are recorded at the end of this document.
The first production-build attempt correctly refused missing production config;
the successful build uses inert `api.example.invalid`/placeholder keys, not
production credentials. Windows sandbox subprocess restrictions required approved
execution for Vitest/Next build. No dependencies were installed.

## Performance interpretation

Local Windows/Node 24 measurements are diagnostic snapshots, not production
capacity certification. Schedule extraction/build was approximately 1.1-1.5 s.
SQL endpoint selection was approximately 0.2-0.4 s across both endpoints. Individual
post-pruning matrix searches were typically under 120 ms; impossible disconnected
pairs can now return before scanning trips. The measured four-pair benchmark
composition with session-only links took approximately 1.06 s.

`--perf` makes no provider calls. It uses explicitly synthetic endpoint walks and
reports CPU/candidate budgets only, without reporting fictitious travel times.
It tests the full 36-pair workload, with and without synthetic interchange links.
Final local full-policy samples: 3.28 s total / 3.11 s composition without links;
3.74 s total / 3.57 s composition with two synthetic links. Both exercised 36
logical pairs and twelve synthetic provider responses, with zero network calls.
RSS snapshots were approximately 377 MB and 414 MB respectively (decimal MB).
The stress process retains two service dates plus an additional synthetic schedule;
these are not isolated API steady-state or sampled peak measurements. Earlier
unbatched scans took about 12.5 s with links and a 570 MB snapshot, motivating
shared scanning; candidate coverage was not reduced to obtain the improvement. Render's 0.5 CPU /
512 MB tier needs owner-authorized cold/concurrent validation before rollout.

## Operations and remaining release boundaries

- Apply migration 003 before an approved M9C API rollout; readiness checks it.
  Empty graphs are valid, but Benchmark A's real inter-stop walk remains absent
  until separately reviewed evidence is published.
- After source/rights/crossing review, use the explicit evidence JSON publisher:
  `node workers/transit-ingest/dist/pedestrian-cli.js publish evidence.json --rights-reviewed`.
  Its DATABASE_URL is an administrative input; do not point it at production
  without approval. JSON fields follow PedestrianEvidence in pedestrian-links.ts.
  It inserts once, transactionally; it never generates reverse edges or makes
  provider calls. Restart schedule caches after publication. Cleanup of retained
  evidence by its deadline remains an explicit owner operation, not an implied
  license or an automatic destructive job. Cache TTL is bounded by that deadline.
- No network-wide Geoapify preparation run is authorized. Before one, estimate
  directed pair count, quota/cost, source terms and retention implications.
- Automatic prior-day discovery/cross-publication stitching is deferred. Explicit
  previous-service-day >24:00 planning works. Direct walking-only planning remains
  outside this milestone; bounded transit search can legitimately find no route.
- Pedestrian evidence validates provider connectivity, not physical accessibility,
  crossing safety or platform signage. Owner must inspect the benchmark paths.
- Exact original pins, mobile/desktop screenshots, 320 px/zoom/screen-reader and
  keyboard testing, installation, production latency/RSS/concurrency, backups,
  retention, budgets, static-data/provider rights and public-release approval
  remain owner checks. DART affiliation is explicitly disclaimed; realtime off.
- Maps still show relevant places/stops, not transit/walking route polylines.
  Candidate selection is bounded and does not guarantee global optimality.

## Final validation record

- `pnpm test`: 506 tests across 42 suites passed.
- `pnpm test:integration`: 55 tests across four suites passed using isolated databases.
- `pnpm typecheck`: passed across all eight workspaces.
- `pnpm lint`: passed (root and web ESLint).
- `pnpm build`: passed with inert production build configuration; no deployment.
- `pnpm format:check` and `git diff --check`: passed.

The local diagnostic database and running PostGIS service are retained for owner
review. The retained `dallas_transit` data was not reset or migrated by this pass;
only the separate copy and test databases received migration 003. No production
dependency, secret, provider-derived graph or raw response was added to the repo.

## Sparse transfer preparation follow-up

The provider-free `scripts/m9c-transfer-candidates.mjs` dry-run on publication
`V738-218-217-20260921` produced 27330 directed validation candidates across 6826
sources. Among sources with candidates, median/p95/max were 3/10/12. These include
fallback candidates, not accepted pedestrian links. Distance bands (geodesic
meters) were 6481 at <=100, 7056 at >100–250, 12924 at >250–500 and 869 at >500–800.
Rail-capable versus other stop classification gave 25525 bus→bus, 1397 bus→rail,
397 rail→bus and 11 rail→rail candidates. Mixed-mode stops count as rail-capable.

This is 97.24% below the 989596 full-envelope baseline, 90.04% below the 274292
<=1200 m baseline and 60.54% below the 69256 <=500 m baseline. The station exception
means the new set is not simply a subset of the last baseline. Frankford
33777→19300 survives at 375 m geodesic distance without production stop-ID rules.
The first attempt omitted it in favor of two same-service approaches; a synthetic
regression now preserves a geographically different fallback around intersections.
Selection still needs directed pedestrian validation and does not prove any crossing.

The separate transfer policy, calendar overlap, coverage selection, quadrant
fallback and six-accepted/twelve-attempt bounds are recorded in ADR 0005. The
100000 safety bound remains unchanged. No provider calls, evidence persistence,
migrations or production access were used for this follow-up.

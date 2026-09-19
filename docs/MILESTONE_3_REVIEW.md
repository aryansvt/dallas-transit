# Milestone 3 review package

Implementation and local validation: 2026-09-19. Human review is pending.

## A. Executive summary

The independent schedule router is implemented and validated. It computes direct
and multi-transfer stop-to-stop journeys, reconstructs exact transit occurrences,
handles service-day times beyond midnight, restrictions, loops and overtaking,
and returns deterministic arrival/transfer alternatives. A read-only worker adapter
loads one activated publication/service date without putting SQL in the router.

All required final gates passed: 125 offline tests, 34 PostGIS integration tests,
formatting, lint, type checking, build, frozen install, Compose and diff checks.
Four real DART queries succeeded, including a transfer and overnight rail/bus.
No commit, push, merge, PR creation, ADR change, or Milestone 4 work occurred.

## B. Branch and starting main commit

- Branch: `feat/routing-core`.
- Starting main: `4c611745c7b98e6649fb89845a36881be15a124d`.
- `main` was clean and matched a freshly fetched `origin/main`, zero ahead/behind.
- The feature branch's HEAD remains at that starting commit; all work is unstaged.

## C. Architecture implemented

`packages/router` owns schedule/result types, immutable preparation and indexes,
marked-pattern round scans, interchange propagation, predecessor reconstruction,
and deterministic ordering. Its production imports are package-relative only.
`workers/transit-ingest` owns the SQL loader and local validation CLI, reusing the
Milestone 2 database schema and calendar function. No migrations or API changes
were needed. Domain/shared/realtime packages and both applications are unchanged.
See [ROUTING_CORE.md](ROUTING_CORE.md) for interfaces, reasoning, and complexity.

## D. Dependencies added

No external production or development dependency was added. The worker now uses
`@dallas-transit/router: workspace:*` through its public exports. The lockfile adds
only that workspace link (three lines), without changing external versions.
Router algorithms use TypeScript/JavaScript built-ins. The adapter reuses `pg`.

## E. Router input model

One publication ID, one service date, an explicit active-service ID set, stops with
required change allowances, trips with route/service IDs, and ordered events.
Each event retains original sequence, integer/null arrival/departure, and four-state
pickup/drop-off flags. Optional directed interchange links have IDs/endpoints and
durations. IDs are scoped to the publication. Data is copied, validated, and frozen;
mutable lookup maps are private. No geographic or UI fields are required.

## F. RAPTOR/round semantics

Round 0 is the origin at the requested departure. Round `k` adds exactly the kth
transit boarding; transfer count is `k - 1`. Previous-round improvements mark
patterns for scanning. Current-round arrivals cannot board again until the next
round. Explicit link closure stays within the current boarding round. Search stops
at the bound or when no labels improve. This is round-based transit scanning,
not Dijkstra/A* over a stop-time event graph.

## G. Route-pattern construction

Equivalence is the route ID plus the exact ordered `(stopId, pickup, dropOff)`
tuples. Repeated visits remain separate; original sequence values are preserved
per trip but need not match another trip's numbering. Branches, loops and different
permissions split patterns. Times, direction labels, service IDs and shapes do not
define equivalence. Canonically sorted pattern keys generate view-local IDs.

## H. Service-date handling

Core tests supply active-service sets in memory. The adapter selects
`feed_activation(source_key, service_date)` and evaluates `service_is_active` once
per service in a read-only repeatable-read transaction. Weekly rules and exception
additions/removals, including exception-only service, are covered by integration
tests. No activation means `no-publication`; no newest-feed fallback is used.
A core request for a different date returns `service-date-not-loaded`.

## I. GTFS time handling

Service-day seconds remain integers, without midnight modulo or civil-time
conversion. Tests route `87300` (24:15), `91800` (25:30), and `93960` (26:06).
Positive dwell and equal-time successive visits are supported. Null arrival or
departure is never invented; that particular alighting/boarding is unavailable,
while through travel remains possible. Timestamp/DST conversion and adjacent-day
search are explicitly deferred.

## J. Direct journey behavior

A trip must operate on the selected date, depart at or after the request, permit
pickup, and have an allowed destination visit after the boarded occurrence.
Results include exact trip, route, pattern, stops, occurrences, sequences, departure
and arrival. Initial wait is included in duration. A known identical origin and
destination returns a zero-leg, zero-duration result.

## K. Transfer behavior

Same-stop changes use an explicit `changeSeconds` allowance. Directed supplied
links can chain between rides and produce transfer legs; link duration and the
boarding stop's allowance must both fit before departure. Connections leaving
too early are rejected. Fixture tests include one/multiple transfers, later
catchable trips, and an earlier local improvement enabling a later route.
No links are generated from geography, names or DART supplements. Links cannot
provide initial access, final egress, or walking-only journeys in this milestone.

## L. Pickup/drop-off restrictions

Permission `0` allows ordinary service. `1` prohibits the event; `2` and `3`
require arrangements and are excluded until a supported arrangement workflow
exists. SQL null defaults to `0`, while nonzero meanings remain distinguishable.
Checks apply to each occurrence, including connecting trips. Riding through
restricted intermediate visits is permitted.

## M. Repeated-stop/loop handling

Trip arrays preserve every visit and its original sequence, including gaps.
Reconstruction carries both zero-based occurrence index and source sequence.
Tests miss/prohibit a first pickup and board a later visit, pass a prohibited
drop-off and alight on a later loop, and reject reverse-time/order travel.
Alighting is evaluated before boarding at each position to prevent using the
boarding occurrence as its own exit.

## N. Overtaking/trip-selection strategy

The router scans every trip of each marked pattern once per round. It never
assumes the first departure gives the best downstream arrival. Within one trip,
the first feasible boarding occurrence can reach every later visit; across trips,
all downstream arrivals compete. A dedicated same-pattern fixture has different
winners at an intermediate stop and at the destination. No non-overtaking
invariant needs to be imposed or inferred from the current feed.

## O. Path reconstruction design

An improved arrival owns a predecessor label and the exact transit/transfer leg
that created it. Replacing a stop's best label does not modify older predecessors.
Reconstruction reverses this linked path. Journeys carry publication/date, requested
departure, final arrival, duration, boarding count, transfer count and ordered legs.
Same-stop waiting appears in the time gap between rides. Results are machine-readable.

## P. Journey ordering/ranking

The router returns nondominated arrival/boarding alternatives, at most one strictly
improved destination arrival per boarding count. Earlier arrival sorts first;
fewer transfers wins an equal arrival. Canonical pattern/trip/occurrence/link scan
order resolves equivalent paths deterministically regardless of input order.
No walking or transfer-risk scores are fabricated. Future criteria may require
multiple labels per stop/round and a revised dominance rule.

## Q. Search/transfer bounds

The exported default is three transfers/four boardings, a bounded policy for local
journeys. Callers may override it; zero means direct service. Invalid or fractional
bounds are rejected. Tests cover a journey inside/outside a supplied limit and a
five-boarding chain requiring an override. Early exhaustion stops the search even
when the configured bound is larger.

## R. Unreachable-result behavior

Normal outcomes use the typed `no-journey` result: `unknown-stop`,
`service-date-not-loaded`, `no-service`, or `unreachable`. Unreachable includes
disconnection, last departure, restrictions, missed connections and exceeded
bounds; the router does not claim a more specific cause without proving it.
Malformed representations and requests throw validation errors.

## S. Fixture-network design

Small original TypeScript timetables use lettered stops and readable seconds.
A six-trip network competes between a slow direct ride, one-transfer service,
and a faster two-transfer path; it includes a missed connection. Focused fixtures
add loops, variant patterns, restrictions, overnight times, dwell, null visits,
directed links, zero-time cycles, change buffers and limits. They contain no DART
rows and need neither a database nor network access.

The exhaustive test enumerates ride choices independently across 160 fixed-seed
small networks at three departure times (480 comparisons), including random loops,
permissions, dwell, inactive services and directed links. It uses no production
pattern scan or dominance implementation.

## T. Unit-test results

- `pnpm test`: **PASS**, 125 tests in eight files, including all 62 prior tests.
- `pnpm test:router`: **PASS**, 63 tests in three files.
- Full suite observed duration: 4.31 s; targeted routing command: 0.30 s.
- One exhaustive case exposed origin-return pruning when links are unavailable
  before the first ride. The initial origin is now kept outside post-transit
  dominance, and a named regression verifies the exact three-leg result.
- The failing intermediate run was fixed; no failing final unit gate remains.

## U. Integration-test and quality-gate results

| Command                                                                                       | Final result                             |
| --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | PASS                                     |
| `pnpm format:check`                                                                           | PASS                                     |
| `pnpm lint`                                                                                   | PASS                                     |
| `pnpm typecheck`                                                                              | PASS, all eight workspaces               |
| `pnpm test`                                                                                   | PASS, 125 tests                          |
| `pnpm test:integration`                                                                       | PASS, 34 tests in two files              |
| `pnpm build`                                                                                  | PASS, including Next.js production build |
| `docker compose --project-directory infra/docker -f infra/docker/compose.yaml config --quiet` | PASS                                     |
| `pnpm test:router`                                                                            | PASS, 63 tests                           |
| `pnpm routing:validate --help` and four DART queries                                          | PASS                                     |
| `git diff --check`                                                                            | PASS                                     |

The integration total includes all 24 existing ingestion tests and 10 adapter tests
(counting parameterized calendar cases). The latter cover no publication, weekly
service, removed/added exceptions, exception-only service, SQL defaults, exact
transfer legs, restrictions, overnight values, publication correction/ID churn,
and rollback leaving the client usable. Suites create/drop only uniquely named
fixture databases. They do not touch normal DART data.

Initial frozen-install, Vitest, Docker and Next.js attempts encountered sandbox
network/process/pipe restrictions; approved execution outside the sandbox passed.
An initial unquoted PowerShell CLI invocation failed argument validation before
database access; quoted commands passed and are documented. GitHub-hosted CI has
not run because nothing was pushed; its existing gates include the new tests.

## V. Correctness invariants tested

- All used trips belong to the selected publication/date/service set.
- Every transit leg matches exact scheduled board/alight events and permissions.
- Boarding occurrence and sequence precede alighting occurrence and sequence.
- Path time never decreases; connecting departure includes the supplied buffer.
- Adjacent leg endpoints are continuous, including explicit link chains.
- Journey arrival equals the last transit leg's arrival; duration includes waiting.
- Boarding count equals transit-leg count; transfers equal `max(0, boardings - 1)`.
- Better earliest labels do not corrupt predecessor paths; equivalent input order
  and repeated requests produce the same result.
- Output arrival/boarding Pareto sets match the independent exhaustive enumerator.

## W. Real DART schedule build/load results

Selected service date: **2026-09-18**. Publication:
`0558fb28-946e-4ea4-99bf-9a835afc82b5`, `V734-218-216-20260914`.
Activation remains September 14–20. The adjacent publication remains activated
September 21–October 18. Neither publication nor activation was changed.

| Measurement                                                | First load, three rail queries |   Second load, bus query |
| ---------------------------------------------------------- | -----------------------------: | -----------------------: |
| SQL extraction                                             |                    1,573.29 ms |              1,005.79 ms |
| Validation/pattern/index build                             |                      169.37 ms |                149.21 ms |
| Total preparation                                          |                    1,742.72 ms |              1,155.07 ms |
| Stops                                                      |                          6,978 |                    6,978 |
| Patterns                                                   |                            236 |                      236 |
| Active trips                                               |                          7,588 |                    7,588 |
| Stop events                                                |                        363,050 |                  363,050 |
| Untimed / conditional-pickup / conditional-drop-off events |                      0 / 0 / 0 |                0 / 0 / 0 |
| RSS before / after, bytes                                  |       51,478,528 / 274,714,624 | 51,326,976 / 279,945,216 |
| Heap used before / after, bytes                            |        7,674,656 / 109,598,696 |  7,590,896 / 108,983,352 |

These are process snapshots, including temporary adapter/runtime objects, not
peak memory or retained schedule size. Preparation is dominated by SQL extraction;
there was no unexpectedly slow step requiring a cache, schema/index change or
complex optimization. Two full loads were sufficient for these checks.

## X. Real DART routing queries and results

All requests used the publication/date above, maximum three transfers, no inter-stop
links, and **120 seconds change allowance**. This is an explicit validation
assumption, not a claim of verified station walking time. Each query had one warm-up
and five timed repetitions. Sequence and occurrence below refer to the selected
trip; occurrence indexes are zero-based. Times remain service-day values.

| Query                                                             | Requested departure | Result                  | Boardings / transfers | Duration |
| ----------------------------------------------------------------- | ------------------- | ----------------------- | --------------------- | -------- |
| `22749` WEST END → `26895` CITYLINE/BUSH                          | 08:00:00 (28800)    | Arrive 08:43:00 (31380) | 1 / 0                 | 2,580 s  |
| `32562` DOWNTOWN ROWLETT → `32553` DFW AIRPORT                    | 08:00:00 (28800)    | Arrive 09:54:00 (35640) | 2 / 1                 | 6,840 s  |
| `22749` WEST END → `26897` PARKER ROAD                            | 24:00:00 (86400)    | Arrive 24:59:30 (89970) | 1 / 0                 | 3,570 s  |
| `32095` HALL @ ELM - S - NS → `15882` MALCOLM X @ WARREN - S - NS | 24:00:00 (86400)    | Arrive 24:05:52 (86752) | 1 / 0                 | 352 s    |

Exact legs:

| Query / leg | Trip      | Route / pattern                | Board stop, sequence, occurrence | Departure        | Alight stop, sequence, occurrence | Arrival          |
| ----------- | --------- | ------------------------------ | -------------------------------- | ---------------- | --------------------------------- | ---------------- |
| 1           | `9112386` | ORANGE `27253` / `pattern:21`  | `22749`, 15, 13                  | 08:04:00 (29040) | `26895`, 37, 27                   | 08:43:00 (31380) |
| 2 / 1       | `9113173` | BLUE `27251` / `pattern:4`     | `32562`, 1, 0                    | 08:16:30 (29790) | `22938`, 7, 6                     | 08:42:30 (31350) |
| 2 / 2       | `9112457` | ORANGE `27253` / `pattern:15`  | `22938`, 14, 12                  | 08:47:30 (31650) | `32553`, 40, 30                   | 09:54:00 (35640) |
| 3           | `9112057` | RED `27254` / `pattern:26`     | `22749`, 9, 8                    | 24:14:00 (87240) | `26897`, 30, 25                   | 24:59:30 (89970) |
| 4           | `9064416` | Bus 001 `27264` / `pattern:39` | `32095`, 26, 25                  | 24:00:01 (86401) | `15882`, 33, 32                   | 24:05:52 (86752) |

The transfer is at `22938`, SMU/MOCKINGBIRD STATION, with 300 scheduled seconds
between rides, exceeding the scenario's 120-second allowance. Each query returned
one nondominated journey under the configured model. Rail route type is 0; bus is 3.
These examples show successful real-data transformation and routing, not broad
correctness, platform accessibility, actual service operation, or public-travel readiness.

Reproduce against the retained database:

```sh
pnpm infra:up
pnpm routing:validate --date 2026-09-18 --change-seconds 120 --runs 5 --query '22749,26895,08:00:00' --query '32562,32553,08:00:00' --query '22749,26897,24:00:00' --query '32095,15882,24:00:00'
pnpm infra:down
```

## Y. Performance observations

| DART query | Five measured latencies, ms                 | Median, ms |
| ---------- | ------------------------------------------- | ---------: |
| 1          | 1.0451, 2.5630, 3.2284, 1.8362, 0.9781      |     1.8362 |
| 2          | 0.6529, 0.5878, 0.6076, 0.6405, 0.5827      |     0.6076 |
| 3          | 0.8629, 0.8514, 0.8579, 0.8555, 0.8710      |     0.8579 |
| 4          | 11.6087, 12.9302, 11.5929, 11.0199, 10.8560 |    11.5929 |

A deterministic four-stop/six-trip/twelve-event fixture was measured for 10,000
queries after 1,000 warm-ups: mean **0.00765 ms**, median **0.0062 ms**, p95
**0.0083 ms**, maximum **0.6606 ms**. The temporary script was removed. Tiny
microbenchmarks reflect JIT and timer overhead and are not a throughput promise.

Environment: Windows, Node 24.21.0, pnpm 12.4.2, local Docker/PostGIS, one process.
Database caches/JIT/GC were not controlled. Queries exclude load time and have
few same-stop transfer possibilities. Worst-case scans visit each marked pattern's
events per round; extensive generated links may need a faster closure in later
milestones. No performance SLA is inferred from this sample.

## Z. OTP comparison status

Deferred to Milestone 7. No reliable local comparison harness was already present;
building one would expand this milestone. OTP is neither a runtime dependency nor
the production router. Exhaustive synthetic comparison supplements scenario tests
but does not substitute for future independent real-world comparisons.

## AA. Documentation changes

New `ROUTING_CORE.md` documents inputs, algorithm, rounds, dominance, patterns,
overtaking, times, transfer/restriction assumptions, reconstruction, ranking,
invariants, complexity, loader/CLI, and deferred work. This document is the complete
review package. README status/commands, DEVELOPMENT package/validation workflow,
and CONTRIBUTING routing guidance were updated. Earlier milestone reviews, static
schema design, product/architecture/roadmap documents and accepted ADRs are unchanged.

## AB. Files created/modified/deleted

Modified (8):

- `CONTRIBUTING.md`, `README.md`, `docs/DEVELOPMENT.md`.
- `package.json`, `pnpm-lock.yaml`.
- `packages/router/src/index.ts`, `packages/router/tsconfig.build.json`.
- `workers/transit-ingest/package.json`.

Created (13):

- `docs/ROUTING_CORE.md`, `docs/MILESTONE_3_REVIEW.md`.
- `packages/router/src/types.ts`, `validation.ts`, `schedule.ts`, `route.ts`.
- `packages/router/src/test-support.ts`, `schedule.test.ts`, `route.test.ts`, `oracle.test.ts`.
- `workers/transit-ingest/src/routing-schedule.ts`, `routing-cli.ts`, `routing-schedule.integration.test.ts`.

Deleted repository files: none. No applied migration or raw feed was modified.

## AC. Git status and hygiene

The branch has eight modified tracked files and thirteen new files, all unstaged.
HEAD/main/fetched origin/main remain at the starting commit. No commit, push, merge
or PR was made. Raw GTFS, real `.env`, node_modules, build output, temporary files
and Docker/database storage are not tracked. Ignore checks and changed-file secret
inspection passed; there are no new credential/token/private-key candidates.
The unchanged example/local-development defaults are not private credentials.

The normal database still contained **two publications and 1,925,348 stop-time rows**
after validation, with original activation ranges. Services were stopped with
`pnpm infra:down`, without `--volumes`; `dallas-transit_postgres-data` was preserved.
No debug/benchmark script remains among deliverables.

## AD. Diff statistics

| Measure                           |      Count |
| --------------------------------- | ---------: |
| Changed files including new files |         21 |
| Modified / created / deleted      | 8 / 13 / 0 |
| Insertions including new files    |       2884 |
| Deletions                         |         35 |

Counts include this review and all new files; `git diff --stat` alone omits
untracked additions. Nothing is staged.

## AE. Known limitations/deferred work

- One explicit service date/publication per schedule; no civil-time/DST conversion
  or adjacent-service-date stitching.
- No geographic access/egress, coordinate routing, inferred links, verified DART
  platforms/station walks, or accessibility guarantee.
- Conditional arrangements, null-time interpolation, trip-pair transfer rules,
  stay-seated interlining, frequency/Flex service and richer criteria are deferred.
- Transfer links are interchanges only; no walking-only result. Equivalent-cost
  itineraries are represented by one deterministic path, not exhaustively listed.
- FIFO link relaxation has a conservative worst-case bound; larger geographic
  networks and load/retained-memory profiling need later measurements.
- No realtime, API journeys, UI, authentication, cache, OTP runtime or deployment.
- Milestone 0 data-use/public-deployment and legitimate realtime-access questions
  remain open; no permission or endpoint stability is assumed here.

## AF. Findings that affect future milestones

Round-zero origin and post-ride origin differ when interchange links are available
only after riding; preserve this distinction when adding access/egress. New walking
or risk criteria and trip-specific restrictions require revisiting dominance, not
merely adding output metrics. The DART schedule has many fewer active daily events
than publication-total rows, so date selection materially reduces preparation.
Its flat stop model still needs reviewed geographic/station links. Query latency
varies with network reachability; use broad profiles before optimizing or caching.

## AG. Human decisions needed

Review the implementation and documented scope before authorizing a commit or PR.
No ADR change or substantial dependency approval is needed. The 120-second DART
scenario is evidence for local integration only; selecting verified station/change
policy belongs to later product work. No Milestone 4 work has begun.

## AH. Milestone acceptance criteria

| Criterion                                                                  | Result    |
| -------------------------------------------------------------------------- | --------- |
| Clean/current main verified; requested branch created                      | SATISFIED |
| Dependency-free router independent of SQL/HTTP/UI/realtime                 | SATISFIED |
| Explicit immutable one-publication/service-date input                      | SATISFIED |
| RAPTOR-style marked-pattern boarding rounds                                | SATISFIED |
| Direct journeys with exact events and scheduled constraints                | SATISFIED |
| One/multiple transfers, missed/catchable connections, propagation          | SATISFIED |
| Weekly/exception service selection through a clean adapter                 | SATISFIED |
| Service-day times beyond 24 hours                                          | SATISFIED |
| Pattern variants, repeated stops, loops and occurrence restrictions        | SATISFIED |
| Overtaking/downstream-arrival correctness strategy and tests               | SATISFIED |
| Complete machine-readable path reconstruction and metadata                 | SATISFIED |
| Earliest arrival then fewer transfers; deterministic alternatives          | SATISFIED |
| Configurable explained bound and typed no-journey results                  | SATISFIED |
| Synthetic fixtures, exact itinerary tests and inexpensive invariant checks | SATISFIED |
| Existing Milestone 1/2 tests continue passing                              | SATISFIED |
| Real PostGIS adapter tests and coherent publication/ID handling            | SATISFIED |
| Real DART direct/transfer/rail/bus/overnight integration evidence          | SATISFIED |
| Preparation counts, memory snapshots and query measurements reported       | SATISFIED |
| OTP kept outside production; explicit Milestone 7 deferral documented      | SATISFIED |
| No new external production/development dependencies                        | SATISFIED |
| Design, development guidance and complete review package                   | SATISFIED |
| All requested quality gates pass                                           | SATISFIED |
| Raw data, secrets, outputs and database storage kept out of Git            | SATISFIED |
| Services stopped; normal database volume preserved                         | SATISFIED |
| Accepted ADRs unchanged; all Milestone 4+ exclusions honored               | SATISFIED |
| Stop before commit/push/merge                                              | SATISFIED |

The milestone's deterministic stop-to-stop exit condition is satisfied. Public
travel readiness and OTP comparison are future criteria, not claimed completed here.

## AI. Suggested commit message

`feat(router): add schedule-based round routing and exact journey reconstruction`

## AJ. Suggested PR title and description

Title: **feat(router): implement Milestone 3 schedule routing core**

Description:

> Adds an independent stop-to-stop schedule router with marked-pattern boarding
> rounds, exact itinerary reconstruction, and deterministic arrival/transfer
> alternatives. Handles overnight service seconds, occurrence restrictions,
> repeated stops, explicit interchange links, bounded transfers and overtaking.
>
> A read-only worker adapter selects one activated publication/service date and
> converts its active trips into immutable router inputs. No external dependency,
> SQL migration, HTTP endpoint, UI, realtime or geographic routing is added.
>
> Validation: 125 offline tests (63 routing), 34 PostGIS integration tests, all
> required quality gates, and four retained-DART queries covering direct service,
> a transfer, and overnight rail/bus. Preparing 363,050 daily events took 1.16–1.74
> seconds locally; sampled warm query latencies were 0.58–12.93 ms. These are limited
> integration observations. See ROUTING_CORE and MILESTONE_3_REVIEW for exact queries,
> algorithm reasoning, the explicit transfer-buffer assumption, and deferred work.

## AK. Final recommendation

**READY WITH DOCUMENTED LIMITATIONS.** Milestone 3 is ready for human review.
No commit/push/merge or Milestone 4 work is authorized by this recommendation.

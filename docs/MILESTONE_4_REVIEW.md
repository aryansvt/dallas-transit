# Milestone 4 review package

Implemented and validated on 2026-09-19. Human review is pending.

## A. Executive summary

Geographic schedule planning is implemented: validated coordinates select bounded
PostGIS stop candidates, an injected pedestrian provider supplies access/egress,
and the unchanged Milestone 3 router computes transit. Final journeys are ranked
after walking composition. A configurable Valhalla adapter uses Node fetch.

All required quality gates pass: **208 offline tests, 97 router tests, 83 targeted
geographic/provider tests, and 46 PostGIS integration tests**, plus frozen install,
formatting, lint, types, build, Compose configuration and diff checks. Test totals
overlap: the router and geographic suites are subsets of the offline suite.
Two retained-DART candidate scenarios and one full journey using two live Valhalla
development-demo calls succeeded. No external dependency or workspace was added.

No commit, push, merge, PR creation, accepted-ADR change or Milestone 5 work occurred.

## B. Branch and starting main commit

- Branch: `feat/geographic-journey-planning`.
- Starting main: `f09a9c15aa98dd502284d293eaf57a682004db74`.
- Main was clean; a fresh `git fetch origin main` confirmed zero ahead/behind.
- HEAD, main and fetched origin/main still identify that commit. Work is unstaged.

## C. Architecture implemented

Pure geographic value types, validation, bounds and composition live in the existing
router package. Candidate SQL, pedestrian-provider calls, async orchestration and
local validation live beside Milestone 3's loader in the existing worker. The core
imports no database/HTTP/UI/realtime code and never calls a provider. The transit
algorithm, schedule builder, M3 types, SQL migrations and applications are unchanged.
See [the complete design](GEOGRAPHIC_JOURNEY_PLANNING.md).

## D. Dependencies added

**None**, external or workspace. Existing `pg` supplies PostGIS access; Node's
built-in fetch, abort, URL, streams and argument parsing cover the adapter/CLI.
`pnpm-lock.yaml` and all workspace dependency manifests are unchanged. Root
`package.json` adds two scripts only. No street dataset, engine image, custom
pathfinding, map library, ORM, OTP runtime, cloud resource or credential was added.

## E. Geographic request/result model

Input: origin/destination coordinates, service date, service-day departure seconds
and maximum transfers. Results carry publication/date, coordinates, access/egress
stop IDs, requested departure, final arrival, total duration, boardings/transfers,
walking duration/distance, interchange duration and exact ordered legs.
Success requires transit. `walk` legs precede/follow the original transit and
supplied interchange legs. Output is structured data, without generated UI prose.

## F. Coordinate validation

Both numeric components must be finite. Latitude is inclusive [-90,90], longitude
inclusive [-180,180]. Invalid objects, missing values, strings, NaN, infinities and
out-of-range coordinates fail before I/O. Pole/date-line boundary values are valid.
Provider endpoints undergo the same validation and must match their request.

## G. PostGIS candidate-search strategy

Read one activated source/date and compare it to the loaded schedule's publication.
Both endpoint queries share a read-only repeatable-read snapshot. Parameterized
SQL uses the existing geometry GiST index for conservative envelopes, then
`ST_DWithin(geography)` and `ST_Distance(geography)` for meter filtering/order.
Only stop/platform rows are candidates. Distance ties use `stop_id COLLATE "C"`.
Date-line/pole envelopes are covered by actual PostGIS tests. No schema change or
geographic scan of every stop is needed for the measured DART queries.

## H. Access-stop strategy

Obtain origin-to-stop pedestrian routes for bounded spatial candidates. Discard
confirmed no-route responses; retain explicit failure diagnostics. Access arrival
is requested departure plus provider duration. Round readiness upward only when
comparing to integer transit seconds. The six-minute/08:04 missed-bus fixture and
a later catchable departure pass. Geographic proximity never becomes walking time.

## I. Egress-stop strategy

Request stop-to-destination routes in that direction. Add provider duration to
scheduled alighting to obtain final arrival. Tests demonstrate that an earlier
alighting loses to a farther stop with shorter egress. Distances used for pruning
remain separate fields from pedestrian distances.

## J. Walking-provider interface

`WalkingProvider.route({ origin, destination }, AbortSignal): Promise<unknown>`
is an external-data boundary. Validation produces `WalkingResult`: `ok` with
coordinates, duration and distance; `no-route`; or typed `unavailable`.
The deterministic provider uses an exact table of synthetic values and never
interpolates coordinates or invents paths. Geometry is not included in this milestone.

## K. Walking-provider implementation/status

Implemented the documented Valhalla pedestrian `/route` adapter with an explicit
operator-selected endpoint, kilometer conversion, structural/coordinate/summary
validation, a 1 MiB response bound, cancellation and no redirects/retries. It has
no default service URL. Configuration comes from `--valhalla-url` or
`WALKING_VALHALLA_URL`; no credential/key workflow was added.

Primary research: [Valhalla's documented demo policy](https://github.com/valhalla/valhalla#demo-server),
[route API](https://valhalla.github.io/valhalla/api/route/api-reference/), and
[openrouteservice's hosted API-key requirement](https://api.openrouteservice.org/).
FOSSGIS's publicly documented demo permits development testing under fair use;
this review used two sequential requests with an identifying client header.
No end-user app was published. Production service selection remains a human decision.

## L. Provider failure handling

Negative/non-finite/oversized metrics, malformed coordinates/results, mismatched
endpoints, invalid JSON, oversized bodies and unsupported ferry results are rejected.
Known Valhalla connectivity/path errors map to no-route; authentication, quota,
server, configuration and other errors do not claim proven disconnection.
Thrown errors and timeouts have typed outcomes without raw error details.

Normal planning reasons distinguish missing/changed publication, unloaded date,
no nearby/reachable access or egress, transit unreachable, and provider unavailable.
Partial provider failure can retain useful journeys with `incomplete: true`.
Failed candidates prevent a falsely specific transit-unreachable diagnosis.
Malformed caller/configuration contracts throw; unexpected database faults propagate.

## M. Provider concurrency/bounds

Default concurrency is two, with five-second per-call deadlines and eight total
calls. Input-order result slots make completion order irrelevant. Timeout aborts
the call and stops scheduling queued work, even if a custom provider ignores abort.
Tests use controlled promises and fake clocks, without timing races. The live demo
sample explicitly lowered concurrency to one and candidate counts to one per end.

## N. Geographic journey composition

The pure composer searches each usable distinct-stop access/egress pair within
the prevalidated Cartesian-product budget, reusing one immutable schedule.
It surrounds exact M3 legs with timed walking legs, computes totals, filters
dominated/equivalent outcomes, ranks and limits alternatives. Same-stop pairs
are skipped because the current core returns zero-leg results there.

## O. Initial boarding semantics

No initial boarding buffer is introduced. Walking ends at the boarding stop and
the first transit departure need only be at or after that arrival. M3 stop change
allowances still apply only after the first ride. A fixture gives the origin a
600-second interchange allowance and verifies it does not delay initial boarding.
Real-DART queries explicitly use 120 seconds for subsequent changes, an unverified
scenario assumption inherited from M3, not measured station walking.

## P. Walking-aware ranking/dominance

Priority is final arrival, fewer transfers, lower total provider-reported walking
**duration**, then stable access/egress IDs and exact legs. Walking distance is
reported but not scored. No transfer-risk score or weighted ranking is introduced.
Pareto filtering retains later alternatives when they save walking or transfers;
identical metric tuples keep one canonical representative.

Separate pair searches prevent earlier access with more walking from erasing a
later, lower-walking label at a shared intermediate stop. Within a fixed pair,
access/egress walking is constant, so M3's existing arrival/boarding dominance is
safe. Adding egress as a fixed constant also preserves that pair's transit ordering.
Tests cover the shared-stop counterexample and egress reversal.

Legacy interchange links have a duration but no measured pedestrian distance/mode.
They remain exact transfer legs and contribute to `interchangeDurationSeconds`.
Walking totals cover provider-reported access/egress only. No new walking transfers
are generated. If future inter-stop walking becomes a ranking criterion, richer
core labels are required; this implementation does not conceal that limitation.

## Q. Candidate/search limits

| Setting               | Default | Maximum |
| --------------------- | ------: | ------: |
| Radius (m)            |   1,200 |   5,000 |
| Access candidates     |       4 |      16 |
| Egress candidates     |       4 |      16 |
| Provider calls        |       8 |      32 |
| Provider concurrency  |       2 |       8 |
| Provider timeout (ms) |   5,000 |  30,000 |
| Transit searches      |      16 |     256 |
| Returned journeys     |       3 |      10 |
| Transit transfers     |       3 |       8 |

Overrides are supported within the documented ceilings. The candidate sum must
fit provider calls and product must fit transit searches; invalid policies fail
before work. No unbounded search or silent pair truncation occurs. Top-N/radius
pruning limits completeness and can exclude a useful farther stop.

## R. Direct-walking status

Deferred, as permitted by milestone scope. No zero-transit or two-walk same-stop
result is mislabeled as a transit journey. No arbitrary inter-stop walking is added.

## S. Service-date/overnight handling

One explicit service date/publication remains the boundary. Access can cross
midnight while a transit departure remains 87,300 (24:15), with final arrival
beyond that. No seconds wrap, civil-time/DST conversion or adjacent-date stitching
was introduced. Fractional provider seconds are preserved; boarding readiness is
rounded upward, never downward.

## T. Geographic fixture design

Original tiny TypeScript networks cover: a closer stop with a worse pedestrian
route; a farther, faster stop; an unreachable nearby stop; missed and catchable
departures; earlier alighting with worse egress; equal final arrival with different
transfer/walking costs; later alternatives that save walking; no nearby/reachable
access/egress; valid walks with no transit connection; initial boarding semantics;
fractional times; overnight travel; exact interchange preservation; determinism;
validation failures and explicit budgets.

The CLI fixture has three access and two egress candidates. Access X has no path;
B's 180-second walk beats A's 600-second walk. Alighting D with 60-second egress
beats C with 600 seconds. Explicit tables supply these values; no street algorithm
or real DART rows are embedded. Provider mocks cover malformed payloads, zero
values, HTTP errors, deadlines, cancellation, concurrency and excessive bodies.

## U. Unit-test results

`pnpm test`: **PASS, 208 tests in 12 files**, including all 125 pre-M4 tests.
`pnpm test:journey`: **PASS, 83 tests in four files**. Of the new tests, 34 exercise
pure geographic composition/validation and 49 exercise orchestration/providers.
Standard tests use no external network, credentials, Docker or DART data.

## V. Router regression-test results

`pnpm test:router`: **PASS, 97 tests in four files**, comprising all 63 M3 tests
and 34 new geographic tests. Direct rides, transfer bounds, service selection,
after-midnight times, restrictions, repeated stops, loops, overtaking and exact
reconstruction remain passing. The M3 independent exhaustive test still compares
160 seeded networks at three departure times. No core algorithm/test was weakened.

## W. PostGIS integration-test results

`pnpm test:integration`: **PASS, 46 tests in three files**: all 34 existing tests
plus 12 geographic tests. New checks cover origin/destination lookup, radius/count
limits, deterministic ordering, invalid coordinates, no candidates, source/date
selection, publication correction, date-line/pole bounds and SQL-loaded transit
composition with explicitly synthetic walks. Each suite creates/drops only its
own uniquely named database. No test databases remained afterward.

## X. Real DART candidate-validation results

Service date: **2026-09-18**, requested departure **08:00:00 (28800)**. Publication:
`0558fb28-946e-4ea4-99bf-9a835afc82b5`, version `V734-218-216-20260914`.
It contains 6,978 stops and loads 7,588 active trips / 363,050 stop events / 236
patterns for this date. Radius 1,200 m, up to four candidates per end, three
transfers, and explicit 120-second subsequent-boarding change allowance.

Coordinates were chosen explicitly near recorded station locations, without geocoding:

| Scenario                        | Origin latitude, longitude | Destination latitude, longitude |
| ------------------------------- | -------------------------- | ------------------------------- |
| West End to CityLine/Bush       | 32.781200, -96.805600      | 33.002400, -96.702900           |
| Downtown Rowlett to DFW Airport | 32.904300, -96.563200      | 32.907600, -97.039200           |

All returned candidates, in query order; distances below are **geographic pruning
distances**, never pedestrian-route lengths:

| Scenario / end  | Stop  | Name                            | Distance (m) |
| --------------- | ----- | ------------------------------- | -----------: |
| West End access | 22749 | WEST END STATION                |       34.861 |
| West End access | 22820 | LAMAR @ PACIFIC - S - NS        |       74.106 |
| West End access | 20512 | LAMAR @ ROSS - S - NS           |       93.789 |
| West End access | 17137 | ELM @ AUSTIN - W - NS           |      115.791 |
| CityLine egress | 26895 | CITYLINE/BUSH STATION           |       34.546 |
| CityLine egress | 33260 | CITYLINE/BUSH STATION           |      116.336 |
| CityLine egress | 34046 | PLANO @ STATE - S - NS          |      324.978 |
| CityLine egress | 33797 | PLANO @ CITYLINE DRIVE - S - FS |      473.779 |
| Rowlett access  | 32562 | DOWNTOWN ROWLETT STATION        |       27.362 |
| DFW egress      | 32553 | DFW AIRPORT STATION             |       37.041 |
| DFW egress      | 33473 | DFW TERMINAL B                  |      239.005 |

Candidate-mode transit assumes presence at each access stop at 08:00. It makes no
access-catchability or final geographic-arrival claim. Reachable pair results:

| Access → egress | Transit arrival | Boardings / transfers |
| --------------- | --------------- | --------------------- |
| 22749 → 26895   | 31380 (08:43)   | 1 / 0                 |
| 22820 → 33260   | 38100 (10:35)   | 4 / 3                 |
| 20512 → 33260   | 38100 (10:35)   | 4 / 3                 |
| 17137 → 33260   | 40500 (11:15)   | 4 / 3                 |
| 32562 → 32553   | 35640 (09:54)   | 2 / 1                 |
| 32562 → 33473   | 37080 (10:18)   | 3 / 2                 |

West End had four reachable pairs among 16 searches; the remaining 12 were
unreachable within the supplied model/bounds. Rowlett had two among two. No
pedestrian inter-stop connections or same-name stop merging were inferred.

Representative exact transit legs: West End → CityLine uses trip `9112386`,
route `27253`, boarding occurrence 13/sequence 15 at 29040 and alighting occurrence
27/sequence 37 at 31380. Rowlett → DFW uses `9113173`/route `27251`, from `32562`
at 29790 to `22938` at 31350, then `9112457`/route `27253` from `22938` at 31650
to `32553` at 35640. These match the established M3 examples.

## Y. Full real-provider geographic validation

One development run used the documented endpoint
`https://valhalla1.openstreetmap.de/route`, with one candidate at each end,
concurrency one, no warm-up and no retries: **two HTTP requests total**. It used
the West End/CityLine coordinates, publication, service date and departure above.
Street routing was obtained on September 19 against the provider's then-current
map; transit remains the explicit September 18 schedule scenario, not realtime.

| Leg     | Coordinates / transit identity                           | Departure → arrival seconds | Provider distance |
| ------- | -------------------------------------------------------- | --------------------------- | ----------------: |
| Access  | (32.781200,-96.805600) → West End (32.780915,-96.805443) | 28800 → 29018.434           |             304 m |
| Transit | Trip 9112386, route 27253, 22749 → 26895                 | 29040 → 31380               | Not a walking leg |
| Egress  | CityLine (33.002166,-96.703144) → (33.002400,-96.702900) | 31380 → 31428.710           |              69 m |

Access duration **218.434 s**, egress **48.710 s**, total walking **267.144 s /
373 m**. Final arrival **08:43:48.710**, total journey **2628.710 s**, one boarding,
zero transfers, zero interchange duration. The provider gave an actual 304 m
access route where pruning distance was only 34.861 m. The bus/train departure
test uses actual provider time, and no initial 120-second penalty was added.

This single success validates the live adapter/composition path, not station
circulation, accessibility, street-data freshness, all DART journeys, or production
infrastructure. Geometry was not retained. No demo endpoint is enabled by default.

## Z. Performance observations

Windows, Node 24.21.0, pnpm 12.4.2, local Docker/PostGIS. SQL/JIT/GC caches were
not controlled; these are small local observations, not throughput or SLA claims.

| Measurement                                    | West End / CityLine | Rowlett / DFW |
| ---------------------------------------------- | ------------------: | ------------: |
| Schedule extraction + build                    |          1623.50 ms |    1189.43 ms |
| Origin lookup, five runs after one warm-up     |        1.48–2.38 ms |  1.02–1.14 ms |
| Destination lookup, same runs                  |        1.09–1.57 ms |  0.88–1.02 ms |
| Returned access / egress candidates            |               4 / 4 |         1 / 2 |
| Provider calls in candidate mode               |                   0 |             0 |
| Transit searches                               |                  16 |             2 |
| Sum of individual transit-call measurements    |           212.11 ms |       5.07 ms |
| Individual transit calls, no dedicated warm-up |       1.01–27.27 ms |  1.92–3.15 ms |

`EXPLAIN ANALYZE` used `stops_geom_idx` for all four endpoints. Execution times
were 0.691/0.227/0.113/0.073 ms respectively. Dense queries visited 146 and 20
selected-publication heap candidates before geographic filtering; spatial indexes
returned 292 and 40 rows across both publications. Sparse queries visited 2 and 4
rows across both publications. Dense plans also used a publication B-tree bitmap;
they did not evaluate geographic distance on all 6,978 stops. No index change or
cache was justified by these measurements.

The five-stop artificial planner, measured for 100 runs after one warm-up, used
three access/two egress candidates, five fixture-provider calls and four transit
searches per run. Total planning: mean **0.135 ms**, median **0.102 ms**, p95
**0.308 ms**, range **0.087–0.678 ms**. Median provider batch was **0.056 ms**;
median pure composition **0.037 ms**. Fixture SQL times are zero, not a database
benchmark. The fixture includes only three trips; timer/JIT overhead is material.

The live run separately measured two provider calls at **577.37 / 359.68 ms**,
provider batch **937.16 ms**, and pure transit composition **4.12 ms**. Composition
includes router searches, validation, reconstruction and ranking. Total planning
was **971.19 ms**, excluding **1207.42 ms** schedule preparation and CLI builds.
Initial endpoint SQL lookup was **24.57 / 1.69 ms**, illustrating first-query
overhead. Provider timings include HTTP, body reading and validation; network
latency is not confused with transit computation. No live latency benchmark was run.

## AA. Developer validation workflow

New commands: `pnpm test:journey` and `pnpm journey:validate --help`.
The CLI distinguishes offline `fixture`, SQL `candidates`, and configured real
`provider` modes. Missing provider configuration exits nonzero with a structured
unavailable result. Fixture mode never queries the network; candidate mode never
fabricates walks. Exact reproducible command forms and policy overrides are in
[DEVELOPMENT.md](DEVELOPMENT.md#geographic-journey-validation).

| Required gate                                                                                 | Result                                          |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | PASS; unchanged lockfile                        |
| `pnpm format:check`                                                                           | PASS                                            |
| `pnpm lint`                                                                                   | PASS                                            |
| `pnpm typecheck`                                                                              | PASS, all eight workspaces                      |
| `pnpm test`                                                                                   | PASS, 208                                       |
| `pnpm test:router`                                                                            | PASS, 97                                        |
| `pnpm test:journey`                                                                           | PASS, 83                                        |
| `pnpm test:integration`                                                                       | PASS, 46                                        |
| `pnpm build`                                                                                  | PASS, including Next.js production build        |
| `docker compose --project-directory infra/docker -f infra/docker/compose.yaml config --quiet` | PASS                                            |
| Geographic CLI help, fixture, candidate and real-provider modes                               | PASS                                            |
| Missing-provider configuration                                                                | Expected structured unavailable/nonzero outcome |
| `git diff --check`                                                                            | PASS                                            |

Initial sandbox attempts blocked registry fetches, Docker pipe access, Vitest and
Next.js child processes; approved execution passed. A fixture precision lint issue
and its initial TypeScript nullability issue were corrected before the final gates.
No final failure remains. GitHub-hosted CI has not run because nothing was pushed;
its existing test discovery includes all new offline and integration tests.

## AB. Documentation changes

Added this complete review and `GEOGRAPHIC_JOURNEY_PLANNING.md`. Updated README
status/commands, DEVELOPMENT architecture/validation workflow, CONTRIBUTING
geographic test guidance and the worker's optional environment example. Earlier
milestone reviews, architectural plans and accepted ADRs remain unchanged.

## AC. Files created/modified/deleted

Modified (7): `README.md`, `CONTRIBUTING.md`, `docs/DEVELOPMENT.md`, `package.json`,
`packages/router/src/index.ts`, `workers/transit-ingest/src/index.ts`, and
`workers/transit-ingest/.env.example`.

Created (16):

- `docs/GEOGRAPHIC_JOURNEY_PLANNING.md`, `docs/MILESTONE_4_REVIEW.md`.
- `packages/router/src/geographic-types.ts`, `geographic-validation.ts`,
  `geographic.ts`, `geographic.test.ts`.
- `workers/transit-ingest/src/nearby-stops.ts`, `nearby-stops.integration.test.ts`.
- `workers/transit-ingest/src/walking-provider.ts`, `walking-provider.test.ts`.
- `workers/transit-ingest/src/valhalla-walking.ts`, `valhalla-walking.test.ts`.
- `workers/transit-ingest/src/geographic-planner.ts`, `geographic-planner.test.ts`.
- `workers/transit-ingest/src/geographic-fixture.ts`, `journey-cli.ts`.

Deleted: none. No raw data or previously applied migration was edited.

## AD. Git status and hygiene

Seven tracked modifications and sixteen new files are unstaged. No commit, push,
merge or PR was made. Raw archives/data, real `.env`, node_modules and build output
remain ignored and untracked. No database storage or temporary benchmark/debug
file was added. Secret-pattern inspection found no keys/tokens/private keys; the
unchanged local-development credentials and synthetic error-test strings are not
private credentials. No actual provider credential was used.

The normal database still has **two publications and 1,925,348 stop-time rows**.
Activations remain September 14–20 and September 21–October 18, 2026, under their
original publication IDs. All fixture databases were removed. Compose services
were stopped with `down` without `--volumes`; subsequent inspection confirmed no
containers and preserved `dallas-transit_postgres-data`.

## AE. Diff statistics

23 changed files: 7 modified, 16 created, 0 deleted; **3,650 insertions and
25 deletions**, including new files and this review. Ordinary `git diff --stat`
reports only tracked changes (93 insertions / 25 deletions). Nothing is staged.

## AF. Known limitations/deferred work

- Production walking hosting/quotas/data freshness and attribution remain undecided.
  The successful demo sample is only development evidence.
- Nearest-N/radius pruning can miss better candidates outside the configured set.
- No walking-only journeys, geometry output, generated pedestrian transfers,
  verified platform access or wheelchair-routing guarantee.
- Legacy interchange durations remain distinct from measured walking totals.
- Time-independent walks and one explicit service date; no civil-time/DST conversion
  or adjacent-service-date stitching.
- No risk scoring, realtime, cache, new HTTP endpoints, UI or authentication.
- DART public-data-use terms remain the separate Milestone 0 deployment question.

## AG. Findings affecting Milestone 5+

API work should reuse prepared schedules outside individual requests, handle a
publication-change retry explicitly, propagate cancellation, choose public request
budgets/rate limits and determine adapter ownership before wiring persistence.
Provider latency dominated the one live sample; candidate SQL was small and did
not justify Redis or caching. Station-named stops and a successful street route
do not establish an exact boarding platform. Walking-transfer ranking needs
richer core labels if introduced later. No such Milestone 5 implementation began.

## AH. Human decisions needed

Review this change before any commit/push/merge. No ADR, workspace or substantial
dependency approval is needed for the implemented design. Before deployment,
choose an operated/authorized pedestrian service, review its terms and attribution,
and resolve station-policy and DART data-use questions. No account signup, paid
resource, large map download or outreach was performed.

## AI. Milestone acceptance criteria

| Criterion                                                                       | Status                                 |
| ------------------------------------------------------------------------------- | -------------------------------------- |
| Clean, current main verified and requested branch created                       | SATISFIED                              |
| Pure transit boundary and unchanged M3 algorithm                                | SATISFIED                              |
| Validated arbitrary coordinates and structured geographic journeys              | SATISFIED                              |
| Activated-publication PostGIS candidates, index, parameterization and bounds    | SATISFIED                              |
| Actual pedestrian-provider access/egress with catchability semantics            | SATISFIED                              |
| Established engine adapter; no custom walking algorithm/default demo dependency | SATISFIED                              |
| Initial boarding distinct from interchange allowance                            | SATISFIED                              |
| Walking-aware final ranking, alternatives and justified dominance               | SATISFIED                              |
| Explicit provider/search budgets, concurrency, validation and typed failures    | SATISFIED                              |
| Service-day/overnight behavior preserved                                        | SATISFIED                              |
| Deterministic geographic/provider tests and all M1–3 regressions                | SATISFIED                              |
| Real isolated PostGIS integration tests                                         | SATISFIED                              |
| Retained-DART candidate/transit and small real-provider validation              | SATISFIED                              |
| Performance observations distinguish SQL, provider and transit composition      | SATISFIED                              |
| Developer tooling and focused documentation/review                              | SATISFIED                              |
| All requested quality gates pass                                                | SATISFIED                              |
| Git/data/credential hygiene; stopped services and preserved volume              | SATISFIED                              |
| No commit/push/merge, accepted-ADR changes, or Milestone 5 work                 | SATISFIED                              |
| Production provider operations and public-travel readiness                      | NOT SATISFIED — outside this milestone |

The milestone exit condition is demonstrated with deterministic fixtures and one
real provider-composed DART journey, within the documented bounds and assumptions.

## AJ. Suggested commit message

`feat(journey): add bounded geographic transit planning with walking providers`

## AK. Suggested PR title and description

Title: **feat(journey): implement Milestone 4 geographic journey planning**

Description:

> Coordinates now produce schedule journeys by composing validated pedestrian
> access/egress with the existing independent transit router. Bounded PostGIS
> lookup pins candidates to the activated publication, and final ranking accounts
> for walking without merging away useful access/egress alternatives.
>
> Adds an injected walking-provider boundary, optional configured Valhalla adapter,
> typed failures, bounded concurrency/deadlines, and fixture/candidate/provider CLI
> modes. No external dependencies, workspace, schema change, transit-algorithm
> rewrite, API endpoint, UI, realtime or authentication are added.
>
> Validation: 208 offline tests (including 97 router and 83 geographic/provider),
> 46 PostGIS integration tests and all required quality gates pass. Two retained
> DART candidate scenarios use the existing GiST index. A two-call documented
> Valhalla demo observation produced a full West End–CityLine journey. See the
> Milestone 4 review for exact coordinates, timings, policy assumptions and the
> remaining production-provider/platform/data-use limitations.

## AL. Final recommendation

**READY WITH DOCUMENTED LIMITATIONS.** Implementation and required local validation
are complete. Human review remains the next step. No commit/push/merge or Milestone 5
work is authorized by this recommendation.

# Milestone 5 review package

Implemented and validated on 2026-09-20. Human review is pending. This is the
complete A–AR review; [JOURNEY_API.md](JOURNEY_API.md) is the maintained contract.

## A. Executive summary

The existing static geographic planner is exposed through a versioned Fastify API.
It reuses immutable prepared schedules, bounds expensive work, owns one PostgreSQL
pool, propagates cancellation and deadlines, and distinguishes ordinary no-journey
outcomes from operational failures. Date-scoped stop, route and nearby-stop reads
are included. Publication-scoped names/headsigns/timezones accompany journeys.

Final local validation passes: **272 offline tests**, including **72 API/lifecycle**,
**97 router**, **86 geographic/provider**, and separately **52 PostGIS integration
tests**. Counts overlap for targeted offline suites. Required install, format,
lint, types, build, Compose, startup/probes, deterministic API and retained-DART
checks passed. Synthetic-walking DART validation showed 2,374.72 ms for the first
West End request versus 232.80 ms with prepared-schedule reuse.

No commit, push, merge, deployment, realtime, authentication, Redis integration,
new workspace, accepted-ADR change or Milestone 6 implementation occurred.

## B. Branch and starting main commit

- Branch: `feat/journey-api`.
- Starting main: `dccab5ba1bd4200e1a35abe15b8dd8349fb0feb6`.
- Main was clean and matched freshly fetched `origin/main` before branching.
- HEAD/main/fetched origin/main remain at that commit; changes are unstaged.

## C. Architecture implemented

The API owns HTTP validation, stable serialization, error mapping, process admission,
request lifetime, schedule reuse, pool and shutdown. Read-only worker adapters
continue to load schedules and candidates, call injected walking providers and
compose geographic journeys. The router is entirely unchanged and independent
of HTTP, SQL, pg, providers, Redis, UI and deployment.

## D. Dependencies added

No new external package or version. The API declares the already pinned `pg`
**8.23.0**, development `@types/pg` **8.23.1**, and existing workspace links to
router, GTFS and transit-ingest. Node has no PostgreSQL driver; the existing driver's
pool supplies the missing capability. The lockfile adds only these API declarations;
there is no ORM, HTTP client, Swagger UI, security middleware or cache library.
No Redis use, migration or infrastructure service is introduced.

## E. Runtime ownership changes

A narrow `@dallas-transit/transit-ingest/runtime` export separates reusable read-only
runtime imports from ingestion/CLI entrypoints. Physical files stay in the existing
workspace, which is the smallest change resolving M4's ownership note. Runtime
imports do not execute archive/import/migration/activation-mutation code. The loader
now directly reuses GTFS date validation and accepts the query surface of a dedicated
pg client. `/testing` exposes original fixture helpers for API database tests only.
The optional cancellation parameter preserves existing CLI callers.

## F. API routes implemented

- `POST /v1/journeys`.
- `GET /v1/stops/:id`.
- `GET /v1/routes/:id`.
- `GET /v1/stops/nearby`.
- Existing `GET /health` and `GET /ready`, with meaningful new readiness semantics.

POST suits the structured planning query and keeps precise input coordinates out of
request URLs. The nearby read fulfills the roadmap without adding destination search.

## G. Journey request contract

Required numeric origin/destination latitude/longitude, real ISO `serviceDate`,
and integer service-day `departureTime`. Optional integer `maxTransfers` 0–3,
default 3, supports direct-service/fewer-transfer preferences. All other policy
is server-owned. Unknown/nested fields and query overrides are rejected without
coercion. Shared domain/GTFS validators check coordinate/date/time semantics before
schedule work. JSON body limit is 4 KiB; malformed JSON and media types have safe
structured errors. Provider URLs are never accepted from callers.

## H. Journey success response contract

HTTP 200 `status: ok`, publication/date/request context, `incomplete`, up to three
ranked journeys, and bounded publication-scoped `references` for stops/routes/trips.
Each journey retains origin/destination, access/egress stops, requested departure,
final arrival, total duration, walking duration/distance, boardings/transfers,
interchange duration and ordered machine-readable legs. Walks have phase/endpoints,
metrics/times; transit preserves exact trip/route/stops/sequences/occurrences/times;
legacy interchange legs remain separate. Names, nullable headsign/direction, route
colors/types and agency timezones are supplied without generating UI prose.

## I. Error/no-journey contract

Completed valid searches with no usable journey return HTTP **200**, `status:
no-journey`, reason and empty journeys. Reasons distinguish no nearby/reachable
access/egress and transit unreachability within the bounded model. Provider failures
that may hide a route never masquerade as proof of unreachability; useful partial
results retain `incomplete: true`.

Errors are `{ error: { code, message, retryable }, requestId }`. Invalid requests
are 400, oversized bodies 413, unsupported media 415. Missing activation, unconfigured
walking, provider outage, publication race, database failure, busy capacity and
shutdown have distinct 503 codes. Provider timeout and whole-request timeout are
distinct 504 codes. Unexpected faults are sanitized 500. Client cancellation is
recorded as `REQUEST_CANCELED`; no response is written to a disconnected socket.
The full status/code table is in the API contract. No raw errors escape to clients
or normal logs.

## J. Stop/route metadata endpoints

`serviceDate` is required. Each read selects activation and the record within one
repeatable-read transaction; responses declare publication/date. Optional UUID
`publicationId` is an equality guard, not a historical selector. Wrong publication
returns `PUBLICATION_CHANGED`, absent activation 503, proven absent record 404.
Raw IDs are never globally stable. Metadata and nearby reads do not build schedules.
Nearby returns at most eight candidates within 1,200 m and clearly labels geographic
pruning distance, never a pedestrian distance or connectivity claim.

## K. API versioning/time serialization

All product endpoints are `/v1`. Explicit Fastify response schemas select the
stable fields. Integers and finite fractional walking/final-arrival values remain
numbers; no rounding/modulo changes transit feasibility. **87300 means 24:15 on
the requested service date**, not the next day's 00:15 query. Null source metadata
remains null. Pattern IDs are diagnostic and scoped to the prepared publication/date
view. Internal metrics/provider fields/SQL provenance are not serialized.

## L. Prepared-schedule lifecycle

One process-local manager owns successful immutable schedules and in-flight builds.
Every lookup first checks date activation. Warm requests reuse the same frozen
schedule. A retained result never bypasses publication/date selection. No Redis or
journey-result cache is present. Tests cover hits, expiry, least-recently-used
retention, failure recovery, cancellation and closed-service behavior.

## M. Cache key/retention/invalidation

Key is `[sourceKey, publicationId, serviceDate, changeSeconds]`. Production source
is server-owned `dart`. Default retention is **two schedules**, configurable 1–4,
with five-minute TTL from successful load and least-recently-used eviction.
Expiration is lazy at next lookup; no orphanable eviction timer exists. A changed
or removed activation invalidates same-date retained entries. Failure is never
negative-cached. Entry count does not claim a byte-memory bound; active callers
and one build can temporarily hold evicted schedules.

## N. Concurrent-load single-flight behavior

Same-key callers share one build promise; cancellation belongs to each waiter.
One waiter cannot cancel a schedule still needed by another. The last departing
waiter aborts the shared load. Exactly one distinct schedule build runs per process;
other-key misses receive `SERVER_BUSY` instead of entering an unbounded queue.
Failed builds leave no permanent poisoned entry, and later requests can retry.
An aborted build still releasing resources returns `SERVER_BUSY` to new callers;
a controlled cleanup-race regression prevents inheriting another caller's abort.

## O. Publication-change handling

A loader identity mismatch or candidate snapshot mismatch invalidates the affected
entry and retries preparation/planning **once**. A second correction returns safe
503 `PUBLICATION_CHANGED`. This race is detected before walking-provider calls.
Deterministic controlled sources and actual PostGIS activation changes cover it.
A correction after candidate snapshot acquisition can complete using the coherent
old pinned publication, declared in the result; subsequent requests recheck
activation. References query that exact publication rather than reselecting by date.
No candidates/schedules from different publications are mixed.

## P. PostgreSQL pool lifecycle

One long-lived `pg.Pool`, default **4** connections (range 1–16), 2 s acquisition,
5 s statement/idle-transaction, and 30 s idle-connection limits. Adapters own entire
transactions on reserved clients. Walking does not hold database connections.
Failures/aborts destroy uncertain clients; normal success releases them. Canceled
acquisitions retain an admission slot until their eventual connection is destroyed
or times out. Outstanding pool uses are bounded to `poolSize + 16`. Idle errors are
observed and safely categorized. Integration tests verify active-query cancellation,
late acquisition cleanup, subsequent usability, and pool count zero after close.

## Q. Walking-provider lifecycle/configuration

The existing provider is injected once into the service. Normal startup constructs
the M4 Valhalla adapter only for explicit `WALKING_VALHALLA_URL`; otherwise journeys
return `WALKING_NOT_CONFIGURED` before database work. The existing HTTP(S) `/route`
validation rejects credentials, query, fragments and redirects. No demo/default
endpoint, account, credentials or public-provider test was used. Deterministic
validation providers are available only to tests/the explicitly named CLI modes.

## R. Request cancellation behavior

Disconnect after upload and abort during upload reach the request signal. Signals
reach candidate/database work, shared schedule waiters, queued/running walking and
reference reads. No queued provider calls start after abort. In-flight SQL clients
are destroyed; late acquisitions are cleaned up. No response is written to a closed
client. Real local HTTP-socket tests cover disconnect after upload; controlled
promises cover shared and queued work. Synchronous schedule construction and transit
composition cannot be interrupted mid-loop; elapsed deadline checks run before the
next phase/response. Custom providers must cooperate with their AbortSignal.

## S. Whole-request timeout behavior

Default **15,000 ms**, validated range 100–30,000 ms, server-controlled only. Starts
at `onRequest`, includes body receipt and all planning phases. Incomplete uploads
receive structured 504 with connection close. Independent 3,000 ms provider timeouts
remain distinguishable. Fake-clock tests cover both types, schedule-wait timeout,
slow upload and timer cleanup. Synchronous CPU work may delay timer delivery; this
is explicitly documented rather than claiming hard real-time preemption.

## T. Server-owned planning budgets

1,200 m radius; 4 access + 4 egress candidates; 8 provider calls; concurrency 2;
3 s provider deadline; 16 transit searches; 3 returned journeys; maximum 3 transfers.
Clients may only lower the transfer bound. These are separate from larger M4 safety
ceilings. Default 120 s subsequent-boarding allowance remains an explicit,
unverified DART station scenario; it is configurable 0–1,800 s and never delays
initial boarding. Candidate pruning limits completeness honestly.

## U. API concurrency/rate-limit decision

Default four active journeys (configurable 1–8), one distinct schedule build,
16 metadata/readiness reads, and bounded pool use. Capacity overload immediately
returns retryable 503; there is no fragile timer-based limiter or work queue.
Per-process gates bound retained async work, not replica-wide traffic or an SLA.
Public rate/connection limiting belongs at trusted deployment ingress, coordinated
across replicas. No simplistic IP limiter, distributed queue or Redis was added.
Application budgets remain mandatory even behind a future edge limiter.

## V. Health/readiness semantics

`/health` is lightweight process liveness. `/ready` checks actual connectivity,
required migration/schema/function/PostGIS and existence of a source activation,
without a full schedule build or provider request. Missing database/schema/activation
returns 503. Missing walking configuration disables only `capabilities.journeys`,
allowing metadata readiness to remain 200. `walkingConfigured` does not certify
remote provider availability. Activation capability does not claim today's coverage;
the requested date remains authoritative. A journey deployment must check its
capability flag in addition to global readiness.

## W. Startup/shutdown behavior

Configuration validates before serving. Startup probes shared resources once and
then listens; unavailable dependencies yield probe/capability failures rather than
preventing liveness diagnostics. SIGINT/SIGTERM close Fastify. `preClose` aborts
request work; `onClose` cancels/clears schedules and ends the pool. Construction
remains socket-free for injection. Actual local process startup returned health
200 and readiness 200 with `journeys: false`, as expected without a walking URL.
The process was stopped after checks; database inspection found zero API connections.

## X. Configuration/security/CORS decisions

`.env.example` contains only non-secret local defaults and a commented loopback
walking example. PostgreSQL URL is mandatory in production. Pool, cache, concurrency,
change allowance, timeout and port ranges are validated; invalid startup logging
never echoes their values. No real `.env`, tokens or credential-bearing provider
URL is tracked. Same-origin web/API deployment is explicit; no unrestricted CORS
headers/middleware were added. M6 may use a development same-origin proxy. Requests
cannot choose a provider URL, preventing arbitrary caller-directed fetches. Safe
JSON parsing, 4 KiB body limit, `nosniff`, no-store and no server banner form the
small baseline. Edge security/rate limits are documented for eventual deployment.

## Y. Observability/logging

Fastify structured logs use server-generated request IDs and route templates,
HTTP outcome, coarse duration, cache hit/miss/shared, schedule preparation/lookup,
candidate/provider/composition/reference timings and safe failure categories.
Partial provider failure is recorded. Built-in raw URL/error request logging is
disabled through the pinned LogController. Tests assert provider tokens and precise
coordinates are absent. No metrics stack, raw provider response, SQL, credential,
stack trace or filesystem logging was introduced.

## Z. API fixture/test design

Original three-stop networks exercise competing direct/transfer journeys, exact
legs, fractional walking and after-midnight values. Fastify injection covers the
real validation/serialization path. Controlled promises and fake deadline timers
make cancellation, overload, cache/single-flight and failure tests deterministic.
Real local sockets test body timeout/disconnect. M4's fixture queue gets explicit
cancellation tests. PostGIS uses synthetic GTFS in a uniquely named database; no
public network, DART download, live provider or credential is a test dependency.

## AA. Offline/unit/API test results

`pnpm test`: **PASS, 272 tests in 13 files**.
`pnpm test:api`: **PASS, 72 tests in three files**. Covers response fields, direct
and transfer alternatives, after-midnight/fractional values, malformed requests,
no journey, absent/unavailable/timed-out walking, publication outcomes, bounded
retry, cache lifecycle, cancellation, shutdown, metadata, health/readiness and
safe logging/errors. M1 health/readiness tests were updated for the intentionally
changed readiness contract; existing listener/configuration assertions remain.

## AB. Router/journey regression results

`pnpm test:router`: **PASS, 97 tests in four files**.
`pnpm test:journey`: **PASS, 86 tests in four files**, including three new request
cancellation tests. All earlier transit/geographic/provider cases remain, including
the independent exhaustive router comparison. No router source or test was changed.

## AC. PostGIS integration results

`pnpm test:integration`: **PASS, 52 tests in four files**: all 46 existing tests
plus six API scenarios. They cover missing schema/migrations/activation readiness,
real pooled schedule loading/reuse/calendar exceptions, stop/route/nearby reads,
activation correction/invalidation and deterministic correction between schedule
selection and candidates, active SQL cancellation, late-acquisition cleanup and
pool closure. Each suite removed its own random database. Final inspection found
zero test databases and zero API connections. Normal DART data was never mutated.

## AD. Real retained-DART API validation

Read-only date **2026-09-18**, publication
`0558fb28-946e-4ea4-99bf-9a835afc82b5`, version `V734-218-216-20260914`.
Both reproducible M4 scenarios use departure **28800**, default API budgets and
120 s change allowance. Walking is **SYNTHETIC ONLY**: every supplied candidate
walk is explicitly assigned 60 s / 100 m. This is not a street-route assertion.
No public Valhalla call was made.

| Scenario                 | Origin            | Destination       | HTTP / result   | Returned |
| ------------------------ | ----------------- | ----------------- | --------------- | -------: |
| West End → CityLine/Bush | 32.7812, -96.8056 | 33.0024, -96.7029 | 200 / ok, twice |   1 each |
| Rowlett → DFW Airport    | 32.9043, -96.5632 | 32.9076, -97.0392 | 200 / ok, twice |   1 each |

West End uses trip `9112386`, route `27253`, stops `22749`→`26895`, transit
29040→31380, final arrival **31440**, total **2640 s**, one boarding/zero transfers.
Rowlett uses `9113173`/`27251` (32562→22938, 29790→31350), then
`9112457`/`27253` (22938→32553, 31650→35640), final **35700**, total **6900 s**,
two boardings/one transfer. Both report synthetic walking totals **120 s / 200 m**.
These exact scheduled trips match earlier retained-data validation.

Validation startup/schema/probes took **296.60 ms**, returned health/readiness 200,
and did not build a schedule. The first journey was a cache miss; all subsequent
requests for that same date/publication were hits, including the second scenario.

## AE. First-request versus reuse measurements

Windows, Node 24.21.0, pnpm 12.4.2, existing local Docker/PostGIS, one process.
No load generation, forced cold database, controlled JIT/GC or SLA claim.

| Measurement (ms)                          | West End first | West End reused | Rowlett first | Rowlett reused |
| ----------------------------------------- | -------------: | --------------: | ------------: | -------------: |
| Cache                                     |           miss |             hit |           hit |            hit |
| Schedule preparation                      |        1881.48 |               0 |             0 |              0 |
| Schedule lookup/wait including activation |        1885.07 |            2.23 |          2.07 |           2.72 |
| Candidate SQL queries                     |          73.50 |            3.69 |          5.48 |           3.56 |
| Synthetic provider batch                  |           0.92 |            0.29 |          0.10 |           0.17 |
| Transit/geographic composition            |         321.44 |          212.88 |          3.49 |           3.65 |
| Publication reference reads               |           9.96 |            6.84 |         11.13 |          10.63 |
| Total injected request                    |    **2374.72** |      **232.80** |     **28.40** |      **28.09** |

Totals include validation, transaction/pool overhead, serialization and runtime
work not included in individual phase timers. Cache-hit overhead includes the
activation query, not just a Map read. Provider timings measure synthetic promises,
not network latency. Composition includes searches/reconstruction/ranking.
The lifecycle removed the repeated ~1.88 s schedule preparation as intended.

The offline fixture returned two journeys on both requests: total **70.02 / 1.61 ms**,
lookup **0.282 / 0.057 ms**, provider **0.472 / 0.118 ms**, composition
**0.949 / 0.142 ms**. Its schedule is constructed before injection, so recorded
preparation is zero. First-use schema/serializer/runtime overhead is material;
this tiny fixture is not a DART preparation benchmark.

DART process snapshots: RSS **58,466,304 → 295,350,272 bytes**, heap used
**12,663,520 → 135,054,296 bytes**. These include runtime/temporary objects and are
neither peak memory nor retained schedule size. No Redis optimization is justified.

## AF. Stop/route query behavior/performance

The retained API returned West End stop `22749` and ORANGE route `27253` with
HTTP 200, publication/date and expected names/metadata. End-to-end reads were
**8.57 / 8.11 ms**, including activation selection and transaction/serialization.
Parameterized `EXPLAIN ANALYZE` used `stops_pkey` for one stop, **0.056 ms** SQL
execution. Route SQL chose a sequential scan over the small **184-row** table
(two publications), joined via `agencies_pkey`, **0.066 ms** execution. No added
index or migration was supported by that evidence. Neither endpoint loads a schedule.

## AG. CI changes/results

Existing frozen install, format, lint, typecheck, offline tests, build, Compose
validation and isolated PostGIS integration gates are preserved. Integration
collection now includes API tests. CI explicitly runs `pnpm test:api` and
`pnpm api:validate --mode fixture` as well. There is no public-provider or DART
network test. **GitHub-hosted CI has not run**, because nothing was committed or
pushed; corresponding local commands passed.

| Required local gate                                                                           | Result                                   |
| --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | PASS                                     |
| `pnpm format:check`                                                                           | PASS                                     |
| `pnpm lint`                                                                                   | PASS                                     |
| `pnpm typecheck`                                                                              | PASS, eight workspaces                   |
| `pnpm test`                                                                                   | PASS, 272                                |
| `pnpm test:router`                                                                            | PASS, 97                                 |
| `pnpm test:journey`                                                                           | PASS, 86                                 |
| `pnpm test:api`                                                                               | PASS, 72                                 |
| `pnpm test:integration`                                                                       | PASS, 52                                 |
| `pnpm build`                                                                                  | PASS, including Next.js production build |
| `docker compose --project-directory infra/docker -f infra/docker/compose.yaml config --quiet` | PASS                                     |
| Actual API socket startup/health/readiness                                                    | PASS                                     |
| `pnpm api:validate --mode fixture`                                                            | PASS, synthetic walking                  |
| Compiled validation CLI `--mode retained-dart`                                                | PASS, read-only DART / synthetic walking |
| `git diff --check`                                                                            | PASS                                     |

Initial Vitest fake-clock tests and test declarations were corrected. Sandbox
restrictions required approved Git metadata access, registry install, Vitest/Next
child processes and Docker access. A final sandbox reinstall temporarily removed
tool links; approved frozen install restored them, then typecheck/full tests passed.
No failed final check is presented as successful.

## AH. Documentation/developer workflow

Added the focused API contract and this A–AR review; updated README, CONTRIBUTING,
DEVELOPMENT and the API's example environment. Root dev/test/typecheck scripts build
shared runtime dependencies first. New commands are `pnpm test:api` and
`pnpm api:validate --mode fixture|retained-dart`; API-local test delegates to the root
API test command. The contract includes infrastructure start/stop, migrations,
local server, deterministic tests, optional retained-data validation, configuration,
response/error/time semantics, lifecycle, deployment/CORS and known limitations.

## AI. Files created/modified/deleted

Modified (21):

- `.github/workflows/ci.yml`, `README.md`, `CONTRIBUTING.md`, `docs/DEVELOPMENT.md`.
- Root `package.json`, `pnpm-lock.yaml`, `vitest.integration.config.ts`.
- `apps/api/.env.example`, `apps/api/package.json`.
- `apps/api/src/app.ts`, `app.test.ts`, `config.ts`, `config.test.ts`, `server.ts`.
- `workers/transit-ingest/package.json`, `tsconfig.build.json`.
- `workers/transit-ingest/src/geographic-planner.ts`, `geographic-planner.test.ts`,
  `nearby-stops.ts`, `routing-schedule.ts`, `walking-provider.ts`.

Created (15):

- `docs/JOURNEY_API.md`, `docs/MILESTONE_5_REVIEW.md`.
- `apps/api/src/async.ts`, `contracts.ts`, `database.ts`, `errors.ts`, `repository.ts`,
  `schedules.ts`, `service.ts`.
- `apps/api/src/fixture.ts`, `test-support.ts`, `validate-cli.ts`,
  `schedules.test.ts`, `api.integration.test.ts`.
- `workers/transit-ingest/src/runtime.ts`.

Deleted repository files: none. No router/web source, ADR, applied migration or
raw feed was changed.

## AJ. Git status/hygiene

All implementation changes are unstaged on the requested feature branch. No commit,
push, merge or PR was made. Raw GTFS, real `.env`, node_modules, build output,
temporary validation output and Docker storage remain ignored/untracked. Temporary
Milestone 5 report output was removed after recording evidence. Inspection found
no private credential/key material; local example defaults and synthetic failure
strings are intentional, and no configured provider URL contains credentials.

Both original publications and activation ranges remain: September 14–20 and
September 21–October 18, 2026. Exact retained stop-time count is **1,925,348**
(976,139 recent; 949,209 latest). No test database or API pool connection remained.
Existing Compose services were stopped without `--volumes`, preserving the normal
PostgreSQL volume. No new permanent infrastructure service exists.

## AK. Diff statistics

**36 files: 21 modified, 15 created, zero deleted.** The final count is
**4,100 insertions and 116 deletions**, including this review and new files.
Ordinary `git diff --stat` omits untracked additions. Nothing is staged.

## AL. Known limitations/deferred work

- No authorized production walking service is selected. Synthetic validation makes
  no street-connectivity/accessibility claim; no public demo observation was repeated.
- Default station-change allowance is unverified; no generated pedestrian transfers,
  walking-only journeys, exact platforms, geometry or accessibility guarantee.
- One explicit service day; civil-time/DST conversion and adjacent-date stitching
  remain deferred. Per-visit headsign overrides are not yet exposed.
- CPU schedule construction/transit composition cannot be preempted; abort applies
  at async boundaries and elapsed deadline checks. Custom providers must cooperate.
- Process-local caches/admission do not replace edge rate limits, replica/pool sizing
  or a measured memory budget. Readiness checks capability, not current-day coverage
  or remote walking health.
- No public deployment, realtime, accounts, UI or distributed cache. DART data-use
  terms and operated pedestrian-service terms/attribution remain deployment gates.

## AM. Findings affecting Milestone 6+

M6 can consume concrete structured itineraries, publication-scoped display metadata,
explicit errors and partial-result flags. It must retain publication context, format
service-day/fractional values honestly, distinguish provider outages from no route,
and cancel superseded searches. A same-origin dev/deployment proxy matches the CORS
assumption. Map geometry, user-facing civil time, walking-only alternatives, verified
station policy and headsign fallback require separate work. Schedule reuse removes
repeated preparation cost; broad CPU/traffic profiling should precede more caching
or worker-thread architecture. No Milestone 6 code has been started.

## AN. Human decisions needed

Review the implementation and contracts before authorizing commit/push/merge.
No accepted-ADR, new-workspace, dependency-version or Redis approval is needed for
this implementation. Future deployment requires choosing an authorized operated
walking service, DART data-use clarification, station policy, ingress limits and
resource sizing. Those future decisions do not block this local API milestone.

## AO. Milestone acceptance criteria

| Criterion                                                                       | Status                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------ |
| Clean/current main verified; requested branch created                           | SATISFIED                                        |
| M1–M4 boundaries and unchanged pure routing algorithm                           | SATISFIED                                        |
| Canonical V1 geographic journey endpoint and documented HTTP method             | SATISFIED                                        |
| Input/JSON/query/body bounds before expensive work                              | SATISFIED                                        |
| Explicit useful stable structured journey/leg/reference contracts               | SATISFIED                                        |
| Normal no-journey separated from all required operational failure classes       | SATISFIED                                        |
| Publication/date-coherent stop, route and nearby read endpoints                 | SATISFIED                                        |
| Prepared-schedule reuse, bounded retention, single-flight and retry recovery    | SATISFIED                                        |
| Correction invalidation and at-most-once safe retry                             | SATISFIED                                        |
| Bounded PostgreSQL pool, transaction ownership and cleanup                      | SATISFIED                                        |
| Explicit walking configuration, no default demo or live CI dependency           | SATISFIED                                        |
| Request cancellation, queued-work suppression and honest CPU boundary           | SATISFIED                                        |
| Validated whole-request deadline distinct from provider deadline                | SATISFIED                                        |
| Server-owned planning budgets and process concurrency policy                    | SATISFIED                                        |
| Deployment-layer rate limit/CORS/security decisions documented                  | SATISFIED                                        |
| Meaningful liveness/readiness and graceful shared-resource cleanup              | SATISFIED                                        |
| Safe structured operational logging without precise coordinates/secrets         | SATISFIED                                        |
| Offline API fixtures and all M1–M4 regressions passing                          | SATISFIED                                        |
| Isolated real PostGIS API integration and retained-data hygiene                 | SATISFIED                                        |
| Retained-DART API validation with labeled synthetic walking                     | SATISFIED                                        |
| First-load versus reuse and metadata query measurements                         | SATISFIED                                        |
| Required quality gates, CI discovery and developer documentation                | SATISFIED                                        |
| No unnecessary migration/index, external package, workspace or service          | SATISFIED                                        |
| No commit/push/merge, ADR change, Milestone 6, realtime, accounts or deployment | SATISFIED                                        |
| Production public-travel readiness / authorized walking operations              | NOT SATISFIED – deliberately outside Milestone 5 |

The milestone exit condition, a client requesting and receiving concrete static
itineraries, is demonstrated through injection, actual socket lifecycle tests and
retained-DART schedules, within the explicit walking and station assumptions.

## AP. Suggested commit message

`feat(api): expose static journeys with pooled storage and prepared schedules`

## AQ. Suggested PR title and description

Title: **feat(api): implement Milestone 5 journey API and service lifecycle**

Description:

> Exposes `POST /v1/journeys` and date-scoped stop/route/nearby reads with stable JSON
> contracts and deliberate no-journey/operational-error semantics. The API reuses
> immutable schedules through a bounded publication/date cache with single-flight
> preparation and one correction retry, avoiding a full DART reload per request.
>
> Adds bounded pg pool ownership, request/provider deadlines, disconnect/shutdown
> cancellation, process admission, capability-aware readiness and safe structured
> logging. Reuses the existing worker's read-only runtime and unchanged router;
> no external package version, workspace, migration, Redis, UI or realtime is added.
>
> Validation: 272 offline tests (including 72 API, 97 router and 86 journey/provider),
> 52 PostGIS integration tests, all required local quality gates, actual startup
> and socket lifecycle checks. Read-only retained-DART validation returned concrete
> journeys using explicitly synthetic walks. First West End request took 2,375 ms,
> including 1,881 ms preparation; reuse took 233 ms. These are local observations,
> not an SLA. See JOURNEY_API and MILESTONE_5_REVIEW for contracts, exact evidence,
> operational boundaries and remaining production walking/platform/data-use work.

## AR. Final recommendation

**READY WITH DOCUMENTED LIMITATIONS.** Milestone 5 implementation and local
validation are complete. Human review is the next step. No commit/push/merge or
Milestone 6 work is authorized by this recommendation.

# Milestone 2 review package

Implementation and local validation: 2026-09-18. Human review is pending.

## A. Executive summary

Static GTFS ingestion is implemented and validated against synthetic fixtures and
both unmodified, previously downloaded DART publications. The database contains
1,925,348 stop-time rows across two isolated publications. Imports are repeatable,
transactional, streaming/batched, and separate from date-aware activation.

No routing, journey planning, realtime ingestion, transit UI, authentication, or
Milestone 3 implementation was added. Accepted ADRs are unchanged.

## B. Branch and starting commit

- Branch: `feat/static-gtfs-ingestion`.
- Starting `main`: `b0a639010f38862fe4f289049c05ab2751756fe7`.
- `main` was clean and matched a freshly fetched `origin/main` before branching.
- No commit, push, merge, or PR creation was performed.

## C. Architecture implemented

`packages/gtfs` owns typed GTFS records, field/time/date validation and streaming
CSV parsing. `workers/transit-ingest` owns ZIP handling, explicit SQL migrations,
PostgreSQL access, orchestration, activation, inspection, audit and CLI commands.
Domain/router/realtime/shared packages and both applications remain unchanged.
GTFS record types belong in the GTFS package; speculative routing-domain types
were deliberately avoided. See [the design](STATIC_GTFS.md).

## D. Exact dependencies added

| Dependency             | Version       | Purpose                                                         |
| ---------------------- | ------------- | --------------------------------------------------------------- |
| `csv-parse`            | 7.0.2         | Streaming, quoted CSV parsing absent from Node                  |
| `pg`                   | 8.23.0        | PostgreSQL protocol, parameterized SQL, transactions            |
| `yauzl`                | 3.4.0         | Lazy ZIP entries without extraction or whole-file decompression |
| `@types/pg`            | 8.23.1        | Development-only strict TypeScript declarations                 |
| `@types/yauzl`         | 3.4.0         | Development-only strict TypeScript declarations                 |
| `@dallas-transit/gtfs` | `workspace:*` | Worker consumes the GTFS package's public interface             |

Compatibility, MIT licensing, direct unpacked sizes, primary references and costs
are recorded in [DEVELOPMENT.md](DEVELOPMENT.md#dependency-choices). The lockfile
adds 18 external package entries including transitives, without updating existing
versions. No ORM, large framework, cloud infrastructure, COPY library, realtime
library or extra archive-writing dependency was added.

## E. GTFS files and fields

All DART columns documented by Milestone 0 are supported in `agency.txt`,
`routes.txt`, `stops.txt`, `trips.txt`, `stop_times.txt`, `calendar.txt`,
`calendar_dates.txt`, `shapes.txt`, `feed_info.txt`, `fare_attributes.txt`, and
`fare_rules.txt`. This includes names/colors/contact metadata, string identifiers,
route type, company ID, headsign/direction/block/shape references, boarding flags,
timepoints, distances, calendar flags and exceptions, fares, and publication dates.

Additional optional standard fields cover agency email, route sort order, stop
parent/location/platform/timezone/level, trip short name/accessibility/bikes, and
feed language/contact metadata. See the exact descriptors in
[`schema.ts`](../packages/gtfs/src/schema.ts).

`blocks.txt`, `facilities.txt`, `nodes.txt`, and `route_direction.txt` are validated
and retained as original string-valued supplemental records. `info.txt` is retained
as text. No supplemental vehicle, transfer, platform or walking semantics are
invented. Unknown columns are preserved in `extra`; unsupported files fail explicitly.

## F. Time representation

The helper returns hours, minutes, seconds and deterministic integer seconds from
service-day start. `24:15:00` = 87,300; `25:30:00` = 91,800; `26:06:00` = 93,960.
Times never wrap at 24 hours. SQL arrival/departure columns store integer seconds,
not wall-clock `time`. Malformed values and integer overflow fail. Untimed estimated
intermediate visits remain null; exact timepoints and endpoints require times.
Timezone is retained; timestamp/DST conversion belongs to later work.

## G. Calendar handling

Weekly flags, inclusive start/end dates, additions and removals are preserved.
The service table includes exception-only service IDs. Duplicate exception keys
fail. The inspection helper applies exceptions before the weekly calendar and
returns inactive outside available service. Tests cover normal weekdays, added
Saturday service, removed Friday service and a Sunday exception-only service.

## H. Database schema and indexes

The explicit migration creates `static_gtfs` tables for publications, attempts,
activation, agencies, routes, stops, services, calendars, calendar exceptions,
trips, stop times, shapes/points, publisher info, legacy fares/rules and supplements.
The checksummed migration ledger is separate in `public`.

Composite primary/foreign keys include publication UUIDs. Stop visits are keyed
by trip and sequence, preserving loops. Indexes cover agency/route/service/shape
relationships, ordered visits/points, stop departure lookup, date exceptions and
activation. Stop points have a GiST spatial index. Coordinates and distances use
exact `numeric` storage; derived SRID 4326 PostGIS geometries use double precision.
No user, realtime or routing-result tables exist.

## I. Feed version and activation strategy

Publication identity is `(logical source, SHA-256 of exact ZIP bytes)` with an
internal UUID. Publisher labels and raw IDs need not be stable. A changed ZIP
creates a separate publication; repeated identical bytes reuse the existing one.
Activation explicitly maps inclusive service dates to a complete publication.
Future dates can use a newer publication while current/prior service dates retain
the earlier one. No automatic newest-feed fallback exists.

## J. Transaction and failure behavior

Entity batches, derived data, checks and success audit commit atomically. Errors
roll back the entire publication and preserve activation. Advisory transaction
locking serializes imports, activation, migrations and reset. Failed attempts are
audited separately. A crash/lost connection can leave a `running` audit marker;
it cannot make an incomplete publication active. Preflight archive failures are
CLI errors without a database attempt. No retry changes source feed bytes.

## K. Parser and streaming strategy

A private local ZIP snapshot prevents source changes during parsing. SHA-256,
member names/sizes, lazy streams and CRC checks establish byte identity/integrity.
Strict UTF-8 and CSV parsing handle BOM, quoted newlines/commas and chunk boundaries.
Required columns/values, numeric fields, coordinates, enums, dates and times are
validated with file/record context. PostgreSQL checks relationships and chronology.

Default batches contain at most 2,000 records; no full stop-time array is built.
SQL values are parameters. File/record size limits are documented. Major tables
are analyzed before post-load validation; endpoint checks use an ordered window
scan. Shape-distance anomalies are reported and preserved, never silently repaired.

## L. Fixture design

The 16-file original synthetic fixture contains two agencies, bus/rail routes,
three stops/trips, interleaved/noncontiguous sequences, a repeated stop, shapes,
weekly calendars, additions/removals, exception-only service, overnight times,
dwell, pickup/drop-off restrictions, missing headsign/accessibility, fare blanks,
supplemental data and deliberate distance anomalies. It contains no copied DART
rows and needs no live feed or external network.

## M. Test results

| Required validation                    | Result                                                        |
| -------------------------------------- | ------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`       | PASS; final lockfile respected                                |
| `pnpm format:check`                    | PASS                                                          |
| `pnpm lint`                            | PASS                                                          |
| `pnpm typecheck`                       | PASS, all eight workspaces                                    |
| `pnpm test`                            | PASS, 62 tests in five files, including all Milestone 1 tests |
| `pnpm test:integration`                | PASS, 24 tests on real PostGIS                                |
| `pnpm build`                           | PASS, all workspaces and Next.js production output            |
| `docker compose ... config --quiet`    | PASS                                                          |
| Migration/import/activation/SQL sanity | PASS                                                          |
| `git diff --check`                     | PASS                                                          |

Integration tests cover geometry/precision, calendars, version churn, replacement,
idempotence, concurrent duplicate imports, missing references, duplicate visits,
bad times/chronology/endpoints, late rollback, explicit reset and migration checksums.
CI now starts Compose, runs the integration gate and stops services in `always()`.
The GitHub-hosted workflow itself has not run because nothing has been pushed.

Initial install/test/build attempts hit Windows sandbox network/child-process
restrictions and passed after approved execution outside the sandbox. An initial
lint issue and test typing issues were fixed. The full-feed performance issue
below was also fixed and revalidated; no failing final gate remains.

## N. Real DART results

Both ignored archives already existed; neither was downloaded again or modified.

| Property                    | Recent, effective September 18 | Latest, future on September 18 |
| --------------------------- | ------------------------------ | ------------------------------ |
| Publication                 | `V734-218-216-20260914`        | `V738-218-217-20260921`        |
| Coverage/activation         | September 14–20, 2026          | September 21–October 18, 2026  |
| Agencies                    | 1                              | 1                              |
| Routes                      | 92                             | 92                             |
| Stops                       | 6,978                          | 6,977                          |
| Services / calendar rows    | 12 / 12                        | 12 / 12                        |
| Calendar exceptions         | 0                              | 0                              |
| Trips                       | 21,062                         | 19,488                         |
| Stop times                  | 976,139                        | 949,209                        |
| Shapes / points             | 262 / 129,700                  | 256 / 128,419                  |
| Fare attributes / rules     | 26 / 26                        | 26 / 26                        |
| Publisher rows              | 1                              | 1                              |
| Blocks                      | 1,285                          | 1,183                          |
| Facilities                  | 76                             | 76                             |
| Nodes                       | 1,282                          | 1,283                          |
| Direction labels            | 177                            | 177                            |
| Supplemental text documents | 1                              | 1                              |
| Maximum service time        | `26:57:00`                     | `26:06:00`                     |
| Final result                | SUCCESS                        | SUCCESS                        |

Recent SHA-256: `799d22360a94f4ee683c238ab0f0f467922e29a1b45671f87d4895865a55c46f`.
Latest SHA-256: `9feefb82d05b3ff3f3df6d4a687595e072a536a6766aaa8229d29875a88b30de`.
Both match Milestone 0. Database UUIDs are respectively
`0558fb28-946e-4ea4-99bf-9a835afc82b5` and
`9f42f7e3-9992-44bc-a3e1-e8d411b613a3`.

Actual database counts matched stored import counts. Sanity queries found zero
orphaned stop-time references, zero invalid/null stop and shape geometries, and
85 shared route IDs, consistent with seven changed IDs in each publication.
Date selection returned 7,588 scheduled trips on September 18, 5,859 on September
20, and 7,575 on September 21; October 19 correctly had no activated service date.
The prior service-date data remains stored for overnight events.

## O. Duration and performance

- Recent publication: **54,644 ms** including snapshot/hash, parsing, inserts,
  derived geometry, validation and commit.
- Latest successful import: **54,117 ms** on a database already holding the recent
  publication. No full source data was modified or removed.
- Exact latest archive repeat: **38 ms**, `reused: true`, same UUID, no duplicate rows.
- These are local Windows/Docker observations, not a cross-platform benchmark.
  Peak memory was not instrumented; memory strategy is established by streaming
  and bounded batches, not a measured memory claim.

The initial second-publication endpoint-join validation remained active for over
five minutes. It was explicitly canceled, rolled back and audited as failed.
The fix replaced those joins with an ordered window scan and refreshed statistics
inside the import transaction. Retrying succeeded in the time above. The normal
database retains that one failed audit plus three successful attempts (two full
imports and one idempotent repeat), with exactly two complete publications.

## P. Docker/PostGIS validation

Real local services ran using the existing Compose definition. PostgreSQL **18.6**
and PostGIS **3.6.4** were verified; both services reached healthy status. The
integration suite used and removed its own random databases. Compose was stopped
after validation while preserving `dallas-transit_postgres-data` and both imported
publications. No normal development database reset or volume deletion was performed.

## Q. Developer import/reset workflow

```sh
pnpm install --frozen-lockfile
pnpm infra:up
pnpm gtfs migrate
pnpm gtfs import --archive data/raw/gtfs/dart-recent.zip --source-url https://www.dart.org/transitdata/recent/google_transit.zip
pnpm gtfs inspect
pnpm gtfs activate --feed <reported-uuid> --from <coverage-start> --through <coverage-end>
pnpm gtfs inspect --date <YYYY-MM-DD>
pnpm test:integration
pnpm infra:down
```

Optional `DATABASE_URL` / `TEST_DATABASE_URL` belong in the worker's ignored `.env`.
Defaults match local Compose. Destructive reset is separately named and requires
the explicit flag: `pnpm gtfs reset-static-data --confirm-delete-static-data`.
It is never automatic. See [DEVELOPMENT.md](DEVELOPMENT.md#static-gtfs-workflow).

## R. Documentation changes

README status, commands and import quick start; CONTRIBUTING integration-test and
migration workflow; DEVELOPMENT dependency rationale, environment, import,
activation, verification/reset and CI workflow; new STATIC_GTFS schema/import
design; this review package. DATA_FEASIBILITY and all accepted ADRs remain unchanged.

## S. Files created, modified and deleted

Modified (14): `.github/workflows/ci.yml`, `CONTRIBUTING.md`, `README.md`,
`docs/DEVELOPMENT.md`, `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`,
`packages/gtfs/{package.json,src/index.ts,tsconfig.json}`,
`workers/transit-ingest/{package.json,src/index.ts,tsconfig.json,tsconfig.build.json}`.

Created (36):

- `docs/{STATIC_GTFS.md,MILESTONE_2_REVIEW.md}`.
- `packages/gtfs/src/{fields.ts,parser.ts,parser.test.ts,schema.ts,time.ts,time.test.ts}`.
- `vitest.integration.config.ts`.
- `workers/transit-ingest/.env.example`.
- `workers/transit-ingest/migrations/001_static_gtfs.sql`.
- `workers/transit-ingest/src/{activation.ts,archive.ts,archive.test.ts,cli.ts,database.ts,importer.ts,importer.integration.test.ts,test-support.ts,validation.ts}`.
- `workers/transit-ingest/test/fixtures/tiny/{agency.txt,blocks.txt,calendar.txt,calendar_dates.txt,facilities.txt,fare_attributes.txt,fare_rules.txt,feed_info.txt,info.txt,nodes.txt,route_direction.txt,routes.txt,shapes.txt,stop_times.txt,stops.txt,trips.txt}`.

Deleted: none. Temporary local validation scripting was removed; original ignored
raw archives/extracted evidence remain unchanged.

## T. Git status and hygiene

The requested feature branch has 14 modified tracked files and 36 untracked new
files, all unstaged. HEAD, local main and fetched origin/main still point to the
starting commit. No commits/pushes/merges were performed.

Raw archives/data, real `.env` files, node_modules, build output, temporary scripts
and database volumes are not tracked. Only example `.env.example` files contain
the public local-development database defaults. Secret-pattern inspection found
no private-key/token candidates. Accepted decisions and out-of-scope packages/apps
have no diff. The normal Docker volume lives outside the repository.

## U. Diff statistics

50 files total: 14 modified, 36 created, zero deleted. **3,371 insertions and
50 deletions**, counting new untracked files as complete additions. The tracked
diff alone is 384 insertions / 50 deletions; nothing is staged.

## V. Known limitations and deferred work

This is the documented DART scheduled-feed subset, not a complete canonical GTFS
validator. Newly supplied transfers, pathways, frequencies, Flex, Fares v2 or other
unknown files fail explicitly until supported. Coordinate-less location records
and extended route types need future support. Unknown columns are preserved,
not interpreted. Supplemental relationships/semantics remain unverified.

No automatic downloads/polling, timestamp/DST conversion, interpolation, transfer
generation, routing patterns/overtaking analysis, headsign fallback, fare engine,
platform reconstruction or accessibility guarantee is provided. Shape diagnostics
do not establish surveyed geographic accuracy or safe walking paths. Imports
serialize and use batched inserts; COPY is deferred unless profiling justifies it.
Crash recovery may require interpreting a stale `running` attempt marker. Existing
Milestone 0 realtime-access and public-deployment data-use questions remain open.

## W. Findings relative to DATA_FEASIBILITY

No contradiction was found. Latest diagnostics reproduce 39 missing headsigns,
4,054 unknown-accessibility stops, 38,238 after-midnight rows, 1,578 restricted
visits, 1,072 trips revisiting stops, 945 distances past shape endpoints, 108 equal
adjacent stop distances and zero decreasing shape-point distances.

Recent results reproduce 39 missing headsigns, 4,055 unknown-accessibility stops,
39,470 after-midnight rows, 2,435 restricted visits and 1,087 endpoint-distance
excesses. Additional measured recent counts are 1,072 repeated-stop trips and 108
equal adjacent stop distances. The new operational finding is the need to refresh
query statistics and avoid expensive endpoint joins when loading adjacent full
publications. This extends implementation knowledge, not DART data semantics.

## X. Human decisions needed

Review the implementation and its documented subset/activation policy before
authorizing a commit or PR. No ADR change or additional architectural approval is
needed. Public deployment and realtime access remain separate future decisions;
they do not block the completed local static-ingestion milestone.

## Y. Acceptance criteria

| Criterion                                                          | Result    |
| ------------------------------------------------------------------ | --------- |
| GTFS parsers and normalized types                                  | SATISFIED |
| PostgreSQL/PostGIS schema and explicit migrations                  | SATISFIED |
| Required DART files, metadata and useful supplements preserved     | SATISFIED |
| After-midnight times and malformed-value validation                | SATISFIED |
| Weekly calendars plus added/removed exceptions                     | SATISFIED |
| Version-scoped identity and repeatable refresh                     | SATISFIED |
| Date-aware activation and adjacent-version retention               | SATISFIED |
| Transactional failure isolation                                    | SATISFIED |
| Streaming/batched million-row ingestion                            | SATISFIED |
| Deterministic fixtures and actual database integration tests       | SATISFIED |
| Current DART schedule queryable from Postgres                      | SATISFIED |
| Required install/format/lint/types/tests/build/Compose/diff checks | SATISFIED |
| Developer commands, documentation and CI integration               | SATISFIED |
| Raw-data/secret/build Git hygiene                                  | SATISFIED |
| Services stopped and normal development volume preserved           | SATISFIED |
| Accepted ADRs and Milestone 3 boundary preserved                   | SATISFIED |
| Stop before commit/push/merge                                      | SATISFIED |

## Z. Suggested commit message

`feat(gtfs): add versioned static ingestion with PostGIS validation`

## AA. Suggested PR title and description

Title: **feat(gtfs): implement Milestone 2 static DART ingestion**

Description:

> Adds repeatable static GTFS imports with streaming validation, explicit PostGIS
> migrations and publication-scoped identifiers. Imports stage atomically; explicit
> service-date activation keeps today's and future DART publications separate and
> retains prior-day overnight service.
>
> Preserves calendars/exceptions, after-midnight times, repeated stop visits,
> boarding restrictions, source precision and documented DART gaps/anomalies.
> Includes an import/inspection/reset CLI, synthetic fixture coverage and PostGIS
> integration in CI. Routing, realtime, UI and accepted ADRs are unchanged.
>
> Validation: 62 unit tests and 24 PostGIS integration tests; frozen install,
> formatting, lint, typecheck, production build, Compose and diff checks passed.
> Both unmodified DART publications imported successfully (976,139 and 949,209
> stop-time rows, approximately 55 seconds each). See the Milestone 2 review and
> static GTFS design for performance findings and documented limits.

## AB. Final recommendation

**READY WITH DOCUMENTED LIMITATIONS.** Milestone 2 is ready for human review.
No commit/push/merge or Milestone 3 work is authorized by this recommendation.

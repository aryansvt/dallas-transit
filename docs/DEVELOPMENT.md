# Development foundation

Milestone 1 supplies the development foundation; Milestone 2 adds static GTFS
ingestion; Milestone 3 adds the schedule router and its database adaptation tests;
Milestone 4 adds geographic composition and pedestrian-provider adapters.
All accepted ADRs remain unchanged.
Use the [README](../README.md) for setup and root commands.

## Packages and compilation

All eight workspaces are private packages under `@dallas-transit/*`.
`pnpm -r build` uses pnpm's dependency ordering; no additional orchestrator is needed.
Each workspace supports `build` and `typecheck` independently through `pnpm --filter`.
The API also supports independent tests; root Vitest discovery covers every workspace.

`tsconfig.base.json` enables strict checking, checked indexed access, and exact
optional properties. Node packages use native ESM/NodeNext with explicit `.js`
relative imports and compile into `dist/`; the web app uses Next.js's bundler
resolution. Package exports expose only their public `dist/index` entrypoint.
No TypeScript path aliases bypass package boundaries.

The ingestion worker depends on `@dallas-transit/gtfs` and `@dallas-transit/router`
through `workspace:*` and their public package exports. Root test/typecheck/CLI
commands build those dependencies first. For package-local worker typecheck on a
clean checkout, first run `pnpm --filter @dallas-transit/gtfs --filter @dallas-transit/router build`.
No path alias bypasses those boundaries. GTFS record types remain in `packages/gtfs`;
router-owned schedule and result types live in `packages/router`. Domain/shared/realtime
remain placeholders. The router has no production dependencies, including HTTP,
React, SQL, or Redis. The worker reuses `pg` for the read-only routing adapter;
Milestones 3 and 4 add no external dependencies. Geographic composition and value
types stay in the router; asynchronous candidate/provider orchestration stays in
the worker alongside local validation tooling. The Valhalla adapter uses Node fetch.

API construction is separate from socket startup, allowing Fastify injection tests
without a port or backing services. Node loads the API's optional `.env` itself;
tsx is used only for development TypeScript execution. Startup validates the port
and handles SIGINT/SIGTERM with Fastify shutdown. `/ready` must grow dependency
checks when storage connections become required; it currently means app readiness.

## Dependency choices

Direct dependencies are exact-pinned, with transitive versions in `pnpm-lock.yaml`.
Versions below were checked against npm on 2026-09-18.

| Dependency                                    | Version                   | Reason and cost                                                                                                                 |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Next.js                                       | 16.3.5                    | Accepted web framework; provides app routing, compilation, and metadata. Main web build/server cost; no separate bundler added. |
| React / React DOM                             | 19.3.0                    | Required Next.js rendering/runtime peers; confined to web.                                                                      |
| Fastify                                       | 5.12.5                    | Accepted HTTP framework; provides lifecycle, logging, and test injection beyond Node's raw HTTP API. Confined to API.           |
| Tailwind / Tailwind PostCSS                   | 4.3.3                     | Accepted styling stack; build-time tools emitting CSS.                                                                          |
| TypeScript                                    | 6.0.3                     | Strict checks and Node compilation; latest compatible major for the lint parser.                                                |
| ESLint / @eslint/js                           | 9.39.5                    | Compatible with Next.js's React lint plugin; lint configuration stays small.                                                    |
| typescript-eslint                             | 8.70.0                    | TypeScript parsing and recommended rules, including prohibition of explicit `any`.                                              |
| eslint-config-next                            | 16.3.5                    | Framework, React, and accessibility lint rules for web.                                                                         |
| Prettier / eslint-config-prettier             | 3.9.7 / 10.1.8            | Formatting with conflicting lint rules disabled; avoids a package-age exception for the newest patch.                           |
| Vitest                                        | 5.0.1                     | TypeScript behavior tests without browser infrastructure.                                                                       |
| tsx                                           | 4.23.13                   | Development-only TypeScript execution for the API watcher.                                                                      |
| @types/node / @types/react / @types/react-dom | 24.13.5 / 19.3.0 / 19.3.0 | Types matched to the selected runtime/framework.                                                                                |

The original four production dependencies (Next.js, React, React DOM, Fastify) are MIT
licensed, have current stable releases, and are the maintained projects selected
by the accepted stack. Standard Node/DOM APIs do not supply their framework
behavior. Build/test tooling is development-only. pnpm explicitly permits native
install scripts required by esbuild, Tailwind's oxide, Next.js's sharp dependency,
and the unrs resolver used by Next.js linting.

Milestone 2 adds these exact-pinned MIT-licensed dependencies, checked against npm
on 2026-09-18 and validated on the pinned Node 24 runtime:

| Dependency                  | Version        | Reason / cost                                                                                                                                                                                                        |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `csv-parse`                 | 7.0.2          | Quoted CSV, chunk boundaries, BOM and streaming backpressure; Node has no CSV parser. About 1.61 MB unpacked, no runtime dependencies. Confined to GTFS.                                                             |
| `pg`                        | 8.23.0         | Parameterized SQL, transactions and PostgreSQL protocol; Node has no PostgreSQL client. About 100 KB direct unpacked package plus small protocol helpers; supports Node >=16. Worker only; no ORM.                   |
| `yauzl`                     | 3.4.0          | Lazy ZIP entry streams and size/path validation without extracting archives; Node's zlib is compression, not a ZIP reader. About 110 KB direct unpacked package plus small helpers; supports Node >=12. Worker only. |
| `@types/pg`, `@types/yauzl` | 8.23.1 / 3.4.0 | Development-only declarations for strict TypeScript.                                                                                                                                                                 |

These are current maintained stable releases, not large frameworks. Primary
references: [node-postgres queries](https://node-postgres.com/features/queries),
[CSV async iteration](https://csv.js.org/parse/api/async_iterator/), and
[yauzl documentation](https://github.com/thejoshwolfe/yauzl). Node's crypto, zlib,
UTF-8 decoder, filesystem, argument parser and environment-file loading cover the
remaining needs. No ORM, COPY client, archive writer, dotenv, or realtime library
is introduced. The synthetic ZIP writer is test-only.

npm marks ESLint 9 as deprecated. It is pinned because the current React plugin in
Next.js's recommended lint configuration declares support through ESLint 9, not 10.
Upgrade ESLint when that dependency supports 10; no peer checks are suppressed.

Node is pinned to 24.21.0 LTS and pnpm to 12.4.2. The tested local tools were npm
11.19.0 (metadata lookup only), Git 2.55.0.windows.5, Docker 29.7.2, and Compose
5.5.1. No machine-wide tool installation is part of setup or project scripts.

## Local infrastructure and configuration

Compose lives at `infra/docker/compose.yaml`. Root scripts explicitly use that
project directory, so optional `infra/docker/.env` overrides are loaded consistently.
The Compose project is named `dallas-transit`. Only these local services are created:

- `postgis/postgis:18-3.6`: PostgreSQL 18 and PostGIS 3.6, with named volume
  `dallas-transit_postgres-data` mounted at PostgreSQL 18's `/var/lib/postgresql`.
  The upstream image enables PostGIS; `pnpm gtfs migrate` creates the static schema.
- `redis:8.10.1-alpine`: Redis with disk snapshots/AOF disabled and `/data` on tmpfs.
  Cache contents disappear when the container stops. This follows ADR 0004.

Both services have health checks and loopback-only published ports. `infra:up`
waits up to 120 seconds for healthy containers after startup. The PostGIS tag pins
the supported major/minor family and may receive upstream patch refreshes; Redis
pins a patch tag. No `latest` tags are used.

| Variable                        | Default                                                    | Consumer                                     |
| ------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| `POSTGRES_DB`                   | `dallas_transit`                                           | Compose / initial database creation          |
| `POSTGRES_USER`                 | `dallas_dev`                                               | Compose / initial database creation          |
| `POSTGRES_PASSWORD`             | `local_only_password`                                      | Compose / local-only credential              |
| `POSTGRES_PORT`                 | `5432`                                                     | Compose host port                            |
| `REDIS_PORT`                    | `6379`                                                     | Compose host port                            |
| `HOST`                          | `127.0.0.1`                                                | API listener                                 |
| `PORT`                          | `3001`                                                     | API listener                                 |
| `DATABASE_URL`                  | Local Compose URL in `workers/transit-ingest/.env.example` | Static ingestion CLI                         |
| `TEST_DATABASE_URL`             | Same local Compose URL                                     | Integration-test server; requires `CREATEDB` |
| API `DATABASE_URL`, `REDIS_URL` | Examples in `apps/api/.env.example`                        | Still reserved by the API                    |

Changing PostgreSQL initialization variables does not change credentials inside an
existing volume. Keep the API URL examples aligned if you customize infrastructure.
`infra:down` preserves PostgreSQL data; do not add `--volumes` unless you intend to
delete it. Docker stores the volume outside the repository.

PostGIS currently publishes amd64 images only. Compose requests that platform;
ARM contributors need emulation, which may be slower and was not tested here.
If a port is occupied, use the example environment overrides. For a different web
port, run `pnpm --filter @dallas-transit/web dev --port 3100`.

No real `.env`, generated output, raw transit data, or local database files belong
in Git. Examples contain only public development defaults. No DART access is needed
to install, test, or build this foundation.

## Static GTFS workflow

Run all commands below from the repository root. The local defaults need no `.env`.
For a custom database, copy `workers/transit-ingest/.env.example` beside it as
`.env` and set `DATABASE_URL`; set `TEST_DATABASE_URL` separately for tests. The
CLI and integration script load this optional file with Node; existing process
environment values take precedence. No realtime API credentials are needed.

```sh
pnpm install --frozen-lockfile
pnpm infra:up
pnpm gtfs migrate
pnpm gtfs import --archive data/raw/gtfs/dart-recent.zip --source-url https://www.dart.org/transitdata/recent/google_transit.zip
pnpm gtfs inspect --source dart
```

The archive must already exist locally. Official sources and outstanding data-use
terms are recorded in [DATA_FEASIBILITY.md](DATA_FEASIBILITY.md). Keep all downloaded
feeds under ignored `data/raw/`. The URL records provenance; the importer never
fetches it. `--source dart` is the default logical source. JSON output reports the
publication UUID/hash, counts, diagnostics, elapsed milliseconds and whether the
exact archive was already imported; progress goes to stderr. A failure exits
nonzero and rolls back entity changes. See `static_gtfs.import_attempts` for its
database audit and [STATIC_GTFS.md](STATIC_GTFS.md) for crash/connection-loss cases.

Use the reported UUID and inclusive coverage dates to activate deliberately:

```sh
pnpm gtfs activate --feed <feed-uuid> --from 2026-09-14 --through 2026-09-20
pnpm gtfs inspect --source dart --date 2026-09-18
```

Replace angle-bracket placeholders; the dates above describe the retained Milestone
0 recent publication, not a permanently current schedule. `inspect --date` reports
the selected publication and that date's scheduled trip count, or `selection: null`
when no publication is assigned. It never extrapolates beyond activation/coverage.
Import/activate a newer publication for its effective dates; retain the earlier
version for overnight service. Same-date corrections can replace just a specified
subrange. Repeat the same import safely: exact source/hash matches return the
existing publication without duplicating entities. Never join raw IDs across feeds.

For SQL inspection (default Compose user/database):

```sh
docker compose --project-directory infra/docker -f infra/docker/compose.yaml exec postgres psql -U dallas_dev -d dallas_transit
```

```sql
SELECT feed_id, feed_version, coverage_start, coverage_end, row_counts
FROM static_gtfs.feed_versions;
SELECT source_key, service_date, feed_id FROM static_gtfs.feed_activation
ORDER BY source_key, service_date;
SELECT attempt_id, status, error FROM static_gtfs.import_attempts
ORDER BY started_at DESC;
```

Validate the importer without internet or DART data:

```sh
pnpm test
pnpm test:integration
```

The integration suite creates/drops only its own random database and fails if
PostGIS or the connection is unavailable. Normal development data is preserved.
Its role needs permission to create databases/extensions; use the local Compose
server, not production. CI starts Compose and runs this same suite, then stops
services in an `always()` step.

To deliberately delete **all static publications, activations, and import audits**
from the configured database while retaining schema/migrations:

```sh
pnpm gtfs reset-static-data --confirm-delete-static-data
```

This command is never run automatically. To stop services while retaining the
normal PostgreSQL development volume:

```sh
pnpm infra:down
```

## Schedule routing validation

`pnpm test:router` runs the deterministic core fixtures without any services.
`pnpm test:integration` also covers date-selected SQL adaptation using an isolated
fixture database. Both are covered by the existing CI commands.

For local DART integration evidence, start infrastructure and run:

```sh
pnpm routing:validate --date 2026-09-18 --change-seconds 120 --runs 5 --query '22749,26895,08:00:00' --query '32562,32553,08:00:00'
```

This requires Milestone 2's retained recent publication activated on that service
date. The CLI only reads the database, loads one schedule, and reports build/query
timings, counts, memory snapshots and exact journey legs. Quote comma-delimited
queries in PowerShell. `--change-seconds` is required: 120 here is a validation
assumption, not verified station walking time. Stop infrastructure afterward with
`pnpm infra:down`, preserving its volume. See [ROUTING_CORE.md](ROUTING_CORE.md) for
overnight examples, input/algorithm semantics and the Milestone 4 boundary.

## Geographic journey validation

```sh
pnpm test:journey
pnpm journey:validate --mode fixture --origin '32,-96' --destination '32.01,-96' --date 2026-09-18 --departure 08:00:00 --runs 100
pnpm infra:up
pnpm test:integration
pnpm journey:validate --mode candidates --origin '32.7812,-96.8056' --destination '33.0024,-96.7029' --date 2026-09-18 --departure 08:00:00 --change-seconds 120 --runs 5 --explain
pnpm infra:down
```

Fixture mode is synthetic and offline. Candidate mode reads retained DART data and
reports geographic candidates and separate stop-to-stop journeys, with no walking
claims. Real-provider mode requires an explicit Valhalla `/route` URL through
`--valhalla-url` or `WALKING_VALHALLA_URL`, plus the database inputs above. Missing
configuration returns an explicit nonzero unavailable result, never a fake route.
No provider URL is enabled by default. `--mode provider` uses one run without a
warm-up or retries; configure small counts/concurrency for the selected service.
The public demo was used only for one two-call development observation, not as
production infrastructure. See [the design](GEOGRAPHIC_JOURNEY_PLANNING.md) and
[review](MILESTONE_4_REVIEW.md) for contracts, bounds, exact evidence and limitations.

## Deferred work

The web app includes basic metadata and a web manifest as PWA preparation only.
Icons, service workers, offline behavior, and installability validation belong in
the PWA milestone. Playwright is deferred until meaningful UI journeys exist.
MapLibre, TanStack Query, API journeys, realtime, and deployments
are deferred to their own milestones. Static ingestion remains separate from the
schedule-routing algorithm.

GitHub Actions runs frozen install, formatting, lint, types, tests, build, and
Compose configuration validation, and PostGIS fixture integration tests on PRs
and pushes to `main`. Tests need no DART data or network access after dependencies
and Docker images are installed.

# LineFinder

A mobile-first, independent Dallas/DART transit navigator focused on answering:

**“I want to go there. Tell me exactly how.”**

The project aims to provide concrete bus/rail journey planning, transfers, live vehicle and delay context where legitimately available, and practical replanning when a connection becomes unreliable.

## Status

Schedule-based DART trip planning is deployed at
[LineFinder](https://linefinder-dart.vercel.app). It uses our TypeScript RAPTOR-style
router, DART static schedules, Geoapify endpoint walking, and Mapbox search/maps.
DART realtime is **disabled**; realtime infrastructure is experimental and does
not establish access to a permitted live feed.

M9C improves candidate coverage, validated pedestrian interchanges, walking totals,
scheduled transfer-risk ordering and alternatives. These changes are local pending
review and deployment. See [M9C evidence and limitations](docs/MILESTONE_9C_REVIEW.md)
and the [deployment runbook](docs/DEPLOYMENT.md).

Known limits: an inter-stop walking connection needs validated publication-scoped
evidence; proximity alone never creates one. Search uses bounded candidates and
walking budgets. Direct walking-only planning and automatic adjacent-service-day
search are not implemented. For after-midnight trips, use the previous service-day
option where appropriate. Maps show places/stops, not route polylines. Scheduled
connections are not live predictions; check DART service notices before travel.

LineFinder is independent and is not affiliated with or endorsed by DART.
Static-feed use/redistribution, provider-derived walking retention, hosting
retention/backups and operating budgets remain owner checks. Repository licensing
is Apache-2.0; it does not grant rights to third-party datasets. The working name
is not a trademark conclusion. `/preview` remains a local review environment.

## Core technical goals

- implement a RAPTOR-style transit routing engine
- ingest GTFS Schedule
- integrate GTFS-Realtime where independent-developer access is confirmed
- use PostgreSQL/PostGIS for persistent/spatial data
- use Redis for short-lived realtime state
- expose a Fastify API
- build a mobile-first Next.js PWA
- render trips with MapLibre
- compare selected routing behavior with OpenTripPlanner during development
- maintain deterministic routing tests

## Product scope

Dallas/DART.

The user-facing product is intentionally Dallas-focused.

Core transit/routing code should still avoid unnecessary agency hard-coding.

## Route preference

1. earliest arrival
2. fewer transfers
3. less walking
4. lower transfer risk

## Documentation

See the setup instructions below and [development notes](docs/DEVELOPMENT.md).

Start with:

- `START_HERE.md`
- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/TECH_STACK.md`

## Contributing

See `CONTRIBUTING.md`.

## Prerequisites

- Node.js **24.21.0 LTS**, pinned in `.node-version` (project supports 24.x).
- pnpm **12.4.2**, pinned in `package.json`. Install this version using your preferred
  package-manager setup before continuing; `npm install` is not the project workflow.
- Git and Docker Engine/Desktop with Linux containers and Docker Compose **v2.20+**
  (Compose v5 also works). Start Docker before running infrastructure commands.
- Free local ports **3000**, **3001**, **5432**, and **6379**.

PostGIS's upstream image is amd64-only; ARM machines require Docker's amd64
emulation. See [development notes](docs/DEVELOPMENT.md) for limitations and versions.

## Quick start

```sh
git clone https://github.com/aryansvt/dallas-transit.git
cd dallas-transit
pnpm install --frozen-lockfile
pnpm infra:up
pnpm dev
```

Open <http://localhost:3000>. API probes are
<http://127.0.0.1:3001/health> and <http://127.0.0.1:3001/ready>.
`/health` reports process liveness. `/ready` checks PostgreSQL/schema/activation
and separately reports journey capability; an empty database needs migrations and
an activated publication. `pnpm dev` builds shared runtime modules and starts both
apps with watch/reload support. Use Ctrl+C to stop. The API does not use Redis.

No environment file is required for the default local setup. Optional examples:

- [`infra/docker/.env.example`](infra/docker/.env.example): copy beside it as `.env`
  to override database credentials and infrastructure ports.
- [`apps/api/.env.example`](apps/api/.env.example): copy beside it as `.env` to
  override listener, pool, schedule retention, deadline and walking configuration.
  No walking endpoint is enabled by default.
- [`workers/transit-ingest/.env.example`](workers/transit-ingest/.env.example):
  optional database URLs for the importer and isolated integration tests.

Defaults are **local development only**, not production credentials. Infrastructure
ports bind to `127.0.0.1`; Redis has no password in this local setup. The web app
calls the API through its same-origin `/api/v1` proxy. No CORS override is needed.
See [`apps/web/.env.example`](apps/web/.env.example) for optional API origin and
approved map-style configuration. No public map style is enabled by default.

For M6 visual review without infrastructure or external providers:

```sh
pnpm install --frozen-lockfile
pnpm dev:preview
```

Open <http://127.0.0.1:3000/preview>. Use **Review state** and **Viewport** to inspect
home, search, alternatives, direct/transfer/overnight detail and failure states at
320/390/768 px or desktop width. Preview is development-only, uses synthetic
journeys, requests no location permission and never writes saved places to storage.
The source-free map has interactive points, not streets or route geometry. Use
<http://127.0.0.1:3000/> for normal local mode, which requests location once after
mount and falls back to manual origin. Geolocation needs HTTPS or localhost.

## Commands

Run these from the repository root:

| Command                            | Purpose                                                              |
| ---------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                         | Start web and API in development                                     |
| `pnpm build`                       | Build every application/package/worker                               |
| `pnpm lint`                        | ESLint across TypeScript and configuration files                     |
| `pnpm typecheck`                   | Check all eight workspaces, including generated Next.js types        |
| `pnpm test`                        | Run Vitest tests across apps, packages, and workers                  |
| `pnpm test:integration`            | Test static ingestion against local PostGIS in an isolated database  |
| `pnpm test:router`                 | Run deterministic routing fixtures and exhaustive checks             |
| `pnpm test:journey`                | Run offline geographic and pedestrian-provider tests                 |
| `pnpm test:api`                    | Run offline API and schedule-lifecycle tests                         |
| `pnpm test:web`                    | Run offline frontend DOM, time, client and state tests               |
| `pnpm dev:preview`                 | Start web-only development; open `/preview`                          |
| `pnpm api:validate --mode fixture` | Validate deterministic journeys through the actual API contract      |
| `pnpm journey:validate --help`     | Show fixture, SQL candidate and configured-provider validation modes |
| `pnpm routing:validate --help`     | Show read-only database-to-router validation commands                |
| `pnpm gtfs --help`                 | Show migration/import/activation/inspection/reset commands           |
| `pnpm format`                      | Apply Prettier formatting                                            |
| `pnpm format:check`                | Check formatting without changing files                              |
| `pnpm infra:config`                | Validate Docker Compose configuration                                |
| `pnpm infra:up`                    | Start PostGIS and Redis and wait for healthy status                  |
| `pnpm infra:status`                | Show local service status                                            |
| `pnpm infra:down`                  | Stop/remove local containers; retain PostgreSQL data                 |

Run the same quality gates as CI:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm infra:config
pnpm infra:up
pnpm test:integration
pnpm infra:down
```

After building, run production scaffolds in separate terminals with
`pnpm --filter @dallas-transit/web start` and
`pnpm --filter @dallas-transit/api start`. Stop with Ctrl+C, then run
`pnpm infra:down` when finished with the backing services.

## Import a static schedule

Use a locally obtained official GTFS ZIP under the Git-ignored `data/raw/gtfs/`.
The importer does not download feeds or require realtime credentials.

```sh
pnpm infra:up
pnpm gtfs migrate
pnpm gtfs import --archive data/raw/gtfs/dart-recent.zip --source-url https://www.dart.org/transitdata/recent/google_transit.zip
pnpm gtfs inspect
```

Import stages the publication. Inspect its ID and coverage, then explicitly
activate the appropriate service dates. The newest DART publication may start in
the future. See [the complete workflow](docs/DEVELOPMENT.md#static-gtfs-workflow)
for activation, verification, and explicit reset, and
[the schema/import design](docs/STATIC_GTFS.md) for supported fields and limits.
Stop local containers with `pnpm infra:down`; the database volume is preserved.

## Repository

```text
apps/web/                 Responsive planner, journey timeline and MapLibre boundary
apps/api/                 Fastify journey/metadata API and service lifecycle
packages/domain/          Future portable transit types/invariants
packages/gtfs/            Streaming static GTFS parsing and normalization
packages/router/          Independent schedule-based routing and reconstruction
packages/realtime/        Experimental realtime mapping (DART live access disabled)
packages/shared/          V1 wire contracts and minimal validated place records
workers/transit-ingest/   Static import CLI, SQL migrations, and orchestration
infra/docker/             Local PostGIS + Redis
docs/                     Specification, architecture, decisions, and setup notes
```

## License

Apache-2.0.

# Dallas Transit Navigator

A mobile-first Dallas/DART transit navigator focused on answering:

**“I want to go there. Tell me exactly how.”**

The project aims to provide concrete bus/rail journey planning, transfers, live vehicle and delay context where legitimately available, and practical replanning when a connection becomes unreliable.

## Status

Milestone 3 adds an independent, schedule-based stop-to-stop routing core with
transfer rounds and exact journey reconstruction. Milestone 2 supplies versioned
GTFS storage and date-aware activation. Geographic journey planning is not yet
implemented; the web app is a placeholder and the API exposes health checks.
See the [routing design](docs/ROUTING_CORE.md) and [Milestone 3 review](docs/MILESTONE_3_REVIEW.md).

Do not rely on this project for real-world travel until a release explicitly states otherwise.

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
Both report application status only; the API does not connect to PostgreSQL or
Redis yet. `pnpm dev` starts both apps with watch/reload support. Use Ctrl+C to stop.

No environment file is required for the default local setup. Optional examples:

- [`infra/docker/.env.example`](infra/docker/.env.example): copy beside it as `.env`
  to override database credentials and infrastructure ports.
- [`apps/api/.env.example`](apps/api/.env.example): copy beside it as `.env` to
  override `HOST`/`PORT`; database/cache URLs are documented for later integration.
- [`workers/transit-ingest/.env.example`](workers/transit-ingest/.env.example):
  optional database URLs for the importer and isolated integration tests.

Defaults are **local development only**, not production credentials. Infrastructure
ports bind to `127.0.0.1`; Redis has no password in this local setup. The web shell
does not call the API and needs no URL environment variable yet.

## Commands

Run these from the repository root:

| Command                        | Purpose                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `pnpm dev`                     | Start web and API in development                                    |
| `pnpm build`                   | Build every application/package/worker                              |
| `pnpm lint`                    | ESLint across TypeScript and configuration files                    |
| `pnpm typecheck`               | Check all eight workspaces, including generated Next.js types       |
| `pnpm test`                    | Run Vitest tests across apps, packages, and workers                 |
| `pnpm test:integration`        | Test static ingestion against local PostGIS in an isolated database |
| `pnpm test:router`             | Run deterministic routing fixtures and exhaustive checks            |
| `pnpm routing:validate --help` | Show read-only database-to-router validation commands               |
| `pnpm gtfs --help`             | Show migration/import/activation/inspection/reset commands          |
| `pnpm format`                  | Apply Prettier formatting                                           |
| `pnpm format:check`            | Check formatting without changing files                             |
| `pnpm infra:config`            | Validate Docker Compose configuration                               |
| `pnpm infra:up`                | Start PostGIS and Redis and wait for healthy status                 |
| `pnpm infra:status`            | Show local service status                                           |
| `pnpm infra:down`              | Stop/remove local containers; retain PostgreSQL data                |

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
apps/web/                 Next.js + React + Tailwind shell
apps/api/                 Fastify server and health tests
packages/domain/          Future portable transit types/invariants
packages/gtfs/            Streaming static GTFS parsing and normalization
packages/router/          Independent schedule-based routing and reconstruction
packages/realtime/        Future realtime mapping
packages/shared/          Future genuinely shared utilities
workers/transit-ingest/   Static import CLI, SQL migrations, and orchestration
infra/docker/             Local PostGIS + Redis
docs/                     Specification, architecture, decisions, and setup notes
```

## License

Apache-2.0.

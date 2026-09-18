# Dallas Transit Navigator

A mobile-first Dallas/DART transit navigator focused on answering:

**“I want to go there. Tell me exactly how.”**

The project aims to provide concrete bus/rail journey planning, transfers, live vehicle and delay context where legitimately available, and practical replanning when a connection becomes unreliable.

## Status

Milestone 1 provides the repository and local development foundation. The web app
is a development placeholder and the API exposes health checks. Transit navigation
is not implemented.

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

Defaults are **local development only**, not production credentials. Infrastructure
ports bind to `127.0.0.1`; Redis has no password in this local setup. The web shell
does not call the API and needs no URL environment variable yet.

## Commands

Run these from the repository root:

| Command             | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `pnpm dev`          | Start web and API in development                              |
| `pnpm build`        | Build every application/package/worker                        |
| `pnpm lint`         | ESLint across TypeScript and configuration files              |
| `pnpm typecheck`    | Check all eight workspaces, including generated Next.js types |
| `pnpm test`         | Run Vitest tests across apps, packages, and workers           |
| `pnpm format`       | Apply Prettier formatting                                     |
| `pnpm format:check` | Check formatting without changing files                       |
| `pnpm infra:config` | Validate Docker Compose configuration                         |
| `pnpm infra:up`     | Start PostGIS and Redis and wait for healthy status           |
| `pnpm infra:status` | Show local service status                                     |
| `pnpm infra:down`   | Stop/remove local containers; retain PostgreSQL data          |

Run the same quality gates as CI:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm infra:config
```

After building, run production scaffolds in separate terminals with
`pnpm --filter @dallas-transit/web start` and
`pnpm --filter @dallas-transit/api start`. Stop with Ctrl+C, then run
`pnpm infra:down` when finished with the backing services.

## Repository

```text
apps/web/                 Next.js + React + Tailwind shell
apps/api/                 Fastify server and health tests
packages/domain/          Future portable transit types/invariants
packages/gtfs/            Future static GTFS normalization
packages/router/          Future independent routing engine
packages/realtime/        Future realtime mapping
packages/shared/          Future genuinely shared utilities
workers/transit-ingest/   Future ingestion entrypoints
infra/docker/             Local PostGIS + Redis
docs/                     Specification, architecture, decisions, and setup notes
```

## License

Apache-2.0.

# Development foundation

Milestone 1 implements scaffolding only. All accepted ADRs remain unchanged.
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

The five core packages and ingestion worker intentionally contain only `export {}`.
They have no runtime dependencies or invented transit types. Cross-package runtime
wiring is deferred until an actual interface exists: declare dependencies with
`workspace:*`, import the package name, and build dependencies before consumers.
In particular, the router has no HTTP, React, SQL, or Redis dependency.

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

The four production dependencies (Next.js, React, React DOM, Fastify) are MIT
licensed, have current stable releases, and are the maintained projects selected
by the accepted stack. Standard Node/DOM APIs do not supply their framework
behavior. No production utility, database client, ORM, map library, or query client
is added. Build/test tooling is development-only. pnpm explicitly permits native
install scripts required by esbuild, Tailwind's oxide, Next.js's sharp dependency,
and the unrs resolver used by Next.js linting.

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
  The upstream image enables PostGIS; this project creates no transit tables/schema.
- `redis:8.10.1-alpine`: Redis with disk snapshots/AOF disabled and `/data` on tmpfs.
  Cache contents disappear when the container stops. This follows ADR 0004.

Both services have health checks and loopback-only published ports. `infra:up`
waits up to 120 seconds for healthy containers after startup. The PostGIS tag pins
the supported major/minor family and may receive upstream patch refreshes; Redis
pins a patch tag. No `latest` tags are used.

| Variable                    | Default                             | Consumer                            |
| --------------------------- | ----------------------------------- | ----------------------------------- |
| `POSTGRES_DB`               | `dallas_transit`                    | Compose / initial database creation |
| `POSTGRES_USER`             | `dallas_dev`                        | Compose / initial database creation |
| `POSTGRES_PASSWORD`         | `local_only_password`               | Compose / local-only credential     |
| `POSTGRES_PORT`             | `5432`                              | Compose host port                   |
| `REDIS_PORT`                | `6379`                              | Compose host port                   |
| `HOST`                      | `127.0.0.1`                         | API listener                        |
| `PORT`                      | `3001`                              | API listener                        |
| `DATABASE_URL`, `REDIS_URL` | Examples in `apps/api/.env.example` | Reserved; not consumed yet          |

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

## Deferred work

The web app includes basic metadata and a web manifest as PWA preparation only.
Icons, service workers, offline behavior, and installability validation belong in
the PWA milestone. Playwright is deferred until meaningful UI journeys exist.
MapLibre, TanStack Query, database clients, transit schemas, ingestion, domain
models, routing, realtime, and deployments are all deferred to their own milestones.

GitHub Actions runs frozen install, formatting, lint, types, tests, build, and
Compose configuration validation on PRs and pushes to `main`. No credentials or
running data services are needed for these scaffold tests. Docker health is checked
locally; storage integration tests should add CI services when introduced.

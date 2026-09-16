# Technology Stack

## Locked initial stack

| Layer | Technology | Reason |
|---|---|---|
| Language | TypeScript | Shared language across web/backend, strong typing, portfolio diversity |
| Web | Next.js + React | Mobile-first web/PWA, ecosystem, deployability |
| Styling | Tailwind CSS | Fast consistent UI implementation |
| Server state | TanStack Query | Query caching/fetching/retry/state |
| Map | MapLibre GL JS | Open-source interactive vector map stack |
| API | Fastify | Lightweight explicit Node backend |
| Runtime | Node.js | TypeScript backend |
| Database | PostgreSQL | Mature relational database for GTFS structure |
| Spatial | PostGIS | Geospatial stop/viewport/proximity queries |
| Realtime/cache | Redis | Short-lived vehicle/trip state |
| Workspace | pnpm | Efficient monorepo package management |
| Local infra | Docker Compose | Repeatable contributor setup |
| Tests | Vitest | TypeScript unit/integration tests |
| E2E | Playwright | Browser journey tests |
| CI | GitHub Actions | Public, visible quality gates |
| License | Apache-2.0 | Permissive with explicit patent grant |

## Why not FastAPI?

The goal is to broaden software-engineering evidence instead of making another Python/FastAPI project.

Python can still be used for one-off analysis tooling if there is a compelling reason, but production backend code should remain TypeScript unless an ADR changes it.

## Why not native mobile first?

A PWA:
- ships faster
- is directly deployable
- works on desktop and phone
- can be installed to a home screen
- avoids maintaining two native clients

Native can follow only if product needs justify it.

## Why not OpenTripPlanner as the production router?

Because the routing engine is one of the central engineering/CS contributions of this project.

OTP remains valuable as:
- oracle
- benchmark
- reference
- debugging aid

## Why PostGIS?

Transit is geographic.

Typical operations:
- nearest stops
- destination stop candidates
- transfer distance
- viewport filtering
- route geometry

PostGIS makes these explicit and indexed.

## Why Redis?

Realtime transit state is:
- frequently updated
- ephemeral
- read-heavy
- freshness-sensitive

Redis is appropriate for current state, while Postgres remains the durable schedule store.

## Dependencies policy

Avoid adding libraries for tiny utilities.

Before adding a production dependency, record:
- problem
- candidate
- maintenance health
- license
- bundle/runtime cost
- why standard/existing tooling is insufficient

For critical transit parsing/routing behavior, prefer code that is testable and understandable.

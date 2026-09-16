# AGENTS.md

## Project

This repository contains an open-source, mobile-first Dallas public-transit navigation application centered on DART.

Before substantial work, read:
- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/TECH_STACK.md`
- applicable files in `docs/adr/`

Do not silently contradict an accepted architectural decision. If a task requires changing one, explain why and update/create an ADR.

## Core product goal

The dominant experience is:

> “I want to go to a destination. Tell me exactly how to get there using Dallas-area transit.”

The product must provide concrete transit navigation, not only schedule lookup.

It should ultimately tell users:
- which bus and/or train to take
- boarding stop
- correct direction/headsign
- scheduled departure
- realtime departure when available
- specific vehicle when identifiable
- where to exit
- transfers
- walking legs
- destination arrival
- relevant alerts
- alternatives when the journey is disrupted

Dallas/DART is the product scope.

Do not turn the product into a nationwide transit app unless an explicit future decision changes this.

## Portability

The product is Dallas-specific, but the underlying transit domain and routing engine should avoid unnecessary DART hard-coding.

A second transit agency may be added later only to validate portability.

Do not build a generalized agency marketplace or nationwide onboarding system in V1.

## Route preference

Default itinerary priority:

1. earliest arrival
2. fewer transfers
3. less walking
4. lower transfer risk

Do not replace this priority with an opaque weighted score without an ADR.

Generate a small set of sensible alternatives.

## Routing

Implement our own RAPTOR-style or closely related round-based transit-routing engine.

OpenTripPlanner may be used:
- as a development reference
- as an integration/correctness oracle
- for discrepancy investigation

OpenTripPlanner must not silently become the production routing engine.

Routing logic must be independently testable without the web UI or database.

## V1 account policy

V1 must not require:
- account creation
- login
- user profiles
- social features

Saved places/preferences should initially stay on-device where practical.

## Technology direction

Frontend:
- TypeScript
- React
- Next.js
- Tailwind CSS
- MapLibre GL JS
- TanStack Query
- PWA

Backend:
- TypeScript
- Node.js
- Fastify

Data:
- GTFS Schedule
- GTFS-Realtime where legitimate access is confirmed
- PostgreSQL + PostGIS
- Redis for short-lived realtime/cache state

Repository:
- pnpm workspace
- Docker for local backing services
- strict TypeScript
- automated tests
- GitHub Actions
- Apache-2.0 license

## Data rules

Never assume an undocumented DART realtime endpoint is stable or permitted.

Before production realtime integration:
- confirm source
- confirm access terms
- confirm rate limits
- confirm feed freshness behavior
- document it

Treat GTFS Schedule and GTFS-Realtime as different data lifecycles.

Do not present stale realtime data as live.

## Engineering rules

Before coding:
1. inspect relevant files
2. restate task scope
3. propose the smallest implementation
4. identify tests
5. identify assumptions and external dependencies

Prefer small, reviewable changes.

After coding:
- run relevant tests
- run lint/type checks when affected
- report changed files
- report assumptions
- report failures honestly
- do not claim success when tests fail

Do not add a production dependency without explaining why existing code/platform functionality is insufficient.

Keep:
- domain logic separate from persistence
- routing separate from HTTP
- realtime ingestion separate from static GTFS ingestion
- UI state separate from transit-domain logic

Never commit:
- API keys
- tokens
- credentials
- private configuration
- secrets
- local `.env` files

## Routing quality

Critical routing behavior requires deterministic tests.

Prefer tiny artificial transit-network fixtures for algorithm correctness.

Use real DART journeys as integration tests, but do not rely only on live production feeds for tests.

When comparing against OpenTripPlanner, investigate meaningful discrepancies instead of simply adjusting tests to match.

## Open-source rules

Treat this as a real public project.

Changes should remain understandable to outside contributors.

Prefer:
- documented interfaces
- clear commit scopes
- reproducible setup
- useful issues
- behavior tests
- contribution guidance

Do not optimize the codebase merely for resume appearance.

The external open-source contribution goal is separate from this repository.

## Codex behavior

Do not implement the whole roadmap in one task.

Work issue-by-issue.

If a task is broad:
- divide it into milestones
- recommend the first milestone
- wait for explicit approval before large architectural changes

When asked to investigate first, do not modify files.

When code is generated, explain non-obvious algorithms and design tradeoffs so the human developer can understand and defend them in an interview.

# Roadmap

## Milestone 0 — Feasibility

Deliverables:
- DART GTFS Schedule source confirmed
- current feed inspected
- feed schema/quirks documented
- realtime access path researched
- access/rate/legal constraints documented
- risk register created

Exit condition:
We know what data can actually be used.

## Milestone 1 — Repository and infrastructure

Deliverables:
- pnpm monorepo
- strict TypeScript
- lint/format/test scripts
- Docker Compose
- PostGIS
- Redis
- GitHub Actions baseline
- domain package

Exit condition:
A contributor can clone, install, and run backing services.

## Milestone 2 — Static GTFS ingestion

Deliverables:
- parsers
- normalized domain types
- database schema
- feed import
- import validation
- fixture tests
- repeatable refresh design

Exit condition:
The current DART schedule is queryable from Postgres.

## Milestone 3 — Routing engine core

Deliverables:
- artificial fixture network
- direct route
- transfer rounds
- service calendar
- journey reconstruction
- route ranking

Exit condition:
Schedule-based stop-to-stop routing is correct on deterministic tests.

## Milestone 4 — Geographic journey planning

Deliverables:
- nearby-stop search
- walking-router interface
- origin access
- destination egress
- complete geographic journeys

Exit condition:
Coordinates can be converted into end-to-end schedule itineraries.

## Milestone 5 — API

Deliverables:
- Fastify API
- `/v1/journeys`
- nearby stops
- route/stop details
- validation
- integration tests

Exit condition:
A client can request and receive concrete itineraries.

## Milestone 6 — Mobile web UX

Deliverables:
- search screen
- results
- itinerary detail
- MapLibre route rendering
- local saved places
- responsive phone UX

Exit condition:
Static-schedule journeys are usable on a phone.

## Milestone 7 — OTP correctness comparison

Deliverables:
- local/reference OTP environment
- Dallas journey corpus
- discrepancy reporting
- regression comparisons

Exit condition:
Known journeys have understood behavior relative to a mature reference implementation.

## Milestone 8 — Realtime

Dependent on confirmed access.

Deliverables:
- GTFS-RT ingestion
- Redis state
- vehicle positions
- delays
- alerts
- freshness
- itinerary annotations

Exit condition:
Selected journey legs show trustworthy realtime state.

## Milestone 9 — Replanning / transfer risk

Deliverables:
- transfer buffer
- risk category
- cancellation handling
- delayed-connection handling
- simple reroute

Exit condition:
The app reacts meaningfully when the original trip becomes unreliable.

## Milestone 10 — PWA + public deployment

Deliverables:
- manifest
- installable app
- production database/cache
- API deployment
- web deployment
- logging
- feed monitoring
- public demo URL

Exit condition:
A real user can use it from a phone in Dallas.

## Milestone 11 — Open-source maturity

Deliverables:
- issue labels
- contributor setup verified from clean clone
- first tagged release
- good-first-issue candidates
- docs cleanup
- architecture diagram
- changelog/release notes

Exit condition:
Repository feels like a maintainable public project.

## Milestone 12 — External open-source contributions

Deliverables:
- at least one merged external PR
- ideally one code/test PR
- documented contribution log

Exit condition:
Resume can truthfully cite external open-source work.

## Milestone 13 — Portability proof

Only after Dallas is polished.

Deliverables:
- load one second agency in development/test mode
- fix hidden DART assumptions
- document portability findings

Exit condition:
Core engine demonstrably works beyond one feed without becoming a nationwide product.

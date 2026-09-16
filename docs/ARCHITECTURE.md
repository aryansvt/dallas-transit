# Architecture

## High-level system

```text
                 DART GTFS Schedule
                         |
                         v
                 Static Ingestion Worker
                         |
                         v
                PostgreSQL + PostGIS
                         |
                         +-------------------+
                                             \
                                              v
User/PWA -> Next.js Web -> Fastify API -> Routing Service/Package
                                              ^
                                             /
                         +-------------------+
                         |
                       Redis
                         ^
                         |
                 Realtime Ingestion Worker
                         ^
                         |
                  DART GTFS-Realtime
                 (only when confirmed)
```

OpenTripPlanner runs separately in development/test environments as a reference oracle.

## Architectural goals

1. Keep the routing engine independent from HTTP and UI.
2. Keep domain types independent from database ORM/SQL representations.
3. Treat static GTFS and realtime GTFS as separate lifecycles.
4. Keep Dallas in the product layer without hard-coding Dallas assumptions into core transit algorithms.
5. Keep V1 deployable without enterprise-scale infrastructure.
6. Maintain deterministic tests for algorithmic behavior.
7. Make local setup approachable for open-source contributors.

## Repository structure

```text
apps/
  web/                  Next.js PWA
  api/                  Fastify API

packages/
  domain/               Transit-domain types and invariants
  gtfs/                 GTFS parsing/normalization
  router/               RAPTOR-style routing engine
  realtime/             Realtime domain mapping
  shared/               Truly shared utilities only

workers/
  transit-ingest/       static/realtime ingestion entrypoints

infra/
  docker/               local infrastructure files if needed

docs/
  adr/                  Architecture Decision Records
```

## Frontend

Responsibilities:
- destination-first UX
- geolocation
- destination/origin entry
- results list
- journey detail
- MapLibre rendering
- local saved places
- network/realtime states
- PWA installability

Frontend must not contain routing business logic beyond presentation-specific transformations.

Use TanStack Query for server state.

Avoid a heavy global client-state library unless actual complexity appears.

## API

Fastify API responsibilities:
- input validation
- authentication later if ever needed
- stop/spatial query endpoints
- journey planning endpoint
- current realtime state endpoints
- alerts
- health/readiness

The API delegates transit routing to the router package.

## Router package

The router consumes an internal transit-network representation.

It should not:
- query arbitrary SQL throughout algorithm loops
- know about React
- know about HTTP
- know about Redis
- know that the agency is DART unless agency-specific policy is explicitly injected

Initial algorithm direction:
- RAPTOR-style round-based scanning
- earliest arrival
- transfer rounds
- footpaths
- path reconstruction
- bounded useful alternatives

## Static GTFS ingestion

Static ingestion:
- fetch/download approved feed
- validate
- parse
- normalize
- stage
- transactionally activate a feed version
- build indexes/derived structures

DART advises consumers to check for feed updates frequently, so the design should support repeatable replacement.

## Realtime ingestion

Realtime ingestion:
- poll permitted GTFS-RT sources
- decode protobuf
- validate timestamps
- normalize identifiers
- update Redis
- expose freshness

Do not use Redis as the only source for information that must survive restart.

## PostgreSQL/PostGIS

Persistent:
- feed metadata
- routes
- stops
- trips
- stop times
- service calendar
- transfers
- shapes
- spatial geometry
- later: historical observations if intentionally added

PostGIS enables:
- stops near origin/destination
- viewport/spatial filtering
- station geometry work
- geographic indexing

## Redis

Use for:
- current vehicle positions
- current trip delays
- current alert cache if appropriate
- route-planning cache only when justified
- feed freshness markers

Every cached realtime object should have clear TTL/freshness semantics.

## Walking routing abstraction

Transit routing is our custom algorithm.

Pedestrian street routing should be an adapter/interface to an established walking-routing solution.

Example conceptual interface:

```ts
interface WalkingRouter {
  route(input: WalkingRouteRequest): Promise<WalkingRouteResult>;
}
```

This prevents a specific external walking provider from infecting the router design.

## OpenTripPlanner

OTP is a reference oracle.

Use it to:
- compare selected journeys
- understand discrepancies
- validate broad feasibility
- catch regressions

Do not blindly assert our output must byte-for-byte match OTP.

Independent artificial-network tests remain the strongest source of algorithm correctness.

## Observability

V1 production should at least expose:
- structured application logs
- API errors
- feed fetch failures
- feed freshness
- import failures
- router latency
- journey request failure rate

Avoid complex observability platforms until needed.

## Security

V1 is relatively low-auth risk because there are no user accounts.

Still protect:
- environment variables
- external API keys
- database credentials
- infrastructure credentials

Validate all external feed inputs.

Rate limit public API endpoints if abuse becomes plausible.

## Scaling

Do not optimize prematurely.

Likely early bottlenecks:
- stop-time scanning
- rebuilding in-memory router indexes
- walking-provider calls
- map data payloads
- realtime polling
- excessive spatial queries

Profile first.

A well-indexed/in-memory transit network may be far more valuable than adding distributed infrastructure.

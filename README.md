# Dallas Transit Navigator

> Early-stage open-source project.

A mobile-first Dallas/DART transit navigator focused on answering:

**“I want to go there. Tell me exactly how.”**

The project aims to provide concrete bus/rail journey planning, transfers, live vehicle and delay context where legitimately available, and practical replanning when a connection becomes unreliable.

## Status

Planning / feasibility stage.

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

Start with:
- `START_HERE.md`
- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/TECH_STACK.md`

## Contributing

See `CONTRIBUTING.md`.

## License

Apache-2.0.

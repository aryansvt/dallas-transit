# Roadmap

The milestones were planned up front. Numbering held through M8; after that,
production work split into M9A to M9C, and later features shipped as ADRs
instead of numbered milestones. Review notes for finished milestones are in the
[archive](archive/README.md); feature decisions are in the [ADR index](adr/README.md).

## Done

| Milestone | What shipped | PR |
| --- | --- | --- |
| M0 Data feasibility | DART GTFS Schedule confirmed and inspected; realtime access path researched ([DATA_FEASIBILITY.md](DATA_FEASIBILITY.md)) | #1 |
| M1 Repository | pnpm workspace, strict TypeScript, lint/format/test, Docker PostGIS and Redis, CI | #2 |
| M2 Static GTFS | Streaming import, versioned publications, explicit activation by service date | #3 |
| M3 Routing core | RAPTOR-style stop-to-stop router with tiny fixture networks and an exhaustive checker | #4 |
| M4 Geographic planning | Nearby-stop access and egress, walking-provider interface, complete trips from coordinates | #5 |
| M5 API | Fastify journey and metadata API, deadlines, cancellation, readiness | #6 |
| M6 Mobile web | Planner, results, journey detail, MapLibre map, saved places, `/preview` | #7 |
| M7 OTP comparison | Dallas journey corpus checked against OpenTripPlanner 2.7.0; no router defect found | #8 |
| M8 Live trip intelligence | GTFS-Realtime decoding, freshness, delay overlays and transfer replanning. Built and tested, switched off until DART access is confirmed | #9 |
| M9A Production providers | Mapbox search and basemap, Geoapify walking, DART stop search | #10 |
| M9B Production deployment | Render API and Postgres, Vercel web, shared-key proxy, CSP, rate budget | #11 |
| M9C Routing quality | Validated pedestrian links, walking totals, scheduled transfer risk, better alternatives, latency fix ([ADR 0005](adr/0005-routing-quality-and-pedestrian-evidence.md)) | #12, #13 |

Since M9C:

| Feature | Notes | PR |
| --- | --- | --- |
| Station board redesign | New visual direction for the web app | merged directly |
| Arrive-by planning | Latest leave time for a deadline ([ADR 0006](adr/0006-arrive-by-departure-window-search.md)); web UI shipped with #16 | #15 |
| Departure insight | "Leave earlier" and "no need to rush" hints ([ADR 0007](adr/0007-departure-time-insight.md)); web UI shipped with #16 | merged directly |
| Class schedules and UTD places | `.ics` import on the device, next-class trips, verified campus entrances ([ADR 0008](adr/0008-on-device-class-schedules.md)) | #16 |
| Leave-by board and transfer confidence | Leave-by countdown, per-transfer Comfortable/Tight/Risky, class conflict warning | #17 |
| Depth pass | Elevation, route-colored lines, motion and micro-interactions | #18 |

## Next

### Open-source readiness

The old M11. Docs are cleaned up (milestone notes archived, ADR index, current
README). Still to do:

- issue labels and a few real good-first-issue candidates
- contributor setup verified from a clean clone
- architecture diagram that matches the current code
- first tagged release and a changelog

Done when an outside contributor can set up, find something to work on and get
a PR merged without asking the maintainer how.

### Realtime

The M8 pipeline is ready; the blocker is access. Needs authorized DART developer
access, reviewed terms, documented endpoints and quotas, and a static publication
whose IDs match the feed. Before running more than one API instance, move
snapshot state to Redis as ADR 0004 intends.

Done when selected journey legs show live state that is labeled with its age and
never shown once stale.

### PWA

A manifest and icons exist. Still missing: a service worker, an offline shell,
graceful offline messaging and an install check on real phones. Offline
routing is out of scope unless schedule data is deliberately cached for it.

### Routing gaps

Known limits that come up in real trips:

- after-midnight trips that need the previous or next service day
- walking-only answers when walking beats every transit option
- route shapes on the map (today the map shows places and stops only)
- arrive-by alternatives that leave a little earlier only for more transfer
  slack ([ADR 0006](adr/0006-arrive-by-departure-window-search.md) names the upgrade path)

### Portability proof

Only after Dallas is polished. Load one second agency in a development or test
configuration, fix the DART assumptions it exposes and write down what changed.
It does not become a second city in the product.

# Architecture decisions

Each ADR records one decision, why it was made and what it costs. Later ADRs
extend earlier ones; none so far replaces another.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-dallas-first-portable-core.md) | Dallas-first product with a portable routing and data core | Accepted |
| [0002](0002-own-router-otp-oracle.md) | Build our own RAPTOR-style router; OpenTripPlanner is a reference oracle only | Accepted |
| [0003](0003-no-auth-v1.md) | No accounts or login in V1; personal data stays on the device | Accepted |
| [0004](0004-storage-lifecycles.md) | PostgreSQL/PostGIS for schedule data, Redis for short-lived realtime state | Accepted |
| [0005](0005-routing-quality-and-pedestrian-evidence.md) | Validated pedestrian links and multicriteria ranking (M9C) | Accepted |
| [0006](0006-arrive-by-departure-window-search.md) | Arrive-by planning with a reverse pass and a departure-window search | Accepted, amended 2026-10-16 (boarding margin) |
| [0007](0007-departure-time-insight.md) | Departure-time insight: "leave earlier" and "no need to rush" hints | Accepted |
| [0008](0008-on-device-class-schedules.md) | Class schedule import in the browser and verified campus entrances | Accepted |

## Adding one

Use the next number and the same sections: Status, Context, Decision,
Consequences, and Alternatives considered when there were real ones. Say in
Status which ADRs it extends. If a change contradicts an accepted ADR, write a
new one that says so instead of editing the old decision.

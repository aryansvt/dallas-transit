# ADR 0004 — Separate durable schedule data from ephemeral realtime state

## Status
Accepted

## Context
GTFS Schedule changes relatively slowly. Vehicle positions and delays change frequently and can become stale within minutes.

## Decision
Use PostgreSQL/PostGIS for durable schedule/spatial data.

Use Redis for current realtime state/cache.

Historical realtime observations, if added later, are intentionally persisted separately.

## Consequences
Positive:
- clear freshness semantics
- appropriate query/storage models
- simpler realtime replacement

Negative:
- two data systems to operate
- reconciliation logic must be tested

# ADR 0002 — Build our own router; use OpenTripPlanner as an oracle

## Status
Accepted

## Context
Transit routing is a central technical opportunity in this project. Delegating all routing to an existing engine would reduce algorithmic depth.

OpenTripPlanner remains a mature reference implementation.

## Decision
Implement a RAPTOR-style routing engine in `packages/router`.

Use OpenTripPlanner during development for:
- reference journeys
- discrepancy investigation
- broad validation

OTP is not the production routing engine.

## Consequences
Positive:
- strong CS/algorithmic component
- full control over ranking/replanning
- excellent interview depth

Negative:
- substantially harder
- correctness burden is ours
- requires extensive deterministic testing

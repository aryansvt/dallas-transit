# ADR 0003 — No required authentication in V1

## Status
Accepted

## Context
The core user need is fast transit navigation. Accounts add security, persistence, UX, and operational complexity without improving routing.

## Decision
V1 has no required login/profile/account.

Saved places use local device storage where practical.

## Consequences
Positive:
- faster product access
- smaller backend/security surface
- less scope

Negative:
- saved preferences do not sync across devices
- push-notification identity may require a later design

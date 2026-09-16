# ADR 0001 — Dallas-first product with a portable core

## Status
Accepted

## Context
The project should be personally relevant and deeply useful in Dallas. Expanding nationwide too early would add agency-specific QA and data complexity before the core experience is polished.

## Decision
The user-facing product remains Dallas/DART-focused.

Core GTFS/domain/routing code must avoid unnecessary DART hard-coding.

After Dallas is mature, one second agency may be used as a portability test.

## Consequences
Positive:
- stronger personal product story
- deeper Dallas quality
- less early scope explosion
- still demonstrates thoughtful architecture

Negative:
- some Dallas-specific assumptions may be discovered late
- second-agency validation must be done deliberately

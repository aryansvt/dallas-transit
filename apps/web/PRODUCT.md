# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dallas-area riders on a phone, often mid-trip, who need one concrete itinerary rather than a map to browse. Includes occasional and newer DART riders who need explicit instructions.

## Product Purpose

LineFinder answers "I want to go there. Tell me exactly how." It plans DART bus and rail journeys with boarding stop, headsign/direction, scheduled times, transfers, walking legs, exit stop and arrival. Success is a rider who knows exactly what to do next at every step.

## Positioning

Exact, step-by-step instructions with honest data labeling: scheduled versus live is always clear, and stale realtime is never presented as live. Backed by an open, independently testable TypeScript RAPTOR-style router with documented limits.

## Operating Context

Used on a phone, often outdoors or at a stop, on spotty networks. Flow: origin (current location or manual), destination, leave now or depart at, a small set of itineraries, then journey detail with next action and countdown. Installable PWA. No account or login in V1; saved places stay on-device.

## Capabilities and Constraints

- Scope is Dallas/DART only; not a nationwide app in V1.
- Schedule-based bus and rail routing is deployed. DART realtime is disabled; no permitted live feed is confirmed.
- Default itinerary priority: earliest arrival, fewer transfers, less walking, lower transfer risk. Not an opaque weighted score.
- Transfer confidence is deterministic (Comfortable, Tight, At risk), not statistical.
- Maps show places and stops, not route polylines. MapLibre / Mapbox for maps and search; Geoapify for walking.
- Known limits are surfaced to users: no walking-only planning, no automatic adjacent-service-day search, scheduled connections are not live predictions.
- Wheelchair-aware routing is undecided until data is trustworthy.

## Brand Commitments

- Name: LineFinder. Independent; not affiliated with or endorsed by DART, and the UI must say so.
- Never use DART's logo or mimic DART's branding, so it never looks affiliated.
- Voice: plain, no AI-sounding copy, no em dashes.
- Logo and colors are open to change (no binding identity yet).

## Evidence on Hand

- Deployed app: https://linefinder-dart.vercel.app
- Docs: `docs/PROJECT_SPEC.md`, `docs/MILESTONE_9C_REVIEW.md`, `docs/DEPLOYMENT.md`.
- No testimonials, usage numbers or user research exist; do not fabricate any.

## Product Principles

1. Concrete over browsable: the itinerary and next action lead; the map supports.
2. Honest about data: label schedule versus live, show uncertainty, never fake freshness.
3. Never look affiliated with DART.
4. Works one-handed on a phone, outdoors, on a weak connection.
5. No accounts; user data stays on the device.

## Accessibility & Inclusion

Keyboard support, readable contrast, screen-reader labels, large tap targets, no information conveyed by color alone, and text alternatives to the map for critical instructions.

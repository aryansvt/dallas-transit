# Dallas Transit Navigator — Product Specification

## Product statement

A mobile-first, open-source Dallas transit navigator that answers:

> “I want to go there. Tell me exactly how.”

It should plan concrete DART journeys using buses and trains, identify the correct stops/trips/transfers, show live vehicle and delay information where legitimately available, and help the rider react when the original plan becomes unreliable.

## Why this exists

The project is rooted in a real personal use case: navigating Dallas-area public transit.

The point is not to create a generic portfolio clone of Google Maps.

The project emphasizes:
- exact transit navigation
- live operational awareness
- connection handling
- routing-engine depth
- useful mobile UX
- open-source engineering

## Geography

Product scope: Dallas/DART.

Do not broaden the user-facing product into a nationwide transit service during V1.

The core router and GTFS domain should still avoid unnecessary DART-specific assumptions.

## Primary user flow

1. User opens the app.
2. Origin defaults to current location, with manual override.
3. User enters a destination.
4. User chooses “leave now” or a departure time.
5. App returns a small set of useful itineraries.
6. Best default itinerary is selected according to the route priority.
7. User sees concrete step-by-step transit instructions.
8. During the journey, realtime information updates the itinerary where possible.
9. If the plan becomes infeasible, the app recommends a reasonable alternative.

## Route priority

The user’s locked preference order:

1. earliest arrival
2. fewer transfers
3. less walking
4. lower transfer risk

The app should not produce absurd alternatives just because one route wins by seconds.

Use sensible dominance/filtering and tie-breaking.

## Itinerary content

An itinerary should eventually contain:
- origin
- destination
- total duration
- scheduled departure
- scheduled arrival
- realtime-adjusted arrival if available
- total walking
- transfer count
- alerts
- per-leg instructions

Transit leg:
- boarding stop
- route
- route short/long name
- headsign/direction
- scheduled departure
- realtime departure
- exact trip identifier
- vehicle identifier when available
- live vehicle position when available
- intermediate stops where useful
- alighting stop
- scheduled/realtime arrival

Transfer:
- from stop/station
- to stop/station
- walking duration
- planned buffer
- current estimated buffer
- risk category

Walking leg:
- start
- end
- duration
- distance
- geometry if available

## Primary screens

### Search / home
- current-location origin
- editable origin
- destination search
- leave now / depart at
- local saved places later
- recent destinations later

### Results
A small number of itineraries showing:
- ETA
- departure
- duration
- transit sequence
- transfers
- walking
- live delay/status
- connection warnings

### Journey detail
- step-by-step instructions
- map
- next action
- countdown
- live vehicle when available
- transfer state
- alerts
- replan action

### Route/vehicle inspection
Secondary, not the home-screen priority.

## Map behavior

Use MapLibre.

Show journey-relevant context:
- user location
- origin
- destination
- boarding/alighting stops
- transfer stops
- transit shape
- walking segments
- live vehicle
- relevant alternate boarding options where useful

Do not clutter the map with the entire transit network by default.

## Realtime

Where a legitimate DART GTFS-Realtime feed is available, support:
- VehiclePositions
- TripUpdates
- Alerts

Realtime data must include freshness information internally.

If stale/unavailable:
- fall back to schedule
- communicate uncertainty
- never pretend stale data is live

## Replanning

Basic V1 replanning should handle:
- delay threatens transfer
- trip cancellation
- missed transfer
- user requests refresh

The system can re-run the routing engine from the rider’s effective current state.

## Transfer risk

V1 transfer confidence should be deterministic.

Do not invent statistical probabilities.

Inputs may include:
- planned transfer buffer
- current upstream delay
- transfer walk time
- station safety margin
- feed freshness

Example output:
- Comfortable
- Tight
- At risk

Historical prediction may become a later project.

## Accounts

No required account/login/profile in V1.

Local saved places are preferred.

Add authentication only when a concrete product need justifies it.

## PWA

V1 should be installable and usable on a phone.

Required:
- responsive mobile layout
- web app manifest
- installable PWA behavior
- graceful network failures
- no dependence on desktop-only interactions

## Accessibility

Design with:
- keyboard support
- readable contrast
- screen-reader labels
- map alternatives for critical instructions
- large tappable controls
- no critical information conveyed only by color

Wheelchair-aware routing is valuable but depends on data completeness and should be added only when behavior can be trustworthy.

## V1

Target:
- origin/current location
- destination search
- schedule-based bus routing
- schedule-based rail routing
- bus/rail transfers
- walking access/egress
- useful alternative itineraries
- route map
- scheduled times
- realtime vehicle/delay/alert integration if access is confirmed
- transfer-risk warning
- basic replanning
- local saved places
- PWA
- deployed public demo
- tests + CI
- open-source contributor setup

## Explicitly not V1

- mandatory accounts
- profile system
- native iOS
- native Android
- nationwide agency support
- ML delay prediction
- social features
- payments/fare purchasing
- complex cloud infrastructure for its own sake
- custom pedestrian-routing engine

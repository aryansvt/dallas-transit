# Milestone 8 — Live Trip Intelligence

Implemented on `feat/live-trip-intelligence`, from clean `main` matching a fresh
`origin/main` fetch. This task includes the requested transfer-risk/replanning
scope; it does not start another roadmap milestone.

## DART access: not enabled

Checked September 24–25, 2026:

- The [official DART developer portal](https://dart.developer.azure-api.net/)
  advertises vehicle locations, trip updates/predictions, cancellations/detours,
  and service alerts. It reports vehicle refreshes within five seconds and trip
  updates every sixty seconds. These are publishing cadences, **not request quotas**.
- The public portal links to sign-in; its metadata describes acquiring keys by
  signing up. Exact API paths/products, authentication header/subscription steps,
  quotas, usage/redistribution terms, response MIME types, and static/realtime ID
  compatibility could not be verified from public documentation. Do not infer
  Azure subscription headers or endpoint paths from the portal's technology.
- No credentials were explicitly provided or used. No account was created, no
  terms accepted, and no authenticated feed request was made.

Human action: obtain authorized developer access through DART, review applicable
terms yourself, and obtain the documented feed URLs, authentication mechanism,
subscription/quota details, content types, and compatible static publication.
Explicitly authorize the credentials before an agent uses them. Configure only
those verified values using the commented server-only settings in
`apps/api/.env.example`. There is no default or guessed DART endpoint.

## Architecture and boundaries

`packages/realtime` owns protobuf decoding, normalized snapshots, matching,
freshness, overlays, transfer evaluation, and request-local routing inputs.
`protobufjs@8.2.1` (BSD-3-Clause) is the only new direct external dependency;
Node cannot decode protobuf natively. It uses the official Apache-2.0
[GTFS-RT schema](https://github.com/google/transit/blob/master/gtfs-realtime/proto/gtfs-realtime.proto),
stored locally with its attribution (trailing whitespace normalized). MobilityData's maintained
[Node bindings](https://github.com/MobilityData/gtfs-realtime-bindings/tree/master/nodejs)
also use this runtime; loading the schema avoids their additional compiler CLI
dependency. The lockfile adds `long` transitively. The optional protobuf install
script is disabled. Browser imports are **types only**; no protobuf runtime,
credentials, or provider URLs enter the browser.

The explicitly permitted single-process implementation shares up to three feed
lifecycles across riders. `SnapshotSource` is the replacement boundary for Redis
and a coordinated ingestion writer before multi-instance deployment; this does
not replace ADR 0004's production storage direction. Static GTFS tables are never
modified. No Redis client, database migration, or paid infrastructure was added.

Each lifecycle has single-flight refresh, a minimum/default 60-second interval
(raise it for the actual quota), five-second timeout, HTTPS/header authentication,
redirect rejection, MIME validation, streamed 4 MiB limit, 20,000-entity limit,
shutdown cancellation, last-valid retention, and fifteen-minute payload expiry.
Only full snapshots are supported. Differential feeds are rejected; deletion
entities and unsupported relationships are diagnosed, not interpreted as safe
schedule changes. HTTP/protobuf failures retain the last valid snapshot without
renewing its timestamps. Equal/older feed clocks are rejected; regressed entity
clocks are dropped. Logs contain bounded counts/categories and timing, not keys,
precise rider coordinates, or provider bodies.

Trip updates, explicit stop arrival/departure time or delay, vehicle positions/
stop progress, cancellation, skipped/no-data stops, and translated alerts are
normalized immediately. Unknown experimental detours, added/replacement trips,
and implicit delay propagation are deliberately not inferred.

## Trust, identity, and transfer rules

Feed/source time, receipt time, and available entity observation time constrain
freshness: up to 120 seconds is `LIVE`, 121–300 is `AGING`, and older is `STALE`.
Two missed advertised prediction cycles age information; five expire forecasts.
Missing source clocks produce `SCHEDULED_FALLBACK`; no snapshot is `UNAVAILABLE`.
Thirty seconds of future clock skew is tolerated; larger offsets are rejected
or excluded. Vehicle observations require their own timestamp. Missing optional
trip-update timestamps use the header clock. Missing individual predictions never
become zero-delay/on-time claims. Stale forecasts and vehicle markers are removed;
the static itinerary remains. Browser responses expire within 45 seconds or at
the next source-freshness boundary, whichever is earlier.

Matching requires the configured publication, exact trip ID, explicit service
date, and compatible route/start time when supplied. Stop sequence disambiguates
repeated stops; stop ID and sequence must agree. Unknown/ambiguous identities,
duplicate entities/trip updates, reversed stop order, and impossible chronology
are excluded with diagnostic counts. The API logs matching diagnostics. A new
static publication requires a verified new binding rather than reusing raw IDs.
Prediction offsets are bounded to six hours and use GTFS local-noon-minus-twelve
service anchors, including Dallas DST dates and overnight service seconds.

Transfer slack = updated outbound departure − updated inbound arrival − explicit
interchange duration − the existing boarding-stop change allowance. Both timings
must be live and the interchange must be known. Missing/aging/stale timing is
`UNKNOWN`; uncertainty overlapping the allowance or less than sixty seconds of
extra slack is `AT_RISK`; even the optimistic uncertainty bound failing the
allowance is `INFEASIBLE`; otherwise it is `FEASIBLE`. Omitted uncertainty uses
point predictions with an explicit “uncertainty was not fully provided” caveat,
not a zero-error guarantee. Cancellation or a skipped
required transfer stop is infeasible. There are no confidence percentages,
invented station walks, or claims that a transfer is “safe.”

Alerts use active periods and conjunctive entity selectors; equivalent text is
deduplicated and responses contain at most twenty alerts. Route/trip/stop matches
are scoped to selected ride segments. Agency-wide alerts require explicitly
verified `DART_REALTIME_AGENCY_IDS`; unsupported selectors are not broadened.
Alert prose never changes routing.

## API, following, and replanning

`POST /v1/journeys` adds optional `liveJourneyIds`. The API retains at most 256
opaque journey handles for one hour in memory. `GET /v1/journeys/:id/live` returns
normalized overlay, freshness/expiry, relevant alerts, transfer state, selected
vehicles, and replan reasons. `POST /v1/journeys/:id/replan` accepts **either** a
coordinate **or** a rider-confirmed stop from that journey. Existing request
validation, capacity limits, no-store headers, cancellation, and deadlines apply.

Replanning uses current time and the existing geographic/RAPTOR machinery with an
immutable adjusted schedule. Cancelled trips and skipped boarding/exit stops are
excluded; contradictory partial timing excludes that run instead of inventing
propagation. Returned journeys retain original schedule values for fallback;
live forecasts remain separate. Consequently a delayed run's scheduled boarding
time can already be past when its current prediction still permits boarding.

Cancellation, unavailable required stops, and infeasible transfers offer a replan
action. A passed boarding stop prompts the rider to replan if they missed it.
There is no automatic rider-location inference or silent journey replacement.
The user chooses fresh geolocation (at most 30 seconds old, reported accuracy at
most 100 m) or explicitly confirms a stop. Concurrent/repeated replans share a
60-second exclusion window, including failures; equivalent routes are not swapped.
New alternatives require an explicit choice and carry a visible reason. Failure
leaves original directions available. Location is held only for the active request/
bounded journey session, with no analytics or persistent rider tracking.

The M6 warm/navy/amber timeline gains live timing annotations and a compact
following panel. Boarding and alighting confirmations track progress locally;
exit guidance requires matched, live vehicle stop sequence and explicit onboard
confirmation. Completed legs stop generating current connection warnings. Only
selected-journey vehicles receive markers. Coordinate changes update those
markers without rebuilding the map, recentering it, or rerendering the itinerary.
One TanStack Query poll runs every fifteen seconds while detail is active and the
tab is visible; subscribers share requests. Query failure or local expiry removes
live claims immediately. Leaving detail cancels following subscriptions.

## Validation and measurements

Deterministic validation from an installed checkout:

```sh
pnpm test:live
pnpm live:benchmark
```

Targeted regression command (no live provider, OTP, or PostGIS dependency):

```sh
pnpm exec vitest run packages/realtime apps/api apps/web packages/router/src/geographic.test.ts workers/transit-ingest/src/geographic-planner.test.ts
```

Checks cover malformed/oversized protobuf and HTTP responses, timeout/outage/
recovery, partial feeds, vehicle-only/trip-only feeds, missing clocks, ambiguous
IDs, repeated stops, cancellation/skipping, source/entity ordering, bursts,
transfer allowances/uncertainty, client cancellation, cooldown/failure, browser
fallback/expiry, explicit following, and incremental marker lifecycle.

The synthetic 2,003-trip, 165,995-byte benchmark (50 iterations, local Windows)
measured median/p95 milliseconds: parsing **2.94/4.92**, normalization
**2.14/4.29**, overlay **3.91/6.74**, in-process live API **0.99/1.63**. API samples
use the tiny fixture repository; these are not DART-scale network/database SLAs.
Frontend tests verify one initial request and one per fifteen seconds, shared by
timeline subscribers, with none while hidden. Marker updates have local
Performance API instrumentation and a test proving marker reuse/removal and
unchanged map instance. Actual WebGL/device rendering cost was not measured:
no browser surface is connected in this environment.

Final affected regression: **257 tests passed across 20 files**; the final
walking-origin fix passed a focused 29-test rerun containing one additional
regression (**258 distinct passing tests**). Affected
realtime/shared/API/web typechecks, API/realtime/shared/web builds, targeted lint,
formatting, and `git diff --check` passed.
Windows sandbox child-process restrictions required escalation for Vitest and
Next's production build; no source workaround was used. Router semantics,
PostGIS behavior, and OTP integration were not changed; their external suites
were not rerun. GitHub CI remains the broad regression gate.

Optional authorized live smoke command, **not run here**, after building the API
and explicitly setting both authorization and smoke flags in a private env file:

```sh
node --env-file-if-exists=apps/api/.env apps/api/dist/live-smoke-cli.js
```

The smoke command reports only counts, timestamps, diagnostics, and timings; it
does not prove static ID compatibility, which still needs an authorized real-feed
comparison. Remaining limits: single-process/one-hour handles, one service-date
replanning, conservative combined freshness across separate feed products,
explicit-event predictions only, no experimental detour geometry/replacement
service, no unconfirmed automatic position, and no real DART or device smoke test.

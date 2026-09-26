# Geographic journey planning

> M9C supersedes the original milestone algorithm/limits described below. Current
> behavior is specified in [ADR 0005](adr/0005-routing-quality-and-pedestrian-evidence.md)
> and the [M9C review](MILESTONE_9C_REVIEW.md): four-objective labels, validated
> pedestrian links, total walking accounting, service-aware endpoint shortlists,
> up to six accepted endpoints per side, sixteen provider calls and 36 pair searches.
> The remaining text preserves the original milestone rationale and CLI history.

Milestone 4 composes pedestrian access, the existing schedule router, and pedestrian
egress. It adds no HTTP journey endpoint, transit UI, realtime, authentication,
cache, workspace, migration, or external dependency. Accepted ADRs and the
Milestone 3 transit algorithm are unchanged.

## Architecture

`packages/router` owns geographic request/result types, coordinate and walking
value validation, policy bounds, and synchronous `composeGeographicJourneys`.
It accepts already supplied pedestrian routes and calls its existing `route`
function. It imports no SQL, HTTP client, provider implementation, or Node service.

`workers/transit-ingest` extends the existing read-only schedule-validation adapter:

- `nearby-stops.ts`: date-selected PostGIS candidates.
- `walking-provider.ts`: provider-neutral contract, response validation, deadlines,
  and an explicitly selected fixture provider.
- `valhalla-walking.ts`: optional established-engine HTTP adapter using Node fetch.
- `geographic-planner.ts`: bounded asynchronous provider orchestration, diagnostics,
  and pure composition.
- `journey-cli.ts`: local validation only; it is not a server entrypoint.

The worker location follows Milestone 3's SQL adapter and CLI placement. It does
not make geographic planning part of ingestion or require a new workspace. Before
Milestone 5 wires this into a long-lived API, review the adapter ownership and
schedule-loading lifecycle. No API application imports were added here.

Typical application flow:

```ts
const loaded = await loadRoutingSchedule(db, {
  sourceKey: 'dart',
  serviceDate,
  changeSeconds,
});
if (loaded.status === 'loaded') {
  const result = await planGeographicJourney(loaded.schedule, request, {
    candidates: postgisCandidateSource(db, 'dart'),
    walkingProvider: valhallaWalkingProvider(configuredRouteUrl),
  });
}
```

`db` must be a dedicated idle client: each SQL loader owns its transaction.
The walking provider is injected. Omitting it yields a typed unavailable outcome.

## Requests, coordinates and results

`GeographicRequest` contains `origin`, `destination`, `serviceDate`,
`departureTime`, and optional `maxTransfers`. Each coordinate has numeric
`latitude` and `longitude`. Validation rejects non-finite values, numeric strings,
missing fields, latitude outside [-90,90], and longitude outside [-180,180].
Dates must be actual ISO calendar dates. Departure is a nonnegative signed-32-bit
integer service-day second, matching the existing schedule model.

Each `GeographicJourney` includes publication/date, both endpoint coordinates,
access/egress stop IDs, requested departure, final arrival, total duration,
boarding/transfer counts, walking duration/distance, interchange duration and
ordered machine-readable legs. A successful journey always contains at least one
transit leg. Legs preserve exact trip IDs, route IDs, occurrences, sequences and
scheduled times from Milestone 3, surrounded by timed `walk` legs with an
`access`/`egress` phase. No final UI instructions, vehicle IDs, risk scores or
realtime times are invented.

Walking values may be fractional. Access boarding readiness is
`ceil(requestedDeparture + providerDuration)` because departures are integer
seconds. The walk leg keeps the exact reported duration; rounding cannot make an
earlier departure catchable. Egress arrival is the scheduled alighting time plus
the reported duration, with no rounding or modulo. Ordinary floating-point decimal
representation applies; clients may format times without changing feasibility.

## Candidate lookup and publication coherence

The schedule loader first pins one activated publication/date. Candidate lookup
checks `feed_activation(source_key, service_date)` against that pinned ID in a
read-only repeatable-read transaction, then loads both endpoints in that snapshot.
Missing activation yields `no-publication`; a correction since schedule loading
yields `publication-changed`. Callers may reload deliberately; no automatic retry,
newest-feed fallback, cross-publication join, or activation change occurs. A later
activation change cannot mix records already pinned by the snapshot.

Candidate SQL uses parameters for every input. Only stop/platform records
(`COALESCE(location_type,0)=0`) are considered. Geography identifies plausible
stops, not whether a particular visit can board or alight; the core still enforces
service and occurrence restrictions.

The existing `stops_geom_idx` is a GiST index on SRID 4326 **geometry**. Casting
every stop directly to geography would not use that same expression index. The
query therefore uses `geom && envelope` first, followed by geographic
`ST_DWithin` for a meter radius and `ST_Distance` for meter ordering. PostGIS
documents the geometry/geography units and index behavior in
[ST_DWithin](https://postgis.net/docs/ST_DWithin.html).

Conservative envelopes use 110,000 meters per latitude degree, below WGS84's
minimum meridional degree length, and the cosine of the most poleward reachable
latitude to bound longitude. Pole-touching queries include all longitudes;
date-line queries split into two rectangles. These formulas only bound candidate
search, never compute walking distance or duration. Actual distance filtering and
returned distances come from PostGIS. Both edge cases have real PostGIS tests.

Results sort by geographic distance and `stop_id COLLATE "C"`, then apply the
candidate count limit. Names do not merge stops. The retained DART query plans use
`stops_geom_idx` and small heap candidate sets, not a whole-stop-table geographic
distance scan. Dense-area plans may combine the spatial bitmap with a publication
B-tree bitmap. Measured examples and exact coordinates are in the review.

## Walking interface and established provider

```ts
interface WalkingProvider {
  readonly id: string;
  route(
    request: {
      readonly origin: Coordinate;
      readonly destination: Coordinate;
    },
    signal: AbortSignal,
  ): Promise<unknown>;
}
```

`unknown` forces runtime validation rather than trusting an external JSON cast.
Validated results are `ok` with a `WalkingRoute`, `no-route`, or `unavailable`
with `not-configured`, `timeout`, `provider-error`, or `invalid-response`.
Routes contain both coordinates, `durationSeconds`, and `distanceMeters`.
Metrics must be finite, nonnegative and at most 2,147,483,647. Zero values are
allowed. Endpoint mismatch, malformed structure, invalid coordinates, strings in
numeric fields and invalid metrics are rejected. Results are copied, and raw
provider error bodies are not exposed. Geometry preservation is deferred.

Provider research on 2026-09-19 used primary documentation:

- [Valhalla](https://github.com/valhalla/valhalla) is an open-source engine. Its
  README explicitly documents the FOSSGIS public demo and fair-use expectations.
- [openrouteservice](https://api.openrouteservice.org/) documents an API-key
  requirement for its hosted API. No account or key was created.

The optional Valhalla adapter sends two locations with pedestrian costing and
explicit kilometer units; it validates locations, a single leg and consistent
summaries, then converts reported kilometers to meters. Six-decimal serialization
of returned input coordinates is accepted. Its documented path/connectivity
error codes 170, 171, 441 and 442 map to `no-route` on HTTP 400; other HTTP errors
remain unavailable. Ferry-containing results are rejected rather than labeled
pure walking. See the [Valhalla route API](https://valhalla.github.io/valhalla/api/route/api-reference/).

Configuration supplies the complete HTTP(S) `/route` URL, with no default endpoint,
embedded credentials or query string. Redirects are refused. Responses are bounded
to 1 MiB; the deadline covers reading the body as well as the initial response.
Node's built-in fetch and abort support are sufficient; no HTTP dependency is added.

The one live development example used the documented FOSSGIS demo with two
sequential requests and an identifying client header. No application was published,
no recurring polling was installed, and no street dataset was downloaded. This is
not a production hosting decision. A deployment needs an operated/authorized
service, its terms/quotas, map-data freshness, attribution and operational checks.
Provider snapping and map coverage do not verify a station entrance, platform,
accessibility, or time-dependent pedestrian access.

## Access, egress and initial boarding

For each origin candidate, request an actual provider route from the origin to
the stop. A confirmed unavailable path is discarded. The traveler's arrival at
the stop determines catchability. A six-minute walk starting at 08:00 cannot catch
08:04. No initial boarding buffer is introduced, and a stop's interchange allowance
does not apply to that first boarding.

For each destination candidate, request the directed route from the stop to the
destination. It is not the reverse of a destination-to-stop route. Add its duration
after the scheduled alighting. A later alighting can win final arrival when its
egress is shorter. Providers are assumed time-independent in this milestone;
opening hours or time-dependent pedestrian restrictions would need a richer contract.

No new inter-stop walking transfers are generated. Existing supplied M3 interchange
links and same-stop change allowances remain intact. A supplied interchange link
has duration but no certified pedestrian distance/mode. Consequently
`walkingDurationSeconds` and `walkingDistanceMeters` total the provider-reported
access/egress legs; `interchangeDurationSeconds` reports those legacy links
separately. They are not silently relabeled measured walks. DART supplies no such
links through the current loader. Walking-only journeys are not supported; pairs
with identical boarding/alighting stops are skipped.

## Composition, dominance and ranking

After walking validation, search every distinct-stop pair within the explicit
candidate product budget. Each pair reuses the same immutable schedule and the
unchanged M3 round-based router. Append walks only after that pair's transit search.

This separation is essential: an earlier label reached through a long access walk
must not erase another origin candidate that reaches the same transfer later with
less walking and catches the same onward vehicle. Likewise, destination candidates
must compete only after their different egress durations have been added. Named
tests cover both counterexamples.

For a **fixed pair**, access/egress walking is constant and adding fixed egress time
preserves transit arrival ordering. Thus M3's arrival/boarding dominance is safe
for the criteria implemented here. This argument does not extend to newly generated
walking transfers, trip-specific rules, or time-dependent walking. Ranking those
would require richer core labels; this implementation deliberately does not claim
that appending such costs later would be correct.

Compose the pair results, then discard only journeys dominated across final arrival,
transfer count and walking duration. A later journey can remain useful if it saves
transfers or walking. Sort by:

1. Earliest **final** arrival.
2. Fewer transit transfers.
3. Lower access-plus-egress walking **duration**.
4. Stable code-unit ordering of access/egress IDs and serialized exact legs.

Distance is reported but is not a second walking score. Equivalent metric tuples
keep one deterministic representative. Apply the result limit after ranking.
There is no weighted score or fabricated transfer-risk criterion.

## Bounds and concurrency

Defaults and safety ceilings are validated together in `geographicPolicy`:

| Policy                    | Default | Maximum |
| ------------------------- | ------: | ------: |
| Radius, meters            |   1,200 |   5,000 |
| Access candidates         |       4 |      16 |
| Egress candidates         |       4 |      16 |
| Provider calls            |       8 |      32 |
| Concurrent provider calls |       2 |       8 |
| Per-call timeout, ms      |   5,000 |  30,000 |
| Transit searches          |      16 |     256 |
| Returned journeys         |       3 |      10 |
| Transit transfers         |       3 |       8 |

Radius/count/time budgets must be positive integers; transfers may be zero.
Candidate sum must fit the provider-call budget and candidate product must fit the
transit-search budget. Inconsistent configuration throws before I/O. Limits are
not silently truncated to favor arbitrary pairs. Spatial candidate limits do
restrict completeness: a useful stop outside the radius/top-N set is not searched.

The provider work queue preserves input order in its output regardless of response
order. On timeout, it aborts and starts no more queued calls, because an uncooperative
provider might still be running. Remaining jobs are reported unavailable. Existing
in-flight calls finish or time out within their own deadlines. Providers must honor
the abort signal. There are no automatic retries, caches or Redis integration.

## Failures and metrics

Normal no-journey reasons distinguish missing/changed publication, unloaded date,
no nearby access/egress, no reachable access/egress, transit unreachable, and provider
unavailable. If a failed provider could hide a viable connection, the outcome does
not claim proven transit unreachability. Surviving journeys carry `incomplete: true`
when another candidate failed. The result includes typed per-candidate attempts.
Invalid requests/configuration/candidate contracts throw; unexpected database faults
also propagate rather than masquerading as empty service.

Metrics separate origin/destination SQL lookup, candidate counts, actual provider
calls and individual/batch elapsed times, transit-search count, pure composition
time, and total planning time. Schedule loading is reported separately by the CLI.
Composition includes transit search, reconstruction and ranking; it is not a
measurement of just the pattern scan. Fixture SQL times are zero because no SQL
runs. No elapsed-time thresholds make tests flaky.

## Local validation

```sh
pnpm test:journey
pnpm test:router
pnpm journey:validate --help
pnpm journey:validate --mode fixture --origin '32,-96' --destination '32.01,-96' --date 2026-09-18 --departure 08:00:00 --runs 100
pnpm infra:up
pnpm test:integration
pnpm journey:validate --mode candidates --origin '32.7812,-96.8056' --destination '33.0024,-96.7029' --date 2026-09-18 --departure 08:00:00 --change-seconds 120 --runs 5 --explain
pnpm infra:down
```

Fixture mode is fully artificial and offline; only its recorded coordinates have
fixture candidates. Candidate mode reads the retained activation and reports
stop-to-stop transit separately, assuming the rider is already at each access
stop at departure. It never presents those results as complete walking journeys.
`--explain` runs read-only query plans with actual timing.

For an authorized Valhalla service, configure `WALKING_VALHALLA_URL` or pass its
complete `/route` URL with `--valhalla-url`. Then use `--mode provider`, explicit
coordinates/date/departure and `--change-seconds`. This mode allows exactly one
run with no warm-up/retry. Select counts and concurrency appropriate to the
service's permitted use; the live review example used one candidate at each end
and concurrency one. Without an endpoint it reports unavailable configuration
and exits nonzero (underlying CLI exit 2). It never falls back to a fixture.

## Evidence and future boundary

The [Milestone 4 review](MILESTONE_4_REVIEW.md) records exact test counts, coordinates,
publication, candidate distances, live walking values and measured timings. Unit
tests use synthetic schedules, explicit route tables, mocked fetch and controlled
promises/fake timers. PostGIS tests use uniquely named databases and preserve the
normal volume. No unit test needs a network, DART feed or provider credential.

Service days remain explicit; walking across midnight never wraps time. Civil-time,
DST conversion and adjacent-date stitching remain deferred. Other limits include
provider geometry, direct walking, generated pedestrian transfers, verified DART
platform access, station policy, wheelchair guarantees and public hosting/data-use
decisions. Milestone 5 HTTP endpoints, API rate limits, cancellation across the full
request lifecycle and schedule reuse are future work. This milestone does not begin
them or change an accepted ADR.

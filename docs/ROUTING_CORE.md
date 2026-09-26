# Schedule routing core

> M9C supersedes the original milestone algorithm/limits described below. Current
> behavior is specified in [ADR 0005](adr/0005-routing-quality-and-pedestrian-evidence.md)
> and the [M9C review](MILESTONE_9C_REVIEW.md): four-objective labels, validated
> pedestrian links, total walking accounting, service-aware endpoint shortlists,
> up to six accepted endpoints per side, sixteen provider calls and 36 pair searches.
> The remaining text preserves the original milestone rationale and CLI history.

Milestone 3 implements stop-to-stop scheduled journeys in `packages/router`.
The package has **no production dependencies**. It owns the immutable schedule,
pattern indexes, boarding rounds, predecessor records, machine-readable journeys,
and deterministic ordering. It does not access SQL, HTTP, UI, realtime, geometry,
or raw feeds. All accepted ADRs remain unchanged.

The algorithm follows the round-based structure of
[RAPTOR](https://www.microsoft.com/en-us/research/publication/round-based-public-transit-routing/):
mark improved stops, scan affected patterns, propagate interchange links, and
repeat for another boarding. Its trip scans deliberately trade some speed for
correctness without a non-overtaking invariant.

## Public interface and input

```ts
import { buildSchedule, route } from '@dallas-transit/router';

const schedule = buildSchedule({
  publicationId: 'synthetic-v1',
  serviceDate: '2026-09-18',
  activeServiceIds: ['weekday'],
  stops: [
    { id: 'A', changeSeconds: 0 },
    { id: 'B', changeSeconds: 0 },
  ],
  trips: [
    {
      id: 'bus-1',
      routeId: 'line-1',
      serviceId: 'weekday',
      events: [
        {
          stopId: 'A',
          sequence: 10,
          arrival: 87300,
          departure: 87300,
          pickup: 0,
          dropOff: 0,
        },
        {
          stopId: 'B',
          sequence: 30,
          arrival: 91800,
          departure: 91800,
          pickup: 0,
          dropOff: 0,
        },
      ],
    },
  ],
});
const result = route(schedule, {
  serviceDate: '2026-09-18',
  originStopId: 'A',
  destinationStopId: 'B',
  departureTime: 87300,
  maxTransfers: 0,
});
```

All IDs are strings scoped to `publicationId`. The caller must supply one coherent
publication; the builder cannot detect a caller mixing source records while
claiming one publication. Journeys carry the publication and service date so raw
IDs are never interpreted as globally stable. Pattern IDs also belong only to
this built view and must not be used as durable cross-date identifiers.

Input contains stops with an explicit boarding-change allowance, trips with route
and service references, and ordered stop events with original sequence numbers,
arrival/departure seconds and pickup/drop-off flags. Optional directed transfer
links contain only IDs, stop endpoints, and durations. There are no coordinates,
shapes, display strings, calendars, vehicle identities, or scores in this model.

`buildSchedule` validates IDs, references, unique stop/trip/link identities,
nonnegative integer times/durations, increasing sequences, chronology, and
permissions. Each trip needs at least two visits. Invalid input throws; a normal
unreachable request does not. Inactive input trips are validated, then omitted.
The builder copies and freezes nested arrays/records. Internal lookup maps live
in a private WeakMap, because freezing a JavaScript Map does not prevent mutation.
Use the builder rather than constructing or deserializing `RoutingSchedule` by
hand. Each query creates its own labels and never changes the schedule.

## Service dates and time

The input explicitly lists service IDs operating on exactly one ISO service date.
Calendar expansion belongs to the loader, so pure unit tests need no database or
timezone conversion. Querying a different date returns `service-date-not-loaded`.
An activated publication with no active trips returns `no-service`.

Times reuse Milestone 2's nonnegative signed-32-bit integer service seconds.
`24:15:00 = 87300`, `25:30:00 = 91800`, and `26:06:00 = 93960`. They never wrap or
become ordinary clock times. Arrival may precede departure at the same visit
(dwell); known values must remain chronological along the trip. Null event times
are preserved without interpolation: null departure cannot board, null arrival
cannot alight, but the rider can remain on the trip through such visits.

This API requests a **service date**, not an instant. Converting civil timestamps,
DST handling, prior-day lookback, and combining trips from adjacent service dates
are deferred. A single date can still route its own service beyond midnight.

## Pattern equivalence and overtaking

Trips share a pattern exactly when they have the same publication-local route ID
and the same ordered `(stopId, pickup, dropOff)` tuples. Repeated stop IDs remain
separate positions. Source sequence numbers need not match between trips; their
relative order must match. Times, service IDs, direction labels, and shapes are
not part of equivalence. Different branches, loops, restrictions and reverse
sequences separate patterns. `route_id` or `direction_id` alone is insufficient.

Trips and pattern keys are canonically sorted using code-unit ordering, independent
of locale or database row order. Pattern IDs are numbered after sorting keys.
The stop-to-pattern index contains each pattern once per physical stop; scanning
still visits every occurrence in every trip.

**No non-overtaking assumption is made.** Every trip of a marked pattern is scanned
once per round. For each trip, remember its first feasible boarding position and
consider every subsequent allowed alighting. Boarding earlier on that same trip
can reach every later occurrence that boarding further along could reach, so a
second on-board state for that trip is unnecessary for the current criteria.
This relies on unrestricted stay-on-board travel between visits and stop/time-only
transfer rules. Trip-specific transfer eligibility would need a richer state.

A later-departing trip may win at the destination while the earlier trip wins at
an intermediate stop; both are scanned. We do not build a graph of stop-time
events, choose only the first departure, or silently split on an unproven trip
ordering invariant.

## Rounds, labels, and dominance

1. Round 0 contains only the origin at the requested time, with zero boardings.
2. Round `k` boards from the previous round's improved labels. It adds exactly one
   ride, so `k` means `k` boardings and `k - 1` transfers.
3. Scan only patterns touching previously improved stops, once each. Read boarding
   labels exclusively from the previous round; write alighting improvements into
   the current round. This prevents taking two rides in one round.
4. After transit scanning, relax the supplied directed interchange links to closure
   within the current round. Links do not add boardings. The next round can board
   at the reached stop only after arrival plus that stop's `changeSeconds`.
5. Stop when no labels improve or `maxTransfers + 1` rounds have run.

`best[stop]` records the earliest time reached after transit in any completed/current
round. Only strict improvements survive. Earlier arrival using fewer or equal
boardings dominates later arrival because a traveler can wait, and eligibility
depends only on stop/time and the fixed change allowance. Equivalent arrivals in
later rounds are discarded, preserving the option with fewer transfers.

One subtle exception: the initial origin label does **not** seed this dominance
array. Links are unavailable before the first ride, so a later transit return to
the origin can unlock an interchange link. These two states have different
permissions. An exhaustive test found this case; a named regression covers it.

The query's earliest-arrival labels can improve to smaller values as better paths
are found. Along an individual reconstructed path, times must never decrease.
These are different invariants; label improvement itself is not a time reversal.

## Transfers and geographic boundary

Same-stop interchange is explicit through each stop's required `changeSeconds`.
Zero is permitted for fixtures that deliberately model instantaneous interchange.
This allowance applies before every boarding after the first, including boarding
after an explicit link; it does not delay the initial boarding or final arrival.

Directed links represent supplied, compatible transit-stop locations only. Their
duration is separate from the destination stop's boarding-change allowance. Link
chains use FIFO label relaxation, with strict improvement to terminate zero-time
cycles. The model requires no transitive closure from the caller. Links are only
usable between rides: no initial access, final egress, walking-only result, or
arbitrary-coordinate routing is implemented. Destination alighting labels are
tracked separately from link reachability so a link reaching the destination
earlier cannot suppress a valid transit arrival.

The current DART adapter supplies no inter-stop links and never merges stops by
name, coordinates, station labels, or supplemental facilities. It requires an
explicit uniform change-time scenario. The review uses **120 seconds**, an
integration assumption, not a measured or guaranteed platform transfer. The feed
alone cannot establish actual station circulation. Geographic transfer generation
and validated station policy belong to later work.

## Restrictions and path reconstruction

Only permission `0` can board/alight. `1` is prohibited; `2` and `3` require
arrangements and are excluded from ordinary journeys until that workflow exists.
The adapter applies GTFS's null/blank default of `0`. It preserves the distinctions
between all four values. These meanings come from the
[GTFS stop-times reference](https://gtfs.org/documentation/schedule/reference/#stop_timestxt).
Restrictions are occurrence-specific, so a later allowed visit remains usable.
Riding through a restricted visit is permitted.

Each improved label owns a predecessor reference and the exact leg creating it.
Predecessors are never mutated when the stop's best label changes. Reconstruction
walks those references backward and reverses the result. Alighting is evaluated
before boarding at the same occurrence, ensuring strictly increasing positions
even if two visits have equal seconds.

Transit legs include trip/route/pattern IDs, boarding/alighting stop IDs, zero-based
occurrence indexes, original sequence numbers, and departure/arrival seconds.
Interchange links produce structured transfer legs with their IDs, endpoints and
times. Same-stop waiting/change allowances appear as gaps between transit legs;
they do not need synthetic walking legs. Journey metadata includes publication,
date, requested departure, arrival, boardings, transfers, and duration including
initial and connection waiting. No rider-facing instruction text is generated.

## Results, ranking, and bounds

`status: 'ok'` contains the nondominated arrival/boarding alternatives: at most one
strictly improved destination arrival per round. Journeys sort by earliest arrival,
then fewer transfers. Equal-cost choices use canonical pattern, trip, occurrence,
and link scan order, making results independent of input order. This is a stable
tie-break, not a claim to globally minimize trip IDs or departure time. Dominated
or identical-metric alternatives are not enumerated.

`DEFAULT_MAX_TRANSFERS = 3` permits four rides, a bounded starting policy for local
journeys. It is an exported and overridable default, not an algorithm constant.
Zero means direct rides only. Limits must be nonnegative safe integers whose
boarding count is also safe. The default returns at most four alternatives.
No fabricated walking or risk metrics are present. Adding those criteria or
trip-pair rules may require multiple labels per stop/round; append-only score
fields cannot make the current dominance rule support new criteria automatically.

`status: 'no-journey'` distinguishes `unknown-stop`, `service-date-not-loaded`,
`no-service`, and `unreachable`. The latter includes disconnected stops, late
requests, impossible connections, restrictions, and transfer limits. It does not
claim which constraint was decisive without a second unbounded search. A known
origin equal to destination returns an immediate zero-leg journey, even without
service. Invalid dates, seconds, bounds or schedules throw validation errors.

## SQL adapter and developer validation

`workers/transit-ingest/src/routing-schedule.ts` owns SQL adaptation. It uses the
existing `pg` dependency and the router's public package exports. Its dedicated
client must be idle; the loader owns a read-only repeatable-read transaction.
It selects `feed_activation` by logical source/date, evaluates the existing
`service_is_active` function once per service ID, and loads only those trips.
Calendar exceptions override weekly service, including exception-only additions.
No newest-feed fallback or activation mutation occurs.

A SQL cursor fetches event rows in batches of 5,000 ordered by trip and sequence.
No geometry, shapes, fares, headsigns, source JSON, or raw CSV is loaded. The final
schedule is in memory; this is not an ingestion-sized streaming router. Preparation
reports extraction/build/total milliseconds, counts and process memory snapshots.
Snapshots include adapter/runtime objects and are neither peak memory nor a
measurement of the schedule alone. No cache or database migration is added.

```sh
pnpm test:router
pnpm infra:up
pnpm test:integration
pnpm routing:validate --date 2026-09-18 --change-seconds 120 --runs 5 --query '22749,26895,08:00:00' --query '32562,32553,08:00:00' --query '22749,26897,24:00:00' --query '32095,15882,24:00:00'
pnpm infra:down
```

Those IDs/dates require the retained Milestone 2 recent publication and activation.
Quote each comma-delimited query, particularly in PowerShell. `--runs` times
repetitions after one explicit warm-up per query. `--help` explains arguments.
The CLI is local validation tooling, not an API endpoint or production service.

## Correctness evidence and performance

Handwritten fixtures assert exact legs for direct service, competing transfer
journeys, missed/catchable connections, change allowances, service selection,
overnight times, loops, permissions, null times, equal-time events, transfer chains,
overtaking, deterministic ties, unreachable outcomes and limits. Representation
tests cover malformed chronology, IDs, sequences and immutability.

An independent test-only exhaustive enumerator explores all board/alight pairs
up to three rides on 160 seeded tiny networks, at three departure times each.
Its link solver uses bounded Bellman-Ford relaxation; it has no pattern indexes,
round-label dominance or production code path. Pareto outputs are compared, and
every resulting itinerary is checked for continuity, chronology, exact scheduled
events, allowed service/permissions, increasing occurrences and correct counts.
This is inexpensive differential evidence, not a proof for every possible network.
PostGIS integration tests exercise the actual loader and publication transitions.
Real DART examples and observations are in [the review](MILESTONE_3_REVIEW.md).

Schedule storage is linear in trips/events/stops/patterns/links. Preparation groups
event tuples, sorts trip IDs and pattern keys, and builds stop indexes once. For
`K` boarding rounds and `E` events, transit scanning is at worst `O(K * E)` plus
marked-pattern sorting, rather than rescanning the network for each stop update.
FIFO link relaxation has label-correcting worst-case `O(V * F)` per round for `V`
stops and `F` links; it is intended for small explicit interchange networks here.
Query labels and predecessor records allocate only on improvements. No event graph
or SQL appears inside the routing loop. Larger generated footpath networks will
need profiling and possibly a different closure implementation in Milestone 4.

## Deferred boundaries

Milestone 4 owns geographic access/egress and walking-provider integration; this
change does not begin it. Future work includes civil-time/service-date selection,
reviewed station buffers, trip-specific/forbidden/timed transfers, stay-seated
interlining, conditional arrangements, frequency/Flex service, interpolation,
walking/risk-aware labels, API validation budgets, UI instructions, and realtime.
Existing importer rejection of unsupported GTFS files still applies. OpenTripPlanner
comparison remains Milestone 7; it is not a runtime dependency. Public travel use
still requires the product and data-permission work identified in earlier reviews.

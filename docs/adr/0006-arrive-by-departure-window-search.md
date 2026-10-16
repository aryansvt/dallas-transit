# ADR 0006 - Arrive-by planning through a departure-window search

## Status

Accepted. Extends ADRs 0002 and 0005 without changing them. Depart-at planning,
ranking and every M9C limit are unchanged.

## Context

`POST /v1/journeys` only answered "I leave at T, when can I arrive?". Riders also
ask "I must be there by T, when do I leave?". The answer must stay inside our own
router (ADR 0002), respect the M9C latency work (composition is the CPU hot spot,
roughly 0.8-1.0 s locally for the retained benchmark) and become the base for
later departure-time suggestions ("leave at 8:05 or 8:20").

A rider arriving by a deadline cares about the latest moment they can leave. The
textbook tool is a range query: for every departure in a window, what is the best
arrival? Range RAPTOR (rRAPTOR) answers that by running RAPTOR once per departure,
latest first, and keeping labels between runs. That is the departure-window
foundation. Running it over every departure in a two-hour window is too slow for
our multicriteria labels, though. Each run costs about one depart-at scan, and a
busy rail stop has twenty or more departures in two hours.

## Decision

Arrive-by uses two phases. Both live in `packages/router` and need no HTTP or
database.

### 1. Reverse latest-departure pass (`latestDepartures`)

A single-criterion, round-based scan runs backward from the egress stops. Each
egress stop is seeded with its own alighting deadline: the effective deadline
minus that stop's egress walk. Round `k` scans the trips of marked patterns from
their last visit to their first. A trip "reaches" once it passes a visit where the
rider can alight before that stop's deadline from round `k - 1`. Every earlier
visit where it can pick up then gives a candidate latest boarding time. Transfers
are mirrored exactly: arriving at a stop must leave its change allowance, a
pedestrian link is a single hop, legacy links chain only with legacy links, and
links are never used before the first ride or after the last. Departures before
the window start are ignored.

The output, per access stop and boarding count `k`, is `LD_k`: the latest
departure that can still reach some egress stop in time using at most `k` rides.
This is exact for time and boardings. It does not build journeys, so walking and
transfer risk are not its concern. One pass covers every access stop. When an
access stop is also an egress candidate, that access gets its own pass without
itself as a target, matching the forward search, which never routes a stop to
itself.

### 2. Forward departure-window search (`routeWindow`)

`routeWindow` is range RAPTOR over a supplied set of departure instants. It runs
the existing multicriteria rounds once per departure, latest first. It shares the
per-stop label bags and destination bags across runs. A label found from a later
departure stays valid for an earlier one, because the rider can wait at the
origin. So an earlier run keeps only labels that beat everything found from later
departures. An optional arrival deadline drops labels that arrive too late. After
each run, the destination labels that run added become profile entries. Each
entry's departure is its first boarding time. A final filter keeps the Pareto
profile over (later departure, earlier arrival, fewer boardings, less walking,
lower risk).

For arrive-by, each access stop's departure instants are its distinct `LD_k`
values, latest first. These are exactly the departures where the best answer for
some transfer count changes, so the forward search never spends a run on a
departure that cannot make the deadline. Depart-at planning calls the same search
with a single departure and no deadline. That is the same code path it always
used, so its results are byte-for-byte unchanged.

### Ranking

Arrive-by mirrors the locked order: latest departure from the origin, then fewer
transfers, less walking and lower scheduled risk. Arrival time breaks the final
tie. A journey that leaves earlier is kept only when it is better on transfers,
walking or risk. The three-result cap, same-ride deduplication and the reserved
fewer-transfer and less-walking slots work exactly as in ADR 0005.

### Budget

| Arrive-by policy                  |                           Value |
| --------------------------------- | ------------------------------: |
| Window before effective deadline  |                   2 h (7,200 s) |
| Departures scanned per access     | at most 4 (one per ride count) |
| Departures scanned per request    |       at most 24 (6 access x 4) |
| Reverse passes per request        | 1, plus 1 per access that is also an egress stop (at most 7) |
| Arrival buffer                    |              0-60 min (API) |

Window and per-access departure limits are `GeographicPolicy` fields
(`arriveByWindowSeconds`, `maxWindowDepartures`). `routeWindow` itself refuses
more than 64 departures. All M9C limits (six access and six egress walks, sixteen
provider calls, 36 pair searches, three results) apply unchanged.

### Request semantics

- `arrivalTime` is service-day seconds, like `departureTime`. Exactly one of the
  two must be present.
- The effective deadline is `arrivalTime - arrivalBufferSeconds`. Arriving exactly
  at the deadline counts as on time.
- Each arrive-by journey's `requestedDepartureTime` is that journey's own latest
  leave time: first boarding minus access walk, rounded down to a whole second.
  Its duration therefore has no initial wait.
- One service date is searched, as in depart-at. Deadlines past midnight use the
  same date's 24:00+ service. The window is clamped at the start of the service
  day. An effective deadline before 00:00 returns no journey instead of reaching
  into the previous service date (adjacent-day stitching remains deferred, see
  ADR 0005).

## Alternatives considered

- **Full reverse multicriteria RAPTOR.** This is the classic arrive-by engine and
  needs one scan. It would also mirror every subtle rule of the forward engine:
  link states, the origin special case, onboard dominance and signature diversity.
  That doubles the correctness burden ADR 0002 already calls substantial. The
  reverse pass here is single-criterion and only chooses departure instants. Every
  returned journey still comes from the forward engine that the exhaustive oracle
  tests cover.
- **Dense rRAPTOR from the deadline backwards.** This is the simplest outer loop.
  But every departure between the deadline and the latest feasible one is a wasted
  full scan, and a fixed departure budget can run out before reaching a feasible
  departure.
- **Binary search with depart-at probes.** Arrival is monotone in departure time,
  so this is correct. It still costs about seven full compositions and finds only
  one answer per transfer count after more searching.
- **One multicriteria pass with departure time as a fifth label criterion.** This
  gives the same profile in one pass, but every bag holds one label per useful
  departure, so it costs about as much as dense rRAPTOR and touches the depart-at
  dominance rules.

## Consequences

Positive:

- arrive-by returns the latest-leaving journeys with fewer-transfer alternatives
- impossible deadlines are answered by one reverse pass, without forward work
- `routeWindow` accepts any departure set, so departure-time suggestions can scan
  a dense window later without a new engine
- depart-at behavior and its benchmark hash are unchanged

Negative:

- arrive-by journeys that take longer than the two-hour window are not found
- an earlier departure that only lowers scheduled transfer risk (more slack) is
  not scanned. Only transfer-count breakpoints are. Adding the departure just
  before `LD_k` is the upgrade path if riders want slack alternatives.
- the reverse pass is a second small scan to keep in step with forward transfer
  rules. A differential test against the forward engine on seeded random networks
  guards it.

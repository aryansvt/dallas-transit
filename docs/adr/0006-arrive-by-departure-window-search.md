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
foundation. Running it over every departure in a window is too slow for our
multicriteria labels, though. Each run costs about one depart-at scan, and a busy
rail stop has twenty or more departures in two hours.

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
links are never used before the first ride or after the last.

The output, per access stop and boarding count `k`, is `LD_k`: the latest
departure that can still reach some egress stop in time using at most `k` rides.
This is exact for time and boardings. It does not build journeys, so walking and
transfer risk are not its concern. The pass looks back to the start of the
service day, so the latest option is found however early it leaves. One pass
covers every access stop. When an access stop is also an egress candidate, that
access gets its own pass without itself as a target, matching the forward search,
which never routes a stop to itself.

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
departure that cannot make the deadline. The window is anchored at the latest
feasible departure over all access stops. An alternative may leave at most one
hour before it. Depart-at planning calls the same search with a single departure
and no deadline. That is the same code path it always used, so its results are
byte-for-byte unchanged.

### Ranking

Arrive-by mirrors the locked order: latest departure from the origin, then fewer
transfers, less walking and lower scheduled risk. Arrival time breaks the final
tie. A journey that leaves earlier is kept only when it is better on transfers,
walking or risk. The three-result cap, same-ride deduplication and the reserved
fewer-transfer and less-walking slots work exactly as in ADR 0005.

### Budget

| Arrive-by policy               |                                                        Value |
| ------------------------------ | -----------------------------------------------------------: |
| Latest departure search        |                         whole service day, from 00:00 |
| Alternative window             |                      1 h (3,600 s) before the latest leave |
| Departures scanned per access  |                               at most 4 (one per ride count) |
| Departures scanned per request |                                   at most 24 (6 access x 4) |
| Reverse passes per request     | 1, plus 1 per access that is also an egress stop (at most 7) |
| Arrival buffer                 |                                               0-60 min (API) |

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
  same date's 24:00+ service. No leave time is earlier than 00:00. An effective
  deadline before 00:00 returns no journey instead of reaching into the previous
  service date (adjacent-day stitching remains deferred, see ADR 0005).
- A later deadline never loses a journey an earlier deadline found.

## Measurements

These are local measurements on the retained `m9c_benchmark_20260926` DART
publication (Saturday service), with synthetic 300 s / 400 m walks and the
production API policy. Composition times are medians of five runs. They are
desktop evidence, not a capacity claim for the 0.5 CPU tier.
`node scripts/m9c-audit.mjs --perf` reproduces the benchmark pair and asserts the
latest leave against depart-at planning.

| Trip from the M9C origin  | Depart-at 08:00 | Arrive-by (deadline = depart-at arrival, +15 min, +45 min) |
| ------------------------- | --------------: | ---------------------------------------------------------: |
| M9C benchmark destination |         1296 ms |                                           15 / 12 / 14 ms |
| Downtown                  |         1419 ms |                                           15 / 14 / 62 ms |
| Love Field                |         1152 ms |                                           11 / 11 / 11 ms |
| Fair Park                 |          984 ms |                                           15 / 15 / 83 ms |
| Bishop Arts               |         1154 ms |                                           10 / 9 / 10 ms |
| White Rock Lake           |          961 ms |                                           46 / 67 / 47 ms |

The slowest arrive-by case seen was 113 ms: a 26:00 deadline after service ends,
which scans the whole evening and runs 8 window departures. Arrive-by is cheap
because every forward run starts at a departure known to make it and stops at the
deadline, while depart-at must explore until a destination bounds the search.

For every row the first journey's leave time was checked against depart-at
planning with the same candidates: leaving at that time arrives in time, and
leaving one second later does not. Depart-at output hashes are unchanged
(`a03748dc...385035`). An alternating old-versus-new depart-at A/B showed median
differences between -24 and +41 ms on roughly 940 ms, which is within run-to-run
noise.

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
- **A search window measured back from the deadline.** This was the first version
  of this design. On the retained data it broke monotonicity: with a Saturday
  service gap, a Love Field deadline 45 minutes later returned no journey even
  though 15 minutes later found one, because the only trip left more than two
  hours before the deadline. Anchoring the window at the latest feasible departure
  fixes this.
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
- arrive-by composition costs tens of milliseconds where depart-at costs about a
  second
- `routeWindow` accepts any departure set, so departure-time suggestions can scan
  a dense window later without a new engine
- depart-at behavior and its benchmark hash are unchanged

Negative:

- an alternative that leaves more than an hour before the latest option is not
  shown, even if it saves a transfer
- an earlier departure that only lowers scheduled transfer risk (more slack) is
  not scanned. Only transfer-count breakpoints are. Adding the departure just
  before `LD_k` is the upgrade path if riders want slack alternatives.
- the reverse pass is a second small scan to keep in step with forward transfer
  rules. A differential test against the forward engine on seeded random networks
  guards it.

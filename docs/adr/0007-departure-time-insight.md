# ADR 0007 - Departure-time insight from deadline searches

## Status

Accepted. Builds on ADR 0006 without changing it. Depart-at journeys, their
ranking and the M9C limits are unchanged.

## Context

A depart-at answer is exact for the time the rider typed, but that time is often
a guess. Leaving four minutes earlier can catch a connection that is otherwise
missed by a few seconds and save a whole headway. Leaving fifteen minutes later can
reach the same final ride when the rider would only wait at the first stop. Riders
want to hear both, as a short hint:

- "Worth leaving earlier: depart 3:58 PM instead of 4:05 PM, arrive 18 min sooner"
- "No need to rush: leaving 8 min later arrives at nearly the same time"

The hint is secondary. It must never replace or reorder the main journeys, never
point at a time that has passed, and must stay cheap next to a depart-at search
that already costs about a second of CPU (ADR 0006, M9C).

## Decision

### Rules

After a successful depart-at composition, `departureInsight` in `packages/router`
compares the rider's requested departure `T` with the first journey's arrival
`A0` (the earliest arrival, since depart-at ranks arrival first). It returns at
most one insight:

1. **Leave earlier.** Find the latest leave time `E` whose journey arrives by
   `A0 - MIN_EARLIER_SAVING_SECONDS`. Suggest it when `T - E` is at most
   `MAX_EARLIER_SHIFT_SECONDS`.
2. **No need to rush.** Otherwise, find the latest leave time `L` whose journey
   arrives by `A0 + NEAR_SAME_ARRIVAL_SECONDS`. Suggest it when `L - T` is at
   least `MIN_LATER_SHIFT_SECONDS`.

A suggestion is dropped when its leave time is before `now` (service-day seconds,
a required argument) or before the request's optional `earliestDepartureTime`.
Leave earlier wins when both apply, because it changes the arrival and no-rush
does not. Rule 1 is skipped when its deadline would fall before 00:00.

`planGeographicJourney` calls it after the main composition when its caller
supplies `now`. Without `now` there is no insight.

Rule 1 suggests the smallest shift that is worth it, not the largest saving. A
rider asked to leave "a few minutes earlier" should hear the least disruptive
option. Both searches return the latest leave, so when that one is in the past,
too far back or before the earliest allowed time, every other qualifying leave is
too. No second search is needed to rule them out.

### Guardrails

| Constant                     | Start value | Meaning                                         |
| ---------------------------- | ----------: | ----------------------------------------------- |
| `MIN_EARLIER_SAVING_SECONDS` |   600 (10 m) | leaving earlier must arrive at least this sooner |
| `MAX_EARLIER_SHIFT_SECONDS`  |   900 (15 m) | and leave at most this much earlier             |
| `NEAR_SAME_ARRIVAL_SECONDS`  |    120 (2 m) | no-rush arrives at most this much later         |
| `MIN_LATER_SHIFT_SECONDS`    |    300 (5 m) | no-rush must let the rider leave this much later |

They are exported router constants, not request or deployment policy. Changing
one is a product decision with tests, not a configuration knob.

### Search

Each rule is one arrive-by composition (ADR 0006) with a deadline: `A0 - 600` for
rule 1 and `A0 + 120` for rule 2. It reuses the depart-at walking candidates, so
the insight makes no provider calls and needs no database access. The arrive-by
search already answers "what is the latest I can leave and still arrive by D?"
exactly, with one reverse pass and at most 24 window departures, so the insight
adds no new engine. Its leave times include the arrive-by boarding margin
(`BOARDING_MARGIN_SECONDS`, ADR 0006), so a suggested time gets the rider to the
first stop two minutes before the vehicle leaves.

Fractional walks make `A0` fractional. Deadlines are rounded down, so a
suggestion never saves less than the minimum or arrives later than the near-same
window allows.

### Contract

`POST /v1/journeys` accepts an optional `earliestDepartureTime` (service-day
seconds) with `departureTime` only. It limits suggestions and nothing else; a
caller can later fill it with "class ends at 4:00". An `ok` depart-at response may
carry:

```json
"departureInsight": {
  "kind": "leave-earlier",
  "departureTime": 57480,
  "arrivalChangeSeconds": -1080
}
```

`departureTime` is the suggested leave time in service-day seconds.
`arrivalChangeSeconds` is the arrival when leaving then, minus the first
journey's arrival: negative means sooner. Clients build the copy from these, the
request's `requestedDepartureTime` and their own clock formatting. The server
sends no prose. Arrive-by responses never carry an insight, since they already
answer when to leave.

The API derives `now` from its clock and the service date in America/Chicago. A
past service date therefore never gets an insight.

### Budget

At most two arrive-by compositions run per depart-at request: rule 2 runs only
when rule 1 found nothing to suggest. Each one is bounded by ADR 0006 (one reverse
pass plus one per access stop that is also an egress stop, at most 24 window
departures). The planner also stops the insight after
`DEPARTURE_INSIGHT_BUDGET_MS` (250 ms) of wall time, checked after each access
stop, and returns the main result without it. The cost is reported as
`insightMs` in planner metrics and request logs, separate from `compositionMs`.

## Alternatives considered

- **Dense range RAPTOR over every departure in T - 15 min to T.** This finds the
  largest saving rather than the smallest worthwhile shift. A busy stop has ten or
  more departures in fifteen minutes, so six access stops can mean sixty forward
  runs before any deadline prunes them. The deadline searches answer the stated
  rules exactly for a small fraction of that work.
- **Return the alternative journey in full.** The client would need its stop,
  route and trip references too, which grows the response for a hint. A client
  that wants the journey can plan again with `departureTime` set to the suggested
  time.
- **Server-written copy.** Times need the rider's clock format and locale, which
  the client already owns. The API has never sent UI prose.
- **Insight for arrive-by.** The main arrive-by answer already is the latest leave
  time, so there is nothing to suggest.

## Consequences

Positive:

- riders hear about a missed connection or a needless rush without losing the
  journey they asked for
- the insight reuses arrive-by end to end and adds no routing engine
- the main journeys are computed before and independently of the insight, so
  depart-at output is unchanged
- `earliestDepartureTime` is ready for schedule-aware suggestions later

Negative:

- rule 1 can suggest a small shift that saves 10 minutes when a slightly larger
  shift would save 25. Scanning the departures between `E - 1` and
  `T - MAX_EARLIER_SHIFT_SECONDS` is the upgrade path
- each depart-at request pays up to two arrive-by searches when `now` is known
- under heavy CPU load the wall-time budget can drop an insight that would have
  been shown, so its presence is not deterministic in production

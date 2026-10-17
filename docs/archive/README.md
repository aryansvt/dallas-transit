# Milestone archive

Review notes written as each milestone landed. They record what was measured,
tested and left open at that point, so they are useful when you want to know why
something works the way it does.

They are snapshots. A status line inside one ("human review is pending", "local
and uncommitted") describes the day it was written. Every milestone below has
since merged. When an archived note and a maintained doc in [`docs/`](..)
disagree, the maintained doc is current.

| Milestone | Notes                                                                          | Date       | PR                                                        |
| --------- | ------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------- |
| M2        | [Static GTFS ingestion](MILESTONE_2_REVIEW.md)                                 | 2026-09-18 | [#3](https://github.com/aryansvt/dallas-transit/pull/3)   |
| M3        | [Routing core](MILESTONE_3_REVIEW.md)                                          | 2026-09-19 | [#4](https://github.com/aryansvt/dallas-transit/pull/4)   |
| M4        | [Geographic journey planning](MILESTONE_4_REVIEW.md)                           | 2026-09-19 | [#5](https://github.com/aryansvt/dallas-transit/pull/5)   |
| M5        | [Journey API](MILESTONE_5_REVIEW.md)                                           | 2026-09-20 | [#6](https://github.com/aryansvt/dallas-transit/pull/6)   |
| M6        | [Mobile web design](MILESTONE_6_DESIGN.md) and [review](MILESTONE_6_REVIEW.md) | 2026-09-24 | [#7](https://github.com/aryansvt/dallas-transit/pull/7)   |
| M7        | [OpenTripPlanner comparison](MILESTONE_7_REVIEW.md)                            | 2026-09-24 | [#8](https://github.com/aryansvt/dallas-transit/pull/8)   |
| M8        | [Live trip intelligence](MILESTONE_8_REVIEW.md)                                | 2026-09-25 | [#9](https://github.com/aryansvt/dallas-transit/pull/9)   |
| M9A       | [Production providers](MILESTONE_9A_REVIEW.md)                                 | 2026-09-25 | [#10](https://github.com/aryansvt/dallas-transit/pull/10) |
| M9B       | [Production deployment](MILESTONE_9B_REVIEW.md)                                | 2026-09-25 | [#11](https://github.com/aryansvt/dallas-transit/pull/11) |
| M9C       | [Routing quality](MILESTONE_9C_REVIEW.md)                                      | 2026-09-26 | [#12](https://github.com/aryansvt/dallas-transit/pull/12) |
| M9C       | [Warm-routing latency fix](M9C_LATENCY_HOTFIX.md)                              | 2026-09-26 | [#13](https://github.com/aryansvt/dallas-transit/pull/13) |

Milestone 0 (data feasibility) lives on as [DATA_FEASIBILITY.md](../DATA_FEASIBILITY.md).
Milestone 1 (repository and local infrastructure) is described in
[DEVELOPMENT.md](../DEVELOPMENT.md). Later features are recorded in ADRs
([index](../adr/README.md)) rather than milestone notes.

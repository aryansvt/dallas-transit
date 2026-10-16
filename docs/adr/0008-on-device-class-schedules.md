# ADR 0008 - On-device class schedules and verified campus places

## Status

Accepted. Applies ADR 0003 (no accounts) to student schedules. Uses the arrive-by
search (ADR 0006) and departure-time insight (ADR 0007) without changing them.

## Context

Students already have their class schedule in a calendar file. Asking them to
retype "Tuesday 10:00 in ECSW 1.315" every time is the opposite of "tell me
exactly how to get there". The schedule is personal data: where someone will be,
every week, for a semester. It must not leave the device or need an account.

UT Dallas is the first campus. Room locations look like `ECSW 1.315` or
`JSOM 2.106`. A trip needs a coordinate, and a building's centroid can be a long
walk from any door, so the destination should be an entrance.

## Decision

### Schedule import stays in the browser

The web app reads an `.ics` file with the File API and parses it in
`apps/web/src/lib/ics.ts`. The raw file is never stored or sent anywhere. Only
the parsed classes (title, location, weekly pattern) are kept in `localStorage`
under `dallas-transit.schedule.v1`. A trip request carries only what any trip
carries: origin and destination coordinates and a time.

The parser is in-house. It covers the subset that schedule exports use:

- `VEVENT` blocks with RFC 5545 line folding, parameters and text escapes
- `DTSTART` and `DTEND` (or a simple `DURATION`) as `TZID=America/Chicago` local
  time, UTC (`Z`), or floating time read as Dallas time. `Central Standard Time`
  and `US/Central` are accepted as aliases. Other zones and all-day events are
  skipped and counted, never guessed.
- `RRULE` with `FREQ=WEEKLY`, `BYDAY`, `INTERVAL`, `UNTIL` and `COUNT`. Other
  frequencies are skipped and counted.
- `EXDATE` (several lines, comma lists, zoned or UTC), `RECURRENCE-ID` overrides
  and `STATUS:CANCELLED`

Classes are stored as Dallas wall-clock times, not instants, so a 10:00 class is
still at 10:00 after daylight saving time changes. A full iCalendar library would
add a dependency for features no schedule export uses (time-zone rule tables,
monthly rules, alarms, journals) and still need this wall-clock model on top.

Limits: 1 MB per file, 500 events, 80 stored classes and occurrence scans of at
most 400 days. A corrupt or oversized stored value reads as "no schedule", like
`local-places.ts`.

### Next class trips

The planner finds the next class within 14 days. "Plan trip" sets the class
building's entrance as the destination and an arrive-by time at the class start
with a 10-minute buffer (`CLASS_BUFFER_MINUTES`), then searches. The origin is
the current one, or the Home preset when there is none.

When a depart-at search starts during a class, the request carries the class end
as `earliestDepartureTime`, so departure-time insight never suggests leaving in
the middle of it. Arrive-by requests cannot carry it (ADR 0007), so a next-class
trip planned during class can still leave before that class ends.

The web planner gains what this needs: an "Arrive by" option with a buffer in the
departure sheet, parsing of arrive-by responses, and the departure-time insight
shown under the results with a one-tap "leave at" action.

### Verified coordinates only

`apps/web/src/lib/utd-buildings.ts` lists building codes and official names from
the UT Dallas campus map (map.utdallas.edu, which embeds Concept3D map 1772). A
building gets a coordinate only from that map's "Accessible Doors" layer, which
places real entrances. The primary entrance is the lowest-numbered automatic door
operator, else the lowest-numbered ramp entrance. Every entrance records its map
location id. A building with no entrance on the official map has no coordinate:
the app names the building and asks the rider to pick the destination.

`apps/web/src/lib/student-places.ts` holds quick destinations with a source for
each: official campus maps for UT Dallas, SMU and Northside, and DART's published
GTFS stops for stations and airports. A place without an official coordinate is
left out rather than estimated.

### Presets

Home and School are named presets in `dallas-transit.presets.v1`, separate from
saved places so neither list's limit or versioning affects the other.

## Consequences

Positive:

- a student can import once and plan "next class" in one tap
- no schedule data reaches our servers, and the import works offline
- every campus coordinate can be traced to an official record

Negative:

- schedules with monthly rules, non-Dallas zones or all-day events import
  partially; the import summary says how many events were skipped and why
- buildings without an official entrance record need a manual destination
- coordinates are a snapshot (retrieved 2026-10-16) and need a refresh when the
  campus map or DART stops change
- adding a second campus means a second catalog with the same sourcing rule

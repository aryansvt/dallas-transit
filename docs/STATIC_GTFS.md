# Static GTFS storage and import

Milestone 2 implements schedule ingestion only. The worker uses the existing
PostgreSQL/PostGIS architecture; all accepted ADRs are unchanged. See
[development commands](DEVELOPMENT.md#static-gtfs-workflow) and the DART-specific
[feasibility findings](DATA_FEASIBILITY.md).

## Responsibilities

- `packages/gtfs`: CSV streaming, typed normalized input records, field validation,
  GTFS dates, and service-day times. It has no database dependency.
- `workers/transit-ingest`: local ZIP handling, provenance, explicit SQL migrations,
  transactional imports, diagnostics, activation, and the CLI.
- `packages/domain`: unchanged. The new types describe GTFS records; no stable
  cross-consumer domain interface is needed yet.
- `packages/router`: unchanged and independent. No network patterns, footpaths,
  journey search, HTTP endpoints, realtime state, or UI are implemented here.

## Publication identity and activation

`feed_versions.feed_id` is an internal UUID. Every source entity key and foreign
key includes this ID. Raw route, stop, trip, service, and shape IDs are strings
scoped to one publication. Route short names and publisher version labels are
not global identity keys.

An import is idempotent by `(source_key, archive_sha256)`. `source_key` identifies
the logical source (`dart` in the local workflow). SHA-256 covers the exact ZIP
bytes; a repackaged ZIP is a distinct publication even if its CSVs are equivalent.
The source URL, archive basename, ZIP member inventory/sizes/CRCs, publication
label, coverage, counts, diagnostics, maximum service seconds, and import duration
are retained. Reused version labels do not overwrite previous data.

Import only stages a complete publication. Activation is a separate transaction
that assigns an inclusive date range to that publication in `feed_activation`.
The primary key `(source_key, service_date)` allows at most one selection per
service date. Replacement updates only the requested dates. Adjacent versions and
earlier activation dates remain available, including the prior service date's
overnight trips. Future schedules can be imported and assigned future dates
without replacing today's schedule. No selection falls back to the newest feed.

Activation requires dates inside the declared `feed_info` coverage, or the bounds
of calendars/addition exceptions when declared coverage is absent. The CLI caps a
single activation at 3,661 dates to prevent accidental unbounded expansion. A
coverage interval does not claim every route runs every day; weekly calendars and
exceptions still determine service. Callers must use a service date, not a UTC
date inferred from an event timestamp. Scheduling refresh/downloads is deferred.

## Transactions and failures

All entity batches, derived shapes, checks, publication metadata, and successful
audit status commit in one transaction. Source/UTF-8/CSV/validation/SQL errors
roll back the entire publication. Existing activation is never modified by an
import. A fixed PostgreSQL advisory transaction lock serializes static imports,
activation, reset, and migrations, including concurrent duplicate imports.

`import_attempts` records an attempt before entity loading and records failure
after rollback. Failures before a ZIP has been opened/identified are CLI errors
and have no database attempt record. A process crash or lost database connection
may leave an attempt marked `running`; this is an audit limitation, not an active
or complete publication. PostgreSQL rolls back an interrupted transaction. Retry
the same archive safely. An uncertain commit outcome can be resolved using its
hash; attempt status is never the authority for activation.

Migrations are numbered SQL files with a checksummed ledger. Line endings are
normalized for cross-platform checksum comparison. Existing applied migrations
must not be edited. `reset-static-data` truncates imported data and audit history
while retaining the schema, PostGIS extension, migration ledger, and Docker volume.

## Schema and access paths

All data tables live in `static_gtfs`; the migration ledger lives in `public`.

| Tables                                                | Purpose / keys                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `feed_versions`, `import_attempts`, `feed_activation` | Provenance, audit, explicit service-date publication selection                                                            |
| `agencies`, `routes`, `stops`                         | Source agency/route/stop identity and display fields; `(feed_id, source ID)` primary keys                                 |
| `services`, `calendars`, `calendar_dates`             | Union of service IDs from calendars/exceptions; weekly flags and dated additions/removals                                 |
| `trips`                                               | Version-scoped route/service/shape references, headsign/direction/block/accessibility fields                              |
| `stop_times`                                          | `(feed_id, trip_id, stop_sequence)` key preserves repeated stop occurrences, restrictions, dwell, timepoints and distance |
| `shapes`, `shape_points`                              | Ordered raw points/distances and derived display LineString; version/shape/sequence key                                   |
| `feed_info`, `fare_attributes`, `fare_rules`          | Publisher metadata and legacy fare source fields; no fare calculation                                                     |
| `supplemental_records`, `supplemental_documents`      | Validated DART CSV supplements as original string-valued JSON; unmodified decoded `info.txt` text                         |

Standard table rows retain CSV record numbers and unrecognized columns in `extra`
JSONB. Errors report file/record or batch range plus the violated key; SQL
post-load checks report the relevant trip/record. All supported numeric, enum,
date, time, coordinate, and required fields are validated before insertion.
Composite foreign keys reject cross-publication/missing references. Parent-stop
references are deferred until the complete stop table has loaded.

B-tree indexes support route→agency, trip→route/service, trip→service, trip→shape,
stop→parent, exception-date lookup, and stop/departure lookup. Primary keys support
ordered trip visits and shape points. A GiST index covers stop geometry. There
are no routing-result, realtime, user, or account tables.

Latitude/longitude and shape distance retain decimal source precision in
unconstrained PostgreSQL `numeric` columns. Generated stop `Point` and derived
shape `LineString` geometry use SRID 4326, whose internal coordinates are double
precision. Coordinates are never snapped or merged. Shapes have no assumed
distance units and never determine timetable values or walking links.

## Supported inputs

The parser supports every column listed for the 11 standard CSV files in
`DATA_FEASIBILITY.md`: `agency`, `routes`, `stops`, `trips`, `stop_times`, `calendar`,
`calendar_dates`, `shapes`, `feed_info`, `fare_attributes`, and `fare_rules`.
`routes.company_id` is retained. Additional supported optional columns include
agency email, route sort order, stop location type/parent/platform/timezone/level,
trip short name/wheelchair/bikes, and feed default language/contact email.

`blocks`, `facilities`, `nodes`, and `route_direction` are validated against the
documented headers and preserved with original field names/strings. Supplemental
block times retain their original text; units, vehicle identity, stay-seated
permissions, station hierarchy, and undocumented cross-file semantics are not
invented. Direction labels retain trailing whitespace. `info.txt` is not parsed
as CSV. Fare-rule blanks do not become fabricated restrictions.

Core files are required and nonempty. At least one of `calendar.txt` and
`calendar_dates.txt` is required; exceptions-only service is supported. Shapes,
fares, publisher metadata, and supplements are optional, but referenced entities
must exist. Blank agency IDs use a feed-local empty-string identity only for a
single-agency feed; missing route/fare agency IDs resolve only when unambiguous.

This is a DART scheduled-feed importer, not a complete GTFS conformance validator.
Unsupported archive members fail explicitly, including `frequencies.txt`,
`transfers.txt`, `pathways.txt`, Flex, and Fares v2. Their semantics must be
implemented before accepting a feed that adds them. Extended route-type codes
outside the standard base enum are not supported. The stop model requires names
and coordinates, matching DART; coordinate-less boarding-area records need a
future extension. Unrecognized columns are preserved but not interpreted.

## Times and calendars

`parseServiceTime` returns `{ hours, minutes, seconds,
secondsFromServiceDayStart }`. Hours may exceed 23; minutes/seconds must be 00–59.
Conversion is `hours * 3600 + minutes * 60 + seconds`, without modulo 24. Storage
is bounded by the signed 32-bit integer range, not DART's observed maximum hour.

| Input      | Seconds |
| ---------- | ------: |
| `24:15:00` |   87300 |
| `25:30:00` |   91800 |
| `26:06:00` |   93960 |

Database `arrival_time` / `departure_time` columns contain these integer service
seconds, despite retaining GTFS column names. They are not SQL `time` values.
Agency timezone is stored. No timestamp conversion or DST policy is implemented;
future conversion must follow GTFS's service-date noon-minus-12-hours definition.
`max_service_seconds` supports a future lookback calculation without assuming
all service ends at 26:00. Explicitly estimated intermediate stops may have null
times; exact/default timepoints and first/last visits require times. No timetable
interpolation is performed. Departure cannot precede arrival, and known times
must not move backwards along numeric stop sequence.

Dates are validated calendar dates and stored as SQL `date`. Weekly flags and
inclusive start/end dates are retained. `calendar_dates.exception_type=1` adds
service and `2` removes it. Duplicate service/date keys fail. The small SQL
`service_is_active` function supports inspection: an exception overrides the
weekly row; without either, service is inactive. It does not search journeys.

Missing headsigns and unknown accessibility remain null/zero as supplied; no
headsign or accessibility promise is synthesized. Pickup/drop-off and timepoint
blanks remain null so source absence stays visible; later consumers must apply
the GTFS defaults. A repeated stop ID is never deduplicated within a trip.

## Streaming, diagnostics, and resource bounds

The worker copies the local ZIP to a private temporary snapshot, hashes it, then
uses lazy ZIP entries and streaming CRC/size checks. It never extracts paths or
downloads a URL. Unsafe, nested, duplicate, encrypted, symlink, or unknown members
are rejected. Temporary snapshots are removed on normal completion/failure.

UTF-8 decoding is strict. `csv-parse` supports quoted delimiters/newlines, BOM,
CRLF, and chunk boundaries; malformed quoting, unequal row widths, duplicate
headers, missing fields, and invalid values fail. Backpressure bounds parsing.
Each batch contains at most 2,000 records by default (API range 1–10,000), sent as
one parameterized JSONB recordset insertion. No million-row array or in-memory
foreign-key index is built. PostgreSQL validates relationships and ordered-trip
invariants and derives shapes. This trades some throughput for a small dependency
surface. Major tables are analyzed inside the transaction before validation so
refresh queries include the new publication in their statistics. Endpoint checks
use an ordered window scan instead of repeated large-table endpoint joins. This
keeps the refresh path practical with adjacent full DART publications. The design
retains clear transactional behavior; COPY can be considered after profiling.

Limits: 256 MiB compressed ZIP, 1 GiB per member, 2 GiB total expanded bytes,
32 members, 1 MiB CSV record, and 1 MiB `info.txt`. These exceed the retained DART
snapshots and are explicit guardrails, not claims about all GTFS feeds.

Diagnostics count overnight rows, untimed intermediate visits, restricted visits,
missing headsigns, unknown stop accessibility, repeated-stop trips, distances past
shape endpoints, equal adjacent stop distances, and decreasing shape distances.
Known shape anomalies are reported and preserved. Polyline-to-stop screening,
canonical GTFS validation, supplemental relational semantics, overtaking/pattern
analysis, DST conversion, transfer generation, and routing are deferred.

## Tests

The original `test/fixtures/tiny` feed is synthetic and redistributable under the
project license. It has two agencies, bus/rail routes, three stops/trips, unordered
and noncontiguous stop sequences, a loop, after-midnight times, dwell, boarding
restrictions, weekly service, addition/removal exceptions, exception-only service,
missing headsign/accessibility, shapes and intentional distance anomalies, fares,
and DART-shaped supplemental files. It contains no copied DART rows.

Unit tests exercise time/date boundaries, CSV/UTF-8/error behavior, early stream
cancellation, archive identity/isolation, CRC corruption, and unsafe/unsupported
members. Integration tests create a uniquely named temporary database on real
PostGIS, apply migrations, inspect normalized data/geometry/calendar behavior,
repeat imports, activate/replace dates, test ID churn, force failures after earlier
batches, test concurrent imports, and verify explicit reset. They drop only their
own generated database and never clear the normal development database.

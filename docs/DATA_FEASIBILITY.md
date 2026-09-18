# DART Data Feasibility Report

Status: **COMPLETE INVESTIGATION — READY WITH DOCUMENTED LIMITATIONS**

Investigated: **2026-09-18**. Scope: Milestone 0 only. Based on
[DATA_FEASIBILITY_TEMPLATE.md](DATA_FEASIBILITY_TEMPLATE.md).

Official schedule data is technically sufficient to build the planned Dallas
schedule router. It is not sufficient by itself to guarantee platform-level
instructions, safe walking transfers, wheelchair-accessible journeys, or live
operational information. Independent-developer realtime access and applicable
data-use permissions remain unresolved. These limitations do not require changing
the accepted architecture or substituting OpenTripPlanner for our router.

## Evidence labels and scope

- **CONFIRMED FACT**: explicitly published by the named source; this confirms the
  statement was published, not that a service-level claim was independently measured.
- **OBSERVATION**: measured in the downloaded archives or directly observed during
  this investigation. Counts describe these versions, not all DART feeds.
- **INTERPRETATION**: a conclusion drawn from those facts and observations.
- **UNRESOLVED QUESTION**: information not established by the available evidence.
- **RECOMMENDATION**: proposed implementation or follow-up; not an existing feature
  or newly accepted architectural decision.

Unless explicitly labeled **recent**, feed observations below refer to the
**latest** archive, version `V738-218-217-20260921`. Both official archives were
analyzed programmatically. The recent archive is important because the latest
published feed does **not** cover the investigation date.

## Official GTFS Schedule source

### Source, access, and provenance

**CONFIRMED FACT:** DART publishes its schedule at the
[Fixed Route Schedule page](https://www.dart.org/about/about-dart/fixed-route-schedule).
The page links the [latest ZIP](https://www.dart.org/transitdata/latest/google_transit.zip)
and an archive viewer. DART advises frequent update checks because event, weather,
and regular schedule changes can trigger revisions. No fixed refresh interval is
specified there.

**OBSERVATION:** The latest archive's `info.txt` also supplies a
[recent ZIP](https://www.dart.org/transitdata/recent/google_transit.zip) and its
[version-specific archive URL](https://www.dart.org/transitdata/archive/V738-218-217-20260921.ZIP).
The recent archive identifies its own
[version-specific URL](https://www.dart.org/transitdata/archive/V734-218-216-20260914.ZIP).
Version-specific URLs were recorded from the feed, not separately downloaded.
The [embedded archive viewer](https://tableau.dart.org/t/Public/views/FixedRouteScheduleGTFS/FixedRouteScheduleGTFS)
returned an error through the research tool; archive-list completeness and retention
were not verified.

| Property | Latest published archive | Recent archive, active on investigation date |
|---|---|---|
| Local ZIP, ignored | `data/raw/gtfs/dart-current.zip` | `data/raw/gtfs/dart-recent.zip` |
| Extracted location, ignored | `data/raw/gtfs/extracted/` | `data/raw/gtfs/extracted-recent/` |
| HTTP response date, UTC | 2026-09-18 09:09:05 | 2026-09-18 09:13:13 |
| HTTP status | 200, no credentials supplied | 200, no credentials supplied |
| Download size | 8,394,100 bytes | 8,538,309 bytes |
| `feed_version` | `V738-218-217-20260921` | `V734-218-216-20260914` |
| Service dates, inclusive | 2026-09-21–2026-10-18 | 2026-09-14–2026-09-20 |
| `info.txt` creation timestamp, timezone unspecified | 2026-09-16T16:08:08 | 2026-09-10T13:11:33 |
| ZIP CRC check | Passed for every member | Passed for every member |

SHA-256, calculated over the unmodified downloaded bytes:

```text
latest: 9feefb82d05b3ff3f3df6d4a687595e072a536a6766aaa8229d29875a88b30de
recent: 799d22360a94f4ee683c238ab0f0f467922e29a1b45671f87d4895865a55c46f
```

**OBSERVATION:** The latest response supplied `Cache-Control: private, no-cache`,
but no `ETag` or `Last-Modified` header. Both ZIPs and all extracted members were
retained unchanged locally. `.gitignore` line 10, `data/raw/`, was verified with
`git check-ignore -v` before download. None of this data is intended for Git.

**RECOMMENDATION:** Select schedules by requested service date. Stage a future
version without prematurely replacing today's version; retain the preceding
service day's data for overnight journeys. Detect content changes with a hash,
validate before activation, and preserve version metadata. A daily update check
is a starting operational proposal, not a DART-approved polling rule or a guarantee
that same-day changes will be caught soon enough.

### License and terms

**CONFIRMED FACT:** The public
[DART Legal Notices](https://www.dart.org/about/public-access-information/legal-notices)
disclaim information accuracy/completeness and restrict commercial use of website
materials without written permission, to the extent permitted by Texas law.

**OBSERVATION:** No feed-specific license file is included in either ZIP. The
legacy GTFS legal URL recorded by feed registries,
[transitdata/legalnotices.asp](https://www.dart.org/transitdata/legalnotices.asp),
redirected to `/404`, whose final HTTP response was 200. Thus HTTP success alone
would not establish that a terms page exists.

**UNRESOLVED QUESTION:** Which license governs GTFS use, public display, caching,
redistribution, and commercial derivatives? Does it differ from the general website
notice? No current explicit open-data license was established. The GTFS format's
openness and this repository's Apache-2.0 license do not license DART's dataset.

**RECOMMENDATION:** Obtain DART's applicable data-use terms before public deployment
or redistribution; specifically describe the public open-source application and
possible third-party commercial reuse. Keep raw data out of the repository.
This is a documented permissions uncertainty, not a determination of legal rights.

## Feed inventory

**OBSERVATION:** Each ZIP contains exactly 16 root-level files: 11 standard GTFS
CSV files and five supplemental files. Rows below exclude CSV headers. `info.txt`
is prose/tabular documentation, so its physical line count is reported separately.

| File | Present? | Latest rows | Recent rows | Notes |
|---|---:|---:|---:|---|
| `agency.txt` | Yes | 1 | 1 | One DART agency record |
| `routes.txt` | Yes | 92 | 92 | Includes non-standard `company_id` |
| `stops.txt` | Yes | 6,977 | 6,978 | Flat stop representation |
| `trips.txt` | Yes | 19,488 | 21,062 | Calendar-specific trip records, not daily departures |
| `stop_times.txt` | Yes | 949,209 | 976,139 | All arrival/departure values populated |
| `calendar.txt` | Yes | 12 | 12 | All service defined here in these versions |
| `calendar_dates.txt` | Yes | 0 | 0 | Header only; neither exception type occurs |
| `shapes.txt` | Yes | 128,419 | 129,700 | 256 / 262 distinct shapes |
| `transfers.txt` | No | — | — | No transfer restrictions or minimum durations supplied |
| `pathways.txt` | No | — | — | No station circulation graph |
| `frequencies.txt` | No | — | — | No frequency-based service definitions |
| `fare_attributes.txt` | Yes | 26 | 26 | Legacy fares |
| `fare_rules.txt` | Yes | 26 | 26 | All route/zone selectors empty |
| `feed_info.txt` | Yes | 1 | 1 | Version, service dates, publisher, contact URL |
| `blocks.txt` | Yes | 1,183 | 1,285 | Non-standard |
| `facilities.txt` | Yes | 76 | 76 | Non-standard; partially described in `info.txt` |
| `nodes.txt` | Yes | 1,283 | 1,282 | Non-standard |
| `route_direction.txt` | Yes | 177 | 177 | Non-standard direction labels |
| `info.txt` | Yes | 36 lines | 36 lines | Non-standard; not a GTFS CSV table |

No other archive members exist. In particular, there are no `levels.txt`,
`translations.txt`, `attributions.txt`, Fares v2, or GTFS Flex files.

### Complete column inventory

**OBSERVATION:** Both versions have identical headers. Case below is intentional.
Relative to the [GTFS Schedule reference](https://gtfs.org/documentation/schedule/reference/),
the only non-standard column in a standard file is `routes.company_id`; the five
supplemental files are outside the standard.

| File | Columns, in source order |
|---|---|
| `agency.txt` | `agency_id`, `agency_name`, `agency_phone`, `agency_url`, `agency_timezone`, `agency_lang`, `agency_fare_url` |
| `routes.txt` | `route_id`, **`company_id`**, `agency_id`, `route_short_name`, `route_long_name`, `route_desc`, `route_type`, `route_url`, `route_color`, `route_text_color` |
| `stops.txt` | `stop_id`, `stop_code`, `stop_name`, `stop_desc`, `stop_lat`, `stop_lon`, `zone_id`, `stop_url`, `wheelchair_boarding` |
| `trips.txt` | `route_id`, `service_id`, `trip_id`, `trip_headsign`, `direction_id`, `block_id`, `shape_id` |
| `stop_times.txt` | `trip_id`, `arrival_time`, `departure_time`, `stop_id`, `stop_sequence`, `stop_headsign`, `pickup_type`, `drop_off_type`, `shape_dist_traveled`, `timepoint` |
| `calendar.txt` | `service_id`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`, `start_date`, `end_date` |
| `calendar_dates.txt` | `service_id`, `date`, `exception_type` |
| `shapes.txt` | `shape_id`, `shape_pt_lat`, `shape_pt_lon`, `shape_pt_sequence`, `shape_dist_traveled` |
| `fare_attributes.txt` | `fare_id`, `price`, `currency_type`, `payment_method`, `transfers`, `transfer_duration`, `agency_id` |
| `fare_rules.txt` | `fare_id`, `route_id`, `origin_id`, `destination_id`, `contains_id` |
| `feed_info.txt` | `feed_publisher_name`, `feed_publisher_url`, `feed_lang`, `feed_version`, `feed_start_date`, `feed_end_date`, `feed_contact_url` |
| `blocks.txt` | `SERVICE_ID`, `BLOCK_ID`, `PULLOUTTIME`, `PULLINTIME` |
| `facilities.txt` | `facility_id`, `facility_code`, `facility_name`, `facility_desc`, `facility_lat`, `facility_lon`, `facility_type`, `facility_url` |
| `nodes.txt` | `ROUTE_NAME_SHORT`, `DIRECTION_ID`, `NODE`, `STOP_ID`, `NODENAME` |
| `route_direction.txt` | `ARTICLE`, `DIRNUM`, `DIRECTIONNAME` |
| `info.txt` | No CSV header; version, dates, archive links, event description, facilities field descriptions |

### Agency and missing values

**OBSERVATION:** Agency `60056` is `DALLAS AREA RAPID TRANSIT`, timezone
`America/Chicago`, language `en`, phone `214-979-1111`, URL `https://www.dart.org`.
The fare URL is `https://www.dart.org/fare/general-fares-and-overview/fares`.
Every route references this agency and has `company_id=DART`; the file does not
separately identify the operators of TRE or M-Line services.

**OBSERVATION:** Required core identifiers, stop names/coordinates, route names,
calendar fields, and arrival/departure times are populated. Important gaps:

- `trip_headsign`: blank on 39 trips in both versions, detailed below.
- `stop_headsign`: blank on every stop-time row.
- `route_desc`: blank on all 92 routes.
- `stops.zone_id` and `stops.stop_url`: blank on all stops.
- `facilities.facility_desc` and `facility_url`: blank on all 76 facilities.
- Fares: all 26 `fare_rules` records have blank route/origin/destination/contains
  selectors; 24 fare records have blank `transfers`, two have blank
  `transfer_duration`. These blanks are not a reason to invent fare or transfer
  restrictions. Fare calculation was not validated against current rider policy.

## Route types

**OBSERVATION:** Route counts are identical across the two versions.
Standard labels follow the
[GTFS route field definitions](https://gtfs.org/documentation/schedule/reference/#routestxt).

| `route_type` | Standard meaning | Routes | Latest trips | Recent trips | Feed examples |
|---|---|---:|---:|---:|---|
| `0` | Tram / streetcar / light rail | 4 | 1,517 | 2,661 | BLUE, GREEN, ORANGE, RED |
| `2` | Rail | 2 | 366 | 576 | SILVER, TRE |
| `3` | Bus | 84 | 17,042 | 17,042 | `001` MALCOLM X/MAPLE, other bus/shuttle routes |
| `5` | Cable tram | 2 | 563 | 783 | `425` MCKINNEY AVENUE TROLLEY, `620` DALLAS STREETCAR |

**INTERPRETATION:** The two type-5 assignments are a semantic quirk: the feed uses
the cable-tram value for named trolley/streetcar services. Do not infer traction
technology from it or exclude these routes by supporting only types 0, 2, and 3.

**RECOMMENDATION:** Preserve the original value in the domain model. Keep any
DART-specific display classification in the data/product adapter. All four values
can use ordinary scheduled-trip scanning. Keep zero-padded route short names such
as `001` and identifiers as strings. No nationwide scope or agency marketplace
is implied by including these DART-published services.

## Stop hierarchy

### Stations, platforms, and nearby stops

**OBSERVATION:** `location_type`, `parent_station`, `platform_code`, `level_id`,
and `stop_timezone` are all absent. There are zero explicitly encoded parent
stations, entrances, or boarding areas. Under the standard's omitted
`location_type` default, all 6,977 records are stop/platform locations; that does
not prove that the physical locations represent individual platforms.

**OBSERVATION:** Rail station names occur directly as stops used by trips. There
are 135 rail stop/route combinations used in both directions under the same
`stop_id`, so direction-specific platforms cannot be reconstructed from IDs alone.
Examples:

| Stop ID | Name | Route types serving it | What the feed establishes |
|---|---|---|---|
| `22749` | WEST END STATION | `0` | Shared station-named rail stop |
| `26895` | CITYLINE/BUSH STATION | `0`, `2` | Light rail and rail share this stop ID |
| `33260` | CITYLINE/BUSH STATION | `3` | Separate bus stop with identical name |
| `29817` | DOWNTOWN CARROLLTON STATION | `0` | Light rail stop |
| `33299` | DOWNTOWN CARROLLTON STATION | `3` | Separate bus stop |
| `34292` | DOWNTOWN CARROLLTON SILVER LINE STATION | `2` | Separate Silver Line stop; wheelchair status unknown |

**OBSERVATION:** Stop coordinates range from latitude 32.559355 to 33.084348 and
longitude -97.328201 to -96.563388. All are valid geographic coordinates. There
are no duplicate stop IDs, no identical-coordinate groups, 51 repeated-name groups
(each two stops), and 619 unordered stop pairs within 25 meters by great-circle
distance. `stop_code` equals `stop_id` on every record.

For example, `12926` and `12954` are opposing-direction ROSS @ HOPE stops about
7.45 meters apart. Proximity or a shared name is not evidence that two IDs are
duplicates or that a pedestrian can transfer between them immediately.

**RECOMMENDATION:** Preserve distinct stops; use separately validated station
grouping and transfer edges. Show the actual supplied stop name and route/headsign.
Do not fabricate a platform number or turn station-named records into zero-time
interchanges. Exact-platform guidance remains a data gap for the product.

### Accessibility and bikes

**OBSERVATION:** `wheelchair_boarding` is populated on every stop: 2,923 have `1`
(41.9%), 4,054 have `0` (58.1%), none have `2`. The recent version has one additional
`0` stop. `wheelchair_accessible` and `bikes_allowed` are absent from `trips.txt`;
there are no bike-specific fields or station pathways in either archive.

**CONFIRMED FACT:** In the
[GTFS field definitions](https://gtfs.org/documentation/schedule/reference/#stopstxt),
`wheelchair_boarding=0` means no information, not inaccessible; `1` indicates
boarding accessibility in the applicable stop context.

**INTERPRETATION:** Populated flags do not establish a wheelchair-accessible
end-to-end itinerary. Vehicle accessibility, approach paths, elevators, and outages
have not been established. The absence of bicycle fields does not establish a
bicycle prohibition or permission.

**RECOMMENDATION:** Keep accessibility unknown distinct from yes/no. Defer a
guaranteed wheelchair-routing option until adequate data and field validation
exist; do not reinterpret unknown stops as accessible or inaccessible.

## Time/calendar quirks

### Service calendars and exceptions

**OBSERVATION:** The latest feed's 12 calendar rows all span 2026-09-21–2026-10-18,
matching `feed_info.txt`. Every service ID is referenced by trips. Service operates
on every date in that span, but route availability varies by weekday.

| Latest `service_id` | Active weekdays | Trip records | Route types used |
|---|---|---:|---|
| `2` | Monday–Friday | 6,666 | `3`, `5` |
| `3` | Saturday | 5,223 | `3`, `5` |
| `4` | Sunday | 5,053 | `3`, `5` |
| `19` | Saturday | 730 | `0`, `2`, `5` |
| `20` | Sunday | 726 | `0`, `2`, `5` |
| `21` | Monday–Friday | 741 | `0`, `2`, `5` |
| `402` | Monday–Thursday | 2 | `5` |
| `502` | Friday | 4 | `5` |
| `902` | Friday | 163 | `3` |
| `1002` | Monday–Thursday | 164 | `3` |
| `1521` | Monday–Thursday | 2 | `2` |
| `1621` | Friday | 14 | `2` |

Expanding these calendars yields 7,575 trips on Monday–Thursday, 7,588 Friday,
5,953 Saturday, and 5,779 Sunday; the corresponding distinct route counts are
92, 92, 82, and 81. Counts are scheduled trip instances per date, before filtering
individual pickup/drop-off opportunities.

**OBSERVATION:** The recent feed spans only 2026-09-14–2026-09-20. Its bus-related
services `2/3/4/402/502/902/1002` have the same weekday masks/counts as above.
Its other services are `7` Thursday (753 trips), `8` Saturday (732), `9` Sunday
(806), `10` Friday (755), and `21` Monday–Wednesday (741). On September 18 it
activates services `2`, `10`, `502`, `902`: 7,588 trips on 92 routes. The changed
meaning of service `21` also demonstrates why IDs cannot encode calendar rules.

**OBSERVATION:** Both `calendar_dates.txt` files are header-only. There are zero
type-1 additions and zero type-2 removals, and thus no conflicting or duplicate
exception keys in these snapshots. The latest `info.txt` describes a September 21
rail schedule change; the recent one describes a new bus schedule and extension
of the previous rail schedule through September 20. Narrow calendar validity is
itself important even when there are no exception rows.

**RECOMMENDATION:** Implement weekly masks plus dated exceptions; support both
addition and removal cases in artificial tests. Do not assume this empty exception
file predicts holiday/event behavior in future releases. Reject dates outside
available coverage instead of extending a weekday timetable indefinitely.

### Overnight times, dwell, and timepoints

**OBSERVATION:** All arrival/departure fields parse as GTFS times. Latest values
span `03:05:00`–`26:06:00`. There are 38,238 rows where arrival or departure is
strictly greater than `24:00:00`, affecting 955 trips. Another 260 rows have an
arrival or departure exactly at `24:00:00`. A row is counted once even if both
fields meet the condition. Recent: 39,470 rows strictly beyond 24 hours, 1,048
affected trips, maximum `26:57:00`.

Trip `9064182`, route `001`, service `3`, starts at `24:06:00` and ends at
`24:39:00`. It is Saturday service occurring after midnight Sunday. In the latest
feed, Sunday-service events extend to 02:06 on 2026-10-19; the recent version
extends Sunday service to 02:57 on 2026-09-21. These are event-time extensions,
not additional service dates in the calendars.

**OBSERVATION:** No trip has decreasing arrival/departure chronology or departure
before arrival. There are 2,552 rows with positive dwell, up to 660 seconds.
All 949,209 rows have times, but `timepoint=1` occurs on only 149,037 (15.7%);
800,172 (84.3%) have `0`. Populated seconds do not make every timestamp an exact
operational promise.

**CONFIRMED FACT:** GTFS defines service-day times beyond 24 hours and measures
them from service-date noon minus 12 hours; timezone-aware handling matters at
daylight-saving transitions. See the
[Schedule time definitions](https://gtfs.org/documentation/schedule/reference/#field-types).

**RECOMMENDATION:** Retain integer service-day seconds without modulo 24. Select
candidate service dates including the previous day for early-morning queries;
derive lookback from maximum supported times rather than hard-coding this feed's
26-hour maximum. Convert through `America/Chicago`, test DST separately, and retain
previous-version overnight service at a schedule rollover. Honor dwell and label
schedule estimates honestly. This snapshot does not exercise a DST transition.

### Headsigns, direction, and boarding restrictions

**OBSERVATION:** `direction_id=0` appears on 9,915 trips and `1` on 9,573.
There are 201 distinct non-empty trip headsigns plus the empty value. The 39 blanks
are 3 trips on `238` NAAMAN FOREST/BELTLINE and 36 on `442`
BUSH/ MEADOWS-MOCKINGBIRD STA. Example: trip `9108650`, route ID `27324`,
direction `1`, has no headsign. Every `stop_headsign` is empty.

The supplemental `route_direction.txt` maps all used route-short-name/direction
pairs through `ARTICLE` and `DIRNUM`. Its 177 labels include north/south/east/west,
inbound/outbound, circular, clockwise, and counter-clockwise descriptions. One
`CIRCULAR ` label contains a trailing space. Direction `0` therefore cannot be
globally interpreted as northbound or inbound. Example: route `001`, direction
`0`, maps to SOUTHBOUND and has headsigns such as `1 BEXAR`.

**OBSERVATION:** 947,631 stop-time rows have pickup/drop-off `(0,0)` and 1,578 have
`(1,1)`; no other combinations occur. The recent version has 2,435 `(1,1)` rows.
Non-boarding records include timepoints and rail yard/pocket-track locations such
as `SHERMAN POCKET TRACK` and `WEST TEX YARD LIMIT`. Twelve latest stop IDs never
permit either boarding or alighting on any trip. Every latest trip does have at
least one permitted boarding followed by a later permitted alighting.

**RECOMMENDATION:** Enforce pickup and drop-off flags per trip visit, even when
the stop otherwise looks like a public station. Use trip headsigns where present;
support stop-level overrides for future versions. For missing headsigns, use a
clearly described route/direction or last eligible alighting stop fallback, with
special care for circular trips. Do not invent a vehicle's displayed destination.

## Shapes

**OBSERVATION:** Every latest trip references an existing non-empty shape, every
shape is used, and every stop-time row has `shape_dist_traveled`. All shape
coordinates are in range; point sequence keys are unique; shape cumulative
distances strictly increase. Point counts per shape are min/median/max
30 / 460 / 1,338. Adjacent-point great-circle distances have median 26.2 meters,
95th percentile 117.7 meters, maximum 1,661.8 meters. Sampling density is variable.

**OBSERVATION:** Coverage is not the same as geometric correctness:

- 945 latest stop-time rows, each on a different trip, exceed their shape's final
  cumulative distance. They affect 14 routes. Example: trip `9069229`, route
  `015`, sequence 56 has distance `20.2046` against shape-end `20.2038`.
  Maximum excess is `0.1266` feed distance units. Recent: 1,087 affected rows.
- 108 adjacent stop-time pairs have equal cumulative distance, with no decreasing
  pairs. Example: route `419`, trip `9105057`, stops `33248` and `28936` both have
  distance `0` while time advances from 05:40 to 05:51.
- A screening check of all 10,815 distinct latest `(shape_id, stop_id)` pairs found
  21 more than approximately 100 meters from the associated polyline. Maximum:
  about 487 meters, shape `148580`, stop `33329` BAYLOR STATION. This uses a local
  equirectangular projection at latitude 32.8 and minimum point-to-segment distance;
  it is not a surveyed location check or canonical GTFS validator result.

**INTERPRETATION:** Comparing projected polyline lengths with cumulative distance
gives approximately 997–1,000 meters per unit, consistent with kilometer units.
The feed does not explicitly declare units; this is an inference. Some excesses
are tiny, but not all can safely be dismissed as rounding.

**RECOMMENDATION:** Route primarily from ordered stops and times. Keep shapes for
map display and geometry extraction, with validation and a documented fallback
for bad distances. Do not let shape interpolation determine arrival time or create
walking paths. Preserve original values and report corrections separately; never
silently repair the source archive.

## Transfers

**OBSERVATION:** Neither version contains `transfers.txt`, `pathways.txt`, or
`levels.txt`. There are no supplied minimum transfer durations, explicit forbidden
transfers, timed-transfer guarantees, station passage durations, entrance locations,
stairs/elevators, or platform-level walking links in these standard files.

**INTERPRETATION:** Useful geographic journeys need generated and/or curated
footpaths. Absence of restrictions is not evidence of unlimited interchange,
instantaneous transfers, or accessible passage. Sharing a rail stop ID is also
insufficient evidence of a zero-duration transfer.

**RECOMMENDATION:** Use nearby-stop spatial search only to propose candidates;
validate walking routes through the planned walking-router adapter and curated
station rules. Model directed transfer edges, crossing/access constraints, realistic
walk durations, and boarding buffers separately. Start with a small reviewed set of
important DART interchanges; do not merge by name or distance. No pedestrian API,
licensing arrangement, or station-specific buffer is selected in this milestone.

### Supplemental files and limits

**OBSERVATION:** `facilities.txt` has 76 records, all `facility_type=1`. Its
`info.txt` legend assigns 1 to Transit Center and also defines other types, but none
of those other values occur. Names include rail stations. Sixty facility IDs match
stop IDs; 16 do not, including CBD WEST TC (`25435`). No parent/child relationship
or transfer edge is supplied. This is not a replacement for `parent_station`.

**OBSERVATION:** `nodes.txt` associates route short names, direction IDs, node
codes, and stop IDs/names; every referenced stop exists and there are no identical
duplicate rows. `route_direction.txt` has unique `(ARTICLE, DIRNUM)` keys. These
files can inform a DART-specific normalization layer, but their full semantics and
stability are undocumented in this archive.

**OBSERVATION:** Every trip has `block_id`, with 560 distinct values. The
supplemental `blocks.txt` has unique `(SERVICE_ID, BLOCK_ID)` keys and all service
references resolve, but 696 trips have no matching supplemental block key. Its
pull-out/in fields contain numeric strings, such as `12120` and `82920`.

**UNRESOLVED QUESTION:** The units/semantics of those supplemental times, physical
vehicle identity, and passenger stay-seated permissions were not established.
**RECOMMENDATION:** Do not treat `block_id` as `vehicle_id` or promise a stay-seated
connection from this supplemental file. Preserve standard block data for later
validated handling; the first router can operate without assuming block continuity.

## Integrity checks and RAPTOR pattern observations

**OBSERVATION:** Full-file deterministic checks on both archives found:

- All 15 CSV files decode as UTF-8 and every row matches its header width.
- Zero duplicate agency, route, stop, trip, calendar-service, shape-point, or
  trip/stop-sequence keys. Supplemental facility, service/block, and
  route/direction keys are also unique. The latest fare IDs are unique and its
  fare-rule references resolve.
- Zero empty, padded, or control-character-containing primary route, stop, trip,
  or calendar-service IDs under the performed checks.
- Zero unresolved route→agency, trip→route/service/shape, or
  stop-time→trip/stop references. Every route has trips, every trip has stop times,
  every stop is referenced, and every shape is used.
- No malformed time values, negative stop sequences, backwards chronology,
  departure-before-arrival records, or trips with fewer than two stops.
  Latest trips have 3 / 46 / 107 stops at min/median/max.
- Calendar weekday flags, observed route/direction/pickup/drop-off/timepoint enum
  values, route color strings, and nonnegative shape distances/sequences pass the
  checked field constraints. Calendar start dates do not follow end dates.

**OBSERVATION:** The latest feed has **249 routing patterns** when grouped by
`route_id`, `direction_id`, and the complete ordered sequence of
`(stop_id, pickup_type, drop_off_type)`. Eighty-five routes have multiple patterns;
one has 14. There are 1,072 trips that revisit a stop ID. The recent feed has 255
patterns under the same definition.

**OBSERVATION:** Within latest patterns, sorting coactive trips by first departure
and checking adjacent trips across all visits found no downstream arrival/departure
order reversals or identical complete time vectors. Monday, Friday, Saturday, and
Sunday masks cover all distinct weekly combinations in this version. The recent
feed was checked for reversals within each service ID, with none found; it did not
receive that additional cross-service comparison.

**RECOMMENDATION:** A RAPTOR route scan must use actual ordered patterns, not just
GTFS route IDs. Preserve stop occurrences by sequence so a loop does not collapse
into one visit. Validate any non-overtaking precondition on each import and after
realtime adjustment; absence of overtaking here is not a permanent guarantee.
Retain pickup/drop-off restrictions in pattern identity or equivalent per-visit
logic. Artificial tests should include variants, loops, overtaking, and express
patterns even where these snapshots do not exercise every case.

**LIMITATION / OBSERVATION:** These are targeted full-file checks, not a claim of
complete GTFS specification compliance. No canonical validator, router, OTP journey
comparison, pedestrian network verification, physical accessibility audit, or
performance benchmark was run. Geometry diagnostics found real issues despite
clean relational/time checks. Routing-quality tests belong in subsequent milestones.

## Schedule version changes

**OBSERVATION:** Comparing the two official snapshots establishes concrete churn:

| Identifier | Shared | Latest only | Recent only |
|---|---:|---:|---:|
| `route_id` | 85 | 7 | 7 |
| `stop_id` | 6,977 | 0 | 1 |
| `trip_id` | 17,275 | 2,213 | 3,787 |
| `shape_id` | 207 | 49 | 55 |
| `service_id` | 8 | 4 | 4 |

RED changes route ID `27254` → `27391`, SILVER `27255` → `27392`, and TRE
`27257` → `27394`; route `001` retains `27264`. Shared trip records in `trips.txt`
are unchanged; this does not assert all associated stop times or geography are
unchanged. Stop `23304` retains its ID but moves from the near to far side of
COLLINS @ GLENVILLE, with changed coordinates/name; `23305` changes similarly.
The removed stop is `32892`, TP SCYENE POCKET.

**RECOMMENDATION:** Namespace imported entities by feed version and preserve
source IDs. Atomically activate an internally consistent network, invalidate
dependent caches, and reconcile existing itineraries and realtime against the
correct date/version. Route short names may aid diagnostics but are not proven
stable join keys. Keep adjacent versions available across overnight boundaries.

## GTFS-Realtime

### Access and provenance

**CONFIRMED FACT:** DART's
[April 2, 2024 announcement](https://www.dart.org/about/news-and-events/newsreleases/newsrelease-detail/dart-begins-sharing-gtfs-realtime-feed-to-google-and-transit-apps)
says it began sharing realtime information with Google Maps, Transit, and other
apps. This establishes partner distribution, not unrestricted developer access.

**OBSERVATION:** A public
[DART-branded API developer portal](https://dart.developer.azure-api.net/)
advertises transit APIs. It links DART's official schedule page, identifies DART
in its branding/footer, and exposes [sign-in](https://dart.developer.azure-api.net/signin)
and [sign-up](https://dart.developer.azure-api.net/signup) pages. Public page
metadata describes signing up to acquire keys. No independent verification of
this portal's enrollment policy or backlink from `dart.org` was established.
Treat it as the principal access lead to confirm with DART, not a production
authorization by itself.

**OBSERVATION:** Public portal text was retrieved, including its published links.
The research tool could not retrieve usable `/apis` or `/products` documentation;
sign-in/sign-up pages did not expose an enrollment policy or API agreement in the
retrieved text. An interactive browser was unavailable in this session, so any
additional dynamic or authenticated documentation remains unexamined. This is not
proof that such documentation does not exist. Network access otherwise succeeded
after the initial shell sandbox restriction was resolved.

No account was registered, no credentials were created, no terms were accepted,
and no realtime payload was downloaded. No GoPass scraping or reverse-engineered
endpoint was used. No endpoint from another project's code was adopted.

### Feasibility matrix

All public sources below were accessed on 2026-09-18. “Unresolved” means not
verified for this application, not necessarily absent at DART.

| Question | Classification | Finding |
|---|---|---|
| Does DART produce/share GTFS-Realtime? | CONFIRMED FACT | Official 2024 announcement confirms sharing with consumer-app partners. |
| Official independent-developer feed? | UNRESOLVED QUESTION | Portal is an access lead; independent eligibility, approval, and operating permission are unverified. |
| Official documentation/source | OBSERVATION | Announcement and portal home are available; no approved endpoint documentation obtained. |
| Endpoint URLs | UNRESOLVED QUESTION | None confirmed as authorized production inputs. |
| Authentication | UNRESOLVED QUESTION | Portal has sign-in/key-acquisition indications; feed auth scheme and required headers remain unknown. |
| Registration/API credentials | INTERPRETATION | Likely an account/key workflow based on portal metadata; eligibility, cost, approval process, and credential requirements need confirmation. |
| Terms of use | UNRESOLVED QUESTION | No realtime-specific agreement obtained; redistribution, public display, caching, attribution, commercial/open-source use, and retention rights unknown. |
| Rate limits | UNRESOLVED QUESTION | No quota, burst allowance, or per-endpoint limit confirmed. |
| Recommended polling | UNRESOLVED QUESTION | Publication cadence is not permission to poll at that cadence. |
| Bus coverage | UNRESOLVED QUESTION | Advertised in portal scope; actual entity coverage/completeness not measured. |
| Rail coverage | UNRESOLVED QUESTION | Portal scope mentions light rail/TRE and trolley/streetcar; mode-by-mode access and Silver Line coverage not verified. |
| Cancellations | UNRESOLVED QUESTION | Advertised, but representation, lead time, entity expiry, and completeness unmeasured. |
| Added/unscheduled trips | UNRESOLVED QUESTION | No DART-specific behavior documented in retrieved material. |
| Historical realtime | UNRESOLVED QUESTION | No official history endpoint or retention/access policy identified. Schedule archives are a different lifecycle. |
| Public open-source application restrictions | UNRESOLVED QUESTION | Need affirmative terms for backend ingestion and rider-facing output; source publication cannot expose any future credentials. |

### Feed entities and freshness

**CONFIRMED FACT — published claims only:** The
[portal home](https://dart.developer.azure-api.net/) describes these entities and
cadences. They were not independently measured:

| Entity | Advertised? | Accessible/verified here? | Published description |
|---|---|---|---|
| VehiclePositions | Yes, as Vehicle Locations | No | Revenue-vehicle GPS locations; updates at intervals of five seconds or less |
| TripUpdates | Yes | No | Progress, delays, cancellation, predictions, detours; updates every 60 seconds |
| Alerts | Yes | No | Service disruptions; no update interval stated |

**UNRESOLVED QUESTION:** FeedHeader timestamps, entity timestamps, transport format
details, observed latency, outage behavior, stale entity retention, completeness,
and full-vs-differential feed semantics are unknown. The advertised intervals are
not an SLA, a permitted polling rate, or proof that every vehicle reports that often.

**RECOMMENDATION:** Once approved access exists, measure repeated samples over
different times/days and a schedule transition before choosing TTLs or freshness
thresholds. Track receipt time, source feed time, and entity time separately; detect
frozen feeds, clock skew, unknown identifiers, and partial mode coverage. Never
mark stale predictions or coordinates as live. Continue scheduled navigation with
an explicit realtime-unavailable/stale state and suppress unsupported live claims.

### Identifier compatibility and operational semantics

| Identifier / behavior | Observation or unresolved status |
|---|---|
| `trip_id` | No realtime sample; exact schedule matching and rollover behavior unverified. Static churn is measured above. |
| `route_id` | No realtime sample; seven IDs change between the static snapshots. |
| `stop_id` | No realtime sample; most static IDs persist, but coordinates can change under an existing ID. |
| `vehicle_id` | No realtime sample; presence, persistence, public label, and bus/rail differences unknown. Static `block_id` is not proof. |
| Canceled/skipped service | Encoding and completeness unknown; a missing entity must not automatically mean cancellation. |
| Added/unscheduled trips | Identifier and stop-sequence mapping unknown; cannot assume every future realtime trip has a static match. |
| Detours | Advertised, but changed stop sequence, shape, skipped-stop, and alert behavior unknown. |

**RECOMMENDATION:** Gate each live feature on separately verified entity access,
freshness, identifier matching, and semantic tests. Keep unmatched entities out of
journey predictions until reconciled; log aggregate mismatch rates. A realtime
coordinate alone cannot establish which scheduled departure the rider should board.
No realtime reconciliation algorithm is implemented or selected here.

### Secondary evidence and next verification

**OBSERVATION — secondary sources:**
[Transitland's DART feed listing](https://www.transit.land/feeds/f-9vg-dallasarearapidtransit)
and [Mobility Database mdb-152](https://mobilitydatabase.org/feeds/gtfs/mdb-152)
corroborate the static source and recent version dates. Mobility Database records
the legacy legal URL that now redirects to an error page. These are registries,
not grants of DART data-use permission. Their validation badges/counts were not
substituted for this investigation's measurements. Neither inspected listing
established our realtime authorization; that is not evidence that realtime does
not exist.

**RECOMMENDATION:** Use DART's
[contact page](https://www.dart.org/contact-us), also supplied in `feed_info.txt`,
to request the correct developer-data contact. No message was sent. Request:

1. Confirmation of the portal, independent-developer eligibility, onboarding,
   approved URLs, authentication, pricing, quotas, and polling guidance.
2. Applicable static/realtime licenses, public-display and redistribution rights,
   attribution, caching/retention, and open-source/commercial-use restrictions.
3. VehiclePositions/TripUpdates/Alerts coverage by bus, light rail, Silver Line,
   TRE, trolley, and streetcar; timestamp/freshness expectations and outages.
4. Schedule-version reconciliation for trip/route/stop IDs, vehicle identification,
   cancellations, skipped stops, detours, added trips, and historical access.
5. Station/platform/pathway data availability and clarification of supplemental
   files, headsign gaps, route-type assignments, and shape anomalies.

**INTERPRETATION:** Realtime feature implementation remains blocked on legitimate
access and operational verification. Static schedule-routing development remains
technically feasible. Public deployment has a separate terms-clarification gate.

## Routing-engine implications

These are **RECOMMENDATIONS** derived from the labeled observations above, within
the existing architecture. They are not a request to build subsequent milestones.

| Concern | Implementation constraint | Future deterministic verification |
|---|---|---|
| Service-day times | Integer seconds, agency timezone, prior-day candidates, bounded feed validity | After-midnight departures, DST, end-of-range rollover |
| Calendar exceptions | Weekly masks plus dated additions/removals; no hard-coded service IDs | Holiday replacement and calendar-dates-only artificial networks |
| Network versions | Date-aware activation, version-scoped IDs, atomic consistent indexes | Future feed received early, changed IDs, old service continuing overnight |
| RAPTOR patterns | Ordered stop visits and boarding permissions, variant/loop support | Branching patterns, repeated stops, express service, overtaking |
| Route types | Scan types 0/2/3/5; preserve source classification | Every observed mode included; adapter presentation isolated |
| Transfers | Generated/curated directed footpaths and sensible buffers | Same-name stops, opposing road sides, station walks, unreachable crossings |
| Stations/platforms | Flat supplied stops; optional verified grouping outside core | Same rail ID in both directions; distinct bus/rail IDs; no invented platforms |
| Boarding instructions | Trip headsign, optional stop override, honest missing-data fallback | Missing headsign, circular direction, non-boarding yard/timepoint |
| Accessibility | Unknown is a separate state; no end-to-end guarantee from stop flag | Unknown stop, missing trip flag, inaccessible/unknown transfer |
| Shape geometry | Independent of timetable feasibility; validate distance-based slicing | Out-of-range/equal distances and off-polyline stops |
| Vehicle identity | Do not promote block IDs into observed vehicle identity | Missing RT vehicle/trip association; reused IDs across dates |
| Realtime | Separate ingestion lifecycle, version reconciliation, freshness gates | Stale/frozen feed, cancellation, added trip, partial coverage, mismatch |
| Fallback | Continue schedule results with explicit uncertainty | No realtime at startup, outage mid-journey, expiry of live predictions |
| Ranking | Keep earliest arrival → fewer transfers → less walking → lower risk | Deterministic tie-breaking; no invented delay probabilities |

**INTERPRETATION:** Nothing observed makes the custom RAPTOR-style engine,
independent domain model, PostgreSQL/PostGIS schedule storage, or Redis realtime
lifecycle impossible. Accepted ADRs remain unchanged. Pedestrian transfers and
exact-platform instructions need additional evidence, not a replacement routing
architecture. OTP remains a future correctness oracle.

## Risks

Likelihood below is a qualitative engineering assessment, not a statistical
probability. “Observed” means the condition exists in the inspected data.

| Risk | Impact | Likelihood / evidence | Mitigation / release gate |
|---|---|---|---|
| Realtime access not approved | Live tracking, predictions, alerts, disruption-aware replanning unavailable | Unresolved; partner sharing is confirmed but independent access is not | Obtain approved access/terms; ship schedule behavior independently |
| Static/realtime data-use terms unclear | Public hosting or redistribution may be restricted | Unresolved; general commercial-use restriction and dead legacy legal link | Clarify applicable permission before public deployment |
| Latest feed starts in the future | Empty or wrong journeys for today if blindly activated | Observed | Preserve active and future versions and query by service date |
| Short validity/event revisions | Stale schedules or coverage gaps | Observed 7-day recent and 28-day latest spans | Check frequently; monitor coverage and import failures; never extrapolate silently |
| Identifier changes | Broken caches, itineraries, or realtime joins | Observed route/trip/shape/service churn | Version-scoped identity and transition verification |
| Missing transfer/pathway/platform model | Impossible transfers or inaccurate boarding instructions | Observed | Validated walking adapter, station rules, conservative buffers; admit platform uncertainty |
| Incomplete accessibility | False accessible-journey promise | Observed majority unknown stops and absent trip/pathway fields | Preserve unknown; defer guaranteed accessible routing |
| Missing headsigns/direction ambiguity | Wrong boarding guidance | Observed 39 blank headsigns and varied direction labels | Explicit fallback and route-specific presentation; review affected trips |
| Non-boarding timepoints | Routes users to yards or unusable stops | Observed pickup/drop-off restrictions | Enforce visit-level boarding/alighting rules |
| Shape-distance/geometry errors | Broken polylines or misleading path display | Observed | Geometry validation and display fallback; keep out of timetable computation |
| Implicit pattern/non-overtaking assumptions | Incorrect earliest-arrival search | Multiple patterns/loops observed; future overtaking possible | Import invariants and artificial regression networks |
| Supplemental-file assumptions | Incorrect hierarchy, vehicle ID, or stay-seated transfer | Observed incomplete block matches and flat facilities | Preserve separately; verify semantics before depending on them |
| Advertised realtime cadence treated as freshness | Stale information displayed as live | Unmeasured operational risk | Entity timestamps, TTLs, stale fallback; measure permitted samples first |

## Method, reproducibility, and limits

**OBSERVATION:** The repository was clean before work. `origin/main` was fetched;
local `main` had zero commits ahead/behind and pointed to
`f3b39762dc96567b34181f5dd9075fad79c88da8`. Work was placed on
`docs/dart-data-feasibility`. All project documents and accepted ADRs were reviewed.

Temporary analysis used Python 3.13.15 standard-library `zipfile`, `csv`,
`collections`, `datetime`, `hashlib`, and math/statistics; no production dependency
was added. Downloads used `curl.exe`. ZIP member paths were checked to remain
inside their extraction directories. Extracted bytes were compared against every
archive member, with exact matches. Raw files were never edited.

To reproduce the reported analysis on these exact versions:

1. Verify `data/raw/` is ignored, retrieve the official archives, and match the
   SHA-256 values above. Mutable latest/recent URLs may now return newer versions;
   use the recorded version-specific links or retained local ZIPs when necessary.
2. Decode CSV as UTF-8, count data rows (not physical newline counts), retain IDs
   as strings, inventory headers, blanks, and duplicate primary/composite keys.
3. Join route→agency, trip→route/service/shape, stop-time→trip/stop; check unused
   entities and required routing values. Sort visits and shape points by numeric
   sequence before checking chronology and cumulative distances.
4. Convert time text to `hours*3600 + minutes*60 + seconds`, validating minute and
   second ranges. Count rows with either field above 86,400 separately from
   equality. Expand weekday masks over the declared inclusive date range, then
   apply dated additions/removals. Do not expand each trip indiscriminately daily.
5. Build patterns using the exact tuple definition above; compare coactive trip
   vectors in departure order. Check distances against each trip's shape endpoint.
6. For nearby-stop screening use Haversine distance with Earth radius 6,371,000 m;
   for shape offsets use the stated approximate projection and point-to-segment
   minimum. Neither calculation establishes a pedestrian route.
7. Compare identifier sets and records between versions, keeping overlap counts
   separate from proof of stable meaning. Repeat checks for any replacement feed.

Temporary scripts, analysis JSON/text, and downloaded research HTML were removed
after the report was checked. Only the two ignored raw ZIPs, their exact extracted
contents, and HTTP download headers remain as local source evidence. No maintained
tooling, application scaffolding, package manifests, credentials, or changes to
architecture/ADRs were introduced. No tests/lint/typecheck scripts exist in this
planning-only repository; application checks are not applicable to this document.

## Milestone 0 acceptance review

| Roadmap deliverable / exit condition | Result | Evidence / limitation |
|---|---|---|
| DART GTFS Schedule source confirmed | Satisfied | Official DART page → ZIP; unauthenticated downloads verified |
| Current feed downloaded | Satisfied | Both official ZIPs retained locally, hashed, and ignored by Git |
| Current feed inspected | Satisfied | Latest publication and currently effective recent version both inspected |
| Feed schema/quirks documented | Satisfied | Complete inventory/headers, calendars, times, hierarchy, geometry, identifiers, anomalies |
| Realtime access path researched | Satisfied with documented limitation | Official announcement and portal lead investigated; independent use not authorized/verified |
| Access/rate/legal constraints documented | Satisfied as an investigation deliverable | Known notices recorded; unknown realtime limits and data-specific permissions explicitly blocked |
| Risk register created | Satisfied | Impact, qualitative likelihood, mitigation/gates above |
| Sample entities saved as test fixtures if legally appropriate (`START_HERE.md` §3.3) | Conditional; deferred | No maintained real-data fixtures created while redistribution terms remain unclear; examples are documented and raw source stays ignored |
| No application architecture assumes unavailable data (`START_HERE.md` §3.3) | Satisfied | Existing conditional realtime integration retained; platform/transfer/accessibility gaps explicitly identified; no architecture changes |
| We know what data can actually be used | Qualified | Downloadable official schedules support local analysis and technical routing feasibility; public-use terms and live features remain gated |

## Decision

1. **Can schedule routing be built from official data?** **Yes, technically.**
   Timetables, stops, calendars, route identity, boarding restrictions, and geometry
   exist. Walking transfers require additional modeling; public-use terms need
   clarification before deployment.
2. **Can realtime vehicle tracking be built from a legitimate source?** **Not yet
   established for this project.** DART shares realtime with partners and a portal
   advertises APIs, but approved independent access was not confirmed.
3. **What realtime features remain uncertain?** All live entity access and measured
   coverage, freshness, identifier compatibility, cancellation/detour/added-trip
   behavior, historical access, and allowed usage/polling.
4. **What must the architecture avoid assuming?** That latest means effective
   today; IDs are stable; all times fit a clock day; every stop visit is boardable;
   stations imply platforms or free transfers; accessibility is complete; shapes
   are authoritative for timing/walking; blocks identify vehicles; or partner
   realtime sharing permits independent consumption.

**RECOMMENDATION: READY WITH DOCUMENTED LIMITATIONS.** The investigation can close
Milestone 0 if its recorded realtime and deployment-permission gates are accepted.
It does not authorize a realtime integration or certify the app for public travel.

**Human decisions / follow-up:** Accept this qualified milestone outcome; decide
whether to pursue DART developer access and terms clarification, including any
eventual registration/agreement. No outreach or acceptance was performed. No ADR
change is proposed. Work stops here; Milestone 1 has not begun.

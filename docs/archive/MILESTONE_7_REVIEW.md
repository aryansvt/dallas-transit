# Milestone 7 — OTP correctness reference

Implemented on `feat/otp-router-validation`. OTP is developer tooling only; no
production exports, HTTP handlers, routing decisions, dependencies, or ADRs change.
No LineFinder routing defect was found in this corpus. This is bounded correctness
evidence, not proof over every DART journey.

## Reproduce

With repository dependencies installed, Docker running, and the original retained
`data/raw/gtfs/dart-recent.zip` present, run from the repository root:

```sh
pnpm otp:validate
```

The command builds only GTFS, router, and ingestion workspaces. It verifies the ZIP
hash, reads it using the existing validated archive/GTFS parsers, starts a fresh
disposable OTP container, waits for readiness, calibrates the API, compares the
corpus, and stops/removes only its own UUID-named container. It uses a dynamically
assigned **loopback-only** port. Docker may download the pinned image on first use.
No global Java installation, database, OSM download, account, or cloud service is
needed. Tested with Node 24.21.0, pnpm 12.4.2 and Docker 29.7.2 on Windows/Linux
containers. Allow roughly a minute with the image cached; the observed graph build
took nine seconds. JVM maximum heap is 3 GiB; allow Docker additional headroom.

Evidence and startup logs are written to `data/raw/otp/comparison.json` and
`data/raw/otp/container.log`, covered by the existing `data/raw/` ignore. Graphs
are built in memory, never saved. No archive/publication/activation is modified.
A different feed hash is a hard error: do not substitute today's download from a
moving DART URL and interpret the results as this corpus.

Ordinary offline reference tests: `pnpm test:reference`. They use tiny artificial
fixtures and mocked HTTP, never start OTP, and are also discovered by normal tests.

## Exact reference and inputs

- Official [OpenTripPlanner 2.7.0 release](https://github.com/opentripplanner/OpenTripPlanner/releases/tag/v2.7.0),
  commit `b001f6a43992e811157c39a56d51b0ace60a3b06`; container bundles Java 21.0.6.
- Image: `docker.io/opentripplanner/opentripplanner:2.7.0`, immutable digest
  `sha256:640870b240ad206d05634e7a066588804c6e23abebf37cbc02b0c9ba66073486`.
- Retained recent ZIP SHA-256:
  `799d22360a94f4ee683c238ab0f0f467922e29a1b45671f87d4895865a55c46f`.
- Both engines consume that complete archive. OTP mounts it read-only; LineFinder
  uses a private byte snapshot through the existing archive reader. No edited GTFS
  subset is substituted. The reference adapter selects calendar services directly
  from the ZIP; this milestone does not revalidate the SQL ingestion adapter.
- Build dates are fixed to September 14–20, 2026, independent of today's date.
  Agency timezone is checked as `America/Chicago`. Friday's view has 7,588 active
  trips and 363,050 stop visits; its active services are `10`, `2`, `502`, `902`.

Configuration lives in `tools/otp/`. See the pinned
[build configuration](https://docs.opentripplanner.org/en/v2.7.0/BuildConfiguration/)
and [routing configuration](https://docs.opentripplanner.org/en/v2.7.0/RouteRequest/).
There are no street inputs, realtime updaters, automatic walking transfers, or
block-based interlining. Repeated-stop cleanup is disabled. The build log confirms
zero generated transfer edges. Same-stop transfers remain available. Both engines
use a **120-second change buffer**, an explicit validation assumption, with zero
initial boarding/alighting slack. This does not certify real station walking times.

## Method

The thin harness in `workers/transit-ingest/src/reference/` uses OTP's version-pinned
legacy GTFS GraphQL `plan` field and LineFinder's public router functions. It checks
existence, transit departure, final arrival, transfer count, route sequence, ordered
boarding/alighting stops, and each transit leg's timestamps. Every comparable
witness from both engines is replayed against active trips, ordered stop visits,
pickup/dropoff permissions, connection continuity, and the change buffer. Repeated
stop IDs are matched by ordered occurrence and time, not by the first ID match.

GTFS seconds never wrap at midnight. Epoch conversion uses local noon minus twelve
elapsed hours; the OTP request uses the resulting civil date/time, and returned
legs retain their service dates. Calendar boundaries are inclusive and
`calendar_dates` additions/removals override weekly service. The retained archive
contains **zero exceptions**: exception precedence and DST are fast synthetic unit
tests, not claims of DART/OTP coverage for those situations.

There is **zero timestamp tolerance**: this identical static feed provides integer
seconds. The comparison retains the arrival/transfer Pareto frontier, including a
later direct option when it saves a transfer. OTP's later departures dominated on
both criteria are valid additional options, not errors. Trip identity alone is not
a rider-visible mismatch. Different feasible paths with the same objective values
are classified as valid alternatives; missing objective points remain unresolved
and fail the command. It never labels a difference a LineFinder defect merely
because OTP disagrees.

The departure window is explicitly two hours, inclusive. LineFinder's entire
returned frontier must fit that window; it is never silently clipped. OTP debug
results outside it are retained separately with classification/reason. In-window
adjacent-service-day or walking results fail validation rather than being silently
discarded. The zero-access cases also run geographic composition at the exact real
stop coordinates, with identity walks of zero length/duration.

## Corpus and observed results

Run on September 24, 2026: **11/11 cases agreed**, with 57 comparable OTP witnesses
successfully replayed, seven extra departures outside the window, and no unresolved
disagreements. Times below are service-day times; all dates are in 2026.

| Case / stops                                             | Date, request    | Matching result                                                                                                  |
| -------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| West End → CityLine/Bush (`22749` → `26895`)             | Sep 18, 08:00    | Orange 08:04–08:43; later Red options are dominated                                                              |
| Rowlett → DFW Airport (`32562` → `32553`)                | Sep 18, 08:00    | Blue 08:16:30, change at SMU/Mockingbird (`22938`), Orange; arrive 09:54, one transfer                           |
| South Garland TC → CBD West TC (`33221` → `33318`)       | Sep 18, 08:00    | 214 → 205 via Elm/Harwood (`20431`), arrive 08:51; direct 016 arrives 08:54; both depart 08:00                   |
| Rowlett → DFW, zero transfers allowed                    | Sep 18, 08:00    | Both no journey                                                                                                  |
| Parkland → Samoa/Bexar (`33286` → `15842`)               | Sep 18, 24:00    | 001, trip `9064417`, 24:06–24:43; Friday service on Saturday's clock                                             |
| Walnut/Abrams → Richland CC entrance (`19754` → `19756`) | Sep 18, 04:05    | 017, trip `9071288`, 04:07:47–04:08:59; boards second visit (sequence 16), having missed sequence 12 at 04:04:59 |
| West End → CityLine/Bush, exact boarding boundary        | Sep 18, 08:04:00 | Orange 08:04–08:43; zero-access/egress composition also matches                                                  |
| Same pair, one second late                               | Sep 18, 08:04:01 | Red 08:14–08:53; zero-access/egress composition also matches                                                     |
| Same pair, Saturday                                      | Sep 19, 08:00    | Red 08:14–08:53                                                                                                  |
| Same pair, Sunday                                        | Sep 20, 08:00    | Both no journey in this publication's Sunday rail services                                                       |
| Parkland → Samoa/Bexar, Sunday                           | Sep 20, 08:00    | 001, 08:06–08:39; Sunday bus service is active                                                                   |

## Discrepancies, classifications, and limits

1. **OTP/reference behavior difference:** in this pinned legacy API, `maxTransfers`
   behaves as a boarding limit. Raw `0` gives no direct ride, `1` gives a direct
   ride but no Blue/Orange connection, and `2` enables that connection. Four probes
   reproduce this on every run. The adapter passes LineFinder's limit plus one;
   returned rides must still satisfy LineFinder's original limit. No router change.
2. **OTP/reference behavior difference:** debug itinerary filtering returns some
   departures beyond the requested window. Seven are reported separately. The
   overnight extra is Saturday service at civil 04:06, not Friday's 24:06 trip.
   Comparing these as interchangeable would be an input/configuration mismatch.
3. **Currently unsupported/known limitation of the reference setup:** OTP initially
   crashed intermittently during `DataImportIssueSummary` construction with the
   host's 16 reported processors. The JVM is pinned to one reported processor;
   the complete rerun succeeded. This is a reference-only workaround, not a proven
   upstream root-cause diagnosis. Early exit now saves logs and fails promptly.
4. **Currently unsupported/known limitations:** nonzero street walking, different
   stop interchanges, real calendar exceptions, DST service, stay-seated block
   transfers, realtime, and cross-service-date journey composition are not certified
   by this corpus. OTP and LineFinder optimize differently; OTP remains a fallible
   oracle. Shape warnings and historical-feed warnings are logged, with no geometry
   correctness claim. No LineFinder bugs or production changes were necessary.

The only classifications accepted as comparable success are agreement and verified
valid alternative. New existence/frontier/witness discrepancies fail visibly for
investigation; do not add blanket expected-failure allowances to make the run green.

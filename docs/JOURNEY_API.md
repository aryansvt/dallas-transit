# Journey API V1

Milestone 5 exposes static geographic planning through Fastify. The canonical
contract is the JSON schemas in `apps/api/src/contracts.ts`, with the semantics
below. There is no UI prose, realtime, login, deployment, distributed cache or
new database migration. All accepted ADRs and the transit algorithm are unchanged.

## Endpoints

| Method/path                                                                   | Purpose                                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `POST /v1/journeys`                                                           | Plan coordinate-to-coordinate transit journeys                |
| `GET /v1/stops/:id?serviceDate=YYYY-MM-DD`                                    | Stop details in the activated publication                     |
| `GET /v1/routes/:id?serviceDate=YYYY-MM-DD`                                   | Route details in the activated publication                    |
| `GET /v1/stops/nearby?serviceDate=YYYY-MM-DD&latitude=32.78&longitude=-96.80` | Up to eight nearby stop/platform candidates within 1,200 m    |
| `GET /health`                                                                 | Process liveness                                              |
| `GET /ready`                                                                  | Database/schema/schedule capability and walking configuration |

Journey planning uses POST because input is a structured query document containing
two coordinate objects and constraints. It has no persistent mutation. Coordinates
need not appear in URLs or ordinary access logs. Responses use `Cache-Control:
no-store`; there is no journey-result cache. New product routes are versioned `/v1`.

No provider endpoint, source/agency selector, tuning policy or deadline may be
supplied by a caller. JSON bodies are limited to **4,096 bytes**. Unknown fields,
query overrides, nested coordinate extras, numeric strings in JSON, malformed JSON,
missing fields and invalid values are rejected. AJV coercion, field removal and
default insertion are disabled. The router's coordinate/date/time validation and
the existing GTFS date parser remain the authorities; HTTP schemas describe shape.

## Journey request

```json
{
  "origin": { "latitude": 32.7812, "longitude": -96.8056 },
  "destination": { "latitude": 33.0024, "longitude": -96.7029 },
  "serviceDate": "2026-09-18",
  "departureTime": 28800,
  "maxTransfers": 3
}
```

The first four fields are required. `departureTime` is integer service-day seconds,
0 through 2,147,483,647, **not** a clock string, timestamp, or UTC time. Latitude and
longitude are finite JSON numbers in [-90,90] and [-180,180]. Dates must be real
ISO calendar dates. The optional `maxTransfers` is an integer 0-3; default 3.
It is exposed because direct service/fewer transfers is a meaningful rider choice.
Zero permits one boarding. All other computational budgets remain server-owned.

## Journey response and stable fields

HTTP 200 success has this structure (journey/leg examples are schematic):

```text
{
  status: "ok",
  publicationId, serviceDate, origin, destination, requestedDepartureTime,
  incomplete: boolean,
  journeys: [
    {
      publicationId, serviceDate, origin, destination,
      accessStopId, egressStopId, requestedDepartureTime, arrivalTime,
      durationSeconds, boardingCount, transferCount,
      walkingDurationSeconds, walkingDistanceMeters, interchangeDurationSeconds,
      legs: [walk, transit, ... , walk]
    }
  ],
  references: { stops: [Stop], routes: [Route], trips: [Trip] }
}
```

All listed field names, types and meanings are V1 contracts. `journeys` retains
M4's final-arrival, transfer-count, walking-duration order and at most three
alternatives. `incomplete: true` means a provider failure could have hidden another
or better journey. Useful successful journeys are preserved; completeness is not
silently asserted. Waiting is included in total duration. Walking totals include
only provider-reported access/egress. Supplied interchange links remain separately
reported; no unmeasured interchange distance is fabricated.

| Leg kind   | Stable fields                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `walk`     | `phase` (`access`/`egress`), `stopId`, `origin`, `destination`, `durationSeconds`, `distanceMeters`, `departureTime`, `arrivalTime`                                                         |
| `transit`  | `tripId`, `routeId`, `boardingStopId`, `alightingStopId`, `boardingOccurrence`, `alightingOccurrence`, `boardingSequence`, `alightingSequence`, `departureTime`, `arrivalTime`, `patternId` |
| `transfer` | `transferId`, `fromStopId`, `toStopId`, `departureTime`, `arrivalTime`                                                                                                                      |

Occurrences are zero-based positions; sequences are original GTFS sequence values.
The `patternId` field is diagnostic: its value identifies a constructed
publication/service-date view, never a durable cross-date identity. Same-stop
connection waits are time gaps, not invented walking legs. The current DART loader
supplies no inter-stop transfer links, but their M3 representation is preserved.

References contain the selected journeys' bounded sets of transit entities, read
by the **same explicit publication ID**:

- `Stop`: `stopId`, `name`, `coordinate`, nullable `code`, `platformCode`,
  `parentStationId`.
- `Route`: `routeId`, nullable `shortName`, `longName`, `color`, `textColor`,
  numeric GTFS `type`, `agencyTimezone`.
- `Trip`: `tripId`, nullable `headsign`, nullable numeric `directionId`.

These fields support later presentation without another date-selection race.
Null means the supplied value is absent. Colors retain GTFS hex strings without
`#`. Direction IDs are source values; `0` does not universally mean northbound.
Platform fields do not certify physical boarding locations. No source JSON,
provider bodies, credentials, ingestion audits or runtime timings enter the contract.
Response schemas explicitly select serialized fields. Clients should tolerate
future additive fields; incompatible changes require another API version.

## Service days and identity

`publicationId` is an opaque local database UUID. Stop, route and trip IDs are strings
scoped to it. It is useful context, not a globally portable agency identifier.
Never persist a raw ID without its publication. Pattern identity is narrower still.

Times do not wrap at midnight: **87300 = 24:15:00** on the requested service date.
Walking durations/distances and final arrivals may be fractional. They retain
JavaScript finite-number precision; no millisecond rounding or modulo changes
catchability. Access boarding readiness is rounded upward by M4 when compared to
integer transit departures. UI formatting and DST/civil-time conversion are separate
work. One service date is searched; adjacent service days are not stitched together.

## No journey and operational errors

A valid completed search with no usable journey returns **200**:

```json
{
  "status": "no-journey",
  "publicationId": "11111111-1111-4111-8111-111111111111",
  "serviceDate": "2026-09-18",
  "origin": { "latitude": 32, "longitude": -96 },
  "destination": { "latitude": 32.01, "longitude": -96 },
  "requestedDepartureTime": 100000,
  "incomplete": false,
  "journeys": [],
  "reason": "transit-unreachable"
}
```

Stable reasons: `no-nearby-access-stops`, `no-nearby-egress-stops`,
`no-reachable-access-stops`, `no-reachable-egress-stops`, `transit-unreachable`.
They describe the supplied model and budgets, not proof that no real-world route
exists. No walking-only journeys are returned. An operational failure that could
hide the missing route is an error instead.

```json
{
  "error": {
    "code": "WALKING_UNAVAILABLE",
    "message": "Walking service is temporarily unavailable.",
    "retryable": true
  },
  "requestId": "req-3"
}
```

| HTTP           | Stable error code        | Retryable | Meaning                                                                      |
| -------------- | ------------------------ | --------- | ---------------------------------------------------------------------------- |
| 400            | `INVALID_REQUEST`        | false     | Invalid fields, date/time/coordinate, JSON or query                          |
| 413            | `REQUEST_TOO_LARGE`      | false     | Body exceeds 4 KiB                                                           |
| 415            | `UNSUPPORTED_MEDIA_TYPE` | false     | Journey body is not JSON                                                     |
| 404            | `NOT_FOUND`              | false     | Metadata absent in a selected snapshot, or unknown endpoint                  |
| 503            | `NO_PUBLICATION`         | false     | No activation for the date; operator/data action needed                      |
| 503            | `WALKING_NOT_CONFIGURED` | false     | Operator must configure walking capability                                   |
| 503            | `WALKING_UNAVAILABLE`    | true      | Provider failure or invalid provider response                                |
| 504            | `WALKING_TIMEOUT`        | true      | Provider per-call deadline expired                                           |
| 503            | `PUBLICATION_CHANGED`    | true      | Correction race persisted after the bounded retry, or metadata guard differs |
| 503            | `DATABASE_UNAVAILABLE`   | true      | Connection/query/preparation storage failure                                 |
| 503            | `SERVER_BUSY`            | true      | Process admission/build/database capacity occupied                           |
| 503            | `SERVICE_UNAVAILABLE`    | true      | Shutdown has started                                                         |
| 504            | `REQUEST_TIMEOUT`        | true      | Whole-request deadline expired                                               |
| 499 (log only) | `REQUEST_CANCELED`       | false     | Client disconnected; no response is written to it                            |
| 500            | `INTERNAL_ERROR`         | false     | Unexpected service failure; details remain private                           |

Client logic should branch on `code`, not the concise message. Retryable does not
instruct an immediate tight retry loop. Use backoff and cancel obsolete searches.
The missing-provider check precedes schedule access; it reports capability even
when a date might also lack activation. Errors contain no raw SQL/provider detail,
stack trace, connection string or filesystem path. Header/parser errors rejected
by Node before Fastify receives a request retain Node's transport semantics.

## Metadata and nearby stops

A real service date is mandatory, with no implicit today or newest-feed fallback.
Stop/route responses are `{ publicationId, serviceDate, data: Stop | Route }`.
They describe records in the activated publication, not proof a route or stop has
boardable service on that date. No schedule is prepared for these reads.

Stop/route requests may also supply `publicationId=<UUID>` as an equality guard.
A mismatch returns `PUBLICATION_CHANGED`; it does not select arbitrary historical
publications. This prevents a client following an old itinerary from mistaking a
corrected same-ID record for the original. Journey references avoid this extra trip.

Nearby requests accept only date and decimal-string coordinates. Radius/count
are fixed at 1,200 m / eight candidates. Output is
`{ publicationId, serviceDate, stops: [{ stopId, name, coordinate,
candidateDistanceMeters }] }`. Distance is geographic pruning distance, **not
walking distance** or evidence of pedestrian connectivity. This fulfills the
roadmap's nearby-stop read without autocomplete/search/discovery UI.

SQL values are parameterized. One read-only repeatable-read transaction selects
activation and metadata/candidates. Missing activation or database failure is
never a 404. The existing composite keys and spatial index suffice; measured query
plans and timings are recorded in the review. No schema/index migration was needed.

## Runtime ownership

The existing worker workspace now exposes `@dallas-transit/transit-ingest/runtime`,
a narrow read-only module entrypoint for schedule loading, candidate lookup,
provider adapters and orchestration. These files remain beside the established
CLI/SQL adapter, avoiding a new workspace or API-to-worker entrypoint side effects.
The runtime import graph does not load the importer, ZIP handling, migration or
activation-mutation code. The loader's date check uses the existing GTFS parser.
The separate `/testing` export shares original fixture helpers with integration
tests only. No CLI entrypoint starts when either subpath is imported.

`apps/api` owns schemas, serialization, HTTP outcomes, admission, request lifetime,
prepared schedules, pool and server shutdown. The reusable planner accepts an
optional `AbortSignal` and remains usable by the existing CLI. `packages/router`
is unchanged: no pg, database, Fastify, HTTP, provider fetch, cache or UI dependency.

## Prepared schedule lifecycle

- Key: `[sourceKey, publicationId, serviceDate, changeSeconds]`. Production source
  is `dart`; no request can select another agency. Policy is fixed for the process.
- Every lookup first reads activation. Cache hits never skip date/publication
  selection. A different activation invalidates retained entries for that date.
- Default **two** retained schedules (configurable 1-4), least-recently-used eviction.
  A five-minute TTL runs from successful preparation, not last access. Expiration
  is lazy on the next lookup; there are no eviction timers. Idle expired entries
  may remain until that lookup/close, always within the entry bound.
- Exactly **one build** may run per process. Same-key callers share its promise;
  different-key misses while busy receive `SERVER_BUSY`, with no build queue.
- Failed/aborted builds are removed. There is no negative cache or permanent failure
  memoization. Later requests can retry. A build is canceled after its final waiter
  leaves; canceling one waiter never cancels another's shared work.
  New callers encountering an aborted build still releasing its resources get
  `SERVER_BUSY` until cleanup finishes, never the departed caller's cancellation.
- Candidate lookup verifies the pinned publication in its own repeatable-read
  snapshot. A mismatch invalidates that key and restarts preparation/planning at
  most once. A loader returning a different date/publication gets the same bounded
  correction handling. No provider calls have started when this race is detected.
- A correction after candidate snapshot acquisition does not invalidate that
  already coherent request: schedule, candidates and references remain pinned to
  the old publication. The response declares its identity. A subsequent request
  rechecks activation. Removal of stored pinned records fails explicitly.
- Retention bounds count cached entries, not bytes. One build and bounded active
  requests can temporarily retain evicted schedules. Each process has its own cache;
  restart is cold. There is no distributed consistency or Redis layer.

## Pool, cancellation, deadlines and shutdown

One `pg.Pool` per service, default four connections (1-16). Acquisition timeout is
2 s, statement timeout 5 s, idle transaction timeout 5 s and idle connection timeout
30 s. A pool client is reserved for an entire adapter transaction, then released
before walking calls. Failed/uncertain transactions destroy that client. No
transaction is spread over `pool.query` calls. Node-postgres documents these
[pool ownership rules](https://node-postgres.com/apis/pool) and
[client settings](https://node-postgres.com/apis/client).

Client disconnect (including after body upload) and server shutdown abort the
request. The deadline starts at Fastify's `onRequest`, includes body receipt,
schedule wait/preparation, SQL, walking, composition and reference lookup, and
returns structured 504 while a response is possible. Incomplete body uploads get
`Connection: close`. It defaults to 15 s, bounded configuration 100-30,000 ms;
clients cannot extend it. Other service reads have a 5 s deadline. The transport
also bounds request receipt separately. Per-provider timeout is **3 s**, not the
whole-request limit.

Cancellation reaches shared-load waiters, candidate SQL, queued walking work,
in-flight provider fetch/body reads, and reference SQL. Database cancellation
destroys the request-owned connection; PostgreSQL also enforces statement timeout.
A canceled pending pool acquisition retains admission until its eventual client
is destroyed or acquisition times out; late clients are not leaked. Pool admission
is bounded to `poolSize + 16` outstanding uses, including canceled acquisitions.
No more provider calls start after cancellation.

Synchronous schedule building/transit composition cannot be preempted by an event
loop timer or newly arriving disconnect. They finish their current synchronous
work. The API checks elapsed time before subsequent phases and response, and aborts
avoidable async work. No worker threads or transit algorithm rewrite was added.
Custom providers must honor their signal; a JavaScript promise cannot forcibly
stop arbitrary third-party code. The wrapper stops waiting and clears its own
timers/listeners even when a test provider ignores cancellation.

Configuration is validated before socket startup. Startup probes resources once,
without preparing a schedule. Missing database/schema/provider does not crash the
process; probes report readiness/capability. `preClose` stops new work and aborts
active requests; `onClose` clears/aborts schedule resources and ends the pool.
SIGINT/SIGTERM call Fastify close. App construction remains separate from listen.

## Budgets, rate limits and deployment

| Server policy                            |                       Value |
| ---------------------------------------- | --------------------------: |
| Candidate radius                         |                     1,200 m |
| Access / egress candidates               |                       4 / 4 |
| Provider calls / concurrency per journey |                       8 / 2 |
| Provider per-call deadline               |                    3,000 ms |
| Transit pair searches                    |                          16 |
| Returned journeys                        |                           3 |
| Maximum transfers                        |        3 (caller may lower) |
| Concurrent journey requests              |         4, configurable 1-8 |
| Concurrent builds                        |   1, same-key single-flight |
| Concurrent metadata/readiness reads      |                          16 |
| Same-stop change allowance               | 120 s, configurable 0-1,800 |

These API policy values are distinct from M4's larger internal safety ceilings.
`TRANSIT_CHANGE_SECONDS` remains an explicit scenario assumption, **not verified
DART station circulation time**. It never delays initial boarding. Candidate
radius/count pruning limits completeness; the API does not allow arbitrary expansion.

Admissions fail immediately with 503 instead of retaining unbounded queues. At the
default four journeys and two provider calls each, cooperating providers have at
most eight concurrently active calls per process. CPU scans are synchronous and
can delay other requests; admission is resource protection, not a throughput SLA.

Public rate limiting belongs at a trusted ingress/proxy that knows client identity
and coordinates replicas. No per-process IP limiter claims global protection.
Before public deployment, configure edge rate/connection/body/time limits, bounded
replica/pool/provider capacity and suitable memory. Keep application budgets even
behind a proxy. Redis is not justified by these measurements or introduced here.

Same-origin web/API deployment is expected. No permissive CORS headers or CORS
middleware are installed. Local web development can use a same-origin dev proxy
when Milestone 6 implements API calls; cross-origin browser access is not enabled
in this milestone. Reverse proxies must also avoid logging precise query coordinates.

Walking URL is server-only, explicitly configured, and validated by the same M4
HTTP(S) `/route` checks. Credentials, query, fragment and redirects are rejected.
No public demo fallback, caller-controlled fetch target, account or credential
workflow exists. Loopback/private URLs remain valid for operator-hosted services;
this is a trusted configuration boundary, not an arbitrary URL-fetching endpoint.
There is no synthetic provider option in the serving entrypoint.

## Health, logs and configuration

`/health` returns 200 `{ "status": "ok" }` without storage/provider work.
`/ready` checks connectivity, required migration ledger/schema/function/PostGIS,
and existence of a DART activation. It performs no schedule build or external route.
It returns 200 only when database, schema and schedule capabilities are available,
otherwise 503, with booleans `database`, `schema`, `schedule` and:

```json
{
  "capabilities": {
    "metadata": true,
    "journeys": false,
    "walkingConfigured": false
  }
}
```

An unconfigured walking provider disables only journey capability, not global
metadata readiness. A journey-serving deployment should additionally require
`capabilities.journeys`. Configuration presence does not prove provider health.
Schedule readiness means some activation exists, not that today's date is covered;
per-request date selection remains authoritative. Coverage monitoring is deferred.

Fastify structured logs record server-generated request ID, route template, HTTP
status, coarse duration, cache hit/miss/shared, preparation/lookup, candidate,
provider, composition/reference timings and safe failure categories. Built-in raw
request/error logs are disabled via the pinned Fastify LogController. URLs, body
coordinates, SQL, provider bodies, connection strings and stack traces are not
logged at normal levels. Timing fields are operational observations, not V1 response
fields or a telemetry platform.

See `apps/api/.env.example`: `DATABASE_URL` (explicit in production), `HOST`, `PORT`,
`DATABASE_POOL_SIZE`, optional `WALKING_VALHALLA_URL`, `JOURNEY_TIMEOUT_MS`,
`JOURNEY_CONCURRENCY`, `SCHEDULE_CACHE_ENTRIES`, `SCHEDULE_CACHE_TTL_MS`,
`TRANSIT_CHANGE_SECONDS`. Blank/malformed/out-of-range values fail startup.
No `.env` or credential-bearing provider URL is committed.

## Development and validation

```sh
pnpm install --frozen-lockfile
pnpm infra:up
pnpm gtfs migrate
pnpm dev
# In another terminal, inspect http://127.0.0.1:3001/health and /ready.
pnpm test:api
pnpm test:integration
pnpm api:validate --mode fixture
# Optional: requires retained DART publication activated for 2026-09-18.
pnpm api:validate --mode retained-dart
# Ctrl+C stops the apps; preserve the database volume:
pnpm infra:down
```

A migrated empty database needs a deliberately imported/activated publication;
startup never imports or activates data. The offline fixture command needs neither
Docker nor a provider. Retained mode reads existing data and labels all walks
**SYNTHETIC ONLY** (constant 60 s / 100 m, no connectivity claim). Both use the actual
Fastify injection/serialization path, report first/reused timings and close resources.
Retained mode also reports metadata query plans. The CLI never calls public walking
infrastructure. Actual local socket and process startup are validated separately.

CI runs offline API/planner fixtures and isolated PostGIS tests. Original synthetic
fixture databases use unique names and are removed; normal DART publications remain
untouched. No internet, DART download or public-provider credentials are needed in
tests. Frozen install, formatting, lint, types, all regression tests, build, Compose
and workflow validation are recorded in [the Milestone 5 review](MILESTONE_5_REVIEW.md).

## M6A place-search addition

`GET /v1/places/search?q=...` is a separate, provider-neutral read. Query is a
trimmed string of 2–160 characters, with no extra fields or provider URL. Results
are bounded to six places with `name` (1–160), optional `context` (up to 240), and
finite numeric `latitude`/`longitude` in geographical bounds. Provider IDs/extra
fields are stripped. A selected place needs no persistent backend identity.

```json
{ "status": "unavailable", "reason": "not-configured", "places": [] }
```

Normal startup returns that HTTP 200 capability state deliberately. An explicitly
injected `PlaceSearchProvider.search(query, { limit, signal })` can return an array
of public place records; success serializes `{ status: "ok", places: [...] }`.
An empty successful array means no match. Rejection or invalid provider data
returns `unavailable / provider-unavailable`, never fake results or private errors.
It reuses the existing 16-read admission gate, five-second whole-request deadline,
disconnect/shutdown signal, safe errors and no-store policy. Provider cancellation
must cooperate; the API also stops waiting if an adapter ignores its signal.
No database search, new SQL or migration is introduced. No external geocoder,
terms, credentials or production fixture mode is selected. Implementing a real
adapter is gated on human provider approval.

## Limits carried forward

No walking-only result, street/transit geometry, geocoding/autocomplete, UI prose,
realtime, risk score, verified platform/accessibility guidance or adjacent-date/DST
conversion. Trip headsigns are retained but per-visit headsign overrides are not yet
exposed. Walking services must be explicitly operated/authorized before usable
street journeys are served. DART data-use terms remain a separate public-deployment
gate. CPU preemption, coverage monitoring, richer station policy and distributed
operations require later evidence; none is silently implemented here.

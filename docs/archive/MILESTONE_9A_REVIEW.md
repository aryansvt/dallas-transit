# M9A — Production provider integration

Scope: internal provider checkpoint only. No deployment, account changes, terms
acceptance, OTP rerun, or DART realtime enablement. Owner-performed local provider
and visual smoke checks are complete, as recorded below.
No added production dependencies; accepted ADRs and the RAPTOR router are unchanged.

## Provider architecture

- General destinations: Mapbox Search Box v1 in a browser adapter, behind
  `PlaceSearchSession`. A public URL-restricted token works directly from its
  authorized origin. Provider response objects and IDs stay inside the adapter.
- DART stops: Fastify `/v1/places/search?q=...&serviceDate=...` queries the activated
  static publication in PostGIS. Optional `publicationId` detects mismatches.
- Basemap: Mapbox Light v11 through documented Static Tiles, rendered by MapLibre.
  Raster tiles avoid incompatible Mapbox style extensions and extra SDKs; labels
  are baked into the basemap. The map retains the existing journey-point display.
- Access/egress: server-side Geoapify v1 Routing, explicit `walk`/metric/GeoJSON.
  LineFinder's router and M8 realtime architecture remain responsible for transit.

## Search behavior and storage

Search debounces 250 ms, cancels superseded work immediately, runs both sources
concurrently, and returns at most six suggestions. Selection retrieves only the
chosen external feature. UUIDv4 session tokens are reused across keystrokes and
discarded after Retrieve, local selection, clearing, closure, or abandonment.
The adapter conservatively rotates before 180 seconds and 50 Suggest calls.
The UI clears abandoned suggestions after 175 seconds. No search cache persists.

GTFS uses a punctuation-normalized `simple` text-search GIN index, all-word token
prefix matching, a 160-character/20-token bound, six rows, and a 1.5-second SQL
statement timeout within the API's five-second read deadline. Ties use exact name,
name prefix, name, then stop ID with deterministic C collation. Stop/publication
IDs survive normalization; platforms/parent stations are not invented or inferred.
These are publication stops, not a guarantee of service at the selected minute.

Combined ordering uses explicit tiers: exact transit name, exact external name,
transit-name prefix for an explicit station/stop query, other external results,
then other stops. Provider order breaks ties. Deduplication requires a shared
identity; similarly named entities and distinct stop IDs remain separate.
Saved device places remain available, with transit results visibly labeled.

Search Box results are marked temporary and excluded at every saved/recent storage
boundary, including direct writes. GPS origin remains memory-only. Coordinates
never enter share URLs or ordinary logs. Mapbox receives search text and consented
location bias when available; otherwise a fixed Dallas-region ranking bias is used,
without a bounding box. Map tiles reveal viewport context; Geoapify receives the
walking endpoints. No analytics, accounts, replay, or advertising were introduced.

## Maps, walking, and failures

MapLibre remains lazy/offscreen-aware; journey updates retain its instance and
selected-journey vehicle marker reuse. Mapbox logo (vendored unchanged from its
attribution example), Mapbox/OSM links, and feedback attribution are present.
Keyboard controls and textual itinerary alternatives remain available.

Geoapify uses HTTPS with redirects disabled, exactly two validated endpoints,
three-second cancellation/deadline handling, a streamed 1 MiB response cap,
bounded valid geometry, endpoint snapping tolerance, and finite/plausible
distance/duration checks. Geometry is validated then discarded at the existing
metric-only walking boundary; no new walking-path display is claimed. Zero-distance
identical endpoints need no provider request. No straight-line fallback exists.

Either search source survives the other's failure; timeout, quota, access, empty,
and unavailable states are distinct. Walking failures reuse existing explicit API
errors and incomplete-options behavior. Schedules/stop metadata remain readable.
Geographic planning still requires usable access AND egress walks; exact-stop
connections can proceed with zero-length walks. Missing production configuration
fails validation; credential-free development/preview remains available.

## Configuration and provider documentation

- `apps/web/.env.local`: `NEXT_PUBLIC_MAPBOX_TOKEN=pk.<public-token>`; required for
  production builds, public in browser assets. Use only public scopes and restrict
  allowed origins. Existing `TRANSIT_API_ORIGIN` stays server-only.
- `apps/api/.env`: `GEOAPIFY_API_KEY=<private-key>`; required in production, never
  exposed through Next.js. Existing `DATABASE_URL` and API budgets still apply.
- `WALKING_VALHALLA_URL` remains only for explicit local/reference validation and
  cannot coexist with Geoapify. Production requires Geoapify. Endpoint versions
  are fixed documented HTTPS APIs; there is no user-controlled proxy URL.
- Apply `002_stop_search.sql` through the existing migration command before use.
  CI's build step uses an inert public-token placeholder, without network access
  to authenticated providers. Never deploy that placeholder.

References checked 2026-09-25: [Search Box API](https://docs.mapbox.com/api/search/search-box/),
[Search sessions and map-service requirements](https://docs.mapbox.com/mapbox-search-js/api/core/search_session-md/),
[Static Tiles](https://docs.mapbox.com/api/maps/static-tiles/),
[Mapbox attribution](https://docs.mapbox.com/help/dive-deeper/attribution/),
[Geoapify Routing](https://apidocs.geoapify.com/docs/routing/).
Search Box data is temporary-use only; no permanent-storage or redistribution
rights are assumed. Search results use Mapbox map services, not another basemap.
Mapbox sessions terminate on Retrieve, 180 seconds without Retrieve, or 50 Suggest
calls. Static Tiles are request-billed; no plan was selected or enabled. Final
account/legal/public-release approval remains a later owner checkpoint.

## Validation and performance

Passed: 161 targeted unit/component/API tests, seven PostGIS integration tests,
affected-package type checks, API/shared and web lint, changed-file formatting,
and the web production build with an inert public-token fixture. No Geoapify
server integration code or key variable appears in browser build chunks.

Deterministic tests cover provider normalization, session lifecycle, selection,
timeouts/cancellation, HTTP/malformed/oversized failures, prefix/ambiguous stop
search, publication scoping, partial failures, ranking, temporary storage, map
configuration/attribution and instance reuse. No ordinary test calls a live provider.
SQL tests use an isolated disposable local database, including 12,000 synthetic stops.
`EXPLAIN` confirms the GIN index is used. After `ANALYZE`, 20 warm API searches
measured 5.9 ms median / 6.8 ms p95 locally (not a production SLA). Controlled
120/180 ms search sources complete together in 180 ms, after the UI's 250 ms
debounce; an 80 ms walking response adds no scheduling delay. Map tests confirm
one initialization across ordinary journey updates and zero while offscreen.
Reported latency measurements use controlled mocks; no production-network latency
is claimed.

## Owner-performed local provider and visual checks

The owner completed these checks using private, ignored local environment files:

- Real Mapbox Search Box worked for West End Station, UT Dallas, DFW Airport,
  and American Airlines Center; authoritative LineFinder GTFS stop results and
  Mapbox results appeared together.
- A real Mapbox Light basemap rendered through MapLibre with required attribution.
  Pan/zoom, Fit trip, inline map, and expanded map were visually checked.
- A real Northside Apartments → AMC Village On The Parkway journey produced
  transit options with nonzero walking through the configured Geoapify provider.
- The “Your Journey Now” boarding, status, and replanning affordance polish was
  reviewed. No DART realtime access was enabled.
- No credentials were printed, committed, or copied into documentation.

These are owner-reported local smoke checks, not CI or deployment validation.

Exact validation commands (PowerShell, from repository root):

```powershell
pnpm --filter @dallas-transit/shared... --filter @dallas-transit/transit-ingest... build
pnpm exec vitest run packages/shared/src/provider-http.test.ts apps/api/src/geoapify-walking.test.ts apps/api/src/places.test.ts apps/api/src/config.test.ts apps/api/src/app.test.ts apps/web/src/lib/mapbox-search.test.ts apps/web/src/lib/place-session.test.ts apps/web/src/lib/map-config.test.ts apps/web/src/lib/api.test.ts apps/web/src/lib/local-places.test.ts apps/web/src/components/place-search.test.tsx apps/web/src/components/transit-app.test.tsx apps/web/src/components/journey-map.test.tsx apps/web/src/components/map-lifecycle.test.tsx apps/web/src/components/about.test.tsx
pnpm infra:up
pnpm exec vitest run --config vitest.integration.config.ts apps/api/src/api.integration.test.ts --reporter=verbose
pnpm --filter @dallas-transit/api --filter @dallas-transit/web --filter @dallas-transit/shared typecheck
pnpm exec eslint apps/api/src packages/shared/src
pnpm --filter @dallas-transit/web lint
$env:NEXT_PUBLIC_MAPBOX_TOKEN='pk.build-fixture-placeholder'
$env:NEXT_TELEMETRY_DISABLED='1'
pnpm --filter @dallas-transit/web build
```

Run the build fixture environment assignments in a disposable shell. No manual
smoke tooling was added. GitHub CI remains the later broad regression gate.

Remaining M9: hosting/database provisioning, production environment configuration,
deployment, DNS, monitoring, feed operations, and final legal/public-release
approval. Local smoke completion does not establish production readiness or
authorize release. No deployment or later M9 checkpoint began in M9A.

# START HERE — Dallas Transit Navigator

This file is the master checklist for the project. Work through it in order.

The goal is to build a serious, open-source, mobile-first Dallas/DART transit navigator that:
- starts from a destination-first experience: “I want to go to X. Tell me exactly how.”
- plans end-to-end bus and rail journeys
- identifies the concrete stops, routes, directions, and transfers to use
- uses live vehicle / delay / alert data where DART makes it available to independent developers
- can react when a delay threatens a connection
- implements its own RAPTOR-style transit routing engine
- uses OpenTripPlanner as a development/reference oracle, not the production routing engine
- is deployed and usable on a phone as a PWA
- is open source in a contributor-friendly way
- is paired with external open-source contributions to projects you do not own

The product remains Dallas/DART-focused. The core routing/data architecture should avoid unnecessary DART hard-coding. After Dallas is polished, one second transit agency may be added only to prove portability.

---

# PHASE 0 — Prepare your machine

## 0.1 Confirm required software

You should have:
- Git
- GitHub account
- VS Code
- Node.js LTS
- npm
- Docker Desktop
- PostgreSQL client tools are optional locally because Docker can host the database
- a modern browser
- Codex CLI and/or Codex VS Code extension

Run:

```powershell
git --version
node --version
npm --version
docker --version
docker compose version
```

If one fails, fix it before scaffolding the app.

## 0.2 Install pnpm

```powershell
npm install -g pnpm
pnpm --version
```

## 0.3 Install Codex

On Windows, the current official standalone installer is:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

Alternative:

```powershell
npm install -g @openai/codex
```

Then:

```powershell
codex
```

Choose **Sign in with ChatGPT** when prompted.

Also install the official Codex extension in VS Code and open it from the Codex icon or via the Command Palette.

## 0.4 Install Docker Desktop

Use Docker Desktop so PostgreSQL/PostGIS and Redis can run locally without polluting your Windows setup.

Verify Docker is running before moving on:

```powershell
docker run hello-world
```

## 0.5 Git identity

Check:

```powershell
git config --global user.name
git config --global user.email
```

Set them if necessary.

---

# PHASE 1 — Create the repository correctly

## 1.1 Pick a temporary project name

Do not stall for branding.

A temporary repository name can be:

```text
dallas-transit
```

You can rename it later.

## 1.2 Create the GitHub repository

Recommended initial settings:
- Public repository
- No generated README if you are using this starter kit
- Apache-2.0 license can be added manually from GitHub or as a file
- Do not add secrets
- Do not enable random GitHub Apps yet

Clone it:

```powershell
cd C:\Users\<YOU>\OneDrive\Documents\GitHub
git clone https://github.com/<YOUR_USERNAME>/dallas-transit.git
cd dallas-transit
```

## 1.3 Copy this starter kit into the repository

Copy the contents of this starter kit so that `AGENTS.md`, `README.md`, `docs/`, `.github/`, and the other files sit at the repository root.

Then:

```powershell
git status
git add .
git commit -m "docs: establish project specification and architecture"
git push -u origin main
```

This first commit should contain project intent and rules, not generated application code.

---

# PHASE 2 — Make Codex understand the project before it writes code

Codex reads `AGENTS.md` before work. The repository also contains deeper design files.

From the repository root, run:

```powershell
codex --ask-for-approval never "Summarize the current project instructions and list the instruction files you used. Do not modify any files."
```

Then ask:

```text
Read AGENTS.md and all current documentation under docs/.

Do not modify anything.

Explain:
1. what product we are building,
2. what is in scope for V1,
3. what is explicitly out of scope,
4. the intended frontend/backend/data architecture,
5. the route-ranking priorities,
6. how our own routing engine differs from OpenTripPlanner's role,
7. how realtime data should be handled,
8. what remains technically unknown.

Do not start coding.
```

If Codex misunderstands anything, fix the documentation first.

Do not proceed until Codex can accurately restate the project.

---

# PHASE 3 — Milestone 0: data feasibility before application code

This is mandatory.

Do not build the frontend first.

The biggest external dependency is DART data availability.

## 3.1 Validate DART static GTFS

DART officially publishes a single GTFS Schedule dataset covering:
- bus
- light rail
- TRE
- M-Line
- streetcar

Download the current official GTFS Schedule feed manually first.

Create a scratch folder outside tracked source:

```text
data/
  raw/
    gtfs/
```

Do not commit the raw feed unless licensing and repository size make that explicitly appropriate.

Inspect at minimum:
- agency.txt
- routes.txt
- stops.txt
- trips.txt
- stop_times.txt
- calendar.txt and/or calendar_dates.txt
- shapes.txt if present
- transfers.txt if present
- pathways.txt if present
- frequencies.txt if present

Document:
- file count
- row counts
- route types
- service calendars
- whether station/stop hierarchy is used
- whether shapes are present
- transfer data quality
- any DART-specific quirks

Put findings in:

```text
docs/DATA_FEASIBILITY.md
```

## 3.2 Validate realtime availability

DART publicly states that it distributes GTFS-Realtime data including:
- vehicle locations
- delays / arrival predictions
- service changes / alerts

However, the application must not rely on an undocumented endpoint.

Research and document:
- the actual independent-developer access path
- URLs/endpoints
- whether authentication is required
- rate limits
- usage terms
- whether feeds include VehiclePositions
- whether feeds include TripUpdates
- whether feeds include Alerts
- how often feeds update
- whether bus and rail behave differently
- entity identifiers and how reliably they match the static GTFS trip IDs

If public access cannot be confirmed:
- continue building the static routing engine
- create a realtime provider interface
- use fixtures/mocks
- do not scrape GoPass
- do not hard-code unofficial endpoints as production dependencies

## 3.3 Make data feasibility the first GitHub issue

Example:

```text
#1 Research and document DART GTFS + GTFS-Realtime data contract
```

Acceptance criteria:
- static feed source confirmed
- current feed downloaded
- file inventory documented
- realtime access path either confirmed or explicitly unresolved
- rate/usage constraints documented
- sample entities saved as test fixtures if legally appropriate
- no application architecture assumes unavailable data

Commit the findings.

---

# PHASE 4 — Scaffold the monorepo

Only after Milestone 0.

Use a pnpm workspace.

Target shape:

```text
dallas-transit/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── domain/
│   ├── gtfs/
│   ├── router/
│   ├── realtime/
│   └── shared/
├── workers/
│   └── transit-ingest/
├── infra/
│   └── docker/
├── docs/
├── .github/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
└── docker-compose.yml
```

## 4.1 Root package.json

Create a private workspace root.

Scripts should eventually include:

```text
dev
build
lint
typecheck
test
test:integration
test:e2e
format
```

## 4.2 TypeScript configuration

Use strict TypeScript.

Create a shared base `tsconfig`.

Important goals:
- `strict: true`
- no accidental `any`
- package boundaries
- aliases only where they genuinely simplify imports
- avoid path-alias magic that breaks test/build tools

## 4.3 Linting and formatting

Pick one consistent stack.

A reasonable choice:
- ESLint
- Prettier

Do not waste days on style configuration.

## 4.4 Docker compose

Initial services:
- PostgreSQL with PostGIS
- Redis

Do not add Kafka, Kubernetes, Elasticsearch, or other infrastructure without a demonstrated need.

---

# PHASE 5 — Define the transit domain before persistence

Create `packages/domain`.

Define domain-level types separate from database rows.

Initial concepts:
- Agency
- Route
- Stop
- Station
- Trip
- StopTime
- ServiceCalendar
- Shape
- Transfer
- Footpath
- Journey
- JourneyLeg
- TransitLeg
- WalkingLeg
- VehiclePosition
- TripUpdate
- ServiceAlert

Keep the routing engine dependent on domain types, not SQL models.

This is important because:
- routing tests become deterministic
- the router can run without a database
- portability improves
- persistence details do not leak into algorithm logic

---

# PHASE 6 — Build GTFS ingestion

Create `packages/gtfs` plus the ingestion worker.

Do this incrementally.

Suggested order:
1. agency
2. routes
3. stops
4. trips
5. calendar/calendar_dates
6. stop_times
7. shapes
8. transfers/pathways if available

For each file:
- parse
- validate required fields
- normalize types
- reject malformed critical records
- surface warnings for tolerable anomalies
- add fixture-based tests

Do not write one enormous import function.

## 6.1 Database schema

Use PostgreSQL + PostGIS.

Important indexing:
- stable identifiers
- route_id
- trip_id
- stop_id
- service_id
- stop_times by trip and sequence
- stop_times by stop/time if used for lookups
- GiST spatial index on stop geometry
- geometry/geography choice documented in an ADR

## 6.2 Import idempotency

Re-importing the same feed should not corrupt the database.

Think through:
- feed versioning
- transactional swap / staging tables
- what happens when DART publishes a new schedule
- preserving any historical data
- invalidating route caches

Do not solve historical analytics in V1, but do not design yourself into a dead end.

---

# PHASE 7 — Build the routing engine as an independent package

This is one of the flagship parts of the project.

Create `packages/router`.

Initial algorithm direction: RAPTOR-style round-based public-transit routing.

## 7.1 First router scope

Start with:
- fixed origin stop
- fixed destination stop
- departure time
- schedule only
- no walking
- no realtime
- maximum transfer count

Return:
- earliest arrival
- complete path reconstruction
- route/trip/stop sequence
- transfer count

## 7.2 Then add nearby stop access

Input becomes geographic origin/destination.

Steps:
1. find reachable origin stops
2. assign walking/access time
3. route through transit
4. include destination egress walking

## 7.3 Then add transfer/footpath relaxation

Support:
- same-station transfers
- explicit GTFS transfers
- safe short walking transfers where justified

## 7.4 Route ranking

Locked user priority:

1. earliest arrival
2. fewer transfers
3. less walking
4. lower transfer risk

Do not collapse this into a mysterious weighted score.

Prefer lexicographic / Pareto-style itinerary handling.

Generate a small useful set of alternatives.

## 7.5 Path reconstruction

Do not stop at “arrival time = X”.

The router must reconstruct:
- boarding stop
- exact trip
- route
- headsign/direction
- alighting stop
- transfer
- next trip
- destination leg

The frontend needs concrete instructions.

---

# PHASE 8 — Build a correctness strategy using OpenTripPlanner

OpenTripPlanner is not the production router.

Run it as a reference implementation in development.

Build a corpus of known Dallas journeys such as:
- UTD area to Downtown Dallas
- Richardson to Deep Ellum
- Richardson to DFW Airport
- Richardson to Dallas Love Field
- rail-only trip
- bus-only trip
- bus-to-rail trip
- two-transfer trip
- early morning / late evening edge cases
- weekend service
- service calendar boundary

For each:
- store test date/time explicitly
- compare itinerary feasibility
- compare earliest arrival within a defined tolerance where appropriate
- investigate every large discrepancy

Also write hand-verified fixture tests for small artificial networks.

Artificial networks are critical because OTP agreement alone does not prove your algorithm is correct.

---

# PHASE 9 — Walking / street routing

Do not implement pedestrian street routing from scratch.

Your novel routing work should be transit routing.

Use an established walking-routing source/engine/API with licensing and rate limits reviewed.

The system needs:
- origin to first stop
- transfer walking where stations are not equivalent
- final stop to destination

Abstract it behind an interface so it can be replaced later.

Do not make V1 dependent on an expensive proprietary service if a reasonable open option exists.

---

# PHASE 10 — API server

Create `apps/api` with Fastify.

Suggested endpoint families:

```text
GET  /health
GET  /v1/stops/nearby
GET  /v1/stops/:stopId
GET  /v1/routes/:routeId
GET  /v1/routes/:routeId/vehicles
GET  /v1/vehicles/:vehicleId
POST /v1/journeys
GET  /v1/journeys/:journeyId   (only if server-side journey state is later useful)
GET  /v1/alerts
```

Main endpoint:

```text
POST /v1/journeys
```

Input:
- origin lat/lon
- destination lat/lon
- departure timestamp
- accessibility flags later if supported

Output:
- recommended itinerary
- alternative itineraries
- legs
- walking
- transfers
- scheduled times
- realtime-adjusted times where available
- transfer warnings
- map geometry references

Use schema validation.

Return stable API contracts.

---

# PHASE 11 — Realtime ingestion

Only after the static route planner works.

Create `packages/realtime` and/or `workers/transit-ingest`.

Responsibilities:
- fetch allowed GTFS-RT feeds
- decode Protocol Buffers
- validate timestamps
- map realtime entities to scheduled trips/routes/stops
- update Redis
- optionally persist selected observations later
- expose feed freshness

Never show realtime information without freshness metadata.

Important fields:
- observed_at
- feed_timestamp
- source
- vehicle_id
- trip_id
- route_id
- position
- stop_sequence if available
- delay
- occupancy only if reliably provided and appropriate

If realtime is stale:
- clearly fall back to schedule
- do not present old vehicle data as live

---

# PHASE 12 — Realtime-aware journey adjustment

Start conservatively.

V1 realtime behavior:
- annotate scheduled legs with known delay
- update ETA
- update transfer buffer
- warn when a connection becomes risky
- recommend the next valid scheduled alternative

Do not immediately build a hyper-complex continuous dynamic router.

Re-run routing when:
- important trip delay changes materially
- a cancellation affects the itinerary
- transfer feasibility crosses a threshold
- user requests refresh/replan

---

# PHASE 13 — Transfer confidence

Start deterministic.

Possible conceptual calculation:

```text
effective_buffer =
  planned_transfer_minutes
  - current_upstream_delay
  - estimated_transfer_walk_minutes
  - safety_margin
```

Then map to categories such as:
- comfortable
- tight
- at risk

Do not claim a fake percentage probability unless there is data supporting it.

Historical reliability prediction belongs in V2+.

---

# PHASE 14 — Frontend

Create `apps/web`.

Stack:
- Next.js
- React
- TypeScript
- Tailwind
- TanStack Query
- MapLibre GL JS

Primary experience is destination-first.

## 14.1 Home screen

Primary elements:
- origin: current location by default, editable
- destination search
- leave now / depart at
- recent/saved local places later
- search button

Do not make a route browser the dominant screen.

## 14.2 Results screen

Show a few useful itineraries.

Each card should quickly communicate:
- departure
- arrival
- total duration
- transfer count
- walking
- bus/train route sequence
- live delay if available
- transfer status

Default selection:
- earliest-arriving reasonable route

## 14.3 Journey detail screen

Must clearly show:
- walk to stop
- exact stop
- exact route
- correct direction/headsign
- exact scheduled trip
- live vehicle when identifiable
- vehicle location on map
- where to exit
- transfer action
- next leg
- ETA
- alerts

## 14.4 Map

Use MapLibre.

Render only journey-relevant context:
- user
- origin/destination
- boarding stop
- alighting stop
- transfer stops
- transit route shapes
- walking line
- live vehicle
- relevant nearby alternatives

Avoid dumping all DART stops on the map.

---

# PHASE 15 — PWA

Make the web app installable.

Requirements:
- manifest
- icons
- correct mobile viewport
- service worker where appropriate
- offline-safe shell if practical
- graceful handling when realtime network data is unavailable
- “Add to Home Screen” compatibility

Do not overpromise offline routing unless schedule data is intentionally packaged/cached for it.

---

# PHASE 16 — No accounts in V1

Do not add:
- login
- password handling
- profile page
- OAuth
- account database

For saved places:
- use local storage / IndexedDB where appropriate

Examples:
- Home
- Campus
- Theater
- Grocery store

Authentication can be an ADR later if a real need appears, such as synchronized saved places or notification subscriptions across devices.

---

# PHASE 17 — Testing

This project should have serious testing because routing correctness matters.

## Unit tests
- GTFS parsers
- service calendar logic
- time parsing including GTFS times past 24:00
- transfer calculations
- RAPTOR rounds
- path reconstruction
- route ranking
- realtime mapping
- stale-feed handling

## Fixture network tests
Create tiny artificial transit systems where the expected answer is obvious.

Examples:
- direct route
- one transfer
- missed transfer
- two alternatives with same arrival but different transfer count
- earlier route with more walking
- calendar exception
- trip crossing midnight

## Integration tests
- GTFS import into Postgres
- API against imported fixture feed
- Redis realtime state
- journey request

## End-to-end tests
Use Playwright:
- enter destination
- view itineraries
- open itinerary
- inspect map
- saved place local behavior

Do not write snapshots for everything. Test meaningful behavior.

---

# PHASE 18 — CI/CD

GitHub Actions should run on pull requests:
- install
- lint
- typecheck
- unit tests
- selected integration tests
- build

Later:
- Playwright smoke test
- security/dependency checks
- deployment preview

Protect `main` once the project matures:
- require PR
- require passing checks
- squash or clean merge policy

Even as a solo developer, use PRs for major features occasionally. It creates a visible engineering trail.

---

# PHASE 19 — Deployment

Do not deploy on day one.

Deploy when a vertical slice works.

Suggested first production shape:
- web: Vercel or equivalent
- API/worker: Railway, Fly.io, Render, or equivalent
- Postgres/PostGIS: managed
- Redis: managed

Do not over-engineer cloud infra just to list AWS.

Production requirements:
- environment variables
- no secrets in repo
- health endpoint
- structured logs
- basic error monitoring
- database backups
- migrations
- feed freshness monitoring
- rate limiting if needed
- CORS configured deliberately

---

# PHASE 20 — Open source correctly

Your own public repository is only one part.

The repository should include:
- Apache-2.0 license
- README
- CONTRIBUTING
- CODE_OF_CONDUCT
- SECURITY
- architecture docs
- ADRs
- issue templates
- PR template
- tests
- CI
- setup instructions
- roadmap
- real issues

Create issues for actual work.

Use labels such as:
- bug
- feature
- routing
- gtfs
- realtime
- frontend
- backend
- docs
- good first issue
- help wanted

Do not manufacture dozens of trivial issues for appearance.

---

# PHASE 21 — External open-source contributions

This is mandatory for the resume/ATS goal.

Your own repo being open source does not prove external contribution.

Target relevant ecosystems encountered naturally:
- MobilityData / GTFS tools
- OneBusAway
- Transitland
- MapLibre
- OpenTripPlanner
- libraries you genuinely use

Preferred progression:
1. one small legitimate contribution to learn the workflow
2. one code or test contribution
3. one more substantive bug fix or feature if a natural opportunity appears

For each external contribution:
- read CONTRIBUTING
- reproduce issue
- understand existing code
- discuss if required
- write tests
- make minimal change
- respond to review
- get merged
- save the PR URL in `docs/OPEN_SOURCE_LOG.md`

Do not chase typo-only PRs solely to inflate counts.

---

# PHASE 22 — Add one second agency only after Dallas is excellent

Do not market the app as nationwide.

After Dallas is:
- deployed
- usable
- tested
- realtime-capable if access exists
- polished

Add one second GTFS agency in a development/test configuration.

Purpose:
- prove router is not hard-coded to DART
- expose GTFS portability assumptions
- strengthen architecture story

You do not need to expose the second city prominently in the product UI.

---

# PHASE 23 — Resume/interview readiness

Before putting the project high on your resume, make sure you can explain:

## Product
- why you built it
- what existing apps did not satisfy for your use case
- what V1 actually does

## Routing
- RAPTOR idea
- rounds
- marked stops
- route scanning
- transfers
- path reconstruction
- route ranking
- complexity tradeoffs

## Data
- GTFS static structure
- service calendars
- stop times
- route shapes
- GTFS-Realtime
- identifier matching
- stale realtime

## Backend
- Fastify
- Postgres/PostGIS
- Redis
- worker process
- why each exists

## Frontend
- MapLibre
- PWA
- mobile-first UX
- server-state handling

## Reliability
- tests
- OTP oracle
- fixture networks
- CI
- monitoring

## Open source
- why Apache-2.0
- contribution guidelines
- external PRs
- review feedback you received

If you cannot explain a Codex-written subsystem, stop and learn it before presenting it.

---

# PHASE 24 — Recommended first 12 GitHub issues

Create these gradually, not all at once if they become stale.

1. Research and document DART GTFS + GTFS-Realtime data contract
2. Scaffold pnpm monorepo and local PostGIS/Redis infrastructure
3. Define transit domain model
4. Import GTFS agencies/routes/stops
5. Import trips/calendars/stop times
6. Add GTFS fixture-validation test suite
7. Implement direct-trip earliest-arrival routing
8. Add RAPTOR transfer rounds and journey reconstruction
9. Add origin/destination stop access + walking abstraction
10. Expose first `/v1/journeys` API
11. Build mobile-first journey search/results UI
12. Render selected itinerary with MapLibre

Realtime issues should come after static journey planning works.

---

# First Codex prompt after setup

Use this before implementation:

```text
Read AGENTS.md and all documentation under docs/.

Do not modify files yet.

Create a proposed implementation plan for Milestone 0 only:
researching and validating the DART GTFS Schedule and GTFS-Realtime data contract.

List:
- exact questions we must answer,
- files we should inspect,
- artifacts we should produce,
- risks,
- acceptance criteria,
- what should remain unimplemented.

Then stop and wait for my approval.
```

When approved, let Codex work narrowly on that issue.

Do not prompt:
“Build the entire app.”

That produces worse engineering and makes the project harder for you to understand.

---

# Definition of success

This project is successful when you can open it on your phone in Dallas, enter a destination, receive a credible bus/rail journey, understand exactly which transit legs to take, see live state where available, and trust that routing behavior is covered by tests.

The resume value follows from building that well.

# LineFinder deployment and operations

M9B is deployed at https://linefinder-dart.vercel.app. Render runs the native
Node API in Ohio; Vercel serves the web app. DART realtime remains disabled.
The settings below reconcile the owner's successful deployment. M9C changes are
local until separately approved; no deployment is implied by this document.

## 1. Render project and database

1. Sign in/create your Render account and project; review billing yourself.
2. New → Postgres: name `linefinder-db`, region **Ohio**, PostgreSQL **18**,
   database `linefinder`. Choose a **paid persistent** compute instance. Confirm
   its RAM, storage, backups and suspend/resume terms before purchase. Start with
   enough space for two feed publications plus indexes/import staging; measure
   the approved archive locally before choosing storage. Do not select Free.
3. Wait for Available. Retain the internal connection URL privately. Disable
   external access unless doing an owner-administered import; then allow only the
   operator's IP temporarily. API and database must share account and region.
4. Confirm `postgis` is listed by `SELECT name FROM pg_available_extensions WHERE
name='postgis';`. Migration 001 enables it; inability to enable it blocks release.

Manual configuration is intentional: paid plan labels/prices and dataset memory
requirements are not pinned by an unverified Blueprint. The owner records the
selected compute/storage plans in their private operations notes. The retained API tier is $7/month, 0.5 CPU / 512 MB. Owner-observed M9B manual
route load was roughly 180-190 MB steady and 230-250 MB peak. These measurements
are not a future capacity guarantee. Re-measure M9C candidate/search changes,
cold starts, both cached service dates and concurrent requests before deployment.
[Render regions](https://render.com/docs/regions),
[Postgres creation/TLS/access](https://render.com/docs/postgresql-creating-connecting),
[PostGIS support](https://render.com/docs/postgresql-extensions),
[current pricing](https://render.com/pricing).

## 2. Render API settings

Create a **Web Service**, connected to the GitHub repository, in the same project:

| Setting            | Value                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Name               | `linefinder-api`                                                                            |
| Runtime            | Node (native)                                                                               |
| Region             | Ohio                                                                                        |
| Branch             | `main`, only after separately approved merge and green CI                                   |
| Root Directory     | Empty (repository root)                                                                     |
| Instance           | Current $7 / 0.5 CPU / 512 MB paid instance; one instance                                   |
| Build command      | `pnpm install --frozen-lockfile --prod=false && pnpm --filter @dallas-transit/api... build` |
| Start command      | `node apps/api/dist/server.js`                                                              |
| Pre-deploy command | Empty; migrations are an explicit operator step                                             |
| Health Check Path  | `/ready` (bootstrap completed)                                                              |
| Auto-Deploy        | **After CI Checks Pass**                                                                    |
| Persistent disk    | None                                                                                        |

`corepack enable` failed on Render because `/usr/bin/pnpm` was read-only. The
build command above is the observed successful command.

Set environment values privately in Render (never repository files):

| Variable                 | Value                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| `NODE_ENV`               | `production`                                                      |
| `NODE_VERSION`           | `24.21.0` (also pinned in `.node-version`)                        |
| `DATABASE_URL`           | Render **internal** URL with `?sslmode=require`                   |
| `GEOAPIFY_API_KEY`       | Owner's private Geoapify key                                      |
| `TRANSIT_PROXY_KEY`      | Random 32-byte base64url secret; same secret in Vercel Production |
| `DATABASE_POOL_SIZE`     | `4`                                                               |
| `JOURNEY_TIMEOUT_MS`     | `15000`                                                           |
| `JOURNEY_CONCURRENCY`    | `4`                                                               |
| `SCHEDULE_CACHE_ENTRIES` | `2`                                                               |
| `SCHEDULE_CACHE_TTL_MS`  | `300000`                                                          |
| `TRANSIT_CHANGE_SECONDS` | `120`                                                             |

Generate the shared key in a private password manager. Do not paste it into source,
public tickets or build commands. Omit `HOST` (defaults to `0.0.0.0` in production)
and `PORT` (Render injects it). Do not copy the local `.env` example wholesale.
Omit `WALKING_VALHALLA_URL` and every `DART_REALTIME_*` variable.

Only `/health` and `/ready` are unauthenticated. `/v1/*` requires the shared key.
The API does not trust forwarded IP/host headers and has no permissive CORS.
TLS terminates at Render; Vercel must contact its HTTPS origin.
[Render deploy/CI settings](https://render.com/docs/deploys).

## 3. Bootstrap once, refresh deliberately

Use the Render service Shell after the first `/health` deployment, from the repo
root. Render has already created the database; **do not create/reset it in code**.

```sh
node workers/transit-ingest/dist/cli.js migrate
node workers/transit-ingest/dist/cli.js inspect --source dart
```

The migration runner serializes changes with a transaction/advisory lock, applies
001, 002, 003 and future numbered SQL files once, and records hashes. Repeating migrate
is safe; changed applied migrations fail. Check `SELECT postgis_version();` and
`SELECT name FROM public.transit_schema_migrations ORDER BY name;` in the database
console. Do not edit applied SQL or use reset to resolve a failure.

The owner must obtain the approved, current DART static GTFS ZIP and record its
legitimate public source URL and applicable use terms. No feed URL or archive is
invented or bundled here. Stop this bootstrap until that source is supplied.
Use an ephemeral private archive path in the Render shell, or import from an
owner workstation with the same checkout/build and an externally restricted
`DATABASE_URL` using `?sslmode=verify-full`. Set `NODE_ENV=production` for all
administration. Use environment variables, not credential-bearing command lines.

```sh
# Variables denote owner-supplied values; source URL must not contain credentials.
node workers/transit-ingest/dist/cli.js import --archive "$ARCHIVE_PATH" --source-url "$APPROVED_STATIC_SOURCE_URL" --source dart
node workers/transit-ingest/dist/cli.js inspect --source dart
# Use the successful feedId and dates within its reported coverage, including today.
node workers/transit-ingest/dist/cli.js activate --feed "$FEED_ID" --from "$COVERAGE_START" --through "$COVERAGE_END"
node workers/transit-ingest/dist/cli.js inspect --source dart --date "$DALLAS_TODAY"
```

Import stages a durable publication; activation is explicit and transactional.
Record feed ID/hash/coverage in private operations notes. Remove the temporary ZIP
after success; it is never needed for restarts. For workstation administration,
first run `pnpm install --frozen-lockfile` and
`pnpm --filter @dallas-transit/transit-ingest... build`; no rebuild is needed per CLI
invocation. Clear temporary database external access after importing.

Verify `GET https://<api>.onrender.com/health` → 200 and `/ready` → 200 with
`database`, `schema`, `schedule` and `capabilities.journeys` all true. `/ready`
requires both migrations, PostGIS/search index and **today's Dallas activation**;
it does not spend provider quota checking Geoapify. Switch Render health checks to
`/ready`. Missing configuration exits nonzero; unavailable dependencies keep
liveness but return unready. Nothing migrates, imports or deletes on API start.

## 4. Vercel project

Owner creates/imports the repository as a Vercel project, after CI succeeds:

| Dashboard setting                    | Exact value                                                   |
| ------------------------------------ | ------------------------------------------------------------- |
| Framework Preset                     | Next.js                                                       |
| Root Directory                       | `apps/web`                                                    |
| Include files outside Root Directory | Enabled                                                       |
| Node.js Version                      | 24.x (must satisfy repository engines)                        |
| Install Command                      | `cd ../.. && pnpm install --frozen-lockfile`                  |
| Build Command                        | `cd ../.. && pnpm --filter @dallas-transit/web... build`      |
| Output Directory                     | Framework default (`.next`)                                   |
| Production Branch                    | `main`                                                        |
| Functions                            | Keep duration >= 60 seconds; proxy exports `maxDuration = 60` |

No `vercel.json` or repository restructuring is required. Verify the package
manager/version in the first build log. Vercel uses the existing monorepo lockfile
and builds the web package's shared dependency first.
[Vercel monorepos](https://vercel.com/docs/monorepos).

Production environment variables (build **and** runtime):

- `NEXT_PUBLIC_MAPBOX_TOKEN`: owner's public `pk.` token, URL-restricted; intentionally
  present in browser assets. Never use an `sk.` token.
- `TRANSIT_API_ORIGIN`: `https://<api>.onrender.com`, no path/query/credentials.
- `TRANSIT_PROXY_KEY`: same private shared secret as Render; **no NEXT_PUBLIC prefix**.
- `NEXT_TELEMETRY_DISABLED=1`.
- `ENABLE_EXPERIMENTAL_COREPACK=1` enables the pinned pnpm@12.4.2 install.

These settings are scoped to **Production only**, not Preview or Development.

Never put `DATABASE_URL` or `GEOAPIFY_API_KEY` in Vercel. Browser transit traffic
stays at `/api/v1/*`; Next forwards only fixed routes to the server-configured
origin, adds its secret, and drops caller cookies/auth/IP headers. There are no
redirects, retries or dynamic caches; deadlines cover bodies as well as fetch.

Preview is a production build (no `/preview` fixtures). Keep Vercel preview access
protected and do not expose production secrets to untrusted PR builds. Use separate
owner-authorized backend/provider credentials, or set an inert
`TRANSIT_API_ORIGIN=https://api.example.invalid`, a nonsecret 32+ character placeholder
key, and `NEXT_PUBLIC_MAPBOX_TOKEN=pk.preview-placeholder`. The latter builds show
graceful unavailable states and do not provide working provider search/maps. Never
promote that configuration. Local `pnpm dev` retains loopback and optional credentials;
`/preview` remains development-only. Turn off the Vercel toolbar when checking CSP;
no third-party toolbar scripts are allowed by the production policy.

The deployed Mapbox public token is restricted to
`https://linefinder-dart.vercel.app`. When the domain changes, the owner updates
allowed URLs for that exact origin (and separately authorized preview/local origins), redeploys if the
public token changed, and checks search/map attribution and CSP in the browser.
Do not broadly allow all `*.vercel.app`. No provider term acceptance is implied.

## 5. Suspend and resume

**Off:** suspend the API Web Service first, then use **Suspend Database** on the
existing Postgres instance. Do not delete either resource. Leave Vercel deployed.
Transit requests fail with a useful unavailable message; provider search may still
work and is labeled as partial when stop search fails.

**On:** Resume Database → wait for Available/healthy → resume the existing API →
verify `/health`, `/ready`, and a web journey. URLs, keys and imported data remain
unchanged. No ordinary migration, rebuild, reconfiguration or import is required
by the application. Hosting may restart/redeploy its retained service artifact.
In-memory schedule indexes warm again; old journey IDs may require Find routes again.

If the stored schedule's coverage expired while suspended, deliberately refresh
and activate a current feed: preserving data does not extend its validity.
Confirm retention and remaining storage/backup charges in the owner's chosen plan;
suspension is not a promise of zero cost.
[Render's suspend/resume announcement](https://feedback.render.com/features/p/suspend-a-database),
[Postgres suspend API reference](https://api-docs.render.com/reference/suspend-postgres).

## 6. Operate, update, rollback

- Use Render logs/metrics and Vercel deployment/function status first. Observe 5xx,
  `SERVER_BUSY`, timeouts, CPU/RSS, database space/connections and feed coverage.
  Ordinary application logs exclude coordinates, queries, IPs, credentials and
  provider bodies. Review hosting log access/retention; hosts process network metadata.
- Shared authentication blocks direct API use. One API process admits a burst of
  120 units, refilling two/second; reads cost one, planning/replanning four. Existing
  read/planner/pool concurrency limits still apply. No IP identity is retained.
  This protects capacity, not fairness or DDoS resistance. Use hosting firewall
  controls if abuse occurs; do not horizontally scale this in-memory limiter without
  revisiting admission and ephemeral journey state. No silent retry loops.
- For updates: confirm CI, review new migrations, create/verify a managed backup,
  explicitly run migrate if schema changed, then deploy API and web. Use additive,
  backward-compatible migrations so the old service can run during rollout.
  Deploy/restart never runs an import. Manually monitor `/ready` and feed expiration.
- Roll back code to a known-good compatible Render deployment and Vercel deployment.
  Do not reset the database or automatically reverse migrations. For data rollback,
  deliberately reactivate a retained valid publication for the affected date range.
  Restoring a backup is a separate owner-approved data operation, never a normal restart.
- `/health` down: inspect service suspension, startup config and logs. `/ready`
  database false: check Postgres status/internal URL/TLS. Schema false: inspect
  migration ledger/PostGIS/index. Schedule false: inspect today's activation/coverage.
  Web unavailable with green `/ready`: check HTTPS origin/shared secret. Walking-only
  failures: check Geoapify quota/config; map/search-only failures: Mapbox token URL
  restrictions/quota. Never print keys or provider bodies while diagnosing.

## 7. Installability and final owner gate

The manifest has standalone display, stable ID/scope, 192/512 PNGs, maskable and
Apple icons matching LineFinder's existing mark. Regenerate with
`node scripts/generate-icons.mjs`. No service worker is registered: Chromium menu
installation no longer needs one; Safari offers Add to Home Screen. Installation
and automatic prompts vary by browser. HTTPS is required for production features.
There is no offline journey guarantee, API/provider cache or location cache added.
[Chrome installation criteria](https://developer.chrome.com/blog/update-install-criteria).

M9C must separately approve static-feed access/use and provider account terms,
chosen plans and budgets, backup/restore and suspend retention, real HTTPS/CSP and
device installation/accessibility checks, actual feed memory/latency, external
uptime checks, and public-release wording. M9B deployment has completed; these remaining owner checks are not certified by
that successful deployment. The transient-map-error fix `c7ecaec152c1c9eda7f4b6919b0604162f4ccd15` is deployed.

## M9C rollout prerequisites (not performed by the implementation pass)

Apply additive migration `003_pedestrian_interchanges.sql` before deploying the
M9C API; `/ready` checks its ledger/table. An empty graph is valid and leaves
inter-stop pedestrian transfers unavailable. It does not fabricate links.

Evidence preparation is separate from schedule import. Review pedestrian source,
walkability, publication stop IDs, valid dates, rights reference and retention
expiry before publishing an immutable graph. Restart/warm the API after adding
evidence to avoid serving its old empty graph from cache. Never copy the six
session-only Geoapify benchmark measurements into production automatically.
Retention cleanup must remove links then their graph in an owner-authorized
transaction by the stated deadline; a deadline column is not a deletion job.
See ADR 0005 and the M9C review. No network-wide provider job is approved.

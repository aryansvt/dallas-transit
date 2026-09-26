# M9B — Production deployment and hardening

Repository preparation only, on `feat/production-deployment` from clean, freshly
fetched main. No commit, push, cloud resource, payment, credential upload, DNS change,
DART realtime enablement or M9C work. No new production dependency or routing change.

## Deployment and persistence

- Native Node/Fastify on one paid always-on Render service, Ohio; production binds
  `0.0.0.0` and uses Render's `PORT`. Invalid production configuration exits clearly.
  Shutdown cancels owned work, closes the pool and has a 25-second final deadline.
- Paid persistent Render Postgres/PostGIS in Ohio. API pool and importer share
  explicit TLS handling: private Render self-signed TLS versus externally verified
  TLS. Existing pool bounds, cancellation and transaction isolation are preserved.
- Existing advisory-locked, hash-checked migration runner applies 001, 002 and future
  migrations once. Production CLI now requires a URL and refuses reset. `/ready`
  checks PostGIS, search index, both current migrations and today's Dallas activation.
- Migrate/import/activate are explicit bootstrap/refresh operations, never startup
  actions. Suspend API then database; resume database then API, verify `/ready`.
  Data survives restarts; expired feed coverage still requires a deliberate refresh.
- Vercel remains rooted at `apps/web`, with workspace install/build and tracing root.
  Exact settings, environment separation, backup, rollback and troubleshooting are
  in [DEPLOYMENT.md](DEPLOYMENT.md). Manual dashboards avoid guessed paid plan IDs.

## Boundary, security and privacy

Next's fixed-route server proxy replaces the build-time rewrite. The API origin and
shared key remain server-only; caller targets, cookies, auth and IP headers are not
forwarded. Requests have 4 KiB body/2 MiB response bounds, cancellation and a 32-second
deadline; redirects, retries and dynamic caching are disabled. Hosting HTML/network
failures become safe unavailable messages, distinct from no journey and provider
partial failures. API error bodies cannot expose upstream internals through the proxy.

Direct API routes require constant-time shared-key authentication. A single-process
token budget protects total capacity without retaining IPs: 120-unit burst, two/second
refill, four units for planning and one for reads. Existing concurrency limits remain.
This is capacity protection, not per-user fairness or a replacement for hosting DDoS
controls. Forwarded headers are untrusted; health/readiness remain public.

Fresh nonce CSP permits Next scripts and the actual Mapbox/MapLibre resources, blocks
framing and objects, and disallows production eval/inline scripts. Inline styles remain
necessary for React/MapLibre. HTML is dynamically rendered and `no-store` so nonces
are never shared through a page cache. Static assets remain independently cacheable.
Nosniff, frame denial, HTTPS HSTS, referrer and permissions policies are included.
The referrer policy preserves only the cross-origin web origin needed by restricted
Mapbox public tokens. No accounts, tracking, analytics or private provider keys in JS.
The new privacy page explains local storage, location/provider flows and hosting
metadata without promising third-party log deletion. About retains non-affiliation,
adds attribution and links privacy/contact.

## PWA, accessibility and performance

Manifest ID/scope, standalone display, coordinated theme and 192/512/maskable/Apple
PNG icons are complete. Icons derive from the existing mark, with a reproducible
script and inspected output. No service worker or offline transit cache was added;
supported browsers offer menu installation. Automatic prompts and real HTTPS/device
installation remain owner checks, not claims based on a manifest alone.

Focused code/component pass: native modal focus restoration, combobox arrow/Enter
selection, visible focus, status/error announcements, map text alternatives, route
labels and transfer/overnight readability remain covered. Responsive widths, safe-area
spacing and reduced-motion CSS are retained. Core palette contrast measured 13.11:1
(ink/canvas), 5.81:1 (muted/canvas), 5.90:1 (focus/canvas), 14.32:1 (white/ink).
No browser was connected in this session; no interactive visual or real-device pass
is claimed. Existing map tests preserve one instance through ordinary journey updates,
selected marker reuse and deferred offscreen loading. Provider debouncing/cancellation
and no-retry query behavior remain unchanged.

Production artifact inspection: initial HTML references about **206 KiB gzip** of JS;
all 12 JS chunks total about **481 KiB gzip** (includes deferred MapLibre). These are
summed local gzip sizes, not measured network transfer or a comparison to M9A. No
preview fixtures, server configuration or secrets were found in browser chunks.
Nonce rendering adds a server request per page load; no new client library was added.

## Validation

- 194 affected unit/component/API tests; 31 isolated local PostGIS integration tests.
- Repository typecheck and lint; production package builds; changed-file formatting
  and `git diff --check`.
- Local `next start` HTTP/artifact smoke: fresh matching nonce, spoofed nonce replaced,
  headers/no-store, manifest/icons/privacy/About, safe backend outage, `/preview` 404,
  bundle exclusions and core contrast. Reproduce with
  `node scripts/check-production-web.mjs` against port 3010 using inert build settings.
- Targeted integration covers missing schema/migration 002, repeated migration,
  preserved publication/import behavior, expired activation and pooled cancellation.
  Windows sandbox initially blocked Vite/Next child processes; approved local reruns
  passed. An early missing request ID in auth errors and type/lint issues were fixed.
- No live provider, Render/Vercel, OTP or realtime validation was performed.

## Remaining owner/M9C gate

Provision/approve paid plans and sizing, provide approved static-feed source and
data-use approval, set private configuration, bootstrap, deploy, restrict Mapbox to
the final domain, and verify actual HTTPS/provider/CSP behavior. Confirm backup/restore
and suspension retention/billing, real feed RAM/latency, mobile install/accessibility,
external uptime and final privacy/provider/data-rights wording before public release.
The app remains independent of DART; no endorsement or new data rights are claimed.

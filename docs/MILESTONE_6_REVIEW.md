# Milestone 6 review

**MILESTONE 6 / COMPLETE — HUMAN VISUAL REVIEW APPROVED**

Updated September 24, 2026. The owner completed human visual review in Firefox
and explicitly approved Milestone 6, including the final LineFinder logo
micro-polish. Implementation, technical validation and human visual review are
complete. Commit preparation is authorized; committing still requires separate
human approval. No commit, push, merge, deployment, provider selection or M7.
The M6A report is retained below as a historical record, not the current status.

## Final human approval and handoff

The owner confirmed approval on September 24, 2026 after manual Firefox review:

- Responsive mobile and desktop layouts were reviewed and approved.
- LineFinder branding and the final connected amber-star logo were approved
  after the last two 10% star-size adjustments.
- The About page and accessible GitHub, LinkedIn and email contact links were approved.
- Route alternatives, journey summary, timeline grouping, transfer treatment,
  map layout and arrival treatment were visually approved.
- Preview-to-About development navigation was accepted: About opens separately
  while the original preview environment remains intact.
- Known provider, geometry and public-deployment limitations remain intentionally
  deferred; visual approval does not choose a provider or authorize deployment.

This handoff changes documentation/status only. The previously recorded technical
results remain the validation record; no expensive backend/database suites are
needed solely to record human approval. M7 has not started.

Completion sanity checks passed: formatting for the five updated documentation
files and `git diff --check`. The candidate remains 58 M6 files, all unstaged on
`feat/mobile-web-ux`. Package manifests and the lockfile match the reviewed M6
dependency set. No generated/debug artifacts or credential-pattern matches were
found among candidate files; real environment files and raw feeds remain ignored.
No database/data operation was performed during this handoff. The earlier
read-only retained-publication checks remain recorded in section R.

## Final human-review polish

Before approving M6B, the owner requested these small finishing changes:

- Kept the existing 32 × 32 route mark, bend and amber origin. At the owner's
  final logo refinement, the amber star uses scale `0.847` (11.858 units wide)
  after two successive 10% increases from scale `0.7`. The origin remains 7 units
  wide. The navy route connects directly into the star, with no gap or background.
  This supersedes the detached-star treatment;
  the wordmark, header spacing and all other UI are unchanged.
- About now says **Contact links**, with restrained GitHub, LinkedIn and email
  inline SVG links using the existing icon component and unchanged public URLs.
  No visible labels/cards/pills; accessible names are **LineFinder on GitHub**,
  **Aryan Achar on LinkedIn**, and **Email Aryan Achar**. Each link has a 44 × 44 px
  target and retains the existing visible focus outline.
- In development preview only, **About opens in a separate tab** with `noopener`.
  The original preview tab/iframe retains its scenario, viewport and interaction
  state. The developer toolbar explains this, and the link announces the new tab.
  Close the About tab to return to the unchanged preview. Normal `/about` remains
  the same product page; normal development/production navigation uses the same
  tab. No second About page, query-string state or production developer tooling.

Prior contact/navigation polish validation passed: `pnpm exec vitest run apps/web/src` (**59 tests / nine
files**), web-only lint, typecheck and production build, changed-file formatting,
and `git diff --check`. Tests verify icon link names/URLs/focus and preview versus
normal/production navigation. Production HTML contains the contact icon labels
and no developer wrapper; emitted JavaScript contains no preview-navigation hint.
No packages/install, database, integration, router or backend validation reruns.
The full-suite and performance tables below record the main M6B pass before this
polish, rather than claiming those larger gates were rerun.

For the initial connected, enlarged amber-star refinement, minimal validation passed:
header/About tests (**4 tests / one file**), frontend typecheck, logo-component
lint, changed-file formatting and `git diff --check`. Vitest ran outside the
sandbox because the preceding polish check encountered a child-process `EPERM`.
No build or broader suites were rerun for this SVG-only change.

Each subsequent 10% star-only adjustment passed component lint, formatting and
`git diff --check`. The final size and connected endpoint were then visually
approved by the owner in Firefox. Contact icons and preservation of the original
preview when About opens separately were also accepted.

## A. Executive summary — M6B

LineFinder now has its approved working name, compact original mark, clear header
and About page. The approved home/search/result-card direction stays intact.
Journey detail gains an aligned summary, route sequence, thin section rules and a
distinct transfer transition, preserving the vertical rail and “You've arrived”.
Measured improvements remove production fixture code, defer map styles and reuse
the map across route selections. No M6B API/query/router/ADR or dependency change.

Same branch: `feat/mobile-web-ux`; unchanged HEAD and starting main:
`c8312b94708edf8d34380eebc2875c2dda501285`. All M6A/M6B changes remain unstaged.

Human M6A feedback liked home/search/results, map structure and arrival treatment;
the detail summary/timeline needed stronger grouping. The temporary logo, vague
descriptor and second fixture's missing factual distinction needed refinement.
The owner explicitly chose **manual Firefox visual review without an automation
browser**. DOM/code checks are not presented as pixel, touch or screen-reader QA.

## B. Branding and header

The centralized working name is **LineFinder**, one word, with public links and
description in `src/lib/product.ts`. No package/repository rename, tagline or
trademark conclusion. Metadata and manifest use that same name.

`AppHeader` shows **Dallas/DART Transit Navigator** at desktop width,
**DART Transit Navigator** from 600–999 px, and hides the descriptor below 600 px.
LineFinder/About remain reachable; the header can wrap with enlarged text. Internal
Next links disable prefetch. The navy/amber palette, warm canvas and native system
fonts are preserved, with no dark mode, gradient, decorative font or UI library.

## C. Logo implementation

Reusable inline `BrandMark`: 32 × 32 SVG, short navy path with one rounded bend,
amber origin circle and enlarged amber five-point star connected to the route. No text,
DART rail colors or imitation. A monochrome prop preserves the same silhouette.
The adjacent product name supplies accessibility text; the mark is decorative.
No raster assets, icon library, favicon/PWA asset set or external image request.

## D. About page

Static `/about` shares the app header, restrained typography and warm-neutral
section rules. It explains independent open-source Dallas/DART navigation,
schedule-based custom routing, geographic walks, structured instructions, route
comparison and the map framework. It distinguishes these capabilities from missing
external providers and explicitly says realtime tracking is absent.

The supplied short biography names Aryan Achar, Computer Science student at The
University of Texas at Dallas, and the practical Dallas transit motivation.
Owner-authorized centralized links:

- [GitHub project](https://github.com/aryansvt/dallas-transit)
- [LinkedIn](https://linkedin.com/in/aryan916)
- [Email Aryan](mailto:aryan.work2@gmail.com)

It states: “LineFinder is an independent third-party project and is not affiliated
with or endorsed by DART.” No unnecessary personal information, legal-policy page
or marketing hero. The page initializes no planner, location permission or map.
LineFinder is intended for eventual public use; localhost is a development setting.

## E. Route-result refinements

Arrival hierarchy, compact route badges, duration, walking/transfers and restrained
cards are preserved. Strict comparative minima still justify Fastest/Least walking/
Fewest transfers. **No transfers** is a factual zero-transfer fallback, including
ties. Priority: Fastest, Least walking, No transfers, Fewest transfers. No invented
single-option comparative claim or “Best”. Existing synthetic options now demonstrate
**Fastest / No transfers / Least walking**, without changing backend ordering.

## F. Journey-summary refinements

Destination/save action, aligned arrival/total duration, transfers/walking, service
sequence, then scheduled date/Dallas-time context. The reusable `RouteSequence`
uses real route identities and contrast-aware metadata colors. Thin rules and
spacing separate summary, map and itinerary; no giant nested cards. Long names wrap
without truncation. Overnight times retain M6A's GTFS service-day/DST semantics.

## G. Timeline refinements

The vertical rail remains; thin warm-neutral hairlines separate action groups.
Board/Ride/Get off stay related within each ride. A same-stop transfer is its own
ordered-list item, with breathing room and pale amber. Explicit inter-stop transfer
legs retain their own item without a duplicate transition before boarding.
Borders create no screen-reader separator noise. No fabricated risk or realtime
confidence. “You've arrived” is unchanged; future annotations can fit within action
groups, but no due/delay/get-off-next behavior is implemented.

## H. Map changes

Removed “Dallas area”. Preserved size, expand, fit, pan/zoom, points, attribution and
responsive placement. Route changes replace markers and fit points without replacing
the WebGL context/style/workers. Unmount/style changes still clean up the map.
The lazy `map-runtime` boundary includes CSS; app control overrides follow vendor
CSS and retain 44 px zoom/popup-close targets. No basemap/provider or geometry added.
Preview remains a source-free canvas with points, never fake streets/route lines.

## I. Responsive refinements

Code review and DOM navigation tests cover **320, 390, 768 and 1440 px**. Mobile/
tablet detail focuses the destination and scrolls to top; desktop keeps its list
and sticky map. Header/results can wrap; destination/stop text and badge sequences
allow shrinking/wrapping. No fixed text height or overflow-hiding workaround.

| Width | Intended composition                                                      |
| ----- | ------------------------------------------------------------------------- |
| 320   | 16 px gutters, no descriptor, wrapped event times, 22 px summary duration |
| 390   | 24 px gutters, grouped summary, 320 px inspectable map                    |
| 768   | 40 px gutters, shorter descriptor, contained dialogs, 400 px map          |
| 1440  | Full descriptor, up to 460 px left pane, substantial sticky right map     |

State 13 adds a long destination name. Safe areas/reduced motion remain. DOM has no
layout engine: responsive visual approval comes from the owner's Firefox review,
not asserted pixel-layout test results.

## J. Accessibility review

Named keyboard-reachable About/home links, visible focus and `aria-current` on
About. Removed suppression of the destination focus outline. Route badges retain
text and sequence order includes “then”. Decorative SVGs/dividers are unannounced;
headings/lists/actions remain usable without a map. Preserved accessible combobox,
native dialogs, Escape/focus restoration, live async states, cancellation, route
contrast and early optional location/manual fallback. Native containment/WebGL
remain mocked in DOM tests; actual screen-reader/touch review remains pending.

## K. Performance measurements before/after

Windows, Node 24.21.0, pnpm 12.4.2, Next 16.3.5. Compared retained M6A optimized
assets with M6B output; exact bytes, default Node gzip. JS sums use client-reference/
build manifests including framework code, not measured browser transfer or paint.

| Asset / operation                                    |                 M6A |                 M6B |
| ---------------------------------------------------- | ------------------: | ------------------: |
| Initial CSS raw / gzip                               |    106,897 / 16,286 |  **26,059 / 6,266** |
| Deferred map CSS raw / gzip                          |      Included above |     83,209 / 10,574 |
| Lazy MapLibre JS raw / gzip                          | 1,048,057 / 281,790 | 1,027,657 / 277,181 |
| Home manifest JS raw / gzip                          |   524,333 / 155,245 |   534,645 / 159,121 |
| About manifest JS raw / gzip                         |             No page |   462,187 / 137,478 |
| Emitted fixture JS raw / gzip                        |      15,220 / 6,148 |           **0 / 0** |
| All emitted JS raw                                   |           1,700,764 |           1,684,324 |
| Map constructions for initial + changed route points |                   2 |               **1** |

Initial CSS is ~76% smaller raw / 62% smaller gzip. Total CSS after map loading
grows slightly with About/detail styling. Home JS increases 10,312 raw / 3,876 gzip
bytes with navigation and summary functionality; not every metric improved.
Home/About HTML preload no map JS/CSS and reference only the 26,059-byte app CSS.
Fixture strings are absent from all production JS, not merely hidden by a 404.
About has no custom client state/query/map boundary. Tested plan/select/save/back/
departure-open-close causes exactly **one journey request, zero place requests**.

### API/data-path measurements

Eight Fastify requests through real retained PostGIS, with explicitly synthetic
walking (constant 60 s / 100 m). No external network, forced cold database, load/SLA
or travel claim. Instrumented existing query calls without logging parameters.
There is **no API change**, so this is an audit, not an invented API improvement.

| Milliseconds                                    | First West End → CityLine/Bush |    Warm West End (3 samples) | Warm Rowlett → DFW (last 3 of 4) |
| ----------------------------------------------- | -----------------------------: | ---------------------------: | -------------------------------: |
| Total                                           |                       2,744.10 | 209.15–269.54; median 221.33 |        14.62–16.53; median 15.56 |
| Preparation                                     |                       1,984.92 |                            0 |                                0 |
| Schedule lookup including activation            |                       1,990.44 |                    1.41–1.92 |                        1.06–1.68 |
| Two candidate SQL calls                         |                         150.87 |                    3.35–3.52 |                        2.45–3.00 |
| Composition                                     |                         274.21 |                193.26–252.22 |                        1.89–2.34 |
| References including transaction                |                          12.55 |                    5.65–6.57 |                        4.54–4.95 |
| DB round trips including transaction statements |                             93 |                           11 |                               11 |

First Rowlett request was already warm: 30.93 ms. All seven requests after the first
hit the same prepared schedule, preserving original first-arrival values 31440 / 35700. Warm round trips: one activation read; candidate BEGIN/activation/two spatial
queries/COMMIT; reference BEGIN/three entity queries/COMMIT. Two activation reads
cost ~2.1–2.8 ms together in later warm samples and protect publication coherence.
Cold loading adds 82 calls, including 74 bounded cursor fetches. No per-step frontend
metadata calls: journey responses already contain references.

Stop/route reads: **5.84 / 4.57 ms**, four round trips each, no schedule preparation.
Missing-provider place search: **0.73 ms, zero DB queries**, deliberate HTTP 200.
Warm candidate/metadata timings and existing M5 plans do not indicate a suspicious
query; no EXPLAIN ANALYZE/index change. Existing TTL/LRU/publication checks stay intact.

## L. Optimizations implemented

1. Positive build-time development branch plus dynamic preview imports excludes
   its client graph from production, while preserving production 404 behavior.
2. Visible/configured maps lazily load both MapLibre and CSS. Named exports also
   allow a modest map chunk reduction.
3. Map initialization is separate from point updates: measured two constructors
   before, one after; marker/resize resources are released.
4. Static About and disabled navigation prefetch avoid incidental planner loading.

Removed the root package file's UTF-8 BOM after the stylesheet test revealed a
PostCSS JSON parsing failure. Package metadata is unchanged. No speculative
memoization, new cache layer or architecture rewrite.

## M. Optimizations deferred with evidence

- Cold preparation (~1.98 s, 74 cursor fetches): future batch/extraction profiling
  should measure memory tradeoffs before changing the loader.
- Warm West End composition dominates ~221 ms median versus much cheaper Rowlett:
  investigate routing work later; no RAPTOR rewrite, threads or CPU-preemption claim.
- Reference batching could save round trips, but ~4.5–6.6 ms warm reads do not
  justify new SQL/cache invalidation complexity now.
- Visible maps still need ~277 KB gzip JS plus styles. Actual device memory/paint
  and provider tile/style costs require browser/device and approved-provider work.
- No duplicate-query defect in tested unrelated state changes. Query keys remain
  stable; explicit resubmission creates a new cancelable request. No React.memo
  proliferation, persistent journey cache or Redis.

## N. Codex/development efficiency

No install/dependency-resolution cycle. Docker started once for read-only measurement
and final regressions. Iteration used affected Vitest files and web lint/typecheck.
One web-only build measured assets; each complete final command ran once after code
stabilized. Documentation formatting/diff checks close that final pass.

Corrected targeted issues: test fixture destination/close-label, async import
settlement, Next Link convention and BOM/PostCSS parsing. Initial map test reproduced
the old two-constructor behavior. Root ESLint intentionally excludes web: use the
web workspace script. No failed attempt is represented as a success.

Future runs: share prerequisite builds in CI, use direct affected-file Vitest after
setup, web-only builds for bundle questions, and reserve PostGIS/full gates for a
stable milestone. Existing final scripts still rebuild shared prerequisites; this
is documented rather than changing CI architecture during M6B.

## O. Dependencies changed

**None in M6B.** MapLibre 6.10.0, TanStack Query 5.102.8 and dev-only happy-dom
20.14.5 remain unchanged. No install, lockfile, provider, font or browser-suite change.

## P. Files changed in M6B

- `README.md`, `CONTRIBUTING.md`, `docs/DEVELOPMENT.md`, both M6 documents;
  root `package.json` encoding only.
- Web app `globals.css`, `layout.tsx`, `manifest.ts`, `preview/page.tsx`; new `about/page.tsx`.
- Components `journey.tsx`, `journey-map.tsx`, `transit-app.tsx`, `transit-app.test.tsx`, `icon.tsx`;
  new `app-header.tsx`, `brand-mark.tsx`, `about.test.tsx`, `map-lifecycle.test.tsx`.
- Library `product.ts`, `presentation.ts`, `presentation.test.ts`;
  new `map-runtime.ts`, `map-runtime.css`.
- Preview `fixtures.ts`, `preview-workspace.tsx`.

No M6B API, router, worker, SQL, infrastructure, ADR or lockfile edits. Earlier M6A
API/shared changes remain uncommitted on the same branch.

## Q. Targeted development tests

Affected-file Vitest runs covered map lifecycle, About, presentation and planner
behavior. The final targeted `transit-app.test.tsx` run passed 17 tests, including
320/390/768/1440 px focus/navigation branches. Web lint/typecheck and one web-only
optimization build passed. No fragile CSS snapshots, public providers, credentials,
DART downloads or browser-testing dependency. Existing cancellation/error tests remain.

## R. Final complete test results

Each ran once in the final stable-source pass; counts overlap:

| Command                            | Result                                    |
| ---------------------------------- | ----------------------------------------- |
| `pnpm test`                        | PASS — 337 tests / 23 files               |
| `pnpm test:web`                    | PASS — 56 tests / 9 files                 |
| `pnpm test:api`                    | PASS — 81 tests / 4 files                 |
| `pnpm test:router`                 | PASS — 97 tests / 4 files                 |
| `pnpm test:journey`                | PASS — 86 tests / 4 files                 |
| `pnpm test:integration`            | PASS — 52 tests / 4 files                 |
| `pnpm api:validate --mode fixture` | PASS — original direct/transfer contracts |

Read-only retained-data checks: **two publications, 1,925,348 stop times**, original
September 14–20 / September 21–October 18, 2026 activation ranges unchanged. All
eight measured journeys and both metadata reads returned 200. Integration tests
use isolated databases, preserving retained DART data.

## S. Build and quality gates

| Gate                                               | Result                              |
| -------------------------------------------------- | ----------------------------------- |
| `pnpm format:check`                                | PASS                                |
| `pnpm lint`                                        | PASS                                |
| `pnpm typecheck`                                   | PASS — eight workspaces             |
| `pnpm build`                                       | PASS — optimized production output  |
| Compose config via `pnpm infra:config`             | PASS                                |
| `git diff --check`                                 | PASS                                |
| Production home / About / manifest                 | HTTP 200, LineFinder name           |
| Production `/preview`, including `?state=transfer` | HTTP 404; fixture JS absent         |
| Home/About HTML                                    | No MapLibre JS or map CSS preload   |
| Development long-name preview                      | HTTP 200, synthetic label/full name |

No install was necessary. Hosted CI did not run because nothing was pushed.
HTTP/build inspection is not browser visual testing.

## T. Preview instructions

Existing installed checkout, repository root:

```sh
pnpm dev:preview
# http://127.0.0.1:3000/preview
# http://127.0.0.1:3000/about
```

Preview is left running on port 3000. A fresh checkout first needs
`pnpm install --frozen-lockfile`; an unchanged installed checkout does not.
Preview needs no API/Docker/credentials. The toolbar identifies synthetic examples.

Normal local mode in separate terminals:

```sh
pnpm infra:up
pnpm --filter @dallas-transit/api... build
pnpm --filter @dallas-transit/api dev
# Web only if not already running:
pnpm --filter @dallas-transit/web dev
# http://127.0.0.1:3000/
```

Normal mode reports unconfigured capabilities deliberately. Geolocation needs
HTTPS/trustworthy localhost. Ctrl+C stops app terminals; `pnpm infra:down` stops
Docker **without deleting retained data**. Never use `--volumes`, reimport/reset or
reactivation for UI review. Full workflow: [DEVELOPMENT.md](DEVELOPMENT.md#m6-web-and-preview-workflow).

## U. Known limitations

Firefox mobile/desktop visual review is complete. This does not constitute full
screen-reader, physical-device or provider-backed map certification.
No geocoder/map style approved; no complete geometry,
walking-only journeys, realtime, risk, arrive-by, accounts or replanning. One service
day per search, with explicit previous-day selection and deliberate DST validation.
Local places are bounded/validated/device-only; GPS/journeys stay in memory with no
precise coordinates in ordinary URLs/logs. Existing no-nag manual-origin fallback
after session reload remains. No PWA installability/offline-map/icon-set claim.

## V. Remaining provider/deployment decisions

Approve geocoder and map style/tile/glyph/sprite hosts, terms, attribution, costs,
credentials and privacy implications; explicitly operate/configure walking.
Later public readiness needs hosting, HTTPS/same-origin routing, trusted ingress
rate/connection/body limits, data-use review, coverage/freshness monitoring,
capacity/observability, privacy/legal text and actual device/provider testing.
No hosting/cloud resource, external account/key/terms or provider was selected here.

## W. Git status and hygiene

Same branch/HEAD, all changes unstaged. No commit/push/merge/deploy. Raw feeds, real
env files, node_modules, build output and temporary audit tooling remain ignored.
No secrets/provider keys, screenshots, unrelated files or ADR edits. Public contact
details are owner-authorized. Audit/API/production-smoke processes and Docker are
stopped after checks; retained Postgres volume remains. Only dev preview stays up.

## X. Main M6B diff snapshot before final polish

M6B: **26 files (19 modified, 7 new), 1,314 insertions / 233 deletions**.
Combined M6 branch: **58 files (20 modified, 38 new), 7,201 insertions / 92 deletions**.
Counts include untracked files; M6B uses its saved M6A baseline. No staging was used.

## Y. Final human visual-review checklist — approved

The checklist supplied for manual Firefox review is retained below. The owner
confirmed mobile/desktop visual approval on September 24, 2026; the checklist is
not an automated pixel or assistive-technology certification.

Firefox targets: **320, 390, 768 tablet, 1440 desktop**. Preview provides the first three
iframe widths; use normal desktop width for the fourth. For `/about`, use Responsive
Design Mode (Ctrl+Shift+M). Repeat detail/header at 200% zoom/text enlargement.

1. Home granted/manual: compact mark, LineFinder/About reachability, descriptor,
   unchanged heading/form/current-location and local lists.
2. Search: focused sheet, arrows/Enter/Escape and synthetic labeling.
3. Alternatives: **Fastest / No transfers / Least walking**, arrival hierarchy,
   route badge proportions and no squeezed/overflowing rows.
4. Direct/transfer detail: destination/arrival/duration alignment, route sequence,
   scheduled context, subtle separation and desktop left-pane density.
5. Timeline: distinct Walk/Board/Ride/Get off/Transfer actions, related ride groups,
   calm amber transition; previously liked **You've arrived** preserved.
6. After-midnight/incomplete: next-day context and plain-language notice.
7. Long destination (13): full name, wrapping/save action at narrow/enlarged sizes.
8. Expanded map: pan/zoom, fit, Escape/close/focus; select another desktop route.
   A points-only blank basemap remains intentional.
9. `/about`: consistent header/mark, concise sections, keyboard links/contact targets
   and independent-project disclaimer.
10. Loading/cancel, empty and failure: restrained states, useful retry.

**Human visual approval is recorded above; Milestone 6 is complete.** Proposed
commit: `feat(web): complete LineFinder mobile transit experience`. Stop before
committing for separate human approval. No push, merge, deployment or M7.

# M6A historical checkpoint — September 21–22, 2026

The following A–AJ report records the earlier checkpoint as it stood. The owner
subsequently reviewed it and authorized M6B above; old pending/deferred statements
are historical and do not override the current M6B status.

## A. Executive summary

The placeholder is replaced by the approved light-mode Dallas planning flow:
destination-first home, early geolocation with manual fallback, place/departure
dialogs, scheduled alternatives, exact action timeline, map expansion and desktop
split panes. Typed M5 consumption preserves API order, publication context,
service-day times, errors, incomplete results and cancellation. Recent/saved
places remain device-local. A bounded provider-neutral place endpoint returns a
deliberate capability state without an approved provider.

The development-only preview covers every requested review state without internet,
credentials, geolocation or a database. Maps show points only; no path is invented.
No external geocoder, map style/tile provider, walking host, final branding or
accepted ADR was selected/changed. The router, worker and SQL remain unchanged.

Final tests: **327 offline tests**, including **46 frontend** and **81 API**;
targeted **97 router**, **86 journey/provider**, and **52 isolated PostGIS** tests
pass. Counts overlap. The production build and local web/API smoke checks pass.
Browser visual inspection remains pending: the provided browser tool has returned
no connected browser surfaces so far; the human offered to connect one. DOM tests
and HTTP smoke checks are not represented as visual or screen-reader certification.

## B. Branch and starting main commit

- Branch: `feat/mobile-web-ux`.
- Starting main: `c8312b94708edf8d34380eebc2875c2dda501285`.
- Clean main verified before edits; fresh `git fetch origin` and zero ahead/behind.
- HEAD remains at that commit. All changes are unstaged; no commit/push/merge.

## C. Design document created

[MILESTONE_6_DESIGN.md](MILESTONE_6_DESIGN.md) was created **before implementation**
and records the owner's exact product principle, copy, palette direction,
anti-patterns, permission decision, information hierarchy, provider boundaries,
accessibility/privacy and M6A stop condition. It is M6's design source of truth.
No accepted ADR has been edited. The temporary identifier lives in
`apps/web/src/lib/product.ts`; there is no new final name or tagline.

## D. Dependencies added/changed

| Dependency              | Pin     | License / purpose                                                 |
| ----------------------- | ------- | ----------------------------------------------------------------- |
| `maplibre-gl`           | 6.10.0  | BSD-3-Clause; pre-approved interactive geographic rendering       |
| `@tanstack/react-query` | 5.102.8 | MIT; architecturally selected server-state lifecycle/cancellation |
| `happy-dom`             | 20.14.5 | MIT; development-only DOM environment for existing Vitest         |

API and web link the existing shared workspace; shared has a types-only router
dependency. No new workspace or component/date/HTTP/browser-test framework.
See [dependency rationale and costs](DEVELOPMENT.md#m6-dependency-decisions).
TanStack's initially fetched newest release was replaced with the preceding stable
release; no release-age exceptions remain. Existing direct dependencies are unchanged.

## E. Files created/modified

Modified:

- `.github/workflows/ci.yml`, `README.md`, `CONTRIBUTING.md`, `package.json`,
  `pnpm-lock.yaml`, `vitest.config.ts`.
- `docs/DEVELOPMENT.md`, `docs/JOURNEY_API.md`.
- `apps/api/package.json`, `src/app.ts`, `src/repository.ts`, `src/service.ts`.
- `apps/web/package.json`, `next.config.ts`, `src/app/globals.css`, `layout.tsx`,
  `manifest.ts`, `page.tsx`.
- `packages/shared/package.json`, `src/index.ts`.

Created:

- `docs/MILESTONE_6_DESIGN.md`, `docs/MILESTONE_6_REVIEW.md`.
- `apps/api/src/places.ts`, `places.test.ts`.
- `packages/shared/src/contracts.ts`, `places.ts`.
- `apps/web/.env.example`, `src/app/preview/page.tsx`.
- Web `src/components/`: `departure-sheet.tsx`, `dialog.tsx`, `icon.tsx`,
  `journey-map.tsx`, `journey-map.test.tsx`, `journey.tsx`, `place-search.tsx`,
  `transit-app.tsx`, `transit-app.test.tsx`.
- Web `src/lib/`: `api.ts`, `api.test.ts`, `local-places.ts`, `local-places.test.ts`,
  `location.ts`, `location.test.ts`, `map-points.ts`, `presentation.ts`,
  `presentation.test.ts`, `product.ts`, `time.ts`, `time.test.ts`.
- Web `src/preview/`: `fixtures.ts`, `preview-workspace.tsx`.

No deleted repository files; no router/worker source, migration, raw feed or ADR
changes. Shared wire types replace the API's duplicate reference interfaces,
without changing their serialization. The service's declared return type now
checks against the same journey contract consumed by the frontend.

## F. Design tokens and palette

| Role                       | Value                 |
| -------------------------- | --------------------- |
| Warm canvas                | `#f6f5f0`             |
| Primary surface            | `#ffffff`             |
| Quiet surface              | `#eeeee7`             |
| Ink / primary action       | `#192c3c`             |
| Muted text                 | `#56616a`             |
| Amber / soft amber         | `#c18a35` / `#faf0db` |
| Border                     | `#d9dcd5`             |
| Focus / dark accent detail | `#825515`             |

Amber is not body text. Actual route-color metadata supplies compact badges;
invalid colors fall back to ink. Text contrast is checked mathematically, with
black/white fallback when supplied text color fails 4.5:1. Route labels and mode
icons retain identity without color. No gradients, glass, marketing hero or dark mode.

## G. Typography/spacing system

Native `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif stack. No font
download. 16 px body, 14 px secondary text, compact 12 px labels, 30–40 px home
heading and 29–32 px arrival values. Time uses tabular numerals. Weight/size/spacing
establish hierarchy; there are no serif accents or decorative headline effects.

4/8/12/16/20/24/32/40/48/64 px spacing tokens; related components repeat those
intervals. Corners generally 8–16 px, badges 5 px. Touch actions at least 44 px,
primary action 52 px. Borders provide structure; shadows are limited to modal/map
controls. Focus outlines use a visible 3 px stroke with offset.

## H. Home implementation

Exact heading **“Where do you need to go?”**, supporting **“Plan your trip across
Dallas.”** From/To are subtly joined by a two-point connector. Search destination
is the dominant entry and Find routes is a single full-width navy action. Leave
now is quieter. No dashboard statistics, marketing tiles or invented tagline.
The home label returns to the planner and cancels a pending query.

## I. Location-permission behavior

One request after client mount. A module promise prevents Strict Mode duplicates;
a session attempt marker prevents automatic nagging on reload. Success sets Current
location. Denial, timeout, lack of browser support or secure context leaves a manual
starting-point search with concise optional-permission copy. A manually chosen
origin is not overwritten by a delayed location response.

GPS coordinates remain only in memory. The marker contains `1`, not a location.
HTTPS or trustworthy localhost is required; plain LAN HTTP is not promised to
support phone geolocation. Reload after a session attempt uses manual origin rather
than prompting again. The isolated preview never requests actual location.

## J. Place-search UX

A focused dialog/sheet provides labeled actual-place/address input. Search debounces
250 ms, cancels obsolete requests, distinguishes no matches from unavailable search,
and preserves names/context. Saved/recent places can be selected as either origin
or destination, including while the provider is unavailable. Combobox arrows and
Enter select; native dialog Escape closes and restores focus. Tap targets are
comfortable list rows, with active selection announced through ARIA.

## K. Place-search backend/provider architecture

Web `/api/v1/places/search` → same-origin Next proxy → Fastify
`GET /v1/places/search` → injected `PlaceSearchProvider`. Query 2–160 characters,
six-result bound, explicit public place fields, response validation and field
copying. Unknown query options/provider URLs are rejected. Existing read admission
(16), five-second deadline, disconnect/shutdown signal and safe logging are reused.

No configured provider returns HTTP 200 `unavailable / not-configured`. Invalid or
failed provider output yields `provider-unavailable`; empty successful matches stay
distinct. Normal serving config has no fixture provider or guessed geocoder.
No database stop search was added: selecting/validating a full external place
provider is a human decision, and stop-only search would not satisfy destination
search. No new SQL, schema or third-party terms were needed.

## L. Departure-time behavior

Leave now / Depart at only. The latter uses Dallas date and time fields plus a
small after-midnight disclosure for explicitly selecting yesterday's overnight
service. Requests preserve integer seconds and an explicit service date; display
uses normal local time and visible next-day/date context for overnight arrivals.

`Intl` and `Date` implement Dallas civil conversion independent of browser timezone.
The anchor is local noon minus twelve elapsed hours, following the
[GTFS time definition](https://gtfs.org/documentation/schedule/reference/#field-types).
For example, September 18 service second 91800 displays **1:30 AM, next day**, with
the actual September 19 instant. Fractional arrivals are preserved. Spring gaps and
autumn repeated-hour civil selections are rejected with helpful copy, not guessed.
Very early autumn-change departures can precede today's service anchor; the UI
requires explicit previous-day service selection in that case.

Leave now searches today's Dallas civil date only. Continuing previous-day trips
can be omitted shortly after midnight. No automatic lookback or adjacent-date
stitching is claimed. The disclosure and footer explain the limitation.

## M. Recent/saved local-state behavior

At most five recent destinations and five saved places, under a versioned key.
Recent destinations are recorded when planning; saves require an explicit star
action. Lists have context, dividers and remove/clear interactions, not giant cards
or tables. Storage reads validate version, size, arrays, field lengths and numeric
coordinates. Only public place fields are copied. Corrupt/blocked storage falls
back safely; failed persistence explains that places are available for this visit.

Current GPS origin, journeys, publication IDs and diagnostics are never persisted.
No accounts or sync. Preview uses memory-only sample lists and does not touch the
normal storage key. Data can be cleared through list controls/browser storage.

## N. Route-results implementation

Displays up to three actual API alternatives in the API's order. Arrival is the
strongest value, followed by duration, compact service badges, transfers, walking,
first boarding and useful transfer location. Waiting remains part of total duration.
Labels are only assigned to strict comparative minima: no single-result or tied
“Best” claim. The fixture deliberately includes a transfer alternative, a direct
bus and a later option with less walking. Pale warm selection is restrained.

## O. Journey-detail implementation

Summary, useful map area, then exact journey timeline. Destination can be saved
explicitly. Mobile opens a focused detail and returns to route options; desktop
retains the results and scrolls the selected detail into view while the map stays
available. Summary identifies scheduled times and the searched date. Partial-result
copy remains visible. No raw IDs, realtime claims or backend diagnostics appear.

## P. Timeline behavior

Walk → Board → Ride → Get off → Transfer → Arrive, using actual leg order.
Boarding displays named stop, route and supplied headsign/time; platform appears
only if supplied. Direction IDs are never translated into guessed compass labels.
Stop count uses occurrence differences, not sparse sequence-number arithmetic.
Transfers have extra vertical space and named context, without invented risk or
confidence. Legacy interchange links retain duration without fabricated distance.
Final “You've arrived” combines destination and time in a quiet amber surface.

## Q. Map implementation and provider/style boundary

MapLibre is dynamically imported only for a configured or fixture map when visible.
Normal pan/zoom, keyboard controls, fit-trip control, marker labels/popups, responsive
resize and modal expansion are implemented. Expanded-map close restores focus to
the replacement expand control. Origin, destination and relevant board/transfer/
alight stops are shown; same-stop transfer markers are deduplicated.

Normal mode needs explicit `NEXT_PUBLIC_MAP_STYLE_URL`. There is no default tile
or demo request. Missing style/WebGL/style failure has a helpful capability state;
the itinerary remains understandable. Style attribution stays enabled. An approved
style's tile/glyph/sprite hosts also need review; its URL cannot contain a secret.

Preview uses a source-free MapLibre background and synthetic points only. There
are **no synthetic route lines**, guessed walking paths or invented street context.
No geometry API extension was attempted. Basemap usefulness/contrast/attribution
cannot be signed off until an approved provider exists.

## R. Mobile responsive behavior

Mobile-first single-column planner; sheets at the bottom; 320 px rules reduce
padding and wrap event times deliberately. At 390 px the map gets a 320 px-high
inspectable area in detail without taking the entire initial screen. Expanded map
uses the viewport. Safe-area bottom padding is present. Tablet increases page/map
space and centers dialogs; no horizontal data table or fixed phone-width desktop.
The preview's iframe controls exercise actual CSS viewport widths. Real browser
overflow, touch, safe-area and keyboard checks remain part of visual review.

## S. Desktop responsive behavior

At 1000 px and above: deliberate two-column composition with up to 460 px for
planning/results/instructions and the remaining width for a substantial sticky map.
The workspace grows to 1440 px. Map height scales with viewport height, with
ResizeObserver updates. Selecting an option preserves the route list and updates
map points; focus reveals its detail. Desktop map remains available while reading.

## T. Accessibility implementation

Semantic forms/sections/headings and skip link; named action buttons; keyboard
combobox selection; native modal containment/Escape; focus restoration; visible
focus; aria-live/status/error messages; aria-busy during search; textual route
identity; contrast-aware badge text; adequate action targets. Decorative SVGs are
hidden from assistive technology. Essential route information is in text, not only
on a map. Reduced-motion disables incidental motion; map fitting uses zero duration.

DOM behavior tests cover focus, selection, cancellation and modal close. They do
not replace actual screen-reader, touch, WebGL or browser layout testing. No claim
of comprehensive WCAG certification or keyboard testing in a real browser yet.

## U. Privacy/data-minimization behavior

Journey coordinates use POST bodies, never normal page URLs. Current location and
results are memory-only; local places are explicitly bounded, minimal device data.
Query caches are ephemeral, with zero unused-cache retention and no persistence.
Superseded/unmounted requests abort. Fastify logs templates and safe categories;
Next incoming-request logging is disabled so autocomplete queries are not logged.
No analytics, tracker, session replay, advertising, third-party font or new SDK
beyond the approved stack. No cookie banner or account system is introduced.

Configured map hosts receive viewport context; deciding on them remains explicit.
Preview has no public map/geocoder requests or real coordinates from the reviewer.
Legal/public-deployment policy text remains outside M6A.

## V. M5 API integration/error mapping

Shared V1 wire types plus frontend runtime envelope/core-field/reference validation.
No frontend routing algorithm. M5 success, empty reasons, incomplete flag and
publication coherence remain intact. Errors map internally to actionable language:
invalid input; walking unconfigured/unavailable/timeout; request timeout; busy server;
database/service outage; missing schedule; publication change; invalid response;
internal/network failure; deliberate cancellation. Raw codes never headline UI.
No automatic retry loop; users explicitly retry/change their request.

## W. Cancellation/loading behavior

TanStack signals reach native fetch for both search kinds. A new trip request gets
a new ephemeral key; superseded query observers abort their requests. Changing
places/departure cancels the old journey; Cancel clears it deliberately. Debounced
autocomplete hides stale remote suggestions. Tests assert old and current signals
abort, and late results cannot replace current UI. Native fetch has a 35 s client
deadline, beyond the server's allowed 30 s maximum. Async states use a quiet static
skeleton/status message, no arbitrary spinner animation. No focus refetch/reconnect
retry unexpectedly reruns a rider's journey.

## X. Preview/fixture workflow

Run `pnpm dev:preview`, open **http://127.0.0.1:3000/preview**. Tooling is visibly
separated above the product. Choose a state and Responsive/320/390/768 px viewport:

| State                   | Demonstrates                                                |
| ----------------------- | ----------------------------------------------------------- |
| Home — location granted | Current location; local recent/saved lists                  |
| Home — manual origin    | Denied/unavailable permission copy                          |
| Place search            | Deterministic address/place list and combobox               |
| Finding routes          | Loading and cancellation                                    |
| Three alternatives      | Arrival priority, route sequence, walking/transfer tradeoff |
| No journey              | Distinct empty state                                        |
| Service failure         | Provider error and retry                                    |
| Direct journey          | One ride with access/egress                                 |
| Transfer journey        | Named transfer and onward headsign/time                     |
| After midnight          | Next-day arrival without wrapping service seconds           |
| Incomplete options      | Plain-language partial-result warning                       |
| Expanded map            | Modal map, controls, close/focus behavior                   |

All states support both mobile and desktop composition. Preview times are fixed
examples, not a claim that Leave now found those trips. The normal `/` path uses
the actual API and startup permission; `/preview` is confirmed 404 in production.

## Y. Test results

| Command                            | Result                                          |
| ---------------------------------- | ----------------------------------------------- |
| `pnpm test`                        | PASS: 327 tests / 21 files                      |
| `pnpm test:web`                    | PASS: 46 tests / 7 files                        |
| `pnpm test:api`                    | PASS: 81 tests / 4 files                        |
| `pnpm test:router`                 | PASS: 97 tests / 4 files                        |
| `pnpm test:journey`                | PASS: 86 tests / 4 files                        |
| `pnpm test:integration`            | PASS: 52 tests / 4 files                        |
| `pnpm api:validate --mode fixture` | PASS: actual Fastify contract, two alternatives |

No test requires public internet/provider credentials/DART downloads. Frontend
tests cover time/DST/date rollover, corrupt/denied storage, contrast fallbacks,
comparative labels, relevant map points, client validation/errors/cancellation,
geolocation outcomes, interactive combobox/departure/detail/back/save, and expanded
map focus. New API tests cover limits, unavailable capability, sanitized failures,
provider-field stripping and cancellation. M1–M5 tests remain passing.

## Z. Build/quality-gate results

| Gate                                                                                          | Result                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | PASS                                        |
| `pnpm format:check`                                                                           | PASS                                        |
| `pnpm lint`                                                                                   | PASS                                        |
| `pnpm typecheck`                                                                              | PASS, all eight workspaces                  |
| `pnpm build`                                                                                  | PASS, including optimized Next.js output    |
| `docker compose --project-directory infra/docker -f infra/docker/compose.yaml config --quiet` | PASS                                        |
| `git diff --check`                                                                            | PASS                                        |
| Production `/`, `/preview`                                                                    | HTTP 200 / 404                              |
| Same-origin place endpoint                                                                    | HTTP 200 deliberate not-configured state    |
| Same-origin journey endpoint, no walking provider                                             | HTTP 503 `WALKING_NOT_CONFIGURED`, expected |

Initial sandbox registry/child-process restrictions required approved execution.
An initial lint issue, incorrect DST test expectation and departure-control
formatting issue were corrected before passing runs. A PowerShell inline
smoke-script quoting failure occurred before any
request; the file-based rerun passed. No failed check is presented as a success.
GitHub-hosted CI has not run because nothing was pushed. CI now explicitly includes
`test:web`; full test discovery also includes TSX behavior tests.

## AA. PostGIS/API regressions

No SQL/query or migration changes. All 52 existing PostGIS tests pass using isolated
databases, preserving normal data. Read-only retained counts: **two publications,
1,925,348 stop times**, with original activation ranges September 14–20 and
September 21–October 18, 2026. Normal API startup/readiness is 200 with walking
capability false, as expected. Synthetic M5 validation returns the original exact
direct/transfer contract. No live provider or retained-data mutation was performed.

## AB. Performance observations

MapLibre is a separate dynamic production chunk: sampled **1,048,057 bytes raw /
281,790 bytes gzip**. It is requested only when a configured/fixture map is visible;
mobile home does not initialize a hidden WebGL map. The stylesheet (including
MapLibre CSS) sampled 106,897 bytes raw / 16,286 gzip. No network font, component
library or persistent server-state cache is added.

One local production HTTP observation: home 6 ms; unavailable place response
through proxy 13 ms; readiness 19 ms. These measure local HTTP, not browser paint,
mobile runtime performance, load testing or an SLA. Next compilation was about
5.2 s, type compilation 2.9 s on this machine. Browser render/interaction profiling
remains pending. Do not infer UI quality from server or test timings.

## AC. Visual compromises from missing providers/geometry

There is no street basemap in preview and normal mode cannot autocomplete arbitrary
places until a real provider is approved/connected. Interactive preview points
exercise layout/controls without falsely representing streets or route paths.
Geometry does not exist in M5 responses, so no transit/walking lines are drawn.
Walking durations/distances can be shown from M5, but turn-by-turn street details
are unavailable. Provider-dependent map styling, density and attribution review
must be repeated with an approved source. This is an explicit capability boundary,
not a completed public navigation service.

## AD. Known issues/limitations

- Real browser visual and screen-reader inspection pending; no connected browser
  has been available to the tool so far. Responsive behavior is implemented and
  previewable, not visually certified.
- Real place-search provider/terms and map-host/style approval remain outstanding;
  normal local mode deliberately reports unavailable capabilities. Walking provider
  remains independently unconfigured in the tested normal server.
- No complete geometry, walking-only alternatives, verified station circulation,
  realtime, risk or live departure claims. Existing M5 candidate/transfer limits apply.
- One service day; post-midnight previous-day service must be selected explicitly.
  Repeated/nonexistent DST civil times require a different explicit selection.
- Session reload does not reacquire GPS automatically after the one-time attempt;
  manual origin remains available. Saved places do not synchronize between devices.
- DOM tests mock native modal focus containment and WebGL; real browser/assistive
  technology checks remain mandatory. No PWA installability/offline-map claim.

## AE. Deferred M6B polish

Only after human visual review: adjust spacing, type scale, route density,
map/timeline balance and desktop selection flow against actual screenshots and
touch use; check iOS/Android keyboards/safe areas, browser zoom, long place names,
screen-reader announcements and focus transitions. Review a real approved basemap
and external search adapter only after provider decisions. Do not begin dark mode,
realtime, risk, replanning, accounts, deployment, M7, or final branding as polish.

## AF. Human visual-review instructions

1. Open `/preview` at desktop width and inspect the restrained warm canvas, navy
   action, readable form, list treatment and substantial map area.
2. Inspect all twelve state choices at 390 px; use 320 px for long names, route
   badges, timetable wrapping, touch targets and overflow. Inspect 768 px tablet.
3. Open both direct/transfer detail; check that route/headsign/boarding/alighting
   instructions are immediately understandable. Inspect overnight date labels.
4. Expand, pan/zoom and fit the points-only map. Close with its button and Escape.
   Verify focus returns. Remember that it is deliberately not a street map.
5. Navigate search with Tab/arrows/Enter; test Escape, departure controls, retry,
   cancel and save/unsave. Use normal mode to review actual permission denial/grant
   and provider-unavailable copy without mistaking fixtures for production.
6. Report specific screen/state/width observations. Give explicit visual approval
   or requested changes before any M6B work. Tests alone do not approve this milestone.

## AG. Exact local commands to open the app

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:preview
# Open http://127.0.0.1:3000/preview
```

Normal local mode, separate terminals:

```sh
pnpm infra:up
pnpm --filter @dallas-transit/api... build
pnpm --filter @dallas-transit/api dev
# Another terminal:
pnpm --filter @dallas-transit/web dev
# Open http://127.0.0.1:3000/
```

Or `pnpm infra:up` then `pnpm dev` for both apps. Use Ctrl+C in app terminals and
`pnpm infra:down` to stop backing services **without deleting the retained volume**.
Never use `--volumes`, reset data or reactivate a publication for frontend review.
Frontend/API tests: `pnpm test:web`, `pnpm test:api`; full commands and optional
configuration are in [DEVELOPMENT.md](DEVELOPMENT.md#m6-web-and-preview-workflow).

## AH. Git status/hygiene

All work is unstaged on the requested branch. HEAD/main/fetched origin/main remain
at the starting commit. Raw feeds, real `.env` files, node_modules, dist, `.next`
and temporary validation tooling remain ignored. No provider key or credential was
created. No screenshots/debug dumps are tracked. No unrelated roadmap/ADR edits.
Final secret-pattern scan found no credential candidates in changed/new files.
Retained publication counts and activation dates were rechecked unchanged after
the regression suite. The API and Docker services are stopped; the retained
`dallas-transit_postgres-data` volume still exists. The temporary smoke script was
removed. Only the development web preview remains running on port 3000 for review.

## AI. Diff statistics

**51 files: 20 modified, 31 new; 6,115 inserted lines and 87 removed lines.**
Includes untracked new files, which ordinary `git diff --stat` omits. Tracked-file
diff alone: 1,878 insertions / 87 deletions. No staging was used for this inventory.

## AJ. Human decisions required before M6B

**Human visual approval or concrete requested changes is required.** Resolve the
mobile/desktop composition, density, map balance and interaction review above.
If real provider work is desired, explicitly approve a geocoder and map host/style,
including terms, attribution, permitted use and privacy implications. No account,
key, paid service or external default was chosen to sidestep that decision.

Final branding remains unselected. No commit is proposed. No M6B work, commit,
push or merge is authorized merely because these technical gates pass.

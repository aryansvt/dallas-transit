# Milestone 6 approved product and visual design

Status: **Milestone 6 complete / human visual review approved**, September 24, 2026.
The owner approved the final mobile/desktop experience and LineFinder logo in
Firefox. This remains the source of truth for M6 frontend work; accepted ADRs are
unchanged. Commit preparation is authorized, with separate approval required
before committing. No push, merge, deployment or M7 is authorized.

## Product principle

> A clean, high-information transit interface that feels calm, warm, and distinctly human.

Build a real Dallas/DART transportation product: professional, sleek, inviting,
accessible, information-rich without clutter, expressive without excessive
decoration, and understandable without transit expertise. Professional must not
become sterile or dull. Warmth comes from restrained color, spacing, typography,
surfaces, copy and interaction. This is not a portfolio, admin/analytics dashboard,
startup landing page or AI template. No emojis in headings or product UI.

The working product name is **LineFinder**, one word, centralized and replaceable.
This is not a trademark/legal conclusion. Repository/workspace identifiers stay
unchanged. No tagline has been selected. LineFinder is intended for eventual
public use; localhost and `/preview` are development/review environments only.

## Approved M6B refinements

Preserve the human-approved home/search/result-card direction and light palette.
Use a compact original mark: navy path, amber origin, small Texas-style five-point
amber destination star enlarged for optical balance with the origin dot, directly
connected to the route without a gap or background; one gentle bend, no text,
gradients or DART imitation. Provide a
monochrome form; full favicon/PWA assets are deferred.

Header: **Dallas/DART Transit Navigator**, or **DART Transit Navigator** when
space is limited, with reachable **About** navigation. Hide the secondary descriptor
on narrow screens; keep the product and About visible. Remove the redundant
“Dallas area” map label. Never imply official DART affiliation.

`/about` uses the app's typography/surfaces: concise independent open-source purpose,
honest present capabilities and provider limitations, Aryan Achar's supplied short
creator biography, centralized public GitHub/LinkedIn/email links, and an explicit
non-affiliation disclaimer. No marketing hero, resume biography, privacy/terms pages.

Journey detail needs stronger grouping: destination, arrival, total duration,
transfers/walking, **route sequence**, scheduled date/time context. Use alignment,
spacing and thin warm-neutral rules, not nested giant cards. Preserve the vertical
timeline rail, add quiet action-group separators, keep rides visually related,
and give transfers breathing room with a soft-amber transition that implies no risk.
Preserve “You've arrived”. No realtime/transfer-confidence claims.

Factual labels may include **No transfers** for zero-transfer options, including
ties. Comparative labels still need evidence. Preview alternatives demonstrate
Fastest / No transfers / Least walking without inventing a “Best” option.

Measure performance before changing it. Preserve lazy MapLibre loading, request
cancellation and stable query lifetimes; keep developer fixtures out of production
assets. No routing algorithm, index, Redis, worker-thread or provider changes without
evidence and appropriate approval. Use targeted iteration checks, then one complete
final regression pass. Responsive code/DOM checks cover 320/390/tablet/desktop;
the owner completed final visual review in Firefox using local preview.

## Excluded visual patterns

No purple/blue or decorative gradients, gradient headlines, glassmorphism, giant
marketing heroes, giant rounded cards everywhere, colored-border card spam,
excessive shadows, icon-box grids, decorative badge spam, icon overload,
low-contrast dark UI, scroll reveals/fades, cursor effects, arbitrary hover motion,
startup buzzwords, fake statistics, fake reviews, inconsistent spacing, decorative
serif accents, untouched component-library aesthetics, or spreadsheet/Tableau-like
information tables. Exceptions need a specific product reason. No UI component
library is added to manufacture a visual identity.

## Visual system

Light mode only in M6. Native/system neutral sans-serif typography; no branding
webfont. Warm off-white canvas, white/near-white primary surfaces, deep ink/navy
text and structure, neutral slate supporting text, muted amber accents, warm
neutral borders. Strong contrast, moderate rounding, minimal shadows, a consistent
spacing scale and comfortable touch targets.

Implementation starting tokens (contrast and visual balance may refine these):

| Role          | Value     | Use                                                 |
| ------------- | --------- | --------------------------------------------------- |
| Canvas        | `#f6f5f0` | Warm page background                                |
| Surface       | `#ffffff` | Planner, results, sheets                            |
| Surface quiet | `#eeeee7` | Secondary structural surface                        |
| Ink           | `#192c3c` | Primary text, full-width primary action             |
| Muted         | `#56616a` | Supporting text, never faint essential instructions |
| Amber         | `#c18a35` | Current-location mark and restrained highlights     |
| Amber soft    | `#faf0db` | Selection/pressed treatment                         |
| Border        | `#d9dcd5` | Subtle separation                                   |
| Focus         | `#825515` | Visible outline with offset                         |

Amber is not low-contrast body text. Primary actions are deep navy with white text.
Transit colors are reserved for actual route information and never stand alone:
badges always include textual identity. Validate supplied route colors and choose
a contrasting text color. No decorative use of DART route colors.

Use 4/8/12/16/20/24/32/40/48/64 px spacing, 8–16 px corner radii, 44 px minimum
interactive targets. Body 16 px, supporting text generally 14 px, compact labels
12–13 px; home heading approximately 32–40 px, prominent arrivals 30–36 px.
Use tabular numerals for time, not a tabular layout for journeys. Keep prose lines
short enough to scan. Respect safe areas and reduced motion.

## Home and location

Primary heading: **“Where do you need to go?”** Supporting line: **“Plan your trip
across Dallas.”** Do not substitute “Where are you going?” The trip planner is the
visual center, destination-first, without dashboard features.

Core controls: **From / Current location**, **To / Search destination**, **Leave
now**, and one clear full-width mobile **Find routes** action. Quiet connection
between From/To may reinforce a journey without decorative complexity. Leave now
is subordinate to Find routes.

The owner explicitly chose EARLY geolocation: request once after first client
mount. Success makes Current location the origin. Coordinates stay only in the
planning session. Denied, timed-out, insecure-context or unsupported location
falls back to manual starting-point search with concise helpful copy. Do not nag
or automatically repeat prompts. Manual origin always works without permission.
HTTPS or a trustworthy localhost context is required; plain LAN HTTP is not a
reliable phone permission workflow. A session attempt marker holds no coordinates.

## Place search

M9A supersedes the provisional server-only external-provider placement below:
Mapbox Search Box Suggest/Retrieve runs behind a browser-owned search-session
adapter using a public URL-restricted token. Authoritative GTFS stop search stays
behind the API. Search Box results are temporary and excluded from saved/recent
storage. See `MILESTONE_9A_REVIEW.md` for the approved provider integration.

Selecting either place opens a focused mobile search sheet/dialog; desktop uses a
contained dialog. Search actual places/addresses, not a disguised stop-only search.
Architecture: **Web UI → our versioned API → provider-neutral place-search
abstraction → explicitly configured provider**. The browser never directly calls a
geocoder. No random demo service, provider selection, terms acceptance, signup,
key or paid account. Selecting a real external provider requires human approval.

Selected places contain display name, optional address/context, latitude and
longitude. Use a stable bounded `GET /v1/places/search?q=...` contract, limited
query length/count, safe response validation, deadlines and cancellation. Missing
provider is an intentional capability response, not an internal error. Empty
results and failed service are distinct. An injected deterministic provider is
for tests only; normal startup never selects fake results. Own-database stop
search is optional only if it stays small; M6A does not need a search engine.

Accessible combobox/listbox navigation supports arrows, Enter, Escape, visible
focus and announced asynchronous results. Search changes cancel stale work.

## Departure and service-day time

Default **Leave now**. A lightweight sheet offers **Leave now** and **Depart at…**
with Dallas civil date/time controls. Never offer Arrive by. Use standard Intl/Date
APIs with `America/Chicago`, independent of the browser's timezone. The boundary
converts civil instants to the API's explicit date/integer service-day seconds;
presentation converts back using the GTFS service-date noon-minus-12-hours anchor.
Values beyond 86400 retain date context; never blindly modulo them.

One service date per query remains a real limitation. Leave now selects the current
Dallas civil date; shortly after midnight it can omit continuing trips belonging
to yesterday. Explain this without silently stitching adjacent dates. Depart at
may explicitly search the previous day's overnight service through a clearly
labeled option. A nonexistent/ambiguous DST civil time requires clarification in
the UI rather than guessing. Some very early autumn-transition instants precede
today's service anchor and need an explicit previous-day selection.

## Recent and saved places

Device-local, bounded, optional convenience with no accounts. Native-app-like
lists: intentional title/context hierarchy, comfortable spacing, subtle grouping
and dividers, meaningful focus/tap states, minimal useful icons. No giant cards or
spreadsheet rows. Recent destinations follow deliberate selection/planning; saved
places follow explicit user action. Store a versioned validated minimal place
record; never persist current GPS origin, journeys or API diagnostic IDs. Provide
clear/remove controls. Storage denial/corruption must not break trip planning.

## Results

Use the real M5 ordering: earliest arrival, fewer transfers, less walking; no
opaque score or frontend rerouting. Show the API's approximately two or three
useful alternatives (fewer when fewer exist), prioritized as follows:

1. Arrival time, the strongest value.
2. Total duration, including waiting.
3. Compact route/service sequence with genuine metadata/colors and textual names.
4. Transfer count.
5. Walking.
6. First boarding route and stop.
7. Useful supported transfer context/warnings.

“Fastest”, “Fewest transfers”, “Least walking” are factual comparative labels only
when the returned alternatives justify a distinction; no unexplained “Best”. Use
restrained bordered surfaces and optional pale amber selected/pressed state.
Translate incomplete results as “Some route options may be unavailable.” Do not
show publication UUIDs, pattern IDs, raw GTFS terminology or diagnostic fields.

## Journey detail and timeline

Hierarchy: **Summary → useful interactive map → exact human-readable timeline**.
The timeline is central and fully usable without the map. Actions: Walk, Board,
Ride, Get off, Transfer, Arrive. Show useful event times without timestamp noise.
Boarding gives route, supplied headsign/direction, named stop, scheduled time,
and platform/bay only when actually supplied. Numeric direction IDs are not compass
directions. Ride duration and stop count may be derived from accurate occurrences,
not subtraction of arbitrary source sequence numbers.

Transfers have more breathing room and a clear next action. Preserve space for
future M9 information, but never fabricate “comfortable”, “tight”, or risk levels.
Legacy interchange duration is not measured walking distance. Final arrival has
restrained resolution: **“You've arrived”**, destination and time. No celebration
effects. Static schedule times are identified as scheduled; no false live claims.

## Map and responsive composition

MapLibre is first-class, interactive pan/zoom, a substantial mobile inspectable
height and expansion to a modal full-screen presentation. Minimal obvious controls
include zoom, fit trip, and expand/close. It must not dominate the initial mobile
detail. Desktop dedicates substantially more width/height to a sticky right map
pane while search/results/instructions remain on the left. The route list remains
available during desktop selection. Never center a phone-sized app on a wide page.

Show relevant origin, destination, boarding, transfer and alighting points; avoid
unnecessary network markers. M5 has no trustworthy geometry: **do not draw fake
straight route lines**. Points/spatial context are useful without invented paths.
No geometry subsystem or shape-API extension is needed for M6A.

Normal map style is explicitly configured; no public demo/tile/style fallback.
MapLibre's pinned dependency is pre-approved, third-party hosting is not. Without
a style, provide a deliberate map capability state and the full text itinerary.
Offline preview may use a source-free MapLibre canvas with synthetic journey
points, clearly marked outside the product as developer fixture tooling; it is
not a street map. Basemap visual quality remains a documented review limitation.
Style/provider configuration must preserve attribution and document that approved
map requests can reveal viewport context. No secret provider keys in browser config.

Mobile is primary: 320/390 px, tablet and desktop all need deliberate layouts,
no horizontal overflow, legible line lengths, safe-area padding, map/instruction
balance and usable route-card density. Resize maps when panes/dialogs resize.

## API, privacy and accessibility

Typed frontend boundary consumes M5; no routing logic copied into UI. Use the
architecturally selected TanStack Query for server state with no automatic retries,
no focus refetch and no persistent cache. Cancel superseded searches and on unmount.
Distinguish success, no journey, invalid input, walking not configured, walking
unavailable, timeout, busy server, database/service outage, publication change,
incomplete results and intentional cancellation. Raw codes select human copy only.

Semantic HTML and heading hierarchy; keyboard navigation; visible focus;
accessible dialogs/combobox; labeled icon actions; relevant aria-live updates;
contrast; route identity beyond color; touch targets; reduced motion;
loading/disabled/error states; no critical map-only information. Decorative icons
are hidden from assistive technology, not given meaningless alt text. Dialogs
contain focus and restore the invoking control.

Never put precise origins/destinations in page URLs or ordinary logs. No analytics,
trackers, advertising, session replay or unrelated SDKs. No cookie banner without
technology that needs one. Local places stay local; precise current-location
coordinates never enter storage. Privacy-conscious implementation precedes later
public deployment/legal-policy work.

## M6A implementation and review boundary

Implement tokens/base styles, shell/home, startup location, place search,
departure sheet, Find routes, async/empty/error states, results, detail/timeline,
expandable map/provider boundary, responsive split panes, bounded local places,
typed M5 integration, minimal place API and deterministic preview fixtures.

M6A deliberately excluded branding and M6B work. The approved M6B section above
now authorizes a working name, compact mark, About page and focused refinements.
Dark mode, realtime, transfer risk, replanning, accounts/authentication, public
deployment, arrive-by, payments, analytics, cookie banners, fake reviews, final
legal text, large geometry work and M7 remain excluded.

Preview tooling must make these states selectable without source edits:
location granted; denied/manual; destination search; loading; alternatives;
no journey; provider/service failure; direct detail; transfer detail; overnight;
incomplete; mobile; desktop; expanded map. Synthetic data must never look live.
Tests need no public internet, demo service, credentials or DART download.
Use existing Vitest with a small DOM environment, not a new large browser suite.

Run frozen install, format, lint, typecheck, full tests, router/journey/API/frontend
tests, relevant PostGIS regressions, build, Compose config and diff hygiene. Preserve
retained DART publications and Docker volumes. Record actual results and any
failures in MILESTONE_6_REVIEW.md. Human visual approval is mandatory before M6B;
passing gates alone does not approve the design.

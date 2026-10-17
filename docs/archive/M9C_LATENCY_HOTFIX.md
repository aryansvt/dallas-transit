# M9C warm-routing latency hotfix

Local investigation, 2026-09-26. No production changes, external walking calls,
new dependencies, schedule-loading changes, or timeout increases.

## Findings

The supplied production timeout (26,378 ms, schedule cache hit, 1.2 ms lookup,
zero preparation) does not contain enough information to assign production time
between walking and composition. Previously the API copied planner metrics only
after its deadline check, so timeout responses lost that evidence.

The retained `m9c_benchmark_20260926` loopback database reproduces significant
composition CPU cost independently of walking. A Node CPU profile of the original
audit attributed roughly 3.17 seconds of self time to the onboard comparison
callback, which repeatedly serialized identical ride-signature fragments. That
profile covers the audit matrix and both geographic cases, not one request.

## Before / after

`node scripts/m9c-audit.mjs --perf` uses the production API policy, the retained
Northside-to-AMC request, and immediate **synthetic** endpoint walking. It performs
no external requests. Schedule loading is outside the planning measurements.
Three sequential samples reuse each loaded schedule; two cases use no transfer
graph or two explicitly synthetic directed performance links. The original
planner/composer/router from HEAD were replayed from ignored diagnostic files
against the same benchmark harness; no tracked source was reverted.

| Case                                | Median before | Median after | Reduction |
| ----------------------------------- | ------------: | -----------: | --------: |
| No links: composition               |       3033 ms |      1052 ms |     65.3% |
| No links: total planning            |       3197 ms |      1221 ms |     61.8% |
| Two synthetic links: composition    |       3485 ms |      1191 ms |     65.8% |
| Two synthetic links: total planning |       3649 ms |      1359 ms |     62.8% |

Before composition ranges: 3012–3148 ms / 3453–3522 ms. After: 1023–1102 ms /
1190–1193 ms. Provider wall time was 0.11–0.98 ms before and 0.15–0.97 ms after.
Thus composition dominates this isolated local benchmark. These synthetic
provider times do **not** measure Geoapify latency or explain the exact production
split. A live provider can still dominate; at concurrency two, twelve successful
calls require six waves. This is desktop evidence, not a capacity certification
for Render's 0.5 CPU tier.

## Exact changes

- Cache exact JSON ride-signature fragments per pattern/round and stop occurrence
  pair; retain the computed boarding signature on each onboard state. Patterns
  already group the same route and ordered visits. Signature contents, scan order,
  dominance, equal-state diversity, and ranking are unchanged. Caches are local to
  the scan, not a new persistent schedule or journey cache.
- Validate walking in deterministic small waves with one **request-wide** limit
  shared across access and egress. Reserve alternating endpoint slots in shortlist
  order, fill spare capacity from the remaining endpoint, and commit results in
  reservation order. Never reserve beyond remaining successful-candidate slots or
  each endpoint's attempt budget. A timeout prevents subsequent provider waves,
  including when a provider ignores cancellation. This is not a cross-request
  service-wide semaphore; existing API request admission remains in force.
- Preserve every production limit: six successful access and six egress walks,
  sixteen calls (eight attempts reserved per endpoint), concurrency two, 3000 ms
  provider timeout, 36 logical pairs, six independent access scans, three final
  alternatives. Service-aware candidate selection and walking envelopes remain.
- Publish aggregate stage, candidate/provider/composition timings, provider-call
  count, and completed access-search count before deadline checks. Publish walking
  snapshots per wave and synchronously on abort so response logging cannot outrun
  planner cleanup. Check the elapsed API deadline after each access search instead
  of waiting for all six. One synchronous access scan remains non-preemptible.
  No request coordinates, stop IDs, walking geometry, or provider response details
  are included in these observations.

These are implementation optimizations within ADR 0005; no ranking, discovery,
pedestrian-evidence, or routing architecture decision changes.

## Preservation and verification

All six before/after final-journey JSON hashes match:
`a03748dc655c4d9caaf6041241c853abe846353e78cec1474fb6b1e161385035`.
The benchmark now asserts repeatability, at most three alternatives, UT Dallas
33598 and Knoll Trail 33597 inside the first six service-aware candidates, and
synthetic-link witnesses for Benchmark A (232 → 236 → 227) and bus+rail
(244 → Silver). Synthetic links establish algorithm preservation, not new
pedestrian evidence. Previously measured pedestrian evidence was not persisted
or regenerated.

- Focused router/planner/API suite initially passed 229 existing tests.
- Full offline suite after new tests: 43 files, 519 tests passed, including the
  exhaustive multicriteria routing tests. Added out-of-order walking-wave tests
  at concurrency 1/2/4 and timeout/progress privacy checks.
- Affected local Postgres API/candidate integration suite: 2 files, 20 tests passed.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Build uses the existing
  non-secret CI placeholder environment; initial default build lacked production
  configuration, and sandbox worker-spawn failures required authorized reruns.
- No production deployment, commit, push, or external walking-provider requests.

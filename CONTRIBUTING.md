# Contributing

Thank you for your interest in contributing.

This project is a Dallas-focused public-transit navigator and a learning-oriented open-source software project. Correctness matters because routing mistakes can mislead riders.

## Before contributing

Read:

- `README.md`
- `AGENTS.md`
- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`

Search existing issues before opening a duplicate.

For larger changes, open/discuss an issue first.

## Local setup

Follow the prerequisites and quick start in [README.md](README.md). Package
boundaries, environment variables, and dependency choices are described in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

Before submitting a PR, run from the repository root:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm infra:config
pnpm infra:up
pnpm test:integration
pnpm infra:down
```

Use `pnpm format` to fix formatting. CI installs with `--frozen-lockfile`; include
`pnpm-lock.yaml` when changing dependencies. Existing planning documents are
excluded from the initial formatting rollout to avoid unrelated rewrites.

Vitest discovers `src/**/*.test.{ts,tsx}` in each app, package, and worker. Start with
small deterministic behavior tests. Run just the API tests with
`pnpm --filter @dallas-transit/api test`. Frontend behavior uses Vitest/Happy DOM
and React DOM's `act`, without a separate browser-test framework.

`pnpm test` is offline and does not need backing services. Database integration
tests are a separate required CI gate (`pnpm test:integration`), not silently
skipped unit tests. They use real PostGIS and create/drop a uniquely named test
database, preserving normal local transit data. The test role needs `CREATEDB`;
the local Compose role has it. Custom URLs belong in the worker's ignored `.env`.
See [the static GTFS design](docs/STATIC_GTFS.md) for fixture and import details.
Do not edit applied SQL migrations; add a new numbered migration.

## Pull requests

Keep PRs focused.

A PR should:

- explain the problem
- explain the chosen approach
- mention related issue
- include meaningful tests when behavior changes
- pass CI
- avoid unrelated formatting/refactors
- document architectural changes

## Routing changes

Routing changes require extra care.

Include:

- a deterministic fixture or regression test
- expected itinerary behavior
- explanation of edge cases
- complexity/performance considerations when relevant

Do not modify routing output merely to imitate a third-party router without understanding the discrepancy.

Read [the routing-core design](docs/ROUTING_CORE.md) before changing patterns,
rounds, dominance, or transfer semantics. `pnpm test:router` runs tiny offline
fixtures and an independent exhaustive comparison. Assert exact legs as well as
arrival times. The SQL adapter lives in the ingestion worker and is covered by
`pnpm test:integration`; do not introduce database access into the router. Full
DART validation is supplemental and need not run during ordinary unit-test edits.

Geographic changes should also follow [the geographic planning design](docs/GEOGRAPHIC_JOURNEY_PLANNING.md).
`pnpm test:journey` exercises offline access/egress, walking-aware alternatives,
provider validation and bounded concurrency. PostGIS candidate tests run in
`pnpm test:integration`. Keep provider calls outside `packages/router`; never use
straight-line pruning distances as walking routes. Live provider checks are
optional supplemental evidence and must not become unit-test dependencies.

## API changes

Read [JOURNEY_API.md](docs/JOURNEY_API.md) before changing V1 fields or lifecycle
semantics. Run `pnpm test:api` for injection, deadlines, cancellation and schedule
reuse tests. `pnpm test:integration` includes actual pooled PostGIS behavior in
isolated databases. `pnpm api:validate --mode fixture` exercises the complete
offline contract; optional `--mode retained-dart` reads existing DART data with
explicitly synthetic walks. Neither command calls a public walking service.
Keep HTTP policy and serialization in the API, and pure routing outside it.

## Frontend visual review

Follow [MILESTONE_6_DESIGN.md](docs/MILESTONE_6_DESIGN.md) without inventing a new
visual direction. Run `pnpm test:web` for behavior, not CSS snapshots. Review
`pnpm dev:preview` at `/preview` using its state and viewport controls. Tests and
preview must not need public providers, credentials or a DART download. The
development route is disabled in production; synthetic fixtures never enter
normal serving configuration. Browser and assistive-technology review remains
necessary; DOM tests do not certify visual quality or accessibility.

Milestone 6 received final human visual approval in Firefox on September 24, 2026.
Commit, push, merge, deployment and M7 still require authorization. New map/search providers require explicit approval,
including terms, attribution and privacy. Use targeted workspace checks while
iterating, then run the complete milestone gates once after implementation settles.

## Transit data

Do not commit proprietary or restricted transit data.

Do not add undocumented/unofficial realtime endpoints without discussion.

## Dependencies

New production dependencies should be justified in the PR.

Consider:

- license
- maintenance
- security
- runtime/bundle size
- whether existing tooling is sufficient

## Commit messages

Prefer clear conventional scopes, for example:

```text
feat(router): add transfer-round journey reconstruction
fix(gtfs): handle stop times beyond 24:00
test(router): add missed-transfer fixture
docs(adr): record realtime storage decision
```

## Code of conduct

Be respectful and constructive. See `CODE_OF_CONDUCT.md`.

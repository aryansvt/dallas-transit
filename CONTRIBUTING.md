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

Vitest discovers `src/**/*.test.ts` in each app, package, and worker. Start with
small deterministic behavior tests. Run just the API tests with
`pnpm --filter @dallas-transit/api test`. Playwright will be added when the UI
milestone supplies a meaningful browser journey.

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

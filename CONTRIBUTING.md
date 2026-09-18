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
```

Use `pnpm format` to fix formatting. CI installs with `--frozen-lockfile`; include
`pnpm-lock.yaml` when changing dependencies. Existing planning documents are
excluded from the initial formatting rollout to avoid unrelated rewrites.

Vitest discovers `src/**/*.test.ts` in each app, package, and worker. Start with
small deterministic behavior tests. Run just the API tests with
`pnpm --filter @dallas-transit/api test`. Playwright will be added when the UI
milestone supplies a meaningful browser journey.

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

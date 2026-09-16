# Open-Source Plan

## Two separate goals

### Goal A: this repository is genuinely open source

Requirements:
- public repository
- Apache-2.0
- reproducible local setup
- clear README
- CONTRIBUTING
- CODE_OF_CONDUCT
- SECURITY
- issue templates
- PR template
- CI
- tests
- architecture docs
- roadmap
- useful issue labels

### Goal B: external open-source contributions

This is separate.

A personal public repository does not prove that you can:
- enter another codebase
- follow someone else’s conventions
- communicate with maintainers
- respond to review
- get a change merged

That is the resume/ATS gap we want to close.

## External contribution strategy

Prefer projects directly related to work encountered here.

Candidate ecosystems:
- MobilityData GTFS tools
- OneBusAway
- Transitland
- MapLibre
- OpenTripPlanner
- a real library used by this project

Do not choose a repository solely because it has `good first issue`.

## First contribution

A good first contribution may be:
- documentation correction discovered while using the software
- test coverage for a real edge case
- small bug with clear reproduction
- feed/provider metadata update

The point is to learn the workflow.

## Second contribution

Target code/tests.

Ideal flow:
1. find issue through actual project use
2. reproduce
3. comment if contribution etiquette expects it
4. understand architecture
5. write failing test
6. implement smallest fix
7. run repository checks
8. open PR
9. respond to review
10. merge

## Third contribution

Only if natural.

Prefer a substantive bug/feature over contribution-count inflation.

## Track work

Create:

```text
docs/OPEN_SOURCE_LOG.md
```

For each contribution record:
- repository
- issue
- PR
- problem
- your change
- tests
- review feedback
- merged date
- what you learned

This becomes interview preparation.

## Resume rule

Do not list a contribution merely because a PR was opened.

Prefer merged contributions.

If a major accepted contribution remains open for maintainer timing, describe it accurately.

## What not to do

Avoid:
- mass typo PRs
- drive-by generated changes
- opening PRs without reading CONTRIBUTING
- asking maintainers to debug Codex output
- claiming ownership of changes you cannot explain
- flooding a project with unsolicited refactors

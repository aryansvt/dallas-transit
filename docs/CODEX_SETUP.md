# Codex Setup and Workflow

## Goal

Codex should know the project through version-controlled files, not through dependence on one ChatGPT conversation.

The repository is the source of truth.

## Install

Windows standalone installer:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

Alternative with npm:

```powershell
npm install -g @openai/codex
```

Run:

```powershell
codex
```

Choose **Sign in with ChatGPT**.

Also install the official Codex extension in VS Code.

## Verify project instructions

From repo root:

```powershell
codex --ask-for-approval never "Summarize the current instructions and identify the instruction files you loaded. Do not edit anything."
```

Codex reads `AGENTS.md` before work.

Nested `AGENTS.md` / `AGENTS.override.md` files can later define more specific rules for specialized packages.

## First project prompt

```text
Read AGENTS.md and all documentation under docs/.

Do not modify any files yet.

Explain:
1. the product,
2. V1 scope,
3. explicit non-goals,
4. architecture,
5. route-ranking priorities,
6. our routing-engine strategy,
7. OpenTripPlanner's role,
8. realtime-data policy,
9. unresolved technical risks.

Then recommend the smallest first milestone and stop.
```

## Recommended development loop

For every issue:

### 1. Create/choose issue

Example:
`#7 Implement direct-trip earliest-arrival routing`

### 2. Create branch

```powershell
git switch main
git pull
git switch -c feat/direct-routing
```

### 3. Ask Codex to investigate first

```text
Read the issue and relevant repository docs.

Do not modify code yet.

Explain the current architecture relevant to this issue, propose the smallest implementation, identify tests, and list any assumptions.
```

### 4. Review plan yourself

Do not automatically approve a plan you do not understand.

Ask questions.

### 5. Let Codex implement narrowly

```text
Proceed with the approved scope only.

Add meaningful tests.
Run the relevant test, typecheck, and lint commands.
Do not change unrelated files.
At the end, summarize:
- files changed
- behavior implemented
- tests run
- remaining limitations
```

### 6. Inspect diff

```powershell
git diff
git status
```

Use Codex review if helpful:

```text
Review the uncommitted changes for correctness, transit-domain mistakes, hidden assumptions, and unnecessary complexity. Do not modify files.
```

### 7. Run tests yourself

Do not rely exclusively on the assistant’s summary.

### 8. Commit

```powershell
git add .
git commit -m "feat(router): implement direct-trip earliest arrival"
```

### 9. Push and PR

```powershell
git push -u origin feat/direct-routing
```

Create a PR for meaningful milestones.

## Permission strategy

When learning Codex, keep permissions conservative.

Let it:
- read repo
- edit project files
- run normal build/test commands

Be cautious with:
- destructive shell commands
- secrets
- global installs
- cloud/admin actions
- database deletion

Do not use “never ask” approval modes for broad implementation work until you understand the tool.

The instruction-summary verification command is safe because it explicitly asks for no edits.

## How to keep context complete

Do not paste the entire old chat every session.

Store durable decisions in:
- AGENTS.md
- PROJECT_SPEC
- ARCHITECTURE
- ROADMAP
- ADRs

Store issue-specific context in:
- GitHub issue
- code/tests
- PR description

Store temporary investigation notes in:
- issue comments
- docs only when they remain useful

## When to add nested AGENTS.md

Later examples:

```text
packages/router/AGENTS.md
```

Could contain:
- no database access in router
- fixture requirements
- path reconstruction invariants
- performance rules

```text
apps/web/AGENTS.md
```

Could contain:
- accessibility requirements
- mobile-first rules
- UI testing

Do not add them until root instructions become insufficient.

## Critical rule

If Codex writes code you cannot explain, pause.

Ask:
- walk me through this file
- explain this algorithm on a tiny example
- why was this data structure chosen?
- what is the complexity?
- what breaks if this assumption is false?
- show the test that proves this behavior

The project only helps interviews if you understand it.

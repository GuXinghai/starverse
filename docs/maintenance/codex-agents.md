# Codex Project Subagents (Starverse)

This document defines the stable, auditable project-scoped Codex subagent setup under `.codex/agents/`.

## Scope

Only these four Codex subagents are standard in this repository:

| Agent | Purpose | Sandbox |
|---|---|---|
| `code_mapper` | Read-only code mapping, symbol tracing, execution/data-flow discovery, integration seam discovery | `read-only` |
| `risk_reviewer` | Read-only P0/P1 risk audit (correctness, security, migration, registry/logging integrity, missing tests) | `read-only` |
| `test_runner` | Approved validation command execution, failure summarization, regression attribution | `workspace-write` (no source edits by default) |
| `doc_consistency` | Phase/boundary language checks, owner-decision visibility, acceptance and non-goal consistency | `read-only` |

## When To Call

- Use `code_mapper` before implementation when affected paths are unclear.
- Use `risk_reviewer` before merge for release-blocking risk checks.
- Use `test_runner` when acceptance evidence is required.
- Use `doc_consistency` when docs, phase claims, closeout language, or acceptance matrices change.

## Prohibited Behavior

- No child agent may spawn further child agents (`max_depth = 1` at project config).
- Do not delegate owner decisions, final phase status, or security-boundary decisions to child agents.
- Do not treat OpenCode agent files under `.opencode/` as Codex agent registry.
- `test_runner` must not edit source files unless parent agent explicitly authorizes minimal infra/whitespace-only correction.

## Recommended Parent Prompts

- Use `code_mapper` to map the affected code paths for P4 plugin registry work. Keep it read-only and return repo-relative evidence only.
- Use `risk_reviewer` to review the current diff for P0/P1 issues around registry schema, signature/hash verification, path logging, migration idempotency, and missing tests.
- Use `test_runner` to run the acceptance matrix for this patch: `git diff --check`, targeted vitest files, `vue-tsc`, and required `rg` scans. Do not edit files.
- Use `doc_consistency` to check whether the phase docs overclaim completion or conflict with Starverse owner freeze decisions.

## Common Acceptance Commands

- `git status --short`
- `git diff --check`
- `git diff --name-only`
- `git diff --stat`
- `rg -n "<acceptance pattern>" <paths> -S`
- `npx vitest --run <specific test files>`
- `npx vue-tsc --noEmit -p tsconfig.json`

## Duplicate Cleanup Principles

- Canonical Codex agent names are exactly:
  - `code_mapper`
  - `risk_reviewer`
  - `test_runner`
  - `doc_consistency`
- Agent file names should match agent names:
  - `.codex/agents/code_mapper.toml`
  - `.codex/agents/risk_reviewer.toml`
  - `.codex/agents/test_runner.toml`
  - `.codex/agents/doc_consistency.toml`
- Merge duplicate responsibilities into one of the four canonical agents, then remove the duplicate only when references are confirmed safe.
- If reference safety is uncertain, do not delete immediately; mark for manual confirmation.

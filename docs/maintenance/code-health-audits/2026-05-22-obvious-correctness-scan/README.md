# Obvious Correctness Scan

Audit date: 2026-05-22

## Scope

This audit records high-confidence, obvious code correctness issues in the current Starverse worktree. The scan focuses on:

- TypeScript compile errors
- Undefined references, missing imports, missing exports, and renamed symbol mismatches
- Failing tests likely caused by current code
- Package script, config path, and module resolution errors
- API, IPC, schema, DTO, or view-model mismatches that clearly break runtime behavior
- Stale call sites after refactors
- Contradictory or unreachable branches introduced by recent edits
- Obvious nullable or undefined crash paths proved by surrounding code
- Duplicated or orphaned implementations that create conflicting behavior

## Rules

- Source code, tests, configs, scripts, runtime docs, generated files, lockfiles, and package files are read-only for this audit.
- The only allowed write location is this directory:
  `docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/`
- No fixes, refactors, formatting changes, staging, or commits are performed.
- Unconfirmed suspicions are separated from confirmed or likely findings.

## How To Read This Report

- `findings.md` contains confirmed and likely obvious correctness issues.
- `blocked-or-uncertain.md` contains suspicious items that need reproduction or more context.
- `commands.md` records commands run, summarized output, and interpretation.
- `progress.md` records explored areas, current status, decisions, exclusions, and the next inspection target.
- `next-actions.md` lists prioritized recommended fix phases.


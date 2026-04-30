# Starverse Agent Index

**Purpose**: Fast entrypoint for coding agents. Reduces redundant scanning and misdirection.

**Status**: active
**Last updated**: 2026-05-01

---

## First Read Order

Agent should read in this sequence:

1. **[README.md](../README.md)** — Project positioning & quick start (2 min)
2. **[docs/AGENT_INDEX.md](AGENT_INDEX.md)** — This file (1 min)
3. **[docs/guides/INDEX.md](guides/INDEX.md)** — Documentation hub by scenario (3 min)
4. **[docs/maintenance/maintainer-entry.md](maintenance/maintainer-entry.md)** — Key directories & boundaries (3 min)
5. **[docs/architecture/OVERVIEW.md](architecture/OVERVIEW.md)** — System architecture (5 min)
6. **Task-specific docs** — Based on task area (see routing table below)

**Do not start with**: docs/archive/, docs/refactoring/ (historical only)

---

## Document Status Rules

Apply these rules when reading docs:

| Status | Meaning | When to read | Example |
|--------|---------|--------------|---------|
| **active** | Current implementation or maintained entry point | Always first | `docs/architecture/OVERVIEW.md` |
| **reference** | Stable background or principle docs | For context | Design patterns, ADR decisions |
| **historical** | Process records, migration traces, phase logs | Only for history tracing or regression check | `docs/file-pipeline/phase-5-*.md` |
| **archived** | Read-only record; not current implementation | Never as default | `docs/archive/*` |

**Golden rule for agents**: Unless task is "trace history", "reproduce old flow", or "audit migration", skip `docs/archive/` entirely.

---

## Task Routing Table

| Task Area | Read First | Key Code Paths | Validation hint |
|-----------|------------|-----------------|-----------------|
| **Composer UI** | `docs/guides/INDEX.md` → `docs/architecture/UNIFIED_GENERATION_ARCHITECTURE.md` | `src/ui-app/components/ChatAppComposer.vue`, `src/ui-app/app/appChatApp.logic.ts` | Validate composer UI behavior and app orchestration changes in related `src/ui-app/*.test.ts` when touched |
| **File upload & attachment lifecycle** | `docs/file-pipeline/README.md` → `docs/governance/app-chat-app-logic-boundary.md` | `src/shared/files/sendPlanTypes.ts`, `infra/files/sendPlanService.ts`, `src/ui-app/app/appChatApp.logic.ts` | Run attachment/send-plan related tests when changing these paths |
| **File conversion & preview** | `docs/file-pipeline/phase-8-preview-derivatives.md`, `docs/file-pipeline/phase-9-frontend-ui-mvp.md` | `src/shared/files/`, `infra/files/`, check `docs/file-pipeline/progress-ledger.md` for status | Verify behavior against current status in `progress-ledger.md` before coding |
| **Send Plan** | `docs/governance/app-chat-app-logic-boundary.md` | `infra/files/sendPlanService.ts`, `src/next/openrouter/openRouterSendPlanSerializer.ts` | Keep preflight + serializer path intact; run related tests if modified |
| **OpenRouter request builder** | `docs/architecture/OPENROUTER_INTEGRATION_SUMMARY.md` | `src/next/openrouter/buildRequest.ts`, `src/next/openrouter/sse/decoder.ts` | Use only after Send Plan and serializer boundaries are confirmed; validate request payload and SSE parsing tests when touched |
| **Historical message attachments** | `docs/governance/app-chat-app-logic-boundary.md` | `src/ui-app/app/appChatApp.logic.ts`, `infra/db/repo/messageRepo.ts` | Prioritize targeted checks in these two files for attachment/history handling before edits |
| **Electron IPC** | `docs/architecture/OVERVIEW.md` | `electron/ipc/`, `electron/db/worker.ts`, `src/shared/ipc/openRouterStreamWire.ts` | Confirm IPC handler names and bridge wiring remain consistent |
| **DB & settings** | `docs/maintenance/maintainer-entry.md` (see "活跃代码") | `infra/db/`, `electron-store` config in `electron/main.ts` | Run db/repo and settings-related tests if database/settings paths change |
| **Governance & maintainer rules** | `docs/maintenance/maintainer-entry.md`, `docs/governance/` | `scripts/gates/`, `docs/adr/`, `docs/decisions/` | Re-check gate docs before changing protected boundaries |

---

## Guardrails for Coding Agents

**Do not**:

- Default-scan `docs/archive/`. Enter only when explicitly asked for history.
- Assume Phase-N docs describe current code. Check `docs/file-pipeline/progress-ledger.md` first.
- Treat "preview_optimized" fields as send source unless docs + code explicitly support it.
- Bypass Send Plan or preflight gate logic. All messages must go through `openRouterSendPlanSerializer.ts`.
- Add local absolute paths (e.g., `D:\Starverse\...`) to logs, errors, or new docs.
- Restore deprecated UI paths. If a path is archived or refactored, confirm it's re-enabled in current docs.
- Change code paths without syncing entry doc links.

**Do**:

- Check `docs/DOC_STATUS_INDEX.md` before reading unfamiliar docs.
- Validate assumption against `src/next/` or `electron/` imports.
- Run the smallest relevant test slice for the touched area to confirm the refactor baseline.
- Document new architectural decisions in `docs/adr/` or `docs/decisions/`.

---

## Minimal Validation

After modifying docs or code paths, prefer the narrowest checks for the touched files:

- `git diff --check`
- targeted `rg` scans for stale paths, broad-read language, and broken links
- the smallest relevant existing test command for the touched code, when code actually changed

---

## Related Resources

- [DOC_STATUS_INDEX.md](DOC_STATUS_INDEX.md) — Detailed status of all key docs
- [guides/INDEX.md](guides/INDEX.md) — Full doc navigation hub
- [maintenance/maintainer-entry.md](maintenance/maintainer-entry.md) — Code boundaries & high-risk zones
- [architecture/OVERVIEW.md](architecture/OVERVIEW.md) — Architecture layers & naming conventions

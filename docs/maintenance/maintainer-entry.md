# Starverse Maintainer Entry

**Status**: active
**Document Role**: maintenance
**Last updated**: 2026-09-26

**Purpose**: First-read order and key constraints for new maintainers.
**Governance**: DGR-1 dual-dimension status model.

> **For coding agents**: Read [../AGENT_INDEX.md](../AGENT_INDEX.md) and [../DOC_STATUS_INDEX.md](../DOC_STATUS_INDEX.md) first to route work and check document authority.

---

## Current project status

- **Version**: 0.0.2 (under development)
- **Primary work**: File Pipeline Phases 1–9 are implemented. DFC has reached M63 production closeout. Windows x64 DOCX-to-PDF is the approved production scope (manual installation and offline import; automatic downloads are disabled). macOS and Linux remain undecided (corrected 2026-08-14).
- **Active code directories**: `src/ui-app/`, `src/next/`, `src/shared/files/`, `infra/files/`, `infra/db/`
- **Governance**: ADRs (`docs/adr/`), boundary guardrails (`docs/governance/`), gates (`scripts/gates/`), and documentation governance (`docs/maintenance/document-governance.md`).
- **Document status model**: Lifecycle Status + Document Role; see [document-status-taxonomy.md](document-status-taxonomy.md).
- **Development start**: `npm run electron:dev` starts the full Electron application.
- **Testing**: Run the unit tests most relevant to the changed code path.
- **Key maintenance boundary**: `appChatApp.logic.ts` was 7,966 lines as of 2026-08-14; do not add new business rules there. `openRouterSendPlanSerializer.ts` is the sole payload composition entry point.

---

## First-read order

1. **[README.md](../../README.md)** — project overview and capabilities.
2. **[docs/guides/INDEX.md](../guides/INDEX.md)** — documentation hub by scenario.
3. **[docs/architecture/CURRENT_SYSTEM_ARCHITECTURE.md](../architecture/CURRENT_SYSTEM_ARCHITECTURE.md)** — current architecture; `OVERVIEW.md` is historical.
4. **[docs/file-pipeline/README.md](../file-pipeline/README.md)** — current file-pipeline work.
5. **[docs/file-pipeline/document-format-conversion/progress-ledger.md](../file-pipeline/document-format-conversion/progress-ledger.md)** — append-only DFC implementation ledger; the older progress ledger is archived.
6. **[docs/governance/app-chat-app-logic-boundary.md](../governance/app-chat-app-logic-boundary.md)** — core orchestration module boundaries.
7. **[docs/adr/README.md](../adr/README.md)** — ADR rules; **use this directory for new ADRs**.
8. **[docs/decisions/README.md](../decisions/README.md)** — foundational architecture decisions; **historical reference only**.
9. **[docs/maintenance/document-governance.md](document-governance.md)** — documentation governance rules (DGR-1).

---

## Main code directories

| Directory | Responsibility |
|---|---|
| `src/ui-app/` | Page-level components (AppChatApp, ConversationList, etc.) and application orchestration (`appChatApp.logic.ts`) |
| `src/ui-kit/chat/` | Reusable chat primitives (Composer, Transcript, MessageBubble, rich-text rendering) |
| `src/next/` | Domain modules: conversation, branch, message, OpenRouter, streaming, and persistence |
| `src/shared/` | Cross-layer contracts, file asset types (`sendPlanTypes`, `fileTypes`), and security utilities |
| `infra/db/` | Epoch-2 SQLite schema manifest (`v2/*.sql`) and repositories, owned by the main process (the Worker is retired) |
| `infra/files/` | Send Plan and derived-task services |
| `electron/` | Main process: windows, IPC modules, model catalog, and background tasks |
| `scripts/gates/` | Repository governance gates (`b_gate.mjs` and `tc*` scripts) |

---

## High-risk maintenance boundaries

Understand these constraints before editing code:

- **Do not bypass Send Plan when composing OpenRouter payloads.** `openRouterSendPlanSerializer.ts` is the only authorized entry point. Building payloads directly in the UI bypasses compatibility gates.
- **`preview_optimized` is for preview only.** Never use it as a send source or as OpenRouter serializer input.
- **Handle draft and historical attachment compatibility separately.** The current draft is the primary send input; historical attachments are secondary context candidates and use different gates.
- **Do not build live requests directly in the UI.** `send preflight` (`sendPlan.buildCurrent`) is the mandatory send gate.
- **Do not log local absolute paths, raw Base64 payloads, or API keys.** Diagnostic output must be sanitized.
- **Follow the `appChatApp.logic.ts` boundary** in [app-chat-app-logic-boundary.md](../governance/app-chat-app-logic-boundary.md). Do not add new business rules to that file.
- **ADR directories serve different purposes:**
  - `docs/adr/`: ADR process, templates, and engineering decisions (000–003); use this directory for new ADRs.
  - `docs/decisions/`: foundational project decisions (001–005); historical reference only.
- **Document status model**: use Lifecycle Status + Document Role; see [document-status-taxonomy.md](document-status-taxonomy.md).

---

## Governance gates

| Gate | Trigger | Location |
|---|---|---|
| B_GATE | Detects blacklisted symbols (old types and endpoints) | `scripts/b_gate.mjs` |
| TC17 | UI guardrails — component isolation and responsibility checks | `scripts/gates/tc17-ui-guardrails.mjs` |
| TC18 | UI isolation checks | `scripts/gates/tc18-ui-isolation.mjs` |
| TC19 | Reasoning Stress regression (100 scenarios) | `scripts/gates/tc19-reasoning-stress.mjs` |
| TC14 | Live smoke; requires an OpenRouter key | `scripts/gates/tc14-ui-live-smoke.mjs` |
| ADR | Architecture decision triggers (six hard constraints) | `docs/adr/README.md` |
| Boundary | `appChatApp.logic.ts` responsibility boundary | `docs/governance/app-chat-app-logic-boundary.md` |

---

## Common validation commands

| Command | Purpose |
|---|---|
| Run the nearest relevant tests | Test the code path most relevant to the change |
| `npm run verify:ssot` | Baseline validation (tests and SSOT gates) |
| `npm run verify:live` | Live smoke tests; requires an OpenRouter key |
| `node scripts/b_gate.mjs` | Cross-platform blacklist gate |
| `npm run lint` | ESLint checks |
| `npm run rebuild:node` | Rebuild better-sqlite3 for Node tests and scripts |
| `npm run rebuild:electron` | Rebuild better-sqlite3 for Electron |

---

## Do not

- Edit historical documents under `docs/archive/`.
- Move phase details from `docs/file-pipeline/` into the README.
- Create new governance concepts or phase names.
- Attempt to fix broken links across the entire repository; fix entry-document links only.
- Modify code when working within this documentation-only maintenance guide scope.
- Add new ADRs under `docs/decisions/`; use `docs/adr/`.
- Describe `planned`, `scaffold`, `pilot`, or `deferred` work as `completed`.

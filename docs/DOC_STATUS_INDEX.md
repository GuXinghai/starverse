# Starverse Documentation Status Index

**Purpose**: Help agents judge document timeliness and reading priority.

**Status**: active
**Document Role**: entry
**Last updated**: 2026-08-14
**Governance**: DGR-1 dual-dimension status model

---

## Status Legend

Starverse uses a **dual-dimension status model**. See [document-status-taxonomy.md](maintenance/document-status-taxonomy.md) for full definition.

### Lifecycle Status

- **active**: Current fact or maintained entry point. Read first.
- **reference**: Stable background, principles, or design patterns. Contextual reading.
- **planned**: Document describes planned work, not yet implemented.
- **scaffold**: Document structure exists but content is incomplete.
- **pilot**: Document describes experimental/pilot implementation.
- **historical**: Process records, phase logs, migration traces. Read only for history tracing.
- **archived**: Read-only record. Default: skip unless explicitly asked for history.
- **obsolete-candidate**: Suspected outdated but not yet confirmed.
- **pending-classification**: Not yet classified; status unknown.

### Document Role

- **entry**: Entry point for a domain or feature
- **ssot**: Single Source of Truth for a specific domain
- **roadmap**: Plans, milestones, future directions
- **closeout**: Phase or feature completion record
- **implementation-note**: Implementation details, technical notes
- **decision**: Architecture Decision Record
- **maintenance**: Maintainer guides, governance rules
- **archive-index**: Index of archived documents
- **template**: Document template
- **debug-record**: Debug investigation record
- **candidate-action-list**: Pending actions requiring owner decision
- **spec**: Specification or contract
- **guide**: How-to guide or tutorial

---

## Core Documents

| Path | Lifecycle Status | Document Role | Domain | Read When | Notes |
|------|------------------|---------------|--------|-----------|-------|
| [README.md](../README.md) | active | entry | Project | Always first | 5-min project overview & quick start |
| [AGENT_INDEX.md](AGENT_INDEX.md) | active | entry | Routing | Agent first read | Fast routing table for tasks |
| [DOC_STATUS_INDEX.md](DOC_STATUS_INDEX.md) | active | entry | Status | Check before reading unfamiliar doc | This file |
| [guides/INDEX.md](guides/INDEX.md) | active | entry | Navigation | After AGENT_INDEX | Main doc hub by scenario |
| [maintenance/maintainer-entry.md](maintenance/maintainer-entry.md) | active | maintenance | Boundaries | Team onboarding | Key directories, code boundaries, high-risk zones |
| [architecture/OVERVIEW.md](architecture/OVERVIEW.md) | active | ssot | Architecture | Understand system | Layers, naming, module responsibilities |
| [architecture/provider-architecture/README.md](architecture/provider-architecture/README.md) | active | ssot | Provider Architecture | Multi-provider architecture work | Owner-confirmed multi-provider architecture SSOT |
| [file-pipeline/README.md](file-pipeline/README.md) | active | entry | Feature track | File/conversion tasks | **Entry point**: routes to progress-ledger as SSOT |
| [file-pipeline/progress-ledger.md](file-pipeline/progress-ledger.md) | active | ssot | File Pipeline | Current decisions & blockers | SSOT for file pipeline status |
| [governance/app-chat-app-logic-boundary.md](governance/app-chat-app-logic-boundary.md) | active | ssot | Boundary | Send Plan, attachment tasks | Core app logic boundaries & code paths |
| [adr/README.md](adr/README.md) | reference | decision | Decisions | Trace design decisions | **新 ADR 入口**: ADR 规则、模板、工程决策 (000-003) |
| [decisions/README.md](decisions/README.md) | reference | decision | Decisions | Trace decisions | **仅历史参考**: 项目基础决策 (001-005)，新 ADR 不要放这里 |
| [architecture/UNIFIED_GENERATION_ARCHITECTURE.md](architecture/UNIFIED_GENERATION_ARCHITECTURE.md) | active | ssot | Architecture | Generation/streaming tasks | Current generation config architecture |
| [architecture/OPENROUTER_INTEGRATION_SUMMARY.md](architecture/OPENROUTER_INTEGRATION_SUMMARY.md) | reference | implementation-note | Integration | OpenRouter tasks; legacy integration context | Multi-provider AI integration; current implementation may differ |
| [tailwind/TAILWIND_V4_README.md](tailwind/TAILWIND_V4_README.md) | active | entry | Styling | UI/style tasks | Tailwind v4 migration & rules |
| [archive/README.md](archive/README.md) | archived | archive-index | Catalog | History trace only | 76 files including the archive index; read only for history |
| [analysis/model-provider-identity/README.md](analysis/model-provider-identity/README.md) | reference | entry | Provider/model identity | Identity audit or closeout tracing | Point-in-time evidence; current source remains authoritative |

### DGR-1 Governance Documents

| Path | Lifecycle Status | Document Role | Domain | Read When | Notes |
|------|------------------|---------------|--------|-----------|-------|
| [maintenance/document-status-taxonomy.md](maintenance/document-status-taxonomy.md) | active | maintenance | Governance | Understanding status model | Dual-dimension status model definition |
| [maintenance/document-governance.md](maintenance/document-governance.md) | active | maintenance | Governance | Documentation lifecycle rules | Archive, delete, redirect rules |
| [maintenance/document-redirect-map.md](maintenance/document-redirect-map.md) | active | maintenance | Governance | Tracking moved/renamed docs | Redirect map for DGR-1 changes |

---

## File Pipeline Documents

| Path | Lifecycle Status | Document Role | Focus | Read When |
|------|------------------|---------------|-------|-----------|
| [file-pipeline/README.md](file-pipeline/README.md) | active | entry | Overview | **Entry point**: routes to progress-ledger as SSOT |
| [file-pipeline/progress-ledger.md](file-pipeline/progress-ledger.md) | active | ssot | Ledger | Frozen decisions & blockers — **SSOT for pipeline status** |
| [file-pipeline/phase-1-domain-model.md](file-pipeline/phase-1-domain-model.md) | historical | closeout | Design | Phase 1 process record |
| [file-pipeline/phase-2-persistence-and-storage.md](file-pipeline/phase-2-persistence-and-storage.md) | historical | closeout | Design | Phase 2 process record |
| [file-pipeline/phase-3-ingestion-and-import.md](file-pipeline/phase-3-ingestion-and-import.md) | historical | closeout | Design | Phase 3 process record |
| [file-pipeline/phase-5-send-eligibility-and-planning.md](file-pipeline/phase-5-send-eligibility-and-planning.md) | historical | closeout | Design | Phase 5 process record |
| [file-pipeline/phase-6-openrouter-request-adapter.md](file-pipeline/phase-6-openrouter-request-adapter.md) | historical | closeout | Design | Phase 6 process record |
| [file-pipeline/phase-7-derived-tasks-and-embeddings.md](file-pipeline/phase-7-derived-tasks-and-embeddings.md) | historical | closeout | Design | Phase 7 process record |
| [file-pipeline/phase-8-preview-derivatives.md](file-pipeline/phase-8-preview-derivatives.md) | historical | closeout | Design | Phase 8 process record |
| [file-pipeline/phase-9-frontend-ui-mvp.md](file-pipeline/phase-9-frontend-ui-mvp.md) | historical | closeout | Design | Phase 9 process record |
| [file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md](file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md) | active | ssot | DFC Design | Current document format conversion / preview SSOT |
| [file-pipeline/document-format-conversion/progress-ledger.md](file-pipeline/document-format-conversion/progress-ledger.md) | active | ssot | DFC Progress | Append-only DFC implementation ledger |
| [file-pipeline/document-format-conversion/important-context.md](file-pipeline/document-format-conversion/important-context.md) | active | entry | DFC Context | Recovery entry point for current DFC work |
| [file-pipeline/document-format-conversion/dfc-libreoffice-plugin-management-closeout.md](file-pipeline/document-format-conversion/dfc-libreoffice-plugin-management-closeout.md) | reference | closeout | DFC LibreOffice | Task 10 closeout for Plugin Management integration, acquisition/download, release/upload blockers, Owner gate, and production-claim boundary |
| [file-pipeline/document-format-conversion/dfc-m32-deadline-closeout-demo-readiness.md](file-pipeline/document-format-conversion/dfc-m32-deadline-closeout-demo-readiness.md) | reference | closeout | DFC Readiness | Latest supported/pilot/unsupported matrix |
| [file-pipeline/document-format-conversion/archive/v1.0-superseded/format-conversion-preview-progress.md](file-pipeline/document-format-conversion/archive/v1.0-superseded/format-conversion-preview-progress.md) | archived | closeout | DFC History | Superseded v1.0 progress log; do not use as current implementation guidance |
| [file-pipeline/document-format-conversion/archive/v1.0-superseded/format-conversion-preview-implementation-plan.md](file-pipeline/document-format-conversion/archive/v1.0-superseded/format-conversion-preview-implementation-plan.md) | archived | closeout | DFC History | Superseded v1.0 execution plan; contains old Hybrid route |
| [file-pipeline/document-format-conversion/archive/v1.0-superseded/format-conversion-preview-final.md](file-pipeline/document-format-conversion/archive/v1.0-superseded/format-conversion-preview-final.md) | archived | spec | DFC History | Superseded v1.0 design; v1.2 is current SSOT |

---

## Archive Rule

**All files under `docs/archive/` are marked `archived`.**

Do not read archive by default. Enter only when:

- Explicitly asked to trace history
- Debugging regression or historical behavior
- Auditing completed feature or past migration
- Confirming old decision before refactor

Examples in archive:
- `archive/completed-features/` — Finished implementations
- `archive/bugfixes/` — Past bug fixes
- `archive/analysis/` — Historical problem analysis
- `archive/refactoring/` — Refactor process records
- `archive/optimizations/` — Past optimization work
- `archive/migrations/` — Migration records
- `archive/debug/` — Debug investigation records (DGR-1)
- `archive/documentation/` — Documentation governance records (DGR-1)
- `archive/architecture/` — Architecture records (DGR-1)

---

## Directory Inventory (2026-08-14)

Counts include Markdown, JSON, HTML, CSV, and other tracked files under each directory. They are navigation hints, not lifecycle claims for every file.

| Directory | Files | Default interpretation | Entry / SSOT |
|---|---:|---|---|
| `adr/` | 6 | reference / decision | `adr/README.md` |
| `analysis/` | 10 | reference / historical evidence | `analysis/model-provider-identity/README.md` |
| `architecture/` | 184 | mixed; classify by topic | `architecture/OVERVIEW.md` |
| `archive/` | 76 | archived | `archive/README.md` |
| `bugfix/` | 25 | pending-classification; mostly historical notes | — |
| `decisions/` | 6 | reference / historical decisions | `decisions/README.md` |
| `diagnostics/` | 3 | pending-classification | — |
| `features/` | 31 | pending-classification; implementation notes | — |
| `file-pipeline/` | 166 | mixed; active ledgers plus historical phases | `file-pipeline/README.md` |
| `governance/` | 1 | reference / maintenance | — |
| `guides/` | 33 | active guides plus historical reports | `guides/INDEX.md` |
| `i18n/` | 5 | pending-classification | `i18n/README.md` |
| `maintenance/` | 33 | active maintenance and audit records | `maintenance/maintainer-entry.md` |
| `notes/` | 4 | pending-classification | — |
| `refactor/` | 10 | reference / implementation notes | — |
| `refactoring/` | 1 | redirect only | `refactoring/README.md` |
| `requirements/` | 3 | pending-classification / requirements | — |
| `rfc/` | 1 | pending-classification / proposal | — |
| `security/` | 3 | active or planned security work | — |
| `spec/` | 17 | pending-classification / contracts | — |
| `tailwind/` | 3 | active styling entry and references | `tailwind/TAILWIND_V4_README.md` |
| `todo/` | 2 | reference / pending work | `todo/README.md` |
| `ui-refactoring/` | 9 | reference / implementation notes | — |

Root-level entries are limited to `AGENT_INDEX.md`, `DOC_STATUS_INDEX.md`, and `openrouter-streaming-reasoning-ssot-v2.md`.

## Governance & Development

| Path | Lifecycle Status | Document Role | Domain | Read When |
|------|------------------|---------------|--------|-----------|
| [governance/](governance/) | reference | maintenance | Domain index | Directory scope reference; read concrete governance docs for current rules |
| [adr/](adr/) | reference | decision | Decisions | ADR process rules, templates, engineering decisions (000-003) |
| [decisions/](decisions/) | reference | decision | Decisions | Project foundation decisions (001-005) |
| [bugfix/](bugfix/) | reference | implementation-note | Fixes | Complex historical fixes not yet moved to archive |
| [refactor/](refactor/) | reference | implementation-note | Refactor | OpenRouter refactor records |
| [ui-refactoring/](ui-refactoring/) | reference | implementation-note | Refactor | UI component refactor records |
| [analysis/model-provider-identity/README.md](analysis/model-provider-identity/README.md) | reference | entry | Provider/model identity | Trace evidence; verify claims against current checkout |

## Pending Classification Policy

The inventory above intentionally does not claim that every file in a mixed directory has the same lifecycle. First classify entry points, SSOTs, and documents referenced by current code or tests. Leave low-frequency files as `pending-classification` until an owner reviews them; do not bulk-relabel or move them solely to make counts look clean.

---

## Quick Filter

**For agents**:

- **Must read first**: active status in Core Documents table
- **Likely helpful**: reference status docs (after active)
- **Skip by default**: archived, historical (unless task says "history")
- **Sanity check**: If unsure, check this index before reading unfamiliar doc

---

## Sync Notes

Last sync: 2026-08-14

When adding new docs to docs/ or updating existing status:
1. Update this index
2. Link from guides/INDEX.md or AGENT_INDEX.md
3. Check docs/guides/INDEX.md for any cross-links
4. Run: `rg -n "docs/AGENT_INDEX.md|DOC_STATUS_INDEX" README.md docs`

### Analysis bundle import (2026-08-14)

**Created**:
- `analysis/model-provider-identity/README.md`
- Seven split closeout, independent-review, synthesis, and frozen-decision/implementation documents under `analysis/model-provider-identity/`

**Classification**:
- The directory README is a `reference` / `entry` document.
- The purge closeout and point-in-time reviews are `historical` evidence.
- The cross-review synthesis is `reference` / `candidate-action-list`, not an SSOT or approved implementation plan.
- `07-frozen-decisions-and-implementation-plan.md` is `historical` / closeout evidence after the identity implementation; it no longer owns an active implementation ledger.

### DGR-1 Changes (2026-05-22)

**Status Model**:
- Introduced dual-dimension model: Lifecycle Status + Document Role
- See [document-status-taxonomy.md](maintenance/document-status-taxonomy.md) for full definition

**Archived**:
- 4 DEBUG_OPENROUTER_REQUEST_*.md → `archive/debug/`
- ACCEPTANCE_REPORT.md → `archive/documentation/`
- CLEANUP_REPORT_2025_12.md → `archive/documentation/`
- GENERATION_ARCHITECTURE_SUMMARY.md → `archive/architecture/`

**Created**:
- `maintenance/document-status-taxonomy.md`
- `maintenance/document-governance.md`
- `maintenance/document-redirect-map.md`
- `archive/debug/README.md`
- `archive/documentation/README.md`
- `archive/architecture/README.md`

**Pending**:
- ADR directory routing clarified (DGR-2, merge deferred)
- Chinese filename rename completed (DGR-2)
- refactor/ vs refactoring/ clarification completed (DGR-2)

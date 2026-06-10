# Starverse Documentation Status Index

**Purpose**: Help agents judge document timeliness and reading priority.

**Status**: active
**Last updated**: 2026-05-22
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
| [file-pipeline/README.md](file-pipeline/README.md) | active | entry | Feature track | File/conversion tasks | **Entry point**: routes to progress-ledger as SSOT |
| [file-pipeline/progress-ledger.md](file-pipeline/progress-ledger.md) | active | ssot | File Pipeline | Current decisions & blockers | SSOT for file pipeline status |
| [governance/app-chat-app-logic-boundary.md](governance/app-chat-app-logic-boundary.md) | active | ssot | Boundary | Send Plan, attachment tasks | Core app logic boundaries & code paths |
| [adr/README.md](adr/README.md) | reference | decision | Decisions | Trace design decisions | **新 ADR 入口**: ADR 规则、模板、工程决策 (000-003) |
| [decisions/README.md](decisions/README.md) | reference | decision | Decisions | Trace decisions | **仅历史参考**: 项目基础决策 (001-005)，新 ADR 不要放这里 |
| [architecture/UNIFIED_GENERATION_ARCHITECTURE.md](architecture/UNIFIED_GENERATION_ARCHITECTURE.md) | active | ssot | Architecture | Generation/streaming tasks | Current generation config architecture |
| [architecture/OPENROUTER_INTEGRATION_SUMMARY.md](architecture/OPENROUTER_INTEGRATION_SUMMARY.md) | reference | implementation-note | Integration | OpenRouter tasks; legacy integration context | Multi-provider AI integration; current implementation may differ |
| [tailwind/TAILWIND_V4_README.md](tailwind/TAILWIND_V4_README.md) | active | entry | Styling | UI/style tasks | Tailwind v4 migration & rules |
| [archive/README.md](archive/README.md) | archived | archive-index | Catalog | History trace only | 46+ archived docs (completed-features, bugfixes, analysis, etc.) |

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

## Governance & Development

| Path | Lifecycle Status | Document Role | Domain | Read When |
|------|------------------|---------------|--------|-----------|
| [governance/](governance/) | reference | maintenance | Domain index | Directory scope reference; read concrete governance docs for current rules |
| [adr/](adr/) | reference | decision | Decisions | ADR process rules, templates, engineering decisions (000-003) |
| [decisions/](decisions/) | reference | decision | Decisions | Project foundation decisions (001-005) |
| [bugfix/](bugfix/) | reference | implementation-note | Fixes | Complex historical fixes (not archived) |
| [refactor/](refactor/) | reference | implementation-note | Refactor | SSOT v2 refactor plans (OpenRouter) |
| [ui-refactoring/](ui-refactoring/) | reference | implementation-note | Refactor | UI component refactoring (ChatView, ConversationList) |

> **Note on dual entries**: `refactor/`, `ui-refactoring/`, and `bugfix/` appear in both "Governance & Development" (directory-level role) and "Pending-Classification Directories" (individual files awaiting DGR-3 classification). This is intentional: the directory has a known role, but individual files within it have not yet received per-file lifecycle status.

---

## Pending-Classification Directories

The following directories contain documents that have not yet been classified with dual-dimension status. They are registered as `pending-classification` and will be classified in DGR-3.

| Directory | File Count | Likely Role | Status | Next Step |
|-----------|------------|-------------|--------|-----------|
| [features/](features/) | 31 | implementation-note | pending-classification | DGR-3: classify each file |
| [spec/](spec/) | 17 | spec | pending-classification | DGR-3: classify each file |
| [architecture/](architecture/) | 22 | various | pending-classification | DGR-3: classify each file |
| [bugfix/](bugfix/) | 18+ | implementation-note | pending-classification | DGR-3: classify each file |
| [i18n/](i18n/) | 5 | spec/guide | pending-classification | DGR-3: classify each file |
| [rfc/](rfc/) | 1 | spec | pending-classification | DGR-3: classify each file |
| [notes/](notes/) | 4 | implementation-note | pending-classification | DGR-3: classify each file |
| [requirements/](requirements/) | 3 | spec | pending-classification | DGR-3: classify each file |
| [refactor/](refactor/) | 10 | implementation-note | pending-classification | DGR-3: classify each file |
| [ui-refactoring/](ui-refactoring/) | 9 | implementation-note | pending-classification | DGR-3: classify each file |

**Note**: These directories are NOT individually modified in DGR-1. They are only registered here for tracking.

---

## Quick Filter

**For agents**:

- **Must read first**: active status in Core Documents table
- **Likely helpful**: reference status docs (after active)
- **Skip by default**: archived, historical (unless task says "history")
- **Sanity check**: If unsure, check this index before reading unfamiliar doc

---

## Sync Notes

Last sync: 2026-05-22 (DGR-1)

When adding new docs to docs/ or updating existing status:
1. Update this index
2. Link from guides/INDEX.md or AGENT_INDEX.md
3. Check docs/guides/INDEX.md for any cross-links
4. Run: `rg -n "docs/AGENT_INDEX.md|DOC_STATUS_INDEX" README.md docs`

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

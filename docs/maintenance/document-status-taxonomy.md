# Document Status Taxonomy

**Purpose**: Define the dual-dimension status model for Starverse documentation governance.

**Status**: active  
**Last updated**: 2026-05-22  
**Owner**: DGR-1

---

## Dual-Dimension Model

Starverse documentation uses a dual-dimension status model:

1. **Lifecycle Status** — Where the document is in its lifecycle
2. **Document Role** — What responsibility the document carries

A document always has exactly one Lifecycle Status and one or more Document Roles.

---

## Lifecycle Status

Lifecycle Status indicates the document's current lifecycle state.

| Status | Meaning | When to Use | Example |
|--------|---------|-------------|---------|
| **active** | Current fact or maintained entry point | Always read first; regularly updated | `docs/architecture/OVERVIEW.md` |
| **reference** | Stable background, principles, or design patterns | Read for context; rarely changes | ADR decisions, design principles |
| **planned** | Document describes planned work, not yet implemented | Read only for planning context | Future phase specs |
| **scaffold** | Document structure exists but content is incomplete | Read with caution; gaps expected | Draft specs |
| **pilot** | Document describes experimental/pilot implementation | Read for experimental features | Pilot feature docs |
| **historical** | Process records, phase logs, migration traces | Read only for history tracing | Phase closeout docs |
| **archived** | Read-only record; not current implementation | Skip unless explicitly asked | `docs/archive/*` |
| **obsolete-candidate** | Suspected outdated but not yet confirmed | Flag for review; do not rely on | Stale specs |
| **pending-classification** | Not yet classified; status unknown | Read with caution; verify before relying | Unclassed docs |
| **deferred** | Explicitly deferred by owner decision | Do not implement until re-planned | Deferred roadmap items (see file-pipeline roadmap) |

### Rules

1. **Never promote to completed**: `planned`, `scaffold`, `pilot`, `deferred` must never be written as `completed` or `active` without explicit verification.
2. **Closeout is historical**: Phase closeout documents are `historical`, not evidence of overall system completion.
3. **SSOT override**: If a document is marked as SSOT for a domain, it is `active` or `reference` regardless of other factors.
4. **Archive is terminal**: `archived` documents should not be modified; they are read-only records.

---

## Document Role

Document Role indicates what responsibility the document carries. A document may have multiple roles.

| Role | Meaning | Example |
|------|---------|---------|
| **entry** | Entry point for a domain or feature | `docs/file-pipeline/README.md` |
| **ssot** | Single Source of Truth for a specific domain | `docs/file-pipeline/progress-ledger.md` |
| **roadmap** | Plans, milestones, future directions | README.md roadmap section |
| **closeout** | Phase or feature completion record | `docs/file-pipeline/phase-9-frontend-ui-mvp.md` |
| **implementation-note** | Implementation details, technical notes | `docs/features/*.md` |
| **decision** | Architecture Decision Record | `docs/adr/001-*.md`, `docs/decisions/001-*.md` |
| **maintenance** | Maintainer guides, governance rules | `docs/maintenance/maintainer-entry.md` |
| **archive-index** | Index of archived documents | `docs/archive/README.md` |
| **template** | Document template | `docs/adr/template.md` |
| **debug-record** | Debug investigation record | `docs/archive/debug/*.md` |
| **candidate-action-list** | Pending actions requiring owner decision | DGR reports |
| **spec** | Specification or contract | `docs/spec/*.md` |
| **guide** | How-to guide or tutorial | `docs/guides/*.md` |

---

## Status Combination Examples

| Document | Lifecycle Status | Document Role | Rationale |
|----------|------------------|---------------|-----------|
| `docs/file-pipeline/README.md` | active | entry | Active entry point; routes to SSOT |
| `docs/file-pipeline/progress-ledger.md` | active | ssot | Single source of truth for pipeline status |
| `docs/adr/000-record-architecture-decisions.md` | reference | decision | Stable decision record |
| `docs/file-pipeline/phase-9-frontend-ui-mvp.md` | historical | closeout | Historical phase record |
| `docs/features/BRANCH_TREE_IMPLEMENTATION.md` | pending-classification | implementation-note | Not yet classified |
| `docs/DEBUG_OPENROUTER_REQUEST_LOG.md` | archived | debug-record | Archived debug record |

---

## SSOT Rules

1. **SSOT must be declared**: Any document claiming SSOT status must explicitly declare its domain and coverage boundary.
2. **SSOT is authoritative**: When SSOT and other documents conflict, SSOT wins.
3. **SSOT scope is limited**: Each SSOT covers a specific domain; no single document is SSOT for everything.
4. **SSOT must be active or reference**: SSOT documents cannot be `historical`, `archived`, or `pending-classification`.

### Known SSOT Documents

| Document | Domain | Coverage |
|----------|--------|----------|
| `docs/file-pipeline/progress-ledger.md` | File pipeline decisions & frozen items | All file pipeline decisions |
| `docs/file-pipeline/format-conversion-preview-final.md` | Format conversion design | Conversion preview design |
| `docs/governance/app-chat-app-logic-boundary.md` | appChatApp boundaries | Core app logic boundaries |
| `docs/architecture/OVERVIEW.md` | System architecture | High-level architecture |
| `docs/open_router_流式回复与推理_ssot（v_2_）.md` | OpenRouter streaming & reasoning | SSOT v2 implementation |

---

## Pending-Classification Directories

The following directories contain documents that have not yet been classified:

| Directory | File Count | Likely Role | Next Step |
|-----------|------------|-------------|-----------|
| `docs/features/` | 31 | implementation-note | DGR-2: classify each file |
| `docs/spec/` | 17 | spec | DGR-2: classify each file |
| `docs/architecture/` | 22 | various | DGR-2: classify each file |
| `docs/bugfix/` | 18+ | implementation-note | DGR-2: classify each file |
| `docs/i18n/` | 5 | spec/guide | DGR-2: classify each file |
| `docs/rfc/` | 1 | spec | DGR-2: classify each file |
| `docs/notes/` | 4 | implementation-note | DGR-2: classify each file |
| `docs/requirements/` | 3 | spec | DGR-2: classify each file |
| `docs/refactor/` | 10 | implementation-note | DGR-2: classify each file |
| `docs/refactoring/` | 9 | implementation-note | DGR-2: classify each file |

---

## Document Role Conflict Resolution

When a document appears to have conflicting roles:

1. **Entry vs SSOT**: An entry document routes to SSOT; it is not SSOT itself. Example: `file-pipeline/README.md` is `entry`, not `ssot`.
2. **Closeout vs Completion**: Closeout documents are `historical` records, not evidence that the system is complete.
3. **Decision vs Implementation**: ADR documents are `decision` role; implementation docs are `implementation-note` role.
4. **Reference vs Historical**: `reference` documents are still valid; `historical` documents are process records.

---

## Enforcement

1. **New documents**: Must declare Lifecycle Status and Document Role in header.
2. **Status changes**: Must be documented in `DOC_STATUS_INDEX.md`.
3. **Archive decisions**: Must follow archive trigger conditions in `docs/archive/README.md`.
4. **SSOT claims**: Must be validated against actual usage and cross-references.

---

## Related Documents

- [document-governance.md](document-governance.md) — Overall governance rules
- [document-redirect-map.md](document-redirect-map.md) — Redirect map for moved/renamed docs
- [DOC_STATUS_INDEX.md](../../DOC_STATUS_INDEX.md) — Current status index

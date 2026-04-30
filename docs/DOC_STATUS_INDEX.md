# Starverse Documentation Status Index

**Purpose**: Help agents judge document timeliness and reading priority.

**Status**: active
**Last updated**: 2026-05-01

---

## Status Legend

- **active**: Current fact or maintained entry point. Read first.
- **reference**: Stable background, principles, or design patterns. Contextual reading.
- **historical**: Process records, phase logs, migration traces. Read only for history tracing or regression check.
- **archived**: Read-only record. Default: skip unless explicitly asked for history.

---

## Core Documents

| Path | Status | Domain | Read When | Notes |
|------|--------|--------|-----------|-------|
| [README.md](../README.md) | active | Project | Always first | 5-min project overview & quick start |
| [AGENT_INDEX.md](AGENT_INDEX.md) | active | Routing | Agent first read | Fast routing table for tasks |
| [guides/INDEX.md](guides/INDEX.md) | active | Navigation | After AGENT_INDEX | Main doc hub by scenario |
| [maintenance/maintainer-entry.md](maintenance/maintainer-entry.md) | active | Boundaries | Team onboarding | Key directories, code boundaries, high-risk zones |
| [architecture/OVERVIEW.md](architecture/OVERVIEW.md) | active | Architecture | Understand system | Layers, naming, module responsibilities |
| [file-pipeline/README.md](file-pipeline/README.md) | active | Feature track | File/conversion tasks | Status of Phase 1-9 pipeline |
| [governance/app-chat-app-logic-boundary.md](governance/app-chat-app-logic-boundary.md) | active | Boundary | Send Plan, attachment tasks | Core app logic boundaries & code paths |
| [adr/README.md](adr/README.md) | reference | Decision | Trace design decisions | Architecture Decision Records catalog |
| [decisions/README.md](decisions/README.md) | reference | Decision | Trace decisions | Architecture decision list |
| [architecture/UNIFIED_GENERATION_ARCHITECTURE.md](architecture/UNIFIED_GENERATION_ARCHITECTURE.md) | active | Architecture | Generation/streaming tasks | Current generation config architecture |
| [architecture/OPENROUTER_INTEGRATION_SUMMARY.md](architecture/OPENROUTER_INTEGRATION_SUMMARY.md) | reference | Integration | OpenRouter tasks; legacy integration context | Multi-provider AI integration; current implementation may differ |
| [tailwind/TAILWIND_V4_README.md](tailwind/TAILWIND_V4_README.md) | active | Styling | UI/style tasks | Tailwind v4 migration & rules |
| [archive/README.md](archive/README.md) | archived | Catalog | History trace only | 46+ archived docs (completed-features, bugfixes, analysis, etc.) |

---

## File Pipeline Documents

| Path | Status | Focus | Read When |
|------|--------|-------|-----------|
| [file-pipeline/README.md](file-pipeline/README.md) | reference | Overview | Use for phase map context; current facts follow Core Documents and progress ledger |
| [file-pipeline/progress-ledger.md](file-pipeline/progress-ledger.md) | active | Ledger | Frozen decisions & blockers |
| [file-pipeline/phase-1-domain-model.md](file-pipeline/phase-1-domain-model.md) | historical | Design | Phase 1 process record |
| [file-pipeline/phase-2-persistence-and-storage.md](file-pipeline/phase-2-persistence-and-storage.md) | historical | Design | Phase 2 process record |
| [file-pipeline/phase-3-ingestion-and-import.md](file-pipeline/phase-3-ingestion-and-import.md) | historical | Design | Phase 3 process record |
| [file-pipeline/phase-5-send-eligibility-and-planning.md](file-pipeline/phase-5-send-eligibility-and-planning.md) | historical | Design | Phase 5 process record |
| [file-pipeline/phase-6-openrouter-request-adapter.md](file-pipeline/phase-6-openrouter-request-adapter.md) | historical | Design | Phase 6 process record |
| [file-pipeline/phase-7-derived-tasks-and-embeddings.md](file-pipeline/phase-7-derived-tasks-and-embeddings.md) | historical | Design | Phase 7 process record |
| [file-pipeline/phase-8-preview-derivatives.md](file-pipeline/phase-8-preview-derivatives.md) | historical | Design | Phase 8 process record |
| [file-pipeline/phase-9-frontend-ui-mvp.md](file-pipeline/phase-9-frontend-ui-mvp.md) | historical | Design | Phase 9 process record |
| [file-pipeline/format-conversion-preview-progress.md](file-pipeline/format-conversion-preview-progress.md) | historical | Progress | Format conversion project log |
| [file-pipeline/format-conversion-preview-implementation-plan.md](file-pipeline/format-conversion-preview-implementation-plan.md) | historical | Plan | Format conversion plan (reference) |
| [file-pipeline/format-conversion-preview-final.md](file-pipeline/format-conversion-preview-final.md) | reference | Design | Format conversion final design |

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

---

## Governance & Development

| Path | Status | Domain | Read When |
|------|--------|--------|-----------|
| [governance/](governance/) | reference | Domain index | Directory scope reference; read concrete governance docs for current rules |
| [adr/](adr/) | reference | Decisions | Design justification |
| [decisions/](decisions/) | reference | Decisions | Architecture decision trace |
| [bugfix/](bugfix/) | reference | Fixes | Complex historical fixes (not archived) |
| [refactor/](refactor/) | reference | Refactor | Active refactor projects |

---

## Quick Filter

**For agents**:

- **Must read first**: active status in Core Documents table
- **Likely helpful**: reference status docs (after active)
- **Skip by default**: archived, historical (unless task says "history")
- **Sanity check**: If unsure, check this index before reading unfamiliar doc

---

## Sync Notes

Last sync: 2026-05-01

When adding new docs to docs/ or updating existing status:
1. Update this index
2. Link from guides/INDEX.md or AGENT_INDEX.md
3. Check docs/guides/INDEX.md for any cross-links
4. Run: `rg -n "docs/AGENT_INDEX.md|DOC_STATUS_INDEX" README.md docs`

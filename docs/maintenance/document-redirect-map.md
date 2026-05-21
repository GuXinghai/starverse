# Document Redirect Map

**Purpose**: Track all document moves, renames, and archives for traceability.

**Status**: active  
**Last updated**: 2026-05-22  
**Owner**: DGR-1

---

## Redirect Rules

1. **Every move must be recorded**: When a document is moved, renamed, or archived, an entry must be added here.
2. **Old path must have redirect**: If a directory is affected, a redirect README should be placed at the old location.
3. **References must be updated**: All documents referencing the old path must be updated.
4. **Agent entry must be updated**: `AGENT_INDEX.md` and `DOC_STATUS_INDEX.md` must reflect new paths.

---

## DGR-1 Redirect Map

### DEBUG Documents (Archived)

| Old Path | New Path | Action Type | Status | Notes |
|----------|----------|-------------|--------|-------|
| `docs/DEBUG_OPENROUTER_REQUEST_LOG.md` | `docs/archive/debug/DEBUG_OPENROUTER_REQUEST_LOG.md` | archive | completed | 2026-05-22, DGR-1 |
| `docs/DEBUG_OPENROUTER_REQUEST_LOG_IMPL.md` | `docs/archive/debug/DEBUG_OPENROUTER_REQUEST_LOG_IMPL.md` | archive | completed | 2026-05-22, DGR-1 |
| `docs/DEBUG_OPENROUTER_REQUEST_QUICK_REF.md` | `docs/archive/debug/DEBUG_OPENROUTER_REQUEST_QUICK_REF.md` | archive | completed | 2026-05-22, DGR-1 |
| `docs/DEBUG_OPENROUTER_REQUEST_COMPLETION.md` | `docs/archive/debug/DEBUG_OPENROUTER_REQUEST_COMPLETION.md` | archive | completed | 2026-05-22, DGR-1 |

### Scattered Root Files (Archived)

| Old Path | New Path | Action Type | Status | Notes |
|----------|----------|-------------|--------|-------|
| `docs/ACCEPTANCE_REPORT.md` | `docs/archive/documentation/ACCEPTANCE_REPORT.md` | archive | completed | 2026-05-22, DGR-1 |
| `docs/CLEANUP_REPORT_2025_12.md` | `docs/archive/documentation/CLEANUP_REPORT_2025_12.md` | archive | completed | 2026-05-22, DGR-1 |

### Redundant Architecture Document (Archived)

| Old Path | New Path | Action Type | Status | Notes |
|----------|----------|-------------|--------|-------|
| `docs/architecture/GENERATION_ARCHITECTURE_SUMMARY.md` | `docs/archive/architecture/GENERATION_ARCHITECTURE_SUMMARY.md` | archive | completed | 2026-05-22, DGR-1, redundant with UNIFIED_GENERATION_ARCHITECTURE.md |

---

## Pending Actions (Require Owner Approval)

### ADR Directory Restructuring

| Old Path | New Path | Action Type | Status | Notes |
|----------|----------|-------------|--------|-------|
| `docs/adr/` | `docs/adr/` | keep | pending | ADR process rules, templates, engineering decisions |
| `docs/decisions/` | `docs/decisions/` | keep | pending | Project foundation decisions |

**Decision**: Due to different content and style, directories remain separate. Cross-references maintained.

### Chinese Filename Rename

| Old Path | New Path | Action Type | Status | Notes |
|----------|----------|-------------|--------|-------|
| `docs/open_router_流式回复与推理_ssot（v_2_）.md` | `docs/openrouter-streaming-reasoning-ssot-v2.md` | rename | pending | Requires owner approval, high reference impact |

**Impact Analysis**:
- Referenced by `docs/refactor/plan.md`
- Referenced by `docs/refactor/compliance-checklist.md`
- Referenced by `docs/adr/README.md`
- Referenced by `docs/maintenance/maintainer-entry.md`

**Recommendation**: Defer to DGR-2 due to high reference impact. Create redirect if renamed.

### refactor/ vs refactoring/ Clarification

| Old Path | New Path | Action Type | Status | Notes |
|----------|----------|-------------|--------|-------|
| `docs/refactor/` | `docs/refactor/` | keep | pending | SSOT v2 refactor plans (OpenRouter) |
| `docs/refactoring/` | `docs/ui-refactoring/` | rename | pending | UI component refactoring (ChatView, ConversationList) |

**Decision**: Directories are for different projects. Rename `refactoring/` to `ui-refactoring/` for clarity.

---

## Redirect README Templates

### For Archived Directories

```markdown
# [Directory Name] (Archived)

**Status**: archived  
**Archived**: 2026-05-22  
**Reason**: [Reason for archive]

This directory has been archived. Documents have been moved to:

- [New path or archive location]

For current documentation, see:
- [Related active documentation]

Redirect map: [docs/maintenance/document-redirect-map.md](../maintenance/document-redirect-map.md)
```

### For Renamed Files

```markdown
# [Original Filename] (Renamed)

**Status**: renamed  
**Renamed**: 2026-05-22  
**New name**: [New filename]

This file has been renamed. The content is now at:

- [New path]

Redirect map: [docs/maintenance/document-redirect-map.md](../maintenance/document-redirect-map.md)
```

---

## Reference Update Checklist

When moving or renaming documents, update these files:

### Always Update

- [ ] `docs/DOC_STATUS_INDEX.md`
- [ ] `docs/AGENT_INDEX.md`
- [ ] `docs/guides/INDEX.md`
- [ ] `docs/maintenance/maintainer-entry.md`

### Conditionally Update

- [ ] `README.md` (if referenced in main readme)
- [ ] `docs/archive/README.md` (if archiving)
- [ ] Related README files in same directory
- [ ] Documents that cross-reference the moved file

### Verification

After updates, run:
```bash
rg "old-path" docs README.md
```
to verify no stale references remain.

---

## Archive History

### DGR-1 (2026-05-22)

**Archived**:
- 4 DEBUG_OPENROUTER_REQUEST_*.md files → `docs/archive/debug/`
- ACCEPTANCE_REPORT.md → `docs/archive/documentation/`
- CLEANUP_REPORT_2025_12.md → `docs/archive/documentation/`
- GENERATION_ARCHITECTURE_SUMMARY.md → `docs/archive/architecture/`

**Created**:
- `docs/maintenance/document-status-taxonomy.md`
- `docs/maintenance/document-governance.md`
- `docs/maintenance/document-redirect-map.md`
- `docs/archive/debug/README.md`
- `docs/archive/documentation/README.md`
- `docs/archive/architecture/README.md`

**Updated**:
- `docs/DOC_STATUS_INDEX.md`
- `docs/AGENT_INDEX.md`
- `docs/guides/INDEX.md`
- `docs/maintenance/maintainer-entry.md`
- `docs/archive/README.md`

---

## Related Documents

- [document-governance.md](document-governance.md) — Governance rules
- [document-status-taxonomy.md](document-status-taxonomy.md) — Status model
- [DOC_STATUS_INDEX.md](../../DOC_STATUS_INDEX.md) — Current status index

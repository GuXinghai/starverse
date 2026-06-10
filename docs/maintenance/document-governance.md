# Document Governance Rules

**Purpose**: Define governance rules for Starverse documentation lifecycle management.

**Status**: active
**Last updated**: 2026-05-22
**Owner**: DGR-1

---

## Governance Principles

1. **Evidence preservation**: Historical evidence chains must be preserved; never delete without trace.
2. **Status accuracy**: Document status must reflect reality, not aspirations.
3. **Entry clarity**: Entry points must clearly route to authoritative sources.
4. **SSOT discipline**: Single Source of Truth must be declared and respected.
5. **Redirect completeness**: Moved/renamed documents must have redirect maps.

---

## Document Lifecycle Rules

### Creation

1. New documents must declare:
   - Lifecycle Status (see [document-status-taxonomy.md](document-status-taxonomy.md))
   - Document Role
   - Last updated date
   - Owner (if applicable)

2. New entry points must be registered in:
   - `docs/DOC_STATUS_INDEX.md`
   - `docs/guides/INDEX.md` (if broadly applicable)
   - `docs/AGENT_INDEX.md` (if agent-relevant)

### Status Transitions

| From | To | Allowed | Conditions |
|------|----|---------|------------|
| active | reference | ✅ | Content becomes stable background |
| active | historical | ✅ | Work completed, process record |
| active | archived | ✅ | With archive trigger condition |
| reference | active | ✅ | Content becomes current fact |
| reference | historical | ✅ | Content becomes process record |
| historical | archived | ✅ | With archive trigger condition |
| planned | active | ⚠️ | Only after implementation verified |
| scaffold | active | ⚠️ | Only after content completed |
| pilot | active | ⚠️ | Only after pilot verified |
| pending-classification | any | ✅ | After classification |
| archived | any | ❌ | Archive is terminal |

### Prohibited Transitions

1. **Never promote to completed**: `planned`, `scaffold`, `pilot`, `deferred` must never be written as `completed`.
2. **Never unarchive**: `archived` documents should not be moved back to active status.
3. **Never hide status**: Do not remove status declarations without documentation.

---

## Archive Rules

### Archive Trigger Conditions

A document should be archived when:

1. ✅ Title contains "COMPLETE", "已完成" and completion date > 30 days
2. ✅ Content declares "Status: 已完成" and date > 30 days
3. ✅ Problem resolved and verified stable
4. ✅ Analysis completed and produced follow-up actions
5. ✅ Phase closeout completed

### Archive Process

1. **Check references**: Run `rg` to find all references to the document
2. **Determine value**: Is there historical or debug reference value?
3. **Move to archive**: Move to appropriate `docs/archive/` subdirectory
4. **Create redirect**: Add entry in `docs/maintenance/document-redirect-map.md`
5. **Update index**: Update `docs/archive/README.md` and subdirectory README
6. **Update references**: Update any documents that reference the moved file

### Archive Directory Structure

```
docs/archive/
├── README.md                  # Archive index
├── bugfixes/                  # Historical bug fixes
├── completed-features/        # Completed feature docs
├── analysis/                  # Historical analysis
├── refactoring/               # Refactoring records
├── optimizations/             # Optimization records
├── ui-implementations/        # UI implementation records
├── testing/                   # Test records
├── migrations/                # Migration records
├── debug/                     # Debug investigation records (DGR-1)
└── documentation/             # Documentation governance records
```

---

## Delete Rules

**Deletion is prohibited** unless:

1. Document has no historical value
2. Document has no debug reference value
3. Document is not referenced by any active document
4. Owner explicitly approves deletion
5. Deletion is documented in candidate action list

**Deletion candidates** must be:
- Listed in `docs/maintenance/document-redirect-map.md`
- Marked as `obsolete-candidate` lifecycle status
- Reviewed by owner before actual deletion

---

## Redirect Map Rules

### When Redirect is Required

1. **File moved**: Document moved from one directory to another
2. **File renamed**: Document filename changed
3. **Directory restructured**: Directory merged or split
4. **Entry point changed**: Primary entry point changed

### Redirect Map Format

```markdown
| Old Path | New Path | Action Type | Status | Notes |
|----------|----------|-------------|--------|-------|
| docs/old/file.md | docs/new/file.md | move | completed | 2026-05-22 |
| docs/file.md | docs/archive/file.md | archive | completed | Historical value |
```

### Redirect Maintenance

1. Redirect map must be updated before or with the move/rename
2. Old paths should have a redirect README if directory is affected
3. References in other documents should be updated
4. Agent entry points must be updated

---

## SSOT Rules

### SSOT Declaration

A document claiming SSOT status must:

1. Explicitly declare its domain and coverage boundary
2. Be the authoritative source for that domain
3. Be actively maintained
4. Be registered in `DOC_STATUS_INDEX.md`

### SSOT Conflict Resolution

When two documents claim SSOT for the same domain:

1. Check which document is actually used as authority
2. The document with more cross-references wins
3. If ambiguous, owner must decide
4. The non-authoritative document should be demoted to `reference` or `historical`

### Known SSOT Conflicts (Resolved)

| Domain | SSOT Document | Status |
|--------|---------------|--------|
| File pipeline decisions | `docs/file-pipeline/progress-ledger.md` | ✅ Active |
| Format conversion design / DFC | `docs/file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md` | ✅ Active |
| appChatApp boundaries | `docs/governance/app-chat-app-logic-boundary.md` | ✅ Active |
| System architecture | `docs/architecture/OVERVIEW.md` | ✅ Active |
| OpenRouter streaming | `docs/openrouter-streaming-reasoning-ssot-v2.md` | active SSOT |

---

## ADR Governance

### Current State

Two ADR directories exist:

1. **`docs/adr/`**: ADR process rules, templates, and engineering decisions (000-003)
2. **`docs/decisions/`**: Project foundation decisions (001-005)

### ADR Rules

1. **New ADRs**: Use `docs/adr/` numbering and template
2. **Cross-reference**: Both directories maintain cross-references
3. **No forced merge**: Due to different content and style, directories remain separate
4. **Clear routing**: Agent entry points must clarify which directory to use for new ADRs

### ADR Decision Flow

```
New architectural decision needed
    ↓
Check if similar decision exists in docs/adr/ or docs/decisions/
    ↓
If exists: Reference existing ADR
If new: Create in docs/adr/ using template.md
    ↓
Update docs/adr/README.md index
    ↓
If broadly applicable: Add cross-reference in docs/decisions/README.md
```

---

## DEBUG Document Rules

### DEBUG Document Lifecycle

1. **Active debugging**: DEBUG documents created during active investigation
2. **Post-resolution**: After issue resolved, determine value
3. **With reference value**: Archive to `docs/archive/debug/`
4. **Without reference value**: Mark as `obsolete-candidate`

### DEBUG Archive Process

1. Check references with `rg`
2. Read content to assess reference value
3. Move to `docs/archive/debug/`
4. Create `docs/archive/debug/README.md` index
5. Update `docs/archive/README.md`
6. Add redirect map entry

---

## Pending-Classification Rules

### Directory-Level Registration

Directories with unclassified documents must be:

1. Registered in `DOC_STATUS_INDEX.md` as `pending-classification`
2. Not individually modified until DGR-2 classification
3. Clearly marked as "awaiting classification"

### Classification Priority

| Priority | Directory | Reason |
|----------|-----------|--------|
| High | `docs/features/` | 31 files, likely implementation notes |
| High | `docs/spec/` | 17 files, likely specifications |
| Medium | `docs/architecture/` | 22 files, mixed roles |
| Medium | `docs/bugfix/` | 18+ files, likely implementation notes |
| Low | `docs/i18n/`, `docs/rfc/`, `docs/notes/`, `docs/requirements/` | Small count |

---

## Enforcement

### Pre-Commit Checks

Before committing documentation changes:

1. Run `git diff --name-only` to verify only docs changed
2. Run `git diff --check` for whitespace issues
3. Verify no production code modified
4. Verify redirect map updated if files moved

### Periodic Review

Monthly documentation review should:

1. Check for new `archived` candidates
2. Verify `pending-classification` directories
3. Update `DOC_STATUS_INDEX.md`
4. Check SSOT consistency
5. Review `obsolete-candidate` list

---

## Related Documents

- [document-status-taxonomy.md](document-status-taxonomy.md) — Status model definition
- [document-redirect-map.md](document-redirect-map.md) — Redirect map
- [DOC_STATUS_INDEX.md](../../DOC_STATUS_INDEX.md) — Current status index
- [AGENT_INDEX.md](../../AGENT_INDEX.md) — Agent entry point

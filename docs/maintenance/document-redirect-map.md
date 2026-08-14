# Document Redirect Map

**Purpose**: Track all document moves, renames, and archives for traceability.

**Status**: active
**Document Role**: maintenance
**Last updated**: 2026-08-14
**Owner**: DGR-2

---

## Redirect Rules

1. **Every move must be recorded**: When a document is moved, renamed, or archived, an entry must be added here.
2. **Old path must have redirect**: If a directory is affected, a redirect README should be placed at the old location.
3. **References must be updated**: All documents referencing the old path must be updated.
4. **Agent entry must be updated**: `AGENT_INDEX.md` and `DOC_STATUS_INDEX.md` must reflect new paths.

---

## 2026-08-14 Navigation Refresh

No document paths were moved or renamed in this refresh. The navigation indexes were synchronized with the current checkout, and `docs/guides/DOCUMENT_REORGANIZATION_PLAN.md` was marked as a historical process record. Existing redirects remain authoritative for the earlier DGR-1/DGR-2 moves.

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
| `docs/adr/` | `docs/adr/` | keep | completed | ADR process rules, templates, engineering decisions — **new ADR entry** |
| `docs/decisions/` | `docs/decisions/` | keep | completed | Project foundation decisions — **historical reference only** |

**Decision**: Due to different content and style, directories remain separate. Cross-references maintained. Routing clarified in guides/INDEX.md, README.md, and decisions/README.md. Merge deferred (64+ references, numbering overlap).

### Chinese Filename Rename

| Old Path | New Path | Action Type | Status | Notes |
|----------|----------|-------------|--------|-------|
| `docs/open_router_流式回复与推理_ssot（v_2_）.md` | `docs/openrouter-streaming-reasoning-ssot-v2.md` | rename | completed | DGR-2, 9 references updated |

**Impact Analysis**:
- Referenced by `docs/refactor/plan.md` updated
- Referenced by `docs/refactor/compliance-checklist.md` updated
- Referenced by `docs/refactor/risk-log.md` updated
- Referenced by `docs/refactor/observability.md` updated
- Referenced by `docs/refactor/CLEANUP_COMPLETION_REPORT.md` updated
- Referenced by `docs/adr/README.md` updated
- Referenced by `docs/maintenance/document-governance.md` updated
- Referenced by `docs/maintenance/document-status-taxonomy.md` updated
- Referenced by `docs/maintenance/document-redirect-map.md` updated

### refactor/ vs refactoring/ Clarification

| Old Path | New Path | Action Type | Status | Notes |
|----------|----------|-------------|--------|-------|
| `docs/refactor/` | `docs/refactor/` | keep | completed | SSOT v2 refactor plans (OpenRouter) |
| `docs/refactoring/` | `docs/ui-refactoring/` | rename | completed | UI component refactoring (ChatView, ConversationList), DGR-2 |

**Decision**: Directories are for different projects. Renamed `refactoring/` to `ui-refactoring/` for clarity. Redirect README placed at `docs/refactoring/README.md`.

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

### DGR-2 (2026-05-22)

**Renamed**:
- `docs/refactoring/` → `docs/ui-refactoring/` (directory rename, redirect README placed)
- `docs/open_router_流式回复与推理_ssot（v_2_）.md` → `docs/openrouter-streaming-reasoning-ssot-v2.md` (9 references updated)

**Routing Clarified**:
- `docs/adr/` confirmed as primary ADR entry (new ADRs)
- `docs/decisions/` confirmed as historical reference only

**Updated**:
- `docs/AGENT_INDEX.md`
- `docs/DOC_STATUS_INDEX.md`
- `docs/guides/INDEX.md`
- `docs/maintenance/maintainer-entry.md`
- `docs/maintenance/document-governance.md`
- `docs/maintenance/document-status-taxonomy.md`
- `docs/maintenance/document-redirect-map.md`
- `docs/adr/README.md`
- `docs/decisions/README.md`
- `README.md`
- `docs/refactor/plan.md`
- `docs/refactor/compliance-checklist.md`
- `docs/refactor/risk-log.md`
- `docs/refactor/observability.md`
- `docs/refactor/CLEANUP_COMPLETION_REPORT.md`

---

## Related Documents

- [document-governance.md](document-governance.md) — Governance rules
- [document-status-taxonomy.md](document-status-taxonomy.md) — Status model
- [DOC_STATUS_INDEX.md](../DOC_STATUS_INDEX.md) — Current status index
## 2026-08-14 DGR-3 Batch Archive (Owner-approved)

| Old Path | New Path | Action Type | Status | Notes |
|----------|----------|-------------|--------|-------|
| `docs\bugfix\PROJECT_MANAGEMENT_FIXES.md` | `docs\archive\bugfixes\PROJECT_MANAGEMENT_FIXES.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\CHAT_SEND_DELAY_UNDO_ABORT_TASK.md` | `docs\archive\documentation\CHAT_SEND_DELAY_UNDO_ABORT_TASK.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\USAGE_STATISTICS_PHASE2_COMPLETE.md` | `docs\archive\completed-features\USAGE_STATISTICS_PHASE2_COMPLETE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\CHAT_TOOLBAR_BUTTON_IMPLEMENTATION.md` | `docs\archive\completed-features\CHAT_TOOLBAR_BUTTON_IMPLEMENTATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\CHAT_TOOLBAR_BUTTON_DESIGN.md` | `docs\archive\ui-implementations\CHAT_TOOLBAR_BUTTON_DESIGN.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\SQLITE_ENHANCEMENT_IMPLEMENTATION.md` | `docs\archive\completed-features\SQLITE_ENHANCEMENT_IMPLEMENTATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\BUGFIX_MODEL_DATA_TYPE_INCONSISTENCY.md` | `docs\archive\bugfixes\BUGFIX_MODEL_DATA_TYPE_INCONSISTENCY.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\DOCUMENT_CLEANUP_AUDIT.md` | `docs\archive\documentation\DOCUMENT_CLEANUP_AUDIT.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\BUGFIX_MODEL_IPC_SERIALIZATION.md` | `docs\archive\bugfixes\BUGFIX_MODEL_IPC_SERIALIZATION.md` | move | completed | 2026-08-14 DGR-3 |
| `PHASE3_AUDIT_REPORT.md` | `docs\archive\documentation\PHASE3_AUDIT_REPORT.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\FIX_STATE_MUTEX_FAILURE.md` | `docs\archive\bugfixes\FIX_STATE_MUTEX_FAILURE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\MODEL_PERSISTENCE_MIGRATION.md` | `docs\archive\completed-features\MODEL_PERSISTENCE_MIGRATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\DATA_CLEANUP_GUIDE.md` | `docs\archive\documentation\DATA_CLEANUP_GUIDE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\BUGFIX_FIRST_TOKEN_TIMEOUT_RACE_CONDITION.md` | `docs\archive\bugfixes\BUGFIX_FIRST_TOKEN_TIMEOUT_RACE_CONDITION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\CHAT_MULTITHREADING_PERFORMANCE_GUIDE.md` | `docs\archive\optimizations\CHAT_MULTITHREADING_PERFORMANCE_GUIDE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\PHASE_3_MIGRATION_GUIDE.md` | `docs\archive\migrations\PHASE_3_MIGRATION_GUIDE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\CHAT_INPUT_CUTOVER_AUDIT.md` | `docs\archive\completed-features\CHAT_INPUT_CUTOVER_AUDIT.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\STORYBOOK_VALIDATION_CHECKLIST.md` | `docs\archive\testing\STORYBOOK_VALIDATION_CHECKLIST.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\REFACTOR_TEST_GUIDE.md` | `docs\archive\testing\REFACTOR_TEST_GUIDE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\PERFORMANCE_OPTIMIZATION_OPPORTUNITIES.md` | `docs\archive\optimizations\PERFORMANCE_OPTIMIZATION_OPPORTUNITIES.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\SAMPLING_PARAMETERS_FEATURE.md` | `docs\archive\completed-features\SAMPLING_PARAMETERS_FEATURE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\PARAMETER_PANEL_TESTING_GUIDE.md` | `docs\archive\testing\PARAMETER_PANEL_TESTING_GUIDE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\DEBUG_MESSAGE_SENDING_STALL.md` | `docs\archive\bugfixes\DEBUG_MESSAGE_SENDING_STALL.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\ADDITIONAL_OPTIMIZATION_SUGGESTIONS.md` | `docs\archive\optimizations\ADDITIONAL_OPTIMIZATION_SUGGESTIONS.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\PROJECT_CREATION_DEADLOCK_FIX.md` | `docs\archive\bugfixes\PROJECT_CREATION_DEADLOCK_FIX.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\SEND_BUTTON_STATE_OPTIMIZATION.md` | `docs\archive\completed-features\SEND_BUTTON_STATE_OPTIMIZATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\PROVIDER_CONSTANTS_QUICK_REF.md` | `docs\archive\documentation\PROVIDER_CONSTANTS_QUICK_REF.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\ALL_FIXES_COMPLETE.md` | `docs\archive\bugfixes\ALL_FIXES_COMPLETE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\IMAGE_GENERATION_DEBUG_GUIDE.md` | `docs\archive\debug\IMAGE_GENERATION_DEBUG_GUIDE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\HIGH_PRIORITY_CHANGES_COMPLETE.md` | `docs\archive\completed-features\HIGH_PRIORITY_CHANGES_COMPLETE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\SCROLLBAR_AUTO_HIDE_IMPLEMENTATION.md` | `docs\archive\completed-features\SCROLLBAR_AUTO_HIDE_IMPLEMENTATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\REASONING_STREAMTEXT_LOSS_RCA.md` | `docs\archive\bugfixes\REASONING_STREAMTEXT_LOSS_RCA.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\TEST_2.2_REASONING_CONTROL.md` | `docs\archive\testing\TEST_2.2_REASONING_CONTROL.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\PHASE_3_UI_CONFIG_INTEGRATION.md` | `docs\archive\completed-features\PHASE_3_UI_CONFIG_INTEGRATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\WORKER_BUILD_ISSUE.md` | `docs\archive\bugfixes\WORKER_BUILD_ISSUE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\WEB_WORKER_IMPLEMENTATION.md` | `docs\archive\completed-features\WEB_WORKER_IMPLEMENTATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\CLONE_ERROR_FIX.md` | `docs\archive\bugfixes\CLONE_ERROR_FIX.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\REASONING_TIERS_4_LEVELS.md` | `docs\archive\completed-features\REASONING_TIERS_4_LEVELS.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\BRANCH_DELETE_TEST_GUIDE.md` | `docs\archive\testing\BRANCH_DELETE_TEST_GUIDE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\STORYBOOK_DOCUMENTATION_ACCURACY_UPDATE.md` | `docs\archive\completed-features\STORYBOOK_DOCUMENTATION_ACCURACY_UPDATE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\SUBMENU_TELEPORT_FIX.md` | `docs\archive\bugfixes\SUBMENU_TELEPORT_FIX.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\MODERN_CHAT_INPUT_IMPLEMENTATION.md` | `docs\archive\completed-features\MODERN_CHAT_INPUT_IMPLEMENTATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\REASONING_TOGGLE_UX_IMPROVEMENT.md` | `docs\archive\completed-features\REASONING_TOGGLE_UX_IMPROVEMENT.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\DOCUMENT_REORGANIZATION_PLAN.md` | `docs\archive\documentation\DOCUMENT_REORGANIZATION_PLAN.md` | move | completed | 2026-08-14 DGR-3 |
| `PARAMETER_PANEL_COMPLETION_CARD.md` | `docs\archive\documentation\PARAMETER_PANEL_COMPLETION_CARD.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\PROPS_OPTIMIZATION_EXECUTION_SUMMARY.md` | `docs\archive\completed-features\PROPS_OPTIMIZATION_EXECUTION_SUMMARY.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\BUGFIX_MODEL_DATA_FIELD_MISMATCH.md` | `docs\archive\bugfixes\BUGFIX_MODEL_DATA_FIELD_MISMATCH.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\RECENT_FIXES_2025_11.md` | `docs\archive\bugfixes\RECENT_FIXES_2025_11.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\SEARCH_FTS5_IMPROVEMENT.md` | `docs\archive\completed-features\SEARCH_FTS5_IMPROVEMENT.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\REASONING_IMPLEMENTATION_SUMMARY.md` | `docs\archive\completed-features\REASONING_IMPLEMENTATION_SUMMARY.md` | move | completed | 2026-08-14 DGR-3 |
| `INTEGRATION_TEST_CHECKLIST.md` | `docs\archive\testing\INTEGRATION_TEST_CHECKLIST.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\BUGFIX_ASSISTANT_MESSAGE_EMPTY_DISPLAY.md` | `docs\archive\bugfixes\BUGFIX_ASSISTANT_MESSAGE_EMPTY_DISPLAY.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\UI_REFACTOR_PAUSED_STATE.md` | `docs\archive\refactoring\UI_REFACTOR_PAUSED_STATE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\STORYBOOK_PHASE2_COMPLETE.md` | `docs\archive\completed-features\STORYBOOK_PHASE2_COMPLETE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\SAVE_OPTIMIZATION_SUMMARY.md` | `docs\archive\completed-features\SAVE_OPTIMIZATION_SUMMARY.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\TAB_MANAGEMENT_REACTIVE_UPDATE_FIX.md` | `docs\archive\bugfixes\TAB_MANAGEMENT_REACTIVE_UPDATE_FIX.md` | move | completed | 2026-08-14 DGR-3 |
| `TEST_EXECUTION_REPORT.md` | `docs\archive\testing\TEST_EXECUTION_REPORT.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\SEND_TIMEOUT_CONFIGURATION.md` | `docs\archive\completed-features\SEND_TIMEOUT_CONFIGURATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\BUGFIX_SAMPLING_PARAMETERS_IMPORT.md` | `docs\archive\bugfixes\BUGFIX_SAMPLING_PARAMETERS_IMPORT.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\CONVERSATION_PARAMETER_PANEL_INTEGRATION.md` | `docs\archive\completed-features\CONVERSATION_PARAMETER_PANEL_INTEGRATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\PHASE3_COMPLETE_SUMMARY.md` | `docs\archive\completed-features\PHASE3_COMPLETE_SUMMARY.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\PROPS_ANALYSIS_ModernChatInput.md` | `docs\archive\completed-features\PROPS_ANALYSIS_ModernChatInput.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\TASK_SEND_DELAY_ABORT_IMPLEMENTATION_ANALYSIS.md` | `docs\archive\completed-features\TASK_SEND_DELAY_ABORT_IMPLEMENTATION_ANALYSIS.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\ASSISTANT_MESSAGE_TIMING_FIX.md` | `docs\archive\bugfixes\ASSISTANT_MESSAGE_TIMING_FIX.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\BUGFIX_STREAM_IDLE_TIMEOUT_TIMER_LEAK.md` | `docs\archive\bugfixes\BUGFIX_STREAM_IDLE_TIMEOUT_TIMER_LEAK.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\BRANCH_TREE_IMPLEMENTATION.md` | `docs\archive\completed-features\BRANCH_TREE_IMPLEMENTATION.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\CONVERSATION_PERSISTENCE_FIX.md` | `docs\archive\bugfixes\CONVERSATION_PERSISTENCE_FIX.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\FIX_GHOST_TASK_COMPLETE.md` | `docs\archive\bugfixes\FIX_GHOST_TASK_COMPLETE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\DOCUMENT_CLEANUP_EXECUTION_GUIDE.md` | `docs\archive\documentation\DOCUMENT_CLEANUP_EXECUTION_GUIDE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\TOOLBAR_BUTTON_HEIGHT_DIAGNOSIS.md` | `docs\archive\bugfixes\TOOLBAR_BUTTON_HEIGHT_DIAGNOSIS.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\REASONING_UI_MIGRATION_GUIDE.md` | `docs\archive\migrations\REASONING_UI_MIGRATION_GUIDE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\SCROLL_SYSTEM_REFACTOR_COMPLETE.md` | `docs\archive\completed-features\SCROLL_SYSTEM_REFACTOR_COMPLETE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\DEBUG_SEND_DELAY_BUTTON_SWITCH.md` | `docs\archive\bugfixes\DEBUG_SEND_DELAY_BUTTON_SWITCH.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\REASONING_PERSISTENCE_ANALYTICS.md` | `docs\archive\completed-features\REASONING_PERSISTENCE_ANALYTICS.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\PROVIDER_CONSTANTS_CHECKLIST.md` | `docs\archive\documentation\PROVIDER_CONSTANTS_CHECKLIST.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\features\PARAMETER_PANEL_POSITION_ALIGNMENT.md` | `docs\archive\completed-features\PARAMETER_PANEL_POSITION_ALIGNMENT.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\TOOLBAR_BUTTON_HEIGHT_FIX.md` | `docs\archive\bugfixes\TOOLBAR_BUTTON_HEIGHT_FIX.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\STORAGE_VERIFICATION_REPORT.md` | `docs\archive\documentation\STORAGE_VERIFICATION_REPORT.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\UI_REFACTOR_STRATEGY_ADJUSTED.md` | `docs\archive\refactoring\UI_REFACTOR_STRATEGY_ADJUSTED.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\bugfix\VUE_PROXY_CLONE_FIX.md` | `docs\archive\bugfixes\VUE_PROXY_CLONE_FIX.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\GENERATION_MIGRATION_GUIDE.md` | `docs\archive\migrations\GENERATION_MIGRATION_GUIDE.md` | move | completed | 2026-08-14 DGR-3 |
| `docs\guides\REASONING_TESTING_STRATEGY.md` | `docs\archive\testing\REASONING_TESTING_STRATEGY.md` | move | completed | 2026-08-14 DGR-3 |

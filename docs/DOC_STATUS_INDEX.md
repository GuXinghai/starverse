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
| [architecture/CURRENT_SYSTEM_ARCHITECTURE.md](architecture/CURRENT_SYSTEM_ARCHITECTURE.md) | active | ssot | Architecture | Understand current system | Current process, data and module boundaries |
| [architecture/OVERVIEW.md](architecture/OVERVIEW.md) | historical | implementation-note | Historical architecture | Trace retired Worker/dbBridge design | Not current implementation authority |
| [architecture/provider-architecture/README.md](architecture/provider-architecture/README.md) | active | ssot | Provider Architecture | Multi-provider architecture work | Owner-confirmed multi-provider architecture SSOT |
| [file-pipeline/README.md](file-pipeline/README.md) | active | entry | Feature track | File/conversion tasks | **Entry point**: 当前状态见 README 与 DFC ledger（progress-ledger 已归档） |
| [file-pipeline/progress-ledger.md](file-pipeline/progress-ledger.md) | archived | closeout | File Pipeline | History only | Worker 架构（2025-11~2026-01）记录；2026-08-14 归档，被 README + DFC ledger 取代 |
| [governance/app-chat-app-logic-boundary.md](governance/app-chat-app-logic-boundary.md) | active | ssot | Boundary | Send Plan, attachment tasks | Core app logic boundaries & code paths |
| [adr/README.md](adr/README.md) | reference | decision | Decisions | Trace design decisions | **新 ADR 入口**: ADR 规则、模板、工程决策 (000-003) |
| [decisions/README.md](decisions/README.md) | reference | decision | Decisions | Trace decisions | **仅历史参考**: 项目基础决策 (001-005)，新 ADR 不要放这里 |
| [architecture/UNIFIED_GENERATION_ARCHITECTURE.md](architecture/UNIFIED_GENERATION_ARCHITECTURE.md) | reference | implementation-note | Architecture | Generation design baseline | 2025-12-02 统一参数设计记录；已被 Generation V2（src/next/generation-v2/）取代 |
| [architecture/OPENROUTER_INTEGRATION_SUMMARY.md](architecture/OPENROUTER_INTEGRATION_SUMMARY.md) | reference | implementation-note | Integration | OpenRouter tasks; legacy integration context | Multi-provider AI integration; current implementation may differ |
| [tailwind/TAILWIND_V4_README.md](tailwind/TAILWIND_V4_README.md) | active | entry | Styling | UI/style tasks | Tailwind v4 migration & rules |
| [archive/README.md](archive/README.md) | archived | archive-index | Catalog | History trace only | 158 files including the archive index; read only for history |
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
| [file-pipeline/README.md](file-pipeline/README.md) | active | entry | Overview | **Entry point**: 当前状态见 README 与 DFC ledger（progress-ledger 已归档） |
| [file-pipeline/progress-ledger.md](file-pipeline/progress-ledger.md) | archived | closeout | Ledger | Worker 架构历史记录 — 2026-08-14 已归档 |
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
| [file-pipeline/document-format-conversion/dfc-libreoffice-plugin-management-closeout.md](file-pipeline/document-format-conversion/dfc-libreoffice-plugin-management-closeout.md) | archived | closeout | DFC LibreOffice | Task 10 closeout for Plugin Management integration, acquisition/download, release/upload blockers, Owner gate, and production-claim boundary. **Archived 2026-08-14**: superseded by DFC-M46/M63 |
| [file-pipeline/document-format-conversion/dfc-m32-deadline-closeout-demo-readiness.md](file-pipeline/document-format-conversion/dfc-m32-deadline-closeout-demo-readiness.md) | archived | closeout | DFC Readiness | Supported/pilot/unsupported matrix at the DFC-M32 closeout. **Archived 2026-08-14**: superseded by DFC-M46/M63 |
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
| `analysis/` | 11 | reference / historical evidence | `analysis/model-provider-identity/README.md` |
| `architecture/` | 185 | mixed; classify by topic | `architecture/CURRENT_SYSTEM_ARCHITECTURE.md` |
| `archive/` | 158 | archived | `archive/README.md` |
| `bugfix/` | 1 | 2026-08-14 已整体归档至 `archive/bugfixes/`；仅重定向 README | `bugfix/README.md` |
| `decisions/` | 6 | reference / historical decisions | `decisions/README.md` |
| `diagnostics/` | 4 | 已分类（2026-08-14）：historical 诊断调查 | `diagnostics/README.md` |
| `features/` | 1 | 2026-08-14 已整体归档至 `archive/completed-features/` 等；仅重定向 README | `features/README.md` |
| `file-pipeline/` | 166 | mixed; active ledgers plus historical phases | `file-pipeline/README.md` |
| `governance/` | 1 | reference / maintenance | — |
| `guides/` | 11 | active guides（2026-08-14 历史报告已归档） | `guides/INDEX.md` |
| `i18n/` | 5 | 已分类（2026-08-14）：active 入口 + reference/historical | `i18n/README.md` |
| `maintenance/` | 33 | active maintenance and audit records | `maintenance/maintainer-entry.md` |
| `notes/` | 5 | 已分类（2026-08-14）：reference/historical 验证记录 | `notes/README.md` |
| `refactor/` | 11 | 已分类（2026-08-14）：historical 重构记录 | `refactor/README.md` |
| `refactoring/` | 1 | redirect only | `refactoring/README.md` |
| `requirements/` | 4 | 已分类（2026-08-14）：historical / planned 需求 | `requirements/README.md` |
| `rfc/` | 2 | 已分类（2026-08-14）：historical 未批准提案 | `rfc/README.md` |
| `security/` | 4 | active or planned security work | — |
| `spec/` | 18 | 已分类（2026-08-14）：reference/historical 契约背景 | `spec/README.md` |
| `tailwind/` | 3 | active styling entry and references | `tailwind/TAILWIND_V4_README.md` |
| `todo/` | 2 | reference / pending work | `todo/README.md` |
| `ui-refactoring/` | 10 | 已分类（2026-08-14）：historical UI 重构过程记录 | `ui-refactoring/README.md` |

Root-level entries are limited to `AGENT_INDEX.md`, `DOC_STATUS_INDEX.md`, and `openrouter-streaming-reasoning-ssot-v2.md`.

## Governance & Development

| Path | Lifecycle Status | Document Role | Domain | Read When |
|------|------------------|---------------|--------|-----------|
| [governance/](governance/) | reference | maintenance | Domain index | Directory scope reference; read concrete governance docs for current rules |
| [adr/](adr/) | reference | decision | Decisions | ADR process rules, templates, engineering decisions (000-003) |
| [decisions/](decisions/) | reference | decision | Decisions | Project foundation decisions (001-005) |
| [bugfix/](bugfix/) | archived | implementation-note | Fixes | 2026-08-14 已整体归档至 archive/bugfixes/；仅重定向 README |
| [refactor/](refactor/) | reference | implementation-note | Refactor | OpenRouter refactor records |
| [ui-refactoring/](ui-refactoring/) | historical | implementation-note | Refactor | UI 重构过程记录（2026-08-14 分类；与 AGENT_INDEX "historical only" 一致） |
| [analysis/model-provider-identity/README.md](analysis/model-provider-identity/README.md) | reference | entry | Provider/model identity | Trace evidence; verify claims against current checkout |

## Pending Classification Policy

The inventory above intentionally does not claim that every file in a mixed directory has the same lifecycle. First classify entry points, SSOTs, and documents referenced by current code or tests. Leave low-frequency files as `pending-classification` until an owner reviews them; do not bulk-relabel or move them solely to make counts look clean.

### DGR-3 续：待分类目录逐文件分类（2026-08-14）

判定依据：内容性质 + 全仓库引用扫描 + 源码落点存在性 + 首次提交日期。落点/机制已不存在且有取代证据 → `historical`；落点或现行脚本仍在 → `reference`；两者皆无 → 保留 `pending-classification`（不猜测）。

**spec/（模型目录与偏好契约背景）**

| 文件 | Lifecycle | Role | 判定依据 |
|---|---|---|---|
| [spec/README.md](spec/README.md) | active | entry | 目录入口 |
| [spec/db-rebuild-strategy-dev.md](spec/db-rebuild-strategy-dev.md) | historical | implementation-note | 开发态重建策略；`SV_DB_REBUILD_ON_SCHEMA_MISMATCH` 已无引用，被 epoch-2 `SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH`（electron/epoch2MainEntry.ts）取代 |
| [spec/model-catalog-category-cache.md](spec/model-catalog-category-cache.md) | pending-classification | spec | 2026-02 阶段 2.8 设计；无引用、无落点声明、无取代证据 |
| [spec/model-catalog-endpoints-cache-contract.md](spec/model-catalog-endpoints-cache-contract.md) | reference | spec | endpoints 详情功能现行（src/next/modelCatalog/modelEndpointDetailService.ts + test:model-picker:smoke） |
| [spec/model-catalog-internal-schema.md](spec/model-catalog-internal-schema.md) | reference | spec | 落点 src/shared/modelCatalog/internalSchema.ts 存在 |
| [spec/model-catalog-model-fields-plan.md](spec/model-catalog-model-fields-plan.md) | historical | implementation-note | 阶段 4 冻结计划；DDL 落点 infra/db/schema.sql 已不存在 |
| [spec/model-catalog-query-contract.md](spec/model-catalog-query-contract.md) | historical | spec | 2026-02 阶段 4 SQL/FTS5 查询契约设计；当前实现为 Generation V2 快照 + 内存过滤（以 catalogQueryService.ts 类型为准），2026-08-14 审阅后降级 |
| [spec/model-catalog-schema.md](spec/model-catalog-schema.md) | historical | spec | DDL 落点 infra/db/schema.sql 已不存在（epoch-2 v2/*.sql 取代） |
| [spec/model-catalog-sync-runner.md](spec/model-catalog-sync-runner.md) | pending-classification | spec | 落点 catalogSyncRunner.ts 不存在（src/shared 与 electron/modelCatalog 均无）且无取代证据 |
| [spec/model-endpoint-cache.md](spec/model-endpoint-cache.md) | archived | implementation-note | 自述 Deprecated alias，指向 endpoints-cache-contract |
| [spec/model-preferences-contract.md](spec/model-preferences-contract.md) | reference | spec | 偏好功能现行（src/next/modelPrefs/modelPrefsService.ts、infra/db/repo/modelPreferencesRepo.ts） |
| [spec/model-preferences-schema.md](spec/model-preferences-schema.md) | historical | spec | DDL 落点 infra/db/schema.sql 已不存在 |
| [spec/model-preferences-scope.md](spec/model-preferences-scope.md) | historical | implementation-note | 2026-02 任务卡 3.0 设计（单表方案未采纳、旧路径引用）；scope/key 语义部分仍被 preferences-contract 引用 |
| [spec/model-selector-stage4-gap-matrix.md](spec/model-selector-stage4-gap-matrix.md) | historical | implementation-note | 阶段 4 差距矩阵（任务过程产物） |
| [spec/model-selector-ui.md](spec/model-selector-ui.md) | reference | implementation-note | 描述的 ChatAppComposer/ChatLayout 结构现行；ModelPickerDialog 已实现 |
| [spec/model-tagging-rules.md](spec/model-tagging-rules.md) | reference | spec | 落点 src/shared/modelCatalog/modelTagger.ts 存在 |
| [spec/openrouter-catalog-field-dictionary.md](spec/openrouter-catalog-field-dictionary.md) | reference | spec | 字段字典；openRouterCatalogClient.ts 存在 |
| [spec/openrouter-image-generation-task0-contract.md](spec/openrouter-image-generation-task0-contract.md) | historical | spec | 自述"实现索引与摘要"；图片生成已实现（openRouterImage*Repo；2026-07-14 live-qualified） |

**refactor/（OpenRouter SSOT v2 重构记录，2025-12）**

| 文件 | Lifecycle | Role | 判定依据 |
|---|---|---|---|
| [refactor/README.md](refactor/README.md) | active | entry | 目录入口 |
| [refactor/plan.md](refactor/plan.md) | historical | implementation-note | Gate 0-5 任务树计划；已执行完毕（CLEANUP_COMPLETION_REPORT 验收） |
| [refactor/CLEANUP_COMPLETION_REPORT.md](refactor/CLEANUP_COMPLETION_REPORT.md) | historical | closeout | SSOT v2 重构验收报告（2025-12-13） |
| [refactor/compliance-checklist.md](refactor/compliance-checklist.md) | historical | implementation-note | 已勾选完成的 SSOT 审查清单（过程产物） |
| [refactor/gate-0-2-quickcheck.md](refactor/gate-0-2-quickcheck.md) | reference | implementation-note | 描述的 scripts/gates/tc00-tc02.mjs 仍存在，运行说明有效 |
| [refactor/HANDOFF_PHASE3_UI_APP.md](refactor/HANDOFF_PHASE3_UI_APP.md) | historical | closeout | phase3/ui-app 分支交接记录（2026-01-24） |
| [refactor/observability.md](refactor/observability.md) | historical | implementation-note | 重构期日志字段建议（过程产物） |
| [refactor/risk-log.md](refactor/risk-log.md) | historical | implementation-note | 风险日志（全部已缓解） |
| [refactor/tc03-quickcheck.md](refactor/tc03-quickcheck.md) | reference | implementation-note | 描述 src/next/openrouter/buildRequest.ts 与 debug-echo-dryrun.mjs 均存在 |
| [refactor/tc12-deletion-checklist.md](refactor/tc12-deletion-checklist.md) | historical | implementation-note | 已执行删除清单记录 |
| [refactor/ui-legacy-inventory.md](refactor/ui-legacy-inventory.md) | historical | implementation-note | 基于 legacy snapshot f779128 的盘点；自述 HEAD 已无 legacy UI |

**ui-refactoring/（UI 组件重构过程记录，2025-11~12；2026-06 完成）**

| 文件 | Lifecycle | Role |
|---|---|---|
| [ui-refactoring/README.md](ui-refactoring/README.md) | historical | entry |
| [ui-refactoring/B_COMPLETION_REPORT.md](ui-refactoring/B_COMPLETION_REPORT.md) | historical | closeout |
| [ui-refactoring/B_REFACTOR_BASELINE.md](ui-refactoring/B_REFACTOR_BASELINE.md) | historical | implementation-note |
| [ui-refactoring/CHATVIEW_REFACTOR_PLAN.md](ui-refactoring/CHATVIEW_REFACTOR_PLAN.md) | historical | implementation-note |
| [ui-refactoring/CLEANUP_SUMMARY.md](ui-refactoring/CLEANUP_SUMMARY.md) | historical | closeout |
| [ui-refactoring/CONVERSATIONLIST_REFACTOR_CHECKLIST.md](ui-refactoring/CONVERSATIONLIST_REFACTOR_CHECKLIST.md) | historical | implementation-note |
| [ui-refactoring/PLAN_1.3_USECONVERSATIONSEARCH.md](ui-refactoring/PLAN_1.3_USECONVERSATIONSEARCH.md) | historical | implementation-note |
| [ui-refactoring/PLAN_2_PROJECTMANAGER.md](ui-refactoring/PLAN_2_PROJECTMANAGER.md) | historical | implementation-note |
| [ui-refactoring/REFACTOR_PROGRESS.md](ui-refactoring/REFACTOR_PROGRESS.md) | historical | implementation-note |
| [ui-refactoring/REFACTOR_TODO_OVERVIEW.md](ui-refactoring/REFACTOR_TODO_OVERVIEW.md) | historical | implementation-note |

**i18n/（本地化；门禁脚本现行）**

| 文件 | Lifecycle | Role | 判定依据 |
|---|---|---|---|
| [i18n/README.md](i18n/README.md) | active | entry | 目录入口；i18n:check / i18n:scan-hardcoded 脚本存在 |
| [i18n/00-i18n-integration-survey.md](i18n/00-i18n-integration-survey.md) | historical | implementation-note | 只读勘察报告（task pack 0 过程记录） |
| [i18n/01-key-lookup-rules.md](i18n/01-key-lookup-rules.md) | reference | implementation-note | 自称 canonical；t() 实现（src/shared/i18n）现行 |
| [i18n/02-i18n-coverage-and-hardcoded-scan.md](i18n/02-i18n-coverage-and-hardcoded-scan.md) | reference | implementation-note | 描述的 i18n:check / i18n:scan-hardcoded 脚本存在 |
| [i18n/03-i18n-final-closeout.md](i18n/03-i18n-final-closeout.md) | historical | closeout | 收尾记录 |

**notes/（模型目录验证记录）**

| 文件 | Lifecycle | Role | 判定依据 |
|---|---|---|---|
| [notes/README.md](notes/README.md) | active | entry | 目录入口 |
| [notes/model-catalog-codebase-map.md](notes/model-catalog-codebase-map.md) | historical | implementation-note | 2026-02 侦察快照；引用路径大量已删除（schema.sql、src/next/live/） |
| [notes/model-catalog-smoke-test.md](notes/model-catalog-smoke-test.md) | reference | implementation-note | test:model-catalog:smoke 脚本仍存在 |
| [notes/model-catalog-validation-baseline.md](notes/model-catalog-validation-baseline.md) | historical | implementation-note | 前提"全仓 tsc 存在历史错误"已不成立（vue-tsc 全仓通过），基线理由过时 |
| [notes/model-picker-smoke.md](notes/model-picker-smoke.md) | reference | implementation-note | test:model-picker:smoke 脚本仍存在；被 model-preferences-contract 引用 |

**requirements/（需求与任务卡）**

| 文件 | Lifecycle | Role | 判定依据 |
|---|---|---|---|
| [requirements/README.md](requirements/README.md) | active | entry | 目录入口 |
| [requirements/OPENROUTER_IMAGE_GENERATION_TASK_CARDS.md](requirements/OPENROUTER_IMAGE_GENERATION_TASK_CARDS.md) | historical | implementation-note | 任务卡已执行：OpenRouter Images 已实现（openRouterImage*Repo 存在；2026-07-14 live-qualified） |
| [requirements/PROJECT_HOME_AS_TAB_ENHANCEMENT.md](requirements/PROJECT_HOME_AS_TAB_ENHANCEMENT.md) | planned | roadmap | 自述"待实现（Phase 4）"；src/ui-app 无 projectHome 实现痕迹 |
| [requirements/USAGE_STATISTICS_IMPLEMENTATION_PLAN.md](requirements/USAGE_STATISTICS_IMPLEMENTATION_PLAN.md) | historical | implementation-note | 计划缺失项已补齐（infra/db/repo/usageRepo.ts 存在） |

**rfc/（提案记录）**

| 文件 | Lifecycle | Role | 判定依据 |
|---|---|---|---|
| [rfc/README.md](rfc/README.md) | active | entry | 目录入口 |
| [rfc/model-selector.md](rfc/model-selector.md) | historical | decision | RFC Draft（2026-02-17）未批准；主题已实现（ModelPickerDialog、spec/model-selector-ui 阶段 2+） |

**diagnostics/（诊断调查记录）**

| 文件 | Lifecycle | Role | 判定依据 |
|---|---|---|---|
| [diagnostics/README.md](diagnostics/README.md) | active | entry | 目录入口 |
| [diagnostics/openai-responses-reasoning-summary-investigation.md](diagnostics/openai-responses-reasoning-summary-investigation.md) | historical | debug-record | 调查报告（2026-07-08，investigation only 快照） |
| [diagnostics/openai-responses-reasoning-effort-probe/latest/report.md](diagnostics/openai-responses-reasoning-effort-probe/latest/report.md) | historical | debug-record | 机器生成的 probe 报告（2026-07-07 快照） |

> `diagnostics/openai-responses-reasoning-effort-probe/latest/results.json` 为非 Markdown 数据文件，计入目录计数但不参与生命周期分类。

保留 `pending-classification`：`spec/model-catalog-category-cache.md`、`spec/model-catalog-sync-runner.md`（无引用、无现行落点、无取代证据，待 owner 或后续实现确认）。

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

### DGR-3 续（2026-08-14）

- 完成 `spec/`、`refactor/`、`ui-refactoring/`、`i18n/`、`notes/`、`requirements/`、`diagnostics/`、`rfc/` 共 8 个 pending 目录的逐文件分类（58 行清单 = 50 个内容文件 + 8 个目录 README）：historical 35、reference 12、active 7（目录 README）、planned 1、archived 1、pending-classification 2；i18n/README 由 pending 改 active，ui-refactoring/README 由 active 改 historical。
- 判定依据：内容性质 + 全仓库引用扫描 + 源码落点存在性 + 首次提交日期；未确定项不猜测。非 md 文件（`diagnostics/latest/results.json`）计入目录计数但不参与生命周期分类。
- 审阅复核调整：`model-catalog-query-contract` 与 `model-preferences-scope` 正文机制/方案已过时（SQL/FTS5 查询、单表统一建模未采纳、旧 epoch 路径），由 reference 降为 historical（上述 35/12 已含此调整）。

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

# 文档分类与移动方案

> **目的**: 将 90+ 个现有文档重组为四象限分类体系  
> **原则**: 避免僵尸文档，保持实用性，优先归档过时文档

---

## 📊 分类规则

### 1️⃣ 产品与规划 (requirements/)
**标准**: 描述"做什么"，包含需求、功能规格、路线图

### 2️⃣ 工程与技术
#### 架构设计 (architecture/)
**标准**: 系统设计、模块关系、数据流

#### 架构决策 (decisions/)
**标准**: ADR 格式，记录"为什么这样设计"

#### API 文档 (api/)
**标准**: 接口定义、参数说明、调用示例

### 3️⃣ 运维与交付 (guides/)
**标准**: 操作指南、部署手册、故障排查

### 4️⃣ 知识与协作 (guides/)
**标准**: 编码规范、最佳实践、团队流程

### 🗄️ 历史归档 (archive/)
**标准**: 已完成的重构记录、过时的实现细节、历史问题分析

---

## 📋 文档分类映射表

### ✅ 核心架构文档 → architecture/

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `ARCHITECTURE_REVIEW.md` | `architecture/overview.md` | 架构总览，核心文档 |
| `BRANCH_TREE_IMPLEMENTATION.md` | `architecture/branch-system.md` | 分支系统设计 |
| `OPENROUTER_INTEGRATION_SUMMARY.md` | `architecture/ai-providers.md` | AI 提供商架构 |
| `WEB_WORKER_IMPLEMENTATION.md` | `architecture/database.md` | 数据库 Worker 设计 |
| `UNIFIED_GENERATION_ARCHITECTURE.md` | `architecture/generation-config.md` | 生成配置架构 |
| `MULTITHREADING_MANAGEMENT.md` | `architecture/performance.md` | 多线程架构 |

### 🎯 架构决策记录 → decisions/

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| 待创建 | `decisions/001-why-electron.md` | 技术选型决策 |
| 待创建 | `decisions/002-why-vue3.md` | 框架选择决策 |
| 待创建 | `decisions/003-sqlite-worker.md` | 数据库架构决策 |
| `TAILWIND_V4_MIGRATION.md` | `decisions/004-tailwind-v4.md` | CSS 框架升级决策 |
| `OPENROUTER_INTEGRATION_SUMMARY.md` (部分) | `decisions/005-multi-provider.md` | 多提供商策略决策 |

### 📖 操作指南 → guides/

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| 待创建（从 README.md 提取） | `guides/development-setup.md` | 开发环境配置 |
| 待创建（从 README.md 提取） | `guides/deployment.md` | 部署与构建 |
| `DATA_CLEANUP_GUIDE.md` | `guides/data-cleanup.md` | 数据清理指南 |
| `QUICK_CLEANUP_GUIDE.md` | `guides/data-cleanup.md` (合并) | 快速清理（合并到上面） |
| `REFACTOR_TEST_GUIDE.md` | `guides/testing.md` | 测试指南 |
| `BRANCH_DELETE_TEST_GUIDE.md` | `guides/testing.md` (合并) | 测试用例（合并） |
| 待创建 | `guides/troubleshooting.md` | 故障排查 |
| 待创建（从 copilot-instructions.md 提取） | `guides/coding-standards.md` | 编码规范 |
| 待创建 | `guides/git-workflow.md` | Git 工作流 |
| 待创建 | `guides/onboarding.md` | 新人入职 |
| `PERFORMANCE_OPTIMIZATION_COMPLETE.md` | `guides/performance-optimization.md` | 性能优化实践 |

### 🔌 API 文档 → api/

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| 待创建 | `api/electron-bridge.md` | IPC 接口文档 |
| 待创建 | `api/store-api.md` | Pinia Store API |
| 待创建 | `api/ai-service-api.md` | AI 服务接口 |
| 待创建 | `api/database-api.md` | 数据库操作接口 |

### 📋 需求与规划 → requirements/

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| 待创建 | `requirements/roadmap.md` | 产品路线图 |
| 待创建 | `requirements/features/branch-chat.md` | 分支对话功能规格 |
| 待创建 | `requirements/features/multi-provider.md` | 多提供商功能规格 |
| 待创建 | `requirements/features/search-system.md` | 搜索功能规格 |

### 🗄️ 历史归档 → archive/

#### 重构记录 (archive/refactoring/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `REFACTOR_PROGRESS.md` | `archive/refactoring/progress.md` | 重构进度记录 |
| `PHASE_0_INFRASTRUCTURE_COMPLETE.md` | `archive/refactoring/phase-0.md` | Phase 0 完成记录 |
| `PHASE_1_BUTTON_REFACTOR_COMPLETE.md` | `archive/refactoring/phase-1.md` | Phase 1 完成记录 |
| `REFACTOR_SUMMARY_PHASE2.md` | `archive/refactoring/phase-2.md` | Phase 2 总结 |
| `PHASE2_INTEGRATION_STATUS.md` | `archive/refactoring/phase-2.md` (合并) | Phase 2 状态 |
| `REFACTOR_SUMMARY_PHASE3.md` | `archive/refactoring/phase-3.md` | Phase 3 总结 |
| `PHASE_3_COMPLETE_SUMMARY.md` | `archive/refactoring/phase-3.md` (合并) | Phase 3 完成 |
| `PHASE_3_SUMMARY.md` | `archive/refactoring/phase-3.md` (合并) | Phase 3 总结 |
| `PHASE3.4_INTEGRATION_STRATEGY.md` | `archive/refactoring/phase-3-4.md` | Phase 3.4 策略 |
| `PHASE3.4_STORE_INTEGRATION_STATUS.md` | `archive/refactoring/phase-3-4.md` (合并) | Phase 3.4 状态 |

#### 迁移指南 (archive/migrations/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `PHASE_3_MIGRATION_GUIDE.md` | `archive/migrations/generation-config-migration.md` | 配置迁移指南 |
| `GENERATION_MIGRATION_GUIDE.md` | `archive/migrations/generation-config-migration.md` (合并) | 生成配置迁移 |
| `REASONING_UI_MIGRATION_GUIDE.md` | `archive/migrations/reasoning-ui-migration.md` | 推理 UI 迁移 |
| `TAILWIND_V4_CSS_FIRST_MIGRATION.md` | `archive/migrations/tailwind-v4-migration.md` | Tailwind 迁移 |

#### 特性实现记录 (archive/completed-features/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `BRANCH_CHAT_SYSTEM_COMPLETE.md` | `archive/completed-features/branch-chat.md` | 分支系统完成 |
| `BRANCH_TREE_REFACTOR_COMPLETE.md` | `archive/completed-features/branch-chat.md` (合并) | 分支重构完成 |
| `SCROLL_SYSTEM_REFACTOR_COMPLETE.md` | `archive/completed-features/scroll-system.md` | 滚动系统完成 |
| `CHAT_TOOLBAR_REFACTOR.md` | `archive/completed-features/chat-toolbar.md` | 工具栏重构 |
| `CHAT_TOOLBAR_REDESIGN.md` | `archive/completed-features/chat-toolbar.md` (合并) | 工具栏重设计 |
| `REASONING_IMPLEMENTATION_SUMMARY.md` | `archive/completed-features/reasoning.md` | 推理功能实现 |
| `SAMPLING_PARAMETERS_FEATURE.md` | `archive/completed-features/sampling-params.md` | 采样参数功能 |
| `USAGE_STATISTICS_PHASE2_COMPLETE.md` | `archive/completed-features/usage-statistics.md` | 使用统计功能 |
| `ANALYTICS_UI_ENHANCEMENT.md` | `archive/completed-features/analytics-ui.md` | 分析界面增强 |
| `PROJECT_HOME_AS_TAB_ENHANCEMENT.md` | `archive/completed-features/project-home.md` | 项目首页增强 |

#### 问题分析与修复 (archive/issues/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `CHAT_SWITCHING_LAG_ANALYSIS.md` | `archive/issues/chat-switching-lag.md` | 切换卡顿分析 |
| `CHAT_SWITCHING_RECOMPUTATION_ANALYSIS.md` | `archive/issues/chat-switching-lag.md` (合并) | 重计算分析 |
| `CHAT_SWITCHING_OPTIMIZATION_IMPLEMENTATION.md` | `archive/issues/chat-switching-lag.md` (合并) | 优化实现 |
| `DISPLAYMESSAGES_CACHE_ANALYSIS.md` | `archive/issues/display-messages-cache.md` | 缓存分析 |
| `DEBOUNCE_ANALYSIS.md` | `archive/issues/debounce.md` | 防抖分析 |
| `PROXY_ISSUE_DEEP_ANALYSIS.md` | `archive/issues/vue-proxy.md` | Vue Proxy 问题 |
| `VUE_PROXY_CLONE_FIX.md` | `archive/issues/vue-proxy.md` (合并) | Proxy 克隆修复 |
| `FIX_STRUCTURED_CLONE_ERROR.md` | `archive/issues/vue-proxy.md` (合并) | 结构化克隆错误 |
| `CLONE_ERROR_ANALYSIS.md` | `archive/issues/clone-error.md` | 克隆错误分析 |
| `CLONE_ERROR_FIX.md` | `archive/issues/clone-error.md` (合并) | 克隆错误修复 |
| `BRANCH_DELETE_FIX.md` | `archive/issues/branch-delete.md` | 分支删除修复 |
| `CHAT_CONTENT_DISAPPEAR_FIX.md` | `archive/issues/chat-content-disappear.md` | 内容消失修复 |
| `FAVORITE_MODEL_SELECTOR_FIX.md` | `archive/issues/favorite-model.md` | 模型选择器修复 |
| `FOCUS_ISSUE_REPORT.md` | `archive/issues/focus-issue.md` | 焦点问题 |
| `PATH_FIX.md` | `archive/issues/path-fix.md` | 路径修复 |
| `SUBMENU_TELEPORT_FIX.md` | `archive/issues/submenu-teleport.md` | 子菜单传送修复 |
| `WORKER_BUILD_ISSUE.md` | `archive/issues/worker-build.md` | Worker 构建问题 |
| `ISSUE_2_PARAMETER_PERSISTENCE_FIX.md` | `archive/issues/parameter-persistence.md` | 参数持久化修复 |
| `ERROR_DISPLAY_IMPLEMENTATION.md` | `archive/issues/error-display.md` | 错误显示实现 |
| `SEND_BUTTON_STATE_OPTIMIZATION.md` | `archive/issues/send-button-state.md` | 发送按钮状态 |

#### 优化记录 (archive/optimizations/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `PERFORMANCE_OPTIMIZATION_IMPLEMENTATION.md` | `archive/optimizations/performance-impl.md` | 性能优化实现 |
| `PERFORMANCE_OPTIMIZATION_OPPORTUNITIES.md` | `archive/optimizations/performance-opportunities.md` | 优化机会 |
| `ADDITIONAL_OPTIMIZATION_SUGGESTIONS.md` | `archive/optimizations/additional-suggestions.md` | 额外建议 |
| `SAVE_OPTIMIZATION_GUIDE.md` | `archive/optimizations/save-optimization.md` | 保存优化 |
| `SAVE_OPTIMIZATION_SUMMARY.md` | `archive/optimizations/save-optimization.md` (合并) | 保存优化总结 |
| `BATCH_OPS_AND_CACHE_OPTIMIZATION.md` | `archive/optimizations/batch-and-cache.md` | 批量与缓存优化 |
| `INCREMENTAL_SERIALIZATION_GUIDE.md` | `archive/optimizations/incremental-serialization.md` | 增量序列化 |
| `CHUNKED_SAVE_IMPLEMENTATION.md` | `archive/optimizations/chunked-save.md` | 分块保存 |
| `TAB_SWITCHING_PERSISTENCE_OPTIMIZATION.md` | `archive/optimizations/tab-switching.md` | 标签切换优化 |
| `BUTTON_INTERACTION_OPTIMIZATION.md` | `archive/optimizations/button-interaction.md` | 按钮交互优化 |
| `LONG_CONVERSATION_PERFORMANCE.md` | `archive/optimizations/long-conversation.md` | 长对话性能 |
| `PASTE_PERFORMANCE_ANALYSIS.md` | `archive/optimizations/paste-performance.md` | 粘贴性能分析 |
| `MODEL_PARAMETERS_OPTIMIZATION.md` | `archive/optimizations/model-parameters.md` | 模型参数优化 |

#### UI 实现记录 (archive/ui-implementations/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `CHATVIEW_REFACTOR_PLAN.md` | `archive/ui-implementations/chatview-refactor.md` | ChatView 重构计划 |
| `CHATVIEW_ISSUES_ANALYSIS.md` | `archive/ui-implementations/chatview-refactor.md` (合并) | 问题分析 |
| `CHATVIEW_OPTIMIZATION_SUMMARY.md` | `archive/ui-implementations/chatview-refactor.md` (合并) | 优化总结 |
| `CHATVIEW_COMMENTS_IMPROVEMENT.md` | `archive/ui-implementations/chatview-comments.md` | 注释改进 |
| `CHATVIEW_COMMENTS_PROGRESS.md` | `archive/ui-implementations/chatview-comments.md` (合并) | 注释进度 |
| `CONVERSATIONLIST_REFACTOR_CHECKLIST.md` | `archive/ui-implementations/conversation-list-refactor.md` | 对话列表重构 |
| `UI_COMPONENT_REFACTOR_PHASE1_DIAGNOSIS.md` | `archive/ui-implementations/component-refactor-phase1.md` | 组件重构 Phase 1 |
| `UI_COMPONENT_REFACTOR_PHASE2_API_DESIGN.md` | `archive/ui-implementations/component-refactor-phase2.md` | 组件重构 Phase 2 |
| `UI_COMPONENT_REFACTOR_PHASE3_IMPLEMENTATION_PLAN.md` | `archive/ui-implementations/component-refactor-phase3.md` | 组件重构 Phase 3 |
| `UI_COMPONENT_REFACTOR_PHASE4_TDD_PREPARATION.md` | `archive/ui-implementations/component-refactor-phase4.md` | 组件重构 Phase 4 |
| `UI_REFACTOR_PAUSED_STATE.md` | `archive/ui-implementations/refactor-paused.md` | 重构暂停状态 |
| `UI_REFACTOR_STRATEGY_ADJUSTED.md` | `archive/ui-implementations/refactor-strategy.md` | 重构策略调整 |
| `ADVANCED_MODEL_PICKER_IMPLEMENTATION.md` | `archive/ui-implementations/advanced-model-picker.md` | 高级模型选择器 |
| `BELT_SCROLL_IMPLEMENTATION.md` | `archive/ui-implementations/belt-scroll.md` | 带状滚动实现 |
| `SCROLLBAR_AUTO_HIDE_IMPLEMENTATION.md` | `archive/ui-implementations/scrollbar-auto-hide.md` | 滚动条自动隐藏 |
| `BOUNDARY_DEFENSE_IMPLEMENTATION.md` | `archive/ui-implementations/boundary-defense.md` | 边界防御实现 |
| `SYSTEM_IMAGE_OPENER.md` | `archive/ui-implementations/system-image-opener.md` | 系统图片打开器 |

#### Tailwind 文档 (archive/tailwind/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `TAILWIND_V4_README.md` | 保留或移至 `decisions/004-tailwind-v4.md` 附录 | Tailwind 索引 |
| `TAILWIND_V4_QUICK_REFERENCE.md` | 保留在根目录 docs/ | 快速参考 |
| `TAILWIND_V4_SUMMARY.md` | `archive/tailwind/summary.md` | 迁移总结 |
| `TAILWIND_V4_VERIFICATION.md` | `archive/tailwind/verification.md` | 验证报告 |
| `TAILWIND_V4_AI_PROMPT.md` | 保留在根目录 docs/ | AI 提示模板 |

#### 测试与验证 (archive/testing/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `QUANTILE_SLIDER_TEST_GUIDE.md` | `archive/testing/quantile-slider.md` | 分位数滑块测试 |
| `TEST_2.2_REASONING_CONTROL.md` | `archive/testing/reasoning-control.md` | 推理控制测试 |
| `REASONING_TESTING_STRATEGY.md` | `archive/testing/reasoning-strategy.md` | 推理测试策略 |

#### 数据库相关 (archive/database/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `SQLITE_ENHANCEMENT_IMPLEMENTATION.md` | `archive/database/sqlite-enhancement.md` | SQLite 增强实现 |
| `SQLITE_FTS5_MIGRATION_PLAN.md` | `archive/database/fts5-migration.md` | FTS5 迁移计划 |
| `SEARCH_FTS5_IMPROVEMENT.md` | `archive/database/fts5-improvement.md` | FTS5 改进 |
| `STORAGE_VERIFICATION_REPORT.md` | `archive/database/storage-verification.md` | 存储验证报告 |
| `OLD_STORAGE_REMOVAL_COMPLETE.md` | `archive/database/old-storage-removal.md` | 旧存储移除 |

#### 其他分类 (archive/misc/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `GENERATION_ARCHITECTURE_INDEX.md` | `archive/misc/generation-architecture-index.md` | 生成架构索引 |
| `GENERATION_ARCHITECTURE_SUMMARY.md` | `architecture/generation-config.md` (合并到核心架构) | 生成架构总结 |
| `PHASE_3_UI_CONFIG_INTEGRATION.md` | `archive/misc/phase3-ui-config.md` | Phase 3 UI 集成 |
| `USAGE_STATISTICS_IMPLEMENTATION_PLAN.md` | `archive/misc/usage-stats-plan.md` | 使用统计计划 |
| `REASONING_PERSISTENCE_ANALYTICS.md` | `archive/misc/reasoning-persistence.md` | 推理持久化分析 |
| `SAMPLING_PARAMETERS_NONLINEAR_MAPPING.md` | `archive/misc/sampling-nonlinear.md` | 采样非线性映射 |
| `ARCHIVED_COMPONENTS.md` | `archive/misc/archived-components.md` | 已归档组件 |
| `CLEANUP_SUMMARY.md` | `archive/misc/cleanup-summary.md` | 清理总结 |
| `CODE_CLEANUP_REPORT.md` | `archive/misc/code-cleanup.md` | 代码清理报告 |
| `ALL_FIXES_COMPLETE.md` | `archive/misc/all-fixes-complete.md` | 所有修复完成 |
| `PRIORITY_FIXES_SUMMARY.md` | `archive/misc/priority-fixes.md` | 优先修复总结 |
| `RECENT_FIXES_2025_11.md` | `archive/misc/recent-fixes-2025-11.md` | 2025年11月修复 |
| `RECENT_UPDATES_2025_01.md` | `archive/misc/recent-updates-2025-01.md` | 2025年1月更新 |
| `ANALYTICS_UI_CHANGELOG.md` | `archive/misc/analytics-changelog.md` | 分析 UI 变更日志 |
| `ANALYTICS_UI_QUICK_REF.md` | `archive/misc/analytics-quick-ref.md` | 分析 UI 快速参考 |
| `ANALYTICS_UI_VISUAL_EXAMPLES.html` | `archive/misc/analytics-visual.html` | 分析 UI 视觉示例 |
| `CHAT_TOOLBAR_VISUAL_PREVIEW.md` | `archive/misc/chat-toolbar-visual.md` | 工具栏视觉预览 |
| `PROJECT_MANAGEMENT_FIXES.md` | `archive/misc/project-management-fixes.md` | 项目管理修复 |
| `DOM_CLEANUP_VERIFICATION.md` | `archive/misc/dom-cleanup.md` | DOM 清理验证 |
| `DEBUG_LOGGING_ADDED.md` | `archive/misc/debug-logging.md` | 调试日志添加 |
| `DEBUG_MODEL_LIST.md` | `archive/misc/debug-model-list.md` | 调试模型列表 |
| `DEBUG_REASONING_DISPLAY_INVESTIGATION.md` | `archive/misc/debug-reasoning-display.md` | 调试推理显示 |
| `DEBUG_USAGE_RAW.md` | `archive/misc/debug-usage-raw.md` | 调试使用原始数据 |
| `DOCUMENTATION_AUDIT_REPORT.md` | `archive/misc/doc-audit.md` | 文档审计报告 |
| `REFACTOR_TODO_OVERVIEW.md` | `archive/misc/refactor-todo.md` | 重构待办概览 |
| `STORYBOOK_PHASE2_COMPLETE.md` | `archive/misc/storybook-phase2.md` | Storybook Phase 2 |
| `TODO_1.3_USECONVERSATIONSEARCH_PLAN.md` | `archive/misc/todo-conversation-search.md` | 对话搜索计划 |
| `TODO_2_PROJECTMANAGER_PLAN.md` | `archive/misc/todo-project-manager.md` | 项目管理器计划 |

#### 测试脚本 (archive/scripts/)

| 原文件 | 新位置 | 理由 |
|--------|--------|------|
| `paste-performance-test.js` | `archive/scripts/paste-performance-test.js` | 粘贴性能测试脚本 |
| `save-optimization-test.js` | `archive/scripts/save-optimization-test.js` | 保存优化测试脚本 |

---

## 🚀 执行计划

### Phase 1: 创建核心文档（优先级 P0）
- [x] 创建 `docs/INDEX.md` 导航中心
- [x] 创建 `CHANGELOG.md` 版本历史
- [x] 创建 `.env.example` 环境变量模板
- [ ] 创建 `architecture/overview.md` 架构总览
- [ ] 创建 `guides/development-setup.md` 开发指南
- [ ] 创建 `guides/deployment.md` 部署指南
- [ ] 创建 `guides/troubleshooting.md` 故障排查
- [ ] 创建 ADR 模板和索引

### Phase 2: 归档历史文档（优先级 P1）
- [ ] 批量移动重构记录到 `archive/refactoring/`
- [ ] 批量移动问题修复到 `archive/issues/`
- [ ] 批量移动优化记录到 `archive/optimizations/`
- [ ] 批量移动 UI 实现到 `archive/ui-implementations/`

### Phase 3: 整合核心架构文档（优先级 P0）
- [ ] 整合架构文档到 `architecture/`
- [ ] 创建 ADR 文档到 `decisions/`
- [ ] 提取 API 文档到 `api/`

### Phase 4: 精简 README.md（优先级 P0）
- [ ] 保留 Quick Start 和核心功能介绍
- [ ] 移除详细技术细节到对应分类文档
- [ ] 添加文档导航链接

---

## 📊 预期效果

**重组前**:
- 90+ 个文档平铺在 `docs/` 目录
- 无法快速找到需要的文档
- 大量过时文档混杂在活跃文档中

**重组后**:
- 4 个核心分类目录 + 1 个归档目录
- 通过 `INDEX.md` 快速导航
- 历史文档清晰归档，不影响日常使用
- 新人可在 5 分钟内找到所需文档

---

**创建时间**: 2025年12月3日  
**维护者**: @GuXinghai

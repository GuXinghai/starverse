# Changelog

All notable changes to the Starverse project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - 2025-12-11

### ✨ Added
- **🆕 使用统计分析系统（Usage Statistics）**
  - 完整的 OpenRouter 使用数据追踪和可视化
  - 新增 `AnalyticsView.vue` 和 `UsageStatistics.vue` 组件
  - SQLite 数据库层新增 `usage` 和 `dashboard_prefs` 表
  - 支持按模型、时间范围分析成本和令牌使用
  - 提供使用趋势图表和统计卡片
  - 参考文档：`docs/USAGE_STATISTICS_IMPLEMENTATION_PLAN.md`, `docs/USAGE_STATISTICS_PHASE2_COMPLETE.md`

- **🆕 推理功能标准化（Reasoning）**
  - 完整支持 OpenRouter Reasoning API（4 个推理级别）
  - 新增 `openrouterReasoningAdapter.ts` 适配器
  - 推理级别：minimal, low, medium, high
  - 可视化推理过程显示（支持的模型）
  - 智能成本预估和延迟提示
  - 参考文档：`docs/REASONING_IMPLEMENTATION_SUMMARY.md`, `docs/REASONING_TIERS_4_LEVELS.md`

- **🆕 现代化聊天输入组件（ModernChatInput）**
  - 胶囊式浮动设计，类似 Perplexity/ChatGPT
  - 集成工具栏按钮（附件、搜索、推理、图像生成、参数）
  - 自适应多行输入（1-10 行自动扩展）
  - 智能发送按钮状态切换（发送/停止/撤回）
  - 完整的附件预览系统
  - 参考文档：`docs/MODERN_CHAT_INPUT_IMPLEMENTATION.md`, `src/components/chat/input/README.md`

- **🆕 统一生成参数架构（Unified Generation Architecture）**
  - 标准化所有 AI 参数处理（采样、推理、长度控制）
  - 新增 `generationAdapter.ts` 统一适配器
  - 模型能力自动检测系统（`modelCapability.ts`）
  - 4 层配置覆盖系统（默认值 → 全局 → 对话 → 消息级）
  - 参考文档：`docs/GENERATION_ARCHITECTURE_INDEX.md`, `docs/GENERATION_ARCHITECTURE_SUMMARY.md`

- **🆕 文档重组与归档系统**
  - 四象限文档分类体系（架构/特性/指南/决策）
  - 新增文档导航中心 `docs/INDEX.md`
  - 自动归档脚本 `scripts/archive-documents.ps1`
  - 90+ 个文档重新分类和组织
  - 过时文档归档到 `docs/archive/`

### 🔄 Changed
- **重大架构升级：Tailwind CSS v4**
  - 从 v3.4 升级到 v4.1.16
  - 采用 CSS 优先配置策略（`@theme` 指令）
  - 废弃 `tailwind.config.js` 的 theme 配置
  - 新增 `@tailwindcss/postcss` 引擎
  - 更新所有透明度语法（`bg-black/50` 替代 `bg-opacity-50`）
  - 参考文档：`docs/tailwind/TAILWIND_V4_MIGRATION_COMPLETE.md`

- **OpenRouter 服务完全重构**
  - 从 `.js` 迁移到 `.ts`（完整类型安全）
  - 分离逻辑到多个适配器（reasoning、generation、streaming）
  - 新增流式响应错误处理和重连机制
  - 统一 IPC 通信接口
  - 归档旧版本到 `archived-services/`

- **数据库 Schema 扩展**
  - 新增 `usage` 表（OpenRouter 使用统计）
  - 新增 `dashboard_prefs` 表（仪表板偏好设置）
  - 新增 `model_data` 表（模型能力缓存）
  - 更新 `conversations` 表（推理参数持久化）
  - 所有表支持 FTS5 全文搜索索引

- **Pinia Store 重组**
  - 新增 `analyticsStore`（使用统计状态）
  - 新增 `usageStore`（使用数据管理）
  - 新增 `dashboardPrefs`（仪表板配置）
  - 优化 `modelStore`（集成能力检测）
  - Store 总数增至 11 个模块

### 🐛 Fixed
- **[Critical] 修复消息发送幽灵任务 Bug**
  - 修复并发状态管理导致的"伪发送"问题（UI 显示气泡但无实际网络请求）
  - 实施 4 层防御机制：
    1. 入口幽灵任务检测与自动清理
    2. 上下文不匹配强制接管（不再静默失败）
    3. 60 秒超时自动重置机制
    4. finally 块强化状态清理
  - 新增 `forceResetSendingState()` 紧急恢复方法
  - 详细日志追踪（🚨 错误、⚠️ 警告、✅ 信息）
  - 参考文档：`docs/bugfix/FIX_GHOST_TASK_BUG.md`, `docs/bugfix/FIX_GHOST_TASK_COMPLETE.md`

- **修复模型数据字段不匹配问题**
  - 统一 `model_data` 和 `pricing` 字段命名
  - 修复 IPC 序列化错误
  - 优化采样参数导入逻辑
  - 参考文档：`docs/bugfix/BUGFIX_MODEL_DATA_FIELD_MISMATCH.md`

- **修复流式响应超时泄漏**
  - 修复定时器未正确清理导致的内存泄漏
  - 优化首个 Token 超时竞态条件
  - 参考文档：`docs/bugfix/BUGFIX_STREAM_IDLE_TIMEOUT_TIMER_LEAK.md`


### 📚 Documentation
- **文档重组完成**
  - 删除 60+ 个过时文档（已归档到 `docs/archive/`）
  - 新增 40+ 个分类文档（按架构/特性/指南/决策分类）
  - 新增导航中心 `docs/INDEX.md`
  - 新增 Tailwind v4 迁移指南
  - 新增 Config Governance 治理文档
  - 详细参考：`docs/DOCUMENT_CLEANUP_AUDIT.md`

- **新增技术文档**
  - `docs/HYBRID_SAFETY_IMPLEMENTATION.md` - 混合安全机制
  - `docs/IMAGE_GENERATION_DEBUG_GUIDE.md` - 图像生成调试指南
  - `docs/MODEL_PERSISTENCE_MIGRATION.md` - 模型持久化迁移
  - `docs/NAMING_CONVENTION.md` - 命名规范
  - `docs/SNAPSHOT_PATTERN_IMPLEMENTATION.md` - 快照模式实现

- **新增 Bug 修复文档**
  - 幽灵任务修复技术文档 (`docs/bugfix/FIX_GHOST_TASK_BUG.md`)
  - 修复完成报告 (`docs/bugfix/FIX_GHOST_TASK_COMPLETE.md`)
  - 更新诊断指南 (`docs/DEBUG_MESSAGE_SENDING_STALL.md`)
  - 流式超时泄漏修复 (`docs/bugfix/BUGFIX_STREAM_IDLE_TIMEOUT_TIMER_LEAK.md`)

### 🧪 Tests
- **新增测试套件**
  - 使用统计测试 (`tests/unit/analyticsStore.test.ts`, `tests/unit/usage-aggregation.test.ts`)
  - 幽灵任务测试 (`tests/unit/composables/useMessageSending.ghostTask.test.ts`)
  - OpenRouter 使用追踪测试 (`tests/unit/openrouter-usage.test.ts`)
  - 仪表板偏好测试 (`tests/unit/dashboard-prefs.test.ts`)
  - 图表卡片测试 (`tests/unit/chart-card.test.ts`)

### 🔧 Infrastructure
- **构建系统优化**
  - Worker 线程独立构建脚本 (`scripts/build-db-worker.cjs`)
  - Watch 模式支持开发环境热更新
  - esbuild 打包 Worker 避免模块加载问题

- **新增工具脚本**
  - `scripts/archive-documents.ps1` - 文档归档自动化
  - `scripts/verify-model-field-mapping.js` - 模型字段验证
  - `scripts/archive-completed-docs.ps1` - 完成文档归档

### 🎨 UI/UX Improvements
- **ChatToolbarButton 组件**
  - 统一工具栏按钮设计规范
  - 支持 Tooltip 提示
  - 响应式尺寸适配
  - Storybook 文档完善

- **消息渲染优化**
  - 推理过程可视化显示
  - 代码高亮增强
  - Markdown 渲染性能提升
  - 附件预览网格布局

### 🔐 Security
- **IPC 通信安全**
  - 优化 `ipcSanitizer` 清理逻辑
  - 新增类型定义文件 (`ipcSanitizer.d.ts`)
  - 请求守卫机制 (`requestGuard.ts`)

### ⚡ Performance
- **数据库性能优化**
  - Worker 线程隔离所有 SQLite 操作
  - 批量操作事务优化
  - FTS5 全文搜索索引优化
  - Repository 模式数据访问层

- **前端性能优化**
  - 计算属性缓存优化
  - 防抖节流策略
  - 虚拟滚动考虑（长对话场景）
  - Markdown 渲染缓存

---

## [Unreleased] (Old)

### Added
- 四象限文档分类体系，优化文档组织结构
- 文档导航中心 `docs/INDEX.md`
- 环境变量模板 `.env.example`

### Changed
- 文档目录重组：按产品规划、工程技术、运维交付、知识协作四个维度分类

---

## [0.0.0] - 2025-11-30

### Added
- **核心功能**
  - 分支化对话系统：完整树形对话历史，支持版本切换和并行探索
  - 多提供商 AI 集成：支持 Google Gemini 和 OpenRouter
  - SQLite FTS5 全文搜索：高性能本地搜索引擎
  - 多模态支持：图片上传、分析和生成
  - 项目管理系统：对话分类和组织
  
- **技术架构**
  - Electron 38.6.0 + Vue.js 3.4 + TypeScript 5.2
  - Tailwind CSS 4.1.16（CSS 优先配置策略）
  - Better-sqlite3 12.4 + Worker 线程架构
  - Pinia 3.0 模块化状态管理（7个职责清晰的 Store）
  
- **性能优化**
  - Worker 线程隔离数据库操作，避免 UI 阻塞
  - 持久化防抖机制，减少 75% IPC 通信
  - 分支树路径计算优化
  - Markdown 渲染缓存

- **开发工具**
  - Vitest 2.1 + @testing-library/vue 8.1 单元测试框架
  - Storybook 8.6 组件开发环境
  - ESLint + Prettier 代码质量控制

### Changed
- 从单一 Gemini 提供商扩展为多提供商架构（策略模式）
- 从 JSON 文件存储迁移到 SQLite 数据库
- Tailwind CSS 从 v3 升级到 v4（CSS `@theme` 配置）

### Fixed
- IPC 数据传输 Vue Proxy 序列化问题
- 分支删除时的数据一致性问题
- 长对话性能优化（虚拟滚动）
- XSS 防护（DOMPurify 集成）

### Security
- 启用 Electron contextIsolation 和 nodeIntegration: false
- IPC 白名单机制，限制渲染进程权限
- API Key 本地加密存储
- 用户生成内容 XSS 过滤

---

## 版本说明

### 版本号规则
- **主版本号 (Major)**: 不兼容的 API 变更
- **次版本号 (Minor)**: 向后兼容的功能新增
- **修订号 (Patch)**: 向后兼容的问题修复

### 变更类型
- **Added**: 新增功能
- **Changed**: 现有功能变更
- **Deprecated**: 即将废弃的功能
- **Removed**: 已移除的功能
- **Fixed**: Bug 修复
- **Security**: 安全性修复

---

## 贡献指南

提交变更时，请按照以下格式更新 `[Unreleased]` 部分：

```markdown
### Added
- 简短描述新功能 (#PR编号)

### Fixed
- 修复了某个问题的简短描述 (#Issue编号, #PR编号)
```

发布新版本时，将 `[Unreleased]` 内容移动到新版本号下，并添加发布日期。

---

[Unreleased]: https://github.com/GuXinghai/starverse/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/GuXinghai/starverse/releases/tag/v0.0.0

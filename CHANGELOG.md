# Changelog

All notable changes to the Starverse project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **🆕 现代化工具栏组件** (`ChatToolbar.vue`)
  - Plus Menu + Chips 交互模型（类似 Perplexity/OpenAI）
  - 紧凑型按钮设计：文件上传、绘画、推理、搜索、参数
  - 内联配置菜单：搜索深度（快速/普通/深入）、推理努力程度（低/中/高）
  - 一键比例切换（图像生成场景）
  - 智能禁用状态（根据模型能力自动调整）
  - Smart Parent, Dumb Child 架构（纯展示组件）
  
- **🆕 ConversationList 重构基础设施** (TODO 1.1-1.3 完成)
  - `useFormatters.ts`: 格式化工具函数集合（状态标签、徽章样式、模型名称）
  - `useMenuPositioning.ts`: 智能菜单定位算法（边界碰撞检测、8方向计算）
  - `useConversationSearch.ts`: 对话搜索逻辑封装（FTS5 全文搜索、防抖、竞态处理）
  
- **🆕 模型能力系统 Phase 2**
  - `modelStore`: 新增 `modelCapabilityMap`（存储 ModelGenerationCapability）
  - `setModelCapabilityMap()`: 批量设置能力映射表
  - `getModelCapability()`: 获取模型能力（带即时构建回退）
  - 能力注册到 `capabilityRegistry`（供适配器查询）
  - 统一生成参数架构（temperature、reasoning、web_search 等）
  
- **🆕 图像生成功能增强**
  - `cycleAspectRatio()`: 一键切换图片比例（1:1 → 16:9 → 9:16）
  - 与 ChatToolbar 集成，提供流畅的比例切换体验
  - 当前比例实时显示在工具栏

- 四象限文档分类体系，优化文档组织结构
- 文档导航中心 `docs/INDEX.md`
- 环境变量模板 `.env.example`

### Changed
- **重构**: ConversationList.vue 开始模块化重构（3 个 Composables 提取完成）
- **优化**: modelStore 支持即时能力构建（避免 UI/适配器缺少能力信息）
- **架构**: Pinia Store 数量从 7 个增至 8 个（模型能力系统独立管理）
- 文档目录重组：按产品规划、工程技术、运维交付、知识协作四个维度分类

### Fixed
- 修复模型能力查询缺失导致的 UI 功能禁用问题
- 修复搜索状态管理的竞态条件

### Documentation
- 新增 `docs/CHAT_TOOLBAR_REDESIGN.md`: ChatToolbar 设计文档
- 新增 `docs/TODO_1.3_USECONVERSATIONSEARCH_PLAN.md`: useConversationSearch 实施计划
- 新增 `docs/REFACTOR_TODO_OVERVIEW.md`: 重构任务总览
- 更新 `README.md`: 反映新增功能和架构变更
- 更新 `REFACTOR_PROGRESS.md`: 记录 TODO 1.1-1.3 完成进度

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

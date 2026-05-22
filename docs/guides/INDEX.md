# 📚 Starverse 文档导航中心

> **最后更新**: 2026年5月22日
> **文档体系版本**: 3.0.0
> **重大变更**: DGR-1 文档治理重构 — 双维度状态模型、DEBUG 归档、pending-classification 登记

---

## 🤖 编程 Agent 专用入口

**编程 Agent 请先读这两个文件，可减少重复扫描成本**:

| 文档 | 用途 |
|------|------|
| [../AGENT_INDEX.md](../AGENT_INDEX.md) | 首读：快速路由表、任务映射、护栏规则 (3 min) |
| [../DOC_STATUS_INDEX.md](../DOC_STATUS_INDEX.md) | 文档活跃度与优先级判断表 (2 min) |

---

## 🎯 快速导航

### 🚀 我想快速开始

| 场景 | 文档 | 用时 |
|------|------|------|
| 5分钟启动项目 | [README.md](../../README.md) | 5 min |
| 配置开发环境 | [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md) | 15 min |
| 了解项目架构 | [../architecture/OVERVIEW.md](../architecture/OVERVIEW.md) | 10 min |

### 📖 我想了解某个功能

| 功能 | 文档 |
|------|------|
| 分支化对话系统（历史实现） | [../archive/completed-features/BRANCH_CHAT_SYSTEM_COMPLETE.md](../archive/completed-features/BRANCH_CHAT_SYSTEM_COMPLETE.md) |
| 多提供商 AI 集成 | [../architecture/OPENROUTER_INTEGRATION_SUMMARY.md](../architecture/OPENROUTER_INTEGRATION_SUMMARY.md) |
| 生成配置架构 | [../architecture/UNIFIED_GENERATION_ARCHITECTURE.md](../architecture/UNIFIED_GENERATION_ARCHITECTURE.md) |
| Tailwind V4 升级 | [../tailwind/TAILWIND_V4_README.md](../tailwind/TAILWIND_V4_README.md) |

### 🔧 我想解决问题

| 问题 | 文档 |
|------|------|
| 数据清理指南 | [DATA_CLEANUP_GUIDE.md](DATA_CLEANUP_GUIDE.md) |
| 分支删除测试 | [BRANCH_DELETE_TEST_GUIDE.md](BRANCH_DELETE_TEST_GUIDE.md) |
| 推理系统测试 | [REASONING_TESTING_STRATEGY.md](REASONING_TESTING_STRATEGY.md) |

---

## 📂 文档目录结构

### 📐 architecture/ - 核心架构设计 (4 个文档)

系统架构、设计决策和技术方案。

| 文档 | 说明 |
|------|------|
| [OVERVIEW.md](../architecture/OVERVIEW.md) | 架构总览 - 理解项目结构的第一步 |
| [ARCHITECTURE_REVIEW.md](../architecture/ARCHITECTURE_REVIEW.md) | 架构审查报告 |
| [OPENROUTER_INTEGRATION_SUMMARY.md](../architecture/OPENROUTER_INTEGRATION_SUMMARY.md) | AI 多提供商集成架构 |
| [UNIFIED_GENERATION_ARCHITECTURE.md](../architecture/UNIFIED_GENERATION_ARCHITECTURE.md) | 统一生成配置架构 |

---

### 📘 guides/ - 开发指南 (9 个文档)

实现指南、迁移指南和测试策略。

| 类别 | 文档 |
|------|------|
| **开发环境** | [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md) |
| **数据管理** | [DATA_CLEANUP_GUIDE.md](DATA_CLEANUP_GUIDE.md) |
| **迁移指南** | [GENERATION_MIGRATION_GUIDE.md](GENERATION_MIGRATION_GUIDE.md) |
| | [PHASE_3_MIGRATION_GUIDE.md](PHASE_3_MIGRATION_GUIDE.md) |
| | [REASONING_UI_MIGRATION_GUIDE.md](REASONING_UI_MIGRATION_GUIDE.md) |
| **测试策略** | [BRANCH_DELETE_TEST_GUIDE.md](BRANCH_DELETE_TEST_GUIDE.md) |
| | [REASONING_TESTING_STRATEGY.md](REASONING_TESTING_STRATEGY.md) |
| **故障排查** | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| **归档组件指南** | [ARCHIVED_COMPONENTS.md](ARCHIVED_COMPONENTS.md) |

---

### 🎨 tailwind/ - Tailwind CSS v4 专题 (3 个文档)

Tailwind CSS v4 升级相关的所有文档。

| 文档 | 说明 |
|------|------|
| [TAILWIND_V4_README.md](../tailwind/TAILWIND_V4_README.md) | Tailwind v4 索引页 |
| [TAILWIND_V4_QUICK_REFERENCE.md](../tailwind/TAILWIND_V4_QUICK_REFERENCE.md) | 快速参考手册 |
| [TAILWIND_V4_AI_PROMPT.md](../tailwind/TAILWIND_V4_AI_PROMPT.md) | AI 提示词配置 |

**迁移记录已归档**: [../archive/migrations/](../archive/migrations/)

---

### 🐛 bugfix/ - Bug 修复记录 (2 个文档)

当前活跃的 Bug 根因分析。

| 文档 | 说明 |
|------|------|
| [CLONE_ERROR_FIX.md](../bugfix/CLONE_ERROR_FIX.md) | Vue Proxy 克隆错误修复 |
| [VUE_PROXY_CLONE_FIX.md](../bugfix/VUE_PROXY_CLONE_FIX.md) | Vue Proxy 克隆错误修复 |

**历史修复已归档**: [../archive/bugfixes/](../archive/bugfixes/) (8 个文档)

---

### 🎯 ADR - 架构决策记录

ADR（Architecture Decision Records）用于记录影响架构/边界/契约的关键决策。

**新 ADR 入口**: [adr/](../adr/) — 使用 [template.md](../adr/template.md) 和 `NNN-title.md` 编号

| ADR | 标题 | 状态 |
|-----|------|------|
| [ADR-000](../adr/000-record-architecture-decisions.md) | 记录架构决策 | 已接受 |
| [ADR-001](../adr/001-generation-facade-single-switch.md) | GenerationFacade 单开关 | 已接受 |
| [ADR-002](../adr/002-openrouter-request-builder-usage-reasoning-stream.md) | OpenRouter 请求构建器 | 已提议 |
| [ADR-003](../adr/003-remove-generation-pipeline-switch.md) | 移除生成管线开关 | 已接受 |

**历史基础决策** (仅参考，新 ADR 不要放这里): [decisions/](../decisions/) — 5 个核心技术栈决策 (001-005)

---

### 📦 archive/ - 历史文档归档 (46+ 个文档 + 11 个索引)

已完成项目的历史文档，保持主目录清晰。

| 归档目录 | 文档数 | 说明 |
|----------|--------|------|
| [refactoring/](../archive/refactoring/) | 5 | Phase 0-3 重构项目记录 |
| [completed-features/](../archive/completed-features/) | 6 | 已完成功能实现 |
| [bugfixes/](../archive/bugfixes/) | 8 | 已修复的 Bug 记录 |
| [optimizations/](../archive/optimizations/) | 7 | 性能优化实现 |
| [ui-implementations/](../archive/ui-implementations/) | 10 | UI 组件实现 |
| [analysis/](../archive/analysis/) | 9 | 问题分析报告 |
| [testing/](../archive/testing/) | 1 | 测试验证记录 |
| [migrations/](../archive/migrations/) | 0 | 迁移文档（待归档） |
| [debug/](../archive/debug/) | 4 | Debug 调查记录（DGR-1） |
| [documentation/](../archive/documentation/) | 2 | 文档治理记录（DGR-1） |
| [architecture/](../archive/architecture/) | 1 | 架构记录（DGR-1） |

**查看归档索引**: [../archive/README.md](../archive/README.md)

**归档原则**:
- 标题含 "COMPLETE"、"已完成" 且完成日期 > 30 天
- 问题已解决且验证稳定
- 分析已完成并产生后续行动
- DEBUG 文档在问题解决后归档（有参考价值时）

---

## 🔍 按关键词查找

| 关键词 | 相关文档 |
|--------|----------|
| **架构** | [OVERVIEW.md](../architecture/OVERVIEW.md), [ARCHITECTURE_REVIEW.md](../architecture/ARCHITECTURE_REVIEW.md) |
| **分支对话（历史）** | [BRANCH_CHAT_SYSTEM_COMPLETE.md](../archive/completed-features/BRANCH_CHAT_SYSTEM_COMPLETE.md) |
| **AI集成** | [OPENROUTER_INTEGRATION_SUMMARY.md](../architecture/OPENROUTER_INTEGRATION_SUMMARY.md) |
| **生成配置** | [UNIFIED_GENERATION_ARCHITECTURE.md](../architecture/UNIFIED_GENERATION_ARCHITECTURE.md) |
| **Tailwind V4** | [TAILWIND_V4_README.md](../tailwind/TAILWIND_V4_README.md) |
| **数据清理** | [DATA_CLEANUP_GUIDE.md](DATA_CLEANUP_GUIDE.md) |
| **测试** | [BRANCH_DELETE_TEST_GUIDE.md](BRANCH_DELETE_TEST_GUIDE.md), [REASONING_TESTING_STRATEGY.md](REASONING_TESTING_STRATEGY.md) |
| **迁移指南** | [GENERATION_MIGRATION_GUIDE.md](GENERATION_MIGRATION_GUIDE.md), [PHASE_3_MIGRATION_GUIDE.md](PHASE_3_MIGRATION_GUIDE.md) |
| **历史记录** | [../archive/README.md](../archive/README.md) — 46+ 个已归档文档 |
| **文档治理** | [../maintenance/document-governance.md](../maintenance/document-governance.md), [../maintenance/document-status-taxonomy.md](../maintenance/document-status-taxonomy.md), [../maintenance/document-redirect-map.md](../maintenance/document-redirect-map.md) |
| **ADR** | [../adr/README.md](../adr/README.md) — 新 ADR 入口 (规则与模板)，[../decisions/README.md](../decisions/README.md) — 历史基础决策 (仅参考) |

---

## 📊 主目录文档清单

主目录保留的核心活跃文档（约 80 个）：

### 📌 重构参考材料（历史阶段）
- [REFACTOR_PROGRESS.md](../ui-refactoring/REFACTOR_PROGRESS.md) — 重构进度跟踪（历史）
- [CHATVIEW_REFACTOR_PLAN.md](../ui-refactoring/CHATVIEW_REFACTOR_PLAN.md) — ChatView 重构计划（历史）
- [UI_REFACTOR_PAUSED_STATE.md](UI_REFACTOR_PAUSED_STATE.md) — UI 重构策略暂停说明

### 📄 性能与优化指南
- [CHAT_MULTITHREADING_PERFORMANCE_GUIDE.md](CHAT_MULTITHREADING_PERFORMANCE_GUIDE.md)
- 及其他文件（见 [guides/ 目录](#-guides---开发指南-8-个文档)）

---

## 📋 文档整理进度

### ✅ 已完成

1. **阶段1**: 建立归档目录并归档 46 个已完成项目文档
2. **阶段2**: 删除 13 个重复/临时文档
3. **阶段3**: 重组核心文档到子目录（architecture/, guides/, tailwind/）
4. **阶段4**: 更新 INDEX.md 导航
5. **阶段5**: 创建 ADR 架构决策记录（[adr/](../adr/) — 新 ADR 入口，[decisions/](../decisions/) — 5 个历史基础决策）
6. **阶段6**: 建立文档维护原则（见本页 [文档维护原则](#%E6%96%87%E6%A1%A3%E7%BB%B4%E6%8A%A4%E5%8E%9F%E5%88%99)）
7. **DGR-1**: 文档治理重构 — 双维度状态模型、DEBUG 归档、pending-classification 登记
8. **DGR-2**: 结构性入口歧义治理 — ADR 入口去歧义、refactoring→ui-refactoring 重命名、中文文件名重命名

### 📈 整理成果

| 指标 | 整理前 | 整理后 | 改善 |
|------|--------|--------|------|
| 主目录文档数 | 130+ | 80 | **↓ 38%** |
| 归档文档 | 0 | 53+ | ✅ 历史可查 |
| 已删除重复 | - | 13 | ✅ 消除冗余 |
| 子目录结构 | 不完整 | 完善 | ✅ 分类清晰 |
| 状态模型 | 单维度 | 双维度 | ✅ 更精确 |
| DEBUG 文档 | 根目录散落 | 归档到 archive/debug/ | ✅ 治理合规 |
| pending-classification | 未登记 | 10 个目录已登记 | ✅ 可追踪 |

---

## 📖 文档维护原则

### ✅ DO（推荐做法）

1. **文档与代码同步**: 代码变更时同步更新相关文档
2. **归档已完成项目**: 完成超过 30 天的实现/修复文档移至 `archive/`
3. **记录重大决策**: 技术选型和架构变更写 ADR
4. **定期审查**: 每月检查文档是否需要更新或归档
5. **保持简洁**: 优先清晰的代码注释，避免过度文档化

### ❌ DON'T（避免陷阱）

1. **避免僵尸文档**: 与代码不符的文档立即更新或删除
2. **避免重复**: 同一主题只保留一个权威文档
3. **避免临时调试文档**: 问题解决后将 `DEBUG_*.md` 归档到 `archive/debug/`
4. **避免过度分散**: 相关文档集中在同一子目录
5. **避免无维护者**: 每个文档应有明确责任人

### 📅 归档触发条件

文档满足以下任一条件即归档：
- ✅ 标题含 "COMPLETE"、"已完成"
- ✅ 完成日期距今 > 30 天
- ✅ 内容标注 "状态：已完成"
- ✅ 问题已解决且验证稳定
- ✅ 分析已完成并产生后续行动

**不归档的文档**:
- ❌ 核心架构文档（长期有效）
- ❌ 开发指南和规范
- ❌ 当前活跃的实现计划
- ❌ 待办事项和正在进行的工作

---

## 🚀 文档更新流程

```
代码变更
    ↓
是否影响文档?
    ├─→ 架构变更 → 更新 architecture/
    ├─→ 新功能 → 创建实现文档
    ├─→ 迁移指南 → 更新 guides/
    ├─→ 修复 Bug → 记录在 bugfix/ 或直接归档
    └─→ 无需更新 → 完成
```

**规则**: 
- 如果 PR 包含架构或功能变更，必须同时更新对应文档
- 功能完成后 30 天，将实现文档归档至 `archive/`
- 每月审查一次文档，识别需要归档或删除的文档

---

## 📞 获取帮助

- **找不到文档?** 使用本页的关键词索引或在 `docs/` 目录搜索
- **文档有误?** 提交 Issue 或直接提 PR 修复
- **需要新文档?** 联系项目维护者讨论文档需求
- **查找历史实现?** 查看 [../archive/README.md](../archive/README.md)

---

## 📌 下一步计划

1. 持续归档主目录中的已完成文档
2. 建立每月文档审查机制

---

**维护者**: @GuXinghai  
**贡献者**: GitHub Copilot, Starverse Team  
**License**: MIT

**最近更新历史**:
- 2026-05-22: v3.0.0 - DGR-1 文档治理重构，双维度状态模型，DEBUG 归档，pending-classification 登记
- 2026-04-30: v2.1.0 - 路径校准与语义修复（G1c），所有链接路径修正，归档/重构条目标注为历史
- 2025-12-06: v2.0.0 - 完成文档归档与重组，主目录减少 38%
- 2025-12-03: v1.0.0 - 初始版本

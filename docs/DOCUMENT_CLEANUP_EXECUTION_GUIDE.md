# 文档清理执行指南

> **目标**: 安全归档 75+ 个历史文档，保留 15 个核心活跃文档  
> **原则**: 软删除（移动到 archive/），不物理删除  
> **参考**: 基于 [DOCUMENT_CLEANUP_AUDIT.md](DOCUMENT_CLEANUP_AUDIT.md) 的五维判断法则

---

## 🚀 快速开始（3 步完成）

### 步骤 1: 模拟运行（推荐）

```powershell
# 查看将要移动哪些文件，不实际操作
.\scripts\archive-documents.ps1 -DryRun
```

**预期输出**:
```
[refactoring] (9 个文件)
  [DRY-RUN] PHASE_0_INFRASTRUCTURE_COMPLETE.md → archive/refactoring/
  [DRY-RUN] PHASE_1_BUTTON_REFACTOR_COMPLETE.md → archive/refactoring/
  ...

统计信息:
  总文件数: 85
  已归档: 75
  跳过: 8
  错误: 0
```

---

### 步骤 2: 执行归档

```powershell
# 实际执行归档（会要求确认）
.\scripts\archive-documents.ps1

# 或强制执行（跳过确认）
.\scripts\archive-documents.ps1 -Force
```

**执行过程**:
1. 在每个文档顶部添加归档标记
2. 移动文件到 `docs/archive/<category>/`
3. 移动测试脚本到 `scripts/performance/`
4. 删除临时调试文档

---

### 步骤 3: 验证结果

```powershell
# 查看归档目录结构
tree docs\archive /F

# 查看剩余的活跃文档
Get-ChildItem docs\*.md | Select-Object Name
```

**预期剩余文档**（15 个核心文档）:
```
docs/
├── INDEX.md                            # 导航中心
├── DOCUMENT_REORGANIZATION_PLAN.md     # 重组计划
├── DOCUMENT_CLEANUP_AUDIT.md           # 清理审查报告
├── ARCHITECTURE_REVIEW.md              # 架构审查（待归档）
├── REFACTOR_PROGRESS.md                # 重构进度（活跃）
├── CHATVIEW_REFACTOR_PLAN.md           # ChatView 重构（活跃）
├── UI_REFACTOR_PAUSED_STATE.md         # UI 重构暂停说明
├── TAILWIND_V4_README.md               # Tailwind 索引
├── TAILWIND_V4_QUICK_REFERENCE.md      # Tailwind 快速参考
├── TAILWIND_V4_AI_PROMPT.md            # Tailwind AI 提示
├── TAILWIND_V4_MIGRATION.md            # Tailwind 迁移（待归档）
├── OPENROUTER_INTEGRATION_SUMMARY.md   # OpenRouter 集成（待移至 architecture/）
├── PERFORMANCE_OPTIMIZATION_COMPLETE.md # 性能优化（待移至 guides/）
├── BRANCH_CHAT_SYSTEM_COMPLETE.md      # 分支系统（待拆分）
└── DOCUMENTATION_AUDIT_REPORT.md       # 文档审计报告（待归档）
```

---

## 📊 归档映射表

### 已归档文档分类（75+ 个文件）

| 分类 | 数量 | 说明 |
|------|------|------|
| **refactoring** | 9 | 已完成的 Phase 0-3.4 重构记录 |
| **completed-features** | 9 | 已上线的功能（分支系统、工具栏、推理等） |
| **issues** | 20 | 已修复的 Bug（切换卡顿、Proxy 问题等） |
| **optimizations** | 13 | 已完成的性能优化（保存、批量操作等） |
| **ui-implementations** | 15 | UI 实现记录（ChatView、对话列表等） |
| **migrations** | 3 | 迁移指南（Phase 3、生成配置、推理 UI） |
| **database** | 5 | 数据库相关（SQLite 增强、FTS5 迁移） |
| **tailwind** | 2 | Tailwind v4 升级记录 |
| **testing** | 4 | 测试记录（分支删除、推理控制等） |
| **plans** | 2 | 已完成的 TODO 计划 |
| **misc** | 20 | 其他分类（分析 UI、项目管理等） |

---

## 🔍 关键决策

### ✅ 保留的核心文档（12 个）

| 文档 | 理由 | 位置 |
|------|------|------|
| `INDEX.md` | 导航中心 | `docs/` |
| `REFACTOR_PROGRESS.md` | 活跃的进度追踪 | 根目录 |
| `CHATVIEW_REFACTOR_PLAN.md` | 活跃的重构计划 | `docs/` |
| `UI_REFACTOR_PAUSED_STATE.md` | 暂停状态说明 | `docs/` |
| `TAILWIND_V4_README.md` | Tailwind 索引 | `docs/` |
| `TAILWIND_V4_QUICK_REFERENCE.md` | 快速参考 | `docs/` |
| `TAILWIND_V4_AI_PROMPT.md` | AI 提示模板 | `docs/` |
| `BRANCH_CHAT_SYSTEM_COMPLETE.md` | 核心参考文档 | `docs/` → 需拆分 |
| `architecture/overview.md` | 架构总览 | 新创建 |
| `guides/development-setup.md` | 开发指南 | 新创建 |
| `CHANGELOG.md` | 版本历史 | 根目录 |
| `.env.example` | 环境变量模板 | 根目录 |

---

### 🗄️ 归档的文档（75+ 个）

**归档标准**:
1. **已完成**: 功能已实施完成
2. **已修复**: Bug 已修复并验证
3. **已优化**: 优化已实施并达标
4. **已迁移**: 迁移已完成

**归档格式**:
- 文件顶部添加归档标记（日期、原因、最新文档链接）
- 移动到 `docs/archive/<category>/`
- 保持原始内容完整，便于查旧账

---

### 🔥 删除的文档（1 个）

| 文档 | 理由 |
|------|------|
| `DEBUG_LOGGING_ADDED.md` | "添加了 console.log" 不值得写成正式文档 |

---

### 📝 需要后续处理的文档（5 个）

| 文档 | 当前状态 | 建议处理 |
|------|---------|---------|
| `BRANCH_CHAT_SYSTEM_COMPLETE.md` | 1327 行僵尸文档 | 拆分为精简版（300行） + 深度版 |
| `ARCHITECTURE_REVIEW.md` | 550 行审查报告 | 移至 `archive/reviews/` |
| `OPENROUTER_INTEGRATION_SUMMARY.md` | 312 行集成总结 | 移至 `architecture/ai-providers.md` |
| `PERFORMANCE_OPTIMIZATION_COMPLETE.md` | 优化总结 | 移至 `guides/performance-optimization.md` |
| `DOCUMENTATION_AUDIT_REPORT.md` | 文档审计报告 | 归档到 `archive/reviews/` |

---

## ⚠️ 注意事项

### 安全措施

1. **软删除策略**: 
   - 不物理删除任何文件
   - 仅移动到 `archive/` 目录
   - 添加归档标记，说明原因

2. **6 个月后清理**:
   - 如果 `archive/` 中的文档半年内无人访问
   - 再考虑物理删除

3. **Git 历史保护**:
   - 所有归档操作记录在 Git 历史中
   - 可通过 `git log` 追溯文档变更

---

### 回滚方法

如果需要恢复某个归档文档：

```powershell
# 查找文档位置
Get-ChildItem docs\archive -Recurse -Filter "*.md" | Where-Object { $_.Name -like "*BRANCH*" }

# 移回 docs/ 目录
Move-Item docs\archive\completed-features\BRANCH_*.md docs\

# 移除归档标记（手动编辑，删除顶部的归档说明）
```

---

## 📋 执行检查清单

### 归档前

- [ ] 阅读 `DOCUMENT_CLEANUP_AUDIT.md`
- [ ] 运行 `.\scripts\archive-documents.ps1 -DryRun`
- [ ] 确认归档文件列表正确
- [ ] 备份 `docs/` 目录（可选）

### 归档中

- [ ] 执行 `.\scripts\archive-documents.ps1 -Force`
- [ ] 观察输出日志，确认无错误
- [ ] 验证归档目录结构

### 归档后

- [ ] 查看 `docs/` 目录，确认剩余 15 个核心文档
- [ ] 查看 `docs/archive/` 目录，确认 75+ 个文档已归档
- [ ] 测试文档链接是否失效
- [ ] 提交 Git Commit

---

## 🎯 预期效果

### 归档前

```
docs/
├── 90+ 个 .md 文件（平铺）
├── 2 个 .js 测试脚本（错误位置）
└── 无清晰分类
```

### 归档后

```
docs/
├── INDEX.md                    # 导航中心
├── 15 个核心文档              # 活跃文档
├── architecture/               # 新架构文档
├── decisions/                  # ADR（待创建）
├── api/                        # API 文档（待创建）
├── guides/                     # 指南（部分已创建）
├── requirements/               # 需求（待创建）
└── archive/                    # 75+ 个历史文档
    ├── refactoring/
    ├── completed-features/
    ├── issues/
    ├── optimizations/
    ├── ui-implementations/
    ├── migrations/
    ├── database/
    ├── tailwind/
    ├── testing/
    ├── plans/
    └── misc/
```

---

## 📞 获取帮助

- **归档脚本问题**: 查看 `scripts/archive-documents.ps1` 中的注释
- **归档理由**: 查看 `DOCUMENT_CLEANUP_AUDIT.md` 中的五维判断法则
- **文档结构**: 查看 `INDEX.md` 中的导航
- **提交 Issue**: [GitHub Issues](https://github.com/GuXinghai/starverse/issues)

---

**维护者**: @GuXinghai  
**创建日期**: 2025年12月3日  
**下次审查**: 2025年6月3日（6个月后清理 archive/）

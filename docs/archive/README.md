# 📦 Starverse 文档归档中心

> **Status**: `archived`
> ⚠️ **Read-only historical records**. Default: skip unless tasked with history tracing, regression check, or migration audit.
> 💡 **For agents**: Use [../DOC_STATUS_INDEX.md](../DOC_STATUS_INDEX.md) to find active/reference docs instead.

本目录存储已完成项目的历史文档，保持主文档目录清晰简洁。

## 📊 归档统计

**归档日期**: 2025年12月6日（初始），2026年5月22日（DGR-1 更新）  
**总文档数**: 53+ 个  
**涵盖时间**: 2024年 - 2026年

## 📂 归档目录

### [refactoring/](refactoring/) - 重构项目 (5 个文档)
Phase 0-3 的重构项目记录，包括基础设施、按钮组件、Store 集成等重构工作。

**关键文档**:
- Phase 0-2 重构完成报告
- Phase 3 Store 集成状态
- 重构总结文档

### [completed-features/](completed-features/) - 已完成功能 (6 个文档)
已实现并稳定运行的功能模块文档。

**关键功能**:
- 分支树系统
- 聊天工具栏重新设计
- 增量序列化
- 项目系统实现
- 消息流式传输

### [bugfixes/](bugfixes/) - Bug 修复记录 (8 个文档)
已修复的 Bug 根因分析和修复方案。

**主要修复**:
- 分支删除问题
- 聊天内容消失
- 消息重复问题
- 配置损坏问题
- 参数持久化问题

### [optimizations/](optimizations/) - 性能优化 (7 个文档)
已实施的性能优化方案和效果验证。

**优化成果**:
- 聊天切换延迟减少 60-80%
- 分块保存与增量序列化
- 滚动性能提升至 60 FPS
- 按钮交互响应优化

### [ui-implementations/](ui-implementations/) - UI 实现 (10 个文档)
已完成的 UI 组件和界面功能实现。

**主要组件**:
- 高级模型选择器
- 分析统计 UI（4个文档）
- 带状滚动
- 侧边栏改进
- 系统图片查看器

### [analysis/](analysis/) - 问题分析报告 (9 个文档)
技术问题的深度分析报告，为优化和修复提供依据。

**分析主题**:
- 聊天切换性能分析
- Vue Proxy 问题深度分析
- 长对话性能分析
- 缓存性能分析
- 粘贴性能分析

### [testing/](testing/) - 测试验证 (1 个文档)
已完成的测试计划和验证报告。

**验证项目**:
- DOM 清理验证
- 消息重复测试
- 推理显示修复验证

### [migrations/](migrations/) - 迁移记录 (0 个文档)
技术栈迁移和升级记录（如 Tailwind V4 迁移）。

*注: 迁移文档仍在主目录，待后续阶段归档*

### [database/](database/) - 数据库相关 (0 个文档)
数据库架构演进和优化记录。

*注: 数据库文档仍在主目录，待后续阶段归档*

### [debug/](debug/) - Debug 调查记录 (4 个文档)
Debug 调查和调试记录，由 DGR-1 归档。

**归档内容**:
- OpenRouter 请求日志调试记录（4 个文件）
- 包含使用指南、技术实现、快速参考和完成报告

**归档原因**: 任务已完成（2026-01-31），内容冗余，有安全警告矛盾

### [documentation/](documentation/) - 文档治理记录 (2 个文档)
文档管理和清理的元文档，由 DGR-1 归档。

**归档内容**:
- SSOT v2 验收报告（ACCEPTANCE_REPORT.md）
- 2025年12月文档清理报告（CLEANUP_REPORT_2025_12.md）

**归档原因**: 历史过程记录，已完成

### [architecture/](architecture/) - 架构记录 (1 个文档)
架构文档归档，由 DGR-1 归档。

**归档内容**:
- 统一生成架构实现总结（GENERATION_ARCHITECTURE_SUMMARY.md）

**归档原因**: 与 UNIFIED_GENERATION_ARCHITECTURE.md 内容重复，后者为 SSOT

## 🔍 如何使用归档

### 查找历史信息
1. 根据问题类型选择对应目录（重构/修复/优化/分析）
2. 查看目录下的 README.md 获取文档列表
3. 阅读具体文档了解历史实现细节

### 参考历史方案
归档文档可作为：
- 技术决策的历史依据
- 类似问题的解决方案参考
- 代码演进的追溯路径
- 新团队成员的学习资料

### 搜索技巧
```bash
# 在归档中搜索关键词
cd docs/archive
grep -r "关键词" .

# 查找特定文件
find . -name "*关键词*.md"
```

## 📋 归档原则

### 归档触发条件
文档满足以下任一条件即归档：
- ✅ 标题含 "COMPLETE"、"已完成"
- ✅ 完成日期距今 > 30 天
- ✅ 内容标注 "状态：已完成"
- ✅ 问题已解决且验证稳定
- ✅ 分析已完成并产生后续行动

### 不归档的文档
- ❌ 核心架构文档（长期有效）
- ❌ 开发指南和规范
- ❌ 当前活跃的实现计划
- ❌ 待办事项和正在进行的工作

## 🔗 相关链接

- [../guides/INDEX.md](../guides/INDEX.md) - 文档导航中心
- [../architecture/](../architecture/) - 核心架构文档（活跃）
- [../guides/](../guides/) - 开发指南（活跃）
- [../refactoring/REFACTOR_PROGRESS.md](../refactoring/REFACTOR_PROGRESS.md) - 当前重构进度（活跃）
- [../maintenance/document-governance.md](../maintenance/document-governance.md) - 文档治理规则
- [../maintenance/document-redirect-map.md](../maintenance/document-redirect-map.md) - 重定向映射

## 📌 维护说明

归档目录每月审查一次：
- 识别新完成的文档
- 归档超过 30 天的实现/修复文档
- 更新各目录的 README 索引
- 清理过时的临时文档
- DEBUG 文档在问题解决后归档（有参考价值时）

**上次审查**: 2026年5月22日（DGR-1）  
**下次计划**: 2026年6月22日

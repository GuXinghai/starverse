# Starverse 文档导航中心

> **Status**: active
> **Document Role**: entry
> **Last updated**: 2026-08-14
>
> 本页只负责导航。文档是否权威以 [DOC_STATUS_INDEX.md](../DOC_STATUS_INDEX.md) 的状态和角色为准；历史过程记录默认不作为实现依据。

## 首读顺序

1. [项目 README](../../README.md) — 项目定位与启动方式。
2. [Agent Index](../AGENT_INDEX.md) — 任务路由和维护护栏。
3. [Documentation Status Index](../DOC_STATUS_INDEX.md) — 当前 SSOT、状态和目录清单。
4. [维护者入口](../maintenance/maintainer-entry.md) — 代码边界和高风险区域。
5. [当前系统架构](../architecture/CURRENT_SYSTEM_ARCHITECTURE.md) — 当前系统层次和职责边界。

## 按任务查找

| 任务 | 首选入口 | 说明 |
|---|---|---|
| 系统架构 / 生成链 | [当前系统架构](../architecture/CURRENT_SYSTEM_ARCHITECTURE.md) → [architecture/](../architecture/) | 当前进程、数据与模块边界；主题目录内的 evidence 只表示证据，不自动成为 SSOT。 |
| Provider / model identity | [provider-architecture/](../architecture/provider-architecture/README.md) → [identity analysis](../analysis/model-provider-identity/README.md) | Provider 架构 SSOT 与时间限定的审计证据分开。 |
| File pipeline | [file-pipeline/README.md](../file-pipeline/README.md) → [DFC ledger](../file-pipeline/document-format-conversion/progress-ledger.md) | 领域入口；旧 progress-ledger（Worker 架构）已归档。 |
| DFC | [DFC context](../file-pipeline/document-format-conversion/important-context.md) → [v1.2 contract](../file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md) | DFC 当前支持矩阵和边界。 |
| File type detection / plugins | [detection README](../file-pipeline/file-type-detection-implementation/README.md) → [plugin distribution](../file-pipeline/plugin-distribution/) | Epoch 2 与插件发行记录。 |
| Model catalog / preferences | [spec/](../spec/) → [notes/](../notes/) | 契约、schema、查询和验证记录；以当前源码为最终事实。 |
| Development / troubleshooting | [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md)、[TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 环境准备和问题排查。 |
| Testing / gates | [test strategy](../maintenance/test-strategy.md) | 测试分区、验证范围和门禁。 |
| Credentials / security | [security/](../security/) | 凭据权威、安全边界和平台策略。 |
| Documentation governance | [document governance](../maintenance/document-governance.md) → [redirect map](../maintenance/document-redirect-map.md) | 状态、角色、归档与移动规则。 |

## 决策与规范

- 新的架构决策使用 [docs/adr/](../adr/)，并遵循 [template.md](../adr/template.md)。
- [docs/decisions/](../decisions/) 是项目早期基础决策的历史参考，不新增 ADR。
- [spec/](../spec/)、[requirements/](../requirements/) 和 [rfc/](../rfc/) 保持不同语义：契约、需求、提案不互相替代。

## 历史资料

- [docs/archive/](../archive/) 是终态历史资料，默认跳过。
- [analysis/](../analysis/) 保存有时间边界的调查和审计；除非明确标为 SSOT，否则不能替代当前源码或 owner decision。
- [refactor/](../refactor/) 与 [ui-refactoring/](../ui-refactoring/) 分别记录不同重构主题；旧 [refactoring/](../refactoring/README.md) 仅保留重定向说明。

## 文档维护约束

1. 新增非归档文档在头部声明 `Status`、`Document Role` 和 `Last updated`。
2. 移动或重命名必须先更新 [document-redirect-map.md](../maintenance/document-redirect-map.md)，再更新入口和交叉引用。
3. 归档文档保持只读，不把历史 closeout 当作当前实现说明。
4. 文档整理不改变生产代码、数据库 schema 或运行时契约。

## 快速搜索

```powershell
rg -n "关键词" docs README.md
rg --files docs | Sort-Object
```

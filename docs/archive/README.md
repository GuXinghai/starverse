# Starverse 文档归档中心

> **Status**: archived
> **Document Role**: archive-index
> **Last updated**: 2026-08-14
>
> 本目录保存历史过程记录。默认跳过；只有追溯历史、回归或迁移时才进入。归档内容不替代当前源码、SSOT 或 owner decision。

## 当前目录

除本索引外，当前归档文件按主题分布如下：

| 目录 | 文件数 | 内容 |
|---|---:|---|
| [analysis/](analysis/) | 11 | 历史问题分析 |
| [architecture/](architecture/) | 2 | 已被当前架构文档替代的架构记录 |
| [bugfixes/](bugfixes/) | 34 | 已解决的缺陷记录（含 2026-08-14 DGR-3 批次） |
| [completed-features/](completed-features/) | 40 | 已完成的功能记录（含 2026-08-14 DGR-3 批次） |
| [debug/](debug/) | 6 | 已结束的 Debug 调查 |
| [documentation/](documentation/) | 13 | 文档治理过程记录（含 2026-08-14 DGR-3 批次） |
| [migrations/](migrations/) | 8 | 已完成的迁移记录（含 2026-08-14 DGR-3 批次） |
| [optimizations/](optimizations/) | 10 | 已完成的性能优化记录（含 2026-08-14 DGR-3 批次） |
| [refactoring/](refactoring/) | 10 | 已完成的非 UI 重构记录（含 2026-08-14 DGR-3 批次） |
| [testing/](testing/) | 10 | 历史测试验证记录（含 2026-08-14 DGR-3 批次） |
| [ui-implementations/](ui-implementations/) | 12 | 已完成的 UI 实现记录（含 2026-08-14 DGR-3 批次） |

> 2026-08-14 DGR-3：`features/`、`bugfix/` 及 `guides/` 历史记录、仓库根目录散落文档共 82 个已归档并入各子目录；`features/`、`bugfix/` 现仅保留重定向 README。移动登记见 [document-redirect-map.md](../maintenance/document-redirect-map.md)。

## 使用规则

- 先查看 [../DOC_STATUS_INDEX.md](../DOC_STATUS_INDEX.md) 和 [../guides/INDEX.md](../guides/INDEX.md)；当前文档入口不应依赖归档内容。
- 归档文件保持只读。若需要修正历史事实，新增说明或更新 redirect map，不直接改写原记录。
- 新的架构决策写入 [../adr/](../adr/)，不要写入归档目录。
- 归档前必须确认没有当前入口依赖，并在 [document-redirect-map.md](../maintenance/document-redirect-map.md) 中登记移动路径。

## 相关入口

- [文档导航中心](../guides/INDEX.md)
- [文档状态索引](../DOC_STATUS_INDEX.md)
- [文档治理规则](../maintenance/document-governance.md)
- [重定向映射](../maintenance/document-redirect-map.md)
- [UI 重构记录（历史）](../ui-refactoring/REFACTOR_PROGRESS.md)

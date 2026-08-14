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
| [bugfixes/](bugfixes/) | 9 | 已解决的缺陷记录 |
| [completed-features/](completed-features/) | 11 | 已完成的功能记录 |
| [debug/](debug/) | 5 | 已结束的 Debug 调查 |
| [documentation/](documentation/) | 3 | 文档治理过程记录 |
| [migrations/](migrations/) | 5 | 已完成的迁移记录 |
| [optimizations/](optimizations/) | 8 | 已完成的性能优化记录 |
| [refactoring/](refactoring/) | 8 | 已完成的非 UI 重构记录 |
| [testing/](testing/) | 2 | 历史测试验证记录 |
| [ui-implementations/](ui-implementations/) | 11 | 已完成的 UI 实现记录 |

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
- [当前 UI 重构记录](../ui-refactoring/REFACTOR_PROGRESS.md)

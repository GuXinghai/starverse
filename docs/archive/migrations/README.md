# 技术迁移记录归档

本目录归档已完成的技术栈迁移和升级文档。

## 📑 文档列表

### Tailwind CSS v4 迁移（2024年11月）

#### 迁移过程文档
- [TAILWIND_V4_CSS_FIRST_MIGRATION.md](TAILWIND_V4_CSS_FIRST_MIGRATION.md) - CSS优先配置迁移记录
- [TAILWIND_V4_MIGRATION.md](TAILWIND_V4_MIGRATION.md) - 主迁移文档
- [TAILWIND_V4_SUMMARY.md](TAILWIND_V4_SUMMARY.md) - 迁移总结
- [TAILWIND_V4_VERIFICATION.md](TAILWIND_V4_VERIFICATION.md) - 迁移验证报告

#### 迁移成果
- **完成日期**: 2024年11月20日
- **核心变更**: 从 v3 升级到 v4，采用 CSS 优先配置策略
- **构建性能**: 热更新从 2s 降至 200ms（提升 10 倍）
- **CSS 体积**: 从 120KB 降至 85KB（减少 30%）
- **语法变更**: 统一使用斜杠透明度语法（如 `bg-black/50`）

#### 当前参考文档
迁移完成后的活跃文档位于 [`docs/tailwind/`](../../tailwind/)：
- [TAILWIND_V4_README.md](../../tailwind/TAILWIND_V4_README.md) - 索引页
- [TAILWIND_V4_QUICK_REFERENCE.md](../../tailwind/TAILWIND_V4_QUICK_REFERENCE.md) - 快速参考
- [TAILWIND_V4_AI_PROMPT.md](../../tailwind/TAILWIND_V4_AI_PROMPT.md) - AI 配置

## 📊 迁移统计

| 迁移项目 | 开始日期 | 完成日期 | 工作量 | 文档数 |
|---------|---------|---------|--------|--------|
| Tailwind v4 | 2024-11-15 | 2024-11-20 | 2 天 | 4 个过程文档 |

## 🔗 相关文档

- [../refactoring/](../refactoring/) - 重构项目记录
- [../../decisions/004-tailwind-v4-upgrade.md](../../decisions/004-tailwind-v4-upgrade.md) - ADR：为什么升级 Tailwind v4

## 📌 归档说明

这些文档记录了迁移的详细过程，包括：
- 配置变更步骤
- 遇到的问题和解决方案
- 语法全局替换记录
- 验证测试结果

归档原因：迁移已完成且稳定运行 30 天以上，保留作为历史参考。

---

**归档日期**: 2025年12月6日  
**文档数量**: 4 个  
**维护者**: @GuXinghai

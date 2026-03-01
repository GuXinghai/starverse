# Model Catalog 阶段 1 自检基线

更新日期：2026-02-16

## 背景

当前仓库全量 TypeScript 检查（`npx tsc --noEmit`）存在历史错误，不能稳定作为每张任务卡的验收门槛。

## 阶段 1 统一规则

- 全仓 `tsc` 结果记录为环境状态，不作为 Catalog 阶段 1 卡片阻断项。
- Catalog 相关任务卡必须执行局部 green 自检：
  - `npx tsc -p tsconfig.model-catalog.json --pretty false`
- 若局部检查失败，视为当前任务卡未通过。

## 说明

- `tsconfig.model-catalog.json` 仅覆盖 `src/shared/modelCatalog/internalSchema.ts`。
- 该基线用于确保 schema 与 adapter contract 的类型稳定性，不替代后续全仓修复工作。

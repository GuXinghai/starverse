# 001 - Generation facade with single switch

- Date: 2025-12-13
- Status: Accepted

## Context

需要让“新旧生成管线并存”成为可控的工程实践，并避免在调用链到处散落 `if (useNewPipeline)` 之类的分支逻辑。

重构期间必须满足：

- 一个入口、一个开关、一个抽象接口（便于逐步替换、降低迁移风险）
- Feature flag 只能在单点读取（避免“幽灵分流点”）
- 现有功能必须保持可运行（即使 next pipeline 尚未完成）

## Decision

引入 Generation Facade + 抽象管线接口：

- `src/next/generation/IGenerationPipeline.ts`：定义 `streamChatResponse(...)` 抽象
- `src/next/generation/GenerationFacade.ts`：唯一入口，内部读取开关并选择 legacy/next pipeline
- `src/next/config/flags.ts`：定义读取规则（localStorage 优先，其次 `import.meta.env`），仅允许 Facade 调用
- `LegacyGenerationPipeline` / `NextGenerationPipeline`：Gate 1 先复用 legacy 行为，确保开关切换不影响可运行性

并将现有“发送/重试”入口改为调用 Facade（单点分流）：

- `src/composables/useMessageSending.ts`
- `src/composables/chat/useMessageRetry.ts`

## Consequences

- ✅ 分流点集中：开关只在 `GenerationFacade` 读取，避免分支逻辑扩散。
- ✅ 可渐进替换：后续 Gate 可在不改调用方的前提下替换 `NextGenerationPipeline` 的内部实现。
- ⚠️ 额外间接层：调试时需要从 Facade 追到具体 pipeline；通过稳定的 flags 约定与单测降低风险。


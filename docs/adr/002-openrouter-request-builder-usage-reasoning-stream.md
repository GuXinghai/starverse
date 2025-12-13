# 002 - OpenRouter request builder as pure function (usage/reasoning/stream)

- Date: 2025-12-13
- Status: Proposed

## Context

OpenRouter `/chat/completions` 的请求体存在几个“结构性易错点”：

- `stream` 必须是 boolean；如果 `"true"` 这样的字符串进入链路会造成运行时行为偏差。
- Usage Accounting 建议明确策略（默认开启或显式配置），避免“半开半关”导致成本/usage 追踪不稳定。
- reasoning 参数只应表达“是否发送/如何发送”，不应耦合 UI 展示逻辑。
- 推理控制存在互斥组合（例如禁用推理 `effort="none"` 与 `max_tokens` 同时出现）。

如果这些逻辑散落在 service/composable/store 内，会导致难以审计、难以测试，也更容易偏离 SSOT。

## Decision

新增一个 **纯函数 request builder**，将请求体构造收敛为：

输入（`model + messages + config`） → 输出（OpenRouter request JSON）

并把互斥/默认策略写入单测，作为 Gate 1→2 的可回归约束：

- `src/next/openrouter/buildRequest.ts`
- `src/next/openrouter/buildRequest.test.ts`

策略要点：

- `stream` 必须为 boolean（非 boolean 直接抛错）
- `usage.include` 默认 `true`，且输出中始终显式写出 `usage: { include: boolean }`
- `reasoning` 只处理请求 payload，不承载 UI 语义
- `reasoning` 控制模式互斥：`enabled` / `effort` / `max_tokens` 三选一
- 禁用推理的唯一定义：`reasoning.effort = "none"`，且不得与 `max_tokens` 组合

## Consequences

- ✅ 把“易错点”收敛到可测试的纯函数，减少迁移期散落逻辑。
- ✅ 单测成为 contract：后续 refactor 不得破坏互斥/默认策略。
- ⚠️ 该函数当前只覆盖 usage/reasoning/stream；后续如扩展采样/长度等字段需继续保持“纯函数 + 单测约束”的模式。


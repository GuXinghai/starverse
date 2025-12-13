# Risk Log（OpenRouter 流式回复与推理重构）

**输入 SSOT**：`docs/open_router_流式回复与推理_ssot（v_2_）.md`  
**现状证据**：`docs/analysis/OPENROUTER_REASONING_REALITY_CHECK_2025_12.md`

> 说明：风险日志不是 SSOT；用于规划与验收编排。每条风险给出触发条件与缓解策略，便于在 Gate 推进时做“前置拆雷”。

---

## R-001 — 非流式 `message.reasoning_details` 丢失 ✅ 已缓解
- **现象/差异**：~~parser 主要处理 `delta.reasoning_details`，未见非流式 `choices[].message.reasoning_details` 的读取逻辑。~~
- **缓解**：✅ 已完成。`mapChunkToEvents.ts#L113` 双路径覆盖：`delta?.reasoning_details ?? message?.reasoning_details`。单测 `mapChunkToEvents.test.ts` 覆盖两条路径。
- **Gate**：1 → 2 ✅

## R-002 — reasoning_details 回传链路断裂（多轮/工具调用连续性风险） ✅ 已缓解
- **现象/差异**：~~`HistoryMessage` 不含 metadata，消息转换不会把 `reasoning_details` 回传到下一轮 `messages[]`。~~
- **缓解**：✅ 已完成。`buildMessages.ts` 实现双模式：`default`（不回传推理块）+ `advanced_reasoning_blocks`（原样回传 `reasoningDetailsRaw`）。单测 `buildMessages.test.ts` 验证两种模式行为。
- **Gate**：3 ✅

## R-003 — `include_reasoning` 兼容残留与 SSOT 冲突 ✅ 已缓解
- **现象/差异**：~~推理参数适配器（`reasoning.exclude` + legacy `include_reasoning`）。~~
- **缓解**：✅ 已完成。新链路 `src/next/openrouter/buildRequest.ts` 只使用 `reasoning` 对象，测试用例 `buildRequest.test.ts#L545` 明确验证不存在 `include_reasoning`。旧 services/stores 已删除。
- **验证命令**：`grep -r "include_reasoning" src/ --include="*.ts" --include="*.vue"` → 仅测试断言，0 命中生产代码
- **Gate**：3 ✅

## R-004 — UI 迁移期"双写/混用状态"导致竞态与回归 ✅ 已缓解
- **现象/差异**：~~SSOT 6.6 明确禁止新旧 UI 混用 container/store 直连与双写。~~
- **缓解**：✅ 已完成。旧 UI 已删除（`src/stores`、`src/services`、`src/components`、`src/composables` 均不存在）。新 UI 完全隔离：`src/ui-next/` 仅通过 `useChatSession()` facade 访问 Reducer。Gate 脚本 `tc10-ui-next.mjs` 验证无 legacy imports。`App.vue` 只渲染 `AppChatNext`。
- **Gate**：4 → 5 ✅

## R-005 — usage chunk（流末尾、空 choices）处理回归 ✅ 已缓解
- **现象/差异**：~~SSOT 2.3/3.6 要求支持流末尾 `usage` 且 `choices` 为空；错误聚合会导致 UI/成本展示缺失。~~
- **缓解**：✅ 已完成。`mapChunkToEvents.ts` 正确处理 `choices=[]` + `usage` 的 chunk。`UsageDelta` 绑定 session（generation），不绑定 message。单测 `mapChunkToEvents.test.ts#L43-48` + E2E 测试 `streaming-smoke.test.ts#L79-88` 验证完整流程。
- **Gate**：1 → 2 ✅


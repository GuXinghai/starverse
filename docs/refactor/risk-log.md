# Risk Log（OpenRouter 流式回复与推理重构）

**输入 SSOT**：`docs/open_router_流式回复与推理_ssot（v_2_）.md`  
**现状证据**：`docs/analysis/OPENROUTER_REASONING_REALITY_CHECK_2025_12.md`

> 说明：风险日志不是 SSOT；用于规划与验收编排。每条风险给出触发条件与缓解策略，便于在 Gate 推进时做“前置拆雷”。

---

## R-001 — 非流式 `message.reasoning_details` 丢失
- **现象/差异**：现状审计指出 parser 主要处理 `delta.reasoning_details`，未见非流式 `choices[].message.reasoning_details` 的读取逻辑。
- **影响**：非流请求丢失结构化推理详情；UI/存储/回传策略无法按 SSOT 3.3.1 覆盖。
- **触发条件**：`stream: false` 且模型返回 `message.reasoning_details`。
- **缓解**：Gate 1 增补非流解析与单测；Gate 2 确保 append-only 存储与可回放。
- **Gate**：1（修复）→ 2（验证）

## R-002 — reasoning_details 回传链路断裂（多轮/工具调用连续性风险）
- **现象/差异**：现状审计指出 `HistoryMessage` 不含 metadata，消息转换不会把 `reasoning_details` 回传到下一轮 `messages[]`。
- **影响**：若未来启用“推理块回传”，会破坏 SSOT 3.3.3 的连续性要求；也会导致“实现与注释/期望不一致”的维护风险。
- **触发条件**：开启高级模式或出现依赖推理块连续性的模型/工作流。
- **缓解**：Gate 3 明确“默认不回传推理块”（SSOT 5.2），仅在显式开启高级模式时实现回传，并对“不可裁剪/篡改/重排”加单测。
- **Gate**：3

## R-003 — `include_reasoning` 兼容残留与 SSOT 冲突
- **现象/差异**：现状审计指出存在推理参数适配器（`reasoning.exclude` + legacy `include_reasoning`）。
- **影响**：与 SSOT 2.1 “只使用 `reasoning` 对象，不使用 `include_reasoning`。” 发生冲突；可能造成请求体不一致或未来维护混乱。
- **触发条件**：配置/调用链仍能产生 `include_reasoning` 字段。
- **缓解**：Gate 3 统一对外配置与请求体构造：入口侧做一次性迁移/清理，确保最终发送的请求体不包含 `include_reasoning`。
- **Gate**：3（必要时向前回溯 Gate 1）

## R-004 — UI 迁移期“双写/混用状态”导致竞态与回归
- **现象/差异**：SSOT 6.6 明确禁止新旧 UI 混用 container/store 直连与双写。
- **影响**：并发流式会话与分支树状态在旧 UI/新 UI 之间竞态，导致不可复现 bug。
- **触发条件**：新 UI 未隔离入口；或新 UI 直接 import legacy store/service/parser；或同一对话数据被两套写入者更新。
- **缓解**：Gate 4 严格隔离入口；Gate 5 落地 `no-restricted-imports` 等工程化约束。
- **Gate**：4 → 5

## R-005 — usage chunk（流末尾、空 choices）处理回归
- **现象/差异**：SSOT 2.3/3.6 要求支持流末尾 `usage` 且 `choices` 为空；错误聚合会导致 UI/成本展示缺失。
- **影响**：成本/用量统计缺失或错误；影响计费与调试。
- **触发条件**：SSE 最后 chunk 仅带 `usage`（无 choices）。
- **缓解**：Gate 1/2 加单测与快照；确保 `UsageDelta` 绑定 generation 而不是 message。
- **Gate**：1 → 2


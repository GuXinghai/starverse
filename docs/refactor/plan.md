# TC-00 — Gate 0–5 任务树（SSOT 可执行化）

**SSOT（唯一真相源）**：`docs/open_router_流式回复与推理_ssot（v_2_）.md`  
**现状审计（非 SSOT，仅作风险输入）**：`docs/analysis/OPENROUTER_REASONING_REALITY_CHECK_2025_12.md`

> 本计划将 SSOT “落地为可执行关卡（Gate）”，并明确每个 Gate 的目录范围、产物、测试与退出条件。  
> 任何后续任务卡必须引用：`docs/refactor/compliance-checklist.md` 与本文件对应 Gate 的退出条件。

---

## 全局编排规则（适用于 Gate 0–5）

### R0. SSOT 变更管控
- 任何与 SSOT 硬约束/禁止事项冲突的实现，视为失败。
- 若需要“改 SSOT 约束”，必须先走 TC-01 写 ADR，并更新 SSOT 后再继续。

### R1. 提交触碰范围（Anti-smear）
- 每次提交只允许触碰“当前 Gate 的目录 allowlist”；跨 Gate 改动一律拆分提交。
- 允许的例外：`docs/refactor/**`（用于同步计划/风险/验收记录），但不得夹带实现代码改动。

---

## Gate 总览（0–5）

| Gate | 主题 | 主要范围（目录/文件） | 依赖 | 退出条件（摘要） |
|---|---|---|---|---|
| 0 | SSOT 对齐与执行编排 | `docs/refactor/**` | SSOT | 计划/Checklist/风险日志齐全且可用于后续任务引用 |
| 1 | Transport + Parser 合同固化 | `src/services/providers/openrouter/**`、`src/services/providers/OpenRouterService.ts`、`tests/unit/services/**` | Gate 0 | SSE/非流解析满足 SSOT；事件输出与错误边界一致 |
| 2 | Reducer/Store 事件驱动状态机 | `src/stores/**`、`src/types/**`、`tests/unit/**` | Gate 1 | Reducer 成为 single-writer；RunVM/MessageVM/selectors 满足 SSOT |
| 3 | 上下文回传策略与 generation 追溯 | `src/services/providers/**`、`src/types/**`、（如有）`electron/**` | Gate 1–2 | 默认不回传推理块；generationId 记录与 `/generation` 查询链路可用 |
| 4 | 新 Chat UI 隔离入口 + 垂直切片 | `src/components/**`、`src/composables/**`、`src/main.ts`（路由入口） | Gate 2–3 | UI 不解析 JSON；通过 Facade/Hook 交互；覆盖关键边界 |
| 5 | 强制护栏与收尾 | ESLint/TS 规则、开关删除、文档 | Gate 4 | 工程化限制落地；临时开关有清除点；回归测试通过 |

---

## Gate 0 — SSOT 对齐与执行编排（本卡）

### 目录 allowlist（本 Gate 内每次提交）
- `docs/refactor/**`

### 产物（必须）
- `docs/refactor/plan.md`（本文件）
- `docs/refactor/compliance-checklist.md`
- `docs/refactor/risk-log.md`

### 产物（可选但推荐）
- `docs/refactor/observability.md`

### DoD
- Checklist 条目逐条抄写 SSOT，不得改写（用于 Code Review）。
- 后续任务卡必须引用：Checklist 与目标 Gate 的退出条件。

### 退出条件（Gate 0）
- `docs/refactor/*` 四份文件存在且自洽。

---

## Gate 1 — Transport + Parser 合同固化

### 目标
把“字节流 → SSE 行 → JSON chunk → Domain Events”的合同固化为稳定边界：**Transport 只拿流，Parser 只产出事件**（不读写 store），并覆盖 SSOT 中所有协议边界条件。

### 目录 allowlist（本 Gate 内每次提交）
- `src/services/providers/openrouter/**`
- `src/services/providers/OpenRouterService.ts`
- `src/services/providers/openrouterReasoningAdapter.ts`
- `src/types/**`（仅当需要补齐事件/响应类型）
- `tests/unit/services/**`

### 产物（示例，不限定文件名）
- SSE 解析器满足：
  - 注释行 `:` 先识别，不做 JSON parse
  - `data: [DONE]` 终止
  - JSON parse 失败 → 协议异常 → `StreamError` 并终止
  - mid-stream error（顶层 `error`）→ `StreamError(..., terminal=true)` 并终止且不回滚已写入内容
- reasoning_details 解析满足：
  - **流式**：`choices[].delta.reasoning_details`
  - **非流**：`choices[].message.reasoning_details`
- usage 处理满足：流末尾 `usage` + `choices` 为空可被正确聚合/上抛
- Meta 事件必须携带：generation id、model、provider（若返回）、finish_reason/native_finish_reason（按 SSOT 透传）

### 测试（必须）
- 单元测试覆盖 SSOT “Parser 测试”清单（见 Checklist 的对应条目）。

### DoD
- Parser 层不直接触达任何 store（硬约束）。
- Parser 层输出事件集合与字段满足 SSOT 1.3/4.1/4.3 的边界定义。

### 退出条件（Gate 1）
- 对应单测通过，且可在最小端到端链路中稳定产出 Domain Events（含 error/done/usage）。

---

## Gate 2 — Reducer/Store 事件驱动状态机（Single-writer）

### 目标
实现“只消费 Domain Events”的 Reducer，成为 Run/Message 的唯一写入者，并按 SSOT 产出稳定的 ViewModel 与 selectors，供 UI 只读消费。

### 目录 allowlist（本 Gate 内每次提交）
- `src/stores/**`
- `src/types/**`
- `tests/unit/**`（聚焦 Reducer/selector）

### 产物（必须）
- Reducer 能处理：
  - `MessageDeltaText` / `MessageDeltaToolCall` / `MessageDeltaReasoningDetail` 的增量聚合
  - `UsageDelta` 与 run 级 usage 归并（不绑定消息）
  - `StreamError` / `StreamDone` / abort 状态
- reasoning_details 存储满足 SSOT：
  - append-only 原始事件序列（不得重排/不得修改/不得合并重写）
  - UI 展示从原始数据派生，但原始对象必须可回放
- UI 语义判定满足 SSOT 3.4：
  - encrypted / excluded / not returned 三态不可混淆

### 测试（必须）
- 单元测试覆盖 SSOT “Reducer 测试”清单（见 Checklist）。

### DoD
- “任何临时拼字符串写 store”被移除或禁止（必须走 Reducer）。
- RunVM/MessageVM/selectors 符合 SSOT 6.2 合同。

### 退出条件（Gate 2）
- Reducer/selector 单测通过；并能在垂直切片里驱动 UI 渲染（不要求 UI 完整）。

---

## Gate 3 — 上下文回传策略与 generation 追溯

### 目标
把“UI 展示数据”与“下轮回传数据”彻底分离：默认不回传推理块；若显式开启高级模式，严格按 SSOT 回传约束执行；同时固化 generation 追溯链路与日志字段。

### 目录 allowlist（本 Gate 内每次提交）
- `src/services/providers/**`
- `src/types/**`
- `tests/unit/services/**`
- （如涉及主进程追溯/转发）`electron/**`

### 产物（必须）
- 请求体构造满足 SSOT 2.x（reasoning/usage/stream）。
- 默认回传策略满足 SSOT 5.2（只回传用户可见内容 + tool calls 结果；不回传推理块）。
- 若实现“推理块回传（高级模式）”，必须满足 SSOT 3.3.3（原始序列一致，不可裁剪/篡改/重排）。
- generation 追溯可用：记录 generation id，并支持按 id 查询 `/generation`（即便 UI 不展示）。

### 测试（建议→必须，取决于改动面）
- 消息转换/回传策略的单测（至少覆盖“默认不回传”与“高级模式 gate”）。

### 退出条件（Gate 3）
- 默认回传策略与 generation 记录在运行态可验证（日志/状态快照有字段）。

---

## Gate 4 — 新 Chat UI 隔离入口 + 垂直切片

### 目标
在一个明确隔离入口挂载新 Chat UI 子树，通过 Facade/Hook 与新 Reducer 交互，实现一条薄的端到端切片（发送 → 流式 → error/done/abort → 展示）。

### 目录 allowlist（本 Gate 内每次提交）
- `src/components/**`（建议新建隔离子树目录，如 `src/components/chat-v2/**`）
- `src/composables/**`（Facade/Hook）
- `src/main.ts` / 路由入口（若需要）
- `src/style.css`（如需最小样式支持）
- `tests/**`（如有 UI 测试基础设施）

### 产物（必须）
- UI 仅消费 Reducer 的只读派生数据（禁止解析 OpenRouter JSON）。
- 交互流程满足 SSOT 6.4（dispatchSend / target assistant 占位 / streaming 增量 / mid-stream error / abort）。
- 覆盖 SSOT 6.5 的 UI 边界场景（至少可视化/不崩溃）。
- 迁移护栏满足 SSOT 6.6（隔离入口、single-writer、禁止 legacy import 等）。

### 退出条件（Gate 4）
- 新 UI 切片可用：能发送、能流式增量、能 abort、能在 mid-stream error 时保留部分输出并提示重试。

---

## Gate 5 — 强制护栏与收尾

### 目标
把“护栏”从文档变成工程事实：限制新 UI 不引用 legacy；清理临时开关；补齐文档与回归验证路径。

### 目录 allowlist（本 Gate 内每次提交）
- 配置与工程化文件（如 ESLint/TS 配置）
- `docs/**`
- 少量必要的修正提交（严格受 Gate 4 护栏约束）

### 产物（必须）
- `no-restricted-imports` / TS path rule（或等价机制）生效：新 UI 目录不得引用 legacy。
- 临时开关有“删除时间点/条件”，并在满足条件时删除。
- 回归验证命令/步骤写入文档（最小可执行）。

### 退出条件（Gate 5）
- 护栏规则启用且不误伤；核心单测通过；文档可指导新成员复现关键链路。

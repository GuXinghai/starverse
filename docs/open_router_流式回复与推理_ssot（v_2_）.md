# OpenRouter 流式回复与推理 SSOT（v2）

> 目标：以 **可维护性 / 简洁精炼 / 鲁棒性** 为第一原则；以 **OpenRouter 官方文档** 为事实边界；允许分支树存在，但不让其污染传输层与解析层。
>
> 文档完整性说明：本画布文档只会被我“增量插入/替换小段落”，不会对未知内容做静默删改。若你准备提交到仓库，推荐你在粘贴前做一次 `diff`（见本文末尾校验清单）。

## 0. 范围与非目标

### 范围
- 仅覆盖 OpenRouter **Chat Completions**：`POST /api/v1/chat/completions`。
- 覆盖：
  - 流式 SSE（含注释行、mid-stream error、终止标记）
  - 推理控制（reasoning 参数）
  - 推理信息输出（message.reasoning 与 reasoning_details）
  - token usage（非流/流末尾 usage）与 generation 追溯

### 非目标
- 不接入 `/responses`（如未来要接，新增独立 SSOT，不与本 SSOT 混写）。
- 不做旧参数/旧存量数据兼容（允许一次性迁移）。

## 1. 术语与数据对象

### 1.1 OpenRouter 输出形态（我们要支持的最小真相）
- **非流**：`choices[i].message`（含 `content`，可含 `tool_calls`、`reasoning`、`reasoning_details`）
- **流式**：`choices[i].delta`（含 `content` 增量，可含 `tool_calls` 增量、`reasoning_details` 增量）
- **SSE 注释行**：以 `:` 开头，例如 `: OPENROUTER PROCESSING`（不是 JSON）
- **mid-stream error**：HTTP 仍为 200，但会出现一个带 `error` 的 SSE JSON chunk，并以 `finish_reason: "error"` 终止

### 1.2 推理数据的两层含义（必须分离）
- **reasoning（message.reasoning）**：可视为“推理 token 串”的一种呈现（是否存在依模型/提供方而定）。
- **reasoning_details（message.reasoning_details[]）**：结构化推理详情序列；是 UI 展示与高级工作流的核心。

> 重要：UI 展示用的“推理文本/摘要”，不等于“下轮上下文应回传的块”。

### 1.3 内部统一事件（Domain Events）
解析层只产出这些事件；状态层只消费这些事件：
- `StreamComment(text)`
- `StreamError(errorObj, terminal=true)`
- `StreamDone()`
- `MessageDeltaText(messageId, choiceIndex, text)`
- `MessageDeltaToolCall(messageId, choiceIndex, toolCallDelta)`
- `MessageDeltaReasoningDetail(messageId, choiceIndex, detailObj)`
- `UsageDelta(usageObj)`（流末尾/非流一次性）
- `MetaDelta({ id, model, provider?, finish_reason?, native_finish_reason? })`

> 注意：**messageId** 是我们内部消息实体 ID（与 OpenRouter generation id 不同）。

## 2. 请求侧 SSOT（推理控制、流式与 usage）

### 2.1 reasoning 参数（统一接口）
- 只使用 `reasoning` 对象，不使用 `include_reasoning`。
- 支持以下模式：
  - **默认**：不发送 `reasoning`（让模型按默认策略决定是否输出推理内容）
  - **启用（默认强度）**：`reasoning: { enabled: true }`
  - **控制强度（OpenAI 风格）**：`reasoning: { effort: "xhigh|high|medium|low|minimal|none" }`
  - **控制预算（Anthropic/Gemini 风格）**：`reasoning: { max_tokens: number }`
  - **仅内部推理、不返回**：`reasoning: { exclude: true, ... }`

#### 2.1.1 产品默认（UI 默认值）
- **协议层默认（auto/omit）**：若未指定 `reasoning`，可以省略该字段（完全不发送）。
- **产品层默认（UI）**：默认选择 **auto/omit**，即**不发送** `reasoning` 字段（避免默认付出推理成本/延迟）。
- **启用推理（产品默认档位）**：当用户选择“启用推理”时，默认档位为 **medium**（与 OpenRouter 的 `enabled: true` 默认 medium 对齐；产品侧用 `effort: "medium"` 表达，避免默认发送 `enabled: true`）。
- **显式禁用推理（用户选择）**：当用户选择“禁用推理”时，发送 `reasoning: { effort: "none" }`（与 auto/omit 区分：auto 代表“完全不发送该字段”）。

### 2.2 “禁用推理” 的唯一定义
- **禁用推理**：`reasoning.effort = "none"`（同时不允许出现 `max_tokens`）。
- **隐藏推理输出**：`reasoning.exclude = true`（模型仍可内部推理）。

### 2.3 流式开关与 usage（成本/原生 token）
- SSE：`stream: true`
- **启用 Usage Accounting（推荐的唯一方式）**：请求体携带 `usage: { include: true }`。
  - 非流：usage 直接随最终 JSON 返回。
  - 流式：usage 会出现在**最后一个 SSE JSON chunk**（紧邻 `data: [DONE]` 之前），且该 chunk 的 `choices` 通常为空数组。

> 备注：OpenRouter 将 usage accounting 描述为“内置使用量统计”，可返回成本、缓存、reasoning token 等细项；与 generation API 可并用。

### 2.4 generation 追溯（成本与原生 token）
- 响应的 `id` 视为 **generation id**，用于调用 `/api/v1/generation?id=...` 获取更精确统计。
- UI/日志必须记录：generation id、model、provider（若返回）、finish_reason 与 native_finish_reason。

### 2.5 tool calling（请求侧）
- 若产品支持 tool calling：**每次请求都必须携带 `tools`**（同一会话/同一工具集应保持一致），否则 streaming 中出现 `tool_calls` 时将无法形成稳定闭环。
- `tools` 的定义与执行不属于 UI；UI 仅展示 reducer/selectors 派生出的 `toolCalls`。

## 3. 响应侧 SSOT（解析、聚合、边界条件）

### 3.1 SSE 读取与容错原则
- **永远先识别注释行**：`:` 开头 → 产出 `StreamComment`，不得做 JSON parse。
- `data: [DONE]` → 产出 `StreamDone`。
- 任何 JSON parse 失败：视为协议异常，产出 `StreamError` 并终止当前流。

### 3.2 mid-stream error 的处理
- 若 chunk 顶层含 `error`：
  - 产出 `StreamError(errorObj, terminal=true)`
  - 同时保留已经写入的部分 assistant 内容（不要回滚）
  - UI 显示“部分输出 + 错误结束”，并允许重试

### 3.3 reasoning_details：解析、聚合、展示策略（流式 vs 非流式）

#### 3.3.1 解析位置（必须全覆盖）
- **流式**：`choices[].delta.reasoning_details`
- **非流**：`choices[].message.reasoning_details`

#### 3.3.2 结构化保真存储（必须原样）
- 将 `reasoning_details` 作为 **append-only 原始事件序列**保存：
  - **不得重排、不得修改、不得合并重写**（否则会破坏“在多轮/工具调用中回传 reasoning blocks”的连续性要求）。
  - `index` 仅作为信息字段保留；如需排序，仅允许在“UI 派生视图”中做稳定排序，底层原始序列不得改变。
- 对每个 detail：
  - 保留所有出现的键（至少包含 `type/id/format/index?` 与 `summary/text/data/signature` 等字段）。
  - UI 展示用文本可派生，但**原始对象必须可回放**。

#### 3.3.3 回传约束（工具调用/多轮保持连续性）
- 若启用“推理块回传”，则回传到下一轮 `messages[]` 的 `assistant` 消息中：
  - `reasoning_details` 必须与模型原始输出的连续序列一致，**不可裁剪/篡改/重排**。

### 3.4 “加密/隐藏/未返回” 的 UI 语义分离
- **encrypted**：出现 `type = reasoning.encrypted` → 视为“提供方加密或红acted”，UI 显示“加密/不可见（可选展示原始 data 作为调试）”。
- **excluded**：请求使用了 `reasoning.exclude = true` 且未返回任何 reasoning 内容 → UI 显示“已按请求隐藏”。
- **not returned**：未请求 exclude，但仍未返回 reasoning / reasoning_details → UI 显示“该模型/提供方未返回推理信息”。

> 不允许用“excluded 且为空”去推断“encrypted”。

### 3.5 finish_reason
- 内部保存两套：
  - `finish_reason`（normalized）
  - `native_finish_reason`（provider raw）
- 解析层不做业务推断，只透传。

### 3.6 usage chunk 的位置与处理
- 允许流末尾出现 `usage`，且 `choices` 为空。
- `UsageDelta` 事件不绑定到某条消息，而是绑定到“本次 generation”。

## 4. 分层架构（可维护性与分支树解耦）

### 4.1 四层结构（强制）
1) **Transport**：HTTP + AbortSignal；只负责拿到字节流。
2) **Decoder/Parser**：SSE line → JSON chunk → Domain Events（不读写 store）。
3) **Reducer**：消费 Domain Events，更新“对话状态”与“消息状态”。
4) **Persistence**：仅订阅 Reducer 输出的“脏状态快照”，定期落盘。

### 4.2 分支树的最低侵入实现
- 分支树只存在于 Reducer/Store 层。
- Parser 不知道“分支”；它只知道 messageId 与 generationId。
- Reducer 将一次 generation 的事件路由到：
  - 当前激活分支的“目标 assistant message”
  - 或者（可选）多分支并行时的指定 messageId

### 4.3 事件路由规则（避免涂抹式修改）
- 每次发送前，Reducer 先创建一个“空 assistant message”，拿到 `assistantMessageId`。
- Parser 产出的所有 `MessageDelta*` 都必须携带该 `assistantMessageId`。
- 任何“临时拼字符串写 store”都禁止，必须走 Reducer。

## 5. 存储模型（UI 展示 vs 上下文回传）

### 5.1 必须分开保存两类推理信息
- **UI 推理展示（Display）**：从 reasoning_details 计算得出，可丢弃重建。
- **原始推理块（Context Blocks）**：reasoning / reasoning_details 的原始结构化数据（可选保存，默认建议保存但提供清理开关）。

### 5.2 上下文回传策略（默认保守）
- 默认：下一轮请求只回传用户可见内容 + tool calls 结果；**不回传推理块**。
- 高级模式（显式开启）：允许将上一轮 reasoning（或一部分 reasoning_details）注入下一轮提示词/消息，但必须有：
  - 明确的“注入策略”配置
  - 明确的安全与隐私声明
  - 明确的 token 预算上限

## 6. UI 层实现指南（最小但可执行）

### 6.1 选择策略：先预留 UI 合同 + 做一条“薄的端到端切片”，不做大面积 UI 重写
- 不建议“完全不管 UI 直到全部底层完成”：流式、取消、中途错误、tool calling、多状态切换都属于 UI/交互密集区，晚集成会把风险集中到最后。
- 也不建议“一开始就追求完整 UI”：会诱发反复返工与范围膨胀。
- 推荐：**合同先行（UI 只依赖 Reducer 输出的稳定 ViewModel） + 最小端到端切片（vertical slice）**，确保数据流、状态机与关键边界条件在早期就跑通。

### 6.2 UI 合同（Reducer 输出的 ViewModel / Selectors）
UI 不得直接解析 OpenRouter JSON，只能消费 Reducer 的只读派生数据。
此外，Reasoning 展示必须拆轴：`visibility` 只表示“是否返回/可披露（shown/excluded/not_returned）”，`panelState` 只表示“UI 折叠/展开（collapsed/expanded）”，两者不得互相推断。

#### 6.2.1 Run 级 ViewModel
- `RunVM`
  - `runId`
  - `status`: `idle | requesting | streaming | tool_waiting | done | error | aborted`
  - `generationId`（provider generation id，可空）
  - `requestId`（可空）
  - `model`
  - `finishReason` / `nativeFinishReason`
  - `usage`（可空；流末尾填充）
  - `error`（可空）

#### 6.2.2 消息级 ViewModel
- `MessageVM`
  - `messageId`
  - `role`
  - `contentBlocks`（可增量更新）
  - `toolCalls`（可增量更新；不得在 UI 层解析 OpenRouter JSON）
    - `ToolCallVM[]`：`{ index: number, id?: string, type?: string, name?: string, argumentsText: string }`
  - `reasoningView`：`{ summaryText?, reasoningText?, hasEncrypted?, visibility: 'shown'|'excluded'|'not_returned', panelState: 'collapsed'|'expanded' }`
  - `streaming`: `{ isTarget: boolean, isComplete: boolean }`

#### 6.2.3 UI 选择器（Selectors）
- `selectTranscript(branchId) -> MessageVM[]`
- `selectRun(runId) -> RunVM`
- `selectMessage(messageId) -> MessageVM`

### 6.3 UI 组件建议（只做必要最小集）
- `ChatComposer`：输入 + 发送/中止按钮；仅依赖 `RunVM.status`。
- `ChatTranscript`：渲染当前分支线性祖先链（MessageVM 列表）。
- `MessageBubble`：渲染 contentBlocks（text/image）+ tool call 状态。
- `ReasoningPanel`：可折叠；渲染 `reasoningView`；支持三态：shown / excluded / not_returned；折叠/展开由 `reasoningView.panelState` 决定，且不得影响 visibility 判定。
- `StreamStatusBar`：展示 streaming 状态、错误、usage、generationId（调试开关可隐藏）。

### 6.4 交互流程（必须遵守）
1) 用户点击发送：
   - UI 调用 `dispatchSend({ branchId, text, config })`。
   - Reducer 立即创建 user 消息与空 assistant 占位消息，并把该 assistant 标记为本次 run 的 target。
2) streaming 过程中：
   - UI 只重渲染 `MessageVM.contentBlocks/toolCalls/reasoningView` 的增量变化。
3) mid-stream error：
   - 保留已生成内容；显示错误尾巴；提供“重试（fork/继续）”入口。
4) abort：
   - 标记 run 为 aborted；保留已生成内容；允许重新发送。

### 6.5 UI 层面必须覆盖的边界场景
- 注释行不会引发 UI 崩溃；最多影响“正在处理”提示。
- usage 可能只在流末尾出现，且不绑定到某条消息。
- reasoning 可能为空、excluded、encrypted、或模型不返回；UI 必须区分并给出可解释状态。
- tool calling：assistant 工具调用显示为结构化块；tool result 以 tool 消息渲染；续写后 transcript 连续。

### 6.6 UI 迁移护栏（避免新旧混合导致状态管理失控）
本轮重构在 UI 层必须遵守以下护栏；任何违反都视为失败（除非先写 ADR 并更新 SSOT）。

**6.6.1 不混用“有状态容器组件”**
- 允许共享：纯展示组件（presentational components）、样式/设计 token、无副作用的工具函数。
- 禁止共享：承载状态的容器组件（container components）、直接读写 store 的组件、直接绑定流式会话生命周期的组件。

**6.6.2 隔离运行域（Strangler/Facade 思路）**
- 新 Chat UI 必须挂载在一个明确的隔离入口：独立路由、独立根组件子树或明确的开关分流入口。
- 旧 UI 只允许“保持可用”与“修编译/安全”，不得新增功能；所有新能力只落在新 UI 子树。
- 切换点必须是单点：入口路由/根组件/Facade 选择器。

**6.6.3 数据所有权（Single-writer 原则）**
- 生成 run 状态（RunVM）与消息状态（MessageVM）只允许由新 Reducer 作为唯一写入者。
- 旧 UI 若需并存，只允许只读订阅（read-only）；不得对同一份对话数据做写入（避免双写竞态）。

**6.6.4 通过 UI Facade/Hook 暴露唯一接口**
- UI 与底层交互只能通过一组稳定的 Facade/Hook（例如 `useChatRun()` / `dispatchSend()` / `dispatchAbort()` / selectors）。
- UI 禁止直接 import 旧 store / 旧 service / 旧 parser。

**6.6.5 工程化强制（建议）**
- 用 ESLint/TS path rule 限制新 UI 目录不得引用 legacy 目录（例如 `no-restricted-imports`）。
- 临时开关必须有“删除时间点/条件”：当新 UI 通过 M3 集成验收即删除。

（备注：此护栏等价于在前端采用“渐进替换/门面分流”模式，避免在同一 UI 树内混合两套状态机与数据所有权。）

## 7. 测试与验收（最小但不可省）

### 6.1 Parser 测试
- 注释行 `: OPENROUTER PROCESSING` 不得触发 JSON parse。
- `[DONE]` 正确终止。
- mid-stream error：能识别顶层 `error`，并终止。
- reasoning_details：同时覆盖 `delta.reasoning_details` 与 `message.reasoning_details`。
- usage：流末尾 `usage` + 空 choices 的处理。

### 6.2 Reducer 测试
- 文本/工具/推理详情的增量拼接顺序稳定。
- encrypted vs excluded vs not returned 的 UI 语义判定。
- abort：本地中止后状态一致（保留已到达内容，标记 aborted）。

### 6.3 Live smoke（真实 OpenRouter 链路，可复现）
- Gate：`node scripts/gates/tc14-ui-live-smoke.mjs`
  - key 优先级：`--api-key` > `OPENROUTER_API_KEY` > `VITE_OPENROUTER_API_KEY`
  - 无 key：必须 `SKIP` 并提示如何提供 key
  - 有 key：最小请求 `/api/v1/chat/completions`（建议 stream=true），输出 generationId + done/error 摘要（不得回显 key）

### 6.4 工程卫生（防伪合规）
- Gate：`node scripts/gates/tc15-git-clean.mjs`（验收前必须 `git status` 干净）

---

## 附：实现约束清单（给 Agent 的硬约束）
- 不得在 Parser 层写入任何 store。
- 不得在 UI 层直接解析 OpenRouter JSON。
- 不得以“缺字段”推断“加密”；加密只能由 `reasoning.encrypted` 明确表征。
- 不得将分支树复杂度下沉到网络与解析层。
- 必须记录 generation id，并支持按 id 查询 `/generation`（即便当前 UI 不展示）。

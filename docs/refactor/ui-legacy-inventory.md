# 阶段 1（只读）：旧 UI 盘点与迁移地图（聊天相关）

> 本仓库当前 `HEAD` 已不包含 legacy UI（`src/components/*`、`src/stores/*`、`src/services/*` 等已在 TC-12 删除）。  
> 为满足“旧 UI 盘点”的证据要求，本文以 **最后一个仍包含旧 UI 的提交快照**为准进行只读盘点：`f7791286c6d76ea582e86083d0f5ac78de58f5d2`（下称 **legacy snapshot**）。  
> 证据形式：文件路径 + 行号片段（5–15 行）/或明确的搜索命中行号；并在每段证据标注该快照。

---

## 四个问题：直接答案（带落点）

1) **旧 UI 的聊天入口在哪里（路由/根组件/挂载点）？**  
无 router；由 `src/main.ts` 挂载 `src/App.vue`，`App.vue` 通过 `currentView === 'chat'` 渲染 `ChatTabs + TabbedChatView`，再由 `TabbedChatView` 创建多个 `ChatView` 实例。  
证据见：A-1 / A-2 / A-3。

2) **旧 UI 的发送链路入口在哪里（点击发送触发到哪一层）？**  
`IntegratedPromptBox` 的发送按钮 `@click="emit('send')"` → `ModernChatInput` 转发 `emit('send')` → `ChatView` 上 `@send="sendMessage"` → `useMessageSending.sendMessage()` → `aiChatService.streamChatResponse()` → `OpenRouterService.streamChatResponse()`（/chat/completions）。  
证据见：A-4 / A-5 / A-6 / A-7 / A-8。

3) **旧 UI 的“消息流式显示”在哪里拼接/更新（token/文本增量/占位消息/滚动）？**  
token/增量拼接在 `useMessageSending.processStreamChunk()`，通过 `branchStore.appendToken()` 更新；占位消息（notice）在 `useMessageSending` 创建与更新；滚动由 `ChatScrollContainer`（`useChatStickToBottom` 状态机）对外暴露 `onNewContent/scrollToBottom`，并由上层 composable 调用。  
证据见：A-9 / A-10 / A-11 / A-12。

4) **旧 UI 的“推理控制与推理显示”在哪里实现（exclude/effort/disabled、reasoning 面板、summary/详情）？**  
控制：`useReasoningControl.buildReasoningRequestOptions()`（effort/max_tokens + `exclude`）→ `ChatView` 将 `@toggle-reasoning/@select-reasoning-effort` 等事件写回 `conversationStore` 并把 `buildReasoningRequestOptions` 交给 `useMessageSending`；  
流与结构化数据：OpenRouter SSE 解析 `reasoning_details` 与 `delta.reasoning` → `useMessageSending.processStreamChunk()` 分发到 `branchStore.appendReasoningDetail/appendReasoningStreamingText/setReasoningSummary`；  
显示：`ChatMessageItem.vue` 的“推理细节区域”渲染加密占位/摘要/可折叠推理文本/详情列表（由 `useReasoningDisplay` 辅助）。  
证据见：A-13 / A-14 / A-15 / A-16 / A-17。

---

## A. 入口清单（带证据）

> 说明：A-1 ~ A-17 的代码证据均来自 **legacy snapshot**：`f7791286c6d76ea582e86083d0f5ac78de58f5d2`，路径形如 `src/...` 为该快照下的文件路径。

### A-1 `src/main.ts`（入口：挂载点）

- **用途**：入口（挂载点）
- **证据**（legacy snapshot：`f779128...`）
```ts
  44  const mountApplication = () => {
  45    console.log('正在挂载应用到 #app...')
  46    const rootInstance = app.mount('#app')
  47    rootInstance.$nextTick(async () => {
  48      console.log('✓✓✓ 应用挂载成功！✓✓✓')
```

### A-2 `src/App.vue`（入口：chat 视图根组件）

- **用途**：入口（chat 视图切换与根布局）
- **证据**（legacy snapshot：`f779128...`）
```vue
 125          <div v-if="currentView === 'chat'" class="flex flex-col flex-1 overflow-hidden">
 126            <!-- 标签栏 -->
 127            <ChatTabs />
 128
 129            <!-- 标签页内容 -->
 130            <TabbedChatView />
 131          </div>
```

### A-3 `src/components/TabbedChatView.vue`（入口：多实例 ChatView 容器）

- **用途**：入口（chat 的“多实例挂载点”）
- **证据**（legacy snapshot：`f779128...`）
```vue
 160          <ChatView
 161            v-for="conversationId in openConversationIds"
 162            :key="conversationId"
 163            :conversation-id="conversationId"
 170              opacity: conversationId === activeTabId ? 1 : 0,
 171              visibility: conversationId === activeTabId ? 'visible' : 'hidden',
 172              pointerEvents: conversationId === activeTabId ? 'auto' : 'none',
```

### A-4 `src/components/chat/input/IntegratedPromptBox.vue`（发送：点击入口）

- **用途**：发送（UI 点击触发）
- **证据**（legacy snapshot：`f779128...`）
```vue
 271          <!-- 发送按钮 -->
 272          <button
 276            :class="{ 'disabled': !canSend || sendDelayPending }"
 277            :disabled="!canSend || sendDelayPending"
 278            @click="emit('send')"
 279            title="发送消息"
```

### A-5 `src/components/chat/input/ModernChatInput.vue`（发送：事件转发层）

- **用途**：发送（转发 `send` 到父组件）
- **证据**（legacy snapshot：`f779128...`）
```ts
 201  const handleSend = () => {
 202    emit('send')
 203  }
```

### A-6 `src/components/ChatView.vue`（发送：容器层接线）

- **用途**：发送（把 UI `@send` 接到业务发送函数）
- **证据**（legacy snapshot：`f779128...`）
```vue
 960        <!-- 输入区 - 现代化胶囊输入栏（包含参数面板） -->
 961        <ModernChatInput
 986          @send="sendMessage"
 987          @stop="stopGeneration"
```

### A-7 `src/components/ChatView.vue`（发送：业务 composable 入口）

- **用途**：发送（初始化 `useMessageSending` 并导出 `sendMessage`）
- **证据**（legacy snapshot：`f779128...`）
```ts
 600  // ========== 消息发送 Composable 初始化 ==========
 601    const {
 606      performSendMessage: rawPerformSendMessage,
 607      sendMessage: rawSendMessage,
 610    } = useMessageSending({
 611    conversationId: toRef(() => props.conversationId),
 612    draftInput,
 617    chatScrollRef,
```

### A-8 `src/composables/useMessageSending.ts`（发送：发起流式请求）

- **用途**：发送（触发 provider 层流式请求）
- **证据**（legacy snapshot：`f779128...`）
```ts
 692        // 创建 AbortController
 693        const controller = new AbortController()
 694        abortController.value = controller
 696        // 发起流式请求（使用健壮的历史数据）
 697        const stream = aiChatService.streamChatResponse(
 698          appStore,
 699          finalHistoryForRequest,
 703            signal: controller.signal,
 708            legacyReasoning: coreOptions.requestOptions.reasoning,
```

### A-9 `src/composables/useMessageSending.ts`（流式：token/文本增量拼接）

- **用途**：流式（token 增量拼接/更新）
- **证据**（legacy snapshot：`f779128...`）
```ts
1184          })
1185          console.log('1️⃣8️⃣ Token 追加到 Store')
1186          branchStore.appendToken(conversationId, aiBranchId, textContent)
1187          console.log('[useMessageSending] ✅ appendToken 完成', {
1188            timestamp: Date.now()
1189          })
```

### A-10 `src/stores/branch.ts`（流式：token 写入落点）

- **用途**：流式（Store 层 append token）
- **证据**（legacy snapshot：`f779128...`）
```ts
 243    const appendToken = (
 244      conversationId: string,
 245      branchId: string,
 246      token: string
 247    ): void => {
 248      const tree = getTree(conversationId)
 249      appendTokenToBranch(tree, branchId, token)
 252      persistenceStore.markConversationDirty(conversationId)
```

### A-11 `src/composables/useMessageSending.ts`（流式：占位消息 notice）

- **用途**：流式（“等待流式回复”的占位消息创建/更新）
- **证据**（legacy snapshot：`f779128...`）
```ts
1547      const noticeMessageId = branchStore.addNoticeMessage(
1548        targetConversationId,
1549        delayMs > 0 ? `消息准备发送，倒计时 ${delaySec}s...` : '消息准备发送……'
1550      )
```
```ts
1006      })
1007
1008      branchStore.updateNoticeMessageText(ctx.conversationId, ctx.noticeMessageId, '消息已发送，等待流式回复……')
1009      // ⚠️ 保留 pendingSend.value 引用，以便 cancelSending 判断阶段和中止请求
```

### A-12 `src/components/chat/ChatScrollContainer.vue`（流式：滚动/Stick-to-bottom）

- **用途**：流式（滚动状态机与对外 API）
- **证据**（legacy snapshot：`f779128...`）
```ts
  48  const {
  49    scrollRef,
  53    scrollToBottom,
  54    onNewContent,
  58  } = useChatStickToBottom({
  59    lockCooldownMs: 800,
  60    nearBottomThreshold: 40,
  61  })
...
  67  defineExpose({
  68    /** 新内容到来时调用,由状态机决定是否滚动 */
  69    onNewContent,
  71    /** 强制滚到底部(仍受状态机约束) */
  72    scrollToBottom,
```

### A-13 `src/composables/useReasoningControl.ts`（推理控制：exclude/effort/max_tokens）

- **用途**：推理（控制：effort/max_tokens/exclude）
- **证据**（legacy snapshot：`f779128...`）
```ts
 391    function buildReasoningRequestOptions() {
 392      if (!isReasoningControlAvailable.value || !isReasoningEnabled.value) {
 393        return null
 394      }
...
 402      if (pref.mode === 'custom') {
 405          payload.max_tokens = Math.round(pref.maxTokens)
 409        payload.effort = pref.effort
 412      if (pref.visibility === 'hidden') {
 413        payload.exclude = true
 414      }
```

### A-14 `src/components/chat/input/ModernChatInput.vue`（推理控制：UI 事件出口）

- **用途**：推理（UI 事件：toggle/effort）
- **证据**（legacy snapshot：`f779128...`）
```ts
 262  const handleToggleReasoning = () => {
 263    emit('toggle-reasoning')
 264  }
...
 282  const handleSelectReasoningEffort = (effort: string) => {
 283    emit('select-reasoning-effort', effort)
 284  }
```

### A-15 `src/services/providers/openrouter/sseParser.ts`（推理：协议解析落点）

- **用途**：推理（SSE 解析：`reasoning_details` + `delta.reasoning`）
- **证据**（legacy snapshot：`f779128...`）
```ts
 449    const delta = primaryChoice.delta
 450    if (delta?.reasoning_details && Array.isArray(delta.reasoning_details)) {
 453          results.push({
 454            type: 'reasoning_detail',
 455            detail: {
...
 479    if (delta?.reasoning) {
 481        results.push({ type: 'reasoning_stream_text', text: delta.reasoning })
```

### A-16 `src/composables/useMessageSending.ts`（推理：chunk → Store 写入）

- **用途**：推理（将 `reasoning_detail` / `reasoning_stream_text` / `reasoning_summary` 写入 Store）
- **证据**（legacy snapshot：`f779128...`）
```ts
1216      // 推理详情（存储到历史）
1217      if (chunk.type === 'reasoning_detail' && chunk.detail) {
1219        branchStore.appendReasoningDetail(conversationId, aiBranchId, chunk.detail)
1220        return
1221      }
...
1225      if (chunk.type === 'reasoning_stream_text' && typeof chunk.text === 'string') {
1227        branchStore.appendReasoningStreamingText(conversationId, aiBranchId, chunk.text)
1228        return
1229      }
...
1231      if (chunk.type === 'reasoning_summary' && typeof chunk.summary === 'string') {
1234        branchStore.setReasoningSummary(conversationId, aiBranchId, chunk.summary)
```

### A-17 `src/components/chat/ChatMessageItem.vue`（推理显示：面板/摘要/占位/详情）

- **用途**：推理（显示：面板 + 摘要 + 加密/隐藏占位）
- **证据**（legacy snapshot：`f779128...`）
```vue
 510            <!-- 推理细节区域 -->
 512              v-if="role === 'assistant' && hasReasoningDisplayContent(metadata?.reasoning)"
...
 544                <!-- 加密/隐藏推理占位符 -->
 546                  v-if="isReasoningEncrypted(metadata?.reasoning)"
...
 560                <!-- 摘要文本 -->
 562                  v-else-if="metadata?.reasoning?.summary"
 566                    推理摘要
```

---

## B. 组件分类表（旧 UI，聊天相关）

> 判定依据：是否直接 import `stores/*` / `services/*` / 是否承载状态机与协议解析；以及是否为纯 props/emits 展示组件。  
> 证据关键词示例：`useConversationStore`, `aiChatService`, `streamChatResponse`, `stores/`, `services/`。
>
> 注意：本表中出现的 `src/...:行号` 均指 **legacy snapshot** 内的行号（不是当前 `HEAD`）。

| 组件（legacy snapshot 路径） | 分类 | 判定依据（含证据关键词/命中） |
|---|---|---|
| `src/App.vue` | container 必须重写 | 根布局+视图切换，依赖 store：`useAppStore`（`src/App.vue:8,22`） |
| `src/components/TabbedChatView.vue` | container 必须重写 | 直接读写多 store（`useConversationStore/useModelStore/...`）并管理多实例；证据片段：`import { useConversationStore } ...`（`src/components/TabbedChatView.vue` 顶部 imports） |
| `src/components/ChatView.vue` | container 必须重写 | 聚合发送/重试/滚动/推理等业务 composables + 多 store；证据片段：`useMessageSending`/`useConversationStore`（见 A-7 与 `src/components/ChatView.vue` imports） |
| `src/components/ConversationList.vue` | container 必须重写 | 对话列表与选择依赖会话 store：`useConversationStore`（`src/components/ConversationList.vue:76,109`） |
| `src/components/ChatTabs.vue` | container 必须重写 | Tab 状态管理依赖会话 store：`useConversationStore`（`src/components/ChatTabs.vue:3,6`） |
| `src/components/chat/ChatMessageItem.vue` | container 必须重写 | 明确声明“智能组件”，直接读 store（`useConversationStore`），并渲染推理区；证据片段：`import { useConversationStore }`（见该文件顶部 imports） |
| `src/components/chat/ChatScrollContainer.vue` | presentational 可复用 | 无 store/service 依赖，仅封装滚动状态机并 expose API；证据片段：仅 `useChatStickToBottom`（见 A-12） |
| `src/components/chat/input/ModernChatInput.vue` | presentational 可复用 | 不直接 import store/service，主要是 props/emits 事件路由与组合 UI；证据片段：imports 仅包含子组件与类型（见该文件顶部 imports） |
| `src/components/chat/input/IntegratedPromptBox.vue` | presentational 可复用 | 纯 UI + emits（发送按钮等），无 store/service；证据片段：发送按钮 `emit('send')`（见 A-4） |
| `archived-components/ChatInputArea.vue` | 可删除 | 已归档且不在 `src/` 活跃代码树中；证据关键词：`ChatInputArea`（`docs/features/MODERN_CHAT_INPUT_IMPLEMENTATION.md`、`docs/architecture/UNIFIED_GENERATION_ARCHITECTURE.md` 提示已归档） |

---

## C. 迁移映射（最重要）：旧 UI 行为 → 新体系落点 → 缺口

> 新体系指当前 `HEAD` 的 `ui-next/` + `next/state/`（Reducer + Selectors + OpenRouter SSOT 组件）。  
> 本节只关心外部语义（“用户看到什么/触发什么”），不解释历史原因。

### C-1 入口与挂载

| 旧 UI 行为 | 旧 UI 落点（证据） | 新体系落点（证据） | 缺口 |
|---|---|---|---|
| 应用启动后进入聊天 UI | `src/main.ts` 挂载 `#app`（A-1）+ `src/App.vue` 渲染 `TabbedChatView`（A-2） | `src/App.vue` 直接渲染 `AppChatNext`（`src/App.vue:2-8`） | 新体系目前无 ConversationList/TabbedChatView 的等价入口（仅单 run demo） |

### C-2 发送链路

| 旧 UI 行为 | 旧 UI 落点（证据） | 新体系落点（证据） | 缺口 |
|---|---|---|---|
| 点击发送按钮触发发送 | `IntegratedPromptBox.vue` `@click="emit('send')"`（A-4） | `ui-next`：`ChatNextComposer` `@send` → `AppChatNext.onSend()`（`src/ui-next/AppChatNext.vue:16-21,38-44`） | 新体系 composer 目前为 demo（scenario + 纯文本），未覆盖 attachments/sendDelay 等语义 |
| send 事件向上到业务层 | `ModernChatInput.handleSend → emit('send')`（A-5）+ `ChatView @send="sendMessage"`（A-6） | `useChatRun.dispatchSend()`（`src/ui-next/useChatRun.ts:46-92`） | `dispatchSend` 当前只回放 fixture（`replayOpenRouterSSEFixtureAsEvents`），未接入真实网络/Provider |
| 发起流式请求 | `useMessageSending` 调 `aiChatService.streamChatResponse`（A-8） | 预期：`next/transport/openrouterFetch.ts` 负责网络 + `next/openrouter/sse/decoder.ts` 解码 + `mapChunkToEvents.ts` 产出 DomainEvent | 缺口：当前 `useChatRun` 未调用 `openrouterFetch`/decoder（仅 fixture） |

### C-3 流式显示（增量/占位/滚动）

| 旧 UI 行为 | 旧 UI 落点（证据） | 新体系落点（证据） | 缺口 |
|---|---|---|---|
| 创建 assistant 占位消息并开始流式 | legacy：发送流程创建 notice + assistant branch（A-11） | `next/state/startGeneration()` 创建 assistant 空消息（`src/next/state/reducer.ts:49-97`） | 新体系缺少 notice message（“发送中/等待首 token/延时发送”等 UI 语义） |
| 文本 token 增量追加 | `processStreamChunk → branchStore.appendToken`（A-9） | `applyEvent('MessageDeltaText')` 追加到 `contentText`（`src/next/state/reducer.ts:154-167`） | 新体系缺少 image/多模态内容块的增量事件与 reducer 支持（旧 UI 有 image chunk） |
| 滚动 stick-to-bottom | `ChatScrollContainer` + `useChatStickToBottom`（A-12） | 当前 `ChatNextTranscript` 仅 `overflow-auto`（`src/ui-next/components/ChatNextTranscript.vue:9-17`） | 缺口：新体系未实现“新消息自动滚动/用户滚动锁定/回到底部按钮”等语义 |

### C-4 推理控制与推理显示（exclude/effort/disabled/面板/summary/详情）

| 旧 UI 行为 | 旧 UI 落点（证据） | 新体系落点（证据） | 缺口 |
|---|---|---|---|
| 构造 reasoning 请求参数（effort/max_tokens/exclude） | `useReasoningControl.buildReasoningRequestOptions()`（A-13） | `next/openrouter/buildRequest.ts`（`buildOpenRouterChatCompletionsRequest` 支持 `reasoning.effort/max_tokens/exclude`） | 缺口：`ui-next` 暂无 effort/max_tokens UI；也未把 UI 选择接到 request builder |
| “reasoning.exclude=true” 的 UI 语义分离（excluded vs not_returned） | legacy：`visibility === 'hidden' → exclude=true`（A-13）+ UI 占位（A-17） | `selectors.computeReasoningVisibility()` 使用 `requestedReasoningExclude` 区分（`src/next/state/selectors.ts:29-42`） | 缺口：需要把“请求时是否 exclude”写入 `StartGenerationInput.reasoningExclude`（demo 已做，真实链路待接入） |
| 结构化 reasoning_details 进入展示/回传 | legacy：SSE 解析 `reasoning_details`（A-15）→ `appendReasoningDetail`（A-16）→ UI 展示（A-17） | `mapChunkToEvents.ts` 仅映射 `reasoning_details` 为 `MessageDeltaReasoningDetail`（`src/next/openrouter/mapChunkToEvents.ts:78-113`）→ `applyEvent` 追加 `reasoningDetailsRaw`（`src/next/state/reducer.ts:175-180`）→ `selectMessage` 派生 summary/reasoningText（`src/next/state/selectors.ts:45-79`） | 缺口：需要把 details 显示组件化（当前 `ChatNextReasoningPanel` 只是 demo） |
| 推理文本流（delta.reasoning）实时展示 | legacy：解析 `delta.reasoning → reasoning_stream_text`（A-15）→ `appendReasoningStreamingText`（A-16）→ UI 可折叠文本（A-17） | 当前 `mapChunkToEvents.ts` **未映射** `delta.reasoning`/`reasoning_content`（见该文件仅处理 `reasoning_details`） | 缺口：新体系需要新增事件（例如 `MessageDeltaReasoningText`）+ reducer 字段写入（`reasoningStreamingText`）+ UI 展示策略 |

---

## D. 替换顺序建议（仅 7 步，最短路径）

1) `ChatNextMessageBubble` 对齐旧 `ChatMessageItem` 的“消息文本+流式态”外观语义（不接旧 store）。  
2) 给 `ChatNextTranscript` 增加 stick-to-bottom（对齐 `ChatScrollContainer` 语义）。  
3) 固化 `ChatNextReasoningPanel`：对齐旧“加密占位/摘要/可折叠推理文本/详情列表”的展示语义。  
4) 固化 `ChatNextStatusBar`：对齐旧“requesting/streaming/done/error/aborted”的状态与 Abort。  
5) 扩展 `ChatNextComposer`：覆盖 reasoning exclude/effort（仅 UI+事件，不接旧 store）。  
6) `useChatRun` 从 fixture 切换到真实链路：`openrouterFetch` + `decoder` + `mapChunkToEvents` → `applyEvent`。  
7) 入口切换：用新 `ui-next` 骨架替换旧 `App.vue/TabbedChatView/ChatView`（删除 legacy 容器）。

---

## 我使用过的核心搜索关键词/命令（5–10 条）

> 仅列命令/关键词，不贴完整输出。

1) `rg -n "ui-next|next-state|AppChatNext" src`  
2) `git grep -n "emit('send" f7791286c6d76ea582e86083d0f5ac78de58f5d2 -- src/components`  
3) `git show f7791286c6d76ea582e86083d0f5ac78de58f5d2:src/components/ChatView.vue | rg -n "@send|useMessageSending"`  
4) `git show f7791286c6d76ea582e86083d0f5ac78de58f5d2:src/composables/useMessageSending.ts | rg -n "processStreamChunk|appendToken|reasoning_"`  
5) `git show f7791286c6d76ea582e86083d0f5ac78de58f5d2:src/services/providers/openrouter/sseParser.ts | rg -n "reasoning_details|delta\\.reasoning"`  
6) `Get-Content src/next/state/reducer.ts | Select-String "startGeneration|MessageDeltaText"`  
7) `Get-Content src/next/state/selectors.ts | Select-String "computeReasoningVisibility"`  
8) `Get-Content src/ui-next/useChatRun.ts | Select-String "dispatchSend|dispatchAbort"`  

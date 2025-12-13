# OpenRouter 推理控制与 reasoning_details 现状分析报告

> **文档类型**：现状审计报告（Code-Evidence Based）  
> **审计日期**：2025年12月13日  
> **审计范围**：OpenRouter 推理控制参数、SSE 流式回复、reasoning_details 解析/存储/回传  
> **证据标准**：每条结论提供文件路径+函数名+代码片段，未发现项提供检索命令与0命中说明

---

## 执行摘要（Executive Summary）

本次审计针对 Starverse 项目中 OpenRouter 提供商的推理功能实现进行全面代码审查，**重点验证与官方文档声明的一致性**。

### 关键发现

✅ **已实现且运行正常**：
- OpenRouter `/chat/completions` 端点的流式与非流式调用
- SSE (Server-Sent Events) 完整解析链路，包括 comment 行忽略、[DONE] 识别、mid-stream error 处理
- `delta.reasoning_details` 的流式解析、去重聚合与 metadata 输出
- 推理参数适配器（`reasoning.exclude` + legacy `include_reasoning`）
- SQLite 持久化与 IPC 跨进程数据清洗
- Electron 主进程 CORS 绕过与流式转发

⚠️ **关键差异与风险**：
- **reasoning_details 未回传到下一轮请求**：虽然代码注释强调"用于回传保持连续性"，但 `HistoryMessage` 类型不含 `metadata` 字段，`convertMessagesToOpenRouterFormat` 不会把上一轮的 `reasoning_details` 塞回 `messages[]`。
- **非流式 `message.reasoning_details` 未解析**：parser 仅处理 `delta.reasoning_details`，未见 `choices[].message.reasoning_details` 读取逻辑。
- **/responses API 未接入**：全仓检索显示该端点未在生产代码中调用。
- **/parameters 旧端点已明确禁用**：注释写明"已移除，统一走 `/models` + `AppModel.capabilities`"。

---

## A. 端点与网络拓扑

### A.1 Base URL 配置

**默认常量**：
```typescript
// src/services/providers/OpenRouterService.ts:32
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
```

**UI 可配置**：
```vue
<!-- src/components/SettingsView.vue:40-56 -->
const openRouterBaseUrl = computed({
  get: () => store.openRouterBaseUrl,
  set: (value: string) => {
    store.openRouterBaseUrl = value
  }
})
```

### A.2 实际调用端点（有证据）

#### Chat Completions（主端点）
```typescript
// src/services/providers/OpenRouterService.ts:297-356
async function* streamChatResponseNew(...) {
  const url = `${baseUrl}/chat/completions`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
      'X-Title': 'Starverse'
    },
    body: JSON.stringify(requestBody),
    signal
  })
}
```

**请求体构造**：
```typescript
// src/services/providers/OpenRouterService.ts:305-333
const requestBody = {
  model: modelName,
  messages,
  ...adapterResult.requestBodyFragment,  // 包含 reasoning/sampling 等
  usage: { include: true },
  stream: isStreaming
}
```

#### Models（模型列表）
```typescript
// src/services/providers/OpenRouterService.ts:579-620
listAvailableModels: async (apiKey: string, baseUrl: string | null) => {
  const url = `${baseUrl || OPENROUTER_BASE_URL}/models`
  const response = await fetch(url, { method: 'GET', ... })
  const data = await response.json()
  return rows.map(m => m.id).filter(id => !!id)
}
```

### A.3 未发现的端点

#### /responses（Responses API）

**检索命令**：
```bash
# 在 src/** 与 electron/** 范围内检索
grep -r "\/responses" src/ electron/
grep -r '"responses"' src/ electron/
grep -r 'openrouter.*responses' src/ electron/
```

**检索结果**：0 命中（仅在 `node_modules` 与文档链接中出现）

**结论**：当前实现链路以 `/chat/completions` 为主，未见 `/responses` 接入点。

#### /parameters（已明确移除）

**代码证据**：
```typescript
// src/services/providers/OpenRouterService.ts:633
// getModelParameters 已被移除：禁止调用旧 /api/v1/parameters 或 /parameters/* 旧链路，统一走 syncFromOpenRouter() + AppModel.capabilities
```

```typescript
// src/stores/model.ts:7
/**
 * - 单一数据源：只从 /api/v1/models 同步，不调用 /parameters
 */
```

---

## B. 请求体构造与推理参数适配

### B.1 消息数组构造

**历史消息转换**：
```typescript
// src/services/providers/OpenRouterService.ts:143-210
function convertMessagesToOpenRouterFormat(history: HistoryMessage[]): any[] {
  return (history || []).map(msg => {
    const role = msg.role
    let contentBlocks: any[] = []
    
    if (msg.parts && Array.isArray(msg.parts)) {
      contentBlocks = msg.parts.map(part => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text || '' }
        }
        if (part.type === 'image_url') {
          return { type: 'image_url', image_url: { url: part.image_url.url, detail: 'auto' } }
        }
        // ...
      }).filter(Boolean)
    }
    
    const baseMessage: any = { role, content: contentBlocks }
    
    // Note: reasoning_details 需要从其他途径获取（如 metadata）
    // HistoryMessage 接口暂不包含 metadata 字段
    
    return baseMessage
  })
}
```

⚠️ **关键注释**：代码明确说明"reasoning_details 需要从其他途径获取"，但实际未实现该"其他途径"。

**HistoryMessage 类型限制**：
```typescript
// src/types/providers.ts:20-33
export interface HistoryMessage {
  /** 角色：用户或模型 */
  role: 'user' | 'model'
  /** 多模态内容部分数组 */
  parts: MessagePart[]
}
```

**结论**：当前类型定义不支持 `metadata` / `tool_calls` / `reasoning_details` 字段。

### B.2 推理参数适配链

**统一适配入口**：
```typescript
// src/services/providers/generationAdapter.ts:65-121
export function buildOpenRouterRequest(options: {
  modelId: string
  capability: ModelGenerationCapability
  effectiveConfig: GenerationConfig
  messages: any[]
  strategy?: StarverseReasoningStrategy
}): GenerationAdapterResult {
  const requestBodyFragment: Record<string, any> = {}
  
  // 应用推理配置
  if (effectiveConfig.reasoning) {
    const resolvedReasoning = resolveReasoningConfig(effectiveConfig.reasoning)
    const reasoningResult = buildReasoningPayload(
      capability.reasoning,
      resolvedReasoning,
      strategy,
    )
    
    if (reasoningResult.payload.reasoning) {
      requestBodyFragment.reasoning = reasoningResult.payload.reasoning
    }
    if (reasoningResult.payload.include_reasoning !== undefined) {
      requestBodyFragment.include_reasoning = reasoningResult.payload.include_reasoning
    }
  }
  
  return { requestBodyFragment, warnings, ignoredParameters }
}
```

**推理 payload 构造**：
```typescript
// src/services/providers/openrouterReasoningAdapter.ts:58-113
export function buildReasoningPayload(
  capability: ModelReasoningCapability | null,
  config: ReasoningResolvedConfig,
  strategy: StarverseReasoningStrategy = DEFAULT_STARVERSE_STRATEGY,
): ReasoningAdapterResult {
  const payload: ReasoningPayload = {}
  const reasoning: NonNullable<ReasoningPayload['reasoning']> = {}
  payload.reasoning = reasoning
  
  // 可见性设置
  reasoning.exclude = !config.showReasoningContent
  
  if (capability.supportsIncludeReasoning) {
    payload.include_reasoning = config.showReasoningContent
  }
  
  // 控制模式分支
  switch (config.controlMode) {
    case 'disabled':
      reasoning.effort = 'none'
      payload.include_reasoning = false
      reasoning.exclude = true
      break
    case 'effort':
      reasoning.effort = config.effort ?? 'medium'
      break
    case 'max_tokens':
      // Anthropic/Gemini/等策略分支...
      break
  }
}
```

**UI 开关到配置的映射**：
```vue
<!-- src/components/SettingsView.vue:73-111 -->
// OpenRouter: 是否返回推理详情（reasoning_details）
// 说明：OpenRouter 不区分"详情/内容"，此开关实际映射到 reasoning.showReasoningContent
// -> include_reasoning + reasoning.exclude
const openRouterReturnReasoningDetails = ref<boolean>(false)

const saveOpenRouterReturnReasoningDetails = async () => {
  await generationConfigManager.setGlobalConfig({
    reasoning: {
      showReasoningContent: openRouterReturnReasoningDetails.value,
    },
  })
}
```

### B.3 取消/中止机制

**AbortController 注入网络层**：
```typescript
// src/services/providers/OpenRouterService.ts:334-356
const response = await fetch(url, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify(requestBody),
  signal  // ← AbortSignal 传入
})
```

**发送侧创建**：
```typescript
// src/composables/useMessageSending.ts:657-707
const controller = new AbortController()
abortController.value = controller

const stream = aiChatService.streamChatResponse(
  appStore,
  finalHistoryForRequest,
  resolveModelId.value,
  userMessageText,
  {
    signal: controller.signal,
    // ...
  }
)
```

---

## C. SSE 流式读取与解析

### C.1 网络层实现（ReadableStream）

```typescript
// src/services/providers/OpenRouterService.ts:410-470
if (!response.body) {
  throw new Error('Response body is null')
}

const reader = response.body.getReader()
const decoder = new TextDecoder('utf-8')
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  
  buffer += decoder.decode(value, { stream: true })
  
  // 按行拆分（SSE 格式）
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''  // 保留最后一个不完整的行
  
  for (const line of lines) {
    if (!line.trim()) continue
    
    const parseResult = parseSSELine(line)
    
    if (parseResult.error) {
      console.warn('[OpenRouterService] ⚠️ SSE 解析错误:', parseResult.error.message)
      continue
    }
    
    if (parseResult.isDone) break
    
    // 优先处理 chunks（多块同行）
    const streamChunks = parseResult.chunks
      ? parseResult.chunks
      : (parseResult.chunk ? [parseResult.chunk] : [])
    
    for (const chunk of streamChunks) {
      aggregator.processChunk(enrichedChunk)
      // yield 增量输出...
    }
  }
}
```

### C.2 SSE 解析器（纯函数）

**Comment 行忽略**：
```typescript
// src/services/providers/openrouter/sseParser.ts:300-309
export function parseSSELine(line: string): SSEParseResult {
  const trimmed = line.trim()
  
  // 空行或注释行
  if (!trimmed || trimmed.startsWith(':')) {
    return { chunk: null, isDone: false }
  }
  
  // ...
}
```

**单元测试覆盖**：
```typescript
// tests/unit/services/sseParser.test.ts:76-82
it('应忽略注释行', () => {
  const result = parseSSELine(': This is a comment')
  expect(result.chunk).toBeNull()
  expect(result.isDone).toBe(false)
})
```

**[DONE] 识别**：
```typescript
// src/services/providers/openrouter/sseParser.ts:320-329
// [DONE] 标记
if (jsonStr === '[DONE]') {
  return { chunk: null, isDone: true }
}
```

**多块同行处理**：
```typescript
// src/services/providers/openrouter/sseParser.ts:333-340
const chunks = parseOpenRouterChunk(rawChunk)

// 同一条 data 行可能包含多种信息（usage + content / reasoning_details + content）。
// 为保持旧接口兼容：单 chunk 只填 chunk；多 chunk 额外提供 chunks。
if (chunks.length <= 1) {
  return { chunk: chunks[0] || null, isDone: false }
}

return { chunk: chunks[0] || null, chunks, isDone: false }
```

### C.3 mid-stream error 处理

**三层错误检测**：
```typescript
// src/services/providers/openrouter/sseParser.ts:366-428
export function parseOpenRouterChunk(rawChunk: OpenRouterSSEChunk): StreamChunk[] {
  // 1. 顶层 error
  if (rawChunk.error) {
    results.push({
      type: 'error',
      error: {
        message: rawChunk.error.message || 'OpenRouter 流式响应错误',
        code: rawChunk.error.code || 'StreamError',
        details: rawChunk.error
      }
    })
    return results
  }
  
  const primaryChoice = rawChunk.choices?.[0]
  
  // 2. choices[0].error
  if (primaryChoice.error) {
    results.push({ type: 'error', error: { ... } })
    return results
  }
  
  // 3. delta.error
  if (primaryChoice.delta?.error) {
    results.push({ type: 'error', error: { ... } })
    return results
  }
  
  // 4. finish_reason === 'error'
  if (primaryChoice.finish_reason === 'error') {
    results.push({
      type: 'error',
      error: {
        message: 'OpenRouter 流式响应错误',
        code: 'FinishReasonError',
        details: primaryChoice.error || primaryChoice.delta?.error || primaryChoice
      }
    })
    return results
  }
}
```

**Service 层抛出异常**：
```typescript
// src/services/providers/OpenRouterService.ts:539-545
else if (enrichedChunk.type === 'error') {
  // 错误处理：抛出异常（与旧实现一致）
  throw new Error(enrichedChunk.error.message || 'Stream error')
}
```

---

## D. reasoning_details 解析与聚合

### D.1 流式解析入口

**delta.reasoning_details 处理**：
```typescript
// src/services/providers/openrouter/sseParser.ts:444-472
const delta = primaryChoice.delta
if (delta?.reasoning_details && Array.isArray(delta.reasoning_details)) {
  for (const detail of delta.reasoning_details) {
    if (detail && typeof detail === 'object') {
      results.push({
        type: 'reasoning_detail',
        detail: {
          id: detail.id ?? null,
          type: detail.type || 'unknown',
          text: detail.text || '',
          summary: detail.summary || '',
          data: detail.data || '',
          format: detail.format || '',
          index: typeof detail.index === 'number' ? detail.index : undefined
        }
      })
    }
  }
}
```

**注释强调**：
```typescript
// src/services/providers/openrouter/sseParser.ts:444-449
// 3. 推理详情（reasoning_details）- 结构化数据，用于回传模型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 作用：保存到消息历史，下次请求时原样回传给模型，保持思考连续性
// 特别重要：工具调用/多轮对话场景必须回传，否则思考链会断裂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

⚠️ **注意**：注释强调"必须回传"，但实际回传链路缺失（见 E 部分）。

### D.2 非流式（message.reasoning_details）现状

**类型定义限制**：
```typescript
// src/services/providers/openrouter/sseParser.ts:58-75
message?: {
  content?: string | ContentBlock[]
}
```

**结论**：当前 `message` 类型仅含 `content`，未定义 `reasoning_details` 字段。

**检索验证**：
```bash
# 在 src/services/providers/openrouter/** 范围内检索
grep -r 'message\.reasoning_details' src/services/providers/openrouter/
grep -r 'message\?\.reasoning_details' src/services/providers/openrouter/
```

**结果**：0 命中（仅 `delta.reasoning_details` 有处理逻辑）

### D.3 聚合器（去重与 metadata 输出）

**reasoning_detail 去重逻辑**：
```typescript
// src/services/providers/openrouter/responseAggregator.ts:152-188
case 'reasoning_detail':
  // 去重：使用 id 或内容指纹
  const detail = chunk.detail
  const detailId = detail.id || this.createDetailFingerprint(detail)
  
  if (!this.reasoningDetailIds.has(detailId)) {
    this.reasoningDetailIds.add(detailId)
    this.reasoningDetails.push(detail)
    this.hasReceivedReasoning = true
  }
  break
```

**metadata 构造**：
```typescript
// src/services/providers/openrouter/responseAggregator.ts:319-373
private buildMetadata(): MessageMetadata {
  const metadata: MessageMetadata = {
    provider: this.config.provider,
    model: this.config.modelId
  }
  
  if (this.hasReceivedReasoning) {
    const reasoningVisibility = this.resolveReasoningVisibility()
    
    if (reasoningVisibility !== 'off') {
      metadata.reasoning = {
        summary: this.reasoningSummary || this.generateAutoSummary(),
        details: this.reasoningDetails.map(detail => ({
          type: detail.type,
          content: detail.text || detail.summary
        }))
      }
    }
  }
  
  return metadata
}
```

### D.4 展示策略（encrypted 占位符）

**判断逻辑**：
```typescript
// src/composables/chat/useReasoningDisplay.ts:332-360
export const isReasoningEncrypted = (reasoning?: MessageReasoningMetadata | null): boolean => {
  if (!reasoning || !reasoning.excluded) {
    return false
  }
  
  // 如果有实际内容，则不认为是加密的
  const hasActualContent = Boolean(
    getReasoningStreamText(reasoning) ||
    getReasoningDetailsForDisplay(reasoning).length > 0
  )
  
  return !hasActualContent
}
```

**UI 占位符**：
```vue
<!-- src/components/chat/ChatMessageItem.vue:544-575 -->
<div
  v-if="isReasoningEncrypted(metadata?.reasoning)"
  class="mx-3 mb-3 bg-gray-100 border border-gray-200 rounded-md p-3 text-center"
>
  <div class="flex items-center justify-center gap-2 text-gray-500">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
    <span class="font-mono text-xs">[REDACTED: 推理过程已加密]</span>
  </div>
  <p class="mt-1 text-[10px] text-gray-400">
    此消息使用了推理功能，但配置为不返回推理内容
  </p>
</div>
```

**结论**：并非识别 `detail.format === 'encrypted'`，而是基于 `excluded=true` + 无内容推断。

---

## E. 存储与回传（关键差异点）

### E.1 SQLite Schema

```sql
-- infra/db/schema.sql:34-43
CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system', 'notice', 'openrouter')),
  created_at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  meta TEXT,  -- ← JSON 存储 metadata
  UNIQUE (convo_id, seq)
);
```

### E.2 metadata 清洗与写入

**Sanitizer 清理 usage.raw**：
```javascript
// src/utils/ipcSanitizer.js:126-187
export function sanitizeMessageMetadata(metadata) {
  if (metadata == null) {
    return undefined
  }
  
  const cleaned = sanitizeForIpc(metadata)
  
  if (cleaned.usage && typeof cleaned.usage === 'object') {
    delete cleaned.usage.raw  // ← 删除原始数据
    
    if (cleaned.usage.cost_details && typeof cleaned.usage.cost_details === 'object') {
      const sanitizedCostDetails = sanitizeForIpc(cleaned.usage.cost_details)
      if (sanitizedCostDetails && typeof sanitizedCostDetails === 'object') {
        cleaned.usage.cost_details = sanitizedCostDetails
      } else {
        delete cleaned.usage.cost_details
      }
    }
  }
  
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}
```

**Repository 写入**：
```typescript
// infra/db/repo/messageRepo.ts:169-210
private insertMessageRecord(input: AppendMessageInput): MessageRecord {
  this.insertStmt.run({
    id,
    convoId: input.convoId,
    role: input.role,
    createdAt: now,
    seq,
    meta: input.meta ? JSON.stringify(input.meta) : null  // ← JSON 序列化
  })
  
  // ...
}
```

### E.3 持久化时机

**脏标记机制**：
```typescript
// src/stores/branch.ts:430-452
const setReasoningSummary = (
  conversationId: string,
  branchId: string,
  summaryData: string | { ... }
): void => {
  const tree = getTree(conversationId)
  if (typeof summaryData === 'string') {
    setReasoningSummaryForBranch(tree, branchId, { summary: summaryData })
  } else {
    setReasoningSummaryForBranch(tree, branchId, summaryData)
  }
  
  const conversation = conversationStore.getConversationById(conversationId)
  if (conversation) {
    conversation.updatedAt = Date.now()
  }
  
  // 标记对话为脏状态，触发持久化保存
  persistenceStore.markConversationDirty(conversationId)
}
```

**3 秒自动保存**：
```typescript
// src/stores/persistence.ts:23-24
const AUTO_SAVE_INTERVAL = 3000 // 3秒

// src/stores/persistence.ts:269-292
const startAutoSave = () => {
  if (autoSaveTimer) return
  
  console.log('🔄 [PersistenceStore] 自动保存机制已启动，间隔:', AUTO_SAVE_INTERVAL, 'ms')
  
  autoSaveTimer = setInterval(async () => {
    const dirtyCount = dirtyConversationIds.value.size
    if (dirtyCount > 0) {
      console.log(`💾 [PersistenceStore] 自动保存触发，脏数据数量: ${dirtyCount}`)
      await saveAllDirtyConversations()
    }
  }, AUTO_SAVE_INTERVAL)
}
```

### E.4 回传链路现状（关键差异）

**HistoryMessage 类型限制**：
```typescript
// src/types/providers.ts:20-33
export interface HistoryMessage {
  /** 角色：用户或模型 */
  role: 'user' | 'model'
  /** 多模态内容部分数组 */
  parts: MessagePart[]
}
```

**convertMessagesToOpenRouterFormat 的注释**：
```typescript
// src/services/providers/OpenRouterService.ts:202-210
const baseMessage: any = {
  role,
  content: contentBlocks
}

// Note: reasoning_details 需要从其他途径获取（如 metadata）
// HistoryMessage 接口暂不包含 metadata 字段

return baseMessage
```

**发送侧历史构建**：
```typescript
// src/composables/useMessageSending.ts:657-707
const finalHistoryForRequest = getSafeHistoryForRequest(
  cleanHistorySnapshot,
  userBranchId,
  aiBranchId
)

// 发起流式请求（使用健壮的历史数据）
const stream = aiChatService.streamChatResponse(
  appStore,
  finalHistoryForRequest,  // ← DisplayMessage[]，含 metadata
  resolveModelId.value,
  userMessageText,
  { ... }
)
```

**DisplayMessage 到 HistoryMessage 的转换丢失 metadata**：
```typescript
// src/stores/branch.ts:464-521
const _buildMessageHistoryForAPI = (conversationId: string): DisplayMessage[] => {
  const tree = getTree(conversationId)
  const pathMessages = getCurrentPathMessages(tree)
  
  return pathMessages
    .filter((pm): pm is NonNullable<typeof pm> => pm !== null)
    .map((pm) => {
      const branch = tree.branches.get(pm.branchId)
      // ...
      
      return {
        id: pm.versionId,
        branchId: pm.branchId,
        versionIndex,
        role: pm.role,
        parts: pm.parts,
        timestamp: pm.timestamp,
        // ...
        metadata: pm.metadata,  // ← DisplayMessage 有 metadata
        // ...
      }
    })
}
```

但最终 `convertMessagesToOpenRouterFormat` 只取 `role` 与 `parts`：
```typescript
// src/services/providers/OpenRouterService.ts:143-210
function convertMessagesToOpenRouterFormat(history: HistoryMessage[]): any[] {
  return (history || []).map(msg => {
    const role = msg.role
    // ...
    const baseMessage: any = { role, content: contentBlocks }
    // ← 没有 reasoning_details / tool_calls 注入
    return baseMessage
  })
}
```

**结论**：
- ✅ 前端确实保存了 `metadata.reasoning.details` 到分支树
- ✅ SQLite 持久化也包含 metadata
- ❌ 但构建下一次请求的 `messages[]` 时，**不会**把 `reasoning_details` 塞回去
- ❌ 因此"tool calling 连续性"/"思考连续性"依赖回传的场景会失效

---

## F. Electron 主进程桥接

### F.1 Preload 暴露 API

```typescript
// electron/preload.ts:74-132
contextBridge.exposeInMainWorld('openRouterBridge', {
  listModels: (request?: { apiKey?: string; baseUrl?: string }) => 
    ipcRenderer.invoke('openrouter:list-models', request || {}),
  
  startStreamChat: (request: { ... }) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    ipcRenderer.invoke('openrouter:stream-chat', { requestId, ...request })
    return requestId
  },
  
  onStreamChunk: (requestId: string, callback: (chunk: any) => void) => {
    ipcRenderer.on(`openrouter:chunk:${requestId}`, (_, chunk) => callback(chunk))
  },
  
  onStreamEnd: (requestId: string, callback: () => void) => {
    ipcRenderer.on(`openrouter:end:${requestId}`, () => callback())
  },
  
  onStreamError: (requestId: string, callback: (error: any) => void) => {
    ipcRenderer.on(`openrouter:error:${requestId}`, (_, error) => callback(error))
  },
  
  cleanupStream: (requestId: string) => {
    ipcRenderer.removeAllListeners(`openrouter:chunk:${requestId}`)
    ipcRenderer.removeAllListeners(`openrouter:end:${requestId}`)
    ipcRenderer.removeAllListeners(`openrouter:error:${requestId}`)
  },
  
  abort: (requestId: string) => 
    ipcRenderer.invoke('openrouter:abort', requestId)
})
```

### F.2 主进程 IPC Handler

```typescript
// electron/ipc/openRouterBridge.ts:10-126
type ActiveStream = {
  controller: AbortController
  sender: WebContents
}

const activeStreams = new Map<string, ActiveStream>()

export const registerOpenRouterBridge = () => {
  ipcMain.handle('openrouter:stream-chat', (event, payload: { ... }) => {
    const { requestId, apiKey, baseUrl, history, model, userMessage, options } = payload
    
    const controller = new AbortController()
    activeStreams.set(requestId, { controller, sender: event.sender })
    
    const startStreaming = async () => {
      try {
        const stream = OpenRouterService.streamChatResponse(
          apiKey || '',
          history,
          model,
          userMessage,
          baseUrl || null,
          {
            ...options,
            signal: controller.signal  // ← 注入 AbortSignal
          }
        )
        
        for await (const chunk of stream) {
          safeSend(event.sender, `openrouter:chunk:${requestId}`, chunk)
        }
        
        safeSend(event.sender, `openrouter:end:${requestId}`)
      } catch (error) {
        safeSend(event.sender, `openrouter:error:${requestId}`, serializeError(error))
      } finally {
        activeStreams.delete(requestId)
      }
    }
    
    startStreaming()
  })
  
  ipcMain.handle('openrouter:abort', (_event, requestId: string) => {
    const active = activeStreams.get(requestId)
    if (active) {
      active.controller.abort()
      activeStreams.delete(requestId)
    }
    return true
  })
}
```

---

## G. 测试覆盖与风险点

### G.1 SSE 解析器测试

```typescript
// tests/unit/services/sseParser.test.ts:45-209
describe('SSE Stream Parser - Snapshot Tests', () => {
  
  describe('基础 SSE 行解析', () => {
    it('应正确解析标准文本消息', () => { ... })
    it('应正确识别 [DONE] 标记', () => { ... })
    it('应忽略空行', () => { ... })
    it('应忽略注释行', () => { ... })
    it('应处理 JSON 解析错误', () => { ... })
  })
  
  describe('推理流解析（Reasoning Content）', () => {
    it('应正确解析 delta.reasoning（DeepSeek 风格）', () => { ... })
    it('应正确解析 reasoning_content（OpenAI 风格）', () => { ... })
    it('应正确解析 reasoning_details 结构化数据', () => { ... })
  })
  
  describe('错误场景处理', () => {
    it('应正确解析 error 字段（顶层错误）', () => { ... })
    it('应正确解析 choices[0].error', () => { ... })
    it('应正确解析 delta.error', () => { ... })
    // ...
  })
})
```

### G.2 聚合器测试

```typescript
// tests/unit/services/responseAggregator.test.ts:52-173
describe('OpenRouterStreamAggregator', () => {
  
  describe('推理数据聚合', () => {
    it('应去重推理详情（基于 id）', () => { ... })
    it('应去重推理详情（基于内容指纹）', () => { ... })
    it('应正确设置推理摘要（覆盖式更新）', () => { ... })
  })
  
  describe('Usage 数据聚合', () => {
    it('应正确合并 Usage 数据', () => { ... })
  })
})
```

### G.3 关键风险点

**1. reasoning_details 未回传 → 思考连续性失效**

**影响范围**：
- OpenAI o1 等依赖 `reasoning_details` 回传的模型
- Tool calling 多轮对话场景
- 任何要求"保持思考上下文"的推理模型

**现状证据**：
- 代码注释明确写"特别重要：工具调用/多轮对话场景必须回传，否则思考链会断裂"
- 但实际 `HistoryMessage` 类型不含 `metadata`，`convertMessagesToOpenRouterFormat` 也不会注入

**2. 非流式 message.reasoning_details 未解析**

**影响范围**：
- 仅限非流式调用（`stream: false`）
- 当模型在非流式模式下返回 `choices[].message.reasoning_details` 时会丢失

**现状证据**：
- parser 类型定义 `message` 仅有 `content`
- 未见 `message.reasoning_details` 读取逻辑

---

## 附录：检索命令清单

**端点存在性验证**：
```bash
grep -r "\/responses" src/ electron/
grep -r '"responses"' src/ electron/
grep -r "\/parameters" src/ electron/
grep -r '"parameters"' src/ electron/
```

**reasoning_details 回传链路**：
```bash
grep -r 'convertMessagesToOpenRouterFormat' src/
grep -r 'HistoryMessage' src/types/
grep -r 'metadata.*reasoning' src/services/providers/
```

**非流式 reasoning_details**：
```bash
grep -r 'message\.reasoning_details' src/services/providers/openrouter/
grep -r 'message\?\.reasoning_details' src/services/providers/openrouter/
```

---

## 结论与建议

### 现状总结

✅ **已实现且稳定**：
- OpenRouter SSE 流式读取与解析
- `delta.reasoning_details` 的完整处理链路
- SQLite 持久化与 Electron IPC 桥接
- 推理参数适配（reasoning.exclude + include_reasoning）

⚠️ **关键缺失**：
- `reasoning_details` 未在下一轮请求中回传（与注释声明不符）
- 非流式 `message.reasoning_details` 未解析

### 修复优先级建议

**P0（高优）**：
1. 扩展 `HistoryMessage` 类型，添加 `reasoning_details` / `tool_calls` 可选字段
2. 修改 `convertMessagesToOpenRouterFormat`，在 assistant 消息中回传 `reasoning_details`

**P1（中优）**：
3. 扩展 parser，支持非流式 `message.reasoning_details` 解析

**P2（低优）**：
4. 文档更新：移除或标注"/responses 未接入"相关说明

---

## 文档元信息

- **审计人员**：GitHub Copilot (Claude Sonnet 4.5)
- **审计方法**：代码全仓检索 + 定点读文件 + 类型追踪
- **证据级别**：每条结论附文件路径+行号+代码片段
- **最后更新**：2025年12月13日

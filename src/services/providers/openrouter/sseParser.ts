/**
 * OpenRouter SSE (Server-Sent Events) Parser
 * 
 * **职责**：将 SSE 流中的原始文本数据块解析为结构化的 StreamChunk 对象
 * 
 * **纯函数设计**：
 * - 输入：SSE 文本行（string）
 * - 输出：StreamChunk 对象或 null
 * - 无副作用：不包含 fetch、DOM 操作或全局状态
 * 
 * **推理兼容性**：
 * - DeepSeek 风格：`delta.reasoning` (纯文本流)
 * - OpenAI 风格：`delta.reasoning_content` (结构化块)
 * - 统一映射到 providers.ts 定义的 StreamChunk 类型
 * 
 * **SSE 协议支持**：
 * - 标准格式：`data: {...}`
 * - 结束标记：`data: [DONE]`
 * - 注释行：以 `:` 开头（忽略）
 * - 空行分隔：事件边界
 * 
 * @module services/providers/openrouter/sseParser
 */

import type { StreamChunk } from '@/types/providers'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 类型定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * SSE 解析结果
 */
export interface SSEParseResult {
  /** 解析成功的 StreamChunk 对象 */
  chunk: StreamChunk | null
  /**
   * 同一条 `data:` 事件内解析出的多个 chunk（可选）。
   *
   * 说明：OpenRouter/兼容 OpenAI 的 SSE 数据行有时会同时包含 usage + content
   * 或 reasoning_details + content 等多种信息。
   * 旧实现只消费第一个 chunk，会导致正文/推理/用量被静默丢弃。
   *
   * 为保持向后兼容：
   * - 单一 chunk 时不提供该字段（只用 chunk）
   * - 多 chunk 时提供该字段，调用方应优先处理 chunks
   */
  chunks?: StreamChunk[]
  /** 是否收到流结束标记 [DONE] */
  isDone: boolean
  /** 解析错误（如果有） */
  error?: Error
}

/**
 * OpenRouter SSE 数据块原始格式（从 JSON 解析）
 */
export interface OpenRouterSSEChunk {
  id?: string
  request_id?: string
  choices?: Array<{
    id?: string
    delta?: {
      content?: string | ContentBlock[] | ContentObject
      reasoning?: string | { summary?: string }
      reasoning_details?: ReasoningDetail[]
      reasoning_content?: string  // OpenAI 风格
      images?: ImagePayload[]
      image?: ImagePayload
      error?: ErrorPayload
    }
    message?: {
      content?: string | ContentBlock[]
    }
    attachments?: ImagePayload[]
    usage?: UsagePayload
    finish_reason?: string
    error?: ErrorPayload
  }>
  usage?: UsagePayload
  error?: ErrorPayload
}

/**
 * 内容块（如 Claude 的结构化内容）
 */
interface ContentBlock {
  type: string
  text?: string
  image_url?: any
  image?: any
  image_base64?: any
  b64_json?: any
  data?: any
  inline_data?: any
}

/**
 * 内容对象（嵌套格式）
 */
interface ContentObject {
  text?: string
  image_url?: any
  image?: any
  inline_data?: any
  image_base64?: any
  b64_json?: any
  data?: any
}

/**
 * 推理详情（结构化数据，用于回传模型）
 */
interface ReasoningDetail {
  id?: string
  type?: string
  text?: string
  summary?: string
  data?: any
  format?: string
  index?: number
}

/**
 * 图片数据（多种格式）
 */
interface ImagePayload {
  url?: string
  image_url?: string | { url: string }
  data?: string
  b64_json?: string
  image_base64?: string
  asset_pointer?: string
  inline_data?: { data: string; mime_type?: string }
}

/**
 * 使用量数据
 */
interface UsagePayload {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  reasoning_tokens?: number  // OpenAI o1 风格
  [key: string]: any
}

/**
 * 错误数据
 */
interface ErrorPayload {
  message?: string
  code?: string
  type?: string
  [key: string]: any
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 图片数据归一化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 规范化图片数据格式（支持多种 Provider 的不同格式）
 * 
 * **支持格式**：
 * - OpenAI：`{ url: "https://..." }` 或 `{ b64_json: "..." }`
 * - Anthropic：`{ inline_data: { data: "...", mime_type: "..." } }`
 * - OpenRouter：`{ asset_pointer: "..." }` 或 `{ image_url: "..." }`
 * - 通用：直接字符串（Data URI 或 HTTPS URL）
 * 
 * @param payload - 图片数据对象或字符串
 * @returns 标准化的 Data URI 或 URL，失败返回 null
 * 
 * @example
 * ```typescript
 * normalizeImagePayload({ url: "https://example.com/image.png" })
 * // => "https://example.com/image.png"
 * 
 * normalizeImagePayload({ b64_json: "iVBORw0KGgo..." })
 * // => "data:image/png;base64,iVBORw0KGgo..."
 * 
 * normalizeImagePayload({ inline_data: { data: "...", mime_type: "image/jpeg" } })
 * // => "data:image/jpeg;base64,..."
 * ```
 */
export function normalizeImagePayload(payload: any): string | null {
  if (!payload) return null

  // 情况 1：直接字符串（Data URI 或 HTTPS URL）
  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (trimmed.startsWith('data:') || trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
      return trimmed
    }
    // 纯 Base64 字符串，添加前缀
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 100) {
      return `data:image/png;base64,${trimmed}`
    }
    return null
  }

  // 情况 2：对象格式
  if (typeof payload === 'object') {
    // OpenAI 格式：{ url: "..." }
    if (typeof payload.url === 'string') {
      return normalizeImagePayload(payload.url)
    }

    // OpenAI 格式：{ image_url: "..." } 或 { image_url: { url: "..." } }
    if (payload.image_url) {
      if (typeof payload.image_url === 'string') {
        return normalizeImagePayload(payload.image_url)
      }
      if (typeof payload.image_url === 'object' && payload.image_url.url) {
        return normalizeImagePayload(payload.image_url.url)
      }
    }

    // OpenAI 格式：{ b64_json: "..." }
    if (typeof payload.b64_json === 'string') {
      const b64 = payload.b64_json.trim()
      if (!b64.startsWith('data:')) {
        return `data:image/png;base64,${b64}`
      }
      return b64
    }

    // 通用格式：{ data: "..." }
    if (typeof payload.data === 'string') {
      return normalizeImagePayload(payload.data)
    }

    // 通用格式：{ image_base64: "..." }
    if (typeof payload.image_base64 === 'string') {
      const b64 = payload.image_base64.trim()
      if (!b64.startsWith('data:')) {
        return `data:image/png;base64,${b64}`
      }
      return b64
    }

    // Anthropic 格式：{ inline_data: { data: "...", mime_type: "..." } }
    if (payload.inline_data && typeof payload.inline_data === 'object') {
      const inlineData = payload.inline_data.data
      const mimeType = payload.inline_data.mime_type || 'image/png'
      if (typeof inlineData === 'string') {
        const trimmed = inlineData.trim()
        if (trimmed.startsWith('data:')) {
          return trimmed
        }
        return `data:${mimeType};base64,${trimmed}`
      }
    }

    // OpenRouter 格式：{ asset_pointer: "..." }
    if (typeof payload.asset_pointer === 'string') {
      return normalizeImagePayload(payload.asset_pointer)
    }

    // 递归处理嵌套的 image 字段
    if (payload.image) {
      return normalizeImagePayload(payload.image)
    }
  }

  return null
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SSE 行解析
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 解析单行 SSE 数据
 * 
 * **SSE 协议**：
 * - 数据行：`data: {...}`（JSON 格式）
 * - 结束标记：`data: [DONE]`
 * - 注释行：`: comment`（忽略）
 * - 空行：事件边界（忽略）
 * 
 * **错误处理**：
 * - JSON 解析失败：返回 error 字段，不抛出异常
 * - 非 data 开头：忽略（可能是 `event:` 或 `id:` 等字段）
 * 
 * @param line - SSE 文本行
 * @returns SSEParseResult 对象（包含 chunk、isDone、error）
 * 
 * @example
 * ```typescript
 * parseSSELine('data: {"choices":[{"delta":{"content":"Hello"}}]}')
 * // => { chunk: { type: 'text', content: 'Hello' }, isDone: false }
 * 
 * parseSSELine('data: [DONE]')
 * // => { chunk: null, isDone: true }
 * 
 * parseSSELine(': keep-alive')
 * // => { chunk: null, isDone: false }
 * ```
 */
export function parseSSELine(line: string): SSEParseResult {
  const trimmed = line.trim()

  // 空行或注释行
  if (!trimmed || trimmed.startsWith(':')) {
    return { chunk: null, isDone: false }
  }

  // 非 data: 开头（可能是 event:、id:、retry: 等）
  if (!trimmed.startsWith('data:')) {
    return { chunk: null, isDone: false }
  }

  // 提取 JSON 字符串
  const jsonStr = trimmed.slice(5).trim()

  // [DONE] 标记
  if (jsonStr === '[DONE]') {
    return { chunk: null, isDone: true }
  }

  // 解析 JSON
  try {
    const rawChunk: OpenRouterSSEChunk = JSON.parse(jsonStr)
    const chunks = parseOpenRouterChunk(rawChunk)

    // 同一条 data 行可能包含多种信息（usage + content / reasoning_details + content）。
    // 为保持旧接口兼容：单 chunk 只填 chunk；多 chunk 额外提供 chunks。
    if (chunks.length <= 1) {
      return { chunk: chunks[0] || null, isDone: false }
    }

    return { chunk: chunks[0] || null, chunks, isDone: false }
  } catch (error) {
    return {
      chunk: null,
      isDone: false,
      error: error instanceof Error ? error : new Error(String(error))
    }
  }
}

/**
 * 解析 OpenRouter SSE 数据块为 StreamChunk 数组
 * 
 * **处理优先级**：
 * 1. 错误检查（chunk.error、choices[0].error、delta.error）
 * 2. 使用量数据（usage）
 * 3. 推理详情（reasoning_details）- 结构化数据，用于回传
 * 4. 推理文本流（delta.reasoning / reasoning_content）- 实时展示
 * 5. 图片数据（delta.images / delta.image）
 * 6. 文本内容（delta.content）
 * 7. 消息内容（message.content）
 * 8. 附件（attachments）
 * 
 * **推理兼容性**：
 * - `delta.reasoning` (string) → `reasoning_stream_text`（DeepSeek 风格）
 * - `delta.reasoning_content` (string) → `reasoning_stream_text`（OpenAI 风格）
 * - `delta.reasoning_details` (array) → `reasoning_detail`（结构化数据）
 * 
 * @param rawChunk - OpenRouter 原始数据块
 * @returns StreamChunk 数组（可能包含多个类型）
 */
export function parseOpenRouterChunk(rawChunk: OpenRouterSSEChunk): StreamChunk[] {
  const results: StreamChunk[] = []

  // 🛡️ Null/Undefined 输入保护
  if (!rawChunk || typeof rawChunk !== 'object') {
    return results
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. 错误检查（三层：顶层 error、choices[0].error、delta.error）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. 使用量数据（usage）- 优先处理，因为可能没有 choices
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 注意：某些响应只包含 usage 而没有 choices（如流式结束时）
  const primaryChoice = rawChunk.choices?.[0]
  const usage = rawChunk.usage || primaryChoice?.usage
  if (usage && typeof usage === 'object') {
    const requestId = rawChunk.id || rawChunk.request_id || primaryChoice?.id || undefined
    results.push({
      type: 'usage',
      usage,
      requestId
    })
  }

  // 如果没有 choices，但有 usage，已经处理完毕，可以返回
  if (!primaryChoice) {
    return results
  }

  if (primaryChoice.error) {
    results.push({
      type: 'error',
      error: {
        message: primaryChoice.error.message || 'OpenRouter 流式响应错误',
        code: primaryChoice.error.code || 'StreamError',
        details: primaryChoice.error
      }
    })
    return results
  }

  if (primaryChoice.delta?.error) {
    results.push({
      type: 'error',
      error: {
        message: primaryChoice.delta.error.message || 'OpenRouter 流式响应错误',
        code: primaryChoice.delta.error.code || 'StreamError',
        details: primaryChoice.delta.error
      }
    })
    return results
  }

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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. 推理详情（reasoning_details）- 结构化数据，用于回传模型
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 作用：保存到消息历史，下次请求时原样回传给模型，保持思考连续性
  // 特别重要：工具调用/多轮对话场景必须回传，否则思考链会断裂
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. 推理文本流（delta.reasoning / delta.reasoning_content）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 作用：实时显示思考过程给用户看（包含标点、连接词等完整文本）
  // 注意：这是展示层数据，与 reasoning_details 内容重复但用途不同
  // 
  // **推理兼容性**：
  // - DeepSeek 风格：`delta.reasoning` (string)
  // - OpenAI 风格：`delta.reasoning_content` (string)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (delta?.reasoning) {
    if (typeof delta.reasoning === 'string') {
      results.push({
        type: 'reasoning_stream_text',
        text: delta.reasoning
      })
    } else if (typeof delta.reasoning === 'object' && delta.reasoning.summary) {
      // 某些 Provider 返回对象格式（如 { summary: "..." }）
      results.push({
        type: 'reasoning_stream_text',
        text: delta.reasoning.summary
      })
    }
  }

  // OpenAI o1 风格：reasoning_content
  if (delta?.reasoning_content && typeof delta.reasoning_content === 'string') {
    results.push({
      type: 'reasoning_stream_text',
      text: delta.reasoning_content
    })
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. 图片数据（delta.images / delta.image）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (delta?.images && Array.isArray(delta.images)) {
    for (const imageObj of delta.images) {
      const normalized = normalizeImagePayload(imageObj)
      if (normalized) {
        results.push({ type: 'image', content: normalized })
      }
    }
  }

  if (delta?.image) {
    const normalized = normalizeImagePayload(delta.image)
    if (normalized) {
      results.push({ type: 'image', content: normalized })
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. 文本内容（delta.content）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const content = delta?.content

  // 情况 1：content 是数组（如 Claude 的结构化内容）
  if (Array.isArray(content)) {
    for (const block of content) {
      if ((block?.type === 'text' || block?.type === 'output_text') && block.text) {
        results.push({ type: 'text', content: block.text })
        continue
      }

      // 处理数组中的图片块
      const normalizedBlockImage = normalizeImagePayload(
        block?.image_url ??
        block?.image ??
        block?.image_base64 ??
        block?.b64_json ??
        block?.data ??
        block?.inline_data ??
        block
      )

      if (normalizedBlockImage) {
        results.push({ type: 'image', content: normalizedBlockImage })
      }
    }
  }
  // 情况 2：content 是字符串（标准格式）
  else if (typeof content === 'string' && content) {
    results.push({ type: 'text', content })
  }
  // 情况 3：content 是对象（嵌套格式）
  else if (content && typeof content === 'object') {
    if (content.text) {
      results.push({ type: 'text', content: content.text })
    } else {
      const normalizedContentImage = normalizeImagePayload(
        content.image_url ??
        content.image ??
        content.inline_data ??
        content.image_base64 ??
        content.b64_json ??
        content.data ??
        content
      )
      if (normalizedContentImage) {
        results.push({ type: 'image', content: normalizedContentImage })
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 7. 消息内容（message.content）- 某些 Provider 使用此字段（非流式响应）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🔧 CRITICAL FIX: 修复首token超时问题
  // 场景：某些 Provider 返回的 chunk 没有 delta，只有 message.content
  // 如果不处理，会导致 parseOpenRouterChunk 返回空数组，processStreamChunk 永远不触发，超时
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const messageContent = primaryChoice.message?.content
  if (Array.isArray(messageContent)) {
    for (const item of messageContent) {
      if ((item?.type === 'text' || item?.type === 'output_text') && item.text) {
        results.push({ type: 'text', content: item.text })
        continue
      }
      const normalizedMessageImage = normalizeImagePayload(item)
      if (normalizedMessageImage) {
        results.push({ type: 'image', content: normalizedMessageImage })
      }
    }
  } else if (typeof messageContent === 'string' && messageContent) {
    // 🔧 CRITICAL: message.content 是字符串时，作为文本处理，不是图片！
    results.push({ type: 'text', content: messageContent })
  } else if (messageContent && typeof messageContent === 'object') {
    // 对象格式：可能包含 text 字段或图片数据
    const contentObj = messageContent as any // 类型守卫：已确认是对象
    if (contentObj.text) {
      results.push({ type: 'text', content: contentObj.text })
    } else {
      const normalizedMessagePayload = normalizeImagePayload(contentObj)
      if (normalizedMessagePayload) {
        results.push({ type: 'image', content: normalizedMessagePayload })
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 8. 附件（attachments）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const attachments = primaryChoice.attachments
  if (Array.isArray(attachments)) {
    for (const attachment of attachments) {
      const normalizedAttachmentImage = normalizeImagePayload(attachment)
      if (normalizedAttachmentImage) {
        results.push({ type: 'image', content: normalizedAttachmentImage })
      }
    }
  }

  return results
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 导出默认对象（兼容旧代码）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const openRouterSSEParser = {
  parseSSELine,
  parseOpenRouterChunk,
  normalizeImagePayload
}

/**
 * OpenRouter SSE 事件映射模块
 *
 * 将 OpenRouter 的 JSON chunk 转换为 SSOT Domain Events。
 * 纯函数：只转换格式，不假设上游是快照还是增量语义。
 *
 * @see docs/architecture/REASONING_SEMANTIC_CONTRACT.md 语义契约
 * @see docs/architecture/REASONING_IDEMPOTENCY_CONTRACT.md 幂等契约
 */

export type DomainEvent =
  | Readonly<{ type: 'StreamComment'; text: string }>
  | Readonly<{ type: 'StreamError'; error: unknown; terminal: true }>
  | Readonly<{ type: 'StreamDone' }>
  | Readonly<{ type: 'MessageDeltaText'; messageId: string; choiceIndex: number; text: string }>
  | Readonly<{ type: 'MessageAppendContentBlock'; messageId: string; choiceIndex: number; block: unknown }>
  | Readonly<{
      type: 'MessageDeltaToolCall'
      messageId: string
      choiceIndex: number
      mergeStrategy: 'append' | 'replace'
      toolCallDeltas: unknown[]
    }>
  | Readonly<{ type: 'MessageDeltaReasoningDetail'; messageId: string; choiceIndex: number; detail: unknown; chunkNo?: number }>
  | Readonly<{ type: 'UsageDelta'; usage: unknown }>
  | Readonly<{
      type: 'MetaDelta'
      meta: {
        id?: string
        model?: string
        provider?: string
        finish_reason?: string
        native_finish_reason?: string
      }
    }>

export type OpenRouterChunkInput = Readonly<{
  chunk: any
  messageId: string
  choiceIndex?: number
  /** 递增的 chunk 序号，用于诊断追踪 */
  chunkNo?: number
}>

function normalizeFinishReason(native: unknown): string | undefined {
  if (typeof native !== 'string' || !native) return undefined
  const known = new Set([
    'stop',
    'length',
    'tool_calls',
    'content_filter',
    'error',
    'cancelled',
    'abort',
  ])
  return known.has(native) ? native : 'unknown'
}

function pushMeta(events: DomainEvent[], chunk: any) {
  if (!chunk || typeof chunk !== 'object') return
  const id = typeof chunk.id === 'string' ? chunk.id : undefined
  const model = typeof chunk.model === 'string' ? chunk.model : undefined
  const provider = typeof chunk.provider === 'string' ? chunk.provider : undefined

  const choice0 = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined
  const finishReasonNative =
    typeof choice0?.finish_reason === 'string' ? (choice0.finish_reason as string) : undefined
  const nativeFinishReason =
    typeof choice0?.native_finish_reason === 'string'
      ? (choice0.native_finish_reason as string)
      : undefined

  const finish_reason = normalizeFinishReason(finishReasonNative)
  const native_finish_reason = nativeFinishReason ?? finishReasonNative

  if (id || model || provider || finish_reason || native_finish_reason) {
    events.push({
      type: 'MetaDelta',
      meta: {
        id,
        model,
        provider,
        finish_reason,
        native_finish_reason,
      },
    })
  }
}

/**
 * Map a parsed OpenRouter JSON chunk into SSOT Domain Events.
 * - Pure function: emits events only; does not write any state.
 * - Does not infer "encrypted"/"excluded"; it only forwards raw fields.
 */
export function mapChunkToEvents(input: OpenRouterChunkInput): DomainEvent[] {
  const { chunk, messageId } = input
  const choiceIndex = typeof input.choiceIndex === 'number' ? input.choiceIndex : 0

  const events: DomainEvent[] = []
  pushMeta(events, chunk)

  if (chunk && typeof chunk === 'object' && 'error' in chunk && chunk.error) {
    events.push({
      type: 'StreamError',
      error: chunk.error,
      terminal: true,
    })
    return events
  }

  if (chunk && typeof chunk === 'object' && chunk.usage) {
    events.push({ type: 'UsageDelta', usage: chunk.usage })
  }

  const choices = Array.isArray(chunk?.choices) ? chunk.choices : []
  const choice = choices[choiceIndex]
  if (!choice || typeof choice !== 'object') return events

  const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta : null
  const message = choice.message && typeof choice.message === 'object' ? choice.message : null

  const content = delta?.content ?? message?.content
  if (typeof content === 'string' && content.length > 0) {
    events.push({ type: 'MessageDeltaText', messageId, choiceIndex, text: content })
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const type = (part as any).type
      if (type === 'text' || type === 'input_text') {
        const text = (part as any).text
        if (typeof text === 'string' && text.length > 0) {
          events.push({ type: 'MessageDeltaText', messageId, choiceIndex, text })
        }
        continue
      }
      if (type === 'image_url') {
        const url = (part as any)?.image_url?.url
        if (typeof url === 'string' && url.length > 0) {
          events.push({ type: 'MessageAppendContentBlock', messageId, choiceIndex, block: { type: 'image', url } })
        }
      }
    }
  }

  const toolCalls = delta?.tool_calls ?? message?.tool_calls
  if (toolCalls !== undefined) {
    const mergeStrategy: 'append' | 'replace' = delta?.tool_calls !== undefined ? 'append' : 'replace'
    const toolCallDeltas = Array.isArray(toolCalls) ? toolCalls : [toolCalls]
    events.push({ type: 'MessageDeltaToolCall', messageId, choiceIndex, mergeStrategy, toolCallDeltas })
  }

  const reasoningDetails = delta?.reasoning_details ?? message?.reasoning_details
  if (Array.isArray(reasoningDetails)) {
    for (const detail of reasoningDetails) {
      events.push({
        type: 'MessageDeltaReasoningDetail',
        messageId,
        choiceIndex,
        detail,
        chunkNo: input.chunkNo,
      })
    }
  }

  return events
}

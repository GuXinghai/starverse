import type { OpenAIResponsesTerminalResultV1 } from './openai-responses/responsesStreamV1'

/** Received native data is retained independently of the subset legal to replay. */
export type InterruptedNativeSnapshotV1 = Readonly<{
  items: readonly Readonly<Record<string, unknown>>[]
  completeIndexes: readonly number[]
  text: string
  complete: boolean
  terminalFact?: OpenAIResponsesTerminalResultV1
}>
export type InterruptedProtocolV1 = 'openai_responses' | 'openrouter' | 'anthropic' | 'deepseek' | 'gemini'

/** Derive send-time replay from retained native facts instead of persisting a second copy. */
export function projectInterruptedCheckpointReplayV1(input: Readonly<{
  protocol: InterruptedProtocolV1; native: InterruptedNativeSnapshotV1; prefix: readonly unknown[]; answerRootId: string
}>): Readonly<{ replay: readonly unknown[]; responseLength: number }> {
  const assistant = interruptedAssistantReplayV1(input.protocol, input.native).map(value => {
    const item = value as Readonly<Record<string, unknown>>
    return item.id === 'interrupted-text' ? { ...item,
      id: `msg_interrupted_${input.answerRootId.replace(/[^a-z0-9]/giu, '')}` } : item
  })
  return { replay: [...input.prefix, ...assistant], responseLength: assistant.length }
}

/** A new user turn, never a continuation of an unfinished tool invocation. */
export function interruptedAssistantReplayV1(protocol: InterruptedProtocolV1, native: InterruptedNativeSnapshotV1): readonly unknown[] {
  const done = new Set(native.completeIndexes)
  if (protocol === 'openai_responses') {
    const output: unknown[] = []
    let pendingReasoning: Readonly<Record<string, unknown>>[] = []
    let completedText = ''
    for (const [index, item] of native.items.entries()) {
      if (!done.has(index) || item.status === 'incomplete') continue
      if (item.type === 'reasoning' && typeof item.encrypted_content === 'string' && item.encrypted_content.length > 0) pendingReasoning.push(item)
      if (item.type === 'function_call') pendingReasoning = []
      if (item.type === 'message') {
        output.push(...pendingReasoning, item)
        pendingReasoning = []
        if (Array.isArray(item.content)) completedText += item.content.map(part => part.text ?? part.refusal ?? '').join('')
      }
    }
    const tail = native.text.startsWith(completedText) ? native.text.slice(completedText.length) : ''
    if (tail) {
      const pendingMessage = native.items.find(item => item.type === 'message' && !done.has(native.items.indexOf(item)))
      output.push(...pendingReasoning, { type: 'message', role: 'assistant',
        id: pendingMessage?.id ?? 'interrupted-text', status: 'incomplete',
        content: [{ type: 'output_text', text: tail, annotations: [] }] })
    }
    return output
  }
  if (protocol === 'anthropic') {
    const thinking = native.items.filter(item => item.type === 'thinking' || item.type === 'redacted_thinking')
    const allThinkingComplete = !native.items.some(item => item.type === 'tool_use') && thinking.every(item => {
      const index = native.items.indexOf(item)
      return done.has(index) && (item.type === 'thinking' ? typeof item.signature === 'string' && item.signature.length > 0
        : typeof item.data === 'string' && item.data.length > 0)
    })
    const content = native.items.filter(item => item.type === 'text' && typeof item.text === 'string' && item.text.length > 0 ||
      allThinkingComplete && (item.type === 'thinking' || item.type === 'redacted_thinking'))
    return content.length ? [{ role: 'assistant', content }] : []
  }
  if (protocol === 'gemini') {
    const parts = native.items.filter(item => !('functionCall' in item) &&
      (typeof item.thoughtSignature === 'string' && item.thoughtSignature.length > 0 ||
        item.thought !== true && typeof item.text === 'string' && item.text.length > 0))
    return parts.length ? [{ role: 'model', parts }] : []
  }
  const message = native.items[0] ?? {}
  // These protocols have no per-reasoning-block stop event. A body delta is not a completion marker.
  const reasoning = native.complete ? protocol === 'deepseek'
    ? { ...(message.reasoning_content === undefined ? {} : { reasoning_content: message.reasoning_content }) }
    : { ...(message.reasoning === undefined ? {} : { reasoning: message.reasoning }),
      ...(message.reasoning_details === undefined ? {} : { reasoning_details: message.reasoning_details }) } : {}
  const images = protocol === 'openrouter' && Array.isArray(message.images) && message.images.length ? { images: message.images } : {}
  const annotations = protocol === 'openrouter' && Array.isArray(message.annotations) && message.annotations.length ? { annotations: message.annotations } : {}
  if (!native.text && Object.keys(reasoning).length === 0 && Object.keys(images).length === 0 && Object.keys(annotations).length === 0) return []
  return [{ role: 'assistant', content: native.text || null, ...reasoning, ...images, ...annotations }]
}

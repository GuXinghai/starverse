export type ContextMode = 'default' | 'advanced_reasoning_blocks'

export type InternalMessage = Readonly<{
  role: 'user' | 'assistant' | 'tool'
  content?: string
  contentText?: string
  contentBlocks?: ReadonlyArray<
    | Readonly<{ type: 'text'; text: string }>
    | Readonly<{ type: 'image_url'; image_url: { url: string } }>
    | Readonly<{ type: string; [key: string]: unknown }>
  >
  toolCalls?: unknown[]
  toolCallId?: string
  toolName?: string
  reasoningDetailsRaw?: unknown[]
}>

export type BuildMessagesOptions = Readonly<{
  mode?: ContextMode
}>

function deriveContent(message: InternalMessage): string | ReadonlyArray<unknown> {
  if (typeof message.content === 'string') return message.content
  if (typeof message.contentText === 'string') return message.contentText
  if (Array.isArray(message.contentBlocks)) {
    const blocks = message.contentBlocks
    const hasNonText = blocks.some((b) => b && typeof b === 'object' && (b as any).type !== 'text')
    if (hasNonText) return blocks as unknown as ReadonlyArray<unknown>
    return blocks
      .filter((b) => b && typeof b === 'object' && (b as any).type === 'text')
      .map((b) => String((b as any).text ?? ''))
      .join('')
  }
  return ''
}

/**
 * Build next-turn OpenRouter `messages[]`.
 *
 * Modes:
 * - default: only visible content + tool calls/results (no reasoning blocks injected)
 * - advanced_reasoning_blocks: inject `reasoning_details` from `reasoningDetailsRaw` (append-only, original order)
 */
export function buildOpenRouterMessages(
  messages: ReadonlyArray<InternalMessage>,
  options: BuildMessagesOptions = {}
): unknown[] {
  const mode: ContextMode = options.mode ?? 'default'
  if (!Array.isArray(messages)) throw new Error('messages must be an array')

  const out: any[] = []

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue
    if (msg.role !== 'user' && msg.role !== 'assistant' && msg.role !== 'tool') continue

    if (msg.role === 'tool') {
      const content = deriveContent(msg)
      const tool_call_id = typeof msg.toolCallId === 'string' ? msg.toolCallId : undefined
      const name = typeof msg.toolName === 'string' ? msg.toolName : undefined
      out.push({
        role: 'tool',
        ...(name ? { name } : {}),
        ...(tool_call_id ? { tool_call_id } : {}),
        content,
      })
      continue
    }

    const base: any = {
      role: msg.role,
      content: deriveContent(msg),
    }

    if (msg.role === 'assistant') {
      if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        base.tool_calls = msg.toolCalls
      }

      if (mode === 'advanced_reasoning_blocks' && Array.isArray(msg.reasoningDetailsRaw) && msg.reasoningDetailsRaw.length > 0) {
        base.reasoning_details = [...msg.reasoningDetailsRaw]
      }
    }

    out.push(base)
  }

  return out
}


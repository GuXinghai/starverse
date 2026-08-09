import type { CompatibleRequestMessage, CompatibleRequestToolCall } from '../../../../shared/provider/openai-chat-compatible/request/messageTypes'
import type { CompatibleWireEvent } from '../../../../shared/provider/openai-chat-compatible/wire'

export type OpenAIChatCompatibleStreamResultV2 = Readonly<{
  assistantMessage: Extract<CompatibleRequestMessage, Readonly<{ role: 'assistant' }>>
  responseId: string
  model: string
  finishReason: string
  usage: Readonly<Record<string, unknown>> | null
}>

export class OpenAIChatCompatibleResponseAssemblerV2 {
  #responseId: string | null = null
  #model: string | null = null
  #content = ''
  #contentSeen = false
  #finishReason: string | null = null
  #roleSeen = false
  #usage: Readonly<Record<string, unknown>> | null = null
  readonly #tools = new Map<number, { id?: string; type?: 'function'; name?: string; arguments: string }>()

  push(event: CompatibleWireEvent): string {
    if (this.#finishReason !== null && event.kind !== 'terminal' && event.kind !== 'usage') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_SEQUENCE_INVALID')
    if (event.kind === 'response_meta') {
      if (event.meta.id !== undefined) this.#setResponseId(event.meta.id)
      if (event.meta.model !== undefined) this.#setModel(event.meta.model)
      return ''
    }
    if (event.kind === 'choice_role') {
      if (event.choiceIndex !== 0 || event.role !== 'assistant' || this.#roleSeen) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID')
      this.#roleSeen = true; return ''
    }
    if (event.kind === 'choice_content') {
      if (event.choiceIndex !== 0 || Array.isArray(event.content)) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID')
      // A stream delta with no content is represented as null by the closed
      // wire mapper. It is not an assistant terminal content value.
      if (event.content === null) return ''
      if (typeof event.content !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID')
      this.#contentSeen = true; this.#content += event.content; return event.content
    }
    if (event.kind === 'tool_fragment') {
      if (event.choiceIndex !== 0) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID')
      const index = event.fragment.toolIndex
      if (!Number.isSafeInteger(index) || index < 0 || index > 127) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID')
      const existing = this.#tools.get(index) ?? { arguments: '' }
      if (event.fragment.id !== undefined) { if (existing.id && existing.id !== event.fragment.id) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID'); existing.id = event.fragment.id }
      if (event.fragment.type !== undefined) { if (existing.type && existing.type !== event.fragment.type) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID'); existing.type = event.fragment.type }
      if (event.fragment.functionName !== undefined) { if (existing.name && existing.name !== event.fragment.functionName) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID'); existing.name = event.fragment.functionName }
      if (event.fragment.argumentsFragment !== undefined) existing.arguments += event.fragment.argumentsFragment
      if (existing.arguments.length > 1_000_000) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID')
      this.#tools.set(index, existing); return ''
    }
    if (event.kind === 'choice_finish') {
      if (event.choiceIndex !== 0 || this.#finishReason !== null) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID')
      if (event.finishReason === null) return ''
      this.#finishReason = event.finishReason; return ''
    }
    if (event.kind === 'usage') {
      if (this.#usage !== null) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID')
      this.#usage = Object.freeze({ ...event.usage }); return ''
    }
    return ''
  }

  finish(): OpenAIChatCompatibleStreamResultV2 {
    if (!this.#responseId || !this.#model || !this.#finishReason) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_TERMINAL_INVALID')
    const tools = [...this.#tools.entries()].sort(([left], [right]) => left - right).map(([, item]): CompatibleRequestToolCall => {
      if (!item.id || item.type !== 'function' || !item.name || !isJsonObject(item.arguments)) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_TOOL_INVALID')
      return Object.freeze({ id: item.id, type: 'function', function: Object.freeze({ name: item.name, arguments: item.arguments }) })
    })
    if (!this.#contentSeen && tools.length === 0) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_TERMINAL_INVALID')
    return Object.freeze({ assistantMessage: Object.freeze({ role: 'assistant', content: this.#contentSeen ? this.#content : null,
      ...(tools.length === 0 ? {} : { tool_calls: Object.freeze(tools) }) }), responseId: this.#responseId, model: this.#model,
      finishReason: this.#finishReason, usage: this.#usage })
  }

  #setResponseId(value: string): void {
    if (!validId(value) || this.#responseId && this.#responseId !== value) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID')
    this.#responseId = value
  }
  #setModel(value: string): void {
    if (!validId(value) || this.#model && this.#model !== value) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_INVALID')
    this.#model = value
  }
}

function validId(value: string): boolean { return /^[A-Za-z0-9._:-]{1,512}$/u.test(value) }
function isJsonObject(value: string): boolean {
  try { const parsed = JSON.parse(value); return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed)) } catch { return false }
}

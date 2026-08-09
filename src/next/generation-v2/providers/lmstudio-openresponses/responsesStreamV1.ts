import { decodeLmStudioOpenResponsesReturnedItemsV1, type LmStudioOpenResponsesReturnedItemV1 } from './nativeItemsV1'

const EVENTS = new Set([
  'response.created', 'response.in_progress', 'response.output_item.added', 'response.content_part.added',
  'response.reasoning_text.delta', 'response.reasoning_text.done', 'response.output_text.delta', 'response.output_text.done',
  'response.function_call_arguments.delta', 'response.function_call_arguments.done', 'response.content_part.done',
  'response.output_item.done', 'response.completed', 'response.failed', 'response.incomplete',
])
export type LmStudioOpenResponsesStreamDeltaV1 = Readonly<{
  type: 'output_text' | 'reasoning_text' | 'function_arguments'; delta: string
}>
export type LmStudioOpenResponsesStreamResultV1 = Readonly<{
  state: 'completed' | 'failed' | 'incomplete'
  returnedItems: readonly LmStudioOpenResponsesReturnedItemV1[]
  responseId: string
  model: string
  usage: unknown
  error: unknown
}>
export class LmStudioOpenResponsesStreamV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_LMSTUDIO_STREAM_INVALID_EVENT'
    | 'GENERATION_V2_LMSTUDIO_STREAM_SEQUENCE_INVALID'
    | 'GENERATION_V2_LMSTUDIO_STREAM_TERMINAL_INVALID') {
    super(code); this.name = 'LmStudioOpenResponsesStreamV1Error'
  }
}
function fail(code: LmStudioOpenResponsesStreamV1Error['code']): never { throw new LmStudioOpenResponsesStreamV1Error(code) }
function event(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail('GENERATION_V2_LMSTUDIO_STREAM_INVALID_EVENT')
  return value as Record<string, unknown>
}

export class LmStudioOpenResponsesTypedSseDecoderV1 {
  #textDecoder = new TextDecoder()
  #buffer = ''
  #lastSequence = -1
  #terminal: LmStudioOpenResponsesStreamResultV1 | null = null
  push(bytes: Uint8Array): readonly (LmStudioOpenResponsesStreamDeltaV1 | LmStudioOpenResponsesStreamResultV1)[] {
    this.#buffer += this.#textDecoder.decode(bytes, { stream: true })
    const blocks = this.#buffer.split(/\r?\n\r?\n/u)
    this.#buffer = blocks.pop() ?? ''
    return Object.freeze(blocks.flatMap((block) => this.#decodeBlock(block)))
  }
  finish(): LmStudioOpenResponsesStreamResultV1 {
    this.#buffer += this.#textDecoder.decode()
    if (this.#buffer.trim().length > 0) for (const item of this.#decodeBlock(this.#buffer)) {
      if ('state' in item) this.#terminal = item
    }
    this.#buffer = ''
    if (!this.#terminal) return fail('GENERATION_V2_LMSTUDIO_STREAM_TERMINAL_INVALID')
    return this.#terminal
  }
  #decodeBlock(block: string): readonly (LmStudioOpenResponsesStreamDeltaV1 | LmStudioOpenResponsesStreamResultV1)[] {
    if (!block.trim()) return []
    let eventName: string | null = null
    const data: string[] = []
    for (const line of block.split(/\r?\n/u)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      else if (line && !line.startsWith(':')) return fail('GENERATION_V2_LMSTUDIO_STREAM_INVALID_EVENT')
    }
    if (!eventName || !EVENTS.has(eventName) || data.length === 0 || this.#terminal) return fail('GENERATION_V2_LMSTUDIO_STREAM_INVALID_EVENT')
    let parsed: Readonly<Record<string, unknown>>
    try { parsed = event(JSON.parse(data.join('\n'))) } catch { return fail('GENERATION_V2_LMSTUDIO_STREAM_INVALID_EVENT') }
    if (parsed.type !== eventName || !Number.isSafeInteger(parsed.sequence_number) || (parsed.sequence_number as number) !== this.#lastSequence + 1) {
      return fail('GENERATION_V2_LMSTUDIO_STREAM_SEQUENCE_INVALID')
    }
    this.#lastSequence = parsed.sequence_number as number
    const deltaType = eventName === 'response.output_text.delta' ? 'output_text'
      : eventName === 'response.reasoning_text.delta' ? 'reasoning_text'
        : eventName === 'response.function_call_arguments.delta' ? 'function_arguments' : null
    if (deltaType) {
      if (typeof parsed.delta !== 'string') return fail('GENERATION_V2_LMSTUDIO_STREAM_INVALID_EVENT')
      return [Object.freeze({ type: deltaType, delta: parsed.delta })]
    }
    if (eventName !== 'response.completed' && eventName !== 'response.failed' && eventName !== 'response.incomplete') return []
    const response = event(parsed.response)
    const state = eventName === 'response.completed' ? 'completed' : eventName === 'response.failed' ? 'failed' : 'incomplete'
    if (response.status !== state || typeof response.id !== 'string' || typeof response.model !== 'string' || !Array.isArray(response.output)) {
      return fail('GENERATION_V2_LMSTUDIO_STREAM_TERMINAL_INVALID')
    }
    const terminal = Object.freeze({ state, returnedItems: decodeLmStudioOpenResponsesReturnedItemsV1(response.output),
      responseId: response.id, model: response.model, usage: response.usage ?? null, error: response.error ?? null })
    this.#terminal = terminal
    return [terminal]
  }
}

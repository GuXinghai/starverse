import { stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import type { OpenRouterNativeMessageV1 } from './nativeMessagesV1'

export type OpenRouterChatSseEventV1 =
  | Readonly<{ type: 'json'; value: unknown }>
  | Readonly<{ type: 'comment'; text: string }>
  | Readonly<{ type: 'done' }>

export type OpenRouterChatStreamDeltaV1 = Readonly<{
  contentDelta?: string
  reasoningDelta?: string
  reasoningDetails?: readonly Record<string, unknown>[]
}>

export type OpenRouterChatStreamResultV1 = Readonly<{
  assistantMessage: OpenRouterNativeMessageV1
  responseId: string
  model: string
  provider: string | null
  finishReason: string
  usage: Readonly<Record<string, unknown>> | null
}>

export class OpenRouterChatStreamV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CHAT_SSE_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_SSE_PREMATURE_EOF'
    | 'GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_STREAM_LIMIT_EXCEEDED') {
    super(code); this.name = 'OpenRouterChatStreamV1Error'
  }
}

const MAX_PENDING_BYTES = 8 * 1024 * 1024
const MAX_WIRE_BYTES = 64 * 1024 * 1024
const MAX_NATIVE_BYTES = 20 * 1024 * 1024

function fail(code: OpenRouterChatStreamV1Error['code']): never { throw new OpenRouterChatStreamV1Error(code) }
function cloneObject(value: unknown): Readonly<Record<string, unknown>> {
  try {
    const encoded = stableSerializeProviderRequestBoundedV2(value, MAX_NATIVE_BYTES)
    const parsed = JSON.parse(encoded)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
    return Object.freeze(parsed as Record<string, unknown>)
  } catch (error) {
    if (error instanceof OpenRouterChatStreamV1Error) throw error
    return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
  }
}

export class OpenRouterChatSseDecoderV1 {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true })
  #buffer = ''
  #wireBytes = 0
  #finished = false

  push(bytes: Uint8Array): readonly OpenRouterChatSseEventV1[] {
    if (this.#finished || !(bytes instanceof Uint8Array)) return fail('GENERATION_V2_OPENROUTER_CHAT_SSE_INVALID')
    this.#wireBytes += bytes.byteLength
    if (this.#wireBytes > MAX_WIRE_BYTES) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_LIMIT_EXCEEDED')
    try { this.#buffer += this.#decoder.decode(bytes, { stream: true }).replace(/\r\n?|\n/gu, '\n') } catch {
      return fail('GENERATION_V2_OPENROUTER_CHAT_SSE_INVALID')
    }
    if (new TextEncoder().encode(this.#buffer).byteLength > MAX_PENDING_BYTES) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_LIMIT_EXCEEDED')
    return this.#drain()
  }

  finish(): readonly OpenRouterChatSseEventV1[] {
    if (this.#finished) return fail('GENERATION_V2_OPENROUTER_CHAT_SSE_INVALID')
    this.#finished = true
    try { this.#buffer += this.#decoder.decode().replace(/\r\n?|\n/gu, '\n') } catch {
      return fail('GENERATION_V2_OPENROUTER_CHAT_SSE_INVALID')
    }
    const events = this.#drain()
    if (this.#buffer.length !== 0) return fail('GENERATION_V2_OPENROUTER_CHAT_SSE_PREMATURE_EOF')
    return events
  }

  #drain(): readonly OpenRouterChatSseEventV1[] {
    const result: OpenRouterChatSseEventV1[] = []
    while (true) {
      const boundary = this.#buffer.indexOf('\n\n')
      if (boundary < 0) break
      const frame = this.#buffer.slice(0, boundary)
      this.#buffer = this.#buffer.slice(boundary + 2)
      if (frame.length === 0) continue
      const data: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith(':')) result.push(Object.freeze({ type: 'comment', text: line.slice(1).replace(/^ /u, '') }))
        else if (line === 'data' || line.startsWith('data:')) data.push(line === 'data' ? '' : line.slice(5).replace(/^ /u, ''))
        else return fail('GENERATION_V2_OPENROUTER_CHAT_SSE_INVALID')
      }
      if (data.length === 0) continue
      const raw = data.join('\n')
      if (raw === '[DONE]') result.push(Object.freeze({ type: 'done' }))
      else {
        let value: unknown
        try { value = JSON.parse(raw) } catch { return fail('GENERATION_V2_OPENROUTER_CHAT_SSE_INVALID') }
        result.push(Object.freeze({ type: 'json', value }))
      }
    }
    return Object.freeze(result)
  }
}

type MutableToolCall = { id?: string; name?: string; arguments: string }

export class OpenRouterChatStreamAssemblerV1 {
  #id: string | undefined
  #model: string | undefined
  #provider: string | null = null
  #content = ''
  #reasoning = ''
  readonly #reasoningDetails: Record<string, unknown>[] = []
  readonly #annotations: Record<string, unknown>[] = []
  readonly #toolCalls = new Map<number, MutableToolCall>()
  #finishReason: string | undefined
  #usage: Readonly<Record<string, unknown>> | null = null
  #done = false
  #nativeBytes = 0

  push(value: unknown): OpenRouterChatStreamDeltaV1 {
    if (this.#done || !value || typeof value !== 'object' || Array.isArray(value)) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID')
    const chunk = value as Record<string, unknown>
    if (chunk.error !== undefined) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
    this.#mergeIdentity('id', chunk.id)
    this.#mergeIdentity('model', chunk.model, true)
    if (chunk.provider !== undefined) {
      if (typeof chunk.provider !== 'string' || chunk.provider.length === 0 || this.#provider !== null && this.#provider !== chunk.provider) {
        return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
      }
      this.#provider = chunk.provider
    }
    const choices = chunk.choices
    if (!Array.isArray(choices) || choices.length > 1) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
    const deltaResult: { contentDelta?: string; reasoningDelta?: string; reasoningDetails?: readonly Record<string, unknown>[] } = {}
    if (choices.length === 0) {
      if (chunk.usage === undefined || this.#usage !== null || this.#finishReason === undefined) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID')
      this.#usage = cloneObject(chunk.usage)
      this.#consume(this.#usage)
      return Object.freeze(deltaResult)
    }
    const choice = choices[0]
    if (!choice || typeof choice !== 'object' || Array.isArray(choice) || (choice as Record<string, unknown>).index !== 0) {
      return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
    }
    const row = choice as Record<string, unknown>
    if (row.finish_reason !== null && row.finish_reason !== undefined) {
      if (typeof row.finish_reason !== 'string' || row.finish_reason.length === 0 || this.#finishReason !== undefined) {
        return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID')
      }
      this.#finishReason = row.finish_reason
    }
    const delta = row.delta
    if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
    const fields = delta as Record<string, unknown>
    if (fields.role !== undefined && fields.role !== 'assistant') return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
    if (fields.content !== undefined && fields.content !== null) {
      if (typeof fields.content !== 'string') return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
      this.#consume(fields.content); this.#content += fields.content; deltaResult.contentDelta = fields.content
    }
    if (fields.reasoning !== undefined && fields.reasoning !== null) {
      if (typeof fields.reasoning !== 'string') return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
      this.#consume(fields.reasoning); this.#reasoning += fields.reasoning; deltaResult.reasoningDelta = fields.reasoning
    }
    if (fields.reasoning_details !== undefined) {
      if (!Array.isArray(fields.reasoning_details)) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
      const details = fields.reasoning_details.map(cloneObject)
      for (const detail of details) { this.#consume(detail); this.#reasoningDetails.push({ ...detail }) }
      deltaResult.reasoningDetails = Object.freeze(details)
    }
    if (fields.annotations !== undefined) {
      if (!Array.isArray(fields.annotations)) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
      for (const annotation of fields.annotations.map(cloneObject)) { this.#consume(annotation); this.#annotations.push({ ...annotation }) }
    }
    if (fields.tool_calls !== undefined) this.#mergeToolCalls(fields.tool_calls)
    return Object.freeze(deltaResult)
  }

  done(): void {
    if (this.#done || !this.#id || !this.#model || !this.#finishReason) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID')
    this.#done = true
  }

  finish(): OpenRouterChatStreamResultV1 {
    if (!this.#done || !this.#id || !this.#model || !this.#finishReason) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID')
    const toolCalls = [...this.#toolCalls.entries()].sort(([left], [right]) => left - right).map(([index, tool]) => {
      if (index < 0 || !tool.id || !tool.name) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID')
      return Object.freeze({ id: tool.id, type: 'function', function: Object.freeze({ name: tool.name, arguments: tool.arguments }) })
    })
    if ((this.#finishReason === 'tool_calls') !== (toolCalls.length > 0)) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID')
    const assistantMessage = Object.freeze({
      role: 'assistant', content: this.#content.length === 0 ? null : this.#content,
      ...(this.#reasoning.length === 0 ? {} : { reasoning: this.#reasoning }),
      ...(this.#reasoningDetails.length === 0 ? {} : { reasoning_details: Object.freeze(this.#reasoningDetails.map((item) => Object.freeze({ ...item }))) }),
      ...(this.#annotations.length === 0 ? {} : { annotations: Object.freeze(this.#annotations.map((item) => Object.freeze({ ...item }))) }),
      ...(toolCalls.length === 0 ? {} : { tool_calls: Object.freeze(toolCalls) }),
    })
    this.#consume(assistantMessage)
    return Object.freeze({ assistantMessage, responseId: this.#id, model: this.#model, provider: this.#provider,
      finishReason: this.#finishReason, usage: this.#usage })
  }

  #mergeIdentity(kind: 'id' | 'model', value: unknown, optional = false): void {
    if (value === undefined && optional) return
    if (typeof value !== 'string' || value.length === 0) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
    const current = kind === 'id' ? this.#id : this.#model
    if (current !== undefined && current !== value) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID')
    if (kind === 'id') this.#id = value; else this.#model = value
  }

  #mergeToolCalls(value: unknown): void {
    if (!Array.isArray(value) || value.length === 0 || value.length > 128) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
    for (const raw of value) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
      const input = raw as Record<string, unknown>
      if (!Number.isSafeInteger(input.index) || (input.index as number) < 0 || (input.index as number) >= 128) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
      const index = input.index as number
      const current = this.#toolCalls.get(index) ?? { arguments: '' }
      if (input.id !== undefined) {
        if (typeof input.id !== 'string' || current.id && current.id !== input.id) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID')
        current.id = input.id
      }
      if (input.type !== undefined && input.type !== 'function') return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
      if (input.function !== undefined) {
        if (!input.function || typeof input.function !== 'object' || Array.isArray(input.function)) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
        const fn = input.function as Record<string, unknown>
        if (fn.name !== undefined) {
          if (typeof fn.name !== 'string' || current.name && current.name !== fn.name) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_SEQUENCE_INVALID')
          current.name = fn.name
        }
        if (fn.arguments !== undefined) {
          if (typeof fn.arguments !== 'string') return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
          this.#consume(fn.arguments); current.arguments += fn.arguments
        }
      }
      this.#toolCalls.set(index, current)
    }
  }

  #consume(value: unknown): void {
    const size = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).byteLength
    this.#nativeBytes += size
    if (this.#nativeBytes > MAX_NATIVE_BYTES) return fail('GENERATION_V2_OPENROUTER_CHAT_STREAM_LIMIT_EXCEEDED')
  }
}

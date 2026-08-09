import { createAnthropicMessagesNativeContentAccumulator } from '@/next/provider/anthropic/anthropicMessagesNativeContentAccumulator'
import {
  assertFinalAnthropicProviderNativeSnapshot,
  MAX_ANTHROPIC_NATIVE_SNAPSHOT_BYTES,
  type AnthropicProviderNativeSnapshot,
} from '@/next/provider/anthropic/anthropicProviderNativeContent'

export const ANTHROPIC_MESSAGES_SSE_MAX_PENDING_FRAME_BYTES_V1 = 8 * 1_024 * 1_024
export const ANTHROPIC_MESSAGES_STREAM_MAX_AGGREGATE_BYTES_V1 = MAX_ANTHROPIC_NATIVE_SNAPSHOT_BYTES
const MAX_WIRE_BYTES = 32 * 1_024 * 1_024

const EVENT_TYPES = new Set([
  'message_start', 'content_block_start', 'content_block_delta', 'content_block_stop',
  'message_delta', 'message_stop', 'ping',
])

const STOP_REASONS = new Set([
  'end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal',
])

export type AnthropicMessagesNamedSseEventV1 =
  | Readonly<{ type: 'event'; eventName: string; value: Readonly<Record<string, unknown>> }>
  | Readonly<{ type: 'comment'; text: string }>

export type AnthropicMessagesVisibleDeltaV1 =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'thinking'; text: string }>

export class AnthropicMessagesChatStreamV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_SSE_INVALID'
    | 'GENERATION_V2_ANTHROPIC_SSE_PREMATURE_EOF'
    | 'GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT'
    | 'GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID'
    | 'GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID'
    | 'GENERATION_V2_ANTHROPIC_STREAM_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'AnthropicMessagesChatStreamV1Error'
  }
}

function fail(code: AnthropicMessagesChatStreamV1Error['code']): never {
  throw new AnthropicMessagesChatStreamV1Error(code)
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return fail('GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT')
  }
  return value as Readonly<Record<string, unknown>>
}

function nonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || /\u0000/u.test(value)) {
    return fail('GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT')
  }
  return value
}

function index(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return fail('GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT')
  }
  return value as number
}

function usage(value: unknown, requiredTokenField: 'input_tokens' | 'output_tokens'): Readonly<Record<string, unknown>> {
  const result = record(value)
  if (!Number.isSafeInteger(result[requiredTokenField]) || (result[requiredTokenField] as number) < 0) {
    return fail('GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT')
  }
  return result
}

export class AnthropicMessagesNamedSseDecoderV1 {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true })
  #buffer = ''
  #trailingCr = false
  #wireBytes = 0
  #finished = false

  push(bytes: Uint8Array): readonly AnthropicMessagesNamedSseEventV1[] {
    if (this.#finished || !ArrayBuffer.isView(bytes) || Object.prototype.toString.call(bytes) !== '[object Uint8Array]') {
      return fail('GENERATION_V2_ANTHROPIC_SSE_INVALID')
    }
    this.#wireBytes += bytes.byteLength
    if (this.#wireBytes > MAX_WIRE_BYTES) return fail('GENERATION_V2_ANTHROPIC_STREAM_LIMIT_EXCEEDED')
    try {
      this.#append(this.#decoder.decode(bytes, { stream: true }))
      return this.#drain()
    } catch (error) {
      if (error instanceof AnthropicMessagesChatStreamV1Error) throw error
      return fail('GENERATION_V2_ANTHROPIC_SSE_INVALID')
    }
  }

  finish(): readonly AnthropicMessagesNamedSseEventV1[] {
    if (this.#finished) return fail('GENERATION_V2_ANTHROPIC_SSE_INVALID')
    this.#finished = true
    try {
      this.#append(this.#decoder.decode())
      if (this.#trailingCr) {
        this.#buffer += '\n'
        this.#trailingCr = false
      }
      const events = this.#drain()
      if (this.#buffer.length !== 0) return fail('GENERATION_V2_ANTHROPIC_SSE_PREMATURE_EOF')
      return events
    } catch (error) {
      if (error instanceof AnthropicMessagesChatStreamV1Error) throw error
      return fail('GENERATION_V2_ANTHROPIC_SSE_INVALID')
    }
  }

  #append(text: string): void {
    if (this.#trailingCr) {
      text = `\r${text}`
      this.#trailingCr = false
    }
    if (text.endsWith('\r')) {
      text = text.slice(0, -1)
      this.#trailingCr = true
    }
    this.#buffer += text.replace(/\r\n?|\n/gu, '\n')
    if (new TextEncoder().encode(this.#buffer).byteLength > ANTHROPIC_MESSAGES_SSE_MAX_PENDING_FRAME_BYTES_V1) {
      return fail('GENERATION_V2_ANTHROPIC_STREAM_LIMIT_EXCEEDED')
    }
  }

  #drain(): readonly AnthropicMessagesNamedSseEventV1[] {
    const events: AnthropicMessagesNamedSseEventV1[] = []
    while (true) {
      const boundary = this.#buffer.indexOf('\n\n')
      if (boundary < 0) break
      const frame = this.#buffer.slice(0, boundary)
      this.#buffer = this.#buffer.slice(boundary + 2)
      if (frame.length === 0) continue
      events.push(...decodeFrame(frame))
    }
    return Object.freeze(events)
  }
}

function decodeFrame(frame: string): readonly AnthropicMessagesNamedSseEventV1[] {
  let eventName: string | undefined
  const data: string[] = []
  const comments: AnthropicMessagesNamedSseEventV1[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) {
      comments.push(Object.freeze({ type: 'comment', text: line.slice(1).replace(/^ /u, '') }))
    } else if (line === 'event' || line.startsWith('event:')) {
      if (eventName !== undefined) return fail('GENERATION_V2_ANTHROPIC_SSE_INVALID')
      eventName = line === 'event' ? '' : line.slice(6).replace(/^ /u, '')
    } else if (line === 'data' || line.startsWith('data:')) {
      data.push(line === 'data' ? '' : line.slice(5).replace(/^ /u, ''))
    } else {
      return fail('GENERATION_V2_ANTHROPIC_SSE_INVALID')
    }
  }
  if (data.length === 0) {
    if (eventName !== undefined) return fail('GENERATION_V2_ANTHROPIC_SSE_INVALID')
    return Object.freeze(comments)
  }
  const raw = data.join('\n')
  if (!eventName || raw === '[DONE]') return fail('GENERATION_V2_ANTHROPIC_SSE_INVALID')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return fail('GENERATION_V2_ANTHROPIC_SSE_INVALID') }
  const value = record(parsed)
  if (value.type !== eventName || !EVENT_TYPES.has(eventName)) {
    return fail('GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT')
  }
  return Object.freeze([...comments, Object.freeze({ type: 'event' as const, eventName, value })])
}

export class AnthropicMessagesStreamAssemblerV1 {
  #accumulator: ReturnType<typeof createAnthropicMessagesNativeContentAccumulator> | null = null
  #nextBlockIndex = 0
  readonly #openBlocks = new Set<number>()
  readonly #closedBlocks = new Set<number>()
  #messageStarted = false
  #messageDeltaSeen = false
  #stopReasonSeen = false
  #messageStopped = false
  #aggregateBytes = 0
  #snapshot: AnthropicProviderNativeSnapshot | null = null

  push(event: AnthropicMessagesNamedSseEventV1): void {
    if (this.#messageStopped) return fail('GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID')
    if (event.type === 'comment') return
    this.#aggregateBytes += new TextEncoder().encode(JSON.stringify(event.value)).byteLength
    if (this.#aggregateBytes > ANTHROPIC_MESSAGES_STREAM_MAX_AGGREGATE_BYTES_V1) {
      return fail('GENERATION_V2_ANTHROPIC_STREAM_LIMIT_EXCEEDED')
    }
    const value = event.value
    switch (event.eventName) {
      case 'ping':
        return
      case 'message_start': {
        if (this.#messageStarted) return fail('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')
        const message = record(value.message)
        const messageId = nonEmptyString(message.id)
        nonEmptyString(message.model)
        usage(message.usage, 'input_tokens')
        this.#messageStarted = true
        this.#accumulator = createAnthropicMessagesNativeContentAccumulator({ messageId })
        this.#accumulator.ingestEvent(value)
        return
      }
      case 'content_block_start': {
        this.#requireStartedBeforeDelta()
        if (this.#messageDeltaSeen) return fail('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')
        const blockIndex = index(value.index)
        if (blockIndex !== this.#nextBlockIndex || this.#openBlocks.has(blockIndex) || this.#closedBlocks.has(blockIndex)) {
          return fail('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')
        }
        record(value.content_block)
        this.#nextBlockIndex++
        this.#openBlocks.add(blockIndex)
        this.#accumulator!.ingestEvent(value)
        return
      }
      case 'content_block_delta': {
        this.#requireStartedBeforeDelta()
        if (this.#messageDeltaSeen) return fail('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')
        const blockIndex = index(value.index)
        if (!this.#openBlocks.has(blockIndex)) return fail('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')
        const delta = record(value.delta)
        const deltaType = nonEmptyString(delta.type)
        if (!['text_delta', 'thinking_delta', 'signature_delta', 'input_json_delta'].includes(deltaType)) {
          return fail('GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT')
        }
        if ((deltaType === 'text_delta' && typeof delta.text !== 'string') ||
            (deltaType === 'thinking_delta' && typeof delta.thinking !== 'string') ||
            (deltaType === 'signature_delta' && typeof delta.signature !== 'string') ||
            (deltaType === 'input_json_delta' && typeof delta.partial_json !== 'string')) {
          return fail('GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT')
        }
        this.#accumulator!.ingestEvent(value)
        return
      }
      case 'content_block_stop': {
        this.#requireStartedBeforeDelta()
        if (this.#messageDeltaSeen) return fail('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')
        const blockIndex = index(value.index)
        if (!this.#openBlocks.delete(blockIndex) || this.#closedBlocks.has(blockIndex)) {
          return fail('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')
        }
        this.#closedBlocks.add(blockIndex)
        this.#accumulator!.ingestEvent(value)
        return
      }
      case 'message_delta': {
        this.#requireStartedBeforeDelta()
        if (this.#messageDeltaSeen || this.#openBlocks.size > 0 || this.#nextBlockIndex === 0) {
          return fail('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')
        }
        const delta = record(value.delta)
        const stopReason = nonEmptyString(delta.stop_reason)
        if (!STOP_REASONS.has(stopReason)) return fail('GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT')
        if (delta.stop_sequence !== null && typeof delta.stop_sequence !== 'string') {
          return fail('GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT')
        }
        usage(value.usage, 'output_tokens')
        this.#messageDeltaSeen = true
        this.#stopReasonSeen = true
        this.#accumulator!.ingestEvent(value)
        return
      }
      case 'message_stop': {
        this.#requireStartedBeforeDelta()
        if (!this.#messageDeltaSeen || !this.#stopReasonSeen || this.#openBlocks.size > 0 ||
            this.#closedBlocks.size !== this.#nextBlockIndex) {
          return fail('GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID')
        }
        const events = this.#accumulator!.ingestEvent(value)
        const upsert = events.find((item) => item.type === 'message.provider_native_content_upsert')
        if (!upsert || upsert.type !== 'message.provider_native_content_upsert') {
          return fail('GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID')
        }
        try { this.#snapshot = assertFinalAnthropicProviderNativeSnapshot(upsert.snapshot) } catch {
          return fail('GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID')
        }
        this.#messageStopped = true
        return
      }
      default:
        return fail('GENERATION_V2_ANTHROPIC_STREAM_INVALID_EVENT')
    }
  }

  finish(): AnthropicProviderNativeSnapshot {
    if (!this.#messageStopped || !this.#snapshot) return fail('GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID')
    return this.#snapshot
  }

  #requireStartedBeforeDelta(): void {
    if (!this.#messageStarted || !this.#accumulator) return fail('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')
  }
}

export class AnthropicMessagesChatStreamV1 {
  readonly #decoder = new AnthropicMessagesNamedSseDecoderV1()
  readonly #assembler = new AnthropicMessagesStreamAssemblerV1()

  push(bytes: Uint8Array): readonly AnthropicMessagesVisibleDeltaV1[] {
    const visible: AnthropicMessagesVisibleDeltaV1[] = []
    for (const event of this.#decoder.push(bytes)) {
      this.#assembler.push(event)
      if (event.type === 'event' && event.eventName === 'content_block_delta') {
        const delta = event.value.delta
        if (delta && typeof delta === 'object' && !Array.isArray(delta) &&
            (delta as Record<string, unknown>).type === 'text_delta') {
          visible.push(Object.freeze({ type: 'text' as const, text: (delta as Record<string, unknown>).text as string }))
        } else if (delta && typeof delta === 'object' && !Array.isArray(delta) &&
            (delta as Record<string, unknown>).type === 'thinking_delta') {
          visible.push(Object.freeze({ type: 'thinking' as const, text: (delta as Record<string, unknown>).thinking as string }))
        }
      }
    }
    return Object.freeze(visible)
  }

  finish(): AnthropicProviderNativeSnapshot {
    for (const event of this.#decoder.finish()) this.#assembler.push(event)
    try { return this.#assembler.finish() } catch (error) {
      if (error instanceof AnthropicMessagesChatStreamV1Error &&
          error.code === 'GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID') {
        return fail('GENERATION_V2_ANTHROPIC_SSE_PREMATURE_EOF')
      }
      throw error
    }
  }
}

export { AnthropicMessagesChatStreamV1 as AnthropicChatStreamV1 }

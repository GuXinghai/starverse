import type { DeepSeekNativeAssistantMessageV1, DeepSeekNativeFunctionToolCallV1 } from './nativeMessagesV1'

export type DeepSeekStableFinishReasonV1 =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_calls'
  | 'insufficient_system_resource'

export type DeepSeekStableUsageV1 = Readonly<{
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
  prompt_tokens_details?: Readonly<{ cached_tokens: number }>
  completion_tokens_details?: Readonly<{ reasoning_tokens: number }>
}>

export type DeepSeekStableStreamDeltaV1 = Readonly<{
  contentDelta?: string
  reasoningDelta?: string
  toolCallDeltas?: readonly Readonly<{
    index: number
    id?: string
    name?: string
    argumentsDelta?: string
  }>[]
  finishReason?: DeepSeekStableFinishReasonV1
  usage?: DeepSeekStableUsageV1
}>

export type DeepSeekStableStreamResultV1 = Readonly<{
  assistantMessage: DeepSeekNativeAssistantMessageV1
  generatedWithThinking: 'enabled' | 'disabled'
  finishReason: DeepSeekStableFinishReasonV1
  usage?: DeepSeekStableUsageV1
  responseMetadata: Readonly<{
    id: string
    model: string
    created: number
    systemFingerprint: string
  }>
}>

export type DeepSeekStableSseEventV1 =
  | Readonly<{ type: 'json'; value: unknown; raw: string }>
  | Readonly<{ type: 'done' }>
  | Readonly<{ type: 'comment'; text: string }>

export const DEEPSEEK_STABLE_STREAM_MAX_NATIVE_OUTPUT_BYTES_V1 = 20 * 1_024 * 1_024
export const DEEPSEEK_STABLE_SSE_MAX_PENDING_FRAME_BYTES_V1 = 8 * 1_024 * 1_024
const SSE_DECODE_SLICE_BYTES = 64 * 1_024

export class DeepSeekStableChatStreamV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_STREAM_INVALID_SHAPE'
    | 'GENERATION_V2_DEEPSEEK_STREAM_UNKNOWN_FIELD'
    | 'GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE'
    | 'GENERATION_V2_DEEPSEEK_STREAM_METADATA_MISMATCH'
    | 'GENERATION_V2_DEEPSEEK_STREAM_SEQUENCE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_STREAM_TOOL_CALL_INCOMPLETE'
    | 'GENERATION_V2_DEEPSEEK_THINKING_REASONING_CONTENT_REQUIRED'
    | 'GENERATION_V2_DEEPSEEK_STREAM_TERMINAL_INVALID'
    | 'GENERATION_V2_DEEPSEEK_STREAM_LIMIT_EXCEEDED'
    | 'GENERATION_V2_DEEPSEEK_SSE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_SSE_PREMATURE_EOF',
    readonly diagnostic: Readonly<{
      path: string
      unknownFields: readonly string[]
      currentValue: Readonly<Record<string, unknown>>
    }> | null = null) {
    super(code)
    this.name = 'DeepSeekStableChatStreamV1Error'
  }
}

type ClosedObject = Readonly<Record<string, unknown>>
type MutableToolCall = { id?: string; type?: 'function'; name?: string; arguments: string }
type MutableState = {
  id?: string
  model?: string
  created?: number
  systemFingerprint?: string
  content: string
  reasoningContent: string
  toolCalls: Map<number, MutableToolCall>
  finishReason?: DeepSeekStableFinishReasonV1
  usage?: DeepSeekStableUsageV1
  usageSeen: boolean
  outputBytes: number
  done: boolean
}

const FINISH_REASONS = new Set<DeepSeekStableFinishReasonV1>([
  'stop', 'length', 'content_filter', 'tool_calls', 'insufficient_system_resource',
])
const streamResults = new WeakSet<object>()

export function isDeepSeekStableStreamResultV1(value: unknown): value is DeepSeekStableStreamResultV1 {
  return Boolean(value && typeof value === 'object' && streamResults.has(value))
}

function closedObject(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
  path = '$',
): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_SHAPE')
  }
  const keys = Object.keys(descriptors)
  const unknownFields = keys.filter((key) => !allowed.includes(key))
  if (unknownFields.length > 0) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_UNKNOWN_FIELD', Object.freeze({
      path,
      unknownFields: Object.freeze(unknownFields),
      currentValue: Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value]))),
    }))
  }
  if (required.some((key) => !keys.includes(key))) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_SHAPE')
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function denseArray(value: unknown, max: number, allowEmpty = false): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > max || (!allowEmpty && value.length === 0)) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_SHAPE')
  }
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function nonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
  }
  return value as number
}

function decodeUsage(value: unknown): DeepSeekStableUsageV1 | undefined {
  if (value === null || value === undefined) return undefined
  const input = closedObject(value, [
    'prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens',
    'prompt_cache_miss_tokens', 'prompt_tokens_details', 'completion_tokens_details',
  ], ['prompt_tokens', 'completion_tokens', 'total_tokens'], '$.usage')
  const promptDetails = input.prompt_tokens_details === undefined
    ? undefined
    : (() => {
      const raw = closedObject(input.prompt_tokens_details, ['cached_tokens'], ['cached_tokens'], '$.usage.prompt_tokens_details')
      return Object.freeze({ cached_tokens: nonNegativeInteger(raw.cached_tokens) })
    })()
  const details = input.completion_tokens_details === undefined
    ? undefined
    : (() => {
      const raw = closedObject(input.completion_tokens_details, ['reasoning_tokens'], ['reasoning_tokens'], '$.usage.completion_tokens_details')
      return Object.freeze({ reasoning_tokens: nonNegativeInteger(raw.reasoning_tokens) })
    })()
  return Object.freeze({
    prompt_tokens: nonNegativeInteger(input.prompt_tokens),
    completion_tokens: nonNegativeInteger(input.completion_tokens),
    total_tokens: nonNegativeInteger(input.total_tokens),
    ...(input.prompt_cache_hit_tokens === undefined ? {} : { prompt_cache_hit_tokens: nonNegativeInteger(input.prompt_cache_hit_tokens) }),
    ...(input.prompt_cache_miss_tokens === undefined ? {} : { prompt_cache_miss_tokens: nonNegativeInteger(input.prompt_cache_miss_tokens) }),
    ...(promptDetails ? { prompt_tokens_details: promptDetails } : {}),
    ...(details ? { completion_tokens_details: details } : {}),
  })
}

function stringOrNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value === 'string') return value
  throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
}

function decodeToolCallDelta(value: unknown): Readonly<{
  index: number
  id?: string
  type?: 'function'
  name?: string
  argumentsDelta?: string
}> {
  const input = closedObject(value, ['index', 'id', 'type', 'function'], ['index'], '$.choices[0].delta.tool_calls[]')
  const index = nonNegativeInteger(input.index)
  if (index >= 128 || (input.id !== undefined && (typeof input.id !== 'string' || input.id.length === 0)) ||
      (input.type !== undefined && input.type !== 'function')) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
  }
  const fn = input.function === undefined
    ? undefined
    : closedObject(input.function, ['name', 'arguments'], [], '$.choices[0].delta.tool_calls[].function')
  if ((fn?.name !== undefined && (typeof fn.name !== 'string' || fn.name.length === 0)) ||
      (fn?.arguments !== undefined && typeof fn.arguments !== 'string')) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
  }
  return Object.freeze({
    index,
    ...(input.id === undefined ? {} : { id: input.id as string }),
    ...(input.type === undefined ? {} : { type: 'function' as const }),
    ...(fn?.name === undefined ? {} : { name: fn.name as string }),
    ...(fn?.arguments === undefined ? {} : { argumentsDelta: fn.arguments as string }),
  })
}

function mergeMetadata(state: MutableState, input: ClosedObject): void {
  const values = [
    ['id', input.id], ['model', input.model], ['systemFingerprint', input.system_fingerprint],
  ] as const
  for (const [key, value] of values) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
    }
    const current = state[key]
    if (current !== undefined && current !== value) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_METADATA_MISMATCH')
    }
    if (current === undefined) consumeOutputString(state, value)
    state[key] = value
  }
  const created = nonNegativeInteger(input.created)
  if (state.created !== undefined && state.created !== created) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_METADATA_MISMATCH')
  }
  state.created = created
}

function consumeOutputString(state: MutableState, value: string): void {
  state.outputBytes += new TextEncoder().encode(value).byteLength
  if (state.outputBytes > DEEPSEEK_STABLE_STREAM_MAX_NATIVE_OUTPUT_BYTES_V1) {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_LIMIT_EXCEEDED')
  }
}

export class DeepSeekStableChatStreamAssemblerV1 {
  readonly #state: MutableState = {
    content: '', reasoningContent: '', toolCalls: new Map(), usageSeen: false, outputBytes: 0, done: false,
  }

  constructor(readonly thinkingMode: 'enabled' | 'disabled') {
    if (thinkingMode !== 'enabled' && thinkingMode !== 'disabled') {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
    }
  }

  pushChunk(value: unknown): DeepSeekStableStreamDeltaV1 {
    if (this.#state.done) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_SEQUENCE_INVALID')
    }
    const chunk = closedObject(value, [
      'id', 'choices', 'created', 'model', 'system_fingerprint', 'object', 'usage',
    ], ['id', 'choices', 'created', 'model', 'system_fingerprint', 'object'], '$')
    if (chunk.object !== 'chat.completion.chunk') {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
    }
    mergeMetadata(this.#state, chunk)
    const usage = decodeUsage(chunk.usage)
    const choices = denseArray(chunk.choices, 1, true)
    if (choices.length === 0) {
      if (!usage || this.#state.finishReason === undefined || this.#state.usageSeen) {
        throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_SEQUENCE_INVALID')
      }
      this.#state.usage = usage
      this.#state.usageSeen = true
      return Object.freeze({ usage })
    }
    if (this.#state.finishReason !== undefined) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_SEQUENCE_INVALID')
    }
    const choice = closedObject(choices[0], ['index', 'delta', 'finish_reason', 'logprobs'], ['index', 'delta', 'finish_reason'], '$.choices[0]')
    if (choice.index !== 0 || (choice.logprobs !== undefined && choice.logprobs !== null)) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
    }
    if (usage && (choice.finish_reason === null || this.#state.usageSeen)) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_SEQUENCE_INVALID')
    }
    const delta = closedObject(choice.delta, ['role', 'content', 'reasoning_content', 'tool_calls'], [], '$.choices[0].delta')
    if (delta.role !== undefined && delta.role !== 'assistant') {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
    }
    const content = stringOrNull(delta.content)
    const reasoning = stringOrNull(delta.reasoning_content)
    const toolDeltas = delta.tool_calls === undefined
      ? undefined
      : Object.freeze(denseArray(delta.tool_calls, 128).map(decodeToolCallDelta))
    if (content) {
      consumeOutputString(this.#state, content)
      this.#state.content += content
    }
    if (reasoning) {
      consumeOutputString(this.#state, reasoning)
      this.#state.reasoningContent += reasoning
    }
    if (toolDeltas) {
      for (const item of toolDeltas) {
        const target = this.#state.toolCalls.get(item.index) ?? { arguments: '' }
        if (item.id !== undefined) {
          if (target.id !== undefined && target.id !== item.id) throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_SEQUENCE_INVALID')
          if (target.id === undefined) consumeOutputString(this.#state, item.id)
          target.id = item.id
        }
        if (item.type !== undefined) target.type = item.type
        if (item.name !== undefined) {
          if (target.name !== undefined && target.name !== item.name) throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_SEQUENCE_INVALID')
          if (target.name === undefined) consumeOutputString(this.#state, item.name)
          target.name = item.name
        }
        if (item.argumentsDelta !== undefined) {
          consumeOutputString(this.#state, item.argumentsDelta)
          target.arguments += item.argumentsDelta
        }
        this.#state.toolCalls.set(item.index, target)
      }
    }
    let finishReason: DeepSeekStableFinishReasonV1 | undefined
    if (choice.finish_reason !== null) {
      if (typeof choice.finish_reason !== 'string' || !FINISH_REASONS.has(choice.finish_reason as DeepSeekStableFinishReasonV1)) {
        throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
      }
      finishReason = choice.finish_reason as DeepSeekStableFinishReasonV1
      this.#state.finishReason = finishReason
      if (usage) {
        this.#state.usage = usage
        this.#state.usageSeen = true
      }
      if (finishReason === 'tool_calls' && this.#state.toolCalls.size === 0) {
        throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_TOOL_CALL_INCOMPLETE')
      }
    }
    const result = Object.freeze({
      ...(content ? { contentDelta: content } : {}),
      ...(reasoning ? { reasoningDelta: reasoning } : {}),
      ...(toolDeltas ? { toolCallDeltas: Object.freeze(toolDeltas.map((item) => Object.freeze({
        index: item.index,
        ...(item.id === undefined ? {} : { id: item.id }),
        ...(item.name === undefined ? {} : { name: item.name }),
        ...(item.argumentsDelta === undefined ? {} : { argumentsDelta: item.argumentsDelta }),
      }))) } : {}),
      ...(finishReason ? { finishReason } : {}),
      ...(usage ? { usage } : {}),
    })
    return result
  }

  acceptDone(): DeepSeekStableStreamResultV1 {
    if (this.#state.done || !this.#state.finishReason || !this.#state.id || !this.#state.model ||
        this.#state.created === undefined || !this.#state.systemFingerprint || !this.#state.usageSeen || !this.#state.usage) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_TERMINAL_INVALID')
    }
    const indexes = [...this.#state.toolCalls.keys()].sort((left, right) => left - right)
    if (indexes.some((index, position) => index !== position)) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_TOOL_CALL_INCOMPLETE')
    }
    const toolCalls: DeepSeekNativeFunctionToolCallV1[] = indexes.map((index) => {
      const call = this.#state.toolCalls.get(index)!
      if (!call.id || call.type !== 'function' || !call.name) {
        throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_TOOL_CALL_INCOMPLETE')
      }
      return Object.freeze({
        id: call.id,
        type: 'function',
        function: Object.freeze({ name: call.name, arguments: call.arguments }),
      })
    })
    if ((this.#state.finishReason === 'tool_calls') !== (toolCalls.length > 0)) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_TERMINAL_INVALID')
    }
    if (this.thinkingMode === 'enabled' && toolCalls.length > 0 && this.#state.reasoningContent.length === 0) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_THINKING_REASONING_CONTENT_REQUIRED')
    }
    this.#state.done = true
    const result = Object.freeze({
      assistantMessage: Object.freeze({
        role: 'assistant',
        content: this.#state.content.length === 0 ? null : this.#state.content,
        ...(this.#state.reasoningContent.length === 0 ? {} : { reasoning_content: this.#state.reasoningContent }),
        ...(toolCalls.length === 0 ? {} : { tool_calls: Object.freeze(toolCalls) }),
      }),
      generatedWithThinking: this.thinkingMode,
      finishReason: this.#state.finishReason,
      ...(this.#state.usage ? { usage: this.#state.usage } : {}),
      responseMetadata: Object.freeze({
        id: this.#state.id,
        model: this.#state.model,
        created: this.#state.created,
        systemFingerprint: this.#state.systemFingerprint,
      }),
    })
    streamResults.add(result)
    return result
  }
}

export class DeepSeekStableSseDecoderV1 {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true })
  #buffer = ''
  #pendingWireBytes = 0
  #doneSeen = false
  #finished = false

  push(bytes: Uint8Array): readonly DeepSeekStableSseEventV1[] {
    if (this.#finished || !ArrayBuffer.isView(bytes) || bytes instanceof DataView || bytes.BYTES_PER_ELEMENT !== 1 ||
        Object.prototype.toString.call(bytes) !== '[object Uint8Array]') {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_SSE_INVALID')
    }
    const events: DeepSeekStableSseEventV1[] = []
    for (let offset = 0; offset < bytes.byteLength; offset += SSE_DECODE_SLICE_BYTES) {
      const slice = bytes.subarray(offset, Math.min(bytes.byteLength, offset + SSE_DECODE_SLICE_BYTES))
      try {
        this.#buffer += this.#decoder.decode(slice, { stream: true })
      } catch {
        throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_SSE_INVALID')
      }
      this.#pendingWireBytes += slice.byteLength
      events.push(...this.#validateEvents(this.#drain(false)))
      if (this.#pendingWireBytes > DEEPSEEK_STABLE_SSE_MAX_PENDING_FRAME_BYTES_V1) {
        throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_LIMIT_EXCEEDED')
      }
    }
    return Object.freeze(events)
  }

  finish(): readonly DeepSeekStableSseEventV1[] {
    if (this.#finished) throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_SSE_INVALID')
    this.#finished = true
    try {
      this.#buffer += this.#decoder.decode()
    } catch {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_SSE_INVALID')
    }
    const events = this.#validateEvents(this.#drain(true))
    if (this.#buffer.length > 0) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_SSE_PREMATURE_EOF')
    }
    if (!this.#doneSeen) throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_SSE_PREMATURE_EOF')
    return events
  }

  #drain(final: boolean): readonly DeepSeekStableSseEventV1[] {
    const events: DeepSeekStableSseEventV1[] = []
    while (true) {
      const match = /\r?\n\r?\n/u.exec(this.#buffer)
      if (!match || match.index === undefined) break
      const block = this.#buffer.slice(0, match.index)
      if (new TextEncoder().encode(block).byteLength > DEEPSEEK_STABLE_SSE_MAX_PENDING_FRAME_BYTES_V1) {
        throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_STREAM_LIMIT_EXCEEDED')
      }
      const consumed = this.#buffer.slice(0, match.index + match[0].length)
      this.#buffer = this.#buffer.slice(match.index + match[0].length)
      this.#pendingWireBytes -= new TextEncoder().encode(consumed).byteLength
      if (this.#pendingWireBytes < 0) this.#pendingWireBytes = 0
      events.push(...decodeEventBlock(block))
    }
    if (final && this.#buffer.trim().length === 0) this.#buffer = ''
    return Object.freeze(events)
  }

  #validateEvents(events: readonly DeepSeekStableSseEventV1[]): readonly DeepSeekStableSseEventV1[] {
    for (const event of events) {
      if (this.#doneSeen) throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_SSE_INVALID')
      if (event.type === 'done') {
        this.#doneSeen = true
      }
    }
    return events
  }
}

function decodeEventBlock(block: string): readonly DeepSeekStableSseEventV1[] {
  const data: string[] = []
  const comments: DeepSeekStableSseEventV1[] = []
  for (const line of block.split(/\r?\n/u)) {
    if (line.startsWith(':')) {
      comments.push(Object.freeze({ type: 'comment', text: line.slice(1).trimStart() }))
    } else if (line === 'data' || line.startsWith('data:')) {
      const value = line === 'data' ? '' : line.slice(5).replace(/^ /u, '')
      data.push(value)
    } else if (line.length > 0) {
      throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_SSE_INVALID')
    }
  }
  if (data.length === 0) return Object.freeze(comments)
  const raw = data.join('\n')
  if (raw === '[DONE]') return Object.freeze([...comments, Object.freeze({ type: 'done' as const })])
  try {
    return Object.freeze([...comments, Object.freeze({ type: 'json' as const, value: JSON.parse(raw), raw })])
  } catch {
    throw new DeepSeekStableChatStreamV1Error('GENERATION_V2_DEEPSEEK_SSE_INVALID')
  }
}

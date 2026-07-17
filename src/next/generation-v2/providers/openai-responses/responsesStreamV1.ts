import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  decodeOpenAIResponsesReturnedItemsV1,
  type OpenAIResponsesReturnedItemV1,
} from './nativeItemsV1'

const MAX_EVENT_BYTES = 24 * 1024 * 1024
const MAX_STREAM_BYTES = 64 * 1024 * 1024
const RESPONSE_FIELDS = new Set([
  'id', 'object', 'created_at', 'status', 'background', 'completed_at', 'conversation', 'error',
  'incomplete_details', 'instructions', 'max_output_tokens', 'max_tool_calls', 'model', 'output',
  'parallel_tool_calls', 'previous_response_id', 'prompt', 'prompt_cache_key', 'prompt_cache_retention',
  'reasoning', 'safety_identifier', 'service_tier', 'store', 'temperature', 'text', 'tool_choice',
  'tools', 'top_logprobs', 'top_p', 'truncation', 'usage', 'user', 'metadata', 'billing',
])
const SUPPORTED_EVENT_TYPES = new Set([
  'response.created', 'response.queued', 'response.in_progress', 'response.completed', 'response.failed',
  'response.incomplete', 'response.output_item.added', 'response.output_item.done',
  'response.content_part.added', 'response.content_part.done', 'response.output_text.annotation.added',
  'response.output_text.delta', 'response.output_text.done', 'response.refusal.delta', 'response.refusal.done',
  'response.reasoning_summary_part.added', 'response.reasoning_summary_part.done',
  'response.reasoning_summary_text.delta', 'response.reasoning_summary_text.done',
  'response.reasoning_text.delta', 'response.reasoning_text.done',
  'response.function_call_arguments.delta', 'response.function_call_arguments.done',
  'response.web_search_call.in_progress', 'response.web_search_call.searching', 'response.web_search_call.completed',
  'response.image_generation_call.in_progress', 'response.image_generation_call.generating',
  'response.image_generation_call.partial_image', 'response.image_generation_call.completed',
])
const NON_AUTHORITATIVE_EVENT_TYPES = new Set([...SUPPORTED_EVENT_TYPES].filter((type) => ![
  'response.completed', 'response.failed', 'response.incomplete', 'response.output_item.done',
  'response.output_text.delta', 'response.refusal.delta', 'response.reasoning_summary_text.delta',
].includes(type)))

type ClosedObject = Readonly<Record<string, unknown>>
type TerminalKind = 'completed' | 'failed' | 'incomplete'
const terminalResults = new WeakSet<object>()

export type OpenAIResponsesUsageV1 = Readonly<{
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number | null
  reasoningTokens: number | null
}>

export type OpenAIResponsesTerminalResultV1 = Readonly<{
  terminalKind: TerminalKind
  responseId: string
  model: string
  createdAt: number
  completedAt: number | null
  output: readonly OpenAIResponsesReturnedItemV1[]
  visibleText: string
  reasoningSummaryText: string
  usage: OpenAIResponsesUsageV1 | null
  error: Readonly<{ code: string; message: string }> | null
  incompleteReason: string | null
}>

export type OpenAIResponsesStreamEventV1 = Readonly<{
  type: string
  sequenceNumber: number
  value: ClosedObject
}>

export function isOpenAIResponsesTerminalResultV1(
  value: unknown,
): value is OpenAIResponsesTerminalResultV1 {
  return Boolean(value && typeof value === 'object' && terminalResults.has(value))
}

export class OpenAIResponsesStreamV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_STREAM_INVALID_SSE'
    | 'GENERATION_V2_OPENAI_STREAM_LIMIT_EXCEEDED'
    | 'GENERATION_V2_OPENAI_STREAM_INVALID_EVENT'
    | 'GENERATION_V2_OPENAI_STREAM_SEQUENCE_INVALID'
    | 'GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID'
    | 'GENERATION_V2_OPENAI_STREAM_INCONSISTENT') {
    super(code)
    this.name = 'OpenAIResponsesStreamV1Error'
  }
}

function fail(code: OpenAIResponsesStreamV1Error['code']): never {
  throw new OpenAIResponsesStreamV1Error(code)
}

function closedObject(value: unknown, allowed?: ReadonlySet<string>): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) ||
      (allowed && Object.keys(descriptors).some((key) => !allowed.has(key)))) {
    return fail('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
  }
  return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])))
}

function boundedString(value: unknown, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > 4 * 1024 * 1024 || /\u0000/u.test(value)) {
    return fail('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
  }
  return value
}

function nonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return fail('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
  return value as number
}

export class OpenAIResponsesTypedSseDecoderV1 {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true })
  #buffer = ''
  #wireBytes = 0
  #lastSequence: number | null = null
  #finished = false

  #events(text: string): OpenAIResponsesStreamEventV1[] {
    this.#buffer += text.replace(/\r\n?/gu, '\n')
    if (Buffer.byteLength(this.#buffer, 'utf8') > MAX_EVENT_BYTES) return fail('GENERATION_V2_OPENAI_STREAM_LIMIT_EXCEEDED')
    const output: OpenAIResponsesStreamEventV1[] = []
    while (true) {
      const boundary = this.#buffer.indexOf('\n\n')
      if (boundary < 0) break
      const frame = this.#buffer.slice(0, boundary)
      this.#buffer = this.#buffer.slice(boundary + 2)
      if (frame.length === 0 || frame.startsWith(':')) continue
      let eventName: string | undefined
      const data: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) {
          if (eventName !== undefined) return fail('GENERATION_V2_OPENAI_STREAM_INVALID_SSE')
          eventName = line.slice(6).trimStart()
        } else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
        else if (!line.startsWith(':')) return fail('GENERATION_V2_OPENAI_STREAM_INVALID_SSE')
      }
      const dataText = data.join('\n')
      if (!eventName || data.length === 0 || dataText === '[DONE]') return fail('GENERATION_V2_OPENAI_STREAM_INVALID_SSE')
      let parsed: unknown
      try { parsed = JSON.parse(dataText) } catch { return fail('GENERATION_V2_OPENAI_STREAM_INVALID_SSE') }
      const value = closedObject(parsed)
      if (value.type !== eventName || typeof value.type !== 'string' || !SUPPORTED_EVENT_TYPES.has(eventName)) {
        return fail('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
      }
      const sequence = nonnegativeInteger(value.sequence_number)
      if (this.#lastSequence !== null && sequence !== this.#lastSequence + 1) {
        return fail('GENERATION_V2_OPENAI_STREAM_SEQUENCE_INVALID')
      }
      this.#lastSequence = sequence
      output.push(Object.freeze({ type: eventName, sequenceNumber: sequence, value }))
    }
    return output
  }

  push(bytes: Uint8Array): readonly OpenAIResponsesStreamEventV1[] {
    if (this.#finished || !ArrayBuffer.isView(bytes) || Object.prototype.toString.call(bytes) !== '[object Uint8Array]') {
      return fail('GENERATION_V2_OPENAI_STREAM_INVALID_SSE')
    }
    this.#wireBytes += bytes.byteLength
    if (this.#wireBytes > MAX_STREAM_BYTES) return fail('GENERATION_V2_OPENAI_STREAM_LIMIT_EXCEEDED')
    try { return Object.freeze(this.#events(this.#decoder.decode(bytes, { stream: true }))) } catch (error) {
      if (error instanceof OpenAIResponsesStreamV1Error) throw error
      return fail('GENERATION_V2_OPENAI_STREAM_INVALID_SSE')
    }
  }

  finish(): readonly OpenAIResponsesStreamEventV1[] {
    if (this.#finished) return fail('GENERATION_V2_OPENAI_STREAM_INVALID_SSE')
    this.#finished = true
    let events: OpenAIResponsesStreamEventV1[]
    try { events = this.#events(this.#decoder.decode()) } catch (error) {
      if (error instanceof OpenAIResponsesStreamV1Error) throw error
      return fail('GENERATION_V2_OPENAI_STREAM_INVALID_SSE')
    }
    if (this.#buffer.length !== 0) return fail('GENERATION_V2_OPENAI_STREAM_INVALID_SSE')
    return Object.freeze(events)
  }
}

function optionalInteger(value: unknown): number | null {
  return value === null ? null : nonnegativeInteger(value)
}

function usage(value: unknown): OpenAIResponsesUsageV1 | null {
  if (value === null) return null
  const input = closedObject(value, new Set(['input_tokens', 'output_tokens', 'total_tokens', 'input_tokens_details', 'output_tokens_details']))
  const inputDetails = input.input_tokens_details === undefined || input.input_tokens_details === null
    ? null : closedObject(input.input_tokens_details, new Set(['cached_tokens']))
  const outputDetails = input.output_tokens_details === undefined || input.output_tokens_details === null
    ? null : closedObject(input.output_tokens_details, new Set(['reasoning_tokens']))
  const result = Object.freeze({
    inputTokens: nonnegativeInteger(input.input_tokens),
    outputTokens: nonnegativeInteger(input.output_tokens),
    totalTokens: nonnegativeInteger(input.total_tokens),
    cachedInputTokens: inputDetails?.cached_tokens === undefined ? null : nonnegativeInteger(inputDetails.cached_tokens),
    reasoningTokens: outputDetails?.reasoning_tokens === undefined ? null : nonnegativeInteger(outputDetails.reasoning_tokens),
  })
  return result
}

function terminal(event: OpenAIResponsesStreamEventV1): OpenAIResponsesTerminalResultV1 {
  const expected = event.type === 'response.completed' ? 'completed'
    : event.type === 'response.failed' ? 'failed'
      : event.type === 'response.incomplete' ? 'incomplete' : null
  if (!expected) return fail('GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID')
  const response = closedObject(event.value.response, RESPONSE_FIELDS)
  if (response.object !== 'response' || response.status !== expected) return fail('GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID')
  const error = response.error === null ? null : (() => {
    const value = closedObject(response.error, new Set(['code', 'message']))
    return Object.freeze({ code: boundedString(value.code), message: boundedString(value.message) })
  })()
  const incomplete = response.incomplete_details === null ? null : (() => {
    const value = closedObject(response.incomplete_details, new Set(['reason']))
    return boundedString(value.reason)
  })()
  if ((expected === 'failed') !== Boolean(error) || (expected === 'incomplete') !== Boolean(incomplete)) {
    return fail('GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID')
  }
  if (!Array.isArray(response.output)) return fail('GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID')
  let output: readonly OpenAIResponsesReturnedItemV1[]
  try { output = decodeOpenAIResponsesReturnedItemsV1(response.output) } catch {
    return fail('GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID')
  }
  const visibleText = output.flatMap((item) => item.type === 'message'
    ? item.content.map((part) => part.type === 'output_text' ? part.text : part.refusal) : []).join('')
  const reasoningSummaryText = output.flatMap((item) => item.type === 'reasoning'
    ? item.summary.map((part) => part.text) : []).join('')
  const result = Object.freeze({
    terminalKind: expected,
    responseId: boundedString(response.id),
    model: boundedString(response.model),
    createdAt: nonnegativeInteger(response.created_at),
    completedAt: optionalInteger(response.completed_at),
    output,
    visibleText,
    reasoningSummaryText,
    usage: usage(response.usage),
    error,
    incompleteReason: incomplete,
  })
  terminalResults.add(result)
  return result
}

export class OpenAIResponsesStreamAssemblerV1 {
  #visibleText = ''
  #reasoningSummaryText = ''
  #terminal: OpenAIResponsesTerminalResultV1 | null = null
  readonly #doneItems = new Map<number, OpenAIResponsesReturnedItemV1>()

  push(event: OpenAIResponsesStreamEventV1): void {
    if (this.#terminal) return fail('GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID')
    if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta' ||
        event.type === 'response.reasoning_summary_text.delta') {
      const delta = boundedString(event.value.delta, true)
      if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') this.#visibleText += delta
      else this.#reasoningSummaryText += delta
      return
    }
    if (event.type === 'response.output_item.done') {
      const index = nonnegativeInteger(event.value.output_index)
      if (this.#doneItems.has(index)) return fail('GENERATION_V2_OPENAI_STREAM_INCONSISTENT')
      let item: OpenAIResponsesReturnedItemV1
      try { [item] = decodeOpenAIResponsesReturnedItemsV1([event.value.item]) } catch {
        return fail('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
      }
      this.#doneItems.set(index, item)
      return
    }
    if (event.type === 'response.completed' || event.type === 'response.failed' || event.type === 'response.incomplete') {
      const result = terminal(event)
      for (const [index, item] of this.#doneItems) {
        if (stableSerializeProviderRequestV2(result.output[index]) !== stableSerializeProviderRequestV2(item)) {
          return fail('GENERATION_V2_OPENAI_STREAM_INCONSISTENT')
        }
      }
      if ((this.#visibleText.length > 0 && this.#visibleText !== result.visibleText) ||
          (this.#reasoningSummaryText.length > 0 && this.#reasoningSummaryText !== result.reasoningSummaryText)) {
        return fail('GENERATION_V2_OPENAI_STREAM_INCONSISTENT')
      }
      this.#terminal = result
      return
    }
    if (!NON_AUTHORITATIVE_EVENT_TYPES.has(event.type)) return fail('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
  }

  readVisibleText(): string { return this.#visibleText }
  readReasoningSummaryText(): string { return this.#reasoningSummaryText }
  finish(): OpenAIResponsesTerminalResultV1 {
    if (!this.#terminal) return fail('GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID')
    return this.#terminal
  }
}

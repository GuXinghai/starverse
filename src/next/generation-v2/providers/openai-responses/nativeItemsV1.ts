export const OPENAI_RESPONSES_MAX_REPLAY_ITEMS_V1 = 4_096
export const OPENAI_RESPONSES_MAX_REPLAY_NODES_V1 = 32_768
export const OPENAI_RESPONSES_MAX_ITEM_STRING_BYTES_V1 = 4 * 1_024 * 1_024
export const OPENAI_RESPONSES_MAX_REPLAY_STRING_BYTES_V1 = 24 * 1_024 * 1_024

type TerminalStatus = 'completed' | 'incomplete'
type Budget = { bytes: number; nodes: number }
type ClosedObject = Readonly<Record<string, unknown>>

export type OpenAIResponsesUserInputItemV1 = Readonly<{
  role: 'user'
  content: readonly Readonly<{ type: 'input_text'; text: string }>[]
}>

export type OpenAIResponsesAssistantMessageItemV1 = Readonly<{
  id: string
  type: 'message'
  role: 'assistant'
  status?: TerminalStatus
  phase?: 'commentary' | 'final_answer'
  content: readonly Readonly<
    | { type: 'output_text'; text: string; annotations: readonly OpenAIResponsesAnnotationV1[]; logprobs?: readonly OpenAIResponsesLogprobV1[] }
    | { type: 'refusal'; refusal: string }
  >[]
}>

export type OpenAIResponsesAnnotationV1 = Readonly<
  | { type: 'file_citation'; file_id: string; filename: string; index: number }
  | { type: 'url_citation'; start_index: number; end_index: number; title: string; url: string }
  | { type: 'container_file_citation'; container_id: string; file_id: string; filename: string; start_index: number; end_index: number }
  | { type: 'file_path'; file_id: string; index: number }
>

export type OpenAIResponsesLogprobV1 = Readonly<{
  token: string
  bytes: readonly number[]
  logprob: number
  top_logprobs: readonly Readonly<{ token: string; bytes: readonly number[]; logprob: number }>[]
}>

export type OpenAIResponsesReasoningItemV1 = Readonly<{
  id: string
  type: 'reasoning'
  status?: TerminalStatus
  summary: readonly Readonly<{ type: 'summary_text'; text: string }>[]
  content?: readonly Readonly<{ type: 'reasoning_text'; text: string }>[]
  encrypted_content: string
}>

export type OpenAIResponsesFunctionCallItemV1 = Readonly<{
  id?: string
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
  status?: TerminalStatus
}>

export type OpenAIResponsesFunctionCallOutputItemV1 = Readonly<{
  id?: string
  type: 'function_call_output'
  call_id: string
  output: string
  status?: TerminalStatus
}>

export type OpenAIResponsesWebSearchCallItemV1 = Readonly<{
  id: string
  type: 'web_search_call'
  status: 'completed' | 'failed'
  action: Readonly<
    | { type: 'search'; query: string; queries?: readonly string[]; sources?: readonly Readonly<{ type: 'url'; url: string }>[] }
    | { type: 'open_page'; url?: string }
    | { type: 'find_in_page'; pattern: string; url: string }
  >
}>

export type OpenAIResponsesImageGenerationCallItemV1 = Readonly<{
  id: string
  type: 'image_generation_call'
  result: string
  status: 'completed' | 'failed'
}>

export type OpenAIResponsesReturnedItemV1 =
  | OpenAIResponsesAssistantMessageItemV1
  | OpenAIResponsesReasoningItemV1
  | OpenAIResponsesFunctionCallItemV1
  | OpenAIResponsesWebSearchCallItemV1
  | OpenAIResponsesImageGenerationCallItemV1

export type OpenAIResponsesClientItemV1 = OpenAIResponsesUserInputItemV1 | OpenAIResponsesFunctionCallOutputItemV1
export type OpenAIResponsesReplayItemV1 = OpenAIResponsesReturnedItemV1 | OpenAIResponsesClientItemV1

export class OpenAIResponsesNativeItemsV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE'
    | 'GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_FIELD'
    | 'GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE'
    | 'GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_TYPE'
    | 'GENERATION_V2_OPENAI_NATIVE_ITEM_DIRECTION_INVALID'
    | 'GENERATION_V2_OPENAI_NATIVE_ITEM_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'OpenAIResponsesNativeItemsV1Error'
  }
}

function fail(code: OpenAIResponsesNativeItemsV1Error['code']): never {
  throw new OpenAIResponsesNativeItemsV1Error(code)
}

function closedObject(value: unknown, allowed: readonly string[], required: readonly string[] = allowed): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE')
  }
  const keys = Object.keys(descriptors)
  if (keys.some((key) => !allowed.includes(key))) return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_FIELD')
  if (required.some((key) => !keys.includes(key))) return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE')
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function denseArray(value: unknown, max: number, allowEmpty = true): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || (!allowEmpty && value.length === 0)) {
    return fail(Array.isArray(value) && value.length > max
      ? 'GENERATION_V2_OPENAI_NATIVE_ITEM_LIMIT_EXCEEDED'
      : 'GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE')
  }
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  if (Reflect.ownKeys(value).length !== expected.length || expected.some((key) => !Reflect.ownKeys(value).includes(key))) {
    return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function node(budget: Budget, count = 1): void {
  budget.nodes += count
  if (budget.nodes > OPENAI_RESPONSES_MAX_REPLAY_NODES_V1) fail('GENERATION_V2_OPENAI_NATIVE_ITEM_LIMIT_EXCEEDED')
}

function stringValue(value: unknown, budget: Budget, identifier = false): string {
  if (typeof value !== 'string' || (identifier &&
      (value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)))) {
    return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
  }
  const bytes = new TextEncoder().encode(value).byteLength
  if (bytes > OPENAI_RESPONSES_MAX_ITEM_STRING_BYTES_V1 || budget.bytes + bytes > OPENAI_RESPONSES_MAX_REPLAY_STRING_BYTES_V1) {
    return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_LIMIT_EXCEEDED')
  }
  budget.bytes += bytes
  return value
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
  return value as number
}

function finiteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
  return value
}

function status(value: unknown, optional = false): TerminalStatus | undefined {
  if (optional && value === undefined) return undefined
  if (value !== 'completed' && value !== 'incomplete') return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
  return value
}

function optionalStatus(value: unknown): Readonly<{ status?: TerminalStatus }> {
  const decoded = status(value, true)
  return decoded === undefined ? Object.freeze({}) : Object.freeze({ status: decoded })
}

function textParts<T extends 'input_text' | 'summary_text' | 'reasoning_text'>(
  value: unknown, type: T, budget: Budget, allowEmpty: boolean,
): readonly Readonly<{ type: T; text: string }>[] {
  const parts = denseArray(value, OPENAI_RESPONSES_MAX_REPLAY_ITEMS_V1, allowEmpty)
  node(budget, parts.length)
  return Object.freeze(parts.map((raw) => {
    const part = closedObject(raw, ['type', 'text'])
    if (part.type !== type) return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_TYPE')
    return Object.freeze({ type, text: stringValue(part.text, budget) })
  }))
}

function byteArray(value: unknown): readonly number[] {
  const bytes = denseArray(value, 65_536, true)
  return Object.freeze(bytes.map((entry) => {
    if (!Number.isInteger(entry) || (entry as number) < 0 || (entry as number) > 255) {
      return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
    }
    return entry as number
  }))
}

function decodeTopLogprob(value: unknown, budget: Budget) {
  const input = closedObject(value, ['token', 'bytes', 'logprob'])
  return Object.freeze({ token: stringValue(input.token, budget), bytes: byteArray(input.bytes), logprob: finiteNumber(input.logprob) })
}

function decodeLogprob(value: unknown, budget: Budget): OpenAIResponsesLogprobV1 {
  const input = closedObject(value, ['token', 'bytes', 'logprob', 'top_logprobs'])
  const top = denseArray(input.top_logprobs, 256, true)
  node(budget, top.length + 1)
  return Object.freeze({
    token: stringValue(input.token, budget), bytes: byteArray(input.bytes), logprob: finiteNumber(input.logprob),
    top_logprobs: Object.freeze(top.map((entry) => decodeTopLogprob(entry, budget))),
  })
}

function decodeAnnotation(value: unknown, budget: Budget): OpenAIResponsesAnnotationV1 {
  const discriminator = closedObject(value, ['type', 'file_id', 'filename', 'index', 'start_index', 'end_index', 'title', 'url', 'container_id'], ['type'])
  if (discriminator.type === 'file_citation') {
    const input = closedObject(value, ['type', 'file_id', 'filename', 'index'])
    return Object.freeze({ type: 'file_citation', file_id: stringValue(input.file_id, budget, true), filename: stringValue(input.filename, budget), index: integer(input.index) })
  }
  if (discriminator.type === 'url_citation') {
    const input = closedObject(value, ['type', 'start_index', 'end_index', 'title', 'url'])
    const start_index = integer(input.start_index); const end_index = integer(input.end_index)
    if (end_index < start_index) return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
    return Object.freeze({ type: 'url_citation', start_index, end_index, title: stringValue(input.title, budget), url: stringValue(input.url, budget) })
  }
  if (discriminator.type === 'container_file_citation') {
    const input = closedObject(value, ['type', 'container_id', 'file_id', 'filename', 'start_index', 'end_index'])
    const start_index = integer(input.start_index); const end_index = integer(input.end_index)
    if (end_index < start_index) return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
    return Object.freeze({ type: 'container_file_citation', container_id: stringValue(input.container_id, budget, true), file_id: stringValue(input.file_id, budget, true), filename: stringValue(input.filename, budget), start_index, end_index })
  }
  if (discriminator.type === 'file_path') {
    const input = closedObject(value, ['type', 'file_id', 'index'])
    return Object.freeze({ type: 'file_path', file_id: stringValue(input.file_id, budget, true), index: integer(input.index) })
  }
  return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_TYPE')
}

function outputParts(value: unknown, budget: Budget): OpenAIResponsesAssistantMessageItemV1['content'] {
  const parts = denseArray(value, OPENAI_RESPONSES_MAX_REPLAY_ITEMS_V1, false)
  node(budget, parts.length)
  return Object.freeze(parts.map((raw) => {
    const discriminator = closedObject(raw, ['type', 'text', 'annotations', 'logprobs', 'refusal'], ['type'])
    if (discriminator.type === 'refusal') {
      const input = closedObject(raw, ['type', 'refusal'])
      return Object.freeze({ type: 'refusal' as const, refusal: stringValue(input.refusal, budget) })
    }
    if (discriminator.type !== 'output_text') return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_TYPE')
    const input = closedObject(raw, ['type', 'text', 'annotations', 'logprobs'], ['type', 'text', 'annotations'])
    const annotations = denseArray(input.annotations, 4_096, true)
    const logprobs = input.logprobs === undefined ? undefined : denseArray(input.logprobs, 65_536, true)
    node(budget, annotations.length + (logprobs?.length ?? 0))
    return Object.freeze({
      type: 'output_text' as const,
      text: stringValue(input.text, budget),
      annotations: Object.freeze(annotations.map((entry) => decodeAnnotation(entry, budget))),
      ...(logprobs === undefined ? {} : {
        logprobs: Object.freeze(logprobs.map((entry) => decodeLogprob(entry, budget))),
      }),
    })
  }))
}

function decodeSearchAction(value: unknown, budget: Budget): OpenAIResponsesWebSearchCallItemV1['action'] {
  const discriminator = closedObject(value, ['type', 'query', 'queries', 'sources', 'url', 'pattern'], ['type'])
  if (discriminator.type === 'search') {
    const input = closedObject(value, ['type', 'query', 'queries', 'sources'], ['type', 'query'])
    const queries = input.queries === undefined ? undefined : denseArray(input.queries, 256, true)
    const sources = input.sources === undefined ? undefined : denseArray(input.sources, 4_096, true)
    node(budget, (queries?.length ?? 0) + (sources?.length ?? 0))
    return Object.freeze({
      type: 'search', query: stringValue(input.query, budget),
      ...(queries ? { queries: Object.freeze(queries.map((entry) => stringValue(entry, budget))) } : {}),
      ...(sources ? { sources: Object.freeze(sources.map((entry) => {
        const source = closedObject(entry, ['type', 'url'])
        if (source.type !== 'url') return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_TYPE')
        return Object.freeze({ type: 'url' as const, url: stringValue(source.url, budget) })
      })) } : {}),
    })
  }
  if (discriminator.type === 'open_page') {
    const input = closedObject(value, ['type', 'url'], ['type'])
    return Object.freeze({ type: 'open_page', ...(input.url === undefined ? {} : { url: stringValue(input.url, budget) }) })
  }
  if (discriminator.type === 'find_in_page') {
    const input = closedObject(value, ['type', 'pattern', 'url'])
    return Object.freeze({ type: 'find_in_page', pattern: stringValue(input.pattern, budget), url: stringValue(input.url, budget) })
  }
  return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_TYPE')
}

function decodeItem(value: unknown, budget: Budget): OpenAIResponsesReplayItemV1 {
  node(budget)
  const discriminator = closedObject(value, [
    'id', 'type', 'role', 'status', 'phase', 'content', 'summary', 'encrypted_content',
    'call_id', 'name', 'arguments', 'output', 'action', 'result',
  ], [])
  if (discriminator.role === 'user' && discriminator.type === undefined) {
    const input = closedObject(value, ['role', 'content'])
    return Object.freeze({ role: 'user', content: textParts(input.content, 'input_text', budget, false) })
  }
  if (discriminator.type === 'message') {
    const input = closedObject(value, ['id', 'type', 'role', 'status', 'phase', 'content'], ['id', 'type', 'role', 'content'])
    if (input.role !== 'assistant' || (input.phase !== undefined && input.phase !== 'commentary' && input.phase !== 'final_answer')) {
      return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
    }
    return Object.freeze({
      id: stringValue(input.id, budget, true), type: 'message', role: 'assistant', ...optionalStatus(input.status),
      ...(input.phase === undefined ? {} : { phase: input.phase }), content: outputParts(input.content, budget),
    })
  }
  if (discriminator.type === 'reasoning') {
    const input = closedObject(value, ['id', 'type', 'status', 'summary', 'content', 'encrypted_content'], ['id', 'type', 'summary', 'encrypted_content'])
    return Object.freeze({
      id: stringValue(input.id, budget, true), type: 'reasoning', ...optionalStatus(input.status),
      summary: textParts(input.summary, 'summary_text', budget, true),
      ...(input.content === undefined ? {} : { content: textParts(input.content, 'reasoning_text', budget, true) }),
      encrypted_content: stringValue(input.encrypted_content, budget),
    })
  }
  if (discriminator.type === 'function_call') {
    const input = closedObject(value, ['id', 'type', 'call_id', 'name', 'arguments', 'status'], ['type', 'call_id', 'name', 'arguments'])
    return Object.freeze({
      ...(input.id === undefined ? {} : { id: stringValue(input.id, budget, true) }), type: 'function_call',
      call_id: stringValue(input.call_id, budget, true), name: stringValue(input.name, budget, true),
      arguments: stringValue(input.arguments, budget), ...optionalStatus(input.status),
    })
  }
  if (discriminator.type === 'function_call_output') {
    const input = closedObject(value, ['id', 'type', 'call_id', 'output', 'status'], ['type', 'call_id', 'output'])
    if (typeof input.output !== 'string') return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
    return Object.freeze({
      ...(input.id === undefined ? {} : { id: stringValue(input.id, budget, true) }), type: 'function_call_output',
      call_id: stringValue(input.call_id, budget, true), output: stringValue(input.output, budget), ...optionalStatus(input.status),
    })
  }
  if (discriminator.type === 'web_search_call') {
    const input = closedObject(value, ['id', 'type', 'status', 'action'])
    if (input.status !== 'completed' && input.status !== 'failed') return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
    return Object.freeze({ id: stringValue(input.id, budget, true), type: 'web_search_call', status: input.status, action: decodeSearchAction(input.action, budget) })
  }
  if (discriminator.type === 'image_generation_call') {
    const input = closedObject(value, ['id', 'type', 'status', 'result'])
    if (input.status !== 'completed' && input.status !== 'failed') return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
    return Object.freeze({ id: stringValue(input.id, budget, true), type: 'image_generation_call', status: input.status, result: stringValue(input.result, budget) })
  }
  return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_TYPE')
}

export function decodeOpenAIResponsesReplayItemsV1(value: unknown): readonly OpenAIResponsesReplayItemV1[] {
  const budget = { bytes: 0, nodes: 0 }
  return Object.freeze(denseArray(value, OPENAI_RESPONSES_MAX_REPLAY_ITEMS_V1, true).map((item) => decodeItem(item, budget)))
}

export function decodeOpenAIResponsesReturnedItemsV1(value: unknown): readonly OpenAIResponsesReturnedItemV1[] {
  return Object.freeze(decodeOpenAIResponsesReplayItemsV1(value).map((item) => {
    if (('role' in item && item.role === 'user') || item.type === 'function_call_output') {
      return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_DIRECTION_INVALID')
    }
    return item
  }))
}

export function decodeOpenAIResponsesClientItemsV1(value: unknown): readonly OpenAIResponsesClientItemV1[] {
  return Object.freeze(decodeOpenAIResponsesReplayItemsV1(value).map((item) => {
    if (('role' in item && item.role === 'user') || item.type === 'function_call_output') return item
    return fail('GENERATION_V2_OPENAI_NATIVE_ITEM_DIRECTION_INVALID')
  }))
}

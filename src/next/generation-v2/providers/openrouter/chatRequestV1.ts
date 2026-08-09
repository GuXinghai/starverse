import {
  ImmutablePreparedBodyV2,
  StableSerializeV2Error,
  stableSerializeProviderRequestBoundedV2,
} from '../../compiler/stableSerialize'

/**
 * OpenRouter Chat Completions V1 wire codec.
 *
 * This is deliberately not shared with Images or any OpenAI-compatible local
 * endpoint.  `messages` is an already-authoritative native history artifact:
 * callers must persist and replay it as-is rather than reconstructing it from
 * rendered text.
 */
export const OPENROUTER_CHAT_REQUEST_MAX_BYTES_V1 = 20 * 1024 * 1024

export type OpenRouterChatRequestV1 = Readonly<{
  model: string
  messages: readonly Record<string, unknown>[]
  stream: true
  stream_options: Readonly<{ include_usage: true }>
  max_tokens?: number
  temperature?: number
  top_p?: number
  top_k?: number
  min_p?: number
  top_a?: number
  seed?: number
  stop?: readonly string[]
  frequency_penalty?: number
  presence_penalty?: number
  repetition_penalty?: number
  verbosity?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  response_format?: OpenRouterChatResponseFormatV1
  parallel_tool_calls?: boolean
  reasoning?: Readonly<Record<string, unknown>>
  tools?: readonly Record<string, unknown>[]
  tool_choice?: 'auto' | 'none' | 'required' | Readonly<{ type: 'function'; function: Readonly<{ name: string }> }>
}>

export type OpenRouterChatResponseFormatV1 =
  | Readonly<{ type: 'text' }>
  | Readonly<{ type: 'json_object' }>
  | Readonly<{
      type: 'json_schema'
      json_schema: Readonly<{
        name: string
        description?: string
        schema: Readonly<Record<string, unknown>>
        strict?: boolean
      }>
    }>

export type OpenRouterWebSearchServerToolV1 = Readonly<{
  type: 'openrouter:web_search'
  parameters?: Readonly<{
    engine?: 'auto' | 'native' | 'exa' | 'firecrawl' | 'parallel' | 'perplexity'
    max_results?: number
    max_total_results?: number
    search_context_size?: 'low' | 'medium' | 'high'
    max_characters?: number
    user_location?: Readonly<{
      type: 'approximate'
      city?: string
      region?: string
      country?: string
      timezone?: string
    }>
    allowed_domains?: readonly string[]
    excluded_domains?: readonly string[]
  }>
}>

export type OpenRouterChatCompilationV1 = Readonly<{
  classification: 'openrouter_chat_request_compilation_non_executable'
  executionAuthority: 'none'
  nativeRequest: OpenRouterChatRequestV1
  preparedBody: ImmutablePreparedBodyV2
}>

export class OpenRouterChatRequestV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_SHAPE'
    | 'GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE'
    | 'GENERATION_V2_OPENROUTER_CHAT_REQUEST_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'OpenRouterChatRequestV1Error'
  }
}

function asClosedObject(value: unknown, allowed: readonly string[], required: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((entry) => !entry.enumerable || !('value' in entry) || entry.value === undefined) ||
      Object.keys(descriptors).some((key) => !allowed.includes(key)) ||
      required.some((key) => !(key in descriptors))) {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_SHAPE')
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, entry]) => [key, entry.value]))
}

function jsonClone(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stableSerializeProviderRequestBoundedV2(value, OPENROUTER_CHAT_REQUEST_MAX_BYTES_V1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object')
    return Object.freeze(parsed as Record<string, unknown>)
  } catch (error) {
    if (error instanceof StableSerializeV2Error && error.code === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_LIMIT_EXCEEDED')
    }
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  }
}

function positiveInteger(value: unknown, maximum = 2_000_000): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  }
  return value as number
}

function nonNegativeInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  }
  return value as number
}

function boundedNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  }
  return value
}

function responseFormat(value: unknown): OpenRouterChatResponseFormatV1 {
  const input = asClosedObject(value, ['type', 'json_schema'], ['type'])
  if (input.type === 'text' || input.type === 'json_object') {
    if (Object.keys(input).length !== 1) throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
    return Object.freeze({ type: input.type }) as OpenRouterChatResponseFormatV1
  }
  if (input.type !== 'json_schema') throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  const schema = asClosedObject(input.json_schema, ['name', 'description', 'schema', 'strict'], ['name', 'schema'])
  if (typeof schema.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u.test(schema.name) ||
      schema.description !== undefined && (typeof schema.description !== 'string' || schema.description.length > 4096) ||
      schema.strict !== undefined && typeof schema.strict !== 'boolean') {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  }
  const clonedSchema = jsonClone(schema.schema)
  return Object.freeze({
    type: 'json_schema' as const,
    json_schema: Object.freeze({
      name: schema.name,
      ...(schema.description === undefined ? {} : { description: schema.description }),
      schema: clonedSchema,
      ...(schema.strict === undefined ? {} : { strict: schema.strict }),
    }),
  })
}

function stringList(value: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum ||
      value.some((item) => typeof item !== 'string' || item.length === 0) || new Set(value).size !== value.length) {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  }
  return Object.freeze([...value] as string[])
}

function toolChoice(value: unknown, names: ReadonlySet<string>): OpenRouterChatRequestV1['tool_choice'] {
  if (value === undefined) return undefined
  if (value === 'auto' || value === 'none' || value === 'required') return value
  const input = asClosedObject(value, ['type', 'function'], ['type', 'function'])
  const fn = asClosedObject(input.function, ['name'], ['name'])
  if (input.type !== 'function' || typeof fn.name !== 'string' || !names.has(fn.name)) {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  }
  return Object.freeze({ type: 'function', function: Object.freeze({ name: fn.name }) })
}

function compileWebSearchServerTool(value: unknown): OpenRouterWebSearchServerToolV1 {
  const input = asClosedObject(value, [
    'engine', 'maxResults', 'maxTotalResults', 'searchContextSize', 'maxCharacters',
    'userLocation', 'allowedDomains', 'excludedDomains',
  ], [])
  if (input.engine !== undefined && !['auto', 'native', 'exa', 'firecrawl', 'parallel', 'perplexity'].includes(input.engine as string) ||
      input.searchContextSize !== undefined && !['low', 'medium', 'high'].includes(input.searchContextSize as string)) {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  }
  const domainList = (raw: unknown): readonly string[] | undefined => {
    if (raw === undefined) return undefined
    const values = stringList(raw, 100)
    if (values.some((item) => item.length > 253 || item.trim() !== item || /[\s/]/u.test(item))) {
      throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
    }
    return values
  }
  const userLocation = input.userLocation === undefined ? undefined : (() => {
    const location = asClosedObject(input.userLocation, ['city', 'region', 'country', 'timezone'], [])
    if (Object.keys(location).length === 0 || Object.values(location).some((item) =>
      typeof item !== 'string' || item.length === 0 || item.length > 256 || item.trim() !== item)) {
      throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
    }
    return Object.freeze({ type: 'approximate' as const, ...location })
  })()
  const parameters = Object.freeze({
    ...(input.engine === undefined ? {} : { engine: input.engine as 'auto' | 'native' | 'exa' | 'firecrawl' | 'parallel' | 'perplexity' }),
    ...(input.maxResults === undefined ? {} : { max_results: positiveInteger(input.maxResults, 25) }),
    ...(input.maxTotalResults === undefined ? {} : { max_total_results: positiveInteger(input.maxTotalResults) }),
    ...(input.searchContextSize === undefined ? {} : { search_context_size: input.searchContextSize as 'low' | 'medium' | 'high' }),
    ...(input.maxCharacters === undefined ? {} : { max_characters: positiveInteger(input.maxCharacters, 100_000) }),
    ...(userLocation === undefined ? {} : { user_location: userLocation }),
    ...(input.allowedDomains === undefined ? {} : { allowed_domains: domainList(input.allowedDomains)! }),
    ...(input.excludedDomains === undefined ? {} : { excluded_domains: domainList(input.excludedDomains)! }),
  })
  return Object.freeze({
    type: 'openrouter:web_search' as const,
    ...(Object.keys(parameters).length === 0 ? {} : { parameters }),
  })
}

export function compileOpenRouterChatRequestV1(raw: unknown): OpenRouterChatCompilationV1 {
  const input = asClosedObject(raw, [
    'model', 'messages', 'generation', 'reasoning', 'tools', 'toolChoice', 'webSearch',
    'verbosity', 'responseFormat', 'parallelToolCalls',
  ], ['model', 'messages'])
  if (typeof input.model !== 'string' || input.model.length === 0 || input.model.length > 256 ||
      !Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > 4_096) {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  }
  const messages = Object.freeze(input.messages.map(jsonClone))
  const generation: Readonly<{ maxTokens?: unknown; temperature?: unknown; topP?: unknown; topK?: unknown; minP?: unknown;
    topA?: unknown; seed?: unknown; stop?: unknown; frequencyPenalty?: unknown; presencePenalty?: unknown; repetitionPenalty?: unknown }> = input.generation === undefined
    ? Object.freeze({})
    : asClosedObject(input.generation, ['maxTokens', 'temperature', 'topP', 'topK', 'minP', 'topA', 'seed', 'stop', 'frequencyPenalty', 'presencePenalty', 'repetitionPenalty'], [])
  const tools = input.tools === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(input.tools) || input.tools.length === 0 || input.tools.length > 128) {
          throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
        }
        return Object.freeze(input.tools.map(jsonClone))
      })()
  const toolNames = new Set<string>()
  for (const tool of tools ?? []) {
    const fn = tool.function
    if (tool.type !== 'function' || !fn || typeof fn !== 'object' || Array.isArray(fn) || typeof (fn as Record<string, unknown>).name !== 'string') {
      throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
    }
    toolNames.add((fn as Record<string, unknown>).name as string)
  }
  const webSearchTool = input.webSearch === undefined ? undefined : compileWebSearchServerTool(input.webSearch)
  const verbosity = input.verbosity === undefined ? undefined : (() => {
    if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(input.verbosity as string)) {
      throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
    }
    return input.verbosity as 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  })()
  if (input.parallelToolCalls !== undefined && typeof input.parallelToolCalls !== 'boolean') {
    throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  }
  const response = input.responseFormat === undefined ? undefined : responseFormat(input.responseFormat)
  const requestTools = tools === undefined && webSearchTool === undefined
    ? undefined
    : Object.freeze([...(tools ?? []), ...(webSearchTool === undefined ? [] : [webSearchTool])])
  const request: OpenRouterChatRequestV1 = Object.freeze({
    model: input.model,
    messages,
    stream: true,
    stream_options: Object.freeze({ include_usage: true }),
    ...(generation.maxTokens === undefined ? {} : { max_tokens: positiveInteger(generation.maxTokens) }),
    ...(generation.temperature === undefined ? {} : { temperature: boundedNumber(generation.temperature, 0, 2) }),
    ...(generation.topP === undefined ? {} : { top_p: boundedNumber(generation.topP, 0, 1) }),
    ...(generation.topK === undefined ? {} : { top_k: nonNegativeInteger(generation.topK, 1_000_000) }),
    ...(generation.minP === undefined ? {} : { min_p: boundedNumber(generation.minP, 0, 1) }),
    ...(generation.topA === undefined ? {} : { top_a: boundedNumber(generation.topA, 0, 1) }),
    ...(generation.seed === undefined ? {} : { seed: nonNegativeInteger(generation.seed, 2_147_483_647) }),
    ...(generation.stop === undefined ? {} : { stop: stringList(generation.stop, 16) }),
    ...(generation.frequencyPenalty === undefined ? {} : { frequency_penalty: boundedNumber(generation.frequencyPenalty, -2, 2) }),
    ...(generation.presencePenalty === undefined ? {} : { presence_penalty: boundedNumber(generation.presencePenalty, -2, 2) }),
    ...(generation.repetitionPenalty === undefined ? {} : { repetition_penalty: boundedNumber(generation.repetitionPenalty, 0, 2) }),
    ...(verbosity === undefined ? {} : { verbosity }),
    ...(response === undefined ? {} : { response_format: response }),
    ...(input.parallelToolCalls === undefined ? {} : { parallel_tool_calls: input.parallelToolCalls }),
    ...(input.reasoning === undefined ? {} : { reasoning: jsonClone(input.reasoning) }),
    ...(requestTools === undefined ? {} : { tools: requestTools }),
    ...(input.toolChoice === undefined ? {} : { tool_choice: toolChoice(input.toolChoice, toolNames) }),
  })
  try {
    return Object.freeze({
      classification: 'openrouter_chat_request_compilation_non_executable' as const,
      executionAuthority: 'none' as const,
      nativeRequest: request,
      preparedBody: ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(request, OPENROUTER_CHAT_REQUEST_MAX_BYTES_V1),
    })
  } catch (error) {
    if (error instanceof StableSerializeV2Error && error.code === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      throw new OpenRouterChatRequestV1Error('GENERATION_V2_OPENROUTER_CHAT_REQUEST_LIMIT_EXCEEDED')
    }
    throw error
  }
}

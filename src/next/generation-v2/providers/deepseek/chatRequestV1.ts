import {
  ImmutablePreparedBodyV2,
  StableSerializeV2Error,
  stableSerializeProviderRequestBoundedV2,
} from '../../compiler/stableSerialize'
import {
  buildDeepSeekNativeRequestHistoryV2,
  buildDeepSeekProjectedNativeRequestHistoryV2,
  type DeepSeekNativeHistoryArtifactV2,
  type DeepSeekNativeMessageV1,
} from './nativeMessagesV1'

export type DeepSeekThinkingModeV1 = 'enabled' | 'disabled'
export const DEEPSEEK_STABLE_REQUEST_MAX_BYTES_V1 = 20 * 1_024 * 1_024
export type DeepSeekToolChoiceV1 =
  | 'none'
  | 'auto'
  | 'required'
  | Readonly<{ type: 'function'; function: Readonly<{ name: string }> }>

export type DeepSeekFunctionToolV1 = Readonly<{
  type: 'function'
  function: Readonly<{
    name: string
    description?: string
    parameters?: Readonly<Record<string, unknown>>
  }>
}>

export type DeepSeekStableChatRequestV1 = Readonly<{
  model: string
  messages: readonly DeepSeekNativeMessageV1[]
  stream: true
  stream_options: Readonly<{ include_usage: true }>
  thinking: Readonly<{ type: DeepSeekThinkingModeV1 }>
  reasoning_effort?: 'high' | 'max'
  max_tokens?: number
  stop?: string | readonly string[]
  temperature?: number
  top_p?: number
  response_format?: Readonly<{ type: 'text' | 'json_object' }>
  tools?: readonly DeepSeekFunctionToolV1[]
  tool_choice?: DeepSeekToolChoiceV1
}>

export type DeepSeekStableChatCompilationV1 = Readonly<{
  classification: 'deepseek_stable_request_compilation_non_executable'
  executionAuthority: 'none'
  nativeRequest: DeepSeekStableChatRequestV1
  preparedBody: ImmutablePreparedBodyV2
}>

export class DeepSeekStableChatRequestV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_REQUEST_INVALID_SHAPE'
    | 'GENERATION_V2_DEEPSEEK_REQUEST_UNKNOWN_FIELD'
    | 'GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE'
    | 'GENERATION_V2_DEEPSEEK_REQUEST_LIMIT_EXCEEDED'
    | 'DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED'
    | 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED'
    | 'DEEPSEEK_EXPLICIT_DEPRECATED_PENALTY_UNSUPPORTED') {
    super(code)
    this.name = 'DeepSeekStableChatRequestV1Error'
  }
}

type ClosedObject = Readonly<Record<string, unknown>>
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u

function closedObject(value: unknown, allowed: readonly string[], required: readonly string[]): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_SHAPE')
  }
  const keys = Object.keys(descriptors)
  if (keys.some((key) => !allowed.includes(key))) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_UNKNOWN_FIELD')
  }
  if (required.some((key) => !keys.includes(key))) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_SHAPE')
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function denseArray(value: unknown, max: number, allowEmpty = false): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > max || (!allowEmpty && value.length === 0)) {
    throw new DeepSeekStableChatRequestV1Error(
      Array.isArray(value) && value.length > max
        ? 'GENERATION_V2_DEEPSEEK_REQUEST_LIMIT_EXCEEDED'
        : 'GENERATION_V2_DEEPSEEK_REQUEST_INVALID_SHAPE',
    )
  }
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function finiteNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  }
  return value
}

function decodeThinking(value: unknown): Readonly<{ type: DeepSeekThinkingModeV1; reasoningEffort?: 'high' | 'max' }> {
  const input = closedObject(value, ['type', 'reasoningEffort'], ['type'])
  if (input.type !== 'enabled' && input.type !== 'disabled') {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  }
  if (input.reasoningEffort !== undefined && input.reasoningEffort !== 'high' && input.reasoningEffort !== 'max') {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  }
  if (input.type === 'disabled' && input.reasoningEffort !== undefined) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  }
  return Object.freeze({
    type: input.type,
    ...(input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort }),
  })
}

function decodeGeneration(value: unknown): ClosedObject {
  if (value === undefined) return Object.freeze({})
  const input = closedObject(
    value,
    ['maxTokens', 'stop', 'temperature', 'topP', 'frequencyPenalty', 'presencePenalty', 'responseFormat'],
    [],
  )
  if (input.maxTokens !== undefined && (!Number.isSafeInteger(input.maxTokens) || (input.maxTokens as number) < 1)) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  }
  let stopValue: string | readonly string[] | undefined
  if (input.stop !== undefined) {
    const stop = typeof input.stop === 'string' ? [input.stop] : denseArray(input.stop, 16)
    if (stop.some((item) => typeof item !== 'string' || item.length === 0) || new Set(stop).size !== stop.length) {
      throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
    }
    stopValue = typeof input.stop === 'string' ? input.stop : Object.freeze([...stop] as string[])
  }
  if (input.temperature !== undefined) finiteNumber(input.temperature, 0, 2)
  if (input.topP !== undefined) finiteNumber(input.topP, 0, 1)
  if (input.frequencyPenalty !== undefined || input.presencePenalty !== undefined) {
    if (input.frequencyPenalty !== undefined) finiteNumber(input.frequencyPenalty, -2, 2)
    if (input.presencePenalty !== undefined) finiteNumber(input.presencePenalty, -2, 2)
  }
  if (input.responseFormat !== undefined && input.responseFormat !== 'text' && input.responseFormat !== 'json_object') {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  }
  return Object.freeze({
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    ...(stopValue === undefined ? {} : { stop: stopValue }),
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    ...(input.topP === undefined ? {} : { topP: input.topP }),
    ...(input.frequencyPenalty === undefined ? {} : { frequencyPenalty: input.frequencyPenalty }),
    ...(input.presencePenalty === undefined ? {} : { presencePenalty: input.presencePenalty }),
    ...(input.responseFormat === undefined ? {} : { responseFormat: input.responseFormat }),
  })
}

function cloneJsonSchema(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  }
  try {
    return deepFreezeJson(JSON.parse(stableSerializeProviderRequestBoundedV2(
      value,
      DEEPSEEK_STABLE_REQUEST_MAX_BYTES_V1,
    ))) as Readonly<Record<string, unknown>>
  } catch (error) {
    if (error instanceof StableSerializeV2Error && error.code === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_LIMIT_EXCEEDED')
    }
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  }
}

function deepFreezeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeJson(item)
    return Object.freeze(value)
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreezeJson(item)
    return Object.freeze(value)
  }
  return value
}

function decodeTools(value: unknown): readonly DeepSeekFunctionToolV1[] | undefined {
  if (value === undefined) return undefined
  const tools = denseArray(value, 128)
  const names = new Set<string>()
  return Object.freeze(tools.map((raw) => {
    const input = closedObject(raw, ['type', 'function'], ['type', 'function'])
    const fn = closedObject(input.function, ['name', 'description', 'parameters'], ['name'])
    if (input.type !== 'function' || typeof fn.name !== 'string' || !TOOL_NAME_PATTERN.test(fn.name) || names.has(fn.name) ||
        (fn.description !== undefined && typeof fn.description !== 'string')) {
      throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
    }
    names.add(fn.name)
    return Object.freeze({
      type: 'function' as const,
      function: Object.freeze({
        name: fn.name,
        ...(fn.description === undefined ? {} : { description: fn.description }),
        ...(fn.parameters === undefined ? {} : { parameters: cloneJsonSchema(fn.parameters) }),
      }),
    })
  }))
}

function decodeToolChoice(value: unknown, toolNames: ReadonlySet<string>): DeepSeekToolChoiceV1 | undefined {
  if (value === undefined) return undefined
  if (value === 'none') return value
  if (value === 'auto' || value === 'required') {
    if (toolNames.size === 0) throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
    return value
  }
  const input = closedObject(value, ['type', 'function'], ['type', 'function'])
  const fn = closedObject(input.function, ['name'], ['name'])
  if (input.type !== 'function' || typeof fn.name !== 'string' || !TOOL_NAME_PATTERN.test(fn.name) || !toolNames.has(fn.name)) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  }
  return Object.freeze({ type: 'function', function: Object.freeze({ name: fn.name }) })
}

export function compileDeepSeekStableChatRequestV1(inputValue: unknown): DeepSeekStableChatCompilationV1 {
  const input = closedObject(
    inputValue,
    ['model', 'priorArtifact', 'clientEntries', 'replayEntries', 'thinking', 'generation', 'tools', 'toolChoice'],
    ['model', 'thinking'],
  )
  if (typeof input.model !== 'string' || !MODEL_ID_PATTERN.test(input.model)) {
    throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  }
  const thinking = decodeThinking(input.thinking)
  const generation = decodeGeneration(input.generation)
  const tools = decodeTools(input.tools)
  const toolChoice = decodeToolChoice(input.toolChoice, new Set(tools?.map((tool) => tool.function.name) ?? []))
  if (thinking.type === 'enabled' && toolChoice !== undefined) {
    throw new DeepSeekStableChatRequestV1Error('DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED')
  }
  if (thinking.type === 'enabled' && ['temperature', 'topP', 'frequencyPenalty', 'presencePenalty']
    .some((key) => generation[key] !== undefined)) {
    throw new DeepSeekStableChatRequestV1Error('DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED')
  }
  if (generation.frequencyPenalty !== undefined || generation.presencePenalty !== undefined) {
    throw new DeepSeekStableChatRequestV1Error('DEEPSEEK_EXPLICIT_DEPRECATED_PENALTY_UNSUPPORTED')
  }
  const messages = input.replayEntries === undefined
    ? (() => {
      if (input.priorArtifact === undefined || input.clientEntries === undefined) {
        throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_SHAPE')
      }
      return buildDeepSeekNativeRequestHistoryV2({
        priorArtifact: input.priorArtifact as DeepSeekNativeHistoryArtifactV2 | null,
        clientEntries: input.clientEntries,
      })
    })()
    : (() => {
      if (input.priorArtifact !== undefined || input.clientEntries !== undefined) {
        throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_SHAPE')
      }
      return buildDeepSeekProjectedNativeRequestHistoryV2({ replayEntries: input.replayEntries })
    })()
  if (messages.length === 0) throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
  const nativeRequest: DeepSeekStableChatRequestV1 = Object.freeze({
    model: input.model,
    messages,
    stream: true,
    stream_options: Object.freeze({ include_usage: true }),
    thinking: Object.freeze({ type: thinking.type }),
    ...(thinking.reasoningEffort === undefined ? {} : { reasoning_effort: thinking.reasoningEffort }),
    ...(generation.maxTokens === undefined ? {} : { max_tokens: generation.maxTokens as number }),
    ...(generation.stop === undefined ? {} : { stop: generation.stop as string | readonly string[] }),
    ...(generation.temperature === undefined ? {} : { temperature: generation.temperature as number }),
    ...(generation.topP === undefined ? {} : { top_p: generation.topP as number }),
    ...(generation.responseFormat === undefined
      ? {}
      : { response_format: Object.freeze({ type: generation.responseFormat as 'text' | 'json_object' }) }),
    ...(tools === undefined ? {} : { tools }),
    ...(toolChoice === undefined ? {} : { tool_choice: toolChoice }),
  })
  let preparedBody: ImmutablePreparedBodyV2
  try {
    preparedBody = ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(
      nativeRequest,
      DEEPSEEK_STABLE_REQUEST_MAX_BYTES_V1,
    )
  } catch (error) {
    if (error instanceof StableSerializeV2Error && error.code === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      throw new DeepSeekStableChatRequestV1Error('GENERATION_V2_DEEPSEEK_REQUEST_LIMIT_EXCEEDED')
    }
    throw error
  }
  return Object.freeze({
    classification: 'deepseek_stable_request_compilation_non_executable',
    executionAuthority: 'none',
    nativeRequest,
    preparedBody,
  })
}

import {
  ImmutablePreparedBodyV2,
  StableSerializeV2Error,
  stableSerializeProviderRequestBoundedV2,
} from '../../compiler/stableSerialize'
import {
  buildOpenAIResponsesReplayInputV1,
  type OpenAIResponsesContinuationArtifactV1,
} from './continuationArtifactV1'
import type { OpenAIResponsesReplayItemV1 } from './nativeItemsV1'

export const OPENAI_RESPONSES_REQUEST_MAX_BYTES_V1 = 28 * 1_024 * 1_024

type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
type ReasoningSummary = 'auto' | 'concise' | 'detailed'
type FunctionTool = Readonly<{
  type: 'function'
  name: string
  description?: string
  parameters: Readonly<Record<string, unknown>>
  strict: boolean
}>
type WebSearchTool = Readonly<{
  type: 'web_search'
  search_context_size?: 'low' | 'medium' | 'high'
}>
type ImageGenerationTool = Readonly<{
  type: 'image_generation'
  size?: 'auto' | '1024x1024' | '1024x1536' | '1536x1024'
  quality?: 'auto' | 'low' | 'medium' | 'high'
  output_format?: 'png' | 'jpeg' | 'webp'
  background?: 'auto' | 'transparent' | 'opaque'
}>
export type OpenAIResponsesToolV1 = FunctionTool | WebSearchTool | ImageGenerationTool

export type OpenAIResponsesRequestV1 = Readonly<{
  model: string
  input: readonly OpenAIResponsesReplayItemV1[]
  stream: true
  store: false
  include: readonly ['reasoning.encrypted_content']
  instructions?: string
  reasoning?: Readonly<{ effort?: ReasoningEffort; summary?: ReasoningSummary }>
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  text?: Readonly<{ verbosity: 'low' | 'medium' | 'high' }>
  tools?: readonly OpenAIResponsesToolV1[]
  tool_choice?: 'none' | 'auto' | 'required'
}>

export type OpenAIResponsesCompilationV1 = Readonly<{
  classification: 'openai_responses_request_compilation_non_executable'
  executionAuthority: 'none'
  nativeRequest: OpenAIResponsesRequestV1
  preparedBody: ImmutablePreparedBodyV2
}>

export class OpenAIResponsesRequestV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_REQUEST_INVALID_SHAPE'
    | 'GENERATION_V2_OPENAI_REQUEST_UNKNOWN_FIELD'
    | 'GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE'
    | 'GENERATION_V2_OPENAI_REQUEST_LIMIT_EXCEEDED'
    | 'GENERATION_V2_OPENAI_REASONING_EXPLICIT_FIELD_UNSUPPORTED') {
    super(code)
    this.name = 'OpenAIResponsesRequestV1Error'
  }
}

type ClosedObject = Readonly<Record<string, unknown>>
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u

function fail(code: OpenAIResponsesRequestV1Error['code']): never {
  throw new OpenAIResponsesRequestV1Error(code)
}

function closedObject(value: unknown, allowed: readonly string[], required: readonly string[] = allowed): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_SHAPE')
  }
  const keys = Object.keys(descriptors)
  if (keys.some((key) => !allowed.includes(key))) return fail('GENERATION_V2_OPENAI_REQUEST_UNKNOWN_FIELD')
  if (required.some((key) => !keys.includes(key))) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_SHAPE')
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function denseArray(value: unknown, max: number, allowEmpty = false): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || (!allowEmpty && value.length === 0)) {
    return fail(Array.isArray(value) && value.length > max
      ? 'GENERATION_V2_OPENAI_REQUEST_LIMIT_EXCEEDED'
      : 'GENERATION_V2_OPENAI_REQUEST_INVALID_SHAPE')
  }
  const keys = Reflect.ownKeys(value)
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function cloneSchema(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  try {
    return deepFreeze(JSON.parse(stableSerializeProviderRequestBoundedV2(value, OPENAI_RESPONSES_REQUEST_MAX_BYTES_V1))) as Readonly<Record<string, unknown>>
  } catch (error) {
    if (error instanceof StableSerializeV2Error && error.code === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      return fail('GENERATION_V2_OPENAI_REQUEST_LIMIT_EXCEEDED')
    }
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
}

function deepFreeze(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item)
    return Object.freeze(value)
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item)
    return Object.freeze(value)
  }
  return value
}

function decodeReasoning(value: unknown): OpenAIResponsesRequestV1['reasoning'] {
  if (value === undefined) return undefined
  const input = closedObject(value, ['effort', 'summary'], [])
  const efforts = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
  const summaries = new Set(['auto', 'concise', 'detailed'])
  if (input.effort !== undefined && !efforts.has(input.effort as string)) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  if (input.summary !== undefined && !summaries.has(input.summary as string)) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  if (Object.keys(input).length === 0) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  return Object.freeze({
    ...(input.effort === undefined ? {} : { effort: input.effort as ReasoningEffort }),
    ...(input.summary === undefined ? {} : { summary: input.summary as ReasoningSummary }),
  })
}

function optionalFinite(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  return value
}

function decodeGeneration(value: unknown): Readonly<{
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  verbosity?: 'low' | 'medium' | 'high'
}> {
  if (value === undefined) return Object.freeze({})
  const input = closedObject(value, ['temperature', 'topP', 'maxOutputTokens', 'verbosity'], [])
  const temperature = optionalFinite(input.temperature, 0, 2)
  const topP = optionalFinite(input.topP, 0, 1)
  if (input.maxOutputTokens !== undefined && (!Number.isSafeInteger(input.maxOutputTokens) || (input.maxOutputTokens as number) < 1)) {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  if (input.verbosity !== undefined && input.verbosity !== 'low' && input.verbosity !== 'medium' && input.verbosity !== 'high') {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  return Object.freeze({
    ...(temperature === undefined ? {} : { temperature }), ...(topP === undefined ? {} : { topP }),
    ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens as number }),
    ...(input.verbosity === undefined ? {} : { verbosity: input.verbosity }),
  })
}

function decodeTool(value: unknown, names: Set<string>): OpenAIResponsesToolV1 {
  const discriminator = closedObject(value, [
    'type', 'name', 'description', 'parameters', 'strict', 'searchContextSize', 'size', 'quality', 'outputFormat', 'background',
  ], ['type'])
  if (discriminator.type === 'function') {
    const input = closedObject(value, ['type', 'name', 'description', 'parameters', 'strict'], ['type', 'name', 'parameters', 'strict'])
    if (typeof input.name !== 'string' || !TOOL_NAME_PATTERN.test(input.name) || names.has(input.name) ||
        (input.description !== undefined && typeof input.description !== 'string') || typeof input.strict !== 'boolean') {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
    names.add(input.name)
    return Object.freeze({
      type: 'function', name: input.name, ...(input.description === undefined ? {} : { description: input.description }),
      parameters: cloneSchema(input.parameters), strict: input.strict,
    })
  }
  if (discriminator.type === 'web_search') {
    const input = closedObject(value, ['type', 'searchContextSize'], ['type'])
    if (input.searchContextSize !== undefined && input.searchContextSize !== 'low' && input.searchContextSize !== 'medium' && input.searchContextSize !== 'high') {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
    return Object.freeze({ type: 'web_search', ...(input.searchContextSize === undefined ? {} : { search_context_size: input.searchContextSize }) })
  }
  if (discriminator.type === 'image_generation') {
    const input = closedObject(value, ['type', 'size', 'quality', 'outputFormat', 'background'], ['type'])
    const sizes = new Set(['auto', '1024x1024', '1024x1536', '1536x1024'])
    const qualities = new Set(['auto', 'low', 'medium', 'high'])
    const formats = new Set(['png', 'jpeg', 'webp'])
    const backgrounds = new Set(['auto', 'transparent', 'opaque'])
    if ((input.size !== undefined && !sizes.has(input.size as string)) ||
        (input.quality !== undefined && !qualities.has(input.quality as string)) ||
        (input.outputFormat !== undefined && !formats.has(input.outputFormat as string)) ||
        (input.background !== undefined && !backgrounds.has(input.background as string))) {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
    return Object.freeze({
      type: 'image_generation', ...(input.size === undefined ? {} : { size: input.size as ImageGenerationTool['size'] }),
      ...(input.quality === undefined ? {} : { quality: input.quality as ImageGenerationTool['quality'] }),
      ...(input.outputFormat === undefined ? {} : { output_format: input.outputFormat as ImageGenerationTool['output_format'] }),
      ...(input.background === undefined ? {} : { background: input.background as ImageGenerationTool['background'] }),
    })
  }
  return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
}

function decodeTools(value: unknown): readonly OpenAIResponsesToolV1[] | undefined {
  if (value === undefined) return undefined
  const tools = denseArray(value, 128, false)
  const names = new Set<string>()
  return Object.freeze(tools.map((tool) => decodeTool(tool, names)))
}

export function compileOpenAIResponsesRequestV1(value: unknown): OpenAIResponsesCompilationV1 {
  const input = closedObject(value, [
    'model', 'priorArtifact', 'clientItems', 'instructions', 'reasoning', 'generation', 'tools', 'toolChoice',
  ], ['model', 'priorArtifact', 'clientItems'])
  if (typeof input.model !== 'string' || !MODEL_PATTERN.test(input.model) ||
      (input.instructions !== undefined && (typeof input.instructions !== 'string' || input.instructions.length === 0))) {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  const reasoning = decodeReasoning(input.reasoning)
  const generation = decodeGeneration(input.generation)
  const tools = decodeTools(input.tools)
  if (input.toolChoice !== undefined && input.toolChoice !== 'none' && input.toolChoice !== 'auto' && input.toolChoice !== 'required') {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  if (input.toolChoice !== undefined && tools === undefined) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  const replay = buildOpenAIResponsesReplayInputV1({
    priorArtifact: input.priorArtifact as OpenAIResponsesContinuationArtifactV1 | null,
    clientItems: input.clientItems,
  })
  if (replay.length === 0) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  const nativeRequest: OpenAIResponsesRequestV1 = Object.freeze({
    model: input.model,
    input: replay,
    stream: true,
    store: false,
    include: Object.freeze(['reasoning.encrypted_content'] as const),
    ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(generation.temperature === undefined ? {} : { temperature: generation.temperature }),
    ...(generation.topP === undefined ? {} : { top_p: generation.topP }),
    ...(generation.maxOutputTokens === undefined ? {} : { max_output_tokens: generation.maxOutputTokens }),
    ...(generation.verbosity === undefined ? {} : { text: Object.freeze({ verbosity: generation.verbosity }) }),
    ...(tools === undefined ? {} : { tools }),
    ...(input.toolChoice === undefined ? {} : { tool_choice: input.toolChoice as 'none' | 'auto' | 'required' }),
  })
  let preparedBody: ImmutablePreparedBodyV2
  try {
    preparedBody = ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(nativeRequest, OPENAI_RESPONSES_REQUEST_MAX_BYTES_V1)
  } catch (error) {
    if (error instanceof StableSerializeV2Error && error.code === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      return fail('GENERATION_V2_OPENAI_REQUEST_LIMIT_EXCEEDED')
    }
    throw error
  }
  return Object.freeze({
    classification: 'openai_responses_request_compilation_non_executable',
    executionAuthority: 'none',
    nativeRequest,
    preparedBody,
  })
}

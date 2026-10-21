import {
  ImmutablePreparedBodyV2,
  StableSerializeV2Error,
  stableSerializeProviderRequestBoundedV2,
} from '../../compiler/stableSerialize'
import {
  buildOpenAIResponsesReplayInputV1,
  type OpenAIResponsesContinuationArtifactV2,
} from './continuationArtifactV2'
import { decodeOpenAIResponsesReplayItemsV1, selectOpenAIResponsesReplayItemsV1,
  OPENAI_RESPONSES_REQUEST_DECODE_LIMITS_V1, type OpenAIResponsesReplayItemV1 } from './nativeItemsV1'
import { GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2, requiresProviderFileBindingV2, type AttachmentIntentV2 } from '../../domain/generationIntentV2'
import { validateApiRequestBodyV2 } from '../../contracts/apiRequestBodyContractV2'
import type { ProviderContractOperationV2 } from '../../contracts/providerContractRegistryV2'
import { getOpenAIImageToolOptionsV1, isOpenAIImageToolModelV1, isOpenAIImageToolSizeV1 } from './imageToolOptionsV1'
import { decodeBase64Bytes, encodeBase64Bytes } from '../../../../shared/encoding/binaryEncoding'

export const OPENAI_RESPONSES_REQUEST_MAX_BYTES_V1 = 28 * 1_024 * 1_024

export function isOpenAIResponsesEncodedAttachmentV1(attachment: AttachmentIntentV2): boolean {
  return (attachment.kind === 'managed_file' && attachment.include && attachment.sendAs === 'image_reference' && attachment.conversion === 'none') ||
    requiresProviderFileBindingV2(attachment) ||
    (attachment.kind === 'url_reference' && attachment.include && attachment.mediaKind === 'image')
}

type ReasoningEffort = string
type ReasoningSummary = string
type ReasoningMode = 'standard' | 'pro'
type ReasoningContext = 'auto' | 'current_turn' | 'all_turns'
type FunctionTool = Readonly<{
  type: 'function'
  name: string
  description?: string
  parameters: Readonly<Record<string, unknown>>
  strict: boolean
}>
type WebSearchTool = Readonly<{
  type: 'web_search'
  search_context_size?: string
  filters?: Readonly<{ allowed_domains: readonly string[] }>
}>
type ImageGenerationTool = Readonly<{
  type: 'image_generation'
  model?: string
  action?: 'auto' | 'generate' | 'edit'
  size?: string
  quality?: string
  output_format?: 'png' | 'jpeg' | 'webp'
  background?: 'auto' | 'transparent' | 'opaque'
  partial_images?: number
  output_compression?: number
  input_fidelity?: 'low' | 'high'
  moderation?: 'auto' | 'low'
  input_image_mask?: Readonly<{ image_url: string }>
}>
export type OpenAIResponsesToolV1 = FunctionTool | WebSearchTool | ImageGenerationTool
export type OpenAIResponsesToolChoiceV1 = 'none' | 'auto' | 'required' | Readonly<{ type: 'function'; name: string }> | Readonly<{ type: 'image_generation' }>

export type OpenAIResponsesRequestV1 = Readonly<{
  model: string
  input: readonly OpenAIResponsesReplayItemV1[]
  stream: true
  store: false
  // Legacy-compatible under store:false: encrypted reasoning is already returned by default.
  include: readonly ['reasoning.encrypted_content']
  instructions?: string
  reasoning?: Readonly<{ effort?: ReasoningEffort; summary?: ReasoningSummary; mode?: ReasoningMode; context?: ReasoningContext }>
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  text?: Readonly<{ verbosity: string }>
  tools?: readonly OpenAIResponsesToolV1[]
  tool_choice?: OpenAIResponsesToolChoiceV1
  max_tool_calls?: number
  parallel_tool_calls?: boolean
  service_tier?: 'auto' | 'default' | 'flex' | 'priority'
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
  const input = closedObject(value, ['effort', 'summary', 'mode', 'context'], [])
  const modes = new Set(['standard', 'pro'])
  const contexts = new Set(['auto', 'current_turn', 'all_turns'])
  const openString = (value: unknown): string | undefined => {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || value.length === 0 || value.length > GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2 || /[\u0000-\u001f\u007f]/u.test(value)) {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
    return value
  }
  const effort = openString(input.effort)
  const summary = openString(input.summary)
  if (input.mode !== undefined && !modes.has(input.mode as string)) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  if (input.context !== undefined && !contexts.has(input.context as string)) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  if (Object.keys(input).length === 0) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  return Object.freeze({
    ...(effort === undefined ? {} : { effort: effort as ReasoningEffort }),
    ...(summary === undefined ? {} : { summary: summary as ReasoningSummary }),
    ...(input.mode === undefined ? {} : { mode: input.mode as ReasoningMode }),
    ...(input.context === undefined ? {} : { context: input.context as ReasoningContext }),
  })
}

function optionalFinite(value: unknown, min: number, max: number, skipPolicyRange = false): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || (!skipPolicyRange && (value < min || value > max))) {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  return value
}

function decodeGeneration(value: unknown, skipPolicyRanges = false): Readonly<{
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  verbosity?: string
}> {
  if (value === undefined) return Object.freeze({})
  const input = closedObject(value, ['temperature', 'topP', 'maxOutputTokens', 'verbosity'], [])
  const temperature = optionalFinite(input.temperature, 0, 2, skipPolicyRanges)
  const topP = optionalFinite(input.topP, 0, 1, skipPolicyRanges)
  if (input.maxOutputTokens !== undefined && (!Number.isSafeInteger(input.maxOutputTokens) || (!skipPolicyRanges && (input.maxOutputTokens as number) < 1))) {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  if (input.verbosity !== undefined && (typeof input.verbosity !== 'string' || input.verbosity.length === 0 || input.verbosity.length > GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2)) {
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
    'type', 'name', 'description', 'parameters', 'strict', 'searchContextSize', 'allowedDomains',
    'model', 'action', 'size', 'quality', 'outputFormat', 'background', 'partialImages', 'outputCompression', 'inputFidelity', 'moderation', 'inputImageMask',
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
    const input = closedObject(value, ['type', 'searchContextSize', 'allowedDomains'], ['type'])
    if (input.searchContextSize !== undefined && (typeof input.searchContextSize !== 'string' || input.searchContextSize.length === 0 || input.searchContextSize.length > GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2)) {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
    const allowedDomains = input.allowedDomains === undefined ? undefined : denseArray(input.allowedDomains, 100, false)
    if (allowedDomains?.some((domain) => typeof domain !== 'string' || domain.length === 0 || domain.trim() !== domain ||
        domain.includes('/') || /\s/u.test(domain)) || allowedDomains !== undefined && new Set(allowedDomains).size !== allowedDomains.length) {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
    return Object.freeze({
      type: 'web_search',
      ...(input.searchContextSize === undefined ? {} : { search_context_size: input.searchContextSize }),
      ...(allowedDomains === undefined ? {} : { filters: Object.freeze({ allowed_domains: Object.freeze([...allowedDomains] as string[]) }) }),
    })
  }
  if (discriminator.type === 'image_generation') {
    const input = closedObject(value, ['type', 'model', 'action', 'size', 'quality', 'outputFormat', 'background', 'partialImages', 'outputCompression', 'inputFidelity', 'moderation', 'inputImageMask'], ['type'])
    const actions = new Set(['auto', 'generate', 'edit'])
    if (input.model !== undefined && !isOpenAIImageToolModelV1(input.model)) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    const options = getOpenAIImageToolOptionsV1(input.model as string | undefined)
    const formats = new Set(['png', 'jpeg', 'webp'])
    const backgrounds = new Set(['auto', 'transparent', 'opaque'])
    const invalidPartialImages = input.partialImages !== undefined && (!Number.isSafeInteger(input.partialImages) ||
      (input.partialImages as number) < 0 || (input.partialImages as number) > 3)
    if ((input.model !== undefined && !isOpenAIImageToolModelV1(input.model)) ||
        (input.action !== undefined && !actions.has(input.action as string)) ||
        (input.size !== undefined && !isOpenAIImageToolSizeV1(input.size, input.model as string | undefined)) ||
        (input.quality !== undefined && (typeof input.quality !== 'string' || input.quality.length === 0 || input.quality.length > GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2)) ||
        (input.model !== undefined && input.quality !== undefined && !options.qualities.includes(input.quality as string)) ||
        (input.outputFormat !== undefined && !formats.has(input.outputFormat as string)) ||
        (input.background !== undefined && !backgrounds.has(input.background as string)) ||
        (input.background === 'transparent' && input.outputFormat === 'jpeg') ||
        (input.outputCompression !== undefined && (!Number.isSafeInteger(input.outputCompression) || (input.outputCompression as number) < 0 || (input.outputCompression as number) > 100 || !['jpeg', 'webp'].includes(input.outputFormat as string))) ||
        (input.inputFidelity !== undefined && !options.inputFidelities.includes(input.inputFidelity as never)) ||
        (input.moderation !== undefined && !options.moderations.includes(input.moderation as never)) ||
        invalidPartialImages) {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
    const mask = input.inputImageMask === undefined ? undefined : closedObject(input.inputImageMask, ['imageUrl'])
    if (mask !== undefined && (typeof mask.imageUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(mask.imageUrl) || input.action === 'generate')) {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
    return Object.freeze({
      type: 'image_generation',
      ...(input.model === undefined ? {} : { model: input.model as string }),
      ...(input.action === undefined ? {} : { action: input.action as ImageGenerationTool['action'] }),
      ...(input.size === undefined ? {} : { size: input.size as ImageGenerationTool['size'] }),
      ...(input.quality === undefined ? {} : { quality: input.quality as ImageGenerationTool['quality'] }),
      ...(input.outputFormat === undefined ? {} : { output_format: input.outputFormat as ImageGenerationTool['output_format'] }),
      ...(input.background === undefined ? {} : { background: input.background as ImageGenerationTool['background'] }),
      ...(input.partialImages === undefined ? {} : { partial_images: input.partialImages as number }),
      ...(input.outputCompression === undefined ? {} : { output_compression: input.outputCompression as number }),
      ...(input.inputFidelity === undefined ? {} : { input_fidelity: input.inputFidelity as 'low' | 'high' }),
      ...(input.moderation === undefined ? {} : { moderation: input.moderation as 'auto' | 'low' }),
      ...(mask === undefined ? {} : { input_image_mask: Object.freeze({ image_url: mask.imageUrl as string }) }),
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

/** Persisted tool IDs cannot be resolved under store:false. Keep source artifacts
 * intact and send the actual historical image bytes only at the wire boundary. */
function statelessImageReplay(items: readonly OpenAIResponsesReplayItemV1[], maskedEdit: boolean): readonly OpenAIResponsesReplayItemV1[] {
  const projected = items.map((item): OpenAIResponsesReplayItemV1 => {
    if (!('type' in item) || item.type !== 'image_generation_call') return item
    if (item.status === 'failed') return Object.freeze({ role: 'user', content: Object.freeze([
      Object.freeze({ type: 'input_text', text: '[Historical assistant image generation failed; no image output is available.]' }),
    ]) })
    if (!item.result || item.result.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(item.result)) {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
    const bytes = decodeBase64Bytes(item.result)
    try {
      if (encodeBase64Bytes(bytes) !== item.result) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
      const format = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) ? 'png'
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg'
          : bytes.length >= 12 && [82, 73, 70, 70].every((byte, index) => bytes[index] === byte) &&
            [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte) ? 'webp' : null
      if (!format) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
      return Object.freeze({ role: 'user', content: Object.freeze([
        Object.freeze({ type: 'input_text', text: '[Historical image generated by the assistant; supplied inline because server-side storage is disabled.]' }),
        Object.freeze({ type: 'input_image', image_url: `data:image/${format};base64,${item.result}` }),
      ]) })
    } finally { bytes.fill(0) }
  })
  if (maskedEdit) {
    // A mask applies to the first image in the whole input, including history.
    // Anchor the current reference ahead of older images without dropping or
    // rewriting historical facts. Avoid duplicating it when it is already first.
    const latestUser = [...items].reverse().find(item => 'role' in item && item.role === 'user')
    const target = latestUser && 'role' in latestUser && latestUser.role === 'user'
      ? latestUser.content.find(part => part.type === 'input_image') : undefined
    if (!target || target.type !== 'input_image') return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    const firstImage = projected.flatMap(item => 'role' in item && item.role === 'user' ? item.content : [])
      .find(part => part.type === 'input_image')
    if (!firstImage || firstImage.type !== 'input_image' ||
        firstImage.image_url !== target.image_url || firstImage.file_id !== target.file_id) {
      projected.unshift(Object.freeze({ role: 'user', content: Object.freeze([
        Object.freeze({ type: 'input_text', text: '[Current masked-edit target image, repeated first so the mask applies to this selected reference rather than an older historical image.]' }),
        target,
      ]) }))
    }
  }
  return decodeOpenAIResponsesReplayItemsV1(projected, OPENAI_RESPONSES_REQUEST_DECODE_LIMITS_V1)
}

export function compileOpenAIResponsesRequestV1(value: unknown, operation: ProviderContractOperationV2 = 'text', bodySchemaRevision?: string): OpenAIResponsesCompilationV1 {
  const input = closedObject(value, [
    'model', 'priorArtifact', 'clientItems', 'replayItems', 'instructions', 'reasoning', 'generation', 'tools', 'toolChoice',
    'maxToolCalls', 'parallelToolCalls', 'serviceTier',
  ], ['model'])
  if (typeof input.model !== 'string' || input.model.length === 0 || input.model.length > 512 ||
      (input.instructions !== undefined && (typeof input.instructions !== 'string' || input.instructions.length === 0))) {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  const reasoning = decodeReasoning(input.reasoning)
  const skipPolicyRanges = bodySchemaRevision !== undefined
  const generation = decodeGeneration(input.generation, skipPolicyRanges)
  const tools = decodeTools(input.tools)
  let toolChoice: OpenAIResponsesToolChoiceV1 | undefined
  if (input.toolChoice === 'none' || input.toolChoice === 'auto' || input.toolChoice === 'required') {
    toolChoice = input.toolChoice
  } else if (input.toolChoice !== undefined) {
    const choice = closedObject(input.toolChoice, ['type', 'name'], ['type'])
    if (choice.type === 'image_generation' && Object.keys(choice).length === 1 && tools?.some((tool) => tool.type === 'image_generation')) {
      toolChoice = Object.freeze({ type: 'image_generation' })
    } else {
    if (choice.type !== 'function' || typeof choice.name !== 'string' || !TOOL_NAME_PATTERN.test(choice.name) ||
        !tools?.some((tool) => tool.type === 'function' && tool.name === choice.name)) {
      return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
    toolChoice = Object.freeze({ type: 'function', name: choice.name })
    }
  }
  if (input.toolChoice !== undefined && tools === undefined) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  if (input.maxToolCalls !== undefined && (!Number.isSafeInteger(input.maxToolCalls) || (!skipPolicyRanges && (input.maxToolCalls as number) < 1))) {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  if (input.parallelToolCalls !== undefined && typeof input.parallelToolCalls !== 'boolean') {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  if (input.serviceTier !== undefined && input.serviceTier !== 'auto' && input.serviceTier !== 'default' &&
      input.serviceTier !== 'flex' && input.serviceTier !== 'priority') {
    return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  }
  const replay = input.replayItems === undefined
    ? (() => {
      if (input.priorArtifact === undefined || input.clientItems === undefined) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_SHAPE')
      return buildOpenAIResponsesReplayInputV1({
        priorArtifact: input.priorArtifact as OpenAIResponsesContinuationArtifactV2 | null,
        clientItems: input.clientItems,
      })
    })()
    : (() => {
      if (input.priorArtifact !== undefined || input.clientItems !== undefined) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_SHAPE')
      return selectOpenAIResponsesReplayItemsV1(decodeOpenAIResponsesReplayItemsV1(
        input.replayItems, OPENAI_RESPONSES_REQUEST_DECODE_LIMITS_V1))
    })()
  if (replay.length === 0) return fail('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
  const nativeRequest: OpenAIResponsesRequestV1 = Object.freeze({
    model: input.model,
    input: statelessImageReplay(replay, tools?.some(tool => tool.type === 'image_generation' && tool.input_image_mask !== undefined) ?? false),
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
    ...(toolChoice === undefined ? {} : { tool_choice: toolChoice }),
    ...(input.maxToolCalls === undefined ? {} : { max_tool_calls: input.maxToolCalls as number }),
    ...(input.parallelToolCalls === undefined ? {} : { parallel_tool_calls: input.parallelToolCalls }),
    ...(input.serviceTier === undefined ? {} : { service_tier: input.serviceTier as 'auto' | 'default' | 'flex' | 'priority' }),
  })
  validateApiRequestBodyV2('openai_responses', operation, nativeRequest, bodySchemaRevision)
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

import { GenerationV2Digest, GenerationV2Identity } from './identityV2'
import type { CompatibleJsonValue } from '../../../shared/provider/openai-chat-compatible/request/messageTypes'
import { compatibleBoundedJsonValueSchema } from '../../../shared/provider/openai-chat-compatible/schemas'

export type SamplingIntentV2 = Readonly<{
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  minP?: number
  topA?: number
  seed?: number
  stop?: readonly string[]
  candidateCount?: number
  frequencyPenalty?: number
  presencePenalty?: number
  repetitionPenalty?: number
}>

export type ReasoningIntentV2 =
  | Readonly<{ mode: 'disabled' }>
  | Readonly<{
      mode: 'enabled'
      effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
      summary?: 'auto' | 'concise' | 'detailed'
      exclude?: boolean
    }>

export type WebSearchIntentV2 =
  | Readonly<{ mode: 'disabled' }>
  | Readonly<{
      mode: 'provider_search'
      types: readonly ('web' | 'image')[]
      engine?: 'auto' | 'native' | 'exa' | 'firecrawl' | 'parallel' | 'perplexity'
      maxResults?: number
      maxTotalResults?: number
      searchContextSize?: 'low' | 'medium' | 'high'
      maxCharacters?: number
      userLocation?: Readonly<{
        city?: string
        region?: string
        country?: string
        timezone?: string
      }>
      allowedDomains?: readonly string[]
      excludedDomains?: readonly string[]
    }>

export type ImageGenerationIntentV2 =
  | Readonly<{ mode: 'disabled' }>
  | Readonly<{
      mode: 'generate'
      outputMode?: 'image_only' | 'image_and_text'
      aspectRatio?: ImageAspectRatioV2
      resolution?: '512' | '1K' | '2K' | '4K'
      size?: Readonly<{ width: number; height: number }>
      quality?: 'auto' | 'low' | 'medium' | 'high'
      format?: 'png' | 'jpeg' | 'webp' | 'svg'
      background?: 'auto' | 'transparent' | 'opaque'
      outputCompression?: number
      stream?: boolean
    }>

export type ToolChoiceIntentV2 =
  | Readonly<{ mode: 'omitted' }>
  | Readonly<{ mode: 'auto' | 'none' | 'required' }>
  | Readonly<{ mode: 'named'; toolId: GenerationV2Identity<'tool_id'> }>

export type ToolPolicyIntentV2 =
  | Readonly<{ mode: 'disabled' }>
  | Readonly<{
      mode: 'enabled'
      allowedToolIds: readonly GenerationV2Identity<'tool_id'>[]
      toolChoice: ToolChoiceIntentV2
      sideEffectConfirmation: 'required_each_retry'
    }>

export type ManagedFileAttachmentIntentV2 = Readonly<{
  kind: 'managed_file'
  assetId: GenerationV2Identity<'asset_id'>
  assetRevisionId: GenerationV2Identity<'asset_revision_id'>
  assetSha256: GenerationV2Digest<'asset_sha256'>
  include: boolean
  sendAs: 'provider_file' | 'inline_text' | 'image_reference' | 'converted_document'
  conversion: 'none' | 'pdf' | 'plain_text' | 'images'
}>

/**
 * A user-supplied remote reference.  This is deliberately not a managed asset:
 * preserving the URL does not claim that its remote bytes are stable or even
 * still reachable when a retry occurs.
 */
export type UrlReferenceAttachmentIntentV2 = Readonly<{
  kind: 'url_reference'
  referenceId: GenerationV2Identity<'url_reference_id'>
  referenceRevision: GenerationV2Identity<'url_reference_revision'>
  originalUrl: string
  urlDigest: GenerationV2Digest<'url_digest'>
  mediaKind: 'image' | 'document' | 'audio' | 'video' | 'other'
  declaredMediaType?: string
  capturedAtMs: number
  provenance: 'user_supplied'
  include: boolean
  sendAs: 'url_reference'
  conversion: 'none'
}>

export type AttachmentIntentV2 = ManagedFileAttachmentIntentV2 | UrlReferenceAttachmentIntentV2

/**
 * A provider-file binding is an immutable server-side handle to a managed
 * revision.  It is needed both for a file selected as-is and for the PDF
 * revision produced by document conversion.  This is intentionally a domain
 * fact, not a provider capability claim: a codec must still reject a binding
 * shape its own formal contract cannot encode.
 */
export function requiresProviderFileBindingV2(
  attachment: AttachmentIntentV2,
): attachment is ManagedFileAttachmentIntentV2 {
  return attachment.kind === 'managed_file' && attachment.include && (
    attachment.sendAs === 'provider_file' && attachment.conversion === 'none' ||
    attachment.sendAs === 'converted_document' && attachment.conversion === 'pdf'
  )
}

export type ProviderSemanticExtensionV2 =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'openrouter_chat'
      verbosity?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
      parallelToolCalls?: boolean
      responseFormat?: OpenRouterResponseFormatIntentV2
    }>
  | Readonly<{
      kind: 'openai_responses'
      verbosity?: 'low' | 'medium' | 'high'
      maxToolCalls?: number
      parallelToolCalls?: boolean
      serviceTier?: 'auto' | 'default' | 'flex' | 'priority'
      reasoningMode?: 'standard' | 'pro'
      reasoningContext?: 'auto' | 'current_turn' | 'all_turns'
    }>
  | Readonly<{
      kind: 'anthropic_messages'
      thinkingDisplay: 'provider_default' | 'summarized' | 'omitted'
      thinkingMode: 'model_recommended' | 'adaptive'
      manualThinkingBudgetTokens?: never
    }>
  | Readonly<{
      kind: 'anthropic_messages'
      thinkingDisplay: 'provider_default' | 'summarized' | 'omitted'
      thinkingMode: 'manual'
      manualThinkingBudgetTokens: number
    }>
  | Readonly<{
      kind: 'gemini_generate_content'
      thinkingMode: 'provider_default'
      includeThoughts: 'provider_default' | 'enabled' | 'disabled'
    }>
  | Readonly<{
      kind: 'gemini_generate_content'
      thinkingMode: 'level'
      thinkingLevel: 'minimal' | 'low' | 'medium' | 'high'
      includeThoughts: 'provider_default' | 'enabled' | 'disabled'
    }>
  | Readonly<{
      kind: 'gemini_generate_content'
      thinkingMode: 'budget'
      thinkingBudget: number
      includeThoughts: 'provider_default' | 'enabled' | 'disabled'
    }>

export type OpenRouterResponseFormatIntentV2 =
  | Readonly<{ type: 'text' }>
  | Readonly<{ type: 'json_object' }>
  | Readonly<{
      type: 'json_schema'
      jsonSchema: Readonly<{
        name: string
        description?: string
        schema: Readonly<Record<string, CompatibleJsonValue>>
        strict?: boolean
      }>
    }>

const attachmentIntentsV2 = new WeakSet<object>()

export function isAttachmentIntentV2(value: unknown): value is AttachmentIntentV2 {
  return Boolean(value && typeof value === 'object' && attachmentIntentsV2.has(value))
}

export type GenerationIntentLayerV2 = Readonly<{
  schemaVersion: 2
  generation?: SamplingIntentV2
  reasoning?: ReasoningIntentV2
  web?: WebSearchIntentV2
  image?: ImageGenerationIntentV2
  tools?: ToolPolicyIntentV2
  attachments?: readonly AttachmentIntentV2[]
  providerExtension?: ProviderSemanticExtensionV2
}>

export class GenerationIntentV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_INTENT_INVALID_SHAPE'
    | 'GENERATION_V2_INTENT_UNKNOWN_FIELD'
    | 'GENERATION_V2_INTENT_INVALID_VALUE'
    | 'GENERATION_V2_INTENT_DUPLICATE_VALUE') {
    super(code)
    this.name = 'GenerationIntentV2Error'
  }
}

const ASPECT_RATIO_TOKEN: unique symbol = Symbol('starverse.generation-v2.image-aspect-ratio')
const aspectRatios = new WeakSet<object>()

export class ImageAspectRatioV2 {
  private constructor(token: typeof ASPECT_RATIO_TOKEN, readonly value: string) {
    if (token !== ASPECT_RATIO_TOKEN) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    aspectRatios.add(this)
    Object.freeze(this)
  }

  static create(value: string): ImageAspectRatioV2 {
    if (typeof value !== 'string' || (value !== 'auto' && !/^[1-9]\d{0,4}:[1-9]\d{0,4}$/u.test(value))) {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    }
    return new ImageAspectRatioV2(ASPECT_RATIO_TOKEN, value)
  }
}

Object.freeze(ImageAspectRatioV2.prototype)

export function readImageAspectRatioV2(value: ImageAspectRatioV2): string {
  if (!value || typeof value !== 'object' || !aspectRatios.has(value)) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  return value.value
}

type ClosedInput = { readonly [key: string]: unknown }

function closedObject(value: unknown, allowed: readonly string[]): ClosedInput {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_SHAPE')
  }
  if (Object.keys(descriptors).some((key) => !allowed.includes(key))) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_UNKNOWN_FIELD')
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}

function closedDenseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_SHAPE')
  }
  const keys = Reflect.ownKeys(value)
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_SHAPE')
  }
  const result: unknown[] = []
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_SHAPE')
    }
    result.push(descriptor.value)
  }
  return result
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left)
  const rightPoints = Array.from(right)
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index].codePointAt(0) ?? 0) - (rightPoints[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function optionalFiniteNumber(object: ClosedInput, key: string): number | undefined {
  const value = object[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  return value
}

function optionalPositiveInteger(object: ClosedInput, key: string): number | undefined {
  const value = optionalFiniteNumber(object, key)
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  return value
}

function optionalNonNegativeInteger(object: ClosedInput, key: string): number | undefined {
  const value = optionalFiniteNumber(object, key)
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  return value
}

function optionalEnum<T extends string>(object: ClosedInput, key: string, values: readonly T[]): T | undefined {
  const value = object[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  return value as T
}

function compact<T extends object>(value: T): T {
  for (const key of Object.keys(value)) {
    if ((value as ClosedInput)[key] === undefined) delete (value as { [key: string]: unknown })[key]
  }
  return Object.freeze(value)
}

function validResponseFormatName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u.test(value)
}

function decodeOpenRouterResponseFormat(value: unknown): OpenRouterResponseFormatIntentV2 {
  const input = closedObject(value, ['type', 'jsonSchema'])
  if (input.type === 'text' || input.type === 'json_object') {
    if (Object.keys(input).length !== 1) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    return Object.freeze({ type: input.type }) as OpenRouterResponseFormatIntentV2
  }
  if (input.type !== 'json_schema') throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  const jsonSchema = closedObject(input.jsonSchema, ['name', 'description', 'schema', 'strict'])
  if (!validResponseFormatName(jsonSchema.name) ||
      !jsonSchema.schema || typeof jsonSchema.schema !== 'object' || Array.isArray(jsonSchema.schema) ||
      (jsonSchema.description !== undefined && (typeof jsonSchema.description !== 'string' || jsonSchema.description.length > 4096)) ||
      (jsonSchema.strict !== undefined && typeof jsonSchema.strict !== 'boolean')) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  let schema: CompatibleJsonValue
  try { schema = compatibleBoundedJsonValueSchema.parse(jsonSchema.schema) as CompatibleJsonValue } catch {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  return Object.freeze({
    type: 'json_schema' as const,
    jsonSchema: Object.freeze({
      name: jsonSchema.name,
      ...(jsonSchema.description === undefined ? {} : { description: jsonSchema.description }),
      schema: Object.freeze(schema as Readonly<Record<string, CompatibleJsonValue>>),
      ...(jsonSchema.strict === undefined ? {} : { strict: jsonSchema.strict }),
    }),
  })
}

function decodeSampling(value: unknown): SamplingIntentV2 {
  const keys = ['maxOutputTokens', 'temperature', 'topP', 'topK', 'minP', 'topA', 'seed', 'stop', 'candidateCount', 'frequencyPenalty', 'presencePenalty', 'repetitionPenalty'] as const
  const input = closedObject(value, keys)
  const stop = input.stop === undefined ? undefined : (() => {
    const values = closedDenseArray(input.stop)
    if (values.some((item) => typeof item !== 'string' || item.length === 0)) {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    }
    if (new Set(values).size !== values.length) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_DUPLICATE_VALUE')
    return Object.freeze([...values]) as readonly string[]
  })()
  const temperature = optionalFiniteNumber(input, 'temperature')
  if (temperature !== undefined && temperature < 0) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  const topP = optionalFiniteNumber(input, 'topP')
  if (topP !== undefined && (topP < 0 || topP > 1)) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  const minP = optionalFiniteNumber(input, 'minP')
  const topA = optionalFiniteNumber(input, 'topA')
  if (minP !== undefined && (minP < 0 || minP > 1) || topA !== undefined && (topA < 0 || topA > 1)) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  const repetitionPenalty = optionalFiniteNumber(input, 'repetitionPenalty')
  if (repetitionPenalty !== undefined && repetitionPenalty <= 0) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  return compact({
    maxOutputTokens: optionalNonNegativeInteger(input, 'maxOutputTokens'),
    temperature,
    topP,
    topK: (() => {
      const topK = optionalFiniteNumber(input, 'topK')
      if (topK !== undefined && (!Number.isSafeInteger(topK) || topK < 0)) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
      return topK
    })(),
    minP,
    topA,
    seed: (() => {
      const seed = optionalFiniteNumber(input, 'seed')
      if (seed !== undefined && !Number.isSafeInteger(seed)) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
      return seed
    })(),
    stop,
    candidateCount: optionalPositiveInteger(input, 'candidateCount'),
    frequencyPenalty: optionalFiniteNumber(input, 'frequencyPenalty'),
    presencePenalty: optionalFiniteNumber(input, 'presencePenalty'),
    repetitionPenalty,
  })
}

function decodeReasoning(value: unknown): ReasoningIntentV2 {
  const input = closedObject(value, ['mode', 'effort', 'summary', 'exclude'])
  if (input.mode === 'disabled') {
    if (Object.keys(input).length !== 1) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    return Object.freeze({ mode: 'disabled' })
  }
  if (input.mode !== 'enabled') throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  if (input.exclude !== undefined && typeof input.exclude !== 'boolean') throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  return compact({
    mode: 'enabled' as const,
    effort: optionalEnum(input, 'effort', ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
    summary: optionalEnum(input, 'summary', ['auto', 'concise', 'detailed']),
    exclude: input.exclude as boolean | undefined,
  })
}

function decodeWeb(value: unknown): WebSearchIntentV2 {
  const input = closedObject(value, [
    'mode', 'types', 'engine', 'maxResults', 'maxTotalResults', 'searchContextSize',
    'maxCharacters', 'userLocation', 'allowedDomains', 'excludedDomains',
  ])
  if (input.mode === 'disabled') {
    if (Object.keys(input).length !== 1) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    return Object.freeze({ mode: 'disabled' })
  }
  const inputTypes = input.types === undefined ? [] : closedDenseArray(input.types)
  if (input.mode !== 'provider_search' || inputTypes.length === 0 ||
      inputTypes.some((item) => item !== 'web' && item !== 'image')) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  const types = [...inputTypes] as ('web' | 'image')[]
  if (new Set(types).size !== types.length) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_DUPLICATE_VALUE')
  types.sort((left, right) => ['web', 'image'].indexOf(left) - ['web', 'image'].indexOf(right))
  const decodeDomains = (key: 'allowedDomains' | 'excludedDomains'): readonly string[] | undefined => {
    if (input[key] === undefined) return undefined
    const values = closedDenseArray(input[key])
    if (values.length === 0 || values.length > 100 || values.some((item) =>
      typeof item !== 'string' || item.length === 0 || item.length > 253 || item.trim() !== item || /[\s/]/u.test(item))) {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    }
    if (new Set(values).size !== values.length) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_DUPLICATE_VALUE')
    return Object.freeze([...values] as string[])
  }
  const userLocation = input.userLocation === undefined ? undefined : (() => {
    const location = closedObject(input.userLocation, ['city', 'region', 'country', 'timezone'])
    if (Object.keys(location).length === 0 || Object.values(location).some((item) =>
      typeof item !== 'string' || item.length === 0 || item.length > 256 || item.trim() !== item)) {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    }
    return Object.freeze({
      ...(location.city === undefined ? {} : { city: location.city as string }),
      ...(location.region === undefined ? {} : { region: location.region as string }),
      ...(location.country === undefined ? {} : { country: location.country as string }),
      ...(location.timezone === undefined ? {} : { timezone: location.timezone as string }),
    })
  })()
  const maxResults = optionalPositiveInteger(input, 'maxResults')
  const maxTotalResults = optionalPositiveInteger(input, 'maxTotalResults')
  const maxCharacters = optionalPositiveInteger(input, 'maxCharacters')
  if (maxResults !== undefined && maxResults > 25 ||
      maxTotalResults !== undefined && maxTotalResults > 1_000_000 ||
      maxCharacters !== undefined && maxCharacters > 100_000) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  return compact({
    mode: 'provider_search' as const,
    types: Object.freeze(types),
    engine: optionalEnum(input, 'engine', ['auto', 'native', 'exa', 'firecrawl', 'parallel', 'perplexity']),
    maxResults,
    maxTotalResults,
    searchContextSize: optionalEnum(input, 'searchContextSize', ['low', 'medium', 'high']),
    maxCharacters,
    userLocation,
    allowedDomains: decodeDomains('allowedDomains'),
    excludedDomains: decodeDomains('excludedDomains'),
  })
}

function decodeImage(value: unknown): ImageGenerationIntentV2 {
  const input = closedObject(value, ['mode', 'outputMode', 'aspectRatio', 'resolution', 'size', 'quality', 'format', 'background', 'outputCompression', 'stream'])
  if (input.mode === 'disabled') {
    if (Object.keys(input).length !== 1) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    return Object.freeze({ mode: 'disabled' })
  }
  if (input.mode !== 'generate') throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  const size = input.size === undefined ? undefined : (() => {
    const value = closedObject(input.size, ['width', 'height'])
    const width = optionalPositiveInteger(value, 'width')
    const height = optionalPositiveInteger(value, 'height')
    if (!width || !height) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    return Object.freeze({ width, height })
  })()
  const outputCompression = optionalFiniteNumber(input, 'outputCompression')
  if (outputCompression !== undefined && (!Number.isSafeInteger(outputCompression) || outputCompression < 0 || outputCompression > 100)) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  if (input.stream !== undefined && typeof input.stream !== 'boolean') throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  return compact({
    mode: 'generate' as const,
    outputMode: optionalEnum(input, 'outputMode', ['image_only', 'image_and_text']),
    aspectRatio: input.aspectRatio === undefined
      ? undefined
      : ImageAspectRatioV2.create(input.aspectRatio as string),
    resolution: optionalEnum(input, 'resolution', ['512', '1K', '2K', '4K']),
    size,
    quality: optionalEnum(input, 'quality', ['auto', 'low', 'medium', 'high']),
    format: optionalEnum(input, 'format', ['png', 'jpeg', 'webp', 'svg']),
    background: optionalEnum(input, 'background', ['auto', 'transparent', 'opaque']),
    outputCompression,
    stream: input.stream as boolean | undefined,
  })
}

function decodeTools(value: unknown): ToolPolicyIntentV2 {
  const input = closedObject(value, ['mode', 'allowedToolIds', 'toolChoice', 'sideEffectConfirmation'])
  if (input.mode === 'disabled') {
    if (Object.keys(input).length !== 1) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    return Object.freeze({ mode: 'disabled' })
  }
  if (input.mode !== 'enabled' || input.sideEffectConfirmation !== 'required_each_retry') {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  const rawIds = closedDenseArray(input.allowedToolIds)
  if (rawIds.length === 0) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  const values = rawIds.map((item) => {
    if (typeof item !== 'string') throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    return GenerationV2Identity.create('tool_id', item)
  })
  if (new Set(values.map((item) => item.value)).size !== values.length) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_DUPLICATE_VALUE')
  }
  values.sort((left, right) => compareCodePoints(left.value, right.value))
  const choice = closedObject(input.toolChoice, ['mode', 'toolId'])
  let toolChoice: ToolChoiceIntentV2
  if (choice.mode === 'omitted' || choice.mode === 'auto' || choice.mode === 'none' || choice.mode === 'required') {
    if (Object.keys(choice).length !== 1) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    toolChoice = Object.freeze({ mode: choice.mode })
  } else if (choice.mode === 'named' && typeof choice.toolId === 'string' &&
      values.some((item) => item.value === choice.toolId)) {
    toolChoice = Object.freeze({
      mode: 'named',
      toolId: GenerationV2Identity.create('tool_id', choice.toolId),
    })
  } else {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  return Object.freeze({
    mode: 'enabled',
    allowedToolIds: Object.freeze(values),
    toolChoice,
    sideEffectConfirmation: 'required_each_retry',
  })
}

function decodeAttachment(value: unknown): AttachmentIntentV2 {
  const discriminator = closedObject(value, [
    'kind', 'assetId', 'assetRevisionId', 'assetSha256', 'referenceId', 'referenceRevision', 'originalUrl', 'urlDigest',
    'mediaKind', 'declaredMediaType', 'capturedAtMs', 'provenance', 'include', 'sendAs', 'conversion',
  ])
  if (discriminator.kind === 'managed_file') {
    const input = closedObject(value, ['kind', 'assetId', 'assetRevisionId', 'assetSha256', 'include', 'sendAs', 'conversion'])
    if (typeof input.assetId !== 'string' || typeof input.assetRevisionId !== 'string' || typeof input.assetSha256 !== 'string' || typeof input.include !== 'boolean') {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    }
    const sendAs = optionalEnum(input, 'sendAs', ['provider_file', 'inline_text', 'image_reference', 'converted_document'])
    const conversion = optionalEnum(input, 'conversion', ['none', 'pdf', 'plain_text', 'images'])
    if (!sendAs || !conversion) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    const attachment = Object.freeze({
      kind: 'managed_file' as const,
      assetId: GenerationV2Identity.create('asset_id', input.assetId),
      assetRevisionId: GenerationV2Identity.create('asset_revision_id', input.assetRevisionId),
      assetSha256: GenerationV2Digest.create('asset_sha256', input.assetSha256),
      include: input.include,
      sendAs,
      conversion,
    })
    attachmentIntentsV2.add(attachment)
    return attachment
  }
  if (discriminator.kind !== 'url_reference') {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  const input = closedObject(value, ['kind', 'referenceId', 'referenceRevision', 'originalUrl', 'urlDigest', 'mediaKind',
    'declaredMediaType', 'capturedAtMs', 'provenance', 'include', 'sendAs', 'conversion'])
  if (typeof input.referenceId !== 'string' || typeof input.referenceRevision !== 'string' || typeof input.originalUrl !== 'string' ||
      typeof input.urlDigest !== 'string' || typeof input.include !== 'boolean' || input.provenance !== 'user_supplied' ||
      input.sendAs !== 'url_reference' || input.conversion !== 'none' ||
      !['image', 'document', 'audio', 'video', 'other'].includes(String(input.mediaKind)) ||
      !Number.isSafeInteger(input.capturedAtMs) || (input.capturedAtMs as number) < 0 || input.originalUrl.length < 1 || input.originalUrl.length > 16384 ||
      (input.declaredMediaType !== undefined && (typeof input.declaredMediaType !== 'string' || !/^[a-z0-9!#$&^_.+*/-]+\/[a-z0-9!#$&^_.+*/-]+$/u.test(input.declaredMediaType)))) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  let parsed: URL
  try { parsed = new URL(input.originalUrl) } catch { throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE') }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  const attachment = Object.freeze({
    kind: 'url_reference' as const,
    referenceId: GenerationV2Identity.create('url_reference_id', input.referenceId),
    referenceRevision: GenerationV2Identity.create('url_reference_revision', input.referenceRevision),
    originalUrl: input.originalUrl,
    urlDigest: GenerationV2Digest.create('url_digest', input.urlDigest),
    mediaKind: input.mediaKind as UrlReferenceAttachmentIntentV2['mediaKind'],
    ...(input.declaredMediaType === undefined ? {} : { declaredMediaType: input.declaredMediaType }),
    capturedAtMs: input.capturedAtMs as number,
    provenance: 'user_supplied' as const,
    include: input.include,
    sendAs: 'url_reference' as const,
    conversion: 'none' as const,
  })
  attachmentIntentsV2.add(attachment)
  return attachment
}

function decodeProviderExtension(value: unknown): ProviderSemanticExtensionV2 {
  const input = closedObject(value, [
    'kind', 'verbosity', 'maxToolCalls', 'parallelToolCalls', 'serviceTier',
    'reasoningMode', 'reasoningContext',
    'thinkingDisplay', 'thinkingMode', 'manualThinkingBudgetTokens',
    'thinkingLevel', 'thinkingBudget', 'includeThoughts', 'responseFormat',
  ])
  if (input.kind === 'none') {
    if (Object.keys(input).length !== 1) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    return Object.freeze({ kind: 'none' })
  }
  if (input.kind === 'openrouter_chat') {
    const verbosity = optionalEnum(input, 'verbosity', ['low', 'medium', 'high', 'xhigh', 'max'])
    if (input.parallelToolCalls !== undefined && typeof input.parallelToolCalls !== 'boolean') {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    }
    return compact({
      kind: 'openrouter_chat' as const,
      verbosity,
      parallelToolCalls: input.parallelToolCalls as boolean | undefined,
      responseFormat: input.responseFormat === undefined ? undefined : decodeOpenRouterResponseFormat(input.responseFormat),
    }) as ProviderSemanticExtensionV2
  }
  if (input.kind === 'openai_responses') {
    const verbosity = optionalEnum(input, 'verbosity', ['low', 'medium', 'high'])
    const serviceTier = optionalEnum(input, 'serviceTier', ['auto', 'default', 'flex', 'priority'])
    const reasoningMode = optionalEnum(input, 'reasoningMode', ['standard', 'pro'])
    const reasoningContext = optionalEnum(input, 'reasoningContext', ['auto', 'current_turn', 'all_turns'])
    if (input.maxToolCalls !== undefined && (!Number.isSafeInteger(input.maxToolCalls) || (input.maxToolCalls as number) < 1) ||
        input.parallelToolCalls !== undefined && typeof input.parallelToolCalls !== 'boolean') {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    }
    return compact({
      kind: 'openai_responses' as const,
      verbosity,
      maxToolCalls: input.maxToolCalls as number | undefined,
      parallelToolCalls: input.parallelToolCalls as boolean | undefined,
      serviceTier,
      reasoningMode,
      reasoningContext,
    }) as ProviderSemanticExtensionV2
  }
  if (input.kind === 'anthropic_messages') {
    const thinkingMode = optionalEnum(input, 'thinkingMode', ['model_recommended', 'manual', 'adaptive'])
    const manualThinkingBudgetTokens = optionalPositiveInteger(input, 'manualThinkingBudgetTokens')
    const hasExpectedKeys = thinkingMode === 'manual'
      ? Object.keys(input).length === 4 && manualThinkingBudgetTokens !== undefined
      : Object.keys(input).length === 3 && manualThinkingBudgetTokens === undefined
    if (!hasExpectedKeys || !thinkingMode || input.thinkingDisplay === undefined) {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    }
    const thinkingDisplay = optionalEnum(input, 'thinkingDisplay', ['provider_default', 'summarized', 'omitted'])
      ?? (() => { throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE') })()
    return thinkingMode === 'manual'
      ? Object.freeze({
          kind: 'anthropic_messages' as const,
          thinkingDisplay,
          thinkingMode,
          manualThinkingBudgetTokens: manualThinkingBudgetTokens!,
        })
      : Object.freeze({
          kind: 'anthropic_messages' as const,
          thinkingDisplay,
          thinkingMode,
        })
  }
  if (input.kind === 'gemini_generate_content') {
    const thinkingMode = optionalEnum(input, 'thinkingMode', ['provider_default', 'level', 'budget'])
    const includeThoughts = optionalEnum(input, 'includeThoughts', ['provider_default', 'enabled', 'disabled'])
    const thinkingLevel = optionalEnum(input, 'thinkingLevel', ['minimal', 'low', 'medium', 'high'])
    const thinkingBudget = input.thinkingBudget === undefined
      ? undefined
      : (() => {
          if (!Number.isSafeInteger(input.thinkingBudget) || (input.thinkingBudget as number) < -1) {
            throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
          }
          return input.thinkingBudget as number
        })()
    if (!thinkingMode || !includeThoughts) {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    }
    if (thinkingMode === 'provider_default') {
      if (thinkingLevel !== undefined || thinkingBudget !== undefined || Object.keys(input).length !== 3) {
        throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
      }
      return Object.freeze({ kind: 'gemini_generate_content', thinkingMode, includeThoughts })
    }
    if (thinkingMode === 'level') {
      if (!thinkingLevel || thinkingBudget !== undefined || Object.keys(input).length !== 4) {
        throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
      }
      return Object.freeze({ kind: 'gemini_generate_content', thinkingMode, thinkingLevel, includeThoughts })
    }
    if (thinkingBudget === undefined || thinkingLevel !== undefined || Object.keys(input).length !== 4) {
      throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    }
    return Object.freeze({ kind: 'gemini_generate_content', thinkingMode, thinkingBudget, includeThoughts })
  }
  throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
}

export function decodeGenerationIntentLayerV2(value: unknown): GenerationIntentLayerV2 {
  const input = closedObject(value, ['schemaVersion', 'generation', 'reasoning', 'web', 'image', 'tools', 'attachments', 'providerExtension'])
  if (input.schemaVersion !== 2) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  const attachments = input.attachments === undefined ? undefined : (() => {
    const values = closedDenseArray(input.attachments).map(decodeAttachment)
    const identities = values.map((item) => item.kind === 'managed_file'
      ? `managed_file\u0000${item.assetId.value}\u0000${item.assetRevisionId.value}`
      : `url_reference\u0000${item.referenceId.value}\u0000${item.referenceRevision.value}`)
    if (new Set(identities).size !== identities.length) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_DUPLICATE_VALUE')
    return Object.freeze(values) as readonly AttachmentIntentV2[]
  })()
  return compact({
    schemaVersion: 2 as const,
    generation: input.generation === undefined ? undefined : decodeSampling(input.generation),
    reasoning: input.reasoning === undefined ? undefined : decodeReasoning(input.reasoning),
    web: input.web === undefined ? undefined : decodeWeb(input.web),
    image: input.image === undefined ? undefined : decodeImage(input.image),
    tools: input.tools === undefined ? undefined : decodeTools(input.tools),
    attachments,
    providerExtension: input.providerExtension === undefined ? undefined : decodeProviderExtension(input.providerExtension),
  })
}

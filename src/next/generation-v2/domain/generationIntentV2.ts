import { GenerationV2Digest, GenerationV2Identity } from './identityV2'

export type SamplingIntentV2 = Readonly<{
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  topK?: number
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
    }>

export type WebSearchIntentV2 =
  | Readonly<{ mode: 'disabled' }>
  | Readonly<{
      mode: 'provider_search'
      types: readonly ('web' | 'image')[]
    }>

export type ImageGenerationIntentV2 =
  | Readonly<{ mode: 'disabled' }>
  | Readonly<{
      mode: 'generate'
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

export type AttachmentIntentV2 = Readonly<{
  assetId: GenerationV2Identity<'asset_id'>
  assetRevisionId: GenerationV2Identity<'asset_revision_id'>
  assetSha256: GenerationV2Digest<'asset_sha256'>
  include: boolean
  sendAs: 'provider_file' | 'inline_text' | 'image_reference' | 'converted_document'
  conversion: 'none' | 'pdf' | 'plain_text' | 'images'
}>

export type ProviderSemanticExtensionV2 = Readonly<{ kind: 'none' }>

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

function decodeSampling(value: unknown): SamplingIntentV2 {
  const keys = ['maxOutputTokens', 'temperature', 'topP', 'topK', 'seed', 'stop', 'candidateCount', 'frequencyPenalty', 'presencePenalty', 'repetitionPenalty'] as const
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
  const repetitionPenalty = optionalFiniteNumber(input, 'repetitionPenalty')
  if (repetitionPenalty !== undefined && repetitionPenalty <= 0) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  return compact({
    maxOutputTokens: optionalPositiveInteger(input, 'maxOutputTokens'),
    temperature,
    topP,
    topK: optionalPositiveInteger(input, 'topK'),
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
  const input = closedObject(value, ['mode', 'effort', 'summary'])
  if (input.mode === 'disabled') {
    if (Object.keys(input).length !== 1) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    return Object.freeze({ mode: 'disabled' })
  }
  if (input.mode !== 'enabled') throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  return compact({
    mode: 'enabled' as const,
    effort: optionalEnum(input, 'effort', ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
    summary: optionalEnum(input, 'summary', ['auto', 'concise', 'detailed']),
  })
}

function decodeWeb(value: unknown): WebSearchIntentV2 {
  const input = closedObject(value, ['mode', 'types'])
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
  return Object.freeze({ mode: 'provider_search', types: Object.freeze(types) })
}

function decodeImage(value: unknown): ImageGenerationIntentV2 {
  const input = closedObject(value, ['mode', 'aspectRatio', 'resolution', 'size', 'quality', 'format', 'background', 'outputCompression', 'stream'])
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
  const input = closedObject(value, ['assetId', 'assetRevisionId', 'assetSha256', 'include', 'sendAs', 'conversion'])
  if (typeof input.assetId !== 'string' || typeof input.assetRevisionId !== 'string' || typeof input.assetSha256 !== 'string' || typeof input.include !== 'boolean') {
    throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  }
  const sendAs = optionalEnum(input, 'sendAs', ['provider_file', 'inline_text', 'image_reference', 'converted_document'])
  const conversion = optionalEnum(input, 'conversion', ['none', 'pdf', 'plain_text', 'images'])
  if (!sendAs || !conversion) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  const attachment = Object.freeze({
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

function decodeProviderExtension(value: unknown): ProviderSemanticExtensionV2 {
  const input = closedObject(value, ['kind'])
  if (input.kind === 'none') {
    if (Object.keys(input).length !== 1) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
    return Object.freeze({ kind: 'none' })
  }
  throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
}

export function decodeGenerationIntentLayerV2(value: unknown): GenerationIntentLayerV2 {
  const input = closedObject(value, ['schemaVersion', 'generation', 'reasoning', 'web', 'image', 'tools', 'attachments', 'providerExtension'])
  if (input.schemaVersion !== 2) throw new GenerationIntentV2Error('GENERATION_V2_INTENT_INVALID_VALUE')
  const attachments = input.attachments === undefined ? undefined : (() => {
    const values = closedDenseArray(input.attachments).map(decodeAttachment)
    const identities = values.map((item) => `${item.assetId.value}\u0000${item.assetRevisionId.value}`)
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

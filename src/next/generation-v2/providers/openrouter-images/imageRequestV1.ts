import { ImmutablePreparedBodyV2 } from '../../compiler/stableSerialize'
import {
  projectOpenRouterImageCandidatesV2,
  projectOpenRouterImageIntentCapabilityV2,
  type OpenRouterImageIntentCapabilityProjectionV2,
} from './imageIntentCapabilityProjectionV2'
import type { CanonicalOpenRouterImageDescriptorV2, CanonicalOpenRouterImageDescriptorSetV2 } from './canonicalDescriptorV2'

const MAX_PROMPT_UTF8_BYTES = 1 * 1024 * 1024
const MAX_INPUT_REFERENCES = 64
const MAX_INPUT_REFERENCE_UTF8_BYTES = 16 * 1024
const MAX_PROVIDER_OPTIONS_UTF8_BYTES = 256 * 1024
const MAX_REQUEST_UTF8_BYTES = 20 * 1024 * 1024

export type OpenRouterImageRequestV1 = Readonly<{
  model: string
  prompt: string
  provider: Readonly<{
    only: readonly [string]
    allow_fallbacks: false
    options?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  }>
  preparedBody: ImmutablePreparedBodyV2
}>

export class OpenRouterImageRequestV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_IMAGE_REQUEST_INVALID_INPUT'
    | 'GENERATION_V2_OPENROUTER_IMAGE_REQUEST_BINDING_INVALID'
    | 'GENERATION_V2_OPENROUTER_IMAGE_REQUEST_DESCRIPTOR_INVALID'
    | 'GENERATION_V2_OPENROUTER_IMAGE_REQUEST_CAPABILITY_MISMATCH'
    | 'GENERATION_V2_OPENROUTER_IMAGE_REQUEST_RESULT_CARDINALITY_UNSUPPORTED'
    | 'GENERATION_V2_OPENROUTER_IMAGE_REQUEST_OPTION_UNSUPPORTED'
    | 'GENERATION_V2_OPENROUTER_IMAGE_REQUEST_REFERENCE_INVALID') {
    super(code)
    this.name = 'OpenRouterImageRequestV1Error'
  }
}

type JsonObject = Readonly<Record<string, unknown>>

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function readPrompt(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || utf8Bytes(value) > MAX_PROMPT_UTF8_BYTES) {
    throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_INVALID_INPUT')
  }
  return value
}

function closedObject(value: unknown, error: OpenRouterImageRequestV1Error['code']): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new OpenRouterImageRequestV1Error(error)
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new OpenRouterImageRequestV1Error(error)
  }
  return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])))
}

function closedDenseArray(value: unknown, maxLength: number, error: OpenRouterImageRequestV1Error['code']): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maxLength) {
    throw new OpenRouterImageRequestV1Error(error)
  }
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new OpenRouterImageRequestV1Error(error)
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new OpenRouterImageRequestV1Error(error)
    }
    return descriptor.value
  }))
}

type OpenRouterImageUrlReferenceV1 = Readonly<{ type: 'image_url'; image_url: Readonly<{ url: string }> }>

function readInputReferences(value: unknown, expectedCount: number): readonly OpenRouterImageUrlReferenceV1[] {
  const items = closedDenseArray(value, MAX_INPUT_REFERENCES, 'GENERATION_V2_OPENROUTER_IMAGE_REQUEST_REFERENCE_INVALID')
  if (items.length !== expectedCount) {
    throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_REFERENCE_INVALID')
  }
  const references = items.map((item) => {
    if (typeof item !== 'string' || item.length === 0 || item.trim() !== item || utf8Bytes(item) > MAX_INPUT_REFERENCE_UTF8_BYTES) {
      throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_REFERENCE_INVALID')
    }
    let parsed: URL
    try { parsed = new URL(item) } catch { throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_REFERENCE_INVALID') }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
      throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_REFERENCE_INVALID')
    }
    return Object.freeze({ type: 'image_url' as const, image_url: Object.freeze({ url: item }) })
  })
  return Object.freeze(references)
}

function readProviderOptions(
  rawOptions: unknown,
  descriptor: CanonicalOpenRouterImageDescriptorV2,
): Readonly<Record<string, unknown>> | undefined {
  if (rawOptions === undefined) return undefined
  const options = closedObject(rawOptions, 'GENERATION_V2_OPENROUTER_IMAGE_REQUEST_OPTION_UNSUPPORTED')
  for (const key of Object.keys(options)) {
    if (!descriptor.allowedPassthroughParameters.includes(key)) {
      throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_OPTION_UNSUPPORTED')
    }
  }
  if (Object.keys(options).length === 0) return undefined
  try {
    if (utf8Bytes(JSON.stringify(options)) > MAX_PROVIDER_OPTIONS_UTF8_BYTES) {
      throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_OPTION_UNSUPPORTED')
    }
    // ImmutablePreparedBodyV2 performs the complete closed JSON-value validation.
    ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(options, MAX_PROVIDER_OPTIONS_UTF8_BYTES)
  } catch (error) {
    if (error instanceof OpenRouterImageRequestV1Error) throw error
    throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_OPTION_UNSUPPORTED')
  }
  return options
}

function requirePinnedDescriptor(input: Readonly<{
  modelId: unknown
  providerTag: unknown
  providerSlug: unknown
  descriptorSet: CanonicalOpenRouterImageDescriptorSetV2
}>): CanonicalOpenRouterImageDescriptorV2 {
  const { descriptorSet } = input
  if (typeof input.modelId !== 'string' || input.modelId !== descriptorSet.modelId.value ||
      typeof input.providerTag !== 'string' || typeof input.providerSlug !== 'string') {
    throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_BINDING_INVALID')
  }
  const descriptor = descriptorSet.descriptors.find((candidate) =>
    candidate.providerTag.value === input.providerTag && candidate.providerSlug.value === input.providerSlug,
  )
  if (!descriptor) throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_DESCRIPTOR_INVALID')
  return descriptor
}

function referenceCount(projection: OpenRouterImageIntentCapabilityProjectionV2): number {
  const field = projection.wireFields.find((item) => item.wireKey === 'input_references')
  if (!field) return 0
  return typeof field.value === 'number' && Number.isSafeInteger(field.value) && field.value >= 0
    ? field.value
    : (() => { throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_CAPABILITY_MISMATCH') })()
}

/**
 * Compiles one already-authorized Images selection. Contract/binding
 * verification belongs to the main-process authority transaction; this pure
 * codec does not decode persistence records or query the contract registry.
 * It only serializes the selected tag as `provider.only`, with router
 * fallbacks explicitly disabled.
 */
export function compileOpenRouterImageRequestV1(input: Readonly<{
  prompt: unknown
  intent: unknown
  modelId: unknown
  providerTag: unknown
  providerSlug: unknown
  descriptorSet: CanonicalOpenRouterImageDescriptorSetV2
  inputReferences?: unknown
  providerOptions?: unknown
}>): OpenRouterImageRequestV1 {
  const prompt = readPrompt(input.prompt)
  const descriptor = requirePinnedDescriptor({
    modelId: input.modelId, providerTag: input.providerTag,
    providerSlug: input.providerSlug, descriptorSet: input.descriptorSet,
  })
  const projection = projectOpenRouterImageIntentCapabilityV2(input.intent)
  const candidates = projectOpenRouterImageCandidatesV2({
    descriptorSet: input.descriptorSet,
    projection,
    boundProviderTag: descriptor.providerTag.value,
  })
  const candidate = candidates.find((item) => item.providerTag === descriptor.providerTag.value &&
    item.providerSlug === descriptor.providerSlug.value &&
    item.descriptorRevision === descriptor.descriptorRevision.value &&
    item.descriptorDigest === descriptor.descriptorDigest.value)
  if (!candidate || !candidate.eligible || projection.issues.length > 0) {
    throw new OpenRouterImageRequestV1Error('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_CAPABILITY_MISMATCH')
  }
  const imageCount = projection.wireFields.find((field) => field.wireKey === 'n')
  if (imageCount && imageCount.value !== 1) {
    throw new OpenRouterImageRequestV1Error(
      'GENERATION_V2_OPENROUTER_IMAGE_REQUEST_RESULT_CARDINALITY_UNSUPPORTED',
    )
  }

  const expectedReferences = referenceCount(projection)
  const inputReferences = readInputReferences(input.inputReferences ?? [], expectedReferences)
  const options = readProviderOptions(input.providerOptions, descriptor)
  const provider = Object.freeze({
    only: Object.freeze([descriptor.providerTag.value] as [string]),
    allow_fallbacks: false as const,
    ...(options ? { options: Object.freeze({ [descriptor.providerSlug.value]: options }) } : {}),
  })
  const native: Record<string, unknown> = {
    model: input.modelId,
    prompt,
    provider,
  }
  for (const field of projection.wireFields) {
    if (field.wireKey === 'input_references') {
      native.input_references = inputReferences
    } else {
      native[field.wireKey] = field.value
    }
  }
  const streamDisposition = projection.dispositions.find((item) => item.semanticPath === 'image.stream')
  if (streamDisposition?.outcome === 'encoded') native.stream = streamDisposition.value
  const preparedBody = ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(native, MAX_REQUEST_UTF8_BYTES)
  return Object.freeze({
    model: input.modelId as string,
    prompt,
    provider,
    preparedBody,
  })
}

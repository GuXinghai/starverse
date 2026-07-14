import { sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import { GenerationV2Digest, GenerationV2Identity } from '../../domain/identityV2'

export type CanonicalOpenRouterImageParameterRuleV2 =
  | Readonly<{ kind: 'enum'; values: readonly (string | number)[] }>
  | Readonly<{ kind: 'range'; min: number; max: number }>
  | Readonly<{ kind: 'presence' }>

export type CanonicalOpenRouterImageParameterV2 = Readonly<{
  name: string
  rule: CanonicalOpenRouterImageParameterRuleV2
}>

export type CanonicalOpenRouterImageDescriptorV2 = Readonly<{
  providerName: string
  providerTag: GenerationV2Identity<'provider_tag'>
  providerSlug: GenerationV2Identity<'provider_slug'>
  supportsStreaming: boolean
  parameters: readonly CanonicalOpenRouterImageParameterV2[]
  allowedPassthroughParameters: readonly string[]
  descriptorRevision: GenerationV2Identity<'descriptor_revision'>
  descriptorDigest: GenerationV2Digest<'descriptor_digest'>
}>

export type CanonicalOpenRouterImageDescriptorSetV2 = Readonly<{
  modelId: GenerationV2Identity<'model_id'>
  descriptors: readonly CanonicalOpenRouterImageDescriptorV2[]
  endpointSetRevision: GenerationV2Identity<'endpoint_set_revision'>
}>

export class CanonicalOpenRouterImageDescriptorV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE'
    | 'GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE'
    | 'GENERATION_V2_OPENROUTER_DESCRIPTOR_DUPLICATE_TAG'
    | 'GENERATION_V2_OPENROUTER_DESCRIPTOR_DUPLICATE_PARAMETER') {
    super(code)
    this.name = 'CanonicalOpenRouterImageDescriptorV2Error'
  }
}

type InputObject = { readonly [key: string]: unknown }

function objectProjection(value: unknown): InputObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}

function assertAllowedKeys(input: InputObject, allowed: readonly string[]): void {
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
  }
}

function denseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
  }
  const keys = Reflect.ownKeys(value)
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
  }
  return expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
    }
    return descriptor.value
  })
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
  }
  return value
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

function enumValueKey(value: string | number): string {
  return typeof value === 'string' ? `s:${value}` : `n:${Object.is(value, -0) ? '0' : String(value)}`
}

function decodeRule(value: unknown): CanonicalOpenRouterImageParameterRuleV2 {
  const input = objectProjection(value)
  if (input.type === 'enum') {
    if (Object.keys(input).some((key) => key !== 'type' && key !== 'values')) {
      throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
    }
    const values = denseArray(input.values).map((item) => {
      if (typeof item === 'string') return stringValue(item)
      if (typeof item === 'number' && Number.isFinite(item)) return Object.is(item, -0) ? 0 : item
      throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
    })
    if (values.length === 0 || new Set(values.map(enumValueKey)).size !== values.length) {
      throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
    }
    values.sort((left, right) => compareCodePoints(enumValueKey(left), enumValueKey(right)))
    return Object.freeze({ kind: 'enum', values: Object.freeze(values) })
  }
  if (input.type === 'range') {
    if (Object.keys(input).some((key) => !['type', 'min', 'max'].includes(key)) ||
        typeof input.min !== 'number' || !Number.isFinite(input.min) ||
        typeof input.max !== 'number' || !Number.isFinite(input.max) || input.max < input.min) {
      throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
    }
    return Object.freeze({ kind: 'range', min: Object.is(input.min, -0) ? 0 : input.min, max: Object.is(input.max, -0) ? 0 : input.max })
  }
  if (input.type === 'boolean') {
    if (Object.keys(input).some((key) => key !== 'type')) {
      throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
    }
    return Object.freeze({ kind: 'presence' })
  }
  throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
}

function digestProjection(projection: unknown): string {
  const serialized = stableSerializeProviderRequestV2(projection)
  return sha256PreparedBytesV2(new TextEncoder().encode(serialized))
}

function decodeDescriptor(value: unknown): CanonicalOpenRouterImageDescriptorV2 {
  const input = objectProjection(value)
  assertAllowedKeys(input, [
    'provider_name', 'provider_tag', 'provider_slug', 'supported_parameters',
    'allowed_passthrough_parameters', 'supports_streaming', 'pricing',
  ])
  const supported = objectProjection(input.supported_parameters)
  const parameters = Object.keys(supported).map((name) => Object.freeze({
    name: stringValue(name),
    rule: decodeRule(supported[name]),
  }))
  if (new Set(parameters.map((item) => item.name)).size !== parameters.length) {
    throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_DUPLICATE_PARAMETER')
  }
  parameters.sort((left, right) => compareCodePoints(left.name, right.name))
  const allowed = denseArray(input.allowed_passthrough_parameters).map(stringValue)
  if (new Set(allowed).size !== allowed.length) {
    throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
  }
  allowed.sort(compareCodePoints)
  if (typeof input.supports_streaming !== 'boolean') {
    throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
  }
  const projection = Object.freeze({
    providerName: stringValue(input.provider_name),
    providerTag: stringValue(input.provider_tag),
    providerSlug: stringValue(input.provider_slug),
    supportsStreaming: input.supports_streaming,
    parameters: Object.freeze(parameters),
    allowedPassthroughParameters: Object.freeze(allowed),
  })
  const digest = digestProjection(projection)
  return Object.freeze({
    providerName: projection.providerName,
    providerTag: GenerationV2Identity.create('provider_tag', projection.providerTag),
    providerSlug: GenerationV2Identity.create('provider_slug', projection.providerSlug),
    supportsStreaming: projection.supportsStreaming,
    parameters: projection.parameters,
    allowedPassthroughParameters: projection.allowedPassthroughParameters,
    descriptorRevision: GenerationV2Identity.create('descriptor_revision', `openrouter-images-descriptor-v1:${digest}`),
    descriptorDigest: GenerationV2Digest.create('descriptor_digest', digest),
  })
}

export function decodeCanonicalOpenRouterImageDescriptorSetV2(value: unknown): CanonicalOpenRouterImageDescriptorSetV2 {
  const input = objectProjection(value)
  assertAllowedKeys(input, ['id', 'endpoints'])
  const descriptors = denseArray(input.endpoints).map(decodeDescriptor)
  if (descriptors.length === 0) throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
  const tags = descriptors.map((descriptor) => descriptor.providerTag.value)
  if (new Set(tags).size !== tags.length) {
    throw new CanonicalOpenRouterImageDescriptorV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_DUPLICATE_TAG')
  }
  descriptors.sort((left, right) => compareCodePoints(left.providerTag.value, right.providerTag.value))
  const modelId = stringValue(input.id)
  const revisionDigest = digestProjection({
    modelId,
    descriptors: descriptors.map((descriptor) => ({
      providerTag: descriptor.providerTag.value,
      descriptorDigest: descriptor.descriptorDigest.value,
    })),
  })
  return Object.freeze({
    modelId: GenerationV2Identity.create('model_id', modelId),
    descriptors: Object.freeze(descriptors),
    endpointSetRevision: GenerationV2Identity.create('endpoint_set_revision', `openrouter-images-set-v1:${revisionDigest}`),
  })
}

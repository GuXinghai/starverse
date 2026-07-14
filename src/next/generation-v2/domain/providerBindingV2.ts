import { GenerationV2Digest, GenerationV2Identity } from './identityV2'

export type GenerationOperationV2 = 'text' | 'image_generate' | 'image_edit' | 'tool_continue'

export type PinnedEndpointSelectorV2 = Readonly<{
  kind: 'openrouter_images_v1'
  providerTag: GenerationV2Identity<'provider_tag'>
  providerSlug: GenerationV2Identity<'provider_slug'>
  descriptorRevision: GenerationV2Identity<'descriptor_revision'>
  descriptorDigest: GenerationV2Digest<'descriptor_digest'>
  selectedBy: 'user' | 'sole_eligible'
  selectedAt: string
}>

export type EndpointBindingV2 =
  | Readonly<{ kind: 'pinned'; selector: PinnedEndpointSelectorV2 }>
  | Readonly<{
      kind: 'provider_managed_set'
      endpointSetRevision: GenerationV2Identity<'endpoint_set_revision'>
      descriptors: readonly Readonly<{
        endpointId: GenerationV2Identity<'endpoint_id'>
        descriptorRevision: GenerationV2Identity<'descriptor_revision'>
      }>[]
    }>

export type DecodedProviderBindingRecordV2 = Readonly<{
  trust: 'decoded_unverified'
  credentialScopeId: GenerationV2Identity<'credential_scope_id'>
  providerId: GenerationV2Identity<'provider_id'>
  endpointProfileId: GenerationV2Identity<'endpoint_profile_id'>
  endpointBinding: EndpointBindingV2
  protocolContractId: GenerationV2Identity<'protocol_contract_id'>
  contractRevision: GenerationV2Identity<'contract_revision'>
  contractDefinitionDigest: GenerationV2Digest<'contract_digest'>
  registryRevision: GenerationV2Identity<'registry_revision'>
  modelId: GenerationV2Identity<'model_id'>
  operation: GenerationOperationV2
}>

export class ProviderBindingV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_BINDING_INVALID_SHAPE'
    | 'GENERATION_V2_BINDING_UNKNOWN_FIELD'
    | 'GENERATION_V2_BINDING_INVALID_VALUE'
    | 'GENERATION_V2_BINDING_DUPLICATE_DESCRIPTOR') {
    super(code)
    this.name = 'ProviderBindingV2Error'
  }
}

type ClosedInput = { readonly [key: string]: unknown }

function closedObject(value: unknown, allowed: readonly string[]): ClosedInput {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_SHAPE')
  }
  if (Object.keys(descriptors).some((key) => !allowed.includes(key))) {
    throw new ProviderBindingV2Error('GENERATION_V2_BINDING_UNKNOWN_FIELD')
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}

function closedDenseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_SHAPE')
  }
  const keys = Reflect.ownKeys(value)
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_SHAPE')
    }
    return descriptor.value
  }))
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

function requiredString(input: ClosedInput, key: string): string {
  const value = input[key]
  if (typeof value !== 'string') throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_VALUE')
  return value
}

function decodePinnedSelector(value: unknown): PinnedEndpointSelectorV2 {
  const discriminator = closedObject(value, ['kind', 'providerTag', 'providerSlug', 'descriptorRevision', 'descriptorDigest', 'selectedBy', 'selectedAt', 'contractId', 'selectorId'])
  if (discriminator.kind === 'openrouter_images_v1') {
    const input = closedObject(value, ['kind', 'providerTag', 'providerSlug', 'descriptorRevision', 'descriptorDigest', 'selectedBy', 'selectedAt'])
    if (input.selectedBy !== 'user' && input.selectedBy !== 'sole_eligible') {
      throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_VALUE')
    }
    const selectedAt = requiredString(input, 'selectedAt')
    const selectedAtMs = Date.parse(selectedAt)
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(selectedAt) ||
        !Number.isFinite(selectedAtMs) || new Date(selectedAtMs).toISOString() !== selectedAt) {
      throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_VALUE')
    }
    return Object.freeze({
      kind: 'openrouter_images_v1',
      providerTag: GenerationV2Identity.create('provider_tag', requiredString(input, 'providerTag')),
      providerSlug: GenerationV2Identity.create('provider_slug', requiredString(input, 'providerSlug')),
      descriptorRevision: GenerationV2Identity.create('descriptor_revision', requiredString(input, 'descriptorRevision')),
      descriptorDigest: GenerationV2Digest.create('descriptor_digest', requiredString(input, 'descriptorDigest')),
      selectedBy: input.selectedBy,
      selectedAt,
    })
  }
  throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_VALUE')
}

function decodeEndpointBinding(value: unknown): EndpointBindingV2 {
  const discriminator = closedObject(value, ['kind', 'selector', 'endpointSetRevision', 'descriptors'])
  if (discriminator.kind === 'pinned') {
    const input = closedObject(value, ['kind', 'selector'])
    return Object.freeze({ kind: 'pinned', selector: decodePinnedSelector(input.selector) })
  }
  if (discriminator.kind === 'provider_managed_set') {
    const input = closedObject(value, ['kind', 'endpointSetRevision', 'descriptors'])
    const descriptors = closedDenseArray(input.descriptors).map((item) => {
      const descriptor = closedObject(item, ['endpointId', 'descriptorRevision'])
      return Object.freeze({
        endpointId: GenerationV2Identity.create('endpoint_id', requiredString(descriptor, 'endpointId')),
        descriptorRevision: GenerationV2Identity.create('descriptor_revision', requiredString(descriptor, 'descriptorRevision')),
      })
    })
    if (descriptors.length === 0) throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_VALUE')
    if (new Set(descriptors.map((item) => item.endpointId.value)).size !== descriptors.length) {
      throw new ProviderBindingV2Error('GENERATION_V2_BINDING_DUPLICATE_DESCRIPTOR')
    }
    descriptors.sort((left, right) => compareCodePoints(left.endpointId.value, right.endpointId.value))
    return Object.freeze({
      kind: 'provider_managed_set',
      endpointSetRevision: GenerationV2Identity.create('endpoint_set_revision', requiredString(input, 'endpointSetRevision')),
      descriptors: Object.freeze(descriptors),
    })
  }
  throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_VALUE')
}

export function decodeProviderBindingRecordV2(value: unknown): DecodedProviderBindingRecordV2 {
  const input = closedObject(value, [
    'credentialScopeId', 'providerId', 'endpointProfileId', 'endpointBinding',
    'protocolContractId', 'contractRevision', 'contractDefinitionDigest', 'registryRevision', 'modelId', 'operation',
  ])
  if (!['text', 'image_generate', 'image_edit', 'tool_continue'].includes(input.operation as string)) {
    throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_VALUE')
  }
  const providerId = requiredString(input, 'providerId')
  const protocolContractId = requiredString(input, 'protocolContractId')
  const contractDefinitionDigest = requiredString(input, 'contractDefinitionDigest')
  const contractRevision = requiredString(input, 'contractRevision')
  const registryRevision = requiredString(input, 'registryRevision')
  if (!/^[0-9a-f]{64}$/u.test(contractDefinitionDigest) ||
      contractRevision !== `${protocolContractId}:${contractDefinitionDigest}` ||
      !/^provider-contract-registry-v1:[0-9a-f]{64}$/u.test(registryRevision)) {
    throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_VALUE')
  }
  const endpointBinding = decodeEndpointBinding(input.endpointBinding)
  const isOpenRouterImageSurface = endpointBinding.kind === 'pinned' || protocolContractId === 'openrouter-images-v1' ||
    (providerId === 'openrouter' && input.operation === 'image_generate')
  if (isOpenRouterImageSurface &&
      (endpointBinding.kind !== 'pinned' || providerId !== 'openrouter' ||
       protocolContractId !== 'openrouter-images-v1' || input.operation !== 'image_generate')) {
    throw new ProviderBindingV2Error('GENERATION_V2_BINDING_INVALID_VALUE')
  }
  return Object.freeze({
    trust: 'decoded_unverified',
    credentialScopeId: GenerationV2Identity.create('credential_scope_id', requiredString(input, 'credentialScopeId')),
    providerId: GenerationV2Identity.create('provider_id', providerId),
    endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', requiredString(input, 'endpointProfileId')),
    endpointBinding,
    protocolContractId: GenerationV2Identity.create('protocol_contract_id', protocolContractId),
    contractRevision: GenerationV2Identity.create('contract_revision', contractRevision),
    contractDefinitionDigest: GenerationV2Digest.create('contract_digest', contractDefinitionDigest),
    registryRevision: GenerationV2Identity.create('registry_revision', registryRevision),
    modelId: GenerationV2Identity.create('model_id', requiredString(input, 'modelId')),
    operation: input.operation as GenerationOperationV2,
  })
}

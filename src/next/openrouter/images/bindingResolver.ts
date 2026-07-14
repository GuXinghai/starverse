import {
  descriptorSupportsIntent,
  type OpenRouterImageDescriptorSet,
  type OpenRouterImageEndpointDescriptor,
  type OpenRouterImageIntent,
} from './endpointContract'

export type OpenRouterImageEndpointBinding = Readonly<{
  credentialScope: string
  modelId: string
  operation: 'image-generation'
  providerTag: string
  providerSlug: string
  descriptorRevision: string
  selectedBy: 'user' | 'sole_eligible'
  providerOptions: Readonly<Record<string, unknown>>
}>

export type OpenRouterImageBindingErrorCode =
  | 'OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED'
  | 'OPENROUTER_IMAGE_INTENT_UNSUPPORTED'
  | 'OPENROUTER_IMAGE_ENDPOINT_STALE'
  | 'BOUND_ENDPOINT_CAPABILITY_MISMATCH'
  | 'STALE_CAPABILITY_REVISION'

export class OpenRouterImageBindingError extends Error {
  constructor(readonly code: OpenRouterImageBindingErrorCode) {
    super(code)
    this.name = 'OpenRouterImageBindingError'
  }
}

export type OpenRouterImageBindingResolution = Readonly<{
  binding: OpenRouterImageEndpointBinding
  descriptor: OpenRouterImageEndpointDescriptor
  shouldPersist: boolean
}>

export function sanitizeProviderOptions(
  descriptor: OpenRouterImageEndpointDescriptor,
  options: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(options).filter(([key]) => descriptor.allowedPassthroughParameters.includes(key)),
  ))
}

export function resolveOpenRouterImageBinding(input: Readonly<{
  descriptorSet: OpenRouterImageDescriptorSet
  binding: OpenRouterImageEndpointBinding | null
  intent: OpenRouterImageIntent
  nowMs: number
  expectedDescriptorRevision?: string
}>): OpenRouterImageBindingResolution {
  const { descriptorSet, intent } = input
  if (input.nowMs >= descriptorSet.hardExpiresAtMs) throw new OpenRouterImageBindingError('OPENROUTER_IMAGE_ENDPOINT_STALE')
  if (input.expectedDescriptorRevision && input.expectedDescriptorRevision !== descriptorSet.revision) {
    throw new OpenRouterImageBindingError('STALE_CAPABILITY_REVISION')
  }

  if (input.binding) {
    const binding = input.binding
    const descriptor = descriptorSet.descriptors.find((candidate) => candidate.providerTag === binding.providerTag)
    if (!descriptor || descriptor.providerSlug !== binding.providerSlug) {
      throw new OpenRouterImageBindingError('OPENROUTER_IMAGE_ENDPOINT_STALE')
    }
    if (!descriptorSupportsIntent(descriptor, intent)) {
      throw new OpenRouterImageBindingError('BOUND_ENDPOINT_CAPABILITY_MISMATCH')
    }
    const providerOptions = sanitizeProviderOptions(
      descriptor,
      intent.providerOptions ?? binding.providerOptions,
    )
    return {
      descriptor,
      binding: {
        ...binding,
        descriptorRevision: descriptorSet.revision,
        providerOptions,
      },
      shouldPersist: binding.descriptorRevision !== descriptorSet.revision
        || JSON.stringify(providerOptions) !== JSON.stringify(binding.providerOptions),
    }
  }

  const eligible = descriptorSet.descriptors.filter((descriptor) => descriptorSupportsIntent(descriptor, intent))
  if (eligible.length === 0) throw new OpenRouterImageBindingError('OPENROUTER_IMAGE_INTENT_UNSUPPORTED')
  if (eligible.length > 1) throw new OpenRouterImageBindingError('OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED')
  const descriptor = eligible[0]
  return {
    descriptor,
    binding: {
      credentialScope: descriptorSet.credentialScope,
      modelId: descriptorSet.modelId,
      operation: 'image-generation',
      providerTag: descriptor.providerTag,
      providerSlug: descriptor.providerSlug,
      descriptorRevision: descriptorSet.revision,
      selectedBy: 'sole_eligible',
      providerOptions: sanitizeProviderOptions(descriptor, intent.providerOptions ?? {}),
    },
    shouldPersist: true,
  }
}

export function createUserOpenRouterImageBinding(input: Readonly<{
  descriptorSet: OpenRouterImageDescriptorSet
  providerTag: string
  intent: OpenRouterImageIntent
}>): OpenRouterImageEndpointBinding {
  const descriptor = input.descriptorSet.descriptors.find((candidate) => candidate.providerTag === input.providerTag)
  if (!descriptor) throw new OpenRouterImageBindingError('OPENROUTER_IMAGE_ENDPOINT_STALE')
  if (!descriptorSupportsIntent(descriptor, input.intent)) {
    throw new OpenRouterImageBindingError('BOUND_ENDPOINT_CAPABILITY_MISMATCH')
  }
  return {
    credentialScope: input.descriptorSet.credentialScope,
    modelId: input.descriptorSet.modelId,
    operation: 'image-generation',
    providerTag: descriptor.providerTag,
    providerSlug: descriptor.providerSlug,
    descriptorRevision: input.descriptorSet.revision,
    selectedBy: 'user',
    providerOptions: sanitizeProviderOptions(descriptor, input.intent.providerOptions ?? {}),
  }
}

export function reconcileProviderOptionsForBindingChange(input: Readonly<{
  descriptor: OpenRouterImageEndpointDescriptor
  previousOptions: Readonly<Record<string, unknown>>
}>): Readonly<{ options: Readonly<Record<string, unknown>>; removedKeys: readonly string[] }> {
  const options = sanitizeProviderOptions(input.descriptor, input.previousOptions)
  return {
    options,
    removedKeys: Object.keys(input.previousOptions).filter((key) => !(key in options)),
  }
}

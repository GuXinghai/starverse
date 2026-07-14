import { describe, expect, it } from 'vitest'
import {
  decodeOpenRouterImageEndpointResponse,
  projectOpenRouterImageCandidates,
  type OpenRouterImageDescriptorSet,
  type OpenRouterImageIntent,
} from './endpointContract'
import {
  createUserOpenRouterImageBinding,
  OpenRouterImageBindingError,
  reconcileProviderOptionsForBindingChange,
  resolveOpenRouterImageBinding,
} from './bindingResolver'
import { compileOpenRouterImagesRequest } from './requestCompiler'

const rawDescriptors = [
  {
    provider_name: 'Google Vertex',
    provider_slug: 'google-vertex/global',
    provider_tag: 'google-vertex/global',
    supported_parameters: {
      resolution: { type: 'enum', values: ['512', '1K'] },
      aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] },
      n: { type: 'range', min: 1, max: 1 },
    },
    allowed_passthrough_parameters: ['cachedContent'],
    supports_streaming: false,
  },
  {
    provider_name: 'Google AI Studio',
    provider_slug: 'google-ai-studio',
    provider_tag: 'google-ai-studio',
    supported_parameters: {
      resolution: { type: 'enum', values: ['512', '1K'] },
      aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] },
      n: { type: 'range', min: 1, max: 1 },
    },
    allowed_passthrough_parameters: ['cachedContent'],
    supports_streaming: false,
  },
]

function fixture(): { descriptorSet: OpenRouterImageDescriptorSet; intent: OpenRouterImageIntent } {
  return {
    descriptorSet: {
      credentialScope: 'scope-1',
      modelId: 'google/gemini-3.1-flash-image',
      revision: 'sha256:descriptor',
      fetchedAtMs: 100,
      hardExpiresAtMs: 1_000,
      descriptors: decodeOpenRouterImageEndpointResponse({ id: 'model', endpoints: rawDescriptors }),
    },
    intent: {
      parameters: { resolution: '512', aspect_ratio: '1:1', n: 1 },
      stream: false,
      providerOptions: { cachedContent: 'cache-1' },
    },
  }
}

describe('OpenRouter Images endpoint selection', () => {
  it('invalidates a complete response containing duplicate provider tags', () => {
    expect(() => decodeOpenRouterImageEndpointResponse({ endpoints: [rawDescriptors[0], rawDescriptors[0]] }))
      .toThrow('duplicate provider_tag')
  })

  it('rejects incomplete descriptors rather than treating missing streaming evidence as false', () => {
    const incomplete = { ...rawDescriptors[0] } as Record<string, unknown>
    delete incomplete.supports_streaming
    expect(() => decodeOpenRouterImageEndpointResponse({ endpoints: [incomplete] }))
      .toThrow('descriptor.supports_streaming must be boolean')
  })

  it('requires user selection when multiple endpoints support the complete intent', () => {
    const { descriptorSet, intent } = fixture()
    expect(() => resolveOpenRouterImageBinding({ descriptorSet, intent, binding: null, nowMs: 500 }))
      .toThrowError(expect.objectContaining<Partial<OpenRouterImageBindingError>>({
        code: 'OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED',
      }))
  })

  it('auto-binds only when exactly one complete descriptor is eligible', () => {
    const { descriptorSet, intent } = fixture()
    const result = resolveOpenRouterImageBinding({
      descriptorSet: { ...descriptorSet, descriptors: descriptorSet.descriptors.slice(0, 1) },
      intent,
      binding: null,
      nowMs: 500,
    })
    expect(result.binding).toMatchObject({ providerTag: 'google-vertex/global', selectedBy: 'sole_eligible' })
    expect(result.shouldPersist).toBe(true)
  })

  it('blocks unsupported intent instead of presenting an empty selection dialog', () => {
    const { descriptorSet, intent } = fixture()
    expect(() => resolveOpenRouterImageBinding({
      descriptorSet,
      intent: { ...intent, parameters: { ...intent.parameters, resolution: '8K' } },
      binding: null,
      nowMs: 500,
    })).toThrowError(expect.objectContaining<Partial<OpenRouterImageBindingError>>({
      code: 'OPENROUTER_IMAGE_INTENT_UNSUPPORTED',
    }))
  })

  it('reports option cleanup before a binding change but rejects silent drop at preflight', () => {
    const { descriptorSet, intent } = fixture()
    const changed = {
      ...descriptorSet,
      descriptors: descriptorSet.descriptors.map((descriptor) => descriptor.providerTag === 'google-vertex/global'
        ? { ...descriptor, allowedPassthroughParameters: [] }
        : descriptor),
    }
    const target = changed.descriptors.find((descriptor) => descriptor.providerTag === 'google-vertex/global')!
    expect(reconcileProviderOptionsForBindingChange({ descriptor: target, previousOptions: intent.providerOptions! }))
      .toEqual({ options: {}, removedKeys: ['cachedContent'] })
    expect(() => createUserOpenRouterImageBinding({
      descriptorSet: changed,
      intent,
      providerTag: 'google-vertex/global',
    })).toThrowError(expect.objectContaining<Partial<OpenRouterImageBindingError>>({
      code: 'BOUND_ENDPOINT_CAPABILITY_MISMATCH',
    }))
  })

  it('rejects a command compiled against an older descriptor revision', () => {
    const { descriptorSet, intent } = fixture()
    expect(() => resolveOpenRouterImageBinding({
      descriptorSet,
      intent,
      binding: null,
      nowMs: 500,
      expectedDescriptorRevision: 'older',
    })).toThrowError(expect.objectContaining<Partial<OpenRouterImageBindingError>>({
      code: 'STALE_CAPABILITY_REVISION',
    }))
  })

  it('never switches a bound endpoint when another endpoint could support changed parameters', () => {
    const { descriptorSet, intent } = fixture()
    const binding = createUserOpenRouterImageBinding({ descriptorSet, intent, providerTag: 'google-ai-studio' })
    const changedSet = {
      ...descriptorSet,
      descriptors: descriptorSet.descriptors.map((descriptor) => descriptor.providerTag === 'google-ai-studio'
        ? { ...descriptor, supportedParameters: { ...descriptor.supportedParameters, resolution: { type: 'enum' as const, values: ['512'] } } }
        : descriptor),
    }
    expect(() => resolveOpenRouterImageBinding({
      descriptorSet: changedSet,
      binding,
      intent: { ...intent, parameters: { ...intent.parameters, resolution: '1K' } },
      nowMs: 500,
    })).toThrowError(expect.objectContaining<Partial<OpenRouterImageBindingError>>({
      code: 'BOUND_ENDPOINT_CAPABILITY_MISMATCH',
    }))
  })

  it('stale-rejects hard-expired descriptor sets', () => {
    const { descriptorSet, intent } = fixture()
    expect(() => resolveOpenRouterImageBinding({ descriptorSet, intent, binding: null, nowMs: 1_000 }))
      .toThrowError(expect.objectContaining<Partial<OpenRouterImageBindingError>>({ code: 'OPENROUTER_IMAGE_ENDPOINT_STALE' }))
  })

  it('sorts bound candidate first and the rest by code point without choosing a default', () => {
    const { descriptorSet } = fixture()
    const projected = projectOpenRouterImageCandidates(descriptorSet.descriptors, 'google-vertex/global')
    expect(projected.map((item) => item.providerTag)).toEqual(['google-vertex/global', 'google-ai-studio'])
  })

  it('serializes the verified exact provider pin and providerSlug options namespace', () => {
    const { descriptorSet, intent } = fixture()
    const binding = createUserOpenRouterImageBinding({ descriptorSet, intent, providerTag: 'google-ai-studio' })
    expect(compileOpenRouterImagesRequest({
      modelId: descriptorSet.modelId,
      prompt: 'A red apple.',
      parameters: intent.parameters,
      stream: intent.stream,
      binding,
    })).toEqual({
      model: 'google/gemini-3.1-flash-image',
      prompt: 'A red apple.',
      resolution: '512',
      aspect_ratio: '1:1',
      n: 1,
      provider: {
        only: ['google-ai-studio'],
        allow_fallbacks: false,
        options: { 'google-ai-studio': { cachedContent: 'cache-1' } },
      },
    })
  })

  it('rejects unknown and legacy routing fields instead of forwarding an unknown patch', () => {
    const { descriptorSet, intent } = fixture()
    const binding = createUserOpenRouterImageBinding({ descriptorSet, intent, providerTag: 'google-ai-studio' })
    expect(() => compileOpenRouterImagesRequest({
      modelId: descriptorSet.modelId,
      prompt: 'A red apple.',
      parameters: { provider_tag: 'google-ai-studio' } as any,
      stream: false,
      binding,
    })).toThrow('unsupported OpenRouter Images parameter: provider_tag')
  })
})

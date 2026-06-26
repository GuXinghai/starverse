import { describe, expect, it } from 'vitest'
import {
  PROVIDER_MODEL_AVAILABILITY_ENVELOPE_PARSER_VERSION,
  createProviderModelAvailabilityEnvelope,
  createProviderModelAvailabilityProvenance,
  type ProviderModelAvailabilityEnvelope,
} from './modelAvailabilityEnvelope'

const OBSERVED_AT_MS = Date.UTC(2026, 5, 25, 0, 0, 0)

describe('ProviderModelAvailability common envelope', () => {
  it('keeps unknown models minimal without default advanced capability claims', () => {
    const envelope = createProviderModelAvailabilityEnvelope({
      providerKey: 'future_provider',
      endpointId: 'future-official',
      profileId: 'future_profile_v1',
      nativeModelId: 'future-model',
      source: 'future_models_api',
      confidence: 'provider_reported',
      observedAtMs: OBSERVED_AT_MS,
      warnings: [],
    })

    expect(envelope.capabilitySeed).toBeUndefined()
    expect(envelope).toMatchObject({
      providerKey: 'future_provider',
      endpointId: 'future-official',
      profileId: 'future_profile_v1',
      nativeModelId: 'future-model',
      confidence: 'provider_reported',
      observedAtMs: OBSERVED_AT_MS,
      warnings: [],
    })
  })

  it('preserves stable source confidence warnings and provenance', () => {
    const provenance = createProviderModelAvailabilityProvenance({
      sourceKind: 'provider_api',
      sourceLabel: 'anthropic_models_api',
      observedAtMs: OBSERVED_AT_MS,
      metadataVersion: '2026-06-25',
    })

    expect(provenance).toEqual({
      sourceKind: 'provider_api',
      sourceLabel: 'anthropic_models_api',
      observedAtMs: OBSERVED_AT_MS,
      metadataVersion: '2026-06-25',
      parserVersion: PROVIDER_MODEL_AVAILABILITY_ENVELOPE_PARSER_VERSION,
    })

    const envelope = createProviderModelAvailabilityEnvelope({
      providerKey: 'anthropic_messages',
      endpointId: 'anthropic-official',
      profileId: 'anthropic_messages_v1',
      nativeModelId: 'claude-sonnet-4-5',
      source: 'anthropic_models_api',
      confidence: 'provider_reported',
      observedAtMs: OBSERVED_AT_MS,
      warnings: ['provider fields parsed conservatively'],
      provenance,
    })

    expect(envelope.provenance).toEqual(provenance)
    expect(envelope.source).toBe('anthropic_models_api')
    expect(envelope.warnings).toEqual(['provider fields parsed conservatively'])
  })

  it('allows providerSpecific to carry provider differences without changing common fields', () => {
    type AnthropicSpecific = Readonly<{
      modelType: 'model'
      createdAt: string
      pagination: { hasMore: boolean; lastId: string }
      capabilitiesRawKeys: string[]
    }>

    const envelope: ProviderModelAvailabilityEnvelope<
      'anthropic_messages',
      'anthropic-official',
      'anthropic_messages_v1',
      AnthropicSpecific
    > = createProviderModelAvailabilityEnvelope({
      providerKey: 'anthropic_messages',
      endpointId: 'anthropic-official',
      profileId: 'anthropic_messages_v1',
      nativeModelId: 'claude-opus-4-1',
      source: 'anthropic_models_api',
      confidence: 'provider_reported',
      observedAtMs: OBSERVED_AT_MS,
      warnings: [],
      capabilitySeed: {
        textChat: true,
        imageInput: 'unknown',
        thinking: 'unknown',
      },
      providerSpecific: {
        modelType: 'model',
        createdAt: '2026-01-15T00:00:00Z',
        pagination: { hasMore: true, lastId: 'claude-opus-4-1' },
        capabilitiesRawKeys: ['thinking', 'tool_use'],
      },
    })

    expect(envelope.providerSpecific).toEqual({
      modelType: 'model',
      createdAt: '2026-01-15T00:00:00Z',
      pagination: { hasMore: true, lastId: 'claude-opus-4-1' },
      capabilitiesRawKeys: ['thinking', 'tool_use'],
    })
    expect(envelope.capabilitySeed).toEqual({
      textChat: true,
      imageInput: 'unknown',
      thinking: 'unknown',
    })
  })

  it('does not interpret provider-specific capability dialects in the common helper', () => {
    const envelope = createProviderModelAvailabilityEnvelope({
      providerKey: 'deepseek',
      endpointId: 'deepseek-official',
      profileId: 'deepseek_official_openai_compat',
      nativeModelId: 'deepseek-v4-flash',
      source: 'deepseek_pricing_metadata',
      confidence: 'curated',
      observedAtMs: OBSERVED_AT_MS,
      warnings: [],
      providerSpecific: {
        thinkingMode: 'thinking_only',
        jsonOutput: true,
        fim: true,
      },
    })

    expect(envelope.capabilitySeed).toBeUndefined()
    expect(envelope.providerSpecific).toEqual({
      thinkingMode: 'thinking_only',
      jsonOutput: true,
      fim: true,
    })
  })
})

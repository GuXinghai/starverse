import { describe, expect, it } from 'vitest'
import {
  missingProviderBooleanFactV2,
  providerBooleanFactV2,
  type CatalogProviderModelObservationV2,
} from '../../shared/modelCatalog/providerModelObservationV2'
import { resolveModelCapabilityV2 } from './modelCapabilityResolverV2'

function observation(capabilities: Record<string, boolean>): CatalogProviderModelObservationV2 {
  const missing = (key: string) => missingProviderBooleanFactV2(`capabilities.${key}`)
  return {
    schemaVersion: 2,
    providerKey: 'deepseek',
    endpointId: 'deepseek-official',
    nativeModelId: 'provider-model',
    observedAtMs: 1,
    rawProviderRecord: { id: 'provider-model', capabilities },
    facts: {
      textChat: providerBooleanFactV2({ owner: capabilities, key: 'text_chat', providerPath: 'capabilities.text_chat' }),
      reasoning: providerBooleanFactV2({ owner: capabilities, key: 'reasoning', providerPath: 'capabilities.reasoning' }),
      tools: missing('tools'),
      structuredOutputs: missing('structured_outputs'),
      vision: providerBooleanFactV2({ owner: capabilities, key: 'vision', providerPath: 'capabilities.vision' }),
    },
    provenance: { sourceKind: 'provider_api', sourceLabel: 'test', observedAtMs: 1, parserVersion: 2 },
  }
}

describe('model capability resolver V2', () => {
  it('keeps an explicit provider false authoritative over reviewed supplements', () => {
    expect(resolveModelCapabilityV2(observation({ text_chat: false }), 'textChat')).toMatchObject({
      modelSupport: 'unsupported',
      enabled: false,
      resolutionSource: 'provider_reported',
    })
  })

  it('uses reviewed contract supplements only when the provider fact is missing', () => {
    expect(resolveModelCapabilityV2(observation({}), 'textChat')).toMatchObject({
      modelSupport: 'supported',
      enabled: true,
      resolutionSource: 'reviewed_contract_supplement',
      executionAuthority: 'none',
    })
  })

  it('does not enable provider-reported support when the wire is not implemented', () => {
    expect(resolveModelCapabilityV2(observation({ vision: true }), 'vision')).toMatchObject({
      modelSupport: 'supported',
      enabled: false,
      wireImplementation: 'not_implemented',
      resolutionSource: 'provider_reported',
    })
  })
})

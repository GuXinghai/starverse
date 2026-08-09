import type {
  CatalogProviderModelObservationV2,
  ProviderModelCapabilityKeyV2,
  ResolvedModelCapabilityV2,
} from '../../shared/modelCatalog/providerModelObservationV2'
import { ProviderCatalogAuthorityRegistryV2 } from './providerCatalogAuthorityRegistryV2'
import type { ReviewedProviderSpecificCapabilityV2 } from './providerCatalogAuthorityRegistryV2'

export type ResolvedModelCapabilitiesV2 = Readonly<
  Record<ProviderModelCapabilityKeyV2, ResolvedModelCapabilityV2> & {
    providerSpecific: ReviewedProviderSpecificCapabilityV2
  }
>

export function resolveModelCapabilityV2(
  observation: CatalogProviderModelObservationV2,
  capability: ProviderModelCapabilityKeyV2,
): ResolvedModelCapabilityV2 {
  const providerReported = observation.facts[capability]
  const authority = ProviderCatalogAuthorityRegistryV2.get(observation.providerKey)
  const wireImplemented = authority?.wireImplementation[capability] === true
  const providerValue = providerReported.presence === 'present' ? providerReported.value : undefined
  const contractValue = authority?.missingFactSupplements[capability]
  const supplement = providerReported.presence === 'missing' ? contractValue : undefined
  const modelSupport = providerValue === true || supplement === true
    ? 'supported'
    : providerValue === false || supplement === false
      ? 'unsupported'
      : 'unknown'
  const reviewedContract = authority && providerValue === undefined && supplement !== undefined
    ? {
        protocolContractId: authority.reviewedContract.protocolContractId.value,
        contractRevision: authority.reviewedContract.contractRevision.value,
        registryRevision: authority.reviewedContract.registryRevision.value,
      }
    : undefined
  return Object.freeze({
    capability,
    providerReported,
    modelSupport,
    enabled: modelSupport === 'supported' && wireImplemented,
    resolutionSource: providerValue !== undefined
      ? 'provider_reported'
      : supplement !== undefined
        ? 'reviewed_contract_supplement'
        : 'none',
    wireImplementation: wireImplemented ? 'implemented' : 'not_implemented',
    executionAuthority: 'none' as const,
    reported: providerReported.presence === 'present'
      ? Object.freeze({ state: providerValue === true ? 'supported' : 'unsupported',
          source: 'provider_catalog' as const, rawPath: providerReported.providerPath })
      : providerReported.presence === 'invalid'
        ? Object.freeze({ state: 'unknown' as const, source: 'provider_catalog' as const,
            rawPath: providerReported.providerPath })
        : null,
    contract: contractValue === undefined ? null : Object.freeze({
      state: contractValue ? 'supported' as const : 'unsupported' as const,
      source: 'verified_contract' as const,
      rawPath: null,
    }),
    effective: Object.freeze({
      state: modelSupport,
      source: providerReported.presence === 'present' || providerReported.presence === 'invalid'
        ? 'provider_catalog' as const
        : supplement !== undefined ? 'verified_contract' as const : 'none' as const,
    }),
    wireSupport: wireImplemented ? 'implemented' as const : 'unsupported' as const,
    conflict: providerReported.presence === 'present' && contractValue !== undefined && providerValue !== contractValue,
    ...(reviewedContract ? { reviewedContract } : {}),
  })
}

export function resolveModelCapabilitiesV2(
  observation: CatalogProviderModelObservationV2,
): ResolvedModelCapabilitiesV2 {
  const authority = ProviderCatalogAuthorityRegistryV2.get(observation.providerKey)
  return Object.freeze({
    textChat: resolveModelCapabilityV2(observation, 'textChat'),
    reasoning: resolveModelCapabilityV2(observation, 'reasoning'),
    tools: resolveModelCapabilityV2(observation, 'tools'),
    structuredOutputs: resolveModelCapabilityV2(observation, 'structuredOutputs'),
    vision: resolveModelCapabilityV2(observation, 'vision'),
    providerSpecific: authority?.resolveProviderSpecificCapability(observation.nativeModelId) ?? null,
  })
}

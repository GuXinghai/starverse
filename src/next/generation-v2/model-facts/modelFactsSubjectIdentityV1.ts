import type { CanonicalModelSubjectV1 } from './canonicalSourceFactsV1'
import { providerAuthorityForCompatibleProviderInstanceV1, providerAuthorityForExecutionBindingV1 } from './providerAuthorityRegistryV1'
import { ProviderCatalogAuthorityRegistryV2 } from '../../modelCatalog/providerCatalogAuthorityRegistryV2'
import { catalogProviderKeyForRuntimeProvider } from '../../../shared/provider/catalogRuntimeProviderAuthority'
import type { RuntimeProviderId } from '../../../shared/provider/runtimeProviderId'

function nativeModelId(value: string): string | null {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

/**
 * Resolve a picker catalog identity through the explicit catalog and authority
 * registries. This is intentionally not a model lookup or a fuzzy join.
 */
export function modelFactsSubjectForCatalogModelV1(
  providerId: RuntimeProviderId,
  modelId: string,
): CanonicalModelSubjectV1 | null {
  const nativeId = nativeModelId(modelId)
  const providerKey = catalogProviderKeyForRuntimeProvider(providerId)
  if (!nativeId || providerKey === null) return null
  const catalogBinding = ProviderCatalogAuthorityRegistryV2.get(providerKey)
  if (!catalogBinding) return null
  const authority = providerAuthorityForExecutionBindingV1({
    implementationProviderId: catalogBinding.executionProviderId,
    endpointProfileKind: catalogBinding.endpointProfileId,
  })
  return Object.freeze({
    providerAuthorityId: authority.providerAuthorityId,
    endpointProfileId: catalogBinding.endpointProfileId,
    nativeModelId: nativeId,
  })
}

export function modelFactsSubjectForCompatibleModelV1(
  providerInstanceId: string,
  modelId: string,
): CanonicalModelSubjectV1 | null {
  const nativeId = nativeModelId(modelId)
  const instanceId = String(providerInstanceId ?? '').trim()
  if (!nativeId || !instanceId) return null
  const authority = providerAuthorityForCompatibleProviderInstanceV1(instanceId)
  return Object.freeze({
    providerAuthorityId: authority.providerAuthorityId,
    endpointProfileId: authority.endpointProfileId,
    nativeModelId: nativeId,
  })
}

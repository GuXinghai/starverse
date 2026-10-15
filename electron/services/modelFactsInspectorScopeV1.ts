import type BetterSqlite3 from 'better-sqlite3'
import type { AuthoritativeModelSubjectRecordV1 } from '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import {
  providerAuthorityForCompatibleProviderInstanceV1,
  providerAuthorityForLocalProfileV1,
  providerAuthorityForNativeSurfaceV1,
} from '../../src/core/generation-v2/model-facts/providerAuthorityRegistryV1'
import { ProviderCatalogAuthorityRegistryV2 } from '../../src/core/model-catalog/providerCatalogAuthorityRegistryV2'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import type { ResolvedModelFactsSourceScopeSelectionV1 } from '../../infra/db/repo/resolvedModelFactsV1Repo'
import { buildServerModelFactsSourceScopeSelectionV1 } from './goal3ModelFactsCapabilityV1'

function invalid(): never { throw new Error('GENERATION_V2_MODEL_FACTS_INSPECTOR_AUTHORITY_INVALID') }

/** The subject-set service supplies persisted proofs; renderer scope or prior resolved rows are never inputs. */
export function buildInspectorSourceScopeSelectionV1(
  db: BetterSqlite3.Database,
  record: AuthoritativeModelSubjectRecordV1,
): ResolvedModelFactsSourceScopeSelectionV1 {
  const subject = record.subject
  const selections = record.proofs.map((proof): ResolvedModelFactsSourceScopeSelectionV1 => {
    if (proof.kind === 'compatible_model_binding') {
      const authority = providerAuthorityForCompatibleProviderInstanceV1(proof.providerInstanceId)
      if (authority.providerAuthorityId !== subject.providerAuthorityId ||
          authority.endpointProfileId !== subject.endpointProfileId) invalid()
      return buildServerModelFactsSourceScopeSelectionV1({ providerAuthorityId: authority.providerAuthorityId,
        providerNativeSurfaceId: null, endpointProfileId: authority.endpointProfileId, compatible: true })
    }
    if (proof.kind === 'local_profile_binding') {
      const profile = new LocalEndpointProfileV2Repo(db).get(proof.endpointProfileId)
      const authority = providerAuthorityForLocalProfileV1(proof.providerId)
      if (profile.profileRevision !== proof.profileRevision || profile.providerId !== proof.providerId ||
          profile.protocolContractId !== proof.protocolContractId || profile.endpointProfileId !== subject.endpointProfileId ||
          authority.providerAuthorityId !== subject.providerAuthorityId) invalid()
      return buildServerModelFactsSourceScopeSelectionV1({ providerAuthorityId: authority.providerAuthorityId,
        providerNativeSurfaceId: authority.providerNativeSurfaceIds[0] ?? null,
        endpointProfileId: profile.endpointProfileId, credentialScopeId: profile.credentialScopeId,
        credentialRevision: profile.revisionGeneration })
    }
    const authority = providerAuthorityForNativeSurfaceV1(proof.operationContractId)
    const catalogs = ProviderCatalogAuthorityRegistryV2.list().filter((catalog) =>
      catalog.providerKey === proof.providerKey && catalog.modelsContractId === proof.operationContractId &&
      catalog.endpointProfileId === proof.endpointProfileId)
    if (catalogs.length !== 1 || authority.providerAuthorityId !== subject.providerAuthorityId ||
        proof.endpointProfileId !== subject.endpointProfileId || !authority.executionBindings.some((binding) =>
          binding.implementationProviderId === catalogs[0]!.executionProviderId &&
          binding.endpointProfileKind === proof.endpointProfileId)) invalid()
    return buildServerModelFactsSourceScopeSelectionV1({ providerAuthorityId: authority.providerAuthorityId,
      providerNativeSurfaceId: proof.operationContractId, endpointProfileId: proof.endpointProfileId,
      credentialScopeId: proof.credentialScopeId, credentialRevision: proof.credentialRevision,
      ...(proof.catalogCategory === '' ? {} : { catalogCategory: proof.catalogCategory }) })
  })
  const first = selections[0]
  if (!first || selections.some((selection) => selection.providerNative !== first.providerNative ||
      selection.modelsDev !== first.modelsDev || selection.capabilityRules !== first.capabilityRules)) invalid()
  return first
}

import type BetterSqlite3 from 'better-sqlite3'
import {
  buildCapabilityRuleSourceScopeIdV1,
  buildModelsDevSourceScopeIdV1,
  buildProviderNativeSourceScopeIdV1,
} from '../../src/next/generation-v2/model-facts/sourceScopeV1'
import {
  canonicalSourceFactDigestV1,
  type CanonicalModelSubjectV1,
} from '../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import {
  modelsDevProviderKeyForAuthorityV1,
  providerAuthorityForCompatibleProviderInstanceV1,
  providerAuthorityForExecutionBindingV1,
  providerAuthorityForLocalProfileV1,
} from '../../src/next/generation-v2/model-facts/providerAuthorityRegistryV1'
import type { DecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import type { ResolvedModelFactsSnapshotBindingV1 } from '../../src/next/generation-v2/model-facts/resolvedModelFactsV1'
import { projectResolvedModelFactsToRuntimeV2 } from '../../src/next/generation-v2/capability/resolvedModelFactsRuntimeProjectionV1'
import { ResolvedModelFactsV1Service } from '../../infra/db/services/resolvedModelFactsV1Service'
import type { ResolvedModelFactsSourceScopeSelectionV1 } from '../../infra/db/repo/resolvedModelFactsV1Repo'

const MODELS_DEV_DISTRIBUTION_ID = 'models.dev-official-api'
const MODELS_DEV_DISTRIBUTION_CHANNEL = 'https://models.dev/api.json'
const RULE_STORE_ID = 'epoch-2-capability-rules'

function unconfiguredScope(kind: string, authorityId: string, endpointProfileId: string): string {
  return `canonical-source-scope-v1:${canonicalSourceFactDigestV1({ kind, authorityId, endpointProfileId })}`
}

function authorityForBinding(binding: DecodedProviderBindingRecordV2): Readonly<{
  providerAuthorityId: string
  providerNativeSurfaceId: string | null
}> {
  const providerId = binding.providerId.value
  if (providerId === 'openai_compatible') {
    const authority = providerAuthorityForCompatibleProviderInstanceV1(binding.endpointProfileId.value)
    return { providerAuthorityId: authority.providerAuthorityId, providerNativeSurfaceId: null }
  }
  if (providerId === 'lmstudio' || providerId === 'ollama' || providerId === 'generic_local') {
    const authority = providerAuthorityForLocalProfileV1(providerId)
    return { providerAuthorityId: authority.providerAuthorityId, providerNativeSurfaceId: authority.providerNativeSurfaceIds[0] ?? null }
  }
  const authority = providerAuthorityForExecutionBindingV1({ implementationProviderId: providerId,
    endpointProfileKind: binding.endpointProfileId.value })
  return { providerAuthorityId: authority.providerAuthorityId, providerNativeSurfaceId: authority.providerNativeSurfaceIds[0] ?? null }
}

export function buildGoal3ModelFactsSubjectV1(binding: DecodedProviderBindingRecordV2): CanonicalModelSubjectV1 {
  const authority = authorityForBinding(binding)
  return Object.freeze({ providerAuthorityId: authority.providerAuthorityId,
    endpointProfileId: binding.endpointProfileId.value, nativeModelId: binding.modelId.value })
}

export function buildGoal3SourceScopeSelectionV1(input: Readonly<{
  binding: DecodedProviderBindingRecordV2
  credentialRevision: number
}>): ResolvedModelFactsSourceScopeSelectionV1 {
  if (!Number.isSafeInteger(input.credentialRevision) || input.credentialRevision < 0) {
    throw new Error('GENERATION_V2_RESOLVED_MODEL_FACTS_SCOPE_INVALID')
  }
  const authority = authorityForBinding(input.binding)
  const native = authority.providerNativeSurfaceId === null
    ? unconfiguredScope('provider_native', authority.providerAuthorityId, input.binding.endpointProfileId.value)
    : buildProviderNativeSourceScopeIdV1({ providerAuthorityId: authority.providerAuthorityId,
      providerNativeSurfaceId: authority.providerNativeSurfaceId, endpointProfileId: input.binding.endpointProfileId.value,
      credentialScopeId: input.binding.credentialScopeId.value, credentialRevision: input.credentialRevision })
  const modelsDevKey = input.binding.providerId.value === 'openai_compatible'
    ? null : modelsDevProviderKeyForAuthorityV1(authority.providerAuthorityId)
  const modelsDev = modelsDevKey === null
    ? unconfiguredScope('models_dev', authority.providerAuthorityId, input.binding.endpointProfileId.value)
    : buildModelsDevSourceScopeIdV1({ distributionId: MODELS_DEV_DISTRIBUTION_ID,
      distributionChannel: MODELS_DEV_DISTRIBUTION_CHANNEL })
  return Object.freeze({ providerNative: native, modelsDev,
    capabilityRules: buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: RULE_STORE_ID }) })
}

export function resolveGoal3ModelFactsForBindingV1(input: Readonly<{
  db: BetterSqlite3.Database
  binding: DecodedProviderBindingRecordV2
  credentialRevision: number
  inActiveTransaction?: boolean
}>): Readonly<{
  subject: CanonicalModelSubjectV1
  sourceScopeSelection: ResolvedModelFactsSourceScopeSelectionV1
  snapshot: ResolvedModelFactsSnapshotBindingV1
  modelFacts: ReturnType<typeof projectResolvedModelFactsToRuntimeV2>
}> {
  const subject = buildGoal3ModelFactsSubjectV1(input.binding)
  const sourceScopeSelection = buildGoal3SourceScopeSelectionV1(input)
  const service = new ResolvedModelFactsV1Service(input.db)
  const current = input.inActiveTransaction || input.db.inTransaction
    ? service.resolveAndPublishInActiveTransaction({ subject, sourceScopeSelection })
    : service.resolveAndPublish({ subject, sourceScopeSelection })
  const resolvedFacts = current.snapshot.resolvedFacts
  const snapshot = Object.freeze({ resolvedSnapshotRevision: current.snapshot.resolvedSnapshotRevision,
    sourceScopeSelection: current.snapshot.sourceScopeSelection,
    sourcePriorityConfigRevision: resolvedFacts.input.sourcePriorityConfigRevision,
    resolverRevision: resolvedFacts.input.resolverRevision,
    ontologyRevision: resolvedFacts.input.ontologyRevision,
    capabilityRevision: resolvedFacts.capabilityRevision })
  return Object.freeze({ subject, sourceScopeSelection, snapshot,
    modelFacts: projectResolvedModelFactsToRuntimeV2({ resolvedFacts, binding: input.binding }) })
}

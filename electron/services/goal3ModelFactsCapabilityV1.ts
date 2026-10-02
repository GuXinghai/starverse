import type BetterSqlite3 from 'better-sqlite3'
import {
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
import { CAPABILITY_RULE_SOURCE_SCOPE_ID_V1 } from '../../src/next/generation-v2/model-facts/semanticInvalidationV1'

const MODELS_DEV_DISTRIBUTION_ID = 'models.dev-official-api'
const MODELS_DEV_DISTRIBUTION_CHANNEL = 'https://models.dev/api.json'

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
  return buildServerModelFactsSourceScopeSelectionV1({ ...authority,
    endpointProfileId: input.binding.endpointProfileId.value,
    credentialScopeId: input.binding.credentialScopeId.value, credentialRevision: input.credentialRevision,
    compatible: input.binding.providerId.value === 'openai_compatible' })
}

/** Shared server-authority projection; callers establish an exact binding or persisted subject proof. */
export function buildServerModelFactsSourceScopeSelectionV1(input: Readonly<{
  providerAuthorityId: string
  providerNativeSurfaceId: string | null
  endpointProfileId: string
  credentialScopeId?: string
  credentialRevision?: number
  catalogCategory?: string
  compatible?: boolean
}>): ResolvedModelFactsSourceScopeSelectionV1 {
  if (input.providerNativeSurfaceId !== null &&
      (!Number.isSafeInteger(input.credentialRevision) || input.credentialRevision! < 0 ||
       typeof input.credentialScopeId !== 'string')) {
    throw new Error('GENERATION_V2_RESOLVED_MODEL_FACTS_SCOPE_INVALID')
  }
  const native = input.providerNativeSurfaceId === null
    ? unconfiguredScope('provider_native', input.providerAuthorityId, input.endpointProfileId)
    : buildProviderNativeSourceScopeIdV1({ providerAuthorityId: input.providerAuthorityId,
      providerNativeSurfaceId: input.providerNativeSurfaceId, endpointProfileId: input.endpointProfileId,
      credentialScopeId: input.credentialScopeId!, credentialRevision: input.credentialRevision!,
      ...(input.catalogCategory ? { catalogCategory: input.catalogCategory } : {}) })
  const modelsDevKey = input.compatible ? null : modelsDevProviderKeyForAuthorityV1(input.providerAuthorityId)
  const modelsDev = modelsDevKey === null
    ? unconfiguredScope('models_dev', input.providerAuthorityId, input.endpointProfileId)
    : buildModelsDevSourceScopeIdV1({ distributionId: MODELS_DEV_DISTRIBUTION_ID,
      distributionChannel: MODELS_DEV_DISTRIBUTION_CHANNEL })
  return Object.freeze({ providerNative: native, modelsDev,
    capabilityRules: CAPABILITY_RULE_SOURCE_SCOPE_ID_V1 })
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

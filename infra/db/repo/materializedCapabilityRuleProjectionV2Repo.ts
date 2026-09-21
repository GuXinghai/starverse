import type BetterSqlite3 from 'better-sqlite3'
import {
  projectMaterializedCapabilityRuleProjectionV2,
  type CapabilityRuleProjectionV2,
} from '../../../src/next/generation-v2/capability-rules/materializedCapabilityRuleProjectionV2'
import {
  providerAuthorityForCompatibleProviderInstanceV1,
  providerAuthorityForExecutionBindingV1,
  providerAuthorityForLocalProfileV1,
} from
  '../../../src/next/generation-v2/model-facts/providerAuthorityRegistryV1'
import { buildCapabilityRuleSourceScopeIdV1 } from
  '../../../src/next/generation-v2/model-facts/sourceScopeV1'
import { CanonicalModelFactSourceV1Repo } from './canonicalModelFactSourceV1Repo'

export class MaterializedCapabilityRuleProjectionV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_RULE_SOURCE_UNAVAILABLE'
    | 'GENERATION_V2_CAPABILITY_RULE_SUBJECT_STALE'
    | 'GENERATION_V2_CAPABILITY_RULE_IDENTITY_UNMAPPED') {
    super(code)
    this.name = 'MaterializedCapabilityRuleProjectionV2RepoError'
  }
}

function boundedIdentity(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 1024 ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new MaterializedCapabilityRuleProjectionV2RepoError(
      'GENERATION_V2_CAPABILITY_RULE_IDENTITY_UNMAPPED')
  }
  return value
}

/**
 * Temporary pre-Goal3 consumer projection. Its only authority is the active, complete,
 * exact-subject Capability Rules canonical source; it never evaluates selectors or regex.
 */
export class MaterializedCapabilityRuleProjectionV2Repo {
  readonly #sourceRepo: CanonicalModelFactSourceV1Repo
  readonly #sourceScopeId: string

  constructor(
    db: BetterSqlite3.Database,
    ruleStoreId = 'epoch-2-capability-rules',
  ) {
    this.#sourceRepo = new CanonicalModelFactSourceV1Repo(db)
    this.#sourceScopeId = buildCapabilityRuleSourceScopeIdV1({ ruleStoreId })
  }

  resolveForIdentity(input: Readonly<{
    providerId: string
    endpointProfileId: string
    nativeModelId: string
  }>): CapabilityRuleProjectionV2 {
    const identity = Object.freeze({
      providerId: boundedIdentity(input.providerId),
      endpointProfileId: boundedIdentity(input.endpointProfileId),
      nativeModelId: boundedIdentity(input.nativeModelId),
    })
    let authority: ReturnType<typeof providerAuthorityForExecutionBindingV1>
    try {
      authority = providerAuthorityForExecutionBindingV1({
        implementationProviderId: identity.providerId,
        endpointProfileKind: identity.endpointProfileId,
      })
    } catch {
      throw new MaterializedCapabilityRuleProjectionV2RepoError(
        'GENERATION_V2_CAPABILITY_RULE_IDENTITY_UNMAPPED')
    }
    return this.resolveForAuthoritySubject({
      identity,
      providerAuthorityId: authority.providerAuthorityId,
    })
  }

  resolveForCompatibleIdentity(input: Readonly<{
    providerInstanceId: string
    nativeModelId: string
  }>): CapabilityRuleProjectionV2 {
    const providerInstanceId = boundedIdentity(input.providerInstanceId)
    let authority: ReturnType<typeof providerAuthorityForCompatibleProviderInstanceV1>
    try {
      authority = providerAuthorityForCompatibleProviderInstanceV1(providerInstanceId)
    } catch {
      throw new MaterializedCapabilityRuleProjectionV2RepoError(
        'GENERATION_V2_CAPABILITY_RULE_IDENTITY_UNMAPPED')
    }
    return this.resolveForAuthoritySubject({
      identity: Object.freeze({
        providerId: 'openai_compatible',
        endpointProfileId: authority.endpointProfileId,
        nativeModelId: boundedIdentity(input.nativeModelId),
      }),
      providerAuthorityId: authority.providerAuthorityId,
    })
  }

  resolveForLocalIdentity(input: Readonly<{
    providerId: 'lmstudio' | 'ollama' | 'generic_local'
    endpointProfileId: string
    nativeModelId: string
  }>): CapabilityRuleProjectionV2 {
    let authority: ReturnType<typeof providerAuthorityForLocalProfileV1>
    try {
      authority = providerAuthorityForLocalProfileV1(input.providerId)
    } catch {
      throw new MaterializedCapabilityRuleProjectionV2RepoError(
        'GENERATION_V2_CAPABILITY_RULE_IDENTITY_UNMAPPED')
    }
    return this.resolveForAuthoritySubject({
      identity: Object.freeze({
        providerId: input.providerId,
        endpointProfileId: boundedIdentity(input.endpointProfileId),
        nativeModelId: boundedIdentity(input.nativeModelId),
      }),
      providerAuthorityId: authority.providerAuthorityId,
    })
  }

  resolveForAuthoritySubject(input: Readonly<{
    identity: Readonly<{
      providerId: string
      endpointProfileId: string
      nativeModelId: string
    }>
    providerAuthorityId: string
  }>): CapabilityRuleProjectionV2 {
    const identity = Object.freeze({
      providerId: boundedIdentity(input.identity.providerId),
      endpointProfileId: boundedIdentity(input.identity.endpointProfileId),
      nativeModelId: boundedIdentity(input.identity.nativeModelId),
    })
    const providerAuthorityId = boundedIdentity(input.providerAuthorityId)
    const state = this.#sourceRepo.readSourceState('capability_rule', this.#sourceScopeId)
    if (!state?.currentSourceRevision) {
      throw new MaterializedCapabilityRuleProjectionV2RepoError(
        'GENERATION_V2_CAPABILITY_RULE_SOURCE_UNAVAILABLE')
    }
    const source = this.#sourceRepo.readSourceRevision(state.currentSourceRevision)
    if (!source || source.sourceRevision.sourceKind !== 'capability_rule' ||
        source.sourceRevision.sourceScopeId !== this.#sourceScopeId ||
        source.subjectIndexMode !== 'complete') {
      throw new MaterializedCapabilityRuleProjectionV2RepoError(
        'GENERATION_V2_CAPABILITY_RULE_SOURCE_UNAVAILABLE')
    }
    const fact = this.#sourceRepo.readSubjectFact({
      canonicalSourceRevision: state.currentSourceRevision,
      subject: {
        providerAuthorityId,
        endpointProfileId: identity.endpointProfileId,
        nativeModelId: identity.nativeModelId,
      },
    })
    if (!fact || fact.ref.sourceRevision.canonicalSourceRevision !== state.currentSourceRevision ||
        fact.payload.sourceRevision.canonicalSourceRevision !== state.currentSourceRevision) {
      throw new MaterializedCapabilityRuleProjectionV2RepoError(
        'GENERATION_V2_CAPABILITY_RULE_SUBJECT_STALE')
    }
    return projectMaterializedCapabilityRuleProjectionV2({
      payload: fact.payload,
      ref: fact.ref,
      identity,
    })
  }
}

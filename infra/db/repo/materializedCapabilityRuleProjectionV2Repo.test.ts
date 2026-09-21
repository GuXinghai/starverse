import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { buildAuthoritativeModelSubjectSetV1 } from
  '../../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { prepareCapabilityRuleMaterializationV1 } from
  '../../../src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import { buildCapabilityRuleSourceScopeIdV1 } from
  '../../../src/next/generation-v2/model-facts/sourceScopeV1'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { seedMaterializedCapabilityRulesForTestV1 } from
  '../test-support/materializedCapabilityRuleTestSupport'
import { CapabilityRuleCoreV1Repo } from './capabilityRuleCoreV1Repo'
import { CapabilityRuleMaterializationV1Repo } from './capabilityRuleMaterializationV1Repo'
import { CanonicalModelFactSourceV1Repo } from './canonicalModelFactSourceV1Repo'
import {
  MaterializedCapabilityRuleProjectionV2Repo,
  MaterializedCapabilityRuleProjectionV2RepoError,
} from './materializedCapabilityRuleProjectionV2Repo'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function subjectSet(modelIds: readonly string[]) {
  return buildAuthoritativeModelSubjectSetV1(modelIds.map((nativeModelId) => ({
    subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId },
    proof: { kind: 'provider_native_catalog' as const, providerKey: 'openai_responses', scopeId: 'scope:test',
      credentialScopeId: 'credential-scope-v2:test', credentialRevision: 1,
      endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', catalogCategory: '',
      activeSnapshotDigest: 'a'.repeat(64) },
  })))
}

function activate(db: BetterSqlite3.Database, withRule: boolean): void {
  const core = new CapabilityRuleCoreV1Repo(db)
  if (withRule) core.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: {
    schemaVersion: 1, ownership: 'user', ownerId: 'user:default', packs: [{ schemaVersion: 1,
      packId: 'pack.reasoning', displayName: 'Reasoning', description: null, priority: 0,
      mode: 'no_control', target: 'enabled', rules: [{ ruleId: 'rule.reasoning', label: null,
        description: null, priority: 0, configured: 'on', providerAuthorityId: 'openai',
        endpointProfileId: 'openai-api-v1', selector: { kind: 'exact', nativeModelIds: ['gpt-5'] },
        assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
        evidence: null }] }] },
  })
  const sourceScopeId = buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: 'epoch-2-capability-rules' })
  const prepared = prepareCapabilityRuleMaterializationV1({ sourceScopeId,
    subjectSet: subjectSet(['gpt-5', 'gpt-5-mini']),
    ownershipSnapshots: core.listOwnershipSnapshots().map((entry) => entry.projected),
    defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' } })
  const staged = new CapabilityRuleMaterializationV1Repo(db).stagePrepared({ prepared,
    expectedMaterializationRevision: null,
    currentAuthoritativeSubjectSetRevision: prepared.authoritativeSubjectSetRevision })
  new CanonicalModelFactSourceV1Repo(db).promoteStagedCompleteSourceRevision({
    sourceKind: 'capability_rule', sourceScopeId,
    canonicalSourceRevision: staged.stage.canonicalSourceRevision,
    expectedCurrentRevision: null, fetchedAtMs: 1 })
}

describe('MaterializedCapabilityRuleProjectionV2Repo', () => {
  it('reads exact active subject claims without evaluating selectors at request time', () => {
    const db = database()
    try {
      activate(db, true)
      const repo = new MaterializedCapabilityRuleProjectionV2Repo(db)
      const projection = repo.resolveForIdentity({ providerId: 'openai_responses',
        endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-5' })
      expect(projection.identity).toEqual({ providerId: 'openai_responses',
        endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-5' })
      expect(projection.claims).toHaveLength(1)
      expect(projection.evidence[0]?.verifiedAt).toBeNull()

      expect(repo.resolveForIdentity({ providerId: 'openai_responses',
        endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-5-mini' }).claims).toEqual([])
    } finally { db.close() }
  })

  it('fails closed when source authority or exact subject is absent', () => {
    const db = database()
    try {
      const repo = new MaterializedCapabilityRuleProjectionV2Repo(db)
      expect(() => repo.resolveForIdentity({ providerId: 'openai_responses',
        endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-5' }))
        .toThrowError(expect.objectContaining<Partial<MaterializedCapabilityRuleProjectionV2RepoError>>({
          code: 'GENERATION_V2_CAPABILITY_RULE_SOURCE_UNAVAILABLE',
        }))
      activate(db, false)
      expect(() => repo.resolveForIdentity({ providerId: 'openai_responses',
        endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-unknown' }))
        .toThrowError(expect.objectContaining<Partial<MaterializedCapabilityRuleProjectionV2RepoError>>({
          code: 'GENERATION_V2_CAPABILITY_RULE_SUBJECT_STALE',
        }))
    } finally { db.close() }
  })

  it('resolves scoped compatible and local authority subjects without string guessing', () => {
    const cases = [
      {
        subject: { providerAuthorityId: 'openai-compatible-provider-instance-v1:ocp_provider_12345678',
          endpointProfileId: 'ocp_provider_12345678', nativeModelId: 'custom-model' },
        proof: { kind: 'compatible_model_binding' as const, providerInstanceId: 'ocp_provider_12345678',
          endpointRevisionId: 'endpoint-revision-1', endpointDigest: 'b'.repeat(64), source: 'manual' as const },
        providerId: 'openai_compatible' as const,
      },
      {
        subject: { providerAuthorityId: 'lmstudio-local', endpointProfileId: 'local-profile-1',
          nativeModelId: 'local-model' },
        proof: { kind: 'local_profile_binding' as const, endpointProfileId: 'local-profile-1',
          providerId: 'lmstudio' as const, protocolContractId: 'lmstudio-openresponses',
          profileRevision: 'profile-revision-1' },
        providerId: 'lmstudio' as const,
      },
    ]
    for (const testCase of cases) {
      const db = database()
      try {
        seedMaterializedCapabilityRulesForTestV1(db, {
          subjectCandidates: [{ subject: testCase.subject, proof: testCase.proof }],
          ownershipSnapshots: [{ schemaVersion: 1, ownership: 'user', ownerId: 'user:default',
            packs: [{ schemaVersion: 1, packId: 'pack.reasoning', displayName: 'Reasoning',
              description: null, priority: 0, mode: 'no_control', target: 'enabled', rules: [{
                ruleId: 'rule.reasoning', label: null, description: null, priority: 0, configured: 'on',
                providerAuthorityId: testCase.subject.providerAuthorityId,
                endpointProfileId: testCase.subject.endpointProfileId,
                selector: { kind: 'exact', nativeModelIds: [testCase.subject.nativeModelId] },
                assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
                evidence: null,
              }] }] }],
        })
        const repo = new MaterializedCapabilityRuleProjectionV2Repo(db)
        const projection = testCase.providerId === 'openai_compatible'
          ? repo.resolveForCompatibleIdentity({ providerInstanceId: testCase.subject.endpointProfileId,
            nativeModelId: testCase.subject.nativeModelId })
          : repo.resolveForLocalIdentity({ providerId: testCase.providerId,
            endpointProfileId: testCase.subject.endpointProfileId,
            nativeModelId: testCase.subject.nativeModelId })
        expect(projection.claims).toHaveLength(1)
        expect(projection.identity).toEqual({ providerId: testCase.providerId,
          endpointProfileId: testCase.subject.endpointProfileId,
          nativeModelId: testCase.subject.nativeModelId })
      } finally { db.close() }
    }
  })
})

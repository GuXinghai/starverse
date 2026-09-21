import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { buildAuthoritativeModelSubjectSetV1 } from
  '../../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { buildCapabilityRuleSourceScopeIdV1 } from
  '../../../src/next/generation-v2/model-facts/sourceScopeV1'
import { CapabilityRuleCoreV1Repo } from '../repo/capabilityRuleCoreV1Repo'
import { CapabilityRuleMaterializationV1Repo,
  CapabilityRuleMaterializationV1RepoError } from '../repo/capabilityRuleMaterializationV1Repo'
import { CanonicalModelFactSourceV1Repo } from '../repo/canonicalModelFactSourceV1Repo'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { CapabilityRuleMaterializationV1Service } from './capabilityRuleMaterializationV1Service'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function snapshot(value: 'supported' | 'unsupported' = 'supported') {
  return { schemaVersion: 1, ownership: 'cloud', ownerId: 'official', packs: [{ schemaVersion: 1,
    packId: 'pack.openai', displayName: 'OpenAI', description: null, priority: 0,
    mode: 'no_control', target: 'enabled', rules: [{ ruleId: 'rule.reasoning', label: null,
      description: null, priority: 0, configured: 'on', providerAuthorityId: 'openai',
      endpointProfileId: 'openai-api-v1', selector: { kind: 'exact', nativeModelIds: ['gpt-5'] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value } }, evidence: null }] }] }
}

function subjects() {
  return buildAuthoritativeModelSubjectSetV1([{ subject: { providerAuthorityId: 'openai',
    endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-5' }, proof: {
    kind: 'provider_native_catalog' as const, providerKey: 'openai_responses', scopeId: 'scope:a',
    credentialScopeId: 'credential-scope-v2:test', credentialRevision: 1,
    endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', catalogCategory: '',
    activeSnapshotDigest: 'a'.repeat(64),
  } }])
}

describe('CapabilityRuleMaterializationV1Service', () => {
  it('prepares outside the write transaction and stages a complete source without activating it', async () => {
    const db = database()
    try {
      let now = 100
      const core = new CapabilityRuleCoreV1Repo(db, () => now)
      core.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: snapshot() })
      const currentSubjects = subjects()
      const service = new CapabilityRuleMaterializationV1Service(db,
        { readCurrent: async () => currentSubjects }, () => ++now)
      const prepared = await service.prepareCurrent({ ruleStoreId: 'epoch-2-capability-rules',
        defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' } })
      expect(prepared).not.toBeNull()
      const result = await service.stagePrepared({ prepared, expectedMaterializationRevision: null })

      expect(result.stage.materializationRevision).toBe(prepared.materializationRevision)
      expect(result.source.source.subjectIndexMode).toBe('complete')
      expect(result.source.subjectFacts).toHaveLength(1)
      const scope = buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: 'epoch-2-capability-rules' })
      const sourceRepo = new CanonicalModelFactSourceV1Repo(db)
      expect(sourceRepo.readSourceState('capability_rule', scope)).toBeNull()
      expect(new CapabilityRuleMaterializationV1Repo(db).readStage(scope)?.canonicalSourceRevision)
        .toBe(prepared.publication.sourceRevision.canonicalSourceRevision)
      sourceRepo.pruneRetainedData(Number.MAX_SAFE_INTEGER)
      expect(sourceRepo.readSourceRevision(prepared.publication.sourceRevision.canonicalSourceRevision))
        .not.toBeNull()
      expect(sourceRepo.readSubjectFactByRevision(
        prepared.publication.subjectFacts[0]!.ref.canonicalSubjectFactRevision)).not.toBeNull()
    } finally {
      db.close()
    }
  })

  it('rejects a prepared result when the shared Rule definitions changed before the short write transaction', async () => {
    const db = database()
    try {
      let now = 100
      const core = new CapabilityRuleCoreV1Repo(db, () => ++now)
      const first = core.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: snapshot() })
      const currentSubjects = subjects()
      const service = new CapabilityRuleMaterializationV1Service(db,
        { readCurrent: async () => currentSubjects }, () => ++now)
      const prepared = await service.prepareCurrent({ ruleStoreId: 'epoch-2-capability-rules',
        defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' } })
      expect(prepared).not.toBeNull()
      core.replaceOwnershipSnapshot({ expectedSnapshotRevision: first.projected.snapshotRevision,
        snapshot: snapshot('unsupported') })

      await expect(service.stagePrepared({ prepared, expectedMaterializationRevision: null }))
        .rejects.toThrowError(expect.objectContaining<Partial<CapabilityRuleMaterializationV1RepoError>>({
          code: 'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_STALE',
        }))
      expect(new CapabilityRuleMaterializationV1Repo(db).readStage(
        buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: 'epoch-2-capability-rules' }))).toBeNull()
    } finally {
      db.close()
    }
  })

  it('uses expected materialization revision as a compare-and-swap boundary', async () => {
    const db = database()
    try {
      const core = new CapabilityRuleCoreV1Repo(db)
      core.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: snapshot() })
      const currentSubjects = subjects()
      const service = new CapabilityRuleMaterializationV1Service(db,
        { readCurrent: async () => currentSubjects })
      const prepared = await service.prepareCurrent({ ruleStoreId: 'epoch-2-capability-rules',
        defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' } })
      expect(prepared).not.toBeNull()
      const first = await service.stagePrepared({ prepared, expectedMaterializationRevision: null })
      await expect(service.stagePrepared({ prepared, expectedMaterializationRevision: null }))
        .rejects.toThrowError(expect.objectContaining<Partial<CapabilityRuleMaterializationV1RepoError>>({
          code: 'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_STALE',
        }))
      expect((await service.stagePrepared({ prepared,
        expectedMaterializationRevision: first.stage.materializationRevision })).stage.materializationRevision)
        .toBe(first.stage.materializationRevision)
      expect(await service.prepareCurrent({ ruleStoreId: 'epoch-2-capability-rules',
        defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' } })).toBeNull()
    } finally {
      db.close()
    }
  })

  it('rejects a prepared result when authoritative exact-subject membership changes before staging', async () => {
    const db = database()
    try {
      const core = new CapabilityRuleCoreV1Repo(db)
      core.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: snapshot() })
      let currentSubjects = subjects()
      const service = new CapabilityRuleMaterializationV1Service(db,
        { readCurrent: async () => currentSubjects })
      const prepared = await service.prepareCurrent({ ruleStoreId: 'epoch-2-capability-rules',
        defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' } })
      expect(prepared).not.toBeNull()
      currentSubjects = buildAuthoritativeModelSubjectSetV1([...currentSubjects.records.flatMap((record) =>
        record.proofs.map((proof) => ({ subject: record.subject, proof }))), {
        subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1',
          nativeModelId: 'gpt-5-mini' },
        proof: { kind: 'provider_native_catalog' as const, providerKey: 'openai_responses', scopeId: 'scope:b',
          credentialScopeId: 'credential-scope-v2:test', credentialRevision: 1,
          endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', catalogCategory: '',
          activeSnapshotDigest: 'b'.repeat(64) },
      }])

      await expect(service.stagePrepared({ prepared, expectedMaterializationRevision: null }))
        .rejects.toThrowError(expect.objectContaining<Partial<CapabilityRuleMaterializationV1RepoError>>({
          code: 'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_STALE',
        }))
      const scope = buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: 'epoch-2-capability-rules' })
      expect(new CapabilityRuleMaterializationV1Repo(db).readStage(scope)).toBeNull()
      expect(db.prepare('SELECT count(*) AS count FROM canonical_model_fact_source_revision_v1')
        .get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM canonical_model_fact_subject_fact_v1')
        .get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM canonical_model_fact_raw_snapshot_v1')
        .get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM canonical_model_fact_raw_payload_v1')
        .get()).toEqual({ count: 0 })
    } finally {
      db.close()
    }
  })
})

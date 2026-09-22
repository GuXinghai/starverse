import { createHash } from 'node:crypto'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import {
  CLOUD_RULES_RELEASE_ASSET_NAME_V1,
  computeCloudRulesContentRevisionV1,
  validateCloudRulesReleasePublicationV1,
} from '../../src/next/generation-v2/capability-rules/cloudRulesReleaseV1'
import { buildAuthoritativeModelSubjectSetV1 } from
  '../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { buildCapabilityRuleSourceScopeIdV1 } from
  '../../src/next/generation-v2/model-facts/sourceScopeV1'
import {
  CloudRulesDistributionV1Repo,
  prepareCloudRulesCandidateV1,
} from '../../infra/db/repo/cloudRulesDistributionV1Repo'
import { CloudRulesApplicationV1Repo } from '../../infra/db/repo/cloudRulesApplicationV1Repo'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { CanonicalModelFactSourceV1Repo } from '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1 } from
  './capabilityRuleMaterializationSchedulerV1Service'
import { CloudRulesApplicationV1Service, CloudRulesApplicationV1ServiceError } from
  './cloudRulesApplicationV1Service'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function subjectSet() {
  return buildAuthoritativeModelSubjectSetV1([{ subject: { providerAuthorityId: 'openai',
    endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' }, proof: {
    kind: 'provider_native_catalog' as const, providerKey: 'openai_responses', scopeId: 'scope:a',
    credentialScopeId: 'credential-scope-v2:test', credentialRevision: 1,
    endpointProfileId: 'openai-default', operationContractId: 'openai-models-v1', catalogCategory: '',
    activeSnapshotDigest: 'a'.repeat(64),
  } }])
}

function candidate(version: string, configured: 'default' | 'on' | 'off' = 'default') {
  const packs = [{ schemaVersion: 1, packId: 'pack.reasoning', displayName: 'Reasoning',
    description: null, priority: 0, mode: 'no_control', target: 'enabled', rules: [{
      ruleId: 'rule.reasoning', label: null, description: null, priority: 0, configured,
      providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
      selector: { kind: 'exact', nativeModelIds: ['gpt-test'] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      evidence: null,
    }] }]
  const publication = validateCloudRulesReleasePublicationV1({ release: {
    id: Number(version.replaceAll('.', '')) + 100, tag_name: `cloud-rules-v${version}`,
    html_url: `https://github.com/GuXinghai/starverse/releases/tag/cloud-rules-v${version}`,
    name: version, body: null, draft: false, prerelease: false,
    published_at: '2026-09-21T00:00:00.000Z', assets: [{ id: 200,
      name: CLOUD_RULES_RELEASE_ASSET_NAME_V1, state: 'uploaded',
      url: 'https://api.github.com/repos/GuXinghai/starverse/releases/assets/200',
      browser_download_url: 'https://github.com/GuXinghai/starverse/releases/download/x/y',
      size: 100, digest: null }],
  }, document: { schemaVersion: 1, releaseVersion: version,
    contentRevision: computeCloudRulesContentRevisionV1(packs), packs } })
  return prepareCloudRulesCandidateV1({ publication,
    rawAssetSha256: createHash('sha256').update(version).digest('hex'), fetchedAtMs: 10 })
}

function publish(db: BetterSqlite3.Database, prepared: ReturnType<typeof candidate>, checkedAtMs: number) {
  return new CloudRulesDistributionV1Repo(db, () => checkedAtMs)
    .publishSuccessfulCheck({ checkedAtMs, candidate: prepared })
}

describe('CloudRulesApplicationV1Service', () => {
  it('atomically applies the persisted candidate and publishes one materialized Rules source', async () => {
    const db = database()
    try {
      const prepared = candidate('1.0.0')
      publish(db, prepared, 10)
      const subjects = subjectSet()
      const service = new CloudRulesApplicationV1Service(db, { readCurrent: async () => subjects }, () => 20)
      const result = await service.applyCandidate({
        expectedCandidateRecordRevision: prepared.candidateRecordRevision,
        expectedAppliedRecordRevision: null,
      })
      expect(result.applied.contentRevision).toBe(prepared.contentRevision)
      expect(new CloudRulesDistributionV1Repo(db).readState()).toMatchObject({
        candidate: null, appliedContentRevision: prepared.contentRevision,
      })
      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'cloud', ownerId: 'official' })
        ?.projected.definition.packs[0]?.rules[0]?.ruleId).toBe('rule.reasoning')
      const scope = buildCapabilityRuleSourceScopeIdV1({
        ruleStoreId: CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
      })
      expect(new CanonicalModelFactSourceV1Repo(db).readSourceState('capability_rule', scope)
        ?.currentSourceRevision).toBe(result.canonicalSourceRevision)
    } finally { db.close() }
  })

  it('bootstraps only when a persisted candidate exists and no LKG has been applied', async () => {
    const db = database()
    try {
      const prepared = candidate('1.0.0')
      publish(db, prepared, 10)
      const subjects = subjectSet()
      const service = new CloudRulesApplicationV1Service(db, { readCurrent: async () => subjects }, () => 20)
      expect((await service.applyBootstrapCandidate())?.applied.contentRevision).toBe(prepared.contentRevision)
      expect(await service.applyBootstrapCandidate()).toBeNull()
    } finally { db.close() }
  })

  it('atomically republishes the same Rules source when a Cloud activation override changes emitted claims', async () => {
    const db = database()
    try {
      const prepared = candidate('1.0.0')
      publish(db, prepared, 10)
      const subjects = subjectSet()
      const service = new CloudRulesApplicationV1Service(db, { readCurrent: async () => subjects }, () => 20)
      const applied = await service.applyCandidate({
        expectedCandidateRecordRevision: prepared.candidateRecordRevision,
        expectedAppliedRecordRevision: null,
      })
      const current = new CloudRulesApplicationV1Repo(db).readState()
      const changed = await service.replaceActivationOverrides({
        expectedAppliedRecordRevision: current.appliedRecordRevision!,
        expectedOverrideRevision: current.overrides.revision,
        overrides: [{ kind: 'rule', ruleId: 'rule.reasoning', configured: 'off' }],
      })
      expect(changed.canonicalSourceRevision).not.toBe(applied.canonicalSourceRevision)
      expect(changed.overrides).toMatchObject({ revision: current.overrides.revision + 1,
        overrides: [{ kind: 'rule', ruleId: 'rule.reasoning', configured: 'off' }] })
      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'cloud', ownerId: 'official' })
        ?.projected.definition.packs[0]?.rules[0]?.configured).toBe('off')
    } finally { db.close() }
  })

  it('rolls back every authority write and retains the candidate when LKG persistence fails', async () => {
    const db = database()
    try {
      const prepared = candidate('1.0.0')
      publish(db, prepared, 10)
      db.exec(`CREATE TRIGGER cloud_rules_application_test_abort
        BEFORE INSERT ON cloud_rules_applied_snapshot_v1
        BEGIN SELECT RAISE(ABORT, 'TEST_APPLY_ABORT'); END`)
      const subjects = subjectSet()
      const service = new CloudRulesApplicationV1Service(db, { readCurrent: async () => subjects }, () => 20)
      await expect(service.applyCandidate({
        expectedCandidateRecordRevision: prepared.candidateRecordRevision,
        expectedAppliedRecordRevision: null,
      })).rejects.toThrow('TEST_APPLY_ABORT')
      expect(new CloudRulesDistributionV1Repo(db).readState().candidate?.candidateRecordRevision)
        .toBe(prepared.candidateRecordRevision)
      expect(new CloudRulesApplicationV1Repo(db).readState().applied).toBeNull()
      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'cloud', ownerId: 'official' }))
        .toBeNull()
      expect(db.prepare('SELECT count(*) AS count FROM canonical_model_fact_source_state_v1').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('rejects stale Apply and supports rollback with activation preservation and optional pin', async () => {
    const db = database()
    try {
      const subjects = subjectSet()
      const service = new CloudRulesApplicationV1Service(db, { readCurrent: async () => subjects }, () => 20)
      const first = candidate('1.0.0')
      publish(db, first, 10)
      await service.applyCandidate({ expectedCandidateRecordRevision: first.candidateRecordRevision,
        expectedAppliedRecordRevision: null })
      const appRepo = new CloudRulesApplicationV1Repo(db, () => 21)
      const overrides = appRepo.readOverrides()
      appRepo.replaceOverrides({ expectedRevision: overrides.revision,
        overrides: [{ kind: 'rule', ruleId: 'rule.reasoning', configured: 'off' }] })

      const second = candidate('2.0.0', 'on')
      publish(db, second, 30)
      await expect(service.applyCandidate({ expectedCandidateRecordRevision: second.candidateRecordRevision,
        expectedAppliedRecordRevision: null })).rejects.toThrowError(expect.objectContaining<
          Partial<CloudRulesApplicationV1ServiceError>>({
          code: 'GENERATION_V2_CLOUD_RULES_APPLICATION_STALE',
        }))
      await service.applyCandidate({ expectedCandidateRecordRevision: second.candidateRecordRevision,
        expectedAppliedRecordRevision: 1 })
      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'cloud', ownerId: 'official' })
        ?.projected.definition.packs[0]?.rules[0]?.configured).toBe('off')

      const target = appRepo.listHistory()[0]!
      const rolledBack = await service.rollback({ expectedAppliedRecordRevision: 2,
        expectedHistoryTargetRecordRevision: target.appliedRecordRevision, pinTarget: true })
      expect(rolledBack.applied.contentRevision).toBe(first.contentRevision)
      expect(appRepo.readPolicy().pin?.contentRevision).toBe(first.contentRevision)
      expect(appRepo.readOverrides().overrides).toEqual([
        { kind: 'rule', ruleId: 'rule.reasoning', configured: 'off' },
      ])
      expect(appRepo.listHistory()[0]?.contentRevision).toBe(second.contentRevision)
    } finally { db.close() }
  })

  it('fails before the write transaction when exact-subject membership changes during preparation', async () => {
    const db = database()
    try {
      const prepared = candidate('1.0.0')
      publish(db, prepared, 10)
      const first = subjectSet()
      const second = buildAuthoritativeModelSubjectSetV1([])
      let reads = 0
      const service = new CloudRulesApplicationV1Service(db,
        { readCurrent: async () => reads++ === 0 ? first : second }, () => 20)
      await expect(service.applyCandidate({ expectedCandidateRecordRevision: prepared.candidateRecordRevision,
        expectedAppliedRecordRevision: null })).rejects.toThrowError(expect.objectContaining<
          Partial<CloudRulesApplicationV1ServiceError>>({
          code: 'GENERATION_V2_CLOUD_RULES_APPLICATION_SUBJECT_SET_STALE',
        }))
      expect(new CloudRulesDistributionV1Repo(db).readState().candidate).not.toBeNull()
      expect(new CloudRulesApplicationV1Repo(db).readState().applied).toBeNull()
    } finally { db.close() }
  })

  it('stale-fails instead of overwriting activation changes made during preparation', async () => {
    const db = database()
    try {
      const first = candidate('1.0.0')
      publish(db, first, 10)
      const subjects = subjectSet()
      const appRepo = new CloudRulesApplicationV1Repo(db, () => 15)
      let reads = 0
      const service = new CloudRulesApplicationV1Service(db, { readCurrent: async () => {
        reads += 1
        if (reads === 2) {
          const current = appRepo.readOverrides()
          appRepo.replaceOverrides({ expectedRevision: current.revision,
            overrides: [{ kind: 'rule', ruleId: 'rule.reasoning', configured: 'off' }] })
        }
        return subjects
      } }, () => 20)
      await expect(service.applyCandidate({ expectedCandidateRecordRevision: first.candidateRecordRevision,
        expectedAppliedRecordRevision: null })).rejects.toThrowError(expect.objectContaining<
          Partial<CloudRulesApplicationV1ServiceError>>({
          code: 'GENERATION_V2_CLOUD_RULES_APPLICATION_STALE',
        }))
      expect(appRepo.readOverrides().overrides).toEqual([
        { kind: 'rule', ruleId: 'rule.reasoning', configured: 'off' },
      ])
      expect(new CloudRulesDistributionV1Repo(db).readState().candidate).not.toBeNull()
      expect(appRepo.readState().applied).toBeNull()
    } finally { db.close() }
  })

  it('marks a corrupt LKG unavailable but permits explicit candidate recovery without history promotion', async () => {
    const db = database()
    try {
      const subjects = subjectSet()
      const service = new CloudRulesApplicationV1Service(db, { readCurrent: async () => subjects }, () => 20)
      const first = candidate('1.0.0')
      publish(db, first, 10)
      await service.applyCandidate({ expectedCandidateRecordRevision: first.candidateRecordRevision,
        expectedAppliedRecordRevision: null })
      db.prepare(`UPDATE cloud_rules_applied_snapshot_v1 SET document_sha256=? WHERE singleton_id=1`)
        .run('f'.repeat(64))
      expect(new CloudRulesApplicationV1Repo(db).readState()).toMatchObject({
        appliedIntegrity: 'invalid', appliedRecordRevision: 1,
      })
      service.ensureCurrentLkgHealth()
      await expect(service.applyBootstrapCandidate()).rejects.toThrowError(expect.objectContaining<
        Partial<CloudRulesApplicationV1ServiceError>>({
        code: 'GENERATION_V2_CLOUD_RULES_APPLICATION_STALE',
      }))
      expect(new CanonicalModelFactSourceV1Repo(db).readSourceState('capability_rule',
        buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1 }))
        ?.staleReason).not.toBeNull()

      const second = candidate('2.0.0', 'on')
      publish(db, second, 30)
      const recovered = await service.applyCandidate({
        expectedCandidateRecordRevision: second.candidateRecordRevision,
        expectedAppliedRecordRevision: 1,
      })
      expect(recovered.applied).toMatchObject({ appliedRecordRevision: 2,
        contentRevision: second.contentRevision })
      expect(new CloudRulesApplicationV1Repo(db).readState().appliedIntegrity).toBe('valid')
      expect(new CloudRulesApplicationV1Repo(db).listHistory()).toEqual([])
      expect(new CanonicalModelFactSourceV1Repo(db).readSourceState('capability_rule',
        buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1 }))
        ?.staleReason).toBeNull()
    } finally { db.close() }
  })

  it('does not expose the stale cloud core through the UI projection when the LKG is invalid', async () => {
    const db = database()
    try {
      const service = new CloudRulesApplicationV1Service(db, { readCurrent: async () => subjectSet() }, () => 20)
      const first = candidate('1.0.0')
      publish(db, first, 10)
      await service.applyCandidate({ expectedCandidateRecordRevision: first.candidateRecordRevision,
        expectedAppliedRecordRevision: null })
      db.prepare(`UPDATE cloud_rules_applied_snapshot_v1 SET document_sha256=? WHERE singleton_id=1`)
        .run('f'.repeat(64))

      expect(service.readActiveProjection().activeSnapshot).toBeNull()
    } finally { db.close() }
  })
})

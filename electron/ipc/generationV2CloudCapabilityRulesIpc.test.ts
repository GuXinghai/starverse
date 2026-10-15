import path from 'node:path'
import { createHash } from 'node:crypto'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { CloudRulesApplicationV1Repo } from '../../infra/db/repo/cloudRulesApplicationV1Repo'
import { CloudRulesDistributionV1Repo } from '../../infra/db/repo/cloudRulesDistributionV1Repo'
import { prepareCloudRulesCandidateV1 } from '../../infra/db/repo/cloudRulesDistributionV1Repo'
import { CanonicalModelFactSourceV1Repo } from '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { CLOUD_RULES_RELEASE_ASSET_NAME_V1, computeCloudRulesContentRevisionV1, validateCloudRulesReleasePublicationV1 } from
  '../../src/core/generation-v2/capability-rules/cloudRulesReleaseV1'
import { CAPABILITY_RULE_SOURCE_SCOPE_ID_V1 } from '../../src/core/generation-v2/model-facts/semanticInvalidationV1'
import { buildAuthoritativeModelSubjectSetV1 } from
  '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { CloudRulesApplicationV1Service } from '../services/cloudRulesApplicationV1Service'
import { CloudRulesCandidateRefreshV1 } from '../services/cloudRulesCandidateRefreshV1'
import {
  GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS,
  registerGenerationV2CloudCapabilityRulesIpc,
} from './generationV2CloudCapabilityRulesIpc'

type Handler = (event: unknown, payload?: unknown) => unknown | Promise<unknown>

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

describe('generationV2CloudCapabilityRulesIpc', () => {
  it('registers only the closed Cloud lifecycle surface and returns persisted read projections', () => {
    const db = database()
    try {
      const handlers = new Map<string, Handler>()
      const applicationRepo = new CloudRulesApplicationV1Repo(db)
      const distributionRepo = new CloudRulesDistributionV1Repo(db)
      const application = new CloudRulesApplicationV1Service(db, {
        readCurrent: async () => buildAuthoritativeModelSubjectSetV1([]),
      })
      const refresh = new CloudRulesCandidateRefreshV1({ db, fetchImpl: vi.fn() })
      expect(registerGenerationV2CloudCapabilityRulesIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler), refresh,
        application, applicationRepo, distributionRepo,
      })).toEqual(GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS)
      expect([...handlers.keys()].sort()).toEqual([...GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_CHANNELS].sort())
      expect(handlers.get('generation-v2:capability-rules:cloud:read')!({}, null))
        .toEqual(expect.objectContaining({ history: [], application: expect.objectContaining({ applied: null }) }))
      expect(() => handlers.get('generation-v2:capability-rules:cloud:check')!({}, { extra: true }))
        .toThrow('GENERATION_V2_CLOUD_CAPABILITY_RULES_IPC_INVALID')
    } finally { db.close() }
  })

  it('notifies actual committed Apply, activation and Rollback, and stays silent after failed CAS', async () => {
    const db = database()
    try {
      const handlers = new Map<string, Handler>()
      const applicationRepo = new CloudRulesApplicationV1Repo(db)
      const distributionRepo = new CloudRulesDistributionV1Repo(db)
      const application = new CloudRulesApplicationV1Service(db, { readCurrent: async () => buildAuthoritativeModelSubjectSetV1([]) })
      const refresh = new CloudRulesCandidateRefreshV1({ db, fetchImpl: vi.fn() })
      const notify = vi.fn((event: any) => {
        expect(db.inTransaction).toBe(false)
        expect(new CanonicalModelFactSourceV1Repo(db).readSourceState('capability_rule', CAPABILITY_RULE_SOURCE_SCOPE_ID_V1)
          ?.currentSourceRevision).toBe(event.canonicalSourceRevision)
        throw new Error('SYNTHETIC_DELIVERY_FAILURE')
      })
      registerGenerationV2CloudCapabilityRulesIpc({ registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler),
        application, applicationRepo, distributionRepo, refresh, notifyModelFactsSemanticInvalidated: notify })
      const candidate = (version: string) => {
        const packs = [{ schemaVersion: 1, packId: 'pack.reasoning', displayName: 'Synthetic Rules', description: null,
          priority: 0, mode: 'no_control', target: 'enabled', rules: [{ ruleId: 'rule.reasoning', label: null, description: null,
            priority: 0, configured: version === '1.0.0' ? 'default' : 'on', providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1',
            selector: { kind: 'exact', nativeModelIds: ['gpt-test'] }, evidence: null,
            assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } } }] }]
        const publication = validateCloudRulesReleasePublicationV1({ release: { id: Number(version.replaceAll('.', '')) + 100,
          tag_name: `cloud-rules-v${version}`, html_url: `https://github.com/GuXinghai/starverse/releases/tag/cloud-rules-v${version}`,
          name: version, body: null, draft: false, prerelease: false, published_at: '2026-09-21T00:00:00.000Z', assets: [{ id: 200,
            name: CLOUD_RULES_RELEASE_ASSET_NAME_V1, state: 'uploaded', url: 'https://api.github.com/repos/GuXinghai/starverse/releases/assets/200',
            browser_download_url: 'https://github.com/GuXinghai/starverse/releases/download/x/y', size: 100, digest: null }] },
          document: { schemaVersion: 1, releaseVersion: version, contentRevision: computeCloudRulesContentRevisionV1(packs), packs } })
        const prepared = prepareCloudRulesCandidateV1({ publication, rawAssetSha256: createHash('sha256').update(version).digest('hex'), fetchedAtMs: 10 })
        distributionRepo.publishSuccessfulCheck({ checkedAtMs: 10, candidate: prepared })
        return prepared
      }
      const call = (suffix: string, payload?: unknown) => handlers.get(`generation-v2:capability-rules:cloud:${suffix}`)!({}, payload) as any
      call('read')
      const first = candidate('1.0.0')
      expect(notify).not.toHaveBeenCalled()
      const applied = await call('apply', { expectedCandidateRecordRevision: first.candidateRecordRevision, expectedAppliedRecordRevision: null })
      expect(notify).toHaveBeenCalledTimes(1)
      expect(notify.mock.calls[0]![0].canonicalSourceRevision).toBe(applied.canonicalSourceRevision)
      let state = applicationRepo.readState()
      await call('replace-activation-overrides', { expectedAppliedRecordRevision: state.appliedRecordRevision,
        expectedOverrideRevision: state.overrides.revision, overrides: [{ kind: 'rule', ruleId: 'rule.reasoning', configured: 'off' }] })
      expect(notify).toHaveBeenCalledTimes(2)
      const second = candidate('2.0.0')
      await expect(call('apply', { expectedCandidateRecordRevision: second.candidateRecordRevision, expectedAppliedRecordRevision: null })).rejects.toThrow()
      expect(notify).toHaveBeenCalledTimes(2)
      await call('apply', { expectedCandidateRecordRevision: second.candidateRecordRevision, expectedAppliedRecordRevision: state.appliedRecordRevision })
      expect(notify).toHaveBeenCalledTimes(3)
      state = applicationRepo.readState()
      const target = applicationRepo.listHistory()[0]!
      await call('rollback', { expectedAppliedRecordRevision: state.appliedRecordRevision,
        expectedHistoryTargetRecordRevision: target.appliedRecordRevision, pinTarget: true })
      expect(notify).toHaveBeenCalledTimes(4)
    } finally { db.close() }
  })
})

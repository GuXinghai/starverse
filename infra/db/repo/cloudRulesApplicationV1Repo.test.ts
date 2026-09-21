import { createHash } from 'node:crypto'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import {
  CLOUD_RULES_RELEASE_ASSET_NAME_V1,
  computeCloudRulesContentRevisionV1,
  projectCloudRulesReleaseMetadataV1,
  validateCloudRulesReleasePublicationV1,
} from '../../../src/next/generation-v2/capability-rules/cloudRulesReleaseV1'
import {
  CloudRulesApplicationV1Repo,
  CloudRulesApplicationV1RepoError,
  type CloudRulesInstallTargetV1,
} from './cloudRulesApplicationV1Repo'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function target(version: string, ruleId = `rule.${version}`): CloudRulesInstallTargetV1 {
  const packs = [{ schemaVersion: 1, packId: 'pack.reasoning', displayName: 'Reasoning',
    description: null, priority: 0, mode: 'no_control', target: 'enabled', rules: [{ ruleId,
      label: null, description: null, priority: 0, configured: 'default', providerAuthorityId: 'openai',
      endpointProfileId: 'openai-default', selector: { kind: 'exact', nativeModelIds: ['gpt-test'] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      evidence: null }] }]
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
  const documentSha256 = createHash('sha256')
    .update(JSON.stringify(publication.document))
    .digest('hex')
  // Repository integrity uses Starverse's canonical digest, not JSON.stringify order.
  const canonical = (awaitCanonicalDigest(publication.document))
  return { releaseVersion: version, contentRevision: publication.document.contentRevision,
    releaseMetadata: projectCloudRulesReleaseMetadataV1(publication), document: publication.document,
    documentSha256: canonical, rawAssetSha256: documentSha256 }
}

function awaitCanonicalDigest(value: unknown): string {
  // Static import is intentionally kept local to make the target helper mirror persisted data.
  return requireCanonicalDigest(value)
}

import { canonicalSourceFactDigestV1 as requireCanonicalDigest } from
  '../../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'

describe('CloudRulesApplicationV1Repo', () => {
  it('commits LKG/history/overrides atomically and rejects stale applied revisions', () => {
    const db = database()
    try {
      let now = 100
      const repo = new CloudRulesApplicationV1Repo(db, () => ++now)
      const first = target('1.0.0', 'rule.keep')
      const firstApplied = repo.commitInstall({ expectedAppliedRecordRevision: null, target: first,
        eventKind: 'apply', retainedOverrides: [{ kind: 'rule', ruleId: 'rule.keep', configured: 'off' }],
        pinTarget: false })
      expect(firstApplied.appliedRecordRevision).toBe(1)
      expect(repo.readState()).toMatchObject({ appliedIntegrity: 'valid',
        policy: { historyLimit: 4, pin: null },
        overrides: { overrides: [{ kind: 'rule', ruleId: 'rule.keep', configured: 'off' }] } })

      expect(() => repo.commitInstall({ expectedAppliedRecordRevision: null,
        target: target('2.0.0'), eventKind: 'apply', retainedOverrides: [], pinTarget: false }))
        .toThrowError(new CloudRulesApplicationV1RepoError('GENERATION_V2_CLOUD_RULES_APPLICATION_STALE'))
      expect(repo.listHistory()).toHaveLength(0)

      const second = target('2.0.0', 'rule.new')
      repo.commitInstall({ expectedAppliedRecordRevision: 1, target: second, eventKind: 'apply',
        retainedOverrides: [], pinTarget: false })
      expect(repo.readAppliedOrThrow()?.contentRevision).toBe(second.contentRevision)
      expect(repo.listHistory().map((entry) => entry.contentRevision)).toEqual([first.contentRevision])
      expect(repo.readOverrides().overrides).toEqual([])
    } finally { db.close() }
  })

  it('rolls back as a new apply event, preserves current overrides, and can pin/resume', () => {
    const db = database()
    try {
      const repo = new CloudRulesApplicationV1Repo(db, () => 100)
      const first = target('1.0.0', 'rule.shared')
      const second = target('2.0.0', 'rule.shared')
      repo.commitInstall({ expectedAppliedRecordRevision: null, target: first, eventKind: 'apply',
        retainedOverrides: [], pinTarget: false })
      repo.commitInstall({ expectedAppliedRecordRevision: 1, target: second, eventKind: 'apply',
        retainedOverrides: [{ kind: 'rule', ruleId: 'rule.shared', configured: 'off' }], pinTarget: false })
      const historyTarget = repo.listHistory()[0]!
      const rolledBack = repo.commitInstall({ expectedAppliedRecordRevision: 2, target: historyTarget,
        eventKind: 'rollback', expectedHistoryTargetRecordRevision: historyTarget.appliedRecordRevision,
        retainedOverrides: repo.readOverrides().overrides, pinTarget: true })
      expect(rolledBack).toMatchObject({ appliedRecordRevision: 3, contentRevision: first.contentRevision })
      expect(repo.listHistory().map((entry) => entry.contentRevision)).toEqual([second.contentRevision])
      expect(repo.readPolicy().pin).toEqual({ releaseVersion: '1.0.0',
        contentRevision: first.contentRevision })
      expect(repo.readOverrides().overrides).toEqual([
        { kind: 'rule', ruleId: 'rule.shared', configured: 'off' },
      ])
      const resumed = repo.resumeUpdates({ expectedPolicyRevision: repo.readPolicy().policyRevision })
      expect(resumed.pin).toBeNull()
    } finally { db.close() }
  })

  it('enforces the bounded history setting and prunes oldest records immediately', () => {
    const db = database()
    try {
      const repo = new CloudRulesApplicationV1Repo(db, () => 100)
      for (let index = 1; index <= 6; index += 1) {
        repo.commitInstall({ expectedAppliedRecordRevision: index === 1 ? null : index - 1,
          target: target(`${index}.0.0`), eventKind: 'apply', retainedOverrides: [], pinTarget: false })
      }
      expect(repo.listHistory()).toHaveLength(4)
      const policy = repo.setHistoryLimit({ expectedPolicyRevision: repo.readPolicy().policyRevision,
        historyLimit: 1 })
      expect(policy.historyLimit).toBe(1)
      expect(repo.listHistory()).toHaveLength(1)
      expect(() => repo.setHistoryLimit({ expectedPolicyRevision: policy.policyRevision,
        historyLimit: 21 })).toThrow()
    } finally { db.close() }
  })

  it('reports a corrupted current LKG without promoting history or clearing it', () => {
    const db = database()
    try {
      const repo = new CloudRulesApplicationV1Repo(db, () => 100)
      repo.commitInstall({ expectedAppliedRecordRevision: null, target: target('1.0.0'),
        eventKind: 'apply', retainedOverrides: [], pinTarget: false })
      db.prepare(`UPDATE cloud_rules_applied_snapshot_v1 SET document_sha256=? WHERE singleton_id=1`)
        .run('f'.repeat(64))
      expect(repo.readState()).toMatchObject({ applied: null, appliedIntegrity: 'invalid' })
      expect(() => repo.readAppliedOrThrow()).toThrowError(new CloudRulesApplicationV1RepoError(
        'GENERATION_V2_CLOUD_RULES_APPLICATION_LKG_CORRUPT'))
      expect(repo.listHistory()).toHaveLength(0)
    } finally { db.close() }
  })
})

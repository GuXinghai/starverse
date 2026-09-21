import { createHash } from 'node:crypto'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import {
  CLOUD_RULES_RELEASE_ASSET_NAME_V1,
  computeCloudRulesContentRevisionV1,
  validateCloudRulesReleasePublicationV1,
} from '../../../src/next/generation-v2/capability-rules/cloudRulesReleaseV1'
import {
  CloudRulesDistributionV1Repo,
  CloudRulesDistributionV1RepoError,
  prepareCloudRulesCandidateV1,
} from './cloudRulesDistributionV1Repo'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function packs(priority = 0): readonly Record<string, unknown>[] {
  return [{ schemaVersion: 1, packId: 'pack.reasoning', displayName: 'Reasoning', description: null,
    priority, mode: 'no_control', target: 'enabled', rules: [{
      ruleId: 'rule.reasoning', label: null, description: null, priority: 0, configured: 'default',
      providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
      selector: { kind: 'exact', nativeModelIds: ['gpt-test'] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      evidence: null,
    }] }]
}

function candidate(version: string, fetchedAtMs: number, priority = 0) {
  const rulePacks = packs(priority)
  const publication = validateCloudRulesReleasePublicationV1({
    release: {
      id: Number(version.replaceAll('.', '')) + 100,
      tag_name: `cloud-rules-v${version}`,
      html_url: `https://github.com/GuXinghai/starverse/releases/tag/cloud-rules-v${version}`,
      name: `Cloud Rules ${version}`,
      body: `notes ${version}`,
      draft: false,
      prerelease: false,
      published_at: '2026-09-21T00:00:00.000Z',
      assets: [{ id: Number(version.replaceAll('.', '')) + 200,
        name: CLOUD_RULES_RELEASE_ASSET_NAME_V1, state: 'uploaded',
        url: `https://api.github.com/repos/GuXinghai/starverse/releases/assets/${version}`,
        browser_download_url: `https://github.com/GuXinghai/starverse/releases/download/cloud-rules-v${version}/${CLOUD_RULES_RELEASE_ASSET_NAME_V1}`,
        size: 100, digest: null }],
    },
    document: { schemaVersion: 1, releaseVersion: version,
      contentRevision: computeCloudRulesContentRevisionV1(rulePacks), packs: rulePacks },
  })
  return prepareCloudRulesCandidateV1({ publication,
    rawAssetSha256: createHash('sha256').update(`raw:${version}:${priority}`).digest('hex'), fetchedAtMs })
}

describe('CloudRulesDistributionV1Repo', () => {
  it('persists a validated candidate, latest observation, and permanent version binding atomically', () => {
    const db = database()
    try {
      const repo = new CloudRulesDistributionV1Repo(db, () => 1_100)
      const prepared = candidate('1.2.3', 1_000)
      const state = repo.publishSuccessfulCheck({ checkedAtMs: 1_000, candidate: prepared })
      expect(state).toMatchObject({ stateRevision: 1, lastAttemptedAtMs: 1_000,
        lastSuccessfulCheckAtMs: 1_000, lastFailureCode: null,
        latestObserved: { releaseVersion: '1.2.3', contentRevision: prepared.contentRevision },
        candidate: { candidateRecordRevision: prepared.candidateRecordRevision,
          releaseVersion: '1.2.3', contentRevision: prepared.contentRevision } })
      expect(repo.readReleaseVersionBinding('1.2.3')).toBe(prepared.contentRevision)
      expect(repo.readState()).toEqual(state)
      expect(() => db.prepare(`UPDATE cloud_rules_release_version_ledger_v1
        SET content_revision=? WHERE release_version=?`).run(
        `sha256:${'f'.repeat(64)}`, '1.2.3')).toThrow(/CLOUD_RULES_RELEASE_VERSION_BINDING_IMMUTABLE/u)
      expect(() => db.prepare(`DELETE FROM cloud_rules_release_version_ledger_v1
        WHERE release_version=?`).run('1.2.3')).toThrow(/CLOUD_RULES_RELEASE_VERSION_LEDGER_PERMANENT/u)
    } finally { db.close() }
  })

  it('records failure diagnostics without changing the candidate or successful freshness', () => {
    const db = database()
    try {
      let now = 1_000
      const repo = new CloudRulesDistributionV1Repo(db, () => now)
      const first = repo.publishSuccessfulCheck({ checkedAtMs: now, candidate: candidate('1.0.0', now) })
      now = 2_000
      const failed = repo.recordFailure({ attemptedAtMs: now,
        failureCode: 'CLOUD_RULES_HTTP_INVALID' })
      expect(failed.lastSuccessfulCheckAtMs).toBe(first.lastSuccessfulCheckAtMs)
      expect(failed.candidate).toEqual(first.candidate)
      expect(failed.latestObserved).toEqual(first.latestObserved)
      expect(failed).toMatchObject({ lastAttemptedAtMs: 2_000,
        lastFailureCode: 'CLOUD_RULES_HTTP_INVALID' })
    } finally { db.close() }
  })

  it('rejects same-version content drift and rolls back every success-path write', () => {
    const db = database()
    try {
      let now = 1_000
      const repo = new CloudRulesDistributionV1Repo(db, () => now)
      repo.publishSuccessfulCheck({ checkedAtMs: now, candidate: candidate('1.0.0', now) })
      const before = repo.readState()
      now = 2_000
      expect(() => repo.publishSuccessfulCheck({ checkedAtMs: now,
        candidate: candidate('1.0.0', now, 1) })).toThrowError(
        new CloudRulesDistributionV1RepoError('GENERATION_V2_CLOUD_RULES_RELEASE_VERSION_DRIFT'))
      expect(repo.readState()).toEqual(before)
      expect(repo.readReleaseVersionBinding('1.0.0')).toBe(before.candidate?.contentRevision)
    } finally { db.close() }
  })

  it('treats unchanged applied content as freshness-only while retaining latest release metadata', () => {
    const db = database()
    try {
      let now = 1_000
      const repo = new CloudRulesDistributionV1Repo(db, () => now)
      const first = candidate('1.0.0', now)
      repo.publishSuccessfulCheck({ checkedAtMs: now, candidate: first })
      db.prepare(`UPDATE cloud_rules_distribution_state_v1
        SET applied_content_revision=?, candidate_record_revision=NULL, candidate_release_version=NULL,
          candidate_content_revision=NULL, candidate_release_metadata_json=NULL,
          candidate_document_json=NULL, candidate_document_sha256=NULL,
          candidate_raw_asset_sha256=NULL, candidate_fetched_at_ms=NULL
        WHERE singleton_id=1`).run(first.contentRevision)

      now = 2_000
      const higher = candidate('1.1.0', now)
      expect(higher.contentRevision).toBe(first.contentRevision)
      const state = repo.publishSuccessfulCheck({ checkedAtMs: now, candidate: higher })
      expect(state.candidate).toBeNull()
      expect(state.latestObserved).toMatchObject({ releaseVersion: '1.1.0',
        contentRevision: first.contentRevision })
      expect(repo.readReleaseVersionBinding('1.1.0')).toBe(first.contentRevision)
    } finally { db.close() }
  })

  it('keeps one content candidate identity when a higher Release republishes identical Rules', () => {
    const db = database()
    try {
      let now = 1_000
      const repo = new CloudRulesDistributionV1Repo(db, () => now)
      const first = candidate('1.0.0', now)
      const firstState = repo.publishSuccessfulCheck({ checkedAtMs: now, candidate: first })
      now = 2_000
      const higher = candidate('1.1.0', now)
      expect(higher.contentRevision).toBe(first.contentRevision)
      expect(higher.candidateRecordRevision).toBe(first.candidateRecordRevision)
      const state = repo.publishSuccessfulCheck({ checkedAtMs: now, candidate: higher })
      expect(state.latestObserved?.releaseVersion).toBe('1.1.0')
      expect(state.candidate).toEqual(firstState.candidate)
      expect(state.candidate?.releaseVersion).toBe('1.0.0')
      expect(state.lastSuccessfulCheckAtMs).toBe(2_000)
    } finally { db.close() }
  })

  it('withdraws an unapplied candidate only on a successful complete empty check', () => {
    const db = database()
    try {
      let now = 1_000
      const repo = new CloudRulesDistributionV1Repo(db, () => now)
      repo.publishSuccessfulCheck({ checkedAtMs: now, candidate: candidate('1.0.0', now) })
      now = 2_000
      const withdrawn = repo.publishSuccessfulCheck({ checkedAtMs: now, candidate: null })
      expect(withdrawn.candidate).toBeNull()
      expect(withdrawn.latestObserved).toBeNull()
      expect(withdrawn.lastSuccessfulCheckAtMs).toBe(2_000)
      expect(repo.readReleaseVersionBinding('1.0.0')).not.toBeNull()
    } finally { db.close() }
  })
})

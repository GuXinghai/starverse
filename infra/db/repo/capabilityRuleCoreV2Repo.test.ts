import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { CapabilityRuleCoreV1Repo } from './capabilityRuleCoreV1Repo'
import { CapabilityRuleCoreV2Repo, CapabilityRuleCoreV2RepoError } from './capabilityRuleCoreV2Repo'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function v1Snapshot() {
  return { schemaVersion: 1, ownership: 'user', ownerId: 'local-user', packs: [{
    schemaVersion: 1, packId: 'pack.user', displayName: 'Legacy', description: null,
    priority: 0, mode: 'no_control', target: 'enabled', rules: [{
      ruleId: 'rule.user', label: null, description: null, priority: 0, configured: 'default',
      providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
      selector: { kind: 'exact', nativeModelIds: ['gpt-test'] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      evidence: null,
    }],
  }] }
}

function v2Snapshot() {
  return { schemaVersion: 2, ownership: 'user', ownerId: 'local-user', packs: [{
    schemaVersion: 2, packId: 'pack.user', displayName: 'V2', description: null,
    priority: 10, mode: 'override', target: 'enabled', rules: [{
      ruleId: 'rule.user', label: null, description: null, priority: 20, configured: 'on',
      providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
      selector: { kind: 'exact', nativeModelIds: ['gpt-test'] }, evidence: null,
      category: 'reasoning', when: { kind: 'eq', path: 'target.providerId', value: 'openai' },
      effect: { kind: 'registered_operation', operationId: 'reasoning_openai',
        parameters: { samplingBehavior: 'preserve' } },
      decisionKey: 'reasoning.effort', dependencies: [],
    }],
  }] }
}

describe('CapabilityRuleCoreV2Repo', () => {
  it('round-trips complete V2 definitions without rewriting coexisting strict V1 snapshots', () => {
    const db = database()
    try {
      const legacyRepo = new CapabilityRuleCoreV1Repo(db, () => 10)
      const v2Repo = new CapabilityRuleCoreV2Repo(db, () => 10)
      const legacy = legacyRepo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
        snapshot: v1Snapshot() })
      const current = v2Repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
        snapshot: v2Snapshot() })

      expect(v2Repo.readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })?.projected)
        .toEqual(current.projected)
      expect(legacyRepo.readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })?.projected)
        .toEqual(legacy.projected)
      expect(current.projected.definition.packs[0]!.rules[0]!.effect.kind)
        .toBe('registered_operation')
    } finally { db.close() }
  })

  it('deletes an obsolete owner only when the expected revision matches', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleCoreV2Repo(db, () => 10)
      const current = repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
        snapshot: v2Snapshot() })
      expect(() => repo.deleteOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user',
        expectedSnapshotRevision: null })).toThrowError(new CapabilityRuleCoreV2RepoError(
        'GENERATION_V2_CAPABILITY_RULE_CORE_STALE_REVISION'))
      expect(repo.deleteOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user',
        expectedSnapshotRevision: current.projected.snapshotRevision })).toBe(true)
      expect(repo.readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })).toBeNull()
    } finally { db.close() }
  })
})

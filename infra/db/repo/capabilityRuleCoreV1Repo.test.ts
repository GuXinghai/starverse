import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import {
  CapabilityRuleCoreV1Repo,
  CapabilityRuleCoreV1RepoError,
  prepareCapabilityRuleOwnershipSnapshotWriteV1,
} from './capabilityRuleCoreV1Repo'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function rule(ruleId: string): Record<string, unknown> {
  return {
    ruleId,
    label: null,
    description: null,
    priority: 0,
    configured: 'default',
    providerAuthorityId: 'openai',
    endpointProfileId: 'openai-default',
    selector: { kind: 'exact', nativeModelIds: ['gpt-5'] },
    assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
    evidence: null,
  }
}

function pack(packId: string, rules: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { schemaVersion: 1, packId, displayName: packId, description: null, priority: 0,
    mode: 'no_control', target: 'enabled', rules }
}

function snapshot(input: Readonly<{
  ownership?: 'cloud' | 'user'
  ownerId?: string
  packs?: readonly Record<string, unknown>[]
}> = {}): Record<string, unknown> {
  return { schemaVersion: 1, ownership: input.ownership ?? 'cloud', ownerId: input.ownerId ?? 'official',
    packs: input.packs ?? [pack('pack.a', [rule('rule.a')])] }
}

describe('CapabilityRuleCoreV1Repo', () => {
  it('prepares all canonical JSON write records before entering repository transactions', () => {
    const prepared = prepareCapabilityRuleOwnershipSnapshotWriteV1(snapshot({ packs: [pack('pack.a', [
      { ...rule('rule.a'), evidence: {
        evidenceSourceRef: 'provider.docs', evidenceKind: 'explicit_provider',
        evidenceNote: 'Official provider documentation.', identityEvidenceKind: 'official_exact_model_doc',
        identityEvidenceSourceRef: 'provider.docs.model', provenanceUrl: 'https://example.com/model',
        verifiedAt: '2026-09-21T00:00:00.000Z', derivation: null,
      } },
    ])] }))
    expect(prepared.packs).toHaveLength(1)
    expect(prepared.rules).toHaveLength(1)
    expect(prepared.rules[0]).toMatchObject({
      selectorValuesJson: '["gpt-5"]',
      canonicalValueJson: '{"kind":"support","value":"supported"}',
    })
    expect(prepared.rules[0]?.evidenceJson).toContain('provider.docs')
    expect(Object.isFrozen(prepared)).toBe(true)
    expect(Object.isFrozen(prepared.rules)).toBe(true)
  })

  it('atomically replaces one ownership snapshot with expected-revision checks', () => {
    const db = database()
    try {
      let now = 10
      const repo = new CapabilityRuleCoreV1Repo(db, () => now)
      const first = repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: snapshot() })
      expect(first.projected.definition.packs[0]?.rules[0]?.ruleId).toBe('rule.a')
      expect(first.createdAtMs).toBe(10)
      now = 20
      const replay = repo.replaceOwnershipSnapshot({
        expectedSnapshotRevision: first.projected.snapshotRevision,
        snapshot: snapshot(),
      })
      expect(replay.updatedAtMs).toBe(10)
      expect(() => repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
        snapshot: snapshot({ packs: [] }) })).toThrowError(
        new CapabilityRuleCoreV1RepoError('GENERATION_V2_CAPABILITY_RULE_CORE_STALE_REVISION'))
      const emptied = repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: first.projected.snapshotRevision,
        snapshot: snapshot({ packs: [] }) })
      expect(emptied.projected.definition.packs).toEqual([])
      expect(db.prepare('SELECT COUNT(*) AS count FROM capability_rule_pack_core_v1').get())
        .toEqual({ count: 0 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM capability_rule_core_v1').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('preserves stable Rule identity and creation time across Pack moves', () => {
    const db = database()
    try {
      let now = 10
      const repo = new CapabilityRuleCoreV1Repo(db, () => now)
      const first = repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
        snapshot: snapshot({ packs: [pack('pack.a', [rule('stable.rule')]), pack('pack.b', [])] }) })
      const firstPackRevisions = new Map(first.projected.packs.map((entry) => [
        entry.definition.packId, entry.packRevision,
      ]))
      const firstRuleRevision = first.projected.packs[0]?.rules[0]?.ruleRevision
      const before = db.prepare(`SELECT created_at_ms FROM capability_rule_core_v1
        WHERE ownership = 'cloud' AND owner_id = 'official' AND rule_id = 'stable.rule'`).get()
      now = 20
      const moved = repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: first.projected.snapshotRevision,
        snapshot: snapshot({ packs: [pack('pack.a', []), pack('pack.b', [rule('stable.rule')])] }) })
      const after = db.prepare(`SELECT pack_id, created_at_ms FROM capability_rule_core_v1
        WHERE ownership = 'cloud' AND owner_id = 'official' AND rule_id = 'stable.rule'`).get()
      expect(after).toEqual({ pack_id: 'pack.b', ...(before as object) })
      expect(moved.projected.definition.packs[1]?.rules[0]?.ruleId).toBe('stable.rule')
      expect(moved.projected.packs[1]?.rules[0]?.ruleRevision).not.toBe(firstRuleRevision)
      expect(moved.projected.packs[0]?.packRevision).not.toBe(firstPackRevisions.get('pack.a'))
      expect(moved.projected.packs[1]?.packRevision).not.toBe(firstPackRevisions.get('pack.b'))
    } finally { db.close() }
  })

  it('stores identical owner-neutral Pack content for Cloud and User without revision collision', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleCoreV1Repo(db, () => 10)
      const cloud = repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: snapshot() })
      const user = repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
        snapshot: snapshot({ ownership: 'user', ownerId: 'local-user' }) })
      expect(cloud.projected.packs[0]?.packRevision).toBe(user.projected.packs[0]?.packRevision)
      expect(cloud.projected.snapshotRevision).not.toBe(user.projected.snapshotRevision)
    } finally { db.close() }
  })

  it('does not advance last-modified metadata for unchanged Packs and Rules', () => {
    const db = database()
    try {
      let now = 10
      const repo = new CapabilityRuleCoreV1Repo(db, () => now)
      const first = repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
        snapshot: snapshot({ packs: [pack('pack.a', [rule('rule.a')]), pack('pack.b', [rule('rule.b')])] }) })
      now = 20
      repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: first.projected.snapshotRevision,
        snapshot: snapshot({ packs: [pack('pack.a', [rule('rule.a')]), pack('pack.b', [
          { ...rule('rule.b'), description: 'Changed' },
        ])] }) })
      expect(db.prepare(`SELECT pack_id, updated_at_ms FROM capability_rule_pack_core_v1
        WHERE ownership = 'cloud' AND owner_id = 'official' ORDER BY pack_id`).all()).toEqual([
        { pack_id: 'pack.a', updated_at_ms: 10 },
        { pack_id: 'pack.b', updated_at_ms: 20 },
      ])
      expect(db.prepare(`SELECT rule_id, updated_at_ms FROM capability_rule_core_v1
        WHERE ownership = 'cloud' AND owner_id = 'official' ORDER BY rule_id`).all()).toEqual([
        { rule_id: 'rule.a', updated_at_ms: 10 },
        { rule_id: 'rule.b', updated_at_ms: 20 },
      ])
    } finally { db.close() }
  })

  it('rolls back the whole ownership replacement on a write failure', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleCoreV1Repo(db, () => 10)
      const first = repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: snapshot() })
      db.exec(`CREATE TRIGGER capability_rule_core_test_abort
        BEFORE INSERT ON capability_rule_core_v1
        WHEN NEW.rule_id = 'rule.fail'
        BEGIN SELECT RAISE(ABORT, 'TEST_ABORT'); END`)
      expect(() => repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: first.projected.snapshotRevision,
        snapshot: snapshot({ packs: [pack('pack.changed', [rule('rule.fail')])] }) })).toThrow('TEST_ABORT')
      const retained = repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: 'official' })
      expect(retained?.projected.snapshotRevision).toBe(first.projected.snapshotRevision)
      expect(retained?.projected.definition.packs[0]?.packId).toBe('pack.a')
    } finally { db.close() }
  })

  it('uses a savepoint so a caught failure cannot partially mutate an outer transaction', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleCoreV1Repo(db, () => 10)
      const first = repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: snapshot() })
      db.exec(`CREATE TRIGGER capability_rule_core_nested_test_abort
        BEFORE INSERT ON capability_rule_core_v1
        WHEN NEW.rule_id = 'rule.fail'
        BEGIN SELECT RAISE(ABORT, 'NESTED_TEST_ABORT'); END`)
      db.transaction(() => {
        try {
          repo.replaceOwnershipSnapshot({ expectedSnapshotRevision: first.projected.snapshotRevision,
            snapshot: snapshot({ packs: [pack('pack.changed', [rule('rule.fail')])] }) })
        } catch (error) {
          expect(String(error)).toContain('NESTED_TEST_ABORT')
        }
        db.prepare('CREATE TABLE nested_transaction_survived (value INTEGER NOT NULL)').run()
      }).immediate()
      const retained = repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: 'official' })
      expect(retained?.projected.snapshotRevision).toBe(first.projected.snapshotRevision)
      expect(retained?.projected.definition.packs[0]?.packId).toBe('pack.a')
      expect(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'nested_transaction_survived'`).get())
        .toEqual({ name: 'nested_transaction_survived' })
    } finally { db.close() }
  })
})

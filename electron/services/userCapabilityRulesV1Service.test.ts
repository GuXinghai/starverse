import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { buildAuthoritativeModelSubjectSetV1 } from
  '../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { createUserRulePackTransferV1 } from
  '../../src/next/generation-v2/capability-rules/userRulePackTransferV1'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { CanonicalModelFactSourceV1Repo } from '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { UserCapabilityRuleDraftV1Repo } from '../../infra/db/repo/userCapabilityRuleDraftV1Repo'
import { buildCapabilityRuleSourceScopeIdV1 } from
  '../../src/next/generation-v2/model-facts/sourceScopeV1'
import { CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1 } from
  './capabilityRuleMaterializationSchedulerV1Service'
import { UserCapabilityRulesV1Service, UserCapabilityRulesV1ServiceError } from
  './userCapabilityRulesV1Service'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function subjects() {
  return buildAuthoritativeModelSubjectSetV1([{ subject: { providerAuthorityId: 'openai',
    endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' }, proof: {
    kind: 'provider_native_catalog' as const, providerKey: 'openai_responses', scopeId: 'scope:a',
    credentialScopeId: 'credential-scope-v2:test', credentialRevision: 1,
    endpointProfileId: 'openai-default', operationContractId: 'openai-models-v1', catalogCategory: '',
    activeSnapshotDigest: 'a'.repeat(64),
  } }])
}

function rule(ruleId = 'rule.user', configured: 'default' | 'on' | 'off' = 'default') {
  return { ruleId, label: null, description: null, priority: 0, configured,
    providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
    selector: { kind: 'exact' as const, nativeModelIds: ['gpt-test'] },
    assertion: { path: 'reasoning.support' as const,
      value: { kind: 'support' as const, value: 'supported' as const } }, evidence: null }
}

function pack(packId = 'pack.user', rules = [rule()]) {
  return { schemaVersion: 1 as const, packId, displayName: 'User Pack', description: null,
    priority: 0, mode: 'no_control' as const, target: 'enabled' as const, rules }
}

describe('UserCapabilityRulesV1Service', () => {
  it('creates an ordinary first Pack in the draft and atomically saves one User source', async () => {
    const db = database()
    try {
      const set = subjects()
      const service = new UserCapabilityRulesV1Service(db, { readCurrent: async () => set }, () => 20)
      const opened = service.openDraft({ sessionId: 'session.one' })
      const changed = service.addRule({ expectedDraftRevision: opened.draftRevision,
        targetPackId: null, firstPack: { packId: 'pack.generated', displayName: 'My Rules' },
        rule: rule(), note: 'Local verification' })
      expect(changed.projected.definition.packs[0]).toMatchObject({ packId: 'pack.generated',
        displayName: 'My Rules', priority: 0, mode: 'no_control', target: 'enabled' })
      const saved = await service.saveDraft({ sessionId: changed.sessionId,
        expectedDraftRevision: changed.draftRevision })
      expect(saved.snapshotRevision).toMatch(/^capability-rule-owner-snapshot-v1:/u)
      expect(new UserCapabilityRuleDraftV1Repo(db).readDraft()).toBeNull()
      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'user',
        ownerId: 'local-user' })?.projected.definition.packs[0]?.packId).toBe('pack.generated')
      expect(new UserCapabilityRuleDraftV1Repo(db).readCommittedNotes().notes).toEqual([
        { ruleId: 'rule.user', note: 'Local verification' },
      ])
    } finally { db.close() }
  })

  it('keeps committed authority unchanged and preserves the draft when publication fails', async () => {
    const db = database()
    try {
      const set = subjects()
      const service = new UserCapabilityRulesV1Service(db, { readCurrent: async () => set }, () => 20)
      const opened = service.openDraft({ sessionId: 'session.one' })
      const changed = service.addRule({ expectedDraftRevision: opened.draftRevision,
        targetPackId: null, firstPack: { packId: 'pack.user', displayName: 'User Pack' }, rule: rule() })
      db.exec(`CREATE TRIGGER user_rules_save_test_abort
        BEFORE DELETE ON user_capability_rule_editing_session_v1
        BEGIN SELECT RAISE(ABORT, 'TEST_USER_SAVE_ABORT'); END`)
      await expect(service.saveDraft({ sessionId: changed.sessionId,
        expectedDraftRevision: changed.draftRevision })).rejects.toThrow('TEST_USER_SAVE_ABORT')
      expect(new UserCapabilityRuleDraftV1Repo(db).readDraft()?.draftRevision).toBe(changed.draftRevision)
      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'user',
        ownerId: 'local-user' })).toBeNull()
      expect(new CanonicalModelFactSourceV1Repo(db).readSourceState('capability_rule',
        buildCapabilityRuleSourceScopeIdV1({
          ruleStoreId: CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
        }))).toBeNull()
    } finally { db.close() }
  })

  it('imports by whole-Pack replacement, blocks dirty export, then exports committed content', async () => {
    const db = database()
    try {
      const set = subjects()
      const service = new UserCapabilityRulesV1Service(db, { readCurrent: async () => set }, () => 20)
      const opened = service.openDraft({ sessionId: 'session.one' })
      const imported = createUserRulePackTransferV1({ pack: pack('pack.user', [rule('rule.imported', 'on')]),
        notes: [{ ruleId: 'rule.imported', note: 'Imported' }] })
      const changed = service.importPack({ expectedDraftRevision: opened.draftRevision, transfer: imported })
      expect(() => service.exportCommittedPack({ packId: 'pack.user' })).toThrowError(
        new UserCapabilityRulesV1ServiceError('GENERATION_V2_USER_CAPABILITY_RULES_EXPORT_DIRTY'))
      await service.saveDraft({ sessionId: changed.sessionId, expectedDraftRevision: changed.draftRevision })
      expect(service.exportCommittedPack({ packId: 'pack.user' })).toEqual(imported)

      const reopened = service.openDraft({ sessionId: 'session.two' })
      const replacement = createUserRulePackTransferV1({ pack: pack('pack.user', [rule('rule.replaced')]) })
      const replaced = service.importPack({ expectedDraftRevision: reopened.draftRevision,
        transfer: replacement })
      expect(replaced.projected.definition.packs[0]?.rules.map((entry) => entry.ruleId))
        .toEqual(['rule.replaced'])
      expect(replaced.notes).toEqual([])
    } finally { db.close() }
  })

  it('uses shared Rewrite semantics only in the draft and Cancel restores committed state', async () => {
    const db = database()
    try {
      const core = new CapabilityRuleCoreV1Repo(db)
      const committedSnapshot = { schemaVersion: 1 as const, ownership: 'user' as const,
        ownerId: 'local-user', packs: [{ ...pack('pack.user', [rule('rule.default'), rule('rule.on', 'on')]),
          mode: 'default_only' as const, target: 'disabled' as const }] }
      core.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: committedSnapshot })
      const set = subjects()
      const service = new UserCapabilityRulesV1Service(db, { readCurrent: async () => set })
      const opened = service.openDraft({ sessionId: 'session.one' })
      const rewritten = service.rewritePack({ expectedDraftRevision: opened.draftRevision,
        packId: 'pack.user' })
      expect(rewritten.projected.definition.packs[0]?.rules.map((entry) => entry.configured))
        .toEqual(['off', 'on'])
      expect(core.readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })
        ?.projected.definition.packs[0]?.rules.map((entry) => entry.configured)).toEqual(['default', 'on'])
      service.cancelDraft({ expectedDraftRevision: rewritten.draftRevision })
      expect(new UserCapabilityRuleDraftV1Repo(db).readDraft()).toBeNull()
    } finally { db.close() }
  })

  it('commits note-only edits without changing the canonical Capability Rules source revision', async () => {
    const db = database()
    try {
      const set = subjects()
      const service = new UserCapabilityRulesV1Service(db, { readCurrent: async () => set }, () => 20)
      const opened = service.openDraft({ sessionId: 'session.one' })
      const changed = service.addRule({ expectedDraftRevision: opened.draftRevision,
        targetPackId: null, firstPack: { packId: 'pack.user', displayName: 'User Pack' },
        rule: rule(), note: 'First note' })
      const first = await service.saveDraft({ sessionId: changed.sessionId,
        expectedDraftRevision: changed.draftRevision })

      const reopened = service.openDraft({ sessionId: 'session.two' })
      const noteOnly = service.replaceDraft({ expectedDraftRevision: reopened.draftRevision,
        snapshot: reopened.projected.definition, notes: [{ ruleId: 'rule.user', note: 'Updated note' }] })
      const second = await service.saveDraft({ sessionId: noteOnly.sessionId,
        expectedDraftRevision: noteOnly.draftRevision })
      const scope = buildCapabilityRuleSourceScopeIdV1({
        ruleStoreId: CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
      })

      expect(second.canonicalSourceRevision).toBe(first.canonicalSourceRevision)
      expect(new CanonicalModelFactSourceV1Repo(db).readSourceState('capability_rule', scope)
        ?.currentSourceRevision).toBe(first.canonicalSourceRevision)
      expect(new UserCapabilityRuleDraftV1Repo(db).readCommittedNotes().notes).toEqual([
        { ruleId: 'rule.user', note: 'Updated note' },
      ])
    } finally { db.close() }
  })

  it('cancels a draft without changing the active canonical Capability Rules source', async () => {
    const db = database()
    try {
      const set = subjects()
      const service = new UserCapabilityRulesV1Service(db, { readCurrent: async () => set }, () => 20)
      const opened = service.openDraft({ sessionId: 'session.one' })
      const changed = service.addRule({ expectedDraftRevision: opened.draftRevision,
        targetPackId: null, firstPack: { packId: 'pack.user', displayName: 'User Pack' }, rule: rule() })
      const saved = await service.saveDraft({ sessionId: changed.sessionId,
        expectedDraftRevision: changed.draftRevision })
      const draft = service.openDraft({ sessionId: 'session.two' })
      const edited = service.replaceDraft({ expectedDraftRevision: draft.draftRevision,
        snapshot: { ...draft.projected.definition, packs: draft.projected.definition.packs.map((pack) =>
          pack.packId === 'pack.user' ? { ...pack, priority: 10 } : pack) }, notes: draft.notes })
      service.cancelDraft({ expectedDraftRevision: edited.draftRevision })
      const scope = buildCapabilityRuleSourceScopeIdV1({
        ruleStoreId: CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
      })

      expect(new CanonicalModelFactSourceV1Repo(db).readSourceState('capability_rule', scope)
        ?.currentSourceRevision).toBe(saved.canonicalSourceRevision)
      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'user',
        ownerId: 'local-user' })?.projected.definition.packs[0]?.rules[0]?.configured).toBe('default')
    } finally { db.close() }
  })
})

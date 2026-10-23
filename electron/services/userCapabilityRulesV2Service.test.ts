import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { readGenerationRequestRulesV2 } from '../../infra/db/repo/generationRequestRulesV2Repo'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { CapabilityRuleCoreV2Repo } from '../../infra/db/repo/capabilityRuleCoreV2Repo'
import { UserCapabilityRuleDraftV1Repo } from '../../infra/db/repo/userCapabilityRuleDraftV1Repo'
import { CloudRulesApplicationV1Repo } from '../../infra/db/repo/cloudRulesApplicationV1Repo'
import { createUserRulePackTransferV2 } from '../../src/core/generation-v2/capability-rules/userRulePackTransferV2'
import { createUserRulePackTransferV1 } from '../../src/core/generation-v2/capability-rules/userRulePackTransferV1'
import { migrateCapabilityRuleOwnershipSnapshotV1ToV2 } from '../../src/core/generation-v2/capability-rules/capabilityRuleCoreV2'
import { buildAuthoritativeModelSubjectSetV1 } from
  '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { UserCapabilityRulesV1Service } from './userCapabilityRulesV1Service'
import { UserCapabilityRulesV2Service } from './userCapabilityRulesV2Service'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function subjects() {
  return buildAuthoritativeModelSubjectSetV1([{ subject: { providerAuthorityId: 'openai',
    endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' }, proof: {
    kind: 'provider_native_catalog' as const, providerKey: 'openai_responses', scopeId: 'scope:test',
    credentialScopeId: 'credential-scope-v2:test', credentialRevision: 1,
    endpointProfileId: 'openai-default', operationContractId: 'openai-models-v1', catalogCategory: '',
    activeSnapshotDigest: 'a'.repeat(64),
  } }])
}

function v2Rule() {
  return { ruleId: 'rule.reasoning-v2', label: null, description: null, priority: 8,
    configured: 'default' as const, providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
    selector: { kind: 'exact' as const, nativeModelIds: ['gpt-test'] }, evidence: null,
    category: 'reasoning' as const, when: { kind: 'eq' as const, path: 'target.protocolContractId' as const, value: 'openai-models-v1' },
    effect: { kind: 'registered_operation' as const, operationId: 'reasoning_openai' as const,
      parameters: { samplingBehavior: 'preserve' as const } }, decisionKey: 'reasoning.effort', dependencies: [],
  }
}

function legacyRule(ruleId = 'legacy.rule', configured: 'default' | 'on' | 'off' = 'off', priority = 41) {
  return { ruleId, label: 'Legacy label', description: 'Legacy description', priority, configured,
    providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
    selector: { kind: 'exact' as const, nativeModelIds: ['gpt-test'] },
    assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }, evidence: null }
}

function legacyUserSnapshot() {
  return { schemaVersion: 1 as const, ownership: 'user' as const, ownerId: 'local-user', packs: [{
    schemaVersion: 1 as const, packId: 'legacy.user.pack', displayName: 'Legacy user pack',
    description: 'Legacy pack description', priority: 7, mode: 'override' as const, target: 'enabled' as const,
    rules: [legacyRule()],
  }] }
}

function legacyCloudSnapshot(ownerId: string) {
  return { schemaVersion: 1 as const, ownership: 'cloud' as const, ownerId, packs: [{
    schemaVersion: 1 as const, packId: ownerId, displayName: ownerId, description: null,
    priority: 19, mode: 'no_control' as const, target: 'enabled' as const,
    rules: [legacyRule(`${ownerId}.fact`, 'off', 33)],
  }] }
}

function v2EmptyPack(packId: string) {
  return { schemaVersion: 2 as const, packId, displayName: packId, description: null,
    priority: 0, mode: 'no_control' as const, target: 'enabled' as const,
    rules: [{ ...v2Rule(), ruleId: `migration.${packId}`, decisionKey: `migration.${packId}` }] }
}

const RESERVED_CLOUD = ['bundled-anthropic-thinking-v2', 'bundled-gemini-thinking-v2',
  'bundled-openai-responses-thinking-v2'] as const

describe('UserCapabilityRulesV2Service', () => {
  it.each([false, true])('imports a legacy file into V2 without losing rules or notes (same pack: %s)', async samePack => {
    const db = database()
    try {
      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 20)
      const first = service.openDraft({ sessionId: 'v2-existing' })
      const packId = samePack ? 'legacy.user.pack' : 'pack.reasoning'
      const added = service.addRule({ sessionId: first.sessionId, expectedDraftRevision: first.draftRevision,
        targetPackId: null, firstPack: { packId, displayName: 'Reasoning' }, rule: v2Rule(), note: 'Keep advanced note' })
      await service.saveDraft({ sessionId: added.sessionId, expectedDraftRevision: added.draftRevision })
      const before = service.readCommitted().snapshot!.projected
      const draft = service.openDraft({ sessionId: 'v2-import-legacy' })
      const transfer = createUserRulePackTransferV1({ pack: legacyUserSnapshot().packs[0],
        notes: [{ ruleId: 'legacy.rule', note: 'Imported legacy note' }] })
      const imported = service.importPack({ sessionId: draft.sessionId, expectedDraftRevision: draft.draftRevision, transfer })
      expect(service.readCommitted().snapshot!.projected.snapshotRevision).toBe(before.snapshotRevision)
      expect(imported.projected.definition.packs).toHaveLength(samePack ? 1 : 2)
      expect(imported.projected.definition.packs.find(pack => pack.packId === packId)!.rules.find(rule => rule.ruleId === v2Rule().ruleId)).toMatchObject(v2Rule())
      expect(imported.projected.definition.packs.find(pack => pack.packId === 'legacy.user.pack')!.rules.find(rule => rule.ruleId === 'legacy.rule')).toMatchObject({ ruleId: 'legacy.rule', configured: 'off',
        category: 'reasoning', effect: { kind: 'fact_assertion', path: 'reasoning.support' } })
      await service.saveDraft({ sessionId: imported.sessionId, expectedDraftRevision: imported.draftRevision })
      expect(service.readCommitted().snapshot!.projected.definition.packs).toHaveLength(samePack ? 1 : 2)
      expect(service.readCommitted().notes.notes).toContainEqual({ ruleId: 'legacy.rule', note: 'Imported legacy note' })
      expect(service.readCommitted().notes.notes).toContainEqual({ ruleId: v2Rule().ruleId, note: 'Keep advanced note' })
      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })).toBeNull()
    } finally { db.close() }
  })
  it('rejects a legacy rule that would replace an advanced rule with the same identity', async () => {
    const db = database()
    try {
      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() })
      const opened = service.openDraft({ sessionId: 'same-rule-id' })
      const added = service.addRule({ sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision,
        targetPackId: null, firstPack: { packId: 'legacy.user.pack', displayName: 'Advanced' }, rule: v2Rule() })
      const transfer = createUserRulePackTransferV1({ pack: { ...legacyUserSnapshot().packs[0]!,
        rules: [legacyRule(v2Rule().ruleId)] } })
      expect(() => service.importPack({ sessionId: added.sessionId, expectedDraftRevision: added.draftRevision, transfer }))
        .toThrow('GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION')
      expect(service.readDraft()!.draftRevision).toBe(added.draftRevision)
      expect(service.readDraft()!.projected.definition.packs[0]!.rules[0]).toMatchObject(v2Rule())
    } finally { db.close() }
  })
  it('keeps both sources intact when a mixed legacy database contains conflicting rule identities', async () => {
    const db = database()
    try {
      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() })
      const opened = service.openDraft({ sessionId: 'mixed-first' })
      const added = service.addRule({ sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision,
        targetPackId: null, firstPack: { packId: 'legacy.user.pack', displayName: 'Advanced' }, rule: v2Rule() })
      await service.saveDraft({ sessionId: added.sessionId, expectedDraftRevision: added.draftRevision })
      const legacy = new CapabilityRuleCoreV1Repo(db)
      legacy.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: { ...legacyUserSnapshot(),
        packs: [{ ...legacyUserSnapshot().packs[0]!, rules: [legacyRule(v2Rule().ruleId)] }] } })
      expect(() => service.openDraft({ sessionId: 'mixed-conflict' })).toThrow('GENERATION_V2_USER_CAPABILITY_RULES_IDENTITY_COLLISION')
      expect(legacy.readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })).not.toBeNull()
      expect(service.readCommitted().snapshot).not.toBeNull()
      expect(service.readDraft()).toBeNull()
    } finally { db.close() }
  })
  it('blocks a stale V1 writer while V2 has a recoverable draft and unlocks it after cancel', async () => {
    const db = database()
    try {
      const reader = { readCurrent: async () => subjects() }
      const legacy = new UserCapabilityRulesV1Service(db, reader)
      const opened = legacy.openDraft({ sessionId: 'legacy-writer' })
      const dirty = legacy.addRule({ sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision,
        targetPackId: null, firstPack: { packId: 'legacy.user.pack', displayName: 'Legacy' }, rule: legacyRule() as never })
      const service = new UserCapabilityRulesV2Service(db, reader)
      const v2 = service.openDraft({ sessionId: 'v2-writer' })
      await expect(legacy.saveDraft({ sessionId: dirty.sessionId, expectedDraftRevision: dirty.draftRevision }))
        .rejects.toThrow('GENERATION_V2_USER_CAPABILITY_RULES_STALE')
      expect(legacy.readDraft()!.draftRevision).toBe(dirty.draftRevision)
      service.cancelDraft({ sessionId: v2.sessionId, expectedDraftRevision: v2.draftRevision })
      await expect(legacy.saveDraft({ sessionId: dirty.sessionId, expectedDraftRevision: dirty.draftRevision })).resolves.toBeDefined()
    } finally { db.close() }
  })
  it('bootstraps from a dirty V1 draft, keeps legacy state on cancel, and preserves user settings on same-pack import', async () => {
    const db = database()
    try {
      const legacyCore = new CapabilityRuleCoreV1Repo(db, () => 10)
      const legacyDrafts = new UserCapabilityRuleDraftV1Repo(db, () => 10)
      const committed = legacyCore.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
        snapshot: legacyUserSnapshot() }).projected.definition
      legacyDrafts.replaceCommittedNotes({ expectedRevision: 0,
        notes: [{ ruleId: 'legacy.rule', note: 'committed note' }], committedSnapshot: committed })
      const openedLegacy = legacyDrafts.openOrCreate({ sessionId: 'legacy-session' })
      const legacyDraftSnapshot = { ...openedLegacy.projected.definition, packs: openedLegacy.projected.definition.packs.map(pack => ({
        ...pack, priority: 13, rules: pack.rules.map(rule => ({ ...rule, configured: 'on' as const, priority: 52 })) })) }
      const dirtyLegacy = legacyDrafts.replaceDraft({ expectedDraftRevision: openedLegacy.draftRevision,
        snapshot: legacyDraftSnapshot, notes: [{ ruleId: 'legacy.rule', note: 'unsaved legacy note' }] })
      expect(dirtyLegacy.dirty).toBe(true)

      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 20)
      const opened = service.openDraft({ sessionId: 'v2-migration-session' })
      const migratedPack = opened.projected.definition.packs[0]!
      expect(opened.legacyV1Source?.draft).toMatchObject({ sessionId: 'legacy-session',
        draftRevision: dirtyLegacy.draftRevision, dirty: true })
      expect(migratedPack).toMatchObject({ packId: 'legacy.user.pack', priority: 13 })
      expect(migratedPack.rules[0]).toMatchObject({ ruleId: 'legacy.rule', configured: 'on', priority: 52 })
      expect(opened.notes).toEqual([{ ruleId: 'legacy.rule', note: 'unsaved legacy note' }])

      const importedSource = migrateCapabilityRuleOwnershipSnapshotV1ToV2(dirtyLegacy.projected.definition)
        .packs[0]!
      const transfer = createUserRulePackTransferV2({ pack: { ...importedSource, priority: 0,
        mode: 'no_control', rules: importedSource.rules.map(rule => ({ ...rule, configured: 'default', priority: 0,
          label: 'Imported label' })) }, notes: [] })
      const imported = service.importPack({ sessionId: opened.sessionId,
        expectedDraftRevision: opened.draftRevision, transfer })
      expect(imported.projected.definition.packs[0]).toMatchObject({ priority: 13, mode: 'override' })
      expect(imported.projected.definition.packs[0]!.rules[0]).toMatchObject({
        configured: 'on', priority: 52, label: 'Legacy label',
      })
      expect(imported.notes).toEqual([{ ruleId: 'legacy.rule', note: 'unsaved legacy note' }])

      service.cancelDraft({ sessionId: imported.sessionId, expectedDraftRevision: imported.draftRevision })
      expect(legacyDrafts.readDraft()).toMatchObject({ sessionId: 'legacy-session',
        draftRevision: dirtyLegacy.draftRevision, dirty: true, draftContentDigest: dirtyLegacy.draftContentDigest })
      expect(legacyCore.readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })
        ?.projected.snapshotRevision).toBe(dirtyLegacy.baseSnapshotRevision)
      expect(legacyDrafts.readCommittedNotes().notes).toEqual([{ ruleId: 'legacy.rule', note: 'committed note' }])
    } finally { db.close() }
  })

  it('retires V1 User snapshot, notes, and dirty draft only after V2 save commits the migrated values', async () => {
    const db = database()
    try {
      const legacyCore = new CapabilityRuleCoreV1Repo(db, () => 10)
      const legacyDrafts = new UserCapabilityRuleDraftV1Repo(db, () => 10)
      const committed = legacyCore.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
        snapshot: legacyUserSnapshot() }).projected.definition
      legacyDrafts.replaceCommittedNotes({ expectedRevision: 0,
        notes: [{ ruleId: 'legacy.rule', note: 'committed note' }], committedSnapshot: committed })
      const openedLegacy = legacyDrafts.openOrCreate({ sessionId: 'legacy-session' })
      const dirtyLegacy = legacyDrafts.replaceDraft({ expectedDraftRevision: openedLegacy.draftRevision,
        snapshot: { ...openedLegacy.projected.definition, packs: openedLegacy.projected.definition.packs.map(pack => ({
          ...pack, rules: pack.rules.map(rule => ({ ...rule, configured: 'on' as const, priority: 52 })) })) },
        notes: [{ ruleId: 'legacy.rule', note: 'unsaved legacy note' }] })
      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 20)
      const opened = service.openDraft({ sessionId: 'v2-migration-session' })
      const saved = await service.saveDraft({ sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision })

      expect(saved.snapshotRevision).toContain('capability-rule-owner-snapshot-v2:')
      expect(legacyCore.readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })).toBeNull()
      expect(legacyDrafts.readDraft()).toBeNull()
      expect(legacyDrafts.readCommittedNotes().notes).toEqual([])
      expect(legacyDrafts.readCommittedNotes().revision).toBeGreaterThan(0)
      expect(new CapabilityRuleCoreV2Repo(db).readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })
        ?.projected.definition.packs[0]!.rules[0]).toMatchObject({ configured: 'on', priority: 52 })
      expect(new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 21)
        .readCommitted().notes.notes).toEqual([{ ruleId: 'legacy.rule', note: 'unsaved legacy note' }])
      expect(dirtyLegacy.dirty).toBe(true)
    } finally { db.close() }
  })

  it('rejects a stale V1 source baseline without deleting the original draft or owner', async () => {
    const db = database()
    try {
      const legacyCore = new CapabilityRuleCoreV1Repo(db, () => 10)
      const legacyDrafts = new UserCapabilityRuleDraftV1Repo(db, () => 10)
      legacyCore.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: legacyUserSnapshot() })
      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 20)
      const opened = service.openDraft({ sessionId: 'v2-migration-session' })
      const changedLegacyDraft = legacyDrafts.openOrCreate({ sessionId: 'concurrent-v1-session' })

      await expect(service.saveDraft({ sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision }))
        .rejects.toMatchObject({ code: 'GENERATION_V2_USER_CAPABILITY_RULES_STALE' })
      expect(legacyCore.readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })).not.toBeNull()
      expect(legacyDrafts.readDraft()).toMatchObject({ sessionId: changedLegacyDraft.sessionId,
        draftRevision: changedLegacyDraft.draftRevision, dirty: false })
      expect(service.readDraft()?.sessionId).toBe(opened.sessionId)
    } finally { db.close() }
  })

  it('copies existing reserved Cloud pack and rule priorities and activation into an explicitly imported V2 pack', () => {
    const db = database()
    try {
      const legacyCore = new CapabilityRuleCoreV1Repo(db, () => 10)
      const ownerId = RESERVED_CLOUD[1]
      const oldOwner = legacyCore.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
        snapshot: legacyCloudSnapshot(ownerId) }).projected.definition
      const migrated = migrateCapabilityRuleOwnershipSnapshotV1ToV2(oldOwner).packs[0]!
      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 20)
      const opened = service.openDraft({ sessionId: 'v2-cloud-settings' })
      const incoming = createUserRulePackTransferV2({ pack: { ...migrated, priority: 99,
        mode: 'override', target: 'disabled', rules: migrated.rules.map(rule => ({ ...rule,
          configured: 'default', priority: 0, label: 'generated label' })) } })
      const imported = service.importPack({ sessionId: opened.sessionId,
        expectedDraftRevision: opened.draftRevision, transfer: incoming })
      expect(imported.projected.definition.packs[0]).toMatchObject({ priority: 19,
        mode: 'no_control', target: 'enabled' })
      expect(imported.projected.definition.packs[0]!.rules[0]).toMatchObject({
        ruleId: `${ownerId}.fact`, configured: 'off', priority: 33, label: 'Legacy label',
      })
      expect(legacyCore.readOwnershipSnapshot({ ownership: 'cloud', ownerId })).not.toBeNull()
    } finally { db.close() }
  })

  it('retires all reserved fake Cloud owners only with the complete four-pack V2 migration set', async () => {
    for (const complete of [false, true]) {
      const db = database()
      try {
        const legacyCore = new CapabilityRuleCoreV1Repo(db, () => 10)
        for (const ownerId of [...RESERVED_CLOUD, 'official']) {
          legacyCore.replaceOwnershipSnapshot({ expectedSnapshotRevision: null,
            snapshot: legacyCloudSnapshot(ownerId) })
        }
        const cloudState = new CloudRulesApplicationV1Repo(db).readState()
        const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 20)
        const opened = service.openDraft({ sessionId: complete ? 'v2-complete' : 'v2-partial' })
        const packIds = complete
          ? [...RESERVED_CLOUD, 'reviewed-request-policy-v2']
          : RESERVED_CLOUD.slice(0, 2)
        const edited = service.replaceDraft({ sessionId: opened.sessionId,
          expectedDraftRevision: opened.draftRevision, snapshot: { schemaVersion: 2, ownership: 'user',
            ownerId: 'local-user', packs: packIds.map(v2EmptyPack) }, notes: [] })
        await service.saveDraft({ sessionId: edited.sessionId, expectedDraftRevision: edited.draftRevision })

        for (const ownerId of RESERVED_CLOUD) {
          expect(legacyCore.readOwnershipSnapshot({ ownership: 'cloud', ownerId }) !== null).toBe(!complete)
        }
        expect(legacyCore.readOwnershipSnapshot({ ownership: 'cloud', ownerId: 'official' })).not.toBeNull()
        expect(new CloudRulesApplicationV1Repo(db).readState()).toEqual(cloudState)
      } finally { db.close() }
    }
  })

  // R4-09 (P3a-07): one rule row that no longer decodes must not lock the user out of every save.
  it('saves the user rules although another owner row no longer decodes, and leaves that row in place', async () => {
    const db = database()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const cloud = { schemaVersion: 2 as const, ownership: 'cloud' as const, ownerId: 'cloud-extra', packs: [{
        ...v2EmptyPack('cloud-extra'), rules: [{ ...v2Rule(), ruleId: 'cloud.rule', decisionKey: 'cloud.decision' }] }] }
      new CapabilityRuleCoreV2Repo(db).replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: cloud })
      // The stored JSON is valid for the table's checks but carries a field a later decoder no longer accepts.
      db.prepare("UPDATE capability_rule_owner_snapshot_v2 SET snapshot_json=? WHERE owner_id='cloud-extra'").run(
        JSON.stringify({ schemaVersion: 2, ownership: 'cloud', ownerId: 'cloud-extra', packs: [], fieldFromAnOlderVersion: true }))
      expect(() => new CapabilityRuleCoreV2Repo(db).listOwnershipSnapshots()).toThrow()

      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 20)
      const opened = service.openDraft({ sessionId: 'session.bad-neighbour' })
      const edited = service.addRule({ sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision,
        targetPackId: null, firstPack: { packId: 'pack.reasoning', displayName: 'Reasoning' }, rule: v2Rule() })
      await service.saveDraft({ sessionId: edited.sessionId, expectedDraftRevision: edited.draftRevision })

      expect(service.readCommitted().snapshot?.projected.definition.packs[0]!.rules[0]!.ruleId).toBe('rule.reasoning-v2')
      expect(db.prepare("SELECT COUNT(*) AS n FROM capability_rule_owner_snapshot_v2 WHERE owner_id='cloud-extra'").get())
        .toEqual({ n: 1 })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('unreadable owner snapshots'),
        expect.objectContaining({ v2: [{ ownership: 'cloud', ownerId: 'cloud-extra' }] }))
    } finally { warn.mockRestore(); db.close() }
  })
  it('cancels a draft that no longer decodes, using only its identity', () => {
    const db = database()
    try {
      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 20)
      const opened = service.openDraft({ sessionId: 'session.unreadable' })
      db.prepare('UPDATE user_capability_rule_editing_session_v2 SET draft_snapshot_json=?').run(
        JSON.stringify({ schemaVersion: 2, ownership: 'user', ownerId: 'local-user', packs: [], fieldFromAnOlderVersion: true }))
      expect(() => service.readDraft()).toThrow()
      expect(() => service.cancelDraft({ sessionId: 'someone-else', expectedDraftRevision: opened.draftRevision }))
        .toThrow('GENERATION_V2_USER_CAPABILITY_RULES_STALE')
      expect(() => service.cancelDraft({ sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision + 1 }))
        .toThrow('GENERATION_V2_USER_CAPABILITY_RULES_STALE')
      service.cancelDraft({ sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision })
      expect(service.readDraft()).toBeNull()
      expect(service.openDraft({ sessionId: 'session.after' }).sessionId).toBe('session.after')
    } finally { db.close() }
  })

  it('saves typed request policies, publishes an exact subject bundle, and exports the committed V2 pack', async () => {
    const db = database()
    try {
      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 20)
      const opened = service.openDraft({ sessionId: 'session.v2' })
      const edited = service.addRule({ sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision,
        targetPackId: null, firstPack: { packId: 'pack.reasoning', displayName: 'Reasoning' },
        rule: v2Rule(), note: 'reviewed' })
      await service.saveDraft({ sessionId: edited.sessionId, expectedDraftRevision: edited.draftRevision })

      expect(new CapabilityRuleCoreV2Repo(db).readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })
        ?.projected.definition.packs[0]!.rules[0]!.effect.kind).toBe('registered_operation')
      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' }))
        .toBeNull()
      expect(readGenerationRequestRulesV2(db, { providerAuthorityId: 'openai',
        endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' }).rules[0]?.definition.ruleId)
        .toBe('rule.reasoning-v2')
      expect(service.exportCommittedPack({ packId: 'pack.reasoning' }).notes)
        .toEqual([{ ruleId: 'rule.reasoning-v2', note: 'reviewed' }])
    } finally { db.close() }
  })

  it('prevents the legacy V1 writer from replacing an installed V2 owner and its request rules', async () => {
    const db = database()
    try {
      const reader = { readCurrent: async () => subjects() }
      const v2 = new UserCapabilityRulesV2Service(db, reader, () => 20)
      const openedV2 = v2.openDraft({ sessionId: 'session.v2' })
      const editedV2 = v2.addRule({ sessionId: openedV2.sessionId,
        expectedDraftRevision: openedV2.draftRevision, targetPackId: null,
        firstPack: { packId: 'pack.reasoning', displayName: 'Reasoning' }, rule: v2Rule() })
      await v2.saveDraft({ sessionId: editedV2.sessionId, expectedDraftRevision: editedV2.draftRevision })

      const v1 = new UserCapabilityRulesV1Service(db, reader, () => 30)
      expect(() => v1.openDraft({ sessionId: 'session.v1' })).toThrow('GENERATION_V2_USER_CAPABILITY_RULES_STALE')

      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' }))
        .toBeNull()
      expect(new CapabilityRuleCoreV2Repo(db).readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' }))
        .not.toBeNull()
      expect(readGenerationRequestRulesV2(db, { providerAuthorityId: 'openai',
        endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' }).rules).toHaveLength(1)
    } finally { db.close() }
  })

  describe('P3a-08: cross-owner rule graphs are checked before a save becomes effective', () => {
    const crossRule = (ruleId: string, decisionKey: string, dependencies: string[], code: string) => ({ ...v2Rule(), ruleId,
      decisionKey, dependencies, effect: { kind: 'validation' as const, code,
        predicate: { kind: 'eq' as const, path: 'target.protocolContractId' as const, value: 'openai-models-v1' } } })
    const installCloud = (db: BetterSqlite3.Database, ...rules: ReturnType<typeof crossRule>[]) => {
      new CapabilityRuleCoreV2Repo(db).replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: {
        schemaVersion: 2, ownership: 'cloud', ownerId: 'official', packs: [{ schemaVersion: 2, packId: 'cloud.pack',
          displayName: 'Cloud', description: null, priority: 0, mode: 'no_control', target: 'enabled', rules }] } })
    }
    const saveUser = async (db: BetterSqlite3.Database, ...rules: ReturnType<typeof crossRule>[]) => {
      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects() }, () => 20)
      let draft = service.openDraft({ sessionId: 'session.cross-owner' })
      let targetPackId: string | null = null
      for (const rule of rules) {
        draft = service.addRule({ sessionId: draft.sessionId, expectedDraftRevision: draft.draftRevision,
          targetPackId, firstPack: targetPackId ? undefined : { packId: 'user.pack', displayName: 'User' }, rule } as never)
        targetPackId = 'user.pack'
      }
      return service.saveDraft({ sessionId: draft.sessionId, expectedDraftRevision: draft.draftRevision })
    }

    it('rejects a user rule that closes a dependency cycle with a cloud rule', async () => {
      const db = database()
      try {
        // Each owner is acyclic on its own; only the merged graph has cross.a -> cross.b -> cross.a.
        installCloud(db, crossRule('cloud.a', 'cross.a', ['cross.b'], 'CHECK_A'), crossRule('cloud.b', 'cross.b', [], 'CHECK_B'))
        await expect(saveUser(db, crossRule('user.a', 'cross.a', [], 'CHECK_A'),
          crossRule('user.b', 'cross.b', ['cross.a'], 'CHECK_B')))
          .rejects.toThrow('GENERATION_V2_RULE_DEPENDENCY_CYCLE')
        expect(new CapabilityRuleCoreV2Repo(db).readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })).toBeNull()
      } finally { db.close() }
    })

    it('rejects an equal-priority user rule whose effect conflicts with a cloud rule under the same condition', async () => {
      const db = database()
      try {
        installCloud(db, crossRule('cloud.rule', 'cross.same', [], 'CLOUD_CHECK'))
        await expect(saveUser(db, crossRule('user.rule', 'cross.same', [], 'USER_CHECK')))
          .rejects.toThrow('GENERATION_V2_RULE_STATIC_CONFLICT')
        expect(new CapabilityRuleCoreV2Repo(db).readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })).toBeNull()
      } finally { db.close() }
    })
  })
})

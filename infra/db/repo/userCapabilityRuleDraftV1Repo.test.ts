import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import type { CapabilityRuleOwnershipSnapshotV1 } from
  '../../../src/next/generation-v2/capability-rules/capabilityRuleCoreV1'
import { CapabilityRuleCoreV1Repo } from './capabilityRuleCoreV1Repo'
import { UserCapabilityRuleDraftV1Repo, UserCapabilityRuleDraftV1RepoError } from
  './userCapabilityRuleDraftV1Repo'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function snapshot(): CapabilityRuleOwnershipSnapshotV1 {
  return { schemaVersion: 1, ownership: 'user', ownerId: 'local-user', packs: [{ schemaVersion: 1,
    packId: 'pack.user', displayName: 'User Pack', description: null, priority: 0,
    mode: 'no_control', target: 'enabled', rules: [{ ruleId: 'rule.user', label: null,
      description: null, priority: 0, configured: 'default', providerAuthorityId: 'openai',
      endpointProfileId: 'openai-default', selector: { kind: 'exact', nativeModelIds: ['gpt-test'] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      evidence: null }] }] }
}

describe('UserCapabilityRuleDraftV1Repo', () => {
  it('recovers a durable draft after closing and reopening the database', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-user-rule-draft-'))
    const databasePath = path.join(directory, 'epoch-2.db')
    let db = new BetterSqlite3(databasePath)
    try {
      applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
      let now = 10
      const repo = new UserCapabilityRuleDraftV1Repo(db, () => now)
      const opened = repo.openOrCreate({ sessionId: 'session.one' })
      expect(opened).toMatchObject({ draftRevision: 1, baseSnapshotRevision: null, dirty: false })
      now = 20
      const changed = repo.replaceDraft({ expectedDraftRevision: 1, snapshot: snapshot(),
        notes: [{ ruleId: 'rule.user', note: 'Local evidence' }] })
      expect(changed).toMatchObject({ draftRevision: 2, dirty: true,
        notes: [{ ruleId: 'rule.user', note: 'Local evidence' }] })
      db.close()
      db = new BetterSqlite3(databasePath)
      expect(new UserCapabilityRuleDraftV1Repo(db).openOrCreate({ sessionId: 'ignored.new' }))
        .toEqual(changed)
      expect(new CapabilityRuleCoreV1Repo(db).readOwnershipSnapshot({ ownership: 'user',
        ownerId: 'local-user' })).toBeNull()
    } finally {
      db.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('stale-fails draft writes and discard leaves committed Rules unchanged', () => {
    const db = database()
    try {
      const core = new CapabilityRuleCoreV1Repo(db)
      const committed = core.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: snapshot() })
      const repo = new UserCapabilityRuleDraftV1Repo(db)
      const draft = repo.openOrCreate({ sessionId: 'session.one' })
      const changed = repo.replaceDraft({ expectedDraftRevision: draft.draftRevision,
        snapshot: { ...snapshot(), packs: [] }, notes: [] })
      expect(() => repo.replaceDraft({ expectedDraftRevision: draft.draftRevision,
        snapshot: snapshot(), notes: [] })).toThrowError(new UserCapabilityRuleDraftV1RepoError(
        'GENERATION_V2_USER_CAPABILITY_RULE_DRAFT_STALE'))
      repo.discard({ expectedDraftRevision: changed.draftRevision })
      expect(repo.readDraft()).toBeNull()
      expect(core.readOwnershipSnapshot({ ownership: 'user', ownerId: 'local-user' })
        ?.projected.snapshotRevision).toBe(committed.projected.snapshotRevision)
    } finally { db.close() }
  })

  it('replaces committed notes by exact Rule identity inside an outer transaction', () => {
    const db = database()
    try {
      const core = new CapabilityRuleCoreV1Repo(db)
      core.replaceOwnershipSnapshot({ expectedSnapshotRevision: null, snapshot: snapshot() })
      const repo = new UserCapabilityRuleDraftV1Repo(db, () => 10)
      db.transaction(() => {
        const notes = repo.replaceCommittedNotes({ expectedRevision: 0,
          committedSnapshot: snapshot(), notes: [{ ruleId: 'rule.user', note: 'Evidence' }] })
        expect(notes).toMatchObject({ revision: 1,
          notes: [{ ruleId: 'rule.user', note: 'Evidence' }] })
      }).immediate()
      expect(repo.readCommittedNotes().notes).toEqual([{ ruleId: 'rule.user', note: 'Evidence' }])
    } finally { db.close() }
  })
})

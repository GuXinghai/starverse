import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2Schema } from '../v2/schemaComposerV2'
import {
  GenerationConfigV2Repo,
  isGenerationConfigScopeRepositoryFactV2,
  isResolvedGenerationConfigAuthorityV2,
} from './generationConfigV2Repo'

const root = path.resolve(process.cwd())

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, root)
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  return db
}

describe('GenerationConfigV2Repo', () => {
  it('creates the exact three scope rows and issues only repository-backed resolved authority', () => {
    const db = createDb()
    try {
      const rows = db.prepare(`SELECT owner_kind, owner_id, revision_generation, semantic_json
        FROM generation_config_v2 ORDER BY CASE owner_kind
          WHEN 'global' THEN 1 WHEN 'project' THEN 2 ELSE 3 END`).all()
      expect(rows).toEqual([
        { owner_kind: 'global', owner_id: 'global', revision_generation: 1, semantic_json: '{"schemaVersion":2}' },
        { owner_kind: 'project', owner_id: 'project:1', revision_generation: 1, semantic_json: '{"schemaVersion":2}' },
        { owner_kind: 'conversation', owner_id: 'conversation:1', revision_generation: 1, semantic_json: '{"schemaVersion":2}' },
      ])
      const repo = new GenerationConfigV2Repo(db)
      const global = repo.getScope('global', 'global')
      expect(isGenerationConfigScopeRepositoryFactV2(global)).toBe(true)
      expect(isGenerationConfigScopeRepositoryFactV2({ ...global })).toBe(false)
      const authority = repo.resolveForConversation('conversation:1')
      expect(isResolvedGenerationConfigAuthorityV2(authority)).toBe(true)
      expect(isResolvedGenerationConfigAuthorityV2({ ...authority })).toBe(false)
      expect(authority.revisionSet.map((entry) => entry.ownerKind)).toEqual(['global', 'project', 'conversation'])
      expect(authority.semanticIntent).toEqual({
        schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
        image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
        providerExtension: { kind: 'none' },
      })
    } finally { db.close() }
  })

  it('uses monotonic CAS, treats same canonical value idempotently, and rejects stale writes', () => {
    const db = createDb()
    try {
      let now = 10
      const repo = new GenerationConfigV2Repo(db, () => now)
      const current = repo.getScope('project', 'project:1')
      const updated = repo.compareAndSetScope('project', 'project:1', current.configRevision.value, {
        schemaVersion: 2,
        generation: { temperature: 0.5 },
        reasoning: { mode: 'enabled', effort: 'high' },
      })
      expect(updated.revisionGeneration).toBe(2)
      expect(updated.updatedAtMs).toBe(10)
      now = 11
      const replay = repo.compareAndSetScope('project', 'project:1', updated.configRevision.value, {
        reasoning: { effort: 'high', mode: 'enabled' },
        generation: { temperature: 0.5 },
        schemaVersion: 2,
      })
      expect(replay.configRevision.value).toBe(updated.configRevision.value)
      expect(replay.updatedAtMs).toBe(10)
      expect(() => repo.compareAndSetScope('project', 'project:1', current.configRevision.value, {
        schemaVersion: 2,
      })).toThrow('GENERATION_V2_CONFIG_STALE_REVISION')
    } finally { db.close() }
  })

  it('resolves fixed precedence with top-level replacement and validates the submitted revision set', () => {
    const db = createDb()
    try {
      const repo = new GenerationConfigV2Repo(db, () => 20)
      const global = repo.getScope('global', 'global')
      repo.compareAndSetScope('global', 'global', global.configRevision.value, {
        schemaVersion: 2,
        generation: { temperature: 0.8, topP: 0.9 },
        reasoning: { mode: 'enabled', effort: 'medium' },
      })
      const project = repo.getScope('project', 'project:1')
      repo.compareAndSetScope('project', 'project:1', project.configRevision.value, {
        schemaVersion: 2,
        generation: {},
        reasoning: { mode: 'enabled', summary: 'concise' },
      })
      const conversation = repo.getScope('conversation', 'conversation:1')
      repo.compareAndSetScope('conversation', 'conversation:1', conversation.configRevision.value, {
        schemaVersion: 2,
        reasoning: { mode: 'disabled' },
      })
      const authority = repo.resolveForConversation('conversation:1')
      expect(authority.semanticIntent.generation).toEqual({})
      expect(authority.semanticIntent.reasoning).toEqual({ mode: 'disabled' })
      const expected = authority.revisionSet.map((entry) => ({
        ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value,
      }))
      expect(repo.resolveForConversation('conversation:1', expected).revisionSet).toEqual(authority.revisionSet)
      expected[1] = { ...expected[1], revision: 'config-v2:stale' }
      expect(() => repo.resolveForConversation('conversation:1', expected))
        .toThrow('GENERATION_V2_CONFIG_STALE_REVISION')
      const accessor = [...expected]
      const staleRevision = accessor[1].revision
      Object.defineProperty(accessor[1], 'revision', { enumerable: true, get: () => staleRevision })
      expect(() => repo.resolveForConversation('conversation:1', accessor))
        .toThrow('GENERATION_V2_CONFIG_STALE_REVISION')
    } finally { db.close() }
  })

  it('forbids scope attachments, direct deletion, invalid owners and preserves parent cascade', () => {
    const db = createDb()
    try {
      const repo = new GenerationConfigV2Repo(db)
      const current = repo.getScope('conversation', 'conversation:1')
      expect(() => repo.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, attachments: [],
      })).toThrow('GENERATION_V2_CONFIG_ATTACHMENTS_NOT_SCOPE_CONFIG')
      expect(() => db.prepare("DELETE FROM generation_config_v2 WHERE owner_kind='project'").run())
        .toThrow('GENERATION_V2_CONFIG_ROW_REQUIRED')
      expect(() => repo.getScope('unknown' as never, 'project:1'))
        .toThrow('GENERATION_V2_CONFIG_OWNER_INVALID')
      expect(() => db.prepare(`INSERT INTO generation_config_v2 VALUES (
        'project', 'missing', 'missing', NULL, 1,
        'config-v2:1:bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f',
        '{"schemaVersion":2}', 'bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f', 0, 0
      )`).run()).toThrow(/FOREIGN KEY constraint failed/u)
      db.prepare("DELETE FROM project_v2 WHERE project_id='project:1'").run()
      expect(db.prepare("SELECT count(*) AS count FROM generation_config_v2").get()).toEqual({ count: 1 })
    } finally { db.close() }
  })

  it('fails closed on non-canonical or exhausted persisted rows', () => {
    const db = createDb()
    try {
      const repo = new GenerationConfigV2Repo(db)
      db.exec('DROP TRIGGER trg_generation_config_v2_update_guard; PRAGMA ignore_check_constraints = ON;')
      db.prepare(`UPDATE generation_config_v2 SET semantic_json = ?, semantic_hash = ?,
        config_revision = ? WHERE owner_kind='project'`).run(
        '{ "schemaVersion": 2 }',
        '0'.repeat(64),
        `config-v2:1:${'0'.repeat(64)}`,
      )
      expect(() => repo.getScope('project', 'project:1')).toThrow('GENERATION_V2_CONFIG_STATE_INVALID')

      db.prepare(`UPDATE generation_config_v2 SET semantic_json = ?, semantic_hash = ?,
        revision_generation = ?, config_revision = ? WHERE owner_kind='conversation'`).run(
        '{"schemaVersion":2}',
        'bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f',
        Number.MAX_SAFE_INTEGER,
        `config-v2:${Number.MAX_SAFE_INTEGER}:bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f`,
      )
      const exhausted = repo.getScope('conversation', 'conversation:1')
      expect(() => repo.compareAndSetScope(
        'conversation', 'conversation:1', exhausted.configRevision.value,
        { schemaVersion: 2, reasoning: { mode: 'disabled' } },
      )).toThrow('GENERATION_V2_CONFIG_REVISION_EXHAUSTED')
    } finally { db.close() }
  })

  it('serializes cross-connection writers and normalizes stale or locked CAS', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-config-v2-'))
    const file = path.join(directory, 'starverse.db')
    const first = new BetterSqlite3(file)
    const second = new BetterSqlite3(file)
    try {
      applyGenerationV2Schema(first, root)
      first.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
      first.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
        .run('conversation:1', 'project:1', 'Conversation', 2, 2)
      second.pragma('foreign_keys = OFF')
      expect(second.pragma('foreign_keys', { simple: true })).toBe(0)
      second.pragma('busy_timeout = 0')
      const repoA = new GenerationConfigV2Repo(first, () => 10)
      const repoB = new GenerationConfigV2Repo(second, () => 11)
      expect(second.pragma('foreign_keys', { simple: true })).toBe(1)
      const currentA = repoA.getScope('project', 'project:1')
      const currentB = repoB.getScope('project', 'project:1')
      repoA.compareAndSetScope('project', 'project:1', currentA.configRevision.value, {
        schemaVersion: 2, generation: { temperature: 0.2 },
      })
      expect(() => repoB.compareAndSetScope('project', 'project:1', currentB.configRevision.value, {
        schemaVersion: 2, generation: { temperature: 0.3 },
      })).toThrow('GENERATION_V2_CONFIG_STALE_REVISION')

      const latest = repoA.getScope('project', 'project:1')
      first.exec('BEGIN IMMEDIATE')
      expect(() => repoB.compareAndSetScope('project', 'project:1', latest.configRevision.value, {
        schemaVersion: 2, generation: { temperature: 0.4 },
      })).toThrow('GENERATION_V2_CONFIG_STALE_REVISION')
      first.exec('ROLLBACK')
      second.prepare("DELETE FROM project_v2 WHERE project_id='project:1'").run()
      expect(second.prepare('SELECT count(*) AS count FROM generation_config_v2').get()).toEqual({ count: 1 })
    } finally {
      if (first.inTransaction) first.exec('ROLLBACK')
      first.close()
      second.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('fails closed when foreign keys cannot be enabled on an active connection', () => {
    const db = new BetterSqlite3(':memory:')
    try {
      db.pragma('foreign_keys = OFF')
      db.exec('BEGIN')
      expect(() => new GenerationConfigV2Repo(db)).toThrow('GENERATION_V2_CONFIG_STATE_INVALID')
    } finally {
      if (db.inTransaction) db.exec('ROLLBACK')
      db.close()
    }
  })
})

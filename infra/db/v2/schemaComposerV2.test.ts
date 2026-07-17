import fs, { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  CONVERSATION_GRAPH_V2_MESSAGE_STATUSES,
  CONVERSATION_GRAPH_V2_ROLES,
} from '../../../src/next/generation-v2/domain/conversationGraphV2'
import {
  inspectGenerationV2SchemaBundle,
  installGenerationV2SchemaInActiveTransaction,
} from './schemaComposerV2'
import { applyGenerationV2SchemaForTest as applyGenerationV2Schema } from './testSchemaV2'

const root = path.resolve(process.cwd())

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, root)
  return db
}

function seedGraph(db: BetterSqlite3.Database) {
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  const insert = db.prepare(`INSERT INTO message_v2 (
    message_id, conversation_id, role, status, parent_message_id, question_id,
    answer_root_id, ordinal, created_at_ms, updated_at_ms
  ) VALUES (?, 'conversation:1', ?, ?, ?, ?, ?, ?, ?, ?)`)
  insert.run('question:1', 'user', 'completed', null, null, null, 1, 3, 3)
  insert.run('answer:1', 'assistant', 'streaming', 'question:1', 'question:1', 'answer:1', 2, 4, 4)
  insert.run('tool:1', 'tool', 'completed', 'answer:1', 'question:1', 'answer:1', 3, 5, 5)
  insert.run('answer:1:continuation', 'assistant', 'completed', 'tool:1', 'question:1', 'answer:1', 4, 6, 6)
  insert.run('answer:2', 'assistant', 'completed', 'question:1', 'question:1', 'answer:2', 5, 7, 7)
  db.prepare('INSERT INTO branch_v2 VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('branch:1', 'conversation:1', 'answer:1:continuation', null, 8, 8, null)
  db.prepare('INSERT INTO branch_choice_v2 VALUES (?, ?, ?, ?, ?)')
    .run('branch:1', 'conversation:1', 'question:1', 'answer:1', 8)
  db.prepare('INSERT INTO branch_answer_hide_v2 VALUES (?, ?, ?, ?, ?)')
    .run('branch:1', 'conversation:1', 'question:1', 'answer:2', 8)
}

describe('Generation V2 schema composer and core conversation graph', () => {
  it('requires and preserves the bootstrap coordinator transaction boundary', () => {
    const db = new BetterSqlite3(':memory:')
    try {
      db.pragma('foreign_keys = ON')
      expect(() => installGenerationV2SchemaInActiveTransaction(db, root))
        .toThrow('GENERATION_V2_SCHEMA_DATABASE_BUSY')
      db.exec('BEGIN IMMEDIATE')
      installGenerationV2SchemaInActiveTransaction(db, root)
      expect(db.inTransaction).toBe(true)
      expect(db.prepare("SELECT count(*) AS count FROM app_meta_v2").get()).toEqual({ count: 0 })
      db.exec('ROLLBACK')
      expect(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('assembles the fixed fragments deterministically and applies idempotently', () => {
    const first = inspectGenerationV2SchemaBundle(root)
    const second = inspectGenerationV2SchemaBundle(root)
    expect(first).toEqual(second)
    expect(first.fragmentIds).toEqual([
      'core_conversation_v1', 'generation_config_v1', 'attachment_asset_v1', 'openrouter_images_v1',
      'deepseek_stable_model_evidence_v1', 'generation_execution_v1',
    ])
    expect(first.schemaDigest).toMatch(/^[0-9a-f]{64}$/u)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.fragmentIds)).toBe(true)
    const db = new BetterSqlite3(':memory:')
    try {
      const applied = applyGenerationV2Schema(db, root)
      expect(applyGenerationV2Schema(db, root)).toEqual(applied)
      expect(db.prepare('SELECT * FROM generation_v2_schema_manifest').get()).toEqual({
        manifest_id: 'generation_compiler_v2', schema_version: 1,
        schema_digest: first.schemaDigest, fragment_count: 6,
        object_projection_digest: applied.objectProjectionDigest,
      })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='openrouter_image_endpoint_bindings'").get())
        .toEqual({ name: 'openrouter_image_endpoint_bindings' })
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      db.prepare("UPDATE generation_v2_schema_manifest SET schema_digest = ? WHERE manifest_id = 'generation_compiler_v2'")
        .run('0'.repeat(64))
      expect(() => applyGenerationV2Schema(db, root)).toThrow('GENERATION_V2_SCHEMA_STATE_INVALID')
    } finally { db.close() }
  })

  it('rolls back every object and manifest when a later fragment fails', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-v2-schema-'))
    const v2 = path.join(directory, 'infra', 'db', 'v2')
    fs.mkdirSync(v2, { recursive: true })
    fs.copyFileSync(path.resolve('infra/db/v2/coreConversationSchema.sql'), path.join(v2, 'coreConversationSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/generationConfigSchema.sql'), path.join(v2, 'generationConfigSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/attachmentAssetSchema.sql'), path.join(v2, 'attachmentAssetSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/openRouterImagesSchema.sql'), path.join(v2, 'openRouterImagesSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/deepSeekStableModelEvidenceSchema.sql'), path.join(v2, 'deepSeekStableModelEvidenceSchema.sql'))
    fs.writeFileSync(path.join(v2, 'generationExecutionSchema.sql'), [
      '-- Generation Compiler V2 injected failure fixture.',
      'CREATE TABLE IF NOT EXISTS injected_partial_v2 (id TEXT PRIMARY KEY);',
      'THIS IS NOT SQL;',
    ].join('\n'))
    const db = new BetterSqlite3(':memory:')
    try {
      expect(() => applyGenerationV2Schema(db, directory)).toThrow()
      expect(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get())
        .toEqual({ count: 0 })
    } finally {
      db.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects pre-existing same-name objects without writing a manifest', () => {
    const db = new BetterSqlite3(':memory:')
    try {
      db.exec('CREATE TABLE project_v2 (wrong TEXT)')
      expect(() => applyGenerationV2Schema(db, root)).toThrow('GENERATION_V2_SCHEMA_STATE_INVALID')
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='generation_v2_schema_manifest'").get())
        .toBeUndefined()
      expect(db.prepare("PRAGMA table_info('project_v2')").all()).toHaveLength(1)
    } finally { db.close() }
  })

  it.each([
    ['table', 'CREATE TABLE unexpected_generation_v2_object (id TEXT)'],
    ['trigger', `CREATE TRIGGER unexpected_generation_v2_trigger AFTER INSERT ON app_meta_v2
      BEGIN SELECT 1; END`],
  ])('rejects an extra %s outside the closed schema object set', (_kind, sql) => {
    const db = createDb()
    try {
      db.exec(sql)
      expect(() => applyGenerationV2Schema(db, root))
        .toThrow('GENERATION_V2_SCHEMA_STATE_INVALID')
    } finally { db.close() }
  })

  it('rejects a weakened manifest table even when its persisted row is otherwise valid', () => {
    const db = createDb()
    try {
      const manifest = db.prepare('SELECT * FROM generation_v2_schema_manifest').get() as Record<string, unknown>
      db.exec('DROP TABLE generation_v2_schema_manifest')
      db.exec(`CREATE TABLE generation_v2_schema_manifest (
        manifest_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        schema_digest TEXT NOT NULL,
        fragment_count INTEGER NOT NULL,
        object_projection_digest TEXT NOT NULL
      )`)
      db.prepare(`INSERT INTO generation_v2_schema_manifest VALUES (?, ?, ?, ?, ?)`).run(
        manifest.manifest_id,
        manifest.schema_version,
        manifest.schema_digest,
        manifest.fragment_count,
        manifest.object_projection_digest,
      )
      expect(() => applyGenerationV2Schema(db, root))
        .toThrow('GENERATION_V2_SCHEMA_STATE_INVALID')
    } finally { db.close() }
  })

  it('enables foreign keys before apply and enforces graph ownership and cascades', () => {
    const db = new BetterSqlite3(':memory:')
    try {
      db.pragma('foreign_keys = OFF')
      expect(db.pragma('foreign_keys', { simple: true })).toBe(0)
      applyGenerationV2Schema(db, root)
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)

      db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
      db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
        .run('conversation:1', 'project:1', 'First', 2, 2)
      db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
        .run('conversation:2', 'project:1', 'Second', 3, 3)
      const insert = db.prepare(`INSERT INTO message_v2 (
        message_id, conversation_id, role, status, parent_message_id, question_id,
        answer_root_id, ordinal, created_at_ms, updated_at_ms
      ) VALUES (?, ?, 'user', 'completed', ?, null, null, ?, ?, ?)`)
      insert.run('question:1', 'conversation:1', null, 1, 4, 4)
      expect(() => insert.run('question:cross', 'conversation:2', 'question:1', 1, 5, 5))
        .toThrow(/FOREIGN KEY constraint failed/u)

      insert.run('question:2', 'conversation:2', null, 1, 6, 6)
      expect(db.prepare("SELECT 1 AS present FROM message_body_v2 WHERE message_id='question:2'").get())
        .toEqual({ present: 1 })
      db.prepare("DELETE FROM message_v2 WHERE message_id='question:2'").run()
      expect(db.prepare("SELECT 1 FROM message_body_v2 WHERE message_id='question:2'").get())
        .toBeUndefined()
    } finally { db.close() }
  })

  it('keeps chosen answer root and branch head as separate valid facts', () => {
    const db = createDb()
    try {
      seedGraph(db)
      expect(db.prepare(`SELECT b.head_message_id, c.chosen_answer_root_id
        FROM branch_v2 b JOIN branch_choice_v2 c USING (branch_id, conversation_id)`).get())
        .toEqual({ head_message_id: 'answer:1:continuation', chosen_answer_root_id: 'answer:1' })
      expect(db.prepare('SELECT answer_root_id FROM message_v2 WHERE message_id = ?').get('tool:1'))
        .toEqual({ answer_root_id: 'answer:1' })
      expect(db.prepare('SELECT count(*) AS count FROM message_body_v2').get()).toEqual({ count: 5 })
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally { db.close() }
  })

  it('rejects direct body deletion while preserving message-owned cascade deletion', () => {
    const db = createDb()
    try {
      seedGraph(db)
      expect(() => db.prepare("DELETE FROM message_body_v2 WHERE message_id='answer:1'").run())
        .toThrow('GENERATION_V2_GRAPH_MESSAGE_BODY_REQUIRED')
      expect(() => db.prepare('UPDATE message_body_v2 SET body_text = ? WHERE message_id = ?')
        .run('x'.repeat(20 * 1024 * 1024 + 1), 'answer:1')).toThrow(/CHECK constraint failed/u)
      db.prepare("DELETE FROM message_v2 WHERE message_id='answer:2'").run()
      expect(db.prepare("SELECT 1 FROM message_body_v2 WHERE message_id='answer:2'").get()).toBeUndefined()
    } finally { db.close() }
  })

  it('rejects cross-conversation references and invalid answer grouping', () => {
    const db = createDb()
    try {
      seedGraph(db)
      db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
        .run('conversation:2', 'project:1', 'Other', 9, 9)
      const insert = db.prepare(`INSERT INTO message_v2 VALUES (
        ?, 'conversation:2', ?, ?, ?, ?, ?, ?, ?, ?
      )`)
      expect(() => insert.run('bad:parent', 'user', 'completed', 'question:1', null, null, 1, 10, 10))
        .toThrow(/FOREIGN KEY constraint failed/u)
      expect(() => insert.run('bad:question', 'assistant', 'completed', 'question:1', 'question:1', 'bad:question', 2, 10, 10))
        .toThrow('GENERATION_V2_GRAPH_QUESTION_INVALID')
      expect(() => db.prepare('INSERT INTO branch_v2 VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('branch:2', 'conversation:2', 'answer:1', null, 10, 10, null))
        .toThrow('GENERATION_V2_GRAPH_BRANCH_HEAD_INVALID')
      expect(() => db.prepare(`INSERT INTO message_v2 VALUES (
        ?, 'conversation:1', 'assistant', 'completed', ?, ?, ?, ?, ?, ?
      )`).run('bad:group', 'answer:2', 'question:1', 'answer:1', 6, 11, 11))
        .toThrow('GENERATION_V2_GRAPH_PARENT_GROUP_INVALID')
    } finally { db.close() }
  })

  it('rejects invalid choice/hide targets and chosen-answer hiding', () => {
    const db = createDb()
    try {
      seedGraph(db)
      expect(() => db.prepare('INSERT INTO branch_answer_hide_v2 VALUES (?, ?, ?, ?, ?)')
        .run('branch:1', 'conversation:1', 'question:1', 'answer:1', 12))
        .toThrow('GENERATION_V2_GRAPH_HIDE_CHOSEN')
      db.prepare('DELETE FROM branch_choice_v2 WHERE branch_id = ?').run('branch:1')
      expect(() => db.prepare('INSERT INTO branch_choice_v2 VALUES (?, ?, ?, ?, ?)')
        .run('branch:1', 'conversation:1', 'question:1', 'answer:2', 13))
        .toThrow('GENERATION_V2_GRAPH_CHOICE_HIDDEN')
      expect(() => db.prepare('INSERT INTO branch_choice_v2 VALUES (?, ?, ?, ?, ?)')
        .run('branch:1', 'conversation:1', 'question:1', 'tool:1', 13))
        .toThrow('GENERATION_V2_GRAPH_CHOICE_INVALID')
      db.prepare('INSERT INTO branch_choice_v2 VALUES (?, ?, ?, ?, ?)')
        .run('branch:1', 'conversation:1', 'question:1', 'answer:1', 14)
      db.prepare('INSERT INTO branch_v2 VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('branch:2', 'conversation:1', 'answer:1:continuation', null, 15, 15, null)
      db.prepare('INSERT INTO branch_choice_v2 VALUES (?, ?, ?, ?, ?)')
        .run('branch:2', 'conversation:1', 'question:1', 'answer:1', 15)
      expect(() => db.prepare("UPDATE branch_choice_v2 SET branch_id='branch:2' WHERE branch_id='branch:1'").run())
        .toThrow('GENERATION_V2_GRAPH_CHOICE_STRUCTURE_IMMUTABLE')
      expect(() => db.prepare("UPDATE branch_answer_hide_v2 SET answer_root_id='answer:1' WHERE branch_id='branch:1'").run())
        .toThrow('GENERATION_V2_GRAPH_HIDE_STRUCTURE_IMMUTABLE')
    } finally { db.close() }
  })

  it('allows one-way streaming terminalization and makes graph structure immutable', () => {
    const db = createDb()
    try {
      seedGraph(db)
      db.prepare("UPDATE message_v2 SET status='failed', updated_at_ms=20 WHERE message_id='answer:1'").run()
      expect(() => db.prepare("UPDATE message_v2 SET status='streaming' WHERE message_id='answer:1'").run())
        .toThrow('GENERATION_V2_GRAPH_STATUS_TRANSITION_INVALID')
      expect(() => db.prepare("UPDATE message_v2 SET question_id='question:1' WHERE message_id='answer:1'").run())
        .toThrow('GENERATION_V2_GRAPH_MESSAGE_STRUCTURE_IMMUTABLE')
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:1'").get())
        .toEqual({ status: 'failed' })
    } finally { db.close() }
  })

  it('cascades one owned project graph without leaving foreign-key damage', () => {
    const db = createDb()
    try {
      seedGraph(db)
      db.prepare('DELETE FROM project_v2 WHERE project_id = ?').run('project:1')
      for (const table of ['conversation_v2', 'message_v2', 'message_body_v2', 'branch_v2', 'branch_choice_v2', 'branch_answer_hide_v2']) {
        expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
      }
      expect(db.prepare("SELECT owner_kind, owner_id FROM generation_config_v2 ORDER BY owner_kind").all())
        .toEqual([{ owner_kind: 'global', owner_id: 'global' }])
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally { db.close() }
  })

  it('keeps TypeScript role/status facts aligned, includes dormant execution tables, and excludes legacy tables', () => {
    const sql = readFileSync(path.resolve('infra/db/v2/coreConversationSchema.sql'), 'utf8')
    for (const role of CONVERSATION_GRAPH_V2_ROLES) expect(sql).toContain(`'${role}'`)
    for (const status of CONVERSATION_GRAPH_V2_MESSAGE_STATUSES) expect(sql).toContain(`'${status}'`)
    const db = createDb()
    try {
      const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
        .map((row) => row.name)
      for (const forbidden of ['project', 'convo', 'message', 'message_body', 'branch', 'branch_choice']) {
        expect(names).not.toContain(forbidden)
      }
      for (const expected of ['assistant_generation_snapshot_v2', 'generation_operation_v2',
        'generation_request_v2', 'generation_attempt_v2', 'generation_native_artifact_v2']) {
        expect(names).toContain(expected)
      }
      expect(inspectGenerationV2SchemaBundle(root).executionAuthority).toBe('none')
    } finally { db.close() }
  })

  it('remains outside legacy startup, worker and chat.db schema ownership', () => {
    const composerName = 'schemaComposerV2'
    const sources = [
      'electron/main.ts',
      'infra/db/worker/runtime.ts',
      'infra/db/schema.sql',
    ].map((file) => readFileSync(path.resolve(file), 'utf8')).join('\n')
    expect(sources).not.toContain(composerName)
    const composerSource = readFileSync(path.resolve('infra/db/v2/schemaComposerV2.ts'), 'utf8')
    expect(composerSource).not.toMatch(/electron|ipcMain|chat\.db|schema\.sql/u)
  })
})

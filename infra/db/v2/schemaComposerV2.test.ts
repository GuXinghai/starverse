import fs, { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
  resetModelCatalogNamespaceV2InActiveTransaction,
} from './schemaComposerV2'
import { applyGenerationV2SchemaForTest as applyGenerationV2Schema } from './testSchemaV2'

const root = path.resolve(process.cwd())

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, root)
  return db
}

function installedProjectionDigest(db: BetterSqlite3.Database): string {
  const ftsShadows = new Set([
    'generation_v2_search_fts_config', 'generation_v2_search_fts_content',
    'generation_v2_search_fts_data', 'generation_v2_search_fts_docsize',
    'generation_v2_search_fts_idx',
  ])
  const rows = db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`).all() as Array<{
      type: string
      name: string
      tbl_name: string
      sql: string | null
    }>
  const projection = rows
    .filter((row) => !ftsShadows.has(row.name) && row.name !== 'generation_v2_schema_manifest')
    .map((row) => ({ type: row.type, name: row.name, tableName: row.tbl_name, sql: row.sql }))
  return createHash('sha256').update(JSON.stringify(projection), 'utf8').digest('hex')
}

function seedGraph(db: BetterSqlite3.Database) {
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  db.prepare('INSERT INTO branch_v2 VALUES (?, ?, ?, ?, ?, ?, ?, NULL)')
    .run('branch:1', 'conversation:1', null, null, 8, 8, null)
  const insert = db.prepare(`INSERT INTO message_v2 (
    message_id, conversation_id, introduced_in_branch_id, role, status, parent_message_id, question_id,
    answer_root_id, ordinal, created_at_ms, updated_at_ms
  ) VALUES (?, 'conversation:1', 'branch:1', ?, ?, ?, ?, ?, ?, ?, ?)`)
  insert.run('question:1', 'user', 'completed', null, null, null, 1, 3, 3)
  insert.run('answer:1', 'assistant', 'streaming', 'question:1', 'question:1', 'answer:1', 2, 4, 4)
  insert.run('tool:1', 'tool', 'completed', 'answer:1', 'question:1', 'answer:1', 3, 5, 5)
  insert.run('answer:1:continuation', 'assistant', 'completed', 'tool:1', 'question:1', 'answer:1', 4, 6, 6)
  insert.run('answer:2', 'assistant', 'completed', 'question:1', 'question:1', 'answer:2', 5, 7, 7)
  db.prepare("UPDATE branch_v2 SET head_message_id='answer:1:continuation' WHERE branch_id='branch:1'").run()
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
      'core_conversation_v1', 'generation_config_v1', 'tool_registry_v1', 'attachment_asset_v1', 'openrouter_images_v1',
      'local_endpoint_profile_v1', 'reasoning_projection_v1', 'composer_draft_v1',
      'generation_execution_v1',
      'generation_v2_search_v1',
      'engine_plugin_registry_v1',
      'openai_chat_compatible_v1',
      'model_preferences_v1',
      'model_catalog_v2',
      'dfc_attachment_v1',
      'conversation_route_preference_v1',
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
        schema_digest: first.schemaDigest, fragment_count: 16,
        object_projection_digest: applied.objectProjectionDigest,
      })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='openrouter_image_endpoint_bindings'").get())
        .toEqual({ name: 'openrouter_image_endpoint_bindings' })
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      db.prepare("UPDATE generation_v2_schema_manifest SET schema_digest = ? WHERE manifest_id = 'generation_compiler_v2'")
        .run('0'.repeat(64))
      expect(() => applyGenerationV2Schema(db, root)).toThrow('GENERATION_V2_SCHEMA_DIGEST_MISMATCH')
    } finally { db.close() }
  })

  it('destructively rebuilds only the catalog namespace and advances both schema revisions atomically', () => {
    const db = createDb()
    const current = inspectGenerationV2SchemaBundle(root)
    const oldDigest = '9'.repeat(64)
    try {
      db.prepare(`INSERT INTO app_meta_v2 (
        singleton_id, data_epoch, application_id, root_id, schema_digest, created_at_ms
      ) VALUES (1, 2, 'test.starverse', ?, ?, 1)`).run('8'.repeat(64), current.schemaDigest)
      db.prepare(`INSERT INTO epoch_scope_key_envelope_v2 (
        singleton_id, backend, key_version, envelope_revision, ciphertext, created_at_ms, updated_at_ms
      ) VALUES (1, 'electron_safe_storage', 1, 7, ?, 1, 1)`).run(Buffer.from('encrypted-envelope'))
      db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:preserved', 'Preserved', 2, 2)
      db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
        .run('conversation:preserved', 'project:preserved', 'Preserved conversation', 3, 3)
      const attachmentDigest = '7'.repeat(64)
      db.prepare('INSERT INTO file_blob_v2 VALUES (?, ?, ?, ?, ?, ?)').run(
        `blob-v2:${attachmentDigest}`, attachmentDigest, 1, 'text/plain', `sha256/77/${attachmentDigest}`, 4,
      )
      for (const fileName of [
        'deepSeekStableModelEvidenceSchema.sql', 'openAIResponsesModelEvidenceSchema.sql',
        'anthropicModelEvidenceSchema.sql', 'geminiModelEvidenceSchema.sql',
      ]) db.exec(readFileSync(path.join(root, 'infra', 'db', 'v2', fileName), 'utf8'))
      const evidenceDigest = 'a'.repeat(64)
      db.prepare(`INSERT INTO deepseek_stable_model_evidence_sets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'credential:deepseek', 'deepseek-stable-api-v1', 1, 'endpoint:1',
        `deepseek-stable-profile-v1:${evidenceDigest}`, evidenceDigest, 5,
        `deepseek-stable-models-response-v1:${evidenceDigest}`, evidenceDigest, '{"object":"list","data":[]}',
      )
      db.prepare('INSERT INTO deepseek_stable_model_evidence_generation_clock VALUES (?, ?, ?)')
        .run('credential:deepseek', 'deepseek-stable-api-v1', 1)
      db.prepare(`INSERT INTO openai_responses_model_evidence_sets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'credential:openai', 'openai-api-v1', 1, 'endpoint:1',
        `openai-responses-profile-v1:${evidenceDigest}`, evidenceDigest, 5,
        `openai-responses-models-v1:${evidenceDigest}`, evidenceDigest, '{"object":"list","data":[]}',
      )
      db.prepare('INSERT INTO openai_responses_model_evidence_generation_clock VALUES (?, ?, ?)')
        .run('credential:openai', 'openai-api-v1', 1)
      db.prepare(`INSERT INTO anthropic_model_evidence_sets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ).run(
        'credential:anthropic', 'anthropic-developer-api-2023-06-01', 'claude-test', 1, 'endpoint:1',
        `anthropic-profile-v1:${evidenceDigest}`, evidenceDigest, 5,
        `anthropic-model-v1:${evidenceDigest}`, evidenceDigest, '{"type":"model","id":"claude-test"}',
      )
      db.prepare('INSERT INTO anthropic_model_evidence_generation_clock VALUES (?, ?, ?, ?)')
        .run('credential:anthropic', 'anthropic-developer-api-2023-06-01', 'claude-test', 1)
      db.prepare(`INSERT INTO gemini_model_evidence_sets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ).run(
        'credential:gemini', 'gemini-developer-api-v1beta', 1, 'endpoint:1',
        `gemini-models-v1beta:${evidenceDigest}`, evidenceDigest, 5,
        `gemini-models-v1:${evidenceDigest}`, evidenceDigest, '{"schemaVersion":1,"models":[]}',
      )
      db.prepare('INSERT INTO gemini_model_evidence_generation_clock VALUES (?, ?, ?)')
        .run('credential:gemini', 'gemini-developer-api-v1beta', 1)

      db.exec('BEGIN IMMEDIATE')
      db.exec(`
        DROP TRIGGER model_catalog_snapshot_v2_no_update;
        DROP INDEX idx_model_catalog_snapshot_v2_retention;
        DROP INDEX idx_model_catalog_scope_v2_provider;
        DROP TABLE model_catalog_snapshot_v2;
        DROP TABLE model_catalog_scope_v2;
        CREATE TABLE model_catalog_scope_v2 (
          scope_id TEXT PRIMARY KEY,
          provider_key TEXT NOT NULL,
          credential_scope_id TEXT NOT NULL,
          endpoint_profile_id TEXT NOT NULL,
          operation_contract_id TEXT NOT NULL,
          active_snapshot_digest TEXT
        );
        CREATE TABLE model_catalog_snapshot_v2 (
          scope_id TEXT NOT NULL REFERENCES model_catalog_scope_v2(scope_id) ON DELETE CASCADE,
          snapshot_digest TEXT NOT NULL,
          items_json TEXT NOT NULL,
          PRIMARY KEY (scope_id, snapshot_digest)
        );
      `)
      db.prepare(`INSERT INTO model_catalog_scope_v2 VALUES (?, ?, ?, ?, ?, ?)`).run(
        'old-scope', 'openrouter', 'credential:old', 'endpoint:old', 'contract:old', 'a'.repeat(64),
      )
      db.prepare('INSERT INTO model_catalog_snapshot_v2 VALUES (?, ?, ?)')
        .run('old-scope', 'a'.repeat(64), '[{"id":"old"}]')
      db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
      db.prepare('UPDATE app_meta_v2 SET schema_digest = ? WHERE singleton_id = 1').run(oldDigest)
      db.exec(readFileSync(path.resolve('infra/db/v2/generationExecutionSchema.sql'), 'utf8'))
      db.prepare(`UPDATE generation_v2_schema_manifest
        SET schema_digest = ?, object_projection_digest = ?
        WHERE manifest_id = 'generation_compiler_v2'`).run(oldDigest, installedProjectionDigest(db))
      db.exec('COMMIT')

      db.exec('BEGIN IMMEDIATE')
      const result = resetModelCatalogNamespaceV2InActiveTransaction(db, root)
      expect(result).toMatchObject({
        classification: 'model_catalog_namespace_reset_v2',
        discardedScopeCount: 1,
        discardedSnapshotCount: 1,
        discardedLegacyEvidenceSetCount: 4,
        discardedLegacyEvidenceClockCount: 4,
        credentialEnvelopeRevision: 7,
        schemaDigest: current.schemaDigest,
      })
      expect(db.prepare('SELECT count(*) AS count FROM model_catalog_scope_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM model_catalog_snapshot_v2').get()).toEqual({ count: 0 })
      for (const table of [
        'deepseek_stable_model_evidence_sets', 'deepseek_stable_model_evidence_generation_clock',
        'openai_responses_model_evidence_sets', 'openai_responses_model_evidence_generation_clock',
        'anthropic_model_evidence_sets', 'anthropic_model_evidence_generation_clock',
        'gemini_model_evidence_sets', 'gemini_model_evidence_generation_clock',
      ]) expect(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name=?").get(table))
        .toEqual({ count: 0 })
      expect(db.prepare("SELECT name FROM project_v2 WHERE project_id='project:preserved'").get())
        .toEqual({ name: 'Preserved' })
      expect(db.prepare("SELECT title FROM conversation_v2 WHERE conversation_id='conversation:preserved'").get())
        .toEqual({ title: 'Preserved conversation' })
      expect(db.prepare('SELECT size_bytes FROM file_blob_v2 WHERE blob_id=?').get(`blob-v2:${attachmentDigest}`))
        .toEqual({ size_bytes: 1 })
      expect(db.prepare("SELECT revision_generation FROM generation_config_v2 WHERE owner_kind='project' AND owner_id='project:preserved'").get())
        .toEqual({ revision_generation: 1 })
      expect(db.prepare(`SELECT envelope_revision, ciphertext FROM epoch_scope_key_envelope_v2
        WHERE singleton_id = 1`).get()).toEqual({
        envelope_revision: 7,
        ciphertext: Buffer.from('encrypted-envelope'),
      })
      expect(db.prepare('SELECT schema_digest FROM app_meta_v2 WHERE singleton_id = 1').get())
        .toEqual({ schema_digest: current.schemaDigest })
      expect(db.prepare(`SELECT schema_digest FROM generation_v2_schema_manifest
        WHERE manifest_id = 'generation_compiler_v2'`).get()).toEqual({ schema_digest: current.schemaDigest })
      db.exec('COMMIT')

      db.exec('BEGIN IMMEDIATE')
      expect(installGenerationV2SchemaInActiveTransaction(db, root).schemaDigest).toBe(current.schemaDigest)
      db.exec('COMMIT')
    } finally {
      if (db.inTransaction) db.exec('ROLLBACK')
      db.close()
    }
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
    fs.copyFileSync(path.resolve('infra/db/v2/openAIResponsesModelEvidenceSchema.sql'), path.join(v2, 'openAIResponsesModelEvidenceSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/anthropicModelEvidenceSchema.sql'), path.join(v2, 'anthropicModelEvidenceSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/toolRegistrySchema.sql'), path.join(v2, 'toolRegistrySchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/geminiModelEvidenceSchema.sql'), path.join(v2, 'geminiModelEvidenceSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/localEndpointProfileSchema.sql'), path.join(v2, 'localEndpointProfileSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/reasoningProjectionSchema.sql'), path.join(v2, 'reasoningProjectionSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/composerDraftSchema.sql'), path.join(v2, 'composerDraftSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/searchSchema.sql'), path.join(v2, 'searchSchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/enginePluginRegistrySchema.sql'), path.join(v2, 'enginePluginRegistrySchema.sql'))
    fs.copyFileSync(path.resolve('infra/db/v2/openAIChatCompatibleSchema.sql'), path.join(v2, 'openAIChatCompatibleSchema.sql'))
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
      db.prepare('INSERT INTO branch_v2 VALUES (?, ?, NULL, NULL, ?, ?, NULL, NULL)')
        .run('branch:1', 'conversation:1', 3, 3)
      db.prepare('INSERT INTO branch_v2 VALUES (?, ?, NULL, NULL, ?, ?, NULL, NULL)')
        .run('branch:2', 'conversation:2', 3, 3)
      const insert = db.prepare(`INSERT INTO message_v2 (
        message_id, conversation_id, introduced_in_branch_id, role, status, parent_message_id, question_id,
        answer_root_id, ordinal, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, 'user', 'completed', ?, null, null, ?, ?, ?)`)
      insert.run('question:1', 'conversation:1', 'branch:1', null, 1, 4, 4)
      expect(() => db.prepare(`UPDATE message_v2 SET introduced_in_branch_id='branch:2'
        WHERE message_id='question:1'`).run())
        .toThrow('GENERATION_V2_GRAPH_MESSAGE_STRUCTURE_IMMUTABLE')
      expect(() => insert.run(
        'question:wrong-introduction',
        'conversation:2',
        'branch:1',
        null,
        2,
        5,
        5,
      )).toThrow(/FOREIGN KEY constraint failed/u)
      expect(() => insert.run('question:cross', 'conversation:2', 'branch:2', 'question:1', 1, 5, 5))
        .toThrow(/FOREIGN KEY constraint failed/u)

      insert.run('question:2', 'conversation:2', 'branch:2', null, 1, 6, 6)
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

  it('rejects direct body deletion and answer deletion that would erase an append-only Hide fact', () => {
    const db = createDb()
    try {
      seedGraph(db)
      expect(() => db.prepare("DELETE FROM message_body_v2 WHERE message_id='answer:1'").run())
        .toThrow('GENERATION_V2_GRAPH_MESSAGE_BODY_REQUIRED')
      expect(() => db.prepare('UPDATE message_body_v2 SET body_text = ? WHERE message_id = ?')
        .run('x'.repeat(20 * 1024 * 1024 + 1), 'answer:1')).toThrow(/CHECK constraint failed/u)
      expect(() => db.prepare("DELETE FROM message_v2 WHERE message_id='answer:2'").run())
        .toThrow('GENERATION_V2_GRAPH_HIDE_DELETE_FORBIDDEN')
      expect(db.prepare("SELECT 1 AS present FROM message_body_v2 WHERE message_id='answer:2'").get())
        .toEqual({ present: 1 })
    } finally { db.close() }
  })

  it('rejects cross-conversation references and invalid answer grouping', () => {
    const db = createDb()
    try {
      seedGraph(db)
      db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
        .run('conversation:2', 'project:1', 'Other', 9, 9)
      db.prepare('INSERT INTO branch_v2 VALUES (?, ?, NULL, NULL, ?, ?, NULL, NULL)')
        .run('branch:2', 'conversation:2', 10, 10)
      const insert = db.prepare(`INSERT INTO message_v2(
        message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
        question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms
      ) VALUES (?, 'conversation:2', 'branch:2', ?, ?, ?, ?, ?, ?, ?, ?)`)
      expect(() => insert.run('bad:parent', 'user', 'completed', 'question:1', null, null, 1, 10, 10))
        .toThrow(/FOREIGN KEY constraint failed/u)
      expect(() => insert.run('bad:question', 'assistant', 'completed', 'question:1', 'question:1', 'bad:question', 2, 10, 10))
        .toThrow('GENERATION_V2_GRAPH_QUESTION_INVALID')
      expect(() => db.prepare("UPDATE branch_v2 SET head_message_id='answer:1' WHERE branch_id='branch:2'").run())
        .toThrow('GENERATION_V2_GRAPH_BRANCH_HEAD_INVALID')
      expect(() => db.prepare(`INSERT INTO message_v2(
        message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
        question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms
      ) VALUES (?, 'conversation:1', 'branch:1', 'assistant', 'completed', ?, ?, ?, ?, ?, ?)
      `).run('bad:group', 'answer:2', 'question:1', 'answer:1', 6, 11, 11))
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
      db.prepare('INSERT INTO branch_v2 VALUES (?, ?, ?, ?, ?, ?, ?, NULL)')
        .run('branch:2', 'conversation:1', 'answer:1:continuation', null, 15, 15, null)
      db.prepare('INSERT INTO branch_choice_v2 VALUES (?, ?, ?, ?, ?)')
        .run('branch:2', 'conversation:1', 'question:1', 'answer:1', 15)
      expect(() => db.prepare("UPDATE branch_choice_v2 SET branch_id='branch:2' WHERE branch_id='branch:1'").run())
        .toThrow('GENERATION_V2_GRAPH_CHOICE_STRUCTURE_IMMUTABLE')
      expect(() => db.prepare("UPDATE branch_answer_hide_v2 SET answer_root_id='answer:1' WHERE branch_id='branch:1'").run())
        .toThrow('GENERATION_V2_GRAPH_HIDE_STRUCTURE_IMMUTABLE')
    } finally { db.close() }
  })

  it('allows question hiding only after the branch leaves that question and keeps the record immutable', () => {
    const db = createDb()
    try {
      seedGraph(db)
      expect(() => db.prepare('INSERT INTO branch_question_hide_v2 VALUES (?, ?, ?, ?)')
        .run('branch:1', 'conversation:1', 'question:1', 12))
        .toThrow('GENERATION_V2_GRAPH_QUESTION_HIDE_CURRENT')
      db.prepare('UPDATE branch_v2 SET head_message_id=NULL, updated_at_ms=12 WHERE branch_id=?').run('branch:1')
      expect(() => db.prepare('INSERT INTO branch_question_hide_v2 VALUES (?, ?, ?, ?)')
        .run('branch:1', 'conversation:1', 'answer:1', 12))
        .toThrow('GENERATION_V2_GRAPH_QUESTION_HIDE_INVALID')
      db.prepare('INSERT INTO branch_question_hide_v2 VALUES (?, ?, ?, ?)')
        .run('branch:1', 'conversation:1', 'question:1', 12)
      expect(() => db.prepare("UPDATE branch_question_hide_v2 SET question_id='answer:1'").run())
        .toThrow('GENERATION_V2_GRAPH_QUESTION_HIDE_STRUCTURE_IMMUTABLE')
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

  it('allows owning-project physical cascade while forbidding direct Hide deletion', () => {
    const db = createDb()
    try {
      seedGraph(db)
      expect(() => db.prepare('DELETE FROM branch_answer_hide_v2').run())
        .toThrow('GENERATION_V2_GRAPH_HIDE_DELETE_FORBIDDEN')
      db.prepare('DELETE FROM project_v2 WHERE project_id = ?').run('project:1')
      expect(db.prepare('SELECT count(*) AS count FROM branch_answer_hide_v2').get())
        .toEqual({ count: 0 })
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
    expect(existsSync(path.resolve('electron/main.ts'))).toBe(false)
    expect(existsSync(path.resolve('infra/db/worker/runtime.ts'))).toBe(false)
    expect(existsSync(path.resolve('infra/db/schema.sql'))).toBe(false)
    const sources = [
      'electron/epoch2MainEntry.ts',
      'electron/mainV2.ts',
      'infra/db/v2/schemaComposerV2.ts',
    ].map((file) => readFileSync(path.resolve(file), 'utf8')).join('\n')
    expect(sources).not.toContain(composerName)
    const composerSource = readFileSync(path.resolve('infra/db/v2/schemaComposerV2.ts'), 'utf8')
    expect(composerSource).not.toMatch(/electron|ipcMain|chat\.db|schema\.sql/u)
  })
})

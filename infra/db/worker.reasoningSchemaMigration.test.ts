import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3, { type Database } from 'better-sqlite3'
import { DbWorkerRuntime } from './worker'

type ColumnInfo = Readonly<{ name: string; notnull: number }>
type ForeignKeyInfo = Readonly<{ from: string; table: string; to: string; on_delete: string }>
type IndexInfo = Readonly<{ name: string; unique: number }>
type IndexColumnInfo = Readonly<{ name: string }>

function displayBlockColumns(db: Database): ColumnInfo[] {
  return db.prepare('PRAGMA table_info(message_reasoning_display_blocks)').all() as ColumnInfo[]
}

function displayBlockForeignKeys(db: Database): ForeignKeyInfo[] {
  return db.prepare('PRAGMA foreign_key_list(message_reasoning_display_blocks)').all() as ForeignKeyInfo[]
}

function expectDisplayBlockSchemaParity(db: Database) {
  const columns = displayBlockColumns(db)
  const columnByName = new Map(columns.map((column) => [column.name, column]))
  expect(columnByName.get('block_type')?.notnull).toBe(1)
  expect(columnByName.get('provider_key')?.notnull).toBe(1)

  const foreignKeys = displayBlockForeignKeys(db)
  expect(foreignKeys).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: 'asset_id', table: 'asset', to: 'id', on_delete: 'SET NULL' }),
    expect.objectContaining({ from: 'file_asset_id', table: 'file_assets', to: 'id', on_delete: 'SET NULL' }),
    expect.objectContaining({
      from: 'source_raw_segment_id',
      table: 'message_reasoning_detail_segments',
      to: 'segment_id',
      on_delete: 'SET NULL',
    }),
  ]))

  const uniqueIndexes = db.prepare('PRAGMA index_list(message_reasoning_display_blocks)').all() as IndexInfo[]
  const uniqueColumnGroups = uniqueIndexes
    .filter((index) => index.unique === 1)
    .map((index) => {
      const escapedName = index.name.replace(/"/g, '""')
      return (db.prepare(`PRAGMA index_info("${escapedName}")`).all() as IndexColumnInfo[])
        .map((column) => column.name)
    })

  expect(uniqueColumnGroups).toContainEqual(['message_id', 'ordinal'])
  expect(uniqueColumnGroups).toContainEqual(['message_id', 'segment_fingerprint'])
}

function expectDisplayBlockSchemaVersion(db: Database) {
  const row = db.prepare(`
    SELECT value_json AS valueJson
    FROM settings_kv
    WHERE key = 'reasoning_display_blocks_schema_version'
  `).get() as { valueJson?: string } | undefined
  expect(row?.valueJson).toBe('2')
}

function providerNativeColumns(db: Database): ColumnInfo[] {
  return db.prepare('PRAGMA table_info(message_provider_native_contents)').all() as ColumnInfo[]
}

function expectProviderNativeSchemaParity(db: Database) {
  const columns = providerNativeColumns(db)
  const columnByName = new Map(columns.map((column) => [column.name, column]))
  expect(columnByName.get('provider_key')?.notnull).toBe(1)
  expect(columnByName.get('source_api')?.notnull).toBe(1)
  expect(columnByName.get('snapshot_key')?.notnull).toBe(1)
  expect(columnByName.has('role')).toBe(true)
  expect(columnByName.has('usage_json')).toBe(true)
  expect(columnByName.has('model')).toBe(true)

  const uniqueIndexes = db.prepare('PRAGMA index_list(message_provider_native_contents)').all() as IndexInfo[]
  const uniqueColumnGroups = uniqueIndexes
    .filter((index) => index.unique === 1)
    .map((index) => {
      const escapedName = index.name.replace(/"/g, '""')
      return (db.prepare(`PRAGMA index_info("${escapedName}")`).all() as IndexColumnInfo[])
        .map((column) => column.name)
    })
  expect(uniqueColumnGroups).toContainEqual(['message_id', 'provider_key', 'source_api', 'snapshot_key'])
}

function createTempDbPath(tempDirs: string[]) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-reasoning-schema-'))
  tempDirs.push(tempDir)
  return path.join(tempDir, 'starverse.sqlite')
}

function seedLegacyDisplayBlockDatabase(
  dbPath: string,
  options: Readonly<{ providerKeyNullable?: boolean; includeAssetForeignKeys?: boolean }> = {},
) {
  const baseSchemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  const baseSchema = readFileSync(baseSchemaPath, 'utf8')
  const db = new BetterSqlite3(dbPath)
  try {
    db.exec(baseSchema)
    const providerKeyDefinition = options.providerKeyNullable === false
      ? 'provider_key TEXT NOT NULL CHECK (length(provider_key) > 0)'
      : 'provider_key TEXT'
    const assetIdDefinition = options.includeAssetForeignKeys === true
      ? 'asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL'
      : 'asset_id TEXT'
    const fileAssetIdDefinition = options.includeAssetForeignKeys === true
      ? 'file_asset_id TEXT REFERENCES file_assets(id) ON DELETE SET NULL'
      : 'file_asset_id TEXT'
    const sourceRawSegmentDefinition = options.includeAssetForeignKeys === true
      ? 'source_raw_segment_id INTEGER REFERENCES message_reasoning_detail_segments(segment_id) ON DELETE SET NULL'
      : 'source_raw_segment_id INTEGER'
    const assetValue = options.includeAssetForeignKeys === true ? 'NULL' : "'missing-asset'"
    const fileAssetValue = options.includeAssetForeignKeys === true ? 'NULL' : "'missing-file-asset'"
    const sourceRawSegmentValue = options.includeAssetForeignKeys === true ? 'NULL' : '404'

    db.exec(`
      DROP TABLE message_reasoning_display_blocks;
      CREATE TABLE message_reasoning_display_blocks (
        block_id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        block_type TEXT NOT NULL CHECK (block_type IN ('text', 'image', 'opaque')),
        text TEXT,
        semantic_role TEXT CHECK (
          semantic_role IS NULL OR semantic_role IN ('summary', 'reasoning', 'thinking', 'thought')
        ),
        ${assetIdDefinition},
        ${fileAssetIdDefinition},
        url TEXT,
        mime TEXT,
        width INTEGER,
        height INTEGER,
        alt TEXT,
        label TEXT,
        warning TEXT,
        ${providerKeyDefinition},
        source_event_type TEXT,
        ${sourceRawSegmentDefinition},
        payload_json TEXT,
        created_at INTEGER,
        final_at INTEGER,
        segment_fingerprint TEXT
      );
    `)

    const now = Date.now()
    db.prepare(`
      INSERT INTO convo (id, project_id, title, created_at, updated_at, meta)
      VALUES ('c1', NULL, 'legacy', @now, @now, NULL)
    `).run({ now })
    db.prepare(`
      INSERT INTO message (id, convo_id, role, created_at, seq, status)
      VALUES ('m1', 'c1', 'assistant', @now, 1, 'final')
    `).run({ now })
    db.prepare(`
      INSERT INTO message_reasoning_display_blocks (
        block_id,
        message_id,
        ordinal,
        block_type,
        text,
        provider_key,
        asset_id,
        file_asset_id,
        source_raw_segment_id,
        created_at,
        segment_fingerprint
      )
      VALUES (
        'legacy-display-1',
        'm1',
        0,
        'text',
        'legacy thought',
        ${options.providerKeyNullable === false ? "'legacy_provider'" : 'NULL'},
        ${assetValue},
        ${fileAssetValue},
        ${sourceRawSegmentValue},
        @now,
        'legacy-fingerprint'
      )
    `).run({ now })
  } finally {
    db.close()
  }
}

function seedLegacyProviderNativeDatabase(dbPath: string) {
  const baseSchemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  const baseSchema = readFileSync(baseSchemaPath, 'utf8')
  const db = new BetterSqlite3(dbPath)
  try {
    db.exec(baseSchema)
    db.exec(`
      DROP TABLE message_provider_native_contents;
      CREATE TABLE message_provider_native_contents (
        message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
        provider_key TEXT NOT NULL CHECK (provider_key = 'google_ai_studio'),
        source_api TEXT NOT NULL CHECK (source_api = 'gemini_generate_content'),
        candidate_index INTEGER NOT NULL CHECK (candidate_index >= 0),
        status TEXT NOT NULL CHECK (status IN ('streaming', 'final', 'error', 'cancelled')),
        content_json TEXT NOT NULL,
        finish_reason TEXT,
        usage_metadata_json TEXT,
        model_version TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, provider_key, source_api, candidate_index)
      );
    `)
    const now = Date.now()
    db.prepare(`
      INSERT INTO convo (id, project_id, title, created_at, updated_at, meta)
      VALUES ('c1', NULL, 'legacy native', @now, @now, NULL)
    `).run({ now })
    db.prepare(`
      INSERT INTO message (id, convo_id, role, created_at, seq, status)
      VALUES ('m1', 'c1', 'assistant', @now, 1, 'final')
    `).run({ now })
    db.prepare(`
      INSERT INTO message_provider_native_contents (
        message_id,
        provider_key,
        source_api,
        candidate_index,
        status,
        content_json,
        finish_reason,
        usage_metadata_json,
        model_version,
        created_at,
        updated_at
      )
      VALUES (
        'm1',
        'google_ai_studio',
        'gemini_generate_content',
        3,
        'final',
        '{"role":"model","parts":[{"text":"ok","thoughtSignature":"sig"}]}',
        'STOP',
        '{"totalTokenCount":4}',
        'gemini-test',
        @now,
        @now
      )
    `).run({ now })
  } finally {
    db.close()
  }
}

describe('DbWorkerRuntime reasoning schema migration', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // no-op
      }
    }
  })

  it('adds annotations_json for legacy message schema and keeps message APIs available', async () => {
    const baseSchemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
    const baseSchema = readFileSync(baseSchemaPath, 'utf8')
    const legacySchema = baseSchema.replace(/^\s*annotations_json TEXT,\r?\n/m, '')
    expect(legacySchema.includes('annotations_json TEXT')).toBe(false)

    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-legacy-schema-'))
    tempDirs.push(tempDir)
    const legacySchemaPath = path.join(tempDir, 'schema.legacy.sql')
    writeFileSync(legacySchemaPath, legacySchema, 'utf8')

    const runtime = new DbWorkerRuntime({
      dbPath: ':memory:',
      schemaPath: legacySchemaPath,
    })
    try {
      const columns = runtime.db.prepare('PRAGMA table_info(message)').all() as Array<{ name: string }>
      expect(columns.some((c) => c.name === 'annotations_json')).toBe(true)

      const created = await runtime.handleMessage({
        id: 'c1',
        method: 'convo.create',
        params: { title: 'Legacy Conversation' },
      })
      expect(created.ok).toBe(true)
      const convoId = String((created as any).result?.id ?? '')
      expect(convoId.length).toBeGreaterThan(0)

      const appended = await runtime.handleMessage({
        id: 'm1',
        method: 'message.append',
        params: {
          convoId,
          role: 'assistant',
          body: 'hello',
        },
      })
      expect(appended.ok).toBe(true)
      const messageId = String((appended as any).result?.id ?? '')
      expect(messageId.length).toBeGreaterThan(0)

      const saved = await runtime.handleMessage({
        id: 'm2',
        method: 'message.setAnnotations',
        params: {
          messageId,
          annotations: [{ type: 'url_citation', url: 'https://example.com' }],
        },
      })
      expect(saved.ok).toBe(true)

      const listed = await runtime.handleMessage({
        id: 'm3',
        method: 'message.list',
        params: { convoId },
      })
      expect(listed.ok).toBe(true)
      const rows = (listed as any).result as Array<{ meta?: any }>
      expect(Array.isArray(rows)).toBe(true)
      expect(rows[0]?.meta?.annotations).toEqual([{ type: 'url_citation', url: 'https://example.com' }])
    } finally {
      runtime.shutdown()
    }
  })

  it('creates fresh reasoning display block schema with asset and raw segment constraints', () => {
    const dbPath = createTempDbPath(tempDirs)
    const runtime = new DbWorkerRuntime({ dbPath })
    try {
      expectDisplayBlockSchemaParity(runtime.db)
      expectDisplayBlockSchemaVersion(runtime.db)
    } finally {
      runtime.shutdown()
    }
  })

  it('creates fresh provider-native schema with provider-neutral snapshot key', () => {
    const dbPath = createTempDbPath(tempDirs)
    const runtime = new DbWorkerRuntime({ dbPath })
    try {
      expectProviderNativeSchemaParity(runtime.db)
    } finally {
      runtime.shutdown()
    }
  })

  it('migrates legacy Gemini provider-native rows to snapshot_key per candidate index', () => {
    const dbPath = createTempDbPath(tempDirs)
    seedLegacyProviderNativeDatabase(dbPath)

    const runtime = new DbWorkerRuntime({ dbPath })
    try {
      expectProviderNativeSchemaParity(runtime.db)
      const row = runtime.db.prepare(`
        SELECT snapshot_key AS snapshotKey, candidate_index AS candidateIndex, usage_json AS usageJson
        FROM message_provider_native_contents
        WHERE message_id = 'm1'
      `).get() as { snapshotKey: string; candidateIndex: number; usageJson: string }
      expect(row).toEqual({
        snapshotKey: 'candidate:3',
        candidateIndex: 3,
        usageJson: '{"totalTokenCount":4}',
      })
    } finally {
      runtime.shutdown()
    }
  })

  it('drops and recreates legacy reasoning display block table with nullable providerKey', () => {
    const dbPath = createTempDbPath(tempDirs)
    seedLegacyDisplayBlockDatabase(dbPath, { providerKeyNullable: true, includeAssetForeignKeys: true })

    const runtime = new DbWorkerRuntime({ dbPath })
    try {
      expectDisplayBlockSchemaParity(runtime.db)
      expectDisplayBlockSchemaVersion(runtime.db)
      const count = runtime.db.prepare(`
        SELECT COUNT(*) AS count
        FROM message_reasoning_display_blocks
        WHERE block_id = 'legacy-display-1'
      `).get() as { count: number }
      expect(count.count).toBe(0)
    } finally {
      runtime.shutdown()
    }
  })

  it('drops and recreates legacy reasoning display block table without asset/raw foreign keys', () => {
    const dbPath = createTempDbPath(tempDirs)
    seedLegacyDisplayBlockDatabase(dbPath, { providerKeyNullable: false, includeAssetForeignKeys: false })

    const runtime = new DbWorkerRuntime({ dbPath })
    try {
      expectDisplayBlockSchemaParity(runtime.db)
      expectDisplayBlockSchemaVersion(runtime.db)
      const count = runtime.db.prepare(`
        SELECT COUNT(*) AS count
        FROM message_reasoning_display_blocks
        WHERE block_id = 'legacy-display-1'
      `).get() as { count: number }
      expect(count.count).toBe(0)
    } finally {
      runtime.shutdown()
    }
  })
})

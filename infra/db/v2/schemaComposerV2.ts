import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'

const MAX_FRAGMENT_BYTES = 4 * 1024 * 1024
const MANIFEST_ID = 'generation_compiler_v2'
const MANIFEST_TABLE_SQL = `
  CREATE TABLE generation_v2_schema_manifest (
    manifest_id TEXT PRIMARY KEY CHECK (manifest_id = '${MANIFEST_ID}'),
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    schema_digest TEXT NOT NULL CHECK (
      length(schema_digest) = 64 AND schema_digest NOT GLOB '*[^0-9a-f]*'
    ),
    fragment_count INTEGER NOT NULL CHECK (fragment_count = 18),
    object_projection_digest TEXT NOT NULL CHECK (
      length(object_projection_digest) = 64
      AND object_projection_digest NOT GLOB '*[^0-9a-f]*'
    )
  )
`
const FRAGMENTS = Object.freeze([
  Object.freeze({ id: 'core_conversation_v1', fileName: 'coreConversationSchema.sql' }),
  Object.freeze({ id: 'generation_config_v1', fileName: 'generationConfigSchema.sql' }),
  Object.freeze({ id: 'tool_registry_v1', fileName: 'toolRegistrySchema.sql' }),
  Object.freeze({ id: 'attachment_asset_v1', fileName: 'attachmentAssetSchema.sql' }),
  Object.freeze({ id: 'openrouter_images_v1', fileName: 'openRouterImagesSchema.sql' }),
  Object.freeze({ id: 'deepseek_stable_model_evidence_v1', fileName: 'deepSeekStableModelEvidenceSchema.sql' }),
  Object.freeze({ id: 'openai_responses_model_evidence_v1', fileName: 'openAIResponsesModelEvidenceSchema.sql' }),
  Object.freeze({ id: 'anthropic_model_evidence_v1', fileName: 'anthropicModelEvidenceSchema.sql' }),
  Object.freeze({ id: 'gemini_model_evidence_v1', fileName: 'geminiModelEvidenceSchema.sql' }),
  Object.freeze({ id: 'local_endpoint_profile_v1', fileName: 'localEndpointProfileSchema.sql' }),
  Object.freeze({ id: 'reasoning_projection_v1', fileName: 'reasoningProjectionSchema.sql' }),
  Object.freeze({ id: 'composer_draft_v1', fileName: 'composerDraftSchema.sql' }),
  Object.freeze({ id: 'generation_execution_v1', fileName: 'generationExecutionSchema.sql' }),
  Object.freeze({ id: 'generation_v2_search_v1', fileName: 'searchSchema.sql' }),
  Object.freeze({ id: 'engine_plugin_registry_v1', fileName: 'enginePluginRegistrySchema.sql' }),
  Object.freeze({ id: 'openai_chat_compatible_v1', fileName: 'openAIChatCompatibleSchema.sql' }),
  Object.freeze({ id: 'model_preferences_v1', fileName: 'modelPreferencesSchema.sql' }),
  Object.freeze({ id: 'dfc_attachment_v1', fileName: 'dfcAttachmentSchema.sql' }),
] as const)

export class GenerationV2SchemaComposerError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_SCHEMA_ROOT_INVALID'
    | 'GENERATION_V2_SCHEMA_FRAGMENT_INVALID'
    | 'GENERATION_V2_SCHEMA_FRAGMENT_TOO_LARGE'
    | 'GENERATION_V2_SCHEMA_DATABASE_BUSY'
    | 'GENERATION_V2_SCHEMA_STATE_INVALID') {
    super(code)
    this.name = 'GenerationV2SchemaComposerError'
  }
}

export type GenerationV2SchemaBundle = Readonly<{
  classification: 'epoch_2_schema_bundle'
  executionAuthority: 'none'
  schemaVersion: 1
  schemaDigest: string
  fragmentIds: readonly string[]
  objectProjectionDigest: string | null
}>

type LoadedFragment = Readonly<{
  id: string
  fileName: string
  bytes: Buffer
  sql: string
}>

type SchemaObject = Readonly<{
  type: 'index' | 'table' | 'trigger' | 'view'
  name: string
}>

// FTS5 owns these five SQLite-internal tables for the one reviewed epoch-2
// virtual table. They are not user schema objects, but they must be present
// exactly so the closed-schema verifier neither rejects a valid FTS index nor
// hides a caller-created lookalike table.
const FTS5_SEARCH_SHADOW_TABLES = Object.freeze([
  'generation_v2_search_fts_config',
  'generation_v2_search_fts_content',
  'generation_v2_search_fts_data',
  'generation_v2_search_fts_docsize',
  'generation_v2_search_fts_idx',
] as const)
const fts5SearchShadowNames = new Set<string>(FTS5_SEARCH_SHADOW_TABLES)

function normalizedSql(sql: string): string {
  return sql.replace(/;\s*$/u, '').replace(/\s+/gu, ' ').trim()
}

function assertRoot(rootPath: string): string {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath) || rootPath.includes('\0')) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_ROOT_INVALID')
  }
  return path.resolve(rootPath)
}

function readFragment(rootPath: string, id: string, fileName: string): LoadedFragment {
  const v2Root = path.resolve(rootPath, 'infra', 'db', 'v2')
  const fragmentPath = path.resolve(v2Root, fileName)
  const relative = path.relative(v2Root, fragmentPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_ROOT_INVALID')
  }
  const bytes = readFileSync(fragmentPath)
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FRAGMENT_BYTES) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_TOO_LARGE')
  }
  const sql = bytes.toString('utf8')
  if (Buffer.byteLength(sql, 'utf8') !== bytes.byteLength || sql.includes('\0') ||
      !sql.startsWith('-- Generation Compiler V2') ||
      /^\s*(?:PRAGMA|ATTACH|DETACH|VACUUM|COMMIT|ROLLBACK)\b/imu.test(sql) ||
      /^\s*BEGIN(?:\s+(?:DEFERRED|IMMEDIATE|EXCLUSIVE|TRANSACTION))?\s*;/imu.test(sql) ||
      /CREATE\s+(?:TABLE|VIEW|TRIGGER|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:project|convo|message|message_body|branch|branch_choice|branch_answer_hide)\b/iu.test(sql)) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
  }
  return Object.freeze({ id, fileName, bytes, sql })
}

function loadFragments(rootPath: string): readonly LoadedFragment[] {
  const root = assertRoot(rootPath)
  return Object.freeze(FRAGMENTS.map((fragment) =>
    readFragment(root, fragment.id, fragment.fileName)))
}

function digestFragments(fragments: readonly LoadedFragment[]): string {
  const hasher = createHash('sha256')
  for (const fragment of fragments) {
    hasher.update(fragment.id, 'utf8')
    hasher.update('\0', 'utf8')
    hasher.update(fragment.bytes)
    hasher.update('\0', 'utf8')
  }
  return hasher.digest('hex')
}

function extractExpectedObjects(fragments: readonly LoadedFragment[]): readonly SchemaObject[] {
  const objects: SchemaObject[] = []
  const seen = new Set<string>()
  const expression = /CREATE\s+(?:UNIQUE\s+)?(?:VIRTUAL\s+)?(TABLE|INDEX|TRIGGER|VIEW)\s+IF\s+NOT\s+EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/giu
  for (const fragment of fragments) {
    for (const match of fragment.sql.matchAll(expression)) {
      const type = match[1].toLowerCase() as SchemaObject['type']
      const name = match[2]
      const key = `${type}\0${name}`
      if (name === 'generation_v2_schema_manifest' || seen.has(key)) {
        throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
      }
      seen.add(key)
      objects.push(Object.freeze({ type, name }))
    }
  }
  if (objects.length === 0) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
  }
  return Object.freeze(objects.sort((a, b) => {
    const left = `${a.type}\0${a.name}`
    const right = `${b.type}\0${b.name}`
    return left < right ? -1 : left > right ? 1 : 0
  }))
}

function readInstalledProjection(
  db: BetterSqlite3.Database,
  expected: readonly SchemaObject[],
  manifestExpected: boolean,
): Readonly<{ rows: readonly unknown[]; digest: string }> {
  const allRows = db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `).all() as Array<{
    type: string
    name: string
    tbl_name: string
    sql: string | null
  }>
  const shadowRows = allRows.filter((row) => fts5SearchShadowNames.has(row.name))
  if (shadowRows.length !== FTS5_SEARCH_SHADOW_TABLES.length ||
      shadowRows.some((row) => row.type !== 'table' || typeof row.sql !== 'string') ||
      FTS5_SEARCH_SHADOW_TABLES.some((name) => !shadowRows.some((row) => row.name === name))) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  const nonShadowRows = allRows.filter((row) => !fts5SearchShadowNames.has(row.name))
  const expectedKeys = new Set(expected.map((object) => `${object.type}\0${object.name}`))
  if (manifestExpected) expectedKeys.add('table\0generation_v2_schema_manifest')
  if (nonShadowRows.length !== expectedKeys.size || nonShadowRows.some((row) =>
    !expectedKeys.has(`${row.type}\0${row.name}`) || typeof row.sql !== 'string')) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  const rows = nonShadowRows.filter((row) => row.name !== 'generation_v2_schema_manifest')
  if (rows.length !== expected.length || expected.some((object) =>
    !rows.some((row) => row.type === object.type && row.name === object.name && typeof row.sql === 'string'))) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  const projection = rows.map((row) => Object.freeze({
    type: row.type, name: row.name, tableName: row.tbl_name, sql: row.sql,
  }))
  return Object.freeze({
    rows: Object.freeze(projection),
    digest: createHash('sha256').update(JSON.stringify(projection), 'utf8').digest('hex'),
  })
}

function bundle(
  fragments: readonly LoadedFragment[],
  schemaDigest: string,
  objectProjectionDigest: string | null,
): GenerationV2SchemaBundle {
  return Object.freeze({
    classification: 'epoch_2_schema_bundle',
    executionAuthority: 'none',
    schemaVersion: 1,
    schemaDigest,
    fragmentIds: Object.freeze(fragments.map((fragment) => fragment.id)),
    objectProjectionDigest,
  })
}

export function inspectGenerationV2SchemaBundle(rootPath: string): GenerationV2SchemaBundle {
  const fragments = loadFragments(rootPath)
  return bundle(fragments, digestFragments(fragments), null)
}

function verifyLoadedGenerationV2Schema(
  db: BetterSqlite3.Database,
  fragments: readonly LoadedFragment[],
  schemaDigest: string,
  expectedObjects: readonly SchemaObject[],
): GenerationV2SchemaBundle {
  const manifestObject = db.prepare(
    "SELECT type, sql FROM sqlite_master WHERE name = 'generation_v2_schema_manifest'",
  ).get() as { type: string; sql: string | null } | undefined
  if (manifestObject?.type !== 'table' || typeof manifestObject.sql !== 'string' ||
      normalizedSql(manifestObject.sql) !== normalizedSql(MANIFEST_TABLE_SQL)) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  const manifest = db.prepare(`SELECT schema_version, schema_digest, fragment_count, object_projection_digest
      FROM generation_v2_schema_manifest WHERE manifest_id = ?`).get(MANIFEST_ID) as {
      schema_version: number
      schema_digest: string
      fragment_count: number
      object_projection_digest: string
    } | undefined
  if (!manifest || manifest.schema_version !== 1 || manifest.schema_digest !== schemaDigest ||
      manifest.fragment_count !== fragments.length) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  const projection = readInstalledProjection(db, expectedObjects, true)
  if (projection.digest !== manifest.object_projection_digest ||
      (db.pragma('foreign_key_check') as unknown[]).length !== 0 ||
      db.pragma('integrity_check', { simple: true }) !== 'ok') {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  return bundle(fragments, schemaDigest, projection.digest)
}

export function verifyInstalledGenerationV2SchemaInActiveTransaction(
  db: BetterSqlite3.Database,
  rootPath: string,
): GenerationV2SchemaBundle {
  if (!db.inTransaction) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DATABASE_BUSY')
  const fragments = loadFragments(rootPath)
  return verifyLoadedGenerationV2Schema(
    db,
    fragments,
    digestFragments(fragments),
    extractExpectedObjects(fragments),
  )
}

export function installGenerationV2SchemaInActiveTransaction(
  db: BetterSqlite3.Database,
  rootPath: string,
): GenerationV2SchemaBundle {
  if (!db.inTransaction) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DATABASE_BUSY')
  const fragments = loadFragments(rootPath)
  const schemaDigest = digestFragments(fragments)
  const expectedObjects = extractExpectedObjects(fragments)

  if (db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }

  const manifestObject = db.prepare(
    "SELECT type FROM sqlite_master WHERE name = 'generation_v2_schema_manifest'",
  ).get() as { type: string } | undefined
  if (manifestObject?.type === 'table') {
    return verifyLoadedGenerationV2Schema(db, fragments, schemaDigest, expectedObjects)
  }

  if (manifestObject || expectedObjects.some((object) => db.prepare(
    'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?',
  ).get(object.type, object.name))) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }

  for (const fragment of fragments) db.exec(fragment.sql)
  const projection = readInstalledProjection(db, expectedObjects, false)
  if ((db.pragma('foreign_key_check') as unknown[]).length !== 0 ||
      db.pragma('integrity_check', { simple: true }) !== 'ok') {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }

  // Keep the runtime guard coupled to the manifest's fixed fragment contract.
  // A stale literal here would make every new epoch database unbootable even
  // when the reviewed fragment list and manifest agree.
  if (fragments.length !== FRAGMENTS.length) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
  }
  db.exec(MANIFEST_TABLE_SQL)
  db.prepare(`INSERT INTO generation_v2_schema_manifest (
    manifest_id, schema_version, schema_digest, fragment_count, object_projection_digest
  ) VALUES (?, 1, ?, ?, ?)`).run(
    MANIFEST_ID, schemaDigest, fragments.length, projection.digest,
  )
  return verifyLoadedGenerationV2Schema(db, fragments, schemaDigest, expectedObjects)
}

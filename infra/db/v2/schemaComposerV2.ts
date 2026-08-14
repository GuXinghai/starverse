import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'

const MAX_FRAGMENT_BYTES = 4 * 1024 * 1024
const MANIFEST_ID = 'generation_compiler_v2'
const MODEL_CATALOG_FRAGMENT_ID = 'model_catalog_v2'
const GENERATION_EXECUTION_FRAGMENT_ID = 'generation_execution_v1'
const LEGACY_MODEL_EVIDENCE_NAMESPACES = Object.freeze([
  Object.freeze({ setTable: 'deepseek_stable_model_evidence_sets', clockTable: 'deepseek_stable_model_evidence_generation_clock',
    setDeleteTrigger: 'deepseek_stable_model_evidence_no_delete',
    clockDeleteTrigger: 'deepseek_stable_model_evidence_clock_no_delete' }),
  Object.freeze({ setTable: 'openai_responses_model_evidence_sets', clockTable: 'openai_responses_model_evidence_generation_clock',
    setDeleteTrigger: 'openai_responses_model_evidence_no_delete',
    clockDeleteTrigger: 'openai_responses_model_evidence_clock_no_delete' }),
  Object.freeze({ setTable: 'anthropic_model_evidence_sets', clockTable: 'anthropic_model_evidence_generation_clock',
    setDeleteTrigger: 'anthropic_model_evidence_no_delete',
    clockDeleteTrigger: 'anthropic_model_evidence_clock_no_delete' }),
  Object.freeze({ setTable: 'gemini_model_evidence_sets', clockTable: 'gemini_model_evidence_generation_clock',
    setDeleteTrigger: 'gemini_model_evidence_no_delete',
    clockDeleteTrigger: 'gemini_model_evidence_clock_no_delete' }),
] as const)
const MODEL_CATALOG_TABLES = Object.freeze([
  'model_catalog_snapshot_v2',
  'model_catalog_scope_v2',
] as const)
const MANIFEST_TABLE_SQL = `
  CREATE TABLE generation_v2_schema_manifest (
    manifest_id TEXT PRIMARY KEY CHECK (manifest_id = '${MANIFEST_ID}'),
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    schema_digest TEXT NOT NULL CHECK (
      length(schema_digest) = 64 AND schema_digest NOT GLOB '*[^0-9a-f]*'
    ),
    fragment_count INTEGER NOT NULL CHECK (fragment_count = 17),
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
  Object.freeze({ id: 'file_type_detection_v2', fileName: 'fileTypeDetectionSchema.sql' }),
  Object.freeze({ id: 'openrouter_images_v1', fileName: 'openRouterImagesSchema.sql' }),
  Object.freeze({ id: 'local_endpoint_profile_v1', fileName: 'localEndpointProfileSchema.sql' }),
  Object.freeze({ id: 'reasoning_projection_v1', fileName: 'reasoningProjectionSchema.sql' }),
  Object.freeze({ id: 'composer_draft_v1', fileName: 'composerDraftSchema.sql' }),
  Object.freeze({ id: 'generation_execution_v1', fileName: 'generationExecutionSchema.sql' }),
  Object.freeze({ id: 'generation_v2_search_v1', fileName: 'searchSchema.sql' }),
  Object.freeze({ id: 'engine_plugin_registry_v1', fileName: 'enginePluginRegistrySchema.sql' }),
  Object.freeze({ id: 'openai_chat_compatible_v1', fileName: 'openAIChatCompatibleSchema.sql' }),
  Object.freeze({ id: 'model_preferences_v2', fileName: 'modelPreferencesSchema.sql' }),
  Object.freeze({ id: 'model_catalog_v2', fileName: 'modelCatalogSchemaV2.sql' }),
  Object.freeze({ id: 'dfc_attachment_v1', fileName: 'dfcAttachmentSchema.sql' }),
  Object.freeze({ id: 'conversation_route_preference_v1', fileName: 'conversationRoutePreferenceSchema.sql' }),
] as const)

export class GenerationV2SchemaComposerError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_SCHEMA_ROOT_INVALID'
    | 'GENERATION_V2_SCHEMA_FRAGMENT_INVALID'
    | 'GENERATION_V2_SCHEMA_FRAGMENT_TOO_LARGE'
    | 'GENERATION_V2_SCHEMA_DATABASE_BUSY'
    | 'GENERATION_V2_SCHEMA_DIGEST_MISMATCH'
    | 'GENERATION_V2_SCHEMA_STATE_INVALID', readonly detail: string | null = null) {
    super(detail ? `${code}:${detail}` : code)
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

type InstalledSchemaRow = Readonly<{
  type: string
  name: string
  tbl_name: string
  sql: string | null
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

function installedSchemaRows(db: BetterSqlite3.Database): readonly InstalledSchemaRow[] {
  return db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `).all() as InstalledSchemaRow[]
}

function projectionDigestFromRows(rows: readonly InstalledSchemaRow[]): string {
  const projection = rows
    .filter((row) => !fts5SearchShadowNames.has(row.name) && row.name !== 'generation_v2_schema_manifest')
    .map((row) => Object.freeze({
      type: row.type,
      name: row.name,
      tableName: row.tbl_name,
      sql: row.sql,
    }))
  return createHash('sha256').update(JSON.stringify(projection), 'utf8').digest('hex')
}

function isModelCatalogObjectName(name: string): boolean {
  return name.startsWith('model_catalog_')
}

function isModelCatalogSchemaRow(row: InstalledSchemaRow): boolean {
  return isModelCatalogObjectName(row.name) || isModelCatalogObjectName(row.tbl_name)
}

function isLegacyModelEvidenceSchemaRow(row: InstalledSchemaRow): boolean {
  return LEGACY_MODEL_EVIDENCE_NAMESPACES.some((namespace) =>
    row.name === namespace.setTable || row.name === namespace.clockTable ||
    row.name === namespace.setDeleteTrigger || row.name === namespace.clockDeleteTrigger ||
    row.tbl_name === namespace.setTable || row.tbl_name === namespace.clockTable)
}

function schemaRowsEqual(left: readonly InstalledSchemaRow[], right: readonly InstalledSchemaRow[]): boolean {
  if (left.length !== right.length) return false
  return left.every((row, index) => {
    const other = right[index]
    return other !== undefined && row.type === other.type && row.name === other.name &&
      row.tbl_name === other.tbl_name && normalizedSql(row.sql ?? '') === normalizedSql(other.sql ?? '')
  })
}

function firstSchemaRowDifference(
  left: readonly InstalledSchemaRow[],
  right: readonly InstalledSchemaRow[],
): string {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const current = left[index]
    const expected = right[index]
    if (!current) return `missing_installed:${expected?.type ?? 'unknown'}:${expected?.name ?? 'unknown'}`
    if (!expected) return `unexpected_installed:${current.type}:${current.name}`
    if (current.type !== expected.type || current.name !== expected.name) {
      return `object_identity:${current.type}:${current.name}:${expected.type}:${expected.name}`
    }
    if (current.tbl_name !== expected.tbl_name) return `table_binding:${current.type}:${current.name}`
    if (normalizedSql(current.sql ?? '') !== normalizedSql(expected.sql ?? '')) {
      return `object_sql:${current.type}:${current.name}`
    }
  }
  return 'unknown'
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
  const allRows = installedSchemaRows(db)
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
  if (!manifest || manifest.schema_version !== 1) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  if (manifest.schema_digest !== schemaDigest || manifest.fragment_count !== fragments.length) {
    // The installed schema was built by a different fragment set than the
    // current build. This is a deliberate, non-corrupting state transition
    // (build advanced) and is classified separately from corruption/tampering
    // so the caller can offer a backup-and-recreate recovery instead of
    // reporting a damaged database.
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DIGEST_MISMATCH')
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

export type ModelCatalogNamespaceResetV2Result = Readonly<{
  classification: 'model_catalog_namespace_reset_v2'
  discardedScopeCount: number
  discardedSnapshotCount: number
  discardedLegacyEvidenceSetCount: number
  discardedLegacyEvidenceClockCount: number
  credentialEnvelopeRevision: number
  schemaDigest: string
  objectProjectionDigest: string
}>

/**
 * Explicit, destructive catalog-only maintenance authority.
 *
 * This is intentionally not called by normal schema installation: an old
 * catalog is never decoded or migrated. The caller must own one active write
 * transaction. Every non-catalog schema object must already match the current
 * build exactly before the two catalog tables can be replaced.
 */
export function resetModelCatalogNamespaceV2InActiveTransaction(
  db: BetterSqlite3.Database,
  rootPath: string,
): ModelCatalogNamespaceResetV2Result {
  if (!db.inTransaction) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DATABASE_BUSY')
  if (db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  const credentialEnvelopeBefore = db.prepare(`SELECT envelope_revision
    FROM epoch_scope_key_envelope_v2 WHERE singleton_id = 1`).get() as { envelope_revision: number } | undefined
  if (!credentialEnvelopeBefore || !Number.isSafeInteger(credentialEnvelopeBefore.envelope_revision) ||
      credentialEnvelopeBefore.envelope_revision < 1) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }

  const fragments = loadFragments(rootPath)
  const schemaDigest = digestFragments(fragments)
  const expectedObjects = extractExpectedObjects(fragments)
  const catalogFragment = fragments.find((fragment) => fragment.id === MODEL_CATALOG_FRAGMENT_ID)
  const generationExecutionFragment = fragments.find((fragment) => fragment.id === GENERATION_EXECUTION_FRAGMENT_ID)
  if (!catalogFragment || !generationExecutionFragment) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
  }

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
  const appMeta = db.prepare('SELECT schema_digest FROM app_meta_v2 WHERE singleton_id = 1').get() as {
    schema_digest: string
  } | undefined
  if (!manifest || manifest.schema_version !== 1 || manifest.fragment_count !== fragments.length ||
      !/^[0-9a-f]{64}$/u.test(manifest.schema_digest) ||
      !/^[0-9a-f]{64}$/u.test(manifest.object_projection_digest) ||
      appMeta?.schema_digest !== manifest.schema_digest) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }

  const installedRows = installedSchemaRows(db)
  if (projectionDigestFromRows(installedRows) !== manifest.object_projection_digest) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }

  const expectedDb = new BetterSqlite3(':memory:')
  let expectedRows: readonly InstalledSchemaRow[]
  try {
    expectedDb.pragma('foreign_keys = ON')
    expectedDb.exec('BEGIN IMMEDIATE')
    installGenerationV2SchemaInActiveTransaction(expectedDb, rootPath)
    expectedDb.exec('COMMIT')
    expectedRows = installedSchemaRows(expectedDb)
  } finally {
    if (expectedDb.open) expectedDb.close()
  }

  const outsideCatalog = (row: InstalledSchemaRow) =>
    !isModelCatalogSchemaRow(row) && !isLegacyModelEvidenceSchemaRow(row) &&
    row.name !== 'generation_v2_schema_manifest'
  const installedOutsideCatalog = installedRows.filter(outsideCatalog)
  const expectedOutsideCatalog = expectedRows.filter(outsideCatalog)
  if (!schemaRowsEqual(installedOutsideCatalog, expectedOutsideCatalog)) {
    throw new GenerationV2SchemaComposerError(
      'GENERATION_V2_SCHEMA_STATE_INVALID',
      firstSchemaRowDifference(installedOutsideCatalog, expectedOutsideCatalog),
    )
  }
  const installedCatalogRows = installedRows.filter(isModelCatalogSchemaRow)
  const expectedCatalogRows = expectedRows.filter(isModelCatalogSchemaRow)
  if (schemaRowsEqual(installedCatalogRows, expectedCatalogRows)) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  const installedCatalogTables = installedCatalogRows
    .filter((row) => row.type === 'table')
    .map((row) => row.name)
    .sort()
  if (installedCatalogTables.join('\0') !== [...MODEL_CATALOG_TABLES].sort().join('\0')) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }

  for (const row of installedRows.filter((candidate) => candidate.type === 'table' && outsideCatalog(candidate))) {
    const escapedName = row.name.replace(/"/gu, '""')
    const references = db.prepare(`PRAGMA foreign_key_list("${escapedName}")`).all() as Array<{ table: string }>
    if (references.some((reference) => isModelCatalogObjectName(reference.table))) {
      throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
  }

  const discardedScopeCount = (db.prepare('SELECT count(*) AS count FROM model_catalog_scope_v2').get() as { count: number }).count
  const discardedSnapshotCount = (db.prepare('SELECT count(*) AS count FROM model_catalog_snapshot_v2').get() as { count: number }).count
  for (const type of ['trigger', 'view', 'index'] as const) {
    for (const row of installedCatalogRows.filter((candidate) => candidate.type === type)) {
      const escapedName = row.name.replace(/"/gu, '""')
      db.exec(`DROP ${type.toUpperCase()} "${escapedName}"`)
    }
  }
  db.exec('DROP TABLE model_catalog_snapshot_v2')
  db.exec('DROP TABLE model_catalog_scope_v2')
  db.exec(catalogFragment.sql)

  let discardedLegacyEvidenceSetCount = 0
  let discardedLegacyEvidenceClockCount = 0
  for (const namespace of LEGACY_MODEL_EVIDENCE_NAMESPACES) {
    const setExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(namespace.setTable)
    const clockExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(namespace.clockTable)
    if (!setExists && !clockExists) continue
    if (!setExists || !clockExists) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    discardedLegacyEvidenceSetCount += (db.prepare(`SELECT count(*) AS count FROM "${namespace.setTable}"`).get() as
      { count: number }).count
    discardedLegacyEvidenceClockCount += (db.prepare(`SELECT count(*) AS count FROM "${namespace.clockTable}"`).get() as
      { count: number }).count
    db.exec(`DROP TRIGGER IF EXISTS "${namespace.setDeleteTrigger}"`)
    db.exec(`DROP TRIGGER IF EXISTS "${namespace.clockDeleteTrigger}"`)
    db.exec(`DROP TABLE "${namespace.setTable}"`)
    db.exec(`DROP TABLE "${namespace.clockTable}"`)
  }

  db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
  const metaUpdate = db.prepare('UPDATE app_meta_v2 SET schema_digest = ? WHERE singleton_id = 1')
    .run(schemaDigest)
  db.exec(generationExecutionFragment.sql)
  if (metaUpdate.changes !== 1) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }

  const projection = readInstalledProjection(db, expectedObjects, true)
  const manifestUpdate = db.prepare(`UPDATE generation_v2_schema_manifest
    SET schema_digest = ?, fragment_count = ?, object_projection_digest = ?
    WHERE manifest_id = ?`).run(schemaDigest, fragments.length, projection.digest, MANIFEST_ID)
  if (manifestUpdate.changes !== 1) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  const verified = verifyLoadedGenerationV2Schema(db, fragments, schemaDigest, expectedObjects)
  const credentialEnvelopeAfter = db.prepare(`SELECT envelope_revision
    FROM epoch_scope_key_envelope_v2 WHERE singleton_id = 1`).get() as { envelope_revision: number } | undefined
  if (!credentialEnvelopeAfter || credentialEnvelopeAfter.envelope_revision !== credentialEnvelopeBefore.envelope_revision) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  return Object.freeze({
    classification: 'model_catalog_namespace_reset_v2',
    discardedScopeCount,
    discardedSnapshotCount,
    discardedLegacyEvidenceSetCount,
    discardedLegacyEvidenceClockCount,
    credentialEnvelopeRevision: credentialEnvelopeAfter.envelope_revision,
    schemaDigest: verified.schemaDigest,
    objectProjectionDigest: verified.objectProjectionDigest!,
  })
}

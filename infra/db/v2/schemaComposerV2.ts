import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { ENCODING_COVERAGE_REGISTRY_SCHEMA_DIGEST_V2, PRE_REQUEST_CONTRACT_ENCODING_COVERAGE_SCHEMA_DIGEST_V2, PRE_RULE_V2_ENCODING_COVERAGE_SCHEMA_DIGEST_V2 } from '../../../src/core/generation-v2/capability/encodingCoverageRegistryV2'
import { RUNTIME_CAPABILITY_CODEC_SCHEMA_DIGEST_V2, PRE_REQUEST_CONTRACT_RUNTIME_CODEC_SCHEMA_DIGEST_V2 } from '../../../src/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { CANONICAL_MODEL_FACT_ONTOLOGY_SCHEMA_DIGEST_V1, PRE_GEMINI_THINKING_ONTOLOGY_SCHEMA_DIGEST_V1, PRE_REQUEST_CONTRACT_ONTOLOGY_SCHEMA_DIGEST_V1, PRE_RULE_V2_ONTOLOGY_SCHEMA_DIGEST_V1 } from '../../../src/core/generation-v2/model-facts/canonicalSourceFactsV1'
import { RESOLVED_MODEL_FACTS_ONTOLOGY_SCHEMA_DIGEST_V1 } from '../../../src/core/generation-v2/model-facts/resolvedModelFactsV1'
import { SOURCE_PRIORITY_CONFIG_SCHEMA_DIGEST_V1, PRE_RULE_V2_SOURCE_PRIORITY_CONFIG_SCHEMA_DIGEST_V1 } from '../../../src/core/generation-v2/model-facts/sourcePriorityConfigV1'
import { CAPABILITY_RULE_CORE_SCHEMA_DIGEST_V1 } from '../../../src/core/generation-v2/capability-rules/capabilityRuleCoreV1'
import { CAPABILITY_RULE_CORE_SCHEMA_DIGEST_V2 } from '../../../src/core/generation-v2/capability-rules/capabilityRuleCoreV2'

const MAX_FRAGMENT_BYTES = 4 * 1024 * 1024
const MANIFEST_ID = 'generation_compiler_v2'
const MODEL_CATALOG_FRAGMENT_ID = 'model_catalog_v2'
const GENERATION_EXECUTION_FRAGMENT_ID = 'generation_execution_v1'
const INTERRUPTED_REPLAY_MARKER = '-- Interrupted native replay V1: separate from completed continuation artifacts.'
const REQUEST_CONTRACT_MARKER = '-- Request contract V2: durable completion receipts and content-addressed native artifacts.'
const INTERRUPTED_REPLAY_STORAGE_MARKER = '-- Interrupted replay checkpoint V1: bounded exact snapshot bytes in immutable 1 MiB chunks.'
const COMPOSER_EDIT_SESSION_MARKER = '-- Scoped composer edit session V2: one aggregate with its draft.'
// The complete reviewed 4ac2de5 predecessor bundle, including codec digests.
const COMPOSER_EDIT_SESSION_PREDECESSOR_DIGESTS = Object.freeze([
  '95267d0affa2648b9ebb568b4ed76da2c8404104f78801dd3b228135b8ff4681', // committed LF assets
  'dbc731ea21ed71aacd13963bcb0be554dc4a03fbdbe4d5fc18a2dfa1ae74595d', // CRLF serialized assets
  'f37bcbb510e7b7a20d61fa30601dd36fb8cbe2d58c8131b1c25e14e103aea51f', // reviewed mixed-ending Windows checkout
])
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
    fragment_count INTEGER NOT NULL CHECK (fragment_count = 21),
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
  Object.freeze({ id: 'capability_rule_v2', fileName: 'capabilityRuleSchema.sql' }),
  Object.freeze({ id: 'canonical_model_fact_source_v1', fileName: 'canonicalModelFactSourceSchema.sql' }),
  Object.freeze({ id: 'model_facts_source_priority_v1', fileName: 'modelFactsSourcePrioritySchema.sql' }),
  Object.freeze({ id: 'resolved_model_facts_v1', fileName: 'resolvedModelFactsSchema.sql' }),
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

function loadPreRuleV2Fragments(rootPath: string): readonly LoadedFragment[] {
  const root = assertRoot(rootPath)
  return loadPreImageToolFragments(rootPath).map(fragment => fragment.id === 'capability_rule_v2'
    ? readFragment(root, fragment.id, 'capabilityRuleSchemaPreRuleV2.sql')
    : fragment.id === 'model_facts_source_priority_v1'
      ? readFragment(root, fragment.id, 'modelFactsSourcePrioritySchemaPreRuleV2.sql') : fragment)
}

// Preserve the exact reviewed predecessor bytes for all older migrations.
function loadPreImageToolFragments(rootPath: string): readonly LoadedFragment[] {
  return loadFragments(rootPath).map(fragment => {
    if (fragment.id !== GENERATION_EXECUTION_FRAGMENT_ID) return fragment
    const sql = fragment.sql.replace(
      /      -- OpenAI Responses generated image tool V1: scoped text-operation exception\.[\s\S]*?      -- End OpenAI Responses generated image tool V1\./u,
      "      AND json_extract(snapshot.canonical_json, '$.providerBinding.operation') = 'image_generate'",
    )
    if (sql === fragment.sql) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
    return Object.freeze({ ...fragment, sql, bytes: Buffer.from(sql, 'utf8') })
  })
}

function digestFragments(fragments: readonly LoadedFragment[], ontologyDigest = PRE_RULE_V2_ONTOLOGY_SCHEMA_DIGEST_V1,
  runtimeCodecDigest = RUNTIME_CAPABILITY_CODEC_SCHEMA_DIGEST_V2,
  coverageDigest = PRE_RULE_V2_ENCODING_COVERAGE_SCHEMA_DIGEST_V2,
  sourcePriorityDigest = PRE_RULE_V2_SOURCE_PRIORITY_CONFIG_SCHEMA_DIGEST_V1,
  ruleCoreDigest = CAPABILITY_RULE_CORE_SCHEMA_DIGEST_V1): string {
  const hasher = createHash('sha256')
  for (const fragment of fragments) {
    hasher.update(fragment.id, 'utf8')
    hasher.update('\0', 'utf8')
    hasher.update(fragment.bytes)
    hasher.update('\0', 'utf8')
  }
  // The epoch closed schema includes the capability codec grammar and its
  // independent encoder coverage registry. SQL-only digests would allow a
  // capability/encoder schema change to reuse a database with an apparently
  // current manifest.
  hasher.update('runtime-capability-codec-schema\0', 'utf8')
  hasher.update(runtimeCodecDigest, 'utf8')
  hasher.update('\0', 'utf8')
  hasher.update('encoding-coverage-registry-schema\0', 'utf8')
  hasher.update(coverageDigest, 'utf8')
  hasher.update('\0', 'utf8')
  hasher.update('canonical-model-fact-ontology-schema\0', 'utf8')
  hasher.update(ontologyDigest, 'utf8')
  hasher.update('\0', 'utf8')
  hasher.update('resolved-model-facts-ontology-schema\0', 'utf8')
  hasher.update(RESOLVED_MODEL_FACTS_ONTOLOGY_SCHEMA_DIGEST_V1, 'utf8')
  hasher.update('\0', 'utf8')
  hasher.update('source-priority-config-schema\0', 'utf8')
  hasher.update(sourcePriorityDigest, 'utf8')
  hasher.update('\0', 'utf8')
  hasher.update('capability-rule-core-schema\0', 'utf8')
  hasher.update(ruleCoreDigest, 'utf8')
  hasher.update('\0', 'utf8')
  return hasher.digest('hex')
}

function digestCurrentFragments(fragments: readonly LoadedFragment[]): string {
  const rules = createHash('sha256').update(`${CAPABILITY_RULE_CORE_SCHEMA_DIGEST_V1}\0${CAPABILITY_RULE_CORE_SCHEMA_DIGEST_V2}`).digest('hex')
  return digestFragments(fragments, CANONICAL_MODEL_FACT_ONTOLOGY_SCHEMA_DIGEST_V1,
    RUNTIME_CAPABILITY_CODEC_SCHEMA_DIGEST_V2, ENCODING_COVERAGE_REGISTRY_SCHEMA_DIGEST_V2,
    SOURCE_PRIORITY_CONFIG_SCHEMA_DIGEST_V1, rules)
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
  return bundle(fragments, digestCurrentFragments(fragments), null)
}

/** Read-only predecessor descriptor for migration diagnostics and frozen fixtures. */
export function inspectPreRequestRulesSchemaBundleV2(rootPath: string): GenerationV2SchemaBundle {
  const fragments = loadPreRuleV2Fragments(rootPath)
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
  if (manifestObject?.type !== 'table' || typeof manifestObject.sql !== 'string') {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  let manifest: {
      schema_version: number
      schema_digest: string
      fragment_count: number
      object_projection_digest: string
    } | undefined
  try {
    manifest = db.prepare(`SELECT schema_version, schema_digest, fragment_count, object_projection_digest
      FROM generation_v2_schema_manifest WHERE manifest_id = ?`).get(MANIFEST_ID) as typeof manifest
  } catch {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
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
  if (normalizedSql(manifestObject.sql) !== normalizedSql(MANIFEST_TABLE_SQL)) {
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
    digestCurrentFragments(fragments),
    extractExpectedObjects(fragments),
  )
}

// Reviewed pre-Gemini-thinking ontology/coverage bundle. SQL is unchanged by this
// additive semantic upgrade; immutable historical snapshots retain their revisions.
export const GEMINI_THINKING_SEMANTIC_PREDECESSOR_DIGEST_V2 =
  '8db29cee4bbc3c56d773cb8d2c6d7bdd79a0f7b8580724bd196446ae9f0d8957'
export const REQUEST_CONTRACT_PREDECESSOR_DIGEST_V2 =
  '68cc2319debea8c21d227279c86f626b71abf0b7b78452457729e467052494fe'
export const PRE_CAPACITY_REQUEST_CONTRACT_SCHEMA_DIGEST_V2 =
  '880fcc56722bf90ff858a2835cb487797831cceeea97da26d3b1245be25898d0'
const REQUEST_CONTRACT_PREDECESSOR_DIGESTS_V2 = Object.freeze([
  REQUEST_CONTRACT_PREDECESSOR_DIGEST_V2, // Reviewed Windows checkout.
  '5fdd6aeb42bd2881d6706a97e2c438ca200c99e2860455a7c6ffc878f84d4ae2', // LF assets.
  '15deb1bcfd634eab45ad2195a9b6fdb95cab1615d6066c0d4b7db05554ba2985', // CRLF assets.
])

function preRequestContractFragments(fragments: readonly LoadedFragment[]): readonly LoadedFragment[] {
  return fragments.map(fragment => {
    let sql = fragment.sql
    if (fragment.id === 'core_conversation_v1') {
      sql = sql.replace('length(CAST(body_text AS BLOB)) <= 67108864', 'length(CAST(body_text AS BLOB)) <= 20971520')
      if (sql === fragment.sql) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
    } else if (fragment.id === GENERATION_EXECUTION_FRAGMENT_ID) {
      const offset = fragment.sql.indexOf(REQUEST_CONTRACT_MARKER)
      if (offset < 0) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
      sql = fragment.sql.slice(0, offset).replace(/\r?\n$/u, '')
        .replace('prepared_body_byte_length BETWEEN 2 AND 29360128', 'prepared_body_byte_length BETWEEN 2 AND 20971520')
        .replace('length(CAST(canonical_json AS BLOB)) BETWEEN 2 AND 3145728', 'length(CAST(canonical_json AS BLOB)) BETWEEN 2 AND 1048576')
    }
    return Object.freeze({ ...fragment, sql, bytes: Buffer.from(sql, 'utf8') })
  })
}

/** Reconstruct the exact immediately previous full bundle before checkpoint storage and body capacity. */
function preCapacityRequestContractFragments(fragments: readonly LoadedFragment[]): readonly LoadedFragment[] {
  return fragments.map(fragment => {
    let sql = fragment.sql
    if (fragment.id === 'core_conversation_v1') {
      sql = sql.replace('length(CAST(body_text AS BLOB)) <= 67108864', 'length(CAST(body_text AS BLOB)) <= 20971520')
      if (sql === fragment.sql) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
    } else if (fragment.id === GENERATION_EXECUTION_FRAGMENT_ID) {
      const offset = fragment.sql.indexOf(INTERRUPTED_REPLAY_STORAGE_MARKER)
      if (offset < 0) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
      sql = fragment.sql.slice(0, offset).replace(/\r?\n$/u, '')
        .replace('BETWEEN 4 AND 328204288', 'BETWEEN 4 AND 164626432')
      if (sql === fragment.sql.slice(0, offset).replace(/\r?\n$/u, '')) {
        throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
      }
    }
    return Object.freeze({ ...fragment, sql, bytes: Buffer.from(sql, 'utf8') })
  })
}

function digestPreRequestContractFragments(fragments: readonly LoadedFragment[], ontology = PRE_REQUEST_CONTRACT_ONTOLOGY_SCHEMA_DIGEST_V1): string {
  return digestFragments(fragments, ontology, PRE_REQUEST_CONTRACT_RUNTIME_CODEC_SCHEMA_DIGEST_V2,
    PRE_REQUEST_CONTRACT_ENCODING_COVERAGE_SCHEMA_DIGEST_V2)
}

function isCurrentRequestContractSchema(db: BetterSqlite3.Database, rootPath: string): boolean {
  const manifest = db.prepare('SELECT schema_digest FROM generation_v2_schema_manifest WHERE manifest_id=?')
    .get(MANIFEST_ID) as {schema_digest?: unknown} | undefined
  return manifest?.schema_digest === digestFragments(loadPreRuleV2Fragments(rootPath)) ||
    manifest?.schema_digest === digestCurrentFragments(loadPreImageToolFragments(rootPath)) ||
    manifest?.schema_digest === digestCurrentFragments(loadFragments(rootPath))
}

function isPreCapacityRequestContractSchema(db: BetterSqlite3.Database, rootPath: string): boolean {
  const fragments = preCapacityRequestContractFragments(loadPreRuleV2Fragments(rootPath))
  const expectedDigest = digestFragments(fragments)
  if (expectedDigest !== PRE_CAPACITY_REQUEST_CONTRACT_SCHEMA_DIGEST_V2) return false
  const manifest = db.prepare('SELECT schema_digest FROM generation_v2_schema_manifest WHERE manifest_id=?')
    .get(MANIFEST_ID) as {schema_digest?: unknown} | undefined
  if (manifest?.schema_digest !== expectedDigest) return false
  verifyLoadedGenerationV2Schema(db, fragments, expectedDigest, extractExpectedObjects(fragments))
  const expected = new BetterSqlite3(':memory:')
  try {
    expected.pragma('foreign_keys = ON')
    for (const fragment of fragments) expected.exec(fragment.sql)
    expected.exec(MANIFEST_TABLE_SQL)
    if (!schemaRowsEqual(installedSchemaRows(db), installedSchemaRows(expected))) {
      throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
  } finally { expected.close() }
  return true
}

export function upgradeGeminiThinkingSemanticsInActiveTransaction(
  db: BetterSqlite3.Database, rootPath: string,
  validatePredecessorIdentity: (bundle: GenerationV2SchemaBundle) => void,
): void {
  if (!db.inTransaction) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DATABASE_BUSY')
  if (isCurrentRequestContractSchema(db, rootPath)) return
  const fragments = preRequestContractFragments(loadPreRuleV2Fragments(rootPath))
  const currentDigest = digestPreRequestContractFragments(fragments)
  const manifest = db.prepare('SELECT schema_digest FROM generation_v2_schema_manifest WHERE manifest_id=?')
    .get(MANIFEST_ID) as { schema_digest?: unknown } | undefined
  if (manifest?.schema_digest === currentDigest) return
  // Other predecessors belong to their separately reviewed structural upgrades.
  if (manifest?.schema_digest !== GEMINI_THINKING_SEMANTIC_PREDECESSOR_DIGEST_V2) return
  const predecessor = verifyLoadedGenerationV2Schema(db, fragments,
    GEMINI_THINKING_SEMANTIC_PREDECESSOR_DIGEST_V2, extractExpectedObjects(fragments))
  const expectedDb = new BetterSqlite3(':memory:')
  try {
    expectedDb.pragma('foreign_keys = ON')
    for (const fragment of fragments) expectedDb.exec(fragment.sql)
    expectedDb.exec(MANIFEST_TABLE_SQL)
    if (!schemaRowsEqual(installedSchemaRows(db), installedSchemaRows(expectedDb))) {
      throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
  } finally { expectedDb.close() }
  validatePredecessorIdentity(predecessor)
  const identityTrigger = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_app_meta_v2_immutable'")
    .get() as { sql: string }
  db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
  db.prepare('UPDATE app_meta_v2 SET schema_digest=? WHERE singleton_id=1').run(currentDigest)
  db.exec(identityTrigger.sql)
  db.prepare('UPDATE generation_v2_schema_manifest SET schema_digest=? WHERE manifest_id=?').run(currentDigest, MANIFEST_ID)
  verifyLoadedGenerationV2Schema(db, fragments, currentDigest, extractExpectedObjects(fragments))
}

/** Only the reviewed, intact pre-edit-session bundle can receive this additive upgrade. */
export function upgradeComposerEditSessionSchemaInActiveTransaction(
  db: BetterSqlite3.Database,
  rootPath: string,
  validatePredecessorIdentity: (bundle: GenerationV2SchemaBundle) => void,
): void {
  if (!db.inTransaction) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DATABASE_BUSY')
  if (db.pragma('foreign_keys', { simple: true }) !== 1) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  if (isCurrentRequestContractSchema(db, rootPath) || isPreCapacityRequestContractSchema(db, rootPath)) return
  const currentFragments = preRequestContractFragments(loadPreRuleV2Fragments(rootPath))
  const currentManifest = db.prepare('SELECT schema_digest FROM generation_v2_schema_manifest WHERE manifest_id=?').get(MANIFEST_ID) as {schema_digest?: unknown}
  if (currentManifest?.schema_digest === digestPreRequestContractFragments(currentFragments)) return
  const fragments = withoutInterruptedReplay(currentFragments)
  const schemaDigest = digestPreRequestContractFragments(fragments)
  const manifest = db.prepare(`SELECT schema_digest FROM generation_v2_schema_manifest WHERE manifest_id=?`)
    .get(MANIFEST_ID) as { schema_digest?: unknown } | undefined
  if (manifest?.schema_digest === schemaDigest) return
  const predecessorDigest = manifest?.schema_digest
  if (predecessorDigest === digestPreRequestContractFragments(fragments, PRE_GEMINI_THINKING_ONTOLOGY_SCHEMA_DIGEST_V1)) return
  if (typeof predecessorDigest !== 'string' || !COMPOSER_EDIT_SESSION_PREDECESSOR_DIGESTS.includes(predecessorDigest)) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DIGEST_MISMATCH')
  }
  const composer = fragments.find(fragment => fragment.id === 'composer_draft_v1')
  const markerOffset = composer?.sql.indexOf(COMPOSER_EDIT_SESSION_MARKER) ?? -1
  if (!composer || markerOffset < 0) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
  // Appending the reviewed objects adds one blank line after the original bytes.
  const predecessorSql = composer.sql.slice(0, markerOffset).replace(/\r?\n$/u, '')
  const predecessor = fragments.map(fragment => {
    const sql = (fragment === composer ? predecessorSql : fragment.sql).replace(/\r\n/gu, '\n')
    return Object.freeze({ ...fragment, sql, bytes: Buffer.from(sql, 'utf8') })
  })
  // Only the committed canonical predecessor is a source of old object SQL.
  // Historical raw serialization is accepted through the three pinned digests,
  // never by treating an arbitrary old manifest as a normalized predecessor.
  if (digestPreRequestContractFragments(predecessor, PRE_GEMINI_THINKING_ONTOLOGY_SCHEMA_DIGEST_V1) !== COMPOSER_EDIT_SESSION_PREDECESSOR_DIGESTS[0]) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DIGEST_MISMATCH')
  }
  const predecessorBundle = verifyLoadedGenerationV2Schema(db, predecessor, predecessorDigest, extractExpectedObjects(predecessor))
  const appMeta = db.prepare('SELECT data_epoch,schema_digest FROM app_meta_v2 WHERE singleton_id=1')
    .get() as { data_epoch?: unknown; schema_digest?: unknown } | undefined
  if (appMeta?.data_epoch !== 2 || appMeta.schema_digest !== predecessorDigest) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  const expectedDb = new BetterSqlite3(':memory:')
  try {
    expectedDb.pragma('foreign_keys = ON')
    for (const fragment of predecessor) expectedDb.exec(fragment.sql)
    expectedDb.exec(MANIFEST_TABLE_SQL)
    if (!schemaRowsEqual(installedSchemaRows(db), installedSchemaRows(expectedDb))) {
      throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
  } finally { expectedDb.close() }
  validatePredecessorIdentity(predecessorBundle)
  db.exec(composer.sql.slice(markerOffset))
  // Legacy edits never persisted their branch or previous compose snapshot.
  // Retain all current text/attachments; do not invent missing edit ownership.
  db.prepare(`UPDATE composer_draft_v2 SET draft_mode='compose',editing_source_question_id=NULL,
    revision=revision+1 WHERE draft_mode='edit'`).run()
  const projection = readInstalledProjection(db, extractExpectedObjects(fragments), true)
  db.prepare(`UPDATE generation_v2_schema_manifest SET schema_digest=?,object_projection_digest=? WHERE manifest_id=?`)
    .run(schemaDigest, projection.digest, MANIFEST_ID)
  const identityTrigger = db.prepare(`SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_app_meta_v2_immutable'`)
    .get() as {sql:string}
  db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
  db.prepare('UPDATE app_meta_v2 SET schema_digest=? WHERE singleton_id=1').run(schemaDigest)
  db.exec(identityTrigger.sql)
  verifyLoadedGenerationV2Schema(db, fragments, schemaDigest, extractExpectedObjects(fragments))
}

function withoutInterruptedReplay(fragments: readonly LoadedFragment[]): readonly LoadedFragment[] {
  return fragments.map(fragment => {
    if (fragment.id !== GENERATION_EXECUTION_FRAGMENT_ID) return fragment
    const offset = fragment.sql.indexOf(INTERRUPTED_REPLAY_MARKER)
    if (offset < 0) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
    const sql = fragment.sql.slice(0, offset).replace(/\r?\n$/u, '')
    return Object.freeze({ ...fragment, sql, bytes: Buffer.from(sql, 'utf8') })
  })
}

/** Add only these reviewed objects to an otherwise exactly verified predecessor. */
export function upgradeInterruptedReplaySchemaInActiveTransaction(
  db: BetterSqlite3.Database, rootPath: string,
  validatePredecessorIdentity: (bundle: GenerationV2SchemaBundle) => void,
): void {
  if (!db.inTransaction) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DATABASE_BUSY')
  if (isCurrentRequestContractSchema(db, rootPath) || isPreCapacityRequestContractSchema(db, rootPath)) return
  const fragments = preRequestContractFragments(loadPreRuleV2Fragments(rootPath))
  const schemaDigest = digestPreRequestContractFragments(fragments)
  const manifest = db.prepare('SELECT schema_digest FROM generation_v2_schema_manifest WHERE manifest_id=?').get(MANIFEST_ID) as {schema_digest?: unknown}
  if (manifest?.schema_digest === schemaDigest) return
  const predecessor = withoutInterruptedReplay(fragments)
  const predecessorDigest = manifest?.schema_digest === digestPreRequestContractFragments(predecessor, PRE_GEMINI_THINKING_ONTOLOGY_SCHEMA_DIGEST_V1)
    ? digestPreRequestContractFragments(predecessor, PRE_GEMINI_THINKING_ONTOLOGY_SCHEMA_DIGEST_V1) : digestPreRequestContractFragments(predecessor)
  const predecessorBundle = verifyLoadedGenerationV2Schema(db, predecessor, predecessorDigest, extractExpectedObjects(predecessor))
  const expectedDb = new BetterSqlite3(':memory:')
  try {
    expectedDb.pragma('foreign_keys = ON')
    for (const fragment of predecessor) expectedDb.exec(fragment.sql)
    expectedDb.exec(MANIFEST_TABLE_SQL)
    if (!schemaRowsEqual(installedSchemaRows(db), installedSchemaRows(expectedDb))) {
      throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
  } finally { expectedDb.close() }
  validatePredecessorIdentity(predecessorBundle)
  const execution = fragments.find(fragment => fragment.id === GENERATION_EXECUTION_FRAGMENT_ID)!
  db.exec(execution.sql.slice(execution.sql.indexOf(INTERRUPTED_REPLAY_MARKER)))
  const projection = readInstalledProjection(db, extractExpectedObjects(fragments), true)
  db.prepare('UPDATE generation_v2_schema_manifest SET schema_digest=?,object_projection_digest=? WHERE manifest_id=?')
    .run(schemaDigest, projection.digest, MANIFEST_ID)
  const identityTrigger = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_app_meta_v2_immutable'").get() as {sql:string}
  db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
  db.prepare('UPDATE app_meta_v2 SET schema_digest=? WHERE singleton_id=1').run(schemaDigest)
  db.exec(identityTrigger.sql)
  verifyLoadedGenerationV2Schema(db, fragments, schemaDigest, extractExpectedObjects(fragments))
}

function upgradePreCapacityRequestContractSchemaInActiveTransaction(
  db: BetterSqlite3.Database,
  fragments: readonly LoadedFragment[],
  schemaDigest: string,
  validatePredecessorIdentity: (bundle: GenerationV2SchemaBundle) => void,
): void {
  const predecessor = preCapacityRequestContractFragments(fragments)
  const predecessorDigest = digestFragments(predecessor)
  if (predecessorDigest !== PRE_CAPACITY_REQUEST_CONTRACT_SCHEMA_DIGEST_V2) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DIGEST_MISMATCH')
  }
  const predecessorBundle = verifyLoadedGenerationV2Schema(db, predecessor, predecessorDigest,
    extractExpectedObjects(predecessor))
  const expected = new BetterSqlite3(':memory:')
  try {
    expected.pragma('foreign_keys = ON')
    for (const fragment of predecessor) expected.exec(fragment.sql)
    expected.exec(MANIFEST_TABLE_SQL)
    if (!schemaRowsEqual(installedSchemaRows(db), installedSchemaRows(expected))) {
      throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
  } finally { expected.close() }
  const appMeta = db.prepare('SELECT data_epoch,schema_digest FROM app_meta_v2 WHERE singleton_id=1')
    .get() as { data_epoch?: unknown; schema_digest?: unknown } | undefined
  if (appMeta?.data_epoch !== 2 || appMeta.schema_digest !== predecessorDigest) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  validatePredecessorIdentity(predecessorBundle)

  const replacements: Array<{ name: string; oldSql: string; newSql: string }> = []
  const bodyRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='message_body_v2'")
    .get() as { sql?: unknown } | undefined
  if (typeof bodyRow?.sql !== 'string') throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  const widenedBodySql = bodyRow.sql.replace('length(CAST(body_text AS BLOB)) <= 20971520',
    'length(CAST(body_text AS BLOB)) <= 67108864')
  if (widenedBodySql === bodyRow.sql) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  replacements.push({ name: 'message_body_v2', oldSql: bodyRow.sql, newSql: widenedBodySql })

  const receiptRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='generation_native_completion_receipt_v2'")
    .get() as { sql?: unknown } | undefined
  const oldReceiptBound = 'BETWEEN 4 AND 164626432'
  const newReceiptBound = 'BETWEEN 4 AND 328204288'
  if (typeof receiptRow?.sql !== 'string' || !receiptRow.sql.includes(oldReceiptBound)) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  replacements.push({
    name: 'generation_native_completion_receipt_v2',
    oldSql: receiptRow.sql,
    newSql: receiptRow.sql.replace(oldReceiptBound, newReceiptBound),
  })

  const execution = fragments.find(fragment => fragment.id === GENERATION_EXECUTION_FRAGMENT_ID)
  const markerOffset = execution?.sql.indexOf(INTERRUPTED_REPLAY_STORAGE_MARKER) ?? -1
  if (!execution || markerOffset < 0) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_FRAGMENT_INVALID')
  const schemaVersion = db.pragma('schema_version', { simple: true }) as number
  try {
    db.unsafeMode(true)
    db.pragma('writable_schema = ON')
    for (const replacement of replacements) {
      const result = db.prepare("UPDATE sqlite_master SET sql=? WHERE type='table' AND name=? AND sql=?")
        .run(replacement.newSql, replacement.name, replacement.oldSql)
      if (result.changes !== 1) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
  } finally {
    db.pragma('writable_schema = OFF')
    db.unsafeMode(false)
  }
  db.pragma(`schema_version = ${schemaVersion + 1}`)
  db.exec(execution.sql.slice(markerOffset))

  const identityTrigger = db.prepare("SELECT sql FROM sqlite_master WHERE name='trg_app_meta_v2_immutable'")
    .get() as { sql?: unknown } | undefined
  if (typeof identityTrigger?.sql !== 'string') throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
  const appMetaUpdate = db.prepare('UPDATE app_meta_v2 SET schema_digest=? WHERE singleton_id=1').run(schemaDigest)
  if (appMetaUpdate.changes !== 1) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  db.exec(identityTrigger.sql)
  const projection = readInstalledProjection(db, extractExpectedObjects(fragments), true)
  const manifestUpdate = db.prepare(`UPDATE generation_v2_schema_manifest SET schema_digest=?,object_projection_digest=?
    WHERE manifest_id=?`).run(schemaDigest, projection.digest, MANIFEST_ID)
  if (manifestUpdate.changes !== 1) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  verifyLoadedGenerationV2Schema(db, fragments, schemaDigest, extractExpectedObjects(fragments))
}

/** Widen only reviewed CHECK bounds after verifying the complete predecessor.
 * SQLite's documented CHECK-only migration preserves parent rowids and every FK.
 * The caller's IMMEDIATE transaction owns the schema change and its rollback.
 */
export function upgradeRequestContractSchemaInActiveTransaction(
  db: BetterSqlite3.Database, rootPath: string,
  validatePredecessorIdentity: (bundle: GenerationV2SchemaBundle) => void,
): void {
  if (!db.inTransaction) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DATABASE_BUSY')
  const fragments = loadPreRuleV2Fragments(rootPath)
  const schemaDigest = digestFragments(fragments)
  if (isCurrentRequestContractSchema(db, rootPath)) return
  if (isPreCapacityRequestContractSchema(db, rootPath)) {
    upgradePreCapacityRequestContractSchemaInActiveTransaction(db, fragments, schemaDigest, validatePredecessorIdentity)
    return
  }
  const predecessor = preRequestContractFragments(fragments)
  const predecessorDigest = digestPreRequestContractFragments(predecessor)
  if (!REQUEST_CONTRACT_PREDECESSOR_DIGESTS_V2.includes(predecessorDigest)) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DIGEST_MISMATCH')
  }
  const predecessorBundle = verifyLoadedGenerationV2Schema(db, predecessor, predecessorDigest,
    extractExpectedObjects(predecessor))
  const expected = new BetterSqlite3(':memory:')
  const replacements: Array<{name: string; oldSql: string; newSql: string}> = []
  try {
    expected.pragma('foreign_keys = ON')
    for (const fragment of predecessor) expected.exec(fragment.sql)
    expected.exec(MANIFEST_TABLE_SQL)
    if (!schemaRowsEqual(installedSchemaRows(db), installedSchemaRows(expected))) {
      throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
    for (const name of ['generation_request_v2', 'assistant_generation_snapshot_v2', 'message_body_v2']) {
      const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
        .get(name) as {sql: string}
      const newSql = name === 'generation_request_v2'
        ? row.sql.replace('prepared_body_byte_length BETWEEN 2 AND 20971520', 'prepared_body_byte_length BETWEEN 2 AND 29360128')
        : name === 'assistant_generation_snapshot_v2'
          ? row.sql.replace('length(CAST(canonical_json AS BLOB)) BETWEEN 2 AND 1048576', 'length(CAST(canonical_json AS BLOB)) BETWEEN 2 AND 3145728')
          : row.sql.replace('length(CAST(body_text AS BLOB)) <= 20971520', 'length(CAST(body_text AS BLOB)) <= 67108864')
      if (newSql === row.sql) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
      replacements.push({ name, oldSql: row.sql, newSql })
    }
  } finally { expected.close() }
  validatePredecessorIdentity(predecessorBundle)
  const schemaVersion = db.pragma('schema_version', {simple: true}) as number
  try {
    db.unsafeMode(true)
    db.pragma('writable_schema = ON')
    for (const replacement of replacements) {
      const result = db.prepare("UPDATE sqlite_master SET sql=? WHERE type='table' AND name=? AND sql=?")
        .run(replacement.newSql, replacement.name, replacement.oldSql)
      if (result.changes !== 1) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
  } finally {
    db.pragma('writable_schema = OFF')
    db.unsafeMode(false)
  }
  db.pragma(`schema_version = ${schemaVersion + 1}`)
  const execution = fragments.find(fragment => fragment.id === GENERATION_EXECUTION_FRAGMENT_ID)!
  db.exec(execution.sql.slice(execution.sql.indexOf(REQUEST_CONTRACT_MARKER)))
  const identityTrigger = db.prepare("SELECT sql FROM sqlite_master WHERE name='trg_app_meta_v2_immutable'")
    .get() as {sql: string}
  db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
  db.prepare('UPDATE app_meta_v2 SET schema_digest=? WHERE singleton_id=1').run(schemaDigest)
  db.exec(identityTrigger.sql)
  const projection = readInstalledProjection(db, extractExpectedObjects(fragments), true)
  db.prepare('UPDATE generation_v2_schema_manifest SET schema_digest=?,object_projection_digest=? WHERE manifest_id=?')
    .run(schemaDigest, projection.digest, MANIFEST_ID)
  verifyLoadedGenerationV2Schema(db, fragments, schemaDigest, extractExpectedObjects(fragments))
}

/** Add Rule V2 tables only after validating the complete predecessor and app identity. */
export function upgradeRequestRulesSchemaInActiveTransaction(
  db: BetterSqlite3.Database, rootPath: string,
  validatePredecessorIdentity: (bundle: GenerationV2SchemaBundle) => void,
): void {
  if (!db.inTransaction) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DATABASE_BUSY')
  const fragments = loadPreImageToolFragments(rootPath)
  const schemaDigest = digestCurrentFragments(fragments)
  const manifest = db.prepare('SELECT schema_digest FROM generation_v2_schema_manifest WHERE manifest_id=?')
    .get(MANIFEST_ID) as { schema_digest: string } | undefined
  if (manifest?.schema_digest === schemaDigest ||
      manifest?.schema_digest === digestCurrentFragments(loadFragments(rootPath))) return
  const predecessor = loadPreRuleV2Fragments(rootPath)
  const predecessorDigest = digestFragments(predecessor)
  const previous = verifyLoadedGenerationV2Schema(db, predecessor, predecessorDigest, extractExpectedObjects(predecessor))
  const expected = new BetterSqlite3(':memory:')
  try {
    expected.pragma('foreign_keys = ON')
    for (const fragment of predecessor) expected.exec(fragment.sql)
    expected.exec(MANIFEST_TABLE_SQL)
    if (!schemaRowsEqual(installedSchemaRows(db), installedSchemaRows(expected))) {
      throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
  } finally { expected.close() }
  validatePredecessorIdentity(previous)
  // Preserve committed rules, dirty drafts, user priorities and frozen request bytes.
  for (const fragment of fragments.filter(value => ['capability_rule_v2', 'model_facts_source_priority_v1'].includes(value.id))) db.exec(fragment.sql)
  const identityTrigger = db.prepare("SELECT sql FROM sqlite_master WHERE name='trg_app_meta_v2_immutable'")
    .get() as { sql: string }
  db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
  db.prepare('UPDATE app_meta_v2 SET schema_digest=? WHERE singleton_id=1').run(schemaDigest)
  db.exec(identityTrigger.sql)
  const projection = readInstalledProjection(db, extractExpectedObjects(fragments), true)
  db.prepare('UPDATE generation_v2_schema_manifest SET schema_digest=?,object_projection_digest=? WHERE manifest_id=?')
    .run(schemaDigest, projection.digest, MANIFEST_ID)
  verifyLoadedGenerationV2Schema(db, fragments, schemaDigest, extractExpectedObjects(fragments))
}

/** Replace only the image-output trigger after verifying the complete predecessor. */
export function upgradeOpenAIImageOutputSchemaInActiveTransaction(
  db: BetterSqlite3.Database, rootPath: string,
  validatePredecessorIdentity: (bundle: GenerationV2SchemaBundle) => void,
): void {
  if (!db.inTransaction) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DATABASE_BUSY')
  const fragments = loadFragments(rootPath)
  const schemaDigest = digestCurrentFragments(fragments)
  const manifest = db.prepare('SELECT schema_digest FROM generation_v2_schema_manifest WHERE manifest_id=?')
    .get(MANIFEST_ID) as { schema_digest: string } | undefined
  if (manifest?.schema_digest === schemaDigest) return
  const predecessor = loadPreImageToolFragments(rootPath)
  const previous = verifyLoadedGenerationV2Schema(db, predecessor, digestCurrentFragments(predecessor),
    extractExpectedObjects(predecessor))
  const expected = new BetterSqlite3(':memory:')
  try {
    expected.pragma('foreign_keys = ON')
    for (const fragment of predecessor) expected.exec(fragment.sql)
    expected.exec(MANIFEST_TABLE_SQL)
    if (!schemaRowsEqual(installedSchemaRows(db), installedSchemaRows(expected))) {
      throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
    }
  } finally { expected.close() }
  validatePredecessorIdentity(previous)
  const execution = fragments.find(fragment => fragment.id === GENERATION_EXECUTION_FRAGMENT_ID)!
  const triggerSql = execution.sql.match(/CREATE TRIGGER IF NOT EXISTS trg_generation_image_output_v2_validate_insert\b[\s\S]*?\r?\nEND;/u)?.[0]
  const identityTrigger = db.prepare("SELECT sql FROM sqlite_master WHERE name='trg_app_meta_v2_immutable'")
    .get() as { sql: string }
  if (!triggerSql || typeof identityTrigger?.sql !== 'string') {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  db.exec('DROP TRIGGER trg_generation_image_output_v2_validate_insert')
  db.exec(triggerSql)
  db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
  if (db.prepare('UPDATE app_meta_v2 SET schema_digest=? WHERE singleton_id=1').run(schemaDigest).changes !== 1) {
    throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_STATE_INVALID')
  }
  db.exec(identityTrigger.sql)
  const projection = readInstalledProjection(db, extractExpectedObjects(fragments), true)
  db.prepare('UPDATE generation_v2_schema_manifest SET schema_digest=?,object_projection_digest=? WHERE manifest_id=?')
    .run(schemaDigest, projection.digest, MANIFEST_ID)
  verifyLoadedGenerationV2Schema(db, fragments, schemaDigest, extractExpectedObjects(fragments))
}

export function installGenerationV2SchemaInActiveTransaction(
  db: BetterSqlite3.Database,
  rootPath: string,
): GenerationV2SchemaBundle {
  if (!db.inTransaction) throw new GenerationV2SchemaComposerError('GENERATION_V2_SCHEMA_DATABASE_BUSY')
  const fragments = loadFragments(rootPath)
  const schemaDigest = digestCurrentFragments(fragments)
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
  const schemaDigest = digestCurrentFragments(fragments)
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

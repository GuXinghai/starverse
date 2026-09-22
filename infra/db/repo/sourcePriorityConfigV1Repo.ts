import type BetterSqlite3 from 'better-sqlite3'
import {
  buildSourcePriorityConfigV1,
  SOURCE_PRIORITY_CONFIG_SCHEMA_VERSION_V1,
  sourcePriorityConfigSemanticHashV1,
  sourcePriorityConfigSemanticJsonV1,
  type SourcePriorityConfigV1,
} from '../../../src/next/generation-v2/model-facts/sourcePriorityConfigV1'

const DIGEST = /^[0-9a-f]{64}$/u
const REVISION = /^source-priority-config-v1:[0-9a-f]{64}$/u
const MAX_SEMANTIC_BYTES = 65536

type SourcePriorityRowV1 = Readonly<{
  singleton_id: unknown
  schema_version: unknown
  source_priority_config_revision: unknown
  semantic_json: unknown
  semantic_hash: unknown
  created_at_ms: unknown
  updated_at_ms: unknown
}>

export type SourcePriorityConfigRepositoryFactV1 = Readonly<{
  trust: 'source_priority_config_repository_fact'
  config: SourcePriorityConfigV1
  semanticHash: string
  canonicalJson: string
  createdAtMs: number
  updatedAtMs: number
}>

export class SourcePriorityConfigV1RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_SOURCE_PRIORITY_CONFIG_INPUT_INVALID'
    | 'GENERATION_V2_SOURCE_PRIORITY_CONFIG_STATE_INVALID'
    | 'GENERATION_V2_SOURCE_PRIORITY_CONFIG_STALE_REVISION'
    | 'GENERATION_V2_SOURCE_PRIORITY_CONFIG_CLOCK_INVALID') {
    super(code)
    this.name = 'SourcePriorityConfigV1RepoError'
  }
}

function inputInvalid(): never {
  throw new SourcePriorityConfigV1RepoError('GENERATION_V2_SOURCE_PRIORITY_CONFIG_INPUT_INVALID')
}

function stateInvalid(): never {
  throw new SourcePriorityConfigV1RepoError('GENERATION_V2_SOURCE_PRIORITY_CONFIG_STATE_INVALID')
}

function safeTime(value: unknown, code: 'state' | 'clock'): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SourcePriorityConfigV1RepoError(code === 'state'
      ? 'GENERATION_V2_SOURCE_PRIORITY_CONFIG_STATE_INVALID'
      : 'GENERATION_V2_SOURCE_PRIORITY_CONFIG_CLOCK_INVALID')
  }
  return value as number
}

function decodeRow(row: SourcePriorityRowV1 | undefined): SourcePriorityConfigRepositoryFactV1 {
  if (!row || row.singleton_id !== 1 || row.schema_version !== 1 ||
      typeof row.source_priority_config_revision !== 'string' ||
      !REVISION.test(row.source_priority_config_revision) ||
      typeof row.semantic_json !== 'string' ||
      new TextEncoder().encode(row.semantic_json).byteLength > MAX_SEMANTIC_BYTES ||
      typeof row.semantic_hash !== 'string' || !DIGEST.test(row.semantic_hash)) return stateInvalid()
  const createdAtMs = safeTime(row.created_at_ms, 'state')
  const updatedAtMs = safeTime(row.updated_at_ms, 'state')
  if (updatedAtMs < createdAtMs) return stateInvalid()
  let parsed: unknown
  try { parsed = JSON.parse(row.semantic_json) } catch { return stateInvalid() }
  let config: SourcePriorityConfigV1
  try {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        Object.keys(parsed).sort().join('\0') !== 'priorities\0schemaVersion' ||
        (parsed as { schemaVersion?: unknown }).schemaVersion !== SOURCE_PRIORITY_CONFIG_SCHEMA_VERSION_V1) {
      return stateInvalid()
    }
    config = buildSourcePriorityConfigV1((parsed as { priorities?: unknown }).priorities)
  } catch { return stateInvalid() }
  const canonicalJson = sourcePriorityConfigSemanticJsonV1(config.priorities)
  const semanticHash = sourcePriorityConfigSemanticHashV1(config.priorities)
  if (canonicalJson !== row.semantic_json || semanticHash !== row.semantic_hash ||
      config.sourcePriorityConfigRevision !== row.source_priority_config_revision) return stateInvalid()
  return Object.freeze({
    trust: 'source_priority_config_repository_fact' as const,
    config,
    semanticHash,
    canonicalJson,
    createdAtMs,
    updatedAtMs,
  })
}

export class SourcePriorityConfigV1Repo {
  readonly #db: BetterSqlite3.Database
  readonly #nowMs: () => number

  constructor(db: BetterSqlite3.Database, nowMs: () => number = Date.now) {
    this.#db = db
    this.#nowMs = nowMs
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) stateInvalid()
  }

  get(): SourcePriorityConfigRepositoryFactV1 {
    const row = this.#db.prepare(`SELECT singleton_id, schema_version, source_priority_config_revision,
      semantic_json, semantic_hash, created_at_ms, updated_at_ms
      FROM model_facts_source_priority_v1 WHERE singleton_id = 1`).get() as SourcePriorityRowV1 | undefined
    return decodeRow(row)
  }

  compareAndSet(expectedConfigRevision: string, priorities: unknown): SourcePriorityConfigRepositoryFactV1 {
    if (typeof expectedConfigRevision !== 'string' || !REVISION.test(expectedConfigRevision)) return inputInvalid()
    let desired: SourcePriorityConfigV1
    try { desired = buildSourcePriorityConfigV1(priorities) } catch { return inputInvalid() }
    const desiredJson = sourcePriorityConfigSemanticJsonV1(desired.priorities)
    const desiredHash = sourcePriorityConfigSemanticHashV1(desired.priorities)
    const transaction = this.#db.transaction(() => {
      const current = this.get()
      if (current.config.sourcePriorityConfigRevision !== expectedConfigRevision) {
        throw new SourcePriorityConfigV1RepoError('GENERATION_V2_SOURCE_PRIORITY_CONFIG_STALE_REVISION')
      }
      if (current.canonicalJson === desiredJson && current.semanticHash === desiredHash) return current
      const now = Math.max(safeTime(this.#nowMs(), 'clock'), current.updatedAtMs)
      const result = this.#db.prepare(`UPDATE model_facts_source_priority_v1 SET
        source_priority_config_revision = ?, semantic_json = ?, semantic_hash = ?, updated_at_ms = ?
        WHERE singleton_id = 1 AND source_priority_config_revision = ?`).run(
          desired.sourcePriorityConfigRevision, desiredJson, desiredHash, now, expectedConfigRevision,
        )
      if (result.changes !== 1) {
        throw new SourcePriorityConfigV1RepoError('GENERATION_V2_SOURCE_PRIORITY_CONFIG_STALE_REVISION')
      }
      return this.get()
    })
    return this.runImmediate(transaction)
  }

  private runImmediate<T>(transaction: { immediate(): T }): T {
    try { return transaction.immediate() } catch (error) {
      if (error instanceof SourcePriorityConfigV1RepoError) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        throw new SourcePriorityConfigV1RepoError('GENERATION_V2_SOURCE_PRIORITY_CONFIG_STALE_REVISION')
      }
      throw error
    }
  }
}

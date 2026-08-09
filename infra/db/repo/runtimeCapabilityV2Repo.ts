import type BetterSqlite3 from 'better-sqlite3'
import {
  decodeRuntimeCapabilitySnapshotJsonV2,
  type DecodedRuntimeCapabilitySnapshotV2,
} from '../../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  isGenerationV2AuthorityTransactionContextV2,
  registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

export type RuntimeCapabilityRepositoryFactV2 = Readonly<{
  trust: 'runtime_capability_repository_fact_v2'
  usage: 'assistant_snapshot_capability_fk_only'
  executionAuthority: 'none'
  capability: DecodedRuntimeCapabilitySnapshotV2
}>

export class RuntimeCapabilityV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_REPOSITORY_INPUT_INVALID'
    | 'GENERATION_V2_CAPABILITY_REPOSITORY_NOT_FOUND'
    | 'GENERATION_V2_CAPABILITY_REPOSITORY_CONFLICT'
    | 'GENERATION_V2_CAPABILITY_REPOSITORY_STATE_INVALID'
    | 'GENERATION_V2_CAPABILITY_REPOSITORY_TRANSACTION_CONTEXT_REQUIRED') {
    super(code)
    this.name = 'RuntimeCapabilityV2RepoError'
  }
}

type CapabilityRow = Readonly<{
  capability_snapshot_hash: unknown
  capability_revision: unknown
  schema_version: unknown
  canonical_json: unknown
  evidence_digest: unknown
  semantic_fields_digest: unknown
  created_at_ms: unknown
}>

const facts = new WeakSet<object>()
const factContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_INPUT_INVALID')
  }
  return value as number
}

function readRow(row: CapabilityRow | undefined): Readonly<{
  capability: DecodedRuntimeCapabilitySnapshotV2
  createdAtMs: number
}> {
  if (!row) {
    throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_NOT_FOUND')
  }
  if (row.schema_version !== 2 || typeof row.canonical_json !== 'string' ||
      typeof row.capability_snapshot_hash !== 'string' ||
      typeof row.capability_revision !== 'string' ||
      typeof row.evidence_digest !== 'string' || typeof row.semantic_fields_digest !== 'string') {
    throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_STATE_INVALID')
  }
  let capability: DecodedRuntimeCapabilitySnapshotV2
  try {
    capability = decodeRuntimeCapabilitySnapshotJsonV2(row.canonical_json)
  } catch {
    throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_STATE_INVALID')
  }
  if (capability.revision.value !== row.capability_revision ||
      capability.snapshotHash.value !== row.capability_snapshot_hash ||
      capability.evidenceDigest.value !== row.evidence_digest ||
      capability.semanticFieldsDigest.value !== row.semantic_fields_digest) {
    throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_STATE_INVALID')
  }
  if (!Number.isSafeInteger(row.created_at_ms) || (row.created_at_ms as number) < 0) {
    throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_STATE_INVALID')
  }
  return Object.freeze({ capability, createdAtMs: row.created_at_ms as number })
}

export function isRuntimeCapabilityRepositoryFactV2(
  value: unknown,
): value is RuntimeCapabilityRepositoryFactV2 {
  if (!value || typeof value !== 'object' || !facts.has(value)) return false
  const context = factContexts.get(value)
  return Boolean(context && isGenerationV2AuthorityTransactionContextV2(context))
}

export class RuntimeCapabilityV2Repo {
  readonly #db: BetterSqlite3.Database

  constructor(db: BetterSqlite3.Database) {
    this.#db = db
  }

  getBySnapshotHash(snapshotHash: string): DecodedRuntimeCapabilitySnapshotV2 {
    if (this.#db.inTransaction) {
      throw new RuntimeCapabilityV2RepoError(
        'GENERATION_V2_CAPABILITY_REPOSITORY_TRANSACTION_CONTEXT_REQUIRED',
      )
    }
    if (typeof snapshotHash !== 'string') {
      throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_INPUT_INVALID')
    }
    return readRow(this.#select(snapshotHash)).capability
  }

  insertCanonical(
    context: GenerationV2AuthorityTransactionContextV2,
    canonicalJson: string,
    createdAtMsValue: unknown,
  ): Readonly<{ kind: 'created' | 'idempotent_replay'; fact: RuntimeCapabilityRepositoryFactV2 }> {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const createdAtMs = safeTime(createdAtMsValue)
    let capability: DecodedRuntimeCapabilitySnapshotV2
    try {
      capability = decodeRuntimeCapabilitySnapshotJsonV2(canonicalJson)
    } catch {
      throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_INPUT_INVALID')
    }
    let kind: 'created' | 'idempotent_replay' = 'created'
    try {
      const existing = readRow(this.#select(capability.snapshotHash.value))
      if (existing.capability.canonicalJson !== capability.canonicalJson) {
        throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_CONFLICT')
      }
      capability = existing.capability
      kind = 'idempotent_replay'
    } catch (error) {
      if (error instanceof RuntimeCapabilityV2RepoError &&
          error.code !== 'GENERATION_V2_CAPABILITY_REPOSITORY_NOT_FOUND') throw error
      try {
        this.#db.prepare(`INSERT INTO runtime_capability_snapshot_v2 (
          capability_snapshot_hash, capability_revision, schema_version, canonical_json,
          evidence_digest, semantic_fields_digest, created_at_ms
        ) VALUES (?, ?, 2, ?, ?, ?, ?)`).run(
          capability.snapshotHash.value,
          capability.revision.value,
          capability.canonicalJson,
          capability.evidenceDigest.value,
          capability.semanticFieldsDigest.value,
          createdAtMs,
        )
      } catch (insertError) {
        const code = (insertError as { code?: unknown })?.code
        if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
          throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_CONFLICT')
        }
        throw insertError
      }
    }
    const fact: RuntimeCapabilityRepositoryFactV2 = Object.freeze({
      trust: 'runtime_capability_repository_fact_v2',
      usage: 'assistant_snapshot_capability_fk_only',
      executionAuthority: 'none',
      capability,
    })
    facts.add(fact)
    factContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => {
        const current = readRow(this.#select(capability.snapshotHash.value)).capability
        if (current.canonicalJson !== capability.canonicalJson) {
          throw new RuntimeCapabilityV2RepoError('GENERATION_V2_CAPABILITY_REPOSITORY_STATE_INVALID')
        }
      },
      committed: () => {
        facts.delete(fact)
        factContexts.delete(fact)
      },
      rolledBack: () => {
        facts.delete(fact)
        factContexts.delete(fact)
      },
    })
    return Object.freeze({ kind, fact })
  }

  #select(snapshotHash: string): CapabilityRow | undefined {
    return this.#db.prepare(`SELECT capability_snapshot_hash, capability_revision,
      schema_version, canonical_json, evidence_digest, semantic_fields_digest, created_at_ms
      FROM runtime_capability_snapshot_v2 WHERE capability_snapshot_hash=?`).get(snapshotHash) as
      CapabilityRow | undefined
  }
}

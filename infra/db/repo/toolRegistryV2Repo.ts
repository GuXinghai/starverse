import type BetterSqlite3 from 'better-sqlite3'
import {
  decodeToolRegistryRevisionV2,
  selectToolDefinitionsV2,
  type ToolDefinitionV2,
  type ToolRegistryRevisionV2,
} from '../../../src/next/generation-v2/tools/toolRegistryV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

type RegistryRow = Readonly<{
  registry_revision: unknown
  definitions_digest: unknown
  definitions_json: unknown
  created_at_ms: unknown
}>

export type ToolRegistryRepositoryFactV2 = Readonly<{
  trust: 'tool_registry_repository_fact_v2'
  registry: ToolRegistryRevisionV2
  selectedDefinitions: readonly ToolDefinitionV2[]
}>

export class ToolRegistryV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_TOOL_REGISTRY_NOT_FOUND'
    | 'GENERATION_V2_TOOL_REGISTRY_STATE_INVALID'
    | 'GENERATION_V2_TOOL_REGISTRY_STALE_HEAD') {
    super(code)
    this.name = 'ToolRegistryV2RepoError'
  }
}

const facts = new WeakSet<object>()
const factContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()

export function isToolRegistryRepositoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is ToolRegistryRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value) && factContexts.get(value) === context)
}

function safeTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STATE_INVALID')
  }
  return value
}

export class ToolRegistryV2Repo {
  readonly #db: BetterSqlite3.Database
  readonly #nowMs: () => number

  constructor(db: BetterSqlite3.Database, nowMs: () => number = Date.now) {
    this.#db = db
    this.#nowMs = nowMs
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STATE_INVALID')
    }
  }

  installAndSelect(value: unknown, expectedHeadRevision: string | null): ToolRegistryRevisionV2 {
    const registry = decodeToolRegistryRevisionV2(value)
    const transaction = this.#db.transaction(() => {
      const head = this.#db.prepare(
        "SELECT registry_revision AS revision FROM tool_registry_head_v2 WHERE singleton_id='current'",
      ).get() as { revision: unknown } | undefined
      const current = head?.revision ?? null
      if (current !== expectedHeadRevision) {
        throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STALE_HEAD')
      }
      const at = safeTime(this.#nowMs())
      this.#db.prepare(`INSERT INTO tool_registry_revision_v2 (
        registry_revision, definitions_digest, definitions_json, created_at_ms
      ) VALUES (?, ?, ?, ?) ON CONFLICT(registry_revision) DO NOTHING`).run(
        registry.revision, registry.definitionsDigest, registry.canonicalJson, at,
      )
      const persisted = this.#load(registry.revision)
      if (persisted.canonicalJson !== registry.canonicalJson ||
          persisted.definitionsDigest !== registry.definitionsDigest) {
        throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STATE_INVALID')
      }
      if (head) {
        const result = this.#db.prepare(`UPDATE tool_registry_head_v2
          SET registry_revision=?, updated_at_ms=?
          WHERE singleton_id='current' AND registry_revision=?`).run(registry.revision, at, expectedHeadRevision)
        if (result.changes !== 1) throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STALE_HEAD')
      } else {
        this.#db.prepare(`INSERT INTO tool_registry_head_v2 (
          singleton_id, registry_revision, updated_at_ms
        ) VALUES ('current', ?, ?)`).run(registry.revision, at)
      }
      return persisted
    })
    return transaction.immediate()
  }

  currentRevision(): ToolRegistryRevisionV2 | null {
    const head = this.#db.prepare(
      "SELECT registry_revision AS revision FROM tool_registry_head_v2 WHERE singleton_id='current'",
    ).get() as { revision: unknown } | undefined
    if (!head) return null
    if (typeof head.revision !== 'string') {
      throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STATE_INVALID')
    }
    return this.#load(head.revision)
  }

  resolveCurrentForTools(
    context: GenerationV2AuthorityTransactionContextV2,
    allowedToolIds: readonly string[],
  ): ToolRegistryRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const registry = this.currentRevision()
    if (!registry) throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_NOT_FOUND')
    return this.#issueFact(context, registry, allowedToolIds)
  }

  loadSnapshotAuthority(
    context: GenerationV2AuthorityTransactionContextV2,
    revision: string,
    definitionsDigest: string,
    allowedToolIds: readonly string[],
  ): ToolRegistryRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const registry = this.#load(revision)
    if (registry.definitionsDigest !== definitionsDigest) {
      throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STATE_INVALID')
    }
    return this.#issueFact(context, registry, allowedToolIds)
  }

  #issueFact(
    context: GenerationV2AuthorityTransactionContextV2,
    registry: ToolRegistryRevisionV2,
    allowedToolIds: readonly string[],
  ): ToolRegistryRepositoryFactV2 {
    const fact = Object.freeze({
      trust: 'tool_registry_repository_fact_v2' as const,
      registry,
      selectedDefinitions: selectToolDefinitionsV2(registry, allowedToolIds),
    })
    facts.add(fact)
    factContexts.set(fact, context)
    const revoke = () => {
      facts.delete(fact)
      factContexts.delete(fact)
    }
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => {
        const persisted = this.#load(registry.revision)
        if (persisted.definitionsDigest !== registry.definitionsDigest) {
          throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STATE_INVALID')
        }
      },
      committed: revoke,
      rolledBack: revoke,
    })
    return fact
  }

  #load(revision: string): ToolRegistryRevisionV2 {
    const row = this.#db.prepare(`SELECT registry_revision, definitions_digest,
      definitions_json, created_at_ms FROM tool_registry_revision_v2 WHERE registry_revision=?`)
      .get(revision) as RegistryRow | undefined
    if (!row) throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_NOT_FOUND')
    if (typeof row.registry_revision !== 'string' || typeof row.definitions_digest !== 'string' ||
        typeof row.definitions_json !== 'string' || !Number.isSafeInteger(row.created_at_ms)) {
      throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STATE_INVALID')
    }
    let parsed: unknown
    try { parsed = JSON.parse(row.definitions_json) } catch {
      throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STATE_INVALID')
    }
    const registry = decodeToolRegistryRevisionV2(parsed)
    if (registry.revision !== row.registry_revision || registry.definitionsDigest !== row.definitions_digest ||
        registry.canonicalJson !== row.definitions_json) {
      throw new ToolRegistryV2RepoError('GENERATION_V2_TOOL_REGISTRY_STATE_INVALID')
    }
    return registry
  }
}

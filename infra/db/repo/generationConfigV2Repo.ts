import type BetterSqlite3 from 'better-sqlite3'
import type {
  GenerationConfigRevisionEntryV2,
  GenerationConfigRevisionScopeV2,
} from '../../../src/next/generation-v2/config/generationConfigRevisionV2'
import {
  decodeGenerationConfigLayerV2,
  projectGenerationConfigLayerV2,
  type GenerationConfigLayerV2,
} from '../../../src/next/generation-v2/config/generationConfigLayerV2'
import { mergeGenerationConfigLayersV2 } from '../../../src/next/generation-v2/config/resolveGenerationConfigV2'
import {
  stableSerializeProviderRequestBoundedV2,
  sha256PreparedBytesV2,
} from '../../../src/next/generation-v2/compiler/stableSerialize'
import { ConversationGraphV2Identity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
import { GenerationV2Identity } from '../../../src/next/generation-v2/domain/identityV2'
import type { ResolvedGenerationIntentV2 } from '../../../src/next/generation-v2/domain/resolvedGenerationIntentV2'

const MAX_SEMANTIC_BYTES = 1024 * 1024
const MAX_GENERATION = Number.MAX_SAFE_INTEGER

type ConfigRow = {
  owner_kind: unknown
  owner_id: unknown
  project_id: unknown
  conversation_id: unknown
  revision_generation: unknown
  config_revision: unknown
  semantic_json: unknown
  semantic_hash: unknown
  created_at_ms: unknown
  updated_at_ms: unknown
}

export type GenerationConfigScopeRepositoryFactV2 = Readonly<{
  trust: 'generation_config_repository_fact'
  ownerKind: GenerationConfigRevisionScopeV2
  ownerId: string
  revisionGeneration: number
  configRevision: GenerationV2Identity<'config_revision'>
  semanticLayer: GenerationConfigLayerV2
  semanticHash: string
  canonicalJson: string
  createdAtMs: number
  updatedAtMs: number
}>

export type ResolvedGenerationConfigAuthorityV2 = Readonly<{
  trust: 'resolved_generation_config_authority'
  semanticIntent: ResolvedGenerationIntentV2
  revisionSet: readonly GenerationConfigRevisionEntryV2[]
}>

export class GenerationConfigV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CONFIG_OWNER_INVALID'
    | 'GENERATION_V2_CONFIG_STATE_INVALID'
    | 'GENERATION_V2_CONFIG_NOT_FOUND'
    | 'GENERATION_V2_CONFIG_STALE_REVISION'
    | 'GENERATION_V2_CONFIG_REVISION_EXHAUSTED'
    | 'GENERATION_V2_CONFIG_CLOCK_INVALID'
    | 'GENERATION_V2_CONFIG_BYTE_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'GenerationConfigV2RepoError'
  }
}

const repositoryFacts = new WeakSet<object>()
const resolvedAuthorities = new WeakSet<object>()

function safeTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_CLOCK_INVALID')
  }
  return value
}

function ownerIdentity(ownerKind: GenerationConfigRevisionScopeV2, ownerId: string): void {
  if (ownerKind === 'global') {
    if (ownerId !== 'global') throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_OWNER_INVALID')
    return
  }
  if (ownerKind !== 'project' && ownerKind !== 'conversation') {
    throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_OWNER_INVALID')
  }
  ConversationGraphV2Identity.create(ownerKind === 'project' ? 'project_id' : 'conversation_id', ownerId)
}

function serializeLayer(layer: GenerationConfigLayerV2): string {
  try {
    return stableSerializeProviderRequestBoundedV2(projectGenerationConfigLayerV2(layer), MAX_SEMANTIC_BYTES)
  } catch (error) {
    if ((error as Error)?.message === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_BYTE_LIMIT_EXCEEDED')
    }
    throw error
  }
}

function hashText(value: string): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(value))
}

function revision(generation: number, semanticHash: string): string {
  return `config-v2:${generation}:${semanticHash}`
}

function decodeRow(row: ConfigRow): GenerationConfigScopeRepositoryFactV2 {
  if ((row.owner_kind !== 'global' && row.owner_kind !== 'project' && row.owner_kind !== 'conversation') ||
      typeof row.owner_id !== 'string' || !Number.isSafeInteger(row.revision_generation) ||
      (row.revision_generation as number) < 1 || (row.revision_generation as number) > MAX_GENERATION ||
      typeof row.config_revision !== 'string' || typeof row.semantic_json !== 'string' ||
      typeof row.semantic_hash !== 'string' || !/^[0-9a-f]{64}$/u.test(row.semantic_hash) ||
      !Number.isSafeInteger(row.created_at_ms) || (row.created_at_ms as number) < 0 ||
      !Number.isSafeInteger(row.updated_at_ms) || (row.updated_at_ms as number) < (row.created_at_ms as number)) {
    throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STATE_INVALID')
  }
  const ownerKind = row.owner_kind
  ownerIdentity(ownerKind, row.owner_id)
  if ((ownerKind === 'global' && (row.project_id !== null || row.conversation_id !== null)) ||
      (ownerKind === 'project' && (row.project_id !== row.owner_id || row.conversation_id !== null)) ||
      (ownerKind === 'conversation' && (row.project_id !== null || row.conversation_id !== row.owner_id))) {
    throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STATE_INVALID')
  }
  if (new TextEncoder().encode(row.semantic_json).byteLength > MAX_SEMANTIC_BYTES ||
      hashText(row.semantic_json) !== row.semantic_hash ||
      row.config_revision !== revision(row.revision_generation as number, row.semantic_hash)) {
    throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STATE_INVALID')
  }
  let parsed: unknown
  try { parsed = JSON.parse(row.semantic_json) } catch {
    throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STATE_INVALID')
  }
  const semanticLayer = decodeGenerationConfigLayerV2(parsed)
  if (serializeLayer(semanticLayer) !== row.semantic_json) {
    throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STATE_INVALID')
  }
  const fact = Object.freeze({
    trust: 'generation_config_repository_fact' as const,
    ownerKind,
    ownerId: row.owner_id,
    revisionGeneration: row.revision_generation as number,
    configRevision: GenerationV2Identity.create('config_revision', row.config_revision),
    semanticLayer,
    semanticHash: row.semantic_hash,
    canonicalJson: row.semantic_json,
    createdAtMs: row.created_at_ms as number,
    updatedAtMs: row.updated_at_ms as number,
  })
  repositoryFacts.add(fact)
  return fact
}

export function isGenerationConfigScopeRepositoryFactV2(
  value: unknown,
): value is GenerationConfigScopeRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && repositoryFacts.has(value))
}

export function isResolvedGenerationConfigAuthorityV2(
  value: unknown,
): value is ResolvedGenerationConfigAuthorityV2 {
  return Boolean(value && typeof value === 'object' && resolvedAuthorities.has(value))
}

export class GenerationConfigV2Repo {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STATE_INVALID')
    }
  }

  getScope(ownerKind: GenerationConfigRevisionScopeV2, ownerId: string): GenerationConfigScopeRepositoryFactV2 {
    ownerIdentity(ownerKind, ownerId)
    const row = this.db.prepare(`SELECT owner_kind, owner_id, project_id, conversation_id,
      revision_generation, config_revision, semantic_json, semantic_hash, created_at_ms, updated_at_ms
      FROM generation_config_v2 WHERE owner_kind = ? AND owner_id = ?`).get(ownerKind, ownerId) as ConfigRow | undefined
    if (!row) throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_NOT_FOUND')
    return decodeRow(row)
  }

  compareAndSetScope(
    ownerKind: GenerationConfigRevisionScopeV2,
    ownerId: string,
    expectedConfigRevision: string,
    semanticValue: unknown,
  ): GenerationConfigScopeRepositoryFactV2 {
    ownerIdentity(ownerKind, ownerId)
    const semanticLayer = decodeGenerationConfigLayerV2(semanticValue)
    const semanticJson = serializeLayer(semanticLayer)
    const semanticHash = hashText(semanticJson)
    const transaction = this.db.transaction(() => {
      const current = this.getScope(ownerKind, ownerId)
      if (current.configRevision.value !== expectedConfigRevision) {
        throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STALE_REVISION')
      }
      if (current.semanticHash === semanticHash && current.canonicalJson === semanticJson) return current
      if (current.revisionGeneration >= MAX_GENERATION) {
        throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_REVISION_EXHAUSTED')
      }
      const nextGeneration = current.revisionGeneration + 1
      const now = Math.max(safeTime(this.nowMs()), current.updatedAtMs)
      const result = this.db.prepare(`UPDATE generation_config_v2 SET
        revision_generation = ?, config_revision = ?, semantic_json = ?, semantic_hash = ?, updated_at_ms = ?
        WHERE owner_kind = ? AND owner_id = ? AND config_revision = ? AND revision_generation = ?`)
        .run(
          nextGeneration, revision(nextGeneration, semanticHash), semanticJson, semanticHash, now,
          ownerKind, ownerId, expectedConfigRevision, current.revisionGeneration,
        )
      if (result.changes !== 1) throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STALE_REVISION')
      return this.getScope(ownerKind, ownerId)
    })
    return this.runImmediate(transaction)
  }

  resolveForConversation(
    conversationId: string,
    expectedRevisionSet?: unknown,
  ): ResolvedGenerationConfigAuthorityV2 {
    ConversationGraphV2Identity.create('conversation_id', conversationId)
    const transaction = this.db.transaction(() => {
      const conversation = this.db.prepare(
        'SELECT project_id FROM conversation_v2 WHERE conversation_id = ?',
      ).get(conversationId) as { project_id: unknown } | undefined
      if (!conversation || typeof conversation.project_id !== 'string') {
        throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_NOT_FOUND')
      }
      const facts = Object.freeze([
        this.getScope('global', 'global'),
        this.getScope('project', conversation.project_id),
        this.getScope('conversation', conversationId),
      ])
      const revisionSet = Object.freeze(facts.map((fact) => Object.freeze({
        ownerKind: fact.ownerKind,
        ownerId: fact.ownerId,
        revision: fact.configRevision,
      })))
      if (expectedRevisionSet !== undefined) this.assertExpectedRevisionSet(expectedRevisionSet, revisionSet)
      const authority = Object.freeze({
        trust: 'resolved_generation_config_authority' as const,
        semanticIntent: mergeGenerationConfigLayersV2(facts.map((fact) => fact.semanticLayer)),
        revisionSet,
      })
      resolvedAuthorities.add(authority)
      return authority
    })
    return transaction.deferred()
  }

  private assertExpectedRevisionSet(
    value: unknown,
    actual: readonly GenerationConfigRevisionEntryV2[],
  ): void {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
        Reflect.ownKeys(value).length !== value.length + 1 || value.length !== actual.length) {
      throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STALE_REVISION')
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      const entry = descriptor && descriptor.enumerable && 'value' in descriptor ? descriptor.value : null
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
          (Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null)) {
        throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STALE_REVISION')
      }
      const descriptors = Object.getOwnPropertyDescriptors(entry)
      if (Reflect.ownKeys(entry).some((key) => typeof key !== 'string') ||
          Object.keys(descriptors).length !== 3 ||
          !['ownerKind', 'ownerId', 'revision'].every((key) => {
            const field = descriptors[key]
            return field?.enumerable && 'value' in field && typeof field.value === 'string'
          })) {
        throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STALE_REVISION')
      }
      if ((descriptors.ownerKind as PropertyDescriptor).value !== actual[index].ownerKind ||
          (descriptors.ownerId as PropertyDescriptor).value !== actual[index].ownerId ||
          (descriptors.revision as PropertyDescriptor).value !== actual[index].revision.value) {
        throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STALE_REVISION')
      }
    }
  }

  private runImmediate<T>(transaction: { immediate(): T }): T {
    try { return transaction.immediate() } catch (error) {
      if (error instanceof GenerationConfigV2RepoError) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        throw new GenerationConfigV2RepoError('GENERATION_V2_CONFIG_STALE_REVISION')
      }
      throw error
    }
  }
}

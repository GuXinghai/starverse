import type BetterSqlite3 from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import {
  GenerationV2Digest,
  GenerationV2Identity,
} from '../../../src/next/generation-v2/domain/identityV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

const FILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u
const OPENAI_ENDPOINT_PROFILE_ID = 'openai-api-v1'

export type OpenAIResponsesFileDescriptorV2 = Readonly<{
  trust: 'openai_responses_file_descriptor_repository_fact'
  descriptorId: GenerationV2Identity<'provider_file_descriptor_id'>
  descriptorRevision: GenerationV2Identity<'provider_file_descriptor_revision'>
  descriptorHash: GenerationV2Digest<'provider_file_descriptor_hash'>
  credentialScopeId: GenerationV2Identity<'credential_scope_id'>
  endpointProfileId: GenerationV2Identity<'endpoint_profile_id'>
  assetRevisionId: GenerationV2Identity<'asset_revision_id'>
  assetSha256: GenerationV2Digest<'asset_sha256'>
  fileId: string
  purpose: 'user_data'
  createdAtMs: number
}>

export class OpenAIResponsesFileDescriptorV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_FILE_DESCRIPTOR_INPUT_INVALID'
    | 'GENERATION_V2_OPENAI_FILE_DESCRIPTOR_NOT_FOUND'
    | 'GENERATION_V2_OPENAI_FILE_DESCRIPTOR_CONFLICT'
    | 'GENERATION_V2_OPENAI_FILE_DESCRIPTOR_STATE_INVALID'
    | 'GENERATION_V2_OPENAI_FILE_DESCRIPTOR_LOCK_CONFLICT') {
    super(code)
    this.name = 'OpenAIResponsesFileDescriptorV2RepoError'
  }
}

type DescriptorRow = Readonly<{
  descriptor_id: unknown
  descriptor_revision: unknown
  descriptor_hash: unknown
  credential_scope_id: unknown
  endpoint_profile_id: unknown
  asset_revision_id: unknown
  asset_sha256: unknown
  file_id: unknown
  purpose: unknown
  created_at_ms: unknown
}>

const facts = new WeakSet<object>()
const factScopes = new WeakMap<object, object>()

function fail(code: OpenAIResponsesFileDescriptorV2RepoError['code']): never {
  throw new OpenAIResponsesFileDescriptorV2RepoError(code)
}

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_INPUT_INVALID')
  return value as number
}

function exactInput(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expected = ['assetRevisionId', 'assetSha256', 'credentialScopeId', 'fileId']
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== expected.sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_INPUT_INVALID')
  }
  return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])))
}

function hashProjection(value: Readonly<{
  credentialScopeId: string
  assetRevisionId: string
  assetSha256: string
  fileId: string
}>): string {
  // stableSerialize remains the one digest input shape used by snapshots.
  return createHash('sha256').update(stableSerializeProviderRequestV2({
      providerId: 'openai_responses', endpointProfileId: OPENAI_ENDPOINT_PROFILE_ID,
      credentialScopeId: value.credentialScopeId, assetRevisionId: value.assetRevisionId,
      assetSha256: value.assetSha256, fileId: value.fileId, purpose: 'user_data',
    }), 'utf8').digest('hex')
}

function decode(row: DescriptorRow, scope: object): OpenAIResponsesFileDescriptorV2 {
  if (typeof row.descriptor_id !== 'string' || typeof row.descriptor_revision !== 'string' ||
      typeof row.descriptor_hash !== 'string' || typeof row.credential_scope_id !== 'string' ||
      typeof row.endpoint_profile_id !== 'string' || typeof row.asset_revision_id !== 'string' ||
      typeof row.asset_sha256 !== 'string' || typeof row.file_id !== 'string' ||
      row.endpoint_profile_id !== OPENAI_ENDPOINT_PROFILE_ID || row.purpose !== 'user_data' ||
      !FILE_ID_PATTERN.test(row.file_id) || !Number.isSafeInteger(row.created_at_ms) ||
      (row.created_at_ms as number) < 0) return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_STATE_INVALID')
  try {
    const descriptorId = GenerationV2Identity.create('provider_file_descriptor_id', row.descriptor_id)
    const descriptorRevision = GenerationV2Identity.create('provider_file_descriptor_revision', row.descriptor_revision)
    const descriptorHash = GenerationV2Digest.create('provider_file_descriptor_hash', row.descriptor_hash)
    const credentialScopeId = GenerationV2Identity.create('credential_scope_id', row.credential_scope_id)
    const endpointProfileId = GenerationV2Identity.create('endpoint_profile_id', row.endpoint_profile_id)
    const assetRevisionId = GenerationV2Identity.create('asset_revision_id', row.asset_revision_id)
    const assetSha256 = GenerationV2Digest.create('asset_sha256', row.asset_sha256)
    const expectedHash = hashProjection({
      credentialScopeId: credentialScopeId.value, assetRevisionId: assetRevisionId.value,
      assetSha256: assetSha256.value, fileId: row.file_id,
    })
    if (descriptorHash.value !== expectedHash ||
        descriptorId.value !== `openai-responses-file:${expectedHash}` ||
        descriptorRevision.value !== `openai-responses-file:v1:${expectedHash}`) {
      return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_STATE_INVALID')
    }
    const fact = Object.freeze({
      trust: 'openai_responses_file_descriptor_repository_fact' as const,
      descriptorId, descriptorRevision, descriptorHash, credentialScopeId, endpointProfileId,
      assetRevisionId, assetSha256, fileId: row.file_id, purpose: 'user_data' as const,
      createdAtMs: row.created_at_ms as number,
    })
    facts.add(fact); factScopes.set(fact, scope)
    return fact
  } catch {
    return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_STATE_INVALID')
  }
}

export function isOpenAIResponsesFileDescriptorV2(value: unknown): value is OpenAIResponsesFileDescriptorV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value))
}

export class OpenAIResponsesFileDescriptorV2Repo {
  readonly #scope = Object.freeze({})
  readonly #db: BetterSqlite3.Database
  readonly #nowMs: () => number
  constructor(db: BetterSqlite3.Database, nowMs: () => number = Date.now) {
    this.#db = db
    this.#nowMs = nowMs
  }

  insertOrGet(input: unknown): OpenAIResponsesFileDescriptorV2 {
    const value = exactInput(input)
    if (typeof value.credentialScopeId !== 'string' || typeof value.assetRevisionId !== 'string' ||
        typeof value.assetSha256 !== 'string' || typeof value.fileId !== 'string' || !FILE_ID_PATTERN.test(value.fileId)) {
      return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_INPUT_INVALID')
    }
    const credentialScopeId = GenerationV2Identity.create('credential_scope_id', value.credentialScopeId).value
    const assetRevisionId = GenerationV2Identity.create('asset_revision_id', value.assetRevisionId).value
    const assetSha256 = GenerationV2Digest.create('asset_sha256', value.assetSha256).value
    const descriptorHash = hashProjection({ credentialScopeId, assetRevisionId, assetSha256, fileId: value.fileId })
    const descriptorId = `openai-responses-file:${descriptorHash}`
    const descriptorRevision = `openai-responses-file:v1:${descriptorHash}`
    const now = safeTime(this.#nowMs())
    const transaction = this.#db.transaction(() => {
      const existing = this.#db.prepare(`SELECT * FROM openai_responses_file_descriptor_v2
        WHERE credential_scope_id=? AND endpoint_profile_id=? AND asset_revision_id=?`).get(
        credentialScopeId, OPENAI_ENDPOINT_PROFILE_ID, assetRevisionId,
      ) as DescriptorRow | undefined
      if (existing) {
        const fact = decode(existing, this.#scope)
        if (fact.assetSha256.value !== assetSha256 || fact.fileId !== value.fileId) {
          return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_CONFLICT')
        }
        return fact
      }
      this.#db.prepare(`INSERT INTO openai_responses_file_descriptor_v2 (
        descriptor_id, descriptor_revision, descriptor_hash, credential_scope_id, endpoint_profile_id,
        asset_revision_id, asset_sha256, file_id, purpose, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        descriptorId, descriptorRevision, descriptorHash, credentialScopeId, OPENAI_ENDPOINT_PROFILE_ID,
        assetRevisionId, assetSha256, value.fileId, 'user_data', now,
      )
      const row = this.#db.prepare('SELECT * FROM openai_responses_file_descriptor_v2 WHERE descriptor_id=?')
        .get(descriptorId) as DescriptorRow | undefined
      if (!row) return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_STATE_INVALID')
      return decode(row, this.#scope)
    })
    return this.runImmediate(transaction)
  }

  findByAttachment(input: Readonly<{
    credentialScopeId: string
    assetRevisionId: string
    assetSha256: string
  }>): OpenAIResponsesFileDescriptorV2 | null {
    const credentialScopeId = GenerationV2Identity.create('credential_scope_id', input.credentialScopeId).value
    const assetRevisionId = GenerationV2Identity.create('asset_revision_id', input.assetRevisionId).value
    const assetSha256 = GenerationV2Digest.create('asset_sha256', input.assetSha256).value
    const row = this.#db.prepare(`SELECT * FROM openai_responses_file_descriptor_v2
      WHERE credential_scope_id=? AND endpoint_profile_id=? AND asset_revision_id=?`).get(
      credentialScopeId, OPENAI_ENDPOINT_PROFILE_ID, assetRevisionId,
    ) as DescriptorRow | undefined
    if (!row) return null
    const fact = decode(row, this.#scope)
    if (fact.assetSha256.value !== assetSha256) return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_STATE_INVALID')
    return fact
  }

  loadForSnapshot(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{
    descriptorId: string
    descriptorRevision: string
    descriptorHash: string
    credentialScopeId: string
    assetRevisionId: string
    assetSha256: string
  }>): OpenAIResponsesFileDescriptorV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const descriptorId = GenerationV2Identity.create('provider_file_descriptor_id', input.descriptorId).value
    const descriptorRevision = GenerationV2Identity.create('provider_file_descriptor_revision', input.descriptorRevision).value
    const descriptorHash = GenerationV2Digest.create('provider_file_descriptor_hash', input.descriptorHash).value
    const credentialScopeId = GenerationV2Identity.create('credential_scope_id', input.credentialScopeId).value
    const assetRevisionId = GenerationV2Identity.create('asset_revision_id', input.assetRevisionId).value
    const assetSha256 = GenerationV2Digest.create('asset_sha256', input.assetSha256).value
    const row = this.#db.prepare(`SELECT * FROM openai_responses_file_descriptor_v2
      WHERE descriptor_id=? AND descriptor_revision=? AND descriptor_hash=? AND credential_scope_id=?
        AND endpoint_profile_id=? AND asset_revision_id=? AND asset_sha256=?`).get(
      descriptorId, descriptorRevision, descriptorHash, credentialScopeId,
      OPENAI_ENDPOINT_PROFILE_ID, assetRevisionId, assetSha256,
    ) as DescriptorRow | undefined
    if (!row) return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_NOT_FOUND')
    return decode(row, this.#scope)
  }

  private runImmediate<T>(transaction: { immediate(): T }): T {
    try { return transaction.immediate() } catch (error) {
      if (error instanceof OpenAIResponsesFileDescriptorV2RepoError) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        return fail('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_LOCK_CONFLICT')
      }
      throw error
    }
  }
}

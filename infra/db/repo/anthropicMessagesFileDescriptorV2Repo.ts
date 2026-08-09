import type BetterSqlite3 from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { GenerationV2Digest, GenerationV2Identity } from '../../../src/next/generation-v2/domain/identityV2'

const ENDPOINT_PROFILE_ID = 'anthropic-messages-2023-06-01'
const FILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u

export type AnthropicMessagesFileDescriptorV2 = Readonly<{
  trust: 'anthropic_messages_file_descriptor_repository_fact'
  descriptorId: GenerationV2Identity<'provider_file_descriptor_id'>
  descriptorRevision: GenerationV2Identity<'provider_file_descriptor_revision'>
  descriptorHash: GenerationV2Digest<'provider_file_descriptor_hash'>
  credentialScopeId: GenerationV2Identity<'credential_scope_id'>
  endpointProfileId: GenerationV2Identity<'endpoint_profile_id'>
  assetRevisionId: GenerationV2Identity<'asset_revision_id'>
  assetSha256: GenerationV2Digest<'asset_sha256'>
  fileId: string
  createdAtMs: number
}>

export class AnthropicMessagesFileDescriptorV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_INPUT_INVALID'
    | 'GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_NOT_FOUND'
    | 'GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_CONFLICT'
    | 'GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_STATE_INVALID') {
    super(code); this.name = 'AnthropicMessagesFileDescriptorV2RepoError'
  }
}

type Row = Readonly<Record<string, unknown>>
const facts = new WeakSet<object>()

function fail(code: AnthropicMessagesFileDescriptorV2RepoError['code']): never { throw new AnthropicMessagesFileDescriptorV2RepoError(code) }
function hashProjection(value: Readonly<{ credentialScopeId: string; assetRevisionId: string; assetSha256: string; fileId: string }>): string {
  return createHash('sha256').update(stableSerializeProviderRequestV2({ providerId: 'anthropic', endpointProfileId: ENDPOINT_PROFILE_ID, ...value }), 'utf8').digest('hex')
}
function decode(row: Row): AnthropicMessagesFileDescriptorV2 {
  if (typeof row.descriptor_id !== 'string' || typeof row.descriptor_revision !== 'string' || typeof row.descriptor_hash !== 'string' ||
      typeof row.credential_scope_id !== 'string' || typeof row.asset_revision_id !== 'string' || typeof row.asset_sha256 !== 'string' ||
      typeof row.file_id !== 'string' || !FILE_ID_PATTERN.test(row.file_id) || row.endpoint_profile_id !== ENDPOINT_PROFILE_ID ||
      !Number.isSafeInteger(row.created_at_ms) || (row.created_at_ms as number) < 0) fail('GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_STATE_INVALID')
  const descriptorHash = GenerationV2Digest.create('provider_file_descriptor_hash', row.descriptor_hash)
  const expected = hashProjection({ credentialScopeId: row.credential_scope_id, assetRevisionId: row.asset_revision_id, assetSha256: row.asset_sha256, fileId: row.file_id })
  if (descriptorHash.value !== expected || row.descriptor_id !== `anthropic-messages-file:${expected}` || row.descriptor_revision !== `anthropic-messages-file:v1:${expected}`) fail('GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_STATE_INVALID')
  const fact = Object.freeze({
    trust: 'anthropic_messages_file_descriptor_repository_fact' as const,
    descriptorId: GenerationV2Identity.create('provider_file_descriptor_id', row.descriptor_id),
    descriptorRevision: GenerationV2Identity.create('provider_file_descriptor_revision', row.descriptor_revision),
    descriptorHash,
    credentialScopeId: GenerationV2Identity.create('credential_scope_id', row.credential_scope_id),
    endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', ENDPOINT_PROFILE_ID),
    assetRevisionId: GenerationV2Identity.create('asset_revision_id', row.asset_revision_id),
    assetSha256: GenerationV2Digest.create('asset_sha256', row.asset_sha256),
    fileId: row.file_id,
    createdAtMs: row.created_at_ms as number,
  })
  facts.add(fact); return fact
}

export function isAnthropicMessagesFileDescriptorV2(value: unknown): value is AnthropicMessagesFileDescriptorV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value))
}

export class AnthropicMessagesFileDescriptorV2Repo {
  readonly #db: BetterSqlite3.Database
  readonly #nowMs: () => number
  constructor(db: BetterSqlite3.Database, nowMs: () => number = Date.now) { this.#db = db; this.#nowMs = nowMs }

  findByAttachment(input: Readonly<{ credentialScopeId: string; assetRevisionId: string; assetSha256: string }>): AnthropicMessagesFileDescriptorV2 | null {
    const row = this.#db.prepare(`SELECT * FROM anthropic_messages_file_descriptor_v2 WHERE credential_scope_id=? AND endpoint_profile_id=? AND asset_revision_id=?`).get(input.credentialScopeId, ENDPOINT_PROFILE_ID, input.assetRevisionId) as Row | undefined
    if (!row) return null
    const fact = decode(row)
    if (fact.assetSha256.value !== input.assetSha256) fail('GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_STATE_INVALID')
    return fact
  }

  insertOrGet(input: Readonly<{ credentialScopeId: string; assetRevisionId: string; assetSha256: string; fileId: string }>): AnthropicMessagesFileDescriptorV2 {
    if (!FILE_ID_PATTERN.test(input.fileId)) fail('GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_INPUT_INVALID')
    const hash = hashProjection(input)
    const id = `anthropic-messages-file:${hash}`; const revision = `anthropic-messages-file:v1:${hash}`
    const transaction = this.#db.transaction(() => {
      const existing = this.#db.prepare(`SELECT * FROM anthropic_messages_file_descriptor_v2 WHERE credential_scope_id=? AND endpoint_profile_id=? AND asset_revision_id=?`).get(input.credentialScopeId, ENDPOINT_PROFILE_ID, input.assetRevisionId) as Row | undefined
      if (existing) { const fact = decode(existing); if (fact.assetSha256.value !== input.assetSha256 || fact.fileId !== input.fileId) fail('GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_CONFLICT'); return fact }
      this.#db.prepare(`INSERT INTO anthropic_messages_file_descriptor_v2 (descriptor_id, descriptor_revision, descriptor_hash, credential_scope_id, endpoint_profile_id, asset_revision_id, asset_sha256, file_id, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, revision, hash, input.credentialScopeId, ENDPOINT_PROFILE_ID, input.assetRevisionId, input.assetSha256, input.fileId, this.#nowMs())
      const row = this.#db.prepare('SELECT * FROM anthropic_messages_file_descriptor_v2 WHERE descriptor_id=?').get(id) as Row | undefined
      return row ? decode(row) : fail('GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_STATE_INVALID')
    })
    return transaction.immediate()
  }
}

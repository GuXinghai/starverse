import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest as applyGenerationV2Schema } from '../v2/testSchemaV2'
import {
  AttachmentAssetV2Repo,
  consumeVerifiedAttachmentSendBytesLeaseV2,
  isVerifiedAttachmentSendBytesLeaseV2,
  type VerifiedAttachmentSendBytesLeaseV2,
} from './attachmentAssetV2Repo'
import { GenerationConfigV2Repo } from './generationConfigV2Repo'
import {
  isGenerationCommandFactsAuthorityV2,
  withSynchronousGenerationCommandFactsAuthorityV2,
  type GenerationCommandFactsAuthorityV2,
} from './generationCommandFactsAuthorityV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'

const root = path.resolve(process.cwd())

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, root)
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  return db
}

function createAttachment(
  repo: AttachmentAssetV2Repo,
  assetId: string,
  revisionId: string,
  bytesValue: readonly number[],
  include: boolean,
  sendAs: 'inline_text' | 'provider_file',
) {
  const bytes = new Uint8Array(bytesValue)
  const blob = repo.recordBlobFromBytes(bytes, 'application/octet-stream')
  repo.createAsset({ assetId, assetKind: 'file', filename: `${assetId}.bin`, sourceKind: 'user_import' })
  repo.appendSourceRevision({ assetId, assetRevisionId: revisionId, blob })
  return Object.freeze({
    bytes,
    input: Object.freeze({
      assetId,
      assetRevisionId: revisionId,
      assetSha256: blob.sha256.value,
      include,
      sendAs,
      conversion: 'none',
    }),
  })
}

function issue(
  db: BetterSqlite3.Database,
  configRepo: GenerationConfigV2Repo,
  attachmentRepo: AttachmentAssetV2Repo,
  attachments: unknown,
  use: (authority: GenerationCommandFactsAuthorityV2) => unknown,
  expected?: unknown,
): unknown {
  return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
    withSynchronousGenerationCommandFactsAuthorityV2(
      context, configRepo, attachmentRepo, 'conversation:1', attachments, expected, use,
    ),
  )
}

describe('GenerationCommandFactsAuthorityV2', () => {
  it('binds explicit empty command attachments to repository config revisions with zero execution authority', () => {
    const db = createDb()
    try {
      const configRepo = new GenerationConfigV2Repo(db)
      const attachmentRepo = new AttachmentAssetV2Repo(db)
      let escaped: GenerationCommandFactsAuthorityV2 | undefined
      issue(db, configRepo, attachmentRepo, [], (authority) => {
        escaped = authority
        expect(isGenerationCommandFactsAuthorityV2(authority)).toBe(true)
        expect(authority).toMatchObject({
          trust: 'generation_command_facts_authority',
          usage: 'snapshot_semantics_and_attachment_provenance_only',
          executionAuthority: 'none',
        })
        expect(authority.semanticIntent.attachments).toEqual([])
        expect(authority.attachmentSet.providerFileRequirements).toEqual([])
        expect(authority.resolvedConfigRevisions.map((entry) => entry.ownerKind))
          .toEqual(['global', 'project', 'conversation'])
        expect(Object.isFrozen(authority)).toBe(true)
      })
      expect(isGenerationCommandFactsAuthorityV2(escaped)).toBe(false)
      expect(isGenerationCommandFactsAuthorityV2({ ...escaped })).toBe(false)
    } finally { db.close() }
  })

  it('takes non-attachment semantics only from config and preserves all command attachment decisions in order', () => {
    const db = createDb()
    try {
      const configRepo = new GenerationConfigV2Repo(db, () => 20)
      const attachmentRepo = new AttachmentAssetV2Repo(db)
      const project = configRepo.getScope('project', 'project:1')
      configRepo.compareAndSetScope('project', 'project:1', project.configRevision.value, {
        schemaVersion: 2,
        generation: { temperature: 0.4 },
        reasoning: { mode: 'enabled', effort: 'high' },
      })
      const first = createAttachment(attachmentRepo, 'asset:b', 'revision:b', [2], true, 'provider_file')
      const second = createAttachment(attachmentRepo, 'asset:a', 'revision:a', [1], false, 'inline_text')
      issue(db, configRepo, attachmentRepo, [first.input, second.input], (authority) => {
        expect(authority.conversationId).toMatchObject({
          kind: 'conversation_id', value: 'conversation:1',
        })
        expect(authority.semanticIntent.generation).toEqual({ temperature: 0.4 })
        expect(authority.semanticIntent.reasoning).toEqual({ mode: 'enabled', effort: 'high' })
        expect(authority.semanticIntent.attachments.map((item) => item.assetId.value))
          .toEqual(['asset:b', 'asset:a'])
        expect(authority.semanticIntent.attachments.map((item) => [item.include, item.sendAs]))
          .toEqual([[true, 'provider_file'], [false, 'inline_text']])
        expect(authority.attachmentSet.providerFileRequirements.map((item) => item.assetRevisionId.value))
          .toEqual(['revision:b'])
        expect(authority.attachmentSet.providerFileRequirements[0]).not.toHaveProperty('descriptorId')
      })
    } finally { db.close() }
  })

  it('requires an explicit strict attachment collection and rejects stale config revisions before callback', () => {
    const db = createDb()
    try {
      const configRepo = new GenerationConfigV2Repo(db)
      const attachmentRepo = new AttachmentAssetV2Repo(db)
      let calls = 0
      expect(() => issue(db, configRepo, attachmentRepo, undefined, () => { calls += 1 }))
        .toThrow('GENERATION_V2_COMMAND_ATTACHMENTS_REQUIRED')
      expect(() => issue(db, configRepo, attachmentRepo, new Array(1), () => { calls += 1 }))
        .toThrow('GENERATION_V2_INTENT_INVALID_SHAPE')
      let reads = 0
      const accessor = new Array(1)
      Object.defineProperty(accessor, '0', { enumerable: true, get: () => { reads += 1; return {} } })
      expect(() => issue(db, configRepo, attachmentRepo, accessor, () => { calls += 1 }))
        .toThrow('GENERATION_V2_INTENT_INVALID_SHAPE')
      expect(reads).toBe(0)
      const expected = ['global', 'project:1', 'conversation:1'].map((ownerId, index) => ({
        ownerKind: ['global', 'project', 'conversation'][index],
        ownerId,
        revision: 'stale',
      }))
      expect(() => issue(db, configRepo, attachmentRepo, [], () => { calls += 1 }, expected))
        .toThrow('GENERATION_V2_CONFIG_STALE_REVISION')
      expect(calls).toBe(0)
    } finally { db.close() }
  })

  it('fails atomically before bundle exposure when any attachment fact is missing, retired or mismatched', () => {
    const db = createDb()
    try {
      let now = 10
      const configRepo = new GenerationConfigV2Repo(db)
      const attachmentRepo = new AttachmentAssetV2Repo(db, () => now)
      const valid = createAttachment(attachmentRepo, 'asset:1', 'revision:1', [1], true, 'inline_text')
      const retired = createAttachment(attachmentRepo, 'asset:2', 'revision:2', [2], true, 'inline_text')
      now = 20
      attachmentRepo.retireAsset('asset:2')
      let calls = 0
      const attempt = (attachments: unknown) => issue(
        db, configRepo, attachmentRepo, attachments, () => { calls += 1 },
      )
      expect(() => attempt([valid.input, {
        ...valid.input, assetId: 'asset:missing', assetRevisionId: 'revision:missing',
      }])).toThrow('GENERATION_V2_ASSET_NOT_FOUND')
      expect(() => attempt([valid.input, retired.input])).toThrow('GENERATION_V2_ASSET_RETIRED')
      expect(() => attempt([{ ...valid.input, assetSha256: 'a'.repeat(64) }]))
        .toThrow('GENERATION_V2_ASSET_INTENT_MISMATCH')
      expect(calls).toBe(0)
    } finally { db.close() }
  })

  it('rejects cross-database and async use and expires the bundle at callback exit', () => {
    const db = createDb()
    const other = createDb()
    try {
      const configRepo = new GenerationConfigV2Repo(db)
      const attachmentRepo = new AttachmentAssetV2Repo(db)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        withSynchronousGenerationCommandFactsAuthorityV2(
          context, configRepo, new AttachmentAssetV2Repo(other), 'conversation:1', [], undefined,
          () => undefined,
        ),
      )).toThrow('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
      const asyncUse = async () => undefined
      expect(() => issue(db, configRepo, attachmentRepo, [], asyncUse))
        .toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
    } finally { other.close(); db.close() }
  })

  it('rolls back pre-commit attachment changes and disposes pending bytes', async () => {
    const db = createDb()
    try {
      let now = 10
      const configRepo = new GenerationConfigV2Repo(db)
      const attachmentRepo = new AttachmentAssetV2Repo(db, () => now)
      const attachment = createAttachment(attachmentRepo, 'asset:1', 'revision:1', [1], true, 'inline_text')
      let lease: VerifiedAttachmentSendBytesLeaseV2 | undefined
      expect(() => issue(db, configRepo, attachmentRepo, [attachment.input], (authority) => {
        lease = attachmentRepo.verifyAttachmentSendBytes(authority.attachmentSet.attachments[0], attachment.bytes)
        now = 20
        attachmentRepo.retireAsset('asset:1')
      })).toThrow('GENERATION_V2_ASSET_RETIRED')
      expect(isVerifiedAttachmentSendBytesLeaseV2(lease)).toBe(false)
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(lease!, () => undefined))
        .rejects.toThrow('GENERATION_V2_ASSET_BYTES_DISPOSED')
      expect(db.prepare('SELECT retired_at_ms FROM file_asset_v2 WHERE asset_id = ?').get('asset:1'))
        .toEqual({ retired_at_ms: null })
    } finally { db.close() }
  })
})

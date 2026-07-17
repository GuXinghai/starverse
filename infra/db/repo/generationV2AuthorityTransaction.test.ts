import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { decodeGenerationIntentLayerV2 } from '../../../src/next/generation-v2/domain/generationIntentV2'
import { applyGenerationV2SchemaForTest as applyGenerationV2Schema } from '../v2/testSchemaV2'
import {
  AttachmentAssetV2Repo,
  consumeVerifiedAttachmentSendBytesLeaseV2,
  isResolvedAttachmentAssetAuthorityV2,
  isVerifiedAttachmentSendBytesLeaseV2,
  type ResolvedAttachmentAssetAuthorityV2,
  type VerifiedAttachmentSendBytesLeaseV2,
} from './attachmentAssetV2Repo'
import {
  GenerationConfigV2Repo,
  isResolvedGenerationConfigAuthorityV2,
  type ResolvedGenerationConfigAuthorityV2,
} from './generationConfigV2Repo'
import {
  isGenerationV2AuthorityTransactionContextV2,
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

const root = path.resolve(process.cwd())

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, root)
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  return db
}

function createAttachment(repo: AttachmentAssetV2Repo) {
  const bytes = new Uint8Array([1, 2, 3])
  const blob = repo.recordBlobFromBytes(bytes, 'application/octet-stream')
  repo.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'a.bin', sourceKind: 'user_import' })
  repo.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:1', blob })
  const layer = decodeGenerationIntentLayerV2({
    schemaVersion: 2,
    attachments: [{
      assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: blob.sha256.value,
      include: true, sendAs: 'inline_text', conversion: 'none',
    }],
  })
  return { bytes, intent: layer.attachments![0] }
}

describe('GenerationV2AuthorityTransaction internal Unit of Work primitive', () => {
  it('shares one transaction across config and attachment authorities and activates bytes after commit', async () => {
    const db = createDb()
    try {
      const configRepo = new GenerationConfigV2Repo(db)
      const assetRepo = new AttachmentAssetV2Repo(db)
      const { bytes, intent } = createAttachment(assetRepo)
      let config: ResolvedGenerationConfigAuthorityV2 | undefined
      let attachment: ResolvedAttachmentAssetAuthorityV2 | undefined
      const lease = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        config = configRepo.resolveForConversation(context, 'conversation:1')
        expect(isResolvedGenerationConfigAuthorityV2(config)).toBe(true)
        return assetRepo.withSynchronousSnapshotReferenceAuthority(context, intent, (authority) => {
          attachment = authority
          const pending = assetRepo.verifyAttachmentSendBytes(authority, bytes)
          expect(isVerifiedAttachmentSendBytesLeaseV2(pending)).toBe(false)
          return pending
        })
      })
      expect(isResolvedGenerationConfigAuthorityV2(config)).toBe(false)
      expect(isResolvedAttachmentAssetAuthorityV2(attachment)).toBe(false)
      expect(isVerifiedAttachmentSendBytesLeaseV2(lease)).toBe(true)
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(lease, (value) => [...value]))
        .resolves.toEqual([1, 2, 3])
    } finally { db.close() }
  })

  it('revokes pending bytes on callback and SQLite commit failure', async () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db)
      const { bytes, intent } = createAttachment(repo)
      let callbackLease: VerifiedAttachmentSendBytesLeaseV2 | undefined
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        repo.withSynchronousSnapshotReferenceAuthority(context, intent, (authority) => {
          callbackLease = repo.verifyAttachmentSendBytes(authority, bytes)
        })
        throw new Error('abort command')
      })).toThrow('abort command')
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(callbackLease!, () => undefined))
        .rejects.toThrow('GENERATION_V2_ASSET_BYTES_DISPOSED')

      db.exec(`CREATE TABLE commit_parent (id TEXT PRIMARY KEY);
        CREATE TABLE commit_child (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL REFERENCES commit_parent(id) DEFERRABLE INITIALLY DEFERRED
        );
        CREATE TRIGGER fail_config_commit AFTER UPDATE ON generation_config_v2 BEGIN
          INSERT INTO commit_child VALUES ('child', 'missing');
        END;`)
      let commitLease: VerifiedAttachmentSendBytesLeaseV2 | undefined
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        repo.withSynchronousSnapshotReferenceAuthority(context, intent, (authority) => {
          commitLease = repo.verifyAttachmentSendBytes(authority, bytes)
        })
        const config = new GenerationConfigV2Repo(db)
        const current = config.getScope('global', 'global')
        config.compareAndSetScope('global', 'global', current.configRevision.value, {
          schemaVersion: 2, generation: { temperature: 0.5 },
        })
      })).toThrow(/FOREIGN KEY constraint failed/u)
      expect(isVerifiedAttachmentSendBytesLeaseV2(commitLease)).toBe(false)
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(commitLease!, () => undefined))
        .rejects.toThrow('GENERATION_V2_ASSET_BYTES_DISPOSED')
      expect(new GenerationConfigV2Repo(db).getScope('global', 'global').revisionGeneration).toBe(1)
    } finally { db.close() }
  })

  it('rejects forged, cross-connection, nested, expired and async contexts', async () => {
    const first = createDb()
    const second = createDb()
    try {
      const firstRepo = new GenerationConfigV2Repo(first)
      const secondRepo = new GenerationConfigV2Repo(second)
      expect(() => firstRepo.resolveForConversation({
        trust: 'generation_v2_authority_transaction_context',
      } as never, 'conversation:1')).toThrow('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
      let escaped: unknown
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(first, (context) => {
        escaped = context
        expect(isGenerationV2AuthorityTransactionContextV2(context)).toBe(true)
        expect(() => secondRepo.resolveForConversation(context, 'conversation:1'))
          .toThrow('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
        expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(first, () => undefined))
          .toThrow('GENERATION_V2_AUTHORITY_TRANSACTION_NESTED')
      })
      expect(isGenerationV2AuthorityTransactionContextV2(escaped)).toBe(false)

      let activeAfterAwait: boolean | undefined
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(first, (async (
        context: GenerationV2AuthorityTransactionContextV2,
      ) => {
        await Promise.resolve()
        activeAfterAwait = isGenerationV2AuthorityTransactionContextV2(context)
      }) as never)).toThrow('GENERATION_V2_AUTHORITY_TRANSACTION_ASYNC_CALLBACK')
      await Promise.resolve()
      expect(activeAfterAwait).toBe(false)
    } finally {
      first.close()
      second.close()
    }
  })

  it('taints the transaction when an attachment callback failure is caught', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db)
      const { intent } = createAttachment(repo)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        try {
          repo.withSynchronousSnapshotReferenceAuthority(context, intent, () => {
            throw new Error('caught locally')
          })
        } catch { /* a failed participant cannot be ignored */ }
      })).toThrow('GENERATION_V2_ASSET_STATE_INVALID')
    } finally { db.close() }
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { decodeGenerationIntentLayerV2 } from '../../../src/next/generation-v2/domain/generationIntentV2'
import { applyGenerationV2Schema } from '../v2/schemaComposerV2'
import {
  AttachmentAssetV2Repo,
  consumeVerifiedAttachmentSendBytesLeaseV2,
  disposeVerifiedAttachmentSendBytesLeaseV2,
  isAttachmentAssetRevisionRepositoryFactV2,
  isAttachmentBlobRepositoryFactV2,
  isResolvedAttachmentAssetAuthorityV2,
  isVerifiedAttachmentSendBytesLeaseV2,
} from './attachmentAssetV2Repo'
import type { ResolvedAttachmentAssetAuthorityV2 } from './attachmentAssetV2Repo'

const root = path.resolve(process.cwd())

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, root)
  return db
}

function attachment(
  assetId: string,
  assetRevisionId: string,
  assetSha256: string,
  conversion = 'none',
  include = true,
) {
  const intent = decodeGenerationIntentLayerV2({
    schemaVersion: 2,
    attachments: [{
      assetId, assetRevisionId, assetSha256, include,
      sendAs: 'inline_text', conversion,
    }],
  })
  return intent.attachments![0]
}

describe('AttachmentAssetV2Repo immutable provenance', () => {
  it('records content-derived blob identity and resolves one exact source revision authority', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db, () => 10)
      const blob = repo.recordBlobFromBytes(new TextEncoder().encode('hello'), 'text/plain')
      expect(blob.blobId.value).toBe(`blob-v2:${blob.sha256.value}`)
      expect(blob.storageRef).toBe(`sha256/${blob.sha256.value.slice(0, 2)}/${blob.sha256.value}`)
      expect(blob.sizeBytes).toBe(5)
      expect(isAttachmentBlobRepositoryFactV2(blob)).toBe(true)
      expect(isAttachmentBlobRepositoryFactV2({ ...blob })).toBe(false)

      repo.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'hello.txt', sourceKind: 'user_import' })
      const revision = repo.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:1', blob })
      expect(isAttachmentAssetRevisionRepositoryFactV2(revision)).toBe(true)
      expect(isAttachmentAssetRevisionRepositoryFactV2({ ...revision })).toBe(false)
      let escapedAuthority: unknown
      const result = repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value),
        (authority) => {
          escapedAuthority = authority
          expect(isResolvedAttachmentAssetAuthorityV2(authority)).toBe(true)
          expect(isResolvedAttachmentAssetAuthorityV2({ ...authority })).toBe(false)
          expect(authority.usage).toBe('snapshot_reference_verified')
          return authority.revision.assetRevisionId.value
        },
      )
      expect(result).toBe('revision:1')
      expect(isResolvedAttachmentAssetAuthorityV2(escapedAuthority)).toBe(false)
    } finally { db.close() }
  })

  it('deduplicates identical blob bytes but rejects immutable metadata conflicts', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db, () => 10)
      const bytes = new Uint8Array([1, 2, 3])
      const first = repo.recordBlobFromBytes(bytes, 'application/octet-stream')
      const replay = repo.recordBlobFromBytes(bytes, 'application/octet-stream')
      expect(replay.blobId.value).toBe(first.blobId.value)
      expect(() => repo.recordBlobFromBytes(bytes, 'application/custom'))
        .toThrow('GENERATION_V2_ASSET_CONFLICT')
      expect(() => repo.recordBlobFromBytes(bytes, 'Invalid Mime'))
        .toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
    } finally { db.close() }
  })

  it('copies Uint8Array bytes through intrinsic slots without invoking caller hooks', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db, () => 10)
      const bytes = new Uint8Array([1, 2, 3])
      Object.defineProperty(bytes, Symbol.iterator, {
        value: () => { throw new Error('iterator must not run') },
      })
      Object.defineProperty(bytes, 'byteLength', {
        get: () => { throw new Error('byteLength getter must not run') },
      })
      expect(repo.recordBlobFromBytes(bytes, 'application/octet-stream').sizeBytes).toBe(3)

      const crossRealm = vm.runInNewContext('new Uint8Array([4, 5, 6])') as Uint8Array
      expect(repo.recordBlobFromBytes(crossRealm, 'application/octet-stream').sizeBytes).toBe(3)

      if (typeof SharedArrayBuffer !== 'undefined') {
        const shared = new Uint8Array(new SharedArrayBuffer(3))
        expect(() => repo.recordBlobFromBytes(shared, 'application/octet-stream'))
          .toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
      }
    } finally { db.close() }
  })

  it('rejects accessor inputs and repository facts issued by another database scope', () => {
    const firstDb = createDb()
    const secondDb = createDb()
    try {
      const first = new AttachmentAssetV2Repo(firstDb, () => 10)
      const second = new AttachmentAssetV2Repo(secondDb, () => 10)
      const foreignBlob = first.recordBlobFromBytes(new Uint8Array([1]), 'application/octet-stream')
      second.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'a.bin', sourceKind: 'user_import' })
      expect(() => second.appendSourceRevision({
        assetId: 'asset:1', assetRevisionId: 'revision:1', blob: foreignBlob,
      })).toThrow('GENERATION_V2_ASSET_INPUT_INVALID')

      let getterCalls = 0
      const accessor = Object.defineProperty({
        assetId: 'asset:2', assetKind: 'file', sourceKind: 'user_import',
      }, 'filename', {
        enumerable: true,
        get: () => { getterCalls += 1; return 'secret.txt' },
      })
      expect(() => second.createAsset(accessor as never)).toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
      expect(getterCalls).toBe(0)
      expect(() => second.createAsset({
        assetId: 'asset:2', assetKind: 'file', filename: 'a.bin', sourceKind: 'user_import',
        extra: true,
      } as never)).toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
    } finally {
      firstDb.close()
      secondDb.close()
    }
  })

  it('keeps B1 provenance source-only until a converter registry can issue authority', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db, () => 10)
      const sourceBlob = repo.recordBlobFromBytes(new TextEncoder().encode('source'), 'text/plain')
      repo.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'source.txt', sourceKind: 'user_import' })
      repo.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:source', blob: sourceBlob })
      expect(() => db.prepare(`INSERT INTO asset_revision_v2 VALUES (
        'revision:derived-sql', 'asset:1', ?, 'revision:source', 'derived', 'pdf',
        'converter:pdf', 'converter:pdf:1', 12
      )`).run(sourceBlob.blobId.value)).toThrow(/CHECK constraint failed/u)
      expect(() => repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:source', sourceBlob.sha256.value, 'pdf'),
        () => undefined,
      )).toThrow('GENERATION_V2_ASSET_INTENT_MISMATCH')
    } finally { db.close() }
  })

  it('rejects hash, conversion and explicit revision mismatches without a current-revision fallback', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db, () => 10)
      const first = repo.recordBlobFromBytes(new TextEncoder().encode('first'), 'text/plain')
      const second = repo.recordBlobFromBytes(new TextEncoder().encode('second'), 'text/plain')
      repo.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'a.txt', sourceKind: 'user_import' })
      repo.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:1', blob: first })
      repo.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:2', blob: second })
      expect(() => repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', second.sha256.value), () => undefined,
      ))
        .toThrow('GENERATION_V2_ASSET_INTENT_MISMATCH')
      expect(() => repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', first.sha256.value, 'pdf'), () => undefined,
      ))
        .toThrow('GENERATION_V2_ASSET_INTENT_MISMATCH')
      expect(() => repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:missing', first.sha256.value), () => undefined,
      ))
        .toThrow('GENERATION_V2_ASSET_NOT_FOUND')
    } finally { db.close() }
  })

  it('revalidates before commit, rolls back callback retirement and rejects async consumers', async () => {
    const db = createDb()
    try {
      let now = 10
      const repo = new AttachmentAssetV2Repo(db, () => now)
      const blob = repo.recordBlobFromBytes(new Uint8Array([1]), 'application/octet-stream')
      repo.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'a.bin', sourceKind: 'user_import' })
      repo.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:1', blob })
      const intent = attachment('asset:1', 'revision:1', blob.sha256.value)

      const forged = { ...intent }
      let forgedCallbackCalls = 0
      expect(() => repo.withSynchronousSnapshotReferenceAuthority(forged as never, () => {
        forgedCallbackCalls += 1
      })).toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
      expect(forgedCallbackCalls).toBe(0)
      let accessorCalls = 0
      const accessorIntent = Object.defineProperty({}, 'assetId', {
        enumerable: true,
        get: () => { accessorCalls += 1; return intent.assetId },
      })
      expect(() => repo.withSynchronousSnapshotReferenceAuthority(accessorIntent as never, () => undefined))
        .toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
      expect(accessorCalls).toBe(0)
      expect(Object.isFrozen(intent)).toBe(true)

      now = 20
      expect(() => repo.withSynchronousSnapshotReferenceAuthority(intent, (authority) => {
        repo.retireAsset('asset:1')
        expect(isResolvedAttachmentAssetAuthorityV2(authority)).toBe(true)
        return 'must-roll-back'
      })).toThrow('GENERATION_V2_ASSET_RETIRED')
      expect(repo.withSynchronousSnapshotReferenceAuthority(intent, () => 'still-active')).toBe('still-active')

      let validAfterAwait: boolean | undefined
      expect(() => repo.withSynchronousSnapshotReferenceAuthority(intent, (async (
        authority: ResolvedAttachmentAssetAuthorityV2,
      ) => {
        await Promise.resolve()
        validAfterAwait = isResolvedAttachmentAssetAuthorityV2(authority)
      }) as never)).toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
      await Promise.resolve()
      expect(validAfterAwait).toBe(false)
    } finally { db.close() }
  })

  it('keeps blobs, assets and revisions immutable and blocks authority after retirement', () => {
    const db = createDb()
    try {
      let now = 10
      const repo = new AttachmentAssetV2Repo(db, () => now)
      const blob = repo.recordBlobFromBytes(new Uint8Array([1]), 'application/octet-stream')
      repo.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'a.bin', sourceKind: 'user_import' })
      repo.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:1', blob })
      expect(() => db.prepare('UPDATE file_blob_v2 SET size_bytes=2').run())
        .toThrow('GENERATION_V2_ASSET_BLOB_IMMUTABLE')
      expect(() => db.prepare('DELETE FROM file_blob_v2').run())
        .toThrow('GENERATION_V2_ASSET_BLOB_IMMUTABLE')
      expect(() => db.prepare(`INSERT OR REPLACE INTO file_blob_v2
        SELECT * FROM file_blob_v2 WHERE blob_id = ?`).run(blob.blobId.value))
        .toThrow('GENERATION_V2_ASSET_BLOB_IMMUTABLE')
      expect(() => db.prepare(`INSERT OR REPLACE INTO file_asset_v2
        SELECT * FROM file_asset_v2 WHERE asset_id = 'asset:1'`).run())
        .toThrow('GENERATION_V2_ASSET_IMMUTABLE')
      expect(() => db.prepare('UPDATE asset_revision_v2 SET created_at_ms=11').run())
        .toThrow('GENERATION_V2_ASSET_REVISION_IMMUTABLE')
      expect(() => db.prepare('DELETE FROM asset_revision_v2').run())
        .toThrow('GENERATION_V2_ASSET_REVISION_IMMUTABLE')
      expect(() => db.prepare(`INSERT OR REPLACE INTO asset_revision_v2
        SELECT * FROM asset_revision_v2 WHERE asset_revision_id = 'revision:1'`).run())
        .toThrow('GENERATION_V2_ASSET_REVISION_IMMUTABLE')
      now = 20
      repo.retireAsset('asset:1')
      expect(() => repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value), () => undefined,
      ))
        .toThrow('GENERATION_V2_ASSET_RETIRED')
      expect(() => repo.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:2', blob }))
        .toThrow('GENERATION_V2_ASSET_RETIRED')
      expect(() => db.prepare('DELETE FROM file_asset_v2').run())
        .toThrow('GENERATION_V2_ASSET_IMMUTABLE')
    } finally { db.close() }
  })

  it('issues verified send bytes only inside B1 authority and consumes the lease once', async () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db, () => 10)
      const input = new Uint8Array([1, 2, 3])
      const blob = repo.recordBlobFromBytes(input, 'application/octet-stream')
      repo.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'a.bin', sourceKind: 'user_import' })
      repo.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:1', blob })

      let escapedAuthority: ResolvedAttachmentAssetAuthorityV2 | undefined
      const verified = repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value),
        (authority) => {
          escapedAuthority = authority
          const lease = repo.verifyAttachmentSendBytes(authority, input)
          expect(isVerifiedAttachmentSendBytesLeaseV2(lease)).toBe(false)
          return lease
        },
      )
      expect(isResolvedAttachmentAssetAuthorityV2(escapedAuthority)).toBe(false)
      expect(isVerifiedAttachmentSendBytesLeaseV2(verified)).toBe(true)
      expect(verified).toMatchObject({
        trust: 'verified_attachment_send_bytes_lease',
        filename: 'a.bin', mime: 'application/octet-stream', sizeBytes: 3,
      })
      expect(verified.assetId.value).toBe('asset:1')
      expect(verified.assetRevisionId.value).toBe('revision:1')
      expect(verified.assetSha256.value).toBe(blob.sha256.value)
      expect(verified.blobId.value).toBe(blob.blobId.value)

      input.fill(9)
      const jsonCopy = JSON.parse(JSON.stringify(verified)) as unknown
      expect(isVerifiedAttachmentSendBytesLeaseV2(jsonCopy)).toBe(false)
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(jsonCopy as never, () => undefined))
        .rejects.toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
      expect(() => repo.verifyAttachmentSendBytes(escapedAuthority!, new Uint8Array([1, 2, 3])))
        .toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
      let escapedConsumerBytes: Uint8Array | undefined
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(verified, async (bytes) => {
        escapedConsumerBytes = bytes
        expect([...bytes]).toEqual([1, 2, 3])
        await Promise.resolve()
        expect([...bytes]).toEqual([1, 2, 3])
        return 'sent'
      })).resolves.toBe('sent')
      expect([...escapedConsumerBytes!]).toEqual([0, 0, 0])
      expect(disposeVerifiedAttachmentSendBytesLeaseV2(verified)).toBe(false)
      expect(disposeVerifiedAttachmentSendBytesLeaseV2(verified)).toBe(false)
      expect(isVerifiedAttachmentSendBytesLeaseV2(verified)).toBe(false)
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(verified, () => undefined))
        .rejects.toThrow('GENERATION_V2_ASSET_BYTES_DISPOSED')

      const failingLease = repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value),
        (authority) => repo.verifyAttachmentSendBytes(authority, new Uint8Array([1, 2, 3])),
      )
      let failedConsumerBytes: Uint8Array | undefined
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(failingLease, async (bytes) => {
        failedConsumerBytes = bytes
        throw new Error('cancelled transport')
      })).rejects.toThrow('cancelled transport')
      expect([...failedConsumerBytes!]).toEqual([0, 0, 0])
      expect(isVerifiedAttachmentSendBytesLeaseV2(failingLease)).toBe(false)

      const poisonedLease = repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value),
        (authority) => repo.verifyAttachmentSendBytes(authority, new Uint8Array([1, 2, 3])),
      )
      let poisonedConsumerBytes: Uint8Array | undefined
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(poisonedLease, (bytes) => {
        poisonedConsumerBytes = bytes
        Object.defineProperty(bytes, 'fill', {
          value: () => { throw new Error('poisoned fill must not run') },
        })
        throw new Error('original consumer error')
      })).rejects.toThrow('original consumer error')
      expect([...poisonedConsumerBytes!]).toEqual([0, 0, 0])
      expect(isVerifiedAttachmentSendBytesLeaseV2(poisonedLease)).toBe(false)
      expect(disposeVerifiedAttachmentSendBytesLeaseV2(poisonedLease)).toBe(false)

      const detachedLease = repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value),
        (authority) => repo.verifyAttachmentSendBytes(authority, new Uint8Array([1, 2, 3])),
      )
      await consumeVerifiedAttachmentSendBytesLeaseV2(detachedLease, (bytes) => {
        structuredClone(bytes.buffer, { transfer: [bytes.buffer] })
        expect(bytes.byteLength).toBe(0)
      })
      expect(isVerifiedAttachmentSendBytesLeaseV2(detachedLease)).toBe(false)
      expect(disposeVerifiedAttachmentSendBytesLeaseV2(detachedLease)).toBe(false)

      const manualLease = repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value),
        (authority) => repo.verifyAttachmentSendBytes(authority, new Uint8Array([1, 2, 3])),
      )
      expect(disposeVerifiedAttachmentSendBytesLeaseV2(manualLease)).toBe(true)
      expect(disposeVerifiedAttachmentSendBytesLeaseV2(manualLease)).toBe(false)
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(manualLease, () => undefined))
        .rejects.toThrow('GENERATION_V2_ASSET_BYTES_DISPOSED')

      const activeLease = repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value),
        (authority) => repo.verifyAttachmentSendBytes(authority, new Uint8Array([1, 2, 3])),
      )
      let releaseConsumer!: () => void
      const activeConsumption = consumeVerifiedAttachmentSendBytesLeaseV2(activeLease, async () => {
        await new Promise<void>((resolve) => { releaseConsumer = resolve })
      })
      await Promise.resolve()
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(activeLease, () => undefined))
        .rejects.toThrow('GENERATION_V2_ASSET_BYTES_LEASE_IN_USE')
      expect(() => disposeVerifiedAttachmentSendBytesLeaseV2(activeLease))
        .toThrow('GENERATION_V2_ASSET_BYTES_LEASE_IN_USE')
      releaseConsumer()
      await activeConsumption
      expect(isVerifiedAttachmentSendBytesLeaseV2(activeLease)).toBe(false)

      let failedLease: ReturnType<AttachmentAssetV2Repo['verifyAttachmentSendBytes']> | undefined
      expect(() => repo.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value),
        (authority) => {
          failedLease = repo.verifyAttachmentSendBytes(authority, new Uint8Array([1, 2, 3]))
          throw new Error('abort after verification')
        },
      )).toThrow('abort after verification')
      expect(isVerifiedAttachmentSendBytesLeaseV2(failedLease)).toBe(false)
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(failedLease!, () => undefined))
        .rejects.toThrow('GENERATION_V2_ASSET_BYTES_DISPOSED')

      db.exec('BEGIN IMMEDIATE')
      try {
        expect(() => repo.withSynchronousSnapshotReferenceAuthority(
          attachment('asset:1', 'revision:1', blob.sha256.value),
          (authority) => repo.verifyAttachmentSendBytes(authority, new Uint8Array([1, 2, 3])),
        )).toThrow('GENERATION_V2_ASSET_SEND_BYTES_NESTED_TRANSACTION')
      } finally {
        db.exec('ROLLBACK')
      }
    } finally { db.close() }
  })

  it('rejects mismatched, excluded, foreign-scope and hostile send-byte inputs', async () => {
    const firstDb = createDb()
    const secondDb = createDb()
    try {
      const first = new AttachmentAssetV2Repo(firstDb, () => 10)
      const second = new AttachmentAssetV2Repo(secondDb, () => 10)
      const exact = new Uint8Array([1, 2, 3])
      const blob = first.recordBlobFromBytes(exact, 'application/octet-stream')
      first.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'a.bin', sourceKind: 'user_import' })
      first.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:1', blob })

      const viewLease = first.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value),
        (authority) => {
          expect(() => first.verifyAttachmentSendBytes(authority, new Uint8Array([1, 2, 4])))
            .toThrow('GENERATION_V2_ASSET_BYTES_MISMATCH')
          expect(() => second.verifyAttachmentSendBytes(authority, exact))
            .toThrow('GENERATION_V2_ASSET_INPUT_INVALID')

          const base = new Uint8Array([9, 1, 2, 3, 9])
          const view = base.subarray(1, 4)
          Object.defineProperty(view, Symbol.iterator, {
            value: () => { throw new Error('iterator must not run') },
          })
          Object.defineProperty(view, 'byteLength', {
            get: () => { throw new Error('byteLength getter must not run') },
          })
          if (typeof SharedArrayBuffer !== 'undefined') {
            expect(() => first.verifyAttachmentSendBytes(
              authority, new Uint8Array(new SharedArrayBuffer(3)),
            )).toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
          }
          const detachedBuffer = new ArrayBuffer(3)
          const detached = new Uint8Array(detachedBuffer)
          structuredClone(detachedBuffer, { transfer: [detachedBuffer] })
          expect(() => first.verifyAttachmentSendBytes(authority, detached))
            .toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
          return first.verifyAttachmentSendBytes(authority, view)
        },
      )
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(viewLease, (bytes) => [...bytes]))
        .resolves.toEqual([1, 2, 3])

      first.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value, 'none', false),
        (authority) => {
          expect(() => first.verifyAttachmentSendBytes(authority, exact))
            .toThrow('GENERATION_V2_ASSET_SEND_BYTES_NOT_INCLUDED')
        },
      )

      const emptyBlob = first.recordBlobFromBytes(new Uint8Array(), 'application/octet-stream')
      first.createAsset({ assetId: 'asset:empty', assetKind: 'file', filename: 'empty.bin', sourceKind: 'user_import' })
      first.appendSourceRevision({ assetId: 'asset:empty', assetRevisionId: 'revision:empty', blob: emptyBlob })
      const empty = first.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:empty', 'revision:empty', emptyBlob.sha256.value),
        (authority) => first.verifyAttachmentSendBytes(authority, new Uint8Array()),
      )
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(empty, (bytes) => bytes.byteLength))
        .resolves.toBe(0)
    } finally {
      firstDb.close()
      secondDb.close()
    }
  })

  it('enables foreign keys per connection and normalizes cross-connection locks', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-assets-v2-'))
    const file = path.join(directory, 'starverse.db')
    const first = new BetterSqlite3(file)
    const second = new BetterSqlite3(file)
    try {
      applyGenerationV2Schema(first, root)
      second.pragma('foreign_keys = OFF')
      second.pragma('busy_timeout = 0')
      const repoA = new AttachmentAssetV2Repo(first, () => 10)
      const repoB = new AttachmentAssetV2Repo(second, () => 10)
      expect(second.pragma('foreign_keys', { simple: true })).toBe(1)
      const blob = repoA.recordBlobFromBytes(new Uint8Array([2]), 'application/octet-stream')
      repoA.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'a.bin', sourceKind: 'user_import' })
      repoA.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:1', blob })
      repoA.withSynchronousSnapshotReferenceAuthority(
        attachment('asset:1', 'revision:1', blob.sha256.value),
        () => {
          expect(() => repoB.retireAsset('asset:1')).toThrow('GENERATION_V2_ASSET_LOCK_CONFLICT')
        },
      )
      first.exec('BEGIN IMMEDIATE')
      expect(() => repoB.recordBlobFromBytes(new Uint8Array([1]), 'application/octet-stream'))
        .toThrow('GENERATION_V2_ASSET_LOCK_CONFLICT')
      first.exec('ROLLBACK')
      expect(repoA.recordBlobFromBytes(new Uint8Array([1]), 'application/octet-stream').sizeBytes).toBe(1)
    } finally {
      if (first.inTransaction) first.exec('ROLLBACK')
      first.close()
      second.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})

import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FileAssetRepo } from './fileAssetRepo'
import { FileAssetStoreRepo } from './fileAssetStoreRepo'
import { canOpenBetterSqliteForSuite } from '../../testUtils/betterSqliteGate'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('FileAssetStoreRepo') ? describe : describe.skip

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function createHarness() {
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  const fileAssetRepo = new FileAssetRepo(db)
  const storeRepo = new FileAssetStoreRepo(db)
  fileAssetRepo.create({
    id: 'asset-1',
    sha256: 'a'.repeat(64),
    filename: 'asset.txt',
    extension: 'txt',
    mime: 'text/plain',
    sizeBytes: 4,
    assetKind: 'text',
    sourceKind: 'local_upload',
    storageBackend: 'local_fs',
    storageUri: 'assets/blobs/aa/' + 'a'.repeat(64) + '.txt',
    ingestStatus: 'stored',
    createdAt: 100,
    updatedAt: 100,
  })
  fileAssetRepo.create({
    id: 'asset-2',
    sha256: 'a'.repeat(64),
    filename: 'asset-copy.txt',
    extension: 'txt',
    mime: 'text/plain',
    sizeBytes: 4,
    assetKind: 'text',
    sourceKind: 'local_upload',
    storageBackend: 'local_fs',
    storageUri: 'assets/blobs/aa/' + 'a'.repeat(64) + '.txt',
    ingestStatus: 'stored',
    createdAt: 101,
    updatedAt: 101,
  })
  return { db, storeRepo }
}

describeIfBetterSqlite('FileAssetStoreRepo', () => {
  it('dedupes blobs by sha256 and tracks revisions separately per asset', () => {
    const h = createHarness()
    try {
      const blob = h.storeRepo.createBlob({
        id: 'blob-1',
        sha256: 'a'.repeat(64),
        sizeBytes: 4,
        mime: 'text/plain',
        storageUri: 'assets/blobs/aa/' + 'a'.repeat(64) + '.txt',
        createdAt: 100,
      })
      const duplicate = h.storeRepo.createBlob({
        id: 'blob-duplicate',
        sha256: 'a'.repeat(64),
        sizeBytes: 4,
        mime: 'text/plain',
        storageUri: 'assets/blobs/aa/' + 'a'.repeat(64) + '.txt',
        createdAt: 101,
      })

      expect(duplicate.id).toBe(blob.id)
      const imported = h.storeRepo.createRevision({
        id: 'rev-1',
        assetId: 'asset-1',
        blobId: blob.id,
        cause: 'imported',
        createdAt: 100,
      })
      const edited = h.storeRepo.createRevision({
        id: 'rev-2',
        assetId: 'asset-1',
        blobId: blob.id,
        parentRevisionId: imported.id,
        cause: 'ai_edited',
        createdAt: 200,
      })
      h.storeRepo.createRevision({
        id: 'rev-3',
        assetId: 'asset-2',
        blobId: blob.id,
        derivedFromAssetId: 'asset-1',
        cause: 'converted',
        createdAt: 150,
      })

      expect(h.storeRepo.getCurrentRevision('asset-1')).toMatchObject({
        id: edited.id,
        parentRevisionId: imported.id,
        cause: 'ai_edited',
      })
      expect(h.storeRepo.getCurrentRevision('asset-2')).toMatchObject({
        assetId: 'asset-2',
        derivedFromAssetId: 'asset-1',
        cause: 'converted',
      })
    } finally {
      h.db.close()
    }
  })

  it('marks bindings deleted without deleting the shared blob', () => {
    const h = createHarness()
    try {
      const blob = h.storeRepo.createBlob({
        id: 'blob-1',
        sha256: 'a'.repeat(64),
        sizeBytes: 4,
        mime: 'text/plain',
        storageUri: 'assets/blobs/aa/' + 'a'.repeat(64) + '.txt',
        createdAt: 100,
      })
      h.storeRepo.bindAsset({
        id: 'binding-conversation',
        assetId: 'asset-1',
        scope: 'conversation',
        conversationId: 'convo-1',
        createdAt: 100,
      })
      h.storeRepo.bindAsset({
        id: 'binding-message',
        assetId: 'asset-1',
        scope: 'message',
        messageId: 'message-1',
        createdAt: 101,
      })

      expect(h.storeRepo.markBindingDeleted({
        assetId: 'asset-1',
        scope: 'message',
        messageId: 'message-1',
        deletedAt: 200,
      })).toBe(1)
      expect(h.storeRepo.getBlobById(blob.id)).toMatchObject({ id: blob.id, sha256: 'a'.repeat(64) })
      expect(h.storeRepo.listBindingsByAssetId('asset-1')).toEqual([
        expect.objectContaining({ id: 'binding-conversation', deletedAt: null }),
        expect.objectContaining({ id: 'binding-message', deletedAt: 200 }),
      ])
    } finally {
      h.db.close()
    }
  })
})

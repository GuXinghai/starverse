import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AttachmentAssetV2Repo,
  consumeVerifiedAttachmentSendBytesLeaseV2,
} from '../../infra/db/repo/attachmentAssetV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { decodeGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentV2'
import { Epoch2AttachmentBlobStoreV2 } from './epoch2AttachmentBlobStoreV2'
import { createEpoch2ResetJournal } from './resetJournal'
import { writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from './rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from './rootManifestStore'
import {
  acquireWin32EpochRootLease,
  ensureEpoch2RootAuthority,
  putWin32EpochAttachmentBlob,
  readWin32EpochAttachmentBlob,
} from './win32EpochRootLease'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []

function fixture(name: string) {
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  roots.push(appDataRoot)
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot: process.cwd(),
  })
  fs.mkdirSync(layout.productRoot, { recursive: true })
  const lease = acquireWin32EpochRootLease(layout)
  writeEpoch2TransitionOwnershipManifestAtomic({
    layout,
    lease,
    manifest: createEpoch2RootManifest({ layout }),
  })
  writeEpoch2ResetJournalAtomic({
    layout,
    lease,
    journal: createEpoch2ResetJournal({
      layout,
      operationId: '123e4567-e89b-42d3-a456-426614174000',
    }),
  })
  return { layout, lease, rootAuthority: ensureEpoch2RootAuthority({ layout, lease }) }
}

function reference(bytes: Uint8Array) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return Object.freeze({
    sha256,
    storageRef: `sha256/${sha256.slice(0, 2)}/${sha256}`,
    sizeBytes: bytes.byteLength,
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('Win32 epoch-2 immutable attachment blob store', () => {
  windowsIt('uses a canonical digest namespace and verifies exact bytes on every read', () => {
    const value = fixture('starverse-epoch-attachment-blob')
    const bytes = Buffer.from('attachment bytes \u0000 remain binary-safe', 'utf8')
    const blob = reference(bytes)
    try {
      expect(putWin32EpochAttachmentBlob({ ...value, ...blob, bytes })).toBe('written')
      expect(putWin32EpochAttachmentBlob({ ...value, ...blob, bytes })).toBe('exists')
      expect(readWin32EpochAttachmentBlob({ ...value, ...blob })).toEqual(Uint8Array.from(bytes))

      expect(() => putWin32EpochAttachmentBlob({
        ...value,
        ...blob,
        bytes: Buffer.from('tampered', 'utf8'),
      })).toThrow('EPOCH2_WIN32_ATTACHMENT_BLOB_HASH_MISMATCH')
    } finally {
      value.lease.release()
    }
  })

  windowsIt('does not accept a reparse point in place of a canonical blob', () => {
    const value = fixture('starverse-epoch-attachment-reparse')
    const bytes = Buffer.from('attachment bytes', 'utf8')
    const blob = reference(bytes)
    const outside = path.join(value.layout.appDataRoot, 'outside-attachment')
    try {
      expect(putWin32EpochAttachmentBlob({ ...value, ...blob, bytes })).toBe('written')
      fs.writeFileSync(outside, bytes)
      const blobPath = path.join(value.layout.assetsRoot, ...blob.storageRef.split('/'))
      fs.unlinkSync(blobPath)
      fs.symlinkSync(outside, blobPath, 'file')
      expect(() => readWin32EpochAttachmentBlob({ ...value, ...blob }))
        .toThrow('EPOCH2_WIN32_ATTACHMENT_BLOB_MISSING')
      expect(fs.readFileSync(outside)).toEqual(bytes)
    } finally {
      value.lease.release()
    }
  })

  windowsIt('issues V2 send bytes only from the managed blob matching the snapshot revision', async () => {
    const value = fixture('starverse-epoch-attachment-v2-lease')
    const db = new BetterSqlite3(':memory:')
    const bytes = Buffer.from('snapshot attachment', 'utf8')
    try {
      applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
      const store = new Epoch2AttachmentBlobStoreV2(value)
      const persisted = store.persist(bytes)
      const repo = new AttachmentAssetV2Repo(db, () => 10)
      const blob = repo.recordBlobFromBytes(bytes, 'text/plain')
      expect(blob).toMatchObject({
        storageRef: persisted.storageRef,
        sizeBytes: persisted.sizeBytes,
      })
      repo.createAsset({
        assetId: 'asset:managed', assetKind: 'file', filename: 'managed.txt', sourceKind: 'user_import',
      })
      repo.appendSourceRevision({ assetId: 'asset:managed', assetRevisionId: 'revision:managed', blob })
      const intent = decodeGenerationIntentLayerV2({
        schemaVersion: 2,
        attachments: [{
          kind: 'managed_file',
          assetId: 'asset:managed', assetRevisionId: 'revision:managed',
          assetSha256: persisted.sha256, include: true, sendAs: 'provider_file', conversion: 'none',
        }],
      }).attachments![0]
      const lease = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        store.verifySnapshotAttachmentSendBytes({ attachmentRepo: repo, context, intent }),
      )
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(lease, (actual) => [...actual]))
        .resolves.toEqual([...bytes])
    } finally {
      db.close()
      value.lease.release()
    }
  })
})

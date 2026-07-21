import type {
  AttachmentAssetRevisionRepositoryFactV2,
  AttachmentAssetV2Repo,
  ResolvedAttachmentAssetAuthorityV2,
  VerifiedAttachmentSendBytesLeaseV2,
} from '../../infra/db/repo/attachmentAssetV2Repo'
import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { sha256PreparedBytesV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import type { AttachmentIntentV2 } from '../../src/next/generation-v2/domain/generationIntentV2'
import type { Epoch2WorkspaceLayout } from './rootManifest'
import {
  putWin32EpochAttachmentBlob,
  readWin32EpochAttachmentBlob,
  type Epoch2RootAuthority,
  type Win32EpochRootLease,
} from './win32EpochRootLease'

export type PersistedEpoch2AttachmentBlobV2 = Readonly<{
  storageRef: string
  sha256: string
  sizeBytes: number
  disposition: 'written' | 'exists'
}>

export class Epoch2AttachmentBlobStoreV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ATTACHMENT_BLOB_INPUT_INVALID'
    | 'GENERATION_V2_ATTACHMENT_BLOB_MISMATCH') {
    super(code)
    this.name = 'Epoch2AttachmentBlobStoreV2Error'
  }
}

function assertSafeBytes(value: Uint8Array): void {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array) ||
      !Number.isSafeInteger(value.byteLength) || value.byteLength < 0) {
    throw new Epoch2AttachmentBlobStoreV2Error('GENERATION_V2_ATTACHMENT_BLOB_INPUT_INVALID')
  }
}

function assertRevisionBlob(revision: AttachmentAssetRevisionRepositoryFactV2): void {
  if (revision.blob.storageRef !== `sha256/${revision.blob.sha256.value.slice(0, 2)}/${revision.blob.sha256.value}` ||
      !Number.isSafeInteger(revision.blob.sizeBytes) || revision.blob.sizeBytes < 0) {
    throw new Epoch2AttachmentBlobStoreV2Error('GENERATION_V2_ATTACHMENT_BLOB_MISMATCH')
  }
}

/**
 * The only V2 byte authority for attachment blobs. It deliberately exposes
 * neither an epoch filesystem path nor a generic file read/write operation.
 */
export class Epoch2AttachmentBlobStoreV2 {
  constructor(readonly input: Readonly<{
    layout: Epoch2WorkspaceLayout
    lease: Win32EpochRootLease
    rootAuthority: Epoch2RootAuthority
  }>) {}

  persist(bytes: Uint8Array): PersistedEpoch2AttachmentBlobV2 {
    assertSafeBytes(bytes)
    const sha256 = sha256PreparedBytesV2(bytes)
    const storageRef = `sha256/${sha256.slice(0, 2)}/${sha256}`
    return Object.freeze({
      storageRef,
      sha256,
      sizeBytes: bytes.byteLength,
      disposition: putWin32EpochAttachmentBlob({ ...this.input, storageRef, sha256, bytes }),
    })
  }

  readRevisionBytes(revision: AttachmentAssetRevisionRepositoryFactV2): Uint8Array {
    assertRevisionBlob(revision)
    const bytes = readWin32EpochAttachmentBlob({
      ...this.input,
      storageRef: revision.blob.storageRef,
      sha256: revision.blob.sha256.value,
      sizeBytes: revision.blob.sizeBytes,
    })
    if (sha256PreparedBytesV2(bytes) !== revision.blob.sha256.value) {
      bytes.fill(0)
      throw new Epoch2AttachmentBlobStoreV2Error('GENERATION_V2_ATTACHMENT_BLOB_MISMATCH')
    }
    return bytes
  }

  verifySnapshotAttachmentSendBytes(input: Readonly<{
    attachmentRepo: AttachmentAssetV2Repo
    context: GenerationV2AuthorityTransactionContextV2
    intent: AttachmentIntentV2
  }>): VerifiedAttachmentSendBytesLeaseV2 {
    if (input.intent.kind !== 'managed_file') {
      throw new Epoch2AttachmentBlobStoreV2Error('GENERATION_V2_ATTACHMENT_BLOB_INPUT_INVALID')
    }
    return input.attachmentRepo.withSynchronousSnapshotReferenceAuthority(
      input.context,
      input.intent,
      (authority: ResolvedAttachmentAssetAuthorityV2) => {
        const bytes = this.readRevisionBytes(authority.revision)
        try {
          return input.attachmentRepo.verifyAttachmentSendBytes(authority, bytes)
        } finally {
          bytes.fill(0)
        }
      },
    )
  }
}

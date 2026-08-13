import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { detectBasicFileTypeV2 } from '../../../src/next/file-type/basicFileTypeDetectionV2'
import { decodeGenerationIntentLayerV2 } from '../../../src/next/generation-v2/domain/generationIntentV2'
import { decodeResolvedGenerationIntentV2 } from '../../../src/next/generation-v2/domain/resolvedGenerationIntentV2'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { AttachmentAssetV2Repo } from './attachmentAssetV2Repo'
import { FileTypeDetectionV2Repo } from './fileTypeDetectionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'

function fixture() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  const assets = new AttachmentAssetV2Repo(db, () => 10)
  const detections = new FileTypeDetectionV2Repo(db, () => 20)
  const bytes = new TextEncoder().encode('hello')
  const blob = assets.recordBlobFromBytes(bytes, 'text/plain')
  assets.createAsset({ assetId: 'asset:1', assetKind: 'file', filename: 'a.txt', sourceKind: 'user_import' })
  assets.appendSourceRevision({ assetId: 'asset:1', assetRevisionId: 'revision:1', blob })
  const attachment = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: [{
    kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: blob.sha256.value,
    include: true, sendAs: 'provider_file', conversion: 'none',
  }] }).attachments![0]
  const resolved = decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
    web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [{
      kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: blob.sha256.value,
      include: true, sendAs: 'provider_file', conversion: 'none',
    }], providerExtension: { kind: 'none' } })
  const attempt = () => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
    assets.withSynchronousResolvedIntentAttachmentSetAuthority(context, resolved, () => 'ok'))
  const createPending = () => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
    detections.createPendingInAuthorityTransaction(context, { assetRevisionId: 'revision:1', assetSha256: blob.sha256.value,
      attemptId: 'attempt:1' }))
  return { db, detections, attachment, attempt, createPending }
}

describe('attachment file-type detection authority', () => {
  it('rejects missing, pending, failed, and statically blocked detection precisely', () => {
    const value = fixture()
    try {
      expect(value.attempt).toThrow('GENERATION_V2_FILE_DETECTION_REQUIRED')
      value.createPending()
      expect(value.attempt).toThrow('GENERATION_V2_FILE_DETECTION_PENDING')
      expect(value.detections.completeFailed({ assetRevisionId: 'revision:1', attemptId: 'attempt:1', revision: 1,
        errorCode: 'FILE_DETECTION_BLOB_MISMATCH', errorDetail: 'sanitized cause' })).toBe(true)
      expect(value.attempt).toThrow('GENERATION_V2_FILE_DETECTION_FAILED:FILE_DETECTION_BLOB_MISMATCH:sanitized cause')
      const retry = value.detections.beginRetry('revision:1', 'attempt:2')
      const detected = detectBasicFileTypeV2({ bytes: new TextEncoder().encode('hello'), filename: 'a.txt',
        declaredMime: 'text/plain', detectionTrigger: 'upload' })
      expect(value.detections.completeReady({ assetRevisionId: 'revision:1', attemptId: retry.attemptId, revision: retry.revision,
        verdict: detected.verdict, staticPolicy: { ...detected.staticPolicy, blocked: true,
          blockingReasonCodes: ['reason.test_block'] } })).toBe(true)
      expect(value.attempt).toThrow('GENERATION_V2_FILE_DETECTION_BLOCKED:reason.test_block')
    } finally { value.db.close() }
  })

  it('permits a ready non-blocked source verdict', () => {
    const value = fixture()
    try {
      value.createPending()
      const detected = detectBasicFileTypeV2({ bytes: new TextEncoder().encode('hello'), filename: 'a.txt',
        declaredMime: 'text/plain', detectionTrigger: 'upload' })
      value.detections.completeReady({ assetRevisionId: 'revision:1', attemptId: 'attempt:1', revision: 1,
        verdict: detected.verdict, staticPolicy: detected.staticPolicy })
      expect(value.attempt()).toBe('ok')
    } finally { value.db.close() }
  })
})

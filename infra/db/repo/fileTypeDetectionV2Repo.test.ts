import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { detectBasicFileTypeV2 } from '../../../src/next/file-type/basicFileTypeDetectionV2'
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
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    const blob = assets.recordBlobFromBytesInAuthorityTransaction(context, bytes, 'text/plain')
    assets.createImportedAssetRevisionInAuthorityTransaction(context, {
      assetId: 'asset:1', assetRevisionId: 'revision:1', assetKind: 'file', filename: 'a.txt', blob,
    })
    detections.createPendingInAuthorityTransaction(context, {
      assetRevisionId: 'revision:1', assetSha256: blob.sha256.value, attemptId: 'attempt:1',
    })
  })
  return { db, detections }
}

describe('FileTypeDetectionV2Repo', () => {
  it('commits only the matching pending attempt and revision', () => {
    const { db, detections } = fixture()
    try {
      const detected = detectBasicFileTypeV2({ bytes: new TextEncoder().encode('hello'), filename: 'a.txt',
        declaredMime: 'text/plain', detectionTrigger: 'upload' })
      expect(detections.completeReady({ assetRevisionId: 'revision:1', attemptId: 'stale', revision: 1,
        verdict: detected.verdict, staticPolicy: detected.staticPolicy })).toBe(false)
      expect(detections.completeReady({ assetRevisionId: 'revision:1', attemptId: 'attempt:1', revision: 1,
        verdict: detected.verdict, staticPolicy: detected.staticPolicy })).toBe(true)
      expect(detections.get('revision:1')).toMatchObject({ status: 'ready', revision: 2 })
    } finally { db.close() }
  })

  it('supersedes an old attempt on retry', () => {
    const { db, detections } = fixture()
    try {
      expect(detections.completeFailed({ assetRevisionId: 'revision:1', attemptId: 'attempt:1', revision: 1,
        errorCode: 'FILE_DETECTION_AUTHORITY_FAILED', errorDetail: 'retryable' })).toBe(true)
      const retry = detections.beginRetry('revision:1', 'attempt:2')
      expect(retry).toMatchObject({ status: 'pending', revision: 3, attemptId: 'attempt:2' })
      expect(detections.completeFailed({ assetRevisionId: 'revision:1', attemptId: 'attempt:1', revision: 1,
        errorCode: 'OLD', errorDetail: null })).toBe(false)
      expect(detections.completeFailed({ assetRevisionId: 'revision:1', attemptId: 'attempt:2', revision: 3,
        errorCode: 'FILE_DETECTION_AUTHORITY_FAILED', errorDetail: 'sanitized' })).toBe(true)
      expect(detections.get('revision:1')).toMatchObject({ status: 'failed', revision: 4,
        errorCode: 'FILE_DETECTION_AUTHORITY_FAILED', errorDetail: 'sanitized' })
    } finally { db.close() }
  })

  it('rejects retry unless the current attempt has failed', () => {
    const { db, detections } = fixture()
    try {
      expect(() => detections.beginRetry('revision:1', 'attempt:2')).toThrow('GENERATION_V2_FILE_DETECTION_STATE_INVALID')
      expect(detections.get('revision:1')).toMatchObject({ status: 'pending', revision: 1, attemptId: 'attempt:1' })
    } finally { db.close() }
  })
})

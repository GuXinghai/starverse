import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FileAssetRepo } from './fileAssetRepo'
import { FileDerivativeRepo } from './fileDerivativeRepo'
import { DerivativeJobRepo } from './derivativeJobRepo'
import { MessageAttachmentRepo } from './messageAttachmentRepo'
import { MessageRepo } from './messageRepo'
import { canOpenBetterSqliteForSuite } from '../../testUtils/betterSqliteGate'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('filePipelineRepo') ? describe : describe.skip

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function insertConvo(db: BetterSqlite3.Database, id: string) {
  const now = Date.now()
  db.prepare(`
    INSERT INTO convo(id, project_id, title, created_at, updated_at, meta)
    VALUES (@id, NULL, @title, @createdAt, @updatedAt, NULL)
  `).run({
    id,
    title: 'File Pipeline',
    createdAt: now,
    updatedAt: now,
  })
}

describeIfBetterSqlite('FileAssetRepo', () => {
  it('creates, reads, lists, and soft-deletes file assets without cross-session dedupe', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new FileAssetRepo(db)

    const first = repo.create({
      id: 'asset-1',
      sha256: 'same-sha',
      filename: 'report.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 12,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.pdf',
      ingestStatus: 'stored',
    })
    const second = repo.create({
      id: 'asset-2',
      sha256: 'same-sha',
      filename: 'report-copy.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 12,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-2.pdf',
      ingestStatus: 'stored',
    })

    expect(repo.getById(first.id)).toMatchObject({
      id: 'asset-1',
      sha256: 'same-sha',
      storageBackend: 'local_fs',
      previewStatus: 'not_requested',
      deletedAt: null,
    })
    expect(repo.listByIds({ ids: [first.id, second.id] })).toHaveLength(2)

    const result = repo.softDelete({ id: first.id, deletedAt: 1234 })
    expect(result).toEqual({ ok: true, softDeleted: true, physicalCleanupRequired: true })
    expect(repo.getById(first.id)).toMatchObject({
      ingestStatus: 'deleted',
      deletedAt: 1234,
      storageUri: 'assets/original/as/asset-1.pdf',
    })
    expect(repo.getById(second.id)?.deletedAt).toBeNull()
  })
})

describeIfBetterSqlite('FileDerivativeRepo', () => {
  it('creates derivatives, lists them by parent asset id, and resolves the latest ready derivative', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const assetRepo = new FileAssetRepo(db)
    const derivativeRepo = new FileDerivativeRepo(db)

    assetRepo.create({
      id: 'asset-1',
      sha256: 'sha',
      filename: 'report.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 12,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.pdf',
    })
    derivativeRepo.create({
      id: 'derivative-1',
      parentAssetId: 'asset-1',
      derivedKind: 'extracted_text',
      mime: 'text/plain',
      storageUri: 'assets/derived/asset-1/derivative-1.txt',
      generator: 'phase-2-test',
      status: 'ready',
      metaJson: { chars: 42 },
      createdAt: 1,
    })
    derivativeRepo.create({
      id: 'derivative-2',
      parentAssetId: 'asset-1',
      derivedKind: 'extracted_text',
      mime: 'text/plain',
      storageUri: 'assets/derived/asset-1/derivative-2.txt',
      generator: 'phase-7-test',
      status: 'ready',
      metaJson: { chars: 84 },
      createdAt: 2,
    })

    expect(derivativeRepo.listByParentAssetId({ parentAssetId: 'asset-1' })).toEqual([
      expect.objectContaining({
        id: 'derivative-1',
        parentAssetId: 'asset-1',
        derivedKind: 'extracted_text',
        status: 'ready',
        metaJson: { chars: 42 },
      }),
      expect.objectContaining({
        id: 'derivative-2',
        metaJson: { chars: 84 },
      }),
    ])
    expect(derivativeRepo.getLatestReady({ parentAssetId: 'asset-1', derivedKind: 'extracted_text' })).toEqual(
      expect.objectContaining({ id: 'derivative-2', metaJson: { chars: 84 } })
    )
  })
})

describeIfBetterSqlite('DerivativeJobRepo', () => {
  it('creates, reads, lists, and updates derivative job lifecycle state', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const assetRepo = new FileAssetRepo(db)
    const repo = new DerivativeJobRepo(db)

    assetRepo.create({
      id: 'asset-1',
      sha256: 'sha',
      filename: 'note.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 4,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.txt',
      ingestStatus: 'stored',
    })

    const created = repo.create({
      id: 'job-1',
      assetId: 'asset-1',
      derivativeKind: 'embedding_vector',
      taskFamily: 'embeddings',
      generator: 'phase-7-test',
      modelId: 'openai/text-embedding-3-small',
      configJson: { modelId: 'openai/text-embedding-3-small' },
    })
    expect(created.status).toBe('pending')

    const running = repo.markRunning(created.id, 1, 10)
    expect(running).toMatchObject({ status: 'running', attemptCount: 1, startedAt: 10 })

    const failed = repo.markFailed(created.id, 'embedding_request_failed', 'boom', 20)
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'embedding_request_failed', finishedAt: 20 })

    const retried = repo.resetForRetry(created.id, 30)
    expect(retried).toMatchObject({ status: 'pending', errorCode: null, finishedAt: null, updatedAt: 30 })

    const cancelled = repo.markCancelled({ jobId: created.id, reason: 'stop' })
    expect(cancelled).toMatchObject({ status: 'cancelled', errorCode: 'derivative_task_cancelled' })

    expect(repo.getById(created.id)).toMatchObject({ id: 'job-1' })
    expect(repo.listByAssetId({ assetId: 'asset-1' })).toHaveLength(1)
  })
})

describeIfBetterSqlite('MessageAttachmentRepo', () => {
  it('creates message attachments and lists by message id or asset id', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const message = new MessageRepo(db).append({ convoId: 'c1', role: 'user', body: 'see attachment' })
    const assetRepo = new FileAssetRepo(db)
    const attachmentRepo = new MessageAttachmentRepo(db)

    const asset = assetRepo.create({
      id: 'asset-1',
      sha256: 'sha',
      filename: 'image.png',
      extension: 'png',
      mime: 'image/png',
      sizeBytes: 8,
      assetKind: 'image',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.png',
      ingestStatus: 'stored',
    })
    const attachment = attachmentRepo.create({
      id: 'attachment-1',
      messageId: message.id,
      assetId: asset.id,
      aiPayloadKind: 'image',
      processingStatus: 'native_supported',
      includeInNextRequest: true,
    })

    expect(attachment).toMatchObject({
      id: 'attachment-1',
      messageId: message.id,
      assetId: asset.id,
      includeInNextRequest: true,
      excludedReason: null,
    })
    expect(attachmentRepo.listByMessageId({ messageId: message.id })).toHaveLength(1)
    expect(attachmentRepo.listByAssetId({ assetId: asset.id })).toHaveLength(1)
  })
})

describeIfBetterSqlite('file pipeline cleanup planning', () => {
  it('plans physical cleanup without deleting files or records', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const assetRepo = new FileAssetRepo(db)
    const derivativeRepo = new FileDerivativeRepo(db)

    assetRepo.create({
      id: 'asset-1',
      sha256: 'sha',
      filename: 'report.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 12,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.pdf',
    })
    derivativeRepo.create({
      id: 'derivative-1',
      parentAssetId: 'asset-1',
      derivedKind: 'thumbnail',
      mime: 'image/png',
      storageUri: 'assets/derived/asset-1/derivative-1.png',
      generator: 'phase-2-test',
    })

    expect(assetRepo.planPhysicalCleanup({ id: 'asset-1' })).toEqual({
      ok: true,
      assetId: 'asset-1',
      storageUris: ['assets/original/as/asset-1.pdf', 'assets/derived/asset-1/derivative-1.png'],
      physicalDeletePerformed: false,
    })
  })
})

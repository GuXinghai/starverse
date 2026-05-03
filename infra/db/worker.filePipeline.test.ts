import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { DbHandler, DbMethod } from './types'
import { dispatchWorkerMessage } from './worker/router'
import { registerFilePipelineHandlers } from './worker/handlers/filePipelineHandlers'
import { FileAssetRepo } from './repo/fileAssetRepo'
import { FileDerivativeRepo } from './repo/fileDerivativeRepo'
import { DerivativeJobRepo } from './repo/derivativeJobRepo'
import { MessageAttachmentRepo } from './repo/messageAttachmentRepo'
import { MessageRepo } from './repo/messageRepo'
import { BranchRepo } from './repo/branchRepo'
import { ConversationDraftRepo } from './repo/conversationDraftRepo'
import { ModelCatalogRepo } from './repo/modelCatalogRepo'
import { FileTypeVerdictRepo } from './repo/fileTypeVerdictRepo'
import { ConversationAttachmentService } from '../files/conversationAttachmentService'
import { DerivativeJobService } from '../files/derivativeJobService'
import { FileIngestionService } from '../files/fileIngestionService'
import { SendPlanService } from '../files/sendPlanService'
import { FileTypeDetectionService } from '../files/fileTypeDetectionService'
import { canOpenBetterSqliteForSuite } from '../testUtils/betterSqliteGate'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('file pipeline worker handlers') ? describe : describe.skip

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
    title: 'File Pipeline Worker',
    createdAt: now,
    updatedAt: now,
  })
}

function createWorkerHarness() {
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  insertConvo(db, 'c1')
  const message = new MessageRepo(db).append({ convoId: 'c1', role: 'user', body: 'attach' })
  const fileAssetRepo = new FileAssetRepo(db)
  const fileDerivativeRepo = new FileDerivativeRepo(db)
  const derivativeJobRepo = new DerivativeJobRepo(db)
  const fileTypeVerdictRepo = new FileTypeVerdictRepo(db)
  const messageAttachmentRepo = new MessageAttachmentRepo(db)
  const messageRepo = new MessageRepo(db)
  const branchRepo = new BranchRepo(db)
  const modelCatalogRepo = new ModelCatalogRepo(db)
  const handlers = new Map<DbMethod, DbHandler>()
  const conversationAttachmentService = new ConversationAttachmentService({
    db,
    fileAssetRepo,
    messageRepo,
    messageAttachmentRepo,
    branchRepo,
    draftRepo: new ConversationDraftRepo(db),
    now: () => 1000,
  })
  const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
  registerFilePipelineHandlers((method, handler) => handlers.set(method, handler), {
    db,
    fileAssetRepo,
    fileDerivativeRepo,
    derivativeJobRepo,
    messageAttachmentRepo,
    conversationAttachmentService,
    derivativeJobService: new DerivativeJobService({
      db,
      fileAssetRepo,
      fileDerivativeRepo,
      derivativeJobRepo,
      modelCatalogRepo,
      storageRootDir,
      now: () => 1000,
    }),
    sendPlanService: new SendPlanService({
      conversationAttachmentService,
      fileAssetRepo,
      fileTypeVerdictRepo,
    }),
    fileTypeDetectionService: new FileTypeDetectionService({
      db,
      fileAssetRepo,
      fileTypeVerdictRepo,
      storageRootDir,
      now: () => 1000,
    }),
    fileIngestionService: new FileIngestionService({
      fileAssetRepo,
      storageRootDir,
    }),
    fileStorageRootDir: storageRootDir,
  } as any)
  return { handlers, message }
}

async function createWorkerAsset(handlers: Map<DbMethod, DbHandler>) {
  return dispatchWorkerMessage(handlers, {
    id: 'req-asset',
    method: 'fileAsset.create',
    params: {
      id: 'asset-1',
      sha256: 'sha',
      filename: 'note.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 5,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.txt',
      ingestStatus: 'stored',
    },
  })
}

describeIfBetterSqlite('file pipeline worker handlers', () => {
  it('routes repo-backed file asset, derivative, and attachment methods', async () => {
    const { handlers, message } = createWorkerHarness()
    const createAsset = await createWorkerAsset(handlers)
    expect(createAsset.ok).toBe(true)

    const createDerivative = await dispatchWorkerMessage(handlers, {
      id: 'req-derivative',
      method: 'fileDerivative.create',
      params: {
        id: 'derivative-1',
        parentAssetId: 'asset-1',
        derivedKind: 'preview_optimized',
        mime: 'text/plain',
        storageUri: 'assets/derived/asset-1/derivative-1.txt',
        generator: 'phase-2-test',
      },
    })
    expect(createDerivative.ok).toBe(true)

    const createAttachment = await dispatchWorkerMessage(handlers, {
      id: 'req-attachment',
      method: 'messageAttachment.create',
      params: {
        id: 'attachment-1',
        messageId: message.id,
        assetId: 'asset-1',
        aiPayloadKind: 'text',
        processingStatus: 'native_supported',
      },
    })
    expect(createAttachment.ok).toBe(true)

    const listAttachments = await dispatchWorkerMessage(handlers, {
      id: 'req-list',
      method: 'messageAttachment.listByMessageId',
      params: { messageId: message.id },
    })
    expect(listAttachments).toMatchObject({
      ok: true,
      result: [expect.objectContaining({ id: 'attachment-1', assetId: 'asset-1' })],
    })
  })

  it('routes draft attachment restore, add, and commit methods', async () => {
    const { handlers } = createWorkerHarness()
    await createWorkerAsset(handlers)
    const restoreDraft = await dispatchWorkerMessage(handlers, {
      id: 'req-draft',
      method: 'conversationDraft.restore',
      params: { conversationId: 'c1' },
    })
    expect(restoreDraft).toMatchObject({ ok: true, result: expect.objectContaining({ conversationId: 'c1' }) })

    await dispatchWorkerMessage(handlers, {
      id: 'req-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId: 'asset-1' },
    })

    const commitDraft = await dispatchWorkerMessage(handlers, {
      id: 'req-draft-commit',
      method: 'conversationDraft.commitToUserMessage',
      params: { conversationId: 'c1', body: 'draft with file' },
    })
    expect(commitDraft).toMatchObject({
      ok: true,
      result: {
        message: expect.objectContaining({ role: 'user', body: 'draft with file' }),
        attachments: [expect.objectContaining({ assetId: 'asset-1' })],
        draft: expect.objectContaining({ attachedAssetIds: [] }),
      },
    })
  })

  it('routes send plan build and draft-to-existing-message migration methods', async () => {
    const { handlers, message } = createWorkerHarness()
    await createWorkerAsset(handlers)
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const storageUri = 'assets/original/as/asset-1.txt'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'hello')
    await dispatchWorkerMessage(handlers, {
      id: 'req-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId: 'asset-1' },
    })

    const planResult = await dispatchWorkerMessage(handlers, {
      id: 'req-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send with file',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/text',
          modelKey: 'openrouter::test/text',
          inputModalities: ['text', 'file'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsTextUrlRef: true,
        },
      },
    })
    expect(planResult).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({ status: 'sendable' }),
        assets: [expect.objectContaining({ id: 'asset-1' })],
      },
    })

    const attached = await dispatchWorkerMessage(handlers, {
      id: 'req-attach-existing',
      method: 'conversationDraft.attachToMessage',
      params: { conversationId: 'c1', messageId: message.id },
    })
    expect(attached).toMatchObject({
      ok: true,
      result: {
        messageId: message.id,
        attachments: [expect.objectContaining({ assetId: 'asset-1' })],
        draft: expect.objectContaining({ attachedAssetIds: [] }),
      },
    })
  })

  it('routes OpenRouter preparation through the worker-side serializer', async () => {
    const { handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-openrouter'
    const storageUri = 'assets/original/as/asset-openrouter.png'

    await dispatchWorkerMessage(handlers, {
      id: 'req-asset-openrouter',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'sha-openrouter',
        filename: 'asset-openrouter.png',
        extension: 'png',
        mime: 'image/png',
        sizeBytes: 4,
        assetKind: 'image',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri,
        ingestStatus: 'stored',
        previewStatus: 'not_requested',
        sourceMetaJson: null,
      },
    })

    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), new Uint8Array([0x89, 0x50, 0x4e, 0x47]))

    await dispatchWorkerMessage(handlers, {
      id: 'req-openrouter-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const prepared = await dispatchWorkerMessage(handlers, {
      id: 'req-openrouter-prepare',
      method: 'sendPlan.prepareOpenRouter',
      params: {
        conversationId: 'c1',
        draftText: 'describe this image',
        historyMessageIds: ['m1'],
        model: {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
          inputModalities: ['text', 'image', 'file'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
        },
      },
    })

    expect(prepared).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        sendPlan: expect.objectContaining({ status: 'sendable' }),
        contentParts: [
          { type: 'text', text: 'describe this image' },
          { type: 'image_url', image_url: { url: expect.stringMatching(/^data:image\/png;base64,/) } },
        ],
      }),
    })
  })

  it('routes derivative job creation, listing, and cancellation methods', async () => {
    const { handlers } = createWorkerHarness()
    await createWorkerAsset(handlers)

    const created = await dispatchWorkerMessage(handlers, {
      id: 'req-job-create',
      method: 'derivativeJob.create',
      params: {
        id: 'job-1',
        assetId: 'asset-1',
        derivativeKind: 'extracted_text',
        taskFamily: 'chat_context',
        generator: 'phase-7-test',
      },
    })
    expect(created).toMatchObject({
      ok: true,
      result: expect.objectContaining({ id: 'job-1', status: 'pending' }),
    })

    const listed = await dispatchWorkerMessage(handlers, {
      id: 'req-job-list',
      method: 'derivativeJob.listByAssetId',
      params: { assetId: 'asset-1' },
    })
    expect(listed).toMatchObject({
      ok: true,
      result: [expect.objectContaining({ id: 'job-1', assetId: 'asset-1' })],
    })

    const cancelled = await dispatchWorkerMessage(handlers, {
      id: 'req-job-cancel',
      method: 'derivativeJob.cancel',
      params: { jobId: 'job-1', reason: 'stop' },
    })
    expect(cancelled).toMatchObject({
      ok: true,
      result: expect.objectContaining({ id: 'job-1', status: 'cancelled' }),
    })
  })

  it('routes ingestion and preview bridge methods', async () => {
    const { handlers } = createWorkerHarness()
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-ingest-'))
    const sourceFilePath = path.join(tempDir, 'sample.txt')
    await writeFile(sourceFilePath, 'hello from ingest')

    const ingestLocal = await dispatchWorkerMessage(handlers, {
      id: 'req-ingest-local',
      method: 'fileIngestion.ingestLocalFile',
      params: {
        filePath: sourceFilePath,
        mimeType: 'text/plain',
      },
    })
    expect(ingestLocal).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        success: true,
        sourceKind: 'local_upload',
      }),
    })

    const ingestUrl = await dispatchWorkerMessage(handlers, {
      id: 'req-ingest-url',
      method: 'fileIngestion.ingestUrl',
      params: {
        url: 'not-a-url',
        retentionMode: 'link_only',
      },
    })
    expect(ingestUrl).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        success: false,
        failureReasonCode: 'invalid_url',
      }),
    })

    const previewLatest = await dispatchWorkerMessage(handlers, {
      id: 'req-preview-latest',
      method: 'preview.getLatestReady',
      params: { assetId: 'missing-asset' },
    })
    expect(previewLatest).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        status: 'missing',
        dataUrl: null,
      }),
    })

    const previewEnsure = await dispatchWorkerMessage(handlers, {
      id: 'req-preview-ensure',
      method: 'preview.ensure',
      params: { assetId: 'missing-asset' },
    })
    expect(previewEnsure).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        status: 'failed',
      }),
    })

    await rm(tempDir, { recursive: true, force: true })
  })

  it('routes file type detection methods without changing send behavior', async () => {
    const { handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const storageUri = 'assets/original/as/asset-ft.txt'
    const localPath = path.join(storageRootDir, ...storageUri.split('/'))
    await mkdir(path.dirname(localPath), { recursive: true })
    await writeFile(localPath, 'file type content')

    await dispatchWorkerMessage(handlers, {
      id: 'req-asset-ft',
      method: 'fileAsset.create',
      params: {
        id: 'asset-ft',
        sha256: null,
        filename: 'asset-ft.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 17,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri,
        ingestStatus: 'stored',
      },
    })

    const detected = await dispatchWorkerMessage(handlers, {
      id: 'req-ft-basic',
      method: 'fileType.detectBasic',
      params: {
        assetId: 'asset-ft',
      },
    })
    expect(detected).toMatchObject({
      ok: true,
      result: {
        fromCache: false,
        job: expect.objectContaining({ status: 'ready' }),
        verdict: expect.objectContaining({ assetId: 'asset-ft', primaryFormatId: 'plain_text' }),
      },
    })

    const stale = await dispatchWorkerMessage(handlers, {
      id: 'req-ft-stale',
      method: 'fileType.markStale',
      params: {
        assetId: 'asset-ft',
        staleReason: 'manual_test',
      },
    })
    expect(stale).toMatchObject({
      ok: true,
      result: { ok: true, updated: 1 },
    })
  })
})

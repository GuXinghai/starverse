import { describe, expect, it, vi } from 'vitest'
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
  const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
  const conversationAttachmentService = new ConversationAttachmentService({
    db,
    fileAssetRepo,
    messageRepo,
    messageAttachmentRepo,
    branchRepo,
    draftRepo: new ConversationDraftRepo(db),
    storageRootDir,
    now: () => 1000,
  })
  const fileTypeDetectionService = new FileTypeDetectionService({
    db,
    fileAssetRepo,
    fileTypeVerdictRepo,
    storageRootDir,
    now: () => 1000,
  })
  const fileTypeDetectionCoordinator = {
    scheduleDraftAttachmentDetection: vi.fn(() => ({ scheduled: true })),
    ensureVerdictsForAssets: vi.fn(async (assetIds: readonly string[], options?: { detectionTrigger?: string }) => {
      const results = []
      for (const assetId of assetIds) {
        const result = await fileTypeDetectionService.detectBasic({
          assetId,
          detectionTrigger: options?.detectionTrigger as any,
          magikaState: 'not_installed',
        })
        results.push({
          assetId,
          status: result.job.status === 'ready' && result.verdict ? 'ready' : 'failed',
          verdict: result.verdict,
          fromCache: result.fromCache,
          reusedCurrent: false,
          pipeline: 'basic',
          magikaState: 'not_installed',
          errorCode: result.job.errorCode,
          errorMessage: result.job.errorMessage,
        })
      }
      return results
    }),
  }
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
      fileDerivativeRepo,
      fileTypeVerdictRepo,
    }),
    fileTypeDetectionService,
    fileTypeDetectionCoordinator,
    fileIngestionService: new FileIngestionService({
      fileAssetRepo,
      storageRootDir,
    }),
    fileStorageRootDir: storageRootDir,
  } as any)
  return { db, handlers, message, fileTypeDetectionCoordinator, fileTypeVerdictRepo }
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
    const { handlers, fileTypeDetectionCoordinator } = createWorkerHarness()
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
    expect(fileTypeDetectionCoordinator.scheduleDraftAttachmentDetection).toHaveBeenCalledWith('asset-1', {
      detectionTrigger: 'upload',
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

  it('routes DFC binding fields through worker validation without legacy fallback', async () => {
    const { handlers, message } = createWorkerHarness()
    await createWorkerAsset(handlers)
    const selectedAssetRefs = [{ kind: 'raw_file' as const, assetId: 'asset-1' }]

    const draftAdd = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-draft-add',
      method: 'conversationDraft.addAttachment',
      params: {
        conversationId: 'c1',
        assetId: 'asset-1',
        preferredSendMode: 'inline_base64',
      },
    })

    expect(draftAdd).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        dfcManaged: false,
        preferredSendMode: 'inline_base64',
      }),
    })

    const options = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-options',
      method: 'conversationDraft.getDfcOptions',
      params: {
        conversationId: 'c1',
        assetId: 'asset-1',
      },
    })
    expect(options).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        decision: expect.objectContaining({ status: 'needs_user_selection' }),
        options: [expect.objectContaining({
          targetKind: 'original_file',
          sendAssetRefs: selectedAssetRefs,
        })],
      }),
    })
    const originalOption = (options as any).result.options.find((option: any) => option.targetKind === 'original_file')

    const draftAttachment = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-draft-update',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId: 'asset-1',
        dfcManaged: true,
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs,
      },
    })

    expect(draftAttachment).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        dfcManaged: true,
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs,
        preferredSendMode: null,
      }),
    })

    const preview = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-preview',
      method: 'conversationDraft.getDfcPreview',
      params: {
        conversationId: 'c1',
        assetId: 'asset-1',
        maxCharacters: 128,
      },
    })

    expect(preview).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        selectedOptionId: originalOption.optionId,
        selectedAssetRefs,
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
        preview: expect.objectContaining({
          kind: 'raw_file',
          status: 'ready',
          text: null,
        }),
      }),
    })

    const attached = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-attach',
      method: 'conversationDraft.attachToMessage',
      params: {
        conversationId: 'c1',
        messageId: message.id,
        sentAssetIds: ['asset-1'],
        dfcAttachmentSendSnapshots: [{
          attachmentId: (draftAttachment as any).result.id,
          assetId: 'asset-1',
          targetKind: 'original_file',
          sendStrategy: 'file_attachment',
          sendAssetRefs: selectedAssetRefs,
        }],
      },
    })

    expect(attached).toMatchObject({
      ok: true,
      result: {
        attachments: [
          expect.objectContaining({
            dfcManaged: true,
            usedOptionId: originalOption.optionId,
            usedAssetRefs: selectedAssetRefs,
            targetKind: 'original_file',
            sendStrategy: 'file_attachment',
          }),
        ],
      },
    })

    await dispatchWorkerMessage(handlers, {
      id: 'req-asset-dfc-direct',
      method: 'fileAsset.create',
      params: {
        id: 'asset-dfc-direct',
        sha256: 'sha-dfc-direct',
        filename: 'direct.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 6,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri: 'assets/original/as/asset-dfc-direct.txt',
        ingestStatus: 'stored',
      },
    })
    const directAssetRefs = [{ kind: 'raw_file' as const, assetId: 'asset-dfc-direct' }]
    const messageAttachment = await dispatchWorkerMessage(handlers, {
      id: 'req-dfc-message-create',
      method: 'messageAttachment.create',
      params: {
        id: 'attachment-dfc',
        messageId: message.id,
        assetId: 'asset-dfc-direct',
        aiPayloadKind: 'text',
        processingStatus: 'native_supported',
        dfcManaged: true,
        usedOptionId: 'option-original',
        usedAssetRefs: directAssetRefs,
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
      },
    })

    expect(messageAttachment).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        dfcManaged: true,
        usedOptionId: 'option-original',
        usedAssetRefs: directAssetRefs,
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
      }),
    })
  })

  it('routes send plan build and draft-to-existing-message migration methods', async () => {
    const { handlers, message, fileTypeDetectionCoordinator } = createWorkerHarness()
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
    expect(fileTypeDetectionCoordinator.ensureVerdictsForAssets).toHaveBeenCalledWith(['asset-1'], {
      detectionTrigger: 'send_plan_build',
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

  it('ensures DFC-ready table markdown metadata for CSV text derivatives', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-csv-dfc'
    const storageUri = 'assets/original/cs/asset-csv-dfc.csv'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'name,age\nalice,30\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-csv-dfc-source-hash',
        filename: 'data.csv',
        extension: 'csv',
        mime: 'text/csv',
        sizeBytes: 18,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const planResult = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send table',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/text',
          modelKey: 'openrouter::test/text',
          inputModalities: ['text'],
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
      },
    })
    const derivativeRow = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { id: string; storageUri: string; metaJson: string | null } | undefined
    expect(derivativeRow).toBeTruthy()
    const derivativeMeta = derivativeRow?.metaJson ? JSON.parse(derivativeRow.metaJson) : null
    expect(derivativeMeta).toMatchObject({
      targetKind: 'table_markdown',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
      sourceHash: 'asset-csv-dfc-source-hash',
      converterName: 'starverse-text-derivative',
      converterVersion: '1',
    })
    const assetRow = db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id=@assetId
      LIMIT 1
    `).get({ assetId }) as { sourceMetaJson: string | null }
    const assetMeta = assetRow.sourceMetaJson ? JSON.parse(assetRow.sourceMetaJson) : null
    expect(assetMeta?.textConversion).toMatchObject({
      status: 'ready',
      targetKind: 'table_markdown',
      derivativeId: derivativeRow?.id,
      storageClass: 'draft_bound',
      converterName: 'starverse-text-derivative',
      converterVersion: '1',
    })
    const options = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-dfc-options',
      method: 'conversationDraft.getDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    expect(options).toMatchObject({
      ok: true,
      result: {
        options: expect.arrayContaining([
          expect.objectContaining({
            targetKind: 'table_markdown',
            isAvailable: true,
            sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow?.id }],
          }),
        ]),
      },
    })
    expect(JSON.stringify((options as any).result)).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(JSON.stringify((options as any).result)).not.toContain('asset-csv-dfc-source-hash')
  })

  it('generates backend-owned DFC draft options through explicit ensure endpoint', async () => {
    const { db, handlers, fileTypeDetectionCoordinator } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-csv-explicit-dfc'
    const storageUri = 'assets/original/cs/asset-csv-explicit-dfc.csv'
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), 'name,age\nalice,30\n')
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-csv-explicit-source-hash',
        filename: 'data.csv',
        extension: 'csv',
        mime: 'text/csv',
        sizeBytes: 18,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const before = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-options-before',
      method: 'conversationDraft.getDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    expect(before).toMatchObject({
      ok: true,
      result: {
        options: [expect.objectContaining({ targetKind: 'original_file' })],
      },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    const derivativeRow = db.prepare(`
      SELECT id, storage_uri AS storageUri, meta_json AS metaJson
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
      LIMIT 1
    `).get({ assetId }) as { id: string; storageUri: string; metaJson: string | null } | undefined
    expect(derivativeRow).toBeTruthy()
    const tableOption = (ensured as any).result.options.find((option: any) => option.targetKind === 'table_markdown')
    expect(tableOption).toMatchObject({
      optionId: `dfc:${assetId}:table_markdown:derived_asset:${derivativeRow?.id}`,
      sendStrategy: 'text_in_prompt',
      status: 'ready',
      isAvailable: true,
      compatibilityStatus: 'compatible',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: derivativeRow?.id }],
    })
    expect(JSON.stringify((ensured as any).result)).not.toContain(derivativeRow?.storageUri ?? 'assets/')
    expect(JSON.stringify((ensured as any).result)).not.toContain('asset-csv-explicit-source-hash')
    expect(fileTypeDetectionCoordinator.ensureVerdictsForAssets).not.toHaveBeenCalled()

    const selected = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-select',
      method: 'conversationDraft.updateAttachmentSettings',
      params: {
        conversationId: 'c1',
        assetId,
        dfcManaged: true,
        selectedOptionId: tableOption.optionId,
        selectedAssetRefs: tableOption.sendAssetRefs,
      },
    })
    expect(selected).toMatchObject({
      ok: true,
      result: {
        dfcManaged: true,
        selectedOptionId: tableOption.optionId,
        selectedAssetRefs: tableOption.sendAssetRefs,
        preferredSendMode: null,
      },
    })

    const secondEnsure = await dispatchWorkerMessage(handlers, {
      id: 'req-csv-explicit-ensure-again',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    const jobCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM derivative_jobs
      WHERE asset_id=@assetId AND derivative_kind='extracted_text'
    `).get({ assetId }) as { count: number }
    expect(derivativeCount.count).toBe(1)
    expect(jobCount.count).toBe(1)
    expect((secondEnsure as any).result).toMatchObject({
      selectedOptionId: tableOption.optionId,
      selectedAssetRefs: tableOption.sendAssetRefs,
      decision: expect.objectContaining({
        status: 'ready',
        targetKind: 'table_markdown',
        sendAssetRefs: tableOption.sendAssetRefs,
      }),
    })
  })

  it('generates approved Phase 1 local text DFC target families through explicit ensure endpoint', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const cases = [
      { id: 'asset-dfc-txt', filename: 'note.txt', extension: 'txt', mime: 'text/plain', text: 'plain text\n', targetKind: 'plain_text' },
      { id: 'asset-dfc-md', filename: 'note.md', extension: 'md', mime: 'text/markdown', text: '# Title\n', targetKind: 'markdown' },
      { id: 'asset-dfc-js', filename: 'app.js', extension: 'js', mime: 'text/javascript', text: 'const answer = 42\n', targetKind: 'code' },
      { id: 'asset-dfc-tsv', filename: 'data.tsv', extension: 'tsv', mime: 'text/tab-separated-values', text: 'name\tage\nalice\t30\n', targetKind: 'table_markdown' },
    ] as const

    for (const item of cases) {
      const storageUri = `assets/original/${item.id.slice(-2)}/${item.filename}`
      await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
      await writeFile(path.join(storageRootDir, ...storageUri.split('/')), item.text)
      await dispatchWorkerMessage(handlers, {
        id: `req-${item.id}-asset`,
        method: 'fileAsset.create',
        params: {
          id: item.id,
          sha256: `${item.id}-source-hash`,
          filename: item.filename,
          extension: item.extension,
          mime: item.mime,
          sizeBytes: Buffer.byteLength(item.text, 'utf8'),
          assetKind: 'text',
          sourceKind: 'local_upload',
          storageUri,
          ingestStatus: 'stored',
        },
      })
      await dispatchWorkerMessage(handlers, {
        id: `req-${item.id}-draft-add`,
        method: 'conversationDraft.addAttachment',
        params: { conversationId: 'c1', assetId: item.id },
      })

      const ensured = await dispatchWorkerMessage(handlers, {
        id: `req-${item.id}-ensure`,
        method: 'conversationDraft.ensureDfcOptions',
        params: { conversationId: 'c1', assetId: item.id },
      })
      const derivative = db.prepare(`
        SELECT id, meta_json AS metaJson
        FROM file_derivatives
        WHERE parent_asset_id=@assetId AND derived_kind='extracted_text'
        LIMIT 1
      `).get({ assetId: item.id }) as { id: string; metaJson: string | null } | undefined
      const option = (ensured as any).result.options.find((candidate: any) => candidate.targetKind === item.targetKind)
      const derivativeMeta = derivative?.metaJson ? JSON.parse(derivative.metaJson) : null

      expect(derivativeMeta).toMatchObject({
        targetKind: item.targetKind,
        usage: 'preview_and_send',
        storageClass: 'draft_bound',
        converterName: 'starverse-text-derivative',
      })
      expect(option).toMatchObject({
        optionId: `dfc:${item.id}:${item.targetKind}:derived_asset:${derivative?.id}`,
        status: 'ready',
        isAvailable: true,
        sendAssetRefs: [{ kind: 'derived_asset', assetId: derivative?.id }],
      })
    }
  })

  it('does not generate forbidden DFC runtime options through ensure endpoint', async () => {
    const { db, handlers } = createWorkerHarness()
    const assetId = 'asset-pdf-explicit-dfc'
    await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-explicit-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-pdf-explicit-source-hash',
        filename: 'manual.pdf',
        extension: 'pdf',
        mime: 'application/pdf',
        sizeBytes: 32,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageUri: 'assets/original/pd/asset-pdf-explicit-dfc.pdf',
        ingestStatus: 'stored',
      },
    })
    await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-explicit-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-explicit-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    expect(ensured).toMatchObject({
      ok: true,
      result: {
        options: [expect.objectContaining({
          targetKind: 'original_file',
          sendAssetRefs: [{ kind: 'raw_file', assetId }],
        })],
      },
    })
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }
    expect(derivativeCount.count).toBe(0)
  })

  it('does not generate Phase 1 DFC derivatives for non-local source assets through ensure endpoint', async () => {
    const { db, handlers } = createWorkerHarness()
    const assetId = 'asset-remote-text-dfc'
    const created = await dispatchWorkerMessage(handlers, {
      id: 'req-remote-text-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'asset-remote-text-source-hash',
        filename: 'remote.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 16,
        assetKind: 'text',
        sourceKind: 'url_import',
        storageBackend: 'remote_url',
        storageUri: 'https://example.invalid/remote.txt',
        ingestStatus: 'stored',
      },
    })
    expect(created.ok).toBe(true)
    await dispatchWorkerMessage(handlers, {
      id: 'req-remote-text-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })

    const ensured = await dispatchWorkerMessage(handlers, {
      id: 'req-remote-text-ensure',
      method: 'conversationDraft.ensureDfcOptions',
      params: { conversationId: 'c1', assetId },
    })

    expect(ensured).toMatchObject({
      ok: true,
      result: {
        options: [expect.objectContaining({
          targetKind: 'original_file',
          sendAssetRefs: [{ kind: 'raw_file', assetId }],
        })],
      },
    })
    const derivativeCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM file_derivatives
      WHERE parent_asset_id=@assetId
    `).get({ assetId }) as { count: number }
    const jobCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM derivative_jobs
      WHERE asset_id=@assetId
    `).get({ assetId }) as { count: number }
    expect(derivativeCount.count).toBe(0)
    expect(jobCount.count).toBe(0)
  })

  it('keeps PDF direct send available when extracted text is unsupported', async () => {
    const { db, handlers } = createWorkerHarness()
    const storageRootDir = path.resolve(process.cwd(), '.tmp-file-pipeline-worker-tests')
    const assetId = 'asset-pdf-direct'
    const storageUri = 'assets/original/as/asset-pdf-direct.pdf'
    await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-asset',
      method: 'fileAsset.create',
      params: {
        id: assetId,
        sha256: 'sha-pdf-direct',
        filename: 'manual.pdf',
        extension: 'pdf',
        mime: 'application/pdf',
        sizeBytes: 32,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri,
        ingestStatus: 'stored',
        previewStatus: 'not_requested',
      },
    })
    await mkdir(path.dirname(path.join(storageRootDir, ...storageUri.split('/'))), { recursive: true })
    await writeFile(path.join(storageRootDir, ...storageUri.split('/')), Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'))
    await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-draft-add',
      method: 'conversationDraft.addAttachment',
      params: { conversationId: 'c1', assetId },
    })
    db.prepare(`
      UPDATE draft_attachments
      SET ai_payload_kind = 'pdf',
          processing_status = 'native_supported'
      WHERE asset_id = @assetId
    `).run({ assetId })

    const planResult = await dispatchWorkerMessage(handlers, {
      id: 'req-pdf-send-plan',
      method: 'sendPlan.buildCurrent',
      params: {
        conversationId: 'c1',
        draftText: 'send pdf',
        model: {
          providerKey: 'openrouter',
          modelId: 'test/pdf',
          modelKey: 'openrouter::test/pdf',
          inputModalities: ['text', 'file'],
          outputModalities: ['text'],
        },
        providerContext: {
          providerKey: 'openrouter',
          supportsInlineData: true,
          supportsPdfInputs: true,
          supportsPdfUrlRef: true,
          supportsTextUrlRef: true,
        },
      },
    })

    expect(planResult).toMatchObject({
      ok: true,
      result: {
        sendPlan: expect.objectContaining({
          status: 'sendable',
          includedAttachments: [
            expect.objectContaining({
              assetId,
            }),
          ],
          excludedAttachments: [],
          attachmentPlans: [
            expect.objectContaining({
              assetId,
              eligibility: 'included',
              selectedSendMode: 'inline_base64',
              fileType: expect.objectContaining({
                recommendedRoute: 'direct_file',
                blocked: false,
              }),
              detection: expect.objectContaining({
                routeEligibility: 'verdict_ready',
              }),
            }),
          ],
        }),
      },
    })
    const row = db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id = @assetId
      LIMIT 1
    `).get({ assetId }) as { sourceMetaJson: string | null }
    const meta = row.sourceMetaJson ? JSON.parse(row.sourceMetaJson) : null
    expect(meta?.textConversion).toMatchObject({
      status: 'failed',
      errorCode: 'derivative_asset_not_supported',
    })
    expect(meta?.lineage?.stale).not.toBe(true)
    expect(meta?.lineage?.sendAssetReady).not.toBe(false)
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
        sendPlan: expect.objectContaining({ status: 'blocked' }),
        contentParts: [],
        diagnostics: expect.objectContaining({
          sendPlanStatus: 'blocked',
          attachmentErrors: [
            expect.objectContaining({
              code: 'file_type_detection_required',
              assetId,
            }),
          ],
        }),
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

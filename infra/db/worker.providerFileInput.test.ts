import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ConfidenceLevel, FileFormatId, FileKind, FileTypeVerdict } from '../../src/next/file-type'
import type { DbHandler, DbMethod } from './types'
import { FileAssetRepo } from './repo/fileAssetRepo'
import { FileAssetStoreRepo } from './repo/fileAssetStoreRepo'
import { FileDerivativeRepo } from './repo/fileDerivativeRepo'
import { FileTypeVerdictRepo } from './repo/fileTypeVerdictRepo'
import { MessageAttachmentRepo } from './repo/messageAttachmentRepo'
import { MessageRepo } from './repo/messageRepo'
import { ConversationAttachmentService } from '../files/conversationAttachmentService'
import { SendPlanService } from '../files/sendPlanService'
import { canOpenBetterSqliteForSuite } from '../testUtils/betterSqliteGate'
import { dispatchWorkerMessage } from './worker/router'
import { registerProviderFileInputHandlers } from './worker/handlers/providerFileInputHandlers'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('provider file input worker handlers') ? describe : describe.skip

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
    title: 'Provider File Input Worker',
    createdAt: now,
    updatedAt: now,
  })
}

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function makeHarness(storageRootDir: string) {
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  insertConvo(db, 'c1')

  const fileAssetRepo = new FileAssetRepo(db)
  const fileAssetStoreRepo = new FileAssetStoreRepo(db)
  const fileDerivativeRepo = new FileDerivativeRepo(db)
  const fileTypeVerdictRepo = new FileTypeVerdictRepo(db)
  const messageRepo = new MessageRepo(db)
  const messageAttachmentRepo = new MessageAttachmentRepo(db)
  const conversationAttachmentService = new ConversationAttachmentService({
    db,
    fileAssetRepo,
    fileAssetStoreRepo,
    messageRepo,
    messageAttachmentRepo,
    storageRootDir,
    now: () => 1000,
  })
  const sendPlanService = new SendPlanService({
    conversationAttachmentService,
    fileAssetRepo,
    fileDerivativeRepo,
    fileTypeVerdictRepo,
  })
  const handlers = new Map<DbMethod, DbHandler>()
  registerProviderFileInputHandlers((method, handler) => handlers.set(method, handler), {
    fileAssetRepo,
    fileAssetStoreRepo,
    fileDerivativeRepo,
    sendPlanService,
    fileStorageRootDir: storageRootDir,
  } as any)

  return {
    db,
    handlers,
    fileAssetRepo,
    fileAssetStoreRepo,
    fileDerivativeRepo,
    fileTypeVerdictRepo,
    conversationAttachmentService,
  }
}

async function createDraftImageAsset(input: Readonly<{
  h: ReturnType<typeof makeHarness>
  storageRootDir: string
  assetId: string
  filename: string
  extension: string
  mime: string
  formatId: FileFormatId
  bytes: Uint8Array
}>) {
  const storageUri = `assets/blobs/${input.assetId}/${input.filename}`
  const filePath = path.join(input.storageRootDir, ...storageUri.split('/'))
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, input.bytes)

  input.h.fileAssetRepo.create({
    id: input.assetId,
    sha256: hash(input.bytes),
    filename: input.filename,
    extension: input.extension,
    mime: input.mime,
    sizeBytes: input.bytes.byteLength,
    assetKind: 'image',
    sourceKind: 'local_upload',
    storageBackend: 'local_fs',
    storageUri: `assets/original/${input.assetId}/${input.filename}`,
    ingestStatus: 'stored',
    previewStatus: 'not_requested',
  })
  const blob = input.h.fileAssetStoreRepo.createBlob({
    id: `blob-${input.assetId}`,
    sha256: hash(input.bytes),
    sizeBytes: input.bytes.byteLength,
    mime: input.mime,
    storageBackend: 'local_fs',
    storageUri,
    createdAt: 1000,
  })
  input.h.fileAssetStoreRepo.createRevision({
    id: `rev-${input.assetId}`,
    assetId: input.assetId,
    blobId: blob.id,
    cause: 'imported',
    createdAt: 1000,
  })
  createVerdict(input.h.fileTypeVerdictRepo, input.assetId, input.formatId, 'image')
  input.h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: input.assetId })
}

async function createDraftPdfAsset(input: Readonly<{
  h: ReturnType<typeof makeHarness>
  storageRootDir: string
  assetId: string
  filename: string
  bytes: Uint8Array
}>) {
  const storageUri = `assets/blobs/${input.assetId}/${input.filename}`
  const filePath = path.join(input.storageRootDir, ...storageUri.split('/'))
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, input.bytes)

  input.h.fileAssetRepo.create({
    id: input.assetId,
    sha256: hash(input.bytes),
    filename: input.filename,
    extension: 'pdf',
    mime: 'application/pdf',
    sizeBytes: input.bytes.byteLength,
    assetKind: 'document',
    sourceKind: 'local_upload',
    storageBackend: 'local_fs',
    storageUri: `assets/original/${input.assetId}/${input.filename}`,
    ingestStatus: 'stored',
    previewStatus: 'not_requested',
  })
  const blob = input.h.fileAssetStoreRepo.createBlob({
    id: `blob-${input.assetId}`,
    sha256: hash(input.bytes),
    sizeBytes: input.bytes.byteLength,
    mime: 'application/pdf',
    storageBackend: 'local_fs',
    storageUri,
    createdAt: 1000,
  })
  input.h.fileAssetStoreRepo.createRevision({
    id: `rev-${input.assetId}`,
    assetId: input.assetId,
    blobId: blob.id,
    cause: 'imported',
    createdAt: 1000,
  })
  createVerdict(input.h.fileTypeVerdictRepo, input.assetId, 'pdf', 'document')
  input.h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: input.assetId })
}

async function createDraftDocumentAsset(input: Readonly<{
  h: ReturnType<typeof makeHarness>
  storageRootDir: string
  assetId: string
  filename: string
  extension: string
  mime: string
  formatId: FileFormatId
  bytes: Uint8Array
}>) {
  const storageUri = `assets/blobs/${input.assetId}/${input.filename}`
  const filePath = path.join(input.storageRootDir, ...storageUri.split('/'))
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, input.bytes)

  input.h.fileAssetRepo.create({
    id: input.assetId,
    sha256: hash(input.bytes),
    filename: input.filename,
    extension: input.extension,
    mime: input.mime,
    sizeBytes: input.bytes.byteLength,
    assetKind: 'document',
    sourceKind: 'local_upload',
    storageBackend: 'local_fs',
    storageUri: `assets/original/${input.assetId}/${input.filename}`,
    ingestStatus: 'stored',
    previewStatus: 'not_requested',
  })
  const blob = input.h.fileAssetStoreRepo.createBlob({
    id: `blob-${input.assetId}`,
    sha256: hash(input.bytes),
    sizeBytes: input.bytes.byteLength,
    mime: input.mime,
    storageBackend: 'local_fs',
    storageUri,
    createdAt: 1000,
  })
  input.h.fileAssetStoreRepo.createRevision({
    id: `rev-${input.assetId}`,
    assetId: input.assetId,
    blobId: blob.id,
    cause: 'imported',
    createdAt: 1000,
  })
  createVerdict(input.h.fileTypeVerdictRepo, input.assetId, input.formatId, 'document')
  input.h.conversationAttachmentService.addDraftAttachment({ conversationId: 'c1', assetId: input.assetId })
}

async function createDfcDerivedPdf(input: Readonly<{
  h: ReturnType<typeof makeHarness>
  storageRootDir: string
  sourceAssetId: string
  derivativeId: string
  bytes: Uint8Array
  status?: 'pending' | 'ready' | 'failed' | 'deleted'
}>) {
  const storageUri = `assets/derived/${input.sourceAssetId}/${input.derivativeId}.pdf`
  const filePath = path.join(input.storageRootDir, ...storageUri.split('/'))
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, input.bytes)
  const source = input.h.fileAssetRepo.getById(input.sourceAssetId)
  input.h.fileDerivativeRepo.create({
    id: input.derivativeId,
    parentAssetId: input.sourceAssetId,
    derivedKind: 'converted_pdf',
    mime: 'application/pdf',
    storageUri,
    generator: 'provider-input-test-converter',
    status: input.status ?? 'ready',
    metaJson: {
      targetKind: 'pdf_attachment',
      usage: 'preview_and_send',
      storageClass: 'draft_bound',
      sourceHash: source?.sha256 ?? hash(new Uint8Array()),
      contentHash: hash(input.bytes),
      conversionSettingsHash: 'provider-input-test-settings',
      converterName: 'provider-input-test-converter',
      converterVersion: '1',
    },
    createdAt: 2000,
    updatedAt: 2000,
  })
  return { storageUri, sha256: hash(input.bytes), sizeBytes: input.bytes.byteLength }
}

function selectDfcPdfOption(input: Readonly<{
  h: ReturnType<typeof makeHarness>
  assetId: string
  derivativeId: string
}>) {
  const options = input.h.conversationAttachmentService.getDfcDraftAttachmentOptions({
    conversationId: 'c1',
    assetId: input.assetId,
  })
  const pdfOption = options.options.find((option) =>
    option.targetKind === 'pdf_attachment' &&
    option.sendAssetRefs.some((ref) => ref.kind === 'derived_asset' && ref.assetId === input.derivativeId)
  )
  expect(pdfOption).toBeTruthy()
  input.h.conversationAttachmentService.updateDraftAttachmentSettings({
    conversationId: 'c1',
    assetId: input.assetId,
    dfcManaged: true,
    selectedOptionId: pdfOption?.optionId ?? '',
    selectedAssetRefs: pdfOption?.sendAssetRefs ?? [],
  })
  return pdfOption
}

function createVerdict(
  repo: FileTypeVerdictRepo,
  assetId: string,
  formatId: FileFormatId,
  kind: FileKind,
  confidence: ConfidenceLevel = 'high'
) {
  const verdict: FileTypeVerdict = {
    primary: {
      formatId,
      kind,
      confidence,
      reasonCodes: [],
      sourceCodeMeta: null,
    },
    conflicts: [],
    flags: [],
    evidence: [],
    provenance: null,
    schemaVersion: 'v1',
    taxonomyVersion: 'taxonomy-v1',
    detectionCost: 'low',
    fingerprint: `${assetId}-fp`,
  }
  repo.upsertCurrent({
    assetId,
    verdict,
    primaryFormatId: formatId,
    primaryKind: kind,
    confidenceLevel: confidence,
    versionInfo: {
      schemaVersion: 'schema-v1',
      taxonomyVersion: 'taxonomy-v1',
      taxonomyMapVersion: 'taxonomy-map-v1',
      magicTableVersion: 'magic-v1',
      mergeRulesVersion: 'merge-v1',
      containerProbeVersion: 'container-v1',
      textProbeVersion: 'text-v1',
      magikaModelVersion: null,
    },
    fingerprintJson: {
      algorithmVersion: 'sha256-v1',
      size: 4,
      modifiedTime: 1,
      headHash: `${assetId}-head`,
      headBytes: 4,
      tailHash: `${assetId}-tail`,
      tailBytes: 4,
      fullHash: `${assetId}-full`,
      fullHashStatus: 'computed',
    },
    updatedAt: 2000,
  })
}

function prepareParams() {
  return {
    provider: 'openai_responses',
    conversationId: 'c1',
    draftText: 'describe image',
    model: {
      providerKey: 'openai_responses',
      modelId: 'gpt-4.1-mini',
      modelKey: 'openai_responses::gpt-4.1-mini',
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    },
    providerContext: {
      providerKey: 'openai_responses',
      supportsImageUrlRef: true,
      supportsInlineData: true,
      preferredDraftSendModes: ['inline_base64', 'url_ref'],
    },
  }
}

function prepareFileParams(overrides: Readonly<{
  provider?: string
  providerKey?: string
  modelKey?: string
}> = {}) {
  const provider = overrides.provider ?? 'openai_responses'
  const providerKey = overrides.providerKey ?? 'openai_responses'
  return {
    provider,
    conversationId: 'c1',
    draftText: 'read pdf',
    model: {
      providerKey,
      modelId: 'gpt-4.1-mini',
      modelKey: overrides.modelKey ?? 'openai_responses::gpt-4.1-mini',
      inputModalities: ['text', 'image', 'file'],
      outputModalities: ['text'],
    },
    providerContext: {
      providerKey,
      supportsImageUrlRef: true,
      supportsPdfInputs: true,
      supportsPdfUrlRef: true,
      supportsInlineData: true,
      preferredDraftSendModes: ['inline_base64', 'url_ref'],
    },
  }
}

describeIfBetterSqlite('provider file input worker handlers', () => {
  it('prepares a draft PNG image with real DB repos without exposing managed storage metadata', async () => {
    const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-provider-file-input-'))
    const h = makeHarness(storageRootDir)
    try {
      await createDraftImageAsset({
        h,
        storageRootDir,
        assetId: 'asset-png',
        filename: 'photo.png',
        extension: 'png',
        mime: 'image/png',
        formatId: 'png',
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      })

      const prepared = await dispatchWorkerMessage(h.handlers, {
        id: 'req-provider-file-input-png',
        method: 'providerFileInput.prepareDraftImages',
        params: prepareParams(),
      })

      expect(prepared).toMatchObject({
        ok: true,
        result: {
          ok: true,
          contentParts: [
            {
              type: 'starverse_provider_file_upload',
              provider: 'openai_responses',
              assetId: 'asset-png',
              revisionId: expect.any(String),
              blobSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
              mimeType: 'image/png',
              sizeBytes: expect.any(Number),
              kind: 'image',
              filename: 'photo.png',
              dataBase64: expect.any(String),
            },
          ],
          diagnostics: expect.objectContaining({
            includedImageCount: 1,
            containsMultimodalParts: true,
          }),
        },
      })
      const serialized = JSON.stringify(prepared)
      expect(serialized).not.toContain(storageRootDir)
      expect(serialized).not.toContain('storageUri')
      expect(serialized).not.toContain('storagePath')
      expect(serialized).not.toContain('blob-asset-png')
      expect(serialized).not.toContain('originalUrl')
    } finally {
      h.db.close()
      await rm(storageRootDir, { recursive: true, force: true })
    }
  })

  it('blocks non-PNG/JPEG draft image MIME in the M1b runtime slice', async () => {
    const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-provider-file-input-'))
    const h = makeHarness(storageRootDir)
    try {
      await createDraftImageAsset({
        h,
        storageRootDir,
        assetId: 'asset-webp',
        filename: 'photo.webp',
        extension: 'webp',
        mime: 'image/webp',
        formatId: 'webp',
        bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
      })

      const prepared = await dispatchWorkerMessage(h.handlers, {
        id: 'req-provider-file-input-webp',
        method: 'providerFileInput.prepareDraftImages',
        params: prepareParams(),
      })

      expect(prepared).toMatchObject({
        ok: true,
        result: {
          ok: false,
          code: 'unsupported_mime',
          message: 'This runtime slice only supports PNG and JPEG image attachments.',
          contentParts: [],
        },
      })
    } finally {
      h.db.close()
      await rm(storageRootDir, { recursive: true, force: true })
    }
  })

  it('prepares a draft PDF through the M1d upload runtime slice without exposing storage metadata', async () => {
    const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-provider-file-input-'))
    const h = makeHarness(storageRootDir)
    try {
      await createDraftPdfAsset({
        h,
        storageRootDir,
        assetId: 'asset-pdf',
        filename: 'manual.pdf',
        bytes: new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'),
      })

      const prepared = await dispatchWorkerMessage(h.handlers, {
        id: 'req-provider-file-input-pdf',
        method: 'providerFileInput.prepareDraftFiles',
        params: prepareFileParams(),
      })

      expect(prepared).toMatchObject({
        ok: true,
        result: {
          ok: true,
          contentParts: [
            {
              type: 'starverse_provider_file_upload',
              provider: 'openai_responses',
              assetId: 'asset-pdf',
              revisionId: expect.any(String),
              blobSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
              mimeType: 'application/pdf',
              sizeBytes: expect.any(Number),
              kind: 'pdf',
              filename: 'manual.pdf',
              dataBase64: expect.any(String),
            },
          ],
          diagnostics: expect.objectContaining({
            includedPdfCount: 1,
            includedFileCount: 1,
            containsMultimodalParts: true,
          }),
        },
      })
      const serialized = JSON.stringify(prepared)
      expect(serialized).not.toContain(storageRootDir)
      expect(serialized).not.toContain('storageUri')
      expect(serialized).not.toContain('storagePath')
      expect(serialized).not.toContain('blob-asset-pdf')
      expect(serialized).not.toContain('originalUrl')
    } finally {
      h.db.close()
      await rm(storageRootDir, { recursive: true, force: true })
    }
  })

  it('prepares the selected DFC derived PDF bytes instead of the original source asset', async () => {
    const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-provider-file-input-'))
    const h = makeHarness(storageRootDir)
    try {
      const sourceBytes = new TextEncoder().encode('original docx bytes must not be sent')
      const derivedBytes = new TextEncoder().encode('%PDF-1.4\nderived provider bytes\n%%EOF\n')
      await createDraftDocumentAsset({
        h,
        storageRootDir,
        assetId: 'asset-docx-derived',
        filename: 'source.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        formatId: 'docx',
        bytes: sourceBytes,
      })
      const derived = await createDfcDerivedPdf({
        h,
        storageRootDir,
        sourceAssetId: 'asset-docx-derived',
        derivativeId: 'derivative-pdf-send',
        bytes: derivedBytes,
      })
      const pdfOption = selectDfcPdfOption({
        h,
        assetId: 'asset-docx-derived',
        derivativeId: 'derivative-pdf-send',
      })

      const prepared = await dispatchWorkerMessage(h.handlers, {
        id: 'req-provider-file-input-dfc-derived-pdf',
        method: 'providerFileInput.prepareDraftFiles',
        params: prepareFileParams(),
      })

      const derivedBase64 = Buffer.from(derivedBytes).toString('base64')
      const sourceBase64 = Buffer.from(sourceBytes).toString('base64')
      expect(prepared).toMatchObject({
        ok: true,
        result: {
          ok: true,
          sendPlan: expect.objectContaining({
            attachmentPlans: [
              expect.objectContaining({
                assetId: 'asset-docx-derived',
                sendAssetRefs: pdfOption?.sendAssetRefs,
              }),
            ],
          }),
          contentParts: [
            {
              type: 'starverse_provider_file_upload',
              provider: 'openai_responses',
              assetId: 'derivative-pdf-send',
              revisionId: expect.stringContaining('asset-docx-derived'),
              blobSha256: derived.sha256,
              mimeType: 'application/pdf',
              sizeBytes: derived.sizeBytes,
              kind: 'pdf',
              filename: 'derivative-pdf-send.pdf',
              dataBase64: derivedBase64,
            },
          ],
          diagnostics: expect.objectContaining({
            includedPdfCount: 1,
            includedFileCount: 1,
            included: [
              expect.objectContaining({
                assetId: 'derivative-pdf-send',
                mimeType: 'application/pdf',
                sizeBytes: derived.sizeBytes,
                kind: 'pdf',
              }),
            ],
          }),
        },
      })
      const serialized = JSON.stringify(prepared)
      expect(serialized).not.toContain(sourceBase64)
      expect(serialized).not.toContain(storageRootDir)
      expect(serialized).not.toContain(derived.storageUri)
      expect(serialized).not.toContain('storageUri')
      expect(serialized).not.toContain('storagePath')
      expect(serialized).not.toContain('blob-asset-docx-derived')
      expect(serialized).not.toContain('originalUrl')
    } finally {
      h.db.close()
      await rm(storageRootDir, { recursive: true, force: true })
    }
  })

  it('blocks a selected DFC derived PDF that goes missing before send without falling back to the original asset', async () => {
    const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-provider-file-input-'))
    const h = makeHarness(storageRootDir)
    try {
      const sourceBytes = new TextEncoder().encode('original source fallback forbidden')
      const derivedBytes = new TextEncoder().encode('%PDF-1.4\nderived missing\n%%EOF\n')
      await createDraftDocumentAsset({
        h,
        storageRootDir,
        assetId: 'asset-docx-missing-derived',
        filename: 'missing-source.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        formatId: 'docx',
        bytes: sourceBytes,
      })
      await createDfcDerivedPdf({
        h,
        storageRootDir,
        sourceAssetId: 'asset-docx-missing-derived',
        derivativeId: 'derivative-missing-send',
        bytes: derivedBytes,
      })
      selectDfcPdfOption({
        h,
        assetId: 'asset-docx-missing-derived',
        derivativeId: 'derivative-missing-send',
      })
      h.db.prepare(`DELETE FROM file_derivatives WHERE id = @id`).run({ id: 'derivative-missing-send' })

      const prepared = await dispatchWorkerMessage(h.handlers, {
        id: 'req-provider-file-input-dfc-derived-missing',
        method: 'providerFileInput.prepareDraftFiles',
        params: prepareFileParams(),
      })

      expect(prepared).toMatchObject({
        ok: true,
        result: {
          ok: false,
          code: 'asset_not_ready',
          contentParts: [],
        },
      })
      const serialized = JSON.stringify(prepared)
      expect(serialized).not.toContain(Buffer.from(sourceBytes).toString('base64'))
      expect(serialized).not.toContain(Buffer.from(derivedBytes).toString('base64'))
      expect(serialized).not.toContain(storageRootDir)
    } finally {
      h.db.close()
      await rm(storageRootDir, { recursive: true, force: true })
    }
  })

  it('blocks a selected DFC derived PDF that fails before send without falling back to the original asset', async () => {
    const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-provider-file-input-'))
    const h = makeHarness(storageRootDir)
    try {
      const sourceBytes = new TextEncoder().encode('original source fallback forbidden')
      const derivedBytes = new TextEncoder().encode('%PDF-1.4\nderived failed\n%%EOF\n')
      await createDraftDocumentAsset({
        h,
        storageRootDir,
        assetId: 'asset-docx-failed-derived',
        filename: 'failed-source.docx',
        extension: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        formatId: 'docx',
        bytes: sourceBytes,
      })
      await createDfcDerivedPdf({
        h,
        storageRootDir,
        sourceAssetId: 'asset-docx-failed-derived',
        derivativeId: 'derivative-failed-send',
        bytes: derivedBytes,
      })
      selectDfcPdfOption({
        h,
        assetId: 'asset-docx-failed-derived',
        derivativeId: 'derivative-failed-send',
      })
      h.fileDerivativeRepo.update({
        id: 'derivative-failed-send',
        status: 'failed',
        updatedAt: 3000,
      })

      const prepared = await dispatchWorkerMessage(h.handlers, {
        id: 'req-provider-file-input-dfc-derived-failed',
        method: 'providerFileInput.prepareDraftFiles',
        params: prepareFileParams(),
      })

      expect(prepared).toMatchObject({
        ok: true,
        result: {
          ok: false,
          code: 'asset_not_ready',
          contentParts: [],
        },
      })
      const serialized = JSON.stringify(prepared)
      expect(serialized).not.toContain(Buffer.from(sourceBytes).toString('base64'))
      expect(serialized).not.toContain(Buffer.from(derivedBytes).toString('base64'))
      expect(serialized).not.toContain(storageRootDir)
    } finally {
      h.db.close()
      await rm(storageRootDir, { recursive: true, force: true })
    }
  })

  it('keeps the M1c 1 MB inline hard limit for the OpenRouter inline path', async () => {
    const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-provider-file-input-'))
    const h = makeHarness(storageRootDir)
    try {
      await createDraftPdfAsset({
        h,
        storageRootDir,
        assetId: 'asset-large-pdf',
        filename: 'large.pdf',
        bytes: new Uint8Array((1024 * 1024) + 1),
      })

      const prepared = await dispatchWorkerMessage(h.handlers, {
        id: 'req-provider-file-input-large-pdf',
        method: 'providerFileInput.prepareDraftFiles',
        params: prepareFileParams({
          provider: 'openrouter',
          providerKey: 'openrouter',
          modelKey: 'openrouter::test/pdf',
        }),
      })

      expect(prepared).toMatchObject({
        ok: true,
        result: {
          ok: false,
          code: 'too_large_for_inline',
          message: 'Asset asset-large-pdf is too large for inline openrouter file input.',
          contentParts: [],
        },
      })
      expect(JSON.stringify(prepared)).not.toContain(storageRootDir)
    } finally {
      h.db.close()
      await rm(storageRootDir, { recursive: true, force: true })
    }
  })

  it('rejects DeepSeek at the provider file input worker boundary', async () => {
    const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-provider-file-input-'))
    const h = makeHarness(storageRootDir)
    try {
      await createDraftPdfAsset({
        h,
        storageRootDir,
        assetId: 'asset-deepseek-pdf',
        filename: 'manual.pdf',
        bytes: new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'),
      })

      const prepared = await dispatchWorkerMessage(h.handlers, {
        id: 'req-provider-file-input-deepseek-pdf',
        method: 'providerFileInput.prepareDraftFiles',
        params: prepareFileParams({
          provider: 'deepseek',
          providerKey: 'deepseek',
          modelKey: 'deepseek::chat',
        }),
      })

      expect(prepared).toMatchObject({ ok: false })
      expect(JSON.stringify(prepared)).not.toContain(storageRootDir)
    } finally {
      h.db.close()
      await rm(storageRootDir, { recursive: true, force: true })
    }
  })
})

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
    sendPlanService,
    fileStorageRootDir: storageRootDir,
  } as any)

  return {
    db,
    handlers,
    fileAssetRepo,
    fileAssetStoreRepo,
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
            { type: 'input_image', image_url: expect.stringMatching(/^data:image\/png;base64,/) },
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
})

/* eslint-disable max-lines-per-function */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { FileAssetRecord } from '../../../infra/db/types'
import type { SendPlan, SendPlanAttachment } from '../../shared/files/sendPlanTypes'
import {
  OpenRouterAttachmentSerializationError,
  serializeSendPlanForOpenRouter,
} from './openRouterSendPlanSerializer'

function makeAsset(overrides: Partial<FileAssetRecord> & Pick<FileAssetRecord, 'id' | 'filename' | 'storageUri'>): FileAssetRecord {
  return {
    id: overrides.id,
    sha256: overrides.sha256 ?? null,
    filename: overrides.filename,
    extension: overrides.extension ?? extFromFilename(overrides.filename),
    mime: overrides.mime ?? mimeFromFilename(overrides.filename),
    sizeBytes: overrides.sizeBytes ?? 8,
    assetKind: overrides.assetKind ?? 'binary',
    sourceKind: overrides.sourceKind ?? 'local_upload',
    storageBackend: overrides.storageBackend ?? 'local_fs',
    storageUri: overrides.storageUri,
    ingestStatus: overrides.ingestStatus ?? 'stored',
    previewStatus: overrides.previewStatus ?? 'not_requested',
    sourceMetaJson: overrides.sourceMetaJson ?? null,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    deletedAt: overrides.deletedAt ?? null,
  }
}

function makeAttachmentPlan(
  overrides: Partial<SendPlanAttachment> & Pick<SendPlanAttachment, 'assetId' | 'attachmentId' | 'aiPayloadKind' | 'selectedSendMode'>
): SendPlanAttachment {
  return {
    assetId: overrides.assetId,
    attachmentId: overrides.attachmentId,
    source: overrides.source ?? 'draft',
    messageId: overrides.messageId ?? null,
    aiPayloadKind: overrides.aiPayloadKind,
    semantic: overrides.semantic ?? {
      targetKind: overrides.aiPayloadKind === 'text'
        ? 'plain_text'
        : overrides.aiPayloadKind === 'pdf'
          ? 'pdf_attachment'
          : overrides.aiPayloadKind === 'binary'
            ? 'unsupported'
            : 'native_file',
      sendStrategy: overrides.aiPayloadKind === 'text'
        ? 'text_in_prompt'
        : overrides.aiPayloadKind === 'binary'
          ? 'unsupported'
          : 'file_attachment',
      mappedFromLegacy: false,
    },
    selectedSendMode: overrides.selectedSendMode,
    fallbackSendModes: overrides.fallbackSendModes ?? [],
    eligibility: overrides.eligibility ?? 'included',
    exclusionReason: overrides.exclusionReason ?? null,
    displayStatus: overrides.displayStatus ?? 'ready',
    needsUserAttention: overrides.needsUserAttention ?? false,
    notes: overrides.notes ?? [],
    lineage: overrides.lineage ?? {
      state: 'unknown',
      stale: false,
      staleReason: null,
      sourceHash: null,
      previewContentHash: null,
      sendContentHash: null,
      conversionSettingsHash: null,
    },
  }
}

function makeSendPlan(
  attachmentPlans: SendPlanAttachment[],
  overrides: Partial<SendPlan> = {}
): SendPlan {
  const included = attachmentPlans
    .filter((plan) => plan.eligibility === 'included' || plan.eligibility === 'warning')
    .map((plan) => ({
      assetId: plan.assetId,
      source: plan.source,
      attachmentId: plan.attachmentId,
      messageId: plan.messageId,
    }))
  const excluded = attachmentPlans
    .filter((plan) => plan.eligibility !== 'included' && plan.eligibility !== 'warning')
    .map((plan) => ({
      assetId: plan.assetId,
      source: plan.source,
      attachmentId: plan.attachmentId,
      messageId: plan.messageId,
      exclusionReason: plan.exclusionReason ?? 'excluded',
    }))
  return {
    status: overrides.status ?? 'sendable',
    warnings: overrides.warnings ?? [],
    blockingReasons: overrides.blockingReasons ?? [],
    includedAttachments: overrides.includedAttachments ?? included,
    excludedAttachments: overrides.excludedAttachments ?? excluded,
    attachmentPlans,
    requiresModelChange: overrides.requiresModelChange ?? false,
    canProceedAfterDroppingExcluded: overrides.canProceedAfterDroppingExcluded ?? false,
    requiresUserConfirmation: overrides.requiresUserConfirmation ?? false,
    plannerVersion: overrides.plannerVersion ?? 'phase-5/v1',
  }
}

async function writeAssetFile(rootDir: string, asset: FileAssetRecord, content: string | Uint8Array): Promise<void> {
  const filePath = path.join(rootDir, ...asset.storageUri.split('/'))
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content)
}

function extFromFilename(filename: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename)
  return match ? match[1].toLowerCase() : null
}

function mimeFromFilename(filename: string): string | null {
  switch (extFromFilename(filename)) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'pdf':
      return 'application/pdf'
    case 'txt':
      return 'text/plain'
    case 'md':
      return 'text/markdown'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'mp4':
      return 'video/mp4'
    default:
      return null
  }
}

describe('openRouterSendPlanSerializer', () => {
  let rootDir = ''

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true })
      rootDir = ''
    }
  })

  async function createRoot(): Promise<string> {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-phase6-'))
    return rootDir
  }

  it('serializes a sendable image url_ref plan into image_url content parts and keeps text first', async () => {
    const dir = await createRoot()
    const imageAsset = makeAsset({
      id: 'asset-image',
      filename: 'photo.png',
      assetKind: 'image',
      storageBackend: 'remote_url',
      storageUri: 'https://cdn.example.test/photo.png',
      sourceMetaJson: {
        resolvedUrl: 'https://cdn.example.test/photo.png',
      },
    })
    const sendPlan = makeSendPlan([
      makeAttachmentPlan({
        assetId: imageAsset.id,
        attachmentId: 'att-image',
        aiPayloadKind: 'image',
        selectedSendMode: 'url_ref',
      }),
    ])

    const result = await serializeSendPlanForOpenRouter({
      sendPlan,
      userText: 'describe this image',
      assetsById: { [imageAsset.id]: imageAsset },
      storageRootDir: dir,
    })

    expect(result.contentParts).toEqual([
      { type: 'text', text: 'describe this image' },
      { type: 'image_url', image_url: { url: 'https://cdn.example.test/photo.png' } },
    ])
    expect(result.diagnostics.includedAttachments).toEqual([
      expect.objectContaining({
        assetId: imageAsset.id,
        selectedSendMode: 'url_ref',
        finalSendMode: 'url_ref',
        contentType: 'image_url',
      }),
    ])
  })

  it('rejects blocked send plans before building OpenRouter content parts', async () => {
    const dir = await createRoot()
    await expect(() =>
      serializeSendPlanForOpenRouter({
        sendPlan: makeSendPlan([], { status: 'blocked', blockingReasons: [{ code: 'x', assetId: null, source: 'request', message: 'blocked' }] }),
        userText: 'hello',
        assetsById: {},
        storageRootDir: dir,
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        code: 'send_plan_blocked',
      }),
    })
  })

  it('does not re-include excluded attachments in the serialized request', async () => {
    const dir = await createRoot()
    const includedAsset = makeAsset({
      id: 'asset-included',
      filename: 'page.pdf',
      assetKind: 'document',
      storageBackend: 'remote_url',
      storageUri: 'https://cdn.example.test/page.pdf',
      sourceMetaJson: { resolvedUrl: 'https://cdn.example.test/page.pdf' },
    })
    const excludedAsset = makeAsset({
      id: 'asset-excluded',
      filename: 'ignore.png',
      assetKind: 'image',
      storageBackend: 'remote_url',
      storageUri: 'https://cdn.example.test/ignore.png',
      sourceMetaJson: { resolvedUrl: 'https://cdn.example.test/ignore.png' },
    })
    const sendPlan = makeSendPlan([
      makeAttachmentPlan({
        assetId: includedAsset.id,
        attachmentId: 'att-included',
        aiPayloadKind: 'pdf',
        selectedSendMode: 'url_ref',
      }),
      makeAttachmentPlan({
        assetId: excludedAsset.id,
        attachmentId: 'att-excluded',
        aiPayloadKind: 'image',
        selectedSendMode: null,
        eligibility: 'excluded',
        exclusionReason: 'history_attachment_excluded',
      }),
    ])

    const result = await serializeSendPlanForOpenRouter({
      sendPlan,
      userText: 'use the PDF only',
      assetsById: {
        [includedAsset.id]: includedAsset,
        [excludedAsset.id]: excludedAsset,
      },
      storageRootDir: dir,
    })

    expect(result.contentParts).toEqual([
      { type: 'text', text: 'use the PDF only' },
      {
        type: 'file',
        file: {
          filename: 'page.pdf',
          file_data: 'https://cdn.example.test/page.pdf',
        },
      },
    ])
    expect(result.diagnostics.excludedAttachments).toEqual([
      expect.objectContaining({
        assetId: excludedAsset.id,
        exclusionReason: 'history_attachment_excluded',
      }),
    ])
  })

  it('serializes inline image files as base64-backed image_url parts', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-inline-image',
      filename: 'inline.png',
      assetKind: 'image',
      storageUri: 'assets/original/as/asset-inline-image.png',
    })
    await writeAssetFile(dir, asset, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))

    const result = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([
        makeAttachmentPlan({
          assetId: asset.id,
          attachmentId: 'att-inline-image',
          aiPayloadKind: 'image',
          selectedSendMode: 'inline_base64',
        }),
      ]),
      userText: '',
      assetsById: { [asset.id]: asset },
      storageRootDir: dir,
    })

    expect(result.contentParts).toEqual([
      {
        type: 'image_url',
        image_url: {
          url: expect.stringMatching(/^data:image\/png;base64,/),
        },
      },
    ])
  })

  it.each([
    ['../secret.txt', 'attachment_storage_uri_invalid'],
    ['assets/original/../../secret.txt', 'attachment_storage_uri_invalid'],
    ['/absolute/path/file.pdf', 'attachment_storage_uri_invalid'],
    ['C:\\Users\\me\\secret.txt', 'attachment_storage_uri_invalid'],
    ['\\\\server\\share\\file', 'attachment_storage_uri_invalid'],
    ['assets\\original\\..\\..\\secret.txt', 'attachment_storage_uri_invalid'],
  ])('rejects unsafe local storageUri %s', async (storageUri, expectedCode) => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-unsafe',
      filename: 'unsafe.png',
      storageUri,
      assetKind: 'image',
      mime: 'image/png',
    })
    const plan = makeAttachmentPlan({
      assetId: asset.id,
      attachmentId: 'att-unsafe',
      aiPayloadKind: 'image',
      selectedSendMode: 'inline_base64',
    })

    await expect(
      serializeSendPlanForOpenRouter({
        sendPlan: makeSendPlan([plan]),
        userText: 'describe',
        assetsById: { [asset.id]: asset },
        storageRootDir: dir,
      })
    ).rejects.toMatchObject({
      details: {
        code: expectedCode,
        assetId: asset.id,
      },
    })
  })

  it.each([
    ['assets/original/as/photo.png'],
    ['assets/derived/asset-1/thumb.png'],
  ])('allows storageUri inside managed storage layout: %s', async (storageUri) => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: `asset-${storageUri.includes('derived') ? 'derived' : 'original'}`,
      filename: 'photo.png',
      storageUri,
      assetKind: 'image',
      mime: 'image/png',
    })
    await writeAssetFile(dir, asset, 'image-bytes')
    const plan = makeAttachmentPlan({
      assetId: asset.id,
      attachmentId: `att-${asset.id}`,
      aiPayloadKind: 'image',
      selectedSendMode: 'inline_base64',
    })

    const result = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([plan]),
      userText: 'describe',
      assetsById: { [asset.id]: asset },
      storageRootDir: dir,
    })

    expect(result.contentParts[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: expect.stringMatching(/^data:image\/png;base64,/) },
    })
  })

  it('serializes PDF URL refs as file parts and injects the file-parser plugin when configured', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-pdf-url',
      filename: 'manual.pdf',
      assetKind: 'document',
      storageBackend: 'remote_url',
      storageUri: 'https://cdn.example.test/manual.pdf',
      sourceMetaJson: {
        resolvedUrl: 'https://cdn.example.test/manual.pdf',
      },
    })

    const result = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([
        makeAttachmentPlan({
          assetId: asset.id,
          attachmentId: 'att-pdf-url',
          aiPayloadKind: 'pdf',
          selectedSendMode: 'url_ref',
        }),
      ]),
      userText: 'read the PDF',
      assetsById: { [asset.id]: asset },
      storageRootDir: dir,
      pdfFileParser: { enabled: true, engine: 'native' },
    })

    expect(result.contentParts[1]).toEqual({
      type: 'file',
      file: {
        filename: 'manual.pdf',
        file_data: 'https://cdn.example.test/manual.pdf',
      },
    })
    expect(result.additionalPlugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }])
  })

  it('serializes inline PDF files as base64 file parts', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-pdf-inline',
      filename: 'book.pdf',
      assetKind: 'document',
      storageUri: 'assets/original/as/book.pdf',
    })
    await writeAssetFile(dir, asset, '%PDF-1.4')

    const result = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([
        makeAttachmentPlan({
          assetId: asset.id,
          attachmentId: 'att-pdf-inline',
          aiPayloadKind: 'pdf',
          selectedSendMode: 'inline_base64',
        }),
      ]),
      userText: '',
      assetsById: { [asset.id]: asset },
      storageRootDir: dir,
    })

    expect(result.contentParts).toEqual([
      {
        type: 'file',
        file: {
          filename: 'book.pdf',
          file_data: expect.stringMatching(/^data:application\/pdf;base64,/),
        },
      },
    ])
  })

  it('serializes audio inline inputs as input_audio with format', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-audio',
      filename: 'voice.mp3',
      assetKind: 'audio',
      storageUri: 'assets/original/as/voice.mp3',
    })
    await writeAssetFile(dir, asset, 'audio')

    const result = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([
        makeAttachmentPlan({
          assetId: asset.id,
          attachmentId: 'att-audio',
          aiPayloadKind: 'audio',
          selectedSendMode: 'inline_base64',
        }),
      ]),
      userText: 'transcribe this',
      assetsById: { [asset.id]: asset },
      storageRootDir: dir,
    })

    expect(result.contentParts[1]).toEqual({
      type: 'input_audio',
      input_audio: {
        data: expect.any(String),
        format: 'mp3',
      },
    })
  })

  it('rejects audio url_ref mappings with a dedicated error code', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-audio-url',
      filename: 'voice.mp3',
      assetKind: 'audio',
      storageBackend: 'remote_url',
      storageUri: 'https://cdn.example.test/voice.mp3',
      sourceMetaJson: { resolvedUrl: 'https://cdn.example.test/voice.mp3' },
    })

    await expect(() =>
      serializeSendPlanForOpenRouter({
        sendPlan: makeSendPlan([
          makeAttachmentPlan({
            assetId: asset.id,
            attachmentId: 'att-audio-url',
            aiPayloadKind: 'audio',
            selectedSendMode: 'url_ref',
          }),
        ]),
        userText: '',
        assetsById: { [asset.id]: asset },
        storageRootDir: dir,
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        code: 'audio_url_not_supported',
      }),
    })
  })

  it('serializes video URL refs only when the provider context allows them', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-video',
      filename: 'clip.mp4',
      assetKind: 'video',
      storageBackend: 'remote_url',
      storageUri: 'https://cdn.example.test/clip.mp4',
      sourceMetaJson: { resolvedUrl: 'https://cdn.example.test/clip.mp4' },
    })

    const allowed = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([
        makeAttachmentPlan({
          assetId: asset.id,
          attachmentId: 'att-video',
          aiPayloadKind: 'video',
          selectedSendMode: 'url_ref',
        }),
      ]),
      userText: '',
      assetsById: { [asset.id]: asset },
      storageRootDir: dir,
      providerContext: { allowVideoUrlRef: true },
    })
    expect(allowed.contentParts).toEqual([
      {
        type: 'video_url',
        video_url: { url: 'https://cdn.example.test/clip.mp4' },
      },
    ])

    await expect(() =>
      serializeSendPlanForOpenRouter({
        sendPlan: makeSendPlan([
          makeAttachmentPlan({
            assetId: asset.id,
            attachmentId: 'att-video',
            aiPayloadKind: 'video',
            selectedSendMode: 'url_ref',
          }),
        ]),
        userText: '',
        assetsById: { [asset.id]: asset },
        storageRootDir: dir,
        providerContext: { allowVideoUrlRef: false },
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        code: 'video_url_provider_not_allowed',
      }),
    })
  })

  it('surfaces missing local files with attachment_local_file_missing', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-missing-local',
      filename: 'photo.png',
      assetKind: 'image',
      storageUri: 'assets/original/as/photo.png',
    })

    await expect(() =>
      serializeSendPlanForOpenRouter({
        sendPlan: makeSendPlan([
          makeAttachmentPlan({
            assetId: asset.id,
            attachmentId: 'att-missing-local',
            aiPayloadKind: 'image',
            selectedSendMode: 'inline_base64',
          }),
        ]),
        userText: '',
        assetsById: { [asset.id]: asset },
        storageRootDir: dir,
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        code: 'attachment_local_file_missing',
      }),
    })
  })

  it('only uses fallback send modes when the send plan explicitly allows them', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-fallback',
      filename: 'photo.png',
      assetKind: 'image',
      storageUri: 'assets/original/as/photo.png',
      sourceMetaJson: {
        resolvedUrl: 'https://cdn.example.test/photo.png',
      },
    })
    await writeAssetFile(dir, asset, new Uint8Array([1, 2, 3, 4]))

    const withFallback = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([
        makeAttachmentPlan({
          assetId: asset.id,
          attachmentId: 'att-fallback',
          aiPayloadKind: 'image',
          selectedSendMode: 'url_ref',
          fallbackSendModes: ['inline_base64'],
        }),
      ]),
      userText: '',
      assetsById: {
        [asset.id]: {
          ...asset,
          sourceMetaJson: { resolvedUrl: '' },
        },
      },
      storageRootDir: dir,
    })
    expect(withFallback.diagnostics.includedAttachments[0]).toMatchObject({
      selectedSendMode: 'url_ref',
      finalSendMode: 'inline_base64',
      fallbackApplied: true,
    })

    await expect(() =>
      serializeSendPlanForOpenRouter({
        sendPlan: makeSendPlan([
          makeAttachmentPlan({
            assetId: asset.id,
            attachmentId: 'att-no-fallback',
            aiPayloadKind: 'image',
            selectedSendMode: 'url_ref',
            fallbackSendModes: [],
          }),
        ]),
        userText: '',
        assetsById: {
          [asset.id]: {
            ...asset,
            sourceMetaJson: { resolvedUrl: '' },
          },
        },
        storageRootDir: dir,
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        code: 'attachment_url_missing',
      }),
    })
  })

  it('builds text attachment parts without dropping the filename provenance marker', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-text',
      filename: 'notes.md',
      assetKind: 'text',
      storageUri: 'assets/original/as/notes.md',
    })
    await writeAssetFile(dir, asset, '# heading')

    const result = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([
        makeAttachmentPlan({
          assetId: asset.id,
          attachmentId: 'att-text',
          aiPayloadKind: 'text',
          selectedSendMode: 'inline_base64',
        }),
      ]),
      userText: 'summarize',
      assetsById: { [asset.id]: asset },
      storageRootDir: dir,
    })

    expect(result.contentParts).toEqual([
      { type: 'text', text: 'summarize' },
      {
        type: 'text',
        text: '[Attached text file: notes.md]\n# heading',
      },
    ])
  })

  it('keeps OpenRouter payload behavior stable when semantic target differs from legacy payload kind', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-semantics-stable',
      filename: 'draft.docx',
      extension: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      assetKind: 'document',
      storageBackend: 'remote_url',
      storageUri: 'https://cdn.example.test/draft.pdf',
      sourceMetaJson: { resolvedUrl: 'https://cdn.example.test/draft.pdf' },
    })

    const result = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([
        makeAttachmentPlan({
          assetId: asset.id,
          attachmentId: 'att-semantics-stable',
          aiPayloadKind: 'pdf',
          selectedSendMode: 'url_ref',
          semantic: {
            targetKind: 'markdown',
            sendStrategy: 'text_in_prompt',
            mappedFromLegacy: false,
          },
        }),
      ]),
      userText: 'analyze',
      assetsById: { [asset.id]: asset },
      storageRootDir: dir,
    })

    expect(result.contentParts).toEqual([
      { type: 'text', text: 'analyze' },
      {
        type: 'file',
        file: {
          filename: 'draft.docx',
          file_data: 'https://cdn.example.test/draft.pdf',
        },
      },
    ])
  })

  it('keeps diagnostics sanitized and never echoes raw base64 payloads', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-sanitized',
      filename: 'photo.png',
      assetKind: 'image',
      storageUri: 'assets/original/as/photo.png',
    })
    await writeAssetFile(dir, asset, new Uint8Array([1, 2, 3, 4]))

    const result = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([
        makeAttachmentPlan({
          assetId: asset.id,
          attachmentId: 'att-sanitized',
          aiPayloadKind: 'image',
          selectedSendMode: 'inline_base64',
        }),
      ]),
      userText: '',
      assetsById: { [asset.id]: asset },
      storageRootDir: dir,
    })

    expect(JSON.stringify(result.diagnostics)).not.toContain('data:image')
    expect(result.diagnostics.includedAttachments[0]).toMatchObject({
      assetId: asset.id,
      selectedSendMode: 'inline_base64',
    })
  })

  it('wraps nested serialization failures in attachment_serialization_failed while preserving the cause', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-read-fail',
      filename: 'photo.png',
      assetKind: 'image',
      storageUri: 'assets/original/as/photo.png',
    })

    await expect(() =>
      serializeSendPlanForOpenRouter({
        sendPlan: makeSendPlan([
          makeAttachmentPlan({
            assetId: asset.id,
            attachmentId: 'att-read-fail',
            aiPayloadKind: 'image',
            selectedSendMode: 'inline_base64',
          }),
        ]),
        userText: '',
        assetsById: { [asset.id]: asset },
        storageRootDir: dir,
        readFileBytes: async () => {
          throw new Error('boom')
        },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(OpenRouterAttachmentSerializationError)
      const serializationError = error as OpenRouterAttachmentSerializationError
      expect(serializationError.details.code).toBe('attachment_local_file_read_failed')
      return true
    })
  })

  it('sanitizes attachment metadata before building prompt-envelope parts', async () => {
    const dir = await createRoot()
    const asset = makeAsset({
      id: 'asset-meta-escape',
      filename: 'line1\r\nline2\u0000<script>alert(1)</script>.txt',
      assetKind: 'text',
      storageBackend: 'remote_url',
      storageUri: 'https://example.test/a.txt',
      sourceMetaJson: {
        resolvedUrl: 'https://example.test/a.txt?x=1\r\nInjected: yes',
      },
    })

    const result = await serializeSendPlanForOpenRouter({
      sendPlan: makeSendPlan([
        makeAttachmentPlan({
          assetId: asset.id,
          attachmentId: 'att-meta-escape',
          aiPayloadKind: 'text',
          selectedSendMode: 'url_ref',
        }),
      ]),
      userText: '',
      assetsById: { [asset.id]: asset },
      storageRootDir: dir,
    })

    expect(result.contentParts).toEqual([
      {
        type: 'text',
        text: expect.stringContaining('[Attached text file: line1 line2 <script>alert(1)</script>.txt]'),
      },
    ])
    const textPart = result.contentParts[0] as { type: 'text'; text: string }
    expect(textPart.text).toContain('URL: https://example.test/a.txt?x=1 Injected: yes')
    expect(textPart.text).not.toContain('\r')
    expect(textPart.text).not.toContain('\nURL: https://example.test/a.txt?x=1\r\nInjected: yes')
  })
})
/* eslint-enable max-lines-per-function */

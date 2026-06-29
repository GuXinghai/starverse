import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createProviderFileInputAssetReader,
  M1C_PDF_INLINE_LIMIT_BYTES,
  prepareProviderFileInput,
  type ProviderFileAssetMetadata,
  type ProviderFileInputProvider,
  type ProviderFileInputReadResult,
} from '@/next/multimodal/providerFileInputMapper'
import type { AssetRevisionRecord, FileAssetRecord, FileBlobRecord } from '../../../infra/db/types'

const PROVIDERS = [
  'openai_responses',
  'anthropic_messages',
  'google_ai_studio',
  'openrouter',
] as const satisfies readonly ProviderFileInputProvider[]

const TINY_PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
])
const TINY_JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9])
const TINY_PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')

const ORIGINAL_URL = 'https://origin.example.test/private/manual.pdf?token=do-not-leak'
const LOCAL_PATH = 'C:\\Users\\owner\\Documents\\secret-source.pdf'
const STORAGE_PATH = 'D:\\Starverse\\runtime\\assets\\managed\\manual.pdf'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('providerFileInputMapper', () => {
  it.each(PROVIDERS)('maps a tiny PNG asset to %s request part', async (provider) => {
    const bytes = TINY_PNG_BYTES
    const result = await prepareProviderFileInput({
      provider,
      assetId: 'asset-png',
      readAsset: async () => managedReadResult({
        assetId: 'asset-png',
        filename: 'pixel.png',
        mimeType: 'image/png',
        extension: 'png',
        bytes,
      }),
    })

    expect(result).toMatchObject({
      ok: true,
      provider,
      assetId: 'asset-png',
      revisionId: 'rev-asset-png',
      mimeType: 'image/png',
      sizeBytes: bytes.byteLength,
      kind: 'image',
    })
    if (result.ok) expect(result.requestPart).toEqual(expectedInlinePart(provider, 'image', 'pixel.png', 'image/png', bytes))
  })

  it.each(PROVIDERS)('maps a tiny JPEG asset to %s request part', async (provider) => {
    const bytes = TINY_JPEG_BYTES
    const result = await prepareProviderFileInput({
      provider,
      assetId: 'asset-jpeg',
      readAsset: async () => managedReadResult({
        assetId: 'asset-jpeg',
        filename: 'photo.jpeg',
        mimeType: 'image/jpeg',
        extension: 'jpeg',
        bytes,
      }),
    })

    expect(result).toMatchObject({
      ok: true,
      provider,
      assetId: 'asset-jpeg',
      revisionId: 'rev-asset-jpeg',
      mimeType: 'image/jpeg',
      sizeBytes: bytes.byteLength,
      kind: 'image',
    })
    if (result.ok) expect(result.requestPart).toEqual(expectedInlinePart(provider, 'image', 'photo.jpeg', 'image/jpeg', bytes))
  })

  it.each(PROVIDERS)('maps a one-page small PDF asset to %s request part', async (provider) => {
    const bytes = TINY_PDF_BYTES
    const result = await prepareProviderFileInput({
      provider,
      assetId: 'asset-pdf',
      readAsset: async () => managedReadResult({
        assetId: 'asset-pdf',
        filename: 'manual.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        bytes,
      }),
    })

    expect(result).toMatchObject({
      ok: true,
      provider,
      assetId: 'asset-pdf',
      revisionId: 'rev-asset-pdf',
      mimeType: 'application/pdf',
      sizeBytes: bytes.byteLength,
      kind: 'pdf',
    })
    if (result.ok) expect(result.requestPart).toEqual(expectedInlinePart(provider, 'pdf', 'manual.pdf', 'application/pdf', bytes))
  })

  it('maps link_and_file URL snapshots from managed snapshot bytes without passing originalUrl', async () => {
    const result = await prepareProviderFileInput({
      provider: 'openai_responses',
      assetId: 'asset-url-snapshot',
      sendMode: 'url_ref',
      readAsset: async () => managedReadResult({
        assetId: 'asset-url-snapshot',
        filename: 'snapshot.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        bytes: TINY_PDF_BYTES,
        sourceKind: 'url_import',
        sourceMetaJson: {
          retentionMode: 'link_and_file',
          originalUrl: ORIGINAL_URL,
          resolvedUrl: 'https://cdn.example.test/manual.pdf',
          originalPath: LOCAL_PATH,
          storagePath: STORAGE_PATH,
        },
      }),
    })

    expect(result).toMatchObject({ ok: true, kind: 'pdf', revisionId: 'rev-asset-url-snapshot' })
    if (!result.ok) throw new Error(result.message)
    expect(result.requestPart).toEqual(expectedInlinePart('openai_responses', 'pdf', 'snapshot.pdf', 'application/pdf', TINY_PDF_BYTES))
    const serialized = JSON.stringify(result.requestPart)
    expect(serialized).not.toContain(ORIGINAL_URL)
    expect(serialized).not.toContain('https://cdn.example.test/manual.pdf')
  })

  it.each(PROVIDERS)('maps link_only public image URLs for URL-capable %s request parts', async (provider) => {
    const url = 'https://cdn.example.test/photo.png'
    const result = await prepareProviderFileInput({
      provider,
      assetId: 'asset-link-only-image',
      readAsset: async () => providerUrlReadResult({
        assetId: 'asset-link-only-image',
        filename: 'remote.png',
        mimeType: 'image/png',
        extension: 'png',
        url,
      }),
    })

    expect(result).toMatchObject({
      ok: true,
      provider,
      assetId: 'asset-link-only-image',
      revisionId: 'link_only',
      mimeType: 'image/png',
      kind: 'image',
    })
    if (result.ok) expect(result.requestPart).toEqual(expectedUrlPart(provider, 'image', 'remote.png', 'image/png', url))
  })

  it('rejects link_only URL inputs when the provider shape has no documented URL part for that kind', async () => {
    const result = await prepareProviderFileInput({
      provider: 'openrouter',
      assetId: 'asset-link-only-doc',
      readAsset: async () => providerUrlReadResult({
        assetId: 'asset-link-only-doc',
        filename: 'brief.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        url: 'https://cdn.example.test/brief.docx',
      }),
    })

    expect(result).toEqual({
      ok: false,
      provider: 'openrouter',
      code: 'url_not_allowed',
      message: 'Provider openrouter does not allow direct URL input for document assets.',
    })
  })

  it.each(PROVIDERS)('maps link_only public PDF URLs for URL-capable %s request parts', async (provider) => {
    const url = 'https://cdn.example.test/manual.pdf'
    const result = await prepareProviderFileInput({
      provider,
      assetId: 'asset-link-only-pdf',
      readAsset: async () => providerUrlReadResult({
        assetId: 'asset-link-only-pdf',
        filename: 'manual.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        url,
      }),
    })

    expect(result).toMatchObject({
      ok: true,
      provider,
      assetId: 'asset-link-only-pdf',
      revisionId: 'link_only',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })
    if (result.ok) expect(result.requestPart).toEqual(expectedUrlPart(provider, 'pdf', 'manual.pdf', 'application/pdf', url))
  })

  it('rejects link_only PDF URLs with query or hash without leaking URL tokens', async () => {
    const result = await prepareProviderFileInput({
      provider: 'openrouter',
      assetId: 'asset-link-only-pdf-token',
      readAsset: async () => providerUrlReadResult({
        assetId: 'asset-link-only-pdf-token',
        filename: 'manual.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        url: 'https://cdn.example.test/manual.pdf?token=do-not-leak#frag',
      }),
    })

    expect(result).toEqual({
      ok: false,
      provider: 'openrouter',
      code: 'url_not_allowed',
      message: 'Provider openrouter does not allow direct URL input for pdf assets.',
    })
    expect(JSON.stringify(result)).not.toContain('do-not-leak')
    expect(JSON.stringify(result)).not.toContain('#frag')
  })

  it('rejects link_only URLs with embedded credentials without leaking credentials in the error', async () => {
    const credentialedUrl = 'https://user:secret@cdn.example.test/photo.png?token=do-not-leak'
    const result = await prepareProviderFileInput({
      provider: 'openai_responses',
      assetId: 'asset-link-only-credentialed',
      readAsset: async () => providerUrlReadResult({
        assetId: 'asset-link-only-credentialed',
        filename: 'photo.png',
        mimeType: 'image/png',
        extension: 'png',
        url: credentialedUrl,
      }),
    })

    expect(result).toEqual({
      ok: false,
      provider: 'openai_responses',
      code: 'url_not_allowed',
      message: 'Provider openai_responses does not allow direct URL input for image assets.',
    })
    expect(JSON.stringify(result)).not.toContain('user:secret')
    expect(JSON.stringify(result)).not.toContain('do-not-leak')
  })

  it('rejects unsupported MIME types conservatively', async () => {
    const result = await prepareProviderFileInput({
      provider: 'anthropic_messages',
      assetId: 'asset-bin',
      readAsset: async () => managedReadResult({
        assetId: 'asset-bin',
        filename: 'payload.bin',
        mimeType: 'application/octet-stream',
        extension: 'bin',
        bytes: Uint8Array.from([1, 2, 3, 4]),
      }),
    })

    expect(result).toMatchObject({
      ok: false,
      provider: 'anthropic_messages',
      code: 'unsupported_mime',
    })
  })

  it('rejects OpenRouter non-PDF document input rather than overpromising generic document support', async () => {
    const bytes = new TextEncoder().encode('fake docx bytes')
    const result = await prepareProviderFileInput({
      provider: 'openrouter',
      assetId: 'asset-docx',
      readAsset: async () => managedReadResult({
        assetId: 'asset-docx',
        filename: 'brief.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        bytes,
      }),
    })

    expect(result).toEqual({
      ok: false,
      provider: 'openrouter',
      code: 'unsupported_mime',
      message: 'Provider openrouter does not support document inline file input.',
    })
  })

  it('returns too_large_for_inline without falling back to URL or provider upload', async () => {
    const result = await prepareProviderFileInput({
      provider: 'google_ai_studio',
      assetId: 'asset-large',
      maxInlineBytes: TINY_PNG_BYTES.byteLength - 1,
      readAsset: async () => managedReadResult({
        assetId: 'asset-large',
        filename: 'large.png',
        mimeType: 'image/png',
        extension: 'png',
        bytes: TINY_PNG_BYTES,
      }),
    })

    expect(result).toEqual({
      ok: false,
      provider: 'google_ai_studio',
      code: 'too_large_for_inline',
      message: 'Asset asset-large is too large for inline google_ai_studio file input.',
    })
    expect(JSON.stringify(result)).not.toContain('file_id')
    expect(JSON.stringify(result)).not.toContain('fileUri')
  })

  it('enforces the M1c 1 MB PDF inline hard limit by default', async () => {
    const bytes = new Uint8Array(M1C_PDF_INLINE_LIMIT_BYTES + 1)
    const result = await prepareProviderFileInput({
      provider: 'openai_responses',
      assetId: 'asset-large-pdf',
      readAsset: async () => managedReadResult({
        assetId: 'asset-large-pdf',
        filename: 'large.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        bytes,
      }),
    })

    expect(result).toEqual({
      ok: false,
      provider: 'openai_responses',
      code: 'too_large_for_inline',
      message: 'Asset asset-large-pdf is too large for inline openai_responses file input.',
    })
    expect(JSON.stringify(result)).not.toContain('file_id')
    expect(JSON.stringify(result)).not.toContain('fileUri')
  })

  it.each(['pending', 'failed'] as const)('returns asset_not_ready for %s assets', async (ingestStatus) => {
    const result = await prepareProviderFileInput({
      provider: 'anthropic_messages',
      assetId: `asset-${ingestStatus}`,
      readAsset: async () => managedReadResult({
        assetId: `asset-${ingestStatus}`,
        filename: 'photo.png',
        mimeType: 'image/png',
        extension: 'png',
        bytes: TINY_PNG_BYTES,
        ingestStatus,
      }),
    })

    expect(result).toMatchObject({
      ok: false,
      provider: 'anthropic_messages',
      code: 'asset_not_ready',
    })
  })

  it('returns unsupported_provider for DeepSeek without reading file bytes', async () => {
    const readAsset = vi.fn(async () => managedReadResult({
      assetId: 'asset-any',
      filename: 'photo.png',
      mimeType: 'image/png',
      extension: 'png',
      bytes: TINY_PNG_BYTES,
    }))

    const result = await prepareProviderFileInput({
      provider: 'deepseek',
      assetId: 'asset-any',
      readAsset,
    })

    expect(readAsset).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      provider: 'deepseek',
      code: 'unsupported_provider',
      message: 'DeepSeek official APIs are text-only for Starverse file input mapping.',
    })
  })

  it('does not leak renderer paths, originalPath, storagePath, storageUri, or raw local paths in request parts', async () => {
    const result = await prepareProviderFileInput({
      provider: 'openrouter',
      assetId: 'asset-path-safety',
      readAsset: async () => managedReadResult({
        assetId: 'asset-path-safety',
        filename: 'manual.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        bytes: TINY_PDF_BYTES,
        sourceMetaJson: {
          originalPath: LOCAL_PATH,
          storagePath: STORAGE_PATH,
          storageUri: 'assets/original/pa/manual.pdf',
          rendererPath: 'file:///D:/Starverse/runtime/assets/manual.pdf',
        },
      }),
    })

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error(result.message)
    const serialized = JSON.stringify(result.requestPart)
    for (const forbidden of ['originalPath', 'storagePath', 'storageUri', 'rendererPath', LOCAL_PATH, STORAGE_PATH, 'D:/Starverse/runtime']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('does not call fetch or embed provider API keys while preparing request parts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const previousKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'sk-provider-key-must-not-appear'
    try {
      const result = await prepareProviderFileInput({
        provider: 'openai_responses',
        assetId: 'asset-no-live',
        readAsset: async () => managedReadResult({
          assetId: 'asset-no-live',
          filename: 'photo.png',
          mimeType: 'image/png',
          extension: 'png',
          bytes: TINY_PNG_BYTES,
        }),
      })

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(JSON.stringify(result)).not.toContain('sk-provider-key-must-not-appear')
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY
      } else {
        process.env.OPENAI_API_KEY = previousKey
      }
    }
  })

  it('reader resolves the File Asset Store current revision blob before mapping request parts', async () => {
    const asset = fileAssetRecord({
      id: 'asset-current',
      filename: 'current.png',
      extension: 'png',
      mime: 'image/png',
      storageUri: 'assets/original/old/not-current.png',
    })
    const revision: AssetRevisionRecord = {
      id: 'rev-current',
      assetId: asset.id,
      blobId: 'blob-current',
      parentRevisionId: 'rev-old',
      cause: 'ai_edited',
      derivedFromAssetId: 'asset-original',
      createdAt: 2,
    }
    const blob: FileBlobRecord = {
      id: revision.blobId,
      sha256: 'a'.repeat(64),
      sizeBytes: TINY_PNG_BYTES.byteLength,
      mime: 'image/png',
      storageBackend: 'local_fs',
      storageUri: 'assets/blobs/cu/current.png',
      createdAt: 2,
    }
    const readFileBytes = vi.fn(async (filePath: string) => {
      expect(filePath.replace(/\\/g, '/')).toContain('/assets/blobs/cu/current.png')
      return TINY_PNG_BYTES
    })
    const reader = createProviderFileInputAssetReader({
      fileAssetRepo: { getById: () => asset },
      fileAssetStoreRepo: {
        getCurrentRevision: () => revision,
        getBlobById: () => blob,
      },
      storageRootDir: 'D:/Starverse/storage-root',
      readFileBytes,
    })

    const result = await prepareProviderFileInput({
      provider: 'google_ai_studio',
      assetId: asset.id,
      readAsset: reader,
    })

    expect(readFileBytes).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      ok: true,
      assetId: asset.id,
      revisionId: revision.id,
      mimeType: 'image/png',
      sizeBytes: TINY_PNG_BYTES.byteLength,
      kind: 'image',
      requestPart: expectedInlinePart('google_ai_studio', 'image', 'current.png', 'image/png', TINY_PNG_BYTES),
    })
  })

  it('reader returns asset_not_ready for assets without a current revision without reading bytes', async () => {
    const asset = fileAssetRecord({
      id: 'asset-no-revision',
      filename: 'missing.png',
      extension: 'png',
      mime: 'image/png',
      storageUri: 'assets/original/no/current.png',
    })
    const readFileBytes = vi.fn(async () => TINY_PNG_BYTES)
    const reader = createProviderFileInputAssetReader({
      fileAssetRepo: { getById: () => asset },
      fileAssetStoreRepo: {
        getCurrentRevision: () => null,
        getBlobById: () => null,
      },
      storageRootDir: 'D:/Starverse/storage-root',
      readFileBytes,
    })

    const result = await prepareProviderFileInput({
      provider: 'openai_responses',
      assetId: asset.id,
      readAsset: reader,
    })

    expect(readFileBytes).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      provider: 'openai_responses',
      code: 'asset_not_ready',
      message: 'Asset asset-no-revision has no current file revision.',
    })
  })

  it('reader returns asset_not_ready for missing current revision blob without reading bytes', async () => {
    const asset = fileAssetRecord({
      id: 'asset-missing-blob',
      filename: 'missing.png',
      extension: 'png',
      mime: 'image/png',
      storageUri: 'assets/original/no/blob.png',
    })
    const revision: AssetRevisionRecord = {
      id: 'rev-missing-blob',
      assetId: asset.id,
      blobId: 'blob-missing',
      parentRevisionId: null,
      cause: 'imported',
      derivedFromAssetId: null,
      createdAt: 2,
    }
    const readFileBytes = vi.fn(async () => TINY_PNG_BYTES)
    const reader = createProviderFileInputAssetReader({
      fileAssetRepo: { getById: () => asset },
      fileAssetStoreRepo: {
        getCurrentRevision: () => revision,
        getBlobById: () => null,
      },
      storageRootDir: 'D:/Starverse/storage-root',
      readFileBytes,
    })

    const result = await prepareProviderFileInput({
      provider: 'openai_responses',
      assetId: asset.id,
      readAsset: reader,
    })

    expect(readFileBytes).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      provider: 'openai_responses',
      code: 'asset_not_ready',
      message: 'Asset asset-missing-blob current revision blob is missing.',
    })
  })

  it('reader returns asset_not_ready for unreadable managed bytes without leaking the managed path', async () => {
    const asset = fileAssetRecord({
      id: 'asset-unreadable',
      filename: 'unreadable.png',
      extension: 'png',
      mime: 'image/png',
      storageUri: 'assets/original/source/unreadable.png',
    })
    const revision: AssetRevisionRecord = {
      id: 'rev-unreadable',
      assetId: asset.id,
      blobId: 'blob-unreadable',
      parentRevisionId: null,
      cause: 'imported',
      derivedFromAssetId: null,
      createdAt: 2,
    }
    const blob: FileBlobRecord = {
      id: revision.blobId,
      sha256: 'c'.repeat(64),
      sizeBytes: TINY_PNG_BYTES.byteLength,
      mime: 'image/png',
      storageBackend: 'local_fs',
      storageUri: 'assets/blobs/un/readable.png',
      createdAt: 2,
    }
    const readFileBytes = vi.fn(async () => {
      throw new Error('disk unavailable at D:\\Starverse\\storage-root\\assets\\blobs\\un\\readable.png')
    })
    const reader = createProviderFileInputAssetReader({
      fileAssetRepo: { getById: () => asset },
      fileAssetStoreRepo: {
        getCurrentRevision: () => revision,
        getBlobById: () => blob,
      },
      storageRootDir: 'D:/Starverse/storage-root',
      readFileBytes,
    })

    const result = await prepareProviderFileInput({
      provider: 'openai_responses',
      assetId: asset.id,
      readAsset: reader,
    })

    expect(readFileBytes).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ok: false,
      provider: 'openai_responses',
      code: 'asset_not_ready',
      message: 'Asset asset-unreadable managed bytes could not be read.',
    })
    expect(JSON.stringify(result)).not.toContain('D:\\Starverse\\storage-root')
    expect(JSON.stringify(result)).not.toContain('assets\\blobs')
  })
})

function managedReadResult(input: Readonly<{
  assetId: string
  filename: string
  mimeType: string
  extension: string
  bytes: Uint8Array
  ingestStatus?: string
  sourceKind?: string
  storageBackend?: string
  sourceMetaJson?: Record<string, unknown> | null
}>): ProviderFileInputReadResult {
  const asset = baseAsset({
    assetId: input.assetId,
    filename: input.filename,
    mimeType: input.mimeType,
    extension: input.extension,
    sizeBytes: input.bytes.byteLength,
    ingestStatus: input.ingestStatus ?? 'stored',
    sourceKind: input.sourceKind ?? 'local_upload',
    storageBackend: input.storageBackend ?? 'local_fs',
    sourceMetaJson: input.sourceMetaJson,
  })
  return {
    ok: true,
    source: 'managed_bytes',
    asset,
    revision: {
      id: `rev-${input.assetId}`,
      assetId: input.assetId,
      blobId: `blob-${input.assetId}`,
      cause: asset.sourceKind === 'url_import' ? 'url_snapshot' : 'imported',
    },
    blob: {
      id: `blob-${input.assetId}`,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    },
    bytes: input.bytes,
  }
}

function providerUrlReadResult(input: Readonly<{
  assetId: string
  filename: string
  mimeType: string
  extension: string
  url: string
}>): ProviderFileInputReadResult {
  return {
    ok: true,
    source: 'provider_url',
    asset: baseAsset({
      assetId: input.assetId,
      filename: input.filename,
      mimeType: input.mimeType,
      extension: input.extension,
      sizeBytes: 0,
      ingestStatus: 'registered',
      sourceKind: 'url_import',
      storageBackend: 'remote_url',
      sourceMetaJson: {
        retentionMode: 'link_only',
        originalUrl: input.url,
        resolvedUrl: input.url,
      },
    }),
    url: input.url,
  }
}

function baseAsset(input: Readonly<{
  assetId: string
  filename: string
  mimeType: string
  extension: string
  sizeBytes: number
  ingestStatus: string
  sourceKind: string
  storageBackend: string
  sourceMetaJson?: Record<string, unknown> | null
}>): ProviderFileAssetMetadata {
  return {
    id: input.assetId,
    filename: input.filename,
    extension: input.extension,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    assetKind: input.mimeType.startsWith('image/') ? 'image' : 'document',
    sourceKind: input.sourceKind,
    storageBackend: input.storageBackend,
    ingestStatus: input.ingestStatus,
    deletedAt: null,
    sourceMetaJson: input.sourceMetaJson ?? null,
  }
}

function expectedInlinePart(
  provider: ProviderFileInputProvider,
  kind: 'image' | 'pdf',
  filename: string,
  mimeType: string,
  bytes: Uint8Array
): unknown {
  const base64 = Buffer.from(bytes).toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`
  switch (provider) {
    case 'openai_responses':
      return kind === 'image'
        ? { type: 'input_image', image_url: dataUrl }
        : { type: 'input_file', filename, file_data: dataUrl }
    case 'anthropic_messages':
      return kind === 'image'
        ? { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }
        : { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64 }, title: filename }
    case 'google_ai_studio':
      return { inlineData: { mimeType, data: base64 } }
    case 'openrouter':
      return kind === 'image'
        ? { type: 'image_url', image_url: { url: dataUrl } }
        : { type: 'file', file: { filename, file_data: dataUrl } }
  }
}

function expectedUrlPart(
  provider: ProviderFileInputProvider,
  kind: 'image' | 'pdf',
  filename: string,
  mimeType: string,
  url: string
): unknown {
  switch (provider) {
    case 'openai_responses':
      return kind === 'image'
        ? { type: 'input_image', image_url: url }
        : { type: 'input_file', filename, file_url: url }
    case 'anthropic_messages':
      return kind === 'image'
        ? { type: 'image', source: { type: 'url', url } }
        : { type: 'document', source: { type: 'url', url }, title: filename }
    case 'google_ai_studio':
      return { fileData: { mimeType, fileUri: url } }
    case 'openrouter':
      return kind === 'image'
        ? { type: 'image_url', image_url: { url } }
        : { type: 'file', file: { filename, file_data: url } }
  }
}

function fileAssetRecord(
  overrides: Partial<FileAssetRecord> & Pick<FileAssetRecord, 'id' | 'filename' | 'extension' | 'mime' | 'storageUri'>
): FileAssetRecord {
  return {
    id: overrides.id,
    sha256: overrides.sha256 ?? 'b'.repeat(64),
    filename: overrides.filename,
    extension: overrides.extension,
    mime: overrides.mime,
    sizeBytes: overrides.sizeBytes ?? TINY_PNG_BYTES.byteLength,
    assetKind: overrides.assetKind ?? 'image',
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

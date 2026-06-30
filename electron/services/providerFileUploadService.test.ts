import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createProviderFileUploadService } from './providerFileUploadService'

const PDF_BYTES_SHA256 = '315d429b7714cedb6ad04ac31240145257692630457f3c88253c5beceac76027'

const uploadBlock = {
  type: 'starverse_provider_file_upload',
  provider: 'openai_responses',
  assetId: 'asset-upload',
  revisionId: 'rev-upload',
  blobSha256: PDF_BYTES_SHA256,
  mimeType: 'application/pdf',
  sizeBytes: 4,
  kind: 'pdf',
  filename: 'manual.pdf',
  dataBase64: 'JVBERg==',
} as const

function readyRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cache-ready',
    provider: 'openai_responses',
    endpointFamily: 'openai_responses',
    normalizedBaseUrl: 'https://api.openai.com/v1',
    credentialFingerprint: 'f'.repeat(64),
    assetId: uploadBlock.assetId,
    revisionId: uploadBlock.revisionId,
    blobSha256: uploadBlock.blobSha256,
    mimeType: uploadBlock.mimeType,
    sizeBytes: uploadBlock.sizeBytes,
    assetKind: uploadBlock.kind,
    uploadPurpose: 'user_data',
    providerFileId: 'file-openai-ready',
    providerFileUri: null,
    providerFileName: null,
    status: 'ready',
    expiresAtMs: null,
    ...overrides,
  }
}

function expectedFingerprint(apiKey: string, baseUrl = 'https://api.openai.com/v1') {
  return createHash('sha256')
    .update(`openai_responses\0openai_responses\0${baseUrl}\0${apiKey}`)
    .digest('hex')
}

describe('providerFileUploadService', () => {
  it('reuses a ready cache record without uploading', async () => {
    const db = {
      call: vi.fn(async (method: string) => method === 'providerFileCache.findReusable' ? readyRecord() : null),
    }
    const fetchImpl = vi.fn()
    const service = createProviderFileUploadService({ db })

    const result = await service.resolveContentBlocks({
      provider: 'openai_responses',
      endpointFamily: 'openai_responses',
      baseUrl: 'https://api.openai.com/v1/',
      apiKey: 'sk-openai-secret',
      blocks: [uploadBlock],
      fetchImpl: fetchImpl as any,
    })

    expect(result).toMatchObject({
      ok: true,
      blocks: [{ type: 'input_file', file_id: 'file-openai-ready' }],
      cacheEvents: [{ status: 'reused', cacheId: 'cache-ready' }],
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uploads once, stores a ready cache, and fingerprints trim-only API key plus normalized base URL', async () => {
    const db = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'providerFileCache.findReusable') return null
        if (method === 'providerFileCache.reserve') return { status: 'reserved', record: readyRecord({ id: 'cache-reserved', status: 'uploading', providerFileId: null }) }
        if (method === 'providerFileCache.markReady') return readyRecord({ id: params.id, providerFileId: params.providerFileId })
        return null
      }),
    }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'file-openai-uploaded', object: 'file' }), { status: 200 }))
    const service = createProviderFileUploadService({ db })

    const result = await service.resolveContentBlocks({
      provider: 'openai_responses',
      endpointFamily: 'openai_responses',
      baseUrl: 'https://api.openai.com/v1/',
      apiKey: '  sk-CaseSensitive  ',
      blocks: [uploadBlock],
      fetchImpl: fetchImpl as any,
    })

    expect(result).toMatchObject({
      ok: true,
      blocks: [{ type: 'input_file', file_id: 'file-openai-uploaded' }],
    })
    const reserveCall = db.call.mock.calls.find(([method]) => method === 'providerFileCache.reserve')
    expect(reserveCall?.[1]).toMatchObject({
      normalizedBaseUrl: 'https://api.openai.com/v1',
      credentialFingerprint: expectedFingerprint('sk-CaseSensitive'),
    })
    expect(JSON.stringify(db.call.mock.calls)).not.toContain('sk-CaseSensitive')
  })

  it('uses derived upload block identity and content hash as the provider file cache key', async () => {
    const derivedBytes = Buffer.from('%PDF-1.4\nderived\n')
    const derivedBlock = {
      ...uploadBlock,
      assetId: 'derivative-pdf-send',
      revisionId: 'derived:asset-source:derivative-pdf-send:2000',
      blobSha256: createHash('sha256').update(derivedBytes).digest('hex'),
      sizeBytes: derivedBytes.byteLength,
      filename: 'derivative-pdf-send.pdf',
      dataBase64: derivedBytes.toString('base64'),
    } as const
    const db = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'providerFileCache.findReusable') return null
        if (method === 'providerFileCache.reserve') {
          return {
            status: 'reserved',
            record: readyRecord({
              id: 'cache-derived',
              status: 'uploading',
              providerFileId: null,
              assetId: params.assetId,
              revisionId: params.revisionId,
              blobSha256: params.blobSha256,
              sizeBytes: params.sizeBytes,
            }),
          }
        }
        if (method === 'providerFileCache.markReady') return readyRecord({ id: params.id, providerFileId: params.providerFileId })
        return null
      }),
    }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'file-derived-uploaded', object: 'file' }), { status: 200 }))
    const service = createProviderFileUploadService({ db })

    const result = await service.resolveContentBlocks({
      provider: 'openai_responses',
      endpointFamily: 'openai_responses',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-openai-secret',
      blocks: [derivedBlock],
      fetchImpl: fetchImpl as any,
    })

    expect(result).toMatchObject({
      ok: true,
      blocks: [{ type: 'input_file', file_id: 'file-derived-uploaded' }],
    })
    const reserveCall = db.call.mock.calls.find(([method]) => method === 'providerFileCache.reserve')
    expect(reserveCall?.[1]).toMatchObject({
      assetId: 'derivative-pdf-send',
      revisionId: 'derived:asset-source:derivative-pdf-send:2000',
      blobSha256: derivedBlock.blobSha256,
      mimeType: 'application/pdf',
      sizeBytes: derivedBytes.byteLength,
      assetKind: 'pdf',
    })
    expect(JSON.stringify(reserveCall?.[1])).not.toContain('asset-upload')
    expect(JSON.stringify(reserveCall?.[1])).not.toContain('rev-upload')
  })

  it('marks upload failures failed without creating a reusable ready cache', async () => {
    const db = {
      call: vi.fn(async (method: string) => {
        if (method === 'providerFileCache.findReusable') return null
        if (method === 'providerFileCache.reserve') return { status: 'reserved', record: readyRecord({ id: 'cache-failed', status: 'uploading', providerFileId: null }) }
        if (method === 'providerFileCache.markFailed') return readyRecord({ id: 'cache-failed', status: 'failed', providerFileId: null })
        if (method === 'providerFileCache.markReady') throw new Error('markReady must not run after upload failure')
        return null
      }),
    }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad file' } }), { status: 500 }))
    const service = createProviderFileUploadService({ db })

    const result = await service.resolveContentBlocks({
      provider: 'openai_responses',
      endpointFamily: 'openai_responses',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-openai-secret',
      blocks: [uploadBlock],
      fetchImpl: fetchImpl as any,
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'openai_upload_failed',
      retryable: true,
    })
    expect(db.call.mock.calls.some(([method]) => method === 'providerFileCache.markFailed')).toBe(true)
    expect(db.call.mock.calls.some(([method]) => method === 'providerFileCache.markReady')).toBe(false)
  })

  it('coalesces concurrent duplicate uploads in the main process', async () => {
    let resolveFetch: ((response: Response) => void) | null = null
    const db = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'providerFileCache.findReusable') return null
        if (method === 'providerFileCache.reserve') return { status: 'reserved', record: readyRecord({ id: 'cache-race', status: 'uploading', providerFileId: null }) }
        if (method === 'providerFileCache.markReady') return readyRecord({ id: params.id, providerFileId: params.providerFileId })
        return null
      }),
    }
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve
    }))
    const service = createProviderFileUploadService({ db })

    const first = service.resolveContentBlocks({
      provider: 'openai_responses',
      endpointFamily: 'openai_responses',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-openai-secret',
      blocks: [uploadBlock],
      fetchImpl: fetchImpl as any,
    })
    const second = service.resolveContentBlocks({
      provider: 'openai_responses',
      endpointFamily: 'openai_responses',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-openai-secret',
      blocks: [uploadBlock],
      fetchImpl: fetchImpl as any,
    })

    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
    expect(resolveFetch).toBeTypeOf('function')
    ;(resolveFetch as unknown as (response: Response) => void)(new Response(JSON.stringify({ id: 'file-openai-race' }), { status: 200 }))
    await expect(first).resolves.toMatchObject({ ok: true })
    await expect(second).resolves.toMatchObject({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects upload payloads whose bytes do not match the declared file revision hash', async () => {
    const db = {
      call: vi.fn(),
    }
    const fetchImpl = vi.fn()
    const service = createProviderFileUploadService({ db })

    const result = await service.resolveContentBlocks({
      provider: 'openai_responses',
      endpointFamily: 'openai_responses',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-openai-secret',
      blocks: [{ ...uploadBlock, blobSha256: 'b'.repeat(64) }],
      fetchImpl: fetchImpl as any,
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'upload_payload_hash_mismatch',
    })
    expect(db.call).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects upload payloads whose decoded byte length does not match the cache key size', async () => {
    const db = {
      call: vi.fn(),
    }
    const fetchImpl = vi.fn()
    const service = createProviderFileUploadService({ db })

    const result = await service.resolveContentBlocks({
      provider: 'openai_responses',
      endpointFamily: 'openai_responses',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-openai-secret',
      blocks: [{ ...uploadBlock, sizeBytes: 5 }],
      fetchImpl: fetchImpl as any,
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'upload_payload_size_mismatch',
    })
    expect(db.call).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

import { createHash } from 'node:crypto'
import type { ProviderFetch } from '../net/providerHttpTransport'
import {
  isProviderRuntimeUploadRequestBlock,
  type ProviderRuntimeContentBlock,
  type ProviderRuntimeUploadRequestBlock,
} from '../../src/next/multimodal/providerRuntimeContentBlocks'

export type ProviderFileUploadProvider =
  | 'openai_responses'
  | 'anthropic_messages'
  | 'google_ai_studio'

export type ProviderFileUploadCacheDb = Readonly<{
  call: (method: any, params?: unknown) => Promise<unknown>
}>

export type ProviderFileUploadService = Readonly<{
  resolveContentBlocks: (input: ResolveProviderFileUploadBlocksInput) => Promise<ResolveProviderFileUploadBlocksResult>
  invalidate: (input: Readonly<{ cacheId: string; errorCode?: string; errorMessage?: string }>) => Promise<void>
}>

export type ResolveProviderFileUploadBlocksInput = Readonly<{
  provider: ProviderFileUploadProvider
  apiKey: string
  endpointFamily: string
  baseUrl: string
  blocks?: ReadonlyArray<ProviderRuntimeContentBlock>
  fetchImpl: ProviderFetch
  signal?: AbortSignal
  nowMs?: number
}>

export type ResolveProviderFileUploadBlocksResult =
  | Readonly<{ ok: true; blocks: ProviderRuntimeContentBlock[]; cacheEvents: ProviderFileUploadCacheEvent[] }>
  | Readonly<{ ok: false; code: string; message: string; retryable?: boolean }>

export type ProviderFileUploadCacheEvent = Readonly<{
  cacheId: string
  provider: ProviderFileUploadProvider
  status: 'reused' | 'uploaded'
  assetId: string
  revisionId: string
  kind: 'image' | 'pdf'
}>

type CacheKey = Readonly<{
  provider: ProviderFileUploadProvider
  endpointFamily: string
  normalizedBaseUrl: string
  credentialFingerprint: string
  assetId: string
  revisionId: string
  blobSha256: string
  mimeType: string
  sizeBytes: number
  assetKind: 'image' | 'pdf'
  uploadPurpose: string
}>

type CacheRecord = CacheKey & Readonly<{
  id: string
  providerFileId: string | null
  providerFileUri: string | null
  providerFileName: string | null
  status: 'uploading' | 'ready' | 'failed' | 'invalidated'
  expiresAtMs: number | null
}>

type ProviderUploadResult =
  | Readonly<{
      ok: true
      providerFileId?: string | null
      providerFileUri?: string | null
      providerFileName?: string | null
      expiresAtMs?: number | null
      metadataJson?: Record<string, unknown> | null
    }>
  | Readonly<{ ok: false; code: string; message: string; retryable?: boolean }>

const inFlightUploads = new Map<string, Promise<ResolveOneUploadResult>>()

type ResolveOneUploadResult =
  | Readonly<{ ok: true; block: ProviderRuntimeContentBlock; event: ProviderFileUploadCacheEvent }>
  | Readonly<{ ok: false; code: string; message: string; retryable?: boolean }>

type VerifiedUploadBytes = Readonly<{
  ok: true
  bytes: Uint8Array
}>

export function createProviderFileUploadService(input: Readonly<{
  db: ProviderFileUploadCacheDb
  nowMs?: () => number
  sleepMs?: (ms: number) => Promise<void>
}>): ProviderFileUploadService {
  const now = input.nowMs ?? Date.now
  const sleep = input.sleepMs ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  async function resolveContentBlocks(
    request: ResolveProviderFileUploadBlocksInput
  ): Promise<ResolveProviderFileUploadBlocksResult> {
    const rawBlocks = request.blocks ?? []
    const blocks: ProviderRuntimeContentBlock[] = []
    const cacheEvents: ProviderFileUploadCacheEvent[] = []
    for (const block of rawBlocks) {
      if (!isProviderRuntimeUploadRequestBlock(block)) {
        blocks.push(block)
        continue
      }
      if (block.provider !== request.provider) {
        return { ok: false, code: 'provider_upload_mismatch', message: 'Provider file upload block did not match the selected provider.' }
      }
      const resolved = await resolveOneUpload({ ...request, block })
      if (!resolved.ok) return resolved
      blocks.push(resolved.block)
      cacheEvents.push(resolved.event)
    }
    return { ok: true, blocks, cacheEvents }
  }

  async function resolveOneUpload(inputForOne: ResolveProviderFileUploadBlocksInput & {
    block: ProviderRuntimeUploadRequestBlock
  }): Promise<ResolveOneUploadResult> {
    const verified = verifyUploadBytes(inputForOne.block)
    if (!verified.ok) return verified
    const normalizedBaseUrl = normalizeBaseUrl(inputForOne.baseUrl)
    const normalizedApiKey = inputForOne.apiKey.trim()
    if (!normalizedApiKey) {
      return { ok: false, code: 'credential_missing', message: 'Provider API key is not configured.' }
    }
    const key: CacheKey = {
      provider: inputForOne.provider,
      endpointFamily: normalizeToken(inputForOne.endpointFamily),
      normalizedBaseUrl,
      credentialFingerprint: credentialFingerprint({
        provider: inputForOne.provider,
        endpointFamily: normalizeToken(inputForOne.endpointFamily),
        normalizedBaseUrl,
        normalizedApiKey,
      }),
      assetId: inputForOne.block.assetId,
      revisionId: inputForOne.block.revisionId,
      blobSha256: inputForOne.block.blobSha256.toLowerCase(),
      mimeType: inputForOne.block.mimeType.toLowerCase(),
      sizeBytes: inputForOne.block.sizeBytes,
      assetKind: inputForOne.block.kind,
      uploadPurpose: uploadPurposeForProvider(inputForOne.provider),
    }
    const flightKey = stableFlightKey(key)
    const existing = inFlightUploads.get(flightKey)
    if (existing) return existing

    const promise = uploadWithCache({ ...inputForOne, key, normalizedBaseUrl, normalizedApiKey, uploadBytes: verified.bytes })
    inFlightUploads.set(flightKey, promise)
    try {
      return await promise
    } finally {
      inFlightUploads.delete(flightKey)
    }
  }

  async function uploadWithCache(inputForUpload: ResolveProviderFileUploadBlocksInput & {
    block: ProviderRuntimeUploadRequestBlock
    key: CacheKey
    normalizedBaseUrl: string
    normalizedApiKey: string
    uploadBytes: Uint8Array
  }): Promise<ResolveOneUploadResult> {
    const reusable = asCacheRecord(await input.db.call('providerFileCache.findReusable', {
      ...inputForUpload.key,
      nowMs: inputForUpload.nowMs ?? now(),
    }))
    if (reusable) return readyRecordToResult(inputForUpload.block, reusable, 'reused')

    const reserved = await input.db.call('providerFileCache.reserve', {
      ...inputForUpload.key,
      nowMs: inputForUpload.nowMs ?? now(),
    }) as any
    if (reserved?.status === 'ready' && asCacheRecord(reserved.record)) {
      return readyRecordToResult(inputForUpload.block, reserved.record, 'reused')
    }
    if (reserved?.status === 'conflict') {
      const waited = await waitForReady(inputForUpload.key)
      if (waited) return readyRecordToResult(inputForUpload.block, waited, 'reused')
      return {
        ok: false,
        code: 'upload_in_progress',
        message: 'Provider file upload is already in progress for this asset revision.',
        retryable: true,
      }
    }
    const record = asCacheRecord(reserved?.record)
    if (reserved?.status !== 'reserved' || !record) {
      return { ok: false, code: 'cache_reservation_failed', message: 'Provider file upload cache reservation failed safely.' }
    }

    const upload = await uploadToProvider(inputForUpload)
    if (!upload.ok) {
      await input.db.call('providerFileCache.markFailed', {
        id: record.id,
        errorCode: upload.code,
        errorMessage: upload.message,
        nowMs: inputForUpload.nowMs ?? now(),
      })
      return upload
    }

    const ready = asCacheRecord(await input.db.call('providerFileCache.markReady', {
      id: record.id,
      providerFileId: upload.providerFileId ?? null,
      providerFileUri: upload.providerFileUri ?? null,
      providerFileName: upload.providerFileName ?? null,
      expiresAtMs: upload.expiresAtMs ?? null,
      metadataJson: upload.metadataJson ?? null,
      nowMs: inputForUpload.nowMs ?? now(),
    }))
    if (!ready) return { ok: false, code: 'cache_ready_failed', message: 'Provider file upload cache ready state failed safely.' }
    return readyRecordToResult(inputForUpload.block, ready, 'uploaded')
  }

  async function waitForReady(key: CacheKey): Promise<CacheRecord | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sleep(200)
      const ready = asCacheRecord(await input.db.call('providerFileCache.findReusable', {
        ...key,
        nowMs: now(),
      }))
      if (ready) return ready
    }
    return null
  }

  async function invalidate(request: Readonly<{ cacheId: string; errorCode?: string; errorMessage?: string }>): Promise<void> {
    await input.db.call('providerFileCache.invalidate', {
      id: request.cacheId,
      errorCode: request.errorCode ?? 'manual_invalidate',
      errorMessage: request.errorMessage ?? 'Provider file cache entry was invalidated.',
      nowMs: now(),
    })
  }

  return { resolveContentBlocks, invalidate }
}

function readyRecordToResult(
  block: ProviderRuntimeUploadRequestBlock,
  record: CacheRecord,
  status: ProviderFileUploadCacheEvent['status'],
): ResolveOneUploadResult {
  const requestBlock = buildProviderReferenceBlock(block.provider, block, record)
  if (!requestBlock) {
    return { ok: false, code: 'provider_file_reference_invalid', message: 'Provider file upload reference was invalid.' }
  }
  return {
    ok: true,
    block: requestBlock,
    event: {
      cacheId: record.id,
      provider: block.provider,
      status,
      assetId: block.assetId,
      revisionId: block.revisionId,
      kind: block.kind,
    },
  }
}

function buildProviderReferenceBlock(
  provider: ProviderFileUploadProvider,
  block: ProviderRuntimeUploadRequestBlock,
  record: CacheRecord,
): ProviderRuntimeContentBlock | null {
  switch (provider) {
    case 'openai_responses':
      return record.providerFileId
        ? { type: 'input_file', file_id: record.providerFileId }
        : null
    case 'anthropic_messages':
      return record.providerFileId
        ? {
            type: block.kind === 'image' ? 'image' : 'document',
            source: { type: 'file', file_id: record.providerFileId },
            ...(block.kind === 'pdf' ? { title: block.filename } : {}),
          }
        : null
    case 'google_ai_studio':
      return record.providerFileUri
        ? { fileData: { mimeType: block.mimeType, fileUri: record.providerFileUri } }
        : null
  }
}

async function uploadToProvider(input: ResolveProviderFileUploadBlocksInput & {
  block: ProviderRuntimeUploadRequestBlock
  key: CacheKey
  normalizedBaseUrl: string
  normalizedApiKey: string
  uploadBytes: Uint8Array
}): Promise<ProviderUploadResult> {
  switch (input.provider) {
    case 'openai_responses':
      return uploadOpenAI(input)
    case 'anthropic_messages':
      return uploadAnthropic(input)
    case 'google_ai_studio':
      return uploadGemini(input)
  }
}

async function uploadOpenAI(input: ResolveProviderFileUploadBlocksInput & {
  block: ProviderRuntimeUploadRequestBlock
  normalizedBaseUrl: string
  normalizedApiKey: string
  uploadBytes: Uint8Array
}): Promise<ProviderUploadResult> {
  const multipart = buildMultipartFormData([
    { name: 'purpose', value: 'user_data' },
    {
      name: 'file',
      filename: input.block.filename,
      contentType: input.block.mimeType,
      bytes: input.uploadBytes,
    },
  ])
  const response = await input.fetchImpl(`${input.normalizedBaseUrl}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.normalizedApiKey}`,
      'Content-Type': multipart.contentType,
    },
    body: multipart.body,
    signal: input.signal,
    redirect: 'error',
  })
  if (!response.ok) return safeUploadHttpFailure('openai_upload_failed', response)
  const json = await safeJson(response)
  const id = typeof json?.id === 'string' ? json.id.trim() : ''
  if (!id) return { ok: false, code: 'openai_upload_response_invalid', message: 'OpenAI Files upload returned no file id.' }
  return { ok: true, providerFileId: id, metadataJson: { object: safeString(json?.object) } }
}

async function uploadAnthropic(input: ResolveProviderFileUploadBlocksInput & {
  block: ProviderRuntimeUploadRequestBlock
  normalizedBaseUrl: string
  normalizedApiKey: string
  uploadBytes: Uint8Array
}): Promise<ProviderUploadResult> {
  const multipart = buildMultipartFormData([
    {
      name: 'file',
      filename: input.block.filename,
      contentType: input.block.mimeType,
      bytes: input.uploadBytes,
    },
  ])
  const response = await input.fetchImpl(`${input.normalizedBaseUrl}/files`, {
    method: 'POST',
    headers: {
      'x-api-key': input.normalizedApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
      'Content-Type': multipart.contentType,
    },
    body: multipart.body,
    signal: input.signal,
    redirect: 'error',
  })
  if (!response.ok) return safeUploadHttpFailure('anthropic_upload_failed', response)
  const json = await safeJson(response)
  const id = typeof json?.id === 'string' ? json.id.trim() : ''
  if (!id) return { ok: false, code: 'anthropic_upload_response_invalid', message: 'Anthropic Files upload returned no file id.' }
  return { ok: true, providerFileId: id, metadataJson: { nonZdr: true, type: safeString(json?.type) } }
}

async function uploadGemini(input: ResolveProviderFileUploadBlocksInput & {
  block: ProviderRuntimeUploadRequestBlock
  normalizedBaseUrl: string
  normalizedApiKey: string
  uploadBytes: Uint8Array
}): Promise<ProviderUploadResult> {
  const start = await input.fetchImpl(`${input.normalizedBaseUrl}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': input.normalizedApiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(input.uploadBytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': input.block.mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: input.block.filename } }),
    signal: input.signal,
    redirect: 'error',
  })
  if (!start.ok) return safeUploadHttpFailure('gemini_upload_start_failed', start)
  const uploadUrl = start.headers.get('x-goog-upload-url')
  if (!uploadUrl) return { ok: false, code: 'gemini_upload_url_missing', message: 'Gemini Files upload did not return an upload URL.' }
  const finalize = await input.fetchImpl(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: toArrayBuffer(input.uploadBytes),
    signal: input.signal,
    redirect: 'error',
  })
  if (!finalize.ok) return safeUploadHttpFailure('gemini_upload_finalize_failed', finalize)
  const json = await safeJson(finalize)
  return finalizeGeminiFile(input, json?.file ?? json)
}

async function finalizeGeminiFile(input: ResolveProviderFileUploadBlocksInput & {
  normalizedBaseUrl: string
  normalizedApiKey: string
}, rawFile: unknown): Promise<ProviderUploadResult> {
  let file = rawFile && typeof rawFile === 'object' ? rawFile as Record<string, unknown> : {}
  const name = safeString(file.name)
  for (let attempt = 0; attempt < 10 && safeString(file.state) === 'PROCESSING'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (!name) break
    const response = await input.fetchImpl(`${input.normalizedBaseUrl}/v1beta/${name}`, {
      method: 'GET',
      headers: { 'x-goog-api-key': input.normalizedApiKey },
      signal: input.signal,
      redirect: 'error',
    })
    if (!response.ok) return safeUploadHttpFailure('gemini_file_poll_failed', response)
    const json = await safeJson(response)
    file = json?.file ?? json ?? {}
  }
  const state = safeString(file.state)
  if (state && state !== 'ACTIVE' && state !== 'SUCCEEDED') {
    return { ok: false, code: 'gemini_file_not_ready', message: 'Gemini Files upload did not become ready in time.', retryable: true }
  }
  const uri = safeString(file.uri)
  if (!uri) return { ok: false, code: 'gemini_upload_response_invalid', message: 'Gemini Files upload returned no file URI.' }
  return {
    ok: true,
    providerFileUri: uri,
    providerFileName: name || null,
    expiresAtMs: parseDateMs(file.expirationTime) ?? (input.nowMs ?? Date.now()) + 48 * 60 * 60 * 1000,
    metadataJson: { state: state || null },
  }
}

async function safeUploadHttpFailure(code: string, response: Response): Promise<ProviderUploadResult> {
  return {
    ok: false,
    code,
    message: `Provider file upload failed safely with HTTP ${response.status}.`,
    retryable: response.status >= 500,
  }
}

function asCacheRecord(value: unknown): CacheRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<CacheRecord>
  if (!record.id || record.status !== 'ready' && record.status !== 'uploading' && record.status !== 'failed' && record.status !== 'invalidated') {
    return null
  }
  return record as CacheRecord
}

async function safeJson(response: Response): Promise<any> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function credentialFingerprint(input: Readonly<{
  provider: string
  endpointFamily: string
  normalizedBaseUrl: string
  normalizedApiKey: string
}>): string {
  return createHash('sha256')
    .update(`${input.provider}\0${input.endpointFamily}\0${input.normalizedBaseUrl}\0${input.normalizedApiKey}`)
    .digest('hex')
}

function verifyUploadBytes(block: ProviderRuntimeUploadRequestBlock): VerifiedUploadBytes | Readonly<{ ok: false; code: string; message: string }> {
  const bytes = decodeBase64(block.dataBase64)
  if (bytes.byteLength !== block.sizeBytes) {
    return {
      ok: false,
      code: 'upload_payload_size_mismatch',
      message: 'Provider file upload payload did not match the managed file size.',
    }
  }
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== block.blobSha256.toLowerCase()) {
    return {
      ok: false,
      code: 'upload_payload_hash_mismatch',
      message: 'Provider file upload payload did not match the managed file revision.',
    }
  }
  return { ok: true, bytes }
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(String(value ?? '').trim())
  const pathname = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${pathname}`
}

function uploadPurposeForProvider(provider: ProviderFileUploadProvider): string {
  switch (provider) {
    case 'openai_responses':
      return 'user_data'
    case 'anthropic_messages':
      return 'messages'
    case 'google_ai_studio':
      return 'generate_content'
  }
}

function stableFlightKey(key: CacheKey): string {
  return JSON.stringify(key)
}

function normalizeToken(value: string): string {
  return String(value ?? '').trim()
}

function decodeBase64(value: string): Uint8Array {
  return Buffer.from(value, 'base64')
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function buildMultipartFormData(parts: ReadonlyArray<Readonly<{
  name: string
  value?: string
  filename?: string
  contentType?: string
  bytes?: Uint8Array
}>>): Readonly<{ contentType: string; byteLength: number; body: ArrayBuffer }> {
  const boundary = `----starverse-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const chunks: Buffer[] = []
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`, 'utf8'))
    const name = escapeHeaderValue(part.name)
    if (part.bytes) {
      chunks.push(Buffer.from(
        `Content-Disposition: form-data; name="${name}"; filename="${escapeHeaderValue(part.filename ?? 'attachment.bin')}"\r\n` +
        `Content-Type: ${part.contentType || 'application/octet-stream'}\r\n\r\n`,
        'utf8',
      ))
      chunks.push(Buffer.from(part.bytes))
      chunks.push(Buffer.from('\r\n', 'utf8'))
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n${part.value ?? ''}\r\n`, 'utf8'))
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
  const buffer = Buffer.concat(chunks)
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    byteLength: buffer.byteLength,
    body: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  }
}

function escapeHeaderValue(value: string): string {
  return String(value).replace(/[\r\n"]/g, '_')
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseDateMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

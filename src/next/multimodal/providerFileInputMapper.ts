import { readFile } from 'node:fs/promises'
import { inferFileProfile, normalizeExtension } from '@/shared/files/fileRules'
import { resolveManagedStoragePath } from '@/shared/files/localStorageResolver'
import type { AssetRevisionRecord, FileAssetRecord, FileBlobRecord } from '../../../infra/db/types'

export type ProviderFileInputProvider =
  | 'openai_responses'
  | 'anthropic_messages'
  | 'google_ai_studio'
  | 'openrouter'
  | 'generic_openai_compatible'
  | 'local_endpoint'
  | 'lm_studio'
  | 'ollama_local'

export type ProviderFileUploadInputProvider =
  | 'openai_responses'
  | 'anthropic_messages'
  | 'google_ai_studio'

export type ProviderFileInputRequestedProvider = ProviderFileInputProvider | 'deepseek' | string
export type ProviderFileInputKind = 'image' | 'pdf' | 'document'
export type ProviderFileInputSendMode = 'inline_base64' | 'url_ref'

export type ProviderFileInputErrorCode =
  | 'asset_not_ready'
  | 'unsupported_provider'
  | 'unsupported_mime'
  | 'too_large_for_inline'
  | 'url_not_allowed'

export type PreparedProviderFileInput =
  | Readonly<{
      ok: true
      provider: ProviderFileInputProvider | ProviderFileUploadInputProvider
      assetId: string
      revisionId: string
      mimeType: string
      sizeBytes: number
      kind: ProviderFileInputKind
      requestPart: unknown
    }>
  | Readonly<{
      ok: false
      provider: string
      code: ProviderFileInputErrorCode
      message: string
    }>

export type ProviderFileAssetMetadata = Readonly<{
  id: string
  filename: string
  extension?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  assetKind?: string | null
  sourceKind?: string | null
  storageBackend?: string | null
  ingestStatus?: string | null
  deletedAt?: number | null
  sourceMetaJson?: Record<string, unknown> | null
}>

export type ProviderFileRevisionMetadata = Readonly<{
  id: string
  assetId: string
  blobId: string
  parentRevisionId?: string | null
  cause?: string | null
  derivedFromAssetId?: string | null
}>

export type ProviderFileBlobMetadata = Readonly<{
  id: string
  sha256?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
}>

export type ProviderFileInputReadResult =
  | Readonly<{
      ok: true
      source: 'managed_bytes'
      asset: ProviderFileAssetMetadata
      revision: ProviderFileRevisionMetadata
      blob: ProviderFileBlobMetadata
      bytes: Uint8Array
    }>
  | Readonly<{
      ok: true
      source: 'provider_url'
      asset: ProviderFileAssetMetadata
      url: string
    }>
  | Readonly<{
      ok: false
      code: 'asset_not_ready'
      message: string
    }>

export type ProviderFileInputAssetReader = (
  assetId: string
) => ProviderFileInputReadResult | Promise<ProviderFileInputReadResult>

export type ProviderFileInputAssetReaderDeps = Readonly<{
  fileAssetRepo: Readonly<{
    getById: (id: string) => FileAssetRecord | null
  }>
  fileAssetStoreRepo: Readonly<{
    getCurrentRevision: (assetId: string) => AssetRevisionRecord | null
    getBlobById: (id: string) => FileBlobRecord | null
  }>
  storageRootDir: string
  readFileBytes?: (filePath: string) => Promise<Uint8Array>
}>

export type PrepareProviderFileInputInput = Readonly<{
  provider: ProviderFileInputRequestedProvider
  assetId: string
  sendMode?: ProviderFileInputSendMode
  readAsset: ProviderFileInputAssetReader
  maxInlineBytes?: number
}>

export type ProviderFileUploadRequestPart = Readonly<{
  type: 'starverse_provider_file_upload'
  provider: ProviderFileUploadInputProvider
  assetId: string
  revisionId: string
  blobSha256: string
  mimeType: string
  sizeBytes: number
  kind: 'image' | 'pdf'
  filename: string
  dataBase64: string
}>

export const DEFAULT_PROVIDER_FILE_INLINE_LIMIT_BYTES = 20 * 1024 * 1024
export const M1C_PDF_INLINE_LIMIT_BYTES = 1024 * 1024

const SUPPORTED_PROVIDERS: ReadonlySet<string> = new Set([
  'openai_responses',
  'anthropic_messages',
  'google_ai_studio',
  'openrouter',
  'generic_openai_compatible',
  'local_endpoint',
  'lm_studio',
  'ollama_local',
])

const UPLOAD_CAPABLE_PROVIDERS: ReadonlySet<string> = new Set([
  'openai_responses',
  'anthropic_messages',
  'google_ai_studio',
])

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const READY_INGEST_STATUSES = new Set(['stored', 'registered'])
const NOT_READY_INGEST_STATUSES = new Set([
  'pending',
  'probing',
  'materializing',
  'probe_failed',
  'materialization_failed',
  'failed',
  'deleted',
])

export async function prepareProviderFileInput(
  input: PrepareProviderFileInputInput
): Promise<PreparedProviderFileInput> {
  const provider = normalizeProvider(input.provider)
  if (provider === 'deepseek') {
    return unsupportedProvider(input.provider, 'DeepSeek official APIs are text-only for Starverse file input mapping.')
  }
  if (!isSupportedProvider(provider)) {
    return unsupportedProvider(input.provider, `Provider ${String(input.provider)} does not support file input mapping.`)
  }

  const read = await input.readAsset(input.assetId)
  if (!read.ok) {
    return {
      ok: false,
      provider,
      code: 'asset_not_ready',
      message: read.message,
    }
  }

  const readiness = assertAssetReady(read.asset)
  if (!readiness.ok) {
    return {
      ok: false,
      provider,
      code: 'asset_not_ready',
      message: readiness.message,
    }
  }

  if (read.source === 'provider_url') {
    return prepareProviderUrlInput({ provider, read, sendMode: input.sendMode })
  }

  return prepareManagedBytesInput({
    provider,
    read,
    sendMode: input.sendMode,
    maxInlineBytes: input.maxInlineBytes ?? DEFAULT_PROVIDER_FILE_INLINE_LIMIT_BYTES,
  })
}

export async function prepareProviderFileUploadInput(
  input: PrepareProviderFileInputInput
): Promise<PreparedProviderFileInput> {
  const provider = normalizeProvider(input.provider)
  if (provider === 'deepseek') {
    return unsupportedProvider(input.provider, 'DeepSeek official APIs are text-only for Starverse file input mapping.')
  }
  if (!isUploadCapableProvider(provider)) {
    return unsupportedProvider(input.provider, `Provider ${String(input.provider)} does not support provider file upload input.`)
  }

  const read = await input.readAsset(input.assetId)
  if (!read.ok) {
    return {
      ok: false,
      provider,
      code: 'asset_not_ready',
      message: read.message,
    }
  }

  const readiness = assertAssetReady(read.asset)
  if (!readiness.ok) {
    return {
      ok: false,
      provider,
      code: 'asset_not_ready',
      message: readiness.message,
    }
  }

  if (read.source === 'provider_url') {
    return prepareProviderUrlInput({ provider, read, sendMode: input.sendMode })
  }

  return prepareManagedBytesUploadInput({
    provider,
    read,
    sendMode: input.sendMode,
  })
}

export function createProviderFileInputAssetReader(
  deps: ProviderFileInputAssetReaderDeps
): ProviderFileInputAssetReader {
  return async (assetId: string): Promise<ProviderFileInputReadResult> => {
    const asset = deps.fileAssetRepo.getById(assetId)
    if (!asset) {
      return {
        ok: false,
        code: 'asset_not_ready',
        message: `Asset ${assetId} was not found.`,
      }
    }

    const assetMeta = mapAssetRecord(asset)
    const readiness = assertAssetReady(assetMeta)
    if (!readiness.ok) {
      return { ok: false, code: 'asset_not_ready', message: readiness.message }
    }

    if (readUrlRetentionMode(assetMeta) === 'link_only' && asset.storageBackend === 'remote_url') {
      const url = resolveProviderUrl(assetMeta, asset.storageUri)
      if (!url) {
        return {
          ok: false,
          code: 'asset_not_ready',
          message: `Asset ${asset.id} has no safe provider URL.`,
        }
      }
      return { ok: true, source: 'provider_url', asset: assetMeta, url }
    }

    const revision = deps.fileAssetStoreRepo.getCurrentRevision(asset.id)
    if (!revision) {
      return {
        ok: false,
        code: 'asset_not_ready',
        message: `Asset ${asset.id} has no current file revision.`,
      }
    }

    const blob = deps.fileAssetStoreRepo.getBlobById(revision.blobId)
    if (!blob) {
      return {
        ok: false,
        code: 'asset_not_ready',
        message: `Asset ${asset.id} current revision blob is missing.`,
      }
    }

    const resolved = resolveManagedStoragePath(deps.storageRootDir, blob.storageUri, {
      backend: blob.storageBackend,
      deletedAt: asset.deletedAt,
    })
    if (resolved.kind !== 'ok') {
      return {
        ok: false,
        code: 'asset_not_ready',
        message: resolved.kind === 'missing'
          ? `Asset ${asset.id} has no managed local bytes.`
          : resolved.message,
      }
    }

    let bytes: Uint8Array
    try {
      bytes = await (deps.readFileBytes ?? defaultReadFileBytes)(resolved.path)
    } catch {
      return {
        ok: false,
        code: 'asset_not_ready',
        message: `Asset ${asset.id} managed bytes could not be read.`,
      }
    }

    return {
      ok: true,
      source: 'managed_bytes',
      asset: assetMeta,
      revision: mapRevisionRecord(revision),
      blob: mapBlobRecord(blob),
      bytes,
    }
  }
}

function prepareManagedBytesInput(input: Readonly<{
  provider: ProviderFileInputProvider
  read: Extract<ProviderFileInputReadResult, { source: 'managed_bytes' }>
  sendMode: ProviderFileInputSendMode | undefined
  maxInlineBytes: number
}>): PreparedProviderFileInput {
  const { provider, read, sendMode, maxInlineBytes } = input
  const retentionMode = readUrlRetentionMode(read.asset)
  if (sendMode === 'url_ref' && retentionMode !== 'link_and_file') {
    return {
      ok: false,
      provider,
      code: 'url_not_allowed',
      message: `Asset ${read.asset.id} has no provider URL send mode for ${provider}.`,
    }
  }

  const classified = classifyProviderFileInput(read.asset, read.blob)
  if (!classified.ok) return { ok: false, provider, code: 'unsupported_mime', message: classified.message }
  if (!supportsProviderInlineKind(provider, classified.kind)) {
    return {
      ok: false,
      provider,
      code: 'unsupported_mime',
      message: `Provider ${provider} does not support ${classified.kind} inline file input.`,
    }
  }

  const effectiveMaxInlineBytes = classified.kind === 'pdf'
    ? Math.min(maxInlineBytes, M1C_PDF_INLINE_LIMIT_BYTES)
    : maxInlineBytes
  const sizeBytes = read.blob.sizeBytes ?? read.asset.sizeBytes ?? read.bytes.byteLength
  if (sizeBytes > effectiveMaxInlineBytes || read.bytes.byteLength > effectiveMaxInlineBytes) {
    return {
      ok: false,
      provider,
      code: 'too_large_for_inline',
      message: `Asset ${read.asset.id} is too large for inline ${provider} file input.`,
    }
  }

  const base64 = encodeBase64(read.bytes)
  const dataUrl = `data:${classified.mimeType};base64,${base64}`

  return {
    ok: true,
    provider,
    assetId: read.asset.id,
    revisionId: read.revision.id,
    mimeType: classified.mimeType,
    sizeBytes,
    kind: classified.kind,
    requestPart: buildInlineRequestPart({
      provider,
      kind: classified.kind,
      mimeType: classified.mimeType,
      filename: sanitizeFilename(read.asset.filename),
      base64,
      dataUrl,
    }),
  }
}

function prepareManagedBytesUploadInput(input: Readonly<{
  provider: ProviderFileUploadInputProvider
  read: Extract<ProviderFileInputReadResult, { source: 'managed_bytes' }>
  sendMode: ProviderFileInputSendMode | undefined
}>): PreparedProviderFileInput {
  const { provider, read, sendMode } = input
  const retentionMode = readUrlRetentionMode(read.asset)
  if (sendMode === 'url_ref' && retentionMode !== 'link_and_file') {
    return {
      ok: false,
      provider,
      code: 'url_not_allowed',
      message: `Asset ${read.asset.id} has no provider URL send mode for ${provider}.`,
    }
  }

  const classified = classifyProviderFileInput(read.asset, read.blob)
  if (!classified.ok) return { ok: false, provider, code: 'unsupported_mime', message: classified.message }
  if (classified.kind !== 'image' && classified.kind !== 'pdf') {
    return {
      ok: false,
      provider,
      code: 'unsupported_mime',
      message: `Provider file upload does not support ${classified.kind} assets in this runtime slice.`,
    }
  }

  const blobSha256 = normalizeSha256(read.blob.sha256)
  if (!blobSha256) {
    return {
      ok: false,
      provider,
      code: 'asset_not_ready',
      message: `Asset ${read.asset.id} current revision has no blob sha256 for provider file upload.`,
    }
  }

  const sizeBytes = read.blob.sizeBytes ?? read.asset.sizeBytes ?? read.bytes.byteLength
  const base64 = encodeBase64(read.bytes)

  return {
    ok: true,
    provider,
    assetId: read.asset.id,
    revisionId: read.revision.id,
    mimeType: classified.mimeType,
    sizeBytes,
    kind: classified.kind,
    requestPart: {
      type: 'starverse_provider_file_upload',
      provider,
      assetId: read.asset.id,
      revisionId: read.revision.id,
      blobSha256,
      mimeType: classified.mimeType,
      sizeBytes,
      kind: classified.kind,
      filename: sanitizeFilename(read.asset.filename),
      dataBase64: base64,
    } satisfies ProviderFileUploadRequestPart,
  }
}

function prepareProviderUrlInput(input: Readonly<{
  provider: ProviderFileInputProvider
  read: Extract<ProviderFileInputReadResult, { source: 'provider_url' }>
  sendMode: ProviderFileInputSendMode | undefined
}>): PreparedProviderFileInput {
  const { provider, read, sendMode } = input
  const retentionMode = readUrlRetentionMode(read.asset)
  if (retentionMode !== 'link_only') {
    return {
      ok: false,
      provider,
      code: 'asset_not_ready',
      message: `Asset ${read.asset.id} is not a ready link-only URL input; link_and_file assets require a local snapshot.`,
    }
  }
  if (sendMode === 'inline_base64') {
    return {
      ok: false,
      provider,
      code: 'url_not_allowed',
      message: `Asset ${read.asset.id} is link-only and has no managed bytes for inline ${provider} input.`,
    }
  }

  const classified = classifyProviderFileInput(read.asset, null)
  if (!classified.ok) return { ok: false, provider, code: 'unsupported_mime', message: classified.message }

  const url = normalizeProviderUrlForKind(read.url, classified.kind)
  if (!url || !supportsProviderUrl(provider, classified.kind)) {
    return {
      ok: false,
      provider,
      code: 'url_not_allowed',
      message: `Provider ${provider} does not allow direct URL input for ${classified.kind} assets.`,
    }
  }

  return {
    ok: true,
    provider,
    assetId: read.asset.id,
    revisionId: 'link_only',
    mimeType: classified.mimeType,
    sizeBytes: read.asset.sizeBytes ?? 0,
    kind: classified.kind,
    requestPart: buildUrlRequestPart({
      provider,
      kind: classified.kind,
      mimeType: classified.mimeType,
      filename: sanitizeFilename(read.asset.filename),
      url,
    }),
  }
}

function buildInlineRequestPart(input: Readonly<{
  provider: ProviderFileInputProvider
  kind: ProviderFileInputKind
  mimeType: string
  filename: string
  base64: string
  dataUrl: string
}>): unknown {
  switch (input.provider) {
    case 'openai_responses':
      return input.kind === 'image'
        ? { type: 'input_image', image_url: input.dataUrl }
        : { type: 'input_file', filename: input.filename, file_data: input.dataUrl }
    case 'anthropic_messages':
      return input.kind === 'image'
        ? { type: 'image', source: { type: 'base64', media_type: input.mimeType, data: input.base64 } }
        : { type: 'document', source: { type: 'base64', media_type: input.mimeType, data: input.base64 }, title: input.filename }
    case 'google_ai_studio':
      return { inlineData: { mimeType: input.mimeType, data: input.base64 } }
    case 'openrouter':
      return input.kind === 'image'
        ? { type: 'image_url', image_url: { url: input.dataUrl } }
        : { type: 'file', file: { filename: input.filename, file_data: input.dataUrl } }
    case 'generic_openai_compatible':
    case 'local_endpoint':
    case 'lm_studio':
    case 'ollama_local':
      return { type: 'image_url', image_url: { url: input.dataUrl } }
  }
}

function buildUrlRequestPart(input: Readonly<{
  provider: ProviderFileInputProvider
  kind: ProviderFileInputKind
  mimeType: string
  filename: string
  url: string
}>): unknown {
  switch (input.provider) {
    case 'openai_responses':
      return input.kind === 'image'
        ? { type: 'input_image', image_url: input.url }
        : { type: 'input_file', filename: input.filename, file_url: input.url }
    case 'anthropic_messages':
      return input.kind === 'image'
        ? { type: 'image', source: { type: 'url', url: input.url } }
        : { type: 'document', source: { type: 'url', url: input.url }, title: input.filename }
    case 'google_ai_studio':
      return { fileData: { mimeType: input.mimeType, fileUri: input.url } }
    case 'openrouter':
      return input.kind === 'image'
        ? { type: 'image_url', image_url: { url: input.url } }
        : { type: 'file', file: { filename: input.filename, file_data: input.url } }
    case 'generic_openai_compatible':
    case 'local_endpoint':
    case 'lm_studio':
    case 'ollama_local':
      return { type: 'image_url', image_url: { url: input.url } }
  }
}

function classifyProviderFileInput(
  asset: ProviderFileAssetMetadata,
  blob: ProviderFileBlobMetadata | null
): Readonly<{ ok: true; kind: ProviderFileInputKind; mimeType: string } | { ok: false; message: string }> {
  const mimeType = normalizeMimeType(blob?.mimeType ?? asset.mimeType) ?? mimeFromExtension(asset.extension)
  if (!mimeType) {
    return { ok: false, message: `Asset ${asset.id} has no supported MIME type.` }
  }

  const profile = inferFileProfile({
    filename: asset.filename,
    extension: asset.extension,
    mimeType,
  })

  if (profile.aiPayloadKind === 'image' && IMAGE_MIME_TYPES.has(mimeType)) {
    return { ok: true, kind: 'image', mimeType }
  }

  if (mimeType === 'application/pdf' || normalizeExtension(asset.extension) === 'pdf') {
    if (mimeType !== 'application/pdf') {
      return { ok: false, message: `Asset ${asset.id} has conflicting PDF metadata.` }
    }
    return { ok: true, kind: 'pdf', mimeType }
  }

  if (profile.assetKind === 'document' || profile.assetKind === 'text') {
    return { ok: true, kind: 'document', mimeType }
  }

  return { ok: false, message: `Asset ${asset.id} MIME type ${mimeType} is not supported for provider file input.` }
}

function assertAssetReady(
  asset: ProviderFileAssetMetadata
): Readonly<{ ok: true } | { ok: false; message: string }> {
  if (asset.deletedAt != null) {
    return { ok: false, message: `Asset ${asset.id} is deleted and cannot be sent.` }
  }
  const status = normalizeToken(asset.ingestStatus)
  if (status && NOT_READY_INGEST_STATUSES.has(status)) {
    return { ok: false, message: `Asset ${asset.id} is not ready for provider file input (${status}).` }
  }
  if (status && !READY_INGEST_STATUSES.has(status)) {
    return { ok: false, message: `Asset ${asset.id} has unsupported ingest status ${status}.` }
  }
  return { ok: true }
}

function supportsProviderUrl(provider: ProviderFileInputProvider, kind: ProviderFileInputKind): boolean {
  if (kind === 'image') return true
  if (provider === 'generic_openai_compatible' || provider === 'local_endpoint' || provider === 'lm_studio' || provider === 'ollama_local') {
    return false
  }
  if (kind === 'pdf') return true
  return provider === 'openai_responses' || provider === 'anthropic_messages' || provider === 'google_ai_studio'
}

function supportsProviderInlineKind(provider: ProviderFileInputProvider, kind: ProviderFileInputKind): boolean {
  if (provider === 'generic_openai_compatible' || provider === 'local_endpoint' || provider === 'lm_studio' || provider === 'ollama_local') {
    return kind === 'image'
  }
  if (kind === 'image' || kind === 'pdf') return true
  return provider !== 'openrouter'
}

function readUrlRetentionMode(asset: ProviderFileAssetMetadata): 'link_only' | 'link_and_file' | null {
  const mode = normalizeToken(asset.sourceMetaJson?.retentionMode)
  if (mode === 'link_only' || mode === 'link_and_file') return mode
  if (asset.sourceKind === 'url_import' && asset.storageBackend === 'remote_url') return 'link_only'
  if (asset.sourceKind === 'url_import') return 'link_and_file'
  return null
}

function resolveProviderUrl(asset: ProviderFileAssetMetadata, storageUri: string | null | undefined): string | null {
  for (const candidate of [
    asset.sourceMetaJson?.resolvedUrl,
    asset.sourceMetaJson?.originalUrl,
    storageUri,
  ]) {
    if (typeof candidate !== 'string') continue
    const url = normalizeHttpUrl(candidate)
    if (url) return url
  }
  return null
}

function mapAssetRecord(asset: FileAssetRecord): ProviderFileAssetMetadata {
  return {
    id: asset.id,
    filename: asset.filename,
    extension: asset.extension,
    mimeType: asset.mime,
    sizeBytes: asset.sizeBytes,
    assetKind: asset.assetKind,
    sourceKind: asset.sourceKind,
    storageBackend: asset.storageBackend,
    ingestStatus: asset.ingestStatus,
    deletedAt: asset.deletedAt,
    sourceMetaJson: asset.sourceMetaJson,
  }
}

function mapRevisionRecord(revision: AssetRevisionRecord): ProviderFileRevisionMetadata {
  return {
    id: revision.id,
    assetId: revision.assetId,
    blobId: revision.blobId,
    parentRevisionId: revision.parentRevisionId,
    cause: revision.cause,
    derivedFromAssetId: revision.derivedFromAssetId,
  }
}

function mapBlobRecord(blob: FileBlobRecord): ProviderFileBlobMetadata {
  return {
    id: blob.id,
    sha256: blob.sha256,
    mimeType: blob.mime,
    sizeBytes: blob.sizeBytes,
  }
}

function normalizeProvider(provider: ProviderFileInputRequestedProvider): string {
  return String(provider ?? '').trim().toLowerCase()
}

function isSupportedProvider(provider: string): provider is ProviderFileInputProvider {
  return SUPPORTED_PROVIDERS.has(provider)
}

function isUploadCapableProvider(provider: string): provider is ProviderFileUploadInputProvider {
  return UPLOAD_CAPABLE_PROVIDERS.has(provider)
}

function unsupportedProvider(provider: ProviderFileInputRequestedProvider, message: string): PreparedProviderFileInput {
  return {
    ok: false,
    provider: String(provider ?? ''),
    code: 'unsupported_provider',
    message,
  }
}

function normalizeMimeType(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return normalized || null
}

function normalizeSha256(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null
}

function mimeFromExtension(extension: string | null | undefined): string | null {
  switch (normalizeExtension(extension)) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'pdf':
      return 'application/pdf'
    case 'txt':
      return 'text/plain'
    case 'md':
      return 'text/markdown'
    case 'html':
    case 'htm':
      return 'text/html'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    default:
      return null
  }
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function normalizeHttpUrl(value: string): string | null {
  return normalizeHttpUrlWithPolicy(value, { rejectQueryHash: false })
}

function normalizeProviderUrlForKind(value: string, kind: ProviderFileInputKind): string | null {
  return normalizeHttpUrlWithPolicy(value, { rejectQueryHash: kind === 'pdf' })
}

function normalizeHttpUrlWithPolicy(value: string, options: Readonly<{ rejectQueryHash: boolean }>): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    if (options.rejectQueryHash && (url.search || url.hash)) return null
    return url.toString()
  } catch {
    return null
  }
}

function normalizeToken(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized || null
}

function sanitizeFilename(value: string): string {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || 'attachment'
}

async function defaultReadFileBytes(filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(filePath))
}

import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AiPayloadKind, AssetKind, ProcessingStatus, SourceKind } from '../../src/shared/files/fileTypes'
import { inferFileProfile, normalizeExtension } from '../../src/shared/files/fileRules'
import type { CreateFileAssetInput, FileAssetRecord, FileIngestStatus, JsonObject } from '../db/types'
import type { FileAssetRepo } from '../db/repo/fileAssetRepo'
import {
  getOriginalAssetPath,
  getOriginalAssetStorageUri,
  LOCAL_FILE_STORAGE_BACKEND,
} from './fileStoragePaths'
import { probeUrl, type FetchLike, type UrlProbeResult, type UrlProbeStatus } from './urlProbe'

export type UrlRetentionMode = 'link_only' | 'link_and_file'
export type MaterializationStatus = 'not_requested' | 'materializing' | 'stored' | 'materialization_failed'
export type FileImportStatus =
  | 'pending'
  | 'probing'
  | 'materializing'
  | 'ready'
  | 'failed'
  | 'probe_failed'
  | 'materialization_failed'

export type FileIngestionWarning = Readonly<{
  code: string
  message: string
}>

export type SendEligibilityHints = Readonly<{
  canUseUrlRef: boolean
  canUseLocalFile: boolean
  canUseInlinePayload: boolean
  urlReferenceMayStillBeUsable: boolean
  notes: string[]
}>

export type FileIngestionResult = Readonly<{
  success: boolean
  sourceKind: SourceKind
  assetId: string | null
  normalizedExtension: string | null
  assetKind: AssetKind
  aiPayloadKind: AiPayloadKind
  processingStatus: ProcessingStatus
  isNativeSupportedForMvp: boolean
  isConvertibleCandidate: boolean
  importStatus: FileImportStatus
  sendEligibilityHints: SendEligibilityHints
  warnings: FileIngestionWarning[]
  failureReasonCode: string | null
  retentionMode?: UrlRetentionMode
  probeStatus?: UrlProbeStatus
  materializationStatus?: MaterializationStatus
  originalUrl?: string
  resolvedUrl?: string
}>

export type IngestLocalFileInput = Readonly<{
  filePath: string
  mimeType?: string | null
  sourceKind?: Extract<SourceKind, 'local_upload' | 'generated'>
}>

export type IngestUrlInput = Readonly<{
  url: string
  retentionMode: UrlRetentionMode
}>

export type FileIngestionServiceDeps = Readonly<{
  fileAssetRepo: Pick<FileAssetRepo, 'create'>
  storageRootDir: string
  fetch?: FetchLike
  idFactory?: () => string
  now?: () => number
  maxRemoteBytes?: number
  copyLocalFileAtomically?: (sourcePath: string, targetPath: string) => Promise<void>
  writeBufferAtomically?: (targetPath: string, bytes: Uint8Array) => Promise<void>
}>

type FinalizeAssetInput = Readonly<{
  id: string
  sha256: string | null
  filename: string
  extension: string | null
  mime: string | null
  sizeBytes: number
  sourceKind: SourceKind
  storageBackend: CreateFileAssetInput['storageBackend']
  storageUri: string
  ingestStatus: FileIngestStatus
  sourceMetaJson: JsonObject | null
  profileInputFilename?: string | null
}>

type UrlMaterializationInput = Readonly<{
  filename: string
  extension: string | null
  mime: string | null
  retentionMode: UrlRetentionMode
  warnings: FileIngestionWarning[]
  profile: ReturnType<typeof inferFileProfile>
}>

const DEFAULT_MAX_REMOTE_BYTES = 50 * 1024 * 1024

export class FileIngestionService {
  private readonly idFactory: () => string
  private readonly now: () => number
  private readonly maxRemoteBytes: number
  private readonly copyLocalFileAtomically: (sourcePath: string, targetPath: string) => Promise<void>
  private readonly writeBufferAtomically: (targetPath: string, bytes: Uint8Array) => Promise<void>

  constructor(private readonly deps: FileIngestionServiceDeps) {
    this.idFactory = deps.idFactory ?? randomUUID
    this.now = deps.now ?? Date.now
    this.maxRemoteBytes = deps.maxRemoteBytes ?? DEFAULT_MAX_REMOTE_BYTES
    this.copyLocalFileAtomically = deps.copyLocalFileAtomically ?? copyFileAtomically
    this.writeBufferAtomically = deps.writeBufferAtomically ?? writeBufferAtomically
  }

  async ingestLocalFile(input: IngestLocalFileInput): Promise<FileIngestionResult> {
    const sourcePath = String(input.filePath ?? '').trim()
    if (!sourcePath) return failedLocalResult('local_path_missing', [])

    let fileStats: Awaited<ReturnType<typeof stat>>
    try {
      fileStats = await stat(sourcePath)
    } catch {
      return failedLocalResult('local_read_failed', [
        warning('local_read_failed', 'Local file metadata could not be read.'),
      ])
    }
    if (!fileStats.isFile()) {
      return failedLocalResult('local_not_file', [
        warning('local_not_file', 'Local input is not a regular file.'),
      ])
    }

    const filename = path.basename(sourcePath)
    const extension = normalizeExtension(filename)
    const mime = normalizeMime(input.mimeType) ?? mimeFromExtension(extension)
    const profile = inferFileProfile({ filename, extension, mimeType: mime })
    const warnings = localMetadataWarnings(profile.hasConflictingSignals)
    const assetId = this.idFactory()
    const storageUri = getOriginalAssetStorageUri({ assetId, extension: profile.extension ?? extension })
    const targetPath = getOriginalAssetPath({
      rootDir: this.deps.storageRootDir,
      assetId,
      extension: profile.extension ?? extension,
    })

    let sha256: string
    try {
      sha256 = await hashFile(sourcePath)
      await this.copyLocalFileAtomically(sourcePath, targetPath)
    } catch {
      return resultFromProfile({
        success: false,
        sourceKind: input.sourceKind ?? 'local_upload',
        assetId: null,
        profile,
        importStatus: 'failed',
        sendEligibilityHints: localHints(false),
        warnings: [...warnings, warning('local_materialization_failed', 'Local file could not be copied into asset storage.')],
        failureReasonCode: 'local_materialization_failed',
      })
    }

    try {
      const asset = this.createStoredLocalAsset({
        assetId,
        sha256,
        filename,
        extension: profile.extension ?? extension,
        mime,
        sizeBytes: fileStats.size,
        sourceKind: input.sourceKind ?? 'local_upload',
        storageUri,
      })
      return resultFromProfile({
        success: true,
        sourceKind: asset.sourceKind,
        assetId: asset.id,
        profile,
        importStatus: 'ready',
        sendEligibilityHints: localHints(true),
        warnings,
        failureReasonCode: null,
      })
    } catch (error) {
      await rm(targetPath, { force: true })
      return resultFromProfile({
        success: false,
        sourceKind: input.sourceKind ?? 'local_upload',
        assetId: null,
        profile,
        importStatus: 'failed',
        sendEligibilityHints: localHints(false),
        warnings: [...warnings, warning('asset_record_failed', String((error as Error)?.message ?? error))],
        failureReasonCode: 'asset_record_failed',
      })
    }
  }

  async ingestUrl(input: IngestUrlInput): Promise<FileIngestionResult> {
    const originalUrl = String(input.url ?? '').trim()
    const parsedUrl = parseHttpUrl(originalUrl)
    if (!parsedUrl.ok) {
      return resultFromProfile({
        success: false,
        sourceKind: 'url_import',
        assetId: null,
        profile: inferFileProfile({ filename: originalUrl }),
        importStatus: 'failed',
        sendEligibilityHints: urlHints(false, false),
        warnings: [warning(parsedUrl.code, parsedUrl.message)],
        failureReasonCode: parsedUrl.code,
        retentionMode: input.retentionMode,
        probeStatus: 'rejected',
        materializationStatus: 'not_requested',
        originalUrl,
        resolvedUrl: originalUrl,
      })
    }

    const probe = await probeUrl(parsedUrl.url, {
      fetch: this.deps.fetch,
      now: this.now,
    })
    const probeWarnings = buildProbeWarnings(probe)
    const extension = normalizeExtension(urlPathname(probe.resolvedUrl || probe.originalUrl))
    const filename = filenameFromUrl(probe.resolvedUrl || probe.originalUrl)
    const profile = inferFileProfile({ filename, extension, mimeType: probe.contentType })
    const warnings = [
      ...probeWarnings,
      ...(profile.hasConflictingSignals
        ? [warning('metadata_conflict', 'URL MIME and URL suffix classify to different file payloads.')]
        : []),
    ]

    if (input.retentionMode === 'link_only') {
      return this.createUrlLinkAsset({
        retentionMode: input.retentionMode,
        probe,
        profileInput: { filename, extension, mime: probe.contentType },
        profile,
        importStatus: probe.probeStatus === 'accessible' ? 'ready' : 'probe_failed',
        materializationStatus: 'not_requested',
        warnings,
      })
    }

    if (probe.probeStatus !== 'accessible') {
      return this.createUrlLinkAsset({
        retentionMode: input.retentionMode,
        probe,
        profileInput: { filename, extension, mime: probe.contentType },
        profile,
        importStatus: 'probe_failed',
        materializationStatus: 'not_requested',
        warnings,
      })
    }

    const downloaded = await this.downloadUrlToAsset(probe, {
      filename,
      extension: profile.extension ?? extension,
      mime: probe.contentType,
      retentionMode: input.retentionMode,
      warnings,
      profile,
    })
    return downloaded
  }

  finalizeIngestedAsset(input: FinalizeAssetInput): FileAssetRecord {
    const profile = inferFileProfile({
      filename: input.profileInputFilename ?? input.filename,
      extension: input.extension,
      mimeType: input.mime,
    })
    return this.deps.fileAssetRepo.create({
      id: input.id,
      sha256: input.sha256,
      filename: input.filename,
      extension: profile.extension ?? input.extension,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      assetKind: profile.assetKind,
      sourceKind: input.sourceKind,
      storageBackend: input.storageBackend,
      storageUri: input.storageUri,
      ingestStatus: input.ingestStatus,
      previewStatus: 'not_requested',
      sourceMetaJson: input.sourceMetaJson,
      createdAt: this.now(),
      updatedAt: this.now(),
    })
  }

  private createStoredLocalAsset(input: Readonly<{
    assetId: string
    sha256: string
    filename: string
    extension: string | null
    mime: string | null
    sizeBytes: number
    sourceKind: Extract<SourceKind, 'local_upload' | 'generated'>
    storageUri: string
  }>): FileAssetRecord {
    return this.finalizeIngestedAsset({
      id: input.assetId,
      sha256: input.sha256,
      filename: input.filename,
      extension: input.extension,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      sourceKind: input.sourceKind,
      storageBackend: LOCAL_FILE_STORAGE_BACKEND,
      storageUri: input.storageUri,
      ingestStatus: 'stored',
      sourceMetaJson: {
        importStatus: 'ready',
        materializationStatus: 'stored',
      },
    })
  }

  private async createUrlLinkAsset(input: Readonly<{
    retentionMode: UrlRetentionMode
    probe: UrlProbeResult
    profileInput: Readonly<{ filename: string; extension: string | null; mime: string | null }>
    profile: ReturnType<typeof inferFileProfile>
    importStatus: FileImportStatus
    materializationStatus: MaterializationStatus
    warnings: FileIngestionWarning[]
  }>): Promise<FileIngestionResult> {
    const assetId = this.idFactory()
    const meta = urlSourceMeta({
      probe: input.probe,
      retentionMode: input.retentionMode,
      importStatus: input.importStatus,
      materializationStatus: input.materializationStatus,
    })
    try {
      const asset = this.finalizeIngestedAsset({
        id: assetId,
        sha256: null,
        filename: input.profileInput.filename,
        extension: input.profile.extension ?? input.profileInput.extension,
        mime: input.profileInput.mime,
        sizeBytes: input.probe.contentLength ?? 0,
        sourceKind: 'url_import',
        storageBackend: 'remote_url',
        storageUri: input.probe.resolvedUrl || input.probe.originalUrl,
        ingestStatus: ingestStatusForUrlLink(input.importStatus),
        sourceMetaJson: meta,
      })
      return resultFromProfile({
        success: true,
        sourceKind: 'url_import',
        assetId: asset.id,
        profile: input.profile,
        importStatus: input.importStatus,
        sendEligibilityHints: urlHints(true, false),
        warnings: input.warnings,
        failureReasonCode: null,
        retentionMode: input.retentionMode,
        probeStatus: input.probe.probeStatus,
        materializationStatus: input.materializationStatus,
        originalUrl: input.probe.originalUrl,
        resolvedUrl: input.probe.resolvedUrl,
      })
    } catch (error) {
      return resultFromProfile({
        success: false,
        sourceKind: 'url_import',
        assetId: null,
        profile: input.profile,
        importStatus: 'failed',
        sendEligibilityHints: urlHints(true, false),
        warnings: [...input.warnings, warning('asset_record_failed', String((error as Error)?.message ?? error))],
        failureReasonCode: 'asset_record_failed',
        retentionMode: input.retentionMode,
        probeStatus: input.probe.probeStatus,
        materializationStatus: input.materializationStatus,
        originalUrl: input.probe.originalUrl,
        resolvedUrl: input.probe.resolvedUrl,
      })
    }
  }

  private async downloadUrlToAsset(
    probe: UrlProbeResult,
    input: UrlMaterializationInput
  ): Promise<FileIngestionResult> {
    let bytes: Uint8Array
    try {
      bytes = await this.downloadRemoteBytes(probe.resolvedUrl)
    } catch {
      return this.createUrlMaterializationFailureResult(probe, input)
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const assetId = this.idFactory()
    const storageUri = getOriginalAssetStorageUri({ assetId, extension: input.extension })
    const targetPath = getOriginalAssetPath({
      rootDir: this.deps.storageRootDir,
      assetId,
      extension: input.extension,
    })
    try {
      await this.writeBufferAtomically(targetPath, bytes)
      const asset = this.finalizeIngestedAsset({
        id: assetId,
        sha256,
        filename: input.filename,
        extension: input.extension,
        mime: input.mime,
        sizeBytes: bytes.byteLength,
        sourceKind: 'url_import',
        storageBackend: LOCAL_FILE_STORAGE_BACKEND,
        storageUri,
        ingestStatus: 'stored',
        sourceMetaJson: urlSourceMeta({
          probe,
          retentionMode: input.retentionMode,
          importStatus: 'ready',
          materializationStatus: 'stored',
        }),
      })
      return resultFromProfile({
        success: true,
        sourceKind: 'url_import',
        assetId: asset.id,
        profile: input.profile,
        importStatus: 'ready',
        sendEligibilityHints: urlHints(true, true),
        warnings: input.warnings,
        failureReasonCode: null,
        retentionMode: input.retentionMode,
        probeStatus: probe.probeStatus,
        materializationStatus: 'stored',
        originalUrl: probe.originalUrl,
        resolvedUrl: probe.resolvedUrl,
      })
    } catch {
      await rm(targetPath, { force: true })
      return this.createUrlMaterializationFailureResult(probe, input)
    }
  }

  private async downloadRemoteBytes(url: string): Promise<Uint8Array> {
    const fetchImpl = this.deps.fetch ?? globalThis.fetch
    if (!fetchImpl) throw new Error('fetch_unavailable')
    const response = await fetchImpl(url, { method: 'GET', redirect: 'follow' })
    if (!response.ok) throw new Error(`http_status_${response.status}`)
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength > this.maxRemoteBytes) throw new Error('remote_file_too_large')
    return buffer
  }

  private createUrlMaterializationFailureResult(
    probe: UrlProbeResult,
    input: UrlMaterializationInput
  ): Promise<FileIngestionResult> {
    return this.createUrlLinkAsset({
      retentionMode: input.retentionMode,
      probe,
      profileInput: { filename: input.filename, extension: input.extension, mime: input.mime },
      profile: input.profile,
      importStatus: 'materialization_failed',
      materializationStatus: 'materialization_failed',
      warnings: [
        ...input.warnings,
        warning('url_materialization_failed', 'Remote file could not be saved locally; URL reference remains retained.'),
      ],
    })
  }
}

async function copyFileAtomically(sourcePath: string, targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
  try {
    await copyFile(sourcePath, tempPath)
    await rename(tempPath, targetPath)
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
}

async function writeBufferAtomically(targetPath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(tempPath, bytes, { flag: 'wx' })
    await rename(tempPath, targetPath)
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function resultFromProfile(input: Readonly<{
  success: boolean
  sourceKind: SourceKind
  assetId: string | null
  profile: ReturnType<typeof inferFileProfile>
  importStatus: FileImportStatus
  sendEligibilityHints: SendEligibilityHints
  warnings: FileIngestionWarning[]
  failureReasonCode: string | null
  retentionMode?: UrlRetentionMode
  probeStatus?: UrlProbeStatus
  materializationStatus?: MaterializationStatus
  originalUrl?: string
  resolvedUrl?: string
}>): FileIngestionResult {
  return {
    success: input.success,
    sourceKind: input.sourceKind,
    assetId: input.assetId,
    normalizedExtension: input.profile.extension,
    assetKind: input.profile.assetKind,
    aiPayloadKind: input.profile.aiPayloadKind,
    processingStatus: input.profile.processingStatus,
    isNativeSupportedForMvp: input.profile.mvpNativeSupported,
    isConvertibleCandidate: input.profile.futureConversionCandidate,
    importStatus: input.importStatus,
    sendEligibilityHints: input.sendEligibilityHints,
    warnings: input.warnings,
    failureReasonCode: input.failureReasonCode,
    ...(input.retentionMode ? { retentionMode: input.retentionMode } : {}),
    ...(input.probeStatus ? { probeStatus: input.probeStatus } : {}),
    ...(input.materializationStatus ? { materializationStatus: input.materializationStatus } : {}),
    ...(input.originalUrl ? { originalUrl: input.originalUrl } : {}),
    ...(input.resolvedUrl ? { resolvedUrl: input.resolvedUrl } : {}),
  }
}

function failedLocalResult(failureReasonCode: string, warnings: FileIngestionWarning[]): FileIngestionResult {
  return resultFromProfile({
    success: false,
    sourceKind: 'local_upload',
    assetId: null,
    profile: inferFileProfile({}),
    importStatus: 'failed',
    sendEligibilityHints: localHints(false),
    warnings,
    failureReasonCode,
  })
}

function warning(code: string, message: string): FileIngestionWarning {
  return { code, message }
}

function localMetadataWarnings(hasConflictingSignals: boolean): FileIngestionWarning[] {
  return hasConflictingSignals
    ? [warning('metadata_conflict', 'MIME and extension classify to different file payloads.')]
    : []
}

function localHints(canUseLocalFile: boolean): SendEligibilityHints {
  return {
    canUseUrlRef: false,
    canUseLocalFile,
    canUseInlinePayload: canUseLocalFile,
    urlReferenceMayStillBeUsable: false,
    notes: [],
  }
}

function urlHints(canUseUrlRef: boolean, canUseLocalFile: boolean): SendEligibilityHints {
  return {
    canUseUrlRef,
    canUseLocalFile,
    canUseInlinePayload: canUseLocalFile,
    urlReferenceMayStillBeUsable: canUseUrlRef,
    notes: canUseUrlRef && !canUseLocalFile
      ? ['Current device did not save a file copy; URL reference remains retained for later send adaptation.']
      : [],
  }
}

function urlSourceMeta(input: Readonly<{
  probe: UrlProbeResult
  retentionMode: UrlRetentionMode
  importStatus: FileImportStatus
  materializationStatus: MaterializationStatus
}>): JsonObject {
  return {
    originalUrl: input.probe.originalUrl,
    resolvedUrl: input.probe.resolvedUrl,
    retentionMode: input.retentionMode,
    importStatus: input.importStatus,
    probeStatus: input.probe.probeStatus,
    materializationStatus: input.materializationStatus,
    lastProbeAt: input.probe.lastProbeAt,
    probeWarning: input.probe.warning,
    contentTypeFromProbe: input.probe.contentType,
    contentLengthFromProbe: input.probe.contentLength,
  }
}

function ingestStatusForUrlLink(importStatus: FileImportStatus): FileIngestStatus {
  if (importStatus === 'probe_failed') return 'probe_failed'
  if (importStatus === 'materialization_failed') return 'materialization_failed'
  return 'registered'
}

function buildProbeWarnings(probe: UrlProbeResult): FileIngestionWarning[] {
  if (probe.probeStatus === 'accessible') return []
  return [
    warning(
      probe.probeStatus,
      'Current device could not complete URL probing; the URL reference remains retained for later send adaptation.'
    ),
  ]
}

function parseHttpUrl(value: string): Readonly<{ ok: true; url: string } | { ok: false; code: string; message: string }> {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, code: 'url_scheme_not_allowed', message: 'Only http and https URLs are allowed.' }
    }
    return { ok: true, url: url.toString() }
  } catch {
    return { ok: false, code: 'invalid_url', message: 'URL syntax is invalid.' }
  }
}

function filenameFromUrl(value: string): string {
  const pathname = urlPathname(value)
  const name = pathname.split('/').filter(Boolean).pop()
  return decodeURIComponent(name || 'remote-file')
}

function urlPathname(value: string): string {
  try {
    return new URL(value).pathname
  } catch {
    return value
  }
}

function normalizeMime(value: string | null | undefined): string | null {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase()
  return normalized || null
}

function mimeFromExtension(extension: string | null): string | null {
  switch (extension) {
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
    case 'csv':
      return 'text/csv'
    default:
      return null
  }
}

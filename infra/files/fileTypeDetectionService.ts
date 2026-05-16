import { createHash, randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import type BetterSqlite3 from 'better-sqlite3'
import {
  FILE_TYPE_TAXONOMY_VERSION,
  FILE_TYPE_TAXONOMY_MAP_VERSION,
  EXTENSION_TO_FORMAT_ID,
  MIME_TO_FORMAT_ID,
  type EvidenceSource,
  type FileTypeConflict,
  type FileTypeDetectionTrigger,
  type FileTypeEvidence,
  type FileTypeFlag,
  type FileTypeMagikaState,
  type FileTypeVerdict,
  detectMagic,
  probeContainer,
  probeText,
  mergeFileTypeEvidence,
  evaluateFileTypeStaticPolicy,
  createMockMagikaRuntimeLoader,
  createNoopMagikaAdapter,
  runMagikaRuntimeProbe,
  type MagikaAdapter,
  type MagikaRuntimeLoader,
} from '../../src/next/file-type'
import { resolveManagedStoragePath } from '../../src/shared/files/localStorageResolver'
import { FileTypeVerdictRepo } from '../db/repo/fileTypeVerdictRepo'
import type { FileAssetRepo } from '../db/repo/fileAssetRepo'
import type {
  FileAssetRecord,
  FileTypeFingerprintJson,
  FileTypeVerdictRecord,
  FileTypeVerdictVersionInfo,
} from '../db/types'

type SqlDatabase = BetterSqlite3.Database

export type DetectFileTypeMode = 'basic' | 'full'

export type FileTypeDetectionJobStatus = 'running' | 'ready' | 'failed' | 'cancelled'

export type FileTypeDetectionJob = Readonly<{
  jobId: string
  assetId: string
  mode: DetectFileTypeMode
  status: FileTypeDetectionJobStatus
  createdAt: number
  updatedAt: number
  errorCode: string | null
  errorMessage: string | null
}>

export type DetectFileTypeInput = Readonly<{
  assetId: string
  forceRedetect?: boolean
  detectionTrigger?: FileTypeDetectionTrigger
  magikaState?: FileTypeMagikaState
}>

export type DetectFileTypeResult = Readonly<{
  job: FileTypeDetectionJob
  verdict: FileTypeVerdictRecord | null
  fromCache: boolean
}>

type FileTypeDetectionServiceDeps = Readonly<{
  db: SqlDatabase
  fileAssetRepo: Pick<FileAssetRepo, 'getById'>
  fileTypeVerdictRepo: Pick<
    FileTypeVerdictRepo,
    'upsertCurrent' | 'getCurrentByAssetId' | 'markStaleByAssetId'
  >
  storageRootDir: string
  idFactory?: () => string
  now?: () => number
  readBytes?: (filePath: string) => Promise<Uint8Array>
  statFile?: (filePath: string) => Promise<{ size: number; modifiedTime: number | null }>
  magikaAdapter?: MagikaAdapter
  magikaRuntimeLoader?: MagikaRuntimeLoader
  versionInfo?: Partial<FileTypeVerdictVersionInfo>
}>

type MagikaRuntimeState = Readonly<{
  loader: MagikaRuntimeLoader
  available: boolean
  modelVersion: string | null
  runtimeKind: string
  unavailableReason: string | null
  unavailableDetail: string | null
}>

export const CURRENT_FILE_TYPE_VERDICT_VERSION_INFO: FileTypeVerdictVersionInfo = {
  schemaVersion: 'v1-stage-f1',
  taxonomyVersion: FILE_TYPE_TAXONOMY_VERSION,
  taxonomyMapVersion: FILE_TYPE_TAXONOMY_MAP_VERSION,
  magicTableVersion: 'magic-v1',
  mergeRulesVersion: 'merge-v1',
  containerProbeVersion: 'container-v1',
  textProbeVersion: 'text-v1',
  magikaModelVersion: null,
}

type DetectionFailureMeta = Readonly<{
  detectionTrigger: FileTypeDetectionTrigger
  detectionLevel: 'basic' | 'advanced'
  engineMode: 'core_only' | 'core_plus_magika'
  usedMagika: false
  magikaState: FileTypeMagikaState
  advancedAttempted: boolean
  advancedFailureReason: string | null
}>

type DetectionReadyMeta = Readonly<{
  detectionTrigger: FileTypeDetectionTrigger
  detectionLevel: 'basic' | 'advanced' | 'parser_validated'
  engineMode: 'core_only' | 'core_plus_magika' | 'core_plus_parser' | 'core_plus_external'
  usedMagika: boolean
  magikaState: FileTypeMagikaState
  advancedAttempted: boolean
  advancedFailureReason: string | null
}>

class FileTypeDetectionRuntimeError extends Error {
  constructor(
    readonly errorCode: string,
    message: string,
    readonly magikaState: FileTypeMagikaState,
    readonly advancedFailureReason: string
  ) {
    super(message)
    this.name = 'FileTypeDetectionRuntimeError'
  }
}

const HEAD_TAIL_BYTES = 64 * 1024

export class FileTypeDetectionService {
  private readonly now: () => number
  private readonly idFactory: () => string
  private readonly readBytes: (filePath: string) => Promise<Uint8Array>
  private readonly statFile: (filePath: string) => Promise<{ size: number; modifiedTime: number | null }>
  private readonly magikaRuntimeLoader: MagikaRuntimeLoader
  private readonly versionInfo: FileTypeVerdictVersionInfo

  constructor(private readonly deps: FileTypeDetectionServiceDeps) {
    this.now = deps.now ?? Date.now
    this.idFactory = deps.idFactory ?? randomUUID
    this.readBytes = deps.readBytes ?? defaultReadBytes
    this.statFile = deps.statFile ?? defaultStatFile
    const adapter = deps.magikaAdapter ?? createNoopMagikaAdapter()
    this.magikaRuntimeLoader =
      deps.magikaRuntimeLoader ??
      createMockMagikaRuntimeLoader({
        // adapter_only: no MagikaRuntimeLoader was injected; we wrap
        // the caller-supplied adapter (or noop) behind a loader shell.
        // modelVersion MUST be null here because we cannot infer the
        // adapter's backing model version from static config.
        runtimeKind: 'adapter_only',
        modelVersion: null,
        classify: (probe) => adapter.detect(probe),
      })
    this.versionInfo = { ...CURRENT_FILE_TYPE_VERDICT_VERSION_INFO, ...(deps.versionInfo ?? {}) }
  }

  async detectBasic(input: DetectFileTypeInput): Promise<DetectFileTypeResult> {
    return this.detectWithMode('basic', input)
  }

  async detectFull(input: DetectFileTypeInput): Promise<DetectFileTypeResult> {
    return this.detectWithMode('full', input)
  }

  markStaleByAssetId(assetId: string, staleReason: string): { ok: true; updated: number } {
    const normalizedAssetId = requireNonEmpty(assetId, 'assetId')
    const normalizedReason = requireNonEmpty(staleReason, 'staleReason')
    const result = this.deps.fileTypeVerdictRepo.markStaleByAssetId({
      assetId: normalizedAssetId,
      staleReason: normalizedReason,
      updatedAt: this.now(),
    })
    this.writeDetectionMeta(normalizedAssetId, (current) => ({
      ...current,
      stale: true,
      staleReason: normalizedReason,
    }))
    return result
  }

  private async detectWithMode(mode: DetectFileTypeMode, input: DetectFileTypeInput): Promise<DetectFileTypeResult> {
    const assetId = requireNonEmpty(input.assetId, 'assetId')
    const now = this.now()
    const detectionTrigger = input.detectionTrigger ?? 'manual_redetect'
    const initialMagikaState = input.magikaState ?? (mode === 'full' ? 'available' : 'not_requested')
    const runningJob = this.startJob(assetId, mode, now, {
      detectionTrigger,
      magikaState: initialMagikaState,
    })
    const baseFailureMeta = buildFailureMeta(mode, detectionTrigger, initialMagikaState)
    const forceRedetect = input.forceRedetect === true
    try {
      const asset = this.requireAsset(assetId)
      const resolvedPath = resolveManagedStoragePath(this.deps.storageRootDir, asset.storageUri, {
        backend: asset.storageBackend,
        deletedAt: asset.deletedAt,
      })
      if (resolvedPath.kind !== 'ok') {
        return this.finishFailed(runningJob, 'error.file_access_expired', 'File path is not available for detection.', baseFailureMeta)
      }

      const [bytes, fileStat] = await Promise.all([this.readBytes(resolvedPath.path), this.statFile(resolvedPath.path)])
      const fingerprint = buildFingerprint(bytes, fileStat)
      const currentVerdict = this.deps.fileTypeVerdictRepo.getCurrentByAssetId(assetId)
      const magikaRuntimeState = mode === 'full' ? await this.loadMagikaRuntimeState() : null
      if (mode === 'full' && (!magikaRuntimeState || !magikaRuntimeState.available)) {
        const magikaState = magikaRuntimeState?.unavailableReason === 'runtime_error' ? 'failed' : 'unavailable'
        return this.finishFailed(
          runningJob,
          'error.magika_unavailable',
          magikaRuntimeState?.unavailableDetail ?? 'Magika runtime became unavailable during advanced detection.',
          {
            ...baseFailureMeta,
            magikaState,
            advancedFailureReason: magikaRuntimeState?.unavailableReason ?? 'runtime_unavailable',
          }
        )
      }

      if (
        !forceRedetect &&
        currentVerdict &&
        fingerprintsEqual(currentVerdict.fingerprintJson, fingerprint) &&
        this.isModelVersionCacheCompatible(currentVerdict, magikaRuntimeState)
      ) {
        const readyJob = this.finishReady(
          runningJob,
          currentVerdict.id,
          fingerprint,
          true,
          readyMetaFromVerdict(currentVerdict.verdict, detectionTrigger)
        )
        return { job: readyJob, verdict: currentVerdict, fromCache: true }
      }

      if (currentVerdict) {
        const staleReason = !fingerprintsEqual(currentVerdict.fingerprintJson, fingerprint)
          ? 'fingerprint_mismatch'
          : this.resolveModelVersionStaleReason(currentVerdict, magikaRuntimeState)
        if (staleReason) {
          this.deps.fileTypeVerdictRepo.markStaleByAssetId({
            assetId,
            staleReason,
            updatedAt: this.now(),
          })
        }
      }

      const assembled = await this.assembleVerdict({
        mode,
        asset,
        bytes,
        fingerprint,
        magikaRuntimeState,
        detectionTrigger,
        requestedMagikaState: initialMagikaState,
      })
      if (!this.isCurrentJob(assetId, runningJob.jobId)) {
        const cancelled = this.toJob(runningJob, 'cancelled', null, null)
        return { job: cancelled, verdict: null, fromCache: false }
      }

      const resolvedVersionInfo: FileTypeVerdictVersionInfo = {
        ...this.versionInfo,
        magikaModelVersion:
          assembled.magikaModelVersion ??
          magikaRuntimeState?.modelVersion ??
          // Only fall back to static config when no runtime state exists
          // (basic mode). In full mode, if the runtime provides no version,
          // keep it null — do not fabricate from versionInfo.
          (magikaRuntimeState ? null : this.versionInfo.magikaModelVersion),
      }

      const saved = this.deps.fileTypeVerdictRepo.upsertCurrent({
        assetId,
        verdict: assembled.verdict,
        primaryFormatId: assembled.verdict.primary.formatId,
        primaryKind: assembled.verdict.primary.kind,
        confidenceLevel: assembled.verdict.primary.confidence,
        versionInfo: resolvedVersionInfo,
        fingerprintJson: fingerprint,
        updatedAt: this.now(),
      })

      const ready = this.finishReady(runningJob, saved.id, fingerprint, false, readyMetaFromVerdict(saved.verdict, detectionTrigger))
      return { job: ready, verdict: saved, fromCache: false }
    } catch (error) {
      if (error instanceof FileTypeDetectionRuntimeError) {
        return this.finishFailed(runningJob, error.errorCode, error.message, {
          ...baseFailureMeta,
          magikaState: error.magikaState,
          advancedFailureReason: error.advancedFailureReason,
        })
      }
      const message = error instanceof Error ? error.message : String(error)
      return this.finishFailed(runningJob, 'error.read_failed', message, baseFailureMeta)
    }
  }

  private async assembleVerdict(input: Readonly<{
    mode: DetectFileTypeMode
    asset: FileAssetRecord
    bytes: Uint8Array
    fingerprint: FileTypeFingerprintJson
    magikaRuntimeState: MagikaRuntimeState | null
    detectionTrigger: FileTypeDetectionTrigger
    requestedMagikaState: FileTypeMagikaState
  }>): Promise<Readonly<{ verdict: FileTypeVerdict; magikaModelVersion: string | null }>> {
    const evidence: FileTypeEvidence[] = []

    const extension = normalizeExtension(input.asset.extension ?? input.asset.filename)
    if (extension && EXTENSION_TO_FORMAT_ID[extension]) {
      evidence.push({
        source: 'extension',
        detectedFormatId: EXTENSION_TO_FORMAT_ID[extension],
        detectedMime: null,
        detectedExtension: extension,
        confidence: 'medium',
        reasonCodes: [],
        errorCode: null,
        note: 'extension:map',
      })
    }

    const normalizedMime = normalizeMime(input.asset.mime)
    if (normalizedMime && MIME_TO_FORMAT_ID[normalizedMime]) {
      evidence.push({
        source: 'mime_os',
        detectedFormatId: MIME_TO_FORMAT_ID[normalizedMime],
        detectedMime: normalizedMime,
        detectedExtension: extension,
        confidence: 'medium',
        reasonCodes: [],
        errorCode: null,
        note: 'mime:map',
      })
    }

    const magic = detectMagic(input.bytes)
    if (magic.evidence) evidence.push(magic.evidence)

    const container = probeContainer(input.bytes)
    if (container.evidence) evidence.push(container.evidence)

    const text = probeText(input.bytes)
    if (text.evidence) evidence.push(text.evidence)

    let magikaModelVersion: string | null = null
    if (input.mode === 'full' && input.magikaRuntimeState) {
      const magikaProbe = await runMagikaRuntimeProbe(input.magikaRuntimeState.loader, {
        bytes: input.bytes,
        filename: input.asset.filename,
        mime: normalizedMime,
      })
      if (magikaProbe.unavailableReason) {
        throw new FileTypeDetectionRuntimeError(
          'error.magika_runtime_failed',
          magikaProbe.unavailableDetail ?? 'Magika runtime failed during advanced detection.',
          magikaProbe.unavailableReason === 'runtime_error' ? 'failed' : 'unavailable',
          magikaProbe.unavailableReason
        )
      }
      if (!magikaProbe.evidence) {
        throw new FileTypeDetectionRuntimeError(
          'error.magika_no_evidence',
          'Magika did not return classification evidence for advanced detection.',
          'failed',
          'magika_no_evidence'
        )
      }
      if (magikaProbe.evidence) evidence.push(magikaProbe.evidence)
      magikaModelVersion = magikaProbe.modelVersion ?? input.magikaRuntimeState.modelVersion ?? null
    }

    const merged = mergeFileTypeEvidence({ evidence })
    const extraFlags = [
      ...mapContainerFlags(container.flags),
      ...mapTextFlags(text.flags),
    ]
    const combinedFlags = dedupeFlags([...merged.flags, ...extraFlags])
    const policy = evaluateFileTypeStaticPolicy({
      primary: merged.primary,
      conflicts: merged.conflicts,
      flags: combinedFlags,
    })
    const policyFlags = mapPolicyToFlags(policy)
    const finalFlags = dedupeFlags([...combinedFlags, ...policyFlags])

    return {
      verdict: {
        primary: merged.primary,
        conflicts: merged.conflicts as FileTypeConflict[],
        flags: finalFlags,
        evidence,
        provenance: {
          detectionLevel: input.mode === 'full' ? 'advanced' : 'basic',
          engineMode: input.mode === 'full' ? 'core_plus_magika' : 'core_only',
          usedMagika: input.mode === 'full',
          magikaState: input.mode === 'full' ? 'available' : input.requestedMagikaState,
          evidenceSources: evidenceSourcesOf(evidence),
          decisiveEvidenceSource: resolveDecisiveEvidenceSource(evidence, merged.primary.formatId),
          detectionTrigger: input.detectionTrigger,
          routeEligibility: 'verdict_ready',
          magikaModelVersion,
          advancedAttempted: input.mode === 'full',
          advancedFailureReason: null,
        },
        schemaVersion: this.versionInfo.schemaVersion,
        taxonomyVersion: this.versionInfo.taxonomyVersion,
        detectionCost: input.mode === 'full' ? 'medium' : 'low',
        fingerprint: input.fingerprint.fullHash ?? input.fingerprint.headHash,
      },
      magikaModelVersion,
    }
  }

  private async loadMagikaRuntimeState(): Promise<MagikaRuntimeState> {
    try {
      const loaded = await this.magikaRuntimeLoader.load()
      if (loaded.available) {
        return {
          loader: this.magikaRuntimeLoader,
          available: true,
          modelVersion: normalizeNullableModelVersion(loaded.runtime.modelVersion),
          runtimeKind: loaded.runtime.kind,
          unavailableReason: null,
          unavailableDetail: null,
        }
      }
      return {
        loader: this.magikaRuntimeLoader,
        available: false,
        modelVersion: normalizeNullableModelVersion(loaded.modelVersion),
        runtimeKind: loaded.runtimeKind,
        unavailableReason: loaded.reason,
        unavailableDetail: loaded.detail,
      }
    } catch {
      return {
        loader: this.magikaRuntimeLoader,
        available: false,
        modelVersion: null,
        runtimeKind: 'unavailable',
        unavailableReason: 'runtime_error',
        unavailableDetail: 'Magika runtime loader threw during availability check.',
      }
    }
  }

  private isModelVersionCacheCompatible(
    currentVerdict: FileTypeVerdictRecord,
    magikaRuntimeState: MagikaRuntimeState | null
  ): boolean {
    const cached = currentVerdict.versionInfo
    const config = this.versionInfo
    if (cached.schemaVersion !== config.schemaVersion) return false
    if (cached.taxonomyVersion !== config.taxonomyVersion) return false
    if (cached.taxonomyMapVersion !== config.taxonomyMapVersion) return false
    if (cached.magicTableVersion !== config.magicTableVersion) return false
    if (cached.mergeRulesVersion !== config.mergeRulesVersion) return false
    if (cached.containerProbeVersion !== config.containerProbeVersion) return false
    if (cached.textProbeVersion !== config.textProbeVersion) return false

    if (!magikaRuntimeState) return true
    if (!magikaRuntimeState.available) return !hasMagikaEvidence(currentVerdict)
    const currentVersion = normalizeNullableModelVersion(cached.magikaModelVersion)
    const runtimeVersion = normalizeNullableModelVersion(magikaRuntimeState.modelVersion)
    if (!runtimeVersion) return true
    if (
      currentVersion &&
      !currentVerdict.verdict.evidence.some((e) => e.source === 'magika')
    ) {
      return false
    }
    return currentVersion === runtimeVersion
  }

  private resolveModelVersionStaleReason(
    currentVerdict: FileTypeVerdictRecord,
    magikaRuntimeState: MagikaRuntimeState | null
  ): string | null {
    const cached = currentVerdict.versionInfo
    const config = this.versionInfo
    if (cached.schemaVersion !== config.schemaVersion) return 'schema_version_changed'
    if (cached.taxonomyVersion !== config.taxonomyVersion) return 'taxonomy_version_changed'
    if (cached.taxonomyMapVersion !== config.taxonomyMapVersion) return 'taxonomy_map_version_changed'
    if (cached.magicTableVersion !== config.magicTableVersion) return 'magic_table_version_changed'
    if (cached.mergeRulesVersion !== config.mergeRulesVersion) return 'merge_rules_version_changed'
    if (cached.containerProbeVersion !== config.containerProbeVersion) return 'container_probe_version_changed'
    if (cached.textProbeVersion !== config.textProbeVersion) return 'text_probe_version_changed'

    if (!magikaRuntimeState) return null
    if (!magikaRuntimeState.available) {
      return hasMagikaEvidence(currentVerdict) ? 'magika_runtime_unavailable' : null
    }
    const currentVersion = normalizeNullableModelVersion(cached.magikaModelVersion)
    const runtimeVersion = normalizeNullableModelVersion(magikaRuntimeState.modelVersion)
    if (!runtimeVersion) return null
    if (currentVersion === runtimeVersion) return null
    return 'magika_model_version_changed'
  }

  private startJob(
    assetId: string,
    mode: DetectFileTypeMode,
    timestamp: number,
    meta: Readonly<{ detectionTrigger: FileTypeDetectionTrigger; magikaState: FileTypeMagikaState }>
  ): FileTypeDetectionJob {
    const jobId = this.idFactory()
    const job = this.toJob(
      {
        jobId,
        assetId,
        mode,
        status: 'running',
        createdAt: timestamp,
        updatedAt: timestamp,
        errorCode: null,
        errorMessage: null,
      },
      'running',
      null,
      null
    )
    this.writeDetectionMeta(assetId, (current) => ({
      ...current,
      currentJobId: jobId,
      lastJob: job,
      detectionTrigger: meta.detectionTrigger,
      detectionLevel: mode === 'full' ? 'advanced' : 'basic',
      engineMode: mode === 'full' ? 'core_plus_magika' : 'core_only',
      usedMagika: false,
      magikaState: meta.magikaState,
      advancedAttempted: mode === 'full',
      advancedFailureReason: null,
      routeEligibility: 'detection_pending',
      stale: false,
      staleReason: null,
    }))
    return job
  }

  private finishReady(
    runningJob: FileTypeDetectionJob,
    verdictId: string,
    fingerprint: FileTypeFingerprintJson,
    fromCache: boolean,
    readyMeta: DetectionReadyMeta
  ): FileTypeDetectionJob {
    const ready = this.toJob(runningJob, 'ready', null, null)
    this.updateDetectionMetaIfCurrentJob(runningJob.assetId, runningJob.jobId, (current) => ({
      ...current,
      currentJobId: runningJob.jobId,
      lastJob: ready,
      lastVerdictId: verdictId,
      lastFingerprint: fingerprint,
      cache: {
        fromCache,
        updatedAt: this.now(),
      },
      detectionTrigger: readyMeta.detectionTrigger,
      detectionLevel: readyMeta.detectionLevel,
      engineMode: readyMeta.engineMode,
      usedMagika: readyMeta.usedMagika,
      magikaState: readyMeta.magikaState,
      advancedAttempted: readyMeta.advancedAttempted,
      advancedFailureReason: readyMeta.advancedFailureReason,
      routeEligibility: 'verdict_ready',
      stale: false,
      staleReason: null,
    }))
    return ready
  }

  private finishFailed(
    runningJob: FileTypeDetectionJob,
    errorCode: string,
    errorMessage: string,
    meta: DetectionFailureMeta
  ): DetectFileTypeResult {
    const failed = this.toJob(runningJob, 'failed', errorCode, errorMessage)
    this.updateDetectionMetaIfCurrentJob(runningJob.assetId, runningJob.jobId, (current) => ({
      ...current,
      currentJobId: runningJob.jobId,
      lastJob: failed,
      detectionTrigger: meta.detectionTrigger,
      detectionLevel: meta.detectionLevel,
      engineMode: meta.engineMode,
      usedMagika: meta.usedMagika,
      magikaState: meta.magikaState,
      advancedAttempted: meta.advancedAttempted,
      advancedFailureReason: meta.advancedFailureReason,
      routeEligibility: 'detection_failed',
      stale: true,
      staleReason: errorCode,
    }))
    return { job: failed, verdict: null, fromCache: false }
  }

  private toJob(
    base: FileTypeDetectionJob,
    status: FileTypeDetectionJobStatus,
    errorCode: string | null,
    errorMessage: string | null
  ): FileTypeDetectionJob {
    return {
      ...base,
      status,
      updatedAt: this.now(),
      errorCode,
      errorMessage,
    }
  }

  private requireAsset(assetId: string): FileAssetRecord {
    const asset = this.deps.fileAssetRepo.getById(assetId)
    if (!asset) throw new Error(`asset not found: ${assetId}`)
    return asset
  }

  private isCurrentJob(assetId: string, jobId: string): boolean {
    const meta = this.readDetectionMeta(assetId)
    return meta?.currentJobId === jobId
  }

  private readDetectionMeta(assetId: string): Record<string, unknown> | null {
    const row = this.deps.db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id = @id
      LIMIT 1
    `).get({ id: assetId }) as { sourceMetaJson?: string | null } | undefined
    if (!row?.sourceMetaJson) return null
    const parsed = safeParseObject(row.sourceMetaJson)
    if (!parsed) return null
    const meta = parsed.fileTypeDetection
    return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null
  }

  private writeDetectionMeta(
    assetId: string,
    updater: (current: Record<string, unknown>) => Record<string, unknown>
  ): void {
    const row = this.deps.db.prepare(`
      SELECT source_meta_json AS sourceMetaJson
      FROM file_assets
      WHERE id = @id
      LIMIT 1
    `).get({ id: assetId }) as { sourceMetaJson?: string | null } | undefined
    const parsed = row?.sourceMetaJson ? safeParseObject(row.sourceMetaJson) ?? {} : {}
    const current = parsed.fileTypeDetection && typeof parsed.fileTypeDetection === 'object'
      ? parsed.fileTypeDetection as Record<string, unknown>
      : {}
    parsed.fileTypeDetection = updater(current)
    this.deps.db.prepare(`
      UPDATE file_assets
      SET source_meta_json = @sourceMetaJson,
          updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: assetId,
      sourceMetaJson: JSON.stringify(parsed),
      updatedAt: this.now(),
    })
  }

  private updateDetectionMetaIfCurrentJob(
    assetId: string,
    jobId: string,
    updater: (current: Record<string, unknown>) => Record<string, unknown>
  ): void {
    const current = this.readDetectionMeta(assetId)
    if (!current || current.currentJobId !== jobId) return
    this.writeDetectionMeta(assetId, updater)
  }
}

function buildFailureMeta(
  mode: DetectFileTypeMode,
  detectionTrigger: FileTypeDetectionTrigger,
  magikaState: FileTypeMagikaState
): DetectionFailureMeta {
  return {
    detectionTrigger,
    detectionLevel: mode === 'full' ? 'advanced' : 'basic',
    engineMode: mode === 'full' ? 'core_plus_magika' : 'core_only',
    usedMagika: false,
    magikaState,
    advancedAttempted: mode === 'full',
    advancedFailureReason: mode === 'full' ? 'advanced_detection_failed' : null,
  }
}

function readyMetaFromVerdict(
  verdict: FileTypeVerdict,
  fallbackTrigger: FileTypeDetectionTrigger
): DetectionReadyMeta {
  const provenance = verdict.provenance ?? null
  const usedMagika = provenance?.usedMagika ?? verdict.evidence.some((item) => item.source === 'magika')
  return {
    detectionTrigger: provenance?.detectionTrigger ?? fallbackTrigger,
    detectionLevel: provenance?.detectionLevel ?? (usedMagika ? 'advanced' : 'basic'),
    engineMode: provenance?.engineMode ?? (usedMagika ? 'core_plus_magika' : 'core_only'),
    usedMagika,
    magikaState: provenance?.magikaState ?? (usedMagika ? 'available' : 'not_requested'),
    advancedAttempted: provenance?.advancedAttempted ?? usedMagika,
    advancedFailureReason: provenance?.advancedFailureReason ?? null,
  }
}

function evidenceSourcesOf(evidence: readonly FileTypeEvidence[]): EvidenceSource[] {
  return Array.from(new Set(evidence.map((item) => item.source)))
}

function resolveDecisiveEvidenceSource(
  evidence: readonly FileTypeEvidence[],
  primaryFormatId: FileTypeVerdict['primary']['formatId']
): EvidenceSource | null {
  const matching = evidence.filter((item) => item.detectedFormatId === primaryFormatId)
  if (matching.length === 0) return evidence[0]?.source ?? null
  const priority: EvidenceSource[] = [
    'magic',
    'container_probe',
    'text_probe',
    'magika',
    'mime_os',
    'mime_browser',
    'extension',
  ]
  for (const source of priority) {
    const found = matching.find((item) => item.source === source)
    if (found) return found.source
  }
  return matching[0]?.source ?? null
}

function mapPolicyToFlags(
  policy: ReturnType<typeof evaluateFileTypeStaticPolicy>
): FileTypeFlag[] {
  const flags: FileTypeFlag[] = []
  for (const reasonCode of policy.blockingReasonCodes) {
    flags.push({ flag: reasonToFlag(reasonCode), reasonCode, blocking: true })
  }
  for (const reasonCode of policy.warningReasonCodes) {
    flags.push({ flag: reasonToFlag(reasonCode), reasonCode, blocking: false })
  }
  return flags
}

function mapTextFlags(flags: readonly string[]): FileTypeFlag[] {
  if (flags.length === 0) return []
  return [
    {
      flag: 'text_probe_uncertain',
      reasonCode: 'reason.low_confidence',
      blocking: false,
    },
  ]
}

function mapContainerFlags(flags: readonly string[]): FileTypeFlag[] {
  const out: FileTypeFlag[] = []
  for (const flag of flags) {
    if (flag === 'zip_slip') {
      out.push({ flag: 'zip_slip', reasonCode: 'reason.polyglot_suspected', blocking: true })
      continue
    }
    out.push({
      flag: `container_${flag}`,
      reasonCode: 'reason.container_probe_failed',
      blocking: false,
    })
  }
  return out
}

function dedupeFlags(flags: readonly FileTypeFlag[]): FileTypeFlag[] {
  const map = new Map<string, FileTypeFlag>()
  for (const item of flags) {
    map.set(`${item.flag}:${item.reasonCode}:${item.blocking ? 1 : 0}`, item)
  }
  return Array.from(map.values())
}

function hasMagikaEvidence(verdict: FileTypeVerdictRecord): boolean {
  return verdict.verdict.evidence.some((item) => item.source === 'magika')
}

function reasonToFlag(reasonCode: string): string {
  return reasonCode
    .replace(/^reason\./, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .toLowerCase()
}

function buildFingerprint(
  bytes: Uint8Array,
  statInfo: Readonly<{ size: number; modifiedTime: number | null }>
): FileTypeFingerprintJson {
  const head = bytes.subarray(0, Math.min(bytes.length, HEAD_TAIL_BYTES))
  const tail = bytes.subarray(Math.max(0, bytes.length - HEAD_TAIL_BYTES))
  return {
    algorithmVersion: 'sha256-v1',
    size: statInfo.size,
    modifiedTime: statInfo.modifiedTime,
    headHash: sha256(head),
    headBytes: head.byteLength,
    tailHash: sha256(tail),
    tailBytes: tail.byteLength,
    fullHash: sha256(bytes),
    fullHashStatus: 'computed',
  }
}

function fingerprintsEqual(left: FileTypeFingerprintJson, right: FileTypeFingerprintJson): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function defaultReadBytes(filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(filePath))
}

async function defaultStatFile(filePath: string): Promise<{ size: number; modifiedTime: number | null }> {
  const s = await stat(filePath)
  return { size: s.size, modifiedTime: Number.isFinite(s.mtimeMs) ? Math.floor(s.mtimeMs) : null }
}

function safeParseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function normalizeNullableModelVersion(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeExtension(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  const tail = raw.includes('.') ? raw.split('.').pop() ?? raw : raw
  return tail.replace(/^\./, '').trim() || null
}

function normalizeMime(value: string | null | undefined): string | null {
  const raw = String(value ?? '').split(';', 1)[0]?.trim().toLowerCase()
  return raw || null
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

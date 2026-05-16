import type { EnginePluginRegistryRepo } from '../db/repo/enginePluginRegistryRepo'
import type { FileTypeVerdictRepo } from '../db/repo/fileTypeVerdictRepo'
import type { FileTypeVerdictRecord } from '../db/types'
import type { FileTypeDetectionService } from './fileTypeDetectionService'
import { CURRENT_FILE_TYPE_VERDICT_VERSION_INFO } from './fileTypeDetectionService'
import type {
  FileTypeDetectionTrigger,
  FileTypeMagikaState,
} from '../../src/next/file-type'
import type { MagikaRuntimeLoader } from '../../src/next/file-type/magikaRuntimeLoader'

type DetectionPipeline = 'basic' | 'advanced'

export type FileTypeDetectionPipelineDecision = Readonly<{
  pipeline: DetectionPipeline
  magikaState: FileTypeMagikaState
  magikaModelVersion: string | null
  runtimeKind: string | null
}>

export type EnsureFileTypeVerdictOptions = Readonly<{
  detectionTrigger?: FileTypeDetectionTrigger
  forceRedetect?: boolean
}>

export type EnsureFileTypeVerdictResult = Readonly<{
  assetId: string
  status: 'ready' | 'failed' | 'pending'
  verdict: FileTypeVerdictRecord | null
  fromCache: boolean
  reusedCurrent: boolean
  pipeline: DetectionPipeline | null
  magikaState: FileTypeMagikaState | null
  errorCode: string | null
  errorMessage: string | null
}>

type FileTypeDetectionCoordinatorDeps = Readonly<{
  fileTypeVerdictRepo: Pick<FileTypeVerdictRepo, 'getCurrentByAssetId'>
  enginePluginRegistryRepo: Pick<EnginePluginRegistryRepo, 'getByEngineId'>
  fileTypeDetectionService: Pick<FileTypeDetectionService, 'detectBasic' | 'detectFull'>
  magikaRuntimeLoader: MagikaRuntimeLoader
}>

export class FileTypeDetectionCoordinator {
  constructor(private readonly deps: FileTypeDetectionCoordinatorDeps) {}

  async ensureVerdictForAsset(
    assetId: string,
    options: EnsureFileTypeVerdictOptions = {}
  ): Promise<EnsureFileTypeVerdictResult> {
    const normalizedAssetId = requireNonEmpty(assetId, 'assetId')
    const detectionTrigger = options.detectionTrigger ?? 'send_plan_build'
    const current = this.deps.fileTypeVerdictRepo.getCurrentByAssetId(normalizedAssetId)
    let pipelineDecision: FileTypeDetectionPipelineDecision | null = null

    if (!options.forceRedetect && current) {
      if (current.verdict.evidence.some((item) => item.source === 'magika') && isMagikaInstalledAndEnabled(this.deps.enginePluginRegistryRepo)) {
        pipelineDecision = await this.resolveDetectionPipeline()
      }
      if (isCurrentVerdictReusable(current, pipelineDecision)) {
        return {
          assetId: normalizedAssetId,
          status: 'ready',
          verdict: current,
          fromCache: true,
          reusedCurrent: true,
          pipeline: null,
          magikaState: pipelineDecision?.magikaState ?? null,
          errorCode: null,
          errorMessage: null,
        }
      }
    }

    const decision = pipelineDecision ?? await this.resolveDetectionPipeline()
    const result = decision.pipeline === 'advanced'
      ? await this.deps.fileTypeDetectionService.detectFull({
          assetId: normalizedAssetId,
          forceRedetect: options.forceRedetect,
          detectionTrigger,
          magikaState: 'available',
        })
      : await this.deps.fileTypeDetectionService.detectBasic({
          assetId: normalizedAssetId,
          forceRedetect: options.forceRedetect,
          detectionTrigger,
          magikaState: decision.magikaState,
        })

    return {
      assetId: normalizedAssetId,
      status: result.job.status === 'ready' && result.verdict ? 'ready' : result.job.status === 'running' ? 'pending' : 'failed',
      verdict: result.verdict,
      fromCache: result.fromCache,
      reusedCurrent: false,
      pipeline: decision.pipeline,
      magikaState: decision.magikaState,
      errorCode: result.job.errorCode,
      errorMessage: result.job.errorMessage,
    }
  }

  async ensureVerdictsForAssets(
    assetIds: readonly string[],
    options: EnsureFileTypeVerdictOptions = {}
  ): Promise<EnsureFileTypeVerdictResult[]> {
    const results: EnsureFileTypeVerdictResult[] = []
    for (const assetId of normalizeIds(assetIds)) {
      results.push(await this.ensureVerdictForAsset(assetId, options))
    }
    return results
  }

  scheduleDraftAttachmentDetection(
    assetId: string,
    options: EnsureFileTypeVerdictOptions = {}
  ): Readonly<{ scheduled: true }> {
    const normalizedAssetId = requireNonEmpty(assetId, 'assetId')
    void this.ensureVerdictForAsset(normalizedAssetId, {
      ...options,
      detectionTrigger: options.detectionTrigger ?? 'upload',
    }).catch(() => {
      // FileTypeDetectionService owns persisted failure metadata; this catch
      // prevents background scheduling from surfacing as an unhandled rejection.
    })
    return { scheduled: true }
  }

  async resolveDetectionPipeline(): Promise<FileTypeDetectionPipelineDecision> {
    const record = this.deps.enginePluginRegistryRepo.getByEngineId('magika')
    if (!record || record.installState === 'uninstalled') return basicDecision('not_installed')
    if (!record.enabled) return basicDecision('disabled')
    if (record.installState === 'failed' || record.healthStatus === 'unhealthy') return basicDecision('failed')
    if (record.installState !== 'installed') return basicDecision('unavailable')

    try {
      const loaded = await this.deps.magikaRuntimeLoader.load()
      if (!loaded.available) {
        return basicDecision(loaded.reason === 'runtime_error' ? 'failed' : 'unavailable', loaded.modelVersion, loaded.runtimeKind)
      }
      return {
        pipeline: 'advanced',
        magikaState: 'available',
        magikaModelVersion: loaded.runtime.modelVersion,
        runtimeKind: loaded.runtime.kind,
      }
    } catch {
      return basicDecision('failed')
    }
  }
}

function basicDecision(
  magikaState: Exclude<FileTypeMagikaState, 'available'>,
  magikaModelVersion: string | null = null,
  runtimeKind: string | null = null
): FileTypeDetectionPipelineDecision {
  return {
    pipeline: 'basic',
    magikaState,
    magikaModelVersion,
    runtimeKind,
  }
}

function isMagikaInstalledAndEnabled(
  repo: Pick<EnginePluginRegistryRepo, 'getByEngineId'>
): boolean {
  const record = repo.getByEngineId('magika')
  return Boolean(record && record.installState === 'installed' && record.enabled)
}

function isCurrentVerdictReusable(
  current: FileTypeVerdictRecord,
  runtimeDecision: FileTypeDetectionPipelineDecision | null
): boolean {
  const version = current.versionInfo
  const expected = CURRENT_FILE_TYPE_VERDICT_VERSION_INFO
  if (version.schemaVersion !== expected.schemaVersion) return false
  if (version.taxonomyVersion !== expected.taxonomyVersion) return false
  if (version.taxonomyMapVersion !== expected.taxonomyMapVersion) return false
  if (version.magicTableVersion !== expected.magicTableVersion) return false
  if (version.mergeRulesVersion !== expected.mergeRulesVersion) return false
  if (version.containerProbeVersion !== expected.containerProbeVersion) return false
  if (version.textProbeVersion !== expected.textProbeVersion) return false

  const hasMagikaEvidence = current.verdict.evidence.some((item) => item.source === 'magika')
  if (!hasMagikaEvidence) return true
  if (runtimeDecision?.pipeline !== 'advanced') return true
  if (!runtimeDecision.magikaModelVersion) return true
  return normalizeNullable(version.magikaModelVersion) === normalizeNullable(runtimeDecision.magikaModelVersion)
}

function normalizeIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean)))
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

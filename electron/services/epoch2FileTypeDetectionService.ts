import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { EnginePluginRegistryRepo } from '../../infra/db/repo/enginePluginRegistryRepo'
import {
  FileTypeDetectionV2Repo,
  type FileTypeDetectionProjectionV2,
  type FileTypeDetectionWarningV2,
} from '../../infra/db/repo/fileTypeDetectionV2Repo'
import {
  createMagikaClassifyCallback,
  detectBasicFileTypeV2,
  discoverMagikaManagedPlugin,
  MagikaRuntimeClassificationError,
  mapMagikaOutputToEvidence,
  type FileTypeEvidence,
  type FileTypeMagikaState,
  type MagikaProcessRunner,
} from '../../infra/files/fileTypeRuntimeBoundary'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import type { Epoch2WorkspaceLayout } from '../data-epoch/rootManifest'
import { redactSensitiveString } from '../ipc/logSanitizer'
import { resolveEpoch2EnginePluginInstallDir } from './epoch2EnginePluginLifecycleService'

export const GENERATION_V2_FILE_TYPE_DETECTION_UPDATED_CHANNEL = 'generation-v2:file-type-detection:updated'

export type FileTypeDetectionUpdatedEventV2 = Readonly<{
  conversationId: string | null
  assetRevisionId: string
  status: 'ready' | 'failed'
  revision: number
}>

type QueueItem = Readonly<{
  projection: FileTypeDetectionProjectionV2
  conversationId: string | null
}>

type MagikaStage = Readonly<{
  evidence: FileTypeEvidence | null
  state: FileTypeMagikaState
  modelVersion: string | null
  warning: FileTypeDetectionWarningV2 | null
}>

export class Epoch2FileTypeDetectionService {
  private readonly detections: FileTypeDetectionV2Repo
  private readonly assets: AttachmentAssetV2Repo
  private readonly registry: EnginePluginRegistryRepo
  private readonly queued = new Set<string>()
  private readonly queue: QueueItem[] = []
  private running = false

  constructor(private readonly input: Readonly<{
    db: BetterSqlite3.Database
    attachmentBlobStore: Epoch2AttachmentBlobStoreV2
    layout: Epoch2WorkspaceLayout
    magikaProcessRunner: MagikaProcessRunner
    notify?: (event: FileTypeDetectionUpdatedEventV2) => void
    nowMs?: () => number
  }>) {
    this.detections = new FileTypeDetectionV2Repo(input.db, input.nowMs)
    this.assets = new AttachmentAssetV2Repo(input.db, input.nowMs)
    this.registry = new EnginePluginRegistryRepo(input.db)
  }

  recoverPending(): void {
    for (const projection of this.detections.listPending()) this.schedule(projection, null)
  }

  schedule(projection: FileTypeDetectionProjectionV2, conversationId: string | null): void {
    if (projection.status !== 'pending') return
    const key = this.key(projection)
    if (this.queued.has(key)) return
    this.queued.add(key)
    this.queue.push(Object.freeze({ projection, conversationId }))
    void this.drain()
  }

  retry(conversationId: string, assetRevisionId: string): FileTypeDetectionProjectionV2 {
    const present = this.input.db.prepare(`SELECT 1 FROM composer_draft_attachment_v2
      WHERE conversation_id=? AND attachment_kind='managed_file' AND asset_revision_id=?`).get(
      conversationId, assetRevisionId,
    )
    if (!present) throw new Error('GENERATION_V2_FILE_DETECTION_RETRY_NOT_IN_DRAFT')
    const projection = this.detections.beginRetry(assetRevisionId, `file-detection-attempt:${randomUUID()}`)
    this.schedule(projection, conversationId)
    return projection
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()
        if (!item) continue
        try { await this.detect(item) } finally {
          this.queued.delete(this.key(item.projection))
          try {
            const current = this.detections.get(item.projection.assetRevisionId)
            if (current.status === 'pending' &&
                (current.attemptId !== item.projection.attemptId || current.revision !== item.projection.revision)) {
              this.schedule(current, item.conversationId)
            }
          } catch { /* deletion/reset can legitimately remove the projection */ }
        }
      }
    } finally {
      this.running = false
      if (this.queue.length > 0) void this.drain()
    }
  }

  private async detect(item: QueueItem): Promise<void> {
    const projection = item.projection
    let bytes: Uint8Array | null = null
    try {
      const current = this.detections.get(projection.assetRevisionId)
      if (current.status !== 'pending' || current.attemptId !== projection.attemptId || current.revision !== projection.revision) return
      const fact = this.readSourceRevision(projection.assetRevisionId)
      if (fact.blob.sha256.value !== projection.assetSha256) throw new Error('DETECTION_ASSET_FACT_MISMATCH')
      bytes = this.input.attachmentBlobStore.readRevisionBytes(fact)
      const magika = await this.runMagika(bytes, fact.filename, fact.blob.mime)
      const detected = detectBasicFileTypeV2({
        bytes,
        filename: fact.filename,
        declaredMime: fact.blob.mime,
        detectionTrigger: 'upload',
        additionalEvidence: magika.evidence ? [magika.evidence] : [],
        magika: {
          state: magika.state,
          used: magika.evidence !== null,
          modelVersion: magika.modelVersion,
          failureReason: magika.warning?.code ?? null,
        },
      })
      const committed = this.detections.completeReady({
        assetRevisionId: projection.assetRevisionId,
        attemptId: projection.attemptId,
        revision: projection.revision,
        verdict: detected.verdict,
        staticPolicy: detected.staticPolicy,
        warnings: magika.warning ? [magika.warning] : [],
      })
      if (committed) this.notify(item, 'ready', projection.revision + 1)
    } catch (error) {
      const detail = sanitizeError(error)
      const errorCode = classifyDetectionFailure(error)
      const committed = this.detections.completeFailed({
        assetRevisionId: projection.assetRevisionId,
        attemptId: projection.attemptId,
        revision: projection.revision,
        errorCode,
        errorDetail: detail,
      })
      if (committed) this.notify(item, 'failed', projection.revision + 1)
    } finally {
      bytes?.fill(0)
    }
  }

  private async runMagika(bytes: Uint8Array, filename: string, mime: string): Promise<MagikaStage> {
    const record = this.registry.getByEngineId('magika')
    if (!record || record.installState === 'uninstalled') return stage('not_installed', 'MAGIKA_NOT_INSTALLED', null)
    if (record.pluginVersion !== '0.2.0') return stage('unavailable', 'MAGIKA_VERSION_UNSUPPORTED',
      'The installed Magika version is not supported by this detector. Version 0.2.0 requires a signed catalog release; basic detection remains active.')
    if (!record.enabled) return stage('disabled', 'MAGIKA_DISABLED', null)
    if (record.installState !== 'installed') return stage('unavailable', 'MAGIKA_INSTALL_STATE_INVALID', record.failureReason)
    if (record.healthStatus !== 'healthy') return stage('unavailable', 'MAGIKA_NOT_HEALTHY', record.failureReason)
    if (record.lastVerifiedAt === null) return stage('unavailable', 'MAGIKA_PACKAGE_UNVERIFIED', null)
    const pluginDir = resolveEpoch2EnginePluginInstallDir(this.input.layout, record.installRootKind, record.installRef)
    const discovery = await discoverMagikaManagedPlugin({ pluginDirs: [pluginDir] })
    if (!discovery.available) {
      return stage('failed', `MAGIKA_${discovery.reason.toUpperCase()}`, discovery.detail)
    }
    if (discovery.descriptor.manifest.pluginVersion !== record.pluginVersion) {
      return stage('failed', 'MAGIKA_REGISTRY_PACKAGE_VERSION_MISMATCH', 'Installed package version does not match the verified registry record.')
    }
    try {
      const raw = await createMagikaClassifyCallback(discovery.descriptor, this.input.magikaProcessRunner)({
        probe: { bytes, filename, mime },
        descriptor: discovery.descriptor,
      })
      if (!raw) return stage('failed', 'MAGIKA_INVALID_OUTPUT', 'Classifier returned no evidence.', discovery.descriptor.manifest.modelVersion)
      const modelVersion = raw.modelVersion ?? discovery.descriptor.manifest.modelVersion
      return Object.freeze({
        evidence: mapMagikaOutputToEvidence(raw, { modelVersion, runtimeKind: discovery.descriptor.manifest.runtimeKind }),
        state: 'available',
        modelVersion,
        warning: null,
      })
    } catch (error) {
      if (error instanceof MagikaRuntimeClassificationError) {
        return stage('failed', `MAGIKA_${error.reason.toUpperCase()}`, error.detail ?? error.message, discovery.descriptor.manifest.modelVersion)
      }
      return stage('failed', 'MAGIKA_RUNTIME_ERROR', sanitizeError(error), discovery.descriptor.manifest.modelVersion)
    }
  }

  private readSourceRevision(assetRevisionId: string) {
    const row = this.input.db.prepare('SELECT asset_id FROM asset_revision_v2 WHERE asset_revision_id=? AND revision_kind=\'source\'')
      .get(assetRevisionId) as { asset_id?: unknown } | undefined
    if (!row || typeof row.asset_id !== 'string') throw new Error('DETECTION_SOURCE_REVISION_NOT_FOUND')
    return this.assets.getRevision(row.asset_id, assetRevisionId)
  }

  private notify(item: QueueItem, status: 'ready' | 'failed', revision: number): void {
    this.input.notify?.(Object.freeze({
      conversationId: item.conversationId,
      assetRevisionId: item.projection.assetRevisionId,
      status,
      revision,
    }))
  }

  private key(projection: FileTypeDetectionProjectionV2): string {
    return projection.assetRevisionId
  }
}

function stage(
  state: FileTypeMagikaState,
  code: string,
  detail: string | null,
  modelVersion: string | null = null,
): MagikaStage {
  return Object.freeze({
    evidence: null,
    state,
    modelVersion,
    warning: Object.freeze({ code, detail: sanitizeText(detail) }),
  })
}

function classifyDetectionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('BLOB_MISMATCH')) return 'FILE_DETECTION_BLOB_MISMATCH'
  if (message.includes('SOURCE_REVISION_NOT_FOUND')) return 'FILE_DETECTION_SOURCE_NOT_FOUND'
  if (message.includes('ASSET_FACT_MISMATCH')) return 'FILE_DETECTION_ASSET_FACT_MISMATCH'
  return 'FILE_DETECTION_AUTHORITY_FAILED'
}

function sanitizeError(error: unknown): string {
  return sanitizeText(error instanceof Error ? `${error.name}: ${error.message}` : String(error)) ?? 'Unknown detection authority failure.'
}

function sanitizeText(value: string | null): string | null {
  if (!value) return null
  return redactSensitiveString(value.trim().slice(0, 2048))
}

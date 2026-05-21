import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { EnginePluginRegistryRepo } from '../db/repo/enginePluginRegistryRepo'
import { FileAssetRepo } from '../db/repo/fileAssetRepo'
import { FileTypeVerdictRepo } from '../db/repo/fileTypeVerdictRepo'
import type { FileTypeVerdict } from '../../src/next/file-type'
import {
  createMockMagikaRuntimeLoader,
  createUnavailableMagikaRuntimeLoader,
  type MagikaRuntimeLoader,
} from '../../src/next/file-type/magikaRuntimeLoader'
import {
  CURRENT_FILE_TYPE_VERDICT_VERSION_INFO,
  FileTypeDetectionService,
} from './fileTypeDetectionService'
import { FileTypeDetectionCoordinator } from './fileTypeDetectionCoordinator'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

async function withHarness(
  input: Readonly<{ loader?: MagikaRuntimeLoader }> = {},
  run: (ctx: Readonly<{
    db: BetterSqlite3.Database
    storageRootDir: string
    fileAssetRepo: FileAssetRepo
    fileTypeVerdictRepo: FileTypeVerdictRepo
    enginePluginRegistryRepo: EnginePluginRegistryRepo
    coordinator: FileTypeDetectionCoordinator
  }>) => Promise<void>
) {
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-f1-coordinator-'))
  const fileAssetRepo = new FileAssetRepo(db)
  const fileTypeVerdictRepo = new FileTypeVerdictRepo(db)
  const enginePluginRegistryRepo = new EnginePluginRegistryRepo(db)
  const loader = input.loader ?? createUnavailableMagikaRuntimeLoader()
  const fileTypeDetectionService = new FileTypeDetectionService({
    db,
    fileAssetRepo,
    fileTypeVerdictRepo,
    storageRootDir,
    magikaRuntimeLoader: loader,
    now: () => 1_000,
  })
  const coordinator = new FileTypeDetectionCoordinator({
    fileTypeVerdictRepo,
    enginePluginRegistryRepo,
    fileTypeDetectionService,
    magikaRuntimeLoader: loader,
  })
  try {
    await run({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo, enginePluginRegistryRepo, coordinator })
  } finally {
    db.close()
    await rm(storageRootDir, { recursive: true, force: true })
  }
}

async function createStoredAsset(
  ctx: Readonly<{ storageRootDir: string; fileAssetRepo: FileAssetRepo }>,
  assetId: string,
  text = 'hello strict verdict routing'
) {
  const storageUri = `assets/original/${assetId.slice(0, 2)}/${assetId}.txt`
  const finalPath = path.resolve(ctx.storageRootDir, ...storageUri.split('/'))
  await mkdir(path.dirname(finalPath), { recursive: true })
  await writeFile(finalPath, text)
  ctx.fileAssetRepo.create({
    id: assetId,
    sha256: null,
    filename: `${assetId}.txt`,
    extension: 'txt',
    mime: 'text/plain',
    sizeBytes: Buffer.byteLength(text),
    assetKind: 'text',
    sourceKind: 'local_upload',
    storageBackend: 'local_fs',
    storageUri,
    ingestStatus: 'stored',
    previewStatus: 'not_requested',
  })
}

function upsertMagikaRegistry(
  repo: EnginePluginRegistryRepo,
  overrides: Partial<Parameters<EnginePluginRegistryRepo['upsert']>[0]> = {}
) {
  repo.upsert({
    engineId: 'magika',
    displayName: 'Magika',
    pluginVersion: '1.0.0',
    manifestSchemaVersion: '1',
    manifestHash: 'a'.repeat(64),
    runtimeKind: 'local_loader',
    modelVersion: 'magika-v1',
    installState: 'installed',
    enabled: true,
    healthStatus: 'healthy',
    installSource: 'official_catalog',
    installRootKind: 'managed_root',
    installRef: 'magika_official',
    updatedAt: 1_000,
    ...overrides,
  })
}

function readDetectionMeta(db: BetterSqlite3.Database, assetId: string): Record<string, unknown> | null {
  const row = db.prepare(`
    SELECT source_meta_json AS sourceMetaJson
    FROM file_assets
    WHERE id=@id
    LIMIT 1
  `).get({ id: assetId }) as { sourceMetaJson?: string | null } | undefined
  if (!row?.sourceMetaJson) return null
  const parsed = JSON.parse(row.sourceMetaJson) as Record<string, unknown>
  const meta = parsed.fileTypeDetection
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null
}

function insertAdvancedVerdict(fileTypeVerdictRepo: FileTypeVerdictRepo, assetId: string) {
  const verdict: FileTypeVerdict = {
    primary: {
      formatId: 'plain_text',
      kind: 'text',
      confidence: 'high',
      reasonCodes: [],
      sourceCodeMeta: null,
    },
    conflicts: [],
    flags: [],
    evidence: [{
      source: 'magika',
      detectedFormatId: 'plain_text',
      detectedMime: null,
      detectedExtension: null,
      confidence: 'high',
      reasonCodes: [],
      errorCode: null,
      note: 'magika:txt:0.990',
      engineVersion: 'magika-v1',
      engineRuntimeKind: 'mock',
    }],
    provenance: {
      detectionLevel: 'advanced',
      engineMode: 'core_plus_magika',
      usedMagika: true,
      magikaState: 'available',
      evidenceSources: ['magika'],
      decisiveEvidenceSource: 'magika',
      detectionTrigger: 'upload',
      routeEligibility: 'verdict_ready',
      magikaModelVersion: 'magika-v1',
      advancedAttempted: true,
      advancedFailureReason: null,
    },
    schemaVersion: CURRENT_FILE_TYPE_VERDICT_VERSION_INFO.schemaVersion,
    taxonomyVersion: CURRENT_FILE_TYPE_VERDICT_VERSION_INFO.taxonomyVersion,
    detectionCost: 'medium',
    fingerprint: `${assetId}-fp`,
  }
  return fileTypeVerdictRepo.upsertCurrent({
    assetId,
    verdict,
    primaryFormatId: 'plain_text',
    primaryKind: 'text',
    confidenceLevel: 'high',
    versionInfo: {
      ...CURRENT_FILE_TYPE_VERDICT_VERSION_INFO,
      magikaModelVersion: 'magika-v1',
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
    updatedAt: 1_000,
  })
}

describe('FileTypeDetectionCoordinator', () => {
  it('routes to basic detection when Magika is not installed', async () => {
    await withHarness({}, async (ctx) => {
      await createStoredAsset(ctx, 'asset-basic')

      const result = await ctx.coordinator.ensureVerdictForAsset('asset-basic', { detectionTrigger: 'send_plan_build' })

      expect(result).toMatchObject({ status: 'ready', pipeline: 'basic', magikaState: 'not_installed' })
      expect(result.verdict?.verdict.provenance).toMatchObject({
        detectionLevel: 'basic',
        engineMode: 'core_only',
        usedMagika: false,
        magikaState: 'not_installed',
        routeEligibility: 'verdict_ready',
      })
      expect(result.verdict?.verdict.evidence.some((item) => item.source === 'magika')).toBe(false)
    })
  })

  it('routes to basic detection without loading Magika when the plugin is disabled', async () => {
    let loadCalls = 0
    await withHarness({
      loader: {
        load: () => {
          loadCalls += 1
          return createMockMagikaRuntimeLoader({ modelVersion: 'magika-v1', output: { label: 'txt', score: 0.99 } }).load()
        },
      },
    }, async (ctx) => {
      await createStoredAsset(ctx, 'asset-disabled')
      upsertMagikaRegistry(ctx.enginePluginRegistryRepo, { enabled: false })

      const result = await ctx.coordinator.ensureVerdictForAsset('asset-disabled', { detectionTrigger: 'upload' })

      expect(loadCalls).toBe(0)
      expect(result).toMatchObject({ status: 'ready', pipeline: 'basic', magikaState: 'disabled' })
      expect(result.verdict?.verdict.provenance).toMatchObject({
        detectionLevel: 'basic',
        engineMode: 'core_only',
        usedMagika: false,
        magikaState: 'disabled',
      })
    })
  })

  it('routes to basic detection without loading Magika when registry health is unhealthy', async () => {
    let loadCalls = 0
    await withHarness({
      loader: {
        load: () => {
          loadCalls += 1
          return createMockMagikaRuntimeLoader({ modelVersion: 'magika-v1', output: { label: 'txt', score: 0.99 } }).load()
        },
      },
    }, async (ctx) => {
      await createStoredAsset(ctx, 'asset-unhealthy')
      upsertMagikaRegistry(ctx.enginePluginRegistryRepo, {
        healthStatus: 'unhealthy',
        failureReason: 'engine_failed',
      })

      const result = await ctx.coordinator.ensureVerdictForAsset('asset-unhealthy', { detectionTrigger: 'upload' })

      expect(loadCalls).toBe(0)
      expect(result).toMatchObject({ status: 'ready', pipeline: 'basic', magikaState: 'failed' })
      expect(result.verdict?.verdict.provenance).toMatchObject({
        detectionLevel: 'basic',
        engineMode: 'core_only',
        usedMagika: false,
        magikaState: 'failed',
      })
      expect(result.verdict?.verdict.evidence.some((item) => item.source === 'magika')).toBe(false)
    })
  })

  it('routes to advanced detection when Magika is installed, enabled, and available', async () => {
    await withHarness({
      loader: createMockMagikaRuntimeLoader({
        modelVersion: 'magika-v1',
        output: { label: 'txt', score: 0.99 },
      }),
    }, async (ctx) => {
      await createStoredAsset(ctx, 'asset-advanced')
      upsertMagikaRegistry(ctx.enginePluginRegistryRepo)

      const result = await ctx.coordinator.ensureVerdictForAsset('asset-advanced', { detectionTrigger: 'send_plan_build' })

      expect(result).toMatchObject({ status: 'ready', pipeline: 'advanced', magikaState: 'available' })
      expect(result.verdict?.versionInfo.magikaModelVersion).toBe('magika-v1')
      expect(result.verdict?.verdict.provenance).toMatchObject({
        detectionLevel: 'advanced',
        engineMode: 'core_plus_magika',
        usedMagika: true,
        magikaState: 'available',
        magikaModelVersion: 'magika-v1',
      })
      expect(result.verdict?.verdict.provenance?.evidenceSources).toContain('magika')
      expect(result.verdict?.verdict.evidence.some((item) => item.source === 'magika')).toBe(true)
    })
  })

  it('routes to basic when registry is healthy but loader reports missing dependency', async () => {
    let loadCalls = 0
    await withHarness({
      loader: {
        load: () => {
          loadCalls += 1
          return {
            available: false,
            runtimeKind: 'local_loader',
            modelVersion: 'magika-v1',
            reason: 'magika_runtime_missing_dependency',
            detail: 'rootCause=ERR_MODULE_NOT_FOUND',
          }
        },
      },
    }, async (ctx) => {
      await createStoredAsset(ctx, 'asset-missing-dep', '%PDF-1.7\nbody')
      upsertMagikaRegistry(ctx.enginePluginRegistryRepo)

      const result = await ctx.coordinator.ensureVerdictForAsset('asset-missing-dep', { detectionTrigger: 'upload' })

      expect(loadCalls).toBe(1)
      expect(result).toMatchObject({ status: 'ready', pipeline: 'basic', magikaState: 'failed' })
      expect(result.verdict?.verdict.evidence.some((item) => item.source === 'magika')).toBe(false)
      expect(result.verdict?.verdict.provenance).toMatchObject({
        detectionLevel: 'basic',
        engineMode: 'core_only',
        usedMagika: false,
        magikaState: 'failed',
      })
    })
  })

  it('marks advanced detection failed when Magika fails after routing to detectFull', async () => {
    await withHarness({
      loader: createMockMagikaRuntimeLoader({
        modelVersion: 'magika-v1',
        classify: () => {
          throw new Error('classifier crashed')
        },
      }),
    }, async (ctx) => {
      await createStoredAsset(ctx, 'asset-advanced-failed')
      upsertMagikaRegistry(ctx.enginePluginRegistryRepo)

      const result = await ctx.coordinator.ensureVerdictForAsset('asset-advanced-failed', { detectionTrigger: 'send_plan_build' })

      expect(result).toMatchObject({ status: 'failed', pipeline: 'advanced', magikaState: 'available' })
      expect(result.verdict).toBeNull()
      expect(ctx.fileTypeVerdictRepo.getCurrentByAssetId('asset-advanced-failed')).toBeNull()
      expect(readDetectionMeta(ctx.db, 'asset-advanced-failed')).toMatchObject({
        routeEligibility: 'detection_failed',
        detectionLevel: 'advanced',
        engineMode: 'core_plus_magika',
        usedMagika: false,
        magikaState: 'failed',
        advancedAttempted: true,
        advancedFailureReason: 'runtime_error',
      })
    })
  })

  it('reuses an existing advanced verdict even when current Magika is disabled', async () => {
    await withHarness({}, async (ctx) => {
      await createStoredAsset(ctx, 'asset-existing-advanced')
      upsertMagikaRegistry(ctx.enginePluginRegistryRepo, { enabled: false })
      const existing = insertAdvancedVerdict(ctx.fileTypeVerdictRepo, 'asset-existing-advanced')

      const result = await ctx.coordinator.ensureVerdictForAsset('asset-existing-advanced', { detectionTrigger: 'send_plan_build' })

      expect(result).toMatchObject({
        status: 'ready',
        fromCache: true,
        reusedCurrent: true,
        pipeline: null,
      })
      expect(result.verdict?.id).toBe(existing.id)
      expect(result.verdict?.verdict.provenance).toMatchObject({
        detectionLevel: 'advanced',
        usedMagika: true,
        magikaState: 'available',
      })
    })
  })
})

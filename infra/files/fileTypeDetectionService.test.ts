import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileAssetRepo } from '../db/repo/fileAssetRepo'
import { FileTypeVerdictRepo } from '../db/repo/fileTypeVerdictRepo'
import { FileTypeDetectionService } from './fileTypeDetectionService'
import type { MagikaAdapter } from '../../src/next/file-type/magikaAdapter'
import {
  createMockMagikaRuntimeLoader,
  createUnavailableMagikaRuntimeLoader,
} from '../../src/next/file-type/magikaRuntimeLoader'
import { createManagedPluginMagikaRuntimeLoader } from '../../src/next/file-type/magikaManagedPlugin'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

async function withHarness(
  run: (ctx: Readonly<{
    db: BetterSqlite3.Database
    storageRootDir: string
    fileAssetRepo: FileAssetRepo
    fileTypeVerdictRepo: FileTypeVerdictRepo
  }>) => Promise<void>
) {
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-stage-e-'))
  const fileAssetRepo = new FileAssetRepo(db)
  const fileTypeVerdictRepo = new FileTypeVerdictRepo(db)
  try {
    await run({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo })
  } finally {
    db.close()
    await rm(storageRootDir, { recursive: true, force: true })
  }
}

async function writeAssetFile(storageRootDir: string, storageUri: string, text: string): Promise<void> {
  const finalPath = path.resolve(storageRootDir, ...storageUri.split('/'))
  await mkdir(path.dirname(finalPath), { recursive: true })
  await writeFile(finalPath, text)
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

// eslint-disable-next-line max-lines-per-function
describe('FileTypeDetectionService', () => {
  it('detectBasic writes current verdict and marks job ready', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-1.txt'
      await writeAssetFile(storageRootDir, storageUri, 'hello stage e')
      fileAssetRepo.create({
        id: 'asset-1',
        sha256: null,
        filename: 'asset-1.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 13,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        now: (() => {
          let tick = 1000
          return () => ++tick
        })(),
      })

      const result = await service.detectBasic({ assetId: 'asset-1' })
      expect(result.job.status).toBe('ready')
      expect(result.fromCache).toBe(false)
      expect(result.verdict?.assetId).toBe('asset-1')
      expect(result.verdict?.primaryFormatId).toBe('plain_text')
      expect(result.verdict?.fingerprintJson.fullHashStatus).toBe('computed')

      const meta = readDetectionMeta(db, 'asset-1')
      expect(meta?.currentJobId).toBe(result.job.jobId)
      expect((meta?.lastJob as any)?.status).toBe('ready')
      expect(meta?.stale).toBe(false)
    })
  })

  it('reuses current verdict when fingerprint unchanged and forceRedetect is false', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-2.txt'
      await writeAssetFile(storageRootDir, storageUri, 'stable content')
      fileAssetRepo.create({
        id: 'asset-2',
        sha256: null,
        filename: 'asset-2.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 14,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
      })

      const first = await service.detectBasic({ assetId: 'asset-2' })
      const second = await service.detectBasic({ assetId: 'asset-2' })
      expect(first.verdict?.id).toBeTruthy()
      expect(second.fromCache).toBe(true)
      expect(second.verdict?.id).toBe(first.verdict?.id)
    })
  })

  it('marks stale on fingerprint mismatch and writes a new current verdict', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-3.txt'
      await writeAssetFile(storageRootDir, storageUri, 'first content')
      fileAssetRepo.create({
        id: 'asset-3',
        sha256: null,
        filename: 'asset-3.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 13,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
      })

      const first = await service.detectBasic({ assetId: 'asset-3' })
      await writeAssetFile(storageRootDir, storageUri, 'second content changed')
      const second = await service.detectBasic({ assetId: 'asset-3' })

      expect(first.verdict?.id).toBeTruthy()
      expect(second.verdict?.id).toBeTruthy()
      expect(second.verdict?.id).not.toBe(first.verdict?.id)

      const staleRows = db.prepare(`
        SELECT is_current AS isCurrent, stale_reason AS staleReason
        FROM file_type_verdicts
        WHERE asset_id='asset-3'
        ORDER BY created_at ASC
      `).all() as Array<{ isCurrent: number; staleReason: string | null }>
      expect(staleRows.length).toBe(2)
      expect(staleRows[0]).toEqual({ isCurrent: 0, staleReason: 'fingerprint_mismatch' })
      expect(staleRows[1]).toEqual({ isCurrent: 1, staleReason: null })
    })
  })

  it('cancels stale job writeback when currentJobId is superseded by a newer job', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-4.txt'
      await writeAssetFile(storageRootDir, storageUri, 'parallel detection')
      fileAssetRepo.create({
        id: 'asset-4',
        sha256: null,
        filename: 'asset-4.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 18,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      let readCount = 0
      let releaseFirst: (() => void) | null = null
      const waitFirst = new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      const slowRead = async (filePath: string): Promise<Uint8Array> => {
        readCount += 1
        if (readCount === 1) await waitFirst
        return new Uint8Array(await readFileSync(filePath))
      }

      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        readBytes: slowRead,
      })

      const firstPromise = service.detectBasic({ assetId: 'asset-4', forceRedetect: true })
      const secondPromise = service.detectBasic({ assetId: 'asset-4', forceRedetect: true })
      if (releaseFirst) releaseFirst()
      const [first, second] = await Promise.all([firstPromise, secondPromise])

      expect([first.job.status, second.job.status].sort()).toEqual(['cancelled', 'ready'])
      const current = fileTypeVerdictRepo.getCurrentByAssetId('asset-4')
      expect(current).toBeTruthy()
      const meta = readDetectionMeta(db, 'asset-4')
      expect((meta?.lastJob as any)?.status).toBe('ready')
    })
  })

  it('returns failed when asset path is unavailable and does not write verdict rows', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      fileAssetRepo.create({
        id: 'asset-5',
        sha256: null,
        filename: 'asset-5.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 0,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri: 'assets/original/ab/missing.txt',
        ingestStatus: 'stored',
      })

      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
      })

      const result = await service.detectBasic({ assetId: 'asset-5' })
      expect(result.job.status).toBe('failed')
      expect(result.job.errorCode).toBe('error.read_failed')
      expect(result.verdict).toBeNull()
      expect(fileTypeVerdictRepo.getCurrentByAssetId('asset-5')).toBeNull()
    })
  })

  it('runs detectFull with magika adapter while keeping taxonomy mapping bounded', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-6.txt'
      await writeAssetFile(storageRootDir, storageUri, '{"k":"v"}')
      fileAssetRepo.create({
        id: 'asset-6',
        sha256: null,
        filename: 'asset-6.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 9,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const adapter: MagikaAdapter = {
        detect: () => ({ label: 'json', score: 0.99 }),
      }
      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaAdapter: adapter,
      })

      const result = await service.detectFull({ assetId: 'asset-6' })
      expect(result.job.status).toBe('ready')
      expect(result.verdict?.verdict.evidence.some((item) => item.source === 'magika')).toBe(true)
      expect(result.verdict?.primaryFormatId).toBe('json')
    })
  })

  it('writes magikaModelVersion from runtime loader provenance on detectFull', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-7.txt'
      await writeAssetFile(storageRootDir, storageUri, '{"name":"starverse"}')
      fileAssetRepo.create({
        id: 'asset-7',
        sha256: null,
        filename: 'asset-7.txt',
        extension: 'txt',
        mime: 'application/json',
        sizeBytes: 21,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaRuntimeLoader: createMockMagikaRuntimeLoader({
          modelVersion: 'magika-model-v1',
          output: { label: 'json', score: 0.99 },
        }),
      })

      const result = await service.detectFull({ assetId: 'asset-7' })
      expect(result.job.status).toBe('ready')
      expect(result.verdict?.versionInfo.magikaModelVersion).toBe('magika-model-v1')
      const magikaEvidence = result.verdict?.verdict.evidence.find((item) => item.source === 'magika')
      expect(magikaEvidence?.engineVersion).toBe('magika-model-v1')
    })
  })

  it('falls back when magika runtime is unavailable and keeps detectFull usable', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-8.txt'
      await writeAssetFile(storageRootDir, storageUri, 'fallback text content')
      fileAssetRepo.create({
        id: 'asset-8',
        sha256: null,
        filename: 'asset-8.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 21,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaRuntimeLoader: createUnavailableMagikaRuntimeLoader({
          reason: 'runtime_unavailable',
          detail: 'runtime is not configured',
          modelVersion: 'magika-model-v2',
        }),
      })

      const result = await service.detectFull({ assetId: 'asset-8' })
      expect(result.job.status).toBe('ready')
      expect(result.verdict?.primaryFormatId).toBe('plain_text')
      expect(result.verdict?.verdict.evidence.some((item) => item.source === 'magika')).toBe(false)
      expect(result.verdict?.versionInfo.magikaModelVersion).toBe('magika-model-v2')
    })
  })

  it('invalidates full-mode cache when magika model version changes', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-9.txt'
      await writeAssetFile(storageRootDir, storageUri, '{"id":9}')
      fileAssetRepo.create({
        id: 'asset-9',
        sha256: null,
        filename: 'asset-9.txt',
        extension: 'txt',
        mime: 'application/json',
        sizeBytes: 8,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const serviceV1 = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaRuntimeLoader: createMockMagikaRuntimeLoader({
          modelVersion: 'magika-model-v1',
          output: { label: 'json', score: 0.92 },
        }),
      })

      const first = await serviceV1.detectFull({ assetId: 'asset-9' })
      expect(first.fromCache).toBe(false)

      const serviceV2 = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaRuntimeLoader: createMockMagikaRuntimeLoader({
          modelVersion: 'magika-model-v2',
          output: { label: 'json', score: 0.92 },
        }),
      })

      const second = await serviceV2.detectFull({ assetId: 'asset-9' })
      expect(second.fromCache).toBe(false)
      expect(second.verdict?.id).not.toBe(first.verdict?.id)
      expect(second.verdict?.versionInfo.magikaModelVersion).toBe('magika-model-v2')
      const rows = db.prepare(`
        SELECT is_current AS isCurrent, stale_reason AS staleReason
        FROM file_type_verdicts
        WHERE asset_id='asset-9'
        ORDER BY created_at ASC
      `).all() as Array<{ isCurrent: number; staleReason: string | null }>
      expect(rows).toHaveLength(2)
      expect(rows[0]?.staleReason).toBe('magika_model_version_changed')
      expect(rows[1]?.isCurrent).toBe(1)
    })
  })

  it('marks magika evidence with adapter_only runtimeKind when only magikaAdapter is injected', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-10.txt'
      await writeAssetFile(storageRootDir, storageUri, '{"x":1}')
      fileAssetRepo.create({
        id: 'asset-10',
        sha256: null,
        filename: 'asset-10.txt',
        extension: 'txt',
        mime: 'application/json',
        sizeBytes: 7,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const adapter: MagikaAdapter = {
        detect: () => ({ label: 'json', score: 0.97 }),
      }
      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaAdapter: adapter,
        // magikaRuntimeLoader intentionally NOT injected
      })

      const result = await service.detectFull({ assetId: 'asset-10' })
      expect(result.job.status).toBe('ready')

      const magikaEvidence = result.verdict?.verdict.evidence.find((item) => item.source === 'magika')
      expect(magikaEvidence).toBeTruthy()
      expect(magikaEvidence?.engineRuntimeKind).toBe('adapter_only')
      expect(magikaEvidence?.engineRuntimeKind).not.toBe('mock')
    })
  })

  it('does not infer magikaModelVersion from static versionInfo when only adapter is injected', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-11.txt'
      await writeAssetFile(storageRootDir, storageUri, 'hello from adapter-only')
      fileAssetRepo.create({
        id: 'asset-11',
        sha256: null,
        filename: 'asset-11.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 22,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const adapter: MagikaAdapter = {
        detect: () => ({ label: 'txt', score: 0.85 }),
      }
      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaAdapter: adapter,
        versionInfo: { magikaModelVersion: 'should-not-leak' },
      })

      const result = await service.detectFull({ assetId: 'asset-11' })
      expect(result.job.status).toBe('ready')
      expect(result.verdict?.versionInfo.magikaModelVersion).toBeNull()

      const magikaEvidence = result.verdict?.verdict.evidence.find((item) => item.source === 'magika')
      expect(magikaEvidence?.engineVersion).toBeNull()
    })
  })

  it('keeps detectFull ready via fallback when managed plugin is unavailable', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-12.txt'
      await writeAssetFile(storageRootDir, storageUri, 'managed plugin fallback')
      fileAssetRepo.create({
        id: 'asset-12',
        sha256: null,
        filename: 'asset-12.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 23,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaRuntimeLoader: createManagedPluginMagikaRuntimeLoader({
          pluginDirs: [path.join(storageRootDir, '.missing-magika-plugin')],
        }),
      })

      const result = await service.detectFull({ assetId: 'asset-12' })
      expect(result.job.status).toBe('ready')
      expect(result.verdict?.primaryFormatId).toBe('plain_text')
      expect(result.verdict?.verdict.evidence.some((item) => item.source === 'magika')).toBe(false)
    })
  })

  it('does not invoke magika plugin loader during detectBasic', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-13.txt'
      await writeAssetFile(storageRootDir, storageUri, 'detect basic no magika runtime')
      fileAssetRepo.create({
        id: 'asset-13',
        sha256: null,
        filename: 'asset-13.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 30,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      let loadCalls = 0
      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaRuntimeLoader: {
          load: () => {
            loadCalls += 1
            return {
              available: true,
              runtime: {
                kind: 'local_loader',
                modelVersion: 'v-test',
                classify: () => ({ label: 'json', score: 0.99 }),
              },
            }
          },
        },
      })

      const result = await service.detectBasic({ assetId: 'asset-13' })
      expect(result.job.status).toBe('ready')
      expect(loadCalls).toBe(0)
      expect(result.verdict?.verdict.evidence.some((item) => item.source === 'magika')).toBe(false)
    })
  })

  it('runs detectFull with classify callback through mock runtime loader', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-14.txt'
      await writeAssetFile(storageRootDir, storageUri, 'classify callback test')
      fileAssetRepo.create({
        id: 'asset-14',
        sha256: null,
        filename: 'asset-14.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 22,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaRuntimeLoader: createMockMagikaRuntimeLoader({
          modelVersion: 'magika-model-p4b4',
          runtimeKind: 'local_loader',
          classify: async () => ({ label: 'json', score: 0.98 }),
        }),
      })

      const result = await service.detectFull({ assetId: 'asset-14' })
      expect(result.job.status).toBe('ready')
      const magikaEvidence = result.verdict?.verdict.evidence.find((item) => item.source === 'magika')
      expect(magikaEvidence).toBeTruthy()
      expect(magikaEvidence?.detectedFormatId).toBe('json')
      expect(result.verdict?.versionInfo.magikaModelVersion).toBe('magika-model-p4b4')
    })
  })

  it('reuses cache in detectFull when fingerprint and all version fields match', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-15.txt'
      await writeAssetFile(storageRootDir, storageUri, 'cache-reuse-full-test')
      fileAssetRepo.create({
        id: 'asset-15',
        sha256: null,
        filename: 'asset-15.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 22,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const versionInfo = {
        schemaVersion: 'v-test',
        taxonomyVersion: 'tax-v1',
        taxonomyMapVersion: 'map-v1',
        magicTableVersion: 'magic-v1',
        mergeRulesVersion: 'merge-v1',
        containerProbeVersion: 'container-v1',
        textProbeVersion: 'text-v1',
        magikaModelVersion: 'magika-v1',
      }
      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        versionInfo,
        magikaRuntimeLoader: createMockMagikaRuntimeLoader({
          modelVersion: 'magika-v1',
          output: { label: 'txt', score: 0.99 },
        }),
      })

      const first = await service.detectFull({ assetId: 'asset-15' })
      expect(first.fromCache).toBe(false)
      expect(first.verdict?.versionInfo.magikaModelVersion).toBe('magika-v1')

      const second = await service.detectFull({ assetId: 'asset-15' })
      expect(second.fromCache).toBe(true)
      expect(second.verdict?.id).toBe(first.verdict?.id)
    })
  })

  it('invalidates full-mode cache when taxonomyMapVersion changes', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-16.txt'
      await writeAssetFile(storageRootDir, storageUri, '{"v":16}')
      fileAssetRepo.create({
        id: 'asset-16',
        sha256: null,
        filename: 'asset-16.txt',
        extension: 'txt',
        mime: 'application/json',
        sizeBytes: 8,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const baseVersion = {
        schemaVersion: 'v-test',
        taxonomyVersion: 'tax-v1',
        taxonomyMapVersion: 'map-v1',
        magicTableVersion: 'magic-v1',
        mergeRulesVersion: 'merge-v1',
        containerProbeVersion: 'container-v1',
        textProbeVersion: 'text-v1',
        magikaModelVersion: null,
      }

      const serviceV1 = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        versionInfo: baseVersion,
        magikaRuntimeLoader: createMockMagikaRuntimeLoader({
          modelVersion: 'magika-v1',
          output: { label: 'json', score: 0.95 },
        }),
      })

      const first = await serviceV1.detectFull({ assetId: 'asset-16' })
      expect(first.fromCache).toBe(false)
      expect(first.verdict?.versionInfo.taxonomyMapVersion).toBe('map-v1')

      const serviceV2 = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        versionInfo: { ...baseVersion, taxonomyMapVersion: 'map-v2' },
        magikaRuntimeLoader: createMockMagikaRuntimeLoader({
          modelVersion: 'magika-v1',
          output: { label: 'json', score: 0.95 },
        }),
      })

      const second = await serviceV2.detectFull({ assetId: 'asset-16' })
      expect(second.fromCache).toBe(false)
      expect(second.verdict?.versionInfo.taxonomyMapVersion).toBe('map-v2')

      const rows = db.prepare(`
        SELECT stale_reason AS staleReason, is_current AS isCurrent
        FROM file_type_verdicts
        WHERE asset_id='asset-16'
        ORDER BY created_at ASC
      `).all() as Array<{ staleReason: string | null; isCurrent: number }>
      expect(rows[0]?.staleReason).toBe('taxonomy_map_version_changed')
      expect(rows[1]?.isCurrent).toBe(1)
    })
  })

  it('invalidates full-mode cache when mergeRulesVersion changes', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-17.txt'
      await writeAssetFile(storageRootDir, storageUri, 'merge-version-test')
      fileAssetRepo.create({
        id: 'asset-17',
        sha256: null,
        filename: 'asset-17.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 19,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const baseVersion = {
        schemaVersion: 'v-test',
        taxonomyVersion: 'tax-v1',
        taxonomyMapVersion: 'map-v1',
        magicTableVersion: 'magic-v1',
        mergeRulesVersion: 'merge-v1',
        containerProbeVersion: 'container-v1',
        textProbeVersion: 'text-v1',
        magikaModelVersion: null,
      }

      const serviceV1 = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        versionInfo: baseVersion,
        magikaRuntimeLoader: createMockMagikaRuntimeLoader({
          modelVersion: 'magika-v1',
          output: { label: 'txt', score: 0.85 },
        }),
      })

      const first = await serviceV1.detectFull({ assetId: 'asset-17' })
      expect(first.fromCache).toBe(false)

      const serviceV2 = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        versionInfo: { ...baseVersion, mergeRulesVersion: 'merge-v2' },
        magikaRuntimeLoader: createMockMagikaRuntimeLoader({
          modelVersion: 'magika-v1',
          output: { label: 'txt', score: 0.85 },
        }),
      })

      const second = await serviceV2.detectFull({ assetId: 'asset-17' })
      expect(second.fromCache).toBe(false)

      const rows = db.prepare(`
        SELECT stale_reason AS staleReason
        FROM file_type_verdicts
        WHERE asset_id='asset-17' AND is_current = 0
      `).all() as Array<{ staleReason: string | null }>
      expect(rows[0]?.staleReason).toBe('merge_rules_version_changed')
    })
  })

  it('invalidates basic-mode cache when any static version field changes', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-18.txt'
      await writeAssetFile(storageRootDir, storageUri, 'basic version cache test')
      fileAssetRepo.create({
        id: 'asset-18',
        sha256: null,
        filename: 'asset-18.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 24,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      const serviceV1 = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        versionInfo: {
          schemaVersion: 'v1',
          taxonomyVersion: 'tax-v1',
          taxonomyMapVersion: 'map-v1',
          magicTableVersion: 'magic-v1',
          mergeRulesVersion: 'merge-v1',
          containerProbeVersion: 'container-v1',
          textProbeVersion: 'text-v1',
          magikaModelVersion: null,
        },
      })

      const first = await serviceV1.detectBasic({ assetId: 'asset-18' })
      expect(first.fromCache).toBe(false)

      const serviceV2 = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        versionInfo: {
          schemaVersion: 'v2',
          taxonomyVersion: 'tax-v1',
          taxonomyMapVersion: 'map-v1',
          magicTableVersion: 'magic-v1',
          mergeRulesVersion: 'merge-v1',
          containerProbeVersion: 'container-v1',
          textProbeVersion: 'text-v1',
          magikaModelVersion: null,
        },
      })

      const second = await serviceV2.detectBasic({ assetId: 'asset-18' })
      expect(second.fromCache).toBe(false)
      expect(second.verdict?.id).not.toBe(first.verdict?.id)
    })
  })

  it('does not poison full-mode cache when magika runtime is unavailable', async () => {
    await withHarness(async ({ db, storageRootDir, fileAssetRepo, fileTypeVerdictRepo }) => {
      const storageUri = 'assets/original/ab/asset-19.txt'
      await writeAssetFile(storageRootDir, storageUri, 'cache poison test')
      fileAssetRepo.create({
        id: 'asset-19',
        sha256: null,
        filename: 'asset-19.txt',
        extension: 'txt',
        mime: 'text/plain',
        sizeBytes: 17,
        assetKind: 'text',
        sourceKind: 'local_upload',
        storageUri,
        ingestStatus: 'stored',
      })

      // First: Magika unavailable, fallback verdict without Magika evidence
      const serviceUnavailable = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaRuntimeLoader: createUnavailableMagikaRuntimeLoader({
          reason: 'runtime_unavailable',
          detail: 'runtime disabled',
        }),
      })

      const fallback = await serviceUnavailable.detectFull({ assetId: 'asset-19' })
      expect(fallback.job.status).toBe('ready')
      expect(fallback.verdict?.verdict.evidence.some((item) => item.source === 'magika')).toBe(false)

      // Second: Magika available, should re-detect with Magika evidence
      const serviceAvailable = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
        magikaRuntimeLoader: createMockMagikaRuntimeLoader({
          modelVersion: 'magika-v1',
          output: { label: 'txt', score: 0.99 },
        }),
      })

      const fresh = await serviceAvailable.detectFull({ assetId: 'asset-19' })
      expect(fresh.fromCache).toBe(false)
      const magikaEvidence = fresh.verdict?.verdict.evidence.find((item) => item.source === 'magika')
      expect(magikaEvidence).toBeTruthy()
      // The fallback verdict should not have been reused — it had no Magika evidence
      // and was produced with unavailable runtime, so versionInfo mismatch triggers re-detection
    })
  })
})

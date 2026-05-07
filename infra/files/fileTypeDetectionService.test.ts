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
})

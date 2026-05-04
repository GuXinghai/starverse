import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSendPlanCandidates } from '../../src/next/file-type/sendRouteMapping'
import { STAGE_I_FIXTURE_SAMPLES } from '../../src/next/file-type/fixtures/fixtureCorpus'
import type { ModelInputCapabilities } from '../../src/next/file-type/types'
import { FileAssetRepo } from '../db/repo/fileAssetRepo'
import { FileTypeVerdictRepo } from '../db/repo/fileTypeVerdictRepo'
import { FileTypeDetectionService } from './fileTypeDetectionService'

const DEFAULT_CAPABILITIES: ModelInputCapabilities = {
  acceptsText: true,
  acceptsImage: true,
  acceptsAudio: true,
  acceptsVideo: true,
  acceptsFile: true,
  acceptsPdf: true,
  acceptsCsv: true,
  acceptsTsv: true,
  acceptsUrlRef: true,
  acceptsInlineData: true,
}

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

async function withHarness(
  run: (ctx: Readonly<{
    db: BetterSqlite3.Database
    fileAssetRepo: FileAssetRepo
    fileTypeVerdictRepo: FileTypeVerdictRepo
    storageRootDir: string
  }>) => Promise<void>
) {
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  const storageRootDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-stage-i-'))
  const fileAssetRepo = new FileAssetRepo(db)
  const fileTypeVerdictRepo = new FileTypeVerdictRepo(db)
  try {
    await run({ db, fileAssetRepo, fileTypeVerdictRepo, storageRootDir })
  } finally {
    db.close()
    await rm(storageRootDir, { recursive: true, force: true })
  }
}

describe('FileTypeDetectionService fixture matrix (Stage I)', () => {
  it('produces stable detectBasic outputs for representative fixtures', async () => {
    await withHarness(async ({ db, fileAssetRepo, fileTypeVerdictRepo, storageRootDir }) => {
      const service = new FileTypeDetectionService({
        db,
        fileAssetRepo,
        fileTypeVerdictRepo,
        storageRootDir,
      })

      const subset = STAGE_I_FIXTURE_SAMPLES.filter((sample) =>
        ['plain_text', 'pdf', 'docx_minimal', 'exe_renamed_as_pdf', 'zip_slip_archive', 'unknown_binary'].includes(sample.id)
      )
      for (const sample of subset) {
        const storageUri = `assets/original/stage-i/${sample.id}`
        const filePath = path.resolve(storageRootDir, ...storageUri.split('/'))
        await mkdir(path.dirname(filePath), { recursive: true })
        await writeFile(filePath, sample.bytes)
        fileAssetRepo.create({
          id: sample.id,
          sha256: null,
          filename: sample.filename,
          extension: sample.filename.split('.').pop() ?? null,
          mime: sample.mime,
          sizeBytes: sample.bytes.byteLength,
          assetKind: 'binary',
          sourceKind: 'local_upload',
          storageUri,
          ingestStatus: 'stored',
        })
      }

      const checks = {
        plain_text: { formatId: 'plain_text', blocked: false },
        pdf: { formatId: 'pdf', blocked: false },
        docx_minimal: { formatId: 'docx', blocked: false },
        exe_renamed_as_pdf: { formatId: 'windows_exe', blocked: true },
        zip_slip_archive: { formatId: 'zip', blocked: true },
        unknown_binary: { formatId: 'octet_stream', blocked: true },
      } as const

      for (const sample of subset) {
        const result = await service.detectBasic({ assetId: sample.id, forceRedetect: true })
        expect(result.job.status).toBe('ready')
        expect(result.verdict).toBeTruthy()
        const verdict = result.verdict!
        expect(verdict.primaryFormatId).toBe(checks[sample.id as keyof typeof checks].formatId)
        const candidates = buildSendPlanCandidates({
          verdict: verdict.verdict,
          modelCapabilities: DEFAULT_CAPABILITIES,
        })
        expect(candidates[0]?.blocked ?? false).toBe(checks[sample.id as keyof typeof checks].blocked)
      }
    })
  })

  it('detectFull remains deterministic with noop magika adapter', async () => {
    await withHarness(async ({ db, fileAssetRepo, fileTypeVerdictRepo, storageRootDir }) => {
      const sample = STAGE_I_FIXTURE_SAMPLES.find((item) => item.id === 'json')
      expect(sample).toBeTruthy()
      const storageUri = 'assets/original/stage-i/json-full'
      const filePath = path.resolve(storageRootDir, ...storageUri.split('/'))
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, sample!.bytes)
      fileAssetRepo.create({
        id: 'json-full',
        sha256: null,
        filename: sample!.filename,
        extension: sample!.filename.split('.').pop() ?? null,
        mime: sample!.mime,
        sizeBytes: sample!.bytes.byteLength,
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
      const full = await service.detectFull({ assetId: 'json-full', forceRedetect: true })
      expect(full.job.status).toBe('ready')
      expect(full.verdict?.primaryFormatId).toBe('json')
      expect(full.verdict?.verdict.detectionCost).toBe('medium')
    })
  })
})

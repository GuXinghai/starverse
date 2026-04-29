import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FileAssetRepo } from '../db/repo/fileAssetRepo'
import { FileIngestionService } from './fileIngestionService'
import type { FetchLike } from './urlProbe'

function canOpenBetterSqlite(): boolean {
  try {
    const db = new BetterSqlite3(':memory:')
    db.close()
    return true
  } catch {
    return false
  }
}

const describeIfBetterSqlite = canOpenBetterSqlite() ? describe : describe.skip

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function createHarness(ids: string[] = ['asset-1']) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-ingest-'))
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  const repo = new FileAssetRepo(db)
  const idQueue = [...ids]
  const service = new FileIngestionService({
    fileAssetRepo: repo,
    storageRootDir: rootDir,
    idFactory: () => idQueue.shift() ?? `asset-${Date.now()}`,
    now: () => 1234,
  })
  return { db, repo, rootDir, service }
}

function response(
  body: BodyInit | null,
  init: ResponseInit & Readonly<{ url?: string }> = {}
): Response {
  const res = new Response(body, init)
  Object.defineProperty(res, 'url', {
    value: init.url ?? 'https://example.test/file',
  })
  return res
}

describeIfBetterSqlite('FileIngestionService local files', () => {
  it('ingests a local file into storage and file_assets', async () => {
    const h = createHarness(['asset-local'])
    try {
      const sourcePath = path.join(h.rootDir, 'source.md')
      writeFileSync(sourcePath, '# note')

      const result = await h.service.ingestLocalFile({ filePath: sourcePath })
      const asset = h.repo.getById('asset-local')

      expect(result).toMatchObject({
        success: true,
        sourceKind: 'local_upload',
        assetId: 'asset-local',
        normalizedExtension: 'md',
        assetKind: 'text',
        aiPayloadKind: 'text',
        processingStatus: 'native_supported',
        isNativeSupportedForMvp: true,
        isConvertibleCandidate: false,
        importStatus: 'ready',
      })
      expect(result.sendEligibilityHints.canUseLocalFile).toBe(true)
      expect(asset).toMatchObject({
        id: 'asset-local',
        sha256: expect.any(String),
        filename: 'source.md',
        extension: 'md',
        mime: 'text/markdown',
        sizeBytes: 6,
        storageBackend: 'local_fs',
        storageUri: 'assets/original/as/asset-local.md',
        ingestStatus: 'stored',
        sourceMetaJson: {
          importStatus: 'ready',
          materializationStatus: 'stored',
        },
      })
      expect(existsSync(path.join(h.rootDir, 'assets', 'original', 'as', 'asset-local.md'))).toBe(true)
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })

  it('returns a structured failure without creating an asset for missing local files', async () => {
    const h = createHarness(['asset-local'])
    try {
      const result = await h.service.ingestLocalFile({ filePath: path.join(h.rootDir, 'missing.pdf') })

      expect(result).toMatchObject({
        success: false,
        assetId: null,
        sourceKind: 'local_upload',
        importStatus: 'failed',
        failureReasonCode: 'local_read_failed',
      })
      expect(h.repo.listByIds({ ids: ['asset-local'] })).toEqual([])
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })

  it('imports unsupported formats as assets with unsupported processing status', async () => {
    const h = createHarness(['asset-bin'])
    try {
      const sourcePath = path.join(h.rootDir, 'payload.7z')
      writeFileSync(sourcePath, 'archive')

      const result = await h.service.ingestLocalFile({ filePath: sourcePath })

      expect(result).toMatchObject({
        success: true,
        assetKind: 'archive',
        aiPayloadKind: 'binary',
        processingStatus: 'unsupported',
        isNativeSupportedForMvp: false,
      })
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })
})

describeIfBetterSqlite('FileIngestionService URL link_only', () => {
  it('retains URL metadata without writing a local file', async () => {
    const h = createHarness(['asset-url'])
    try {
      const service = serviceWithFetch(h, async (_url, init) => {
        expect(init?.method).toBe('HEAD')
        return response(null, {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-length': '99',
          },
          url: 'https://cdn.example.test/report.pdf',
        })
      })

      const result = await service.ingestUrl({
        url: 'https://example.test/report.pdf',
        retentionMode: 'link_only',
      })
      const asset = h.repo.getById('asset-url')

      expect(result).toMatchObject({
        success: true,
        sourceKind: 'url_import',
        assetId: 'asset-url',
        retentionMode: 'link_only',
        probeStatus: 'accessible',
        materializationStatus: 'not_requested',
        originalUrl: 'https://example.test/report.pdf',
        resolvedUrl: 'https://cdn.example.test/report.pdf',
        assetKind: 'document',
        aiPayloadKind: 'pdf',
      })
      expect(result.sendEligibilityHints.canUseUrlRef).toBe(true)
      expect(result.sendEligibilityHints.canUseLocalFile).toBe(false)
      expect(asset).toMatchObject({
        sha256: null,
        storageBackend: 'remote_url',
        storageUri: 'https://cdn.example.test/report.pdf',
        sourceMetaJson: {
          originalUrl: 'https://example.test/report.pdf',
          resolvedUrl: 'https://cdn.example.test/report.pdf',
          retentionMode: 'link_only',
          probeStatus: 'accessible',
          materializationStatus: 'not_requested',
          contentTypeFromProbe: 'application/pdf',
          contentLengthFromProbe: 99,
        },
      })
      expect(existsSync(path.join(h.rootDir, 'assets', 'original'))).toBe(false)
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })
})

describeIfBetterSqlite('FileIngestionService URL link_only failures', () => {
  it('keeps URL reference eligibility when probing fails on this device', async () => {
    const h = createHarness(['asset-url-fail'])
    try {
      const service = serviceWithFetch(h, async () => {
        throw new Error('network down')
      }, 'asset-url-fail')

      const result = await service.ingestUrl({
        url: 'https://example.test/file.pdf',
        retentionMode: 'link_only',
      })

      expect(result).toMatchObject({
        success: true,
        assetId: 'asset-url-fail',
        probeStatus: 'probe_failed',
        importStatus: 'probe_failed',
        materializationStatus: 'not_requested',
      })
      expect(result.sendEligibilityHints.canUseUrlRef).toBe(true)
      expect(result.sendEligibilityHints.urlReferenceMayStillBeUsable).toBe(true)
      expect(h.repo.getById('asset-url-fail')?.sourceMetaJson).toMatchObject({
        probeStatus: 'probe_failed',
        materializationStatus: 'not_requested',
      })
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })

  it('rejects invalid URL syntax without pretending it is a downloadable file', async () => {
    const h = createHarness(['asset-invalid'])
    try {
      const result = await h.service.ingestUrl({
        url: 'not a url',
        retentionMode: 'link_only',
      })

      expect(result).toMatchObject({
        success: false,
        assetId: null,
        retentionMode: 'link_only',
        probeStatus: 'rejected',
        failureReasonCode: 'invalid_url',
      })
      expect(result.sendEligibilityHints.canUseUrlRef).toBe(false)
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })
})

describeIfBetterSqlite('FileIngestionService URL link_and_file', () => {
  it('downloads and stores a file copy when link_and_file materialization succeeds', async () => {
    const h = createHarness(['asset-url-file'])
    try {
      let getCalled = false
      const service = serviceWithFetch(h, async (_url, init) => {
        if (init?.method === 'HEAD') {
          return response(null, {
            status: 200,
            headers: { 'content-type': 'text/plain', 'content-length': '5' },
            url: 'https://example.test/readme.txt',
          })
        }
        getCalled = true
        return response('hello', {
          status: 200,
          headers: { 'content-type': 'text/plain', 'content-length': '5' },
          url: 'https://example.test/readme.txt',
        })
      }, 'asset-url-file')

      const result = await service.ingestUrl({
        url: 'https://example.test/readme.txt',
        retentionMode: 'link_and_file',
      })
      const asset = h.repo.getById('asset-url-file')

      expect(getCalled).toBe(true)
      expect(result).toMatchObject({
        success: true,
        retentionMode: 'link_and_file',
        materializationStatus: 'stored',
        importStatus: 'ready',
        assetKind: 'text',
        aiPayloadKind: 'text',
      })
      expect(result.sendEligibilityHints.canUseUrlRef).toBe(true)
      expect(result.sendEligibilityHints.canUseLocalFile).toBe(true)
      expect(asset).toMatchObject({
        sha256: expect.any(String),
        storageBackend: 'local_fs',
        storageUri: 'assets/original/as/asset-url-file.txt',
        ingestStatus: 'stored',
      })
      expect(existsSync(path.join(h.rootDir, 'assets', 'original', 'as', 'asset-url-file.txt'))).toBe(true)
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })
})

describeIfBetterSqlite('FileIngestionService URL link_and_file fallback', () => {
  it('keeps the URL asset when download materialization fails after a successful probe', async () => {
    const h = createHarness(['asset-url-fallback'])
    try {
      const service = new FileIngestionService({
        fileAssetRepo: h.repo,
        storageRootDir: h.rootDir,
        idFactory: () => 'asset-url-fallback',
        now: () => 1234,
        fetch: async (_url, init) => {
          if (init?.method === 'HEAD') {
            return response(null, {
              status: 200,
              headers: { 'content-type': 'application/pdf', 'content-length': '10' },
              url: 'https://example.test/file.pdf',
            })
          }
          return response('pdf-bytes', { status: 200, url: 'https://example.test/file.pdf' })
        },
        writeBufferAtomically: async () => {
          throw new Error('disk full')
        },
      })

      const result = await service.ingestUrl({
        url: 'https://example.test/file.pdf',
        retentionMode: 'link_and_file',
      })

      expect(result).toMatchObject({
        success: true,
        retentionMode: 'link_and_file',
        probeStatus: 'accessible',
        materializationStatus: 'materialization_failed',
        importStatus: 'materialization_failed',
      })
      expect(result.sendEligibilityHints.canUseUrlRef).toBe(true)
      expect(result.sendEligibilityHints.canUseLocalFile).toBe(false)
      expect(result.warnings.map((item) => item.code)).toContain('url_materialization_failed')
      expect(h.repo.getById('asset-url-fallback')).toMatchObject({
        sha256: null,
        storageBackend: 'remote_url',
        ingestStatus: 'materialization_failed',
      })
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })

  it('does not attempt file materialization after a probe failure but retains the URL', async () => {
    const h = createHarness(['asset-probe-fail'])
    try {
      let getCount = 0
      const service = serviceWithFetch(h, async (_url, init) => {
        if (init?.method === 'GET') getCount += 1
        return response(null, { status: 503, url: 'https://example.test/down.pdf' })
      }, 'asset-probe-fail')

      const result = await service.ingestUrl({
        url: 'https://example.test/down.pdf',
        retentionMode: 'link_and_file',
      })

      expect(getCount).toBe(0)
      expect(result).toMatchObject({
        success: true,
        probeStatus: 'probe_failed',
        materializationStatus: 'not_requested',
      })
      expect(result.sendEligibilityHints.canUseUrlRef).toBe(true)
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })
})

describeIfBetterSqlite('FileIngestionService conservative URL classification', () => {
  it('uses conservative classification when MIME and URL suffix conflict', async () => {
    const h = createHarness(['asset-conflict'])
    try {
      const service = serviceWithFetch(
        h,
        async () =>
          response(null, {
            status: 200,
            headers: { 'content-type': 'application/pdf', 'content-length': '10' },
            url: 'https://example.test/photo.jpg',
          }),
        'asset-conflict'
      )

      const result = await service.ingestUrl({
        url: 'https://example.test/photo.jpg',
        retentionMode: 'link_only',
      })

      expect(result).toMatchObject({
        success: true,
        assetKind: 'binary',
        aiPayloadKind: 'binary',
        processingStatus: 'local_only',
      })
      expect(result.warnings.map((item) => item.code)).toContain('metadata_conflict')
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })

  it('does not trust image-looking URL suffixes when the server returns text/html', async () => {
    const h = createHarness(['asset-html'])
    try {
      const service = serviceWithFetch(
        h,
        async () =>
          response('<html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html', 'content-length': '13' },
            url: 'https://example.test/fake.png',
          }),
        'asset-html'
      )

      const result = await service.ingestUrl({
        url: 'https://example.test/fake.png',
        retentionMode: 'link_only',
      })

      expect(result).toMatchObject({
        success: true,
        assetKind: 'binary',
        aiPayloadKind: 'binary',
        processingStatus: 'local_only',
      })
      expect(result.warnings.map((item) => item.code)).toContain('metadata_conflict')
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })
})

function serviceWithFetch(
  harness: ReturnType<typeof createHarness>,
  fetch: FetchLike,
  id = 'asset-url'
): FileIngestionService {
  return new FileIngestionService({
    fileAssetRepo: harness.repo,
    storageRootDir: harness.rootDir,
    idFactory: () => id,
    now: () => 1234,
    fetch,
  })
}

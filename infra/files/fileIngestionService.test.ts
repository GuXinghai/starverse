import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FileAssetRepo } from '../db/repo/fileAssetRepo'
import { FileAssetStoreRepo } from '../db/repo/fileAssetStoreRepo'
import { FileIngestionService } from './fileIngestionService'
import type { FetchLike } from './urlProbe'
import { canOpenBetterSqliteForSuite } from '../testUtils/betterSqliteGate'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('FileIngestionService') ? describe : describe.skip

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function createHarness(ids: string[] = ['asset-1']) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-ingest-'))
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  const repo = new FileAssetRepo(db)
  const storeRepo = new FileAssetStoreRepo(db)
  const idQueue = [...ids]
  const service = new FileIngestionService({
    fileAssetRepo: repo,
    fileAssetStoreRepo: storeRepo,
    storageRootDir: rootDir,
    idFactory: () => idQueue.shift() ?? `asset-${Date.now()}`,
    now: () => 1234,
  })
  return { db, repo, storeRepo, rootDir, service }
}

function countRows(db: BetterSqlite3.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
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
  it('fails fast when fileAssetStoreRepo is missing before local import can create a half asset', () => {
    const rootDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-ingest-missing-store-'))
    const db = new BetterSqlite3(':memory:')
    try {
      loadSchema(db)
      const repo = new FileAssetRepo(db)

      expect(() => new FileIngestionService({
        fileAssetRepo: repo,
        storageRootDir: rootDir,
      } as any)).toThrow('FileIngestionService requires fileAssetStoreRepo')
      expect(countRows(db, 'file_assets')).toBe(0)
      expect(countRows(db, 'file_blobs')).toBe(0)
      expect(countRows(db, 'file_asset_revisions')).toBe(0)
    } finally {
      db.close()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

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
        storageUri: expect.stringMatching(/^assets\/blobs\/[a-f0-9]{2}\/[a-f0-9]{64}\.md$/),
        ingestStatus: 'stored',
        sourceMetaJson: {
          importStatus: 'ready',
          materializationStatus: 'stored',
          origin: 'local_file',
          originalPath: sourcePath,
          blobId: expect.any(String),
        },
      })
      expect(existsSync(path.join(h.rootDir, ...(asset?.storageUri ?? '').split('/')))).toBe(true)
      expect(h.storeRepo.getCurrentRevision('asset-local')).toMatchObject({
        assetId: 'asset-local',
        blobId: expect.any(String),
        cause: 'imported',
      })
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

  it('dedupes duplicate local file content by blob sha256 while keeping separate assets', async () => {
    const h = createHarness(['asset-a', 'asset-b'])
    try {
      const firstPath = path.join(h.rootDir, 'first.txt')
      const secondPath = path.join(h.rootDir, 'second.txt')
      writeFileSync(firstPath, 'same body')
      writeFileSync(secondPath, 'same body')

      await h.service.ingestLocalFile({ filePath: firstPath })
      await h.service.ingestLocalFile({ filePath: secondPath })

      const first = h.repo.getById('asset-a')
      const second = h.repo.getById('asset-b')
      expect(first?.sha256).toBe(second?.sha256)
      expect(first?.storageUri).toBe(second?.storageUri)
      expect(h.storeRepo.listBindingsByAssetId('asset-a')).toEqual([])
      const blobCount = h.db.prepare('SELECT COUNT(*) AS count FROM file_blobs').get() as { count: number }
      expect(blobCount.count).toBe(1)
      expect(h.storeRepo.getCurrentRevision('asset-a')?.blobId).toBe(h.storeRepo.getCurrentRevision('asset-b')?.blobId)
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })

  it('uses the canonical blob storage URI when blob insertion races with another writer', async () => {
    const rootDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-ingest-race-'))
    try {
      const sourcePath = path.join(rootDir, 'race.txt')
      writeFileSync(sourcePath, 'same body')
      let createdAssetInput: any = null
      const service = new FileIngestionService({
        fileAssetRepo: {
          create: (input: any) => {
            createdAssetInput = input
            return {
              ...input,
              storageBackend: input.storageBackend ?? 'local_fs',
              previewStatus: input.previewStatus ?? 'not_requested',
              sourceMetaJson: input.sourceMetaJson ?? null,
              createdAt: input.createdAt ?? 1234,
              updatedAt: input.updatedAt ?? 1234,
              deletedAt: null,
            }
          },
        },
        fileAssetStoreRepo: {
          getBlobBySha256: () => null,
          createBlob: (input: any) => ({
            id: 'blob-existing',
            sha256: input.sha256,
            sizeBytes: input.sizeBytes,
            mime: input.mime ?? null,
            storageBackend: 'local_fs',
            storageUri: 'assets/blobs/ca/canonical.txt',
            createdAt: 1000,
          }),
          createRevision: (input: any) => ({
            id: 'rev-1',
            assetId: input.assetId,
            blobId: input.blobId,
            parentRevisionId: input.parentRevisionId ?? null,
            cause: input.cause,
            derivedFromAssetId: input.derivedFromAssetId ?? null,
            createdAt: input.createdAt ?? 1234,
          }),
        },
        storageRootDir: rootDir,
        idFactory: () => 'asset-race',
        now: () => 1234,
        copyLocalFileAtomically: async () => {},
      })

      const result = await service.ingestLocalFile({ filePath: sourcePath, mimeType: 'text/plain' })

      expect(result.success).toBe(true)
      expect(createdAssetInput).toMatchObject({
        id: 'asset-race',
        storageUri: 'assets/blobs/ca/canonical.txt',
        sourceMetaJson: {
          blobId: 'blob-existing',
          blobReused: true,
        },
      })
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  it('normalizes unsafe display filenames without using them in storage paths', async () => {
    const h = createHarness(['asset-safe'])
    try {
      const sourcePath = path.join(h.rootDir, '..unsafe name.md')
      writeFileSync(sourcePath, 'safe')

      await h.service.ingestLocalFile({ filePath: sourcePath })
      const asset = h.repo.getById('asset-safe')

      expect(asset?.filename).toBe('unsafe name.md')
      expect(asset?.storageUri).toMatch(/^assets\/blobs\/[a-f0-9]{2}\/[a-f0-9]{64}\.md$/)
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

  it.each([
    'http://127.0.0.1/file.pdf',
    'http://localhost/file.pdf',
    'http://[::1]/file.pdf',
    'http://10.0.0.1/file.pdf',
    'http://172.16.0.1/file.pdf',
    'http://192.168.1.1/file.pdf',
    'http://169.254.1.1/file.pdf',
    'http://[fc00::1]/file.pdf',
    'http://[fe80::1]/file.pdf',
    'http://[::ffff:127.0.0.1]/file.pdf',
  ])('rejects SSRF target %s without issuing a fetch', async (url) => {
    const h = createHarness(['asset-ssrf'])
    try {
      let fetchCalled = false
      const service = serviceWithFetch(h, async () => {
        fetchCalled = true
        return response(null, { status: 200 })
      }, 'asset-ssrf')

      const result = await service.ingestUrl({
        url,
        retentionMode: 'link_only',
      })

      expect(result).toMatchObject({
        success: false,
        assetId: null,
        retentionMode: 'link_only',
        probeStatus: 'rejected',
        failureReasonCode: 'url_host_not_allowed',
      })
      expect(fetchCalled).toBe(false)
      expect(h.repo.getById('asset-ssrf')).toBeNull()
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })

  it('rejects a public URL when the HEAD redirect target is private', async () => {
    const h = createHarness(['asset-redirect-private'])
    try {
      const service = serviceWithFetch(h, async () =>
        response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/private.pdf' },
          url: 'https://example.test/file.pdf',
        }), 'asset-redirect-private')

      const result = await service.ingestUrl({
        url: 'https://example.test/file.pdf',
        retentionMode: 'link_only',
      })

      expect(result).toMatchObject({
        success: false,
        assetId: null,
        probeStatus: 'rejected',
        failureReasonCode: 'url_host_not_allowed',
      })
      expect(h.repo.getById('asset-redirect-private')).toBeNull()
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })

  it('rejects a public URL when the GET fallback redirect target is private', async () => {
    const h = createHarness(['asset-get-redirect-private'])
    try {
      const service = serviceWithFetch(h, async (_url, init) => {
        if (init?.method === 'HEAD') {
          return response(null, { status: 405, url: 'https://example.test/file.pdf' })
        }
        return response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/private.pdf' },
          url: 'https://example.test/file.pdf',
        })
      }, 'asset-get-redirect-private')

      const result = await service.ingestUrl({
        url: 'https://example.test/file.pdf',
        retentionMode: 'link_only',
      })

      expect(result).toMatchObject({
        success: false,
        assetId: null,
        probeStatus: 'rejected',
        failureReasonCode: 'url_host_not_allowed',
      })
      expect(h.repo.getById('asset-get-redirect-private')).toBeNull()
    } finally {
      rmSync(h.rootDir, { recursive: true, force: true })
    }
  })
})

describeIfBetterSqlite('FileIngestionService URL link_and_file', () => {
  it('fails fast when fileAssetStoreRepo is missing before URL snapshot can create a half asset', () => {
    const rootDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-ingest-missing-store-url-'))
    const db = new BetterSqlite3(':memory:')
    try {
      loadSchema(db)
      const repo = new FileAssetRepo(db)
      let fetchCalled = false

      expect(() => new FileIngestionService({
        fileAssetRepo: repo,
        storageRootDir: rootDir,
        fetch: async () => {
          fetchCalled = true
          return response('body', { status: 200 })
        },
      } as any)).toThrow('FileIngestionService requires fileAssetStoreRepo')
      expect(fetchCalled).toBe(false)
      expect(countRows(db, 'file_assets')).toBe(0)
      expect(countRows(db, 'file_blobs')).toBe(0)
      expect(countRows(db, 'file_asset_revisions')).toBe(0)
    } finally {
      db.close()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

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
        storageUri: expect.stringMatching(/^assets\/blobs\/[a-f0-9]{2}\/[a-f0-9]{64}\.txt$/),
        ingestStatus: 'stored',
        sourceMetaJson: {
          origin: 'url',
          originalUrl: 'https://example.test/readme.txt',
          resolvedUrl: 'https://example.test/readme.txt',
          retentionMode: 'link_and_file',
          materializationStatus: 'stored',
          blobId: expect.any(String),
        },
      })
      expect(existsSync(path.join(h.rootDir, ...(asset?.storageUri ?? '').split('/')))).toBe(true)
      expect(h.storeRepo.getCurrentRevision('asset-url-file')).toMatchObject({
        assetId: 'asset-url-file',
        blobId: expect.any(String),
        cause: 'url_snapshot',
      })
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
        fileAssetStoreRepo: h.storeRepo,
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
        resolveHostname: async () => ['93.184.216.34'],
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
    fileAssetStoreRepo: harness.storeRepo,
    storageRootDir: harness.rootDir,
    idFactory: () => id,
    now: () => 1234,
    fetch,
    resolveHostname: async () => ['93.184.216.34'],
  })
}

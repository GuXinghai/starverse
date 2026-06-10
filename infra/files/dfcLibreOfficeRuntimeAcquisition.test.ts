import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PackageDownloadTransport } from '../../src/next/plugin-distribution/packageDownloader'
import {
  acquireDfcLibreOfficeOfficialRuntimePackage,
  isDfcLibreOfficeAcquisitionCachePathPresent,
} from './dfcLibreOfficeRuntimeAcquisition'
import {
  getDfcLibreOfficeFirstPartyRuntimeCatalogEntry,
  type DfcLibreOfficeRuntimeAcquisitionSource,
} from './dfcManagedLibreOfficeRuntime'

const BYTES = Buffer.from('libreoffice-runtime-package', 'utf8')
const SHA = createHash('sha256').update(BYTES).digest('hex')

function source(overrides: Partial<DfcLibreOfficeRuntimeAcquisitionSource> = {}): DfcLibreOfficeRuntimeAcquisitionSource {
  return {
    sourceKind: 'github_release_asset',
    downloadEnabled: true,
    packageRef: 'starverse-libreoffice-25.8.7-win32-x64.svpkg',
    sourceUrl: 'https://github.com/GuXinghai/starverse/releases/download/libreoffice-runtime/starverse-libreoffice-25.8.7-win32-x64.svpkg',
    expectedSha256: SHA,
    expectedSizeBytes: BYTES.byteLength,
    packageVersion: '25.8.7-starverse.1',
    runtimeVersion: '25.8.7',
    platform: 'win32',
    arch: 'x64',
    licenseRequired: true,
    provenanceRequired: true,
    securityPolicyRequired: true,
    productionApproved: false,
    ownerGated: true,
    experimental: true,
    ...overrides,
  }
}

function transport(
  bytes: Uint8Array = BYTES,
  finalRef = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/libreoffice.svpkg'
): PackageDownloadTransport & { calls: number } {
  return {
    calls: 0,
    async fetchPackage(request) {
      this.calls += 1
      expect(request.transportRef).toContain('https://github.com/GuXinghai/starverse/releases/download/')
      return { ok: true, bytes, finalRef }
    },
  }
}

async function tempCache(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'starverse-dfc-lo-acquisition-'))
}

describe('DFC LibreOffice runtime acquisition pipeline', () => {
  it('keeps the catalog acquisition source disabled by default', () => {
    const entry = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()

    expect(entry.acquisitionSource).toMatchObject({
      sourceKind: 'disabled',
      downloadEnabled: false,
      productionApproved: false,
      ownerGated: true,
      experimental: true,
    })
  })

  it('does not download unless owner-gated policy explicitly allows it', async () => {
    const fake = transport()
    const result = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source(),
      cacheRootDir: await tempCache(),
      transport: fake,
      platform: 'win32',
      arch: 'x64',
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })

    expect(result).toMatchObject({
      ok: false,
      acquisitionStatus: 'disabled',
      nextStep: 'ownerApprovalRequired',
      productionApproved: false,
      ownerGated: true,
      experimental: true,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_acquisition_policy_denied' })],
    })
    expect(fake.calls).toBe(0)
  })

  it('downloads verified package bytes into a controlled cache staging path', async () => {
    const cacheRoot = await tempCache()
    const fake = transport()
    const result = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source(),
      cacheRootDir: cacheRoot,
      repoRootDir: process.cwd(),
      transport: fake,
      allowDownload: true,
      platform: 'win32',
      arch: 'x64',
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })

    expect(result.ok).toBe(true)
    expect(fake.calls).toBe(1)
    if (!result.ok) return
    expect(result).toMatchObject({
      acquisitionStatus: 'downloaded',
      packageVersion: '25.8.7-starverse.1',
      runtimeVersion: '25.8.7',
      platform: 'win32',
      arch: 'x64',
      sha256: SHA,
      sizeBytes: BYTES.byteLength,
      nextStep: 'import',
      productionApproved: false,
      ownerGated: true,
      experimental: true,
      diagnostics: [],
    })
    expect(result.internal.stagedPackagePath.startsWith(cacheRoot)).toBe(true)
    expect(await readFile(result.internal.stagedPackagePath, 'utf8')).toBe('libreoffice-runtime-package')
    expect(isDfcLibreOfficeAcquisitionCachePathPresent(result.internal.stagedPackagePath)).toBe(true)
    expect(JSON.stringify(result.diagnostics)).not.toContain(cacheRoot)
  })

  it('rejects cache roots inside the repo or artifact directories', async () => {
    const repoResult = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source(),
      cacheRootDir: path.join(process.cwd(), 'tmp-runtime-cache'),
      repoRootDir: process.cwd(),
      transport: transport(),
      allowDownload: true,
      platform: 'win32',
      arch: 'x64',
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })
    expect(repoResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_acquisition_cache_rejected' })],
    })

    const artifactResult = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source(),
      cacheRootDir: path.join(os.tmpdir(), '.artifacts', 'runtime-cache'),
      transport: transport(),
      allowDownload: true,
      platform: 'win32',
      arch: 'x64',
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })
    expect(artifactResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_acquisition_cache_rejected' })],
    })
  })

  it('fails closed on hash mismatch, size mismatch, oversized package, and unsupported platform', async () => {
    const hashMismatch = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source({ expectedSha256: 'f'.repeat(64), expectedSizeBytes: BYTES.byteLength }),
      cacheRootDir: await tempCache(),
      transport: transport(),
      allowDownload: true,
      platform: 'win32',
      arch: 'x64',
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })
    expect(hashMismatch).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_acquisition_hash_mismatch' })],
    })

    const sizeMismatch = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source({ expectedSizeBytes: BYTES.byteLength + 1 }),
      cacheRootDir: await tempCache(),
      transport: transport(),
      allowDownload: true,
      platform: 'win32',
      arch: 'x64',
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })
    expect(sizeMismatch).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_acquisition_size_mismatch' })],
    })

    const oversized = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source(),
      cacheRootDir: await tempCache(),
      transport: transport(),
      allowDownload: true,
      platform: 'win32',
      arch: 'x64',
      maxBytes: 4,
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })
    expect(oversized).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_acquisition_oversized' })],
    })

    const unsupported = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source({ platform: 'darwin' }),
      cacheRootDir: await tempCache(),
      transport: transport(),
      allowDownload: true,
      platform: 'win32',
      arch: 'x64',
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })
    expect(unsupported).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_acquisition_platform_unsupported' })],
    })
  })

  it('returns sanitized network and timeout diagnostics without temp file leftovers', async () => {
    const cacheRoot = await tempCache()
    const networkFailure = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source(),
      cacheRootDir: cacheRoot,
      transport: {
        async fetchPackage() {
          return {
            ok: false,
            code: 'download_failed',
            detail: `failed at C:\\Users\\owner\\runtime ${SHA}`,
          }
        },
      },
      allowDownload: true,
      platform: 'win32',
      arch: 'x64',
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })
    expect(networkFailure).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_acquisition_download_failed' })],
    })
    expect(JSON.stringify(networkFailure.diagnostics)).not.toContain('C:\\Users\\owner')
    expect(JSON.stringify(networkFailure.diagnostics)).not.toContain(SHA)

    const timeout = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source(),
      cacheRootDir: cacheRoot,
      transport: {
        async fetchPackage(request) {
          expect(request.signal).toBeDefined()
          return { ok: false, code: 'cancelled', detail: 'aborted by test' }
        },
      },
      allowDownload: true,
      platform: 'win32',
      arch: 'x64',
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })
    expect(timeout).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_acquisition_timeout' })],
    })

    const ignoredSignalTimeout = await acquireDfcLibreOfficeOfficialRuntimePackage({
      source: source(),
      cacheRootDir: cacheRoot,
      transport: {
        async fetchPackage() {
          return new Promise(() => undefined)
        },
      },
      allowDownload: true,
      platform: 'win32',
      arch: 'x64',
      timeoutMs: 1,
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    })
    expect(ignoredSignalTimeout).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_acquisition_timeout' })],
    })

    const entries = await readdir(cacheRoot, { recursive: true }).catch(() => [])
    expect(entries.some((entry) => String(entry).includes('.tmp'))).toBe(false)
  })
})

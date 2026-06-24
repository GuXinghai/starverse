import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { PackageDownloadTransport } from '../../src/next/plugin-distribution/packageDownloader'
import {
  createDfcLibreOfficeOfficialAssetBodyInterceptTransport,
  preflightDfcLibreOfficeOfficialAssetBodyInterceptPackage,
} from './dfcLibreOfficeOfficialAssetBodyIntercept'
import type { DfcLibreOfficeFirstPartyRuntimeCatalogEntry } from './dfcManagedLibreOfficeRuntime'

const PACKAGE_BYTES = Buffer.from('catalog-equivalent-package', 'utf8')
const PACKAGE_HASH = createHash('sha256').update(PACKAGE_BYTES).digest('hex')
const ASSET_URL = 'https://github.com/owner/repo/releases/download/runtime-v1/runtime.svpkg'

function catalog(overrides: Partial<DfcLibreOfficeFirstPartyRuntimeCatalogEntry['acquisitionSource']> = {}) {
  return {
    pluginId: 'libreoffice',
    pluginVersion: '0.1.0',
    acquisitionSource: {
      sourceKind: 'github_release_asset',
      packageRef: 'owner/repo@runtime-v1/runtime.svpkg',
      sourceUrl: ASSET_URL,
      expectedSha256: PACKAGE_HASH,
      expectedSizeBytes: PACKAGE_BYTES.byteLength,
      packageVersion: '0.1.0',
      runtimeVersion: '26.2.4',
      platform: 'win32',
      arch: 'x64',
      ...overrides,
    },
  } as DfcLibreOfficeFirstPartyRuntimeCatalogEntry
}

async function withTempFile<T>(bytes: Buffer, fn: (input: { root: string; packagePath: string }) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lo-intercept-'))
  const packagePath = path.join(root, 'runtime.svpkg')
  await writeFile(packagePath, bytes)
  try {
    return await fn({ root, packagePath })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('dfcLibreOfficeOfficialAssetBodyIntercept', () => {
  it('stays disabled unless the smoke harness flag enables it', async () => {
    await withTempFile(PACKAGE_BYTES, async ({ packagePath }) => {
      const result = await preflightDfcLibreOfficeOfficialAssetBodyInterceptPackage({
        enabled: false,
        localPackagePath: packagePath,
        catalog: catalog(),
        transportRef: ASSET_URL,
      })
      expect(result.ok).toBe(false)
      expect(result.evidence.diagnosticCode).toBe('intercept_disabled')
      expect(result.evidence.sourceClass).toBe('disabled')
    })
  })

  it('fails preflight before streaming when the local package size is wrong', async () => {
    await withTempFile(Buffer.from('short', 'utf8'), async ({ packagePath }) => {
      const result = await preflightDfcLibreOfficeOfficialAssetBodyInterceptPackage({
        enabled: true,
        localPackagePath: packagePath,
        catalog: catalog(),
        transportRef: ASSET_URL,
      })
      expect(result.ok).toBe(false)
      expect(result.evidence.sizeMatched).toBe(false)
      expect(result.evidence.diagnosticCode).toBe('local_package_size_mismatch')
    })
  })

  it('fails preflight before streaming when the local package hash is wrong', async () => {
    await withTempFile(PACKAGE_BYTES, async ({ packagePath }) => {
      const result = await preflightDfcLibreOfficeOfficialAssetBodyInterceptPackage({
        enabled: true,
        localPackagePath: packagePath,
        catalog: catalog({ expectedSha256: '0'.repeat(64) }),
        transportRef: ASSET_URL,
      })
      expect(result.ok).toBe(false)
      expect(result.evidence.sizeMatched).toBe(true)
      expect(result.evidence.hashMatched).toBe(false)
      expect(result.evidence.diagnosticCode).toBe('local_package_hash_mismatch')
    })
  })

  it('streams the matched official asset body from the local equivalent package', async () => {
    await withTempFile(PACKAGE_BYTES, async ({ root, packagePath }) => {
      const outputPath = path.join(root, 'downloaded.svpkg')
      const progress: number[] = []
      const transport = createDfcLibreOfficeOfficialAssetBodyInterceptTransport({
        enabled: true,
        localPackagePath: packagePath,
        catalog: catalog(),
      })
      const result = await transport.fetchPackageToFile!({
        transportRef: ASSET_URL,
        maxBytes: 1024,
        outputPath,
        onProgress: (entry) => progress.push(entry.bytesReceived),
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(readFileSync(outputPath)).toEqual(PACKAGE_BYTES)
      expect(result.sizeBytes).toBe(PACKAGE_BYTES.byteLength)
      expect(result.sha256).toBe(PACKAGE_HASH)
      expect(result.finalRef).toMatch(/^https:\/\/release-assets\.githubusercontent\.com\//u)
      expect(progress.at(-1)).toBe(PACKAGE_BYTES.byteLength)
    })
  })

  it('does not intercept an unrelated network request', async () => {
    await withTempFile(PACKAGE_BYTES, async ({ root, packagePath }) => {
      const outputPath = path.join(root, 'fallback.svpkg')
      let fallbackCalls = 0
      const fallback: PackageDownloadTransport = {
        async fetchPackage() {
          throw new Error('not used')
        },
        async fetchPackageToFile(request) {
          fallbackCalls += 1
          await writeFile(request.outputPath, Buffer.from('fallback', 'utf8'))
          return {
            ok: true,
            filePath: request.outputPath,
            sizeBytes: 8,
            sha256: createHash('sha256').update('fallback').digest('hex'),
            finalRef: 'https://plugins.example/fallback.svpkg',
          }
        },
      }
      const transport = createDfcLibreOfficeOfficialAssetBodyInterceptTransport({
        enabled: true,
        localPackagePath: packagePath,
        catalog: catalog(),
        fallbackTransport: fallback,
      })
      const result = await transport.fetchPackageToFile!({
        transportRef: 'https://plugins.example/fallback.svpkg',
        maxBytes: 1024,
        outputPath,
      })
      expect(result.ok).toBe(true)
      expect(fallbackCalls).toBe(1)
      expect(readFileSync(outputPath).toString('utf8')).toBe('fallback')
    })
  })

  it('cleans partial temp output when the local package stream fails', async () => {
    await withTempFile(PACKAGE_BYTES, async ({ root, packagePath }) => {
      const outputPath = path.join(root, 'downloaded.svpkg')
      const transport = createDfcLibreOfficeOfficialAssetBodyInterceptTransport({
        enabled: true,
        localPackagePath: packagePath,
        catalog: catalog(),
        createReadStreamForTest: () => Readable.from((async function* () {
          yield Buffer.from('partial')
          throw new Error('stream failed')
        })()),
      })
      const result = await transport.fetchPackageToFile!({
        transportRef: ASSET_URL,
        maxBytes: 1024,
        outputPath,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('download_failed')
      expect(existsSync(outputPath)).toBe(false)
      expect(existsSync(`${outputPath}.partial`)).toBe(false)
    })
  })

  it('keeps renderer-safe preflight evidence path-free', async () => {
    await withTempFile(PACKAGE_BYTES, async ({ packagePath }) => {
      const result = await preflightDfcLibreOfficeOfficialAssetBodyInterceptPackage({
        enabled: true,
        localPackagePath: packagePath,
        catalog: catalog(),
        transportRef: ASSET_URL,
      })
      expect(result.ok).toBe(true)
      expect(JSON.stringify(result.evidence)).not.toContain(packagePath)
      expect(JSON.stringify(result.evidence)).not.toContain(PACKAGE_HASH)
    })
  })
})

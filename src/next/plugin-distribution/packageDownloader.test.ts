import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  downloadOfficialPackageToFile,
  downloadOfficialPackageToMemory,
  fetchPackageToFileWithFetch,
  type DownloadPolicyCatalogPackageRef,
  type PackageDownloadResumeOptions,
  type PackageDownloadTransport,
} from './index'

const BYTES = Buffer.from('package-bytes', 'utf8')
const HASH = createHash('sha256').update(BYTES).digest('hex')

function ref(overrides?: Partial<DownloadPolicyCatalogPackageRef>): DownloadPolicyCatalogPackageRef {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    packageRef: 'https://plugins.starverse.local/packages/magika-managed.svpkg',
    sourceKind: 'catalog_official',
    catalogStatus: 'valid_metadata_only',
    installabilityStatus: 'metadata_compatible_future_install',
    packageSha256: HASH,
    packageSizeBytes: BYTES.byteLength,
    ...overrides,
  }
}

function fakeTransport(
  bytes: Uint8Array = BYTES,
  finalRef: string | null = 'https://plugins.starverse.local/packages/magika-managed.svpkg'
): PackageDownloadTransport & { calls: number } {
  return {
    calls: 0,
    async fetchPackage(request) {
      this.calls += 1
      expect(request.transportRef).toBe('https://plugins.starverse.local/packages/magika-managed.svpkg')
      return { ok: true, bytes, finalRef }
    },
  }
}

const policy = {
  maxBytes: 1024,
  allowedOfficialHosts: ['plugins.starverse.local'],
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function resumeOptions(overrides?: Partial<PackageDownloadResumeOptions>): PackageDownloadResumeOptions {
  return {
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 0,
    descriptor: {
      pluginId: 'libreoffice',
      runtimeId: 'libreoffice-runtime',
      packageId: 'starverse-runtime-libreoffice',
      releaseTag: 'test-release',
      assetName: 'test.svpkg',
      sourceKind: 'github_release_asset',
      expectedSizeBytes: BYTES.byteLength,
      expectedSha256: HASH,
      tempArtifactId: 'libreoffice-official-win32-x64',
      rangeSupportMode: 'direct_browser_download_url',
    },
    ...overrides,
  }
}

function interruptedAfterFirstChunk(firstChunk: Uint8Array): ReadableStream<Uint8Array> {
  let pulled = false
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!pulled) {
        pulled = true
        controller.enqueue(firstChunk)
        return
      }
      controller.error(new Error('network_reset'))
    },
  })
}

// eslint-disable-next-line max-lines-per-function
describe('downloadOfficialPackageToMemory', () => {
  it('stages official HTTPS package bytes through fake transport', async () => {
    const transport = fakeTransport()
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref(),
      policy,
      transport,
    })
    expect(result.ok).toBe(true)
    expect(transport.calls).toBe(1)
    if (!result.ok) return
    expect(result.stagedPackage.stageKind).toBe('memory')
    expect(result.stagedPackage.sha256).toBe(HASH)
    expect(result.stagedPackage.sizeBytes).toBe(BYTES.byteLength)
  })

  it('does not call transport when policy rejects user URL', async () => {
    const transport = fakeTransport()
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref({ sourceKind: 'user_url' }),
      policy,
      transport,
    })
    expect(result.ok).toBe(false)
    expect(transport.calls).toBe(0)
    if (!result.ok) expect(result.failureReasons).toContain('user_url_not_allowed')
  })

  it('rejects oversized download before hash trust', async () => {
    const transport = fakeTransport(Buffer.alloc(2048))
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref({ packageSizeBytes: 2048, packageSha256: createHash('sha256').update(Buffer.alloc(2048)).digest('hex') }),
      policy: { ...policy, maxBytes: 1024 },
      transport,
    })
    expect(result.ok).toBe(false)
    expect(transport.calls).toBe(0)
    if (!result.ok) expect(result.failureReasons).toContain('package_too_large')
  })

  it('rejects hash mismatch', async () => {
    const transport = fakeTransport(Buffer.from('tampered', 'utf8'))
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref({ packageSizeBytes: Buffer.byteLength('tampered') }),
      policy,
      transport,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('hash_mismatch')
  })

  it('rejects size mismatch', async () => {
    const transport = fakeTransport(Buffer.from('pkg', 'utf8'))
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref(),
      policy,
      transport,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('size_mismatch')
  })

  it('returns structured cancellation', async () => {
    const transport: PackageDownloadTransport = {
      async fetchPackage() {
        return { ok: false, code: 'cancelled', detail: 'cancelled by test' }
      },
    }
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref(),
      policy,
      transport,
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe('cancelled')
    if (!result.ok) expect(result.failureReasons).toContain('download_cancelled')
  })

  it('rejects redirects to non-official or non-HTTPS targets', async () => {
    const transport = fakeTransport(BYTES, 'http://evil.example/plugin.svpkg')
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref(),
      policy,
      transport,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('redirect_rejected')
  })

  it('fails closed when transport omits finalRef', async () => {
    const transport = fakeTransport(BYTES, null)
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref(),
      policy,
      transport,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('final_ref_missing')
  })

  it('rejects HTTPS redirects to non-official hosts', async () => {
    const transport = fakeTransport(BYTES, 'https://evil.example/plugin.svpkg')
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref(),
      policy,
      transport,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('redirect_rejected')
  })

  it('sanitizes diagnostics', async () => {
    const transport: PackageDownloadTransport = {
      async fetchPackage() {
        return {
          ok: false,
          code: 'download_failed',
          finalRef: 'https://plugins.starverse.local/packages/magika-managed.svpkg',
          detail: `failed at C:\\Users\\owner\\plugin.svpkg hash ${HASH}`,
        }
      },
    }
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref(),
      policy,
      transport,
    })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('C:\\Users\\owner')
    expect(JSON.stringify(result)).not.toContain(HASH)
  })

  it('sanitizes key-value path diagnostics from transport failures', async () => {
    const transport: PackageDownloadTransport = {
      async fetchPackage() {
        return {
          ok: false,
          code: 'download_failed',
          finalRef: 'https://plugins.starverse.local/packages/magika-managed.svpkg',
          detail: 'download failed path=/opt/starverse/plugin',
        }
      },
    }
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref(),
      policy,
      transport,
    })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('/opt/starverse/plugin')
  })

  it('sanitizes quoted key-value path diagnostics from transport failures', async () => {
    const transport: PackageDownloadTransport = {
      async fetchPackage() {
        return {
          ok: false,
          code: 'download_failed',
          finalRef: 'https://plugins.starverse.local/packages/magika-managed.svpkg',
          detail: 'download failed path="/opt/starverse/plugin"',
        }
      },
    }
    const result = await downloadOfficialPackageToMemory({
      packageRef: ref(),
      policy,
      transport,
    })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('/opt/starverse/plugin')
  })
})

// eslint-disable-next-line max-lines-per-function
describe('downloadOfficialPackageToFile', () => {
  it('stages and verifies official package through file transport', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pkg-download-'))
    const outputPath = path.join(root, 'download.svpkg')
    const transport: PackageDownloadTransport = {
      async fetchPackage() {
        throw new Error('memory fetch should not be used for file download')
      },
      async fetchPackageToFile(request) {
        await writeFile(request.outputPath, BYTES)
        request.onProgress?.({ bytesReceived: BYTES.byteLength, totalBytes: BYTES.byteLength })
        return {
          ok: true,
          filePath: request.outputPath,
          sizeBytes: BYTES.byteLength,
          sha256: HASH,
          finalRef: 'https://plugins.starverse.local/packages/magika-managed.svpkg',
        }
      },
    }
    try {
      const result = await downloadOfficialPackageToFile({
        packageRef: ref(),
        policy,
        transport,
        outputPath,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.status).toBe('staged_verified_file')
      expect(result.stagedPackage.stageKind).toBe('file')
      expect(result.stagedPackage.sizeBytes).toBe(BYTES.byteLength)
      expect(result.stagedPackage.sha256).toBe(HASH)
      expect(readFileSync(result.stagedPackage.filePath)).toEqual(BYTES)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('removes downloaded temp file on hash mismatch', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pkg-download-'))
    const outputPath = path.join(root, 'download.svpkg')
    const transport: PackageDownloadTransport = {
      async fetchPackage() {
        throw new Error('memory fetch should not be used for file download')
      },
      async fetchPackageToFile(request) {
        await writeFile(request.outputPath, BYTES)
        return {
          ok: true,
          filePath: request.outputPath,
          sizeBytes: BYTES.byteLength,
          sha256: '0'.repeat(64),
          finalRef: 'https://plugins.starverse.local/packages/magika-managed.svpkg',
        }
      },
    }
    try {
      const result = await downloadOfficialPackageToFile({
        packageRef: ref(),
        policy,
        transport,
        outputPath,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.failureReasons).toContain('hash_mismatch')
      expect(existsSync(outputPath)).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('passes proxy settings to file transport', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pkg-download-'))
    const outputPath = path.join(root, 'download.svpkg')
    const transport: PackageDownloadTransport = {
      async fetchPackage() {
        throw new Error('memory fetch should not be used for file download')
      },
      async fetchPackageToFile(request) {
        expect(request.proxy?.proxyMode).toBe('manual')
        expect(request.proxy?.manualProxyUrl).toBe('http://127.0.0.1:7890')
        await writeFile(request.outputPath, BYTES)
        return {
          ok: true,
          filePath: request.outputPath,
          sizeBytes: BYTES.byteLength,
          sha256: HASH,
          finalRef: 'https://plugins.starverse.local/packages/magika-managed.svpkg',
        }
      },
    }
    try {
      const result = await downloadOfficialPackageToFile({
        packageRef: ref(),
        policy,
        transport,
        outputPath,
        proxy: {
          proxyMode: 'manual',
          manualProxyUrl: 'http://127.0.0.1:7890',
          noProxy: '',
          strictSSL: true,
        },
      })
      expect(result.ok).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('fetchPackageToFileWithFetch', () => {
  it('streams response body chunks to a file without arrayBuffer buffering', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pkg-fetch-stream-'))
    const outputPath = path.join(root, 'download.svpkg')
    const chunks = [Buffer.from('package-'), Buffer.from('bytes')]
    const progress: number[] = []
    globalThis.fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    }), {
      status: 200,
      headers: { 'content-length': String(BYTES.byteLength) },
    })) as any
    try {
      const result = await fetchPackageToFileWithFetch({
        transportRef: 'https://plugins.starverse.local/packages/magika-managed.svpkg',
        maxBytes: 1024,
        outputPath,
        onProgress: (entry) => progress.push(entry.bytesReceived),
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(readFileSync(result.filePath)).toEqual(BYTES)
      expect(result.sizeBytes).toBe(BYTES.byteLength)
      expect(result.sha256).toBe(HASH)
      expect(progress).toEqual([8, BYTES.byteLength])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('cleans partial output when stream fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pkg-fetch-stream-'))
    const outputPath = path.join(root, 'download.svpkg')
    globalThis.fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('partial'))
        controller.error(new Error('network interruption'))
      },
    }), { status: 200 })) as any
    try {
      const result = await fetchPackageToFileWithFetch({
        transportRef: 'https://plugins.starverse.local/packages/magika-managed.svpkg',
        maxBytes: 1024,
        outputPath,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('download_failed')
      expect(existsSync(outputPath)).toBe(false)
      expect(existsSync(`${outputPath}.partial`)).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('resumes an interrupted stream with Range and completes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pkg-fetch-resume-'))
    const outputPath = path.join(root, 'download.svpkg')
    const ranges: string[] = []
    globalThis.fetch = vi.fn(async (_url, init: any) => {
      ranges.push(String(init?.headers?.Range ?? 'none'))
      if (ranges.length === 1) {
        return new Response(interruptedAfterFirstChunk(Buffer.from('package-')), {
          status: 200,
          headers: { 'content-length': String(BYTES.byteLength) },
        })
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.from('bytes'))
          controller.close()
        },
      }), {
        status: 206,
        headers: { 'content-range': `bytes 8-12/${BYTES.byteLength}` },
      })
    }) as any
    try {
      const result = await fetchPackageToFileWithFetch({
        transportRef: 'https://plugins.starverse.local/packages/libreoffice.svpkg',
        maxBytes: 1024,
        outputPath,
        resume: resumeOptions(),
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(ranges).toEqual(['none', 'bytes=8-'])
      expect(readFileSync(result.filePath)).toEqual(BYTES)
      expect(result.sha256).toBe(HASH)
      expect(existsSync(`${outputPath}.partial.json`)).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('pauses retryable after retry budget is exhausted and keeps sanitized metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pkg-fetch-resume-'))
    const outputPath = path.join(root, 'download.svpkg')
    globalThis.fetch = vi.fn(async () => new Response(interruptedAfterFirstChunk(Buffer.from('package-')), {
      status: 200,
    })) as any
    try {
      const result = await fetchPackageToFileWithFetch({
        transportRef: 'https://plugins.starverse.local/packages/libreoffice.svpkg',
        maxBytes: 1024,
        outputPath,
        resume: resumeOptions({ maxRetries: 0 }),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('resume_retries_exhausted')
      expect(existsSync(`${outputPath}.partial`)).toBe(true)
      const metadata = readFileSync(`${outputPath}.partial.json`, 'utf8')
      expect(metadata).toContain('"currentBytesWritten": 8')
      expect(metadata).not.toContain('https://')
      expect(metadata).not.toContain(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fails closed when a resume request is answered with HTTP 200', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pkg-fetch-resume-'))
    const outputPath = path.join(root, 'download.svpkg')
    globalThis.fetch = vi.fn(async (_url, init: any) => {
      if (!init?.headers?.Range) {
        return new Response(interruptedAfterFirstChunk(Buffer.from('package-')), { status: 200 })
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(BYTES)
          controller.close()
        },
      }), { status: 200 })
    }) as any
    try {
      const result = await fetchPackageToFileWithFetch({
        transportRef: 'https://plugins.starverse.local/packages/libreoffice.svpkg',
        maxBytes: 1024,
        outputPath,
        resume: resumeOptions(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('resume_range_ignored')
      expect(existsSync(outputPath)).toBe(false)
      expect(existsSync(`${outputPath}.partial`)).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fails closed when a resume response has invalid Content-Range', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pkg-fetch-resume-'))
    const outputPath = path.join(root, 'download.svpkg')
    globalThis.fetch = vi.fn(async (_url, init: any) => {
      if (!init?.headers?.Range) {
        return new Response(interruptedAfterFirstChunk(Buffer.from('package-')), { status: 200 })
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.from('bytes'))
          controller.close()
        },
      }), { status: 206, headers: { 'content-range': `bytes 7-12/${BYTES.byteLength}` } })
    }) as any
    try {
      const result = await fetchPackageToFileWithFetch({
        transportRef: 'https://plugins.starverse.local/packages/libreoffice.svpkg',
        maxBytes: 1024,
        outputPath,
        resume: resumeOptions(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('resume_content_range_invalid')
      expect(existsSync(`${outputPath}.partial`)).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fails closed on 416 unless the partial already has the expected size', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pkg-fetch-resume-'))
    const outputPath = path.join(root, 'download.svpkg')
    globalThis.fetch = vi.fn(async (_url, init: any) => {
      if (!init?.headers?.Range) {
        return new Response(interruptedAfterFirstChunk(Buffer.from('package-')), { status: 200 })
      }
      return new Response(null, { status: 416 })
    }) as any
    try {
      const result = await fetchPackageToFileWithFetch({
        transportRef: 'https://plugins.starverse.local/packages/libreoffice.svpkg',
        maxBytes: 1024,
        outputPath,
        resume: resumeOptions(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('resume_range_rejected')
      expect(existsSync(`${outputPath}.partial`)).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

})

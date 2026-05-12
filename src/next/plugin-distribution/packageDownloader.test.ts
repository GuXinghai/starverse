import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  downloadOfficialPackageToMemory,
  type DownloadPolicyCatalogPackageRef,
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

import { describe, expect, it, vi } from 'vitest'
import type { ElectronConversionBridge } from '../../files/electronConversionBridge'
import { createElectronSystemAwareOfficialPackageTransport } from './runtime'

const proxy = { proxyMode: 'direct' as const, manualProxyUrl: '', noProxy: '', strictSSL: true }

describe('worker runtime network transports', () => {
  it('routes app official package file downloads through the Electron bridge regardless of legacy proxy mode', async () => {
    const fetchPackageToFile = vi.fn(async (request: any) => ({
      ok: true as const,
      filePath: request.outputPath,
      sizeBytes: 4,
      sha256: 'a'.repeat(64),
      finalRef: request.transportRef,
    }))
    const bridge: ElectronConversionBridge = {
      async convert() {
        throw new Error('not used')
      },
      fetchPackageToFile,
    }
    const transport = createElectronSystemAwareOfficialPackageTransport(bridge)

    const result = await transport.fetchPackageToFile?.({
      transportRef: 'https://github.com/GuXinghai/starverse/releases/download/test/runtime.svpkg',
      maxBytes: 1024,
      outputPath: 'runtime.svpkg',
      proxy,
    })

    expect(result).toMatchObject({ ok: true, filePath: 'runtime.svpkg' })
    expect(fetchPackageToFile).toHaveBeenCalledTimes(1)
  })

  it('uses bridge-backed fetch for memory package downloads when available', async () => {
    const bridge: ElectronConversionBridge = {
      async convert() {
        throw new Error('not used')
      },
      async fetchProvider() {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { 'content-length': '7' },
          bodyText: 'pkgdata',
          bodyBase64: Buffer.from('pkgdata').toString('base64'),
        }
      },
    }
    const transport = createElectronSystemAwareOfficialPackageTransport(bridge)

    const result = await transport.fetchPackage({
      transportRef: 'https://github.com/GuXinghai/starverse/releases/download/test/runtime.svpkg',
      maxBytes: 1024,
      proxy,
    })

    expect(result).toMatchObject({ ok: true, finalRef: expect.stringContaining('runtime.svpkg') })
    expect(result.ok ? Buffer.from(result.bytes).toString('utf8') : '').toBe('pkgdata')
  })

  it('fails closed for system proxy downloads when Electron bridge is unavailable', async () => {
    const transport = createElectronSystemAwareOfficialPackageTransport(undefined)

    const result = await transport.fetchPackageToFile?.({
      transportRef: 'https://github.com/GuXinghai/starverse/releases/download/test/runtime.svpkg',
      maxBytes: 1024,
      outputPath: 'runtime.svpkg',
      proxy: { ...proxy, proxyMode: 'system' },
    })

    expect(result).toEqual({
      ok: false,
      code: 'download_failed',
      detail: 'electron_package_download_service_unavailable',
    })
  })
})

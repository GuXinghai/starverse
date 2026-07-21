import type { PackageDownloadTransport } from '../../src/next/plugin-distribution/packageDownloader'
import { createElectronBridgeHttpFetch, type ElectronConversionBridge } from './electronConversionBridge'

/**
 * Uses Electron's main-process bridge whenever one is present. This keeps
 * all product proxy modes in the one main-owned Electron network stack.
 */
export function createElectronSystemAwareOfficialPackageTransport(
  bridge: ElectronConversionBridge | undefined,
): PackageDownloadTransport {
  return {
    async fetchPackage(request) {
      if (bridge?.fetchProvider) {
        const fetchImpl = createElectronBridgeHttpFetch(bridge)
        let response: Response
        try {
          response = await fetchImpl(request.transportRef, { signal: request.signal })
        } catch (error) {
          return {
            ok: false,
            code: request.signal?.aborted ? 'cancelled' : 'download_failed',
            detail: request.signal?.aborted ? 'download cancelled' : sanitizeElectronBridgeDownloadError(error),
          }
        }
        if (!response.ok) return { ok: false, code: 'download_failed', detail: `http_${response.status}`, finalRef: response.url }
        const contentLength = Number(response.headers.get('content-length') ?? Number.NaN)
        if (Number.isFinite(contentLength) && contentLength > request.maxBytes) return { ok: false, code: 'too_large', finalRef: response.url }
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength > request.maxBytes) return { ok: false, code: 'too_large', finalRef: response.url }
        return { ok: true, bytes, finalRef: response.url }
      }
      return { ok: false, code: 'download_failed', detail: 'electron_package_download_service_unavailable' }
    },
    async fetchPackageToFile(request) {
      if (bridge?.fetchPackageToFile) return bridge.fetchPackageToFile(request)
      return { ok: false, code: 'download_failed', detail: 'electron_package_download_service_unavailable' }
    },
  }
}

function sanitizeElectronBridgeDownloadError(error: unknown): string {
  const code = String((error as any)?.code ?? (error as any)?.message ?? '').trim()
  if (/timeout|timedout|etimedout|abort/iu.test(code)) return 'download_body_timeout'
  if (/econnreset|socket|network|closed|interrupted/iu.test(code)) return 'network_transport_failed'
  return 'download_failed'
}

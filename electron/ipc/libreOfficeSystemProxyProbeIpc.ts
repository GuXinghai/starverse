import { net } from 'electron'
import { getDfcLibreOfficeFirstPartyRuntimeCatalogEntry } from '../../infra/files/dfcManagedLibreOfficeRuntime'
import type { LibreOfficeNetworkProxyProbeResult } from '../../infra/files/enginePluginLifecycleService'
import type { RegisterInvoke } from './types'

export const LIBREOFFICE_SYSTEM_PROXY_PROBE_IPC_CHANNELS = [
  'network-proxy:probe-libreoffice-system',
] as const

type ElectronNetRequest = typeof net.request

type ElectronNetProbeResponse = Readonly<{
  statusCode: number
  headers: Record<string, string | string[]>
  bodyLength: number
  finalUrl: string
}>

export function registerLibreOfficeSystemProxyProbeIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  request?: ElectronNetRequest
}>): readonly string[] {
  input.registerInvoke('network-proxy:probe-libreoffice-system', async () =>
    probeLibreOfficeOfficialDownloadWithElectronNet({
      request: input.request ?? net.request,
    }))
  return [...LIBREOFFICE_SYSTEM_PROXY_PROBE_IPC_CHANNELS]
}

export async function probeLibreOfficeOfficialDownloadWithElectronNet(input: Readonly<{
  request: ElectronNetRequest
}>): Promise<LibreOfficeNetworkProxyProbeResult> {
  const catalog = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()
  const sourceUrl = catalog.acquisitionSource.sourceUrl ?? ''
  const expectedSize = catalog.acquisitionSource.expectedSizeBytes ?? 0
  if (!sourceUrl || expectedSize <= 0) {
    return failedSystemProbe('metadata_reachable_head_failed')
  }

  let head: ElectronNetProbeResponse
  try {
    head = await requestWithElectronNet({
      request: input.request,
      url: sourceUrl,
      method: 'HEAD',
      maxBodyBytes: 0,
      timeoutMs: 15_000,
    })
  } catch (error) {
    return failedSystemProbe(sanitizeElectronNetError(error))
  }

  const headAllowed = isAllowedLibreOfficeOfficialDownloadHost(head.finalUrl)
  const contentLength = parseHeaderNumber(head.headers['content-length'])
  const contentLengthMatches = contentLength === expectedSize
  if (head.statusCode < 200 || head.statusCode >= 300 || !headAllowed || !contentLengthMatches) {
    return {
      ok: false,
      proxyMode: 'system',
      metadataReachable: true,
      assetFound: true,
      headPassed: head.statusCode >= 200 && head.statusCode < 300,
      contentLength: Number.isFinite(contentLength)
        ? contentLengthMatches ? 'match' : 'mismatch'
        : 'unavailable',
      redirectHostAllowed: headAllowed,
      rangePassed: false,
      terminalDiagnostic: headAllowed ? 'metadata_reachable_head_failed' : 'asset_host_blocked',
    }
  }

  try {
    const range = await requestWithElectronNet({
      request: input.request,
      url: sourceUrl,
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
      maxBodyBytes: 1024,
      timeoutMs: 15_000,
      abortOnUnexpectedStatus: 206,
    })
    const rangeAllowed = isAllowedLibreOfficeOfficialDownloadHost(range.finalUrl)
    const contentRange = String(firstHeader(range.headers['content-range']) ?? '')
    const rangePassed = range.statusCode === 206 &&
      range.bodyLength === 1024 &&
      /^bytes\s+0-1023\/518907010$/iu.test(contentRange) &&
      rangeAllowed
    return {
      ok: rangePassed,
      proxyMode: 'system',
      metadataReachable: true,
      assetFound: true,
      headPassed: true,
      contentLength: 'match',
      redirectHostAllowed: rangeAllowed,
      rangePassed,
      terminalDiagnostic: rangePassed ? 'proxy_probe_passed' : 'range_failed',
    }
  } catch (error) {
    return {
      ...failedSystemProbe(sanitizeElectronNetError(error)),
      headPassed: true,
      contentLength: 'match',
      redirectHostAllowed: true,
    }
  }
}

async function requestWithElectronNet(input: Readonly<{
  request: ElectronNetRequest
  url: string
  method: 'GET' | 'HEAD'
  headers?: Record<string, string>
  maxBodyBytes: number
  timeoutMs: number
  abortOnUnexpectedStatus?: number
}>): Promise<ElectronNetProbeResponse> {
  return await new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const request = input.request({
      url: input.url,
      method: input.method,
      redirect: 'follow',
    } as any)
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      request.setHeader(name, value)
    }
    const timer = setTimeout(() => {
      try {
        request.abort()
      } catch {
        // ignore abort errors
      }
      finish(() => reject(new Error('proxy_connection_timeout')))
    }, input.timeoutMs)
    request.on('response', (response: any) => {
      const statusCode = Number(response.statusCode ?? 0)
      const headers = normalizeHeaders(response.headers)
      const finalUrl = String(response.url ?? input.url)
      let bodyLength = 0
      if (input.abortOnUnexpectedStatus && statusCode !== input.abortOnUnexpectedStatus) {
        try {
          request.abort()
        } catch {
          // ignore abort errors
        }
        finish(() => resolve({ statusCode, headers, bodyLength, finalUrl }))
        return
      }
      response.on('data', (chunk: Buffer) => {
        bodyLength += chunk.byteLength
        if (bodyLength > input.maxBodyBytes) {
          try {
            request.abort()
          } catch {
            // ignore abort errors
          }
          finish(() => reject(new Error('electron_net_transport_blocked')))
        }
      })
      response.on('end', () => {
        finish(() => resolve({ statusCode, headers, bodyLength, finalUrl }))
      })
      response.on('error', (error: unknown) => {
        finish(() => reject(error))
      })
    })
    request.on('error', (error: unknown) => {
      finish(() => reject(error))
    })
    request.end()
  })
}

function normalizeHeaders(raw: unknown): Record<string, string | string[]> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key.toLowerCase()] = value
    else if (Array.isArray(value)) out[key.toLowerCase()] = value.map((item) => String(item))
  }
  return out
}

function parseHeaderNumber(value: string | string[] | undefined): number {
  const parsed = Number(firstHeader(value) ?? NaN)
  return Number.isFinite(parsed) ? parsed : NaN
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.length > 0) return value[0]
  return null
}

function failedSystemProbe(
  diagnostic: LibreOfficeNetworkProxyProbeResult['terminalDiagnostic']
): LibreOfficeNetworkProxyProbeResult {
  return {
    ok: false,
    proxyMode: 'system',
    metadataReachable: true,
    assetFound: true,
    headPassed: false,
    contentLength: 'unavailable',
    redirectHostAllowed: false,
    rangePassed: false,
    terminalDiagnostic: diagnostic,
  }
}

function sanitizeElectronNetError(error: unknown): LibreOfficeNetworkProxyProbeResult['terminalDiagnostic'] {
  const code = String((error as any)?.code ?? (error as any)?.message ?? '').trim()
  if (/timeout|timedout|etimedout|abort/iu.test(code)) return 'proxy_connection_timeout'
  if (/electron_net_transport_blocked/iu.test(code)) return 'electron_net_transport_blocked'
  return 'system_proxy_probe_failed'
}

function isAllowedLibreOfficeOfficialDownloadHost(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase()
    return host === 'github.com' || host === 'release-assets.githubusercontent.com'
  } catch {
    return false
  }
}

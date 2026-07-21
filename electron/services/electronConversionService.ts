import {
  failClosedElectronConversionResponse,
  prepareElectronConversionRequest,
  type ElectronConversionRequest,
  type ElectronConversionResponse,
} from '../../infra/files/electronConversionServiceContract'
import type {
  ElectronConversionBridge,
  ElectronProviderFetchRequest,
  ElectronProviderFetchResult,
} from '../../infra/files/electronConversionBridge'
import {
  createElectronHtmlPdfConversionAdapter,
  type ElectronHtmlPdfConversionAdapter,
} from './electronHtmlPdfConversionAdapter'
import { fetchPackageToFileWithElectronNet } from './electronOfficialPackageDownloadService'
import type { net } from 'electron'
import type {
  PackageDownloadFileTransportRequest,
  PackageDownloadFileTransportResult,
} from '../../src/next/plugin-distribution/packageDownloader'

export type MainProcessElectronConversionServiceInput = Readonly<{
  htmlToPdfAdapter?: ElectronHtmlPdfConversionAdapter
  officialPackageRequest?: typeof net.request
  providerFetch?: typeof fetch
  beforeGovernedRequest?: () => void
}>

export class MainProcessElectronConversionService implements ElectronConversionBridge {
  private readonly htmlToPdfAdapter: ElectronHtmlPdfConversionAdapter
  private readonly officialPackageRequest?: typeof net.request
  private readonly providerFetch?: typeof fetch
  private readonly beforeGovernedRequest?: () => void

  constructor(input: MainProcessElectronConversionServiceInput = {}) {
    this.htmlToPdfAdapter = input.htmlToPdfAdapter ?? createElectronHtmlPdfConversionAdapter()
    this.officialPackageRequest = input.officialPackageRequest
    this.providerFetch = input.providerFetch
    this.beforeGovernedRequest = input.beforeGovernedRequest
  }

  async convert(rawRequest: ElectronConversionRequest): Promise<ElectronConversionResponse> {
    const prepared = prepareElectronConversionRequest(rawRequest)
    if (!prepared.ok) return prepared.response

    if (prepared.request.conversionKind !== 'html_to_pdf') {
      return failClosedElectronConversionResponse({
        requestId: prepared.request.requestId,
        conversionKind: prepared.request.conversionKind,
        status: 'blocked',
        code: 'electron_conversion_kind_unsupported',
        message: 'Electron conversion kind is unsupported.',
      })
    }

    return await this.htmlToPdfAdapter.convert(prepared.request)
  }

  async fetchPackageToFile(request: PackageDownloadFileTransportRequest): Promise<PackageDownloadFileTransportResult> {
    try { this.beforeGovernedRequest?.() } catch (error) {
      return { ok: false, code: 'download_failed', detail: error instanceof Error ? error.message : 'proxy_environment_unavailable' }
    }
    return await fetchPackageToFileWithElectronNet(request, { request: this.officialPackageRequest })
  }

  async fetchProvider(request: ElectronProviderFetchRequest): Promise<ElectronProviderFetchResult> {
    if (!this.providerFetch) {
      return {
        ok: false,
        code: 'provider_fetch_unavailable',
        detail: 'electron_provider_fetch_service_unavailable',
      }
    }

    const parsedUrl = parseProviderFetchUrl(request.url)
    if (!parsedUrl) {
      return {
        ok: false,
        code: 'provider_fetch_invalid',
        detail: 'electron_provider_fetch_url_invalid',
      }
    }

    const controller = new AbortController()
    const timeoutMs = normalizeProviderFetchTimeoutMs(request.timeoutMs)
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      this.beforeGovernedRequest?.()
      const response = await this.providerFetch(parsedUrl.toString(), {
        method: String(request.method ?? 'GET'),
        headers: request.headers ?? {},
        body: request.body ?? undefined,
        signal: controller.signal,
      })
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })
      const body = Buffer.from(await response.arrayBuffer())
      return {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        headers,
        bodyText: body.toString('utf8'),
        bodyBase64: body.toString('base64'),
        finalUrl: response.url || parsedUrl.toString(),
      }
    } catch (error) {
      const isTimeout = isAbortError(error)
      return {
        ok: false,
        code: isTimeout ? 'provider_fetch_timeout' : 'provider_fetch_failed',
        detail: isTimeout
          ? 'electron_provider_fetch_timeout'
          : error instanceof Error ? error.message : String(error),
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

export function createMainProcessElectronConversionService(
  input: MainProcessElectronConversionServiceInput = {}
): MainProcessElectronConversionService {
  return new MainProcessElectronConversionService(input)
}

function parseProviderFetchUrl(value: string): URL | null {
  try {
    const parsed = new URL(String(value ?? '').trim())
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed
  } catch {
    return null
  }
}

function normalizeProviderFetchTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 60_000
  return Math.min(Math.max(Math.floor(parsed), 1), 5 * 60_000)
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && String((error as any).name ?? '') === 'AbortError')
}

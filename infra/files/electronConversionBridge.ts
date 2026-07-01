import {
  failClosedElectronConversionResponse,
  prepareElectronConversionRequest,
  sanitizeElectronConversionDiagnostic,
  type ElectronConversionRequest,
  type ElectronConversionResponse,
} from './electronConversionServiceContract'
import type {
  PackageDownloadFileTransportRequest,
  PackageDownloadFileTransportResult,
} from '../../src/next/plugin-distribution/packageDownloader'

export type ElectronProviderFetchRequest = Readonly<{
  url: string
  method?: string | null
  headers?: Record<string, string> | null
  body?: string | null
  timeoutMs?: number | null
}>

export type ElectronProviderFetchResult =
  | Readonly<{
      ok: true
      status: number
      statusText: string
      headers: Record<string, string>
      bodyText: string
      bodyBase64?: string | null
      finalUrl?: string | null
    }>
  | Readonly<{
      ok: false
      code: 'provider_fetch_unavailable' | 'provider_fetch_failed' | 'provider_fetch_timeout' | 'provider_fetch_invalid'
      detail: string
    }>

export type ElectronConversionBridge = Readonly<{
  convert: (request: ElectronConversionRequest) => Promise<ElectronConversionResponse>
  fetchPackageToFile?: (request: PackageDownloadFileTransportRequest) => Promise<PackageDownloadFileTransportResult>
  fetchProvider?: (request: ElectronProviderFetchRequest) => Promise<ElectronProviderFetchResult>
}>

type WorkerConversionPort = Readonly<{
  postMessage: (message: unknown) => void
  on: (event: 'message', handler: (message: any) => void) => void
}>

export function createUnavailableElectronConversionBridge(): ElectronConversionBridge {
  return {
    async convert(request) {
      return failClosedElectronConversionResponse({
        requestId: request.requestId,
        conversionKind: request.conversionKind,
        status: 'unavailable',
        code: 'electron_conversion_service_unavailable',
        message: 'Electron conversion service is unavailable.',
      })
    },
    async fetchPackageToFile() {
      return {
        ok: false,
        code: 'download_failed',
        detail: 'electron_package_download_service_unavailable',
      }
    },
    async fetchProvider() {
      return {
        ok: false,
        code: 'provider_fetch_unavailable',
        detail: 'electron_provider_fetch_service_unavailable',
      }
    },
  }
}

export function createWorkerThreadElectronConversionBridge(port: WorkerConversionPort): ElectronConversionBridge {
  const pending = new Map<string, {
    resolve: (response: ElectronConversionResponse) => void
    timer: NodeJS.Timeout
  }>()
  const packageDownloads = new Map<string, {
    resolve: (response: PackageDownloadFileTransportResult) => void
    timer: NodeJS.Timeout
    onProgress?: PackageDownloadFileTransportRequest['onProgress']
  }>()
  const providerFetches = new Map<string, {
    resolve: (response: ElectronProviderFetchResult) => void
    timer: NodeJS.Timeout
  }>()

  port.on('message', (message: any) => {
    if (!message) return
    if (message.type === 'electron-conversion-response') {
      const id = typeof message.id === 'string' ? message.id : ''
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      clearTimeout(entry.timer)
      entry.resolve(message.response as ElectronConversionResponse)
      return
    }
    if (message.type === 'electron-package-download-progress') {
      const id = typeof message.id === 'string' ? message.id : ''
      const entry = packageDownloads.get(id)
      if (!entry) return
      entry.onProgress?.(message.progress)
      return
    }
    if (message.type === 'electron-package-download-response') {
      const id = typeof message.id === 'string' ? message.id : ''
      const entry = packageDownloads.get(id)
      if (!entry) return
      packageDownloads.delete(id)
      clearTimeout(entry.timer)
      entry.resolve(message.response as PackageDownloadFileTransportResult)
      return
    }
    if (message.type === 'electron-provider-fetch-response') {
      const id = typeof message.id === 'string' ? message.id : ''
      const entry = providerFetches.get(id)
      if (!entry) return
      providerFetches.delete(id)
      clearTimeout(entry.timer)
      entry.resolve(message.response as ElectronProviderFetchResult)
    }
  })

  return {
    async convert(request) {
      return await new Promise<ElectronConversionResponse>((resolve) => {
        const id = `${request.requestId}:${Date.now()}:${Math.random().toString(36).slice(2)}`
        const timer = setTimeout(() => {
          pending.delete(id)
          resolve(failClosedElectronConversionResponse({
            requestId: request.requestId,
            conversionKind: request.conversionKind,
            status: 'timed_out',
            code: 'electron_conversion_timeout',
            message: 'Electron conversion service timed out.',
          }))
        }, request.timeoutMs)
        pending.set(id, { resolve, timer })
        port.postMessage({
          type: 'electron-conversion-request',
          id,
          request,
        })
      })
    },
    async fetchPackageToFile(request) {
      return await new Promise<PackageDownloadFileTransportResult>((resolve) => {
        const id = `package-download:${Date.now()}:${Math.random().toString(36).slice(2)}`
        const timer = setTimeout(() => {
          packageDownloads.delete(id)
          resolve({
            ok: false,
            code: 'download_failed',
            detail: 'electron_package_download_timeout',
          })
        }, 6 * 60 * 60 * 1000)
        packageDownloads.set(id, { resolve, timer, onProgress: request.onProgress })
        port.postMessage({
          type: 'electron-package-download-request',
          id,
          request: {
            transportRef: request.transportRef,
            maxBytes: request.maxBytes,
            outputPath: request.outputPath,
            resume: request.resume,
            proxy: request.proxy,
          },
        })
      })
    },
    async fetchProvider(request) {
      return await new Promise<ElectronProviderFetchResult>((resolve) => {
        const id = `provider-fetch:${Date.now()}:${Math.random().toString(36).slice(2)}`
        const timeoutMs = normalizeProviderFetchBridgeTimeoutMs(request.timeoutMs)
        const timer = setTimeout(() => {
          providerFetches.delete(id)
          resolve({
            ok: false,
            code: 'provider_fetch_timeout',
            detail: 'electron_provider_fetch_timeout',
          })
        }, timeoutMs + 1000)
        providerFetches.set(id, { resolve, timer })
        port.postMessage({
          type: 'electron-provider-fetch-request',
          id,
          request: {
            url: request.url,
            method: request.method,
            headers: request.headers,
            body: request.body,
            timeoutMs: request.timeoutMs,
          },
        })
      })
    },
  }
}

export function createElectronBridgeProviderFetch(
  bridge: ElectronConversionBridge | null | undefined,
  options: Readonly<{ timeoutMs?: number | null }> = {}
): typeof fetch {
  return async (input, init) => {
    if (!bridge?.fetchProvider) throw new Error('electron_provider_fetch_service_unavailable')
    const request = await toElectronProviderFetchRequest(input, init, options.timeoutMs)
    const result = await waitForProviderFetchResult(bridge.fetchProvider(request), init?.signal)
    if (!result.ok) throw new Error(result.detail || result.code)
    const responseBody = canResponseStatusHaveBody(result.status)
      ? result.bodyBase64
        ? Buffer.from(result.bodyBase64, 'base64')
        : result.bodyText
      : null
    const response = new Response(responseBody, {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
    })
    Object.defineProperty(response, 'url', {
      value: result.finalUrl || request.url,
    })
    return response
  }
}

export const createElectronBridgeHttpFetch = createElectronBridgeProviderFetch

function canResponseStatusHaveBody(status: number): boolean {
  return status !== 101 && status !== 204 && status !== 205 && status !== 304
}

function normalizeProviderFetchBridgeTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 60_000
  return Math.min(Math.max(Math.floor(parsed), 1), 5 * 60_000)
}

async function toElectronProviderFetchRequest(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  timeoutMs: number | null | undefined
): Promise<ElectronProviderFetchRequest> {
  const requestInput = isRequest(input) ? input : null
  const url = requestInput ? requestInput.url : input instanceof URL ? input.toString() : String(input)
  const headers = new Headers(requestInput?.headers)
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  }
  const normalizedHeaders: Record<string, string> = {}
  headers.forEach((value, key) => {
    normalizedHeaders[key] = value
  })

  const rawBody = init && 'body' in init ? init.body : undefined
  const body = rawBody !== undefined
    ? await providerFetchBodyToString(rawBody)
    : requestInput
      ? await requestInput.clone().text().then((value) => value || null)
      : null

  return {
    url,
    method: String(init?.method ?? requestInput?.method ?? 'GET'),
    headers: normalizedHeaders,
    body,
    timeoutMs: normalizeProviderFetchBridgeTimeoutMs(timeoutMs),
  }
}

function isRequest(value: unknown): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request
}

async function providerFetchBodyToString(body: BodyInit | null | undefined): Promise<string | null> {
  if (body == null) return null
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  if (body instanceof ArrayBuffer) return Buffer.from(body).toString('utf8')
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString('utf8')
  if (typeof Blob !== 'undefined' && body instanceof Blob) return await body.text()
  throw new Error('electron_provider_fetch_body_unsupported')
}

async function waitForProviderFetchResult(
  promise: Promise<ElectronProviderFetchResult>,
  signal: AbortSignal | null | undefined
): Promise<ElectronProviderFetchResult> {
  if (!signal) return await promise
  if (signal.aborted) throw createAbortError()
  return await new Promise<ElectronProviderFetchResult>((resolve, reject) => {
    const onAbort = () => reject(createAbortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function createAbortError(): Error {
  const error = new Error('This operation was aborted')
  ;(error as any).name = 'AbortError'
  return error
}

export async function requestElectronConversion(
  bridge: ElectronConversionBridge | null | undefined,
  rawRequest: unknown
): Promise<ElectronConversionResponse> {
  const prepared = prepareElectronConversionRequest(rawRequest)
  if (!prepared.ok) return prepared.response

  if (!bridge) {
    return failClosedElectronConversionResponse({
      requestId: prepared.request.requestId,
      conversionKind: prepared.request.conversionKind,
      status: 'unavailable',
      code: 'electron_conversion_service_unavailable',
      message: 'Electron conversion service is unavailable.',
    })
  }

  try {
    const response = await bridge.convert(prepared.request)
    return {
      ...response,
      requestId: prepared.request.requestId,
      conversionKind: prepared.request.conversionKind,
      diagnostics: response.diagnostics.map((diagnostic) => sanitizeElectronConversionDiagnostic(diagnostic)),
      output: response.status === 'success' ? response.output : null,
    }
  } catch (error) {
    return failClosedElectronConversionResponse({
      requestId: prepared.request.requestId,
      conversionKind: prepared.request.conversionKind,
      status: 'failed',
      code: 'electron_conversion_blocked',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

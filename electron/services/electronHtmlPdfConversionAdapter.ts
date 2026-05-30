import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveDfcSandboxOutputPath } from '../../infra/files/dfcConversionSandbox'
import {
  failClosedElectronConversionResponse,
  successElectronConversionResponse,
  type ElectronConversionCleanupStatus,
  type ElectronConversionPreparedRequest,
  type ElectronConversionResponse,
} from '../../infra/files/electronConversionServiceContract'

export type ElectronHtmlPdfConversionAdapter = Readonly<{
  convert: (request: ElectronConversionPreparedRequest) => Promise<ElectronConversionResponse>
}>

type ElectronBrowserWindowFactory = (options: ElectronBrowserWindowOptions) => ElectronBrowserWindowLike

type ElectronBrowserWindowOptions = Readonly<{
  show: false
  width: number
  height: number
  webPreferences: Record<string, unknown>
}>

type ElectronBrowserWindowLike = Readonly<{
  webContents: ElectronWebContentsLike
  destroy: () => void
  isDestroyed?: () => boolean
}>

type ElectronWebContentsLike = Readonly<{
  session?: ElectronSessionLike
  setWindowOpenHandler?: (handler: (details: { url: string }) => { action: 'allow' | 'deny' }) => void
  on?: (event: string, handler: (...args: any[]) => void) => void
  loadURL: (url: string) => Promise<void>
  printToPDF: (options?: Record<string, unknown>) => Promise<Uint8Array | Buffer>
}>

type ElectronSessionLike = Readonly<{
  webRequest?: Readonly<{
    onBeforeRequest?: (handler: (details: { url: string; resourceType?: string }, callback: (response: { cancel: boolean }) => void) => void) => void
  }>
  on?: (event: string, handler: (...args: any[]) => void) => void
  clearStorageData?: () => Promise<void>
}>

export type ElectronHtmlPdfConversionAdapterDeps = Readonly<{
  createWindow?: ElectronBrowserWindowFactory
  now?: () => number
}>

const DEFAULT_TIMEOUT_MS = 15_000

export function createElectronHtmlPdfConversionAdapter(deps: ElectronHtmlPdfConversionAdapterDeps = {}): ElectronHtmlPdfConversionAdapter {
  return {
    async convert(request) {
      if (request.conversionKind !== 'html_to_pdf') {
        return failClosedElectronConversionResponse({
          requestId: request.requestId,
          conversionKind: request.conversionKind,
          status: 'blocked',
          code: 'electron_conversion_kind_unsupported',
          message: 'Electron conversion kind is unsupported.',
        })
      }

      if (request.policy.javascriptEnabled || request.policy.networkEnabled || request.policy.localFileAccessEnabled) {
        return failClosedElectronConversionResponse({
          requestId: request.requestId,
          conversionKind: request.conversionKind,
          status: 'blocked',
          code: 'electron_conversion_blocked',
          message: 'Electron conversion policy is blocked.',
        })
      }

      const outputRelativeDir = path.dirname(request.output.relativePath)
      const outputValidation = resolveDfcSandboxOutputPath(
        path.resolve(request.output.rootDir, outputRelativeDir === '.' ? '' : outputRelativeDir),
        path.basename(request.output.relativePath)
      )
      if (!outputValidation.ok || path.resolve(outputValidation.path) !== path.resolve(request.resolvedOutputPath)) {
        return failClosedElectronConversionResponse({
          requestId: request.requestId,
          conversionKind: request.conversionKind,
          status: 'blocked',
          code: 'electron_conversion_request_invalid',
          message: outputValidation.ok ? 'Electron conversion output path is invalid.' : outputValidation.message,
        })
      }

      let win: ElectronBrowserWindowLike | null = null
      let cleanupStatus: ElectronConversionCleanupStatus = 'not_requested'
      try {
        const html = await withTimeout(readFile(request.resolvedSourcePath, 'utf8'), request.timeoutMs, 'read')
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
        const createWindow = deps.createWindow ?? await loadElectronBrowserWindowFactory()
        win = createWindow({
          show: false,
          width: 1024,
          height: 768,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            javascript: false,
            partition: createTemporaryPartition(request.requestId, deps.now?.() ?? Date.now()),
          },
        })

        installNavigationPolicy(win.webContents, dataUrl)
        installResourcePolicy(win.webContents.session, dataUrl)

        await withTimeout(win.webContents.loadURL(dataUrl), request.timeoutMs, 'load')
        const pdfBytes = await withTimeout(win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true }), request.timeoutMs, 'print')
        if (!isPdfBytes(pdfBytes)) {
          return failClosedElectronConversionResponse({
            requestId: request.requestId,
            conversionKind: request.conversionKind,
            status: 'failed',
            code: 'electron_conversion_blocked',
            message: 'Electron conversion did not produce a valid PDF.',
            cleanupStatus: await cleanupWindow(win),
          })
        }
        await mkdir(path.dirname(request.resolvedOutputPath), { recursive: true })
        await writeFile(request.resolvedOutputPath, Buffer.from(pdfBytes))
        cleanupStatus = await cleanupWindow(win)
        win = null
        return successElectronConversionResponse({
          request,
          outputPath: request.resolvedOutputPath,
          cleanupStatus,
        })
      } catch (error) {
        cleanupStatus = await cleanupWindow(win)
        win = null
        const timedOut = error instanceof Error && error.name === 'ElectronConversionTimeoutError'
        return failClosedElectronConversionResponse({
          requestId: request.requestId,
          conversionKind: request.conversionKind,
          status: timedOut ? 'timed_out' : 'failed',
          code: timedOut ? 'electron_conversion_timeout' : 'electron_conversion_blocked',
          message: timedOut ? 'Electron conversion timed out.' : error instanceof Error ? error.message : String(error),
          cleanupStatus,
        })
      }
    },
  }
}

function installNavigationPolicy(webContents: ElectronWebContentsLike, allowedUrl: string): void {
  webContents.setWindowOpenHandler?.(() => ({ action: 'deny' }))
  webContents.on?.('will-navigate', (event: { preventDefault?: () => void }, url: string) => {
    if (url !== allowedUrl) event.preventDefault?.()
  })
}

function installResourcePolicy(session: ElectronSessionLike | undefined, allowedUrl: string): void {
  session?.webRequest?.onBeforeRequest?.((details, callback) => {
    const url = String(details.url ?? '')
    const allowed = url === allowedUrl || url === 'about:blank' || url.startsWith('data:')
    callback({ cancel: !allowed })
  })
  session?.on?.('will-download', (event: { preventDefault?: () => void }) => {
    event.preventDefault?.()
  })
}

async function cleanupWindow(win: ElectronBrowserWindowLike | null): Promise<ElectronConversionCleanupStatus> {
  if (!win) return 'not_requested'
  try {
    await win.webContents.session?.clearStorageData?.()
    if (!win.isDestroyed?.()) win.destroy()
    return 'attempted'
  } catch {
    try {
      if (!win.isDestroyed?.()) win.destroy()
    } catch {
      return 'failed'
    }
    return 'failed'
  }
}

async function loadElectronBrowserWindowFactory(): Promise<ElectronBrowserWindowFactory> {
  try {
    const electron = await import('electron') as any
    if (typeof electron.BrowserWindow !== 'function') {
      throw new Error('Electron BrowserWindow is unavailable.')
    }
    return (options) => new electron.BrowserWindow(options)
  } catch (error) {
    return () => {
      throw error instanceof Error ? error : new Error(String(error))
    }
  }
}

function createTemporaryPartition(requestId: string, now: number): string {
  const safeRequestId = requestId.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'request'
  return `starverse-dfc-conversion-${safeRequestId}-${Math.floor(now)}-${randomUUID()}`
}

function isPdfBytes(value: Uint8Array | Buffer): boolean {
  const bytes = Buffer.from(value)
  return bytes.length >= 5 && bytes.subarray(0, 5).toString('utf8') === '%PDF-'
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number | null | undefined, phase: string): Promise<T> {
  const effectiveTimeout = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Electron conversion ${phase} timed out.`)
          error.name = 'ElectronConversionTimeoutError'
          reject(error)
        }, effectiveTimeout)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

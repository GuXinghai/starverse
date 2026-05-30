import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { prepareElectronConversionRequest } from '../../infra/files/electronConversionServiceContract'
import { createElectronHtmlPdfConversionAdapter } from './electronHtmlPdfConversionAdapter'

function baseRequest(root: string, timeoutMs = 15000) {
  const prepared = prepareElectronConversionRequest({
    requestId: 'req-html-pdf-adapter',
    conversionKind: 'html_to_pdf',
    source: {
      kind: 'sandbox_input',
      rootDir: root,
      relativePath: 'input/source.html',
      mime: 'text/html',
    },
    output: {
      kind: 'sandbox_output',
      rootDir: root,
      relativePath: 'output/source.pdf',
      mime: 'application/pdf',
      extension: 'pdf',
    },
    timeoutMs,
    policy: {
      javascriptEnabled: false,
      networkEnabled: false,
      localFileAccessEnabled: false,
    },
  })
  if (!prepared.ok) throw new Error('expected valid request')
  return prepared.request
}

function createFakeElectronWindow(input: Readonly<{
  pdfBytes?: Buffer
  printError?: Error
  printNeverResolves?: boolean
  cleanupError?: Error
}> = {}) {
  const eventHandlers = new Map<string, (...args: any[]) => void>()
  let beforeRequest: ((details: { url: string; resourceType?: string }, callback: (response: { cancel: boolean }) => void) => void) | null = null
  let windowOpenHandler: ((details: { url: string }) => { action: 'allow' | 'deny' }) | null = null
  let destroyed = false
  const clearStorageData = vi.fn(async () => {
    if (input.cleanupError) throw input.cleanupError
  })
  const session = {
    webRequest: {
      onBeforeRequest: vi.fn((handler) => {
        beforeRequest = handler
      }),
    },
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      eventHandlers.set(event, handler)
    }),
    clearStorageData,
  }
  const webContents = {
    session,
    setWindowOpenHandler: vi.fn((handler) => {
      windowOpenHandler = handler
    }),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      eventHandlers.set(event, handler)
    }),
    loadURL: vi.fn(async () => {}),
    printToPDF: vi.fn(async () => {
      if (input.printNeverResolves) return await new Promise<Buffer>(() => {})
      if (input.printError) throw input.printError
      return input.pdfBytes ?? Buffer.from('%PDF-1.7\n% fake pdf')
    }),
  }
  const window = {
    webContents,
    destroy: vi.fn(() => {
      destroyed = true
    }),
    isDestroyed: vi.fn(() => destroyed),
  }
  const createWindow = vi.fn(() => window)
  return {
    createWindow,
    window,
    webContents,
    session,
    eventHandlers,
    getBeforeRequest: () => beforeRequest,
    getWindowOpenHandler: () => windowOpenHandler,
  }
}

async function withFixture<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starverse-electron-html-pdf-adapter-'))
  try {
    await mkdir(path.join(root, 'input'), { recursive: true })
    await writeFile(path.join(root, 'input/source.html'), '<!doctype html><h1>Report</h1><script>window.x=1</script><img src="https://example.invalid/a.png"><iframe src="file:///C:/secret.txt"></iframe>')
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('electron HTML PDF conversion adapter', () => {
  it('creates a hidden isolated conversion window and writes printToPDF output under the controlled dir', async () => {
    await withFixture(async (root) => {
      const fake = createFakeElectronWindow()
      const adapter = createElectronHtmlPdfConversionAdapter({ createWindow: fake.createWindow, now: () => 1000 })
      const request = baseRequest(root)

      const response = await adapter.convert(request)

      expect(response).toMatchObject({
        requestId: 'req-html-pdf-adapter',
        conversionKind: 'html_to_pdf',
        status: 'success',
        output: { kind: 'controlled_output', mime: 'application/pdf', extension: 'pdf' },
        cleanupStatus: 'attempted',
      })
      const options = (fake.createWindow as any).mock.calls[0]?.[0]
      expect(options).toBeTruthy()
      expect(options.show).toBe(false)
      expect(options.webPreferences).toMatchObject({
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        javascript: false,
      })
      expect(options.webPreferences).not.toHaveProperty('preload')
      expect(String(options.webPreferences.partition)).toContain('starverse-dfc-conversion-req-html-pdf-adapter')
      expect(String(options.webPreferences.partition)).not.toContain('persist:')
      expect(String((fake.webContents.loadURL as any).mock.calls[0]?.[0])).toMatch(/^data:text\/html;charset=utf-8,/u)
      expect(fake.window.destroy).toHaveBeenCalledTimes(1)
      expect(fake.session.clearStorageData).toHaveBeenCalledTimes(1)
      const output = await readFile(path.join(root, 'output/source.pdf'))
      expect(output.subarray(0, 5).toString('utf8')).toBe('%PDF-')
    })
  })

  it('blocks navigation, window open, downloads, network resources, and local file resources', async () => {
    await withFixture(async (root) => {
      const fake = createFakeElectronWindow()
      const adapter = createElectronHtmlPdfConversionAdapter({ createWindow: fake.createWindow })
      await adapter.convert(baseRequest(root))

      const windowOpen = fake.getWindowOpenHandler()
      expect(windowOpen?.({ url: 'https://example.invalid' })).toEqual({ action: 'deny' })

      const navigationEvent = { preventDefault: vi.fn() }
      fake.eventHandlers.get('will-navigate')?.(navigationEvent, 'https://example.invalid')
      expect(navigationEvent.preventDefault).toHaveBeenCalledTimes(1)

      const downloadEvent = { preventDefault: vi.fn() }
      fake.eventHandlers.get('will-download')?.(downloadEvent)
      expect(downloadEvent.preventDefault).toHaveBeenCalledTimes(1)

      const beforeRequest = fake.getBeforeRequest()
      const decisions: Array<{ cancel: boolean }> = []
      beforeRequest?.({ url: 'https://example.invalid/a.png' }, (decision) => decisions.push(decision))
      beforeRequest?.({ url: 'file:///C:/secret.txt' }, (decision) => decisions.push(decision))
      beforeRequest?.({ url: 'data:image/png;base64,AAAA' }, (decision) => decisions.push(decision))
      expect(decisions).toEqual([{ cancel: true }, { cancel: true }, { cancel: false }])
    })
  })

  it('fails closed and destroys the window when printToPDF fails', async () => {
    await withFixture(async (root) => {
      const fake = createFakeElectronWindow({ printError: new Error('print failed at C:\\Users\\private\\source.html token=secret file body: <html>') })
      const adapter = createElectronHtmlPdfConversionAdapter({ createWindow: fake.createWindow })

      const response = await adapter.convert(baseRequest(root))
      const serialized = JSON.stringify(response)

      expect(response).toMatchObject({
        status: 'failed',
        output: null,
        cleanupStatus: 'attempted',
        diagnostics: [expect.objectContaining({ code: 'electron_conversion_blocked' })],
      })
      expect(fake.window.destroy).toHaveBeenCalledTimes(1)
      expect(serialized).not.toContain('C:\\Users\\private')
      expect(serialized).not.toContain('secret')
      expect(serialized).not.toContain('<html>')
    })
  })

  it('fails closed on print timeout and destroys the window', async () => {
    await withFixture(async (root) => {
      const fake = createFakeElectronWindow({ printNeverResolves: true })
      const adapter = createElectronHtmlPdfConversionAdapter({ createWindow: fake.createWindow })

      const response = await adapter.convert(baseRequest(root, 50))

      expect(response).toMatchObject({
        status: 'timed_out',
        output: null,
        cleanupStatus: 'attempted',
        diagnostics: [expect.objectContaining({ code: 'electron_conversion_timeout' })],
      })
      expect(fake.window.destroy).toHaveBeenCalledTimes(1)
    })
  })

  it('reports failed cleanup without exposing output on failed conversion', async () => {
    await withFixture(async (root) => {
      const fake = createFakeElectronWindow({ printError: new Error('print failed'), cleanupError: new Error('cleanup failed') })
      const adapter = createElectronHtmlPdfConversionAdapter({ createWindow: fake.createWindow })

      const response = await adapter.convert(baseRequest(root))

      expect(response).toMatchObject({
        status: 'failed',
        output: null,
        cleanupStatus: 'failed',
      })
      expect(fake.window.destroy).toHaveBeenCalledTimes(1)
    })
  })
})

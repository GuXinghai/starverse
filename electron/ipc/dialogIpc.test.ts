import { afterEach, describe, expect, it, vi } from 'vitest'
import { dialog } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { registerDialogIpc } from './dialogIpc'

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(),
  },
}))

describe('registerDialogIpc', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers dialog:select-file without logging full local paths and returns the attachment payload', async () => {
    const registerInvoke = vi.fn()
    registerDialogIpc({ registerInvoke })
    const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
    for (const [channel, handler] of registerInvoke.mock.calls) {
      handlers.set(channel, handler)
    }

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const showOpenDialog = vi.mocked(dialog.showOpenDialog)
    const tempDir = await mkdtemp(path.join(tmpdir(), 'dialog-ipc-'))
    const tempFilePath = path.join(tempDir, 'secret.pdf')
    await writeFile(tempFilePath, 'pdf-bytes')
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [tempFilePath],
    } as any)

    try {
      const result = await handlers.get('dialog:select-file')?.({}, {})

      expect(result).toEqual(expect.objectContaining({
        filename: 'secret.pdf',
        mimeType: 'application/pdf',
        size: Buffer.byteLength('pdf-bytes'),
        dataUrl: expect.stringMatching(/^data:application\/pdf;base64,/),
      }))
      const logOutput = [...logSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
        .join(' ')
      expect(logOutput).not.toContain('D:\\')
      expect(logOutput).not.toContain('C:\\')
      expect(logOutput).not.toContain('/Users/')
      expect(logOutput).not.toContain('data:')
      expect(logOutput).not.toContain('base64')
      expect(logOutput).not.toContain('secret.pdf')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('registers dialog:select-local-files and returns filePaths[] for file context', async () => {
    const registerInvoke = vi.fn()
    registerDialogIpc({ registerInvoke })
    const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
    for (const [channel, handler] of registerInvoke.mock.calls) {
      handlers.set(channel, handler)
    }

    const showOpenDialog = vi.mocked(dialog.showOpenDialog)
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:/tmp/a.txt'],
    } as any)

    const result = await handlers.get('dialog:select-local-files')?.({}, { context: 'file' })
    expect(result).toEqual({ filePaths: ['C:/tmp/a.txt'] })
    expect(showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
      filters: [{ name: 'All Files', extensions: ['*'] }],
    }))
  })

  it('does not log full local paths for dialog:select-local-files image context and still returns filePaths[]', async () => {
    const registerInvoke = vi.fn()
    registerDialogIpc({ registerInvoke })
    const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
    for (const [channel, handler] of registerInvoke.mock.calls) {
      handlers.set(channel, handler)
    }

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const showOpenDialog = vi.mocked(dialog.showOpenDialog)
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:/Users/alice/Pictures/photo.png'],
    } as any)

    const result = await handlers.get('dialog:select-local-files')?.({}, { context: 'image', allowMultiple: true })

    expect(result).toEqual({ filePaths: ['C:/Users/alice/Pictures/photo.png'] })
    const logOutput = [...logSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
      .join(' ')
    expect(logOutput).not.toContain('D:\\')
    expect(logOutput).not.toContain('C:\\')
    expect(logOutput).not.toContain('/Users/')
    expect(logOutput).not.toContain('data:')
    expect(logOutput).not.toContain('base64')
  })

  it('uses image filter for dialog:select-local-files image context', async () => {
    const registerInvoke = vi.fn()
    registerDialogIpc({ registerInvoke })
    const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
    for (const [channel, handler] of registerInvoke.mock.calls) {
      handlers.set(channel, handler)
    }

    const showOpenDialog = vi.mocked(dialog.showOpenDialog)
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:/tmp/a.png'],
    } as any)

    await handlers.get('dialog:select-local-files')?.({}, { context: 'image' })
    expect(showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    }))
  })

  it('keeps legacy dialog:select-file channel available', async () => {
    const registerInvoke = vi.fn()
    registerDialogIpc({ registerInvoke })
    const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
    for (const [channel, handler] of registerInvoke.mock.calls) {
      handlers.set(channel, handler)
    }

    const showOpenDialog = vi.mocked(dialog.showOpenDialog)
    showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    } as any)

    const result = await handlers.get('dialog:select-file')?.({}, {})
    expect(result).toBeNull()
    expect(showOpenDialog).toHaveBeenCalled()
  })

  it('sanitizes select-local-files failure logs and does not leak local paths or base64 payloads', async () => {
    const registerInvoke = vi.fn()
    registerDialogIpc({ registerInvoke })
    const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
    for (const [channel, handler] of registerInvoke.mock.calls) {
      handlers.set(channel, handler)
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const showOpenDialog = vi.mocked(dialog.showOpenDialog)
    showOpenDialog.mockRejectedValueOnce(new Error('open failed for C:\\Users\\alice\\secret.txt data:image/png;base64,AAAA'))

    const result = await handlers.get('dialog:select-local-files')?.({}, { context: 'file' })
    expect(result).toEqual({ filePaths: [] })

    const output = errorSpy.mock.calls
      .flat()
      .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
      .join(' ')
    expect(output).toContain('[redacted-path]')
    expect(output).toContain('data:[redacted]')
    expect(output).not.toContain('C:\\Users\\alice\\secret.txt')
    expect(output.toLowerCase()).not.toContain('base64,aaaa')
  })
})

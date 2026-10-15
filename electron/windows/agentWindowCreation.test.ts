import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  options: vi.fn(), navigate: new Map<string, (...args: any[]) => void>(),
  contents: { on: vi.fn(), setWindowOpenHandler: vi.fn(), openDevTools: vi.fn() },
  loadURL: vi.fn(), openExternal: vi.fn(),
}))
vi.mock('electron', () => ({
  app: {}, dialog: {}, shell: { openExternal: mocks.openExternal },
  BrowserWindow: class {
    webContents = mocks.contents
    loadURL = mocks.loadURL
    constructor(options: unknown) { mocks.options(options) }
    on(name: string, handler: (...args: any[]) => void) { mocks.navigate.set(name, handler) }
  },
}))
import { createMainWindow } from './mainWindow'

describe('agent main window', () => {
  it('keeps the real preload/sandbox and blocks external app launches in background mode', () => {
    mocks.contents.on.mockImplementation((name, handler) => mocks.navigate.set(name, handler))
    createMainWindow({ isDev: true, viteDevServerUrl: 'http://127.0.0.1:5177/',
      rendererDist: '', publicPath: '', preloadPath: 'real-preload.mjs', agentControlled: true, agentBackground: true })
    expect(mocks.options).toHaveBeenCalledWith(expect.objectContaining({ show: false,
      webPreferences: { preload: 'real-preload.mjs', sandbox: true, backgroundThrottling: false, offscreen: true } }))
    expect(mocks.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5177/')
    expect(mocks.contents.openDevTools).not.toHaveBeenCalled()
    const preventDefault = vi.fn()
    mocks.navigate.get('will-navigate')?.({ preventDefault }, 'https://example.com/')
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(mocks.openExternal).not.toHaveBeenCalled()
    expect(mocks.contents.setWindowOpenHandler.mock.calls[0][0]({ url: 'https://example.com/' })).toEqual({ action: 'deny' })
    expect(mocks.openExternal).not.toHaveBeenCalled()
  })
})

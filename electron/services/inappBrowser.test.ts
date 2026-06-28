import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => {
  const views: any[] = []
  const windows: any[] = []
  let nextWindowId = 1

  class BrowserWindow {
    id = nextWindowId++
    webContents = {
      once: vi.fn(),
      send: vi.fn(),
    }
    on = vi.fn()
    loadURL = vi.fn(async () => undefined)
    setBrowserView = vi.fn()
    removeBrowserView = vi.fn()
    getSize = vi.fn(() => [1280, 800])

    constructor() {
      windows.push(this)
    }
  }

  class BrowserView {
    windowOpenHandler: ((details: { url: string }) => { action: 'allow' | 'deny' }) | null = null
    handlers = new Map<string, (...args: any[]) => void>()
    currentUrl = 'https://example.com/'
    webContents = {
      setWindowOpenHandler: vi.fn((handler: (details: { url: string }) => { action: 'allow' | 'deny' }) => {
        this.windowOpenHandler = handler
      }),
      on: vi.fn((eventName: string, handler: (...args: any[]) => void) => {
        this.handlers.set(eventName, handler)
      }),
      loadURL: vi.fn(async (url: string) => {
        this.currentUrl = url
      }),
      getURL: vi.fn(() => this.currentUrl),
      getTitle: vi.fn(() => ''),
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      isLoading: vi.fn(() => false),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      removeAllListeners: vi.fn(),
    }
    setBounds = vi.fn()
    setAutoResize = vi.fn()

    constructor() {
      views.push(this)
    }
  }

  return {
    views,
    windows,
    BrowserWindow,
    BrowserView,
    clipboard: { writeText: vi.fn() },
    shell: { openExternal: vi.fn() },
  }
})

vi.mock('electron', () => ({
  BrowserWindow: electronMock.BrowserWindow,
  BrowserView: electronMock.BrowserView,
  clipboard: electronMock.clipboard,
  shell: electronMock.shell,
}))

import { shell } from 'electron'
import { InAppBrowserManager } from './inappBrowser'

function createManager() {
  return new InAppBrowserManager({
    preloadPath: 'inapp-preload.js',
    shellUrl: 'https://app.example.test/inapp-shell.html',
  })
}

describe('InAppBrowserManager external URL policy', () => {
  beforeEach(() => {
    electronMock.views.length = 0
    electronMock.windows.length = 0
    vi.mocked(shell.openExternal).mockClear()
  })

  it('opens the active tab externally only for http and https URLs', () => {
    const manager = createManager()
    const opened = manager.openLink('https://example.com/page')
    const view = electronMock.views[0]
    view.currentUrl = 'https://example.com/page'

    expect(manager.openExternal(opened.tabId)).toEqual({ ok: true })
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/page')
  })

  it.each([
    'file:///C:/Users/alice/secret.txt',
    'javascript:alert(1)',
    'data:text/html,hello',
    'vbscript:msgbox(1)',
    'mailto:alice@example.com',
    'starverse://callback',
  ])('blocks tab openExternal for %s without calling shell.openExternal', (blockedUrl) => {
    const manager = createManager()
    const opened = manager.openLink('https://example.com/page')
    const view = electronMock.views[0]
    view.currentUrl = blockedUrl

    expect(manager.openExternal(opened.tabId)).toEqual({
      ok: false,
      code: 'external_protocol_blocked',
      message: 'External URL protocol is blocked.',
    })
    expect(shell.openExternal).not.toHaveBeenCalled()
  })

  it('uses the same policy for will-navigate and never opens blocked protocols externally', () => {
    const manager = createManager()
    manager.openLink('https://example.com/page')
    const view = electronMock.views[0]
    const preventDefault = vi.fn()

    view.handlers.get('will-navigate')?.({ preventDefault }, 'file:///C:/Users/alice/secret.txt')

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(shell.openExternal).not.toHaveBeenCalled()
  })

  it('uses the same policy for window.open targets', () => {
    const manager = createManager()
    manager.openLink('https://example.com/page')
    const view = electronMock.views[0]

    expect(view.windowOpenHandler?.({ url: 'mailto:alice@example.com' })).toEqual({ action: 'deny' })
    expect(electronMock.views).toHaveLength(1)
    expect(shell.openExternal).not.toHaveBeenCalled()

    expect(view.windowOpenHandler?.({ url: 'https://example.com/popup' })).toEqual({ action: 'deny' })
    expect(electronMock.views).toHaveLength(2)
  })
})

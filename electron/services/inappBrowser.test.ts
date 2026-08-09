import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => {
  const views: any[] = []
  const windows: any[] = []
  let nextWindowId = 1
  let nextViewLoadError: Error | null = null

  class BrowserWindow {
    id = nextWindowId++
    webContents = {
      once: vi.fn(),
      send: vi.fn(),
    }
    on = vi.fn()
    loadURL = vi.fn(async () => undefined)
    contentView = {
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
      getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1280, height: 800 })),
    }

    constructor() {
      windows.push(this)
    }
  }

  class WebContentsView {
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
        if (nextViewLoadError) {
          const error = nextViewLoadError
          nextViewLoadError = null
          throw error
        }
        this.currentUrl = url
      }),
      getURL: vi.fn(() => this.currentUrl),
      getTitle: vi.fn(() => ''),
      navigationHistory: {
        canGoBack: vi.fn(() => false),
        canGoForward: vi.fn(() => false),
        goBack: vi.fn(),
        goForward: vi.fn(),
      },
      isLoading: vi.fn(() => false),
      reload: vi.fn(),
      removeAllListeners: vi.fn(),
      close: vi.fn(),
    }
    setBounds = vi.fn()

    constructor() {
      views.push(this)
    }
  }

  return {
    views,
    windows,
    BrowserWindow,
    WebContentsView,
    clipboard: { writeText: vi.fn() },
    shell: { openExternal: vi.fn() },
    rejectNextViewLoad: (error: Error) => { nextViewLoadError = error },
  }
})

vi.mock('electron', () => ({
  BrowserWindow: electronMock.BrowserWindow,
  WebContentsView: electronMock.WebContentsView,
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

  it('logs only a fixed code and sanitized origin when tab loading fails', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    electronMock.rejectNextViewLoad(new Error('C:\\Users\\alice\\secret-profile\\Cookies'))

    createManager().openLink('https://user:password@example.com/private?token=secret#fragment')
    await Promise.resolve()
    await Promise.resolve()

    expect(errorLog).toHaveBeenCalledWith('[inapp] INAPP_TAB_LOAD_FAILED', { target: 'https://example.com' })
    const serialized = JSON.stringify(errorLog.mock.calls)
    expect(serialized).not.toContain('password')
    expect(serialized).not.toContain('token=secret')
    expect(serialized).not.toContain('secret-profile')
  })

  it('keeps exactly the chosen WebContentsView attached while switching and closing tabs', () => {
    const manager = createManager()
    const first = manager.openLink('https://example.com/first')
    const second = manager.openLink('https://example.com/second')
    const win = electronMock.windows[0]
    const firstView = electronMock.views[0]
    const secondView = electronMock.views[1]

    expect(win.contentView.addChildView).toHaveBeenNthCalledWith(1, firstView)
    expect(win.contentView.removeChildView).toHaveBeenCalledWith(firstView)
    expect(win.contentView.addChildView).toHaveBeenLastCalledWith(secondView)

    expect(manager.focusTab(first.tabId)).toBe(true)
    expect(win.contentView.removeChildView).toHaveBeenCalledWith(secondView)
    expect(win.contentView.addChildView).toHaveBeenLastCalledWith(firstView)

    expect(manager.closeTab(first.tabId)).toBe(true)
    expect(firstView.webContents.close).toHaveBeenCalledWith({ waitForBeforeUnload: false })
    expect(win.contentView.addChildView).toHaveBeenLastCalledWith(secondView)
    expect(manager.getWindowSnapshot(second.windowId)?.activeTabId).toBe(second.tabId)
  })

  it('moves a chosen WebContentsView between root content views without duplicating tab ownership', () => {
    const manager = createManager()
    const opened = manager.openLink('https://example.com/detach')
    const originalWindow = electronMock.windows[0]
    const view = electronMock.views[0]

    const detached = manager.detachTab(opened.tabId)
    const targetWindow = electronMock.windows[1]
    expect(detached).toEqual({ windowId: targetWindow.id, tabId: opened.tabId })
    expect(originalWindow.contentView.removeChildView).toHaveBeenCalledWith(view)
    expect(targetWindow.contentView.addChildView).toHaveBeenCalledWith(view)
    expect(manager.getWindowSnapshot(originalWindow.id)?.tabs).toEqual([])
    expect(manager.getWindowSnapshot(targetWindow.id)?.activeTabId).toBe(opened.tabId)
  })
})

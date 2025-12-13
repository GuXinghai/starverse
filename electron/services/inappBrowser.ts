import { BrowserView, BrowserWindow, clipboard, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

type InAppBrowserConfig = {
  preloadPath: string
  shellUrl: string
  toolbarHeight?: number
}

export type InAppTabState = {
  id: string
  url: string
  title: string
  windowId: number
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}

type InternalTab = InAppTabState & {
  view: BrowserView
}

type InternalWindow = {
  id: number
  win: BrowserWindow
  activeTabId: string | null
  tabIds: Set<string>
}

const DEFAULT_TOOLBAR_HEIGHT = 120

/**
 * 管理内链 WebView 的窗口与 Tab。
 * - 使用 BrowserView 承载网页内容
 * - BrowserWindow 承载控制 UI（public/inapp-shell.html）
 * - 默认复用单窗口多 Tab，可拆分 Tab 到新窗口
 */
export class InAppBrowserManager {
  private windows = new Map<number, InternalWindow>()
  private tabs = new Map<string, InternalTab>()
  private toolbarHeight: number
  private config: InAppBrowserConfig

  constructor(config: InAppBrowserConfig) {
    this.config = config
    this.toolbarHeight = config.toolbarHeight ?? DEFAULT_TOOLBAR_HEIGHT
    this.registerIpcHandlers()
  }

  /**
   * 打开链接（默认复用现有窗口，创建新 Tab）
   */
  openLink(url: string, targetWindowId?: number) {
    const normalizedUrl = this.normalizeUrl(url)
    const window = targetWindowId ? this.windows.get(targetWindowId) : this.getOrCreatePrimaryWindow()
    const win = window ?? this.getOrCreatePrimaryWindow()
    const tab = this.createTab(normalizedUrl, win.id)
    this.setActiveTab(win.id, tab.id)
    this.loadUrl(tab.id, normalizedUrl)
    return { tabId: tab.id, windowId: win.id }
  }

  goBack(tabId: string) {
    const tab = this.tabs.get(tabId)
    if (tab && tab.view.webContents.canGoBack()) {
      tab.view.webContents.goBack()
    }
  }

  goForward(tabId: string) {
    const tab = this.tabs.get(tabId)
    if (tab && tab.view.webContents.canGoForward()) {
      tab.view.webContents.goForward()
    }
  }

  reload(tabId: string) {
    const tab = this.tabs.get(tabId)
    tab?.view.webContents.reload()
  }

  closeTab(tabId: string) {
    const tab = this.tabs.get(tabId)
    if (!tab) return false
    const window = this.windows.get(tab.windowId)
    if (window) {
      window.tabIds.delete(tabId)
      if (window.activeTabId === tabId) {
        window.activeTabId = [...window.tabIds][0] ?? null
      }
      window.win.removeBrowserView(tab.view)
    }
    tab.view.webContents.removeAllListeners()
    ;(tab.view.webContents as any).destroy?.()
    this.tabs.delete(tabId)

    if (window) {
      this.sendWindowState(window.id)
    }
    return true
  }

  detachTab(tabId: string) {
    const tab = this.tabs.get(tabId)
    if (!tab) return null
    const oldWindow = this.windows.get(tab.windowId)
    const newWindow = this.createWindow()

    if (oldWindow) {
      oldWindow.tabIds.delete(tabId)
      oldWindow.win.removeBrowserView(tab.view)
      if (oldWindow.activeTabId === tabId) {
        oldWindow.activeTabId = [...oldWindow.tabIds][0] ?? null
      }
    }

    tab.windowId = newWindow.id
    this.attachTabToWindow(tab, newWindow)
    this.setActiveTab(newWindow.id, tab.id)

    if (oldWindow) {
      this.sendWindowState(oldWindow.id)
    }
    this.sendWindowState(newWindow.id)

    return { windowId: newWindow.id, tabId: tab.id }
  }

  openExternal(tabId: string) {
    const tab = this.tabs.get(tabId)
    if (!tab) return false
    const url = tab.view.webContents.getURL()
    if (url) {
      shell.openExternal(url)
      return true
    }
    return false
  }

  copyLink(tabId: string) {
    const tab = this.tabs.get(tabId)
    if (!tab) return false
    const url = tab.view.webContents.getURL()
    if (url) {
      clipboard.writeText(url)
      return true
    }
    return false
  }

  focusTab(tabId: string) {
    const tab = this.tabs.get(tabId)
    if (!tab) return false
    this.setActiveTab(tab.windowId, tab.id)
    return true
  }

  getWindowSnapshot(windowId: number) {
    const window = this.windows.get(windowId)
    if (!window) return null
    const tabs = [...window.tabIds].map((id) => this.toState(this.tabs.get(id)!))
    return {
      windowId: window.id,
      activeTabId: window.activeTabId,
      tabs
    }
  }

  private createWindow() {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      title: 'In-App Browser',
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.config.preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    win.on('closed', () => this.destroyWindow(win.id))
    win.on('resize', () => this.layoutActiveTab(win.id))

    win.loadURL(this.config.shellUrl).catch((error) => {
      console.error('[inapp] failed to load shell UI:', error)
    })

    const entry: InternalWindow = {
      id: win.id,
      win,
      activeTabId: null,
      tabIds: new Set()
    }
    this.windows.set(win.id, entry)

    win.webContents.once('did-finish-load', () => {
      this.sendWindowState(win.id)
    })

    return entry
  }

  private destroyWindow(windowId: number) {
    const window = this.windows.get(windowId)
    if (!window) return

    for (const tabId of window.tabIds) {
      const tab = this.tabs.get(tabId)
      if (tab) {
        tab.view.webContents.removeAllListeners()
        ;(tab.view.webContents as any).destroy?.()
      }
      this.tabs.delete(tabId)
    }
    this.windows.delete(windowId)
  }

  private getOrCreatePrimaryWindow() {
    const existing = [...this.windows.values()][0]
    if (existing) return existing
    return this.createWindow()
  }

  private createTab(url: string, windowId: number) {
    const window = this.windows.get(windowId) ?? this.getOrCreatePrimaryWindow()
    const view = new BrowserView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:intra-links',
        backgroundThrottling: false
      }
    })

    const tab: InternalTab = {
      id: randomUUID(),
      url,
      title: url,
      windowId: window.id,
      canGoBack: false,
      canGoForward: false,
      isLoading: true,
      view
    }

    this.tabs.set(tab.id, tab)
    window.tabIds.add(tab.id)
    this.attachTabToWindow(tab, window)
    this.registerViewEvents(tab)
    return tab
  }

  private attachTabToWindow(tab: InternalTab, window: InternalWindow) {
    window.win.setBrowserView(tab.view)
    this.layoutActiveTab(window.id)
  }

  private layoutActiveTab(windowId: number) {
    const window = this.windows.get(windowId)
    if (!window || !window.activeTabId) return
    const tab = this.tabs.get(window.activeTabId)
    if (!tab) return
    const [width = 0, height = 0] = window.win.getSize()
    tab.view.setBounds({
      x: 0,
      y: this.toolbarHeight,
      width,
      height: Math.max(0, height - this.toolbarHeight)
    })
    tab.view.setAutoResize({ width: true, height: true })
  }

  private loadUrl(tabId: string, url: string) {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.view.webContents.loadURL(url).catch((error) => {
      console.error('[inapp] failed to load url:', url, error)
    })
  }

  private registerViewEvents(tab: InternalTab) {
    const { view } = tab

    view.webContents.setWindowOpenHandler(({ url }) => {
      this.openLink(url, tab.windowId)
      return { action: 'deny' }
    })

    view.webContents.on('will-navigate', (event, targetUrl) => {
      if (!this.isHttpUrl(targetUrl)) {
        event.preventDefault()
        shell.openExternal(targetUrl)
      }
    })

    const updateState = () => {
      const url = view.webContents.getURL()
      const title = view.webContents.getTitle() || url
      const canGoBack = view.webContents.canGoBack()
      const canGoForward = view.webContents.canGoForward()
      const isLoading = view.webContents.isLoading()

      tab.url = url
      tab.title = title
      tab.canGoBack = canGoBack
      tab.canGoForward = canGoForward
      tab.isLoading = isLoading

      this.sendWindowState(tab.windowId)
    }

    view.webContents.on('did-start-loading', updateState)
    view.webContents.on('did-stop-loading', updateState)
    view.webContents.on('did-navigate', updateState)
    view.webContents.on('did-navigate-in-page', updateState)
    view.webContents.on('page-title-updated', updateState)
    view.webContents.on('did-fail-load', updateState)
  }

  private setActiveTab(windowId: number, tabId: string) {
    const window = this.windows.get(windowId)
    if (!window) return
    if (!window.tabIds.has(tabId)) {
      window.tabIds.add(tabId)
    }
    window.activeTabId = tabId
    this.layoutActiveTab(window.id)
    this.sendWindowState(window.id)
  }

  private sendWindowState(windowId: number) {
    const snapshot = this.getWindowSnapshot(windowId)
    if (!snapshot) return
    const window = this.windows.get(windowId)
    window?.win.webContents.send('inapp:window-state', snapshot)
  }

  private toState(tab: InternalTab): InAppTabState {
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      windowId: tab.windowId,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      isLoading: tab.isLoading
    }
  }

  private isHttpUrl(url: string) {
    return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))
  }

  private normalizeUrl(input: string) {
    if (!input) return 'https://example.com/'
    if (this.isHttpUrl(input)) return input
    // 简单兜底：缺少协议时补 https
    return `https://${input}`
  }

  private registerIpcHandlers() {
    ipcMain.handle('inapp:open-link', (_event, payload: { url: string; windowId?: number }) => {
      return this.openLink(payload?.url, payload?.windowId)
    })

    ipcMain.handle('inapp:go-back', (_event, tabId: string) => {
      this.goBack(tabId)
      return true
    })

    ipcMain.handle('inapp:go-forward', (_event, tabId: string) => {
      this.goForward(tabId)
      return true
    })

    ipcMain.handle('inapp:reload', (_event, tabId: string) => {
      this.reload(tabId)
      return true
    })

    ipcMain.handle('inapp:open-external', (_event, tabId: string) => {
      return this.openExternal(tabId)
    })

    ipcMain.handle('inapp:copy-link', (_event, tabId: string) => {
      return this.copyLink(tabId)
    })

    ipcMain.handle('inapp:close-tab', (_event, tabId: string) => {
      return this.closeTab(tabId)
    })

    ipcMain.handle('inapp:detach-tab', (_event, tabId: string) => {
      return this.detachTab(tabId)
    })

    ipcMain.handle('inapp:focus-tab', (_event, tabId: string) => {
      return this.focusTab(tabId)
    })

    ipcMain.handle('inapp:get-window-state', (_event, windowId: number) => {
      return this.getWindowSnapshot(windowId)
    })

    ipcMain.handle('inapp:new-window', () => {
      const win = this.createWindow()
      this.sendWindowState(win.id)
      return { windowId: win.id }
    })
  }
}

/**
 * 工厂方法：使用主进程上下文生成 manager。
 */
export const createInAppBrowserManager = () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const shellPath =
    process.env.VITE_DEV_SERVER_URL && process.env.VITE_DEV_SERVER_URL.startsWith('http')
      ? `${process.env.VITE_DEV_SERVER_URL}inapp-shell.html`
      : path.join(process.env.APP_ROOT ?? path.join(__dirname, '..'), 'dist', 'inapp-shell.html')

  const preloadPath = path.join(__dirname, '..', 'inappPreload.mjs')

  return new InAppBrowserManager({
    shellUrl: shellPath,
    preloadPath
  })
}

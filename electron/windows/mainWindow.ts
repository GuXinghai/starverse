import { BrowserWindow, app, dialog, shell } from 'electron'
import path from 'node:path'
import { CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX } from '../../src/shared/ui/chatWorkspaceLayout'

export type CreateMainWindowInput = Readonly<{
  isDev: boolean
  viteDevServerUrl?: string
  rendererDist: string
  publicPath: string
  preloadPath: string
  onMainProcessMessage?: (window: BrowserWindow) => void
}>

export function createMainWindow(input: CreateMainWindowInput): BrowserWindow | null {
  const win = new BrowserWindow({
    icon: path.join(input.publicPath, 'electron-vite.svg'),
    minWidth: CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX,
    webPreferences: {
      preload: input.preloadPath,
      sandbox: true,
    },
  })

  console.warn(`[main] VITE_DEV_SERVER_URL: ${input.viteDevServerUrl ?? '<missing>'}`)
  if (input.isDev && !input.viteDevServerUrl) {
    const message = 'VITE_DEV_SERVER_URL is missing in dev mode. Refusing to load dist/index.html.'
    console.error(`[main] ${message}`)
    dialog.showErrorBox('Dev startup error', message)
    app.exit(1)
    return null
  }

  if (process.env.SV_DEBUG_RENDERER_CONSOLE === '1') {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const src = typeof sourceId === 'string' && sourceId.length > 0 ? sourceId : 'renderer'
      console.log(`[renderer][console:${level}] ${message} (${src}:${line})`)
    })
  }

  const isExternalHttpUrl = (targetUrl: string) => {
    if (!targetUrl || (typeof targetUrl === 'string' && targetUrl.trim() === '')) {
      return false
    }
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return false
    }
    if (input.viteDevServerUrl && targetUrl.startsWith(input.viteDevServerUrl)) {
      return false
    }
    return true
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isExternalHttpUrl(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  win.webContents.on('did-finish-load', () => {
    console.warn(`[main] webContents.getURL(): ${win.webContents.getURL()}`)
    input.onMainProcessMessage?.(win)
  })

  if (input.isDev) {
    win.loadURL(input.viteDevServerUrl!)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(input.rendererDist, 'index.html'))
  }

  return win
}

import { BrowserWindow, app, dialog, shell } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX } from '../../src/shared/ui/chatWorkspaceLayout'
import { t } from '../i18n/mainI18n'
import { urlOriginForLog } from '../ipc/logSanitizer'

export type CreateMainWindowInput = Readonly<{
  isDev: boolean
  viteDevServerUrl?: string
  rendererDist: string
  publicPath: string
  preloadPath: string
  onMainProcessMessage?: (window: BrowserWindow) => void
}>

export type MainWindowNavigationPolicy = Readonly<{
  isTrustedAppUrl: (targetUrl: string) => boolean
  externalHttpUrl: (targetUrl: string) => string | null
}>

export function createMainWindowNavigationPolicy(
  input: Pick<CreateMainWindowInput, 'isDev' | 'viteDevServerUrl' | 'rendererDist'>,
): MainWindowNavigationPolicy {
  const trustedDevOrigin = (() => {
    if (!input.isDev || !input.viteDevServerUrl) return null
    try {
      const parsed = new URL(input.viteDevServerUrl)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
    } catch {
      return null
    }
  })()
  const trustedPackagedPath = input.isDev
    ? null
    : new URL(pathToFileURL(path.join(input.rendererDist, 'index.html')).href).pathname

  const isTrustedAppUrl = (targetUrl: string) => {
    try {
      const parsed = new URL(targetUrl)
      if (parsed.username || parsed.password) return false
      if (trustedDevOrigin) return parsed.origin === trustedDevOrigin
      return parsed.protocol === 'file:' && parsed.host === '' && parsed.pathname === trustedPackagedPath
    } catch {
      return false
    }
  }

  const externalHttpUrl = (targetUrl: string) => {
    try {
      const parsed = new URL(targetUrl)
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || isTrustedAppUrl(targetUrl)) return null
      return parsed.toString()
    } catch {
      return null
    }
  }

  return Object.freeze({ isTrustedAppUrl, externalHttpUrl })
}

export function createMainWindow(input: CreateMainWindowInput): BrowserWindow | null {
  const win = new BrowserWindow({
    icon: path.join(input.publicPath, 'electron-vite.svg'),
    minWidth: CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX,
    webPreferences: {
      preload: input.preloadPath,
      sandbox: true,
    },
  })

  console.warn('[main] MAIN_WINDOW_DEV_SERVER_CONFIGURATION', { configured: Boolean(input.viteDevServerUrl) })
  if (input.isDev && !input.viteDevServerUrl) {
    const message = t('dialogs.startup.viteDevServerMissing')
    console.error(`[main] ${message}`)
    dialog.showErrorBox(t('dialogs.startup.devStartupError'), message)
    app.exit(1)
    return null
  }

  if (process.env.SV_DEBUG_RENDERER_CONSOLE === '1') {
    win.webContents.on('console-message', (details) => {
      console.log('[renderer] RENDERER_CONSOLE_EVENT', {
        level: details.level,
        hasSource: details.sourceId.length > 0,
        lineNumber: Number.isSafeInteger(details.lineNumber) ? details.lineNumber : null,
      })
    })
  }

  const navigationPolicy = createMainWindowNavigationPolicy(input)

  win.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = navigationPolicy.externalHttpUrl(url)
    if (externalUrl) shell.openExternal(externalUrl)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (navigationPolicy.isTrustedAppUrl(url)) return
    event.preventDefault()
    const externalUrl = navigationPolicy.externalHttpUrl(url)
    if (externalUrl) {
      shell.openExternal(externalUrl)
    }
  })

  win.webContents.on('did-finish-load', () => {
    console.warn('[main] MAIN_WINDOW_DID_FINISH_LOAD', { target: urlOriginForLog(win.webContents.getURL()) })
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

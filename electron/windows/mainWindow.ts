import { BrowserWindow, app, dialog, shell } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX } from '../../src/shared/ui/chatWorkspaceLayout'
import { t } from '../i18n/mainI18n'
import { urlOriginForLog } from '../ipc/logSanitizer'
import {
  classifyDidFailLoad,
  classifyRenderProcessGone,
  createRendererRecovery,
  type RecoveryChoiceId,
} from './rendererRecovery'

export type CreateMainWindowInput = Readonly<{
  agentBackground?: boolean
  agentControlled?: boolean
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

function attachRendererRecovery(win: BrowserWindow, agentControlled = false): void {
  const recovery = createRendererRecovery({
    log: (event, details) => console.error(`[main] ${event}`, details),
    reloadRenderer: () => {
      if (!win.isDestroyed()) win.webContents.reload()
    },
    restartApp: () => {
      app.relaunch()
      app.quit()
    },
    closeApp: () => app.quit(),
    promptUser: async ({ failure, reloadAllowed }) => {
      if (win.isDestroyed()) return null
      if (agentControlled) return 'close'
      const ids: RecoveryChoiceId[] = reloadAllowed ? ['reload', 'restart', 'close'] : ['restart', 'close']
      const message = t(
        failure.kind === 'renderer-crashed'
          ? 'dialogs.rendererRecovery.crashed'
          : 'dialogs.rendererRecovery.loadFailed',
      )
      const result = await dialog.showMessageBox(win, {
        type: 'error',
        title: t('dialogs.rendererRecovery.title'),
        message,
        detail: reloadAllowed ? undefined : t('dialogs.rendererRecovery.loopWarning'),
        buttons: ids.map((id) => t(`dialogs.rendererRecovery.${id}`)),
        defaultId: 0,
        cancelId: ids.indexOf('close'),
        noLink: true,
      })
      return ids[result.response] ?? null
    },
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    const failure = classifyRenderProcessGone(details)
    if (failure) void recovery.handleFailure(failure)
  })
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    const failure = classifyDidFailLoad({
      errorCode,
      errorDescription,
      isMainFrame,
      target: urlOriginForLog(validatedURL),
    })
    if (failure) void recovery.handleFailure(failure)
  })
}

export function createMainWindow(input: CreateMainWindowInput): BrowserWindow | null {
  const win = new BrowserWindow({
    ...(input.agentControlled ? { show: !input.agentBackground, width: 1440, height: 900 } : {}),
    icon: path.join(input.publicPath, 'electron-vite.svg'),
    minWidth: CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX,
    webPreferences: {
      preload: input.preloadPath,
      sandbox: true,
      ...(input.agentControlled ? { backgroundThrottling: false } : {}),
      ...(input.agentBackground ? { offscreen: true } : {}),
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
    if (externalUrl && !input.agentControlled) shell.openExternal(externalUrl)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (navigationPolicy.isTrustedAppUrl(url)) return
    event.preventDefault()
    const externalUrl = navigationPolicy.externalHttpUrl(url)
    if (externalUrl && !input.agentControlled) {
      shell.openExternal(externalUrl)
    }
  })

  win.webContents.on('did-finish-load', () => {
    console.warn('[main] MAIN_WINDOW_DID_FINISH_LOAD', { target: urlOriginForLog(win.webContents.getURL()) })
    input.onMainProcessMessage?.(win)
  })

  attachRendererRecovery(win, input.agentControlled)

  if (input.isDev) {
    win.loadURL(input.viteDevServerUrl!)
    if (!input.agentControlled) win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(input.rendererDist, 'index.html'))
  }

  return win
}

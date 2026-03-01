import type { InAppBrowserManager } from '../services/inappBrowser'
import type { RegisterInvoke } from './types'

export const INAPP_BROWSER_IPC_CHANNELS = [
  'inapp:open-link',
  'inapp:go-back',
  'inapp:go-forward',
  'inapp:reload',
  'inapp:open-external',
  'inapp:copy-link',
  'inapp:close-tab',
  'inapp:detach-tab',
  'inapp:focus-tab',
  'inapp:get-window-state',
  'inapp:new-window',
] as const

type RegisterInAppBrowserIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  manager: InAppBrowserManager
}>

export function registerInAppBrowserIpc(input: RegisterInAppBrowserIpcInput): string[] {
  const { registerInvoke, manager } = input

  registerInvoke('inapp:open-link', (_event: unknown, payload: unknown) => {
    const normalizedPayload = (payload ?? {}) as { url?: unknown; windowId?: unknown }
    return manager.openLink(
      String(normalizedPayload.url ?? ''),
      typeof normalizedPayload.windowId === 'number' ? normalizedPayload.windowId : undefined
    )
  })

  registerInvoke('inapp:go-back', (_event: unknown, tabId: unknown) => {
    manager.goBack(String(tabId ?? ''))
    return true
  })

  registerInvoke('inapp:go-forward', (_event: unknown, tabId: unknown) => {
    manager.goForward(String(tabId ?? ''))
    return true
  })

  registerInvoke('inapp:reload', (_event: unknown, tabId: unknown) => {
    manager.reload(String(tabId ?? ''))
    return true
  })

  registerInvoke('inapp:open-external', (_event: unknown, tabId: unknown) => {
    return manager.openExternal(String(tabId ?? ''))
  })

  registerInvoke('inapp:copy-link', (_event: unknown, tabId: unknown) => {
    return manager.copyLink(String(tabId ?? ''))
  })

  registerInvoke('inapp:close-tab', (_event: unknown, tabId: unknown) => {
    return manager.closeTab(String(tabId ?? ''))
  })

  registerInvoke('inapp:detach-tab', (_event: unknown, tabId: unknown) => {
    return manager.detachTab(String(tabId ?? ''))
  })

  registerInvoke('inapp:focus-tab', (_event: unknown, tabId: unknown) => {
    return manager.focusTab(String(tabId ?? ''))
  })

  registerInvoke('inapp:get-window-state', (_event: unknown, windowId: unknown) => {
    return manager.getWindowSnapshot(Number(windowId))
  })

  registerInvoke('inapp:new-window', () => {
    return manager.newWindow()
  })

  return [...INAPP_BROWSER_IPC_CHANNELS]
}

import { contextBridge, ipcRenderer } from 'electron'

type WindowStatePayload = {
  windowId: number
  activeTabId: string | null
  tabs: Array<{
    id: string
    url: string
    title: string
    windowId: number
    canGoBack: boolean
    canGoForward: boolean
    isLoading: boolean
  }>
}

const api = {
  openLink: (url: string, windowId?: number) => ipcRenderer.invoke('inapp:open-link', { url, windowId }),
  goBack: (tabId: string) => ipcRenderer.invoke('inapp:go-back', tabId),
  goForward: (tabId: string) => ipcRenderer.invoke('inapp:go-forward', tabId),
  reload: (tabId: string) => ipcRenderer.invoke('inapp:reload', tabId),
  openExternal: (tabId: string) => ipcRenderer.invoke('inapp:open-external', tabId),
  copyLink: (tabId: string) => ipcRenderer.invoke('inapp:copy-link', tabId),
  closeTab: (tabId: string) => ipcRenderer.invoke('inapp:close-tab', tabId),
  detachTab: (tabId: string) => ipcRenderer.invoke('inapp:detach-tab', tabId),
  focusTab: (tabId: string) => ipcRenderer.invoke('inapp:focus-tab', tabId),
  newWindow: () => ipcRenderer.invoke('inapp:new-window'),
  getWindowState: (windowId: number) => ipcRenderer.invoke('inapp:get-window-state', windowId),
  onWindowState: (callback: (payload: WindowStatePayload) => void) => {
    const listener = (_event: unknown, payload: WindowStatePayload) => callback(payload)
    ipcRenderer.on('inapp:window-state', listener)
    return () => ipcRenderer.off('inapp:window-state', listener)
  }
}

contextBridge.exposeInMainWorld('inapp', api)

import { vi } from 'vitest'

/** Install deterministic preload-shaped Electron globals for a test runtime. */
export function installElectronBridgeMocks(target: any = globalThis) {
  const electronStore = {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => true),
    delete: vi.fn(async () => true),
  }
  const electronAPI = {
    selectImage: vi.fn(async () => null),
    selectFile: vi.fn(async () => null),
    openExternal: vi.fn(async () => ({ success: true })),
    openInAppLink: vi.fn(async () => ({ tabId: undefined, windowId: undefined })),
  }
  const ipcRenderer = {
    on: vi.fn(),
    off: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn(async () => undefined),
  }
  target.electronStore = electronStore
  target.electronAPI = electronAPI
  target.ipcRenderer = ipcRenderer
  target.electron = { store: electronStore, api: electronAPI, ipc: ipcRenderer }

  return { electronStore, electronAPI, ipcRenderer }
}

export const installElectronBridgeMock = installElectronBridgeMocks

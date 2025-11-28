type ElectronStoreBridge = {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<boolean>
  delete: (key: string) => Promise<boolean>
}

type FilePickerOptions = {
  filters?: Array<{ name: string; extensions: string[] }>
  defaultMimeType?: string
}

type SelectedFileResult = {
  dataUrl: string
  filename: string
  size: number
  mimeType?: string
}

type IpcRendererBridge = {
  on: (...args: any[]) => void
  off: (...args: any[]) => void
  send: (...args: any[]) => void
  invoke: (...args: any[]) => Promise<any>
} | undefined

type ElectronApiBridge = {
  selectImage: () => Promise<string | null>
  selectFile?: (options?: FilePickerOptions) => Promise<SelectedFileResult | null>
  openImage?: (imageUrl: string) => Promise<{
    success: boolean
    path?: string
    url?: string
    error?: string
  }>
  openExternal?: (url: string) => Promise<{ success: boolean; error?: string }>
}

type DbInvokeBridge = {
  invoke: <T = unknown>(method: string, params?: unknown) => Promise<T>
}

const createMemoryStore = (): ElectronStoreBridge => {
  const memory = new Map<string, any>()

  return {
    async get(key: string) {
      return memory.get(key)
    },
    async set(key: string, value: any) {
      memory.set(key, value)
      return true
    },
    async delete(key: string) {
      memory.delete(key)
      return true
    }
  }
}

type StoreResolution = {
  store: ElectronStoreBridge
  isFallback: boolean
}

const resolveElectronStore = (): StoreResolution => {
  if (typeof window !== 'undefined' && window.electronStore) {
    return { store: window.electronStore, isFallback: false }
  }

  if (typeof window !== 'undefined') {
    console.warn('[electronBridge] electronStore bridge missing; using in-memory fallback (non-persistent).')
  }

  return { store: createMemoryStore(), isFallback: true }
}

const { store: electronStore, isFallback: isUsingElectronStoreFallback } = resolveElectronStore()

const ipcRendererBridge: IpcRendererBridge =
  typeof window !== 'undefined' && window.ipcRenderer ? window.ipcRenderer : undefined

const resolveElectronApi = (): { api: ElectronApiBridge; isFallback: boolean } => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return { api: window.electronAPI, isFallback: false }
  }

  if (typeof window !== 'undefined') {
    console.warn('[electronBridge] electronAPI bridge missing; file and image selection disabled in this environment.')
  }

  return {
    api: {
      async selectImage() {
        console.warn('[electronBridge] selectImage called without electron bridge; returning null.')
        return null
      },
      async selectFile() {
        console.warn('[electronBridge] selectFile called without electron bridge; returning null.')
        return null
      },
      async openExternal(url: string) {
        console.warn('[electronBridge] openExternal called without electron bridge; using window.open fallback.')
        window.open?.(url, '_blank', 'noopener')
        return { success: false, error: 'electron bridge unavailable' }
      }
    },
    isFallback: true
  }
}

const { api: electronApiBridge, isFallback: isUsingElectronApiFallback } = resolveElectronApi()

const createDbFallback = (): DbInvokeBridge => ({
  async invoke() {
    throw new Error('[electronBridge] dbBridge is unavailable. Ensure Electron preload exposed dbBridge.')
  }
})

const resolveDbBridge = (): { bridge: DbInvokeBridge; isFallback: boolean } => {
  if (typeof window !== 'undefined' && window.dbBridge) {
    return { bridge: window.dbBridge, isFallback: false }
  }

  if (typeof window !== 'undefined') {
    console.warn('[electronBridge] dbBridge missing; DB access disabled in this environment.')
  }

  return { bridge: createDbFallback(), isFallback: true }
}

const { bridge: dbBridge, isFallback: isUsingDbBridgeFallback } = resolveDbBridge()

export {
  electronStore,
  electronApiBridge,
  ipcRendererBridge,
  dbBridge,
  isUsingElectronApiFallback,
  isUsingElectronStoreFallback,
  isUsingDbBridgeFallback
}

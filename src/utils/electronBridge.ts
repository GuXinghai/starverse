type ElectronStoreBridge = {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<boolean>
  delete: (key: string) => Promise<boolean>
}

type IpcRendererBridge = {
  on: (...args: any[]) => void
  off: (...args: any[]) => void
  send: (...args: any[]) => void
  invoke: (...args: any[]) => Promise<any>
} | undefined

type ElectronApiBridge = {
  selectImage: () => Promise<string | null>
  openImage?: (imageUrl: string) => Promise<{
    success: boolean
    path?: string
    url?: string
    error?: string
  }>
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
    console.warn('[electronBridge] electronAPI bridge missing; image selection disabled in this environment.')
  }

  return {
    api: {
      async selectImage() {
        console.warn('[electronBridge] selectImage called without electron bridge; returning null.')
        return null
      }
    },
    isFallback: true
  }
}

const { api: electronApiBridge, isFallback: isUsingElectronApiFallback } = resolveElectronApi()

export {
  electronStore,
  electronApiBridge,
  ipcRendererBridge,
  isUsingElectronApiFallback,
  isUsingElectronStoreFallback
}

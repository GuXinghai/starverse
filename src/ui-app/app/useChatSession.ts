export type IpcRendererLike = Readonly<{
  on: (channel: string, listener: (...args: any[]) => void) => any
}>

export function useChatSession() {
  function hasDbBridge(): boolean {
    const bridge = (globalThis as any).dbBridge as { invoke?: unknown } | undefined
    return !!(bridge && typeof bridge.invoke === 'function')
  }

  function getIpcRenderer(): IpcRendererLike | null {
    const ipc = (globalThis as any).ipcRenderer as IpcRendererLike | undefined
    return ipc && typeof ipc.on === 'function' ? ipc : null
  }

  async function getOpenRouterApiKey(): Promise<string | null> {
    const store = (globalThis as any).electronStore as { get?: (key: string) => Promise<any> } | undefined
    if (store?.get) {
      const key = String((await store.get('openRouterApiKey')) ?? '').trim()
      if (key) return key
    }
    return null
  }

  async function getOpenRouterBaseUrl(): Promise<string | null> {
    const store = (globalThis as any).electronStore as { get?: (key: string) => Promise<any> } | undefined
    if (store?.get) {
      const url = String((await store.get('openRouterBaseUrl')) ?? '').trim()
      if (url) return url
    }
    return null
  }

  function randomId(prefix: string): string {
    const cryptoObj = (globalThis as any).crypto as { randomUUID?: () => string } | undefined
    if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }

  return {
    hasDbBridge,
    getIpcRenderer,
    getOpenRouterApiKey,
    getOpenRouterBaseUrl,
    randomId,
  }
}

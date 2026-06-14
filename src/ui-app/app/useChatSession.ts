export type IpcRendererLike = Readonly<{
  on: (channel: string, listener: (...args: any[]) => void) => any
}>

export function useChatSession() {
  function hasDbBridge(): boolean {
    const bridge = (globalThis as any).dbBridge as { invoke?: unknown } | undefined
    return !!(bridge && typeof bridge.invoke === 'function')
  }

  function getIpcRenderer(): IpcRendererLike | null {
    const api = (globalThis as any).electronAPI as { onModelCatalogSynced?: (callback: () => void) => () => void } | undefined
    if (!api || typeof api.onModelCatalogSynced !== 'function') return null
    const onModelCatalogSynced = api.onModelCatalogSynced
    return {
      on(channel: string, listener: (...args: any[]) => void) {
        if (channel !== 'db:modelCatalogSynced') return null
        return onModelCatalogSynced(() => listener())
      },
    }
  }

  async function getOpenRouterBaseUrl(): Promise<string | null> {
    const bridge = (globalThis as any).openRouterCredential as
      | { getStatus?: () => Promise<{ ok?: boolean; status?: { displayBaseUrl?: unknown } }> }
      | undefined
    if (typeof bridge?.getStatus === 'function') {
      const result = await bridge.getStatus()
      if (result?.ok && result.status) {
        const url = String(result.status.displayBaseUrl ?? '').trim()
        if (url) return url
      }
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
    getOpenRouterBaseUrl,
    randomId,
  }
}

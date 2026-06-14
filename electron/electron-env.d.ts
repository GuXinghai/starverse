/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  openRouterCredential?: {
    getStatus?: () => Promise<unknown>
    update?: (payload: unknown) => Promise<unknown>
    clear?: () => Promise<unknown>
  }
  electronAPI?: {
    getNetExpRuntimeInfo?: () => Promise<unknown>
    onModelCatalogSynced?: (callback: () => void) => () => void
    modelCatalogSyncNow?: (options?: { providerKey?: string; force?: boolean; reason?: string }) => Promise<unknown>
    modelCatalogGetSyncStatus?: (options?: { providerKey?: string }) => Promise<unknown>
    modelCatalogQueryScopedCurrent?: (options?: unknown) => Promise<unknown>
    modelCatalogRepairCurrentScopedCache?: () => Promise<unknown>
    modelCatalogClearCurrentScopedCache?: () => Promise<unknown>
    modelCatalogClearAllOpenRouterScopedCaches?: () => Promise<unknown>
    startOpenRouterStream?: (payload: unknown) => Promise<unknown>
    abortOpenRouterStream?: (requestId: string) => Promise<unknown>
    onOpenRouterChunk?: (requestId: string, callback: (payload: unknown) => void) => () => void
    onOpenRouterEnd?: (requestId: string, callback: () => void) => () => void
  }
}

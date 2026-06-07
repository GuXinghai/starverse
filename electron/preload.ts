import { ipcRenderer, contextBridge } from 'electron'

// Expose electron-store API
contextBridge.exposeInMainWorld('electronStore', {
  get: (key: string) => ipcRenderer.invoke('store-get', key),
  set: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
  delete: (key: string) => ipcRenderer.invoke('store-delete', key),
  clearSafe: (keepKeys?: string[]) => ipcRenderer.invoke('store-clear-safe', keepKeys),
  checkIntegrity: () => ipcRenderer.invoke('store-check-integrity'),
})

// Expose file dialog API for image selection
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 选择图片文件并返回 base64 data URI
   * @returns {Promise<string | null>} base64 data URI 或 null（如果用户取消）
   */
  selectImage: () => ipcRenderer.invoke('dialog:select-image'),
  selectFile: (options?: { filters?: Array<{ name: string; extensions: string[] }>; defaultMimeType?: string }) =>
    ipcRenderer.invoke('dialog:select-file', options),
  selectLocalFiles: (options?: { context?: 'file' | 'image'; allowMultiple?: boolean }) =>
    ipcRenderer.invoke('dialog:select-local-files', options),

  /**
   * 使用系统默认应用打开图片
   * 支持 data URI (base64)、HTTP(S) URL 和本地文件路径
   * @param imageUrl - 图片的 URL 或 data URI
   * @returns {Promise<{success: boolean, path?: string, url?: string, error?: string}>}
   */
  openImage: (imageUrl: string) => ipcRenderer.invoke('shell:open-image', imageUrl),
  copyImageToClipboard: (imageUrl: string) =>
    ipcRenderer.invoke('clipboard:write-image', { imageUrl }),
  resolveImagePath: (imageUrl: string) =>
    ipcRenderer.invoke('shell:resolve-image-path', { imageUrl }),
  exportImage: (imageUrl: string, options?: { suggestedName?: string }) =>
    ipcRenderer.invoke('dialog:export-image', { imageUrl, ...(options ?? {}) }),

  /**
   * 在新的 BrowserWindow 中打开外部链接（类似微信/QQ 内的外链弹窗）
   */
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  /**
   * 打开应用内链（In-App WebView，默认复用同一窗口）
   */
  openInAppLink: (url: string, windowId?: number) => ipcRenderer.invoke('inapp:open-link', { url, windowId }),

  /**
   * 获取网络实验运行时信息（开关注入/版本/argv）
   */
  getNetExpRuntimeInfo: () => ipcRenderer.invoke('netexp:get-runtime-info'),
  onModelCatalogSynced: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('db:modelCatalogSynced', handler)
    return () => {
      ipcRenderer.removeListener('db:modelCatalogSynced', handler)
    }
  },
  modelCatalogSyncNow: (options?: { providerKey?: string; force?: boolean; reason?: string }) =>
    ipcRenderer.invoke('modelCatalog.syncNow', options),
  modelCatalogGetSyncStatus: (options?: { providerKey?: string }) =>
    ipcRenderer.invoke('modelCatalog.getSyncStatus', options),
  modelCatalogQueryScopedCurrent: (options?: unknown) =>
    ipcRenderer.invoke('modelCatalog.queryScopedCurrent', options),
  startOpenRouterStream: (payload: unknown) => ipcRenderer.invoke('openrouter:stream-chat', payload),
  abortOpenRouterStream: (requestId: string) => ipcRenderer.invoke('openrouter:abort', requestId),
  onOpenRouterChunk: (requestId: string, callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(`openrouter:chunk:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`openrouter:chunk:${requestId}`, handler)
    }
  },
  onOpenRouterEnd: (requestId: string, callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(`openrouter:end:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`openrouter:end:${requestId}`, handler)
    }
  },
})

// Expose DB bridge for renderer storage access
contextBridge.exposeInMainWorld('dbBridge', {
  invoke: (method: string, params?: unknown) => ipcRenderer.invoke('db:invoke', { method, params }),
  /**
   * 订阅数据库事件（从 Worker 线程转发）
   * @param callback 事件回调函数
   * @returns 取消订阅函数
   */
  onEvent: (callback: (event: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, dbEvent: unknown) => {
      callback(dbEvent)
    }
    ipcRenderer.on('db:event', handler)
    // 返回取消订阅函数
    return () => {
      ipcRenderer.removeListener('db:event', handler)
    }
  },
})

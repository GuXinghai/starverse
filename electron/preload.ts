import { ipcRenderer, contextBridge } from 'electron'

// Expose electron-store API
contextBridge.exposeInMainWorld('electronStore', {
  get: (key: string) => ipcRenderer.invoke('store-get', key),
  set: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
  delete: (key: string) => ipcRenderer.invoke('store-delete', key),
  clearSafe: (keepKeys?: string[]) => ipcRenderer.invoke('store-clear-safe', keepKeys),
  checkIntegrity: () => ipcRenderer.invoke('store-check-integrity'),
})

contextBridge.exposeInMainWorld('openRouterCredential', {
  getStatus: () => ipcRenderer.invoke('openrouter-credential:get-status'),
  update: (payload: unknown) => ipcRenderer.invoke('openrouter-credential:update', payload),
  clear: () => ipcRenderer.invoke('openrouter-credential:clear'),
})

contextBridge.exposeInMainWorld('openAIResponsesCredential', {
  getStatus: () => ipcRenderer.invoke('openai-responses-credential:get-status'),
  update: (payload: unknown) => ipcRenderer.invoke('openai-responses-credential:update', payload),
  clear: () => ipcRenderer.invoke('openai-responses-credential:clear'),
})

contextBridge.exposeInMainWorld('googleAIStudioCredential', {
  getStatus: () => ipcRenderer.invoke('google-ai-studio-credential:get-status'),
  update: (payload: unknown) => ipcRenderer.invoke('google-ai-studio-credential:update', payload),
  clear: () => ipcRenderer.invoke('google-ai-studio-credential:clear'),
})

contextBridge.exposeInMainWorld('anthropicCredential', {
  getStatus: () => ipcRenderer.invoke('anthropic-credential:get-status'),
  update: (payload: unknown) => ipcRenderer.invoke('anthropic-credential:update', payload),
  clear: () => ipcRenderer.invoke('anthropic-credential:clear'),
})

contextBridge.exposeInMainWorld('deepSeekCredential', {
  getStatus: () => ipcRenderer.invoke('deepseek-credential:get-status'),
  update: (payload: unknown) => ipcRenderer.invoke('deepseek-credential:update', payload),
  clear: () => ipcRenderer.invoke('deepseek-credential:clear'),
})

contextBridge.exposeInMainWorld('localEndpointDiagnostics', {
  probe: (payload: unknown) => ipcRenderer.invoke('local-endpoint-diagnostics:probe', payload),
  streamProbe: (payload: unknown) => ipcRenderer.invoke('local-endpoint-diagnostics:stream-probe', payload),
})

contextBridge.exposeInMainWorld('localEndpointChat', {
  startTextChat: (payload: unknown) => ipcRenderer.invoke('local-endpoint-chat:stream-text', payload),
  abortTextChat: (requestId: string) => ipcRenderer.invoke('local-endpoint-chat:abort', requestId),
  onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(`local-endpoint-chat:chunk:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`local-endpoint-chat:chunk:${requestId}`, handler)
    }
  },
  onTextChatEnd: (requestId: string, callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(`local-endpoint-chat:end:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`local-endpoint-chat:end:${requestId}`, handler)
    }
  },
})

contextBridge.exposeInMainWorld('openAIResponsesChat', {
  startTextChat: (payload: unknown) => ipcRenderer.invoke('openai-responses-chat:stream-text', payload),
  abortTextChat: (requestId: string) => ipcRenderer.invoke('openai-responses-chat:abort', requestId),
  onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(`openai-responses-chat:chunk:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`openai-responses-chat:chunk:${requestId}`, handler)
    }
  },
  onTextChatEnd: (requestId: string, callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(`openai-responses-chat:end:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`openai-responses-chat:end:${requestId}`, handler)
    }
  },
})

contextBridge.exposeInMainWorld('googleAIStudioChat', {
  startTextChat: (payload: unknown) => ipcRenderer.invoke('google-ai-studio-chat:stream-text', payload),
  abortTextChat: (requestId: string) => ipcRenderer.invoke('google-ai-studio-chat:abort', requestId),
  onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(`google-ai-studio-chat:chunk:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`google-ai-studio-chat:chunk:${requestId}`, handler)
    }
  },
  onTextChatEnd: (requestId: string, callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(`google-ai-studio-chat:end:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`google-ai-studio-chat:end:${requestId}`, handler)
    }
  },
})

contextBridge.exposeInMainWorld('anthropicChat', {
  startTextChat: (payload: unknown) => ipcRenderer.invoke('anthropic-chat:stream-text', payload),
  abortTextChat: (requestId: string) => ipcRenderer.invoke('anthropic-chat:abort', requestId),
  onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(`anthropic-chat:chunk:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`anthropic-chat:chunk:${requestId}`, handler)
    }
  },
  onTextChatEnd: (requestId: string, callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(`anthropic-chat:end:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`anthropic-chat:end:${requestId}`, handler)
    }
  },
})

contextBridge.exposeInMainWorld('deepSeekChat', {
  startTextChat: (payload: unknown) => ipcRenderer.invoke('deepseek-chat:stream-text', payload),
  abortTextChat: (requestId: string) => ipcRenderer.invoke('deepseek-chat:abort', requestId),
  onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(`deepseek-chat:chunk:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`deepseek-chat:chunk:${requestId}`, handler)
    }
  },
  onTextChatEnd: (requestId: string, callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(`deepseek-chat:end:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`deepseek-chat:end:${requestId}`, handler)
    }
  },
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
  importLibreOfficeSvpkg: () => ipcRenderer.invoke('dialog:import-libreoffice-svpkg'),
  quarantineLibreOfficeRuntime: () => ipcRenderer.invoke('dialog:quarantine-libreoffice-runtime'),

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
  probeLibreOfficeSystemProxyDownloadNetwork: () =>
    ipcRenderer.invoke('network-proxy:probe-libreoffice-system'),
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
  modelCatalogRepairCurrentScopedCache: () =>
    ipcRenderer.invoke('modelCatalog.repairCurrentScopedCache'),
  modelCatalogClearCurrentScopedCache: () =>
    ipcRenderer.invoke('modelCatalog.clearCurrentScopedCache'),
  modelCatalogClearAllOpenRouterScopedCaches: () =>
    ipcRenderer.invoke('modelCatalog.clearAllOpenRouterScopedCaches'),
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

import { ipcRenderer, contextBridge } from 'electron'

// Expose electron-store API
contextBridge.exposeInMainWorld('electronStore', {
  get: (key: string) => ipcRenderer.invoke('store-get', key),
  set: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
  delete: (key: string) => ipcRenderer.invoke('store-delete', key),
  clearSafe: (keepKeys?: string[]) => ipcRenderer.invoke('store-clear-safe', keepKeys),
  checkIntegrity: () => ipcRenderer.invoke('store-check-integrity'),
})

contextBridge.exposeInMainWorld('compatibleProviderRegistry', {
  list: () => ipcRenderer.invoke('compatible-provider:list'),
  get: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId }>) => ipcRenderer.invoke('compatible-provider:get', payload),
  create: (payload: Readonly<{
    displayName: string
    endpoint: CompatibleRegistryEndpointInput
    credential: CompatibleRegistryCredentialInput
    requestMappings?: readonly CompatibleRegistryRequestMappingInput[]
  }>) => ipcRenderer.invoke('compatible-provider:create', payload),
  update: (payload: Readonly<{
    providerInstanceId: CompatibleProviderInstanceId
    displayName?: string
    status?: 'active' | 'disabled'
  }>) => ipcRenderer.invoke('compatible-provider:update', payload),
  updateEndpoint: (payload: Readonly<{
    providerInstanceId: CompatibleProviderInstanceId
    endpoint: CompatibleRegistryEndpointInput
    clearAuthentication?: boolean
  }>) => ipcRenderer.invoke('compatible-provider:update-endpoint', payload),
  reviseConfiguration: (payload: Readonly<{
    providerInstanceId: CompatibleProviderInstanceId
    requestProfile: unknown
    requestMappings: readonly CompatibleRegistryRequestMappingInput[]
    reasoningMapping: unknown
    inlinePolicy: unknown
    acceptedDiscoveryPaths?: readonly string[]
  }>) => ipcRenderer.invoke('compatible-provider:revise-configuration', payload),
  listDiscovery: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId }>) => ipcRenderer.invoke('compatible-provider:list-discovery', payload),
  ignoreDiscovery: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId; streamPath: string }>) => ipcRenderer.invoke('compatible-provider:ignore-discovery', payload),
  rotateCredential: (payload: Readonly<{
    providerInstanceId: CompatibleProviderInstanceId
    credential: Exclude<CompatibleRegistryCredentialInput, Readonly<{ mode: 'none' }>>
  }>) => ipcRenderer.invoke('compatible-provider:rotate-credential', payload),
  deleteCredential: (payload: Readonly<{ credentialVersionRef: CompatibleCredentialVersionRef }>) => ipcRenderer.invoke('compatible-provider:delete-credential', payload),
  deleteProvider: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId }>) => ipcRenderer.invoke('compatible-provider:delete', payload),
})

contextBridge.exposeInMainWorld('compatibleProviderTransport', {
  testConnection: (payload: Readonly<{
    providerInstanceId: CompatibleProviderInstanceId
    requestId: string
  }>) => ipcRenderer.invoke('compatible-provider:test-connection', payload),
  abortConnectionTest: (payload: Readonly<{ requestId: string }>) => ipcRenderer.invoke('compatible-provider:abort-connection-test', payload),
})

contextBridge.exposeInMainWorld('compatibleChat', {
  preflight: (payload: unknown) => ipcRenderer.invoke('compatible-chat:preflight', payload),
  start: (payload: unknown) => ipcRenderer.invoke('compatible-chat:start', payload),
  abort: (payload: Readonly<{ requestId: string }>) => ipcRenderer.invoke('compatible-chat:abort', payload),
  resolveHistorical: (payload: unknown) => ipcRenderer.invoke('compatible-chat:resolve-historical', payload),
  onEvent: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on('compatible-chat:event', wrapped)
    return () => ipcRenderer.removeListener('compatible-chat:event', wrapped)
  },
  onPrepared: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on('compatible-chat:prepared', wrapped)
    return () => ipcRenderer.removeListener('compatible-chat:prepared', wrapped)
  },
  onEnd: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on('compatible-chat:end', wrapped)
    return () => ipcRenderer.removeListener('compatible-chat:end', wrapped)
  },
})

contextBridge.exposeInMainWorld('rawGenerationDebug', {
  getStatus: () => ipcRenderer.invoke('raw-generation:get-status'),
  listByAnswerRootId: (answerRootId: string) => ipcRenderer.invoke('raw-generation:list-by-answer', { answerRootId }),
})

contextBridge.exposeInMainWorld('compatibleMaintenance', {
  previewReset: () => ipcRenderer.invoke('compatible-reset:preview', {}),
  applyReset: (confirmation: string) => ipcRenderer.invoke('compatible-reset:apply', { confirmation }),
})

contextBridge.exposeInMainWorld('compatibleCatalog', {
  sync: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId; requestId: string; force?: boolean }>) => ipcRenderer.invoke('compatible-catalog:sync', payload),
  abortSync: (payload: Readonly<{ requestId: string }>) => ipcRenderer.invoke('compatible-catalog:abort-sync', payload),
  query: (payload: Readonly<{
    providerInstanceId: CompatibleProviderInstanceId
    search?: string
    includeStale?: boolean
    offset?: number
    limit?: number
  }>) => ipcRenderer.invoke('compatible-catalog:query', payload),
  getStatus: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId }>) => ipcRenderer.invoke('compatible-catalog:get-status', payload),
  upsertManual: (payload: Readonly<{
    providerInstanceId: CompatibleProviderInstanceId
    modelId: string
    metadata: CompatibleCatalogManualMetadataInput
  }>) => ipcRenderer.invoke('compatible-catalog:upsert-manual', payload),
  deleteManual: (payload: Readonly<{ providerInstanceId: CompatibleProviderInstanceId; modelId: string }>) => ipcRenderer.invoke('compatible-catalog:delete-manual', payload),
})

contextBridge.exposeInMainWorld('openRouterCredential', {
  getStatus: () => ipcRenderer.invoke('openrouter-credential:get-status'),
  reveal: () => ipcRenderer.invoke('openrouter-credential:reveal'),
  update: (payload: unknown) => ipcRenderer.invoke('openrouter-credential:update', payload),
  clear: () => ipcRenderer.invoke('openrouter-credential:clear'),
})

contextBridge.exposeInMainWorld('openAIResponsesCredential', {
  getStatus: () => ipcRenderer.invoke('openai-responses-credential:get-status'),
  reveal: () => ipcRenderer.invoke('openai-responses-credential:reveal'),
  update: (payload: unknown) => ipcRenderer.invoke('openai-responses-credential:update', payload),
  clear: () => ipcRenderer.invoke('openai-responses-credential:clear'),
})

contextBridge.exposeInMainWorld('googleAIStudioCredential', {
  getStatus: () => ipcRenderer.invoke('google-ai-studio-credential:get-status'),
  reveal: () => ipcRenderer.invoke('google-ai-studio-credential:reveal'),
  update: (payload: unknown) => ipcRenderer.invoke('google-ai-studio-credential:update', payload),
  clear: () => ipcRenderer.invoke('google-ai-studio-credential:clear'),
})

contextBridge.exposeInMainWorld('anthropicCredential', {
  getStatus: () => ipcRenderer.invoke('anthropic-credential:get-status'),
  reveal: () => ipcRenderer.invoke('anthropic-credential:reveal'),
  update: (payload: unknown) => ipcRenderer.invoke('anthropic-credential:update', payload),
  clear: () => ipcRenderer.invoke('anthropic-credential:clear'),
})

contextBridge.exposeInMainWorld('anthropicModels', {
  listAvailability: (payload?: unknown) => ipcRenderer.invoke('anthropic-models:list-availability', payload),
})

contextBridge.exposeInMainWorld('deepSeekCredential', {
  getStatus: () => ipcRenderer.invoke('deepseek-credential:get-status'),
  reveal: () => ipcRenderer.invoke('deepseek-credential:reveal'),
  update: (payload: unknown) => ipcRenderer.invoke('deepseek-credential:update', payload),
  clear: () => ipcRenderer.invoke('deepseek-credential:clear'),
})

contextBridge.exposeInMainWorld('deepSeekModels', {
  listAvailability: (payload?: unknown) => ipcRenderer.invoke('deepseek-models:list-availability', payload),
})

contextBridge.exposeInMainWorld('openAIResponsesModels', {
  listAvailability: (payload?: unknown) => ipcRenderer.invoke('openai-responses-models:list-availability', payload),
})

contextBridge.exposeInMainWorld('googleAIStudioModels', {
  listAvailability: (payload?: unknown) => ipcRenderer.invoke('google-ai-studio-models:list-availability', payload),
})

contextBridge.exposeInMainWorld('networkProxy', {
  getPolicy: () => ipcRenderer.invoke('network-proxy:get-policy'),
  updatePolicy: (policy: unknown) => ipcRenderer.invoke('network-proxy:update-policy', policy),
  resetPolicy: () => ipcRenderer.invoke('network-proxy:reset-policy'),
  resolveProxy: (payload: unknown) => ipcRenderer.invoke('network-proxy:resolve-proxy', payload),
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

contextBridge.exposeInMainWorld('lmStudioProvider', {
  probe: (payload: unknown) => ipcRenderer.invoke('lm-studio:probe', payload),
  loadModel: (payload: unknown) => ipcRenderer.invoke('lm-studio:load-model', payload),
  unloadModel: (payload: unknown) => ipcRenderer.invoke('lm-studio:unload-model', payload),
})

contextBridge.exposeInMainWorld('lmStudioChat', {
  startTextChat: (payload: unknown) => ipcRenderer.invoke('lm-studio-chat:stream-text', payload),
  abortTextChat: (requestId: string) => ipcRenderer.invoke('lm-studio-chat:abort', requestId),
  onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(`lm-studio-chat:chunk:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`lm-studio-chat:chunk:${requestId}`, handler)
    }
  },
  onTextChatEnd: (requestId: string, callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(`lm-studio-chat:end:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`lm-studio-chat:end:${requestId}`, handler)
    }
  },
})

contextBridge.exposeInMainWorld('ollamaProvider', {
  probe: (payload: unknown) => ipcRenderer.invoke('ollama:probe', payload),
  loadModel: (payload: unknown) => ipcRenderer.invoke('ollama:load-model', payload),
  unloadModel: (payload: unknown) => ipcRenderer.invoke('ollama:unload-model', payload),
})

contextBridge.exposeInMainWorld('ollamaChat', {
  startTextChat: (payload: unknown) => ipcRenderer.invoke('ollama-chat:stream-text', payload),
  abortTextChat: (requestId: string) => ipcRenderer.invoke('ollama-chat:abort', requestId),
  onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(`ollama-chat:chunk:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`ollama-chat:chunk:${requestId}`, handler)
    }
  },
  onTextChatEnd: (requestId: string, callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(`ollama-chat:end:${requestId}`, handler)
    return () => {
      ipcRenderer.removeListener(`ollama-chat:end:${requestId}`, handler)
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

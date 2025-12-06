import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

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

  /**
   * 使用系统默认应用打开图片
   * 支持 data URI (base64)、HTTP(S) URL 和本地文件路径
   * @param imageUrl - 图片的 URL 或 data URI
   * @returns {Promise<{success: boolean, path?: string, url?: string, error?: string}>}
   */
  openImage: (imageUrl: string) => ipcRenderer.invoke('shell:open-image', imageUrl),

  /**
   * 在新的 BrowserWindow 中打开外部链接（类似微信/QQ 内的外链弹窗）
   */
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  /**
   * 打开应用内链（In-App WebView，默认复用同一窗口）
   */
  openInAppLink: (url: string, windowId?: number) => ipcRenderer.invoke('inapp:open-link', { url, windowId }),
})

// Expose DB bridge for renderer storage access
contextBridge.exposeInMainWorld('dbBridge', {
  invoke: (method: string, params?: unknown) => ipcRenderer.invoke('db:invoke', { method, params }),
})

/**
 * Expose OpenRouter API Bridge
 * 
 * 提供主进程网关层的 API 调用接口，绕过 CORS 限制
 */
contextBridge.exposeInMainWorld('openRouterBridge', {
  /**
   * 获取所有可用模型列表
   * 
   * @param request - 请求参数（可选 apiKey 和 baseUrl）
   * @returns 模型列表
   */
  listModels: (request?: { apiKey?: string; baseUrl?: string }) => 
    ipcRenderer.invoke('openrouter:list-models', request || {}),

  /**
   * 启动流式聊天
   * 返回 requestId，后续通过事件监听获取数据
   */
  startStreamChat: (request: {
    apiKey?: string
    baseUrl?: string
    history: Array<{ role: string; content: any }>
    model: string
    userMessage: string
    options?: any
  }) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    ipcRenderer.invoke('openrouter:stream-chat', {
      requestId,
      ...request
    })
    return requestId
  },

  /**
   * 注册流式事件监听器
   */
  onStreamChunk: (requestId: string, callback: (chunk: any) => void) => {
    ipcRenderer.on(`openrouter:chunk:${requestId}`, (_, chunk) => callback(chunk))
  },

  onStreamEnd: (requestId: string, callback: () => void) => {
    ipcRenderer.on(`openrouter:end:${requestId}`, () => callback())
  },

  onStreamError: (requestId: string, callback: (error: any) => void) => {
    ipcRenderer.on(`openrouter:error:${requestId}`, (_, error) => callback(error))
  },

  /**
   * 清理流式监听器
   */
  cleanupStream: (requestId: string) => {
    ipcRenderer.removeAllListeners(`openrouter:chunk:${requestId}`)
    ipcRenderer.removeAllListeners(`openrouter:end:${requestId}`)
    ipcRenderer.removeAllListeners(`openrouter:error:${requestId}`)
  },

  /**
   * 中止流式请求
   */
  abort: (requestId: string) => 
    ipcRenderer.invoke('openrouter:abort', requestId)
})

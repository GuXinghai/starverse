export interface ElectronStore {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<boolean>
  delete: (key: string) => Promise<boolean>
  /**
   * 安全清空配置
   * @param keepKeys - 需要保留的字段（例如 API Keys）
   * @returns 备份文件路径，如果失败则返回 null
   */
  clearSafe: (keepKeys?: string[]) => Promise<string | null>
  /**
   * 检查配置文件完整性
   * @returns { ok: 是否正常, reason: 异常原因 }
   */
  checkIntegrity: () => Promise<{ ok: boolean; reason?: string }>
}

export interface SelectedFileResult {
  dataUrl: string
  filename: string
  size: number
  mimeType?: string
}

export interface ElectronAPI {
  selectImage: () => Promise<string | null>
  openImage: (imageUrl: string) => Promise<{
    success: boolean
    path?: string
    url?: string
    error?: string
  }>
  openExternal: (url: string) => Promise<{
    success: boolean
    windowId?: number
    error?: string
  }>
  openInAppLink: (url: string, windowId?: number) => Promise<{
    tabId?: string
    windowId?: number
    error?: string
  }>
  selectFile: (options?: {
    filters?: Array<{ name: string; extensions: string[] }>
    defaultMimeType?: string
  }) => Promise<SelectedFileResult | null>
}

export interface ElectronIpcRenderer {
  on: (...args: any[]) => void
  off: (...args: any[]) => void
  send: (...args: any[]) => void
  invoke: (...args: any[]) => Promise<any>
}

export interface DbInvokeBridge {
  invoke<T = unknown>(method: string, params?: unknown): Promise<T>
}

/**
 * OpenRouter 桥接接口
 * 
 * 提供主进程网关层的 API 调用接口，避免 CORS 限制
 */
export interface OpenRouterBridge {
  /**
   * 获取所有可用模型列表
   */
  listModels: (request?: {
    apiKey?: string
    baseUrl?: string
  }) => Promise<Array<{
    id: string
    name: string
    description: string
    context_length: number
    pricing: {
      prompt: number
      completion: number
      image?: number
      request?: number
    }
    input_modalities: string[]
    output_modalities: string[]
    series: string
    [key: string]: any
  }>>

  /**
   * 启动流式聊天
   * 返回 requestId
   */
  startStreamChat: (request: {
    apiKey?: string
    baseUrl?: string
    history: Array<{ role: string; content: any }>
    model: string
    userMessage: string
    options?: any
  }) => string

  onStreamChunk: (requestId: string, callback: (chunk: any) => void) => void
  onStreamEnd: (requestId: string, callback: () => void) => void
  onStreamError: (requestId: string, callback: (error: any) => void) => void
  cleanupStream: (requestId: string) => void

  /**
   * 中止流式请求
   */
  abort: (requestId: string) => Promise<boolean>
}

export interface InAppBridge {
  openLink: (url: string, windowId?: number) => Promise<{ tabId: string; windowId: number }>
  goBack: (tabId: string) => Promise<boolean>
  goForward: (tabId: string) => Promise<boolean>
  reload: (tabId: string) => Promise<boolean>
  openExternal: (tabId: string) => Promise<boolean>
  copyLink: (tabId: string) => Promise<boolean>
  closeTab: (tabId: string) => Promise<boolean>
  detachTab: (tabId: string) => Promise<{ tabId?: string; windowId?: number } | null>
  focusTab: (tabId: string) => Promise<boolean>
  newWindow: () => Promise<{ windowId: number }>
  getWindowState: (windowId: number) => Promise<{
    windowId: number
    activeTabId: string | null
    tabs: Array<{
      id: string
      url: string
      title: string
      windowId: number
      canGoBack: boolean
      canGoForward: boolean
      isLoading: boolean
    }>
  } | null>
  onWindowState: (callback: (payload: any) => void) => () => void
}

declare global {
  interface Window {
    electronStore?: ElectronStore
    electronAPI?: ElectronAPI
    ipcRenderer?: ElectronIpcRenderer
    dbBridge?: DbInvokeBridge
    openRouterBridge?: OpenRouterBridge
    inapp?: InAppBridge
  }
}

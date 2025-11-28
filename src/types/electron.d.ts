export interface ElectronStore {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<boolean>
  delete: (key: string) => Promise<boolean>
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

declare global {
  interface Window {
    electronStore?: ElectronStore
    electronAPI?: ElectronAPI
    ipcRenderer?: ElectronIpcRenderer
    dbBridge?: DbInvokeBridge
    openRouterBridge?: OpenRouterBridge
  }
}

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

  /**
   * 获取网络实验运行时信息（开关注入/版本/argv）
   */
  getNetExpRuntimeInfo: () => ipcRenderer.invoke('netexp:get-runtime-info'),

  /**
   * 重新启动应用（用于开关生效）
   */
  relaunchApp: () => ipcRenderer.invoke('app:relaunch'),
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

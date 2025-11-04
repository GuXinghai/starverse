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
})

// Expose file dialog API for image selection
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 选择图片文件并返回 base64 data URI
   * @returns {Promise<string | null>} base64 data URI 或 null（如果用户取消）
   */
  selectImage: () => ipcRenderer.invoke('dialog:select-image'),
  
  /**
   * 使用系统默认应用打开图片
   * 支持 data URI (base64)、HTTP(S) URL 和本地文件路径
   * @param imageUrl - 图片的 URL 或 data URI
   * @returns {Promise<{success: boolean, path?: string, url?: string, error?: string}>}
   */
  openImage: (imageUrl: string) => ipcRenderer.invoke('shell:open-image', imageUrl),
})

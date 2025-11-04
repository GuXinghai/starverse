export interface ElectronStore {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<boolean>
  delete: (key: string) => Promise<boolean>
}

export interface ElectronAPI {
  selectImage: () => Promise<string | null>
  openImage: (imageUrl: string) => Promise<{
    success: boolean
    path?: string
    url?: string
    error?: string
  }>
}

export interface ElectronIpcRenderer {
  on: (...args: any[]) => void
  off: (...args: any[]) => void
  send: (...args: any[]) => void
  invoke: (...args: any[]) => Promise<any>
}

declare global {
  interface Window {
    electronStore?: ElectronStore
    electronAPI?: ElectronAPI
    ipcRenderer?: ElectronIpcRenderer
  }
}

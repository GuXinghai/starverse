export interface ElectronStore {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<boolean>
  delete: (key: string) => Promise<boolean>
}

declare global {
  interface Window {
    electronStore: ElectronStore
  }
}

import { BrowserWindow, app } from 'electron'
import type { CreateMainWindowInput } from './mainWindow'
import { createMainWindow } from './mainWindow'

type MainWindowLifecycle = Readonly<{
  createWindow: () => BrowserWindow | null
  getWindow: () => BrowserWindow | null
  clearWindowListeners: () => void
  registerAppLifecycleHandlers: () => void
}>

export function createMainWindowLifecycle(input: CreateMainWindowInput): MainWindowLifecycle {
  let win: BrowserWindow | null = null

  const getWindow = () => {
    if (!win || win.isDestroyed()) return null
    return win
  }

  const createWindow = () => {
    const created = createMainWindow(input)
    win = created
    return created
  }

  const clearWindowListeners = () => {
    const window = getWindow()
    if (window) {
      window.removeAllListeners()
    }
  }

  const registerAppLifecycleHandlers = () => {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
        win = null
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  }

  return {
    createWindow,
    getWindow,
    clearWindowListeners,
    registerAppLifecycleHandlers,
  }
}

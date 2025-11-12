import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import Store from 'electron-store'
import { DbWorkerManager } from './db/workerManager'
import { registerDbBridge } from './ipc/dbBridge'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 初始化 electron-store
const store = new Store()

// The built directory structure
//
// ├─┬─ dist
// │ └── index.html
// │
// ├─┬ dist-electron
// │ ├── main.js
// │ └── preload.mjs
// │   └── db/worker.js
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const DB_WORKER_SCRIPT = path.join(MAIN_DIST, 'db', 'worker.cjs')
const DB_SCHEMA_PATH = path.join(process.env.APP_ROOT, 'infra', 'db', 'schema.sql')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
const dbWorkerManager = new DbWorkerManager({
  workerScriptPath: DB_WORKER_SCRIPT,
  schemaPath: DB_SCHEMA_PATH,
  logSlowQueryMs: 75
})

const ensureDbReady = async () => {
  const dbPath = path.join(app.getPath('userData'), 'chat.db')
  await dbWorkerManager.start(dbPath)
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs')
    }
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    // 开发模式下自动打开开发者工具
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS.
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

// 添加优雅的退出处理
app.on('before-quit', () => {
  if (win) {
    win.removeAllListeners()
  }
  dbWorkerManager.stop().catch((error) => {
    console.error('[main] failed to stop DB worker', error)
  })
})

app.whenReady()
  .then(async () => {
    await ensureDbReady()
    registerDbBridge(dbWorkerManager)
    createWindow()
  })
  .catch((error) => {
    console.error('[main] failed to initialize application', error)
    app.quit()
  })

// IPC handlers for electron-store
ipcMain.handle('store-get', (_event, key) => {
  return store.get(key)
})

ipcMain.handle('store-set', (_event, key, value) => {
  store.set(key, value)
  return true
})

ipcMain.handle('store-delete', (_event, key) => {
  store.delete(key)
  return true
})

// IPC handler for image selection
ipcMain.handle('dialog:select-image', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']
        }
      ],
      title: '选择图片'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    const fileBuffer = await readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp'
    }
    const mimeType = mimeTypes[ext] || 'image/jpeg'
    const base64Data = fileBuffer.toString('base64')
    const dataUri = `data:${mimeType};base64,${base64Data}`

    console.log('[dialog] selected image:', filePath, 'size:', (base64Data.length / 1024).toFixed(2), 'KB')
    return dataUri
  } catch (error) {
    console.error('[dialog] select image failed:', error)
    return null
  }
})

// IPC handler for opening images with system default application
ipcMain.handle('shell:open-image', async (_event, imageUrl: string) => {
  try {
    if (imageUrl.startsWith('data:image/')) {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/)
      if (!matches) {
        throw new Error('无效的 data URI 格式')
      }

      const [, extension, base64Data] = matches
      const tempDir = path.join(tmpdir(), 'starverse-images')
      await mkdir(tempDir, { recursive: true })

      const timestamp = Date.now()
      const tempFilePath = path.join(tempDir, `image-${timestamp}.${extension}`)
      const buffer = Buffer.from(base64Data, 'base64')
      await writeFile(tempFilePath, buffer)

      console.log('[shell] saved base64 image to temp:', tempFilePath)
      const result = await shell.openPath(tempFilePath)
      if (result) {
        console.error('[shell] open image failed:', result)
        return { success: false, error: result }
      }
      return { success: true, path: tempFilePath }
    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      await shell.openExternal(imageUrl)
      console.log('[shell] opened remote image:', imageUrl)
      return { success: true, url: imageUrl }
    } else {
      const result = await shell.openPath(imageUrl)
      if (result) {
        console.error('[shell] open image failed:', result)
        return { success: false, error: result }
      }
      console.log('[shell] opened local image:', imageUrl)
      return { success: true, path: imageUrl }
    }
  } catch (error) {
    console.error('[shell] open image error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

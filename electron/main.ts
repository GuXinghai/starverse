import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import Store from 'electron-store'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 初始化 electron-store
const store = new Store()

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    // 开发模式下自动打开开发者工具
    win.webContents.openDevTools()
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 添加优雅的退出处理
app.on('before-quit', () => {
  // 在退出前执行清理操作
  if (win) {
    win.removeAllListeners()
  }
})

app.whenReady().then(createWindow)

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
    
    // 读取文件为 Buffer
    const fileBuffer = await readFile(filePath)
    
    // 根据文件扩展名确定 MIME 类型
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp'
    }
    const mimeType = mimeTypes[ext] || 'image/jpeg'
    
    // 转换为 base64 data URI
    const base64Data = fileBuffer.toString('base64')
    const dataUri = `data:${mimeType};base64,${base64Data}`
    
    console.log('✓ 成功选择图片:', filePath, '大小:', (base64Data.length / 1024).toFixed(2), 'KB')
    
    return dataUri
  } catch (error) {
    console.error('❌ 选择图片失败:', error)
    return null
  }
})

// IPC handler for opening images with system default application
ipcMain.handle('shell:open-image', async (_event, imageUrl: string) => {
  try {
    // 如果是 data URI (Base64)，需要先保存到临时文件
    if (imageUrl.startsWith('data:image/')) {
      // 解析 data URI
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/)
      if (!matches) {
        throw new Error('无效的 data URI 格式')
      }

      const [, extension, base64Data] = matches
      
      // 创建临时文件路径
      const tempDir = path.join(tmpdir(), 'starverse-images')
      await mkdir(tempDir, { recursive: true })
      
      // 使用时间戳作为文件名避免冲突
      const timestamp = Date.now()
      const tempFilePath = path.join(tempDir, `image-${timestamp}.${extension}`)
      
      // 将 base64 转换为 Buffer 并写入文件
      const buffer = Buffer.from(base64Data, 'base64')
      await writeFile(tempFilePath, buffer)
      
      console.log('✓ Base64 图片已保存到临时文件:', tempFilePath)
      
      // 使用系统默认应用打开文件
      const result = await shell.openPath(tempFilePath)
      if (result) {
        console.error('❌ 打开图片失败:', result)
        return { success: false, error: result }
      }
      
      return { success: true, path: tempFilePath }
    } 
    // 如果是 HTTP(S) URL，直接用外部浏览器打开
    else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      await shell.openExternal(imageUrl)
      console.log('✓ 已在外部浏览器打开图片:', imageUrl)
      return { success: true, url: imageUrl }
    }
    // 如果是本地文件路径
    else {
      const result = await shell.openPath(imageUrl)
      if (result) {
        console.error('❌ 打开图片失败:', result)
        return { success: false, error: result }
      }
      console.log('✓ 已用系统默认应用打开图片:', imageUrl)
      return { success: true, path: imageUrl }
    }
  } catch (error) {
    console.error('❌ 打开图片时发生错误:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }
  }
})

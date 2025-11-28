/**
 * Electron 主进程入口
 * 
 * ========== 核心职责 ==========
 * 1. 创建和管理应用主窗口
 * 2. 初始化 SQLite 数据库（通过 Worker 线程）
 * 3. 注册 IPC Handlers（数据库桥接、配置存储、文件对话框）
 * 4. 处理应用生命周期事件（启动、退出、激活）
 * 
 * ========== 架构说明 ==========
 * - 使用 DbWorkerManager 管理独立的 Worker 线程执行数据库操作
 * - 使用 electron-store 持久化应用配置（API Keys、偏好设置）
 * - 渲染进程通过 IPC 通道与主进程通信（preload.ts 暴露 API）
 * 
 * ========== 数据存储路径 ==========
 * - 数据库文件: app.getPath('userData')/chat.db
 * - 配置文件: app.getPath('userData')/config.json (electron-store)
 * - 临时图片: os.tmpdir()/starverse-images/
 * 
 * @module electron/main
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import Store from 'electron-store'
import { DbWorkerManager } from './db/workerManager'
import { registerDbBridge } from './ipc/dbBridge'
import { registerOpenRouterBridge, cleanupActiveStreams } from './ipc/openRouterBridge'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_LOG_DIR = path.join(app.getPath('userData'), 'logs')

/**
 * 应用配置持久化存储
 * 
 * electron-store 自动将数据保存为 JSON 文件
 * 位置: app.getPath('userData')/config.json
 * 
 * 存储内容:
 * - API Keys (Gemini, OpenRouter)
 * - 用户偏好设置（主题、字体大小等）
 * - 窗口尺寸和位置
 */
const store = new Store()

/**
 * 构建产物目录结构
 * 
 * 开发模式:
 * - VITE_DEV_SERVER_URL 指向 Vite 开发服务器 (http://localhost:5173)
 * - 热更新支持，自动重载
 * 
 * 生产模式:
 * ├─┬─ dist/              (渲染进程静态资源)
 * │ └── index.html
 * │ └── assets/          (JS/CSS bundles)
 * ├─┬ dist-electron/      (主进程和预加载脚本)
 * │ ├── main.js          (本文件编译后)
 * │ ├── preload.mjs      (渲染进程桥接脚本)
 * │ └── db/worker.cjs    (数据库 Worker 线程)
 */
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const DB_WORKER_SCRIPT = path.join(MAIN_DIST, 'db', 'worker.cjs')
const DB_SCHEMA_PATH = path.join(process.env.APP_ROOT, 'infra', 'db', 'schema.sql')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

/**
 * 数据库 Worker 管理器实例
 * 
 * 配置说明:
 * - workerScriptPath: Worker 线程脚本路径（独立进程执行 SQL）
 * - schemaPath: 数据库 Schema 初始化脚本
 * - logSlowQueryMs: 慢查询日志阈值（超过 75ms 记录警告）
 * 
 * 线程模型:
 * - 主进程: 处理 UI 和 IPC 通信
 * - Worker 线程: 执行所有 SQLite 操作（避免阻塞主线程）
 * - 通信方式: MessagePort（高性能双向通信）
 */
const dbWorkerManager = new DbWorkerManager({
  workerScriptPath: DB_WORKER_SCRIPT,
  schemaPath: DB_SCHEMA_PATH,
  logSlowQueryMs: 75,
  logDirectory: DB_LOG_DIR,
  callTimeoutMs: 20000,
  restartBackoffMs: 500,
  maxRestartAttempts: 5,
  maxPending: 400
})

/**
 * 初始化数据库并等待 Worker 线程就绪
 * 
 * 执行流程:
 * 1. 确定数据库文件路径 (userData/chat.db)
 * 2. 启动 Worker 线程
 * 3. 执行 Schema 初始化（如果是新数据库）
 * 4. 等待 Worker 'online' 事件
 * 
 * @throws {Error} Worker 启动失败或 Schema 执行失败
 */
const ensureDbReady = async () => {
  const dbPath = path.join(app.getPath('userData'), 'chat.db')
  await dbWorkerManager.start(dbPath)
}

/**
 * 创建应用主窗口
 * 
 * 窗口配置:
 * - webPreferences.preload: 预加载脚本，暴露安全的 API 给渲染进程
 * - contextIsolation: 默认启用（Electron 安全最佳实践）
 * - nodeIntegration: 默认禁用（避免渲染进程直接访问 Node.js）
 * 
 * 加载策略:
 * - 开发模式: 加载 Vite Dev Server (http://localhost:5173)
 * - 生产模式: 加载本地 HTML 文件 (dist/index.html)
 * 
 * 🔒 安全边界:
 * 渲染进程只能通过 preload.ts 暴露的 API 与主进程通信，
 * 无法直接访问 Node.js 模块或 Electron API。
 */
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs')
    }
  })

  const isExternalHttpUrl = (targetUrl: string) => {
    if (!targetUrl || (typeof targetUrl === 'string' && targetUrl.trim() === '')) {
      return false
    }
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return false
    }
    if (VITE_DEV_SERVER_URL && targetUrl.startsWith(VITE_DEV_SERVER_URL)) {
      return false
    }
    return true
  }

  // 拦截 window.open：统一交由系统浏览器打开外部链接，避免新建 Electron 窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // 拦截导航：阻止渲染进程跳转到外链，改为在默认浏览器打开
  win.webContents.on('will-navigate', (event, url) => {
    if (isExternalHttpUrl(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // 页面加载完成后发送测试消息（用于验证 IPC 通信）
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

/**
 * 所有窗口关闭时退出应用（macOS 除外）
 * 
 * macOS 行为:
 * - 关闭窗口后应用仍在 Dock 中运行
 * - 点击 Dock 图标时通过 'activate' 事件重新创建窗口
 * 
 * Windows/Linux 行为:
 * - 关闭窗口后立即退出应用
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

/**
 * macOS Dock 图标点击事件
 * 
 * 当应用在 macOS 上没有窗口但仍在运行时，
 * 点击 Dock 图标会触发此事件，重新创建主窗口。
 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

/**
 * 优雅退出处理
 * 
 * 清理步骤:
 * 1. 移除窗口的所有事件监听器（防止内存泄漏）
 * 2. 停止数据库 Worker 线程
 *    - 等待所有待处理的数据库操作完成
 *    - 关闭 SQLite 连接
 *    - 终止 Worker 线程
 * 3. 清理临时文件（如有）
 * 
 * ⚠️ 注意: 如果 Worker 停止失败，只记录错误不阻止退出
 */
app.on('before-quit', () => {
  if (win) {
    win.removeAllListeners()
  }
  
  // 清理活动的 OpenRouter 流式请求
  cleanupActiveStreams()
  
  dbWorkerManager.stop().catch((error) => {
    console.error('[main] failed to stop DB worker', error)
  })
})

/**
 * 应用启动流程
 * 
 * 执行顺序:
 * 1. 等待 Electron 就绪（app.whenReady()）
 * 2. 初始化数据库 Worker 线程
 * 3. 注册数据库 IPC Handlers（dbBridge）
 * 4. 创建主窗口
 * 
 * 错误处理:
 * - 任何步骤失败都会导致应用退出
 * - 数据库初始化失败是致命错误（无法正常工作）
 * 
 * ⚠️ 注意: 必须等待数据库就绪后再创建窗口，
 * 否则渲染进程可能在数据库未准备好时发送 IPC 请求导致错误。
 */
app.whenReady()
  .then(async () => {
    await ensureDbReady()
    registerDbBridge(dbWorkerManager)
    registerOpenRouterBridge()  // 注册 OpenRouter 网关桥接
    createWindow()
  })
  .catch((error) => {
    console.error('[main] failed to initialize application', error)
    app.quit()
  })

// ========== IPC Handlers: 配置存储 ==========
// 使用 electron-store 持久化应用配置（API Keys、偏好设置等）

/**
 * 读取配置项
 * @param key - 配置键名（支持嵌套路径，如 'api.gemini.key'）
 * @returns 配置值，不存在时返回 undefined
 */
ipcMain.handle('store-get', (_event, key) => {
  return store.get(key)
})

/**
 * 设置配置项
 * @param key - 配置键名
 * @param value - 配置值（自动 JSON 序列化）
 * @returns true 表示设置成功
 */
ipcMain.handle('store-set', (_event, key, value) => {
  store.set(key, value)
  return true
})

/**
 * 删除配置项
 * @param key - 配置键名
 * @returns true 表示删除成功
 */
ipcMain.handle('store-delete', (_event, key) => {
  store.delete(key)
  return true
})


ipcMain.handle(
  'dialog:select-file',
  async (
    _event,
    options: { filters?: Array<{ name: string; extensions: string[] }>; defaultMimeType?: string } = {}
  ) => {
    try {
      const filters =
        Array.isArray(options.filters) && options.filters.length > 0
          ? options.filters
          : [{ name: 'PDF', extensions: ['pdf'] }]
      const defaultMimeType = options.defaultMimeType || 'application/pdf'

      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const fileBuffer = await readFile(filePath)
      const size = fileBuffer.byteLength
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf'
      }
      const mimeType = mimeTypes[ext] || defaultMimeType || 'application/octet-stream'
      const base64Data = fileBuffer.toString('base64')
      const dataUrl = `data:${mimeType};base64,${base64Data}`

      console.log('[dialog] selected file:', filePath, 'size:', (size / 1024).toFixed(2), 'KB')
      return {
        dataUrl,
        filename: path.basename(filePath),
        size,
        mimeType
      }
    } catch (error) {
      console.error('[dialog] select file failed:', error)
      return null
    }
  }
)

// ========== IPC Handler: 外部链接统一在系统浏览器打开 ==========

ipcMain.handle('shell:open-external', async (_event, url: string) => {
  try {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL')
    }
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol')
    }
    await shell.openExternal(parsed.toString())
    return { success: true }
  } catch (error) {
    console.error('[shell] open external error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

// ========== IPC Handler: 图片选择对话框 ==========

/**
 * 打开系统文件选择对话框，选择图片并转换为 Base64 Data URI
 * 
 * 使用场景:
 * - 用户在聊天中添加图片附件
 * - 支持多模态消息（文本 + 图片）
 * 
 * 执行流程:
 * 1. 打开系统文件选择对话框（限制为图片格式）
 * 2. 读取选中的图片文件为 Buffer
 * 3. 根据文件扩展名确定 MIME 类型
 * 4. 转换为 Base64 编码
 * 5. 构造 Data URI: data:image/jpeg;base64,XXXXX
 * 
 * 支持格式: JPG, JPEG, PNG, WebP, GIF, BMP
 * 
 * @returns Base64 Data URI 字符串，用户取消时返回 null
 * 
 * ⚠️ 注意:
 * - Data URI 会增大消息体积（Base64 编码增加 ~33%）
 * - 渲染进程负责限制图片大小（建议 < 5MB）
 * - 图片数据存储在对话的 tree.branches 中
 */
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
    
    // MIME 类型映射表
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

// ========== IPC Handler: 使用系统默认应用打开图片 ==========

/**
 * 使用系统默认图片查看器打开图片
 * 
 * 支持三种图片来源:
 * 1. Base64 Data URI (data:image/jpeg;base64,XXXXX)
 *    - 保存到临时文件后打开
 *    - 临时文件路径: os.tmpdir()/starverse-images/image-{timestamp}.{ext}
 * 2. HTTP/HTTPS URL (https://example.com/image.jpg)
 *    - 使用系统默认浏览器打开
 * 3. 本地文件路径 (C:/Users/.../picture.jpg)
 *    - 直接使用系统默认图片查看器打开
 * 
 * 使用场景:
 * - 用户在聊天中点击图片查看大图
 * - 右键菜单 "在系统查看器中打开"
 * 
 * @param imageUrl - 图片 URL（Data URI / HTTP URL / 文件路径）
 * @returns { success: boolean, path?: string, url?: string, error?: string }
 * 
 * 🧹 临时文件清理:
 * - 临时文件在应用退出后由操作系统自动清理
 * - 路径: Windows: %TEMP%\starverse-images, macOS: /tmp/starverse-images
 */
ipcMain.handle('shell:open-image', async (_event, imageUrl: string) => {
  try {
    if (imageUrl.startsWith('data:image/')) {
      // ========== 处理 Base64 Data URI ==========
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/)
      if (!matches) {
        throw new Error('无效的 data URI 格式')
      }

      const [, extension, base64Data] = matches
      const tempDir = path.join(tmpdir(), 'starverse-images')
      await mkdir(tempDir, { recursive: true })

      // 使用时间戳避免文件名冲突
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
      // ========== 处理远程 URL ==========
      await shell.openExternal(imageUrl)
      console.log('[shell] opened remote image:', imageUrl)
      return { success: true, url: imageUrl }
    } else {
      // ========== 处理本地文件路径 ==========
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

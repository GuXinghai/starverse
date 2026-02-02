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

import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import Store from 'electron-store'
import { syncOpenRouterModelCatalog } from '../src/next/modelCatalog/catalogSyncJob'
import { DbWorkerManager } from './db/workerManager'
import { registerDbBridge } from './ipc/dbBridge'
import { registerOpenRouterStreamBridge, cleanupOpenRouterStreams } from './ipc/openRouterStreamBridge'
import { createInAppBrowserManager } from './services/inappBrowser'
import {
  ALLOWED_CONFIG_KEYS,
  CURRENT_CONFIG_VERSION,
  migrateConfig,
  validateAndCleanConfig,
  checkFieldSize,
  checkTotalSize,
  checkConfigIntegrity,
  safeClearConfig,
} from './config/configSchema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_LOG_DIR = path.join(app.getPath('userData'), 'logs')

// 环境检测
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

/**
 * 默认配置值
 * 
 * 用于：
 * 1. Store 初始化时的 defaults 参数
 * 2. 配置文件损坏时的恢复
 * 3. 新用户首次启动的初始状态
 */
const DEFAULT_CONFIG = {
  configVersion: CURRENT_CONFIG_VERSION,
  activeProvider: 'Gemini' as const,
  theme: 'auto' as const,
  language: 'zh-CN' as const,
  autoScrollToBottom: true,
  showTimestamps: true,
  enableNotifications: true,
  netExp: {
    disableHttp2: false,
    disableQuic: false,
    streamInMainProcess: false,
    forceHttp1: false,
    tcpKeepAliveEnable: false,
    tcpKeepAliveIdleMs: 60000,
  },
} as const

/**
 * 应用配置持久化存储
 * 
 * electron-store 自动将数据保存为 JSON 文件
 * 位置: app.getPath('userData')/config.json
 * 
 * 存储内容：仅轻量级配置
 * - API Keys (Gemini, OpenRouter)
 * - 用户偏好设置（主题、字体大小等）
 * - 窗口尺寸和位置
 * 
 * ⚠️ 配置文件体积限制：
 * - 正常应该 < 200 KB
 * - 禁止存储：模型列表、会话内容、API 响应缓存等大数据
 * - 这些数据应使用 SQLite 或独立缓存文件
 * 
 * 📋 配置管理策略：
 * - 使用版本化 schema（见 config/configSchema.ts）
 * - 启动时自动迁移和清理
 * - 运行时验证和告警
 */

/**
 * 配置迁移和清理
 * 
 * 在应用启动时执行：
 * 0. 检查配置文件完整性
 * 1. 迁移旧版本配置到当前版本
 * 2. 移除非白名单字段
 * 3. 清理遗留的大字段
 * 
 * 安全保证：
 * - 迁移前自动创建备份
 * - 检测到异常时输出警告
 */
function migrateAndCleanupConfig(store: Store): void {
  try {
    // Step 0: 配置完整性检查
    const integrity = checkConfigIntegrity(store)
    if (!integrity.ok) {
      console.warn(`[Config] ⚠️ 配置文件异常: ${integrity.reason}`)
      console.warn('[Config] 这可能是配置文件损坏后的自动恢复')
    }
    
    const rawConfig = store.store as Record<string, any>
    
    // Step 1: 版本迁移
    const currentVersion = rawConfig.configVersion || 1
    if (currentVersion < CURRENT_CONFIG_VERSION) {
      if (isDev) {
        console.log(`[Config] 开始配置迁移: v${currentVersion} → v${CURRENT_CONFIG_VERSION}`)
      }
      
      const migratedConfig = migrateConfig(rawConfig)
      
      // 应用迁移后的配置
      for (const [key, value] of Object.entries(migratedConfig)) {
        if (rawConfig[key] !== value) {
          store.set(key, value)
        }
      }
      
      console.log(`[Config] ✅ 配置已迁移到 v${CURRENT_CONFIG_VERSION}`)
    }
    
    // Step 2: 验证和清理
    const { removed } = validateAndCleanConfig(store.store as Record<string, any>)
    
    if (removed.length > 0) {
      const totalRemoved = removed.reduce((sum, item) => sum + item.size, 0)
      
      // 只在有实际清理或开发环境下输出
      if (totalRemoved > 10_000 || isDev) {
        console.warn(`[Config] 清理 ${removed.length} 个非法字段，减少 ${(totalRemoved / 1024).toFixed(2)} KB`)
        
        if (isDev) {
          removed.forEach(({ key, size }) => {
            console.warn(`  - ${key}: ${(size / 1024).toFixed(2)} KB`)
          })
        }
      }
      
      // 移除非法字段
      removed.forEach(({ key }) => store.delete(key))
    }
    
    // Step 3: 确保版本号存在
    if (!store.has('configVersion')) {
      store.set('configVersion', CURRENT_CONFIG_VERSION)
    }
    
  } catch (error) {
    console.error('[Config] 迁移和清理失败:', error)
  }
}

/**
 * 配置体积检查
 * 
 * 调用时机：
 * - 应用启动时（必须）
 * - 开发环境：每次写入后
 * - 生产环境：仅在启动时或手动触发
 */
function performConfigSizeCheck(store: Store, context: 'startup' | 'write' = 'startup'): void {
  try {
    const config = store.store as Record<string, any>
    const { size, level, topFields } = checkTotalSize(config)
    const sizeKB = size / 1024
    const sizeMB = size / 1024 / 1024
    
    if (level === 'error') {
      console.error(`[Config] ❌ 配置文件严重超标: ${sizeMB.toFixed(2)} MB (${sizeKB.toFixed(2)} KB)`)
      console.error('[Config] 最大的 5 个字段:')
      topFields.forEach(({ key, size }) => {
        console.error(`  - ${key}: ${(size / 1024).toFixed(2)} KB`)
      })
    } else if (level === 'warn') {
      console.warn(`[Config] ⚠️ 配置文件体积偏大: ${sizeKB.toFixed(2)} KB`)
      if (isDev) {
        console.warn('[Config] 最大的 5 个字段:')
        topFields.forEach(({ key, size }) => {
          console.warn(`  - ${key}: ${(size / 1024).toFixed(2)} KB`)
        })
      }
    } else if (context === 'startup') {
      // 仅在启动时输出正常状态（避免日志噪音）
      if (isDev) {
        console.log(`[Config] ✓ 配置文件大小正常: ${sizeKB.toFixed(2)} KB`)
      }
    }
  } catch (error) {
    console.error('[Config] 体积检查失败:', error)
  }
}

/**
 * 初始化 electron-store 配置存储
 * 
 * 容错机制：
 * 1. clearInvalidConfig: JSON 解析失败时自动重置为默认值
 * 2. deserialize: 自定义反序列化，捕获错误并返回默认配置
 * 3. defaults: 提供默认配置值
 * 
 * 安全保证：
 * - 永远不会因为配置文件损坏而导致应用崩溃
 * - 损坏的配置会自动备份到 config.json.corrupted
 */
const store = new Store({
  // 配置文件名（默认为 config.json）
  name: 'config',
  
  // JSON 解析失败时自动重置为默认值（而不是抛出错误）
  clearInvalidConfig: true,
  
  // 默认配置值
  defaults: DEFAULT_CONFIG,
  
  // 自定义反序列化：捕获 JSON 解析错误并返回默认值
  deserialize: (text: string) => {
    try {
      // 空文件处理
      const trimmed = text.trim()
      if (!trimmed) {
        console.warn('[Config] 配置文件为空，使用默认配置')
        return DEFAULT_CONFIG
      }
      
      // 正常解析（使用 trim 后的内容，移除前后空白字符和换行符）
      const parsed = JSON.parse(trimmed)
      
      // 验证是否为对象
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        console.error('[Config] 配置文件格式错误（不是对象），使用默认配置')
        backupCorruptedConfig(text, 'invalid-format')
        return DEFAULT_CONFIG
      }
      
      return parsed
      
    } catch (error) {
      console.error('[Config] JSON 解析失败，配置文件已损坏:', error)
      console.error('[Config] 原始内容:', text.substring(0, 200))
      
      // 备份损坏的配置
      backupCorruptedConfig(text, 'parse-error')
      
      // 返回默认配置（避免应用崩溃）
      console.warn('[Config] 已重置为默认配置')
      return DEFAULT_CONFIG
    }
  },
})

/**
 * 备份损坏的配置文件
 * 
 * @param content - 损坏的配置内容
 * @param reason - 损坏原因（用于文件名）
 */
function backupCorruptedConfig(content: string, reason: string): void {
  try {
    const backupPath = path.join(
      app.getPath('userData'),
      `config.json.corrupted.${reason}.${Date.now()}.bak`
    )
    
    writeFile(backupPath, content, 'utf-8').then(() => {
      console.log(`[Config] 损坏的配置已备份到: ${backupPath}`)
    }).catch(err => {
      console.error('[Config] 备份失败:', err)
    })
  } catch (error) {
    console.error('[Config] 创建备份时出错:', error)
  }
}

// 启动时执行配置迁移、清理和体积检查
migrateAndCleanupConfig(store)
performConfigSizeCheck(store, 'startup')

type NetExpRuntimeInfo = {
  requested: { disableHttp2: boolean; disableQuic: boolean }
  applied: { disableHttp2: boolean; disableQuic: boolean }
  appliedSwitches: Array<{ name: string; value?: string }>
  switchErrors: Array<{ name: string; error: string }>
  electron: string
  chrome: string
  node: string
  argv: string[]
  appliedAt: string
}

const netExpRuntimeInfo: NetExpRuntimeInfo = {
  requested: { disableHttp2: false, disableQuic: false },
  applied: { disableHttp2: false, disableQuic: false },
  appliedSwitches: [],
  switchErrors: [],
  electron: process.versions.electron ?? 'unknown',
  chrome: process.versions.chrome ?? 'unknown',
  node: process.versions.node ?? 'unknown',
  argv: [...process.argv],
  appliedAt: new Date().toISOString(),
}

function applyNetworkExperimentSwitches(store: Store) {
  const netExp = store.get('netExp') as { disableHttp2?: unknown; disableQuic?: unknown } | undefined
  const disableHttp2 = netExp?.disableHttp2 === true
  const disableQuic = netExp?.disableQuic === true

  netExpRuntimeInfo.requested = { disableHttp2, disableQuic }

  if (disableHttp2) {
    try {
      app.commandLine.appendSwitch('disable-http2')
      netExpRuntimeInfo.appliedSwitches.push({ name: 'disable-http2' })
      netExpRuntimeInfo.applied = { ...netExpRuntimeInfo.applied, disableHttp2: true }
    } catch (error) {
      netExpRuntimeInfo.switchErrors.push({ name: 'disable-http2', error: String((error as any)?.message ?? error) })
    }
  }

  if (disableQuic) {
    try {
      app.commandLine.appendSwitch('disable-quic')
      netExpRuntimeInfo.appliedSwitches.push({ name: 'disable-quic' })
      netExpRuntimeInfo.applied = { ...netExpRuntimeInfo.applied, disableQuic: true }
    } catch (error) {
      netExpRuntimeInfo.switchErrors.push({ name: 'disable-quic', error: String((error as any)?.message ?? error) })
    }
  }
}

// 必须在 app ready 前注入网络实验开关
applyNetworkExperimentSwitches(store)

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

const BUILD_ID_FILE = 'build-id.json'

function readBuildIdFromFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.buildId === 'string' && parsed.buildId.trim()) {
      return parsed.buildId.trim()
    }
  } catch {
    // ignore
  }
  return null
}

function resolveMainBuildId(): { buildId: string; source: string } {
  const envId = process.env.STARVERSE_BUILD_ID || process.env.VITE_BUILD_ID
  if (envId && envId.trim()) return { buildId: envId.trim(), source: 'env' }

  const candidates = [
    process.env.VITE_PUBLIC ? path.join(process.env.VITE_PUBLIC, BUILD_ID_FILE) : null,
    path.join(RENDERER_DIST, BUILD_ID_FILE),
    path.join(process.env.APP_ROOT ?? path.join(__dirname, '..'), 'public', BUILD_ID_FILE),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const buildId = readBuildIdFromFile(candidate)
    if (buildId) return { buildId, source: `file:${candidate}` }
  }

  return { buildId: new Date().toISOString(), source: 'runtime' }
}

const MAIN_BUILD = resolveMainBuildId()
console.info(`[build] main build id: ${MAIN_BUILD.buildId} (source: ${MAIN_BUILD.source})`)

const APP_CSP =
  "default-src 'self'; script-src 'self'; connect-src 'self' ws://localhost:* ws://127.0.0.1:* https://generativelanguage.googleapis.com https://openrouter.ai; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:"

function registerDevCspHeaders() {
  if (!VITE_DEV_SERVER_URL) return
  let origin: string
  try {
    origin = new URL(VITE_DEV_SERVER_URL).origin
  } catch (error) {
    console.warn('[CSP] invalid VITE_DEV_SERVER_URL, skip CSP header injection:', error)
    return
  }

  const filter = { urls: [`${origin}/*`] }
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const responseHeaders = (details.responseHeaders ?? {}) as Record<string, string[]>
    const existingKey = Object.keys(responseHeaders).find((key) => key.toLowerCase() === 'content-security-policy')
    responseHeaders[existingKey ?? 'Content-Security-Policy'] = [APP_CSP]
    callback({ responseHeaders })
  })
}

// ========== In-App Browser Manager ==========
const inAppBrowserManager = createInAppBrowserManager()
void inAppBrowserManager

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
  // Preflight: fail fast with a clear error if native deps (better-sqlite3) are ABI-mismatched.
  // This commonly happens when running `npm test` (Node rebuild) and then launching Electron
  // without re-running `npm run rebuild:electron`.
  try {
    const require = createRequire(import.meta.url)
    require('better-sqlite3')
  } catch (error: any) {
    const details = error?.message ? String(error.message) : String(error)
    const fixDev = `Fix (dev):\n- Close Electron\n- Run: npm run rebuild:electron\n- Then: npm run electron:dev`
    const fixProd = `Fix (prod):\n- Reinstall the app (native dependencies are bundled per Electron version)`
    const fix = isDev ? fixDev : fixProd

    console.error('[main] failed to load better-sqlite3 (native module ABI mismatch?)', error)
    dialog.showErrorBox('Database initialization failed', `${details}\n\n${fix}`)
    throw error
  }

  const dbPath = path.join(app.getPath('userData'), 'chat.db')
  try {
    await dbWorkerManager.start(dbPath)
  } catch (error) {
    console.error('[main] failed to start DB worker', error)
    dialog.showErrorBox('Database initialization failed', `DB worker failed to start.\n\n${(error as any)?.message ?? String(error)}`)
    throw error
  }
}

async function startCatalogSyncInBackground() {
  try {
    const apiKey = String(store.get('openRouterApiKey') ?? '').trim()
    const baseUrl = String(store.get('openRouterBaseUrl') ?? '').trim() || null
    if (!apiKey) return

    const result = await syncOpenRouterModelCatalog({
      apiKey,
      baseUrl,
      writer: {
        syncSnapshot: (params) => dbWorkerManager.call('modelCatalog.syncSnapshot', params).then(() => {}),
      },
    })

    if (result.ok) {
      await dbWorkerManager.call('reasoningIndex.syncFromCatalog', { routerSource: 'openrouter' })
      try {
        win?.webContents?.send('db:modelCatalogSynced', {
          routerSource: 'openrouter',
          snapshotId: result.snapshotId,
          modelCount: result.modelCount,
        })
      } catch (error) {
        console.warn('[CatalogSyncJob] failed to notify renderer (non-fatal):', error)
      }
    }
  } catch (error) {
    console.warn('[CatalogSyncJob] failed (non-fatal):', error)
  }
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

  console.warn(`[main] VITE_DEV_SERVER_URL: ${VITE_DEV_SERVER_URL ?? '<missing>'}`)
  if (isDev && !VITE_DEV_SERVER_URL) {
    const message = 'VITE_DEV_SERVER_URL is missing in dev mode. Refusing to load dist/index.html.'
    console.error(`[main] ${message}`)
    dialog.showErrorBox('Dev startup error', message)
    app.exit(1)
    return
  }

  // Optional: mirror renderer console logs into the main process stdout for debugging timing/races.
  // Enable with: SV_DEBUG_RENDERER_CONSOLE=1
  if (process.env.SV_DEBUG_RENDERER_CONSOLE === '1') {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const src = typeof sourceId === 'string' && sourceId.length > 0 ? sourceId : 'renderer'
      console.log(`[renderer][console:${level}] ${message} (${src}:${line})`)
    })
  }

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
    console.warn(`[main] webContents.getURL(): ${win?.webContents.getURL()}`)
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (isDev) {
    win.loadURL(VITE_DEV_SERVER_URL!)
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
 * 1. 通知渲染进程保存所有脏数据
 * 2. 移除窗口的所有事件监听器（防止内存泄漏）
 * 3. 停止数据库 Worker 线程
 *    - 等待所有待处理的数据库操作完成
 *    - 关闭 SQLite 连接
 *    - 终止 Worker 线程
 * 4. 清理临时文件（如有）
 * 
 * ⚠️ 注意: 如果 Worker 停止失败，只记录错误不阻止退出
 */
app.on('before-quit', async (event) => {
  // 阻止立即退出，等待保存完成
  event.preventDefault()
  
  // 通知渲染进程保存所有脏数据
  if (win && !win.isDestroyed()) {
    console.log('[main] 通知渲染进程保存数据...')
    win.removeAllListeners()
  }

  // 清理活动的 OpenRouter 流式请求
  cleanupOpenRouterStreams()
  
  // 停止数据库 Worker
  await dbWorkerManager.stop().catch((error) => {
    console.error('[main] failed to stop DB worker', error)
  })
  
  // 真正退出
  app.exit(0)
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
    registerDevCspHeaders()
    await ensureDbReady()
    registerDbBridge(dbWorkerManager)
    registerOpenRouterStreamBridge()
    
    // 注册事件转发：Worker 事件 → Renderer
    dbWorkerManager.onEvent((event) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('db:event', event)
      }
    })
    
    createWindow()
    void startCatalogSyncInBackground()
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
  // 1. 字段大小检查（日志已在 checkFieldSize 内部输出）
  const sizeCheck = checkFieldSize(key, value, isDev)
  if (!sizeCheck.ok) {
    // 不阻止写入，但已记录严重警告
  }
  
  // 2. 白名单检查
  if (!ALLOWED_CONFIG_KEYS.has(key)) {
    if (isDev) {
      console.warn(`[Config] ⚠️ 写入非白名单字段: "${key}"`)
      console.warn('[Config] 如需使用，请添加到 config/configSchema.ts 的 ALLOWED_CONFIG_KEYS')
    } else {
      // 生产环境：仅记录一次警告
      console.warn(`[Config] 未知配置字段: "${key}"`)
    }
  }
  
  // 3. 执行写入
  store.set(key, value)
  
  // 4. 写入后体积检查（仅开发环境）
  if (isDev) {
    performConfigSizeCheck(store, 'write')
  }
  
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

/**
 * 安全清空配置
 * 
 * 使用场景：
 * - 配置文件体积过大需要重置
 * - 调试时需要清除所有设置
 * - 用户请求恢复默认设置
 * 
 * @param keepKeys - 需要保留的字段（例如 API Keys）
 * @returns 备份文件路径，如果失败则返回 null
 */
ipcMain.handle('store-clear-safe', (_event, keepKeys: string[] = []) => {
  try {
    const backupPath = safeClearConfig(store, keepKeys)
    
    // 清空后重新执行迁移和体积检查
    migrateAndCleanupConfig(store)
    performConfigSizeCheck(store, 'startup')
    
    return backupPath
  } catch (error) {
    console.error('[IPC] 安全清空配置失败:', error)
    return null
  }
})

/**
 * 检查配置文件完整性
 * 
 * @returns { ok: 是否正常, reason: 异常原因 }
 */
ipcMain.handle('store-check-integrity', () => {
  return checkConfigIntegrity(store)
})

// ========== IPC Handlers: Network Experiments ==========
ipcMain.handle('netexp:get-runtime-info', () => {
  return netExpRuntimeInfo
})

ipcMain.handle('app:relaunch', () => {
  try {
    app.relaunch({ args: process.argv.slice(1) })
    app.exit(0)
    return true
  } catch (error) {
    console.error('[main] failed to relaunch app', error)
    return false
  }
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

      const filePath = result.filePaths[0]!
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

    const filePath = result.filePaths[0]!
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
      if (!extension || !base64Data) {
        throw new Error('无效的 data URI 内容')
      }
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

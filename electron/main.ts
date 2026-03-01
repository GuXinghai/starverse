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

import { app, dialog, ipcMain, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import Store from 'electron-store'
import { DbWorkerManager } from './db/workerManager'
import { registerDbBridge } from './ipc/dbBridge'
import { registerOpenRouterStreamBridge, cleanupOpenRouterStreams } from './ipc/openRouterStreamBridge'
import { registerInAppBrowserIpc } from './ipc/inappBrowserIpc'
import { registerIpc, validateCoreIpcRegistration } from './ipc/registerIpc'
import { validateStartupIpcRegistration } from './ipc/startupIpcAudit'
import { runStartupBackgroundJobs, wireDbEventsToRenderer } from './jobs/startupBackgroundJobs'
import { createInAppBrowserManager } from './services/inappBrowser'
import { createMainWindowLifecycle } from './windows/mainWindowLifecycle'
import {
  CURRENT_CONFIG_VERSION,
  migrateConfig,
  validateAndCleanConfig,
  checkTotalSize,
  checkConfigIntegrity,
} from './config/configSchema'
import { DB_SCHEMA_VERSION } from '../infra/db/schemaVersion'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nodeRequire = createRequire(import.meta.url)
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
  dbExp: {
    forceRebuildOnNextLaunch: false,
    rebuildOnSchemaMismatch: true,
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

type ResolvedAssetFile = Readonly<{
  path: string
  mime: string
}>

let assetProtocolRegistered = false

function isPathWithinRoot(filePath: string, rootPath: string): boolean {
  const rel = path.relative(rootPath, filePath)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function extractAssetIdFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'asset:') return null
    const hostId = parsed.hostname.trim()
    const pathId = parsed.pathname.replace(/^\/+/, '').trim()
    const id = hostId || pathId
    if (!id) return null
    if (!/^[a-zA-Z0-9._:-]+$/.test(id)) return null
    return id
  } catch {
    return null
  }
}

async function resolveAssetFileByUrl(rawUrl: string): Promise<ResolvedAssetFile | null> {
  const assetId = extractAssetIdFromUrl(rawUrl)
  if (!assetId) return null

  const dbPath = dbWorkerManager.getDatabasePath()
  if (!dbPath) return null
  const assetRoot = path.resolve(path.dirname(dbPath), 'assets', 'images')

  try {
    const row = (await dbWorkerManager.call('messageAsset.getById', { assetId })) as
      | { path?: unknown; mime?: unknown }
      | null
    if (!row || typeof row !== 'object') return null

    const filePath = path.resolve(String(row.path ?? '').trim())
    if (!filePath) return null
    if (!isPathWithinRoot(filePath, assetRoot)) {
      console.warn('[asset-protocol] blocked out-of-root asset path:', filePath)
      return null
    }
    if (!existsSync(filePath)) return null

    const mimeRaw = String(row.mime ?? '').trim().toLowerCase()
    const mime = mimeRaw.startsWith('image/') ? mimeRaw : 'application/octet-stream'
    return { path: filePath, mime }
  } catch (error) {
    console.warn('[asset-protocol] failed to resolve asset by id:', error)
    return null
  }
}

async function registerAssetProtocol() {
  if (assetProtocolRegistered) return
  await session.defaultSession.protocol.handle('asset', async (request) => {
    const resolved = await resolveAssetFileByUrl(request.url)
    if (!resolved) return new Response('Asset not found', { status: 404 })
    try {
      const bytes = await readFile(resolved.path)
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': resolved.mime,
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      })
    } catch (error) {
      console.warn('[asset-protocol] failed to read file:', resolved.path, error)
      return new Response('Asset read failed', { status: 500 })
    }
  })
  assetProtocolRegistered = true
  if (isDev) {
    try {
      const handled = await session.defaultSession.protocol.isProtocolHandled('asset')
      console.info(`[asset-protocol] scheme "asset" registered: ${handled}`)
    } catch (error) {
      console.warn('[asset-protocol] failed to verify scheme registration:', error)
    }
  }
}

// ========== In-App Browser Manager ==========
const inAppBrowserManager = createInAppBrowserManager()
void inAppBrowserManager

const mainWindowLifecycle = createMainWindowLifecycle({
  isDev,
  viteDevServerUrl: VITE_DEV_SERVER_URL,
  rendererDist: RENDERER_DIST,
  publicPath: process.env.VITE_PUBLIC ?? RENDERER_DIST,
  preloadPath: path.join(__dirname, 'preload.mjs'),
  onMainProcessMessage: (window) => {
    window.webContents.send('main-process-message', new Date().toLocaleString())
  },
})

function notifyMainWindow(channel: string, payload: unknown): void {
  const win = mainWindowLifecycle.getWindow()
  if (!win) return
  win.webContents.send(channel, payload)
}

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

type DbExpConfig = {
  forceRebuildOnNextLaunch?: unknown
  rebuildOnSchemaMismatch?: unknown
}

type DbRebuildDecision = {
  rebuilt: boolean
  reason: 'non_dev' | 'disabled' | 'missing_db' | 'schema_match' | 'force' | 'schema_probe_failed' | 'schema_mismatch'
  version: number | null
  deletedFiles?: string[]
}

function parseBooleanSwitch(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false
  return null
}

function readDbUserVersion(dbPath: string): { version: number | null; error?: string } {
  if (!existsSync(dbPath)) return { version: null }
  try {
    const BetterSqlite3Ctor = nodeRequire('better-sqlite3') as any
    const db = new BetterSqlite3Ctor(dbPath, { readonly: true, fileMustExist: true })
    try {
      const raw = db.pragma('user_version', { simple: true })
      const version = Number(raw)
      if (!Number.isInteger(version) || version < 0) {
        return { version: 0 }
      }
      return { version }
    } finally {
      db.close()
    }
  } catch (error) {
    return { version: null, error: String((error as any)?.message ?? error) }
  }
}

async function deleteDatabaseFilesForRebuild(dbPath: string): Promise<string[]> {
  const fs = await import('node:fs/promises')
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]
  const deleted: string[] = []

  const unlinkWithRetry = async (filePath: string, maxRetries = 5) => {
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        await fs.unlink(filePath)
        deleted.push(filePath)
        return
      } catch (error: any) {
        if (error?.code === 'ENOENT') return
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 50 * attempt))
          continue
        }
        throw error
      }
    }
  }

  for (const file of files) {
    await unlinkWithRetry(file)
  }
  return deleted
}

async function maybeRebuildDatabaseAtStartup(dbPath: string): Promise<DbRebuildDecision> {
  if (!isDev) {
    return { rebuilt: false, reason: 'non_dev', version: null }
  }

  const dbExp = (store.get('dbExp') as DbExpConfig | undefined) ?? {}
  const envForce = parseBooleanSwitch(process.env.SV_DB_FORCE_REBUILD)
  const envMismatch = parseBooleanSwitch(process.env.SV_DB_REBUILD_ON_SCHEMA_MISMATCH)
  const forceRebuild = envForce ?? (dbExp.forceRebuildOnNextLaunch === true)
  const rebuildOnMismatch = envMismatch ?? (dbExp.rebuildOnSchemaMismatch !== false)

  if (!forceRebuild && !rebuildOnMismatch) {
    return { rebuilt: false, reason: 'disabled', version: null }
  }

  const probe = readDbUserVersion(dbPath)
  const shouldRebuildByMismatch =
    rebuildOnMismatch &&
    (probe.error ? true : probe.version !== null && probe.version !== DB_SCHEMA_VERSION)

  if (!forceRebuild && !shouldRebuildByMismatch) {
    const reason = probe.version === null ? 'missing_db' : 'schema_match'
    return { rebuilt: false, reason, version: probe.version }
  }

  const trigger = forceRebuild ? 'force' : probe.error ? 'schema_probe_failed' : 'schema_mismatch'
  const deletedFiles = await deleteDatabaseFilesForRebuild(dbPath)
  console.warn('[db-rebuild] Development rebuild completed', {
    trigger,
    dbPath,
    expectedSchemaVersion: DB_SCHEMA_VERSION,
    existingSchemaVersion: probe.version,
    deletedFiles,
  })

  if (dbExp.forceRebuildOnNextLaunch === true && envForce !== true) {
    store.set('dbExp.forceRebuildOnNextLaunch', false)
  }

  return { rebuilt: true, reason: trigger, version: probe.version, deletedFiles }
}

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
    nodeRequire('better-sqlite3')
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
  const dbExistedBeforeStartup = existsSync(dbPath)
  try {
    const rebuildDecision = await maybeRebuildDatabaseAtStartup(dbPath)
    const stampSchemaVersion = rebuildDecision.rebuilt || !dbExistedBeforeStartup
    await dbWorkerManager.start(dbPath, {
      stampSchemaVersion,
      startupRebuildReason: rebuildDecision.reason,
    })
  } catch (error) {
    console.error('[main] failed to start DB worker', error)
    dialog.showErrorBox('Database initialization failed', `DB worker failed to start.\n\n${(error as any)?.message ?? String(error)}`)
    throw error
  }
}

function registerCoreIpcHandlers(): string[] {
  const registration = registerIpc({
    registerInvoke: (channel, handler) => {
      ipcMain.handle(channel, handler as (...args: any[]) => unknown)
    },
    store,
    isDev,
    netExpRuntimeInfo,
    migrateAndCleanupConfig: () => migrateAndCleanupConfig(store),
    performConfigSizeCheck: (context) => performConfigSizeCheck(store, context),
    resolveAssetFileByUrl,
  })

  const validation = validateCoreIpcRegistration(registration.channels)
  if (!validation.ok) {
    throw new Error(
      `[ipc] core registration mismatch: expected=${validation.expectedCount}, actual=${validation.actualCount}, missing=${validation.missing.join(',')}, unexpected=${validation.unexpected.join(',')}`
    )
  }

  return registration.channels
}

function registerAllIpcHandlers(): string[] {
  const channels = [
    ...registerDbBridge(dbWorkerManager),
    ...registerOpenRouterStreamBridge(),
    ...registerCoreIpcHandlers(),
    ...registerInAppBrowserIpc({
      registerInvoke: (channel, handler) => {
        ipcMain.handle(channel, handler as (...args: any[]) => unknown)
      },
      manager: inAppBrowserManager,
    }),
  ]

  const validation = validateStartupIpcRegistration(channels)
  if (!validation.ok) {
    throw new Error(
      `[ipc] startup registration mismatch: expected=${validation.expectedCount}, actual=${validation.actualCount}, missing=${validation.missing.join(',')}, unexpected=${validation.unexpected.join(',')}, missingCritical=${validation.missingCritical.join(',')}`
    )
  }

  return [...new Set(channels)]
}

mainWindowLifecycle.registerAppLifecycleHandlers()

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
  if (mainWindowLifecycle.getWindow()) {
    console.log('[main] 通知渲染进程保存数据...')
    mainWindowLifecycle.clearWindowListeners()
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
    await ensureDbReady()
    await registerAssetProtocol()
    registerAllIpcHandlers()
    const startupJobsResult = await runStartupBackgroundJobs({ store, dbWorkerManager })

    // 注册事件转发：Worker 事件 → Renderer
    wireDbEventsToRenderer({
      dbWorkerManager,
      notifyRenderer: notifyMainWindow,
    })

    mainWindowLifecycle.createWindow()

    for (const notification of startupJobsResult.postWindowNotifications) {
      try {
        notifyMainWindow(notification.channel, notification.payload)
      } catch (error) {
        console.warn('[startup-jobs] failed to notify renderer (non-fatal):', error)
      }
    }
  })
  .catch((error) => {
    console.error('[main] failed to initialize application', error)
    app.quit()
  })

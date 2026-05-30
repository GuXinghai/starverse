/**
 * 数据库 Worker 线程管理器
 * 
 * ========== 核心职责 ==========
 * 1. 启动和管理 SQLite Worker 线程
 * 2. 处理主线程与 Worker 线程的双向通信
 * 3. 跟踪待处理的请求，匹配请求-响应
 * 4. 处理 Worker 错误和重启
 * 
 * ========== 架构设计 ==========
 * 线程模型:
 * - 主线程 (Electron Main Process): UI 和 IPC 处理
 * - Worker 线程 (Node.js Worker Thread): SQLite 操作
 * 
 * 通信协议:
 * 请求 (WorkerRequestMessage):
 *   { id: UUID, method: 'convo.save', params: {...} }
 * 响应 (WorkerResponseMessage):
 *   { id: UUID, ok: true, result: {...} }
 *   或 { id: UUID, ok: false, error: {...} }
 * 
 * 请求-响应匹配:
 * - 使用 UUID 匹配请求和响应
 * - pending Map 存储所有未完成的 Promise
 * - Worker 返回响应时，resolve/reject 对应的 Promise
 * 
 * ========== 错误处理 ==========
 * Worker 崩溃场景:
 * 1. Schema 初始化失败 → 启动失败，抛出错误
 * 2. SQL 语法错误 → 返回 DbWorkerError，Worker 继续运行
 * 3. Worker 线程崩溃 → rejectAll，需要重启
 * 
 * 🔒 线程安全:
 * - Worker 线程独立运行，不会阻塞 Electron 主线程
 * - 所有 SQLite 操作在 Worker 中串行执行，避免竞态条件
 * 
 * @module electron/db/workerManager
 */

import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type {
  DbMethod,
  WorkerRequestMessage,
  WorkerResponseMessage,
  DbErrorCode,
  DbEvent,
  WorkerEventMessage,
  ElectronConversionWorkerRequestMessage,
  WorkerInitConfig,
} from '../../infra/db/types'
import { DbWorkerError } from '../../infra/db/errors'
import { failClosedElectronConversionResponse } from '../../infra/files/electronConversionServiceContract'
import type { ElectronConversionBridge } from '../../infra/files/electronConversionBridge'

/**
 * 待处理的请求
 * 
 * 存储在 pending Map 中，等待 Worker 返回响应。
 */
type PendingCall = {
  resolve: (value: unknown) => void  // 请求成功时调用
  reject: (error: unknown) => void   // 请求失败时调用
  timer?: NodeJS.Timeout             // 请求超时计时器
  enqueuedAt: number                 // 入队时间，用于统计
}

/**
 * Worker 管理器配置选项
 */
type ManagerOptions = {
  workerScriptPath: string   // Worker 脚本的绝对路径 (db/worker.cjs)
  schemaPath?: string        // 数据库 Schema SQL 脚本路径
  logSlowQueryMs?: number    // 慢查询日志阈值（毫秒）
  logDirectory?: string      // 慢查询日志目录
  callTimeoutMs?: number     // 单次调用超时时间（毫秒），0/undefined 表示不超时
  restartOnCrash?: boolean   // Worker 崩溃时是否自动重启
  maxRestartAttempts?: number  // 自动重启最大次数
  restartBackoffMs?: number    // 自动重启初始退避时间
  maxPending?: number          // 允许的最大挂起请求数（超出时拒绝）
  electronConversionBridge?: ElectronConversionBridge
}

type WorkerInitFlags = Pick<WorkerInitConfig, 'stampSchemaVersion' | 'startupRebuildReason' | 'isProduction'>

/**
 * 数据库 Worker 线程管理器
 * 
 * 负责启动、停止和与 Worker 线程通信。
 * 
 * 生命周期:
 * 1. new DbWorkerManager(options) - 创建实例（未启动）
 * 2. await manager.start(dbPath) - 启动 Worker 线程
 * 3. await manager.call(method, params) - 执行数据库操作
 * 4. await manager.stop() - 停止 Worker 线程
 * 
 * 状态管理:
 * - worker: Worker 实例，undefined 表示未启动
 * - startPromise: 防止重复启动
 * - pending: 跟踪所有未完成的请求
 */
export class DbWorkerManager {
  private worker?: Worker                        // Worker 线程实例
  private startPromise?: Promise<void>           // 启动 Promise，防止并发启动
  private pending = new Map<string, PendingCall>()  // 待处理的请求 Map
  private dbPath?: string                        // 数据库文件路径
  private restartAttempts = 0                    // 已重启次数
  private restartTimer?: NodeJS.Timeout          // 重启计时器
  private stopping = false                       // 标记是否为主动停止
  private defaultMaxPending = 400
  private eventListeners = new Set<(event: DbEvent) => void>()  // 事件监听器
  private workerInitFlags: WorkerInitFlags = {}

  constructor(private options: ManagerOptions) {}

  /**
   * 启动 Worker 线程并初始化数据库
   * 
   * 执行流程:
   * 1. 检查是否已启动，避免重复启动
   * 2. 创建 Worker 实例，传入 workerData:
   *    - dbPath: 数据库文件路径
   *    - schemaPath: Schema SQL 脚本路径
   *    - logSlowQueryMs: 慢查询阈值
   * 3. 注册事件监听器:
   *    - 'online': Worker 就绪，Schema 初始化完成
   *    - 'error': Worker 启动失败
   *    - 'message': 接收 Worker 返回的响应
   *    - 'exit': Worker 退出（正常或崩溃）
   * 4. 等待 'online' 事件，表示 Worker 就绪
   * 
   * @param dbPath - SQLite 数据库文件路径
   * @throws {Error} Worker 启动失败或 Schema 初始化失败
   * 
   * 🔒 并发安全:
   * - 使用 startPromise 防止多次调用 start()
   * - 如果已启动，直接返回
   * - 如果正在启动，等待现有的 startPromise
   */
  async start(dbPath: string, initFlags?: WorkerInitFlags) {
    if (this.worker) return
    this.workerInitFlags = initFlags ?? {}
    if (!this.startPromise) {
      this.startPromise = new Promise((resolve, reject) => {
        try {
          const scriptPath = path.resolve(this.options.workerScriptPath)
          const worker = new Worker(scriptPath, {
            workerData: {
              dbPath,
              schemaPath: this.options.schemaPath,
              logSlowQueryMs: this.options.logSlowQueryMs,
              logDirectory: this.options.logDirectory,
              stampSchemaVersion: this.workerInitFlags.stampSchemaVersion,
              startupRebuildReason: this.workerInitFlags.startupRebuildReason,
              isProduction: this.workerInitFlags.isProduction,
            }
          })
          this.dbPath = dbPath
          this.worker = worker
          this.stopping = false
            const cleanupStart = (error?: Error) => {
              // 只清理启动阶段的 online 监听，保留 error/exit 监听用于运行期错误处理
              worker.removeAllListeners('online')
              if (error) {
                reject(error)
              } else {
                resolve()
              }
            }

          worker.once('online', () => {
            console.log(`[workerManager] Worker 已上线, threadId: ${worker.threadId}`)
            this.restartAttempts = 0
            this.clearRestartTimer()
            cleanupStart()
          })
          worker.once('error', (error) => {
            console.error(`[workerManager] Worker 错误事件:`)
            console.error(`[workerManager] - error 类型: ${typeof error}`)
            console.error(`[workerManager] - error.constructor.name: ${error?.constructor?.name}`)
            console.error(`[workerManager] - error.code: ${(error as any)?.code}`)
            console.error(`[workerManager] - error.message: ${(error as any)?.message}`)
            console.error(`[workerManager] - error.stack: ${(error as any)?.stack}`)
            console.error(`[workerManager] - JSON.stringify:`, JSON.stringify(error, null, 2))
            cleanupStart(error as Error)
            this.rejectAll(error)
            this.worker = undefined
            this.startPromise = undefined
          })
          worker.on('message', (message: WorkerResponseMessage | WorkerEventMessage | ElectronConversionWorkerRequestMessage) => this.handleMessage(message))
          worker.on('exit', (code) => {
            const wasStopping = this.stopping
            this.stopping = false
            this.worker = undefined
            this.startPromise = undefined
            if (code !== 0) {
              const error = new DbWorkerError('ERR_UNAVAILABLE', `DB worker exited with code ${code}`)
              this.rejectAll(error)
              if (!wasStopping) {
                this.scheduleRestart()
              }
            } else if (!wasStopping) {
              if (this.pending.size > 0) {
                this.rejectAll(new DbWorkerError('ERR_UNAVAILABLE', 'DB worker exited'))
              }
              this.scheduleRestart()
            }
          })
        } catch (error) {
          this.startPromise = undefined
          reject(error)
        }
      })
    }
    await this.startPromise
  }

  /**
   * 停止 Worker 线程
   * 
   * 清理步骤:
   * 1. 终止 Worker 线程（worker.terminate()）
   * 2. 拒绝所有挂起请求（避免调用方永久等待）
   * 3. 重置 startPromise
   */
  async stop() {
    if (!this.worker) return
    this.stopping = true
    if (this.pending.size > 0) {
      this.rejectAll(new DbWorkerError('ERR_UNAVAILABLE', 'DB worker stopped'))
    }
    await this.worker.terminate()
    this.worker = undefined
    this.startPromise = undefined
    this.clearRestartTimer()
    this.restartAttempts = 0
    this.stopping = false
  }

  /**
   * 重置数据库（dev-only）
   * 
   * 🔒 双重安全保险：
   * 1. 检查 NODE_ENV !== 'production'（第一道门）
   * 2. 检查 app.isPackaged === false（第二道门，如可用）
   * 
   * 仅在 development 环境中可用，用于开发调试时快速清空数据库。
   * 
   * 执行流程:
   * 1. 检查环境（双保险）
   * 2. 停止当前 Worker（确保 SQLite 连接关闭）
   * 3. 等待短暂时间确保句柄释放
   * 4. 删除数据库文件（带重试机制处理 Windows 文件锁）
   * 5. 重新启动 Worker（会自动创建新库并初始化 schema + Inbox）
   * 
   * @throws {DbWorkerError} 非开发环境或操作失败
   */
  async reset(): Promise<{ ok: true }> {
    const fs = await import('node:fs/promises')
    
    // 1. 双保险检查 - 第一道门：NODE_ENV
    const nodeEnv = process.env.NODE_ENV
    const isProduction = nodeEnv === 'production'
    if (isProduction) {
      throw new DbWorkerError('ERR_FORBIDDEN', 'db.reset is forbidden in production environment')
    }
    
    // 2. 双保险检查 - 第二道门：app.isPackaged（如可用）
    try {
      const { app } = await import('electron')
      if (app.isPackaged) {
        throw new DbWorkerError('ERR_FORBIDDEN', 'db.reset is forbidden in packaged app')
      }
    } catch {
      // electron 模块不可用时跳过（如单元测试环境）
    }
    
    // 3. 获取数据库路径
    const dbPath = this.dbPath
    if (!dbPath) {
      throw new DbWorkerError('ERR_UNAVAILABLE', 'Database path not available')
    }
    
    console.log('[workerManager] Resetting database:', dbPath)
    
    // 4. 停止 Worker（确保 SQLite 连接关闭）
    await this.stop()
    
    // 5. 等待短暂时间确保句柄释放（Windows 需要）
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // 6. 删除数据库文件（带重试机制）
    const filesToDelete = [
      dbPath,
      `${dbPath}-wal`,
      `${dbPath}-shm`,
      `${dbPath}-journal`,
    ]
    
    const deleteWithRetry = async (file: string, maxRetries = 5) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await fs.unlink(file)
          console.log(`[workerManager] Deleted: ${file}`)
          return
        } catch (err: any) {
          if (err.code === 'ENOENT') return // 文件不存在，无需删除
          if (attempt < maxRetries) {
            // Windows 文件锁可能需要多次重试
            await new Promise(resolve => setTimeout(resolve, 50 * attempt))
          } else {
            console.warn(`[workerManager] Failed to delete ${file} after ${maxRetries} attempts:`, err.message)
          }
        }
      }
    }
    
    for (const file of filesToDelete) {
      await deleteWithRetry(file)
    }
    
    // 7. 重新启动 Worker（会自动创建新库）
    await this.start(dbPath, { stampSchemaVersion: true, startupRebuildReason: 'manual_reset' })
    
    console.log('[workerManager] Database reset complete')
    return { ok: true }
  }

  /**
   * 调用 Worker 执行数据库操作
   * 
   * 执行流程:
   * 1. 检查 Worker 是否已启动
   * 2. 生成唯一的请求 ID (UUID)
   * 3. 构造请求 Payload
   * 4. 创建 Promise 并存储到 pending Map
   * 5. 发送消息给 Worker
   * 6. 等待 Worker 返回响应（通过 handleMessage 处理）
   * 
   * @param method - 数据库方法名（如 'convo.save'）
   * @param params - 方法参数
   * @returns Promise - 返回 Worker 执行结果
   * @throws {DbWorkerError} Worker 未初始化或执行失败
   * 
   * ⚡ 性能:
   * - 异步非阻塞，多个请求可并发
   * - Worker 中串行执行，保证数据一致性
   * 
   * 🔒 类型安全:
   * - method 只能是预定义的 DbMethod
   * - params 会通过 structuredClone 传递，支持复杂对象
   */
  async call(method: DbMethod, params?: unknown) {
    if (!this.worker) {
      const dbPath = this.dbPath
      if (dbPath && !this.stopping) {
        try {
          await this.start(dbPath)
        } catch (error) {
          throw new DbWorkerError('ERR_UNAVAILABLE', 'DB worker not initialized', {
            reason: 'start_failed',
            message: (error as any)?.message ?? String(error),
          })
        }
      }
      if (!this.worker) {
        throw new DbWorkerError('ERR_UNAVAILABLE', 'DB worker not initialized')
      }
    }
    const maxPending = this.options.maxPending ?? this.defaultMaxPending
    if (maxPending > 0 && this.pending.size >= maxPending) {
      throw new DbWorkerError('ERR_UNAVAILABLE', 'DB worker queue is busy')
    }
    const id = randomUUID()
    const payload: WorkerRequestMessage = { id, method, params }
    const timeoutMs = this.options.callTimeoutMs ?? 20000

    return new Promise((resolve, reject) => {
      const onTimeout = () => {
        this.pending.delete(id)
        reject(new DbWorkerError('ERR_UNAVAILABLE', `DB worker call timed out: ${method}`))
      }
      const timer = timeoutMs > 0 ? setTimeout(onTimeout, timeoutMs) : undefined

      this.pending.set(id, { resolve, reject, timer, enqueuedAt: Date.now() })
      this.worker!.postMessage(payload)
    })
  }

  /**
   * 暴露当前队列统计信息
   */
  getStats() {
    let oldestPendingMs: number | null = null
    const now = Date.now()
    for (const pending of this.pending.values()) {
      const age = now - pending.enqueuedAt
      if (oldestPendingMs === null || age > oldestPendingMs) {
        oldestPendingMs = age
      }
    }
    return {
      pending: this.pending.size,
      oldestPendingMs,
      restartAttempts: this.restartAttempts,
      isOnline: Boolean(this.worker),
      workerThreadId: this.worker?.threadId
    }
  }

  /**
   * 获取数据库文件路径
   * 
   * @returns 数据库路径，未启动时返回 undefined
   */
  getDatabasePath() {
    return this.dbPath
  }

  /**
   * 处理 Worker 返回的响应消息
   * 
   * 执行流程:
   * 1. 根据 message.id 从 pending Map 中查找对应的 Promise
   * 2. 如果找不到，说明是重复响应或已超时，忽略
   * 3. 如果 message.ok = true，调用 resolve(result)
   * 4. 如果 message.ok = false，构造 DbWorkerError 并调用 reject(error)
   * 5. 从 pending Map 中删除该请求
   * 
   * @param message - Worker 返回的响应消息
   * 
   * 🔒 错误处理:
   * - Worker 返回的错误会被包装为 DbWorkerError
   * - 错误码 (errorCode) 用于区分错误类型
   */
  private handleMessage(message: WorkerResponseMessage | WorkerEventMessage | ElectronConversionWorkerRequestMessage) {
    if ('type' in message && message.type === 'electron-conversion-request') {
      this.handleElectronConversionRequest(message)
      return
    }
    // 处理事件消息
    if ('type' in message && message.type === 'event') {
      const eventMessage = message as WorkerEventMessage
      this.broadcastEvent(eventMessage.event)
      return
    }

    // 处理响应消息
    const responseMessage = message as WorkerResponseMessage
    const pending = this.pending.get(responseMessage.id)
    if (!pending) return
    this.pending.delete(responseMessage.id)
    if (pending.timer) {
      clearTimeout(pending.timer)
    }

    if (responseMessage.ok) {
      pending.resolve(responseMessage.result)
      return
    }

    const errorCode = (responseMessage.error?.code as DbErrorCode | undefined) ?? 'ERR_INTERNAL'
    const error = new DbWorkerError(errorCode, responseMessage.error?.message ?? 'DB worker error', responseMessage.error?.details)
    pending.reject(error)
  }

  private handleElectronConversionRequest(message: ElectronConversionWorkerRequestMessage) {
    const worker = this.worker
    const bridge = this.options.electronConversionBridge
    const fallback = () => failClosedElectronConversionResponse({
      requestId: message.request?.requestId ?? message.id,
      conversionKind: message.request?.conversionKind ?? 'unknown-conversion',
      status: 'unavailable',
      code: 'electron_conversion_service_unavailable',
      message: 'Electron conversion service is unavailable.',
    })
    Promise.resolve(bridge ? bridge.convert(message.request) : fallback())
      .then((response) => {
        worker?.postMessage({
          type: 'electron-conversion-response',
          id: message.id,
          response,
        })
      })
      .catch((error) => {
        worker?.postMessage({
          type: 'electron-conversion-response',
          id: message.id,
          response: failClosedElectronConversionResponse({
            requestId: message.request?.requestId ?? message.id,
            conversionKind: message.request?.conversionKind ?? 'unknown-conversion',
            status: 'failed',
            code: 'electron_conversion_blocked',
            message: error instanceof Error ? error.message : String(error),
          }),
        })
      })
  }

  /**
   * 广播事件到所有监听器
   */
  private broadcastEvent(event: DbEvent) {
    for (const listener of this.eventListeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('[workerManager] Event listener error:', err)
      }
    }
  }

  /**
   * 注册事件监听器
   * @returns 取消订阅函数
   */
  onEvent(listener: (event: DbEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /**
   * 拒绝所有待处理的请求
   * 
   * 使用场景:
   * - Worker 线程崩溃时
   * - Worker 启动失败时
   * - 应用退出时
   * 
   * 执行流程:
   * 1. 遍历 pending Map 中的所有 Promise
   * 2. 调用每个 Promise 的 reject(error)
   * 3. 清空 pending Map
   * 
   * @param error - 要抛出的错误对象
   * 
   * ⚠️ 注意:
   * - 所有等待响应的请求都会失败
   * - 调用者需要捕获这些错误并处理
   */
  private rejectAll(error: unknown) {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  /**
   * 清理并取消自动重启计时器
   */
  private clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = undefined
    }
  }

  /**
   * 在 Worker 异常退出时触发自动重启（带退避）
   */
  private scheduleRestart() {
    if (this.stopping) return
    if (this.options.restartOnCrash === false) return
    if (!this.dbPath) return

    const maxAttempts = this.options.maxRestartAttempts ?? 3
    if (this.restartAttempts >= maxAttempts) return

    const backoff = this.options.restartBackoffMs ?? 500
    const delay = Math.min(backoff * Math.pow(2, this.restartAttempts), 10000)
    this.restartAttempts += 1
    this.clearRestartTimer()

    this.restartTimer = setTimeout(() => {
      this.start(this.dbPath!, this.workerInitFlags).catch((error) => {
        console.error('[DbWorkerManager] failed to restart worker', error)
      })
    }, delay)
  }
}

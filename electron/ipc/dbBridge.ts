/**
 * 数据库 IPC 桥接层
 * 
 * ========== 核心职责 ==========
 * 1. 将渲染进程的数据库请求转发到 Worker 线程
 * 2. 提供安全的 IPC 接口，防止未授权访问
 * 3. 验证请求格式和方法名
 * 
 * ========== 架构设计 ==========
 * 数据流转链路:
 *   渲染进程 (Vue)
 *   ↓ IPC (ipcRenderer.invoke)
 *   preload.ts (window.electron.db.invoke)
 *   ↓ IPC Channel: 'db:invoke'
 *   主进程 dbBridge (registerDbBridge)
 *   ↓ 白名单验证
 *   DbWorkerManager.call(method, params)
 *   ↓ Worker Thread
 *   SQLite Database
 * 
 * ========== 安全机制 ==========
 * 白名单验证:
 * - 只允许预定义的数据库方法
 * - 阻止恶意渲染进程执行任意 SQL
 * - 防止 SQL 注入攻击
 * 
 * Payload 验证:
 * - 检查 payload 结构是否合法
 * - 检查 method 是否在白名单中
 * 
 * @module electron/ipc/dbBridge
 */

import { ipcMain } from 'electron'
import type { DbMethod } from '../../infra/db/types'
import { DbWorkerError } from '../../infra/db/errors'
import { DbWorkerManager } from '../db/workerManager'

/**
 * 数据库方法白名单
 * 
 * 只有这些方法可以通过 IPC 调用。
 * 
 * 方法分类:
 * - health.*: 健康检查
 * - project.*: 项目管理 (CRUD)
 * - convo.*: 对话管理 (CRUD)
 * - message.*: 消息管理 (附加、列表、替换)
 * - search.*: 全文搜索
 * - maintenance.*: 维护操作 (优化、清理)
 * 
 * 🔒 安全考虑:
 * - 不包含原始 SQL 执行方法
 * - 所有方法均经过参数验证
 * - 防止删除系统表或修改 Schema
 * 
 * ⚠️ 添加新方法时:
 * 1. 在 infra/db/types.ts 中定义 DbMethod 类型
 * 2. 在 Worker 中实现对应的处理函数
 * 3. 添加到此白名单
 * 4. 更新 src/services/db/index.ts 中的封装
 */
const allowedMethods: DbMethod[] = [
  // Health
  'health.ping',
  'health.stats',
  
  // Project Management
  'project.create',
  'project.save',
  'project.list',
  'project.delete',
  'project.findById',
  'project.findByName',
  'project.countConversations',
  
  // Conversation Management
  'convo.create',
  'convo.save',
  'convo.saveWithMessages',
  'convo.list',
  'convo.delete',
  'convo.deleteMany',
  'convo.archive',
  'convo.archiveMany',
  'convo.restore',
  'convo.setProject',
  'convo.setProjectMany',
  'convo.listArchived',
  
  // Message Management
  'message.append',
  'message.appendDelta',
  'message.setStatus',
  'message.list',
  'message.replace',

  // Branching (Phase 4+)
  'branch.ensureDefault',
  'branch.list',
  'branch.createFromMessage',
  'branch.delete',
  'branch.beginTurn',
  'branch.switchCandidate',
  'branch.regenerateFromQuestion',
  'branch.getPathMessages',
  'branch.getCandidates',
  'branch.getEffectiveFilters',
  'branch.setHead',
  'branchChoice.set',
  'branchAnswerHide.set',
  'branch.retryReplaceAnswer',
  'branchFilter.set',
  'branchFilter.clear',
  'context.buildForBranch',
  'context.getRenderableTurns',
  
  // Search
  'search.fulltext',
  
  // Maintenance
  'maintenance.optimize',
  
  // Usage Statistics
  'usage.log',
  'usage.getProjectStats',
  'usage.getConvoStats',
  'usage.getModelStats',
  'usage.getDateRangeStats',
  'usage.aggregate',
  'usage.drillDown',
  'usage.reasoningTrend',
  'usage.reasoningModelComparison',
  
  // Model Data Management
  // Model Catalog (Snapshot Sync)
  'modelCatalog.syncSnapshot',
  'modelCatalog.list',

  // Reasoning Model Index
  'reasoningIndex.syncFromCatalog',
  'reasoningIndex.list',

  // Settings
  'settings.getOpenRouterProviderRequireParameters',
  'settings.setOpenRouterProviderRequireParameters',
  
  // Preferences
  'prefs.save',
  'prefs.list',
  'prefs.delete',
  'prefs.default'
]

/**
 * IPC 调用 Payload 结构
 * 
 * 渲染进程必须按此格式发送请求。
 * 
 * @example
 * ```typescript
 * const payload: InvokePayload = {
 *   method: 'convo.save',
 *   params: {
 *     id: 'xxx',
 *     title: 'Hello',
 *     meta: {...}
 *   }
 * }
 * await ipcRenderer.invoke('db:invoke', payload)
 * ```
 */
type InvokePayload = {
  method: DbMethod   // 数据库方法名（必须在白名单中）
  params?: unknown   // 方法参数（可选）
}

/**
 * 注册数据库 IPC 桥接
 * 
 * 初始化 IPC 通道 'db:invoke'，将渲染进程请求转发到 DbWorkerManager。
 * 
 * 执行流程:
 * 1. 注册 ipcMain.handle('db:invoke', handler)
 * 2. 验证 payload 结构（非 null、是对象）
 * 3. 检查 method 是否在白名单中
 * 4. 调用 manager.call(method, params)
 * 5. 返回结果给渲染进程
 * 
 * @param manager - DbWorkerManager 实例
 * 
 * 🔒 安全特性:
 * - Payload 验证：拒绝非法请求
 * - 白名单检查：防止调用未授权方法
 * - 错误封装：所有错误都被包装为 DbWorkerError
 * 
 * ⚡ 性能:
 * - 异步非阻塞，支持并发请求
 * - 数据通过 structuredClone 传递，支持复杂对象
 * 
 * @example
 * ```typescript
 * // 在 electron/main.ts 中调用
 * await ensureDbReady()
 * registerDbBridge(dbWorkerManager)  // 注册 IPC 处理器
 * createWindow()
 * ```
 */
export const registerDbBridge = (manager: DbWorkerManager) => {
  // 创建白名单 Set，用于高效查找
  const allowSet = new Set<DbMethod>(allowedMethods)

  const toIpcError = (error: unknown): Error => {
    // Electron's ipcMain.handle() only reliably transports built-in Error instances.
    // If we throw non-Error values (or custom error subclasses), the renderer often sees:
    // "Error invoking remote method ...: [object Object]"
    if (error instanceof Error && error.constructor === Error) return error

    if (error instanceof DbWorkerError) {
      const e = new Error(error.message)
      e.name = 'DbWorkerError'
      ;(e as any).code = error.code
      ;(e as any).details = error.details
      return e
    }

    if (error instanceof Error) {
      const e = new Error(error.message)
      e.name = error.name || 'Error'
      ;(e as any).stack = error.stack
      return e
    }

    const message = typeof error === 'string' ? error : (() => {
      try {
        return JSON.stringify(error)
      } catch {
        return String(error)
      }
    })()
    return new Error(message)
  }

  /**
   * IPC Handler: db:invoke
   * 
   * 处理渲染进程的数据库请求。
   * 
   * @param _event - IPC 事件对象（未使用）
   * @param payload - 请求 Payload
   * @returns Promise - 数据库操作结果
   * @throws {DbWorkerError} Payload 验证失败或方法不允许
   */
  ipcMain.handle('db:invoke', async (_event, payload: InvokePayload) => {
    try {
      // ========== 步骤 1: Payload 验证 ==========
      if (!payload || typeof payload !== 'object') {
        throw new DbWorkerError('ERR_VALIDATION', 'Invalid DB IPC payload')
      }

      // ========== 步骤 2: 白名单检查 ==========
      if (!allowSet.has(payload.method)) {
        throw new DbWorkerError('ERR_NOT_FOUND', `Method not allowed: ${payload.method}`)
      }

      if (payload.method === 'health.stats') {
        return manager.getStats()
      }

      console.log(`[dbBridge] 调用方法: ${payload.method}, 参数:`, payload.params)

      // ========== 步骤 3: 转发给 Worker ==========
      return await manager.call(payload.method, payload.params)
    } catch (error) {
      console.error(`[dbBridge] 调用失败: ${payload?.method}`, error)
      console.error(`[dbBridge] 错误类型: ${error?.constructor?.name}`)
      console.error(`[dbBridge] 错误堆栈:`, (error as Error)?.stack)
      
      // 尝试序列化错误以查看传递给渲染进程的内容
      try {
        const serialized = JSON.stringify(error)
        console.error(`[dbBridge] 序列化后的错误:`, serialized)
      } catch (serializeError) {
        console.error(`[dbBridge] 错误无法序列化:`, serializeError)
      }
      
      throw toIpcError(error)
    }
  })
}

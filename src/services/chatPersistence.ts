/**
 * 聊天数据持久化服务
 * 
 * ========== 核心职责 ==========
 * 1. 将 chatStore 的内存状态（ConversationSnapshot）序列化到 SQLite
 * 2. 从 SQLite 加载对话快照并恢复分支树结构
 * 3. 处理 Vue Proxy 包装，确保数据可通过 IPC structuredClone 传递
 * 
 * ========== 数据流转换链 ==========
 * 保存流程:
 *   chatStore (Vue Reactive)
 *   ↓ serializeTree
 *   ConversationSnapshot (Map → Array)
 *   ↓ deepToRaw
 *   Plain JavaScript Object
 *   ↓ IPC (structuredClone)
 *   主进程 DbWorkerManager
 *   ↓ Worker 线程
 *   SQLite Database
 * 
 * 加载流程:
 *   SQLite Database
 *   ↓ Worker 线程
 *   Plain JavaScript Object
 *   ↓ IPC (structuredClone)
 *   ConvoRecord
 *   ↓ restoreTree
 *   ConversationSnapshot (Array → Map)
 *   ↓ chatStore
 *   Vue Reactive State
 * 
 * ========== 分支树序列化格式 ==========
 * 运行时格式 (ConversationTree):
 *   { branches: Map<string, Branch>, rootBranchIds: string[], currentPath: string[] }
 * 
 * 序列化格式 (SerializedTree):
 *   { branches: [[key, value], ...], rootBranchIds: string[], currentPath: string[] }
 * 
 * ========== 数据库表结构 ==========
 * conversations 表:
 *   - id, title, projectId, createdAt, updatedAt
 *   - meta (JSON): 存储完整的分支树、模型配置、草稿等
 * 
 * messages 表:
 *   - convoId, seq, role, body, createdAt
 *   - meta (JSON): branchId, versionId, metadata
 *   - 用于全文搜索 (FTS)，只存储当前路径的消息
 * 
 * ⚠️ 重要设计决策:
 * - conversations.meta 存储完整树，是唯一真实数据源
 * - messages 表只是搜索索引，每次保存都全量替换
 * 
 * @module services/chatPersistence
 */

import { toRaw } from 'vue'
import { dbService } from './db'
import type { ConvoRecord, MessageSnapshotPayload } from './db/types'
import { createEmptyTree, restoreTree, serializeTree, getCurrentPathMessages } from '../stores/branchTreeHelpers'
import { extractTextFromMessage, type ConversationTree, type ReasoningPreference, type WebSearchLevel } from '../types/chat'
import { sanitizeMessageMetadata } from '../utils/ipcSanitizer.js'
import {
  DEFAULT_CONVERSATION_STATUS,
  normalizeConversationStatus,
  normalizeConversationTags
} from '../types/conversation'
import type { ConversationStatus } from '../types/conversation'

/**
 * 调试日志开关
 * 
 * 启用方式: 设置环境变量 VITE_DEBUG_PERSISTENCE=true
 * 用于追踪数据序列化/反序列化过程，诊断 Proxy 问题
 */
const DEBUG_PERSISTENCE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEBUG_PERSISTENCE === 'true'

const debugLog = (...args: any[]) => {
  if (DEBUG_PERSISTENCE) {
    console.log(...args)
  }
}

/**
 * 对话快照数据结构
 * 
 * 这是 chatStore 与 SQLite 之间的数据交换格式。
 * 
 * 字段说明:
 * @property {string} id - 对话唯一标识符 (UUID)
 * @property {string} title - 对话标题（自动生成或用户修改）
 * @property {string | null} projectId - 所属项目 ID，无项目时为 null
 * @property {ConversationTree | SerializedTree} tree - 分支树（运行时为 Map，持久化时为 Array）
 * @property {string} model - 当前使用的 AI 模型 ID
 * @property {string} draft - 用户输入框草稿
 * @property {number} createdAt - 创建时间戳 (Unix timestamp)
 * @property {number} updatedAt - 最后更新时间戳
 * @property {boolean} webSearchEnabled - 是否启用网络搜索功能
 * @property {WebSearchLevel} webSearchLevel - 搜索深度 ('quick' | 'normal' | 'deep')
 * @property {ReasoningPreference} reasoningPreference - 推理模式配置
 * @property {ConversationStatus} status - 对话状态 ('active' | 'archived')
 * @property {string[]} tags - 对话标签
 */
export type ConversationSnapshot = {
  id: string
  title: string
  projectId: string | null
  tree: ConversationTree | ReturnType<typeof serializeTree> // 支持两种格式
  model: string
  draft: string
  createdAt: number
  updatedAt: number
  webSearchEnabled: boolean
  webSearchLevel: WebSearchLevel
  reasoningPreference: ReasoningPreference
  status: ConversationStatus
  tags: string[]
}

/**
 * 对话元数据 Payload
 * 
 * 存储在 conversations.meta 字段中的 JSON 数据。
 * 所有字段都是可选的，使用时需要提供默认值。
 * 
 * 📦 存储策略:
 * - tree: 完整的分支树序列化数据（核心数据）
 * - model, draft, webSearch 等: 对话配置和 UI 状态
 * - status, tags: 用户管理功能
 */
type ConversationMetaPayload = {
  tree?: ReturnType<typeof serializeTree>
  model?: string
  draft?: string
  webSearchEnabled?: boolean
  webSearchLevel?: WebSearchLevel
  reasoningPreference?: ReasoningPreference
  status?: ConversationStatus
  tags?: string[]
}

/**
 * 默认模型 ID
 * 当数据库中未存储模型信息时使用
 */
const DEFAULT_MODEL = 'gemini-2.0-flash-exp'

/**
 * 规范化元数据对象
 * 
 * 处理从数据库读取的可能损坏的 JSON 数据。
 * 
 * @param meta - 可能为 null/undefined/损坏的对象
 * @returns 安全的 ConversationMetaPayload 对象（所有字段可选）
 */
const normalizeMeta = (meta: any): ConversationMetaPayload => {
  if (!meta || typeof meta !== 'object') {
    return {}
  }
  return meta as ConversationMetaPayload
}

/**
 * 将数据库记录映射为对话快照
 * 
 * 数据转换流程:
 * 1. 解析 meta JSON 字段
 * 2. 恢复分支树结构（Array → Map）
 * 3. 应用默认值（model, draft, webSearch 等）
 * 4. 规范化 status 和 tags（去重、验证）
 * 
 * @param record - SQLite 数据库记录 (ConvoRecord)
 * @returns 内存中的对话快照，tree 为 Map 格式
 * 
 * 🔒 数据安全:
 * - 所有缺失字段都有默认值，不会导致崩溃
 * - restoreTree 会创建新的 Map 实例，不会修改原始数据
 */
const mapRecordToSnapshot = (record: ConvoRecord): ConversationSnapshot => {
  const meta = normalizeMeta(record.meta)
  
  debugLog('🔍 [mapRecordToSnapshot] 开始映射记录到快照')
  debugLog('  💬 Conversation ID:', record.id)
  debugLog('  📋 Meta:', meta)
  debugLog('  🌲 Tree in meta:', {
    exists: !!meta.tree,
    type: meta.tree ? typeof meta.tree : 'undefined',
    keys: meta.tree ? Object.keys(meta.tree) : [],
    branches: meta.tree?.branches ? {
      type: typeof meta.tree.branches,
      isArray: Array.isArray(meta.tree.branches),
      length: meta.tree.branches?.length,
      firstItem: Array.isArray(meta.tree.branches) && meta.tree.branches.length > 0 
        ? {
            type: typeof meta.tree.branches[0],
            isArray: Array.isArray(meta.tree.branches[0]),
            length: meta.tree.branches[0]?.length,
            key: meta.tree.branches[0]?.[0],
            keyType: typeof meta.tree.branches[0]?.[0],
            hasValue: meta.tree.branches[0]?.length > 1
          }
        : undefined
    } : 'no branches',
    currentPath: meta.tree?.currentPath
  })
  
  const treeSnapshot = meta.tree ? restoreTree(meta.tree as any) : createEmptyTree()
  const status = normalizeConversationStatus((meta as ConversationMetaPayload & { status?: string }).status)
  const tags = normalizeConversationTags((meta as ConversationMetaPayload & { tags?: unknown }).tags)
  return {
    id: record.id,
    title: record.title,
    projectId: record.projectId ?? null,
    tree: treeSnapshot,
    model: meta.model || DEFAULT_MODEL,
    draft: meta.draft || '',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    webSearchEnabled: meta.webSearchEnabled ?? false,
    webSearchLevel: meta.webSearchLevel || 'normal',
    reasoningPreference: meta.reasoningPreference || {
      visibility: 'visible',
      effort: 'medium',
      maxTokens: null
    },
    status,
    tags
  }
}

/**
 * 深度去除 Vue Proxy 包装
 * 
 * 递归遍历对象/数组，将所有 Proxy 包装去除，返回纯 JavaScript 对象。
 * 用于确保数据可以通过 Electron IPC 的 structuredClone 传递。
 * 
 * @param obj - 可能包含 Proxy 的对象
 * @returns 去除 Proxy 后的纯 JavaScript 对象
 */
function deepToRaw(obj: any, depth: number = 0, path: string = 'root'): any {
  const indent = '  '.repeat(depth)
  
  // 处理 null、undefined 和原始类型
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    debugLog(`${indent}🔍 [deepToRaw] ${path}: 原始值类型 ${typeof obj}`)
    return obj
  }

  // 检查是否是 Proxy
  const isProxy = obj.constructor?.name === 'Object' && toRaw(obj) !== obj
  debugLog(`${indent}🔍 [deepToRaw] ${path}:`, {
    type: typeof obj,
    constructor: obj.constructor?.name,
    isProxy: isProxy,
    isArray: Array.isArray(obj)
  })

  // 使用 toRaw 去除顶层 Proxy
  const raw = toRaw(obj)
  
  if (isProxy) {
    debugLog(`${indent}  ⚠️ [deepToRaw] ${path}: 检测到 Proxy，已去除`)
  }

  // 递归处理数组
  if (Array.isArray(raw)) {
    debugLog(`${indent}  🔍 [deepToRaw] ${path}: 数组，长度 ${raw.length}`)
    return raw.map((item, index) => deepToRaw(item, depth + 1, `${path}[${index}]`))
  }

  // 递归处理对象
  debugLog(`${indent}  🔍 [deepToRaw] ${path}: 对象，键: ${Object.keys(raw).join(', ')}`)
  const result: any = {}
  for (const key in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      result[key] = deepToRaw(raw[key], depth + 1, `${path}.${key}`)
    }
  }
  return result
}

/**
 * 将对话快照转换为消息快照数组
 * 
 * 用于生成 messages 表的记录，支持全文搜索 (FTS)。
 * 
 * 执行流程:
 * 1. 判断 tree 格式（Map 还是 Array）
 * 2. 如果是序列化格式，调用 restoreTree 恢复为 Map
 * 3. 提取当前路径的所有消息 (getCurrentPathMessages)
 * 4. 对每条消息:
 *    - 提取文本内容 (extractTextFromMessage)
 *    - 清理 metadata（移除不可序列化的字段）
 *    - 构造 MessageSnapshotPayload
 * 
 * @param snapshot - 对话快照（tree 可以是 Map 或 Array）
 * @returns 消息快照数组，按 seq 顺序排列
 * 
 * ⚠️ 重要:
 * - 只存储当前路径的消息，不存储整个分支树
 * - messages 表只用于搜索，不是数据源
 * - metadata 必须经过 sanitizeMessageMetadata 清理
 */
const toMessageSnapshots = (snapshot: ConversationSnapshot): MessageSnapshotPayload[] => {
  debugLog('🔍 [toMessageSnapshots] 开始处理 snapshot:', snapshot.id)
  
  // 🔧 修复：正确判断 tree 是否需要恢复
  // serializeTree 返回的对象格式：{ branches: Array, rootBranchIds: Array, currentPath: Array }
  // 需要检查 branches 是否是数组（序列化格式）还是 Map（运行时格式）
  let tree: ConversationTree
  
  debugLog('🔍 [toMessageSnapshots] tree.branches 类型:', {
    isMap: snapshot.tree.branches instanceof Map,
    isArray: Array.isArray(snapshot.tree.branches),
    branchesType: typeof snapshot.tree.branches,
    branchesConstructor: snapshot.tree.branches?.constructor?.name
  })
  
  if (snapshot.tree.branches instanceof Map) {
    // 已经是运行时格式（Map），直接使用
    debugLog('🔍 [toMessageSnapshots] 使用运行时格式 (Map)')
    tree = snapshot.tree as ConversationTree
  } else if (Array.isArray(snapshot.tree.branches)) {
    // 是序列化格式（数组），需要恢复为 Map
    debugLog('🔍 [toMessageSnapshots] 恢复序列化格式 (Array)')
    tree = restoreTree(snapshot.tree as any)
  } else {
    // 兜底：尝试恢复
    debugLog('⚠️ [toMessageSnapshots] 兜底：尝试恢复 tree')
    tree = restoreTree(snapshot.tree as any)
  }
  
  const pathMessages = getCurrentPathMessages(tree).filter(Boolean)
  debugLog('🔍 [toMessageSnapshots] 当前路径消息数量:', pathMessages.length)
  
  if (!pathMessages.length) return []

  const result = pathMessages.map((message: any, index) => {
    debugLog(`🔍 [toMessageSnapshots] 处理消息 ${index + 1}/${pathMessages.length}:`, {
      role: message?.role,
      hasMetadata: !!message?.metadata,
      metadataKeys: message?.metadata ? Object.keys(message.metadata) : [],
      metadataType: typeof message?.metadata,
      branchId: message?.branchId,
      versionId: message?.versionId
    })
    
    const body = extractTextFromMessage(message) || ''
    const createdAt = message?.timestamp || snapshot.updatedAt || Date.now()
    const role = message?.role === 'model' ? 'assistant' : message?.role

    // 检查 metadata 内容
    if (message?.metadata) {
      debugLog(`🔍 [toMessageSnapshots] 消息 ${index + 1} metadata 详细内容:`, {
        metadata: message.metadata,
        metadataStringified: JSON.stringify(message.metadata, null, 2).substring(0, 500)
      })
      
      // 检查是否包含不可序列化的对象
      try {
        JSON.stringify(message.metadata)
        debugLog(`✅ [toMessageSnapshots] 消息 ${index + 1} metadata 可以 JSON 序列化`)
      } catch (e) {
        console.error(`❌ [toMessageSnapshots] 消息 ${index + 1} metadata 无法 JSON 序列化:`, e)
      }
    }

    const sanitizedMetadata = sanitizeMessageMetadata(message?.metadata)
    if (message?.metadata && !sanitizedMetadata) {
      console.warn(`⚠️ [toMessageSnapshots] 消息 ${index + 1} metadata 经过清洗后被移除，避免不可克隆字段`)
    }

    return {
      role: (role as MessageSnapshotPayload['role']) || 'user',
      body,
      createdAt,
      seq: index + 1,
      meta: {
        branchId: message?.branchId,
        versionId: message?.versionId,
        metadata: sanitizedMetadata
      }
    }
  })
  
  debugLog('🔍 [toMessageSnapshots] 完成，生成了', result.length, '条消息快照')
  
  return result
}

/**
 * 将 Pinia 会话状态序列化到 SQLite：
 * - 将完整分支树快照编码进 convo.meta
 * - 按当前路径生成 message 表记录用于 FTS
 * 
 * ========== SQLite 聊天持久化服务 ==========
 * 
 * 核心方法:
 * - listConversations(): 加载所有对话列表
 * - saveConversation(): 保存/更新对话（自动处理 Proxy）
 * - deleteConversation(): 删除对话和关联消息
 * 
 * 🔒 关键设计:
 * - 自动处理 Vue Proxy 包装（deepToRaw）
 * - 自动转换分支树格式（Map → Array）
 * - 保证数据可通过 IPC structuredClone 传递
 */
export class SqliteChatPersistence {
  /**
   * 加载所有对话列表
   * 
   * @returns Promise<ConversationSnapshot[]> - 对话快照数组，tree 为 Map 格式
   * @throws {DbWorkerError} 数据库操作失败时抛出
   */
  async listConversations(): Promise<ConversationSnapshot[]> {
    const records = await dbService.listConvos({ limit: 10000 })
    return records.map(mapRecordToSnapshot)
  }

  /**
   * 保存/更新对话到 SQLite
   * 
   * 执行步骤:
   * 1. 序列化分支树 (Map → Array)
   * 2. 移除 Vue Proxy 包装 (deepToRaw)
   * 3. 构造 meta Payload
   * 4. 保存 conversation 记录
   * 5. 生成并替换 messages 记录
   * 
   * @param snapshot - 对话快照（可包含 Vue Proxy）
   * @throws {DbWorkerError} 数据库操作失败
   * 
   * 🔒 数据安全:
   * - 使用 structuredClone 深复制，不会修改原始 snapshot
   * - 自动检测并移除不可序列化的字段
   * 
   * ⚡ 性能:
   * - messages 表使用全量替换（DELETE + INSERT）
   * - 在 Worker 线程中执行，不阻塞主线程
   */
  async saveConversation(snapshot: ConversationSnapshot) {
    debugLog('🔍 [saveConversation] 开始保存对话:', snapshot.id)
    debugLog('🔍 [saveConversation] snapshot 原始数据:', {
      id: snapshot.id,
      title: snapshot.title,
      hasTree: !!snapshot.tree,
      treeBranchesType: snapshot.tree?.branches?.constructor?.name,
      treeBranchesIsMap: snapshot.tree?.branches instanceof Map,
      model: snapshot.model
    })
    
    // ========== � 修复：先序列化 tree，再去除 Proxy ==========
    // 问题：如果先 deepToRaw，Map entries 数组会被破坏
    // 正确顺序：
    // 1. 先将 tree (Map) 序列化为标准格式 { branches: [[key, value], ...] }
    // 2. 再去除整个对象的 Proxy 包装
    
    debugLog('🔍 [saveConversation] 步骤 1: 序列化 tree...')
    const serializedTree = snapshot.tree.branches instanceof Map
      ? serializeTree(snapshot.tree)
      : snapshot.tree // 已经是序列化格式
    
    debugLog('✅ [saveConversation] tree 序列化完成:', {
      branchesIsArray: Array.isArray(serializedTree.branches),
      branchesLength: serializedTree.branches?.length,
      firstEntry: serializedTree.branches?.[0]
    })
    
    // 创建一个新的 snapshot 副本，用序列化的 tree 替换原来的
    const snapshotWithSerializedTree = {
      ...snapshot,
      tree: serializedTree
    }
    
    debugLog('🔍 [saveConversation] 步骤 2: 执行 deepToRaw 去除 Proxy...')
    const cleanSnapshot = deepToRaw(snapshotWithSerializedTree)
    debugLog('✅ [saveConversation] deepToRaw 完成')
    debugLog('🔍 [saveConversation] cleanSnapshot 数据:', {
      id: cleanSnapshot.id,
      title: cleanSnapshot.title,
      hasTree: !!cleanSnapshot.tree,
      treeBranchesIsArray: Array.isArray(cleanSnapshot.tree?.branches),
      treeBranchesLength: cleanSnapshot.tree?.branches?.length,
      firstBranchEntry: cleanSnapshot.tree?.branches?.[0],
      model: cleanSnapshot.model
    })
    
    debugLog('🔍 [saveConversation] 准备构建 meta...')
    debugLog('🔍 [saveConversation] 准备构建 meta...')
    
    const meta: ConversationMetaPayload = {
      tree: cleanSnapshot.tree, // 已经是序列化且去除 Proxy 的格式
      model: cleanSnapshot.model,
      draft: cleanSnapshot.draft,
      webSearchEnabled: cleanSnapshot.webSearchEnabled,
      webSearchLevel: cleanSnapshot.webSearchLevel,
      reasoningPreference: cleanSnapshot.reasoningPreference,
      status: cleanSnapshot.status ?? DEFAULT_CONVERSATION_STATUS,
      tags: cleanSnapshot.tags ?? []
    }

    debugLog('🔍 [saveConversation] 准备保存 convo 到数据库...')
    await dbService.saveConvo({
      id: cleanSnapshot.id,
      title: cleanSnapshot.title,
      projectId: cleanSnapshot.projectId ?? null,
      createdAt: cleanSnapshot.createdAt,
      updatedAt: Date.now(),
      meta
    })
    debugLog('✅ [saveConversation] convo 保存成功')

    debugLog('🔍 [saveConversation] 准备生成消息快照...')
    const messageSnapshots = toMessageSnapshots(cleanSnapshot)
    debugLog('✅ [saveConversation] 消息快照生成完成，数量:', messageSnapshots.length)
    
    if (messageSnapshots.length > 0) {
      debugLog('🔍 [saveConversation] 准备替换消息到数据库...')
      debugLog('🔍 [saveConversation] 消息快照详情:', {
        count: messageSnapshots.length,
        firstMessage: messageSnapshots[0] ? {
          role: messageSnapshots[0].role,
          bodyLength: messageSnapshots[0].body?.length || 0,
          hasMeta: !!messageSnapshots[0].meta,
          metaKeys: messageSnapshots[0].meta ? Object.keys(messageSnapshots[0].meta) : []
        } : null
      })
      
      // 检查每条消息是否可序列化
      for (let i = 0; i < messageSnapshots.length; i++) {
        const msg = messageSnapshots[i]
        debugLog(`🔍 [saveConversation] 检查消息 ${i + 1} 序列化:`)
        try {
          const serialized = JSON.stringify(msg)
          debugLog(`  ✅ 消息 ${i + 1} 可以 JSON 序列化，大小: ${serialized.length} 字节`)
        } catch (e) {
          console.error(`  ❌ 消息 ${i + 1} 无法 JSON 序列化:`, e)
          console.error(`  ❌ 问题消息内容:`, msg)
        }
      }
      
      debugLog('🔍 [saveConversation] 调用 dbService.replaceMessages...')
      try {
        await dbService.replaceMessages({
          convoId: cleanSnapshot.id,
          messages: messageSnapshots
        })
        debugLog('✅ [saveConversation] 消息替换成功')
      } catch (error) {
        console.error('❌ [saveConversation] 消息替换失败:', error)
        console.error('❌ [saveConversation] 失败时的消息数据:', {
          convoId: cleanSnapshot.id,
          messageCount: messageSnapshots.length,
          messages: messageSnapshots
        })
        throw error
      }
    } else {
      debugLog('🔍 [saveConversation] 没有消息，清空数据库中的消息...')
      // 即使没有消息，也要清空 SQLite 中的冗余残留
      await dbService.replaceMessages({
        convoId: cleanSnapshot.id,
        messages: []
      })
      debugLog('✅ [saveConversation] 消息清空完成')
    }
    
    debugLog('✅ [saveConversation] 对话保存完成:', cleanSnapshot.id)
  }

  /**
   * 删除对话
   * 
   * 自动级联删除:
   * - conversations 表记录
   * - messages 表关联记录（通过 SQL CASCADE）
   * 
   * @param convoId - 对话 ID
   * @throws {DbWorkerError} 数据库操作失败
   */
  async deleteConversation(convoId: string) {
    await dbService.deleteConvo({ id: convoId })
  }
}

/**
 * SQLite 聊天持久化服务单例
 * 
 * 使用示例:
 * ```typescript
 * // 加载对话列表
 * const convos = await sqliteChatPersistence.listConversations()
 * 
 * // 保存对话
 * await sqliteChatPersistence.saveConversation(snapshot)
 * 
 * // 删除对话
 * await sqliteChatPersistence.deleteConversation(convoId)
 * ```
 */
export const sqliteChatPersistence = new SqliteChatPersistence()

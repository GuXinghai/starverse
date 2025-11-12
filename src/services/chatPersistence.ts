import { toRaw } from 'vue'
import { dbService } from './db'
import type { ConvoRecord, MessageSnapshotPayload } from './db/types'
import { createEmptyTree, restoreTree, serializeTree, getCurrentPathMessages } from '../stores/branchTreeHelpers'
import { extractTextFromMessage, type ConversationTree, type ReasoningPreference, type WebSearchLevel } from '../types/chat'
import { sanitizeMessageMetadata } from '../utils/ipcSanitizer.js'

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
}

type ConversationMetaPayload = {
  tree?: ReturnType<typeof serializeTree>
  model?: string
  draft?: string
  webSearchEnabled?: boolean
  webSearchLevel?: WebSearchLevel
  reasoningPreference?: ReasoningPreference
}

const DEFAULT_MODEL = 'gemini-2.0-flash-exp'

const normalizeMeta = (meta: any): ConversationMetaPayload => {
  if (!meta || typeof meta !== 'object') {
    return {}
  }
  return meta as ConversationMetaPayload
}

const mapRecordToSnapshot = (record: ConvoRecord): ConversationSnapshot => {
  const meta = normalizeMeta(record.meta)
  
  console.log('🔍 [mapRecordToSnapshot] 开始映射记录到快照')
  console.log('  💬 Conversation ID:', record.id)
  console.log('  📋 Meta:', meta)
  console.log('  🌲 Tree in meta:', {
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
    }
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
    console.log(`${indent}🔍 [deepToRaw] ${path}: 原始值类型 ${typeof obj}`)
    return obj
  }

  // 检查是否是 Proxy
  const isProxy = obj.constructor?.name === 'Object' && toRaw(obj) !== obj
  console.log(`${indent}🔍 [deepToRaw] ${path}:`, {
    type: typeof obj,
    constructor: obj.constructor?.name,
    isProxy: isProxy,
    isArray: Array.isArray(obj)
  })

  // 使用 toRaw 去除顶层 Proxy
  const raw = toRaw(obj)
  
  if (isProxy) {
    console.log(`${indent}  ⚠️ [deepToRaw] ${path}: 检测到 Proxy，已去除`)
  }

  // 递归处理数组
  if (Array.isArray(raw)) {
    console.log(`${indent}  🔍 [deepToRaw] ${path}: 数组，长度 ${raw.length}`)
    return raw.map((item, index) => deepToRaw(item, depth + 1, `${path}[${index}]`))
  }

  // 递归处理对象
  console.log(`${indent}  🔍 [deepToRaw] ${path}: 对象，键: ${Object.keys(raw).join(', ')}`)
  const result: any = {}
  for (const key in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      result[key] = deepToRaw(raw[key], depth + 1, `${path}.${key}`)
    }
  }
  return result
}

const toMessageSnapshots = (snapshot: ConversationSnapshot): MessageSnapshotPayload[] => {
  console.log('🔍 [toMessageSnapshots] 开始处理 snapshot:', snapshot.id)
  
  // 🔧 修复：正确判断 tree 是否需要恢复
  // serializeTree 返回的对象格式：{ branches: Array, rootBranchIds: Array, currentPath: Array }
  // 需要检查 branches 是否是数组（序列化格式）还是 Map（运行时格式）
  let tree: ConversationTree
  
  console.log('🔍 [toMessageSnapshots] tree.branches 类型:', {
    isMap: snapshot.tree.branches instanceof Map,
    isArray: Array.isArray(snapshot.tree.branches),
    branchesType: typeof snapshot.tree.branches,
    branchesConstructor: snapshot.tree.branches?.constructor?.name
  })
  
  if (snapshot.tree.branches instanceof Map) {
    // 已经是运行时格式（Map），直接使用
    console.log('🔍 [toMessageSnapshots] 使用运行时格式 (Map)')
    tree = snapshot.tree as ConversationTree
  } else if (Array.isArray(snapshot.tree.branches)) {
    // 是序列化格式（数组），需要恢复为 Map
    console.log('🔍 [toMessageSnapshots] 恢复序列化格式 (Array)')
    tree = restoreTree(snapshot.tree as any)
  } else {
    // 兜底：尝试恢复
    console.log('⚠️ [toMessageSnapshots] 兜底：尝试恢复 tree')
    tree = restoreTree(snapshot.tree as any)
  }
  
  const pathMessages = getCurrentPathMessages(tree).filter(Boolean)
  console.log('🔍 [toMessageSnapshots] 当前路径消息数量:', pathMessages.length)
  
  if (!pathMessages.length) return []

  const result = pathMessages.map((message: any, index) => {
    console.log(`🔍 [toMessageSnapshots] 处理消息 ${index + 1}/${pathMessages.length}:`, {
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
      console.log(`🔍 [toMessageSnapshots] 消息 ${index + 1} metadata 详细内容:`, {
        metadata: message.metadata,
        metadataStringified: JSON.stringify(message.metadata, null, 2).substring(0, 500)
      })
      
      // 检查是否包含不可序列化的对象
      try {
        JSON.stringify(message.metadata)
        console.log(`✅ [toMessageSnapshots] 消息 ${index + 1} metadata 可以 JSON 序列化`)
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
  
  console.log('🔍 [toMessageSnapshots] 完成，生成了', result.length, '条消息快照')
  
  return result
}

/**
 * 将 Pinia 会话状态序列化到 SQLite：
 * - 将完整分支树快照编码进 convo.meta
 * - 按当前路径生成 message 表记录用于 FTS
 */
export class SqliteChatPersistence {
  async listConversations(): Promise<ConversationSnapshot[]> {
    const records = await dbService.listConvos({ limit: 10000 })
    return records.map(mapRecordToSnapshot)
  }

  async saveConversation(snapshot: ConversationSnapshot) {
    console.log('🔍 [saveConversation] 开始保存对话:', snapshot.id)
    console.log('🔍 [saveConversation] snapshot 原始数据:', {
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
    
    console.log('🔍 [saveConversation] 步骤 1: 序列化 tree...')
    const serializedTree = snapshot.tree.branches instanceof Map
      ? serializeTree(snapshot.tree)
      : snapshot.tree // 已经是序列化格式
    
    console.log('✅ [saveConversation] tree 序列化完成:', {
      branchesIsArray: Array.isArray(serializedTree.branches),
      branchesLength: serializedTree.branches?.length,
      firstEntry: serializedTree.branches?.[0]
    })
    
    // 创建一个新的 snapshot 副本，用序列化的 tree 替换原来的
    const snapshotWithSerializedTree = {
      ...snapshot,
      tree: serializedTree
    }
    
    console.log('🔍 [saveConversation] 步骤 2: 执行 deepToRaw 去除 Proxy...')
    const cleanSnapshot = deepToRaw(snapshotWithSerializedTree)
    console.log('✅ [saveConversation] deepToRaw 完成')
    console.log('🔍 [saveConversation] cleanSnapshot 数据:', {
      id: cleanSnapshot.id,
      title: cleanSnapshot.title,
      hasTree: !!cleanSnapshot.tree,
      treeBranchesIsArray: Array.isArray(cleanSnapshot.tree?.branches),
      treeBranchesLength: cleanSnapshot.tree?.branches?.length,
      firstBranchEntry: cleanSnapshot.tree?.branches?.[0],
      model: cleanSnapshot.model
    })
    
    console.log('🔍 [saveConversation] 准备构建 meta...')
    console.log('🔍 [saveConversation] 准备构建 meta...')
    
    const meta: ConversationMetaPayload = {
      tree: cleanSnapshot.tree, // 已经是序列化且去除 Proxy 的格式
      model: cleanSnapshot.model,
      draft: cleanSnapshot.draft,
      webSearchEnabled: cleanSnapshot.webSearchEnabled,
      webSearchLevel: cleanSnapshot.webSearchLevel,
      reasoningPreference: cleanSnapshot.reasoningPreference
    }

    console.log('🔍 [saveConversation] 准备保存 convo 到数据库...')
    await dbService.saveConvo({
      id: cleanSnapshot.id,
      title: cleanSnapshot.title,
      projectId: cleanSnapshot.projectId ?? null,
      createdAt: cleanSnapshot.createdAt,
      updatedAt: Date.now(),
      meta
    })
    console.log('✅ [saveConversation] convo 保存成功')

    console.log('🔍 [saveConversation] 准备生成消息快照...')
    const messageSnapshots = toMessageSnapshots(cleanSnapshot)
    console.log('✅ [saveConversation] 消息快照生成完成，数量:', messageSnapshots.length)
    
    if (messageSnapshots.length > 0) {
      console.log('🔍 [saveConversation] 准备替换消息到数据库...')
      console.log('🔍 [saveConversation] 消息快照详情:', {
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
        console.log(`🔍 [saveConversation] 检查消息 ${i + 1} 序列化:`)
        try {
          const serialized = JSON.stringify(msg)
          console.log(`  ✅ 消息 ${i + 1} 可以 JSON 序列化，大小: ${serialized.length} 字节`)
        } catch (e) {
          console.error(`  ❌ 消息 ${i + 1} 无法 JSON 序列化:`, e)
          console.error(`  ❌ 问题消息内容:`, msg)
        }
      }
      
      console.log('🔍 [saveConversation] 调用 dbService.replaceMessages...')
      try {
        await dbService.replaceMessages({
          convoId: cleanSnapshot.id,
          messages: messageSnapshots
        })
        console.log('✅ [saveConversation] 消息替换成功')
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
      console.log('🔍 [saveConversation] 没有消息，清空数据库中的消息...')
      // 即使没有消息，也要清空 SQLite 中的冗余残留
      await dbService.replaceMessages({
        convoId: cleanSnapshot.id,
        messages: []
      })
      console.log('✅ [saveConversation] 消息清空完成')
    }
    
    console.log('✅ [saveConversation] 对话保存完成:', cleanSnapshot.id)
  }

  async deleteConversation(convoId: string) {
    await dbService.deleteConvo({ id: convoId })
  }
}

export const sqliteChatPersistence = new SqliteChatPersistence()

import { dbBridge, isUsingDbBridgeFallback } from '../../utils/electronBridge'
import type {
  AppendMessagePayload,
  ConvoListParams,
  ConvoRecord,
  CreateConvoPayload,
  SaveConvoPayload,
  DeleteConvoPayload,
  ArchivedConvoRecord,
  ListArchivedParams,
  ProjectRecord,
  CreateProjectPayload,
  SaveProjectPayload,
  DeleteProjectPayload,
  ProjectListParams,
  DbMethod,
  FulltextSearchParams,
  FulltextSearchResult,
  HealthPingResult,
  MessageListParams,
  MessageRecord,
  ReplaceMessagesPayload
} from './types'

const assertBridge = () => {
  if (isUsingDbBridgeFallback) {
    throw new Error('dbBridge is unavailable. This feature requires the Electron preload context.')
  }
  return dbBridge
}

const invoke = async <T = unknown>(method: DbMethod, params?: unknown) => {
  console.log(`🔍 [dbService.invoke] 调用方法: ${method}`)
  console.log(`🔍 [dbService.invoke] 参数类型: ${typeof params}`)
  
  if (method === 'message.replace' && params) {
    const payload = params as ReplaceMessagesPayload
    console.log(`🔍 [dbService.invoke] message.replace 详情:`, {
      convoId: payload.convoId,
      messageCount: payload.messages?.length || 0
    })
    
    // 检查每条消息
    if (payload.messages && Array.isArray(payload.messages)) {
      for (let i = 0; i < payload.messages.length; i++) {
        const msg = payload.messages[i]
        console.log(`🔍 [dbService.invoke] 消息 ${i + 1}:`, {
          role: msg.role,
          bodyLength: msg.body?.length || 0,
          hasMeta: !!msg.meta,
          metaKeys: msg.meta ? Object.keys(msg.meta) : []
        })
        
        // 尝试序列化检查
        try {
          const serialized = JSON.stringify(msg)
          console.log(`  ✅ 消息 ${i + 1} 可序列化，大小: ${serialized.length}`)
        } catch (e) {
          console.error(`  ❌ 消息 ${i + 1} 无法序列化:`, e)
          console.error(`  ❌ 问题消息:`, msg)
        }
        
        // 检查 meta.metadata
        if (msg.meta?.metadata) {
          console.log(`🔍 [dbService.invoke] 消息 ${i + 1} metadata:`, {
            type: typeof msg.meta.metadata,
            keys: Object.keys(msg.meta.metadata),
            isProxy: msg.meta.metadata.constructor?.name === 'Proxy'
          })
          
          try {
            const metaStr = JSON.stringify(msg.meta.metadata)
            console.log(`  ✅ metadata 可序列化，大小: ${metaStr.length}`)
          } catch (e) {
            console.error(`  ❌ metadata 无法序列化:`, e)
            console.error(`  ❌ metadata 内容:`, msg.meta.metadata)
          }
        }
      }
    }
  }
  
  const bridge = assertBridge()
  
  try {
    console.log(`🔍 [dbService.invoke] 准备调用 bridge.invoke...`)
    const result = await bridge.invoke<T>(method, params)
    console.log(`✅ [dbService.invoke] ${method} 调用成功`)
    return result
  } catch (error) {
    console.error(`❌ [dbService.invoke] ${method} 调用失败:`, error)
    if (method === 'message.replace' && params) {
      console.error(`❌ [dbService.invoke] 失败时的完整 payload:`, params)
    }
    throw error
  }
}

export const dbService = {
  // ========== Health ==========
  ping: () => invoke<HealthPingResult>('health.ping'),
  
  // ========== Project APIs ==========
  createProject: (payload: CreateProjectPayload) => invoke<ProjectRecord>('project.create', payload),
  saveProject: (payload: SaveProjectPayload) => invoke<{ ok: boolean }>('project.save', payload),
  listProjects: (params?: ProjectListParams) => invoke<ProjectRecord[]>('project.list', params ?? {}),
  deleteProject: (payload: DeleteProjectPayload) => invoke<{ ok: boolean }>('project.delete', payload),
  findProjectById: (id: string) => invoke<ProjectRecord | null>('project.findById', { id }),
  findProjectByName: (name: string) => invoke<ProjectRecord | null>('project.findByName', { name }),
  countProjectConversations: (projectId: string) => invoke<{ count: number }>('project.countConversations', { projectId }),
  
  // ========== Conversation APIs ==========
  createConvo: (payload: CreateConvoPayload) => invoke<ConvoRecord>('convo.create', payload),
  saveConvo: (payload: SaveConvoPayload) => invoke<{ ok: boolean }>('convo.save', payload),
  listConvos: (params?: ConvoListParams) => invoke<ConvoRecord[]>('convo.list', params ?? {}),
  deleteConvo: (payload: DeleteConvoPayload) => invoke<{ ok: boolean }>('convo.delete', payload),
  deleteConvos: (ids: string[]) => invoke<{ deleted: number }>('convo.deleteMany', { ids }),
  archiveConvo: (id: string) => invoke<{ ok: boolean }>('convo.archive', { id }),
  archiveConvos: (ids: string[]) => invoke<{ archived: number, failed: string[] }>('convo.archiveMany', { ids }),
  restoreConvo: (id: string) => invoke<{ ok: boolean }>('convo.restore', { id }),
  listArchivedConvos: (params?: ListArchivedParams) => invoke<ArchivedConvoRecord[]>('convo.listArchived', params ?? {}),
  
  // ========== Message APIs ==========
  appendMessage: (payload: AppendMessagePayload) => invoke<MessageRecord>('message.append', payload),
  listMessages: (params: MessageListParams) => invoke<MessageRecord[]>('message.list', params),
  replaceMessages: (payload: ReplaceMessagesPayload) =>
    invoke<{ ok: boolean }>('message.replace', payload),
  
  // ========== Search APIs ==========
  searchFulltext: (params: FulltextSearchParams) =>
    invoke<FulltextSearchResult[]>('search.fulltext', params),
  
  // ========== Maintenance APIs ==========
  optimizeFts: () => invoke<{ ok: boolean }>('maintenance.optimize')
}

export type { ProjectRecord, ConvoRecord, MessageRecord, FulltextSearchResult, ArchivedConvoRecord }

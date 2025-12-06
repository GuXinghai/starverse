/**
 * 持久化管理 Store
 * 
 * 职责：
 * - 脏数据追踪（哪些对话/项目被修改过）
 * - 自动保存调度（防抖、节流）
 * - SQLite 交互封装
 * - 加载状态管理
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useConversationStore } from './conversation'
import type { Conversation } from '../types/store'
import { sqliteChatPersistence } from '../services/chatPersistence'
import { serializeTree } from './branchTreeHelpers'
import { DEFAULT_SAMPLING_PARAMETERS } from '../types/chat'

// 自动保存间隔（毫秒）
const AUTO_SAVE_INTERVAL = 3000 // 3秒

export const usePersistenceStore = defineStore('persistence', () => {
  const conversationStore = useConversationStore()

  // ========== State ==========

  /**
   * 脏对话 ID 集合（被修改过，需要保存）
   */
  const dirtyConversationIds = ref<Set<string>>(new Set())

  /**
   * 正在保存的对话 ID 集合
   */
  const savingConversationIds = ref<Set<string>>(new Set())

  /**
   * 待删除的对话 ID 集合（仅 SQLite 模式）
   */
  const deletedConversationIds = ref<Set<string>>(new Set())

  /**
   * 脏项目 ID 集合
   */
  const dirtyProjectIds = ref<Set<string>>(new Set())

  // ========== Actions - 脏数据追踪 ==========

  /**
   * 标记对话为脏数据
   * 
   * @param conversationId - 对话 ID
   */
  const markConversationDirty = (conversationId: string): void => {
    dirtyConversationIds.value.add(conversationId)
  }

  /**
   * 清除对话的脏标记
   * 
   * @param conversationId - 对话 ID
   */
  const clearConversationDirty = (conversationId: string): void => {
    dirtyConversationIds.value.delete(conversationId)
  }

  /**
   * 批量清除脏标记
   * 
   * @param conversationIds - 对话 ID 数组
   */
  const clearConversationsDirty = (conversationIds: string[]): void => {
    for (const id of conversationIds) {
      dirtyConversationIds.value.delete(id)
    }
  }

  /**
   * 清空所有脏标记
   */
  const clearAllDirty = (): void => {
    dirtyConversationIds.value.clear()
    dirtyProjectIds.value.clear()
  }

  /**
   * 标记对话为待删除
   * 
   * @param conversationId - 对话 ID
   */
  const markConversationDeleted = (conversationId: string): void => {
    deletedConversationIds.value.add(conversationId)
    dirtyConversationIds.value.delete(conversationId) // 删除的不需要保存
  }

  // ========== Actions - 保存操作 ==========

  /**
   * 保存单个对话
   * 
   * @param conversationId - 对话 ID
   * @returns 是否成功
   */
  const saveConversation = async (conversationId: string): Promise<boolean> => {
    const conversation = conversationStore.getConversationById(conversationId)
    if (!conversation) {
      console.warn(`[PersistenceStore] Conversation ${conversationId} not found`)
      return false
    }

    try {
      savingConversationIds.value.add(conversationId)

      // 序列化分支树
      const serializedTree = serializeTree(conversation.tree)

      // 构建对话快照
      const snapshot = {
        id: conversation.id,
        title: conversation.title,
        draft: conversation.draft || '',
        model: conversation.model,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        projectId: conversation.projectId,
        status: conversation.status || 'active',
        tags: conversation.tags || [],
        webSearchEnabled: conversation.webSearch?.enabled || false,
        webSearchLevel: (conversation.webSearch?.level || 'normal') as 'quick' | 'normal' | 'deep',
        reasoningPreference: conversation.reasoningPreference || conversation.reasoning || {
          visibility: 'off' as const,
          effort: 'medium' as const
        },
        samplingParameters: conversation.samplingParameters || { ...DEFAULT_SAMPLING_PARAMETERS },
        pdfEngine: conversation.pdfEngine || 'pdf-text',
        tree: serializedTree
      }

      // 保存到 SQLite
      await sqliteChatPersistence.saveConversation(snapshot)
      clearConversationDirty(conversationId)
      return true
    } catch (error) {
      console.error(`[PersistenceStore] Failed to save conversation ${conversationId}:`, error)
      return false
    } finally {
      savingConversationIds.value.delete(conversationId)
    }
  }

  /**
   * 保存所有脏对话
   * 
   * @returns 成功保存的数量
   */
  const saveAllDirtyConversations = async (): Promise<number> => {
    const dirtyIds = Array.from(dirtyConversationIds.value)
    if (dirtyIds.length === 0) return 0

    let successCount = 0
    for (const id of dirtyIds) {
      const success = await saveConversation(id)
      if (success) successCount++
    }

    return successCount
  }

  /**
   * 删除对话
   * 
   * @param conversationId - 对话 ID
   * @returns 是否成功
   */
  const deleteConversation = async (conversationId: string): Promise<boolean> => {
    try {
      await sqliteChatPersistence.deleteConversation(conversationId)
      deletedConversationIds.value.delete(conversationId)
      return true
    } catch (error) {
      console.error(`[PersistenceStore] Failed to delete conversation ${conversationId}:`, error)
      return false
    }
  }

  /**
   * 批量删除对话
   * 
   * @param conversationIds - 对话 ID 数组
   * @returns 成功删除的数量
   */
  const deleteConversations = async (conversationIds: string[]): Promise<number> => {
    let successCount = 0
    for (const id of conversationIds) {
      const success = await deleteConversation(id)
      if (success) successCount++
    }
    return successCount
  }

  // ========== Actions - 加载操作 ==========

  /**
   * 从数据库加载所有对话
   * 
   * @returns 加载的对话数组
   */
  const loadAllConversations = async (): Promise<Conversation[]> => {
    try {
      conversationStore.loadingConversationIds.add('__all__')

      // 从 SQLite 加载所有对话
      const snapshots = await sqliteChatPersistence.listConversations()
      
      const conversations: Conversation[] = []

      for (const snapshot of snapshots) {
        const conversation: Conversation = {
          id: snapshot.id,
          title: snapshot.title,
          draft: snapshot.draft || '',
          tree: snapshot.tree,  // 已经是恢复后的 tree
          model: snapshot.model,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          projectId: snapshot.projectId,
          status: snapshot.status,
          tags: snapshot.tags,
          webSearch: {
            enabled: snapshot.webSearchEnabled || false,
            level: snapshot.webSearchLevel || 'normal'
          },
          reasoningPreference: snapshot.reasoningPreference || {
            visibility: 'visible',
            effort: 'medium',
            maxTokens: null,
            mode: 'medium'
          },
          samplingParameters: snapshot.samplingParameters || { ...DEFAULT_SAMPLING_PARAMETERS },
          pdfEngine: snapshot.pdfEngine || 'pdf-text',
          generationStatus: 'idle',
          isGenerating: false,
          generationError: null
        }

        conversations.push(conversation)
      }

      // 设置到 conversation store
      conversationStore.setConversations(conversations)

      // 清空脏标记
      clearAllDirty()

      console.log(`[PersistenceStore] 加载了 ${conversations.length} 个对话`)
      return conversations
    } catch (error) {
      console.error('[PersistenceStore] Failed to load conversations:', error)
      throw error
    } finally {
      conversationStore.loadingConversationIds.delete('__all__')
    }
  }

  /**
   * 加载单个对话
   * 
   * @param conversationId - 对话 ID
   * @returns 对话对象或 null
   */
  const loadConversation = async (conversationId: string): Promise<Conversation | null> => {
    try {
      conversationStore.loadingConversationIds.add(conversationId)

      // 通过 loadAllConversations 重新加载所有对话,然后找到目标对话
      const conversations = await loadAllConversations()
      return conversations.find((c: Conversation) => c.id === conversationId) || null
    } catch (error) {
      console.error(`[PersistenceStore] Failed to load conversation ${conversationId}:`, error)
      return null
    } finally {
      conversationStore.loadingConversationIds.delete(conversationId)
    }
  }

  // ========== 自动保存机制 ==========

  /**
   * 启动自动保存定时器
   */
  let autoSaveTimer: ReturnType<typeof setInterval> | null = null
  
  const startAutoSave = () => {
    if (autoSaveTimer) return // 防止重复启动

    console.log('🔄 [PersistenceStore] 自动保存机制已启动，间隔:', AUTO_SAVE_INTERVAL, 'ms')
    
    autoSaveTimer = setInterval(async () => {
      const dirtyCount = dirtyConversationIds.value.size
      if (dirtyCount > 0) {
        console.log(`💾 [PersistenceStore] 自动保存触发，脏数据数量: ${dirtyCount}`)
        await saveAllDirtyConversations()
      }
    }, AUTO_SAVE_INTERVAL)
  }

  /**
   * 停止自动保存定时器
   */
  const stopAutoSave = () => {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer)
      autoSaveTimer = null
      console.log('⏹️ [PersistenceStore] 自动保存机制已停止')
    }
  }

  // 启动自动保存
  startAutoSave()

  // ========== 返回 Store API ==========

  return {
    // State
    dirtyConversationIds,
    savingConversationIds,
    deletedConversationIds,
    dirtyProjectIds,

    // Actions - 脏数据追踪
    markConversationDirty,
    clearConversationDirty,
    clearConversationsDirty,
    clearAllDirty,
    markConversationDeleted,

    // Actions - 保存
    saveConversation,
    saveAllDirtyConversations,

    // Actions - 删除
    deleteConversation,
    deleteConversations,

    // Actions - 加载
    loadAllConversations,
    loadConversation,

    // Actions - 自动保存控制
    startAutoSave,
    stopAutoSave
  }
})

/**
 * 对话管理 Store
 * 
 * 职责：
 * - 对话 CRUD (创建、删除、重命名)
 * - 多标签页管理 (打开、关闭、切换激活标签)
 * - 对话配置管理 (草稿、Web 搜索、状态、标签)
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { Conversation } from '../types/store'
import {
  DEFAULT_CONVERSATION_STATUS,
  normalizeConversationStatus,
  normalizeConversationTags,
  type ConversationStatus
} from '../types/conversation'
import type { WebSearchLevel, ReasoningPreference, SamplingParameterSettings } from '../types/chat'
import { DEFAULT_SAMPLING_PARAMETERS } from '../types/chat'
import { createEmptyTree } from './branchTreeHelpers'
import { usePersistenceStore } from './persistence'

const DEFAULT_REASONING_PREFERENCE = Object.freeze({
  visibility: 'visible' as const,
  effort: 'medium' as const,
  maxTokens: null
})

const DEFAULT_MODEL = 'auto'

export const useConversationStore = defineStore('conversation', () => {
  // ========== State ==========
  
  /**
   * 所有对话数组
   */
  const conversations = ref<Conversation[]>([])

  /**
   * 正在加载的对话 ID 集合（运行态）
   */
  const loadingConversationIds = ref<Set<string>>(new Set())

  /**
   * 在标签页中打开的对话 ID 数组
   */
  const openTabIds = ref<string[]>([])

  /**
   * 当前激活的标签页对话 ID
   */
  const activeTabId = ref<string | null>(null)

  // ========== Computed ==========
  
  /**
   * 当前激活的对话对象
   */
  const activeConversation = computed<Conversation | null>(() => {
    if (!activeTabId.value) return null
    return conversations.value.find(c => c.id === activeTabId.value) || null
  })

  /**
   * 对话 ID 到对话对象的映射（性能优化）
   */
  const conversationMap = computed<Map<string, Conversation>>(() => {
    const map = new Map<string, Conversation>()
    for (const conv of conversations.value) {
      map.set(conv.id, conv)
    }
    return map
  })

  /**
   * 检查是否有任何对话正在生成
   */
  const hasAnyGeneratingConversation = computed<boolean>(() => {
    return conversations.value.some(c => c.isGenerating === true)
  })

  // ========== Actions - 对话 CRUD ==========

  /**
   * 创建新对话
   */
  const createConversation = (options?: {
    title?: string
    model?: string
    projectId?: string | null
  }): Conversation => {
    const now = Date.now()
    const newConversation: Conversation = {
      id: uuidv4(),
      title: options?.title || '新对话',
      draft: '',
      tree: createEmptyTree(),
      model: options?.model || DEFAULT_MODEL,
      createdAt: now,
      updatedAt: now,
      projectId: options?.projectId ?? null,
      status: DEFAULT_CONVERSATION_STATUS,
      tags: [],
      webSearch: {
        enabled: false,
        level: 'normal'
      },
      reasoningPreference: { ...DEFAULT_REASONING_PREFERENCE },
      samplingParameters: { ...DEFAULT_SAMPLING_PARAMETERS },
      pdfEngine: 'pdf-text',
      generationStatus: 'idle',
      isGenerating: false,
      generationError: null,
      scrollPosition: 0
    }

    // 新对话添加到数组开头，使其显示在列表顶部
    conversations.value.unshift(newConversation)
    return newConversation
  }

  /**
   * 删除对话
   */
  const deleteConversation = async (conversationId: string): Promise<boolean> => {
    const index = conversations.value.findIndex(c => c.id === conversationId)
    if (index === -1) return false

    // 从对话列表中移除
    conversations.value.splice(index, 1)

    // 从打开的标签中移除
    const tabIndex = openTabIds.value.indexOf(conversationId)
    if (tabIndex !== -1) {
      // 批量更新：先计算新状态，然后一次性更新
      const newTabIds = openTabIds.value.filter(id => id !== conversationId)
      let newActiveTabId = activeTabId.value

      // 如果删除的是当前激活的标签，切换到下一个标签
      if (activeTabId.value === conversationId) {
        if (newTabIds.length > 0) {
          // 优先选择右侧标签，否则选择左侧标签
          newActiveTabId = tabIndex < newTabIds.length
            ? newTabIds[tabIndex]
            : newTabIds[newTabIds.length - 1]
        } else {
          newActiveTabId = null
        }
      }

      // 一次性更新所有状态
      openTabIds.value = newTabIds
      activeTabId.value = newActiveTabId
    }

    // 从 SQLite 删除对话
    const { sqliteChatPersistence } = await import('../services/chatPersistence')
    await sqliteChatPersistence.deleteConversation(conversationId)
    console.log('✅ 对话已从 SQLite 删除:', conversationId)

    return true
  }

  /**
   * 重命名对话
   */
  const renameConversation = (conversationId: string, newTitle: string): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    conversation.title = newTitle
    conversation.updatedAt = Date.now()
    return true
  }

  // ========== Actions - 标签页管理 ==========

  /**
   * 在标签页中打开对话
   */
  const openConversationInTab = (conversationId: string): void => {
    // 检查对话是否存在
    if (!conversationMap.value.has(conversationId)) {
      console.warn(`[ConversationStore] 对话不存在: ${conversationId}`)
      return
    }

    // 如果已经打开，直接激活
    if (openTabIds.value.includes(conversationId)) {
      activeTabId.value = conversationId
      return
    }

    // 批量更新：先创建新数组，然后一次性替换
    // 这样可以避免中间状态触发 Vue 组件更新
    const newTabIds = [...openTabIds.value, conversationId]
    openTabIds.value = newTabIds
    activeTabId.value = conversationId
  }

  /**
   * 关闭标签页
   */
  const closeConversationTab = (conversationId: string): void => {
    const index = openTabIds.value.indexOf(conversationId)
    if (index === -1) return

    // 批量更新：先计算新状态，然后一次性更新
    const newTabIds = openTabIds.value.filter(id => id !== conversationId)
    let newActiveTabId = activeTabId.value

    // 如果关闭的是当前激活的标签，切换到下一个标签
    if (activeTabId.value === conversationId) {
      if (newTabIds.length > 0) {
        // 优先选择右侧标签，否则选择左侧标签
        newActiveTabId = index < newTabIds.length
          ? newTabIds[index]
          : newTabIds[newTabIds.length - 1]
      } else {
        newActiveTabId = null
      }
    }

    // 一次性更新所有状态
    openTabIds.value = newTabIds
    activeTabId.value = newActiveTabId
  }

  /**
   * 设置激活的标签页
   */
  const setActiveTab = (conversationId: string | null): void => {
    activeTabId.value = conversationId
  }

  // ========== Actions - 对话配置管理 ==========

  /**
   * 更新对话草稿
   */
  const updateConversationDraft = (conversationId: string, draft: string): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    conversation.draft = draft
    conversation.updatedAt = Date.now()
    return true
  }

  /**
   * 设置 Web 搜索开关
   */
  const setWebSearchEnabled = (conversationId: string, enabled: boolean): boolean => {
    console.log('🌐 [ConversationStore] setWebSearchEnabled 调用', {
      conversationId,
      enabled,
      conversationExists: !!conversationMap.value.get(conversationId)
    })
    
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) {
      console.error('❌ [ConversationStore] 对话不存在:', conversationId)
      return false
    }

    if (!conversation.webSearch) {
      console.log('📝 [ConversationStore] 初始化 webSearch 对象')
      conversation.webSearch = { enabled: false, level: 'normal' }
    }
    
    console.log('📝 [ConversationStore] 更新前:', { ...conversation.webSearch })
    conversation.webSearch.enabled = enabled
    console.log('✅ [ConversationStore] 更新后:', { ...conversation.webSearch })
    
    conversation.updatedAt = Date.now()
    
    // 标记为脏数据，触发自动保存
    const persistenceStore = usePersistenceStore()
    persistenceStore.markConversationDirty(conversationId)
    
    return true
  }

  /**
   * 设置 Web 搜索级别
   */
  const setWebSearchLevel = (conversationId: string, level: WebSearchLevel): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    if (!conversation.webSearch) {
      conversation.webSearch = { enabled: false, level: 'normal' }
    }
    
    // 只有在网络搜索已启用时才允许设置级别
    if (!conversation.webSearch.enabled) {
      console.warn(`[ConversationStore] 网络搜索未启用，无法设置搜索级别`)
      return false
    }
    
    conversation.webSearch.level = level
    conversation.updatedAt = Date.now()
    
    // 标记为脏数据，触发自动保存
    const persistenceStore = usePersistenceStore()
    persistenceStore.markConversationDirty(conversationId)
    
    return true
  }

  /**
   * 设置推理偏好
   */
  const setReasoningPreference = (conversationId: string, preference: Partial<ReasoningPreference>): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    // 合并部分更新，过滤掉 undefined
    if (!conversation.reasoningPreference) {
      conversation.reasoningPreference = { 
        visibility: 'visible', 
        effort: 'medium', 
        maxTokens: null,
        mode: 'medium' // 默认为中档模式
      }
    }
    
    Object.keys(preference).forEach(key => {
      const value = preference[key as keyof ReasoningPreference]
      if (value !== undefined) {
        (conversation.reasoningPreference as any)[key] = value
      }
    })
    
    conversation.updatedAt = Date.now()
    
    // 标记为脏数据，触发自动保存
    const persistenceStore = usePersistenceStore()
    persistenceStore.markConversationDirty(conversationId)
    
    return true
  }

  /**
   * 设置采样参数
   */
  const setSamplingParameters = (conversationId: string, parameters: Partial<SamplingParameterSettings>): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    if (!conversation.samplingParameters) {
      conversation.samplingParameters = { ...DEFAULT_SAMPLING_PARAMETERS }
    }
    
    // 合并部分更新
    Object.keys(parameters).forEach(key => {
      const value = parameters[key as keyof SamplingParameterSettings]
      if (value !== undefined) {
        (conversation.samplingParameters as any)[key] = value
      }
    })
    
    conversation.updatedAt = Date.now()
    
    // 标记为脏数据，触发自动保存
    const persistenceStore = usePersistenceStore()
    persistenceStore.markConversationDirty(conversationId)
    
    return true
  }

  /**
   * 设置 PDF 引擎
   */
  const setPdfEngine = (conversationId: string, engine: 'pdf-text' | 'mistral-ocr' | 'native'): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    conversation.pdfEngine = engine
    conversation.updatedAt = Date.now()
    
    // 标记为脏数据，触发自动保存
    const persistenceStore = usePersistenceStore()
    persistenceStore.markConversationDirty(conversationId)
    
    return true
  }

  /**
   * 更新对话模型
   */
  const updateConversationModel = (conversationId: string, model: string): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    conversation.model = model
    conversation.updatedAt = Date.now()
    return true
  }

  /**
   * 设置对话状态
   */
  const setConversationStatus = (conversationId: string, status: ConversationStatus): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    conversation.status = normalizeConversationStatus(status)
    conversation.updatedAt = Date.now()
    return true
  }

  /**
   * 设置对话标签
   */
  const setConversationTags = (conversationId: string, tags: string[]): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    conversation.tags = normalizeConversationTags(tags)
    conversation.updatedAt = Date.now()
    return true
  }

  /**
   * 添加单个标签
   */
  const addTag = (conversationId: string, tag: string): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    if (!conversation.tags) {
      conversation.tags = []
    }
    if (!conversation.tags.includes(tag)) {
      conversation.tags.push(tag)
      conversation.updatedAt = Date.now()
    }
    return true
  }

  /**
   * 移除单个标签
   */
  const removeTag = (conversationId: string, tag: string): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    if (conversation.tags) {
      conversation.tags = conversation.tags.filter(t => t !== tag)
      conversation.updatedAt = Date.now()
    }
    return true
  }

  /**
   * 添加标签
   */
  const addConversationTag = (conversationId: string, tag: string): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    const normalizedTag = tag.trim()
    if (!normalizedTag || conversation.tags.includes(normalizedTag)) {
      return false
    }

    conversation.tags.push(normalizedTag)
    conversation.updatedAt = Date.now()
    return true
  }

  /**
   * 移除标签
   */
  const removeConversationTag = (conversationId: string, tag: string): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    const index = conversation.tags.indexOf(tag)
    if (index === -1) return false

    conversation.tags.splice(index, 1)
    conversation.updatedAt = Date.now()
    return true
  }

  /**
   * 设置生成状态
   * @param conversationId - 对话 ID
   * @param status - 生成状态：'idle' | 'sending' | 'receiving' | boolean（兼容旧版）
   */
  const setGenerationStatus = (
    conversationId: string, 
    status: 'idle' | 'sending' | 'receiving' | boolean
  ): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    // 向后兼容：boolean 参数转换为状态字符串
    if (typeof status === 'boolean') {
      conversation.generationStatus = status ? 'sending' : 'idle'
      conversation.isGenerating = status
    } else {
      conversation.generationStatus = status
      conversation.isGenerating = status !== 'idle'
    }
    
    return true
  }

  /**
   * 设置错误状态
   */
  const setGenerationError = (conversationId: string, error: { code?: string, message: string, details?: any } | null): boolean => {
    const conversation = conversationMap.value.get(conversationId)
    if (!conversation) return false

    conversation.generationError = error
    return true
  }

  // ========== 批量操作 ==========

  /**
   * 批量设置对话列表
   */
  const setConversations = (newConversations: Conversation[]): void => {
    conversations.value = newConversations
  }

  /**
   * 清空所有对话
   */
  const clearConversations = (): void => {
    conversations.value = []
    openTabIds.value = []
    activeTabId.value = null
  }

  /**
   * 根据 ID 获取对话
   */
  const getConversationById = (conversationId: string): Conversation | null => {
    return conversationMap.value.get(conversationId) || null
  }

  return {
    // State
    conversations,
    loadingConversationIds,
    openTabIds,
    activeTabId,

    // Computed
    activeConversation,
    conversationMap,
    hasAnyGeneratingConversation,

    // Actions - CRUD
    createConversation,
    deleteConversation,
    renameConversation,

    // Actions - 标签页
    openConversationInTab,
    closeConversationTab,
    setActiveTab,

    // Actions - 配置
    updateConversationDraft,
    setWebSearchEnabled,
    setWebSearchLevel,
    setReasoningPreference,
    setSamplingParameters,
    setPdfEngine,
    updateConversationModel,
    setConversationStatus,
    setConversationTags,
    addTag,
    removeTag,
    addConversationTag,
    removeConversationTag,
    setGenerationStatus,
    setGenerationError,

    // 批量操作
    setConversations,
    clearConversations,
    getConversationById
  }
})

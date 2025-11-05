import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from './index'
import { createTextMessage, extractTextFromMessage } from '../types/chat'
import { electronStore as persistenceStore, isUsingElectronStoreFallback } from '../utils/electronBridge'
import {
  createEmptyTree,
  getCurrentVersion,
  extractTextFromBranch,
  addBranch,
  addVersionToBranch,
  switchVersion,
  deleteBranch,
  removeBranchVersion as removeBranchVersionFromTree,
  getCurrentPathMessages,
  appendTokenToBranch,
  appendImageToBranch,
  updateBranchContent,
  migrateMessagesToTree,
  getPathToBranch,
  restoreTree,
  serializeTree
} from './branchTreeHelpers'

/**
 * 聊天 Store
 * 用于管理 AI 多会话聊天相关的状态和操作
 * 
 * ========== 核心设计原则 ==========
 * 
 * 🌳 分支树架构：
 * 所有对话消息使用树形结构管理，支持：
 * - 多分支对话（编辑后可保留旧版本）
 * - 版本控制（每个分支可有多个版本）
 * - 路径追踪（当前激活的对话路径）
 * 
 * 🔒 异步安全 Actions（带 conversationId 参数）：
 * 所有核心操作都是"原子操作"，可在异步流程中安全并发调用：
 * - addMessageBranch(conversationId, role, parts, parentBranchId?)
 * - appendTokenToBranchVersion(conversationId, branchId, token)
 * - updateBranchParts(conversationId, branchId, parts)
 * - setConversationGenerationStatus(conversationId, status)
 * - renameConversation(conversationId, newTitle)
 * 
 * 合同要求：
 * ✅ 必须传入 conversationId 参数，精确定位目标对话
 * ✅ 禁止依赖 activeTabId、activeConversation 等全局状态
 * ✅ 线程安全，不受标签切换影响
 * ✅ 适用于流式生成、异步回调等场景
 */
export const useChatStore = defineStore('chat', () => {
  // ========== State (状态) ==========
  
  /**
   * 从 appStore 获取 API Key
   */
  const appStore = useAppStore()
  const apiKey = computed(() => appStore.apiKey)
  
  /**
   * 所有对话会话数组
   * 每个对话对象格式: { 
   *   id: string,              // 唯一标识符
   *   title: string,           // 对话标题
   *   tree: ConversationTree,  // 分支树结构（核心数据）
   *   model: string,           // 使用的模型名称
   *   generationStatus: 'idle' | 'sending' | 'receiving', // 生成状态
   *   draft: string,           // 草稿内容
   *   createdAt: number,       // 创建时间戳
   *   updatedAt: number        // 更新时间戳
   * }
   * 
   * 🌳 分支树结构（ConversationTree）：
   * {
   *   branches: Map<branchId, MessageBranch>,
   *   rootBranchIds: string[],
   *   currentPath: string[]  // 当前激活的分支路径
   * }
   */
  const conversations = ref([])
  
  /**
   * 在标签页中打开的对话 ID 数组
   * 按打开顺序排列
   */
  const openConversationIds = ref([])

  /**
   * 当前激活的标签页对话 ID
   */
  const activeTabId = ref(null)

  /**
   * 可用模型列表（仅 ID，向后兼容）
   */
  const availableModels = ref([])

  /**
   * 可用模型完整数据 Map
   * Map<modelId, modelObject>
   * modelObject 包含: { id, name, description, context_length, pricing, input_modalities, series, etc. }
   */
  const availableModelsMap = ref(new Map())

  /**
   * 用户收藏的模型 ID 列表
   * Set<string>
   */
  const favoriteModelIds = ref(new Set())

  /**
   * 选中的模型
   * 默认使用 gemini-2.5-pro
   */
  const selectedModel = ref('gemini-2.5-pro')

  // ========== Getters (计算属性) ==========
  
  /**
   * 获取当前激活的对话对象
   * @returns {Object|null} 当前对话对象或 null
   */
  const activeConversation = computed(() => {
    if (!activeTabId.value) {
      return null
    }
    return conversations.value.find(conv => conv.id === activeTabId.value) || null
  })

  /**
   * 检查是否有任何对话正在生成内容
   * @returns {boolean} 如果任何对话正在生成内容则返回 true
   */
  const isAnyConversationLoading = computed(() => {
    return conversations.value.some(conv => conv.generationStatus !== 'idle')
  })

  /**
   * 获取收藏的模型列表（完整对象）
   * @returns {Array<Object>} 收藏的模型对象数组
   */
  const favoriteModels = computed(() => {
    const favorites = []
    for (const modelId of favoriteModelIds.value) {
      const model = availableModelsMap.value.get(modelId)
      if (model) {
        favorites.push(model)
      }
    }
    return favorites
  })

  /**
   * 获取所有可用模型的数组（从 Map 转换）
   * @returns {Array<Object>} 所有模型对象数组
   */
  const allModels = computed(() => {
    return Array.from(availableModelsMap.value.values())
  })

  // ========== Actions (操作) ==========
  
  /**
   * 从 electron-store 加载所有对话
   * 如果没有对话，则创建一个新对话并在标签页中打开
   */
  const loadConversations = async () => {
    try {
      const savedConversations = await persistenceStore.get('conversations')
      const savedOpenIds = await persistenceStore.get('openConversationIds')
      const savedActiveTabId = await persistenceStore.get('activeTabId')
      
      // 加载收藏的模型列表
      const savedFavoriteModelIds = await persistenceStore.get('favoriteModelIds')
      if (savedFavoriteModelIds && Array.isArray(savedFavoriteModelIds)) {
        favoriteModelIds.value = new Set(savedFavoriteModelIds)
      }
      
      if (savedConversations && Array.isArray(savedConversations) && savedConversations.length > 0) {
        // 迁移或恢复对话数据
        conversations.value = savedConversations.map(conv => {
          // 如果已经是新格式（有 tree 字段），使用 restoreTree 恢复
          if (conv.tree && conv.tree.branches) {
            return {
              ...conv,
              generationStatus: 'idle', // 重置状态
              draft: conv.draft || '',
              tree: restoreTree(conv.tree), // 使用 restoreTree 确保 Map 响应式
              webSearchEnabled: conv.webSearchEnabled ?? false,
              webSearchLevel: conv.webSearchLevel || 'normal'
            }
          }
          
          // 旧格式：迁移消息数组到树形结构
          // 先处理旧格式的消息（如果有 text 字段但没有 parts）
          const messages = (conv.messages || []).map(msg => {
            if (msg.parts && Array.isArray(msg.parts)) {
              return msg
            }
            return {
              id: msg.id || uuidv4(),
              role: msg.role,
              parts: [{ type: 'text', text: msg.text || '' }],
              timestamp: msg.timestamp || Date.now()
            }
          })
          
          // 转换为树形结构
          const tree = migrateMessagesToTree(messages)
          
          return {
            id: conv.id,
            title: conv.title,
            tree,
            model: conv.model || conv.modelName || 'gemini-2.0-flash-exp',
            generationStatus: 'idle',
            draft: conv.draft || '',
            createdAt: conv.createdAt || Date.now(),
            updatedAt: conv.updatedAt || Date.now(),
            webSearchEnabled: false,
            webSearchLevel: 'normal'
          }
        })
        
        // 恢复打开的标签页列表
        if (savedOpenIds && Array.isArray(savedOpenIds) && savedOpenIds.length > 0) {
          // 过滤掉不存在的对话 ID
          openConversationIds.value = savedOpenIds.filter(id => 
            conversations.value.some(conv => conv.id === id)
          )
        }
        
        // 恢复激活的标签页
        if (savedActiveTabId && conversations.value.some(conv => conv.id === savedActiveTabId)) {
          activeTabId.value = savedActiveTabId
        } else if (openConversationIds.value.length > 0) {
          activeTabId.value = openConversationIds.value[0]
        }
        
        // 如果没有打开的标签页，打开第一个对话
        if (openConversationIds.value.length === 0 && conversations.value.length > 0) {
          openConversationInTab(conversations.value[0].id)
        }
      } else {
        const newId = createNewConversation()
        openConversationInTab(newId)
      }
    } catch (error) {
      console.error('❌ 加载对话失败:', error)
      // 出错时也创建一个新对话
      const newId = createNewConversation()
      openConversationInTab(newId)
    }
  }

  /**
   * 保存所有对话到 electron-store
   */
  const saveConversations = async () => {
    try {
      // 序列化对话，使用 serializeTree 处理 Map
      const serializableConversations = conversations.value.map(conv => {
        if (!conv.tree || !conv.tree.branches) {
          return conv
        }
        
        return {
          ...conv,
          tree: serializeTree(conv.tree) // 使用 serializeTree 将 Map 转为数组
        }
      })
      
      // ✅ 关键修复：通过 JSON.parse(JSON.stringify()) 完全移除响应式包装
      // electron-store 使用 structuredClone，无法处理 Vue reactive 对象
      const fullyPlainConversations = JSON.parse(JSON.stringify(serializableConversations))
      
      const plainOpenIds = [...openConversationIds.value]
      const plainActiveTabId = activeTabId.value
      
      await persistenceStore.set('conversations', fullyPlainConversations)
      await persistenceStore.set('openConversationIds', plainOpenIds)
      await persistenceStore.set('activeTabId', plainActiveTabId)
    } catch (error) {
      console.error('❌ 保存对话失败:', error)
    }
  }

  /**
   * Debounced 版本的保存函数
   * 用于频繁操作（如流式更新）时避免过度写入
   */
  let saveTimeout = null
  const debouncedSaveConversations = () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
    saveTimeout = setTimeout(() => {
      saveConversations()
      saveTimeout = null
    }, 500) // 500ms 防抖
  }

  /**
   * 保存收藏的模型列表到 electron-store
   */
  const saveFavoriteModels = async () => {
    try {
      const favoriteArray = Array.from(favoriteModelIds.value)
      await persistenceStore.set('favoriteModelIds', favoriteArray)
    } catch (error) {
      console.error('❌ 保存收藏模型列表失败:', error)
    }
  }

  /**
   * 创建新对话
   * @param {string} title - 可选的对话标题
   * @returns {string} 新对话的 ID
   */
  const createNewConversation = (title = '新对话') => {
    // Reuse an existing unused conversation instead of spawning duplicates.
    // 只有当空白聊天的名称为默认名称时才复用
    const emptyConversationIndex = conversations.value.findIndex((conversation) => {
      const tree = conversation?.tree
      if (!tree) return false

      const hasBranches = tree.branches && tree.branches.size > 0
      const hasPath = Array.isArray(tree.currentPath) && tree.currentPath.length > 0
      const hasDraft = Boolean(conversation.draft)
      const isDefaultTitle = conversation.title === '新对话'
      
      // 必须同时满足：空白聊天 且 是默认名称
      return !hasBranches && !hasPath && !hasDraft && isDefaultTitle
    })

    if (emptyConversationIndex !== -1) {
      const [emptyConversation] = conversations.value.splice(emptyConversationIndex, 1)
      if (emptyConversation) {
        emptyConversation.updatedAt = Date.now()
        conversations.value.unshift(emptyConversation)
        saveConversations()
        return emptyConversation.id
      }
    }

    // 使用 appStore 的默认模型，如果未设置则使用 selectedModel
    const appStore = useAppStore()
    const modelToUse = appStore.defaultModel || selectedModel.value
    
    const newConversation = {
      id: uuidv4(),
      title: title,
      tree: createEmptyTree(), // 使用树形结构替代 messages 数组
      model: modelToUse,
      generationStatus: 'idle',
      draft: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      webSearchEnabled: false,
      webSearchLevel: 'normal'
    }
    
    // 添加到数组开头
    conversations.value.unshift(newConversation)
    
    // 保存到本地
    saveConversations()
    
    return newConversation.id
  }

  /**
   * 在标签页中打开对话
   * @param {string} conversationId - 对话 ID
   */
  const openConversationInTab = (conversationId) => {
    if (!conversationId) {
      console.error('❌ conversationId 不能为空')
      return
    }

    // 检查对话是否存在
    const conversation = conversations.value.find(conv => conv.id === conversationId)
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    // 如果已经打开，直接激活
    if (openConversationIds.value.includes(conversationId)) {
      activeTabId.value = conversationId
    } else {
      // 添加到打开列表
      openConversationIds.value.push(conversationId)
      activeTabId.value = conversationId
    }

    saveConversations()
  }

  /**
   * 关闭标签页（智能版本）
   * @param {string} conversationId - 要关闭的对话 ID
   */
  const closeConversationTab = (conversationId) => {
    const index = openConversationIds.value.findIndex(id => id === conversationId)
    
    if (index === -1) {
      console.error('❌ 标签页未打开:', conversationId)
      return
    }

    const isActiveTab = activeTabId.value === conversationId

    // 从打开列表中移除
    openConversationIds.value.splice(index, 1)
    
    // 只有关闭的是当前激活的标签页时，才需要重新选择激活标签
    if (isActiveTab) {
      if (openConversationIds.value.length > 0) {
        // 优先激活前一个标签页；如果关闭的是第一个，则激活新的第一个
        const newIndex = index > 0 ? index - 1 : 0
        activeTabId.value = openConversationIds.value[newIndex]
      } else {
        // 没有打开的标签页了
        activeTabId.value = null
      }
    }
    
    saveConversations()
  }

  /**
   * 更新对话草稿
   * @param {Object} params - { conversationId, draftText }
   */
  const updateConversationDraft = ({ conversationId, draftText }) => {
    const conversation = conversations.value.find(conv => conv.id === conversationId)
    
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    if (typeof draftText !== 'string') {
      console.error('❌ draftText 必须是字符串')
      return
    }

    conversation.draft = draftText
    // 注意：这里不调用 saveConversations，避免频繁写入
    // 草稿会在其他操作（如发送消息、切换标签）时自动保存
  }

  const setConversationWebSearchEnabled = (conversationId, enabled) => {
    const conversation = conversations.value.find(conv => conv.id === conversationId)

    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    conversation.webSearchEnabled = Boolean(enabled)
    if (!conversation.webSearchLevel) {
      conversation.webSearchLevel = 'normal'
    }
    conversation.updatedAt = Date.now()
    saveConversations()
  }

  const setConversationWebSearchLevel = (conversationId, level) => {
    const allowedLevels = ['quick', 'normal', 'deep']

    if (!allowedLevels.includes(level)) {
      console.warn('⚠️ 无效的 Web 搜索挡位:', level)
      return
    }

    const conversation = conversations.value.find(conv => conv.id === conversationId)

    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    conversation.webSearchLevel = level
    conversation.updatedAt = Date.now()
    saveConversations()
  }

  /**
   * 删除对话（简化版本 - 适配新的多实例管理策略）
   * @param {string} conversationId - 要删除的对话 ID
   * @returns {boolean} 是否成功删除
   */
  const deleteConversation = (conversationId) => {
    const index = conversations.value.findIndex(conv => conv.id === conversationId)
    
    if (index === -1) {
      console.error('❌ 找不到要删除的对话:', conversationId)
      return false
    }

    const conversation = conversations.value[index]

    // ========== 安全检查：禁止删除正在生成内容的对话 ==========
    if (conversation.generationStatus !== 'idle') {
      console.warn('⚠️ 无法删除正在生成内容的对话，请等待完成后再试')
      return false
    }

    // 检查该对话是否在打开的标签页中
    const tabIndex = openConversationIds.value.findIndex(id => id === conversationId)
    const isTabOpen = tabIndex !== -1
    const isActiveTab = activeTabId.value === conversationId

    // ========== 步骤 1：如果删除的是当前激活标签，需要先切换 ==========
    let needToCreateNew = false
    
    if (isActiveTab) {
      if (openConversationIds.value.length > 1) {
        // 还有其他打开的标签页，切换到相邻的
        const newIndex = tabIndex > 0 ? tabIndex - 1 : 0
        const newActiveId = openConversationIds.value[newIndex]
        activeTabId.value = newActiveId
      } else {
        // 这是唯一打开的标签页，需要先关闭它再决定下一步
        activeTabId.value = null
        
        if (conversations.value.length > 1) {
          // 还有其他对话（除了要删除的这个）
          const firstOtherConv = conversations.value.find(c => c.id !== conversationId)
          if (firstOtherConv) {
            // 切换到第一个其他对话，并确保它在打开列表中
            // 注意：必须先添加到 openConversationIds，再设置 activeTabId
            // 否则 v-for 不会渲染对应的组件
            if (!openConversationIds.value.includes(firstOtherConv.id)) {
              openConversationIds.value.push(firstOtherConv.id)
            }
            activeTabId.value = firstOtherConv.id
          }
        } else {
          // 这是最后一个对话，删除后需要创建新的
          needToCreateNew = true
        }
      }
    }

    // ========== 步骤 2：从打开列表移除 ==========
    if (isTabOpen) {
      openConversationIds.value.splice(tabIndex, 1)
    }

    // ========== 步骤 3：从对话列表删除 ==========
    conversations.value.splice(index, 1)

    // ========== 步骤 4：处理后续操作 ==========
    if (needToCreateNew) {
      const newId = createNewConversation()
      openConversationInTab(newId)
    } else {
      // 保存到本地
      saveConversations()
    }
    
    return true
  }

  /**
   * 重命名指定对话（原子操作 - 异步安全）
   * 
   * 🔒 合同约定：
   * - 必须传入 conversationId 和 newTitle 参数
   * - 重命名后会自动保存到本地存储
   * - 线程安全：可在异步流程中并发调用
   * 
   * @param {string} conversationId - 对话 ID（必需）
   * @param {string} newTitle - 新标题
   */
  const renameConversation = (conversationId, newTitle) => {
    const conversation = conversations.value.find(conv => conv.id === conversationId)
    
    if (!conversation) {
      console.error('❌ 找不到要重命名的对话:', conversationId)
      return
    }

    if (!newTitle || typeof newTitle !== 'string' || newTitle.trim() === '') {
      console.error('❌ 无效的标题:', newTitle)
      return
    }

    conversation.title = newTitle.trim()
    
    // 保存到本地
    saveConversations()
  }

  /**
   * 设置指定对话的生成状态（原子操作 - 异步安全）
   * 
   * 🔒 合同约定：
   * - 必须传入 conversationId 参数，禁止依赖 activeTabId 等全局状态
   * - 状态值必须是 'idle' | 'sending' | 'receiving' 之一
   * - 线程安全：可在异步流程中并发调用
   * 
   * @param {string} conversationId - 对话 ID（必需）
   * @param {'idle'|'sending'|'receiving'} status - 生成状态
   */
  const setConversationGenerationStatus = (conversationId, status) => {
    const conversation = conversations.value.find(conv => conv.id === conversationId)
    
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    const validStatuses = ['idle', 'sending', 'receiving']
    if (!validStatuses.includes(status)) {
      console.error('❌ status 参数必须是以下值之一:', validStatuses, '收到:', status)
      return
    }

    conversation.generationStatus = status
    
    // 开始新的生成时清除错误标记
    if (status === 'sending') {
      conversation.hasError = false
    }
  }

  /**
   * 设置指定对话的错误状态（原子操作 - 异步安全）
   * 
   * 🔒 合同约定：
   * - 必须传入 conversationId 参数
   * - 用于标记对话的最后一次生成是否发生错误
   * 
   * @param {string} conversationId - 对话 ID（必需）
   * @param {boolean} hasError - 是否有错误
   */
  const setConversationError = (conversationId, hasError) => {
    const conversation = conversations.value.find(conv => conv.id === conversationId)
    
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    conversation.hasError = hasError
  }

  /**
   * 设置可用模型列表（新版本 - 支持完整元数据）
   * @param {Array<Object>} models - 模型对象数组，每个对象包含 id, name, pricing 等元数据
   */
  const setAvailableModels = (models) => {
    if (!Array.isArray(models)) {
      console.error('❌ setAvailableModels 需要一个数组参数，但收到:', models)
      return
    }
    
    // 兼容处理：支持字符串数组（旧格式）和对象数组（新格式）
    if (models.length > 0 && typeof models[0] === 'string') {
      // 旧格式：字符串数组
      availableModels.value = models
    } else {
      // 新格式：对象数组
      availableModels.value = models.map(m => m.id) // 向后兼容
      
      // 构建 Map 存储完整元数据
      const newMap = new Map()
      for (const model of models) {
        if (model.id) {
          newMap.set(model.id, model)
        }
      }
      availableModelsMap.value = newMap
    }
    
    // 智能选择默认模型：如果当前选择的模型不在新列表中，自动切换到第一个模型
    const modelIds = availableModels.value
    if (modelIds.length > 0 && !modelIds.includes(selectedModel.value)) {
      const newDefaultModel = modelIds[0]
      selectedModel.value = newDefaultModel
    }
  }

  /**
   * 切换模型收藏状态
   * @param {string} modelId - 模型 ID
   */
  const toggleFavoriteModel = async (modelId) => {
    if (!modelId) {
      console.error('❌ toggleFavoriteModel: modelId 不能为空')
      return
    }
    
    if (favoriteModelIds.value.has(modelId)) {
      favoriteModelIds.value.delete(modelId)
    } else {
      favoriteModelIds.value.add(modelId)
    }
    
    // 持久化保存
    await saveFavoriteModels()
  }

  /**
   * 检查模型是否已收藏
   * @param {string} modelId - 模型 ID
   * @returns {boolean}
   */
  const isModelFavorited = (modelId) => {
    return favoriteModelIds.value.has(modelId)
  }

  /**
   * 设置选中的模型
   * @param {string} modelName - 模型名称
   */
  const setSelectedModel = (modelName) => {
    if (!modelName || typeof modelName !== 'string') {
      console.error('❌ setSelectedModel 需要一个字符串参数:', modelName)
      return
    }
    selectedModel.value = modelName
    console.log('✓ 已选择模型:', modelName)
  }

  /**
   * 更新指定对话使用的模型（原子操作 - 异步安全）
   * 
   * 🔒 合同约定：
   * - 必须传入 conversationId 参数，禁止依赖 activeTabId 等全局状态
   * - 更新后会自动保存到本地存储
   * - 线程安全：可在异步流程中并发调用
   * 
   * @param {string} conversationId - 对话 ID（必需）
   * @param {string} modelName - 模型名称
   */
  const updateConversationModel = (conversationId, modelName) => {
    const conversation = conversations.value.find(conv => conv.id === conversationId)
    
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    conversation.model = modelName
    
    // 保存到本地
    saveConversations()
    
    console.log('✓ 对话模型已更新:', conversation.id, '→', modelName)
  }

  // ========== 分支树操作方法 ==========

  /**
   * 添加消息分支到对话
   */
  const addMessageBranch = (conversationId, role, parts, parentBranchId = null) => {
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return null
    }
    
    const actualParentId = parentBranchId !== null 
      ? parentBranchId 
      : (conversation.tree.currentPath.length > 0 
          ? conversation.tree.currentPath[conversation.tree.currentPath.length - 1] 
          : null)
    
    const branchId = addBranch(conversation.tree, role, parts, actualParentId)
    
    // ✅ 重要：将新分支添加到 currentPath
    conversation.tree.currentPath = [...conversation.tree.currentPath, branchId]
    
    // 自动生成标题（第一条用户消息）
    if (conversation.tree.currentPath.length === 1 && conversation.title === '新对话' && role === 'user') {
      const textContent = parts
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('')
      if (textContent) {
        conversation.title = textContent.substring(0, 30) + (textContent.length > 30 ? '...' : '')
      }
    }
    
    saveConversations()
    return branchId
  }

  /**
   * 为分支添加新版本（重新生成）
   * @param {string} conversationId - 对话ID
   * @param {string} branchId - 分支ID
   * @param {Array} parts - 新版本内容
   * @param {boolean} inheritChildren - 是否继承子分支（编辑时为 true，重新生成时为 false）
   */
  const addBranchVersion = (conversationId, branchId, parts, inheritChildren = false, metadata = undefined) => {
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return null
    }
    
    try {
      const versionId = addVersionToBranch(conversation.tree, branchId, parts, inheritChildren, metadata)
      if (versionId) {
        saveConversations()
      }
      return versionId
    } catch (error) {
      console.error('❌ 添加分支版本失败:', error)
      return null
    }
  }

  /**
   * 切换分支版本
   */
  const switchBranchVersion = (conversationId, branchId, direction) => {
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (!conversation) return false
    
    const success = switchVersion(conversation.tree, branchId, direction)
    if (success) {
      saveConversations()
    }
    return success
  }

  /**
   * 删除分支
   */
  const deleteMessageBranch = (conversationId, branchId, deleteAllVersions) => {
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (!conversation) return false
    
    const success = deleteBranch(conversation.tree, branchId, deleteAllVersions)
    if (success) {
      saveConversations()
    }
    return success
  }

  /**
   * 追加文本到分支当前版本（流式生成）
   * 使用 debounced save 避免频繁写入
   */
  const appendTokenToBranchVersion = (conversationId, branchId, token) => {
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (!conversation) return false
    
    const success = appendTokenToBranch(conversation.tree, branchId, token)
    if (success) {
      debouncedSaveConversations() // 使用防抖保存
    }
    return success
  }

  /**
   * 追加图片到分支当前版本
   */
  const appendImageToBranchVersion = (conversationId, branchId, imageUrl) => {
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (!conversation) return false
    
    const success = appendImageToBranch(conversation.tree, branchId, imageUrl)
    if (success) {
      debouncedSaveConversations() // 使用防抖保存
    }
    return success
  }

  /**
   * 更新分支内容
   */
  const updateBranchParts = (conversationId, branchId, parts, options = {}) => {
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (!conversation) return false
    
    const success = updateBranchContent(conversation.tree, branchId, parts, options)
    if (success) {
      saveConversations()
    }
    return success
  }

  /**
   * 移除分支上的指定版本
   */
  const removeBranchVersion = (conversationId, branchId, versionId) => {
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (!conversation) return false

    const success = removeBranchVersionFromTree(conversation.tree, branchId, versionId)
    if (success) {
      saveConversations()
    }
    return success
  }

  /**
   * 获取当前对话路径的消息（用于API调用）
   */
  const getConversationMessages = (conversationId) => {
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (!conversation) return []
    
    return getCurrentPathMessages(conversation.tree)
  }

  // 返回状态、计算属性和方法
  return {
    // State
    apiKey,
    conversations,
    openConversationIds,
    activeTabId,
    availableModels,
    availableModelsMap,
    favoriteModelIds,
    selectedModel,
    
    // Getters
    activeConversation,
    isAnyConversationLoading,
    favoriteModels,
    allModels,
    
    // Actions - 对话管理
    loadConversations,
    saveConversations,
    debouncedSaveConversations,
    saveFavoriteModels,
    createNewConversation,
    openConversationInTab,
    closeConversationTab,
    updateConversationDraft,
  setConversationWebSearchEnabled,
  setConversationWebSearchLevel,
    deleteConversation,
    renameConversation,
    
    // Actions - 分支树操作（核心 API）
    addMessageBranch,
    addBranchVersion,
    switchBranchVersion,
    deleteMessageBranch,
    appendTokenToBranchVersion,
    appendImageToBranchVersion,
    updateBranchParts,
  removeBranchVersion,
    getConversationMessages,
    
    // Actions - 状态管理
    setConversationGenerationStatus,
    setConversationError,
    updateConversationModel,
    
    // Actions - 模型管理
    setAvailableModels,
    setSelectedModel,
    toggleFavoriteModel,
    isModelFavorited,
  }
})

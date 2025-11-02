import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from './index'

/**
 * 聊天 Store
 * 用于管理 Gemini AI 多会话聊天相关的状态和操作
 * 
 * ========== API 设计原则 ==========
 * 
 * 🔒 异步安全 Actions（带 conversationId 参数）：
 * 这些 actions 被设计为"原子操作"，可在异步流程中安全并发调用：
 * - addMessageToConversation(conversationId, message)
 * - appendTokenToMessage(conversationId, token)
 * - setConversationGenerationStatus(conversationId, status)
 * - clearConversationMessages(conversationId)
 * - updateConversationModel(conversationId, modelName)
 * - updateMessage(conversationId, messageId, newText)
 * - deleteMessage(conversationId, messageId)
 * - renameConversation(conversationId, newTitle)
 * 
 * 合同要求：
 * ✅ 必须传入 conversationId 参数，精确定位目标对话
 * ✅ 禁止依赖 activeTabId、activeConversation 等全局状态
 * ✅ 线程安全，不受标签切换影响
 * ✅ 适用于流式生成、异步回调等场景
 * 
 * ⚠️ 已弃用 Actions（依赖全局状态）：
 * 这些方法仅为向后兼容保留，不应在新代码中使用：
 * - addMessageToActiveConversation(message)
 * - appendTokenToLastMessage(token)
 * - clearActiveConversationMessages()
 * - updateActiveConversationModel(modelName)
 * 
 * 问题：
 * ❌ 依赖 activeTabId 全局状态
 * ❌ 在异步流程中可能定位错误的对话
 * ❌ 受标签切换影响，不可靠
 */
export const useChatStore = defineStore('chat', () => {
  // ========== State (状态) ==========
  
  /**
   * 从 appStore 获取 API Key
   * 不再在此处维护独立的 apiKey,而是引用 appStore 的 apiKey
   */
  const appStore = useAppStore()
  console.log('chatStore 初始化 - appStore:', appStore)
  console.log('chatStore 初始化 - appStore.apiKey:', appStore.apiKey)
  console.log('chatStore 初始化 - appStore.apiKey 类型:', typeof appStore.apiKey)
  console.log('chatStore 初始化 - appStore.apiKey 是否为对象:', typeof appStore.apiKey === 'object')
  
  // 尝试两种方式
  console.log('尝试 appStore.apiKey (直接访问):', appStore.apiKey)
  console.log('尝试 appStore.apiKey.value (带 .value):', appStore.apiKey?.value)
  
  const apiKey = computed(() => {
    // 检查 appStore.apiKey 的实际类型
    const directAccess = appStore.apiKey
    console.log('computed 内 - appStore.apiKey 直接访问:', directAccess, '类型:', typeof directAccess)
    
    // Pinia 的 auto-unwrap: 从 store 访问 ref 时会自动解包
    // 所以 appStore.apiKey 应该已经是字符串，不需要 .value
    const key = directAccess
    console.log('chatStore.apiKey computed 被调用, 返回值 =', key)
    return key
  })
  
  /**
   * 所有对话会话数组
   * 每个对话对象格式: { 
   *   id: string,        // 唯一标识符
   *   title: string,     // 对话标题
   *   messages: [],      // 消息数组 [{ role: 'user' | 'model', text: '内容' }]
   *   model: string,     // 使用的模型名称
   *   isLoading: boolean,// 该对话是否正在加载中
   *   draft: string      // 草稿内容
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
   * 可用模型列表
   * 从 API 获取的模型名称列表
   */
  const availableModels = ref([])

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

  // ========== Actions (操作) ==========
  
  /**
   * 从 electron-store 加载所有对话
   * 如果没有对话，则创建一个新对话并在标签页中打开
   */
  const loadConversations = async () => {
    try {
      console.log('正在加载对话列表...')
      const savedConversations = await window.electronStore.get('conversations')
      const savedOpenIds = await window.electronStore.get('openConversationIds')
      const savedActiveTabId = await window.electronStore.get('activeTabId')
      
      if (savedConversations && Array.isArray(savedConversations) && savedConversations.length > 0) {
        // 确保每个对话都有必要的属性，并为旧数据的消息添加 ID 和时间戳
        conversations.value = savedConversations.map(conv => ({
          ...conv,
          // 兼容旧数据：将 isLoading 转换为 generationStatus
          generationStatus: conv.generationStatus || (conv.isLoading ? 'receiving' : 'idle'),
          draft: conv.draft || '',
          // 为每条消息确保有 id 和 timestamp（兼容旧数据）
          messages: (conv.messages || []).map(msg => ({
            id: msg.id || uuidv4(),
            role: msg.role,
            text: msg.text,
            timestamp: msg.timestamp || Date.now()
          }))
        }))
        
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
        
        console.log(`✓ 成功加载 ${savedConversations.length} 个对话`)
      } else {
        // 没有保存的对话，创建一个新的
        console.log('没有找到已保存的对话，创建新对话...')
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
      // 使用 JSON 序列化确保所有数据都是可克隆的
      const plainConversations = JSON.parse(JSON.stringify(conversations.value))
      const plainOpenIds = [...openConversationIds.value] // 数组浅拷贝
      const plainActiveTabId = activeTabId.value
      
      await window.electronStore.set('conversations', plainConversations)
      await window.electronStore.set('openConversationIds', plainOpenIds)
      await window.electronStore.set('activeTabId', plainActiveTabId)
      
      console.log('✓ 对话已保存')
    } catch (error) {
      console.error('❌ 保存对话失败:', error)
      console.error('详细信息:', {
        conversationsCount: conversations.value?.length,
        openIdsCount: openConversationIds.value?.length,
        activeTabId: activeTabId.value
      })
    }
  }

  /**
   * 创建新对话
   * @param {string} title - 可选的对话标题
   * @returns {string} 新对话的 ID
   */
  const createNewConversation = (title = '新对话') => {
    const newConversation = {
      id: uuidv4(),
      title: title,
      messages: [],
      model: selectedModel.value,
      generationStatus: 'idle', // 'idle' | 'sending' | 'receiving'
      hasError: false, // 标记最后一次生成是否有错误
      draft: ''
    }
    
    // 添加到数组开头
    conversations.value.unshift(newConversation)
    
    // 保存到本地（不自动打开标签页，由调用方决定）
    saveConversations()
    
    console.log('✓ 创建新对话:', newConversation.id, newConversation.title)
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
      console.log('✓ 切换到已打开的标签页:', conversationId)
    } else {
      // 添加到打开列表
      openConversationIds.value.push(conversationId)
      activeTabId.value = conversationId
      console.log('✓ 在新标签页中打开对话:', conversationId, conversation.title)
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
        console.log('✓ 已切换到标签页:', activeTabId.value)
      } else {
        // 没有打开的标签页了
        activeTabId.value = null
        console.log('✓ 所有标签页已关闭')
      }
    }
    
    saveConversations()
    console.log('✓ 已关闭标签页:', conversationId)
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

  /**
   * 设置激活的对话（已废弃，使用 openConversationInTab 替代）
   * @deprecated
```
   * @param {string} conversationId - 对话 ID
   */
  const setActiveConversation = (conversationId) => {
    // 兼容旧代码，直接调用新方法
    openConversationInTab(conversationId)
  }

  /**
   * 向指定对话添加消息（原子操作 - 异步安全）
   * 
   * 🔒 合同约定：
   * - 必须传入 conversationId 参数，禁止依赖 activeTabId 等全局状态
   * - 适用于任何需要添加消息的场景（用户消息、AI 响应、错误消息）
   * - 线程安全：可在异步流程中并发调用
   * 
   * @param {string} conversationId - 对话 ID（必需）
   * @param {Object} message - 消息对象 { role: 'user' | 'model', text: '消息内容' }
   */
  const addMessageToConversation = (conversationId, message) => {
    if (!message || !message.role || typeof message.text !== 'string') {
      console.error('❌ 无效的消息格式:', message)
      return
    }

    const conversation = conversations.value.find(conv => conv.id === conversationId)
    
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    // 为消息添加唯一 ID 和时间戳（如果没有的话）
    const messageWithId = {
      id: message.id || uuidv4(),
      role: message.role,
      text: message.text,
      timestamp: message.timestamp || Date.now()
    }

    conversation.messages.push(messageWithId)
    
    // 如果是第一条用户消息且标题还是"新对话"，自动生成标题
    if (conversation.messages.length === 1 && conversation.title === '新对话' && message.role === 'user') {
      // 使用用户第一条消息的前30个字符作为标题
      const firstUserMessage = message.text.trim()
      if (firstUserMessage) {
        conversation.title = firstUserMessage.substring(0, 30) + (firstUserMessage.length > 30 ? '...' : '')
        console.log('✓ 自动生成对话标题:', conversation.title)
      }
    }
    
    // 保存到本地
    saveConversations()
  }

  /**
   * 添加消息到当前激活的对话（兼容旧代码）
   * @deprecated 请使用 addMessageToConversation(conversationId, message)
   * ⚠️ 依赖全局状态 activeTabId，不适用于异步流程
   * @param {Object} message - 消息对象 { role: 'user' | 'model', text: '消息内容' }
   */
  const addMessageToActiveConversation = (message) => {
    if (!activeTabId.value) {
      console.error('❌ 没有激活的对话')
      return
    }
    addMessageToConversation(activeTabId.value, message)
  }

  /**
   * 向指定对话的最后一条消息追加文本（原子操作 - 异步安全）
   * 
   * 🔒 合同约定：
   * - 必须传入 conversationId 参数，禁止依赖 activeTabId 等全局状态
   * - 适用于流式生成场景，每次接收 token 时调用
   * - 线程安全：可在异步流程中并发调用
   * 
   * @param {string} conversationId - 对话 ID（必需）
   * @param {string} token - 文本片段
   */
  const appendTokenToMessage = (conversationId, token) => {
    if (typeof token !== 'string' || token.length === 0) {
      return
    }

    const conversation = conversations.value.find(conv => conv.id === conversationId)

    if (!conversation || conversation.messages.length === 0) {
      return
    }

    const lastMessage = conversation.messages[conversation.messages.length - 1]

    if (!lastMessage) {
      return
    }

    if (typeof lastMessage.text !== 'string') {
      lastMessage.text = ''
    }

    lastMessage.text += token
  }

  /**
   * 向当前激活对话的最后一条消息追加文本（兼容旧代码）
   * @deprecated 请使用 appendTokenToMessage(conversationId, token)
   * ⚠️ 依赖全局状态 activeTabId，不适用于异步流程
   * @param {string} token - 文本片段
   */
  const appendTokenToLastMessage = (token) => {
    if (!activeTabId.value) {
      return
    }
    appendTokenToMessage(activeTabId.value, token)
  }

  /**
   * 删除对话（简化版本 - 适配新的多实例管理策略）
   * @param {string} conversationId - 要删除的对话 ID
   * @returns {boolean} 是否成功删除
   */
  const deleteConversation = (conversationId) => {
    console.log('🗑️ 开始删除对话:', conversationId)
    
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

    console.log('📊 删除前状态:', {
      isTabOpen,
      isActiveTab,
      tabIndex,
      openTabsCount: openConversationIds.value.length,
      totalConversations: conversations.value.length
    })

    // ========== 步骤 1：如果删除的是当前激活标签，需要先切换 ==========
    let needToCreateNew = false
    
    if (isActiveTab) {
      if (openConversationIds.value.length > 1) {
        // 还有其他打开的标签页，切换到相邻的
        const newIndex = tabIndex > 0 ? tabIndex - 1 : 0
        const newActiveId = openConversationIds.value[newIndex]
        activeTabId.value = newActiveId
        console.log('✓ 已切换到标签页:', newActiveId)
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
              console.log('✓ 已将其他对话添加到打开列表:', firstOtherConv.id)
            }
            activeTabId.value = firstOtherConv.id
            console.log('✓ 已切换到其他对话:', firstOtherConv.id)
          }
        } else {
          // 这是最后一个对话，删除后需要创建新的
          needToCreateNew = true
          console.log('⚠️ 即将删除最后一个对话')
        }
      }
    }

    // ========== 步骤 2：从打开列表移除 ==========
    if (isTabOpen) {
      openConversationIds.value.splice(tabIndex, 1)
      console.log('🧹 已从打开列表移除')
    }

    // ========== 步骤 3：从对话列表删除 ==========
    conversations.value.splice(index, 1)
    console.log('✓ 已从对话列表删除:', conversationId)

    // ========== 步骤 4：处理后续操作 ==========
    if (needToCreateNew) {
      console.log('✓ 对话列表为空，自动创建新对话')
      const newId = createNewConversation()
      openConversationInTab(newId)
    } else {
      // 保存到本地
      saveConversations()
    }
    
    console.log('✓ 删除操作完成')
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
    
    console.log('✓ 对话已重命名:', conversationId, '→', newTitle)
  }

  /**
   * 清空指定对话的所有消息（原子操作 - 异步安全）
   * 
   * 🔒 合同约定：
   * - 必须传入 conversationId 参数，禁止依赖 activeTabId 等全局状态
   * - 清空后会自动保存到本地存储
   * - 线程安全：可在异步流程中并发调用
   * 
   * @param {string} conversationId - 对话 ID（必需）
   */
  const clearConversationMessages = (conversationId) => {
    const conversation = conversations.value.find(conv => conv.id === conversationId)
    
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    conversation.messages = []
    
    // 保存到本地
    saveConversations()
    
    console.log('✓ 已清空对话消息:', conversation.id)
  }

  /**
   * 清空当前激活对话的所有消息（兼容旧代码）
   * @deprecated 请使用 clearConversationMessages(conversationId)
   * ⚠️ 依赖全局状态 activeTabId，不适用于异步流程
   */
  const clearActiveConversationMessages = () => {
    if (!activeTabId.value) {
      console.error('❌ 没有激活的对话')
      return
    }
    clearConversationMessages(activeTabId.value)
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
    
    console.log('✓ 对话生成状态已更新:', conversationId, '→', status)
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
    console.log('✓ 对话错误状态已更新:', conversationId, '→', hasError)
  }

  /**
   * @deprecated 使用 setConversationGenerationStatus 代替
   * 向后兼容的方法
   */
  const setConversationLoadingState = (conversationId, loading) => {
    setConversationGenerationStatus(conversationId, loading ? 'receiving' : 'idle')
  }

  /**
   * 设置可用模型列表
   * @param {Array} models - 模型名称数组
   */
  const setAvailableModels = (models) => {
    if (!Array.isArray(models)) {
      console.error('❌ setAvailableModels 需要一个数组参数，但收到:', models)
      return
    }
    
    availableModels.value = models
    console.log('✓ 可用模型列表已更新，共', models.length, '个模型')
    
    // 智能选择默认模型：如果当前选择的模型不在新列表中，自动切换到第一个模型
    if (models.length > 0 && !models.includes(selectedModel.value)) {
      const newDefaultModel = models[0]
      console.log(`⚠️ 当前模型 "${selectedModel.value}" 不在新列表中，自动切换到 "${newDefaultModel}"`)
      selectedModel.value = newDefaultModel
    }
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

  /**
   * 更新当前对话使用的模型（兼容旧代码）
   * @deprecated 请使用 updateConversationModel(conversationId, modelName)
   * ⚠️ 依赖全局状态 activeTabId，不适用于异步流程
   * @param {string} modelName - 模型名称
   */
  const updateActiveConversationModel = (modelName) => {
    if (!activeTabId.value) {
      console.error('❌ 没有激活的对话')
      return
    }
    updateConversationModel(activeTabId.value, modelName)
  }

  // ========== 消息管理原子操作 ==========

  /**
   * 删除指定对话中的指定消息（原子操作 - 异步安全）
   * 
   * 🔒 合同约定：
   * - 必须传入 conversationId 和 messageId 参数
   * - 删除后会自动保存到本地存储
   * - 线程安全：可在异步流程中并发调用
   * 
   * @param {string} conversationId - 对话 ID（必需）
   * @param {string} messageId - 消息 ID（必需）
   */
  const deleteMessage = (conversationId, messageId) => {
    const conversation = conversations.value.find(conv => conv.id === conversationId)
    
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId)
    
    if (messageIndex === -1) {
      console.error('❌ 找不到消息:', messageId)
      return
    }

    conversation.messages.splice(messageIndex, 1)
    
    // 保存到本地
    saveConversations()
    
    console.log('✓ 已删除消息:', messageId)
  }

  /**
   * 更新指定对话中的指定消息内容（原子操作 - 异步安全）
   * 
   * 🔒 合同约定：
   * - 必须传入 conversationId、messageId 和 newText 参数
   * - 更新后会自动保存到本地存储
   * - 线程安全：可在异步流程中并发调用
   * 
   * @param {string} conversationId - 对话 ID（必需）
   * @param {string} messageId - 消息 ID（必需）
   * @param {string} newText - 新的消息内容
   */
  const updateMessage = (conversationId, messageId, newText) => {
    const conversation = conversations.value.find(conv => conv.id === conversationId)
    
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    const message = conversation.messages.find(msg => msg.id === messageId)
    
    if (!message) {
      console.error('❌ 找不到消息:', messageId)
      return
    }

    message.text = newText
    
    // 保存到本地
    saveConversations()
    
    console.log('✓ 已更新消息:', messageId)
  }

  /**
   * 从指定消息开始截断（删除该消息及其之后的所有消息）（原子操作 - 异步安全）
   * 
   * 🔒 合同约定：
   * - 必须传入 conversationId 和 messageId 参数
   * - 截断后会自动保存到本地存储
   * - 线程安全：可在异步流程中并发调用
   * - 用于重新生成或编辑消息时清理后续内容
   * 
   * @param {string} conversationId - 对话 ID（必需）
   * @param {string} messageId - 起始消息 ID（必需）
   */
  const truncateMessagesFrom = (conversationId, messageId) => {
    const conversation = conversations.value.find(conv => conv.id === conversationId)
    
    if (!conversation) {
      console.error('❌ 找不到对话:', conversationId)
      return
    }

    const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId)
    
    if (messageIndex === -1) {
      console.error('❌ 找不到消息:', messageId)
      return
    }

    // 删除从该消息开始的所有消息
    const removedCount = conversation.messages.length - messageIndex
    conversation.messages.splice(messageIndex)
    
    // 保存到本地
    saveConversations()
    
    console.log(`✓ 已截断消息，删除了 ${removedCount} 条消息`)
  }

  // 返回状态、计算属性和方法
  return {
    // State
    apiKey,
    conversations,
    openConversationIds,
    activeTabId,
    availableModels,
    selectedModel,
    
    // Getters
    activeConversation,
    isAnyConversationLoading,
    
    // Actions
    loadConversations,
    saveConversations,
    createNewConversation,
    openConversationInTab,
    closeConversationTab,
    updateConversationDraft,
    setActiveConversation,
    // 新的基于 conversationId 的函数
    addMessageToConversation,
    appendTokenToMessage,
    clearConversationMessages,
    updateConversationModel,
    // 消息管理原子操作
    deleteMessage,
    updateMessage,
    truncateMessagesFrom,
    // 兼容旧代码的函数
    addMessageToActiveConversation,
    appendTokenToLastMessage,
    clearActiveConversationMessages,
    updateActiveConversationModel,
    // 其他函数
    deleteConversation,
    renameConversation,
    setConversationGenerationStatus,
    setConversationError,
    setConversationLoadingState, // @deprecated 向后兼容
    setAvailableModels,
    setSelectedModel,
  }
})

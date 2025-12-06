import { defineStore } from 'pinia'
import { ref } from 'vue'
import { electronStore as persistenceStore, isUsingElectronStoreFallback } from '../utils/electronBridge'
import { PROVIDERS, type ProviderId, getProviderDisplayName } from '../constants/providers'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * AI Provider 类型
 * 
 * 注意：为了保持向后兼容性，这里保留了大写开头的显示名称
 * - 'Gemini' 对应运行时 ID 'gemini' (PROVIDERS.GEMINI)
 * - 'OpenRouter' 对应运行时 ID 'openrouter' (PROVIDERS.OPENROUTER)
 * 
 * 在与服务层交互时，应使用 PROVIDERS 常量中的小写 ID
 */
export type AIProvider = 'Gemini' | 'OpenRouter'
export type WebSearchEngine = 'native' | 'exa' | 'undefined'

/**
 * AIProvider 到 ProviderId 的映射
 * 用于在 UI 层（大写）和运行时层（小写）之间转换
 */
export function toProviderId(provider: AIProvider): ProviderId {
  switch (provider) {
    case 'Gemini':
      return PROVIDERS.GEMINI
    case 'OpenRouter':
      return PROVIDERS.OPENROUTER
    default:
      return PROVIDERS.GEMINI
  }
}

/**
 * ProviderId 到 AIProvider 的映射
 * 用于从运行时 ID 转换回 UI 显示类型
 */
export function toAIProvider(providerId: ProviderId): AIProvider {
  switch (providerId) {
    case PROVIDERS.GEMINI:
      return 'Gemini'
    case PROVIDERS.OPENROUTER:
      return 'OpenRouter'
    default:
      return 'Gemini'
  }
}

export const useAppStore = defineStore('app', () => {
  // ========== 多提供商配置状态 ==========
  
  // 当前激活的 API 提供商
  const activeProvider = ref<AIProvider>('Gemini')
  
  // Gemini API Key
  const geminiApiKey = ref<string>('')
  
  // OpenRouter API Key
  const openRouterApiKey = ref<string>('')
  
  // OpenRouter Base URL (可选，默认为官方地址)
  const openRouterBaseUrl = ref<string>('https://openrouter.ai/api/v1')
  
  // 默认模型 (用于新对话)
  const defaultModel = ref<string>('openrouter/auto')
  
  // Web 搜索引擎配置
  const webSearchEngine = ref<WebSearchEngine>('undefined')
  
  // PDF 引擎偏好（记录用户最后选择的 PDF 引擎）
  const lastUsedPdfEngine = ref<'pdf-text' | 'mistral-ocr' | 'native'>('pdf-text')
  
  // 发送延时（毫秒）
  const sendDelayMs = ref<number>(0)
  
  // 向后兼容：保留原有的 apiKey 引用（指向 geminiApiKey）
  const apiKey = ref<string>('')
  
  const chatMessages = ref<ChatMessage[]>([])
  const isAppReady = ref<boolean>(false) // 应用初始化完成状态

  // ========== 初始化方法 ==========
  
  // 初始化 - 从 electron-store 加载所有配置
  const initializeStore = async () => {
    try {
      if (isUsingElectronStoreFallback) {
        console.warn('appStore: electronStore bridge unavailable; using in-memory persistence. Settings reset on reload.')
      }
      // 并行加载所有配置，提升启动速度
      const [
        savedProvider,
        savedGeminiKey,
        savedOpenRouterKey,
        savedOpenRouterBaseUrl,
        savedDefaultModel,
        savedWebSearchEngine,
        savedLastUsedPdfEngine,
        legacyApiKey,
        savedSendDelayMs
      ] = await Promise.all([
        persistenceStore.get('activeProvider'),
        persistenceStore.get('geminiApiKey'),
        persistenceStore.get('openRouterApiKey'),
        persistenceStore.get('openRouterBaseUrl'),
        persistenceStore.get('defaultModel'),
        persistenceStore.get('webSearchEngine'),
        persistenceStore.get('lastUsedPdfEngine'),
        persistenceStore.get('apiKey'),
        persistenceStore.get('sendDelayMs')
      ])
      
      // 加载 API 提供商选择
      if (savedProvider && (savedProvider === 'Gemini' || savedProvider === 'OpenRouter')) {
        activeProvider.value = savedProvider
      }
      console.log('appStore.initializeStore - 加载的提供商:', activeProvider.value)
      
      // 加载 Gemini API Key
      if (savedGeminiKey) {
        geminiApiKey.value = savedGeminiKey
        apiKey.value = savedGeminiKey // 向后兼容
        console.log('appStore.initializeStore - Gemini API Key 已加载')
      }
      
      // 加载 OpenRouter API Key
      if (savedOpenRouterKey) {
        openRouterApiKey.value = savedOpenRouterKey
        console.log('appStore.initializeStore - OpenRouter API Key 已加载')
      }
      
      // 加载 OpenRouter Base URL
      if (savedOpenRouterBaseUrl) {
        openRouterBaseUrl.value = savedOpenRouterBaseUrl
        console.log('appStore.initializeStore - OpenRouter Base URL 已加载:', savedOpenRouterBaseUrl)
      }
      
      // 加载默认模型
      if (savedDefaultModel) {
        defaultModel.value = savedDefaultModel
        console.log('appStore.initializeStore - 默认模型已加载:', savedDefaultModel)
      }

      // 加载 Web 搜索引擎配置
      if (savedWebSearchEngine && (savedWebSearchEngine === 'native' || savedWebSearchEngine === 'exa' || savedWebSearchEngine === 'undefined')) {
        webSearchEngine.value = savedWebSearchEngine
        console.log('appStore.initializeStore - Web 搜索引擎已加载:', savedWebSearchEngine)
      }
      
      // 加载 PDF 引擎偏好
      if (savedLastUsedPdfEngine && (savedLastUsedPdfEngine === 'pdf-text' || savedLastUsedPdfEngine === 'mistral-ocr' || savedLastUsedPdfEngine === 'native')) {
        lastUsedPdfEngine.value = savedLastUsedPdfEngine
        console.log('appStore.initializeStore - PDF 引擎偏好已加载:', savedLastUsedPdfEngine)
      }

      if (savedSendDelayMs !== undefined && savedSendDelayMs !== null) {
        sendDelayMs.value = Math.max(0, Number(savedSendDelayMs) || 0)
        console.log('appStore.initializeStore - 发送延时加载', sendDelayMs.value)
      }

      // 向后兼容：如果没有新配置，尝试加载旧的 apiKey
      if (!savedGeminiKey && legacyApiKey) {
        geminiApiKey.value = legacyApiKey
        apiKey.value = legacyApiKey
        // 迁移到新格式
        await persistenceStore.set('geminiApiKey', legacyApiKey)
        console.log('appStore.initializeStore - 已迁移旧的 API Key 到 geminiApiKey')
      }
    } catch (error) {
      console.error('初始化 store 失败:', error)
    } finally {
      // 无论成功或失败，都标记应用为已就绪
      isAppReady.value = true
      console.log('✓ 应用初始化完成，isAppReady = true')
    }
  }

  // ========== 配置保存方法 ==========
  
  // 保存 API 提供商选择
  const saveActiveProvider = async (provider: AIProvider) => {
    try {
      await persistenceStore.set('activeProvider', provider)
      activeProvider.value = provider
      console.log('✓ 已保存 API 提供商:', provider)
      return true
    } catch (error) {
      console.error('保存 API 提供商失败:', error)
      return false
    }
  }
  
  // 保存 Gemini API Key
  const saveGeminiApiKey = async (key: string) => {
    try {
      await persistenceStore.set('geminiApiKey', key)
      geminiApiKey.value = key
      apiKey.value = key // 向后兼容
      await persistenceStore.set('apiKey', key) // 向后兼容
      console.log('✓ 已保存 Gemini API Key')
      return true
    } catch (error) {
      console.error('保存 Gemini API Key 失败:', error)
      return false
    }
  }
  
  // 保存 OpenRouter API Key
  const saveOpenRouterApiKey = async (key: string) => {
    try {
      await persistenceStore.set('openRouterApiKey', key)
      openRouterApiKey.value = key
      console.log('✓ 已保存 OpenRouter API Key')
      return true
    } catch (error) {
      console.error('保存 OpenRouter API Key 失败:', error)
      return false
    }
  }
  
  // 保存 OpenRouter Base URL
  const saveOpenRouterBaseUrl = async (url: string) => {
    try {
      await persistenceStore.set('openRouterBaseUrl', url)
      openRouterBaseUrl.value = url
      console.log('✓ 已保存 OpenRouter Base URL:', url)
      return true
    } catch (error) {
      console.error('保存 OpenRouter Base URL 失败:', error)
      return false
    }
  }
  
  // 保存默认模型
  const saveDefaultModel = async (model: string) => {
    try {
      await persistenceStore.set('defaultModel', model)
      defaultModel.value = model
      console.log('✓ 已保存默认模型:', model)
      return true
    } catch (error) {
      console.error('保存默认模型失败:', error)
      return false
    }
  }

  const saveWebSearchEngine = async (engine: WebSearchEngine) => {
    try {
      await persistenceStore.set('webSearchEngine', engine)
      webSearchEngine.value = engine
      console.log('✓ 已保存 Web 搜索引擎:', engine)
      return true
    } catch (error) {
      console.error('保存 Web 搜索引擎失败:', error)
      return false
    }
  }

  const saveLastUsedPdfEngine = async (engine: 'pdf-text' | 'mistral-ocr' | 'native') => {
    try {
      await persistenceStore.set('lastUsedPdfEngine', engine)
      lastUsedPdfEngine.value = engine
      console.log('✓ 已保存 PDF 引擎偏好:', engine)
      return true
    } catch (error) {
      console.error('保存 PDF 引擎偏好失败:', error)
      return false
    }
  }

  // 保存发送延时
  const setSendDelayMs = async (value: number) => {
    const normalized = Math.max(0, Number(value) || 0)
    try {
      await persistenceStore.set('sendDelayMs', normalized)
      sendDelayMs.value = normalized
      console.log('✓ 已保存发送延时:', normalized)
      return true
    } catch (error) {
      console.error('保存发送延时失败:', error)
      return false
    }
  }
  
  // 向后兼容：保留原有的 saveApiKey 方法（实际保存到 geminiApiKey）
  const saveApiKey = async (key: string) => {
    return await saveGeminiApiKey(key)
  }

  // 添加聊天消息
  const addMessage = (message: ChatMessage) => {
    chatMessages.value.push(message)
  }

  // 清空聊天消息
  const clearMessages = () => {
    chatMessages.value = []
  }

  // 删除指定索引的消息
  const removeMessage = (index: number) => {
    if (index >= 0 && index < chatMessages.value.length) {
      chatMessages.value.splice(index, 1)
    }
  }

  return {
    // ========== 状态 ==========
    // 多提供商配置
    activeProvider,
    geminiApiKey,
    openRouterApiKey,
    openRouterBaseUrl,
    defaultModel,
    webSearchEngine,
    lastUsedPdfEngine,
    sendDelayMs,
    // 向后兼容
    apiKey,
    chatMessages,
    isAppReady,
    
    // ========== 方法 ==========
    // 初始化
    initializeStore,
    // 配置保存
    saveActiveProvider,
    saveGeminiApiKey,
    saveOpenRouterApiKey,
    saveOpenRouterBaseUrl,
    saveDefaultModel,
    saveWebSearchEngine,
    saveLastUsedPdfEngine,
    setSendDelayMs,
    saveApiKey, // 向后兼容
    // 消息管理
    addMessage,
    clearMessages,
    removeMessage,
  }
})

// ========== 模块化 Store 统一导出 ==========
export { useConversationStore } from './conversation'
export { useModelStore } from './model'
export { useBranchStore } from './branch'
export { usePersistenceStore } from './persistence'
export { useProjectStore } from './project'

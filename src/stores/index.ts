import { defineStore } from 'pinia'
import { ref } from 'vue'
import { electronStore as persistenceStore, isUsingElectronStoreFallback } from '../utils/electronBridge'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type AIProvider = 'Gemini' | 'OpenRouter'
export type WebSearchEngine = 'native' | 'exa' | 'undefined'

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
  
  // 向后兼容：保留原有的 apiKey 引用（指向 geminiApiKey）
  const apiKey = ref<string>('')
  
  const chatMessages = ref<ChatMessage[]>([])
  const isAppReady = ref<boolean>(false) // 应用初始化完成状态
  const isSplashVisible = ref<boolean>(true)
  const splashStatus = ref<string>('正在启动 Starverse...')

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
        legacyApiKey
      ] = await Promise.all([
        persistenceStore.get('activeProvider'),
        persistenceStore.get('geminiApiKey'),
        persistenceStore.get('openRouterApiKey'),
        persistenceStore.get('openRouterBaseUrl'),
        persistenceStore.get('defaultModel'),
        persistenceStore.get('webSearchEngine'),
        persistenceStore.get('apiKey')
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

  const showSplashScreen = (message?: string) => {
    if (message && message.trim()) {
      splashStatus.value = message
    }
    isSplashVisible.value = true
  }

  const hideSplashScreen = () => {
    isSplashVisible.value = false
  }

  const setSplashStatus = (message: string) => {
    if (message && message.trim()) {
      splashStatus.value = message
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
    // 向后兼容
    apiKey,
    chatMessages,
    isAppReady,
  isSplashVisible,
  splashStatus,
    
    // ========== 方法 ==========
    // 初始化
    initializeStore,
  showSplashScreen,
  hideSplashScreen,
  setSplashStatus,
    // 配置保存
    saveActiveProvider,
    saveGeminiApiKey,
    saveOpenRouterApiKey,
    saveOpenRouterBaseUrl,
    saveDefaultModel,
  saveWebSearchEngine,
    saveApiKey, // 向后兼容
    // 消息管理
    addMessage,
    clearMessages,
    removeMessage,
  }
})

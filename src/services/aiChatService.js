/**
 * AI Chat Service - 统一的服务路由器
 * 根据当前选择的 Provider (Gemini / OpenRouter) 路由请求到正确的服务实现
 * 
 * 这个抽象层解耦了 chatStore 和具体的 AI 服务提供商，
 * 使得添加新的 AI 提供商变得简单，只需实现相同的接口即可。
 */

import { GeminiService } from './providers/GeminiService'
import { OpenRouterService } from './providers/OpenRouterService'

/**
 * AI Chat Service 路由器
 */
export const aiChatService = {
  
  /**
   * 根据当前 Provider 获取对应的服务实例和配置
   * @param {Object} appStore - Pinia appStore 实例
   * @returns {Object} - { service, apiKey, baseUrl }
   */
  getProviderContext(appStore) {
    const provider = appStore.activeProvider
    
    console.log('aiChatService: 当前 Provider =', provider)
    
    if (provider === 'Gemini') {
      return {
        service: GeminiService,
        apiKey: appStore.geminiApiKey,
        baseUrl: null // Gemini 不需要 baseUrl
      }
    } else if (provider === 'OpenRouter') {
      return {
        service: OpenRouterService,
        apiKey: appStore.openRouterApiKey,
        baseUrl: appStore.openRouterBaseUrl
      }
    }
    
    // 默认或错误处理
    throw new Error(`不支持的 API 提供商: ${provider}`)
  },

  /**
   * 统一的模型列表获取方法
   * @param {Object} appStore - Pinia appStore 实例
   * @returns {Promise<string[]>} - 模型名称/ID 列表
   */
  async listAvailableModels(appStore) {
    console.log('aiChatService: 开始获取模型列表...')
    
    try {
      const { service, apiKey, baseUrl } = this.getProviderContext(appStore)
      
      if (!apiKey) {
        console.warn('aiChatService: API Key 未配置')
        return []
      }
      
      // 确保所有服务都实现了 listAvailableModels 方法
      // OpenRouter 需要 baseUrl 参数
      const models = baseUrl 
        ? await service.listAvailableModels(apiKey, baseUrl)
        : await service.listAvailableModels(apiKey)
      
      console.log('aiChatService: 成功获取模型列表，数量:', models.length)
      return models
    } catch (error) {
      console.error('aiChatService: 获取模型列表失败！', error)
      return []
    }
  },

  /**
   * 统一的流式对话方法
   * @param {Object} appStore - Pinia appStore 实例
   * @param {Array} history - 聊天历史 [{ role: 'user' | 'model', text: '...' }]
   * @param {string} modelName - 模型名称/ID
   * @param {string} userMessage - 用户消息
   * @param {AbortSignal} [signal] - 可选的中止信号
   * @returns {AsyncIterable} - 流式响应的异步迭代器
   */
  async* streamChatResponse(appStore, history, modelName, userMessage, signal = null) {
    console.log('aiChatService: 开始流式对话...')
    console.log('  - 模型:', modelName)
    console.log('  - 历史消息数:', history.length)
    console.log('  - 用户消息长度:', userMessage.length)
    
    try {
      const { service, apiKey, baseUrl } = this.getProviderContext(appStore)
      
      if (!apiKey) {
        throw new Error('API Key 未配置，请在设置中配置相应的 API Key')
      }
      
      // 确保所有服务都实现了 streamChatResponse 方法
      // 不同的服务可能需要不同的参数
      if (service === GeminiService) {
        // Gemini: (apiKey, history, modelName, userMessage, signal)
        yield* service.streamChatResponse(apiKey, history, modelName, userMessage, signal)
      } else if (service === OpenRouterService) {
        // OpenRouter: (apiKey, history, modelName, userMessage, baseUrl, signal)
        yield* service.streamChatResponse(apiKey, history, modelName, userMessage, baseUrl, signal)
      } else {
        throw new Error('未知的服务类型')
      }
      
      console.log('aiChatService: 流式对话完成')
    } catch (error) {
      console.error('aiChatService: 流式对话失败！', error)
      throw error
    }
  },

  /**
   * 获取当前激活的 API Key（用于向后兼容）
   * @param {Object} appStore - Pinia appStore 实例
   * @returns {string} - 当前激活的 API Key
   */
  getCurrentApiKey(appStore) {
    const { apiKey } = this.getProviderContext(appStore)
    return apiKey || ''
  }
}

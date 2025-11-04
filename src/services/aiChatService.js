/**
 * AI Chat Service - 统一的服务路由器
 * 根据当前选择的 Provider (Gemini / OpenRouter) 路由请求到正确的服务实现
 * 
 * 这个抽象层解耦了 chatStore 和具体的 AI 服务提供商，
 * 使得添加新的 AI 提供商变得简单，只需实现相同的接口即可。
 */

import { GeminiService } from './providers/GeminiService'
import { OpenRouterService } from './providers/OpenRouterService'
// 引入 chatStore 用于读取可用模型的元数据（input_modalities）
import { useChatStore } from '../stores/chatStore'

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
    // 规范化入参，避免上层传入 undefined 导致崩溃
    const safeHistory = Array.isArray(history) ? history : []
    const safeUserMessage = typeof userMessage === 'string' ? userMessage : ''

    console.log('aiChatService: 开始流式对话...')
    console.log('  - 模型:', modelName)
    console.log('  - 历史消息数:', safeHistory.length)
    console.log('  - 用户消息长度:', safeUserMessage.length)
    
    // 🔍 调试：打印历史消息详情
    console.log('🔍 [DEBUG] aiChatService 接收到的 history:', JSON.stringify(safeHistory, null, 2))
    
    try {
      const { service, apiKey, baseUrl } = this.getProviderContext(appStore)
      
      if (!apiKey) {
        throw new Error('API Key 未配置，请在设置中配置相应的 API Key')
      }
      
      // 确保所有服务都实现了 streamChatResponse 方法
      // 不同的服务可能需要不同的参数
      if (service === GeminiService) {
        // Gemini: (apiKey, history, modelName, userMessage, signal)
        yield* service.streamChatResponse(apiKey, safeHistory, modelName, safeUserMessage, signal)
      } else if (service === OpenRouterService) {
        // OpenRouter: (apiKey, history, modelName, userMessage, baseUrl, signal)
        console.log('🔍 [DEBUG] 调用 OpenRouterService.streamChatResponse')
        yield* service.streamChatResponse(apiKey, safeHistory, modelName, safeUserMessage, baseUrl, signal)
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
  },

  /**
   * 检查指定模型是否支持视觉/图像输入
   * @param {Object} appStore - Pinia appStore 实例
   * @param {string} modelId - 模型 ID
   * @returns {boolean} - 是否支持视觉
   */
  supportsVision(appStore, modelId) {
    try {
      if (!modelId) return false

      // 优先使用本地已加载的模型元数据判断（如果可用）
      try {
        const chatStore = useChatStore()
        const map = chatStore.availableModelsMap
        if (map && typeof map.get === 'function') {
          const modelData = map.get(modelId) || map.get(String(modelId).toLowerCase())
          if (modelData && Array.isArray(modelData.input_modalities)) {
            const modalities = modelData.input_modalities.map(m => String(m).toLowerCase())
            const hasImage = modalities.includes('image') || modalities.includes('vision') || modalities.includes('multimodal')
            if (hasImage) return true
          }
        }
      } catch (err) {
        // 如果读取 store 失败，继续回退到 provider 的判断
        console.warn('aiChatService.supportsVision: 无法读取 chatStore，回退到 provider 判断', err)
      }

      // 回退：调用 provider 的 supportsVision（如果实现）
      const { service } = this.getProviderContext(appStore)
      if (service && service.supportsVision && typeof service.supportsVision === 'function') {
        return service.supportsVision(modelId)
      }

      return false
    } catch (error) {
      console.error('aiChatService: 检查视觉支持失败', error)
      return false
    }
  }
}

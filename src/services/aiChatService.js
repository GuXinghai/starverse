/**
 * AI Chat Service - 统一的服务路由器
 * 
 * ========== 核心职责 ==========
 * 1. 根据 activeProvider 路由请求到正确的 AI 服务
 * 2. 提供统一的调用接口，屏蔽不同 Provider 的差异
 * 3. 处理 API Key 和 BaseURL 的传递
 * 
 * ========== 架构设计 ==========
 * 路由模式:
 *   chatStore (Vue)
 *   ↓ 调用
 *   aiChatService (Router)
 *   ↓ 根据 activeProvider 选择
 *   GeminiService 或 OpenRouterService
 *   ↓ 调用 API
 *   Gemini API 或 OpenRouter API
 * 
 * ========== 支持的 Provider ==========
 * - Gemini: Google Gemini API
 *   - 参数: apiKey
 *   - 特点: 原生多模态支持，速度快
 * 
 * - OpenRouter: OpenRouter 统一接口
 *   - 参数: apiKey, baseUrl
 *   - 特点: 支持多种模型，路由智能
 * 
 * ========== 设计原则 ==========
 * - 解耦原则: chatStore 不直接依赖具体的 Provider
 * - 扩展性: 添加新 Provider 只需实现相同接口
 * - 容错性: 所有调用都有参数验证
 * 
 * @module services/aiChatService
 */

import { GeminiService } from './providers/GeminiService'
import { OpenRouterService } from './providers/OpenRouterService'
// 引入 modelStore 用于读取可用模型的元数据（input_modalities）
import { useModelStore } from '../stores/model'

/**
 * AI Chat Service 路由器
 * 
 * 提供统一的 AI 服务调用接口，屏蔽 Provider 差异。
 */
export const aiChatService = {
  
  /**
   * 根据当前 activeProvider 获取对应的服务实例和配置
   * 
   * Provider 配置映射:
   * - Gemini: { service: GeminiService, apiKey: geminiApiKey, baseUrl: null }
   * - OpenRouter: { service: OpenRouterService, apiKey: openRouterApiKey, baseUrl: openRouterBaseUrl }
   * 
   * @param {Object} appStore - Pinia appStore 实例
   * @returns {Object} - { service, apiKey, baseUrl }
   * @throws {Error} 不支持的 Provider
   * 
   * 🔒 数据源:
   * - appStore.activeProvider: 当前激活的 Provider
   * - appStore.geminiApiKey / openRouterApiKey: 对应的 API Key
   * - appStore.openRouterBaseUrl: OpenRouter 基础 URL（可自定义）
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
   * 
   * 调用对应 Provider 的 listAvailableModels 方法。
   * 
   * @param {Object} appStore - Pinia appStore 实例
   * @returns {Promise<string[]>} - 模型名称/ID 列表
   * 
   * 执行流程:
   * 1. 获取当前 Provider 的 service 和 apiKey
   * 2. 验证 apiKey 是否配置
   * 3. 调用 service.listAvailableModels()
   * 4. 返回模型列表
   * 
   * ⚠️ 注意:
   * - OpenRouter 需要额外传递 baseUrl 参数
   * - Gemini 只需 apiKey
   * - API Key 未配置时返回空数组
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
   * 
   * ========== 参数规范化 ==========
   * 为防止 undefined 导致的崩溃，所有参数都进行验证和规范化:
   * - history: 默认为 []
   * - userMessage: 默认为 ''
   * - options: 默认为 {}
   * 
   * ========== 参数传递 ==========
   * 不同 Provider 的参数顺序和需求不同:
   * 
   * Gemini:
   *   streamChatResponse(apiKey, history, modelName, userMessage, options)
   * 
   * OpenRouter:
   *   streamChatResponse(apiKey, history, modelName, userMessage, baseUrl, options)
   *   - 需要额外传递 baseUrl 参数
   * 
   * ========== Options 字段 ==========
   * - signal: AbortSignal - 中断控制
   * - webSearch: Object - 网络搜索配置
   * - requestedModalities: Array - 请求的模态类型
   * - imageConfig: Object - 图片生成配置
   * - reasoning: Object - 推理模式配置
   * - parameters: Object - 采样参数 (temperature, top_p 等)
   * 
   * @param {Object} appStore - Pinia appStore 实例
   * @param {Array} history - 聊天历史 [{ role: 'user' | 'model', parts: [...] }]
   * @param {string} modelName - 模型名称/ID
   * @param {string} userMessage - 用户消息文本
   * @param {Object} [options] - 可选参数
   * @param {AbortSignal} [options.signal] - 中止信号
   * @returns {AsyncIterable<string>} - 流式响应的异步迭代器
   * @throws {Error} API Key 未配置或请求失败
   * 
   * @example
   * for await (const text of aiChatService.streamChatResponse(appStore, history, model, message)) {
   *   console.log(text)
   * }
   */
  async* streamChatResponse(appStore, history, modelName, userMessage, options = {}) {
    // 规范化入参，避免上层传入 undefined 导致崩溃
    const safeHistory = Array.isArray(history) ? history : []
    const safeUserMessage = typeof userMessage === 'string' ? userMessage : ''
    const {
      signal = null,
      webSearch = null,
      requestedModalities = null,
      imageConfig = null,
      reasoning = null,
      parameters = null,
      pdfEngine = null
    } = options || {}

    console.log('aiChatService: 开始流式对话...')
    console.log('  - 模型:', modelName)
    console.log('  - 历史消息数:', safeHistory.length)
    console.log('  - 用户消息长度:', safeUserMessage.length)
    
    // 🔍 排查日志：检查传递给 Service 的参数
    console.log('🔍 [aiChatService] Options:', JSON.stringify(options, (key, value) => {
      if (key === 'signal') return '[AbortSignal]'
      return value
    }, 2))
    console.log('🔍 [aiChatService] History Sample (last item):', safeHistory.length > 0 ? safeHistory[safeHistory.length - 1] : 'Empty')

    try {
      const { service, apiKey, baseUrl } = this.getProviderContext(appStore)
      
      if (!apiKey) {
        throw new Error('API Key 未配置，请在设置中配置相应的 API Key')
      }
      
      // 从缓存读取 OpenRouter 模型参数信息（已在启动时获取）
      let modelParametersInfo = null
      if (service === OpenRouterService) {
        try {
          const modelStore = useModelStore()
          if (modelStore?.getModelSupportedParameters) {
            const cachedParams = modelStore.getModelSupportedParameters(modelName)
            if (cachedParams) {
              // 从缓存中读取到参数信息
              const cachedEntry = modelStore.modelSupportedParametersMap?.get(modelName)
              if (cachedEntry) {
                modelParametersInfo = {
                  model: cachedEntry.model || modelName,
                  supported_parameters: cachedEntry.supported_parameters,
                  raw: cachedEntry.raw
                }
              }
            }
          }
        } catch (storeErr) {
          console.warn('aiChatService: 读取缓存的模型参数失败', storeErr)
        }
      }
      
      // 调用对应 Provider 的 streamChatResponse 方法
      // 不同 Provider 的方法签名略有差异，需要适配
      if (service === GeminiService) {
        // Gemini: (apiKey, history, modelName, userMessage, options)
        yield* service.streamChatResponse(apiKey, safeHistory, modelName, safeUserMessage, { signal, webSearch, requestedModalities, imageConfig, reasoning, parameters, pdfEngine })
      } else if (service === OpenRouterService) {
        // OpenRouter: (apiKey, history, modelName, userMessage, baseUrl, options)
        // 🔧 修复：如果模型 ID 是简短形式（不含 /），自动添加提供商前缀
        let openRouterModelId = modelName
        if (!modelName.includes('/')) {
          // 简短形式模型 ID，需要添加提供商前缀
          // 常见映射：gemini-* -> google/*, gpt-* -> openai/*, claude-* -> anthropic/*, auto -> openrouter/auto
          if (modelName === 'auto') {
            openRouterModelId = 'openrouter/auto'
          } else if (modelName.startsWith('gemini-')) {
            openRouterModelId = `google/${modelName}`
          } else if (modelName.startsWith('gpt-')) {
            openRouterModelId = `openai/${modelName}`
          } else if (modelName.startsWith('claude-')) {
            openRouterModelId = `anthropic/${modelName}`
          } else if (modelName.startsWith('llama-')) {
            openRouterModelId = `meta-llama/${modelName}`
          }
          console.log(`🔧 [aiChatService] 转换模型 ID: ${modelName} -> ${openRouterModelId}`)
        }
        
        yield* service.streamChatResponse(apiKey, safeHistory, openRouterModelId, safeUserMessage, baseUrl, { signal, webSearch, requestedModalities, imageConfig, reasoning, parameters, pdfEngine, modelParameters: modelParametersInfo })
      } else {
        throw new Error('不支持的服务提供商')
      }
      
      console.log('aiChatService: 流式对话完成')
    } catch (error) {
      console.error('aiChatService: 流式对话失败！', error)
      throw error
    }
  },

  /**
   * 获取当前激活的 API Key（向后兼容）
   * 
   * @param {Object} appStore - Pinia appStore 实例
   * @returns {string} - 当前激活的 API Key
   */
  getCurrentApiKey(appStore) {
    const { apiKey } = this.getProviderContext(appStore)
    return apiKey || ''
  },

  /**
   * 检查指定模型是否支持视觉/图片输入
   * 
   * ========== 检测策略 ==========
   * 优先级顺序:
   * 1. 从 modelStore.availableModelsMap 读取模型元数据
   *    - 检查 input_modalities 字段
   *    - 包含 'image' / 'vision' / 'multimodal' 即为支持
   * 
   * 2. 回退到 Provider 的 supportsVision 方法
   *    - Gemini: 根据模型名称判断 (gemini-1.5+, gemini-2.0+ 支持)
   *    - OpenRouter: 调用 API 查询模型信息
   * 
   * 3. 默认返回 false
   * 
   * @param {Object} appStore - Pinia appStore 实例
   * @param {string} modelId - 模型 ID
   * @returns {boolean} - 是否支持视觉
   * 
   * 🔍 使用场景:
   * - 决定是否显示图片附件按钮
   * - 验证用户上传的图片是否可用
   * 
   * @example
   * if (aiChatService.supportsVision(appStore, 'gemini-2.0-flash-exp')) {
   *   // 显示图片上传按钮
   * }
   */
  supportsVision(appStore, modelId) {
    try {
      if (!modelId) return false

      // 优先使用本地已加载的模型元数据判断（如果可用）
      try {
        const modelStore = useModelStore()
        const map = modelStore.availableModelsMap
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
        console.warn('aiChatService.supportsVision: 无法读取 modelStore，回退到 provider 判断', err)
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

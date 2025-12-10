/**
 * AI 聊天服务路由器
 *
 * 统一在渲染进程中根据 `appStore.activeProvider` 选择具体 Provider（Gemini 或 OpenRouter），
 * 并提供以下能力：
 * - 列出可用模型 `listAvailableModels`
 * - 流式获取聊天响应 `streamChatResponse`
 * - 查询当前使用的 API Key `getCurrentApiKey`
 * - 判断模型是否支持视觉输入 `supportsVision`
 *
 * 依赖：
 * - `GeminiService` 与 `OpenRouterService` 的具体实现
 * - `useModelStore` 提供模型参数/能力缓存
 * - `generationConfigManager` 与 `buildModelCapability` 负责参数整合与能力建模
 */

import { GeminiService } from './providers/GeminiService'
import { OpenRouterService } from './providers/OpenRouterService'
// 来自 modelStore 的输入模态数据查询
import { useModelStore } from '../stores/model'
import { generationConfigManager } from './providers/generationConfigManager'
import { buildModelCapability } from './providers/modelCapability'

const LEGACY_SAMPLING_KEYS = new Set([
  'temperature',
  'top_p',
  'top_k',
  'frequency_penalty',
  'presence_penalty',
  'repetition_penalty',
  'min_p',
  'top_a',
  'max_tokens',
  'seed'
])

/**
 * 将旧版 UI 的 reasoning/parameters 选项整合为统一的 GenerationConfig。
 *
 * - 仅允许白名单中的采样参数（LEGACY_SAMPLING_KEYS）透传
 * - 将 max_tokens 归类为长度控制，其余归为采样控制
 * - 将旧版 reasoning 结构解析为规范化的 `resolvedReasoning`
 *
 * @param {Object} params
 * @param {string} params.modelId 模型 ID（OpenRouter 需为 provider/name 形式）
 * @param {string} [params.conversationId] 会话 ID（可选）
 * @param {Object|null} [params.legacyReasoning] 旧版推理配置
 * @param {Object|null} [params.legacyParameters] 旧版采样/长度参数
 * @returns {{ effectiveConfig: any, resolvedReasoning: any }} 统一配置与解析后的推理配置
 */
function buildAirlockedGenerationConfig({
  modelId,
  conversationId,
  legacyReasoning,
  legacyParameters,
}) {
  const requestOverride = {
    sampling: {},
    length: {},
    reasoning: undefined,
  }

  // 处理旧版采样与长度参数（legacy parameters）
  if (legacyParameters && typeof legacyParameters === 'object') {
    for (const [key, raw] of Object.entries(legacyParameters)) {
      if (!LEGACY_SAMPLING_KEYS.has(key)) continue
      const num = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
      if (num === null) continue

      if (key === 'max_tokens') {
        requestOverride.length.max_tokens = num
      } else {
        requestOverride.sampling[key] = num
      }
    }
  }

  // 处理旧版推理配置（legacy reasoning payload）
  let resolvedReasoning = null
  if (legacyReasoning && typeof legacyReasoning === 'object' && legacyReasoning.payload) {
    const payload = legacyReasoning.payload || {}
    const controlMode = payload.max_tokens
      ? 'max_tokens'
      : payload.effort
        ? 'effort'
        : 'disabled'

    resolvedReasoning = {
      controlMode,
      effort: payload.effort || 'medium',
      maxReasoningTokens: typeof payload.max_tokens === 'number' ? payload.max_tokens : undefined,
      showReasoningContent: payload.exclude ? false : true,
    }

    requestOverride.reasoning = resolvedReasoning
  }

  // 清理空对象以避免冗余字段
  if (Object.keys(requestOverride.sampling).length === 0) {
    delete requestOverride.sampling
  }
  if (Object.keys(requestOverride.length).length === 0) {
    delete requestOverride.length
  }

  const effectiveConfig = generationConfigManager.getEffectiveConfig({
    modelId,
    conversationId,
    requestOverride,
  })

  return { effectiveConfig, resolvedReasoning }
}

/**
 * AI 聊天服务主入口，对外暴露统一 API。
 */
export const aiChatService = {
  
  /**
   * 获取当前 Provider 的上下文，包括服务实现与凭据。
   *
   * Provider 映射：
   * - Gemini: { service: GeminiService, apiKey: geminiApiKey, baseUrl: null }
   * - OpenRouter: { service: OpenRouterService, apiKey: openRouterApiKey, baseUrl: openRouterBaseUrl }
   *
   * @param {Object} appStore Pinia 的 appStore
   * @returns {{ service: any, apiKey: string, baseUrl: string|null }}
   * @throws {Error} 未知的 Provider
   */
  getProviderContext(appStore) {
    const provider = appStore.activeProvider
    
    console.log('aiChatService: 当前 Provider =', provider)
    
    if (provider === 'Gemini') {
      return {
        service: GeminiService,
        apiKey: appStore.geminiApiKey,
        baseUrl: null // Gemini 不需要自定义 baseUrl
      }
    } else if (provider === 'OpenRouter') {
      return {
        service: OpenRouterService,
        apiKey: appStore.openRouterApiKey,
        baseUrl: appStore.openRouterBaseUrl
      }
    }
    
    // 未知 Provider
    throw new Error(`未知的 AI Provider: ${provider}`)
  },

  /**
   * 列出当前 Provider 的可用模型列表。
   * @param {Object} appStore Pinia 的 appStore
   * @returns {Promise<Array>} 模型对象数组（OpenRouter）或模型 ID 数组（Gemini）
   */
  async listAvailableModels(appStore) {
    console.log('aiChatService: 获取模型列表..')
    
    try {
      const { service, apiKey, baseUrl } = this.getProviderContext(appStore)
      
      if (!apiKey) {
        console.warn('aiChatService: 缺少 API Key')
        return []
      }
      
      // 根据 Provider 调用 listAvailableModels（OpenRouter 需要 baseUrl）
      const models = baseUrl 
        ? await service.listAvailableModels(apiKey, baseUrl)
        : await service.listAvailableModels(apiKey)
      
      console.log('aiChatService: 模型数量', models.length)
      return models
    } catch (error) {
      console.error('aiChatService: 获取模型失败', error)
      return []
    }
  },

  /**
   * 按当前 Provider 以流式方式获取聊天响应。
   *
   * @param {Object} appStore Pinia 的 appStore
   * @param {Array} history 历史消息：[{ role: 'user'|'model', parts: [...] }]
   * @param {string} modelName 模型名或 ID（OpenRouter 可为短名）
   * @param {string} userMessage 用户输入
   * @param {Object} [options] 额外选项
   * @param {AbortSignal} [options.signal] 取消信号
   * @returns {AsyncIterable<string>} 文本流
   */
  async* streamChatResponse(appStore, history, modelName, userMessage, options = {}) {
    //  undefined 
    const safeHistory = Array.isArray(history) ? history : []
    const safeUserMessage = typeof userMessage === 'string' ? userMessage : ''
    const {
      signal = null,
      webSearch = null,
      requestedModalities = null,
      imageConfig = null,
      reasoning = null,
      parameters = null,
      pdfEngine = null,
      conversationId = null,
      systemInstruction = null,
    } = options || {}

    console.log('[aiChatService] 🎯 streamChatResponse 被调用', {
      modelName,
      historyLength: safeHistory.length,
      userMessageLength: safeUserMessage.length,
      timestamp: Date.now()
    })
    console.log('aiChatService: 开始流式响应..')
    console.log('  - 模型:', modelName)
    console.log('  - 历史条数:', safeHistory.length)
    console.log('  - 输入长度:', safeUserMessage.length)
    
    //   Service ?
    console.log(' [aiChatService] Options:', JSON.stringify(options, (key, value) => {
      if (key === 'signal') return '[AbortSignal]'
      return value
    }, 2))
    console.log(' [aiChatService] History Sample (last item):', safeHistory.length > 0 ? safeHistory[safeHistory.length - 1] : 'Empty')

    try {
      console.log('[aiChatService] 🔍 获取 Provider 上下文')
      const { service, apiKey, baseUrl } = this.getProviderContext(appStore)
      console.log('[aiChatService] ✅ Provider 上下文获取成功', {
        isGemini: service === GeminiService,
        isOpenRouter: service === OpenRouterService,
        hasApiKey: !!apiKey,
        baseUrl
      })
      
      if (!apiKey) {
        throw new Error('缺少 API Key，无法调用接口')
      }
      
      // OpenRouter: 获取模型参数/能力信息
      let modelParametersInfo = null
      let modelCapability = null
      if (service === OpenRouterService) {
        try {
          const modelStore = useModelStore()
          
          // 优先从 store 的能力映射获取
          modelCapability = modelStore.getModelCapability?.(modelName)
          
          if (modelCapability) {
            console.log('能力已缓存:', modelName)
          } else if (modelStore?.getModelSupportedParameters) {
            // 回退：从支持参数缓存构建能力
            const cachedParams = modelStore.getModelSupportedParameters(modelName)
            if (cachedParams) {
              // 读取缓存条目
              const cachedEntry = modelStore.modelSupportedParametersMap?.get(modelName)
              if (cachedEntry) {
                modelParametersInfo = {
                  model: cachedEntry.model || modelName,
                  supported_parameters: cachedEntry.supported_parameters,
                  raw: cachedEntry.raw
                }
                
                // 尝试基于原始数据构建 ModelGenerationCapability
                if (modelParametersInfo.raw) {
                  try {
                    modelCapability = buildModelCapability(modelParametersInfo.raw)
                    console.log('能力解析成功:', modelName, modelCapability.supportedParameters)
                  } catch (capErr) {
                    console.warn('aiChatService: 能力解析失败', capErr)
                  }
                }
                // 回退：仅使用 supported_parameters 构造能力
                if (!modelCapability && modelParametersInfo.supported_parameters) {
                  try {
                    modelCapability = buildModelCapability({
                      id: modelName,
                      supported_parameters: modelParametersInfo.supported_parameters,
                      top_provider: {},
                      pricing: {},
                      name: modelName
                    })
                  } catch (capErr) {
                    console.warn('aiChatService: 能力回退失败', capErr)
                  }
                }
              }
            }
          }
        } catch (storeErr) {
          console.warn('aiChatService: 读取模型能力失败', storeErr)
        }
      }
      
      // 根据 Provider 调用对应的 streamChatResponse
      if (service === GeminiService) {
        // Gemini: (apiKey, history, modelName, userMessage, options)
        yield* service.streamChatResponse(apiKey, safeHistory, modelName, safeUserMessage, { signal, webSearch, requestedModalities, imageConfig, reasoning, parameters, pdfEngine, systemInstruction })
      } else if (service === OpenRouterService) {
        // OpenRouter: (apiKey, history, modelName, userMessage, baseUrl, options)
        // 处理短模型名到 provider/name 的映射
        let openRouterModelId = modelName
        if (!modelName.includes('/')) {
          // 映射规则：gemini-* -> google/*, gpt-* -> openai/*, claude-* -> anthropic/*, llama-* -> meta-llama/*, auto -> openrouter/auto
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
          console.log(` [aiChatService] 规范化模型 ID: ${modelName} -> ${openRouterModelId}`)
        }

        // Phase 2 Airlock: 旧版 UI 选项 -> 统一 GenerationConfig
        console.log('[aiChatService] 🔧 构建 GenerationConfig')
        const { effectiveConfig, resolvedReasoning } = buildAirlockedGenerationConfig({
          modelId: openRouterModelId,
          conversationId: conversationId?.value || conversationId,
          legacyReasoning: reasoning,
          legacyParameters: parameters,
        })

        console.log('[aiChatService] 🚀 准备调用 OpenRouterService.streamChatResponse', {
          modelId: openRouterModelId,
          hasApiKey: !!apiKey,
          historyLength: safeHistory.length,
          hasConfig: !!effectiveConfig,
          timestamp: Date.now()
        })

        yield* service.streamChatResponse(apiKey, safeHistory, openRouterModelId, safeUserMessage, baseUrl, { 
          signal, 
          webSearch, 
          requestedModalities, 
          imageConfig, 
          pdfEngine, 
          modelParameters: modelParametersInfo,
          modelCapability: modelCapability,  // 解析后的能力（若可用）
          generationConfig: effectiveConfig,
          resolvedReasoningConfig: resolvedReasoning,
          systemInstruction,
        })
      } else {
        throw new Error('未知 Provider，无法发起请求')
      }
      
      console.log('aiChatService: 流式响应完成')
    } catch (error) {
      console.error('aiChatService: 流式响应失败', error)
      throw error
    }
  },

  /**
   * 获取当前 Provider 的 API Key。
   * @param {Object} appStore Pinia 的 appStore
   * @returns {string} API Key 或空字符串
   */
  getCurrentApiKey(appStore) {
    const { apiKey } = this.getProviderContext(appStore)
    return apiKey || ''
  },

  /**
   * 判断指定模型是否支持视觉输入（image/vision/multimodal）。
   * @param {Object} appStore Pinia 的 appStore
   * @param {string} modelId 模型 ID
   * @returns {boolean} 是否支持视觉
   */
  supportsVision(appStore, modelId) {
    try {
      if (!modelId) return false

      // 优先从 modelStore 的 availableModelsMap 查询
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
        // 回退到 Provider 层判断
        console.warn('aiChatService.supportsVision: 读取 modelStore 失败 ', err)
      }

      // 回退到具体 Provider 的 supportsVision
      const { service } = this.getProviderContext(appStore)
      if (service && service.supportsVision && typeof service.supportsVision === 'function') {
        return service.supportsVision(modelId)
      }

      return false
    } catch (error) {
      console.error('aiChatService: supportsVision 判断失败', error)
      return false
    }
  }
}



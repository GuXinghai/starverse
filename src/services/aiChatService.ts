/**
 * AI 聊天服务路由器（TypeScript 版本）
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
 * 
 * @module services/aiChatService
 */

import { GeminiService } from './providers/GeminiService.js'
import { OpenRouterService } from './providers/OpenRouterService'
import { useModelStore } from '../stores/model'
import { generationConfigManager } from './providers/generationConfigManager'
import { buildModelCapability } from './providers/modelCapability'
import type { 
  ProviderContext, 
  StreamOptions, 
  HistoryMessage,
  AIProviderService,
  AirlockedGenerationConfigResult
} from '../types/providers'
import type {
  LegacyReasoning,
  LegacySamplingParameters,
  ReasoningConfig,
  GenerationConfig
} from '../types/providers'

/**
 * 旧版 UI 采样参数白名单
 */
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
]) as ReadonlySet<keyof LegacySamplingParameters>

/**
 * AppStore 类型定义（从 Pinia Store 引用）
 */
interface AppStore {
  activeProvider: 'Gemini' | 'OpenRouter'
  geminiApiKey: string
  openRouterApiKey: string
  openRouterBaseUrl: string
}

/**
 * buildAirlockedGenerationConfig 的输入参数
 */
interface AirlockedConfigParams {
  /** 模型 ID（OpenRouter 需为 provider/name 形式） */
  modelId: string
  /** 会话 ID（可选） */
  conversationId?: string | null
  /** 旧版推理配置 */
  legacyReasoning?: LegacyReasoning | null
  /** 旧版采样/长度参数 */
  legacyParameters?: LegacySamplingParameters | null
}

/**
 * 将旧版 UI 的 reasoning/parameters 选项整合为统一的 GenerationConfig。
 *
 * **转换规则**：
 * - 仅允许白名单中的采样参数（LEGACY_SAMPLING_KEYS）透传
 * - 将 max_tokens 归类为长度控制，其余归为采样控制
 * - 将旧版 reasoning 结构解析为规范化的 `resolvedReasoning`
 *
 * @param params - 配置参数
 * @returns 统一配置与解析后的推理配置
 * 
 * @example
 * ```typescript
 * const result = buildAirlockedGenerationConfig({
 *   modelId: 'openai/gpt-4',
 *   legacyParameters: { temperature: 0.7, max_tokens: 1000 },
 *   legacyReasoning: { payload: { effort: 'high' } }
 * })
 * // result.effectiveConfig: { sampling: { temperature: 0.7 }, length: { max_tokens: 1000 } }
 * // result.resolvedReasoning: { controlMode: 'effort', effort: 'high', ... }
 * ```
 */
function buildAirlockedGenerationConfig({
  modelId,
  conversationId,
  legacyReasoning,
  legacyParameters,
}: AirlockedConfigParams): AirlockedGenerationConfigResult {
  const requestOverride: Partial<GenerationConfig> = {
    sampling: {},
    length: {},
    reasoning: undefined,
  }

  // 处理旧版采样与长度参数（legacy parameters）
  if (legacyParameters && typeof legacyParameters === 'object') {
    for (const [key, raw] of Object.entries(legacyParameters)) {
      if (!LEGACY_SAMPLING_KEYS.has(key as keyof LegacySamplingParameters)) continue
      const num = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
      if (num === null) continue

      if (key === 'max_tokens') {
        requestOverride.length = requestOverride.length || {}
        requestOverride.length.max_tokens = num
      } else {
        requestOverride.sampling = requestOverride.sampling || {}
        // 使用索引签名安全地赋值
        requestOverride.sampling[key as keyof typeof requestOverride.sampling] = num as never
      }
    }
  }

  // 处理旧版推理配置（legacy reasoning payload）
  let resolvedReasoning: ReasoningConfig | null = null
  if (legacyReasoning && typeof legacyReasoning === 'object' && legacyReasoning.payload) {
    const payload = legacyReasoning.payload
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
  if (requestOverride.sampling && Object.keys(requestOverride.sampling).length === 0) {
    delete requestOverride.sampling
  }
  if (requestOverride.length && Object.keys(requestOverride.length).length === 0) {
    delete requestOverride.length
  }

  const effectiveConfig: any = generationConfigManager.getEffectiveConfig({
    modelId,
    conversationId: conversationId || undefined,
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
   * **Provider 映射**：
   * - Gemini: { service: GeminiService, apiKey: geminiApiKey, baseUrl: null }
   * - OpenRouter: { service: OpenRouterService, apiKey: openRouterApiKey, baseUrl: openRouterBaseUrl }
   *
   * @param appStore - Pinia 的 appStore
   * @returns Provider 上下文（服务实例 + API Key + Base URL）
   * @throws {Error} 未知的 Provider
   */
  getProviderContext(appStore: AppStore): ProviderContext {
    const provider = appStore.activeProvider
    
    console.log('aiChatService: 当前 Provider =', provider)
    
    if (provider === 'Gemini') {
      return {
        service: GeminiService as unknown as AIProviderService,
        apiKey: appStore.geminiApiKey,
        baseUrl: null // Gemini 不需要自定义 baseUrl
      }
    } else if (provider === 'OpenRouter') {
      return {
        service: OpenRouterService as unknown as AIProviderService,
        apiKey: appStore.openRouterApiKey,
        baseUrl: appStore.openRouterBaseUrl
      }
    }
    
    // 未知 Provider
    throw new Error(`未知的 AI Provider: ${provider}`)
  },

  /**
   * 列出当前 Provider 的可用模型列表。
   * 
   * @param appStore - Pinia 的 appStore
   * @returns 模型 ID 数组
   * 
   * @example
   * ```typescript
   * const models = await aiChatService.listAvailableModels(appStore)
   * // ['gemini-2.0-flash-exp', 'gemini-1.5-pro', ...]
   * ```
   */
  async listAvailableModels(appStore: AppStore): Promise<string[]> {
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
   * **流程**：
   * 1. 验证输入参数（history, userMessage）
   * 2. 获取 Provider 上下文（service, apiKey, baseUrl）
   * 3. 对于 OpenRouter，查询模型能力缓存
   * 4. 将旧版 UI 参数转换为统一 GenerationConfig
   * 5. 调用具体 Provider 的 streamChatResponse
   * 6. 逐 token 产出文本流
   *
   * @param appStore - Pinia 的 appStore
   * @param history - 历史消息数组
   * @param modelName - 模型名或 ID（OpenRouter 可为短名）
   * @param userMessage - 用户输入消息
   * @param options - 流式响应选项（signal, webSearch, reasoning 等）
   * @returns 异步生成器，逐 token 产出文本
   * @throws {Error} 缺少 API Key 或未知 Provider
   * 
   * @example
   * ```typescript
   * const stream = aiChatService.streamChatResponse(
   *   appStore, 
   *   history, 
   *   'gemini-2.0-flash-exp', 
   *   'Hello!', 
   *   { signal: abortController.signal }
   * )
   * for await (const chunk of stream) {
   *   console.log(chunk) // 增量文本
   * }
   * ```
   */
  async* streamChatResponse(
    appStore: AppStore, 
    history: HistoryMessage[], 
    modelName: string, 
    userMessage: string, 
    options: StreamOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    // 防御性编程：确保 history 和 userMessage 有效
    const safeHistory = Array.isArray(history) ? history : []
    const safeUserMessage = typeof userMessage === 'string' ? userMessage : ''
    const {
      signal = null,
      webSearch = null,
      legacyReasoning = null,
      legacyParameters = null,
      conversationId = null,
    } = options

    console.log('aiChatService: 开始流式响应..')
    console.log('  - 模型:', modelName)
    console.log('  - 历史条数:', safeHistory.length)
    console.log('  - 输入长度:', safeUserMessage.length)
    
    // 详细日志：调试 Provider 选择和参数传递
    console.log('[aiChatService] Options:', JSON.stringify(options, (key, value) => {
      if (key === 'signal') return '[AbortSignal]'
      return value
    }, 2))
    console.log('[aiChatService] History Sample (last item):', safeHistory.length > 0 ? safeHistory[safeHistory.length - 1] : 'Empty')

    try {
      const { service, apiKey, baseUrl } = this.getProviderContext(appStore)
      
      if (!apiKey) {
        throw new Error('缺少 API Key，无法调用接口')
      }
      
      // OpenRouter: 获取模型参数/能力信息
      let modelParametersInfo: any = null
      let modelCapability: any = null
      if (service === OpenRouterService) {
        try {
          const modelStore = useModelStore()
          
          // 优先从 store 的能力映射获取
          modelCapability = modelStore.getModelCapability?.(modelName)
          
          if (modelCapability) {
            console.log('能力已缓存:', modelName)
          } else {
            // 回退：尝试从 modelParameterSupportMap 获取参数支持信息
            const cachedParams = modelStore.getModelParameterSupport?.(modelName)
            if (cachedParams) {
              // 读取缓存条目
              const cachedEntry = modelStore.modelParameterSupportMap?.get(modelName)
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
      // 注意：使用 baseUrl 判断是否为 Gemini（baseUrl 为 null）
      const isGemini = baseUrl === null
      
      if (isGemini) {
        // Gemini: (apiKey, history, modelName, userMessage, options)
        yield* (service as any).streamChatResponse(apiKey, safeHistory, modelName, safeUserMessage, baseUrl, options)
      } else {
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
          console.log(`[aiChatService] 规范化模型 ID: ${modelName} -> ${openRouterModelId}`)
        }

        // Phase 2 Airlock: 旧版 UI 选项 -> 统一 GenerationConfig
        const { effectiveConfig, resolvedReasoning } = buildAirlockedGenerationConfig({
          modelId: openRouterModelId,
          conversationId: typeof conversationId === 'string' ? conversationId : null,
          legacyReasoning,
          legacyParameters,
        })

        // 构建 OpenRouter 专属选项
        const openRouterOptions = { 
          ...options,
          signal, 
          webSearch, 
          modelParameters: modelParametersInfo,
          modelCapability: modelCapability,  // 解析后的能力（若可用）
          generationConfig: effectiveConfig,
          resolvedReasoningConfig: resolvedReasoning,
        }

        yield* (service as any).streamChatResponse(apiKey, safeHistory, openRouterModelId, safeUserMessage, baseUrl, openRouterOptions)
      }
      
      console.log('aiChatService: 流式响应完成')
    } catch (error) {
      console.error('aiChatService: 流式响应失败', error)
      throw error
    }
  },

  /**
   * 获取当前 Provider 的 API Key。
   * 
   * @param appStore - Pinia 的 appStore
   * @returns API Key 或空字符串
   */
  getCurrentApiKey(appStore: AppStore): string {
    const { apiKey } = this.getProviderContext(appStore)
    return apiKey || ''
  },

  /**
   * 判断指定模型是否支持视觉输入（image/vision/multimodal）。
   * 
   * **判断顺序**：
   * 1. 优先从 modelStore 的 availableModelsMap 查询 input_modalities
   * 2. 回退到具体 Provider 的 supportsVision 方法
   * 
   * @param appStore - Pinia 的 appStore
   * @param modelId - 模型 ID
   * @returns 是否支持视觉输入
   * 
   * @example
   * ```typescript
   * const hasVision = aiChatService.supportsVision(appStore, 'gemini-2.0-flash-exp')
   * // true (Gemini 2.0 支持视觉)
   * ```
   */
  supportsImage(appStore: AppStore, modelId: string): boolean {
    try {
      if (!modelId) return false

      // 从 modelStore 获取完整 ModelData 对象
      const modelStore = useModelStore()
      const model = modelStore.modelDataMap.get(modelId) || modelStore.modelDataMap.get(String(modelId).toLowerCase())
      if (!model) return false

      // 调用 Provider 的 supportsImage 方法（基于 input_modalities）
      const { service } = this.getProviderContext(appStore)
      return service.supportsImage(model)
    } catch (error) {
      console.error('aiChatService: supportsImage 判断失败', error)
      return false
    }
  },

  /**
   * 检查模型是否支持文件输入（document/file 模态）
   */
  supportsFileInput(appStore: AppStore, modelId: string): boolean {
    try {
      if (!modelId) return false

      // 从 modelStore 获取完整 ModelData 对象
      const modelStore = useModelStore()
      const model = modelStore.modelDataMap.get(modelId) || modelStore.modelDataMap.get(String(modelId).toLowerCase())
      if (!model) return false

      // 调用 Provider 的 supportsFileInput 方法
      const { service } = this.getProviderContext(appStore)
      return service.supportsFileInput(model)
    } catch (error) {
      console.error('aiChatService: supportsFileInput 判断失败', error)
      return false
    }
  }
}

/**
 * 模型管理 Store (重构版)
 * 
 * 🎯 设计原则：
 * - 唯一模型类型：统一使用 AppModel，不再有 ModelData/ModelParameterSupport
 * - 能力内置：所有模型能力信息直接存储在 AppModel.capabilities 中
 * - 单一数据源：只从 /api/v1/models 同步，不调用 /parameters
 * 
 * 职责：
 * - 模型列表管理 (appModels)
 * - 收藏模型管理
 * - 当前选中模型
 * - 按 ID 快速查询 (appModelsById)
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AppModel } from '../types/appModel'
import type { ModelGenerationCapability } from '../types/generation'
import { electronStore } from '../utils/electronBridge'
import { registerCapability } from '../services/capabilityRegistry'
import * as modelDataClient from '../services/db/modelDataClient'

export const useModelStore = defineStore('model', () => {
  // ========== State ==========

  /**
   * 🎯 核心状态：规范化后的模型列表
   * 所有模型数据统一使用 AppModel 类型
   */
  const appModels = ref<AppModel[]>([])

  /**
   * 用户收藏的模型 ID 集合
   */
  const favoriteModelIds = ref<Set<string>>(new Set())

  /**
   * 当前选中的模型 ID
   */
  const selectedModelId = ref<string>('auto')

  // ========== Computed ==========

  /**
   * 🎯 按 ID 索引的 Map，O(1) 查询
   */
  const appModelsById = computed<Map<string, AppModel>>(() => {
    const map = new Map<string, AppModel>()
    for (const model of appModels.value) {
      map.set(model.id, model)
    }
    return map
  })

  /**
   * 收藏的模型列表
   */
  const favoriteModels = computed<AppModel[]>(() => {
    return Array.from(favoriteModelIds.value)
      .map(id => appModelsById.value.get(id))
      .filter((model): model is AppModel => model !== undefined)
  })

  /**
   * 当前选中的模型数据
   */
  const selectedModel = computed<AppModel | null>(() => {
    return appModelsById.value.get(selectedModelId.value) || null
  })

  // ========== Actions - 模型列表管理 ==========

  /**
   * 🎯 设置模型列表（主入口）
   * 
   * @param models - AppModel 数据数组
   */
  const setAppModels = (models: AppModel[]): void => {
    // 确保每个模型都有有效的 id
    const validModels = models.filter(m => m && m.id)
    appModels.value = validModels
    
    // 同步注册到 CapabilityRegistry
    registerAllCapabilities()
    
    console.log(`✅ [modelStore] 设置 ${validModels.length} 个模型`)
  }

  /**
   * 添加单个模型
   * 
   * @param model - AppModel 数据
   */
  const addModel = (model: AppModel): void => {
    if (!model || !model.id) return

    const existing = appModelsById.value.get(model.id)
    if (!existing) {
      appModels.value.push(model)
      registerModelCapability(model)
    }
  }

  /**
   * 移除模型
   * 
   * @param modelId - 模型 ID
   */
  const removeModel = (modelId: string): void => {
    const index = appModels.value.findIndex(m => m.id === modelId)
    if (index !== -1) {
      appModels.value.splice(index, 1)
    }
    favoriteModelIds.value.delete(modelId)
  }

  // ========== Actions - 收藏管理 ==========

  /**
   * 切换模型收藏状态
   * 
   * @param modelId - 模型 ID
   * @returns 新的收藏状态
   */
  const toggleFavorite = (modelId: string): boolean => {
    if (favoriteModelIds.value.has(modelId)) {
      favoriteModelIds.value.delete(modelId)
      saveFavorites()
      return false
    } else {
      favoriteModelIds.value.add(modelId)
      saveFavorites()
      return true
    }
  }

  /**
   * 检查模型是否已收藏
   * 
   * @param modelId - 模型 ID
   * @returns 是否已收藏
   */
  const isFavorite = (modelId: string): boolean => {
    return favoriteModelIds.value.has(modelId)
  }

  /**
   * 设置收藏模型列表
   * 
   * @param modelIds - 模型 ID 数组
   */
  const setFavorites = (modelIds: string[]): void => {
    favoriteModelIds.value = new Set(modelIds)
  }

  // ========== Actions - 持久化 ==========

  /**
   * 保存收藏模型到 electron-store
   */
  const saveFavorites = async (): Promise<void> => {
    try {
      const favoriteArray = Array.from(favoriteModelIds.value)
      await electronStore.set('favoriteModels', favoriteArray)
      console.log('✅ 收藏模型已保存:', favoriteArray.length)
    } catch (error) {
      console.error('❌ 保存收藏模型失败:', error)
    }
  }

  /**
   * 从 electron-store 加载收藏模型
   */
  const loadFavorites = async (): Promise<void> => {
    try {
      const favoriteArray = await electronStore.get('favoriteModels')
      if (Array.isArray(favoriteArray)) {
        favoriteModelIds.value = new Set(favoriteArray)
        console.log('✅ 从 electron-store 加载了', favoriteArray.length, '个收藏模型')
      }
    } catch (error) {
      console.error('❌ 加载收藏模型失败:', error)
    }
  }

  /**
   * 保存模型列表到数据库
   */
  const saveAppModels = async (): Promise<void> => {
    try {
      const modelsArray = appModels.value
      console.log('[modelStore] 💾 开始保存模型列表', {
        count: modelsArray.length,
        sample: modelsArray[0]?.id
      })
      
      await modelDataClient.saveAppModels(modelsArray)
      console.log('✅ 模型列表已保存到数据库:', modelsArray.length, '个模型')
    } catch (error) {
      console.error('❌ 保存模型列表失败:', error)
      if (error instanceof Error) {
        console.error('❌ 错误详情:', {
          message: error.message,
          stack: error.stack
        })
      }
    }
  }

  /**
   * 从数据库加载模型列表
   */
  const loadAppModels = async (): Promise<boolean> => {
    try {
      const modelsArray = await modelDataClient.getAppModels({ includeArchived: false })
      if (Array.isArray(modelsArray) && modelsArray.length > 0) {
        setAppModels(modelsArray)
        console.log('✅ 从数据库加载了', modelsArray.length, '个模型')
        return true
      }
    } catch (error) {
      console.error('❌ 加载模型列表失败:', error)
    }
    return false
  }

  /**
   * 仅清空模型表 (model_data)
   * - 只影响模型列表缓存与 DB 的 model_data 表
   * - 不影响对话、消息、偏好设置等其他数据
   */
  const clearModelTable = async (): Promise<void> => {
    await modelDataClient.clearModelTable()
    setAppModels([])
  }

  // ========== Actions - 模型选择 ==========

  /**
   * 设置当前选中的模型
   * 
   * @param modelId - 模型 ID
   */
  const setSelectedModel = (modelId: string): void => {
    selectedModelId.value = modelId
  }

  // ========== Actions - 能力注册 ==========

  /**
   * 将单个 AppModel 的能力注册到 CapabilityRegistry
   */
  const registerModelCapability = (model: AppModel): void => {
    // 从 AppModel.capabilities 转换为 ModelGenerationCapability
    const capability: ModelGenerationCapability = {
      modelId: model.id,
      sampling: {
        temperature: true,
        top_p: true,
        top_k: true,
        min_p: false,
        top_a: false,
        frequency_penalty: true,
        presence_penalty: true,
        repetition_penalty: false,
        seed: true,
        logit_bias: false,
      },
      length: {
        max_tokens: true,
        stop: true,
        verbosity: false,
        maxCompletionTokens: model.max_output_tokens || null,
      },
      reasoning: {
        modelId: model.id,
        supportsReasoningParam: model.capabilities.hasReasoning,
        supportsIncludeReasoning: false,
        supportsMaxReasoningTokens: model.capabilities.hasReasoning,
        returnsVisibleReasoning: model.capabilities.hasReasoning ? 'yes' : 'no',
        maxCompletionTokens: model.max_output_tokens || null,
        internalReasoningPrice: null,
        family: model.vendor as any || 'unknown',
        // 不支持推理的模型归类为 'C'（完全不支持推理参数）
        reasoningClass: model.capabilities.hasReasoning ? 'A' : 'C',
        maxTokensPolicy: 'effort-only',
      },
      other: {
        tools: model.capabilities.hasTools,
        response_format: model.capabilities.hasJsonMode,
        structured_outputs: model.capabilities.hasJsonMode,
        logprobs: false,
        top_logprobs: false,
        parallel_tool_calls: model.capabilities.hasTools,
      },
    }
    
    registerCapability(model.id, capability)
  }

  /**
   * 批量注册所有模型能力
   */
  const registerAllCapabilities = (): void => {
    for (const model of appModels.value) {
      registerModelCapability(model)
    }
    console.log(`✅ [modelStore] 已注册 ${appModels.value.length} 个模型能力到 Registry`)
  }

  // ========== Queries ==========

  /**
   * 根据 ID 获取模型数据
   * 
   * @param modelId - 模型 ID
   * @returns AppModel 或 null
   */
  const getModelById = (modelId: string): AppModel | null => {
    return appModelsById.value.get(modelId) || null
  }

  /**
   * 获取模型能力（从 AppModel.capabilities 读取）
   * 
   * @param modelId - 模型 ID
   * @returns 模型能力对象或 null
   */
  const getModelCapability = (modelId: string): ModelGenerationCapability | null => {
    const model = appModelsById.value.get(modelId)
    if (!model) return null

    // 从 AppModel 动态构建 ModelGenerationCapability
    return {
      modelId: model.id,
      sampling: {
        temperature: true,
        top_p: true,
        top_k: true,
        min_p: false,
        top_a: false,
        frequency_penalty: true,
        presence_penalty: true,
        repetition_penalty: false,
        seed: true,
        logit_bias: false,
      },
      length: {
        max_tokens: true,
        stop: true,
        verbosity: false,
        maxCompletionTokens: model.max_output_tokens || null,
      },
      reasoning: {
        modelId: model.id,
        supportsReasoningParam: model.capabilities.hasReasoning,
        supportsIncludeReasoning: false,
        supportsMaxReasoningTokens: model.capabilities.hasReasoning,
        returnsVisibleReasoning: model.capabilities.hasReasoning ? 'yes' : 'no',
        maxCompletionTokens: model.max_output_tokens || null,
        internalReasoningPrice: null,
        family: model.vendor as any || 'unknown',
        // 不支持推理的模型归类为 'C'（完全不支持推理参数）
        reasoningClass: model.capabilities.hasReasoning ? 'A' : 'C',
        maxTokensPolicy: 'effort-only',
      },
      other: {
        tools: model.capabilities.hasTools,
        response_format: model.capabilities.hasJsonMode,
        structured_outputs: model.capabilities.hasJsonMode,
        logprobs: false,
        top_logprobs: false,
        parallel_tool_calls: model.capabilities.hasTools,
      },
    }
  }

  /**
   * 搜索模型
   * 
   * @param query - 搜索关键词
   * @returns 匹配的模型列表
   */
  const searchModels = (query: string): AppModel[] => {
    const lowerQuery = query.toLowerCase()
    return appModels.value.filter(model =>
      model.id.toLowerCase().includes(lowerQuery) ||
      model.name?.toLowerCase().includes(lowerQuery) ||
      model.description?.toLowerCase().includes(lowerQuery)
    )
  }

  /**
   * 检查模型是否支持推理
   * 
   * @param modelId - 模型 ID
   * @returns 是否支持推理
   */
  const supportsReasoning = (modelId: string): boolean => {
    const model = appModelsById.value.get(modelId)
    return model?.capabilities.hasReasoning ?? false
  }

  /**
   * 检查模型是否支持视觉/多模态
   * 
   * @param modelId - 模型 ID
   * @returns 是否支持视觉
   */
  const supportsVision = (modelId: string): boolean => {
    const model = appModelsById.value.get(modelId)
    return model?.capabilities.isMultimodal ?? false
  }

  return {
    // State
    appModels,
    favoriteModelIds,
    selectedModelId,

    // Computed
    appModelsById,
    favoriteModels,
    selectedModel,

    // Actions - 模型列表
    setAppModels,
    addModel,
    removeModel,

    // Actions - 收藏
    toggleFavorite,
    isFavorite,
    setFavorites,

    // Actions - 选择
    setSelectedModel,

    // Actions - 持久化
    loadFavorites,
    saveFavorites,
    loadAppModels,
    saveAppModels,
    clearModelTable,

    // Queries
    getModelById,
    getModelCapability,
    searchModels,
    supportsReasoning,
    supportsVision
  }
})

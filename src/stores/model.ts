/**
 * 模型管理 Store
 * 
 * 职责：
 * - 模型列表管理
 * - 收藏模型管理
 * - 模型参数支持缓存
 * - 当前选中模型
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ModelData, ModelParameterSupport } from '../types/store'
import { electronStore } from '../utils/electronBridge'

export const useModelStore = defineStore('model', () => {
  // ========== State ==========

  /**
   * 可用模型 ID 列表（向后兼容）
   */
  const availableModelIds = ref<string[]>([])

  /**
   * 模型完整数据 Map
   */
  const modelDataMap = ref<Map<string, ModelData>>(new Map())

  /**
   * 模型参数支持信息缓存
   */
  const modelParameterSupportMap = ref<Map<string, ModelParameterSupport>>(new Map())

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
   * 所有可用模型的完整数据数组
   */
  const availableModels = computed<ModelData[]>(() => {
    return availableModelIds.value
      .map(id => modelDataMap.value.get(id))
      .filter((model): model is ModelData => model !== undefined)
  })

  /**
   * 收藏的模型列表
   */
  const favoriteModels = computed<ModelData[]>(() => {
    return Array.from(favoriteModelIds.value)
      .map(id => modelDataMap.value.get(id))
      .filter((model): model is ModelData => model !== undefined)
  })

  /**
   * 当前选中的模型数据
   */
  const selectedModel = computed<ModelData | null>(() => {
    return modelDataMap.value.get(selectedModelId.value) || null
  })

  // ========== Actions - 模型列表管理 ==========

  /**
   * 设置可用模型列表
   * 
   * @param models - 模型数据数组
   */
  const setAvailableModels = (models: ModelData[]): void => {
    const ids: string[] = []
    const map = new Map<string, ModelData>()

    for (const model of models) {
      if (model && model.id) {
        ids.push(model.id)
        map.set(model.id, model)
      }
    }

    availableModelIds.value = ids
    modelDataMap.value = map
  }

  /**
   * 添加单个模型
   * 
   * @param model - 模型数据
   */
  const addModel = (model: ModelData): void => {
    if (!model || !model.id) return

    if (!availableModelIds.value.includes(model.id)) {
      availableModelIds.value.push(model.id)
    }
    modelDataMap.value.set(model.id, model)
  }

  /**
   * 移除模型
   * 
   * @param modelId - 模型 ID
   */
  const removeModel = (modelId: string): void => {
    const index = availableModelIds.value.indexOf(modelId)
    if (index !== -1) {
      availableModelIds.value.splice(index, 1)
    }
    modelDataMap.value.delete(modelId)
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

  // ========== Actions - 模型选择 ==========

  /**
   * 设置当前选中的模型
   * 
   * @param modelId - 模型 ID
   */
  const setSelectedModel = (modelId: string): void => {
    selectedModelId.value = modelId
  }

  // ========== Actions - 参数支持缓存 ==========

  /**
   * 更新模型参数支持信息
   * 
   * @param modelId - 模型 ID
   * @param support - 参数支持信息
   */
  const updateModelParameterSupport = (
    modelId: string,
    support: ModelParameterSupport
  ): void => {
    modelParameterSupportMap.value.set(modelId, support)
  }

  /**
   * 获取模型参数支持信息
   * 
   * @param modelId - 模型 ID
   * @returns 参数支持信息或 null
   */
  const getModelParameterSupport = (modelId: string): ModelParameterSupport | null => {
    return modelParameterSupportMap.value.get(modelId) || null
  }

  /**
   * 批量设置参数支持信息
   * 
   * @param supportMap - 模型 ID 到参数支持的映射
   */
  const setModelParameterSupportMap = (
    supportMap: Map<string, ModelParameterSupport> | Record<string, ModelParameterSupport>
  ): void => {
    if (supportMap instanceof Map) {
      modelParameterSupportMap.value = new Map(supportMap)
    } else {
      modelParameterSupportMap.value = new Map(Object.entries(supportMap))
    }
  }

  // ========== Queries ==========

  /**
   * 根据 ID 获取模型数据
   * 
   * @param modelId - 模型 ID
   * @returns 模型数据或 null
   */
  const getModelById = (modelId: string): ModelData | null => {
    return modelDataMap.value.get(modelId) || null
  }

  /**
   * 搜索模型
   * 
   * @param query - 搜索关键词
   * @returns 匹配的模型列表
   */
  const searchModels = (query: string): ModelData[] => {
    const lowerQuery = query.toLowerCase()
    return availableModels.value.filter(model =>
      model.id.toLowerCase().includes(lowerQuery) ||
      model.name?.toLowerCase().includes(lowerQuery) ||
      model.description?.toLowerCase().includes(lowerQuery)
    )
  }

  return {
    // State
    availableModelIds,
    modelDataMap,
    modelParameterSupportMap,
    favoriteModelIds,
    selectedModelId,

    // Computed
    availableModels,
    favoriteModels,
    selectedModel,

    // Actions - 模型列表
    setAvailableModels,
    addModel,
    removeModel,

    // Actions - 收藏
    toggleFavorite,
    isFavorite,
    setFavorites,

    // Actions - 选择
    setSelectedModel,

    // Actions - 参数支持
    updateModelParameterSupport,
    getModelParameterSupport,
    setModelParameterSupportMap,

    // Actions - 持久化
    loadFavorites,
    saveFavorites,

    // Queries
    getModelById,
    searchModels
  }
})

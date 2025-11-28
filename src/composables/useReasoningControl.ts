/**
 * useReasoningControl - 推理模式配置 Composable
 * 
 * 职责：
 * - 推理模式开关管理
 * - Effort 挡位配置（low/medium/high）
 * - Visibility 配置（visible/hidden/off）
 * - 模型推理能力检测
 * - 请求参数构建
 */

import { computed, type Ref, type ComputedRef } from 'vue'

/**
 * 推理 Effort 级别
 */
export type ReasoningEffort = 'low' | 'medium' | 'high'

/**
 * 推理可见性配置
 */
export type ReasoningVisibility = 'visible' | 'hidden' | 'off'

/**
 * 推理偏好设置
 */
export interface ReasoningPreference {
  visibility: ReasoningVisibility
  effort: ReasoningEffort
  maxTokens?: number | null
}

/**
 * 默认推理偏好
 */
export const DEFAULT_REASONING_PREFERENCE: Readonly<ReasoningPreference> = Object.freeze({
  visibility: 'visible',
  effort: 'medium',
  maxTokens: null
})

/**
 * 推理模式关键词（用于模型检测）
 */
export const REASONING_KEYWORDS = [
  'o1',
  'o3',
  'o4',
  'reasoning',
  'r1',
  'qwq',
  'think',
  'deepseek',
  'sonnet-thinking',
  'brainstorm',
  'logic'
]

/**
 * Effort 挡位标签映射
 */
export const REASONING_EFFORT_LABEL_MAP: Record<ReasoningEffort, string> = {
  low: '低挡',
  medium: '中挡',
  high: '高挡'
}

/**
 * Effort 挡位短标签映射
 */
export const REASONING_EFFORT_SHORT_LABEL_MAP: Record<ReasoningEffort, string> = {
  low: '低',
  medium: '中',
  high: '高'
}

/**
 * Visibility 标签映射
 */
export const REASONING_VISIBILITY_LABEL_MAP: Record<ReasoningVisibility, string> = {
  visible: '返回推理细节',
  hidden: '仅推理，不返回细节',
  off: '关闭推理'
}

/**
 * Effort 选项列表
 */
export const REASONING_EFFORT_OPTIONS: ReadonlyArray<{ value: ReasoningEffort; label: string }> = [
  { value: 'low', label: REASONING_EFFORT_LABEL_MAP.low },
  { value: 'medium', label: REASONING_EFFORT_LABEL_MAP.medium },
  { value: 'high', label: REASONING_EFFORT_LABEL_MAP.high }
]

/**
 * Visibility 选项列表（不包括 'off'，因为它通过开关控制）
 */
export const REASONING_VISIBILITY_OPTIONS: ReadonlyArray<{ value: ReasoningVisibility; label: string }> = [
  { value: 'visible', label: REASONING_VISIBILITY_LABEL_MAP.visible },
  { value: 'hidden', label: REASONING_VISIBILITY_LABEL_MAP.hidden }
]

export interface ReasoningControlOptions {
  /**
   * 当前对话的推理偏好设置
   */
  reasoningPreference: ComputedRef<ReasoningPreference | null | undefined>
  
  /**
   * 组件是否处于激活状态
   */
  isActive: Ref<boolean>
  
  /**
   * 当前激活的 Provider
   */
  activeProvider: ComputedRef<string>
  
  /**
   * 当前模型 ID
   */
  currentModelId: ComputedRef<string | null | undefined>
  
  /**
   * 模型数据 Map（用于检测推理支持）
   */
  modelDataMap: ComputedRef<Map<string, any> | null>
  
  /**
   * 更新推理偏好的回调函数
   */
  onUpdatePreference: (updates: Partial<ReasoningPreference>) => void
}

export function useReasoningControl(options: ReasoningControlOptions) {
  const {
    reasoningPreference: currentReasoningPreference,
    isActive,
    activeProvider,
    currentModelId,
    modelDataMap,
    onUpdatePreference
  } = options

  // ========== 工具函数 ==========
  
  /**
   * 获取模型记录
   */
  function getModelRecord(modelId: string | null | undefined): any {
    if (!modelId) {
      return null
    }

    const modelMap = modelDataMap.value
    if (!modelMap || typeof modelMap.get !== 'function') {
      return null
    }

    return modelMap.get(modelId) ?? modelMap.get(modelId.toLowerCase()) ?? null
  }

  /**
   * 检测模型是否支持推理功能
   */
  function detectReasoningSupport(modelId: string | null | undefined): boolean {
    if (!modelId) {
      return false
    }

    const lowerId = modelId.toLowerCase()
    const record = getModelRecord(modelId)
    const raw = record?._raw ?? null

    if (raw) {
      // 检查 reasoning 字段
      if (raw.reasoning === true) {
        return true
      }
      
      // 检查 capabilities
      const rawCapabilities = raw.capabilities
      if (rawCapabilities && typeof rawCapabilities === 'object') {
        if (rawCapabilities.reasoning === true || rawCapabilities.reasoning_supported === true) {
          return true
        }
        if (Array.isArray(rawCapabilities) && rawCapabilities.some((item: any) => typeof item === 'string' && item.toLowerCase().includes('reasoning'))) {
          return true
        }
      }
      
      // 检查 tags
      const rawTags = raw.tags || raw.keywords || raw.categories
      if (Array.isArray(rawTags) && rawTags.some((tag: any) => typeof tag === 'string' && tag.toLowerCase().includes('reasoning'))) {
        return true
      }
      
      // 检查 metadata
      if (raw.metadata && typeof raw.metadata === 'object') {
        const metadataTags = raw.metadata.tags || raw.metadata.capabilities
        if (Array.isArray(metadataTags) && metadataTags.some((tag: any) => typeof tag === 'string' && tag.toLowerCase().includes('reasoning'))) {
          return true
        }
        if (raw.metadata.reasoning === true) {
          return true
        }
      }
    }

    // 检查描述
    const description: string = typeof record?.description === 'string' ? record.description.toLowerCase() : ''
    if (description.includes('reasoning') || description.includes('推理')) {
      return true
    }

    // 检查模型 ID 关键词
    return REASONING_KEYWORDS.some((keyword) => keyword && lowerId.includes(keyword))
  }

  // ========== 计算属性 ==========
  
  /**
   * 当前推理偏好（带默认值）
   */
  const reasoningPreference = computed<ReasoningPreference>(() => {
    const pref = currentReasoningPreference.value
    return {
      visibility: pref?.visibility ?? DEFAULT_REASONING_PREFERENCE.visibility,
      effort: pref?.effort ?? DEFAULT_REASONING_PREFERENCE.effort,
      maxTokens: pref?.maxTokens ?? DEFAULT_REASONING_PREFERENCE.maxTokens
    }
  })

  /**
   * 推理功能是否启用
   */
  const isReasoningEnabled = computed(() => {
    return reasoningPreference.value.visibility !== 'off'
  })

  /**
   * 推理控制是否可用
   */
  const isReasoningControlAvailable = computed(() => {
    // 性能优化：非激活状态下跳过检查
    if (!isActive.value) {
      return false
    }

    // 仅 OpenRouter 支持
    if (activeProvider.value !== 'OpenRouter') {
      return false
    }

    const modelId = currentModelId.value
    if (!modelId) {
      return false
    }

    return detectReasoningSupport(modelId)
  })

  /**
   * Effort 挡位标签
   */
  const reasoningEffortLabel = computed(() => {
    return REASONING_EFFORT_LABEL_MAP[reasoningPreference.value.effort]
  })

  /**
   * Effort 挡位短标签
   */
  const reasoningEffortShortLabel = computed(() => {
    return REASONING_EFFORT_SHORT_LABEL_MAP[reasoningPreference.value.effort]
  })

  /**
   * 当前 Visibility 配置
   */
  const reasoningVisibility = computed(() => {
    return reasoningPreference.value.visibility
  })

  /**
   * 推理按钮 Tooltip
   */
  const reasoningButtonTitle = computed(() => {
    if (!isReasoningControlAvailable.value) {
      return '当前模型不支持推理控制（需使用具有推理能力的模型）'
    }
    return isReasoningEnabled.value
      ? `点击关闭推理（当前：${reasoningEffortLabel.value}）`
      : '点击启用推理控制'
  })

  // ========== 方法 ==========
  
  /**
   * 切换推理开关
   */
  function toggleReasoningEnabled() {
    const nextVisibility: ReasoningVisibility = isReasoningEnabled.value ? 'off' : 'visible'
    onUpdatePreference({ visibility: nextVisibility })
  }

  /**
   * 选择 Effort 挡位
   */
  function selectReasoningEffort(effort: ReasoningEffort) {
    if (reasoningPreference.value.effort === effort) {
      return
    }
    
    // 选择挡位时自动启用推理（如果当前是关闭状态）
    if (!isReasoningEnabled.value) {
      onUpdatePreference({ visibility: 'visible', effort })
    } else {
      onUpdatePreference({ effort })
    }
  }

  /**
   * 选择 Visibility 配置
   */
  function selectReasoningVisibility(visibility: ReasoningVisibility) {
    if (visibility === 'off') {
      toggleReasoningEnabled()
      return
    }
    
    if (reasoningPreference.value.visibility === visibility) {
      return
    }
    
    onUpdatePreference({ visibility })
  }

  /**
   * 构建推理请求参数
   */
  function buildReasoningRequestOptions() {
    if (!isReasoningControlAvailable.value || !isReasoningEnabled.value) {
      return null
    }

    const pref = reasoningPreference.value
    const payload: Record<string, any> = {
      enabled: true,
      effort: pref.effort
    }

    if (typeof pref.maxTokens === 'number' && Number.isFinite(pref.maxTokens) && pref.maxTokens > 0) {
      payload.max_tokens = Math.round(pref.maxTokens)
    }
    
    if (pref.visibility === 'hidden') {
      payload.exclude = true
    }

    return {
      payload,
      preference: {
        visibility: pref.visibility,
        effort: pref.effort,
        maxTokens: pref.maxTokens ?? null
      },
      modelId: currentModelId.value
    }
  }

  return {
    // 状态
    reasoningPreference,
    
    // 计算属性
    isReasoningEnabled,
    isReasoningControlAvailable,
    reasoningEffortLabel,
    reasoningEffortShortLabel,
    reasoningVisibility,
    reasoningButtonTitle,
    
    // 方法
    toggleReasoningEnabled,
    selectReasoningEffort,
    selectReasoningVisibility,
    buildReasoningRequestOptions,
    detectReasoningSupport
  }
}

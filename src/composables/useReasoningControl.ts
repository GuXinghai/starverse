/**
 * useReasoningControl - 推理模式配置 Composable
 * 
 * 职责�?
 * - 推理模式开关管�?
 * - Effort 挡位配置（low/medium/high�?
 * - Visibility 配置（visible/hidden/off�?
 * - 模型推理能力检�?
 * - 请求参数构建
 * - 推理挡位和MAX_TOKENS互斥控制
 */

import { computed, type Ref, type ComputedRef } from 'vue'
import type { 
  ReasoningMode,
  ReasoningEffort,
  ReasoningVisibility,
  ReasoningPreference
} from '../types/chat'

/**
 * 默认推理偏好
 */
export const DEFAULT_REASONING_PREFERENCE: Readonly<ReasoningPreference> = Object.freeze({
  visibility: 'visible',
  effort: 'medium',
  maxTokens: null,
  mode: 'medium' // 默认为中档模式
})

/**
 * @deprecated 推理模式关键词已废弃
 * 
 * ⚠️ 规范约束：禁止基于模型 ID 字符串猜测能力
 * 参考 /docs/openrouter-model-sync-spec.md
 * 
 * 保留此常量仅为向后兼容，新代码不应使用
 */
export const REASONING_KEYWORDS: readonly string[] = Object.freeze([])

/**
 * Effort 挡位标签映射
 */
export const REASONING_EFFORT_LABEL_MAP: Record<ReasoningEffort, string> = {
  minimal: '极简挡',
  low: '低挡',
  medium: '中挡',
  high: '高挡'
}

/**
 * Effort 挡位短标签映射
 */
export const REASONING_EFFORT_SHORT_LABEL_MAP: Record<ReasoningEffort, string> = {
  minimal: '极简',
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
 * Mode 标签映射（用于四个互斥选项的UI展示）
 */
export const REASONING_MODE_LABEL_MAP: Record<ReasoningMode, string> = {
  minimal: '极简',
  low: '低',
  medium: '中',
  high: '高',
  custom: '自定义'
}

/**
 * Mode 选项列表（四个互斥选项：低、中、高、自定义�?
 */
export const REASONING_MODE_OPTIONS: ReadonlyArray<{ value: ReasoningMode; label: string }> = [
  { value: 'low', label: REASONING_MODE_LABEL_MAP.low },
  { value: 'medium', label: REASONING_MODE_LABEL_MAP.medium },
  { value: 'high', label: REASONING_MODE_LABEL_MAP.high },
  { value: 'custom', label: REASONING_MODE_LABEL_MAP.custom }
]

/**
 * Effort 选项列表（保留用于兼容性）
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
   * 当前对话的推理偏好设�?
   */
  reasoningPreference: ComputedRef<ReasoningPreference | null | undefined>
  
  /**
   * 组件是否处于激活状�?
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
   * 更新推理偏好的回调函�?
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
   * 兼容 AppModel 和旧格式
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
   * 
   * ⚠️ 规范约束 (参考 /docs/openrouter-model-sync-spec.md)：
   * - 仅依赖 AppModel.capabilities.hasReasoning 来判断
   * - 禁止基于模型 ID 字符串猜测能力
   */
  function detectReasoningSupport(modelId: string | null | undefined): boolean {
    if (!modelId) {
      return false
    }

    const record = getModelRecord(modelId)
    
    // 检查 AppModel.capabilities.hasReasoning
    if (record?.capabilities?.hasReasoning === true) {
      return true
    }
    
    // 向后兼容：检查 supported_parameters
    const supportedParams = record?.supported_parameters
    if (Array.isArray(supportedParams) && supportedParams.includes('reasoning')) {
      return true
    }

    // 不再基于 ID/description/tags 等字符串猜测
    return false
  }

  // ========== 计算属�?==========
  
  /**
   * 当前推理偏好（带默认值）
   */
  const reasoningPreference = computed<ReasoningPreference>(() => {
    const pref = currentReasoningPreference.value
    return {
      visibility: pref?.visibility ?? DEFAULT_REASONING_PREFERENCE.visibility,
      effort: pref?.effort ?? DEFAULT_REASONING_PREFERENCE.effort,
      maxTokens: pref?.maxTokens ?? DEFAULT_REASONING_PREFERENCE.maxTokens,
      mode: pref?.mode ?? DEFAULT_REASONING_PREFERENCE.mode
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
    // 性能优化：非激活状态下跳过检�?
    if (!isActive.value) {
      if (import.meta.env.DEV) {
        console.log('[useReasoningControl] �?Not active')
      }
      return false
    }

    // �?OpenRouter 支持（兼容大小写�?
    const provider = String(activeProvider.value || '').toLowerCase()
    if (provider !== 'openrouter') {
      if (import.meta.env.DEV) {
        console.log('[useReasoningControl] �?Provider not OpenRouter:', activeProvider.value, '(normalized:', provider, ')')
      }
      return false
    }

    const modelId = currentModelId.value
    if (!modelId) {
      if (import.meta.env.DEV) {
        console.log('[useReasoningControl] �?No modelId')
      }
      return false
    }

    const supported = detectReasoningSupport(modelId)
    if (import.meta.env.DEV) {
      const modelRecord = getModelRecord(modelId)
      console.log('[useReasoningControl] 🔍 Model support check:', {
        modelId,
        supported,
        modelDataMapSize: modelDataMap.value?.size || 0,
        modelRecord: modelRecord ? {
          id: modelRecord.id,
          name: modelRecord.name,
          rawId: modelRecord.raw?.id
        } : null
      })
    }
    return supported
  })

  /**
   * Effort 挡位标签
   */
  const reasoningEffortLabel = computed(() => {
    return REASONING_EFFORT_LABEL_MAP[reasoningPreference.value.effort]
  })

  /**
   * Effort 挡位短标�?
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
   * 切换推理开�?
   */
  function toggleReasoningEnabled() {
    const nextVisibility: ReasoningVisibility = isReasoningEnabled.value ? 'off' : 'visible'
    onUpdatePreference({ visibility: nextVisibility })
  }

  /**
   * 选择 Effort 挡位
   * 互斥逻辑：选择挡位时清�?maxTokens，确保只使用挡位配置
   */
  function selectReasoningEffort(effort: ReasoningEffort) {
    if (reasoningPreference.value.effort === effort && reasoningPreference.value.mode === effort) {
      return
    }
    
    // 选择挡位时自动启用推理（如果当前是关闭状态）
    if (!isReasoningEnabled.value) {
      onUpdatePreference({ 
        visibility: 'visible', 
        effort,
        maxTokens: null, // 清除 maxTokens
        mode: effort // 设置 mode 为对应的挡位
      })
    } else {
      onUpdatePreference({ 
        effort,
        maxTokens: null, // 清除 maxTokens
        mode: effort // 设置 mode 为对应的挡位
      })
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
   * 更新 Max Tokens 配置
   * 互斥逻辑：设�?maxTokens 时切换到 custom 模式
   * @param tokens - Token 数量，null 表示使用默认�?
   */
  function updateMaxTokens(tokens: number | null) {
    // 验证输入
    if (tokens !== null) {
      if (!Number.isFinite(tokens) || tokens < 0) {
        console.warn('Invalid maxTokens value:', tokens)
        return
      }
      // 四舍五入到整�?
      tokens = Math.round(tokens)
      // 设置合理的上限（100k tokens�?
      if (tokens > 100000) {
        tokens = 100000
      }
    }
    
    // 如果设置了有效的 maxTokens，切换到 custom 模式
    if (tokens !== null && tokens > 0) {
      onUpdatePreference({ 
        maxTokens: tokens,
        mode: 'custom' // 切换到自定义模式
      })
    } else {
      // 如果清除 maxTokens，恢复到当前�?effort 模式
      const currentEffort = reasoningPreference.value.effort
      onUpdatePreference({ 
        maxTokens: null,
        mode: currentEffort // 恢复到当前挡位模�?
      })
    }
  }

  /**
   * 构建推理请求参数
   * 根据当前模式决定如何设置 effort �?max_tokens
   */
  function buildReasoningRequestOptions() {
    if (!isReasoningControlAvailable.value || !isReasoningEnabled.value) {
      return null
    }

    const pref = reasoningPreference.value
    const payload: Record<string, any> = {
      enabled: true
    }

    // 根据模式设置参数
    if (pref.mode === 'custom') {
      // 自定义模式：只设�?max_tokens，不设置 effort
      if (typeof pref.maxTokens === 'number' && Number.isFinite(pref.maxTokens) && pref.maxTokens > 0) {
        payload.max_tokens = Math.round(pref.maxTokens)
      }
    } else {
      // 挡位模式：设�?effort，不设置 max_tokens
      payload.effort = pref.effort
    }
    
    if (pref.visibility === 'hidden') {
      payload.exclude = true
    }

    return {
      payload,
      preference: {
        visibility: pref.visibility,
        effort: pref.effort,
        maxTokens: pref.maxTokens ?? null,
        mode: pref.mode
      },
      modelId: currentModelId.value
    }
  }

  /**
   * 选择推理模式（四个互斥选项�?
   * @param mode - 'minimal' | 'low' | 'medium' | 'high' | 'custom'
   */
  function selectReasoningMode(mode: ReasoningMode) {
    if (reasoningPreference.value.mode === mode) {
      return
    }

    if (mode === 'custom') {
      // 切换到自定义模式，保持当�?maxTokens（如果有的话�?
      onUpdatePreference({ 
        mode: 'custom'
        // maxTokens 保持不变，如果为 null 用户后续可以输入
      })
    } else {
      // 切换到挡位模式（minimal/low/medium/high�?
      onUpdatePreference({ 
        effort: mode as ReasoningEffort, // �?mode 作为 effort 值（此时 mode 不是 'custom'�?
        maxTokens: null, // 清除 maxTokens
        mode: mode // 设置 mode
      })
    }

    // 自动启用推理（如果当前是关闭状态）
    if (!isReasoningEnabled.value) {
      onUpdatePreference({ visibility: 'visible' })
    }
  }

  /**
   * 当前 Max Tokens 配置
   */
  const maxTokens = computed(() => reasoningPreference.value.maxTokens)
  
  /**
   * 当前推理模式
   */
  const currentMode = computed(() => reasoningPreference.value.mode ?? 'medium')

  return {
    // 状�?
    reasoningPreference,
    
    // 计算属�?
    isReasoningEnabled,
    isReasoningControlAvailable,
    reasoningEffortLabel,
    reasoningEffortShortLabel,
    reasoningVisibility,
    reasoningButtonTitle,
    maxTokens,
    currentMode,
    
    // 方法
    toggleReasoningEnabled,
    selectReasoningEffort,
    selectReasoningMode, // 新增：模式选择
    selectReasoningVisibility,
    updateMaxTokens,
    buildReasoningRequestOptions,
    detectReasoningSupport
  }
}

/**
 * useGenerationConfig - 统一生成配置 Composable
 * 
 * 职责：
 * - 桥接现有 UI 组件到统一 GenerationConfig 架构
 * - 整合 reasoning、sampling、length 配置
 * - 提供向后兼容的接口
 * - 支持 4 层配置优先级（Global < Model < Conversation < Request）
 * 
 * 🎯 Phase 2 Integration Strategy:
 * - 渐进式增强：保持现有 composables 工作，添加统一层
 * - 向后兼容：现有代码无需修改即可工作
 * - 可选启用：通过 useUnified 标志控制是否使用统一架构
 */

import { computed, type ComputedRef } from 'vue'
import type {
  GenerationConfig,
  SamplingConfig,
  ModelGenerationCapability
} from '../types/generation'
import type {
  ReasoningResolvedConfig
} from '../types/reasoning'
import type { ReasoningPreference } from '../types/chat'

export interface GenerationConfigOptions {
  /**
   * 当前对话 ID
   */
  conversationId: string

  /**
   * 当前模型 ID
   */
  modelId: ComputedRef<string | null>

  /**
   * 模型能力对象（从 modelStore 获取）
   */
  modelCapability: ComputedRef<ModelGenerationCapability | null>

  /**
   * 推理偏好（来自对话级配置）
   */
  reasoningPreference: ComputedRef<ReasoningPreference>

  /**
   * 采样参数（来自对话级配置）
   */
  samplingParameters: ComputedRef<Partial<SamplingConfig>>

  /**
   * 是否启用统一架构（默认 false，保持向后兼容）
   */
  useUnified?: boolean
}

/**
 * 统一生成配置 Composable
 * 
 * @param options - 配置选项
 * @returns 统一配置构建器和状态
 */
export function useGenerationConfig(options: GenerationConfigOptions) {
  const {
    conversationId,
    modelId,
    modelCapability,
    reasoningPreference,
    samplingParameters,
    useUnified = false
  } = options

  // ========== 计算属性：构建统一 GenerationConfig ==========

  /**
   * 对话级采样配置
   */
  const samplingConfig = computed<SamplingConfig>(() => {
    const params = samplingParameters.value
    return {
      temperature: params.temperature ?? undefined,
      top_p: params.top_p ?? undefined,
      top_k: params.top_k ?? undefined,
      frequency_penalty: params.frequency_penalty ?? undefined,
      presence_penalty: params.presence_penalty ?? undefined,
      repetition_penalty: params.repetition_penalty ?? undefined,
      min_p: params.min_p ?? undefined,
      top_a: params.top_a ?? undefined,
      seed: params.seed ?? undefined
    }
  })

  /**
   * 对话级推理配置（已解析，无 'auto'）
   */
  const reasoningConfig = computed<ReasoningResolvedConfig | undefined>(() => {
    const pref = reasoningPreference.value
    
    // 推理已禁用
    if (pref.visibility === 'off') {
      return {
        controlMode: 'disabled',
        effort: pref.effort || 'medium',
        maxReasoningTokens: undefined,
        showReasoningContent: true
      }
    }

    // 使用 effort 模式
    if (pref.mode !== 'custom' && pref.effort) {
      return {
        controlMode: 'effort',
        effort: pref.effort,
        maxReasoningTokens: undefined,
        showReasoningContent: pref.visibility === 'visible'
      }
    }

    // 使用 max_tokens 模式
    if (pref.mode === 'custom' && typeof pref.maxTokens === 'number' && pref.maxTokens > 0) {
      return {
        controlMode: 'max_tokens',
        effort: 'medium',
        maxReasoningTokens: pref.maxTokens,
        showReasoningContent: pref.visibility === 'visible'
      }
    }

    // 默认：medium effort
    return {
      controlMode: 'effort',
      effort: 'medium',
      maxReasoningTokens: undefined,
      showReasoningContent: pref.visibility === 'visible'
    }
  })

  /**
   * 统一生成配置（对话级）
   */
  const generationConfig = computed<GenerationConfig>(() => {
    return {
      sampling: samplingConfig.value,
      length: {},  // 暂时为空，未来可添加 max_tokens 配置
      reasoning: reasoningConfig.value
    }
  })

  // ========== 方法：构建请求选项 ==========

  /**
   * 构建统一请求选项（用于传递给 OpenRouterService）
   * 
   * 🎯 Phase 2: 如果 useUnified=true，返回统一配置对象
   * 否则返回 null，让现有代码继续使用分散的 reasoning/parameters 选项
   * 
   * @returns GenerationConfig 或 null
   */
  function buildUnifiedRequestOptions(): GenerationConfig | null {
    if (!useUnified) {
      return null
    }

    return generationConfig.value
  }

  /**
   * 检查是否可以使用统一架构
   * 
   * 要求：
   * 1. useUnified 标志为 true
   * 2. 模型能力对象可用
   */
  const canUseUnified = computed(() => {
    return useUnified && modelCapability.value !== null
  })

  // ========== 调试信息 ==========

  if (import.meta.env.DEV && useUnified) {
    console.log('[useGenerationConfig] 初始化（统一模式）:', {
      conversationId,
      modelId: modelId.value,
      hasCapability: !!modelCapability.value,
      config: generationConfig.value
    })
  }

  return {
    // 状态
    generationConfig,
    samplingConfig,
    reasoningConfig,
    canUseUnified,

    // 方法
    buildUnifiedRequestOptions
  }
}

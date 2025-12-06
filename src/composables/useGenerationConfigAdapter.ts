import type {
  ReasoningResolvedConfig,
  ReasoningEffort
} from '../types/reasoning'
/**
 * useGenerationConfigAdapter - 统一配置适配器
 * 
 * 职责：
 * - 桥接现有 UI 组件（ChatToolbar、SamplingControls 等）到统一 GenerationConfig 架构
 * - 提供双向绑定：UI ↔ GenerationUserConfig
 * - 处理模型能力检查与参数过滤
 * - 支持 Basic/Advanced 模式切换
 * 
 * Phase 3 Integration Point:
 * - 所有 UI 组件通过此 composable 统一读写配置
 * - 自动应用 ModelGenerationCapability 约束
 * - 提供 dry-run 预览功能
 */

import { computed, type Ref, type ComputedRef } from 'vue'
import { getSamplingSupport, getReasoningSupport } from '../services/capabilityRegistry'
import { toSamplingConfig } from '../types/compat/generation-legacy'
import { validateGenerationConfig } from '../utils/generationValidation'
import type {
  GenerationConfig,
  SamplingConfig,
  ModelGenerationCapability,
  PartialGenerationConfig
} from '../types/generation'
import type { ReasoningPreference, SamplingParameterSettings } from '../types/chat'

// ============================================================================
// 接口定义
// ============================================================================

/**
 * 配置模式
 * - basic: 基础模式（使用预设档位）
 * - advanced: 高级模式（显示所有参数）
 */
export type ConfigurationMode = 'basic' | 'advanced'

/**
 * 基础预设档位
 */
export type BasicPreset = 'precise' | 'balanced' | 'creative' | 'code'

/**
 * 预设配置映射
 */
export interface PresetMapping {
  temperature: number
  top_p: number
  description: string
}

/**
 * Adapter 选项
 */
export interface GenerationConfigAdapterOptions {
  /**
   * 当前模型 ID
   */
  modelId: ComputedRef<string | null>

  /**
   * 模型能力对象
   */
  modelCapability: ComputedRef<ModelGenerationCapability | null>

  /**
   * 推理偏好（来自对话配置）
   */
  reasoningPreference: Ref<ReasoningPreference>

  /**
   * 采样参数（来自对话配置）
   */
  samplingParameters: Ref<SamplingParameterSettings | undefined>

  /**
   * 配置模式（basic/advanced）
   */
  configMode?: Ref<ConfigurationMode>

  /**
   * 更新回调
   */
  onUpdate?: (config: PartialGenerationConfig) => void
}

/**
 * Dry-run 检查结果
 */
export interface DryRunResult {
  /**
   * 将要发送的参数
   */
  willSend: Record<string, any>

  /**
   * 被忽略的参数（不支持）
   */
  willIgnore: Record<string, any>

  /**
   * 被裁剪的参数（值超出范围）
   */
  willClip: Array<{
    param: string
    original: any
    clipped: any
    reason: string
  }>

  /**
   * 警告信息
   */
  warnings: string[]
}

// ============================================================================
// 预设配置
// ============================================================================

/**
 * 基础模式预设映射
 */
const BASIC_PRESETS: Record<BasicPreset, PresetMapping> = {
  precise: {
    temperature: 0.3,
    top_p: 0.9,
    description: '精确模式 - 更确定性的输出，适合事实性任务'
  },
  balanced: {
    temperature: 0.7,
    top_p: 0.95,
    description: '平衡模式 - 兼顾创造性和一致性'
  },
  creative: {
    temperature: 1.0,
    top_p: 1.0,
    description: '创意模式 - 更多样化的输出，适合创作任务'
  },
  code: {
    temperature: 0.2,
    top_p: 0.9,
    description: '代码模式 - 极低温度，适合代码生成和技术任务'
  }
}

// ============================================================================
// Composable 实现
// ============================================================================

/**
 * 统一配置适配器 Composable
 */
export function useGenerationConfigAdapter(options: GenerationConfigAdapterOptions) {
  const {
    modelId,
    modelCapability,
    reasoningPreference,
    samplingParameters,
    configMode,
    onUpdate
  } = options

  // ========== 模型能力计算属性 ==========

  /**
   * 当前模型支持的采样参数
   */
  const supportedSamplingParams = computed(() => {
    return getSamplingSupport(modelId.value)
  })

  /**
   * 推理能力
   */
  const reasoningCapability = computed(() => getReasoningSupport(modelId.value))

  // ========== 配置转换：UI → GenerationConfig ==========

  /**
   * 转换推理偏好到统一 ReasoningUserConfig
   */
  const convertReasoningConfig = computed<ReasoningResolvedConfig | undefined>(() => {
    const pref = reasoningPreference.value
    const cap = reasoningCapability.value

    // 模型不支持推理
    if (!cap?.supportsReasoning) {
      return undefined
    }

    // 推理已禁用
    if (pref.visibility === 'off') {
      return {
        controlMode: 'disabled',
        maxReasoningTokens: undefined,
        maxCompletionTokens: undefined,
        showReasoningContent: false
      }
    }

    // 使用 effort 模式
    if (pref.mode !== 'custom' && pref.effort) {
      return {
        controlMode: 'effort',
        effort: pref.effort as ReasoningEffort,
          maxReasoningTokens: undefined,
          maxCompletionTokens: undefined,
        showReasoningContent: pref.visibility === 'visible'
      }
    }

    // 使用 max_tokens 模式
    if (pref.mode === 'custom' && typeof pref.maxTokens === 'number' && pref.maxTokens > 0) {
      return {
        controlMode: 'max_tokens',
        effort: 'medium', // fallback
        maxReasoningTokens: pref.maxTokens,
          maxCompletionTokens: undefined,
        showReasoningContent: pref.visibility === 'visible'
      }
    }

    // 默认：medium effort
    return {
      controlMode: 'effort',
      effort: 'medium',
        maxReasoningTokens: undefined,
        maxCompletionTokens: undefined,
      showReasoningContent: pref.visibility === 'visible'
    }
  })

  /**
   * 转换采样参数到统一 SamplingConfig
   */
  const convertSamplingConfig = computed<SamplingConfig>(() => {
    const config = toSamplingConfig(samplingParameters.value)
    // 过滤不支持的键
    const supported = supportedSamplingParams.value
    const filtered: SamplingConfig = {}
    for (const [k, v] of Object.entries(config)) {
      if (v !== undefined && supported.has(k)) {
        // @ts-expect-error index signature via loop
        filtered[k] = v
      }
    }
    return filtered
  })

  /**
   * 统一生成配置
   */
  const unifiedConfig = computed<GenerationConfig>(() => {
    const cfg: GenerationConfig = {
      sampling: convertSamplingConfig.value,
      length: {},
      reasoning: convertReasoningConfig.value || undefined,
    }
    const v = validateGenerationConfig(cfg)
    if (!v.valid && import.meta.env.DEV) {
      console.warn('[GenerationConfig] validation errors:', v.errors)
    }
    return cfg
  })

  // ========== 配置转换：GenerationConfig → UI ==========

  /**
   * 从统一配置更新 UI 状态
   */
  function applyUnifiedConfig(config: PartialGenerationConfig) {
    // 更新采样参数
    if (config.sampling) {
      const updates: Partial<SamplingParameterSettings> = {}
      
      if (config.sampling.temperature !== undefined) {
        updates.temperature = config.sampling.temperature
      }
      if (config.sampling.top_p !== undefined) {
        updates.top_p = config.sampling.top_p
      }
      if (config.sampling.top_k !== undefined) {
        updates.top_k = config.sampling.top_k
      }
      // ... 其他参数类似

      if (Object.keys(updates).length > 0 && samplingParameters.value) {
        Object.assign(samplingParameters.value, updates)
      }
    }

    // 更新推理配置
    if (config.reasoning) {
      const updates: Partial<ReasoningPreference> = {}

      if (config.reasoning.controlMode === 'disabled') {
        updates.visibility = 'off'
      } else if (config.reasoning.controlMode === 'effort' && config.reasoning.effort) {
        // 映射 ReasoningEffort ('minimal' | 'low' | 'medium' | 'high') 到 ReasoningMode
        const effortToMode: Record<string, 'low' | 'medium' | 'high'> = {
          'minimal': 'low',
          'low': 'low',
          'medium': 'medium',
          'high': 'high',
          'none': 'medium' // fallback
        }
        updates.mode = effortToMode[config.reasoning.effort] || 'medium'
        updates.effort = effortToMode[config.reasoning.effort] || 'medium'
        updates.visibility = config.reasoning.showReasoningContent ? 'visible' : 'hidden'
      } else if (config.reasoning.controlMode === 'max_tokens' && config.reasoning.maxReasoningTokens) {
        updates.mode = 'custom'
        updates.maxTokens = config.reasoning.maxReasoningTokens
        updates.visibility = config.reasoning.showReasoningContent ? 'visible' : 'hidden'
      }

      if (Object.keys(updates).length > 0) {
        Object.assign(reasoningPreference.value, updates)
      }
    }

    // 触发更新回调
    onUpdate?.(config)
  }

  // ========== 预设系统 ==========

  /**
   * 应用基础预设
   */
  function applyBasicPreset(preset: BasicPreset) {
    const presetConfig = BASIC_PRESETS[preset]
    
    applyUnifiedConfig({
      sampling: {
        temperature: presetConfig.temperature,
        top_p: presetConfig.top_p
      }
    })
  }

  /**
   * 获取预设配置信息
   */
  function getPresetInfo(preset: BasicPreset): PresetMapping {
    return BASIC_PRESETS[preset]
  }

  /**
   * 检测当前配置是否匹配某个预设
   */
  const currentPreset = computed<BasicPreset | null>(() => {
    const current = convertSamplingConfig.value
    
    for (const [preset, config] of Object.entries(BASIC_PRESETS)) {
      if (
        Math.abs((current.temperature || 1.0) - config.temperature) < 0.01 &&
        Math.abs((current.top_p || 1.0) - config.top_p) < 0.01
      ) {
        return preset as BasicPreset
      }
    }
    
    return null
  })

  // ========== Dry-run 检查器 ==========

  /**
   * 执行 dry-run 检查
   */
  function performDryRun(): DryRunResult {
    const config = unifiedConfig.value
    const cap = modelCapability.value
    
    const result: DryRunResult = {
      willSend: {},
      willIgnore: {},
      willClip: [],
      warnings: []
    }

    if (!cap) {
      result.warnings.push('模型能力信息不可用，无法执行检查')
      return result
    }

    // 检查采样参数
    if (config.sampling) {
      for (const [key, value] of Object.entries(config.sampling)) {
        if (value === undefined || value === null) continue

        const supported = supportedSamplingParams.value.has(key)
        
        if (supported) {
          result.willSend[key] = value
          
          // 检查范围
          const clipped = validateAndClipParameter(key, value)
          if (clipped !== value) {
            result.willClip.push({
              param: key,
              original: value,
              clipped,
              reason: `值超出范围，将被裁剪到 ${clipped}`
            })
          }
        } else {
          result.willIgnore[key] = value
          result.warnings.push(`参数 ${key} 不被当前模型支持，将被忽略`)
        }
      }
    }

    // 检查推理配置
    if (config.reasoning && reasoningCapability.value?.supportsReasoning) {
      const rc = config.reasoning
      
      if (rc.controlMode === 'effort' && rc.effort) {
        if (reasoningCapability.value.supportsEffort) {
          result.willSend['reasoning.effort'] = rc.effort
        } else {
          result.willIgnore['reasoning.effort'] = rc.effort
          result.warnings.push('当前模型不支持 effort 参数，将转换为 max_tokens')
        }
      }
      
      if (rc.controlMode === 'max_tokens' && rc.maxReasoningTokens) {
        if (reasoningCapability.value.supportsMaxTokens) {
          result.willSend['reasoning.max_tokens'] = rc.maxReasoningTokens
        } else {
          result.willIgnore['reasoning.max_tokens'] = rc.maxReasoningTokens
          result.warnings.push('当前模型不支持 max_tokens，将转换为 effort')
        }
      }

      if (!rc.showReasoningContent) {
        result.willSend['reasoning.exclude'] = true
      }

      if (!reasoningCapability.value.returnsVisible) {
        result.warnings.push('⚠️ 当前模型不保证返回可见的推理内容')
      }
    }

    return result
  }

  /**
   * 验证并裁剪参数值到有效范围
   */
  function validateAndClipParameter(key: string, value: any): any {
    switch (key) {
      case 'temperature':
        return Math.max(0, Math.min(2, value))
      case 'top_p':
      case 'min_p':
      case 'top_a':
        return Math.max(0, Math.min(1, value))
      case 'frequency_penalty':
      case 'presence_penalty':
        return Math.max(-2, Math.min(2, value))
      case 'repetition_penalty':
        return Math.max(0, Math.min(2, value))
      case 'top_k':
        return Math.max(0, Math.floor(value))
      default:
        return value
    }
  }

  // ========== 参数可见性控制 ==========

  /**
   * 检查参数是否应该在 UI 中显示
   */
  function shouldShowParameter(paramName: string): boolean {
    const mode = configMode?.value || 'basic'
    
    // Advanced 模式显示所有参数
    if (mode === 'advanced') {
      return true
    }
    
    // Basic 模式只显示核心参数
    const basicParams = new Set(['temperature', 'top_p'])
    return basicParams.has(paramName)
  }

  /**
   * 检查参数是否可编辑
   */
  function isParameterEnabled(paramName: string): boolean {
    return supportedSamplingParams.value.has(paramName)
  }

  // ========== 调试信息 ==========

  if (import.meta.env.DEV) {
    console.log('[useGenerationConfigAdapter] 初始化:', {
      modelId: modelId.value,
      hasCapability: !!modelCapability.value,
      supportedParams: Array.from(supportedSamplingParams.value),
      reasoningSupport: reasoningCapability.value
    })
  }

  return {
    // 状态
    unifiedConfig,
    supportedSamplingParams,
    reasoningCapability,
    currentPreset,

    // 预设系统
    applyBasicPreset,
    getPresetInfo,

    // 配置转换
    applyUnifiedConfig,
    convertSamplingConfig,
    convertReasoningConfig,

    // Dry-run 检查
    performDryRun,

    // 可见性控制
    shouldShowParameter,
    isParameterEnabled
  }
}

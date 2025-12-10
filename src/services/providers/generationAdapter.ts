/**
 * generationAdapter.ts - OpenRouter Generation 统一适配层
 * 
 * 职责：
 * - 将 GenerationConfig 映射到 OpenRouter 请求体
 * - 整合 applySamplingConfig + applyLengthConfig + buildReasoningPayload
 * - 严格遵守 OpenRouter 文档与模型能力约束
 * - 提供清晰的警告信息供 UI 展示
 * 
 * 设计原则：
 * - 单一入口：buildOpenRouterRequest() 统一调用
 * - 模块化：三个子适配器各司其职
 * - 安全性：不支持的参数自动过滤 + 警告
 * - 可追溯：所有自动调整都生成警告日志
 * 
 * 参考文档：
 * - https://openrouter.ai/docs/api/reference/parameters
 * - https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
 */

import type {
  GenerationConfig,
  SamplingConfig,
  LengthConfig,
  ModelGenerationCapability,
  GenerationAdapterOutput,
  GenerationAdapterWarning,
} from '../../types/generation'
import type {
  ReasoningResolvedConfig,
  ReasoningPayload,
  StarverseReasoningStrategy,
} from '../../types/reasoning'
import { buildReasoningPayload } from './openrouterReasoningAdapter'
import { DEFAULT_STARVERSE_STRATEGY } from '../../types/reasoning'

// ============================================================================
// SECTION 1: Main Entry Point (主入口)
// ============================================================================

/**
 * 构建 OpenRouter 请求体
 * 
 * 这是统一适配层的唯一入口，整合了所有子系统
 * 
 * @param options - 适配器输入
 * @returns OpenRouter 请求体片段 + 警告信息
 * 
 * @example
 * ```typescript
 * const result = buildOpenRouterRequest({
 *   modelId: 'openai/gpt-4o',
 *   capability: modelCapabilityMap.get('openai/gpt-4o'),
 *   effectiveConfig: mergedConfig,
 *   messages: [...],
 * })
 * 
 * const requestBody = {
 *   model: 'openai/gpt-4o',
 *   messages: result.requestBodyFragment.messages,
 *   ...result.requestBodyFragment,
 * }
 * ```
 */
export function buildOpenRouterRequest(options: {
  modelId: string
  capability: ModelGenerationCapability
  effectiveConfig: GenerationConfig
  messages: any[]
  strategy?: StarverseReasoningStrategy
}): GenerationAdapterOutput {
  const { modelId, capability, effectiveConfig, strategy = DEFAULT_STARVERSE_STRATEGY } = options
  // Note: messages 参数预留供未来使用（如自动估算 prompt length）

  const requestBodyFragment: Record<string, any> = {}
  const warnings: GenerationAdapterWarning[] = []
  const ignoredParameters: Array<{ key: string; reason: string }> = []

  console.log(`[GenerationAdapter] Building request for ${modelId}`)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 子适配器调用顺序：Sampling → Reasoning → Length
  // 
  // 为什么是这个顺序？
  // 1. Sampling 最独立，不依赖其他
  // 2. Reasoning 需要先确定 reasoning.max_tokens（影响 max_tokens）
  // 3. Length 最后，因为需要考虑 reasoning 预算
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 1. 应用采样配置
  if (effectiveConfig.sampling) {
    applySamplingConfig(
      requestBodyFragment,
      capability,
      effectiveConfig.sampling,
      warnings,
      ignoredParameters,
    )
  }

  // 2. 应用推理配置（会设置 reasoning 对象 + 可能影响 max_tokens）
  let reasoningPayload: ReasoningPayload | null = null
  if (effectiveConfig.reasoning) {
    const resolvedReasoning = resolveReasoningConfig(effectiveConfig.reasoning)
    const reasoningResult = buildReasoningPayload(
      capability.reasoning,
      resolvedReasoning,
      strategy,
    )

    // 合并 reasoning 结果到请求体
    if (reasoningResult.payload.reasoning) {
      requestBodyFragment.reasoning = reasoningResult.payload.reasoning
    }
    if (reasoningResult.payload.include_reasoning !== undefined) {
      requestBodyFragment.include_reasoning = reasoningResult.payload.include_reasoning
    }

    reasoningPayload = reasoningResult.payload
    warnings.push(...reasoningResult.warnings)
  }

  // 3. 应用长度配置（需考虑 reasoning 预算）
  if (effectiveConfig.length || reasoningPayload) {
    applyLengthConfig(
      requestBodyFragment,
      capability,
      effectiveConfig.length || {},
      reasoningPayload,
      warnings,
      ignoredParameters,
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 生成详细的参数适配摘要
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const acceptedParams = Object.keys(requestBodyFragment)
  const ignoredParamKeys = ignoredParameters.map(p => p.key)
  const capabilitySummary = buildCapabilitySummary(capability)
  
  console.log(`[GenerationAdapter] ✓ 请求已构建，模型: ${modelId}`)
  console.log(`[GenerationAdapter]   • 已接受参数 (${acceptedParams.length}): ${acceptedParams.join(', ') || '无'}`)
  
  if (ignoredParameters.length > 0) {
    console.log(`[GenerationAdapter]   • 已忽略参数 (${ignoredParameters.length}): ${ignoredParamKeys.join(', ')}`)
    console.log(`[GenerationAdapter]   ℹ 原因: 模型不支持这些参数（这是正常的适配行为）`)
    console.log(`[GenerationAdapter]   📋 模型支持情况:`, capabilitySummary)
  }
  
  if (warnings.length > 0) {
    console.log(`[GenerationAdapter]   ⚠ ${warnings.length} 个配置提示:`, warnings.map(w => w.message))
  }

  return {
    requestBodyFragment,
    warnings,
    ignoredParameters,
  }
}

// ============================================================================
// SECTION 2: Sub-Adapter 1 - Sampling (采样参数)
// ============================================================================

/**
 * 应用采样配置到请求体
 * 
 * 规则：
 * - 只设置模型支持的参数
 * - 未支持的参数记录到 ignoredParameters
 * - 冲突参数（如同时设置 temperature 和多个 top_* ）发出警告
 * 
 * @param requestBody - 请求体对象（会被修改）
 * @param capability - 模型能力表
 * @param samplingConfig - 采样配置
 * @param warnings - 警告数组（会被追加）
 * @param ignoredParameters - 忽略参数数组（会被追加）
 */
function applySamplingConfig(
  requestBody: Record<string, any>,
  capability: ModelGenerationCapability,
  samplingConfig: SamplingConfig,
  warnings: GenerationAdapterWarning[],
  ignoredParameters: Array<{ key: string; reason: string }>,
): void {
  const samplingCap = capability.sampling

  // 遍历所有采样参数
  for (const [key, value] of Object.entries(samplingConfig)) {
    if (value === undefined || value === null) continue

    // 检查模型是否支持此参数
    const supported = samplingCap[key as keyof typeof samplingCap]
    if (!supported) {
      ignoredParameters.push({
        key,
        reason: `不支持 (模型能力表未启用)`,
      })
      continue
    }

    // 类型校验与范围检查
    if (typeof value === 'number' && !Number.isFinite(value)) {
      warnings.push({
        type: 'ignored',
        message: `参数 ${key} 的值 ${value} 非法（NaN/Infinity），已忽略`,
      })
      continue
    }

    // 特定参数的范围校验
    if (key === 'temperature' && (value < 0 || value > 2)) {
      warnings.push({
        type: 'clipped',
        message: `temperature ${value} 超出范围 [0, 2]，已裁剪`,
        details: { original: value, clipped: clamp(value, 0, 2) },
      })
      requestBody.temperature = clamp(value, 0, 2)
      continue
    }

    if ((key === 'top_p' || key === 'min_p' || key === 'top_a') && (value < 0 || value > 1)) {
      warnings.push({
        type: 'clipped',
        message: `${key} ${value} 超出范围 [0, 1]，已裁剪`,
        details: { original: value, clipped: clamp(value, 0, 1) },
      })
      requestBody[key] = clamp(value, 0, 1)
      continue
    }

    if ((key === 'frequency_penalty' || key === 'presence_penalty') && (value < -2 || value > 2)) {
      warnings.push({
        type: 'clipped',
        message: `${key} ${value} 超出范围 [-2, 2]，已裁剪`,
        details: { original: value, clipped: clamp(value, -2, 2) },
      })
      requestBody[key] = clamp(value, -2, 2)
      continue
    }

    if (key === 'repetition_penalty' && (value < 0 || value > 2)) {
      warnings.push({
        type: 'clipped',
        message: `repetition_penalty ${value} 超出范围 [0, 2]，已裁剪`,
        details: { original: value, clipped: clamp(value, 0, 2) },
      })
      requestBody.repetition_penalty = clamp(value, 0, 2)
      continue
    }

    // 通过校验，设置参数
    requestBody[key] = value
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Starverse 策略：冲突检测（可选）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 如果同时设置了多个采样控制参数，发出提示（不阻止）
  const samplingKeys = ['temperature', 'top_p', 'top_k', 'min_p', 'top_a']
  const activeSamplingParams = samplingKeys.filter((k) => requestBody[k] !== undefined)
  if (activeSamplingParams.length > 2) {
    warnings.push({
      type: 'fallback',
      message: `同时设置了多个采样参数 (${activeSamplingParams.join(', ')})，可能影响预期效果`,
      details: { active: activeSamplingParams },
    })
  }
}

// ============================================================================
// SECTION 3: Sub-Adapter 2 - Length (长度控制)
// ============================================================================

/**
 * 应用长度配置到请求体
 * 
 * 规则：
 * - max_tokens 需考虑 reasoning 预算（Anthropic 特殊处理）
 * - stop 序列直接转发（如果模型支持）
 * - verbosity 直接转发（如果模型支持）
 * 
 * @param requestBody - 请求体对象（会被修改）
 * @param capability - 模型能力表
 * @param lengthConfig - 长度配置
 * @param reasoningPayload - 推理 payload（如果有）
 * @param reasoningCapability - 推理能力
 * @param warnings - 警告数组
 * @param ignoredParameters - 忽略参数数组
 */
function applyLengthConfig(
  requestBody: Record<string, any>,
  capability: ModelGenerationCapability,
  lengthConfig: LengthConfig,
  reasoningPayload: ReasoningPayload | null,
  warnings: GenerationAdapterWarning[],
  ignoredParameters: Array<{ key: string; reason: string }>,
): void {
  const lengthCap = capability.length

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // max_tokens 处理（复杂逻辑）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 优先级：
  // 1. 推理 payload 已设置 max_tokens → 使用它
  // 2. 用户配置 lengthConfig.max_tokens → 使用它
  // 3. 模型默认上限 → 不设置（让 OpenRouter 决定）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 如果 reasoning payload 已经设置了 max_tokens，使用它
  if (reasoningPayload?.max_tokens !== undefined) {
    if (!lengthCap.max_tokens) {
      ignoredParameters.push({
        key: 'max_tokens',
        reason: '不支持 (模型能力表未启用)',
      })
    } else {
      requestBody.max_tokens = reasoningPayload.max_tokens
      console.log(`[LengthAdapter] Using max_tokens from reasoning payload: ${reasoningPayload.max_tokens}`)
    }
  }
  // 否则使用用户配置
  else if (lengthConfig.max_tokens !== undefined) {
    if (!lengthCap.max_tokens) {
      ignoredParameters.push({
        key: 'max_tokens',
        reason: '不支持 (模型能力表未启用)',
      })
    } else {
      let value = lengthConfig.max_tokens

      // 裁剪到模型上限
      if (lengthCap.maxCompletionTokens != null && value > lengthCap.maxCompletionTokens) {
        warnings.push({
          type: 'clipped',
          message: `max_tokens ${value} 超出模型上限 ${lengthCap.maxCompletionTokens}，已裁剪`,
          details: { original: value, clipped: lengthCap.maxCompletionTokens },
        })
        value = lengthCap.maxCompletionTokens
      }

      requestBody.max_tokens = value
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // stop 序列处理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (lengthConfig.stop !== undefined) {
    if (!lengthCap.stop) {
      ignoredParameters.push({
        key: 'stop',
        reason: '不支持 (模型能力表未启用)',
      })
    } else if (Array.isArray(lengthConfig.stop) && lengthConfig.stop.length > 0) {
      requestBody.stop = lengthConfig.stop
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // verbosity 处理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (lengthConfig.verbosity !== undefined) {
    if (!lengthCap.verbosity) {
      ignoredParameters.push({
        key: 'verbosity',
        reason: '不支持 (模型能力表未启用)',
      })
    } else {
      requestBody.verbosity = lengthConfig.verbosity
    }
  }
}

// ============================================================================
// SECTION 4: Reasoning Config Resolver (推理配置化解)
// ============================================================================

/**
 * 将 ReasoningConfig 化解为 ReasoningResolvedConfig
 * 
 * 规则：
 * - 'auto' 模式根据用户设置自动决定 effort 或 max_tokens
 * - 'disabled' 映射为 effort='none'
 * 
 * @param config - 用户推理配置
 * @returns 已化解的推理配置
 */
function resolveReasoningConfig(config: any): ReasoningResolvedConfig {
  if (config.controlMode === 'disabled') {
    return {
      controlMode: 'disabled',
      effort: 'none',
      showReasoningContent: config.showReasoningContent ?? false,
    }
  }

  if (config.controlMode === 'auto') {
    // Auto 策略：优先 maxReasoningTokens，否则 effort
    if (config.maxReasoningTokens != null && config.maxReasoningTokens > 0) {
      return {
        controlMode: 'max_tokens',
        maxReasoningTokens: config.maxReasoningTokens,
        maxCompletionTokens: config.maxCompletionTokens,
        showReasoningContent: config.showReasoningContent ?? false,
      }
    } else {
      return {
        controlMode: 'effort',
        effort: config.effort ?? 'medium',
        maxCompletionTokens: config.maxCompletionTokens,
        showReasoningContent: config.showReasoningContent ?? false,
      }
    }
  }

  // effort 或 max_tokens 模式直接转发
  // 确保 controlMode 有有效值
  const controlMode = config.controlMode === 'effort' || config.controlMode === 'max_tokens' 
    ? config.controlMode 
    : 'effort' // 默认使用 effort 模式

  return {
    controlMode,
    effort: config.effort,
    maxReasoningTokens: config.maxReasoningTokens,
    maxCompletionTokens: config.maxCompletionTokens,
    showReasoningContent: config.showReasoningContent ?? false,
  }
}

// ============================================================================
// SECTION 5: Utility Functions (辅助函数)
// ============================================================================

/**
 * 裁剪数值到指定范围
 * 
 * @param value - 待裁剪值
 * @param min - 最小值
 * @param max - 最大值
 * @returns 裁剪后的值
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * 深度合并配置对象
 * 
 * @param base - 基础配置
 * @param override - 覆盖配置
 * @returns 合并后的配置
 */
export function mergeGenerationConfig(
  base: GenerationConfig,
  override: Partial<GenerationConfig>,
): GenerationConfig {
  const result: GenerationConfig = {
    sampling: {
      ...base.sampling,
      ...override.sampling,
    },
    length: {
      ...base.length,
      ...override.length,
    },
  }

  // reasoning 配置的特殊处理：确保 controlMode 始终有值
  if (base.reasoning || override.reasoning) {
    const baseReasoning = base.reasoning || { controlMode: 'effort' as const, showReasoningContent: false }
    const overrideReasoning: Partial<ReasoningResolvedConfig> = override.reasoning || {}
    
    result.reasoning = {
      controlMode: overrideReasoning.controlMode ?? baseReasoning.controlMode,
      effort: overrideReasoning.effort ?? baseReasoning.effort,
      maxReasoningTokens: overrideReasoning.maxReasoningTokens ?? baseReasoning.maxReasoningTokens,
      maxCompletionTokens: overrideReasoning.maxCompletionTokens ?? baseReasoning.maxCompletionTokens,
      showReasoningContent: overrideReasoning.showReasoningContent ?? baseReasoning.showReasoningContent,
    }
  }

  return result
}

/**
 * 验证配置合法性
 * 
 * @param config - 生成配置
 * @returns 是否合法
 */
export function validateGenerationConfig(config: GenerationConfig): boolean {
  // 基础类型检查
  if (config.sampling) {
    for (const [key, value] of Object.entries(config.sampling)) {
      if (typeof value !== 'number' && typeof value !== 'object') {
        console.error(`[validateGenerationConfig] Invalid type for sampling.${key}: ${typeof value}`)
        return false
      }
    }
  }

  // 推理配置互斥检查
  if (config.reasoning) {
    const r = config.reasoning
    if (r.controlMode === 'max_tokens' && (!r.maxReasoningTokens || r.maxReasoningTokens <= 0)) {
      console.error('[validateGenerationConfig] max_tokens mode requires valid maxReasoningTokens')
      return false
    }
  }

  return true
}

// ============================================================================
// SECTION 5: Capability Summary Helper (能力摘要辅助函数)
// ============================================================================

/**
 * 构建模型能力摘要（用于详细日志）
 * 
 * @param capability - 模型能力表
 * @returns 人类可读的能力摘要
 */
function buildCapabilitySummary(capability: ModelGenerationCapability): string {
  const supported: string[] = []
  const unsupported: string[] = []
  
  // 采样参数检查
  const samplingParams = [
    'temperature', 'top_p', 'top_k', 'min_p', 'top_a',
    'frequency_penalty', 'presence_penalty', 'repetition_penalty', 'seed', 'logit_bias'
  ]
  for (const param of samplingParams) {
    if (capability.sampling[param as keyof typeof capability.sampling]) {
      supported.push(param)
    } else {
      unsupported.push(param)
    }
  }
  
  // 长度参数检查
  if (capability.length.max_tokens) supported.push('max_tokens')
  else unsupported.push('max_tokens')
  
  if (capability.length.stop) supported.push('stop')
  if (capability.length.verbosity) supported.push('verbosity')
  
  // 推理参数检查
  if (capability.reasoning.supportsReasoningParam) supported.push('reasoning')
  if (capability.reasoning.supportsIncludeReasoning) supported.push('include_reasoning')
  
  return `支持 ${supported.length} 个参数 (${supported.slice(0, 5).join(', ')}${supported.length > 5 ? '...' : ''})`
}


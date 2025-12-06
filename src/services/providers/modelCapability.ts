/**
 * modelCapability.ts - 模型能力表构建器
 * 
 * 职责�?
 * - �?OpenRouter /models API 响应构建 ModelGenerationCapability
 * - 维护推理模型白名单与黑名�?
 * - 提供能力查询辅助函数
 * 
 * 数据来源�?
 * - OpenRouter /api/v1/models �?/api/v1/models/user
 * - 手工维护的模型家族映�?
 * 
 * 参考文档：
 * - https://openrouter.ai/docs/api/api-reference/models/get-models
 * - https://openrouter.ai/docs/guides/overview/models
 */

import type {
  ModelGenerationCapability,
  ModelSamplingCapability,
  ModelLengthCapability,
  ModelOtherCapability,
} from '../../types/generation'
import type { ModelReasoningCapability } from '../../types/reasoning'
import { PROVIDERS, type ProviderId, isValidProviderId } from '../../constants/providers'

// ============================================================================
// SECTION 1: Reasoning Model Whitelists (推理模型白名�?
// ============================================================================

/**
 * 从模型 ID 中提取 Provider ID
 * 
 * OpenRouter 模型 ID 格式: "provider/model-name"
 * 例如: "openai/gpt-4o", "anthropic/claude-3-sonnet"
 * 
 * @param modelId - 完整模型 ID
 * @returns ProviderId 或 undefined（如果无法识别）
 * 
 * @example
 * ```typescript
 * extractProviderId('openai/gpt-4o') // => 'openai'
 * extractProviderId('anthropic/claude-3-sonnet') // => 'anthropic'
 * extractProviderId('gemini-pro') // => undefined (非 OpenRouter 格式)
 * ```
 */
export function extractProviderId(modelId: string): ProviderId | undefined {
  // OpenRouter 模型格式: "provider/model-name"
  const match = modelId.match(/^([^/]+)\//)
  if (!match) return undefined
  
  const prefix = match[1].toLowerCase()
  
  // 使用常量比较，避免拼写错误
  if (prefix === PROVIDERS.OPENAI) return PROVIDERS.OPENAI
  if (prefix === PROVIDERS.ANTHROPIC) return PROVIDERS.ANTHROPIC
  if (prefix === PROVIDERS.GEMINI) return PROVIDERS.GEMINI
  if (prefix === PROVIDERS.OPENROUTER) return PROVIDERS.OPENROUTER
  
  // 验证是否为有效的 Provider ID
  if (isValidProviderId(prefix)) {
    return prefix
  }
  
  return undefined
}

/**
 * 推理模型识别关键�?
 * 
 * 用于检测模�?ID 或名称中是否包含推理相关标识
 */
const REASONING_KEYWORDS = [
  'o1',       // OpenAI o1-preview, o1-mini
  'o3',       // OpenAI o3
  'o4',       // 未来�?o4
  'reasoning',
  'r1',       // DeepSeek R1
  'qwq',      // Alibaba QwQ
  'thinking', // Gemini thinking, Claude thinking
  'think',
  'deepseek-r',
  'sonnet-thinking',
  'brainstorm',
  'logic',
  'grok-reasoning', // xAI Grok reasoning models
]

/**
 * 确认支持 reasoning.max_tokens 的模型家�?
 * 
 * 根据 OpenRouter 文档�?
 * - Gemini thinking models
 * - Anthropic reasoning models (reasoning.max_tokens)
 * - Some Alibaba Qwen thinking models (mapped to thinking_budget)
 */
const MAX_TOKENS_SUPPORTED_FAMILIES = new Set([
  'gemini',    // Gemini 2.0 Flash Thinking �?
  'anthropic', // Claude 3.7, 4.x with reasoning
  'qwen',      // 部分 Qwen thinking 模型
])

/**
 * 确认返回可见推理内容的模�?
 * 
 * 'yes': 确认返回
 * 'no': 确认不返回（OpenAI o-series 部分模型、Gemini Flash Thinking�?
 * 
 * 基于文档说明�?
 * "While most models and providers make reasoning tokens available in the response,
 *  some (like the OpenAI o-series and Gemini Flash Thinking) do not."
 */
const VISIBLE_REASONING_WHITELIST: Record<string, 'yes' | 'no'> = {
  // Anthropic: 确认返回
  'anthropic/claude-3.7-sonnet': 'yes',
  'anthropic/claude-sonnet-4': 'yes',
  'anthropic/claude-4.1-sonnet': 'yes',

  // Gemini thinking: 部分不返�?
  'google/gemini-2.0-flash-thinking-exp': 'no',
  'google/gemini-2.0-flash-thinking-exp-1219': 'no',
  'google/gemini-exp-1206': 'yes',

  // OpenAI o-series: 部分不返�?
  'openai/o1-preview': 'no',
  'openai/o1-mini': 'no',
  'openai/o1': 'yes', // 新版可能支持
  'openai/o3-mini': 'yes',

  // DeepSeek R1: 确认返回
  'deepseek/deepseek-r1': 'yes',
  'deepseek/deepseek-reasoner': 'yes',

  // xAI Grok: 确认返回
  'x-ai/grok-2-1212-reasoning': 'yes',
  'x-ai/grok-reasoning': 'yes',

  // Alibaba Qwen: 确认返回
  'qwen/qwq-32b-preview': 'yes',
  'qwen/qwen-2.5-coder-32b-thinking': 'yes',
}

/**
 * Anthropic 推理模型的特殊标�?
 * 
 * 这些模型使用 [1024, 32000] 裁剪规则
 */
const ANTHROPIC_REASONING_MODELS = [
  'claude-3.7-sonnet',
  'claude-sonnet-4',
  'claude-4.1-sonnet',
  'claude-opus-4',
]

// ============================================================================
// SECTION 2: Model Family Detection (模型家族识别)
// ============================================================================

/**
 * 推断模型家族
 * 
 * @param modelId - 模型 ID (�?'openai/gpt-4o', 'anthropic/claude-3.7-sonnet')
 * @param modelName - 模型名称 (可�?
 * @returns 模型家族标识
 */
export function detectModelFamily(
  modelId: string,
  modelName?: string,
): 'openai' | 'anthropic' | 'gemini' | 'xai' | 'qwen' | 'other' {
  const lowerModelId = modelId.toLowerCase()
  const lowerName = (modelName || '').toLowerCase()

  // OpenAI
  if (lowerModelId.includes('openai/') || lowerModelId.includes('gpt-') || lowerName.includes('openai')) {
    return 'openai'
  }

  // Anthropic
  if (lowerModelId.includes('anthropic/') || lowerModelId.includes('claude') || lowerName.includes('claude')) {
    return 'anthropic'
  }

  // Google Gemini
  if (lowerModelId.includes('google/') || lowerModelId.includes('gemini') || lowerName.includes('gemini')) {
    return 'gemini'
  }

  // xAI Grok
  if (lowerModelId.includes('x-ai/') || lowerModelId.includes('grok') || lowerName.includes('grok')) {
    return 'xai'
  }

  // Alibaba Qwen
  if (lowerModelId.includes('qwen') || lowerModelId.includes('alibaba') || lowerName.includes('qwen')) {
    return 'qwen'
  }

  return 'other'
}

/**
 * 检测模型是否支持推理功�?
 * 
 * 检查顺序：
 * 1. API 返回�?supported_parameters 包含 'reasoning'
 * 2. 模型 ID 或名称匹配推理关键词
 * 
 * @param modelId - 模型 ID
 * @param supportedParams - 来自 API �?supported_parameters
 * @param modelName - 模型名称 (可�?
 * @returns 是否支持推理
 */
export function detectReasoningSupport(
  modelId: string,
  supportedParams: string[],
  modelName?: string,
  rawModelData?: any,
): boolean {
  // 1) ���ȼ�� supported_parameters
  if (Array.isArray(supportedParams) && supportedParams.includes('reasoning')) {
    return true
  }

  const lowerModelId = modelId.toLowerCase()

  // 2) ���� OpenRouter ���صĸ����ֶΣ�capabilities/tags/metadata/description��
  if (rawModelData && typeof rawModelData === 'object') {
    if (rawModelData.reasoning === true) return true

    const rawCaps = rawModelData.capabilities
    if (rawCaps) {
      if (rawCaps.reasoning === true || rawCaps.reasoning_supported === true) {
        return true
      }
      if (Array.isArray(rawCaps) && rawCaps.some((item: any) => typeof item === 'string' && item.toLowerCase().includes('reasoning'))) {
        return true
      }
    }

    const rawTags = rawModelData.tags || rawModelData.keywords || rawModelData.categories
    if (Array.isArray(rawTags) && rawTags.some((tag: any) => typeof tag === 'string' && tag.toLowerCase().includes('reasoning'))) {
      return true
    }

    if (rawModelData.metadata && typeof rawModelData.metadata === 'object') {
      const metaTags = rawModelData.metadata.tags || rawModelData.metadata.capabilities
      if (Array.isArray(metaTags) && metaTags.some((tag: any) => typeof tag === 'string' && tag.toLowerCase().includes('reasoning'))) {
        return true
      }
      if (rawModelData.metadata.reasoning === true) {
        return true
      }
    }

    const description: string = typeof rawModelData.description === 'string' ? rawModelData.description.toLowerCase() : ''
    if (description.includes('reasoning') || description.includes('����')) {
      return true
    }
  }

  // 3) �ؼ���ƥ�䣨ID/���ƣ�
  if (REASONING_KEYWORDS.some((kw) => lowerModelId.includes(kw))) {
    return true
  }

  if (modelName) {
    const lowerName = modelName.toLowerCase()
    if (REASONING_KEYWORDS.some((kw) => lowerName.includes(kw))) {
      return true
    }
  }

  return false
}/**
 * 检测模型是否返回可见的推理内容
 * 
 * @param modelId - 模型 ID
 * @returns 'yes' | 'no' | 'unknown'
 */
export function detectVisibleReasoning(modelId: string): 'yes' | 'no' | 'unknown' {
  // 优先查白名单
  if (modelId in VISIBLE_REASONING_WHITELIST) {
    return VISIBLE_REASONING_WHITELIST[modelId]
  }

  // 模糊匹配：Gemini Flash Thinking 系列不返�?
  const lowerModelId = modelId.toLowerCase()
  if (lowerModelId.includes('gemini') && lowerModelId.includes('flash') && lowerModelId.includes('thinking')) {
    return 'no'
  }

  // 模糊匹配：o1-preview, o1-mini 不返�?
  if (lowerModelId.includes('o1-preview') || lowerModelId.includes('o1-mini')) {
    return 'no'
  }

  // 默认未知
  return 'unknown'
}

// ============================================================================
// SECTION 3: Capability Builder (能力表构建器)
// ============================================================================

/**
 * �?supported_parameters 构建采样能力
 * 
 * @param supportedParams - 来自 API �?supported_parameters 数组
 * @returns 采样能力对象
 */
function buildSamplingCapability(supportedParams: string[]): ModelSamplingCapability {
  const paramSet = new Set(supportedParams)

  return {
    temperature: paramSet.has('temperature'),
    top_p: paramSet.has('top_p'),
    top_k: paramSet.has('top_k'),
    min_p: paramSet.has('min_p'),
    top_a: paramSet.has('top_a'),
    frequency_penalty: paramSet.has('frequency_penalty'),
    presence_penalty: paramSet.has('presence_penalty'),
    repetition_penalty: paramSet.has('repetition_penalty'),
    seed: paramSet.has('seed'),
    logit_bias: paramSet.has('logit_bias'),
  }
}

/**
 * �?supported_parameters �?top_provider 构建长度能力
 * 
 * @param supportedParams - supported_parameters 数组
 * @param topProvider - top_provider 对象
 * @returns 长度能力对象
 */
function buildLengthCapability(
  supportedParams: string[],
  topProvider: any,
): ModelLengthCapability {
  const paramSet = new Set(supportedParams)

  return {
    max_tokens: paramSet.has('max_tokens'),
    stop: paramSet.has('stop'),
    verbosity: paramSet.has('verbosity'),
    maxCompletionTokens: topProvider?.max_completion_tokens ?? null,
  }
}

/**
 * 从模型信息构建推理能�?
 * 
 * @param modelId - 模型 ID
 * @param supportedParams - supported_parameters 数组
 * @param topProvider - top_provider 对象
 * @param pricing - pricing 对象
 * @param modelName - 模型名称
 * @returns 推理能力对象
 */
function buildReasoningCapability(
  modelId: string,
  supportedParams: string[],
  topProvider: any,
  pricing: any,
  modelName?: string,
  rawModelData?: any,
): ModelReasoningCapability {
  const paramSet = new Set(supportedParams)
  const family = detectModelFamily(modelId, modelName)

  const supportsReasoningParam = detectReasoningSupport(modelId, supportedParams, modelName, rawModelData)
  const supportsIncludeReasoning = paramSet.has('include_reasoning')

  // 检测是否支�?reasoning.max_tokens
  const supportsMaxReasoningTokens =
    supportsReasoningParam &&
    (MAX_TOKENS_SUPPORTED_FAMILIES.has(family) ||
      // Anthropic 特殊检�?
      ANTHROPIC_REASONING_MODELS.some((name) => modelId.toLowerCase().includes(name)))

  // 检测是否返回可见推�?
  const returnsVisibleReasoning = detectVisibleReasoning(modelId)

  // 确定 reasoningClass
  let reasoningClass: 'A' | 'B' | 'C' = 'C'
  if (supportsReasoningParam) {
    reasoningClass = supportsMaxReasoningTokens ? 'A' : 'B'
  }

  // 确定 maxTokensPolicy
  let maxTokensPolicy: 'anthropic-1024-32000' | 'provider-unknown-range' | 'effort-only'
  if (family === 'anthropic' && supportsMaxReasoningTokens) {
    maxTokensPolicy = 'anthropic-1024-32000'
  } else if (supportsMaxReasoningTokens) {
    maxTokensPolicy = 'provider-unknown-range'
  } else {
    maxTokensPolicy = 'effort-only'
  }

  return {
    modelId,
    supportsReasoningParam,
    supportsIncludeReasoning,
    supportsMaxReasoningTokens,
    returnsVisibleReasoning,
    maxCompletionTokens: topProvider?.max_completion_tokens ?? null,
    internalReasoningPrice: pricing?.internal_reasoning ?? null,
    family,
    reasoningClass,
    maxTokensPolicy,
  }
}

/**
 * �?supported_parameters 构建其他能力
 * 
 * @param supportedParams - supported_parameters 数组
 * @returns 其他能力对象
 */
function buildOtherCapability(supportedParams: string[]): ModelOtherCapability {
  const paramSet = new Set(supportedParams)

  return {
    tools: paramSet.has('tools'),
    response_format: paramSet.has('response_format'),
    structured_outputs: paramSet.has('structured_outputs'),
    logprobs: paramSet.has('logprobs'),
    top_logprobs: paramSet.has('top_logprobs'),
    parallel_tool_calls: paramSet.has('parallel_tool_calls'),
  }
}

/**
 * �?OpenRouter /models API 响应构建完整的模型能力表
 * 
 * @param modelData - 来自 /api/v1/models 的单个模型数�?
 * @returns ModelGenerationCapability 对象
 * 
 * @example
 * ```typescript
 * const modelData = await fetch('https://openrouter.ai/api/v1/models').then(r => r.json())
 * const capabilities = modelData.data.map(model => buildModelCapability(model))
 * ```
 */
export function buildModelCapability(modelData: any): ModelGenerationCapability {
  const modelId = modelData.id || ''
  const supportedParams = modelData.supported_parameters || []
  const topProvider = modelData.top_provider || {}
  const pricing = modelData.pricing || {}
  const modelName = modelData.name || ''

  return {
    modelId,
    providerId: extractProviderId(modelId),
    sampling: buildSamplingCapability(supportedParams),
    length: buildLengthCapability(supportedParams, topProvider),
    reasoning: buildReasoningCapability(modelId, supportedParams, topProvider, pricing, modelName, modelData),
    other: buildOtherCapability(supportedParams),
    _raw_supported_parameters: supportedParams,
  }
}

/**
 * 批量构建模型能力�?
 * 
 * @param modelsApiResponse - /api/v1/models 完整响应
 * @returns ModelGenerationCapability 数组
 * 
 * @example
 * ```typescript
 * const response = await fetch('https://openrouter.ai/api/v1/models').then(r => r.json())
 * const capabilityMap = buildModelCapabilityMap(response)
 * ```
 */
export function buildModelCapabilityMap(
  modelsApiResponse: any,
): Map<string, ModelGenerationCapability> {
  const capabilityMap = new Map<string, ModelGenerationCapability>()

  if (!modelsApiResponse || !modelsApiResponse.data || !Array.isArray(modelsApiResponse.data)) {
    console.warn('[modelCapability] Invalid modelsApiResponse, returning empty map')
    return capabilityMap
  }

  for (const model of modelsApiResponse.data) {
    try {
      const capability = buildModelCapability(model)
      capabilityMap.set(capability.modelId, capability)
    } catch (error) {
      console.error(`[modelCapability] Failed to build capability for model ${model.id}:`, error)
    }
  }

  console.log(`[modelCapability] Built capability map for ${capabilityMap.size} models`)
  return capabilityMap
}

// ============================================================================
// SECTION 4: Query Helpers (能力查询辅助函数)
// ============================================================================

/**
 * 检查模型是否支持特定参�?
 * 
 * @param capability - 模型能力�?
 * @param parameterName - 参数名称 (�?'temperature', 'reasoning', 'tools')
 * @returns 是否支持
 */
export function supportsParameter(
  capability: ModelGenerationCapability | null,
  parameterName: string,
): boolean {
  if (!capability) return false

  // 采样参数
  if (parameterName in capability.sampling) {
    return capability.sampling[parameterName as keyof ModelSamplingCapability]
  }

  // 长度参数
  if (parameterName in capability.length) {
    return capability.length[parameterName as keyof ModelLengthCapability] === true
  }

  // 推理参数
  if (parameterName === 'reasoning') {
    return capability.reasoning.supportsReasoningParam
  }
  if (parameterName === 'include_reasoning') {
    return capability.reasoning.supportsIncludeReasoning
  }

  // 其他参数
  if (parameterName in capability.other) {
    return capability.other[parameterName as keyof ModelOtherCapability]
  }

  return false
}

/**
 * 获取模型支持的所有参数列�?
 * 
 * @param capability - 模型能力�?
 * @returns 支持的参数名称数�?
 */
export function getSupportedParameters(capability: ModelGenerationCapability | null): string[] {
  if (!capability) return []

  const supported: string[] = []

  // 采样参数
  for (const [key, value] of Object.entries(capability.sampling)) {
    if (value) supported.push(key)
  }

  // 长度参数
  for (const [key, value] of Object.entries(capability.length)) {
    if (key !== 'maxCompletionTokens' && value) supported.push(key)
  }

  // 推理参数
  if (capability.reasoning.supportsReasoningParam) supported.push('reasoning')
  if (capability.reasoning.supportsIncludeReasoning) supported.push('include_reasoning')

  // 其他参数
  for (const [key, value] of Object.entries(capability.other)) {
    if (value) supported.push(key)
  }

  return supported
}

/**
 * 打印模型能力摘要（调试用�?
 * 
 * @param capability - 模型能力�?
 */
export function printCapabilitySummary(capability: ModelGenerationCapability): void {
  console.group(`[ModelCapability] ${capability.modelId}`)
  console.log('Family:', capability.reasoning.family)
  console.log('Reasoning Class:', capability.reasoning.reasoningClass)
  console.log('Max Tokens Policy:', capability.reasoning.maxTokensPolicy)
  console.log('Max Completion Tokens:', capability.length.maxCompletionTokens)
  console.log('Visible Reasoning:', capability.reasoning.returnsVisibleReasoning)
  console.log('Supported Parameters:', getSupportedParameters(capability).join(', '))
  console.groupEnd()
}





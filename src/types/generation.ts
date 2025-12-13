/**
 * generation.ts - 统一的生成参数配置类型系统
 * 
 * 职责：
 * - 整合 Sampling、Length、Reasoning 三大子系统
 * - 定义 4 层配置覆盖机制（Global → Model → Conversation → Request）
 * - 提供完整的模型能力表结构
 * 
 * 设计原则：
 * - 配置与能力分离：用户配置不关心模型是否支持，由适配器检查
 * - 分层覆盖：每层只定义需要的字段，上层覆盖下层
 * - 明确语义：所有字段都有清晰的 OpenRouter 文档对应
 * 
 * 参考文档：
 * - https://openrouter.ai/docs/api/reference/parameters
 * - https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
 */

import type { 
  ReasoningEffort, 
  ReasoningControlMode, 
  ReasoningResolvedConfig,
  ModelReasoningCapability,
} from './reasoning'

// ============================================================================
// SECTION 1: Sampling Configuration (采样参数)
// ============================================================================

/**
 * 采样参数配置（完整）
 * 
 * 所有字段都是可选的，适配器会根据模型能力决定是否发送
 */
export interface SamplingConfig {
  /**
   * 控制输出的随机性
   * 
   * - 范围: 0.0 ~ 2.0
   * - 默认: 1.0
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#temperature
   * 
   * 语义：越低越确定性，越高越随机（0 = 贪婪解码）
   */
  temperature?: number

  /**
   * 核采样，累积概率阈值
   * 
   * - 范围: 0.0 ~ 1.0
   * - 默认: 1.0
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#top-p
   * 
   * 语义：限制模型选择概率累积到 P 的 tokens
   */
  top_p?: number

  /**
   * Top-K 采样，限制候选词数量
   * 
   * - 范围: 0 或正整数
   * - 默认: 0 (禁用)
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#top-k
   * 
   * 语义：每步只从概率最高的 K 个 token 中选择
   */
  top_k?: number

  /**
   * 最小概率阈值（相对于最高概率）
   * 
   * - 范围: 0.0 ~ 1.0
   * - 默认: 0.0
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#min-p
   * 
   * 语义：只考虑概率 >= (最高概率 * min_p) 的 tokens
   */
  min_p?: number

  /**
   * Top-A 采样（动态阈值）
   * 
   * - 范围: 0.0 ~ 1.0
   * - 默认: 0.0
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#top-a
   * 
   * 语义：基于最高概率动态筛选候选 tokens
   */
  top_a?: number

  /**
   * 频率惩罚（降低重复词频率）
   * 
   * - 范围: -2.0 ~ 2.0
   * - 默认: 0.0
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#frequency-penalty
   * 
   * 语义：基于 token 出现次数的惩罚，出现越多惩罚越大
   */
  frequency_penalty?: number

  /**
   * 存在惩罚（鼓励新话题）
   * 
   * - 范围: -2.0 ~ 2.0
   * - 默认: 0.0
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#presence-penalty
   * 
   * 语义：只要 token 出现过就惩罚，不随次数增长
   */
  presence_penalty?: number

  /**
   * 重复惩罚
   * 
   * - 范围: 0.0 ~ 2.0
   * - 默认: 1.0
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#repetition-penalty
   * 
   * 语义：基于原始概率的重复惩罚（1.0 = 无惩罚）
   */
  repetition_penalty?: number

  /**
   * 随机种子（用于可复现输出）
   * 
   * - 类型: 整数
   * - 可选
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#seed
   * 
   * 语义：相同种子 + 相同参数 = 相同输出（部分模型保证）
   */
  seed?: number

  /**
   * Logit 偏置
   * 
   * - 类型: { [tokenId: string]: number }
   * - 范围: -100 ~ 100
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#logit-bias
   * 
   * 语义：直接调整特定 token 的 logit 值
   */
  logit_bias?: Record<string, number>
}

// ============================================================================
// SECTION 2: Length Configuration (长度/停止控制)
// ============================================================================

/**
 * 长度与停止条件配置
 */
export interface LengthConfig {
  /**
   * 最大生成 token 数
   * 
   * - 范围: 1 ~ (context_length - prompt_length)
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#max-tokens
   * 
   * 语义：
   * - 对于非推理模型：纯输出上限
   * - 对于推理模型：total output = reasoning + completion
   *   - Anthropic: 必须 > reasoning.max_tokens
   *   - 其他：不同模型不同语义
   */
  max_tokens?: number

  /**
   * 停止序列（遇到则立即停止生成）
   * 
   * - 类型: string[]
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#stop
   * 
   * 语义：模型生成到任一序列时立即停止
   */
  stop?: string[]

  /**
   * 冗长度控制
   * 
   * - 类型: 'low' | 'medium' | 'high'
   * - 默认: 'medium'
   * - 文档: https://openrouter.ai/docs/api/reference/parameters#verbosity
   * 
   * 语义：控制响应的详细程度
   */
  verbosity?: 'low' | 'medium' | 'high'
}

// ============================================================================
// SECTION 3: Reasoning Configuration (推理控制)
// ============================================================================

/**
 * 推理配置（用户层）
 * 
 * 此类型已在 reasoning.ts 中定义，这里引用以保持一致性
 */
export interface ReasoningConfig {
  /**
   * 控制模式
   * 
   * - 'disabled': 禁用推理（effort='none' 或不传 reasoning）
   * - 'effort': 使用 effort 档位控制
   * - 'max_tokens': 使用 max_tokens 控制预算/hint
   * - 'auto': Starverse 自动策略（需在上游化解）
   */
  controlMode: ReasoningControlMode

  /**
   * Effort 档位
   * 
   * 当 controlMode='effort' 时使用
   */
  effort?: ReasoningEffort

  /**
   * 最大推理 tokens
   * 
   * 当 controlMode='max_tokens' 时使用
   * 
   * 语义根据模型类型：
   * - Anthropic/Gemini/Qwen: 硬预算上限
   * - OpenAI o-series/Grok: effort hint
   */
  maxReasoningTokens?: number

  /**
   * 顶层 max_tokens（总输出预算）
   * 
   * 若用户未设置，适配器会根据 Starverse 策略推导
   * 注意：此字段与 LengthConfig.max_tokens 概念重叠，需统一处理
   */
  maxCompletionTokens?: number

  /**
   * 是否希望看到 reasoning 内容
   * 
   * 映射到 reasoning.exclude 与 include_reasoning
   */
  showReasoningContent: boolean
}

// ============================================================================
// SECTION 4: Unified Generation Configuration (统一配置)
// ============================================================================

/**
 * 统一生成配置（完整）
 * 
 * 这是最顶层的配置结构，整合了所有子系统
 */
export interface GenerationConfig {
  /**
   * 采样参数
   */
  sampling?: SamplingConfig

  /**
   * 长度与停止条件
   */
  length?: LengthConfig

  /**
  * 推理控制（已解析，无 'auto' 模式）
   */
  reasoning?: ReasoningResolvedConfig
}

/**
 * Partial 版本（用于覆盖场景）
 * 
 * 允许每层只定义需要的字段
 */
export type PartialGenerationConfig = {
  sampling?: Partial<SamplingConfig>
  length?: Partial<LengthConfig>
  reasoning?: Partial<ReasoningResolvedConfig>
}

// ============================================================================
// SECTION 5: Model Capability System (模型能力表)
// ============================================================================

/**
 * 模型采样能力
 * 
 * 基于 supported_parameters 数组
 */
export interface ModelSamplingCapability {
  temperature: boolean
  top_p: boolean
  top_k: boolean
  min_p: boolean
  top_a: boolean
  frequency_penalty: boolean
  presence_penalty: boolean
  repetition_penalty: boolean
  seed: boolean
  logit_bias: boolean
}

/**
 * 模型长度能力
 */
export interface ModelLengthCapability {
  /**
   * 是否支持 max_tokens 参数
   */
  max_tokens: boolean

  /**
   * 是否支持 stop 参数
   */
  stop: boolean

  /**
   * 是否支持 verbosity 参数
   */
  verbosity: boolean

  /**
   * 模型单次请求的最大输出 token 数
   * 
   * 来自 top_provider.max_completion_tokens
   */
  maxCompletionTokens: number | null
}

/**
 * 模型推理能力
 * 
 * 注意：此类型已在 reasoning.ts 中定义并导入，
 * 这里仅保留注释说明其在能力表中的作用
 */
// export interface ModelReasoningCapability - 从 reasoning.ts 导入

/**
 * 模型其他能力
 */
export interface ModelOtherCapability {
  /**
   * 是否支持 tools 参数
   */
  tools: boolean

  /**
   * 是否支持 response_format (JSON mode)
   */
  response_format: boolean

  /**
   * 是否支持 structured_outputs (JSON schema)
   */
  structured_outputs: boolean

  /**
   * 是否支持 logprobs
   */
  logprobs: boolean

  /**
   * 是否支持 top_logprobs
   */
  top_logprobs: boolean

  /**
   * 是否支持 parallel_tool_calls
   */
  parallel_tool_calls: boolean
}

/**
 * 统一的模型生成能力表
 * 
 * 数据来源：
 * - /api/v1/models 或 /api/v1/models/user 的 supported_parameters
 * - top_provider.max_completion_tokens
 * - pricing.internalReasoningUsdPerToken
 * - 手工维护的白名单（reasoning 模型识别）
 */
export interface ModelGenerationCapability {
  /**
   * 模型 ID
   */
  modelId: string

  /**
   * Provider ID（可选）
   * 用于识别模型来源，避免字符串拼写错误
   * 
   * @example
   * - 'openrouter'
   * - 'openai'
   * - 'anthropic'
   * 
   * @see {@link src/constants/providers.ts}
   */
  providerId?: import('../constants/providers').ProviderId

  /**
   * 采样参数支持
   */
  sampling: ModelSamplingCapability

  /**
   * 长度参数支持
   */
  length: ModelLengthCapability

  /**
   * 推理参数支持
   */
  reasoning: ModelReasoningCapability

  /**
   * 其他能力
   */
  other: ModelOtherCapability

  /**
   * 原始 supported_parameters 数组（调试用）
   */
  _raw_supported_parameters?: string[]
}

// ============================================================================
// SECTION 6: Configuration Override System (4层覆盖系统)
// ============================================================================

/**
 * 配置来源标识
 */
export type ConfigSource = 'global' | 'model' | 'conversation' | 'request'

/**
 * 带来源信息的配置
 */
export interface SourcedGenerationConfig {
  config: PartialGenerationConfig
  source: ConfigSource
}

/**
 * 配置覆盖栈
 * 
 * 优先级：global < model < conversation < request
 */
export interface GenerationConfigStack {
  global?: PartialGenerationConfig
  model?: PartialGenerationConfig
  conversation?: PartialGenerationConfig
  request?: PartialGenerationConfig
}

// ============================================================================
// SECTION 7: Adapter Types (适配器输入输出)
// ============================================================================

/**
 * 适配器输入
 */
export interface GenerationAdapterInput {
  /**
   * 模型 ID
   */
  modelId: string

  /**
   * 模型能力表
   */
  capability: ModelGenerationCapability

  /**
   * 最终生效的配置（已完成 4 层合并）
   */
  effectiveConfig: GenerationConfig

  /**
   * 消息列表（用于计算 prompt_length，辅助决策）
   */
  messages: any[]

  /**
   * Starverse 策略配置（可选）
   */
  strategy?: any
}

/**
 * 适配器输出
 */
export interface GenerationAdapterOutput {
  /**
   * OpenRouter 请求体片段
   * 
   * 包含：
   * - 采样参数（temperature, top_p, ...）
   * - max_tokens, stop
   * - reasoning 对象
   * - include_reasoning
   */
  requestBodyFragment: Record<string, any>

  /**
   * 警告信息（参数被裁剪、回退等）
   */
  warnings: GenerationAdapterWarning[]

  /**
   * 被忽略的参数（因模型不支持）
   */
  ignoredParameters: Array<{ key: string; reason: string }>
}

/**
 * 适配器警告类型
 */
export interface GenerationAdapterWarning {
  type: 'auto-adjusted' | 'clipped' | 'fallback' | 'unsupported' | 'ignored'
  message: string
  details?: Record<string, any>
}

// ============================================================================
// SECTION 8: Default Values (默认值)
// ============================================================================

/**
 * 默认采样配置（OpenRouter 默认值）
 */
export const DEFAULT_SAMPLING_CONFIG: Readonly<SamplingConfig> = Object.freeze({
  temperature: 1.0,
  top_p: 1.0,
  top_k: 0,
  min_p: 0.0,
  top_a: 0.0,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  repetition_penalty: 1.0,
})

/**
 * 默认长度配置
 */
export const DEFAULT_LENGTH_CONFIG: Readonly<LengthConfig> = Object.freeze({
  verbosity: 'medium',
})

/**
 * 默认推理配置（已解析，无 'auto'）
 */
export const DEFAULT_REASONING_CONFIG: Readonly<ReasoningResolvedConfig> = Object.freeze({
  controlMode: 'effort',
  effort: 'medium',
  showReasoningContent: false, // 默认隐藏推理内容（降低延迟）
})

/**
 * 默认统一配置
 */
export const DEFAULT_GENERATION_CONFIG: Readonly<GenerationConfig> = Object.freeze({
  sampling: DEFAULT_SAMPLING_CONFIG,
  length: DEFAULT_LENGTH_CONFIG,
  reasoning: DEFAULT_REASONING_CONFIG,
})

// ============================================================================
// SECTION 9: Utility Types (辅助类型)
// ============================================================================

/**
 * 可序列化的配置（用于持久化）
 * 
 * 移除了不可序列化的字段（如函数）
 */
export type SerializableGenerationConfig = GenerationConfig

/**
 * 配置校验结果
 */
export interface ConfigValidationResult {
  valid: boolean
  errors: Array<{ field: string; message: string }>
}

/**
 * 配置 diff 类型（用于调试/日志）
 */
export interface ConfigDiff {
  added: string[]
  removed: string[]
  changed: Array<{ key: string; from: any; to: any }>
}

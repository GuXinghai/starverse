/**
 * reasoning.ts - OpenRouter Reasoning 统一类型定义
 * 
 * 设计原则：
 * - 完全遵守 OpenRouter 官方 reasoning 参数语义
 * - effort 枚举直接使用 OR 官方档位（minimal/low/medium/high/none）
 * - 区分"官方规则"与"Starverse 策略"
 * - 所有模糊性通过显式策略暴露给用户
 * 
 * 参考文档：
 * - https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
 */

// ========== OpenRouter 官方枚举（严格使用） ==========

/**
 * OpenRouter 官方 reasoning effort 档位（4个推理挡位 + 禁用）
 * 
 * 语义（根据文档）：
 * - minimal: ~10% 的 max_tokens 用于推理（基本推理，计算量极小）
 * - low: ~20% 的 max_tokens 用于推理（对简单问题进行简单的推理）
 * - medium: ~50% 的 max_tokens 用于推理（中等复杂程度的平衡推理）
 * - high: ~80% 的 max_tokens 用于推理（对复杂问题进行深度推理）
 * - none: 禁用推理
 * 
 * 注意：此比例针对支持 effort 的模型（OpenAI o-series、部分 Grok 等）
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'none';

/**
 * 用户选择的推理控制模式
 * 
 * - disabled: 禁用推理（effort='none' 或不传 reasoning）
 * - effort: 使用 effort 档位控制（适用所有支持 reasoning 的模型）
 * - max_tokens: 使用 max_tokens 控制预算或作为 hint
 *   - 对 Anthropic/Gemini/Qwen：表示硬预算
 *   - 对 OpenAI o-series/Grok：作为 effort hint
 * - auto: Starverse 自动策略（根据任务长度/模型家族推断）
 */
export type ReasoningControlMode = 'disabled' | 'effort' | 'max_tokens' | 'auto';

// ========== 模型能力结构（基于 /models 与白名单） ==========

/**
 * 模型对 reasoning 的支持能力
 * 
 * 数据来源：
 * - supported_parameters: /api/v1/models 或 /api/v1/models/user
 * - supportsMaxReasoningTokens: 通过官方文档 + 白名单维护
 * - returnsVisibleReasoning: 通过模型描述 + 实测维护
 */
export interface ModelReasoningCapability {
  modelId: string;

  // ===== 能力标记（来自 OR API） =====
  
  /**
   * 是否支持统一 reasoning 参数
   * 基于 supported_parameters.includes('reasoning')
   */
  supportsReasoningParam: boolean;

  /**
   * 是否支持旧式 include_reasoning 参数
   * 基于 supported_parameters.includes('include_reasoning')
   */
  supportsIncludeReasoning: boolean;

  /**
   * 是否支持 reasoning.max_tokens（真实预算或 hint）
   * 
   * 支持的模型族（来自文档）：
   * - Gemini reasoning/thinking 模型
   * - Anthropic reasoning 模型
   * - 部分 Alibaba Qwen thinking 模型
   * - OpenAI o-series / 部分 Grok（作为 hint）
   */
  supportsMaxReasoningTokens: boolean;

  /**
   * 模型是否返回可见的 reasoning 内容
   * 
   * - 'yes': 确认返回（如 Anthropic reasoning、Gemini thinking）
   * - 'no': 确认不返回（如 OpenAI o-series 部分模型、Gemini Flash Thinking）
   * - 'unknown': 未经实测确认
   */
  returnsVisibleReasoning: 'yes' | 'no' | 'unknown';

  // ===== 限制与成本（来自 OR API） =====

  /**
   * 模型单次请求的最大输出 token 数
   * 来自 top_provider.max_completion_tokens
   */
  maxCompletionTokens: number | null;

  /**
   * 推理 tokens 的单价（USD/token）
  * 来自 pricing.internalReasoningUsdPerToken
   */
  internalReasoningPrice?: number | null;

  // ===== Starverse 内部分类（非官方） =====

  /**
   * 提供方家族（用于策略路由）
   */
  family: 'openai' | 'anthropic' | 'gemini' | 'xai' | 'qwen' | 'other';

  /**
   * Starverse 内部分类（仅作为辅助）
   * 
   * - Class A: supportsReasoningParam && supportsMaxReasoningTokens
   * - Class B: supportsReasoningParam && !supportsMaxReasoningTokens
   * - Class C: !supportsReasoningParam
   */
  reasoningClass: 'A' | 'B' | 'C';

  /**
   * max_tokens 的解释策略（Starverse 抽象）
   * 
   * - 'anthropic-1024-32000': 使用 Anthropic 官方规则（裁剪到 [1024, 32000]）
   * - 'provider-unknown-range': 支持 max_tokens allocation，但上限未知（Gemini/Qwen）
   * - 'effort-only': 只支持 effort，max_tokens 被用作 hint（OpenAI o-series/Grok）
   */
  maxTokensPolicy: 'anthropic-1024-32000' | 'provider-unknown-range' | 'effort-only';
}

// ========== 用户配置（对话级/会话级） ==========

/**
 * 用户可见的推理配置
 * 
 * 存储在对话元数据或全局设置中
 */
export interface ReasoningUserConfig {
  /**
   * 控制模式（见 ReasoningControlMode 说明）
   */
  controlMode: ReasoningControlMode;

  /**
   * Effort 档位（当 controlMode 为 'effort' 或 'auto' 时使用）
   */
  effort?: ReasoningEffort;

  /**
   * 最大推理 tokens（当 controlMode 为 'max_tokens' 或 'auto' 时使用）
   * 
   * 语义根据模型类型：
   * - Anthropic/Gemini/Qwen: 硬预算上限
   * - OpenAI o-series/Grok: effort hint
   */
  maxReasoningTokens?: number;

  /**
   * 顶层 max_tokens（总输出预算，可选）
   * 
   * 若用户未设置，适配器会根据 Starverse 策略推导
   */
  maxCompletionTokens?: number;

  /**
   * 是否希望看到 reasoning 内容（前提：模型支持返回）
   * 
   * 映射到 reasoning.exclude 与 include_reasoning
   */
  showReasoningContent: boolean;
}

/**
 * 内部展开配置（适配器输入）
 * 
 * 所有 'auto' 已在上游化解，不含模糊状态
 */
export interface ReasoningResolvedConfig {
  /**
   * 控制模式（已排除 'auto'）
   */
  controlMode: Exclude<ReasoningControlMode, 'auto'>;

  effort?: ReasoningEffort;
  maxReasoningTokens?: number;
  maxCompletionTokens?: number;
  showReasoningContent: boolean;
}

// ========== 适配器输出（OpenRouter 请求体） ==========

/**
 * OpenRouter Reasoning Payload
 * 
 * 完全符合 OR 文档结构
 */
export interface ReasoningPayload {
  /**
   * 顶层 max_tokens（总输出上限）
   */
  max_tokens?: number;

  /**
   * OpenRouter reasoning 对象
   * 
   * 约束：effort 与 max_tokens 不能同时使用
   */
  reasoning?: {
    /**
     * Effort 档位（与 max_tokens 二选一）
     */
    effort?: ReasoningEffort;

    /**
     * 最大推理 tokens（与 effort 二选一）
     * 
     * 对不同模型的语义：
     * - Anthropic/Gemini/Qwen: 硬预算
     * - OpenAI o-series/Grok: effort hint
     */
    max_tokens?: number;

    /**
     * 是否从响应中排除 reasoning 内容（只用不显）
     */
    exclude?: boolean;

    /**
     * 快捷开关（仅在需要显式开启时使用）
     * 
     * 注意：OR 文档未定义 enabled:false 语义，通常不使用
     */
    enabled?: boolean;
  };

  /**
   * 旧式兼容参数（仅当模型支持时设置）
   */
  include_reasoning?: boolean;
}

// ========== Starverse 策略配置（非 OR 规范） ==========

/**
 * Starverse 默认策略配置
 * 
 * 这些配置不是 OR 官方规则，是 Starverse 的 engineering decision
 * 必须在设置界面与文档中明确说明
 */
export interface StarverseReasoningStrategy {
  /**
   * Anthropic 模型的 max_tokens 推导策略
   * 
   * 当用户未设置 maxCompletionTokens 时：
   * - 'proportional': max_tokens = reasoning.max_tokens * ratio + margin
   * - 'fixed-gap': max_tokens = reasoning.max_tokens + gap
   * - 'user-strict': 优先使用用户值，并校验大于 reasoning.max_tokens
   */
  anthropicCompletionStrategy: 'proportional' | 'fixed-gap' | 'user-strict';

  /**
   * proportional 策略的比例系数（默认 1.2）
   */
  anthropicProportionalRatio: number;

  /**
   * proportional 或 fixed-gap 策略的安全余量（默认 1024）
   */
  anthropicSafetyMargin: number;

  /**
   * 对 provider-unknown-range 模型的安全余量（默认 1024）
   * 
   * 用于 Gemini/Qwen 等模型：
   * maxAllowed = maxCompletionTokens - safetyMargin
   */
  allocationUnknownSafetyMargin: number;

  /**
   * Effort 模式下的 max_tokens 推导策略
   * 
   * - 'ratio': 模型上限的一定比例（例如 0.5）
   * - 'fixed': 固定值（例如 4096）
   * - 'provider-default': 使用 provider 的 maxCompletionTokens
   */
  effortCompletionStrategy: 'ratio' | 'fixed' | 'provider-default';

  /**
   * ratio 策略的比例系数（默认 0.5）
   */
  effortCompletionRatio: number;

  /**
   * fixed 策略的固定值（默认 4096）
   */
  effortCompletionFixed: number;
}

/**
 * 默认 Starverse 策略
 */
export const DEFAULT_STARVERSE_STRATEGY: StarverseReasoningStrategy = {
  anthropicCompletionStrategy: 'proportional',
  anthropicProportionalRatio: 1.2,
  anthropicSafetyMargin: 1024,
  allocationUnknownSafetyMargin: 1024,
  effortCompletionStrategy: 'ratio',
  effortCompletionRatio: 0.5,
  effortCompletionFixed: 4096,
};

/**
 * 默认用户配置
 */
export const DEFAULT_REASONING_CONFIG: ReasoningUserConfig = {
  controlMode: 'effort',
  effort: 'medium',
  showReasoningContent: false, // 默认隐藏推理内容（降低延迟）
};

// ========== UI Preset 映射（可选） ==========

/**
 * UI 层的推理预设 ID
 * 
 * 这些标签只在 UI 文案层使用，不影响核心类型
 */
export type ReasoningPresetId = 'minimal' | 'light' | 'balanced' | 'deep' | 'custom';

/**
 * Preset 到 UserConfig 的映射
 * 
 * 示例：让 UI 的"轻量/标准/深度"直接映射到 effort 档位
 */
export const REASONING_PRESETS: Record<ReasoningPresetId, Partial<ReasoningUserConfig>> = {
  minimal: {
    controlMode: 'effort',
    effort: 'minimal',
    showReasoningContent: false,
  },
  light: {
    controlMode: 'effort',
    effort: 'low',
    showReasoningContent: false,
  },
  balanced: {
    controlMode: 'effort',
    effort: 'medium',
    showReasoningContent: false,
  },
  deep: {
    controlMode: 'effort',
    effort: 'high',
    showReasoningContent: false,
  },
  custom: {
    controlMode: 'max_tokens',
    showReasoningContent: true,
  },
};

// ========== 辅助类型 ==========

/**
 * 适配器警告信息
 * 
 * 当 Starverse 策略做了自动调整时，返回警告提示 UI
 */
export interface ReasoningAdapterWarning {
  type: 'auto-adjusted' | 'clipped' | 'fallback' | 'unsupported';
  message: string;
  details?: Record<string, any>;
}

/**
 * 适配器返回结果
 */
export interface ReasoningAdapterResult {
  payload: ReasoningPayload;
  warnings: ReasoningAdapterWarning[];
}

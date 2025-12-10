/**
 * openrouterReasoningAdapter.ts - OpenRouter Reasoning 统一适配层
 * 
 * 职责：
 * - 将 Starverse 的 ReasoningUserConfig 映射到 OpenRouter 请求体
 * - 严格遵守 OR 文档的 reasoning 参数语义
 * - 区分"官方规则"与"Starverse 策略"
 * - 提供清晰的警告信息供 UI 展示
 * 
 * 设计原则（v2）：
 * - reasoning 对象中 effort 与 max_tokens 至多一个非空
 * - Anthropic [1024, 32000] 规则仅在 family='anthropic' 时生效
 * - 对 effort-only 模型不禁用 max_tokens（作为 hint 原样转发）
 * - 所有非官方行为通过 StarverseReasoningStrategy 暴露
 * 
 * 参考文档：
 * - https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
 */

import { DEFAULT_STARVERSE_STRATEGY } from '../../types/reasoning';
import type {
  ModelReasoningCapability,
  ReasoningResolvedConfig,
  ReasoningPayload,
  ReasoningAdapterResult,
  ReasoningAdapterWarning,
  StarverseReasoningStrategy,
} from '../../types/reasoning';

// ========== 主入口 ==========

/**
 * 构建 OpenRouter Reasoning Payload
 * 
 * @param capability - 模型推理能力（来自 modelStore，包含 modelId）
 * @param config - 已展开的推理配置（无 'auto'）
 * @param strategy - Starverse 策略配置（可选，默认使用 DEFAULT_STARVERSE_STRATEGY）
 * @returns Reasoning Payload 与警告信息
 */
export function buildReasoningPayload(
  capability: ModelReasoningCapability | null,
  config: ReasoningResolvedConfig,
  strategy: StarverseReasoningStrategy = DEFAULT_STARVERSE_STRATEGY,
): ReasoningAdapterResult {
  const warnings: ReasoningAdapterWarning[] = [];

  // ===== Class C：不支持 reasoning 参数 =====
  if (!capability || !capability.supportsReasoningParam) {
    return {
      payload: {},
      warnings: [
        {
          type: 'unsupported',
          message: '当前模型不支持显式 reasoning 参数',
          details: { modelId: capability?.modelId || 'unknown', supportsReasoningParam: false },
        },
      ],
    };
  }

  // ===== 初始化 payload =====
  const payload: ReasoningPayload = {};
  const reasoning: NonNullable<ReasoningPayload['reasoning']> = {};
  payload.reasoning = reasoning;

  // ===== 可见性设置（只影响 exclude/include_reasoning） =====
  reasoning.exclude = !config.showReasoningContent;

  if (capability.supportsIncludeReasoning) {
    payload.include_reasoning = config.showReasoningContent;
  }

  // ===== 控制模式分支 =====
  switch (config.controlMode) {
    case 'disabled':
      return handleDisabledMode(payload, reasoning, warnings);

    case 'effort':
      return handleEffortMode(payload, reasoning, config, capability, strategy, warnings);

    case 'max_tokens':
      return handleMaxTokensMode(payload, reasoning, config, capability, strategy, warnings);

    default:
      // 理论上不会出现（auto 已在上游化解）
      warnings.push({
        type: 'fallback',
        message: `未知控制模式: ${config.controlMode}，回退到 effort='medium'`,
      });
      reasoning.effort = 'medium';
      return { payload, warnings };
  }
}

// ========== 模式处理函数 ==========

/**
 * disabled 模式：禁用推理
 */
function handleDisabledMode(
  payload: ReasoningPayload,
  reasoning: NonNullable<ReasoningPayload['reasoning']>,
  warnings: ReasoningAdapterWarning[],
): ReasoningAdapterResult {
  reasoning.effort = 'none';
  // 不使用 enabled:false，避免依赖未定义语义
  return { payload, warnings };
}

/**
 * effort 模式：使用 effort 档位控制推理强度
 * 
 * 适用于所有支持 reasoning 的模型
 */
function handleEffortMode(
  payload: ReasoningPayload,
  reasoning: NonNullable<ReasoningPayload['reasoning']>,
  config: ReasoningResolvedConfig,
  capability: ModelReasoningCapability,
  strategy: StarverseReasoningStrategy,
  warnings: ReasoningAdapterWarning[],
): ReasoningAdapterResult {
  // 设置 effort（不设置 reasoning.max_tokens）
  reasoning.effort = config.effort ?? 'medium';

  // 顶层 max_tokens 策略（Starverse 行为）
  payload.max_tokens = chooseCompletionMaxTokensForEffort(
    config,
    capability,
    strategy,
    warnings,
  );

  return { payload, warnings };
}

/**
 * max_tokens 模式：使用 max_tokens 控制推理预算或作为 hint
 * 
 * 根据 maxTokensPolicy 决定具体行为
 */
function handleMaxTokensMode(
  payload: ReasoningPayload,
  reasoning: NonNullable<ReasoningPayload['reasoning']>,
  config: ReasoningResolvedConfig,
  capability: ModelReasoningCapability,
  strategy: StarverseReasoningStrategy,
  warnings: ReasoningAdapterWarning[],
): ReasoningAdapterResult {
  const requested = config.maxReasoningTokens;

  // 若用户未填写 maxReasoningTokens，退回到 effort 模式
  if (requested == null || requested <= 0) {
    warnings.push({
      type: 'fallback',
      message: '未设置 maxReasoningTokens，退回到 effort 模式',
    });
    reasoning.effort = config.effort ?? 'medium';
    payload.max_tokens = chooseCompletionMaxTokensForEffort(
      config,
      capability,
      strategy,
      warnings,
    );
    return { payload, warnings };
  }

  // 根据 maxTokensPolicy 路由
  switch (capability.maxTokensPolicy) {
    case 'anthropic-1024-32000':
      if (capability.family !== 'anthropic') {
        warnings.push({
          type: 'fallback',
          message: 'anthropic-1024-32000 ��·�����ڷ� Anthropic family������ provider ͨ��·��',
          details: { family: capability.family, policy: capability.maxTokensPolicy },
        });
        handleProviderUnknownRangeMaxTokens(payload, reasoning, requested, config, capability, strategy, warnings);
        break;
      }
      handleAnthropicMaxTokens(payload, reasoning, requested, config, capability, strategy, warnings);
      break;

    case 'provider-unknown-range':
      handleProviderUnknownRangeMaxTokens(payload, reasoning, requested, config, capability, strategy, warnings);
      break;

    case 'effort-only':
      handleEffortOnlyMaxTokens(payload, reasoning, requested, config, capability, strategy, warnings);
      break;
  }

  return { payload, warnings };
}

// ========== max_tokens 子策略（按 maxTokensPolicy） ==========

/**
 * Anthropic 策略：[1024, 32000] 裁剪 + 完成 token 推导
 * 
 * 官方规则：
 * - reasoning.max_tokens 裁剪到 [1024, 32000]
 * - max_tokens 必须 > reasoning.max_tokens
 * 
 * Starverse 策略（可配置）：
 * - 完成 token 的默认推导方式（proportional/fixed-gap/user-strict）
 */
function handleAnthropicMaxTokens(
  payload: ReasoningPayload,
  reasoning: NonNullable<ReasoningPayload['reasoning']>,
  requested: number,
  config: ReasoningResolvedConfig,
  capability: ModelReasoningCapability,
  _strategy: StarverseReasoningStrategy,
  warnings: ReasoningAdapterWarning[],
): void {
  // 官方规则：裁剪到 [1024, 32000]
  const clipped = clamp(requested, 1024, 32000);
  if (clipped !== requested) {
    warnings.push({
      type: 'clipped',
      message: `Anthropic 模型推理预算已裁剪到 [1024, 32000] 范围`,
      details: { requested, clipped },
    });
  }

  reasoning.max_tokens = clipped;
  // 不设置 reasoning.effort（与 max_tokens 互斥）

  // 顶层 max_tokens 推导（Starverse 策略）
  const providerCap = capability.maxCompletionTokens;
  const userMax = config.maxCompletionTokens;

  let completionMax = chooseCompletionMaxTokensForAnthropic(
    clipped,
    userMax,
    providerCap,
    _strategy,
    warnings,
  );

  if (completionMax != null && completionMax <= clipped) {
    const minNeeded = clipped + _strategy.anthropicSafetyMargin;
    const adjusted = providerCap != null ? Math.min(minNeeded, providerCap) : minNeeded;

    if (adjusted <= clipped) {
      warnings.push({
        type: 'auto-adjusted',
        message: '���� max_tokens �趨����Ϊ�� reasoning ��ֵ������Ϣ�޿���ܾ�',
        details: { clipped, providerCap },
      });
      completionMax = providerCap ?? minNeeded;
    } else {
      warnings.push({
        type: 'auto-adjusted',
        message: 'max_tokens �Ѿ�������֤���� reasoning ��������',
        details: { previous: completionMax, adjusted },
      });
      completionMax = adjusted;
    }
  }

  payload.max_tokens = completionMax;
}

/**
 * Gemini/Qwen 策略：provider-unknown-range
 * 
 * OR 文档未给出明确范围，只保证：
 * - 不超过 maxCompletionTokens - safetyMargin
 * - 不强加 Anthropic 的 [1024, 32000] 规则
 */
function handleProviderUnknownRangeMaxTokens(
  payload: ReasoningPayload,
  reasoning: NonNullable<ReasoningPayload['reasoning']>,
  requested: number,
  config: ReasoningResolvedConfig,
  capability: ModelReasoningCapability,
  strategy: StarverseReasoningStrategy,
  warnings: ReasoningAdapterWarning[],
): void {
  let value = requested;

  if (capability.maxCompletionTokens != null) {
    const safetyMargin = strategy.allocationUnknownSafetyMargin;
    const maxAllowed = Math.max(0, capability.maxCompletionTokens - safetyMargin);

    if (value > maxAllowed) {
      warnings.push({
        type: 'clipped',
        message: `推理预算已根据模型上限自动下调`,
        details: { requested: value, maxAllowed, safetyMargin },
      });
      value = maxAllowed;
    }
  }

  reasoning.max_tokens = value;

  // 顶层 max_tokens：优先用户设置，否则用 provider cap
  payload.max_tokens = config.maxCompletionTokens ?? capability.maxCompletionTokens ?? undefined;
}

/**
 * Effort-only 策略：max_tokens 作为 effort hint
 * 
 * OR 文档说明：
 * - 对只支持 effort 的模型，max_tokens 用于"决定 effort 档位"
 * - 不是硬预算，具体映射是黑箱
 * 
 * Starverse 行为：
 * - 忠实转发 max_tokens（仅确保不超过 provider cap）
 * - 不设置 reasoning.effort（由 OR 自行映射）
 */
function handleEffortOnlyMaxTokens(
  payload: ReasoningPayload,
  reasoning: NonNullable<ReasoningPayload['reasoning']>,
  requested: number,
  config: ReasoningResolvedConfig,
  capability: ModelReasoningCapability,
  _strategy: StarverseReasoningStrategy,
  warnings: ReasoningAdapterWarning[],
): void {
  const providerCap = capability.maxCompletionTokens;
  const appliedEffort = config.effort ?? 'medium';

  // ???? effort ??????????? max_tokens ????
  reasoning.effort = appliedEffort;

  let completionCap = config.maxCompletionTokens ?? requested;
  if (providerCap != null && completionCap != null && completionCap > providerCap) {
    warnings.push({
      type: 'clipped',
      message: '???? max_tokens ?????????????????????? cap??',
      details: { requested: completionCap, providerCap },
    });
    completionCap = providerCap;
  }

  payload.max_tokens = completionCap ?? providerCap ?? undefined;

  warnings.push({
    type: 'fallback',
    message: '???? effort-only ????max_tokens ?????????? effort ????????????????????????? provider cap??',
    details: {
      maxTokensPolicy: 'effort-only',
      appliedEffort,
      requested,
      providerCap,
      completionCap,
    },
  });
}

// ========== 辅助函数（Starverse 策略） ==========

/**
 * Effort 模式下的顶层 max_tokens 推导
 * 
 * Starverse 策略（可配置）：
 * - ratio: 模型上限的一定比例
 * - fixed: 固定值
 * - provider-default: 使用 provider 的 maxCompletionTokens
 */
function chooseCompletionMaxTokensForEffort(
  config: ReasoningResolvedConfig,
  capability: ModelReasoningCapability,
  strategy: StarverseReasoningStrategy,
  warnings: ReasoningAdapterWarning[],
): number | undefined {
  // 优先使用用户显式设置
  if (config.maxCompletionTokens != null) {
    return config.maxCompletionTokens;
  }

  const providerCap = capability.maxCompletionTokens;

  switch (strategy.effortCompletionStrategy) {
    case 'ratio':
      if (providerCap != null) {
        const value = Math.floor(providerCap * strategy.effortCompletionRatio);
        warnings.push({
          type: 'auto-adjusted',
          message: `max_tokens 已根据 Starverse 策略自动设置为模型上限的 ${strategy.effortCompletionRatio * 100}%`,
          details: { providerCap, ratio: strategy.effortCompletionRatio, value },
        });
        return value;
      }
      break;

    case 'fixed':
      warnings.push({
        type: 'auto-adjusted',
        message: `max_tokens 已根据 Starverse 策略设置为固定值`,
        details: { value: strategy.effortCompletionFixed },
      });
      return strategy.effortCompletionFixed;

    case 'provider-default':
      if (providerCap != null) {
        return providerCap;
      }
      break;
  }

  // 无法推导，返回 undefined（使用 OR 默认值）
  return undefined;
}

/**
 * Anthropic 模式下的顶层 max_tokens 推导
 * 
 * 官方约束：
 * - max_tokens 必须 > reasoning.max_tokens
 * 
 * Starverse 策略（可配置）：
 * - proportional: clipped * ratio + margin
 * - fixed-gap: clipped + gap
 * - user-strict: 优先用户值，并校验
 */
function chooseCompletionMaxTokensForAnthropic(
  clipped: number,
  userMax: number | undefined,
  providerCap: number | null,
  strategy: StarverseReasoningStrategy,
  warnings: ReasoningAdapterWarning[],
): number | undefined {
  switch (strategy.anthropicCompletionStrategy) {
    case 'user-strict':
      if (userMax != null) {
        if (userMax <= clipped) {
          warnings.push({
            type: 'auto-adjusted',
            message: `用户设置的 max_tokens (${userMax}) 小于等于 reasoning.max_tokens (${clipped})，已自动调整`,
            details: { userMax, clipped },
          });
          return clipped + strategy.anthropicSafetyMargin;
        }
        return userMax;
      }
      // 无用户设置，回退到 proportional
      break;

    case 'proportional': {
      const value = Math.ceil(clipped * strategy.anthropicProportionalRatio + strategy.anthropicSafetyMargin);
      const capped = providerCap != null ? Math.min(value, providerCap) : value;
      if (capped < value) {
        warnings.push({
          type: 'clipped',
          message: `max_tokens 已下调到模型上限`,
          details: { calculated: value, providerCap, capped },
        });
      }
      return capped;
    }

    case 'fixed-gap': {
      const value = clipped + strategy.anthropicSafetyMargin;
      const capped = providerCap != null ? Math.min(value, providerCap) : value;
      return capped;
    }
  }

  // 默认回退：clipped + 1024
  return clipped + 1024;
}

/**
 * 裁剪值到指定范围
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ========== 导出 ==========

export { DEFAULT_STARVERSE_STRATEGY } from '../../types/reasoning';

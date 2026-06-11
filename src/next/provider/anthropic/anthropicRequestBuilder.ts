/**
 * Anthropic Messages API request builder — pure function.
 *
 * Builds an Anthropic Messages API request body from provider-neutral input.
 * Anthropic-specific quirks stay here.
 *
 * @see https://docs.anthropic.com/en/api/messages
 */

import type { ProviderStreamConfig } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Anthropic request types — provider-native schema, contained here
// ---------------------------------------------------------------------------

export type AnthropicMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

export type AnthropicThinkingConfig = Readonly<{
  type: 'enabled'
  budget_tokens: number
}>

export type AnthropicRequest = Readonly<{
  model: string
  messages: ReadonlyArray<AnthropicMessage>
  max_tokens: number
  stream: true
  system?: string
  temperature?: number
  top_p?: number
  tools?: ReadonlyArray<unknown>
  thinking?: AnthropicThinkingConfig
}>

// ---------------------------------------------------------------------------
// Input type for the builder
// ---------------------------------------------------------------------------

export type AnthropicRequestInput = Readonly<{
  model: string
  messages: ReadonlyArray<AnthropicMessage>
  config: ProviderStreamConfig
  system?: string
  maxTokens?: number
}>

// ---------------------------------------------------------------------------
// buildAnthropicRequest — pure function
// ---------------------------------------------------------------------------

/**
 * Build an Anthropic Messages API request body.
 *
 * - `model`, `messages`, `max_tokens` are required.
 * - `stream: true` is always set.
 * - `system` is included only when present.
 * - `temperature`, `top_p` are included only when present.
 * - `tools` is passed through only when non-empty.
 * - `thinking` config is included only when reasoning mode is 'effort' and budget is set.
 * - No OpenRouter plugins, no provider.require_parameters, no DeepSeek reasoning_effort.
 */
export function buildAnthropicRequest(input: AnthropicRequestInput): AnthropicRequest {
  const { model, messages, config, system, maxTokens } = input

  // Resolve thinking budget first (may affect max_tokens)
  let thinkingConfig: AnthropicThinkingConfig | undefined
  if (config.requestedReasoningMode === 'effort') {
    const budgetTokens = resolveThinkingBudget(config.requestedReasoningEffort)
    if (budgetTokens !== undefined) {
      thinkingConfig = { type: 'enabled', budget_tokens: budgetTokens }
    }
  }

  // Compute max_tokens: must exceed thinking.budget_tokens when thinking is enabled
  const defaultMaxTokens = maxTokens ?? 4096
  const effectiveMaxTokens = thinkingConfig
    ? Math.max(defaultMaxTokens, thinkingConfig.budget_tokens + 1)
    : defaultMaxTokens

  const request: Record<string, unknown> = {
    model,
    messages,
    max_tokens: effectiveMaxTokens,
    stream: true,
  }

  // System prompt
  if (system && system.length > 0) {
    request.system = system
  }

  // Sampling params
  const sampling = config.samplingParams as Record<string, unknown> | undefined
  if (sampling) {
    if (typeof sampling.temperature === 'number') request.temperature = sampling.temperature
    if (typeof sampling.top_p === 'number') request.top_p = sampling.top_p
  }

  // Tools — pass-through only when non-empty
  if (config.tools && config.tools.length > 0) {
    request.tools = config.tools
  }

  // Thinking config
  if (thinkingConfig) {
    request.thinking = thinkingConfig
  }

  return request as AnthropicRequest
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveThinkingBudget(effort: string | undefined): number | undefined {
  switch (effort) {
    case 'low':
    case 'minimal':
      return 1024
    case 'medium':
      return 4096
    case 'high':
      return 16384
    case 'xhigh':
      return 32768
    default:
      return undefined
  }
}

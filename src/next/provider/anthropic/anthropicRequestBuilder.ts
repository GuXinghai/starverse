/**
 * Anthropic Messages API request builder — pure function.
 *
 * Builds an Anthropic Messages API request body from provider-neutral input.
 * Anthropic-specific quirks stay here.
 *
 * @see https://docs.anthropic.com/en/api/messages
 */

import type { ProviderStreamConfig } from '@/next/provider/providerTypes'
import { applyProviderGenerationParamsPatch } from '@/next/provider/providerGenerationParams'

// ---------------------------------------------------------------------------
// Anthropic request types — provider-native schema, contained here
// ---------------------------------------------------------------------------

export type AnthropicContentBlock = Readonly<Record<string, unknown>>

export type AnthropicMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string | ReadonlyArray<AnthropicContentBlock>
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
  top_k?: number
  tools?: ReadonlyArray<unknown>
  thinking?: AnthropicThinkingConfig
  output_config?: Readonly<Record<string, unknown>>
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
 * - Generation params are included only when present.
 * - `tools` is passed through only when non-empty.
 * - `thinking` config is included only through generationParams.
 * - No OpenRouter plugins, no provider.require_parameters, no DeepSeek reasoning_effort.
 */
export function buildAnthropicRequest(input: AnthropicRequestInput): AnthropicRequest {
  const { model, messages, config, system, maxTokens } = input

  const request: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens ?? 4096,
    stream: true,
  }

  // System prompt
  if (system && system.length > 0) {
    request.system = system
  }

  applyProviderGenerationParamsPatch({
    target: request,
    raw: config.generationParams,
    allowedKeys: new Set(['max_tokens', 'temperature', 'top_p', 'top_k', 'thinking', 'output_config']),
    providerLabel: 'Anthropic Messages',
  })
  enforceAnthropicThinkingBudgetInvariant(request)

  // Tools — pass-through only when non-empty
  if (config.tools && config.tools.length > 0) {
    request.tools = config.tools
  }

  return request as AnthropicRequest
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getGenerationParamThinkingBudget(request: Record<string, unknown>): number | undefined {
  const thinking = request.thinking
  if (!thinking || typeof thinking !== 'object' || Array.isArray(thinking)) return undefined
  const budget = (thinking as Record<string, unknown>).budget_tokens
  if (typeof budget !== 'number' || !Number.isFinite(budget)) return undefined
  return Math.trunc(budget)
}

function enforceAnthropicThinkingBudgetInvariant(request: Record<string, unknown>) {
  const budgetTokens = getGenerationParamThinkingBudget(request)
  if (budgetTokens === undefined) return
  const maxTokens = typeof request.max_tokens === 'number' && Number.isFinite(request.max_tokens)
    ? Math.trunc(request.max_tokens)
    : 4096
  if (maxTokens <= budgetTokens) {
    request.max_tokens = budgetTokens + 1
  }
}

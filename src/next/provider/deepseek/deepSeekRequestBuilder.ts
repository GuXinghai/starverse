/**
 * DeepSeek request builder — pure function.
 *
 * Builds a DeepSeek-compatible Chat Completions-style request body
 * from a provider-neutral input. DeepSeek quirks stay here.
 *
 * DeepSeek uses OpenAI-compatible transport but has its own parameter
 * conventions. This builder does NOT inject reasoning history into messages,
 * does NOT add OpenRouter plugin fields, and does NOT add provider.require_parameters.
 *
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md §4.5
 */

import type { ProviderStreamConfig } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// DeepSeek request types — provider-native schema, contained here only
// ---------------------------------------------------------------------------

export type DeepSeekMessage = Readonly<{
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
}>

export type DeepSeekRequest = Readonly<{
  model: string
  messages: ReadonlyArray<DeepSeekMessage>
  stream: true
  temperature?: number
  top_p?: number
  max_tokens?: number
  tools?: ReadonlyArray<unknown>
  reasoning_effort?: string
}>

// ---------------------------------------------------------------------------
// Input type for the builder
// ---------------------------------------------------------------------------

export type DeepSeekRequestInput = Readonly<{
  model: string
  messages: ReadonlyArray<DeepSeekMessage>
  config: ProviderStreamConfig
}>

// ---------------------------------------------------------------------------
// buildDeepSeekRequest — pure function
// ---------------------------------------------------------------------------

/**
 * Build a DeepSeek-compatible request body from provider-neutral input.
 *
 * - `model` and `messages` are required.
 * - Sampling params (temperature, top_p, max_tokens) are included only when present.
 * - `tools` is passed through only when present and non-empty.
 * - `reasoning_effort` is mapped from config.requestedReasoningEffort when mode is 'effort'.
 * - No OpenRouter plugins, no provider.require_parameters, no reasoning.exclude.
 */
export function buildDeepSeekRequest(input: DeepSeekRequestInput): DeepSeekRequest {
  const { model, messages, config } = input

  const request: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  }

  // Sampling params — only include when present
  const sampling = config.samplingParams as Record<string, unknown> | undefined
  if (sampling) {
    if (typeof sampling.temperature === 'number') request.temperature = sampling.temperature
    if (typeof sampling.top_p === 'number') request.top_p = sampling.top_p
    if (typeof sampling.max_tokens === 'number') request.max_tokens = sampling.max_tokens
  }

  // Tools — pass-through only when non-empty
  if (config.tools && config.tools.length > 0) {
    request.tools = config.tools
  }

  // Reasoning effort — DeepSeek uses reasoning_effort at top level
  // Only include when mode is 'effort' and effort is explicitly set
  if (config.requestedReasoningMode === 'effort' && config.requestedReasoningEffort) {
    request.reasoning_effort = config.requestedReasoningEffort
  }

  return request as DeepSeekRequest
}

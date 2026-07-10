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
import { applyProviderGenerationParamsPatch } from '@/next/provider/providerGenerationParams'

// ---------------------------------------------------------------------------
// DeepSeek request types — provider-native schema, contained here only
// ---------------------------------------------------------------------------

export type DeepSeekMessage = Readonly<{
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: ReadonlyArray<unknown>
}>

export type DeepSeekRequest = Readonly<{
  model: string
  messages: ReadonlyArray<DeepSeekMessage>
  stream: true
  temperature?: number
  top_p?: number
  max_tokens?: number
  tools?: ReadonlyArray<unknown>
  thinking?: Readonly<Record<string, unknown>>
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
 * - Generation params are included only when present.
 * - `tools` is passed through only when present and non-empty.
 * - `reasoning_effort` is included only through generationParams.
 * - No OpenRouter plugins, no provider.require_parameters, no reasoning.exclude.
 */
export function buildDeepSeekRequest(input: DeepSeekRequestInput): DeepSeekRequest {
  const { model, messages, config } = input

  const request: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  }

  applyProviderGenerationParamsPatch({
    target: request,
    raw: config.generationParams,
    allowedKeys: new Set(['temperature', 'top_p', 'max_tokens', 'thinking', 'reasoning_effort']),
    providerLabel: 'DeepSeek',
  })

  // Tools — pass-through only when non-empty
  if (config.tools && config.tools.length > 0) {
    request.tools = config.tools
  }

  return request as DeepSeekRequest
}

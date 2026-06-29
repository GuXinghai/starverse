/**
 * OpenAI Responses request builder — pure function.
 *
 * Builds an OpenAI Responses API request body from provider-neutral input.
 * Responses-specific quirks stay here.
 *
 * @see https://platform.openai.com/docs/api-reference/responses/create
 */

import type { ProviderStreamConfig } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// OpenAI Responses request types — provider-native schema, contained here
// ---------------------------------------------------------------------------

export type ResponsesInputContentPart = Readonly<
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; filename?: string; file_id?: string; file_data?: string; file_url?: string }
>

export type ResponsesInputMessage = Readonly<{
  role: 'user' | 'assistant' | 'system' | 'developer'
  content: string | ReadonlyArray<ResponsesInputContentPart>
  type?: 'message'
}>

export type ResponsesReasoningConfig = Readonly<{
  effort?: 'low' | 'medium' | 'high'
  summary?: 'auto' | 'none' | 'concise'
}>

export type ResponsesRequest = Readonly<{
  model: string
  input: string | ReadonlyArray<ResponsesInputMessage>
  stream: true
  reasoning?: ResponsesReasoningConfig
  max_output_tokens?: number
  tools?: ReadonlyArray<unknown>
  instructions?: string
}>

// ---------------------------------------------------------------------------
// Input type for the builder
// ---------------------------------------------------------------------------

export type ResponsesRequestInput = Readonly<{
  model: string
  messages: ReadonlyArray<ResponsesInputMessage>
  config: ProviderStreamConfig
  instructions?: string
}>

// ---------------------------------------------------------------------------
// buildResponsesRequest — pure function
// ---------------------------------------------------------------------------

/**
 * Build an OpenAI Responses API request body.
 *
 * - `model` and `messages` (as `input`) are required.
 * - `stream: true` is always set.
 * - `reasoning` config is included only when explicitly set.
 * - `max_output_tokens` is included only when present.
 * - `tools` is passed through only when non-empty.
 * - `instructions` is included only when present.
 * - No OpenRouter plugins, no provider.require_parameters, no DeepSeek reasoning_effort.
 */
export function buildResponsesRequest(input: ResponsesRequestInput): ResponsesRequest {
  const { model, messages, config, instructions } = input

  const request: Record<string, unknown> = {
    model,
    input: messages,
    stream: true,
  }

  // Instructions (system/developer message)
  if (instructions && instructions.length > 0) {
    request.instructions = instructions
  }

  // Reasoning config — only when mode is 'effort'
  if (config.requestedReasoningMode === 'effort') {
    const reasoning: Record<string, unknown> = {}
    if (config.requestedReasoningEffort) {
      // Map Starverse effort levels to Responses effort levels
      const effort = mapReasoningEffort(config.requestedReasoningEffort)
      if (effort) reasoning.effort = effort
    }
    // Default to concise summary for reasoning models
    reasoning.summary = 'concise'
    if (Object.keys(reasoning).length > 0) {
      request.reasoning = reasoning
    }
  }

  // Max output tokens
  const sampling = config.samplingParams as Record<string, unknown> | undefined
  if (sampling && typeof sampling.max_tokens === 'number') {
    request.max_output_tokens = sampling.max_tokens
  }

  // Tools — pass-through only when non-empty
  if (config.tools && config.tools.length > 0) {
    request.tools = config.tools
  }

  return request as ResponsesRequest
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mapReasoningEffort(effort: string): 'low' | 'medium' | 'high' | undefined {
  switch (effort) {
    case 'low':
    case 'minimal':
      return 'low'
    case 'medium':
      return 'medium'
    case 'high':
    case 'xhigh':
      return 'high'
    default:
      return undefined
  }
}

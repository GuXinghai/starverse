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

export type ResponsesImageGenerationTool = Readonly<{
  type: 'image_generation'
  size?: string
} & Record<string, unknown>>

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

  const tools = [
    ...(config.tools && config.tools.length > 0 ? config.tools : []),
    ...(config.imageGeneration ? [buildImageGenerationTool(config)] : []),
  ]
  if (tools.length > 0) {
    request.tools = tools
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

function buildImageGenerationTool(config: ProviderStreamConfig): ResponsesImageGenerationTool {
  const imageGeneration = config.imageGeneration
  const imageConfig = imageGeneration?.imageConfig && typeof imageGeneration.imageConfig === 'object' && !Array.isArray(imageGeneration.imageConfig)
    ? imageGeneration.imageConfig as Record<string, unknown>
    : {}

  const tool: Record<string, unknown> = {
    ...stripOpenRouterImageConfigAliases(imageConfig),
    type: 'image_generation',
  }
  const explicitSize = typeof imageConfig.size === 'string' ? imageConfig.size.trim() : ''
  if (explicitSize) {
    tool.size = explicitSize
  } else {
    const mappedSize = mapOpenAIImageToolSize({
      aspectRatio: imageGeneration?.aspectRatio ?? (typeof imageConfig.aspect_ratio === 'string' ? imageConfig.aspect_ratio : ''),
      imageSize: imageGeneration?.imageSize ?? (typeof imageConfig.image_size === 'string' ? imageConfig.image_size : ''),
    })
    if (mappedSize) tool.size = mappedSize
  }
  return tool as ResponsesImageGenerationTool
}

function stripOpenRouterImageConfigAliases(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'aspect_ratio' || key === 'image_size' || key === 'response_format') continue
    out[key] = item
  }
  return out
}

function mapOpenAIImageToolSize(input: Readonly<{ aspectRatio: unknown; imageSize: unknown }>): string | undefined {
  const imageSize = typeof input.imageSize === 'string' ? input.imageSize.trim() : ''
  if (imageSize && imageSize !== '1K') return undefined

  const aspectRatio = typeof input.aspectRatio === 'string' ? input.aspectRatio.trim() : ''
  if (aspectRatio === '3:4') return '1024x1536'
  if (aspectRatio === '4:3' || aspectRatio === '16:9') return '1536x1024'
  return '1024x1024'
}

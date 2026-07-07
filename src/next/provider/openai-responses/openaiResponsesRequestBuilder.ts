/**
 * OpenAI Responses request builder — pure function.
 *
 * Builds an OpenAI Responses API request body from provider-neutral input.
 * Responses-specific quirks stay here.
 *
 * @see https://platform.openai.com/docs/api-reference/responses/create
 */

import type { ProviderStreamConfig } from '@/next/provider/providerTypes'
import { applyProviderGenerationParamsPatch, asProviderGenerationParamsRecord } from '@/next/provider/providerGenerationParams'

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
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  summary?: 'auto' | 'none' | 'concise' | 'detailed'
}>

export type ResponsesImageGenerationTool = Readonly<{
  type: 'image_generation'
  size?: string
} & Record<string, unknown>>

export type ResponsesRequest = Readonly<{
  model: string
  input: string | ReadonlyArray<ResponsesInputMessage>
  stream: true
  temperature?: number
  top_p?: number
  reasoning?: ResponsesReasoningConfig
  max_output_tokens?: number
  text?: Readonly<{ verbosity?: 'low' | 'medium' | 'high' }>
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
 * - Generation params are included only when present.
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

  validateOpenAIResponsesGenerationParams(config.generationParams)
  applyProviderGenerationParamsPatch({
    target: request,
    raw: config.generationParams,
    allowedKeys: new Set(['temperature', 'top_p', 'max_output_tokens', 'reasoning', 'text']),
    providerLabel: 'OpenAI Responses',
  })

  const tools = [
    ...(config.tools && config.tools.length > 0 ? config.tools : []),
    ...(config.imageGeneration ? [buildImageGenerationTool(config)] : []),
  ]
  if (tools.length > 0) {
    request.tools = tools
  }

  return request as ResponsesRequest
}

function validateOpenAIResponsesGenerationParams(raw: unknown): void {
  const patch = asProviderGenerationParamsRecord(raw)
  if (!patch) return
  const reasoning = patch.reasoning
  if (!reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) return
  const effort = (reasoning as Record<string, unknown>).effort
  if (effort === 'auto') {
    throw new Error('OpenAI Responses generationParams.reasoning.effort=auto is not a wire value; omit reasoning.effort instead.')
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

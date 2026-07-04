/**
 * Gemini API request builder — pure function.
 *
 * Builds a Gemini generateContent-style request body from provider-neutral input.
 * Gemini-specific quirks stay here.
 *
 * @see https://ai.google.dev/api/generate-content
 */

import type { ProviderStreamConfig } from '@/next/provider/providerTypes'
import {
  buildGeminiNativeThinkingConfig,
  type GeminiNativeThinkingConfig,
} from '@/next/provider/gemini/geminiThinkingPolicy'
import {
  resolveGeminiImageGenerationPolicy,
  validateGeminiImageGenerationImageSize,
} from '@/next/provider/gemini/geminiImageGenerationPolicy'

// ---------------------------------------------------------------------------
// Gemini request types — provider-native schema, contained here
// ---------------------------------------------------------------------------

export type GeminiPart = Readonly<{
  text?: string
  inlineData?: Readonly<{ mimeType: string; data: string }>
  fileData?: Readonly<{ mimeType: string; fileUri: string }>
  functionCall?: Readonly<{ name: string; args?: unknown }>
  functionResponse?: Readonly<{ name: string; response: unknown }>
}>

export type GeminiContent = Readonly<{
  role: 'user' | 'model'
  parts: ReadonlyArray<GeminiPart>
}>

export type GeminiSystemInstruction = Readonly<{
  parts: ReadonlyArray<{ text: string }>
}>

export type GeminiGenerationConfig = Readonly<{
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  thinkingConfig?: GeminiNativeThinkingConfig
}>

export type GeminiTool = Readonly<{
  functionDeclarations?: ReadonlyArray<unknown>
}>

export type GeminiRequest = Readonly<{
  contents: ReadonlyArray<GeminiContent>
  systemInstruction?: GeminiSystemInstruction
  generationConfig?: GeminiGenerationConfig
  tools?: ReadonlyArray<GeminiTool>
}>

export type GeminiInteractionRequest = Readonly<{
  model: string
  input: string
  stream: true
  response_format: Readonly<{
    type: 'image'
    aspect_ratio?: string
    image_size?: string
  } & Record<string, unknown>>
  generation_config?: Readonly<{
    thinking_level?: string
    thinking_summaries?: 'auto'
  }>
}>

// ---------------------------------------------------------------------------
// Input type for the builder
// ---------------------------------------------------------------------------

export type GeminiRequestInput = Readonly<{
  model: string
  messages: ReadonlyArray<GeminiContent>
  config: ProviderStreamConfig
  systemInstruction?: string
}>

// ---------------------------------------------------------------------------
// buildGeminiRequest — pure function
// ---------------------------------------------------------------------------

/**
 * Build a Gemini generateContent request body.
 *
 * - `contents` is required.
 * - `systemInstruction` is included only when present.
 * - `generationConfig` fields are included only when present.
 * - `thinkingConfig` is included only from Gemini-native thinking config.
 * - `tools` is passed through only when non-empty.
 * - No OpenRouter plugins, no DeepSeek reasoning_effort, no Anthropic max_tokens.
 */
export function buildGeminiRequest(input: GeminiRequestInput): GeminiRequest {
  const { messages, config, systemInstruction } = input

  const request: Record<string, unknown> = {
    contents: messages,
  }

  // System instruction
  if (systemInstruction && systemInstruction.length > 0) {
    request.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  // Generation config
  const genConfig: Record<string, unknown> = {}
  const sampling = config.samplingParams as Record<string, unknown> | undefined
  if (sampling) {
    if (typeof sampling.temperature === 'number') genConfig.temperature = sampling.temperature
    if (typeof sampling.top_p === 'number') genConfig.topP = sampling.top_p
    if (typeof sampling.max_tokens === 'number') genConfig.maxOutputTokens = sampling.max_tokens
  }

  // Gemini-native thinking config. Do not map OpenAI/OpenRouter reasoning effort here.
  const thinkingConfig = buildGeminiNativeThinkingConfig({
    model: input.model,
    config: config.geminiThinking,
  })
  if (thinkingConfig) {
    genConfig.thinkingConfig = thinkingConfig
  }

  if (Object.keys(genConfig).length > 0) {
    request.generationConfig = genConfig
  }

  // Tools — pass-through only when non-empty
  if (config.tools && config.tools.length > 0) {
    request.tools = [{ functionDeclarations: config.tools }]
  }

  return request as GeminiRequest
}

export function buildGeminiImageGenerationInteractionRequest(input: GeminiRequestInput): GeminiInteractionRequest {
  const { messages, config } = input
  const imageGeneration = config.imageGeneration
  const imageConfig = imageGeneration?.imageConfig && typeof imageGeneration.imageConfig === 'object' && !Array.isArray(imageGeneration.imageConfig)
    ? imageGeneration.imageConfig as Record<string, unknown>
    : {}
  const nestedResponseFormat = imageConfig.response_format && typeof imageConfig.response_format === 'object' && !Array.isArray(imageConfig.response_format)
    ? imageConfig.response_format as Record<string, unknown>
    : {}

  const responseFormat: Record<string, unknown> = {
    ...nestedResponseFormat,
    type: 'image',
  }
  const aspectRatio = typeof imageGeneration?.aspectRatio === 'string' && imageGeneration.aspectRatio.trim()
    ? imageGeneration.aspectRatio.trim()
    : typeof imageConfig.aspect_ratio === 'string'
      ? imageConfig.aspect_ratio.trim()
      : ''
  const imageSize = typeof imageGeneration?.imageSize === 'string' && imageGeneration.imageSize.trim()
    ? imageGeneration.imageSize.trim()
    : typeof imageConfig.image_size === 'string'
      ? imageConfig.image_size.trim()
      : typeof nestedResponseFormat.image_size === 'string'
        ? nestedResponseFormat.image_size.trim()
        : ''
  const imageSizeValidation = validateGeminiImageGenerationImageSize({
    model: input.model,
    imageSize,
  })
  if (!imageSizeValidation.ok) {
    throw new Error(`Google AI Studio image size ${imageSize || '(empty)'} is not supported for ${input.model}. Supported sizes: ${imageSizeValidation.supportedImageSizes.join(', ')}.`)
  }
  if (aspectRatio) responseFormat.aspect_ratio = aspectRatio
  if (imageSize) responseFormat.image_size = imageSize

  const generationConfig = buildGeminiInteractionGenerationConfig(input)

  return {
    model: input.model.startsWith('models/') ? input.model : `models/${input.model}`,
    input: flattenGeminiPrompt(messages),
    stream: true,
    response_format: responseFormat as GeminiInteractionRequest['response_format'],
    ...(generationConfig ? { generation_config: generationConfig } : {}),
  }
}

function buildGeminiInteractionGenerationConfig(input: GeminiRequestInput): GeminiInteractionRequest['generation_config'] | undefined {
  const policy = resolveGeminiImageGenerationPolicy(input.model)
  const config = input.config.geminiThinking
  const out: Record<string, unknown> = {}
  if (
    policy.kind !== 'unsupported' &&
    policy.thinkingLevels.length > 0 &&
    config?.mode === 'level' &&
    typeof config.thinkingLevel === 'string' &&
    (policy.thinkingLevels as readonly string[]).includes(config.thinkingLevel)
  ) {
    out.thinking_level = config.thinkingLevel
  }
  if (policy.supportsThoughtSummaries && config?.includeThoughts === true) {
    out.thinking_summaries = 'auto'
  }
  return Object.keys(out).length > 0 ? out as GeminiInteractionRequest['generation_config'] : undefined
}

function flattenGeminiPrompt(messages: ReadonlyArray<GeminiContent>): string {
  return messages
    .map((message) =>
      (message.parts ?? [])
        .map((part) => typeof part.text === 'string' ? part.text : '')
        .join('\n')
        .trim()
    )
    .filter(Boolean)
    .join('\n\n')
}

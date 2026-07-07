/**
 * Gemini API request builder — pure function.
 *
 * Builds a Gemini generateContent-style request body from provider-neutral input.
 * Gemini-specific quirks stay here.
 *
 * @see https://ai.google.dev/api/generate-content
 */

import type { ProviderStreamConfig } from '@/next/provider/providerTypes'
import type { GeminiNativeThinkingConfig } from '@/next/provider/gemini/geminiThinkingPolicy'
import {
  normalizeGeminiImageGenerationModelId,
  resolveGeminiImageGenerationPolicy,
  validateGeminiImageGenerationAspectRatio,
  validateGeminiImageGenerationImageSize,
} from '@/next/provider/gemini/geminiImageGenerationPolicy'
import { asProviderGenerationParamsRecord } from '@/next/provider/providerGenerationParams'

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

export type GeminiInteractionImageResponseFormat = Readonly<{
  type: 'image'
  aspect_ratio?: string
  image_size?: string
}>

export type GeminiInteractionTextResponseFormat = Readonly<{
  type: 'text'
}>

export type GeminiInteractionRequest = Readonly<{
  model: string
  input: string
  stream: true
  response_format: GeminiInteractionImageResponseFormat | readonly [
    GeminiInteractionTextResponseFormat,
    GeminiInteractionImageResponseFormat,
  ]
  generation_config?: Readonly<{
    temperature?: number
    top_p?: number
    max_output_tokens?: number
    stop_sequences?: readonly string[]
    thinking_level?: string
    thinking_summaries?: 'auto'
  }>
  tools?: ReadonlyArray<Readonly<Record<string, unknown>>>
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
 * - `generationConfig` fields are included only when present in generationParams.
 * - text `thinkingConfig` is included only through generationParams.
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

  const genConfig: Record<string, unknown> = {}
  const generationParams = asProviderGenerationParamsRecord(config.generationParams)
  if (generationParams && Object.keys(generationParams).length > 0) {
    for (const key of Object.keys(generationParams)) {
      if (key !== 'generationConfig') {
        throw new Error(`Google AI Studio generationParams.${key} is not supported`)
      }
    }
    const nativeGenerationConfig = generationParams.generationConfig
    if (!nativeGenerationConfig || typeof nativeGenerationConfig !== 'object' || Array.isArray(nativeGenerationConfig)) {
      throw new Error('Google AI Studio generationParams.generationConfig must be an object')
    }
    Object.assign(genConfig, nativeGenerationConfig)
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
  const policy = resolveGeminiImageGenerationPolicy(input.model)
  if (policy.kind === 'unsupported') {
    throw new Error(`Google AI Studio image generation is not supported for ${input.model}.`)
  }

  const imageEntry: Record<string, unknown> = {
    type: 'image',
  }

  const requestedAspectRatio = typeof imageGeneration?.aspectRatio === 'string' && imageGeneration.aspectRatio.trim()
    ? imageGeneration.aspectRatio.trim()
    : policy.defaultAspectRatio
  const aspectRatio = requestedAspectRatio === 'auto' ? '' : requestedAspectRatio
  const aspectRatioValidation = validateGeminiImageGenerationAspectRatio({
    model: input.model,
    aspectRatio: requestedAspectRatio,
  })
  if (!aspectRatioValidation.ok) {
    throw new Error(`Google AI Studio aspect ratio ${requestedAspectRatio || '(empty)'} is not supported for ${input.model}. Supported aspect ratios: ${aspectRatioValidation.supportedAspectRatios.join(', ')}.`)
  }

  const requestedImageSize = typeof imageGeneration?.imageSize === 'string' && imageGeneration.imageSize.trim()
    ? imageGeneration.imageSize.trim()
    : policy.defaultImageSize
  const imageSizeValidation = validateGeminiImageGenerationImageSize({
    model: input.model,
    imageSize: policy.imageSizeMode === 'hidden' ? undefined : requestedImageSize,
  })
  if (!imageSizeValidation.ok) {
    throw new Error(`Google AI Studio image size ${requestedImageSize || '(empty)'} is not supported for ${input.model}. Supported sizes: ${imageSizeValidation.supportedImageSizes.join(', ')}.`)
  }
  if (aspectRatio) imageEntry.aspect_ratio = aspectRatio
  if (policy.imageSizeMode !== 'hidden') imageEntry.image_size = requestedImageSize

  const generationConfig = buildGeminiInteractionGenerationConfig(input, policy)
  const tools = buildGeminiInteractionTools(input, policy)
  const outputMode = imageGeneration?.outputMode === 'image_only' ? 'image_only' : 'image_and_text'
  const responseFormat = outputMode === 'image_only'
    ? imageEntry as GeminiInteractionImageResponseFormat
    : [
        { type: 'text' },
        imageEntry as GeminiInteractionImageResponseFormat,
      ] as const

  return {
    model: `models/${normalizeGeminiImageGenerationModelId(input.model)}`,
    input: flattenGeminiPrompt(messages),
    stream: true,
    response_format: responseFormat,
    ...(generationConfig ? { generation_config: generationConfig } : {}),
    ...(tools.length > 0 ? { tools } : {}),
  }
}

function buildGeminiInteractionGenerationConfig(
  input: GeminiRequestInput,
  policy: ReturnType<typeof resolveGeminiImageGenerationPolicy>,
): GeminiInteractionRequest['generation_config'] | undefined {
  const generationParams = asProviderGenerationParamsRecord(input.config.generationParams)
  const rawGenerationConfig = generationParams?.generation_config
  const out: Record<string, unknown> = {}
  if (rawGenerationConfig !== undefined) {
    if (!rawGenerationConfig || typeof rawGenerationConfig !== 'object' || Array.isArray(rawGenerationConfig)) {
      throw new Error('Google AI Studio image generation generationParams.generation_config must be an object.')
    }
    for (const [key, value] of Object.entries(rawGenerationConfig as Record<string, unknown>)) {
      if (key === 'thinking_summaries' && value === 'none') continue
      if (key === 'thinking_summaries') {
        if (value !== 'auto') throw new Error('Google AI Studio image generation thinking_summaries must be auto or none.')
        if (!policy.supportsThoughtSummaries) throw new Error(`Google AI Studio ${input.model} does not support thought summaries.`)
        out.thinking_summaries = 'auto'
        continue
      }
      if (key === 'thinking_level') {
        if (typeof value !== 'string' || !(policy.thinkingLevels as readonly string[]).includes(value)) {
          throw new Error(`Google AI Studio thinking level ${String(value)} is not supported for ${input.model}.`)
        }
        out.thinking_level = value
        continue
      }
      if (key === 'temperature') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2) {
          throw new Error('Google AI Studio image generation temperature must be between 0 and 2.')
        }
        out.temperature = value
        continue
      }
      if (key === 'top_p') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
          throw new Error('Google AI Studio image generation top_p must be between 0 and 1.')
        }
        out.top_p = value
        continue
      }
      if (key === 'max_output_tokens') {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > policy.maxOutputTokens) {
          throw new Error(`Google AI Studio image generation max_output_tokens must be between 0 and ${policy.maxOutputTokens}.`)
        }
        out.max_output_tokens = value
        continue
      }
      if (key === 'stop_sequences') {
        if (!policy.supportsStopSequences) throw new Error(`Google AI Studio ${input.model} does not support stop sequences.`)
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
          throw new Error('Google AI Studio image generation stop_sequences must be a string array.')
        }
        out.stop_sequences = value.map((item) => item.trim())
        continue
      }
      throw new Error(`Google AI Studio image generation generation_config.${key} is not supported.`)
    }
  }
  for (const key of Object.keys(generationParams ?? {})) {
    if (key !== 'generation_config' && key !== 'tools') {
      throw new Error(`Google AI Studio image generation generationParams.${key} is not supported.`)
    }
  }
  return Object.keys(out).length > 0 ? out as GeminiInteractionRequest['generation_config'] : undefined
}

function buildGeminiInteractionTools(
  input: GeminiRequestInput,
  policy: ReturnType<typeof resolveGeminiImageGenerationPolicy>,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const generationParams = asProviderGenerationParamsRecord(input.config.generationParams)
  const rawTools = generationParams?.tools
  if (rawTools === undefined) return []
  if (!rawTools || typeof rawTools !== 'object' || Array.isArray(rawTools)) {
    throw new Error('Google AI Studio image generation generationParams.tools must be an object.')
  }
  const record = rawTools as Record<string, unknown>
  const tools: Record<string, unknown>[] = []
  for (const key of Object.keys(record)) {
    const enabled = record[key] === true
    if (record[key] !== true && record[key] !== false) {
      throw new Error(`Google AI Studio image generation tools.${key} must be boolean.`)
    }
    if (key === 'google_search') {
      if (enabled && !policy.supportsGoogleSearch) throw new Error(`Google AI Studio ${input.model} does not support Google Search grounding.`)
      if (enabled) tools.push({ google_search: {} })
      continue
    }
    if (key === 'image_search') {
      if (enabled && !policy.supportsImageSearch) throw new Error(`Google AI Studio ${input.model} does not support Image Search grounding.`)
      if (enabled) tools.push({ image_search: {} })
      continue
    }
    throw new Error(`Google AI Studio image generation tools.${key} is not supported.`)
  }
  return tools
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

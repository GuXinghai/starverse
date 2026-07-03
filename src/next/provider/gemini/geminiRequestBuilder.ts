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

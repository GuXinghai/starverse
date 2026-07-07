/**
 * Generic OpenAI-compatible Chat Completions request builder — pure function.
 *
 * Builds a minimal OpenAI-compatible request body for long-tail/custom endpoints.
 * Conservative capability: text chat + basic streaming, with image_url
 * content parts only when an explicit Generic image input profile allows them.
 *
 * Unsupported by default: tools, functions, response_format, reasoning,
 * web_search, plugins, files/attachments, and non-profile-gated multimodal.
 */

import type { ProviderStreamConfig } from '@/next/provider/providerTypes'
import { applyProviderGenerationParamsPatch } from '@/next/provider/providerGenerationParams'
import type { OpenAICompatibleChatContentPart } from '@/next/multimodal/providerRuntimeContentBlocks'

export type GenericMessage = Readonly<{
  role: 'system' | 'user' | 'assistant'
  content: string | ReadonlyArray<OpenAICompatibleChatContentPart>
}>

export type GenericRequest = Readonly<{
  model: string
  messages: ReadonlyArray<GenericMessage>
  stream: true
  temperature?: number
  top_p?: number
  max_tokens?: number
  max_completion_tokens?: number
  presence_penalty?: number
  frequency_penalty?: number
  user?: string
}>

export type GenericRequestInput = Readonly<{
  model: string
  messages: ReadonlyArray<GenericMessage>
  config: ProviderStreamConfig
  user?: string
}>

/**
 * Build a minimal OpenAI-compatible Chat Completions request body.
 *
 * - `model`, `messages` are required.
 * - `stream: true` is always set.
 * - Generation params are included only when present.
 * - `user` included only when provided.
 * - No tools, functions, response_format, reasoning, web_search, plugins,
 *   files/attachments, or non-profile-gated multimodal.
 */
export function buildGenericRequest(input: GenericRequestInput): GenericRequest {
  const { model, messages, config, user } = input

  const request: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  }

  applyProviderGenerationParamsPatch({
    target: request,
    raw: config.generationParams,
    allowedKeys: new Set([
      'temperature',
      'top_p',
      'max_tokens',
      'max_completion_tokens',
      'presence_penalty',
      'frequency_penalty',
    ]),
    providerLabel: 'Generic OpenAI-compatible',
  })

  if (user && user.length > 0) {
    request.user = user
  }

  return request as GenericRequest
}

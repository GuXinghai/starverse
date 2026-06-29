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
 * - `temperature`, `top_p`, `max_tokens` included only when present in samplingParams.
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

  const sampling = config.samplingParams as Record<string, unknown> | undefined
  if (sampling) {
    if (typeof sampling.temperature === 'number') request.temperature = sampling.temperature
    if (typeof sampling.top_p === 'number') request.top_p = sampling.top_p
    if (typeof sampling.max_tokens === 'number') request.max_tokens = sampling.max_tokens
  }

  if (user && user.length > 0) {
    request.user = user
  }

  return request as GenericRequest
}

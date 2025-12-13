/**
 * OpenRouter Generation API Client
 *
 * SSOT Reference: docs/open_router_流式回复与推理_ssot（v_2_）.md
 * - Section 2: "响应的 id 视为 generation id，用于调用 /api/v1/generation?id=... 获取更精确统计"
 *
 * @see https://openrouter.ai/docs/api/api-reference/generations/get-generation
 */

export interface GenerationInfo {
  /** The generation ID */
  id: string
  /** Total cost in USD */
  total_cost: number
  /** Model used for generation */
  model: string
  /** Provider (optional, e.g. "OpenAI") */
  provider?: string
  /** Whether the request was streamed */
  streamed: boolean
  /** Generation time in ms */
  generation_time: number
  /** Timestamp when the generation was created */
  created_at: string
  /** Number of prompt tokens (OpenRouter unified) */
  tokens_prompt: number
  /** Number of completion tokens (OpenRouter unified) */
  tokens_completion: number
  /** Native prompt tokens (provider-specific, may differ) */
  native_tokens_prompt?: number
  /** Native completion tokens (provider-specific, may differ) */
  native_tokens_completion?: number
  /** Number of media items in prompt (for multimodal) */
  num_media_prompt?: number
  /** Number of media items in completion (for multimodal) */
  num_media_completion?: number
  /** Finish reason */
  finish_reason?: string
  /** Error info if generation failed */
  error?: {
    code: number
    message: string
  }
}

export interface FetchGenerationOptions {
  /** Base URL for OpenRouter API (default: https://openrouter.ai/api/v1) */
  baseUrl?: string
  /** AbortSignal for request cancellation */
  signal?: AbortSignal
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'

/**
 * Fetch generation metadata from OpenRouter API.
 *
 * @param generationId - The generation ID returned in response headers or body
 * @param apiKey - OpenRouter API key
 * @param opts - Optional configuration
 * @returns GenerationInfo with usage and metadata
 * @throws Error if response is not ok (includes status and statusText)
 */
export async function fetchGenerationInfo(
  generationId: string,
  apiKey: string,
  opts?: FetchGenerationOptions
): Promise<GenerationInfo> {
  const baseUrl = opts?.baseUrl ?? DEFAULT_BASE_URL
  const url = `${baseUrl}/generation?id=${encodeURIComponent(generationId)}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: opts?.signal,
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch generation info: ${response.status} ${response.statusText}`
    )
  }

  const data = await response.json()
  return data.data as GenerationInfo
}

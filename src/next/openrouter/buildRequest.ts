export type OpenRouterReasoningEffort =
  | 'xhigh'
  | 'high'
  | 'medium'
  | 'low'
  | 'minimal'
  | 'none'

export type OpenRouterReasoningInput =
  | {
      effort: OpenRouterReasoningEffort
      exclude?: boolean
    }
  | {
      max_tokens: number
      exclude?: boolean
    }

export type BuildOpenRouterRequestInput = Readonly<{
  model: string
  messages: ReadonlyArray<unknown>
  stream: boolean
  reasoning?: OpenRouterReasoningInput
  tools?: unknown[]
  /**
   * OpenRouter provider routing parameter.
   * Body field is snake_case: provider.require_parameters.
   * Default: false (keeps legacy behavior).
   */
  providerRequireParameters?: boolean
}>

export type OpenRouterChatCompletionsRequest = Readonly<{
  model: string
  messages: ReadonlyArray<unknown>
  stream: boolean
  reasoning?: Record<string, unknown>
  tools?: unknown[]
  provider?: { require_parameters: boolean }
}>

function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be boolean`)
  }
}

function assertPositiveInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

/**
 * Pure request builder for OpenRouter Chat Completions.
 *
 * Rules (SSOT-aligned):
 * - `stream` must be boolean (reject "true"/"false" strings)
 * - `reasoning` only concerns request payload, never UI display
 * - `reasoning.effort = "none"` is the only definition of "disable reasoning", and must not be combined with `max_tokens`
 * - `effort` and `max_tokens` are treated as mutually exclusive control modes
 */
export function buildOpenRouterChatCompletionsRequest(
  input: BuildOpenRouterRequestInput
): OpenRouterChatCompletionsRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('input is required')
  }
  if (!input.model || typeof input.model !== 'string') {
    throw new Error('model is required')
  }
  if (!Array.isArray(input.messages)) {
    throw new Error('messages must be an array')
  }
  assertBoolean(input.stream, 'stream')

  const request: {
    model: string
    messages: unknown[]
    stream: boolean
    reasoning?: Record<string, unknown>
    tools?: unknown[]
    provider?: { require_parameters: boolean }
  } = {
    model: input.model,
    messages: input.messages,
    stream: input.stream,
  }

  if (input.providerRequireParameters !== undefined) {
    assertBoolean(input.providerRequireParameters, 'providerRequireParameters')
    request.provider = { require_parameters: input.providerRequireParameters }
  }

  if (input.tools !== undefined) {
    if (!Array.isArray(input.tools)) {
      throw new Error('tools must be an array')
    }
    request.tools = input.tools
  }

  if (input.reasoning) {
    const reasoning = input.reasoning as Record<string, unknown>
    const hasEffort = 'effort' in reasoning
    const hasMaxTokens = 'max_tokens' in reasoning

    const modeCount = [hasEffort, hasMaxTokens].filter(Boolean).length
    if (modeCount !== 1) {
      throw new Error('reasoning must specify exactly one of effort/max_tokens')
    }

    if ('exclude' in reasoning && typeof reasoning.exclude !== 'boolean') {
      throw new Error('reasoning.exclude must be boolean')
    }

    if (hasEffort) {
      const effort = reasoning.effort
      if (
        effort !== 'xhigh' &&
        effort !== 'high' &&
        effort !== 'medium' &&
        effort !== 'low' &&
        effort !== 'minimal' &&
        effort !== 'none'
      ) {
        throw new Error('reasoning.effort is invalid')
      }
      const exclude = effort === 'none' ? undefined : ('exclude' in reasoning ? reasoning.exclude : undefined)
      request.reasoning = exclude === undefined ? { effort } : { effort, exclude }
    }

    if (hasMaxTokens) {
      assertPositiveInteger(reasoning.max_tokens, 'reasoning.max_tokens')
      request.reasoning = reasoning.exclude === undefined ? { max_tokens: reasoning.max_tokens } : { max_tokens: reasoning.max_tokens, exclude: reasoning.exclude }
    }
  }

  return request
}

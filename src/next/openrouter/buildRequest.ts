export type OpenRouterReasoningEffort =
  | 'xhigh'
  | 'high'
  | 'medium'
  | 'low'
  | 'minimal'
  | 'none'

export type OpenRouterReasoningInput =
  | {
      enabled: true
      exclude?: boolean
    }
  | {
      effort: OpenRouterReasoningEffort
      exclude?: boolean
    }
  | {
      max_tokens: number
      exclude?: boolean
    }

export type OpenRouterUsageInput = Readonly<{
  include?: boolean
}>

export type BuildOpenRouterRequestInput = Readonly<{
  model: string
  messages: unknown[]
  stream: boolean
  usage?: OpenRouterUsageInput
  reasoning?: OpenRouterReasoningInput
  tools?: unknown[]
}>

export type OpenRouterChatCompletionsRequest = Readonly<{
  model: string
  messages: unknown[]
  stream: boolean
  usage: { include: boolean }
  reasoning?: Record<string, unknown>
  tools?: unknown[]
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
 * - `usage.include` defaults to true, and is always explicitly set in the output
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

  const usageInclude = input.usage?.include ?? true
  assertBoolean(usageInclude, 'usage.include')

  const request: {
    model: string
    messages: unknown[]
    stream: boolean
    usage: { include: boolean }
    reasoning?: Record<string, unknown>
    tools?: unknown[]
  } = {
    model: input.model,
    messages: input.messages,
    stream: input.stream,
    usage: { include: usageInclude },
  }

  if (input.tools !== undefined) {
    if (!Array.isArray(input.tools)) {
      throw new Error('tools must be an array')
    }
    request.tools = input.tools
  }

  if (input.reasoning) {
    const reasoning = input.reasoning as Record<string, unknown>
    const hasEnabled = 'enabled' in reasoning
    const hasEffort = 'effort' in reasoning
    const hasMaxTokens = 'max_tokens' in reasoning

    const modeCount = [hasEnabled, hasEffort, hasMaxTokens].filter(Boolean).length
    if (modeCount !== 1) {
      throw new Error('reasoning must specify exactly one of enabled/effort/max_tokens')
    }

    if ('exclude' in reasoning && typeof reasoning.exclude !== 'boolean') {
      throw new Error('reasoning.exclude must be boolean')
    }

    if (hasEnabled) {
      if (reasoning.enabled !== true) {
        throw new Error('reasoning.enabled must be true when present')
      }
      request.reasoning = reasoning.exclude === undefined ? { enabled: true } : { enabled: true, exclude: reasoning.exclude }
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
      if (effort === 'none' && hasMaxTokens) {
        throw new Error('reasoning.effort="none" must not be combined with max_tokens')
      }
      request.reasoning = reasoning.exclude === undefined ? { effort } : { effort, exclude: reasoning.exclude }
    }

    if (hasMaxTokens) {
      assertPositiveInteger(reasoning.max_tokens, 'reasoning.max_tokens')
      request.reasoning = reasoning.exclude === undefined ? { max_tokens: reasoning.max_tokens } : { max_tokens: reasoning.max_tokens, exclude: reasoning.exclude }
    }
  }

  return request
}

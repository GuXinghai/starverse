export const GENERATION_V2_PROVIDER_OUTPUT_INCOMPLETE = 'GENERATION_V2_PROVIDER_OUTPUT_INCOMPLETE'
export const GENERATION_V2_PROVIDER_OUTPUT_BLOCKED = 'GENERATION_V2_PROVIDER_OUTPUT_BLOCKED'

// Provider finish reasons that end a stream normally but leave the answer cut
// short or withheld. Such an answer must not be recorded as completed (P4a-15, D-4).
const INCOMPLETE_FINISH_REASONS = new Set([
  'length', 'max_tokens', 'MAX_TOKENS', 'insufficient_system_resource', 'error',
])
const BLOCKED_FINISH_REASONS = new Set([
  'content_filter', 'refusal', 'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY',
])

export function incompleteProviderFinishV2(
  finishReason: string | null | undefined,
): Readonly<{ code: string; message: string }> | null {
  if (typeof finishReason !== 'string') return null
  if (INCOMPLETE_FINISH_REASONS.has(finishReason)) {
    return Object.freeze({ code: GENERATION_V2_PROVIDER_OUTPUT_INCOMPLETE,
      message: `The provider stopped before the response was finished (${finishReason}).` })
  }
  if (BLOCKED_FINISH_REASONS.has(finishReason)) {
    return Object.freeze({ code: GENERATION_V2_PROVIDER_OUTPUT_BLOCKED,
      message: `The provider blocked or refused the response (${finishReason}).` })
  }
  return null
}

/** Turns a completed terminal with an incomplete finish reason into a failed one. */
export function settleProviderFinishV2<State extends 'completed' | 'failed' | 'cancelled'>(input: Readonly<{
  state: State
  finishReason: string | null | undefined
  errorCode: string | null
  errorMessage: string | null
}>): Readonly<{ state: State | 'failed'; errorCode: string | null; errorMessage: string | null }> {
  const incomplete = input.state === 'completed' ? incompleteProviderFinishV2(input.finishReason) : null
  return incomplete
    ? Object.freeze({ state: 'failed' as const, errorCode: incomplete.code, errorMessage: incomplete.message })
    : Object.freeze({ state: input.state, errorCode: input.errorCode, errorMessage: input.errorMessage })
}

import type { MessageVM, ReasoningViewVisibility, RootState, RunVM } from './types'

export function selectRun(state: RootState, runId: string): RunVM | null {
  const s = state.runs[runId]
  if (!s) return null
  return {
    runId: s.runId,
    status: s.status,
    requestId: s.requestId,
    generationId: s.generationId,
    model: s.model,
    provider: s.provider,
    finishReason: s.finishReason,
    nativeFinishReason: s.nativeFinishReason,
    usage: s.usage,
    error: s.error,
  }
}

/**
 * Compute reasoning visibility based on SSOT Section 3.4 rules:
 * - 'shown': has encrypted reasoning OR has reasoning_details/raw content
 * - 'excluded': request had reasoning.exclude=true AND no reasoning returned (intentional hide)
 * - 'not_returned': no exclude requested but model didn't return reasoning (provider didn't provide)
 *
 * CRITICAL: We NEVER infer 'encrypted' from empty reasoning. Encrypted is only set
 * when we see explicit `reasoning.encrypted` type in the response.
 */
function computeReasoningVisibility(
  hasEncryptedReasoning: boolean,
  reasoningDetailsRaw: unknown[],
  requestedReasoningExclude?: boolean
): ReasoningViewVisibility {
  // If we have encrypted signal or actual reasoning content → shown
  if (hasEncryptedReasoning || reasoningDetailsRaw.length > 0) {
    return 'shown'
  }
  // No reasoning content: distinguish excluded vs not_returned
  if (requestedReasoningExclude === true) {
    return 'excluded'
  }
  return 'not_returned'
}

function deriveReasoningDisplayFromDetails(reasoningDetailsRaw: unknown[]): {
  summaryText?: string
  reasoningText?: string
} {
  let summaryText: string | undefined
  const reasoningTextParts: string[] = []

  for (const detail of reasoningDetailsRaw) {
    if (!detail || typeof detail !== 'object') continue
    const type = (detail as any).type

    if (type === 'reasoning.text') {
      const text = (detail as any).text
      if (typeof text === 'string' && text.length > 0) reasoningTextParts.push(text)
      continue
    }

    if (type === 'reasoning.summary') {
      const summary = (detail as any).summary ?? (detail as any).text
      if (typeof summary === 'string' && summary.length > 0) summaryText = summary
      continue
    }
  }

  const reasoningText = reasoningTextParts.length > 0 ? reasoningTextParts.join('') : undefined
  return { summaryText, reasoningText }
}

export function selectMessage(state: RootState, messageId: string): MessageVM | null {
  const m = state.messages[messageId]
  if (!m) return null

  const derived = deriveReasoningDisplayFromDetails(m.reasoningDetailsRaw)
  const summaryText = m.reasoningSummaryText ?? derived.summaryText
  const reasoningText = derived.reasoningText ?? m.reasoningStreamingText

  const visibility = computeReasoningVisibility(
    m.hasEncryptedReasoning,
    m.reasoningDetailsRaw,
    m.requestedReasoningExclude
  )

  return {
    messageId: m.messageId,
    role: m.role,
    contentBlocks: m.contentBlocks,
    toolCalls: m.toolCalls,
    reasoningView: {
      summaryText,
      reasoningText,
      hasEncrypted: m.hasEncryptedReasoning,
      visibility,
      panelState: m.reasoningPanelState,
    },
    streaming: m.streaming,
  }
}

export function selectTranscript(state: RootState, runId: string): MessageVM[] {
  const ids = state.runMessageIds[runId] || []
  return ids.map((id) => selectMessage(state, id)).filter((m): m is MessageVM => !!m)
}

export type TokenUsage = Readonly<{
  promptTokens: number
  completionTokens: number
  totalTokens: number
}>

function normalizeTokenUsage(usage: unknown): TokenUsage | null {
  if (!usage || typeof usage !== 'object') return null
  const u = usage as any

  const promptTokens = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : null
  const completionTokens = typeof u.completion_tokens === 'number' ? u.completion_tokens : null
  const totalTokens = typeof u.total_tokens === 'number' ? u.total_tokens : null

  if (promptTokens == null && completionTokens == null && totalTokens == null) return null

  return {
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    totalTokens: totalTokens ?? 0,
  }
}

export function selectUsageThisTurn(state: RootState, runId: string): TokenUsage | null {
  const run = state.runs[runId]
  if (!run) return null
  return normalizeTokenUsage(run.usage)
}

export function selectUsageSessionTotalDerived(state: RootState): TokenUsage | null {
  let sumPrompt = 0
  let sumCompletion = 0
  let sumTotal = 0
  let hasAny = false

  for (const runId of Object.keys(state.runs)) {
    const run = state.runs[runId]
    const u = normalizeTokenUsage(run?.usage)
    if (!u) continue
    hasAny = true
    sumPrompt += u.promptTokens
    sumCompletion += u.completionTokens
    sumTotal += u.totalTokens
  }

  if (!hasAny) return null
  return { promptTokens: sumPrompt, completionTokens: sumCompletion, totalTokens: sumTotal }
}

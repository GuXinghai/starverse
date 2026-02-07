export type MessageMeta = Record<string, unknown> | null

export const safeParseMessageMeta = (input: string): MessageMeta => {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

export const mergeMetaWithReasoning = (
  meta: MessageMeta,
  reasoningJson: unknown,
  requestJson: unknown,
  reasoningDurationMs?: number | null,
  reasoningEndReason?: string | null,
  reasoningDurationIsFallback?: number | null,
): MessageMeta => {
  const next: Record<string, unknown> = meta ? { ...meta } : {}

  if (typeof reasoningJson === 'string' && reasoningJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(reasoningJson)
      if (Array.isArray(parsed) && !next.reasoningDetailsRaw) {
        next.reasoningDetailsRaw = parsed
      }
    } catch {
      // ignore parse errors
    }
  }

  if (typeof requestJson === 'string' && requestJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(requestJson)
      if (parsed && typeof parsed === 'object') {
        next.requestReasoningConfig = parsed
      }
    } catch {
      // ignore parse errors
    }
  }

  if (typeof reasoningDurationMs === 'number' && Number.isFinite(reasoningDurationMs)) {
    next.reasoningDurationMs = reasoningDurationMs
  } else if (reasoningDurationMs === null) {
    next.reasoningDurationMs = null
  }

  if (typeof reasoningEndReason === 'string' && reasoningEndReason.trim().length > 0) {
    next.reasoningEndReason = reasoningEndReason
  }

  if (reasoningDurationIsFallback === 1) {
    next.reasoningDurationIsFallback = true
  }

  return Object.keys(next).length > 0 ? next : null
}


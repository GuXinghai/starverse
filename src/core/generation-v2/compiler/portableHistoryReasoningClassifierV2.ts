type JsonObject = Readonly<Record<string, unknown>>

export type PortableHistoryReasoningSummarySourceV2 = 'openai_responses_summary' | 'openrouter_reasoning_summary'
export type PortableHistoryReasoningSummaryV2 = Readonly<{
  source: PortableHistoryReasoningSummarySourceV2
  index: number
  text: string
}>

export type PortableHistoryReasoningClassificationV2 = Readonly<{
  publicSummaries: readonly PortableHistoryReasoningSummaryV2[]
  hasOpaqueReasoning: boolean
}>

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

/** Classifies only documented public summaries; every unrecognized reasoning payload stays opaque. */
export function classifyPortableHistoryReasoningV2(value: unknown, sourceProtocolContractId: string): PortableHistoryReasoningClassificationV2 {
  const item = object(value)
  const publicSummaries: PortableHistoryReasoningSummaryV2[] = []
  let hasOpaqueReasoning = false

  if (item.type === 'reasoning' && sourceProtocolContractId === 'openai-responses-v1') {
    if (Array.isArray(item.summary)) {
      item.summary.forEach((raw, index) => {
        const summary = object(raw)
        if (summary.type === 'summary_text' && typeof summary.text === 'string' && summary.text.length > 0) {
          publicSummaries.push(Object.freeze({ source: 'openai_responses_summary', index, text: summary.text }))
          if (hasValue(summary.signature)) hasOpaqueReasoning = true
        } else {
          hasOpaqueReasoning = true
        }
      })
    }
    if (hasValue(item.encrypted_content) || hasValue(item.signature) ||
      Array.isArray(item.content) && item.content.length > 0 || publicSummaries.length === 0) {
      hasOpaqueReasoning = true
    }
  } else if (item.type === 'reasoning') hasOpaqueReasoning = true

  if (hasValue(item.reasoning_details)) {
    if (sourceProtocolContractId !== 'openrouter-chat-completions-v1' || !Array.isArray(item.reasoning_details)) {
      hasOpaqueReasoning = true
    } else {
      item.reasoning_details.forEach((raw, index) => {
        const detail = object(raw)
        if (detail.type === 'reasoning.summary' && typeof detail.summary === 'string' && detail.summary.length > 0) {
          publicSummaries.push(Object.freeze({ source: 'openrouter_reasoning_summary', index, text: detail.summary }))
        } else {
          hasOpaqueReasoning = true
        }
        if (hasValue(detail.signature) || hasValue(detail.encrypted_content)) hasOpaqueReasoning = true
      })
    }
  }

  if (hasValue(item.reasoning) || hasValue(item.reasoning_content) || hasValue(item.thinking)) {
    hasOpaqueReasoning = true
  }
  if (Array.isArray(item.content) && item.content.some((raw) => {
    const part = object(raw)
    return part.type === 'thinking' || part.type === 'redacted_thinking'
  })) hasOpaqueReasoning = true
  if (Array.isArray(item.parts) && item.parts.some((raw) => {
    const part = object(raw)
    return part.thought === true || hasValue(part.thoughtSignature)
  })) hasOpaqueReasoning = true

  return Object.freeze({ publicSummaries: Object.freeze(publicSummaries), hasOpaqueReasoning })
}

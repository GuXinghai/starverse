import type { MessageVM, RootState, SessionVM } from './types'

export function selectSession(state: RootState, sessionId: string): SessionVM | null {
  const s = state.sessions[sessionId]
  if (!s) return null
  return {
    sessionId: s.sessionId,
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

export function selectMessage(state: RootState, messageId: string): MessageVM | null {
  const m = state.messages[messageId]
  if (!m) return null

  const visibility = m.hasEncryptedReasoning ? 'shown' : m.reasoningDetailsRaw.length > 0 ? 'shown' : 'not_returned'

  return {
    messageId: m.messageId,
    role: m.role,
    contentBlocks: m.contentBlocks,
    toolCalls: m.toolCalls,
    reasoningView: {
      summaryText: m.reasoningSummaryText,
      reasoningText: m.reasoningStreamingText,
      hasEncrypted: m.hasEncryptedReasoning,
      visibility,
    },
    streaming: m.streaming,
  }
}

export function selectTranscript(state: RootState, sessionId: string): MessageVM[] {
  const ids = state.sessionMessageIds[sessionId] || []
  return ids.map((id) => selectMessage(state, id)).filter((m): m is MessageVM => !!m)
}


import type { DomainEvent, MessageState, RootState, RunState, StartGenerationInput } from './types'

function generateId(prefix: string): string {
  const cryptoObj = (globalThis as any).crypto as { randomUUID?: () => string } | undefined
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function createInitialState(): RootState {
  return {
    runs: {},
    messages: {},
    runMessageIds: {},
  }
}

function createEmptyAssistantMessage(messageId: string, isTarget: boolean, reasoningExclude?: boolean): MessageState {
  return {
    messageId,
    role: 'assistant',
    contentText: '',
    contentBlocks: [],
    toolCalls: [],
    reasoningDetailsRaw: [],
    reasoningStreamingText: '',
    reasoningSummaryText: undefined,
    hasEncryptedReasoning: false,
    streaming: { isTarget, isComplete: false },
    requestedReasoningExclude: reasoningExclude,
  }
}

function createUserMessage(messageId: string, text: string): MessageState {
  const contentText = text || ''
  return {
    messageId,
    role: 'user',
    contentText,
    contentBlocks: contentText ? [{ type: 'text', text: contentText }] : [],
    toolCalls: [],
    reasoningDetailsRaw: [],
    reasoningStreamingText: '',
    reasoningSummaryText: undefined,
    hasEncryptedReasoning: false,
    streaming: { isTarget: false, isComplete: true },
  }
}

/**
 * Gate 3 invariant: before streaming starts, reducer must create an empty assistant placeholder
 * and bind it as the generation target (single-writer).
 */
export function startGeneration(state: RootState, input: StartGenerationInput): { state: RootState; assistantMessageId: string } {
  const assistantMessageId = input.assistantMessageId || generateId('assistant')
  const userMessageId =
    typeof input.userMessageText === 'string' ? input.userMessageId || generateId('user') : undefined

  const run: RunState = {
    runId: input.runId,
    status: 'requesting',
    requestId: input.requestId,
    targetAssistantMessageId: assistantMessageId,
    generationId: undefined,
    model: input.model,
    provider: undefined,
    finishReason: undefined,
    nativeFinishReason: undefined,
    usage: undefined,
    error: undefined,
    comments: [],
  }

  const existingIds = state.runMessageIds[input.runId] || []
  const nextIds = userMessageId ? [...existingIds, userMessageId, assistantMessageId] : [...existingIds, assistantMessageId]

  const nextMessages: Record<string, MessageState> = {
    ...state.messages,
    ...(userMessageId
      ? {
          [userMessageId]: createUserMessage(userMessageId, input.userMessageText as string),
        }
      : {}),
    [assistantMessageId]: createEmptyAssistantMessage(assistantMessageId, true, input.reasoningExclude),
  }

  return {
    assistantMessageId,
    state: {
      runs: { ...state.runs, [input.runId]: run },
      messages: nextMessages,
      runMessageIds: {
        ...state.runMessageIds,
        [input.runId]: nextIds,
      },
    },
  }
}

function updateMessage(state: RootState, messageId: string, updater: (m: MessageState) => MessageState): RootState {
  const prev = state.messages[messageId]
  if (!prev) return state
  const next = updater(prev)
  if (next === prev) return state
  return {
    ...state,
    messages: { ...state.messages, [messageId]: next },
  }
}

function updateRun(state: RootState, runId: string, updater: (s: RunState) => RunState): RootState {
  const prev = state.runs[runId]
  if (!prev) return state
  const next = updater(prev)
  if (next === prev) return state
  return {
    ...state,
    runs: { ...state.runs, [runId]: next },
  }
}

function inferHasEncrypted(detail: unknown): boolean {
  return !!(detail && typeof detail === 'object' && (detail as any).type === 'reasoning.encrypted')
}

export function applyEvent(state: RootState, runId: string, event: DomainEvent): RootState {
  const run = state.runs[runId]
  if (!run) return state

  const targetId = run.targetAssistantMessageId

  switch (event.type) {
    case 'StreamComment': {
      return updateRun(state, runId, (s) => ({
        ...s,
        comments: [...s.comments, event.text],
      }))
    }
    case 'MetaDelta': {
      return updateRun(state, runId, (s) => ({
        ...s,
        generationId: event.meta.id ?? s.generationId,
        model: event.meta.model ?? s.model,
        provider: event.meta.provider ?? s.provider,
        finishReason: event.meta.finish_reason ?? s.finishReason,
        nativeFinishReason: event.meta.native_finish_reason ?? s.nativeFinishReason,
      }))
    }
    case 'UsageDelta': {
      return updateRun(state, runId, (s) => ({
        ...s,
        usage: event.usage,
      }))
    }
    case 'MessageDeltaText': {
      const nextState = updateMessage(state, event.messageId, (m) => {
        const appended = m.contentText + event.text
        return {
          ...m,
          contentText: appended,
          contentBlocks: appended ? [{ type: 'text', text: appended }] : [],
        }
      })

      if (run.status === 'requesting') {
        return updateRun(nextState, runId, (s) => ({ ...s, status: 'streaming' }))
      }
      return nextState
    }
    case 'MessageDeltaToolCall': {
      return updateMessage(state, event.messageId, (m) => ({
        ...m,
        toolCalls: [...m.toolCalls, event.toolCallDelta],
      }))
    }
    case 'MessageDeltaReasoningDetail': {
      return updateMessage(state, event.messageId, (m) => ({
        ...m,
        reasoningDetailsRaw: [...m.reasoningDetailsRaw, event.detail], // append-only raw
        hasEncryptedReasoning: m.hasEncryptedReasoning || inferHasEncrypted(event.detail),
      }))
    }
    case 'StreamAbort': {
      const nextState = updateRun(state, runId, (s) => ({ ...s, status: 'aborted' }))
      if (targetId) {
        return updateMessage(nextState, targetId, (m) => ({ ...m, streaming: { ...m.streaming, isComplete: true } }))
      }
      return nextState
    }
    case 'StreamError': {
      const nextState = updateRun(state, runId, (s) => ({ ...s, status: 'error', error: event.error }))
      if (targetId) {
        return updateMessage(nextState, targetId, (m) => ({ ...m, streaming: { ...m.streaming, isComplete: true } }))
      }
      return nextState
    }
    case 'StreamDone': {
      const nextState = updateRun(state, runId, (s) => ({
        ...s,
        status: s.status === 'error' || s.status === 'aborted' ? s.status : 'done',
      }))
      if (targetId) {
        return updateMessage(nextState, targetId, (m) => ({ ...m, streaming: { ...m.streaming, isComplete: true } }))
      }
      return nextState
    }
    default:
      return state
  }
}

export function applyEvents(state: RootState, runId: string, events: DomainEvent[]): RootState {
  let next = state
  for (const ev of events) {
    next = applyEvent(next, runId, ev)
  }
  return next
}

import type { DomainEvent, MessageState, RootState, RunState, StartGenerationInput, ToolCallDelta, ToolCallVM } from './types'

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
    reasoningPanelState: 'expanded',
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
    reasoningPanelState: 'expanded',
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

export function toggleReasoningPanelState(state: RootState, messageId: string): RootState {
  return updateMessage(state, messageId, (m) => ({
    ...m,
    reasoningPanelState: m.reasoningPanelState === 'collapsed' ? 'expanded' : 'collapsed',
  }))
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

function normalizeToolCallDelta(input: unknown): ToolCallDelta | null {
  if (!input || typeof input !== 'object') return null
  const d = input as any
  const idx = typeof d.index === 'number' ? d.index : undefined
  const id = typeof d.id === 'string' ? d.id : undefined
  const type = typeof d.type === 'string' ? d.type : undefined

  let fn: ToolCallDelta['function'] | undefined
  if (d.function && typeof d.function === 'object') {
    const name = typeof d.function.name === 'string' ? d.function.name : undefined
    const args = typeof d.function.arguments === 'string' ? d.function.arguments : undefined
    if (name !== undefined || args !== undefined) {
      fn = { ...(name !== undefined ? { name } : {}), ...(args !== undefined ? { arguments: args } : {}) }
    }
  }

  if (idx === undefined && id === undefined && type === undefined && fn === undefined) return null
  return { ...(idx === undefined ? {} : { index: idx }), ...(id ? { id } : {}), ...(type ? { type } : {}), ...(fn ? { function: fn } : {}) }
}

function mergeToolCalls(
  prev: ReadonlyArray<ToolCallVM>,
  deltas: ReadonlyArray<ToolCallDelta>,
  mergeStrategy: 'append' | 'replace'
): ToolCallVM[] {
  const byIndex = new Map<number, ToolCallVM>()
  for (const tc of prev) byIndex.set(tc.index, tc)

  let nextAutoIndex = prev.reduce((max, tc) => Math.max(max, tc.index), -1) + 1

  for (const rawDelta of deltas) {
    const idx = typeof rawDelta.index === 'number' ? rawDelta.index : nextAutoIndex++
    const existing = byIndex.get(idx) ?? { index: idx, argumentsText: '' }

    const name =
      typeof rawDelta.function?.name === 'string' && rawDelta.function.name.length > 0
        ? rawDelta.function.name
        : existing.name

    const argsChunk = typeof rawDelta.function?.arguments === 'string' ? rawDelta.function.arguments : undefined
    const argumentsText =
      argsChunk === undefined
        ? existing.argumentsText
        : mergeStrategy === 'append'
          ? existing.argumentsText + argsChunk
          : argsChunk

    const merged: ToolCallVM = {
      index: idx,
      id: typeof rawDelta.id === 'string' && rawDelta.id.length > 0 ? rawDelta.id : existing.id,
      type: typeof rawDelta.type === 'string' && rawDelta.type.length > 0 ? rawDelta.type : existing.type,
      name,
      argumentsText,
    }

    byIndex.set(idx, merged)
  }

  return [...byIndex.values()].sort((a, b) => a.index - b.index)
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
      const normalizedDeltas = (Array.isArray(event.toolCallDeltas) ? event.toolCallDeltas : [])
        .map(normalizeToolCallDelta)
        .filter((d): d is ToolCallDelta => !!d)

      if (normalizedDeltas.length === 0) return state

      return updateMessage(state, event.messageId, (m) => ({
        ...m,
        toolCalls: mergeToolCalls(m.toolCalls, normalizedDeltas, event.mergeStrategy),
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

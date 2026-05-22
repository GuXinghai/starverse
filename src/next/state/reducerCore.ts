import type {
  DomainEvent,
  MessageState,
  ReasoningEffort,
  RequestedReasoningMode,
  RootState,
  RunState,
  StartGenerationInput,
} from './types'
import type { ReducerCoreOptions } from './reducers/reducerTypes'
import { handlers } from './reducers/handlers'
import { createGeneratedId, updateMessage } from './reducers/stateUtils'

export type { ReducerCoreOptions }

export function createInitialStateCore(): RootState {
  const messages: Record<string, MessageState> = {}
  const runMessageIds: Record<string, string[]> = {}
  return {
    runs: {},
    messages,
    runMessageIds,
    entities: { messagesById: messages },
    views: { transcriptsByRunId: runMessageIds },
  }
}

function createEmptyAssistantMessage(
  messageId: string,
  isTarget: boolean,
  requested: Readonly<{
    mode: RequestedReasoningMode
    effort?: ReasoningEffort
    exclude: boolean
    imageGeneration: boolean
  }>,
  reasoningPanelState: 'collapsed' | 'expanded' = 'expanded'
): MessageState {
  return {
    messageId,
    role: 'assistant',
    contentText: '',
    contentBlocks: [],
    toolCalls: [],
    reasoningDetailsRaw: [],
    reasoningStreamingText: '',
    reasoningSummaryText: undefined,
    reasoningPieces: [],
    reasoningLastPieceLen: 0,
    reasoningPanelState,
    hasEncryptedReasoning: false,
    reasoningDurationMs: undefined,
    reasoningEndReason: undefined,
    reasoningDurationIsFallback: undefined,
    streaming: { isTarget, isComplete: false },
    textVersion: 0,
    reasoningVersion: 0,
    ...(requested.imageGeneration ? { requestedImageGeneration: true } : {}),
    requestedReasoningMode: requested.mode,
    requestedReasoningEffort: requested.effort,
    requestedReasoningExclude: requested.exclude,
    errorEnvelope: null,
    errorSummary: null,
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
    reasoningPieces: [],
    reasoningLastPieceLen: 0,
    reasoningPanelState: 'expanded',
    hasEncryptedReasoning: false,
    reasoningDurationMs: undefined,
    reasoningEndReason: undefined,
    reasoningDurationIsFallback: undefined,
    streaming: { isTarget: false, isComplete: true },
    textVersion: 0,
    reasoningVersion: 0,
    requestedReasoningMode: 'effort',
    requestedReasoningEffort: 'none',
    requestedReasoningExclude: false,
    errorEnvelope: null,
    errorSummary: null,
  }
}

/**
 * Gate 3 invariant: before streaming starts, reducer must create an empty assistant placeholder
 * and bind it as the generation target (single-writer).
 */
export function startGenerationCore(
  state: RootState,
  input: StartGenerationInput,
  options?: ReducerCoreOptions
): { state: RootState; assistantMessageId: string } {
  const assistantMessageId = input.assistantMessageId || createGeneratedId('assistant', options)
  const userMessageId =
    typeof input.userMessageText === 'string' ? input.userMessageId || createGeneratedId('user', options) : undefined

  const requestedReasoningMode = input.requestedReasoningMode ?? 'effort'
  const requestedReasoningEffort =
    requestedReasoningMode === 'auto' ? undefined : (input.requestedReasoningEffort ?? 'none')
  const requestedReasoningExclude =
    requestedReasoningMode === 'auto' || requestedReasoningEffort === 'none' ? false : (input.requestedReasoningExclude ?? false)
  const requestedImageGeneration = input.requestedImageGeneration === true
  const reasoningPanelState = input.reasoningPanelDefaultExpanded === false ? 'collapsed' : 'expanded'

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
    completionOutcome: undefined,
    usage: undefined,
    error: undefined,
    comments: [],
    timingFinalized: false,
  }

  const existingIds = state.runMessageIds[input.runId] || []
  // Avoid duplicate messageIds when regenerate/retry pre-loads transcript from DB
  // before startGeneration is called. Only append IDs that are not already present.
  const idsToAdd: string[] = []
  if (userMessageId && !existingIds.includes(userMessageId)) idsToAdd.push(userMessageId)
  if (!existingIds.includes(assistantMessageId)) idsToAdd.push(assistantMessageId)
  const nextIds = idsToAdd.length > 0 ? [...existingIds, ...idsToAdd] : existingIds

  const nextMessages: Record<string, MessageState> = {
    ...state.messages,
    ...(userMessageId
      ? {
          [userMessageId]: createUserMessage(userMessageId, input.userMessageText as string),
        }
      : {}),
    [assistantMessageId]: createEmptyAssistantMessage(
      assistantMessageId,
      true,
      {
        mode: requestedReasoningMode,
        effort: requestedReasoningEffort,
        exclude: requestedReasoningExclude,
        imageGeneration: requestedImageGeneration,
      },
      reasoningPanelState
    ),
  }

  const nextRunMessageIds = {
    ...state.runMessageIds,
    [input.runId]: nextIds,
  }

  return {
    assistantMessageId,
    state: {
      runs: { ...state.runs, [input.runId]: run },
      messages: nextMessages,
      runMessageIds: nextRunMessageIds,
      entities: { messagesById: nextMessages },
      views: { transcriptsByRunId: nextRunMessageIds },
    },
  }
}

export function toggleReasoningPanelStateCore(state: RootState, messageId: string): RootState {
  return updateMessage(state, messageId, (m) => ({
    ...m,
    reasoningPanelState: m.reasoningPanelState === 'collapsed' ? 'expanded' : 'collapsed',
  }))
}

export function applyEventCore(
  state: RootState,
  runId: string,
  event: DomainEvent,
  options?: ReducerCoreOptions
): RootState {
  const run = state.runs[runId]
  if (!run) return state

  const handler = handlers[event.type]
  return handler({
    state,
    runId,
    run,
    targetId: run.targetAssistantMessageId,
    options,
  }, event)
}

export function applyEventsCore(
  state: RootState,
  runId: string,
  events: DomainEvent[],
  options?: ReducerCoreOptions
): RootState {
  return applyEventsBatchCore(state, runId, events, options)
}

export function applyEventsBatchCore(
  state: RootState,
  runId: string,
  events: DomainEvent[],
  options?: ReducerCoreOptions
): RootState {
  let next = state
  for (const ev of events) {
    next = applyEventCore(next, runId, ev, options)
  }
  return next
}

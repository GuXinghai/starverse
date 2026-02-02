import { markRaw } from 'vue'
import type {
  DomainEvent,
  MessageState,
  ReasoningEffort,
  ReasoningPiece,
  RequestedReasoningMode,
  RootState,
  RunState,
  StreamEndReason,
  StartGenerationInput,
  ToolCallDelta,
  ToolCallVM,
} from './types'
import { ReasoningDetailStreamMerger, injectMergerDiagRecorder } from './reasoningDetailStreamMerger'
import { recordMergeOp } from './perfMetrics'
import { recordReducerReasoning, recordMergerOp, startTimer, isSchedDiagEnabled } from './schedulerDiagnostics'

const REASONING_PIECE_MAX_CHARS = 2048
const REASONING_PIECE_MAX_COUNT = 200
const REASONING_PIECE_COMPACT_COUNT = 50

const reasoningMergerByMessageId = new Map<string, ReasoningDetailStreamMerger>()
let nextPieceId = 1

// 注入 merger 诊断记录器（在 sched diag 启用时会记录到聚合器）
injectMergerDiagRecorder(recordMergerOp, isSchedDiagEnabled())

function clearReasoningMerger(messageId: string): void {
  reasoningMergerByMessageId.delete(messageId)
}

function clearAllReasoningMergers(): void {
  reasoningMergerByMessageId.clear()
}

function getReasoningMerger(messageId: string, seedDetails?: ReadonlyArray<unknown>): ReasoningDetailStreamMerger {
  let merger = reasoningMergerByMessageId.get(messageId)
  if (!merger) {
    merger = new ReasoningDetailStreamMerger()
    if (Array.isArray(seedDetails) && seedDetails.length > 0) {
      for (const detail of seedDetails) {
        merger.merge(detail)
      }
    }
    reasoningMergerByMessageId.set(messageId, merger)
  }
  return merger
}

function appendReasoningPieces(prevPieces: ReasoningPiece[] | undefined, deltaText: string): { pieces: ReasoningPiece[]; lastLen: number } {
  if (!deltaText) {
    const lastLen = prevPieces && prevPieces.length > 0 ? prevPieces[prevPieces.length - 1].text.length : 0
    return { pieces: prevPieces ?? [], lastLen }
  }

  const pieces: ReasoningPiece[] = Array.isArray(prevPieces) && prevPieces.length > 0 
    ? [...prevPieces] 
    : [{ id: nextPieceId++, text: '' }]
  let remaining = deltaText

  let lastIndex = pieces.length - 1
  let last = pieces[lastIndex]
  if (last.text.length < REASONING_PIECE_MAX_CHARS) {
    const space = REASONING_PIECE_MAX_CHARS - last.text.length
    if (space > 0) {
      const head = remaining.slice(0, space)
      pieces[lastIndex] = { ...last, text: last.text + head }
      remaining = remaining.slice(head.length)
    }
  }

  while (remaining.length > 0) {
    const chunk = remaining.slice(0, REASONING_PIECE_MAX_CHARS)
    pieces.push({ id: nextPieceId++, text: chunk })
    remaining = remaining.slice(chunk.length)
  }

  // 异步合并避免长任务
  if (pieces.length > REASONING_PIECE_MAX_COUNT) {
    scheduleAsyncCompaction(pieces)
  }

  const lastLen = pieces.length > 0 ? pieces[pieces.length - 1].text.length : 0
  return { pieces, lastLen }
}

function scheduleAsyncCompaction(pieces: ReasoningPiece[]): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      if (pieces.length > REASONING_PIECE_MAX_COUNT) {
        const startTime = performance.now()
        const mergedText = pieces.slice(0, REASONING_PIECE_COMPACT_COUNT).map(p => p.text).join('')
        const mergedPiece = { id: nextPieceId++, text: mergedText }
        pieces.splice(0, REASONING_PIECE_COMPACT_COUNT, mergedPiece)
        const duration = performance.now() - startTime
        recordMergeOp(duration)
      }
    })
  } else {
    setTimeout(() => {
      if (pieces.length > REASONING_PIECE_MAX_COUNT) {
        const startTime = performance.now()
        const mergedText = pieces.slice(0, REASONING_PIECE_COMPACT_COUNT).map(p => p.text).join('')
        const mergedPiece = { id: nextPieceId++, text: mergedText }
        pieces.splice(0, REASONING_PIECE_COMPACT_COUNT, mergedPiece)
        const duration = performance.now() - startTime
        recordMergeOp(duration)
      }
    }, 0)
  }
}

function generateId(prefix: string): string {
  const cryptoObj = (globalThis as any).crypto as { randomUUID?: () => string } | undefined
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function createInitialState(): RootState {
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
  }>
): MessageState {
  return {
    messageId,
    role: 'assistant',
    contentText: '',
    contentBlocks: markRaw([]),
    toolCalls: [],
    reasoningDetailsRaw: markRaw([]),
    reasoningStreamingText: '',
    reasoningSummaryText: undefined,
    reasoningPieces: markRaw([]) as ReasoningPiece[],
    reasoningLastPieceLen: 0,
    reasoningPanelState: 'expanded',
    hasEncryptedReasoning: false,
    reasoningDurationMs: undefined,
    reasoningEndReason: undefined,
    reasoningDurationIsFallback: undefined,
    streaming: { isTarget, isComplete: false },
    textVersion: 0,
    reasoningVersion: 0,
    requestedReasoningMode: requested.mode,
    requestedReasoningEffort: requested.effort,
    requestedReasoningExclude: requested.exclude,
  }
}

function createUserMessage(messageId: string, text: string): MessageState {
  const contentText = text || ''
  return {
    messageId,
    role: 'user',
    contentText,
    contentBlocks: markRaw(contentText ? [{ type: 'text', text: contentText }] : []),
    toolCalls: [],
    reasoningDetailsRaw: markRaw([]),
    reasoningStreamingText: '',
    reasoningSummaryText: undefined,
    reasoningPieces: markRaw([]) as ReasoningPiece[],
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

  const requestedReasoningMode = input.requestedReasoningMode ?? 'effort'
  const requestedReasoningEffort =
    requestedReasoningMode === 'auto' ? undefined : (input.requestedReasoningEffort ?? 'none')
  const requestedReasoningExclude =
    requestedReasoningMode === 'auto' || requestedReasoningEffort === 'none' ? false : (input.requestedReasoningExclude ?? false)

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
    [assistantMessageId]: createEmptyAssistantMessage(assistantMessageId, true, {
      mode: requestedReasoningMode,
      effort: requestedReasoningEffort,
      exclude: requestedReasoningExclude,
    }),
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

function updateMessage(state: RootState, messageId: string, updater: (m: MessageState) => MessageState): RootState {
  const messages = state.entities?.messagesById ?? state.messages
  const prev = messages[messageId]
  if (!prev) return state
  const next = updater(prev)
  if (next === prev) return state
  messages[messageId] = next
  if (state.messages !== messages) {
    state.messages[messageId] = next
  }
  return {
    ...state,
    messages: state.messages,
    runMessageIds: state.runMessageIds,
    entities: state.entities,
    views: state.views,
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
  state.runs[runId] = next
  return {
    ...state,
    runs: state.runs,
    messages: state.messages,
    runMessageIds: state.runMessageIds,
    entities: state.entities,
    views: state.views,
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

const endReasonPriority: Record<StreamEndReason, number> = {
  user_abort: 3,
  mid_stream_error: 2,
  transport_error: 2,
  pre_stream_error: 2,
  normal_complete: 1,
}

function resolveEndReason(prev?: StreamEndReason, next?: StreamEndReason): StreamEndReason | undefined {
  if (!next) return prev
  if (!prev) return next
  return endReasonPriority[next] > endReasonPriority[prev] ? next : prev
}

function computeDurationMs(run: RunState): { durationMs: number | null; isFallback: boolean } {
  if (typeof run.localProcessingDurationMs === 'number' && Number.isFinite(run.localProcessingDurationMs)) {
    return { durationMs: Math.max(0, run.localProcessingDurationMs), isFallback: false }
  }
  if (typeof run.tAck === 'number' && typeof run.tEnd === 'number') {
    return { durationMs: Math.max(0, run.tEnd - run.tAck), isFallback: false }
  }
  // tAck 缺失：默认 NULL（不做降级计算）
  return { durationMs: null, isFallback: false }
}

function freezeOutputStartIfNeeded(state: RootState, runId: string, messageId?: string): RootState {
  const run = state.runs[runId]
  if (!run) return state
  if (run.timingFinalized) return state
  if (!run.targetAssistantMessageId || !messageId || run.targetAssistantMessageId !== messageId) return state
  if (typeof run.tEnd === 'number') return state

  const now = Date.now()
  return updateRun(state, runId, (s) => {
    if (s.timingFinalized) return s
    if (typeof s.tEnd === 'number') return s
    const duration = typeof s.tAck === 'number' ? Math.max(0, now - s.tAck) : s.localProcessingDurationMs
    return {
      ...s,
      tEnd: now,
      localProcessingDurationMs: duration,
    }
  })
}

function finalizeRunTiming(state: RootState, runId: string, endReasonHint?: StreamEndReason): RootState {
  const run = state.runs[runId]
  if (!run) return state
  if (run.timingFinalized) return state

  const assistantMessageId = run.targetAssistantMessageId
  const ensuredTEnd = typeof run.tEnd === 'number' ? run.tEnd : Date.now()
  const runWithEnd = typeof run.tEnd === 'number'
    ? run
    : { ...run, tEnd: ensuredTEnd }
  if (!assistantMessageId) {
    return updateRun(state, runId, (s) => ({
      ...s,
      tEnd: typeof s.tEnd === 'number' ? s.tEnd : ensuredTEnd,
      endReason: resolveEndReason(s.endReason, endReasonHint),
      timingFinalized: true,
    }))
  }

  const resolvedEndReason = resolveEndReason(runWithEnd.endReason, endReasonHint)
  const timing = computeDurationMs(runWithEnd)

  let nextState = updateRun(state, runId, (s) => ({
    ...s,
    tEnd: typeof s.tEnd === 'number' ? s.tEnd : ensuredTEnd,
    endReason: resolvedEndReason ?? s.endReason,
    localProcessingDurationMs: typeof s.localProcessingDurationMs === 'number' ? s.localProcessingDurationMs : (timing.durationMs ?? s.localProcessingDurationMs),
    timingFinalized: true,
  }))

  nextState = updateMessage(nextState, assistantMessageId, (m) => {
    const nextDuration = m.reasoningDurationMs !== undefined ? m.reasoningDurationMs : timing.durationMs
    const nextEndReason = m.reasoningEndReason ?? resolvedEndReason
    const nextFallback = m.reasoningDurationIsFallback ?? (timing.isFallback ? true : undefined)
    return {
      ...m,
      reasoningDurationMs: nextDuration,
      reasoningEndReason: nextEndReason,
      reasoningDurationIsFallback: nextFallback,
    }
  })

  return nextState
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
    case 'TimingSnapshot': {
      return updateRun(state, runId, (s) => {
        const tRequestStart = typeof event.tRequestStart === 'number' && s.tRequestStart === undefined
          ? event.tRequestStart
          : s.tRequestStart
        const tAck = typeof event.tAck === 'number' && s.tAck === undefined
          ? event.tAck
          : s.tAck
        const tTransportClosed = typeof event.tTransportClosed === 'number' && s.tTransportClosed === undefined
          ? event.tTransportClosed
          : s.tTransportClosed

        const endReason = typeof event.endReason === 'string'
          ? resolveEndReason(s.endReason, event.endReason as StreamEndReason)
          : s.endReason

        const localProcessingDurationMs = (typeof tAck === 'number' && typeof s.tEnd === 'number')
          ? Math.max(0, s.tEnd - tAck)
          : s.localProcessingDurationMs

        return {
          ...s,
          tRequestStart,
          tAck,
          tTransportClosed,
          endReason,
          localProcessingDurationMs,
        }
      })
    }
    case 'MessageDeltaText': {
      const baseState = event.text ? freezeOutputStartIfNeeded(state, runId, event.messageId) : state
      const nextState = updateMessage(baseState, event.messageId, (m) => {
        if (!event.text) return m

        const nextText = m.contentText + event.text
        const prevBlocks = Array.isArray(m.contentBlocks) ? m.contentBlocks : []

        let nextBlocks = prevBlocks
        const last = prevBlocks.length > 0 ? prevBlocks[prevBlocks.length - 1] : null
        if (!last) {
          nextBlocks = [{ type: 'text', text: event.text } as const]
        } else if (last.type === 'text') {
          nextBlocks = [...prevBlocks.slice(0, -1), { type: 'text', text: last.text + event.text } as const]
        } else {
          nextBlocks = [...prevBlocks, { type: 'text', text: event.text } as const]
        }

        return {
          ...m,
          contentText: nextText,
          contentBlocks: markRaw(nextBlocks),
          textVersion: m.textVersion + 1,
        }
      })

      if (run.status === 'requesting') {
        return updateRun(nextState, runId, (s) => ({ ...s, status: 'streaming' }))
      }
      return nextState
    }
    case 'MessageAppendContentBlock': {
      const block = event.block
      const hasBlockContent =
        (block.type === 'text' && typeof (block as any).text === 'string' && (block as any).text.length > 0) ||
        (block.type === 'image' && typeof (block as any).url === 'string' && (block as any).url.length > 0) ||
        block.type === 'unknown'
      const baseState = hasBlockContent ? freezeOutputStartIfNeeded(state, runId, event.messageId) : state
      const nextState = updateMessage(baseState, event.messageId, (m) => {
        const block = event.block

        if (block.type === 'text' && typeof block.text === 'string') {
          const text = block.text
          if (!text) return m

          const prevBlocks = Array.isArray(m.contentBlocks) ? m.contentBlocks : []
          const last = prevBlocks.length > 0 ? prevBlocks[prevBlocks.length - 1] : null
          const nextBlocks =
            last && last.type === 'text'
              ? [...prevBlocks.slice(0, -1), { type: 'text', text: last.text + text } as const]
              : [...prevBlocks, { type: 'text', text } as const]

          return {
            ...m,
            contentText: m.contentText + text,
            contentBlocks: markRaw(nextBlocks),
            textVersion: m.textVersion + 1,
          }
        }

        return {
          ...m,
          contentBlocks: markRaw([...m.contentBlocks, block]),
          textVersion: m.textVersion + 1,
        }
      })

      if (nextState === state) return state
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
      const baseState = freezeOutputStartIfNeeded(state, runId, event.messageId)
      return updateMessage(baseState, event.messageId, (m) => ({
        ...m,
        toolCalls: mergeToolCalls(m.toolCalls, normalizedDeltas, event.mergeStrategy),
      }))
    }
    case 'MessageDeltaReasoningDetail': {
      const endTimer = startTimer()
      const result = updateMessage(state, event.messageId, (m) => {
        const nextDetails = markRaw([...m.reasoningDetailsRaw, event.detail])
        const nextVersion = m.reasoningVersion + 1
        const hasEncryptedReasoning = m.hasEncryptedReasoning || inferHasEncrypted(event.detail)

        const merger = getReasoningMerger(event.messageId, m.reasoningDetailsRaw)
        const merged = merger.merge(event.detail)
        const deltaText = merged?.deltaText ?? ''
        const deltaSummary = merged?.deltaSummary ?? ''

        let reasoningSummaryText = m.reasoningSummaryText
        if (deltaSummary) {
          reasoningSummaryText = (reasoningSummaryText ?? '') + deltaSummary
        }

        let reasoningPieces = m.reasoningPieces
        let reasoningLastPieceLen = m.reasoningLastPieceLen
        if (deltaText) {
          const nextPieces = appendReasoningPieces(m.reasoningPieces, deltaText)
          reasoningPieces = markRaw(nextPieces.pieces)
          reasoningLastPieceLen = nextPieces.lastLen
        }

        return {
          ...m,
          reasoningDetailsRaw: nextDetails,
          hasEncryptedReasoning,
          reasoningVersion: nextVersion,
          reasoningSummaryText,
          reasoningPieces,
          reasoningLastPieceLen,
        }
      })

      // 记录诊断数据
      if (isSchedDiagEnabled()) {
        const messages = result.entities?.messagesById ?? result.messages
        const msg = messages[event.messageId]
        recordReducerReasoning({
          applyMs: endTimer(),
          deltaTextLen: typeof (event.detail as any)?.text === 'string' ? (event.detail as any).text.length : 0,
          detailsCount: 1,
          reasoningPiecesLen: msg?.reasoningPieces?.length ?? 0,
          reasoningTotalChars: msg?.reasoningPieces?.reduce((sum, p) => sum + (p?.text?.length ?? 0), 0) ?? 0,
        })
      }

      return result
    }
    case 'MessageDeltaReasoningDetailBatch': {
      const details = Array.isArray(event.details) ? event.details : []
      if (details.length === 0) return state
      const hasEncrypted = details.some((detail) => inferHasEncrypted(detail))
      const endTimer = startTimer()
      const result = updateMessage(state, event.messageId, (m) => {
        const nextDetails = markRaw([...m.reasoningDetailsRaw, ...details])
        const nextVersion = m.reasoningVersion + 1

        const merger = getReasoningMerger(event.messageId, m.reasoningDetailsRaw)
        let reasoningSummaryText = m.reasoningSummaryText
        let reasoningPieces = m.reasoningPieces
        let reasoningLastPieceLen = m.reasoningLastPieceLen

        for (const detail of details) {
          const merged = merger.merge(detail)
          const deltaText = merged?.deltaText ?? ''
          const deltaSummary = merged?.deltaSummary ?? ''

          if (deltaSummary) {
            reasoningSummaryText = (reasoningSummaryText ?? '') + deltaSummary
          }
          if (deltaText) {
            const nextPieces = appendReasoningPieces(reasoningPieces, deltaText)
            reasoningPieces = nextPieces.pieces
            reasoningLastPieceLen = nextPieces.lastLen
          }
        }

        return {
          ...m,
          reasoningDetailsRaw: nextDetails,
          hasEncryptedReasoning: m.hasEncryptedReasoning || hasEncrypted,
          reasoningVersion: nextVersion,
          reasoningSummaryText,
          reasoningPieces: reasoningPieces ? markRaw(reasoningPieces) : reasoningPieces,
          reasoningLastPieceLen,
        }
      })

      // 记录诊断数据
      if (isSchedDiagEnabled()) {
        const messages = result.entities?.messagesById ?? result.messages
        const msg = messages[event.messageId]
        const totalTextLen = details.reduce<number>((sum, d) => {
          const text = (d as any)?.text
          return sum + (typeof text === 'string' ? text.length : 0)
        }, 0)
        recordReducerReasoning({
          applyMs: endTimer(),
          deltaTextLen: totalTextLen,
          detailsCount: details.length,
          reasoningPiecesLen: msg?.reasoningPieces?.length ?? 0,
          reasoningTotalChars: msg?.reasoningPieces?.reduce((sum, p) => sum + (p?.text?.length ?? 0), 0) ?? 0,
        })
      }

      return result
    }
    case 'StreamAbort': {
      let nextState = updateRun(state, runId, (s) => ({ ...s, status: 'aborted' }))
      nextState = finalizeRunTiming(nextState, runId, 'user_abort')
      // 清理驻留合并器
      if (targetId) {
        clearReasoningMerger(targetId)
      }
      if (targetId) {
        return updateMessage(nextState, targetId, (m) => ({ ...m, streaming: { ...m.streaming, isComplete: true } }))
      }
      return nextState
    }
    case 'StreamError': {
      let nextState = updateRun(state, runId, (s) => ({ ...s, status: 'error', error: event.error }))
      nextState = finalizeRunTiming(nextState, runId, 'mid_stream_error')
      // 清理驻留合并器
      if (targetId) {
        clearReasoningMerger(targetId)
      }
      if (targetId) {
        return updateMessage(nextState, targetId, (m) => ({ ...m, streaming: { ...m.streaming, isComplete: true } }))
      }
      return nextState
    }
    case 'StreamDone': {
      let nextState = updateRun(state, runId, (s) => ({
        ...s,
        status: s.status === 'error' || s.status === 'aborted' ? s.status : 'done',
      }))
      nextState = finalizeRunTiming(nextState, runId, 'normal_complete')
      // 清理驻留合并器
      if (targetId) {
        clearReasoningMerger(targetId)
      }
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
  return applyEventsBatch(state, runId, events)
}

export function applyEventsBatch(state: RootState, runId: string, events: DomainEvent[]): RootState {
  let next = state
  for (const ev of events) {
    next = applyEvent(next, runId, ev)
  }
  return next
}

// 导出清理函数供组件卸载时使用
export { clearReasoningMerger, clearAllReasoningMergers }

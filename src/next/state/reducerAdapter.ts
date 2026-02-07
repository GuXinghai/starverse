/* eslint-disable max-lines-per-function */
import { markRaw } from 'vue'
import type {
  DomainEvent,
  MessageState,
  ReasoningPiece,
  RootState,
  StartGenerationInput,
} from './types'
import {
  applyEventCore,
  applyEventsBatchCore,
  applyEventsCore,
  createInitialStateCore,
  startGenerationCore,
  toggleReasoningPanelStateCore,
} from './reducerCore'
import { recordMergeOp } from './perfMetrics'
import { injectMergerDiagRecorder } from './reasoningDetailStreamMerger'
import { isSchedDiagEnabled, recordMergerOp, recordReducerReasoning, startTimer } from './schedulerDiagnostics'

const REASONING_PIECE_MAX_COUNT = 200
const REASONING_PIECE_COMPACT_COUNT = 50

// Keep merger diagnostics wired in adapter (core remains framework/environment agnostic).
injectMergerDiagRecorder(recordMergerOp, isSchedDiagEnabled())

function generateId(prefix: string): string {
  const cryptoObj = (globalThis as any).crypto as { randomUUID?: () => string } | undefined
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function nextPieceIdFrom(pieces: ReasoningPiece[]): number {
  let maxId = 0
  for (const piece of pieces) {
    if (typeof piece.id === 'number' && piece.id > maxId) {
      maxId = piece.id
    }
  }
  return maxId + 1
}

function scheduleAsyncCompaction(pieces: ReasoningPiece[]): void {
  const compact = () => {
    if (pieces.length <= REASONING_PIECE_MAX_COUNT) return
    const startTime = performance.now()
    const mergedText = pieces.slice(0, REASONING_PIECE_COMPACT_COUNT).map((p) => p.text).join('')
    const mergedPiece = { id: nextPieceIdFrom(pieces), text: mergedText }
    pieces.splice(0, REASONING_PIECE_COMPACT_COUNT, mergedPiece)
    const duration = performance.now() - startTime
    recordMergeOp(duration)
  }

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(compact)
  } else {
    setTimeout(compact, 0)
  }
}

function markMessageRawFields(message: MessageState | undefined): void {
  if (!message) return
  if (Array.isArray(message.contentBlocks)) {
    markRaw(message.contentBlocks)
  }
  if (Array.isArray(message.reasoningDetailsRaw)) {
    markRaw(message.reasoningDetailsRaw)
  }
  if (Array.isArray(message.reasoningPieces)) {
    markRaw(message.reasoningPieces)
  }
}

function markStateRawFields(state: RootState): void {
  const messages = state.entities?.messagesById ?? state.messages
  for (const message of Object.values(messages)) {
    markMessageRawFields(message)
  }
}

function maybeScheduleReasoningCompaction(state: RootState, event: DomainEvent): void {
  if (event.type !== 'MessageDeltaReasoningDetail' && event.type !== 'MessageDeltaReasoningDetailBatch') return
  const messages = state.entities?.messagesById ?? state.messages
  const message = messages[event.messageId]
  if (!message || !Array.isArray(message.reasoningPieces)) return
  if (message.reasoningPieces.length > REASONING_PIECE_MAX_COUNT) {
    scheduleAsyncCompaction(message.reasoningPieces)
  }
}

function maybeRecordReasoningDiag(event: DomainEvent, state: RootState, endTimer: (() => number) | null): void {
  if (!endTimer || !isSchedDiagEnabled()) return
  if (event.type !== 'MessageDeltaReasoningDetail' && event.type !== 'MessageDeltaReasoningDetailBatch') return

  const messages = state.entities?.messagesById ?? state.messages
  const msg = messages[event.messageId]
  const detailsCount = event.type === 'MessageDeltaReasoningDetailBatch' ? (Array.isArray(event.details) ? event.details.length : 0) : 1
  const deltaTextLen = event.type === 'MessageDeltaReasoningDetailBatch'
    ? (Array.isArray(event.details)
        ? event.details.reduce<number>((sum, d) => {
            const text = (d as any)?.text
            return sum + (typeof text === 'string' ? text.length : 0)
          }, 0)
        : 0)
    : (typeof (event.detail as any)?.text === 'string' ? (event.detail as any).text.length : 0)

  recordReducerReasoning({
    applyMs: endTimer(),
    deltaTextLen,
    detailsCount,
    reasoningPiecesLen: msg?.reasoningPieces?.length ?? 0,
    reasoningTotalChars: msg?.reasoningPieces?.reduce((sum, p) => sum + (p?.text?.length ?? 0), 0) ?? 0,
  })
}

const coreOptions = {
  now: () => Date.now(),
  generateId,
}

export function createInitialState(): RootState {
  const state = createInitialStateCore()
  markStateRawFields(state)
  return state
}

export function startGeneration(state: RootState, input: StartGenerationInput): { state: RootState; assistantMessageId: string } {
  const out = startGenerationCore(state, input, coreOptions)
  markStateRawFields(out.state)
  return out
}

export function toggleReasoningPanelState(state: RootState, messageId: string): RootState {
  const next = toggleReasoningPanelStateCore(state, messageId)
  markMessageRawFields(next.messages[messageId])
  return next
}

export function applyEvent(state: RootState, runId: string, event: DomainEvent): RootState {
  const endTimer =
    event.type === 'MessageDeltaReasoningDetail' || event.type === 'MessageDeltaReasoningDetailBatch'
      ? startTimer()
      : null
  const next = applyEventCore(state, runId, event, coreOptions)
  markStateRawFields(next)
  maybeScheduleReasoningCompaction(next, event)
  maybeRecordReasoningDiag(event, next, endTimer)
  return next
}

export function applyEvents(state: RootState, runId: string, events: DomainEvent[]): RootState {
  let next = state
  for (const event of events) {
    next = applyEvent(next, runId, event)
  }
  return next
}

export function applyEventsBatch(state: RootState, runId: string, events: DomainEvent[]): RootState {
  return applyEvents(state, runId, events)
}

// Historical compatibility placeholders only.
// Do not add new calls to these APIs; reducerAdapter no longer keeps a persistent merger map.
// They remain exported to avoid breaking existing imports while call sites are migrated away.
export function clearReasoningMerger(_messageId: string): void {
  // Compatibility placeholder (no-op). New code must not rely on this for cleanup.
}

export function clearAllReasoningMergers(): void {
  // Compatibility placeholder (no-op). New code must not rely on this for cleanup.
}

// Re-export core helpers for direct semantic tests when needed.
export { applyEventCore, applyEventsBatchCore, applyEventsCore, createInitialStateCore, startGenerationCore, toggleReasoningPanelStateCore }

/* eslint-disable max-lines-per-function */
import { markRaw } from 'vue'
import type {
  DomainEvent,
  MessageState,
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
import { injectMergerDiagRecorder } from './reasoningDetailStreamMerger'
import { isSchedDiagEnabled, recordMergerOp, recordReducerReasoning, startTimer } from './schedulerDiagnostics'

// Keep merger diagnostics wired in adapter (core remains framework/environment agnostic).
injectMergerDiagRecorder(recordMergerOp, isSchedDiagEnabled())

function generateId(prefix: string): string {
  const cryptoObj = (globalThis as any).crypto as { randomUUID?: () => string } | undefined
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function markMessageRawFields(message: MessageState | undefined): void {
  if (!message) return
  if (Array.isArray(message.contentBlocks)) {
    markRaw(message.contentBlocks)
  }
  if (Array.isArray(message.reasoningDetailsRaw)) {
    markRaw(message.reasoningDetailsRaw)
  }
  if (Array.isArray(message.annotations)) {
    markRaw(message.annotations)
  }
}

function markStateRawFields(state: RootState): void {
  const messages = state.entities?.messagesById ?? state.messages
  for (const message of Object.values(messages)) {
    markMessageRawFields(message)
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
    rawDetailsCount: msg?.reasoningDetailsRaw?.length ?? 0,
    rawReasoningTotalChars: 0,
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

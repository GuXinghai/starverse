import type { RootState, StreamEndReason } from '../types'
import type { EventByType, HandlerContext } from './reducerTypes'
import {
  completionClassFromEnvelope,
  completionOutcomeFromFinishReason,
  endReasonFromPhase,
  finalizeRunTiming,
  resolveEndReason,
  updateMessage,
  updateRun,
} from './stateUtils'

export function handleStreamComment(ctx: HandlerContext, event: EventByType<'StreamComment'>): RootState {
  return updateRun(ctx.state, ctx.runId, (s) => ({
    ...s,
    comments: [...s.comments, event.text],
  }))
}

export function handleMetaDelta(ctx: HandlerContext, event: EventByType<'MetaDelta'>): RootState {
  return updateRun(ctx.state, ctx.runId, (s) => ({
    ...s,
    generationId: event.meta.id ?? s.generationId,
    model: event.meta.model ?? s.model,
    provider: event.meta.provider ?? s.provider,
    finishReason: event.meta.finish_reason ?? s.finishReason,
    nativeFinishReason: event.meta.native_finish_reason ?? s.nativeFinishReason,
  }))
}

export function handleUsageDelta(ctx: HandlerContext, event: EventByType<'UsageDelta'>): RootState {
  return updateRun(ctx.state, ctx.runId, (s) => ({
    ...s,
    usage: event.usage,
  }))
}

export function handleTimingSnapshot(ctx: HandlerContext, event: EventByType<'TimingSnapshot'>): RootState {
  return updateRun(ctx.state, ctx.runId, (s) => {
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

export function handleStreamAbort(ctx: HandlerContext, event: EventByType<'StreamAbort'>): RootState {
  const completionClass = completionClassFromEnvelope(event.envelope)
  const status = completionClass === 'aborted' ? 'aborted' : completionClass === 'error' ? 'error' : 'done'
  let nextState = updateRun(ctx.state, ctx.runId, (s) => ({ ...s, status, completionOutcome: undefined }))
  nextState = finalizeRunTiming(nextState, ctx.runId, 'user_abort', ctx.options)
  if (ctx.targetId) {
    return updateMessage(nextState, ctx.targetId, (m) => ({
      ...m,
      errorEnvelope: event.envelope ?? m.errorEnvelope,
      streaming: { ...m.streaming, isComplete: true },
    }))
  }
  return nextState
}

export function handleStreamError(ctx: HandlerContext, event: EventByType<'StreamError'>): RootState {
  const alreadyAborted = ctx.run.status === 'aborted' || ctx.run.endReason === 'user_abort'
  if (alreadyAborted) return ctx.state

  const completionClass = completionClassFromEnvelope(event.error)
  const endReasonHint = completionClass === 'error' ? endReasonFromPhase(event.error?.phase) : undefined
  const status = completionClass === 'aborted' ? 'aborted' : completionClass === 'error' ? 'error' : 'done'
  let nextState = updateRun(ctx.state, ctx.runId, (s) => ({
    ...s,
    status,
    completionOutcome: undefined,
    error: completionClass === 'error' ? event.error : s.error,
  }))
  nextState = finalizeRunTiming(nextState, ctx.runId, endReasonHint, ctx.options)
  if (ctx.targetId) {
    return updateMessage(nextState, ctx.targetId, (m) => ({
      ...m,
      errorEnvelope: event.error ?? m.errorEnvelope,
      streaming: { ...m.streaming, isComplete: true },
    }))
  }
  return nextState
}

export function handleStreamDone(ctx: HandlerContext): RootState {
  let nextState = updateRun(ctx.state, ctx.runId, (s) => ({
    ...s,
    status: s.status === 'error' || s.status === 'aborted' ? s.status : 'done',
    completionOutcome:
      s.status === 'error' || s.status === 'aborted' || s.error
        ? s.completionOutcome
        : completionOutcomeFromFinishReason(s.finishReason),
  }))
  nextState = finalizeRunTiming(nextState, ctx.runId, 'normal_complete', ctx.options)
  if (ctx.targetId) {
    return updateMessage(nextState, ctx.targetId, (m) => ({ ...m, streaming: { ...m.streaming, isComplete: true } }))
  }
  return nextState
}

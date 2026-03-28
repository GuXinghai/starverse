import type { AppErrorPhase } from '@/next/errors/appError'
import {
  normalizeOpenRouterErrorFromSseChunkError,
  normalizeProtocolError,
  toNormalizedErrorEnvelope,
} from '@/next/errors/normalizeOpenRouterError'
import {
  buildAbortEnvelope,
  buildMidStreamSseErrorEnvelope,
  buildTransportErrorEnvelope,
} from '@/next/errors/openRouterErrorEnvelope'
import type { ErrorEnvelope, ErrorPhase } from '@/next/errors/openRouterErrorEnvelope'
import { mapChunkToEvents } from '@/next/openrouter/mapChunkToEvents'
import { mapResponsesEventToTerminal } from '@/next/openrouter/responsesEventMapper'
import type { DomainEvent, StreamEndReason } from '@/next/state/types'
import { normalizeTransportError } from '@/next/errors/normalizeOpenRouterError'
import { TerminalArbiter } from '@/next/streaming/core/terminalArbiter'
import { TimingMachine } from '@/next/streaming/core/timingMachine'
import type { BuildStreamErrorFromAppErrorInput, StreamSemanticCoreInput } from '@/next/streaming/core/types'

export function mapAppPhaseToEnvelopePhase(appPhase: AppErrorPhase, fallback: ErrorPhase): ErrorPhase {
  if (appPhase === 'pre_stream_request_error') return 'pre_stream'
  if (appPhase === 'mid_stream_error') return 'mid_stream'
  if (appPhase === 'local_transport_error' || appPhase === 'local_protocol_error' || appPhase === 'internal_bug') {
    return fallback
  }
  if (appPhase === 'user_cancelled') return fallback
  return fallback
}

export function mapAppPhaseToEndReason(
  appPhase: AppErrorPhase,
  fallback: StreamEndReason
): StreamEndReason {
  if (appPhase === 'pre_stream_request_error') return 'pre_stream_error'
  if (appPhase === 'mid_stream_error') return 'mid_stream_error'
  if (appPhase === 'local_transport_error' || appPhase === 'local_protocol_error' || appPhase === 'internal_bug') return 'transport_error'
  if (appPhase === 'user_cancelled') return 'user_abort'
  return fallback
}

export function buildStreamErrorFromAppError(input: BuildStreamErrorFromAppErrorInput): ErrorEnvelope {
  const normalized = toNormalizedErrorEnvelope({
    appError: input.appError,
    endpoint: 'chat.completions',
    transport: 'sse',
    phase: input.phase === 'pre_stream' ? 'request' : 'generation',
    ...(input.raw ? { raw: input.raw } : {}),
  })
  return buildTransportErrorEnvelope({
    phase: input.phase,
    completionClass: input.appError.phase === 'user_cancelled' ? 'aborted' : 'error',
    message: input.appError.message,
    normalized,
    request: input.request,
    kind: input.appError.phase === 'local_protocol_error' ? 'parse_error' : 'transport_error',
  })
}

type LastMeta = {
  generationId?: string
  model?: string
  provider?: string
  finishReason?: string
  nativeFinishReason?: string
}

function updateLastMeta(lastMeta: LastMeta, event: DomainEvent): LastMeta {
  if (event.type !== 'MetaDelta') return lastMeta
  return {
    generationId: event.meta?.id ?? lastMeta.generationId,
    model: event.meta?.model ?? lastMeta.model,
    provider: event.meta?.provider ?? lastMeta.provider,
    finishReason: event.meta?.finish_reason ?? lastMeta.finishReason,
    nativeFinishReason: event.meta?.native_finish_reason ?? lastMeta.nativeFinishReason,
  }
}

/* eslint-disable max-lines-per-function, max-statements, complexity */
export async function* streamFetchSemanticCore(input: StreamSemanticCoreInput): AsyncGenerator<DomainEvent> {
  const signal = input.signal ?? null
  const timing = new TimingMachine(input.tRequestStart, input.logTiming)
  const terminalArbiter = new TerminalArbiter()

  let lastMeta: LastMeta = {}
  let chunkNo = 0
  let receivedAnySse = false

  yield timing.emitRequestStartSnapshot()

  for await (const ev of input.decodedEvents) {
    if (terminalArbiter.isTerminated) return
    if (signal?.aborted) {
      if (!terminalArbiter.tryEnterTerminal()) return
      yield timing.end({ endReason: 'user_abort', includeAck: true, reasonTag: 'user_abort' })
      const envelope = buildAbortEnvelope({
        phase: receivedAnySse ? 'mid_stream' : 'pre_stream',
        completionClass: 'aborted',
        reason: 'aborted',
        request: input.requestContext,
      })
      yield { type: 'StreamAbort', reason: 'aborted', envelope }
      return
    }

    if (ev.type === 'comment') {
      receivedAnySse = true
      const ack = timing.tryAckFromComment(ev.text)
      if (ack) yield ack
      yield { type: 'StreamComment', text: ev.text }
      continue
    }

    if (ev.type === 'done') {
      if (!terminalArbiter.tryEnterTerminal()) return
      yield timing.end({ endReason: 'normal_complete', includeDuration: true, reasonTag: 'normal_complete' })
      yield { type: 'StreamDone' }
      return
    }

    if (ev.type === 'protocol_error') {
      if (!terminalArbiter.tryEnterTerminal()) return
      const appError = normalizeProtocolError(
        {
          code: 'protocol_invalid',
          message: ev.message,
        },
        ev.raw
      )
      const envelopePhase = input.mapAppPhaseToEnvelopePhase(appError.phase, receivedAnySse ? 'mid_stream' : 'pre_stream')
      const endReason = input.mapAppPhaseToEndReason(appError.phase, 'transport_error')
      yield timing.end({ endReason, includeAck: true, reasonTag: endReason })
      input.logStreamError?.('protocol_error', { message: ev.message, raw: ev.raw })
      const envelope = input.buildStreamErrorFromAppError({
        appError,
        phase: envelopePhase,
        request: input.requestContext,
        raw: {
          type: 'protocol_error',
          ...(ev.raw !== undefined ? { rawChunk: ev.raw } : {}),
        },
      })
      yield { type: 'StreamError', error: envelope, terminal: true }
      return
    }

    if (ev.type === 'terminal_error') {
      if (!terminalArbiter.tryEnterTerminal()) return
      yield timing.end({ endReason: 'mid_stream_error', includeAck: true, reasonTag: 'mid_stream_error' })
      return
    }

    if (ev.type !== 'json') continue
    receivedAnySse = true
    const ack = timing.tryAckFromFirstChunk()
    if (ack) yield ack

    const responsesTerminal = mapResponsesEventToTerminal({
      event: ev.value,
      request: input.requestContext,
    })
    if (responsesTerminal) {
      if (!terminalArbiter.tryEnterTerminal()) return
      if (responsesTerminal.meta) {
        yield { type: 'MetaDelta', meta: responsesTerminal.meta }
      }
      const endReason = responsesTerminal.completionClass === 'error' ? 'mid_stream_error' : 'normal_complete'
      yield timing.end({ endReason, includeAck: true, includeDuration: true, reasonTag: endReason })
      if (responsesTerminal.completionClass === 'ok') {
        yield { type: 'StreamDone' }
      } else if (responsesTerminal.envelope) {
        yield { type: 'StreamError', error: responsesTerminal.envelope, terminal: true }
      }
      return
    }

    chunkNo++
    const mapped = mapChunkToEvents({
      chunk: ev.value as any,
      messageId: input.assistantMessageId,
      chunkNo,
    }) as any as DomainEvent[]

    for (const mappedEvent of mapped) {
      if (mappedEvent.type === 'MetaDelta') {
        lastMeta = updateLastMeta(lastMeta, mappedEvent)
        yield mappedEvent
        continue
      }

      if (mappedEvent.type === 'StreamError') {
        if (!terminalArbiter.tryEnterTerminal()) return
        yield timing.end({ endReason: 'mid_stream_error', includeAck: true, reasonTag: 'mid_stream_error_chunk' })
        const normalized = normalizeOpenRouterErrorFromSseChunkError({
          chunkError: mappedEvent.error,
          meta: lastMeta,
        })
        const envelope = buildMidStreamSseErrorEnvelope({
          phase: 'mid_stream',
          completionClass: 'error',
          normalized,
          stream: {
            generation_id: lastMeta.generationId,
            model: lastMeta.model,
            provider: lastMeta.provider,
            finish_reason: lastMeta.finishReason,
            native_finish_reason: lastMeta.nativeFinishReason,
            chunk_no: chunkNo,
          },
          request: input.requestContext,
        })
        input.logStreamError?.('sse_chunk_error', { raw: mappedEvent.error, meta: lastMeta, normalized })
        yield { type: 'StreamError', error: envelope, terminal: true }
        return
      }

      yield mappedEvent
    }
  }
}
/* eslint-enable max-lines-per-function, max-statements, complexity */



export function* semanticMapFetchPreStreamError(
  err: any,
  context: Readonly<{
    requestId: string
    requestContext: StreamRequestContext
    tRequestStart: number
    timeoutMs?: number
    baseUrl?: string
    logTiming?: (tag: string, data: Record<string, unknown>) => void
    logStreamError?: (tag: string, payload: unknown) => void
  }>
): Generator<DomainEvent> {
  const { requestId, requestContext, timeoutMs, baseUrl, tRequestStart, logStreamError, logTiming } = context
  logStreamError?.('transport_error', { error: err, requestId, timeoutMs, baseUrl })

  if (err?.type === 'aborted') {
    const tEnd = Date.now()
    logTiming?.('end', { tRequestStart, tEnd, endReason: 'user_abort', reason: 'user_abort' })
    yield { type: 'TimingSnapshot', tRequestStart, tEnd, endReason: 'user_abort' }
    const envelope = buildAbortEnvelope({ phase: 'pre_stream', completionClass: 'aborted', reason: 'aborted', request: requestContext })
    yield { type: 'StreamAbort', reason: 'aborted', envelope }
    return
  }

  if (err?.type === 'http_error') {
    const tEnd = Date.now()
    logTiming?.('end', { tRequestStart, tEnd, endReason: 'pre_stream_error', reason: 'pre_stream_error' })
    yield { type: 'TimingSnapshot', tRequestStart, tEnd, endReason: 'pre_stream_error' }
    const normalized = normalizeOpenRouterErrorFromHttpNon2xx({
      status: Number(err.status),
      statusText: String(err.statusText ?? ''),
      bodyText: String(err.bodyText ?? ''),
      headers: (err.headers && typeof err.headers === 'object') ? (err.headers as any) : undefined,
    })
    const envelope = buildPreStreamHttpErrorEnvelope({
      phase: 'pre_stream',
      completionClass: 'error',
      status: Number(err.status),
      statusText: String(err.statusText ?? ''),
      bodyText: String(err.bodyText ?? ''),
      headers: (err.headers && typeof err.headers === 'object') ? (err.headers as any) : undefined,
      normalized,
      request: requestContext,
    })
    logStreamError?.('http_error_normalized', { raw: err, normalized })
    yield { type: 'StreamError', error: envelope, terminal: true }
    return
  }

  const appError = normalizeTransportError(err)
  const endReason = mapAppPhaseToEndReason(appError.phase, 'transport_error')
  const envelopePhase = mapAppPhaseToEnvelopePhase(appError.phase, 'pre_stream')
  if (err?.type === 'timeout') {
    logStreamError?.('timeout', { err, appError })
  }
  const tEnd = Date.now()
  logTiming?.('end', { tRequestStart, tEnd, endReason, reason: endReason })
  yield { type: 'TimingSnapshot', tRequestStart, tEnd, endReason }
  if (appError.phase === 'user_cancelled') {
    const envelope = buildAbortEnvelope({ phase: envelopePhase, completionClass: 'aborted', reason: appError.message, request: requestContext })
    yield { type: 'StreamAbort', reason: 'aborted', envelope }
    return
  }
  yield {
    type: 'StreamError',
    error: buildStreamErrorFromAppError({
      appError,
      phase: envelopePhase,
      request: requestContext,
      raw: { type: 'transport_fetch_catch', ...(err && typeof err === 'object' ? { details: err as Record<string, unknown> } : {}) },
    }),
    terminal: true,
  }
}

export function* semanticMapMissingBodyError(
  context: Readonly<{
    requestContext: StreamRequestContext
    tRequestStart: number
    logTiming?: (tag: string, data: Record<string, unknown>) => void
  }>
): Generator<DomainEvent> {
  const appError = normalizeTransportError({ code: 'missing_response_body', message: 'Missing response body stream' })
  const endReason = mapAppPhaseToEndReason(appError.phase, 'transport_error')
  const envelopePhase = mapAppPhaseToEnvelopePhase(appError.phase, 'pre_stream')
  const tEnd = Date.now()
  context.logTiming?.('end', { tRequestStart: context.tRequestStart, tEnd, endReason, reason: endReason })
  yield { type: 'TimingSnapshot', tRequestStart: context.tRequestStart, tEnd, endReason }
  yield {
    type: 'StreamError',
    error: buildStreamErrorFromAppError({ appError, phase: envelopePhase, request: context.requestContext, raw: { type: 'missing_response_body' } }),
    terminal: true,
  }
}

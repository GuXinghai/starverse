import { decodeOpenRouterSSE, type SSEDecodedEvent } from '@/next/openrouter/sse/decoder'
import { IpcContractDecodeError } from '@/next/ipc/contracts/decodeError'
import { decodeOpenRouterStreamWireEvent } from '@/next/ipc/contracts/openRouterStreamWireContracts'
import {
  normalizeOpenRouterErrorFromHttpNon2xx,
  normalizeProtocolError,
  normalizeTransportError,
} from '@/next/errors/normalizeOpenRouterError'
import {
  buildAbortEnvelope,
  buildPreStreamHttpErrorEnvelope,
} from '@/next/errors/openRouterErrorEnvelope'
import type { DomainEvent } from '@/next/state/types'
import type { OpenRouterStreamWireError } from '@/shared/ipc/openRouterStreamWire'
import { streamFetchSemanticCore } from '@/next/streaming/core/streamSemanticCore'
import type { StreamWireSemanticCoreInput } from '@/next/streaming/core/types'

function pickGenerationId(headers: Record<string, string>): string | undefined {
  const candidates = ['x-openrouter-generation-id', 'x-generation-id', 'x-request-id']
  for (const key of candidates) {
    const value = headers[key]
    if (value && value.trim()) return value.trim()
  }
  return undefined
}

function isTerminal(event: DomainEvent): boolean {
  return event.type === 'StreamDone' || event.type === 'StreamAbort' || event.type === 'StreamError'
}

function isProtocolInvalidCode(value: unknown): boolean {
  return value === 'protocol_invalid' || value === 'INVALID_WIRE_EVENT'
}

function buildMissingResponseMetaWireError(message: string): OpenRouterStreamWireError {
  return {
    kind: 'transport_error',
    code: 'INVALID_WIRE_EVENT',
    message,
  }
}

function summarizeDecodeIssues(issues: string[]): string {
  if (issues.length === 0) return ''
  const top = issues.slice(0, 5).join('; ')
  const remaining = issues.length - 5
  return remaining > 0 ? `${top}; (+${remaining} more)` : top
}

function buildInvalidWireDecodeError(error: unknown): OpenRouterStreamWireError {
  const fallbackMessage = 'Invalid wire payload shape'
  if (!(error instanceof IpcContractDecodeError)) {
    return { kind: 'transport_error', code: 'protocol_invalid', message: fallbackMessage }
  }
  const summary = summarizeDecodeIssues(error.issues)
  return {
    kind: 'transport_error',
    code: 'protocol_invalid',
    message: summary.length > 0 ? `${fallbackMessage}: ${summary}` : fallbackMessage,
  }
}

/* eslint-disable max-lines-per-function, max-statements, complexity */
export async function* streamWireSemanticCore(input: StreamWireSemanticCoreInput): AsyncGenerator<DomainEvent> {
  const signal = input.signal ?? null
  const textEncoder = new TextEncoder()

  let pendingWireError: OpenRouterStreamWireError | null = null
  let pendingHeaders: Record<string, string> | null = null
  let pendingStatus: number | null = null
  let sawResponseMeta = false
  let receivedAnySse = false
  let headerMetaEmitted = false
  let didTerminate = false
  let latestAck: number | undefined

  const maybeEmitHeaderMeta = (): DomainEvent | null => {
    if (headerMetaEmitted) return null
    if (!pendingHeaders) return null
    headerMetaEmitted = true
    const generationId = pickGenerationId(pendingHeaders)
    if (!generationId) return null
    return { type: 'MetaDelta', meta: { id: generationId } }
  }
  const readPendingWireError = (): OpenRouterStreamWireError | null => pendingWireError

  const wireByteStream: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]: async function* () {
      for await (const rawWire of input.wireEvents) {
        // Correctness first: every wire event is decoded by the schema contract at this boundary.
        // Current stream scale keeps this cost acceptable and avoids silent drift on malformed payloads.
        // If throughput profiling later identifies this as a hotspot, we can add a chunk fast-path
        // (type === 'chunk' && typeof data === 'string') and keep all other event types on schema decode.
        // Any fast-path must preserve identical semantic behavior and error mapping.
        // OpenRouter streaming reference (Handling Errors During Streaming):
        // https://openrouter.ai/docs/api/reference/streaming
        // SSE can carry in-band errors after HTTP 200; wire decode failures remain local protocol classification and close with transport-level endReason semantics.
        const wire = (() => {
          try {
            return decodeOpenRouterStreamWireEvent(rawWire)
          } catch (error) {
            if (error instanceof IpcContractDecodeError) {
              input.logStreamError?.('ipc_wire_decode_error', {
                method: error.method,
                issues: error.issues,
              })
            } else {
              input.logStreamError?.('ipc_wire_decode_error', {
                error: String((error as Record<string, unknown> | null)?.message ?? 'unknown'),
              })
            }
            pendingWireError = buildInvalidWireDecodeError(error)
            return null
          }
        })()
        if (!wire) return

        if (wire.type === 'responseMeta') {
          sawResponseMeta = true
          pendingStatus = wire.status
          pendingHeaders = wire.headers ?? {}
          continue
        }

        if (!sawResponseMeta) {
          pendingWireError = buildMissingResponseMetaWireError('Missing responseMeta before wire payload')
          return
        }

        if (wire.type === 'error') {
          pendingWireError = wire.error
          return
        }
        if (wire.type === 'end') {
          return
        }
        if (wire.type === 'chunk' && wire.data.length > 0) {
          yield textEncoder.encode(wire.data)
        }
      }

      if (!sawResponseMeta && !pendingWireError) {
        pendingWireError = buildMissingResponseMetaWireError('Missing responseMeta before stream end')
      }
    },
  }

  const decodedEvents: AsyncIterable<SSEDecodedEvent> = {
    [Symbol.asyncIterator]: async function* () {
      for await (const ev of decodeOpenRouterSSE(wireByteStream)) {
        if (ev.type === 'comment' || ev.type === 'json') {
          receivedAnySse = true
        }
        if (ev.type === 'protocol_error' && pendingWireError) {
          break
        }
        yield ev
      }
    },
  }

  for await (const event of streamFetchSemanticCore({
    decodedEvents,
    assistantMessageId: input.assistantMessageId,
    requestContext: input.requestContext,
    tRequestStart: input.tRequestStart,
    signal,
    logTiming: input.logTiming,
    logStreamError: input.logStreamError,
    mapAppPhaseToEnvelopePhase: input.mapAppPhaseToEnvelopePhase,
    mapAppPhaseToEndReason: input.mapAppPhaseToEndReason,
    buildStreamErrorFromAppError: input.buildStreamErrorFromAppError,
  })) {
    const headerMeta = maybeEmitHeaderMeta()
    if (headerMeta) yield headerMeta

    if (event.type === 'TimingSnapshot' && typeof event.tAck === 'number') {
      latestAck = event.tAck
    }

    if (isTerminal(event)) {
      didTerminate = true
    }
    yield event
    if (didTerminate) return
  }

  const trailingHeaderMeta = maybeEmitHeaderMeta()
  if (trailingHeaderMeta) yield trailingHeaderMeta
  if (didTerminate) return

  const wireError = readPendingWireError()
  if (!wireError) return

  if (wireError.kind === 'aborted') {
    const tEnd = Date.now()
    input.logTiming?.('end', {
      tRequestStart: input.tRequestStart,
      tAck: latestAck,
      tEnd,
      endReason: 'user_abort',
      reason: 'user_abort',
    })
    yield { type: 'TimingSnapshot', tAck: latestAck, tEnd, endReason: 'user_abort' }
    const envelope = buildAbortEnvelope({
      phase: receivedAnySse ? 'mid_stream' : 'pre_stream',
      completionClass: 'aborted',
      reason: wireError.message,
      request: input.requestContext,
    })
    yield { type: 'StreamAbort', reason: 'aborted', envelope }
    return
  }

  if (wireError.kind === 'http_error') {
    const tEnd = Date.now()
    input.logTiming?.('end', {
      tRequestStart: input.tRequestStart,
      tAck: latestAck,
      tEnd,
      endReason: 'pre_stream_error',
      reason: 'pre_stream_error',
    })
    yield { type: 'TimingSnapshot', tRequestStart: input.tRequestStart, tEnd, endReason: 'pre_stream_error' }
    const normalized = normalizeOpenRouterErrorFromHttpNon2xx({
      status: Number(wireError.status ?? pendingStatus ?? 0),
      statusText: String(wireError.statusText ?? ''),
      bodyText: String(wireError.bodyText ?? ''),
      headers: wireError.headers ?? pendingHeaders ?? undefined,
    })
    const envelope = buildPreStreamHttpErrorEnvelope({
      phase: 'pre_stream',
      completionClass: 'error',
      status: Number(wireError.status ?? pendingStatus ?? 0),
      statusText: String(wireError.statusText ?? ''),
      bodyText: String(wireError.bodyText ?? ''),
      headers: wireError.headers ?? pendingHeaders ?? undefined,
      normalized,
      request: input.requestContext,
    })
    yield { type: 'StreamError', error: envelope, terminal: true }
    return
  }

  const appError = isProtocolInvalidCode(wireError.code)
    ? normalizeProtocolError(
      {
        code: 'protocol_invalid',
        message: wireError.message,
        name: wireError.name,
      },
      wireError as Record<string, unknown>
    )
    : normalizeTransportError({
      code: wireError.code,
      message: wireError.message,
      name: wireError.name,
    })
  const endReason = input.mapAppPhaseToEndReason(appError.phase, 'transport_error')
  const envelopePhase = input.mapAppPhaseToEnvelopePhase(appError.phase, receivedAnySse ? 'mid_stream' : 'pre_stream')
  const tEnd = Date.now()
  input.logTiming?.('end', {
    tRequestStart: input.tRequestStart,
    tAck: latestAck,
    tEnd,
    endReason,
    reason: endReason,
  })
  yield { type: 'TimingSnapshot', tRequestStart: input.tRequestStart, tAck: latestAck, tEnd, endReason }
  if (appError.phase === 'user_cancelled') {
    const envelope = buildAbortEnvelope({
      phase: envelopePhase,
      completionClass: 'aborted',
      reason: appError.message,
      request: input.requestContext,
    })
    yield { type: 'StreamAbort', reason: 'aborted', envelope }
    return
  }

  yield {
    type: 'StreamError',
    error: input.buildStreamErrorFromAppError({
      appError,
      phase: envelopePhase,
      request: input.requestContext,
      raw: {
        type: 'ipc_transport_wire_error',
        details: wireError as Record<string, unknown>,
      },
    }),
    terminal: true,
  }
}
/* eslint-enable max-lines-per-function, max-statements, complexity */

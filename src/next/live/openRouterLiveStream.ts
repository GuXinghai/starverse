import { buildOpenRouterChatCompletionsRequest } from '@/next/openrouter/buildRequest'
import { decodeOpenRouterSSE } from '@/next/openrouter/sse/decoder'
import { mapChunkToEvents } from '@/next/openrouter/mapChunkToEvents'
import { mapResponsesEventToTerminal } from '@/next/openrouter/responsesEventMapper'
import { openrouterFetch } from '@/next/transport/openrouterFetch'
import { getOpenRouterProviderRequireParameters } from '@/next/settings/openRouterProviderSettingsClient'
import { getNetExpSettings, type NetExpSettings } from '@/next/netExp/netExpClient'
import type { ReasoningEffort, RequestedReasoningMode, StreamEndReason } from '@/next/state/types'
import type { DomainEvent } from '@/next/state/types'
import { buildOpenRouterMessages, type ContextMode, type InternalMessage } from '@/next/context/buildMessages'
import type { AppError, AppErrorPhase } from '@/next/errors/appError'
import {
  normalizeInternalBugError,
  normalizeOpenRouterErrorFromHttpNon2xx,
  normalizeOpenRouterErrorFromSseChunkError,
  normalizeProtocolError,
  normalizeTransportError,
  toNormalizedErrorEnvelope,
} from '@/next/errors/normalizeOpenRouterError'
import {
  buildAbortEnvelope,
  buildMidStreamSseErrorEnvelope,
  buildPreStreamHttpErrorEnvelope,
  buildTransportErrorEnvelope,
} from '@/next/errors/openRouterErrorEnvelope'
import type { ErrorPhase, ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import {
  OPENROUTER_STREAM_WIRE_VERSION,
  isOpenRouterStreamWireEvent,
  type OpenRouterStreamWireError,
  type OpenRouterStreamWireEvent,
} from '@/shared/ipc/openRouterStreamWire'

function isStreamErrorDebugEnabled(): boolean {
  try {
    return String(globalThis?.localStorage?.getItem('sv_debug_stream_error') ?? '').trim() === '1'
  } catch {
    return false
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function logStreamError(tag: string, payload: unknown) {
  if (!isStreamErrorDebugEnabled()) return
  try {
    console.error(`[stream-error] ${tag}`, payload)
  } catch {
    console.error(`[stream-error] ${tag} raw`, safeStringify(payload))
  }
}

function isTimingDebugEnabled(): boolean {
  try {
    return String(globalThis?.localStorage?.getItem('sv_debug_timing') ?? '').trim() === '1'
  } catch {
    return false
  }
}

function logTiming(tag: string, data: Record<string, unknown>) {
  if (!isTimingDebugEnabled()) return
  try {
    console.log(`[timing] ${tag}`, data)
  } catch {
    // ignore
  }
}

function pickGenerationId(headers: Record<string, string>): string | undefined {
  const candidates = ['x-openrouter-generation-id', 'x-generation-id', 'x-request-id']
  for (const key of candidates) {
    const value = headers[key]
    if (value && value.trim()) return value.trim()
  }
  return undefined
}

function mapAppPhaseToEnvelopePhase(appPhase: AppErrorPhase, fallback: ErrorPhase): ErrorPhase {
  if (appPhase === 'pre_stream_request_error') return 'pre_stream'
  if (appPhase === 'mid_stream_error') return 'mid_stream'
  if (appPhase === 'local_transport_error' || appPhase === 'local_protocol_error' || appPhase === 'internal_bug') {
    return fallback
  }
  if (appPhase === 'user_cancelled') return fallback
  return fallback
}

function mapAppPhaseToEndReason(
  appPhase: AppErrorPhase,
  fallback: StreamEndReason
): StreamEndReason {
  if (appPhase === 'pre_stream_request_error') return 'pre_stream_error'
  if (appPhase === 'mid_stream_error') return 'mid_stream_error'
  if (appPhase === 'local_transport_error' || appPhase === 'local_protocol_error' || appPhase === 'internal_bug') return 'transport_error'
  if (appPhase === 'user_cancelled') return 'user_abort'
  return fallback
}

function buildStreamErrorFromAppError(input: Readonly<{
  appError: AppError
  phase: ErrorPhase
  request?: { model?: string; stream?: boolean }
  raw?: Record<string, unknown>
}>): ErrorEnvelope {
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

/** Mutable timing state for a single stream request */
type TimingState = {
  tRequestStart: number
  tAck?: number
  tEnd?: number
  endReason?: StreamEndReason
  tTransportClosed?: number
  ackSource?: 'comment' | 'first_chunk'
}

type IpcRendererLike = Readonly<{
  on: (channel: string, listener: (...args: any[]) => void) => unknown
  off: (channel: string, listener: (...args: any[]) => void) => unknown
  invoke: (channel: string, ...args: any[]) => Promise<any>
}>

function isProtocolInvalidCode(value: unknown): boolean {
  return value === 'protocol_invalid' || value === 'INVALID_WIRE_EVENT'
}

function getIpcRenderer(): IpcRendererLike | null {
  const ipc = (globalThis as any).ipcRenderer as IpcRendererLike | undefined
  if (!ipc) return null
  if (typeof ipc.on !== 'function' || typeof ipc.off !== 'function' || typeof ipc.invoke !== 'function') return null
  return ipc
}

/* eslint-disable max-lines-per-function, max-statements, complexity */
async function* streamOpenRouterChatAsEventsViaIpc(
  options: LiveStreamOptions,
  netExp: NetExpSettings,
  providerRequireParameters: boolean
): AsyncGenerator<DomainEvent> {
  const signal = options.signal ?? null
  const requestContext = { model: options.config.model, stream: true }
  if (signal?.aborted) {
    const envelope = buildAbortEnvelope({ phase: 'pre_stream', completionClass: 'aborted', reason: 'aborted', request: requestContext })
    yield { type: 'StreamAbort', reason: 'aborted', envelope }
    return
  }

  const ipc = getIpcRenderer()
  if (!ipc) {
    const appError = normalizeInternalBugError({
      code: 'ipc_renderer_missing',
      message: 'Missing ipcRenderer',
    })
    const envelope = buildStreamErrorFromAppError({
      appError,
      phase: 'pre_stream',
      request: requestContext,
      raw: { type: 'ipc_missing' },
    })
    yield { type: 'StreamError', error: envelope, terminal: true }
    return
  }

  const wireQueue: OpenRouterStreamWireEvent[] = []
  let done = false
  let wake: (() => void) | null = null

  const requestId = options.requestId
  const enqueue = (event: OpenRouterStreamWireEvent) => {
    wireQueue.push(event)
    if (wake) {
      wake()
      wake = null
    }
  }
  const onChunk = (_event: unknown, payload: unknown) => {
    if (isOpenRouterStreamWireEvent(payload)) {
      enqueue(payload)
      return
    }
    enqueue({
      type: 'error',
      error: {
        kind: 'transport_error',
        message: 'Invalid wire payload shape',
        code: 'INVALID_WIRE_EVENT',
      },
    })
  }
  const onEnd = () => {
    done = true
    if (wake) {
      wake()
      wake = null
    }
  }
  const onError = (_event: unknown, payload: unknown) => {
    const message = payload && typeof payload === 'object' && 'message' in (payload as any)
      ? String((payload as any).message ?? 'IPC stream transport error')
      : 'IPC stream transport error'
    enqueue({
      type: 'error',
      error: {
        kind: 'transport_error',
        message,
      },
    })
    done = true
    if (wake) {
      wake()
      wake = null
    }
  }

  const abortHandler = () => {
    ipc.invoke('openrouter:abort', requestId).catch(() => { })
  }

  ipc.on(`openrouter:chunk:${requestId}`, onChunk)
  ipc.on(`openrouter:end:${requestId}`, onEnd)
  ipc.on(`openrouter:error:${requestId}`, onError)
  if (signal) {
    signal.addEventListener('abort', abortHandler, { once: true })
  }

  try {
    const internalMessages: InternalMessage[] = [
      ...((options.contextMessages ?? []) as InternalMessage[]),
      { role: 'user', contentText: options.userText },
    ]

    const messages = buildOpenRouterMessages(internalMessages, { mode: options.contextMode ?? 'default' })

    const reasoningEffort = options.config.requestedReasoningEffort ?? 'none'
    const reasoning =
      options.config.requestedReasoningMode === 'auto'
        ? undefined
        : {
          effort: reasoningEffort,
          ...(reasoningEffort !== 'none' && options.config.requestedReasoningExclude === true ? { exclude: true } : {}),
        }

    const devtoolsBody = buildOpenRouterChatCompletionsRequest({
      model: options.config.model,
      messages,
      stream: true,
      tools: options.config.tools ?? [],
      ...(providerRequireParameters === true ? { providerRequireParameters: true } : {}),
      ...(reasoning ? { reasoning } : {}),
    })

    const baseUrl = (options.config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    const url = `${baseUrl}/chat/completions`
    const isoTime = new Date().toISOString()

    console.warn(`\n${'='.repeat(80)}`)
    console.warn(`OPENROUTER_REQUEST_BEGIN ${requestId} ${isoTime}`)
    console.warn(`${'='.repeat(80)}`)
    console.warn(`Endpoint: ${url}`)
    console.warn(`API Key (FULL): ${options.config.apiKey}`)
    console.warn(`Headers (complete):`)
    console.warn(`  Authorization: Bearer ${options.config.apiKey}`)
    console.warn(`  HTTP-Referer: https://github.com/GuXinghai/starverse`)
    console.warn(`  X-Title: Starverse`)
    console.warn(`  Content-Type: application/json`)
    console.warn(`\nRequest Body (COMPLETE - NO SANITIZATION):`)
    console.warn(JSON.stringify(devtoolsBody, null, 2))
    console.warn(`${'='.repeat(80)}`)
    console.warn(`OPENROUTER_REQUEST_END ${requestId}`)
    console.warn(`${'='.repeat(80)}`)

    const model = (devtoolsBody as any)?.model || 'N/A'
    const stream = (devtoolsBody as any)?.stream ?? 'N/A'
    const msgCount = Array.isArray((devtoolsBody as any)?.messages) ? (devtoolsBody as any).messages.length : 0
    const reasoningForLog = (devtoolsBody as any)?.reasoning
    const hasIncludeReasoning = !!(devtoolsBody && typeof devtoolsBody === 'object' && 'include_reasoning' in devtoolsBody)
    let reasoningSummary = hasIncludeReasoning ? `include_reasoning=${(devtoolsBody as any).include_reasoning}` : 'UNSPECIFIED'
    if (reasoningForLog && typeof reasoningForLog === 'object') {
      const parts: string[] = []
      if ('effort' in reasoningForLog) parts.push(`effort=${reasoningForLog.effort}`)
      if ('max_tokens' in reasoningForLog) parts.push(`max_tokens=${reasoningForLog.max_tokens}`)
      if ('exclude' in reasoningForLog) parts.push(`exclude=${reasoningForLog.exclude}`)
      if ('enabled' in reasoningForLog) parts.push(`enabled=${reasoningForLog.enabled}`)
      reasoningSummary = parts.length > 0 ? parts.join(',') : 'EMPTY_OBJECT'
    } else if (hasIncludeReasoning) {
      reasoningSummary = `include_reasoning=${(devtoolsBody as any).include_reasoning}`
    }
    console.warn(`OR_REQ ${requestId} model=${model} stream=${stream} reasoning=${reasoningSummary} msgs=${msgCount}\n`)

    const result = await ipc.invoke('openrouter:stream-chat', {
      requestId,
      wireVersion: OPENROUTER_STREAM_WIRE_VERSION,
      assistantMessageId: options.assistantMessageId,
      userText: options.userText,
      contextMessages: options.contextMessages ?? [],
      contextMode: options.contextMode ?? 'default',
      requestBody: devtoolsBody,
      config: {
        apiKey: options.config.apiKey,
        model: options.config.model,
        requestedReasoningMode: options.config.requestedReasoningMode,
        ...(options.config.requestedReasoningEffort ? { requestedReasoningEffort: options.config.requestedReasoningEffort } : {}),
        ...(options.config.requestedReasoningExclude ? { requestedReasoningExclude: true } : {}),
        ...(options.config.timeoutMs ? { timeoutMs: options.config.timeoutMs } : {}),
        ...(options.config.baseUrl ? { baseUrl: options.config.baseUrl } : {}),
        ...(options.config.tools ? { tools: options.config.tools } : {}),
        providerRequireParameters,
        forceHttp1: netExp.forceHttp1 === true,
        tcpKeepAliveEnable: netExp.tcpKeepAliveEnable === true,
        tcpKeepAliveIdleMs: netExp.tcpKeepAliveIdleMs,
      },
    })
    if (result && result.ok === false) {
      const message = String(result.error ?? 'IPC stream start failed')
      const appError = isProtocolInvalidCode(result.code)
        ? normalizeProtocolError(
          { code: 'protocol_invalid', message },
          result as Record<string, unknown>
        )
        : normalizeTransportError({ code: 'ipc_stream_start_failed', message })
      const envelope = buildStreamErrorFromAppError({
        appError,
        phase: mapAppPhaseToEnvelopePhase(appError.phase, 'pre_stream'),
        request: requestContext,
        raw: { type: 'ipc_stream_start_failed' },
      })
      yield { type: 'StreamError', error: envelope, terminal: true }
      return
    }
  } catch (err) {
    const appError = normalizeTransportError(err)
    const envelope = buildStreamErrorFromAppError({
      appError,
      phase: mapAppPhaseToEnvelopePhase(appError.phase, 'pre_stream'),
      request: requestContext,
      raw: { type: 'ipc_stream_invoke_failed' },
    })
    yield { type: 'StreamError', error: envelope, terminal: true }
    return
  }

  try {
    const timing: TimingState = {
      tRequestStart: Date.now(),
    }
    yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart }

    const textEncoder = new TextEncoder()
    let pendingWireError: OpenRouterStreamWireError | null = null
    let pendingHeaders: Record<string, string> | null = null
    let pendingStatus: number | null = null
    let headerMetaEmitted = false

    const nextWireEvent = async (): Promise<OpenRouterStreamWireEvent | null> => {
      while (wireQueue.length === 0 && !done) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
      if (wireQueue.length > 0) return wireQueue.shift() ?? null
      return null
    }

    const wireByteStream: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: async function* () {
        while (true) {
          const wire = await nextWireEvent()
          if (!wire) return
          if (wire.type === 'responseMeta') {
            pendingStatus = wire.status
            pendingHeaders = wire.headers ?? {}
            continue
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
      },
    }

    const maybeEmitHeaderMeta = (): DomainEvent | null => {
      if (headerMetaEmitted) return null
      if (!pendingHeaders) return null
      headerMetaEmitted = true
      const generationId = pickGenerationId(pendingHeaders)
      if (!generationId) return null
      return { type: 'MetaDelta', meta: { id: generationId } }
    }

    let lastMeta: { generationId?: string; model?: string; provider?: string; finishReason?: string; nativeFinishReason?: string } = {}
    let chunkNo = 0
    let didTerminate = false
    let receivedAnySse = false

    for await (const ev of decodeOpenRouterSSE(wireByteStream)) {
      const headerMeta = maybeEmitHeaderMeta()
      if (headerMeta) yield headerMeta

      if (didTerminate) return
      if (signal?.aborted) {
        timing.tEnd = Date.now()
        timing.endReason = 'user_abort'
        logTiming('end', { ...timing, reason: 'user_abort' })
        yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'user_abort' }
        const envelope = buildAbortEnvelope({ phase: receivedAnySse ? 'mid_stream' : 'pre_stream', completionClass: 'aborted', reason: 'aborted', request: requestContext })
        yield { type: 'StreamAbort', reason: 'aborted', envelope }
        return
      }

      if (ev.type === 'comment') {
        receivedAnySse = true
        if (timing.tAck === undefined && ev.text.includes('OPENROUTER PROCESSING')) {
          timing.tAck = Date.now()
          timing.ackSource = 'comment'
          logTiming('ack', { tAck: timing.tAck, source: 'comment' })
          yield { type: 'TimingSnapshot', tAck: timing.tAck }
        }
        yield { type: 'StreamComment', text: ev.text }
        continue
      }

      if (ev.type === 'done') {
        timing.tEnd = Date.now()
        timing.endReason = 'normal_complete'
        const duration = timing.tAck != null ? timing.tEnd - timing.tAck : undefined
        logTiming('end', { ...timing, localProcessingDurationMs: duration, reason: 'normal_complete' })
        yield { type: 'TimingSnapshot', tEnd: timing.tEnd, endReason: 'normal_complete' }
        yield { type: 'StreamDone' }
        return
      }

      if (ev.type === 'protocol_error') {
        const appError = normalizeProtocolError(
          {
            code: 'protocol_invalid',
            message: ev.message,
          },
          ev.raw
        )
        const envelopePhase = mapAppPhaseToEnvelopePhase(appError.phase, receivedAnySse ? 'mid_stream' : 'pre_stream')
        const endReason = mapAppPhaseToEndReason(appError.phase, 'transport_error')
        timing.tEnd = Date.now()
        timing.endReason = endReason
        logTiming('end', { ...timing, reason: endReason })
        yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason }
        logStreamError('protocol_error', { message: ev.message, raw: ev.raw })
        const envelope = buildStreamErrorFromAppError({
          appError,
          phase: envelopePhase,
          request: requestContext,
          raw: {
            type: 'protocol_error',
            ...(ev.raw !== undefined ? { rawChunk: ev.raw } : {}),
          },
        })
        yield { type: 'StreamError', error: envelope, terminal: true }
        return
      }

      if (ev.type === 'terminal_error') {
        timing.tEnd = Date.now()
        timing.endReason = 'mid_stream_error'
        logTiming('end', { ...timing, reason: 'mid_stream_error' })
        yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'mid_stream_error' }
        return
      }

      if (ev.type !== 'json') continue
      receivedAnySse = true
      if (timing.tAck === undefined) {
        timing.tAck = Date.now()
        timing.ackSource = 'first_chunk'
        logTiming('ack', { tAck: timing.tAck, source: 'first_chunk' })
        yield { type: 'TimingSnapshot', tAck: timing.tAck }
      }

      const responsesTerminal = mapResponsesEventToTerminal({
        event: ev.value,
        request: requestContext,
      })
      if (responsesTerminal) {
        didTerminate = true
        if (responsesTerminal.meta) {
          yield { type: 'MetaDelta', meta: responsesTerminal.meta }
        }
        timing.tEnd = Date.now()
        const endReason = responsesTerminal.completionClass === 'error' ? 'mid_stream_error' : 'normal_complete'
        timing.endReason = endReason
        const duration = timing.tAck != null ? timing.tEnd - timing.tAck : undefined
        logTiming('end', { ...timing, localProcessingDurationMs: duration, reason: endReason })
        yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason }
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
        messageId: options.assistantMessageId,
        chunkNo,
      }) as any as DomainEvent[]
      for (const m of mapped) {
        if (m.type === 'MetaDelta') {
          lastMeta = {
            generationId: m.meta?.id ?? lastMeta.generationId,
            model: m.meta?.model ?? lastMeta.model,
            provider: m.meta?.provider ?? lastMeta.provider,
            finishReason: m.meta?.finish_reason ?? lastMeta.finishReason,
            nativeFinishReason: m.meta?.native_finish_reason ?? lastMeta.nativeFinishReason,
          }
          yield m
          continue
        }

        if (m.type === 'StreamError') {
          timing.tEnd = Date.now()
          timing.endReason = 'mid_stream_error'
          logTiming('end', { ...timing, reason: 'mid_stream_error_chunk' })
          yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'mid_stream_error' }
          const normalized = normalizeOpenRouterErrorFromSseChunkError({
            chunkError: m.error,
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
            request: requestContext,
          })
          logStreamError('sse_chunk_error', { raw: m.error, meta: lastMeta, normalized })
          yield { type: 'StreamError', error: envelope, terminal: true }
          return
        }

        yield m
      }
    }

    const trailingHeaderMeta = maybeEmitHeaderMeta()
    if (trailingHeaderMeta) yield trailingHeaderMeta

    const wireError = pendingWireError as OpenRouterStreamWireError | null
    if (wireError) {
      if (wireError.kind === 'aborted') {
        timing.tEnd = Date.now()
        timing.endReason = 'user_abort'
        logTiming('end', { ...timing, reason: 'user_abort' })
        yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'user_abort' }
        const envelope = buildAbortEnvelope({ phase: receivedAnySse ? 'mid_stream' : 'pre_stream', completionClass: 'aborted', reason: wireError.message, request: requestContext })
        yield { type: 'StreamAbort', reason: 'aborted', envelope }
        return
      }

      if (wireError.kind === 'http_error') {
        timing.tEnd = Date.now()
        timing.endReason = 'pre_stream_error'
        logTiming('end', { ...timing, reason: 'pre_stream_error' })
        yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tEnd: timing.tEnd, endReason: 'pre_stream_error' }
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
          request: requestContext,
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
      const endReason = mapAppPhaseToEndReason(appError.phase, 'transport_error')
      const envelopePhase = mapAppPhaseToEnvelopePhase(appError.phase, receivedAnySse ? 'mid_stream' : 'pre_stream')
      timing.tEnd = Date.now()
      timing.endReason = endReason
      logTiming('end', { ...timing, reason: endReason })
      yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tAck: timing.tAck, tEnd: timing.tEnd, endReason }
      if (appError.phase === 'user_cancelled') {
        const envelope = buildAbortEnvelope({
          phase: envelopePhase,
          completionClass: 'aborted',
          reason: appError.message,
          request: requestContext,
        })
        yield { type: 'StreamAbort', reason: 'aborted', envelope }
        return
      }
      yield {
        type: 'StreamError',
        error: buildStreamErrorFromAppError({
          appError,
          phase: envelopePhase,
          request: requestContext,
          raw: {
            type: 'ipc_transport_wire_error',
            details: wireError as Record<string, unknown>,
          },
        }),
        terminal: true,
      }
    }
  } finally {
    ipc.off(`openrouter:chunk:${requestId}`, onChunk)
    ipc.off(`openrouter:end:${requestId}`, onEnd)
    ipc.off(`openrouter:error:${requestId}`, onError)
    if (signal) {
      signal.removeEventListener('abort', abortHandler)
    }
  }
}
/* eslint-enable max-lines-per-function, max-statements, complexity */

export type LiveRequestConfig = Readonly<{
  apiKey: string
  model: string
  requestedReasoningMode: RequestedReasoningMode
  requestedReasoningEffort?: ReasoningEffort
  requestedReasoningExclude?: boolean
  /**
   * Tool definitions sent in every request when tool calling is supported.
   * For minimal compliance, callers may pass an empty array.
   */
  tools?: unknown[]
  timeoutMs?: number
  baseUrl?: string
}>

export type LiveStreamOptions = Readonly<{
  requestId: string
  assistantMessageId: string
  userText: string
  /**
   * Prior turns to include as request `messages[]` context.
   * Must NOT include the current user input (passed via `userText`).
   *
   * Keep this as InternalMessage[] to allow future multimodal/tool support without
   * pushing OpenRouter request-shaping into UI layers.
   */
  contextMessages?: ReadonlyArray<InternalMessage>
  contextMode?: ContextMode
  signal?: AbortSignal | null
  config: LiveRequestConfig
}>

/**
 * LIVE pipeline: openrouterFetch -> decodeOpenRouterSSE -> mapChunkToEvents.
 * This function does not mutate state; it only yields SSOT Domain Events.
 */
/* eslint-disable max-lines-per-function, max-statements, complexity */
export async function* streamOpenRouterChatAsEvents(options: LiveStreamOptions): AsyncGenerator<DomainEvent> {
  const signal = options.signal ?? null
  if (signal?.aborted) {
    const envelope = buildAbortEnvelope({ phase: 'pre_stream', completionClass: 'aborted', reason: 'aborted', request: { model: options.config.model, stream: true } })
    yield { type: 'StreamAbort', reason: 'aborted', envelope }
    return
  }

  const { apiKey, model } = options.config
  const requestContext = { model, stream: true }

  const providerRequireParameters = await getOpenRouterProviderRequireParameters()
  const netExp = await getNetExpSettings()
  if (netExp.streamInMainProcess === true) {
    // IPC path handles its own timing; events are forwarded from main process
    yield* streamOpenRouterChatAsEventsViaIpc(options, netExp, providerRequireParameters)
    return
  }

  // Initialize timing state for browser path
  const timing: TimingState = {
    tRequestStart: Date.now(),
  }
  logTiming('request_start', { tRequestStart: timing.tRequestStart, requestId: options.requestId })

  const internalMessages: InternalMessage[] = [
    ...((options.contextMessages ?? []) as InternalMessage[]),
    { role: 'user', contentText: options.userText },
  ]

  const messages = buildOpenRouterMessages(internalMessages, { mode: options.contextMode ?? 'default' })

  const reasoning =
    options.config.requestedReasoningMode === 'auto'
      ? undefined
      : {
        effort: options.config.requestedReasoningEffort ?? 'none',
        ...(options.config.requestedReasoningExclude === true ? { exclude: true } : {}),
      }

  const body = buildOpenRouterChatCompletionsRequest({
    model,
    messages,
    stream: true,
    tools: options.config.tools ?? [],
    ...(providerRequireParameters === true ? { providerRequireParameters: true } : {}),
    ...(reasoning ? { reasoning } : {}),
  })

  let transport
  try {
    transport = await openrouterFetch({
      apiKey,
      body,
      requestId: options.requestId,
      signal,
      timeoutMs: options.config.timeoutMs,
      baseUrl: options.config.baseUrl,
    })
  } catch (err: any) {
    logStreamError('transport_error', {
      error: err,
      requestId: options.requestId,
      timeoutMs: options.config.timeoutMs,
      baseUrl: options.config.baseUrl,
    })
    if (err?.type === 'aborted') {
      // user_abort: local abort triggered
      timing.tEnd = Date.now()
      timing.endReason = 'user_abort'
      logTiming('end', { ...timing, reason: 'user_abort' })
      yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'user_abort' }
      const envelope = buildAbortEnvelope({ phase: 'pre_stream', completionClass: 'aborted', reason: 'aborted', request: requestContext })
      yield { type: 'StreamAbort', reason: 'aborted', envelope }
      return
    }

    if (err?.type === 'http_error') {
      // pre_stream_error: HTTP error before SSE streaming started
      timing.tEnd = Date.now()
      timing.endReason = 'pre_stream_error'
      logTiming('end', { ...timing, reason: 'pre_stream_error' })
      yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tEnd: timing.tEnd, endReason: 'pre_stream_error' }
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
      logStreamError('http_error_normalized', { raw: err, normalized })
      yield { type: 'StreamError', error: envelope, terminal: true }
      return
    }

    const appError = normalizeTransportError(err)
    const endReason = mapAppPhaseToEndReason(appError.phase, 'transport_error')
    const envelopePhase = mapAppPhaseToEnvelopePhase(appError.phase, 'pre_stream')
    if (err?.type === 'timeout') {
      logStreamError('timeout', { err, appError })
    }
    timing.tEnd = Date.now()
    timing.endReason = endReason
    logTiming('end', { ...timing, reason: endReason })
    yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tAck: timing.tAck, tEnd: timing.tEnd, endReason }
    if (appError.phase === 'user_cancelled') {
      const envelope = buildAbortEnvelope({
        phase: envelopePhase,
        completionClass: 'aborted',
        reason: appError.message,
        request: requestContext,
      })
      yield { type: 'StreamAbort', reason: 'aborted', envelope }
      return
    }
    yield {
      type: 'StreamError',
      error: buildStreamErrorFromAppError({
        appError,
        phase: envelopePhase,
        request: requestContext,
        raw: {
          type: 'transport_fetch_catch',
          ...(err && typeof err === 'object' ? { details: err as Record<string, unknown> } : {}),
        },
      }),
      terminal: true,
    }
    return
  }

  let lastMeta: { generationId?: string; model?: string; provider?: string; finishReason?: string; nativeFinishReason?: string } = {}
  let chunkNo = 0  // 递增的 chunk 序号，用于诊断追踪
  let didTerminate = false

  if (transport.generationId) {
    yield { type: 'MetaDelta', meta: { id: transport.generationId } }
    lastMeta.generationId = transport.generationId
  }

  const bodyStream = transport.response.body
  if (!bodyStream) {
    const appError = normalizeTransportError({
      code: 'missing_response_body',
      message: 'Missing response body stream',
    })
    const endReason = mapAppPhaseToEndReason(appError.phase, 'transport_error')
    const envelopePhase = mapAppPhaseToEnvelopePhase(appError.phase, 'pre_stream')
    timing.tEnd = Date.now()
    timing.endReason = endReason
    logTiming('end', { ...timing, reason: endReason })
    yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tEnd: timing.tEnd, endReason }
    yield {
      type: 'StreamError',
      error: buildStreamErrorFromAppError({
        appError,
        phase: envelopePhase,
        request: requestContext,
        raw: { type: 'missing_response_body' },
      }),
      terminal: true,
    }
    return
  }

  // Emit initial timing snapshot with tRequestStart (tAck will come later)
  yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart }

  let receivedAnySse = false
  for await (const ev of decodeOpenRouterSSE(bodyStream)) {
    if (didTerminate) return
    if (signal?.aborted) {
      // Abort wins: once aborted, do not emit StreamError even if transport surfaces an error afterward.
      // After abort, ignore any later terminal events for this run.
      // user_abort: highest priority
      timing.tEnd = Date.now()
      timing.endReason = 'user_abort'
      logTiming('end', { ...timing, reason: 'user_abort' })
      yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'user_abort' }
      const envelope = buildAbortEnvelope({ phase: receivedAnySse ? 'mid_stream' : 'pre_stream', completionClass: 'aborted', reason: 'aborted', request: requestContext })
      yield { type: 'StreamAbort', reason: 'aborted', envelope }
      return
    }

    if (ev.type === 'comment') {
      receivedAnySse = true
      // Capture tAck on first OPENROUTER PROCESSING comment (only once)
      if (timing.tAck === undefined && ev.text.includes('OPENROUTER PROCESSING')) {
        timing.tAck = Date.now()
        timing.ackSource = 'comment'
        logTiming('ack', { tAck: timing.tAck, source: 'comment' })
        yield { type: 'TimingSnapshot', tAck: timing.tAck }
      }
      yield { type: 'StreamComment', text: ev.text }
      continue
    }

    if (ev.type === 'done') {
      // normal_complete: received [DONE] signal
      timing.tEnd = Date.now()
      timing.endReason = 'normal_complete'
      const duration = timing.tAck != null ? timing.tEnd - timing.tAck : undefined
      logTiming('end', { ...timing, localProcessingDurationMs: duration, reason: 'normal_complete' })
      yield { type: 'TimingSnapshot', tEnd: timing.tEnd, endReason: 'normal_complete' }
      yield { type: 'StreamDone' }
      return
    }

    if (ev.type === 'protocol_error') {
      const appError = normalizeProtocolError(
        {
          code: 'protocol_invalid',
          message: ev.message,
        },
        ev.raw
      )
      const envelopePhase = mapAppPhaseToEnvelopePhase(appError.phase, receivedAnySse ? 'mid_stream' : 'pre_stream')
      const endReason = mapAppPhaseToEndReason(appError.phase, 'transport_error')
      timing.tEnd = Date.now()
      timing.endReason = endReason
      logTiming('end', { ...timing, reason: endReason })
      yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason }
      logStreamError('protocol_error', { message: ev.message, raw: ev.raw })
      const envelope = buildStreamErrorFromAppError({
        appError,
        phase: envelopePhase,
        request: requestContext,
        raw: {
          type: 'protocol_error',
          ...(ev.raw !== undefined ? { rawChunk: ev.raw } : {}),
        },
      })
      yield { type: 'StreamError', error: envelope, terminal: true }
      return
    }

    if (ev.type === 'terminal_error') {
      // mid_stream_error: unified error event from OpenRouter
      timing.tEnd = Date.now()
      timing.endReason = 'mid_stream_error'
      logTiming('end', { ...timing, reason: 'mid_stream_error' })
      yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'mid_stream_error' }
      // StreamError is already emitted from the JSON chunk mapping; stop here.
      return
    }

    if (ev.type === 'json') {
      receivedAnySse = true
      // Fallback: capture tAck on first JSON data chunk if no comment seen
      if (timing.tAck === undefined) {
        timing.tAck = Date.now()
        timing.ackSource = 'first_chunk'
        logTiming('ack', { tAck: timing.tAck, source: 'first_chunk' })
        yield { type: 'TimingSnapshot', tAck: timing.tAck }
      }

      const responsesTerminal = mapResponsesEventToTerminal({
        event: ev.value,
        request: requestContext,
      })
      if (responsesTerminal) {
        didTerminate = true
        if (responsesTerminal.meta) {
          yield { type: 'MetaDelta', meta: responsesTerminal.meta }
        }
        timing.tEnd = Date.now()
        const endReason = responsesTerminal.completionClass === 'error' ? 'mid_stream_error' : 'normal_complete'
        timing.endReason = endReason
        const duration = timing.tAck != null ? timing.tEnd - timing.tAck : undefined
        logTiming('end', { ...timing, localProcessingDurationMs: duration, reason: endReason })
        yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason }
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
        messageId: options.assistantMessageId,
        chunkNo,
      }) as any as DomainEvent[]
      for (const m of mapped) {
        if (m.type === 'MetaDelta') {
          lastMeta = {
            generationId: m.meta?.id ?? lastMeta.generationId,
            model: m.meta?.model ?? lastMeta.model,
            provider: m.meta?.provider ?? lastMeta.provider,
            finishReason: m.meta?.finish_reason ?? lastMeta.finishReason,
            nativeFinishReason: m.meta?.native_finish_reason ?? lastMeta.nativeFinishReason,
          }
          yield m
          continue
        }

        if (m.type === 'StreamError') {
          // mid_stream_error: error in SSE data chunk
          timing.tEnd = Date.now()
          timing.endReason = 'mid_stream_error'
          logTiming('end', { ...timing, reason: 'mid_stream_error_chunk' })
          yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'mid_stream_error' }
          const normalized = normalizeOpenRouterErrorFromSseChunkError({
            chunkError: m.error,
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
            request: requestContext,
          })
          logStreamError('sse_chunk_error', { raw: m.error, meta: lastMeta, normalized })
          yield { type: 'StreamError', error: envelope, terminal: true }
          return
        }

        yield m
      }
    }
  }
}
/* eslint-enable max-lines-per-function, max-statements, complexity */

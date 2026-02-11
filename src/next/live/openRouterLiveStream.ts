import { buildOpenRouterChatCompletionsRequest } from '@/next/openrouter/buildRequest'
import { decodeOpenRouterSSE } from '@/next/openrouter/sse/decoder'
import {
  buildStreamErrorFromAppError,
  mapAppPhaseToEndReason,
  mapAppPhaseToEnvelopePhase,
  streamFetchSemanticCore,
  streamWireSemanticCore,
} from '@/next/streaming/core'
import { openrouterFetch } from '@/next/transport/openrouterFetch'
import { getOpenRouterProviderRequireParameters } from '@/next/settings/openRouterProviderSettingsClient'
import { getNetExpSettings, type NetExpSettings } from '@/next/netExp/netExpClient'
import type { ReasoningEffort, RequestedReasoningMode, StreamEndReason } from '@/next/state/types'
import type { DomainEvent } from '@/next/state/types'
import { buildOpenRouterMessages, type ContextMode, type InternalMessage } from '@/next/context/buildMessages'
import {
  normalizeInternalBugError,
  normalizeOpenRouterErrorFromHttpNon2xx,
  normalizeProtocolError,
  normalizeTransportError,
} from '@/next/errors/normalizeOpenRouterError'
import {
  buildAbortEnvelope,
  buildPreStreamHttpErrorEnvelope,
} from '@/next/errors/openRouterErrorEnvelope'
import {
  OPENROUTER_STREAM_WIRE_VERSION,
  isOpenRouterStreamWireEvent,
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

  const abortHandler = () => {
    ipc.invoke('openrouter:abort', requestId).catch(() => { })
  }

  ipc.on(`openrouter:chunk:${requestId}`, onChunk)
  ipc.on(`openrouter:end:${requestId}`, onEnd)
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

    // const baseUrl = (options.config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    // const url = `${baseUrl}/chat/completions`
    // const isoTime = new Date().toISOString()

    // console.warn(`\n${'='.repeat(80)}`)
    // console.warn(`OPENROUTER_REQUEST_BEGIN ${requestId} ${isoTime}`)
    // console.warn(`${'='.repeat(80)}`)
    // console.warn(`Endpoint: ${url}`)
    // console.warn(`API Key (FULL): ${options.config.apiKey}`)
    // console.warn(`Headers (complete):`)
    // console.warn(`  Authorization: Bearer ${options.config.apiKey}`)
    // console.warn(`  HTTP-Referer: https://github.com/GuXinghai/starverse`)
    // console.warn(`  X-Title: Starverse`)
    // console.warn(`  Content-Type: application/json`)
    // console.warn(`\nRequest Body (COMPLETE - NO SANITIZATION):`)
    // console.warn(JSON.stringify(devtoolsBody, null, 2))
    // console.warn(`${'='.repeat(80)}`)
    // console.warn(`OPENROUTER_REQUEST_END ${requestId}`)
    // console.warn(`${'='.repeat(80)}`)

    // const model = (devtoolsBody as any)?.model || 'N/A'
    // const stream = (devtoolsBody as any)?.stream ?? 'N/A'
    // const msgCount = Array.isArray((devtoolsBody as any)?.messages) ? (devtoolsBody as any).messages.length : 0
    // const reasoningForLog = (devtoolsBody as any)?.reasoning
    // const hasIncludeReasoning = !!(devtoolsBody && typeof devtoolsBody === 'object' && 'include_reasoning' in devtoolsBody)
    // let reasoningSummary = hasIncludeReasoning ? `include_reasoning=${(devtoolsBody as any).include_reasoning}` : 'UNSPECIFIED'
    // if (reasoningForLog && typeof reasoningForLog === 'object') {
    //   const parts: string[] = []
    //   if ('effort' in reasoningForLog) parts.push(`effort=${reasoningForLog.effort}`)
    //   if ('max_tokens' in reasoningForLog) parts.push(`max_tokens=${reasoningForLog.max_tokens}`)
    //   if ('exclude' in reasoningForLog) parts.push(`exclude=${reasoningForLog.exclude}`)
    //   if ('enabled' in reasoningForLog) parts.push(`enabled=${reasoningForLog.enabled}`)
    //   reasoningSummary = parts.length > 0 ? parts.join(',') : 'EMPTY_OBJECT'
    // } else if (hasIncludeReasoning) {
    //   reasoningSummary = `include_reasoning=${(devtoolsBody as any).include_reasoning}`
    // }
    // console.warn(`OR_REQ ${requestId} model=${model} stream=${stream} reasoning=${reasoningSummary} msgs=${msgCount}\n`)

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
    const nextWireEvent = async (): Promise<OpenRouterStreamWireEvent | null> => {
      while (wireQueue.length === 0 && !done) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
      if (wireQueue.length > 0) return wireQueue.shift() ?? null
      return null
    }

    const wireEvents: AsyncIterable<OpenRouterStreamWireEvent> = {
      [Symbol.asyncIterator]: async function* () {
        while (true) {
          const wire = await nextWireEvent()
          if (!wire) return
          yield wire
        }
      },
    }

    yield* streamWireSemanticCore({
      wireEvents,
      assistantMessageId: options.assistantMessageId,
      requestContext,
      tRequestStart: Date.now(),
      signal,
      logTiming,
      logStreamError,
      mapAppPhaseToEnvelopePhase,
      mapAppPhaseToEndReason,
      buildStreamErrorFromAppError,
    })
  } finally {
    ipc.off(`openrouter:chunk:${requestId}`, onChunk)
    ipc.off(`openrouter:end:${requestId}`, onEnd)
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

  if (transport.generationId) {
    yield { type: 'MetaDelta', meta: { id: transport.generationId } }
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

  yield* streamFetchSemanticCore({
    decodedEvents: decodeOpenRouterSSE(bodyStream),
    assistantMessageId: options.assistantMessageId,
    requestContext,
    tRequestStart: timing.tRequestStart,
    signal,
    logTiming,
    logStreamError,
    mapAppPhaseToEnvelopePhase,
    mapAppPhaseToEndReason,
    buildStreamErrorFromAppError,
  })
}
/* eslint-enable max-lines-per-function, max-statements, complexity */

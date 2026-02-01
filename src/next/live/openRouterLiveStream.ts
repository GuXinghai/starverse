import { buildOpenRouterChatCompletionsRequest } from '@/next/openrouter/buildRequest'
import { decodeOpenRouterSSE } from '@/next/openrouter/sse/decoder'
import { mapChunkToEvents } from '@/next/openrouter/mapChunkToEvents'
import { openrouterFetch } from '@/next/transport/openrouterFetch'
import { getOpenRouterProviderRequireParameters } from '@/next/settings/openRouterProviderSettingsClient'
import { getNetExpSettings, type NetExpSettings } from '@/next/netExp/netExpClient'
import type { ReasoningEffort, RequestedReasoningMode, StreamEndReason } from '@/next/state/types'
import type { DomainEvent } from '@/next/state/types'
import { buildOpenRouterMessages, type ContextMode, type InternalMessage } from '@/next/context/buildMessages'
import {
  normalizeOpenRouterErrorFromHttpNon2xx,
  normalizeOpenRouterErrorFromSseChunkError,
  normalizeOpenRouterUnknownStreamingError,
} from '@/next/errors/normalizeOpenRouterError'

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

function getIpcRenderer(): IpcRendererLike | null {
  const ipc = (globalThis as any).ipcRenderer as IpcRendererLike | undefined
  if (!ipc) return null
  if (typeof ipc.on !== 'function' || typeof ipc.off !== 'function' || typeof ipc.invoke !== 'function') return null
  return ipc
}

async function* streamOpenRouterChatAsEventsViaIpc(
  options: LiveStreamOptions,
  netExp: NetExpSettings,
  providerRequireParameters: boolean
): AsyncGenerator<DomainEvent> {
  const signal = options.signal ?? null
  if (signal?.aborted) {
    yield { type: 'StreamAbort', reason: 'aborted' }
    return
  }

  const ipc = getIpcRenderer()
  if (!ipc) {
    yield { type: 'StreamError', error: normalizeOpenRouterUnknownStreamingError({ message: 'Missing ipcRenderer' }), terminal: true }
    return
  }

  const queue: DomainEvent[] = []
  let done = false
  let wake: (() => void) | null = null

  const requestId = options.requestId
  const onChunk = (_event: unknown, payload: DomainEvent) => {
    queue.push(payload)
    if (wake) {
      wake()
      wake = null
    }
  }
  const onEnd = () => {
    done = true
    if (wake) {
      wake()
      wake = null
    }
  }
  const onError = (_event: unknown, payload: unknown) => {
    queue.push({ type: 'StreamError', error: payload, terminal: true })
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
      assistantMessageId: options.assistantMessageId,
      userText: options.userText,
      contextMessages: options.contextMessages ?? [],
      contextMode: options.contextMode ?? 'default',
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
      yield { type: 'StreamError', error: normalizeOpenRouterUnknownStreamingError({ message: String(result.error ?? 'IPC stream start failed') }), terminal: true }
      return
    }
  } catch (err) {
    yield { type: 'StreamError', error: normalizeOpenRouterUnknownStreamingError({ message: String((err as any)?.message ?? err) }), terminal: true }
    return
  }

  try {
    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }

      while (queue.length > 0) {
        const next = queue.shift()
        if (next) yield next
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

function toStreamError(err: unknown): DomainEvent {
  const message =
    err && typeof err === 'object' && 'message' in (err as any) ? String((err as any).message ?? 'Error') : 'Error'
  return { type: 'StreamError', error: normalizeOpenRouterUnknownStreamingError({ message, details: { name: (err as any)?.name } }), terminal: true }
}

/**
 * LIVE pipeline: openrouterFetch -> decodeOpenRouterSSE -> mapChunkToEvents.
 * This function does not mutate state; it only yields SSOT Domain Events.
 */
export async function* streamOpenRouterChatAsEvents(options: LiveStreamOptions): AsyncGenerator<DomainEvent> {
  const signal = options.signal ?? null
  if (signal?.aborted) {
    yield { type: 'StreamAbort', reason: 'aborted' }
    return
  }

  const { apiKey, model } = options.config

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
      yield { type: 'StreamAbort', reason: 'aborted' }
      return
    }

    if (err?.type === 'http_error') {
      // pre_stream_error: HTTP error before SSE streaming started
      timing.tEnd = Date.now()
      timing.endReason = 'pre_stream_error'
      logTiming('end', { ...timing, reason: 'pre_stream_error' })
      yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tEnd: timing.tEnd, endReason: 'pre_stream_error' }
      const env = normalizeOpenRouterErrorFromHttpNon2xx({
        status: Number(err.status),
        statusText: String(err.statusText ?? ''),
        bodyText: String(err.bodyText ?? ''),
        headers: (err.headers && typeof err.headers === 'object') ? (err.headers as any) : undefined,
      })
      logStreamError('http_error_normalized', { raw: err, normalized: env })
      yield { type: 'StreamError', error: env, terminal: true }
      return
    }

    if (err?.type === 'timeout') {
      logStreamError('timeout', err)
    }

    // transport_error: network/transport failure
    timing.tEnd = Date.now()
    timing.endReason = 'transport_error'
    logTiming('end', { ...timing, reason: 'transport_error' })
    yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'transport_error' }
    yield toStreamError(err)
    return
  }

  let lastMeta: { generationId?: string; model?: string; provider?: string; finishReason?: string; nativeFinishReason?: string } = {}
  let chunkNo = 0  // 递增的 chunk 序号，用于诊断追踪

  if (transport.generationId) {
    yield { type: 'MetaDelta', meta: { id: transport.generationId } }
    lastMeta.generationId = transport.generationId
  }

  const bodyStream = transport.response.body
  if (!bodyStream) {
    // transport_error: missing body
    timing.tEnd = Date.now()
    timing.endReason = 'transport_error'
    logTiming('end', { ...timing, reason: 'transport_error_no_body' })
    yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tEnd: timing.tEnd, endReason: 'transport_error' }
    yield toStreamError({ message: 'Missing response body stream' })
    return
  }

  // Emit initial timing snapshot with tRequestStart (tAck will come later)
  yield { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart }

  for await (const ev of decodeOpenRouterSSE(bodyStream)) {
    if (signal?.aborted) {
      // user_abort: highest priority
      timing.tEnd = Date.now()
      timing.endReason = 'user_abort'
      logTiming('end', { ...timing, reason: 'user_abort' })
      yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'user_abort' }
      yield { type: 'StreamAbort', reason: 'aborted' }
      return
    }

    if (ev.type === 'comment') {
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
      // transport_error: protocol parse failure
      timing.tEnd = Date.now()
      timing.endReason = 'transport_error'
      logTiming('end', { ...timing, reason: 'transport_error_protocol' })
      yield { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'transport_error' }
      logStreamError('protocol_error', { message: ev.message, raw: ev.raw })
      yield {
        type: 'StreamError',
        error: normalizeOpenRouterUnknownStreamingError({ message: ev.message, details: { raw: ev.raw ? { raw: ev.raw } : {} } }),
        terminal: true
      }
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
      // Fallback: capture tAck on first JSON data chunk if no comment seen
      if (timing.tAck === undefined) {
        timing.tAck = Date.now()
        timing.ackSource = 'first_chunk'
        logTiming('ack', { tAck: timing.tAck, source: 'first_chunk' })
        yield { type: 'TimingSnapshot', tAck: timing.tAck }
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
          const env = normalizeOpenRouterErrorFromSseChunkError({
            chunkError: m.error,
            meta: lastMeta,
          })
          logStreamError('sse_chunk_error', { raw: m.error, meta: lastMeta, normalized: env })
          yield { type: 'StreamError', error: env, terminal: true }
          continue
        }

        yield m
      }
    }
  }
}

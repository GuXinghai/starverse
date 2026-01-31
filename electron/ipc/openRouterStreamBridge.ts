import { ipcMain, type WebContents } from 'electron'
import { Client, buildConnector } from 'undici'
import { buildOpenRouterChatCompletionsRequest } from '../../src/next/openrouter/buildRequest'
import { decodeOpenRouterSSE } from '../../src/next/openrouter/sse/decoder'
import { mapChunkToEvents } from '../../src/next/openrouter/mapChunkToEvents'
import { buildOpenRouterMessages, type ContextMode, type InternalMessage } from '../../src/next/context/buildMessages'
import {
  normalizeOpenRouterErrorFromHttpNon2xx,
  normalizeOpenRouterErrorFromSseChunkError,
  normalizeOpenRouterUnknownStreamingError,
} from '../../src/next/errors/normalizeOpenRouterError'
import type { DomainEvent, ReasoningEffort, RequestedReasoningMode, StreamEndReason } from '../../src/next/state/types'

const activeControllers = new Map<string, AbortController>()

type StreamChatRequest = Readonly<{
  requestId: string
  assistantMessageId: string
  userText: string
  contextMessages?: ReadonlyArray<InternalMessage>
  contextMode?: ContextMode
  config: Readonly<{
    apiKey: string
    model: string
    requestedReasoningMode: RequestedReasoningMode
    requestedReasoningEffort?: ReasoningEffort
    requestedReasoningExclude?: boolean
    tools?: unknown[]
    timeoutMs?: number
    baseUrl?: string
    providerRequireParameters?: boolean
    forceHttp1?: boolean
    tcpKeepAliveEnable?: boolean
    tcpKeepAliveIdleMs?: number
  }>
}>

type StreamMeta = {
  generationId?: string
  model?: string
  provider?: string
  finishReason?: string
  nativeFinishReason?: string
}

function pickGenerationId(headers: Record<string, string>): string | undefined {
  const candidates = ['x-openrouter-generation-id', 'x-generation-id', 'x-request-id']
  for (const key of candidates) {
    const value = headers[key]
    if (value && value.trim()) return value.trim()
  }
  return undefined
}

function headersToRecord(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const record: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      record[key.toLowerCase()] = value
    } else if (Array.isArray(value)) {
      record[key.toLowerCase()] = value.join(',')
    }
  }
  return record
}

function toStreamError(err: unknown): DomainEvent {
  const message =
    err && typeof err === 'object' && 'message' in (err as any) ? String((err as any).message ?? 'Error') : 'Error'
  return { type: 'StreamError', error: normalizeOpenRouterUnknownStreamingError({ message, details: { name: (err as any)?.name } }), terminal: true }
}

function sendEvent(sender: WebContents, requestId: string, event: DomainEvent) {
  sender.send(`openrouter:chunk:${requestId}`, event)
}

function sendEnd(sender: WebContents, requestId: string) {
  sender.send(`openrouter:end:${requestId}`)
}

/** Mutable timing state for a single stream request (main process clock domain) */
type TimingState = {
  tRequestStart: number
  tAck?: number
  tEnd?: number
  endReason?: StreamEndReason
  tTransportClosed?: number
  ackSource?: 'comment' | 'first_chunk'
}

function logTiming(requestId: string, tag: string, data: Record<string, unknown>) {
  // Debug logging for timing (enabled via environment variable in main process)
  if (process.env.SV_DEBUG_TIMING === '1') {
    console.log(`[timing] [${requestId}] ${tag}`, data)
  }
}

async function startStream(sender: WebContents, payload: StreamChatRequest): Promise<void> {
  const controller = new AbortController()
  activeControllers.set(payload.requestId, controller)

  let client: Client | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  // Initialize timing state outside try block so it's accessible in catch
  const timing: TimingState = {
    tRequestStart: Date.now(),
  }
  logTiming(payload.requestId, 'request_start', { tRequestStart: timing.tRequestStart })

  try {
    const internalMessages: InternalMessage[] = [
      ...((payload.contextMessages ?? []) as InternalMessage[]),
      { role: 'user', contentText: payload.userText },
    ]

    const messages = buildOpenRouterMessages(internalMessages, { mode: payload.contextMode ?? 'default' })

    const reasoning =
      payload.config.requestedReasoningMode === 'auto'
        ? undefined
        : {
          effort: payload.config.requestedReasoningEffort ?? 'none',
          ...(payload.config.requestedReasoningExclude === true ? { exclude: true } : {}),
        }

    const body = buildOpenRouterChatCompletionsRequest({
      model: payload.config.model,
      messages,
      stream: true,
      usage: { include: true },
      tools: payload.config.tools ?? [],
      ...(payload.config.providerRequireParameters === true ? { providerRequireParameters: true } : {}),
      ...(reasoning ? { reasoning } : {}),
    })

    const baseUrl = (payload.config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    const url = new URL(baseUrl)
    const origin = `${url.protocol}//${url.host}`
    const basePath = url.pathname.replace(/\/+$/, '')
    const requestPath = `${basePath}/chat/completions`.startsWith('/')
      ? `${basePath}/chat/completions`
      : `/${basePath}/chat/completions`

    const allowH2 = payload.config.forceHttp1 === true ? false : true
    const connector = buildConnector({})
    client = new Client(origin, {
      allowH2,
      connect: (options, callback) => {
        connector(options, (err, socket) => {
          if (err) {
            callback(err, null)
            return
          }
          if (socket && payload.config.tcpKeepAliveEnable === true) {
            try {
              socket.setKeepAlive(true, Math.max(0, Math.floor(payload.config.tcpKeepAliveIdleMs ?? 60000)))
            } catch {
              // ignore keepalive errors
            }
          }
          callback(null, socket)
        })
      },
    })

    if (typeof payload.config.timeoutMs === 'number' && payload.config.timeoutMs > 0) {
      timeoutId = setTimeout(() => controller.abort(), payload.config.timeoutMs)
    }

    const response = await client.request({
      path: requestPath,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${payload.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
        'X-Title': 'Starverse',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const headersRecord = headersToRecord(response.headers)

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const chunks: Buffer[] = []
      for await (const chunk of response.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const bodyText = Buffer.concat(chunks).toString('utf8')
      // pre_stream_error: HTTP error before SSE streaming started
      timing.tEnd = Date.now()
      timing.endReason = 'pre_stream_error'
      logTiming(payload.requestId, 'end', { ...timing, reason: 'pre_stream_error' })
      sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tEnd: timing.tEnd, endReason: 'pre_stream_error' })
      const env = normalizeOpenRouterErrorFromHttpNon2xx({
        status: response.statusCode,
        statusText: '',
        bodyText,
        headers: headersRecord,
      })
      sendEvent(sender, payload.requestId, { type: 'StreamError', error: env, terminal: true })
      sendEnd(sender, payload.requestId)
      return
    }

    const generationId = pickGenerationId(headersRecord)
    if (generationId) {
      sendEvent(sender, payload.requestId, { type: 'MetaDelta', meta: { id: generationId } })
    }

    let lastMeta: StreamMeta = {}
    let chunkNo = 0

    // Emit initial timing snapshot with tRequestStart (tAck will come later)
    sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart })

    for await (const ev of decodeOpenRouterSSE(response.body)) {
      if (controller.signal.aborted) {
        // user_abort: highest priority
        timing.tEnd = Date.now()
        timing.endReason = 'user_abort'
        logTiming(payload.requestId, 'end', { ...timing, reason: 'user_abort' })
        sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'user_abort' })
        sendEvent(sender, payload.requestId, { type: 'StreamAbort', reason: 'aborted' })
        sendEnd(sender, payload.requestId)
        return
      }

      if (ev.type === 'comment') {
        // Capture tAck on first OPENROUTER PROCESSING comment (only once)
        if (timing.tAck === undefined && ev.text.includes('OPENROUTER PROCESSING')) {
          timing.tAck = Date.now()
          timing.ackSource = 'comment'
          logTiming(payload.requestId, 'ack', { tAck: timing.tAck, source: 'comment' })
          sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck })
        }
        sendEvent(sender, payload.requestId, { type: 'StreamComment', text: ev.text })
        continue
      }

      if (ev.type === 'done') {
        // normal_complete: received [DONE] signal
        timing.tEnd = Date.now()
        timing.endReason = 'normal_complete'
        const duration = timing.tAck != null ? timing.tEnd - timing.tAck : undefined
        logTiming(payload.requestId, 'end', { ...timing, localProcessingDurationMs: duration, reason: 'normal_complete' })
        sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tEnd: timing.tEnd, endReason: 'normal_complete' })
        sendEvent(sender, payload.requestId, { type: 'StreamDone' })
        sendEnd(sender, payload.requestId)
        return
      }

      if (ev.type === 'protocol_error') {
        // transport_error: protocol parse failure
        timing.tEnd = Date.now()
        timing.endReason = 'transport_error'
        logTiming(payload.requestId, 'end', { ...timing, reason: 'transport_error_protocol' })
        sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'transport_error' })
        sendEvent(sender, payload.requestId, {
          type: 'StreamError',
          error: normalizeOpenRouterUnknownStreamingError({ message: ev.message, details: { raw: ev.raw ? { raw: ev.raw } : {} } }),
          terminal: true,
        })
        sendEnd(sender, payload.requestId)
        return
      }

      if (ev.type === 'terminal_error') {
        // mid_stream_error: unified error event from OpenRouter
        timing.tEnd = Date.now()
        timing.endReason = 'mid_stream_error'
        logTiming(payload.requestId, 'end', { ...timing, reason: 'mid_stream_error' })
        sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'mid_stream_error' })
        // StreamError is already emitted from JSON chunk mapping; stop here.
        sendEnd(sender, payload.requestId)
        return
      }

      if (ev.type === 'json') {
        // Fallback: capture tAck on first JSON data chunk if no comment seen
        if (timing.tAck === undefined) {
          timing.tAck = Date.now()
          timing.ackSource = 'first_chunk'
          logTiming(payload.requestId, 'ack', { tAck: timing.tAck, source: 'first_chunk' })
          sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck })
        }

        chunkNo++
        const mapped = mapChunkToEvents({
          chunk: ev.value as any,
          messageId: payload.assistantMessageId,
          chunkNo,
        }) as DomainEvent[]

        for (const m of mapped) {
          if (m.type === 'MetaDelta') {
            lastMeta = {
              generationId: m.meta?.id ?? lastMeta.generationId,
              model: m.meta?.model ?? lastMeta.model,
              provider: m.meta?.provider ?? lastMeta.provider,
              finishReason: m.meta?.finish_reason ?? lastMeta.finishReason,
              nativeFinishReason: m.meta?.native_finish_reason ?? lastMeta.nativeFinishReason,
            }
            sendEvent(sender, payload.requestId, m)
            continue
          }

          if (m.type === 'StreamError') {
            // mid_stream_error: error in SSE data chunk
            timing.tEnd = Date.now()
            timing.endReason = 'mid_stream_error'
            logTiming(payload.requestId, 'end', { ...timing, reason: 'mid_stream_error_chunk' })
            sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'mid_stream_error' })
            const env = normalizeOpenRouterErrorFromSseChunkError({
              chunkError: m.error,
              meta: lastMeta,
            })
            sendEvent(sender, payload.requestId, { type: 'StreamError', error: env, terminal: true })
            continue
          }

          sendEvent(sender, payload.requestId, m)
        }
      }
    }

    sendEnd(sender, payload.requestId)
  } catch (err) {
    if (controller.signal.aborted) {
      // user_abort: abort triggered in catch block
      timing.tEnd = Date.now()
      timing.endReason = 'user_abort'
      logTiming(payload.requestId, 'end', { ...timing, reason: 'user_abort_catch' })
      sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'user_abort' })
      sendEvent(sender, payload.requestId, { type: 'StreamAbort', reason: 'aborted' })
      sendEnd(sender, payload.requestId)
      return
    }
    // transport_error: network/transport failure
    timing.tEnd = Date.now()
    timing.tTransportClosed = timing.tEnd
    timing.endReason = 'transport_error'
    logTiming(payload.requestId, 'end', { ...timing, reason: 'transport_error_catch' })
    sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'transport_error', tTransportClosed: timing.tTransportClosed })
    sendEvent(sender, payload.requestId, toStreamError(err))
    sendEnd(sender, payload.requestId)
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    if (client) {
      try {
        await client.close()
      } catch {
        // ignore close errors
      }
    }
    activeControllers.delete(payload.requestId)
  }
}

export function registerOpenRouterStreamBridge() {
  ipcMain.handle('openrouter:stream-chat', async (event, payload: StreamChatRequest) => {
    if (!payload?.requestId) return { ok: false, error: 'missing requestId' }
    void startStream(event.sender, payload)
    return { ok: true }
  })

  ipcMain.handle('openrouter:abort', (_event, requestId: string) => {
    const controller = activeControllers.get(requestId)
    if (controller) {
      controller.abort()
    }
    return true
  })
}

export function cleanupOpenRouterStreams() {
  for (const controller of activeControllers.values()) {
    try {
      controller.abort()
    } catch {
      // ignore
    }
  }
  activeControllers.clear()
}

import { ipcMain, net, type WebContents } from 'electron'
import type { IncomingMessage } from 'node:http'
import { buildOpenRouterChatCompletionsRequest } from '../../src/next/openrouter/buildRequest'
import { decodeOpenRouterSSE } from '../../src/next/openrouter/sse/decoder'
import { mapChunkToEvents } from '../../src/next/openrouter/mapChunkToEvents'
import { mapResponsesEventToTerminal } from '../../src/next/openrouter/responsesEventMapper'
import { buildOpenRouterMessages, type ContextMode, type InternalMessage } from '../../src/next/context/buildMessages'
import {
  normalizeOpenRouterErrorFromHttpNon2xx,
  normalizeOpenRouterErrorFromSseChunkError,
  normalizeOpenRouterUnknownStreamingError,
} from '../../src/next/errors/normalizeOpenRouterError'
import {
  buildAbortEnvelope,
  buildMidStreamSseErrorEnvelope,
  buildPreStreamHttpErrorEnvelope,
  buildTransportErrorEnvelope,
} from '../../src/next/errors/openRouterErrorEnvelope'
import type { ErrorPhase } from '../../src/next/errors/openRouterErrorEnvelope'
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

function toStreamError(err: unknown, phase: ErrorPhase, request?: { model?: string; stream?: boolean }): DomainEvent {
  const message =
    err && typeof err === 'object' && 'message' in (err as any) ? String((err as any).message ?? 'Error') : 'Error'
  const normalized = normalizeOpenRouterUnknownStreamingError({ message, details: { name: (err as any)?.name } })
  const envelope = buildTransportErrorEnvelope({
    phase,
    completionClass: 'error',
    message,
    normalized,
    request,
  })
  return { type: 'StreamError', error: envelope, terminal: true }
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

const LOG_MAX_CHARS = 20000

function maskApiKey(apiKey: string): string {
  if (!apiKey) return '[REDACTED]'
  if (apiKey.length <= 8) return '[REDACTED]'
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
}

function formatReasoningSummary(body: any): string {
  const reasoning = body?.reasoning
  const hasIncludeReasoning = !!(body && typeof body === 'object' && 'include_reasoning' in body)
  if (!reasoning && !hasIncludeReasoning) return 'UNSPECIFIED'
  const parts: string[] = []
  if (reasoning && typeof reasoning === 'object') {
    if ('effort' in reasoning) parts.push(`effort=${reasoning.effort}`)
    if ('max_tokens' in reasoning) parts.push(`max_tokens=${reasoning.max_tokens}`)
    if ('exclude' in reasoning) parts.push(`exclude=${reasoning.exclude}`)
    if ('enabled' in reasoning) parts.push(`enabled=${reasoning.enabled}`)
  }
  if (hasIncludeReasoning) parts.push(`include_reasoning=${body.include_reasoning}`)
  return parts.length > 0 ? parts.join(',') : 'EMPTY_OBJECT'
}

function sanitizeMessageContent(content: unknown): unknown {
  if (typeof content === 'string') {
    return { type: 'text', redacted: true, length: content.length }
  }
  if (Array.isArray(content)) {
    return content.map((item) => sanitizeMessageContent(item))
  }
  if (content && typeof content === 'object') {
    const value: any = { ...(content as any) }
    if (typeof value.text === 'string') {
      value.text = { redacted: true, length: value.text.length }
    }
    if ('image_url' in value) value.image_url = '[REDACTED_IMAGE_URL]'
    if ('file' in value) value.file = '[REDACTED_FILE]'
    if ('data' in value) value.data = '[REDACTED_DATA]'
    if ('b64_json' in value) value.b64_json = '[REDACTED_B64_JSON]'
    if ('audio' in value) value.audio = '[REDACTED_AUDIO]'
    if ('image' in value) value.image = '[REDACTED_IMAGE]'
    return value
  }
  return content
}

function sanitizeRequestBodyForLog(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const value: any = Array.isArray(body) ? [...body] : { ...(body as any) }

  if (Array.isArray(value.messages)) {
    value.messages = value.messages.map((msg: any) => {
      const entry: any = { ...msg }
      if ('content' in entry) entry.content = sanitizeMessageContent(entry.content)
      if ('tool_calls' in entry) entry.tool_calls = '[REDACTED_TOOL_CALLS]'
      if ('function_call' in entry) entry.function_call = '[REDACTED_FUNCTION_CALL]'
      return entry
    })
  }

  if ('prompt' in value) value.prompt = '[REDACTED_PROMPT]'
  if ('input' in value) value.input = '[REDACTED_INPUT]'
  if ('apiKey' in value) value.apiKey = '[REDACTED]'
  if ('attachments' in value) value.attachments = '[REDACTED_ATTACHMENTS]'

  return value
}

function safeStringifyForLog(value: unknown, maxChars: number): { text: string; truncated: boolean; originalLength: number } {
  let text = ''
  try {
    text = JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  const originalLength = text.length
  if (text.length > maxChars) {
    const head = text.slice(0, maxChars)
    return {
      text: `${head}\n...[truncated ${originalLength - maxChars} chars]`,
      truncated: true,
      originalLength,
    }
  }
  return { text, truncated: false, originalLength }
}

async function readResponseBody(response: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of response) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function startStream(sender: WebContents, payload: StreamChatRequest): Promise<void> {
  const controller = new AbortController()
  activeControllers.set(payload.requestId, controller)

  let request: ReturnType<typeof net.request> | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let abortHandler: (() => void) | null = null

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

    const reasoningEffort = payload.config.requestedReasoningEffort ?? 'none'
    const reasoning =
      payload.config.requestedReasoningMode === 'auto'
        ? undefined
        : {
          effort: reasoningEffort,
          ...(reasoningEffort !== 'none' && payload.config.requestedReasoningExclude === true ? { exclude: true } : {}),
        }

    const body = buildOpenRouterChatCompletionsRequest({
      model: payload.config.model,
      messages,
      stream: true,
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

    if (typeof payload.config.timeoutMs === 'number' && payload.config.timeoutMs > 0) {
      timeoutId = setTimeout(() => controller.abort(), payload.config.timeoutMs)
    }

    const requestUrl = `${origin}${requestPath}`
    const requestBody = JSON.stringify(body)

    // LOG REQUEST BODY (main process, sanitized + truncated)
    const isoTime = new Date().toISOString()
    const sanitizedBody = sanitizeRequestBodyForLog(body)
    const bodyLog = safeStringifyForLog(sanitizedBody, LOG_MAX_CHARS)
    console.warn(`\n${'='.repeat(80)}`)
    console.warn(`OPENROUTER_REQUEST_BEGIN ${payload.requestId} ${isoTime}`)
    console.warn(`${'='.repeat(80)}`)
    console.warn(`Endpoint: ${origin}${requestPath}`)
    console.warn(`API Key (REDACTED): ${maskApiKey(payload.config.apiKey)}`)
    console.warn(`Headers (sanitized):`)
    console.warn(`  Authorization: [REDACTED]`)
    console.warn(`  HTTP-Referer: https://github.com/GuXinghai/starverse`)
    console.warn(`  X-Title: Starverse`)
    console.warn(`  Content-Type: application/json`)
    console.warn(`\nRequest Body (SANITIZED${bodyLog.truncated ? ' + TRUNCATED' : ''}):`)
    console.warn(bodyLog.text)
    if (bodyLog.truncated) {
      console.warn(`[log] request body truncated: original ${bodyLog.originalLength} chars, limit ${LOG_MAX_CHARS}`)
    }
    console.warn(`${'='.repeat(80)}`)
    console.warn(`OPENROUTER_REQUEST_END ${payload.requestId}`)
    console.warn(`${'='.repeat(80)}`)
    const model = (body as any)?.model || 'N/A'
    const stream = (body as any)?.stream ?? 'N/A'
    const msgCount = Array.isArray((body as any)?.messages) ? (body as any).messages.length : 0
    const reasoningSummary = formatReasoningSummary(body as any)
    console.warn(`OR_REQ ${payload.requestId} model=${model} stream=${stream} reasoning=${reasoningSummary} msgs=${msgCount}\n`)

    request = net.request({
      method: 'POST',
      url: requestUrl,
    })

    request.setHeader('Authorization', `Bearer ${payload.config.apiKey}`)
    request.setHeader('Content-Type', 'application/json')
    request.setHeader('HTTP-Referer', 'https://github.com/GuXinghai/starverse')
    request.setHeader('X-Title', 'Starverse')

    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      request?.once('response', (res) => resolve(res))
      request?.once('error', (err) => {
        console.error('[openrouter:net] request error', {
          requestId: payload.requestId,
          url: requestUrl,
          message: String((err as any)?.message ?? err),
        })
        reject(err)
      })
      abortHandler = () => {
        try {
          request?.abort()
        } catch {
          // ignore abort errors
        }
      }
      if (controller.signal.aborted) {
        abortHandler()
        reject(new Error('aborted'))
        return
      }
      controller.signal.addEventListener('abort', abortHandler, { once: true })
      request?.write(requestBody)
      request?.end()
    })

    const headersRecord = headersToRecord((response.headers ?? {}) as Record<string, string | string[] | undefined>)
    const statusCode = response.statusCode ?? 0

    if (statusCode < 200 || statusCode >= 300) {
      const bodyText = await readResponseBody(response)
      // pre_stream_error: HTTP error before SSE streaming started
      timing.tEnd = Date.now()
      timing.endReason = 'pre_stream_error'
      logTiming(payload.requestId, 'end', { ...timing, reason: 'pre_stream_error' })
      sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart, tEnd: timing.tEnd, endReason: 'pre_stream_error' })
      const normalized = normalizeOpenRouterErrorFromHttpNon2xx({
        status: statusCode,
        statusText: '',
        bodyText,
        headers: headersRecord,
      })
      const envelope = buildPreStreamHttpErrorEnvelope({
        phase: 'pre_stream',
        completionClass: 'error',
        status: statusCode,
        statusText: '',
        bodyText,
        headers: headersRecord,
        normalized,
        request: { model: payload.config.model, stream: true },
      })
      sendEvent(sender, payload.requestId, { type: 'StreamError', error: envelope, terminal: true })
      sendEnd(sender, payload.requestId)
      return
    }

    const generationId = pickGenerationId(headersRecord)
    if (generationId) {
      sendEvent(sender, payload.requestId, { type: 'MetaDelta', meta: { id: generationId } })
    }

    let lastMeta: StreamMeta = {}
    let chunkNo = 0
    let didTerminate = false

    // Emit initial timing snapshot with tRequestStart (tAck will come later)
    sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tRequestStart: timing.tRequestStart })

    let receivedAnySse = false
    for await (const ev of decodeOpenRouterSSE(response)) {
      if (didTerminate) break
      if (controller.signal.aborted) {
        // Abort wins: once aborted, do not emit StreamError even if transport surfaces an error afterward.
        // After abort, ignore any later terminal events for this run.
        // user_abort: highest priority
        timing.tEnd = Date.now()
        timing.endReason = 'user_abort'
        logTiming(payload.requestId, 'end', { ...timing, reason: 'user_abort' })
        sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'user_abort' })
        const envelope = buildAbortEnvelope({
          phase: receivedAnySse ? 'mid_stream' : 'pre_stream',
          completionClass: 'aborted',
          reason: 'aborted',
          request: { model: payload.config.model, stream: true },
        })
        sendEvent(sender, payload.requestId, { type: 'StreamAbort', reason: 'aborted', envelope })
        sendEnd(sender, payload.requestId)
        return
      }

      if (ev.type === 'comment') {
        receivedAnySse = true
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
        const normalized = normalizeOpenRouterUnknownStreamingError({ message: ev.message, details: { raw: ev.raw ? { raw: ev.raw } : {} } })
        const envelope = buildTransportErrorEnvelope({
          phase: receivedAnySse ? 'mid_stream' : 'pre_stream',
          completionClass: 'error',
          message: ev.message,
          normalized,
          request: { model: payload.config.model, stream: true },
          kind: 'parse_error',
        })
        sendEvent(sender, payload.requestId, { type: 'StreamError', error: envelope, terminal: true })
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
        receivedAnySse = true
        // Fallback: capture tAck on first JSON data chunk if no comment seen
        if (timing.tAck === undefined) {
          timing.tAck = Date.now()
          timing.ackSource = 'first_chunk'
          logTiming(payload.requestId, 'ack', { tAck: timing.tAck, source: 'first_chunk' })
          sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck })
        }

        const responsesTerminal = mapResponsesEventToTerminal({
          event: ev.value,
          request: { model: payload.config.model, stream: true },
        })
        if (responsesTerminal) {
          didTerminate = true
          if (responsesTerminal.meta) {
            sendEvent(sender, payload.requestId, { type: 'MetaDelta', meta: responsesTerminal.meta })
          }
          timing.tEnd = Date.now()
          const endReason = responsesTerminal.completionClass === 'error' ? 'mid_stream_error' : 'normal_complete'
          timing.endReason = endReason
          const duration = timing.tAck != null ? timing.tEnd - timing.tAck : undefined
          logTiming(payload.requestId, 'end', { ...timing, localProcessingDurationMs: duration, reason: endReason })
          sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason })
          if (responsesTerminal.completionClass === 'ok') {
            sendEvent(sender, payload.requestId, { type: 'StreamDone' })
          } else if (responsesTerminal.envelope) {
            sendEvent(sender, payload.requestId, { type: 'StreamError', error: responsesTerminal.envelope, terminal: true })
          }
          sendEnd(sender, payload.requestId)
          return
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
              request: { model: payload.config.model, stream: true },
            })
            sendEvent(sender, payload.requestId, { type: 'StreamError', error: envelope, terminal: true })
            sendEnd(sender, payload.requestId)
            return
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
      const envelope = buildAbortEnvelope({
        phase: 'pre_stream',
        completionClass: 'aborted',
        reason: 'aborted',
        request: { model: payload.config.model, stream: true },
      })
      sendEvent(sender, payload.requestId, { type: 'StreamAbort', reason: 'aborted', envelope })
      sendEnd(sender, payload.requestId)
      return
    }
    // transport_error: network/transport failure
    timing.tEnd = Date.now()
    timing.tTransportClosed = timing.tEnd
    timing.endReason = 'transport_error'
    logTiming(payload.requestId, 'end', { ...timing, reason: 'transport_error_catch' })
    sendEvent(sender, payload.requestId, { type: 'TimingSnapshot', tAck: timing.tAck, tEnd: timing.tEnd, endReason: 'transport_error', tTransportClosed: timing.tTransportClosed })
    sendEvent(sender, payload.requestId, toStreamError(err, 'pre_stream', { model: payload.config.model, stream: true }))
    sendEnd(sender, payload.requestId)
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    if (abortHandler) {
      try {
        controller.signal.removeEventListener('abort', abortHandler)
      } catch {
        // ignore
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

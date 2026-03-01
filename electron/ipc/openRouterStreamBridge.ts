import { ipcMain, net, type WebContents } from 'electron'
import {
  OPENROUTER_STREAM_WIRE_VERSION,
  isOpenRouterStreamWireRequest,
  type OpenRouterStreamWireError,
  type OpenRouterStreamWireEvent,
  type OpenRouterStreamWireRequest,
} from '../../src/shared/ipc/openRouterStreamWire'

/**
 * Narrow interface for HTTP response objects.
 * Compatible with both Electron's IncomingMessage and Node's http.IncomingMessage.
 * Only includes the fields we actually use in this module.
 */
type ResponseLike = AsyncIterable<Uint8Array> & {
  statusCode?: number
  statusMessage?: string
  headers: Record<string, string | string[] | undefined>
}

const activeControllers = new Map<string, AbortController>()
const LOG_MAX_CHARS = 20000
export const OPENROUTER_STREAM_IPC_CHANNELS = ['openrouter:stream-chat', 'openrouter:abort'] as const

type StreamRequestValidationResult =
  | Readonly<{ ok: true; payload: OpenRouterStreamWireRequest }>
  | Readonly<{ ok: false; code: 'protocol_invalid'; error: string }>

export function validateOpenRouterStreamRequest(payload: unknown): StreamRequestValidationResult {
  if (!isOpenRouterStreamWireRequest(payload)) {
    return { ok: false, code: 'protocol_invalid', error: 'Invalid stream payload shape' }
  }
  const wireVersion = payload.wireVersion
  const isLegacy = wireVersion === undefined
  if (!isLegacy && wireVersion !== OPENROUTER_STREAM_WIRE_VERSION) {
    return {
      ok: false,
      code: 'protocol_invalid',
      error: `Unsupported wireVersion=${wireVersion}; expected ${OPENROUTER_STREAM_WIRE_VERSION}`,
    }
  }
  return { ok: true, payload }
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

function maskApiKey(apiKey: string): string {
  if (!apiKey) return '[REDACTED]'
  if (apiKey.length <= 8) return '[REDACTED]'
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`
}

function sanitizeMessageContent(content: unknown): unknown {
  if (typeof content === 'string') {
    return { type: 'text', redacted: true, length: content.length }
  }
  if (Array.isArray(content)) {
    return content.map((item) => sanitizeMessageContent(item))
  }
  if (content && typeof content === 'object') {
    const value: Record<string, unknown> = { ...(content as Record<string, unknown>) }
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
  const value: Record<string, unknown> = Array.isArray(body) ? { items: body } : { ...(body as Record<string, unknown>) }

  if (Array.isArray(value.messages)) {
    value.messages = value.messages.map((msg: unknown) => {
      const entry: Record<string, unknown> = msg && typeof msg === 'object' ? { ...(msg as Record<string, unknown>) } : {}
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

function buildFallbackRequestBody(payload: OpenRouterStreamWireRequest): Record<string, unknown> {
  const userText = typeof payload.userText === 'string' ? payload.userText : ''
  const reasoningMode = String(payload.config.requestedReasoningMode ?? 'auto')
  const reasoningEffort = String(payload.config.requestedReasoningEffort ?? 'none')
  const body: Record<string, unknown> = {
    model: String(payload.config.model ?? ''),
    stream: true,
    messages: [{ role: 'user', content: userText }],
  }
  if (Array.isArray(payload.config.tools) && payload.config.tools.length > 0) {
    body.tools = payload.config.tools
  }
  if (Array.isArray(payload.config.modalities) && payload.config.modalities.length > 0) {
    body.modalities = payload.config.modalities
  }
  if (
    payload.config.imageConfig &&
    typeof payload.config.imageConfig === 'object' &&
    !Array.isArray(payload.config.imageConfig)
  ) {
    body.image_config = payload.config.imageConfig
  }
  if (reasoningMode !== 'auto') {
    body.reasoning = {
      effort: reasoningEffort,
      ...(payload.config.requestedReasoningExclude === true ? { exclude: true } : {}),
    }
  }
  if (payload.config.providerRequireParameters === true) {
    body.provider = { require_parameters: true }
  }
  return body
}

async function readResponseBody(response: ResponseLike): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of response) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function pickProviderFromHeaders(headers: Record<string, string>): string | undefined {
  const provider = headers['x-openrouter-provider'] ?? headers['x-provider']
  if (provider && provider.trim().length > 0) return provider.trim()
  return undefined
}

function sendWireEvent(sender: WebContents, requestId: string, event: OpenRouterStreamWireEvent) {
  sender.send(`openrouter:chunk:${requestId}`, event)
}

function sendWireEnd(sender: WebContents, requestId: string) {
  sender.send(`openrouter:chunk:${requestId}`, { type: 'end' } satisfies OpenRouterStreamWireEvent)
  sender.send(`openrouter:end:${requestId}`)
}

function toWireError(input: Readonly<{
  kind: OpenRouterStreamWireError['kind']
  message: string
  name?: string
  code?: string | number
  status?: number
  statusText?: string
  headers?: Record<string, string>
  bodyText?: string
}>): OpenRouterStreamWireError {
  return {
    kind: input.kind,
    message: input.message,
    ...(input.name ? { name: input.name } : {}),
    ...(input.code !== undefined ? { code: input.code } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.statusText ? { statusText: input.statusText } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
    ...(input.bodyText !== undefined ? { bodyText: input.bodyText } : {}),
  }
}

export async function forwardOpenRouterResponseAsWireEvents(input: Readonly<{
  requestId: string
  response: ResponseLike
  signal: AbortSignal
  emit: (event: OpenRouterStreamWireEvent) => void
}>): Promise<void> {
  const { requestId, response, signal, emit } = input
  const headers = headersToRecord(response.headers ?? {})
  const status = response.statusCode ?? 0
  const provider = pickProviderFromHeaders(headers)
  emit({
    type: 'responseMeta',
    status,
    requestId,
    ...(provider ? { provider } : {}),
    headers,
  })

  if (status < 200 || status >= 300) {
    const bodyText = await readResponseBody(response)
    emit({
      type: 'error',
      error: toWireError({
        kind: 'http_error',
        message: `HTTP ${status}`,
        status,
        statusText: response.statusMessage ?? '',
        headers,
        bodyText,
      }),
    })
    emit({ type: 'end' })
    return
  }

  const decoder = new TextDecoder()
  try {
    for await (const chunk of response) {
      if (signal.aborted) {
        emit({
          type: 'error',
          error: toWireError({
            kind: 'aborted',
            name: 'AbortError',
            code: 'ERR_ABORTED',
            message: 'aborted',
          }),
        })
        emit({ type: 'end' })
        return
      }
      const text = decoder.decode(chunk, { stream: true })
      if (text.length > 0) {
        emit({ type: 'chunk', data: text })
      }
    }
    const tail = decoder.decode()
    if (tail.length > 0) {
      emit({ type: 'chunk', data: tail })
    }
    emit({ type: 'end' })
  } catch (error) {
    if (signal.aborted) {
      emit({
        type: 'error',
        error: toWireError({
          kind: 'aborted',
          name: 'AbortError',
          code: 'ERR_ABORTED',
          message: 'aborted',
        }),
      })
      emit({ type: 'end' })
      return
    }
    const err = error as Record<string, unknown>
    emit({
      type: 'error',
      error: toWireError({
        kind: 'transport_error',
        message: String(err?.message ?? 'Transport error'),
        ...(typeof err?.name === 'string' ? { name: err.name } : {}),
        ...(typeof err?.code === 'string' || typeof err?.code === 'number' ? { code: err.code } : {}),
      }),
    })
    emit({ type: 'end' })
  }
}

async function startStream(sender: WebContents, payload: OpenRouterStreamWireRequest): Promise<void> {
  const controller = new AbortController()
  activeControllers.set(payload.requestId, controller)

  let request: ReturnType<typeof net.request> | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let abortHandler: (() => void) | null = null

  try {
    const body = payload.requestBody ?? buildFallbackRequestBody(payload)
    const requestBody = JSON.stringify(body)
    const baseUrl = (payload.config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    const url = new URL(baseUrl)
    const origin = `${url.protocol}//${url.host}`
    const basePath = url.pathname.replace(/\/+$/, '')
    const requestPath = `${basePath}/chat/completions`.startsWith('/')
      ? `${basePath}/chat/completions`
      : `/${basePath}/chat/completions`
    const requestUrl = `${origin}${requestPath}`

    if (typeof payload.config.timeoutMs === 'number' && payload.config.timeoutMs > 0) {
      timeoutId = setTimeout(() => controller.abort(), payload.config.timeoutMs)
    }

    const isoTime = new Date().toISOString()
    const sanitizedBody = sanitizeRequestBodyForLog(body)
    const bodyLog = safeStringifyForLog(sanitizedBody, LOG_MAX_CHARS)
    console.warn(`\n${'='.repeat(80)}`)
    console.warn(`OPENROUTER_REQUEST_BEGIN ${payload.requestId} ${isoTime}`)
    console.warn(`${'='.repeat(80)}`)
    console.warn(`Endpoint: ${origin}${requestPath}`)
    console.warn(`API Key (REDACTED): ${maskApiKey(payload.config.apiKey)}`)
    console.warn('Headers (sanitized):')
    console.warn('  Authorization: [REDACTED]')
    console.warn('  HTTP-Referer: https://github.com/GuXinghai/starverse')
    console.warn('  X-Title: Starverse')
    console.warn('  Content-Type: application/json')
    console.warn(`\nRequest Body (SANITIZED${bodyLog.truncated ? ' + TRUNCATED' : ''}):`)
    console.warn(bodyLog.text)
    if (bodyLog.truncated) {
      console.warn(`[log] request body truncated: original ${bodyLog.originalLength} chars, limit ${LOG_MAX_CHARS}`)
    }
    console.warn(`${'='.repeat(80)}`)
    console.warn(`OPENROUTER_REQUEST_END ${payload.requestId}`)
    console.warn(`${'='.repeat(80)}`)

    request = net.request({
      method: 'POST',
      url: requestUrl,
    })

    request.setHeader('Authorization', `Bearer ${payload.config.apiKey}`)
    request.setHeader('Content-Type', 'application/json')
    request.setHeader('HTTP-Referer', 'https://github.com/GuXinghai/starverse')
    request.setHeader('X-Title', 'Starverse')

    const response = await new Promise<ResponseLike>((resolve, reject) => {
      if (!request) {
        reject(new Error('request is null'))
        return
      }

      request.once('response', (res) => resolve(res as unknown as ResponseLike))
      request.once('error', (err) => {
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
      request.write(requestBody)
      request.end()
    })

    await forwardOpenRouterResponseAsWireEvents({
      requestId: payload.requestId,
      response,
      signal: controller.signal,
      emit: (event) => sendWireEvent(sender, payload.requestId, event),
    })
    sendWireEnd(sender, payload.requestId)
  } catch (error) {
    const err = error as Record<string, unknown>
    if (controller.signal.aborted) {
      sendWireEvent(sender, payload.requestId, {
        type: 'error',
        error: toWireError({
          kind: 'aborted',
          name: 'AbortError',
          code: 'ERR_ABORTED',
          message: 'aborted',
        }),
      })
      sendWireEnd(sender, payload.requestId)
      return
    }

    sendWireEvent(sender, payload.requestId, {
      type: 'error',
      error: toWireError({
        kind: 'transport_error',
        message: String(err?.message ?? 'Transport error'),
        ...(typeof err?.name === 'string' ? { name: err.name } : {}),
        ...(typeof err?.code === 'string' || typeof err?.code === 'number' ? { code: err.code } : {}),
      }),
    })
    sendWireEnd(sender, payload.requestId)
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

export function registerOpenRouterStreamBridge(): string[] {
  ipcMain.handle('openrouter:stream-chat', async (event, payload: unknown) => {
    const validated = validateOpenRouterStreamRequest(payload)
    if (!validated.ok) {
      return {
        ok: false,
        code: validated.code,
        error: validated.error,
        supportedWireVersion: OPENROUTER_STREAM_WIRE_VERSION,
      }
    }
    void startStream(event.sender, validated.payload)
    return { ok: true }
  })

  ipcMain.handle('openrouter:abort', (_event, requestId: string) => {
    const controller = activeControllers.get(requestId)
    if (controller) {
      controller.abort()
    }
    return true
  })

  return [...OPENROUTER_STREAM_IPC_CHANNELS]
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

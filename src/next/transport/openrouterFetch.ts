export type OpenRouterTransportSuccess = Readonly<{
  response: Response
  headers: Record<string, string>
  requestId: string
  generationId?: string
}>

export type OpenRouterTransportError =
  | Readonly<{
      type: 'aborted'
      requestId: string
      message: string
    }>
  | Readonly<{
      type: 'timeout'
      requestId: string
      timeoutMs: number
      message: string
    }>
  | Readonly<{
      type: 'http_error'
      requestId: string
      status: number
      statusText: string
      headers: Record<string, string>
      bodyText: string
      message: string
    }>
  | Readonly<{
      type: 'network_error'
      requestId: string
      message: string
      cause?: unknown
    }>

export type OpenRouterFetchOptions = Readonly<{
  baseUrl?: string
  apiKey: string
  body: unknown
  signal?: AbortSignal | null
  timeoutMs?: number
  requestId?: string
}>

function generateRequestId(): string {
  const cryptoObj = (globalThis as any).crypto as { randomUUID?: () => string } | undefined
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value
  })
  return record
}

function pickGenerationId(headers: Headers): string | undefined {
  const candidates = [
    'x-openrouter-generation-id',
    'x-generation-id',
    'x-request-id',
  ] as const

  for (const key of candidates) {
    const value = headers.get(key)
    if (value && value.trim()) return value.trim()
  }
  return undefined
}

function abortError(requestId: string): OpenRouterTransportError {
  return {
    type: 'aborted',
    requestId,
    message: 'Request aborted',
  }
}

/**
 * Pure transport: only sends the request and returns the raw Response.
 * - Does NOT do SSE parsing or JSON chunk mapping.
 * - For non-2xx, throws a structured http_error (before any streaming begins).
 * - Mid-stream errors (HTTP 200 + SSE error chunk) are handled by the decoder/mapper.
 */
export async function openrouterFetch(
  options: OpenRouterFetchOptions
): Promise<OpenRouterTransportSuccess> {
  const baseUrl = (options.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const requestId = options.requestId || generateRequestId()

  const externalSignal = options.signal ?? null
  if (externalSignal?.aborted) {
    throw abortError(requestId)
  }

  const controller = new AbortController()
  const signals: AbortSignal[] = [controller.signal]

  const onAbort = () => controller.abort()
  if (externalSignal) {
    signals.push(externalSignal)
    externalSignal.addEventListener('abort', onAbort, { once: true })
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutMs = options.timeoutMs
  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  }

  try {
    const url = `${baseUrl}/chat/completions`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
        'X-Title': 'Starverse',
      },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    })

    const headersRecord = headersToRecord(response.headers)

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      const error: OpenRouterTransportError = {
        type: 'http_error',
        requestId,
        status: response.status,
        statusText: response.statusText,
        headers: headersRecord,
        bodyText,
        message: `HTTP ${response.status} ${response.statusText}`.trim(),
      }
      throw error
    }

    return {
      response,
      headers: headersRecord,
      requestId,
      generationId: pickGenerationId(response.headers),
    }
  } catch (cause: any) {
    if (cause?.type && typeof cause.type === 'string') {
      throw cause
    }

    if (controller.signal.aborted || externalSignal?.aborted || cause?.name === 'AbortError') {
      if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 && !externalSignal?.aborted) {
        const error: OpenRouterTransportError = {
          type: 'timeout',
          requestId,
          timeoutMs,
          message: `Request timed out after ${timeoutMs}ms`,
        }
        throw error
      }
      throw abortError(requestId)
    }

    const error: OpenRouterTransportError = {
      type: 'network_error',
      requestId,
      message: cause?.message ? String(cause.message) : 'Network error',
      cause,
    }
    throw error
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)
  }
}


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
  /**
   * Debug-only request logging + invariants.
   * Enable without code changes in DevTools:
   *   globalThis.__STARVERSE_OPENROUTER_DEBUG_REQUEST__ = true
   *   globalThis.__STARVERSE_OPENROUTER_DEBUG_REQUEST_ASSERT__ = true
   */
  debug?: Readonly<{
    logRequestBody?: boolean
    assertRequestInvariants?: boolean
  }>
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

function summarizeBodyForLog(body: unknown): {
  include_reasoning?: unknown
  reasoning?: { effort?: unknown; max_tokens?: unknown; exclude?: unknown; enabled?: unknown } | undefined
  messages?: Array<{
    role?: unknown
    has_reasoning_details?: boolean
    content_type?: string
    content_length?: number | null
  }>
} {
  if (!body || typeof body !== 'object') return {}
  const b: any = body

  const include_reasoning = b.include_reasoning

  let reasoning: any = undefined
  if (b.reasoning && typeof b.reasoning === 'object') {
    reasoning = {
      effort: (b.reasoning as any).effort,
      max_tokens: (b.reasoning as any).max_tokens,
      exclude: (b.reasoning as any).exclude,
      enabled: (b.reasoning as any).enabled,
    }
  }

  const messages = Array.isArray(b.messages)
    ? b.messages.map((m: any) => {
        const role = m?.role
        const hasReasoningDetails = !!(m && typeof m === 'object' && 'reasoning_details' in m)
        const content = m?.content
        const contentType = Array.isArray(content) ? 'array' : typeof content
        const contentLength = typeof content === 'string' ? content.length : null
        return { role, has_reasoning_details: hasReasoningDetails, content_type: contentType, content_length: contentLength }
      })
    : undefined

  return { include_reasoning, reasoning, messages }
}

/**
 * Format reasoning parameter for one-line summary display.
 * Examples: "effort=medium", "max_tokens=4000,exclude=true", "enabled=true", "UNSPECIFIED"
 */
function formatReasoningForSummary(body: any): string {
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

  if (hasIncludeReasoning) {
    parts.push(`include_reasoning=${body.include_reasoning}`)
  }

  return parts.length > 0 ? parts.join(',') : 'EMPTY_OBJECT'
}

/**
 * Print complete request body with clear boundaries for audit.
 * Uses console.warn for high visibility filtering.
 * Prints COMPLETE data including full API key - DO NOT share logs publicly.
 */
function logCompleteRequestBody(
  requestId: string,
  url: string,
  apiKey: string,
  body: unknown,
  headers: Record<string, string>
): void {
  const isoTime = new Date().toISOString()
  const bodyObj: any = body

  console.warn(`\n${'='.repeat(80)}`)
  console.warn(`OPENROUTER_REQUEST_BEGIN ${requestId} ${isoTime}`)
  console.warn(`${'='.repeat(80)}`)
  console.warn(`Endpoint: ${url}`)
  console.warn(`API Key (FULL): ${apiKey}`)
  console.warn(`Headers (complete):`)
  console.warn(`  Authorization: Bearer ${apiKey}`)
  console.warn(`  HTTP-Referer: ${headers['HTTP-Referer'] || 'N/A'}`)
  console.warn(`  X-Title: ${headers['X-Title'] || 'N/A'}`)
  console.warn(`  Content-Type: ${headers['Content-Type'] || 'N/A'}`)
  console.warn(`\nRequest Body (COMPLETE - NO SANITIZATION):`)
  console.warn(JSON.stringify(bodyObj, null, 2))
  console.warn(`${'='.repeat(80)}`)
  console.warn(`OPENROUTER_REQUEST_END ${requestId}`)
  console.warn(`${'='.repeat(80)}`)

  // One-line summary for quick scanning
  const model = bodyObj?.model || 'N/A'
  const stream = bodyObj?.stream ?? 'N/A'
  const msgCount = Array.isArray(bodyObj?.messages) ? bodyObj.messages.length : 0
  const reasoning = formatReasoningForSummary(bodyObj)

  console.warn(
    `OR_REQ ${requestId} model=${model} stream=${stream} reasoning=${reasoning} msgs=${msgCount}\n`
  )
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
    const debugLog =
      options.debug?.logRequestBody === true ||
      (globalThis as any).__STARVERSE_OPENROUTER_DEBUG_REQUEST__ === true
    const debugAssert =
      options.debug?.assertRequestInvariants === true ||
      (globalThis as any).__STARVERSE_OPENROUTER_DEBUG_REQUEST_ASSERT__ === true

    // NEW: Always log complete request body for reasoning audit
    const requestHeaders = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
      'X-Title': 'Starverse',
    }
    logCompleteRequestBody(requestId, url, options.apiKey, options.body, requestHeaders)

    if (debugLog || debugAssert) {
      const body: any = options.body
      const reasoning = body?.reasoning
      const hasIncludeReasoning = !!(body && typeof body === 'object' && 'include_reasoning' in body)
      const hasReasoningEnabled = !!(reasoning && typeof reasoning === 'object' && 'enabled' in reasoning)
      const hasReasoningExclude = !!(reasoning && typeof reasoning === 'object' && 'exclude' in reasoning)
      const reasoningEffort = reasoning && typeof reasoning === 'object' ? (reasoning as any).effort : undefined

      const messages = Array.isArray(body?.messages) ? body.messages : []
      const hasMessageReasoningDetails = messages.some(
        (m: any) => m && typeof m === 'object' && 'reasoning_details' in m
      )

      const summary = {
        requestId,
        url,
        assertions: {
          reasoning_effort_is_none: reasoningEffort === 'none',
          reasoning_has_exclude_field: hasReasoningExclude,
          reasoning_has_enabled_field: hasReasoningEnabled,
          has_include_reasoning: hasIncludeReasoning,
          has_message_reasoning_details: hasMessageReasoningDetails,
        },
        body: summarizeBodyForLog(options.body),
      }

      if (debugLog) {
        // Never log apiKey; only log request/body structure.
        console.log('[openrouterFetch] request body (sanitized)', summary)
      }

      if (debugAssert) {
        const failures: string[] = []
        if (hasIncludeReasoning) failures.push('include_reasoning present in request body')
        if (hasReasoningEnabled) failures.push('reasoning.enabled present in request body')
        if (hasMessageReasoningDetails) failures.push('messages[].reasoning_details present in request body')
        if (failures.length > 0) {
          throw new Error(`[openrouterFetch] invariant violation: ${failures.join('; ')}`)
        }
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        ...requestHeaders,
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

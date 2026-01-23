export type Endpoint = 'chat.completions' | 'responses.beta' | 'responses.alpha_like'
export type Transport = 'http' | 'sse'
export type Phase = 'request' | 'generation'

export type NormalizedErrorAction =
  | 'fix_request'
  | 'reauth'
  | 'topup_credits'
  | 'modify_input_moderation'
  | 'backoff_retry'
  | 'switch_provider_or_model'
  | 'relax_routing_constraints'
  | 'treat_as_truncated_success'
  | 'unknown'

export type NormalizedError = Readonly<{
  endpoint: Endpoint
  transport: Transport
  phase: Phase

  httpStatus?: number
  code: string | number
  message: string
  metadata?: Record<string, unknown>

  providerName?: string
  rawProviderError?: unknown

  retryable: boolean
  action: NormalizedErrorAction
}>

export type NormalizedErrorEnvelope = Readonly<{
  normalized: NormalizedError
  /**
   * Must be JSON-serializable. Do not attach Response/ReadableStream/Error objects.
   */
  raw?: Record<string, unknown>
}>

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function safeString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function sanitizeMetadata(meta: unknown): Record<string, unknown> | undefined {
  const record = asRecord(meta)
  if (!record) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (k === 'flagged_input') continue
    out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function pickProviderName(metadata?: Record<string, unknown>, fallback?: unknown): string | undefined {
  const name = safeString(metadata?.provider_name) ?? safeString(fallback)
  return name ? name : undefined
}

function pickRawProviderError(metadata?: Record<string, unknown>): unknown | undefined {
  if (!metadata) return undefined
  return 'raw' in metadata ? (metadata as any).raw : undefined
}

function mapHttpStatusToPolicy(status: number, message: string): { action: NormalizedErrorAction; retryable: boolean } {
  if (status === 400) return { action: 'fix_request', retryable: false }
  if (status === 401) return { action: 'reauth', retryable: false }
  if (status === 402) return { action: 'topup_credits', retryable: false }
  if (status === 403) return { action: 'modify_input_moderation', retryable: false }
  if (status === 408) return { action: 'backoff_retry', retryable: true }
  if (status === 429) return { action: 'backoff_retry', retryable: true }
  if (status === 502) return { action: 'switch_provider_or_model', retryable: true }
  if (status === 503) {
    const lowered = message.toLowerCase()
    const looksLikeNoProvider =
      lowered.includes('no provider') || lowered.includes('no providers') || lowered.includes('no available provider')
    return looksLikeNoProvider
      ? { action: 'relax_routing_constraints', retryable: true }
      : { action: 'backoff_retry', retryable: true }
  }
  if (status >= 500) return { action: 'backoff_retry', retryable: true }
  return { action: 'unknown', retryable: false }
}

function mapCodeToPolicy(code: string | number): { action: NormalizedErrorAction; retryable: boolean } {
  const c = typeof code === 'string' ? code.toLowerCase() : code
  if (c === 'rate_limit_exceeded') return { action: 'backoff_retry', retryable: true }
  if (c === 'server_error') return { action: 'backoff_retry', retryable: true }
  if (typeof c === 'string' && c.startsWith('provider_')) return { action: 'switch_provider_or_model', retryable: true }
  if (c === 'context_length_exceeded' || c === 'max_tokens_exceeded' || c === 'token_limit_exceeded' || c === 'string_too_long') {
    return { action: 'fix_request', retryable: false }
  }
  return { action: 'unknown', retryable: true }
}

export function normalizeOpenRouterErrorFromHttpNon2xx(input: {
  status: number
  statusText?: string
  bodyText?: string
  headers?: Record<string, string>
}): NormalizedErrorEnvelope {
  const parsed = typeof input.bodyText === 'string' ? safeJsonParse(input.bodyText) : null
  const body = asRecord(parsed)
  const err = asRecord(body?.error)

  const code: string | number =
    (typeof err?.code === 'number' && Number.isFinite(err.code) ? err.code : undefined) ??
    (safeString(err?.code) ?? input.status)

  const message =
    (safeString(err?.message) ?? safeString(body?.message) ?? safeString(input.statusText) ?? `HTTP ${input.status}`).trim()

  const metadata = sanitizeMetadata(err?.metadata)
  const providerName = pickProviderName(metadata)
  const rawProviderError = pickRawProviderError(metadata)

  const policy = mapHttpStatusToPolicy(input.status, message)

  return {
    normalized: {
      endpoint: 'chat.completions',
      transport: 'http',
      phase: 'request',
      httpStatus: input.status,
      code,
      message,
      ...(metadata ? { metadata } : {}),
      ...(providerName ? { providerName } : {}),
      ...(rawProviderError !== undefined ? { rawProviderError } : {}),
      retryable: policy.retryable,
      action: policy.action,
    },
    raw: {
      type: 'http_non2xx',
      status: input.status,
      statusText: input.statusText ?? '',
      bodyText: typeof input.bodyText === 'string' ? input.bodyText.slice(0, 20_000) : '',
      headers: input.headers ?? {},
    },
  }
}

export function normalizeOpenRouterErrorFromHttp2xxBodyError(input: {
  json: unknown
}): NormalizedErrorEnvelope {
  const body = asRecord(input.json)
  const err = asRecord(body?.error)

  const code: string | number =
    (typeof err?.code === 'number' && Number.isFinite(err.code) ? err.code : undefined) ??
    (safeString(err?.code) ?? 'error')
  const message = (safeString(err?.message) ?? 'Unknown error').trim()

  const metadata = sanitizeMetadata(err?.metadata)
  const providerName = pickProviderName(metadata)
  const rawProviderError = pickRawProviderError(metadata)

  const policy = mapCodeToPolicy(code)

  return {
    normalized: {
      endpoint: 'chat.completions',
      transport: 'http',
      phase: 'generation',
      code,
      message,
      ...(metadata ? { metadata } : {}),
      ...(providerName ? { providerName } : {}),
      ...(rawProviderError !== undefined ? { rawProviderError } : {}),
      retryable: policy.retryable,
      action: policy.action,
    },
    raw: {
      type: 'http_2xx_body_error',
      error: err ?? null,
    },
  }
}

export function normalizeOpenRouterErrorFromSseChunkError(input: {
  chunkError: unknown
  meta?: Readonly<{ generationId?: string; model?: string; provider?: string; finishReason?: string; nativeFinishReason?: string }>
}): NormalizedErrorEnvelope {
  const err = asRecord(input.chunkError)
  const code: string | number =
    (typeof err?.code === 'number' && Number.isFinite(err.code) ? err.code : undefined) ??
    (safeString(err?.code) ?? 'server_error')
  const message = (safeString(err?.message) ?? 'Generation error').trim()

  const metadata = sanitizeMetadata(err?.metadata)
  const providerName = pickProviderName(metadata, input.meta?.provider)
  const rawProviderError = pickRawProviderError(metadata)

  const policy = mapCodeToPolicy(code)

  return {
    normalized: {
      endpoint: 'chat.completions',
      transport: 'sse',
      phase: 'generation',
      code,
      message,
      ...(metadata ? { metadata } : {}),
      ...(providerName ? { providerName } : {}),
      ...(rawProviderError !== undefined ? { rawProviderError } : {}),
      retryable: policy.retryable,
      action: policy.action,
    },
    raw: {
      type: 'sse_chunk_error',
      chunkError: err ?? null,
      meta: input.meta ?? {},
    },
  }
}

export function normalizeOpenRouterUnknownStreamingError(input: {
  message: string
  details?: Record<string, unknown>
}): NormalizedErrorEnvelope {
  return {
    normalized: {
      endpoint: 'chat.completions',
      transport: 'sse',
      phase: 'generation',
      code: 'unknown',
      message: input.message,
      retryable: true,
      action: 'unknown',
      ...(input.details ? { metadata: input.details } : {}),
    },
    raw: { type: 'unknown_stream_error', ...(input.details ?? {}) },
  }
}


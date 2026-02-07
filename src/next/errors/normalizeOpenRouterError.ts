import type { AppError, AppErrorCategory, AppErrorPhase, AppErrorUserActionHint } from './appError'

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

  appPhase: AppErrorPhase
  category: AppErrorCategory
  grade: 1 | 2 | 3
  userActionHint: AppErrorUserActionHint
  finishReason?: string
  backoffHintMs?: number
  debug?: Record<string, unknown>
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
  for (const [k, v] of Object.entries(record)) out[k] = v
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

function normalizeCode(value: unknown, fallback: string): string {
  const code = safeString(value)
  return code && code.trim().length > 0 ? code.trim() : fallback
}

function toLowerCode(code: string): string {
  return code.trim().toLowerCase()
}

function coerceHttpStatus(codeOrStatus: unknown): number | undefined {
  if (typeof codeOrStatus === 'number' && Number.isFinite(codeOrStatus)) return codeOrStatus
  if (typeof codeOrStatus === 'string' && /^\d+$/.test(codeOrStatus)) {
    const parsed = Number(codeOrStatus)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function hasModerationSignal(metadata?: Record<string, unknown>, code?: string, message?: string): boolean {
  const loweredCode = code ? code.toLowerCase() : ''
  const loweredMessage = message ? message.toLowerCase() : ''
  if (loweredCode.includes('moderation') || loweredMessage.includes('moderation')) return true
  if (!metadata) return false
  if ('flagged_input' in metadata) return true
  if (Array.isArray(metadata.reasons) && metadata.reasons.length > 0) return true
  return false
}

function retryableFromCategory(category: AppErrorCategory): boolean {
  if (category === 'timeout') return true
  if (category === 'rate_limited') return true
  if (category === 'provider_bad_gateway') return true
  if (category === 'no_provider_available') return true
  if (category === 'provider_error_unknown') return true
  if (category === 'network_unreachable') return true
  if (category === 'cancelled') return true
  return false
}

function gradeFromCategory(category: AppErrorCategory): 1 | 2 | 3 {
  if (
    category === 'timeout' ||
    category === 'rate_limited' ||
    category === 'provider_bad_gateway' ||
    category === 'no_provider_available' ||
    category === 'provider_error_unknown' ||
    category === 'network_unreachable' ||
    category === 'cancelled'
  ) {
    return 1
  }
  if (
    category === 'invalid_request' ||
    category === 'auth' ||
    category === 'payment_credit' ||
    category === 'moderation_blocked'
  ) {
    return 2
  }
  return 3
}

function userActionHintFromCategory(category: AppErrorCategory): AppErrorUserActionHint {
  if (category === 'auth') return 'check_api_key'
  if (category === 'payment_credit') return 'top_up'
  if (category === 'invalid_request') return 'shorten_context'
  if (category === 'moderation_blocked') return 'edit_prompt'
  if (category === 'timeout') return 'retry_later'
  if (category === 'rate_limited') return 'retry_later'
  if (category === 'provider_bad_gateway') return 'switch_model'
  if (category === 'no_provider_available') return 'switch_model'
  if (category === 'provider_error_unknown') return 'retry_later'
  if (category === 'network_unreachable') return 'retry_later'
  if (category === 'cancelled') return 'none'
  return 'report_bug'
}

function legacyActionFromCategory(category: AppErrorCategory, hint: AppErrorUserActionHint): NormalizedErrorAction {
  if (category === 'invalid_request') return 'fix_request'
  if (category === 'auth') return 'reauth'
  if (category === 'payment_credit') return 'topup_credits'
  if (category === 'moderation_blocked') return 'modify_input_moderation'
  if (category === 'timeout' || category === 'rate_limited') return 'backoff_retry'
  if (category === 'provider_bad_gateway') return 'switch_provider_or_model'
  if (category === 'no_provider_available') return 'relax_routing_constraints'
  if (category === 'provider_error_unknown' || category === 'network_unreachable') return 'backoff_retry'
  if (hint === 'switch_model') return 'switch_provider_or_model'
  return 'unknown'
}

function categoryFromHttpStatus(status: number, metadata?: Record<string, unknown>, code?: string, message?: string): AppErrorCategory {
  if (status === 400) return 'invalid_request'
  if (status === 401) return 'auth'
  if (status === 402) return 'payment_credit'
  if (status === 403) return hasModerationSignal(metadata, code, message) ? 'moderation_blocked' : 'moderation_blocked'
  if (status === 408) return 'timeout'
  if (status === 429) return 'rate_limited'
  if (status === 502) return 'provider_bad_gateway'
  if (status === 503) return 'no_provider_available'
  if (status >= 500) return 'provider_error_unknown'
  return 'invalid_request'
}

function categoryFromMidStreamCode(code: string, metadata?: Record<string, unknown>, message?: string): AppErrorCategory {
  const lowered = toLowerCode(code)
  const statusLike = coerceHttpStatus(code)
  if (statusLike) return categoryFromHttpStatus(statusLike, metadata, code, message)
  if (lowered.includes('rate_limit') || lowered.includes('too_many_requests')) return 'rate_limited'
  if (lowered.includes('timeout')) return 'timeout'
  if (lowered.includes('moderation') || hasModerationSignal(metadata, code, message)) return 'moderation_blocked'
  if (lowered.includes('auth') || lowered.includes('api_key') || lowered.includes('unauthorized')) return 'auth'
  if (lowered.includes('insufficient') || lowered.includes('credit') || lowered.includes('payment')) return 'payment_credit'
  if (lowered.includes('bad_gateway') || lowered === '502') return 'provider_bad_gateway'
  if (lowered.includes('no_provider') || lowered.includes('no_available_provider') || lowered === '503') return 'no_provider_available'
  if (lowered.includes('invalid') || lowered.includes('bad_request')) return 'invalid_request'
  return 'provider_error_unknown'
}

function inferLegacyPhase(appPhase: AppErrorPhase): Phase {
  if (appPhase === 'pre_stream_request_error') return 'request'
  return 'generation'
}

function inferLegacyTransport(appPhase: AppErrorPhase): Transport {
  if (appPhase === 'pre_stream_request_error') return 'http'
  return 'sse'
}

function sanitizeRawChunk(rawChunk: unknown): string | undefined {
  if (rawChunk === undefined || rawChunk === null) return undefined
  const text = typeof rawChunk === 'string' ? rawChunk : JSON.stringify(rawChunk)
  if (!text) return undefined
  return text.length <= 512 ? text : `${text.slice(0, 512)}...[truncated:${text.length - 512}]`
}

function parseBackoffHintMs(metadata?: Record<string, unknown>): number | undefined {
  if (!metadata) return undefined
  const backoffMs = metadata.backoff_ms
  if (typeof backoffMs === 'number' && Number.isFinite(backoffMs) && backoffMs >= 0) return backoffMs
  const retryAfterMs = metadata.retry_after_ms
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) return retryAfterMs
  const retryAfter = metadata.retry_after
  if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000
  if (typeof retryAfter === 'string' && /^\d+(\.\d+)?$/.test(retryAfter.trim())) {
    return Number(retryAfter) * 1000
  }
  return undefined
}

function buildAppError(input: Readonly<{
  phase: AppErrorPhase
  category: AppErrorCategory
  code: string
  message: string
  httpStatus?: number
  providerName?: string
  metadata?: Record<string, unknown>
  finishReason?: string
  debug?: Record<string, unknown>
}>): AppError {
  const grade = gradeFromCategory(input.category)
  const userActionHint = userActionHintFromCategory(input.category)
  return {
    phase: input.phase,
    category: input.category,
    grade,
    retryable: retryableFromCategory(input.category),
    userActionHint,
    code: input.code,
    message: input.message,
    ...(input.httpStatus !== undefined ? { httpStatus: input.httpStatus } : {}),
    ...(input.providerName ? { providerName: input.providerName } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.finishReason ? { finishReason: input.finishReason } : {}),
    ...(input.debug ? { debug: input.debug } : {}),
  }
}

export function normalizeOpenRouterPreStreamError(httpStatus: number, errorResponseJson: unknown): AppError {
  const response = asRecord(errorResponseJson)
  const err = asRecord(response?.error) ?? response
  const code = normalizeCode(err?.code, String(httpStatus || 'http_error'))
  const message =
    (safeString(err?.message) ?? safeString(response?.message) ?? (httpStatus ? `HTTP ${httpStatus}` : 'Request error')).trim()
  const metadata = sanitizeMetadata(err?.metadata)
  const providerName = pickProviderName(metadata)
  const category = categoryFromHttpStatus(httpStatus, metadata, code, message)

  return buildAppError({
    phase: 'pre_stream_request_error',
    category,
    code,
    message,
    ...(Number.isFinite(httpStatus) ? { httpStatus } : {}),
    ...(providerName ? { providerName } : {}),
    ...(metadata ? { metadata } : {}),
  })
}

export function normalizeOpenRouterMidStreamError(streamErrorEventJson: unknown): AppError {
  const event = asRecord(streamErrorEventJson)
  const err = asRecord(event?.error) ?? event
  const metadata = sanitizeMetadata(err?.metadata)
  const finishReasonRaw =
    safeString(asRecord((Array.isArray(event?.choices) ? event?.choices[0] : null))?.finish_reason) ??
    safeString(event?.finish_reason)
  const finishReason = finishReasonRaw ? finishReasonRaw.toLowerCase() : undefined
  const code = normalizeCode(err?.code, 'provider_error')
  const message = (safeString(err?.message) ?? 'Generation error').trim()
  const providerName =
    pickProviderName(metadata, safeString(event?.provider) ?? safeString(asRecord(event?.meta)?.provider))
  const category = categoryFromMidStreamCode(code, metadata, message)

  return buildAppError({
    phase: 'mid_stream_error',
    category,
    code,
    message,
    ...(providerName ? { providerName } : {}),
    ...(metadata ? { metadata } : {}),
    ...(finishReason ? { finishReason } : {}),
    debug: {
      finish_reason: finishReason,
      ...(safeString(asRecord(event?.meta)?.native_finish_reason)
        ? { native_finish_reason: safeString(asRecord(event?.meta)?.native_finish_reason) }
        : {}),
    },
  })
}

export function normalizeTransportError(err: unknown): AppError {
  const record = asRecord(err)
  const type = safeString(record?.type)?.toLowerCase()
  const name = safeString(record?.name)?.toLowerCase()
  const message =
    (safeString(record?.message) ?? safeString((err as any)?.message) ?? 'Transport error').trim()

  if (type === 'aborted' || name === 'aborterror') {
    return buildAppError({
      phase: 'user_cancelled',
      category: 'cancelled',
      code: 'aborted',
      message,
    })
  }

  if (type === 'timeout') {
    return buildAppError({
      phase: 'local_transport_error',
      category: 'timeout',
      code: normalizeCode(record?.code, 'timeout'),
      message,
      debug: {
        ...(typeof record?.timeoutMs === 'number' ? { timeoutMs: record.timeoutMs } : {}),
      },
    })
  }

  if (type === 'network_error') {
    return buildAppError({
      phase: 'local_transport_error',
      category: 'network_unreachable',
      code: normalizeCode(record?.code, 'network_error'),
      message,
      debug: {
        ...(record?.cause !== undefined ? { cause: record.cause } : {}),
      },
    })
  }

  const lowered = message.toLowerCase()
  if (lowered.includes('err_connection_closed') || lowered.includes('econnreset') || lowered.includes('network')) {
    return buildAppError({
      phase: 'local_transport_error',
      category: 'network_unreachable',
      code: normalizeCode(record?.code, 'network_error'),
      message,
    })
  }

  return buildAppError({
    phase: 'local_transport_error',
    category: 'provider_error_unknown',
    code: normalizeCode(record?.code, 'transport_error'),
    message,
    debug: {
      ...(name ? { name } : {}),
      ...(type ? { type } : {}),
    },
  })
}

export function normalizeProtocolError(err: unknown, rawChunk?: unknown): AppError {
  const record = asRecord(err)
  const message =
    (safeString(record?.message) ?? safeString((err as any)?.message) ?? 'Protocol parse failed').trim()
  const debugRawChunk = sanitizeRawChunk(rawChunk)
  return buildAppError({
    phase: 'local_protocol_error',
    category: 'protocol_invalid',
    code: normalizeCode(record?.code, 'protocol_invalid'),
    message,
    debug: {
      ...(debugRawChunk ? { rawChunk: debugRawChunk } : {}),
    },
  })
}

export function normalizeUserCancelledError(reason?: string): AppError {
  return buildAppError({
    phase: 'user_cancelled',
    category: 'cancelled',
    code: 'aborted',
    message: reason ? `aborted: ${reason}` : 'aborted',
  })
}

export function normalizeInternalBugError(err: unknown): AppError {
  const record = asRecord(err)
  const message =
    (safeString(record?.message) ?? safeString((err as any)?.message) ?? 'Internal error').trim()
  return buildAppError({
    phase: 'internal_bug',
    category: 'internal',
    code: normalizeCode(record?.code, 'internal_bug'),
    message,
    debug: {
      ...(safeString(record?.name) ? { name: safeString(record?.name) } : {}),
    },
  })
}

export function toNormalizedErrorEnvelope(input: Readonly<{
  appError: AppError
  endpoint?: Endpoint
  transport?: Transport
  phase?: Phase
  raw?: Record<string, unknown>
}>): NormalizedErrorEnvelope {
  const appError = input.appError
  const metadata = sanitizeMetadata(appError.metadata)
  const userActionHint = appError.userActionHint
  const action = legacyActionFromCategory(appError.category, userActionHint)
  const backoffHintMs = parseBackoffHintMs(metadata)

  return {
    normalized: {
      endpoint: input.endpoint ?? 'chat.completions',
      transport: input.transport ?? inferLegacyTransport(appError.phase),
      phase: input.phase ?? inferLegacyPhase(appError.phase),
      ...(appError.httpStatus !== undefined ? { httpStatus: appError.httpStatus } : {}),
      code: appError.code,
      message: appError.message,
      ...(metadata ? { metadata } : {}),
      ...(appError.providerName ? { providerName: appError.providerName } : {}),
      ...(pickRawProviderError(metadata) !== undefined ? { rawProviderError: pickRawProviderError(metadata) } : {}),
      retryable: appError.retryable,
      action,
      appPhase: appError.phase,
      category: appError.category,
      grade: appError.grade,
      userActionHint,
      ...(appError.finishReason ? { finishReason: appError.finishReason } : {}),
      ...(backoffHintMs !== undefined ? { backoffHintMs } : {}),
      ...(appError.debug ? { debug: appError.debug } : {}),
    },
    ...(input.raw ? { raw: input.raw } : {}),
  }
}

export function normalizeOpenRouterErrorFromHttpNon2xx(input: {
  status: number
  statusText?: string
  bodyText?: string
  headers?: Record<string, string>
}): NormalizedErrorEnvelope {
  const parsed = typeof input.bodyText === 'string' ? safeJsonParse(input.bodyText) : null
  const appError = normalizeOpenRouterPreStreamError(input.status, parsed ?? {
    error: {
      code: String(input.status),
      message: safeString(input.statusText) ?? `HTTP ${input.status}`,
    },
  })

  return toNormalizedErrorEnvelope({
    appError,
    endpoint: 'chat.completions',
    transport: 'http',
    phase: 'request',
    raw: {
      type: 'http_non2xx',
      status: input.status,
      statusText: input.statusText ?? '',
      bodyText: typeof input.bodyText === 'string' ? input.bodyText.slice(0, 20_000) : '',
      headers: input.headers ?? {},
    },
  })
}

export function normalizeOpenRouterErrorFromHttp2xxBodyError(input: {
  json: unknown
}): NormalizedErrorEnvelope {
  const body = asRecord(input.json)
  const appError = normalizeOpenRouterMidStreamError({
    error: asRecord(body?.error) ?? body,
    choices: [{ finish_reason: 'error' }],
  })

  return toNormalizedErrorEnvelope({
    appError,
    endpoint: 'chat.completions',
    transport: 'http',
    phase: 'generation',
    raw: {
      type: 'http_2xx_body_error',
      error: asRecord(body?.error) ?? null,
    },
  })
}

export function normalizeOpenRouterErrorFromSseChunkError(input: {
  chunkError: unknown
  meta?: Readonly<{ generationId?: string; model?: string; provider?: string; finishReason?: string; nativeFinishReason?: string }>
}): NormalizedErrorEnvelope {
  const event = {
    error: input.chunkError,
    provider: input.meta?.provider,
    choices: [{ finish_reason: input.meta?.finishReason ?? 'error' }],
    meta: {
      model: input.meta?.model,
      provider: input.meta?.provider,
      native_finish_reason: input.meta?.nativeFinishReason,
    },
  }
  const appErrorBase = normalizeOpenRouterMidStreamError(event)
  const appError =
    appErrorBase.providerName || !input.meta?.provider
      ? appErrorBase
      : ({ ...appErrorBase, providerName: input.meta.provider } as AppError)

  return toNormalizedErrorEnvelope({
    appError,
    endpoint: 'chat.completions',
    transport: 'sse',
    phase: 'generation',
    raw: {
      type: 'sse_chunk_error',
      chunkError: asRecord(input.chunkError) ?? null,
      meta: input.meta ?? {},
    },
  })
}

export function normalizeOpenRouterUnknownStreamingError(input: {
  message: string
  details?: Record<string, unknown>
}): NormalizedErrorEnvelope {
  const appError = normalizeTransportError({
    type: 'network_error',
    message: input.message,
    cause: input.details,
  })

  return toNormalizedErrorEnvelope({
    appError,
    endpoint: 'chat.completions',
    transport: 'sse',
    phase: 'generation',
    raw: { type: 'unknown_stream_error', ...(input.details ?? {}) },
  })
}

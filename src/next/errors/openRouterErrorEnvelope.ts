import type { NormalizedErrorEnvelope } from './normalizeOpenRouterError'

export type CompletionClass = 'ok' | 'truncated' | 'error' | 'aborted'
export type ErrorPhase = 'pre_stream' | 'mid_stream' | 'post_stream' | 'responses'

export type ErrorEnvelope = Readonly<{
  phase: ErrorPhase
  completionClass: CompletionClass
  /**
   * Normalized OpenRouter error fields.
   * - code is always stringified to avoid mixed number/string types.
   */
  openrouter: Readonly<{
    code: string
    message?: string
    metadata?: Record<string, unknown>
    provider?: string
  }>
  http?: Readonly<{
    status?: number
    statusText?: string
    headers?: Record<string, string>
  }>
  stream?: Readonly<{
    generation_id?: string
    model?: string
    provider?: string
    finish_reason?: string
    native_finish_reason?: string
    chunk_no?: number
  }>
  context?: Readonly<{
    model?: string
    stream?: boolean
  }>
  normalized?: NormalizedErrorEnvelope
  /**
   * Indicates sanitizer truncation happened for this envelope.
   */
  truncated: boolean
  raw?: Readonly<{
    raw_error?: unknown
  }>
  kind?: 'pre_stream_http' | 'mid_stream_sse' | 'body_embedded' | 'responses_event' | 'transport_error' | 'parse_error' | 'aborted'
}>

const MAX_ENVELOPE_BYTES = 24 * 1024
const MAX_STRING_BYTES = 4096
const MAX_META_KEYS = 40
const MAX_ARRAY_LEN = 40
const MAX_DEPTH = 4

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function toStringCode(code: unknown): string {
  if (typeof code === 'string' && code.trim().length > 0) return code
  if (typeof code === 'number' && Number.isFinite(code)) return String(code)
  return 'error'
}

function truncateStringBytes(input: string, maxBytes: number): { value: string; truncated: boolean } {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(input)
  if (bytes.length <= maxBytes) return { value: input, truncated: false }

  let low = 0
  let high = input.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    const slice = input.slice(0, mid)
    if (encoder.encode(slice).length <= maxBytes) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  const safeLen = Math.max(0, low - 1)
  return { value: input.slice(0, safeLen), truncated: true }
}

function sanitizeJsonValue(value: unknown, depth: number): { value: unknown; truncated: boolean } {
  if (depth <= 0) return { value: null, truncated: true }

  if (value === null || value === undefined) return { value: null, truncated: false }
  if (typeof value === 'boolean' || typeof value === 'number') return { value, truncated: false }

  if (typeof value === 'string') {
    const trimmed = truncateStringBytes(value, MAX_STRING_BYTES)
    return { value: trimmed.value, truncated: trimmed.truncated }
  }

  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY_LEN)
    let truncated = sliced.length !== value.length
    const out: unknown[] = []
    for (const item of sliced) {
      const sanitized = sanitizeJsonValue(item, depth - 1)
      if (sanitized.truncated) truncated = true
      out.push(sanitized.value)
    }
    return { value: out, truncated }
  }

  const obj = toRecord(value)
  if (!obj) {
    const text = truncateStringBytes(String(value), MAX_STRING_BYTES)
    return { value: text.value, truncated: text.truncated }
  }

  const keys = Object.keys(obj).slice(0, MAX_META_KEYS)
  let truncated = keys.length !== Object.keys(obj).length
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const sanitized = sanitizeJsonValue(obj[key], depth - 1)
    if (sanitized.truncated) truncated = true
    out[key] = sanitized.value
  }
  return { value: out, truncated }
}

function pickHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined
  const allow = new Set([
    'x-openrouter-generation-id',
    'x-request-id',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'retry-after',
    'content-type',
  ])
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase()
    if (!allow.has(key)) continue
    if (typeof v !== 'string' || !v.trim()) continue
    out[key] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function sanitizeNormalizedEnvelope(env?: NormalizedErrorEnvelope): NormalizedErrorEnvelope | undefined {
  if (!env) return undefined
  const n = env.normalized
  if (!n) return undefined
  return {
    normalized: {
      endpoint: n.endpoint,
      transport: n.transport,
      phase: n.phase,
      httpStatus: n.httpStatus,
      code: n.code,
      message: n.message,
      ...(n.metadata ? { metadata: n.metadata } : {}),
      ...(n.providerName ? { providerName: n.providerName } : {}),
      ...(n.rawProviderError !== undefined ? { rawProviderError: n.rawProviderError } : {}),
      retryable: n.retryable,
      action: n.action,
      appPhase: n.appPhase,
      category: n.category,
      grade: n.grade,
      userActionHint: n.userActionHint,
      ...(n.finishReason ? { finishReason: n.finishReason } : {}),
      ...(typeof n.backoffHintMs === 'number' ? { backoffHintMs: n.backoffHintMs } : {}),
      ...(n.debug ? { debug: n.debug } : {}),
    },
  }
}

/* eslint-disable max-lines-per-function */
export function sanitizeErrorEnvelope(input: ErrorEnvelope): ErrorEnvelope {
  let truncated = false

  const openrouterMeta = sanitizeJsonValue(input.openrouter.metadata ?? null, MAX_DEPTH)
  truncated = truncated || openrouterMeta.truncated

  const messageTrim = input.openrouter.message
    ? truncateStringBytes(input.openrouter.message, MAX_STRING_BYTES)
    : null
  if (messageTrim?.truncated) truncated = true

  const providerTrim = input.openrouter.provider
    ? truncateStringBytes(input.openrouter.provider, MAX_STRING_BYTES)
    : null
  if (providerTrim?.truncated) truncated = true

  const sanitized: ErrorEnvelope = {
    phase: input.phase,
    completionClass: input.completionClass,
    openrouter: {
      code: toStringCode(input.openrouter.code),
      ...(messageTrim ? { message: messageTrim.value } : {}),
      ...(openrouterMeta.value && typeof openrouterMeta.value === 'object' ? { metadata: openrouterMeta.value as Record<string, unknown> } : {}),
      ...(providerTrim ? { provider: providerTrim.value } : {}),
    },
    ...(input.http
      ? {
          http: {
            status: input.http.status,
            statusText: input.http.statusText
              ? (() => {
                  const trimmed = truncateStringBytes(input.http.statusText as string, MAX_STRING_BYTES)
                  if (trimmed.truncated) truncated = true
                  return trimmed.value
                })()
              : undefined,
            headers: pickHeaders(input.http.headers),
          },
        }
      : {}),
    ...(input.stream
      ? {
          stream: {
            generation_id: input.stream.generation_id,
            model: input.stream.model,
            provider: input.stream.provider,
            finish_reason: input.stream.finish_reason,
            native_finish_reason: input.stream.native_finish_reason,
            chunk_no: input.stream.chunk_no,
          },
        }
      : {}),
    ...(input.context
      ? {
          context: {
            model: input.context.model,
            stream: input.context.stream,
          },
        }
      : {}),
    ...(input.normalized ? { normalized: sanitizeNormalizedEnvelope(input.normalized) } : {}),
    truncated: false,
    ...(input.kind ? { kind: input.kind } : {}),
  }

  if (input.raw && input.completionClass !== 'ok') {
    const raw = sanitizeJsonValue(input.raw, MAX_DEPTH)
    truncated = truncated || raw.truncated
  }

  const enforceSizeLimit = (env: ErrorEnvelope): ErrorEnvelope => {
    const encoder = new TextEncoder()
    const sizeOf = (value: unknown) => {
      try {
        return encoder.encode(JSON.stringify(value)).length
      } catch {
        return MAX_ENVELOPE_BYTES + 1
      }
    }

    let next: ErrorEnvelope = env
    let size = sizeOf(next)
    if (size <= MAX_ENVELOPE_BYTES) return next

    truncated = true
    const reduced: any = {
      ...next,
      openrouter: { ...next.openrouter },
    }

    if (reduced.openrouter.metadata) delete (reduced.openrouter as any).metadata
    if (reduced.http?.headers) {
      reduced.http = { ...reduced.http, headers: undefined }
    }
    if (reduced.stream) delete (reduced as any).stream
    if (reduced.context) delete (reduced as any).context
    if (reduced.normalized) delete (reduced as any).normalized

    next = reduced
    size = sizeOf(next)
    if (size <= MAX_ENVELOPE_BYTES) return next

    if (next.openrouter.message) {
      const tighter = truncateStringBytes(next.openrouter.message, 1024)
      next = {
        ...next,
        openrouter: {
          ...next.openrouter,
          message: tighter.value,
        },
      }
    }
    return next
  }

  const finalEnvelope = enforceSizeLimit(sanitized)
  return { ...finalEnvelope, truncated }
}
/* eslint-enable max-lines-per-function */

export function buildPreStreamHttpErrorEnvelope(input: {
  phase: ErrorPhase
  completionClass: CompletionClass
  status: number
  statusText?: string
  bodyText?: string
  headers?: Record<string, string>
  normalized: NormalizedErrorEnvelope
  request?: { model?: string; stream?: boolean }
}): ErrorEnvelope {
  const normalized = input.normalized
  const provider = normalized.normalized.providerName
  return sanitizeErrorEnvelope({
    phase: input.phase,
    completionClass: input.completionClass,
    openrouter: {
      code: toStringCode(normalized.normalized.code),
      message: normalized.normalized.message,
      metadata: normalized.normalized.metadata,
      provider,
    },
    http: {
      status: input.status,
      statusText: input.statusText,
      headers: input.headers,
    },
    context: input.request,
    normalized,
    truncated: false,
    kind: 'pre_stream_http',
  })
}

export function buildMidStreamSseErrorEnvelope(input: {
  phase: ErrorPhase
  completionClass: CompletionClass
  normalized: NormalizedErrorEnvelope
  stream?: { generation_id?: string; model?: string; provider?: string; finish_reason?: string; native_finish_reason?: string; chunk_no?: number }
  request?: { model?: string; stream?: boolean }
}): ErrorEnvelope {
  const normalized = input.normalized
  const provider = normalized.normalized.providerName ?? input.stream?.provider
  return sanitizeErrorEnvelope({
    phase: input.phase,
    completionClass: input.completionClass,
    openrouter: {
      code: toStringCode(normalized.normalized.code),
      message: normalized.normalized.message,
      metadata: normalized.normalized.metadata,
      provider,
    },
    stream: input.stream,
    context: input.request,
    normalized,
    truncated: false,
    kind: 'mid_stream_sse',
  })
}

export function buildTransportErrorEnvelope(input: {
  phase: ErrorPhase
  completionClass: CompletionClass
  message: string
  normalized?: NormalizedErrorEnvelope
  request?: { model?: string; stream?: boolean }
  kind?: 'transport_error' | 'parse_error'
}): ErrorEnvelope {
  const normalized = input.normalized?.normalized
  const code = toStringCode(normalized?.code ?? 'transport_error')
  const message = normalized?.message ?? input.message
  const metadata = normalized?.metadata
  const provider = normalized?.providerName
  return sanitizeErrorEnvelope({
    phase: input.phase,
    completionClass: input.completionClass,
    openrouter: {
      code,
      message,
      ...(metadata ? { metadata } : {}),
      ...(provider ? { provider } : {}),
    },
    context: input.request,
    ...(input.normalized ? { normalized: input.normalized } : {}),
    truncated: false,
    kind: input.kind ?? 'transport_error',
  })
}

export function buildAbortEnvelope(input: {
  phase: ErrorPhase
  completionClass: CompletionClass
  reason?: string
  request?: { model?: string; stream?: boolean }
}): ErrorEnvelope {
  const message = input.reason ? `aborted: ${input.reason}` : 'aborted'
  return sanitizeErrorEnvelope({
    phase: input.phase,
    completionClass: input.completionClass,
    openrouter: {
      code: 'aborted',
      message,
    },
    context: input.request,
    truncated: false,
    kind: 'aborted',
  })
}

import { createHash } from 'node:crypto'

export type ProviderFailureOriginV2 =
  | 'proxy_controller'
  | 'network_transport'
  | 'http_response'
  | 'response_stream'
  | 'response_decoder'
  | 'provider_runtime'
  | 'starverse_internal'

export type ProviderFailurePhaseV2 =
  | 'proxy_preflight'
  | 'request_open'
  | 'request_upload'
  | 'response_headers'
  | 'response_body'
  | 'stream_read'
  | 'stream_decode'
  | 'terminal_persistence'

export type ProviderFailureRedactionReasonV2 =
  | 'credential'
  | 'authorization_header'
  | 'cookie'
  | 'local_path'
  | 'proxy_credential'
  | 'url_credential'
  | 'size_limit'

export type ProviderFailureRedactionV2 = Readonly<{
  path: string
  reason: ProviderFailureRedactionReasonV2
}>

export type ProviderFailureTruncationV2 = Readonly<{
  path: string
  originalByteLength: number
  retainedByteLength: number
  sha256: string
}>

export type ProviderFailureV2 = Readonly<{
  origin: ProviderFailureOriginV2
  phase: ProviderFailurePhaseV2
  providerId: string
  contractId: string
  operationId: string
  requestSequence: number
  httpStatus: number | null
  httpStatusText: string | null
  providerError: Readonly<{
    code: string | number | null
    type: string | null
    message: string | null
    param: string | null
    requestId: string | null
    retryAfterMs: number | null
    rawJson: unknown | null
    rawText: string | null
  }> | null
  transportError: Readonly<{
    name: string | null
    code: string | null
    message: string | null
  }> | null
  starverseDiagnosticCode: string
  redactions: readonly ProviderFailureRedactionV2[]
  truncations: readonly ProviderFailureTruncationV2[]
}>

export type ProviderFailureV2Context = Readonly<{
  origin: ProviderFailureOriginV2
  phase: ProviderFailurePhaseV2
  providerId: string
  contractId: string
  operationId: string
  requestSequence: number
  starverseDiagnosticCode?: string
}>

export class ProviderFailureErrorV2 extends Error {
  constructor(readonly failure: ProviderFailureV2) {
    super(failure.providerError?.message ?? failure.transportError?.message ?? failure.starverseDiagnosticCode)
    this.name = 'ProviderFailureErrorV2'
  }
}

export const PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2 = 1024 * 1024
export const PROVIDER_FAILURE_UI_LIMIT_BYTES_V2 = 64 * 1024

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : null
}

function boundedSequence(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : 1
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function truncateUtf8(value: string, limit: number): string {
  const bytes = new TextEncoder().encode(value)
  if (bytes.byteLength <= limit) return value
  return new TextDecoder().decode(bytes.slice(0, limit))
}

function sanitizeText(value: string, path: string, redactions: ProviderFailureRedactionV2[]): string {
  if (!value.includes(':') && !value.includes('/') && !value.includes('\\') &&
      !value.toLowerCase().includes('authorization') && !value.toLowerCase().includes('cookie')) return value
  let next = value
  const replace = (pattern: RegExp, replacement: string, reason: ProviderFailureRedactionReasonV2) => {
    const replaced = next.replace(pattern, replacement)
    if (replaced !== next) {
      next = replaced
      redactions.push(Object.freeze({ path, reason }))
    }
  }
  replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/giu, '$1[redacted]', 'authorization_header')
  replace(/(cookie\s*:\s*)[^\r\n]+/giu, '$1[redacted]', 'cookie')
  replace(/([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+)(?::([^/@\s]+))?@/giu, '$1[redacted]@', 'url_credential')
  replace(/(?:[A-Za-z]:\\|\\\\|\/)[^\r\n\s]*/gu, '[local path redacted]', 'local_path')
  return next
}

function sanitizeJsonValue(
  value: unknown,
  path: string,
  redactions: ProviderFailureRedactionV2[],
): unknown {
  if (typeof value === 'string') return sanitizeText(value, path, redactions)
  if (Array.isArray(value)) return value.map((item, index) => sanitizeJsonValue(item, `${path}[${index}]`, redactions))
  const object = record(value)
  if (!object) return value
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(object)) {
    const childPath = `${path}.${key}`
    if (/^(?:authorization|api[_-]?key|access[_-]?token|cookie|password|proxy[_-]?(?:username|password))$/iu.test(key)) {
      output[key] = '[redacted]'
      redactions.push(Object.freeze({ path: childPath, reason: /cookie/iu.test(key) ? 'cookie' : /proxy/iu.test(key) ? 'proxy_credential' : 'credential' }))
    } else {
      output[key] = sanitizeJsonValue(child, childPath, redactions)
    }
  }
  return output
}

function parseJsonText(value: string): unknown | null {
  try { return JSON.parse(value) } catch { return null }
}

function retryAfterMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  const text = safeString(value)?.trim()
  if (!text) return null
  if (/^\d+(?:\.\d+)?$/u.test(text)) return Number(text) * 1000
  const at = Date.parse(text)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

function inferDiagnosticCode(input: ProviderFailureV2Context): string {
  if (input.starverseDiagnosticCode) return input.starverseDiagnosticCode
  if (input.phase === 'proxy_preflight') return 'PROXY_PREFLIGHT_FAILED'
  if (input.phase === 'request_open' || input.phase === 'request_upload') return 'PROVIDER_REQUEST_OPEN_FAILED'
  if (input.phase === 'response_headers' || input.phase === 'response_body') return 'PROVIDER_RESPONSE_HTTP_ERROR'
  if (input.phase === 'stream_read') return 'PROVIDER_RESPONSE_STREAM_FAILED'
  if (input.phase === 'stream_decode') return 'PROVIDER_RESPONSE_DECODE_FAILED'
  if (input.phase === 'terminal_persistence') return 'PROVIDER_TERMINAL_PERSIST_FAILED'
  return 'PROVIDER_RUNTIME_FAILED'
}

function boundedRaw(input: unknown, path: string, redactions: ProviderFailureRedactionV2[], truncations: ProviderFailureTruncationV2[]): Readonly<{ json: unknown | null; text: string | null }> {
  const sourceText = typeof input === 'string' ? input : input === undefined || input === null ? null : (() => {
    try { return JSON.stringify(input) } catch { return String(input) }
  })()
  if (!sourceText) return { json: null, text: null }
  const sanitizedText = sanitizeText(sourceText, path, redactions)
  const sourceBytes = byteLength(sanitizedText)
  const text = sourceBytes > PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2
    ? truncateUtf8(sanitizedText, PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2)
    : sanitizedText
  if (text !== sanitizedText) {
    truncations.push(Object.freeze({
      path,
      originalByteLength: sourceBytes,
      retainedByteLength: byteLength(text),
      sha256: createHash('sha256').update(sanitizedText, 'utf8').digest('hex'),
    }))
    redactions.push(Object.freeze({ path, reason: 'size_limit' }))
  }
  const parsed = sourceBytes > PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2 ? null : parseJsonText(text)
  const json = parsed === null ? null : sanitizeJsonValue(parsed, path, redactions)
  return { json, text: parsed === null ? text : null }
}

function providerErrorFromBody(input: Readonly<{ rawJson: unknown | null; rawText: string | null; headers?: Readonly<Record<string, string>> }>): ProviderFailureV2['providerError'] {
  const body = record(input.rawJson) ?? (input.rawText ? record(parseJsonText(input.rawText)) : null)
  const error = record(body?.error) ?? body
  const headerRetry = input.headers && Object.entries(input.headers).find(([key]) => key.toLowerCase() === 'retry-after')?.[1]
  if (!error && !input.rawText) return null
  return Object.freeze({
    code: (typeof error?.code === 'string' || typeof error?.code === 'number') ? error.code : null,
    type: safeString(error?.type),
    message: safeString(error?.message) ?? safeString(body?.message),
    param: safeString(error?.param),
    requestId: safeString(error?.request_id) ?? safeString(error?.requestId) ?? safeString(body?.request_id) ?? safeString(body?.requestId),
    retryAfterMs: retryAfterMs(error?.retry_after_ms ?? error?.retry_after ?? body?.retry_after_ms ?? body?.retry_after ?? headerRetry),
    rawJson: input.rawJson,
    rawText: input.rawText,
  })
}

export function createProviderFailureV2(input: Readonly<{
  context: ProviderFailureV2Context
  httpStatus?: unknown
  httpStatusText?: unknown
  body?: unknown
  bodyText?: string | null
  headers?: Readonly<Record<string, string>>
  transportError?: unknown
}>): ProviderFailureV2 {
  const redactions: ProviderFailureRedactionV2[] = []
  const truncations: ProviderFailureTruncationV2[] = []
  const bounded = input.bodyText !== undefined && input.bodyText !== null
    ? boundedRaw(input.bodyText, 'providerError.rawText', redactions, truncations)
    : boundedRaw(input.body, 'providerError.rawJson', redactions, truncations)
  const transport = record(input.transportError)
  const transportError = transport || input.transportError instanceof Error
    ? Object.freeze({
        name: safeString(transport?.name) ?? (input.transportError instanceof Error ? input.transportError.name : null),
        code: safeString(transport?.code) ?? safeString((input.transportError as { code?: unknown } | null)?.code),
        message: safeString(transport?.message) ?? (input.transportError instanceof Error ? sanitizeText(input.transportError.message, 'transportError.message', redactions) : null),
      })
    : null
  const status = typeof input.httpStatus === 'number' && Number.isSafeInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599
    ? input.httpStatus : null
  return Object.freeze({
    origin: input.context.origin,
    phase: input.context.phase,
    providerId: String(input.context.providerId),
    contractId: String(input.context.contractId),
    operationId: String(input.context.operationId),
    requestSequence: boundedSequence(input.context.requestSequence),
    httpStatus: status,
    httpStatusText: safeString(input.httpStatusText),
    providerError: providerErrorFromBody({ rawJson: bounded.json, rawText: bounded.text, headers: input.headers }),
    transportError,
    starverseDiagnosticCode: inferDiagnosticCode(input.context),
    redactions: Object.freeze(redactions),
    truncations: Object.freeze(truncations),
  })
}

export function providerFailureFromUnknownV2(error: unknown, context: ProviderFailureV2Context): ProviderFailureV2 {
  if (error instanceof ProviderFailureErrorV2) return error.failure
  const value = record(error)
  return createProviderFailureV2({
    context,
    httpStatus: value?.status ?? value?.httpStatus,
    httpStatusText: value?.statusText,
    body: value?.body ?? value?.responseBody ?? value?.error,
    bodyText: typeof value?.bodyText === 'string' ? value.bodyText : undefined,
    headers: value?.headers && typeof value.headers === 'object' ? value.headers as Record<string, string> : undefined,
    transportError: error,
  })
}

export function providerFailurePrimaryMessageV2(failure: ProviderFailureV2): string {
  const provider = failure.providerError
  const parts = [
    failure.httpStatus === null ? null : `HTTP ${failure.httpStatus}${failure.httpStatusText ? ` ${failure.httpStatusText}` : ''}`,
    provider?.message ?? provider?.rawText,
    provider?.code === null || provider?.code === undefined ? null : `Code: ${String(provider.code)}`,
    provider?.type ? `Type: ${provider.type}` : null,
    provider?.param ? `Parameter: ${provider.param}` : null,
    provider?.requestId ? `Request ID: ${provider.requestId}` : null,
    failure.transportError?.message,
  ].filter((item): item is string => Boolean(item && item.trim()))
  return parts.join('\n') || failure.starverseDiagnosticCode
}

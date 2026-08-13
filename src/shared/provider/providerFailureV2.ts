import { sha256Hex } from '../crypto/sha256Hex'
import {
  decodeGenerationExecutionProviderId,
  type GenerationExecutionProviderId,
} from './generationExecutionProviderId'
import type { ProviderCatalogKnownProviderKey } from '../modelCatalog/providerCatalogContracts'
import {
  decodeProviderCredentialKey,
  type ProviderCredentialKey,
} from './providerCredentialKey'

export type ProviderFailureOriginV2 =
  | 'proxy_controller'
  | 'network_transport'
  | 'http_response'
  | 'response_stream'
  | 'response_decoder'
  | 'provider_runtime'
  | 'secure_storage'
  | 'ipc_bridge'
  | 'database'
  | 'local_projection'
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

export type ProviderFailureProviderRefV2 =
  | Readonly<{ namespace: 'generation_execution'; id: GenerationExecutionProviderId }>
  | Readonly<{ namespace: 'catalog_source'; id: ProviderCatalogKnownProviderKey }>
  | Readonly<{ namespace: 'credential_slot'; id: ProviderCredentialKey }>

export type ProviderFailureV2 = Readonly<{
  origin: ProviderFailureOriginV2
  phase: ProviderFailurePhaseV2
  provider: ProviderFailureProviderRefV2
  contractId: string
  operationId: string
  requestSequence: number
  httpStatus: number | null
  httpStatusText: string | null
  providerError: Readonly<{
    code: string | number | null
    type: string | null
    status: string | null
    message: string | null
    param: string | null
    requestId: string | null
    retryAfterMs: number | null
    rawJson: unknown | null
    rawText: string | null
  }> | null
  rawFrameExcerpt: string | null
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
  provider: ProviderFailureProviderRefV2
  contractId: string
  operationId: string
  requestSequence: number
  starverseDiagnosticCode?: string
}>

const PROVIDER_FAILURE_ORIGINS_V2 = Object.freeze([
  'proxy_controller', 'network_transport', 'http_response', 'response_stream', 'response_decoder',
  'provider_runtime', 'secure_storage', 'ipc_bridge', 'database', 'local_projection', 'starverse_internal',
] as const satisfies readonly ProviderFailureOriginV2[])
const PROVIDER_FAILURE_PHASES_V2 = Object.freeze([
  'proxy_preflight', 'request_open', 'request_upload', 'response_headers', 'response_body',
  'stream_read', 'stream_decode', 'terminal_persistence',
] as const satisfies readonly ProviderFailurePhaseV2[])
const PROVIDER_FAILURE_REDACTION_REASONS_V2 = Object.freeze([
  'credential', 'authorization_header', 'cookie', 'local_path', 'proxy_credential', 'url_credential', 'size_limit',
] as const satisfies readonly ProviderFailureRedactionReasonV2[])

export class ProviderFailureErrorV2 extends Error {
  constructor(readonly failure: ProviderFailureV2) {
    super(failure.providerError?.message ?? failure.transportError?.message ?? failure.starverseDiagnosticCode)
    this.name = 'ProviderFailureErrorV2'
  }
}

// A failure may carry both a response body and a stream-frame excerpt. Keep
// each raw field below the 1 MiB total persistence envelope budget.
export const PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2 = 384 * 1024
const PROVIDER_FAILURE_MESSAGE_LIMIT_BYTES_V2 = 64 * 1024
const PROVIDER_FAILURE_SCALAR_LIMIT_BYTES_V2 = 4 * 1024

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : null
}

function boundedSequence(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : 1
}

function closedRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const result = record(value)
  if (!result || Object.keys(result).length !== keys.length ||
      keys.some((key) => !Object.prototype.hasOwnProperty.call(result, key)) ||
      Object.keys(result).some((key) => !keys.includes(key))) throw new Error('PROVIDER_FAILURE_INVALID')
  return result
}

function requiredFactString(value: unknown, maxBytes = PROVIDER_FAILURE_SCALAR_LIMIT_BYTES_V2): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value) || byteLength(value) > maxBytes) throw new Error('PROVIDER_FAILURE_INVALID')
  return value
}

function nullableString(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new Error('PROVIDER_FAILURE_INVALID')
  return value
}

function finiteNullableNumber(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('PROVIDER_FAILURE_INVALID')
  return value
}

function deepFreezeFact<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreezeFact(child)
    Object.freeze(value)
  }
  return value
}

function decodeCatalogProviderKey(value: unknown): ProviderCatalogKnownProviderKey {
  if (value !== 'openrouter' && value !== 'google_ai_studio' && value !== 'anthropic_messages' &&
      value !== 'openai_responses' && value !== 'deepseek') {
    throw new Error('PROVIDER_FAILURE_PROVIDER_INVALID')
  }
  return value
}

function providerRef(value: ProviderFailureProviderRefV2): ProviderFailureProviderRefV2 {
  if (value?.namespace === 'generation_execution') {
    return Object.freeze({ namespace: value.namespace, id: decodeGenerationExecutionProviderId(value.id) })
  }
  if (value?.namespace === 'catalog_source') {
    return Object.freeze({ namespace: value.namespace, id: decodeCatalogProviderKey(value.id) })
  }
  if (value?.namespace === 'credential_slot') {
    return Object.freeze({ namespace: value.namespace, id: decodeProviderCredentialKey(value.id) })
  }
  throw new Error('PROVIDER_FAILURE_PROVIDER_INVALID')
}

function decodeProviderRef(value: unknown): ProviderFailureProviderRefV2 {
  const input = closedRecord(value, ['namespace', 'id'])
  return providerRef(input as ProviderFailureProviderRefV2)
}

export function decodeProviderFailureV2(value: unknown): ProviderFailureV2 {
  const input = closedRecord(value, [
    'origin', 'phase', 'provider', 'contractId', 'operationId', 'requestSequence', 'httpStatus', 'httpStatusText',
    'providerError', 'rawFrameExcerpt', 'transportError', 'starverseDiagnosticCode', 'redactions', 'truncations',
  ])
  if (!PROVIDER_FAILURE_ORIGINS_V2.includes(input.origin as ProviderFailureOriginV2) ||
      !PROVIDER_FAILURE_PHASES_V2.includes(input.phase as ProviderFailurePhaseV2) ||
      !Number.isSafeInteger(input.requestSequence) || (input.requestSequence as number) < 1 ||
      (input.httpStatus !== null && (!Number.isSafeInteger(input.httpStatus) || (input.httpStatus as number) < 100 || (input.httpStatus as number) > 599)) ||
      !Array.isArray(input.redactions) || !Array.isArray(input.truncations)) throw new Error('PROVIDER_FAILURE_INVALID')

  const providerError = input.providerError === null ? null : (() => {
    const error = closedRecord(input.providerError, [
      'code', 'type', 'status', 'message', 'param', 'requestId', 'retryAfterMs', 'rawJson', 'rawText',
    ])
    if (error.code !== null && typeof error.code !== 'string' && typeof error.code !== 'number' ||
        typeof error.code === 'number' && !Number.isFinite(error.code)) throw new Error('PROVIDER_FAILURE_INVALID')
    return {
      code: error.code as string | number | null,
      type: nullableString(error.type),
      status: nullableString(error.status),
      message: nullableString(error.message),
      param: nullableString(error.param),
      requestId: nullableString(error.requestId),
      retryAfterMs: finiteNullableNumber(error.retryAfterMs),
      rawJson: error.rawJson ?? null,
      rawText: nullableString(error.rawText),
    }
  })()
  const transportError = input.transportError === null ? null : (() => {
    const transport = closedRecord(input.transportError, ['name', 'code', 'message'])
    return { name: nullableString(transport.name), code: nullableString(transport.code), message: nullableString(transport.message) }
  })()
  const redactions = input.redactions.map((value) => {
    const redaction = closedRecord(value, ['path', 'reason'])
    if (!PROVIDER_FAILURE_REDACTION_REASONS_V2.includes(redaction.reason as ProviderFailureRedactionReasonV2)) {
      throw new Error('PROVIDER_FAILURE_INVALID')
    }
    return { path: requiredFactString(redaction.path), reason: redaction.reason as ProviderFailureRedactionReasonV2 }
  })
  const truncations = input.truncations.map((value) => {
    const truncation = closedRecord(value, ['path', 'originalByteLength', 'retainedByteLength', 'sha256'])
    if (!Number.isSafeInteger(truncation.originalByteLength) || (truncation.originalByteLength as number) < 0 ||
        !Number.isSafeInteger(truncation.retainedByteLength) || (truncation.retainedByteLength as number) < 0 ||
        (truncation.retainedByteLength as number) > (truncation.originalByteLength as number) ||
        typeof truncation.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(truncation.sha256)) {
      throw new Error('PROVIDER_FAILURE_INVALID')
    }
    return { path: requiredFactString(truncation.path), originalByteLength: truncation.originalByteLength as number,
      retainedByteLength: truncation.retainedByteLength as number, sha256: truncation.sha256 }
  })
  return deepFreezeFact({
    origin: input.origin as ProviderFailureOriginV2,
    phase: input.phase as ProviderFailurePhaseV2,
    provider: decodeProviderRef(input.provider),
    contractId: requiredFactString(input.contractId),
    operationId: requiredFactString(input.operationId),
    requestSequence: input.requestSequence as number,
    httpStatus: input.httpStatus as number | null,
    httpStatusText: nullableString(input.httpStatusText),
    providerError,
    rawFrameExcerpt: nullableString(input.rawFrameExcerpt),
    transportError,
    starverseDiagnosticCode: requiredFactString(input.starverseDiagnosticCode),
    redactions,
    truncations,
  })
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function truncateUtf8(value: string, limit: number): string {
  const bytes = new TextEncoder().encode(value)
  if (bytes.byteLength <= limit) return value
  return new TextDecoder().decode(bytes.slice(0, limit))
}

function boundedFactString(
  value: unknown,
  path: string,
  limit: number,
  redactions: ProviderFailureRedactionV2[],
  truncations: ProviderFailureTruncationV2[],
): string | null {
  const source = safeString(value)
  if (source === null) return null
  const sanitized = sanitizeText(source, path, redactions)
  if (byteLength(sanitized) <= limit) return sanitized
  const retained = truncateUtf8(sanitized, limit)
  truncations.push(Object.freeze({
    path,
    originalByteLength: byteLength(sanitized),
    retainedByteLength: byteLength(retained),
    sha256: sha256Hex(sanitized),
  }))
  redactions.push(Object.freeze({ path, reason: 'size_limit' }))
  return retained
}

function sanitizeText(value: string, path: string, redactions: ProviderFailureRedactionV2[]): string {
  const lowerValue = value.toLowerCase()
  const hasAuthorization = lowerValue.includes('authorization')
  const hasCookie = lowerValue.includes('cookie')
  const hasUrlShape = value.includes('://')
  const hasCredentialLabel = !hasUrlShape && /(?:x-goog-api-key|x-api-key|api[_ -]?key)/iu.test(value)
  const hasUrlCredentialShape = hasUrlShape && value.includes('@')
  const hasSensitiveQueryShape = hasUrlShape && (value.includes('?') || value.includes('&'))
  const hasWindowsPathShape = /(?:[A-Za-z]:\\|\\\\)/u.test(value)
  const hasPosixPathShape = /(?:^|[\s"'=:(])\/(?!\/)[^\r\n\s"']+/u.test(value)
  if (!hasAuthorization && !hasCredentialLabel && !hasCookie && !hasUrlCredentialShape && !hasSensitiveQueryShape &&
      !hasWindowsPathShape && !hasPosixPathShape) return value
  let next = value
  const replace = (pattern: RegExp, replacement: string, reason: ProviderFailureRedactionReasonV2) => {
    const replaced = next.replace(pattern, replacement)
    if (replaced !== next) {
      next = replaced
      redactions.push(Object.freeze({ path, reason }))
    }
  }
  if (hasAuthorization) {
    replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/giu, '$1[redacted]', 'authorization_header')
  }
  if (hasCredentialLabel) {
    replace(/((?:x-goog-api-key|x-api-key|api[_ -]?key)\s*(?::|=)?\s*)[^\s,;"']+/giu,
      '$1[redacted]', 'credential')
  }
  if (hasCookie) replace(/(cookie\s*:\s*)[^\r\n]+/giu, '$1[redacted]', 'cookie')
  if (hasUrlCredentialShape) {
    replace(/([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+)(?::([^/@\s]+))?@/giu, '$1[redacted]@', 'url_credential')
  }
  if (hasSensitiveQueryShape) {
    replace(/([?&](?:api[_-]?key|key|token|access[_-]?token|signature|sig)=)[^&#\s"']+/giu,
      '$1[redacted]', 'url_credential')
  }
  if (hasWindowsPathShape) {
    replace(/(?:[A-Za-z]:\\|\\\\)[^\r\n\s"']*/gu, '[local path redacted]', 'local_path')
  }
  if (hasPosixPathShape) {
    replace(/(^|[\s"'=:(])(\/(?!\/)[^\r\n\s"']*)/gu, '$1[local path redacted]', 'local_path')
  }
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

function boundedRaw(input: unknown, path: string, redactions: ProviderFailureRedactionV2[], truncations: ProviderFailureTruncationV2[]): Readonly<{
  json: unknown | null
  text: string | null
  factsJson: unknown | null
}> {
  const sourceText = typeof input === 'string' ? input : input === undefined || input === null ? null : (() => {
    try { return JSON.stringify(input) } catch { return String(input) }
  })()
  if (!sourceText) return { json: null, text: null, factsJson: null }
  const parsedSource = parseJsonText(sourceText)
  const sanitizedJson = parsedSource === null ? null : sanitizeJsonValue(parsedSource, path, redactions)
  const sanitizedText = sanitizedJson === null
    ? sanitizeText(sourceText, path, redactions)
    : JSON.stringify(sanitizedJson)
  const sourceBytes = byteLength(sanitizedText)
  const text = sourceBytes > PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2
    ? truncateUtf8(sanitizedText, PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2)
    : sanitizedText
  if (text !== sanitizedText) {
    truncations.push(Object.freeze({
      path,
      originalByteLength: sourceBytes,
      retainedByteLength: byteLength(text),
      sha256: sha256Hex(sanitizedText),
    }))
    redactions.push(Object.freeze({ path, reason: 'size_limit' }))
  }
  if (sourceBytes > PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2 || sanitizedJson === null) {
    return { json: null, text, factsJson: sanitizedJson }
  }
  return { json: sanitizedJson, text: null, factsJson: sanitizedJson }
}

function providerErrorFromBody(input: Readonly<{
  rawJson: unknown | null
  rawText: string | null
  factsJson?: unknown | null
  headers?: Readonly<Record<string, string>>
  redactions: ProviderFailureRedactionV2[]
  truncations: ProviderFailureTruncationV2[]
}>): ProviderFailureV2['providerError'] {
  const body = record(input.factsJson) ?? record(input.rawJson) ??
    (input.rawText ? record(parseJsonText(input.rawText)) : null)
  const error = record(body?.error) ?? body
  const header = (name: string) => input.headers && Object.entries(input.headers).find(([key]) => key.toLowerCase() === name)?.[1]
  const headerRetry = header('retry-after')
  const headerRequestId = header('x-request-id') ?? header('request-id') ?? header('x-goog-request-id')
  if (!error && !input.rawText) return null
  return Object.freeze({
    code: typeof error?.code === 'number' ? error.code : boundedFactString(error?.code,
      'providerError.code', PROVIDER_FAILURE_SCALAR_LIMIT_BYTES_V2, input.redactions, input.truncations),
    type: boundedFactString(error?.type, 'providerError.type', PROVIDER_FAILURE_SCALAR_LIMIT_BYTES_V2,
      input.redactions, input.truncations),
    status: boundedFactString(error?.status, 'providerError.status', PROVIDER_FAILURE_SCALAR_LIMIT_BYTES_V2,
      input.redactions, input.truncations),
    message: boundedFactString(error?.message ?? body?.message, 'providerError.message',
      PROVIDER_FAILURE_MESSAGE_LIMIT_BYTES_V2, input.redactions, input.truncations),
    param: boundedFactString(error?.param, 'providerError.param', PROVIDER_FAILURE_SCALAR_LIMIT_BYTES_V2,
      input.redactions, input.truncations),
    requestId: boundedFactString(error?.request_id ?? error?.requestId ?? body?.request_id ?? body?.requestId ?? headerRequestId,
      'providerError.requestId', PROVIDER_FAILURE_SCALAR_LIMIT_BYTES_V2, input.redactions, input.truncations),
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
  rawFrameExcerpt?: string | null
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
        name: boundedFactString(transport?.name ?? (input.transportError instanceof Error ? input.transportError.name : null),
          'transportError.name', PROVIDER_FAILURE_SCALAR_LIMIT_BYTES_V2, redactions, truncations),
        code: boundedFactString(transport?.code ?? (input.transportError as { code?: unknown } | null)?.code,
          'transportError.code', PROVIDER_FAILURE_SCALAR_LIMIT_BYTES_V2, redactions, truncations),
        message: boundedFactString(transport?.message ?? (input.transportError instanceof Error ? input.transportError.message : null),
          'transportError.message', PROVIDER_FAILURE_MESSAGE_LIMIT_BYTES_V2, redactions, truncations),
      })
    : null
  const status = typeof input.httpStatus === 'number' && Number.isSafeInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599
    ? input.httpStatus : null
  const frame = input.rawFrameExcerpt === undefined || input.rawFrameExcerpt === null
    ? null : boundedRaw(input.rawFrameExcerpt, 'rawFrameExcerpt', redactions, truncations)
  const rawFrameExcerpt = frame === null ? null : frame.text ?? (frame.json === null ? null : JSON.stringify(frame.json))
  return decodeProviderFailureV2(Object.freeze({
    origin: input.context.origin,
    phase: input.context.phase,
    provider: providerRef(input.context.provider),
    contractId: String(input.context.contractId),
    operationId: String(input.context.operationId),
    requestSequence: boundedSequence(input.context.requestSequence),
    httpStatus: status,
    httpStatusText: boundedFactString(input.httpStatusText, 'httpStatusText', PROVIDER_FAILURE_SCALAR_LIMIT_BYTES_V2,
      redactions, truncations),
    providerError: providerErrorFromBody({ rawJson: bounded.json, rawText: bounded.text, factsJson: bounded.factsJson,
      headers: input.headers, redactions, truncations }),
    rawFrameExcerpt,
    transportError,
    starverseDiagnosticCode: inferDiagnosticCode(input.context),
    redactions: Object.freeze(redactions),
    truncations: Object.freeze(truncations),
  }))
}

export function providerFailureFromUnknownV2(error: unknown, context: ProviderFailureV2Context): ProviderFailureV2 {
  if (error instanceof ProviderFailureErrorV2 &&
      error.failure.provider.namespace === context.provider.namespace &&
      error.failure.provider.id === context.provider.id &&
      error.failure.contractId === context.contractId) {
    if (error.failure.operationId === context.operationId &&
        error.failure.requestSequence === context.requestSequence) return error.failure
    return decodeProviderFailureV2({
      ...error.failure,
      operationId: context.operationId,
      requestSequence: context.requestSequence,
    })
  }
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

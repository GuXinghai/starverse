import { readApprovedDebugFlag } from '@/shared/diagnostics/flags'
import type { CompletionClass, ErrorEnvelope } from '../errors/openRouterErrorEnvelope'
import { sanitizeErrorEnvelope } from '../errors/openRouterErrorEnvelope'

export const RESPONSES_TRUNCATION_CODES = new Set([
  'context_length_exceeded',
  'max_tokens_exceeded',
  'token_limit_exceeded',
  'string_too_long',
])

type RequestContext = Readonly<{ model?: string; stream?: boolean }>

export type ResponsesTerminalMapping = Readonly<{
  completionClass: CompletionClass
  envelope?: ErrorEnvelope
  meta?: { id?: string; model?: string; provider?: string }
}>

const TERMINAL_EVENT_TYPES = new Set([
  'response.completed',
  'response.incomplete',
  'response.failed',
  'response.error',
  'error',
])

function isResponsesDebugEnabled(): boolean {
  return readApprovedDebugFlag('responses')
}

function logResponsesDebug(tag: string, payload: Record<string, unknown>) {
  if (!isResponsesDebugEnabled()) return
  try {
    console.debug(`[responses] ${tag}`, payload)
  } catch {
    // ignore
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function safeString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function toStringCode(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function buildResponsesEnvelope(input: Readonly<{
  completionClass: CompletionClass
  code: string
  message?: string
  metadata?: Record<string, unknown>
  provider?: string
  stream?: { generation_id?: string; model?: string; provider?: string }
  request?: RequestContext
}>): ErrorEnvelope {
  return sanitizeErrorEnvelope({
    phase: 'responses',
    completionClass: input.completionClass,
    openrouter: {
      code: input.code,
      ...(input.message ? { message: input.message } : {}),
      ...(input.metadata && Object.keys(input.metadata).length > 0 ? { metadata: input.metadata } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
    },
    ...(input.stream ? { stream: input.stream } : {}),
    ...(input.request ? { context: input.request } : {}),
    truncated: false,
    kind: 'responses_event',
  })
}

function normalizeTruncationCode(code?: string): string | null {
  if (!code) return null
  const normalized = code.toLowerCase()
  return RESPONSES_TRUNCATION_CODES.has(normalized) ? normalized : null
}

type ParsedTerminalEvent = Readonly<{
  eventType: string
  responseId?: string
  responseModel?: string
  responseProvider?: string
  responseStatus?: string
  incompleteDetails: Record<string, unknown> | null
  incompleteReason?: string
  errorRecord: Record<string, unknown> | null
  errorCode?: string
  errorMessage?: string
  truncationCode: string | null
}>

function parseTerminalEvent(record: Record<string, unknown>): ParsedTerminalEvent | null {
  const eventType = safeString(record.type)
  if (!eventType || !TERMINAL_EVENT_TYPES.has(eventType)) return null

  const response = asRecord(record.response)
  const incompleteDetails = asRecord(response?.incomplete_details) ?? asRecord(record.incomplete_details)
  const errorRecord = asRecord(record.error) ?? asRecord(response?.error)

  return {
    eventType,
    responseId: safeString(response?.id),
    responseModel: safeString(response?.model),
    responseProvider: safeString(response?.provider),
    responseStatus: safeString(response?.status),
    incompleteDetails,
    incompleteReason: safeString(incompleteDetails?.reason),
    errorRecord,
    errorCode: toStringCode(errorRecord?.code ?? record.code),
    errorMessage: safeString(errorRecord?.message ?? record.message),
    truncationCode: normalizeTruncationCode(toStringCode(errorRecord?.code ?? record.code)),
  }
}

function resolveCompletionClass(parsed: ParsedTerminalEvent): CompletionClass {
  if (parsed.eventType === 'response.completed') return 'ok'
  if (parsed.eventType === 'response.incomplete' || parsed.truncationCode) return 'truncated'
  return 'error'
}

function buildTerminalMeta(parsed: ParsedTerminalEvent): ResponsesTerminalMapping['meta'] {
  if (!parsed.responseId && !parsed.responseModel && !parsed.responseProvider) return undefined
  return {
    id: parsed.responseId,
    model: parsed.responseModel,
    provider: parsed.responseProvider,
  }
}

function buildFallbackMessage(parsed: ParsedTerminalEvent, completionClass: CompletionClass): string {
  if (parsed.eventType === 'response.incomplete') {
    return `Response incomplete${parsed.incompleteReason ? `: ${parsed.incompleteReason}` : ''}`
  }
  if (completionClass === 'truncated') {
    return `Response truncated${parsed.truncationCode ? `: ${parsed.truncationCode}` : ''}`
  }
  return parsed.eventType === 'response.failed' ? 'Response failed' : 'Response error'
}

function buildEnvelopeMetadata(parsed: ParsedTerminalEvent): Record<string, unknown> {
  const metadata: Record<string, unknown> = { event_type: parsed.eventType }
  if (parsed.responseStatus) metadata.response_status = parsed.responseStatus
  if (parsed.incompleteReason) metadata.incomplete_reason = parsed.incompleteReason
  if (parsed.incompleteDetails && Object.keys(parsed.incompleteDetails).length > 0) {
    metadata.incomplete_details = parsed.incompleteDetails
  }
  if (parsed.errorRecord) {
    if ('type' in parsed.errorRecord) metadata.error_type = parsed.errorRecord.type
    if ('param' in parsed.errorRecord) metadata.param = parsed.errorRecord.param
  }
  return metadata
}

function resolveProvider(parsed: ParsedTerminalEvent): string | undefined {
  const providerMeta = asRecord(parsed.errorRecord?.metadata)
  return safeString(providerMeta?.provider_name) ?? parsed.responseProvider
}

export function mapResponsesEventToTerminal(input: Readonly<{ event: unknown; request?: RequestContext }>): ResponsesTerminalMapping | null {
  const record = asRecord(input.event)
  if (!record) return null
  const parsed = parseTerminalEvent(record)
  if (!parsed) return null

  const completionClass = resolveCompletionClass(parsed)

  if (completionClass === 'error' && parsed.errorCode) {
    logResponsesDebug('error_code', { eventType: parsed.eventType, code: parsed.errorCode })
  }

  const meta = buildTerminalMeta(parsed)
  if (completionClass === 'ok') {
    return { completionClass, meta }
  }

  const envelope = buildResponsesEnvelope({
    completionClass,
    code: parsed.errorCode ?? parsed.incompleteReason ?? parsed.responseStatus ?? 'error',
    message: parsed.errorMessage ?? buildFallbackMessage(parsed, completionClass),
    metadata: buildEnvelopeMetadata(parsed),
    provider: resolveProvider(parsed),
    stream: {
      generation_id: parsed.responseId,
      model: parsed.responseModel,
      provider: parsed.responseProvider,
    },
    request: input.request,
  })

  return { completionClass, envelope, meta }
}

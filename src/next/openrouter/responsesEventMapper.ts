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
  try {
    return String(globalThis?.localStorage?.getItem('sv_debug_responses') ?? '').trim() === '1'
  } catch {
    return false
  }
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

export function mapResponsesEventToTerminal(input: Readonly<{ event: unknown; request?: RequestContext }>): ResponsesTerminalMapping | null {
  const record = asRecord(input.event)
  if (!record) return null
  const eventType = safeString(record.type)
  if (!eventType || !TERMINAL_EVENT_TYPES.has(eventType)) return null

  const response = asRecord(record.response)
  const responseId = safeString(response?.id)
  const responseModel = safeString(response?.model)
  const responseProvider = safeString(response?.provider)
  const responseStatus = safeString(response?.status)

  const incompleteDetails = asRecord(response?.incomplete_details) ?? asRecord(record.incomplete_details)
  const incompleteReason = safeString(incompleteDetails?.reason)

  const errorRecord = asRecord(record.error) ?? asRecord(response?.error)
  const errorCode = toStringCode(errorRecord?.code ?? record.code)
  const errorMessage = safeString(errorRecord?.message ?? record.message)
  const truncationCode = normalizeTruncationCode(errorCode)

  let completionClass: CompletionClass
  if (eventType === 'response.completed') {
    completionClass = 'ok'
  } else if (eventType === 'response.incomplete') {
    completionClass = 'truncated'
  } else if (truncationCode) {
    completionClass = 'truncated'
  } else {
    completionClass = 'error'
  }

  if (completionClass === 'error' && errorCode) {
    logResponsesDebug('error_code', { eventType, code: errorCode })
  }

  const meta =
    responseId || responseModel || responseProvider
      ? {
          id: responseId,
          model: responseModel,
          provider: responseProvider,
        }
      : undefined

  if (completionClass === 'ok') {
    return { completionClass, meta }
  }

  const fallbackMessage = eventType === 'response.incomplete'
    ? `Response incomplete${incompleteReason ? `: ${incompleteReason}` : ''}`
    : completionClass === 'truncated'
      ? `Response truncated${truncationCode ? `: ${truncationCode}` : ''}`
      : eventType === 'response.failed'
        ? 'Response failed'
        : 'Response error'

  const code = errorCode ?? incompleteReason ?? responseStatus ?? 'error'
  const message = errorMessage ?? fallbackMessage

  const metadata: Record<string, unknown> = { event_type: eventType }
  if (responseStatus) metadata.response_status = responseStatus
  if (incompleteReason) metadata.incomplete_reason = incompleteReason
  if (incompleteDetails && Object.keys(incompleteDetails).length > 0) {
    metadata.incomplete_details = incompleteDetails
  }
  if (errorRecord && typeof errorRecord === 'object') {
    if ('type' in errorRecord) metadata.error_type = (errorRecord as any).type
    if ('param' in errorRecord) metadata.param = (errorRecord as any).param
  }

  const providerMeta = asRecord((errorRecord as any)?.metadata)
  const provider = safeString(providerMeta?.provider_name) ?? responseProvider

  const envelope = buildResponsesEnvelope({
    completionClass,
    code,
    message,
    metadata,
    provider,
    stream: {
      generation_id: responseId,
      model: responseModel,
      provider: responseProvider,
    },
    request: input.request,
  })

  return { completionClass, envelope, meta }
}

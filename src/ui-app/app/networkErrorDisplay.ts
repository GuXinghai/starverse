import { t } from '@/shared/i18n'
import type {
  NetworkErrorEnvelope,
  NetworkFailureReason,
} from '@/shared/network/networkErrorEnvelope'

const NETWORK_REASON_KEYS: Record<NetworkFailureReason, string> = {
  proxy_resolution_failed: 'errors.network.reason.proxyResolutionFailed',
  proxy_auth_required: 'errors.network.reason.proxyAuthRequired',
  proxy_connect_failed: 'errors.network.reason.proxyConnectFailed',
  dns_error: 'errors.network.reason.dnsError',
  connection_refused: 'errors.network.reason.connectionRefused',
  connection_timeout: 'errors.network.reason.connectionTimeout',
  tls_or_certificate_error: 'errors.network.reason.tlsOrCertificateError',
  request_aborted: 'errors.network.reason.requestAborted',
  http_401_auth: 'errors.network.reason.http401Auth',
  http_403_forbidden: 'errors.network.reason.http403Forbidden',
  http_404_not_found_or_model_missing: 'errors.network.reason.http404NotFoundOrModelMissing',
  http_429_rate_limited: 'errors.network.reason.http429RateLimited',
  provider_bad_request: 'errors.network.reason.providerBadRequest',
  provider_model_unavailable: 'errors.network.reason.providerModelUnavailable',
  local_endpoint_rejected_remote_host: 'errors.network.reason.localEndpointRejectedRemoteHost',
  local_endpoint_embedded_credentials_rejected: 'errors.network.reason.localEndpointEmbeddedCredentialsRejected',
  download_redirect_rejected: 'errors.network.reason.downloadRedirectRejected',
  download_hash_mismatch: 'errors.network.reason.downloadHashMismatch',
  download_size_mismatch: 'errors.network.reason.downloadSizeMismatch',
  download_resume_range_rejected: 'errors.network.reason.downloadResumeRangeRejected',
  download_failed: 'errors.network.reason.downloadFailed',
  network_unknown: 'errors.network.reason.networkUnknown',
}

const NETWORK_FAILURE_REASONS = new Set<NetworkFailureReason>(
  Object.keys(NETWORK_REASON_KEYS) as NetworkFailureReason[],
)

type DisplayFailureInput = Readonly<{
  networkError?: unknown
  code?: unknown
  message?: unknown
}>

export function resolveNetworkErrorDisplayMessage(networkError: unknown): string | null {
  const envelope = toNetworkErrorEnvelope(networkError)
  if (!envelope) return null

  const reason = envelope.safeDetailCode
  const key = networkReasonKey(reason) ?? safeMessageKey(envelope.safeMessageKey)
  if (!key) return t(NETWORK_REASON_KEYS.network_unknown)

  return t(key)
}

export function resolveNetworkFailureDisplayMessage(input: DisplayFailureInput): string | null {
  const structured = resolveNetworkErrorDisplayMessage(input.networkError)
  if (structured) return structured

  const reason = networkFailureReasonFromDisplayCode(input.code)
  if (reason) return t(NETWORK_REASON_KEYS[reason])

  const message = typeof input.message === 'string' ? input.message.trim() : ''
  return message || null
}

export function resolveNetworkCodeDisplayMessage(code: unknown): string | null {
  const reason = networkFailureReasonFromDisplayCode(code)
  return reason ? t(NETWORK_REASON_KEYS[reason]) : null
}

export function replaceNetworkCodeInMessage(message: unknown, code: unknown): string | null {
  const text = typeof message === 'string' ? message.trim() : ''
  const display = resolveNetworkCodeDisplayMessage(code)
  if (!display) return text || null

  const token = normalizeCodeToken(code)
  if (!text) return display
  if (!token || !text.includes(token)) return text
  return text.split(token).join(display)
}

function toNetworkErrorEnvelope(value: unknown): NetworkErrorEnvelope | null {
  if (!value || typeof value !== 'object' || value instanceof Error) return null
  const record = value as Record<string, unknown>
  const safeDetailCode = record.safeDetailCode
  if (!isNetworkFailureReason(safeDetailCode)) return null
  if (record.reason !== undefined && !isNetworkFailureReason(record.reason)) return null
  if (typeof record.safeMessageKey !== 'string') return null
  if (typeof record.requestPurpose !== 'string') return null
  if (typeof record.transportKind !== 'string') return null
  if (typeof record.retryable !== 'boolean') return null

  return record as unknown as NetworkErrorEnvelope
}

function safeMessageKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('errors.network.reason.')) return null
  return value
}

function networkReasonKey(reason: NetworkFailureReason): string | null {
  return NETWORK_REASON_KEYS[reason] ?? null
}

function isNetworkFailureReason(value: unknown): value is NetworkFailureReason {
  return typeof value === 'string' && NETWORK_FAILURE_REASONS.has(value as NetworkFailureReason)
}

function networkFailureReasonFromDisplayCode(code: unknown): NetworkFailureReason | null {
  const token = normalizeCodeToken(code)
  if (!token) return null
  if (isNetworkFailureReason(token)) return token
  switch (token) {
    case '401':
    case 'http_401':
    case 'http_401_auth':
    case 'auth_failed':
    case 'authentication_failed':
      return 'http_401_auth'
    case '403':
    case 'http_403':
    case 'http_403_forbidden':
    case 'forbidden':
      return 'http_403_forbidden'
    case '404':
    case 'http_404':
    case 'not_found':
    case 'model_not_found':
      return 'http_404_not_found_or_model_missing'
    case '429':
    case 'http_429':
    case 'rate_limited':
    case 'rate_limit_exceeded':
      return 'http_429_rate_limited'
    case 'proxy_resolution_failed':
    case 'proxy_resolve_failed':
    case 'pac_failed':
      return 'proxy_resolution_failed'
    case 'proxy_auth_required':
    case 'proxy_authentication_required':
      return 'proxy_auth_required'
    case 'proxy_connect_failed':
    case 'tunnel_connection_failed':
      return 'proxy_connect_failed'
    case 'dns_error':
    case 'enotfound':
    case 'eai_again':
      return 'dns_error'
    case 'connection_refused':
    case 'econnrefused':
      return 'connection_refused'
    case 'timeout':
    case 'connection_timeout':
    case 'etimedout':
      return 'connection_timeout'
    case 'tls_error':
    case 'certificate_error':
    case 'tls_or_certificate_error':
      return 'tls_or_certificate_error'
    case 'aborted':
    case 'cancelled':
    case 'canceled':
    case 'request_aborted':
    case 'download_cancelled':
      return 'request_aborted'
    case 'provider_bad_request':
    case 'bad_request':
    case 'invalid_request':
      return 'provider_bad_request'
    case 'provider_model_unavailable':
    case 'model_unavailable':
      return 'provider_model_unavailable'
    case 'remote_host_rejected':
    case 'local_endpoint_rejected_remote_host':
      return 'local_endpoint_rejected_remote_host'
    case 'embedded_credentials_rejected':
    case 'local_endpoint_embedded_credentials_rejected':
      return 'local_endpoint_embedded_credentials_rejected'
    case 'redirect_rejected':
    case 'download_redirect_rejected':
      return 'download_redirect_rejected'
    case 'hash_mismatch':
    case 'download_hash_mismatch':
      return 'download_hash_mismatch'
    case 'size_mismatch':
    case 'download_size_mismatch':
    case 'download_too_large':
    case 'too_large':
      return 'download_size_mismatch'
    case 'resume_range_ignored':
    case 'resume_range_rejected':
    case 'resume_content_range_invalid':
    case 'resume_retries_exhausted':
    case 'download_resume_range_rejected':
      return 'download_resume_range_rejected'
    case 'download_failed':
      return 'download_failed'
    default:
      return null
  }
}

function normalizeCodeToken(code: unknown): string {
  return typeof code === 'string' || typeof code === 'number'
    ? String(code).trim().toLowerCase()
    : ''
}

import type { NetworkProxyPolicyMode } from './proxyPolicy'

export type NetworkRequestPurpose =
  | 'provider_stream'
  | 'provider_availability'
  | 'provider_catalog'
  | 'provider_upload'
  | 'download'
  | 'local_endpoint_probe'
  | 'local_endpoint_chat'
  | 'diagnostic'

export type NetworkTransportKind =
  | 'electron_session_fetch'
  | 'electron_net'
  | 'node_fetch'
  | 'node_undici'
  | 'node_http'
  | 'local_direct'
  | 'unknown'

export type LocalNetworkPolicy = 'direct' | 'proxied' | 'not_local' | 'unknown'

export type NetworkFailureReason =
  | 'proxy_resolution_failed'
  | 'proxy_auth_required'
  | 'proxy_connect_failed'
  | 'dns_error'
  | 'connection_refused'
  | 'connection_timeout'
  | 'tls_or_certificate_error'
  | 'request_aborted'
  | 'http_401_auth'
  | 'http_403_forbidden'
  | 'http_404_not_found_or_model_missing'
  | 'http_429_rate_limited'
  | 'provider_bad_request'
  | 'provider_model_unavailable'
  | 'local_endpoint_rejected_remote_host'
  | 'local_endpoint_embedded_credentials_rejected'
  | 'download_redirect_rejected'
  | 'download_hash_mismatch'
  | 'download_size_mismatch'
  | 'download_resume_range_rejected'
  | 'download_failed'
  | 'network_unknown'

export type NetworkErrorEnvelope = Readonly<{
  requestPurpose: NetworkRequestPurpose
  providerId?: string
  transportKind: NetworkTransportKind
  reason: NetworkFailureReason
  safeDetailCode: NetworkFailureReason
  safeMessage: string
  safeMessageKey: string
  retryable: boolean
  httpStatus?: number
  proxyMode?: NetworkProxyPolicyMode | 'unknown'
  localPolicy?: LocalNetworkPolicy
}>

export type NetworkErrorEnvelopeInput = Readonly<{
  requestPurpose: NetworkRequestPurpose
  transportKind: NetworkTransportKind
  reason?: NetworkFailureReason
  providerId?: string
  httpStatus?: number
  providerCode?: unknown
  providerMessage?: unknown
  error?: unknown
  abortReason?: unknown
  proxyMode?: NetworkProxyPolicyMode | 'unknown'
  localPolicy?: LocalNetworkPolicy
}>

const SAFE_MESSAGE_KEYS: Record<NetworkFailureReason, string> = {
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

const SAFE_MESSAGES: Record<NetworkFailureReason, string> = {
  proxy_resolution_failed: 'Proxy resolution failed.',
  proxy_auth_required: 'Proxy authentication is required.',
  proxy_connect_failed: 'Could not connect to the configured proxy.',
  dns_error: 'DNS lookup failed.',
  connection_refused: 'Connection was refused.',
  connection_timeout: 'Connection timed out.',
  tls_or_certificate_error: 'TLS or certificate validation failed.',
  request_aborted: 'Request was cancelled.',
  http_401_auth: 'Authentication failed.',
  http_403_forbidden: 'Access was forbidden.',
  http_404_not_found_or_model_missing: 'Endpoint or model was not found.',
  http_429_rate_limited: 'Rate limit was reached.',
  provider_bad_request: 'Provider rejected the request.',
  provider_model_unavailable: 'Provider reported that the model is unavailable.',
  local_endpoint_rejected_remote_host: 'Local endpoint host was rejected.',
  local_endpoint_embedded_credentials_rejected: 'Local endpoint URL contains embedded credentials.',
  download_redirect_rejected: 'Download redirect was rejected.',
  download_hash_mismatch: 'Downloaded file hash did not match.',
  download_size_mismatch: 'Downloaded file size did not match.',
  download_resume_range_rejected: 'Download resume range was rejected.',
  download_failed: 'Download failed.',
  network_unknown: 'Network request failed.',
}

export function buildNetworkErrorEnvelope(input: NetworkErrorEnvelopeInput): NetworkErrorEnvelope {
  const reason = inferNetworkFailureReason(input)
  return {
    requestPurpose: input.requestPurpose,
    transportKind: input.transportKind,
    reason,
    safeDetailCode: reason,
    safeMessage: SAFE_MESSAGES[reason],
    safeMessageKey: SAFE_MESSAGE_KEYS[reason],
    retryable: isRetryableNetworkFailure(reason),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(typeof input.httpStatus === 'number' ? { httpStatus: input.httpStatus } : {}),
    ...(input.proxyMode ? { proxyMode: input.proxyMode } : {}),
    ...(input.localPolicy ? { localPolicy: input.localPolicy } : {}),
  }
}

export function inferNetworkFailureReason(input: NetworkErrorEnvelopeInput): NetworkFailureReason {
  if (input.reason) return input.reason
  if (typeof input.httpStatus === 'number') return networkFailureReasonFromHttpStatus(input.httpStatus, input)
  if (input.abortReason === 'timeout') return 'connection_timeout'
  if (input.abortReason === 'user_abort' || input.abortReason === 'aborted') return 'request_aborted'

  const providerReason = networkFailureReasonFromProviderSignal(input.providerCode, input.providerMessage)
  if (providerReason) return providerReason

  return networkFailureReasonFromError(input.error, input.abortReason)
}

export function networkFailureReasonFromHttpStatus(
  status: number,
  input?: Readonly<{ providerCode?: unknown; providerMessage?: unknown }>,
): NetworkFailureReason {
  if (status === 401) return 'http_401_auth'
  if (status === 403) return 'http_403_forbidden'
  if (status === 404) return 'http_404_not_found_or_model_missing'
  if (status === 407) return 'proxy_auth_required'
  if (status === 408) return 'connection_timeout'
  if (status === 429) return 'http_429_rate_limited'
  const providerReason = networkFailureReasonFromProviderSignal(input?.providerCode, input?.providerMessage)
  if (providerReason) return providerReason
  if (status === 400 || status === 422) return 'provider_bad_request'
  return 'network_unknown'
}

export function networkFailureReasonFromError(error: unknown, abortReason?: unknown): NetworkFailureReason {
  if (abortReason === 'timeout') return 'connection_timeout'
  if (abortReason === 'user_abort' || abortReason === 'aborted') return 'request_aborted'

  const token = errorSearchToken(error)
  if (!token) return 'network_unknown'
  if (/\b(aborterror|aborted|cancelled|canceled)\b/u.test(token)) return 'request_aborted'
  if (/\b(proxy.*resolve|resolve.*proxy|pac.*failed|pac.*error)\b/u.test(token)) return 'proxy_resolution_failed'
  if (/\b(407|proxy[_ -]?auth|proxy authentication)\b/u.test(token)) return 'proxy_auth_required'
  if (/\b(proxy.*connect|tunnel|err_tunnel_connection_failed)\b/u.test(token)) return 'proxy_connect_failed'
  if (/\b(enotfound|eai_again|dns|name_not_resolved|err_name_not_resolved)\b/u.test(token)) return 'dns_error'
  if (/\b(econnrefused|connection refused|err_connection_refused)\b/u.test(token)) return 'connection_refused'
  if (/\b(etimedout|timedout|timeout|timed out|und_err_connect_timeout)\b/u.test(token)) return 'connection_timeout'
  if (/\b(cert|certificate|tls|ssl|self.signed|unable_to_verify|err_cert)\b/u.test(token)) return 'tls_or_certificate_error'
  return 'network_unknown'
}

export function networkFailureReasonFromDownloadFailure(reason: unknown): NetworkFailureReason {
  switch (reason) {
    case 'download_cancelled':
    case 'cancelled':
      return 'request_aborted'
    case 'redirect_rejected':
      return 'download_redirect_rejected'
    case 'hash_mismatch':
      return 'download_hash_mismatch'
    case 'size_mismatch':
    case 'download_too_large':
    case 'too_large':
      return 'download_size_mismatch'
    case 'resume_range_ignored':
    case 'resume_range_rejected':
    case 'resume_content_range_invalid':
    case 'resume_retries_exhausted':
      return 'download_resume_range_rejected'
    case 'download_failed':
      return 'download_failed'
    default:
      return 'network_unknown'
  }
}

export function networkFailureReasonFromLocalEndpointFailure(reason: unknown): NetworkFailureReason | null {
  switch (reason) {
    case 'remote_host_rejected':
      return 'local_endpoint_rejected_remote_host'
    case 'embedded_credentials_rejected':
      return 'local_endpoint_embedded_credentials_rejected'
    case 'timeout':
      return 'connection_timeout'
    case 'network_error':
      return 'network_unknown'
    default:
      return null
  }
}

export function isRetryableNetworkFailure(reason: NetworkFailureReason): boolean {
  return reason === 'dns_error' ||
    reason === 'connection_refused' ||
    reason === 'connection_timeout' ||
    reason === 'proxy_connect_failed' ||
    reason === 'proxy_resolution_failed' ||
    reason === 'http_429_rate_limited' ||
    reason === 'download_failed' ||
    reason === 'network_unknown'
}

export function providerNetworkFailureMessage(providerLabel: string, envelope: NetworkErrorEnvelope): string {
  return `${providerLabel}: ${envelope.safeMessage}`
}

function networkFailureReasonFromProviderSignal(code: unknown, message: unknown): NetworkFailureReason | null {
  const token = `${String(code ?? '')} ${String(message ?? '')}`.trim().toLowerCase()
  if (!token) return null
  if (/\b(model.*(not found|missing|unavailable)|not_found|model_not_found|model_unavailable|no such model)\b/u.test(token)) {
    return 'provider_model_unavailable'
  }
  if (/\b(bad_request|invalid_request|invalid argument|invalid_payload)\b/u.test(token)) return 'provider_bad_request'
  return null
}

function errorSearchToken(error: unknown): string {
  if (error === undefined || error === null) return ''
  if (typeof error === 'string') return error.toLowerCase()
  if (!(typeof error === 'object')) return String(error).toLowerCase()
  const record = error as Record<string, unknown>
  const cause = record.cause && typeof record.cause === 'object' ? record.cause as Record<string, unknown> : {}
  return [
    record.name,
    record.code,
    record.message,
    cause.name,
    cause.code,
    cause.message,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

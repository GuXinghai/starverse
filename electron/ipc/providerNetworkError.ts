import type { StarverseProviderError } from '../../src/next/provider/providerTypes'
import {
  buildNetworkErrorEnvelope,
  providerNetworkFailureMessage,
  type NetworkErrorEnvelope,
} from '../../src/shared/network/networkErrorEnvelope'

type ProviderCategory = StarverseProviderError['category']

export type ProviderNetworkErrorInput = Readonly<{
  providerId: string
  providerWireName: string
  providerLabel: string
  error?: StarverseProviderError
  thrown?: unknown
  abortReason?: unknown
  fallbackPhase?: StarverseProviderError['phase']
}>

export function sanitizeProviderNetworkError(input: ProviderNetworkErrorInput): StarverseProviderError {
  const envelope = buildNetworkErrorEnvelope({
    requestPurpose: 'provider_stream',
    providerId: input.providerId,
    transportKind: 'electron_session_fetch',
    httpStatus: input.error?.httpStatus,
    providerCode: input.error?.code,
    providerMessage: input.error?.message,
    error: input.thrown ?? input.error?.raw ?? input.error?.message,
    abortReason: input.abortReason,
  })
  const originalCode = input.error?.code ? String(input.error.code) : undefined
  return {
    phase: input.error?.phase ?? input.fallbackPhase ?? 'transport',
    provider: input.providerWireName,
    category: categoryFromNetworkError(envelope),
    code: originalCode ?? envelope.safeDetailCode,
    message: messageFromNetworkError(input.providerLabel, envelope, originalCode),
    ...(input.error?.httpStatus ? { httpStatus: input.error.httpStatus } : {}),
    ...(envelope.retryable ? { retryable: true } : {}),
    ...(input.error?.requestId ? { requestId: input.error.requestId } : {}),
    networkError: envelope,
  }
}

export function categoryFromNetworkError(envelope: NetworkErrorEnvelope): ProviderCategory {
  switch (envelope.reason) {
    case 'http_401_auth':
    case 'proxy_auth_required':
      return 'auth'
    case 'http_429_rate_limited':
      return 'rate_limit'
    case 'request_aborted':
      return 'aborted'
    case 'provider_bad_request':
    case 'http_403_forbidden':
    case 'http_404_not_found_or_model_missing':
    case 'provider_model_unavailable':
      return 'bad_request'
    case 'dns_error':
    case 'connection_refused':
    case 'connection_timeout':
    case 'tls_or_certificate_error':
    case 'proxy_resolution_failed':
    case 'proxy_connect_failed':
    case 'network_unknown':
      return 'network'
    default:
      return 'provider_error'
  }
}

function messageFromNetworkError(providerLabel: string, envelope: NetworkErrorEnvelope, originalCode?: string): string {
  if (envelope.reason === 'http_401_auth') return `${providerLabel} credential was rejected.`
  if (envelope.reason === 'http_429_rate_limited') return `${providerLabel} rate limit was reached.`
  if (envelope.reason === 'request_aborted') return `${providerLabel} text chat was aborted.`
  if (originalCode === 'unsupported_provider') return `${providerLabel} runtime does not support this request shape.`
  return providerNetworkFailureMessage(providerLabel, envelope)
}

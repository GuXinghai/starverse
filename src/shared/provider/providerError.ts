import type { NetworkErrorEnvelope } from '../network/networkErrorEnvelope'

export type StarverseProviderError = Readonly<{
  phase: 'request_build' | 'transport' | 'http' | 'sse_decode' | 'stream' | 'provider' | 'abort'
  provider: string
  category:
    | 'auth'
    | 'rate_limit'
    | 'bad_request'
    | 'network'
    | 'http'
    | 'provider_error'
    | 'protocol'
    | 'aborted'
    | 'unknown'
  message: string
  retryable?: boolean
  httpStatus?: number
  code?: string
  requestId?: string
  networkError?: NetworkErrorEnvelope
  raw?: unknown
}>

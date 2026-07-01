import { describe, expect, it } from 'vitest'
import {
  buildNetworkErrorEnvelope,
  networkFailureReasonFromDownloadFailure,
  networkFailureReasonFromError,
  networkFailureReasonFromHttpStatus,
  networkFailureReasonFromLocalEndpointFailure,
} from './networkErrorEnvelope'

describe('networkErrorEnvelope', () => {
  it.each([
    [401, 'http_401_auth'],
    [403, 'http_403_forbidden'],
    [404, 'http_404_not_found_or_model_missing'],
    [407, 'proxy_auth_required'],
    [408, 'connection_timeout'],
    [429, 'http_429_rate_limited'],
  ] as const)('maps HTTP %s to %s', (status, reason) => {
    expect(networkFailureReasonFromHttpStatus(status)).toBe(reason)
  })

  it.each([
    [Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { code: 'ECONNREFUSED' }), 'connection_refused'],
    [Object.assign(new Error('getaddrinfo ENOTFOUND api.example.test'), { code: 'ENOTFOUND' }), 'dns_error'],
    [Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }), 'connection_timeout'],
    [new Error('self signed certificate in certificate chain'), 'tls_or_certificate_error'],
    [new DOMException('Aborted', 'AbortError'), 'request_aborted'],
    [new Error('ERR_TUNNEL_CONNECTION_FAILED via proxy'), 'proxy_connect_failed'],
  ] as const)('maps transport error %# to %s', (error, reason) => {
    expect(networkFailureReasonFromError(error)).toBe(reason)
  })

  it('builds a safe provider envelope without copying raw error text', () => {
    const envelope = buildNetworkErrorEnvelope({
      requestPurpose: 'provider_stream',
      providerId: 'openai_responses',
      transportKind: 'electron_session_fetch',
      error: new Error('Authorization: Bearer sk-secret at https://public.example.test'),
    })

    expect(envelope).toMatchObject({
      requestPurpose: 'provider_stream',
      providerId: 'openai_responses',
      transportKind: 'electron_session_fetch',
      reason: 'network_unknown',
      safeDetailCode: 'network_unknown',
      safeMessageKey: 'errors.network.reason.networkUnknown',
    })
    expect(JSON.stringify(envelope)).not.toContain('sk-secret')
    expect(JSON.stringify(envelope)).not.toContain('Authorization')
    expect(JSON.stringify(envelope)).not.toContain('public.example.test')
  })

  it('returns a serializable plain object without Error internals or sensitive payloads', () => {
    const error = Object.assign(new Error('Authorization Bearer sk-secret prompt body file content'), {
      stack: 'stack with sk-secret',
      cause: Object.assign(new Error('proxy password secret'), { code: 'ECONNREFUSED' }),
    })

    const envelope = buildNetworkErrorEnvelope({
      requestPurpose: 'provider_stream',
      providerId: 'openai_responses',
      transportKind: 'electron_session_fetch',
      error,
    })
    const serialized = JSON.stringify(envelope)

    expect(Object.getPrototypeOf(envelope)).toBe(Object.prototype)
    expect(JSON.parse(serialized)).toEqual(envelope)
    expect(Object.keys(envelope).sort()).toEqual([
      'providerId',
      'reason',
      'requestPurpose',
      'retryable',
      'safeDetailCode',
      'safeMessage',
      'safeMessageKey',
      'transportKind',
    ])
    expect(serialized).not.toContain('stack')
    expect(serialized).not.toContain('cause')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('sk-secret')
    expect(serialized).not.toContain('prompt body file content')
    expect(serialized).not.toContain('proxy password')
  })

  it.each([
    ['redirect_rejected', 'download_redirect_rejected'],
    ['hash_mismatch', 'download_hash_mismatch'],
    ['size_mismatch', 'download_size_mismatch'],
    ['download_too_large', 'download_size_mismatch'],
    ['resume_range_rejected', 'download_resume_range_rejected'],
  ] as const)('maps download failure %s to %s', (code, reason) => {
    expect(networkFailureReasonFromDownloadFailure(code)).toBe(reason)
  })

  it.each([
    ['remote_host_rejected', 'local_endpoint_rejected_remote_host'],
    ['embedded_credentials_rejected', 'local_endpoint_embedded_credentials_rejected'],
  ] as const)('maps local endpoint failure %s to %s', (code, reason) => {
    expect(networkFailureReasonFromLocalEndpointFailure(code)).toBe(reason)
  })
})

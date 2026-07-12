import { describe, expect, it } from 'vitest'
import { buildCompatibleNetworkError, compatibleNetworkErrorFromHttpStatus } from './compatibleNetworkError'

describe('compatibleNetworkError', () => {
  it('returns a fixed provider-neutral envelope without raw error, URL, query or credential fields', () => {
    const error = buildCompatibleNetworkError({
      code: 'compatible_dns_rebinding_blocked',
      stage: 'connect',
    })
    expect(error).toEqual({
      code: 'compatible_dns_rebinding_blocked',
      stage: 'connect',
      safeMessage: 'The provider address changed before connection.',
      retryable: false,
    })
    expect(JSON.stringify(error)).not.toMatch(/url|query|credential|token|body|responseBody/iu)
  })

  it.each([
    [401, 'compatible_http_auth', false],
    [403, 'compatible_http_auth', false],
    [407, 'compatible_http_auth', false],
    [408, 'compatible_timeout', true],
    [429, 'compatible_http_rate_limit', true],
    [500, 'compatible_http_provider', false],
    [504, 'compatible_timeout', true],
  ] as const)('maps HTTP %i without including provider response details', (status, code, retryable) => {
    expect(compatibleNetworkErrorFromHttpStatus(status)).toEqual({
      code,
      stage: 'response',
      safeMessage: expect.any(String),
      retryable,
      httpStatus: status,
    })
  })

  it('drops invalid status values from the safe envelope', () => {
    expect(buildCompatibleNetworkError({
      code: 'compatible_network_unknown',
      stage: 'request',
      httpStatus: 9_999,
    })).not.toHaveProperty('httpStatus')
  })

  it('distinguishes a strict policy capability block from a network failure', () => {
    expect(buildCompatibleNetworkError({
      code: 'compatible_strict_ssrf_unavailable',
      stage: 'connect',
    })).toEqual({
      code: 'compatible_strict_ssrf_unavailable',
      stage: 'connect',
      safeMessage: 'Strict SSRF protection is unavailable for the selected transport.',
      retryable: false,
    })
  })
})

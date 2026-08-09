import { describe, expect, it } from 'vitest'
import {
  PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2,
  createProviderFailureV2,
  providerFailurePrimaryMessageV2,
} from './providerFailureV2'

describe('ProviderFailureV2', () => {
  it('preserves provider HTTP facts without assigning a semantic category', () => {
    const failure = createProviderFailureV2({
      context: {
        origin: 'http_response', phase: 'response_headers', providerId: 'openai_responses', contractId: 'openai-responses-v1', operationId: 'op-1', requestSequence: 1,
      },
      httpStatus: 400,
      httpStatusText: 'Bad Request',
      body: { error: { message: 'model does not exist or you do not have access', type: 'invalid_request_error', param: 'model', code: 'model_not_found', request_id: 'req-1' } },
      headers: { 'retry-after': '30' },
    })
    expect(failure).toMatchObject({
      origin: 'http_response', phase: 'response_headers', httpStatus: 400, httpStatusText: 'Bad Request',
      providerError: { code: 'model_not_found', type: 'invalid_request_error', param: 'model', requestId: 'req-1', retryAfterMs: 30_000 },
    })
    expect(failure).not.toHaveProperty('category')
    expect(providerFailurePrimaryMessageV2(failure)).toContain('model does not exist')
  })

  it('keeps non-JSON response text and records credential redaction', () => {
    const failure = createProviderFailureV2({
      context: { origin: 'network_transport', phase: 'response_body', providerId: 'anthropic_messages', contractId: 'anthropic-messages-v1', operationId: 'op-2', requestSequence: 1 },
      bodyText: 'Authorization: Bearer secret\nproxy https://user:password@example.test failed',
    })
    expect(failure.providerError?.rawText).toContain('[redacted]')
    expect(failure.redactions.map((item) => item.reason)).toEqual(expect.arrayContaining(['authorization_header', 'url_credential']))
  })

  it('bounds raw error text and records the original size and digest', () => {
    const bodyText = 'x'.repeat(PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2 + 10)
    const failure = createProviderFailureV2({
      context: { origin: 'response_decoder', phase: 'stream_decode', providerId: 'deepseek', contractId: 'deepseek-chat-v1', operationId: 'op-3', requestSequence: 2 },
      bodyText,
    })
    expect(new TextEncoder().encode(failure.providerError?.rawText ?? '').byteLength).toBeLessThanOrEqual(PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2)
    expect(failure.truncations).toHaveLength(1)
    expect(failure.redactions).toContainEqual({ path: 'providerError.rawText', reason: 'size_limit' })
  })

  it('preserves compact provider JSON containing a safe URL while redacting only sensitive URL facts', () => {
    const failure = createProviderFailureV2({
      context: { origin: 'http_response', phase: 'response_body', providerId: 'google_ai_studio',
        contractId: 'gemini-models-v1beta', operationId: 'op-url', requestSequence: 1 },
      bodyText: JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT',
        message: 'See https://ai.google.dev/gemini-api/docs?api_key=secret for details' } }),
    })
    expect(failure.providerError).toMatchObject({ code: 400, status: 'INVALID_ARGUMENT' })
    expect(failure.providerError?.message).toContain('https://ai.google.dev/gemini-api/docs?api_key=[redacted]')
    expect(failure.providerError?.rawJson).toMatchObject({
      error: { code: 400, message: expect.stringContaining('api_key=[redacted]') },
    })
    expect(failure.providerError?.rawText).toBeNull()
    expect(failure.redactions).toContainEqual(expect.objectContaining({ reason: 'url_credential' }))
  })
})

import { describe, expect, it } from 'vitest'
import {
  normalizeOpenRouterMidStreamError,
  normalizeOpenRouterPreStreamError,
  normalizeProtocolError,
  normalizeTransportError,
  toNormalizedErrorEnvelope,
} from './normalizeOpenRouterError'
import { buildTransportErrorEnvelope } from './openRouterErrorEnvelope'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '../openrouter/openRouterTestModels'

/* eslint-disable max-lines-per-function */
describe('normalizeOpenRouterError', () => {
  it.each([
    [400, 'invalid_request', 2, false],
    [401, 'auth', 2, false],
    [402, 'payment_credit', 2, false],
    [403, 'moderation_blocked', 2, false],
    [408, 'timeout', 1, true],
    [429, 'rate_limited', 1, true],
    [502, 'provider_bad_gateway', 1, true],
    [503, 'no_provider_available', 1, true],
  ] as const)(
    'maps pre-stream httpStatus=%s to AppError semantics',
    (status, category, grade, retryable) => {
      const appError = normalizeOpenRouterPreStreamError(status, {
        error: { code: String(status), message: `HTTP ${status}` },
      })
      expect(appError.phase).toBe('pre_stream_request_error')
      expect(appError.category).toBe(category)
      expect(appError.grade).toBe(grade)
      expect(appError.retryable).toBe(retryable)
      expect(appError.httpStatus).toBe(status)
      expect(appError.code).toBe(String(status))
    }
  )

  it('preserves moderation metadata for 403', () => {
    const appError = normalizeOpenRouterPreStreamError(403, {
      error: {
        code: '403',
        message: 'Input was flagged by moderation',
        metadata: {
          reasons: ['hate', 'violence'],
          flagged_input: 'raw prompt text',
          provider_name: 'openai',
          raw: { upstream_code: 'policy_violation' },
        },
      },
    })
    expect(appError.phase).toBe('pre_stream_request_error')
    expect(appError.category).toBe('moderation_blocked')
    expect(appError.providerName).toBe('openai')
    expect(appError.metadata).toMatchObject({
      reasons: ['hate', 'violence'],
      flagged_input: 'raw prompt text',
      provider_name: 'openai',
      raw: { upstream_code: 'policy_violation' },
    })
  })

  it('extracts backoff hint for 429 metadata', () => {
    const appError = normalizeOpenRouterPreStreamError(429, {
      error: {
        code: '429',
        message: 'Rate limited',
        metadata: { retry_after: '2' },
      },
    })
    const normalized = toNormalizedErrorEnvelope({ appError })
    expect(normalized.normalized.backoffHintMs).toBe(2000)
    expect(normalized.normalized.category).toBe('rate_limited')
    expect(normalized.normalized.retryable).toBe(true)
  })

  it('maps mid-stream SSE error event to mid_stream_error AppError', () => {
    const appError = normalizeOpenRouterMidStreamError({
      id: 'gen_1',
      provider: 'openai',
      error: {
        code: 'rate_limit_exceeded',
        message: 'Too many requests',
        metadata: { provider_name: 'openai' },
      },
      choices: [{ finish_reason: 'error' }],
    })
    expect(appError.phase).toBe('mid_stream_error')
    expect(appError.category).toBe('rate_limited')
    expect(appError.grade).toBe(1)
    expect(appError.retryable).toBe(true)
    expect(appError.finishReason).toBe('error')
    expect(appError.providerName).toBe('openai')
  })

  it('maps local transport timeout and network errors', () => {
    const timeoutError = normalizeTransportError({
      type: 'timeout',
      code: 'request_timeout',
      message: 'Request timed out after 30000ms',
      timeoutMs: 30000,
    })
    expect(timeoutError.phase).toBe('local_transport_error')
    expect(timeoutError.category).toBe('timeout')
    expect(timeoutError.retryable).toBe(true)

    const networkError = normalizeTransportError(new Error('socket ERR_CONNECTION_CLOSED by peer'))
    expect(networkError.phase).toBe('local_transport_error')
    expect(networkError.category).toBe('network_unreachable')
    expect(networkError.retryable).toBe(true)
  })

  it('maps local protocol parse failure and keeps rawChunk in debug', () => {
    const protocolError = normalizeProtocolError(
      { code: 'json_parse_failed', message: 'Unexpected token' },
      'data: {"id":"gen_1","choices":[{"delta":{"content":"hi"}}'
    )
    expect(protocolError.phase).toBe('local_protocol_error')
    expect(protocolError.category).toBe('protocol_invalid')
    expect(protocolError.grade).toBe(3)
    expect(protocolError.retryable).toBe(false)
    expect(String(protocolError.debug?.rawChunk ?? '')).toContain('data: {"id":"gen_1"')
  })

  it('keeps legacy error envelope shape compatible for existing UI consumers', () => {
    const appError = normalizeOpenRouterPreStreamError(401, {
      error: { code: '401', message: 'Invalid API key' },
    })
    const normalized = toNormalizedErrorEnvelope({
      appError,
      endpoint: 'chat.completions',
      transport: 'http',
      phase: 'request',
    })
    const envelope = buildTransportErrorEnvelope({
      phase: 'pre_stream',
      completionClass: 'error',
      message: appError.message,
      normalized,
      request: { model: DEFAULT_OPENROUTER_TEST_MODEL, stream: true },
    })
    expect(envelope).toMatchObject({
      phase: 'pre_stream',
      completionClass: 'error',
      openrouter: {
        code: '401',
        message: 'Invalid API key',
      },
    })
    expect(envelope.normalized?.normalized.appPhase).toBe('pre_stream_request_error')
    expect(envelope.normalized?.normalized.category).toBe('auth')
  })

  it.each([
    [400, 'shorten_context'],
    [401, 'check_api_key'],
    [402, 'top_up'],
    [403, 'edit_prompt'],
    [429, 'retry_later'],
    [503, 'switch_model'],
  ] as const)('maps httpStatus=%s to userActionHint=%s', (status, action) => {
    const appError = normalizeOpenRouterPreStreamError(status, {
      error: { code: String(status), message: 'x' },
    })
    const normalized = toNormalizedErrorEnvelope({ appError })
    expect(normalized.normalized.userActionHint).toBe(action)
  })
})
/* eslint-enable max-lines-per-function */

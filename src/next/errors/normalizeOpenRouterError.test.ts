import { describe, expect, it } from 'vitest'
import {
  normalizeOpenRouterErrorFromHttpNon2xx,
  normalizeOpenRouterErrorFromSseChunkError,
} from './normalizeOpenRouterError'

describe('normalizeOpenRouterError', () => {
  it.each([
    [400, 'fix_request', false],
    [401, 'reauth', false],
    [402, 'topup_credits', false],
    [403, 'modify_input_moderation', false],
    [408, 'backoff_retry', true],
    [429, 'backoff_retry', true],
    [502, 'switch_provider_or_model', true],
  ] as const)('maps httpStatus=%s', (status, action, retryable) => {
    const env = normalizeOpenRouterErrorFromHttpNon2xx({
      status,
      bodyText: JSON.stringify({ error: { code: status, message: 'x' } }),
      headers: { 'x-request-id': 'r1' },
    })
    expect(env.normalized.phase).toBe('request')
    expect(env.normalized.transport).toBe('http')
    expect(env.normalized.httpStatus).toBe(status)
    expect(env.normalized.action).toBe(action)
    expect(env.normalized.retryable).toBe(retryable)
    expect(env.raw).toBeTruthy()
  })

  it('maps http 503 to relax_routing_constraints only when message looks like no-provider', () => {
    const a = normalizeOpenRouterErrorFromHttpNon2xx({
      status: 503,
      bodyText: JSON.stringify({ error: { code: 503, message: 'No available providers for this request' } }),
    })
    expect(a.normalized.action).toBe('relax_routing_constraints')
    expect(a.normalized.retryable).toBe(true)

    const b = normalizeOpenRouterErrorFromHttpNon2xx({
      status: 503,
      bodyText: JSON.stringify({ error: { code: 503, message: 'Service unavailable' } }),
    })
    expect(b.normalized.action).toBe('backoff_retry')
    expect(b.normalized.retryable).toBe(true)
  })

  it('sanitizes flagged_input from metadata', () => {
    const env = normalizeOpenRouterErrorFromHttpNon2xx({
      status: 403,
      bodyText: JSON.stringify({
        error: {
          code: 403,
          message: 'moderation',
          metadata: { reasons: ['x'], flagged_input: 'secret', provider_name: 'p', model_slug: 'm' },
        },
      }),
    })
    expect(env.normalized.metadata).toMatchObject({ reasons: ['x'], provider_name: 'p', model_slug: 'm' })
    expect(env.normalized.metadata).not.toHaveProperty('flagged_input')
  })

  it('maps sse chunk error code=rate_limit_exceeded to backoff_retry', () => {
    const env = normalizeOpenRouterErrorFromSseChunkError({
      chunkError: { code: 'rate_limit_exceeded', message: 'slow down', metadata: { provider_name: 'p1' } },
      meta: { provider: 'openai', model: 'openrouter/auto', generationId: 'g1', finishReason: 'error' },
    })
    expect(env.normalized.transport).toBe('sse')
    expect(env.normalized.phase).toBe('generation')
    expect(env.normalized.code).toBe('rate_limit_exceeded')
    expect(env.normalized.action).toBe('backoff_retry')
    expect(env.normalized.retryable).toBe(true)
    expect(env.normalized.providerName).toBe('p1')
  })
})


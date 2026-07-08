import { describe, expect, it } from 'vitest'
import { streamEventToDomainEvent } from './streamEventBridge'

describe('streamEventBridge', () => {
  it('preserves non-OpenRouter provider identity in fallback error envelopes', () => {
    const event = streamEventToDomainEvent({
      type: 'stream.error',
      terminal: true,
      error: {
        phase: 'stream',
        provider: 'google-ai-studio',
        category: 'provider_error',
        code: '400',
        message: 'Bad request',
      },
    })

    expect(event.type).toBe('StreamError')
    if (event.type === 'StreamError') {
      expect(event.error.phase).toBe('mid_stream')
      expect(event.error.openrouter.provider).toBe('google-ai-studio')
      expect(event.error.openrouter.metadata?.provider_name).toBe('google-ai-studio')
    }
  })

  it('preserves provider diagnostic and structured network error in fallback envelopes', () => {
    const providerDiagnostic = {
      provider: 'openai-responses',
      httpStatus: 400,
      body: {
        error: {
          code: 'unsupported_value',
          message: 'Your organization must be verified to use the model.',
        },
      },
      rawJson: '{"error":{"code":"unsupported_value"}}',
    }
    const networkError = {
      requestPurpose: 'provider_stream',
      providerId: 'openai_responses',
      transportKind: 'electron_session_fetch',
      reason: 'provider_access_unverified_or_forbidden',
      safeDetailCode: 'provider_access_unverified_or_forbidden',
      safeMessage: 'Provider account or model access is not verified or permitted.',
      safeMessageKey: 'errors.network.reason.providerAccessUnverifiedOrForbidden',
      retryable: false,
    } as const

    const event = streamEventToDomainEvent({
      type: 'stream.error',
      terminal: true,
      error: {
        phase: 'http',
        provider: 'openai-responses',
        category: 'bad_request',
        code: 'unsupported_value',
        message: 'Your organization must be verified to use the model.',
        httpStatus: 400,
        networkError,
        raw: providerDiagnostic,
      },
    })

    expect(event.type).toBe('StreamError')
    if (event.type === 'StreamError') {
      expect(event.error.openrouter.metadata?.networkError).toEqual(networkError)
      expect(event.error.openrouter.metadata?.providerDiagnostic).toEqual(providerDiagnostic)
    }
  })
})

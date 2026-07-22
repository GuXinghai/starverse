import { describe, expect, it } from 'vitest'
import { ProviderHttpTransportError } from '../net/providerHttpTransport'
import { formatOpenRouterChatTransportFailureMessage } from './openRouterChatStreamRunnerV2'
import { OpenRouterChatProviderStreamErrorV1, OpenRouterChatStreamV1Error } from '../../src/next/generation-v2/providers/openrouter/chatStreamV1'

describe('openRouterChatStreamRunnerV2 transport diagnostics', () => {
  it('persists only the classified pre-response transport code', () => {
    const error = new ProviderHttpTransportError(
      new Error('net::ERR_CONNECTION_RESET https://secret.invalid/?token=secret'),
    )

    const message = formatOpenRouterChatTransportFailureMessage(error, false)
    expect(message).toBe('pre_response:ERR_CONNECTION_RESET')
    expect(message).not.toContain('secret.invalid')
    expect(message).not.toContain('token')
  })

  it('distinguishes a response-stream failure without retaining raw text', () => {
    const message = formatOpenRouterChatTransportFailureMessage(
      new Error('provider response contained private text'),
      true,
    )

    expect(message).toBe('response_stream:Error')
    expect(message).not.toContain('private text')
  })

  it('keeps the internal terminal category generic while raw payload persistence is separate', () => {
    const message = formatOpenRouterChatTransportFailureMessage(
      new OpenRouterChatProviderStreamErrorV1('{"error":{"code":429,"message":"private"}}'),
      true,
    )

    expect(message).toBe('response_stream:provider_reported_error')
    expect(message).not.toContain('private')
  })

  it('preserves an exact decoder contract failure instead of calling it transport failure', () => {
    const message = formatOpenRouterChatTransportFailureMessage(
      new OpenRouterChatStreamV1Error('GENERATION_V2_OPENROUTER_CHAT_SSE_PREMATURE_EOF'),
      true,
    )

    expect(message).toBe('response_stream:GENERATION_V2_OPENROUTER_CHAT_SSE_PREMATURE_EOF:GENERATION_V2_OPENROUTER_CHAT_SSE_PREMATURE_EOF')
  })
})

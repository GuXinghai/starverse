import { describe, expect, it } from 'vitest'
import {
  redactProviderCredentialText,
  safeProviderCredentialErrorMessage,
} from './providerCredentialRedaction'

describe('providerCredentialRedaction', () => {
  it('redacts common provider credential material from text', () => {
    const raw = [
      'Authorization: Bearer sk-provider-secret-123456',
      'Bearer sk-openai-secret-abcdef',
      'x-api-key: sk-ant-secret-abcdef',
      'provider body contained sk-raw-provider-secret',
    ].join('\n')

    const redacted = redactProviderCredentialText(raw)

    expect(redacted).toContain('Authorization: [REDACTED]')
    expect(redacted).toContain('Bearer [REDACTED]')
    expect(redacted).toContain('x-api-key: [REDACTED]')
    expect(redacted).not.toContain('sk-provider-secret-123456')
    expect(redacted).not.toContain('sk-openai-secret-abcdef')
    expect(redacted).not.toContain('sk-ant-secret-abcdef')
    expect(redacted).not.toContain('sk-raw-provider-secret')
  })

  it('builds a bounded safe error message without raw provider bodies', () => {
    const message = safeProviderCredentialErrorMessage({
      message: 'Authorization=Bearer sk-provider-secret-abcdef',
      body: { error: 'x-api-key=sk-provider-secret-ghijkl' },
    }, 'Provider credential error.')

    expect(message.length).toBeLessThanOrEqual(515)
    expect(message).not.toContain('sk-provider-secret-abcdef')
    expect(message).not.toContain('sk-provider-secret-ghijkl')
    expect(message).not.toContain('Bearer sk-')
    expect(message).not.toContain('x-api-key=sk-')
  })
})


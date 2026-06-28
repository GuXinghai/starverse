import { describe, expect, it } from 'vitest'
import { validateExternalUrl } from './externalUrlPolicy'

describe('external URL policy', () => {
  it.each([
    ['http://example.com/a', 'http://example.com/a'],
    ['https://example.com/a', 'https://example.com/a'],
  ])('allows %s', (input, normalized) => {
    expect(validateExternalUrl(input)).toEqual({ ok: true, url: normalized })
  })

  it.each([
    'file:///C:/Users/alice/secret.txt',
    'javascript:alert(1)',
    'data:text/html,hello',
    'vbscript:msgbox(1)',
    'mailto:alice@example.com',
    'starverse://callback',
  ])('blocks %s', (input) => {
    expect(validateExternalUrl(input)).toEqual({
      ok: false,
      code: 'external_protocol_blocked',
      message: 'External URL protocol is blocked.',
    })
  })

  it('rejects invalid URLs', () => {
    expect(validateExternalUrl('not a url')).toEqual({
      ok: false,
      code: 'invalid_url',
      message: 'External URL is invalid.',
    })
  })
})

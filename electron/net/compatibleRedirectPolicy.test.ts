import { describe, expect, it } from 'vitest'
import {
  advanceCompatibleRedirect,
  CompatibleRedirectPolicyError,
  createCompatibleRedirectState,
  shouldPreserveCompatibleRequestBody,
} from './compatibleRedirectPolicy'

describe('compatibleRedirectPolicy', () => {
  it('resolves relative redirects, preserves POST and keeps credentials only on same-origin hops', () => {
    const initial = createCompatibleRedirectState({
      url: new URL('https://api.example/v1/chat/completions'),
      method: 'POST',
    })
    const sameOrigin = advanceCompatibleRedirect(initial, { status: 303, location: '../v2/chat/completions' })
    expect(sameOrigin.currentUrl.toString()).toBe('https://api.example/v1/v2/chat/completions')
    expect(sameOrigin.method).toBe('POST')
    expect(shouldPreserveCompatibleRequestBody(sameOrigin)).toBe(true)
    expect(sameOrigin.credentialForwardingAllowed).toBe(true)

    const crossOrigin = advanceCompatibleRedirect(sameOrigin, {
      status: 307,
      location: 'https://edge.example/v1/chat/completions',
    })
    expect(crossOrigin.method).toBe('POST')
    expect(crossOrigin.credentialForwardingAllowed).toBe(false)
    const laterSameOrigin = advanceCompatibleRedirect(crossOrigin, { status: 308, location: '/final' })
    expect(laterSameOrigin.credentialForwardingAllowed).toBe(false)
  })

  it('bounds redirects to five and detects loops before another request', () => {
    let state = createCompatibleRedirectState({ url: new URL('https://api.example/start'), method: 'GET' })
    for (let index = 1; index <= 5; index += 1) {
      state = advanceCompatibleRedirect(state, { status: 302, location: `/hop-${index}` })
    }
    expect(() => advanceCompatibleRedirect(state, { status: 302, location: '/hop-6' })).toThrowError(
      expect.objectContaining({ code: 'compatible_redirect_limit' }),
    )

    const loopStart = createCompatibleRedirectState({ url: new URL('https://api.example/start'), method: 'GET' })
    const hop = advanceCompatibleRedirect(loopStart, { status: 301, location: '/hop' })
    expect(() => advanceCompatibleRedirect(hop, { status: 301, location: '/start' })).toThrowError(
      expect.objectContaining({ code: 'compatible_redirect_loop' }),
    )
  })

  it.each([
    { status: 300, location: '/next' },
    { status: 306, location: '/next' },
    { status: 302, location: '' },
    { status: 302, location: 'file:///etc/passwd' },
    { status: 302, location: 'https://user:secret@api.example/next' },
    { status: 302, location: 'https://api.example/next?api_key=secret' },
    { status: 302, location: 'https://api.example/next?value=Bearer%20secret' },
  ])('rejects unsafe redirect input %#', (input) => {
    const state = createCompatibleRedirectState({ url: new URL('https://api.example/start'), method: 'GET' })
    expect(() => advanceCompatibleRedirect(state, input)).toThrow(CompatibleRedirectPolicyError)
  })
})

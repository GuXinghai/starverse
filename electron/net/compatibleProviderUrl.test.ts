import { describe, expect, it } from 'vitest'
import { composeCompatibleProviderUrl, compatibleSafeUrlIdentity } from './compatibleProviderUrl'

describe('compatibleProviderUrl', () => {
  it.each([
    ['https://api.example', 'https://api.example/v1/chat/completions'],
    ['https://api.example/', 'https://api.example/v1/chat/completions'],
    ['https://api.example/v1', 'https://api.example/v1/chat/completions'],
    ['https://api.example/v1/', 'https://api.example/v1/chat/completions'],
    ['https://gateway.example/team/openai', 'https://gateway.example/team/openai/v1/chat/completions'],
    ['https://gateway.example/team/openai/v1/v1', 'https://gateway.example/team/openai/v1/chat/completions'],
  ])('composes one canonical Chat Completions path from %s', (baseUrl, expected) => {
    expect(composeCompatibleProviderUrl({ baseUrl, allowInsecureHttp: false, securityPolicy: 'compatibility_first', ordinaryHeaders: [], query: [] }, 'chat_completions').url.toString()).toBe(expected)
  })

  it('composes models under the same gateway-scoped API root', () => {
    expect(composeCompatibleProviderUrl({
      baseUrl: 'https://gateway.example/account/openai/v1',
      allowInsecureHttp: false,
      securityPolicy: 'compatibility_first',
      ordinaryHeaders: [],
      query: [
        { name: 'region', value: 'us west', classification: 'public_non_secret' },
        { name: 'api-version', value: '2026-01-01', classification: 'public_non_secret' },
      ],
    }, 'models')).toMatchObject({
      operation: 'models',
      insecureHttp: false,
    })
    expect(composeCompatibleProviderUrl({
      baseUrl: 'https://gateway.example/account/openai/v1',
      allowInsecureHttp: false,
      securityPolicy: 'compatibility_first',
      ordinaryHeaders: [],
      query: [
        { name: 'region', value: 'us west', classification: 'public_non_secret' },
        { name: 'api-version', value: '2026-01-01', classification: 'public_non_secret' },
      ],
    }, 'models').url.toString()).toBe('https://gateway.example/account/openai/v1/models?api-version=2026-01-01&region=us+west')
  })

  it('allows HTTP while returning persistent-warning metadata', () => {
    expect(composeCompatibleProviderUrl({ baseUrl: 'http://api.example', allowInsecureHttp: true, securityPolicy: 'compatibility_first', ordinaryHeaders: [], query: [] }, 'models')).toMatchObject({
      insecureHttp: true,
      operation: 'models',
    })
  })

  it.each([
    'ftp://api.example',
    'https://user:secret@api.example',
    'https://api.example/v1?token=secret',
    'https://api.example/v1#fragment',
  ])('rejects an invalid Base URL again at the transport boundary: %s', (baseUrl) => {
    expect(() => composeCompatibleProviderUrl({ baseUrl, allowInsecureHttp: baseUrl.startsWith('http:'), securityPolicy: 'compatibility_first', ordinaryHeaders: [], query: [] }, 'models')).toThrow()
  })

  it('does not expose query values through its safe identity', () => {
    const url = new URL('https://api.example/v1/models?region=private-value')
    expect(compatibleSafeUrlIdentity(url)).toEqual({
      protocol: 'https:',
      origin: 'https://api.example',
      pathname: '/v1/models',
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  CompatibleProxyRouteError,
  parseCompatibleProxyRoute,
  selectCompatibleTransport,
} from './compatibleProxyRoute'

const base = {
  manualProxyUrl: '',
  noProxy: '',
  strictSSL: true as const,
}

describe('compatibleProxyRoute', () => {
  it.each([
    ['system', 'electron_session_fetch'],
    ['manual', 'node_undici'],
    ['environment', 'node_undici'],
    ['direct', 'node_undici'],
  ] as const)('preserves explicit %s route and selects only its native transport', (proxyMode, transportKind) => {
    const selected = selectCompatibleTransport({
      ...base,
      proxyMode,
      ...(proxyMode === 'manual' ? { manualProxyUrl: 'http://proxy.example:8080' } : {}),
    }, new URL('https://api.example/v1/models'))
    expect(selected).toMatchObject({ proxyRoute: proxyMode, transportKind, bypassed: false })
  })

  it('preserves an explicit noProxy bypass without changing the selected route identity', () => {
    const selected = selectCompatibleTransport({
      ...base,
      proxyMode: 'manual',
      manualProxyUrl: 'http://proxy.example:8080',
      noProxy: '.example',
    }, new URL('https://api.example/v1/models'))
    expect(selected).toEqual({
      proxyRoute: 'manual',
      transportKind: 'node_undici',
      bypassed: true,
    })
  })

  it.each([
    undefined,
    {},
    { ...base, proxyMode: 'browser_compatible' },
    { ...base, proxyMode: 'strict_security' },
    { ...base, proxyMode: 'system', extra: true },
    { ...base, proxyMode: 'direct', strictSSL: false },
  ])('rejects invalid route input instead of normalizing to environment: %#', (value) => {
    expect(() => parseCompatibleProxyRoute(value)).toThrowError(
      expect.objectContaining({ code: 'compatible_proxy_route_invalid' }),
    )
  })

  it.each([
    { ...base, proxyMode: 'manual', manualProxyUrl: '' },
    { ...base, proxyMode: 'manual', manualProxyUrl: 'socks://proxy.example:1080' },
    { ...base, proxyMode: 'manual', manualProxyUrl: 'http://user:secret@proxy.example:8080' },
  ])('blocks an unavailable manual route without switching transport: %#', (value) => {
    expect(() => selectCompatibleTransport(value, new URL('https://api.example/v1/models'))).toThrow(CompatibleProxyRouteError)
    expect(() => selectCompatibleTransport(value, new URL('https://api.example/v1/models'))).toThrowError(
      expect.objectContaining({ code: 'compatible_transport_unavailable' }),
    )
  })
})

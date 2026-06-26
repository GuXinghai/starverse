import { describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  sessionFetch: vi.fn(),
}))

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      fetch: electronMock.sessionFetch,
    },
  },
}))

import {
  classifyProviderResolvedProxy,
  createElectronSessionProviderFetch,
  getProviderHttpProxyEnvDiagnostics,
} from './providerHttpTransport'

describe('providerHttpTransport', () => {
  it('creates a fetch-like transport backed by Electron session.fetch', async () => {
    const response = new Response(JSON.stringify({ ok: true }))
    electronMock.sessionFetch.mockResolvedValueOnce(response)
    const controller = new AbortController()
    const fetchImpl = createElectronSessionProviderFetch()

    await expect(fetchImpl('https://generativelanguage.googleapis.com/v1beta/models', {
      method: 'GET',
      headers: { 'x-goog-api-key': 'fake-google-secret' },
      signal: controller.signal,
      redirect: 'error',
    })).resolves.toBe(response)

    expect(electronMock.sessionFetch).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/models', {
      method: 'GET',
      headers: { 'x-goog-api-key': 'fake-google-secret' },
      signal: controller.signal,
      redirect: 'error',
    })
  })

  it('reports only proxy env configured/missing status without values', () => {
    expect(getProviderHttpProxyEnvDiagnostics({
      HTTP_PROXY: 'http://proxy.internal:8080',
      HTTPS_PROXY: '',
      NO_PROXY: 'localhost',
    })).toEqual({
      HTTP_PROXY: 'configured',
      HTTPS_PROXY: 'missing',
      NO_PROXY: 'configured',
    })
  })

  it('classifies Electron resolveProxy output without preserving host details', () => {
    expect(classifyProviderResolvedProxy('DIRECT')).toBe('DIRECT')
    expect(classifyProviderResolvedProxy('PROXY proxy.internal:8080')).toBe('PROXY configured')
    expect(classifyProviderResolvedProxy('HTTPS proxy.internal:8443')).toBe('PROXY configured')
    expect(classifyProviderResolvedProxy('')).toBe('unknown/error')
    expect(classifyProviderResolvedProxy('UNEXPECTED value')).toBe('unknown/error')
  })
})

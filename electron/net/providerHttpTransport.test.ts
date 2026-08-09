import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  sessionFetch: vi.fn(),
  defaultSessionAccessCount: { value: 0 },
  failOnDefaultSessionAccess: { value: false },
}))

vi.mock('electron', () => ({
  session: {
    get defaultSession() {
      electronMock.defaultSessionAccessCount.value += 1
      if (electronMock.failOnDefaultSessionAccess.value) {
        throw new Error('defaultSession accessed before app ready')
      }
      return {
        fetch: electronMock.sessionFetch,
      }
    },
  },
}))

import {
  ProviderHttpTransportError,
  classifyProviderHttpTransportDiagnostic,
  classifyProviderResolvedProxy,
  createElectronSessionProviderFetch,
  getProviderHttpProxyEnvDiagnostics,
} from './providerHttpTransport'

describe('providerHttpTransport', () => {
  beforeEach(() => {
    electronMock.sessionFetch.mockReset()
    electronMock.defaultSessionAccessCount.value = 0
    electronMock.failOnDefaultSessionAccess.value = false
  })

  it('does not resolve Electron defaultSession while creating the fetch wrapper', async () => {
    electronMock.failOnDefaultSessionAccess.value = true

    const fetchImpl = createElectronSessionProviderFetch()

    expect(electronMock.defaultSessionAccessCount.value).toBe(0)

    const response = new Response(JSON.stringify({ ok: true }))
    electronMock.failOnDefaultSessionAccess.value = false
    electronMock.sessionFetch.mockResolvedValueOnce(response)

    await expect(fetchImpl('https://api.openai.com/v1/models')).resolves.toBe(response)
    expect(electronMock.defaultSessionAccessCount.value).toBe(1)
  })

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

  it('fails governed requests before Electron fetch when the product proxy authority is blocked', async () => {
    const beforeRequest = vi.fn(() => { throw new Error('proxy_environment_unavailable') })
    const fetchImpl = createElectronSessionProviderFetch({ beforeRequest })

    await expect(fetchImpl('https://api.openai.com/v1/models'))
      .rejects.toThrow('proxy_environment_unavailable')
    expect(beforeRequest).toHaveBeenCalledTimes(1)
    expect(electronMock.defaultSessionAccessCount.value).toBe(0)
    expect(electronMock.sessionFetch).not.toHaveBeenCalled()
  })

  it('retains only a safe diagnostic code for Electron transport failures', async () => {
    electronMock.sessionFetch.mockRejectedValueOnce(new Error('net::ERR_CONNECTION_RESET https://secret.invalid/?token=secret'))
    const fetchImpl = createElectronSessionProviderFetch()

    const failure = await fetchImpl('https://api.openai.com/v1/models').catch((error) => error)
    expect(failure).toBeInstanceOf(ProviderHttpTransportError)
    expect(failure).toMatchObject({ diagnosticCode: 'ERR_CONNECTION_RESET', message: 'ERR_CONNECTION_RESET' })
    expect(JSON.stringify(failure)).not.toContain('secret.invalid')
    expect(classifyProviderHttpTransportDiagnostic(new Error('arbitrary raw message'))).toBe('Error')
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

import { describe, expect, it, vi } from 'vitest'
import {
  createLocalEndpointDirectFetch,
  getLocalEndpointDefaultProxyPolicy,
  LOCAL_ENDPOINT_NETWORK_TARGET,
} from './localEndpointTransport'

describe('localEndpointTransport', () => {
  it('expresses local endpoint traffic as the localEndpoint direct policy target', () => {
    expect(LOCAL_ENDPOINT_NETWORK_TARGET).toBe('localEndpoint')
    expect(getLocalEndpointDefaultProxyPolicy()).toMatchObject({
      mode: 'direct',
      proxyRules: '',
      proxyBypassRules: '',
      pacScript: '',
      credentialRef: null,
    })
  })

  it('wraps the direct fetch implementation without changing request options', async () => {
    const response = new Response(JSON.stringify({ ok: true }))
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch
    const directFetch = createLocalEndpointDirectFetch({ fetchImpl })
    const controller = new AbortController()

    await expect(directFetch?.('http://127.0.0.1:11434/api/tags', {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
    })).resolves.toBe(response)

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
    })
  })

  it('reports unavailable when no direct fetch implementation exists', () => {
    const originalFetch = globalThis.fetch
    try {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: undefined,
      })

      expect(createLocalEndpointDirectFetch()).toBeUndefined()
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: originalFetch,
      })
    }
  })
})

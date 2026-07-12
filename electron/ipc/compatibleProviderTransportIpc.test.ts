import { describe, expect, it, vi } from 'vitest'
import {
  COMPATIBLE_PROVIDER_TRANSPORT_CHANNELS,
  registerCompatibleProviderTransportIpc,
} from './compatibleProviderTransportIpc'

function setup() {
  const handlers = new Map<string, (...args: any[]) => any>()
  const service: any = {
    testConnection: vi.fn(async (input) => ({ ok: true, requestId: input.requestId, httpStatus: 200, diagnostics: {} })),
    abortConnectionTest: vi.fn(() => ({ aborted: true })),
    abortOwner: vi.fn(() => 1),
    abortAll: vi.fn(() => 0),
  }
  const channels = registerCompatibleProviderTransportIpc({
    registerInvoke: (channel, handler) => handlers.set(channel, handler),
    service: service as any,
  })
  const listeners = new Set<() => void>()
  const sender = {
    id: 7,
    once: vi.fn((_event, listener) => listeners.add(listener)),
    removeListener: vi.fn((_event, listener) => listeners.delete(listener)),
  }
  return { handlers, service, channels, sender, listeners }
}

describe('compatibleProviderTransportIpc', () => {
  it('registers only typed connection-test/abort channels', () => {
    const { channels } = setup()
    expect(channels).toEqual([...COMPATIBLE_PROVIDER_TRANSPORT_CHANNELS])
    expect(channels.some((channel) => /chat|send|stream/iu.test(channel))).toBe(false)
  })

  it('derives ownership from event.sender and cleans its destroy listener', async () => {
    const { handlers, service, sender, listeners } = setup()
    const result = await handlers.get('compatible-provider:test-connection')?.(
      { sender },
      { providerInstanceId: 'ocp_provider_12345678', requestId: 'connection-1' },
    )
    expect(result).toMatchObject({ ok: true, requestId: 'connection-1' })
    expect(service.testConnection).toHaveBeenCalledWith({
      providerInstanceId: 'ocp_provider_12345678',
      requestId: 'connection-1',
      ownerWebContentsId: 7,
    })
    expect(listeners.size).toBe(0)
  })

  it('aborts all owner requests if WebContents is destroyed during the test', async () => {
    const { handlers, service, sender, listeners } = setup()
    let release!: () => void
    service.testConnection.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ ok: false, requestId: 'connection-1', error: {} })
    }))
    const pending = handlers.get('compatible-provider:test-connection')?.(
      { sender },
      { providerInstanceId: 'ocp_provider_12345678', requestId: 'connection-1' },
    )
    expect(listeners.size).toBe(1)
    listeners.forEach((listener) => listener())
    expect(service.abortOwner).toHaveBeenCalledWith(7)
    release()
    await pending
    expect(listeners.size).toBe(0)
  })

  it('scopes explicit abort to event.sender', async () => {
    const { handlers, service, sender } = setup()
    await handlers.get('compatible-provider:abort-connection-test')?.(
      { sender },
      { requestId: 'connection-1' },
    )
    expect(service.abortConnectionTest).toHaveBeenCalledWith({ requestId: 'connection-1', ownerWebContentsId: 7 })
  })

  it.each([
    { providerInstanceId: 'ocp_provider_12345678', requestId: 'bad request id' },
    { providerInstanceId: 'ocp_provider_12345678', requestId: 'connection-1', url: 'https://attacker.example' },
    { providerInstanceId: 'openrouter', requestId: 'connection-1' },
  ])('rejects arbitrary/corrupt renderer transport input: %#', async (payload) => {
    const { handlers, service, sender } = setup()
    await expect(handlers.get('compatible-provider:test-connection')?.({ sender }, payload)).resolves.toEqual({
      ok: false,
      requestId: 'invalid',
      error: expect.objectContaining({ code: 'compatible_config_invalid' }),
    })
    expect(service.testConnection).not.toHaveBeenCalled()
  })
})

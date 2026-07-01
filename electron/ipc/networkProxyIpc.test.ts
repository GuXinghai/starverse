import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_NETWORK_PROXY_POLICY } from '../../src/shared/network/proxyPolicy'
import type { ElectronSessionProxyController } from '../net/electronSessionProxyController'
import { NETWORK_PROXY_IPC_CHANNELS, registerNetworkProxyIpc } from './networkProxyIpc'

function registerHandlers(controllerOverrides?: Partial<ElectronSessionProxyController>) {
  const registerInvoke = vi.fn()
  const controller: ElectronSessionProxyController = {
    getPolicy: vi.fn(() => ({ ok: true as const, policy: DEFAULT_NETWORK_PROXY_POLICY })),
    updatePolicy: vi.fn(async () => ({
      ok: true as const,
      policy: { ...DEFAULT_NETWORK_PROXY_POLICY, mode: 'direct' as const },
      config: { mode: 'direct' as const },
      reason: 'manual' as const,
      closedConnections: true,
      appliedAtMs: 1,
    })),
    resetPolicy: vi.fn(async () => ({
      ok: true as const,
      policy: DEFAULT_NETWORK_PROXY_POLICY,
      config: { mode: 'system' as const },
      reason: 'manual' as const,
      closedConnections: true,
      appliedAtMs: 2,
    })),
    applyCurrentPolicy: vi.fn(async () => ({
      ok: true as const,
      policy: DEFAULT_NETWORK_PROXY_POLICY,
      config: { mode: 'system' as const },
      reason: 'startup' as const,
      closedConnections: false,
      appliedAtMs: 3,
    })),
    resolveProxy: vi.fn(async () => ({
      ok: true as const,
      url: 'https://example.test/',
      resolvedProxy: 'DIRECT',
      proxyKind: 'DIRECT' as const,
      observedAtMs: 4,
    })),
    ...controllerOverrides,
  }
  const channels = registerNetworkProxyIpc({ registerInvoke, controller })
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  for (const [channel, handler] of registerInvoke.mock.calls) {
    handlers.set(channel, handler)
  }
  return { channels, handlers, controller }
}

describe('networkProxyIpc', () => {
  it('registers the minimal network proxy channels', () => {
    const { channels, handlers } = registerHandlers()

    expect(channels).toEqual([...NETWORK_PROXY_IPC_CHANNELS])
    expect([...handlers.keys()]).toEqual([...NETWORK_PROXY_IPC_CHANNELS])
  })

  it('delegates get, update, and reset to the controller', async () => {
    const { handlers, controller } = registerHandlers()
    const policy = { mode: 'direct' }

    await handlers.get('network-proxy:get-policy')?.({})
    await handlers.get('network-proxy:update-policy')?.({}, policy)
    await handlers.get('network-proxy:reset-policy')?.({})

    expect(controller.getPolicy).toHaveBeenCalledTimes(1)
    expect(controller.updatePolicy).toHaveBeenCalledWith(policy)
    expect(controller.resetPolicy).toHaveBeenCalledTimes(1)
  })

  it('accepts string and object URL payloads for resolveProxy', async () => {
    const { handlers, controller } = registerHandlers()

    await handlers.get('network-proxy:resolve-proxy')?.({}, 'https://example.test/a')
    await handlers.get('network-proxy:resolve-proxy')?.({}, { url: 'https://example.test/b' })

    expect(controller.resolveProxy).toHaveBeenNthCalledWith(1, 'https://example.test/a')
    expect(controller.resolveProxy).toHaveBeenNthCalledWith(2, 'https://example.test/b')
  })
})

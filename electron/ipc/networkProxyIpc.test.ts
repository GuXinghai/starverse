import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_NETWORK_PROXY_SETTINGS } from '../../src/shared/plugin-distribution/networkProxyShared'
import type { ProductNetworkProxyV2Controller } from '../net/productNetworkProxyV2'
import { NETWORK_PROXY_IPC_CHANNELS, registerNetworkProxyIpc } from './networkProxyIpc'

function registerHandlers(controllerOverrides?: Partial<ProductNetworkProxyV2Controller>) {
  const registerInvoke = vi.fn()
  const readyState = Object.freeze({ status: 'ready' as const, settings: DEFAULT_NETWORK_PROXY_SETTINGS,
    errorCode: null, appliedAtMs: 1 })
  const success = Object.freeze({ ok: true as const, settings: DEFAULT_NETWORK_PROXY_SETTINGS, state: readyState })
  const controller: ProductNetworkProxyV2Controller = {
    getSettings: vi.fn(() => success),
    updateSettings: vi.fn(async () => success),
    resetSettings: vi.fn(async () => success),
    applyStoredSettings: vi.fn(async () => success),
    getState: vi.fn(() => readyState),
    assertGovernedRequestAvailable: vi.fn(),
    resolveProxy: vi.fn(async () => ({
      ok: true as const, resolvedProxy: 'DIRECT', proxyKind: 'DIRECT' as const,
    })),
    ...controllerOverrides,
  }
  const channels = registerNetworkProxyIpc({ registerInvoke, controller })
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  for (const [channel, handler] of registerInvoke.mock.calls) handlers.set(channel, handler)
  return { channels, handlers, controller }
}

describe('networkProxyIpc', () => {
  it('registers only the frozen product proxy channels', () => {
    const { channels, handlers } = registerHandlers()
    expect(channels).toEqual([...NETWORK_PROXY_IPC_CHANNELS])
    expect([...handlers.keys()]).toEqual([...NETWORK_PROXY_IPC_CHANNELS])
  })

  it('delegates get, update, reset and explicit reapply to the product authority', async () => {
    const { handlers, controller } = registerHandlers()
    const settings = { proxyMode: 'direct', manualProxyUrl: '', noProxy: '', strictSSL: true }
    await handlers.get('network-proxy:get-settings')?.({})
    await handlers.get('network-proxy:update-settings')?.({}, settings)
    await handlers.get('network-proxy:reset-settings')?.({})
    await handlers.get('network-proxy:reapply-settings')?.({})
    expect(controller.getSettings).toHaveBeenCalledTimes(1)
    expect(controller.updateSettings).toHaveBeenCalledWith(settings)
    expect(controller.resetSettings).toHaveBeenCalledTimes(1)
    expect(controller.applyStoredSettings).toHaveBeenCalledTimes(1)
  })

  it('accepts string and object URL payloads for diagnostic resolution', async () => {
    const { handlers, controller } = registerHandlers()
    await handlers.get('network-proxy:resolve-proxy')?.({}, 'https://example.test/a')
    await handlers.get('network-proxy:resolve-proxy')?.({}, { url: 'https://example.test/b' })
    expect(controller.resolveProxy).toHaveBeenNthCalledWith(1, 'https://example.test/a')
    expect(controller.resolveProxy).toHaveBeenNthCalledWith(2, 'https://example.test/b')
  })
})

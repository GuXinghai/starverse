import type { ProductNetworkProxyV2Controller } from '../net/productNetworkProxyV2'
import type { RegisterInvoke } from './types'
import type { NetworkProxyDraftProbe, NetworkProxyScope } from '../../src/shared/plugin-distribution/networkProxyShared'
import type { createNetworkProxyDraftProbe } from '../net/networkProxyDraftProbe'

/** WebFrameMain has parent/routingId/processId, not renderer process.isMainFrame. */
export function isTrustedProxyIpcSender(event: unknown, expected: {
  id: number
  mainFrame: { routingId: number; processId: number }
} | null): boolean {
  const value = event as { sender?: { id?: unknown }; senderFrame?: { parent?: unknown; routingId?: unknown; processId?: unknown } } | null
  const frame = value?.senderFrame
  return Boolean(expected && frame && frame.parent === null && value?.sender?.id === expected.id &&
    frame.routingId === expected.mainFrame.routingId && frame.processId === expected.mainFrame.processId)
}

export const NETWORK_PROXY_IPC_CHANNELS = Object.freeze([
  'network-proxy:get-settings',
  'network-proxy:update-settings',
  'network-proxy:reset-settings',
  'network-proxy:reapply-settings',
  'network-proxy:resolve-proxy',
  'network-proxy:get-configuration',
  'network-proxy:update-configuration',
  'network-proxy:get-environment',
  'network-proxy:probe-draft',
  'network-proxy:cancel-probe',
] as const)

/**
 * Public product proxy IPC. Electron's internal PAC/auto-detect policy shapes
 * never cross this boundary.
 */
export function registerNetworkProxyIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  controller: ProductNetworkProxyV2Controller
  probe?: ReturnType<typeof createNetworkProxyDraftProbe>
  authorize?: (event: unknown) => boolean
}>): readonly string[] {
  const register: RegisterInvoke = (channel, handler) => input.registerInvoke(channel, (event: unknown, ...args: unknown[]) => {
    if (input.authorize && !input.authorize(event)) throw new Error('proxy_ipc_sender_invalid')
    return handler(event, ...args)
  })
  const scopeOf = (payload: unknown): NetworkProxyScope => {
    const scope = payload && typeof payload === 'object' ? (payload as { scope?: unknown }).scope : undefined
    if (scope !== undefined && scope !== 'application' && scope !== 'browser') throw new Error('invalid_proxy_scope')
    return scope ?? 'application'
  }
  register(NETWORK_PROXY_IPC_CHANNELS[0], () => input.controller.getSettings())
  register(NETWORK_PROXY_IPC_CHANNELS[1], (_event: unknown, settings: unknown) =>
    input.controller.updateSettings(settings))
  register(NETWORK_PROXY_IPC_CHANNELS[2], (_event: unknown, payload: unknown) => input.controller.resetSettings(scopeOf(payload)))
  register(NETWORK_PROXY_IPC_CHANNELS[3], (_event: unknown, payload: unknown) => input.controller.applyStoredSettings(scopeOf(payload)))
  register(NETWORK_PROXY_IPC_CHANNELS[4], (_event: unknown, payload: unknown) => {
    const url = typeof payload === 'string'
      ? payload
      : payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as { url?: unknown }).url
        : undefined
    return input.controller.resolveProxy(url, scopeOf(payload))
  })
  register(NETWORK_PROXY_IPC_CHANNELS[5], () => input.controller.getConfiguration())
  register(NETWORK_PROXY_IPC_CHANNELS[6], (_event: unknown, value: unknown) => input.controller.updateConfiguration(value))
  register(NETWORK_PROXY_IPC_CHANNELS[7], () => input.controller.getEnvironment())
  register(NETWORK_PROXY_IPC_CHANNELS[8], (_event: unknown, value: unknown) => {
    if (!input.probe) throw new Error('proxy_probe_unavailable')
    return input.probe.probeDraft(value as NetworkProxyDraftProbe)
  })
  register(NETWORK_PROXY_IPC_CHANNELS[9], (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') throw new Error('invalid_probe')
    input.probe?.cancel(id)
  })
  return NETWORK_PROXY_IPC_CHANNELS
}

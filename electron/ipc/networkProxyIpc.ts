import type { ProductNetworkProxyV2Controller } from '../net/productNetworkProxyV2'
import type { RegisterInvoke } from './types'

export const NETWORK_PROXY_IPC_CHANNELS = Object.freeze([
  'network-proxy:get-settings',
  'network-proxy:update-settings',
  'network-proxy:reset-settings',
  'network-proxy:reapply-settings',
  'network-proxy:resolve-proxy',
] as const)

/**
 * Public product proxy IPC. Electron's internal PAC/auto-detect policy shapes
 * never cross this boundary.
 */
export function registerNetworkProxyIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  controller: ProductNetworkProxyV2Controller
}>): readonly string[] {
  input.registerInvoke(NETWORK_PROXY_IPC_CHANNELS[0], () => input.controller.getSettings())
  input.registerInvoke(NETWORK_PROXY_IPC_CHANNELS[1], (_event: unknown, settings: unknown) =>
    input.controller.updateSettings(settings))
  input.registerInvoke(NETWORK_PROXY_IPC_CHANNELS[2], () => input.controller.resetSettings())
  input.registerInvoke(NETWORK_PROXY_IPC_CHANNELS[3], () => input.controller.applyStoredSettings())
  input.registerInvoke(NETWORK_PROXY_IPC_CHANNELS[4], (_event: unknown, payload: unknown) => {
    const url = typeof payload === 'string'
      ? payload
      : payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as { url?: unknown }).url
        : undefined
    return input.controller.resolveProxy(url)
  })
  return NETWORK_PROXY_IPC_CHANNELS
}

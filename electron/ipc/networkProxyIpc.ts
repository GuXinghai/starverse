import type { ElectronSessionProxyController } from '../net/electronSessionProxyController'
import type { RegisterInvoke } from './types'

export const NETWORK_PROXY_IPC_CHANNELS = [
  'network-proxy:get-policy',
  'network-proxy:update-policy',
  'network-proxy:reset-policy',
  'network-proxy:resolve-proxy',
] as const

type RegisterNetworkProxyIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  controller: ElectronSessionProxyController
}>

export function registerNetworkProxyIpc(input: RegisterNetworkProxyIpcInput): string[] {
  const { registerInvoke, controller } = input

  registerInvoke('network-proxy:get-policy', () => controller.getPolicy())
  registerInvoke('network-proxy:update-policy', (_event: unknown, policy: unknown) => controller.updatePolicy(policy))
  registerInvoke('network-proxy:reset-policy', () => controller.resetPolicy())
  registerInvoke('network-proxy:resolve-proxy', (_event: unknown, payload: unknown) => {
    const url = typeof payload === 'string'
      ? payload
      : payload && typeof payload === 'object'
        ? (payload as { url?: unknown }).url
        : undefined
    return controller.resolveProxy(url)
  })

  return [...NETWORK_PROXY_IPC_CHANNELS]
}

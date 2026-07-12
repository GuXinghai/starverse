import {
  getDefaultNetworkProxyPolicyForTarget,
  type NetworkProxyPolicy,
} from '../../src/shared/network/proxyPolicy'

export type LocalEndpointFetch = typeof fetch

export const LOCAL_ENDPOINT_NETWORK_TARGET = 'localEndpoint' as const

export function getLocalEndpointDefaultProxyPolicy(): NetworkProxyPolicy {
  return getDefaultNetworkProxyPolicyForTarget(LOCAL_ENDPOINT_NETWORK_TARGET)
}

export function createLocalEndpointDirectFetch(input?: Readonly<{
  fetchImpl?: LocalEndpointFetch
}>): LocalEndpointFetch | undefined {
  const fetchImpl = input?.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') return undefined

  return (url, init) => fetchImpl(url, init)
}

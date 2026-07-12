import { z } from 'zod'
import {
  resolveNetworkProxyForUrl,
  type NetworkProxySettings,
} from '../../src/shared/plugin-distribution/networkProxy'

export const compatibleProxyRouteSchema = z.object({
  proxyMode: z.enum(['system', 'manual', 'environment', 'direct']),
  manualProxyUrl: z.string().max(2048),
  noProxy: z.string().max(4096),
  strictSSL: z.literal(true),
}).strict()

export type CompatibleProxyRoute = z.infer<typeof compatibleProxyRouteSchema>['proxyMode']
export type CompatibleTransportKind = 'electron_session_fetch' | 'node_undici'

export type CompatibleSelectedTransport = Readonly<{
  proxyRoute: CompatibleProxyRoute
  transportKind: CompatibleTransportKind
  bypassed: boolean
  dispatcher?: unknown
}>

export class CompatibleProxyRouteError extends Error {
  readonly code: 'compatible_proxy_route_invalid' | 'compatible_transport_unavailable'

  constructor(code: 'compatible_proxy_route_invalid' | 'compatible_transport_unavailable') {
    super(code)
    this.name = 'CompatibleProxyRouteError'
    this.code = code
  }
}

export function parseCompatibleProxyRoute(raw: unknown): NetworkProxySettings {
  const parsed = compatibleProxyRouteSchema.safeParse(raw)
  if (!parsed.success) throw new CompatibleProxyRouteError('compatible_proxy_route_invalid')
  return Object.freeze({ ...parsed.data })
}

export function selectCompatibleTransport(rawSettings: unknown, targetUrl: URL): CompatibleSelectedTransport {
  const settings = parseCompatibleProxyRoute(rawSettings)
  if (settings.proxyMode === 'system') {
    return Object.freeze({
      proxyRoute: 'system',
      transportKind: 'electron_session_fetch',
      bypassed: false,
    })
  }

  const resolved = resolveNetworkProxyForUrl(settings, targetUrl.toString())
  if (!resolved.ok || resolved.mode !== settings.proxyMode) {
    throw new CompatibleProxyRouteError('compatible_transport_unavailable')
  }
  return Object.freeze({
    proxyRoute: settings.proxyMode,
    transportKind: 'node_undici',
    bypassed: resolved.bypassed,
    ...(resolved.dispatcher ? { dispatcher: resolved.dispatcher } : {}),
  })
}

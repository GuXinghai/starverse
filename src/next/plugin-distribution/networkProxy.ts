import { EnvHttpProxyAgent, ProxyAgent, type Dispatcher } from 'undici'
import {
  normalizeNetworkProxySettings,
  type NetworkProxyDiagnosticCode,
  type NetworkProxyMode,
  type NetworkProxySettings,
} from './networkProxyShared'

export {
  DEFAULT_NETWORK_PROXY_SETTINGS,
  normalizeNetworkProxySettings,
  proxyModeLabel,
  proxyUrlContainsCredentials,
  redactProxyCredentialText,
} from './networkProxyShared'

export type {
  NetworkProxyDiagnosticCode,
  NetworkProxyMode,
  NetworkProxySettings,
} from './networkProxyShared'

export type NetworkProxyResolution =
  | Readonly<{
      ok: true
      mode: NetworkProxyMode
      dispatcher?: Dispatcher
      bypassed: boolean
      diagnosticCode?: NetworkProxyDiagnosticCode
    }>
  | Readonly<{
      ok: false
      mode: NetworkProxyMode
      diagnosticCode: NetworkProxyDiagnosticCode
      detail: string
    }>

export function resolveNetworkProxyForUrl(
  settings: NetworkProxySettings,
  targetUrl: string
): NetworkProxyResolution {
  const normalized = normalizeNetworkProxySettings(settings)
  if (!normalized.strictSSL) {
    return {
      ok: false,
      mode: normalized.proxyMode,
      diagnosticCode: 'proxy_strict_ssl_unsupported',
      detail: 'disabling TLS certificate verification is not supported for plugin downloads',
    }
  }
  if (matchesNoProxy(targetUrl, normalized.noProxy)) {
    return { ok: true, mode: normalized.proxyMode, bypassed: true }
  }
  if (normalized.proxyMode === 'direct') {
    return { ok: true, mode: 'direct', bypassed: false }
  }
  if (normalized.proxyMode === 'system') {
    return {
      ok: false,
      mode: 'system',
      diagnosticCode: 'proxy_system_unavailable',
      detail: 'system proxy is pending for Node downloader transport',
    }
  }
  if (normalized.proxyMode === 'environment') {
    return {
      ok: true,
      mode: 'environment',
      dispatcher: new EnvHttpProxyAgent(),
      bypassed: false,
    }
  }
  const manual = buildManualProxyDispatcher(normalized.manualProxyUrl)
  if (!manual.ok) return manual
  return { ok: true, mode: 'manual', dispatcher: manual.dispatcher, bypassed: false }
}

export function buildProxyFetchInit(
  settings: NetworkProxySettings | undefined,
  targetUrl: string,
  init: RequestInit = {}
): (RequestInit & { dispatcher?: Dispatcher }) | Extract<NetworkProxyResolution, { ok: false }> {
  if (!settings) return init as RequestInit & { dispatcher?: Dispatcher }
  const resolved = resolveNetworkProxyForUrl(settings, targetUrl)
  if (!resolved.ok) return resolved
  return {
    ...init,
    ...(resolved.dispatcher ? { dispatcher: resolved.dispatcher } : {}),
  } as RequestInit & { dispatcher?: Dispatcher }
}

export function isProxyFetchInitFailure(
  value: unknown
): value is Extract<NetworkProxyResolution, { ok: false }> {
  return Boolean(value && typeof value === 'object' && (value as { ok?: unknown }).ok === false)
}

function buildManualProxyDispatcher(proxyUrl: string): NetworkProxyResolution | Readonly<{ ok: true; dispatcher: Dispatcher }> {
  if (!proxyUrl) {
    return {
      ok: false,
      mode: 'manual',
      diagnosticCode: 'proxy_manual_failed',
      detail: 'manual proxy URL is required',
    }
  }
  let parsed: URL
  try {
    parsed = new URL(proxyUrl)
  } catch {
    return {
      ok: false,
      mode: 'manual',
      diagnosticCode: 'proxy_manual_failed',
      detail: 'manual proxy URL is invalid',
    }
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      mode: 'manual',
      diagnosticCode: 'proxy_auth_required',
      detail: 'proxy credentials require secure storage and are not accepted in the proxy URL',
    }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      mode: 'manual',
      diagnosticCode: 'proxy_manual_failed',
      detail: 'manual proxy supports HTTP and HTTPS proxy URLs only',
    }
  }
  return { ok: true, dispatcher: new ProxyAgent(proxyUrl) }
}

function matchesNoProxy(targetUrl: string, noProxy: string): boolean {
  if (!noProxy.trim()) return false
  let host = ''
  try {
    host = new URL(targetUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  const entries = noProxy
    .split(/[,\s]+/u)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  for (const entry of entries) {
    if (entry === '*') return true
    const normalized = entry.startsWith('.') ? entry.slice(1) : entry
    if (!normalized) continue
    if (host === normalized) return true
    if (host.endsWith(`.${normalized}`)) return true
  }
  return false
}

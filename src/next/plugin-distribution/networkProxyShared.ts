import { sanitizePluginDistributionText } from './sanitization'

export type NetworkProxyMode = 'system' | 'manual' | 'environment' | 'direct'

export type NetworkProxySettings = Readonly<{
  proxyMode: NetworkProxyMode
  manualProxyUrl: string
  noProxy: string
  strictSSL: boolean
}>

export type NetworkProxyDiagnosticCode =
  | 'proxy_probe_passed'
  | 'proxy_direct_failed'
  | 'proxy_environment_failed'
  | 'proxy_manual_failed'
  | 'proxy_system_unavailable'
  | 'system_proxy_probe_failed'
  | 'electron_net_transport_blocked'
  | 'proxy_auth_required'
  | 'proxy_connection_timeout'
  | 'asset_host_blocked'
  | 'range_supported'
  | 'range_failed'
  | 'metadata_reachable_head_failed'
  | 'proxy_strict_ssl_unsupported'

export const DEFAULT_NETWORK_PROXY_SETTINGS: NetworkProxySettings = {
  proxyMode: 'environment',
  manualProxyUrl: '',
  noProxy: '',
  strictSSL: true,
}

export function normalizeNetworkProxySettings(value: unknown): NetworkProxySettings {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const proxyMode = normalizeProxyMode(raw.proxyMode)
  return {
    proxyMode,
    manualProxyUrl: sanitizeManualProxyUrl(raw.manualProxyUrl),
    noProxy: sanitizeNoProxy(raw.noProxy),
    strictSSL: raw.strictSSL === undefined ? true : raw.strictSSL === true,
  }
}

export function redactProxyCredentialText(value: unknown): string {
  const text = String(value ?? '')
  if (!text) return ''
  return sanitizePluginDistributionText(
    text.replace(/([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+)(?::([^/@\s]+))?@/giu, '$1[redacted]@')
  ) ?? ''
}

export function proxyUrlContainsCredentials(value: unknown): boolean {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  try {
    const parsed = new URL(raw)
    return Boolean(parsed.username || parsed.password)
  } catch {
    return /:\/\/[^/@\s:]+:[^/@\s]+@/u.test(raw)
  }
}

export function proxyModeLabel(mode: NetworkProxyMode): string {
  if (mode === 'direct') return 'Direct'
  if (mode === 'environment') return 'Environment variables'
  if (mode === 'manual') return 'Manual'
  return 'System'
}

function normalizeProxyMode(value: unknown): NetworkProxyMode {
  if (value === 'system' || value === 'manual' || value === 'environment' || value === 'direct') return value
  return DEFAULT_NETWORK_PROXY_SETTINGS.proxyMode
}

function sanitizeManualProxyUrl(value: unknown): string {
  return String(value ?? '').trim().slice(0, 2048)
}

function sanitizeNoProxy(value: unknown): string {
  return String(value ?? '').trim().slice(0, 4096)
}

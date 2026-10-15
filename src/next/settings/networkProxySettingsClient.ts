import {
  normalizeNetworkProxySettings,
  type NetworkProxySettings,
  defaultBrowserProxySettings,
  type NetworkProxyConfiguration,
  type NetworkProxyDraftProbe,
  type NetworkProxyScope,
} from '@/shared/plugin-distribution/networkProxyShared'

export type LibreOfficeProxyProbeResult = Readonly<{
  ok: boolean
  proxyMode: NetworkProxySettings['proxyMode']
  metadataReachable: boolean
  assetFound: boolean
  headPassed: boolean
  contentLength: 'match' | 'mismatch' | 'unavailable'
  redirectHostAllowed: boolean
  rangePassed: boolean
  terminalDiagnostic: string
}>

type ProxyBridge = NonNullable<Window['networkProxy']>

function requireProxyBridge(): Required<Pick<ProxyBridge, 'getSettings' | 'updateSettings'>> & ProxyBridge {
  const bridge = (globalThis as typeof globalThis & { networkProxy?: ProxyBridge }).networkProxy
  if (!bridge || typeof bridge.getSettings !== 'function' || typeof bridge.updateSettings !== 'function') {
    throw new Error('Missing epoch-2 network proxy bridge')
  }
  return bridge as Required<Pick<ProxyBridge, 'getSettings' | 'updateSettings'>> & ProxyBridge
}

export async function getNetworkProxySettings(): Promise<NetworkProxySettings> {
  const result = await requireProxyBridge().getSettings()
  if (!result.ok) throw new Error(result.code)
  return normalizeNetworkProxySettings(result.settings)
}

export async function setNetworkProxySettings(value: NetworkProxySettings): Promise<boolean> {
  const result = await requireProxyBridge().updateSettings(normalizeNetworkProxySettings(value))
  if (!result.ok) throw new Error(result.code)
  return true
}

export async function getProxyConfiguration() {
  const bridge = requireProxyBridge()
  if (bridge.getConfiguration) return bridge.getConfiguration()
  return { ok: true, configuration: { application: await getNetworkProxySettings(), browser: defaultBrowserProxySettings() }, states: null }
}

export async function saveProxyConfiguration(configuration: NetworkProxyConfiguration) {
  const bridge = requireProxyBridge()
  if (!bridge.updateConfiguration) throw new Error('proxy_configuration_bridge_unavailable')
  const result = await bridge.updateConfiguration(configuration)
  if (!result.ok) throw new Error(result.code)
  return result
}

export async function getProxyEnvironment() {
  return await requireProxyBridge().getEnvironment?.() ?? {}
}

export async function probeProxyDraft(input: NetworkProxyDraftProbe) {
  const bridge = requireProxyBridge()
  if (!bridge.probeDraft) throw new Error('proxy_probe_unavailable')
  return bridge.probeDraft(input)
}

export async function cancelProxyProbe(id: string) {
  await requireProxyBridge().cancelProbe?.(id)
}

export async function reapplyProxySettings(scope: NetworkProxyScope) {
  const bridge = requireProxyBridge()
  if (!bridge.reapplySettings) throw new Error('proxy_configuration_bridge_unavailable')
  const result = await bridge.reapplySettings({ scope })
  if (!result.ok) throw new Error(result.code)
}

export async function resetProxySettings(scope: NetworkProxyScope) {
  const bridge = requireProxyBridge()
  if (!bridge.resetSettings) throw new Error('proxy_configuration_bridge_unavailable')
  const result = await bridge.resetSettings({ scope })
  if (!result.ok) throw new Error(result.code)
}

export async function probeLibreOfficeOfficialDownloadNetwork(): Promise<LibreOfficeProxyProbeResult> {
  const bridge = (globalThis as typeof globalThis & { generationV2?: Window['generationV2'] }).generationV2?.plugins
  if (!bridge || typeof bridge.probeLibreOfficeDownload !== 'function') {
    return failedProbe('environment', 'proxy_probe_unavailable')
  }
  try {
    return normalizeProbeResult(await bridge.probeLibreOfficeDownload())
  } catch (error) {
    const settings = await getNetworkProxySettings().catch(() => normalizeNetworkProxySettings(undefined))
    return failedProbe(settings.proxyMode, error instanceof Error ? error.message : 'proxy_probe_failed')
  }
}

function failedProbe(
  proxyMode: NetworkProxySettings['proxyMode'],
  terminalDiagnostic: string,
): LibreOfficeProxyProbeResult {
  return Object.freeze({ ok: false, proxyMode, metadataReachable: false, assetFound: false,
    headPassed: false, contentLength: 'unavailable', redirectHostAllowed: false, rangePassed: false,
    terminalDiagnostic: String(terminalDiagnostic || 'proxy_probe_failed').slice(0, 120) })
}

function normalizeProbeResult(raw: any): LibreOfficeProxyProbeResult {
  const settings = normalizeNetworkProxySettings({ proxyMode: raw?.proxyMode })
  const contentLength = raw?.contentLength === 'match' || raw?.contentLength === 'mismatch'
    ? raw.contentLength
    : 'unavailable'
  return Object.freeze({
    ok: raw?.ok === true,
    proxyMode: settings.proxyMode,
    metadataReachable: raw?.metadataReachable === true,
    assetFound: raw?.assetFound === true,
    headPassed: raw?.headPassed === true,
    contentLength,
    redirectHostAllowed: raw?.redirectHostAllowed === true,
    rangePassed: raw?.rangePassed === true,
    terminalDiagnostic: String(raw?.terminalDiagnostic ?? 'proxy_probe_failed').trim().slice(0, 120),
  })
}

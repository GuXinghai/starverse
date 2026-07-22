import {
  normalizeNetworkProxySettings,
  type NetworkProxySettings,
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

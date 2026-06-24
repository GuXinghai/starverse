import { decodeBooleanAck } from '@/next/ipc/contracts/dbBridgeContracts'
import {
  DEFAULT_NETWORK_PROXY_SETTINGS,
  normalizeNetworkProxySettings,
  type NetworkProxySettings,
} from '@/next/plugin-distribution/networkProxyShared'

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

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

type ElectronApi = Readonly<{
  probeLibreOfficeSystemProxyDownloadNetwork?: () => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function getElectronApi(): ElectronApi | null {
  const api = (globalThis as any).electronAPI as ElectronApi | undefined
  return api && typeof api.probeLibreOfficeSystemProxyDownloadNetwork === 'function' ? api : null
}

export async function getNetworkProxySettings(): Promise<NetworkProxySettings> {
  const bridge = getDbBridge()
  if (!bridge) return DEFAULT_NETWORK_PROXY_SETTINGS
  const raw = await bridge.invoke('settings.getNetworkProxySettings')
  return normalizeNetworkProxySettings(raw?.value)
}

export async function setNetworkProxySettings(value: NetworkProxySettings): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return false
  const raw = await bridge.invoke('settings.setNetworkProxySettings', {
    value: normalizeNetworkProxySettings(value),
  })
  return decodeBooleanAck('settings.setNetworkProxySettings', raw)
}

export async function probeLibreOfficeOfficialDownloadNetwork(): Promise<LibreOfficeProxyProbeResult> {
  const bridge = getDbBridge()
  if (!bridge) {
    return {
      ok: false,
      proxyMode: DEFAULT_NETWORK_PROXY_SETTINGS.proxyMode,
      metadataReachable: false,
      assetFound: false,
      headPassed: false,
      contentLength: 'unavailable',
      redirectHostAllowed: false,
      rangePassed: false,
      terminalDiagnostic: 'proxy_probe_unavailable',
    }
  }
  const settings = await getNetworkProxySettings()
  if (settings.proxyMode === 'system') {
    const electronApi = getElectronApi()
    if (!electronApi?.probeLibreOfficeSystemProxyDownloadNetwork) {
      return {
        ok: false,
        proxyMode: 'system',
        metadataReachable: false,
        assetFound: false,
        headPassed: false,
        contentLength: 'unavailable',
        redirectHostAllowed: false,
        rangePassed: false,
        terminalDiagnostic: 'electron_net_transport_blocked',
      }
    }
    return normalizeProbeResult(await electronApi.probeLibreOfficeSystemProxyDownloadNetwork())
  }
  const raw = await bridge.invoke('enginePluginLifecycle.probeLibreOfficeOfficialDownloadNetwork')
  return normalizeProbeResult(raw)
}

function normalizeProbeResult(raw: any): LibreOfficeProxyProbeResult {
  const settings = normalizeNetworkProxySettings({ proxyMode: raw?.proxyMode })
  const contentLength = raw?.contentLength === 'match' || raw?.contentLength === 'mismatch'
    ? raw.contentLength
    : 'unavailable'
  return {
    ok: raw?.ok === true,
    proxyMode: settings.proxyMode,
    metadataReachable: raw?.metadataReachable === true,
    assetFound: raw?.assetFound === true,
    headPassed: raw?.headPassed === true,
    contentLength,
    redirectHostAllowed: raw?.redirectHostAllowed === true,
    rangePassed: raw?.rangePassed === true,
    terminalDiagnostic: String(raw?.terminalDiagnostic ?? 'proxy_probe_failed').trim().slice(0, 120),
  }
}

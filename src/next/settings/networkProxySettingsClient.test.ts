import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeLibreOfficeOfficialDownloadNetwork } from './networkProxySettingsClient'

const originalDbBridge = (globalThis as any).dbBridge
const originalElectronApi = (globalThis as any).electronAPI

afterEach(() => {
  ;(globalThis as any).dbBridge = originalDbBridge
  ;(globalThis as any).electronAPI = originalElectronApi
  vi.restoreAllMocks()
})

describe('networkProxySettingsClient', () => {
  it('uses the DB worker diagnostic for manual proxy mode', async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === 'settings.getNetworkProxySettings') {
        return { value: { proxyMode: 'manual', manualProxyUrl: 'http://127.0.0.1:7890', noProxy: '', strictSSL: true } }
      }
      if (method === 'enginePluginLifecycle.probeLibreOfficeOfficialDownloadNetwork') {
        return {
          ok: true,
          proxyMode: 'manual',
          metadataReachable: true,
          assetFound: true,
          headPassed: true,
          contentLength: 'match',
          redirectHostAllowed: true,
          rangePassed: true,
          terminalDiagnostic: 'proxy_probe_passed',
        }
      }
      throw new Error(`unexpected method ${method}`)
    })
    const systemProbe = vi.fn()
    ;(globalThis as any).dbBridge = { invoke }
    ;(globalThis as any).electronAPI = { probeLibreOfficeSystemProxyDownloadNetwork: systemProbe }

    const result = await probeLibreOfficeOfficialDownloadNetwork()

    expect(result).toMatchObject({ ok: true, proxyMode: 'manual', terminalDiagnostic: 'proxy_probe_passed' })
    expect(invoke).toHaveBeenCalledWith('enginePluginLifecycle.probeLibreOfficeOfficialDownloadNetwork')
    expect(systemProbe).not.toHaveBeenCalled()
  })

  it('uses Electron-net diagnostic for system proxy mode', async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === 'settings.getNetworkProxySettings') {
        return { value: { proxyMode: 'system', manualProxyUrl: '', noProxy: '', strictSSL: true } }
      }
      throw new Error(`unexpected method ${method}`)
    })
    const systemProbe = vi.fn(async () => ({
      ok: true,
      proxyMode: 'system',
      metadataReachable: true,
      assetFound: true,
      headPassed: true,
      contentLength: 'match',
      redirectHostAllowed: true,
      rangePassed: true,
      terminalDiagnostic: 'proxy_probe_passed',
    }))
    ;(globalThis as any).dbBridge = { invoke }
    ;(globalThis as any).electronAPI = { probeLibreOfficeSystemProxyDownloadNetwork: systemProbe }

    const result = await probeLibreOfficeOfficialDownloadNetwork()

    expect(result).toMatchObject({ ok: true, proxyMode: 'system', terminalDiagnostic: 'proxy_probe_passed' })
    expect(systemProbe).toHaveBeenCalledTimes(1)
    expect(invoke).not.toHaveBeenCalledWith('enginePluginLifecycle.probeLibreOfficeOfficialDownloadNetwork')
  })

  it('fails closed when system proxy mode lacks Electron-net transport', async () => {
    const invoke = vi.fn(async () => ({
      value: { proxyMode: 'system', manualProxyUrl: '', noProxy: '', strictSSL: true },
    }))
    ;(globalThis as any).dbBridge = { invoke }
    ;(globalThis as any).electronAPI = {}

    const result = await probeLibreOfficeOfficialDownloadNetwork()

    expect(result).toMatchObject({
      ok: false,
      proxyMode: 'system',
      terminalDiagnostic: 'electron_net_transport_blocked',
    })
  })
})

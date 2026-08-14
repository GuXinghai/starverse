import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeLibreOfficeOfficialDownloadNetwork } from './networkProxySettingsClient'
import { installGenerationV2TestBridge } from '../../../tests/helpers/generationV2Bridge'

const originalGenerationV2 = (globalThis as any).generationV2
const originalNetworkProxy = (globalThis as any).networkProxy

afterEach(() => {
  ;(globalThis as any).generationV2 = originalGenerationV2
  ;(globalThis as any).networkProxy = originalNetworkProxy
  vi.restoreAllMocks()
})

describe('networkProxySettingsClient', () => {
  it('uses the Generation V2 plugin diagnostic for manual proxy mode', async () => {
    const bridge = installGenerationV2TestBridge()
    const probe = vi.fn(async () => ({
      ok: true,
      proxyMode: 'manual',
      metadataReachable: true,
      assetFound: true,
      headPassed: true,
      contentLength: 'match',
      redirectHostAllowed: true,
      rangePassed: true,
      terminalDiagnostic: 'proxy_probe_passed',
    }))
    ;(bridge.plugins as any).probeLibreOfficeDownload = probe

    const result = await probeLibreOfficeOfficialDownloadNetwork()

    expect(result).toMatchObject({ ok: true, proxyMode: 'manual', terminalDiagnostic: 'proxy_probe_passed' })
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('uses Generation V2 plugin diagnostic for system proxy mode', async () => {
    const bridge = installGenerationV2TestBridge()
    const probe = vi.fn(async () => ({
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
    ;(bridge.plugins as any).probeLibreOfficeDownload = probe

    const result = await probeLibreOfficeOfficialDownloadNetwork()

    expect(result).toMatchObject({ ok: true, proxyMode: 'system', terminalDiagnostic: 'proxy_probe_passed' })
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('fails closed when system proxy mode lacks Electron-net transport', async () => {
    const bridge = installGenerationV2TestBridge()
    ;(bridge.plugins as any).probeLibreOfficeDownload = vi.fn(async () => { throw new Error('electron_net_transport_blocked') })
    ;(globalThis as any).networkProxy = {
      getSettings: vi.fn(async () => ({ ok: true, settings: { proxyMode: 'system', manualProxyUrl: '', noProxy: '', strictSSL: true } })),
      updateSettings: vi.fn(),
    }

    const result = await probeLibreOfficeOfficialDownloadNetwork()

    expect(result).toMatchObject({
      ok: false,
      proxyMode: 'system',
      terminalDiagnostic: 'electron_net_transport_blocked',
    })
  })
})

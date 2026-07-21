import { describe, expect, it, vi } from 'vitest'
import { registerEnginePluginLifecycleV2Ipc } from './enginePluginLifecycleV2Ipc'

function harness() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const lifecycle = {
    listOfficialPlugins: vi.fn(async (value) => value), getInstalledPlugins: vi.fn(() => []),
    registerLocalOfficialPlugin: vi.fn(async (value) => value), installOfficialPlugin: vi.fn(async (value) => value),
    getInstallOperationStatus: vi.fn((value) => value), cancelInstallOperation: vi.fn(async (value) => value),
    enablePlugin: vi.fn(async (value) => value), disablePlugin: vi.fn((value) => value), uninstallPlugin: vi.fn((value) => value),
    runHealthCheck: vi.fn(async (value) => value), registerLocalPackage: vi.fn(async (value) => value),
    quarantineDfcLibreOfficeRuntime: vi.fn(async () => ({ ok: true })), getDiagnosticsSummary: vi.fn(() => ({ engines: [] })),
    probeLibreOfficeOfficialDownloadNetwork: vi.fn(() => ({ ok: true })),
  }
  registerEnginePluginLifecycleV2Ipc({ registerInvoke: (channel, handler) => handlers.set(channel, handler), lifecycle: lifecycle as never })
  return { handlers, lifecycle }
}

describe('epoch-2 engine plugin lifecycle IPC', () => {
  it('passes the second ipcMain.handle argument to the fixed lifecycle command', async () => {
    const { handlers, lifecycle } = harness()
    const handler = handlers.get('generation-v2:plugins:install-official')
    await expect(handler?.({ sender: 'event' }, { pluginId: 'magika', pluginVersion: '1.0.0', enabled: true }))
      .resolves.toEqual({ pluginId: 'magika', pluginVersion: '1.0.0', enabled: true })
    expect(lifecycle.installOfficialPlugin).toHaveBeenCalledWith({ pluginId: 'magika', pluginVersion: '1.0.0', enabled: true })
  })

  it('registers only fixed operation channels and keeps LibreOffice package paths behind dialog IPC', () => {
    const { handlers } = harness()
    expect(handlers.has('generation-v2:plugins:import-libreoffice-svpkg')).toBe(false)
    expect([...handlers.keys()]).toEqual(expect.arrayContaining([
      'generation-v2:plugins:list-official', 'generation-v2:plugins:list-installed',
      'generation-v2:plugins:install-official', 'generation-v2:plugins:cancel-install',
      'generation-v2:plugins:enable', 'generation-v2:plugins:disable',
      'generation-v2:plugins:uninstall', 'generation-v2:plugins:health',
      'generation-v2:plugins:diagnostics',
    ]))
  })

  it('rejects malformed and unknown command payloads before lifecycle execution', async () => {
    const { handlers, lifecycle } = harness()
    const handler = handlers.get('generation-v2:plugins:enable')!
    await expect(handler({}, { engineId: 'magika', ignored: true })).rejects.toThrow('GENERATION_V2_PLUGIN_IPC_INVALID_PAYLOAD')
    await expect(handler({}, ['magika'])).rejects.toThrow('GENERATION_V2_PLUGIN_IPC_INVALID_PAYLOAD')
    expect(lifecycle.enablePlugin).not.toHaveBeenCalled()
  })
})

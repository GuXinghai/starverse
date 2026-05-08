import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EnginePluginSettingsPanel from './EnginePluginSettingsPanel.vue'

function createDbBridgeMock(outputs?: {
  listOfficialPlugins?: unknown
  listInstalledPlugins?: unknown
  registerLocalOfficialPlugin?: unknown
  enablePlugin?: unknown
  disablePlugin?: unknown
  uninstallPlugin?: unknown
  runHealthCheck?: unknown
}) {
  const invoke = vi.fn(async (method: string, _params?: unknown) => {
    if (method === 'enginePluginLifecycle.listOfficialPlugins') {
      return outputs?.listOfficialPlugins ?? { ok: true, value: [] }
    }
    if (method === 'enginePluginLifecycle.listInstalledPlugins') {
      return outputs?.listInstalledPlugins ?? []
    }
    if (method === 'enginePluginLifecycle.registerLocalOfficialPlugin') {
      return outputs?.registerLocalOfficialPlugin ?? {
        ok: true,
        value: { engineId: 'magika', displayName: 'Test', pluginVersion: '1.0.0', manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null, installState: 'installed', enabled: false, healthStatus: 'unknown', failureReason: null, installSource: 'official_catalog', installRootKind: 'test_root', installedAt: 1, updatedAt: 2, lastVerifiedAt: 2, lastHealthCheckAt: null },
      }
    }
    if (method === 'enginePluginLifecycle.enablePlugin') {
      return outputs?.enablePlugin ?? { ok: true, value: { engineId: 'magika', enabled: true, installState: 'installed' } }
    }
    if (method === 'enginePluginLifecycle.disablePlugin') {
      return outputs?.disablePlugin ?? { ok: true, value: { engineId: 'magika', enabled: false, installState: 'installed' } }
    }
    if (method === 'enginePluginLifecycle.uninstallPlugin') {
      return outputs?.uninstallPlugin ?? { ok: true, value: { engineId: 'magika', installState: 'uninstalled' } }
    }
    if (method === 'enginePluginLifecycle.runHealthCheck') {
      return outputs?.runHealthCheck ?? { ok: true, value: { engineId: 'magika', healthStatus: 'healthy' } }
    }
    return { ok: true }
  })
  return { invoke }
}

// eslint-disable-next-line max-lines-per-function
describe('EnginePluginSettingsPanel', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
  })

  it('shows trusted root unconfigured status', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: false, reason: 'official_trusted_root_unconfigured', message: 'not configured' },
    })

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText(/官方插件信任根未配置/)).toBeTruthy()
    })
  })

  it('displays official plugin list when available', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [{ pluginId: 'magika', pluginVersion: '0.1.0', catalogGeneratedAt: '2026-05-08T00:00:00.000Z', installState: 'not_installed', enabled: false }],
      },
      listInstalledPlugins: [],
    })

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('magika')).toBeTruthy()
    })
    expect(screen.getByText(/not installed/)).toBeTruthy()
  })

  it('shows installed plugin state with health status', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: 'magika-v3',
        installState: 'installed', enabled: true, healthStatus: 'healthy',
        failureReason: null, installSource: 'official_catalog', installRootKind: 'managed_root',
        installedAt: 1, updatedAt: 2, lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
    })

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('Magika Plugin')).toBeTruthy()
    })
    expect(screen.getByText('healthy')).toBeTruthy()
    expect(screen.getByText(/magika v1\.0\.0/)).toBeTruthy()
  })

  it('shows failure reason for failed plugins', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'failed', enabled: false, healthStatus: 'unhealthy',
        failureReason: 'health_check_failed', installSource: 'official_catalog',
        installRootKind: 'managed_root', installedAt: 1, updatedAt: 2,
        lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
    })

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('health_check_failed')).toBeTruthy()
    })
  })

  it('does not render installRef in output', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [],
    })

    const { container } = render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('Official Engines')).toBeTruthy()
    })

    expect(container.textContent).not.toContain('installRef')
    expect(container.textContent).not.toContain('manifestHash')
    expect(container.textContent).not.toContain('packageSha256')
    expect(container.textContent).not.toContain('contentToken')
    expect(container.textContent).not.toContain('fullHash')
  })

  it('calls enablePlugin via dbBridge when Enable clicked', async () => {
    const user = userEvent.setup()
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'installed', enabled: false, healthStatus: 'healthy',
        failureReason: null, installSource: 'official_catalog', installRootKind: 'managed_root',
        installedAt: 1, updatedAt: 2, lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
      enablePlugin: { ok: true, value: { engineId: 'magika', enabled: true, installState: 'installed' } },
    })
    ;(globalThis as any).dbBridge = bridge

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('Enable')).toBeTruthy()
    })

    await user.click(screen.getByText('Enable'))

    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.enablePlugin', { engineId: 'magika' })
    })
  })

  it('calls disablePlugin via dbBridge when Disable clicked', async () => {
    const user = userEvent.setup()
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'installed', enabled: true, healthStatus: 'healthy',
        failureReason: null, installSource: 'official_catalog', installRootKind: 'managed_root',
        installedAt: 1, updatedAt: 2, lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
    })
    ;(globalThis as any).dbBridge = bridge

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeTruthy()
    })

    await user.click(screen.getByText('Disable'))

    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.disablePlugin', { engineId: 'magika' })
    })
  })

  it('calls uninstallPlugin via dbBridge when Uninstall clicked', async () => {
    const user = userEvent.setup()
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'installed', enabled: true, healthStatus: 'healthy',
        failureReason: null, installSource: 'official_catalog', installRootKind: 'managed_root',
        installedAt: 1, updatedAt: 2, lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
    })
    ;(globalThis as any).dbBridge = bridge

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('Uninstall')).toBeTruthy()
    })

    await user.click(screen.getByText('Uninstall'))

    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.uninstallPlugin', { engineId: 'magika' })
    })
  })

  it('calls runHealthCheck via dbBridge when Health Check clicked', async () => {
    const user = userEvent.setup()
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'installed', enabled: true, healthStatus: 'healthy',
        failureReason: null, installSource: 'official_catalog', installRootKind: 'managed_root',
        installedAt: 1, updatedAt: 2, lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
    })
    ;(globalThis as any).dbBridge = bridge

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('Health Check')).toBeTruthy()
    })

    await user.click(screen.getByText('Health Check'))

    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.runHealthCheck', { engineId: 'magika' })
    })
  })
})

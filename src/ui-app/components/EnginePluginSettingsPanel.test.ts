import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EnginePluginSettingsPanel from './EnginePluginSettingsPanel.vue'

function officialPlugin(overrides?: Record<string, unknown>) {
  return {
    pluginId: 'magika',
    displayName: 'Magika',
    publisher: 'Google Magika',
    pluginVersion: '0.1.0',
    availableVersion: '0.1.0',
    runtimeKind: 'managed',
    capabilities: ['file_identification'],
    platformCompatibility: { declaredPlatform: 'win32', compatible: true },
    architectureCompatibility: { declaredArchitecture: 'x64', compatible: true },
    appVersionCompatibility: { declaredRange: '>=0.0.0', compatible: true },
    modelVersion: 'standard_v3_3',
    packageSizeBytes: 1234,
    catalogGeneratedAt: '2026-05-08T00:00:00.000Z',
    installState: 'not_installed',
    enabled: false,
    recommendedInstallRootKind: 'managed_root',
    catalogStatus: 'valid_metadata_only',
    verificationMetadataStatus: 'metadata_present_crypto_deferred',
    installabilityStatus: 'metadata_compatible_future_install',
    reasons: ['read_only_catalog_no_install_action'],
    warnings: [],
    releaseProvenance: releaseProvenance(),
    ...overrides,
  }
}

function releaseProvenance(overrides?: Record<string, unknown>) {
  return {
    pluginId: 'magika',
    packageVersion: '0.1.0',
    runtimeVersion: null,
    modelVersion: 'standard_v3_3',
    packageFormatVersion: 1,
    manifestSchemaVersion: '1',
    inventorySchemaVersion: '1',
    packageSha256: 'a'.repeat(64),
    packageSizeBytes: 1234,
    manifestSha256: 'b'.repeat(64),
    inventorySha256: 'c'.repeat(64),
    releaseUrl: 'https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v0.1.0/test.zip',
    releaseTag: 'starverse-plugin-magika-v0.1.0',
    assetName: 'test.zip',
    trustKeyId: 'starverse-test-key',
    signedAt: '2026-05-14T00:00:00.000Z',
    expiresAt: '2027-05-14T00:00:00.000Z',
    channel: 'stable',
    platform: 'win32',
    arch: 'x64',
    ...overrides,
  }
}

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
    vi.restoreAllMocks()
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
        value: [officialPlugin()],
      },
      listInstalledPlugins: [],
    })

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('magika')).toBeTruthy()
    })
    expect(screen.getByText(/not installed/)).toBeTruthy()
  })

  it('displays official release provenance for catalog and installed plugins', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [officialPlugin()],
      },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '0.1.0',
        installedVersion: '0.1.0', availableVersion: '0.1.0', packageVersion: '0.1.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', runtimeVersion: null, modelVersion: 'standard_v3_3',
        installState: 'installed', enabled: true, healthStatus: 'healthy',
        failureReason: null, installSource: 'official_catalog', installRootKind: 'managed_root',
        installedAt: 1, updatedAt: 2, lastVerifiedAt: 2, lastHealthCheckAt: 3,
        errorChain: null, releaseProvenance: releaseProvenance(), previousKnownGood: null,
      }],
    })

    render(EnginePluginSettingsPanel)

    expect((await screen.findAllByText('Available version: 0.1.0')).length).toBeGreaterThanOrEqual(1)
    await waitFor(() => {
      expect(screen.getByText('Installed version: 0.1.0')).toBeTruthy()
    })
    expect(screen.getAllByText('Model: standard_v3_3').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Signature key: starverse-test-key').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Package hash: aaaaaaaa...').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Status: Up to date')).toBeTruthy()
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

  it('shows layered failure chain with specific primary reason for failed plugins', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'failed', enabled: false, healthStatus: 'unhealthy',
        failureReason: 'magika_runtime_missing_dependency',
        errorChain: {
          operationLayer: { code: 'health_check_failed' },
          healthLayer: { outcome: 'unhealthy_result', stage: 'runtime_self_test' },
          runtimeLayer: { reason: 'magika_runtime_missing_dependency' },
          rootCauseLayer: { sanitizedRootCause: 'ERR_MODULE_NOT_FOUND' },
        },
        installSource: 'official_catalog',
        installRootKind: 'managed_root', installedAt: 1, updatedAt: 2,
        lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
    })

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('magika_runtime_missing_dependency')).toBeTruthy()
    })
    expect(screen.queryByText('Operation: health_check_failed')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByText('Operation: health_check_failed')).toBeTruthy()
    expect(screen.getByText('Health result: unhealthy_result')).toBeTruthy()
    expect(screen.getByText('Health stage: runtime_self_test')).toBeTruthy()
    expect(screen.getByText('Runtime reason: magika_runtime_missing_dependency')).toBeTruthy()
    expect(screen.getByText('Root cause: ERR_MODULE_NOT_FOUND')).toBeTruthy()
  })

  it('does not show health_check_failed as the only visible error when specific layers are missing', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'failed', enabled: false, healthStatus: 'unhealthy',
        failureReason: 'health_check_failed',
        errorChain: {
          operationLayer: { code: 'health_check_failed' },
          healthLayer: { outcome: null, stage: null },
          runtimeLayer: { reason: null },
          rootCauseLayer: { sanitizedRootCause: null },
        },
        installSource: 'official_catalog',
        installRootKind: 'managed_root', installedAt: 1, updatedAt: 2,
        lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
    })

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('Unknown Error')).toBeTruthy()
    })
    expect(screen.queryByText('Operation: health_check_failed')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByText('Operation: health_check_failed')).toBeTruthy()
    expect(screen.getByText('Health result: Unknown Error')).toBeTruthy()
    expect(screen.getByText('Health stage: Unknown Error')).toBeTruthy()
    expect(screen.getByText('Runtime reason: Unknown Error')).toBeTruthy()
    expect(screen.getByText('Root cause: Unknown Error')).toBeTruthy()
  })

  it('uses a specific root cause as the primary error when runtime reason is missing', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'failed', enabled: false, healthStatus: 'unhealthy',
        failureReason: 'health_check_failed',
        errorChain: {
          operationLayer: { code: 'health_check_failed' },
          healthLayer: { outcome: null, stage: null },
          runtimeLayer: { reason: null },
          rootCauseLayer: { sanitizedRootCause: 'ERR_MODULE_NOT_FOUND' },
        },
        installSource: 'official_catalog',
        installRootKind: 'managed_root', installedAt: 1, updatedAt: 2,
        lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
    })

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('ERR_MODULE_NOT_FOUND')).toBeTruthy()
    })
  })

  it('does not render a Details entry when no layered error chain exists', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'failed', enabled: false, healthStatus: 'unhealthy',
        failureReason: 'magika_runtime_missing_dependency',
        errorChain: null,
        installSource: 'official_catalog',
        installRootKind: 'managed_root', installedAt: 1, updatedAt: 2,
        lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
    })

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('magika_runtime_missing_dependency')).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull()
    expect(screen.queryByText('Operation: Unknown Error')).toBeNull()
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

  it('shows managed uninstall confirmation before calling uninstallPlugin', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
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
      expect(screen.getByText('Uninstall plugin')).toBeTruthy()
    })

    await user.click(screen.getByText('Uninstall plugin'))

    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.uninstallPlugin', { engineId: 'magika' })
    })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('delete Starverse-managed Magika plugin files'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('owned stage/tmp/rollback remnants'))
  })

  it('shows local package registration removal without promising file deletion', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika-local', displayName: 'Magika Local', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'installed', enabled: true, healthStatus: 'healthy',
        failureReason: null, installSource: 'local_package', installRootKind: 'test_root',
        installedAt: 1, updatedAt: 2, lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
    })
    ;(globalThis as any).dbBridge = bridge

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('Remove registration')).toBeTruthy()
    })

    await user.click(screen.getByText('Remove registration'))

    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.uninstallPlugin', { engineId: 'magika-local' })
    })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('will not delete external plugin files'))
    expect(confirm.mock.calls[0]?.[0]).not.toMatch(/delete Starverse-managed/u)
  })

  it('shows specific uninstall failure reason from action error chain', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [{
        engineId: 'magika', displayName: 'Magika Plugin', pluginVersion: '1.0.0',
        manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null,
        installState: 'installed', enabled: true, healthStatus: 'healthy',
        failureReason: null, installSource: 'official_catalog', installRootKind: 'managed_root',
        installedAt: 1, updatedAt: 2, lastVerifiedAt: 2, lastHealthCheckAt: 3,
      }],
      uninstallPlugin: {
        ok: false,
        reason: 'cleanup_failed',
        message: 'state=failed',
        errorChain: {
          operationLayer: { code: 'cleanup_failed' },
          healthLayer: { outcome: null, stage: null },
          runtimeLayer: { reason: 'magika_runtime_missing_dependency' },
          rootCauseLayer: { sanitizedRootCause: 'ERR_MODULE_NOT_FOUND' },
        },
      },
    })
    ;(globalThis as any).dbBridge = bridge

    render(EnginePluginSettingsPanel)

    await user.click(await screen.findByText('Uninstall plugin'))

    await waitFor(() => {
      expect(screen.getByText('magika_runtime_missing_dependency')).toBeTruthy()
    })
    expect(screen.queryByText(/Uninstall plugin: magika/u)).toBeNull()
  })

  it('passes recommendedInstallRootKind from response to register request', async () => {
    const user = userEvent.setup()
    const bridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [officialPlugin()],
      },
      listInstalledPlugins: [],
      registerLocalOfficialPlugin: {
        ok: true,
        value: { engineId: 'magika', displayName: 'Test', pluginVersion: '1.0.0', manifestSchemaVersion: '1', runtimeKind: 'local_loader', modelVersion: null, installState: 'installed', enabled: false, healthStatus: 'unknown', failureReason: null, installSource: 'official_catalog', installRootKind: 'managed_root', installedAt: 1, updatedAt: 2, lastVerifiedAt: 2, lastHealthCheckAt: null },
      },
    })
    ;(globalThis as any).dbBridge = bridge

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('Register')).toBeTruthy()
    })

    await user.click(screen.getByText('Register'))

    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith(
        'enginePluginLifecycle.registerLocalOfficialPlugin',
        expect.objectContaining({ installRootKind: 'managed_root' })
      )
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

  it('shows the runtime reason from failed health check action result', async () => {
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
      runHealthCheck: {
        ok: false,
        reason: 'health_check_failed',
        message: 'state=failed',
        errorChain: {
          operationLayer: { code: 'health_check_failed' },
          healthLayer: { outcome: 'unhealthy_result', stage: 'runtime_self_test' },
          runtimeLayer: { reason: 'magika_runtime_missing_dependency' },
          rootCauseLayer: { sanitizedRootCause: 'ERR_MODULE_NOT_FOUND' },
        },
      },
    })
    ;(globalThis as any).dbBridge = bridge

    render(EnginePluginSettingsPanel)

    await waitFor(() => {
      expect(screen.getByText('Health Check')).toBeTruthy()
    })

    await user.click(screen.getByText('Health Check'))

    await waitFor(() => {
      expect(screen.getByText('magika_runtime_missing_dependency')).toBeTruthy()
    })
  })
})

/* eslint-disable max-lines-per-function */
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PluginManagementPanel from './PluginManagementPanel.vue'

function createDbBridgeMock(outputs?: {
  listOfficialPlugins?: unknown
  listInstalledPlugins?: unknown
  getDiagnosticsSummary?: unknown
  installOfficialPlugin?: unknown
  getInstallOperationStatus?: unknown
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
    if (method === 'enginePluginLifecycle.getDiagnosticsSummary') {
      return outputs?.getDiagnosticsSummary ?? {
        engines: [],
        counts: { total: 0, installed: 0, enabled: 0, healthy: 0, failed: 0, unverified: 0 },
      }
    }
    if (method === 'enginePluginLifecycle.installOfficialPlugin') {
      return outputs?.installOfficialPlugin ?? {
        ok: true,
        value: installOperation({
          operationId: 'official-install-magika-0.1.0-1',
          pluginId: 'magika',
          pluginVersion: '0.1.0',
          state: 'pending',
        }),
      }
    }
    if (method === 'enginePluginLifecycle.getInstallOperationStatus') {
      return outputs?.getInstallOperationStatus ?? { ok: true, value: null }
    }
    if (method === 'enginePluginLifecycle.enablePlugin') {
      return outputs?.enablePlugin ?? {
        ok: true,
        value: installedPlugin({ enabled: true, installState: 'installed', healthStatus: 'healthy' }),
      }
    }
    if (method === 'enginePluginLifecycle.disablePlugin') {
      return outputs?.disablePlugin ?? {
        ok: true,
        value: installedPlugin({ enabled: false, healthStatus: 'unknown' }),
      }
    }
    if (method === 'enginePluginLifecycle.uninstallPlugin') {
      return outputs?.uninstallPlugin ?? {
        ok: true,
        value: installedPlugin({ installState: 'uninstalled', enabled: false }),
      }
    }
    if (method === 'enginePluginLifecycle.runHealthCheck') {
      return outputs?.runHealthCheck ?? {
        ok: true,
        value: installedPlugin({ healthStatus: 'healthy' }),
      }
    }
    return { ok: true }
  })
  return { invoke }
}

function installedPlugin(overrides?: Record<string, unknown>) {
  return {
    engineId: 'magika-managed',
    displayName: 'Magika Managed',
    pluginVersion: '1.2.3',
    manifestSchemaVersion: '1',
    runtimeKind: 'managed',
    modelVersion: null,
    installState: 'installed',
    enabled: true,
    healthStatus: 'healthy',
    failureReason: null,
    installSource: 'official_catalog',
    installRootKind: 'managed_root',
    installedAt: 1,
    updatedAt: 2,
    lastVerifiedAt: 2,
    lastHealthCheckAt: 3,
    ...overrides,
  }
}

function officialPlugin(overrides?: Record<string, unknown>) {
  return {
    pluginId: 'magika-managed',
    displayName: 'Magika Managed',
    publisher: 'Starverse',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    capabilities: ['file_identification'],
    modelVersion: null,
    catalogGeneratedAt: '2026-05-08T00:00:00.000Z',
    installState: 'not_installed',
    enabled: false,
    recommendedInstallRootKind: 'managed_root',
    catalogStatus: 'valid_metadata_only',
    verificationMetadataStatus: 'production_signature_available',
    installabilityStatus: 'official_remote_install_available',
    reasons: ['official_remote_install_available', 'production_signature_available', 'verify_before_install'],
    warnings: [],
    ...overrides,
  }
}

function installOperation(overrides?: Record<string, unknown>) {
  return {
    operationId: 'official-install-magika-0.1.0-1',
    pluginId: 'magika',
    pluginVersion: '0.1.0',
    state: 'pending',
    stateHistory: ['pending'],
    startedAt: 1,
    updatedAt: 1,
    failureReason: null,
    diagnosticCode: null,
    installedEngineId: null,
    ...overrides,
  }
}

describe('PluginManagementPanel', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('renders verified installed state without unsafe claims', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ installState: 'installed', enabled: true })] },
      listInstalledPlugins: [installedPlugin()],
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Plugin Management')
    await screen.findByText('Verified by supported policy')
    expect(screen.getByText('Installed')).toBeTruthy()
    expect(screen.getByText('Healthy')).toBeTruthy()
    expect(container.textContent).not.toMatch(/marketplace|auto-update|third-party/iu)
    expect(container.textContent).not.toMatch(/plugin runtime execution is enabled/iu)
  })

  it('renders disabled and quarantined states safely', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [
        installedPlugin({
          enabled: false,
          healthStatus: 'unknown',
          lastVerifiedAt: null,
        }),
        installedPlugin({
          engineId: 'revoked-plugin',
          displayName: 'Revoked Plugin',
          installState: 'failed',
          enabled: false,
          healthStatus: 'unhealthy',
          failureReason: 'revoked',
        }),
      ],
    })

    render(PluginManagementPanel)

    await screen.findByText('Installed')
    await screen.findByText('Quarantined / disabled')
    expect(screen.getByText('Revoked by trust metadata')).toBeTruthy()
  })

  it('renders Magika-only official install action for complete built-in release metadata', async () => {
    const user = userEvent.setup()
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [],
    })
    ;(globalThis as any).dbBridge = bridge

    const { container } = render(PluginManagementPanel)

    const install = await screen.findByRole('button', { name: 'Install official plugin' })
    expect(install).toBeTruthy()
    expect(container.textContent).toContain('Built-in Magika installs through the official verify-before-install release path.')
    expect(container.textContent).toContain('Production Signature Available')
    expect(container.textContent).toContain('Verify Before Install')
    expect(container.textContent).not.toMatch(/Cryptographic Verification Deferred/iu)

    await user.click(install)

    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.installOfficialPlugin', {
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        enabled: false,
      })
    })
    expect(JSON.stringify(bridge.invoke.mock.calls)).not.toMatch(/https?:|4397df63|signature/iu)
  })

  it('disables the official install action while an install operation is in progress', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [],
      getInstallOperationStatus: {
        ok: true,
        value: installOperation({ state: 'downloading', stateHistory: ['pending', 'downloading'] }),
      },
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Install: Downloading')
    expect(screen.getByRole('button', { name: /Install official plugin/u })).toBeDisabled()
    expect(container.textContent).toContain('install_in_progress')
  })

  it('shows structured install failure and hides raw timeout text for official install', async () => {
    const user = userEvent.setup()
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [],
    })
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'enginePluginLifecycle.installOfficialPlugin') {
        throw new Error('DbWorkerError: DB worker call timed out: enginePluginLifecycle.installOfficialPlugin')
      }
      if (method === 'enginePluginLifecycle.getInstallOperationStatus') {
        return {
          ok: true,
          value: installOperation({
            state: 'failed',
            failureReason: 'download_failed',
            diagnosticCode: 'download_failed',
            stateHistory: ['pending', 'downloading', 'failed'],
          }),
        }
      }
      return createDbBridgeMock({
        listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
        listInstalledPlugins: [],
      }).invoke(method)
    })
    ;(globalThis as any).dbBridge = bridge

    const { container } = render(PluginManagementPanel)

    await user.click(await screen.findByRole('button', { name: 'Install official plugin' }))

    await waitFor(() => expect(container.textContent).toContain('Install official plugin status unavailable'))
    expect(container.textContent).not.toContain('DB worker call timed out')
  })

  it('renders post-uninstall Magika as installable catalog metadata without registered blockers', async () => {
    const bridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [
          officialPlugin({
            pluginId: 'magika',
            displayName: 'Magika',
            pluginVersion: '0.1.0',
            installState: 'uninstalled',
            enabled: false,
            installabilityStatus: 'official_remote_install_available',
          }),
        ],
      },
      listInstalledPlugins: [
        installedPlugin({
          engineId: 'magika',
          displayName: 'Magika',
          pluginVersion: '0.1.0',
          installState: 'uninstalled',
          enabled: false,
          healthStatus: 'unknown',
          lastVerifiedAt: 4,
        }),
      ],
      getDiagnosticsSummary: {
        engines: [],
        counts: { total: 0, installed: 0, enabled: 0, healthy: 0, failed: 0, unverified: 0 },
      },
    })
    ;(globalThis as any).dbBridge = bridge

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Magika')
    expect(container.textContent).toContain('0 registered, 0 enabled, 0 healthy, 0 failed')
    expect(container.textContent).toContain('Metadata uninstalled')
    expect(container.textContent).toContain('Catalog: official_remote_install_available')
    expect(container.textContent).toContain('Lifecycle: uninstalled')
    expect(container.textContent).toContain('Production Signature Available')
    expect(container.textContent).not.toContain('Verified by supported policy')
    expect(container.textContent).not.toContain('already_registered')
    expect(screen.getByRole('button', { name: 'Install official plugin' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Enable/u })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Check health/u })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Uninstall metadata/u })).toBeDisabled()
  })

  it('keeps read-only catalog entries without release metadata unavailable for install', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [
          officialPlugin({
            verificationMetadataStatus: 'metadata_present_crypto_deferred',
            installabilityStatus: 'metadata_compatible_future_install',
            reasons: ['read_only_catalog_no_install_action'],
          }),
        ],
      },
      listInstalledPlugins: [],
    })

    render(PluginManagementPanel)

    await screen.findByText(/Catalog: metadata_compatible_future_install/)
    expect(screen.getByText(/Install official plugin/).closest('button')).toBeDisabled()
    expect(screen.getByText(/Register local package/)).toBeTruthy()
    expect(screen.getAllByText(/local_registration_ui_not_wired/).length).toBeGreaterThan(0)
  })

  it('renders official Magika entry instead of empty state when catalog metadata exists', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [
          officialPlugin({
            pluginId: 'magika',
            displayName: 'Magika',
            publisher: 'Google Magika',
            pluginVersion: '0.1.0',
            modelVersion: 'standard_v3_3',
          }),
        ],
      },
      listInstalledPlugins: [],
      getDiagnosticsSummary: {
        engines: [],
        counts: { total: 0, installed: 0, enabled: 0, healthy: 0, failed: 0, unverified: 0 },
      },
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Magika')
    await screen.findByText(/magika v0\.1\.0/)
    expect(container.textContent).toContain('0 registered, 0 enabled, 0 healthy, 0 failed')
    expect(container.textContent).not.toContain('No official plugins or registered plugin metadata available.')
  })

  it('does not expose raw path, URL, hash, signature, contentToken, or fullHash text', async () => {
    const hash = 'a'.repeat(64)
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [
        installedPlugin({
          failureReason: `signature failed at C:\\Users\\owner\\plugin.svpkg https://example.test/${hash} contentToken=secret fullHash=${hash}`,
          installState: 'failed',
          enabled: false,
          healthStatus: 'unhealthy',
        }),
      ],
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Plugin Management')
    await waitFor(() => expect(container.textContent).toContain('Signature Failed At'))
    expect(container.textContent).not.toContain('C:\\Users\\owner')
    expect(container.textContent).not.toContain('https://example.test')
    expect(container.textContent).not.toContain(hash)
    expect(container.textContent).not.toContain('secret')
  })

  it('invokes only backed settings actions when clicked', async () => {
    const user = userEvent.setup()
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [
        installedPlugin({
          enabled: false,
          healthStatus: 'unknown',
          lastVerifiedAt: 4,
        }),
      ],
    })
    ;(globalThis as any).dbBridge = bridge

    render(PluginManagementPanel)

    const enable = await screen.findByRole('button', { name: 'Enable' })
    await user.click(enable)

    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.enablePlugin', {
        engineId: 'magika-managed',
      })
    })
    expect(bridge.invoke).not.toHaveBeenCalledWith(
      expect.stringMatching(/registerLocalPackage|stageUpdate|rollback|installOfficialPlugin/),
      expect.anything()
    )
  })

  it('sanitizes action success identifiers', async () => {
    const user = userEvent.setup()
    const hash = 'c'.repeat(64)
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [
        installedPlugin({
          enabled: false,
          healthStatus: 'unknown',
          lastVerifiedAt: 4,
        }),
      ],
      enablePlugin: {
        ok: true,
        value: installedPlugin({ engineId: `C:\\Users\\owner\\plugin-${hash}`, enabled: true }),
      },
    })

    const { container } = render(PluginManagementPanel)

    await user.click(await screen.findByRole('button', { name: 'Enable' }))

    await waitFor(() => expect(container.textContent).toContain('Enable:'))
    expect(container.textContent).not.toContain('C:\\Users\\owner')
    expect(container.textContent).not.toContain(hash)
  })
})

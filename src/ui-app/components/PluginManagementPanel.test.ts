/* eslint-disable max-lines-per-function */
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PluginManagementPanel from './PluginManagementPanel.vue'

function createDbBridgeMock(outputs?: {
  listOfficialPlugins?: unknown
  listInstalledPlugins?: unknown
  getDiagnosticsSummary?: unknown
    installOfficialPlugin?: unknown
    getInstallOperationStatus?: unknown
    cancelInstallOperation?: unknown
    enablePlugin?: unknown
  disablePlugin?: unknown
  uninstallPlugin?: unknown
  runHealthCheck?: unknown
}) {
  const invoke = vi.fn(async (method: string, _params?: unknown): Promise<unknown> => {
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
    if (method === 'enginePluginLifecycle.cancelInstallOperation') {
      return outputs?.cancelInstallOperation ?? {
        ok: true,
        value: installOperation({
          operationId: 'official-install-magika-0.1.0-1',
          pluginId: 'magika',
          pluginVersion: '0.1.0',
          state: 'cancelled',
          terminalAt: 2,
        }),
      }
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
    installedVersion: '1.2.3',
    availableVersion: '1.2.3',
    packageVersion: '1.2.3',
    manifestSchemaVersion: '1',
    runtimeKind: 'managed',
    runtimeVersion: null,
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
    errorChain: null,
    releaseProvenance: releaseProvenance(),
    previousKnownGood: null,
    ...overrides,
  }
}

function releaseProvenance(overrides?: Record<string, unknown>) {
  return {
    pluginId: 'magika-managed',
    packageVersion: '1.2.3',
    runtimeVersion: null,
    modelVersion: 'standard_v3_3',
    packageFormatVersion: 1,
    manifestSchemaVersion: '1',
    inventorySchemaVersion: '1',
    packageSha256: 'a'.repeat(64),
    packageSizeBytes: 1234,
    manifestSha256: 'b'.repeat(64),
    inventorySha256: 'c'.repeat(64),
    releaseUrl: 'https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v1.2.3/test.zip',
    releaseTag: 'starverse-plugin-magika-v1.2.3',
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

function officialPlugin(overrides?: Record<string, unknown>) {
  return {
    pluginId: 'magika-managed',
    displayName: 'Magika Managed',
    publisher: 'Starverse',
    pluginVersion: '1.2.3',
    availableVersion: '1.2.3',
    runtimeKind: 'managed',
    capabilities: ['file_identification'],
    platformCompatibility: { declaredPlatform: 'win32', compatible: true },
    architectureCompatibility: { declaredArchitecture: 'x64', compatible: true },
    appVersionCompatibility: { declaredRange: '>=0.0.0', compatible: true },
    modelVersion: null,
    packageSizeBytes: 1234,
    catalogGeneratedAt: '2026-05-08T00:00:00.000Z',
    installState: 'not_installed',
    enabled: false,
    recommendedInstallRootKind: 'managed_root',
    catalogStatus: 'valid_metadata_only',
    verificationMetadataStatus: 'production_signature_available',
    installabilityStatus: 'official_remote_install_available',
    reasons: ['official_remote_install_available', 'production_signature_available', 'verify_before_install'],
    warnings: [],
    releaseProvenance: releaseProvenance(),
    ...overrides,
  }
}

function installOperation(overrides?: Record<string, unknown>) {
  const state = typeof overrides?.state === 'string' ? overrides.state : 'pending'
  return {
    operationId: 'official-install-magika-0.1.0-1',
    pluginId: 'magika',
    pluginVersion: '0.1.0',
    operationType: 'official_install',
    source: 'official_builtin',
    state,
    phase: state,
    phaseLabel: installPhaseLabel(state),
    progressSummary: installPhaseLabel(state),
    stateHistory: ['accepted', state],
    startedAt: 1,
    updatedAt: 1,
    terminalAt: null,
    failureReason: null,
    diagnosticCode: null,
    sanitizedDiagnostics: [],
    installedEngineId: null,
    result: null,
    ...overrides,
  }
}

function installPhaseLabel(state: string): string {
  if (state === 'accepted' || state === 'pending') return 'Preparing install'
  if (state === 'downloading') return 'Downloading official package'
  if (state === 'verifying') return 'Verifying signature'
  if (state === 'staging') return 'Staging plugin'
  if (state === 'registering') return 'Registering plugin'
  if (state === 'health_checking') return 'Checking health'
  if (state === 'installed') return 'Installed'
  if (state === 'retrying') return 'Retrying official package download'
  if (state === 'paused_retryable') return 'Download paused'
  if (state === 'failed') return 'Install failed'
  if (state === 'stale') return 'Install status stale'
  return 'Cancelled'
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

describe('PluginManagementPanel', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronApi = (globalThis as any).electronAPI
  const originalConfirm = globalThis.confirm

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronAPI = originalElectronApi
    globalThis.confirm = originalConfirm
    vi.restoreAllMocks()
  })

  it('renders verified installed state without unsafe claims', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [
          officialPlugin({
            installState: 'installed',
            enabled: true,
            warnings: ['cryptographic_verification_deferred'],
          }),
        ],
      },
      listInstalledPlugins: [installedPlugin()],
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Plugin Management')
    await screen.findByText('Verified by supported policy')
    expect(screen.getByText('Installed')).toBeTruthy()
    expect(screen.getByText('Healthy')).toBeTruthy()
    expect(container.textContent).not.toMatch(/Cryptographic Verification Deferred/iu)
    expect(container.textContent).not.toMatch(/marketplace|auto-update|third-party/iu)
    expect(container.textContent).not.toMatch(/plugin runtime execution is enabled/iu)

    await user.click(screen.getByRole('button', { name: 'View details' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Sanitized metadata')).toBeTruthy()
    expect(screen.getByText('Verification')).toBeTruthy()
    expect(screen.getByText('Health')).toBeTruthy()
    expect(screen.getByText('Cryptographic check: Completed')).toBeTruthy()
  })

  it('renders LibreOffice Office-to-PDF as Windows x64 production-approved plugin with bounded lifecycle controls', async () => {
    const user = userEvent.setup()
    const libreOfficeGate = {
      status: 'available',
      productCode: null,
      internalCode: null,
      productionApproved: true,
      ownerGated: false,
      experimental: false,
      degraded: false,
      quarantined: false,
      source: 'managed_manifest',
      trustModel: 'owner_gated_hash_pinned_signed_catalog_required_for_production',
      trustStates: [
        'owner_approved_hash_pinned',
        'hash_pinned',
        'signature_missing',
        'catalog_untrusted',
      ],
      distributionStates: [
        'windows_x64_production_approved',
        'manual_github_release_allowed',
        'verified_offline_import_allowed',
        'offline_import_allowed',
        'download_disabled_by_policy',
        'bundled_runtime_not_approved',
        'system_libreoffice_disallowed',
      ],
      packageDecision: 'approved_windows_x64_docx_to_pdf_production_asset',
      signatureCatalogStatus: 'signature_missing_catalog_unsigned',
      catalogSignatureStatus: 'missing',
      keyIdStatus: 'not_checked',
      revocationStatus: 'not_checked',
      expirationStatus: 'not_checked',
      rollbackEligibility: 'not_evaluated',
      productionTrustReadiness: 'ready',
      ownerGatedCandidateReadiness: 'owner_gated_hash_pinned_ready',
      lastVerificationResult: 'hash_pin_matched',
      downloadEnabled: false,
      approvedPlatform: 'win32',
      approvedArch: 'x64',
      approvedInput: 'docx',
      approvedOutput: 'pdf_attachment',
      approvedAcquisitionModes: ['manual_github_release', 'offline_import'],
      automaticDownloadEnabled: false,
      postinstallDownloadEnabled: false,
      conversionTimeDownloadEnabled: false,
      platformPackageStatus: 'windows_x64_approved_mac_linux_deferred',
      fallbackTargetKinds: ['markdown', 'original_file'],
      message: 'LibreOffice Office PDF is production-approved for Windows x64 DOCX-to-PDF.',
    }
    const dbBridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [
          officialPlugin({
            pluginId: 'libreoffice',
            displayName: 'LibreOffice Office PDF',
            pluginVersion: '0.1.0',
            runtimeKind: 'managed_external_process',
            runtimeVersion: '24.8.0',
            capabilities: ['document_conversion'],
            installabilityStatus: 'unavailable_read_only',
            reasons: ['download_disabled_by_policy'],
            warnings: ['libreoffice_catalog_contract_only'],
            releaseProvenance: null,
          }),
        ],
      },
      listInstalledPlugins: [
        installedPlugin({
          engineId: 'libreoffice',
          displayName: 'LibreOffice Office PDF',
          pluginVersion: '0.1.0',
          installedVersion: '0.1.0',
          packageVersion: '2026.06.01',
          runtimeKind: 'managed_external_process',
          runtimeVersion: '24.8.0',
          healthStatus: 'healthy',
          failureReason: null,
          releaseProvenance: null,
          productGate: libreOfficeGate,
        }),
      ],
      runHealthCheck: {
        ok: true,
        value: installedPlugin({
          engineId: 'libreoffice',
          displayName: 'LibreOffice Office PDF',
          pluginVersion: '0.1.0',
          runtimeKind: 'managed_external_process',
          runtimeVersion: '24.8.0',
          healthStatus: 'healthy',
          failureReason: null,
          releaseProvenance: null,
          productGate: libreOfficeGate,
        }),
      },
    })
    ;(globalThis as any).dbBridge = dbBridge
    const importLibreOfficeSvpkg = vi.fn(async () => ({
      ok: true,
      value: installedPlugin({
        engineId: 'libreoffice',
        displayName: 'LibreOffice Office PDF',
        pluginVersion: '0.1.0',
        runtimeKind: 'managed_external_process',
        runtimeVersion: '24.8.0',
        healthStatus: 'healthy',
        failureReason: null,
        releaseProvenance: null,
        productGate: libreOfficeGate,
      }),
    }))
    const quarantineLibreOfficeRuntime = vi.fn(async () => ({
      ok: true,
      value: installedPlugin({
        engineId: 'libreoffice',
        displayName: 'LibreOffice Office PDF',
        pluginVersion: '0.1.0',
        runtimeKind: 'managed_external_process',
        runtimeVersion: '24.8.0',
        healthStatus: 'unhealthy',
        failureReason: 'conversion_sandbox_denied',
        releaseProvenance: null,
        productGate: {
          ...libreOfficeGate,
          status: 'quarantined',
          productCode: 'conversion_sandbox_denied',
          internalCode: 'office_pdf_runtime_quarantined',
          quarantined: true,
        },
      }),
    }))
    ;(globalThis as any).electronAPI = {
      importLibreOfficeSvpkg,
      quarantineLibreOfficeRuntime,
    }
    globalThis.confirm = vi.fn(() => true)

    const { container } = render(PluginManagementPanel)

    await screen.findByText('LibreOffice Office PDF')
    expect(screen.getByText('Product gate: Available')).toBeTruthy()
    expect(screen.getByText('Approval: Production approved')).toBeTruthy()
    expect(screen.getByText('Download: Disabled by policy')).toBeTruthy()
    expect(screen.getByText('Trust: owner_approved_hash_pinned, hash_pinned, signature_missing, catalog_untrusted')).toBeTruthy()
    expect(screen.getByText('Distribution: windows_x64_production_approved, manual_github_release_allowed, verified_offline_import_allowed, offline_import_allowed, download_disabled_by_policy, bundled_runtime_not_approved, system_libreoffice_disallowed')).toBeTruthy()
    expect(screen.getByText('Signature/catalog: signature_missing_catalog_unsigned')).toBeTruthy()
    expect(screen.getByText('Catalog signature: missing')).toBeTruthy()
    expect(screen.getByText('Key: not_checked')).toBeTruthy()
    expect(screen.getByText('Revocation: not_checked')).toBeTruthy()
    expect(screen.getByText('Expiration: not_checked')).toBeTruthy()
    expect(screen.getByText('Rollback: not_evaluated')).toBeTruthy()
    expect(screen.getByText('Production trust: ready')).toBeTruthy()
    expect(screen.getByText('Owner candidate: owner_gated_hash_pinned_ready')).toBeTruthy()
    expect(screen.getByText('Package decision: approved_windows_x64_docx_to_pdf_production_asset')).toBeTruthy()
    expect(screen.getByText('Approved platform: win32 / x64')).toBeTruthy()
    expect(screen.getByText('Approved route: docx to pdf_attachment')).toBeTruthy()
    expect(screen.getByText('Approved acquisition: manual_github_release, offline_import')).toBeTruthy()
    expect(screen.getByText('Automatic download: Disabled')).toBeTruthy()
    expect(screen.getByText('Postinstall download: Disabled')).toBeTruthy()
    expect(screen.getByText('Conversion-time download: Disabled')).toBeTruthy()
    expect(screen.getByText('Platform packages: windows_x64_approved_mac_linux_deferred')).toBeTruthy()
    expect(screen.getByText('Owner gate: Not required')).toBeTruthy()
    expect(screen.getByText('Experimental: Disabled')).toBeTruthy()
    expect(screen.getByText('Fallback targets: markdown, original_file')).toBeTruthy()
    expect(screen.getByText('Manual install: Downloads LibreOffice runtime package from GitHub')).toBeTruthy()
    expect(screen.getByText('Download trigger: User-initiated only')).toBeTruthy()
    expect(screen.getByText('Conversion download: Disabled')).toBeTruthy()
    expect(screen.getByText('Runtime scope: Windows x64 DOCX-to-PDF production approved when package gate is valid; macOS/Linux package pending')).toBeTruthy()
    expect(screen.getByText('Activation: Package is verified before activation')).toBeTruthy()
    expect(container.textContent).not.toContain('owner_gate_not_production_approved')
    expect(container.textContent).not.toMatch(/[A-Za-z]:\\|file:\/\/|soffice\.exe|sha256|contentToken|storageRef/iu)

    const installButton = screen.queryByRole('button', { name: /Download \/ Install/iu })
    expect(installButton?.getAttribute('disabled')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Import .svpkg' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disable runtime' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear runtime' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Quarantine runtime' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Import .svpkg' }))
    await waitFor(() => {
      expect(importLibreOfficeSvpkg).toHaveBeenCalledWith()
    })
    await user.click(screen.getByRole('button', { name: 'Recheck runtime' }))
    await waitFor(() => {
      expect(dbBridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.runHealthCheck', { engineId: 'libreoffice' })
    })
    await user.click(screen.getByRole('button', { name: 'Disable runtime' }))
    await waitFor(() => {
      expect(dbBridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.disablePlugin', { engineId: 'libreoffice' })
    })
    await user.click(screen.getByRole('button', { name: 'Clear runtime' }))
    await waitFor(() => {
      expect(dbBridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.uninstallPlugin', { engineId: 'libreoffice' })
    })
    await user.click(screen.getByRole('button', { name: 'Quarantine runtime' }))
    await waitFor(() => {
      expect(quarantineLibreOfficeRuntime).toHaveBeenCalledWith()
    })
    expect(dbBridge.invoke).not.toHaveBeenCalledWith('enginePluginLifecycle.importLibreOfficeSvpkgFromPath', expect.anything())
    expect(container.textContent).not.toMatch(/[A-Za-z]:\\|file:\/\/|soffice\.exe|sha256|contentToken|storageRef/iu)
  })

  it('starts LibreOffice official install only after the Download / Install user gesture', async () => {
    const user = userEvent.setup()
    const dbBridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [
          officialPlugin({
            pluginId: 'libreoffice',
            displayName: 'LibreOffice Office PDF',
            pluginVersion: '0.1.0',
            availableVersion: '0.1.0',
            runtimeKind: 'managed_external_process',
            capabilities: ['document_conversion'],
            installabilityStatus: 'official_remote_install_available',
            reasons: [
              'manual_github_install_available',
              'automatic_download_disabled_by_policy',
              'conversion_time_download_disabled_by_policy',
              'requires_user_gesture',
              'verify_before_activation',
              'docx_only',
            ],
            warnings: ['libreoffice_catalog_contract_only'],
            releaseProvenance: null,
          }),
        ],
      },
      listInstalledPlugins: [],
      installOfficialPlugin: {
        ok: true,
        value: installOperation({
          operationId: 'official-install-libreoffice-0.1.0-1',
          pluginId: 'libreoffice',
          pluginVersion: '0.1.0',
          state: 'downloading',
        }),
      },
    })
    ;(globalThis as any).dbBridge = dbBridge

    const { container } = render(PluginManagementPanel)

    await screen.findByText('LibreOffice Office PDF')
    expect(dbBridge.invoke.mock.calls.filter(([method]) => method === 'enginePluginLifecycle.installOfficialPlugin')).toHaveLength(0)
    expect(screen.getByText('Manual install: Downloads LibreOffice runtime package from GitHub')).toBeTruthy()
    expect(screen.getByText('Download trigger: User-initiated only')).toBeTruthy()
    expect(screen.getByText('Conversion download: Disabled')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Download / Install' }))
    await waitFor(() => {
      expect(dbBridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.installOfficialPlugin', {
        pluginId: 'libreoffice',
        pluginVersion: '0.1.0',
        enabled: false,
      })
    })
    expect(container.textContent).toContain('Install: Downloading official package')
    expect(screen.getByRole('button', { name: /Download \/ Install/iu })).toBeTruthy()
    expect(container.textContent).not.toMatch(/[A-Za-z]:\\|file:\/\/|soffice\.exe|sha256|contentToken|storageRef/iu)
  })

  it('cancels a paused LibreOffice resumable install without exposing local artifacts', async () => {
    const dbBridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [
          officialPlugin({
            pluginId: 'libreoffice',
            displayName: 'LibreOffice Office PDF',
            pluginVersion: '0.1.0',
            availableVersion: '0.1.0',
            runtimeKind: 'managed_external_process',
            capabilities: ['document_conversion'],
            installabilityStatus: 'official_remote_install_available',
            reasons: [
              'manual_github_install_available',
              'automatic_download_disabled_by_policy',
              'conversion_time_download_disabled_by_policy',
              'requires_user_gesture',
              'verify_before_activation',
              'docx_only',
            ],
            releaseProvenance: null,
          }),
        ],
      },
      listInstalledPlugins: [],
      getInstallOperationStatus: {
        ok: true,
        value: installOperation({
          operationId: 'official-install-libreoffice-0.1.0-1',
          pluginId: 'libreoffice',
          pluginVersion: '0.1.0',
          state: 'paused_retryable',
          progressSummary: 'Download paused',
          failureReason: 'resume_retries_exhausted',
          diagnosticCode: 'resume_retries_exhausted',
          terminalAt: 2,
        }),
      },
      cancelInstallOperation: {
        ok: true,
        value: installOperation({
          operationId: 'official-install-libreoffice-0.1.0-1',
          pluginId: 'libreoffice',
          pluginVersion: '0.1.0',
          state: 'cancelled',
          terminalAt: 3,
        }),
      },
    })
    ;(globalThis as any).dbBridge = dbBridge

    const { container } = render(PluginManagementPanel)

    await screen.findByText('LibreOffice Office PDF')
    await waitFor(() => {
      expect(container.textContent).toContain('Install: Download paused')
    })
    const cancelButton = screen.getByRole('button', { name: 'Cancel install' }) as HTMLButtonElement
    await waitFor(() => {
      expect(cancelButton.disabled).toBe(false)
    })
    await fireEvent.click(cancelButton)
    await waitFor(() => {
      expect(dbBridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.cancelInstallOperation', {
        operationId: 'official-install-libreoffice-0.1.0-1',
        pluginId: 'libreoffice',
        pluginVersion: '0.1.0',
      })
    })
    expect(container.textContent).not.toMatch(/[A-Za-z]:\\|file:\/\/|soffice\.exe|sha256|contentToken|storageRef/iu)
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

  it('renders layered health diagnostics with runtime reason as primary failure', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [
        installedPlugin({
          installState: 'failed',
          enabled: false,
          healthStatus: 'unhealthy',
          failureReason: 'magika_runtime_missing_dependency',
          errorChain: {
            operationLayer: { code: 'health_check_failed' },
            healthLayer: { outcome: 'unhealthy_result', stage: 'runtime_self_test' },
            runtimeLayer: { reason: 'magika_runtime_missing_dependency' },
            rootCauseLayer: { sanitizedRootCause: 'ERR_MODULE_NOT_FOUND' },
          },
        }),
      ],
    })

    render(PluginManagementPanel)

    await screen.findByText('Failure: magika_runtime_missing_dependency')
    expect(screen.queryByText('Operation: health_check_failed')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByText('Operation: health_check_failed')).toBeTruthy()
    expect(screen.getByText('Health result: unhealthy_result')).toBeTruthy()
    expect(screen.getByText('Root cause: ERR_MODULE_NOT_FOUND')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'View details' }))
    await waitFor(() => {
      expect(screen.getAllByText('Runtime reason: magika_runtime_missing_dependency').length).toBeGreaterThan(1)
    })
  })

  it('renders Unknown Error as primary when layered failure lacks specific reason', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [
        installedPlugin({
          installState: 'failed',
          enabled: false,
          healthStatus: 'unhealthy',
          failureReason: 'health_check_failed',
          errorChain: {
            operationLayer: { code: 'health_check_failed' },
            healthLayer: { outcome: null, stage: null },
            runtimeLayer: { reason: null },
            rootCauseLayer: { sanitizedRootCause: null },
          },
        }),
      ],
    })

    render(PluginManagementPanel)

    await screen.findByText('Failure: Unknown Error')
    expect(screen.queryByText('Operation: health_check_failed')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByText('Operation: health_check_failed')).toBeTruthy()
    expect(screen.getByText('Health result: Unknown Error')).toBeTruthy()
    expect(screen.getByText('Health stage: Unknown Error')).toBeTruthy()
    expect(screen.getByText('Runtime reason: Unknown Error')).toBeTruthy()
    expect(screen.getByText('Root cause: Unknown Error')).toBeTruthy()
  })

  it('does not render inline error details when no layered chain exists', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [
        installedPlugin({
          installState: 'failed',
          enabled: false,
          healthStatus: 'unhealthy',
          failureReason: 'magika_runtime_missing_dependency',
          errorChain: null,
        }),
      ],
    })

    render(PluginManagementPanel)

    await screen.findByText('Failure: magika_runtime_missing_dependency')
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull()
    expect(screen.queryByText('Operation: Unknown Error')).toBeNull()
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

  it('shows pending install progress immediately and blocks repeated install clicks', async () => {
    const user = userEvent.setup()
    const installDeferred = deferred<unknown>()
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [],
    })
    bridge.invoke.mockImplementation(async (method: string, params?: unknown) => {
      if (method === 'enginePluginLifecycle.installOfficialPlugin') {
        return installDeferred.promise
      }
      return createDbBridgeMock({
        listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
        listInstalledPlugins: [],
      }).invoke(method, params)
    })
    ;(globalThis as any).dbBridge = bridge

    const { container } = render(PluginManagementPanel)

    const install = await screen.findByRole('button', { name: 'Install official plugin' })
    await user.click(install)

    await screen.findByText('Install official plugin: Preparing install')
    expect(screen.getByRole('button', { name: /Install official plugin/u })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Install official plugin/u }))
    expect(bridge.invoke.mock.calls.filter(([method]) => method === 'enginePluginLifecycle.installOfficialPlugin')).toHaveLength(1)

    installDeferred.resolve({
      ok: true,
      value: installOperation({
        state: 'installed',
        stateHistory: ['accepted', 'pending', 'downloading', 'installed'],
        terminalAt: 2,
        installedEngineId: 'magika',
      }),
    })
    await waitFor(() => {
      expect(bridge.invoke.mock.calls.filter(([method]) => method === 'enginePluginLifecycle.listInstalledPlugins').length).toBeGreaterThan(1)
    })
    expect(container.textContent).not.toContain('Install official plugin: Preparing install')
  })

  it('clears local install progress and shows safe failure when official install fails', async () => {
    const user = userEvent.setup()
    const installDeferred = deferred<unknown>()
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [],
    })
    bridge.invoke.mockImplementation(async (method: string, params?: unknown) => {
      if (method === 'enginePluginLifecycle.installOfficialPlugin') {
        return installDeferred.promise
      }
      return createDbBridgeMock({
        listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
        listInstalledPlugins: [],
      }).invoke(method, params)
    })
    ;(globalThis as any).dbBridge = bridge

    const { container } = render(PluginManagementPanel)

    await user.click(await screen.findByRole('button', { name: 'Install official plugin' }))
    await screen.findByText('Install official plugin: Preparing install')

    installDeferred.resolve({ ok: false, reason: 'download_failed', message: 'download_failed' })

    await waitFor(() => expect(container.textContent).toContain('download_failed'))
    expect(container.textContent).not.toContain('Install: Preparing install')
    expect(container.textContent).not.toMatch(/https?:|contentToken|fullHash/iu)
  })

  it('keeps downloading visible when Refresh is clicked during an active install', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [],
      getInstallOperationStatus: {
        ok: true,
        value: installOperation({ state: 'downloading', stateHistory: ['accepted', 'pending', 'downloading'] }),
      },
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Install official plugin: Downloading official package')
    await screen.findByText('Install: Downloading official package')
    expect(screen.getByRole('button', { name: /Install official plugin/u })).toBeDisabled()
    expect(container.textContent).toContain('Install in progress')

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByText('Install official plugin: Downloading official package')
    expect(container.textContent).toContain('Install: Downloading official package')
  })

  it('renders backend install operation phases while polling', async () => {
    let pollCount = 0
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [],
    })
    bridge.invoke.mockImplementation(async (method: string, params?: unknown) => {
      if (method === 'enginePluginLifecycle.getInstallOperationStatus') {
        pollCount += 1
        return {
          ok: true,
          value: installOperation({
            state: pollCount < 2 ? 'verifying' : 'registering',
            stateHistory: pollCount < 2
              ? ['accepted', 'pending', 'downloading', 'verifying']
              : ['accepted', 'pending', 'downloading', 'verifying', 'staging', 'registering'],
          }),
        }
      }
      return createDbBridgeMock({
        listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
        listInstalledPlugins: [],
      }).invoke(method, params)
    })
    ;(globalThis as any).dbBridge = bridge

    render(PluginManagementPanel)

    await screen.findByText('Install: Verifying signature')
    await waitFor(() => expect(pollCount).toBeGreaterThan(1), { timeout: 2500 })
    expect(screen.getByText('Install: Registering plugin')).toBeTruthy()
  })

  it('keeps terminal failed install operation visible and allows retry', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [],
      getInstallOperationStatus: {
        ok: true,
        value: installOperation({
          state: 'failed',
          failureReason: 'registration_failed',
          diagnosticCode: 'registration_failed',
          progressSummary: 'Install failed: registration_failed',
          stateHistory: ['accepted', 'pending', 'downloading', 'verifying', 'staging', 'registering', 'failed'],
          terminalAt: 2,
        }),
      },
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Install failed: registration_failed')
    expect(container.textContent).toContain('0 registered, 0 enabled, 0 healthy, 0 failed')
    expect(container.textContent).toContain('Install: Install failed: registration_failed')
    expect(container.textContent).toContain('Failure: registration_failed')
    expect(screen.getByRole('button', { name: 'Install official plugin' })).toBeEnabled()
  })

  it('refreshes registry state after terminal installed operation', async () => {
    let installedCalls = 0
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
    })
    bridge.invoke.mockImplementation(async (method: string, params?: unknown) => {
      if (method === 'enginePluginLifecycle.listInstalledPlugins') {
        installedCalls += 1
        return installedCalls === 1
          ? []
          : [installedPlugin({
              engineId: 'magika',
              displayName: 'Magika',
              pluginVersion: '0.1.0',
              enabled: false,
              healthStatus: 'healthy',
            })]
      }
      if (method === 'enginePluginLifecycle.getInstallOperationStatus') {
        return {
          ok: true,
          value: installOperation({
            state: 'installed',
            stateHistory: ['accepted', 'pending', 'downloading', 'verifying', 'staging', 'registering', 'health_checking', 'installed'],
            terminalAt: 2,
            installedEngineId: 'magika',
            result: {
              engineId: 'magika',
              pluginVersion: '0.1.0',
              installState: 'installed',
              healthStatus: 'healthy',
            },
          }),
        }
      }
      if (method === 'enginePluginLifecycle.getDiagnosticsSummary') {
        return {
          engines: [],
          counts: installedCalls > 1
            ? { total: 1, installed: 1, enabled: 0, healthy: 1, failed: 0, unverified: 0 }
            : { total: 0, installed: 0, enabled: 0, healthy: 0, failed: 0, unverified: 0 },
        }
      }
      return createDbBridgeMock({
        listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      }).invoke(method, params)
    })
    ;(globalThis as any).dbBridge = bridge

    const { container } = render(PluginManagementPanel)

    await waitFor(() => expect(container.textContent).toContain('1 registered, 0 enabled, 1 healthy, 0 failed'))
    expect(installedCalls).toBeGreaterThan(1)
    expect(container.textContent).not.toContain('Reconciling installed registry state')
    expect(container.textContent).not.toContain('Install: Installed')
    expect(screen.getByRole('button', { name: /Install official plugin/u })).toBeDisabled()
  })

  it('keeps polling and blocks install when terminal installed operation is waiting for registry reconciliation', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [],
      getInstallOperationStatus: {
        ok: true,
        value: installOperation({
          state: 'installed',
          stateHistory: ['accepted', 'pending', 'downloading', 'verifying', 'staging', 'registering', 'health_checking', 'installed'],
          terminalAt: 2,
          installedEngineId: 'magika',
        }),
      },
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Install official plugin: Reconciling installed registry state')
    expect(container.textContent).toContain('0 registered, 0 enabled, 0 healthy, 0 failed')
    expect(container.textContent).toContain('Install: Installed')
    expect(screen.getByRole('button', { name: /Install official plugin/u })).toBeDisabled()
    expect(container.textContent).toContain('Finishing install')
  })

  it('does not show terminal installed success when registry reconciles to failed', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [
        installedPlugin({
          engineId: 'magika',
          displayName: 'Magika',
          pluginVersion: '0.1.0',
          installState: 'failed',
          enabled: false,
          healthStatus: 'unhealthy',
          failureReason: 'health_failed',
        }),
      ],
      getInstallOperationStatus: {
        ok: true,
        value: installOperation({
          state: 'installed',
          stateHistory: ['accepted', 'pending', 'downloading', 'verifying', 'staging', 'registering', 'health_checking', 'installed'],
          terminalAt: 2,
          installedEngineId: 'magika',
        }),
      },
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Install failed')
    expect(container.textContent).not.toContain('Install official plugin: Installed')
    expect(screen.getByRole('button', { name: 'Repair / Reinstall' })).toBeEnabled()
    expect(container.textContent).not.toContain('install_reconciling')
  })

  it('allows retry when terminal failed operation has a failed registry row', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [
        installedPlugin({
          engineId: 'magika',
          displayName: 'Magika',
          pluginVersion: '0.1.0',
          installState: 'failed',
          enabled: false,
          healthStatus: 'unhealthy',
          failureReason: 'health_failed',
        }),
      ],
      getInstallOperationStatus: {
        ok: true,
        value: installOperation({
          state: 'failed',
          failureReason: 'health_failed',
          diagnosticCode: 'health_failed',
          progressSummary: 'Install failed: health_failed',
          terminalAt: 2,
        }),
      },
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Install failed: health_failed')
    expect(container.textContent).toContain('Install: Install failed: health_failed')
    expect(screen.getByRole('button', { name: 'Repair / Reinstall' })).toBeEnabled()
    expect(container.textContent).not.toContain('already_registered')
  })

  it('does not expose unsafe terminal operation failure diagnostics', async () => {
    const hash = 'a'.repeat(64)
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })] },
      listInstalledPlugins: [],
      getInstallOperationStatus: {
        ok: true,
        value: installOperation({
          state: 'failed',
          failureReason: `signature failed at C:\\Users\\owner\\plugin.svpkg https://example.test/${hash} contentToken=secret fullHash=${hash}`,
          diagnosticCode: 'signature_invalid',
          progressSummary: 'Install failed: signature_invalid',
          sanitizedDiagnostics: ['signature_invalid'],
          stateHistory: ['accepted', 'pending', 'downloading', 'verifying', 'failed'],
          terminalAt: 2,
        }),
      },
    })

    const { container } = render(PluginManagementPanel)

    await screen.findByText('Install failed: signature_invalid')
    expect(container.textContent).not.toContain('C:\\Users')
    expect(container.textContent).not.toContain('https://example.test')
    expect(container.textContent).not.toContain(hash)
    expect(container.textContent).not.toContain('contentToken')
    expect(container.textContent).not.toContain('fullHash')
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
            stateHistory: ['accepted', 'pending', 'downloading', 'failed'],
            terminalAt: 2,
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

    await waitFor(() => expect(container.textContent).toContain('Install failed'))
    expect(container.textContent).toContain('download_failed')
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
    expect(container.textContent).toContain('Catalog: Built-in official plugin')
    expect(container.textContent).toContain('Lifecycle: uninstalled')
    expect(container.textContent).toContain('Production Signature Available')
    expect(container.textContent).not.toContain('Verified by supported policy')
    expect(container.textContent).not.toContain('already_registered')
    expect(screen.getByRole('button', { name: 'Install official plugin' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Enable/u })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Check health/u })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Uninstall plugin/u })).toBeDisabled()
    expect(container.textContent).not.toContain('Uninstall metadata')
  })

  it('clears stale reconciling install state after managed plugin uninstall', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    let uninstalled = false
    const bridge = createDbBridgeMock({
      listOfficialPlugins: {
        ok: true,
        value: [
          officialPlugin({
            pluginId: 'magika',
            displayName: 'Magika',
            pluginVersion: '0.1.0',
            installabilityStatus: 'official_remote_install_available',
          }),
        ],
      },
    })
    bridge.invoke.mockImplementation(async (method: string, params?: unknown) => {
      if (method === 'enginePluginLifecycle.listInstalledPlugins') {
        return [
          installedPlugin({
            engineId: 'magika',
            displayName: 'Magika',
            pluginVersion: '0.1.0',
            installState: uninstalled ? 'uninstalled' : 'installed',
            enabled: false,
            healthStatus: uninstalled ? 'unknown' : 'healthy',
            updatedAt: uninstalled ? 300 : 200,
          }),
        ]
      }
      if (method === 'enginePluginLifecycle.getDiagnosticsSummary') {
        return {
          engines: [],
          counts: uninstalled
            ? { total: 0, installed: 0, enabled: 0, healthy: 0, failed: 0, unverified: 0 }
            : { total: 1, installed: 1, enabled: 0, healthy: 1, failed: 0, unverified: 0 },
        }
      }
      if (method === 'enginePluginLifecycle.getInstallOperationStatus') {
        return {
          ok: true,
          value: installOperation({
            pluginId: 'magika',
            pluginVersion: '0.1.0',
            state: 'installed',
            progressSummary: 'Installed',
            stateHistory: ['accepted', 'pending', 'downloading', 'verifying', 'staging', 'registering', 'health_checking', 'installed'],
            startedAt: 100,
            updatedAt: 150,
            terminalAt: 150,
            installedEngineId: 'magika',
          }),
        }
      }
      if (method === 'enginePluginLifecycle.uninstallPlugin') {
        uninstalled = true
        return {
          ok: true,
          value: installedPlugin({
            engineId: 'magika',
            pluginVersion: '0.1.0',
            installState: 'uninstalled',
            enabled: false,
            healthStatus: 'unknown',
            updatedAt: 300,
          }),
        }
      }
      return createDbBridgeMock({
        listOfficialPlugins: {
          ok: true,
          value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.0' })],
        },
      }).invoke(method, params)
    })
    ;(globalThis as any).dbBridge = bridge

    const { container } = render(PluginManagementPanel)

    await screen.findByRole('button', { name: 'Uninstall plugin' })
    expect(container.textContent).not.toContain('Uninstall metadata')
    await user.click(await screen.findByRole('button', { name: 'Uninstall plugin' }))

    await waitFor(() => expect(container.textContent).toContain('0 registered, 0 enabled, 0 healthy, 0 failed'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('delete Starverse-managed Magika plugin files'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('owned stage/tmp/rollback remnants'))
    expect(container.textContent).not.toContain('Reconciling installed registry state')
    expect(container.textContent).not.toContain('install_reconciling')
    expect(screen.getByRole('button', { name: 'Install official plugin' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Enable/u })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Disable/u })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Check health/u })).toBeDisabled()
  })

  it('labels local package uninstall as registration removal and confirms external files are kept', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [
        installedPlugin({
          engineId: 'magika-local',
          displayName: 'Magika Local',
          installSource: 'local_package',
          installRootKind: 'test_root',
        }),
      ],
    })
    ;(globalThis as any).dbBridge = bridge

    const { container } = render(PluginManagementPanel)

    await screen.findByText('magika-local')
    expect(screen.getByRole('button', { name: 'Remove registration' })).toBeEnabled()
    expect(container.textContent).not.toContain('Uninstall metadata')

    await user.click(screen.getByRole('button', { name: 'Remove registration' }))

    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith('enginePluginLifecycle.uninstallPlugin', {
        engineId: 'magika-local',
      })
    })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('will not delete external plugin files'))
    expect(confirm.mock.calls[0]?.[0]).not.toMatch(/delete Starverse-managed/u)
  })

  it('shows cleanup_failed when managed uninstall fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const bridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [] },
      listInstalledPlugins: [
        installedPlugin({
          engineId: 'magika',
          displayName: 'Magika',
          pluginVersion: '0.1.0',
          healthStatus: 'healthy',
        }),
      ],
      uninstallPlugin: {
        ok: false,
        reason: 'cleanup_failed',
        message: 'state=failed',
        errorChain: null,
      },
    })
    ;(globalThis as any).dbBridge = bridge

    render(PluginManagementPanel)

    await user.click(await screen.findByRole('button', { name: 'Uninstall plugin' }))

    await waitFor(() => {
      expect(screen.getByText('cleanup_failed')).toBeTruthy()
    })
    expect(screen.queryByText(/Uninstall plugin: magika/u)).toBeNull()
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

    const { container } = render(PluginManagementPanel)

    await screen.findByText(/Catalog: Built-in official plugin/)
    expect(screen.getByText(/Install official plugin/).closest('button')).toBeDisabled()
    expect(screen.getByText(/Register local package/)).toBeTruthy()
    expect(screen.getAllByText(/Local registration is not available here/).length).toBeGreaterThan(0)
    expect(container.textContent).not.toContain('local_registration_ui_not_wired')
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

  it('displays managed plugin version provenance and up-to-date status', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.1', availableVersion: '0.1.1' })] },
      listInstalledPlugins: [
        installedPlugin({
          engineId: 'magika',
          displayName: 'Magika',
          pluginVersion: '0.1.1',
          installedVersion: '0.1.1',
          availableVersion: '0.1.1',
          modelVersion: 'standard_v3_3',
          releaseProvenance: releaseProvenance({
            pluginId: 'magika',
            packageVersion: '0.1.1',
            modelVersion: 'standard_v3_3',
            packageSha256: 'a85bb45b12186263443e17d0c4992d461fd42d948c826c14e66a885bfd9abb89',
            inventorySha256: '5740c59afe0454053184631a0b5c4c14474b2a5886154587ed059a5382329502',
            trustKeyId: 'starverse-official-plugin-ed25519-2026-05',
          }),
        }),
      ],
    })

    render(PluginManagementPanel)

    expect(await screen.findByText('Installed version: 0.1.1')).toBeTruthy()
    expect(screen.getByText('Available version: 0.1.1')).toBeTruthy()
    expect(screen.getByText('Model: standard_v3_3')).toBeTruthy()
    expect(screen.getByText('Signature key: starverse-official-plugin-ed25519-2026-05')).toBeTruthy()
    expect(screen.getByText('Package hash: a85bb45b...')).toBeTruthy()
    expect(screen.getByText('Inventory hash: 5740c59a...')).toBeTruthy()
    expect(screen.getByText('Update: Up to date')).toBeTruthy()
    expect(screen.queryByText('Rollback metadata')).toBeNull()
  })

  it('shows update available when the official catalog version is newer than installed', async () => {
    ;(globalThis as any).dbBridge = createDbBridgeMock({
      listOfficialPlugins: { ok: true, value: [officialPlugin({ pluginId: 'magika', displayName: 'Magika', pluginVersion: '0.1.1', availableVersion: '0.1.1' })] },
      listInstalledPlugins: [
        installedPlugin({
          engineId: 'magika',
          displayName: 'Magika',
          pluginVersion: '0.1.0',
          installedVersion: '0.1.0',
          availableVersion: '0.1.1',
        }),
      ],
    })

    render(PluginManagementPanel)

    expect(await screen.findByText('Installed version: 0.1.0')).toBeTruthy()
    expect(screen.getByText('Available version: 0.1.1')).toBeTruthy()
    expect(screen.getByText('Update: Update available')).toBeTruthy()
    expect(screen.getByText('Update')).toBeTruthy()
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

/* eslint-disable max-lines-per-function */
import { describe, expect, it } from 'vitest'
import {
  buildPdpManagementViewModel,
  type PdpManagementCatalogInput,
  type PdpManagementRegistryInput,
} from './managementViewModel'
import {
  buildPluginManagementStateFromSources,
  type PdpManagementInstallOperationInput,
} from './managementStateMachine'

function catalogEntry(overrides?: Partial<PdpManagementCatalogInput>): PdpManagementCatalogInput {
  return {
    pluginId: 'magika-managed',
    displayName: 'Magika Managed',
    publisher: 'Starverse',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    capabilities: ['file_identification'],
    platformCompatibility: { declaredPlatform: 'win32', compatible: true },
    architectureCompatibility: { declaredArchitecture: 'x64', compatible: true },
    appVersionCompatibility: { declaredRange: '>=0.0.0', compatible: true },
    modelVersion: 'standard_v3_3',
    packageSizeBytes: 1234,
    installabilityStatus: 'metadata_compatible_future_install',
    reasons: ['read_only_catalog_no_install_action'],
    warnings: [],
    catalogStatus: 'valid_metadata_only',
    verificationMetadataStatus: 'metadata_present_crypto_deferred',
    ...overrides,
  }
}

function registryRecord(overrides?: Partial<PdpManagementRegistryInput>): PdpManagementRegistryInput {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    controlledRootKind: 'user_local',
    installSource: 'manual_local',
    registryState: 'enabled',
    installState: 'installed',
    verificationStatus: 'verified',
    enabled: true,
    healthStatus: 'healthy',
    failureReason: null,
    diagnostics: [],
    ...overrides,
  }
}

function installOperation(
  overrides?: Partial<PdpManagementInstallOperationInput>
): PdpManagementInstallOperationInput {
  const state = overrides?.state ?? 'downloading'
  return {
    operationId: 'official-install-magika-managed-1.2.3-1',
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    state,
    progressSummary: state === 'downloading'
      ? 'Downloading official package'
      : state === 'verifying'
        ? 'Verifying signature'
        : state === 'registering'
          ? 'Registering plugin'
          : state === 'installed'
            ? 'Installed'
            : state === 'failed'
              ? 'Install failed'
              : 'Preparing install',
    failureReason: null,
    diagnosticCode: null,
    startedAt: 100,
    updatedAt: 110,
    terminalAt: null,
    ...overrides,
  }
}

describe('buildPdpManagementViewModel', () => {
  it('displays a verified installed plugin as verified, installed, and enabled', () => {
    const vm = buildPdpManagementViewModel({
      catalogEntries: [catalogEntry()],
      registryRecords: [registryRecord()],
    })
    expect(vm.plugins[0]?.status.verificationStatus).toBe('verified')
    expect(vm.plugins[0]?.status.installState).toBe('installed')
    expect(vm.plugins[0]?.status.enabled).toBe(true)
    expect(vm.plugins[0]?.status.lifecycle).toBe('enabled')
  })

  it('does not display a metadata-compatible catalog entry as installed', () => {
    const vm = buildPdpManagementViewModel({
      catalogEntries: [catalogEntry()],
      registryRecords: [],
    })
    expect(vm.plugins[0]?.catalog.installabilityStatus).toBe('metadata_compatible_future_install')
    expect(vm.plugins[0]?.status.installState).toBe('not_installed')
    expect(vm.plugins[0]?.status.lifecycle).toBe('catalog_only')
  })

  it('displays uninstalled tombstone metadata as inactive and not registered', () => {
    const vm = buildPdpManagementViewModel({
      catalogEntries: [
        catalogEntry({
          installabilityStatus: 'official_remote_install_available',
          verificationMetadataStatus: 'production_signature_available',
          reasons: ['official_remote_install_available', 'production_signature_available', 'verify_before_install'],
        }),
      ],
      registryRecords: [
        registryRecord({
          registryState: 'uninstalled',
          installState: 'uninstalled',
          enabled: false,
          healthStatus: 'healthy',
          verificationStatus: 'verified',
          failureReason: null,
        }),
      ],
    })

    expect(vm.plugins[0]?.status.lifecycle).toBe('uninstalled')
    expect(vm.plugins[0]?.status.installState).toBe('uninstalled')
    expect(vm.plugins[0]?.status.enabled).toBe(false)
    expect(vm.plugins[0]?.status.healthStatus).toBe('disabled')
    expect(vm.plugins[0]?.status.verificationStatus).toBe('unverified')
    expect(vm.plugins[0]?.catalog.installabilityStatus).toBe('official_remote_install_available')
  })

  it('does not display an unverified package as enabled', () => {
    const vm = buildPdpManagementViewModel({
      registryRecords: [
        registryRecord({
          verificationStatus: 'unverified',
          enabled: false,
          registryState: 'registered',
          installState: 'not_installed',
          failureReason: 'unsigned',
        }),
      ],
    })
    expect(vm.plugins[0]?.status.verificationStatus).toBe('unverified')
    expect(vm.plugins[0]?.status.enabled).toBe(false)
    expect(vm.plugins[0]?.reasonCodes).toContain('unsigned')
  })

  it('displays quarantined plugins as blocked and disabled', () => {
    const vm = buildPdpManagementViewModel({
      registryRecords: [
        registryRecord({
          registryState: 'failed',
          installState: 'quarantined',
          verificationStatus: 'revoked',
          enabled: false,
          healthStatus: 'failed',
          failureReason: 'revoked',
        }),
      ],
    })
    expect(vm.plugins[0]?.status.lifecycle).toBe('blocked')
    expect(vm.plugins[0]?.status.quarantined).toBe(true)
    expect(vm.plugins[0]?.status.enabled).toBe(false)
    expect(vm.plugins[0]?.reasonCodes).toContain('quarantined')
  })

  it('displays manual update eligibility without auto-update wording', () => {
    const vm = buildPdpManagementViewModel({
      registryRecords: [registryRecord()],
      updates: [
        {
          pluginId: 'magika-managed',
          currentVersion: '1.2.3',
          candidateVersion: '1.2.4',
          state: 'eligible_manual',
        },
      ],
    })
    const text = JSON.stringify(vm)
    expect(vm.plugins[0]?.status.updateState).toBe('eligible_manual')
    expect(vm.plugins[0]?.reasonCodes).toContain('manual_update_eligible')
    expect(text).not.toMatch(/auto-update|auto update/iu)
  })

  it('reports official installed latest as up to date with installed and available versions', () => {
    const vm = buildPdpManagementViewModel({
      catalogEntries: [
        catalogEntry({
          pluginId: 'magika',
          pluginVersion: '0.1.1',
          installabilityStatus: 'official_remote_install_available',
          verificationMetadataStatus: 'production_signature_available',
        }),
      ],
      registryRecords: [
        registryRecord({
          pluginId: 'magika',
          pluginVersion: '0.1.1',
          installSource: 'official_catalog',
          modelVersion: 'standard_v3_3',
        }),
      ],
    })

    expect(vm.plugins).toHaveLength(1)
    expect(vm.plugins[0]?.installedVersion).toBe('0.1.1')
    expect(vm.plugins[0]?.availableVersion).toBe('0.1.1')
    expect(vm.plugins[0]?.modelVersion).toBe('standard_v3_3')
    expect(vm.plugins[0]?.status.updateState).toBe('up_to_date')
  })

  it('reports official same version unhealthy as repair available', () => {
    const vm = buildPdpManagementViewModel({
      catalogEntries: [catalogEntry({ pluginId: 'magika', pluginVersion: '0.1.1' })],
      registryRecords: [
        registryRecord({
          pluginId: 'magika',
          pluginVersion: '0.1.1',
          installSource: 'official_catalog',
          installState: 'failed',
          healthStatus: 'failed',
          enabled: false,
        }),
      ],
    })

    expect(vm.plugins[0]?.status.updateState).toBe('repair_available')
    expect(vm.plugins[0]?.reasonCodes).toContain('repair_available')
  })

  it('reports newer official catalog version as update available on the installed row', () => {
    const vm = buildPdpManagementViewModel({
      catalogEntries: [
        catalogEntry({
          pluginId: 'magika',
          pluginVersion: '0.1.1',
          verificationMetadataStatus: 'production_signature_available',
        }),
      ],
      registryRecords: [
        registryRecord({
          pluginId: 'magika',
          pluginVersion: '0.1.0',
          installSource: 'official_catalog',
        }),
      ],
    })

    expect(vm.plugins).toHaveLength(1)
    expect(vm.plugins[0]?.pluginVersion).toBe('0.1.1')
    expect(vm.plugins[0]?.installedVersion).toBe('0.1.0')
    expect(vm.plugins[0]?.availableVersion).toBe('0.1.1')
    expect(vm.plugins[0]?.status.updateState).toBe('update_available')
  })

  it('reports catalog downgrade as local newer than catalog', () => {
    const vm = buildPdpManagementViewModel({
      catalogEntries: [
        catalogEntry({
          pluginId: 'magika',
          pluginVersion: '0.1.0',
          verificationMetadataStatus: 'production_signature_available',
        }),
      ],
      registryRecords: [
        registryRecord({
          pluginId: 'magika',
          pluginVersion: '0.1.1',
          installSource: 'official_catalog',
        }),
      ],
    })

    expect(vm.plugins).toHaveLength(1)
    expect(vm.plugins[0]?.status.updateState).toBe('local_newer_than_catalog')
    expect(vm.plugins[0]?.reasonCodes).toContain('downgrade_blocked')
  })

  it('applies update state to the matching plugin version first', () => {
    const vm = buildPdpManagementViewModel({
      registryRecords: [
        registryRecord({ pluginVersion: '1.2.3' }),
        registryRecord({ pluginVersion: '1.2.4', enabled: false, registryState: 'verified' }),
      ],
      updates: [
        {
          pluginId: 'magika-managed',
          currentVersion: '1.2.4',
          candidateVersion: '1.2.5',
          state: 'eligible_manual',
        },
      ],
    })
    expect(vm.plugins.map((plugin) => [plugin.pluginVersion, plugin.status.updateState])).toEqual([
      ['1.2.3', 'not_checked'],
      ['1.2.4', 'eligible_manual'],
    ])
  })

  it('displays previous known-good metadata without claiming filesystem restore', () => {
    const vm = buildPdpManagementViewModel({
      registryRecords: [registryRecord({ pluginVersion: '1.2.4' })],
      rollbacks: [
        {
          pluginId: 'magika-managed',
          state: 'previous_known_good_metadata',
          previousKnownGood: {
            pluginId: 'magika-managed',
            pluginVersion: '1.2.3',
            runtimeKind: 'managed',
            installRef: 'install_magika_1_2_3',
            packageRef: 'package_magika_1_2_3',
          },
        },
      ],
    })
    const text = JSON.stringify(vm)
    expect(vm.plugins[0]?.status.rollbackState).toBe('previous_known_good_metadata')
    expect(vm.plugins[0]?.reasonCodes).toContain('previous_known_good_metadata')
    expect(text).not.toMatch(/filesystem restore|full restore/iu)
  })

  it('does not expose raw paths, URLs, hashes, or signature values in labels or diagnostics', () => {
    const hash = 'b'.repeat(64)
    const vm = buildPdpManagementViewModel({
      registryRecords: [
        registryRecord({
          diagnostics: [
            `path C:\\Users\\owner\\plugin.svpkg`,
            `url https://example.test/pkg/${hash}`,
            `signature value ${hash}`,
          ],
        }),
      ],
      diagnostics: [`fullHash="${hash}" contentToken="secret-token"`],
    })
    const text = JSON.stringify(vm)
    expect(text).not.toContain('C:\\Users\\owner')
    expect(text).not.toContain('https://example.test')
    expect(text).not.toContain(hash)
    expect(text).not.toContain('secret-token')
  })

  it('keeps plugin id and version tuple keys collision-free', () => {
    const vm = buildPdpManagementViewModel({
      catalogEntries: [
        catalogEntry({
          pluginId: 'a',
          pluginVersion: 'b@c',
          displayName: 'Catalog Only',
        }),
      ],
      registryRecords: [
        registryRecord({
          pluginId: 'a@b',
          pluginVersion: 'c',
          registryState: 'enabled',
          installState: 'installed',
          enabled: true,
        }),
      ],
    })
    expect(vm.plugins).toHaveLength(2)
    expect(vm.plugins.map((plugin) => `${plugin.id} ${plugin.pluginVersion}`)).toEqual([
      'a b@c',
      'a@b c',
    ])
    expect(vm.plugins[0]?.status.lifecycle).toBe('catalog_only')
    expect(vm.plugins[1]?.status.lifecycle).toBe('enabled')
  })
})

describe('buildPluginManagementStateFromSources', () => {
  const installableCatalog = catalogEntry({
    installabilityStatus: 'official_remote_install_available',
    verificationMetadataStatus: 'production_signature_available',
    reasons: ['official_remote_install_available', 'production_signature_available', 'verify_before_install'],
  })
  const actionOptions = { hasOfficialRemoteInstallContract: true }

  it('makes catalog-only Magika installable and not counted as registered', () => {
    const state = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      actionOptions,
    })

    expect(state.lifecycle).toBe('catalog_only')
    expect(state.summaryContribution).toEqual({ registered: 0, enabled: 0, healthy: 0, failed: 0 })
    expect(state.actions.actions.find((action) => action.id === 'install_official_plugin')).toMatchObject({
      enabled: true,
      reasonCodes: [],
    })
  })

  it.each([
    ['downloading', 'Downloading official package'],
    ['verifying', 'Verifying signature'],
    ['registering', 'Registering plugin'],
  ] as const)('keeps active %s progress visible across refresh', (operationState, label) => {
    const state = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      installOperation: installOperation({
        state: operationState,
        progressSummary: label,
      }),
      actionOptions,
    })

    expect(state.installOperation.visible).toBe(true)
    expect(state.installOperation.shouldPoll).toBe(true)
    expect(state.installOperation.bannerMessage).toBe(`Install official plugin: ${label}`)
    expect(state.actions.actions.find((action) => action.id === 'install_official_plugin')).toMatchObject({
      enabled: false,
      reasonCodes: ['install_in_progress'],
    })
  })

  it('lets registry installed state win over stale active or terminal operation state', () => {
    const staleDownload = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      registryRecord: registryRecord({ updatedAt: 200, enabled: false }),
      installOperation: installOperation({ state: 'downloading', updatedAt: 120 }),
      actionOptions,
    })
    const terminalInstalled = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      registryRecord: registryRecord({ updatedAt: 200, enabled: false }),
      installOperation: installOperation({
        state: 'installed',
        progressSummary: 'Installed',
        terminalAt: 120,
        updatedAt: 120,
      }),
      actionOptions,
    })

    expect(staleDownload.lifecycle).toBe('registered')
    expect(staleDownload.installOperation.visible).toBe(false)
    expect(terminalInstalled.installOperation.visible).toBe(false)
    expect(terminalInstalled.summaryContribution.registered).toBe(1)
  })

  it('shows temporary reconciling only while terminal installed has no registry confirmation', () => {
    const reconciling = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      installOperation: installOperation({
        state: 'installed',
        progressSummary: 'Installed',
        terminalAt: 120,
        updatedAt: 120,
      }),
      actionOptions,
    })
    const stale = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      installOperation: installOperation({
        state: 'installed',
        progressSummary: 'Installed',
        terminalAt: 120,
        updatedAt: 120,
      }),
      actionOptions,
      now: 200_000,
      reconcileGraceMs: 1_000,
    })

    expect(reconciling.installOperation.bannerMessage).toBe(
      'Install official plugin: Reconciling installed registry state'
    )
    expect(reconciling.actions.actions.find((action) => action.id === 'install_official_plugin')).toMatchObject({
      enabled: false,
      reasonCodes: ['install_reconciling'],
    })
    expect(stale.installOperation.visible).toBe(false)
    expect(stale.actions.actions.find((action) => action.id === 'install_official_plugin')).toMatchObject({
      enabled: true,
    })
  })

  it('lets uninstalled tombstone state supersede old install operations and remain installable', () => {
    const state = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      registryRecord: registryRecord({
        registryState: 'uninstalled',
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
        verificationStatus: 'verified',
        failureReason: null,
        updatedAt: 200,
      }),
      installOperation: installOperation({
        state: 'installed',
        progressSummary: 'Installed',
        terminalAt: 120,
        updatedAt: 120,
      }),
      actionOptions,
    })

    expect(state.lifecycle).toBe('uninstalled')
    expect(state.installOperation.visible).toBe(false)
    expect(state.summaryContribution).toEqual({ registered: 0, enabled: 0, healthy: 0, failed: 0 })
    expect(state.actions.actions.find((action) => action.id === 'install_official_plugin')).toMatchObject({
      enabled: true,
      reasonCodes: [],
    })
  })

  it('keeps terminal installed reconciling when an uninstalled registry snapshot is stale', () => {
    const state = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      registryRecord: registryRecord({
        registryState: 'uninstalled',
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
        verificationStatus: 'verified',
        failureReason: null,
        updatedAt: 90,
      }),
      installOperation: installOperation({
        state: 'installed',
        progressSummary: 'Installed',
        updatedAt: 120,
        terminalAt: 120,
      }),
      actionOptions,
    })

    expect(state.installOperation.visible).toBe(true)
    expect(state.installOperation.shouldPoll).toBe(true)
    expect(state.installOperation.bannerMessage).toBe(
      'Install official plugin: Reconciling installed registry state'
    )
    expect(state.actions.actions.find((action) => action.id === 'install_official_plugin')).toMatchObject({
      enabled: false,
      reasonCodes: ['install_reconciling'],
    })
  })

  it('hides terminal installed operations when a newer uninstalled registry state supersedes them', () => {
    const state = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      registryRecord: registryRecord({
        registryState: 'uninstalled',
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
        verificationStatus: 'verified',
        failureReason: null,
        updatedAt: 130,
      }),
      installOperation: installOperation({
        state: 'installed',
        progressSummary: 'Installed',
        updatedAt: 120,
        terminalAt: 120,
      }),
      actionOptions,
    })

    expect(state.installOperation.visible).toBe(false)
    expect(state.installOperation.superseded).toBe(true)
    expect(state.actions.actions.find((action) => action.id === 'install_official_plugin')).toMatchObject({
      enabled: true,
      reasonCodes: [],
    })
  })

  it('does not hide terminal failures behind uninstalled rows older than the failure', () => {
    const state = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      registryRecord: registryRecord({
        registryState: 'uninstalled',
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
        verificationStatus: 'verified',
        failureReason: null,
        updatedAt: 110,
      }),
      installOperation: installOperation({
        state: 'failed',
        progressSummary: 'Install failed: registration_failed',
        failureReason: 'registration_failed',
        diagnosticCode: 'registration_failed',
        updatedAt: 120,
        terminalAt: 120,
      }),
      actionOptions,
    })

    expect(state.installOperation.visible).toBe(true)
    expect(state.installOperation.errorMessage).toBe('Install failed: registration_failed')
    expect(state.installOperation.failureDisplay).toBe('registration_failed')
  })

  it('keeps terminal failures visible while applying retry policy by failure class', () => {
    const downloadFailed = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      installOperation: installOperation({
        state: 'failed',
        progressSummary: 'Install failed: download_failed',
        failureReason: 'download_failed',
        diagnosticCode: 'download_failed',
        terminalAt: 120,
      }),
      actionOptions,
    })
    const signatureInvalid = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      installOperation: installOperation({
        state: 'failed',
        progressSummary: 'Install failed: signature_invalid',
        failureReason: 'signature_invalid',
        diagnosticCode: 'signature_invalid',
        terminalAt: 120,
      }),
      actionOptions,
    })

    expect(downloadFailed.installOperation.errorMessage).toBe('Install failed: download_failed')
    expect(downloadFailed.actions.actions.find((action) => action.id === 'install_official_plugin')).toMatchObject({
      enabled: true,
    })
    expect(signatureInvalid.installOperation.errorMessage).toBe('Install failed: signature_invalid')
    expect(signatureInvalid.actions.actions.find((action) => action.id === 'install_official_plugin')).toMatchObject({
      enabled: false,
      reasonCodes: ['signature_invalid'],
    })
  })

  it('does not hide terminal failures behind registry rows older than the failure', () => {
    const state = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      registryRecord: registryRecord({
        enabled: false,
        healthStatus: 'healthy',
        updatedAt: 110,
      }),
      installOperation: installOperation({
        state: 'failed',
        progressSummary: 'Install failed: registration_failed',
        failureReason: 'registration_failed',
        diagnosticCode: 'registration_failed',
        updatedAt: 120,
        terminalAt: 120,
      }),
      actionOptions,
    })

    expect(state.installOperation.visible).toBe(true)
    expect(state.installOperation.errorMessage).toBe('Install failed: registration_failed')
    expect(state.installOperation.failureDisplay).toBe('registration_failed')
  })

  it('keeps health failures as registered health failures instead of failed installs when registry succeeded', () => {
    const state = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      registryRecord: registryRecord({
        enabled: false,
        healthStatus: 'failed',
        failureReason: 'health_failed',
        updatedAt: 200,
      }),
      installOperation: installOperation({
        state: 'failed',
        progressSummary: 'Install failed: health_failed',
        failureReason: 'health_failed',
        diagnosticCode: 'health_failed',
        terminalAt: 120,
      }),
      actionOptions,
    })

    expect(state.lifecycle).toBe('registered')
    expect(state.installOperation.visible).toBe(false)
    expect(state.summaryContribution).toEqual({ registered: 1, enabled: 0, healthy: 0, failed: 1 })
    expect(state.plugin.reasonCodes).toContain('health_failed')
  })

  it('keeps newer terminal health failures visible when registry state is stale', () => {
    const state = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      registryRecord: registryRecord({
        enabled: false,
        healthStatus: 'healthy',
        updatedAt: 90,
      }),
      installOperation: installOperation({
        state: 'failed',
        progressSummary: 'Install failed: health_failed',
        failureReason: 'health_failed',
        diagnosticCode: 'health_failed',
        updatedAt: 120,
        terminalAt: 120,
      }),
      actionOptions,
    })

    expect(state.installOperation.visible).toBe(true)
    expect(state.installOperation.errorMessage).toBe('Install failed: health_failed')
    expect(state.installOperation.failureDisplay).toBe('health_failed')
  })

  it('hides terminal health failures once a newer installed registry state is observed', () => {
    const state = buildPluginManagementStateFromSources({
      catalogEntry: installableCatalog,
      registryRecord: registryRecord({
        enabled: false,
        healthStatus: 'failed',
        failureReason: 'health_failed',
        updatedAt: 130,
      }),
      installOperation: installOperation({
        state: 'failed',
        progressSummary: 'Install failed: health_failed',
        failureReason: 'health_failed',
        diagnosticCode: 'health_failed',
        updatedAt: 120,
        terminalAt: 120,
      }),
      actionOptions,
    })

    expect(state.installOperation.visible).toBe(false)
    expect(state.summaryContribution).toEqual({ registered: 1, enabled: 0, healthy: 0, failed: 1 })
  })
})

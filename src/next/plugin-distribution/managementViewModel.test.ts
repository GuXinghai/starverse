/* eslint-disable max-lines-per-function */
import { describe, expect, it } from 'vitest'
import type { PdpPluginRegistryRecord } from './registryModel'
import { buildPdpManagementViewModel, type PdpManagementCatalogInput } from './managementViewModel'

function catalogEntry(overrides?: Partial<PdpManagementCatalogInput>): PdpManagementCatalogInput {
  return {
    pluginId: 'magika-managed',
    displayName: 'Magika Managed',
    publisher: 'Starverse',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    capabilities: ['file_identification'],
    installabilityStatus: 'metadata_compatible_future_install',
    reasons: ['read_only_catalog_no_install_action'],
    warnings: [],
    catalogStatus: 'valid_metadata_only',
    verificationMetadataStatus: 'metadata_present_crypto_deferred',
    ...overrides,
  }
}

function registryRecord(overrides?: Partial<PdpPluginRegistryRecord>): PdpPluginRegistryRecord {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    controlledRootKind: 'user_local',
    installSource: 'manual_local',
    installRef: 'install_magika_1_2_3',
    packageRef: 'package_magika_1_2_3',
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

/* eslint-disable max-lines-per-function */
import { describe, expect, it } from 'vitest'
import { buildPdpManagementActions, findPdpManagementAction } from './managementActions'
import { buildPdpManagementViewModel, type PdpManagementCatalogInput } from './managementViewModel'
import type { PdpPluginRegistryRecord } from './registryModel'

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
    registryState: 'disabled',
    installState: 'disabled',
    verificationStatus: 'verified',
    enabled: false,
    healthStatus: 'disabled',
    failureReason: 'disabled_by_user',
    diagnostics: [],
    ...overrides,
  }
}

function firstPlugin(input: Parameters<typeof buildPdpManagementViewModel>[0]) {
  const plugin = buildPdpManagementViewModel(input).plugins[0]
  if (!plugin) throw new Error('expected plugin')
  return plugin
}

describe('buildPdpManagementActions', () => {
  it('keeps future-only contract actions disabled by default', () => {
    const plugin = firstPlugin({ registryRecords: [registryRecord()] })
    const actions = buildPdpManagementActions(plugin)
    expect(findPdpManagementAction(actions, 'manual_local_package_registration')).toMatchObject({
      enabled: false,
      reasonCodes: ['unsupported_action_contract_missing'],
    })
    expect(findPdpManagementAction(actions, 'verify_package')).toMatchObject({
      enabled: false,
      reasonCodes: ['unsupported_action_contract_missing'],
    })
    expect(findPdpManagementAction(actions, 'manual_update_eligibility')).toMatchObject({
      enabled: false,
      reasonCodes: ['unsupported_action_contract_missing'],
    })
    expect(findPdpManagementAction(actions, 'stage_update_contract')).toMatchObject({
      enabled: false,
      reasonCodes: ['unsupported_action_contract_missing'],
    })
    expect(findPdpManagementAction(actions, 'rollback_metadata')).toMatchObject({
      enabled: false,
      reasonCodes: ['unsupported_action_contract_missing'],
    })
    expect(findPdpManagementAction(actions, 'acknowledge_quarantine')).toMatchObject({
      enabled: false,
      reasonCodes: ['unsupported_action_contract_missing'],
    })
  })

  it('enables action only for verified eligible records', () => {
    const plugin = firstPlugin({ registryRecords: [registryRecord()] })
    const actions = buildPdpManagementActions(plugin, { hasEnableDisableContract: true })
    expect(findPdpManagementAction(actions, 'enable')).toMatchObject({ enabled: true })

    const unverified = firstPlugin({
      registryRecords: [
        registryRecord({
          verificationStatus: 'unverified',
          registryState: 'registered',
          installState: 'not_installed',
          failureReason: 'unsigned',
        }),
      ],
    })
    const blocked = findPdpManagementAction(
      buildPdpManagementActions(unverified, { hasEnableDisableContract: true }),
      'enable'
    )
    expect(blocked.enabled).toBe(false)
    expect(blocked.reasonCodes).toContain('verification_required')
  })

  it('keeps install or update action unavailable when only read-only catalog metadata exists', () => {
    const plugin = firstPlugin({ catalogEntries: [catalogEntry()] })
    const actions = buildPdpManagementActions(plugin, { hasStageUpdateContract: true })
    expect(findPdpManagementAction(actions, 'enable').enabled).toBe(false)
    expect(findPdpManagementAction(actions, 'stage_update_contract').enabled).toBe(false)
    expect(findPdpManagementAction(actions, 'stage_update_contract').reasonCodes).toContain(
      'manual_update_not_eligible'
    )
  })

  it('exposes manual registration as local/manual only and not for already registered plugins', () => {
    const catalogOnly = firstPlugin({ catalogEntries: [catalogEntry()] })
    expect(
      findPdpManagementAction(
        buildPdpManagementActions(catalogOnly, { hasLocalManualRegistrationContract: true }),
        'manual_local_package_registration'
      )
    ).toMatchObject({ enabled: true, label: 'Register local package' })

    const registered = firstPlugin({ registryRecords: [registryRecord()] })
    const action = findPdpManagementAction(
      buildPdpManagementActions(registered, { hasLocalManualRegistrationContract: true }),
      'manual_local_package_registration'
    )
    expect(action.enabled).toBe(false)
    expect(action.reasonCodes).toContain('already_registered')
  })

  it('makes rollback action available only with previous verified known-good metadata', () => {
    const unavailable = firstPlugin({ registryRecords: [registryRecord()] })
    expect(
      findPdpManagementAction(
        buildPdpManagementActions(unavailable, { hasRollbackMetadataContract: true }),
        'rollback_metadata'
      )
    ).toMatchObject({
      enabled: false,
      reasonCodes: ['previous_known_good_missing'],
    })

    const eligible = firstPlugin({
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
    expect(
      findPdpManagementAction(
        buildPdpManagementActions(eligible, { hasRollbackMetadataContract: true }),
        'rollback_metadata'
      )
    ).toMatchObject({
      enabled: true,
    })
  })

  it('blocks enable when a plugin is quarantined', () => {
    const plugin = firstPlugin({
      registryRecords: [
        registryRecord({
          registryState: 'failed',
          installState: 'quarantined',
          verificationStatus: 'revoked',
          enabled: false,
          failureReason: 'revoked',
        }),
      ],
    })
    const actions = buildPdpManagementActions(plugin, {
      hasEnableDisableContract: true,
      hasQuarantineAcknowledgementContract: true,
    })
    const enable = findPdpManagementAction(actions, 'enable')
    expect(enable.enabled).toBe(false)
    expect(enable.reasonCodes).toContain('quarantined')
    expect(findPdpManagementAction(actions, 'acknowledge_quarantine')).toMatchObject({
      enabled: true,
    })
  })

  it('includes reason code when an action contract is unsupported', () => {
    const plugin = firstPlugin({ registryRecords: [registryRecord()] })
    const action = findPdpManagementAction(
      buildPdpManagementActions(plugin, { hasHealthCheckContract: false }),
      'check_health'
    )
    expect(action.enabled).toBe(false)
    expect(action.reasonCodes).toContain('unsupported_action_contract_missing')
  })

  it('does not expose marketplace or auto-update actions', () => {
    const plugin = firstPlugin({ registryRecords: [registryRecord()] })
    const actions = buildPdpManagementActions(plugin)
    const text = JSON.stringify(actions)
    expect(text).not.toMatch(/marketplace|auto-update|auto_update|third-party|third_party/iu)
  })
})

/* eslint-disable max-lines-per-function */
import { describe, expect, it } from 'vitest'
import { buildPdpManagementDetailModel } from './managementDetails'
import { buildPdpManagementViewModel, type PdpManagementCatalogInput, type PdpManagementRegistryInput } from './managementViewModel'

function catalogEntry(overrides?: Partial<PdpManagementCatalogInput>): PdpManagementCatalogInput {
  return {
    pluginId: 'magika-managed',
    displayName: 'Magika Managed',
    publisher: 'Starverse',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    platformCompatibility: { declaredPlatform: 'any', compatible: true },
    architectureCompatibility: { declaredArchitecture: 'any', compatible: true },
    appVersionCompatibility: { declaredRange: '*', compatible: true },
    modelVersion: null,
    packageSizeBytes: 1024,
    capabilities: ['file_identification'],
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

function plugin() {
  const result = buildPdpManagementViewModel({
    catalogEntries: [catalogEntry()],
    registryRecords: [registryRecord()],
  }).plugins[0]
  if (!result) throw new Error('expected plugin')
  return result
}

describe('buildPdpManagementDetailModel', () => {
  it('omits absolute paths from details', () => {
    const details = buildPdpManagementDetailModel({
      plugin: plugin(),
      diagnostics: ['loaded from C:\\Users\\owner\\plugins\\magika.svpkg'],
    })
    expect(JSON.stringify(details)).not.toContain('C:\\Users\\owner')
    expect(details.diagnostics[0]).toContain('[redacted-path]')
  })

  it('omits raw URLs from details', () => {
    const details = buildPdpManagementDetailModel({
      plugin: plugin(),
      diagnostics: ['package URL https://example.test/plugin.svpkg'],
    })
    expect(JSON.stringify(details)).not.toContain('https://example.test')
  })

  it('omits raw hashes and signatures from details', () => {
    const hash = 'a'.repeat(64)
    const details = buildPdpManagementDetailModel({
      plugin: plugin(),
      diagnostics: [`signature value ${hash}`, `fullHash=${hash}`, 'contentToken=secret-token'],
    })
    const text = JSON.stringify(details)
    expect(text).not.toContain(hash)
    expect(text).not.toContain('secret-token')
  })

  it('shows unsupported signature algorithm safely', () => {
    const details = buildPdpManagementDetailModel({
      plugin: plugin(),
      verification: {
        status: 'failed',
        signatureAlgorithm: 'rsa-pss',
        cryptographicVerificationPerformed: false,
        reasonCodes: ['signature_algorithm_unsupported'],
      },
    })
    expect(details.verification.signatureAlgorithm).toMatchObject({
      status: 'unsupported',
      algorithmLabel: 'rsa-pss',
      label: 'Unsupported signature algorithm',
    })
    expect(JSON.stringify(details)).not.toContain('signature value')
  })

  it('does not infer cryptographic verification performed from verified status', () => {
    const details = buildPdpManagementDetailModel({
      plugin: plugin(),
      verification: {
        status: 'verified',
      },
    })
    expect(details.verification.status).toBe('verified')
    expect(details.verification.cryptographicVerificationPerformed).toBe(false)
  })

  it('shows revocation and quarantine without implying a malware verdict', () => {
    const model = buildPdpManagementViewModel({
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
    }).plugins[0]
    if (!model) throw new Error('expected plugin')
    const details = buildPdpManagementDetailModel({
      plugin: model,
      quarantine: {
        quarantined: true,
        disabled: true,
        reasonCodes: ['revoked'],
      },
    })
    expect(details.quarantine).toMatchObject({
      quarantined: true,
      disabled: true,
      malwareVerdict: false,
      arbitraryDeletionDeferred: true,
    })
    expect(JSON.stringify(details)).not.toMatch(/malware detected|malware verdict/iu)
  })

  it('uses reason codes and safe labels for rollback and update state', () => {
    const details = buildPdpManagementDetailModel({
      plugin: plugin(),
      update: {
        state: 'eligible_manual',
        currentVersion: '1.2.3',
        candidateVersion: '1.2.4',
        reasonCodes: ['manual_update_eligible'],
      },
      rollback: {
        state: 'previous_known_good_metadata',
        previousKnownGoodVersion: '1.2.2',
        reasonCodes: ['previous_known_good_metadata'],
      },
    })
    const text = JSON.stringify(details)
    expect(details.update.label).toBe('Manual update eligibility')
    expect(details.rollback.label).toBe('Previous known-good metadata')
    expect(details.rollback.filesystemRestoreDeferred).toBe(true)
    expect(text).not.toMatch(/auto-update|filesystem restore|full restore/iu)
  })
})

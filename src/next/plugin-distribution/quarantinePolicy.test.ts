import { describe, expect, it } from 'vitest'
import {
  applyPdpRevocationResponse,
  canEnablePdpQuarantinedRecord,
  quarantinePdpPlugin,
  type PdpPluginRegistryRecord,
} from './index'

function record(overrides?: Partial<PdpPluginRegistryRecord>): PdpPluginRegistryRecord {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    controlledRootKind: 'user_local',
    installSource: 'manual_local',
    installRef: 'install_magika_1_2_3',
    packageRef: 'stage_magika_1_2_3',
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

describe('PDP quarantine and revocation response policy', () => {
  it('revoked package cannot enable', () => {
    const result = applyPdpRevocationResponse({
      record: record(),
      revoked: true,
      detail: 'revoked by official metadata',
    })
    expect(result.record.verificationStatus).toBe('revoked')
    expect(result.record.installState).toBe('quarantined')
    expect(result.record.enabled).toBe(false)
    expect(canEnablePdpQuarantinedRecord(result.record)).toBe(false)
  })

  it('revoked enabled plugin transitions to disabled quarantined policy state', () => {
    const result = applyPdpRevocationResponse({
      record: record({ enabled: true, registryState: 'enabled' }),
      revoked: true,
      ownedCleanupRefs: ['stage_magika_1_2_3'],
    })
    expect(result.quarantined).toBe(true)
    expect(result.disabled).toBe(true)
    expect(result.record.enabled).toBe(false)
    expect(result.record.installState).toBe('quarantined')
    expect(result.cleanupRefs).toEqual(['stage_magika_1_2_3'])
  })

  it('quarantine reason is sanitized', () => {
    const result = quarantinePdpPlugin({
      record: record(),
      reason: 'signature_invalid',
      detail: 'signature failed at C:\\Users\\owner\\plugin hash ' + 'a'.repeat(64),
    })
    expect(result.record.failureReason).toBe('signature_invalid')
    expect(JSON.stringify(result.diagnostics)).not.toContain('C:\\Users\\owner')
    expect(JSON.stringify(result.diagnostics)).not.toContain('a'.repeat(64))
  })

  it('non-revoked package is unaffected by revocation response', () => {
    const current = record()
    const result = applyPdpRevocationResponse({
      record: current,
      revoked: false,
      detail: 'checked official revocation metadata',
    })
    expect(result.quarantined).toBe(false)
    expect(result.record).toEqual(current)
    expect(result.cleanupRefs).toEqual([])
  })

  it('enable helper fails closed for failed or incompatible records', () => {
    expect(
      canEnablePdpQuarantinedRecord(
        record({
          registryState: 'failed',
          installState: 'failed',
          verificationStatus: 'failed',
          failureReason: 'hash_mismatch',
        })
      )
    ).toBe(false)
    expect(
      canEnablePdpQuarantinedRecord(record({ failureReason: 'incompatible_platform' }))
    ).toBe(false)
    expect(canEnablePdpQuarantinedRecord(record())).toBe(true)
  })

  it('cleanup target is restricted to owned refs', () => {
    const result = quarantinePdpPlugin({
      record: record(),
      reason: 'hash_mismatch',
      ownedCleanupRefs: ['stage_magika_1_2_3', 'C:\\Users\\owner\\stage', '../escape'],
    })
    expect(result.cleanupRefs).toEqual(['stage_magika_1_2_3'])
    expect(result.arbitraryDeletionDeferred).toBe(true)
    expect(JSON.stringify(result)).not.toContain('C:\\Users\\owner')
  })
})

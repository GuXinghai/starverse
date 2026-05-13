import { describe, expect, it } from 'vitest'
import {
  evaluatePdpRollback,
  type PdpPluginRegistryRecord,
  type PdpPreviousKnownGoodRef,
} from './index'

function record(overrides?: Partial<PdpPluginRegistryRecord>): PdpPluginRegistryRecord {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.4',
    runtimeKind: 'managed',
    controlledRootKind: 'user_local',
    installSource: 'manual_local',
    installRef: 'install_magika_1_2_4',
    packageRef: 'stage_magika_1_2_4',
    registryState: 'failed',
    installState: 'failed',
    verificationStatus: 'failed',
    enabled: false,
    healthStatus: 'failed',
    failureReason: 'health_failed',
    diagnostics: [],
    ...overrides,
  }
}

function previousRef(overrides?: Partial<PdpPreviousKnownGoodRef>): PdpPreviousKnownGoodRef {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    installRef: 'install_magika_1_2_3',
    packageRef: 'stage_magika_1_2_3',
    ...overrides,
  }
}

function previousRecord(overrides?: Partial<PdpPluginRegistryRecord>): PdpPluginRegistryRecord {
  return record({
    pluginVersion: '1.2.3',
    installRef: 'install_magika_1_2_3',
    packageRef: 'stage_magika_1_2_3',
    registryState: 'enabled',
    installState: 'installed',
    verificationStatus: 'verified',
    enabled: true,
    healthStatus: 'healthy',
    failureReason: null,
    ...overrides,
  })
}

describe('evaluatePdpRollback', () => {
  it('allows rollback to previous verified known-good metadata', () => {
    const result = evaluatePdpRollback({
      currentRecord: record(),
      previousKnownGood: previousRef(),
      previousRecord: previousRecord(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.activeRecord.pluginVersion).toBe('1.2.3')
    expect(result.activeRecord.verificationStatus).toBe('verified')
    expect(result.filesystemRestoreDeferred).toBe(true)
  })

  it('rejects rollback to revoked package', () => {
    const result = evaluatePdpRollback({
      currentRecord: record(),
      previousKnownGood: previousRef(),
      previousRecord: previousRecord({
        verificationStatus: 'revoked',
        failureReason: 'revoked',
      }),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('previous_known_good_revoked')
  })

  it('rejects rollback to incompatible package', () => {
    const result = evaluatePdpRollback({
      currentRecord: record(),
      previousKnownGood: previousRef(),
      previousRecord: previousRecord({ failureReason: 'incompatible_platform' }),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('previous_known_good_incompatible')
  })

  it('requires previous known-good registry metadata', () => {
    const result = evaluatePdpRollback({
      currentRecord: record(),
      previousKnownGood: previousRef(),
      previousRecord: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('previous_known_good_unverified')
  })

  it('sanitizes rollback diagnostics', () => {
    const result = evaluatePdpRollback({
      currentRecord: record(),
      previousKnownGood: null,
      reason: 'rollback failed at C:\\Users\\owner\\plugin hash ' + 'a'.repeat(64),
    })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result.diagnostics)).not.toContain('C:\\Users\\owner')
    expect(JSON.stringify(result.diagnostics)).not.toContain('a'.repeat(64))
  })

  it('does not model arbitrary filesystem deletion or restore', () => {
    const result = evaluatePdpRollback({
      currentRecord: record(),
      previousKnownGood: previousRef({ installRef: 'C:\\Users\\owner\\plugins' }),
      previousRecord: previousRecord(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.filesystemRestoreDeferred).toBe(true)
      expect(result.failureReasons).toContain('unsafe_rollback_ref')
      expect(JSON.stringify(result)).not.toContain('C:\\Users\\owner')
    }
  })
})

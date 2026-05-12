import { describe, expect, it } from 'vitest'
import { resolveInstallOperationRecovery, type PdpPluginRegistryRecord } from './index'

function previousRecord(overrides?: Partial<PdpPluginRegistryRecord>): PdpPluginRegistryRecord {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.2',
    runtimeKind: 'managed',
    controlledRootKind: 'user_local',
    installSource: 'manual_local',
    installRef: 'install_magika_1_2_2',
    packageRef: 'stage_magika_1_2_2',
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

function candidateRecord(overrides?: Partial<PdpPluginRegistryRecord>): PdpPluginRegistryRecord {
  return previousRecord({
    pluginVersion: '1.2.3',
    installRef: 'install_magika_1_2_3',
    packageRef: 'stage_magika_1_2_3',
    registryState: 'verified',
    enabled: false,
    healthStatus: 'unknown',
    ...overrides,
  })
}

// eslint-disable-next-line max-lines-per-function
describe('resolveInstallOperationRecovery', () => {
  it('interrupted download does not install', () => {
    const result = resolveInstallOperationRecovery({
      phase: 'downloading',
      failureKind: 'download_interrupted',
      previousKnownGoodRecord: previousRecord(),
      ownedStagingRefs: ['stage_magika_1_2_3'],
    })
    expect(result.phase).toBe('cleanup_pending')
    expect(result.installed).toBe(false)
    expect(result.enabled).toBe(false)
    expect(result.activeRecord?.pluginVersion).toBe('1.2.2')
  })

  it('verification failure does not install', () => {
    const result = resolveInstallOperationRecovery({
      phase: 'verifying',
      failureKind: 'verification_failed',
      previousKnownGoodRecord: previousRecord(),
      candidateRecord: candidateRecord(),
    })
    expect(result.installed).toBe(false)
    expect(result.activeRecord?.pluginVersion).toBe('1.2.2')
  })

  it('install failure does not enable plugin', () => {
    const result = resolveInstallOperationRecovery({
      phase: 'installing',
      failureKind: 'install_finalization_failed',
      previousKnownGoodRecord: previousRecord(),
      candidateRecord: candidateRecord({ enabled: true }),
    })
    expect(result.installed).toBe(false)
    expect(result.enabled).toBe(false)
    expect(result.activeRecord?.pluginVersion).toBe('1.2.2')
  })

  it('cancelled operation produces cancelled state', () => {
    const result = resolveInstallOperationRecovery({
      phase: 'cancelled',
      failureKind: 'cancelled',
      previousKnownGoodRecord: previousRecord(),
      ownedStagingRefs: ['stage_magika_1_2_3'],
    })
    expect(result.phase).toBe('cancelled')
    expect(result.failureKind).toBe('cancelled')
    expect(result.enabled).toBe(false)
  })

  it('cleanup only targets owned safe staging refs', () => {
    const result = resolveInstallOperationRecovery({
      phase: 'failed',
      failureKind: 'staging_failed',
      ownedStagingRefs: ['stage_magika_1_2_3', 'C:\\Users\\owner\\stage', '../escape'],
    })
    expect(result.cleanupRefs).toEqual(['stage_magika_1_2_3'])
  })

  it('previous known-good state is preserved in model', () => {
    const previous = previousRecord()
    const result = resolveInstallOperationRecovery({
      phase: 'failed',
      failureKind: 'install_finalization_failed',
      previousKnownGoodRecord: previous,
      candidateRecord: candidateRecord(),
    })
    expect(result.previousKnownGoodRecord).toEqual(previous)
    expect(result.activeRecord).toEqual(previous)
  })

  it('successful install remains disabled until a later enable transition', () => {
    const result = resolveInstallOperationRecovery({
      phase: 'installed',
      previousKnownGoodRecord: previousRecord(),
      candidateRecord: candidateRecord({ enabled: true }),
    })
    expect(result.installed).toBe(true)
    expect(result.enabled).toBe(false)
    expect(result.activeRecord?.enabled).toBe(false)
  })

  it('sanitizes diagnostics', () => {
    const result = resolveInstallOperationRecovery({
      phase: 'failed',
      failureKind: 'cleanup_failed',
      detail: 'cleanup failed at C:\\Users\\owner\\stage hash ' + 'a'.repeat(64),
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain('C:\\Users\\owner')
    expect(JSON.stringify(result.diagnostics)).not.toContain('a'.repeat(64))
  })

  it('sanitizes key-value Unix paths in diagnostics', () => {
    const result = resolveInstallOperationRecovery({
      phase: 'failed',
      failureKind: 'cleanup_failed',
      detail: 'cleanup failed path=/opt/starverse/plugin',
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain('/opt/starverse/plugin')
  })

  it('sanitizes quoted key-value Unix paths in diagnostics', () => {
    const result = resolveInstallOperationRecovery({
      phase: 'failed',
      failureKind: 'cleanup_failed',
      detail: 'cleanup failed path="/opt/starverse/plugin"',
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain('/opt/starverse/plugin')
  })
})

import { describe, expect, it } from 'vitest'
import {
  createPdpUpdateOperation,
  transitionPdpUpdateOperation,
  type PdpPluginRegistryRecord,
  type PdpStagedUpdateRef,
  type PdpUpdateOperation,
  type PdpUpdateOperationTransitionResult,
} from './index'

function activeRecord(overrides?: Partial<PdpPluginRegistryRecord>): PdpPluginRegistryRecord {
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

function stagedUpdate(overrides?: Partial<PdpStagedUpdateRef>): PdpStagedUpdateRef {
  return {
    pluginId: 'magika-managed',
    currentVersion: '1.2.3',
    candidateVersion: '1.2.4',
    stagingRef: 'stage_magika_1_2_4',
    finalInstallRef: 'install_magika_1_2_4',
    ...overrides,
  }
}

function expectTransitionOk(result: PdpUpdateOperationTransitionResult): PdpUpdateOperation {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`transition failed: ${result.failureReason}`)
  return result.operation
}

function operationAtStaged(): PdpUpdateOperation {
  let operation = createPdpUpdateOperation({ operationId: 'update_1', currentActiveRecord: activeRecord() })
  for (const nextState of ['checking', 'eligible', 'downloading', 'verifying'] as const) {
    operation = expectTransitionOk(transitionPdpUpdateOperation({ operation, nextState }))
  }
  return expectTransitionOk(
    transitionPdpUpdateOperation({ operation, nextState: 'staged', stagedUpdate: stagedUpdate() })
  )
}

// eslint-disable-next-line max-lines-per-function
describe('PDP update operation state model', () => {
  it('staged update preserves current active version', () => {
    const operation = operationAtStaged()
    expect(operation.state).toBe('staged')
    expect(operation.currentActiveRecord.pluginVersion).toBe('1.2.3')
    expect(operation.currentActiveRecord.enabled).toBe(true)
    expect(operation.stagedUpdate?.candidateVersion).toBe('1.2.4')
  })

  it('failed staged update preserves current active version', () => {
    const staged = operationAtStaged()
    const failed = transitionPdpUpdateOperation({
      operation: staged,
      nextState: 'failed',
      failureReason: 'verification_failed',
    })
    const operation = expectTransitionOk(failed)
    expect(operation.state).toBe('failed')
    expect(operation.currentActiveRecord.pluginVersion).toBe('1.2.3')
    expect(operation.currentActiveRecord.enabled).toBe(true)
  })

  it('cancelled update preserves current active version', () => {
    const staged = operationAtStaged()
    const cancelled = transitionPdpUpdateOperation({
      operation: staged,
      nextState: 'cancelled',
      diagnostic: 'cancelled at C:\\Users\\owner\\plugin hash ' + 'a'.repeat(64),
    })
    const operation = expectTransitionOk(cancelled)
    expect(operation.state).toBe('cancelled')
    expect(operation.currentActiveRecord.pluginVersion).toBe('1.2.3')
    expect(operation.currentActiveRecord.enabled).toBe(true)
    expect(JSON.stringify(operation.diagnostics)).not.toContain('C:\\Users\\owner')
    expect(JSON.stringify(operation.diagnostics)).not.toContain('a'.repeat(64))
  })

  it('invalid transition is rejected', () => {
    const operation = createPdpUpdateOperation({ operationId: 'update_1', currentActiveRecord: activeRecord() })
    const result = transitionPdpUpdateOperation({ operation, nextState: 'activated' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('invalid_transition')
    expect(result.operation.currentActiveRecord.pluginVersion).toBe('1.2.3')
  })

  it('activation requires verified candidate record and then swaps active record', () => {
    const staged = operationAtStaged()
    const ready = expectTransitionOk(transitionPdpUpdateOperation({ operation: staged, nextState: 'ready_to_activate' }))
    const activatedRecord = activeRecord({
      pluginVersion: '1.2.4',
      installRef: 'install_magika_1_2_4',
      packageRef: 'stage_magika_1_2_4',
      enabled: true,
      registryState: 'enabled',
      healthStatus: 'unknown',
    })
    const activated = expectTransitionOk(
      transitionPdpUpdateOperation({ operation: ready, nextState: 'activated', activatedRecord })
    )
    expect(activated.state).toBe('activated')
    expect(activated.currentActiveRecord.pluginVersion).toBe('1.2.4')
    expect(activated.stagedUpdate).toBeNull()
  })

  it('activation rejects unverified or disabled candidate records', () => {
    const staged = operationAtStaged()
    const ready = expectTransitionOk(transitionPdpUpdateOperation({ operation: staged, nextState: 'ready_to_activate' }))
    const unverifiedRecord = activeRecord({
      pluginVersion: '1.2.4',
      installRef: 'install_magika_1_2_4',
      packageRef: 'stage_magika_1_2_4',
      registryState: 'verified',
      verificationStatus: 'unverified',
      enabled: false,
    })
    const result = transitionPdpUpdateOperation({
      operation: ready,
      nextState: 'activated',
      activatedRecord: unverifiedRecord,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('activation_candidate_not_verified')
  })

  it('activation rejects candidates with blocking failure reasons', () => {
    const staged = operationAtStaged()
    const ready = expectTransitionOk(transitionPdpUpdateOperation({ operation: staged, nextState: 'ready_to_activate' }))
    const revokedRecord = activeRecord({
      pluginVersion: '1.2.4',
      installRef: 'install_magika_1_2_4',
      packageRef: 'stage_magika_1_2_4',
      registryState: 'enabled',
      enabled: true,
      failureReason: 'revoked',
    })
    const result = transitionPdpUpdateOperation({
      operation: ready,
      nextState: 'activated',
      activatedRecord: revokedRecord,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('activation_candidate_not_verified')
  })

  it('activation rejects runtime-kind mismatches', () => {
    const staged = operationAtStaged()
    const ready = expectTransitionOk(transitionPdpUpdateOperation({ operation: staged, nextState: 'ready_to_activate' }))
    const mismatchedRecord = activeRecord({
      pluginVersion: '1.2.4',
      runtimeKind: 'native',
      installRef: 'install_magika_1_2_4',
      packageRef: 'stage_magika_1_2_4',
      registryState: 'enabled',
      enabled: true,
    })
    const result = transitionPdpUpdateOperation({
      operation: ready,
      nextState: 'activated',
      activatedRecord: mismatchedRecord,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('activation_identity_mismatch')
  })

  it('activation rejects candidates that do not match staged install refs', () => {
    const staged = operationAtStaged()
    const ready = expectTransitionOk(transitionPdpUpdateOperation({ operation: staged, nextState: 'ready_to_activate' }))
    const mismatchedRecord = activeRecord({
      pluginVersion: '1.2.4',
      installRef: 'install_other_1_2_4',
      packageRef: 'stage_magika_1_2_4',
      registryState: 'enabled',
      enabled: true,
    })
    const result = transitionPdpUpdateOperation({
      operation: ready,
      nextState: 'activated',
      activatedRecord: mismatchedRecord,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('activation_identity_mismatch')
  })

  it('activation rejects tampered staged update overrides', () => {
    const staged = operationAtStaged()
    const ready = expectTransitionOk(transitionPdpUpdateOperation({ operation: staged, nextState: 'ready_to_activate' }))
    const tamperedStagedUpdate = stagedUpdate({
      candidateVersion: '1.2.5',
      stagingRef: 'stage_magika_1_2_5',
      finalInstallRef: 'install_magika_1_2_5',
    })
    const activatedRecord = activeRecord({
      pluginVersion: '1.2.5',
      installRef: 'install_magika_1_2_5',
      packageRef: 'stage_magika_1_2_5',
      registryState: 'enabled',
      enabled: true,
    })
    const result = transitionPdpUpdateOperation({
      operation: ready,
      nextState: 'activated',
      stagedUpdate: tamperedStagedUpdate,
      activatedRecord,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('activation_staged_update_mismatch')
  })

  it('ready_to_activate rejects tampered staged update overrides', () => {
    const staged = operationAtStaged()
    const result = transitionPdpUpdateOperation({
      operation: staged,
      nextState: 'ready_to_activate',
      stagedUpdate: stagedUpdate({
        candidateVersion: '1.2.5',
        stagingRef: 'stage_magika_1_2_5',
        finalInstallRef: 'install_magika_1_2_5',
      }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('activation_staged_update_mismatch')
  })

  it('rejects unsafe staged refs', () => {
    let operation = createPdpUpdateOperation({ operationId: 'update_1', currentActiveRecord: activeRecord() })
    for (const nextState of ['checking', 'eligible', 'downloading', 'verifying'] as const) {
      operation = expectTransitionOk(transitionPdpUpdateOperation({ operation, nextState }))
    }
    const result = transitionPdpUpdateOperation({
      operation,
      nextState: 'staged',
      stagedUpdate: stagedUpdate({ stagingRef: 'C:\\Users\\owner\\stage' }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('unsafe_update_ref')
    expect(JSON.stringify(result)).not.toContain('C:\\Users\\owner')
  })
})

import { describe, expect, it } from 'vitest'
import {
  applySafeHealthResultToPdpRecord,
  createPdpRegistryRecord,
  disablePdpPluginRecord,
  enablePdpPluginRecord,
  markPdpPluginVerified,
  uninstallPdpPluginRecord,
} from './index'

function baseRecord() {
  return createPdpRegistryRecord({
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    controlledRootKind: 'user_local',
    installSource: 'manual_local',
    installRef: 'pkg_ref_1',
    packageRef: 'bundle_1',
    verificationStatus: 'unverified',
  })
}

describe('PDP lifecycle state transitions', () => {
  it('allows verified package to become enabled', () => {
    const verified = markPdpPluginVerified(baseRecord())
    const enabled = enablePdpPluginRecord(verified)
    expect(enabled.ok).toBe(true)
    if (!enabled.ok) return
    expect(enabled.record.registryState).toBe('enabled')
    expect(enabled.record.enabled).toBe(true)
  })

  it('prevents unverified package from becoming enabled', () => {
    const enabled = enablePdpPluginRecord(baseRecord())
    expect(enabled.ok).toBe(false)
    if (enabled.ok) return
    expect(enabled.failureReason).toBe('unsigned')
  })

  it('prevents failed package from becoming enabled', () => {
    const failed = {
      ...baseRecord(),
      registryState: 'failed' as const,
      installState: 'failed' as const,
      verificationStatus: 'failed' as const,
      failureReason: 'signature_invalid' as const,
      healthStatus: 'failed' as const,
    }
    const enabled = enablePdpPluginRecord(failed)
    expect(enabled.ok).toBe(false)
    if (enabled.ok) return
    expect(enabled.failureReason).toBe('signature_invalid')
  })

  it('allows disable transition from enabled and keeps record registered', () => {
    const verified = markPdpPluginVerified(baseRecord())
    const enabled = enablePdpPluginRecord(verified)
    expect(enabled.ok).toBe(true)
    if (!enabled.ok) return
    const disabled = disablePdpPluginRecord(enabled.record)
    expect(disabled.ok).toBe(true)
    if (!disabled.ok) return
    expect(disabled.record.registryState).toBe('disabled')
    expect(disabled.record.installState).toBe('disabled')
    expect(disabled.record.enabled).toBe(false)
  })

  it('uninstall transition is metadata-only', () => {
    const verified = markPdpPluginVerified(baseRecord())
    const uninstalled = uninstallPdpPluginRecord(verified)
    expect(uninstalled.registryState).toBe('uninstalled')
    expect(uninstalled.installState).toBe('uninstalled')
    expect(uninstalled.installRef).toBe('pkg_ref_1')
    expect(uninstalled.packageRef).toBe('bundle_1')
  })

  it('health_failed updates health/failure without changing verification status', () => {
    const verified = markPdpPluginVerified(baseRecord())
    const withHealthFailure = applySafeHealthResultToPdpRecord(verified, {
      status: 'failed',
      detail: 'runtime check failed under C:\\Users\\owner\\plugin',
    })
    expect(withHealthFailure.healthStatus).toBe('failed')
    expect(withHealthFailure.failureReason).toBe('health_failed')
    expect(withHealthFailure.verificationStatus).toBe('verified')
    expect(JSON.stringify(withHealthFailure.diagnostics)).not.toContain('C:\\Users\\owner')
  })
})

describe('PDP health integration seam', () => {
  it('maps healthy result to healthy lifecycle state', () => {
    const verified = markPdpPluginVerified(baseRecord())
    const mapped = applySafeHealthResultToPdpRecord(verified, { status: 'healthy' })
    expect(mapped.healthStatus).toBe('healthy')
    expect(mapped.verificationStatus).toBe('verified')
  })

  it('maps failed result to health_failed', () => {
    const verified = markPdpPluginVerified(baseRecord())
    const mapped = applySafeHealthResultToPdpRecord(verified, { status: 'failed', detail: 'exitCode=1' })
    expect(mapped.failureReason).toBe('health_failed')
    expect(mapped.healthStatus).toBe('failed')
    expect(mapped.verificationStatus).toBe('verified')
  })

  it('maps unavailable result without invalidating verification', () => {
    const verified = markPdpPluginVerified(baseRecord())
    const mapped = applySafeHealthResultToPdpRecord(verified, { status: 'unavailable', detail: 'not installed' })
    expect(mapped.healthStatus).toBe('unknown')
    expect(mapped.verificationStatus).toBe('verified')
  })
})

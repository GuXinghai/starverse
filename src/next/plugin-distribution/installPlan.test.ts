import { describe, expect, it } from 'vitest'
import {
  createVerifiedInstallPlan,
  type InstallPlanInput,
  type PluginCryptoVerificationResult,
} from './index'

function verification(overrides?: Partial<PluginCryptoVerificationResult>): PluginCryptoVerificationResult {
  return {
    ok: true,
    verificationStatus: 'verified',
    failureReasons: [],
    diagnostics: [],
    verifiedKeyId: 'targets-key-1',
    trustRootId: 'keys/targets-key-1.pem',
    cryptographicVerificationPerformed: true,
    executableTrustApproved: true,
    ...overrides,
  }
}

function input(overrides?: Partial<InstallPlanInput>): InstallPlanInput {
  return {
    verification: verification(),
    controlledRootKind: 'user_local',
    packageIdentity: {
      pluginId: 'magika-managed',
      pluginVersion: '1.2.3',
      runtimeKind: 'managed',
    },
    artifactSummary: {
      artifactCount: 5,
      requiredArtifactCount: 5,
      classes: { runtime: 1, manifest: 1, signature: 1, license: 1, attribution: 1 },
    },
    stagingRef: 'stage_magika_1_2_3',
    finalInstallRef: 'install_magika_1_2_3',
    ...overrides,
  }
}

describe('createVerifiedInstallPlan', () => {
  it('creates install plan for verified package', () => {
    const result = createVerifiedInstallPlan(input())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.stateTransitions).toEqual(['staged', 'installing', 'installed'])
    expect(result.plan.extractionDeferred).toBe(true)
  })

  it('rejects unverified package', () => {
    const result = createVerifiedInstallPlan(
      input({
        verification: verification({
          ok: false,
          verificationStatus: 'failed',
          executableTrustApproved: false,
          failureReasons: ['signature_invalid'],
        }),
      })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('package_unverified')
  })

  it('rejects incompatible package', () => {
    const result = createVerifiedInstallPlan(
      input({
        verification: verification({
          ok: false,
          verificationStatus: 'failed',
          executableTrustApproved: false,
          failureReasons: ['incompatible_platform'],
        }),
      })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('package_incompatible')
  })

  it('rejects unsafe root kind', () => {
    const result = createVerifiedInstallPlan(input({ controlledRootKind: 'program_files' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('install_root_unsafe')
  })

  it('rejects path traversal install refs', () => {
    const result = createVerifiedInstallPlan(input({ finalInstallRef: '../escape' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReasons).toContain('package_path_unsafe')
  })

  it('sanitizes diagnostics', () => {
    const result = createVerifiedInstallPlan(input({ stagingRef: 'C:\\Users\\owner\\stage' }))
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('C:\\Users\\owner')
  })
})

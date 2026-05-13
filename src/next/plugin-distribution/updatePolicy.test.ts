import { describe, expect, it } from 'vitest'
import {
  evaluatePdpUpdateEligibility,
  type PdpInstalledPluginVersion,
  type PdpUpdateCandidate,
  type PdpUpdateEnvironment,
  type PdpUpdateEligibilityResult,
} from './index'

function current(overrides?: Partial<PdpInstalledPluginVersion>): PdpInstalledPluginVersion {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    channel: 'stable',
    ...overrides,
  }
}

function candidate(overrides?: Partial<PdpUpdateCandidate>): PdpUpdateCandidate {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.4',
    runtimeKind: 'managed',
    channel: 'stable',
    compatibility: {
      platforms: ['win32'],
      architectures: ['x64'],
      starverseVersionRange: '>=0.0.2',
    },
    verificationStatus: 'verified',
    executableTrustApproved: true,
    failureReason: null,
    ...overrides,
  }
}

function environment(overrides?: Partial<PdpUpdateEnvironment>): PdpUpdateEnvironment {
  return {
    platform: 'win32',
    architecture: 'x64',
    appVersion: '1.2.3',
    allowedChannel: 'stable',
    ...overrides,
  }
}

function expectNotEligible(result: PdpUpdateEligibilityResult): Extract<PdpUpdateEligibilityResult, { ok: false }> {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('expected update candidate to be rejected')
  return result
}

// eslint-disable-next-line max-lines-per-function
describe('evaluatePdpUpdateEligibility', () => {
  it('allows a newer compatible verified version', () => {
    const result = evaluatePdpUpdateEligibility(current(), candidate(), environment())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.status).toBe('eligible')
    expect(result.candidateVersion).toBe('1.2.4')
    expect(result.candidateChannel).toBe('stable')
  })

  it('rejects the same version as not an update', () => {
    const result = evaluatePdpUpdateEligibility(
      current(),
      candidate({ pluginVersion: '1.2.3' }),
      environment()
    )
    expect(expectNotEligible(result).failureReasons).toContain('same_version')
  })

  it('rejects lower versions as update downgrades', () => {
    const result = evaluatePdpUpdateEligibility(
      current(),
      candidate({ pluginVersion: '1.2.2' }),
      environment()
    )
    expect(expectNotEligible(result).failureReasons).toContain('downgrade_blocked')
  })

  it('rejects incompatible platform and app version', () => {
    const result = evaluatePdpUpdateEligibility(
      current(),
      candidate({
        compatibility: {
          platforms: ['linux'],
          architectures: ['x64'],
          starverseVersionRange: '>=2.0.0',
        },
      }),
      environment()
    )
    expect(expectNotEligible(result).failureReasons).toEqual(
      expect.arrayContaining(['incompatible_platform', 'incompatible_app_version'])
    )
  })

  it('rejects unverified candidates', () => {
    const result = evaluatePdpUpdateEligibility(
      current(),
      candidate({ verificationStatus: 'unverified', executableTrustApproved: false }),
      environment()
    )
    expect(expectNotEligible(result).failureReasons).toEqual(
      expect.arrayContaining(['candidate_unverified', 'candidate_not_trusted'])
    )
  })

  it('makes prerelease channel behavior explicit', () => {
    const stableOnly = evaluatePdpUpdateEligibility(
      current(),
      candidate({ pluginVersion: '1.3.0-beta.1', channel: undefined }),
      environment({ allowedChannel: 'stable' })
    )
    expect(expectNotEligible(stableOnly).failureReasons).toContain('channel_not_allowed')

    const betaAllowed = evaluatePdpUpdateEligibility(
      current(),
      candidate({ pluginVersion: '1.3.0-beta.1', channel: undefined }),
      environment({ allowedChannel: 'beta' })
    )
    expect(betaAllowed.ok).toBe(true)
  })

  it('rejects prerelease versions that claim stable channel', () => {
    const result = evaluatePdpUpdateEligibility(
      current(),
      candidate({ pluginVersion: '1.3.0-beta.1', channel: 'stable' }),
      environment({ allowedChannel: 'stable' })
    )
    expect(expectNotEligible(result).failureReasons).toContain('channel_version_mismatch')
  })

  it('rejects candidates that carry integrity failure metadata', () => {
    for (const failureReason of ['hash_mismatch', 'integrity_missing'] as const) {
      const result = evaluatePdpUpdateEligibility(
        current(),
        candidate({ failureReason }),
        environment()
      )
      expect(expectNotEligible(result).failureReasons).toContain(failureReason)
    }
  })

  it('sanitizes diagnostics', () => {
    const result = evaluatePdpUpdateEligibility(
      current({ pluginId: 'C:\\Users\\owner\\plugin' }),
      candidate({ pluginId: 'magika-managed' }),
      environment()
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('C:\\Users\\owner')
  })
})

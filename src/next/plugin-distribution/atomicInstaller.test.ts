import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  PLUGIN_TARGETS_SCHEMA_VERSION,
  PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
  createVerifiedInstallPlan,
  finalizeAtomicInstallPlan,
  type PdpPluginRegistryRecord,
  type PluginInstallPlan,
} from './index'

function plan(overrides?: Partial<PluginInstallPlan>): PluginInstallPlan {
  return {
    verificationProof: {
      status: 'cryptographic_ed25519_verified',
      verifiedKeyId: 'targets-key-1',
      trustRootId: 'keys/targets-key-1.pem',
    },
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    controlledRootKind: 'user_local',
    stagingRef: 'stage_magika_1_2_3',
    finalInstallRef: 'install_magika_1_2_3',
    previousInstallRef: null,
    artifactSummary: {
      artifactCount: 5,
      requiredArtifactCount: 5,
      classes: { runtime: 1, manifest: 1, signature: 1, license: 1, attribution: 1 },
    },
    stateTransitions: ['staged', 'installing', 'installed'],
    extractionDeferred: true,
    ...overrides,
  }
}

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

// eslint-disable-next-line max-lines-per-function
describe('finalizeAtomicInstallPlan', () => {
  it('finalizes staged plan as installed but not enabled', () => {
    const result = finalizeAtomicInstallPlan({
      plan: plan(),
      controlledRoot: { rootKind: 'user_local', rootRef: 'user_plugins_root' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.installState).toBe('installed')
    expect(result.record.verificationStatus).toBe('verified')
    expect(result.record.enabled).toBe(false)
    expect(result.cleanupRefs).toEqual(['stage_magika_1_2_3'])
  })

  it('rejects controlled root kind mismatch', () => {
    const result = finalizeAtomicInstallPlan({
      plan: plan(),
      controlledRoot: { rootKind: 'portable', rootRef: 'portable_plugins_root' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReason).toBe('install_root_unsafe')
  })

  it('rejects root refs that look like paths or symlink escape targets', () => {
    const result = finalizeAtomicInstallPlan({
      plan: plan(),
      controlledRoot: { rootKind: 'user_local', rootRef: 'C:\\Users\\owner\\plugins' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReason).toBe('install_root_unsafe')
  })

  it('leaves previous install untouched when finalization fails', () => {
    const previous = previousRecord()
    const result = finalizeAtomicInstallPlan({
      plan: plan(),
      controlledRoot: { rootKind: 'user_local', rootRef: 'user_plugins_root' },
      existingRecord: previous,
      simulateFinalizeFailure: true,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.previousRecord).toEqual(previous)
    expect(result.record).toEqual(previous)
  })

  it('rejects forged plans without verification proof', () => {
    const forged = { ...plan(), verificationProof: undefined } as unknown as PluginInstallPlan
    const result = finalizeAtomicInstallPlan({
      plan: forged,
      controlledRoot: { rootKind: 'user_local', rootRef: 'user_plugins_root' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failureReason).toBe('package_unverified')
  })

  it('does not emit unsafe cleanup refs from forged early-failure plans', () => {
    const forged = {
      ...plan({ stagingRef: 'C:\\Users\\owner\\stage' }),
      verificationProof: undefined,
    } as unknown as PluginInstallPlan
    const result = finalizeAtomicInstallPlan({
      plan: forged,
      controlledRoot: { rootKind: 'user_local', rootRef: 'user_plugins_root' },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.cleanupRefs).toEqual([])
    expect(JSON.stringify(result)).not.toContain('C:\\Users\\owner')
  })

  it('rejects mismatched existing records instead of rewriting identity', () => {
    const previous = previousRecord({ pluginId: 'other-plugin' })
    const result = finalizeAtomicInstallPlan({
      plan: plan(),
      controlledRoot: { rootKind: 'user_local', rootRef: 'user_plugins_root' },
      existingRecord: previous,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('registry_identity_mismatch')
    expect(result.record).toEqual(previous)
  })

  it('does not delete arbitrary paths; cleanup refs are owned staging tokens only', () => {
    const result = finalizeAtomicInstallPlan({
      plan: plan(),
      controlledRoot: { rootKind: 'user_local', rootRef: 'user_plugins_root' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cleanupRefs).toEqual(['stage_magika_1_2_3'])
    expect(JSON.stringify(result.cleanupRefs)).not.toContain('\\')
    expect(JSON.stringify(result.cleanupRefs)).not.toContain('/')
  })

  it('sanitizes diagnostics', () => {
    const result = finalizeAtomicInstallPlan({
      plan: plan(),
      controlledRoot: { rootKind: 'user_local', rootRef: 'C:\\Users\\owner\\plugins' },
    })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('C:\\Users\\owner')
  })

  it('finalizes a plan built from real crypto verifier proof shape', async () => {
    const { verifyPluginPackageCryptographicTrust } = await import('./cryptoVerification')
    const payload = Buffer.from('verified package bytes', 'utf8')
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const verification = verifyPluginPackageCryptographicTrust({
      targetBytes: payload,
      signatureEnvelope: {
        signatureSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
        keyId: 'targets-key-1',
        algorithm: 'ed25519',
        signedAt: '2026-05-12T00:00:00.000Z',
        expiresAt: '2026-06-12T00:00:00.000Z',
        value: sign(null, payload, privateKey).toString('base64'),
      },
      trustRoot: {
        rootSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
        rootVersion: 1,
        generatedAt: '2026-05-12T00:00:00.000Z',
        expiresAt: '2026-06-12T00:00:00.000Z',
        keys: [
          {
            keyId: 'targets-key-1',
            algorithm: 'ed25519',
            publicKeyRef: 'keys/targets-key-1.pem',
            role: 'targets',
          },
        ],
        snapshotRole: 'reserved',
        timestampRole: 'reserved',
        delegatedRoles: 'reserved',
      },
      targetMetadata: {
        targetsSchemaVersion: PLUGIN_TARGETS_SCHEMA_VERSION,
        pluginId: 'magika-managed',
        pluginVersion: '1.2.3',
        packageSha256: createHash('sha256').update(payload).digest('hex'),
        packageSizeBytes: payload.byteLength,
        expiresAt: '2026-06-12T00:00:00.000Z',
        signatureRef: 'signatures/magika-managed.sig',
      },
      trustedKeys: [{ publicKeyRef: 'keys/targets-key-1.pem', publicKeyPem }],
      now: new Date('2026-05-12T00:00:00.000Z'),
      compatibility: {
        platforms: ['win32'],
        architectures: ['x64'],
        starverseVersionRange: '>=0.0.2',
      },
      environment: { platform: 'win32', architecture: 'x64', appVersion: '1.2.3' },
    })
    expect(verification.ok).toBe(true)

    const installPlan = createVerifiedInstallPlan({
      verification,
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
    })
    expect(installPlan.ok).toBe(true)
    if (!installPlan.ok) return

    const result = finalizeAtomicInstallPlan({
      plan: installPlan.plan,
      controlledRoot: { rootKind: 'user_local', rootRef: 'user_plugins_root' },
    })
    expect(result.ok).toBe(true)
  })
})

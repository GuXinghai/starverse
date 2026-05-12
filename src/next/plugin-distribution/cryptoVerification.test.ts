import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  PLUGIN_TARGETS_SCHEMA_VERSION,
  PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
  verifyPluginPackageCryptographicTrust,
  type PluginCryptoVerificationInput,
} from './index'

const NOW = new Date('2026-05-12T00:00:00.000Z')
const FUTURE = '2026-06-12T00:00:00.000Z'
const PAST = '2026-05-01T00:00:00.000Z'
const MANIFEST_SHA = 'a'.repeat(64)
const INVENTORY_SHA = 'b'.repeat(64)

function hashPayload(payload: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(payload)).digest('hex')
}

function keyFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  return { privateKey, publicKeyPem }
}

function validInput(overrides?: Partial<PluginCryptoVerificationInput>): PluginCryptoVerificationInput {
  const payload = Buffer.from('verified package bytes', 'utf8')
  const keys = keyFixture()
  const signatureValue = sign(null, payload, keys.privateKey).toString('base64')
  return {
    targetBytes: payload,
    signatureEnvelope: {
      signatureSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
      keyId: 'targets-key-1',
      algorithm: 'ed25519',
      signedAt: '2026-05-12T00:00:00.000Z',
      expiresAt: FUTURE,
      value: signatureValue,
      coveredManifestSha256: MANIFEST_SHA,
      coveredInventorySha256: INVENTORY_SHA,
    },
    trustRoot: {
      rootSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
      rootVersion: 1,
      generatedAt: '2026-05-12T00:00:00.000Z',
      expiresAt: FUTURE,
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
      packageSha256: hashPayload(payload),
      packageSizeBytes: payload.byteLength,
      expiresAt: FUTURE,
      signatureRef: 'signatures/magika-managed.sig',
    },
    trustedKeys: [{ publicKeyRef: 'keys/targets-key-1.pem', publicKeyPem: keys.publicKeyPem }],
    now: NOW,
    expectedManifestSha256: MANIFEST_SHA,
    expectedInventorySha256: INVENTORY_SHA,
    compatibility: {
      platforms: ['win32'],
      architectures: ['x64'],
      starverseVersionRange: '>=0.0.2',
    },
    environment: { platform: 'win32', architecture: 'x64', appVersion: '1.2.3' },
    ...overrides,
  }
}

// eslint-disable-next-line max-lines-per-function
describe('verifyPluginPackageCryptographicTrust', () => {
  it('passes a valid Ed25519 signed payload', () => {
    const result = verifyPluginPackageCryptographicTrust(validInput())
    expect(result.ok).toBe(true)
    expect(result.verificationStatus).toBe('verified')
    expect(result.cryptographicVerificationPerformed).toBe(true)
    expect(result.executableTrustApproved).toBe(true)
    expect(result.verifiedKeyId).toBe('targets-key-1')
    expect(result.trustRootId).toBe('keys/targets-key-1.pem')
  })

  it('fails when signature metadata is missing', () => {
    const result = verifyPluginPackageCryptographicTrust(
      validInput({ signatureEnvelope: null })
    )
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toEqual(expect.arrayContaining(['signature_missing', 'unsigned']))
    expect(result.cryptographicVerificationPerformed).toBe(false)
  })

  it('fails unsupported signature algorithms', () => {
    const input = validInput()
    const result = verifyPluginPackageCryptographicTrust({
      ...input,
      signatureEnvelope: { ...(input.signatureEnvelope as Record<string, unknown>), algorithm: 'rsa-pss' },
    })
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('signature_algorithm_unsupported')
  })

  it('fails unknown key ids', () => {
    const input = validInput()
    const result = verifyPluginPackageCryptographicTrust({
      ...input,
      signatureEnvelope: { ...(input.signatureEnvelope as Record<string, unknown>), keyId: 'unknown-key' },
    })
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('trusted_root_missing')
  })

  it('fails invalid signatures', () => {
    const input = validInput()
    const { privateKey } = keyFixture()
    const wrongSignature = sign(null, Buffer.from('different payload'), privateKey).toString('base64')
    const result = verifyPluginPackageCryptographicTrust({
      ...input,
      signatureEnvelope: {
        ...(input.signatureEnvelope as Record<string, unknown>),
        value: wrongSignature,
      },
    })
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('signature_invalid')
    expect(result.cryptographicVerificationPerformed).toBe(true)
  })

  it('fails expired signature metadata', () => {
    const input = validInput()
    const result = verifyPluginPackageCryptographicTrust({
      ...input,
      signatureEnvelope: { ...(input.signatureEnvelope as Record<string, unknown>), expiresAt: PAST },
    })
    expect(result.ok).toBe(false)
    expect(result.verificationStatus).toBe('expired')
    expect(result.failureReasons).toContain('expired_metadata')
  })

  it('fails hash mismatch', () => {
    const input = validInput()
    const result = verifyPluginPackageCryptographicTrust({
      ...input,
      targetMetadata: {
        ...(input.targetMetadata as Record<string, unknown>),
        packageSha256: 'c'.repeat(64),
      },
    })
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('hash_mismatch')
  })

  it('fails size mismatch', () => {
    const input = validInput()
    const result = verifyPluginPackageCryptographicTrust({
      ...input,
      targetMetadata: {
        ...(input.targetMetadata as Record<string, unknown>),
        packageSizeBytes: 1,
      },
    })
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('integrity_missing')
  })

  it('fails rollback versions', () => {
    const result = verifyPluginPackageCryptographicTrust(
      validInput({ previousTrustedVersion: '2.0.0' })
    )
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('rollback_detected')
  })

  it('fails closed when compatibility environment is omitted', () => {
    const result = verifyPluginPackageCryptographicTrust(
      validInput({ environment: undefined })
    )
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toEqual(
      expect.arrayContaining(['incompatible_platform', 'incompatible_arch', 'incompatible_app_version'])
    )
    expect(result.cryptographicVerificationPerformed).toBe(false)
  })

  it('fails incompatible platform and app version', () => {
    const result = verifyPluginPackageCryptographicTrust(
      validInput({ environment: { platform: 'linux', architecture: 'x64', appVersion: '0.0.1' } })
    )
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toEqual(
      expect.arrayContaining(['incompatible_platform', 'incompatible_app_version'])
    )
  })

  it('fails malformed platform and architecture context', () => {
    const result = verifyPluginPackageCryptographicTrust(
      validInput({ environment: { platform: 'sunos', architecture: 'ia32', appVersion: '1.2.3' } })
    )
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toEqual(
      expect.arrayContaining(['incompatible_platform', 'incompatible_arch'])
    )
  })

  it('sanitizes diagnostics', () => {
    const input = validInput()
    const result = verifyPluginPackageCryptographicTrust({
      ...input,
      targetMetadata: {
        ...(input.targetMetadata as Record<string, unknown>),
        signatureRef: 'C:\\Users\\owner\\plugin\\signature.sig',
      },
      signatureEnvelope: {
        ...(input.signatureEnvelope as Record<string, unknown>),
        value: 'not-base64!',
      },
    })
    const serialized = JSON.stringify(result.diagnostics)
    expect(serialized).not.toContain('C:\\Users\\owner')
    expect(serialized).not.toContain(MANIFEST_SHA)
  })
})

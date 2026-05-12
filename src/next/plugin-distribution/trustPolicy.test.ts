import { describe, expect, it } from 'vitest'
import {
  PLUGIN_TARGETS_SCHEMA_VERSION,
  PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
  detectPluginVersionRollback,
  validatePluginSignatureEnvelope,
  validatePluginTargetsMetadata,
  validatePluginTrustRootMetadata,
} from './index'

const HEX_A = 'a'.repeat(64)

function trustRoot(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    rootSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
    rootVersion: 1,
    generatedAt: '2026-05-12T00:00:00.000Z',
    expiresAt: '2026-06-12T00:00:00.000Z',
    keys: [
      {
        keyId: 'starverse-offline-root-v1',
        algorithm: 'ed25519',
        publicKeyRef: 'keys/root-v1.pem',
        role: 'root',
      },
    ],
    snapshotRole: 'reserved',
    timestampRole: 'reserved',
    delegatedRoles: 'reserved',
    ...overrides,
  }
}

function targets(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    targetsSchemaVersion: PLUGIN_TARGETS_SCHEMA_VERSION,
    targetsVersion: 2,
    generatedAt: '2026-05-12T00:00:00.000Z',
    expiresAt: '2026-06-12T00:00:00.000Z',
    targets: [
      {
        pluginId: 'magika-managed',
        pluginVersion: '1.2.3',
        packageSha256: HEX_A,
        packageSizeBytes: 123,
        expiresAt: '2026-06-12T00:00:00.000Z',
        signatureRef: 'signatures/magika-managed.sig',
      },
    ],
    snapshotRole: 'reserved',
    timestampRole: 'reserved',
    delegatedRoles: 'reserved',
    ...overrides,
  }
}

describe('trust policy contracts', () => {
  it('accepts minimal root metadata with reserved future roles', () => {
    const result = validatePluginTrustRootMetadata(trustRoot(), {
      now: new Date('2026-05-12T00:00:00.000Z'),
    })
    expect(result.ok).toBe(true)
  })

  it('rejects implemented snapshot/timestamp/delegated roles in Phase 1', () => {
    const result = validatePluginTrustRootMetadata(
      trustRoot({
        snapshotRole: { implemented: true },
        timestampRole: 'implemented',
        delegatedRoles: [],
      }),
      { now: new Date('2026-05-12T00:00:00.000Z') }
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.filter((error) => error.code === 'reserved_role_not_deferred')).toHaveLength(3)
  })

  it('flags lower targets metadata versions as rollback', () => {
    const result = validatePluginTargetsMetadata(targets({ targetsVersion: 1 }), {
      previousTargetsVersion: 2,
      now: new Date('2026-05-12T00:00:00.000Z'),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.code === 'rollback_detected')).toBe(true)
  })

  it('validates signature metadata shape without doing cryptographic verification', () => {
    const result = validatePluginSignatureEnvelope(
      {
        signatureSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
        keyId: 'starverse-offline-root-v1',
        algorithm: 'ed25519',
        signedAt: '2026-05-12T00:00:00.000Z',
        expiresAt: '2026-06-12T00:00:00.000Z',
        value: 'base64-signature-placeholder',
        coveredManifestSha256: HEX_A,
      },
      { now: new Date('2026-05-12T00:00:00.000Z') }
    )
    expect(result.ok).toBe(true)
  })

  it('provides a version monotonicity helper', () => {
    expect(detectPluginVersionRollback('1.0.0', '2.0.0')).toEqual({
      ok: false,
      reason: 'rollback_detected',
    })
    expect(detectPluginVersionRollback('2.0.1', '2.0.0')).toEqual({ ok: true })
  })
})

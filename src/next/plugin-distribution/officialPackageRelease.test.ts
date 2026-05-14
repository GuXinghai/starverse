import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  PLUGIN_CATALOG_SCHEMA_VERSION,
  PLUGIN_TARGETS_SCHEMA_VERSION,
  PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
  verifyOfficialPackageReleaseDownload,
  type OfficialPackageReleaseMetadata,
} from './index'

const BYTES = Buffer.from('official package bytes', 'utf8')
const SHA = createHash('sha256').update(BYTES).digest('hex')
const MANIFEST_SHA = 'a'.repeat(64)
const INVENTORY_SHA = 'b'.repeat(64)
const NOW = new Date('2026-05-14T00:00:00.000Z')
const EXPIRES_AT = '2027-05-14T00:00:00.000Z'
const RELEASE_URL =
  'https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v0.1.0/starverse-plugin-magika-0.1.0-win32-x64.zip'

function release(overrides?: Partial<OfficialPackageReleaseMetadata>): OfficialPackageReleaseMetadata {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const keyId = 'starverse-pdp-ed25519-prod-test'
  const publicKeyRef = 'keys/starverse-pdp-ed25519-prod-test.public.pem'
  return {
    catalogEntry: {
      pluginId: 'magika',
      pluginVersion: '0.1.0',
      runtimeKind: 'managed',
      platform: 'win32',
      arch: 'x64',
      packageRef: 'starverse-plugin-magika-v0.1.0/starverse-plugin-magika-0.1.0-win32-x64.zip',
      packageSha256: SHA,
      packageSizeBytes: BYTES.byteLength,
      manifestSha256: MANIFEST_SHA,
      inventorySha256: INVENTORY_SHA,
      signatureRef: 'signatures/starverse-plugin-magika-0.1.0-win32-x64.sig',
      compatibility: {
        platforms: ['win32'],
        architectures: ['x64'],
        starverseVersionRange: '>=0.0.0',
      },
      channel: 'stable',
    },
    releaseUrl: RELEASE_URL,
    remoteInstallEnabled: true,
    downloadPolicy: {
      maxBytes: 1024,
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    },
    signatureEnvelope: {
      signatureSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
      keyId,
      algorithm: 'ed25519',
      signedAt: '2026-05-14T00:00:00.000Z',
      expiresAt: EXPIRES_AT,
      value: sign(null, BYTES, privateKey).toString('base64'),
      coveredManifestSha256: MANIFEST_SHA,
      coveredInventorySha256: INVENTORY_SHA,
    },
    trustRoot: {
      rootSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
      rootVersion: 1,
      generatedAt: '2026-05-14T00:00:00.000Z',
      expiresAt: EXPIRES_AT,
      keys: [{ keyId, algorithm: 'ed25519', publicKeyRef, role: 'targets' }],
      snapshotRole: 'reserved',
      timestampRole: 'reserved',
      delegatedRoles: 'reserved',
    },
    trustedKeys: [{ publicKeyRef, publicKeyPem }],
    targetMetadata: {
      pluginId: 'magika',
      pluginVersion: '0.1.0',
      packageSha256: SHA,
      packageSizeBytes: BYTES.byteLength,
      expiresAt: EXPIRES_AT,
      signatureRef: 'signatures/starverse-plugin-magika-0.1.0-win32-x64.sig',
    },
    compatibility: {
      platforms: ['win32'],
      architectures: ['x64'],
      starverseVersionRange: '>=0.0.0',
    },
    ...overrides,
  }
}

describe('verifyOfficialPackageReleaseDownload', () => {
  it('downloads official GitHub release bytes and approves cryptographic package trust', async () => {
    const result = await verifyOfficialPackageReleaseDownload({
      release: release(),
      environment: { platform: 'win32', architecture: 'x64', appVersion: '0.0.2' },
      now: NOW,
      transport: {
        async fetchPackage(request) {
          expect(request.transportRef).toBe(RELEASE_URL)
          return {
            ok: true,
            bytes: BYTES,
            finalRef: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/pkg.zip',
          }
        },
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.status).toBe('downloaded_verified_trusted')
    expect(result.crypto.executableTrustApproved).toBe(true)
    expect(result.stagedPackage.sha256).toBe(SHA)
  })

  it('fails closed when remote install is disabled', async () => {
    const result = await verifyOfficialPackageReleaseDownload({
      release: release({ remoteInstallEnabled: false }),
      environment: { platform: 'win32', architecture: 'x64', appVersion: '0.0.2' },
      now: NOW,
      transport: {
        async fetchPackage() {
          throw new Error('transport should not run')
        },
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe('blocked')
      expect(result.failureReasons).toContain('remote_install_disabled')
    }
  })

  it('fails closed on a non-official final redirect host', async () => {
    const result = await verifyOfficialPackageReleaseDownload({
      release: release(),
      environment: { platform: 'win32', architecture: 'x64', appVersion: '0.0.2' },
      now: NOW,
      transport: {
        async fetchPackage() {
          return {
            ok: true,
            bytes: BYTES,
            finalRef: 'https://example.test/pkg.zip',
          }
        },
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe('download_failed')
      expect(result.failureReasons).toContain('redirect_rejected')
    }
  })

  it('keeps catalog metadata safe for the read-only catalog validator', () => {
    expect(release().catalogEntry.packageRef).not.toMatch(/^https?:/iu)
    expect(PLUGIN_TARGETS_SCHEMA_VERSION).toBe('1')
    expect(PLUGIN_CATALOG_SCHEMA_VERSION).toBe('1')
  })
})

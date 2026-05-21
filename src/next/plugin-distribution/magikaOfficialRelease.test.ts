import { createHash, createPublicKey } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  MAGIKA_OFFICIAL_CATALOG_METADATA,
  MAGIKA_OFFICIAL_PACKAGE_SHA256,
  MAGIKA_OFFICIAL_PACKAGE_SIZE_BYTES,
  MAGIKA_OFFICIAL_PUBLIC_KEY_FINGERPRINT_SHA256,
  MAGIKA_OFFICIAL_PUBLIC_KEY_PEM,
  MAGIKA_OFFICIAL_RELEASE_METADATA,
  MAGIKA_OFFICIAL_RELEASE_URL,
  buildMagikaOfficialCatalogReadModel,
  validatePluginCatalogMetadata,
  validatePluginSignatureEnvelope,
  validatePluginTrustRootMetadata,
  verifyOfficialPackageReleaseDownload,
} from './index'
import { createOfficialTrustedRoots } from '../file-type/officialPluginTrustedRoots'

describe('Magika official release metadata', () => {
  it('exposes a production-enabled GitHub release target with exact immutable metadata', () => {
    expect(MAGIKA_OFFICIAL_RELEASE_METADATA.remoteInstallEnabled).toBe(true)
    expect(MAGIKA_OFFICIAL_RELEASE_URL).toBe(
      'https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v0.1.1/starverse-plugin-magika-0.1.1-win32-x64.zip'
    )
    expect(MAGIKA_OFFICIAL_RELEASE_METADATA.catalogEntry).toMatchObject({
      pluginId: 'magika',
      pluginVersion: '0.1.1',
      runtimeKind: 'managed',
      platform: 'win32',
      arch: 'x64',
      packageSha256: MAGIKA_OFFICIAL_PACKAGE_SHA256,
      packageSizeBytes: MAGIKA_OFFICIAL_PACKAGE_SIZE_BYTES,
    })
    expect(MAGIKA_OFFICIAL_RELEASE_METADATA.catalogEntry.packageRef).not.toMatch(/^https?:/iu)
    expect(MAGIKA_OFFICIAL_PUBLIC_KEY_FINGERPRINT_SHA256).toBe(
      '726297001d097a0e1c348f9012dcbc356a70b4cc823310e09cfe7faee6c7a2c9'
    )
    const der = createPublicKey(MAGIKA_OFFICIAL_RELEASE_METADATA.trustedKeys[0]!.publicKeyPem).export({
      type: 'spki',
      format: 'der',
    })
    expect(createHash('sha256').update(der).digest('hex')).toBe(MAGIKA_OFFICIAL_PUBLIC_KEY_FINGERPRINT_SHA256)
  })

  it('passes catalog, signature, and trust-root metadata validators', () => {
    const catalog = validatePluginCatalogMetadata(MAGIKA_OFFICIAL_CATALOG_METADATA, {
      now: new Date('2026-05-22T00:10:00.000Z'),
    })
    const signature = validatePluginSignatureEnvelope(MAGIKA_OFFICIAL_RELEASE_METADATA.signatureEnvelope, {
      now: new Date('2026-05-22T00:10:00.000Z'),
    })
    const trustRoot = validatePluginTrustRootMetadata(MAGIKA_OFFICIAL_RELEASE_METADATA.trustRoot, {
      now: new Date('2026-05-22T00:10:00.000Z'),
    })

    expect(catalog.ok).toBe(true)
    expect(signature.ok).toBe(true)
    expect(trustRoot.ok).toBe(true)
  })
})

describe('Magika official release read model', () => {
  it('builds the read model only when the production trusted root is configured', () => {
    const configured = buildMagikaOfficialCatalogReadModel({
      trustedRoots: createOfficialTrustedRoots(MAGIKA_OFFICIAL_PUBLIC_KEY_PEM),
      trustedRootSource: 'official',
      now: new Date('2026-05-22T00:10:00.000Z'),
      environment: { platform: 'win32', architecture: 'x64', appVersion: '0.0.2' },
    })
    expect(configured.ok).toBe(true)
    if (configured.ok) {
      expect(configured.catalog.entries[0]).toMatchObject({
        pluginId: 'magika',
        displayName: 'Magika',
        installabilityStatus: 'official_remote_install_available',
        verificationMetadataStatus: 'production_signature_available',
      })
    }

    const missingRoot = buildMagikaOfficialCatalogReadModel({
      trustedRoots: {},
      trustedRootSource: null,
      now: new Date('2026-05-14T15:10:00.000Z'),
    })
    expect(missingRoot).toEqual({ ok: false, reason: 'official_trusted_root_unconfigured' })
  })
})

describe('Magika official release verification', () => {
  it('fails closed when the published bytes do not match catalog metadata', async () => {
    const result = await verifyOfficialPackageReleaseDownload({
      release: MAGIKA_OFFICIAL_RELEASE_METADATA,
      environment: { platform: 'win32', architecture: 'x64', appVersion: '0.0.2' },
      now: new Date('2026-05-22T00:10:00.000Z'),
      transport: {
        async fetchPackage() {
          return {
            ok: true,
            bytes: new Uint8Array([1, 2, 3]),
            finalRef: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/pkg.zip',
          }
        },
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failureReasons).toContain('size_mismatch')
    }
  })
})

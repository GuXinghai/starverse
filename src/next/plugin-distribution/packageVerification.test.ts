import { describe, expect, it } from 'vitest'
import {
  PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
  PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION,
  PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
  verifyLocalPluginPackage,
  type LocalPackageVerificationInput,
} from './index'

const HEX_A = 'a'.repeat(64)
const HEX_B = 'b'.repeat(64)
const HEX_C = 'c'.repeat(64)
const HEX_D = 'd'.repeat(64)
const HEX_E = 'e'.repeat(64)

function manifest(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    manifestSchemaVersion: PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION,
    pluginId: 'magika-managed',
    displayName: 'Magika Managed',
    publisher: 'Starverse',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    compatibility: {
      platforms: ['any'],
      architectures: ['any'],
      starverseVersionRange: '>=0.0.2',
    },
    capabilities: ['file_identification'],
    artifactInventoryRef: 'inventory.json',
    licenseRefs: ['licenses/LICENSE'],
    attributionRefs: ['attribution/NOTICE'],
    ...overrides,
  }
}

function inventory(overrides?: Record<string, unknown>): Record<string, any> {
  return {
    inventorySchemaVersion: PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    artifacts: [
      {
        artifactId: 'runtime-main',
        relativePath: 'runtime/main.bin',
        artifactClass: 'runtime',
        sha256: HEX_A,
        sizeBytes: 4,
        required: true,
      },
      {
        artifactId: 'manifest',
        relativePath: 'manifest.json',
        artifactClass: 'manifest',
        sha256: HEX_B,
        sizeBytes: 4,
        required: true,
      },
      {
        artifactId: 'signature',
        relativePath: 'signatures/package.sig',
        artifactClass: 'signature',
        sha256: HEX_C,
        sizeBytes: 4,
        required: true,
      },
      {
        artifactId: 'license',
        relativePath: 'licenses/LICENSE',
        artifactClass: 'license',
        sha256: HEX_D,
        sizeBytes: 4,
        required: true,
      },
      {
        artifactId: 'attribution',
        relativePath: 'attribution/NOTICE',
        artifactClass: 'attribution',
        sha256: HEX_E,
        sizeBytes: 4,
        required: true,
      },
    ],
    ...overrides,
  }
}

function signatureMetadata(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    signatureSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
    keyId: 'root-key-1',
    algorithm: 'ed25519',
    signedAt: '2026-05-12T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    value: 'sig-value',
    coveredManifestSha256: HEX_A,
    coveredInventorySha256: HEX_B,
    ...overrides,
  }
}

// eslint-disable-next-line max-lines-per-function
function verificationInput(overrides?: Partial<LocalPackageVerificationInput>): LocalPackageVerificationInput {
  return {
    manifest: manifest(),
    inventory: inventory(),
    packageSha256: HEX_A,
    signatureMetadata: signatureMetadata(),
    trustPolicy: { requireSignedPackages: true },
    environment: {
      platform: 'win32',
      architecture: 'x64',
      appVersion: '1.2.3',
    },
    ...overrides,
  }
}

// eslint-disable-next-line max-lines-per-function
describe('verifyLocalPluginPackage', () => {
  it('passes a valid local package descriptor', () => {
    const result = verifyLocalPluginPackage(verificationInput())
    expect(result.ok).toBe(true)
    expect(result.status).toBe('verified_metadata_only')
    expect(result.failureReasons).toEqual([])
    expect(result.trust.signatureMetadataPresent).toBe(true)
    expect(result.trust.cryptographicVerificationDeferred).toBe(true)
    expect(result.trust.executableTrustApproved).toBe(false)
  })

  it('fails when signature metadata is required but missing', () => {
    const result = verifyLocalPluginPackage(
      verificationInput({
        inventory: inventory(),
        signatureMetadata: null,
      })
    )
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toEqual(expect.arrayContaining(['signature_missing', 'unsigned']))
  })

  it('returns unsigned failure reason for unsigned package', () => {
    const inv = inventory({
      artifacts: inventory().artifacts.filter(
        (item: { artifactClass: string }) => item.artifactClass !== 'signature'
      ),
    })
    const result = verifyLocalPluginPackage(
      verificationInput({
        inventory: inv,
        signatureMetadata: undefined,
      })
    )
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('unsigned')
  })

  it('fails on invalid inventory artifact hash', () => {
    const inv = inventory()
    inv.artifacts[0].sha256 = 'not-a-sha'
    const result = verifyLocalPluginPackage(verificationInput({ inventory: inv }))
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('hash_mismatch')
  })

  it('fails when platform is incompatible', () => {
    const result = verifyLocalPluginPackage(
      verificationInput({
        manifest: manifest({
          compatibility: {
            platforms: ['linux'],
            architectures: ['x64'],
            starverseVersionRange: '>=0.0.2',
          },
        }),
        environment: {
          platform: 'win32',
          architecture: 'x64',
          appVersion: '1.2.3',
        },
      })
    )
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('incompatible_platform')
  })

  it('fails when app version is incompatible', () => {
    const result = verifyLocalPluginPackage(
      verificationInput({
        manifest: manifest({
          compatibility: {
            platforms: ['any'],
            architectures: ['any'],
            starverseVersionRange: '>=2.0.0',
          },
        }),
        environment: {
          platform: 'win32',
          architecture: 'x64',
          appVersion: '1.2.3',
        },
      })
    )
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('incompatible_app_version')
  })

  it('fails on unsafe artifact path', () => {
    const inv = inventory()
    inv.artifacts[0].relativePath = 'C:\\Users\\owner\\plugin\\runtime.bin'
    const result = verifyLocalPluginPackage(verificationInput({ inventory: inv }))
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('package_path_unsafe')
  })

  it('does not leak absolute paths in diagnostics', () => {
    const inv = inventory()
    inv.artifacts[0].relativePath = 'C:\\Users\\owner\\plugin\\runtime.bin'
    const result = verifyLocalPluginPackage(verificationInput({ inventory: inv }))
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result.diagnostics)).not.toContain('C:\\Users\\owner')
  })
})

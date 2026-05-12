import { describe, expect, it } from 'vitest'
import {
  LOCAL_INSTALL_SOURCE,
  registerLocalPackage,
  verifyLocalPluginPackage,
} from './index'
import {
  PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
  PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION,
  PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
} from './types'

const HEX_A = 'a'.repeat(64)
const HEX_B = 'b'.repeat(64)
const HEX_C = 'c'.repeat(64)
const HEX_D = 'd'.repeat(64)
const HEX_E = 'e'.repeat(64)

// eslint-disable-next-line max-lines-per-function
function verificationFixture() {
  return verifyLocalPluginPackage({
    manifest: {
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
    },
    inventory: {
      inventorySchemaVersion: PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
      pluginId: 'magika-managed',
      pluginVersion: '1.2.3',
      artifacts: [
        { artifactId: 'runtime', relativePath: 'runtime/main.bin', artifactClass: 'runtime', sha256: HEX_A, sizeBytes: 1 },
        { artifactId: 'manifest', relativePath: 'manifest.json', artifactClass: 'manifest', sha256: HEX_B, sizeBytes: 1 },
        { artifactId: 'signature', relativePath: 'signature.sig', artifactClass: 'signature', sha256: HEX_C, sizeBytes: 1 },
        { artifactId: 'license', relativePath: 'licenses/LICENSE', artifactClass: 'license', sha256: HEX_D, sizeBytes: 1 },
        { artifactId: 'notice', relativePath: 'attribution/NOTICE', artifactClass: 'attribution', sha256: HEX_E, sizeBytes: 1 },
      ],
    },
    packageSha256: HEX_A,
    signatureMetadata: {
      signatureSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
      keyId: 'root-key-1',
      algorithm: 'ed25519',
      signedAt: '2026-05-12T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      value: 'sig-value',
    },
    trustPolicy: { requireSignedPackages: true },
    environment: {
      platform: 'win32',
      architecture: 'x64',
      appVersion: '1.2.3',
    },
  })
}

// eslint-disable-next-line max-lines-per-function
describe('registerLocalPackage', () => {
  it('accepts user_local controlled root', () => {
    const result = registerLocalPackage({
      controlledRootKind: 'user_local',
      installRef: 'local_pkg_1',
      packageRef: 'pkg_ref_1',
      verifiedPackage: verificationFixture(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.controlledRootKind).toBe('user_local')
    expect(result.record.installSource).toBe(LOCAL_INSTALL_SOURCE)
  })

  it('accepts portable controlled root', () => {
    const result = registerLocalPackage({
      controlledRootKind: 'portable',
      installRef: 'portable_pkg_1',
      packageRef: 'pkg_ref_2',
      verifiedPackage: verificationFixture(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.controlledRootKind).toBe('portable')
  })

  it('accepts dev_only controlled root', () => {
    const result = registerLocalPackage({
      controlledRootKind: 'dev_only',
      installRef: 'dev_pkg_1',
      packageRef: 'pkg_ref_3',
      verifiedPackage: verificationFixture(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.controlledRootKind).toBe('dev_only')
  })

  it('rejects unknown root kind', () => {
    const result = registerLocalPackage({
      controlledRootKind: 'managed_root',
      installRef: 'pkg_1',
      packageRef: 'pkg_ref_4',
      verifiedPackage: verificationFixture(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('install_root_unsafe')
  })

  it('does not expose raw absolute host path in public DTO', () => {
    const result = registerLocalPackage({
      controlledRootKind: 'user_local',
      installRef: 'pkg_5',
      packageRef: 'pkg_ref_5',
      hostSelectedPath: 'C:\\Users\\owner\\Downloads\\plugin',
      verifiedPackage: verificationFixture(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const serialized = JSON.stringify(result.publicDto)
    expect(serialized).not.toContain('C:\\Users\\owner')
  })

  it('rejects traversal in package reference', () => {
    const result = registerLocalPackage({
      controlledRootKind: 'user_local',
      installRef: 'pkg_6',
      packageRef: '../escape',
      verifiedPackage: verificationFixture(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failureReason).toBe('package_path_unsafe')
  })

  it('rejects UNC and absolute package references', () => {
    const uncResult = registerLocalPackage({
      controlledRootKind: 'user_local',
      installRef: 'pkg_7',
      packageRef: '\\\\server\\share\\plugin',
      verifiedPackage: verificationFixture(),
    })
    expect(uncResult.ok).toBe(false)
    if (!uncResult.ok) expect(uncResult.failureReason).toBe('package_path_unsafe')

    const absResult = registerLocalPackage({
      controlledRootKind: 'user_local',
      installRef: 'pkg_8',
      packageRef: 'C:\\plugins\\pkg',
      verifiedPackage: verificationFixture(),
    })
    expect(absResult.ok).toBe(false)
    if (!absResult.ok) expect(absResult.failureReason).toBe('package_path_unsafe')
  })
})

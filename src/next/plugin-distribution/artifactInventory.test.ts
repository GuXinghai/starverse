import { describe, expect, it } from 'vitest'
import {
  PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
  validatePluginPackageInventory,
  type PluginPackageArtifact,
} from './index'

const HEX_A = 'a'.repeat(64)
const HEX_B = 'b'.repeat(64)
const HEX_C = 'c'.repeat(64)
const HEX_D = 'd'.repeat(64)
const HEX_E = 'e'.repeat(64)

function artifact(overrides?: Partial<PluginPackageArtifact>): PluginPackageArtifact {
  return {
    artifactId: overrides?.artifactId ?? 'runtime-main',
    relativePath: overrides?.relativePath ?? 'runtime/main.bin',
    artifactClass: overrides?.artifactClass ?? 'runtime',
    sha256: overrides?.sha256 ?? HEX_A,
    sizeBytes: overrides?.sizeBytes ?? 1,
    required: overrides?.required ?? true,
  }
}

function runtimeInventory(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    inventorySchemaVersion: PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    artifacts: [
      artifact({ artifactId: 'runtime-main', artifactClass: 'runtime', sha256: HEX_A }),
      artifact({ artifactId: 'manifest', relativePath: 'manifest.json', artifactClass: 'manifest', sha256: HEX_B }),
      artifact({
        artifactId: 'signature',
        relativePath: 'signatures/package.sig',
        artifactClass: 'signature',
        sha256: HEX_C,
      }),
      artifact({ artifactId: 'license', relativePath: 'licenses/LICENSE', artifactClass: 'license', sha256: HEX_D }),
      artifact({
        artifactId: 'attribution',
        relativePath: 'attribution/NOTICE',
        artifactClass: 'attribution',
        sha256: HEX_E,
      }),
    ],
    ...overrides,
  }
}

describe('validatePluginPackageInventory', () => {
  it('accepts runtime package artifact coverage', () => {
    const result = validatePluginPackageInventory(runtimeInventory(), { runtimeKind: 'managed' })
    expect(result.ok).toBe(true)
  })

  it('rejects duplicate artifact ids', () => {
    const inv = runtimeInventory()
    inv.artifacts = [
      artifact({ artifactId: 'dup', relativePath: 'a.bin', artifactClass: 'runtime' }),
      artifact({ artifactId: 'dup', relativePath: 'b.bin', artifactClass: 'manifest' }),
    ]
    const result = validatePluginPackageInventory(inv, { runtimeKind: 'managed' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.code === 'duplicate_artifact_id')).toBe(true)
  })

  it('rejects duplicate artifact paths with only safe path details', () => {
    const inv = runtimeInventory()
    inv.artifacts = [
      artifact({ artifactId: 'a', relativePath: 'runtime/main.bin' }),
      artifact({ artifactId: 'b', relativePath: 'runtime\\main.bin', artifactClass: 'manifest' }),
    ]
    const result = validatePluginPackageInventory(inv, { runtimeKind: 'managed' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    const duplicate = result.errors.find((error) => error.code === 'duplicate_artifact_path')
    expect(duplicate?.path).toBe('runtime/main.bin')
  })

  it('rejects invalid SHA-256', () => {
    const inv = runtimeInventory({
      artifacts: [artifact({ sha256: 'not-a-sha' })],
    })
    const result = validatePluginPackageInventory(inv)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.code === 'invalid_sha256')).toBe(true)
  })

  it('rejects invalid size', () => {
    const inv = runtimeInventory({
      artifacts: [artifact({ sizeBytes: -1 })],
    })
    const result = validatePluginPackageInventory(inv)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.code === 'invalid_size')).toBe(true)
  })

  it('rejects missing required license and attribution artifacts for runtime packages', () => {
    const inv = runtimeInventory({
      artifacts: [
        artifact({ artifactId: 'runtime-main', artifactClass: 'runtime', sha256: HEX_A }),
        artifact({ artifactId: 'manifest', relativePath: 'manifest.json', artifactClass: 'manifest', sha256: HEX_B }),
        artifact({
          artifactId: 'signature',
          relativePath: 'signatures/package.sig',
          artifactClass: 'signature',
          sha256: HEX_C,
        }),
      ],
    })
    const result = validatePluginPackageInventory(inv, { runtimeKind: 'managed' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.filter((error) => error.code === 'missing_required_artifact')).toHaveLength(2)
  })
})

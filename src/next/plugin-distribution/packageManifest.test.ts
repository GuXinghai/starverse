import { describe, expect, it } from 'vitest'
import {
  PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION,
  validatePluginPackageManifest,
  validateSafeRelativePath,
} from './index'

function minimalManifest(overrides?: Record<string, unknown>): Record<string, unknown> {
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

describe('validatePluginPackageManifest', () => {
  it('accepts a valid minimal package manifest', () => {
    const result = validatePluginPackageManifest(minimalManifest())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.network).toEqual({ allowed: false })
    expect(result.manifest.artifactInventoryRef).toBe('inventory.json')
  })

  it('rejects absolute Windows paths without echoing raw path details', () => {
    const result = validatePluginPackageManifest(
      minimalManifest({ artifactInventoryRef: 'C:\\Users\\owner\\plugin\\inventory.json' })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.code === 'unsafe_relative_path')).toBe(true)
    expect(JSON.stringify(result.errors)).not.toContain('C:\\Users')
  })

  it('rejects absolute POSIX paths', () => {
    const result = validateSafeRelativePath('/opt/starverse/plugin/manifest.json')
    expect(result.ok).toBe(false)
  })

  it('rejects UNC paths', () => {
    const result = validateSafeRelativePath('\\\\server\\share\\manifest.json')
    expect(result.ok).toBe(false)
  })

  it('rejects NUL byte paths', () => {
    const result = validateSafeRelativePath('runtime/plugin\u0000.js')
    expect(result.ok).toBe(false)
  })

  it('rejects dot-dot traversal paths', () => {
    const result = validateSafeRelativePath('runtime/../../escape.js')
    expect(result.ok).toBe(false)
  })

  it('rejects empty paths', () => {
    const result = validateSafeRelativePath('   ')
    expect(result.ok).toBe(false)
  })

  it('rejects user script entries and network execution hooks', () => {
    const result = validatePluginPackageManifest(
      minimalManifest({
        entrypoint: 'runtime/plugin.js',
        network: { allowed: true },
      })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['script_entry_not_allowed', 'network_not_allowed'])
    )
  })

  it('flags rollback when a lower previous version comparison is supplied', () => {
    const result = validatePluginPackageManifest(minimalManifest({ pluginVersion: '1.0.0' }), {
      previousPluginVersion: '2.0.0',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.code === 'rollback_detected')).toBe(true)
  })
})

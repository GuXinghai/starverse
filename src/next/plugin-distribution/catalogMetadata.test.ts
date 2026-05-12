import { describe, expect, it } from 'vitest'
import { PLUGIN_CATALOG_SCHEMA_VERSION, validatePluginCatalogMetadata } from './index'

const HEX_A = 'a'.repeat(64)
const HEX_B = 'b'.repeat(64)
const HEX_C = 'c'.repeat(64)

function catalogEntry(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    pluginId: 'magika-managed',
    pluginVersion: '1.2.3',
    runtimeKind: 'managed',
    platform: 'win32',
    arch: 'x64',
    packageRef: 'packages/magika-managed-1.2.3.svpkg',
    packageSha256: HEX_A,
    packageSizeBytes: 123,
    manifestSha256: HEX_B,
    inventorySha256: HEX_C,
    signatureRef: 'signatures/magika-managed-1.2.3.sig',
    compatibility: {
      platforms: ['win32'],
      architectures: ['x64'],
      starverseVersionRange: '>=0.0.2',
    },
    ...overrides,
  }
}

function catalog(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    catalogSchemaVersion: PLUGIN_CATALOG_SCHEMA_VERSION,
    catalogVersion: 1,
    generatedAt: '2026-05-12T00:00:00.000Z',
    expiresAt: '2026-06-12T00:00:00.000Z',
    sourceKind: 'official',
    entries: [catalogEntry()],
    ...overrides,
  }
}

describe('validatePluginCatalogMetadata', () => {
  it('accepts official stable catalog metadata', () => {
    const result = validatePluginCatalogMetadata(catalog(), {
      now: new Date('2026-05-12T00:00:00.000Z'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.entries[0]?.channel).toBe('stable')
  })

  it('rejects non-official source kind', () => {
    const result = validatePluginCatalogMetadata(catalog({ sourceKind: 'third-party' }), {
      now: new Date('2026-05-12T00:00:00.000Z'),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.code === 'non_official_source')).toBe(true)
  })

  it('rejects catalog target missing hash or size metadata', () => {
    const result = validatePluginCatalogMetadata(
      catalog({ entries: [catalogEntry({ packageSha256: undefined, packageSizeBytes: undefined })] }),
      { now: new Date('2026-05-12T00:00:00.000Z') }
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['invalid_sha256', 'invalid_size'])
    )
  })

  it('rejects expired catalog metadata', () => {
    const result = validatePluginCatalogMetadata(catalog({ expiresAt: '2026-05-01T00:00:00.000Z' }), {
      now: new Date('2026-05-12T00:00:00.000Z'),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.code === 'expired_metadata')).toBe(true)
  })

  it('does not treat package references as downloader work', () => {
    const result = validatePluginCatalogMetadata(catalog({ entries: [catalogEntry({ packageRef: 'https://example.test/pkg' })] }), {
      now: new Date('2026-05-12T00:00:00.000Z'),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.code === 'unsafe_relative_path')).toBe(true)
  })
})

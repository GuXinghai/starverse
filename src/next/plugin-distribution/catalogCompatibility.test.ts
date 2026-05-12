import { describe, expect, it } from 'vitest'
import { evaluateCatalogEntryCompatibility } from './index'
import type { PluginCatalogEntry } from './types'

const HEX_A = 'a'.repeat(64)
const HEX_B = 'b'.repeat(64)
const HEX_C = 'c'.repeat(64)

function entry(overrides?: Partial<PluginCatalogEntry>): PluginCatalogEntry {
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
    channel: 'stable',
    ...overrides,
  }
}

describe('evaluateCatalogEntryCompatibility', () => {
  it('marks compatible entry as compatible', () => {
    const result = evaluateCatalogEntryCompatibility(
      entry(),
      { platform: 'win32', architecture: 'x64', appVersion: '0.0.2', capabilities: ['file_identification'] },
      { capabilities: ['file_identification'] }
    )
    expect(result.compatible).toBe(true)
    expect(result.reasons).toEqual([])
  })

  it('marks incompatible platform with reason', () => {
    const result = evaluateCatalogEntryCompatibility(entry(), {
      platform: 'linux',
      architecture: 'x64',
      appVersion: '0.0.2',
    })
    expect(result.compatible).toBe(false)
    expect(result.reasons).toContain('incompatible_platform')
  })

  it('marks incompatible app version with reason', () => {
    const result = evaluateCatalogEntryCompatibility(entry(), {
      platform: 'win32',
      architecture: 'x64',
      appVersion: '0.0.1',
    })
    expect(result.compatible).toBe(false)
    expect(result.reasons).toContain('incompatible_app_version')
  })
})

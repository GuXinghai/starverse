import { describe, expect, it } from 'vitest'
import {
  PLUGIN_CATALOG_SCHEMA_VERSION,
  PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
  buildReadOnlyCatalogDto,
  validateOfficialPluginCatalog,
} from './index'

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

function signature(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    signatureSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
    keyId: 'starverse-offline-root',
    algorithm: 'ed25519',
    signedAt: '2026-05-12T00:00:00.000Z',
    expiresAt: '2026-06-12T00:00:00.000Z',
    value: 'base64-signature-placeholder',
    ...overrides,
  }
}

describe('validateOfficialPluginCatalog', () => {
  it('passes valid official catalog as metadata-only validation', () => {
    const result = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static', sourceRef: 'catalog_v1' },
      catalog: catalog(),
      signatureMetadata: signature(),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    expect(result.ok).toBe(true)
    expect(result.status).toBe('valid_metadata_only')
    expect(result.entryCount).toBe(1)
    expect(result.trust.cryptographicVerificationDeferred).toBe(true)
    expect(result.trust.executableTrustApproved).toBe(false)
  })
})

describe('validateOfficialPluginCatalog failures', () => {
  it('rejects non-official catalog source', () => {
    const result = validateOfficialPluginCatalog({
      source: { kind: 'third_party', sourceRef: 'catalog_v1' },
      catalog: catalog(),
      signatureMetadata: signature(),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('source_invalid')
  })

  it('rejects expired catalog', () => {
    const result = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static' },
      catalog: catalog({ expiresAt: '2026-05-01T00:00:00.000Z' }),
      signatureMetadata: signature(),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('catalog_expired')
  })

  it('fails missing signature metadata when policy requires signed catalog', () => {
    const result = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static' },
      catalog: catalog(),
      signatureMetadata: null,
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('signature_missing')
    expect(result.trust.signatureMetadataPresent).toBe(false)
  })

  it('fails missing package hash and size metadata', () => {
    const result = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static' },
      catalog: catalog({
        entries: [catalogEntry({ packageSha256: undefined, packageSizeBytes: undefined })],
      }),
      signatureMetadata: signature(),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('target_metadata_missing')
  })

  it('fails invalid signature metadata without doing cryptographic verification', () => {
    const result = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static' },
      catalog: catalog(),
      signatureMetadata: signature({ algorithm: 'rsa' }),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    expect(result.ok).toBe(false)
    expect(result.failureReasons).toContain('signature_invalid')
    expect(result.trust.cryptographicVerificationDeferred).toBe(true)
  })

  it('sanitizes diagnostics', () => {
    const result = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static', sourceRef: 'C:\\Users\\me\\catalog.json' },
      catalog: catalog({ entries: [catalogEntry({ packageRef: 'C:\\Users\\me\\package.svpkg' })] }),
      signatureMetadata: signature({ value: HEX_A }),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain('C:\\Users\\me')
    expect(JSON.stringify(result.diagnostics)).not.toContain(HEX_A)
  })
})

describe('buildReadOnlyCatalogDto', () => {
  it('marks compatible entry as future metadata-compatible only', () => {
    const validation = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static' },
      catalog: catalog(),
      signatureMetadata: signature(),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    const dto = buildReadOnlyCatalogDto({
      validation,
      environment: { platform: 'win32', architecture: 'x64', appVersion: '0.0.2' },
      entryMetadata: {
        'magika-managed@1.2.3': {
          displayName: 'Magika Managed',
          publisher: 'Starverse',
          capabilities: ['file_identification'],
          modelVersion: '0.6.2',
        },
      },
    })
    expect(dto.entries[0]?.installabilityStatus).toBe('metadata_compatible_future_install')
    expect(dto.entries[0]?.reasons).toContain('read_only_catalog_no_install_action')
  })
})

describe('buildReadOnlyCatalogDto compatibility failures', () => {
  it('marks incompatible platform entry unavailable with reason', () => {
    const validation = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static' },
      catalog: catalog(),
      signatureMetadata: signature(),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    const dto = buildReadOnlyCatalogDto({
      validation,
      environment: { platform: 'linux', architecture: 'x64', appVersion: '0.0.2' },
    })
    expect(dto.entries[0]?.installabilityStatus).toBe('unavailable_read_only')
    expect(dto.entries[0]?.reasons).toContain('incompatible_platform')
  })

  it('marks incompatible app version entry unavailable with reason', () => {
    const validation = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static' },
      catalog: catalog(),
      signatureMetadata: signature(),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    const dto = buildReadOnlyCatalogDto({
      validation,
      environment: { platform: 'win32', architecture: 'x64', appVersion: '0.0.1' },
    })
    expect(dto.entries[0]?.installabilityStatus).toBe('unavailable_read_only')
    expect(dto.entries[0]?.reasons).toContain('incompatible_app_version')
  })

  it('marks unsupported capability entry unavailable with reason', () => {
    const validation = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static' },
      catalog: catalog(),
      signatureMetadata: signature(),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    const dto = buildReadOnlyCatalogDto({
      validation,
      environment: {
        platform: 'win32',
        architecture: 'x64',
        appVersion: '0.0.2',
        capabilities: ['text_extraction'],
      },
      entryMetadata: {
        'magika-managed@1.2.3': { capabilities: ['file_identification'] },
      },
    })
    expect(dto.entries[0]?.installabilityStatus).toBe('unavailable_read_only')
    expect(dto.entries[0]?.reasons).toContain('capability_unsupported')
  })
})

describe('buildReadOnlyCatalogDto sanitization and invalid catalogs', () => {
  it('does not materialize entries for invalid catalog validation', () => {
    const validation = validateOfficialPluginCatalog({
      source: { kind: 'third_party' },
      catalog: catalog(),
      signatureMetadata: signature(),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    const dto = buildReadOnlyCatalogDto({
      validation,
      environment: { platform: 'win32', architecture: 'x64', appVersion: '0.0.2' },
    })
    expect(dto.catalogStatus).toBe('invalid')
    expect(dto.entries).toEqual([])
  })

  it('does not expose raw source path or absolute package path in DTO', () => {
    const validation = validateOfficialPluginCatalog({
      source: { kind: 'bundled_static', sourceRef: 'catalog_v1' },
      catalog: catalog(),
      signatureMetadata: signature(),
      trustPolicy: { requireSignedCatalogs: true },
      environment: { now: new Date('2026-05-12T00:00:00.000Z') },
    })
    const dto = buildReadOnlyCatalogDto({
      validation,
      environment: { platform: 'win32', architecture: 'x64', appVersion: '0.0.2' },
    })
    expect(JSON.stringify(dto)).not.toContain('catalog_v1')
    expect(JSON.stringify(dto)).not.toContain('packages/magika-managed-1.2.3.svpkg')
    expect(dto.entries[0]?.packageRefLabel).toBe('magika-managed-1.2.3.svpkg')
  })
})

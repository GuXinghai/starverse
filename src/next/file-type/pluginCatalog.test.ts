import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  OFFICIAL_PLUGIN_CATALOG_SCHEMA_VERSION,
  OFFICIAL_PLUGIN_CATALOG_SOURCE,
  loadOfficialPluginCatalogFromFile,
  parseOfficialPluginCatalog,
  toOfficialCatalogSignedPayload,
  validateOfficialPluginCatalog,
  verifyCatalogEntryHashes,
  verifyOfficialPluginCatalogSignature,
  type OfficialPluginCatalog,
} from './pluginCatalog'
import { createCatalogSigningPayload, type TrustedCatalogPublicKeyMap } from './pluginCatalogSignature'

function sha256Fixture(value: string): string {
  const table = {
    manifestA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    packageA: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    manifestB: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    packageB: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  } as const
  return table[value as keyof typeof table]
}

function sha256OfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function createSignedCatalogFixture(): Readonly<{
  catalog: OfficialPluginCatalog
  trustedRoots: TrustedCatalogPublicKeyMap
}> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const keyId = 'starverse-official-root-test'
  const trustedRoots: TrustedCatalogPublicKeyMap = {
    [keyId]: {
      keyId,
      algorithm: 'ed25519',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  }

  const unsignedPayload = {
    schemaVersion: OFFICIAL_PLUGIN_CATALOG_SCHEMA_VERSION,
    source: OFFICIAL_PLUGIN_CATALOG_SOURCE,
    generatedAt: '2026-05-08T00:00:00.000Z',
    plugins: [
      {
        pluginId: 'magika-managed',
        pluginVersion: '0.1.0',
        manifestSha256: sha256Fixture('manifestA'),
        packageSha256: sha256Fixture('packageA'),
        manifestPath: 'magika-managed/manifest.json',
        packagePath: 'magika-managed/package.tar.gz',
      },
    ],
  }

  const signatureValue = sign(null, Buffer.from(createCatalogSigningPayload(unsignedPayload)), privateKey).toString(
    'base64'
  )

  const catalog = parseOfficialPluginCatalog({
    ...unsignedPayload,
    signature: {
      keyId,
      algorithm: 'ed25519',
      value: signatureValue,
    },
  })

  return { catalog, trustedRoots }
}

// eslint-disable-next-line max-lines-per-function
describe('pluginCatalog', () => {
  it('validates official catalog schema and normalizes hash casing', () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const keyId = 'k1'
    const payload = {
      schemaVersion: OFFICIAL_PLUGIN_CATALOG_SCHEMA_VERSION,
      source: OFFICIAL_PLUGIN_CATALOG_SOURCE,
      generatedAt: '2026-05-08T00:00:00.000Z',
      plugins: [
        {
          pluginId: 'magika-managed',
          pluginVersion: '0.1.0',
          manifestSha256: sha256Fixture('manifestA').toUpperCase(),
          packageSha256: sha256Fixture('packageA').toUpperCase(),
          manifestPath: 'manifest.json',
          packagePath: 'package.tar.gz',
        },
      ],
    }
    const signatureValue = sign(null, Buffer.from(createCatalogSigningPayload(payload)), privateKey).toString('base64')

    const result = validateOfficialPluginCatalog({
      ...payload,
      signature: {
        keyId,
        algorithm: 'ed25519',
        value: signatureValue,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.plugins[0]?.manifestSha256).toBe(sha256Fixture('manifestA'))
    expect(result.catalog.plugins[0]?.packageSha256).toBe(sha256Fixture('packageA'))
  })

  it('rejects non-official source', () => {
    const result = validateOfficialPluginCatalog({
      schemaVersion: OFFICIAL_PLUGIN_CATALOG_SCHEMA_VERSION,
      source: 'third-party',
      plugins: [],
      signature: {
        keyId: 'k1',
        algorithm: 'ed25519',
        value: 'ZmFrZQ==',
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join(' ')).toContain('source must be official')
  })

  it('fails signature verification when trusted root is missing', () => {
    const { catalog } = createSignedCatalogFixture()
    const verified = verifyOfficialPluginCatalogSignature({
      catalog,
      trustedRoots: {},
    })
    expect(verified.ok).toBe(false)
    if (verified.ok) return
    expect(verified.reason).toBe('trusted_root_missing')
  })

  it('verifies signature with trusted root and fails after payload tamper', () => {
    const { catalog, trustedRoots } = createSignedCatalogFixture()
    const verified = verifyOfficialPluginCatalogSignature({
      catalog,
      trustedRoots,
    })
    expect(verified.ok).toBe(true)

    const tampered = parseOfficialPluginCatalog({
      ...toOfficialCatalogSignedPayload(catalog),
      plugins: [
        {
          ...catalog.plugins[0],
          packageSha256: sha256Fixture('packageB'),
        },
      ],
      signature: catalog.signature,
    })
    const tamperedVerified = verifyOfficialPluginCatalogSignature({
      catalog: tampered,
      trustedRoots,
    })
    expect(tamperedVerified.ok).toBe(false)
    if (tamperedVerified.ok) return
    expect(tamperedVerified.reason).toBe('signature_invalid')
  })

  it('verifies manifest/package sha256 entries', () => {
    const manifestBytes = Buffer.from('manifest-bytes')
    const packageBytes = Buffer.from('package-bytes')
    const result = verifyCatalogEntryHashes({
      entry: {
        manifestSha256: sha256OfBytes(manifestBytes),
        packageSha256: sha256OfBytes(packageBytes),
      },
      manifestBytes,
      packageBytes,
    })
    expect(result.ok).toBe(true)
    expect(result.manifestSha256Match).toBe(true)
    expect(result.packageSha256Match).toBe(true)

    const mismatch = verifyCatalogEntryHashes({
      entry: {
        manifestSha256: '0000000000000000000000000000000000000000000000000000000000000000',
        packageSha256: '1111111111111111111111111111111111111111111111111111111111111111',
      },
      manifestBytes: Buffer.from('manifest-bytes'),
      packageBytes: Buffer.from('package-bytes'),
    })
    expect(mismatch.ok).toBe(false)
    expect(mismatch.manifestSha256Match).toBe(false)
    expect(mismatch.packageSha256Match).toBe(false)
  })

  it('loads local catalog json file for tests without network', async () => {
    const { catalog } = createSignedCatalogFixture()
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-catalog-fixture-'))
    const catalogPath = path.join(tempDir, 'catalog.json')
    try {
      await writeFile(catalogPath, JSON.stringify(catalog, null, 2))
      const loaded = await loadOfficialPluginCatalogFromFile({ catalogPath })
      expect(loaded.source).toBe('official')
      expect(loaded.plugins).toHaveLength(1)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})

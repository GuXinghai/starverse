import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, rm as rmAsync, writeFile as writeFileAsync } from 'node:fs/promises'
import { deflateRawSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createCatalogSigningPayload, type TrustedCatalogPublicKeyMap } from '../../src/next/file-type/pluginCatalogSignature'
import {
  createOfficialTrustedRoots,
} from '../../src/next/file-type/officialPluginTrustedRoots'
import {
  MAGIKA_OFFICIAL_PUBLIC_KEY_PEM,
} from '../../src/next/plugin-distribution/magikaOfficialRelease'
import type { OfficialPackageReleaseMetadata } from '../../src/next/plugin-distribution/officialPackageRelease'
import { ensureEnginePluginRegistrySchema } from '../db/migrations/ensureEnginePluginRegistrySchema'
import { EnginePluginRegistryRepo } from '../db/repo/enginePluginRegistryRepo'
import { EnginePluginLifecycleService } from './enginePluginLifecycleService'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

type Fixture = Readonly<{
  tempRoot: string
  catalogPath: string
  trustedRoots: TrustedCatalogPublicKeyMap
  installRef: string
}>

// eslint-disable-next-line max-lines-per-function
async function createFixture(): Promise<Fixture> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-engine-lifecycle-'))
  const installRef = 'plugin_magika_001'
  const pluginRoot = path.join(tempRoot, installRef)
  await mkdir(path.join(pluginRoot, 'runtime'), { recursive: true })
  await mkdir(path.join(pluginRoot, 'model'), { recursive: true })

  const runtimeEntryPath = path.join(pluginRoot, 'runtime', 'runner.js')
  const modelPath = path.join(pluginRoot, 'model', 'model.bin')
  const configPath = path.join(pluginRoot, 'model', 'config.json')
  const packagePath = path.join(pluginRoot, 'package.tgz')

  await writeFileAsync(runtimeEntryPath, 'module.exports = {}')
  await writeFileAsync(modelPath, 'model-v1')
  await writeFileAsync(configPath, '{"ok":true}')
  await writeFileAsync(packagePath, 'package-bytes')

  const integrity = {
    'runtime/runner.js': sha256(readFileSync(runtimeEntryPath)),
    'model/model.bin': sha256(readFileSync(modelPath)),
    'model/config.json': sha256(readFileSync(configPath)),
  }

  const manifest = {
    manifestSchemaVersion: '1',
    engineId: 'magika',
    displayName: 'Magika managed plugin',
    pluginVersion: '0.1.0',
    runtimeKind: 'local_loader',
    runtimeEntry: 'runtime/runner.js',
    modelVersion: 'magika-v3',
    modelFiles: ['model/model.bin'],
    configFiles: ['model/config.json'],
    integrity,
    license: 'Apache-2.0',
    attribution: 'Google Magika',
    capabilities: ['text_extraction'],
    supportedFormatIds: [],
    supportedMimeTypes: [],
    supportedLabels: ['json'],
    platform: 'any',
  }
  await writeFileAsync(path.join(pluginRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))

  const manifestSha = sha256(readFileSync(path.join(pluginRoot, 'manifest.json')))
  const packageSha = sha256(readFileSync(packagePath))

  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const keyId = 'starverse-test-root'
  const trustedRoots: TrustedCatalogPublicKeyMap = {
    [keyId]: {
      keyId,
      algorithm: 'ed25519',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  }

  const unsignedCatalog = {
    schemaVersion: '1',
    source: 'official',
    generatedAt: '2026-05-08T00:00:00.000Z',
    plugins: [
      {
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        packageSha256: packageSha,
        manifestSha256: manifestSha,
        packagePath: 'package.tgz',
        manifestPath: 'manifest.json',
      },
    ],
  }
  const signature = sign(
    null,
    Buffer.from(createCatalogSigningPayload(unsignedCatalog)),
    privateKey
  ).toString('base64')

  const catalogPath = path.join(tempRoot, 'catalog.json')
  await writeFileAsync(
    catalogPath,
    JSON.stringify(
      {
        ...unsignedCatalog,
        signature: {
          keyId,
          algorithm: 'ed25519',
          value: signature,
        },
      },
      null,
      2
    )
  )

  return {
    tempRoot,
    catalogPath,
    trustedRoots,
    installRef,
  }
}

function createService(
  tempRoot: string,
  trustedRoots: TrustedCatalogPublicKeyMap,
  opts: Readonly<{
    trustedRootSource?: 'official' | 'test' | null
    magikaOfficialRelease?: OfficialPackageReleaseMetadata
    officialPackageBytes?: Uint8Array
  }> = {}
) {
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  ensureEnginePluginRegistrySchema(db)
  const repo = new EnginePluginRegistryRepo(db)
  const service = new EnginePluginLifecycleService({
    registryRepo: repo,
    trustedRoots,
    trustedRootSource: opts.trustedRootSource ?? 'test',
    resolveInstallPluginDir: ({ installRef }) => path.join(tempRoot, installRef),
    magikaOfficialRelease: opts.magikaOfficialRelease,
    officialPackageTransport: opts.officialPackageBytes
      ? {
          async fetchPackage() {
            return {
              ok: true,
              bytes: opts.officialPackageBytes!,
              finalRef: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/pkg.zip',
            }
          },
        }
      : undefined,
  })
  return { db, repo, service }
}

function registryRecord(overrides?: Record<string, unknown>) {
  return {
    engineId: 'magika',
    displayName: 'Magika',
    pluginVersion: '0.1.0',
    manifestSchemaVersion: '1',
    manifestHash: 'a'.repeat(64),
    runtimeKind: 'local_loader',
    modelVersion: 'magika-v3',
    installState: 'installed',
    enabled: true,
    healthStatus: 'unknown',
    failureReason: null,
    installSource: 'official_catalog',
    installRootKind: 'managed_root',
    installRef: 'plugin_magika_001',
    installedAt: 1,
    updatedAt: 2,
    lastVerifiedAt: 2,
    lastHealthCheckAt: null,
    metadataJson: null,
    ...overrides,
  } as const
}

// eslint-disable-next-line max-lines-per-function
async function createOfficialRemoteInstallFixture() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-official-magika-install-'))
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const keyId = 'starverse-test-official-root'
  const publicKeyRef = 'keys/test.public.pem'
  const trustedRoots: TrustedCatalogPublicKeyMap = {
    [keyId]: {
      keyId,
      algorithm: 'ed25519',
      publicKeyPem,
    },
  }

  const engineRuntime = Buffer.from('module.exports = {}')
  const engineModel = Buffer.from('model-v1')
  const engineConfig = Buffer.from('{"ok":true}')
  const managedManifest = Buffer.from(JSON.stringify({
    manifestSchemaVersion: '1',
    engineId: 'magika',
    displayName: 'Magika managed plugin',
    pluginVersion: '0.1.0',
    runtimeKind: 'local_loader',
    runtimeEntry: 'runtime/runner.js',
    modelVersion: 'magika-v3',
    modelFiles: ['model/model.bin'],
    configFiles: ['model/config.json'],
    integrity: {
      'runtime/runner.js': sha256(engineRuntime),
      'model/model.bin': sha256(engineModel),
      'model/config.json': sha256(engineConfig),
    },
    license: 'Apache-2.0',
    attribution: 'Google Magika',
    capabilities: ['text_extraction'],
    supportedFormatIds: [],
    supportedMimeTypes: [],
    supportedLabels: ['json'],
    platform: 'any',
  }, null, 2))
  const packageManifest = Buffer.from(JSON.stringify({
    manifestSchemaVersion: '1',
    pluginId: 'magika',
    displayName: 'Magika',
    publisher: 'Google Magika',
    pluginVersion: '0.1.0',
    runtimeKind: 'managed',
    compatibility: { platforms: ['win32'], architectures: ['x64'], starverseVersionRange: '>=0.0.0' },
    capabilities: ['file_identification', 'model_inference'],
    artifactInventoryRef: 'inventory.json',
    licenseRefs: ['licenses/LICENSE.txt'],
    attributionRefs: ['attribution/NOTICE.txt'],
    network: { allowed: false },
  }, null, 2))
  const inventory = Buffer.from(JSON.stringify({
    inventorySchemaVersion: '1',
    pluginId: 'magika',
    pluginVersion: '0.1.0',
    artifacts: [
      {
        artifactId: 'managed-manifest',
        relativePath: 'engine/manifest.json',
        artifactClass: 'manifest',
        sha256: sha256(managedManifest),
        sizeBytes: managedManifest.byteLength,
        required: true,
      },
    ],
  }, null, 2))
  const bytes = createZip([
    ['manifest.json', packageManifest],
    ['inventory.json', inventory],
    ['engine/manifest.json', managedManifest],
    ['engine/runtime/runner.js', engineRuntime],
    ['engine/model/model.bin', engineModel],
    ['engine/model/config.json', engineConfig],
  ])
  const signature = sign(null, Buffer.from(bytes), privateKey).toString('base64')
  const release: OfficialPackageReleaseMetadata = {
    catalogEntry: {
      pluginId: 'magika',
      pluginVersion: '0.1.0',
      runtimeKind: 'managed',
      platform: 'win32',
      arch: 'x64',
      packageRef: 'starverse-plugin-magika-v0.1.0/test.zip',
      packageSha256: sha256(bytes),
      packageSizeBytes: bytes.byteLength,
      manifestSha256: sha256(packageManifest),
      inventorySha256: sha256(inventory),
      signatureRef: 'signatures/package.sig.json',
      compatibility: { platforms: ['win32'], architectures: ['x64'], starverseVersionRange: '>=0.0.0' },
      channel: 'stable',
    },
    releaseUrl: 'https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v0.1.0/test.zip',
    remoteInstallEnabled: true,
    downloadPolicy: {
      maxBytes: bytes.byteLength + 10,
      allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
    },
    signatureEnvelope: {
      signatureSchemaVersion: '1',
      keyId,
      algorithm: 'ed25519',
      signedAt: '2026-05-14T00:00:00.000Z',
      expiresAt: '2027-05-14T00:00:00.000Z',
      value: signature,
      coveredManifestSha256: sha256(packageManifest),
      coveredInventorySha256: sha256(inventory),
    },
    trustRoot: {
      rootSchemaVersion: '1',
      rootVersion: 1,
      generatedAt: '2026-05-14T00:00:00.000Z',
      expiresAt: '2027-05-14T00:00:00.000Z',
      keys: [{ keyId, algorithm: 'ed25519', publicKeyRef, role: 'targets' }],
      snapshotRole: 'reserved',
      timestampRole: 'reserved',
      delegatedRoles: 'reserved',
    },
    trustedKeys: [{ publicKeyRef, publicKeyPem }],
    targetMetadata: {
      pluginId: 'magika',
      pluginVersion: '0.1.0',
      packageSha256: sha256(bytes),
      packageSizeBytes: bytes.byteLength,
      expiresAt: '2027-05-14T00:00:00.000Z',
      signatureRef: 'signatures/package.sig.json',
    },
    compatibility: { platforms: ['win32'], architectures: ['x64'], starverseVersionRange: '>=0.0.0' },
  }
  return { tempRoot, trustedRoots, release, bytes }
}

function createZip(entries: readonly (readonly [string, Buffer])[]): Uint8Array {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(content)
    const crc = 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.byteLength, 18)
    local.writeUInt32LE(content.byteLength, 22)
    local.writeUInt16LE(nameBytes.byteLength, 26)
    localParts.push(local, nameBytes, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.byteLength, 20)
    central.writeUInt32LE(content.byteLength, 24)
    central.writeUInt16LE(nameBytes.byteLength, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBytes)
    offset += local.byteLength + nameBytes.byteLength + compressed.byteLength
  }
  const centralOffset = offset
  const central = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt32LE(central.byteLength, 12)
  eocd.writeUInt32LE(centralOffset, 16)
  return new Uint8Array(Buffer.concat([...localParts, central, eocd]))
}

// eslint-disable-next-line max-lines-per-function
describe('EnginePluginLifecycleService', () => {
  it('installs official Magika through verified release download and registers disabled metadata', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: '0.1.0' })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.engineId).toBe('magika')
        expect(result.value.installState).toBe('installed')
        expect(result.value.enabled).toBe(false)
        expect(result.value.lastVerifiedAt).toBeTruthy()
      }
      expect(repo.getByEngineId('magika')).toMatchObject({
        engineId: 'magika',
        installSource: 'official_catalog',
        installRootKind: 'managed_root',
        installRef: 'magika',
        enabled: false,
      })
      expect(readFileSync(path.join(fixture.tempRoot, 'magika', 'manifest.json'), 'utf8')).toContain(
        'Magika managed plugin'
      )

      const duplicate = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: '0.1.0' })
      expect(duplicate.ok).toBe(false)
      if (!duplicate.ok) expect(duplicate.reason).toBe('already_registered')
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('does not install official Magika when production trust root is missing', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const { db, service, repo } = createService(fixture.tempRoot, {}, {
      trustedRootSource: null,
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: '0.1.0' })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('official_trusted_root_unconfigured')
      expect(repo.getByEngineId('magika')).toBeNull()
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('does not install official Magika when production signature verification fails', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const brokenRelease = {
      ...fixture.release,
      signatureEnvelope: {
        ...fixture.release.signatureEnvelope,
        value: Buffer.from('bad-signature').toString('base64'),
      },
    }
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: brokenRelease,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: '0.1.0' })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('official_remote_install_failed')
      expect(repo.getByEngineId('magika')).toBeNull()
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('registers local official plugin via catalog signature and hash verification', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'official' })
    try {
      const registered = await service.registerLocalOfficialPlugin({
        catalogPath: fixture.catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef: fixture.installRef,
        enabled: true,
      })

      expect(registered.ok).toBe(true)
      if (!registered.ok) return
      expect(registered.value.engineId).toBe('magika')
      expect(registered.value.installState).toBe('installed')
      expect(registered.value.installRootKind).toBe('managed_root')

      const official = await service.listOfficialPlugins({ catalogPath: fixture.catalogPath })
      expect(official.ok).toBe(true)
      if (!official.ok) return
      expect(official.value[0]?.pluginId).toBe('magika')

      const installed = service.getInstalledPlugins()
      expect(installed).toHaveLength(1)
      expect(installed[0]?.engineId).toBe('magika')
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('returns structured failure when enabling uninstalled plugin', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots)
    try {
      await service.registerLocalOfficialPlugin({
        catalogPath: fixture.catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef: fixture.installRef,
      })
      const uninstalled = service.uninstallPlugin({ engineId: 'magika' })
      expect(uninstalled.ok).toBe(true)

      const enabled = await service.enablePlugin({ engineId: 'magika' })
      expect(enabled.ok).toBe(false)
      if (enabled.ok) return
      expect(enabled.reason).toBe('plugin_uninstalled')
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('runs health check and updates failed plugin state', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots)
    try {
      const registered = await service.registerLocalOfficialPlugin({
        catalogPath: fixture.catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef: fixture.installRef,
      })
      expect(registered.ok).toBe(true)
      repo.markFailed({
        engineId: 'magika',
        failureReason: 'health_check_failed',
      })

      const health = await service.runHealthCheck({ engineId: 'magika' })
      expect(health.ok).toBe(true)

      const enabled = await service.enablePlugin({ engineId: 'magika' })
      expect(enabled.ok).toBe(true)
      if (!enabled.ok) return
      expect(enabled.value.enabled).toBe(true)
      expect(enabled.value.installState).toBe('installed')
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('includes recommendedInstallRootKind in listOfficialPlugins response', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
    try {
      const result = await service.listOfficialPlugins({ catalogPath: fixture.catalogPath })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.recommendedInstallRootKind).toBe('test_root')
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('returns managed_root when trusted root source is official', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'official' })
    try {
      const result = await service.listOfficialPlugins({ catalogPath: fixture.catalogPath })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value[0]?.recommendedInstallRootKind).toBe('managed_root')
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects test_root when trusted root source is official', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'official' })
    try {
      const result = await service.registerLocalOfficialPlugin({
        catalogPath: fixture.catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'test_root',
        installRef: fixture.installRef,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('install_root_kind_mismatch')
      }
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('accepts test_root when trusted root source is test', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
    try {
      const result = await service.registerLocalOfficialPlugin({
        catalogPath: fixture.catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'test_root',
        installRef: fixture.installRef,
      })
      expect(result.ok).toBe(true)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('returns official_trusted_root_unconfigured when trusted roots are empty', async () => {
    const fixture = await createFixture()
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)
    const service = new EnginePluginLifecycleService({
      registryRepo: repo,
      trustedRoots: {},
      resolveInstallPluginDir: ({ installRef }) => path.join(fixture.tempRoot, installRef),
    })
    try {
      const result = await service.listOfficialPlugins({ catalogPath: fixture.catalogPath })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('official_trusted_root_unconfigured')
      }
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('registerLocalOfficialPlugin fails with official_trusted_root_unconfigured when trusted roots empty', async () => {
    const fixture = await createFixture()
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)
    const service = new EnginePluginLifecycleService({
      registryRepo: repo,
      trustedRoots: {},
      resolveInstallPluginDir: ({ installRef }) => path.join(fixture.tempRoot, installRef),
    })
    try {
      const result = await service.registerLocalOfficialPlugin({
        catalogPath: fixture.catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef: fixture.installRef,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('official_trusted_root_unconfigured')
      }
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('fails when catalog signature is invalid (wrong key)', async () => {
    const fixture = await createFixture()
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const wrongRoots: TrustedCatalogPublicKeyMap = {
      'wrong-key': {
        keyId: 'wrong-key',
        algorithm: 'ed25519',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      },
    }
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)
    const service = new EnginePluginLifecycleService({
      registryRepo: repo,
      trustedRoots: wrongRoots,
      resolveInstallPluginDir: ({ installRef }) => path.join(fixture.tempRoot, installRef),
    })
    try {
      const result = await service.listOfficialPlugins({ catalogPath: fixture.catalogPath })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('catalog_signature_invalid')
      }
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('fails when manifest hash does not match catalog entry', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const keyId = 'starverse-test-root'
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const trustedRoots: TrustedCatalogPublicKeyMap = {
      [keyId]: { keyId, algorithm: 'ed25519', publicKeyPem },
    }

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-engine-lifecycle-'))
    const installRef = 'plugin_hash_mismatch'
    const pluginRoot = path.join(tempRoot, installRef)
    await mkdir(path.join(pluginRoot, 'runtime'), { recursive: true })
    await mkdir(path.join(pluginRoot, 'model'), { recursive: true })

    const runtimePath = path.join(pluginRoot, 'runtime', 'runner.js')
    const modelPath = path.join(pluginRoot, 'model', 'model.bin')
    const configPath = path.join(pluginRoot, 'model', 'config.json')
    const packagePath = path.join(pluginRoot, 'package.tgz')
    await writeFileAsync(runtimePath, 'module.exports = {}')
    await writeFileAsync(modelPath, 'model-v1')
    await writeFileAsync(configPath, '{"ok":true}')
    await writeFileAsync(packagePath, 'package-bytes')

    const integrity = {
      'runtime/runner.js': sha256(readFileSync(runtimePath)),
      'model/model.bin': sha256(readFileSync(modelPath)),
      'model/config.json': sha256(readFileSync(configPath)),
    }

    const manifest = {
      manifestSchemaVersion: '1', engineId: 'magika', displayName: 'Magika',
      pluginVersion: '0.1.0', runtimeKind: 'local_loader', runtimeEntry: 'runtime/runner.js',
      modelVersion: 'magika-v3', modelFiles: ['model/model.bin'],
      configFiles: ['model/config.json'], integrity, license: 'Apache-2.0',
      attribution: 'Google Magika', capabilities: ['text_extraction'],
      supportedFormatIds: [], supportedMimeTypes: [], supportedLabels: ['json'], platform: 'any',
    }
    await writeFileAsync(path.join(pluginRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))

    const actualPackageHash = sha256(readFileSync(packagePath))
    const wrongManifestHash = sha256(Buffer.from('tampered'))

    const unsignedCatalog = {
      schemaVersion: '1', source: 'official', generatedAt: '2026-05-08T00:00:00.000Z',
      plugins: [{
        pluginId: 'magika', pluginVersion: '0.1.0',
        packageSha256: actualPackageHash,
        manifestSha256: wrongManifestHash,
        packagePath: 'package.tgz', manifestPath: 'manifest.json',
      }],
    }
    const signatureValue = sign(
      null,
      Buffer.from(createCatalogSigningPayload(unsignedCatalog)),
      privateKey
    ).toString('base64')
    const catalogPath = path.join(tempRoot, 'catalog.json')
    await writeFileAsync(catalogPath, JSON.stringify({ ...unsignedCatalog, signature: { keyId, algorithm: 'ed25519', value: signatureValue } }, null, 2))

    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)
    const service = new EnginePluginLifecycleService({
      registryRepo: repo,
      trustedRoots,
      resolveInstallPluginDir: ({ installRef: ref }) => path.join(tempRoot, ref),
    })
    try {
      const result = await service.registerLocalOfficialPlugin({
        catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('hash_verification_failed')
      }
    } finally {
      db.close()
      await rmAsync(tempRoot, { recursive: true, force: true })
    }
  })

  it('fails when package hash does not match catalog entry', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const keyId = 'starverse-test-root'
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const trustedRoots: TrustedCatalogPublicKeyMap = {
      [keyId]: { keyId, algorithm: 'ed25519', publicKeyPem },
    }

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-engine-lifecycle-'))
    const installRef = 'plugin_magika_001'
    const pluginRoot = path.join(tempRoot, installRef)
    await mkdir(path.join(pluginRoot, 'runtime'), { recursive: true })
    await mkdir(path.join(pluginRoot, 'model'), { recursive: true })

    const runtimePath = path.join(pluginRoot, 'runtime', 'runner.js')
    const modelPath = path.join(pluginRoot, 'model', 'model.bin')
    const configPath = path.join(pluginRoot, 'model', 'config.json')
    const packagePath = path.join(pluginRoot, 'package.tgz')
    await writeFileAsync(runtimePath, 'module.exports = {}')
    await writeFileAsync(modelPath, 'model-v1')
    await writeFileAsync(configPath, '{"ok":true}')
    await writeFileAsync(packagePath, 'package-bytes')

    const integrity = {
      'runtime/runner.js': sha256(readFileSync(runtimePath)),
      'model/model.bin': sha256(readFileSync(modelPath)),
      'model/config.json': sha256(readFileSync(configPath)),
    }

    const manifest = {
      manifestSchemaVersion: '1', engineId: 'magika', displayName: 'Magika',
      pluginVersion: '0.1.0', runtimeKind: 'local_loader', runtimeEntry: 'runtime/runner.js',
      modelVersion: 'magika-v3', modelFiles: ['model/model.bin'],
      configFiles: ['model/config.json'], integrity, license: 'Apache-2.0',
      attribution: 'Google Magika', capabilities: ['text_extraction'],
      supportedFormatIds: [], supportedMimeTypes: [], supportedLabels: ['json'], platform: 'any',
    }
    await writeFileAsync(path.join(pluginRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))

    const actualManifestHash = sha256(readFileSync(path.join(pluginRoot, 'manifest.json')))
    const wrongPackageHash = sha256(Buffer.from('tampered'))

    const unsignedCatalog = {
      schemaVersion: '1', source: 'official', generatedAt: '2026-05-08T00:00:00.000Z',
      plugins: [{
        pluginId: 'magika', pluginVersion: '0.1.0',
        packageSha256: wrongPackageHash,
        manifestSha256: actualManifestHash,
        packagePath: 'package.tgz', manifestPath: 'manifest.json',
      }],
    }
    const signatureValue = sign(
      null,
      Buffer.from(createCatalogSigningPayload(unsignedCatalog)),
      privateKey
    ).toString('base64')
    const catalogPath = path.join(tempRoot, 'catalog.json')
    await writeFileAsync(catalogPath, JSON.stringify({ ...unsignedCatalog, signature: { keyId, algorithm: 'ed25519', value: signatureValue } }, null, 2))

    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)
    const service = new EnginePluginLifecycleService({
      registryRepo: repo,
      trustedRoots,
      resolveInstallPluginDir: ({ installRef: ref }) => path.join(tempRoot, ref),
    })
    try {
      const result = await service.registerLocalOfficialPlugin({
        catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('hash_verification_failed')
      }
    } finally {
      db.close()
      await rmAsync(tempRoot, { recursive: true, force: true })
    }
  })

  it('fails when manifest engineId does not match catalog entry', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const keyId = 'starverse-test-root'
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const trustedRoots: TrustedCatalogPublicKeyMap = {
      [keyId]: { keyId, algorithm: 'ed25519', publicKeyPem },
    }

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-engine-lifecycle-'))
    const installRef = 'plugin_wrong_engine'
    const pluginRoot = path.join(tempRoot, installRef)
    await mkdir(path.join(pluginRoot, 'runtime'), { recursive: true })
    await mkdir(path.join(pluginRoot, 'model'), { recursive: true })

    const runtimePath = path.join(pluginRoot, 'runtime', 'runner.js')
    const modelPath = path.join(pluginRoot, 'model', 'model.bin')
    const configPath = path.join(pluginRoot, 'model', 'config.json')
    const packagePath = path.join(pluginRoot, 'package.tgz')
    await writeFileAsync(runtimePath, 'module.exports = {}')
    await writeFileAsync(modelPath, 'model-v1')
    await writeFileAsync(configPath, '{"ok":true}')
    await writeFileAsync(packagePath, 'package-bytes')

    const integrity = {
      'runtime/runner.js': sha256(readFileSync(runtimePath)),
      'model/model.bin': sha256(readFileSync(modelPath)),
      'model/config.json': sha256(readFileSync(configPath)),
    }

    const manifest = {
      manifestSchemaVersion: '1', engineId: 'magika', displayName: 'Magika',
      pluginVersion: '0.1.0', runtimeKind: 'local_loader', runtimeEntry: 'runtime/runner.js',
      modelVersion: 'magika-v3', modelFiles: ['model/model.bin'],
      configFiles: ['model/config.json'], integrity, license: 'Apache-2.0',
      attribution: 'Google Magika', capabilities: ['text_extraction'],
      supportedFormatIds: [], supportedMimeTypes: [], supportedLabels: ['json'], platform: 'any',
    }
    await writeFileAsync(path.join(pluginRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))

    const actualManifestHash = sha256(readFileSync(path.join(pluginRoot, 'manifest.json')))
    const actualPackageHash = sha256(readFileSync(packagePath))

    const unsignedCatalog = {
      schemaVersion: '1', source: 'official', generatedAt: '2026-05-08T00:00:00.000Z',
      plugins: [{
        pluginId: 'tika', pluginVersion: '0.1.0',
        packageSha256: actualPackageHash,
        manifestSha256: actualManifestHash,
        packagePath: 'package.tgz', manifestPath: 'manifest.json',
      }],
    }
    const signatureValue = sign(
      null,
      Buffer.from(createCatalogSigningPayload(unsignedCatalog)),
      privateKey
    ).toString('base64')
    const catalogPath = path.join(tempRoot, 'catalog.json')
    await writeFileAsync(catalogPath, JSON.stringify({ ...unsignedCatalog, signature: { keyId, algorithm: 'ed25519', value: signatureValue } }, null, 2))

    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)
    const service = new EnginePluginLifecycleService({
      registryRepo: repo,
      trustedRoots,
      resolveInstallPluginDir: ({ installRef: ref }) => path.join(tempRoot, ref),
    })
    try {
      const result = await service.registerLocalOfficialPlugin({
        catalogPath,
        pluginId: 'tika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('manifest_engine_mismatch')
      }
    } finally {
      db.close()
      await rmAsync(tempRoot, { recursive: true, force: true })
    }
  })

  it('fails when manifest pluginVersion does not match catalog entry', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const keyId = 'starverse-test-root'
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const trustedRoots: TrustedCatalogPublicKeyMap = {
      [keyId]: { keyId, algorithm: 'ed25519', publicKeyPem },
    }

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'starverse-engine-lifecycle-'))
    const installRef = 'plugin_wrong_version'
    const pluginRoot = path.join(tempRoot, installRef)
    await mkdir(path.join(pluginRoot, 'runtime'), { recursive: true })
    await mkdir(path.join(pluginRoot, 'model'), { recursive: true })

    const runtimePath = path.join(pluginRoot, 'runtime', 'runner.js')
    const modelPath = path.join(pluginRoot, 'model', 'model.bin')
    const configPath = path.join(pluginRoot, 'model', 'config.json')
    const packagePath = path.join(pluginRoot, 'package.tgz')
    await writeFileAsync(runtimePath, 'module.exports = {}')
    await writeFileAsync(modelPath, 'model-v1')
    await writeFileAsync(configPath, '{"ok":true}')
    await writeFileAsync(packagePath, 'package-bytes')

    const integrity = {
      'runtime/runner.js': sha256(readFileSync(runtimePath)),
      'model/model.bin': sha256(readFileSync(modelPath)),
      'model/config.json': sha256(readFileSync(configPath)),
    }

    const manifest = {
      manifestSchemaVersion: '1', engineId: 'magika', displayName: 'Magika',
      pluginVersion: '9.9.9', runtimeKind: 'local_loader', runtimeEntry: 'runtime/runner.js',
      modelVersion: 'magika-v3', modelFiles: ['model/model.bin'],
      configFiles: ['model/config.json'], integrity, license: 'Apache-2.0',
      attribution: 'Google Magika', capabilities: ['text_extraction'],
      supportedFormatIds: [], supportedMimeTypes: [], supportedLabels: ['json'], platform: 'any',
    }
    await writeFileAsync(path.join(pluginRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))

    const actualManifestHash = sha256(readFileSync(path.join(pluginRoot, 'manifest.json')))
    const actualPackageHash = sha256(readFileSync(packagePath))

    const unsignedCatalog = {
      schemaVersion: '1', source: 'official', generatedAt: '2026-05-08T00:00:00.000Z',
      plugins: [{
        pluginId: 'magika', pluginVersion: '0.1.0',
        packageSha256: actualPackageHash,
        manifestSha256: actualManifestHash,
        packagePath: 'package.tgz', manifestPath: 'manifest.json',
      }],
    }
    const signatureValue = sign(
      null,
      Buffer.from(createCatalogSigningPayload(unsignedCatalog)),
      privateKey
    ).toString('base64')
    const catalogPath = path.join(tempRoot, 'catalog.json')
    await writeFileAsync(catalogPath, JSON.stringify({ ...unsignedCatalog, signature: { keyId, algorithm: 'ed25519', value: signatureValue } }, null, 2))

    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)
    const service = new EnginePluginLifecycleService({
      registryRepo: repo,
      trustedRoots,
      resolveInstallPluginDir: ({ installRef: ref }) => path.join(tempRoot, ref),
    })
    try {
      const result = await service.registerLocalOfficialPlugin({
        catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('manifest_version_mismatch')
      }
    } finally {
      db.close()
      await rmAsync(tempRoot, { recursive: true, force: true })
    }
  })

  it('failureReason is sanitized in dto output', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots)
    try {
      const registered = await service.registerLocalOfficialPlugin({
        catalogPath: fixture.catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef: fixture.installRef,
      })
      expect(registered.ok).toBe(true)

      repo.markFailed({
        engineId: 'magika',
        failureReason: `C:\\Users\\test\\plugins\\magika\\manifest.json invalid abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`,
      })

      const installed = service.getInstalledPlugins()
      const failed = installed.find((item) => item.engineId === 'magika')
      expect(failed).toBeDefined()
      if (failed) {
        expect(failed.failureReason).not.toContain('C:')
        expect(failed.failureReason).not.toContain('Users')
        expect(failed.failureReason).not.toMatch(/\b[a-f0-9]{64}\b/)
      }
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('failureReason in error message is sanitized', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots)
    try {
      const registered = await service.registerLocalOfficialPlugin({
        catalogPath: fixture.catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef: fixture.installRef,
      })
      expect(registered.ok).toBe(true)

      // Remove the runtime file to force a health failure
      await rmAsync(path.join(fixture.tempRoot, fixture.installRef, 'runtime', 'runner.js'))

      const health = await service.runHealthCheck({ engineId: 'magika' })
      expect(health.ok).toBe(false)
      if (!health.ok) {
        expect(health.message).not.toContain(fixture.tempRoot)
        expect(health.message).not.toMatch(/\b[a-f0-9]{64}\b/)
      }
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('registers local package, enables, runs health check, and returns diagnostics with full lifecycle state', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
    try {
      const packageDir = path.join(fixture.tempRoot, fixture.installRef)
      const registered = await service.registerLocalPackage({
        packageDir,
        installRootKind: 'test_root',
        installRef: fixture.installRef,
      })
      expect(registered.ok).toBe(true)
      if (!registered.ok) return
      expect(registered.value.engineId).toBe('magika')
      expect(registered.value.installSource).toBe('local_package')
      expect(registered.value.installState).toBe('installed')
      expect(registered.value.enabled).toBe(true)
      expect(registered.value.healthStatus).toBe('unknown')

      const enabled = await service.enablePlugin({ engineId: 'magika' })
      expect(enabled.ok).toBe(true)

      const health = await service.runHealthCheck({ engineId: 'magika' })
      expect(health.ok).toBe(true)
      if (health.ok) {
        expect(health.value.healthStatus).toBe('healthy')
      }

      const diagnostics = service.getDiagnosticsSummary()
      const magikaEntry = diagnostics.engines.find((e) => e.engineId === 'magika')
      expect(magikaEntry).toBeDefined()
      expect(magikaEntry!.kind).toBe('plugin')
      expect(magikaEntry!.installed).toBe(true)
      expect(magikaEntry!.enabled).toBe(true)
      expect(magikaEntry!.healthStatus).toBe('healthy')
      expect(magikaEntry!.verificationStatus).toBe('verified')
      expect(magikaEntry!.installSource).toBe('local_package')
      expect(magikaEntry!.modelVersion).toBe('magika-v3')
      expect(magikaEntry!.pluginVersion).toBe('0.1.0')
      expect(diagnostics.counts.installed).toBeGreaterThanOrEqual(1)
      expect(diagnostics.counts.healthy).toBeGreaterThanOrEqual(1)
      expect(diagnostics.counts.unverified).toBe(0)

      const disabled = await service.disablePlugin({ engineId: 'magika' })
      expect(disabled.ok).toBe(true)
      if (disabled.ok) {
        expect(disabled.value.enabled).toBe(false)
      }

      const diagnosticsAfterDisable = service.getDiagnosticsSummary()
      const entryAfterDisable = diagnosticsAfterDisable.engines.find((e) => e.engineId === 'magika')
      expect(entryAfterDisable!.enabled).toBe(false)
      expect(diagnosticsAfterDisable.counts.enabled).toBeLessThan(diagnostics.counts.enabled)

      const uninstalled = await service.uninstallPlugin({ engineId: 'magika' })
      expect(uninstalled.ok).toBe(true)

      const diagnosticsAfterUninstall = service.getDiagnosticsSummary()
      const entryAfterUninstall = diagnosticsAfterUninstall.engines.find((e) => e.engineId === 'magika')
      expect(entryAfterUninstall!.installed).toBe(false)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('registerLocalPackage returns structured failure when plugin not found at packageDir', async () => {
    const fixture = await createFixture()
    const installRef = 'non_existent_plugin_001'
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
    try {
      const nonExistentDir = path.join(fixture.tempRoot, installRef)
      const registered = await service.registerLocalPackage({
        packageDir: nonExistentDir,
        installRootKind: 'test_root',
        installRef,
      })
      expect(registered.ok).toBe(false)
      if (!registered.ok) {
        expect(registered.reason).toBe('local_package_unavailable')
        expect(typeof registered.message).toBe('string')
        expect(registered.message.length).toBeGreaterThan(0)
      }
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('registerLocalPackage sanitizes failure message to exclude raw paths', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
    try {
      const corruptDir = path.join(fixture.tempRoot, fixture.installRef)
      await rmAsync(path.join(corruptDir, 'manifest.json'))

      const registered = await service.registerLocalPackage({
        packageDir: corruptDir,
        installRootKind: 'test_root',
        installRef: fixture.installRef,
      })
      expect(registered.ok).toBe(false)
      if (!registered.ok) {
        expect(registered.message).not.toContain(corruptDir)
        expect(registered.message).not.toMatch(/[a-zA-Z]:\\\\/)
      }
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('getDiagnosticsSummary returns builtin engines always present regardless of plugin state', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
    try {
      const diagnostics = service.getDiagnosticsSummary()
      const builtinIds = ['tika', 'libreoffice', 'ffprobe', 'pandoc']
      for (const id of builtinIds) {
        const entry = diagnostics.engines.find((e) => e.engineId === id)
        expect(entry).toBeDefined()
        expect(entry!.kind).toBe('builtin')
        expect(entry!.verificationStatus).toBeNull()
      }
      expect(diagnostics.engines.length).toBeGreaterThanOrEqual(4)
      expect(diagnostics.counts.total).toBeGreaterThanOrEqual(4)
      expect(diagnostics.counts.installed).toBe(0)
      expect(diagnostics.counts.enabled).toBe(0)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('does not count registered builtin rows in plugin summary totals', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
    try {
      repo.upsert(registryRecord({
        engineId: 'tika',
        displayName: 'Tika',
        enabled: true,
        healthStatus: 'healthy',
      }))

      const diagnostics = service.getDiagnosticsSummary()
      const tika = diagnostics.engines.find((entry) => entry.engineId === 'tika')
      expect(tika?.kind).toBe('builtin')
      expect(tika?.installed).toBe(true)
      expect(tika?.enabled).toBe(true)
      expect(diagnostics.counts.installed).toBe(0)
      expect(diagnostics.counts.enabled).toBe(0)
      expect(diagnostics.counts.healthy).toBe(0)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('lists embedded official Magika when the production trusted root is configured', async () => {
    const fixture = await createFixture()
    const officialRoots = createOfficialTrustedRoots(MAGIKA_OFFICIAL_PUBLIC_KEY_PEM)
    const { db, service } = createService(fixture.tempRoot, officialRoots, { trustedRootSource: 'official' })
    try {
      const result = await service.listOfficialPlugins()
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value).toHaveLength(1)
      expect(result.value[0]).toMatchObject({
        pluginId: 'magika',
        displayName: 'Magika',
        pluginVersion: '0.1.0',
        installState: 'not_installed',
        enabled: false,
        installabilityStatus: 'official_remote_install_available',
        verificationMetadataStatus: 'production_signature_available',
        recommendedInstallRootKind: 'managed_root',
      })
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('keeps catalog-only Magika out of registered and enabled diagnostics counts', async () => {
    const fixture = await createFixture()
    const officialRoots = createOfficialTrustedRoots(MAGIKA_OFFICIAL_PUBLIC_KEY_PEM)
    const { db, service } = createService(fixture.tempRoot, officialRoots, { trustedRootSource: 'official' })
    try {
      const official = await service.listOfficialPlugins()
      expect(official.ok).toBe(true)

      const diagnostics = service.getDiagnosticsSummary()
      expect(diagnostics.engines.find((entry) => entry.engineId === 'magika')).toBeFalsy()
      expect(diagnostics.counts.installed).toBe(0)
      expect(diagnostics.counts.enabled).toBe(0)
      expect(diagnostics.counts.enabled).toBeLessThanOrEqual(diagnostics.counts.installed)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('counts registered disabled and enabled plugins consistently', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots)
    try {
      repo.upsert(registryRecord({ engineId: 'magika-disabled', enabled: false, healthStatus: 'healthy' }))

      const disabledSummary = service.getDiagnosticsSummary()
      expect(disabledSummary.counts.installed).toBe(1)
      expect(disabledSummary.counts.enabled).toBe(0)
      expect(disabledSummary.counts.healthy).toBe(1)
      expect(disabledSummary.counts.enabled).toBeLessThanOrEqual(disabledSummary.counts.installed)

      repo.upsert(registryRecord({
        engineId: 'magika-enabled',
        enabled: true,
        healthStatus: 'unhealthy',
        failureReason: 'health_check_failed',
      }))

      const enabledSummary = service.getDiagnosticsSummary()
      expect(enabledSummary.counts.installed).toBe(2)
      expect(enabledSummary.counts.enabled).toBe(1)
      expect(enabledSummary.counts.healthy).toBe(1)
      expect(enabledSummary.counts.failed).toBe(1)
      expect(enabledSummary.counts.enabled).toBeLessThanOrEqual(enabledSummary.counts.installed)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('does not expose raw paths or hashes in diagnostics summary', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots)
    try {
      const hash = 'd'.repeat(64)
      repo.upsert(registryRecord({
        engineId: 'magika-failed',
        enabled: false,
        installState: 'failed',
        healthStatus: 'unhealthy',
        failureReason: `C:\\Users\\owner\\private.pem signature ${hash}`,
      }))

      const text = JSON.stringify(service.getDiagnosticsSummary())
      expect(text).not.toContain('C:\\Users\\owner')
      expect(text).not.toContain('private.pem')
      expect(text).not.toContain(hash)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('getDiagnosticsSummary reflects installed plugin engine after registerLocalPackage', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
    try {
      const packageDir = path.join(fixture.tempRoot, fixture.installRef)

      const before = service.getDiagnosticsSummary()
      expect(before.engines.find((e) => e.engineId === 'magika')).toBeFalsy()
      expect(before.counts.installed).toBe(0)
      expect(before.counts.unverified).toBe(0)

      const registered = await service.registerLocalPackage({
        packageDir,
        installRootKind: 'test_root',
        installRef: fixture.installRef,
      })
      expect(registered.ok).toBe(true)

      const after = service.getDiagnosticsSummary()
      const magika = after.engines.find((e) => e.engineId === 'magika')
      expect(magika).toBeDefined()
      expect(magika!.kind).toBe('plugin')
      expect(after.counts.unverified).toBe(0)
      expect(after.counts.installed).toBe(1)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })
})

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

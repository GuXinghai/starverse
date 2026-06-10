import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, mkdir, rm as rmAsync, writeFile as writeFileAsync } from 'node:fs/promises'
import { deflateRawSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createCatalogSigningPayload, type TrustedCatalogPublicKeyMap } from '../../src/next/file-type/pluginCatalogSignature'
import type { EngineHealthRunner } from '../../src/next/file-type'
import {
  createOfficialTrustedRoots,
} from '../../src/next/file-type/officialPluginTrustedRoots'
import {
  MAGIKA_OFFICIAL_PLUGIN_VERSION,
  MAGIKA_OFFICIAL_PUBLIC_KEY_PEM,
} from '../../src/next/plugin-distribution/magikaOfficialRelease'
import type { OfficialPackageReleaseMetadata } from '../../src/next/plugin-distribution/officialPackageRelease'
import type { PackageDownloadTransport } from '../../src/next/plugin-distribution/packageDownloader'
import { ensureEnginePluginRegistrySchema } from '../db/migrations/ensureEnginePluginRegistrySchema'
import { EnginePluginRegistryRepo } from '../db/repo/enginePluginRegistryRepo'
import type { DfcOfficePdfRuntimeAvailabilitySummary } from './dfcManagedLibreOfficeRuntime'
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

  await writeFileAsync(runtimeEntryPath, 'console.log(JSON.stringify({ label: "json", score: 0.99, modelVersion: "fake" }))')
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
    officialPackageTransport?: PackageDownloadTransport
    readBytes?: (filePath: string) => Promise<Uint8Array>
    healthRunner?: EngineHealthRunner
    dfcLibreOfficeRuntimeSummary?: () => DfcOfficePdfRuntimeAvailabilitySummary | null
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
    readBytes: opts.readBytes,
    healthRunner: opts.healthRunner,
    dfcLibreOfficeRuntimeSummary: opts.dfcLibreOfficeRuntimeSummary,
    magikaOfficialRelease: opts.magikaOfficialRelease,
    officialPackageTransport: opts.officialPackageTransport ?? (opts.officialPackageBytes
      ? {
          async fetchPackage() {
            return {
              ok: true,
              bytes: opts.officialPackageBytes!,
              finalRef: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/pkg.zip',
            }
          },
        }
      : undefined),
  })
  return { db, repo, service }
}

function registryRecord(overrides?: Record<string, unknown>) {
  return {
    engineId: 'magika',
    displayName: 'Magika',
    pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
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

function dfcLibreOfficeSummary(
  overrides: Partial<DfcOfficePdfRuntimeAvailabilitySummary> = {}
): DfcOfficePdfRuntimeAvailabilitySummary {
  const runtime = {
    pluginId: 'libreoffice',
    engineId: 'libreoffice',
    runtimeId: 'libreoffice-office-pdf',
    pluginVersion: '0.1.0',
    packageVersion: '2026.06.01',
    libreOfficeVersion: '24.8.0',
    runtimeKind: 'managed_external_process',
    platform: process.platform,
    arch: process.arch,
    capabilities: ['office_to_pdf', 'docx_to_pdf'],
    manifestHashPrefix: 'abc123def456',
    executableRef: 'managed_relative_executable',
  } as const
  return {
    status: 'experimental',
    healthStatus: 'healthy',
    productCode: null,
    internalCode: null,
    message: 'LibreOffice managed runtime is available for owner-gated Office PDF conversion.',
    retryable: false,
    recoverable: false,
    source: 'fake_seam',
    runtime,
    ...overrides,
  }
}

async function waitForInstallOperation(
  service: EnginePluginLifecycleService,
  operationId: string,
  predicate: (state: string) => boolean = (state) => state === 'installed' || state === 'failed'
) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const status = service.getInstallOperationStatus({ operationId })
    if (status.ok && status.value && predicate(status.value.state)) {
      return status.value
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`install operation did not reach expected state: ${operationId}`)
}

async function waitForPathToDisappear(filePath: string) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (!existsSync(filePath)) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`path did not disappear: ${filePath}`)
}

// eslint-disable-next-line max-lines-per-function
async function createOfficialRemoteInstallFixture(options: Readonly<{
  healthcheck?: boolean
  omitDependency?: boolean
  omitInventory?: boolean
  omitRuntimeDependencyDeclarations?: boolean
  tamperArtifactHash?: string
  tamperArtifactSize?: string
  runtimeCode?: string
}> = {}) {
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

  const engineRuntime = Buffer.from(options.runtimeCode ?? 'console.log(JSON.stringify({ label: "json", score: 0.99, modelVersion: "fake" }))')
  const engineModel = Buffer.from('model-v1')
  const engineConfig = Buffer.from('{"ok":true}')
  const dependencyPackage = Buffer.from('{"name":"magika","version":"fake"}')
  const licenseFile = Buffer.from('Apache-2.0')
  const attributionFile = Buffer.from('Google Magika')
  const packageSignatureFile = Buffer.from('test-signature-placeholder')
  const managedManifestSource: Record<string, unknown> = {
    manifestSchemaVersion: '1',
    engineId: 'magika',
    displayName: 'Magika managed plugin',
    pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
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
    ...(options.healthcheck
      ? { healthcheck: { command: 'magika-health', args: ['--check'] } }
      : {}),
  }
  if (!options.omitRuntimeDependencyDeclarations) {
    managedManifestSource.requiredRuntimePaths = [
      { path: 'node_modules/magika/package.json', kind: 'file' },
    ]
    managedManifestSource.dependencyRoots = [{ path: 'node_modules', kind: 'directory' }]
  }
  const managedManifest = Buffer.from(JSON.stringify(managedManifestSource, null, 2))
  const packageManifest = Buffer.from(JSON.stringify({
    manifestSchemaVersion: '1',
    pluginId: 'magika',
    displayName: 'Magika',
    publisher: 'Google Magika',
    pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
    runtimeKind: 'managed',
    compatibility: { platforms: ['win32'], architectures: ['x64'], starverseVersionRange: '>=0.0.0' },
    capabilities: ['file_identification', 'model_inference'],
    artifactInventoryRef: 'inventory.json',
    licenseRefs: ['licenses/LICENSE.txt'],
    attributionRefs: ['attribution/NOTICE.txt'],
    network: { allowed: false },
  }, null, 2))
  const inventoryObj: Record<string, unknown> = {
    inventorySchemaVersion: '1',
    pluginId: 'magika',
    pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
    artifacts: [
      {
        artifactId: 'package-manifest',
        relativePath: 'manifest.json',
        artifactClass: 'manifest',
        sha256: sha256(packageManifest),
        sizeBytes: packageManifest.byteLength,
        required: true,
      },
      {
        artifactId: 'managed-runtime',
        relativePath: 'engine/runtime/runner.js',
        artifactClass: 'runtime',
        sha256: sha256(engineRuntime),
        sizeBytes: engineRuntime.byteLength,
        required: true,
      },
      {
        artifactId: 'package-signature',
        relativePath: 'signatures/package.sig.json',
        artifactClass: 'signature',
        sha256: sha256(packageSignatureFile),
        sizeBytes: packageSignatureFile.byteLength,
        required: true,
      },
      {
        artifactId: 'license',
        relativePath: 'licenses/LICENSE.txt',
        artifactClass: 'license',
        sha256: sha256(licenseFile),
        sizeBytes: licenseFile.byteLength,
        required: true,
      },
      {
        artifactId: 'attribution',
        relativePath: 'attribution/NOTICE.txt',
        artifactClass: 'attribution',
        sha256: sha256(attributionFile),
        sizeBytes: attributionFile.byteLength,
        required: true,
      },
      {
        artifactId: 'model',
        relativePath: 'engine/model/model.bin',
        artifactClass: 'model',
        sha256: sha256(engineModel),
        sizeBytes: engineModel.byteLength,
        required: true,
      },
      {
        artifactId: 'config',
        relativePath: 'engine/model/config.json',
        artifactClass: 'config',
        sha256: sha256(engineConfig),
        sizeBytes: engineConfig.byteLength,
        required: true,
      },
      {
        artifactId: 'magika-package-json',
        relativePath: 'engine/node_modules/magika/package.json',
        artifactClass: 'runtime',
        sha256: sha256(dependencyPackage),
        sizeBytes: dependencyPackage.byteLength,
        required: true,
      },
    ],
  }
  if (options.tamperArtifactHash || options.tamperArtifactSize) {
    const artifacts = inventoryObj.artifacts as Array<Record<string, unknown>>
    const targetId = options.tamperArtifactHash ?? options.tamperArtifactSize
    const target = artifacts.find((a) => a.artifactId === targetId)
    if (target) {
      if (options.tamperArtifactHash) {
        target.sha256 = '0'.repeat(64)
      }
      if (options.tamperArtifactSize) {
        target.sizeBytes = 999999
      }
    }
  }
  const inventory = Buffer.from(JSON.stringify(inventoryObj, null, 2))
  const zipEntries: Array<[string, Buffer]> = [
    ['manifest.json', packageManifest],
    ['signatures/package.sig.json', packageSignatureFile],
    ['licenses/LICENSE.txt', licenseFile],
    ['attribution/NOTICE.txt', attributionFile],
    ['engine/manifest.json', managedManifest],
    ['engine/runtime/runner.js', engineRuntime],
    ['engine/model/model.bin', engineModel],
    ['engine/model/config.json', engineConfig],
  ]
  if (!options.omitInventory) zipEntries.push(['inventory.json', inventory])
  if (!options.omitDependency) zipEntries.push(['engine/node_modules/magika/package.json', dependencyPackage])
  const bytes = createZip(zipEntries)
  const signature = sign(null, Buffer.from(bytes), privateKey).toString('base64')
  const release: OfficialPackageReleaseMetadata = {
    catalogEntry: {
      pluginId: 'magika',
      pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
      runtimeKind: 'managed',
      platform: 'win32',
      arch: 'x64',
      packageRef: `starverse-plugin-magika-v${MAGIKA_OFFICIAL_PLUGIN_VERSION}/test.zip`,
      packageSha256: sha256(bytes),
      packageSizeBytes: bytes.byteLength,
      manifestSha256: sha256(packageManifest),
      inventorySha256: sha256(inventory),
      signatureRef: 'signatures/package.sig.json',
      compatibility: { platforms: ['win32'], architectures: ['x64'], starverseVersionRange: '>=0.0.0' },
      channel: 'stable',
    },
    releaseUrl: `https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v${MAGIKA_OFFICIAL_PLUGIN_VERSION}/test.zip`,
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
      pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
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
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.pluginId).toBe('magika')
      expect(result.value.operationType).toBe('official_install')
      expect(result.value.source).toBe('official_builtin')
      expect(['accepted', 'pending', 'downloading']).toContain(result.value.state)
      const completed = await waitForInstallOperation(service, result.value.operationId)
      expect(completed.state).toBe('installed')
      expect(completed.installedEngineId).toBe('magika')
      expect(completed.stateHistory).toEqual([
        'accepted',
        'pending',
        'downloading',
        'verifying',
        'staging',
        'registering',
        'health_checking',
        'installed',
      ])
      expect(completed.terminalAt).toBeGreaterThanOrEqual(completed.startedAt)
      expect(completed.progressSummary).toBe('Installed')
      expect(repo.getByEngineId('magika')).toMatchObject({
        engineId: 'magika',
        installSource: 'official_catalog',
        installRootKind: 'managed_root',
        installRef: 'magika',
        enabled: false,
        healthStatus: 'healthy',
      })
      const registryRecord = repo.getByEngineId('magika')
      expect(registryRecord?.metadataJson?.officialRelease).toMatchObject({
        pluginId: 'magika',
        packageVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
        modelVersion: 'magika-v3',
        packageFormatVersion: 1,
        manifestSchemaVersion: '1',
        inventorySchemaVersion: '1',
        packageSha256: fixture.release.catalogEntry.packageSha256,
        packageSizeBytes: fixture.release.catalogEntry.packageSizeBytes,
        manifestSha256: fixture.release.catalogEntry.manifestSha256,
        inventorySha256: fixture.release.catalogEntry.inventorySha256,
        releaseUrl: fixture.release.releaseUrl,
        releaseTag: `starverse-plugin-magika-v${MAGIKA_OFFICIAL_PLUGIN_VERSION}`,
        assetName: 'test.zip',
        trustKeyId: 'starverse-test-official-root',
        signedAt: '2026-05-14T00:00:00.000Z',
        expiresAt: '2027-05-14T00:00:00.000Z',
        channel: 'stable',
        platform: 'win32',
        arch: 'x64',
      })
      expect(registryRecord?.metadataJson?.previousKnownGood).toBeNull()
      const installedDto = service.getInstalledPlugins().find((item) => item.engineId === 'magika')
      expect(installedDto?.installedVersion).toBe(MAGIKA_OFFICIAL_PLUGIN_VERSION)
      expect(installedDto?.availableVersion).toBe(MAGIKA_OFFICIAL_PLUGIN_VERSION)
      expect(installedDto?.releaseProvenance?.trustKeyId).toBe('starverse-test-official-root')
      expect(readFileSync(path.join(fixture.tempRoot, 'magika', 'manifest.json'), 'utf8')).toContain(
        'Magika managed plugin'
      )
      expect(existsSync(path.join(fixture.tempRoot, 'magika', 'node_modules', 'magika', 'package.json'))).toBe(true)

      const duplicate = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(duplicate.ok).toBe(false)
      if (!duplicate.ok) expect(duplicate.reason).toBe('already_registered')
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('merges official release provenance with existing registry metadata', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      repo.upsert({
        engineId: 'magika',
        displayName: 'Magika managed plugin',
        pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
        manifestSchemaVersion: '1',
        manifestHash: '0'.repeat(64),
        runtimeKind: 'local_loader',
        modelVersion: 'magika-v3',
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
        failureReason: null,
        installSource: 'official_catalog',
        installRootKind: 'managed_root',
        installRef: 'magika',
        installedAt: 1,
        updatedAt: 2,
        lastVerifiedAt: null,
        lastHealthCheckAt: null,
        metadataJson: {
          ownerNote: 'keep',
          previousKnownGood: {
            pluginId: 'magika',
            pluginVersion: '0.1.0',
            runtimeKind: 'local_loader',
            installRef: 'magika_previous',
            packageRef: 'package_magika_previous',
          },
        },
      })

      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      await waitForInstallOperation(service, result.value.operationId)
      const metadata = repo.getByEngineId('magika')?.metadataJson
      expect(metadata?.ownerNote).toBe('keep')
      expect(metadata?.previousKnownGood).toMatchObject({
        pluginVersion: '0.1.0',
        installRef: 'magika_previous',
      })
      expect(metadata?.officialRelease).toMatchObject({
        packageVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
        trustKeyId: 'starverse-test-official-root',
      })
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('returns null release provenance for legacy or invalid registry metadata', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots)
    try {
      repo.upsert(registryRecord({
        engineId: 'legacy-magika',
        installRef: 'legacy_magika',
        metadataJson: {
          officialCatalog: {
            pluginId: 'legacy-magika',
            pluginVersion: '0.1.0',
          },
        },
      }))
      repo.upsert(registryRecord({
        engineId: 'invalid-magika',
        installRef: 'invalid_magika',
        metadataJson: {
          officialRelease: {
            pluginId: 'invalid-magika',
            packageVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
            packageSha256: 'not-a-sha',
          },
        },
      }))

      const installed = service.getInstalledPlugins()
      expect(installed.find((item) => item.engineId === 'legacy-magika')?.releaseProvenance).toBeNull()
      expect(installed.find((item) => item.engineId === 'invalid-magika')?.releaseProvenance).toBeNull()
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('fails closed when official Magika engine manifest does not declare runtime dependencies', async () => {
    const fixture = await createOfficialRemoteInstallFixture({
      omitRuntimeDependencyDeclarations: true,
    })
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed.state).toBe('failed')
      expect(failed.failureReason).toBe('dependency_missing')
      expect(failed.sanitizedDiagnostics.join('\n')).toContain(
        'official magika package does not declare required runtime dependencies'
      )
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
      })
      expect(repo.getByEngineId('magika')).not.toMatchObject({
        installState: 'installed',
        healthStatus: 'healthy',
      })
      expect(existsSync(path.join(fixture.tempRoot, 'magika'))).toBe(false)
      await waitForPathToDisappear(path.join(fixture.tempRoot, `magika.stage-${failed.operationId}`))
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('fails official Magika install when declared dependency is missing and leaves no discoverable final dir', async () => {
    const fixture = await createOfficialRemoteInstallFixture({ omitDependency: true })
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed.state).toBe('failed')
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
      })
      expect(existsSync(path.join(fixture.tempRoot, 'magika'))).toBe(false)
      await waitForPathToDisappear(path.join(fixture.tempRoot, `magika.stage-${result.value.operationId}`))
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('fails official Magika install when inventory is missing', async () => {
    const fixture = await createOfficialRemoteInstallFixture({ omitInventory: true })
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed.state).toBe('failed')
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
      })
      expect(existsSync(path.join(fixture.tempRoot, 'magika'))).toBe(false)
      await waitForPathToDisappear(path.join(fixture.tempRoot, `magika.stage-${result.value.operationId}`))
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('fails official Magika install when inventory artifact sha256 is tampered', async () => {
    const fixture = await createOfficialRemoteInstallFixture({ tamperArtifactHash: 'managed-runtime' })
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed.state).toBe('failed')
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
      })
      expect(existsSync(path.join(fixture.tempRoot, 'magika'))).toBe(false)
      await waitForPathToDisappear(path.join(fixture.tempRoot, `magika.stage-${result.value.operationId}`))
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('fails official Magika install when inventory artifact size is tampered', async () => {
    const fixture = await createOfficialRemoteInstallFixture({ tamperArtifactSize: 'config' })
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed.state).toBe('failed')
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
      })
      expect(existsSync(path.join(fixture.tempRoot, 'magika'))).toBe(false)
      await waitForPathToDisappear(path.join(fixture.tempRoot, `magika.stage-${result.value.operationId}`))
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('uninstalls official Magika by deleting final and owned stale staging dirs', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const completed = await waitForInstallOperation(service, result.value.operationId)
      expect(completed.state).toBe('installed')
      const finalDir = path.join(fixture.tempRoot, 'magika')
      const staleStage = path.join(fixture.tempRoot, 'magika.stage-old')
      const staleRollback = path.join(fixture.tempRoot, 'magika.rollback-old')
      const nonMagika = path.join(fixture.tempRoot, 'pandoc.stage-old')
      await mkdir(path.join(staleStage, 'node_modules', 'magika'), { recursive: true })
      await writeFileAsync(path.join(staleStage, 'node_modules', 'magika', 'package.json'), '{}')
      await mkdir(staleRollback, { recursive: true })
      await mkdir(nonMagika, { recursive: true })

      const uninstalled = await service.uninstallPlugin({ engineId: 'magika' })
      expect(uninstalled.ok).toBe(true)
      if (!uninstalled.ok) return
      expect(uninstalled.value).toMatchObject({
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
      })
      expect(repo.getByEngineId('magika')).toMatchObject({ installState: 'uninstalled', enabled: false })
      expect(existsSync(finalDir)).toBe(false)
      expect(existsSync(staleStage)).toBe(false)
      expect(existsSync(staleRollback)).toBe(false)
      expect(existsSync(nonMagika)).toBe(true)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('fails uninstall cleanup through safe-delete guard for dangerous managed paths', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const { db, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
    })
    const service = new EnginePluginLifecycleService({
      registryRepo: repo,
      trustedRoots: fixture.trustedRoots,
      trustedRootSource: 'official',
      resolveInstallPluginDir: () => fixture.tempRoot,
    })
    try {
      repo.upsert(registryRecord({
        engineId: 'magika',
        installSource: 'official_catalog',
        installRootKind: 'managed_root',
        installRef: 'magika',
        enabled: true,
        healthStatus: 'healthy',
      }))
      const result = await service.uninstallPlugin({ engineId: 'magika' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('cleanup_failed')
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
      })
      expect(existsSync(fixture.tempRoot)).toBe(true)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('restores previous final directory when final health fails after promote', async () => {
    const fixture = await createOfficialRemoteInstallFixture({ healthcheck: true })
    let healthCalls = 0
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
      async healthRunner() {
        healthCalls += 1
        return healthCalls === 1
          ? { status: 'healthy', reason: null, detail: null }
          : { status: 'failed', reason: 'engine_failed', detail: 'final probe failed' }
      },
    })
    try {
      const oldFinal = path.join(fixture.tempRoot, 'magika')
      await mkdir(oldFinal, { recursive: true })
      await writeFileAsync(path.join(oldFinal, 'old-version.txt'), 'old')
      repo.upsert(registryRecord({
        engineId: 'magika',
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
        installRef: 'magika',
      }))

      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed.state).toBe('failed')
      expect(existsSync(path.join(oldFinal, 'old-version.txt'))).toBe(true)
      expect(existsSync(path.join(oldFinal, 'manifest.json'))).toBe(false)
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
      })
      await waitForPathToDisappear(path.join(fixture.tempRoot, `magika.stage-${result.value.operationId}`))
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('starts official Magika install as a quick operation and reuses it for duplicate clicks', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    let fetchCalls = 0
    let releaseDownload: (value: void) => void = () => undefined
    const downloadGate = new Promise<void>((resolve) => {
      releaseDownload = resolve
    })
    const transport: PackageDownloadTransport = {
      async fetchPackage() {
        fetchCalls += 1
        await downloadGate
        return {
          ok: true,
          bytes: fixture.bytes,
          finalRef: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/pkg.zip',
        }
      },
    }
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageTransport: transport,
    })
    try {
      const startedAt = Date.now()
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(Date.now() - startedAt).toBeLessThan(100)
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const duplicate = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(duplicate.ok).toBe(true)
      if (!duplicate.ok) return
      expect(duplicate.value.operationId).toBe(result.value.operationId)
      expect(fetchCalls).toBe(1)

      releaseDownload()
      const completed = await waitForInstallOperation(service, result.value.operationId)
      expect(completed.state).toBe('installed')
      expect(repo.getByEngineId('magika')?.enabled).toBe(false)
    } finally {
      releaseDownload()
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('keeps duplicate official install requests attached after registry upsert until terminal state', async () => {
    const fixture = await createOfficialRemoteInstallFixture({ healthcheck: true })
    let fetchCalls = 0
    let healthCalls = 0
    let releaseHealth: (value: void) => void = () => undefined
    const healthGate = new Promise<void>((resolve) => {
      releaseHealth = resolve
    })
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageTransport: {
        async fetchPackage() {
          fetchCalls += 1
          return {
            ok: true,
            bytes: fixture.bytes,
            finalRef: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/pkg.zip',
          }
        },
      },
      async healthRunner() {
        healthCalls += 1
        if (healthCalls === 1) {
          return { status: 'healthy', reason: null, detail: null }
        }
        await healthGate
        return { status: 'healthy', reason: null, detail: null }
      },
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const checking = await waitForInstallOperation(
        service,
        result.value.operationId,
        (state) => state === 'health_checking'
      )
      expect(checking.state).toBe('health_checking')
      expect(repo.getByEngineId('magika')).toBeNull()

      const duplicate = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(duplicate.ok).toBe(true)
      if (!duplicate.ok) return
      expect(duplicate.value.operationId).toBe(result.value.operationId)
      expect(fetchCalls).toBe(1)

      releaseHealth()
      const completed = await waitForInstallOperation(service, result.value.operationId)
      expect(completed.state).toBe('installed')
    } finally {
      releaseHealth()
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('supersedes an active official install on uninstall and prevents stale registry writes', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    let releaseDownload: (value: void) => void = () => undefined
    const downloadGate = new Promise<void>((resolve) => {
      releaseDownload = resolve
    })
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageTransport: {
        async fetchPackage() {
          await downloadGate
          return {
            ok: true,
            bytes: fixture.bytes,
            finalRef: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/pkg.zip',
          }
        },
      },
    })
    try {
      repo.upsert(registryRecord({
        engineId: 'magika',
        displayName: 'Magika',
        pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
        failureReason: null,
      }))

      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      await waitForInstallOperation(service, result.value.operationId, (state) => state === 'downloading')

      const uninstalled = await service.uninstallPlugin({ engineId: 'magika' })
      expect(uninstalled.ok).toBe(true)
      const stale = service.getInstallOperationStatus({ operationId: result.value.operationId })
      expect(stale.ok && stale.value?.state).toBe('stale')

      releaseDownload()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'uninstalled',
        enabled: false,
      })
      expect(service.getInstallOperationStatus({ operationId: result.value.operationId })).toMatchObject({
        ok: true,
        value: expect.objectContaining({ state: 'stale', diagnosticCode: 'operation_stale' }),
      })
    } finally {
      releaseDownload()
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('prevents stale install cleanup from deleting an immediate reinstall target', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    let fetchCalls = 0
    let releaseFirstDownload: (value: void) => void = () => undefined
    const firstDownloadGate = new Promise<void>((resolve) => {
      releaseFirstDownload = resolve
    })
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageTransport: {
        async fetchPackage() {
          fetchCalls += 1
          if (fetchCalls === 1) await firstDownloadGate
          return {
            ok: true,
            bytes: fixture.bytes,
            finalRef: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/pkg.zip',
          }
        },
      },
    })
    try {
      repo.upsert(registryRecord({
        engineId: 'magika',
        displayName: 'Magika',
        pluginVersion: '0.1.0',
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
        failureReason: null,
      }))

      const first = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      await waitForInstallOperation(service, first.value.operationId, (state) => state === 'downloading')

      const uninstalled = await service.uninstallPlugin({ engineId: 'magika' })
      expect(uninstalled.ok).toBe(true)

      const second = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.value.operationId).not.toBe(first.value.operationId)
      const installed = await waitForInstallOperation(service, second.value.operationId)
      expect(installed.state).toBe('installed')
      expect(existsSync(path.join(fixture.tempRoot, 'magika', 'manifest.json'))).toBe(true)

      releaseFirstDownload()
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(repo.getByEngineId('magika')).toMatchObject({ installState: 'installed' })
      expect(existsSync(path.join(fixture.tempRoot, 'magika', 'manifest.json'))).toBe(true)
      expect(service.getInstallOperationStatus({ operationId: first.value.operationId })).toMatchObject({
        ok: true,
        value: expect.objectContaining({ state: 'stale', diagnosticCode: 'operation_stale' }),
      })
    } finally {
      releaseFirstDownload()
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('supersedes terminal installed operations when metadata is uninstalled', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const installed = await waitForInstallOperation(service, result.value.operationId)
      expect(installed.state).toBe('installed')

      const uninstalled = await service.uninstallPlugin({ engineId: 'magika' })
      expect(uninstalled.ok).toBe(true)
      expect(repo.getByEngineId('magika')).toMatchObject({ installState: 'uninstalled', enabled: false })
      expect(service.getInstallOperationStatus({ operationId: result.value.operationId })).toMatchObject({
        ok: true,
        value: expect.objectContaining({ state: 'stale', diagnosticCode: 'operation_stale' }),
      })
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('records a structured failed operation and leaves Magika unregistered when download fails', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageTransport: {
        async fetchPackage() {
          return { ok: false, code: 'download_failed', detail: 'network_unavailable' }
        },
      },
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed).toMatchObject({
        state: 'failed',
        failureReason: 'download_failed',
        diagnosticCode: 'download_failed',
        installedEngineId: null,
      })
      expect(failed.sanitizedDiagnostics).toContain('download_failed')
      expect(repo.getByEngineId('magika')).toBeNull()
      const retry = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(retry.ok).toBe(true)
      if (retry.ok) {
        expect(retry.value.operationId).not.toBe(result.value.operationId)
        await waitForInstallOperation(service, retry.value.operationId)
      }
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('records a structured failed operation and leaves Magika disabled when registration fails', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
      async readBytes() {
        throw new Error('C:\\Users\\owner\\private.pem fullHash=' + 'a'.repeat(64))
      },
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed.state).toBe('failed')
      expect(failed.failureReason).toBe('registration_failed')
      expect(JSON.stringify(failed)).not.toContain('private.pem')
      expect(JSON.stringify(failed)).not.toContain('fullHash=')
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
      })
      await waitForPathToDisappear(path.join(fixture.tempRoot, `magika.stage-${result.value.operationId}`))
      expect(existsSync(path.join(fixture.tempRoot, 'magika'))).toBe(false)
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
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })

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
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed.state).toBe('failed')
      expect(failed.failureReason).toBe('signature_invalid')
      expect(repo.getByEngineId('magika')).toBeNull()
      const retry = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(retry.ok).toBe(false)
      if (!retry.ok) expect(retry.reason).toBe('signature_invalid')
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('records hash mismatch as terminal failure and leaves Magika unregistered', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const tampered = new Uint8Array(Buffer.from('not-the-official-package'))
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageTransport: {
        async fetchPackage() {
          return {
            ok: true,
            bytes: tampered,
            finalRef: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/pkg.zip',
          }
        },
      },
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed.state).toBe('failed')
      expect(['hash_mismatch', 'size_mismatch']).toContain(failed.failureReason)
      expect(repo.getByEngineId('magika')).toBeNull()
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('does not register official Magika as installed when final health check fails', async () => {
    const fixture = await createOfficialRemoteInstallFixture({ healthcheck: true })
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
      async healthRunner() {
        return { status: 'failed', reason: 'engine_failed', detail: 'probe failed' }
      },
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed).toMatchObject({
        state: 'failed',
        failureReason: 'health_failed',
      })
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
      })
      await waitForPathToDisappear(path.join(fixture.tempRoot, `magika.stage-${failed.operationId}`))
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('preserves specific Magika missing dependency diagnostics when official install health fails', async () => {
    const fixture = await createOfficialRemoteInstallFixture({
      runtimeCode: 'import("magika").catch((error) => { console.error(error); process.exit(1) })',
    })
    const { db, service, repo } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const result = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const failed = await waitForInstallOperation(service, result.value.operationId)
      expect(failed).toMatchObject({
        state: 'failed',
        failureReason: 'health_failed',
        diagnosticCode: expect.stringContaining('magika_runtime_missing_dependency'),
      })
      expect(failed.sanitizedDiagnostics.join('\n')).toContain('health_result_unhealthy')
      expect(failed.sanitizedDiagnostics.join('\n')).toContain('specificReason=magika_runtime_missing_dependency')
      expect(failed.sanitizedDiagnostics.join('\n')).toContain('sanitizedRootCause=ERR_MODULE_NOT_FOUND')
      expect(failed.errorChain).toMatchObject({
        operationLayer: { code: 'health_check_failed' },
        healthLayer: { outcome: 'unhealthy_result', stage: 'runtime_self_test' },
        runtimeLayer: { reason: 'magika_runtime_missing_dependency' },
        rootCauseLayer: { sanitizedRootCause: 'ERR_MODULE_NOT_FOUND' },
      })
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
        failureReason: 'magika_runtime_missing_dependency',
      })
      await waitForPathToDisappear(path.join(fixture.tempRoot, `magika.stage-${failed.operationId}`))
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

  it('registerLocalOfficialPlugin rejects active registered records', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'official' })
    try {
      repo.upsert(registryRecord({
        engineId: 'magika',
        displayName: 'Magika',
        pluginVersion: '0.1.0',
        installState: 'installed',
        enabled: false,
        healthStatus: 'unknown',
        failureReason: null,
      }))

      const result = await service.registerLocalOfficialPlugin({
        catalogPath: fixture.catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef: fixture.installRef,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('already_registered')
      }
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('registerLocalOfficialPlugin rejects blocked uninstalled tombstones', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'official' })
    try {
      repo.upsert(registryRecord({
        engineId: 'magika',
        displayName: 'Magika',
        pluginVersion: '0.1.0',
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
        failureReason: 'revoked',
      }))

      const result = await service.registerLocalOfficialPlugin({
        catalogPath: fixture.catalogPath,
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        installRootKind: 'managed_root',
        installRef: fixture.installRef,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('revoked')
      }
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
      const uninstalled = await service.uninstallPlugin({ engineId: 'magika' })
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

  it('preserves specific Magika missing dependency diagnostics for manual health checks', async () => {
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
      const pluginRoot = path.join(fixture.tempRoot, fixture.installRef)
      const runtimePath = path.join(pluginRoot, 'runtime', 'runner.js')
      const runtimeCode = 'import("magika").catch((error) => { console.error(error); process.exit(1) })'
      await writeFileAsync(runtimePath, runtimeCode)
      const manifestPath = path.join(pluginRoot, 'manifest.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
      manifest.integrity = {
        ...(manifest.integrity as Record<string, string>),
        'runtime/runner.js': sha256(Buffer.from(runtimeCode)),
      }
      await writeFileAsync(manifestPath, JSON.stringify(manifest, null, 2))

      const health = await service.runHealthCheck({ engineId: 'magika' })
      expect(health.ok).toBe(false)
      if (!health.ok) {
        expect(health.reason).toBe('health_check_failed')
        expect(health.errorChain).toMatchObject({
          operationLayer: { code: 'health_check_failed' },
          healthLayer: { outcome: 'unhealthy_result', stage: 'runtime_self_test' },
          runtimeLayer: { reason: 'magika_runtime_missing_dependency' },
          rootCauseLayer: { sanitizedRootCause: 'ERR_MODULE_NOT_FOUND' },
        })
      }
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
        failureReason: 'magika_runtime_missing_dependency',
      })
      expect(service.getInstalledPlugins()[0]).toMatchObject({
        failureReason: 'magika_runtime_missing_dependency',
        errorChain: {
          operationLayer: { code: 'health_check_failed' },
          healthLayer: { outcome: 'unhealthy_result', stage: 'runtime_self_test' },
          runtimeLayer: { reason: 'magika_runtime_missing_dependency' },
          rootCauseLayer: { sanitizedRootCause: 'ERR_MODULE_NOT_FOUND' },
        },
      })
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
    const { publicKey } = generateKeyPairSync('ed25519')
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
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
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

  it('registerLocalPackage rejects active registered records', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
    try {
      repo.upsert(registryRecord({
        engineId: 'magika',
        displayName: 'Magika',
        pluginVersion: '0.1.0',
        installState: 'installed',
        enabled: false,
        healthStatus: 'unknown',
        failureReason: null,
      }))

      const registered = await service.registerLocalPackage({
        packageDir: path.join(fixture.tempRoot, fixture.installRef),
        installRootKind: 'test_root',
        installRef: fixture.installRef,
      })

      expect(registered.ok).toBe(false)
      if (!registered.ok) {
        expect(registered.reason).toBe('already_registered')
      }
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'installed',
        failureReason: null,
      })
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('registerLocalPackage rejects blocked uninstalled tombstones', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots, { trustedRootSource: 'test' })
    try {
      repo.upsert(registryRecord({
        engineId: 'magika',
        displayName: 'Magika',
        pluginVersion: '0.1.0',
        installState: 'uninstalled',
        enabled: false,
        healthStatus: 'unknown',
        failureReason: 'revoked',
      }))

      const registered = await service.registerLocalPackage({
        packageDir: path.join(fixture.tempRoot, fixture.installRef),
        installRootKind: 'test_root',
        installRef: fixture.installRef,
      })

      expect(registered.ok).toBe(false)
      if (!registered.ok) {
        expect(registered.reason).toBe('revoked')
      }
      expect(repo.getByEngineId('magika')).toMatchObject({
        installState: 'uninstalled',
        failureReason: 'revoked',
      })
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

  it('exposes LibreOffice as a read-only managed runtime plugin when DFC summary is configured', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'test',
      dfcLibreOfficeRuntimeSummary: () => dfcLibreOfficeSummary(),
    })
    try {
      const installed = service.getInstalledPlugins().find((entry) => entry.engineId === 'libreoffice')
      expect(installed).toMatchObject({
        engineId: 'libreoffice',
        displayName: 'LibreOffice Office PDF',
        pluginVersion: '0.1.0',
        packageVersion: '2026.06.01',
        runtimeKind: 'managed_external_process',
        runtimeVersion: '24.8.0',
        installState: 'installed',
        enabled: true,
        healthStatus: 'degraded',
        failureReason: 'fake_seam_not_production_approved',
        installSource: 'local_package',
        installRootKind: 'test_root',
        modelVersion: null,
        releaseProvenance: null,
      })

      const diagnostics = service.getDiagnosticsSummary()
      const libreOffice = diagnostics.engines.find((entry) => entry.engineId === 'libreoffice')
      expect(libreOffice).toMatchObject({
        kind: 'plugin',
        installed: true,
        enabled: true,
        healthStatus: 'degraded',
        verificationStatus: 'verified',
        pluginVersion: '0.1.0',
        failureReason: 'fake_seam_not_production_approved',
        installSource: 'local_package',
      })
      expect(diagnostics.counts.installed).toBe(1)
      expect(diagnostics.counts.failed).toBe(1)
      expect(diagnostics.counts.healthy).toBe(0)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('maps missing LibreOffice runtime to plugin unhealthy without creating a registry row', async () => {
    const fixture = await createFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'test',
      dfcLibreOfficeRuntimeSummary: () => dfcLibreOfficeSummary({
        status: 'unavailable',
        healthStatus: 'missing',
        productCode: 'conversion_engine_missing',
        internalCode: 'office_pdf_runtime_missing',
        message: 'Office PDF runtime manifest is missing.',
        retryable: true,
        recoverable: true,
        source: 'missing_manifest',
        runtime: null,
      }),
    })
    try {
      const installed = service.getInstalledPlugins().find((entry) => entry.engineId === 'libreoffice')
      expect(installed).toMatchObject({
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
        failureReason: 'conversion_engine_missing',
        installSource: 'official_catalog',
        installRootKind: 'managed_root',
      })
      expect(repo.getByEngineId('libreoffice')).toBeNull()

      const diagnostics = service.getDiagnosticsSummary()
      const libreOffice = diagnostics.engines.find((entry) => entry.engineId === 'libreoffice')
      expect(libreOffice).toMatchObject({
        kind: 'plugin',
        installed: false,
        enabled: false,
        healthStatus: 'unhealthy',
        failureReason: 'conversion_engine_missing',
      })
      expect(diagnostics.counts.installed).toBe(0)
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('does not declare imported LibreOffice dev artifacts as production healthy', async () => {
    const fixture = await createFixture()
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'test',
      dfcLibreOfficeRuntimeSummary: () => dfcLibreOfficeSummary({
        source: 'imported_dev_artifact',
        message: 'LibreOffice imported dev artifact is available for owner-gated Office PDF conversion.',
      }),
    })
    try {
      const installed = service.getInstalledPlugins().find((entry) => entry.engineId === 'libreoffice')
      expect(installed).toMatchObject({
        installState: 'installed',
        healthStatus: 'degraded',
        failureReason: 'imported_dev_artifact_not_production_approved',
        installSource: 'local_package',
        installRootKind: 'test_root',
      })
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('sanitizes LibreOffice lifecycle diagnostics before exposing plugin inventory', async () => {
    const fixture = await createFixture()
    const privatePath = 'C:\\Users\\owner\\LibreOffice\\program\\soffice.exe'
    const { db, service } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'test',
      dfcLibreOfficeRuntimeSummary: () => dfcLibreOfficeSummary({
        status: 'unavailable',
        healthStatus: 'unhealthy',
        productCode: 'conversion_engine_unhealthy',
        internalCode: 'office_pdf_runtime_manifest_invalid',
        message: `Office PDF runtime manifest is invalid: ${privatePath}`,
        source: 'managed_manifest',
        runtime: null,
      }),
    })
    try {
      const text = JSON.stringify({
        installed: service.getInstalledPlugins(),
        diagnostics: service.getDiagnosticsSummary(),
      })
      expect(text).not.toContain('C:\\Users\\owner')
      expect(text).not.toContain('soffice.exe')
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

  it('lists embedded official Magika and LibreOffice catalog contracts when the production trusted root is configured', async () => {
    const fixture = await createFixture()
    const officialRoots = createOfficialTrustedRoots(MAGIKA_OFFICIAL_PUBLIC_KEY_PEM)
    const { db, service } = createService(fixture.tempRoot, officialRoots, { trustedRootSource: 'official' })
    try {
      const result = await service.listOfficialPlugins()
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value).toHaveLength(2)
      const magika = result.value.find((entry) => entry.pluginId === 'magika')
      const libreOffice = result.value.find((entry) => entry.pluginId === 'libreoffice')
      expect(magika).toMatchObject({
        pluginId: 'magika',
        displayName: 'Magika',
        pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
        installState: 'not_installed',
        enabled: false,
        installabilityStatus: 'official_remote_install_available',
        verificationMetadataStatus: 'production_signature_available',
        recommendedInstallRootKind: 'managed_root',
      })
      expect(libreOffice).toMatchObject({
        pluginId: 'libreoffice',
        displayName: 'LibreOffice Office PDF',
        publisher: 'Starverse',
        pluginVersion: '0.1.0',
        runtimeKind: 'managed',
        capabilities: ['document_conversion'],
        installState: 'not_installed',
        enabled: false,
        installabilityStatus: 'unavailable_read_only',
        verificationMetadataStatus: 'metadata_present_crypto_deferred',
        recommendedInstallRootKind: 'managed_root',
        releaseProvenance: null,
      })
      expect(libreOffice?.reasons).toEqual(expect.arrayContaining([
        'first_party_managed_runtime',
        'owner_gated_experimental',
        'production_approval_missing',
        'packaged_binary_not_included',
        'system_path_fallback_disabled',
      ]))
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('reflects imported LibreOffice runtime state in the embedded catalog contract', async () => {
    const fixture = await createFixture()
    const officialRoots = createOfficialTrustedRoots(MAGIKA_OFFICIAL_PUBLIC_KEY_PEM)
    const { db, service } = createService(fixture.tempRoot, officialRoots, {
      trustedRootSource: 'official',
      dfcLibreOfficeRuntimeSummary: () => dfcLibreOfficeSummary({
        source: 'imported_dev_artifact',
        message: 'LibreOffice imported dev artifact is available for owner-gated Office PDF conversion.',
      }),
    })
    try {
      const result = await service.listOfficialPlugins()
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const libreOffice = result.value.find((entry) => entry.pluginId === 'libreoffice')
      expect(libreOffice).toMatchObject({
        pluginId: 'libreoffice',
        installState: 'installed',
        enabled: true,
        installabilityStatus: 'unavailable_read_only',
        verificationMetadataStatus: 'metadata_present_crypto_deferred',
      })
      expect(libreOffice?.reasons).toEqual(expect.arrayContaining([
        'runtime_source_imported_dev_artifact',
        'runtime_lifecycle_experimental',
        'production_approval_missing',
      ]))
      expect(libreOffice?.warnings).toEqual(expect.arrayContaining([
        'libreoffice_catalog_contract_only',
        'not_production_supported_runtime',
      ]))
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('keeps uninstalled official Magika tombstone installable from embedded release metadata', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const trustedRoots = {
      ...fixture.trustedRoots,
      ...createOfficialTrustedRoots(MAGIKA_OFFICIAL_PUBLIC_KEY_PEM),
    }
    const { db, service } = createService(fixture.tempRoot, trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      const installed = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(installed.ok).toBe(true)
      if (!installed.ok) return
      await waitForInstallOperation(service, installed.value.operationId)

      const uninstalled = await service.uninstallPlugin({ engineId: 'magika' })
      expect(uninstalled.ok).toBe(true)

      const official = await service.listOfficialPlugins()
      expect(official.ok).toBe(true)
      if (!official.ok) return
      expect(official.value[0]).toMatchObject({
        pluginId: 'magika',
        installState: 'uninstalled',
        enabled: false,
        installabilityStatus: 'official_remote_install_available',
        verificationMetadataStatus: 'production_signature_available',
      })

      const reinstalled = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(reinstalled.ok).toBe(true)
      if (!reinstalled.ok) return
      const completed = await waitForInstallOperation(service, reinstalled.value.operationId)
      expect(completed.state).toBe('installed')
    } finally {
      db.close()
      await rmAsync(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('blocks official Magika reinstall when uninstall tombstone preserves revoked state', async () => {
    const fixture = await createOfficialRemoteInstallFixture()
    const { db, repo, service } = createService(fixture.tempRoot, fixture.trustedRoots, {
      trustedRootSource: 'official',
      magikaOfficialRelease: fixture.release,
      officialPackageBytes: fixture.bytes,
    })
    try {
      repo.upsert(registryRecord({
        engineId: 'magika',
        displayName: 'Magika',
        pluginVersion: '0.1.0',
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
        failureReason: 'revoked',
      }))

      const uninstalled = await service.uninstallPlugin({ engineId: 'magika' })
      expect(uninstalled.ok).toBe(true)
      if (uninstalled.ok) {
        expect(uninstalled.value.installState).toBe('uninstalled')
        expect(uninstalled.value.failureReason).toBe('revoked')
      }

      const reinstalled = await service.installOfficialPlugin({ pluginId: 'magika', pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION })
      expect(reinstalled.ok).toBe(false)
      if (!reinstalled.ok) {
        expect(reinstalled.reason).toBe('revoked')
      }
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

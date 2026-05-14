import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  loadOfficialPluginCatalogFromFile,
  verifyCatalogEntryHashes,
  verifyOfficialPluginCatalogSignature,
  type OfficialPluginCatalog,
  type OfficialPluginCatalogEntry,
} from '../../src/next/file-type/pluginCatalog'
import { type EngineHealthRunner, type TrustedCatalogPublicKeyMap } from '../../src/next/file-type'
import {
  discoverMagikaManagedPlugin,
  parseMagikaManagedPluginManifest,
  runManagedMagikaPluginHealthCheck,
  type MagikaManagedPluginDescriptor,
} from '../../src/next/file-type/magikaManagedPlugin'
import {
  buildMagikaOfficialCatalogReadModel,
} from '../../src/next/plugin-distribution/magikaOfficialRelease'
import type {
  ReadOnlyCatalogEntryDto,
} from '../../src/next/plugin-distribution/catalogReadModel'
import type { PluginPackageCapability } from '../../src/next/plugin-distribution/types'
import type { EnginePluginRegistryRepo } from '../db/repo/enginePluginRegistryRepo'
import type {
  EnginePluginInstallRootKind,
  EnginePluginRegistryRecord,
} from '../db/types'

type ReadBytes = (filePath: string) => Promise<Uint8Array>

const FAILURE_REASON_SET = new Set([
  'catalog_load_failed',
  'catalog_signature_invalid',
  'catalog_entry_not_found',
  'catalog_entry_invalid_path',
  'hash_verification_failed',
  'manifest_parse_failed',
  'manifest_integrity_failed',
  'manifest_engine_mismatch',
    'manifest_version_mismatch',
    'plugin_not_found',
    'plugin_uninstalled',
    'plugin_failed_reverify_required',
    'plugin_failed_health_check_failed',
    'health_check_unavailable',
    'health_check_failed',
    'not_installed',
    'official_trusted_root_unconfigured',
    'install_root_kind_mismatch',
    'local_package_unavailable',
    'local_package_manifest_hash_missing',
  ])

type LifecycleFailureReason = (typeof FAILURE_REASON_SET extends Set<infer T> ? T : never) & string

export type InstalledEnginePluginDto = Readonly<{
  engineId: string
  displayName: string
  pluginVersion: string
  manifestSchemaVersion: string
  runtimeKind: string
  modelVersion: string | null
  installState: EnginePluginRegistryRecord['installState']
  enabled: boolean
  healthStatus: EnginePluginRegistryRecord['healthStatus']
  failureReason: string | null
  installSource: EnginePluginRegistryRecord['installSource']
  installRootKind: EnginePluginRegistryRecord['installRootKind']
  installedAt: number | null
  updatedAt: number
  lastVerifiedAt: number | null
  lastHealthCheckAt: number | null
}>

export type OfficialPluginDto = Readonly<{
  pluginId: string
  displayName: string
  publisher: string
  pluginVersion: string
  runtimeKind: string
  capabilities: readonly PluginPackageCapability[]
  modelVersion: string | null
  catalogGeneratedAt: string | null
  installState: EnginePluginRegistryRecord['installState'] | 'not_installed'
  enabled: boolean
  recommendedInstallRootKind: 'managed_root' | 'test_root'
  catalogStatus: string
  verificationMetadataStatus: string
  installabilityStatus: string
  reasons: readonly string[]
  warnings: readonly string[]
}>

export type LifecycleActionResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reason: LifecycleFailureReason; message: string }>

export type EnginePluginLifecycleServiceDeps = Readonly<{
  registryRepo: Pick<
    EnginePluginRegistryRepo,
    | 'list'
    | 'getByEngineId'
    | 'upsert'
    | 'enable'
    | 'disable'
    | 'markFailed'
    | 'markUninstalled'
    | 'updateHealth'
  >
  trustedRoots: TrustedCatalogPublicKeyMap
  trustedRootSource?: 'official' | 'test' | null
  defaultCatalogPath?: string
  resolveInstallPluginDir: (input: Readonly<{
    installRootKind: EnginePluginInstallRootKind
    installRef: string
  }>) => string
  readBytes?: ReadBytes
  now?: () => number
  healthRunner?: EngineHealthRunner
}>

export type RegisterLocalOfficialPluginInput = Readonly<{
  catalogPath?: string
  pluginId: string
  pluginVersion: string
  installRootKind: EnginePluginInstallRootKind
  installRef: string
  enabled?: boolean
}>

export type ListOfficialPluginsInput = Readonly<{
  catalogPath?: string
}>

export type EnablePluginInput = Readonly<{ engineId: string }>
export type DisablePluginInput = Readonly<{ engineId: string }>
export type UninstallPluginInput = Readonly<{ engineId: string }>
export type RunHealthCheckInput = Readonly<{ engineId: string }>

export type RegisterLocalPackageInput = Readonly<{
  packageDir: string
  installRootKind: EnginePluginInstallRootKind
  installRef: string
  enabled?: boolean
}>

export type EngineDiagnosticsSummary = Readonly<{
  engines: readonly EngineDiagnosticsEntry[]
  counts: Readonly<{
    total: number
    installed: number
    enabled: number
    healthy: number
    failed: number
    unverified: number
  }>
}>

export type EngineDiagnosticsEntry = Readonly<{
  engineId: string
  displayName: string
  kind: 'builtin' | 'plugin'
  installed: boolean
  enabled: boolean
  healthStatus: string
  verificationStatus: string | null
  pluginVersion: string | null
  modelVersion: string | null
  failureReason: string | null
  installSource: string | null
}>

export class EnginePluginLifecycleService {
  private readonly readBytes: ReadBytes
  private readonly now: () => number

  constructor(private readonly deps: EnginePluginLifecycleServiceDeps) {
    this.readBytes = deps.readBytes ?? defaultReadBytes
    this.now = deps.now ?? Date.now
  }

  async listOfficialPlugins(input: ListOfficialPluginsInput = {}): Promise<LifecycleActionResult<OfficialPluginDto[]>> {
    if (!input.catalogPath && !this.deps.defaultCatalogPath) {
      return this.listEmbeddedOfficialPlugins()
    }

    const catalogResult = await this.loadAndVerifyCatalog(input.catalogPath)
    if (!catalogResult.ok) return catalogResult

    const installed = this.deps.registryRepo.list()
    const installedById = new Map(installed.map((item) => [item.engineId, item]))
    const recommendedInstallRootKind = this.getRecommendedInstallRootKind()
    const rows = catalogResult.value.plugins.map((entry) => {
      const installedRecord = installedById.get(entry.pluginId)
      return {
        pluginId: entry.pluginId,
        displayName: entry.pluginId,
        publisher: 'Starverse',
        pluginVersion: entry.pluginVersion,
        runtimeKind: 'managed',
        capabilities: [],
        modelVersion: null,
        catalogGeneratedAt: catalogResult.value.generatedAt,
        installState: installedRecord?.installState ?? 'not_installed',
        enabled: installedRecord?.enabled ?? false,
        recommendedInstallRootKind,
        catalogStatus: 'valid_metadata_only',
        verificationMetadataStatus: 'metadata_present_crypto_deferred',
        installabilityStatus: installedRecord ? 'unavailable_read_only' : 'metadata_compatible_future_install',
        reasons: ['read_only_catalog_no_install_action'],
        warnings: [],
      } as OfficialPluginDto
    })

    return ok(rows)
  }

  getInstalledPlugins(): InstalledEnginePluginDto[] {
    return this.deps.registryRepo.list().map(toInstalledDto)
  }

  private listEmbeddedOfficialPlugins(): LifecycleActionResult<OfficialPluginDto[]> {
    const catalogResult = buildMagikaOfficialCatalogReadModel({
      trustedRoots: this.deps.trustedRoots,
      trustedRootSource: this.deps.trustedRootSource,
      now: new Date(this.now()),
      environment: {
        platform: process.platform,
        architecture: process.arch,
        appVersion: '0.0.0',
      },
    })
    if (!catalogResult.ok) {
      if (catalogResult.reason === 'official_trusted_root_unconfigured') {
        return fail('official_trusted_root_unconfigured', 'official plugin trusted roots are not configured')
      }
      return fail('catalog_signature_invalid', 'official plugin release metadata verification failed')
    }

    const installed = this.deps.registryRepo.list()
    const installedById = new Map(installed.map((item) => [item.engineId, item]))
    const recommendedInstallRootKind = this.getRecommendedInstallRootKind()
    return ok(catalogResult.catalog.entries.map((entry) =>
      this.toOfficialPluginDto(
        entry,
        installedById.get(entry.pluginId),
        recommendedInstallRootKind,
        catalogResult.catalog.generatedAt
      )
    ))
  }

  private toOfficialPluginDto(
    entry: ReadOnlyCatalogEntryDto,
    installedRecord: EnginePluginRegistryRecord | undefined,
    recommendedInstallRootKind: 'managed_root' | 'test_root',
    catalogGeneratedAt: string | null
  ): OfficialPluginDto {
    return {
      pluginId: entry.pluginId,
      displayName: entry.displayName,
      publisher: entry.publisher,
      pluginVersion: entry.pluginVersion,
      runtimeKind: entry.runtimeKind,
      capabilities: entry.capabilities,
      modelVersion: entry.modelVersion,
      catalogGeneratedAt,
      installState: installedRecord?.installState ?? 'not_installed',
      enabled: installedRecord?.enabled ?? false,
      recommendedInstallRootKind,
      catalogStatus: entry.catalogStatus,
      verificationMetadataStatus: entry.verificationMetadataStatus,
      installabilityStatus: installedRecord ? 'unavailable_read_only' : entry.installabilityStatus,
      reasons: entry.reasons,
      warnings: entry.warnings,
    }
  }

  // eslint-disable-next-line max-lines-per-function
  async registerLocalOfficialPlugin(
    input: RegisterLocalOfficialPluginInput
  ): Promise<LifecycleActionResult<InstalledEnginePluginDto>> {
    const catalogResult = await this.loadAndVerifyCatalog(input.catalogPath)
    if (!catalogResult.ok) return catalogResult

    const entry = catalogResult.value.plugins.find(
      (item) => item.pluginId === input.pluginId && item.pluginVersion === input.pluginVersion
    )
    if (!entry) {
      return fail('catalog_entry_not_found', 'official plugin entry is not found in catalog')
    }

    if (!this.isValidInstallRootKind(input.installRootKind)) {
      return fail('install_root_kind_mismatch', 'installRootKind is not allowed for the current trusted root source')
    }

    const pluginDir = this.deps.resolveInstallPluginDir({
      installRootKind: input.installRootKind,
      installRef: input.installRef,
    })
    const resolvedPaths = resolveCatalogEntryPaths(pluginDir, entry)
    if (!resolvedPaths.ok) {
      return fail('catalog_entry_invalid_path', resolvedPaths.message)
    }

    const [manifestBytes, packageBytes] = await Promise.all([
      this.readBytes(resolvedPaths.manifestPath),
      this.readBytes(resolvedPaths.packagePath),
    ]).catch(() => [null, null] as const)
    if (!manifestBytes || !packageBytes) {
      return fail('hash_verification_failed', 'cannot read local plugin artifacts for hash verification')
    }

    const hashResult = verifyCatalogEntryHashes({
      entry: {
        manifestSha256: entry.manifestSha256,
        packageSha256: entry.packageSha256,
      },
      manifestBytes,
      packageBytes,
    })
    if (!hashResult.ok) {
      return fail('hash_verification_failed', 'catalog hash verification failed for local plugin artifacts')
    }

    let manifest: ReturnType<typeof parseMagikaManagedPluginManifest>
    try {
      manifest = parseMagikaManagedPluginManifest(JSON.parse(Buffer.from(manifestBytes).toString('utf8')))
    } catch {
      return fail('manifest_parse_failed', 'managed plugin manifest parse failed')
    }

    if (manifest.engineId !== entry.pluginId) {
      return fail('manifest_engine_mismatch', 'manifest engineId does not match official catalog entry')
    }
    if (manifest.pluginVersion !== entry.pluginVersion) {
      return fail('manifest_version_mismatch', 'manifest pluginVersion does not match official catalog entry')
    }

    const discovered = await discoverMagikaManagedPlugin({ pluginDirs: [pluginDir] })
    if (!discovered.available) {
      return fail('manifest_integrity_failed', 'managed plugin integrity verification failed')
    }

    const timestamp = this.now()
    const upserted = this.deps.registryRepo.upsert({
      engineId: manifest.engineId,
      displayName: manifest.displayName,
      pluginVersion: manifest.pluginVersion,
      manifestSchemaVersion: manifest.manifestSchemaVersion,
      manifestHash: entry.manifestSha256,
      runtimeKind: manifest.runtimeKind,
      modelVersion: manifest.modelVersion,
      installState: 'installed',
      enabled: input.enabled !== false,
      healthStatus: 'unknown',
      failureReason: null,
      installSource: 'official_catalog',
      installRootKind: input.installRootKind,
      installRef: input.installRef,
      installedAt: timestamp,
      updatedAt: timestamp,
      lastVerifiedAt: timestamp,
      lastHealthCheckAt: null,
      metadataJson: {
        officialCatalog: {
          pluginId: entry.pluginId,
          pluginVersion: entry.pluginVersion,
        },
      },
    })

    return ok(toInstalledDto(upserted))
  }

  async enablePlugin(input: EnablePluginInput): Promise<LifecycleActionResult<InstalledEnginePluginDto>> {
    const engineId = requireNonEmpty(input.engineId, 'engineId')
    const record = this.deps.registryRepo.getByEngineId(engineId)
    if (!record) return fail('not_installed', 'plugin record is not found')

    if (record.installState === 'uninstalled') {
      return fail('plugin_uninstalled', 'plugin is uninstalled and must be registered again before enabling')
    }

    if (record.installState === 'failed') {
      const healthResult = await this.runHealthCheck({ engineId })
      if (!healthResult.ok) {
        return fail('plugin_failed_health_check_failed', 'failed plugin cannot be enabled before health check succeeds')
      }
    }

    this.deps.registryRepo.enable(engineId, this.now())
    const enabled = this.deps.registryRepo.getByEngineId(engineId)
    if (!enabled) return fail('not_installed', 'plugin record is not found after enable')
    return ok(toInstalledDto(enabled))
  }

  disablePlugin(input: DisablePluginInput): LifecycleActionResult<InstalledEnginePluginDto> {
    const engineId = requireNonEmpty(input.engineId, 'engineId')
    const record = this.deps.registryRepo.getByEngineId(engineId)
    if (!record) return fail('not_installed', 'plugin record is not found')

    this.deps.registryRepo.disable(engineId, this.now())
    const disabled = this.deps.registryRepo.getByEngineId(engineId)
    if (!disabled) return fail('not_installed', 'plugin record is not found after disable')
    return ok(toInstalledDto(disabled))
  }

  uninstallPlugin(input: UninstallPluginInput): LifecycleActionResult<InstalledEnginePluginDto> {
    const engineId = requireNonEmpty(input.engineId, 'engineId')
    const record = this.deps.registryRepo.getByEngineId(engineId)
    if (!record) return fail('not_installed', 'plugin record is not found')

    this.deps.registryRepo.markUninstalled({ engineId, updatedAt: this.now() })
    const uninstalled = this.deps.registryRepo.getByEngineId(engineId)
    if (!uninstalled) return fail('not_installed', 'plugin record is not found after uninstall')
    return ok(toInstalledDto(uninstalled))
  }

  async registerLocalPackage(
    input: RegisterLocalPackageInput
  ): Promise<LifecycleActionResult<InstalledEnginePluginDto>> {
    const packageDir = requireNonEmpty(input.packageDir, 'packageDir')
    const installRef = requireNonEmpty(input.installRef, 'installRef')

    if (!this.isValidInstallRootKind(input.installRootKind)) {
      return fail('install_root_kind_mismatch', 'installRootKind is not allowed for the current trusted root source')
    }

    const resolvedPluginDir = this.deps.resolveInstallPluginDir({
      installRootKind: input.installRootKind,
      installRef,
    })

    const discovered = await discoverMagikaManagedPlugin({ pluginDirs: [packageDir, resolvedPluginDir] })
    if (!discovered.available) {
      return fail('local_package_unavailable', discovered.detail ?? 'local Magika package discovery failed')
    }

    const descriptor = discovered.descriptor
    const manifestBytes = await this.readBytes(descriptor.manifestPath).catch(() => null)
    if (!manifestBytes) {
      return fail('local_package_manifest_hash_missing', 'cannot read local package manifest for hash calculation')
    }
    const manifestHash = buildSha256Hex(manifestBytes)

    const timestamp = this.now()
    const upserted = this.deps.registryRepo.upsert({
      engineId: descriptor.manifest.engineId,
      displayName: descriptor.manifest.displayName,
      pluginVersion: descriptor.manifest.pluginVersion,
      manifestSchemaVersion: descriptor.manifest.manifestSchemaVersion,
      manifestHash,
      runtimeKind: descriptor.manifest.runtimeKind,
      modelVersion: descriptor.manifest.modelVersion,
      installState: 'installed',
      enabled: input.enabled !== false,
      healthStatus: 'unknown',
      failureReason: null,
      installSource: 'local_package',
      installRootKind: input.installRootKind,
      installRef,
      installedAt: timestamp,
      updatedAt: timestamp,
      lastVerifiedAt: timestamp,
      lastHealthCheckAt: null,
      metadataJson: {
        localPackage: {
          packageDir: sanitizeMessage(packageDir),
          pluginVersion: descriptor.manifest.pluginVersion,
          runtimeKind: descriptor.manifest.runtimeKind,
        },
      },
    })

    return ok(toInstalledDto(upserted))
  }

  getDiagnosticsSummary(): EngineDiagnosticsSummary {
    const records = this.deps.registryRepo.list({ includeUninstalled: true })
    const entries: EngineDiagnosticsEntry[] = []

    const builtinIds = new Set(['tika', 'libreoffice', 'ffprobe', 'pandoc'])
    for (const builtinId of builtinIds) {
      const installed = records.find((r) => r.engineId === builtinId && r.installState !== 'uninstalled')
      entries.push({
        engineId: builtinId,
        displayName: installed?.displayName ?? `${builtinId} (builtin)`,
        kind: 'builtin',
        installed: !!installed,
        enabled: installed?.enabled ?? false,
        healthStatus: installed?.healthStatus ?? 'unknown',
        verificationStatus: null,
        pluginVersion: installed?.pluginVersion ?? null,
        modelVersion: installed?.modelVersion ?? null,
        failureReason: sanitizeStoredFailureReason(installed?.failureReason),
        installSource: installed?.installSource ?? null,
      })
    }

    for (const record of records) {
      if (builtinIds.has(record.engineId)) continue
      entries.push({
        engineId: record.engineId,
        displayName: record.displayName,
        kind: 'plugin',
        installed: record.installState !== 'uninstalled',
        enabled: record.enabled,
        healthStatus: record.healthStatus,
        verificationStatus: record.installState === 'installed' ? 'unverified' : null,
        pluginVersion: record.pluginVersion,
        modelVersion: record.modelVersion,
        failureReason: sanitizeStoredFailureReason(record.failureReason),
        installSource: record.installSource,
      })
    }

    const installedEntries = entries.filter((e) => e.kind === 'plugin' && e.installed)
    const installedCount = installedEntries.length
    const enabledCount = installedEntries.filter((e) => e.enabled).length
    const healthyCount = installedEntries.filter((e) => e.healthStatus === 'healthy').length
    const failedCount = installedEntries.filter((e) => e.healthStatus === 'unhealthy' || e.healthStatus === 'degraded').length
    const unverifiedCount = entries.filter((e) => e.kind === 'plugin' && e.verificationStatus === 'unverified').length

    return {
      engines: entries,
      counts: {
        total: entries.length,
        installed: installedCount,
        enabled: enabledCount,
        healthy: healthyCount,
        failed: failedCount,
        unverified: unverifiedCount,
      },
    }
  }

  async runHealthCheck(input: RunHealthCheckInput): Promise<LifecycleActionResult<InstalledEnginePluginDto>> {
    const engineId = requireNonEmpty(input.engineId, 'engineId')
    const record = this.deps.registryRepo.getByEngineId(engineId)
    if (!record) return fail('not_installed', 'plugin record is not found')
    if (record.installState === 'uninstalled') {
      return fail('plugin_uninstalled', 'plugin is uninstalled and cannot run health check')
    }

    const pluginDir = this.deps.resolveInstallPluginDir({
      installRootKind: record.installRootKind,
      installRef: record.installRef,
    })
    const discovered = await discoverMagikaManagedPlugin({ pluginDirs: [pluginDir] })
    if (!discovered.available) {
      this.deps.registryRepo.markFailed({
        engineId,
        failureReason: safeFailureReason(discovered.reason),
        updatedAt: this.now(),
        lastHealthCheckAt: this.now(),
      })
      const failed = this.deps.registryRepo.getByEngineId(engineId)
      if (!failed) return fail('not_installed', 'plugin record is not found after health failure')
      return fail('health_check_unavailable', toInstalledDto(failed))
    }

    const health = await runManagedMagikaPluginHealthCheck({
      descriptor: discovered.descriptor,
      healthRunner: this.deps.healthRunner,
    })
    if (!health.healthy) {
      this.deps.registryRepo.markFailed({
        engineId,
        failureReason: safeFailureReason(health.reason ?? 'engine_failed'),
        updatedAt: this.now(),
        lastHealthCheckAt: this.now(),
      })
      const failed = this.deps.registryRepo.getByEngineId(engineId)
      if (!failed) return fail('not_installed', 'plugin record is not found after health failure')
      return fail('health_check_failed', toInstalledDto(failed))
    }

    this.deps.registryRepo.updateHealth({
      engineId,
      healthStatus: 'healthy',
      updatedAt: this.now(),
      lastHealthCheckAt: this.now(),
    })
    const healthy = this.deps.registryRepo.getByEngineId(engineId)
    if (!healthy) return fail('not_installed', 'plugin record is not found after health check')
    return ok(toInstalledDto(healthy))
  }

  private getRecommendedInstallRootKind(): 'managed_root' | 'test_root' {
    if (this.deps.trustedRootSource === 'official') return 'managed_root'
    return 'test_root'
  }

  private isValidInstallRootKind(kind: string): boolean {
    if (kind !== 'managed_root' && kind !== 'test_root' && kind !== 'managed_cache') return false
    if (this.deps.trustedRootSource === 'official' && kind === 'test_root') return false
    return true
  }

  private async loadAndVerifyCatalog(
    catalogPathInput?: string
  ): Promise<LifecycleActionResult<OfficialPluginCatalog>> {
    if (Object.keys(this.deps.trustedRoots).length === 0) {
      return fail(
        'official_trusted_root_unconfigured',
        'official plugin trusted roots are not configured'
      )
    }
    const catalogPath = requireNonEmpty(catalogPathInput ?? this.deps.defaultCatalogPath, 'catalogPath')
    let catalog: OfficialPluginCatalog
    try {
      catalog = await loadOfficialPluginCatalogFromFile({ catalogPath })
    } catch {
      return fail('catalog_load_failed', 'failed to load official catalog from local file')
    }

    const verified = verifyOfficialPluginCatalogSignature({
      catalog,
      trustedRoots: this.deps.trustedRoots,
    })
    if (!verified.ok) {
      return fail('catalog_signature_invalid', `catalog signature verification failed: ${verified.reason}`)
    }
    return ok(catalog)
  }
}

function ok<T>(value: T): LifecycleActionResult<T> {
  return { ok: true, value }
}

function fail(reason: LifecycleFailureReason, message: string): LifecycleActionResult<never>
function fail(reason: LifecycleFailureReason, message: InstalledEnginePluginDto): LifecycleActionResult<never>
function fail(reason: LifecycleFailureReason, message: string | InstalledEnginePluginDto): LifecycleActionResult<never> {
  const details = typeof message === 'string' ? message : `state=${message.installState}`
  return {
    ok: false,
    reason,
    message: sanitizeMessage(details),
  }
}

function toInstalledDto(record: EnginePluginRegistryRecord): InstalledEnginePluginDto {
  return {
    engineId: record.engineId,
    displayName: record.displayName,
    pluginVersion: record.pluginVersion,
    manifestSchemaVersion: record.manifestSchemaVersion,
    runtimeKind: record.runtimeKind,
    modelVersion: record.modelVersion,
    installState: record.installState,
    enabled: record.enabled,
    healthStatus: record.healthStatus,
    failureReason: sanitizeStoredFailureReason(record.failureReason),
    installSource: record.installSource,
    installRootKind: record.installRootKind,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
    lastVerifiedAt: record.lastVerifiedAt,
    lastHealthCheckAt: record.lastHealthCheckAt,
  }
}

function resolveCatalogEntryPaths(
  pluginDir: string,
  entry: OfficialPluginCatalogEntry
): Readonly<
  | { ok: true; manifestPath: string; packagePath: string }
  | { ok: false; message: string }
> {
  const manifestRelative = normalizeCatalogRelativePath(entry.manifestPath)
  const packageRelative = normalizeCatalogRelativePath(entry.packagePath)
  if (!manifestRelative || !packageRelative) {
    return { ok: false, message: 'catalog entry manifest/package path is invalid' }
  }

  const manifestPath = path.resolve(pluginDir, manifestRelative)
  const packagePath = path.resolve(pluginDir, packageRelative)
  const manifestBacktrack = path.relative(pluginDir, manifestPath)
  const packageBacktrack = path.relative(pluginDir, packagePath)
  if (
    manifestBacktrack.startsWith('..') ||
    packageBacktrack.startsWith('..') ||
    path.isAbsolute(manifestBacktrack) ||
    path.isAbsolute(packageBacktrack)
  ) {
    return { ok: false, message: 'catalog entry path escapes plugin root' }
  }

  return { ok: true, manifestPath, packagePath }
}

function normalizeCatalogRelativePath(input: string | null): string | null {
  if (!input) return null
  const normalized = input.trim()
  if (!normalized) return null
  if (normalized.includes('\u0000')) return null
  if (normalized.includes('..')) return null
  if (normalized.includes('\\')) return null
  if (/^[a-zA-Z]:[\\/]/u.test(normalized)) return null
  if (/^\\\\/u.test(normalized)) return null
  if (normalized.startsWith('/')) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(normalized)) return null
  return normalized.replace(/^\.\/+/u, '')
}

function requireNonEmpty(input: string | undefined, field: string): string {
  const normalized = String(input ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/[A-Za-z]:\\[^\s"'`]+/gu, '[redacted-path]')
    .replace(/(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`]+/gu, '[redacted-path]')
    .replace(/\b[a-f0-9]{64}\b/giu, '[redacted-hash]')
}

function safeFailureReason(input: string | null | undefined): string {
  const normalized = String(input ?? '').trim().toLowerCase()
  if (!normalized) return 'health_check_failed'
  if (FAILURE_REASON_SET.has(normalized)) return normalized
  if (/^[a-z0-9_]+$/u.test(normalized)) return normalized
  return 'health_check_failed'
}

function sanitizeStoredFailureReason(input: string | null | undefined): string | null {
  const normalized = String(input ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (FAILURE_REASON_SET.has(normalized)) return normalized
  if (/^[a-z0-9_]+$/u.test(normalized)) return normalized
  return 'health_check_failed'
}

function buildSha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

async function defaultReadBytes(filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(filePath))
}

import path from 'node:path'
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
} from '../../src/next/file-type/magikaManagedPlugin'
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
  pluginVersion: string
  catalogGeneratedAt: string | null
  installState: EnginePluginRegistryRecord['installState'] | 'not_installed'
  enabled: boolean
  recommendedInstallRootKind: 'managed_root' | 'test_root'
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

export class EnginePluginLifecycleService {
  private readonly readBytes: ReadBytes
  private readonly now: () => number

  constructor(private readonly deps: EnginePluginLifecycleServiceDeps) {
    this.readBytes = deps.readBytes ?? defaultReadBytes
    this.now = deps.now ?? Date.now
  }

  async listOfficialPlugins(input: ListOfficialPluginsInput = {}): Promise<LifecycleActionResult<OfficialPluginDto[]>> {
    const catalogResult = await this.loadAndVerifyCatalog(input.catalogPath)
    if (!catalogResult.ok) return catalogResult

    const installed = this.deps.registryRepo.list()
    const installedById = new Map(installed.map((item) => [item.engineId, item]))
    const recommendedInstallRootKind = this.getRecommendedInstallRootKind()
    const rows = catalogResult.value.plugins.map((entry) => {
      const installedRecord = installedById.get(entry.pluginId)
      return {
        pluginId: entry.pluginId,
        pluginVersion: entry.pluginVersion,
        catalogGeneratedAt: catalogResult.value.generatedAt,
        installState: installedRecord?.installState ?? 'not_installed',
        enabled: installedRecord?.enabled ?? false,
        recommendedInstallRootKind,
      } as OfficialPluginDto
    })

    return ok(rows)
  }

  getInstalledPlugins(): InstalledEnginePluginDto[] {
    return this.deps.registryRepo.list().map(toInstalledDto)
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

async function defaultReadBytes(filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(filePath))
}

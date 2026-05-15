import path from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
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
  type MagikaManagedPluginDescriptor,
  parseMagikaManagedPluginManifest,
  runManagedMagikaPluginHealthCheck,
} from '../../src/next/file-type/magikaManagedPlugin'
import {
  buildMagikaOfficialCatalogReadModel,
  MAGIKA_OFFICIAL_PLUGIN_ID,
  MAGIKA_OFFICIAL_PLUGIN_VERSION,
  MAGIKA_OFFICIAL_RELEASE_METADATA,
} from '../../src/next/plugin-distribution/magikaOfficialRelease'
import {
  verifyOfficialPackageReleaseDownload,
  type OfficialPackageReleaseMetadata,
  type OfficialPackageReleaseVerificationResult,
} from '../../src/next/plugin-distribution/officialPackageRelease'
import type { PackageDownloadTransport } from '../../src/next/plugin-distribution/packageDownloader'
import { sanitizePluginDistributionText } from '../../src/next/plugin-distribution/sanitization'
import {
  isOfficialInstallOperationActive,
  isOfficialInstallOperationTerminal,
  labelOfficialInstallOperationPhase,
  validateOfficialInstallOperationTransition,
  type PdpOfficialInstallOperationState,
} from '../../src/next/plugin-distribution/installOperationState'
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
type VerifiedOfficialPackageRelease = Extract<OfficialPackageReleaseVerificationResult, { ok: true }>

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
  'already_registered',
  'official_trusted_root_unconfigured',
  'install_root_kind_mismatch',
  'local_package_unavailable',
  'local_package_manifest_hash_missing',
  'official_release_metadata_invalid',
  'official_remote_install_failed',
  'official_package_extract_failed',
  'revoked',
  'incompatible_platform',
  'incompatible_arch',
  'incompatible_app_version',
  'signature_invalid',
  'hash_mismatch',
  'integrity_missing',
  'expired_metadata',
  'rollback_detected',
  'download_failed',
  'network_unavailable',
  'official_package_unreachable',
  'size_mismatch',
  'verification_failed',
  'signature_missing',
  'registration_failed',
  'health_failed',
  'operation_already_in_progress',
  'operation_stale',
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

export type OfficialInstallOperationState = PdpOfficialInstallOperationState

export type OfficialInstallOperationDto = Readonly<{
  operationId: string
  pluginId: string
  pluginVersion: string
  operationType: 'official_install'
  source: 'official_builtin'
  state: OfficialInstallOperationState
  phase: OfficialInstallOperationState
  phaseLabel: string
  progressSummary: string
  stateHistory: readonly OfficialInstallOperationState[]
  startedAt: number
  updatedAt: number
  terminalAt: number | null
  failureReason: string | null
  diagnosticCode: string | null
  sanitizedDiagnostics: readonly string[]
  installedEngineId: string | null
  result: Readonly<{
    engineId: string
    pluginVersion: string
    installState: EnginePluginRegistryRecord['installState']
    healthStatus: EnginePluginRegistryRecord['healthStatus']
  }> | null
}>

type OfficialInstallOperationRecord = {
  operationId: string
  pluginId: string
  pluginVersion: string
  operationType: 'official_install'
  source: 'official_builtin'
  state: OfficialInstallOperationState
  stateHistory: OfficialInstallOperationState[]
  startedAt: number
  updatedAt: number
  terminalAt: number | null
  failureReason: string | null
  diagnosticCode: string | null
  sanitizedDiagnostics: string[]
  installedEngineId: string | null
  result: {
    engineId: string
    pluginVersion: string
    installState: EnginePluginRegistryRecord['installState']
    healthStatus: EnginePluginRegistryRecord['healthStatus']
  } | null
}

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
  officialPackageTransport?: PackageDownloadTransport
  magikaOfficialRelease?: OfficialPackageReleaseMetadata
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

export type InstallOfficialPluginInput = Readonly<{
  pluginId: string
  pluginVersion?: string
  enabled?: boolean
}>

export type GetInstallOperationStatusInput = Readonly<{
  operationId?: string
  pluginId?: string
  pluginVersion?: string
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
  private readonly installOperations = new Map<string, OfficialInstallOperationRecord>()
  private readonly inFlightOfficialInstalls = new Map<string, string>()
  private installOperationCounter = 0

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
      const activeInstalledRecord = isActiveInstalledRecord(installedRecord)
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
        installabilityStatus: activeInstalledRecord ? 'unavailable_read_only' : 'metadata_compatible_future_install',
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
      installabilityStatus: isActiveInstalledRecord(installedRecord) ? 'unavailable_read_only' : entry.installabilityStatus,
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

    const existing = this.deps.registryRepo.getByEngineId(manifest.engineId)
    if (existing && existing.installState !== 'uninstalled') {
      return fail('already_registered', 'official plugin is already registered')
    }
    const blockedExisting = existing?.installState === 'uninstalled' && existing.failureReason
      ? blockedPluginReinstallFailure(existing.failureReason)
      : null
    if (blockedExisting) {
      return fail(blockedExisting, 'official plugin registration is blocked by prior trust or compatibility state')
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

  async installOfficialPlugin(
    input: InstallOfficialPluginInput
  ): Promise<LifecycleActionResult<OfficialInstallOperationDto>> {
    const pluginId = requireNonEmpty(input.pluginId, 'pluginId')
    const pluginVersion = String(input.pluginVersion ?? MAGIKA_OFFICIAL_PLUGIN_VERSION).trim()
    if (pluginId !== MAGIKA_OFFICIAL_PLUGIN_ID || pluginVersion !== MAGIKA_OFFICIAL_PLUGIN_VERSION) {
      return fail('catalog_entry_not_found', 'official plugin entry is not found in bundled release metadata')
    }

    const release = this.deps.magikaOfficialRelease ?? MAGIKA_OFFICIAL_RELEASE_METADATA
    const releaseReady = this.verifyOfficialMagikaReleaseMetadata(release)
    if (!releaseReady.ok) return releaseReady

    const operationKey = officialInstallOperationKey(pluginId, pluginVersion)
    const existingOperation = this.getActiveOfficialInstallOperation(operationKey)
    if (existingOperation) {
      return ok(toOfficialInstallOperationDto(existingOperation)!)
    }

    const existing = this.deps.registryRepo.getByEngineId(pluginId)
    const blockedExisting = existing?.failureReason ? blockedPluginReinstallFailure(existing.failureReason) : null
    if (blockedExisting) {
      return fail(blockedExisting, 'official plugin reinstall is blocked by prior trust or compatibility state')
    }
    if (existing && existing.installState !== 'uninstalled' && existing.installState !== 'failed') {
      return fail('already_registered', 'official plugin is already registered')
    }

    const installRootKind = this.getRecommendedInstallRootKind()
    if (installRootKind !== 'managed_root') {
      return fail('install_root_kind_mismatch', 'official remote install requires the managed root')
    }

    const operation = this.createOfficialInstallOperation(pluginId, pluginVersion)
    this.inFlightOfficialInstalls.set(operationKey, operation.operationId)
    void this.runOfficialInstallOperation({
      operationId: operation.operationId,
      pluginId,
      pluginVersion,
      release,
      existing,
      installRootKind,
    })

    return ok(toOfficialInstallOperationDto(operation)!)
  }

  getInstallOperationStatus(
    input: GetInstallOperationStatusInput = {}
  ): LifecycleActionResult<OfficialInstallOperationDto | null> {
    const operationId = String(input.operationId ?? '').trim()
    if (operationId) {
      const operation = this.installOperations.get(operationId) ?? null
      return ok(toOfficialInstallOperationDto(this.reconcileOfficialInstallOperation(operation)))
    }

    const pluginId = String(input.pluginId ?? MAGIKA_OFFICIAL_PLUGIN_ID).trim() || MAGIKA_OFFICIAL_PLUGIN_ID
    const pluginVersion = String(input.pluginVersion ?? MAGIKA_OFFICIAL_PLUGIN_VERSION).trim() ||
      MAGIKA_OFFICIAL_PLUGIN_VERSION
    const operationKey = officialInstallOperationKey(pluginId, pluginVersion)
    const inFlightOperation = this.getActiveOfficialInstallOperation(operationKey)
    if (inFlightOperation) return ok(toOfficialInstallOperationDto(inFlightOperation))

    const latest = Array.from(this.installOperations.values())
      .filter((operation) => operation.pluginId === pluginId && operation.pluginVersion === pluginVersion)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    return ok(toOfficialInstallOperationDto(this.reconcileOfficialInstallOperation(latest)))
  }

  private createOfficialInstallOperation(
    pluginId: string,
    pluginVersion: string
  ): OfficialInstallOperationRecord {
    const timestamp = this.now()
    const operation: OfficialInstallOperationRecord = {
      operationId: `official-install-${pluginId}-${pluginVersion}-${timestamp}-${++this.installOperationCounter}`,
      pluginId,
      pluginVersion,
      operationType: 'official_install',
      source: 'official_builtin',
      state: 'accepted',
      stateHistory: ['accepted'],
      startedAt: timestamp,
      updatedAt: timestamp,
      terminalAt: null,
      failureReason: null,
      diagnosticCode: null,
      sanitizedDiagnostics: [],
      installedEngineId: null,
      result: null,
    }
    this.installOperations.set(operation.operationId, operation)
    return operation
  }

  private async runOfficialInstallOperation(input: Readonly<{
    operationId: string
    pluginId: string
    pluginVersion: string
    release: OfficialPackageReleaseMetadata
    existing: EnginePluginRegistryRecord | null
    installRootKind: EnginePluginInstallRootKind
  }>): Promise<void> {
    const operation = this.installOperations.get(input.operationId)
    if (!operation) return

    const installRef = MAGIKA_OFFICIAL_PLUGIN_ID
    const finalDir = this.deps.resolveInstallPluginDir({ installRootKind: input.installRootKind, installRef })
    const stageDir = `${finalDir}.stage-${this.now()}`
    try {
      this.transitionOfficialInstallOperation(operation, 'pending')
      this.transitionOfficialInstallOperation(operation, 'downloading')
      const verified = await verifyOfficialPackageReleaseDownload({
        release: input.release,
        transport: this.deps.officialPackageTransport ?? defaultOfficialPackageTransport,
        now: new Date(this.now()),
        previousTrustedVersion: input.existing?.lastVerifiedAt ? input.existing.pluginVersion : null,
        environment: {
          platform: process.platform,
          architecture: process.arch,
          appVersion: '0.0.0',
        },
      })
      if (!verified.ok) {
        if (verified.status === 'signature_failed') {
          this.transitionOfficialInstallOperation(operation, 'verifying')
        }
        const failure = mapOfficialReleaseFailure(verified)
        this.failOfficialInstallOperation(operation, failure.reason, failure.diagnostic, failure.state)
        return
      }

      this.transitionOfficialInstallOperation(operation, 'verifying')
      this.transitionOfficialInstallOperation(operation, 'staging')
      const extracted = await this.extractAndValidateOfficialMagika({
        verified,
        release: input.release,
        stageDir,
        finalDir,
        pluginId: input.pluginId,
        pluginVersion: input.pluginVersion,
      })
      if (!extracted.ok) {
        this.failOfficialInstallOperation(operation, 'registration_failed', extracted.reason)
        return
      }

      this.transitionOfficialInstallOperation(operation, 'registering')
      const upserted = this.upsertOfficialMagikaInstall({
        descriptor: extracted.value.descriptor,
        manifestBytes: extracted.value.manifestBytes,
        existing: input.existing,
        installRootKind: input.installRootKind,
        installRef,
        verified,
      })

      operation.installedEngineId = upserted.engineId
      operation.result = toOfficialInstallOperationResult(upserted)
      this.transitionOfficialInstallOperation(operation, 'health_checking')
      await this.recordOfficialInstallHealthResult(operation, extracted.value.descriptor)
    } catch (err: any) {
      this.failOfficialInstallOperation(operation, 'registration_failed', err?.message ?? 'official install failed')
    } finally {
      await rm(stageDir, { recursive: true, force: true }).catch(() => undefined)
      if (operation.failureReason && !operation.installedEngineId) {
        await rm(finalDir, { recursive: true, force: true }).catch(() => undefined)
      }
      const operationKey = officialInstallOperationKey(input.pluginId, input.pluginVersion)
      if (this.inFlightOfficialInstalls.get(operationKey) === input.operationId) {
        this.inFlightOfficialInstalls.delete(operationKey)
      }
      if (operation.installedEngineId && operation.state !== 'failed') {
        this.transitionOfficialInstallOperation(operation, 'installed')
      } else if (operation.failureReason && operation.state !== 'failed') {
        this.transitionOfficialInstallOperation(operation, 'failed')
      }
    }
  }

  private transitionOfficialInstallOperation(
    operation: OfficialInstallOperationRecord,
    state: OfficialInstallOperationState
  ): void {
    const transition = validateOfficialInstallOperationTransition(operation.state, state)
    if (!transition.ok) {
      operation.diagnosticCode = sanitizeOperationCode(transition.reason)
      operation.sanitizedDiagnostics = appendSanitizedDiagnostic(operation.sanitizedDiagnostics, transition.reason)
      return
    }
    operation.state = state
    operation.updatedAt = this.now()
    if (isOfficialInstallOperationTerminal(state) && operation.terminalAt === null) {
      operation.terminalAt = operation.updatedAt
    }
    if (operation.stateHistory[operation.stateHistory.length - 1] !== state) {
      operation.stateHistory.push(state)
    }
  }

  private failOfficialInstallOperation(
    operation: OfficialInstallOperationRecord,
    failureReason: string,
    diagnosticCode: string,
    state: Extract<OfficialInstallOperationState, 'failed' | 'cancelled'> = 'failed'
  ): void {
    operation.failureReason = sanitizeOperationCode(failureReason)
    operation.diagnosticCode = sanitizeOperationCode(diagnosticCode)
    operation.sanitizedDiagnostics = appendSanitizedDiagnostic(
      operation.sanitizedDiagnostics,
      diagnosticCode || failureReason
    )
    this.transitionOfficialInstallOperation(operation, state)
  }

  private async recordOfficialInstallHealthResult(
    operation: OfficialInstallOperationRecord,
    descriptor: MagikaManagedPluginDescriptor
  ): Promise<void> {
    if (!operation.installedEngineId) return
    try {
      const health = await runManagedMagikaPluginHealthCheck({
        descriptor,
        healthRunner: this.deps.healthRunner,
      })
      this.deps.registryRepo.updateHealth({
        engineId: operation.installedEngineId,
        healthStatus: health.healthy ? 'healthy' : 'unhealthy',
        updatedAt: this.now(),
        lastHealthCheckAt: this.now(),
      })
      const current = this.deps.registryRepo.getByEngineId(operation.installedEngineId)
      if (current) operation.result = toOfficialInstallOperationResult(current)
      if (!health.healthy) {
        this.deps.registryRepo.markFailed({
          engineId: operation.installedEngineId,
          failureReason: 'health_failed',
          updatedAt: this.now(),
          lastHealthCheckAt: this.now(),
        })
        const failed = this.deps.registryRepo.getByEngineId(operation.installedEngineId)
        if (failed) operation.result = toOfficialInstallOperationResult(failed)
        this.failOfficialInstallOperation(operation, 'health_failed', health.reason ?? 'health_failed')
      }
    } catch (err: any) {
      this.deps.registryRepo.markFailed({
        engineId: operation.installedEngineId,
        failureReason: 'health_failed',
        updatedAt: this.now(),
        lastHealthCheckAt: this.now(),
      })
      const current = this.deps.registryRepo.getByEngineId(operation.installedEngineId)
      if (current) operation.result = toOfficialInstallOperationResult(current)
      this.failOfficialInstallOperation(operation, 'health_failed', err?.message ?? 'health_failed')
    }
  }

  private getActiveOfficialInstallOperation(operationKey: string): OfficialInstallOperationRecord | null {
    const existingOperationId = this.inFlightOfficialInstalls.get(operationKey)
    if (!existingOperationId) return null
    const operation = this.reconcileOfficialInstallOperation(this.installOperations.get(existingOperationId) ?? null)
    if (!operation || !isOfficialInstallOperationActive(operation.state)) {
      this.inFlightOfficialInstalls.delete(operationKey)
      return null
    }
    return operation
  }

  private reconcileOfficialInstallOperation(
    operation: OfficialInstallOperationRecord | null
  ): OfficialInstallOperationRecord | null {
    if (!operation || !isOfficialInstallOperationActive(operation.state)) return operation
    const operationKey = officialInstallOperationKey(operation.pluginId, operation.pluginVersion)
    if (this.inFlightOfficialInstalls.get(operationKey) === operation.operationId) {
      return operation
    }
    const registryRecord = this.deps.registryRepo.getByEngineId(operation.pluginId)
    if (!registryRecord) return operation
    if (
      registryRecord.installState !== 'uninstalled' &&
      registryRecord.installState !== 'failed' &&
      registryRecord.pluginVersion === operation.pluginVersion &&
      registryRecord.updatedAt >= operation.startedAt
    ) {
      operation.installedEngineId = registryRecord.engineId
      operation.result = toOfficialInstallOperationResult(registryRecord)
      this.transitionOfficialInstallOperation(operation, 'installed')
      this.clearInFlightOfficialInstall(operation)
      return operation
    }
    if (
      registryRecord.installState === 'failed' &&
      registryRecord.pluginVersion === operation.pluginVersion &&
      registryRecord.updatedAt >= operation.startedAt
    ) {
      operation.installedEngineId = registryRecord.engineId
      operation.result = toOfficialInstallOperationResult(registryRecord)
      operation.failureReason = sanitizeOperationCode(registryRecord.failureReason ?? 'operation_stale')
      operation.diagnosticCode = sanitizeOperationCode(registryRecord.failureReason ?? 'operation_stale')
      operation.sanitizedDiagnostics = appendSanitizedDiagnostic(
        operation.sanitizedDiagnostics,
        registryRecord.failureReason ?? 'operation_stale'
      )
      this.transitionOfficialInstallOperation(operation, 'failed')
      this.clearInFlightOfficialInstall(operation)
      return operation
    }
    if (registryRecord.installState === 'uninstalled' && registryRecord.updatedAt >= operation.startedAt) {
      operation.failureReason = sanitizeOperationCode('operation_stale')
      operation.diagnosticCode = sanitizeOperationCode('operation_stale')
      operation.sanitizedDiagnostics = appendSanitizedDiagnostic(operation.sanitizedDiagnostics, 'operation_stale')
      this.transitionOfficialInstallOperation(operation, 'stale')
      this.clearInFlightOfficialInstall(operation)
    }
    return operation
  }

  private clearInFlightOfficialInstall(operation: OfficialInstallOperationRecord): void {
    const operationKey = officialInstallOperationKey(operation.pluginId, operation.pluginVersion)
    if (this.inFlightOfficialInstalls.get(operationKey) === operation.operationId) {
      this.inFlightOfficialInstalls.delete(operationKey)
    }
  }

  private verifyOfficialMagikaReleaseMetadata(
    release: OfficialPackageReleaseMetadata
  ): LifecycleActionResult<void> {
    if (release !== MAGIKA_OFFICIAL_RELEASE_METADATA) {
      return hasConfiguredTrustedRootForRelease(release, this.deps.trustedRoots, this.deps.trustedRootSource)
        ? ok(undefined)
        : fail('official_trusted_root_unconfigured', 'official plugin trusted roots are not configured')
    }

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
    if (catalogResult.ok) return ok(undefined)
    return catalogResult.reason === 'official_trusted_root_unconfigured'
      ? fail('official_trusted_root_unconfigured', 'official plugin trusted roots are not configured')
      : fail('official_release_metadata_invalid', 'official plugin release metadata verification failed')
  }

  private async extractAndValidateOfficialMagika(input: Readonly<{
    verified: VerifiedOfficialPackageRelease
    release: OfficialPackageReleaseMetadata
    stageDir: string
    finalDir: string
    pluginId: string
    pluginVersion: string
  }>): Promise<LifecycleActionResult<Readonly<{
    descriptor: MagikaManagedPluginDescriptor
    manifestBytes: Uint8Array
  }>>> {
    try {
      await extractOfficialMagikaPackage({
        bytes: input.verified.stagedPackage.bytes,
        stageDir: input.stageDir,
        release: input.release,
      })
    } catch {
      return fail('official_package_extract_failed', 'official package extraction failed')
    }

    const stagedEngineDir = path.join(input.stageDir, 'engine')
    const discovered = await discoverMagikaManagedPlugin({ pluginDirs: [stagedEngineDir] })
    if (!discovered.available) {
      return fail('manifest_integrity_failed', 'managed plugin integrity verification failed')
    }
    const descriptor = discovered.descriptor
    if (descriptor.manifest.engineId !== input.pluginId) {
      return fail('manifest_engine_mismatch', 'manifest engineId does not match official release metadata')
    }
    if (descriptor.manifest.pluginVersion !== input.pluginVersion) {
      return fail('manifest_version_mismatch', 'manifest pluginVersion does not match official release metadata')
    }

    const manifestBytes = await this.readBytes(descriptor.manifestPath).catch(() => null)
    if (!manifestBytes) {
      return fail('local_package_manifest_hash_missing', 'cannot read installed package manifest for hash calculation')
    }

    try {
      await promoteOfficialMagikaEngine({ stagedEngineDir, finalDir: input.finalDir })
    } catch {
      return fail('official_package_extract_failed', 'official package extraction failed')
    }

    const installed = await discoverMagikaManagedPlugin({ pluginDirs: [input.finalDir] })
    if (!installed.available) {
      return fail('manifest_integrity_failed', 'managed plugin integrity verification failed')
    }
    return ok({ descriptor: installed.descriptor, manifestBytes })
  }

  private upsertOfficialMagikaInstall(input: Readonly<{
    descriptor: MagikaManagedPluginDescriptor
    manifestBytes: Uint8Array
    existing: EnginePluginRegistryRecord | null
    installRootKind: EnginePluginInstallRootKind
    installRef: string
    verified: VerifiedOfficialPackageRelease
  }>): EnginePluginRegistryRecord {
    const timestamp = this.now()
    return this.deps.registryRepo.upsert({
      engineId: input.descriptor.manifest.engineId,
      displayName: input.descriptor.manifest.displayName,
      pluginVersion: input.descriptor.manifest.pluginVersion,
      manifestSchemaVersion: input.descriptor.manifest.manifestSchemaVersion,
      manifestHash: buildSha256Hex(input.manifestBytes),
      runtimeKind: input.descriptor.manifest.runtimeKind,
      modelVersion: input.descriptor.manifest.modelVersion,
      installState: 'installed',
      enabled: false,
      healthStatus: 'unknown',
      failureReason: null,
      installSource: 'official_catalog',
      installRootKind: input.installRootKind,
      installRef: input.installRef,
      installedAt: input.existing?.installedAt ?? timestamp,
      updatedAt: timestamp,
      lastVerifiedAt: timestamp,
      lastHealthCheckAt: null,
      metadataJson: {
        officialRelease: {
          pluginId: input.descriptor.manifest.engineId,
          pluginVersion: input.descriptor.manifest.pluginVersion,
          status: input.verified.status,
        },
      },
    })
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
    this.markOfficialInstallOperationsStale(engineId, 'operation_stale')
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
    const existing = this.deps.registryRepo.getByEngineId(descriptor.manifest.engineId)
    if (existing && existing.installState !== 'uninstalled') {
      return fail('already_registered', 'plugin is already registered')
    }
    const blockedExisting = existing?.installState === 'uninstalled' && existing.failureReason
      ? blockedPluginReinstallFailure(existing.failureReason)
      : null
    if (blockedExisting) {
      return fail(blockedExisting, 'local package registration is blocked by prior trust or compatibility state')
    }
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
        verificationStatus: record.installState === 'installed'
          ? record.lastVerifiedAt
            ? 'verified'
            : 'unverified'
          : null,
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

  private markOfficialInstallOperationsStale(pluginId: string, diagnostic: string): void {
    for (const operation of this.installOperations.values()) {
      if (operation.pluginId !== pluginId || !isOfficialInstallOperationActive(operation.state)) continue
      operation.failureReason = sanitizeOperationCode('operation_stale')
      operation.diagnosticCode = sanitizeOperationCode(diagnostic)
      operation.sanitizedDiagnostics = appendSanitizedDiagnostic(operation.sanitizedDiagnostics, diagnostic)
      this.transitionOfficialInstallOperation(operation, 'stale')
      this.clearInFlightOfficialInstall(operation)
    }
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

function isActiveInstalledRecord(record: EnginePluginRegistryRecord | undefined): boolean {
  return record !== undefined && record.installState !== 'uninstalled'
}

function blockedPluginReinstallFailure(failureReason: string): LifecycleFailureReason | null {
  return BLOCKED_PLUGIN_REINSTALL_FAILURES.has(failureReason)
    ? failureReason as LifecycleFailureReason
    : null
}

const BLOCKED_PLUGIN_REINSTALL_FAILURES = new Set([
  'revoked',
  'incompatible_platform',
  'incompatible_arch',
  'incompatible_app_version',
  'signature_invalid',
  'hash_mismatch',
  'integrity_missing',
  'expired_metadata',
  'rollback_detected',
])

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

function toOfficialInstallOperationDto(
  operation: OfficialInstallOperationRecord | null | undefined
): OfficialInstallOperationDto | null {
  if (!operation) return null
  return {
    operationId: sanitizeOperationIdentifier(operation.operationId, 'official-install'),
    pluginId: sanitizeOperationIdentifier(operation.pluginId, MAGIKA_OFFICIAL_PLUGIN_ID),
    pluginVersion: sanitizeOperationIdentifier(operation.pluginVersion, MAGIKA_OFFICIAL_PLUGIN_VERSION),
    operationType: operation.operationType,
    source: operation.source,
    state: operation.state,
    phase: operation.state,
    phaseLabel: labelOfficialInstallOperationPhase(operation.state),
    progressSummary: buildOfficialInstallProgressSummary(operation),
    stateHistory: [...operation.stateHistory],
    startedAt: operation.startedAt,
    updatedAt: operation.updatedAt,
    terminalAt: operation.terminalAt,
    failureReason: sanitizeOperationCode(operation.failureReason),
    diagnosticCode: sanitizeOperationCode(operation.diagnosticCode),
    sanitizedDiagnostics: operation.sanitizedDiagnostics
      .map((value) => sanitizePluginDistributionText(value))
      .filter((value): value is string => Boolean(value)),
    installedEngineId: sanitizeOperationCode(operation.installedEngineId),
    result: operation.result
      ? {
          engineId: sanitizeOperationIdentifier(operation.result.engineId, MAGIKA_OFFICIAL_PLUGIN_ID),
          pluginVersion: sanitizeOperationIdentifier(operation.result.pluginVersion, MAGIKA_OFFICIAL_PLUGIN_VERSION),
          installState: operation.result.installState,
          healthStatus: operation.result.healthStatus,
        }
      : null,
  }
}

function toOfficialInstallOperationResult(
  record: EnginePluginRegistryRecord
): NonNullable<OfficialInstallOperationRecord['result']> {
  return {
    engineId: record.engineId,
    pluginVersion: record.pluginVersion,
    installState: record.installState,
    healthStatus: record.healthStatus,
  }
}

function buildOfficialInstallProgressSummary(operation: OfficialInstallOperationRecord): string {
  if (operation.state === 'failed' && operation.failureReason) {
    return `Install failed: ${sanitizeOperationCode(operation.failureReason) ?? 'operation_failed'}`
  }
  if (operation.state === 'installed' && operation.failureReason === 'health_failed') {
    return 'Installed with health failure'
  }
  return labelOfficialInstallOperationPhase(operation.state)
}

function mapOfficialReleaseFailure(
  result: Extract<OfficialPackageReleaseVerificationResult, { ok: false }>
): Readonly<{
  state: Extract<OfficialInstallOperationState, 'failed' | 'cancelled'>
  reason: string
  diagnostic: string
}> {
  const firstReason = result.failureReasons[0] ?? result.status
  if (firstReason === 'download_cancelled') {
    return { state: 'cancelled', reason: 'cancelled', diagnostic: 'download_cancelled' }
  }
  if (firstReason === 'hash_mismatch') {
    return { state: 'failed', reason: 'hash_mismatch', diagnostic: 'hash_mismatch' }
  }
  if (firstReason === 'size_mismatch') {
    return { state: 'failed', reason: 'size_mismatch', diagnostic: 'size_mismatch' }
  }
  if (firstReason === 'signature_missing') {
    return { state: 'failed', reason: 'signature_missing', diagnostic: 'signature_missing' }
  }
  if (
    firstReason === 'signature_invalid' ||
    firstReason === 'signature_value_invalid' ||
    firstReason === 'signature_algorithm_unsupported'
  ) {
    return { state: 'failed', reason: 'signature_invalid', diagnostic: firstReason }
  }
  if (result.status === 'download_failed') {
    return { state: 'failed', reason: 'download_failed', diagnostic: firstReason }
  }
  return { state: 'failed', reason: 'verification_failed', diagnostic: firstReason }
}

function appendSanitizedDiagnostic(values: readonly string[], value: string | null | undefined): string[] {
  const sanitized = sanitizePluginDistributionText(value)
  if (!sanitized) return [...values]
  return [...values, sanitized].slice(-8)
}

function officialInstallOperationKey(pluginId: string, pluginVersion: string): string {
  return `${pluginId}:${pluginVersion}`
}

function sanitizeOperationIdentifier(input: string | null | undefined, fallback: string): string {
  const sanitized = sanitizePluginDistributionText(input)
    ?.replace(/[^a-z0-9._:-]/giu, '_')
    .slice(0, 128)
  return sanitized || fallback
}

function sanitizeOperationCode(input: string | null | undefined): string | null {
  const sanitized = sanitizePluginDistributionText(input)
    ?.replace(/[^a-z0-9._:-]/giu, '_')
    .slice(0, 128)
  return sanitized || null
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

const defaultOfficialPackageTransport: PackageDownloadTransport = {
  async fetchPackage(request) {
    const response = await fetch(request.transportRef, { signal: request.signal })
    if (!response.ok) {
      return { ok: false, code: 'download_failed', detail: `http_${response.status}` }
    }
    const contentLength = Number(response.headers.get('content-length') ?? '0')
    if (Number.isFinite(contentLength) && contentLength > request.maxBytes) {
      return { ok: false, code: 'too_large', finalRef: response.url }
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > request.maxBytes) {
      return { ok: false, code: 'too_large', finalRef: response.url }
    }
    return { ok: true, bytes, finalRef: response.url }
  },
}

async function extractOfficialMagikaPackage(input: Readonly<{
  bytes: Uint8Array
  stageDir: string
  release: OfficialPackageReleaseMetadata
}>): Promise<void> {
  assertSafeInstallDir(input.stageDir)
  await rm(input.stageDir, { recursive: true, force: true })
  await mkdir(input.stageDir, { recursive: true })
  await extractZipToDirectory(input.bytes, input.stageDir)

  const packageManifestPath = path.join(input.stageDir, 'manifest.json')
  const inventoryPath = path.join(input.stageDir, 'inventory.json')
  const [packageManifestBytes, inventoryBytes] = await Promise.all([
    readFile(packageManifestPath),
    readFile(inventoryPath),
  ])
  if (buildSha256Hex(packageManifestBytes) !== input.release.catalogEntry.manifestSha256) {
    throw new Error('official package manifest hash mismatch')
  }
  if (buildSha256Hex(inventoryBytes) !== input.release.catalogEntry.inventorySha256) {
    throw new Error('official package inventory hash mismatch')
  }

  const engineDir = path.join(input.stageDir, 'engine')
  if (!existsSync(engineDir)) throw new Error('official package engine directory missing')
}

async function promoteOfficialMagikaEngine(input: Readonly<{
  stagedEngineDir: string
  finalDir: string
}>): Promise<void> {
  assertSafeInstallDir(input.finalDir)
  await rm(input.finalDir, { recursive: true, force: true })
  await mkdir(input.finalDir, { recursive: true })
  await cp(input.stagedEngineDir, input.finalDir, {
    recursive: true,
    force: true,
    errorOnExist: false,
    verbatimSymlinks: false,
  })
}

function extractZipToDirectory(bytes: Uint8Array, targetDir: string): Promise<void> {
  const buffer = Buffer.from(bytes)
  const entries = readZipCentralDirectory(buffer)
  return entries.reduce(
    (previous, entry) => previous.then(() => writeZipEntry(buffer, entry, targetDir)),
    Promise.resolve()
  )
}

type ZipEntry = Readonly<{
  fileName: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}>

function readZipCentralDirectory(buffer: Buffer): readonly ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer)
  if (eocdOffset < 0) throw new Error('zip end of central directory not found')
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)
  const entries: ZipEntry[] = []
  let offset = centralDirectoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('zip central directory entry invalid')
    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8')
    entries.push({ fileName, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset })
    offset += 46 + fileNameLength + extraLength + commentLength
  }
  return entries
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  return -1
}

async function writeZipEntry(buffer: Buffer, entry: ZipEntry, targetDir: string): Promise<void> {
  const relativePath = normalizeZipEntryName(entry.fileName)
  if (!relativePath) return
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
    throw new Error('zip local file header invalid')
  }
  const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26)
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28)
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > buffer.length) throw new Error('zip entry exceeds package size')
  const compressed = buffer.subarray(dataStart, dataEnd)
  const content = entry.compressionMethod === 0
    ? compressed
    : entry.compressionMethod === 8
      ? inflateRawSync(compressed)
      : null
  if (!content) throw new Error('zip compression method unsupported')
  if (content.byteLength !== entry.uncompressedSize) throw new Error('zip entry size mismatch')

  const targetPath = path.resolve(targetDir, relativePath)
  const backtrack = path.relative(targetDir, targetPath)
  if (backtrack.startsWith('..') || path.isAbsolute(backtrack)) {
    throw new Error('zip entry escapes target directory')
  }
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content)
}

function normalizeZipEntryName(input: string): string | null {
  const normalized = input.trim().replace(/\\/gu, '/')
  if (!normalized || normalized.endsWith('/')) return null
  if (normalized.includes('\u0000')) return null
  if (normalized.startsWith('/') || normalized.includes('../') || normalized === '..') return null
  if (/^[a-z][a-z0-9+.-]*:/iu.test(normalized)) return null
  return normalized.replace(/^\.\//u, '')
}

function assertSafeInstallDir(dir: string): void {
  const resolved = path.resolve(dir)
  if (resolved === path.parse(resolved).root) throw new Error('install directory cannot be filesystem root')
  const base = path.basename(resolved)
  if (!/^[a-z0-9][a-z0-9._-]{1,127}$/iu.test(base)) {
    throw new Error('install directory basename is unsafe')
  }
}

function hasConfiguredTrustedRootForRelease(
  release: OfficialPackageReleaseMetadata,
  trustedRoots: TrustedCatalogPublicKeyMap,
  trustedRootSource: 'official' | 'test' | null | undefined
): boolean {
  if (trustedRootSource !== 'official') return false
  const keyId = release.signatureEnvelope.keyId
  const trustedRoot = trustedRoots[keyId]
  const trustedKey = release.trustedKeys.find((key) => key.publicKeyPem.trim() === trustedRoot?.publicKeyPem.trim())
  return trustedRoot?.algorithm === release.signatureEnvelope.algorithm && Boolean(trustedKey)
}

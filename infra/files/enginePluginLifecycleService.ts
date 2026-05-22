import path from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
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
  type MagikaManagedPluginHealthResult,
  parseMagikaManagedPluginManifest,
  runManagedMagikaPluginHealthCheck,
} from '../../src/next/file-type/magikaManagedPlugin'
import {
  buildMagikaOfficialCatalogReadModel,
  MAGIKA_OFFICIAL_PLUGIN_ID,
  MAGIKA_OFFICIAL_PLUGIN_VERSION,
  MAGIKA_OFFICIAL_RELEASE_METADATA,
  MAGIKA_OFFICIAL_MODEL_VERSION,
} from '../../src/next/plugin-distribution/magikaOfficialRelease'
import {
  verifyOfficialPackageReleaseDownload,
  type OfficialPackageReleaseMetadata,
  type OfficialPackageReleaseVerificationResult,
} from '../../src/next/plugin-distribution/officialPackageRelease'
import type { PackageDownloadTransport } from '../../src/next/plugin-distribution/packageDownloader'
import { sanitizePluginDistributionText } from '../../src/next/plugin-distribution/sanitization'
import { validatePluginPackageInventory } from '../../src/next/plugin-distribution/artifactInventory'
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
import {
  PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
  PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION,
} from '../../src/next/plugin-distribution/types'
import type { EnginePluginRegistryRepo } from '../db/repo/enginePluginRegistryRepo'
import type {
  EnginePluginInstallRootKind,
  EnginePluginRegistryRecord,
  JsonObject,
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
  'health_check_execution_failed',
  'health_result_unhealthy',
  'magika_runtime_missing_dependency',
  'magika_child_process_exit_nonzero',
  'magika_stdout_parse_failed',
  'magika_health_check_timeout',
  'magika_health_check_execution_failed',
  'unknown_runtime_error',
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
  'cleanup_failed',
  'rollback_failed',
  'dependency_missing',
  'inventory_invalid',
  'operation_already_in_progress',
  'operation_stale',
])

type LifecycleFailureReason = (typeof FAILURE_REASON_SET extends Set<infer T> ? T : never) & string

export type InstalledEnginePluginDto = Readonly<{
  engineId: string
  displayName: string
  pluginVersion: string
  installedVersion: string
  availableVersion: string | null
  packageVersion: string
  manifestSchemaVersion: string
  runtimeKind: string
  runtimeVersion: string | null
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
  errorChain: PluginLayeredErrorChainDto | null
  releaseProvenance: OfficialReleaseProvenanceDto | null
  previousKnownGood: PreviousKnownGoodDto | null
}>

export type PluginLayeredErrorChainDto = Readonly<{
  operationLayer: Readonly<{
    code: string | null
  }>
  healthLayer: Readonly<{
    outcome: string | null
    stage: string | null
  }>
  runtimeLayer: Readonly<{
    reason: string | null
  }>
  rootCauseLayer: Readonly<{
    sanitizedRootCause: string | null
  }>
}>

export type OfficialReleaseProvenanceDto = Readonly<{
  pluginId: string
  packageVersion: string
  runtimeVersion: string | null
  modelVersion: string | null
  packageFormatVersion: number
  manifestSchemaVersion: string
  inventorySchemaVersion: string
  packageSha256: string
  packageSizeBytes: number
  manifestSha256: string
  inventorySha256: string
  releaseUrl: string
  releaseTag: string | null
  assetName: string | null
  trustKeyId: string
  signedAt: string
  expiresAt: string
  channel: string | null
  platform: string
  arch: string
}>

export type PreviousKnownGoodDto = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: string
  installRef: string
  packageRef: string | null
}>

export type OfficialPluginDto = Readonly<{
  pluginId: string
  displayName: string
  publisher: string
  pluginVersion: string
  availableVersion: string
  runtimeKind: string
  capabilities: readonly PluginPackageCapability[]
  platformCompatibility: Readonly<{
    declaredPlatform: string
    compatible: boolean
  }>
  architectureCompatibility: Readonly<{
    declaredArchitecture: string
    compatible: boolean
  }>
  appVersionCompatibility: Readonly<{
    declaredRange: string
    compatible: boolean
  }>
  modelVersion: string | null
  packageSizeBytes: number
  catalogGeneratedAt: string | null
  installState: EnginePluginRegistryRecord['installState'] | 'not_installed'
  enabled: boolean
  recommendedInstallRootKind: 'managed_root' | 'test_root'
  catalogStatus: string
  verificationMetadataStatus: string
  installabilityStatus: string
  reasons: readonly string[]
  warnings: readonly string[]
  releaseProvenance: OfficialReleaseProvenanceDto | null
}>

export type LifecycleActionResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reason: LifecycleFailureReason; message: string; errorChain: PluginLayeredErrorChainDto | null }>

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
  errorChain: PluginLayeredErrorChainDto | null
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
  errorChain: PluginLayeredErrorChainDto | null
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
  private readonly officialInstallFinalDirLocks = new Map<string, Promise<void>>()
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
        availableVersion: entry.pluginVersion,
        runtimeKind: 'managed',
        capabilities: [],
        platformCompatibility: {
          declaredPlatform: 'any',
          compatible: true,
        },
        architectureCompatibility: {
          declaredArchitecture: 'any',
          compatible: true,
        },
        appVersionCompatibility: {
          declaredRange: '>=0.0.0',
          compatible: true,
        },
        modelVersion: null,
        packageSizeBytes: 0,
        catalogGeneratedAt: catalogResult.value.generatedAt,
        installState: installedRecord?.installState ?? 'not_installed',
        enabled: installedRecord?.enabled ?? false,
        recommendedInstallRootKind,
        catalogStatus: 'valid_metadata_only',
        verificationMetadataStatus: 'metadata_present_crypto_deferred',
        installabilityStatus: activeInstalledRecord ? 'unavailable_read_only' : 'metadata_compatible_future_install',
        reasons: ['read_only_catalog_no_install_action'],
        warnings: [],
        releaseProvenance: null,
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
      availableVersion: entry.pluginVersion,
      runtimeKind: entry.runtimeKind,
      capabilities: entry.capabilities,
      platformCompatibility: entry.platformCompatibility,
      architectureCompatibility: entry.architectureCompatibility,
      appVersionCompatibility: entry.appVersionCompatibility,
      modelVersion: entry.modelVersion,
      packageSizeBytes: entry.packageSizeBytes,
      catalogGeneratedAt,
      installState: installedRecord?.installState ?? 'not_installed',
      enabled: installedRecord?.enabled ?? false,
      recommendedInstallRootKind,
      catalogStatus: entry.catalogStatus,
      verificationMetadataStatus: entry.verificationMetadataStatus,
      installabilityStatus: isActiveInstalledRecord(installedRecord) ? 'unavailable_read_only' : entry.installabilityStatus,
      reasons: entry.reasons,
      warnings: entry.warnings,
      releaseProvenance: officialReleaseProvenanceForEntry(entry.pluginId, entry.pluginVersion),
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

    const blockedTerminalOperation = this.getBlockedTerminalOfficialInstallOperation(pluginId, pluginVersion)
    if (blockedTerminalOperation) {
      return fail(blockedTerminalOperation, 'official plugin reinstall is blocked by prior trust state')
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
      enabled: input.enabled === true,
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
      errorChain: null,
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
    enabled: boolean
  }>): Promise<void> {
    const operation = this.installOperations.get(input.operationId)
    if (!operation) return

    const installRef = MAGIKA_OFFICIAL_PLUGIN_ID
    const finalDir = this.deps.resolveInstallPluginDir({ installRootKind: input.installRootKind, installRef })
    const stageDir = `${finalDir}.stage-${input.operationId}`
    try {
      await this.executeOfficialInstallOperation(input, operation, { finalDir, installRef, stageDir })
    } catch (err: any) {
      this.failOfficialInstallOperation(operation, 'registration_failed', err?.message ?? 'official install failed')
    } finally {
      await this.finalizeOfficialInstallOperation(input, operation, { finalDir, stageDir })
    }
  }

  private async executeOfficialInstallOperation(
    input: Readonly<{
      pluginId: string
      pluginVersion: string
      release: OfficialPackageReleaseMetadata
      existing: EnginePluginRegistryRecord | null
      installRootKind: EnginePluginInstallRootKind
      enabled: boolean
    }>,
    operation: OfficialInstallOperationRecord,
    paths: Readonly<{ finalDir: string; installRef: string; stageDir: string }>
  ): Promise<void> {
    if (!this.transitionCurrentOfficialInstallOperation(operation, 'pending')) return
    if (!this.transitionCurrentOfficialInstallOperation(operation, 'downloading')) return
    const verified = await this.downloadAndVerifyOfficialInstall(input)
    if (!this.isOfficialInstallOperationCurrent(operation)) return
    if (!verified.ok) {
      this.failOfficialInstallFromVerification(operation, verified)
      return
    }

    if (!this.transitionCurrentOfficialInstallOperation(operation, 'verifying')) return
    if (!this.transitionCurrentOfficialInstallOperation(operation, 'staging')) return
    const staleCleanup = await cleanupStaleMagikaManagedDirs(paths.finalDir)
    if (!staleCleanup.ok) {
      this.failOfficialInstallOperation(operation, 'cleanup_failed', staleCleanup.detail)
      return
    }
    const extracted = await this.extractAndValidateOfficialMagika({
      verified,
      release: input.release,
      stageDir: paths.stageDir,
      pluginId: input.pluginId,
      pluginVersion: input.pluginVersion,
    })
    if (!this.isOfficialInstallOperationCurrent(operation)) return
    if (!extracted.ok) {
      const failed = this.markOfficialInstallFailureRecord(input.pluginId, extracted.reason)
      if (failed) operation.result = toOfficialInstallOperationResult(failed)
      this.failOfficialInstallOperation(operation, 'registration_failed', extracted.reason)
      return
    }
    const stageHealth = await this.verifyOfficialMagikaCandidate({
      descriptor: extracted.value.descriptor,
      requireDeclaredRuntimeDependencies: true,
    })
    if (!stageHealth.ok) {
      const failed = this.markOfficialInstallFailureRecord(
        input.pluginId,
        stageHealth.detail,
        stageHealth.registryFailureReason,
        stageHealth.errorChain
      )
      if (failed) operation.result = toOfficialInstallOperationResult(failed)
      this.failOfficialInstallOperation(operation, stageHealth.reason, stageHealth.detail, 'failed', stageHealth.errorChain)
      return
    }

    if (!this.transitionCurrentOfficialInstallOperation(operation, 'registering')) return
    const promoted = await this.promoteCurrentOfficialMagika({
      operation,
      stagedEngineDir: extracted.value.stagedEngineDir,
      finalDir: paths.finalDir,
    })
    if (!promoted.ok) {
      this.failOfficialInstallOperation(operation, 'registration_failed', promoted.reason)
      return
    }
    if (!promoted.value) return

    if (!this.transitionCurrentOfficialInstallOperation(operation, 'health_checking')) return
    const finalHealth = await this.verifyOfficialMagikaCandidate({
      descriptor: promoted.value.descriptor,
      requireDeclaredRuntimeDependencies: true,
    })
    if (!finalHealth.ok) {
      const rollback = await rollbackOfficialMagikaPromote({
        finalDir: paths.finalDir,
        rollbackDir: promoted.value.rollbackDir,
      })
      if (!rollback.ok) {
        this.markOfficialInstallFailureRecord(input.pluginId, rollback.detail)
        this.failOfficialInstallOperation(operation, 'rollback_failed', rollback.detail)
        return
      }
      if (!promoted.value.rollbackDir) {
        const failed = this.markOfficialInstallFailureRecord(
          input.pluginId,
          finalHealth.detail,
          finalHealth.registryFailureReason,
          finalHealth.errorChain
        )
        if (failed) operation.result = toOfficialInstallOperationResult(failed)
      }
      this.failOfficialInstallOperation(operation, finalHealth.reason, finalHealth.detail, 'failed', finalHealth.errorChain)
      return
    }

    const upserted = this.upsertOfficialMagikaInstall({
      descriptor: promoted.value.descriptor,
      manifestBytes: extracted.value.manifestBytes,
      existing: input.existing,
      installRootKind: input.installRootKind,
      installRef: paths.installRef,
      verified,
      release: input.release,
      enabled: input.enabled,
    })
    operation.installedEngineId = upserted.engineId
    operation.result = toOfficialInstallOperationResult(upserted)
    const cleanup = await cleanupPromotedOfficialMagika({
      stageDir: paths.stageDir,
      rollbackDir: promoted.value.rollbackDir,
    })
    if (!cleanup.ok) {
      this.markOfficialInstallFailureRecord(upserted.engineId, cleanup.detail)
      this.failOfficialInstallOperation(operation, 'cleanup_failed', cleanup.detail)
    }
  }

  private async downloadAndVerifyOfficialInstall(input: Readonly<{
    release: OfficialPackageReleaseMetadata
    existing: EnginePluginRegistryRecord | null
  }>): Promise<OfficialPackageReleaseVerificationResult> {
    return verifyOfficialPackageReleaseDownload({
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
  }

  private failOfficialInstallFromVerification(
    operation: OfficialInstallOperationRecord,
    verified: Extract<OfficialPackageReleaseVerificationResult, { ok: false }>
  ): void {
    if (verified.status === 'signature_failed') {
      this.transitionOfficialInstallOperation(operation, 'verifying')
    }
    const failure = mapOfficialReleaseFailure(verified)
    this.failOfficialInstallOperation(operation, failure.reason, failure.diagnostic, failure.state)
  }

  private async finalizeOfficialInstallOperation(
    input: Readonly<{ operationId: string; pluginId: string; pluginVersion: string }>,
    operation: OfficialInstallOperationRecord,
    paths: Readonly<{ finalDir: string; stageDir: string }>
  ): Promise<void> {
    const stageCleanup = await safeRemoveMagikaManagedPath(paths.stageDir, paths.finalDir, { allowMissing: true })
    if (!stageCleanup.ok) {
      this.failOfficialInstallOperation(operation, 'cleanup_failed', stageCleanup.detail)
    }
    if (this.shouldCleanFailedOfficialInstallFinalDir(operation)) {
      await this.withOfficialInstallFinalDirLock(input.pluginId, async () => {
        if (this.shouldCleanFailedOfficialInstallFinalDir(operation)) {
          const finalCleanup = await safeRemoveMagikaManagedPath(paths.finalDir, paths.finalDir, { allowMissing: true })
          if (!finalCleanup.ok) {
            this.markOfficialInstallFailureRecord(input.pluginId, finalCleanup.detail)
            this.failOfficialInstallOperation(operation, 'cleanup_failed', finalCleanup.detail)
          }
        }
      })
    }
    const operationKey = officialInstallOperationKey(input.pluginId, input.pluginVersion)
    if (this.inFlightOfficialInstalls.get(operationKey) === input.operationId) {
      this.inFlightOfficialInstalls.delete(operationKey)
    }
    this.markOfficialInstallOperationTerminal(operation)
  }

  private markOfficialInstallOperationTerminal(operation: OfficialInstallOperationRecord): void {
    if (isOfficialInstallOperationTerminal(operation.state)) return
    if (operation.installedEngineId && operation.state !== 'failed') {
      this.transitionOfficialInstallOperation(operation, 'installed')
    } else if (operation.failureReason) {
      this.transitionOfficialInstallOperation(operation, 'failed')
    }
  }

  private shouldCleanFailedOfficialInstallFinalDir(operation: OfficialInstallOperationRecord): boolean {
    void operation
    return false
  }

  private transitionCurrentOfficialInstallOperation(
    operation: OfficialInstallOperationRecord,
    state: OfficialInstallOperationState
  ): boolean {
    if (!this.isOfficialInstallOperationCurrent(operation)) return false
    this.transitionOfficialInstallOperation(operation, state)
    return this.isOfficialInstallOperationCurrent(operation)
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
    state: Extract<OfficialInstallOperationState, 'failed' | 'cancelled'> = 'failed',
    errorChain: PluginLayeredErrorChainDto | null = null
  ): void {
    operation.failureReason = sanitizeOperationCode(failureReason)
    operation.diagnosticCode = sanitizeOperationCode(diagnosticCode)
    operation.errorChain = errorChain
    operation.sanitizedDiagnostics = appendSanitizedDiagnostic(
      operation.sanitizedDiagnostics,
      diagnosticCode || failureReason
    )
    this.transitionOfficialInstallOperation(operation, state)
  }

  private async promoteCurrentOfficialMagika(input: Readonly<{
    operation: OfficialInstallOperationRecord
    stagedEngineDir: string
    finalDir: string
  }>): Promise<LifecycleActionResult<Readonly<{
    descriptor: MagikaManagedPluginDescriptor
    rollbackDir: string | null
  }> | null>> {
    if (!this.isOfficialInstallOperationCurrent(input.operation)) return ok(null)
    return this.withOfficialInstallFinalDirLock(input.operation.pluginId, async () => {
      if (!this.isOfficialInstallOperationCurrent(input.operation)) return ok(null)
      try {
        const promoted = await promoteOfficialMagikaEngine({
          operationId: input.operation.operationId,
          stagedEngineDir: input.stagedEngineDir,
          finalDir: input.finalDir,
        })
        if (!promoted.ok) return fail('registration_failed', promoted.detail)
        const installed = await discoverMagikaManagedPlugin({ pluginDirs: [input.finalDir] })
        if (!installed.available) {
          return fail('manifest_integrity_failed', 'managed plugin integrity verification failed')
        }
        return ok({ descriptor: installed.descriptor, rollbackDir: promoted.rollbackDir })
      } catch {
        return fail('official_package_extract_failed', 'official package extraction failed')
      }
    })
  }

  private async withOfficialInstallFinalDirLock<T>(
    pluginId: string,
    task: () => Promise<T>
  ): Promise<T> {
    const previous = this.officialInstallFinalDirLocks.get(pluginId) ?? Promise.resolve()
    let release: () => void = () => undefined
    const current = previous.then(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    this.officialInstallFinalDirLocks.set(pluginId, current)
    await previous.catch(() => undefined)
    try {
      return await task()
    } finally {
      release()
      if (this.officialInstallFinalDirLocks.get(pluginId) === current) {
        this.officialInstallFinalDirLocks.delete(pluginId)
      }
    }
  }

  private async verifyOfficialMagikaCandidate(input: Readonly<{
    descriptor: MagikaManagedPluginDescriptor
    requireDeclaredRuntimeDependencies: boolean
  }>): Promise<Readonly<{
    ok: true
  } | {
    ok: false
    reason: LifecycleFailureReason
    detail: string
    registryFailureReason?: string | null
    errorChain?: PluginLayeredErrorChainDto | null
  }>> {
    if (
      input.requireDeclaredRuntimeDependencies &&
      input.descriptor.manifest.requiredRuntimePaths.length === 0 &&
      input.descriptor.manifest.dependencyRoots.length === 0
    ) {
      return {
        ok: false,
        reason: 'dependency_missing',
        detail: 'official magika package does not declare required runtime dependencies',
      }
    }
    const health = await runManagedMagikaPluginHealthCheck({
      descriptor: input.descriptor,
      healthRunner: this.deps.healthRunner,
    })
    if (!health.healthy) {
      const errorChain = buildMagikaHealthErrorChain(health, 'health_check_failed')
      return {
        ok: false,
        reason: 'health_failed',
        detail: buildMagikaHealthOperationDiagnostic(health),
        registryFailureReason: health.specificReason,
        errorChain,
      }
    }
    return { ok: true }
  }

  private markOfficialInstallFailureRecord(
    engineId: string,
    diagnostic: string,
    registryFailureReason: string | null = null,
    errorChain: PluginLayeredErrorChainDto | null = null
  ): EnginePluginRegistryRecord | null {
    const current = this.deps.registryRepo.getByEngineId(engineId)
    const timestamp = this.now()
    const failureReason = safeFailureReason(registryFailureReason ?? diagnostic)
    if (!current) {
      return this.deps.registryRepo.upsert({
        engineId,
        displayName: 'Magika',
        pluginVersion: '0.0.0',
        manifestSchemaVersion: '1',
        manifestHash: '0'.repeat(64),
        runtimeKind: 'local_loader',
        modelVersion: null,
        installState: 'failed',
        enabled: false,
        healthStatus: 'unhealthy',
        failureReason,
        installSource: 'official_catalog',
        installRootKind: 'managed_root',
        installRef: 'magika',
        installedAt: null,
        updatedAt: timestamp,
        lastVerifiedAt: null,
        lastHealthCheckAt: timestamp,
        metadataJson: withLastHealthErrorChain(null, errorChain),
      })
    }
    return this.deps.registryRepo.upsert({
      engineId: current.engineId,
      displayName: current.displayName,
      pluginVersion: current.pluginVersion,
      manifestSchemaVersion: current.manifestSchemaVersion,
      manifestHash: current.manifestHash,
      runtimeKind: current.runtimeKind,
      modelVersion: current.modelVersion,
      installState: current.installState === 'uninstalled' ? 'failed' : current.installState,
      enabled: false,
      healthStatus: 'unhealthy',
      failureReason,
      installSource: current.installSource,
      installRootKind: current.installRootKind,
      installRef: current.installRef,
      installedAt: current.installedAt,
      updatedAt: timestamp,
      lastVerifiedAt: current.lastVerifiedAt,
      lastHealthCheckAt: timestamp,
      metadataJson: withLastHealthErrorChain(current.metadataJson, errorChain),
    })
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

  private getBlockedTerminalOfficialInstallOperation(
    pluginId: string,
    pluginVersion: string
  ): LifecycleFailureReason | null {
    const latest = Array.from(this.installOperations.values())
      .filter((operation) =>
        operation.pluginId === pluginId &&
        operation.pluginVersion === pluginVersion &&
        operation.state === 'failed'
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    if (!latest?.failureReason) return null
    return blockedPluginReinstallFailure(latest.failureReason)
  }

  private isOfficialInstallOperationCurrent(operation: OfficialInstallOperationRecord): boolean {
    const operationKey = officialInstallOperationKey(operation.pluginId, operation.pluginVersion)
    return this.installOperations.get(operation.operationId) === operation &&
      this.inFlightOfficialInstalls.get(operationKey) === operation.operationId &&
      isOfficialInstallOperationActive(operation.state)
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
    pluginId: string
    pluginVersion: string
  }>): Promise<LifecycleActionResult<Readonly<{
    stagedEngineDir: string
    manifestBytes: Uint8Array
    descriptor: MagikaManagedPluginDescriptor
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

    return ok({ stagedEngineDir, manifestBytes, descriptor })
  }

  private upsertOfficialMagikaInstall(input: Readonly<{
    descriptor: MagikaManagedPluginDescriptor
    manifestBytes: Uint8Array
    existing: EnginePluginRegistryRecord | null
    installRootKind: EnginePluginInstallRootKind
    installRef: string
    verified: VerifiedOfficialPackageRelease
    release: OfficialPackageReleaseMetadata
    enabled: boolean
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
      enabled: input.enabled,
      healthStatus: 'healthy',
      failureReason: null,
      installSource: 'official_catalog',
      installRootKind: input.installRootKind,
      installRef: input.installRef,
      installedAt: input.existing?.installedAt ?? timestamp,
      updatedAt: timestamp,
      lastVerifiedAt: timestamp,
      lastHealthCheckAt: timestamp,
      metadataJson: withOfficialReleaseProvenance(
        input.existing?.metadataJson,
        buildOfficialReleaseProvenance(input.release, input.descriptor.manifest.modelVersion)
      ),
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

  async uninstallPlugin(input: UninstallPluginInput): Promise<LifecycleActionResult<InstalledEnginePluginDto>> {
    const engineId = requireNonEmpty(input.engineId, 'engineId')
    const record = this.deps.registryRepo.getByEngineId(engineId)
    if (!record) return fail('not_installed', 'plugin record is not found')

    const uninstalledAt = this.now()
    this.deps.registryRepo.disable(engineId, uninstalledAt)
    if (isOfficialManagedMagikaCleanupRecord(record)) {
      const finalDir = this.deps.resolveInstallPluginDir({
        installRootKind: record.installRootKind,
        installRef: record.installRef,
      })
      const finalCleanup = await safeRemoveMagikaManagedPath(finalDir, finalDir, { allowMissing: true })
      if (!finalCleanup.ok) {
        this.deps.registryRepo.markFailed({
          engineId,
          failureReason: safeFailureReason(finalCleanup.detail),
          updatedAt: this.now(),
          lastHealthCheckAt: this.now(),
        })
        const failed = this.deps.registryRepo.getByEngineId(engineId)
        return failed ? fail('cleanup_failed', toInstalledDto(failed)) : fail('cleanup_failed', finalCleanup.detail)
      }
      const staleCleanup = await cleanupStaleMagikaManagedDirs(finalDir)
      if (!staleCleanup.ok) {
        this.deps.registryRepo.markFailed({
          engineId,
          failureReason: safeFailureReason(staleCleanup.detail),
          updatedAt: this.now(),
          lastHealthCheckAt: this.now(),
        })
        const failed = this.deps.registryRepo.getByEngineId(engineId)
        return failed ? fail('cleanup_failed', toInstalledDto(failed)) : fail('cleanup_failed', staleCleanup.detail)
      }
    }
    this.deps.registryRepo.markUninstalled({ engineId, updatedAt: uninstalledAt })
    const uninstalled = this.deps.registryRepo.getByEngineId(engineId)
    if (!uninstalled) return fail('not_installed', 'plugin record is not found after uninstall')
    this.markOfficialInstallOperationsStale(engineId, 'operation_stale', uninstalledAt)
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
      const errorChain = buildHealthCheckExecutionErrorChain(
        'health_check_failed',
        safeFailureReason(discovered.reason)
      )
      this.deps.registryRepo.markFailed({
        engineId,
        failureReason: safeFailureReason(discovered.reason),
        updatedAt: this.now(),
        lastHealthCheckAt: this.now(),
        metadataJson: withLastHealthErrorChain(record.metadataJson, errorChain),
      })
      const failed = this.deps.registryRepo.getByEngineId(engineId)
      if (!failed) return fail('not_installed', 'plugin record is not found after health failure')
      return fail('health_check_unavailable', toInstalledDto(failed), errorChain)
    }

    const health = await runManagedMagikaPluginHealthCheck({
      descriptor: discovered.descriptor,
      healthRunner: this.deps.healthRunner,
    })
    if (!health.healthy) {
      const errorChain = buildMagikaHealthErrorChain(health, 'health_check_failed')
      this.deps.registryRepo.markFailed({
        engineId,
        failureReason: safeFailureReason(health.specificReason ?? health.reason ?? 'engine_failed'),
        updatedAt: this.now(),
        lastHealthCheckAt: this.now(),
        metadataJson: withLastHealthErrorChain(record.metadataJson, errorChain),
      })
      const failed = this.deps.registryRepo.getByEngineId(engineId)
      if (!failed) return fail('not_installed', 'plugin record is not found after health failure')
      return fail('health_check_failed', toInstalledDto(failed), errorChain)
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

  private markOfficialInstallOperationsStale(pluginId: string, diagnostic: string, supersededAt: number): void {
    for (const operation of this.installOperations.values()) {
      if (operation.pluginId !== pluginId || operation.startedAt > supersededAt) continue
      this.supersedeOfficialInstallOperation(operation, diagnostic, supersededAt)
    }
  }

  private supersedeOfficialInstallOperation(
    operation: OfficialInstallOperationRecord,
    diagnostic: string,
    supersededAt: number
  ): void {
    operation.failureReason = sanitizeOperationCode('operation_stale')
    operation.diagnosticCode = sanitizeOperationCode(diagnostic)
    operation.sanitizedDiagnostics = appendSanitizedDiagnostic(operation.sanitizedDiagnostics, diagnostic)
    operation.state = 'stale'
    operation.updatedAt = supersededAt
    if (operation.terminalAt === null) {
      operation.terminalAt = supersededAt
    }
    if (operation.stateHistory[operation.stateHistory.length - 1] !== 'stale') {
      operation.stateHistory.push('stale')
    }
    this.clearInFlightOfficialInstall(operation)
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

function isOfficialManagedMagikaCleanupRecord(record: EnginePluginRegistryRecord): boolean {
  return (
    record.engineId === MAGIKA_OFFICIAL_PLUGIN_ID &&
    record.installSource === 'official_catalog' &&
    record.installRootKind === 'managed_root' &&
    record.installRef === MAGIKA_OFFICIAL_PLUGIN_ID
  )
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

function fail(reason: LifecycleFailureReason, message: string, errorChain?: PluginLayeredErrorChainDto | null): LifecycleActionResult<never>
function fail(reason: LifecycleFailureReason, message: InstalledEnginePluginDto, errorChain?: PluginLayeredErrorChainDto | null): LifecycleActionResult<never>
function fail(
  reason: LifecycleFailureReason,
  message: string | InstalledEnginePluginDto,
  errorChain: PluginLayeredErrorChainDto | null = null
): LifecycleActionResult<never> {
  const details = typeof message === 'string' ? message : `state=${message.installState}`
  return {
    ok: false,
    reason,
    message: sanitizeMessage(details),
    errorChain,
  }
}

function toInstalledDto(record: EnginePluginRegistryRecord): InstalledEnginePluginDto {
  const releaseProvenance = readOfficialReleaseProvenance(record.metadataJson)
  return {
    engineId: record.engineId,
    displayName: record.displayName,
    pluginVersion: record.pluginVersion,
    installedVersion: record.pluginVersion,
    availableVersion: officialAvailableVersionForRecord(record),
    packageVersion: releaseProvenance?.packageVersion ?? record.pluginVersion,
    manifestSchemaVersion: record.manifestSchemaVersion,
    runtimeKind: record.runtimeKind,
    runtimeVersion: releaseProvenance?.runtimeVersion ?? null,
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
    errorChain: buildRecordErrorChain(record),
    releaseProvenance,
    previousKnownGood: readPreviousKnownGood(record.metadataJson),
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
    errorChain: sanitizePluginErrorChain(operation.errorChain),
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
  if (/ERR_MODULE_NOT_FOUND|Cannot find package ['"]?magika['"]?|missing_dependency/iu.test(input ?? '')) {
    return 'magika_runtime_missing_dependency'
  }
  if (/process_exited_non_zero|exited non-zero|exitCode=\d+/iu.test(input ?? '')) {
    return 'magika_child_process_exit_nonzero'
  }
  if (/stdout_parse_failed|not valid JSON|missing required label/iu.test(input ?? '')) {
    return 'magika_stdout_parse_failed'
  }
  if (/process_timeout|engine_timeout|timed out|timeout/iu.test(input ?? '')) {
    return 'magika_health_check_timeout'
  }
  if (/spawn_failed|command_not_found|not executable|ENOENT/iu.test(input ?? '')) {
    return 'magika_health_check_execution_failed'
  }
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

function buildOfficialReleaseProvenance(
  release: OfficialPackageReleaseMetadata,
  modelVersion: string | null
): OfficialReleaseProvenanceDto {
  const packageRef = splitPackageRef(release.catalogEntry.packageRef)
  return {
    pluginId: release.catalogEntry.pluginId,
    packageVersion: release.catalogEntry.pluginVersion,
    runtimeVersion: null,
    modelVersion,
    packageFormatVersion: 1,
    manifestSchemaVersion: PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION,
    inventorySchemaVersion: PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
    packageSha256: release.catalogEntry.packageSha256,
    packageSizeBytes: release.catalogEntry.packageSizeBytes,
    manifestSha256: release.catalogEntry.manifestSha256,
    inventorySha256: release.catalogEntry.inventorySha256,
    releaseUrl: release.releaseUrl,
    releaseTag: packageRef.releaseTag,
    assetName: packageRef.assetName,
    trustKeyId: release.signatureEnvelope.keyId,
    signedAt: release.signatureEnvelope.signedAt,
    expiresAt: release.signatureEnvelope.expiresAt,
    channel: release.catalogEntry.channel ?? null,
    platform: release.catalogEntry.platform,
    arch: release.catalogEntry.arch,
  }
}

function withOfficialReleaseProvenance(
  metadataJson: JsonObject | null | undefined,
  provenance: OfficialReleaseProvenanceDto
): JsonObject {
  return {
    ...(metadataJson ?? {}),
    officialRelease: provenance,
    previousKnownGood: readPreviousKnownGood(metadataJson),
  }
}

function officialReleaseProvenanceForEntry(
  pluginId: string,
  pluginVersion: string
): OfficialReleaseProvenanceDto | null {
  if (pluginId !== MAGIKA_OFFICIAL_PLUGIN_ID || pluginVersion !== MAGIKA_OFFICIAL_PLUGIN_VERSION) return null
  return buildOfficialReleaseProvenance(MAGIKA_OFFICIAL_RELEASE_METADATA, MAGIKA_OFFICIAL_MODEL_VERSION)
}

function officialAvailableVersionForRecord(record: EnginePluginRegistryRecord): string | null {
  if (record.engineId !== MAGIKA_OFFICIAL_PLUGIN_ID || record.installSource !== 'official_catalog') return null
  return MAGIKA_OFFICIAL_PLUGIN_VERSION
}

function readOfficialReleaseProvenance(metadataJson: JsonObject | null | undefined): OfficialReleaseProvenanceDto | null {
  const value = metadataJson?.officialRelease
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const pluginId = safeIdentifier(input.pluginId)
  const packageVersion = safeIdentifier(input.packageVersion ?? input.pluginVersion)
  const packageSha256 = safeSha256(input.packageSha256)
  const manifestSha256 = safeSha256(input.manifestSha256)
  const inventorySha256 = safeSha256(input.inventorySha256)
  const packageSizeBytes = typeof input.packageSizeBytes === 'number' && Number.isFinite(input.packageSizeBytes)
    ? input.packageSizeBytes
    : null
  const trustKeyId = safeIdentifier(input.trustKeyId)
  const signedAt = safeTimestamp(input.signedAt)
  const expiresAt = safeTimestamp(input.expiresAt)
  const releaseUrl = safePublicUrl(input.releaseUrl)
  const platform = safeIdentifier(input.platform)
  const arch = safeIdentifier(input.arch)
  if (
    !pluginId ||
    !packageVersion ||
    !packageSha256 ||
    !manifestSha256 ||
    !inventorySha256 ||
    packageSizeBytes === null ||
    !trustKeyId ||
    !signedAt ||
    !expiresAt ||
    !releaseUrl ||
    !platform ||
    !arch
  ) {
    return null
  }
  return {
    pluginId,
    packageVersion,
    runtimeVersion: safeIdentifier(input.runtimeVersion),
    modelVersion: safeIdentifier(input.modelVersion),
    packageFormatVersion: typeof input.packageFormatVersion === 'number' && Number.isFinite(input.packageFormatVersion)
      ? input.packageFormatVersion
      : 1,
    manifestSchemaVersion: safeIdentifier(input.manifestSchemaVersion) ?? PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION,
    inventorySchemaVersion: safeIdentifier(input.inventorySchemaVersion) ?? PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
    packageSha256,
    packageSizeBytes,
    manifestSha256,
    inventorySha256,
    releaseUrl,
    releaseTag: safeIdentifier(input.releaseTag),
    assetName: safeAssetName(input.assetName),
    trustKeyId,
    signedAt,
    expiresAt,
    channel: safeIdentifier(input.channel),
    platform,
    arch,
  }
}

function readPreviousKnownGood(metadataJson: JsonObject | null | undefined): PreviousKnownGoodDto | null {
  const value = metadataJson?.previousKnownGood
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const pluginId = safeIdentifier(input.pluginId)
  const pluginVersion = safeIdentifier(input.pluginVersion)
  const runtimeKind = safeIdentifier(input.runtimeKind)
  const installRef = safeIdentifier(input.installRef)
  if (!pluginId || !pluginVersion || !runtimeKind || !installRef) return null
  return {
    pluginId,
    pluginVersion,
    runtimeKind,
    installRef,
    packageRef: safeIdentifier(input.packageRef),
  }
}

function splitPackageRef(packageRef: string): Readonly<{ releaseTag: string | null; assetName: string | null }> {
  const parts = packageRef.split('/').filter(Boolean)
  return {
    releaseTag: safeIdentifier(parts[0]),
    assetName: safeAssetName(parts[parts.length - 1]),
  }
}

function safeIdentifier(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  if (/^[a-z0-9._:@+-]{1,160}$/iu.test(normalized)) return normalized
  return null
}

function safeAssetName(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  if (/^[a-z0-9._@+-]{1,200}$/iu.test(normalized)) return normalized
  return null
}

function safeSha256(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null
}

function safeTimestamp(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u.test(normalized) ? normalized : null
}

function safePublicUrl(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return /^https:\/\/[a-z0-9.-]+\/[^\s"'`<>\\]{1,500}$/iu.test(normalized) ? normalized : null
}

function buildRecordErrorChain(record: EnginePluginRegistryRecord): PluginLayeredErrorChainDto | null {
  if (!record.failureReason && record.healthStatus === 'healthy') return null
  return readLastHealthErrorChain(record.metadataJson) ?? buildErrorChainFromFailureReason(record.failureReason)
}

function buildErrorChainFromFailureReason(failureReason: string | null | undefined): PluginLayeredErrorChainDto | null {
  const reason = sanitizeLayerCode(failureReason)
  if (!reason) return null
  if (reason === 'health_check_failed' || reason === 'health_check_unavailable') {
    return {
      operationLayer: { code: 'health_check_failed' },
      healthLayer: { outcome: null, stage: null },
      runtimeLayer: { reason: null },
      rootCauseLayer: { sanitizedRootCause: null },
    }
  }
  if (isMagikaRuntimeFailureReason(reason)) {
    return {
      operationLayer: { code: null },
      healthLayer: { outcome: null, stage: null },
      runtimeLayer: { reason },
      rootCauseLayer: { sanitizedRootCause: rootCauseForRuntimeReason(reason, null) },
    }
  }
  return {
    operationLayer: { code: reason },
    healthLayer: { outcome: null, stage: null },
    runtimeLayer: { reason: null },
    rootCauseLayer: { sanitizedRootCause: null },
  }
}

function buildHealthCheckExecutionErrorChain(
  operationCode: string,
  runtimeReason: string | null | undefined
): PluginLayeredErrorChainDto {
  const reason = sanitizeLayerCode(runtimeReason)
  return {
    operationLayer: { code: sanitizeLayerCode(operationCode) ?? 'health_check_failed' },
    healthLayer: { outcome: 'execution_failed', stage: 'unknown_health_check_stage' },
    runtimeLayer: { reason: reason && isMagikaRuntimeFailureReason(reason) ? reason : 'magika_health_check_execution_failed' },
    rootCauseLayer: { sanitizedRootCause: rootCauseForRuntimeReason(reason, null) },
  }
}

function buildMagikaHealthErrorChain(
  health: MagikaManagedPluginHealthResult,
  operationCode: string
): PluginLayeredErrorChainDto {
  const runtimeReason = sanitizeLayerCode(health.specificReason)
  return {
    operationLayer: { code: sanitizeLayerCode(operationCode) ?? 'health_check_failed' },
    healthLayer: {
      outcome: sanitizeLayerCode(health.healthCheckOutcome) ?? 'unknown_health_check_result',
      stage: normalizeHealthCheckStage(health.healthCheckStage),
    },
    runtimeLayer: {
      reason: runtimeReason,
    },
    rootCauseLayer: {
      sanitizedRootCause: rootCauseForRuntimeReason(runtimeReason, health.sanitizedRootCause),
    },
  }
}

function normalizeHealthCheckStage(stage: string | null | undefined): string {
  if (stage === 'classify_self_test') return 'runtime_self_test'
  return sanitizeLayerCode(stage) ?? 'unknown_health_check_stage'
}

function withLastHealthErrorChain(
  metadataJson: JsonObject | null | undefined,
  errorChain: PluginLayeredErrorChainDto | null
): JsonObject | null {
  if (!errorChain) return metadataJson ?? null
  return {
    ...(metadataJson ?? {}),
    lastHealthErrorChain: errorChain,
  }
}

function readLastHealthErrorChain(metadataJson: JsonObject | null | undefined): PluginLayeredErrorChainDto | null {
  if (!metadataJson) return null
  const value = metadataJson.lastHealthErrorChain
  if (!value || typeof value !== 'object') return null
  return sanitizePluginErrorChain(value)
}

function sanitizePluginErrorChain(value: unknown): PluginLayeredErrorChainDto | null {
  if (!value || typeof value !== 'object') return null
  const chain = value as {
    operationLayer?: { code?: unknown }
    healthLayer?: { outcome?: unknown; stage?: unknown }
    runtimeLayer?: { reason?: unknown }
    rootCauseLayer?: { sanitizedRootCause?: unknown }
  }
  return {
    operationLayer: { code: sanitizeLayerCode(chain.operationLayer?.code) },
    healthLayer: {
      outcome: sanitizeLayerCode(chain.healthLayer?.outcome),
      stage: sanitizeLayerCode(chain.healthLayer?.stage),
    },
    runtimeLayer: { reason: sanitizeLayerCode(chain.runtimeLayer?.reason) },
    rootCauseLayer: { sanitizedRootCause: sanitizeRootCauseCode(chain.rootCauseLayer?.sanitizedRootCause) },
  }
}

function sanitizeLayerCode(input: unknown): string | null {
  const normalized = String(input ?? '').trim()
  if (!normalized) return null
  if (/^[a-z0-9_:-]{1,128}$/iu.test(normalized)) return normalized
  return null
}

function sanitizeRootCauseCode(input: unknown): string | null {
  const normalized = String(input ?? '').trim()
  if (!normalized) return null
  if (/^[A-Z0-9_:-]{1,128}$/u.test(normalized)) return normalized
  return null
}

function isMagikaRuntimeFailureReason(reason: string): boolean {
  return reason === 'magika_runtime_missing_dependency' ||
    reason === 'magika_child_process_exit_nonzero' ||
    reason === 'magika_stdout_parse_failed' ||
    reason === 'magika_health_check_timeout' ||
    reason === 'magika_health_check_execution_failed' ||
    reason === 'unknown_runtime_error'
}

function rootCauseForRuntimeReason(reason: string | null | undefined, rootCause: string | null | undefined): string | null {
  const sanitized = sanitizeRootCauseCode(rootCause)
  if (sanitized) return sanitized
  if (reason === 'magika_child_process_exit_nonzero') return 'PROCESS_EXIT_NONZERO'
  if (reason === 'magika_stdout_parse_failed') return 'STDOUT_PARSE_FAILED'
  if (reason === 'magika_health_check_timeout') return 'TIMEOUT'
  return null
}

function buildMagikaHealthOperationDiagnostic(health: MagikaManagedPluginHealthResult): string {
  const parts: string[] = []
  if (health.healthCheckOutcome === 'unhealthy_result') parts.push('health_result_unhealthy')
  if (health.healthCheckOutcome === 'execution_failed') parts.push('health_check_execution_failed')
  if (health.healthCheckOutcome) parts.push(`healthCheckOutcome=${health.healthCheckOutcome}`)
  if (health.specificReason) parts.push(`specificReason=${health.specificReason}`)
  if (health.healthCheckStage) parts.push(`healthCheckStage=${health.healthCheckStage}`)
  if (health.sanitizedRootCause) parts.push(`sanitizedRootCause=${health.sanitizedRootCause}`)
  if (health.detail) parts.push(health.detail)
  if (health.reason) parts.push(`engineReason=${health.reason}`)
  return sanitizeMessage(parts.join('; ') || 'magika health check failed')
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
  const finalDir = input.stageDir.replace(/\.stage-[^\\/]+$/u, '')
  const stageCleanup = await safeRemoveMagikaManagedPath(input.stageDir, finalDir, { allowMissing: true })
  if (!stageCleanup.ok) throw new Error(stageCleanup.detail)
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
  await validateOfficialPackageInventoryFiles({
    stageDir: input.stageDir,
    inventoryBytes,
    runtimeKind: input.release.catalogEntry.runtimeKind,
  })

  const engineDir = path.join(input.stageDir, 'engine')
  if (!existsSync(engineDir)) throw new Error('official package engine directory missing')
}

async function validateOfficialPackageInventoryFiles(input: Readonly<{
  stageDir: string
  inventoryBytes: Uint8Array
  runtimeKind: OfficialPackageReleaseMetadata['catalogEntry']['runtimeKind']
}>): Promise<void> {
  const parsed = JSON.parse(Buffer.from(input.inventoryBytes).toString('utf8')) as unknown
  const validation = validatePluginPackageInventory(parsed, { runtimeKind: input.runtimeKind })
  if (!validation.ok) {
    throw new Error('official package inventory validation failed')
  }
  for (const artifact of validation.inventory.artifacts) {
    const artifactPath = path.resolve(input.stageDir, artifact.relativePath)
    const relative = path.relative(input.stageDir, artifactPath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('official package inventory path escapes stage')
    }
    const bytes = await readFile(artifactPath)
    if (bytes.byteLength !== artifact.sizeBytes) {
      throw new Error('official package inventory size mismatch')
    }
    if (buildSha256Hex(bytes) !== artifact.sha256) {
      throw new Error('official package inventory hash mismatch')
    }
  }
}

async function promoteOfficialMagikaEngine(input: Readonly<{
  operationId: string
  stagedEngineDir: string
  finalDir: string
}>): Promise<Readonly<{ ok: true; rollbackDir: string | null } | { ok: false; detail: string }>> {
  const safety = assertSafeMagikaManagedPath(input.finalDir, input.finalDir)
  if (!safety.ok) return { ok: false, detail: safety.detail }
  const rollbackDir = `${input.finalDir}.rollback-${sanitizeOperationCode(input.operationId) ?? 'operation'}`
  const rollbackSafety = assertSafeMagikaManagedPath(rollbackDir, input.finalDir)
  if (!rollbackSafety.ok) return { ok: false, detail: rollbackSafety.detail }
  let usedRollbackDir: string | null = null
  try {
    if (existsSync(rollbackDir)) {
      const cleanup = await safeRemoveMagikaManagedPath(rollbackDir, input.finalDir, { allowMissing: true })
      if (!cleanup.ok) return cleanup
    }
    if (existsSync(input.finalDir)) {
      await rename(input.finalDir, rollbackDir)
      usedRollbackDir = rollbackDir
    }
    await rename(input.stagedEngineDir, input.finalDir)
    return { ok: true, rollbackDir: usedRollbackDir }
  } catch (error) {
    if (usedRollbackDir && !existsSync(input.finalDir) && existsSync(usedRollbackDir)) {
      try {
        await rename(usedRollbackDir, input.finalDir)
      } catch (rollbackError) {
        return {
          ok: false,
          detail: sanitizeMessage(
            rollbackError instanceof Error ? rollbackError.message : 'official magika promote rollback failed'
          ),
        }
      }
    }
    return { ok: false, detail: sanitizeMessage(error instanceof Error ? error.message : 'official magika promote failed') }
  }
}

async function rollbackOfficialMagikaPromote(input: Readonly<{
  finalDir: string
  rollbackDir: string | null
}>): Promise<Readonly<{ ok: true } | { ok: false; detail: string }>> {
  const brokenCleanup = await safeRemoveMagikaManagedPath(input.finalDir, input.finalDir, { allowMissing: true })
  if (!brokenCleanup.ok) return brokenCleanup
  if (!input.rollbackDir) return { ok: true }
  const safety = assertSafeMagikaManagedPath(input.rollbackDir, input.finalDir)
  if (!safety.ok) return { ok: false, detail: safety.detail }
  try {
    await rename(input.rollbackDir, input.finalDir)
    return { ok: true }
  } catch (error) {
    return { ok: false, detail: sanitizeMessage(error instanceof Error ? error.message : 'official magika rollback failed') }
  }
}

async function cleanupPromotedOfficialMagika(input: Readonly<{
  stageDir: string
  rollbackDir: string | null
}>): Promise<Readonly<{ ok: true } | { ok: false; detail: string }>> {
  const finalDir = input.stageDir.replace(/\.stage-[^\\/]+$/u, '')
  if (input.rollbackDir) {
    const rollbackCleanup = await safeRemoveMagikaManagedPath(input.rollbackDir, finalDir, { allowMissing: true })
    if (!rollbackCleanup.ok) return rollbackCleanup
  }
  const stageCleanup = await safeRemoveMagikaManagedPath(input.stageDir, finalDir, { allowMissing: true })
  if (!stageCleanup.ok) return stageCleanup
  return { ok: true }
}

async function cleanupStaleMagikaManagedDirs(
  finalDir: string
): Promise<Readonly<{ ok: true } | { ok: false; detail: string }>> {
  const safety = assertSafeMagikaManagedPath(finalDir, finalDir)
  if (!safety.ok) return { ok: false, detail: safety.detail }
  const managedRoot = path.dirname(path.resolve(finalDir))
  let entries: string[]
  try {
    entries = await readdir(managedRoot)
  } catch (error) {
    if (isNotFoundError(error)) return { ok: true }
    return { ok: false, detail: sanitizeMessage(error instanceof Error ? error.message : 'managed root cleanup failed') }
  }
  for (const entry of entries) {
    if (!/^magika\.(stage|tmp|rollback)-/u.test(entry)) continue
    const target = path.join(managedRoot, entry)
    const removed = await safeRemoveMagikaManagedPath(target, finalDir, { allowMissing: true })
    if (!removed.ok) return removed
  }
  return { ok: true }
}

async function safeRemoveMagikaManagedPath(
  targetPath: string,
  finalDir: string,
  options: Readonly<{ allowMissing?: boolean }> = {}
): Promise<Readonly<{ ok: true } | { ok: false; detail: string }>> {
  const safety = assertSafeMagikaManagedPath(targetPath, finalDir)
  if (!safety.ok) return { ok: false, detail: safety.detail }
  try {
    if (existsSync(path.resolve(targetPath))) {
      const managedRoot = path.dirname(path.resolve(finalDir))
      const realTarget = await realpath(path.resolve(targetPath))
      const realManagedRoot = await realpath(managedRoot)
      const relativeReal = path.relative(realManagedRoot, realTarget)
      if (!relativeReal || relativeReal.startsWith('..') || path.isAbsolute(relativeReal)) {
        return { ok: false, detail: 'managed magika path resolves outside managed root' }
      }
    }
    await rm(path.resolve(targetPath), {
      recursive: true,
      force: options.allowMissing === true,
      maxRetries: 20,
      retryDelay: 100,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, detail: sanitizeMessage(error instanceof Error ? error.message : 'managed magika cleanup failed') }
  }
}

function assertSafeMagikaManagedPath(
  targetPath: string,
  finalDir: string
): Readonly<{ ok: true } | { ok: false; detail: string }> {
  const target = String(targetPath ?? '').trim()
  const final = String(finalDir ?? '').trim()
  if (!target || !final) return { ok: false, detail: 'managed magika path is empty' }
  if (target.includes('\u0000') || final.includes('\u0000')) {
    return { ok: false, detail: 'managed magika path contains NUL' }
  }
  const resolvedTarget = path.resolve(target)
  const resolvedFinal = path.resolve(final)
  const parsed = path.parse(resolvedTarget)
  if (resolvedTarget === parsed.root) return { ok: false, detail: 'managed magika path cannot be filesystem root' }
  const home = process.env.USERPROFILE || process.env.HOME
  if (home && path.resolve(home) === resolvedTarget) return { ok: false, detail: 'managed magika path cannot be user home' }
  if (path.resolve(process.cwd()) === resolvedTarget) return { ok: false, detail: 'managed magika path cannot be repository root' }
  const managedRoot = path.dirname(resolvedFinal)
  const enginePluginsRoot = path.dirname(managedRoot)
  const storageRoot = path.dirname(enginePluginsRoot)
  if ([storageRoot, enginePluginsRoot, managedRoot].includes(resolvedTarget)) {
    return { ok: false, detail: 'managed magika path cannot be a container root' }
  }
  const relative = path.relative(managedRoot, resolvedTarget)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, detail: 'managed magika path is outside managed root' }
  }
  if (relative.includes(path.sep)) {
    return { ok: false, detail: 'managed magika cleanup only allows top-level owned directories' }
  }
  const base = path.basename(resolvedTarget)
  if (base !== 'magika' && !/^magika\.(stage|tmp|rollback)-[a-z0-9._-]+$/iu.test(base)) {
    return { ok: false, detail: 'managed magika path basename is not owned by magika' }
  }
  return { ok: true }
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
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

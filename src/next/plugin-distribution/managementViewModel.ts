import { labelPdpReasonCode, sanitizePdpManagementText, type PdpManagementLabel } from './managementLabels'
import type { PdpPluginRegistryState } from './registryModel'
import type { PdpPreviousKnownGoodRef } from './rollbackPolicy'
import type { ReadOnlyCatalogDto, ReadOnlyCatalogEntryDto } from './catalogReadModel'
import { evaluatePdpUpdateEligibility } from './updatePolicy'
import type {
  PluginHealthStatus,
  PluginInstallState,
  PluginVerificationStatus,
} from './types'

export type PdpManagementSourceKind = 'official_catalog' | 'local_manual'
export type PdpManagementLifecycleState =
  | 'catalog_only'
  | 'registered'
  | 'enabled'
  | 'disabled'
  | 'blocked'
  | 'uninstalled'
export type PdpManagementUpdateState =
  | 'not_checked'
  | 'install_available'
  | 'up_to_date'
  | 'repair_available'
  | 'update_available'
  | 'downgrade_blocked'
  | 'local_newer_than_catalog'
  | 'eligible_manual'
  | 'staged_contract'
  | 'ineligible'
export type PdpManagementRollbackState = 'unavailable' | 'previous_known_good_metadata'

export type PdpManagementCatalogInput = Pick<
  ReadOnlyCatalogEntryDto,
  | 'pluginId'
  | 'displayName'
  | 'publisher'
  | 'pluginVersion'
  | 'runtimeKind'
  | 'capabilities'
  | 'platformCompatibility'
  | 'architectureCompatibility'
  | 'appVersionCompatibility'
  | 'modelVersion'
  | 'packageSizeBytes'
  | 'installabilityStatus'
  | 'reasons'
  | 'warnings'
  | 'catalogStatus'
  | 'verificationMetadataStatus'
> & Readonly<{
  releaseProvenance?: PdpReleaseProvenanceInput | null
}>

export type PdpReleaseProvenanceInput = Readonly<{
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

export type PdpManagementRegistryInput = Readonly<{
  pluginId: string
  pluginVersion: string
  installedVersion?: string | null
  availableVersion?: string | null
  packageVersion?: string | null
  runtimeKind: string
  runtimeVersion?: string | null
  modelVersion?: string | null
  controlledRootKind: string
  installSource: string
  installRootKind?: string
  registryState: PdpPluginRegistryState
  installState: PluginInstallState
  verificationStatus: PluginVerificationStatus
  enabled: boolean
  healthStatus: PluginHealthStatus
  failureReason: string | null
  errorChain?: unknown
  releaseProvenance?: PdpReleaseProvenanceInput | null
  previousKnownGood?: PdpPreviousKnownGoodRef | null
  updatedAt?: number
  diagnostics?: readonly string[]
}>

export type PdpManagementUpdateInput = Readonly<{
  pluginId: string
  currentVersion: string
  candidateVersion: string | null
  state: PdpManagementUpdateState
  reasonCodes?: readonly string[]
}>

export type PdpManagementRollbackInput = Readonly<{
  pluginId: string
  currentVersion?: string | null
  state: PdpManagementRollbackState
  previousKnownGood: PdpPreviousKnownGoodRef | null
  reasonCodes?: readonly string[]
}>

export type PdpManagementHealthInput = Readonly<{
  pluginId: string
  healthStatus: PluginHealthStatus
  reasonCodes?: readonly string[]
}>

export type PdpManagementViewModelInput = Readonly<{
  catalog?: ReadOnlyCatalogDto | null
  catalogEntries?: readonly PdpManagementCatalogInput[]
  registryRecords?: readonly PdpManagementRegistryInput[]
  updates?: readonly PdpManagementUpdateInput[]
  rollbacks?: readonly PdpManagementRollbackInput[]
  health?: readonly PdpManagementHealthInput[]
  diagnostics?: readonly string[]
}>

export type PdpManagementStatusSummary = Readonly<{
  lifecycle: PdpManagementLifecycleState
  sourceKind: PdpManagementSourceKind
  installState: PluginInstallState
  verificationStatus: PluginVerificationStatus
  healthStatus: PluginHealthStatus
  enabled: boolean
  quarantined: boolean
  updateState: PdpManagementUpdateState
  rollbackState: PdpManagementRollbackState
}>

export type PdpManagementPluginViewModel = Readonly<{
  id: string
  displayName: string
  publisher: string
  pluginVersion: string
  installedVersion: string | null
  availableVersion: string | null
  packageVersion: string | null
  modelVersion: string | null
  runtimeVersion: string | null
  releaseProvenance: PdpReleaseProvenanceInput | null
  previousKnownGood: PdpPreviousKnownGoodRef | null
  runtimeKind: string
  capabilities: readonly string[]
  catalog: Readonly<{
    present: boolean
    readOnly: true
    status: string
    installabilityStatus: string
  }>
  registry: Readonly<{
    present: boolean
    registryState: string | null
    controlledRootKind: string | null
    installSource: string | null
  }>
  status: PdpManagementStatusSummary
  labels: readonly PdpManagementLabel[]
  reasonCodes: readonly string[]
  diagnostics: readonly string[]
}>

export type PdpManagementViewModel = Readonly<{
  plugins: readonly PdpManagementPluginViewModel[]
  diagnostics: readonly string[]
}>

export function buildPdpManagementViewModel(
  input: PdpManagementViewModelInput
): PdpManagementViewModel {
  const catalogEntries = input.catalogEntries ?? input.catalog?.entries ?? []
  const catalogByKey = new Map<string, PdpManagementCatalogInput>()
  for (const entry of catalogEntries) {
    catalogByKey.set(pluginKey(entry.pluginId, entry.pluginVersion), entry)
  }

  const records = input.registryRecords ?? []
  const recordByKey = new Map<string, PdpManagementRegistryInput>()
  const officialRecordByPlugin = new Map<string, PdpManagementRegistryInput>()
  for (const record of records) {
    recordByKey.set(pluginKey(record.pluginId, record.pluginVersion), record)
    if (record.installSource === 'official_catalog') {
      officialRecordByPlugin.set(record.pluginId, record)
    }
  }

  const updatesByPluginVersion = new Map<string, PdpManagementUpdateInput>()
  for (const update of input.updates ?? []) {
    updatesByPluginVersion.set(pluginKey(update.pluginId, update.currentVersion), update)
  }

  const rollbacksByPluginVersion = new Map<string, PdpManagementRollbackInput>()
  const rollbacksByPlugin = new Map<string, PdpManagementRollbackInput>()
  for (const rollback of input.rollbacks ?? []) {
    if (rollback.currentVersion) {
      rollbacksByPluginVersion.set(pluginKey(rollback.pluginId, rollback.currentVersion), rollback)
    }
    rollbacksByPlugin.set(rollback.pluginId, rollback)
  }

  const healthByPlugin = new Map<string, PdpManagementHealthInput>()
  for (const health of input.health ?? []) {
    healthByPlugin.set(health.pluginId, health)
  }

  const keys = new Set<string>(catalogByKey.keys())
  for (const record of records) {
    if (record.installSource === 'official_catalog' && catalogEntries.some((entry) => entry.pluginId === record.pluginId)) {
      continue
    }
    keys.add(pluginKey(record.pluginId, record.pluginVersion))
  }
  return {
    plugins: [...keys].sort().map((key) => {
      const catalogEntry = catalogByKey.get(key) ?? null
      const record = recordByKey.get(key) ?? (catalogEntry ? officialRecordByPlugin.get(catalogEntry.pluginId) : null) ?? null
      const pluginId = record?.pluginId ?? catalogEntry?.pluginId ?? ''
      const pluginVersion = record?.pluginVersion ?? catalogEntry?.pluginVersion ?? ''
      return buildPluginViewModel(
        catalogEntry,
        record,
        updatesByPluginVersion.get(pluginKey(pluginId, pluginVersion)),
        rollbacksByPluginVersion.get(pluginKey(pluginId, pluginVersion)) ?? rollbacksByPlugin.get(pluginId),
        healthByPlugin.get(pluginId)
      )
    }),
    diagnostics: sanitizeDiagnostics(input.diagnostics ?? []),
  }
}

// eslint-disable-next-line complexity
function buildPluginViewModel(
  catalogEntry: PdpManagementCatalogInput | null,
  record: PdpManagementRegistryInput | null,
  update: PdpManagementUpdateInput | undefined,
  rollback: PdpManagementRollbackInput | undefined,
  health: PdpManagementHealthInput | undefined
): PdpManagementPluginViewModel {
  const pluginId = record?.pluginId ?? catalogEntry?.pluginId ?? 'unknown'
  const installState = record?.installState ?? 'not_installed'
  const verificationStatus = installState === 'uninstalled'
    ? 'unverified'
    : record?.verificationStatus ?? 'unverified'
  const healthStatus = installState === 'uninstalled'
    ? 'disabled'
    : health?.healthStatus ?? record?.healthStatus ?? 'unknown'
  const enabled = record?.enabled ?? false
  const quarantined = installState === 'quarantined' || verificationStatus === 'revoked'
  const derivedUpdate = deriveUpdateInput(record, catalogEntry, healthStatus)
  const updateState = update?.state ?? derivedUpdate.state
  const rollbackState = rollback?.state ?? (record?.previousKnownGood ? 'previous_known_good_metadata' : 'unavailable')
  const installedVersion = sanitizeNullableText(record?.installedVersion ?? record?.pluginVersion)
  const availableVersion = sanitizeNullableText(record?.availableVersion ?? catalogEntry?.pluginVersion)
  const releaseProvenance = record?.releaseProvenance ?? catalogEntry?.releaseProvenance ?? null
  const previousKnownGood = rollback?.previousKnownGood ?? record?.previousKnownGood ?? null
  const reasonCodes = uniqueCodes([
    ...(catalogEntry?.reasons ?? []),
    ...visibleCatalogWarnings(catalogEntry, verificationStatus),
    ...(record?.failureReason ? [record.failureReason] : []),
    ...(update?.reasonCodes ?? derivedUpdate.reasonCodes ?? []),
    ...(rollback?.reasonCodes ?? []),
    ...(health?.reasonCodes ?? []),
    ...(quarantined ? ['quarantined'] : []),
    ...(updateState === 'eligible_manual' ? ['manual_update_eligible'] : []),
    ...(updateState === 'up_to_date' ? ['up_to_date'] : []),
    ...(updateState === 'repair_available' ? ['repair_available'] : []),
    ...(updateState === 'update_available' ? ['update_available'] : []),
    ...(updateState === 'downgrade_blocked' || updateState === 'local_newer_than_catalog' ? ['downgrade_blocked'] : []),
    ...(rollbackState === 'previous_known_good_metadata' ? ['previous_known_good_metadata'] : []),
  ])

  return {
    id: sanitizePdpManagementText(pluginId, 'unknown'),
    displayName: sanitizePdpManagementText(catalogEntry?.displayName ?? pluginId, pluginId),
    publisher: sanitizePdpManagementText(catalogEntry?.publisher, 'Unknown publisher'),
    pluginVersion: sanitizePdpManagementText(catalogEntry?.pluginVersion ?? record?.pluginVersion, 'unknown'),
    installedVersion,
    availableVersion,
    packageVersion: sanitizeNullableText(record?.packageVersion ?? releaseProvenance?.packageVersion ?? record?.pluginVersion ?? catalogEntry?.pluginVersion),
    modelVersion: sanitizeNullableText(record?.modelVersion ?? releaseProvenance?.modelVersion ?? catalogEntry?.modelVersion),
    runtimeVersion: sanitizeNullableText(record?.runtimeVersion ?? releaseProvenance?.runtimeVersion),
    releaseProvenance,
    previousKnownGood,
    runtimeKind: sanitizePdpManagementText(record?.runtimeKind ?? catalogEntry?.runtimeKind, 'unknown'),
    capabilities: (catalogEntry?.capabilities ?? []).map((capability) =>
      sanitizePdpManagementText(capability, 'unknown')
    ),
    catalog: {
      present: Boolean(catalogEntry),
      readOnly: true,
      status: sanitizePdpManagementText(catalogEntry?.catalogStatus, 'not_present'),
      installabilityStatus: sanitizePdpManagementText(
        catalogEntry?.installabilityStatus,
        'unavailable_read_only'
      ),
    },
    registry: {
      present: Boolean(record),
      registryState: record ? sanitizePdpManagementText(record.registryState, 'unknown') : null,
      controlledRootKind: record ? sanitizePdpManagementText(record.controlledRootKind, 'unknown') : null,
      installSource: record ? sanitizePdpManagementText(record.installSource, 'unknown') : null,
    },
    status: {
      lifecycle: resolveLifecycleState(record, installState, enabled, quarantined),
      sourceKind: record?.installSource === 'manual_local' || record?.installSource === 'local_package'
        ? 'local_manual'
        : 'official_catalog',
      installState,
      verificationStatus,
      healthStatus,
      enabled,
      quarantined,
      updateState,
      rollbackState,
    },
    labels: reasonCodes.map(labelPdpReasonCode),
    reasonCodes,
    diagnostics: sanitizeDiagnostics(record?.diagnostics ?? []),
  }
}

function resolveLifecycleState(
  record: PdpManagementRegistryInput | null,
  installState: PluginInstallState,
  enabled: boolean,
  quarantined: boolean
): PdpManagementLifecycleState {
  if (!record) return 'catalog_only'
  if (installState === 'uninstalled') return 'uninstalled'
  if (quarantined || installState === 'failed') return 'blocked'
  if (enabled) return 'enabled'
  if (installState === 'disabled') return 'disabled'
  return 'registered'
}

function visibleCatalogWarnings(
  catalogEntry: PdpManagementCatalogInput | null,
  verificationStatus: PluginVerificationStatus
): readonly string[] {
  const warnings = catalogEntry?.warnings ?? []
  if (
    verificationStatus === 'verified' &&
    catalogEntry?.verificationMetadataStatus === 'production_signature_available'
  ) {
    return warnings.filter((warning) => warning !== 'cryptographic_verification_deferred')
  }
  return warnings
}

function deriveUpdateInput(
  record: PdpManagementRegistryInput | null,
  catalogEntry: PdpManagementCatalogInput | null,
  healthStatus: PluginHealthStatus
): PdpManagementUpdateInput {
  if (!record && catalogEntry) {
    return {
      pluginId: catalogEntry.pluginId,
      currentVersion: '',
      candidateVersion: catalogEntry.pluginVersion,
      state: 'install_available',
      reasonCodes: ['install_available'],
    }
  }
  if (!record || !catalogEntry || record.installSource !== 'official_catalog') {
    return {
      pluginId: record?.pluginId ?? catalogEntry?.pluginId ?? 'unknown',
      currentVersion: record?.pluginVersion ?? '',
      candidateVersion: catalogEntry?.pluginVersion ?? null,
      state: 'not_checked',
      reasonCodes: [],
    }
  }
  if (record.installState === 'uninstalled') {
    return {
      pluginId: record.pluginId,
      currentVersion: record.pluginVersion,
      candidateVersion: catalogEntry.pluginVersion,
      state: 'install_available',
      reasonCodes: ['install_available'],
    }
  }
  if (record.pluginVersion === catalogEntry.pluginVersion) {
    return {
      pluginId: record.pluginId,
      currentVersion: record.pluginVersion,
      candidateVersion: catalogEntry.pluginVersion,
      state: healthStatus === 'healthy' && record.installState === 'installed' ? 'up_to_date' : 'repair_available',
      reasonCodes: healthStatus === 'healthy' && record.installState === 'installed'
        ? ['up_to_date']
        : ['repair_available'],
    }
  }

  const eligibility = evaluatePdpUpdateEligibility(
    {
      pluginId: record.pluginId,
      pluginVersion: record.pluginVersion,
      runtimeKind: record.runtimeKind,
      channel: releaseChannel(record.releaseProvenance),
    },
    {
      pluginId: catalogEntry.pluginId,
      pluginVersion: catalogEntry.pluginVersion,
      runtimeKind: catalogEntry.runtimeKind,
      channel: releaseChannel(catalogEntry.releaseProvenance),
      compatibility: {
        platforms: [catalogEntry.platformCompatibility.declaredPlatform],
        architectures: [catalogEntry.architectureCompatibility.declaredArchitecture],
        starverseVersionRange: catalogEntry.appVersionCompatibility.declaredRange,
      },
      verificationStatus: catalogEntry.verificationMetadataStatus === 'production_signature_available' ? 'verified' : 'unverified',
      executableTrustApproved: catalogEntry.verificationMetadataStatus === 'production_signature_available',
      failureReason: null,
    },
    {
      platform: catalogEntry.platformCompatibility.declaredPlatform,
      architecture: catalogEntry.architectureCompatibility.declaredArchitecture,
      appVersion: '0.0.0',
      allowedChannel: releaseChannel(catalogEntry.releaseProvenance) ?? 'stable',
    }
  )
  if (eligibility.ok) {
    return {
      pluginId: record.pluginId,
      currentVersion: eligibility.currentVersion,
      candidateVersion: eligibility.candidateVersion,
      state: 'update_available',
      reasonCodes: ['update_available'],
    }
  }
  const downgrade = eligibility.failureReasons.includes('downgrade_blocked')
  return {
    pluginId: record.pluginId,
    currentVersion: record.pluginVersion,
    candidateVersion: catalogEntry.pluginVersion,
    state: downgrade ? 'local_newer_than_catalog' : 'ineligible',
    reasonCodes: downgrade ? ['downgrade_blocked'] : eligibility.failureReasons,
  }
}

function releaseChannel(provenance: PdpReleaseProvenanceInput | null | undefined): 'stable' | 'beta' | 'dev' | undefined {
  if (provenance?.channel === 'stable' || provenance?.channel === 'beta' || provenance?.channel === 'dev') {
    return provenance.channel
  }
  return undefined
}

function sanitizeNullableText(input: string | null | undefined): string | null {
  return sanitizePdpManagementText(input, '') || null
}

function uniqueCodes(values: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const code = sanitizePdpManagementText(value, '').replace(/[^a-z0-9._:-]/giu, '_')
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}

function sanitizeDiagnostics(values: readonly string[]): readonly string[] {
  return values
    .map((value) => sanitizePdpManagementText(value, ''))
    .filter((value): value is string => Boolean(value))
}

function pluginKey(pluginId: string, pluginVersion: string): string {
  return JSON.stringify([pluginId, pluginVersion])
}

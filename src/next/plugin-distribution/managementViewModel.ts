import { labelPdpReasonCode, sanitizePdpManagementText, type PdpManagementLabel } from './managementLabels'
import type { PdpPluginRegistryState } from './registryModel'
import type { PdpPreviousKnownGoodRef } from './rollbackPolicy'
import type { ReadOnlyCatalogDto, ReadOnlyCatalogEntryDto } from './catalogReadModel'
import type {
  PluginHealthStatus,
  PluginInstallState,
  PluginVerificationStatus,
} from './types'

export type PdpManagementSourceKind = 'official_catalog' | 'local_manual'
export type PdpManagementLifecycleState = 'catalog_only' | 'registered' | 'enabled' | 'disabled' | 'blocked'
export type PdpManagementUpdateState = 'not_checked' | 'eligible_manual' | 'staged_contract' | 'ineligible'
export type PdpManagementRollbackState = 'unavailable' | 'previous_known_good_metadata'

export type PdpManagementCatalogInput = Pick<
  ReadOnlyCatalogEntryDto,
  | 'pluginId'
  | 'displayName'
  | 'publisher'
  | 'pluginVersion'
  | 'runtimeKind'
  | 'capabilities'
  | 'installabilityStatus'
  | 'reasons'
  | 'warnings'
  | 'catalogStatus'
  | 'verificationMetadataStatus'
>

export type PdpManagementRegistryInput = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: string
  controlledRootKind: string
  installSource: string
  registryState: PdpPluginRegistryState
  installState: PluginInstallState
  verificationStatus: PluginVerificationStatus
  enabled: boolean
  healthStatus: PluginHealthStatus
  failureReason: string | null
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
  for (const record of records) {
    recordByKey.set(pluginKey(record.pluginId, record.pluginVersion), record)
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

  const keys = [...new Set([...catalogByKey.keys(), ...recordByKey.keys()])].sort()
  return {
    plugins: keys.map((key) => {
      const catalogEntry = catalogByKey.get(key) ?? null
      const record = recordByKey.get(key) ?? null
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
  const verificationStatus = record?.verificationStatus ?? 'unverified'
  const healthStatus = health?.healthStatus ?? record?.healthStatus ?? 'unknown'
  const enabled = record?.enabled ?? false
  const quarantined = installState === 'quarantined' || verificationStatus === 'revoked'
  const updateState = update?.state ?? 'not_checked'
  const rollbackState = rollback?.state ?? 'unavailable'
  const reasonCodes = uniqueCodes([
    ...(catalogEntry?.reasons ?? []),
    ...(catalogEntry?.warnings ?? []),
    ...(record?.failureReason ? [record.failureReason] : []),
    ...(update?.reasonCodes ?? []),
    ...(rollback?.reasonCodes ?? []),
    ...(health?.reasonCodes ?? []),
    ...(quarantined ? ['quarantined'] : []),
    ...(updateState === 'eligible_manual' ? ['manual_update_eligible'] : []),
    ...(rollbackState === 'previous_known_good_metadata' ? ['previous_known_good_metadata'] : []),
  ])

  return {
    id: sanitizePdpManagementText(pluginId, 'unknown'),
    displayName: sanitizePdpManagementText(catalogEntry?.displayName ?? pluginId, pluginId),
    publisher: sanitizePdpManagementText(catalogEntry?.publisher, 'Unknown publisher'),
    pluginVersion: sanitizePdpManagementText(record?.pluginVersion ?? catalogEntry?.pluginVersion, 'unknown'),
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
      sourceKind: record?.installSource === 'manual_local' ? 'local_manual' : 'official_catalog',
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
  if (quarantined || installState === 'failed') return 'blocked'
  if (enabled) return 'enabled'
  if (installState === 'disabled') return 'disabled'
  return 'registered'
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

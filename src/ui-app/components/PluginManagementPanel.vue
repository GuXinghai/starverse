<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  cancelInstallOperation,
  disablePlugin,
  enablePlugin,
  getDiagnosticsSummary,
  getInstallOperationStatus,
  importLibreOfficeSvpkg,
  installOfficialPlugin,
  listInstalledPlugins,
  listOfficialPlugins,
  quarantineLibreOfficeRuntime,
  runPluginHealthCheck,
  uninstallPlugin,
} from '@/next/files/enginePluginLifecycleClient'
import { getNetworkProxySettings } from '@/next/settings/networkProxySettingsClient'
import {
  DEFAULT_NETWORK_PROXY_SETTINGS,
  proxyModeLabel,
  type NetworkProxyMode,
} from '@/next/plugin-distribution/networkProxyShared'
import {
  pluginErrorChainDiagnosticLines,
  pluginErrorChainDetailRows,
  pluginPrimaryErrorDisplay,
} from '@/next/files/enginePluginErrorChain'
import {
  buildPluginManagementStateFromSources,
  buildPdpManagementDetailModel,
  buildPdpManagementViewModel,
  labelOfficialInstallOperationPhase,
  labelPdpHealthStatus,
  labelPdpInstallState,
  labelPdpVerificationStatus,
  sanitizePdpManagementText,
  type PdpManagementAction,
  type PdpManagementActionId,
  type PdpManagementCatalogInput,
  type PdpManagementDetailModel,
  type PdpManagementPluginViewModel,
  type PdpManagementRegistryInput,
  type PdpPluginManagementStateFromSources,
} from '@/next/plugin-distribution/browser'
import type {
  DecodedDiagnosticsSummary,
  DecodedOfficialInstallOperation,
  DecodedPluginErrorChain,
  DecodedInstalledPlugin,
  DecodedLifecycleInstalledResult,
  DecodedOfficialPlugin,
} from '@/next/ipc/contracts/enginePluginLifecycleContracts'
import type {
  PluginHealthStatus,
  PluginInstallState,
  PluginPackageCapability,
  PluginVerificationStatus,
} from '@/next/plugin-distribution/browser'

type PluginPanelRow = Readonly<{
  plugin: PdpManagementPluginViewModel
  engineId: string | null
  installOperation: DecodedOfficialInstallOperation | null
  registryRecord: PdpManagementRegistryInput | null
  managementState: PdpPluginManagementStateFromSources
}>

type UiAction = PdpManagementAction & Readonly<{ clickable: boolean }>

const DEFAULT_PLATFORM_COMPATIBILITY: PdpManagementCatalogInput['platformCompatibility'] = {
  declaredPlatform: 'any',
  compatible: false,
}
const DEFAULT_ARCHITECTURE_COMPATIBILITY: PdpManagementCatalogInput['architectureCompatibility'] = {
  declaredArchitecture: 'any',
  compatible: false,
}
const DEFAULT_APP_VERSION_COMPATIBILITY: PdpManagementCatalogInput['appVersionCompatibility'] = {
  declaredRange: '*',
  compatible: false,
}

const loading = ref(false)
const error = ref<string | null>(null)
const statusMessage = ref<string | null>(null)
const rows = ref<PluginPanelRow[]>([])
const diagnosticsSummary = ref<DecodedDiagnosticsSummary | null>(null)
const installOperations = ref<Record<string, DecodedOfficialInstallOperation>>({})
const selectedDetails = ref<PdpManagementDetailModel | null>(null)
const expandedErrorChains = ref<Record<string, boolean>>({})
const networkProxyMode = ref<NetworkProxyMode>(DEFAULT_NETWORK_PROXY_SETTINGS.proxyMode)
let installPollTimer: ReturnType<typeof setInterval> | null = null

const PANEL_ACTION_OPTIONS = {
  hasOfficialRemoteInstallContract: true,
  hasLocalManualRegistrationContract: false,
  hasPackageVerificationContract: false,
  hasHealthCheckContract: true,
  hasMetadataUninstallContract: true,
  hasEnableDisableContract: true,
  hasUpdateEligibilityContract: false,
  hasStageUpdateContract: false,
  hasRollbackMetadataContract: false,
  hasQuarantineAcknowledgementContract: false,
} as const

const summaryText = computed(() => {
  const counts = diagnosticsSummary.value?.counts
  if (!counts) return 'No diagnostics summary loaded.'
  return `${counts.installed} registered, ${counts.enabled} enabled, ${counts.healthy} healthy, ${counts.failed} failed`
})

onMounted(() => {
  void loadData()
})

onBeforeUnmount(() => {
  stopInstallPoller()
})

async function loadData(options?: Readonly<{ preserveMessages?: boolean; silent?: boolean }>): Promise<void> {
  if (!options?.silent) loading.value = true
  if (!options?.preserveMessages) {
    error.value = null
    statusMessage.value = null
  }

  try {
    const [official, initialInstalled, installOperation] = await Promise.all([
      listOfficialPlugins(),
      listInstalledPlugins(),
      loadInstallOperationStatus(),
    ])
    void refreshNetworkProxyMode()
    let installed = initialInstalled
    if (installOperation) {
      installOperations.value = {
        ...installOperations.value,
        [installOperationKey(installOperation.pluginId, installOperation.pluginVersion)]: installOperation,
      }
      if (installOperation.state === 'installed' && !hasInstalledPlugin(initialInstalled, installOperation)) {
        installed = await listInstalledPlugins()
      }
    }
    diagnosticsSummary.value = await loadDiagnosticsSummary()
    const catalogEntries = official.ok ? official.value.map(toCatalogEntry) : []
    const registryRecords = installed.map(toRegistryRecord)
    const viewModel = buildPdpManagementViewModel({
      catalogEntries,
      registryRecords,
      updates: installed.filter((item) => item.installState === 'update_available').map(toUpdateInput),
    })
    const catalogByKey = new Map(catalogEntries.map((entry) => [
      installOperationKey(entry.pluginId, entry.pluginVersion),
      entry,
    ]))
    const registryByKey = new Map(registryRecords.map((record) => [
      installOperationKey(record.pluginId, record.pluginVersion),
      record,
    ]))
    const officialRegistryByPlugin = new Map(registryRecords
      .filter((record) => record.installSource === 'official_catalog')
      .map((record) => [record.pluginId, record]))
    rows.value = viewModel.plugins.map((plugin) => {
      const key = installOperationKey(plugin.id, plugin.pluginVersion)
      const operation = installOperations.value[key] ?? null
      const registryRecord = registryByKey.get(key) ?? officialRegistryByPlugin.get(plugin.id) ?? null
      const managementState = buildPluginManagementStateFromSources({
        plugin,
        catalogEntry: catalogByKey.get(key) ?? null,
        registryRecord,
        installOperation: operation,
        actionOptions: PANEL_ACTION_OPTIONS,
      })
      return {
        plugin,
        engineId: registryRecord?.pluginId ?? null,
        installOperation: managementState.installOperation.visible ? operation : null,
        registryRecord,
        managementState,
      }
    })
    pruneSupersededInstallOperations(rows.value)
    if (rows.value.some((row) => row.managementState.installOperation.shouldPoll)) {
      ensureInstallPoller()
    } else {
      stopInstallPoller()
    }
    applyInstallOperationMessage()
    if (!official.ok) {
      error.value = sanitizePdpManagementText(official.reason, 'Official catalog unavailable')
    }
  } catch (err: any) {
    error.value = formatLifecycleError(err, 'Plugin management unavailable')
    rows.value = []
  } finally {
    if (!options?.silent) loading.value = false
  }
}

async function loadDiagnosticsSummary(): Promise<DecodedDiagnosticsSummary | null> {
  try {
    return await getDiagnosticsSummary()
  } catch {
    return null
  }
}

async function loadInstallOperationStatus(): Promise<DecodedOfficialInstallOperation | null> {
  try {
    const result = await getInstallOperationStatus()
    return result.ok ? result.value : null
  } catch {
    return null
  }
}

async function runAction(row: PluginPanelRow, action: UiAction): Promise<void> {
  if (!action.clickable || !action.enabled) return
  if (action.id === 'view_details') {
    selectedDetails.value = detailModelForRow(row)
    return
  }
  if (
    action.id !== 'install_official_plugin' &&
    action.id !== 'cancel_official_install' &&
    !(isLibreOfficeRow(row) && (action.id === 'manual_local_package_registration' || action.id === 'acknowledge_quarantine')) &&
    !row.engineId
  ) return
  if (action.id === 'uninstall_metadata' && !confirmUninstallAction(row)) return
  if (isLibreOfficeRow(row) && action.id === 'acknowledge_quarantine' && !confirmLibreOfficeQuarantineAction()) return

  const actionLabel = displayActionLabel(row, action)
  loading.value = true
  error.value = null
  statusMessage.value = null
  let localInstallKey: string | null = null
  try {
    if (action.id === 'install_official_plugin') {
      localInstallKey = installOperationKey(row.plugin.id, row.plugin.pluginVersion)
      const currentState = buildPluginManagementStateFromSources({
        plugin: row.plugin,
        registryRecord: row.registryRecord,
        installOperation: installOperations.value[localInstallKey] ?? row.installOperation,
        actionOptions: PANEL_ACTION_OPTIONS,
      })
      if (currentState.installOperation.active) {
        statusMessage.value = `${actionLabel}: ${installOperationLabel('downloading')}`
        return
      }
      statusMessage.value = `${actionLabel}: ${installOperationLabel('accepted')}`
      const result = await installOfficialPlugin({
        pluginId: row.plugin.id,
        pluginVersion: row.plugin.pluginVersion,
        enabled: false,
      })
      if (result.ok) {
        upsertInstallOperation(result.value)
        statusMessage.value = `${actionLabel}: ${installOperationSummary(result.value)}`
        if (buildPluginManagementStateFromSources({
          plugin: row.plugin,
          registryRecord: row.registryRecord,
          installOperation: result.value,
          actionOptions: PANEL_ACTION_OPTIONS,
        }).installOperation.active) {
          ensureInstallPoller()
        }
      } else {
        removeInstallOperation(localInstallKey)
        error.value = pluginPrimaryErrorDisplay(result.errorChain, result.reason)
      }
      return
    }
    if (action.id === 'cancel_official_install') {
      const operation = row.installOperation
      const result = await cancelInstallOperation({
        operationId: operation?.operationId,
        pluginId: row.plugin.id,
        pluginVersion: row.plugin.pluginVersion,
      })
      if (result.ok) {
        if (result.value) upsertInstallOperation(result.value)
        statusMessage.value = `${actionLabel}: ${installOperationLabel('cancelled')}`
      } else {
        error.value = pluginPrimaryErrorDisplay(result.errorChain, result.reason)
      }
      return
    }
    const result = await invokeLifecycleAction(action.id, row)
    if (result.ok) {
      statusMessage.value = `${actionLabel}: ${sanitizePdpManagementText(result.value.engineId, 'plugin')}`
    } else {
      error.value = pluginPrimaryErrorDisplay(result.errorChain, result.reason)
    }
  } catch (err: any) {
    if (localInstallKey) removeInstallOperation(localInstallKey)
    error.value = formatActionError(actionLabel, err)
  } finally {
    loading.value = false
    await loadData({ preserveMessages: true })
  }
}

async function invokeLifecycleAction(
  actionId: PdpManagementActionId,
  row: PluginPanelRow
): Promise<DecodedLifecycleInstalledResult> {
  const engineId = row.engineId
  if (isLibreOfficeRow(row) && actionId === 'manual_local_package_registration') return importLibreOfficeSvpkg()
  if (isLibreOfficeRow(row) && actionId === 'acknowledge_quarantine') return quarantineLibreOfficeRuntime()
  if (!engineId) {
    return { ok: false, reason: 'settings_action_not_wired', message: 'registered plugin id unavailable', errorChain: null }
  }
  if (actionId === 'enable') return enablePlugin({ engineId })
  if (actionId === 'disable') return disablePlugin({ engineId })
  if (actionId === 'uninstall_metadata') return uninstallPlugin({ engineId })
  if (actionId === 'check_health') return runPluginHealthCheck({ engineId })
  return { ok: false, reason: 'settings_action_not_wired', message: 'action unavailable in settings', errorChain: null }
}

function uiActions(row: PluginPanelRow): readonly UiAction[] {
  const clickable = new Set<PdpManagementActionId>([
    'view_details',
    'enable',
    'disable',
    'uninstall_metadata',
    'check_health',
    'install_official_plugin',
  ])
  return row.managementState.actions.actions.filter((action) =>
    action.id !== 'rollback_metadata' || row.plugin.status.rollbackState === 'previous_known_good_metadata'
  ).map((action) => {
    if (isLibreOfficeRow(row)) {
      if (
        action.id === 'view_details' ||
        action.id === 'install_official_plugin' ||
        action.id === 'cancel_official_install' ||
        action.id === 'check_health' ||
        action.id === 'manual_local_package_registration' ||
        action.id === 'disable' ||
        action.id === 'uninstall_metadata' ||
        action.id === 'acknowledge_quarantine'
      ) {
        return {
          ...action,
          enabled: (action.id === 'install_official_plugin' || action.id === 'cancel_official_install') ? action.enabled : true,
          clickable: (action.id === 'install_official_plugin' || action.id === 'cancel_official_install') ? action.enabled : true,
          label: libreOfficeActionLabel(action.id, action.label),
          reasonCodes: (action.id === 'install_official_plugin' || action.id === 'cancel_official_install') ? action.reasonCodes : [],
        }
      }
      return {
        ...action,
        enabled: false,
        clickable: false,
        reasonCodes: ['owner_gated_internal_control'],
      }
    }
    const isClickable = clickable.has(action.id)
    if (isClickable) {
      return {
        ...action,
        clickable: true,
      }
    }
    if (
      action.id === 'manual_local_package_registration' &&
      action.reasonCodes.includes('unsupported_action_contract_missing')
    ) {
      return {
        ...action,
        enabled: false,
        clickable: false,
        reasonCodes: ['local_registration_ui_not_wired'],
      }
    }
    return {
      ...action,
      enabled: false,
      clickable: false,
      reasonCodes: action.reasonCodes.length > 0
        ? action.reasonCodes
        : ['settings_action_not_wired'],
    }
  })
}

async function refreshNetworkProxyMode(): Promise<void> {
  try {
    networkProxyMode.value = (await getNetworkProxySettings()).proxyMode
  } catch {
    networkProxyMode.value = DEFAULT_NETWORK_PROXY_SETTINGS.proxyMode
  }
}

function isLibreOfficeRow(row: PluginPanelRow): boolean {
  return row.plugin.id === 'libreoffice' || row.engineId === 'libreoffice'
}

function displayActionLabel(row: PluginPanelRow, action: UiAction): string {
  if (isLibreOfficeRow(row)) {
    if (action.id === 'install_official_plugin' && row.installOperation?.state === 'paused_retryable') return 'Retry install'
    return libreOfficeActionLabel(action.id, action.label)
  }
  if (action.id === 'install_official_plugin') {
    if (row.plugin.status.updateState === 'repair_available') return 'Repair / Reinstall'
  }
  if (action.id === 'stage_update_contract' && row.plugin.status.updateState === 'update_available') return 'Update'
  if (action.id === 'rollback_metadata' && row.plugin.status.rollbackState !== 'previous_known_good_metadata') return 'Rollback unavailable'
  if (action.id !== 'uninstall_metadata') return action.label
  return isOfficialManagedMagikaRow(row) ? 'Uninstall plugin' : 'Remove registration'
}

function libreOfficeActionLabel(actionId: PdpManagementActionId, fallback: string): string {
  if (actionId === 'install_official_plugin') return 'Download / Install'
  if (actionId === 'cancel_official_install') return 'Cancel install'
  if (actionId === 'manual_local_package_registration') return 'Import .svpkg'
  if (actionId === 'check_health') return 'Recheck runtime'
  if (actionId === 'disable') return 'Disable runtime'
  if (actionId === 'uninstall_metadata') return 'Clear runtime'
  if (actionId === 'acknowledge_quarantine') return 'Quarantine runtime'
  return fallback
}

function isOfficialManagedMagikaRow(row: PluginPanelRow): boolean {
  return row.plugin.id === 'magika' &&
    row.registryRecord?.installSource === 'official_catalog' &&
    (row.registryRecord as PdpManagementRegistryInput & { installRootKind?: string }).installRootKind === 'managed_root'
}

function uninstallConfirmationMessage(row: PluginPanelRow): string {
  if (isOfficialManagedMagikaRow(row)) {
    return 'Uninstall plugin? This will delete Starverse-managed Magika plugin files, dependencies, and owned stage/tmp/rollback remnants. Detection will fall back to basic detection.'
  }
  return 'Remove registration? This only removes the plugin registration from Starverse. It will not delete external plugin files.'
}

function confirmUninstallAction(row: PluginPanelRow): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false
  if (isLibreOfficeRow(row)) {
    return window.confirm('Clear LibreOffice runtime? This removes the active managed runtime metadata and keeps DOCX PDF unavailable until a package is imported again.')
  }
  return window.confirm(uninstallConfirmationMessage(row))
}

function confirmLibreOfficeQuarantineAction(): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false
  return window.confirm('Quarantine LibreOffice runtime? DOCX PDF will remain blocked until a new valid package is imported.')
}

function toCatalogEntry(item: DecodedOfficialPlugin): PdpManagementCatalogInput {
  const installabilityStatus: PdpManagementCatalogInput['installabilityStatus'] =
    item.installState === 'not_installed' || item.installState === 'uninstalled'
      ? item.installabilityStatus
      : 'unavailable_read_only'
  return {
    pluginId: item.pluginId,
    displayName: item.displayName,
    publisher: item.publisher,
    pluginVersion: item.pluginVersion,
    platformCompatibility: item.platformCompatibility ?? DEFAULT_PLATFORM_COMPATIBILITY,
    architectureCompatibility: item.architectureCompatibility ?? DEFAULT_ARCHITECTURE_COMPATIBILITY,
    appVersionCompatibility: item.appVersionCompatibility ?? DEFAULT_APP_VERSION_COMPATIBILITY,
    modelVersion: item.modelVersion,
    packageSizeBytes: item.packageSizeBytes,
    runtimeKind: item.runtimeKind,
    capabilities: item.capabilities as readonly PluginPackageCapability[],
    installabilityStatus,
    reasons: item.reasons,
    warnings: visibleCatalogWarnings(item),
    catalogStatus: item.catalogStatus,
    verificationMetadataStatus: item.verificationMetadataStatus,
    releaseProvenance: item.releaseProvenance,
  }
}

function visibleCatalogWarnings(item: DecodedOfficialPlugin): readonly string[] {
  if (
    item.verificationMetadataStatus === 'production_signature_available' ||
    item.installState === 'installed'
  ) {
    return item.warnings.filter((warning) => warning !== 'cryptographic_verification_deferred')
  }
  return item.warnings
}

function toRegistryRecord(item: DecodedInstalledPlugin): PdpManagementRegistryInput {
  return {
    pluginId: item.engineId,
    pluginVersion: item.pluginVersion,
    installedVersion: item.installedVersion ?? item.pluginVersion,
    availableVersion: item.availableVersion ?? null,
    packageVersion: item.packageVersion ?? item.pluginVersion,
    runtimeKind: item.runtimeKind,
    runtimeVersion: item.runtimeVersion ?? null,
    modelVersion: item.modelVersion,
    controlledRootKind: item.installRootKind === 'test_root' ? 'dev_only' : 'user_local',
    installSource: item.installSource,
    installRootKind: item.installRootKind,
    registryState: mapRegistryState(item),
    installState: mapInstallState(item),
    verificationStatus: mapVerificationStatus(item),
    enabled: item.enabled,
    healthStatus: mapHealthStatus(item),
    failureReason: item.failureReason,
    errorChain: item.errorChain,
    releaseProvenance: item.releaseProvenance,
    previousKnownGood: item.previousKnownGood,
    productGate: item.productGate,
    updatedAt: item.updatedAt,
    diagnostics: item.failureReason ? [item.failureReason] : [],
  }
}

function toUpdateInput(item: DecodedInstalledPlugin) {
  return {
    pluginId: item.engineId,
    currentVersion: item.pluginVersion,
    candidateVersion: null,
    state: 'eligible_manual' as const,
    reasonCodes: ['manual_update_eligible'],
  }
}

function mapRegistryState(item: DecodedInstalledPlugin): PdpManagementRegistryInput['registryState'] {
  if (item.failureReason === 'revoked') return 'failed'
  if (item.installState === 'failed') return 'failed'
  if (item.installState === 'uninstalled') return 'uninstalled'
  if (item.enabled) return 'enabled'
  return 'disabled'
}

function mapInstallState(item: DecodedInstalledPlugin): PluginInstallState {
  if (item.failureReason === 'revoked') return 'quarantined'
  if (item.installState === 'failed') return 'failed'
  if (item.installState === 'uninstalled') return 'uninstalled'
  return 'installed'
}

function mapVerificationStatus(item: DecodedInstalledPlugin): PluginVerificationStatus {
  if (item.failureReason === 'revoked') return 'revoked'
  if (item.installState === 'failed') return 'failed'
  if (item.installState === 'uninstalled') return 'unverified'
  return item.lastVerifiedAt === null ? 'unverified' : 'verified'
}

function mapHealthStatus(item: DecodedInstalledPlugin): PluginHealthStatus {
  if (item.installState === 'uninstalled') return 'disabled'
  if (!item.enabled && item.healthStatus === 'unknown') return 'disabled'
  if (item.healthStatus === 'healthy') return 'healthy'
  if (item.healthStatus === 'unhealthy' || item.healthStatus === 'degraded') return 'failed'
  return 'unknown'
}

function actionReason(action: UiAction): string {
  return action.reasonCodes.join(', ')
}

function actionReasonText(action: UiAction): string {
  const labels = action.reasonCodes.map((code) => ACTION_REASON_LABELS[code] ?? humanizeReasonCode(code))
  return [...new Set(labels)].join('; ')
}

function registryFailurePrimary(row: PluginPanelRow): string | null {
  const failureReason = row.registryRecord?.failureReason ?? null
  if (!failureReason) return null
  return pluginPrimaryErrorDisplay(registryErrorChain(row), failureReason)
}

function registryErrorChain(row: PluginPanelRow): DecodedPluginErrorChain | null {
  return (row.registryRecord?.errorChain as DecodedPluginErrorChain | null | undefined) ?? null
}

function hasRegistryErrorChain(row: PluginPanelRow): boolean {
  return registryErrorChain(row) !== null
}

function registryErrorChainKey(row: PluginPanelRow): string {
  return installOperationKey(row.plugin.id, row.plugin.pluginVersion)
}

function isRegistryErrorChainExpanded(row: PluginPanelRow): boolean {
  return expandedErrorChains.value[registryErrorChainKey(row)] === true
}

function toggleRegistryErrorChain(row: PluginPanelRow): void {
  const key = registryErrorChainKey(row)
  expandedErrorChains.value = {
    ...expandedErrorChains.value,
    [key]: !isRegistryErrorChainExpanded(row),
  }
}

function registryErrorDetailRows(row: PluginPanelRow) {
  if (!row.registryRecord?.failureReason) return []
  return pluginErrorChainDetailRows(registryErrorChain(row), row.registryRecord?.failureReason ?? null)
}

function catalogStatusText(row: PluginPanelRow): string {
  if (!row.plugin.catalog.present) return 'Not present'
  const status = row.plugin.catalog.installabilityStatus
  if (status === 'unavailable_read_only') {
    return row.registryRecord && row.plugin.status.installState !== 'uninstalled'
      ? 'Remote install already used'
      : 'Built-in official plugin'
  }
  if (status === 'metadata_compatible_future_install') return 'Built-in official plugin'
  if (status === 'official_remote_install_available') return 'Built-in official plugin'
  return humanizeReasonCode(status)
}

function detailModelForRow(row: PluginPanelRow): PdpManagementDetailModel {
  return buildPdpManagementDetailModel({
    plugin: row.plugin,
    manifest: {
      pluginId: row.plugin.id,
      displayName: row.plugin.displayName,
      publisher: row.plugin.publisher,
      pluginVersion: row.plugin.pluginVersion,
      runtimeKind: row.plugin.runtimeKind,
      capabilities: row.plugin.capabilities as readonly PluginPackageCapability[],
    },
    catalog: {
      pluginId: row.plugin.catalog.present ? row.plugin.id : null,
      sourceKind: row.plugin.catalog.present ? 'official' : null,
      status: row.plugin.catalog.status,
    },
    verification: {
      status: row.plugin.status.verificationStatus,
      cryptographicVerificationPerformed: row.registryRecord?.verificationStatus === 'verified',
    },
    health: {
      status: row.plugin.status.healthStatus,
    },
    diagnostics: [
      ...(row.plugin.productGate ? productGateDiagnosticLines(row.plugin.productGate) : []),
      ...pluginErrorChainDiagnosticLines(registryErrorChain(row), row.registryRecord?.failureReason ?? null),
      ...(row.installOperation?.sanitizedDiagnostics ?? []),
      ...(row.installOperation?.diagnosticCode ? [row.installOperation.diagnosticCode] : []),
    ],
  })
}

function productGateDiagnosticLines(
  gate: NonNullable<PdpManagementPluginViewModel['productGate']>
): readonly string[] {
  return [
    `product_gate:${gate.status}`,
    `productionApproved:${gate.productionApproved ? 'true' : 'false'}`,
    `ownerGated:${gate.ownerGated ? 'true' : 'false'}`,
    `experimental:${gate.experimental ? 'true' : 'false'}`,
    `downloadEnabled:${gate.downloadEnabled === true ? 'true' : 'false'}`,
    ...(gate.trustModel ? [`trustModel:${gate.trustModel}`] : []),
    ...((gate.trustStates ?? []).map((state) => `trustState:${state}`)),
    ...((gate.distributionStates ?? []).map((state) => `distributionState:${state}`)),
    ...(gate.packageDecision ? [`packageDecision:${gate.packageDecision}`] : []),
    ...(gate.signatureCatalogStatus ? [`signatureCatalogStatus:${gate.signatureCatalogStatus}`] : []),
    ...(gate.catalogSignatureStatus ? [`catalogSignatureStatus:${gate.catalogSignatureStatus}`] : []),
    ...(gate.keyIdStatus ? [`keyIdStatus:${gate.keyIdStatus}`] : []),
    ...(gate.revocationStatus ? [`revocationStatus:${gate.revocationStatus}`] : []),
    ...(gate.expirationStatus ? [`expirationStatus:${gate.expirationStatus}`] : []),
    ...(gate.rollbackEligibility ? [`rollbackEligibility:${gate.rollbackEligibility}`] : []),
    ...(gate.productionTrustReadiness ? [`productionTrustReadiness:${gate.productionTrustReadiness}`] : []),
    ...(gate.ownerGatedCandidateReadiness ? [`ownerGatedCandidateReadiness:${gate.ownerGatedCandidateReadiness}`] : []),
    ...(gate.lastVerificationResult ? [`lastVerificationResult:${gate.lastVerificationResult}`] : []),
    ...(gate.productCode ? [`productCode:${gate.productCode}`] : []),
    ...(gate.internalCode ? [`internalCode:${gate.internalCode}`] : []),
  ]
}

function closeDetails(): void {
  selectedDetails.value = null
}

const ACTION_REASON_LABELS: Readonly<Record<string, string>> = {
  unsupported_action_contract_missing: 'Not available here',
  local_registration_ui_not_wired: 'Local registration is not available here',
  settings_action_not_wired: 'Not available here',
  official_remote_install_unavailable: 'Install not available',
  catalog_missing: 'Catalog metadata unavailable',
  already_registered: 'Already installed',
  not_registered: 'Not registered',
  not_installed: 'Not installed',
  uninstalled: 'Not installed',
  already_uninstalled: 'Already uninstalled',
  not_enabled: 'Not enabled',
  already_enabled: 'Already enabled',
  verification_required: 'Verification required',
  signature_missing: 'Signature missing',
  official_trusted_root_unconfigured: 'Trusted root unavailable',
  quarantined: 'Quarantined',
  revoked: 'Revoked',
  manual_update_not_eligible: 'No update available',
  previous_known_good_missing: 'No rollback point',
  not_quarantined: 'Not quarantined',
  install_in_progress: 'Install in progress',
  install_reconciling: 'Finishing install',
  download_disabled_by_policy: 'Download disabled by policy',
  owner_gated_internal_control: 'Owner-gated internal control',
}

function humanizeReasonCode(code: string): string {
  return sanitizePdpManagementText(code, 'Unavailable')
    .split(/[_:-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function displayOptional(value: string | null | undefined): string {
  return sanitizePdpManagementText(value, '') || 'Unknown'
}

function shortHash(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim()
  return /^[a-f0-9]{64}$/iu.test(normalized) ? `${normalized.slice(0, 8)}...` : 'Unknown'
}

function displayDate(value: string | null | undefined): string {
  const normalized = sanitizePdpManagementText(value, '')
  return normalized ? normalized.slice(0, 10) : 'Unknown'
}

function updateStatusText(row: PluginPanelRow): string {
  const state = row.plugin.status.updateState
  if (state === 'up_to_date') return 'Up to date'
  if (state === 'repair_available') return 'Repair available'
  if (state === 'update_available') return 'Update available'
  if (state === 'local_newer_than_catalog') return 'Local newer than catalog'
  if (state === 'downgrade_blocked') return 'Downgrade blocked'
  if (state === 'install_available') return 'Install available'
  return humanizeReasonCode(state)
}

function installOperationKey(pluginId: string, pluginVersion: string): string {
  return `${pluginId}:${pluginVersion}`
}

function upsertInstallOperation(operation: DecodedOfficialInstallOperation): void {
  const key = installOperationKey(operation.pluginId, operation.pluginVersion)
  installOperations.value = {
    ...installOperations.value,
    [key]: operation,
  }
  rows.value = rows.value.map((row) => (
    installOperationKey(row.plugin.id, row.plugin.pluginVersion) === key
      ? refreshRowManagementState({ ...row, installOperation: operation })
      : row
  ))
}

function removeInstallOperation(key: string): void {
  const next = { ...installOperations.value }
  delete next[key]
  installOperations.value = next
  rows.value = rows.value.map((row) => (
    installOperationKey(row.plugin.id, row.plugin.pluginVersion) === key
      ? refreshRowManagementState({ ...row, installOperation: null })
      : row
  ))
}

function refreshRowManagementState(row: PluginPanelRow): PluginPanelRow {
  const managementState = buildPluginManagementStateFromSources({
    plugin: row.plugin,
    registryRecord: row.registryRecord,
    installOperation: row.installOperation,
    actionOptions: PANEL_ACTION_OPTIONS,
  })
  return {
    ...row,
    managementState,
    installOperation: managementState.installOperation.visible ? row.installOperation : null,
  }
}

function hasInstalledPlugin(
  installed: readonly DecodedInstalledPlugin[],
  operation: DecodedOfficialInstallOperation
): boolean {
  return installed.some((item) =>
    item.engineId === operation.pluginId &&
    item.pluginVersion === operation.pluginVersion &&
    item.installState === 'installed'
  )
}

function installOperationLabel(state: DecodedOfficialInstallOperation['state']): string {
  return labelOfficialInstallOperationPhase(state)
}

function installOperationSummary(operation: DecodedOfficialInstallOperation): string {
  if (operation.progressSummary) return sanitizePdpManagementText(operation.progressSummary, installOperationLabel(operation.state))
  return installOperationLabel(operation.state)
}

function applyInstallOperationMessage(): void {
  const projections = rows.value
    .map((row) => row.managementState.installOperation)
    .filter((projection) => projection.visible)

  const active = projections.find((projection) => projection.active && projection.bannerMessage)
  if (active?.bannerMessage) {
    error.value = null
    statusMessage.value = active.bannerMessage
    return
  }

  const failed = projections.find((projection) => projection.errorMessage)
  if (failed?.errorMessage) {
    error.value = failed.errorMessage
    if (statusMessage.value?.startsWith('Install official plugin:')) {
      statusMessage.value = null
    }
    return
  }

  const reconciling = projections.find((projection) => projection.bannerMessage)
  if (reconciling?.bannerMessage) {
    error.value = null
    statusMessage.value = reconciling.bannerMessage
    return
  }

  if (statusMessage.value?.startsWith('Install official plugin:')) {
    statusMessage.value = null
  }
}

function pruneSupersededInstallOperations(nextRows: readonly PluginPanelRow[]): void {
  const next = { ...installOperations.value }
  let changed = false
  for (const row of nextRows) {
    if (!row.managementState.installOperation.superseded) continue
    const key = installOperationKey(row.plugin.id, row.plugin.pluginVersion)
    if (next[key]) {
      delete next[key]
      changed = true
    }
  }
  if (changed) installOperations.value = next
}

function installOperationFailureReason(operation: DecodedOfficialInstallOperation): string {
  return sanitizePdpManagementText(
    operation.diagnosticCode ?? operation.failureReason ?? '',
    ''
  )
}

function ensureInstallPoller(): void {
  if (installPollTimer) return
  installPollTimer = setInterval(() => {
    void loadData({ preserveMessages: true, silent: true })
  }, 1500)
}

function stopInstallPoller(): void {
  if (!installPollTimer) return
  clearInterval(installPollTimer)
  installPollTimer = null
}

function formatActionError(actionLabel: string, err: any): string {
  return formatLifecycleError(err, `${actionLabel} failed`, actionLabel)
}

function formatLifecycleError(err: any, fallback: string, actionLabel?: string): string {
  const raw = err?.message ?? String(err)
  if (/DbWorkerError|DB worker call timed out|fetch failed|stack trace/iu.test(raw)) {
    return actionLabel ? `${actionLabel} status unavailable` : fallback
  }
  return sanitizePdpManagementText(raw, fallback)
}
</script>

<template>
  <section class="rounded-lg border border-gray-200 bg-white p-3">
    <div class="flex items-center justify-between gap-2">
      <div>
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">Plugin Management</div>
        <div class="mt-1 text-[11px] text-gray-500">
          Built-in Magika installs through the official verify-before-install release path. LibreOffice Office-to-PDF is owner-gated and experimental.
        </div>
      </div>
      <button
        type="button"
        class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        :disabled="loading"
        @click="() => loadData()"
      >
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <div class="mt-3 space-y-2">
      <div v-if="error" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
        {{ error }}
      </div>
      <div v-else-if="statusMessage" class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
        {{ statusMessage }}
      </div>

      <div class="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
        {{ summaryText }}
      </div>

      <div v-if="rows.length === 0 && !loading" class="text-[11px] text-gray-500">
        No official plugins or registered plugin metadata available.
      </div>

      <article
        v-for="row in rows"
        :key="`${row.plugin.id}:${row.plugin.pluginVersion}`"
        class="rounded-md border border-gray-100 bg-white px-3 py-2"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-semibold text-gray-900">{{ row.plugin.displayName }}</div>
            <div class="text-[11px] text-gray-500">
              {{ row.plugin.id }} v{{ row.plugin.pluginVersion }} · official plugin
            </div>
            <div class="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] text-gray-500 sm:grid-cols-2">
              <div>Installed version: {{ displayOptional(row.plugin.installedVersion) }}</div>
              <div>Available version: {{ displayOptional(row.plugin.availableVersion) }}</div>
              <div>Model: {{ displayOptional(row.plugin.modelVersion) }}</div>
              <div>Runtime: {{ displayOptional(row.plugin.runtimeVersion) }}</div>
              <template v-if="row.plugin.productGate">
                <div>Product gate: {{ humanizeReasonCode(row.plugin.productGate.status) }}</div>
                <div>Approval: {{ row.plugin.productGate.productionApproved ? 'Production approved' : 'Not production approved' }}</div>
                <div>Download: {{ row.plugin.productGate.downloadEnabled ? 'Enabled' : 'Disabled by policy' }}</div>
                <div>Source: {{ displayOptional(row.plugin.productGate.source) }}</div>
                <div>Trust: {{ displayOptional(row.plugin.productGate.trustStates?.join(', ')) }}</div>
                <div>Distribution: {{ displayOptional(row.plugin.productGate.distributionStates?.join(', ')) }}</div>
                <div>Signature/catalog: {{ displayOptional(row.plugin.productGate.signatureCatalogStatus) }}</div>
                <div>Catalog signature: {{ displayOptional(row.plugin.productGate.catalogSignatureStatus) }}</div>
                <div>Key: {{ displayOptional(row.plugin.productGate.keyIdStatus) }}</div>
                <div>Revocation: {{ displayOptional(row.plugin.productGate.revocationStatus) }}</div>
                <div>Expiration: {{ displayOptional(row.plugin.productGate.expirationStatus) }}</div>
                <div>Rollback: {{ displayOptional(row.plugin.productGate.rollbackEligibility) }}</div>
                <div>Production trust: {{ displayOptional(row.plugin.productGate.productionTrustReadiness) }}</div>
                <div>Owner candidate: {{ displayOptional(row.plugin.productGate.ownerGatedCandidateReadiness) }}</div>
                <div>Package decision: {{ displayOptional(row.plugin.productGate.packageDecision) }}</div>
                <div>Approved platform: {{ displayOptional(row.plugin.productGate.approvedPlatform) }} / {{ displayOptional(row.plugin.productGate.approvedArch) }}</div>
                <div>Approved route: {{ displayOptional(row.plugin.productGate.approvedInput) }} to {{ displayOptional(row.plugin.productGate.approvedOutput) }}</div>
                <div>Approved acquisition: {{ displayOptional(row.plugin.productGate.approvedAcquisitionModes?.join(', ')) }}</div>
                <div>Automatic download: {{ row.plugin.productGate.automaticDownloadEnabled ? 'Enabled' : 'Disabled' }}</div>
                <div>Postinstall download: {{ row.plugin.productGate.postinstallDownloadEnabled ? 'Enabled' : 'Disabled' }}</div>
                <div>Conversion-time download: {{ row.plugin.productGate.conversionTimeDownloadEnabled ? 'Enabled' : 'Disabled' }}</div>
                <div>Platform packages: {{ displayOptional(row.plugin.productGate.platformPackageStatus) }}</div>
                <div>Diagnostic: {{ displayOptional(row.plugin.productGate.productCode ?? row.plugin.productGate.internalCode) }}</div>
              </template>
              <div>Signature key: {{ displayOptional(row.plugin.releaseProvenance?.trustKeyId) }}</div>
              <div>Package hash: {{ shortHash(row.plugin.releaseProvenance?.packageSha256) }}</div>
              <div>Inventory hash: {{ shortHash(row.plugin.releaseProvenance?.inventorySha256) }}</div>
              <div>Signed: {{ displayDate(row.plugin.releaseProvenance?.signedAt) }}</div>
              <div>Expires: {{ displayDate(row.plugin.releaseProvenance?.expiresAt) }}</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-1">
            <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
              {{ labelPdpInstallState(row.plugin.status.installState).label }}
            </span>
            <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
              {{ labelPdpVerificationStatus(row.plugin.status.verificationStatus).label }}
            </span>
            <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
              {{ labelPdpHealthStatus(row.plugin.status.healthStatus).label }}
            </span>
          </div>
        </div>

        <div class="mt-2 grid gap-1 text-[11px] text-gray-600 sm:grid-cols-2">
          <div>Catalog: {{ catalogStatusText(row) }}</div>
          <div>Lifecycle: {{ row.plugin.status.lifecycle }}</div>
          <div>Update: {{ updateStatusText(row) }}</div>
          <div>Rollback: {{ row.plugin.status.rollbackState }}</div>
          <div v-if="registryFailurePrimary(row)" class="flex items-center gap-2">
            <span>Failure: {{ registryFailurePrimary(row) }}</span>
            <button
              v-if="hasRegistryErrorChain(row)"
              type="button"
              class="text-[10px] font-medium text-red-700 underline decoration-red-300 underline-offset-2 hover:text-red-900"
              @click="toggleRegistryErrorChain(row)"
            >
              {{ isRegistryErrorChainExpanded(row) ? 'Hide details' : 'Details' }}
            </button>
          </div>
          <template v-if="hasRegistryErrorChain(row) && isRegistryErrorChainExpanded(row)">
            <div
              v-for="detail in registryErrorDetailRows(row)"
              :key="detail.label"
            >
              {{ detail.label }}: {{ detail.value }}
            </div>
          </template>
          <div v-if="row.installOperation">
            Install: {{ installOperationSummary(row.installOperation) }}
          </div>
          <div v-if="row.installOperation?.failureReason">
            Failure: {{ installOperationFailureReason(row.installOperation) }}
          </div>
          <template v-if="row.plugin.productGate">
            <div>Owner gate: {{ row.plugin.productGate.ownerGated ? 'Enabled' : 'Not required' }}</div>
            <div>Experimental: {{ row.plugin.productGate.experimental ? 'Enabled' : 'Disabled' }}</div>
            <div>Fallback targets: {{ row.plugin.productGate.fallbackTargetKinds.join(', ') || 'None' }}</div>
            <div>Gate message: {{ row.plugin.productGate.message }}</div>
          </template>
          <template v-if="isLibreOfficeRow(row)">
            <div>Manual install: Downloads LibreOffice runtime package from GitHub</div>
            <div>Network mode: {{ proxyModeLabel(networkProxyMode) }}</div>
            <div>Downloader proxy: Uses Network Proxy settings</div>
            <div>Download trigger: User-initiated only</div>
            <div>Conversion download: Disabled</div>
            <div>Runtime scope: Windows x64 DOCX-to-PDF production approved when package gate is valid; macOS/Linux package pending</div>
            <div>Activation: Package is verified before activation</div>
          </template>
        </div>

        <div v-if="row.plugin.reasonCodes.length > 0" class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="label in row.plugin.labels"
            :key="label.code"
            class="rounded bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700"
          >
            {{ label.label }}
          </span>
        </div>

        <div class="mt-2 flex flex-wrap gap-1">
          <button
            v-for="action in uiActions(row)"
            :key="action.id"
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="loading || !action.enabled || !action.clickable || (action.id !== 'install_official_plugin' && action.id !== 'cancel_official_install' && action.id !== 'view_details' && !(isLibreOfficeRow(row) && (action.id === 'manual_local_package_registration' || action.id === 'acknowledge_quarantine')) && !row.engineId)"
            :title="action.enabled ? displayActionLabel(row, action) : actionReasonText(action)"
            :data-reason-codes="!action.enabled ? actionReason(action) : undefined"
            @click="runAction(row, action)"
          >
            {{ displayActionLabel(row, action) }}
            <span v-if="!action.enabled" class="ml-1 text-gray-400">({{ actionReasonText(action) }})</span>
          </button>
        </div>
      </article>
    </div>

    <div
      v-if="selectedDetails"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plugin-details-title"
    >
      <div class="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-4 shadow-lg">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 id="plugin-details-title" class="text-sm font-semibold text-gray-900">
              {{ selectedDetails.identity.displayName }}
            </h2>
            <div class="mt-1 text-[11px] text-gray-500">
              {{ selectedDetails.identity.pluginId }} v{{ selectedDetails.identity.pluginVersion }}
            </div>
          </div>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
            @click="closeDetails"
          >
            Close
          </button>
        </div>

        <div class="mt-4 grid gap-3 text-[11px] text-gray-700 sm:grid-cols-2">
          <section>
            <div class="font-semibold text-gray-900">Sanitized metadata</div>
            <dl class="mt-1 space-y-1">
              <div>Publisher: {{ selectedDetails.identity.publisher }}</div>
              <div>Runtime: {{ selectedDetails.identity.runtimeKind }}</div>
              <div>Capabilities: {{ selectedDetails.identity.capabilities.join(', ') || 'Unavailable' }}</div>
              <div>Catalog: {{ selectedDetails.catalog.present ? selectedDetails.catalog.status : 'not_present' }}</div>
            </dl>
          </section>

          <section>
            <div class="font-semibold text-gray-900">Verification</div>
            <dl class="mt-1 space-y-1">
              <div>Status: {{ selectedDetails.verification.label.label }}</div>
              <div>Cryptographic check: {{ selectedDetails.verification.cryptographicVerificationPerformed ? 'Completed' : 'Not completed' }}</div>
              <div>Signature: {{ selectedDetails.verification.signatureAlgorithm.label }}</div>
            </dl>
          </section>

          <section>
            <div class="font-semibold text-gray-900">Health</div>
            <dl class="mt-1 space-y-1">
              <div>Status: {{ selectedDetails.health.label.label }}</div>
              <div>Quarantine: {{ selectedDetails.quarantine.label }}</div>
            </dl>
          </section>

          <section>
            <div class="font-semibold text-gray-900">Diagnostics</div>
            <div v-if="selectedDetails.diagnostics.length === 0" class="mt-1">No diagnostics.</div>
            <ul v-else class="mt-1 space-y-1">
              <li v-for="diagnostic in selectedDetails.diagnostics" :key="diagnostic">{{ diagnostic }}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </section>
</template>

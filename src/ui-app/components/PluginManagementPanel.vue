<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  disablePlugin,
  enablePlugin,
  getDiagnosticsSummary,
  getInstallOperationStatus,
  installOfficialPlugin,
  listInstalledPlugins,
  listOfficialPlugins,
  runPluginHealthCheck,
  uninstallPlugin,
} from '@/next/files/enginePluginLifecycleClient'
import {
  buildPluginManagementStateFromSources,
  buildPdpManagementViewModel,
  labelOfficialInstallOperationPhase,
  labelPdpHealthStatus,
  labelPdpInstallState,
  labelPdpVerificationStatus,
  sanitizePdpManagementText,
  type PdpManagementAction,
  type PdpManagementActionId,
  type PdpManagementCatalogInput,
  type PdpManagementPluginViewModel,
  type PdpManagementRegistryInput,
  type PdpPluginManagementStateFromSources,
} from '@/next/plugin-distribution/browser'
import type {
  DecodedDiagnosticsSummary,
  DecodedOfficialInstallOperation,
  DecodedInstalledPlugin,
  DecodedLifecycleInstalledResult,
  DecodedOfficialPlugin,
} from '@/next/ipc/contracts/enginePluginLifecycleContracts'
import type {
  PluginHealthStatus,
  PluginInstallState,
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

const loading = ref(false)
const error = ref<string | null>(null)
const statusMessage = ref<string | null>(null)
const rows = ref<PluginPanelRow[]>([])
const diagnosticsSummary = ref<DecodedDiagnosticsSummary | null>(null)
const installOperations = ref<Record<string, DecodedOfficialInstallOperation>>({})
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
    rows.value = viewModel.plugins.map((plugin) => {
      const key = installOperationKey(plugin.id, plugin.pluginVersion)
      const operation = installOperations.value[key] ?? null
      const managementState = buildPluginManagementStateFromSources({
        plugin,
        catalogEntry: catalogByKey.get(key) ?? null,
        registryRecord: registryByKey.get(key) ?? null,
        installOperation: operation,
        actionOptions: PANEL_ACTION_OPTIONS,
      })
      return {
        plugin,
        engineId: installed.find((item) =>
          item.engineId === plugin.id && item.pluginVersion === plugin.pluginVersion
        )?.engineId ?? null,
        installOperation: managementState.installOperation.visible ? operation : null,
        registryRecord: registryByKey.get(key) ?? null,
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
  if (action.id !== 'install_official_plugin' && !row.engineId) return

  const actionLabel = displayActionLabel(row, action)
  if (action.id === 'uninstall_metadata' && !confirmUninstallAction(row)) return

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
        error.value = sanitizePdpManagementText(result.reason, `${actionLabel} failed`)
      }
      return
    }
    const result = await invokeLifecycleAction(action.id, row)
    if (result.ok) {
      statusMessage.value = `${actionLabel}: ${sanitizePdpManagementText(result.value.engineId, 'plugin')}`
    } else {
      error.value = sanitizePdpManagementText(result.reason, `${actionLabel} failed`)
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
  if (!engineId) {
    return { ok: false, reason: 'settings_action_not_wired', message: 'registered plugin id unavailable' }
  }
  if (actionId === 'enable') return enablePlugin({ engineId })
  if (actionId === 'disable') return disablePlugin({ engineId })
  if (actionId === 'uninstall_metadata') return uninstallPlugin({ engineId })
  if (actionId === 'check_health') return runPluginHealthCheck({ engineId })
  return { ok: false, reason: 'settings_action_not_wired', message: 'action unavailable in settings' }
}

function uiActions(row: PluginPanelRow): readonly UiAction[] {
  const clickable = new Set<PdpManagementActionId>([
    'enable',
    'disable',
    'uninstall_metadata',
    'check_health',
    'install_official_plugin',
  ])
  return row.managementState.actions.actions.map((action) => {
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

function toCatalogEntry(item: DecodedOfficialPlugin): PdpManagementCatalogInput {
  return {
    pluginId: item.pluginId,
    displayName: item.displayName,
    publisher: item.publisher,
    pluginVersion: item.pluginVersion,
    runtimeKind: item.runtimeKind,
    capabilities: item.capabilities,
    installabilityStatus: item.installState === 'not_installed' || item.installState === 'uninstalled'
      ? item.installabilityStatus
      : 'unavailable_read_only',
    reasons: item.reasons,
    warnings: item.warnings,
    catalogStatus: item.catalogStatus,
    verificationMetadataStatus: item.verificationMetadataStatus,
  }
}

function toRegistryRecord(item: DecodedInstalledPlugin): PdpManagementRegistryInput {
  return {
    pluginId: item.engineId,
    pluginVersion: item.pluginVersion,
    runtimeKind: item.runtimeKind,
    controlledRootKind: item.installRootKind === 'test_root' ? 'dev_only' : 'user_local',
    installSource: item.installSource,
    installRootKind: item.installRootKind,
    registryState: mapRegistryState(item),
    installState: mapInstallState(item),
    verificationStatus: mapVerificationStatus(item),
    enabled: item.enabled,
    healthStatus: mapHealthStatus(item),
    failureReason: item.failureReason,
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

function displayActionLabel(row: PluginPanelRow, action: UiAction): string {
  if (action.id !== 'uninstall_metadata') return action.label
  return isOfficialManagedMagikaRow(row) ? 'Uninstall plugin' : 'Remove registration'
}

function isOfficialManagedMagikaRow(row: PluginPanelRow): boolean {
  return row.plugin.id === 'magika' &&
    row.registryRecord?.installSource === 'official_catalog' &&
    row.registryRecord.installRootKind === 'managed_root'
}

function confirmUninstallAction(row: PluginPanelRow): boolean {
  return window.confirm(uninstallConfirmationMessage(row))
}

function uninstallConfirmationMessage(row: PluginPanelRow): string {
  if (isOfficialManagedMagikaRow(row)) {
    return 'Uninstall plugin? This will delete Starverse-managed Magika runtime, dependencies, and owned stage/tmp/rollback remnants. Detection will use basic detection until Magika is installed again.'
  }
  return 'Remove registration? This only removes the plugin registration from Starverse and will not delete external files.'
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
          Built-in Magika installs through the official verify-before-install release path.
        </div>
      </div>
      <button
        type="button"
        class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        :disabled="loading"
        @click="loadData"
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
          <div>Catalog: {{ row.plugin.catalog.present ? row.plugin.catalog.installabilityStatus : 'not_present' }}</div>
          <div>Lifecycle: {{ row.plugin.status.lifecycle }}</div>
          <div>Update: {{ row.plugin.status.updateState }}</div>
          <div>Rollback: {{ row.plugin.status.rollbackState }}</div>
          <div v-if="row.installOperation">
            Install: {{ installOperationSummary(row.installOperation) }}
          </div>
          <div v-if="row.installOperation?.failureReason">
            Failure: {{ installOperationFailureReason(row.installOperation) }}
          </div>
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
            :disabled="loading || !action.enabled || !action.clickable || (action.id !== 'install_official_plugin' && !row.engineId)"
            :title="action.enabled ? displayActionLabel(row, action) : actionReason(action)"
            @click="runAction(row, action)"
          >
            {{ displayActionLabel(row, action) }}
            <span v-if="!action.enabled" class="ml-1 text-gray-400">({{ actionReason(action) }})</span>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

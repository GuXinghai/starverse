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
  buildPdpManagementActions,
  buildPdpManagementViewModel,
  labelPdpHealthStatus,
  labelPdpInstallState,
  labelPdpVerificationStatus,
  sanitizePdpManagementText,
  type PdpManagementAction,
  type PdpManagementActionId,
  type PdpManagementCatalogInput,
  type PdpManagementPluginViewModel,
  type PdpManagementRegistryInput,
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
}>

type UiAction = PdpManagementAction & Readonly<{ clickable: boolean }>

const loading = ref(false)
const error = ref<string | null>(null)
const statusMessage = ref<string | null>(null)
const rows = ref<PluginPanelRow[]>([])
const diagnosticsSummary = ref<DecodedDiagnosticsSummary | null>(null)
const installOperations = ref<Record<string, DecodedOfficialInstallOperation>>({})
let installPollTimer: ReturnType<typeof setInterval> | null = null

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
    const [official, installed, installOperation] = await Promise.all([
      listOfficialPlugins(),
      listInstalledPlugins(),
      loadInstallOperationStatus(),
    ])
    if (installOperation) {
      installOperations.value = {
        ...installOperations.value,
        [installOperationKey(installOperation.pluginId, installOperation.pluginVersion)]: installOperation,
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
    rows.value = viewModel.plugins.map((plugin) => ({
      plugin,
      engineId: installed.find((item) =>
        item.engineId === plugin.id && item.pluginVersion === plugin.pluginVersion
      )?.engineId ?? null,
      installOperation: installOperations.value[installOperationKey(plugin.id, plugin.pluginVersion)] ?? null,
    }))
    if (rows.value.some((row) => isActiveInstallOperation(row.installOperation))) {
      ensureInstallPoller()
    } else {
      stopInstallPoller()
    }
    if (!official.ok) {
      error.value = sanitizePdpManagementText(official.reason, 'Official catalog unavailable')
    }
  } catch (err: any) {
    error.value = sanitizePdpManagementText(err?.message ?? String(err), 'Plugin management unavailable')
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

  loading.value = true
  error.value = null
  statusMessage.value = null
  try {
    if (action.id === 'install_official_plugin') {
      const result = await installOfficialPlugin({
        pluginId: row.plugin.id,
        pluginVersion: row.plugin.pluginVersion,
        enabled: false,
      })
      if (result.ok) {
        installOperations.value = {
          ...installOperations.value,
          [installOperationKey(result.value.pluginId, result.value.pluginVersion)]: result.value,
        }
        statusMessage.value = `${action.label}: ${installOperationLabel(result.value.state)}`
        ensureInstallPoller()
      } else {
        error.value = sanitizePdpManagementText(result.reason, `${action.label} failed`)
      }
      return
    }
    const result = await invokeLifecycleAction(action.id, row)
    if (result.ok) {
      statusMessage.value = `${action.label}: ${sanitizePdpManagementText(result.value.engineId, 'plugin')}`
    } else {
      error.value = sanitizePdpManagementText(result.reason, `${action.label} failed`)
    }
  } catch (err: any) {
    error.value = formatActionError(action, err)
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
  const plugin = row.plugin
  const clickable = new Set<PdpManagementActionId>([
    'enable',
    'disable',
    'uninstall_metadata',
    'check_health',
    'install_official_plugin',
  ])
  const actionSet = buildPdpManagementActions(plugin, {
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
  })
  return actionSet.actions.map((action) => {
    const isClickable = clickable.has(action.id)
    if (isClickable) {
      const installInProgress = action.id === 'install_official_plugin' &&
        isActiveInstallOperation(row.installOperation)
      return {
        ...action,
        enabled: installInProgress ? false : action.enabled,
        clickable: true,
        reasonCodes: installInProgress ? ['install_in_progress'] : action.reasonCodes,
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
    registryState: mapRegistryState(item),
    installState: mapInstallState(item),
    verificationStatus: mapVerificationStatus(item),
    enabled: item.enabled,
    healthStatus: mapHealthStatus(item),
    failureReason: item.failureReason,
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

function installOperationKey(pluginId: string, pluginVersion: string): string {
  return `${pluginId}:${pluginVersion}`
}

function isActiveInstallOperation(operation: DecodedOfficialInstallOperation | null): boolean {
  return Boolean(operation && [
    'pending',
    'downloading',
    'verifying',
    'registering',
    'health_checking',
  ].includes(operation.state))
}

function installOperationLabel(state: DecodedOfficialInstallOperation['state']): string {
  if (state === 'pending') return 'Install pending'
  if (state === 'downloading') return 'Downloading'
  if (state === 'verifying') return 'Verifying package'
  if (state === 'registering') return 'Registering'
  if (state === 'health_checking') return 'Checking health'
  if (state === 'installed') return 'Installed'
  if (state === 'failed') return 'Install failed'
  return 'Install cancelled'
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

function formatActionError(action: UiAction, err: any): string {
  const raw = err?.message ?? String(err)
  if (action.id === 'install_official_plugin' && /DB worker call timed out/iu.test(raw)) {
    return `${action.label} status unavailable`
  }
  return sanitizePdpManagementText(raw, `${action.label} failed`)
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
            Install: {{ installOperationLabel(row.installOperation.state) }}
          </div>
          <div v-if="row.installOperation?.failureReason">
            Failure: {{ sanitizePdpManagementText(row.installOperation.failureReason, 'install_failed') }}
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
            :title="action.enabled ? action.label : actionReason(action)"
            @click="runAction(row, action)"
          >
            {{ action.label }}
            <span v-if="!action.enabled" class="ml-1 text-gray-400">({{ actionReason(action) }})</span>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  listOfficialPlugins,
  listInstalledPlugins,
  registerLocalOfficialPlugin,
  enablePlugin,
  disablePlugin,
  uninstallPlugin,
  runPluginHealthCheck,
} from '@/next/files/enginePluginLifecycleClient'
import {
  pluginErrorChainDetailRows,
  pluginPrimaryErrorDisplay,
} from '@/next/files/enginePluginErrorChain'
import type {
  DecodedLifecycleListOfficialResult,
  DecodedInstalledPlugin,
} from '@/next/ipc/contracts/enginePluginLifecycleContracts'

type OfficialRow = Readonly<{
  pluginId: string
  pluginVersion: string
  availableVersion?: string
  modelVersion: string | null
  catalogGeneratedAt: string | null
  installState: string
  enabled: boolean
  recommendedInstallRootKind: 'managed_root' | 'test_root'
  releaseProvenance: DecodedInstalledPlugin['releaseProvenance']
}>

const loading = ref(false)
const error = ref<string | null>(null)
const statusMessage = ref<string | null>(null)
const trustRootUnconfigured = ref(false)

const officialRows = ref<OfficialRow[]>([])
const installedRows = ref<DecodedInstalledPlugin[]>([])
const expandedErrorChains = ref<Record<string, boolean>>({})

function isTrustRootUnconfigured(result: DecodedLifecycleListOfficialResult): boolean {
  return !result.ok && result.reason === 'official_trusted_root_unconfigured'
}

async function loadData() {
  error.value = null
  statusMessage.value = null
  loading.value = true
  trustRootUnconfigured.value = false

  try {
    const official = await listOfficialPlugins()
    if (isTrustRootUnconfigured(official)) {
      trustRootUnconfigured.value = true
      officialRows.value = []
    } else if (official.ok) {
      officialRows.value = official.value.map((item) => ({
        ...item,
        installState: item.installState,
      }))
    } else {
      error.value = official.reason ?? 'unknown error'
    }

    const installed = await listInstalledPlugins()
    installedRows.value = installed
  } catch (err: any) {
    error.value = err?.message ?? String(err)
  } finally {
    loading.value = false
  }
}

async function doRegister(pluginId: string, pluginVersion: string, recommendedInstallRootKind: 'managed_root' | 'test_root') {
  error.value = null
  statusMessage.value = null
  loading.value = true
  try {
    const result = await registerLocalOfficialPlugin({
      pluginId,
      pluginVersion,
      installRootKind: recommendedInstallRootKind,
      installRef: `plugin_${pluginId}_${pluginVersion.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      enabled: false,
    })
    if (result.ok) {
      statusMessage.value = `Registered: ${result.value.engineId}`
    } else {
      error.value = result.reason ?? 'registration failed'
    }
  } catch (err: any) {
    error.value = err?.message ?? String(err)
  } finally {
    loading.value = false
    await loadData()
  }
}

async function doEnable(engineId: string) {
  error.value = null
  statusMessage.value = null
  loading.value = true
  try {
    const result = await enablePlugin({ engineId })
    if (result.ok) {
      statusMessage.value = `Enabled: ${engineId}`
    } else {
      error.value = result.reason ?? 'enable failed'
    }
  } catch (err: any) {
    error.value = err?.message ?? String(err)
  } finally {
    loading.value = false
    await loadData()
  }
}

async function doDisable(engineId: string) {
  error.value = null
  statusMessage.value = null
  loading.value = true
  try {
    const result = await disablePlugin({ engineId })
    if (result.ok) {
      statusMessage.value = `Disabled: ${engineId}`
    } else {
      error.value = result.reason ?? 'disable failed'
    }
  } catch (err: any) {
    error.value = err?.message ?? String(err)
  } finally {
    loading.value = false
    await loadData()
  }
}

async function doUninstall(item: DecodedInstalledPlugin) {
  if (!confirmUninstall(item)) return
  const engineId = item.engineId
  const actionLabel = uninstallActionLabel(item)
  error.value = null
  statusMessage.value = null
  loading.value = true
  let failureMessage: string | null = null
  try {
    const result = await uninstallPlugin({ engineId })
    if (result.ok) {
      statusMessage.value = `${actionLabel}: ${engineId}`
    } else {
      failureMessage = pluginPrimaryErrorDisplay(result.errorChain, result.reason)
      error.value = failureMessage
    }
  } catch (err: any) {
    failureMessage = err?.message ?? String(err)
    error.value = failureMessage
  } finally {
    loading.value = false
    await loadData()
    if (failureMessage) error.value = failureMessage
  }
}

function isOfficialManagedMagika(item: DecodedInstalledPlugin): boolean {
  return item.engineId === 'magika' &&
    item.installSource === 'official_catalog' &&
    item.installRootKind === 'managed_root'
}

function uninstallActionLabel(item: DecodedInstalledPlugin): string {
  return isOfficialManagedMagika(item) ? 'Uninstall plugin' : 'Remove registration'
}

function uninstallConfirmationMessage(item: DecodedInstalledPlugin): string {
  if (isOfficialManagedMagika(item)) {
    return 'Uninstall plugin? This will delete Starverse-managed Magika plugin files, dependencies, and owned stage/tmp/rollback remnants. Detection will fall back to basic detection.'
  }
  return 'Remove registration? This only removes the plugin registration from Starverse. It will not delete external plugin files.'
}

function confirmUninstall(item: DecodedInstalledPlugin): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false
  return window.confirm(uninstallConfirmationMessage(item))
}

async function doHealthCheck(engineId: string) {
  error.value = null
  statusMessage.value = null
  loading.value = true
  let failureMessage: string | null = null
  try {
    const result = await runPluginHealthCheck({ engineId })
    if (result.ok) {
      statusMessage.value = `Health check: ${result.value.healthStatus}`
    } else {
      failureMessage = pluginPrimaryErrorDisplay(result.errorChain, result.reason)
      error.value = failureMessage
    }
  } catch (err: any) {
    failureMessage = err?.message ?? String(err)
    error.value = failureMessage
  } finally {
    loading.value = false
    await loadData()
    if (failureMessage) error.value = failureMessage
  }
}

function hasErrorChain(item: DecodedInstalledPlugin): boolean {
  return item.errorChain !== null && item.errorChain !== undefined
}

function isErrorChainExpanded(engineId: string): boolean {
  return expandedErrorChains.value[engineId] === true
}

function toggleErrorChain(engineId: string): void {
  expandedErrorChains.value = {
    ...expandedErrorChains.value,
    [engineId]: !isErrorChainExpanded(engineId),
  }
}

function displayOptional(value: string | null | undefined): string {
  return String(value ?? '').trim() || 'Unknown'
}

function shortHash(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim()
  return /^[a-f0-9]{64}$/iu.test(normalized) ? `${normalized.slice(0, 8)}...` : 'Unknown'
}

function displayDate(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized.slice(0, 10) : 'Unknown'
}

function versionStatus(item: DecodedInstalledPlugin): string {
  if (item.installSource !== 'official_catalog') return 'Local registration'
  const installedVersion = item.installedVersion ?? item.pluginVersion
  const availableVersion = item.availableVersion ?? null
  if (!availableVersion) return 'Not checked'
  if (installedVersion === availableVersion) {
    return item.installState === 'installed' && item.healthStatus === 'healthy'
      ? 'Up to date'
      : 'Repair available'
  }
  return installedVersion < availableVersion ? 'Update available' : 'Local newer than catalog'
}

onMounted(() => {
  void loadData()
})
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white p-3">
    <div class="flex items-center justify-between gap-2">
      <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">Official Engines</div>
      <button
        type="button"
        class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        :disabled="loading"
        @click="loadData"
      >
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <div class="mt-2 space-y-2">
      <div v-if="error" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
        {{ error }}
      </div>
      <div v-else-if="statusMessage" class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
        {{ statusMessage }}
      </div>

      <div v-if="trustRootUnconfigured" class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        官方插件信任根未配置，官方插件列表暂不可用
      </div>

      <div v-if="officialRows.length === 0 && !trustRootUnconfigured && !loading" class="text-[11px] text-gray-500">
        No official plugins available.
      </div>

      <div v-for="row in officialRows" :key="row.pluginId" class="rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-semibold text-gray-900">{{ row.pluginId }}</div>
            <div class="text-[11px] text-gray-500">
              v{{ row.pluginVersion }}
              <span v-if="row.catalogGeneratedAt" class="ml-1">
                &middot; catalog {{ row.catalogGeneratedAt?.slice(0, 10) }}
              </span>
            </div>
            <div class="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] text-gray-500 sm:grid-cols-2">
              <div>Available version: {{ displayOptional(row.availableVersion ?? row.pluginVersion) }}</div>
              <div>Model: {{ displayOptional(row.modelVersion) }}</div>
              <div>Signature key: {{ displayOptional(row.releaseProvenance?.trustKeyId) }}</div>
              <div>Package hash: {{ shortHash(row.releaseProvenance?.packageSha256) }}</div>
              <div>Signed: {{ displayDate(row.releaseProvenance?.signedAt) }}</div>
              <div>Expires: {{ displayDate(row.releaseProvenance?.expiresAt) }}</div>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
              :class="{
                'bg-green-100 text-green-800': row.installState === 'installed',
                'bg-red-100 text-red-800': row.installState === 'failed',
                'bg-gray-100 text-gray-700': row.installState === 'uninstalled' || row.installState === 'not_installed',
                'bg-blue-100 text-blue-800': row.installState === 'update_available',
              }"
            >
              {{ row.installState === 'not_installed' ? 'not installed' : row.installState }}
            </span>
          </div>
        </div>
        <div v-if="row.installState === 'not_installed'" class="mt-2">
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="loading"
            @click="doRegister(row.pluginId, row.pluginVersion, row.recommendedInstallRootKind)"
          >
            Register
          </button>
        </div>
      </div>

      <div v-if="installedRows.length > 0" class="mt-3 border-t border-gray-100 pt-2">
        <div class="text-[11px] font-semibold text-gray-700 mb-2">Installed Plugins</div>
        <div v-for="item in installedRows" :key="item.engineId" class="rounded-md border border-gray-100 bg-white px-3 py-2 mb-1">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs font-semibold text-gray-900">{{ item.displayName }}</div>
              <div class="text-[11px] text-gray-500">
                {{ item.engineId }} v{{ item.pluginVersion }}
                <span v-if="item.modelVersion" class="ml-1">&middot; model {{ item.modelVersion }}</span>
              </div>
              <div class="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] text-gray-500 sm:grid-cols-2">
                <div>Installed version: {{ displayOptional(item.installedVersion ?? item.pluginVersion) }}</div>
                <div>Available version: {{ displayOptional(item.availableVersion) }}</div>
                <div>Model: {{ displayOptional(item.modelVersion ?? item.releaseProvenance?.modelVersion) }}</div>
                <div>Runtime: {{ displayOptional(item.runtimeVersion) }}</div>
                <div>Signature key: {{ displayOptional(item.releaseProvenance?.trustKeyId) }}</div>
                <div>Package hash: {{ shortHash(item.releaseProvenance?.packageSha256) }}</div>
                <div>Inventory hash: {{ shortHash(item.releaseProvenance?.inventorySha256) }}</div>
                <div>Signed: {{ displayDate(item.releaseProvenance?.signedAt) }}</div>
                <div>Expires: {{ displayDate(item.releaseProvenance?.expiresAt) }}</div>
                <div>Status: {{ versionStatus(item) }}</div>
              </div>
              <div v-if="item.failureReason" class="mt-1 inline-flex items-center gap-2 rounded bg-red-50 px-2 py-0.5 text-[10px] text-red-800">
                <span>{{ pluginPrimaryErrorDisplay(item.errorChain, item.failureReason) }}</span>
                <button
                  v-if="hasErrorChain(item)"
                  type="button"
                  class="font-medium underline decoration-red-300 underline-offset-2 hover:text-red-950"
                  @click="toggleErrorChain(item.engineId)"
                >
                  {{ isErrorChainExpanded(item.engineId) ? 'Hide details' : 'Details' }}
                </button>
              </div>
              <dl v-if="item.failureReason && hasErrorChain(item) && isErrorChainExpanded(item.engineId)" class="mt-1 grid gap-0.5 text-[10px] text-red-800">
                <div
                  v-for="row in pluginErrorChainDetailRows(item.errorChain, item.failureReason)"
                  :key="row.label"
                >
                  {{ row.label }}: {{ row.value }}
                </div>
              </dl>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                :class="{
                  'bg-green-100 text-green-800': item.healthStatus === 'healthy',
                  'bg-yellow-100 text-yellow-800': item.healthStatus === 'degraded',
                  'bg-red-100 text-red-800': item.healthStatus === 'unhealthy',
                  'bg-gray-100 text-gray-700': item.healthStatus === 'unknown',
                }"
              >
                {{ item.healthStatus }}
              </span>
            </div>
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            <button
              v-if="!item.enabled"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="loading"
              @click="doEnable(item.engineId)"
            >
              Enable
            </button>
            <button
              v-if="item.enabled"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="loading"
              @click="doDisable(item.engineId)"
            >
              Disable
            </button>
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="loading"
              @click="doHealthCheck(item.engineId)"
            >
              Health Check
            </button>
            <button
              type="button"
              class="rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50"
              :disabled="loading"
              @click="doUninstall(item)"
            >
              {{ uninstallActionLabel(item) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

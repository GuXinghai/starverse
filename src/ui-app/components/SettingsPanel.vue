<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getOpenRouterProviderRequireParameters, setOpenRouterProviderRequireParameters } from '@/next/settings/openRouterProviderSettingsClient'
import { getReasoningPrefs, setReasoningPrefs } from '@/next/settings/reasoningPrefsClient'
import { getUserMessageRenderDefault, setUserMessageRenderDefault } from '@/next/settings/userMessageRenderDefaultClient'
import { getChatReasoningPanelDefaultExpanded, setChatReasoningPanelDefaultExpanded } from '@/next/settings/reasoningPanelDefaultClient'
import { getWebSearchDefaults, setWebSearchDefaults } from '@/next/settings/webSearchDefaultsClient'
import { getSamplingParamsDefaults, setSamplingParamsDefaults } from '@/next/settings/samplingParamsDefaultsClient'
import {
  DEFAULT_NETEXP_SETTINGS,
  getNetExpRuntimeInfo,
  getNetExpSettings,
  setNetExpSettings,
  type NetExpSettings,
  type NetExpRuntimeInfo,
} from '@/next/netExp/netExpClient'
import { formatNetExpRunReport, getLastNetExpRunReport } from '@/next/netExp/netExpRunReport'
import type { ReasoningEffort, ReasoningPrefs } from '@/next/state/types'
import { normalizeSearchSettingsLayer } from '@/next/openrouter/searchSettingsPersistence'
import { resolveSearchSettings, type SearchSettingsLayer } from '@/next/openrouter/searchSettingsResolver'
import { normalizeSamplingParamsLayer } from '@/next/openrouter/samplingParamsPersistence'
import { resolveSamplingParams, type SamplingParamsLayer } from '@/next/openrouter/samplingParamsResolver'
import WebSearchSettingsEditor from './WebSearchSettingsEditor.vue'
import SamplingParamsSettingsEditor from './SamplingParamsSettingsEditor.vue'
import PluginManagementPanel from './PluginManagementPanel.vue'
import { t, useLanguagePrefs, LOCALE_DISPLAY_NAMES, type SupportedLocale, type LocaleMode } from '@/shared/i18n'
import { saveLanguagePref, saveLanguagePrefSystem, getSystemLocale } from '@/next/settings/languagePrefs'
import {
  CATALOG_FRESHNESS_PRESETS_MS,
  CATALOG_RETENTION_PRESETS_MS,
  DEFAULT_CATALOG_AUTO_SYNC_POLICY,
  DEFAULT_CATALOG_FRESHNESS_MS,
  DEFAULT_CATALOG_LIST_UPDATE_MODE,
  DEFAULT_CATALOG_RETENTION_MS,
  OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY,
  OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY,
  OPENROUTER_CATALOG_RETENTION_MS_KEY,
  OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY,
  normalizeCatalogAutoSyncPolicy,
  normalizeCatalogFreshnessMs,
  normalizeCatalogListUpdateMode,
  normalizeCatalogRetentionMs,
  type CatalogAutoSyncPolicy,
  type CatalogListUpdateMode,
  type CatalogRetentionMs,
} from '@/shared/modelCatalog/catalogSyncSettings'

const props = defineProps<{
  disabled: boolean
  isRunning: boolean
}>()
const isDev = import.meta.env?.DEV === true

type ElectronStoreLike = Readonly<{
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<any>
  delete: (key: string) => Promise<any>
}>

type OpenRouterEndpointMetadata = Readonly<{
  kind: 'openrouter_endpoint'
  endpointId: 'openrouter-official' | 'openrouter-custom-legacy-store'
  providerId: 'openrouter'
  profileId: 'openrouter_v1_chat'
  displayName: string
  source: 'legacy_store'
  baseUrlConfigured: boolean
  baseUrlInvalid?: boolean
  displayBaseUrl?: string
  defaultBaseUrl: string
  credentialRef: Readonly<{ kind: 'credential_ref'; id: 'openrouter-chat-legacy-store' }>
  catalogCredentialRef: Readonly<{ kind: 'credential_ref'; id: 'openrouter-catalog-legacy-store' }>
  rendererVisible: true
}>

type OpenRouterCredentialStatus = Readonly<{
  source: 'legacy_store'
  apiKeyConfigured: boolean
  maskedApiKey?: string
  baseUrlConfigured: boolean
  baseUrlInvalid?: boolean
  displayBaseUrl?: string
  defaultBaseUrl?: string
  endpoint?: OpenRouterEndpointMetadata
}>

type OpenRouterCredentialResult = Readonly<{
  ok: boolean
  status?: OpenRouterCredentialStatus
  message?: string
}>

type OpenRouterCredentialBridge = Readonly<{
  getStatus: () => Promise<OpenRouterCredentialResult>
  update: (payload: Readonly<{ apiKey?: string; baseUrl?: string | null }>) => Promise<OpenRouterCredentialResult>
  clear: () => Promise<OpenRouterCredentialResult>
}>

function getElectronStore(): ElectronStoreLike | null {
  const store = (globalThis as any).electronStore as ElectronStoreLike | undefined
  if (!store) return null
  if (typeof store.get !== 'function' || typeof store.set !== 'function' || typeof store.delete !== 'function') return null
  return store
}

function getOpenRouterCredentialBridge(): OpenRouterCredentialBridge | null {
  const bridge = (globalThis as any).openRouterCredential as OpenRouterCredentialBridge | undefined
  if (!bridge) return null
  if (
    typeof bridge.getStatus !== 'function' ||
    typeof bridge.update !== 'function' ||
    typeof bridge.clear !== 'function'
  ) return null
  return bridge
}

const OPENROUTER_DEBUG_ECHO_UPSTREAM_BODY_KEY = 'sv_debug_openrouter_echo_upstream_body'
const MAX_RECENT_MODELS_KEY = 'maxRecentModels'

const apiKey = ref('')
const baseUrl = ref('')
const loadedBaseUrl = ref('')
const apiKeyConfigured = ref(false)
const maskedApiKey = ref('')
const endpointDisplayName = ref('OpenRouter official endpoint')
const endpointDisplayBaseUrl = ref('')
const endpointBaseUrlInvalid = ref(false)
const catalogStartupSyncPolicy = ref<CatalogAutoSyncPolicy>(DEFAULT_CATALOG_AUTO_SYNC_POLICY)
const catalogPickerOpenSyncPolicy = ref<CatalogAutoSyncPolicy>(DEFAULT_CATALOG_AUTO_SYNC_POLICY)
const catalogListUpdateMode = ref<CatalogListUpdateMode>(DEFAULT_CATALOG_LIST_UPDATE_MODE)
const catalogFreshnessMs = ref(DEFAULT_CATALOG_FRESHNESS_MS)
const catalogRetentionMs = ref<CatalogRetentionMs>(DEFAULT_CATALOG_RETENTION_MS)
const requireParameters = ref(false)
const debugEchoUpstreamBody = ref(false)
const showApiKey = ref(false)
const requestedReasoningEffort = ref<'auto' | ReasoningEffort>('auto')
const requestedReasoningExclude = ref(false)
const reasoningPanelDefaultExpanded = ref(true)
const userMessageRenderDefault = ref(false)
const maxRecentModelsDraft = ref('8')
const webSearchDefaults = ref<SearchSettingsLayer | null>(null)
const samplingParamsDefaults = ref<SamplingParamsLayer | null>(null)
const netExpDisableHttp2 = ref(DEFAULT_NETEXP_SETTINGS.disableHttp2)
const netExpDisableQuic = ref(DEFAULT_NETEXP_SETTINGS.disableQuic)
const netExpStreamInMainProcess = ref(DEFAULT_NETEXP_SETTINGS.streamInMainProcess)
const netExpForceHttp1 = ref(DEFAULT_NETEXP_SETTINGS.forceHttp1)
const netExpKeepAliveEnable = ref(DEFAULT_NETEXP_SETTINGS.tcpKeepAliveEnable)
const netExpKeepAliveIdleMs = ref(DEFAULT_NETEXP_SETTINGS.tcpKeepAliveIdleMs)
const netExpInitial = ref<NetExpSettings>(DEFAULT_NETEXP_SETTINGS)
const netExpRuntime = ref<NetExpRuntimeInfo | null>(null)

const langPrefs = useLanguagePrefs()
const langMode = ref<LocaleMode>('manual')
const langManualLocale = ref<SupportedLocale>('zh-CN')

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const savedMessage = ref<string | null>(null)
const verifySyncLoading = ref(false)
const verifySyncResult = ref<string | null>(null)
const catalogClearLoading = ref<'current' | 'all' | null>(null)

watch(requestedReasoningEffort, (value) => {
  if (value === 'auto' || value === 'none') {
    if (requestedReasoningExclude.value) requestedReasoningExclude.value = false
  }
})

const storeAvailable = computed(() => !!getElectronStore())
const canEdit = computed(() => !props.disabled && !props.isRunning && storeAvailable.value)
const globalWebSearchResolved = computed(() =>
  resolveSearchSettings(
    { global: webSearchDefaults.value },
    { accountDefaultEnabled: false }
  )
)
const globalWebSearchInheritanceHint = computed(() => {
  const mode = globalWebSearchResolved.value.resolvedMode
  if (mode === 'default') {
    return t('settings.search.hintDefault')
  }
  return t('settings.search.hintGlobal')
})
const globalSamplingParamsResolved = computed(() =>
  resolveSamplingParams({ global: samplingParamsDefaults.value })
)

function isValidUrlOrEmpty(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    // eslint-disable-next-line no-new
    new URL(trimmed)
    return true
  } catch {
    return false
  }
}

const baseUrlValid = computed(() => isValidUrlOrEmpty(baseUrl.value))

const DEFAULT_REASONING_PREFS: ReasoningPrefs = { mode: 'auto', effort: 'auto', exclude: false }
const REASONING_EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
const catalogAutoSyncPolicyOptions: ReadonlyArray<Readonly<{ value: CatalogAutoSyncPolicy; labelKey: string }>> = [
  { value: 'always', labelKey: 'settings.openrouter.catalogSyncPolicyAlways' },
  { value: 'stale_only', labelKey: 'settings.openrouter.catalogSyncPolicyStaleOnly' },
  { value: 'never', labelKey: 'settings.openrouter.catalogSyncPolicyNever' },
]
const catalogListUpdateModeOptions: ReadonlyArray<Readonly<{ value: CatalogListUpdateMode; labelKey: string }>> = [
  { value: 'automatic', labelKey: 'settings.openrouter.catalogListUpdateAutomatic' },
  { value: 'manual', labelKey: 'settings.openrouter.catalogListUpdateManual' },
]
const catalogFreshnessOptions: ReadonlyArray<Readonly<{ value: number; labelKey: string }>> = [
  { value: CATALOG_FRESHNESS_PRESETS_MS[0], labelKey: 'settings.openrouter.catalogFreshness15m' },
  { value: CATALOG_FRESHNESS_PRESETS_MS[1], labelKey: 'settings.openrouter.catalogFreshness1h' },
  { value: CATALOG_FRESHNESS_PRESETS_MS[2], labelKey: 'settings.openrouter.catalogFreshness6h' },
  { value: CATALOG_FRESHNESS_PRESETS_MS[3], labelKey: 'settings.openrouter.catalogFreshness24h' },
  { value: CATALOG_FRESHNESS_PRESETS_MS[4], labelKey: 'settings.openrouter.catalogFreshness7d' },
]
const catalogRetentionOptions: ReadonlyArray<Readonly<{ value: CatalogRetentionMs; labelKey: string }>> = [
  { value: CATALOG_RETENTION_PRESETS_MS[0], labelKey: 'settings.openrouter.catalogRetention7d' },
  { value: CATALOG_RETENTION_PRESETS_MS[1], labelKey: 'settings.openrouter.catalogRetention30d' },
  { value: CATALOG_RETENTION_PRESETS_MS[2], labelKey: 'settings.openrouter.catalogRetention90d' },
  { value: CATALOG_RETENTION_PRESETS_MS[3], labelKey: 'settings.openrouter.catalogRetention180d' },
  { value: 'never', labelKey: 'settings.openrouter.catalogRetentionNever' },
]

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_EFFORTS as string[]).includes(value)
}

function normalizeReasoningPrefs(raw: unknown): ReasoningPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_REASONING_PREFS
  const mode = (raw as any).mode === 'effort' || (raw as any).mode === 'auto' ? (raw as any).mode : 'auto'
  const effortRaw = (raw as any).effort
  const effort = effortRaw === 'auto' || isReasoningEffort(effortRaw) ? effortRaw : undefined
  const excludeRaw = (raw as any).exclude === true

  if (mode === 'auto') {
    return { mode: 'auto', effort: 'auto', exclude: false }
  }

  const resolvedEffort = effort && effort !== 'auto' ? effort : 'none'
  const exclude = resolvedEffort === 'none' ? false : excludeRaw
  return { mode: 'effort', effort: resolvedEffort, exclude }
}

function applyReasoningPrefs(prefs: ReasoningPrefs) {
  if (prefs.mode === 'auto') {
    requestedReasoningEffort.value = 'auto'
    requestedReasoningExclude.value = false
    return
  }
  const nextEffort = prefs.effort && prefs.effort !== 'auto' ? prefs.effort : 'none'
  requestedReasoningEffort.value = nextEffort
  requestedReasoningExclude.value = nextEffort === 'none' ? false : prefs.exclude === true
}

function buildReasoningPrefs(): ReasoningPrefs {
  const mode = requestedReasoningEffort.value === 'auto' ? 'auto' : 'effort'
  const exclude = mode === 'auto' || requestedReasoningEffort.value === 'none' ? false : requestedReasoningExclude.value
  return { mode, effort: requestedReasoningEffort.value, exclude }
}

function parsePositiveIntegerText(value: string): number | null {
  const normalized = String(value ?? '').trim()
  if (!/^[1-9]\d*$/.test(normalized)) return null
  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed)) return null
  return parsed
}

function applyOpenRouterCredentialStatus(status: OpenRouterCredentialStatus) {
  const endpoint = status.endpoint
  const safeDisplayBaseUrl = String(status.displayBaseUrl ?? '').trim()
  const endpointSafeDisplayBaseUrl = endpoint?.displayBaseUrl ?? (
    endpoint?.baseUrlConfigured === false ? status.defaultBaseUrl : undefined
  )

  apiKey.value = ''
  apiKeyConfigured.value = status.apiKeyConfigured === true
  maskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  endpointDisplayName.value = endpoint?.displayName || 'OpenRouter official endpoint'
  endpointDisplayBaseUrl.value = String(endpointSafeDisplayBaseUrl ?? '').trim()
  endpointBaseUrlInvalid.value = endpoint?.baseUrlInvalid === true || status.baseUrlInvalid === true
  baseUrl.value = safeDisplayBaseUrl
  loadedBaseUrl.value = baseUrl.value
}

async function loadOpenRouterCredentialStatus() {
  const credentialBridge = getOpenRouterCredentialBridge()
  if (!credentialBridge) {
    throw new Error('Missing openRouterCredential bridge (run in Electron).')
  }

  const result = await credentialBridge.getStatus()
  if (!result?.ok || !result.status) {
    throw new Error(result?.message || 'OpenRouter credential status unavailable.')
  }
  applyOpenRouterCredentialStatus(result.status)
}

async function load() {
  error.value = null
  savedMessage.value = null

  const store = getElectronStore()
  if (!store) {
    error.value = 'Missing electronStore (run in Electron).'
    return
  }

  loading.value = true
  try {
    await loadOpenRouterCredentialStatus()
    catalogStartupSyncPolicy.value = normalizeCatalogAutoSyncPolicy(await store.get(OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY))
    catalogPickerOpenSyncPolicy.value = normalizeCatalogAutoSyncPolicy(await store.get(OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY))
    catalogListUpdateMode.value = normalizeCatalogListUpdateMode(await store.get(OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY))
    catalogFreshnessMs.value = normalizeCatalogFreshnessMs(await store.get(OPENROUTER_CATALOG_FRESHNESS_MS_KEY))
    catalogRetentionMs.value = normalizeCatalogRetentionMs(await store.get(OPENROUTER_CATALOG_RETENTION_MS_KEY))
    const storedMaxRecentModels = parsePositiveIntegerText(String((await store.get(MAX_RECENT_MODELS_KEY)) ?? ''))
    maxRecentModelsDraft.value = String(storedMaxRecentModels ?? 8)
    requireParameters.value = await getOpenRouterProviderRequireParameters()
    const netExp = await getNetExpSettings()
    netExpDisableHttp2.value = netExp.disableHttp2
    netExpDisableQuic.value = netExp.disableQuic
    netExpStreamInMainProcess.value = netExp.streamInMainProcess
    netExpForceHttp1.value = netExp.forceHttp1
    netExpKeepAliveEnable.value = netExp.tcpKeepAliveEnable
    netExpKeepAliveIdleMs.value = netExp.tcpKeepAliveIdleMs
    netExpInitial.value = netExp
    netExpRuntime.value = await getNetExpRuntimeInfo()
    langMode.value = langPrefs.mode
    langManualLocale.value = langPrefs.mode === 'manual' ? langPrefs.uiLocale : getSystemLocale()
    const prefs = await getReasoningPrefs()
    applyReasoningPrefs(normalizeReasoningPrefs(prefs))
    reasoningPanelDefaultExpanded.value = await getChatReasoningPanelDefaultExpanded()
    userMessageRenderDefault.value = (await getUserMessageRenderDefault()) === true
    if (isDev) {
      try {
        debugEchoUpstreamBody.value =
          String(globalThis?.localStorage?.getItem(OPENROUTER_DEBUG_ECHO_UPSTREAM_BODY_KEY) ?? '').trim() === '1'
      } catch {
        debugEchoUpstreamBody.value = false
      }
    } else {
      debugEchoUpstreamBody.value = false
      try {
        globalThis?.localStorage?.removeItem(OPENROUTER_DEBUG_ECHO_UPSTREAM_BODY_KEY)
      } catch {
        // no-op
      }
    }
    try {
      webSearchDefaults.value = normalizeSearchSettingsLayer(await getWebSearchDefaults())
    } catch {
      webSearchDefaults.value = null
    }
    try {
      samplingParamsDefaults.value = normalizeSamplingParamsLayer(await getSamplingParamsDefaults())
    } catch {
      samplingParamsDefaults.value = null
    }
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    loading.value = false
  }
}

async function save() {
  error.value = null
  savedMessage.value = null

  const store = getElectronStore()
  if (!store) {
    error.value = 'Missing electronStore (run in Electron).'
    return
  }

  if (!baseUrlValid.value) {
    error.value = t('settings.openrouter.baseUrlInvalid')
    return
  }
  const nextMaxRecentModels = parsePositiveIntegerText(maxRecentModelsDraft.value)
  if (nextMaxRecentModels === null) {
    error.value = 'maxRecentModels must be a positive integer.'
    return
  }

  saving.value = true
  try {
    const credentialBridge = getOpenRouterCredentialBridge()
    if (!credentialBridge) {
      throw new Error('Missing openRouterCredential bridge (run in Electron).')
    }
    const credentialPayload: { apiKey?: string; baseUrl?: string } = {}
    const nextApiKey = apiKey.value.trim()
    if (nextApiKey) credentialPayload.apiKey = nextApiKey
    const nextBaseUrl = baseUrl.value.trim()
    if (nextBaseUrl !== loadedBaseUrl.value.trim()) credentialPayload.baseUrl = nextBaseUrl
    const credentialResult = await credentialBridge.update(credentialPayload)
    if (!credentialResult?.ok || !credentialResult.status) {
      throw new Error(credentialResult?.message || 'OpenRouter credential update failed.')
    }
    applyOpenRouterCredentialStatus(credentialResult.status)
    await store.set(OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY, normalizeCatalogAutoSyncPolicy(catalogStartupSyncPolicy.value))
    await store.set(OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY, normalizeCatalogAutoSyncPolicy(catalogPickerOpenSyncPolicy.value))
    await store.set(OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY, normalizeCatalogListUpdateMode(catalogListUpdateMode.value))
    await store.set(OPENROUTER_CATALOG_FRESHNESS_MS_KEY, normalizeCatalogFreshnessMs(catalogFreshnessMs.value))
    await store.set(OPENROUTER_CATALOG_RETENTION_MS_KEY, normalizeCatalogRetentionMs(catalogRetentionMs.value))
    await store.set(MAX_RECENT_MODELS_KEY, nextMaxRecentModels)
    await setOpenRouterProviderRequireParameters(requireParameters.value === true)
    await setNetExpSettings({
      disableHttp2: netExpDisableHttp2.value,
      disableQuic: netExpDisableQuic.value,
      streamInMainProcess: netExpStreamInMainProcess.value,
      forceHttp1: netExpForceHttp1.value,
      tcpKeepAliveEnable: netExpKeepAliveEnable.value,
      tcpKeepAliveIdleMs: netExpKeepAliveIdleMs.value,
    })
    const nextReasoningPrefs = buildReasoningPrefs()
    await setReasoningPrefs(nextReasoningPrefs)
    await setChatReasoningPanelDefaultExpanded(reasoningPanelDefaultExpanded.value === true)
    await setUserMessageRenderDefault(userMessageRenderDefault.value === true)
    if (isDev) {
      try {
        if (debugEchoUpstreamBody.value) {
          globalThis?.localStorage?.setItem(OPENROUTER_DEBUG_ECHO_UPSTREAM_BODY_KEY, '1')
        } else {
          globalThis?.localStorage?.removeItem(OPENROUTER_DEBUG_ECHO_UPSTREAM_BODY_KEY)
        }
      } catch {
        // no-op
      }
    } else {
      try {
        globalThis?.localStorage?.removeItem(OPENROUTER_DEBUG_ECHO_UPSTREAM_BODY_KEY)
      } catch {
        // no-op
      }
    }
    const normalizedWebSearchDefaults = normalizeSearchSettingsLayer(webSearchDefaults.value)
    const normalizedSamplingParamsDefaults = normalizeSamplingParamsLayer(samplingParamsDefaults.value)
    await setWebSearchDefaults(normalizedWebSearchDefaults)
    await setSamplingParamsDefaults(normalizedSamplingParamsDefaults)
    try {
      window.dispatchEvent(new CustomEvent('settings:reasoningPrefsUpdated', { detail: nextReasoningPrefs }))
      window.dispatchEvent(new CustomEvent('settings:reasoningPanelDefaultExpandedUpdated', { detail: reasoningPanelDefaultExpanded.value === true }))
      window.dispatchEvent(new CustomEvent('settings:userMessageRenderDefaultUpdated', { detail: userMessageRenderDefault.value === true }))
      window.dispatchEvent(new CustomEvent('settings:webSearchDefaultsUpdated', { detail: normalizedWebSearchDefaults }))
      window.dispatchEvent(new CustomEvent('settings:samplingParamsDefaultsUpdated', { detail: normalizedSamplingParamsDefaults }))
      window.dispatchEvent(new CustomEvent('settings:maxRecentModelsUpdated', { detail: nextMaxRecentModels }))
      window.dispatchEvent(new CustomEvent('settings:openRouterConnectionUpdated', {
        detail: {
          hasApiKey: apiKeyConfigured.value,
          baseUrlChanged: false,
          reason: 'settings_saved',
        },
      }))
    } catch {
      // no-op
    }
    savedMessage.value = t('common.saved')
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

async function copyRunReport() {
  error.value = null
  savedMessage.value = null
  try {
    netExpRuntime.value = await getNetExpRuntimeInfo()
    const report = formatNetExpRunReport(getLastNetExpRunReport(), netExpRuntime.value)
    await navigator.clipboard.writeText(report)
    savedMessage.value = t('settings.network.runReportCopied')
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : t('common.error')
  }
}

async function clearApiKey() {
  error.value = null
  savedMessage.value = null
  const credentialBridge = getOpenRouterCredentialBridge()
  if (!credentialBridge) {
    error.value = 'Missing openRouterCredential bridge (run in Electron).'
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.clear()
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || 'OpenRouter credential clear failed.')
    }
    applyOpenRouterCredentialStatus(result.status)
    savedMessage.value = t('settings.openrouter.apiKeyCleared')
    try {
      window.dispatchEvent(new CustomEvent('settings:openRouterConnectionUpdated', {
        detail: {
          hasApiKey: false,
          baseUrlChanged: false,
          reason: 'api_key_cleared',
        },
      }))
    } catch {
      // no-op
    }
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

async function clearBaseUrl() {
  error.value = null
  savedMessage.value = null
  const credentialBridge = getOpenRouterCredentialBridge()
  if (!credentialBridge) {
    error.value = 'Missing openRouterCredential bridge (run in Electron).'
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.update({ baseUrl: null })
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || 'OpenRouter base URL clear failed.')
    }
    applyOpenRouterCredentialStatus(result.status)
    savedMessage.value = t('settings.openrouter.baseUrlCleared')
    try {
      window.dispatchEvent(new CustomEvent('settings:openRouterConnectionUpdated', {
        detail: {
          hasApiKey: apiKeyConfigured.value,
          baseUrlChanged: true,
          reason: 'base_url_cleared',
        },
      }))
    } catch {
      // no-op
    }
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

async function verifyAndSync() {
  error.value = null
  savedMessage.value = null
  verifySyncResult.value = null

  const store = getElectronStore()
  if (!store) {
    error.value = 'Missing electronStore (run in Electron).'
    return
  }

  if (!baseUrlValid.value) {
    error.value = t('settings.openrouter.baseUrlInvalid')
    return
  }

  verifySyncLoading.value = true
  try {
    const credentialBridge = getOpenRouterCredentialBridge()
    if (!credentialBridge) {
      error.value = 'Missing openRouterCredential bridge (run in Electron).'
      return
    }
    const credentialPayload: { apiKey?: string; baseUrl?: string } = {}
    const nextApiKey = apiKey.value.trim()
    if (nextApiKey) credentialPayload.apiKey = nextApiKey
    const nextBaseUrl = baseUrl.value.trim()
    if (nextBaseUrl !== loadedBaseUrl.value.trim()) credentialPayload.baseUrl = nextBaseUrl
    const credentialResult = await credentialBridge.update(credentialPayload)
    if (!credentialResult?.ok || !credentialResult.status) {
      throw new Error(credentialResult?.message || 'OpenRouter credential update failed.')
    }
    applyOpenRouterCredentialStatus(credentialResult.status)

    const electronAPI = (globalThis as any).electronAPI
    if (!electronAPI?.modelCatalogSyncNow) {
      error.value = 'modelCatalogSyncNow unavailable.'
      return
    }

    const result = await electronAPI.modelCatalogSyncNow({
      providerKey: 'openrouter',
      force: true,
      reason: 'settings_validate_button',
    })

    if (result?.ok) {
      const modelCount = result.modelCount ?? 0
      verifySyncResult.value = `${t('settings.openrouter.verifySyncSuccess')} (${modelCount})`
    } else {
      const reasonCode = result?.errorCode ?? 'unknown_error'
      const reasonKey = `errors.modelCatalog.syncFail${reasonCode.charAt(0).toUpperCase()}${reasonCode.slice(1).replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())}`
      const reasonText = t(reasonKey)
      verifySyncResult.value = `${t('settings.openrouter.verifySyncFailed')}：${reasonText}`
    }
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    verifySyncLoading.value = false
  }
}

function confirmCatalogClear(message: string): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false
  return window.confirm(message)
}

async function clearCurrentCatalogCache() {
  error.value = null
  savedMessage.value = null
  verifySyncResult.value = null
  if (!apiKeyConfigured.value && !apiKey.value.trim()) {
    error.value = t('settings.openrouter.catalogCacheNoApiKey')
    return
  }
  if (!confirmCatalogClear(t('settings.openrouter.catalogCacheClearCurrentConfirm'))) return

  const electronAPI = (globalThis as any).electronAPI
  if (!electronAPI?.modelCatalogClearCurrentScopedCache) {
    error.value = 'modelCatalogClearCurrentScopedCache unavailable.'
    return
  }

  catalogClearLoading.value = 'current'
  try {
    const result = await electronAPI.modelCatalogClearCurrentScopedCache()
    if (result?.ok) {
      savedMessage.value = t('settings.openrouter.catalogCacheClearCurrentSuccess')
    } else {
      error.value = `${t('settings.openrouter.catalogCacheClearFailed')}：${String(result?.errorCode ?? 'unknown_error')}`
    }
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    catalogClearLoading.value = null
  }
}

async function clearAllOpenRouterCatalogCaches() {
  error.value = null
  savedMessage.value = null
  verifySyncResult.value = null
  if (!confirmCatalogClear(t('settings.openrouter.catalogCacheClearAllConfirm'))) return

  const electronAPI = (globalThis as any).electronAPI
  if (!electronAPI?.modelCatalogClearAllOpenRouterScopedCaches) {
    error.value = 'modelCatalogClearAllOpenRouterScopedCaches unavailable.'
    return
  }

  catalogClearLoading.value = 'all'
  try {
    const result = await electronAPI.modelCatalogClearAllOpenRouterScopedCaches()
    if (result?.ok) {
      savedMessage.value = t('settings.openrouter.catalogCacheClearAllSuccess')
    } else {
      error.value = `${t('settings.openrouter.catalogCacheClearFailed')}：${String(result?.errorCode ?? 'unknown_error')}`
    }
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    catalogClearLoading.value = null
  }
}

async function applyLanguageMode(mode: LocaleMode) {
  error.value = null
  savedMessage.value = null
  saving.value = true
  try {
    if (mode === 'system') {
      await saveLanguagePrefSystem()
      langMode.value = 'system'
    } else {
      await saveLanguagePref(langManualLocale.value)
      langMode.value = 'manual'
    }
    savedMessage.value = t('common.saved') + ''
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

async function applyLanguageLocale(locale: SupportedLocale) {
  error.value = null
  savedMessage.value = null
  saving.value = true
  try {
    langManualLocale.value = locale
    await saveLanguagePref(locale)
    langMode.value = 'manual'
    savedMessage.value = t('common.saved') + ''
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="h-full p-4">
    <div class="flex items-center justify-between gap-2">
      <div class="text-sm font-semibold text-gray-900">{{ t('settings.title') }}</div>
      <button
        type="button"
        class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        :disabled="props.disabled || props.isRunning || loading || saving"
        @click="load"
      >
        {{ t('common.reload') }}
      </button>
    </div>

    <div class="mt-3 space-y-3">
      <div v-if="error" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
        {{ error }}
      </div>
      <div v-else-if="savedMessage" class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
        {{ savedMessage }}
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('common.language') }}</div>

        <div class="mt-3 space-y-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="language-mode"
              value="system"
              :disabled="saving"
              :checked="langMode === 'system'"
              @change="applyLanguageMode('system')"
            />
            <div>
              <div class="text-[11px] font-semibold text-gray-700">{{ t('common.languageFollowSystem') }}</div>
              <div class="text-[11px] text-gray-500">{{ t('common.languageFollowSystemDesc') }}</div>
            </div>
          </label>

          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="language-mode"
              value="manual"
              :disabled="saving"
              :checked="langMode === 'manual'"
              @change="applyLanguageMode('manual')"
            />
            <div class="text-[11px] font-semibold text-gray-700">{{ t('common.languageManual') }}</div>
          </label>

          <div v-if="langMode === 'manual'" class="ml-6 flex flex-col gap-1">
            <label
              v-for="locale in ['zh-CN', 'en-US'] as const"
              :key="locale"
              class="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="language-locale"
                :value="locale"
                :disabled="saving"
                :checked="langManualLocale === locale"
                @change="applyLanguageLocale(locale)"
              />
              <span class="text-[11px] text-gray-700">{{ LOCALE_DISPLAY_NAMES[locale] }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.openrouter.title') }}</div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">{{ t('settings.openrouter.apiKey') }}</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            :type="showApiKey ? 'text' : 'password'"
            :placeholder="t('settings.openrouter.apiKeyPlaceholder')"
            :disabled="!canEdit || loading || saving"
            v-model="apiKey"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="props.disabled || loading || saving"
            @click="showApiKey = !showApiKey"
          >
            {{ showApiKey ? t('common.hide') : t('common.show') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving"
            @click="clearApiKey"
          >
            {{ t('common.clear') }}
          </button>
        </div>
        <div class="mt-1 text-[11px] text-gray-500">
          {{ apiKeyConfigured ? `已配置：${maskedApiKey || '***'}` : '未配置' }}
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">{{ t('settings.openrouter.baseUrl') }}</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            class="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            :class="baseUrlValid ? 'border-gray-200' : 'border-red-300'"
            :placeholder="t('settings.openrouter.baseUrlPlaceholder')"
            :disabled="!canEdit || loading || saving"
            v-model="baseUrl"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving"
            @click="clearBaseUrl"
          >
            {{ t('common.clear') }}
          </button>
        </div>
        <div v-if="!baseUrlValid" class="mt-1 text-[11px] text-red-700">{{ t('settings.openrouter.baseUrlInvalid') }}</div>
        <div
          class="mt-1 text-[11px] text-gray-500"
          data-testid="settings-openrouter-endpoint-metadata"
        >
          {{ endpointDisplayName }}
          <span v-if="endpointDisplayBaseUrl"> · {{ endpointDisplayBaseUrl }}</span>
          <span v-if="endpointBaseUrlInvalid"> · URL invalid</span>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label class="block">
            <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.openrouter.catalogStartupSyncPolicy') }}</span>
            <select
              v-model="catalogStartupSyncPolicy"
              class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
              :disabled="!canEdit || loading || saving"
              data-testid="settings-catalog-startup-sync-policy"
            >
              <option v-for="option in catalogAutoSyncPolicyOptions" :key="`startup-${option.value}`" :value="option.value">
                {{ t(option.labelKey) }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.openrouter.catalogPickerOpenSyncPolicy') }}</span>
            <select
              v-model="catalogPickerOpenSyncPolicy"
              class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
              :disabled="!canEdit || loading || saving"
              data-testid="settings-catalog-picker-open-sync-policy"
            >
              <option v-for="option in catalogAutoSyncPolicyOptions" :key="`picker-${option.value}`" :value="option.value">
                {{ t(option.labelKey) }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.openrouter.catalogListUpdateMode') }}</span>
            <select
              v-model="catalogListUpdateMode"
              class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
              :disabled="!canEdit || loading || saving"
              data-testid="settings-catalog-list-update-mode"
            >
              <option v-for="option in catalogListUpdateModeOptions" :key="option.value" :value="option.value">
                {{ t(option.labelKey) }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.openrouter.catalogFreshness') }}</span>
            <select
              v-model.number="catalogFreshnessMs"
              class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
              :disabled="!canEdit || loading || saving"
              data-testid="settings-catalog-freshness"
            >
              <option v-for="option in catalogFreshnessOptions" :key="option.value" :value="option.value">
                {{ t(option.labelKey) }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.openrouter.catalogRetention') }}</span>
            <select
              v-model="catalogRetentionMs"
              class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
              :disabled="!canEdit || loading || saving"
              data-testid="settings-catalog-retention"
            >
              <option v-for="option in catalogRetentionOptions" :key="String(option.value)" :value="option.value">
                {{ t(option.labelKey) }}
              </option>
            </select>
          </label>
        </div>

        <div class="mt-4 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2">
          <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.openrouter.catalogCacheTitle') }}</div>
          <div class="mt-1 text-[11px] text-gray-500">{{ t('settings.openrouter.catalogCacheDesc') }}</div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || catalogClearLoading !== null || (!apiKeyConfigured && !apiKey.trim())"
              data-testid="settings-clear-current-catalog-cache"
              @click="clearCurrentCatalogCache"
            >
              {{ catalogClearLoading === 'current' ? t('common.loading') : t('settings.openrouter.catalogCacheClearCurrent') }}
            </button>
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || catalogClearLoading !== null"
              data-testid="settings-clear-all-catalog-caches"
              @click="clearAllOpenRouterCatalogCaches"
            >
              {{ catalogClearLoading === 'all' ? t('common.loading') : t('settings.openrouter.catalogCacheClearAll') }}
            </button>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-[11px] font-semibold text-gray-700">provider.require_parameters</div>
            <div class="text-[11px] text-gray-500">{{ t('settings.openrouter.requireParametersDesc') }}</div>
          </div>
          <label class="inline-flex items-center gap-2">
            <input
              type="checkbox"
              :aria-label="t('settings.openrouter.requireParametersDesc')"
              :disabled="!canEdit || loading || saving"
              v-model="requireParameters"
            />
            <span class="text-[11px] text-gray-700">{{ requireParameters ? t('common.on') : t('common.off') }}</span>
          </label>
        </div>

        <div v-if="isDev" class="mt-4 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2">
          <div class="min-w-0">
            <div class="text-[11px] font-semibold text-amber-900">debug.echo_upstream_body</div>
            <div class="text-[11px] text-amber-800">{{ t('settings.openrouter.debugEchoDesc') }}</div>
          </div>
          <label class="inline-flex items-center gap-2">
            <input
              type="checkbox"
              :aria-label="t('settings.openrouter.debugEchoDesc')"
              :disabled="!canEdit || loading || saving"
              v-model="debugEchoUpstreamBody"
            />
            <span class="text-[11px] text-amber-900">{{ debugEchoUpstreamBody ? t('common.on') : t('common.off') }}</span>
          </label>
        </div>

        <div class="mt-4 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div v-if="verifySyncResult" class="text-[11px]" :class="verifySyncResult.startsWith(t('settings.openrouter.verifySyncSuccess')) ? 'text-green-700' : 'text-red-700'">
              {{ verifySyncResult }}
            </div>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-md border border-blue-600 bg-white px-3 py-2 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || verifySyncLoading"
              @click="verifyAndSync"
            >
              {{ verifySyncLoading ? t('settings.openrouter.verifySyncLoading') : t('settings.openrouter.verifyAndSync') }}
            </button>
            <button
              type="button"
              class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              :disabled="!canEdit || loading || saving"
              @click="save"
            >
              {{ t('common.save') }}
            </button>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.network.title') }}</div>

        <div class="mt-3 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.network.disableHttp2') }}</div>
              <div class="text-[11px] text-gray-500">{{ t('settings.network.disableHttp2Desc') }}</div>
            </div>
            <label class="inline-flex items-center gap-2">
              <input
                type="checkbox"
                :aria-label="t('settings.network.disableHttp2')"
                :disabled="!canEdit || loading || saving"
                v-model="netExpDisableHttp2"
              />
              <span class="text-[11px] text-gray-700">{{ netExpDisableHttp2 ? t('common.on') : t('common.off') }}</span>
            </label>
          </div>

          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.network.disableQuic') }}</div>
              <div class="text-[11px] text-gray-500">{{ t('settings.network.disableQuicDesc') }}</div>
            </div>
            <label class="inline-flex items-center gap-2">
              <input
                type="checkbox"
                :aria-label="t('settings.network.disableQuic')"
                :disabled="!canEdit || loading || saving"
                v-model="netExpDisableQuic"
              />
              <span class="text-[11px] text-gray-700">{{ netExpDisableQuic ? t('common.on') : t('common.off') }}</span>
            </label>
          </div>

          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.network.streamInMain') }}</div>
              <div class="text-[11px] text-gray-500">{{ t('settings.network.streamInMainDesc') }}</div>
            </div>
            <label class="inline-flex items-center gap-2">
              <input
                type="checkbox"
                :aria-label="t('settings.network.streamInMain')"
                :disabled="!canEdit || loading || saving"
                v-model="netExpStreamInMainProcess"
              />
              <span class="text-[11px] text-gray-700">{{ netExpStreamInMainProcess ? t('common.on') : t('common.off') }}</span>
            </label>
          </div>

          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.network.forceHttp1') }}</div>
              <div class="text-[11px] text-gray-500">{{ t('settings.network.forceHttp1Desc') }}</div>
            </div>
            <label class="inline-flex items-center gap-2">
              <input
                type="checkbox"
                :aria-label="t('settings.network.forceHttp1')"
                :disabled="!canEdit || loading || saving || !netExpStreamInMainProcess"
                v-model="netExpForceHttp1"
              />
              <span class="text-[11px] text-gray-700">{{ netExpForceHttp1 ? t('common.on') : t('common.off') }}</span>
            </label>
          </div>

          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.network.tcpKeepalive') }}</div>
              <div class="text-[11px] text-gray-500">{{ t('settings.network.tcpKeepaliveDesc') }}</div>
            </div>
            <label class="inline-flex items-center gap-2">
              <input
                type="checkbox"
                :aria-label="t('settings.network.tcpKeepalive')"
                :disabled="!canEdit || loading || saving || !netExpStreamInMainProcess"
                v-model="netExpKeepAliveEnable"
              />
              <span class="text-[11px] text-gray-700">{{ netExpKeepAliveEnable ? t('common.on') : t('common.off') }}</span>
            </label>
          </div>

          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.network.tcpKeepaliveIdle') }}</div>
              <div class="text-[11px] text-gray-500">{{ t('settings.network.tcpKeepaliveIdleDesc') }}</div>
            </div>
            <input
              type="number"
              min="0"
              step="1000"
              class="w-32 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 disabled:bg-gray-50"
              :disabled="!canEdit || loading || saving || !netExpStreamInMainProcess || !netExpKeepAliveEnable"
              v-model.number="netExpKeepAliveIdleMs"
            />
          </div>

          <div class="flex items-center justify-between gap-2">
            <div class="text-[11px] text-gray-500">{{ t('settings.network.copyRunReportDesc') }}</div>
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="props.disabled || loading || saving"
              @click="copyRunReport"
            >
              {{ t('settings.network.copyRunReport') }}
            </button>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.customParams.title') }}</div>
        <div class="mt-3">
          <SamplingParamsSettingsEditor
            v-model="samplingParamsDefaults"
            :disabled="!canEdit || loading || saving"
            :resolved="globalSamplingParamsResolved"
            :defaultCollapsed="true"
          />
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.reasoning.title') }}</div>

        <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <div class="flex items-center gap-2">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('settings.reasoning.reasoning') }}</div>
            <select
              class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm"
              :value="requestedReasoningEffort"
              :disabled="!canEdit || loading || saving"
              @change="requestedReasoningEffort = ($event.target as HTMLSelectElement).value as any"
            >
              <option value="auto">auto</option>
              <option value="none">none</option>
              <option value="minimal">minimal</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="xhigh">xhigh</option>
            </select>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                :aria-label="t('settings.reasoning.exclude')"
                class="h-4 w-4 rounded border-gray-300"
                :disabled="!canEdit || loading || saving || requestedReasoningEffort === 'auto' || requestedReasoningEffort === 'none'"
                v-model="requestedReasoningExclude"
              />
              {{ t('settings.reasoning.exclude') }}
            </label>
          </div>

          <div class="text-[11px] text-gray-500">
            {{ t('settings.reasoning.hint') }}
          </div>

          <div class="mt-3 flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2">
            <div class="min-w-0">
              <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.reasoning.inlineDefault') }}</div>
              <div class="text-[11px] text-gray-500">{{ t('settings.reasoning.inlineDefaultDesc') }}</div>
            </div>
            <label class="inline-flex items-center gap-2">
              <input
                type="checkbox"
                :aria-label="t('settings.reasoning.inlineDefault')"
                :disabled="!canEdit || loading || saving"
                v-model="reasoningPanelDefaultExpanded"
              />
              <span class="text-[11px] text-gray-700">{{ reasoningPanelDefaultExpanded ? t('settings.reasoning.expanded') : t('settings.reasoning.collapsed') }}</span>
            </label>
          </div>

          <div class="mt-3 flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2">
            <div class="min-w-0">
              <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.reasoning.userMessageRich') }}</div>
              <div class="text-[11px] text-gray-500">{{ t('settings.reasoning.userMessageRichDesc') }}</div>
            </div>
            <label class="inline-flex items-center gap-2">
              <input
                type="checkbox"
                :aria-label="t('settings.reasoning.userMessageRich')"
                :disabled="!canEdit || loading || saving"
                v-model="userMessageRenderDefault"
              />
              <span class="text-[11px] text-gray-700">{{ userMessageRenderDefault ? t('common.on') : t('common.off') }}</span>
            </label>
          </div>

          <div class="mt-3 flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2">
            <div class="min-w-0">
              <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.reasoning.recentModelsLimit') }}</div>
              <div class="text-[11px] text-gray-500">{{ t('settings.reasoning.recentModelsLimitDesc') }}</div>
            </div>
            <input
              v-model="maxRecentModelsDraft"
              type="number"
              min="1"
              step="1"
              class="w-24 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
              :disabled="!canEdit || loading || saving"
              data-testid="settings-max-recent-models"
            />
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.search.title') }}</div>
        <div class="mt-3">
          <WebSearchSettingsEditor
            v-model="webSearchDefaults"
            :disabled="!canEdit || loading || saving"
            :resolved="globalWebSearchResolved"
            :inheritanceHint="globalWebSearchInheritanceHint"
          />
        </div>
      </div>

      <PluginManagementPanel />

      <div class="text-[11px] text-gray-500">
        {{ t('settings.footer') }}
      </div>
    </div>
  </div>
</template>

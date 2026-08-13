<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getOpenRouterProviderRequireParameters, setOpenRouterProviderRequireParameters } from '@/next/settings/openRouterProviderSettingsClient'
import { getReasoningPrefs, setReasoningPrefs } from '@/next/settings/reasoningPrefsClient'
import { getUserMessageRenderDefault, setUserMessageRenderDefault } from '@/next/settings/userMessageRenderDefaultClient'
import { getChatReasoningPanelDefaultExpanded, setChatReasoningPanelDefaultExpanded } from '@/next/settings/reasoningPanelDefaultClient'
import { getWebSearchDefaults, setWebSearchDefaults } from '@/next/settings/webSearchDefaultsClient'
import { getGenerationParamsDefaults, setGenerationParamsDefaults } from '@/next/settings/generationParamsDefaultsClient'
import {
  getNetworkProxySettings,
  probeLibreOfficeOfficialDownloadNetwork,
  setNetworkProxySettings,
  type LibreOfficeProxyProbeResult,
} from '@/next/settings/networkProxySettingsClient'
import {
  DEFAULT_NETWORK_PROXY_SETTINGS,
  normalizeNetworkProxySettings,
  type NetworkProxyMode,
} from '@/shared/plugin-distribution/networkProxyShared'
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
import { normalizeGenerationParamsLayer } from '@/next/generation-params/generationParamPersistence'
import type { GenerationParamsLayer } from '@/next/generation-params/generationParamTypes'
import { CatalogQueryService } from '@/next/modelCatalog/catalogQueryService'
import WebSearchSettingsEditor from './WebSearchSettingsEditor.vue'
import GenerationParamsSettingsEditor from './GenerationParamsSettingsEditor.vue'
import PluginManagementPanel from './PluginManagementPanel.vue'
import CompatibleProviderSettingsPanel from './compatible/CompatibleProviderSettingsPanel.vue'
import NewChatLifecycleSettingsPanel from './NewChatLifecycleSettingsPanel.vue'
import ProviderFailureDetailsV2 from './ProviderFailureDetailsV2.vue'
import { t, tf, useLanguagePrefs, LOCALE_DISPLAY_NAMES, type SupportedLocale, type LocaleMode } from '@/shared/i18n'
import { saveLanguagePref, saveLanguagePrefSystem, getSystemLocale } from '@/next/settings/languagePrefs'
import {
  CATALOG_FRESHNESS_PRESETS_MS,
  CATALOG_RETENTION_PRESETS_MS,
  DEFAULT_CATALOG_AUTO_SYNC_POLICY,
  DEFAULT_CATALOG_FRESHNESS_MS,
  DEFAULT_CATALOG_LIST_UPDATE_MODE,
  DEFAULT_CATALOG_RETENTION_MS,
  type CatalogAutoSyncPolicy,
  type CatalogListUpdateMode,
  type CatalogRetentionMs,
} from '@/shared/modelCatalog/catalogSyncSettings'
import {
  GLOBAL_CATALOG_POLICY_V2_STORE_KEY,
  providerCatalogPolicyV2StoreKey,
} from '@/shared/modelCatalog/catalogPolicyResolverV2'
import { validateCatalogPolicyV2 } from '@/shared/modelCatalog/catalogPolicyV2'
import { listProviderCatalogSourceDescriptors } from '@/shared/modelCatalog/providerCatalogRegistry'
import type { ProviderCatalogKnownProviderKey } from '@/shared/modelCatalog/providerCatalogContracts'
import {
  providerFailureFromUnknownV2,
  providerFailurePrimaryMessageV2,
  type ProviderFailureV2,
} from '@/shared/provider/providerFailureV2'
import { catalogRuntimeStoreV2ForApp } from '@/next/modelCatalog/catalogRuntimeStoreV2'
import type { CatalogQueryItem } from '@/next/modelCatalog/catalogQueryService'

const props = defineProps<{
  disabled: boolean
  isRunning: boolean
}>()
const isDev = import.meta.env?.DEV === true
const appIdentity = getCurrentInstance()?.appContext.app
if (!appIdentity) throw new Error('CATALOG_RUNTIME_APP_CONTEXT_UNAVAILABLE')
const catalogRuntimeStore = catalogRuntimeStoreV2ForApp<CatalogQueryItem>(appIdentity)
const catalogRuntimeSnapshot = ref(catalogRuntimeStore.snapshot())
const unsubscribeCatalogRuntimeStore = catalogRuntimeStore.subscribe(() => {
  catalogRuntimeSnapshot.value = catalogRuntimeStore.snapshot()
})
onBeforeUnmount(unsubscribeCatalogRuntimeStore)

function networkProxyModeText(mode: NetworkProxyMode): string {
  switch (mode) {
    case 'environment':
      return t('settings.network.proxyModeEnvironment')
    case 'manual':
      return t('settings.network.proxyModeManual')
    case 'direct':
      return t('settings.network.proxyModeDirect')
    case 'system':
      return t('settings.network.proxyModeSystem')
  }
}

function passedFailedText(value: boolean): string {
  return value ? t('settings.network.passed') : t('settings.network.failed')
}

function reachableText(value: boolean): string {
  return value ? t('settings.network.reachable') : t('settings.network.unreachable')
}

type ElectronStoreLike = Readonly<{
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<any>
  delete: (key: string) => Promise<any>
}>

type ProviderCredentialStatusSource =
  | 'secure_store'
  | 'plaintext'
  | 'missing'
type ProviderCredentialBackendKind = 'electron_safe_storage' | 'session' | 'plaintext' | 'unavailable'
type CredentialAvailability = 'unknown' | 'available' | 'unavailable'
type CredentialStorageMode = 'system_secure' | 'session' | 'plaintext'

type OpenRouterEndpointMetadataBase = Readonly<{
  kind: 'openrouter_endpoint'
  providerId: 'openrouter'
  profileId: 'openrouter-first-party-v1'
  source: ProviderCredentialStatusSource
  defaultBaseUrl: string
  credentialRef: Readonly<{ kind: 'credential_ref'; id: 'openrouter-first-party-v1' }>
  catalogCredentialRef: Readonly<{ kind: 'credential_ref'; id: 'openrouter-first-party-v1' }>
  rendererVisible: true
}>

type OpenRouterEndpointMetadata = Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: 'openrouter-official'
    endpointStatus: 'official'
    displayName: 'OpenRouter official endpoint'
    baseUrlConfigured: false
    displayBaseUrl: 'https://openrouter.ai/api/v1'
  }>

type OpenRouterCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  apiKeyConfigured: boolean
  sessionOverridesPersistent?: boolean
  credentialAvailability?: CredentialAvailability
  credentialDiagnosticCode?: string
  maskedApiKey?: string
  migratedFromLegacy?: boolean
  warnings?: string[]
  baseUrlConfigured: false
  displayBaseUrl: 'https://openrouter.ai/api/v1'
  defaultBaseUrl?: string
  endpoint?: OpenRouterEndpointMetadata
}>

type OpenRouterCredentialResult = Readonly<{
  ok: boolean
  code?: string
  status?: OpenRouterCredentialStatus
  message?: string
  providerFailure?: ProviderFailureV2
}>

type OpenRouterCredentialBridge = Readonly<{
  getStatus: () => Promise<OpenRouterCredentialResult>
  update: (payload: Readonly<{ apiKey?: string; storageMode?: CredentialStorageMode }>) => Promise<OpenRouterCredentialResult>
  clear: () => Promise<OpenRouterCredentialResult>
}>

type OpenAIResponsesCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'openai'
  profileId: 'openai-responses-v1'
  apiKeyConfigured: boolean
  sessionOverridesPersistent?: boolean
  credentialAvailability?: CredentialAvailability
  credentialDiagnosticCode?: string
  maskedApiKey?: string
  migratedFromLegacy?: boolean
  warnings?: string[]
  defaultBaseUrl: string
  rendererVisible: true
}>

type OpenAIResponsesCredentialResult = Readonly<{
  ok: boolean
  code?: string
  status?: OpenAIResponsesCredentialStatus
  message?: string
  providerFailure?: ProviderFailureV2
}>

type OpenAIResponsesCredentialBridge = Readonly<{
  getStatus: () => Promise<OpenAIResponsesCredentialResult>
  update: (payload: Readonly<{ apiKey?: string; storageMode?: CredentialStorageMode }>) => Promise<OpenAIResponsesCredentialResult>
  clear: () => Promise<OpenAIResponsesCredentialResult>
}>

type GoogleAIStudioCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'google-ai-studio'
  profileId: 'gemini-developer-api-v1beta'
  apiKeyConfigured: boolean
  sessionOverridesPersistent?: boolean
  credentialAvailability?: CredentialAvailability
  credentialDiagnosticCode?: string
  maskedApiKey?: string
  migratedFromLegacy?: boolean
  warnings?: string[]
  defaultBaseUrl: string
  rendererVisible: true
}>

type GoogleAIStudioCredentialResult = Readonly<{
  ok: boolean
  code?: string
  status?: GoogleAIStudioCredentialStatus
  message?: string
  providerFailure?: ProviderFailureV2
}>

type GoogleAIStudioCredentialBridge = Readonly<{
  getStatus: () => Promise<GoogleAIStudioCredentialResult>
  update: (payload: Readonly<{ apiKey?: string; storageMode?: CredentialStorageMode }>) => Promise<GoogleAIStudioCredentialResult>
  clear: () => Promise<GoogleAIStudioCredentialResult>
}>

type AnthropicCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'anthropic'
  profileId: 'anthropic-messages-2023-06-01'
  apiKeyConfigured: boolean
  sessionOverridesPersistent?: boolean
  credentialAvailability?: CredentialAvailability
  credentialDiagnosticCode?: string
  maskedApiKey?: string
  migratedFromLegacy?: boolean
  warnings?: string[]
  defaultBaseUrl: string
  rendererVisible: true
}>

type AnthropicCredentialResult = Readonly<{
  ok: boolean
  code?: string
  status?: AnthropicCredentialStatus
  message?: string
  providerFailure?: ProviderFailureV2
}>

type AnthropicCredentialBridge = Readonly<{
  getStatus: () => Promise<AnthropicCredentialResult>
  update: (payload: Readonly<{ apiKey?: string; storageMode?: CredentialStorageMode }>) => Promise<AnthropicCredentialResult>
  clear: () => Promise<AnthropicCredentialResult>
}>

type DeepSeekCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'deepseek'
  profileId: 'deepseek-stable-chat-v1'
  apiKeyConfigured: boolean
  sessionOverridesPersistent?: boolean
  credentialAvailability?: CredentialAvailability
  credentialDiagnosticCode?: string
  maskedApiKey?: string
  migratedFromLegacy?: boolean
  warnings?: string[]
  defaultBaseUrl: string
  rendererVisible: true
}>

type DeepSeekCredentialResult = Readonly<{
  ok: boolean
  code?: string
  status?: DeepSeekCredentialStatus
  message?: string
  providerFailure?: ProviderFailureV2
}>

type DeepSeekCredentialBridge = Readonly<{
  getStatus: () => Promise<DeepSeekCredentialResult>
  update: (payload: Readonly<{ apiKey?: string; storageMode?: CredentialStorageMode }>) => Promise<DeepSeekCredentialResult>
  clear: () => Promise<DeepSeekCredentialResult>
}>

type CredentialPresence = 'configured' | 'unconfigured' | 'unknown'

type CredentialIssue = Readonly<{
  message: string
  failure: ProviderFailureV2
}>

type LocalEndpointProbeResult = Readonly<
  | {
    ok: true
    diagnostics: Readonly<{
      kind: 'local_endpoint_diagnostics'
      status: 'reachable' | 'unreachable'
      endpointFamily: 'openai_compatible' | 'ollama' | 'unknown'
      safeBaseUrl: string
      modelList:
        | Readonly<{ ok: true; source: 'openai_v1_models' | 'ollama_api_tags'; models: string[]; truncated: boolean }>
        | Readonly<{ ok: false; code: string; message: string }>
      capabilitySummary: Readonly<{
        chatSendAvailable: false
        textChat: 'diagnostics_only'
        streaming: 'not_probed'
        tools: false
        files: false
        reasoning: false
        webSearch: false
      }>
      message: string
    }>
  }
  | {
    ok: false
    code: string
    message: string
    safeUrl?: string
  }
>

type LocalEndpointStreamProbeResult = Readonly<
  | {
    ok: true
    diagnostics: Readonly<{
      kind: 'local_endpoint_stream_diagnostics'
      status: 'supported' | 'failed'
      endpointFamily: 'openai_compatible' | 'ollama' | 'unknown'
      safeBaseUrl: string
      textDeltaPreview?: string
      evidence: 'text_delta_observed' | 'no_text_delta' | 'model_unavailable'
      capabilitySummary: Readonly<{
        chatSendAvailable: false
        streaming: 'diagnostics_only_supported' | 'diagnostics_only_failed'
        tools: false
        files: false
        reasoning: false
        webSearch: false
      }>
      message: string
    }>
  }
  | {
    ok: false
    code: string
    message: string
    safeUrl?: string
  }
>

type LocalEndpointDiagnosticsBridge = Readonly<{
  probe: (payload: Readonly<{ url?: string; timeoutMs?: number }>) => Promise<LocalEndpointProbeResult>
  streamProbe: (payload: Readonly<{ url?: string; timeoutMs?: number }>) => Promise<LocalEndpointStreamProbeResult>
}>

const LOCAL_ENDPOINT_CHAT_URL_KEY = 'starverse.localEndpointTextChat.url'
const LOCAL_ENDPOINT_CHAT_SETTINGS_EVENT = 'settings:localEndpointTextChatUpdated'

function getElectronStore(): ElectronStoreLike | null {
  const store = (globalThis as any).electronStore as ElectronStoreLike | undefined
  if (!store) return null
  if (typeof store.get !== 'function' || typeof store.set !== 'function' || typeof store.delete !== 'function') return null
  return store
}

function getOpenRouterCredentialBridge(): OpenRouterCredentialBridge | null {
  const bridge = (globalThis as any).generationV2?.credentials?.openRouter as OpenRouterCredentialBridge | undefined
  if (!bridge) return null
  if (
    typeof bridge.getStatus !== 'function' ||
    typeof bridge.update !== 'function' ||
    typeof bridge.clear !== 'function'
  ) return null
  return bridge
}

function getOpenAIResponsesCredentialBridge(): OpenAIResponsesCredentialBridge | null {
  const bridge = (globalThis as any).generationV2?.credentials?.openAIResponses as OpenAIResponsesCredentialBridge | undefined
  if (!bridge) return null
  if (
    typeof bridge.getStatus !== 'function' ||
    typeof bridge.update !== 'function' ||
    typeof bridge.clear !== 'function'
  ) return null
  return bridge
}

function getGoogleAIStudioCredentialBridge(): GoogleAIStudioCredentialBridge | null {
  const bridge = (globalThis as any).generationV2?.credentials?.googleAIStudio as GoogleAIStudioCredentialBridge | undefined
  if (!bridge) return null
  if (
    typeof bridge.getStatus !== 'function' ||
    typeof bridge.update !== 'function' ||
    typeof bridge.clear !== 'function'
  ) return null
  return bridge
}

function getAnthropicCredentialBridge(): AnthropicCredentialBridge | null {
  const bridge = (globalThis as any).generationV2?.credentials?.anthropic as AnthropicCredentialBridge | undefined
  if (!bridge) return null
  if (
    typeof bridge.getStatus !== 'function' ||
    typeof bridge.update !== 'function' ||
    typeof bridge.clear !== 'function'
  ) return null
  return bridge
}

function getDeepSeekCredentialBridge(): DeepSeekCredentialBridge | null {
  const bridge = (globalThis as any).generationV2?.credentials?.deepSeek as DeepSeekCredentialBridge | undefined
  if (!bridge) return null
  if (
    typeof bridge.getStatus !== 'function' ||
    typeof bridge.update !== 'function' ||
    typeof bridge.clear !== 'function'
  ) return null
  return bridge
}

function getLocalEndpointDiagnosticsBridge(): LocalEndpointDiagnosticsBridge | null {
  const bridge = (globalThis as any).generationV2?.localRuntime?.generic as LocalEndpointDiagnosticsBridge | undefined
  if (!bridge || typeof bridge.probe !== 'function' || typeof bridge.streamProbe !== 'function') return null
  return bridge
}

const OPENROUTER_DEBUG_ECHO_UPSTREAM_BODY_KEY = 'sv_debug_openrouter_echo_upstream_body'
const MAX_RECENT_MODELS_KEY = 'maxRecentModels'
type SettingsCategoryId =
  | 'general'
  | 'providers'
  | 'model-catalog'
  | 'generation'
  | 'privacy-data'
  | 'network'
  | 'extensions'

const SETTINGS_CATEGORIES: ReadonlyArray<Readonly<{ id: SettingsCategoryId; labelKey: string }>> = [
  { id: 'general', labelKey: 'settings.categories.general' },
  { id: 'providers', labelKey: 'settings.categories.providers' },
  { id: 'model-catalog', labelKey: 'settings.categories.modelCatalog' },
  { id: 'generation', labelKey: 'settings.categories.generation' },
  { id: 'privacy-data', labelKey: 'settings.categories.privacyData' },
  { id: 'network', labelKey: 'settings.categories.network' },
  { id: 'extensions', labelKey: 'settings.categories.extensions' },
]
const activeCategory = ref<SettingsCategoryId>('general')

function settingsCategoryTabId(id: SettingsCategoryId): string {
  return `settings-category-tab-${id}`
}

function settingsCategoryPanelId(id: SettingsCategoryId): string {
  return `settings-category-panel-${id}`
}

function selectSettingsCategory(id: SettingsCategoryId, focus = false) {
  activeCategory.value = id
  if (focus) {
    requestAnimationFrame(() => document.getElementById(settingsCategoryTabId(id))?.focus())
  }
}

function onSettingsCategoryKeydown(event: KeyboardEvent, current: SettingsCategoryId) {
  const index = SETTINGS_CATEGORIES.findIndex((category) => category.id === current)
  if (index < 0) return
  let nextIndex: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % SETTINGS_CATEGORIES.length
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + SETTINGS_CATEGORIES.length) % SETTINGS_CATEGORIES.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = SETTINGS_CATEGORIES.length - 1
  if (nextIndex === null) return
  event.preventDefault()
  selectSettingsCategory(SETTINGS_CATEGORIES[nextIndex]!.id, true)
}

type CatalogPolicyDraft = {
  startupSyncPolicy: CatalogAutoSyncPolicy
  pickerOpenSyncPolicy: CatalogAutoSyncPolicy
  listApplyMode: CatalogListUpdateMode
  freshnessMs: number | null
  retentionMs: CatalogRetentionMs
}

type CatalogProviderStatusState = {
  status: 'not_synced' | 'syncing' | 'synced' | 'failed' | 'unavailable'
  modelCount: number
  lastSyncAtMs: number | null
  errorCode: string | null
  providerFailure: ProviderFailureV2 | null
}

const catalogProviderDescriptors = listProviderCatalogSourceDescriptors()
  .filter((descriptor): descriptor is typeof descriptor & { providerKey: ProviderCatalogKnownProviderKey } =>
    ['openrouter', 'google_ai_studio', 'anthropic_messages', 'openai_responses', 'deepseek'].includes(descriptor.providerKey),
  )
const catalogPolicyTarget = ref<'global' | 'provider_override'>('global')
const catalogSelectedProviderKey = ref<ProviderCatalogKnownProviderKey>('openrouter')
const catalogProviderPolicyDrafts = ref<Partial<Record<ProviderCatalogKnownProviderKey, CatalogPolicyDraft>>>({})
const catalogProviderOverrideEnabled = ref<Partial<Record<ProviderCatalogKnownProviderKey, boolean>>>({})
const catalogProviderOverrideTouched = ref<Partial<Record<ProviderCatalogKnownProviderKey, boolean>>>({})
const catalogProviderStatuses = computed<Partial<Record<ProviderCatalogKnownProviderKey, CatalogProviderStatusState>>>(() =>
  Object.fromEntries(catalogProviderDescriptors.map((descriptor) => {
    const state = catalogRuntimeSnapshot.value[descriptor.providerKey] ?? catalogRuntimeStore.read(descriptor.providerKey)
    const lastSyncAtMs = state.items.reduce((latest, item) => Math.max(latest,
      item.observation?.observedAtMs ?? item.syncedAtMs ?? 0), 0) || null
    const status: CatalogProviderStatusState['status'] = state.failure ? 'failed'
      : state.syncState === 'syncing' ? 'syncing'
        : state.displayedSnapshotDigest ? 'synced' : 'not_synced'
    return [descriptor.providerKey, Object.freeze({ status, modelCount: state.items.length, lastSyncAtMs,
      errorCode: state.failure?.starverseDiagnosticCode ?? null, providerFailure: state.failure })]
  })) as Partial<Record<ProviderCatalogKnownProviderKey, CatalogProviderStatusState>>)
const catalogProviderStatusLoading = computed<Partial<Record<ProviderCatalogKnownProviderKey, boolean>>>(() =>
  Object.fromEntries(catalogProviderDescriptors.map((descriptor) => {
    const state = catalogRuntimeSnapshot.value[descriptor.providerKey] ?? catalogRuntimeStore.read(descriptor.providerKey)
    return [descriptor.providerKey, state.hydrationState === 'loading' || state.syncState === 'syncing']
  })) as Partial<Record<ProviderCatalogKnownProviderKey, boolean>>)
const catalogProviderPendingRevisions = computed<Partial<Record<ProviderCatalogKnownProviderKey, string>>>(() =>
  Object.fromEntries(catalogProviderDescriptors.flatMap((descriptor) => {
    const state = catalogRuntimeSnapshot.value[descriptor.providerKey] ?? catalogRuntimeStore.read(descriptor.providerKey)
    return state.pendingSnapshotDigest ? [[descriptor.providerKey, state.pendingSnapshotDigest]] : []
  })) as Partial<Record<ProviderCatalogKnownProviderKey, string>>)

const apiKey = ref('')
const openRouterCredentialPresence = ref<CredentialPresence>('unknown')
const apiKeyConfigured = computed(() => openRouterCredentialPresence.value === 'configured')
const maskedApiKey = ref('')
const credentialWarnings = ref<string[]>([])
const openRouterCredentialIssue = ref<CredentialIssue | null>(null)
const openRouterCredentialEditing = ref(false)
const openRouterCredentialBackend = ref<ProviderCredentialBackendKind | undefined>()
const openRouterSessionOverridesPersistent = ref(false)
const openAIResponsesApiKey = ref('')
const openAIResponsesCredentialPresence = ref<CredentialPresence>('unknown')
const openAIResponsesApiKeyConfigured = computed(() => openAIResponsesCredentialPresence.value === 'configured')
const openAIResponsesMaskedApiKey = ref('')
const openAIResponsesCredentialWarnings = ref<string[]>([])
const openAIResponsesCredentialIssue = ref<CredentialIssue | null>(null)
const openAIResponsesCredentialEditing = ref(false)
const openAIResponsesCredentialBackend = ref<ProviderCredentialBackendKind | undefined>()
const openAIResponsesSessionOverridesPersistent = ref(false)
const googleAIStudioApiKey = ref('')
const googleAIStudioCredentialPresence = ref<CredentialPresence>('unknown')
const googleAIStudioApiKeyConfigured = computed(() => googleAIStudioCredentialPresence.value === 'configured')
const googleAIStudioMaskedApiKey = ref('')
const googleAIStudioCredentialWarnings = ref<string[]>([])
const googleAIStudioCredentialIssue = ref<CredentialIssue | null>(null)
const googleAIStudioCredentialEditing = ref(false)
const googleAIStudioCredentialBackend = ref<ProviderCredentialBackendKind | undefined>()
const googleAIStudioSessionOverridesPersistent = ref(false)
const anthropicApiKey = ref('')
const anthropicCredentialPresence = ref<CredentialPresence>('unknown')
const anthropicApiKeyConfigured = computed(() => anthropicCredentialPresence.value === 'configured')
const anthropicMaskedApiKey = ref('')
const anthropicCredentialWarnings = ref<string[]>([])
const anthropicCredentialIssue = ref<CredentialIssue | null>(null)
const anthropicCredentialEditing = ref(false)
const anthropicCredentialBackend = ref<ProviderCredentialBackendKind | undefined>()
const anthropicSessionOverridesPersistent = ref(false)
const deepSeekApiKey = ref('')
const deepSeekCredentialPresence = ref<CredentialPresence>('unknown')
const deepSeekApiKeyConfigured = computed(() => deepSeekCredentialPresence.value === 'configured')
const deepSeekMaskedApiKey = ref('')
const deepSeekCredentialWarnings = ref<string[]>([])
const deepSeekCredentialIssue = ref<CredentialIssue | null>(null)
const deepSeekCredentialEditing = ref(false)
const deepSeekCredentialBackend = ref<ProviderCredentialBackendKind | undefined>()
const deepSeekSessionOverridesPersistent = ref(false)
const credentialFallbackProvider = ref<ProviderCatalogKnownProviderKey | null>(null)
const credentialFallbackApiKey = ref('')
const plaintextCredentialPersistenceSupported = computed(() => window.electronAPI?.platform === 'linux')
const catalogStartupSyncPolicy = ref<CatalogAutoSyncPolicy>(DEFAULT_CATALOG_AUTO_SYNC_POLICY)
const catalogPickerOpenSyncPolicy = ref<CatalogAutoSyncPolicy>(DEFAULT_CATALOG_AUTO_SYNC_POLICY)
const catalogListUpdateMode = ref<CatalogListUpdateMode>(DEFAULT_CATALOG_LIST_UPDATE_MODE)
const catalogFreshnessMs = ref<number | null>(DEFAULT_CATALOG_FRESHNESS_MS)
const catalogRetentionMs = ref<CatalogRetentionMs>(DEFAULT_CATALOG_RETENTION_MS)
const catalogGlobalPolicyConfigured = ref(false)
const catalogGlobalPolicyTouched = ref(false)
function markGlobalCatalogPolicyTouched() {
  catalogGlobalPolicyConfigured.value = true
  catalogGlobalPolicyTouched.value = true
}
function markSelectedProviderCatalogPolicyTouched() {
  catalogProviderOverrideTouched.value = {
    ...catalogProviderOverrideTouched.value,
    [catalogSelectedProviderKey.value]: true,
  }
}
function globalCatalogPolicyDraft(): CatalogPolicyDraft {
  return {
    startupSyncPolicy: catalogStartupSyncPolicy.value,
    pickerOpenSyncPolicy: catalogPickerOpenSyncPolicy.value,
    listApplyMode: catalogListUpdateMode.value,
    freshnessMs: catalogFreshnessMs.value,
    retentionMs: catalogRetentionMs.value,
  }
}

function selectedProviderPolicyDraft(): CatalogPolicyDraft {
  const providerKey = catalogSelectedProviderKey.value
  const existing = catalogProviderPolicyDrafts.value[providerKey]
  if (existing) return existing
  const draft = globalCatalogPolicyDraft()
  catalogProviderPolicyDrafts.value = { ...catalogProviderPolicyDrafts.value, [providerKey]: draft }
  return draft
}

function effectiveCatalogPolicyDraft(providerKey: ProviderCatalogKnownProviderKey): CatalogPolicyDraft {
  return catalogProviderOverrideEnabled.value[providerKey] === true
    ? catalogProviderPolicyDrafts.value[providerKey] ?? globalCatalogPolicyDraft()
    : globalCatalogPolicyDraft()
}

function useSelectedProviderOverride(): boolean {
  return catalogPolicyTarget.value === 'provider_override' &&
    catalogProviderOverrideEnabled.value[catalogSelectedProviderKey.value] === true
}

const activeCatalogStartupSyncPolicy = computed<CatalogAutoSyncPolicy>({
  get: () => useSelectedProviderOverride() ? selectedProviderPolicyDraft().startupSyncPolicy : catalogStartupSyncPolicy.value,
  set: (value) => {
    if (catalogPolicyTarget.value === 'global') { catalogStartupSyncPolicy.value = value; markGlobalCatalogPolicyTouched() }
    else if (useSelectedProviderOverride()) { selectedProviderPolicyDraft().startupSyncPolicy = value; markSelectedProviderCatalogPolicyTouched() }
  },
})
const activeCatalogPickerOpenSyncPolicy = computed<CatalogAutoSyncPolicy>({
  get: () => useSelectedProviderOverride() ? selectedProviderPolicyDraft().pickerOpenSyncPolicy : catalogPickerOpenSyncPolicy.value,
  set: (value) => {
    if (catalogPolicyTarget.value === 'global') { catalogPickerOpenSyncPolicy.value = value; markGlobalCatalogPolicyTouched() }
    else if (useSelectedProviderOverride()) { selectedProviderPolicyDraft().pickerOpenSyncPolicy = value; markSelectedProviderCatalogPolicyTouched() }
  },
})
const activeCatalogListUpdateMode = computed<CatalogListUpdateMode>({
  get: () => useSelectedProviderOverride() ? selectedProviderPolicyDraft().listApplyMode : catalogListUpdateMode.value,
  set: (value) => {
    if (catalogPolicyTarget.value === 'global') { catalogListUpdateMode.value = value; markGlobalCatalogPolicyTouched() }
    else if (useSelectedProviderOverride()) { selectedProviderPolicyDraft().listApplyMode = value; markSelectedProviderCatalogPolicyTouched() }
  },
})
const activeCatalogFreshnessMs = computed<number | null>({
  get: () => useSelectedProviderOverride() ? selectedProviderPolicyDraft().freshnessMs : catalogFreshnessMs.value,
  set: (value) => {
    if (catalogPolicyTarget.value === 'global') { catalogFreshnessMs.value = value; markGlobalCatalogPolicyTouched() }
    else if (useSelectedProviderOverride()) { selectedProviderPolicyDraft().freshnessMs = value; markSelectedProviderCatalogPolicyTouched() }
  },
})
const activeCatalogRetentionMs = computed<CatalogRetentionMs>({
  get: () => useSelectedProviderOverride() ? selectedProviderPolicyDraft().retentionMs : catalogRetentionMs.value,
  set: (value) => {
    if (catalogPolicyTarget.value === 'global') { catalogRetentionMs.value = value; markGlobalCatalogPolicyTouched() }
    else if (useSelectedProviderOverride()) { selectedProviderPolicyDraft().retentionMs = value; markSelectedProviderCatalogPolicyTouched() }
  },
})
const activeCatalogFreshnessChoice = computed<string>({
  get: () => activeCatalogFreshnessMs.value === null
    ? 'unset'
    : (CATALOG_FRESHNESS_PRESETS_MS as readonly number[]).includes(activeCatalogFreshnessMs.value)
      ? String(activeCatalogFreshnessMs.value)
      : 'custom',
  set: (value) => {
    if (value === 'unset') activeCatalogFreshnessMs.value = null
    else if (value === 'custom') {
      if (activeCatalogFreshnessMs.value === null) activeCatalogFreshnessMs.value = DEFAULT_CATALOG_FRESHNESS_MS
    } else activeCatalogFreshnessMs.value = Number(value)
  },
})
const activeCatalogRetentionChoice = computed<string>({
  get: () => activeCatalogRetentionMs.value === 'never'
    ? 'never'
    : (CATALOG_RETENTION_PRESETS_MS as readonly number[]).includes(activeCatalogRetentionMs.value)
      ? String(activeCatalogRetentionMs.value)
      : 'custom',
  set: (value) => {
    if (value === 'never') activeCatalogRetentionMs.value = 'never'
    else if (value === 'custom') {
      if (activeCatalogRetentionMs.value === 'never') activeCatalogRetentionMs.value = DEFAULT_CATALOG_RETENTION_MS
    } else activeCatalogRetentionMs.value = Number(value)
  },
})
const activeCatalogFreshnessCanBeUnset = computed(() =>
  activeCatalogStartupSyncPolicy.value === 'never' && activeCatalogPickerOpenSyncPolicy.value === 'never')

watch([activeCatalogStartupSyncPolicy, activeCatalogPickerOpenSyncPolicy], () => {
  if (!activeCatalogFreshnessCanBeUnset.value && activeCatalogFreshnessMs.value === null) {
    activeCatalogFreshnessMs.value = DEFAULT_CATALOG_FRESHNESS_MS
  }
})

function setActiveCatalogFreshnessFromInput(event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isSafeInteger(value) && value >= 0) activeCatalogFreshnessMs.value = value
}

function setActiveCatalogRetentionFromInput(event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isSafeInteger(value) && value >= 0) activeCatalogRetentionMs.value = value
}
const catalogPolicyControlsDisabled = computed(() =>
  !canEdit.value ||
  loading.value ||
  saving.value ||
  (catalogPolicyTarget.value === 'provider_override' && !useSelectedProviderOverride()),
)
const requireParameters = ref(false)
const debugEchoUpstreamBody = ref(false)
type CredentialOperation = 'status' | 'update' | 'clear'
const credentialPendingOperations = ref<Partial<Record<ProviderCatalogKnownProviderKey, CredentialOperation>>>({})
const credentialOperationTokens = new Map<ProviderCatalogKnownProviderKey, symbol>()

function credentialOperationPending(providerKey: ProviderCatalogKnownProviderKey): boolean {
  return credentialPendingOperations.value[providerKey] !== undefined
}

function beginCredentialOperation(providerKey: ProviderCatalogKnownProviderKey, operation: CredentialOperation): symbol | null {
  if (credentialOperationPending(providerKey)) return null
  const token = Symbol(`${providerKey}:${operation}`)
  credentialOperationTokens.set(providerKey, token)
  credentialPendingOperations.value = { ...credentialPendingOperations.value, [providerKey]: operation }
  return token
}

function credentialOperationIsCurrent(providerKey: ProviderCatalogKnownProviderKey, token: symbol): boolean {
  return credentialOperationTokens.get(providerKey) === token
}

function finishCredentialOperation(providerKey: ProviderCatalogKnownProviderKey, token: symbol) {
  if (!credentialOperationIsCurrent(providerKey, token)) return
  credentialOperationTokens.delete(providerKey)
  const next = { ...credentialPendingOperations.value }
  delete next[providerKey]
  credentialPendingOperations.value = next
}
const requestedReasoningEffort = ref<'auto' | ReasoningEffort>('auto')
const requestedReasoningExclude = ref(false)
const reasoningPanelDefaultExpanded = ref(true)
const userMessageRenderDefault = ref(false)
const maxRecentModelsDraft = ref('8')
const webSearchDefaults = ref<SearchSettingsLayer | null>(null)
const generationParamsDefaults = ref<GenerationParamsLayer | null>(null)
const netExpDisableHttp2 = ref(DEFAULT_NETEXP_SETTINGS.disableHttp2)
const netExpDisableQuic = ref(DEFAULT_NETEXP_SETTINGS.disableQuic)
const netExpStreamInMainProcess = ref(DEFAULT_NETEXP_SETTINGS.streamInMainProcess)
const netExpForceHttp1 = ref(DEFAULT_NETEXP_SETTINGS.forceHttp1)
const netExpKeepAliveEnable = ref(DEFAULT_NETEXP_SETTINGS.tcpKeepAliveEnable)
const netExpKeepAliveIdleMs = ref(DEFAULT_NETEXP_SETTINGS.tcpKeepAliveIdleMs)
const netExpInitial = ref<NetExpSettings>(DEFAULT_NETEXP_SETTINGS)
const netExpRuntime = ref<NetExpRuntimeInfo | null>(null)
const networkProxyMode = ref<NetworkProxyMode>(DEFAULT_NETWORK_PROXY_SETTINGS.proxyMode)
const networkProxyManualUrl = ref(DEFAULT_NETWORK_PROXY_SETTINGS.manualProxyUrl)
const networkProxyNoProxy = ref(DEFAULT_NETWORK_PROXY_SETTINGS.noProxy)
const networkProxyStrictSsl = ref(DEFAULT_NETWORK_PROXY_SETTINGS.strictSSL)
const networkProxyProbeLoading = ref(false)
const networkProxyProbeResult = ref<LibreOfficeProxyProbeResult | null>(null)
const localEndpointUrl = ref('http://localhost:1234')
const localEndpointProbeLoading = ref(false)
const localEndpointProbeResult = ref<LocalEndpointProbeResult | null>(null)
const localEndpointStreamProbeLoading = ref(false)
const localEndpointStreamProbeResult = ref<LocalEndpointStreamProbeResult | null>(null)

const langPrefs = useLanguagePrefs()
const langMode = ref<LocaleMode>('manual')
const langManualLocale = ref<SupportedLocale>('zh-CN')

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const errorFailure = ref<ProviderFailureV2 | null>(null)
const savedMessage = ref<string | null>(null)
const catalogClearLoading = ref<'current' | 'all' | null>(null)

watch(requestedReasoningEffort, (value) => {
  if (value === 'auto' || value === 'none') {
    if (requestedReasoningExclude.value) requestedReasoningExclude.value = false
  }
})

const storeAvailable = computed(() => !!getElectronStore())
const canEdit = computed(() => !props.disabled && !props.isRunning && storeAvailable.value)
const localEndpointDiagnosticsAvailable = computed(() => !!getLocalEndpointDiagnosticsBridge())
const canProbeLocalEndpoint = computed(() => !props.disabled && !props.isRunning && localEndpointDiagnosticsAvailable.value)
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
const DEFAULT_REASONING_PREFS: ReasoningPrefs = { mode: 'auto', effort: 'auto', exclude: false }
const REASONING_EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const catalogAutoSyncPolicyOptions: ReadonlyArray<Readonly<{ value: CatalogAutoSyncPolicy; labelKey: string }>> = [
  { value: 'always', labelKey: 'settings.catalog.syncPolicyAlways' },
  { value: 'stale_only', labelKey: 'settings.catalog.syncPolicyStaleOnly' },
  { value: 'never', labelKey: 'settings.catalog.syncPolicyNever' },
]
const catalogListUpdateModeOptions: ReadonlyArray<Readonly<{ value: CatalogListUpdateMode; labelKey: string }>> = [
  { value: 'automatic', labelKey: 'settings.catalog.listUpdateAutomatic' },
  { value: 'manual', labelKey: 'settings.catalog.listUpdateManual' },
]
const catalogFreshnessOptions: ReadonlyArray<Readonly<{ value: number; labelKey: string }>> = [
  { value: CATALOG_FRESHNESS_PRESETS_MS[0], labelKey: 'settings.catalog.freshness15m' },
  { value: CATALOG_FRESHNESS_PRESETS_MS[1], labelKey: 'settings.catalog.freshness1h' },
  { value: CATALOG_FRESHNESS_PRESETS_MS[2], labelKey: 'settings.catalog.freshness6h' },
  { value: CATALOG_FRESHNESS_PRESETS_MS[3], labelKey: 'settings.catalog.freshness24h' },
  { value: CATALOG_FRESHNESS_PRESETS_MS[4], labelKey: 'settings.catalog.freshness7d' },
]
const catalogRetentionOptions: ReadonlyArray<Readonly<{ value: CatalogRetentionMs; labelKey: string }>> = [
  { value: CATALOG_RETENTION_PRESETS_MS[0], labelKey: 'settings.catalog.retention7d' },
  { value: CATALOG_RETENTION_PRESETS_MS[1], labelKey: 'settings.catalog.retention30d' },
  { value: CATALOG_RETENTION_PRESETS_MS[2], labelKey: 'settings.catalog.retention90d' },
  { value: CATALOG_RETENTION_PRESETS_MS[3], labelKey: 'settings.catalog.retention180d' },
  { value: 'never', labelKey: 'settings.catalog.retentionNever' },
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

function credentialPresenceLabel(presence: CredentialPresence): string {
  if (presence === 'configured') return t('settings.credentials.configured')
  if (presence === 'unconfigured') return t('settings.credentials.notConfigured')
  return t('settings.credentials.unknown')
}

function credentialStorageLabel(backend: ProviderCredentialBackendKind | undefined, configured: boolean, sessionOverridesPersistent = false): string {
  if (!configured) return ''
  if (backend === 'session') return ` · ${t(sessionOverridesPersistent ? 'settings.credentials.sessionOverridesPersistent' : 'settings.credentials.sessionOnly')}`
  if (backend === 'plaintext') return ` · ${t('settings.credentials.plaintextStored')}`
  return ''
}

function credentialIssueSummary(issue: CredentialIssue): string {
  const code = issue.failure.starverseDiagnosticCode
  return issue.message.includes(code) ? issue.message : `${code}: ${issue.message}`
}

type CredentialStatusWithAvailability = Readonly<{
  apiKeyConfigured: boolean
  backend?: ProviderCredentialBackendKind
  sessionOverridesPersistent?: boolean
  credentialAvailability?: CredentialAvailability
  credentialDiagnosticCode?: string
}>

function isCredentialStatus(value: unknown): value is CredentialStatusWithAvailability {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    typeof (value as { apiKeyConfigured?: unknown }).apiKeyConfigured === 'boolean')
}

function credentialAvailabilityIssue(
  status: CredentialStatusWithAvailability,
  providerKey: ProviderCatalogKnownProviderKey | 'anthropic',
): CredentialIssue | null {
  if (status.apiKeyConfigured !== true || status.credentialAvailability !== 'unavailable') return null
  const code = status.credentialDiagnosticCode || 'OS_CREDENTIAL_DECRYPT_FAILED'
  const fallbackMessage = code === 'EPOCH2_RUNTIME_CREDENTIAL_INVALID'
    ? t('settings.credentials.systemCredentialRecordInvalid')
    : t('settings.credentials.systemCredentialDecryptUnavailable')
  return credentialIssueFromUnknown({
    providerKey: providerKey as ProviderCatalogKnownProviderKey,
    operation: 'status',
    fallbackMessage,
    result: { code, message: fallbackMessage },
  })
}

function credentialIssueFromUnknown(input: Readonly<{
  providerKey: ProviderCatalogKnownProviderKey
  operation: 'status' | 'update' | 'clear'
  fallbackMessage: string
  error?: unknown
  result?: Readonly<{ code?: string; message?: string; providerFailure?: ProviderFailureV2 }>
}>): CredentialIssue {
  const resultFailure = input.result?.providerFailure
  const diagnosticCode = input.result?.code || resultFailure?.starverseDiagnosticCode ||
    (input.operation === 'status' ? 'PROVIDER_CREDENTIAL_STATUS_FAILED' :
      input.operation === 'update' ? 'PROVIDER_CREDENTIAL_UPDATE_FAILED' : 'PROVIDER_CREDENTIAL_CLEAR_FAILED')
  const source = input.error ?? new Error(input.result?.message || diagnosticCode)
  const failure = resultFailure ?? providerFailureFromUnknownV2(source, {
    origin: 'ipc_bridge',
    phase: 'terminal_persistence',
    providerId: input.providerKey,
    contractId: `credential-settings:${input.providerKey}`,
    operationId: `credential:${input.operation}:${input.providerKey}`,
    requestSequence: 1,
    starverseDiagnosticCode: diagnosticCode,
  })
  return Object.freeze({
    message: input.result?.message || providerFailurePrimaryMessageV2(failure) || input.fallbackMessage,
    failure,
  })
}

function applyOpenRouterCredentialStatus(status: OpenRouterCredentialStatus) {
  apiKey.value = ''
  openRouterCredentialPresence.value = status.apiKeyConfigured === true ? 'configured' : 'unconfigured'
  maskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  openRouterCredentialBackend.value = status.backend
  openRouterSessionOverridesPersistent.value = status.sessionOverridesPersistent === true
  credentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
  openRouterCredentialIssue.value = credentialAvailabilityIssue(status, 'openrouter')
}

function markOpenRouterCredentialUnknown(issue: CredentialIssue) {
  openRouterCredentialPresence.value = 'unknown'
  maskedApiKey.value = ''
  credentialWarnings.value = []
  openRouterCredentialIssue.value = issue
}

function applyOpenAIResponsesCredentialStatus(status: OpenAIResponsesCredentialStatus) {
  openAIResponsesApiKey.value = ''
  openAIResponsesCredentialPresence.value = status.apiKeyConfigured === true ? 'configured' : 'unconfigured'
  openAIResponsesMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  openAIResponsesCredentialBackend.value = status.backend
  openAIResponsesSessionOverridesPersistent.value = status.sessionOverridesPersistent === true
  openAIResponsesCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
  openAIResponsesCredentialIssue.value = credentialAvailabilityIssue(status, 'openai_responses')
}

function markOpenAIResponsesCredentialUnknown(issue: CredentialIssue) {
  openAIResponsesCredentialPresence.value = 'unknown'
  openAIResponsesMaskedApiKey.value = ''
  openAIResponsesCredentialWarnings.value = []
  openAIResponsesCredentialIssue.value = issue
}

function applyGoogleAIStudioCredentialStatus(status: GoogleAIStudioCredentialStatus) {
  googleAIStudioApiKey.value = ''
  googleAIStudioCredentialPresence.value = status.apiKeyConfigured === true ? 'configured' : 'unconfigured'
  googleAIStudioMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  googleAIStudioCredentialBackend.value = status.backend
  googleAIStudioSessionOverridesPersistent.value = status.sessionOverridesPersistent === true
  googleAIStudioCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
  googleAIStudioCredentialIssue.value = credentialAvailabilityIssue(status, 'google_ai_studio')
}

function markGoogleAIStudioCredentialUnknown(issue: CredentialIssue) {
  googleAIStudioCredentialPresence.value = 'unknown'
  googleAIStudioMaskedApiKey.value = ''
  googleAIStudioCredentialWarnings.value = []
  googleAIStudioCredentialIssue.value = issue
}

function applyAnthropicCredentialStatus(status: AnthropicCredentialStatus) {
  anthropicApiKey.value = ''
  anthropicCredentialPresence.value = status.apiKeyConfigured === true ? 'configured' : 'unconfigured'
  anthropicMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  anthropicCredentialBackend.value = status.backend
  anthropicSessionOverridesPersistent.value = status.sessionOverridesPersistent === true
  anthropicCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
  anthropicCredentialIssue.value = credentialAvailabilityIssue(status, 'anthropic')
}

function markAnthropicCredentialUnknown(issue: CredentialIssue) {
  anthropicCredentialPresence.value = 'unknown'
  anthropicMaskedApiKey.value = ''
  anthropicCredentialWarnings.value = []
  anthropicCredentialIssue.value = issue
}

function applyDeepSeekCredentialStatus(status: DeepSeekCredentialStatus) {
  deepSeekApiKey.value = ''
  deepSeekCredentialPresence.value = status.apiKeyConfigured === true ? 'configured' : 'unconfigured'
  deepSeekMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  deepSeekCredentialBackend.value = status.backend
  deepSeekSessionOverridesPersistent.value = status.sessionOverridesPersistent === true
  deepSeekCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
  deepSeekCredentialIssue.value = credentialAvailabilityIssue(status, 'deepseek')
}

function markDeepSeekCredentialUnknown(issue: CredentialIssue) {
  deepSeekCredentialPresence.value = 'unknown'
  deepSeekMaskedApiKey.value = ''
  deepSeekCredentialWarnings.value = []
  deepSeekCredentialIssue.value = issue
}

async function loadProviderCredentialStatus<TStatus extends CredentialStatusWithAvailability>(input: Readonly<{
  providerKey: ProviderCatalogKnownProviderKey
  bridge: Readonly<{ getStatus: () => Promise<Readonly<{
    ok: boolean
    code?: string
    status?: TStatus
    message?: string
    providerFailure?: ProviderFailureV2
  }>> }> | null
  missingBridgeMessage: string
  statusUnavailableMessage: string
  applyStatus: (status: TStatus) => void
  markUnknown: (issue: CredentialIssue) => void
}>): Promise<void> {
  const operationToken = beginCredentialOperation(input.providerKey, 'status')
  if (!operationToken) return
  try {
    if (!input.bridge) {
      if (!credentialOperationIsCurrent(input.providerKey, operationToken)) return
      input.markUnknown(credentialIssueFromUnknown({ providerKey: input.providerKey, operation: 'status',
        fallbackMessage: input.missingBridgeMessage, error: new Error(input.missingBridgeMessage) }))
      return
    }
    const result = await input.bridge.getStatus()
    if (!credentialOperationIsCurrent(input.providerKey, operationToken)) return
    if (!result?.ok || !isCredentialStatus(result.status)) {
      input.markUnknown(credentialIssueFromUnknown({ providerKey: input.providerKey, operation: 'status',
        fallbackMessage: input.statusUnavailableMessage, result }))
      return
    }
    input.applyStatus(result.status)
  } catch (error) {
    if (!credentialOperationIsCurrent(input.providerKey, operationToken)) return
    input.markUnknown(credentialIssueFromUnknown({ providerKey: input.providerKey, operation: 'status',
      fallbackMessage: input.statusUnavailableMessage, error }))
  } finally {
    finishCredentialOperation(input.providerKey, operationToken)
  }
}

function loadOpenRouterCredentialStatus() {
  return loadProviderCredentialStatus({ providerKey: 'openrouter', bridge: getOpenRouterCredentialBridge(),
    missingBridgeMessage: t('settings.runtime.missingOpenRouterCredentialBridge'),
    statusUnavailableMessage: t('settings.runtime.openRouterCredentialStatusUnavailable'),
    applyStatus: applyOpenRouterCredentialStatus, markUnknown: markOpenRouterCredentialUnknown })
}

function loadOpenAIResponsesCredentialStatus() {
  return loadProviderCredentialStatus({ providerKey: 'openai_responses', bridge: getOpenAIResponsesCredentialBridge(),
    missingBridgeMessage: t('settings.runtime.missingOpenAIResponsesCredentialBridge'),
    statusUnavailableMessage: t('settings.runtime.openAIResponsesCredentialStatusUnavailable'),
    applyStatus: applyOpenAIResponsesCredentialStatus, markUnknown: markOpenAIResponsesCredentialUnknown })
}

function loadGoogleAIStudioCredentialStatus() {
  return loadProviderCredentialStatus({ providerKey: 'google_ai_studio', bridge: getGoogleAIStudioCredentialBridge(),
    missingBridgeMessage: t('settings.runtime.missingGoogleAIStudioCredentialBridge'),
    statusUnavailableMessage: t('settings.runtime.googleAIStudioCredentialStatusUnavailable'),
    applyStatus: applyGoogleAIStudioCredentialStatus, markUnknown: markGoogleAIStudioCredentialUnknown })
}

function loadAnthropicCredentialStatus() {
  return loadProviderCredentialStatus({ providerKey: 'anthropic_messages', bridge: getAnthropicCredentialBridge(),
    missingBridgeMessage: t('settings.runtime.missingAnthropicCredentialBridge'),
    statusUnavailableMessage: t('settings.runtime.anthropicCredentialStatusUnavailable'),
    applyStatus: applyAnthropicCredentialStatus, markUnknown: markAnthropicCredentialUnknown })
}

function loadDeepSeekCredentialStatus() {
  return loadProviderCredentialStatus({ providerKey: 'deepseek', bridge: getDeepSeekCredentialBridge(),
    missingBridgeMessage: t('settings.runtime.missingDeepSeekCredentialBridge'),
    statusUnavailableMessage: t('settings.runtime.deepSeekCredentialStatusUnavailable'),
    applyStatus: applyDeepSeekCredentialStatus, markUnknown: markDeepSeekCredentialUnknown })
}

function notifyProviderCredentialUpdated(providerKey: ProviderCatalogKnownProviderKey) {
  window.dispatchEvent(new CustomEvent('settings:providerCredentialUpdated', {
    detail: Object.freeze({ providerKey }),
  }))
}

function setCatalogProviderOverrideEnabled(enabled: boolean) {
  const providerKey = catalogSelectedProviderKey.value
  catalogProviderOverrideEnabled.value = {
    ...catalogProviderOverrideEnabled.value,
    [providerKey]: enabled,
  }
  markSelectedProviderCatalogPolicyTouched()
  if (enabled && !catalogProviderPolicyDrafts.value[providerKey]) {
    catalogProviderPolicyDrafts.value = {
      ...catalogProviderPolicyDrafts.value,
      [providerKey]: globalCatalogPolicyDraft(),
    }
  }
}

async function loadCatalogProviderPolicies(store: ElectronStoreLike) {
  const drafts: Partial<Record<ProviderCatalogKnownProviderKey, CatalogPolicyDraft>> = {}
  const enabled: Partial<Record<ProviderCatalogKnownProviderKey, boolean>> = {}
  for (const descriptor of catalogProviderDescriptors) {
    const raw = await store.get(providerCatalogPolicyV2StoreKey(descriptor.providerKey))
    try {
      if (raw !== undefined && raw !== null) {
        const policy = validateCatalogPolicyV2(raw)
        drafts[descriptor.providerKey] = {
          startupSyncPolicy: policy.startupSyncPolicy,
          pickerOpenSyncPolicy: policy.pickerOpenSyncPolicy,
          listApplyMode: policy.listApplyMode,
          freshnessMs: policy.freshnessMs,
          retentionMs: policy.retentionMs,
        }
        enabled[descriptor.providerKey] = true
        continue
      }
    } catch {
      // Invalid provider overrides stay disabled and are replaced only by an explicit global save.
    }
    drafts[descriptor.providerKey] = globalCatalogPolicyDraft()
    enabled[descriptor.providerKey] = false
  }
  catalogProviderPolicyDrafts.value = drafts
  catalogProviderOverrideEnabled.value = enabled
  catalogProviderOverrideTouched.value = {}
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function exposeCatalogFailure(value: unknown, fallbackMessage: string): void {
  const result = recordValue(value)
  const failure = result?.providerFailure && typeof result.providerFailure === 'object'
    ? result.providerFailure as ProviderFailureV2
    : null
  errorFailure.value = failure
  error.value = failure
    ? providerFailurePrimaryMessageV2(failure)
    : typeof result?.message === 'string' && result.message.trim()
      ? result.message
      : typeof result?.code === 'string' && result.code.trim()
        ? `${fallbackMessage}: ${result.code}`
      : fallbackMessage
}

async function loadCatalogProviderStatus(providerKey: ProviderCatalogKnownProviderKey) {
  const token = catalogRuntimeStore.beginQuery(providerKey)
  try {
    const items: CatalogQueryItem[] = []
    let cursor: import('@/next/modelCatalog/catalogQueryService').CatalogQueryCursor | null = null
    let first: import('@/next/modelCatalog/catalogQueryService').CatalogQueryResult | null = null
    let pages = 0
    do {
      const page = await CatalogQueryService.query({ sourceProviderKey: providerKey,
        ...(cursor?.snapshotDigest ? { snapshotDigest: cursor.snapshotDigest } : {}), page: { limit: 500, cursor } })
      if (!first) first = page
      if (page.authorityReadSucceeded === false || page.status === 'failed') {
        const failure = page.providerFailure ?? providerFailureFromUnknownV2(
          new Error(page.errorMessage ?? page.errorCode ?? 'MODEL_CATALOG_AUTHORITY_READ_FAILED'), {
            origin: 'starverse_internal', phase: 'response_body', providerId: providerKey,
            contractId: 'model-catalog-v2', operationId: `catalog-settings:${providerKey}`, requestSequence: 1,
            starverseDiagnosticCode: 'MODEL_CATALOG_SETTINGS_HYDRATION_FAILED',
          })
        catalogRuntimeStore.acceptFailure({ token, failure })
        return
      }
      items.push(...page.items)
      cursor = page.nextCursor
      pages += 1
      if (pages > 100) throw new Error('MODEL_CATALOG_RENDERER_PAGINATION_LIMIT_EXCEEDED')
    } while (cursor)
    catalogRuntimeStore.acceptAuthority({ token, authorityScopeId: first?.scopeId ?? null,
      authorityRevision: first?.authorityRevision,
      displayedSnapshotDigest: first?.catalogRevision ?? null,
      pendingSnapshotDigest: first?.pendingSnapshotDigest ?? null, items,
      stale: first?.status === 'not_synced', failure: first?.providerFailure ?? null })
  } catch (cause) {
    catalogRuntimeStore.acceptFailure({ token, failure: providerFailureFromUnknownV2(cause, {
      origin: 'starverse_internal', phase: 'response_body', providerId: providerKey,
      contractId: 'model-catalog-v2', operationId: `catalog-settings:${providerKey}`, requestSequence: 1,
      starverseDiagnosticCode: 'MODEL_CATALOG_SETTINGS_HYDRATION_FAILED',
    }) })
  }
}

async function loadAllCatalogProviderStatuses() {
  await Promise.all(catalogProviderDescriptors.map((descriptor) => loadCatalogProviderStatus(descriptor.providerKey)))
}

function catalogStatusLabel(status: CatalogProviderStatusState['status'] | undefined): string {
  return t(`settings.catalog.status.${status ?? 'unavailable'}`)
}

function formatCatalogTimestamp(value: number | null | undefined): string {
  return value ? new Date(value).toLocaleString() : t('settings.catalog.neverSynced')
}

function catalogProviderIsStale(providerKey: ProviderCatalogKnownProviderKey): boolean {
  const status = catalogProviderStatuses.value[providerKey]
  const freshnessMs = effectiveCatalogPolicyDraft(providerKey).freshnessMs
  if (!status?.lastSyncAtMs || typeof freshnessMs !== 'number' || !Number.isFinite(freshnessMs) || freshnessMs < 0) return false
  return Date.now() - status.lastSyncAtMs >= freshnessMs
}

async function load() {
  error.value = null
  savedMessage.value = null

  const store = getElectronStore()
  if (!store) {
    error.value = t('settings.runtime.missingElectronStore')
    return
  }

  loading.value = true
  try {
    await Promise.all([
      loadOpenRouterCredentialStatus(),
      loadOpenAIResponsesCredentialStatus(),
      loadGoogleAIStudioCredentialStatus(),
      loadAnthropicCredentialStatus(),
      loadDeepSeekCredentialStatus(),
    ])
    const storedCatalogPolicy = await store.get(GLOBAL_CATALOG_POLICY_V2_STORE_KEY)
    if (storedCatalogPolicy && typeof storedCatalogPolicy === 'object') {
      try {
        const policy = validateCatalogPolicyV2(storedCatalogPolicy)
        catalogGlobalPolicyConfigured.value = true
        catalogStartupSyncPolicy.value = policy.startupSyncPolicy
        catalogPickerOpenSyncPolicy.value = policy.pickerOpenSyncPolicy
        catalogListUpdateMode.value = policy.listApplyMode
        catalogFreshnessMs.value = policy.freshnessMs
        catalogRetentionMs.value = policy.retentionMs
      } catch {
        catalogGlobalPolicyConfigured.value = false
        catalogStartupSyncPolicy.value = DEFAULT_CATALOG_AUTO_SYNC_POLICY
        catalogPickerOpenSyncPolicy.value = DEFAULT_CATALOG_AUTO_SYNC_POLICY
        catalogListUpdateMode.value = DEFAULT_CATALOG_LIST_UPDATE_MODE
        catalogFreshnessMs.value = DEFAULT_CATALOG_FRESHNESS_MS
        catalogRetentionMs.value = DEFAULT_CATALOG_RETENTION_MS
        error.value = 'CATALOG_POLICY_INVALID'
      }
    } else {
      catalogGlobalPolicyConfigured.value = false
      catalogStartupSyncPolicy.value = DEFAULT_CATALOG_AUTO_SYNC_POLICY
      catalogPickerOpenSyncPolicy.value = DEFAULT_CATALOG_AUTO_SYNC_POLICY
      catalogListUpdateMode.value = DEFAULT_CATALOG_LIST_UPDATE_MODE
      catalogFreshnessMs.value = DEFAULT_CATALOG_FRESHNESS_MS
      catalogRetentionMs.value = DEFAULT_CATALOG_RETENTION_MS
    }
    catalogGlobalPolicyTouched.value = false
    await loadCatalogProviderPolicies(store)
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
    const proxySettings = await getNetworkProxySettings()
    networkProxyMode.value = proxySettings.proxyMode
    networkProxyManualUrl.value = proxySettings.manualProxyUrl
    networkProxyNoProxy.value = proxySettings.noProxy
    networkProxyStrictSsl.value = true
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
      generationParamsDefaults.value = normalizeGenerationParamsLayer(await getGenerationParamsDefaults())
    } catch {
      generationParamsDefaults.value = null
    }
    await loadAllCatalogProviderStatuses()
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
    error.value = t('settings.runtime.missingElectronStore')
    return
  }

  const nextMaxRecentModels = parsePositiveIntegerText(maxRecentModelsDraft.value)
  if (nextMaxRecentModels === null) {
    error.value = t('settings.runtime.maxRecentModelsPositiveInteger')
    return
  }

  saving.value = true
  try {
    if (catalogGlobalPolicyConfigured.value && catalogGlobalPolicyTouched.value) {
      await store.set(GLOBAL_CATALOG_POLICY_V2_STORE_KEY, validateCatalogPolicyV2({
        startupSyncPolicy: catalogStartupSyncPolicy.value,
        pickerOpenSyncPolicy: catalogPickerOpenSyncPolicy.value,
        listApplyMode: catalogListUpdateMode.value,
        freshnessMs: catalogFreshnessMs.value,
        retentionMs: catalogRetentionMs.value,
      }))
      catalogGlobalPolicyTouched.value = false
    }
    for (const descriptor of catalogProviderDescriptors) {
      const providerKey = descriptor.providerKey
      if (catalogProviderOverrideTouched.value[providerKey] !== true) continue
      const storeKey = providerCatalogPolicyV2StoreKey(providerKey)
      if (catalogProviderOverrideEnabled.value[providerKey] === true) {
        const draft = catalogProviderPolicyDrafts.value[providerKey] ?? globalCatalogPolicyDraft()
        await store.set(storeKey, validateCatalogPolicyV2(draft))
      } else {
        await store.delete(storeKey)
      }
    }
    catalogProviderOverrideTouched.value = {}
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
    await setNetworkProxySettings(normalizeNetworkProxySettings({
      proxyMode: networkProxyMode.value,
      manualProxyUrl: networkProxyManualUrl.value,
      noProxy: networkProxyNoProxy.value,
      strictSSL: true,
    }))
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
    const normalizedGenerationParamsDefaults = normalizeGenerationParamsLayer(generationParamsDefaults.value)
    await setWebSearchDefaults(normalizedWebSearchDefaults)
    await setGenerationParamsDefaults(normalizedGenerationParamsDefaults)
    try {
      window.dispatchEvent(new CustomEvent('settings:reasoningPrefsUpdated', { detail: nextReasoningPrefs }))
      window.dispatchEvent(new CustomEvent('settings:reasoningPanelDefaultExpandedUpdated', { detail: reasoningPanelDefaultExpanded.value === true }))
      window.dispatchEvent(new CustomEvent('settings:userMessageRenderDefaultUpdated', { detail: userMessageRenderDefault.value === true }))
      window.dispatchEvent(new CustomEvent('settings:webSearchDefaultsUpdated', { detail: normalizedWebSearchDefaults }))
      window.dispatchEvent(new CustomEvent('settings:generationParamsDefaultsUpdated', { detail: normalizedGenerationParamsDefaults }))
      window.dispatchEvent(new CustomEvent('settings:maxRecentModelsUpdated', { detail: nextMaxRecentModels }))
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

async function clearProviderCredential<TStatus extends Readonly<{ apiKeyConfigured: boolean }>>(input: Readonly<{
  providerKey: ProviderCatalogKnownProviderKey
  bridge: Readonly<{ clear: () => Promise<Readonly<{
    ok: boolean
    code?: string
    status?: TStatus
    message?: string
    providerFailure?: ProviderFailureV2
  }>> }> | null
  missingBridgeMessage: string
  clearFailedMessage: string
  clearedMessage: string
  applyStatus: (status: TStatus) => void
  markUnknown: (issue: CredentialIssue) => void
  finishEditing: () => void
  clearInput?: () => void
  onCleared?: () => void
}>): Promise<void> {
  const operationToken = beginCredentialOperation(input.providerKey, 'clear')
  if (!operationToken) return
  error.value = null
  errorFailure.value = null
  savedMessage.value = null
  try {
    if (!input.bridge) {
      if (!credentialOperationIsCurrent(input.providerKey, operationToken)) return
      const issue = credentialIssueFromUnknown({ providerKey: input.providerKey, operation: 'clear',
        fallbackMessage: input.missingBridgeMessage, error: new Error(input.missingBridgeMessage) })
      input.markUnknown(issue)
      error.value = issue.message
      errorFailure.value = issue.failure
      return
    }
    const result = await input.bridge.clear()
    if (!credentialOperationIsCurrent(input.providerKey, operationToken)) return
    if (!result?.ok || !isCredentialStatus(result.status)) {
      const issue = credentialIssueFromUnknown({ providerKey: input.providerKey, operation: 'clear',
        fallbackMessage: input.clearFailedMessage, result })
      input.markUnknown(issue)
      error.value = issue.message
      errorFailure.value = issue.failure
      return
    }
    input.applyStatus(result.status)
    input.clearInput?.()
    input.finishEditing()
    savedMessage.value = input.clearedMessage
    notifyProviderCredentialUpdated(input.providerKey)
    input.onCleared?.()
  } catch (cause) {
    if (!credentialOperationIsCurrent(input.providerKey, operationToken)) return
    const issue = credentialIssueFromUnknown({ providerKey: input.providerKey, operation: 'clear',
      fallbackMessage: input.clearFailedMessage, error: cause })
    input.markUnknown(issue)
    error.value = issue.message
    errorFailure.value = issue.failure
  } finally {
    finishCredentialOperation(input.providerKey, operationToken)
  }
}

function clearApiKey() {
  return clearProviderCredential({ providerKey: 'openrouter', bridge: getOpenRouterCredentialBridge(),
    missingBridgeMessage: t('settings.runtime.missingOpenRouterCredentialBridge'),
    clearFailedMessage: t('settings.runtime.openRouterCredentialClearFailed'),
    clearedMessage: t('settings.openrouter.apiKeyCleared'), applyStatus: applyOpenRouterCredentialStatus,
    markUnknown: markOpenRouterCredentialUnknown, finishEditing: () => { openRouterCredentialEditing.value = false },
    onCleared: () => {
      try {
        window.dispatchEvent(new CustomEvent('settings:openRouterConnectionUpdated', {
          detail: { hasApiKey: false, baseUrlChanged: false, reason: 'api_key_cleared' },
        }))
      } catch {
        // no-op
      }
    } })
}

async function testNetworkProxyConnection() {
  error.value = null
  savedMessage.value = null
  networkProxyProbeResult.value = null
  networkProxyProbeLoading.value = true
  try {
    await setNetworkProxySettings(normalizeNetworkProxySettings({
      proxyMode: networkProxyMode.value,
      manualProxyUrl: networkProxyManualUrl.value,
      noProxy: networkProxyNoProxy.value,
      strictSSL: true,
    }))
    networkProxyProbeResult.value = await probeLibreOfficeOfficialDownloadNetwork()
    savedMessage.value = networkProxyProbeResult.value.ok ? t('settings.runtime.proxyProbePassed') : null
    if (!networkProxyProbeResult.value.ok) {
      error.value = tf('settings.runtime.proxyProbeFailedWithDiagnostic', { diagnostic: networkProxyProbeResult.value.terminalDiagnostic })
    }
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : t('settings.runtime.proxyProbeFailed')
  } finally {
    networkProxyProbeLoading.value = false
  }
}

function clearOpenAIResponsesApiKey() {
  return clearProviderCredential({ providerKey: 'openai_responses', bridge: getOpenAIResponsesCredentialBridge(),
    missingBridgeMessage: t('settings.runtime.missingOpenAIResponsesCredentialBridge'),
    clearFailedMessage: t('settings.runtime.openAIResponsesCredentialClearFailed'),
    clearedMessage: t('settings.runtime.openAIResponsesApiKeyCleared'), applyStatus: applyOpenAIResponsesCredentialStatus,
    markUnknown: markOpenAIResponsesCredentialUnknown, finishEditing: () => { openAIResponsesCredentialEditing.value = false } })
}

function clearGoogleAIStudioApiKey() {
  return clearProviderCredential({ providerKey: 'google_ai_studio', bridge: getGoogleAIStudioCredentialBridge(),
    missingBridgeMessage: t('settings.runtime.missingGoogleAIStudioCredentialBridge'),
    clearFailedMessage: t('settings.runtime.googleAIStudioCredentialClearFailed'),
    clearedMessage: t('settings.runtime.googleAIStudioApiKeyCleared'), applyStatus: applyGoogleAIStudioCredentialStatus,
    markUnknown: markGoogleAIStudioCredentialUnknown, finishEditing: () => { googleAIStudioCredentialEditing.value = false } })
}

function clearAnthropicApiKey() {
  return clearProviderCredential({ providerKey: 'anthropic_messages', bridge: getAnthropicCredentialBridge(),
    missingBridgeMessage: t('settings.runtime.missingAnthropicCredentialBridge'),
    clearFailedMessage: t('settings.runtime.anthropicCredentialClearFailed'),
    clearedMessage: t('settings.runtime.anthropicApiKeyCleared'), applyStatus: applyAnthropicCredentialStatus,
    markUnknown: markAnthropicCredentialUnknown, finishEditing: () => { anthropicCredentialEditing.value = false } })
}

function clearDeepSeekApiKey() {
  return clearProviderCredential({ providerKey: 'deepseek', bridge: getDeepSeekCredentialBridge(),
    missingBridgeMessage: t('settings.runtime.missingDeepSeekCredentialBridge'),
    clearFailedMessage: t('settings.runtime.deepSeekCredentialClearFailed'),
    clearedMessage: t('settings.runtime.deepSeekApiKeyCleared'), applyStatus: applyDeepSeekCredentialStatus,
    markUnknown: markDeepSeekCredentialUnknown, finishEditing: () => { deepSeekCredentialEditing.value = false } })
}

async function applyProviderCredential<TStatus extends Readonly<{ apiKeyConfigured: boolean }>>(input: Readonly<{
  providerKey: ProviderCatalogKnownProviderKey
  apiKey: string
  bridge: Readonly<{ update: (payload: Readonly<{ apiKey?: string; storageMode?: CredentialStorageMode }>) => Promise<Readonly<{
    ok: boolean
    code?: string
    status?: TStatus
    message?: string
    providerFailure?: ProviderFailureV2
  }>> }> | null
  missingBridgeMessage: string
  updateFailedMessage: string
  applyStatus: (status: TStatus) => void
  markUnknown: (issue: CredentialIssue) => void
  finishEditing: () => void
  clearInput: () => void
  storageMode?: CredentialStorageMode
}>): Promise<void> {
  error.value = null
  errorFailure.value = null
  savedMessage.value = null
  const apiKeyValue = input.apiKey.trim()
  if (!apiKeyValue) return
  const operationToken = beginCredentialOperation(input.providerKey, 'update')
  if (!operationToken) return
  try {
    if (!input.bridge) {
      const issue = credentialIssueFromUnknown({ providerKey: input.providerKey, operation: 'update',
        fallbackMessage: input.missingBridgeMessage, error: new Error(input.missingBridgeMessage) })
      input.markUnknown(issue)
      error.value = issue.message
      errorFailure.value = issue.failure
      return
    }
    const result = await input.bridge.update(input.storageMode === undefined
      ? { apiKey: apiKeyValue }
      : { apiKey: apiKeyValue, storageMode: input.storageMode })
    if (!credentialOperationIsCurrent(input.providerKey, operationToken)) return
    if (!result.ok && (result.code === 'EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED' ||
        result.code === 'EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE') && input.storageMode === undefined) {
      credentialFallbackProvider.value = input.providerKey
      credentialFallbackApiKey.value = apiKeyValue
      return
    }
    if (!result.ok || !isCredentialStatus(result.status)) {
      const issue = credentialIssueFromUnknown({ providerKey: input.providerKey, operation: 'update',
        fallbackMessage: input.updateFailedMessage, result })
      input.markUnknown(issue)
      error.value = issue.message
      errorFailure.value = issue.failure
      return
    }
    input.applyStatus(result.status)
    input.clearInput()
    input.finishEditing()
    notifyProviderCredentialUpdated(input.providerKey)
    savedMessage.value = t('common.saved')
  } catch (cause) {
    if (!credentialOperationIsCurrent(input.providerKey, operationToken)) return
    const issue = credentialIssueFromUnknown({ providerKey: input.providerKey, operation: 'update',
      fallbackMessage: input.updateFailedMessage, error: cause })
    input.markUnknown(issue)
    error.value = issue.message
    errorFailure.value = issue.failure
  } finally {
    finishCredentialOperation(input.providerKey, operationToken)
  }
}

function beginOpenRouterCredentialEdit() { apiKey.value = ''; openRouterCredentialEditing.value = true }
function cancelOpenRouterCredentialEdit() { apiKey.value = ''; openRouterCredentialEditing.value = false }
function beginOpenAIResponsesCredentialEdit() { openAIResponsesApiKey.value = ''; openAIResponsesCredentialEditing.value = true }
function cancelOpenAIResponsesCredentialEdit() { openAIResponsesApiKey.value = ''; openAIResponsesCredentialEditing.value = false }
function beginGoogleAIStudioCredentialEdit() { googleAIStudioApiKey.value = ''; googleAIStudioCredentialEditing.value = true }
function cancelGoogleAIStudioCredentialEdit() { googleAIStudioApiKey.value = ''; googleAIStudioCredentialEditing.value = false }
function beginAnthropicCredentialEdit() { anthropicApiKey.value = ''; anthropicCredentialEditing.value = true }
function cancelAnthropicCredentialEdit() { anthropicApiKey.value = ''; anthropicCredentialEditing.value = false }
function beginDeepSeekCredentialEdit() { deepSeekApiKey.value = ''; deepSeekCredentialEditing.value = true }
function cancelDeepSeekCredentialEdit() { deepSeekApiKey.value = ''; deepSeekCredentialEditing.value = false }

function applyOpenRouterCredential(storageMode?: CredentialStorageMode) {
  return applyProviderCredential({ providerKey: 'openrouter', apiKey: apiKey.value,
    bridge: getOpenRouterCredentialBridge(), missingBridgeMessage: t('settings.runtime.missingOpenRouterCredentialBridge'),
    updateFailedMessage: t('settings.runtime.openRouterCredentialUpdateFailed'), applyStatus: applyOpenRouterCredentialStatus,
    markUnknown: markOpenRouterCredentialUnknown, finishEditing: () => { openRouterCredentialEditing.value = false }, clearInput: () => { apiKey.value = '' }, storageMode })
}

function applyOpenAIResponsesCredential(storageMode?: CredentialStorageMode) {
  return applyProviderCredential({ providerKey: 'openai_responses', apiKey: openAIResponsesApiKey.value,
    bridge: getOpenAIResponsesCredentialBridge(), missingBridgeMessage: t('settings.runtime.missingOpenAIResponsesCredentialBridge'),
    updateFailedMessage: t('settings.runtime.openAIResponsesCredentialUpdateFailed'), applyStatus: applyOpenAIResponsesCredentialStatus,
    markUnknown: markOpenAIResponsesCredentialUnknown, finishEditing: () => { openAIResponsesCredentialEditing.value = false }, clearInput: () => { openAIResponsesApiKey.value = '' }, storageMode })
}

function applyGoogleAIStudioCredential(storageMode?: CredentialStorageMode) {
  return applyProviderCredential({ providerKey: 'google_ai_studio', apiKey: googleAIStudioApiKey.value,
    bridge: getGoogleAIStudioCredentialBridge(), missingBridgeMessage: t('settings.runtime.missingGoogleAIStudioCredentialBridge'),
    updateFailedMessage: t('settings.runtime.googleAIStudioCredentialUpdateFailed'), applyStatus: applyGoogleAIStudioCredentialStatus,
    markUnknown: markGoogleAIStudioCredentialUnknown, finishEditing: () => { googleAIStudioCredentialEditing.value = false }, clearInput: () => { googleAIStudioApiKey.value = '' }, storageMode })
}

function applyAnthropicCredential(storageMode?: CredentialStorageMode) {
  return applyProviderCredential({ providerKey: 'anthropic_messages', apiKey: anthropicApiKey.value,
    bridge: getAnthropicCredentialBridge(), missingBridgeMessage: t('settings.runtime.missingAnthropicCredentialBridge'),
    updateFailedMessage: t('settings.runtime.anthropicCredentialUpdateFailed'), applyStatus: applyAnthropicCredentialStatus,
    markUnknown: markAnthropicCredentialUnknown, finishEditing: () => { anthropicCredentialEditing.value = false }, clearInput: () => { anthropicApiKey.value = '' }, storageMode })
}

function applyDeepSeekCredential(storageMode?: CredentialStorageMode) {
  return applyProviderCredential({ providerKey: 'deepseek', apiKey: deepSeekApiKey.value,
    bridge: getDeepSeekCredentialBridge(), missingBridgeMessage: t('settings.runtime.missingDeepSeekCredentialBridge'),
    updateFailedMessage: t('settings.runtime.deepSeekCredentialUpdateFailed'), applyStatus: applyDeepSeekCredentialStatus,
    markUnknown: markDeepSeekCredentialUnknown, finishEditing: () => { deepSeekCredentialEditing.value = false }, clearInput: () => { deepSeekApiKey.value = '' }, storageMode })
}

function dismissCredentialFallback() {
  credentialFallbackProvider.value = null
  credentialFallbackApiKey.value = ''
}

function applyCredentialFallback(storageMode: Extract<CredentialStorageMode, 'session' | 'plaintext'>) {
  const providerKey = credentialFallbackProvider.value
  const apiKeyValue = credentialFallbackApiKey.value
  if (!providerKey || !apiKeyValue) return dismissCredentialFallback()
  if (providerKey === 'openrouter') { apiKey.value = apiKeyValue; dismissCredentialFallback(); return applyOpenRouterCredential(storageMode) }
  if (providerKey === 'openai_responses') { openAIResponsesApiKey.value = apiKeyValue; dismissCredentialFallback(); return applyOpenAIResponsesCredential(storageMode) }
  if (providerKey === 'google_ai_studio') { googleAIStudioApiKey.value = apiKeyValue; dismissCredentialFallback(); return applyGoogleAIStudioCredential(storageMode) }
  if (providerKey === 'anthropic_messages') { anthropicApiKey.value = apiKeyValue; dismissCredentialFallback(); return applyAnthropicCredential(storageMode) }
  deepSeekApiKey.value = apiKeyValue; dismissCredentialFallback(); return applyDeepSeekCredential(storageMode)
}

async function refreshCatalogProvider(providerKey: ProviderCatalogKnownProviderKey) {
  error.value = null
  errorFailure.value = null
  savedMessage.value = null
  const token = catalogRuntimeStore.beginMutation(providerKey)
  try {
    const draft = effectiveCatalogPolicyDraft(providerKey)
    const result = await CatalogQueryService.sync({
      sourceProviderKey: providerKey,
      timeoutMs: 30_000,
      retentionMs: draft.retentionMs,
      applyMode: draft.listApplyMode,
    }) as Record<string, unknown>
    if (result.ok !== true) {
      const failure = result.providerFailure && typeof result.providerFailure === 'object'
        ? result.providerFailure as ProviderFailureV2
        : providerFailureFromUnknownV2(new Error(String(result.message ?? result.code ?? 'MODEL_CATALOG_SYNC_FAILED')), {
            origin: 'starverse_internal', phase: 'response_body', providerId: providerKey,
            contractId: 'model-catalog-v2', operationId: `catalog-settings:${providerKey}`, requestSequence: 1,
            starverseDiagnosticCode: 'MODEL_CATALOG_SYNC_FAILED',
          })
      catalogRuntimeStore.acceptFailure({ token, failure })
      exposeCatalogFailure(result, t('settings.catalog.operationFailed'))
      return
    }
    if (result.status === 'pending' && typeof result.pendingSnapshotDigest === 'string') {
      const current = catalogRuntimeStore.read(providerKey)
      catalogRuntimeStore.acceptAuthority({
        token,
        authorityScopeId: typeof result.scopeId === 'string' ? result.scopeId : current.authorityScopeId,
        authorityRevision: typeof result.authorityRevision === 'number' ? result.authorityRevision : undefined,
        displayedSnapshotDigest: current.displayedSnapshotDigest,
        pendingSnapshotDigest: result.pendingSnapshotDigest,
        items: current.items,
        stale: current.stale,
        failure: null,
      })
      return
    }
    CatalogQueryService.invalidateProviderRuntimeCache(providerKey)
    await loadCatalogProviderStatus(providerKey)
  } catch (cause) {
    const failure = providerFailureFromUnknownV2(cause, { origin: 'starverse_internal', phase: 'response_body',
      providerId: providerKey, contractId: 'model-catalog-v2', operationId: `catalog-settings:${providerKey}`,
      requestSequence: 1, starverseDiagnosticCode: 'MODEL_CATALOG_SYNC_FAILED' })
    catalogRuntimeStore.acceptFailure({ token, failure })
    errorFailure.value = failure
    error.value = providerFailurePrimaryMessageV2(failure)
  }
}

async function applyPendingCatalogProvider(providerKey: ProviderCatalogKnownProviderKey) {
  const snapshotDigest = catalogProviderPendingRevisions.value[providerKey]
  if (!snapshotDigest) return
  error.value = null
  errorFailure.value = null
  const token = catalogRuntimeStore.beginMutation(providerKey)
  try {
    const result = await CatalogQueryService.applyPending({
      sourceProviderKey: providerKey,
      snapshotDigest,
    }) as Record<string, unknown>
    if (result.ok !== true) {
      const failure = result.providerFailure && typeof result.providerFailure === 'object'
        ? result.providerFailure as ProviderFailureV2
        : providerFailureFromUnknownV2(new Error(String(result.message ?? result.code ?? 'MODEL_CATALOG_APPLY_FAILED')), {
            origin: 'starverse_internal', phase: 'response_body', providerId: providerKey,
            contractId: 'model-catalog-v2', operationId: `catalog-settings:${providerKey}`, requestSequence: 1,
            starverseDiagnosticCode: 'MODEL_CATALOG_APPLY_FAILED',
          })
      catalogRuntimeStore.acceptFailure({ token, failure })
      exposeCatalogFailure(result, t('settings.catalog.operationFailed'))
      return
    }
    const current = catalogRuntimeStore.read(providerKey)
    catalogRuntimeStore.acceptAuthority({
      token,
      authorityScopeId: typeof result.scopeId === 'string' ? result.scopeId : current.authorityScopeId,
      authorityRevision: typeof result.authorityRevision === 'number' ? result.authorityRevision : undefined,
      displayedSnapshotDigest: snapshotDigest,
      pendingSnapshotDigest: null,
      items: current.items,
      stale: false,
      failure: null,
    })
    CatalogQueryService.invalidateProviderRuntimeCache(providerKey)
    await loadCatalogProviderStatus(providerKey)
  } catch (cause) {
    const failure = providerFailureFromUnknownV2(cause, { origin: 'starverse_internal', phase: 'response_body',
      providerId: providerKey, contractId: 'model-catalog-v2', operationId: `catalog-settings:${providerKey}`,
      requestSequence: 1, starverseDiagnosticCode: 'MODEL_CATALOG_APPLY_FAILED' })
    catalogRuntimeStore.acceptFailure({ token, failure })
    errorFailure.value = failure
    error.value = providerFailurePrimaryMessageV2(failure)
  }
}

async function discardPendingCatalogProvider(providerKey: ProviderCatalogKnownProviderKey) {
  const snapshotDigest = catalogProviderPendingRevisions.value[providerKey]
  if (!snapshotDigest) return
  error.value = null
  errorFailure.value = null
  const token = catalogRuntimeStore.beginMutation(providerKey)
  try {
    const result = await CatalogQueryService.discardPending({
      sourceProviderKey: providerKey,
      snapshotDigest,
    }) as Record<string, unknown>
    if (result.ok !== true) {
      const failure = result.providerFailure && typeof result.providerFailure === 'object'
        ? result.providerFailure as ProviderFailureV2
        : providerFailureFromUnknownV2(new Error(String(result.message ?? result.code ?? 'MODEL_CATALOG_DISCARD_FAILED')), {
            origin: 'starverse_internal', phase: 'response_body', providerId: providerKey,
            contractId: 'model-catalog-v2', operationId: `catalog-settings:${providerKey}`, requestSequence: 1,
            starverseDiagnosticCode: 'MODEL_CATALOG_DISCARD_FAILED',
          })
      catalogRuntimeStore.acceptFailure({ token, failure })
      exposeCatalogFailure(result, t('settings.catalog.operationFailed'))
      return
    }
    const current = catalogRuntimeStore.read(providerKey)
    catalogRuntimeStore.acceptAuthority({
      token,
      authorityScopeId: typeof result.scopeId === 'string' ? result.scopeId : current.authorityScopeId,
      authorityRevision: typeof result.authorityRevision === 'number' ? result.authorityRevision : undefined,
      displayedSnapshotDigest: current.displayedSnapshotDigest,
      pendingSnapshotDigest: null,
      items: current.items,
      stale: current.stale,
      failure: null,
    })
    CatalogQueryService.invalidateProviderRuntimeCache(providerKey)
    await loadCatalogProviderStatus(providerKey)
  } catch (cause) {
    const failure = providerFailureFromUnknownV2(cause, { origin: 'starverse_internal', phase: 'response_body',
      providerId: providerKey, contractId: 'model-catalog-v2', operationId: `catalog-settings:${providerKey}`,
      requestSequence: 1, starverseDiagnosticCode: 'MODEL_CATALOG_DISCARD_FAILED' })
    catalogRuntimeStore.acceptFailure({ token, failure })
    errorFailure.value = failure
    error.value = providerFailurePrimaryMessageV2(failure)
  }
}

function catalogProviderCredentialConfigured(providerKey: ProviderCatalogKnownProviderKey): boolean {
  switch (providerKey) {
    case 'openrouter': return apiKeyConfigured.value || Boolean(apiKey.value.trim())
    case 'openai_responses': return openAIResponsesApiKeyConfigured.value || Boolean(openAIResponsesApiKey.value.trim())
    case 'google_ai_studio': return googleAIStudioApiKeyConfigured.value || Boolean(googleAIStudioApiKey.value.trim())
    case 'anthropic_messages': return anthropicApiKeyConfigured.value || Boolean(anthropicApiKey.value.trim())
    case 'deepseek': return deepSeekApiKeyConfigured.value || Boolean(deepSeekApiKey.value.trim())
  }
}

async function clearCurrentCatalogCache() {
  error.value = null
  errorFailure.value = null
  savedMessage.value = null
  const providerKey = catalogSelectedProviderKey.value
  if (!catalogProviderCredentialConfigured(providerKey)) {
    error.value = t('settings.catalog.credentialRequired')
    return
  }
  if (!window.confirm(tf('settings.catalog.cacheClearCurrentConfirm', { provider: providerKey }))) return
  catalogClearLoading.value = 'current'
  try {
    const result = await CatalogQueryService.clearCurrent({ sourceProviderKey: providerKey }) as Record<string, unknown>
    if (result.ok !== true) {
      exposeCatalogFailure(result, t('settings.catalog.cacheClearFailed'))
      return
    }
    savedMessage.value = tf('settings.catalog.cacheClearCurrentSuccess', { provider: providerKey })
    await loadCatalogProviderStatus(providerKey)
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    catalogClearLoading.value = null
  }
}

async function clearAllCatalogCaches() {
  error.value = null
  errorFailure.value = null
  savedMessage.value = null
  const providerKey = catalogSelectedProviderKey.value
  if (!window.confirm(tf('settings.catalog.cacheClearAllConfirm', { provider: providerKey }))) return
  catalogClearLoading.value = 'all'
  try {
    const result = await CatalogQueryService.clearAll({ sourceProviderKey: providerKey }) as Record<string, unknown>
    if (result.ok !== true) {
      exposeCatalogFailure(result, t('settings.catalog.cacheClearFailed'))
      return
    }
    savedMessage.value = tf('settings.catalog.cacheClearAllSuccess', { provider: providerKey })
    await loadCatalogProviderStatus(providerKey)
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    catalogClearLoading.value = null
  }
}

function safeLocalEndpointChatUrlForStorage(): string {
  const value = localEndpointUrl.value.trim()
  if (!value) return ''
  const probeResult = localEndpointProbeResult.value
  if (probeResult?.ok) return probeResult.diagnostics.safeBaseUrl
  if (probeResult && !probeResult.ok && probeResult.safeUrl) return probeResult.safeUrl
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return value
  }
}

function applyLocalEndpointChatSettings() {
  const endpointUrl = safeLocalEndpointChatUrlForStorage()
  if (!endpointUrl) return

  try {
    globalThis.localStorage?.setItem(LOCAL_ENDPOINT_CHAT_URL_KEY, endpointUrl)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(LOCAL_ENDPOINT_CHAT_SETTINGS_EVENT, {
        detail: { endpointUrl },
      }))
    }
    savedMessage.value = t('common.saved') + ''
  } catch {
    error.value = 'LocalEndpoint endpoint URL could not be saved locally.'
  }
}

async function probeLocalEndpoint() {
  error.value = null
  savedMessage.value = null
  localEndpointProbeResult.value = null
  localEndpointStreamProbeResult.value = null

  const bridge = getLocalEndpointDiagnosticsBridge()
  if (!bridge) {
    localEndpointProbeResult.value = {
      ok: false,
      code: 'bridge_unavailable',
      message: t('settings.localEndpoint.bridgeUnavailable'),
    }
    return
  }

  localEndpointProbeLoading.value = true
  try {
    localEndpointProbeResult.value = await bridge.probe({
      url: localEndpointUrl.value,
      timeoutMs: 5000,
    })
  } catch {
    localEndpointProbeResult.value = {
      ok: false,
      code: 'probe_failed',
      message: 'Local endpoint probe failed safely.',
    }
  } finally {
    localEndpointProbeLoading.value = false
  }
}

async function streamProbeLocalEndpoint() {
  error.value = null
  savedMessage.value = null
  localEndpointStreamProbeResult.value = null

  const bridge = getLocalEndpointDiagnosticsBridge()
  if (!bridge) {
    localEndpointStreamProbeResult.value = {
      ok: false,
      code: 'bridge_unavailable',
      message: t('settings.localEndpoint.bridgeUnavailable'),
    }
    return
  }

  localEndpointStreamProbeLoading.value = true
  try {
    localEndpointStreamProbeResult.value = await bridge.streamProbe({
      url: localEndpointUrl.value,
      timeoutMs: 5000,
    })
  } catch {
    localEndpointStreamProbeResult.value = {
      ok: false,
      code: 'stream_probe_failed',
      message: 'Local endpoint stream probe failed safely.',
    }
  } finally {
    localEndpointStreamProbeLoading.value = false
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
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="credentialFallbackProvider" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
      <div class="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div class="text-sm font-semibold text-gray-900">{{ t('settings.credentials.secureStorageUnavailableTitle') }}</div>
        <p class="mt-2 text-sm text-gray-700">{{ t('settings.credentials.secureStorageUnavailableBody') }}</p>
        <p v-if="plaintextCredentialPersistenceSupported" class="mt-2 text-sm font-medium text-red-700">{{ t('settings.credentials.plaintextWarning') }}</p>
        <div class="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" class="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" @click="applyCredentialFallback('session')">{{ t('settings.credentials.sessionOnly') }}</button>
          <button v-if="plaintextCredentialPersistenceSupported" data-testid="settings-save-plaintext-credential" type="button" class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100" @click="applyCredentialFallback('plaintext')">{{ t('settings.credentials.savePlaintext') }}</button>
          <button type="button" class="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" @click="dismissCredentialFallback">{{ t('common.cancel') }}</button>
        </div>
      </div>
    </div>
    <div class="px-4 pt-4 text-sm font-semibold text-gray-900">{{ t('settings.title') }}</div>

    <div class="mt-3 space-y-3 px-4">
      <div v-if="error" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
        {{ error }}
        <ProviderFailureDetailsV2 v-if="errorFailure" class="mt-2" :failure="errorFailure" />
      </div>
      <div v-else-if="savedMessage" class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
        {{ savedMessage }}
      </div>
    </div>

    <div class="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden px-4 md:grid-cols-[12rem_minmax(0,1fr)]">
      <nav
        class="flex gap-1 overflow-x-auto border-b border-gray-200 pb-2 md:flex-col md:overflow-x-visible md:border-b-0 md:border-r md:pb-0 md:pr-3"
        role="tablist"
        :aria-label="t('settings.categories.navigationLabel')"
        data-testid="settings-category-navigation"
      >
        <button
          v-for="category in SETTINGS_CATEGORIES"
          :id="settingsCategoryTabId(category.id)"
          :key="category.id"
          type="button"
          role="tab"
          class="shrink-0 rounded-md px-3 py-2 text-left text-xs font-medium outline-none ring-blue-300 transition focus:ring-2"
          :class="activeCategory === category.id ? 'bg-blue-50 text-blue-800' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
          :aria-selected="activeCategory === category.id"
          :aria-controls="settingsCategoryPanelId(category.id)"
          :tabindex="activeCategory === category.id ? 0 : -1"
          :data-testid="`settings-category-${category.id}`"
          @click="selectSettingsCategory(category.id)"
          @keydown="onSettingsCategoryKeydown($event, category.id)"
        >
          {{ t(category.labelKey) }}
        </button>
      </nav>

      <div class="min-h-0 overflow-y-auto pb-4">
        <section
          :id="settingsCategoryPanelId('general')"
          v-show="activeCategory === 'general'"
          role="tabpanel"
          :aria-labelledby="settingsCategoryTabId('general')"
          class="space-y-3"
          data-testid="settings-pane-general"
        >

          <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('common.language') }}</div>
        <div class="mt-1 text-[11px] text-gray-500">{{ t('settings.categories.immediateActionHint') }}</div>

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

        </section>

        <section
          :id="settingsCategoryPanelId('providers')"
          v-show="activeCategory === 'providers'"
          role="tabpanel"
          :aria-labelledby="settingsCategoryTabId('providers')"
          class="space-y-3"
          data-testid="settings-pane-providers"
        >
          <div class="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-900" data-testid="settings-child-owned-actions">
            {{ t('settings.categories.childOwnedActionHint') }}
          </div>

          <CompatibleProviderSettingsPanel :disabled="props.disabled || props.isRunning" />

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.openrouter.title') }}</div>
        <div class="mt-1 text-[11px] text-gray-500" data-testid="settings-openrouter-explicit-runtime-note">
          {{ t('settings.openrouter.explicitProviderDesc') }}
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">{{ t('settings.openrouter.apiKey') }}</label>
        <div class="mt-1 flex items-center justify-between gap-3">
          <span
            class="text-[11px] font-semibold"
            :class="openRouterCredentialPresence === 'unknown' ? 'text-red-700' : 'text-gray-700'"
            data-testid="settings-openrouter-key-status"
          >
            {{ credentialPresenceLabel(openRouterCredentialPresence) }}{{ credentialStorageLabel(openRouterCredentialBackend, openRouterCredentialPresence === 'configured', openRouterSessionOverridesPersistent) }}
          </span>
          <div class="flex items-center gap-2">
            <button
              v-if="openRouterCredentialPresence === 'configured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('openrouter')"
              data-testid="settings-openrouter-edit-key"
              @click="beginOpenRouterCredentialEdit"
            >{{ t('settings.credentials.replace') }}</button>
            <button
              v-else-if="openRouterCredentialPresence === 'unconfigured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('openrouter')"
              data-testid="settings-openrouter-edit-key"
              @click="beginOpenRouterCredentialEdit"
            >{{ t('settings.credentials.add') }}</button>
            <button
              v-else
              type="button"
              class="rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50"
              :disabled="loading || saving || credentialOperationPending('openrouter')"
              data-testid="settings-openrouter-retry-status"
              @click="loadOpenRouterCredentialStatus"
            >{{ t('common.retry') }}</button>
            <button
              v-if="openRouterCredentialPresence === 'configured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('openrouter')"
              data-testid="settings-openrouter-clear-key"
              @click="clearApiKey"
            >{{ t('common.clear') }}</button>
          </div>
        </div>
        <div v-if="openRouterCredentialEditing" class="mt-2 flex items-center gap-2">
          <input
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            type="password"
            :placeholder="t('settings.openrouter.apiKeyPlaceholder')"
            :disabled="!canEdit || loading || saving || credentialOperationPending('openrouter')"
            data-testid="settings-openrouter-api-key"
            v-model="apiKey"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('openrouter') || !apiKey.trim()"
            data-testid="settings-openrouter-apply-key"
            @click="() => applyOpenRouterCredential()"
          >
            {{ t('common.save') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('openrouter')"
            data-testid="settings-openrouter-cancel-key"
            @click="cancelOpenRouterCredentialEdit"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
        <div v-if="openRouterCredentialIssue" class="mt-2 text-[11px] text-red-700" data-testid="settings-openrouter-credential-error">
          {{ credentialIssueSummary(openRouterCredentialIssue) }}
          <ProviderFailureDetailsV2 :failure="openRouterCredentialIssue.failure" test-id-prefix="settings-openrouter-credential-failure" />
        </div>
        <div v-if="credentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-openrouter-credential-warnings">
          <div v-for="warning in credentialWarnings" :key="warning">{{ warning }}</div>
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

      </div>

      <div class="rounded-lg border border-blue-200 bg-white p-3" data-testid="settings-openai-responses-experimental">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-blue-800">{{ t('settings.experimentalChat.openAIResponses.title') }}</div>
            <div class="mt-1 text-[11px] text-gray-500">
              {{ t('settings.experimentalChat.openAIResponses.desc') }}
            </div>
          </div>
          <span class="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800">
            {{ t('settings.experimentalChat.experimentalBadge') }}
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">{{ t('settings.experimentalChat.openAIResponses.apiKeyLabel') }}</label>
        <div class="mt-1 flex items-center justify-between gap-3">
          <span
            class="text-[11px] font-semibold"
            :class="openAIResponsesCredentialPresence === 'unknown' ? 'text-red-700' : 'text-gray-700'"
            data-testid="settings-openai-responses-key-status"
          >{{ credentialPresenceLabel(openAIResponsesCredentialPresence) }}{{ credentialStorageLabel(openAIResponsesCredentialBackend, openAIResponsesCredentialPresence === 'configured', openAIResponsesSessionOverridesPersistent) }}</span>
          <div class="flex items-center gap-2">
            <button
              v-if="openAIResponsesCredentialPresence === 'configured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('openai_responses')"
              data-testid="settings-openai-responses-edit-key"
              @click="beginOpenAIResponsesCredentialEdit"
            >{{ t('settings.credentials.replace') }}</button>
            <button
              v-else-if="openAIResponsesCredentialPresence === 'unconfigured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('openai_responses')"
              data-testid="settings-openai-responses-edit-key"
              @click="beginOpenAIResponsesCredentialEdit"
            >{{ t('settings.credentials.add') }}</button>
            <button
              v-else
              type="button"
              class="rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50"
              :disabled="loading || saving || credentialOperationPending('openai_responses')"
              data-testid="settings-openai-responses-retry-status"
              @click="loadOpenAIResponsesCredentialStatus"
            >{{ t('common.retry') }}</button>
            <button
              v-if="openAIResponsesCredentialPresence === 'configured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('openai_responses')"
              data-testid="settings-openai-responses-clear-key"
              @click="clearOpenAIResponsesApiKey"
            >{{ t('common.clear') }}</button>
          </div>
        </div>
        <div v-if="openAIResponsesCredentialEditing" class="mt-2 flex items-center gap-2">
          <input
            v-model="openAIResponsesApiKey"
            type="password"
            :placeholder="t('settings.experimentalChat.placeholder.openAIKey')"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('openai_responses')"
            data-testid="settings-openai-responses-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('openai_responses') || !openAIResponsesApiKey.trim()"
            data-testid="settings-openai-responses-apply-key"
            @click="() => applyOpenAIResponsesCredential()"
          >
            {{ t('common.save') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('openai_responses')"
            data-testid="settings-openai-responses-cancel-key"
            @click="cancelOpenAIResponsesCredentialEdit"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
        <div v-if="openAIResponsesCredentialIssue" class="mt-2 text-[11px] text-red-700" data-testid="settings-openai-responses-credential-error">
          {{ credentialIssueSummary(openAIResponsesCredentialIssue) }}
          <ProviderFailureDetailsV2 :failure="openAIResponsesCredentialIssue.failure" test-id-prefix="settings-openai-responses-credential-failure" />
        </div>
        <div v-if="openAIResponsesCredentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-openai-responses-credential-warnings">
          <div v-for="warning in openAIResponsesCredentialWarnings" :key="warning">{{ warning }}</div>
        </div>

      </div>

      <div class="rounded-lg border border-emerald-200 bg-white p-3" data-testid="settings-google-ai-studio-experimental">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-emerald-800">{{ t('settings.experimentalChat.googleAIStudio.title') }}</div>
            <div class="mt-1 text-[11px] text-gray-500">
              {{ t('settings.experimentalChat.googleAIStudio.desc') }}
            </div>
          </div>
          <span class="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
            {{ t('settings.experimentalChat.experimentalBadge') }}
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">{{ t('settings.experimentalChat.googleAIStudio.apiKeyLabel') }}</label>
        <div class="mt-1 flex items-center justify-between gap-3">
          <span
            class="text-[11px] font-semibold"
            :class="googleAIStudioCredentialPresence === 'unknown' ? 'text-red-700' : 'text-gray-700'"
            data-testid="settings-google-ai-studio-key-status"
          >{{ credentialPresenceLabel(googleAIStudioCredentialPresence) }}{{ credentialStorageLabel(googleAIStudioCredentialBackend, googleAIStudioCredentialPresence === 'configured', googleAIStudioSessionOverridesPersistent) }}</span>
          <div class="flex items-center gap-2">
            <button
              v-if="googleAIStudioCredentialPresence === 'configured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('google_ai_studio')"
              data-testid="settings-google-ai-studio-edit-key"
              @click="beginGoogleAIStudioCredentialEdit"
            >{{ t('settings.credentials.replace') }}</button>
            <button
              v-else-if="googleAIStudioCredentialPresence === 'unconfigured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('google_ai_studio')"
              data-testid="settings-google-ai-studio-edit-key"
              @click="beginGoogleAIStudioCredentialEdit"
            >{{ t('settings.credentials.add') }}</button>
            <button
              v-else
              type="button"
              class="rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50"
              :disabled="loading || saving || credentialOperationPending('google_ai_studio')"
              data-testid="settings-google-ai-studio-retry-status"
              @click="loadGoogleAIStudioCredentialStatus"
            >{{ t('common.retry') }}</button>
            <button
              v-if="googleAIStudioCredentialPresence === 'configured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('google_ai_studio')"
              data-testid="settings-google-ai-studio-clear-key"
              @click="clearGoogleAIStudioApiKey"
            >{{ t('common.clear') }}</button>
          </div>
        </div>
        <div v-if="googleAIStudioCredentialEditing" class="mt-2 flex items-center gap-2">
          <input
            v-model="googleAIStudioApiKey"
            type="password"
            :placeholder="t('settings.experimentalChat.placeholder.geminiKey')"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('google_ai_studio')"
            data-testid="settings-google-ai-studio-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('google_ai_studio') || !googleAIStudioApiKey.trim()"
            data-testid="settings-google-ai-studio-apply-key"
            @click="() => applyGoogleAIStudioCredential()"
          >
            {{ t('common.save') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('google_ai_studio')"
            data-testid="settings-google-ai-studio-cancel-key"
            @click="cancelGoogleAIStudioCredentialEdit"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
        <div v-if="googleAIStudioCredentialIssue" class="mt-2 text-[11px] text-red-700" data-testid="settings-google-ai-studio-credential-error">
          {{ credentialIssueSummary(googleAIStudioCredentialIssue) }}
          <ProviderFailureDetailsV2 :failure="googleAIStudioCredentialIssue.failure" test-id-prefix="settings-google-ai-studio-credential-failure" />
        </div>
        <div v-if="googleAIStudioCredentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-google-ai-studio-credential-warnings">
          <div v-for="warning in googleAIStudioCredentialWarnings" :key="warning">{{ warning }}</div>
        </div>

      </div>

      <div class="rounded-lg border border-rose-200 bg-white p-3" data-testid="settings-anthropic-experimental">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-rose-800">{{ t('settings.experimentalChat.anthropic.title') }}</div>
            <div class="mt-1 text-[11px] text-gray-500">
              {{ t('settings.experimentalChat.anthropic.desc') }}
            </div>
          </div>
          <span class="shrink-0 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800">
            {{ t('settings.experimentalChat.experimentalBadge') }}
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">{{ t('settings.experimentalChat.anthropic.apiKeyLabel') }}</label>
        <div class="mt-1 flex items-center justify-between gap-3">
          <span
            class="text-[11px] font-semibold"
            :class="anthropicCredentialPresence === 'unknown' ? 'text-red-700' : 'text-gray-700'"
            data-testid="settings-anthropic-key-status"
          >{{ credentialPresenceLabel(anthropicCredentialPresence) }}{{ credentialStorageLabel(anthropicCredentialBackend, anthropicCredentialPresence === 'configured', anthropicSessionOverridesPersistent) }}</span>
          <div class="flex items-center gap-2">
            <button
              v-if="anthropicCredentialPresence === 'configured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('anthropic_messages')"
              data-testid="settings-anthropic-edit-key"
              @click="beginAnthropicCredentialEdit"
            >{{ t('settings.credentials.replace') }}</button>
            <button
              v-else-if="anthropicCredentialPresence === 'unconfigured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('anthropic_messages')"
              data-testid="settings-anthropic-edit-key"
              @click="beginAnthropicCredentialEdit"
            >{{ t('settings.credentials.add') }}</button>
            <button
              v-else
              type="button"
              class="rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50"
              :disabled="loading || saving || credentialOperationPending('anthropic_messages')"
              data-testid="settings-anthropic-retry-status"
              @click="loadAnthropicCredentialStatus"
            >{{ t('common.retry') }}</button>
            <button
              v-if="anthropicCredentialPresence === 'configured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('anthropic_messages')"
              data-testid="settings-anthropic-clear-key"
              @click="clearAnthropicApiKey"
            >{{ t('common.clear') }}</button>
          </div>
        </div>
        <div v-if="anthropicCredentialEditing" class="mt-2 flex items-center gap-2">
          <input
            v-model="anthropicApiKey"
            type="password"
            :placeholder="t('settings.experimentalChat.placeholder.anthropicKey')"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('anthropic_messages')"
            data-testid="settings-anthropic-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('anthropic_messages') || !anthropicApiKey.trim()"
            data-testid="settings-anthropic-apply-key"
            @click="() => applyAnthropicCredential()"
          >
            {{ t('common.save') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('anthropic_messages')"
            data-testid="settings-anthropic-cancel-key"
            @click="cancelAnthropicCredentialEdit"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
        <div v-if="anthropicCredentialIssue" class="mt-2 text-[11px] text-red-700" data-testid="settings-anthropic-credential-error">
          {{ credentialIssueSummary(anthropicCredentialIssue) }}
          <ProviderFailureDetailsV2 :failure="anthropicCredentialIssue.failure" test-id-prefix="settings-anthropic-credential-failure" />
        </div>
        <div v-if="anthropicCredentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-anthropic-credential-warnings">
          <div v-for="warning in anthropicCredentialWarnings" :key="warning">{{ warning }}</div>
        </div>

      </div>

      <div class="rounded-lg border border-cyan-200 bg-white p-3" data-testid="settings-deepseek-experimental">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-cyan-800">{{ t('settings.experimentalChat.deepSeek.title') }}</div>
            <div class="mt-1 text-[11px] text-gray-500">
              {{ t('settings.experimentalChat.deepSeek.desc') }}
            </div>
          </div>
          <span class="shrink-0 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-800">
            {{ t('settings.experimentalChat.experimentalBadge') }}
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">{{ t('settings.experimentalChat.deepSeek.apiKeyLabel') }}</label>
        <div class="mt-1 flex items-center justify-between gap-3">
          <span
            class="text-[11px] font-semibold"
            :class="deepSeekCredentialPresence === 'unknown' ? 'text-red-700' : 'text-gray-700'"
            data-testid="settings-deepseek-key-status"
          >{{ credentialPresenceLabel(deepSeekCredentialPresence) }}{{ credentialStorageLabel(deepSeekCredentialBackend, deepSeekCredentialPresence === 'configured', deepSeekSessionOverridesPersistent) }}</span>
          <div class="flex items-center gap-2">
            <button
              v-if="deepSeekCredentialPresence === 'configured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('deepseek')"
              data-testid="settings-deepseek-edit-key"
              @click="beginDeepSeekCredentialEdit"
            >{{ t('settings.credentials.replace') }}</button>
            <button
              v-else-if="deepSeekCredentialPresence === 'unconfigured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('deepseek')"
              data-testid="settings-deepseek-edit-key"
              @click="beginDeepSeekCredentialEdit"
            >{{ t('settings.credentials.add') }}</button>
            <button
              v-else
              type="button"
              class="rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50"
              :disabled="loading || saving || credentialOperationPending('deepseek')"
              data-testid="settings-deepseek-retry-status"
              @click="loadDeepSeekCredentialStatus"
            >{{ t('common.retry') }}</button>
            <button
              v-if="deepSeekCredentialPresence === 'configured'"
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!canEdit || loading || saving || credentialOperationPending('deepseek')"
              data-testid="settings-deepseek-clear-key"
              @click="clearDeepSeekApiKey"
            >{{ t('common.clear') }}</button>
          </div>
        </div>
        <div v-if="deepSeekCredentialEditing" class="mt-2 flex items-center gap-2">
          <input
            v-model="deepSeekApiKey"
            type="password"
            :placeholder="t('settings.experimentalChat.placeholder.deepSeekKey')"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('deepseek')"
            data-testid="settings-deepseek-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('deepseek') || !deepSeekApiKey.trim()"
            data-testid="settings-deepseek-apply-key"
            @click="() => applyDeepSeekCredential()"
          >
            {{ t('common.save') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialOperationPending('deepseek')"
            data-testid="settings-deepseek-cancel-key"
            @click="cancelDeepSeekCredentialEdit"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
        <div v-if="deepSeekCredentialIssue" class="mt-2 text-[11px] text-red-700" data-testid="settings-deepseek-credential-error">
          {{ credentialIssueSummary(deepSeekCredentialIssue) }}
          <ProviderFailureDetailsV2 :failure="deepSeekCredentialIssue.failure" test-id-prefix="settings-deepseek-credential-failure" />
        </div>
        <div v-if="deepSeekCredentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-deepseek-credential-warnings">
          <div v-for="warning in deepSeekCredentialWarnings" :key="warning">{{ warning }}</div>
        </div>

      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3" data-testid="settings-local-endpoint-diagnostics">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.localEndpoint.title') }}</div>
            <div class="mt-1 text-[11px] text-gray-500">{{ t('settings.localEndpoint.desc') }}</div>
          </div>
          <span class="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
            {{ t('settings.localEndpoint.diagnosticsOnly') }}
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">{{ t('settings.localEndpoint.urlLabel') }}</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="localEndpointUrl"
            type="url"
            placeholder="http://localhost:1234"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            :disabled="!canProbeLocalEndpoint || loading || saving || localEndpointProbeLoading || localEndpointStreamProbeLoading"
            data-testid="settings-local-endpoint-url"
          />
          <button
            type="button"
            class="rounded-md border border-blue-600 bg-white px-3 py-2 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-50 disabled:opacity-50"
            :disabled="!canProbeLocalEndpoint || loading || saving || localEndpointProbeLoading || localEndpointStreamProbeLoading"
            data-testid="settings-local-endpoint-probe"
            @click="probeLocalEndpoint"
          >
            {{ localEndpointProbeLoading ? t('settings.localEndpoint.probing') : t('settings.localEndpoint.testProbe') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-blue-600 bg-white px-3 py-2 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-50 disabled:opacity-50"
            :disabled="!canProbeLocalEndpoint || loading || saving || localEndpointProbeLoading || localEndpointStreamProbeLoading"
            data-testid="settings-local-endpoint-stream-probe"
            @click="streamProbeLocalEndpoint"
          >
            {{ localEndpointStreamProbeLoading ? t('settings.localEndpoint.testing') : t('settings.localEndpoint.testStreaming') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-amber-700 bg-amber-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-800 disabled:opacity-50"
            :disabled="!canProbeLocalEndpoint || loading || saving || localEndpointProbeLoading || localEndpointStreamProbeLoading || !localEndpointUrl.trim()"
            data-testid="settings-local-endpoint-save-url"
            @click="applyLocalEndpointChatSettings"
          >
            保存端点
          </button>
        </div>

        <div
          v-if="localEndpointProbeResult"
          class="mt-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-700"
          data-testid="settings-local-endpoint-probe-result"
        >
          <template v-if="localEndpointProbeResult.ok">
            <div>
              {{ t('settings.localEndpoint.statusLabel') }}
              <span data-testid="settings-local-endpoint-probe-status">{{ localEndpointProbeResult.diagnostics.status }}</span>
              · {{ t('settings.localEndpoint.familyLabel') }}
              <span data-testid="settings-local-endpoint-probe-family">{{ localEndpointProbeResult.diagnostics.endpointFamily }}</span>
            </div>
            <div class="mt-1">{{ t('settings.localEndpoint.endpointLabel') }} {{ localEndpointProbeResult.diagnostics.safeBaseUrl }}</div>
            <div class="mt-1">
              {{ t('settings.localEndpoint.modelsLabel') }}
              <span v-if="localEndpointProbeResult.diagnostics.modelList.ok" data-testid="settings-local-endpoint-probe-models">
                {{ localEndpointProbeResult.diagnostics.modelList.models.length ? localEndpointProbeResult.diagnostics.modelList.models.join(', ') : t('settings.localEndpoint.noModelsFound') }}
                <span v-if="localEndpointProbeResult.diagnostics.modelList.truncated"> {{ t('settings.localEndpoint.truncated') }}</span>
              </span>
              <span v-else data-testid="settings-local-endpoint-probe-models">
                {{ tf('settings.localEndpoint.modelListFailed', { message: localEndpointProbeResult.diagnostics.modelList.message }) }}
              </span>
            </div>
            <div class="mt-1" data-testid="settings-local-endpoint-probe-capabilities">
              {{ t('settings.localEndpoint.textCapabilitySummary') }}
            </div>
          </template>
          <template v-else>
            <div data-testid="settings-local-endpoint-probe-error">
              {{ localEndpointProbeResult.message }}
            </div>
          </template>
        </div>

        <div
          v-if="localEndpointStreamProbeResult"
          class="mt-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-700"
          data-testid="settings-local-endpoint-stream-probe-result"
        >
          <template v-if="localEndpointStreamProbeResult.ok">
            <div>
              {{ t('settings.localEndpoint.streamLabel') }}
              <span data-testid="settings-local-endpoint-stream-status">{{ localEndpointStreamProbeResult.diagnostics.status }}</span>
              · {{ t('settings.localEndpoint.familyLabel') }}
              <span data-testid="settings-local-endpoint-stream-family">{{ localEndpointStreamProbeResult.diagnostics.endpointFamily }}</span>
            </div>
            <div class="mt-1">{{ t('settings.localEndpoint.endpointLabel') }} {{ localEndpointStreamProbeResult.diagnostics.safeBaseUrl }}</div>
            <div class="mt-1" data-testid="settings-local-endpoint-stream-evidence">
              {{ t('settings.localEndpoint.evidenceLabel') }} {{ localEndpointStreamProbeResult.diagnostics.evidence }}
              <span v-if="localEndpointStreamProbeResult.diagnostics.textDeltaPreview">
                · {{ localEndpointStreamProbeResult.diagnostics.textDeltaPreview }}
              </span>
            </div>
            <div class="mt-1" data-testid="settings-local-endpoint-stream-capabilities">
              {{ t('settings.localEndpoint.streamingCapabilitySummary') }}
            </div>
          </template>
          <template v-else>
            <div data-testid="settings-local-endpoint-stream-error">
              {{ localEndpointStreamProbeResult.message }}
            </div>
          </template>
        </div>
      </div>
        </section>

        <section
          :id="settingsCategoryPanelId('model-catalog')"
          v-show="activeCategory === 'model-catalog'"
          role="tabpanel"
          :aria-labelledby="settingsCategoryTabId('model-catalog')"
          class="space-y-3"
          data-testid="settings-pane-model-catalog"
        >
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.catalog.policyTitle') }}</div>
            <div class="mt-1 text-[11px] text-gray-500">{{ t('settings.catalog.policyDesc') }}</div>

            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.catalog.policyTarget') }}</span>
                <select
                  v-model="catalogPolicyTarget"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :disabled="!canEdit || loading || saving"
                  data-testid="settings-catalog-policy-target"
                >
                  <option value="global">{{ t('settings.catalog.globalPolicy') }}</option>
                  <option value="provider_override">{{ t('settings.catalog.providerOverride') }}</option>
                </select>
              </label>

              <label v-if="catalogPolicyTarget === 'provider_override'" class="block">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.catalog.provider') }}</span>
                <select
                  v-model="catalogSelectedProviderKey"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  :disabled="!canEdit || loading || saving"
                  data-testid="settings-catalog-policy-provider"
                >
                  <option v-for="descriptor in catalogProviderDescriptors" :key="descriptor.providerKey" :value="descriptor.providerKey">
                    {{ descriptor.displayName }}
                  </option>
                </select>
              </label>
            </div>

            <label
              v-if="catalogPolicyTarget === 'provider_override'"
              class="mt-3 flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-700"
            >
              <input
                type="checkbox"
                :checked="catalogProviderOverrideEnabled[catalogSelectedProviderKey] === true"
                :disabled="!canEdit || loading || saving"
                data-testid="settings-catalog-provider-override-enabled"
                @change="setCatalogProviderOverrideEnabled(($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t('settings.catalog.overrideGlobalPolicy') }}</span>
            </label>

            <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label class="block">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.catalog.startupSyncPolicy') }}</span>
                <select
                  v-model="activeCatalogStartupSyncPolicy"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:bg-gray-50"
                  :disabled="catalogPolicyControlsDisabled"
                  data-testid="settings-catalog-startup-sync-policy"
                >
                  <option v-for="option in catalogAutoSyncPolicyOptions" :key="`startup-${option.value}`" :value="option.value">
                    {{ t(option.labelKey) }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.catalog.pickerOpenSyncPolicy') }}</span>
                <select
                  v-model="activeCatalogPickerOpenSyncPolicy"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:bg-gray-50"
                  :disabled="catalogPolicyControlsDisabled"
                  data-testid="settings-catalog-picker-open-sync-policy"
                >
                  <option v-for="option in catalogAutoSyncPolicyOptions" :key="`picker-${option.value}`" :value="option.value">
                    {{ t(option.labelKey) }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.catalog.listUpdateMode') }}</span>
                <select
                  v-model="activeCatalogListUpdateMode"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:bg-gray-50"
                  :disabled="catalogPolicyControlsDisabled"
                  data-testid="settings-catalog-list-update-mode"
                >
                  <option v-for="option in catalogListUpdateModeOptions" :key="option.value" :value="option.value">
                    {{ t(option.labelKey) }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.catalog.freshness') }}</span>
                <select
                  v-model="activeCatalogFreshnessChoice"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:bg-gray-50"
                  :disabled="catalogPolicyControlsDisabled"
                  data-testid="settings-catalog-freshness"
                >
                  <option value="unset" :disabled="!activeCatalogFreshnessCanBeUnset">{{ t('settings.catalog.durationUnset') }}</option>
                  <option v-for="option in catalogFreshnessOptions" :key="option.value" :value="String(option.value)">
                    {{ t(option.labelKey) }}
                  </option>
                  <option value="custom">{{ t('settings.catalog.durationCustom') }}</option>
                </select>
                <input
                  v-if="activeCatalogFreshnessChoice === 'custom'"
                  type="number"
                  min="0"
                  step="1"
                  :value="activeCatalogFreshnessMs ?? ''"
                  class="mt-2 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:bg-gray-50"
                  :disabled="catalogPolicyControlsDisabled"
                  :aria-label="t('settings.catalog.customDurationMs')"
                  data-testid="settings-catalog-freshness-custom"
                  @input="setActiveCatalogFreshnessFromInput"
                />
              </label>

              <label class="block">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.catalog.retention') }}</span>
                <select
                  v-model="activeCatalogRetentionChoice"
                  class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:bg-gray-50"
                  :disabled="catalogPolicyControlsDisabled"
                  data-testid="settings-catalog-retention"
                >
                  <option v-for="option in catalogRetentionOptions" :key="String(option.value)" :value="String(option.value)">
                    {{ t(option.labelKey) }}
                  </option>
                  <option value="custom">{{ t('settings.catalog.durationCustom') }}</option>
                </select>
                <input
                  v-if="activeCatalogRetentionChoice === 'custom'"
                  type="number"
                  min="0"
                  step="1"
                  :value="activeCatalogRetentionMs === 'never' ? '' : activeCatalogRetentionMs"
                  class="mt-2 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:bg-gray-50"
                  :disabled="catalogPolicyControlsDisabled"
                  :aria-label="t('settings.catalog.customDurationMs')"
                  data-testid="settings-catalog-retention-custom"
                  @input="setActiveCatalogRetentionFromInput"
                />
              </label>
            </div>
          </div>

          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.catalog.providerStatusTitle') }}</div>
            <div class="mt-1 text-[11px] text-gray-500">{{ t('settings.catalog.providerStatusDesc') }}</div>

            <div class="mt-3 space-y-2">
              <div
                v-for="descriptor in catalogProviderDescriptors"
                :key="descriptor.providerKey"
                class="rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2"
                :data-testid="`settings-catalog-provider-${descriptor.providerKey}`"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-xs font-semibold text-gray-800">{{ descriptor.displayName }}</div>
                    <div class="mt-1 text-[11px] text-gray-500" :data-testid="`settings-catalog-status-${descriptor.providerKey}`">
                      {{ catalogStatusLabel(catalogProviderStatuses[descriptor.providerKey]?.status) }}
                      · {{ tf('settings.catalog.modelCount', { count: catalogProviderStatuses[descriptor.providerKey]?.modelCount ?? 0 }) }}
                      · {{ formatCatalogTimestamp(catalogProviderStatuses[descriptor.providerKey]?.lastSyncAtMs) }}
                    </div>
                    <div v-if="catalogProviderStatuses[descriptor.providerKey]?.errorCode" class="mt-1 text-[11px] text-red-700">
                      {{ catalogProviderStatuses[descriptor.providerKey]?.errorCode }}
                    </div>
                    <div
                      v-if="catalogProviderStatuses[descriptor.providerKey]?.status === 'failed' && (catalogProviderStatuses[descriptor.providerKey]?.modelCount ?? 0) > 0"
                      class="mt-1 text-[11px] text-amber-700"
                    >
                      {{ t('errors.modelCatalog.usingLastKnownGood') }}
                    </div>
                    <div
                      v-else-if="catalogProviderIsStale(descriptor.providerKey)"
                      class="mt-1 text-[11px] text-amber-700"
                    >
                      {{ t('errors.modelCatalog.staleSnapshot') }}
                    </div>
                  </div>
                  <button
                    type="button"
                    class="rounded-md border border-blue-600 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-sm hover:bg-blue-50 disabled:opacity-50"
                    :disabled="!canEdit || loading || saving || catalogProviderStatusLoading[descriptor.providerKey] === true"
                    :data-testid="`settings-catalog-refresh-${descriptor.providerKey}`"
                    @click="refreshCatalogProvider(descriptor.providerKey)"
                  >
                    {{ catalogProviderStatusLoading[descriptor.providerKey] ? t('common.loading') : t('settings.catalog.refreshProvider') }}
                  </button>
                </div>
                <div
                  v-if="catalogProviderPendingRevisions[descriptor.providerKey]"
                  class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-blue-700"
                  :data-testid="`settings-catalog-pending-${descriptor.providerKey}`"
                >
                  <span>{{ t('settings.catalog.pendingAvailable') }}</span>
                  <button
                    type="button"
                    class="rounded border border-blue-200 bg-white px-2 py-1 font-semibold hover:bg-blue-50 disabled:opacity-50"
                    :disabled="catalogProviderStatusLoading[descriptor.providerKey] === true"
                    :data-testid="`settings-catalog-apply-${descriptor.providerKey}`"
                    @click="applyPendingCatalogProvider(descriptor.providerKey)"
                  >
                    {{ t('settings.catalog.applyPending') }}
                  </button>
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="catalogProviderStatusLoading[descriptor.providerKey] === true"
                    :data-testid="`settings-catalog-discard-${descriptor.providerKey}`"
                    @click="discardPendingCatalogProvider(descriptor.providerKey)"
                  >
                    {{ t('settings.catalog.discardPending') }}
                  </button>
                </div>
                <ProviderFailureDetailsV2
                  v-if="catalogProviderStatuses[descriptor.providerKey]?.providerFailure"
                  :failure="catalogProviderStatuses[descriptor.providerKey]!.providerFailure!"
                />
              </div>
            </div>
          </div>
        </section>

        <section
          :id="settingsCategoryPanelId('privacy-data')"
          v-show="activeCategory === 'privacy-data'"
          role="tabpanel"
          :aria-labelledby="settingsCategoryTabId('privacy-data')"
          class="space-y-3"
          data-testid="settings-pane-privacy-data"
        >
          <NewChatLifecycleSettingsPanel />
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.catalog.cacheTitle') }}</div>
            <div class="mt-1 text-[11px] text-gray-500">{{ t('settings.catalog.cacheDesc') }}</div>
            <label class="mt-3 block max-w-sm">
              <span class="text-[11px] font-semibold text-gray-700">{{ t('settings.catalog.provider') }}</span>
              <select
                v-model="catalogSelectedProviderKey"
                class="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                :disabled="!canEdit || loading || saving || catalogClearLoading !== null"
                data-testid="settings-catalog-cache-provider"
              >
                <option v-for="descriptor in catalogProviderDescriptors" :key="descriptor.providerKey" :value="descriptor.providerKey">
                  {{ descriptor.displayName }}
                </option>
              </select>
            </label>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!canEdit || loading || saving || catalogClearLoading !== null || !catalogProviderCredentialConfigured(catalogSelectedProviderKey)"
                data-testid="settings-clear-current-catalog-cache"
                @click="clearCurrentCatalogCache"
              >
                {{ catalogClearLoading === 'current' ? t('common.loading') : t('settings.catalog.cacheClearCurrent') }}
              </button>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!canEdit || loading || saving || catalogClearLoading !== null"
                data-testid="settings-clear-all-catalog-caches"
                @click="clearAllCatalogCaches"
              >
                {{ catalogClearLoading === 'all' ? t('common.loading') : t('settings.catalog.cacheClearAll') }}
              </button>
            </div>
            <div class="mt-2 text-[11px] text-gray-500">{{ t('settings.categories.immediateActionHint') }}</div>
          </div>
        </section>

        <section
          :id="settingsCategoryPanelId('network')"
          v-show="activeCategory === 'network'"
          role="tabpanel"
          :aria-labelledby="settingsCategoryTabId('network')"
          class="space-y-3"
          data-testid="settings-pane-network"
        >
      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.network.title') }}</div>

        <div class="mt-3 space-y-3">
          <div class="rounded-md border border-gray-100 bg-gray-50 p-3">
            <div class="text-[11px] font-semibold text-gray-700">{{ t('settings.network.proxyTitle') }}</div>
            <div class="mt-1 text-[11px] text-gray-500">
              {{ t('settings.network.proxyPolicyDesc') }}
            </div>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <label class="block text-[11px] text-gray-700">
                <span class="font-semibold">{{ t('settings.network.proxyMode') }}</span>
                <select
                  class="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 disabled:bg-gray-50"
                  :disabled="!canEdit || loading || saving"
                  v-model="networkProxyMode"
                >
                  <option value="environment">{{ t('settings.network.proxyModeEnvironment') }}</option>
                  <option value="manual">{{ t('settings.network.proxyModeManual') }}</option>
                  <option value="direct">{{ t('settings.network.proxyModeDirect') }}</option>
                  <option value="system">{{ t('settings.network.proxyModeSystem') }}</option>
                </select>
              </label>
              <label class="block text-[11px] text-gray-700">
                <span class="font-semibold">{{ t('settings.network.manualProxyUrl') }}</span>
                <input
                  type="text"
                  class="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 disabled:bg-gray-50"
                  placeholder="http://127.0.0.1:7890"
                  :disabled="!canEdit || loading || saving || networkProxyMode !== 'manual'"
                  v-model="networkProxyManualUrl"
                />
              </label>
              <label class="block text-[11px] text-gray-700 sm:col-span-2">
                <span class="font-semibold">{{ t('settings.network.noProxyList') }}</span>
                <input
                  type="text"
                  class="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 disabled:bg-gray-50"
                  placeholder="localhost,127.0.0.1,.example.com"
                  :disabled="!canEdit || loading || saving"
                  v-model="networkProxyNoProxy"
                />
              </label>
            </div>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
              <label class="inline-flex items-center gap-2 text-[11px] text-gray-700">
                <input
                  type="checkbox"
                  disabled
                  v-model="networkProxyStrictSsl"
                />
                <span>{{ t('settings.network.strictSslRequired') }}</span>
              </label>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!canEdit || loading || saving || networkProxyProbeLoading"
                @click="testNetworkProxyConnection"
              >
                {{ networkProxyProbeLoading ? t('settings.network.testing') : t('settings.network.testConnection') }}
              </button>
            </div>
            <div class="mt-2 text-[11px] text-gray-500">
              {{ tf('settings.network.currentModeProbeDesc', { mode: networkProxyModeText(networkProxyMode) }) }}
            </div>
            <div v-if="networkProxyProbeResult" class="mt-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-[11px] text-gray-600">
              <div>{{ t('settings.network.probeLabel') }} {{ passedFailedText(networkProxyProbeResult.ok) }}</div>
              <div>{{ t('settings.network.metadataLabel') }} {{ reachableText(networkProxyProbeResult.metadataReachable) }}</div>
              <div>{{ t('settings.network.headLabel') }} {{ passedFailedText(networkProxyProbeResult.headPassed) }}</div>
              <div>{{ t('settings.network.contentLengthLabel') }} {{ networkProxyProbeResult.contentLength }}</div>
              <div>{{ t('settings.network.rangeLabel') }} {{ passedFailedText(networkProxyProbeResult.rangePassed) }}</div>
              <div>{{ t('settings.network.diagnosticLabel') }} {{ networkProxyProbeResult.terminalDiagnostic }}</div>
            </div>
          </div>

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
        </section>

        <section
          :id="settingsCategoryPanelId('generation')"
          v-show="activeCategory === 'generation'"
          role="tabpanel"
          :aria-labelledby="settingsCategoryTabId('generation')"
          class="space-y-3"
          data-testid="settings-pane-generation"
        >
      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.customParams.title') }}</div>
        <div class="mt-3">
          <GenerationParamsSettingsEditor
            v-model="generationParamsDefaults"
            :disabled="!canEdit || loading || saving"
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
              <option value="max">max</option>
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
        </section>

        <section
          :id="settingsCategoryPanelId('extensions')"
          v-show="activeCategory === 'extensions'"
          role="tabpanel"
          :aria-labelledby="settingsCategoryTabId('extensions')"
          class="space-y-3"
          data-testid="settings-pane-extensions"
        >
          <div class="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-900">
            {{ t('settings.categories.childOwnedActionHint') }}
          </div>
          <PluginManagementPanel />
        </section>

        <div class="mt-3 text-[11px] text-gray-500">
          {{ t('settings.footer') }}
        </div>
      </div>
    </div>

    <div class="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur" data-testid="settings-global-actions">
      <div class="min-w-0 text-[11px] text-gray-500">{{ t('settings.categories.globalSaveHint') }}</div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          :disabled="props.disabled || props.isRunning || loading || saving"
          data-testid="settings-reload"
          @click="load"
        >
          {{ t('common.reload') }}
        </button>
        <button
          type="button"
          class="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          :disabled="!canEdit || loading || saving"
          data-testid="settings-save"
          @click="save"
        >
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

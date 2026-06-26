<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getOpenRouterProviderRequireParameters, setOpenRouterProviderRequireParameters } from '@/next/settings/openRouterProviderSettingsClient'
import { getReasoningPrefs, setReasoningPrefs } from '@/next/settings/reasoningPrefsClient'
import { getUserMessageRenderDefault, setUserMessageRenderDefault } from '@/next/settings/userMessageRenderDefaultClient'
import { getChatReasoningPanelDefaultExpanded, setChatReasoningPanelDefaultExpanded } from '@/next/settings/reasoningPanelDefaultClient'
import { getWebSearchDefaults, setWebSearchDefaults } from '@/next/settings/webSearchDefaultsClient'
import { getSamplingParamsDefaults, setSamplingParamsDefaults } from '@/next/settings/samplingParamsDefaultsClient'
import {
  getNetworkProxySettings,
  probeLibreOfficeOfficialDownloadNetwork,
  setNetworkProxySettings,
  type LibreOfficeProxyProbeResult,
} from '@/next/settings/networkProxySettingsClient'
import {
  DEFAULT_NETWORK_PROXY_SETTINGS,
  normalizeNetworkProxySettings,
  proxyModeLabel,
  type NetworkProxyMode,
} from '@/next/plugin-distribution/networkProxyShared'
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

type ProviderCredentialStatusSource =
  | 'secure_store'
  | 'plaintext_fallback'
  | 'missing'
type ProviderCredentialBackendKind = 'electron_safe_storage' | 'plaintext_fallback' | 'unavailable'

type OpenRouterEndpointMetadataBase = Readonly<{
  kind: 'openrouter_endpoint'
  providerId: 'openrouter'
  profileId: 'openrouter_v1_chat'
  source: ProviderCredentialStatusSource
  defaultBaseUrl: string
  credentialRef: Readonly<{ kind: 'credential_ref'; id: 'openrouter-chat-legacy-store' }>
  catalogCredentialRef: Readonly<{ kind: 'credential_ref'; id: 'openrouter-catalog-legacy-store' }>
  rendererVisible: true
}>

type OpenRouterEndpointMetadata =
  | Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: 'openrouter-official'
    endpointStatus: 'official'
    displayName: 'OpenRouter official endpoint'
    baseUrlConfigured: false
    baseUrlInvalid?: false
    displayBaseUrl: 'https://openrouter.ai/api/v1'
  }>
  | Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: 'openrouter-custom-legacy-store'
    endpointStatus: 'custom'
    displayName: 'OpenRouter custom endpoint'
    baseUrlConfigured: true
    baseUrlInvalid?: false
    displayBaseUrl: string
  }>
  | Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: 'openrouter-custom-legacy-store'
    endpointStatus: 'invalid_custom'
    displayName: 'OpenRouter custom endpoint'
    baseUrlConfigured: true
    baseUrlInvalid: true
    displayBaseUrl?: never
  }>

type OpenRouterCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  apiKeyConfigured: boolean
  maskedApiKey?: string
  migratedFromLegacy?: boolean
  warnings?: string[]
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

type OpenAIResponsesCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'openai'
  profileId: 'openai_responses_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: string
  migratedFromLegacy?: boolean
  warnings?: string[]
  defaultBaseUrl: string
  rendererVisible: true
}>

type OpenAIResponsesCredentialResult = Readonly<{
  ok: boolean
  status?: OpenAIResponsesCredentialStatus
  message?: string
}>

type OpenAIResponsesCredentialBridge = Readonly<{
  getStatus: () => Promise<OpenAIResponsesCredentialResult>
  update: (payload: Readonly<{ apiKey?: string }>) => Promise<OpenAIResponsesCredentialResult>
  clear: () => Promise<OpenAIResponsesCredentialResult>
}>

type GoogleAIStudioCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'google-ai-studio'
  profileId: 'gemini_api_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: string
  migratedFromLegacy?: boolean
  warnings?: string[]
  defaultBaseUrl: string
  rendererVisible: true
}>

type GoogleAIStudioCredentialResult = Readonly<{
  ok: boolean
  status?: GoogleAIStudioCredentialStatus
  message?: string
}>

type GoogleAIStudioCredentialBridge = Readonly<{
  getStatus: () => Promise<GoogleAIStudioCredentialResult>
  update: (payload: Readonly<{ apiKey?: string }>) => Promise<GoogleAIStudioCredentialResult>
  clear: () => Promise<GoogleAIStudioCredentialResult>
}>

type AnthropicCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'anthropic'
  profileId: 'anthropic_messages_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: string
  migratedFromLegacy?: boolean
  warnings?: string[]
  defaultBaseUrl: string
  rendererVisible: true
}>

type AnthropicCredentialResult = Readonly<{
  ok: boolean
  status?: AnthropicCredentialStatus
  message?: string
}>

type AnthropicCredentialBridge = Readonly<{
  getStatus: () => Promise<AnthropicCredentialResult>
  update: (payload: Readonly<{ apiKey?: string }>) => Promise<AnthropicCredentialResult>
  clear: () => Promise<AnthropicCredentialResult>
}>

type DeepSeekCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'deepseek'
  profileId: 'deepseek_official_openai_compat'
  apiKeyConfigured: boolean
  maskedApiKey?: string
  migratedFromLegacy?: boolean
  warnings?: string[]
  defaultBaseUrl: string
  rendererVisible: true
}>

type DeepSeekCredentialResult = Readonly<{
  ok: boolean
  status?: DeepSeekCredentialStatus
  message?: string
}>

type DeepSeekCredentialBridge = Readonly<{
  getStatus: () => Promise<DeepSeekCredentialResult>
  update: (payload: Readonly<{ apiKey?: string }>) => Promise<DeepSeekCredentialResult>
  clear: () => Promise<DeepSeekCredentialResult>
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
const LOCAL_ENDPOINT_CHAT_MODEL_KEY = 'starverse.localEndpointTextChat.model'
const LOCAL_ENDPOINT_CHAT_SETTINGS_EVENT = 'settings:localEndpointTextChatUpdated'
const OPENAI_RESPONSES_CHAT_MODEL_KEY = 'starverse.openAIResponsesTextChat.model'
const OPENAI_RESPONSES_CHAT_SETTINGS_EVENT = 'settings:openAIResponsesTextChatUpdated'
const GOOGLE_AI_STUDIO_CHAT_MODEL_KEY = 'starverse.googleAIStudioTextChat.model'
const GOOGLE_AI_STUDIO_CHAT_SETTINGS_EVENT = 'settings:googleAIStudioTextChatUpdated'
const ANTHROPIC_CHAT_MODEL_KEY = 'starverse.anthropicMessagesTextChat.model'
const ANTHROPIC_CHAT_SETTINGS_EVENT = 'settings:anthropicMessagesTextChatUpdated'
const DEEPSEEK_CHAT_MODEL_KEY = 'starverse.deepSeekTextChat.model'
const DEEPSEEK_CHAT_SETTINGS_EVENT = 'settings:deepSeekTextChatUpdated'

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

function getOpenAIResponsesCredentialBridge(): OpenAIResponsesCredentialBridge | null {
  const bridge = (globalThis as any).openAIResponsesCredential as OpenAIResponsesCredentialBridge | undefined
  if (!bridge) return null
  if (
    typeof bridge.getStatus !== 'function' ||
    typeof bridge.update !== 'function' ||
    typeof bridge.clear !== 'function'
  ) return null
  return bridge
}

function getGoogleAIStudioCredentialBridge(): GoogleAIStudioCredentialBridge | null {
  const bridge = (globalThis as any).googleAIStudioCredential as GoogleAIStudioCredentialBridge | undefined
  if (!bridge) return null
  if (
    typeof bridge.getStatus !== 'function' ||
    typeof bridge.update !== 'function' ||
    typeof bridge.clear !== 'function'
  ) return null
  return bridge
}

function getAnthropicCredentialBridge(): AnthropicCredentialBridge | null {
  const bridge = (globalThis as any).anthropicCredential as AnthropicCredentialBridge | undefined
  if (!bridge) return null
  if (
    typeof bridge.getStatus !== 'function' ||
    typeof bridge.update !== 'function' ||
    typeof bridge.clear !== 'function'
  ) return null
  return bridge
}

function getDeepSeekCredentialBridge(): DeepSeekCredentialBridge | null {
  const bridge = (globalThis as any).deepSeekCredential as DeepSeekCredentialBridge | undefined
  if (!bridge) return null
  if (
    typeof bridge.getStatus !== 'function' ||
    typeof bridge.update !== 'function' ||
    typeof bridge.clear !== 'function'
  ) return null
  return bridge
}

function getLocalEndpointDiagnosticsBridge(): LocalEndpointDiagnosticsBridge | null {
  const bridge = (globalThis as any).localEndpointDiagnostics as LocalEndpointDiagnosticsBridge | undefined
  if (!bridge || typeof bridge.probe !== 'function' || typeof bridge.streamProbe !== 'function') return null
  return bridge
}

const OPENROUTER_DEBUG_ECHO_UPSTREAM_BODY_KEY = 'sv_debug_openrouter_echo_upstream_body'
const MAX_RECENT_MODELS_KEY = 'maxRecentModels'

const apiKey = ref('')
const baseUrl = ref('')
const loadedBaseUrl = ref('')
const apiKeyConfigured = ref(false)
const maskedApiKey = ref('')
const credentialWarnings = ref<string[]>([])
const openAIResponsesApiKey = ref('')
const openAIResponsesApiKeyConfigured = ref(false)
const openAIResponsesMaskedApiKey = ref('')
const openAIResponsesCredentialWarnings = ref<string[]>([])
const openAIResponsesModel = ref('')
const openAIResponsesChatApplyMessage = ref<string | null>(null)
const googleAIStudioApiKey = ref('')
const googleAIStudioApiKeyConfigured = ref(false)
const googleAIStudioMaskedApiKey = ref('')
const googleAIStudioCredentialWarnings = ref<string[]>([])
const googleAIStudioModel = ref('')
const googleAIStudioChatApplyMessage = ref<string | null>(null)
const anthropicApiKey = ref('')
const anthropicApiKeyConfigured = ref(false)
const anthropicMaskedApiKey = ref('')
const anthropicCredentialWarnings = ref<string[]>([])
const anthropicModel = ref('')
const anthropicChatApplyMessage = ref<string | null>(null)
const deepSeekApiKey = ref('')
const deepSeekApiKeyConfigured = ref(false)
const deepSeekMaskedApiKey = ref('')
const deepSeekCredentialWarnings = ref<string[]>([])
const deepSeekModel = ref('')
const deepSeekChatApplyMessage = ref<string | null>(null)
const endpointDisplayName = ref('OpenRouter official endpoint')
const endpointDisplayStatus = ref('Official endpoint')
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
const networkProxyMode = ref<NetworkProxyMode>(DEFAULT_NETWORK_PROXY_SETTINGS.proxyMode)
const networkProxyManualUrl = ref(DEFAULT_NETWORK_PROXY_SETTINGS.manualProxyUrl)
const networkProxyNoProxy = ref(DEFAULT_NETWORK_PROXY_SETTINGS.noProxy)
const networkProxyStrictSsl = ref(DEFAULT_NETWORK_PROXY_SETTINGS.strictSSL)
const networkProxyProbeLoading = ref(false)
const networkProxyProbeResult = ref<LibreOfficeProxyProbeResult | null>(null)
const localEndpointUrl = ref('http://localhost:1234')
const localEndpointSelectedModel = ref('')
const localEndpointManualModel = ref('')
const localEndpointChatApplyMessage = ref<string | null>(null)
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
const localEndpointDiagnosticsAvailable = computed(() => !!getLocalEndpointDiagnosticsBridge())
const canProbeLocalEndpoint = computed(() => !props.disabled && !props.isRunning && localEndpointDiagnosticsAvailable.value)
const openAIResponsesCredentialAvailable = computed(() => !!getOpenAIResponsesCredentialBridge())
const canApplyOpenAIResponsesChatSettings = computed(() =>
  !props.disabled &&
  !props.isRunning &&
  openAIResponsesModel.value.trim().length > 0
)
const googleAIStudioCredentialAvailable = computed(() => !!getGoogleAIStudioCredentialBridge())
const canApplyGoogleAIStudioChatSettings = computed(() =>
  !props.disabled &&
  !props.isRunning &&
  googleAIStudioModel.value.trim().length > 0
)
const anthropicCredentialAvailable = computed(() => !!getAnthropicCredentialBridge())
const canApplyAnthropicChatSettings = computed(() =>
  !props.disabled &&
  !props.isRunning &&
  anthropicModel.value.trim().length > 0
)
const deepSeekCredentialAvailable = computed(() => !!getDeepSeekCredentialBridge())
const canApplyDeepSeekChatSettings = computed(() =>
  !props.disabled &&
  !props.isRunning &&
  deepSeekModel.value.trim().length > 0
)
const localEndpointProbedModels = computed(() => {
  const result = localEndpointProbeResult.value
  if (!result?.ok || !result.diagnostics.modelList.ok) return []
  return result.diagnostics.modelList.models
})
const localEndpointModelForChat = computed(() => {
  const selected = localEndpointSelectedModel.value.trim()
  if (selected) return selected
  return localEndpointManualModel.value.trim()
})
const canApplyLocalEndpointChatSettings = computed(() =>
  !props.disabled &&
  !props.isRunning &&
  localEndpointUrl.value.trim().length > 0 &&
  localEndpointModelForChat.value.length > 0 &&
  !localEndpointProbeLoading.value &&
  !localEndpointStreamProbeLoading.value
)
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
  let endpointSafeDisplayBaseUrl: string | undefined
  if (endpoint?.endpointStatus === 'official' || endpoint?.endpointStatus === 'custom') {
    endpointSafeDisplayBaseUrl = endpoint.displayBaseUrl
  } else if (!endpoint && status.baseUrlConfigured === false) {
    endpointSafeDisplayBaseUrl = status.defaultBaseUrl
  }

  apiKey.value = ''
  apiKeyConfigured.value = status.apiKeyConfigured === true
  maskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  credentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
  endpointDisplayName.value = endpoint?.displayName || 'OpenRouter official endpoint'
  endpointDisplayStatus.value = endpoint?.endpointStatus === 'invalid_custom'
    ? 'Invalid custom endpoint'
    : endpoint?.endpointStatus === 'custom'
      ? 'Custom endpoint'
      : 'Official endpoint'
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

function applyOpenAIResponsesCredentialStatus(status: OpenAIResponsesCredentialStatus) {
  openAIResponsesApiKey.value = ''
  openAIResponsesApiKeyConfigured.value = status.apiKeyConfigured === true
  openAIResponsesMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  openAIResponsesCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
}

function applyGoogleAIStudioCredentialStatus(status: GoogleAIStudioCredentialStatus) {
  googleAIStudioApiKey.value = ''
  googleAIStudioApiKeyConfigured.value = status.apiKeyConfigured === true
  googleAIStudioMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  googleAIStudioCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
}

function applyAnthropicCredentialStatus(status: AnthropicCredentialStatus) {
  anthropicApiKey.value = ''
  anthropicApiKeyConfigured.value = status.apiKeyConfigured === true
  anthropicMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  anthropicCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
}

function applyDeepSeekCredentialStatus(status: DeepSeekCredentialStatus) {
  deepSeekApiKey.value = ''
  deepSeekApiKeyConfigured.value = status.apiKeyConfigured === true
  deepSeekMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  deepSeekCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
}

async function loadOpenAIResponsesCredentialStatus() {
  const credentialBridge = getOpenAIResponsesCredentialBridge()
  if (!credentialBridge) {
    openAIResponsesApiKeyConfigured.value = false
    openAIResponsesMaskedApiKey.value = ''
    openAIResponsesCredentialWarnings.value = []
    return
  }

  const result = await credentialBridge.getStatus()
  if (!result?.ok || !result.status) {
    throw new Error(result?.message || 'OpenAI Responses credential status unavailable.')
  }
  applyOpenAIResponsesCredentialStatus(result.status)
}

async function loadGoogleAIStudioCredentialStatus() {
  const credentialBridge = getGoogleAIStudioCredentialBridge()
  if (!credentialBridge) {
    googleAIStudioApiKeyConfigured.value = false
    googleAIStudioMaskedApiKey.value = ''
    googleAIStudioCredentialWarnings.value = []
    return
  }

  const result = await credentialBridge.getStatus()
  if (!result?.ok || !result.status) {
    throw new Error(result?.message || 'Google AI Studio credential status unavailable.')
  }
  applyGoogleAIStudioCredentialStatus(result.status)
}

async function loadAnthropicCredentialStatus() {
  const credentialBridge = getAnthropicCredentialBridge()
  if (!credentialBridge) {
    anthropicApiKeyConfigured.value = false
    anthropicMaskedApiKey.value = ''
    anthropicCredentialWarnings.value = []
    return
  }

  const result = await credentialBridge.getStatus()
  if (!result?.ok || !result.status) {
    throw new Error(result?.message || 'Anthropic credential status unavailable.')
  }
  applyAnthropicCredentialStatus(result.status)
}

async function loadDeepSeekCredentialStatus() {
  const credentialBridge = getDeepSeekCredentialBridge()
  if (!credentialBridge) {
    deepSeekApiKeyConfigured.value = false
    deepSeekMaskedApiKey.value = ''
    deepSeekCredentialWarnings.value = []
    return
  }

  const result = await credentialBridge.getStatus()
  if (!result?.ok || !result.status) {
    throw new Error(result?.message || 'DeepSeek credential status unavailable.')
  }
  applyDeepSeekCredentialStatus(result.status)
}

function loadOpenAIResponsesChatModelPreference() {
  try {
    openAIResponsesModel.value = String(globalThis.localStorage?.getItem(OPENAI_RESPONSES_CHAT_MODEL_KEY) ?? '').trim()
  } catch {
    openAIResponsesModel.value = ''
  }
}

function loadGoogleAIStudioChatModelPreference() {
  try {
    googleAIStudioModel.value = String(globalThis.localStorage?.getItem(GOOGLE_AI_STUDIO_CHAT_MODEL_KEY) ?? '').trim()
  } catch {
    googleAIStudioModel.value = ''
  }
}

function loadAnthropicChatModelPreference() {
  try {
    anthropicModel.value = String(globalThis.localStorage?.getItem(ANTHROPIC_CHAT_MODEL_KEY) ?? '').trim()
  } catch {
    anthropicModel.value = ''
  }
}

function loadDeepSeekChatModelPreference() {
  try {
    deepSeekModel.value = String(globalThis.localStorage?.getItem(DEEPSEEK_CHAT_MODEL_KEY) ?? '').trim()
  } catch {
    deepSeekModel.value = ''
  }
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
    await loadOpenAIResponsesCredentialStatus()
    await loadGoogleAIStudioCredentialStatus()
    await loadAnthropicCredentialStatus()
    await loadDeepSeekCredentialStatus()
    loadOpenAIResponsesChatModelPreference()
    loadGoogleAIStudioChatModelPreference()
    loadAnthropicChatModelPreference()
    loadDeepSeekChatModelPreference()
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

    const openAIResponsesCredentialBridge = getOpenAIResponsesCredentialBridge()
    const nextOpenAIResponsesApiKey = openAIResponsesApiKey.value.trim()
    if (nextOpenAIResponsesApiKey) {
      if (!openAIResponsesCredentialBridge) {
        throw new Error('Missing openAIResponsesCredential bridge (run in Electron).')
      }
      const openAIResponsesCredentialResult = await openAIResponsesCredentialBridge.update({
        apiKey: nextOpenAIResponsesApiKey,
      })
      if (!openAIResponsesCredentialResult?.ok || !openAIResponsesCredentialResult.status) {
        throw new Error(openAIResponsesCredentialResult?.message || 'OpenAI Responses credential update failed.')
      }
      applyOpenAIResponsesCredentialStatus(openAIResponsesCredentialResult.status)
    }
    const googleAIStudioCredentialBridge = getGoogleAIStudioCredentialBridge()
    const nextGoogleAIStudioApiKey = googleAIStudioApiKey.value.trim()
    if (nextGoogleAIStudioApiKey) {
      if (!googleAIStudioCredentialBridge) {
        throw new Error('Missing googleAIStudioCredential bridge (run in Electron).')
      }
      const googleAIStudioCredentialResult = await googleAIStudioCredentialBridge.update({
        apiKey: nextGoogleAIStudioApiKey,
      })
      if (!googleAIStudioCredentialResult?.ok || !googleAIStudioCredentialResult.status) {
        throw new Error(googleAIStudioCredentialResult?.message || 'Google AI Studio credential update failed.')
      }
      applyGoogleAIStudioCredentialStatus(googleAIStudioCredentialResult.status)
    }
    const anthropicCredentialBridge = getAnthropicCredentialBridge()
    const nextAnthropicApiKey = anthropicApiKey.value.trim()
    if (nextAnthropicApiKey) {
      if (!anthropicCredentialBridge) {
        throw new Error('Missing anthropicCredential bridge (run in Electron).')
      }
      const anthropicCredentialResult = await anthropicCredentialBridge.update({
        apiKey: nextAnthropicApiKey,
      })
      if (!anthropicCredentialResult?.ok || !anthropicCredentialResult.status) {
        throw new Error(anthropicCredentialResult?.message || 'Anthropic credential update failed.')
      }
      applyAnthropicCredentialStatus(anthropicCredentialResult.status)
    }
    const deepSeekCredentialBridge = getDeepSeekCredentialBridge()
    const nextDeepSeekApiKey = deepSeekApiKey.value.trim()
    if (nextDeepSeekApiKey) {
      if (!deepSeekCredentialBridge) {
        throw new Error('Missing deepSeekCredential bridge (run in Electron).')
      }
      const deepSeekCredentialResult = await deepSeekCredentialBridge.update({
        apiKey: nextDeepSeekApiKey,
      })
      if (!deepSeekCredentialResult?.ok || !deepSeekCredentialResult.status) {
        throw new Error(deepSeekCredentialResult?.message || 'DeepSeek credential update failed.')
      }
      applyDeepSeekCredentialStatus(deepSeekCredentialResult.status)
    }
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
    savedMessage.value = networkProxyProbeResult.value.ok ? 'Proxy probe passed.' : null
    if (!networkProxyProbeResult.value.ok) {
      error.value = `Proxy probe failed: ${networkProxyProbeResult.value.terminalDiagnostic}`
    }
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : 'Proxy probe failed.'
  } finally {
    networkProxyProbeLoading.value = false
  }
}

async function clearOpenAIResponsesApiKey() {
  error.value = null
  savedMessage.value = null
  const credentialBridge = getOpenAIResponsesCredentialBridge()
  if (!credentialBridge) {
    error.value = 'Missing openAIResponsesCredential bridge (run in Electron).'
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.clear()
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || 'OpenAI Responses credential clear failed.')
    }
    applyOpenAIResponsesCredentialStatus(result.status)
    savedMessage.value = 'OpenAI Responses API key cleared.'
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

async function clearGoogleAIStudioApiKey() {
  error.value = null
  savedMessage.value = null
  const credentialBridge = getGoogleAIStudioCredentialBridge()
  if (!credentialBridge) {
    error.value = 'Missing googleAIStudioCredential bridge (run in Electron).'
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.clear()
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || 'Google AI Studio credential clear failed.')
    }
    applyGoogleAIStudioCredentialStatus(result.status)
    savedMessage.value = 'Google AI Studio API key cleared.'
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

async function clearAnthropicApiKey() {
  error.value = null
  savedMessage.value = null
  const credentialBridge = getAnthropicCredentialBridge()
  if (!credentialBridge) {
    error.value = 'Missing anthropicCredential bridge (run in Electron).'
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.clear()
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || 'Anthropic credential clear failed.')
    }
    applyAnthropicCredentialStatus(result.status)
    savedMessage.value = 'Anthropic API key cleared.'
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

async function clearDeepSeekApiKey() {
  error.value = null
  savedMessage.value = null
  const credentialBridge = getDeepSeekCredentialBridge()
  if (!credentialBridge) {
    error.value = 'Missing deepSeekCredential bridge (run in Electron).'
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.clear()
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || 'DeepSeek credential clear failed.')
    }
    applyDeepSeekCredentialStatus(result.status)
    savedMessage.value = 'DeepSeek API key cleared.'
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

function applyOpenAIResponsesChatSettings() {
  const model = openAIResponsesModel.value.trim()
  if (!model) return

  try {
    globalThis.localStorage?.setItem(OPENAI_RESPONSES_CHAT_MODEL_KEY, model)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(OPENAI_RESPONSES_CHAT_SETTINGS_EVENT, {
        detail: { model },
      }))
    }
    openAIResponsesChatApplyMessage.value = 'Applied to experimental OpenAI Responses chat. Enable it explicitly in Console to send.'
  } catch {
    openAIResponsesChatApplyMessage.value = 'OpenAI Responses chat settings could not be saved locally.'
  }
}

function applyGoogleAIStudioChatSettings() {
  const model = googleAIStudioModel.value.trim()
  if (!model) return

  try {
    globalThis.localStorage?.setItem(GOOGLE_AI_STUDIO_CHAT_MODEL_KEY, model)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(GOOGLE_AI_STUDIO_CHAT_SETTINGS_EVENT, {
        detail: { model },
      }))
    }
    googleAIStudioChatApplyMessage.value = 'Applied to experimental Google AI Studio chat. Enable it explicitly in Console to send.'
  } catch {
    googleAIStudioChatApplyMessage.value = 'Google AI Studio chat settings could not be saved locally.'
  }
}

function applyAnthropicChatSettings() {
  const model = anthropicModel.value.trim()
  if (!model) return

  try {
    globalThis.localStorage?.setItem(ANTHROPIC_CHAT_MODEL_KEY, model)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ANTHROPIC_CHAT_SETTINGS_EVENT, {
        detail: { model },
      }))
    }
    anthropicChatApplyMessage.value = 'Applied to experimental Anthropic Messages chat. Enable it explicitly in Console to send.'
  } catch {
    anthropicChatApplyMessage.value = 'Anthropic Messages chat settings could not be saved locally.'
  }
}

function applyDeepSeekChatSettings() {
  const model = deepSeekModel.value.trim()
  if (!model) return

  try {
    globalThis.localStorage?.setItem(DEEPSEEK_CHAT_MODEL_KEY, model)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(DEEPSEEK_CHAT_SETTINGS_EVENT, {
        detail: { model },
      }))
    }
    deepSeekChatApplyMessage.value = 'Applied to experimental DeepSeek official chat. Enable it explicitly in Console to send.'
  } catch {
    deepSeekChatApplyMessage.value = 'DeepSeek official chat settings could not be saved locally.'
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

function chooseLocalEndpointProbeModel(modelId: string) {
  localEndpointSelectedModel.value = modelId
  if (modelId) localEndpointManualModel.value = ''
  localEndpointChatApplyMessage.value = null
}

function updateLocalEndpointManualModel(modelId: string) {
  localEndpointManualModel.value = modelId
  if (modelId.trim()) localEndpointSelectedModel.value = ''
  localEndpointChatApplyMessage.value = null
}

function applyLocalEndpointChatSettings() {
  const endpointUrl = safeLocalEndpointChatUrlForStorage()
  const model = localEndpointModelForChat.value
  if (!endpointUrl || !model) return

  try {
    globalThis.localStorage?.setItem(LOCAL_ENDPOINT_CHAT_URL_KEY, endpointUrl)
    globalThis.localStorage?.setItem(LOCAL_ENDPOINT_CHAT_MODEL_KEY, model)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(LOCAL_ENDPOINT_CHAT_SETTINGS_EVENT, {
        detail: { endpointUrl, model },
      }))
    }
    localEndpointChatApplyMessage.value = 'Applied to experimental LocalEndpoint chat. Enable it explicitly in Console to send.'
  } catch {
    localEndpointChatApplyMessage.value = 'LocalEndpoint chat settings could not be saved locally.'
  }
}

async function probeLocalEndpoint() {
  error.value = null
  savedMessage.value = null
  localEndpointProbeResult.value = null
  localEndpointStreamProbeResult.value = null
  localEndpointChatApplyMessage.value = null

  const bridge = getLocalEndpointDiagnosticsBridge()
  if (!bridge) {
    localEndpointProbeResult.value = {
      ok: false,
      code: 'bridge_unavailable',
      message: 'Local endpoint diagnostics bridge unavailable.',
    }
    return
  }

  localEndpointProbeLoading.value = true
  try {
    localEndpointProbeResult.value = await bridge.probe({
      url: localEndpointUrl.value,
      timeoutMs: 5000,
    })
    const models = localEndpointProbedModels.value
    if (models.length > 0 && !localEndpointSelectedModel.value && !localEndpointManualModel.value.trim()) {
      localEndpointSelectedModel.value = models[0] ?? ''
    }
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
  localEndpointChatApplyMessage.value = null

  const bridge = getLocalEndpointDiagnosticsBridge()
  if (!bridge) {
    localEndpointStreamProbeResult.value = {
      ok: false,
      code: 'bridge_unavailable',
      message: 'Local endpoint diagnostics bridge unavailable.',
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
        <div class="mt-1 text-[11px] text-gray-500" data-testid="settings-openrouter-explicit-runtime-note">
          OpenRouter is a first-class provider, but it is not an implicit fallback. Select OpenRouter Chat explicitly in Console before sending through OpenRouter.
        </div>

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
        <div v-if="credentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-openrouter-credential-warnings">
          <div v-for="warning in credentialWarnings" :key="warning">{{ warning }}</div>
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
          <span data-testid="settings-openrouter-endpoint-status">{{ endpointDisplayStatus }}</span>
          <span> · {{ endpointDisplayName }}</span>
          <span v-if="endpointDisplayBaseUrl"> · {{ endpointDisplayBaseUrl }}</span>
          <span v-if="endpointBaseUrlInvalid" data-testid="settings-openrouter-endpoint-warning"> · Invalid custom base URL</span>
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

      <div class="rounded-lg border border-blue-200 bg-white p-3" data-testid="settings-openai-responses-experimental">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-blue-800">OpenAI Responses Experimental Chat</div>
            <div class="mt-1 text-[11px] text-gray-500">
              Native OpenAI Responses text-only path. It is separate from OpenRouter, default-off, and uses a main-process credential bridge.
            </div>
          </div>
          <span class="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800">
            Experimental
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">OpenAI API key</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="openAIResponsesApiKey"
            type="password"
            placeholder="sk-..."
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || !openAIResponsesCredentialAvailable"
            data-testid="settings-openai-responses-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !openAIResponsesCredentialAvailable || !openAIResponsesApiKeyConfigured"
            data-testid="settings-openai-responses-clear-key"
            @click="clearOpenAIResponsesApiKey"
          >
            Clear key
          </button>
        </div>
        <div class="mt-1 text-[11px] text-gray-500" data-testid="settings-openai-responses-key-status">
          {{ openAIResponsesApiKeyConfigured ? `Configured: ${openAIResponsesMaskedApiKey || '***'}` : 'Not configured' }}
        </div>
        <div v-if="openAIResponsesCredentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-openai-responses-credential-warnings">
          <div v-for="warning in openAIResponsesCredentialWarnings" :key="warning">{{ warning }}</div>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">Manual Responses model id</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="openAIResponsesModel"
            type="text"
            placeholder="gpt-4.1-mini"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            :disabled="props.disabled || props.isRunning || loading || saving"
            data-testid="settings-openai-responses-model"
          />
          <button
            type="button"
            class="rounded-md border border-blue-700 bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            :disabled="!canApplyOpenAIResponsesChatSettings"
            data-testid="settings-openai-responses-apply-chat"
            @click="applyOpenAIResponsesChatSettings"
          >
            Use model for experimental chat
          </button>
        </div>
        <div class="mt-1 text-[11px] text-blue-800" data-testid="settings-openai-responses-chat-note">
          This only updates the experimental OpenAI Responses Console default. Use Console refresh for official availability diagnostics. It does not publish models to the main picker and does not enable chat by itself.
        </div>
        <div v-if="openAIResponsesChatApplyMessage" class="mt-1 text-[11px] text-blue-900" data-testid="settings-openai-responses-chat-apply-result">
          {{ openAIResponsesChatApplyMessage }}
        </div>
      </div>

      <div class="rounded-lg border border-emerald-200 bg-white p-3" data-testid="settings-google-ai-studio-experimental">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-emerald-800">Google AI Studio Experimental Chat</div>
            <div class="mt-1 text-[11px] text-gray-500">
              Native Gemini API text-only path. It is separate from OpenRouter, default-off, and uses a main-process credential bridge.
            </div>
          </div>
          <span class="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
            Experimental
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">Google AI Studio API key</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="googleAIStudioApiKey"
            type="password"
            placeholder="AIza..."
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || !googleAIStudioCredentialAvailable"
            data-testid="settings-google-ai-studio-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !googleAIStudioCredentialAvailable || !googleAIStudioApiKeyConfigured"
            data-testid="settings-google-ai-studio-clear-key"
            @click="clearGoogleAIStudioApiKey"
          >
            Clear key
          </button>
        </div>
        <div class="mt-1 text-[11px] text-gray-500" data-testid="settings-google-ai-studio-key-status">
          {{ googleAIStudioApiKeyConfigured ? `Configured: ${googleAIStudioMaskedApiKey || '***'}` : 'Not configured' }}
        </div>
        <div v-if="googleAIStudioCredentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-google-ai-studio-credential-warnings">
          <div v-for="warning in googleAIStudioCredentialWarnings" :key="warning">{{ warning }}</div>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">Manual Gemini model id</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="googleAIStudioModel"
            type="text"
            placeholder="gemini-2.5-flash"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50"
            :disabled="props.disabled || props.isRunning || loading || saving"
            data-testid="settings-google-ai-studio-model"
          />
          <button
            type="button"
            class="rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            :disabled="!canApplyGoogleAIStudioChatSettings"
            data-testid="settings-google-ai-studio-apply-chat"
            @click="applyGoogleAIStudioChatSettings"
          >
            Use model for experimental chat
          </button>
        </div>
        <div class="mt-1 text-[11px] text-emerald-800" data-testid="settings-google-ai-studio-chat-note">
          This only updates the experimental Google AI Studio Console default. Use Console refresh for official availability diagnostics. It does not publish models to the main picker, does not enable chat by itself, and does not use legacy Gemini runtime.
        </div>
        <div v-if="googleAIStudioChatApplyMessage" class="mt-1 text-[11px] text-emerald-900" data-testid="settings-google-ai-studio-chat-apply-result">
          {{ googleAIStudioChatApplyMessage }}
        </div>
      </div>

      <div class="rounded-lg border border-rose-200 bg-white p-3" data-testid="settings-anthropic-experimental">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-rose-800">Anthropic Messages Experimental Chat</div>
            <div class="mt-1 text-[11px] text-gray-500">
              Native Anthropic Messages text-only path. It is separate from OpenRouter, default-off, and uses a main-process credential bridge.
            </div>
          </div>
          <span class="shrink-0 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800">
            Experimental
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">Anthropic API key</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="anthropicApiKey"
            type="password"
            placeholder="sk-ant-..."
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || !anthropicCredentialAvailable"
            data-testid="settings-anthropic-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !anthropicCredentialAvailable || !anthropicApiKeyConfigured"
            data-testid="settings-anthropic-clear-key"
            @click="clearAnthropicApiKey"
          >
            Clear key
          </button>
        </div>
        <div class="mt-1 text-[11px] text-gray-500" data-testid="settings-anthropic-key-status">
          {{ anthropicApiKeyConfigured ? `Configured: ${anthropicMaskedApiKey || '***'}` : 'Not configured' }}
        </div>
        <div v-if="anthropicCredentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-anthropic-credential-warnings">
          <div v-for="warning in anthropicCredentialWarnings" :key="warning">{{ warning }}</div>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">Manual Claude model id</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="anthropicModel"
            type="text"
            placeholder="claude-sonnet-4-5"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:bg-gray-50"
            :disabled="props.disabled || props.isRunning || loading || saving"
            data-testid="settings-anthropic-model"
          />
          <button
            type="button"
            class="rounded-md border border-rose-700 bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
            :disabled="!canApplyAnthropicChatSettings"
            data-testid="settings-anthropic-apply-chat"
            @click="applyAnthropicChatSettings"
          >
            Use model for experimental chat
          </button>
        </div>
        <div class="mt-1 text-[11px] text-rose-800" data-testid="settings-anthropic-chat-note">
          This only updates the experimental Anthropic Messages Console default. Use Console refresh for official availability diagnostics. It does not publish models to the main picker, does not enable chat by itself, and does not persist thinking/signature output.
        </div>
        <div v-if="anthropicChatApplyMessage" class="mt-1 text-[11px] text-rose-900" data-testid="settings-anthropic-chat-apply-result">
          {{ anthropicChatApplyMessage }}
        </div>
      </div>

      <div class="rounded-lg border border-cyan-200 bg-white p-3" data-testid="settings-deepseek-experimental">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-cyan-800">DeepSeek Official Experimental Chat</div>
            <div class="mt-1 text-[11px] text-gray-500">
              Native DeepSeek official profile using DeepSeek API semantics. It is separate from OpenRouter, default-off, and uses a main-process credential bridge.
            </div>
          </div>
          <span class="shrink-0 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-800">
            Experimental
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">DeepSeek API key</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="deepSeekApiKey"
            type="password"
            placeholder="sk-..."
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || !deepSeekCredentialAvailable"
            data-testid="settings-deepseek-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !deepSeekCredentialAvailable || !deepSeekApiKeyConfigured"
            data-testid="settings-deepseek-clear-key"
            @click="clearDeepSeekApiKey"
          >
            Clear key
          </button>
        </div>
        <div class="mt-1 text-[11px] text-gray-500" data-testid="settings-deepseek-key-status">
          {{ deepSeekApiKeyConfigured ? `Configured: ${deepSeekMaskedApiKey || '***'}` : 'Not configured' }}
        </div>
        <div v-if="deepSeekCredentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-deepseek-credential-warnings">
          <div v-for="warning in deepSeekCredentialWarnings" :key="warning">{{ warning }}</div>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">Manual DeepSeek model id</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="deepSeekModel"
            type="text"
            placeholder="deepseek-v4-flash"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:bg-gray-50"
            :disabled="props.disabled || props.isRunning || loading || saving"
            data-testid="settings-deepseek-model"
          />
          <button
            type="button"
            class="rounded-md border border-cyan-700 bg-cyan-700 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
            :disabled="!canApplyDeepSeekChatSettings"
            data-testid="settings-deepseek-apply-chat"
            @click="applyDeepSeekChatSettings"
          >
            Use model for experimental chat
          </button>
        </div>
        <div class="mt-1 text-[11px] text-cyan-800" data-testid="settings-deepseek-chat-note">
          This only updates the experimental DeepSeek official Console default. Use Console refresh for official availability diagnostics. Deprecated aliases deepseek-chat and deepseek-reasoner are not long-term primary models. It does not publish models to the main picker, does not enable chat by itself, and does not persist reasoning_content.
        </div>
        <div v-if="deepSeekChatApplyMessage" class="mt-1 text-[11px] text-cyan-900" data-testid="settings-deepseek-chat-apply-result">
          {{ deepSeekChatApplyMessage }}
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3" data-testid="settings-local-endpoint-diagnostics">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">Local Endpoint Diagnostics</div>
            <div class="mt-1 text-[11px] text-gray-500">Experimental diagnostics only. Text chat requires the explicit LocalEndpoint console mode.</div>
          </div>
          <span class="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
            Diagnostics-only
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">Localhost endpoint URL</label>
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
            {{ localEndpointProbeLoading ? 'Probing...' : 'Test / Probe' }}
          </button>
          <button
            type="button"
            class="rounded-md border border-blue-600 bg-white px-3 py-2 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-50 disabled:opacity-50"
            :disabled="!canProbeLocalEndpoint || loading || saving || localEndpointProbeLoading || localEndpointStreamProbeLoading"
            data-testid="settings-local-endpoint-stream-probe"
            @click="streamProbeLocalEndpoint"
          >
            {{ localEndpointStreamProbeLoading ? 'Testing...' : 'Test Streaming' }}
          </button>
        </div>

        <div
          v-if="localEndpointProbeResult"
          class="mt-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-700"
          data-testid="settings-local-endpoint-probe-result"
        >
          <template v-if="localEndpointProbeResult.ok">
            <div>
              Status:
              <span data-testid="settings-local-endpoint-probe-status">{{ localEndpointProbeResult.diagnostics.status }}</span>
              · Family:
              <span data-testid="settings-local-endpoint-probe-family">{{ localEndpointProbeResult.diagnostics.endpointFamily }}</span>
            </div>
            <div class="mt-1">Endpoint: {{ localEndpointProbeResult.diagnostics.safeBaseUrl }}</div>
            <div class="mt-1">
              Models:
              <span v-if="localEndpointProbeResult.diagnostics.modelList.ok" data-testid="settings-local-endpoint-probe-models">
                {{ localEndpointProbeResult.diagnostics.modelList.models.length ? localEndpointProbeResult.diagnostics.modelList.models.join(', ') : 'no models found; enter a manual model id below' }}
                <span v-if="localEndpointProbeResult.diagnostics.modelList.truncated"> (truncated)</span>
              </span>
              <span v-else data-testid="settings-local-endpoint-probe-models">
                Model list failed: {{ localEndpointProbeResult.diagnostics.modelList.message }}
              </span>
            </div>
            <div class="mt-1" data-testid="settings-local-endpoint-probe-capabilities">
              Capability summary: text diagnostics only; diagnostics do not activate chat send; tools/files/reasoning/web disabled.
            </div>
            <div class="mt-3 grid gap-2 rounded-md border border-amber-100 bg-white px-3 py-2">
              <label class="block text-[11px] font-semibold text-amber-900">Choose probed model for experimental chat</label>
              <select
                class="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-sm disabled:bg-amber-50"
                :disabled="localEndpointProbedModels.length === 0"
                :value="localEndpointSelectedModel"
                data-testid="settings-local-endpoint-probed-model-select"
                @change="chooseLocalEndpointProbeModel(($event.target as HTMLSelectElement).value)"
              >
                <option value="">Select a probed model...</option>
                <option v-for="modelId in localEndpointProbedModels" :key="modelId" :value="modelId">
                  {{ modelId }}
                </option>
              </select>
              <label class="block text-[11px] font-semibold text-amber-900">Manual model id override</label>
              <input
                class="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-sm"
                :value="localEndpointManualModel"
                placeholder="local-model"
                data-testid="settings-local-endpoint-manual-model"
                @input="updateLocalEndpointManualModel(($event.target as HTMLInputElement).value)"
              />
              <button
                type="button"
                class="w-fit rounded-md border border-amber-700 bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                :disabled="!canApplyLocalEndpointChatSettings"
                data-testid="settings-local-endpoint-apply-chat"
                @click="applyLocalEndpointChatSettings"
              >
                Use endpoint and model for experimental chat
              </button>
              <div class="text-[11px] text-amber-800" data-testid="settings-local-endpoint-chat-note">
                This only updates the experimental LocalEndpoint Console defaults. It does not publish models to the main picker and does not enable chat by itself.
              </div>
              <div v-if="localEndpointChatApplyMessage" class="text-[11px] text-amber-900" data-testid="settings-local-endpoint-chat-apply-result">
                {{ localEndpointChatApplyMessage }}
              </div>
            </div>
          </template>
          <template v-else>
            <div data-testid="settings-local-endpoint-probe-error">
              {{ localEndpointProbeResult.message }}
            </div>
            <div class="mt-3 grid gap-2 rounded-md border border-amber-100 bg-white px-3 py-2">
              <label class="block text-[11px] font-semibold text-amber-900">Manual model id for experimental chat</label>
              <input
                class="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-sm"
                :value="localEndpointManualModel"
                placeholder="local-model"
                data-testid="settings-local-endpoint-manual-model"
                @input="updateLocalEndpointManualModel(($event.target as HTMLInputElement).value)"
              />
              <button
                type="button"
                class="w-fit rounded-md border border-amber-700 bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                :disabled="!canApplyLocalEndpointChatSettings"
                data-testid="settings-local-endpoint-apply-chat"
                @click="applyLocalEndpointChatSettings"
              >
                Use manual endpoint and model for experimental chat
              </button>
              <div class="text-[11px] text-amber-800" data-testid="settings-local-endpoint-chat-note">
                Manual override is kept for servers that do not expose a model list. LocalEndpoint remains experimental and default-off.
              </div>
              <div v-if="localEndpointChatApplyMessage" class="text-[11px] text-amber-900" data-testid="settings-local-endpoint-chat-apply-result">
                {{ localEndpointChatApplyMessage }}
              </div>
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
              Stream:
              <span data-testid="settings-local-endpoint-stream-status">{{ localEndpointStreamProbeResult.diagnostics.status }}</span>
              · Family:
              <span data-testid="settings-local-endpoint-stream-family">{{ localEndpointStreamProbeResult.diagnostics.endpointFamily }}</span>
            </div>
            <div class="mt-1">Endpoint: {{ localEndpointStreamProbeResult.diagnostics.safeBaseUrl }}</div>
            <div class="mt-1" data-testid="settings-local-endpoint-stream-evidence">
              Evidence: {{ localEndpointStreamProbeResult.diagnostics.evidence }}
              <span v-if="localEndpointStreamProbeResult.diagnostics.textDeltaPreview">
                · {{ localEndpointStreamProbeResult.diagnostics.textDeltaPreview }}
              </span>
            </div>
            <div class="mt-1" data-testid="settings-local-endpoint-stream-capabilities">
              Capability summary: streaming diagnostics only; diagnostics do not activate chat send; tools/files/reasoning/web disabled.
            </div>
          </template>
          <template v-else>
            <div data-testid="settings-local-endpoint-stream-error">
              {{ localEndpointStreamProbeResult.message }}
            </div>
          </template>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('settings.network.title') }}</div>

        <div class="mt-3 space-y-3">
          <div class="rounded-md border border-gray-100 bg-gray-50 p-3">
            <div class="text-[11px] font-semibold text-gray-700">Network Proxy</div>
            <div class="mt-1 text-[11px] text-gray-500">
              Plugin downloads use this policy. Automatic and conversion-time downloads remain disabled.
            </div>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <label class="block text-[11px] text-gray-700">
                <span class="font-semibold">Proxy mode</span>
                <select
                  class="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 disabled:bg-gray-50"
                  :disabled="!canEdit || loading || saving"
                  v-model="networkProxyMode"
                >
                  <option value="environment">Environment variables</option>
                  <option value="manual">Manual</option>
                  <option value="direct">Direct</option>
                  <option value="system">System</option>
                </select>
              </label>
              <label class="block text-[11px] text-gray-700">
                <span class="font-semibold">Manual proxy URL</span>
                <input
                  type="text"
                  class="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 disabled:bg-gray-50"
                  placeholder="http://127.0.0.1:7890"
                  :disabled="!canEdit || loading || saving || networkProxyMode !== 'manual'"
                  v-model="networkProxyManualUrl"
                />
              </label>
              <label class="block text-[11px] text-gray-700 sm:col-span-2">
                <span class="font-semibold">No proxy / bypass list</span>
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
                <span>Strict SSL required for plugin downloads</span>
              </label>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!canEdit || loading || saving || networkProxyProbeLoading"
                @click="testNetworkProxyConnection"
              >
                {{ networkProxyProbeLoading ? 'Testing...' : 'Test connection' }}
              </button>
            </div>
            <div class="mt-2 text-[11px] text-gray-500">
              Current mode: {{ proxyModeLabel(networkProxyMode) }}. Probe checks metadata, HEAD and a 1 KB Range request only.
            </div>
            <div v-if="networkProxyProbeResult" class="mt-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-[11px] text-gray-600">
              <div>Probe: {{ networkProxyProbeResult.ok ? 'passed' : 'failed' }}</div>
              <div>Metadata: {{ networkProxyProbeResult.metadataReachable ? 'reachable' : 'unreachable' }}</div>
              <div>HEAD: {{ networkProxyProbeResult.headPassed ? 'passed' : 'failed' }}</div>
              <div>Content length: {{ networkProxyProbeResult.contentLength }}</div>
              <div>Range: {{ networkProxyProbeResult.rangePassed ? 'passed' : 'failed' }}</div>
              <div>Diagnostic: {{ networkProxyProbeResult.terminalDiagnostic }}</div>
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

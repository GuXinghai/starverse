<script setup lang="ts">
import { computed, onMounted, ref, watch, type Ref } from 'vue'
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
import { t, tf, useLanguagePrefs, LOCALE_DISPLAY_NAMES, type SupportedLocale, type LocaleMode } from '@/shared/i18n'
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

const CONFIGURED_API_KEY_PLACEHOLDER = '••••••'

function apiKeyPlaceholder(configured: boolean, fallback: string): string {
  return configured ? CONFIGURED_API_KEY_PLACEHOLDER : fallback
}

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
  | 'plaintext_fallback'
  | 'missing'
type ProviderCredentialBackendKind = 'electron_safe_storage' | 'plaintext_fallback' | 'unavailable'

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
  status?: OpenRouterCredentialStatus
  message?: string
}>

type ProviderCredentialRevealResult = Readonly<
  | { ok: true; apiKey: string }
  | { ok: false; code?: string; message?: string }
>

type ProviderCredentialRevealBridge = Readonly<{
  reveal: () => Promise<ProviderCredentialRevealResult>
}>

type OpenRouterCredentialBridge = Readonly<{
  getStatus: () => Promise<OpenRouterCredentialResult>
  reveal: () => Promise<ProviderCredentialRevealResult>
  update: (payload: Readonly<{ apiKey?: string }>) => Promise<OpenRouterCredentialResult>
  clear: () => Promise<OpenRouterCredentialResult>
}>

type OpenAIResponsesCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'openai'
  profileId: 'openai-responses-v1'
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
  reveal: () => Promise<ProviderCredentialRevealResult>
  update: (payload: Readonly<{ apiKey?: string }>) => Promise<OpenAIResponsesCredentialResult>
  clear: () => Promise<OpenAIResponsesCredentialResult>
}>

type GoogleAIStudioCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'google-ai-studio'
  profileId: 'gemini-developer-api-v1beta'
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
  reveal: () => Promise<ProviderCredentialRevealResult>
  update: (payload: Readonly<{ apiKey?: string }>) => Promise<GoogleAIStudioCredentialResult>
  clear: () => Promise<GoogleAIStudioCredentialResult>
}>

type AnthropicCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'anthropic'
  profileId: 'anthropic-messages-2023-06-01'
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
  reveal: () => Promise<ProviderCredentialRevealResult>
  update: (payload: Readonly<{ apiKey?: string }>) => Promise<AnthropicCredentialResult>
  clear: () => Promise<AnthropicCredentialResult>
}>

type DeepSeekCredentialStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend?: ProviderCredentialBackendKind
  providerId: 'deepseek'
  profileId: 'deepseek-stable-chat-v1'
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
  reveal: () => Promise<ProviderCredentialRevealResult>
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
const LOCAL_ENDPOINT_CHAT_SETTINGS_EVENT = 'settings:localEndpointTextChatUpdated'
const LEGACY_MODEL_STORAGE_KEYS = [
  'starverse.lmStudio.model',
  'starverse.ollama.model',
  'starverse.localEndpointTextChat.model',
  'starverse.openAIResponsesTextChat.model',
  'starverse.googleAIStudioTextChat.model',
  'starverse.anthropicMessagesTextChat.model',
  'starverse.deepSeekTextChat.model',
] as const

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
    typeof bridge.reveal !== 'function' ||
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
    typeof bridge.reveal !== 'function' ||
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
    typeof bridge.reveal !== 'function' ||
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
    typeof bridge.reveal !== 'function' ||
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
    typeof bridge.reveal !== 'function' ||
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

const apiKey = ref('')
const apiKeyConfigured = ref(false)
const maskedApiKey = ref('')
const credentialWarnings = ref<string[]>([])
const openAIResponsesApiKey = ref('')
const openAIResponsesApiKeyConfigured = ref(false)
const openAIResponsesMaskedApiKey = ref('')
const openAIResponsesCredentialWarnings = ref<string[]>([])
const googleAIStudioApiKey = ref('')
const googleAIStudioApiKeyConfigured = ref(false)
const googleAIStudioMaskedApiKey = ref('')
const googleAIStudioCredentialWarnings = ref<string[]>([])
const anthropicApiKey = ref('')
const anthropicApiKeyConfigured = ref(false)
const anthropicMaskedApiKey = ref('')
const anthropicCredentialWarnings = ref<string[]>([])
const deepSeekApiKey = ref('')
const deepSeekApiKeyConfigured = ref(false)
const deepSeekMaskedApiKey = ref('')
const deepSeekCredentialWarnings = ref<string[]>([])
const catalogStartupSyncPolicy = ref<CatalogAutoSyncPolicy>(DEFAULT_CATALOG_AUTO_SYNC_POLICY)
const catalogPickerOpenSyncPolicy = ref<CatalogAutoSyncPolicy>(DEFAULT_CATALOG_AUTO_SYNC_POLICY)
const catalogListUpdateMode = ref<CatalogListUpdateMode>(DEFAULT_CATALOG_LIST_UPDATE_MODE)
const catalogFreshnessMs = ref(DEFAULT_CATALOG_FRESHNESS_MS)
const catalogRetentionMs = ref<CatalogRetentionMs>(DEFAULT_CATALOG_RETENTION_MS)
const requireParameters = ref(false)
const debugEchoUpstreamBody = ref(false)
const showApiKey = ref(false)
const showOpenAIResponsesApiKey = ref(false)
const showGoogleAIStudioApiKey = ref(false)
const showAnthropicApiKey = ref(false)
const showDeepSeekApiKey = ref(false)
const credentialRevealLoading = ref<string | null>(null)
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
const googleAIStudioCredentialAvailable = computed(() => !!getGoogleAIStudioCredentialBridge())
const anthropicCredentialAvailable = computed(() => !!getAnthropicCredentialBridge())
const deepSeekCredentialAvailable = computed(() => !!getDeepSeekCredentialBridge())
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

type ApiKeyVisibilityInput = Readonly<{
  id: string
  value: Ref<string>
  visible: Ref<boolean>
  configured: Ref<boolean>
  getBridge: () => ProviderCredentialRevealBridge | null
  missingBridgeMessage: string
  revealFailedMessage: string
}>

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

async function toggleApiKeyVisibility(input: ApiKeyVisibilityInput) {
  error.value = null
  savedMessage.value = null

  if (input.visible.value) {
    input.visible.value = false
    if (input.configured.value) {
      input.value.value = ''
    }
    return
  }

  if (!input.value.value.trim() && input.configured.value) {
    const credentialBridge = input.getBridge()
    if (!credentialBridge) {
      error.value = input.missingBridgeMessage
      return
    }

    credentialRevealLoading.value = input.id
    try {
      const result = await credentialBridge.reveal()
      if (!result?.ok) {
        throw new Error(result?.message || input.revealFailedMessage)
      }
      input.value.value = result.apiKey
    } catch (err: any) {
      error.value = err?.message ? String(err.message) : input.revealFailedMessage
      return
    } finally {
      credentialRevealLoading.value = null
    }
  }

  input.visible.value = true
}

function toggleOpenRouterApiKeyVisibility() {
  void toggleApiKeyVisibility({
    id: 'openrouter',
    value: apiKey,
    visible: showApiKey,
    configured: apiKeyConfigured,
    getBridge: getOpenRouterCredentialBridge,
    missingBridgeMessage: t('settings.runtime.missingOpenRouterCredentialBridge'),
    revealFailedMessage: t('settings.runtime.openRouterCredentialStatusUnavailable'),
  })
}

function toggleOpenAIResponsesApiKeyVisibility() {
  void toggleApiKeyVisibility({
    id: 'openai_responses',
    value: openAIResponsesApiKey,
    visible: showOpenAIResponsesApiKey,
    configured: openAIResponsesApiKeyConfigured,
    getBridge: getOpenAIResponsesCredentialBridge,
    missingBridgeMessage: t('settings.runtime.missingOpenAIResponsesCredentialBridge'),
    revealFailedMessage: t('settings.runtime.openAIResponsesCredentialStatusUnavailable'),
  })
}

function toggleGoogleAIStudioApiKeyVisibility() {
  void toggleApiKeyVisibility({
    id: 'google_ai_studio',
    value: googleAIStudioApiKey,
    visible: showGoogleAIStudioApiKey,
    configured: googleAIStudioApiKeyConfigured,
    getBridge: getGoogleAIStudioCredentialBridge,
    missingBridgeMessage: t('settings.runtime.missingGoogleAIStudioCredentialBridge'),
    revealFailedMessage: t('settings.runtime.googleAIStudioCredentialStatusUnavailable'),
  })
}

function toggleAnthropicApiKeyVisibility() {
  void toggleApiKeyVisibility({
    id: 'anthropic',
    value: anthropicApiKey,
    visible: showAnthropicApiKey,
    configured: anthropicApiKeyConfigured,
    getBridge: getAnthropicCredentialBridge,
    missingBridgeMessage: t('settings.runtime.missingAnthropicCredentialBridge'),
    revealFailedMessage: t('settings.runtime.anthropicCredentialStatusUnavailable'),
  })
}

function toggleDeepSeekApiKeyVisibility() {
  void toggleApiKeyVisibility({
    id: 'deepseek',
    value: deepSeekApiKey,
    visible: showDeepSeekApiKey,
    configured: deepSeekApiKeyConfigured,
    getBridge: getDeepSeekCredentialBridge,
    missingBridgeMessage: t('settings.runtime.missingDeepSeekCredentialBridge'),
    revealFailedMessage: t('settings.runtime.deepSeekCredentialStatusUnavailable'),
  })
}

function applyOpenRouterCredentialStatus(status: OpenRouterCredentialStatus) {
  apiKey.value = ''
  showApiKey.value = false
  apiKeyConfigured.value = status.apiKeyConfigured === true
  maskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  credentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
}

async function loadOpenRouterCredentialStatus() {
  const credentialBridge = getOpenRouterCredentialBridge()
  if (!credentialBridge) {
    throw new Error(t('settings.runtime.missingOpenRouterCredentialBridge'))
  }

  const result = await credentialBridge.getStatus()
  if (!result?.ok || !result.status) {
    throw new Error(result?.message || t('settings.runtime.openRouterCredentialStatusUnavailable'))
  }
  applyOpenRouterCredentialStatus(result.status)
}

function applyOpenAIResponsesCredentialStatus(status: OpenAIResponsesCredentialStatus) {
  openAIResponsesApiKey.value = ''
  showOpenAIResponsesApiKey.value = false
  openAIResponsesApiKeyConfigured.value = status.apiKeyConfigured === true
  openAIResponsesMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  openAIResponsesCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
}

function applyGoogleAIStudioCredentialStatus(status: GoogleAIStudioCredentialStatus) {
  googleAIStudioApiKey.value = ''
  showGoogleAIStudioApiKey.value = false
  googleAIStudioApiKeyConfigured.value = status.apiKeyConfigured === true
  googleAIStudioMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  googleAIStudioCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
}

function applyAnthropicCredentialStatus(status: AnthropicCredentialStatus) {
  anthropicApiKey.value = ''
  showAnthropicApiKey.value = false
  anthropicApiKeyConfigured.value = status.apiKeyConfigured === true
  anthropicMaskedApiKey.value = status.apiKeyConfigured === true ? (status.maskedApiKey || '***') : ''
  anthropicCredentialWarnings.value = Array.isArray(status.warnings) ? status.warnings : []
}

function applyDeepSeekCredentialStatus(status: DeepSeekCredentialStatus) {
  deepSeekApiKey.value = ''
  showDeepSeekApiKey.value = false
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
    throw new Error(result?.message || t('settings.runtime.openAIResponsesCredentialStatusUnavailable'))
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
    throw new Error(result?.message || t('settings.runtime.googleAIStudioCredentialStatusUnavailable'))
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
    throw new Error(result?.message || t('settings.runtime.anthropicCredentialStatusUnavailable'))
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
    throw new Error(result?.message || t('settings.runtime.deepSeekCredentialStatusUnavailable'))
  }
  applyDeepSeekCredentialStatus(result.status)
}

function cleanupLegacyModelStorage() {
  try {
    for (const key of LEGACY_MODEL_STORAGE_KEYS) {
      globalThis.localStorage?.removeItem(key)
    }
  } catch {
    // Legacy model cleanup is best-effort; Settings no longer reads these keys.
  }
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
    await loadOpenRouterCredentialStatus()
    await loadOpenAIResponsesCredentialStatus()
    await loadGoogleAIStudioCredentialStatus()
    await loadAnthropicCredentialStatus()
    await loadDeepSeekCredentialStatus()
    cleanupLegacyModelStorage()
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
      generationParamsDefaults.value = normalizeGenerationParamsLayer(await getGenerationParamsDefaults())
    } catch {
      generationParamsDefaults.value = null
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
    const credentialBridge = getOpenRouterCredentialBridge()
    if (!credentialBridge) {
      throw new Error(t('settings.runtime.missingOpenRouterCredentialBridge'))
    }
    const credentialPayload: { apiKey?: string } = {}
    const nextApiKey = apiKey.value.trim()
    if (nextApiKey) credentialPayload.apiKey = nextApiKey
    const credentialResult = await credentialBridge.update(credentialPayload)
    if (!credentialResult?.ok || !credentialResult.status) {
      throw new Error(credentialResult?.message || t('settings.runtime.openRouterCredentialUpdateFailed'))
    }
    applyOpenRouterCredentialStatus(credentialResult.status)

    const openAIResponsesCredentialBridge = getOpenAIResponsesCredentialBridge()
    const nextOpenAIResponsesApiKey = openAIResponsesApiKey.value.trim()
    if (nextOpenAIResponsesApiKey) {
      if (!openAIResponsesCredentialBridge) {
        throw new Error(t('settings.runtime.missingOpenAIResponsesCredentialBridge'))
      }
      const openAIResponsesCredentialResult = await openAIResponsesCredentialBridge.update({
        apiKey: nextOpenAIResponsesApiKey,
      })
      if (!openAIResponsesCredentialResult?.ok || !openAIResponsesCredentialResult.status) {
        throw new Error(openAIResponsesCredentialResult?.message || t('settings.runtime.openAIResponsesCredentialUpdateFailed'))
      }
      applyOpenAIResponsesCredentialStatus(openAIResponsesCredentialResult.status)
    }
    const googleAIStudioCredentialBridge = getGoogleAIStudioCredentialBridge()
    const nextGoogleAIStudioApiKey = googleAIStudioApiKey.value.trim()
    if (nextGoogleAIStudioApiKey) {
      if (!googleAIStudioCredentialBridge) {
        throw new Error(t('settings.runtime.missingGoogleAIStudioCredentialBridge'))
      }
      const googleAIStudioCredentialResult = await googleAIStudioCredentialBridge.update({
        apiKey: nextGoogleAIStudioApiKey,
      })
      if (!googleAIStudioCredentialResult?.ok || !googleAIStudioCredentialResult.status) {
        throw new Error(googleAIStudioCredentialResult?.message || t('settings.runtime.googleAIStudioCredentialUpdateFailed'))
      }
      applyGoogleAIStudioCredentialStatus(googleAIStudioCredentialResult.status)
    }
    const anthropicCredentialBridge = getAnthropicCredentialBridge()
    const nextAnthropicApiKey = anthropicApiKey.value.trim()
    if (nextAnthropicApiKey) {
      if (!anthropicCredentialBridge) {
        throw new Error(t('settings.runtime.missingAnthropicCredentialBridge'))
      }
      const anthropicCredentialResult = await anthropicCredentialBridge.update({
        apiKey: nextAnthropicApiKey,
      })
      if (!anthropicCredentialResult?.ok || !anthropicCredentialResult.status) {
        throw new Error(anthropicCredentialResult?.message || t('settings.runtime.anthropicCredentialUpdateFailed'))
      }
      applyAnthropicCredentialStatus(anthropicCredentialResult.status)
    }
    const deepSeekCredentialBridge = getDeepSeekCredentialBridge()
    const nextDeepSeekApiKey = deepSeekApiKey.value.trim()
    if (nextDeepSeekApiKey) {
      if (!deepSeekCredentialBridge) {
        throw new Error(t('settings.runtime.missingDeepSeekCredentialBridge'))
      }
      const deepSeekCredentialResult = await deepSeekCredentialBridge.update({
        apiKey: nextDeepSeekApiKey,
      })
      if (!deepSeekCredentialResult?.ok || !deepSeekCredentialResult.status) {
        throw new Error(deepSeekCredentialResult?.message || t('settings.runtime.deepSeekCredentialUpdateFailed'))
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
    error.value = t('settings.runtime.missingOpenRouterCredentialBridge')
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.clear()
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || t('settings.runtime.openRouterCredentialClearFailed'))
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

async function clearOpenAIResponsesApiKey() {
  error.value = null
  savedMessage.value = null
  const credentialBridge = getOpenAIResponsesCredentialBridge()
  if (!credentialBridge) {
    error.value = t('settings.runtime.missingOpenAIResponsesCredentialBridge')
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.clear()
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || t('settings.runtime.openAIResponsesCredentialClearFailed'))
    }
    applyOpenAIResponsesCredentialStatus(result.status)
    savedMessage.value = t('settings.runtime.openAIResponsesApiKeyCleared')
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
    error.value = t('settings.runtime.missingGoogleAIStudioCredentialBridge')
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.clear()
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || t('settings.runtime.googleAIStudioCredentialClearFailed'))
    }
    applyGoogleAIStudioCredentialStatus(result.status)
    savedMessage.value = t('settings.runtime.googleAIStudioApiKeyCleared')
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
    error.value = t('settings.runtime.missingAnthropicCredentialBridge')
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.clear()
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || t('settings.runtime.anthropicCredentialClearFailed'))
    }
    applyAnthropicCredentialStatus(result.status)
    savedMessage.value = t('settings.runtime.anthropicApiKeyCleared')
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
    error.value = t('settings.runtime.missingDeepSeekCredentialBridge')
    return
  }
  saving.value = true
  try {
    const result = await credentialBridge.clear()
    if (!result?.ok || !result.status) {
      throw new Error(result?.message || t('settings.runtime.deepSeekCredentialClearFailed'))
    }
    applyDeepSeekCredentialStatus(result.status)
    savedMessage.value = t('settings.runtime.deepSeekApiKeyCleared')
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
    error.value = t('settings.runtime.missingElectronStore')
    return
  }

  verifySyncLoading.value = true
  try {
    const credentialBridge = getOpenRouterCredentialBridge()
    if (!credentialBridge) {
      error.value = t('settings.runtime.missingOpenRouterCredentialBridge')
      return
    }
    const credentialPayload: { apiKey?: string } = {}
    const nextApiKey = apiKey.value.trim()
    if (nextApiKey) credentialPayload.apiKey = nextApiKey
    const credentialResult = await credentialBridge.update(credentialPayload)
    if (!credentialResult?.ok || !credentialResult.status) {
      throw new Error(credentialResult?.message || t('settings.runtime.openRouterCredentialUpdateFailed'))
    }
    applyOpenRouterCredentialStatus(credentialResult.status)

    const result = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      page: { limit: 1 },
    })

    if (result.status === 'synced') {
      const modelCount = result.modelCount ?? 0
      verifySyncResult.value = `${t('settings.openrouter.verifySyncSuccess')} (${modelCount})`
    } else {
      verifySyncResult.value = `${t('settings.openrouter.verifySyncFailed')}：${result.notice ?? 'model_list_unavailable'}`
    }
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    verifySyncLoading.value = false
  }
}

async function clearCurrentCatalogCache() {
  error.value = null
  savedMessage.value = null
  verifySyncResult.value = null
  if (!apiKeyConfigured.value && !apiKey.value.trim()) {
    error.value = t('settings.openrouter.catalogCacheNoApiKey')
    return
  }
  catalogClearLoading.value = 'current'
  try {
    // V2 fetches the provider-owned availability contract directly and keeps
    // no legacy scoped catalog cache in the epoch workspace.
    savedMessage.value = t('settings.openrouter.catalogCacheNotUsedV2')
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
  catalogClearLoading.value = 'all'
  try {
    savedMessage.value = t('settings.openrouter.catalogCacheNotUsedV2')
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
    cleanupLegacyModelStorage()
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

      <CompatibleProviderSettingsPanel :disabled="props.disabled || props.isRunning" />

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
          {{ t('settings.openrouter.explicitProviderDesc') }}
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">{{ t('settings.openrouter.apiKey') }}</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            :type="showApiKey ? 'text' : 'password'"
            :placeholder="apiKeyPlaceholder(apiKeyConfigured, t('settings.openrouter.apiKeyPlaceholder'))"
            :disabled="!canEdit || loading || saving"
            data-testid="settings-openrouter-api-key"
            v-model="apiKey"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || credentialRevealLoading !== null || (!showApiKey && !apiKey.trim() && !apiKeyConfigured)"
            data-testid="settings-openrouter-toggle-key-visibility"
            @click="toggleOpenRouterApiKeyVisibility"
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
        <div v-if="!apiKeyConfigured" class="mt-1 text-[11px] text-gray-500" data-testid="settings-openrouter-key-status">
          {{ t('settings.credentials.notConfigured') }}
        </div>
        <div v-if="credentialWarnings.length" class="mt-1 space-y-1 text-[11px] text-amber-700" data-testid="settings-openrouter-credential-warnings">
          <div v-for="warning in credentialWarnings" :key="warning">{{ warning }}</div>
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
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="openAIResponsesApiKey"
            :type="showOpenAIResponsesApiKey ? 'text' : 'password'"
            :placeholder="apiKeyPlaceholder(openAIResponsesApiKeyConfigured, t('settings.experimentalChat.placeholder.openAIKey'))"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || !openAIResponsesCredentialAvailable"
            data-testid="settings-openai-responses-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !openAIResponsesCredentialAvailable || credentialRevealLoading !== null || (!showOpenAIResponsesApiKey && !openAIResponsesApiKey.trim() && !openAIResponsesApiKeyConfigured)"
            data-testid="settings-openai-responses-toggle-key-visibility"
            @click="toggleOpenAIResponsesApiKeyVisibility"
          >
            {{ showOpenAIResponsesApiKey ? t('common.hide') : t('common.show') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !openAIResponsesCredentialAvailable || !openAIResponsesApiKeyConfigured"
            data-testid="settings-openai-responses-clear-key"
            @click="clearOpenAIResponsesApiKey"
          >
            {{ t('settings.experimentalChat.clearKey') }}
          </button>
        </div>
        <div v-if="!openAIResponsesApiKeyConfigured" class="mt-1 text-[11px] text-gray-500" data-testid="settings-openai-responses-key-status">
          {{ t('settings.credentials.notConfigured') }}
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
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="googleAIStudioApiKey"
            :type="showGoogleAIStudioApiKey ? 'text' : 'password'"
            :placeholder="apiKeyPlaceholder(googleAIStudioApiKeyConfigured, t('settings.experimentalChat.placeholder.geminiKey'))"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || !googleAIStudioCredentialAvailable"
            data-testid="settings-google-ai-studio-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !googleAIStudioCredentialAvailable || credentialRevealLoading !== null || (!showGoogleAIStudioApiKey && !googleAIStudioApiKey.trim() && !googleAIStudioApiKeyConfigured)"
            data-testid="settings-google-ai-studio-toggle-key-visibility"
            @click="toggleGoogleAIStudioApiKeyVisibility"
          >
            {{ showGoogleAIStudioApiKey ? t('common.hide') : t('common.show') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !googleAIStudioCredentialAvailable || !googleAIStudioApiKeyConfigured"
            data-testid="settings-google-ai-studio-clear-key"
            @click="clearGoogleAIStudioApiKey"
          >
            {{ t('settings.experimentalChat.clearKey') }}
          </button>
        </div>
        <div v-if="!googleAIStudioApiKeyConfigured" class="mt-1 text-[11px] text-gray-500" data-testid="settings-google-ai-studio-key-status">
          {{ t('settings.credentials.notConfigured') }}
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
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="anthropicApiKey"
            :type="showAnthropicApiKey ? 'text' : 'password'"
            :placeholder="apiKeyPlaceholder(anthropicApiKeyConfigured, t('settings.experimentalChat.placeholder.anthropicKey'))"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || !anthropicCredentialAvailable"
            data-testid="settings-anthropic-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !anthropicCredentialAvailable || credentialRevealLoading !== null || (!showAnthropicApiKey && !anthropicApiKey.trim() && !anthropicApiKeyConfigured)"
            data-testid="settings-anthropic-toggle-key-visibility"
            @click="toggleAnthropicApiKeyVisibility"
          >
            {{ showAnthropicApiKey ? t('common.hide') : t('common.show') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !anthropicCredentialAvailable || !anthropicApiKeyConfigured"
            data-testid="settings-anthropic-clear-key"
            @click="clearAnthropicApiKey"
          >
            {{ t('settings.experimentalChat.clearKey') }}
          </button>
        </div>
        <div v-if="!anthropicApiKeyConfigured" class="mt-1 text-[11px] text-gray-500" data-testid="settings-anthropic-key-status">
          {{ t('settings.credentials.notConfigured') }}
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
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="deepSeekApiKey"
            :type="showDeepSeekApiKey ? 'text' : 'password'"
            :placeholder="apiKeyPlaceholder(deepSeekApiKeyConfigured, t('settings.experimentalChat.placeholder.deepSeekKey'))"
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:bg-gray-50"
            :disabled="!canEdit || loading || saving || !deepSeekCredentialAvailable"
            data-testid="settings-deepseek-api-key"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !deepSeekCredentialAvailable || credentialRevealLoading !== null || (!showDeepSeekApiKey && !deepSeekApiKey.trim() && !deepSeekApiKeyConfigured)"
            data-testid="settings-deepseek-toggle-key-visibility"
            @click="toggleDeepSeekApiKeyVisibility"
          >
            {{ showDeepSeekApiKey ? t('common.hide') : t('common.show') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving || !deepSeekCredentialAvailable || !deepSeekApiKeyConfigured"
            data-testid="settings-deepseek-clear-key"
            @click="clearDeepSeekApiKey"
          >
            {{ t('settings.experimentalChat.clearKey') }}
          </button>
        </div>
        <div v-if="!deepSeekApiKeyConfigured" class="mt-1 text-[11px] text-gray-500" data-testid="settings-deepseek-key-status">
          {{ t('settings.credentials.notConfigured') }}
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

      <NewChatLifecycleSettingsPanel />

      <div class="text-[11px] text-gray-500">
        {{ t('settings.footer') }}
      </div>
    </div>
  </div>
</template>

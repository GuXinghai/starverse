<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import type { SearchSettingsLayer, ResolvedSearchSettings } from '@/next/openrouter/searchSettingsResolver'
import type { SamplingParamsLayer, ResolvedSamplingParams } from '@/next/openrouter/samplingParamsResolver'
import type { ImageGenerationUserConfig } from '@/next/openrouter/imageGenerationSettingsPersistence'
import type {
  CurrentRuntimeSelection,
  RuntimeCapabilitySummaryLite,
} from '@/next/provider/runtimeSelection'
import type {
  OpenAIModelAvailabilityResult,
  OpenAIProviderModelAvailability,
} from '@/next/provider/openai-responses/openAIResponsesModelSource'
import type {
  DeepSeekModelAvailabilityResult,
  ProviderModelAvailability,
} from '@/next/provider/deepseek/deepSeekModelSource'
import type {
  GeminiModelAvailabilityResult,
  GeminiProviderModelAvailability,
} from '@/next/provider/gemini/geminiModelSource'
import type {
  AnthropicModelAvailabilityResult,
  AnthropicProviderModelAvailability,
} from '@/next/provider/anthropic/anthropicModelSource'
import type { ChatSessionConfig } from '../app/chatSessionConfig'
import WebSearchSettingsEditor from './WebSearchSettingsEditor.vue'
import SamplingParamsSettingsEditor from './SamplingParamsSettingsEditor.vue'
import ImageGenerationSettingsEditor from './ImageGenerationSettingsEditor.vue'
import { t, tf } from '@/shared/i18n'

const props = defineProps<{
  disabled: boolean
  isRunning: boolean
  sessionConfig: ChatSessionConfig
  openRouterChat?: Readonly<{
    enabled: boolean
    model: string
    providerLabel: string
  }> | null
  lmStudioChat?: Readonly<{
    enabled: boolean
    endpointUrl: string
    model: string
    chatMode: 'openai_compatible' | 'native_rest'
    openAICompatiblePreferredEndpoint: 'chat_completions' | 'responses'
    nativeRestControls: Readonly<{
      diagnosticsEnabled: boolean
      manualLoadUnloadEnabled: boolean
      autoLoadBeforeSendEnabled: boolean
      autoUnloadAfterSendEnabled: boolean
      autoUnloadAfterIdleEnabled?: boolean
    }>
    config: Readonly<{
      providerKey: 'lm_studio'
      endpointUrl: string
      nativeRestControls: Readonly<{
        diagnosticsEnabled: boolean
        manualLoadUnloadEnabled: boolean
        autoLoadBeforeSendEnabled: boolean
        autoUnloadAfterSendEnabled: boolean
        autoUnloadAfterIdleEnabled?: boolean
      }>
      chatMode: 'openai_compatible' | 'native_rest'
      openAICompatible: Readonly<{
        basePath: '/v1'
        preferredEndpoint: 'chat_completions' | 'responses'
      }>
      nativeRest: Readonly<{ basePath: '/api/v1' }>
    }>
    experimentalLabel: string
  }> | null
  ollamaChat?: Readonly<{
    enabled: boolean
    endpointUrl: string
    model: string
    chatMode: 'native_rest' | 'openai_compatible'
    nativeRestPreferredEndpoint: 'chat' | 'generate'
    openAICompatiblePreferredEndpoint: 'chat_completions' | 'responses'
    nativeControls: Readonly<{
      diagnosticsEnabled: boolean
      manualLoadUnloadEnabled: boolean
      autoLoadBeforeSendEnabled: boolean
      autoUnloadAfterSendEnabled: boolean
      autoUnloadAfterIdleEnabled?: boolean
    }>
    config: Readonly<{
      providerKey: 'ollama_local'
      endpointUrl: string
      nativeControls: Readonly<{
        diagnosticsEnabled: boolean
        manualLoadUnloadEnabled: boolean
        autoLoadBeforeSendEnabled: boolean
        autoUnloadAfterSendEnabled: boolean
        autoUnloadAfterIdleEnabled?: boolean
      }>
      chatMode: 'native_rest' | 'openai_compatible'
      nativeRest: Readonly<{
        basePath: '/api'
        preferredEndpoint: 'chat' | 'generate'
      }>
      openAICompatible: Readonly<{
        basePath: '/v1'
        preferredEndpoint: 'chat_completions' | 'responses'
      }>
    }>
    experimentalLabel: string
  }> | null
  localEndpointChat?: Readonly<{
    enabled: boolean
    endpointUrl: string
    model: string
    experimentalLabel: string
  }> | null
  openAIResponsesChat?: Readonly<{
    enabled: boolean
    model: string
    experimentalLabel: string
  }> | null
  openAIResponsesModelAvailability?: Readonly<{
    loading: boolean
    result: OpenAIModelAvailabilityResult | null
  }> | null
  googleAIStudioChat?: Readonly<{
    enabled: boolean
    model: string
    experimentalLabel: string
  }> | null
  googleAIStudioModelAvailability?: Readonly<{
    loading: boolean
    result: GeminiModelAvailabilityResult | null
  }> | null
  anthropicChat?: Readonly<{
    enabled: boolean
    model: string
    experimentalLabel: string
  }> | null
  anthropicModelAvailability?: Readonly<{
    loading: boolean
    result: AnthropicModelAvailabilityResult | null
  }> | null
  deepSeekChat?: Readonly<{
    enabled: boolean
    model: string
    experimentalLabel: string
  }> | null
  deepSeekModelAvailability?: Readonly<{
    loading: boolean
    result: DeepSeekModelAvailabilityResult | null
  }> | null
  currentRuntimeSelection?: CurrentRuntimeSelection | null
  currentRuntimeCapability?: RuntimeCapabilitySummaryLite | null
  currentRuntimeStatus?: Readonly<{
    selectionLabel: string
    capabilitySummary: string
    warnings: readonly string[]
  }> | null
  reasoningDisplayMode: 'inline' | 'rail'
  modelCatalog: readonly ModelCatalogItem[]
  webSearchResolved: ResolvedSearchSettings | null
  samplingParamsResolved: ResolvedSamplingParams | null
}>()

const emit = defineEmits<{
  (e: 'updateModel', modelKey: string): void
  (e: 'updateReasoningEnabled', enabled: boolean): void
  (e: 'updateReasoningEffort', effort: 'low' | 'medium' | 'high'): void
  (e: 'updateWebSearchEnabled', enabled: boolean): void
  (e: 'updateWebSearchLevel', level: 'low' | 'high'): void
  (e: 'updateWebSearchLayer', layer: SearchSettingsLayer | null): void
  (e: 'updateSamplingParamsLayer', layer: SamplingParamsLayer | null): void
  (e: 'updateImageGenerationEnabled', enabled: boolean): void
  (e: 'updateImageGenerationResolution', value: '1K' | '2K' | '4K'): void
  (e: 'updateImageGenerationAspectRatio', value: '16:9' | '3:4' | '1:1' | '4:3'): void
  (e: 'updateImageGeneration', value: ImageGenerationUserConfig): void
  (e: 'updateOpenRouterChatEnabled', enabled: boolean): void
  (e: 'updateLMStudioChatEnabled', enabled: boolean): void
  (e: 'updateLMStudioEndpointUrl', value: string): void
  (e: 'updateLMStudioModel', value: string): void
  (e: 'updateLMStudioChatMode', mode: 'openai_compatible' | 'native_rest'): void
  (e: 'updateLMStudioOpenAICompatiblePreferredEndpoint', endpoint: 'chat_completions' | 'responses'): void
  (
    e: 'updateLMStudioNativeRestControl',
    key: 'diagnosticsEnabled' | 'manualLoadUnloadEnabled' | 'autoLoadBeforeSendEnabled' | 'autoUnloadAfterSendEnabled' | 'autoUnloadAfterIdleEnabled',
    enabled: boolean
  ): void
  (e: 'clearLMStudioChat'): void
  (e: 'updateOllamaChatEnabled', enabled: boolean): void
  (e: 'updateOllamaEndpointUrl', value: string): void
  (e: 'updateOllamaModel', value: string): void
  (e: 'updateOllamaChatMode', mode: 'native_rest' | 'openai_compatible'): void
  (e: 'updateOllamaNativeRestPreferredEndpoint', endpoint: 'chat' | 'generate'): void
  (e: 'updateOllamaOpenAICompatiblePreferredEndpoint', endpoint: 'chat_completions' | 'responses'): void
  (
    e: 'updateOllamaNativeControl',
    key: 'diagnosticsEnabled' | 'manualLoadUnloadEnabled' | 'autoLoadBeforeSendEnabled' | 'autoUnloadAfterSendEnabled' | 'autoUnloadAfterIdleEnabled',
    enabled: boolean
  ): void
  (e: 'clearOllamaChat'): void
  (e: 'updateLocalEndpointChatEnabled', enabled: boolean): void
  (e: 'updateLocalEndpointChatUrl', value: string): void
  (e: 'updateLocalEndpointChatModel', value: string): void
  (e: 'clearLocalEndpointChat'): void
  (e: 'updateOpenAIResponsesChatEnabled', enabled: boolean): void
  (e: 'updateOpenAIResponsesChatModel', value: string): void
  (e: 'clearOpenAIResponsesChat'): void
  (e: 'refreshOpenAIResponsesModels'): void
  (e: 'updateGoogleAIStudioChatEnabled', enabled: boolean): void
  (e: 'updateGoogleAIStudioChatModel', value: string): void
  (e: 'clearGoogleAIStudioChat'): void
  (e: 'refreshGoogleAIStudioModels'): void
  (e: 'updateAnthropicChatEnabled', enabled: boolean): void
  (e: 'updateAnthropicChatModel', value: string): void
  (e: 'clearAnthropicChat'): void
  (e: 'refreshAnthropicModels'): void
  (e: 'updateDeepSeekChatEnabled', enabled: boolean): void
  (e: 'updateDeepSeekChatModel', value: string): void
  (e: 'clearDeepSeekChat'): void
  (e: 'refreshDeepSeekModels'): void
  (e: 'updateReasoningDisplayMode', mode: 'inline' | 'rail'): void
  (e: 'openSettings'): void
}>()

const disabled = computed(() => props.disabled || props.isRunning)
const modelValue = computed(() => props.sessionConfig.model.selectedModelKey ?? 'openrouter/auto')
const openRouterChat = computed(() => props.openRouterChat ?? {
  enabled: false,
  model: modelValue.value,
  providerLabel: 'OpenRouter · first-class provider',
})
const openRouterChatStatusLabel = computed(() => openRouterChat.value.enabled ? 'active' : 'inactive')
const lmStudioChat = computed(() => props.lmStudioChat ?? {
  enabled: false,
  endpointUrl: 'http://127.0.0.1:1234',
  model: '',
  chatMode: 'openai_compatible' as const,
  openAICompatiblePreferredEndpoint: 'chat_completions' as const,
  nativeRestControls: {
    diagnosticsEnabled: true,
    manualLoadUnloadEnabled: true,
    autoLoadBeforeSendEnabled: false,
    autoUnloadAfterSendEnabled: false,
    autoUnloadAfterIdleEnabled: false,
  },
  config: {
    providerKey: 'lm_studio' as const,
    endpointUrl: 'http://127.0.0.1:1234',
    nativeRestControls: {
      diagnosticsEnabled: true,
      manualLoadUnloadEnabled: true,
      autoLoadBeforeSendEnabled: false,
      autoUnloadAfterSendEnabled: false,
      autoUnloadAfterIdleEnabled: false,
    },
    chatMode: 'openai_compatible' as const,
    openAICompatible: { basePath: '/v1' as const, preferredEndpoint: 'chat_completions' as const },
    nativeRest: { basePath: '/api/v1' as const },
  },
  experimentalLabel: t('settings.lmStudio.experimentalLabel'),
})
const lmStudioChatStatusLabel = computed(() => lmStudioChat.value.enabled ? t('settings.lmStudio.active') : t('settings.lmStudio.inactive'))
const lmStudioProbeLoading = ref(false)
const lmStudioActionLoading = ref(false)
const lmStudioProbeResult = ref<any | null>(null)
const lmStudioActionResult = ref<string>('')
const lmStudioNativeModels = computed(() => {
  const result = lmStudioProbeResult.value
  return result?.ok && result.diagnostics?.nativeRest?.ok ? result.diagnostics.nativeRest.models as any[] : []
})
const lmStudioSelectedNativeModel = computed(() => {
  const selected = lmStudioChat.value.model.trim()
  return lmStudioNativeModels.value.find((model) => model.key === selected || model.loadedInstances?.includes(selected)) ?? null
})
const lmStudioSelectedInstanceId = computed(() => {
  const model = lmStudioSelectedNativeModel.value
  return Array.isArray(model?.loadedInstances) && model.loadedInstances[0] ? String(model.loadedInstances[0]) : lmStudioChat.value.model.trim()
})
const lmStudioBridgeAvailable = computed(() => {
  const bridge = (globalThis as any).lmStudioProvider
  return !!bridge && typeof bridge.probe === 'function' && typeof bridge.loadModel === 'function' && typeof bridge.unloadModel === 'function'
})
function formatLMStudioAvailability(available: boolean): string {
  return available ? t('settings.lmStudio.available') : t('settings.lmStudio.unavailable')
}
const ollamaChat = computed(() => props.ollamaChat ?? {
  enabled: false,
  endpointUrl: 'http://127.0.0.1:11434',
  model: '',
  chatMode: 'native_rest' as const,
  nativeRestPreferredEndpoint: 'chat' as const,
  openAICompatiblePreferredEndpoint: 'chat_completions' as const,
  nativeControls: {
    diagnosticsEnabled: true,
    manualLoadUnloadEnabled: true,
    autoLoadBeforeSendEnabled: false,
    autoUnloadAfterSendEnabled: false,
    autoUnloadAfterIdleEnabled: false,
  },
  config: {
    providerKey: 'ollama_local' as const,
    endpointUrl: 'http://127.0.0.1:11434',
    nativeControls: {
      diagnosticsEnabled: true,
      manualLoadUnloadEnabled: true,
      autoLoadBeforeSendEnabled: false,
      autoUnloadAfterSendEnabled: false,
      autoUnloadAfterIdleEnabled: false,
    },
    chatMode: 'native_rest' as const,
    nativeRest: { basePath: '/api' as const, preferredEndpoint: 'chat' as const },
    openAICompatible: { basePath: '/v1' as const, preferredEndpoint: 'chat_completions' as const },
  },
  experimentalLabel: t('settings.ollama.experimentalLabel'),
})
const ollamaChatStatusLabel = computed(() => ollamaChat.value.enabled ? t('settings.ollama.active') : t('settings.ollama.inactive'))
const ollamaProbeLoading = ref(false)
const ollamaActionLoading = ref(false)
const ollamaProbeResult = ref<any | null>(null)
const ollamaActionResult = ref<string>('')
const ollamaLocalModels = computed(() => {
  const result = ollamaProbeResult.value
  return result?.ok && result.diagnostics?.localModels?.ok ? result.diagnostics.localModels.models as any[] : []
})
const ollamaRunningModels = computed(() => {
  const result = ollamaProbeResult.value
  return result?.ok && result.diagnostics?.runningModels?.ok ? result.diagnostics.runningModels.models as any[] : []
})
const ollamaBridgeAvailable = computed(() => {
  const bridge = (globalThis as any).ollamaProvider
  return !!bridge && typeof bridge.probe === 'function' && typeof bridge.loadModel === 'function' && typeof bridge.unloadModel === 'function'
})
function formatOllamaAvailability(available: boolean): string {
  return available ? t('settings.ollama.available') : t('settings.ollama.unavailable')
}
const runtimeStatus = computed(() => props.currentRuntimeStatus ?? {
  selectionLabel: 'No runtime provider selected',
  capabilitySummary: 'text chat blocked',
  warnings: ['Select a runtime provider and model before sending.'],
})
const runtimeSelectionStateLabel = computed(() => props.currentRuntimeSelection?.state === 'selected' ? 'selected' : 'unset')
const runtimeCapabilitySourceLabel = computed(() => props.currentRuntimeCapability?.source ?? 'unset')
const localEndpointChat = computed(() => props.localEndpointChat ?? {
  enabled: false,
  endpointUrl: 'http://localhost:1234/v1',
  model: '',
  experimentalLabel: 'Experimental · LocalEndpoint text-only · not OpenRouter',
})
const localEndpointChatStatusLabel = computed(() => localEndpointChat.value.enabled ? 'active' : 'inactive')
const openAIResponsesChat = computed(() => props.openAIResponsesChat ?? {
  enabled: false,
  model: '',
  experimentalLabel: 'Experimental · OpenAI Responses text-only · not OpenRouter',
})
const openAIResponsesChatStatusLabel = computed(() => openAIResponsesChat.value.enabled ? 'active' : 'inactive')
const openAIResponsesModelAvailability = computed(() => props.openAIResponsesModelAvailability ?? {
  loading: false,
  result: null,
})
const openAIResponsesAvailabilityModels = computed(() => {
  const result = openAIResponsesModelAvailability.value.result
  return result?.ok ? result.models : []
})
const openAIResponsesAvailabilityWarnings = computed(() => {
  const result = openAIResponsesModelAvailability.value.result
  return result?.ok ? result.warnings : []
})
const openAIResponsesAvailabilitySourceDocuments = computed(() => {
  const result = openAIResponsesModelAvailability.value.result
  return result?.ok ? result.sourceDocuments : []
})
const openAIResponsesAvailabilityFailure = computed(() => {
  const result = openAIResponsesModelAvailability.value.result
  return result && !result.ok ? result : null
})
const openAIResponsesAvailabilitySummary = computed(() => {
  if (openAIResponsesModelAvailability.value.loading) return 'Refreshing OpenAI official models...'
  const result = openAIResponsesModelAvailability.value.result
  if (!result) return 'OpenAI official models have not been refreshed in this session.'
  if (!result.ok) return `${result.message} (${result.code})`
  return `${result.models.length} OpenAI model availability records. Observed ${formatObservedAt(result.observedAtMs)}.`
})
const googleAIStudioChat = computed(() => props.googleAIStudioChat ?? {
  enabled: false,
  model: '',
  experimentalLabel: 'Experimental · Google AI Studio Gemini text-only · not OpenRouter',
})
const googleAIStudioChatStatusLabel = computed(() => googleAIStudioChat.value.enabled ? 'active' : 'inactive')
const googleAIStudioModelAvailability = computed(() => props.googleAIStudioModelAvailability ?? {
  loading: false,
  result: null,
})
const googleAIStudioAvailabilityModels = computed(() => {
  const result = googleAIStudioModelAvailability.value.result
  return result?.ok ? result.models : []
})
const googleAIStudioAvailabilityWarnings = computed(() => {
  const result = googleAIStudioModelAvailability.value.result
  return result?.ok ? result.warnings : []
})
const googleAIStudioAvailabilitySourceDocuments = computed(() => {
  const result = googleAIStudioModelAvailability.value.result
  return result?.ok ? result.sourceDocuments : []
})
const googleAIStudioAvailabilityFailure = computed(() => {
  const result = googleAIStudioModelAvailability.value.result
  return result && !result.ok ? result : null
})
const googleAIStudioAvailabilitySummary = computed(() => {
  if (googleAIStudioModelAvailability.value.loading) return 'Refreshing Gemini official models...'
  const result = googleAIStudioModelAvailability.value.result
  if (!result) return 'Gemini official models have not been refreshed in this session.'
  if (!result.ok) return `${result.message} (${result.code})`
  return `${result.models.length} Gemini model availability records. Observed ${formatObservedAt(result.observedAtMs)}.`
})
const anthropicChat = computed(() => props.anthropicChat ?? {
  enabled: false,
  model: '',
  experimentalLabel: 'Experimental · Anthropic Messages text-only · not OpenRouter',
})
const anthropicChatStatusLabel = computed(() => anthropicChat.value.enabled ? 'active' : 'inactive')
const anthropicModelAvailability = computed(() => props.anthropicModelAvailability ?? {
  loading: false,
  result: null,
})
const anthropicAvailabilityModels = computed(() => {
  const result = anthropicModelAvailability.value.result
  return result?.ok ? result.models : []
})
const anthropicAvailabilityWarnings = computed(() => {
  const result = anthropicModelAvailability.value.result
  return result?.ok ? result.warnings : []
})
const anthropicAvailabilitySourceDocuments = computed(() => {
  const result = anthropicModelAvailability.value.result
  return result?.ok ? result.sourceDocuments : []
})
const anthropicAvailabilityFailure = computed(() => {
  const result = anthropicModelAvailability.value.result
  return result && !result.ok ? result : null
})
const anthropicAvailabilitySummary = computed(() => {
  if (anthropicModelAvailability.value.loading) return 'Refreshing Anthropic official models...'
  const result = anthropicModelAvailability.value.result
  if (!result) return 'Anthropic official models have not been refreshed in this session.'
  if (!result.ok) return `${result.message} (${result.code})`
  return `${result.models.length} Anthropic model availability records. Observed ${formatObservedAt(result.observedAtMs)}.`
})
const deepSeekChat = computed(() => props.deepSeekChat ?? {
  enabled: false,
  model: '',
  experimentalLabel: 'Experimental · DeepSeek official text-only · not OpenRouter',
})
const deepSeekChatStatusLabel = computed(() => deepSeekChat.value.enabled ? 'active' : 'inactive')
const deepSeekModelAvailability = computed(() => props.deepSeekModelAvailability ?? {
  loading: false,
  result: null,
})
const deepSeekAvailabilityModels = computed(() => {
  const result = deepSeekModelAvailability.value.result
  return result?.ok ? result.models : []
})
const deepSeekAvailabilityWarnings = computed(() => {
  const result = deepSeekModelAvailability.value.result
  return result?.ok ? result.warnings : []
})
const deepSeekAvailabilitySourceDocuments = computed(() => {
  const result = deepSeekModelAvailability.value.result
  return result?.ok ? result.sourceDocuments : []
})
const deepSeekAvailabilityFailure = computed(() => {
  const result = deepSeekModelAvailability.value.result
  return result && !result.ok ? result : null
})
const deepSeekAvailabilitySummary = computed(() => {
  if (deepSeekModelAvailability.value.loading) return 'Refreshing DeepSeek official models...'
  const result = deepSeekModelAvailability.value.result
  if (!result) return 'DeepSeek official models have not been refreshed in this session.'
  if (!result.ok) return `${result.message} (${result.code})`
  return `${result.models.length} DeepSeek model availability records. Observed ${formatObservedAt(result.observedAtMs)}.`
})
const imageValue = computed<ImageGenerationUserConfig>(() => ({
  enabled: props.sessionConfig.imageGeneration.enabled,
  outputMode: props.sessionConfig.imageGeneration.detail?.outputMode ?? 'auto',
  aspectRatio: props.sessionConfig.imageGeneration.aspectRatio,
  imageSize: props.sessionConfig.imageGeneration.resolution,
  advancedJson: props.sessionConfig.imageGeneration.detail?.advancedJson ?? '',
}))

function formatObservedAt(observedAtMs: number): string {
  if (!Number.isFinite(observedAtMs)) return 'unknown'
  try {
    return new Date(observedAtMs).toISOString()
  } catch {
    return 'unknown'
  }
}

function formatLMStudioModels(models: any[]): string {
  if (models.length === 0) return t('settings.lmStudio.none')
  return models
    .slice(0, 12)
    .map((model) => {
      const loaded = model.loaded
        ? `${t('settings.lmStudio.loaded')}:${(model.loadedInstances ?? []).join(',') || model.key}`
        : t('settings.lmStudio.unloaded')
      const label = model.displayName && model.displayName !== model.key
        ? `${model.displayName} (${model.key})`
        : model.key
      const meta = [model.type, model.quantization, model.paramsString, model.maxContextLength ? tf('settings.lmStudio.contextShort', { value: model.maxContextLength }) : null]
        .filter(Boolean)
        .join(' · ')
      return `${label} (${loaded}${meta ? ` · ${meta}` : ''})`
    })
    .join(' | ')
}

async function probeLMStudio(options: Readonly<{ clearAction?: boolean }> = {}) {
  const bridge = (globalThis as any).lmStudioProvider
  if (!lmStudioBridgeAvailable.value) {
    lmStudioActionResult.value = t('settings.lmStudio.bridgeUnavailable')
    return
  }
  lmStudioProbeLoading.value = true
  if (options.clearAction !== false) lmStudioActionResult.value = ''
  try {
    const result = await bridge.probe({
      endpointUrl: lmStudioChat.value.endpointUrl,
      selectedModel: lmStudioChat.value.model,
      timeoutMs: 5000,
    })
    lmStudioProbeResult.value = result
  } catch {
    lmStudioProbeResult.value = null
    lmStudioActionResult.value = t('settings.lmStudio.probeFailedSafely')
  } finally {
    lmStudioProbeLoading.value = false
  }
}

async function loadLMStudioSelectedModel() {
  const bridge = (globalThis as any).lmStudioProvider
  const model = lmStudioChat.value.model.trim()
  if (!lmStudioBridgeAvailable.value || !model) return
  lmStudioActionLoading.value = true
  lmStudioActionResult.value = ''
  try {
    const result = await bridge.loadModel({
      endpointUrl: lmStudioChat.value.endpointUrl,
      model,
      manualLoadUnloadEnabled: lmStudioChat.value.nativeRestControls.manualLoadUnloadEnabled,
      timeoutMs: 120000,
    })
    lmStudioActionResult.value = result?.ok
      ? tf('settings.lmStudio.loadRequested', { instanceId: result.instanceId })
      : tf('settings.lmStudio.loadFailed', { message: result?.message ?? t('settings.lmStudio.safeFailure') })
    await probeLMStudio({ clearAction: false })
  } catch {
    lmStudioActionResult.value = t('settings.lmStudio.loadFailedSafely')
  } finally {
    lmStudioActionLoading.value = false
  }
}

async function unloadLMStudioSelectedModel() {
  const bridge = (globalThis as any).lmStudioProvider
  const instanceId = lmStudioSelectedInstanceId.value.trim()
  if (!lmStudioBridgeAvailable.value || !instanceId) return
  lmStudioActionLoading.value = true
  lmStudioActionResult.value = ''
  try {
    const result = await bridge.unloadModel({
      endpointUrl: lmStudioChat.value.endpointUrl,
      instanceId,
      manualLoadUnloadEnabled: lmStudioChat.value.nativeRestControls.manualLoadUnloadEnabled,
      timeoutMs: 120000,
    })
    lmStudioActionResult.value = result?.ok
      ? tf('settings.lmStudio.unloadRequested', { instanceId: result.instanceId })
      : tf('settings.lmStudio.unloadFailed', { message: result?.message ?? t('settings.lmStudio.safeFailure') })
    await probeLMStudio({ clearAction: false })
  } catch {
    lmStudioActionResult.value = t('settings.lmStudio.unloadFailedSafely')
  } finally {
    lmStudioActionLoading.value = false
  }
}

function formatOllamaModels(models: any[]): string {
  if (models.length === 0) return t('settings.ollama.none')
  return models
    .slice(0, 12)
    .map((model) => {
      const label = model.displayName && model.displayName !== model.key
        ? `${model.displayName} (${model.key})`
        : model.key
      const status = model.running ? t('settings.ollama.running') : t('settings.ollama.installed')
      const details = model.details && typeof model.details === 'object'
        ? [model.details.family, model.details.parameterSize, model.details.quantizationLevel].filter(Boolean).join(' · ')
        : ''
      return `${label} (${status}${details ? ` · ${details}` : ''})`
    })
    .join(' | ')
}

async function probeOllama(options: Readonly<{ clearAction?: boolean }> = {}) {
  const bridge = (globalThis as any).ollamaProvider
  if (!ollamaBridgeAvailable.value) {
    ollamaActionResult.value = t('settings.ollama.bridgeUnavailable')
    return
  }
  ollamaProbeLoading.value = true
  if (options.clearAction !== false) ollamaActionResult.value = ''
  try {
    const result = await bridge.probe({
      endpointUrl: ollamaChat.value.endpointUrl,
      selectedModel: ollamaChat.value.model,
      timeoutMs: 5000,
    })
    ollamaProbeResult.value = result
  } catch {
    ollamaProbeResult.value = null
    ollamaActionResult.value = t('settings.ollama.probeFailedSafely')
  } finally {
    ollamaProbeLoading.value = false
  }
}

async function loadOllamaSelectedModel() {
  const bridge = (globalThis as any).ollamaProvider
  const model = ollamaChat.value.model.trim()
  if (!ollamaBridgeAvailable.value || !model) return
  ollamaActionLoading.value = true
  ollamaActionResult.value = ''
  try {
    const result = await bridge.loadModel({
      endpointUrl: ollamaChat.value.endpointUrl,
      model,
      manualLoadUnloadEnabled: ollamaChat.value.nativeControls.manualLoadUnloadEnabled,
      timeoutMs: 120000,
    })
    ollamaActionResult.value = result?.ok
      ? tf('settings.ollama.loadRequested', { model: result.model })
      : tf('settings.ollama.loadFailed', { message: result?.message ?? t('settings.ollama.safeFailure') })
    await probeOllama({ clearAction: false })
  } catch {
    ollamaActionResult.value = t('settings.ollama.loadFailedSafely')
  } finally {
    ollamaActionLoading.value = false
  }
}

async function unloadOllamaSelectedModel() {
  const bridge = (globalThis as any).ollamaProvider
  const model = ollamaChat.value.model.trim()
  if (!ollamaBridgeAvailable.value || !model) return
  ollamaActionLoading.value = true
  ollamaActionResult.value = ''
  try {
    const result = await bridge.unloadModel({
      endpointUrl: ollamaChat.value.endpointUrl,
      model,
      manualLoadUnloadEnabled: ollamaChat.value.nativeControls.manualLoadUnloadEnabled,
      timeoutMs: 120000,
    })
    ollamaActionResult.value = result?.ok
      ? tf('settings.ollama.unloadRequested', { model: result.model })
      : tf('settings.ollama.unloadFailed', { message: result?.message ?? t('settings.ollama.safeFailure') })
    await probeOllama({ clearAction: false })
  } catch {
    ollamaActionResult.value = t('settings.ollama.unloadFailedSafely')
  } finally {
    ollamaActionLoading.value = false
  }
}

function formatDeepSeekCapabilitySeed(model: ProviderModelAvailability): string {
  const seed = model.capabilitySeed
  if (!seed) return 'capability seed unknown'
  const chunks = [
    seed.textChat === true ? 'text chat' : null,
    seed.thinkingMode ? `thinking: ${seed.thinkingMode}` : null,
    typeof seed.contextLength === 'number' ? `context ${seed.contextLength}` : null,
    typeof seed.maxOutputTokens === 'number' ? `max output ${seed.maxOutputTokens}` : null,
  ].filter(Boolean)
  return chunks.length > 0 ? chunks.join(' · ') : 'capability seed unknown'
}

function formatDeepSeekPricingSeed(model: ProviderModelAvailability): string {
  const pricing = model.pricingSeed
  if (!pricing) return 'pricing seed unknown'
  const currency = pricing.currency ?? 'USD'
  return `${currency}/1M input hit ${pricing.inputCacheHitPer1MTokens ?? '?'} · miss ${pricing.inputCacheMissPer1MTokens ?? '?'} · output ${pricing.outputPer1MTokens ?? '?'}`
}

function formatOpenAICapabilitySeed(model: OpenAIProviderModelAvailability): string {
  const seed = model.capabilitySeed
  if (!seed) return 'capability seed unknown'
  const chunks = [
    seed.textChat === true ? 'text chat' : seed.textChat === false ? 'text chat blocked' : null,
    seed.responsesApi === true ? 'Responses API' : seed.responsesApi === false ? 'Responses API blocked' : null,
    seed.reasoning ? `reasoning ${seed.reasoning}` : null,
    Array.isArray(seed.reasoningEffort) && seed.reasoningEffort.length > 0
      ? `effort ${seed.reasoningEffort.join(', ')}`
      : null,
    seed.functionCalling ? `function calling ${seed.functionCalling}` : null,
    seed.hostedTools ? `hosted tools ${seed.hostedTools}` : null,
    seed.structuredOutput ? `structured output ${seed.structuredOutput}` : null,
    seed.imageInput ? `image input ${seed.imageInput}` : null,
    seed.fileInput ? `file input ${seed.fileInput}` : null,
    seed.audioInput ? `audio input ${seed.audioInput}` : null,
  ].filter(Boolean)
  return chunks.length > 0 ? chunks.join(' · ') : 'capability seed unknown'
}

function formatGeminiCapabilitySeed(model: GeminiProviderModelAvailability): string {
  const seed = model.capabilitySeed
  if (!seed) return 'capability seed unknown'
  const chunks = [
    seed.textChat === true ? 'text chat' : seed.textChat === false ? 'text chat blocked' : null,
    Array.isArray(seed.supportedGenerationMethods) && seed.supportedGenerationMethods.length > 0
      ? `methods ${seed.supportedGenerationMethods.join(', ')}`
      : null,
    typeof seed.inputTokenLimit === 'number' ? `input ${seed.inputTokenLimit}` : null,
    typeof seed.outputTokenLimit === 'number' ? `output ${seed.outputTokenLimit}` : null,
    seed.thinking ? `thinking ${seed.thinking}` : null,
    seed.functionCalling ? `function calling ${seed.functionCalling}` : null,
    seed.vision ? `vision ${seed.vision}` : null,
    seed.structuredOutput ? `structured output ${seed.structuredOutput}` : null,
  ].filter(Boolean)
  return chunks.length > 0 ? chunks.join(' · ') : 'capability seed unknown'
}

function formatAnthropicCapabilitySeed(model: AnthropicProviderModelAvailability): string {
  const seed = model.capabilitySeed
  if (!seed) return 'capability seed unknown'
  const chunks = [
    seed.textChat === true ? 'text chat' : seed.textChat === false ? 'text chat blocked' : null,
    seed.imageInput !== undefined ? `image input ${seed.imageInput}` : null,
    seed.thinking ? `thinking ${seed.thinking}` : null,
    seed.adaptiveThinking !== undefined ? `adaptive thinking ${seed.adaptiveThinking}` : null,
    typeof seed.maxInputTokens === 'number' ? `max input ${seed.maxInputTokens}` : null,
    typeof seed.maxOutputTokens === 'number' ? `max output ${seed.maxOutputTokens}` : null,
    seed.toolUse !== undefined ? `tool use ${seed.toolUse}` : null,
    seed.files !== undefined ? `files ${seed.files}` : null,
    seed.structuredOutput !== undefined ? `structured output ${seed.structuredOutput}` : null,
    seed.citations !== undefined ? `citations ${seed.citations}` : null,
    Array.isArray(seed.capabilitiesRawKeys) && seed.capabilitiesRawKeys.length > 0
      ? `raw capability keys ${seed.capabilitiesRawKeys.join(', ')}`
      : null,
  ].filter(Boolean)
  return chunks.length > 0 ? chunks.join(' · ') : 'capability seed unknown'
}

function chipClass(active: boolean): string {
  return active
    ? 'border-gray-900 bg-gray-900 text-white'
    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
}
</script>

<template>
  <div class="h-full overflow-auto p-3">
    <div class="space-y-4">
      <section class="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Display</div>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.reasoningDisplayMode === 'inline')"
            @click="emit('updateReasoningDisplayMode', 'inline')"
          >
            Inline reasoning
          </button>
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.reasoningDisplayMode === 'rail')"
            @click="emit('updateReasoningDisplayMode', 'rail')"
          >
            Right rail reasoning
          </button>
        </div>
      </section>

      <section class="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3" data-testid="runtime-selection-status">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Runtime</div>
            <div class="mt-1 text-[11px] text-gray-700" data-testid="runtime-selection-label">
              {{ runtimeStatus.selectionLabel }}
            </div>
          </div>
          <span class="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700" data-testid="runtime-selection-state">
            {{ runtimeSelectionStateLabel }}
          </span>
        </div>
        <div class="rounded border border-gray-100 bg-white px-2 py-1.5 text-[11px] text-gray-700" data-testid="runtime-capability-summary">
          {{ runtimeStatus.capabilitySummary }}
          <span> · source {{ runtimeCapabilitySourceLabel }}</span>
        </div>
        <ul v-if="runtimeStatus.warnings.length" class="space-y-1 text-[11px] text-gray-600" data-testid="runtime-capability-warnings">
          <li v-for="warning in runtimeStatus.warnings" :key="warning">{{ warning }}</li>
        </ul>
      </section>

      <section class="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Model</div>
        <select
          class="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
          :disabled="disabled"
          :value="modelValue"
          @change="emit('updateModel', ($event.target as HTMLSelectElement).value)"
        >
          <option value="openrouter/auto">openrouter/auto</option>
          <option v-for="item in props.modelCatalog" :key="item.modelId" :value="item.modelId">
            {{ item.name }}
          </option>
        </select>
      </section>

      <section class="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3" data-testid="openrouter-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-700">OpenRouter Chat</div>
            <div class="mt-1 text-[11px] text-gray-600">{{ openRouterChat.providerLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              :checked="openRouterChat.enabled"
              :disabled="disabled"
              data-testid="openrouter-chat-enabled"
              @change="emit('updateOpenRouterChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="text-[11px] text-gray-700" data-testid="openrouter-chat-warning">
          Explicit first-class provider selection. Existing OpenRouter Send Plan, attachments, web search, reasoning, image generation, and legacy-store credential source stay on the OpenRouter path.
        </div>
        <div class="rounded border border-gray-100 bg-white px-2 py-1.5 text-[11px] text-gray-800" data-testid="openrouter-chat-selected-status">
          <div>OpenRouter chat is {{ openRouterChatStatusLabel }}.</div>
          <div>Selected OpenRouter model: {{ openRouterChat.model || 'none' }}</div>
          <div>OpenRouter is not an implicit fallback; select it here before sending with OpenRouter.</div>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3" data-testid="openai-responses-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-blue-800">OpenAI Responses Chat</div>
            <div class="mt-1 text-[11px] text-blue-700">{{ openAIResponsesChat.experimentalLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-blue-900">
            <input
              type="checkbox"
              :checked="openAIResponsesChat.enabled"
              :disabled="disabled"
              data-testid="openai-responses-chat-enabled"
              @change="emit('updateOpenAIResponsesChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-blue-900">Manual Responses model id</label>
          <input
            class="w-full rounded border border-blue-200 bg-white px-2 py-1.5 text-sm disabled:bg-blue-50"
            :value="openAIResponsesChat.model"
            :disabled="disabled || !openAIResponsesChat.enabled"
            placeholder="gpt-4.1-mini"
            data-testid="openai-responses-chat-model"
            @input="emit('updateOpenAIResponsesChatModel', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="text-[11px] text-blue-800" data-testid="openai-responses-chat-warning">
          Native OpenAI Responses API text-only streaming. Attachments, web, tools, image generation, reasoning, and Generic compatibility routing are disabled.
        </div>
        <div class="rounded border border-blue-100 bg-white px-2 py-1.5 text-[11px] text-blue-900" data-testid="openai-responses-chat-selected-status">
          <div>Experimental OpenAI Responses chat is {{ openAIResponsesChatStatusLabel }}.</div>
          <div>Selected Responses model: {{ openAIResponsesChat.model || 'none' }}</div>
          <div>OpenAI Responses chat uses a main-process credential bridge and does not expose API keys to this console.</div>
        </div>
        <div class="space-y-2 rounded border border-blue-100 bg-white px-2 py-2 text-[11px] text-blue-900" data-testid="openai-responses-models-diagnostics">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-semibold">OpenAI official model source</div>
              <div data-testid="openai-responses-models-summary">{{ openAIResponsesAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
              :disabled="disabled || openAIResponsesModelAvailability.loading"
              data-testid="openai-responses-models-refresh"
              @click="emit('refreshOpenAIResponsesModels')"
            >
              {{ openAIResponsesModelAvailability.loading ? 'Refreshing...' : 'Refresh models' }}
            </button>
          </div>
          <div v-if="openAIResponsesAvailabilityFailure" class="text-red-700" data-testid="openai-responses-models-error">
            {{ openAIResponsesAvailabilityFailure.message }}
          </div>
          <div v-if="openAIResponsesAvailabilitySourceDocuments.length > 0" class="text-blue-700" data-testid="openai-responses-models-source">
            Source docs:
            <span v-for="sourceDoc in openAIResponsesAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ sourceDoc.source }} observed {{ formatObservedAt(sourceDoc.observedAtMs) }}
            </span>
          </div>
          <div v-for="warning in openAIResponsesAvailabilityWarnings" :key="warning" class="text-amber-700" data-testid="openai-responses-model-warning">
            {{ warning }}
          </div>
          <div v-if="openAIResponsesAvailabilityModels.length > 0" class="space-y-1" data-testid="openai-responses-models-list">
            <div
              v-for="modelAvailability in openAIResponsesAvailabilityModels"
              :key="modelAvailability.nativeModelId"
              class="rounded border border-blue-50 bg-blue-50/60 px-2 py-1"
              data-testid="openai-responses-model-row"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div class="font-semibold">{{ modelAvailability.displayName || modelAvailability.nativeModelId }}</div>
                  <div>{{ modelAvailability.nativeModelId }} · {{ modelAvailability.source }} · {{ modelAvailability.confidence }}</div>
                  <div v-if="modelAvailability.ownedBy">owned by {{ modelAvailability.ownedBy }}</div>
                  <div v-if="modelAvailability.createdAtSec">created {{ modelAvailability.createdAtSec }}</div>
                  <div>{{ formatOpenAICapabilitySeed(modelAvailability) }}</div>
                </div>
                <button
                  type="button"
                  class="rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                  :disabled="disabled"
                  data-testid="openai-responses-model-use"
                  @click="emit('updateOpenAIResponsesChatModel', modelAvailability.nativeModelId)"
                >
                  Use model id
                </button>
              </div>
              <div
                v-for="warning in modelAvailability.warnings"
                :key="`${modelAvailability.nativeModelId}:${warning}`"
                class="mt-1 text-amber-700"
                data-testid="openai-responses-model-warning"
              >
                {{ warning }}
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
            :disabled="disabled || !openAIResponsesChat.enabled"
            data-testid="openai-responses-chat-disable"
            @click="emit('updateOpenAIResponsesChatEnabled', false)"
          >
            Disable OpenAI Responses chat
          </button>
          <button
            type="button"
            class="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="openai-responses-chat-clear"
            @click="emit('clearOpenAIResponsesChat')"
          >
            Clear OpenAI Responses chat settings
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-rose-200 bg-rose-50/70 p-3" data-testid="anthropic-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-rose-800">Anthropic Messages Chat</div>
            <div class="mt-1 text-[11px] text-rose-700">{{ anthropicChat.experimentalLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-rose-900">
            <input
              type="checkbox"
              :checked="anthropicChat.enabled"
              :disabled="disabled"
              data-testid="anthropic-chat-enabled"
              @change="emit('updateAnthropicChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-rose-900">Manual Claude model id</label>
          <input
            class="w-full rounded border border-rose-200 bg-white px-2 py-1.5 text-sm disabled:bg-rose-50"
            :value="anthropicChat.model"
            :disabled="disabled || !anthropicChat.enabled"
            placeholder="claude-sonnet-4-5"
            data-testid="anthropic-chat-model"
            @input="emit('updateAnthropicChatModel', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="text-[11px] text-rose-800" data-testid="anthropic-chat-warning">
          Native Anthropic Messages API text-only streaming. Attachments, web, tools, image generation, reasoning/thinking, signatures, and Generic compatibility routing are disabled.
        </div>
        <div class="rounded border border-rose-100 bg-white px-2 py-1.5 text-[11px] text-rose-900" data-testid="anthropic-chat-selected-status">
          <div>Experimental Anthropic Messages chat is {{ anthropicChatStatusLabel }}.</div>
          <div>Selected Claude model: {{ anthropicChat.model || 'none' }}</div>
          <div>Anthropic chat uses a main-process credential bridge and does not expose API keys to this console.</div>
        </div>
        <div class="space-y-2 rounded border border-rose-100 bg-white px-2 py-2 text-[11px] text-rose-900" data-testid="anthropic-models-diagnostics">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-semibold">Anthropic official model source</div>
              <div data-testid="anthropic-models-summary">{{ anthropicAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
              :disabled="disabled || anthropicModelAvailability.loading"
              data-testid="anthropic-models-refresh"
              @click="emit('refreshAnthropicModels')"
            >
              {{ anthropicModelAvailability.loading ? 'Refreshing...' : 'Refresh models' }}
            </button>
          </div>
          <div v-if="anthropicAvailabilityFailure" class="text-red-700" data-testid="anthropic-models-error">
            {{ anthropicAvailabilityFailure.message }}
          </div>
          <div v-if="anthropicAvailabilitySourceDocuments.length > 0" class="text-rose-700" data-testid="anthropic-models-source">
            Source docs:
            <span v-for="sourceDoc in anthropicAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ sourceDoc.source }} observed {{ formatObservedAt(sourceDoc.observedAtMs) }}
            </span>
          </div>
          <div v-for="warning in anthropicAvailabilityWarnings" :key="warning" class="text-amber-700" data-testid="anthropic-model-warning">
            {{ warning }}
          </div>
          <div v-if="anthropicAvailabilityModels.length > 0" class="space-y-1" data-testid="anthropic-models-list">
            <div
              v-for="modelAvailability in anthropicAvailabilityModels"
              :key="modelAvailability.nativeModelId"
              class="rounded border border-rose-50 bg-rose-50/60 px-2 py-1"
              data-testid="anthropic-model-row"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div class="font-semibold">{{ modelAvailability.displayName || modelAvailability.nativeModelId }}</div>
                  <div>{{ modelAvailability.nativeModelId }} · {{ modelAvailability.source }} · {{ modelAvailability.confidence }}</div>
                  <div v-if="modelAvailability.modelType">type {{ modelAvailability.modelType }}</div>
                  <div v-if="modelAvailability.createdAt">created {{ modelAvailability.createdAt }}</div>
                  <div>{{ formatAnthropicCapabilitySeed(modelAvailability) }}</div>
                </div>
                <button
                  type="button"
                  class="rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                  :disabled="disabled"
                  data-testid="anthropic-model-use"
                  @click="emit('updateAnthropicChatModel', modelAvailability.nativeModelId)"
                >
                  Use model id
                </button>
              </div>
              <div
                v-for="warning in modelAvailability.warnings"
                :key="`${modelAvailability.nativeModelId}:${warning}`"
                class="mt-1 text-amber-700"
                data-testid="anthropic-model-warning"
              >
                {{ warning }}
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
            :disabled="disabled || !anthropicChat.enabled"
            data-testid="anthropic-chat-disable"
            @click="emit('updateAnthropicChatEnabled', false)"
          >
            Disable Anthropic Messages chat
          </button>
          <button
            type="button"
            class="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="anthropic-chat-clear"
            @click="emit('clearAnthropicChat')"
          >
            Clear Anthropic Messages chat settings
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-cyan-200 bg-cyan-50/70 p-3" data-testid="deepseek-chat-controls">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-cyan-800">DeepSeek Official Chat</div>
            <div class="mt-1 text-[11px] text-cyan-700">{{ deepSeekChat.experimentalLabel }}</div>
          </div>
          <label class="flex shrink-0 items-center gap-2 text-xs font-medium text-cyan-900">
            <input
              type="checkbox"
              class="size-4"
              :checked="deepSeekChat.enabled"
              :disabled="disabled"
              data-testid="deepseek-chat-enabled"
              @change="emit('updateDeepSeekChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            Use
          </label>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-cyan-900">Manual DeepSeek model id</label>
          <input
            type="text"
            :value="deepSeekChat.model"
            :disabled="disabled || !deepSeekChat.enabled"
            class="mt-1 w-full rounded-md border border-cyan-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:bg-white/60"
            data-testid="deepseek-chat-model"
            @input="emit('updateDeepSeekChatModel', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="text-[11px] text-cyan-800" data-testid="deepseek-chat-warning">
          DeepSeek official API text-only streaming. Attachments, web, tools, image generation, reasoning/thinking, reasoning_content display, and Generic compatibility routing are disabled.
        </div>
        <div class="rounded border border-cyan-100 bg-white px-2 py-1.5 text-[11px] text-cyan-900" data-testid="deepseek-chat-selected-status">
          <div>Experimental DeepSeek official chat is {{ deepSeekChatStatusLabel }}.</div>
          <div>Selected DeepSeek model: {{ deepSeekChat.model || 'none' }}</div>
          <div>DeepSeek chat uses a main-process credential bridge and does not expose API keys to this console.</div>
        </div>
        <div class="space-y-2 rounded border border-cyan-100 bg-white px-2 py-2 text-[11px] text-cyan-900" data-testid="deepseek-models-diagnostics">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-semibold">DeepSeek official model source</div>
              <div data-testid="deepseek-models-summary">{{ deepSeekAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="rounded-md border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-900 hover:bg-cyan-100 disabled:opacity-50"
              :disabled="disabled || deepSeekModelAvailability.loading"
              data-testid="deepseek-models-refresh"
              @click="emit('refreshDeepSeekModels')"
            >
              {{ deepSeekModelAvailability.loading ? 'Refreshing...' : 'Refresh models' }}
            </button>
          </div>
          <div v-if="deepSeekAvailabilityFailure" class="text-red-700" data-testid="deepseek-models-error">
            {{ deepSeekAvailabilityFailure.message }}
          </div>
          <div v-if="deepSeekAvailabilitySourceDocuments.length > 0" class="text-cyan-700" data-testid="deepseek-models-source">
            Source docs:
            <span v-for="sourceDoc in deepSeekAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ sourceDoc.source }} observed {{ formatObservedAt(sourceDoc.observedAtMs) }}
            </span>
          </div>
          <div v-for="warning in deepSeekAvailabilityWarnings" :key="warning" class="text-amber-700" data-testid="deepseek-model-warning">
            {{ warning }}
          </div>
          <div v-if="deepSeekAvailabilityModels.length > 0" class="space-y-1" data-testid="deepseek-models-list">
            <div
              v-for="modelAvailability in deepSeekAvailabilityModels"
              :key="modelAvailability.nativeModelId"
              class="rounded border border-cyan-50 bg-cyan-50/60 px-2 py-1"
              data-testid="deepseek-model-row"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div class="font-semibold">{{ modelAvailability.displayName || modelAvailability.nativeModelId }}</div>
                  <div>{{ modelAvailability.nativeModelId }} · {{ modelAvailability.source }} · {{ modelAvailability.confidence }}</div>
                  <div>{{ formatDeepSeekCapabilitySeed(modelAvailability) }}</div>
                  <div>{{ formatDeepSeekPricingSeed(modelAvailability) }}</div>
                </div>
                <button
                  type="button"
                  class="rounded-md border border-cyan-200 bg-white px-2 py-1 text-[11px] font-medium text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
                  :disabled="disabled"
                  data-testid="deepseek-model-use"
                  @click="emit('updateDeepSeekChatModel', modelAvailability.nativeModelId)"
                >
                  Use model id
                </button>
              </div>
              <div
                v-for="warning in modelAvailability.warnings"
                :key="`${modelAvailability.nativeModelId}:${warning}`"
                class="mt-1 text-amber-700"
                data-testid="deepseek-model-warning"
              >
                {{ warning }}
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-cyan-300 bg-white px-2 py-1.5 text-[11px] font-medium text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
            :disabled="disabled || !deepSeekChat.enabled"
            data-testid="deepseek-chat-disable"
            @click="emit('updateDeepSeekChatEnabled', false)"
          >
            Disable DeepSeek official chat
          </button>
          <button
            type="button"
            class="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-[11px] font-medium text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="deepseek-chat-clear"
            @click="emit('clearDeepSeekChat')"
          >
            Clear DeepSeek chat settings
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3" data-testid="google-ai-studio-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-emerald-800">Google AI Studio Chat</div>
            <div class="mt-1 text-[11px] text-emerald-700">{{ googleAIStudioChat.experimentalLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-emerald-900">
            <input
              type="checkbox"
              :checked="googleAIStudioChat.enabled"
              :disabled="disabled"
              data-testid="google-ai-studio-chat-enabled"
              @change="emit('updateGoogleAIStudioChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-emerald-900">Manual Gemini model id</label>
          <input
            class="w-full rounded border border-emerald-200 bg-white px-2 py-1.5 text-sm disabled:bg-emerald-50"
            :value="googleAIStudioChat.model"
            :disabled="disabled || !googleAIStudioChat.enabled"
            placeholder="gemini-2.5-flash"
            data-testid="google-ai-studio-chat-model"
            @input="emit('updateGoogleAIStudioChatModel', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="text-[11px] text-emerald-800" data-testid="google-ai-studio-chat-warning">
          Native Google AI Studio Gemini text-only streaming. Attachments, web, tools, image generation, reasoning, legacy Gemini runtime, and Generic compatibility routing are disabled.
        </div>
        <div class="rounded border border-emerald-100 bg-white px-2 py-1.5 text-[11px] text-emerald-900" data-testid="google-ai-studio-chat-selected-status">
          <div>Experimental Google AI Studio chat is {{ googleAIStudioChatStatusLabel }}.</div>
          <div>Selected Gemini model: {{ googleAIStudioChat.model || 'none' }}</div>
          <div>Google AI Studio chat uses a main-process credential bridge and does not expose API keys to this console.</div>
        </div>
        <div class="space-y-2 rounded border border-emerald-100 bg-white px-2 py-2 text-[11px] text-emerald-900" data-testid="google-ai-studio-models-diagnostics">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-semibold">Gemini official model source</div>
              <div data-testid="google-ai-studio-models-summary">{{ googleAIStudioAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
              :disabled="disabled || googleAIStudioModelAvailability.loading"
              data-testid="google-ai-studio-models-refresh"
              @click="emit('refreshGoogleAIStudioModels')"
            >
              {{ googleAIStudioModelAvailability.loading ? 'Refreshing...' : 'Refresh models' }}
            </button>
          </div>
          <div v-if="googleAIStudioAvailabilityFailure" class="text-red-700" data-testid="google-ai-studio-models-error">
            {{ googleAIStudioAvailabilityFailure.message }}
          </div>
          <div v-if="googleAIStudioAvailabilitySourceDocuments.length > 0" class="text-emerald-700" data-testid="google-ai-studio-models-source">
            Source docs:
            <span v-for="sourceDoc in googleAIStudioAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ sourceDoc.source }} observed {{ formatObservedAt(sourceDoc.observedAtMs) }}
            </span>
          </div>
          <div v-for="warning in googleAIStudioAvailabilityWarnings" :key="warning" class="text-amber-700" data-testid="google-ai-studio-model-warning">
            {{ warning }}
          </div>
          <div v-if="googleAIStudioAvailabilityModels.length > 0" class="space-y-1" data-testid="google-ai-studio-models-list">
            <div
              v-for="modelAvailability in googleAIStudioAvailabilityModels"
              :key="modelAvailability.nativeModelId"
              class="rounded border border-emerald-50 bg-emerald-50/60 px-2 py-1"
              data-testid="google-ai-studio-model-row"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div class="font-semibold">{{ modelAvailability.displayName || modelAvailability.nativeModelId }}</div>
                  <div>{{ modelAvailability.nativeModelId }} · {{ modelAvailability.source }} · {{ modelAvailability.confidence }}</div>
                  <div v-if="modelAvailability.providerModelName">{{ modelAvailability.providerModelName }}</div>
                  <div>{{ formatGeminiCapabilitySeed(modelAvailability) }}</div>
                </div>
                <button
                  type="button"
                  class="rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  :disabled="disabled"
                  data-testid="google-ai-studio-model-use"
                  @click="emit('updateGoogleAIStudioChatModel', modelAvailability.nativeModelId)"
                >
                  Use model id
                </button>
              </div>
              <div
                v-for="warning in modelAvailability.warnings"
                :key="`${modelAvailability.nativeModelId}:${warning}`"
                class="mt-1 text-amber-700"
                data-testid="google-ai-studio-model-warning"
              >
                {{ warning }}
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            :disabled="disabled || !googleAIStudioChat.enabled"
            data-testid="google-ai-studio-chat-disable"
            @click="emit('updateGoogleAIStudioChatEnabled', false)"
          >
            Disable Google AI Studio chat
          </button>
          <button
            type="button"
            class="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="google-ai-studio-chat-clear"
            @click="emit('clearGoogleAIStudioChat')"
          >
            Clear Google AI Studio chat settings
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/70 p-3" data-testid="lm-studio-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-indigo-800">{{ t('settings.lmStudio.title') }}</div>
            <div class="mt-1 text-[11px] text-indigo-700">{{ lmStudioChat.experimentalLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-indigo-900">
            <input
              type="checkbox"
              :checked="lmStudioChat.enabled"
              :disabled="disabled"
              data-testid="lm-studio-chat-enabled"
              @change="emit('updateLMStudioChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.enabled') }}
          </label>
        </div>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label class="space-y-1">
            <span class="block text-[11px] font-semibold text-indigo-900">{{ t('settings.lmStudio.endpointUrl') }}</span>
            <input
              class="w-full rounded border border-indigo-200 bg-white px-2 py-1.5 text-sm disabled:bg-indigo-50"
              :value="lmStudioChat.endpointUrl"
              :disabled="disabled || !lmStudioChat.enabled"
              placeholder="http://127.0.0.1:1234"
              data-testid="lm-studio-endpoint-url"
              @input="emit('updateLMStudioEndpointUrl', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="space-y-1">
            <span class="block text-[11px] font-semibold text-indigo-900">{{ t('settings.lmStudio.selectedModel') }}</span>
            <input
              class="w-full rounded border border-indigo-200 bg-white px-2 py-1.5 text-sm disabled:bg-indigo-50"
              :value="lmStudioChat.model"
              :disabled="disabled || !lmStudioChat.enabled"
              placeholder="openai/gpt-oss-20b"
              data-testid="lm-studio-model"
              @input="emit('updateLMStudioModel', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
        <div class="space-y-2 rounded border border-indigo-100 bg-white px-2 py-2 text-[11px] text-indigo-900">
          <div class="font-semibold">{{ t('settings.lmStudio.chatMode') }}</div>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-md border px-2 py-1.5 text-[11px]"
              :class="chipClass(lmStudioChat.chatMode === 'openai_compatible')"
              :disabled="disabled || !lmStudioChat.enabled"
              data-testid="lm-studio-chat-mode-openai"
              @click="emit('updateLMStudioChatMode', 'openai_compatible')"
            >
              {{ t('settings.lmStudio.openAICompatible') }}
            </button>
            <button
              type="button"
              class="rounded-md border px-2 py-1.5 text-[11px]"
              :class="chipClass(lmStudioChat.chatMode === 'native_rest')"
              :disabled="disabled || !lmStudioChat.enabled"
              data-testid="lm-studio-chat-mode-native"
              @click="emit('updateLMStudioChatMode', 'native_rest')"
            >
              {{ t('settings.lmStudio.nativeRest') }}
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-md border px-2 py-1.5 text-[11px]"
              :class="chipClass(lmStudioChat.openAICompatiblePreferredEndpoint === 'chat_completions')"
              :disabled="disabled || !lmStudioChat.enabled || lmStudioChat.chatMode !== 'openai_compatible'"
              data-testid="lm-studio-openai-endpoint-chat-completions"
              @click="emit('updateLMStudioOpenAICompatiblePreferredEndpoint', 'chat_completions')"
            >
              /v1/chat/completions
            </button>
            <button
              type="button"
              class="rounded-md border px-2 py-1.5 text-[11px]"
              :class="chipClass(lmStudioChat.openAICompatiblePreferredEndpoint === 'responses')"
              :disabled="disabled || !lmStudioChat.enabled || lmStudioChat.chatMode !== 'openai_compatible'"
              data-testid="lm-studio-openai-endpoint-responses"
              @click="emit('updateLMStudioOpenAICompatiblePreferredEndpoint', 'responses')"
            >
              /v1/responses
            </button>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-2 rounded border border-indigo-100 bg-white px-2 py-2 text-[11px] text-indigo-900 md:grid-cols-2">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="lmStudioChat.nativeRestControls.diagnosticsEnabled"
              :disabled="disabled"
              data-testid="lm-studio-diagnostics-enabled"
              @change="emit('updateLMStudioNativeRestControl', 'diagnosticsEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.nativeRestDiagnostics') }}
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="lmStudioChat.nativeRestControls.manualLoadUnloadEnabled"
              :disabled="disabled"
              data-testid="lm-studio-manual-load-unload-enabled"
              @change="emit('updateLMStudioNativeRestControl', 'manualLoadUnloadEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.manualLoadUnload') }}
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="lmStudioChat.nativeRestControls.autoLoadBeforeSendEnabled"
              :disabled="disabled"
              data-testid="lm-studio-auto-load-enabled"
              @change="emit('updateLMStudioNativeRestControl', 'autoLoadBeforeSendEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.autoLoadBeforeSend') }}
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="lmStudioChat.nativeRestControls.autoUnloadAfterSendEnabled"
              :disabled="disabled"
              data-testid="lm-studio-auto-unload-after-send-enabled"
              @change="emit('updateLMStudioNativeRestControl', 'autoUnloadAfterSendEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.autoUnloadAfterSend') }}
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="lmStudioChat.nativeRestControls.autoUnloadAfterIdleEnabled === true"
              :disabled="disabled"
              data-testid="lm-studio-auto-unload-after-idle-enabled"
              @change="emit('updateLMStudioNativeRestControl', 'autoUnloadAfterIdleEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.autoUnloadAfterIdleDeferred') }}
          </label>
        </div>
        <div class="rounded border border-indigo-100 bg-white px-2 py-1.5 text-[11px] text-indigo-900" data-testid="lm-studio-selected-status">
          <div>{{ tf('settings.lmStudio.chatStatus', { status: lmStudioChatStatusLabel }) }}</div>
          <div>{{ t('settings.lmStudio.endpoint') }}: {{ lmStudioChat.endpointUrl || t('settings.lmStudio.none') }}</div>
          <div>{{ t('settings.lmStudio.selectedModel') }}: {{ lmStudioChat.model || t('settings.lmStudio.none') }}</div>
          <div>{{ t('settings.lmStudio.mode') }}: {{ lmStudioChat.chatMode }} · {{ t('settings.lmStudio.openAIEndpoint') }}: {{ lmStudioChat.openAICompatiblePreferredEndpoint }}</div>
          <div>{{ t('settings.lmStudio.boundarySummary') }}</div>
        </div>
        <div class="space-y-2 rounded border border-indigo-100 bg-white px-2 py-2 text-[11px] text-indigo-900" data-testid="lm-studio-diagnostics">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-semibold">{{ t('settings.lmStudio.controlPlane') }}</div>
              <div v-if="lmStudioProbeResult?.ok" data-testid="lm-studio-probe-summary">
                {{ t('settings.lmStudio.nativeProbeLabel') }}={{ formatLMStudioAvailability(lmStudioProbeResult.diagnostics.nativeRestAvailable) }};
                {{ t('settings.lmStudio.openAIProbeLabel') }}={{ formatLMStudioAvailability(lmStudioProbeResult.diagnostics.openAICompatibleAvailable) }}
              </div>
              <div v-else data-testid="lm-studio-probe-summary">{{ t('settings.lmStudio.notProbed') }}</div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
                :disabled="disabled || !lmStudioChat.enabled || !lmStudioChat.nativeRestControls.diagnosticsEnabled || lmStudioProbeLoading || !lmStudioBridgeAvailable"
                data-testid="lm-studio-probe"
                @click="probeLMStudio()"
              >
                {{ lmStudioProbeLoading ? t('settings.lmStudio.probing') : t('settings.lmStudio.probe') }}
              </button>
              <button
                type="button"
                class="rounded-md border border-indigo-300 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
                :disabled="disabled || !lmStudioChat.enabled || !lmStudioChat.nativeRestControls.manualLoadUnloadEnabled || lmStudioActionLoading || !lmStudioChat.model"
                data-testid="lm-studio-load-model"
                @click="loadLMStudioSelectedModel"
              >
                {{ t('settings.lmStudio.load') }}
              </button>
              <button
                type="button"
                class="rounded-md border border-indigo-300 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
                :disabled="disabled || !lmStudioChat.enabled || !lmStudioChat.nativeRestControls.manualLoadUnloadEnabled || lmStudioActionLoading || !lmStudioSelectedInstanceId"
                data-testid="lm-studio-unload-model"
                @click="unloadLMStudioSelectedModel"
              >
                {{ t('settings.lmStudio.unload') }}
              </button>
            </div>
          </div>
          <div v-if="lmStudioProbeResult?.ok" class="space-y-1" data-testid="lm-studio-probe-result">
            <div data-testid="lm-studio-native-status">{{ t('settings.lmStudio.nativeRest') }}: {{ lmStudioProbeResult.diagnostics.nativeRestAvailable ? t('settings.lmStudio.available') : lmStudioProbeResult.diagnostics.nativeRest.message }}</div>
            <div data-testid="lm-studio-openai-status">{{ t('settings.lmStudio.openAICompatible') }}: {{ lmStudioProbeResult.diagnostics.openAICompatibleAvailable ? t('settings.lmStudio.available') : lmStudioProbeResult.diagnostics.openAICompatible.message }}</div>
            <div data-testid="lm-studio-models">{{ t('settings.lmStudio.models') }}: {{ formatLMStudioModels(lmStudioNativeModels) }}</div>
          </div>
          <div v-else-if="lmStudioProbeResult && !lmStudioProbeResult.ok" class="text-red-700" data-testid="lm-studio-probe-error">
            {{ lmStudioProbeResult.message }}
          </div>
          <div v-if="lmStudioActionResult" data-testid="lm-studio-action-result">{{ lmStudioActionResult }}</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
            :disabled="disabled || !lmStudioChat.enabled"
            data-testid="lm-studio-chat-disable"
            @click="emit('updateLMStudioChatEnabled', false)"
          >
            {{ t('settings.lmStudio.disable') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="lm-studio-chat-clear"
            @click="emit('clearLMStudioChat')"
          >
            {{ t('settings.lmStudio.clearSettings') }}
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-green-200 bg-green-50/70 p-3" data-testid="ollama-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-green-800">{{ t('settings.ollama.title') }}</div>
            <div class="mt-1 text-[11px] text-green-700">{{ ollamaChat.experimentalLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-green-900">
            <input
              type="checkbox"
              :checked="ollamaChat.enabled"
              :disabled="disabled"
              data-testid="ollama-chat-enabled"
              @change="emit('updateOllamaChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.enabled') }}
          </label>
        </div>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label class="space-y-1">
            <span class="block text-[11px] font-semibold text-green-900">{{ t('settings.ollama.endpointUrl') }}</span>
            <input
              class="w-full rounded border border-green-200 bg-white px-2 py-1.5 text-sm disabled:bg-green-50"
              :value="ollamaChat.endpointUrl"
              :disabled="disabled || !ollamaChat.enabled"
              placeholder="http://127.0.0.1:11434"
              data-testid="ollama-endpoint-url"
              @input="emit('updateOllamaEndpointUrl', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="space-y-1">
            <span class="block text-[11px] font-semibold text-green-900">{{ t('settings.ollama.selectedModel') }}</span>
            <input
              class="w-full rounded border border-green-200 bg-white px-2 py-1.5 text-sm disabled:bg-green-50"
              :value="ollamaChat.model"
              :disabled="disabled || !ollamaChat.enabled"
              placeholder="llama3.2:latest"
              data-testid="ollama-model"
              @input="emit('updateOllamaModel', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
        <div class="space-y-2 rounded border border-green-100 bg-white px-2 py-2 text-[11px] text-green-900">
          <div class="font-semibold">{{ t('settings.ollama.chatMode') }}</div>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-md border px-2 py-1.5 text-[11px]"
              :class="chipClass(ollamaChat.chatMode === 'native_rest')"
              :disabled="disabled || !ollamaChat.enabled"
              data-testid="ollama-chat-mode-native"
              @click="emit('updateOllamaChatMode', 'native_rest')"
            >
              {{ t('settings.ollama.nativeRest') }}
            </button>
            <button
              type="button"
              class="rounded-md border px-2 py-1.5 text-[11px]"
              :class="chipClass(ollamaChat.chatMode === 'openai_compatible')"
              :disabled="disabled || !ollamaChat.enabled"
              data-testid="ollama-chat-mode-openai"
              @click="emit('updateOllamaChatMode', 'openai_compatible')"
            >
              {{ t('settings.ollama.openAICompatible') }}
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-md border px-2 py-1.5 text-[11px]"
              :class="chipClass(ollamaChat.nativeRestPreferredEndpoint === 'chat')"
              :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest'"
              data-testid="ollama-native-endpoint-chat"
              @click="emit('updateOllamaNativeRestPreferredEndpoint', 'chat')"
            >
              /api/chat
            </button>
            <button
              type="button"
              class="rounded-md border px-2 py-1.5 text-[11px]"
              :class="chipClass(ollamaChat.nativeRestPreferredEndpoint === 'generate')"
              :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest'"
              data-testid="ollama-native-endpoint-generate"
              @click="emit('updateOllamaNativeRestPreferredEndpoint', 'generate')"
            >
              /api/generate
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-md border px-2 py-1.5 text-[11px]"
              :class="chipClass(ollamaChat.openAICompatiblePreferredEndpoint === 'chat_completions')"
              :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'openai_compatible'"
              data-testid="ollama-openai-endpoint-chat-completions"
              @click="emit('updateOllamaOpenAICompatiblePreferredEndpoint', 'chat_completions')"
            >
              /v1/chat/completions
            </button>
            <button
              type="button"
              class="rounded-md border px-2 py-1.5 text-[11px]"
              :class="chipClass(ollamaChat.openAICompatiblePreferredEndpoint === 'responses')"
              :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'openai_compatible'"
              data-testid="ollama-openai-endpoint-responses"
              @click="emit('updateOllamaOpenAICompatiblePreferredEndpoint', 'responses')"
            >
              /v1/responses
            </button>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-2 rounded border border-green-100 bg-white px-2 py-2 text-[11px] text-green-900 md:grid-cols-2">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="ollamaChat.nativeControls.diagnosticsEnabled"
              :disabled="disabled"
              data-testid="ollama-diagnostics-enabled"
              @change="emit('updateOllamaNativeControl', 'diagnosticsEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.nativeRestDiagnostics') }}
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="ollamaChat.nativeControls.manualLoadUnloadEnabled"
              :disabled="disabled"
              data-testid="ollama-manual-load-unload-enabled"
              @change="emit('updateOllamaNativeControl', 'manualLoadUnloadEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.manualLoadUnload') }}
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="ollamaChat.nativeControls.autoLoadBeforeSendEnabled"
              :disabled="disabled"
              data-testid="ollama-auto-load-enabled"
              @change="emit('updateOllamaNativeControl', 'autoLoadBeforeSendEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.autoLoadBeforeSend') }}
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="ollamaChat.nativeControls.autoUnloadAfterSendEnabled"
              :disabled="disabled"
              data-testid="ollama-auto-unload-after-send-enabled"
              @change="emit('updateOllamaNativeControl', 'autoUnloadAfterSendEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.autoUnloadAfterSend') }}
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="ollamaChat.nativeControls.autoUnloadAfterIdleEnabled === true"
              :disabled="disabled"
              data-testid="ollama-auto-unload-after-idle-enabled"
              @change="emit('updateOllamaNativeControl', 'autoUnloadAfterIdleEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.autoUnloadAfterIdleDeferred') }}
          </label>
        </div>
        <div class="rounded border border-green-100 bg-white px-2 py-1.5 text-[11px] text-green-900" data-testid="ollama-selected-status">
          <div>{{ tf('settings.ollama.chatStatus', { status: ollamaChatStatusLabel }) }}</div>
          <div>{{ t('settings.ollama.endpoint') }}: {{ ollamaChat.endpointUrl || t('settings.ollama.none') }}</div>
          <div>{{ t('settings.ollama.selectedModel') }}: {{ ollamaChat.model || t('settings.ollama.none') }}</div>
          <div>{{ t('settings.ollama.mode') }}: {{ ollamaChat.chatMode }} · {{ t('settings.ollama.nativeEndpoint') }}: {{ ollamaChat.nativeRestPreferredEndpoint }} · {{ t('settings.ollama.openAIEndpoint') }}: {{ ollamaChat.openAICompatiblePreferredEndpoint }}</div>
          <div>{{ t('settings.ollama.boundarySummary') }}</div>
        </div>
        <div class="space-y-2 rounded border border-green-100 bg-white px-2 py-2 text-[11px] text-green-900" data-testid="ollama-diagnostics">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-semibold">{{ t('settings.ollama.controlPlane') }}</div>
              <div v-if="ollamaProbeResult?.ok" data-testid="ollama-probe-summary">
                {{ t('settings.ollama.nativeProbeLabel') }}={{ formatOllamaAvailability(ollamaProbeResult.diagnostics.nativeRestAvailable) }};
                {{ t('settings.ollama.openAIProbeLabel') }}={{ formatOllamaAvailability(ollamaProbeResult.diagnostics.openAICompatibleAvailable) }}
              </div>
              <div v-else data-testid="ollama-probe-summary">{{ t('settings.ollama.notProbed') }}</div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-md border border-green-300 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-900 hover:bg-green-100 disabled:opacity-50"
                :disabled="disabled || !ollamaChat.enabled || !ollamaChat.nativeControls.diagnosticsEnabled || ollamaProbeLoading || !ollamaBridgeAvailable"
                data-testid="ollama-probe"
                @click="probeOllama()"
              >
                {{ ollamaProbeLoading ? t('settings.ollama.probing') : t('settings.ollama.probe') }}
              </button>
              <button
                type="button"
                class="rounded-md border border-green-300 bg-white px-2 py-1 text-[11px] font-semibold text-green-900 hover:bg-green-50 disabled:opacity-50"
                :disabled="disabled || !ollamaChat.enabled || !ollamaChat.nativeControls.manualLoadUnloadEnabled || ollamaActionLoading || !ollamaChat.model"
                data-testid="ollama-load-model"
                @click="loadOllamaSelectedModel"
              >
                {{ t('settings.ollama.load') }}
              </button>
              <button
                type="button"
                class="rounded-md border border-green-300 bg-white px-2 py-1 text-[11px] font-semibold text-green-900 hover:bg-green-50 disabled:opacity-50"
                :disabled="disabled || !ollamaChat.enabled || !ollamaChat.nativeControls.manualLoadUnloadEnabled || ollamaActionLoading || !ollamaChat.model"
                data-testid="ollama-unload-model"
                @click="unloadOllamaSelectedModel"
              >
                {{ t('settings.ollama.unload') }}
              </button>
            </div>
          </div>
          <div v-if="ollamaProbeResult?.ok" class="space-y-1" data-testid="ollama-probe-result">
            <div data-testid="ollama-native-status">{{ t('settings.ollama.nativeRest') }}: {{ ollamaProbeResult.diagnostics.nativeRestAvailable ? t('settings.ollama.available') : ollamaProbeResult.diagnostics.localModels.message }}</div>
            <div data-testid="ollama-openai-status">{{ t('settings.ollama.openAICompatible') }}: {{ ollamaProbeResult.diagnostics.openAICompatibleAvailable ? t('settings.ollama.available') : ollamaProbeResult.diagnostics.openAICompatible.message }}</div>
            <div data-testid="ollama-version">{{ t('settings.ollama.version') }}: {{ ollamaProbeResult.diagnostics.version.ok ? ollamaProbeResult.diagnostics.version.version : ollamaProbeResult.diagnostics.version.message }}</div>
            <div data-testid="ollama-local-models">{{ t('settings.ollama.localModels') }}: {{ formatOllamaModels(ollamaLocalModels) }}</div>
            <div data-testid="ollama-running-models">{{ t('settings.ollama.runningModels') }}: {{ formatOllamaModels(ollamaRunningModels) }}</div>
          </div>
          <div v-else-if="ollamaProbeResult && !ollamaProbeResult.ok" class="text-red-700" data-testid="ollama-probe-error">
            {{ ollamaProbeResult.message }}
          </div>
          <div v-if="ollamaActionResult" data-testid="ollama-action-result">{{ ollamaActionResult }}</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-semibold text-green-900 hover:bg-green-100 disabled:opacity-50"
            :disabled="disabled || !ollamaChat.enabled"
            data-testid="ollama-chat-disable"
            @click="emit('updateOllamaChatEnabled', false)"
          >
            {{ t('settings.ollama.disable') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-semibold text-green-900 hover:bg-green-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="ollama-chat-clear"
            @click="emit('clearOllamaChat')"
          >
            {{ t('settings.ollama.clearSettings') }}
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3" data-testid="local-endpoint-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-amber-800">LocalEndpoint Chat</div>
            <div class="mt-1 text-[11px] text-amber-700">{{ localEndpointChat.experimentalLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-amber-900">
            <input
              type="checkbox"
              :checked="localEndpointChat.enabled"
              :disabled="disabled"
              data-testid="local-endpoint-chat-enabled"
              @change="emit('updateLocalEndpointChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-amber-900">Loopback endpoint URL</label>
          <input
            class="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-sm disabled:bg-amber-50"
            :value="localEndpointChat.endpointUrl"
            :disabled="disabled || !localEndpointChat.enabled"
            placeholder="http://localhost:1234/v1"
            data-testid="local-endpoint-chat-url"
            @input="emit('updateLocalEndpointChatUrl', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-amber-900">Manual model id</label>
          <input
            class="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-sm disabled:bg-amber-50"
            :value="localEndpointChat.model"
            :disabled="disabled || !localEndpointChat.enabled"
            placeholder="local-model"
            data-testid="local-endpoint-chat-model"
            @input="emit('updateLocalEndpointChatModel', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="text-[11px] text-amber-800" data-testid="local-endpoint-chat-warning">
          Text-only loopback OpenAI-compatible streaming. Attachments, web, tools, image generation, reasoning, secrets, and model-picker publication are disabled.
        </div>
        <div class="rounded border border-amber-100 bg-white px-2 py-1.5 text-[11px] text-amber-900" data-testid="local-endpoint-chat-selected-status">
          <div>Experimental LocalEndpoint chat is {{ localEndpointChatStatusLabel }}.</div>
          <div>Selected endpoint: {{ localEndpointChat.endpointUrl || 'none' }}</div>
          <div>Selected local model: {{ localEndpointChat.model || 'none' }}</div>
          <div>Experimental local chat is separate from OpenRouter and does not use API keys or custom headers.</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            :disabled="disabled || !localEndpointChat.enabled"
            data-testid="local-endpoint-chat-disable"
            @click="emit('updateLocalEndpointChatEnabled', false)"
          >
            Disable LocalEndpoint chat
          </button>
          <button
            type="button"
            class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="local-endpoint-chat-clear"
            @click="emit('clearLocalEndpointChat')"
          >
            Clear LocalEndpoint chat settings
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Reasoning</div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="props.sessionConfig.reasoning.enabled"
              :disabled="disabled"
              @change="emit('updateReasoningEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="effort in ['low', 'medium', 'high']"
            :key="effort"
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.reasoning.effort === effort)"
            :disabled="disabled || !props.sessionConfig.reasoning.enabled"
            @click="emit('updateReasoningEffort', effort as 'low' | 'medium' | 'high')"
          >
            {{ effort }}
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Web Search</div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="props.sessionConfig.webSearch.enabled"
              :disabled="disabled"
              @change="emit('updateWebSearchEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.webSearch.level === 'low')"
            :disabled="disabled || !props.sessionConfig.webSearch.enabled"
            @click="emit('updateWebSearchLevel', 'low')"
          >
            low
          </button>
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.webSearch.level === 'high')"
            :disabled="disabled || !props.sessionConfig.webSearch.enabled"
            @click="emit('updateWebSearchLevel', 'high')"
          >
            high
          </button>
        </div>
        <WebSearchSettingsEditor
          :model-value="props.sessionConfig.webSearch.detail"
          :disabled="disabled"
          :resolved="props.webSearchResolved"
          @update:model-value="emit('updateWebSearchLayer', $event)"
        />
      </section>

      <section class="min-w-0 space-y-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Sampling</div>
        <SamplingParamsSettingsEditor
          :model-value="props.sessionConfig.samplingParams.detail"
          :disabled="disabled"
          :resolved="props.samplingParamsResolved"
          :collapsible="false"
          compact
          @update:model-value="emit('updateSamplingParamsLayer', $event)"
        />
      </section>

      <section class="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Image Generation</div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="props.sessionConfig.imageGeneration.enabled"
              :disabled="disabled"
              @change="emit('updateImageGenerationEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="resolution in ['1K', '2K', '4K']"
            :key="resolution"
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.imageGeneration.resolution === resolution)"
            :disabled="disabled || !props.sessionConfig.imageGeneration.enabled"
            @click="emit('updateImageGenerationResolution', resolution as '1K' | '2K' | '4K')"
          >
            {{ resolution }}
          </button>
        </div>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="ratio in ['16:9', '3:4', '1:1', '4:3']"
            :key="ratio"
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.imageGeneration.aspectRatio === ratio)"
            :disabled="disabled || !props.sessionConfig.imageGeneration.enabled"
            @click="emit('updateImageGenerationAspectRatio', ratio as '16:9' | '3:4' | '1:1' | '4:3')"
          >
            {{ ratio }}
          </button>
        </div>
        <ImageGenerationSettingsEditor
          :model-value="imageValue"
          :disabled="disabled || !props.sessionConfig.imageGeneration.enabled"
          @update:model-value="emit('updateImageGeneration', { ...$event, enabled: props.sessionConfig.imageGeneration.enabled })"
        />
      </section>

      <section class="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <button
          type="button"
          class="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          :disabled="props.disabled"
          @click="emit('openSettings')"
        >
          Open global settings
        </button>
      </section>
    </div>
  </div>
</template>

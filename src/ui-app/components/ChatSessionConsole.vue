<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import type { SearchSettingsLayer, ResolvedSearchSettings } from '@/next/openrouter/searchSettingsResolver'
import { getDefaultGenerationParamProfile, unsetGenerationProfile } from '@/next/generation-params/generationParamProfiles'
import type {
  GenerationParamsLayer,
  ResolvedGenerationParams,
} from '@/next/generation-params/generationParamTypes'
import type { ImageGenerationUserConfig } from '@/next/openrouter/imageGenerationSettingsPersistence'
import type {
  OpenAIModelAvailabilityResult,
  OpenAIProviderModelAvailability,
} from '@/next/provider/openai-responses/openAIResponsesModelSource'
import { OPENAI_RESPONSES_PROVIDER_KEY } from '@/next/provider/openai-responses/openAIResponsesModelSource'
import {
  formatOpenAIResponsesAutoReasoningLabel,
  type OpenAIResponsesReasoningEffortSetting,
  type OpenAIResponsesReasoningSummarySetting,
} from '@/next/provider/openai-responses/openaiResponsesReasoningPolicy'
import type {
  DeepSeekModelAvailabilityResult,
  ProviderModelAvailability,
} from '@/next/provider/deepseek/deepSeekModelSource'
import type {
  GeminiModelAvailabilityResult,
  GeminiProviderModelAvailability,
} from '@/next/provider/gemini/geminiModelSource'
import {
  type GeminiThinkingLevel,
} from '@/next/provider/gemini/geminiThinkingPolicy'
import {
  isProjectedGeminiImageModelV2,
  isProjectedGeminiThinkingBudgetValid,
  projectGeminiImageGenerationPolicyV2,
  projectGeminiThinkingCapabilityV2,
} from '../app/generationV2CapabilityUiProjection'
import type {
  AnthropicModelAvailabilityResult,
  AnthropicProviderModelAvailability,
} from '@/next/provider/anthropic/anthropicModelSource'
import type {
  ChatSessionConfig,
  ChatSessionConfigAspectRatio,
  ChatSessionConfigImageResolution,
  ChatSessionConfigReasoningEffort,
} from '../app/chatSessionConfig'
import type { GenerationControlsProjectionV2 } from '@/next/generation-v2/capability/resolvedCapabilityV2'
import WebSearchSettingsEditor from './WebSearchSettingsEditor.vue'
import GenerationParamsSettingsEditor from './GenerationParamsSettingsEditor.vue'
import ImageGenerationSettingsEditor from './ImageGenerationSettingsEditor.vue'
import type { OpenRouterImageEndpointSelectionClientStateV2 } from '@/next/generation-v2/renderer/openRouterImageEndpointClientV2'
import { t, tf } from '@/shared/i18n'
import {
  OPENROUTER_PROVIDER_ID,
  DEFAULT_OPENROUTER_MODEL_ID,
} from '@/next/provider/modelSelection'
import type { RuntimeProviderId } from '@/next/provider/runtimeProviderId'
import { createProviderModelRouteSelection, type ConversationRouteSelection } from '@/next/provider/conversationRouteSelection'
import { resolveNetworkFailureDisplayMessage } from '../app/networkErrorDisplay'

const props = defineProps<{
  disabled: boolean
  isRunning: boolean
  sessionConfig: ChatSessionConfig
  openRouterChat?: Readonly<{
    enabled: boolean
    providerLabel: string
  }> | null
  lmStudioChat?: Readonly<{
    enabled: boolean
    endpointUrl: string
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
    chatMode: 'native_rest' | 'openai_compatible'
    nativeRestPreferredEndpoint: 'chat' | 'generate'
    openAICompatiblePreferredEndpoint: 'chat_completions' | 'responses'
    thinkingControl: 'boolean' | 'effort' | null
    toolsSupported: boolean | null
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
    experimentalLabel: string
  }> | null
  openAIResponsesChat?: Readonly<{
    enabled: boolean
    experimentalLabel: string
  }> | null
  openAIResponsesModelAvailability?: Readonly<{
    loading: boolean
    result: OpenAIModelAvailabilityResult | null
  }> | null
  googleAIStudioChat?: Readonly<{
    enabled: boolean
    experimentalLabel: string
  }> | null
  googleAIStudioModelAvailability?: Readonly<{
    loading: boolean
    result: GeminiModelAvailabilityResult | null
  }> | null
  anthropicChat?: Readonly<{
    enabled: boolean
    thinkingDisplay: 'provider_default' | 'summarized' | 'omitted'
    experimentalLabel: string
  }> | null
  anthropicModelAvailability?: Readonly<{
    loading: boolean
    result: AnthropicModelAvailabilityResult | null
  }> | null
  deepSeekChat?: Readonly<{
    enabled: boolean
    experimentalLabel: string
  }> | null
  deepSeekModelAvailability?: Readonly<{
    loading: boolean
    result: DeepSeekModelAvailabilityResult | null
  }> | null
  reasoningDisplayMode: 'inline' | 'rail'
  reasoningPanelDefaultExpanded?: boolean
  reasoningPanelAutoCollapseAfterReasoning?: boolean
  modelCatalog: readonly ModelCatalogItem[]
  webSearchResolved: ResolvedSearchSettings | null
  generationParamsResolved: ResolvedGenerationParams | null
  capabilityProjection?: GenerationControlsProjectionV2 | null
  openRouterImageEndpointSelection?: OpenRouterImageEndpointSelectionClientStateV2 | null
  openRouterImageEndpointSelectionLoading?: boolean
  openRouterImageEndpointSelectionError?: string | null
}>()

const emit = defineEmits<{
  (e: 'updateRouteSelection', selection: ConversationRouteSelection): void
  (e: 'updateReasoningEnabled', enabled: boolean): void
  (e: 'updateReasoningEffort', effort: ChatSessionConfigReasoningEffort): void
  (e: 'updateWebSearchEnabled', enabled: boolean): void
  (e: 'updateWebSearchLevel', level: 'low' | 'high'): void
  (e: 'updateWebSearchLayer', layer: SearchSettingsLayer | null): void
  (e: 'updateGenerationParamsLayer', layer: GenerationParamsLayer | null): void
  (e: 'updateImageGenerationEnabled', enabled: boolean): void
  (e: 'updateImageGenerationResolution', value: ChatSessionConfigImageResolution): void
  (e: 'updateImageGenerationAspectRatio', value: ChatSessionConfigAspectRatio): void
  (e: 'updateImageGeneration', value: ImageGenerationUserConfig): void
  (e: 'refreshOpenRouterImageEndpoints'): void
  (e: 'selectOpenRouterImageEndpoint', providerTag: string): void
  (e: 'updateOpenRouterImageEndpointFreshness', value: Readonly<{
    refreshAfterMs: number; hardExpireAfterMs: number; expectedRevision: number
  }>): void
  (e: 'updateOpenRouterChatEnabled', enabled: boolean): void
  (e: 'updateLMStudioChatEnabled', enabled: boolean): void
  (e: 'updateLMStudioEndpointUrl', value: string): void
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
  (e: 'updateOllamaChatMode', mode: 'native_rest' | 'openai_compatible'): void
  (e: 'updateOllamaNativeRestPreferredEndpoint', endpoint: 'chat' | 'generate'): void
  (e: 'updateOllamaOpenAICompatiblePreferredEndpoint', endpoint: 'chat_completions' | 'responses'): void
  (e: 'updateOllamaProfileCapability', key: 'thinkingControl' | 'toolsSupported', value: 'boolean' | 'effort' | boolean): void
  (
    e: 'updateOllamaNativeControl',
    key: 'diagnosticsEnabled' | 'manualLoadUnloadEnabled' | 'autoLoadBeforeSendEnabled' | 'autoUnloadAfterSendEnabled' | 'autoUnloadAfterIdleEnabled',
    enabled: boolean
  ): void
  (e: 'clearOllamaChat'): void
  (e: 'updateLocalEndpointChatEnabled', enabled: boolean): void
  (e: 'updateLocalEndpointChatUrl', value: string): void
  (e: 'clearLocalEndpointChat'): void
  (e: 'updateOpenAIResponsesChatEnabled', enabled: boolean): void
  (e: 'clearOpenAIResponsesChat'): void
  (e: 'refreshOpenAIResponsesModels'): void
  (e: 'updateGoogleAIStudioChatEnabled', enabled: boolean): void
  (e: 'clearGoogleAIStudioChat'): void
  (e: 'refreshGoogleAIStudioModels'): void
  (e: 'updateAnthropicChatEnabled', enabled: boolean): void
  (e: 'updateAnthropicThinkingDisplay', value: 'provider_default' | 'summarized' | 'omitted'): void
  (e: 'clearAnthropicChat'): void
  (e: 'refreshAnthropicModels'): void
  (e: 'updateDeepSeekChatEnabled', enabled: boolean): void
  (e: 'clearDeepSeekChat'): void
  (e: 'refreshDeepSeekModels'): void
  (e: 'updateReasoningDisplayMode', mode: 'inline' | 'rail'): void
  (e: 'updateReasoningPanelDefaultExpanded', expanded: boolean): void
  (e: 'updateReasoningPanelAutoCollapseAfterReasoning', enabled: boolean): void
  (e: 'openSettings'): void
}>()

const disabled = computed(() => props.disabled || props.isRunning)
const providerModelSelection = computed(() => props.sessionConfig.routeSelection?.kind === 'provider_model'
  ? props.sessionConfig.routeSelection : null)
const generationParamsProfile = computed(() =>
  providerModelSelection.value
    ? getDefaultGenerationParamProfile(providerModelSelection.value.providerId, {
      requestKind: isGoogleImageGenerationModel.value ? 'image_generation' : 'text',
    }) ?? unsetGenerationProfile
    : unsetGenerationProfile
)
const generationParamsModelId = computed(() =>
  providerModelSelection.value?.modelId ?? ''
)
const selectedProvider = computed<RuntimeProviderId | null>(() => providerModelSelection.value?.providerId ?? null)
const selectedModelIdentity = computed(() => providerModelSelection.value?.modelId ?? '')
const openRouterModelValue = computed(() => (
  selectedProvider.value === OPENROUTER_PROVIDER_ID ? selectedModelIdentity.value : DEFAULT_OPENROUTER_MODEL_ID
))
const isGoogleAIStudioSelected = computed(() => selectedProvider.value === 'google_ai_studio')
const isOpenAIResponsesSelected = computed(() => selectedProvider.value === OPENAI_RESPONSES_PROVIDER_KEY)
const showOpenRouterImageEndpointControls = computed(() =>
  selectedProvider.value === OPENROUTER_PROVIDER_ID && props.sessionConfig.imageGeneration.enabled)
const openRouterImageEndpointState = computed(() =>
  props.openRouterImageEndpointSelection?.modelId === selectedModelIdentity.value
    ? props.openRouterImageEndpointSelection : null)
const openRouterImageRefreshPresets = Object.freeze([900000, 3600000, 21600000, 86400000, 604800000])
const openRouterImageHardExpiryPresets = Object.freeze([3600000, 21600000, 86400000, 604800000, 2592000000])
function formatFreshnessDuration(value: number): string {
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  return value % day === 0 ? `${value / day}d` : value % hour === 0 ? `${value / hour}h` : `${value / 60000}m`
}
function updateOpenRouterImageFreshness(key: 'refreshAfterMs' | 'hardExpireAfterMs', event: Event): void {
  const state = openRouterImageEndpointState.value
  const value = Number((event.target as HTMLSelectElement).value)
  if (!state || !Number.isSafeInteger(value)) return
  const pair = { ...state.settings, [key]: value }
  if (pair.refreshAfterMs >= pair.hardExpireAfterMs) return
  emit('updateOpenRouterImageEndpointFreshness', {
    refreshAfterMs: pair.refreshAfterMs,
    hardExpireAfterMs: pair.hardExpireAfterMs,
    expectedRevision: state.settings.revision,
  })
}
const googleImageGenerationPolicy = computed(() => projectGeminiImageGenerationPolicyV2(props.capabilityProjection))
const isGoogleImageGenerationModel = computed(() => isGoogleAIStudioSelected.value && isProjectedGeminiImageModelV2(props.capabilityProjection))
const googleThinkingCapability = computed(() => projectGeminiThinkingCapabilityV2(props.capabilityProjection, selectedModelIdentity.value))
function customGenerationParamValue(key: 'thinkingBudget' | 'thinkingLevel' | 'includeThoughts' | 'thoughtSummaryMode'): unknown {
  const setting = props.sessionConfig.generationParams.detail?.[key]
  if (setting?.mode === 'custom') return setting.value
  const decision = props.generationParamsResolved?.decisions[key]
  return decision && (decision.state === 'sent' || decision.state === 'deprecated') ? decision.value : undefined
}
const googleThinkingConfig = computed(() => {
  const capability = googleThinkingCapability.value
  const level = customGenerationParamValue('thinkingLevel')
  const budget = customGenerationParamValue('thinkingBudget')
  const textIncludeThoughts = customGenerationParamValue('includeThoughts') === true
  const imageSummaryMode = customGenerationParamValue('thoughtSummaryMode')
  return {
    thinkingBudget: typeof budget === 'number'
      ? budget
      : capability.kind === 'budget' ? (capability.defaultBudgetMode === 'dynamic' ? -1 : 0) : 8192,
    thinkingLevel: typeof level === 'string'
      ? level as GeminiThinkingLevel
      : capability.kind === 'level' ? capability.defaultLevel : 'low' as GeminiThinkingLevel,
    includeThoughts: isGoogleImageGenerationModel.value ? imageSummaryMode === 'auto' : textIncludeThoughts,
  }
})
const googleThinkingEnabled = computed(() => {
  if (isGoogleImageGenerationModel.value) return googleImageGenerationPolicy.value.supportsThoughtSummaries ||
    googleImageGenerationPolicy.value.thinkingLevels.length > 0
  return googleThinkingCapability.value.kind === 'level' || googleThinkingCapability.value.kind === 'budget'
})
const googleImageThinkingLevelSelection = computed(() => {
  const policy = googleImageGenerationPolicy.value
  const setting = props.sessionConfig.generationParams.detail?.thinkingLevel
  return setting?.mode === 'custom' &&
    (policy.thinkingLevels as readonly string[]).includes(String(setting.value))
    ? String(setting.value)
    : 'default'
})
const googleImageDefaultThinkingLevel = computed(() => {
  const policy = googleImageGenerationPolicy.value
  return policy.thinkingLevels[0] ?? ''
})
const imageGenerationSizeOptions = computed<readonly ChatSessionConfigImageResolution[]>(() => {
  if (isGoogleImageGenerationModel.value) return googleImageGenerationPolicy.value.supportedImageSizes
  return ['1K', '2K', '4K']
})
const imageGenerationAspectRatioOptions = computed<readonly ChatSessionConfigAspectRatio[]>(() => {
  if (isGoogleImageGenerationModel.value) return googleImageGenerationPolicy.value.supportedAspectRatios
  return ['16:9', '3:4', '1:1', '4:3']
})
const imageGenerationOutputModeOptions = computed(() => {
  if (isGoogleImageGenerationModel.value) return googleImageGenerationPolicy.value.supportedOutputModes
  return ['auto', 'image_only', 'image_and_text'] as const
})
const showImageGenerationSizeControl = computed(() =>
  !isGoogleImageGenerationModel.value || googleImageGenerationPolicy.value.imageSizeMode !== 'hidden'
)
const lockImageGenerationSizeControl = computed(() =>
  false
)
const effectiveImageGenerationEnabled = computed(() =>
  isGoogleImageGenerationModel.value || props.sessionConfig.imageGeneration.enabled
)
const effectiveImageGenerationResolution = computed<ChatSessionConfigImageResolution>(() =>
  isGoogleImageGenerationModel.value &&
    (
      !props.sessionConfig.imageGeneration.enabled ||
      !(googleImageGenerationPolicy.value.supportedImageSizes as readonly string[]).includes(props.sessionConfig.imageGeneration.resolution)
    )
    ? googleImageGenerationPolicy.value.defaultImageSize
    : props.sessionConfig.imageGeneration.resolution
)
const effectiveImageGenerationAspectRatio = computed(() =>
  isGoogleImageGenerationModel.value &&
    (
      !props.sessionConfig.imageGeneration.enabled ||
      !props.sessionConfig.imageGeneration.aspectRatio ||
      !(googleImageGenerationPolicy.value.supportedAspectRatios as readonly string[]).includes(props.sessionConfig.imageGeneration.aspectRatio)
    )
    ? '1:1'
    : props.sessionConfig.imageGeneration.aspectRatio
)
const reasoningPanelDefaultExpanded = computed(() => props.reasoningPanelDefaultExpanded !== false)
const reasoningPanelAutoCollapseAfterReasoning = computed(() => props.reasoningPanelAutoCollapseAfterReasoning === true)
const genericReasoningEffortOptions = computed<readonly ChatSessionConfigReasoningEffort[]>(() => {
  const field = props.capabilityProjection?.controls['reasoning.effort']
  if (!field || field.state !== 'supported' || field.domain?.kind !== 'enum') return Object.freeze([])
  return Object.freeze(field.domain.values.filter((effort): effort is ChatSessionConfigReasoningEffort =>
    typeof effort === 'string' && effort !== 'none' && effort !== 'auto'))
})
const openAIResponsesReasoningSupported = computed(() =>
  isOpenAIResponsesSelected.value && genericReasoningEffortOptions.value.length > 0
)
const openAIResponsesReasoningOptions = computed<readonly OpenAIResponsesReasoningEffortSetting[]>(() =>
  openAIResponsesReasoningSupported.value
    ? Object.freeze(['auto', ...genericReasoningEffortOptions.value] as OpenAIResponsesReasoningEffortSetting[])
    : Object.freeze([])
)
const openAIResponsesReasoningSummaryOptions = computed<readonly OpenAIResponsesReasoningSummarySetting[]>(() => {
  const field = props.capabilityProjection?.controls['reasoning.summary']
  if (!openAIResponsesReasoningSupported.value || !field || field.state !== 'supported' || field.domain?.kind !== 'enum') {
    return Object.freeze([])
  }
  const values = field.domain.values.filter((value): value is OpenAIResponsesReasoningSummarySetting =>
    typeof value === 'string' && (value === 'auto' || value === 'concise' || value === 'detailed'))
  return Object.freeze(['off', ...values] as OpenAIResponsesReasoningSummarySetting[])
})
const openAIResponsesReasoningValue = computed<OpenAIResponsesReasoningEffortSetting>(() => {
  const layerValue = props.sessionConfig.generationParams.detail?.reasoningEffort
  const customValue = layerValue?.mode === 'custom' && typeof layerValue.value === 'string'
    ? layerValue.value
    : null
  const decision = props.generationParamsResolved?.decisions.reasoningEffort
  const decisionValue = decision &&
    (decision.state === 'sent' || decision.state === 'deprecated' || decision.state === 'providerAuto') &&
    typeof decision.value === 'string'
    ? decision.value
    : null
  const candidate = customValue ?? decisionValue ?? 'auto'
  return (openAIResponsesReasoningOptions.value as readonly string[]).includes(candidate)
    ? candidate as OpenAIResponsesReasoningEffortSetting
    : 'auto'
})
const openAIResponsesReasoningSummaryValue = computed<OpenAIResponsesReasoningSummarySetting>(() => {
  if (!openAIResponsesReasoningSupported.value) return 'off'
  const layerValue = props.sessionConfig.generationParams.detail?.reasoningSummary
  if (layerValue?.mode === 'omit') return 'off'
  const customValue = layerValue?.mode === 'custom' && typeof layerValue.value === 'string'
    ? layerValue.value
    : null
  const decision = props.generationParamsResolved?.decisions.reasoningSummary
  const decisionValue = decision &&
    (decision.state === 'sent' || decision.state === 'deprecated') &&
    typeof decision.value === 'string'
    ? decision.value
    : null
  const candidate = customValue ?? decisionValue ?? 'off'
  return (openAIResponsesReasoningSummaryOptions.value as readonly string[]).includes(candidate)
    ? candidate as OpenAIResponsesReasoningSummarySetting
    : 'off'
})
function selectedModelFor(providerId: RuntimeProviderId): string {
  return selectedProvider.value === providerId ? selectedModelIdentity.value : ''
}
function selectProviderModel(providerId: RuntimeProviderId, modelId: unknown) {
  const normalized = String(modelId ?? '').trim()
  if (!normalized) return
  emit('updateRouteSelection', createProviderModelRouteSelection({ providerId, modelId: normalized }))
}
const openRouterChat = computed(() => props.openRouterChat ?? {
  enabled: false,
  providerLabel: t('chat.console.provider.openRouter.providerLabelDefault'),
})
const openRouterChatStatusLabel = computed(() => openRouterChat.value.enabled ? t('chat.console.status.active') : t('chat.console.status.inactive'))
const lmStudioChat = computed(() => props.lmStudioChat ?? {
  enabled: false,
  endpointUrl: 'http://127.0.0.1:1234',
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
  const selected = selectedModelFor('lm_studio').trim()
  return lmStudioNativeModels.value.find((model) => model.key === selected || model.loadedInstances?.includes(selected)) ?? null
})
const lmStudioSelectedInstanceId = computed(() => {
  const model = lmStudioSelectedNativeModel.value
  return Array.isArray(model?.loadedInstances) && model.loadedInstances[0] ? String(model.loadedInstances[0]) : selectedModelFor('lm_studio').trim()
})
const lmStudioBridgeAvailable = computed(() => {
  const bridge = (globalThis as any).generationV2?.localRuntime?.lmStudio
  return !!bridge && typeof bridge.probe === 'function' && typeof bridge.loadModel === 'function' && typeof bridge.unloadModel === 'function'
})
function formatLMStudioAvailability(available: boolean): string {
  return available ? t('settings.lmStudio.available') : t('settings.lmStudio.unavailable')
}
const ollamaChat = computed(() => props.ollamaChat ?? {
  enabled: false,
  endpointUrl: 'http://127.0.0.1:11434',
  chatMode: 'native_rest' as const,
  nativeRestPreferredEndpoint: 'chat' as const,
  openAICompatiblePreferredEndpoint: 'chat_completions' as const,
  thinkingControl: null,
  toolsSupported: null,
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
  const bridge = (globalThis as any).generationV2?.localRuntime?.ollama
  return !!bridge && typeof bridge.probe === 'function' && typeof bridge.loadModel === 'function' && typeof bridge.unloadModel === 'function'
})
function formatOllamaAvailability(available: boolean): string {
  return available ? t('settings.ollama.available') : t('settings.ollama.unavailable')
}
const localEndpointChat = computed(() => props.localEndpointChat ?? {
  enabled: false,
  endpointUrl: 'http://localhost:1234/v1',
  experimentalLabel: t('chat.console.provider.localEndpoint.experimentalLabel'),
})
const localEndpointChatStatusLabel = computed(() => localEndpointChat.value.enabled ? t('chat.console.status.active') : t('chat.console.status.inactive'))
const openAIResponsesChat = computed(() => props.openAIResponsesChat ?? {
  enabled: false,
  experimentalLabel: t('chat.console.provider.openAIResponses.experimentalLabel'),
})
const openAIResponsesChatStatusLabel = computed(() => openAIResponsesChat.value.enabled ? t('chat.console.status.active') : t('chat.console.status.inactive'))
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
  const source = t('chat.console.provider.openAIResponses.sourceName')
  if (openAIResponsesModelAvailability.value.loading) return tf('chat.console.availability.refreshing', { source })
  const result = openAIResponsesModelAvailability.value.result
  if (!result) return tf('chat.console.availability.notRefreshed', { source })
  if (!result.ok) return `${networkFailureMessage(result)} (${result.code})`
  return tf('chat.console.availability.records', { count: result.models.length, source, observedAt: formatObservedAt(result.observedAtMs) })
})
const googleAIStudioChat = computed(() => props.googleAIStudioChat ?? {
  enabled: false,
  experimentalLabel: t('chat.console.provider.googleAIStudio.experimentalLabel'),
})
const googleAIStudioChatStatusLabel = computed(() => googleAIStudioChat.value.enabled ? t('chat.console.status.active') : t('chat.console.status.inactive'))
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
  const source = t('chat.console.provider.googleAIStudio.sourceName')
  if (googleAIStudioModelAvailability.value.loading) return tf('chat.console.availability.refreshing', { source })
  const result = googleAIStudioModelAvailability.value.result
  if (!result) return tf('chat.console.availability.notRefreshed', { source })
  if (!result.ok) return `${networkFailureMessage(result)} (${result.code})`
  return tf('chat.console.availability.records', { count: result.models.length, source, observedAt: formatObservedAt(result.observedAtMs) })
})
const anthropicChat = computed(() => props.anthropicChat ?? {
  enabled: false,
  thinkingDisplay: 'summarized' as const,
  experimentalLabel: t('chat.console.provider.anthropic.experimentalLabel'),
})
const googleThinkingLevelSelection = computed(() => {
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'level') return 'default'
  const setting = props.sessionConfig.generationParams.detail?.thinkingLevel
  return setting?.mode === 'custom' && (capability.levels as readonly string[]).includes(String(setting.value))
    ? String(setting.value) : 'default'
})
const googleThinkingBudgetMode = computed(() => {
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'budget') return 'default'
  const setting = props.sessionConfig.generationParams.detail?.thinkingBudget
  if (setting?.mode !== 'custom' || typeof setting.value !== 'number') return 'default'
  if (setting.value === -1) return 'dynamic'
  if (setting.value === 0 && capability.allowOff) return 'off'
  return isProjectedGeminiThinkingBudgetValid(capability, setting.value) ? 'fixed' : 'default'
})
const googleThinkingBudgetInput = computed(() => {
  const capability = googleThinkingCapability.value
  const setting = props.sessionConfig.generationParams.detail?.thinkingBudget
  return capability.kind === 'budget' && setting?.mode === 'custom' && typeof setting.value === 'number' &&
    setting.value > 0 && isProjectedGeminiThinkingBudgetValid(capability, setting.value) ? String(setting.value) : ''
})
function googleThinkingLevelLabel(level: GeminiThinkingLevel): string {
  return level === 'high' ? t('chat.console.reasoning.highDynamic') : level
}
const anthropicChatStatusLabel = computed(() => anthropicChat.value.enabled ? t('chat.console.status.active') : t('chat.console.status.inactive'))
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
  const source = t('chat.console.provider.anthropic.sourceName')
  if (anthropicModelAvailability.value.loading) return tf('chat.console.availability.refreshing', { source })
  const result = anthropicModelAvailability.value.result
  if (!result) return tf('chat.console.availability.notRefreshed', { source })
  if (!result.ok) return `${networkFailureMessage(result)} (${result.code})`
  return tf('chat.console.availability.records', { count: result.models.length, source, observedAt: formatObservedAt(result.observedAtMs) })
})
const deepSeekChat = computed(() => props.deepSeekChat ?? {
  enabled: false,
  experimentalLabel: t('chat.console.provider.deepSeek.experimentalLabel'),
})
const deepSeekChatStatusLabel = computed(() => deepSeekChat.value.enabled ? t('chat.console.status.active') : t('chat.console.status.inactive'))
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
  const source = t('chat.console.provider.deepSeek.sourceName')
  if (deepSeekModelAvailability.value.loading) return tf('chat.console.availability.refreshing', { source })
  const result = deepSeekModelAvailability.value.result
  if (!result) return tf('chat.console.availability.notRefreshed', { source })
  if (!result.ok) return `${networkFailureMessage(result)} (${result.code})`
  return tf('chat.console.availability.records', { count: result.models.length, source, observedAt: formatObservedAt(result.observedAtMs) })
})
const imageValue = computed<ImageGenerationUserConfig>(() => ({
  enabled: effectiveImageGenerationEnabled.value,
  outputMode: props.sessionConfig.imageGeneration.detail?.outputMode ?? (isGoogleImageGenerationModel.value ? googleImageGenerationPolicy.value.defaultOutputMode : 'auto'),
  aspectRatio: effectiveImageGenerationAspectRatio.value,
  imageSize: showImageGenerationSizeControl.value ? effectiveImageGenerationResolution.value : '',
}))

function formatObservedAt(observedAtMs: number): string {
  if (!Number.isFinite(observedAtMs)) return t('chat.console.status.unknown')
  try {
    return new Date(observedAtMs).toISOString()
  } catch {
    return t('chat.console.status.unknown')
  }
}

function networkFailureMessage(result: unknown): string {
  if (!result || typeof result !== 'object') return t('errors.network.reason.networkUnknown')
  const record = result as Record<string, unknown>
  return resolveNetworkFailureDisplayMessage({
    networkError: record.networkError,
    code: record.code,
    message: record.message,
  }) ?? t('errors.network.reason.networkUnknown')
}

function onGoogleThinkingEnabledChange(enabled: boolean) {
  if (isGoogleImageGenerationModel.value) return
  const current = props.sessionConfig.generationParams.detail ?? {}
  if (!enabled) {
    emit('updateGenerationParamsLayer', {
      ...current,
      ...(googleThinkingCapability.value.kind === 'budget' ? { thinkingBudget: { mode: 'omit' } as const } : {}),
      ...(googleThinkingCapability.value.kind === 'level' ? { thinkingLevel: { mode: 'omit' } as const } : {}),
    })
    return
  }
  if (googleThinkingCapability.value.kind === 'budget') {
    emit('updateGenerationParamsLayer', {
      ...current,
      thinkingBudget: { mode: 'custom', value: googleThinkingCapability.value.defaultBudgetMode === 'dynamic' ? -1 : 0 },
    })
    return
  }
  if (googleThinkingCapability.value.kind === 'level') {
    emit('updateGenerationParamsLayer', {
      ...current,
      thinkingLevel: { mode: 'custom', value: googleThinkingCapability.value.defaultLevel },
    })
  }
}

function onGoogleThinkingBudgetChange(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'budget' || !Number.isSafeInteger(value) || value <= 0 || !isProjectedGeminiThinkingBudgetValid(capability, value)) return
  emit('updateGenerationParamsLayer', {
    ...(props.sessionConfig.generationParams.detail ?? {}),
    thinkingLevel: { mode: 'omit' },
    thinkingBudget: { mode: 'custom', value },
  })
}

function onGoogleThinkingBudgetModeChange(event: Event) {
  const mode = (event.target as HTMLSelectElement).value
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'budget') return
  const current = props.sessionConfig.generationParams.detail ?? {}
  if (mode === 'default') {
    emit('updateGenerationParamsLayer', { ...current, thinkingBudget: { mode: 'omit' }, thinkingLevel: { mode: 'omit' } })
  } else if (mode === 'dynamic') {
    emit('updateGenerationParamsLayer', { ...current, thinkingLevel: { mode: 'omit' }, thinkingBudget: { mode: 'custom', value: -1 } })
  } else if (mode === 'off' && capability.allowOff) {
    emit('updateGenerationParamsLayer', { ...current, thinkingLevel: { mode: 'omit' }, thinkingBudget: { mode: 'custom', value: 0 } })
  } else if (mode === 'fixed') {
    const existing = current.thinkingBudget
    const value = existing?.mode === 'custom' && isProjectedGeminiThinkingBudgetValid(capability, existing.value) && existing.value > 0
      ? existing.value : capability.minBudget
    emit('updateGenerationParamsLayer', { ...current, thinkingLevel: { mode: 'omit' }, thinkingBudget: { mode: 'custom', value } })
  }
}

function onGoogleThinkingLevelChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (isGoogleImageGenerationModel.value) {
    const current = props.sessionConfig.generationParams.detail ?? {}
    if (value === 'default') {
      emit('updateGenerationParamsLayer', {
        ...current,
        thinkingLevel: { mode: 'omit' },
        thinkingBudget: { mode: 'omit' },
      })
      return
    }
    if (!(googleImageGenerationPolicy.value.thinkingLevels as readonly string[]).includes(value)) return
    emit('updateGenerationParamsLayer', {
      ...current,
      thinkingBudget: { mode: 'omit' },
      thinkingLevel: { mode: 'custom', value: value as GeminiThinkingLevel },
    })
    return
  }
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'level') return
  if (value === 'default') {
    emit('updateGenerationParamsLayer', {
      ...(props.sessionConfig.generationParams.detail ?? {}),
      thinkingBudget: { mode: 'omit' },
      thinkingLevel: { mode: 'omit' },
    })
    return
  }
  if (!(capability.levels as readonly string[]).includes(value)) return
  emit('updateGenerationParamsLayer', {
    ...(props.sessionConfig.generationParams.detail ?? {}),
    thinkingBudget: { mode: 'omit' },
    thinkingLevel: { mode: 'custom', value: value as GeminiThinkingLevel },
  })
}

function onGoogleThinkingIncludeThoughtsChange(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked
  emit('updateGenerationParamsLayer', {
    ...(props.sessionConfig.generationParams.detail ?? {}),
    ...(isGoogleImageGenerationModel.value
      ? { thoughtSummaryMode: { mode: 'custom', value: enabled ? 'auto' : 'none' } as const }
      : { includeThoughts: { mode: 'custom', value: enabled } as const }),
  })
}

function formatModelCount(models: readonly unknown[], emptyLabel: string): string {
  return models.length === 0 ? emptyLabel : tf('chat.console.common.modelCount', { count: models.length })
}

function formatLMStudioModels(models: any[]): string {
  return formatModelCount(models, t('settings.lmStudio.none'))
}

async function probeLMStudio(options: Readonly<{ clearAction?: boolean }> = {}) {
  const bridge = (globalThis as any).generationV2?.localRuntime?.lmStudio
  if (!lmStudioBridgeAvailable.value) {
    lmStudioActionResult.value = t('settings.lmStudio.bridgeUnavailable')
    return
  }
  lmStudioProbeLoading.value = true
  if (options.clearAction !== false) lmStudioActionResult.value = ''
  try {
    const result = await bridge.probe({
      endpointUrl: lmStudioChat.value.endpointUrl,
      selectedModel: selectedModelFor('lm_studio'),
      timeoutMs: 5000,
    })
    lmStudioProbeResult.value = result
  } catch {
    lmStudioProbeResult.value = null
    lmStudioActionResult.value = networkFailureMessage({ code: 'network_error', message: t('errors.network.reason.networkUnknown') })
  } finally {
    lmStudioProbeLoading.value = false
  }
}

async function loadLMStudioSelectedModel() {
  const bridge = (globalThis as any).generationV2?.localRuntime?.lmStudio
  const model = selectedModelFor('lm_studio').trim()
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
      : tf('settings.lmStudio.loadFailed', { message: networkFailureMessage(result) })
    await probeLMStudio({ clearAction: false })
  } catch {
    lmStudioActionResult.value = tf('settings.lmStudio.loadFailed', { message: t('errors.network.reason.networkUnknown') })
  } finally {
    lmStudioActionLoading.value = false
  }
}

async function unloadLMStudioSelectedModel() {
  const bridge = (globalThis as any).generationV2?.localRuntime?.lmStudio
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
      : tf('settings.lmStudio.unloadFailed', { message: networkFailureMessage(result) })
    await probeLMStudio({ clearAction: false })
  } catch {
    lmStudioActionResult.value = tf('settings.lmStudio.unloadFailed', { message: t('errors.network.reason.networkUnknown') })
  } finally {
    lmStudioActionLoading.value = false
  }
}

function formatOllamaModels(models: any[]): string {
  return formatModelCount(models, t('settings.ollama.none'))
}

async function probeOllama(options: Readonly<{ clearAction?: boolean }> = {}) {
  const bridge = (globalThis as any).generationV2?.localRuntime?.ollama
  if (!ollamaBridgeAvailable.value) {
    ollamaActionResult.value = t('settings.ollama.bridgeUnavailable')
    return
  }
  ollamaProbeLoading.value = true
  if (options.clearAction !== false) ollamaActionResult.value = ''
  try {
    const result = await bridge.probe({
      endpointUrl: ollamaChat.value.endpointUrl,
      selectedModel: selectedModelFor('ollama_local'),
      timeoutMs: 5000,
    })
    ollamaProbeResult.value = result
  } catch {
    ollamaProbeResult.value = null
    ollamaActionResult.value = networkFailureMessage({ code: 'network_error', message: t('errors.network.reason.networkUnknown') })
  } finally {
    ollamaProbeLoading.value = false
  }
}

async function loadOllamaSelectedModel() {
  const bridge = (globalThis as any).generationV2?.localRuntime?.ollama
  const model = selectedModelFor('ollama_local').trim()
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
      : tf('settings.ollama.loadFailed', { message: networkFailureMessage(result) })
    await probeOllama({ clearAction: false })
  } catch {
    ollamaActionResult.value = tf('settings.ollama.loadFailed', { message: t('errors.network.reason.networkUnknown') })
  } finally {
    ollamaActionLoading.value = false
  }
}

async function unloadOllamaSelectedModel() {
  const bridge = (globalThis as any).generationV2?.localRuntime?.ollama
  const model = selectedModelFor('ollama_local').trim()
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
      : tf('settings.ollama.unloadFailed', { message: networkFailureMessage(result) })
    await probeOllama({ clearAction: false })
  } catch {
    ollamaActionResult.value = tf('settings.ollama.unloadFailed', { message: t('errors.network.reason.networkUnknown') })
  } finally {
    ollamaActionLoading.value = false
  }
}

function formatResolvedCapabilities(model: unknown): string {
  const record = model && typeof model === 'object' ? model as Record<string, unknown> : null
  const resolutions = record?.resolvedCapabilities && typeof record.resolvedCapabilities === 'object'
    ? record.resolvedCapabilities as Readonly<Record<string, Readonly<{
        effective?: Readonly<{ state?: string; source?: string }>
        wireSupport?: string
      }>>>
    : null
  if (!resolutions) return t('chat.console.capability.unknown')
  const chunks = Object.entries(resolutions).map(([key, value]) =>
    `${key}: ${value.effective?.state ?? 'unknown'} · ${value.effective?.source ?? 'none'} · ${value.wireSupport ?? 'unsupported'}`)
  return chunks.length > 0 ? chunks.join(' · ') : t('chat.console.capability.unknown')
}

function formatDeepSeekCapabilities(model: ProviderModelAvailability): string {
  return formatResolvedCapabilities(model)
}

function formatDeepSeekPricingSeed(model: ProviderModelAvailability): string {
  void model
  return t('chat.console.capability.pricingUnknown')
}

function formatOpenAICapabilities(model: OpenAIProviderModelAvailability): string {
  return formatResolvedCapabilities(model)
}

function formatGeminiCapabilities(model: GeminiProviderModelAvailability): string {
  return formatResolvedCapabilities(model)
}

function formatAnthropicCapabilities(model: AnthropicProviderModelAvailability): string {
  return formatResolvedCapabilities(model)
}

function formatReasoningEffort(effort: string): string {
  return t(`chat.console.reasoning.effort.${effort}`)
}

function formatOpenAIResponsesReasoningOption(option: OpenAIResponsesReasoningEffortSetting): string {
  if (option === 'auto') {
    return formatOpenAIResponsesAutoReasoningLabel(selectedModelIdentity.value, t('chat.generationParams.reasoning.auto'))
  }
  return option
}

function onOpenAIResponsesReasoningSelect(option: OpenAIResponsesReasoningEffortSetting) {
  if (!openAIResponsesReasoningSupported.value) return
  const current = props.sessionConfig.generationParams.detail ?? {}
  emit('updateGenerationParamsLayer', {
    ...current,
    reasoningEffort: { mode: 'custom', value: option },
  })
}

function formatOpenAIResponsesReasoningSummaryOption(option: OpenAIResponsesReasoningSummarySetting): string {
  return t(`chat.generationParams.reasoning.${option}`)
}

function onOpenAIResponsesReasoningSummarySelect(option: OpenAIResponsesReasoningSummarySetting) {
  if (!openAIResponsesReasoningSupported.value) return
  const current = props.sessionConfig.generationParams.detail ?? {}
  emit('updateGenerationParamsLayer', {
    ...current,
    reasoningSummary: option === 'off'
      ? { mode: 'omit' }
      : { mode: 'custom', value: option },
  })
}

function formatWebSearchLevel(level: string): string {
  return t(`chat.console.webSearch.level.${level}`)
}

function chipClass(active: boolean): string {
  return active
    ? 'border-gray-900 bg-gray-900 text-white'
    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
}
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto p-3" data-testid="chat-session-console-scroll">
    <div class="space-y-4">
      <section class="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('chat.console.section.display') }}</div>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.reasoningDisplayMode === 'inline')"
            @click="emit('updateReasoningDisplayMode', 'inline')"
          >
            {{ t('chat.console.display.inlineReasoning') }}
          </button>
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.reasoningDisplayMode === 'rail')"
            @click="emit('updateReasoningDisplayMode', 'rail')"
          >
            {{ t('chat.console.display.rightRailReasoning') }}
          </button>
        </div>
        <label class="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700">
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-gray-300"
            :checked="reasoningPanelDefaultExpanded"
            :disabled="disabled"
            data-testid="session-reasoning-panel-default-expanded"
            @change="emit('updateReasoningPanelDefaultExpanded', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('chat.console.display.expandReasoningWhileThinking') }}</span>
        </label>
        <label class="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700">
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-gray-300"
            :checked="reasoningPanelAutoCollapseAfterReasoning"
            :disabled="disabled"
            data-testid="session-reasoning-panel-auto-collapse-after-reasoning"
            @change="emit('updateReasoningPanelAutoCollapseAfterReasoning', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('chat.console.display.collapseReasoningWhenAnswerStarts') }}</span>
        </label>
      </section>

      <section class="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('chat.console.section.model') }}</div>
        <select
          data-testid="session-openrouter-model"
          class="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
          :disabled="disabled"
          :value="openRouterModelValue"
          @change="selectProviderModel(OPENROUTER_PROVIDER_ID, ($event.target as HTMLSelectElement).value)"
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
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-700">{{ t('chat.console.provider.openRouter.title') }}</div>
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
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="text-[11px] text-gray-700" data-testid="openrouter-chat-warning">
          {{ t('chat.console.provider.openRouter.warning') }}
        </div>
        <div class="rounded border border-gray-100 bg-white px-2 py-1.5 text-[11px] text-gray-800" data-testid="openrouter-chat-selected-status">
          <div>{{ tf('chat.console.provider.openRouter.status', { status: openRouterChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.openRouter.selectedModel', { model: selectedModelFor(OPENROUTER_PROVIDER_ID) || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.openRouter.notFallback') }}</div>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3" data-testid="openai-responses-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-blue-800">{{ t('chat.console.provider.openAIResponses.title') }}</div>
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
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="text-[11px] text-blue-800" data-testid="openai-responses-chat-warning">
          {{ t('chat.console.provider.openAIResponses.warning') }}
        </div>
        <div class="rounded border border-blue-100 bg-white px-2 py-1.5 text-[11px] text-blue-900" data-testid="openai-responses-chat-selected-status">
          <div>{{ tf('chat.console.provider.openAIResponses.status', { status: openAIResponsesChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.openAIResponses.selectedModel', { model: selectedModelFor('openai_responses') || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.openAIResponses.credentialBridge') }}</div>
        </div>
        <div class="space-y-2 rounded border border-blue-100 bg-white px-2 py-2 text-[11px] text-blue-900" data-testid="openai-responses-models-diagnostics">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-semibold">{{ t('chat.console.provider.openAIResponses.sourceTitle') }}</div>
              <div data-testid="openai-responses-models-summary">{{ openAIResponsesAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
              :disabled="disabled || openAIResponsesModelAvailability.loading"
              data-testid="openai-responses-models-refresh"
              @click="emit('refreshOpenAIResponsesModels')"
            >
              {{ openAIResponsesModelAvailability.loading ? t('chat.console.common.refreshing') : t('chat.console.common.refreshModels') }}
            </button>
          </div>
          <div v-if="openAIResponsesAvailabilityFailure" class="text-red-700" data-testid="openai-responses-models-error">
            {{ networkFailureMessage(openAIResponsesAvailabilityFailure) }}
          </div>
          <div v-if="openAIResponsesAvailabilitySourceDocuments.length > 0" class="text-blue-700" data-testid="openai-responses-models-source">
            {{ t('chat.console.common.sourceDocs') }}
            <span v-for="sourceDoc in openAIResponsesAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ tf('chat.console.common.sourceObserved', { source: sourceDoc.source, observedAt: formatObservedAt(sourceDoc.observedAtMs) }) }}
            </span>
          </div>
          <div v-for="warning in openAIResponsesAvailabilityWarnings" :key="warning" class="text-amber-700" data-testid="openai-responses-model-warning">
            {{ warning }}
          </div>
          <details v-if="openAIResponsesAvailabilityModels.length > 0" class="rounded border border-blue-100 bg-blue-50/40 px-2 py-1" data-testid="openai-responses-models-list">
            <summary class="cursor-pointer font-medium text-blue-900" data-testid="openai-responses-models-toggle">
              {{ tf('chat.console.common.modelListToggle', { count: openAIResponsesAvailabilityModels.length }) }}
            </summary>
            <div class="mt-2 space-y-1">
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
                    <div v-if="modelAvailability.ownedBy">{{ tf('chat.console.common.ownedBy', { owner: modelAvailability.ownedBy }) }}</div>
                    <div v-if="modelAvailability.createdAtSec">{{ tf('chat.console.common.created', { createdAt: modelAvailability.createdAtSec }) }}</div>
                    <div>{{ formatOpenAICapabilities(modelAvailability) }}</div>
                  </div>
                  <button
                    type="button"
                    class="rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                    :disabled="disabled"
                    data-testid="openai-responses-model-use"
                    @click="selectProviderModel('openai_responses', modelAvailability.nativeModelId)"
                  >
                    {{ t('chat.console.common.useModelId') }}
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
          </details>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
            :disabled="disabled || !openAIResponsesChat.enabled"
            data-testid="openai-responses-chat-disable"
            @click="emit('updateOpenAIResponsesChatEnabled', false)"
          >
            {{ t('chat.console.provider.openAIResponses.disable') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="openai-responses-chat-clear"
            @click="emit('clearOpenAIResponsesChat')"
          >
            {{ t('chat.console.provider.openAIResponses.clear') }}
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-rose-200 bg-rose-50/70 p-3" data-testid="anthropic-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-rose-800">{{ t('chat.console.provider.anthropic.title') }}</div>
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
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="text-[11px] text-rose-800" data-testid="anthropic-chat-warning">
          {{ t('chat.console.provider.anthropic.warning') }}
        </div>
        <div class="rounded border border-rose-100 bg-white px-2 py-1.5 text-[11px] text-rose-900" data-testid="anthropic-chat-selected-status">
          <div>{{ tf('chat.console.provider.anthropic.status', { status: anthropicChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.anthropic.selectedModel', { model: selectedModelFor('anthropic_messages') || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.anthropic.credentialBridge') }}</div>
        </div>
        <div class="space-y-2 rounded border border-rose-100 bg-white px-2 py-2 text-[11px] text-rose-900" data-testid="anthropic-thinking-display-controls">
          <div>
            <div class="font-semibold">{{ t('chat.console.provider.anthropic.thinkingDisplay.title') }}</div>
            <div class="text-rose-700">
              {{ props.sessionConfig.reasoning.enabled
                ? t('chat.console.provider.anthropic.thinkingDisplay.description')
                : t('chat.console.provider.anthropic.thinkingDisplay.disabledDescription') }}
            </div>
          </div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              v-for="option in (['provider_default', 'summarized', 'omitted'] as const)"
              :key="option"
              type="button"
              class="rounded-md border px-2 py-1.5 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
              :class="chipClass(anthropicChat.thinkingDisplay === option)"
              :disabled="disabled || !anthropicChat.enabled || !props.sessionConfig.reasoning.enabled"
              :data-testid="`anthropic-thinking-display-${option}`"
              @click="emit('updateAnthropicThinkingDisplay', option)"
            >
              <span class="block font-semibold">{{ t(`chat.console.provider.anthropic.thinkingDisplay.options.${option}.label`) }}</span>
              <span class="mt-0.5 block opacity-80">{{ t(`chat.console.provider.anthropic.thinkingDisplay.options.${option}.description`) }}</span>
            </button>
          </div>
        </div>
        <div class="space-y-2 rounded border border-rose-100 bg-white px-2 py-2 text-[11px] text-rose-900" data-testid="anthropic-models-diagnostics">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-semibold">{{ t('chat.console.provider.anthropic.sourceTitle') }}</div>
              <div data-testid="anthropic-models-summary">{{ anthropicAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
              :disabled="disabled || anthropicModelAvailability.loading"
              data-testid="anthropic-models-refresh"
              @click="emit('refreshAnthropicModels')"
            >
              {{ anthropicModelAvailability.loading ? t('chat.console.common.refreshing') : t('chat.console.common.refreshModels') }}
            </button>
          </div>
          <div v-if="anthropicAvailabilityFailure" class="text-red-700" data-testid="anthropic-models-error">
            {{ networkFailureMessage(anthropicAvailabilityFailure) }}
          </div>
          <div v-if="anthropicAvailabilitySourceDocuments.length > 0" class="text-rose-700" data-testid="anthropic-models-source">
            {{ t('chat.console.common.sourceDocs') }}
            <span v-for="sourceDoc in anthropicAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ tf('chat.console.common.sourceObserved', { source: sourceDoc.source, observedAt: formatObservedAt(sourceDoc.observedAtMs) }) }}
            </span>
          </div>
          <div v-for="warning in anthropicAvailabilityWarnings" :key="warning" class="text-amber-700" data-testid="anthropic-model-warning">
            {{ warning }}
          </div>
          <details v-if="anthropicAvailabilityModels.length > 0" class="rounded border border-rose-100 bg-rose-50/40 px-2 py-1" data-testid="anthropic-models-list">
            <summary class="cursor-pointer font-medium text-rose-900" data-testid="anthropic-models-toggle">
              {{ tf('chat.console.common.modelListToggle', { count: anthropicAvailabilityModels.length }) }}
            </summary>
            <div class="mt-2 space-y-1">
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
                    <div v-if="modelAvailability.modelType">{{ tf('chat.console.common.type', { type: modelAvailability.modelType }) }}</div>
                    <div v-if="modelAvailability.createdAt">{{ tf('chat.console.common.created', { createdAt: modelAvailability.createdAt }) }}</div>
                    <div>{{ formatAnthropicCapabilities(modelAvailability) }}</div>
                  </div>
                  <button
                    type="button"
                    class="rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                    :disabled="disabled"
                    data-testid="anthropic-model-use"
                    @click="selectProviderModel('anthropic_messages', modelAvailability.nativeModelId)"
                  >
                    {{ t('chat.console.common.useModelId') }}
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
          </details>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
            :disabled="disabled || !anthropicChat.enabled"
            data-testid="anthropic-chat-disable"
            @click="emit('updateAnthropicChatEnabled', false)"
          >
            {{ t('chat.console.provider.anthropic.disable') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="anthropic-chat-clear"
            @click="emit('clearAnthropicChat')"
          >
            {{ t('chat.console.provider.anthropic.clear') }}
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-cyan-200 bg-cyan-50/70 p-3" data-testid="deepseek-chat-controls">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-wide text-cyan-800">{{ t('chat.console.provider.deepSeek.title') }}</div>
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
            {{ t('chat.console.status.use') }}
          </label>
        </div>
        <div class="text-[11px] text-cyan-800" data-testid="deepseek-chat-warning">
          {{ t('chat.console.provider.deepSeek.warning') }}
        </div>
        <div class="rounded border border-cyan-100 bg-white px-2 py-1.5 text-[11px] text-cyan-900" data-testid="deepseek-chat-selected-status">
          <div>{{ tf('chat.console.provider.deepSeek.status', { status: deepSeekChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.deepSeek.selectedModel', { model: selectedModelFor('deepseek') || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.deepSeek.credentialBridge') }}</div>
        </div>
        <div class="space-y-2 rounded border border-cyan-100 bg-white px-2 py-2 text-[11px] text-cyan-900" data-testid="deepseek-models-diagnostics">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-semibold">{{ t('chat.console.provider.deepSeek.sourceTitle') }}</div>
              <div data-testid="deepseek-models-summary">{{ deepSeekAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="rounded-md border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-900 hover:bg-cyan-100 disabled:opacity-50"
              :disabled="disabled || deepSeekModelAvailability.loading"
              data-testid="deepseek-models-refresh"
              @click="emit('refreshDeepSeekModels')"
            >
              {{ deepSeekModelAvailability.loading ? t('chat.console.common.refreshing') : t('chat.console.common.refreshModels') }}
            </button>
          </div>
          <div v-if="deepSeekAvailabilityFailure" class="text-red-700" data-testid="deepseek-models-error">
            {{ networkFailureMessage(deepSeekAvailabilityFailure) }}
          </div>
          <div v-if="deepSeekAvailabilitySourceDocuments.length > 0" class="text-cyan-700" data-testid="deepseek-models-source">
            {{ t('chat.console.common.sourceDocs') }}
            <span v-for="sourceDoc in deepSeekAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ tf('chat.console.common.sourceObserved', { source: sourceDoc.source, observedAt: formatObservedAt(sourceDoc.observedAtMs) }) }}
            </span>
          </div>
          <div v-for="warning in deepSeekAvailabilityWarnings" :key="warning" class="text-amber-700" data-testid="deepseek-model-warning">
            {{ warning }}
          </div>
          <details v-if="deepSeekAvailabilityModels.length > 0" class="rounded border border-cyan-100 bg-cyan-50/40 px-2 py-1" data-testid="deepseek-models-list">
            <summary class="cursor-pointer font-medium text-cyan-900" data-testid="deepseek-models-toggle">
              {{ tf('chat.console.common.modelListToggle', { count: deepSeekAvailabilityModels.length }) }}
            </summary>
            <div class="mt-2 space-y-1">
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
                    <div>{{ formatDeepSeekCapabilities(modelAvailability) }}</div>
                    <div>{{ formatDeepSeekPricingSeed(modelAvailability) }}</div>
                  </div>
                  <button
                    type="button"
                    class="rounded-md border border-cyan-200 bg-white px-2 py-1 text-[11px] font-medium text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
                    :disabled="disabled"
                    data-testid="deepseek-model-use"
                    @click="selectProviderModel('deepseek', modelAvailability.nativeModelId)"
                  >
                    {{ t('chat.console.common.useModelId') }}
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
          </details>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-cyan-300 bg-white px-2 py-1.5 text-[11px] font-medium text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
            :disabled="disabled || !deepSeekChat.enabled"
            data-testid="deepseek-chat-disable"
            @click="emit('updateDeepSeekChatEnabled', false)"
          >
            {{ t('chat.console.provider.deepSeek.disable') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-cyan-200 bg-white px-2 py-1.5 text-[11px] font-medium text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="deepseek-chat-clear"
            @click="emit('clearDeepSeekChat')"
          >
            {{ t('chat.console.provider.deepSeek.clear') }}
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3" data-testid="google-ai-studio-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-emerald-800">{{ t('chat.console.provider.googleAIStudio.title') }}</div>
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
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="text-[11px] text-emerald-800" data-testid="google-ai-studio-chat-warning">
          {{ t('chat.console.provider.googleAIStudio.warning') }}
        </div>
        <div class="rounded border border-emerald-100 bg-white px-2 py-1.5 text-[11px] text-emerald-900" data-testid="google-ai-studio-chat-selected-status">
          <div>{{ tf('chat.console.provider.googleAIStudio.status', { status: googleAIStudioChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.googleAIStudio.selectedModel', { model: selectedModelFor('google_ai_studio') || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.googleAIStudio.credentialBridge') }}</div>
        </div>
        <div class="space-y-2 rounded border border-emerald-100 bg-white px-2 py-2 text-[11px] text-emerald-900" data-testid="google-ai-studio-models-diagnostics">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-semibold">{{ t('chat.console.provider.googleAIStudio.sourceTitle') }}</div>
              <div data-testid="google-ai-studio-models-summary">{{ googleAIStudioAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
              :disabled="disabled || googleAIStudioModelAvailability.loading"
              data-testid="google-ai-studio-models-refresh"
              @click="emit('refreshGoogleAIStudioModels')"
            >
              {{ googleAIStudioModelAvailability.loading ? t('chat.console.common.refreshing') : t('chat.console.common.refreshModels') }}
            </button>
          </div>
          <div v-if="googleAIStudioAvailabilityFailure" class="text-red-700" data-testid="google-ai-studio-models-error">
            {{ networkFailureMessage(googleAIStudioAvailabilityFailure) }}
          </div>
          <div v-if="googleAIStudioAvailabilitySourceDocuments.length > 0" class="text-emerald-700" data-testid="google-ai-studio-models-source">
            {{ t('chat.console.common.sourceDocs') }}
            <span v-for="sourceDoc in googleAIStudioAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ tf('chat.console.common.sourceObserved', { source: sourceDoc.source, observedAt: formatObservedAt(sourceDoc.observedAtMs) }) }}
            </span>
          </div>
          <div v-for="warning in googleAIStudioAvailabilityWarnings" :key="warning" class="text-amber-700" data-testid="google-ai-studio-model-warning">
            {{ warning }}
          </div>
          <details v-if="googleAIStudioAvailabilityModels.length > 0" class="rounded border border-emerald-100 bg-emerald-50/40 px-2 py-1" data-testid="google-ai-studio-models-list">
            <summary class="cursor-pointer font-medium text-emerald-900" data-testid="google-ai-studio-models-toggle">
              {{ tf('chat.console.common.modelListToggle', { count: googleAIStudioAvailabilityModels.length }) }}
            </summary>
            <div class="mt-2 space-y-1">
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
                    <div>{{ formatGeminiCapabilities(modelAvailability) }}</div>
                  </div>
                  <button
                    type="button"
                    class="rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    :disabled="disabled"
                    data-testid="google-ai-studio-model-use"
                    @click="selectProviderModel('google_ai_studio', modelAvailability.nativeModelId)"
                  >
                    {{ t('chat.console.common.useModelId') }}
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
          </details>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            :disabled="disabled || !googleAIStudioChat.enabled"
            data-testid="google-ai-studio-chat-disable"
            @click="emit('updateGoogleAIStudioChatEnabled', false)"
          >
            {{ t('chat.console.provider.googleAIStudio.disable') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="google-ai-studio-chat-clear"
            @click="emit('clearGoogleAIStudioChat')"
          >
            {{ t('chat.console.provider.googleAIStudio.clear') }}
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
        <div class="grid grid-cols-1 gap-2">
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
          <div>{{ t('settings.lmStudio.selectedModel') }}: {{ selectedModelFor('lm_studio') || t('settings.lmStudio.none') }}</div>
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
                :disabled="disabled || !lmStudioChat.enabled || !lmStudioChat.nativeRestControls.manualLoadUnloadEnabled || lmStudioActionLoading || !selectedModelFor('lm_studio')"
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
            <details v-if="lmStudioNativeModels.length > 0" class="rounded border border-indigo-100 bg-indigo-50/40 px-2 py-1" data-testid="lm-studio-model-use-list">
              <summary class="cursor-pointer font-medium text-indigo-900" data-testid="lm-studio-model-use-toggle">
                {{ tf('chat.console.common.modelListToggle', { count: lmStudioNativeModels.length }) }}
              </summary>
              <div class="mt-2 flex flex-wrap gap-1">
                <button
                  v-for="modelInfo in lmStudioNativeModels"
                  :key="modelInfo.key"
                  type="button"
                  class="rounded-md border border-indigo-200 bg-white px-2 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                  :disabled="disabled"
                  data-testid="lm-studio-model-use"
                  @click="selectProviderModel('lm_studio', modelInfo.key)"
                >
                  {{ modelInfo.displayName || modelInfo.key }}
                </button>
              </div>
            </details>
          </div>
          <div v-else-if="lmStudioProbeResult && !lmStudioProbeResult.ok" class="text-red-700" data-testid="lm-studio-probe-error">
            {{ networkFailureMessage(lmStudioProbeResult) }}
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
        <div class="grid grid-cols-1 gap-2">
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
          <div class="border-t border-green-100 pt-2">
            <div class="mb-1 font-semibold">V2 model contract · thinking wire</div>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="rounded-md border px-2 py-1.5 text-[11px]"
                :class="chipClass(ollamaChat.thinkingControl === 'boolean')"
                :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest' || ollamaChat.nativeRestPreferredEndpoint !== 'chat'"
                data-testid="ollama-profile-thinking-boolean"
                @click="emit('updateOllamaProfileCapability', 'thinkingControl', 'boolean')">think: boolean</button>
              <button type="button" class="rounded-md border px-2 py-1.5 text-[11px]"
                :class="chipClass(ollamaChat.thinkingControl === 'effort')"
                :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest' || ollamaChat.nativeRestPreferredEndpoint !== 'chat'"
                data-testid="ollama-profile-thinking-effort"
                @click="emit('updateOllamaProfileCapability', 'thinkingControl', 'effort')">think: low / medium / high</button>
            </div>
          </div>
          <div>
            <div class="mb-1 font-semibold">V2 model contract · native tools</div>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="rounded-md border px-2 py-1.5 text-[11px]"
                :class="chipClass(ollamaChat.toolsSupported === true)"
                :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest' || ollamaChat.nativeRestPreferredEndpoint !== 'chat'"
                data-testid="ollama-profile-tools-supported"
                @click="emit('updateOllamaProfileCapability', 'toolsSupported', true)">tools supported</button>
              <button type="button" class="rounded-md border px-2 py-1.5 text-[11px]"
                :class="chipClass(ollamaChat.toolsSupported === false)"
                :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest' || ollamaChat.nativeRestPreferredEndpoint !== 'chat'"
                data-testid="ollama-profile-tools-unsupported"
                @click="emit('updateOllamaProfileCapability', 'toolsSupported', false)">tools unsupported</button>
            </div>
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
          <div>{{ t('settings.ollama.selectedModel') }}: {{ selectedModelFor('ollama_local') || t('settings.ollama.none') }}</div>
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
                :disabled="disabled || !ollamaChat.enabled || !ollamaChat.nativeControls.manualLoadUnloadEnabled || ollamaActionLoading || !selectedModelFor('ollama_local')"
                data-testid="ollama-load-model"
                @click="loadOllamaSelectedModel"
              >
                {{ t('settings.ollama.load') }}
              </button>
              <button
                type="button"
                class="rounded-md border border-green-300 bg-white px-2 py-1 text-[11px] font-semibold text-green-900 hover:bg-green-50 disabled:opacity-50"
                :disabled="disabled || !ollamaChat.enabled || !ollamaChat.nativeControls.manualLoadUnloadEnabled || ollamaActionLoading || !selectedModelFor('ollama_local')"
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
            <details v-if="ollamaLocalModels.length > 0" class="rounded border border-green-100 bg-green-50/40 px-2 py-1" data-testid="ollama-model-use-list">
              <summary class="cursor-pointer font-medium text-green-900" data-testid="ollama-model-use-toggle">
                {{ tf('chat.console.common.modelListToggle', { count: ollamaLocalModels.length }) }}
              </summary>
              <div class="mt-2 flex flex-wrap gap-1">
                <button
                  v-for="modelInfo in ollamaLocalModels"
                  :key="modelInfo.key"
                  type="button"
                  class="rounded-md border border-green-200 bg-white px-2 py-1 text-[11px] font-medium text-green-800 hover:bg-green-100 disabled:opacity-50"
                  :disabled="disabled"
                  data-testid="ollama-model-use"
                  @click="selectProviderModel('ollama_local', modelInfo.key)"
                >
                  {{ modelInfo.displayName || modelInfo.key }}
                </button>
              </div>
            </details>
          </div>
          <div v-else-if="ollamaProbeResult && !ollamaProbeResult.ok" class="text-red-700" data-testid="ollama-probe-error">
            {{ networkFailureMessage(ollamaProbeResult) }}
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
            <div class="text-xs font-semibold uppercase tracking-wide text-amber-800">{{ t('chat.console.provider.localEndpoint.title') }}</div>
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
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-amber-900">{{ t('chat.console.provider.localEndpoint.endpointUrl') }}</label>
          <input
            class="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-sm disabled:bg-amber-50"
            :value="localEndpointChat.endpointUrl"
            :disabled="disabled || !localEndpointChat.enabled"
            placeholder="http://localhost:1234/v1"
            data-testid="local-endpoint-chat-url"
            @input="emit('updateLocalEndpointChatUrl', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="text-[11px] text-amber-800" data-testid="local-endpoint-chat-warning">
          {{ t('chat.console.provider.localEndpoint.warning') }}
        </div>
        <div class="rounded border border-amber-100 bg-white px-2 py-1.5 text-[11px] text-amber-900" data-testid="local-endpoint-chat-selected-status">
          <div>{{ tf('chat.console.provider.localEndpoint.status', { status: localEndpointChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.localEndpoint.selectedEndpoint', { endpoint: localEndpointChat.endpointUrl || t('chat.console.status.none') }) }}</div>
          <div>{{ tf('chat.console.provider.localEndpoint.selectedModel', { model: selectedModelFor('local_endpoint') || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.localEndpoint.boundary') }}</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            :disabled="disabled || !localEndpointChat.enabled"
            data-testid="local-endpoint-chat-disable"
            @click="emit('updateLocalEndpointChatEnabled', false)"
          >
            {{ t('chat.console.provider.localEndpoint.disable') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="local-endpoint-chat-clear"
            @click="emit('clearLocalEndpointChat')"
          >
            {{ t('chat.console.provider.localEndpoint.clear') }}
          </button>
        </div>
      </section>

      <section
        v-if="!(isGoogleImageGenerationModel && !googleImageGenerationPolicy.supportsThoughtSummaries && googleImageGenerationPolicy.thinkingLevels.length === 0)"
        class="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('chat.console.section.reasoning') }}</div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="isOpenAIResponsesSelected ? openAIResponsesReasoningSupported : isGoogleAIStudioSelected ? googleThinkingEnabled : props.sessionConfig.reasoning.enabled"
              :disabled="disabled || isOpenAIResponsesSelected || isGoogleImageGenerationModel || (isGoogleAIStudioSelected && googleThinkingCapability.kind === 'unsupported')"
              data-testid="session-reasoning-enabled"
              @change="isOpenAIResponsesSelected ? null : isGoogleAIStudioSelected ? onGoogleThinkingEnabledChange(($event.target as HTMLInputElement).checked) : emit('updateReasoningEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div v-if="isOpenAIResponsesSelected" class="space-y-2" data-testid="session-openai-responses-reasoning-controls">
          <div class="space-y-1">
            <div class="text-xs font-medium text-gray-600">{{ t('chat.generationParams.reasoning.effort') }}</div>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="option in openAIResponsesReasoningOptions"
                :key="option"
                type="button"
                class="rounded-md border px-2 py-1.5 text-sm"
                :class="chipClass(openAIResponsesReasoningValue === option)"
                :disabled="disabled || !openAIResponsesReasoningSupported"
                @click="onOpenAIResponsesReasoningSelect(option)"
              >
                {{ formatOpenAIResponsesReasoningOption(option) }}
              </button>
            </div>
          </div>
          <div class="space-y-1" data-testid="session-openai-responses-reasoning-summary-controls">
            <div class="text-xs font-medium text-gray-600">{{ t('chat.generationParams.reasoning.summary') }}</div>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="option in openAIResponsesReasoningSummaryOptions"
                :key="option"
                type="button"
                class="rounded-md border px-2 py-1.5 text-sm"
                :class="chipClass(openAIResponsesReasoningSummaryValue === option)"
                :disabled="disabled || !openAIResponsesReasoningSupported"
                @click="onOpenAIResponsesReasoningSummarySelect(option)"
              >
                {{ formatOpenAIResponsesReasoningSummaryOption(option) }}
              </button>
            </div>
          </div>
          <div
            v-if="!openAIResponsesReasoningSupported"
            class="text-xs text-gray-500"
            data-testid="session-openai-responses-reasoning-unsupported"
          >
            {{ t('chat.console.reasoning.openAIResponsesUnsupported') }}
          </div>
        </div>
        <div v-else-if="!isGoogleAIStudioSelected" class="grid grid-cols-3 gap-2">
          <button
            v-for="effort in genericReasoningEffortOptions"
            :key="effort"
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.reasoning.effort === effort)"
            :disabled="disabled || !props.sessionConfig.reasoning.enabled"
            @click="emit('updateReasoningEffort', effort)"
          >
            {{ formatReasoningEffort(effort) }}
          </button>
        </div>
        <div v-else-if="!isGoogleImageGenerationModel && googleThinkingCapability.kind === 'budget'" class="space-y-2" data-testid="session-google-thinking-budget-controls">
          <label class="flex items-center justify-between gap-2 text-sm text-gray-700">
            <span>{{ t('chat.console.reasoning.thinkingBudget') }}</span>
            <select
              class="w-40 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 disabled:opacity-50"
              :value="googleThinkingBudgetMode"
              :disabled="disabled"
              data-testid="session-google-thinking-budget-mode"
              @change="onGoogleThinkingBudgetModeChange"
            >
              <option value="default">{{ tf('chat.console.reasoning.default', { value: googleThinkingCapability.defaultBudgetMode === 'dynamic' ? t('chat.console.reasoning.dynamic') : t('chat.console.reasoning.off') }) }}</option>
              <option v-if="googleThinkingCapability.allowDynamic" value="dynamic">{{ t('chat.console.reasoning.dynamic') }}</option>
              <option v-if="googleThinkingCapability.allowOff" value="off">{{ t('chat.console.reasoning.off') }}</option>
              <option value="fixed">{{ t('chat.console.reasoning.fixedBudget') }}</option>
            </select>
          </label>
          <label v-if="googleThinkingBudgetMode === 'fixed'" class="flex items-center justify-between gap-2 text-sm text-gray-700">
            <span>{{ t('chat.console.reasoning.fixedBudget') }}</span>
            <input
              type="number"
              class="w-32 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 disabled:opacity-50"
              :min="googleThinkingCapability.minBudget"
              :max="googleThinkingCapability.maxBudget"
              :value="googleThinkingBudgetInput"
              :disabled="disabled"
              data-testid="session-google-thinking-budget"
              @input="onGoogleThinkingBudgetChange"
            />
          </label>
          <div v-if="googleThinkingBudgetMode === 'fixed'" class="text-xs text-gray-500">
            {{ tf('chat.console.reasoning.allowedRange', { min: googleThinkingCapability.minBudget, max: googleThinkingCapability.maxBudget }) }}
          </div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="googleThinkingConfig.includeThoughts === true"
              :disabled="disabled"
              data-testid="session-google-thinking-include-thoughts"
              @change="onGoogleThinkingIncludeThoughtsChange"
            />
            {{ t('chat.console.reasoning.includeThoughts') }}
          </label>
        </div>
        <div v-else-if="isGoogleImageGenerationModel && googleImageGenerationPolicy.thinkingLevels.length > 0" class="space-y-2" data-testid="session-google-thinking-level-controls">
          <label class="flex items-center justify-between gap-2 text-sm text-gray-700">
            <span>{{ t('chat.console.reasoning.thinkingLevel') }}</span>
            <select
              class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 disabled:opacity-50"
              :value="googleImageThinkingLevelSelection"
              :disabled="disabled"
              data-testid="session-google-thinking-level"
              @change="onGoogleThinkingLevelChange"
            >
              <option value="default">{{ tf('chat.console.reasoning.default', { value: googleImageDefaultThinkingLevel }) }}</option>
              <option v-for="level in googleImageGenerationPolicy.thinkingLevels" :key="level" :value="level">{{ level }}</option>
            </select>
          </label>
          <label v-if="googleImageGenerationPolicy.supportsThoughtSummaries" class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="googleThinkingConfig.includeThoughts === true"
              :disabled="disabled"
              data-testid="session-google-thinking-include-thoughts"
              @change="onGoogleThinkingIncludeThoughtsChange"
            />
            {{ t('chat.console.reasoning.includeThoughts') }}
          </label>
          <div class="text-xs text-gray-500" data-testid="session-google-thinking-provider-managed">
            {{ t('chat.console.reasoning.geminiImageProviderManaged') }}
          </div>
        </div>
        <div v-else-if="isGoogleImageGenerationModel && (googleImageGenerationPolicy.supportsThoughtSummaries || googleImageGenerationPolicy.thinkingLevels.length > 0)" class="space-y-2" data-testid="session-google-thinking-provider-managed-controls">
          <label v-if="googleImageGenerationPolicy.supportsThoughtSummaries" class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="googleThinkingConfig.includeThoughts === true"
              :disabled="disabled"
              data-testid="session-google-thinking-include-thoughts"
              @change="onGoogleThinkingIncludeThoughtsChange"
            />
            {{ t('chat.console.reasoning.includeThoughts') }}
          </label>
          <div class="text-xs text-gray-500" data-testid="session-google-thinking-provider-managed">
            {{ t('chat.console.reasoning.geminiImageProviderManaged') }}
          </div>
        </div>
        <div v-else-if="isGoogleImageGenerationModel" class="text-xs text-gray-500" data-testid="session-google-thinking-unsupported">
          {{ t('chat.console.reasoning.geminiUnsupported') }}
        </div>
        <div v-else-if="googleThinkingCapability.kind === 'level'" class="space-y-2" data-testid="session-google-thinking-level-controls">
          <label class="flex items-center justify-between gap-2 text-sm text-gray-700">
            <span>{{ t('chat.console.reasoning.thinkingLevel') }}</span>
            <select
              class="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 disabled:opacity-50"
              :value="googleThinkingLevelSelection"
              :disabled="disabled"
              data-testid="session-google-thinking-level"
              @change="onGoogleThinkingLevelChange"
            >
              <option value="default">{{ tf('chat.console.reasoning.default', { value: googleThinkingCapability.defaultLevel }) }}</option>
              <option v-for="level in googleThinkingCapability.levels" :key="level" :value="level">{{ googleThinkingLevelLabel(level) }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="googleThinkingConfig.includeThoughts === true"
              :disabled="disabled"
              data-testid="session-google-thinking-include-thoughts"
              @change="onGoogleThinkingIncludeThoughtsChange"
            />
            {{ t('chat.console.reasoning.includeThoughts') }}
          </label>
        </div>
        <div v-else class="text-xs text-gray-500" data-testid="session-google-thinking-unsupported">
          {{ t('chat.console.reasoning.geminiUnsupported') }}
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('chat.console.section.webSearch') }}</div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="props.sessionConfig.webSearch.enabled"
              :disabled="disabled"
              @change="emit('updateWebSearchEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
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
            {{ formatWebSearchLevel('low') }}
          </button>
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.webSearch.level === 'high')"
            :disabled="disabled || !props.sessionConfig.webSearch.enabled"
            @click="emit('updateWebSearchLevel', 'high')"
          >
            {{ formatWebSearchLevel('high') }}
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
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('chat.console.section.generationParams') }}</div>
        <GenerationParamsSettingsEditor
          :model-value="props.sessionConfig.generationParams.detail"
          :disabled="disabled"
          :resolved="props.generationParamsResolved"
          :profile="generationParamsProfile"
          :model-id="generationParamsModelId"
          :capability-projection="props.capabilityProjection"
          :collapsible="false"
          compact
          @update:model-value="emit('updateGenerationParamsLayer', $event)"
        />
      </section>

      <section class="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('chat.console.section.imageGeneration') }}</div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="effectiveImageGenerationEnabled"
              :disabled="disabled || isGoogleImageGenerationModel"
              data-testid="session-image-generation-enabled"
              @change="emit('updateImageGenerationEnabled', isGoogleImageGenerationModel ? true : ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div v-if="showImageGenerationSizeControl" class="grid grid-cols-3 gap-2">
          <button
            v-for="resolution in imageGenerationSizeOptions"
            :key="resolution"
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(effectiveImageGenerationResolution === resolution)"
            :disabled="disabled || !effectiveImageGenerationEnabled || lockImageGenerationSizeControl"
            @click="emit('updateImageGenerationResolution', resolution)"
          >
            {{ resolution }}
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="ratio in imageGenerationAspectRatioOptions"
            :key="ratio"
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(effectiveImageGenerationAspectRatio === ratio)"
            :disabled="disabled || !effectiveImageGenerationEnabled"
            @click="emit('updateImageGenerationAspectRatio', ratio)"
          >
            {{ ratio }}
          </button>
        </div>
        <ImageGenerationSettingsEditor
          :model-value="imageValue"
          :disabled="disabled || !effectiveImageGenerationEnabled"
          :image-size-options="imageGenerationSizeOptions"
          :aspect-ratio-options="imageGenerationAspectRatioOptions"
          :output-mode-options="imageGenerationOutputModeOptions"
          :show-image-size-control="showImageGenerationSizeControl"
          :lock-image-size-control="lockImageGenerationSizeControl"
          @update:model-value="emit('updateImageGeneration', { ...$event, enabled: effectiveImageGenerationEnabled })"
        />
        <div
          v-if="showOpenRouterImageEndpointControls"
          class="space-y-3 rounded-md border border-gray-200 bg-white p-3"
          data-testid="openrouter-image-endpoint-controls"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-medium text-gray-800">{{ t('chat.console.imageEndpoint.title') }}</div>
              <div class="text-xs text-gray-500">{{ t('chat.console.imageEndpoint.description') }}</div>
            </div>
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="disabled || props.openRouterImageEndpointSelectionLoading"
              data-testid="openrouter-image-endpoint-refresh"
              @click="emit('refreshOpenRouterImageEndpoints')"
            >
              {{ props.openRouterImageEndpointSelectionLoading ? t('chat.console.imageEndpoint.loading') : t('chat.console.imageEndpoint.refresh') }}
            </button>
          </div>
          <div v-if="props.openRouterImageEndpointSelectionError" class="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {{ props.openRouterImageEndpointSelectionError }}
          </div>
          <div v-if="!openRouterImageEndpointState" class="text-xs text-gray-500">
            {{ t('chat.console.imageEndpoint.loadHint') }}
          </div>
          <template v-else>
            <div class="space-y-2">
              <button
                v-for="candidate in openRouterImageEndpointState.candidates"
                :key="candidate.providerTag"
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm"
                :class="candidate.bound ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'"
                :disabled="disabled || props.openRouterImageEndpointSelectionLoading || !candidate.eligible"
                :data-testid="`openrouter-image-endpoint-${candidate.providerTag}`"
                @click="emit('selectOpenRouterImageEndpoint', candidate.providerTag)"
              >
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ candidate.providerName }}</span>
                  <code class="block truncate text-[11px] opacity-75">{{ candidate.providerTag }}</code>
                </span>
                <span class="shrink-0 text-xs">
                  {{ candidate.bound ? t('chat.console.imageEndpoint.bound') : candidate.eligible ? t('chat.console.imageEndpoint.select') : t('chat.console.imageEndpoint.unsupported') }}
                </span>
              </button>
            </div>
            <div class="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
              <label class="space-y-1 text-xs text-gray-600">
                <span>{{ t('chat.console.imageEndpoint.refreshAfter') }}</span>
                <select
                  class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800"
                  :value="openRouterImageEndpointState.settings.refreshAfterMs"
                  :disabled="disabled || props.openRouterImageEndpointSelectionLoading"
                  @change="updateOpenRouterImageFreshness('refreshAfterMs', $event)"
                >
                  <option
                    v-for="value in openRouterImageRefreshPresets"
                    :key="value"
                    :value="value"
                    :disabled="value >= openRouterImageEndpointState.settings.hardExpireAfterMs"
                  >{{ formatFreshnessDuration(value) }}</option>
                </select>
              </label>
              <label class="space-y-1 text-xs text-gray-600">
                <span>{{ t('chat.console.imageEndpoint.hardExpireAfter') }}</span>
                <select
                  class="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800"
                  :value="openRouterImageEndpointState.settings.hardExpireAfterMs"
                  :disabled="disabled || props.openRouterImageEndpointSelectionLoading"
                  @change="updateOpenRouterImageFreshness('hardExpireAfterMs', $event)"
                >
                  <option
                    v-for="value in openRouterImageHardExpiryPresets"
                    :key="value"
                    :value="value"
                    :disabled="value <= openRouterImageEndpointState.settings.refreshAfterMs"
                  >{{ formatFreshnessDuration(value) }}</option>
                </select>
              </label>
            </div>
          </template>
        </div>
      </section>

      <section class="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <button
          type="button"
          class="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          :disabled="props.disabled"
          @click="emit('openSettings')"
        >
          {{ t('chat.console.common.openGlobalSettings') }}
        </button>
      </section>
    </div>
  </div>
</template>

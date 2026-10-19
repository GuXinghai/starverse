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
} from '@/next/provider/gemini/geminiThinkingControl'
import {
  isProjectedGeminiImageModelV2,
  isProjectedGeminiThinkingBudgetValid,
  projectGeminiImageGenerationPolicyV2,
  projectImageGenerationControlDomainsV2,
  projectGeminiThinkingCapabilityV2,
  projectAnthropicThinkingCapabilityV2,
  projectOpenAIResponsesThinkingCapabilityV2,
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
import type { GenerationControlsProjectionV2 } from '@/core/generation-v2/capability/resolvedCapabilityV2'
import WebSearchSettingsEditor from './WebSearchSettingsEditor.vue'
import { projectGenerationV2WebSearchControls, webSearchBindingForRouteV2 } from '../app/generationV2WebSearchProjection'
import GenerationParamsSettingsEditor from './GenerationParamsSettingsEditor.vue'
import ImageGenerationSettingsEditor from './ImageGenerationSettingsEditor.vue'
import ModelFactControlReason from './ModelFactControlReason.vue'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import { modelFactControlReasonV1, type ModelFactControlExplanationsV1 } from '../app/modelFactControlExplanations'
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
  controlExplanations?: ModelFactControlExplanationsV1 | null
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
  (e: 'inspectModelFactsPath', path: string): void
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
const isAnthropicSelected = computed(() => selectedProvider.value === 'anthropic_messages')
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
const webSearchControls = computed(() => projectGenerationV2WebSearchControls(props.capabilityProjection,
  webSearchBindingForRouteV2(props.sessionConfig.routeSelection, props.sessionConfig.imageGeneration.enabled)))
const imageGenerationControlDomains = computed(() => projectImageGenerationControlDomainsV2(props.capabilityProjection))
const isGoogleImageGenerationModel = computed(() => isGoogleAIStudioSelected.value && isProjectedGeminiImageModelV2(props.capabilityProjection))
const googleThinkingCapability = computed(() => projectGeminiThinkingCapabilityV2(props.capabilityProjection, selectedModelIdentity.value))
const anthropicThinkingCapability = computed(() => projectAnthropicThinkingCapabilityV2(
  props.capabilityProjection, props.sessionConfig.reasoning.effort,
))
const canInspectModelFacts = computed(() => props.controlExplanations?.subject != null)
const reasoningEffortReason = computed(() => modelFactControlReasonV1(props.controlExplanations, 'reasoning.effort'))
const googleThinkingReason = computed(() =>
  modelFactControlReasonV1(props.controlExplanations, ['reasoning.mode', 'providerExtension.thinkingLevel']))
const imageGenerationOptionsReason = computed(() =>
  modelFactControlReasonV1(props.controlExplanations, ['image.mode', 'image.aspectRatio']))
const reasoningSectionUnavailable = computed(() =>
  isGoogleImageGenerationModel.value && !googleImageGenerationPolicy.value.supportsThoughtSummaries &&
    googleImageGenerationPolicy.value.thinkingLevels.length === 0)
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
      : capability.kind === 'budget' ? (capability.defaultBudgetMode === 'dynamic' ? -1 : 0) : 0,
    thinkingLevel: typeof level === 'string'
      ? level as GeminiThinkingLevel
      : capability.kind === 'level' ? capability.defaultLevel : '' as GeminiThinkingLevel,
    includeThoughts: isGoogleImageGenerationModel.value ? imageSummaryMode === 'auto' : textIncludeThoughts,
  }
})
const googleThinkingEnabled = computed(() => {
  if (isGoogleImageGenerationModel.value) return googleThinkingCapability.value.required || googleImageGenerationPolicy.value.supportsThoughtSummaries ||
    googleImageGenerationPolicy.value.thinkingLevels.length > 0
  const capability = googleThinkingCapability.value
  if (capability.kind === 'unsupported') return false
  if (capability.required) return true
  const budget = customGenerationParamValue('thinkingBudget')
  if (budget === 0 && capability.allowOff) return false
  const enabled = props.sessionConfig.generationParams.detail?.thinkingEnabled
  if (enabled?.mode === 'custom' && enabled.value === false && capability.allowOff) return false
  return budget !== undefined || capability.defaultEnabled !== false
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
const imageGenerationSizeOptions = computed<readonly Exclude<ChatSessionConfigImageResolution, ''>[]>(() => {
  return imageGenerationControlDomains.value.resolutions.filter(
    (resolution): resolution is Exclude<ChatSessionConfigImageResolution, ''> => resolution !== '')
})
const imageGenerationAspectRatioOptions = computed<readonly ChatSessionConfigAspectRatio[]>(() => {
  return imageGenerationControlDomains.value.aspectRatios
})
const imageGenerationOutputModeOptions = computed(() => {
  return imageGenerationControlDomains.value.outputModes
})
const showImageGenerationSizeControl = computed(() =>
  imageGenerationSizeOptions.value.length > 0
)
const lockImageGenerationSizeControl = computed(() =>
  false
)
const effectiveImageGenerationEnabled = computed(() =>
  isGoogleImageGenerationModel.value || props.sessionConfig.imageGeneration.enabled
)
const effectiveImageGenerationResolution = computed<ChatSessionConfigImageResolution>(() =>
  props.sessionConfig.imageGeneration.resolution !== '' && imageGenerationSizeOptions.value.length > 0 &&
    !imageGenerationSizeOptions.value.includes(props.sessionConfig.imageGeneration.resolution)
    ? imageGenerationSizeOptions.value[0]
    : props.sessionConfig.imageGeneration.resolution
)
const effectiveImageGenerationAspectRatio = computed(() =>
  imageGenerationAspectRatioOptions.value.length > 0 &&
    (
      !props.sessionConfig.imageGeneration.aspectRatio ||
      !imageGenerationAspectRatioOptions.value.includes(props.sessionConfig.imageGeneration.aspectRatio)
    )
    ? imageGenerationAspectRatioOptions.value[0]
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
const openAIResponsesThinkingCapability = computed(() => projectOpenAIResponsesThinkingCapabilityV2(props.capabilityProjection))
const openAIResponsesReasoningEnabled = computed(() => openAIResponsesThinkingCapability.value.required || props.sessionConfig.reasoning.enabled)
const openAIResponsesReasoningControlsEnabled = computed(() => !openAIResponsesThinkingCapability.value.canDisable || props.sessionConfig.reasoning.enabled)
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
  outputMode: props.sessionConfig.imageGeneration.detail?.outputMode ?? imageGenerationOutputModeOptions.value[0] ?? 'auto',
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
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'budget' || !capability.allowOff || capability.required) return
  const enabledValue = enabled
  emit('updateGenerationParamsLayer', {
    ...(props.sessionConfig.generationParams.detail ?? {}),
    thinkingEnabled: { mode: 'custom', value: enabledValue },
    thinkingLevel: { mode: 'omit' },
    thinkingBudget: { mode: 'custom', value: enabledValue ? (capability.allowDynamic ? -1 : capability.minBudget) : 0 },
  })
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
    emit('updateGenerationParamsLayer', { ...current, thinkingEnabled: { mode: 'omit' }, thinkingBudget: { mode: 'omit' }, thinkingLevel: { mode: 'omit' } })
  } else if (mode === 'dynamic') {
    emit('updateGenerationParamsLayer', { ...current, thinkingLevel: { mode: 'omit' }, thinkingEnabled: { mode: 'custom', value: true },
    thinkingBudget: { mode: 'custom', value: -1 } })
  } else if (mode === 'off' && capability.allowOff) {
    emit('updateGenerationParamsLayer', { ...current, thinkingLevel: { mode: 'omit' }, thinkingEnabled: { mode: 'custom', value: false },
    thinkingBudget: { mode: 'custom', value: 0 } })
  } else if (mode === 'fixed') {
    const existing = current.thinkingBudget
    const value = existing?.mode === 'custom' && isProjectedGeminiThinkingBudgetValid(capability, existing.value) && existing.value > 0
      ? existing.value : capability.minBudget
    emit('updateGenerationParamsLayer', { ...current, thinkingEnabled: { mode: 'custom', value: true }, thinkingLevel: { mode: 'omit' }, thinkingBudget: { mode: 'custom', value } })
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
  if (!openAIResponsesReasoningSupported.value || !openAIResponsesReasoningControlsEnabled.value) return
  const current = props.sessionConfig.generationParams.detail ?? {}
  emit('updateGenerationParamsLayer', {
    ...current,
    reasoningEffort: option === 'auto'
      ? { mode: 'omit' }
      : { mode: 'custom', value: option },
  })
}

function formatOpenAIResponsesReasoningSummaryOption(option: OpenAIResponsesReasoningSummarySetting): string {
  return t(`chat.generationParams.reasoning.${option}`)
}

function onOpenAIResponsesReasoningSummarySelect(option: OpenAIResponsesReasoningSummarySetting) {
  if (!openAIResponsesReasoningSupported.value || !openAIResponsesReasoningControlsEnabled.value) return
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
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto px-4 pb-2" data-testid="chat-session-console-scroll">
    <div class="flex flex-col">
      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0">
        <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.section.display') }}</div>
        <div class="sv-segmented w-full">
          <button
            type="button"
            class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
            :aria-pressed="props.reasoningDisplayMode === 'inline'"
            @click="emit('updateReasoningDisplayMode', 'inline')"
          >
            {{ t('chat.console.display.inlineReasoning') }}
          </button>
          <button
            type="button"
            class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
            :aria-pressed="props.reasoningDisplayMode === 'rail'"
            @click="emit('updateReasoningDisplayMode', 'rail')"
          >
            {{ t('chat.console.display.rightRailReasoning') }}
          </button>
        </div>
        <div class="flex flex-col">
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="reasoningPanelDefaultExpanded"
              :disabled="disabled"
              data-testid="session-reasoning-panel-default-expanded"
              @change="emit('updateReasoningPanelDefaultExpanded', ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ t('chat.console.display.expandReasoningWhileThinking') }}</span>
          </label>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="reasoningPanelAutoCollapseAfterReasoning"
              :disabled="disabled"
              data-testid="session-reasoning-panel-auto-collapse-after-reasoning"
              @change="emit('updateReasoningPanelAutoCollapseAfterReasoning', ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ t('chat.console.display.collapseReasoningWhenAnswerStarts') }}</span>
          </label>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0">
        <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.section.model') }}</div>
        <select
          data-testid="session-openrouter-model"
          class="sv-select"
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

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0" data-testid="openrouter-chat-controls">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.provider.openRouter.title') }}</div>
            <div class="sv-meta mt-0.5 wrap-anywhere">{{ openRouterChat.providerLabel }}</div>
          </div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="openRouterChat.enabled"
              :disabled="disabled"
              data-testid="openrouter-chat-enabled"
              @change="emit('updateOpenRouterChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="sv-meta" data-testid="openrouter-chat-warning">
          {{ t('chat.console.provider.openRouter.warning') }}
        </div>
        <div class="sv-meta flex flex-col gap-0.5 wrap-anywhere" data-testid="openrouter-chat-selected-status">
          <div>{{ tf('chat.console.provider.openRouter.status', { status: openRouterChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.openRouter.selectedModel', { model: selectedModelFor(OPENROUTER_PROVIDER_ID) || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.openRouter.notFallback') }}</div>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0" data-testid="openai-responses-chat-controls">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.provider.openAIResponses.title') }}</div>
            <div class="sv-meta mt-0.5 wrap-anywhere">{{ openAIResponsesChat.experimentalLabel }}</div>
          </div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="openAIResponsesChat.enabled"
              :disabled="disabled"
              data-testid="openai-responses-chat-enabled"
              @change="emit('updateOpenAIResponsesChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="sv-meta" data-testid="openai-responses-chat-warning">
          {{ t('chat.console.provider.openAIResponses.warning') }}
        </div>
        <div class="sv-meta flex flex-col gap-0.5 wrap-anywhere" data-testid="openai-responses-chat-selected-status">
          <div>{{ tf('chat.console.provider.openAIResponses.status', { status: openAIResponsesChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.openAIResponses.selectedModel', { model: selectedModelFor('openai_responses') || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.openAIResponses.credentialBridge') }}</div>
        </div>
        <div class="flex flex-col gap-2" data-testid="openai-responses-models-diagnostics">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="sv-label">{{ t('chat.console.provider.openAIResponses.sourceTitle') }}</div>
              <div class="sv-meta wrap-anywhere" data-testid="openai-responses-models-summary">{{ openAIResponsesAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="sv-btn sv-btn-sm w-32 shrink-0"
              :disabled="disabled || openAIResponsesModelAvailability.loading"
              data-testid="openai-responses-models-refresh"
              @click="emit('refreshOpenAIResponsesModels')"
            >
              <UiIcon :name="openAIResponsesModelAvailability.loading ? 'spinner' : 'refresh'" :size="14" />
              {{ openAIResponsesModelAvailability.loading ? t('chat.console.common.refreshing') : t('chat.console.common.refreshModels') }}
            </button>
          </div>
          <div v-if="openAIResponsesAvailabilityFailure" class="sv-notice sv-notice-danger wrap-anywhere" data-testid="openai-responses-models-error">
            {{ networkFailureMessage(openAIResponsesAvailabilityFailure) }}
          </div>
          <div v-if="openAIResponsesAvailabilitySourceDocuments.length > 0" class="sv-meta wrap-anywhere" data-testid="openai-responses-models-source">
            {{ t('chat.console.common.sourceDocs') }}
            <span v-for="sourceDoc in openAIResponsesAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ tf('chat.console.common.sourceObserved', { source: sourceDoc.source, observedAt: formatObservedAt(sourceDoc.observedAtMs) }) }}
            </span>
          </div>
          <div v-for="warning in openAIResponsesAvailabilityWarnings" :key="warning" class="text-xs text-[var(--sv-warning)]" data-testid="openai-responses-model-warning">
            {{ warning }}
          </div>
          <details v-if="openAIResponsesAvailabilityModels.length > 0" class="group" data-testid="openai-responses-models-list">
            <summary class="flex h-7 list-none items-center gap-1 text-[13px] text-gray-700 [&::-webkit-details-marker]:hidden" data-testid="openai-responses-models-toggle">
              <UiIcon name="chevronRight" :size="14" class="shrink-0 transition-transform group-open:rotate-90" />
              {{ tf('chat.console.common.modelListToggle', { count: openAIResponsesAvailabilityModels.length }) }}
            </summary>
            <div class="mt-1 flex flex-col">
              <div
                v-for="modelAvailability in openAIResponsesAvailabilityModels"
                :key="modelAvailability.nativeModelId"
                class="flex flex-col gap-1 py-2 sv-divider-t"
                data-testid="openai-responses-model-row"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <div class="text-[13px] font-medium text-gray-900 wrap-anywhere">{{ modelAvailability.displayName || modelAvailability.nativeModelId }}</div>
                    <div class="sv-meta wrap-anywhere">{{ modelAvailability.nativeModelId }} · {{ modelAvailability.source }} · {{ modelAvailability.confidence }}</div>
                    <div v-if="modelAvailability.ownedBy" class="sv-meta wrap-anywhere">{{ tf('chat.console.common.ownedBy', { owner: modelAvailability.ownedBy }) }}</div>
                    <div v-if="modelAvailability.createdAtSec" class="sv-meta">{{ tf('chat.console.common.created', { createdAt: modelAvailability.createdAtSec }) }}</div>
                    <div class="sv-meta wrap-anywhere">{{ formatOpenAICapabilities(modelAvailability) }}</div>
                  </div>
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm shrink-0"
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
                  class="text-xs text-[var(--sv-warning)]"
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
            class="sv-btn sv-btn-sm"
            :disabled="disabled || !openAIResponsesChat.enabled"
            data-testid="openai-responses-chat-disable"
            @click="emit('updateOpenAIResponsesChatEnabled', false)"
          >
            {{ t('chat.console.provider.openAIResponses.disable') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="disabled"
            data-testid="openai-responses-chat-clear"
            @click="emit('clearOpenAIResponsesChat')"
          >
            {{ t('chat.console.provider.openAIResponses.clear') }}
          </button>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0" data-testid="anthropic-chat-controls">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.provider.anthropic.title') }}</div>
            <div class="sv-meta mt-0.5 wrap-anywhere">{{ anthropicChat.experimentalLabel }}</div>
          </div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="anthropicChat.enabled"
              :disabled="disabled"
              data-testid="anthropic-chat-enabled"
              @change="emit('updateAnthropicChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="sv-meta" data-testid="anthropic-chat-warning">
          {{ t('chat.console.provider.anthropic.warning') }}
        </div>
        <div class="sv-meta flex flex-col gap-0.5 wrap-anywhere" data-testid="anthropic-chat-selected-status">
          <div>{{ tf('chat.console.provider.anthropic.status', { status: anthropicChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.anthropic.selectedModel', { model: selectedModelFor('anthropic_messages') || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.anthropic.credentialBridge') }}</div>
        </div>
        <div class="flex flex-col gap-2" data-testid="anthropic-thinking-display-controls">
          <div class="flex flex-col gap-0.5">
            <div class="sv-label">{{ t('chat.console.provider.anthropic.thinkingDisplay.title') }}</div>
            <div class="sv-meta">
              {{ props.sessionConfig.reasoning.enabled
                ? t('chat.console.provider.anthropic.thinkingDisplay.description')
                : t('chat.console.provider.anthropic.thinkingDisplay.disabledDescription') }}
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <button
              v-for="option in (['provider_default', 'summarized', 'omitted'] as const)"
              :key="option"
              type="button"
              class="sv-btn sv-btn-ghost h-auto w-full flex-col items-start gap-0.5 whitespace-normal px-3 py-2 text-left font-normal"
              :aria-pressed="anthropicChat.thinkingDisplay === option"
              :disabled="disabled || !anthropicChat.enabled || !props.sessionConfig.reasoning.enabled"
              :data-testid="`anthropic-thinking-display-${option}`"
              @click="emit('updateAnthropicThinkingDisplay', option)"
            >
              <span class="text-[13px] font-medium">{{ t(`chat.console.provider.anthropic.thinkingDisplay.options.${option}.label`) }}</span>
              <span class="text-xs leading-4 opacity-80">{{ t(`chat.console.provider.anthropic.thinkingDisplay.options.${option}.description`) }}</span>
            </button>
          </div>
        </div>
        <div class="flex flex-col gap-2" data-testid="anthropic-models-diagnostics">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="sv-label">{{ t('chat.console.provider.anthropic.sourceTitle') }}</div>
              <div class="sv-meta wrap-anywhere" data-testid="anthropic-models-summary">{{ anthropicAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="sv-btn sv-btn-sm w-32 shrink-0"
              :disabled="disabled || anthropicModelAvailability.loading"
              data-testid="anthropic-models-refresh"
              @click="emit('refreshAnthropicModels')"
            >
              <UiIcon :name="anthropicModelAvailability.loading ? 'spinner' : 'refresh'" :size="14" />
              {{ anthropicModelAvailability.loading ? t('chat.console.common.refreshing') : t('chat.console.common.refreshModels') }}
            </button>
          </div>
          <div v-if="anthropicAvailabilityFailure" class="sv-notice sv-notice-danger wrap-anywhere" data-testid="anthropic-models-error">
            {{ networkFailureMessage(anthropicAvailabilityFailure) }}
          </div>
          <div v-if="anthropicAvailabilitySourceDocuments.length > 0" class="sv-meta wrap-anywhere" data-testid="anthropic-models-source">
            {{ t('chat.console.common.sourceDocs') }}
            <span v-for="sourceDoc in anthropicAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ tf('chat.console.common.sourceObserved', { source: sourceDoc.source, observedAt: formatObservedAt(sourceDoc.observedAtMs) }) }}
            </span>
          </div>
          <div v-for="warning in anthropicAvailabilityWarnings" :key="warning" class="text-xs text-[var(--sv-warning)]" data-testid="anthropic-model-warning">
            {{ warning }}
          </div>
          <details v-if="anthropicAvailabilityModels.length > 0" class="group" data-testid="anthropic-models-list">
            <summary class="flex h-7 list-none items-center gap-1 text-[13px] text-gray-700 [&::-webkit-details-marker]:hidden" data-testid="anthropic-models-toggle">
              <UiIcon name="chevronRight" :size="14" class="shrink-0 transition-transform group-open:rotate-90" />
              {{ tf('chat.console.common.modelListToggle', { count: anthropicAvailabilityModels.length }) }}
            </summary>
            <div class="mt-1 flex flex-col">
              <div
                v-for="modelAvailability in anthropicAvailabilityModels"
                :key="modelAvailability.nativeModelId"
                class="flex flex-col gap-1 py-2 sv-divider-t"
                data-testid="anthropic-model-row"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <div class="text-[13px] font-medium text-gray-900 wrap-anywhere">{{ modelAvailability.displayName || modelAvailability.nativeModelId }}</div>
                    <div class="sv-meta wrap-anywhere">{{ modelAvailability.nativeModelId }} · {{ modelAvailability.source }} · {{ modelAvailability.confidence }}</div>
                    <div v-if="modelAvailability.modelType" class="sv-meta">{{ tf('chat.console.common.type', { type: modelAvailability.modelType }) }}</div>
                    <div v-if="modelAvailability.createdAt" class="sv-meta">{{ tf('chat.console.common.created', { createdAt: modelAvailability.createdAt }) }}</div>
                    <div class="sv-meta wrap-anywhere">{{ formatAnthropicCapabilities(modelAvailability) }}</div>
                  </div>
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm shrink-0"
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
                  class="text-xs text-[var(--sv-warning)]"
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
            class="sv-btn sv-btn-sm"
            :disabled="disabled || !anthropicChat.enabled"
            data-testid="anthropic-chat-disable"
            @click="emit('updateAnthropicChatEnabled', false)"
          >
            {{ t('chat.console.provider.anthropic.disable') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="disabled"
            data-testid="anthropic-chat-clear"
            @click="emit('clearAnthropicChat')"
          >
            {{ t('chat.console.provider.anthropic.clear') }}
          </button>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0" data-testid="deepseek-chat-controls">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.provider.deepSeek.title') }}</div>
            <div class="sv-meta mt-0.5 wrap-anywhere">{{ deepSeekChat.experimentalLabel }}</div>
          </div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="deepSeekChat.enabled"
              :disabled="disabled"
              data-testid="deepseek-chat-enabled"
              @change="emit('updateDeepSeekChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.use') }}
          </label>
        </div>
        <div class="sv-meta" data-testid="deepseek-chat-warning">
          {{ t('chat.console.provider.deepSeek.warning') }}
        </div>
        <div class="sv-meta flex flex-col gap-0.5 wrap-anywhere" data-testid="deepseek-chat-selected-status">
          <div>{{ tf('chat.console.provider.deepSeek.status', { status: deepSeekChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.deepSeek.selectedModel', { model: selectedModelFor('deepseek') || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.deepSeek.credentialBridge') }}</div>
        </div>
        <div class="flex flex-col gap-2" data-testid="deepseek-models-diagnostics">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="sv-label">{{ t('chat.console.provider.deepSeek.sourceTitle') }}</div>
              <div class="sv-meta wrap-anywhere" data-testid="deepseek-models-summary">{{ deepSeekAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="sv-btn sv-btn-sm w-32 shrink-0"
              :disabled="disabled || deepSeekModelAvailability.loading"
              data-testid="deepseek-models-refresh"
              @click="emit('refreshDeepSeekModels')"
            >
              <UiIcon :name="deepSeekModelAvailability.loading ? 'spinner' : 'refresh'" :size="14" />
              {{ deepSeekModelAvailability.loading ? t('chat.console.common.refreshing') : t('chat.console.common.refreshModels') }}
            </button>
          </div>
          <div v-if="deepSeekAvailabilityFailure" class="sv-notice sv-notice-danger wrap-anywhere" data-testid="deepseek-models-error">
            {{ networkFailureMessage(deepSeekAvailabilityFailure) }}
          </div>
          <div v-if="deepSeekAvailabilitySourceDocuments.length > 0" class="sv-meta wrap-anywhere" data-testid="deepseek-models-source">
            {{ t('chat.console.common.sourceDocs') }}
            <span v-for="sourceDoc in deepSeekAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ tf('chat.console.common.sourceObserved', { source: sourceDoc.source, observedAt: formatObservedAt(sourceDoc.observedAtMs) }) }}
            </span>
          </div>
          <div v-for="warning in deepSeekAvailabilityWarnings" :key="warning" class="text-xs text-[var(--sv-warning)]" data-testid="deepseek-model-warning">
            {{ warning }}
          </div>
          <details v-if="deepSeekAvailabilityModels.length > 0" class="group" data-testid="deepseek-models-list">
            <summary class="flex h-7 list-none items-center gap-1 text-[13px] text-gray-700 [&::-webkit-details-marker]:hidden" data-testid="deepseek-models-toggle">
              <UiIcon name="chevronRight" :size="14" class="shrink-0 transition-transform group-open:rotate-90" />
              {{ tf('chat.console.common.modelListToggle', { count: deepSeekAvailabilityModels.length }) }}
            </summary>
            <div class="mt-1 flex flex-col">
              <div
                v-for="modelAvailability in deepSeekAvailabilityModels"
                :key="modelAvailability.nativeModelId"
                class="flex flex-col gap-1 py-2 sv-divider-t"
                data-testid="deepseek-model-row"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <div class="text-[13px] font-medium text-gray-900 wrap-anywhere">{{ modelAvailability.displayName || modelAvailability.nativeModelId }}</div>
                    <div class="sv-meta wrap-anywhere">{{ modelAvailability.nativeModelId }} · {{ modelAvailability.source }} · {{ modelAvailability.confidence }}</div>
                    <div class="sv-meta wrap-anywhere">{{ formatDeepSeekCapabilities(modelAvailability) }}</div>
                    <div class="sv-meta wrap-anywhere">{{ formatDeepSeekPricingSeed(modelAvailability) }}</div>
                  </div>
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm shrink-0"
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
                  class="text-xs text-[var(--sv-warning)]"
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
            class="sv-btn sv-btn-sm"
            :disabled="disabled || !deepSeekChat.enabled"
            data-testid="deepseek-chat-disable"
            @click="emit('updateDeepSeekChatEnabled', false)"
          >
            {{ t('chat.console.provider.deepSeek.disable') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="disabled"
            data-testid="deepseek-chat-clear"
            @click="emit('clearDeepSeekChat')"
          >
            {{ t('chat.console.provider.deepSeek.clear') }}
          </button>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0" data-testid="google-ai-studio-chat-controls">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.provider.googleAIStudio.title') }}</div>
            <div class="sv-meta mt-0.5 wrap-anywhere">{{ googleAIStudioChat.experimentalLabel }}</div>
          </div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="googleAIStudioChat.enabled"
              :disabled="disabled"
              data-testid="google-ai-studio-chat-enabled"
              @change="emit('updateGoogleAIStudioChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="sv-meta" data-testid="google-ai-studio-chat-warning">
          {{ t('chat.console.provider.googleAIStudio.warning') }}
        </div>
        <div class="sv-meta flex flex-col gap-0.5 wrap-anywhere" data-testid="google-ai-studio-chat-selected-status">
          <div>{{ tf('chat.console.provider.googleAIStudio.status', { status: googleAIStudioChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.googleAIStudio.selectedModel', { model: selectedModelFor('google_ai_studio') || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.googleAIStudio.credentialBridge') }}</div>
        </div>
        <div class="flex flex-col gap-2" data-testid="google-ai-studio-models-diagnostics">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="sv-label">{{ t('chat.console.provider.googleAIStudio.sourceTitle') }}</div>
              <div class="sv-meta wrap-anywhere" data-testid="google-ai-studio-models-summary">{{ googleAIStudioAvailabilitySummary }}</div>
            </div>
            <button
              type="button"
              class="sv-btn sv-btn-sm w-32 shrink-0"
              :disabled="disabled || googleAIStudioModelAvailability.loading"
              data-testid="google-ai-studio-models-refresh"
              @click="emit('refreshGoogleAIStudioModels')"
            >
              <UiIcon :name="googleAIStudioModelAvailability.loading ? 'spinner' : 'refresh'" :size="14" />
              {{ googleAIStudioModelAvailability.loading ? t('chat.console.common.refreshing') : t('chat.console.common.refreshModels') }}
            </button>
          </div>
          <div v-if="googleAIStudioAvailabilityFailure" class="sv-notice sv-notice-danger wrap-anywhere" data-testid="google-ai-studio-models-error">
            {{ networkFailureMessage(googleAIStudioAvailabilityFailure) }}
          </div>
          <div v-if="googleAIStudioAvailabilitySourceDocuments.length > 0" class="sv-meta wrap-anywhere" data-testid="google-ai-studio-models-source">
            {{ t('chat.console.common.sourceDocs') }}
            <span v-for="sourceDoc in googleAIStudioAvailabilitySourceDocuments" :key="sourceDoc.source" class="mr-1">
              {{ tf('chat.console.common.sourceObserved', { source: sourceDoc.source, observedAt: formatObservedAt(sourceDoc.observedAtMs) }) }}
            </span>
          </div>
          <div v-for="warning in googleAIStudioAvailabilityWarnings" :key="warning" class="text-xs text-[var(--sv-warning)]" data-testid="google-ai-studio-model-warning">
            {{ warning }}
          </div>
          <details v-if="googleAIStudioAvailabilityModels.length > 0" class="group" data-testid="google-ai-studio-models-list">
            <summary class="flex h-7 list-none items-center gap-1 text-[13px] text-gray-700 [&::-webkit-details-marker]:hidden" data-testid="google-ai-studio-models-toggle">
              <UiIcon name="chevronRight" :size="14" class="shrink-0 transition-transform group-open:rotate-90" />
              {{ tf('chat.console.common.modelListToggle', { count: googleAIStudioAvailabilityModels.length }) }}
            </summary>
            <div class="mt-1 flex flex-col">
              <div
                v-for="modelAvailability in googleAIStudioAvailabilityModels"
                :key="modelAvailability.nativeModelId"
                class="flex flex-col gap-1 py-2 sv-divider-t"
                data-testid="google-ai-studio-model-row"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <div class="text-[13px] font-medium text-gray-900 wrap-anywhere">{{ modelAvailability.displayName || modelAvailability.nativeModelId }}</div>
                    <div class="sv-meta wrap-anywhere">{{ modelAvailability.nativeModelId }} · {{ modelAvailability.source }} · {{ modelAvailability.confidence }}</div>
                    <div v-if="modelAvailability.providerModelName" class="sv-meta wrap-anywhere">{{ modelAvailability.providerModelName }}</div>
                    <div class="sv-meta wrap-anywhere">{{ formatGeminiCapabilities(modelAvailability) }}</div>
                  </div>
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm shrink-0"
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
                  class="text-xs text-[var(--sv-warning)]"
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
            class="sv-btn sv-btn-sm"
            :disabled="disabled || !googleAIStudioChat.enabled"
            data-testid="google-ai-studio-chat-disable"
            @click="emit('updateGoogleAIStudioChatEnabled', false)"
          >
            {{ t('chat.console.provider.googleAIStudio.disable') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="disabled"
            data-testid="google-ai-studio-chat-clear"
            @click="emit('clearGoogleAIStudioChat')"
          >
            {{ t('chat.console.provider.googleAIStudio.clear') }}
          </button>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0" data-testid="lm-studio-chat-controls">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="sv-label text-[13px] text-gray-900">{{ t('settings.lmStudio.title') }}</div>
            <div class="sv-meta mt-0.5 wrap-anywhere">{{ lmStudioChat.experimentalLabel }}</div>
          </div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="lmStudioChat.enabled"
              :disabled="disabled"
              data-testid="lm-studio-chat-enabled"
              @change="emit('updateLMStudioChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.enabled') }}
          </label>
        </div>
        <label class="flex flex-col gap-1.5">
          <span class="sv-label">{{ t('settings.lmStudio.endpointUrl') }}</span>
          <input
            class="sv-input"
            :value="lmStudioChat.endpointUrl"
            :disabled="disabled || !lmStudioChat.enabled"
            placeholder="http://127.0.0.1:1234"
            data-testid="lm-studio-endpoint-url"
            @input="emit('updateLMStudioEndpointUrl', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <div class="flex flex-col gap-2">
          <div class="sv-label">{{ t('settings.lmStudio.chatMode') }}</div>
          <div class="sv-segmented w-full">
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="lmStudioChat.chatMode === 'openai_compatible'"
              :disabled="disabled || !lmStudioChat.enabled"
              data-testid="lm-studio-chat-mode-openai"
              @click="emit('updateLMStudioChatMode', 'openai_compatible')"
            >
              {{ t('settings.lmStudio.openAICompatible') }}
            </button>
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="lmStudioChat.chatMode === 'native_rest'"
              disabled
              :title="t('settings.lmStudio.modeUnavailable')"
              aria-disabled="true"
              data-testid="lm-studio-chat-mode-native"
              @click="emit('updateLMStudioChatMode', 'native_rest')"
            >
              {{ t('settings.lmStudio.nativeRest') }}
            </button>
          </div>
          <div class="sv-segmented w-full">
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="lmStudioChat.openAICompatiblePreferredEndpoint === 'chat_completions'"
              disabled
              :title="t('settings.lmStudio.modeUnavailable')"
              aria-disabled="true"
              data-testid="lm-studio-openai-endpoint-chat-completions"
              @click="emit('updateLMStudioOpenAICompatiblePreferredEndpoint', 'chat_completions')"
            >
              /v1/chat/completions
            </button>
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="lmStudioChat.openAICompatiblePreferredEndpoint === 'responses'"
              :disabled="disabled || !lmStudioChat.enabled || lmStudioChat.chatMode !== 'openai_compatible'"
              data-testid="lm-studio-openai-endpoint-responses"
              @click="emit('updateLMStudioOpenAICompatiblePreferredEndpoint', 'responses')"
            >
              /v1/responses
            </button>
          </div>
        </div>
        <div class="flex flex-col">
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="lmStudioChat.nativeRestControls.diagnosticsEnabled"
              :disabled="disabled"
              data-testid="lm-studio-diagnostics-enabled"
              @change="emit('updateLMStudioNativeRestControl', 'diagnosticsEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.nativeRestDiagnostics') }}
          </label>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="lmStudioChat.nativeRestControls.manualLoadUnloadEnabled"
              :disabled="disabled"
              data-testid="lm-studio-manual-load-unload-enabled"
              @change="emit('updateLMStudioNativeRestControl', 'manualLoadUnloadEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.manualLoadUnload') }}
          </label>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="lmStudioChat.nativeRestControls.autoLoadBeforeSendEnabled"
              :disabled="disabled"
              data-testid="lm-studio-auto-load-enabled"
              @change="emit('updateLMStudioNativeRestControl', 'autoLoadBeforeSendEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.autoLoadBeforeSend') }}
          </label>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="lmStudioChat.nativeRestControls.autoUnloadAfterSendEnabled"
              :disabled="disabled"
              data-testid="lm-studio-auto-unload-after-send-enabled"
              @change="emit('updateLMStudioNativeRestControl', 'autoUnloadAfterSendEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.autoUnloadAfterSend') }}
          </label>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="lmStudioChat.nativeRestControls.autoUnloadAfterIdleEnabled === true"
              :disabled="disabled"
              data-testid="lm-studio-auto-unload-after-idle-enabled"
              @change="emit('updateLMStudioNativeRestControl', 'autoUnloadAfterIdleEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.lmStudio.autoUnloadAfterIdleDeferred') }}
          </label>
        </div>
        <div
          v-if="lmStudioChat.enabled && (lmStudioChat.chatMode !== 'openai_compatible' || lmStudioChat.openAICompatiblePreferredEndpoint !== 'responses')"
          class="sv-notice sv-notice-danger"
          role="alert"
          data-testid="lm-studio-saved-mode-unavailable"
        >
          {{ t('settings.lmStudio.savedModeUnavailable') }}
        </div>
        <div class="sv-meta flex flex-col gap-0.5 wrap-anywhere" data-testid="lm-studio-selected-status">
          <div>{{ tf('settings.lmStudio.chatStatus', { status: lmStudioChatStatusLabel }) }}</div>
          <div>{{ t('settings.lmStudio.endpoint') }}: {{ lmStudioChat.endpointUrl || t('settings.lmStudio.none') }}</div>
          <div>{{ t('settings.lmStudio.selectedModel') }}: {{ selectedModelFor('lm_studio') || t('settings.lmStudio.none') }}</div>
          <div>{{ t('settings.lmStudio.mode') }}: {{ lmStudioChat.chatMode }} · {{ t('settings.lmStudio.openAIEndpoint') }}: {{ lmStudioChat.openAICompatiblePreferredEndpoint }}</div>
          <div>{{ t('settings.lmStudio.boundarySummary') }}</div>
        </div>
        <div class="flex flex-col gap-2" data-testid="lm-studio-diagnostics">
          <div class="flex flex-col gap-0.5">
            <div class="sv-label">{{ t('settings.lmStudio.controlPlane') }}</div>
            <div v-if="lmStudioProbeResult?.ok" class="sv-meta wrap-anywhere" data-testid="lm-studio-probe-summary">
              {{ t('settings.lmStudio.nativeProbeLabel') }}={{ formatLMStudioAvailability(lmStudioProbeResult.diagnostics.nativeRestAvailable) }};
              {{ t('settings.lmStudio.openAIProbeLabel') }}={{ formatLMStudioAvailability(lmStudioProbeResult.diagnostics.openAICompatibleAvailable) }}
            </div>
            <div v-else class="sv-meta" data-testid="lm-studio-probe-summary">{{ t('settings.lmStudio.notProbed') }}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="sv-btn sv-btn-sm min-w-[5.5rem]"
              :disabled="disabled || !lmStudioChat.enabled || !lmStudioChat.nativeRestControls.diagnosticsEnabled || lmStudioProbeLoading || !lmStudioBridgeAvailable"
              data-testid="lm-studio-probe"
              @click="probeLMStudio()"
            >
              {{ lmStudioProbeLoading ? t('settings.lmStudio.probing') : t('settings.lmStudio.probe') }}
            </button>
            <button
              type="button"
              class="sv-btn sv-btn-sm"
              :disabled="disabled || !lmStudioChat.enabled || !lmStudioChat.nativeRestControls.manualLoadUnloadEnabled || lmStudioActionLoading || !selectedModelFor('lm_studio')"
              data-testid="lm-studio-load-model"
              @click="loadLMStudioSelectedModel"
            >
              {{ t('settings.lmStudio.load') }}
            </button>
            <button
              type="button"
              class="sv-btn sv-btn-sm"
              :disabled="disabled || !lmStudioChat.enabled || !lmStudioChat.nativeRestControls.manualLoadUnloadEnabled || lmStudioActionLoading || !lmStudioSelectedInstanceId"
              data-testid="lm-studio-unload-model"
              @click="unloadLMStudioSelectedModel"
            >
              {{ t('settings.lmStudio.unload') }}
            </button>
          </div>
          <div v-if="lmStudioProbeResult?.ok" class="sv-meta flex flex-col gap-0.5 wrap-anywhere" data-testid="lm-studio-probe-result">
            <div data-testid="lm-studio-native-status">{{ t('settings.lmStudio.nativeRest') }}: {{ lmStudioProbeResult.diagnostics.nativeRestAvailable ? t('settings.lmStudio.available') : lmStudioProbeResult.diagnostics.nativeRest.message }}</div>
            <div data-testid="lm-studio-openai-status">{{ t('settings.lmStudio.openAICompatible') }}: {{ lmStudioProbeResult.diagnostics.openAICompatibleAvailable ? t('settings.lmStudio.available') : lmStudioProbeResult.diagnostics.openAICompatible.message }}</div>
            <div data-testid="lm-studio-models">{{ t('settings.lmStudio.models') }}: {{ formatLMStudioModels(lmStudioNativeModels) }}</div>
            <details v-if="lmStudioNativeModels.length > 0" class="group" data-testid="lm-studio-model-use-list">
              <summary class="flex h-7 list-none items-center gap-1 text-[13px] text-gray-700 [&::-webkit-details-marker]:hidden" data-testid="lm-studio-model-use-toggle">
                <UiIcon name="chevronRight" :size="14" class="shrink-0 transition-transform group-open:rotate-90" />
                {{ tf('chat.console.common.modelListToggle', { count: lmStudioNativeModels.length }) }}
              </summary>
              <div class="mt-1 flex flex-wrap gap-1.5">
                <button
                  v-for="modelInfo in lmStudioNativeModels"
                  :key="modelInfo.key"
                  type="button"
                  class="sv-btn sv-btn-sm max-w-full"
                  :disabled="disabled"
                  data-testid="lm-studio-model-use"
                  @click="selectProviderModel('lm_studio', modelInfo.key)"
                >
                  <span class="truncate">{{ modelInfo.displayName || modelInfo.key }}</span>
                </button>
              </div>
            </details>
          </div>
          <div v-else-if="lmStudioProbeResult && !lmStudioProbeResult.ok" class="sv-notice sv-notice-danger wrap-anywhere" data-testid="lm-studio-probe-error">
            {{ networkFailureMessage(lmStudioProbeResult) }}
          </div>
          <div v-if="lmStudioActionResult" class="sv-meta wrap-anywhere" data-testid="lm-studio-action-result">{{ lmStudioActionResult }}</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="disabled || !lmStudioChat.enabled"
            data-testid="lm-studio-chat-disable"
            @click="emit('updateLMStudioChatEnabled', false)"
          >
            {{ t('settings.lmStudio.disable') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="disabled"
            data-testid="lm-studio-chat-clear"
            @click="emit('clearLMStudioChat')"
          >
            {{ t('settings.lmStudio.clearSettings') }}
          </button>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0" data-testid="ollama-chat-controls">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="sv-label text-[13px] text-gray-900">{{ t('settings.ollama.title') }}</div>
            <div class="sv-meta mt-0.5 wrap-anywhere">{{ ollamaChat.experimentalLabel }}</div>
          </div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="ollamaChat.enabled"
              :disabled="disabled"
              data-testid="ollama-chat-enabled"
              @change="emit('updateOllamaChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.enabled') }}
          </label>
        </div>
        <label class="flex flex-col gap-1.5">
          <span class="sv-label">{{ t('settings.ollama.endpointUrl') }}</span>
          <input
            class="sv-input"
            :value="ollamaChat.endpointUrl"
            :disabled="disabled || !ollamaChat.enabled"
            placeholder="http://127.0.0.1:11434"
            data-testid="ollama-endpoint-url"
            @input="emit('updateOllamaEndpointUrl', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <div class="flex flex-col gap-2">
          <div class="sv-label">{{ t('settings.ollama.chatMode') }}</div>
          <div class="sv-segmented w-full">
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="ollamaChat.chatMode === 'native_rest'"
              :disabled="disabled || !ollamaChat.enabled"
              data-testid="ollama-chat-mode-native"
              @click="emit('updateOllamaChatMode', 'native_rest')"
            >
              {{ t('settings.ollama.nativeRest') }}
            </button>
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="ollamaChat.chatMode === 'openai_compatible'"
              disabled
              :title="t('settings.ollama.modeUnavailable')"
              aria-disabled="true"
              data-testid="ollama-chat-mode-openai"
              @click="emit('updateOllamaChatMode', 'openai_compatible')"
            >
              {{ t('settings.ollama.openAICompatible') }}
            </button>
          </div>
          <div class="sv-segmented w-full">
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="ollamaChat.nativeRestPreferredEndpoint === 'chat'"
              :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest'"
              data-testid="ollama-native-endpoint-chat"
              @click="emit('updateOllamaNativeRestPreferredEndpoint', 'chat')"
            >
              /api/chat
            </button>
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="ollamaChat.nativeRestPreferredEndpoint === 'generate'"
              disabled
              :title="t('settings.ollama.modeUnavailable')"
              aria-disabled="true"
              data-testid="ollama-native-endpoint-generate"
              @click="emit('updateOllamaNativeRestPreferredEndpoint', 'generate')"
            >
              /api/generate
            </button>
          </div>
          <div class="sv-segmented w-full">
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="ollamaChat.openAICompatiblePreferredEndpoint === 'chat_completions'"
              disabled
              :title="t('settings.ollama.modeUnavailable')"
              aria-disabled="true"
              data-testid="ollama-openai-endpoint-chat-completions"
              @click="emit('updateOllamaOpenAICompatiblePreferredEndpoint', 'chat_completions')"
            >
              /v1/chat/completions
            </button>
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="ollamaChat.openAICompatiblePreferredEndpoint === 'responses'"
              disabled
              :title="t('settings.ollama.modeUnavailable')"
              aria-disabled="true"
              data-testid="ollama-openai-endpoint-responses"
              @click="emit('updateOllamaOpenAICompatiblePreferredEndpoint', 'responses')"
            >
              /v1/responses
            </button>
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <div class="sv-label">V2 model contract · thinking wire</div>
          <div class="sv-segmented w-full">
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="ollamaChat.thinkingControl === 'boolean'"
              :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest' || ollamaChat.nativeRestPreferredEndpoint !== 'chat'"
              data-testid="ollama-profile-thinking-boolean"
              @click="emit('updateOllamaProfileCapability', 'thinkingControl', 'boolean')"
            >think: boolean</button>
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="ollamaChat.thinkingControl === 'effort'"
              :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest' || ollamaChat.nativeRestPreferredEndpoint !== 'chat'"
              data-testid="ollama-profile-thinking-effort"
              @click="emit('updateOllamaProfileCapability', 'thinkingControl', 'effort')"
            >think: low / medium / high</button>
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <div class="sv-label">V2 model contract · native tools</div>
          <div class="sv-segmented w-full">
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="ollamaChat.toolsSupported === true"
              :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest' || ollamaChat.nativeRestPreferredEndpoint !== 'chat'"
              data-testid="ollama-profile-tools-supported"
              @click="emit('updateOllamaProfileCapability', 'toolsSupported', true)"
            >tools supported</button>
            <button
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="ollamaChat.toolsSupported === false"
              :disabled="disabled || !ollamaChat.enabled || ollamaChat.chatMode !== 'native_rest' || ollamaChat.nativeRestPreferredEndpoint !== 'chat'"
              data-testid="ollama-profile-tools-unsupported"
              @click="emit('updateOllamaProfileCapability', 'toolsSupported', false)"
            >tools unsupported</button>
          </div>
        </div>
        <div class="flex flex-col">
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="ollamaChat.nativeControls.diagnosticsEnabled"
              :disabled="disabled"
              data-testid="ollama-diagnostics-enabled"
              @change="emit('updateOllamaNativeControl', 'diagnosticsEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.nativeRestDiagnostics') }}
          </label>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="ollamaChat.nativeControls.manualLoadUnloadEnabled"
              :disabled="disabled"
              data-testid="ollama-manual-load-unload-enabled"
              @change="emit('updateOllamaNativeControl', 'manualLoadUnloadEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.manualLoadUnload') }}
          </label>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="ollamaChat.nativeControls.autoLoadBeforeSendEnabled"
              :disabled="disabled"
              data-testid="ollama-auto-load-enabled"
              @change="emit('updateOllamaNativeControl', 'autoLoadBeforeSendEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.autoLoadBeforeSend') }}
          </label>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="ollamaChat.nativeControls.autoUnloadAfterSendEnabled"
              :disabled="disabled"
              data-testid="ollama-auto-unload-after-send-enabled"
              @change="emit('updateOllamaNativeControl', 'autoUnloadAfterSendEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.autoUnloadAfterSend') }}
          </label>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="ollamaChat.nativeControls.autoUnloadAfterIdleEnabled === true"
              :disabled="disabled"
              data-testid="ollama-auto-unload-after-idle-enabled"
              @change="emit('updateOllamaNativeControl', 'autoUnloadAfterIdleEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.ollama.autoUnloadAfterIdleDeferred') }}
          </label>
        </div>
        <div
          v-if="ollamaChat.enabled && (ollamaChat.chatMode !== 'native_rest' || ollamaChat.nativeRestPreferredEndpoint !== 'chat')"
          class="sv-notice sv-notice-danger"
          role="alert"
          data-testid="ollama-saved-mode-unavailable"
        >
          {{ t('settings.ollama.savedModeUnavailable') }}
        </div>
        <div class="sv-meta flex flex-col gap-0.5 wrap-anywhere" data-testid="ollama-selected-status">
          <div>{{ tf('settings.ollama.chatStatus', { status: ollamaChatStatusLabel }) }}</div>
          <div>{{ t('settings.ollama.endpoint') }}: {{ ollamaChat.endpointUrl || t('settings.ollama.none') }}</div>
          <div>{{ t('settings.ollama.selectedModel') }}: {{ selectedModelFor('ollama_local') || t('settings.ollama.none') }}</div>
          <div>{{ t('settings.ollama.mode') }}: {{ ollamaChat.chatMode }} · {{ t('settings.ollama.nativeEndpoint') }}: {{ ollamaChat.nativeRestPreferredEndpoint }} · {{ t('settings.ollama.openAIEndpoint') }}: {{ ollamaChat.openAICompatiblePreferredEndpoint }}</div>
          <div>{{ t('settings.ollama.boundarySummary') }}</div>
        </div>
        <div class="flex flex-col gap-2" data-testid="ollama-diagnostics">
          <div class="flex flex-col gap-0.5">
            <div class="sv-label">{{ t('settings.ollama.controlPlane') }}</div>
            <div v-if="ollamaProbeResult?.ok" class="sv-meta wrap-anywhere" data-testid="ollama-probe-summary">
              {{ t('settings.ollama.nativeProbeLabel') }}={{ formatOllamaAvailability(ollamaProbeResult.diagnostics.nativeRestAvailable) }};
              {{ t('settings.ollama.openAIProbeLabel') }}={{ formatOllamaAvailability(ollamaProbeResult.diagnostics.openAICompatibleAvailable) }}
            </div>
            <div v-else class="sv-meta" data-testid="ollama-probe-summary">{{ t('settings.ollama.notProbed') }}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="sv-btn sv-btn-sm min-w-[5.5rem]"
              :disabled="disabled || !ollamaChat.enabled || !ollamaChat.nativeControls.diagnosticsEnabled || ollamaProbeLoading || !ollamaBridgeAvailable"
              data-testid="ollama-probe"
              @click="probeOllama()"
            >
              {{ ollamaProbeLoading ? t('settings.ollama.probing') : t('settings.ollama.probe') }}
            </button>
            <button
              type="button"
              class="sv-btn sv-btn-sm"
              :disabled="disabled || !ollamaChat.enabled || !ollamaChat.nativeControls.manualLoadUnloadEnabled || ollamaActionLoading || !selectedModelFor('ollama_local')"
              data-testid="ollama-load-model"
              @click="loadOllamaSelectedModel"
            >
              {{ t('settings.ollama.load') }}
            </button>
            <button
              type="button"
              class="sv-btn sv-btn-sm"
              :disabled="disabled || !ollamaChat.enabled || !ollamaChat.nativeControls.manualLoadUnloadEnabled || ollamaActionLoading || !selectedModelFor('ollama_local')"
              data-testid="ollama-unload-model"
              @click="unloadOllamaSelectedModel"
            >
              {{ t('settings.ollama.unload') }}
            </button>
          </div>
          <div v-if="ollamaProbeResult?.ok" class="sv-meta flex flex-col gap-0.5 wrap-anywhere" data-testid="ollama-probe-result">
            <div data-testid="ollama-native-status">{{ t('settings.ollama.nativeRest') }}: {{ ollamaProbeResult.diagnostics.nativeRestAvailable ? t('settings.ollama.available') : ollamaProbeResult.diagnostics.localModels.message }}</div>
            <div data-testid="ollama-openai-status">{{ t('settings.ollama.openAICompatible') }}: {{ ollamaProbeResult.diagnostics.openAICompatibleAvailable ? t('settings.ollama.available') : ollamaProbeResult.diagnostics.openAICompatible.message }}</div>
            <div data-testid="ollama-version">{{ t('settings.ollama.version') }}: {{ ollamaProbeResult.diagnostics.version.ok ? ollamaProbeResult.diagnostics.version.version : ollamaProbeResult.diagnostics.version.message }}</div>
            <div data-testid="ollama-local-models">{{ t('settings.ollama.localModels') }}: {{ formatOllamaModels(ollamaLocalModels) }}</div>
            <div data-testid="ollama-running-models">{{ t('settings.ollama.runningModels') }}: {{ formatOllamaModels(ollamaRunningModels) }}</div>
            <details v-if="ollamaLocalModels.length > 0" class="group" data-testid="ollama-model-use-list">
              <summary class="flex h-7 list-none items-center gap-1 text-[13px] text-gray-700 [&::-webkit-details-marker]:hidden" data-testid="ollama-model-use-toggle">
                <UiIcon name="chevronRight" :size="14" class="shrink-0 transition-transform group-open:rotate-90" />
                {{ tf('chat.console.common.modelListToggle', { count: ollamaLocalModels.length }) }}
              </summary>
              <div class="mt-1 flex flex-wrap gap-1.5">
                <button
                  v-for="modelInfo in ollamaLocalModels"
                  :key="modelInfo.key"
                  type="button"
                  class="sv-btn sv-btn-sm max-w-full"
                  :disabled="disabled"
                  data-testid="ollama-model-use"
                  @click="selectProviderModel('ollama_local', modelInfo.key)"
                >
                  <span class="truncate">{{ modelInfo.displayName || modelInfo.key }}</span>
                </button>
              </div>
            </details>
          </div>
          <div v-else-if="ollamaProbeResult && !ollamaProbeResult.ok" class="sv-notice sv-notice-danger wrap-anywhere" data-testid="ollama-probe-error">
            {{ networkFailureMessage(ollamaProbeResult) }}
          </div>
          <div v-if="ollamaActionResult" class="sv-meta wrap-anywhere" data-testid="ollama-action-result">{{ ollamaActionResult }}</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="disabled || !ollamaChat.enabled"
            data-testid="ollama-chat-disable"
            @click="emit('updateOllamaChatEnabled', false)"
          >
            {{ t('settings.ollama.disable') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="disabled"
            data-testid="ollama-chat-clear"
            @click="emit('clearOllamaChat')"
          >
            {{ t('settings.ollama.clearSettings') }}
          </button>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0" data-testid="local-endpoint-chat-controls">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.provider.localEndpoint.title') }}</div>
            <div class="sv-meta mt-0.5 wrap-anywhere">{{ localEndpointChat.experimentalLabel }}</div>
          </div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="localEndpointChat.enabled"
              :disabled="disabled"
              data-testid="local-endpoint-chat-enabled"
              @change="emit('updateLocalEndpointChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="sv-label">{{ t('chat.console.provider.localEndpoint.endpointUrl') }}</label>
          <input
            class="sv-input"
            :value="localEndpointChat.endpointUrl"
            :disabled="disabled || !localEndpointChat.enabled"
            placeholder="http://localhost:1234/v1"
            data-testid="local-endpoint-chat-url"
            @input="emit('updateLocalEndpointChatUrl', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="sv-meta" data-testid="local-endpoint-chat-warning">
          {{ t('chat.console.provider.localEndpoint.warning') }}
        </div>
        <div class="sv-meta flex flex-col gap-0.5 wrap-anywhere" data-testid="local-endpoint-chat-selected-status">
          <div>{{ tf('chat.console.provider.localEndpoint.status', { status: localEndpointChatStatusLabel }) }}</div>
          <div>{{ tf('chat.console.provider.localEndpoint.selectedEndpoint', { endpoint: localEndpointChat.endpointUrl || t('chat.console.status.none') }) }}</div>
          <div>{{ tf('chat.console.provider.localEndpoint.selectedModel', { model: selectedModelFor('local_endpoint') || t('chat.console.status.none') }) }}</div>
          <div>{{ t('chat.console.provider.localEndpoint.boundary') }}</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="disabled || !localEndpointChat.enabled"
            data-testid="local-endpoint-chat-disable"
            @click="emit('updateLocalEndpointChatEnabled', false)"
          >
            {{ t('chat.console.provider.localEndpoint.disable') }}
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="disabled"
            data-testid="local-endpoint-chat-clear"
            @click="emit('clearLocalEndpointChat')"
          >
            {{ t('chat.console.provider.localEndpoint.clear') }}
          </button>
        </div>
      </section>

      <section
        v-if="reasoningSectionUnavailable"
        class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0"
        data-testid="session-reasoning-unavailable"
      >
        <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.section.reasoning') }}</div>
        <div class="sv-meta">{{ t('chat.console.reasoning.geminiUnsupported') }}</div>
        <ModelFactControlReason
          v-if="googleThinkingReason"
          :reason="googleThinkingReason"
          :can-inspect="canInspectModelFacts"
          data-test-id="session-reasoning-unavailable-reason"
          @inspect="emit('inspectModelFactsPath', $event)"
        />
      </section>
      <section
        v-else
        class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.section.reasoning') }}</div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="isOpenAIResponsesSelected ? openAIResponsesReasoningEnabled : isGoogleAIStudioSelected ? googleThinkingEnabled : isAnthropicSelected ? anthropicThinkingCapability.required || props.sessionConfig.reasoning.enabled : props.sessionConfig.reasoning.enabled"
              :disabled="disabled || (isOpenAIResponsesSelected && !openAIResponsesThinkingCapability.canDisable) || isGoogleImageGenerationModel || (isGoogleAIStudioSelected && (googleThinkingCapability.kind === 'unsupported' || !googleThinkingCapability.allowOff || googleThinkingCapability.required)) || (isAnthropicSelected && anthropicThinkingCapability.required)"
              data-testid="session-reasoning-enabled"
              @change="isOpenAIResponsesSelected || isAnthropicSelected ? emit('updateReasoningEnabled', ($event.target as HTMLInputElement).checked) : isGoogleAIStudioSelected ? onGoogleThinkingEnabledChange(($event.target as HTMLInputElement).checked) : emit('updateReasoningEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div v-if="isOpenAIResponsesSelected" class="flex flex-col gap-3" data-testid="session-openai-responses-reasoning-controls">
          <div class="flex flex-col gap-1.5">
            <div class="sv-label">{{ t('chat.generationParams.reasoning.effort') }}</div>
            <div class="sv-segmented w-full empty:hidden">
              <button
                v-for="option in openAIResponsesReasoningOptions"
                :key="option"
                type="button"
                class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
                :aria-pressed="openAIResponsesReasoningValue === option"
                :disabled="disabled || !openAIResponsesReasoningSupported || !openAIResponsesReasoningControlsEnabled"
                @click="onOpenAIResponsesReasoningSelect(option)"
              >
                {{ formatOpenAIResponsesReasoningOption(option) }}
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-1.5" data-testid="session-openai-responses-reasoning-summary-controls">
            <div class="sv-label">{{ t('chat.generationParams.reasoning.summary') }}</div>
            <div class="sv-segmented w-full empty:hidden">
              <button
                v-for="option in openAIResponsesReasoningSummaryOptions"
                :key="option"
                type="button"
                class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
                :aria-pressed="openAIResponsesReasoningSummaryValue === option"
                :disabled="disabled || !openAIResponsesReasoningSupported || !openAIResponsesReasoningControlsEnabled"
                @click="onOpenAIResponsesReasoningSummarySelect(option)"
              >
                {{ formatOpenAIResponsesReasoningSummaryOption(option) }}
              </button>
            </div>
          </div>
          <div
            v-if="!openAIResponsesReasoningSupported"
            class="sv-meta"
            data-testid="session-openai-responses-reasoning-unsupported"
          >
            {{ t('chat.console.reasoning.openAIResponsesUnsupported') }}
            <ModelFactControlReason
              v-if="reasoningEffortReason"
              class="mt-1"
              :reason="reasoningEffortReason"
              :can-inspect="canInspectModelFacts"
              data-test-id="session-reasoning-effort-reason"
              @inspect="emit('inspectModelFactsPath', $event)"
            />
          </div>
        </div>
        <div v-else-if="!isGoogleAIStudioSelected" class="flex flex-col gap-2">
          <div class="sv-segmented w-full empty:hidden">
            <button
              v-for="effort in genericReasoningEffortOptions"
              :key="effort"
              type="button"
              class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
              :aria-pressed="props.sessionConfig.reasoning.effort === effort"
              :disabled="disabled || !props.sessionConfig.reasoning.enabled"
              @click="emit('updateReasoningEffort', effort)"
            >
              {{ formatReasoningEffort(effort) }}
            </button>
          </div>
          <ModelFactControlReason
            v-if="genericReasoningEffortOptions.length === 0 && reasoningEffortReason"
            :reason="reasoningEffortReason"
            :can-inspect="canInspectModelFacts"
            data-test-id="session-reasoning-effort-reason"
            @inspect="emit('inspectModelFactsPath', $event)"
          />
        </div>
        <div v-else-if="!isGoogleImageGenerationModel && googleThinkingCapability.kind === 'budget'" class="flex flex-col gap-2" data-testid="session-google-thinking-budget-controls">
          <label class="flex min-h-8 items-center justify-between gap-3 text-[13px] text-gray-800">
            <span>{{ t('chat.console.reasoning.thinkingBudget') }}</span>
            <select
              class="sv-select w-40 shrink-0"
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
          <label v-if="googleThinkingBudgetMode === 'fixed'" class="flex min-h-8 items-center justify-between gap-3 text-[13px] text-gray-800">
            <span>{{ t('chat.console.reasoning.fixedBudget') }}</span>
            <input
              type="number"
              class="sv-input w-32 shrink-0"
              :min="googleThinkingCapability.minBudget"
              :max="googleThinkingCapability.maxBudget"
              :value="googleThinkingBudgetInput"
              :disabled="disabled"
              data-testid="session-google-thinking-budget"
              @input="onGoogleThinkingBudgetChange"
            />
          </label>
          <div v-if="googleThinkingBudgetMode === 'fixed'" class="sv-meta">
            {{ tf('chat.console.reasoning.allowedRange', { min: googleThinkingCapability.minBudget, max: googleThinkingCapability.maxBudget }) }}
          </div>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="googleThinkingConfig.includeThoughts === true"
              :disabled="disabled"
              data-testid="session-google-thinking-include-thoughts"
              @change="onGoogleThinkingIncludeThoughtsChange"
            />
            {{ t('chat.console.reasoning.includeThoughts') }}
          </label>
        </div>
        <div v-else-if="isGoogleImageGenerationModel && googleImageGenerationPolicy.thinkingLevels.length > 0" class="flex flex-col gap-2" data-testid="session-google-thinking-level-controls">
          <label class="flex min-h-8 items-center justify-between gap-3 text-[13px] text-gray-800">
            <span>{{ t('chat.console.reasoning.thinkingLevel') }}</span>
            <select
              class="sv-select w-40 shrink-0"
              :value="googleImageThinkingLevelSelection"
              :disabled="disabled"
              data-testid="session-google-thinking-level"
              @change="onGoogleThinkingLevelChange"
            >
              <option value="default">{{ tf('chat.console.reasoning.default', { value: googleImageDefaultThinkingLevel }) }}</option>
              <option v-for="level in googleImageGenerationPolicy.thinkingLevels" :key="level" :value="level">{{ level }}</option>
            </select>
          </label>
          <label v-if="googleImageGenerationPolicy.supportsThoughtSummaries" class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="googleThinkingConfig.includeThoughts === true"
              :disabled="disabled"
              data-testid="session-google-thinking-include-thoughts"
              @change="onGoogleThinkingIncludeThoughtsChange"
            />
            {{ t('chat.console.reasoning.includeThoughts') }}
          </label>
          <div class="sv-meta" data-testid="session-google-thinking-provider-managed">
            {{ t('chat.console.reasoning.geminiImageProviderManaged') }}
          </div>
        </div>
        <div v-else-if="isGoogleImageGenerationModel && (googleImageGenerationPolicy.supportsThoughtSummaries || googleImageGenerationPolicy.thinkingLevels.length > 0)" class="flex flex-col gap-2" data-testid="session-google-thinking-provider-managed-controls">
          <label v-if="googleImageGenerationPolicy.supportsThoughtSummaries" class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="googleThinkingConfig.includeThoughts === true"
              :disabled="disabled"
              data-testid="session-google-thinking-include-thoughts"
              @change="onGoogleThinkingIncludeThoughtsChange"
            />
            {{ t('chat.console.reasoning.includeThoughts') }}
          </label>
          <div class="sv-meta" data-testid="session-google-thinking-provider-managed">
            {{ t('chat.console.reasoning.geminiImageProviderManaged') }}
          </div>
        </div>
        <div v-else-if="isGoogleImageGenerationModel" class="sv-meta" data-testid="session-google-thinking-unsupported">
          {{ t('chat.console.reasoning.geminiUnsupported') }}
          <ModelFactControlReason
            v-if="googleThinkingReason"
            class="mt-1"
            :reason="googleThinkingReason"
            :can-inspect="canInspectModelFacts"
            data-test-id="session-google-thinking-reason"
            @inspect="emit('inspectModelFactsPath', $event)"
          />
        </div>
        <div v-else-if="googleThinkingCapability.kind === 'level'" class="flex flex-col gap-2" data-testid="session-google-thinking-level-controls">
          <label class="flex min-h-8 items-center justify-between gap-3 text-[13px] text-gray-800">
            <span>{{ t('chat.console.reasoning.thinkingLevel') }}</span>
            <select
              class="sv-select w-40 shrink-0"
              :value="googleThinkingLevelSelection"
              :disabled="disabled"
              data-testid="session-google-thinking-level"
              @change="onGoogleThinkingLevelChange"
            >
              <option value="default">{{ tf('chat.console.reasoning.default', { value: googleThinkingCapability.defaultLevel || t('chat.console.reasoning.providerManaged') }) }}</option>
              <option v-for="level in googleThinkingCapability.levels" :key="level" :value="level">{{ googleThinkingLevelLabel(level) }}</option>
            </select>
          </label>
          <label class="flex min-h-8 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="googleThinkingConfig.includeThoughts === true"
              :disabled="disabled"
              data-testid="session-google-thinking-include-thoughts"
              @change="onGoogleThinkingIncludeThoughtsChange"
            />
            {{ t('chat.console.reasoning.includeThoughts') }}
          </label>
        </div>
        <div v-else class="sv-meta" data-testid="session-google-thinking-unsupported">
          {{ t('chat.console.reasoning.geminiUnsupported') }}
          <ModelFactControlReason
            v-if="googleThinkingReason"
            class="mt-1"
            :reason="googleThinkingReason"
            :can-inspect="canInspectModelFacts"
            data-test-id="session-google-thinking-reason"
            @inspect="emit('inspectModelFactsPath', $event)"
          />
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0">
        <div class="flex items-center justify-between gap-3">
          <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.section.webSearch') }}</div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="props.sessionConfig.webSearch.enabled"
              :disabled="disabled || (!props.sessionConfig.webSearch.enabled && !webSearchControls.enabled)"
              @change="emit('updateWebSearchEnabled', ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div class="sv-segmented w-full">
          <button
            type="button"
            class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
            :aria-pressed="props.sessionConfig.webSearch.level === 'low'"
            :disabled="disabled || !props.sessionConfig.webSearch.enabled || (!webSearchControls.maxResultsBounds && !webSearchControls.contexts.includes('low'))"
            @click="emit('updateWebSearchLevel', 'low')"
          >
            {{ formatWebSearchLevel('low') }}
          </button>
          <button
            type="button"
            class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
            :aria-pressed="props.sessionConfig.webSearch.level === 'high'"
            :disabled="disabled || !props.sessionConfig.webSearch.enabled || (!webSearchControls.maxResultsBounds && !webSearchControls.contexts.includes('high'))"
            @click="emit('updateWebSearchLevel', 'high')"
          >
            {{ formatWebSearchLevel('high') }}
          </button>
        </div>
        <WebSearchSettingsEditor
          :model-value="props.sessionConfig.webSearch.detail"
          :disabled="disabled"
          :resolved="props.webSearchResolved"
          :controls="webSearchControls"
          @update:model-value="emit('updateWebSearchLayer', $event)"
        />
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0">
        <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.section.generationParams') }}</div>
        <GenerationParamsSettingsEditor
          :model-value="props.sessionConfig.generationParams.detail"
          :disabled="disabled"
          :resolved="props.generationParamsResolved"
          :profile="generationParamsProfile"
          :model-id="generationParamsModelId"
          :capability-projection="props.capabilityProjection"
          :control-explanations="props.controlExplanations"
          :collapsible="false"
          compact
          @update:model-value="emit('updateGenerationParamsLayer', $event)"
          @inspect-model-facts-path="emit('inspectModelFactsPath', $event)"
        />
      </section>

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0">
        <div class="flex items-center justify-between gap-3">
          <div class="sv-label text-[13px] text-gray-900">{{ t('chat.console.section.imageGeneration') }}</div>
          <label class="flex h-7 shrink-0 items-center gap-2 text-[13px] text-gray-800">
            <input
              type="checkbox"
              class="size-4 shrink-0"
              :checked="effectiveImageGenerationEnabled"
              :disabled="disabled || isGoogleImageGenerationModel"
              data-testid="session-image-generation-enabled"
              @change="emit('updateImageGenerationEnabled', isGoogleImageGenerationModel ? true : ($event.target as HTMLInputElement).checked)"
            />
            {{ t('chat.console.status.enabled') }}
          </label>
        </div>
        <div v-if="showImageGenerationSizeControl" class="sv-segmented w-full">
          <button
            type="button"
            class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
            :aria-pressed="effectiveImageGenerationResolution === ''"
            :disabled="disabled || !effectiveImageGenerationEnabled"
            @click="emit('updateImageGenerationResolution', '')"
          >Default</button>
          <button
            v-for="resolution in imageGenerationSizeOptions"
            :key="resolution"
            type="button"
            class="h-auto min-h-6 min-w-0 whitespace-normal px-2 py-1 leading-4"
            :aria-pressed="effectiveImageGenerationResolution === resolution"
            :disabled="disabled || !effectiveImageGenerationEnabled || lockImageGenerationSizeControl"
            @click="emit('updateImageGenerationResolution', resolution)"
          >
            {{ resolution }}
          </button>
        </div>
        <div class="flex flex-wrap gap-1.5 empty:hidden">
          <button
            v-for="ratio in imageGenerationAspectRatioOptions"
            :key="ratio"
            type="button"
            class="sv-btn sv-btn-sm min-w-12 aria-pressed:border-gray-900"
            :aria-pressed="effectiveImageGenerationAspectRatio === ratio"
            :disabled="disabled || !effectiveImageGenerationEnabled"
            @click="emit('updateImageGenerationAspectRatio', ratio)"
          >
            {{ ratio }}
          </button>
        </div>
        <ModelFactControlReason
          v-if="imageGenerationAspectRatioOptions.length === 0 && imageGenerationOptionsReason"
          :reason="imageGenerationOptionsReason"
          :can-inspect="canInspectModelFacts"
          data-test-id="session-image-generation-reason"
          @inspect="emit('inspectModelFactsPath', $event)"
        />
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
          class="flex flex-col gap-3 sv-divider-t pt-3"
          data-testid="openrouter-image-endpoint-controls"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="sv-label">{{ t('chat.console.imageEndpoint.title') }}</div>
              <div class="sv-meta">{{ t('chat.console.imageEndpoint.description') }}</div>
            </div>
            <button
              type="button"
              class="sv-btn sv-btn-sm w-28 shrink-0"
              :disabled="disabled || props.openRouterImageEndpointSelectionLoading"
              data-testid="openrouter-image-endpoint-refresh"
              @click="emit('refreshOpenRouterImageEndpoints')"
            >
              <UiIcon :name="props.openRouterImageEndpointSelectionLoading ? 'spinner' : 'refresh'" :size="14" />
              {{ props.openRouterImageEndpointSelectionLoading ? t('chat.console.imageEndpoint.loading') : t('chat.console.imageEndpoint.refresh') }}
            </button>
          </div>
          <div v-if="props.openRouterImageEndpointSelectionError" class="sv-notice sv-notice-danger wrap-anywhere">
            {{ props.openRouterImageEndpointSelectionError }}
          </div>
          <div v-if="!openRouterImageEndpointState" class="sv-meta">
            {{ t('chat.console.imageEndpoint.loadHint') }}
          </div>
          <template v-else>
            <div class="flex flex-col gap-1">
              <button
                v-for="candidate in openRouterImageEndpointState.candidates"
                :key="candidate.providerTag"
                type="button"
                class="sv-row flex w-full items-center justify-between gap-3 border border-transparent px-3 py-2 text-left text-[13px] text-gray-800 disabled:text-[var(--sv-text-disabled)]"
                :class="candidate.bound ? 'is-selected' : ''"
                :aria-pressed="candidate.bound"
                :disabled="disabled || props.openRouterImageEndpointSelectionLoading || !candidate.eligible"
                :data-testid="`openrouter-image-endpoint-${candidate.providerTag}`"
                @click="emit('selectOpenRouterImageEndpoint', candidate.providerTag)"
              >
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ candidate.providerName }}</span>
                  <code class="block truncate text-xs opacity-75">{{ candidate.providerTag }}</code>
                </span>
                <span class="shrink-0 text-xs">
                  {{ candidate.bound ? t('chat.console.imageEndpoint.bound') : candidate.eligible ? t('chat.console.imageEndpoint.select') : t('chat.console.imageEndpoint.unsupported') }}
                </span>
              </button>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex min-w-0 flex-col gap-1.5">
                <span class="sv-label">{{ t('chat.console.imageEndpoint.refreshAfter') }}</span>
                <select
                  class="sv-select"
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
              <label class="flex min-w-0 flex-col gap-1.5">
                <span class="sv-label">{{ t('chat.console.imageEndpoint.hardExpireAfter') }}</span>
                <select
                  class="sv-select"
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

      <section class="flex min-w-0 flex-col gap-3 py-4 sv-divider-t first:border-t-0">
        <button
          type="button"
          class="sv-btn w-full"
          :disabled="props.disabled"
          @click="emit('openSettings')"
        >
          {{ t('chat.console.common.openGlobalSettings') }}
        </button>
      </section>
    </div>
  </div>
</template>

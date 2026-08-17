<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import type { CatalogQueryInput, CatalogQueryResult } from '@/next/modelCatalog/catalogQueryService'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import { ModelPrefsService, type ModelPrefsFavorite, type ModelPrefsRecent, type ModelPrefsScopeInput } from '@/next/modelPrefs/modelPrefsService'
import type { ChatSessionConfig, ChatSessionConfigAspectRatio, ChatSessionConfigImageResolution,
  ChatSessionConfigReasoningEffort } from '../app/chatSessionConfig'
import type { ProviderModelPickerSource } from '../app/providerModelPickerViewModel'
import type { GenerationParamsLayer, ResolvedGenerationParams } from '@/next/generation-params/generationParamTypes'
import {
  OPENROUTER_PROVIDER_ID,
  DEFAULT_OPENROUTER_MODEL_ID,
  buildProviderModelKey,
} from '@/next/provider/modelSelection'
import { isRuntimeProviderId, type RuntimeProviderId } from '@/next/provider/runtimeProviderId'
import { createProviderModelRouteSelection, type ConversationRouteSelection } from '@/next/provider/conversationRouteSelection'
import { catalogModelSelectionCommandV2ForApp } from '@/next/modelCatalog/catalogRuntimeStoreV2'
import { GOOGLE_AI_STUDIO_PROVIDER_KEY, type GeminiModelAvailabilityResult } from '@/next/provider/gemini/geminiModelSource'
import {
  type GeminiThinkingLevel,
} from '@/next/provider/gemini/geminiThinkingPolicy'
import {
  isProjectedGeminiImageModelV2,
  isProjectedGeminiThinkingBudgetValid,
  projectGeminiImageGenerationPolicyV2,
  projectGeminiThinkingCapabilityV2,
} from '../app/generationV2CapabilityUiProjection'
import { OPENAI_RESPONSES_PROVIDER_KEY } from '@/next/provider/openai-responses/openAIResponsesModelSource'
import {
  formatOpenAIResponsesAutoReasoningLabel,
  type OpenAIResponsesReasoningEffortSetting,
  type OpenAIResponsesReasoningSummarySetting,
} from '@/next/provider/openai-responses/openaiResponsesReasoningPolicy'
import ComposerCapabilityChip from './ComposerCapabilityChip.vue'
import ModelPickerDialog from './ModelPickerDialog.vue'
import { formatModelIndicatorName } from './modelIndicatorName'
import { t, tf } from '@/shared/i18n'
import { createCompatibleCatalogClient } from '@/next/modelCatalog/compatibleCatalogClient'
import { createCompatibleProviderRegistryClient, createCompatibleRouteIntent, type CompatibleRoutePickerSource } from '@/next/provider/openai-chat-compatible/ui'
import type { GenerationControlsProjectionV2 } from '@/next/generation-v2/capability/resolvedCapabilityV2'

const props = defineProps<{
  draft: string
  disabled: boolean
  isRunning: boolean
  sessionConfig?: ChatSessionConfig | null
  modelCatalog: readonly ModelCatalogItem[]
  providerModelSources?: readonly ProviderModelPickerSource[]
  imageInputSupported?: boolean | null
  imageInputDisabledReason?: string | null
  canSend?: boolean | null
  sendButtonMode?: 'enabled_arrow' | 'disabled_arrow' | 'stop_square' | 'busy_spinner'
  sendPlanStatus?: 'sendable' | 'sendable_with_warnings' | 'partially_sendable' | 'blocked' | null
  sendPlanBlockingSummary?: string | null
  sendPlanWarningSummary?: string | null
  isSendPlanLoading?: boolean
  attachmentFeedbackTone?: 'info' | 'warning' | 'error' | 'success' | null
  attachmentFeedbackMessage?: string | null
  historyIncompatibleSummary?: Readonly<{
    count: number
    currentIndex: number
    hasItems: boolean
    warningText: string | null
    navigationActive: boolean
  }> | null
  modelPickerQueryFn?: (input: CatalogQueryInput) => Promise<CatalogQueryResult>
  modelPrefsScope?: ModelPrefsScopeInput | null
  modelCatalogNotice?: string | null
  maxRecentModels?: number | string | null
  generationParamsResolved?: ResolvedGenerationParams | null
  googleAIStudioModelAvailability?: Readonly<{ result: GeminiModelAvailabilityResult | null }> | null
  capabilityProjection?: GenerationControlsProjectionV2 | null
}>()
const appIdentity = getCurrentInstance()?.appContext.app ?? null
type ProviderModelRef = Readonly<{ providerId: RuntimeProviderId; modelId: string }>
type FavoriteViewModel = ModelPrefsFavorite & Readonly<{ ownedByActiveScope: boolean }>

const defaultSessionConfig: ChatSessionConfig = {
  routeSelection: null,
  reasoning: {
    enabled: false,
    effort: 'medium',
  },
  webSearch: {
    enabled: false,
    level: 'high',
    detail: null,
  },
  imageGeneration: {
    enabled: false,
    resolution: '1K',
    aspectRatio: '1:1',
    mode: 'default',
    detail: null,
  },
  generationParams: {
    detail: null,
  },
}

const emit = defineEmits<{
  (e: 'update:draft', value: string): void
  (e: 'updateReasoningEnabled', value: boolean): void
  (e: 'updateReasoningEffort', value: ChatSessionConfigReasoningEffort): void
  (e: 'updateGenerationParamsLayer', value: GenerationParamsLayer | null): void
  (e: 'updateWebSearchEnabled', value: boolean): void
  (e: 'updateWebSearchLevel', value: 'low' | 'high'): void
  (e: 'updateImageGenerationEnabled', value: boolean): void
  (e: 'updateImageGenerationResolution', value: ChatSessionConfigImageResolution): void
  (e: 'updateImageGenerationAspectRatio', value: ChatSessionConfigAspectRatio): void
  (e: 'attachFilesRequested'): void
  (e: 'attachImagesRequested'): void
  (e: 'attachUrlRequested', value?: string | null): void
  (e: 'drop', event: DragEvent): void
  (e: 'paste', event: ClipboardEvent): void
  (e: 'reviewHistoryIncompatible'): void
  (e: 'navigateHistoryIncompatiblePrev'): void
  (e: 'navigateHistoryIncompatibleNext'): void
  (e: 'send'): void
  (e: 'abort'): void
}>()

const favoriteModels = ref<FavoriteViewModel[]>([])
const ownedFavoriteModels = ref<ModelPrefsFavorite[]>([])
const recentModels = ref<ModelPrefsRecent[]>([])
const maxRecentModels = ref(8)
const modelDisplayNameOverrides = ref<Record<string, string>>({})
const modelQuickMode = ref<'favorites' | 'recents' | null>(null)
const modelQuickSelectionError = ref<string | null>(null)
const modelPickerOpen = ref(false)
const attachmentMenuOpen = ref(false)
const attachmentMenuReady = ref(false)
const attachmentMenuError = ref<string | null>(null)
const attachmentToggleRef = ref<HTMLElement | null>(null)
const attachmentMenuRef = ref<HTMLElement | null>(null)
const attachmentMenuStyle = ref<CSSProperties>({})
let unsubscribeModelPrefs: (() => void) | null = null
let attachmentMenuOpenToken = 0
let attachmentMenuFrameId: number | null = null

const ATTACHMENT_MENU_GAP_PX = 8
const ATTACHMENT_MENU_VIEWPORT_PADDING_PX = 8
const ATTACHMENT_MENU_MAX_HEIGHT_PX = 320
const ATTACHMENT_MENU_MIN_WIDTH_PX = 176
const MAX_RECENT_MODELS_KEY = 'maxRecentModels'

type ElectronStoreLike = Readonly<{
  get: (key: string) => Promise<any>
}>

function getElectronStore(): ElectronStoreLike | null {
  const store = (globalThis as any).electronStore as ElectronStoreLike | undefined
  if (!store || typeof store.get !== 'function') return null
  return store
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

const attachmentMenuHiddenStyle: CSSProperties = {
  position: 'fixed',
  top: '0px',
  left: '0px',
  minWidth: `${ATTACHMENT_MENU_MIN_WIDTH_PX}px`,
  maxHeight: `${ATTACHMENT_MENU_MAX_HEIGHT_PX}px`,
  zIndex: '1100',
  visibility: 'hidden',
  pointerEvents: 'none',
}

function isPositiveRect(rect: DOMRect | null | undefined): rect is DOMRect {
  return Boolean(rect && rect.width > 0 && rect.height > 0)
}

function cancelAttachmentMenuFrame() {
  if (attachmentMenuFrameId === null) return
  window.cancelAnimationFrame(attachmentMenuFrameId)
  attachmentMenuFrameId = null
}

function clearAttachmentMenuState() {
  cancelAttachmentMenuFrame()
  attachmentMenuReady.value = false
  attachmentMenuStyle.value = {}
}

function buildAttachmentMenuStyle(triggerRect: DOMRect, menuRect: DOMRect): CSSProperties {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const menuWidth = Math.max(menuRect.width, ATTACHMENT_MENU_MIN_WIDTH_PX)
  const measuredHeight = Math.max(menuRect.height, 1)

  const availableBelow = viewportHeight - triggerRect.bottom - ATTACHMENT_MENU_GAP_PX - ATTACHMENT_MENU_VIEWPORT_PADDING_PX
  const availableAbove = triggerRect.top - ATTACHMENT_MENU_GAP_PX - ATTACHMENT_MENU_VIEWPORT_PADDING_PX
  const canOpenBelow = availableBelow >= measuredHeight
  const openUp = !canOpenBelow && availableAbove > availableBelow

  let left = triggerRect.left
  const minLeft = ATTACHMENT_MENU_VIEWPORT_PADDING_PX
  const maxLeft = Math.max(
    ATTACHMENT_MENU_VIEWPORT_PADDING_PX,
    viewportWidth - ATTACHMENT_MENU_VIEWPORT_PADDING_PX - menuWidth,
  )
  left = clamp(left, minLeft, maxLeft)

  const sideAvailable = openUp ? availableAbove : availableBelow
  const viewportMaxHeight = Math.max(80, viewportHeight - ATTACHMENT_MENU_VIEWPORT_PADDING_PX * 2)
  const maxHeight = Math.max(80, Math.min(ATTACHMENT_MENU_MAX_HEIGHT_PX, viewportMaxHeight, Math.max(80, sideAvailable)))

  let top = openUp
    ? triggerRect.top - ATTACHMENT_MENU_GAP_PX - measuredHeight
    : triggerRect.bottom + ATTACHMENT_MENU_GAP_PX

  const minTop = ATTACHMENT_MENU_VIEWPORT_PADDING_PX
  const maxTop = Math.max(
    ATTACHMENT_MENU_VIEWPORT_PADDING_PX,
    viewportHeight - ATTACHMENT_MENU_VIEWPORT_PADDING_PX - Math.min(measuredHeight, maxHeight),
  )
  top = clamp(top, minTop, maxTop)

  return {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    minWidth: `${ATTACHMENT_MENU_MIN_WIDTH_PX}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
    zIndex: '1100',
    visibility: 'visible',
    pointerEvents: 'auto',
  }
}

function failAttachmentMenuOpen(details: Readonly<{
  attemptCount: number
  triggerRectValid: boolean
  menuRectValid: boolean
}>) {
  clearAttachmentMenuState()
  attachmentMenuOpenToken += 1
  attachmentMenuOpen.value = false
  attachmentMenuError.value = t('errors.attachment.menuUnavailable')
  console.error('[ChatAppComposer] attachment menu failed to open', {
    attemptCount: details.attemptCount,
    triggerRectValid: details.triggerRectValid,
    menuRectValid: details.menuRectValid,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  })
  removeAttachmentMenuListeners()
}

function scheduleAttachmentMenuMeasurement(token: number, attemptCount: number) {
  cancelAttachmentMenuFrame()
  attachmentMenuFrameId = window.requestAnimationFrame(() => {
    attachmentMenuFrameId = null
    if (!attachmentMenuOpen.value || token !== attachmentMenuOpenToken) return

    const triggerRect = attachmentToggleRef.value?.getBoundingClientRect() ?? null
    const menuRect = attachmentMenuRef.value?.getBoundingClientRect() ?? null
    const triggerRectValid = isPositiveRect(triggerRect)
    const menuRectValid = isPositiveRect(menuRect)

    if (!triggerRectValid || !menuRectValid) {
      if (attemptCount < 2) {
        scheduleAttachmentMenuMeasurement(token, attemptCount + 1)
        return
      }
      failAttachmentMenuOpen({
        attemptCount,
        triggerRectValid,
        menuRectValid,
      })
      return
    }

    attachmentMenuStyle.value = buildAttachmentMenuStyle(triggerRect, menuRect)
    attachmentMenuReady.value = true
    attachmentMenuError.value = null
  })
}

function onGlobalPointerDown(event: MouseEvent | TouchEvent) {
  if (!attachmentMenuOpen.value) return
  const target = event.target as Node | null
  if (!target) return
  if (attachmentMenuRef.value?.contains(target)) return
  if (attachmentToggleRef.value?.contains(target)) return
  closeAttachmentMenu()
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeAttachmentMenu()
}

function onViewportChange() {
  if (!attachmentMenuOpen.value) return
  if (!attachmentMenuReady.value) return
  const triggerRect = attachmentToggleRef.value?.getBoundingClientRect() ?? null
  const menuRect = attachmentMenuRef.value?.getBoundingClientRect() ?? null
  if (!isPositiveRect(triggerRect) || !isPositiveRect(menuRect)) return
  attachmentMenuStyle.value = buildAttachmentMenuStyle(triggerRect, menuRect)
}

function addAttachmentMenuListeners() {
  if (typeof window === 'undefined') return
  document.addEventListener('mousedown', onGlobalPointerDown)
  document.addEventListener('touchstart', onGlobalPointerDown, { passive: true })
  document.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
}

function removeAttachmentMenuListeners() {
  if (typeof window === 'undefined') return
  document.removeEventListener('mousedown', onGlobalPointerDown)
  document.removeEventListener('touchstart', onGlobalPointerDown)
  document.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
}

const disabled = computed(() => props.disabled || props.isRunning)
function normalizeModelKey(value: unknown): string {
  return String(value ?? '').trim()
}
const resolvedSessionConfig = computed(() => props.sessionConfig ?? defaultSessionConfig)
const sendPlanBlockingSummary = computed(() => {
  const direct = String(props.sendPlanBlockingSummary ?? '').trim()
  if (direct.length > 0) return direct
  return null
})
const sendPlanWarningSummary = computed(() => {
  const direct = String(props.sendPlanWarningSummary ?? '').trim()
  if (direct.length > 0) return direct
  return null
})
const canSend = computed(() => (typeof props.canSend === 'boolean' ? props.canSend : false))
const resolvedSendButtonMode = computed(() => {
  if (props.sendButtonMode) return props.sendButtonMode
  if (props.isRunning) return 'stop_square'
  if (props.isSendPlanLoading) return 'busy_spinner'
  if (canSend.value) return 'enabled_arrow'
  return 'disabled_arrow'
})
const isSendButtonStop = computed(() => resolvedSendButtonMode.value === 'stop_square')
const isSendButtonBusy = computed(() => resolvedSendButtonMode.value === 'busy_spinner')
const compatibleRouteIntent = computed(() => props.sessionConfig?.routeSelection?.kind === 'openai_chat_compatible'
  ? props.sessionConfig.routeSelection : null)
const compatibleRouteSources = ref<CompatibleRoutePickerSource[]>([])
const isSendButtonEnabled = computed(() => resolvedSendButtonMode.value === 'enabled_arrow')
const historyIncompatibleSummary = computed(() => props.historyIncompatibleSummary ?? null)
const selectedModel = computed(() => {
  const route = resolvedSessionConfig.value.routeSelection
  const normalized = normalizeModelKey(route?.modelId)
  return normalized
})
const selectedProvider = computed(() => resolvedSessionConfig.value.routeSelection?.kind === 'provider_model'
  ? resolvedSessionConfig.value.routeSelection.providerId : null)
const selectedModelSelection = computed<ProviderModelRef | null>(() => selectedProvider.value && selectedModel.value
  ? { providerId: selectedProvider.value, modelId: selectedModel.value }
  : null)
const isGoogleAIStudioSelected = computed(() => selectedProvider.value === GOOGLE_AI_STUDIO_PROVIDER_KEY)
const isOpenAIResponsesSelected = computed(() => selectedProvider.value === OPENAI_RESPONSES_PROVIDER_KEY)
const genericReasoningEffortOptions = computed<readonly ChatSessionConfigReasoningEffort[]>(() => {
  const field = props.capabilityProjection?.controls['reasoning.effort']
  if (!field || field.state !== 'supported' || field.domain?.kind !== 'enum') return Object.freeze([])
  return Object.freeze(field.domain.values.filter((effort): effort is ChatSessionConfigReasoningEffort =>
    typeof effort === 'string' && effort !== 'none' && effort !== 'auto'))
})
const googleImageGenerationPolicy = computed(() => projectGeminiImageGenerationPolicyV2(props.capabilityProjection))
const isGoogleImageGenerationModel = computed(() => isGoogleAIStudioSelected.value && isProjectedGeminiImageModelV2(props.capabilityProjection))
const googleThinkingCapability = computed(() => projectGeminiThinkingCapabilityV2(props.capabilityProjection, selectedModel.value))
function customGoogleGenerationParamValue(key: 'thinkingBudget' | 'thinkingLevel' | 'includeThoughts' | 'thoughtSummaryMode'): unknown {
  const setting = resolvedSessionConfig.value.generationParams.detail?.[key]
  if (setting?.mode === 'custom') return setting.value
  const decision = props.generationParamsResolved?.decisions[key]
  return decision && (decision.state === 'sent' || decision.state === 'deprecated') ? decision.value : undefined
}
const googleThinkingConfig = computed(() => {
  const capability = googleThinkingCapability.value
  const level = customGoogleGenerationParamValue('thinkingLevel')
  const budget = customGoogleGenerationParamValue('thinkingBudget')
  return {
    thinkingBudget: typeof budget === 'number'
      ? budget
      : capability.kind === 'budget' ? (capability.defaultBudgetMode === 'dynamic' ? -1 : 0) : 8192,
    thinkingLevel: typeof level === 'string'
      ? level as GeminiThinkingLevel
      : capability.kind === 'level' ? capability.defaultLevel : 'low' as GeminiThinkingLevel,
    includeThoughts: isGoogleImageGenerationModel.value
      ? customGoogleGenerationParamValue('thoughtSummaryMode') === 'auto'
      : customGoogleGenerationParamValue('includeThoughts') === true,
  }
})
const googleThinkingEnabled = computed(() => {
  if (isGoogleImageGenerationModel.value) return googleImageGenerationPolicy.value.supportsThoughtSummaries ||
    googleImageGenerationPolicy.value.thinkingLevels.length > 0
  return googleThinkingCapability.value.kind === 'level' || googleThinkingCapability.value.kind === 'budget'
})
const googleThinkingLevelSelection = computed(() => {
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'level') return 'default'
  const setting = resolvedSessionConfig.value.generationParams.detail?.thinkingLevel
  return setting?.mode === 'custom' && capability.levels.includes(setting.value as GeminiThinkingLevel)
    ? setting.value as GeminiThinkingLevel : 'default'
})
const googleThinkingBudgetMode = computed(() => {
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'budget') return 'default'
  const setting = resolvedSessionConfig.value.generationParams.detail?.thinkingBudget
  if (setting?.mode !== 'custom' || typeof setting.value !== 'number') return 'default'
  if (setting.value === -1) return 'dynamic'
  if (setting.value === 0 && capability.allowOff) return 'off'
  return isProjectedGeminiThinkingBudgetValid(capability, setting.value) ? 'fixed' : 'default'
})
const googleThinkingBudgetInput = computed(() => {
  const capability = googleThinkingCapability.value
  const setting = resolvedSessionConfig.value.generationParams.detail?.thinkingBudget
  if (capability.kind !== 'budget' || setting?.mode !== 'custom' || typeof setting.value !== 'number') return ''
  return setting.value > 0 && isProjectedGeminiThinkingBudgetValid(capability, setting.value) ? String(setting.value) : ''
})
function googleThinkingLevelLabel(level: GeminiThinkingLevel): string {
  return level === 'high' ? t('chat.console.reasoning.highDynamic') : level
}
const googleThinkingActiveLabel = computed(() => {
  if (isGoogleImageGenerationModel.value) {
    const policy = googleImageGenerationPolicy.value
    if (policy.thinkingLevels.length > 0) {
      const configured = googleThinkingConfig.value.thinkingLevel
      return configured && (policy.thinkingLevels as readonly string[]).includes(configured)
        ? configured
        : policy.thinkingLevels[0] ?? null
    }
    return policy.supportsThoughtSummaries ? t('chat.console.reasoning.providerManaged') : null
  }
  if (googleThinkingCapability.value.kind === 'budget') {
    const mode = googleThinkingBudgetMode.value
    if (mode === 'default') return tf('chat.console.reasoning.default', {
      value: googleThinkingCapability.value.defaultBudgetMode === 'dynamic'
        ? t('chat.console.reasoning.dynamic') : t('chat.console.reasoning.off'),
    })
    if (mode === 'dynamic') return t('chat.console.reasoning.dynamic')
    if (mode === 'off') return t('chat.console.reasoning.off')
    return googleThinkingBudgetInput.value || t('chat.console.reasoning.fixedBudget')
  }
  if (googleThinkingCapability.value.kind === 'level') {
    const selection = googleThinkingLevelSelection.value
    if (selection === 'default') return tf('chat.console.reasoning.default', { value: googleThinkingCapability.value.defaultLevel })
    return googleThinkingLevelLabel(selection)
  }
  return null
})
const openAIResponsesReasoningSupported = computed(() =>
  isOpenAIResponsesSelected.value && genericReasoningEffortOptions.value.length > 0
)
const openAIResponsesReasoningOptions = computed<readonly OpenAIResponsesReasoningEffortSetting[]>(() =>
  openAIResponsesReasoningSupported.value ? Object.freeze(['auto', ...genericReasoningEffortOptions.value] as OpenAIResponsesReasoningEffortSetting[]) : Object.freeze([])
)
const openAIResponsesReasoningSummaryOptions = computed<readonly OpenAIResponsesReasoningSummarySetting[]>(() => {
  const field = props.capabilityProjection?.controls['reasoning.summary']
  if (!openAIResponsesReasoningSupported.value || !field || field.state !== 'supported' || field.domain?.kind !== 'enum') return Object.freeze(['off'] as OpenAIResponsesReasoningSummarySetting[])
  const values = field.domain.values.filter((value): value is OpenAIResponsesReasoningSummarySetting =>
    typeof value === 'string' && (value === 'auto' || value === 'concise' || value === 'detailed'))
  return Object.freeze(['off', ...values] as OpenAIResponsesReasoningSummarySetting[])
})
const openAIResponsesReasoningOptionLabels = computed<Record<string, string>>(() => {
  const labels: Record<string, string> = {}
  for (const option of openAIResponsesReasoningOptions.value) {
    labels[option] = option === 'auto'
      ? formatOpenAIResponsesAutoReasoningLabel(selectedModel.value, t('chat.generationParams.reasoning.auto'))
      : option
  }
  return labels
})
const openAIResponsesReasoningSummaryOptionLabels = computed<Record<string, string>>(() => ({
  off: t('chat.generationParams.reasoning.off'),
  auto: t('chat.generationParams.reasoning.auto'),
  concise: t('chat.generationParams.reasoning.concise'),
  detailed: t('chat.generationParams.reasoning.detailed'),
}))
const openAIResponsesReasoningValue = computed<OpenAIResponsesReasoningEffortSetting>(() => {
  const layerValue = resolvedSessionConfig.value.generationParams.detail?.reasoningEffort
  const customValue = layerValue?.mode === 'custom' && typeof layerValue.value === 'string'
    ? layerValue.value
    : null
  const decision = props.generationParamsResolved?.decisions.reasoningEffort
  const decisionValue =
    decision && (decision.state === 'sent' || decision.state === 'deprecated' || decision.state === 'providerAuto') && typeof decision.value === 'string'
      ? decision.value
      : null
  const candidate = customValue ?? decisionValue ?? 'auto'
  return (openAIResponsesReasoningOptions.value as readonly string[]).includes(candidate)
    ? candidate as OpenAIResponsesReasoningEffortSetting
    : 'auto'
})
const openAIResponsesReasoningSummaryValue = computed<OpenAIResponsesReasoningSummarySetting>(() => {
  if (!openAIResponsesReasoningSupported.value) return 'off'
  const layerValue = resolvedSessionConfig.value.generationParams.detail?.reasoningSummary
  if (layerValue?.mode === 'omit') return 'off'
  const customValue = layerValue?.mode === 'custom' && typeof layerValue.value === 'string'
    ? layerValue.value
    : null
  const decision = props.generationParamsResolved?.decisions.reasoningSummary
  const decisionValue =
    decision && (decision.state === 'sent' || decision.state === 'deprecated') && typeof decision.value === 'string'
      ? decision.value
      : null
  const candidate = customValue ?? decisionValue ?? 'off'
  return (openAIResponsesReasoningSummaryOptions.value as readonly string[]).includes(candidate)
    ? candidate as OpenAIResponsesReasoningSummarySetting
    : 'off'
})
const openAIResponsesReasoningActiveLabel = computed(() =>
  openAIResponsesReasoningSupported.value
    ? openAIResponsesReasoningOptionLabels.value[openAIResponsesReasoningValue.value] ?? openAIResponsesReasoningValue.value
    : null
)
const imageGenerationSizeOptions = computed<readonly ChatSessionConfigImageResolution[]>(() => {
  if (isGoogleImageGenerationModel.value) return googleImageGenerationPolicy.value.supportedImageSizes
  return ['1K', '2K', '4K']
})
const imageGenerationAspectRatioOptions = computed<readonly ChatSessionConfigAspectRatio[]>(() => {
  if (isGoogleImageGenerationModel.value) return googleImageGenerationPolicy.value.supportedAspectRatios
  return ['16:9', '3:4', '1:1', '4:3']
})
const showImageGenerationSizeControl = computed(() =>
  !isGoogleImageGenerationModel.value || googleImageGenerationPolicy.value.imageSizeMode !== 'hidden'
)
const effectiveImageGenerationEnabled = computed(() =>
  isGoogleImageGenerationModel.value || resolvedSessionConfig.value.imageGeneration.enabled
)
const effectiveImageGenerationResolution = computed<ChatSessionConfigImageResolution>(() =>
  isGoogleImageGenerationModel.value &&
    (
      !resolvedSessionConfig.value.imageGeneration.enabled ||
      !(googleImageGenerationPolicy.value.supportedImageSizes as readonly string[]).includes(resolvedSessionConfig.value.imageGeneration.resolution)
    )
    ? googleImageGenerationPolicy.value.defaultImageSize
    : resolvedSessionConfig.value.imageGeneration.resolution
)
const effectiveImageGenerationAspectRatio = computed(() =>
  isGoogleImageGenerationModel.value &&
    (
      !resolvedSessionConfig.value.imageGeneration.enabled ||
      !resolvedSessionConfig.value.imageGeneration.aspectRatio ||
      !(googleImageGenerationPolicy.value.supportedAspectRatios as readonly string[]).includes(resolvedSessionConfig.value.imageGeneration.aspectRatio)
    )
    ? '1:1'
    : resolvedSessionConfig.value.imageGeneration.aspectRatio
)
const imageChipOptions = computed(() => {
  const sizeOptions = showImageGenerationSizeControl.value ? [...imageGenerationSizeOptions.value, '—'] : []
  return [...sizeOptions, ...imageGenerationAspectRatioOptions.value]
})
const effectiveImageGenerationSizeLabel = computed(() =>
  showImageGenerationSizeControl.value ? effectiveImageGenerationResolution.value : null
)
const effectiveImageGenerationActiveLabel = computed(() =>
  effectiveImageGenerationEnabled.value
    ? effectiveImageGenerationSizeLabel.value
      ? `${effectiveImageGenerationSizeLabel.value} · ${effectiveImageGenerationAspectRatio.value}`
      : effectiveImageGenerationAspectRatio.value
    : null
)
const modelNameById = computed(() => {
  const map = new Map<string, string>()
  map.set(DEFAULT_OPENROUTER_MODEL_ID, DEFAULT_OPENROUTER_MODEL_ID)
  for (const item of props.modelCatalog) {
    const modelId = normalizeModelKey(item.modelId)
    const displayName = formatModelIndicatorName(item.name)
    if (!modelId || !displayName) continue
    map.set(modelId, displayName)
    map.set(buildProviderModelKey({ providerId: OPENROUTER_PROVIDER_ID, modelId }), displayName)
  }
  for (const source of props.providerModelSources ?? []) {
    for (const item of source.items) {
      const modelId = normalizeModelKey(item.modelId)
      const displayName = formatModelIndicatorName(item.displayName)
      if (!modelId || !displayName) continue
      map.set(buildProviderModelKey({ providerId: item.providerId, modelId }), displayName)
      if (!map.has(modelId)) map.set(modelId, displayName)
    }
  }
  for (const [modelId, name] of Object.entries(modelDisplayNameOverrides.value)) {
    const normalized = normalizeModelKey(modelId)
    const displayName = formatModelIndicatorName(name)
    if (normalized && displayName) map.set(normalized, displayName)
  }
  return map
})
const providerNameById = computed(() => {
  const map = new Map<string, string>([[OPENROUTER_PROVIDER_ID, 'OpenRouter']])
  for (const source of props.providerModelSources ?? []) {
    map.set(source.providerId, source.providerName)
  }
  return map
})
const favoriteModelKeySet = computed(() => new Set(favoriteModels.value.map((item) => item.modelKey)))
const currentModelKey = computed(() => {
  const normalized = normalizeModelKey(selectedModel.value)
  return selectedProvider.value && normalized.length > 0 ? `${selectedProvider.value}::${normalized}` : ''
})
const attachmentFeedbackClass = computed(() => {
  if (props.attachmentFeedbackTone === 'error') return 'border-red-200 bg-red-50 text-red-800'
  if (props.attachmentFeedbackTone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (props.attachmentFeedbackTone === 'success') return 'border-green-200 bg-green-50 text-green-800'
  if (props.attachmentFeedbackTone === 'info') return 'border-blue-200 bg-blue-50 text-blue-800'
  return 'border-gray-200 bg-gray-50 text-gray-700'
})
const currentModelIsFavorite = computed(() => favoriteModelKeySet.value.has(currentModelKey.value))
const favoriteModelKeys = computed(() => favoriteModels.value.map((item) => item.modelKey))
const favoriteEditableModelKeys = computed(() => ownedFavoriteModels.value.map((item) => item.modelKey))
const recentModelKeys = computed(() => recentModels.value.map((item) => item.modelKey).slice(0, maxRecentModels.value))
const favoriteDisplayItems = computed(() =>
  favoriteModels.value.filter((item): item is typeof item & { providerKey: RuntimeProviderId } =>
    isRuntimeProviderId(item.providerKey)).map((item) => ({
    providerId: item.providerKey,
    modelId: normalizeModelKey(item.modelId),
    name: modelNameById.value.get(normalizeModelKey(item.modelId)) ?? item.modelId,
  })),
)
const recentDisplayItems = computed(() =>
  recentModels.value
    .slice(0, maxRecentModels.value)
    .filter((item): item is typeof item & { providerKey: RuntimeProviderId } => isRuntimeProviderId(item.providerKey))
    .map((item) => ({
      providerId: item.providerKey,
      modelId: normalizeModelKey(item.modelId),
      name: modelNameById.value.get(normalizeModelKey(item.modelId)) ?? item.modelId,
    })),
)
const activeQuickModelItems = computed(() => {
  if (modelQuickMode.value === 'favorites') return favoriteDisplayItems.value
  if (modelQuickMode.value === 'recents') return recentDisplayItems.value
  return []
})
const activeQuickModelEmptyText = computed(() => {
  if (modelQuickMode.value === 'favorites') return t('composer.modelPicker.noFavorites')
  if (modelQuickMode.value === 'recents') return t('composer.modelPicker.noRecents')
  return null
})
const currentModelDisplayName = computed(() => {
  if (compatibleRouteIntent.value) {
    const source = compatibleRouteSources.value.find((item) =>
      item.providerInstanceId === compatibleRouteIntent.value?.providerInstanceId)
    const model = source?.models.find((item) => item.modelId === compatibleRouteIntent.value?.modelId)
    return `${source?.providerName ?? compatibleRouteIntent.value.providerInstanceId} · ${model?.displayName ?? compatibleRouteIntent.value.modelId}`
  }
  const selection = selectedModelSelection.value
  if (!selection) return t('chat.console.runtime.noProviderSelected')
  const providerModelKey = buildProviderModelKey(selection)
  const displayName = modelNameById.value.get(providerModelKey) ?? modelNameById.value.get(selectedModel.value) ?? selectedModel.value
  const providerName = providerNameById.value.get(selection.providerId) ?? selection.providerId
  return selection.providerId === OPENROUTER_PROVIDER_ID
    ? displayName
    : `${providerName} · ${displayName}`
})

function isSelectedModel(modelId: string): boolean {
  return normalizeModelKey(modelId) === selectedModel.value
}

function modelChipClass(modelId: string): string {
  return isSelectedModel(modelId)
    ? 'border-blue-300 bg-blue-50 text-blue-700'
    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return Math.min(500, parsed)
}

function activePrefsScope(): ModelPrefsScopeInput {
  const scopeType = props.modelPrefsScope?.scopeType
  const scopeId = String(props.modelPrefsScope?.scopeId ?? '').trim()
  if ((scopeType === 'project' || scopeType === 'conversation') && scopeId) {
    return { scopeType, scopeId }
  }
  return { scopeType: 'global', scopeId: '' }
}

function secondaryFavoriteScope(): ModelPrefsScopeInput | null {
  const scope = activePrefsScope()
  return scope.scopeType === 'global' ? null : scope
}

function mergeFavoriteLists(primary: readonly ModelPrefsFavorite[], secondary: readonly ModelPrefsFavorite[]): FavoriteViewModel[] {
  const seen = new Set<string>()
  const merged: FavoriteViewModel[] = []
  for (const [items, ownedByActiveScope] of [[primary, true], [secondary, false]] as const) for (const item of items) {
    const modelKey = String(item.modelKey ?? '').trim()
    if (!modelKey || seen.has(modelKey)) continue
    seen.add(modelKey)
    merged.push({ ...item, ownedByActiveScope })
  }
  return merged
}

async function hydrateMaxRecentModels() {
  const fromProp = normalizePositiveInteger(props.maxRecentModels, 0)
  if (fromProp > 0) {
    maxRecentModels.value = fromProp
    recentModels.value = recentModels.value.slice(0, maxRecentModels.value)
    return
  }
  const store = getElectronStore()
  if (!store) return
  const stored = await store.get(MAX_RECENT_MODELS_KEY)
  maxRecentModels.value = normalizePositiveInteger(stored, maxRecentModels.value)
  recentModels.value = recentModels.value.slice(0, maxRecentModels.value)
}

async function refreshQuickModels() {
  const scopedFavoriteScope = secondaryFavoriteScope()
  const [scopedFavorites, globalFavorites, globalRecents] = await Promise.all([
    scopedFavoriteScope ? ModelPrefsService.listFavorites(scopedFavoriteScope, { forceRefresh: true }) : Promise.resolve([]),
    ModelPrefsService.listFavorites({ scopeType: 'global', scopeId: '' }, { forceRefresh: true }),
    ModelPrefsService.listRecents({ scopeType: 'global', scopeId: '' }, {
      forceRefresh: true,
      limit: maxRecentModels.value,
    }),
  ])
  ownedFavoriteModels.value = scopedFavoriteScope ? scopedFavorites : globalFavorites
  favoriteModels.value = scopedFavoriteScope
    ? mergeFavoriteLists(scopedFavorites, globalFavorites)
    : globalFavorites.map((item) => ({ ...item, ownedByActiveScope: true }))
  recentModels.value = globalRecents.slice(0, maxRecentModels.value)
}

async function hydrateModelPickerPrefs() {
  await Promise.all([hydrateMaxRecentModels(), refreshQuickModels()])
}

function onDraftInput(event: Event) {
  emit('update:draft', (event.target as HTMLTextAreaElement).value)
}

function onDraftKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  if (isSendButtonEnabled.value) emit('send')
}

function toggleAttachmentMenu() {
  if (props.disabled || props.isRunning) return
  if (attachmentMenuOpen.value) {
    closeAttachmentMenu()
    return
  }
  void openAttachmentMenu()
}

async function openAttachmentMenu() {
  if (props.disabled || props.isRunning) return
  attachmentMenuOpenToken += 1
  const token = attachmentMenuOpenToken
  attachmentMenuError.value = null
  attachmentMenuReady.value = false
  attachmentMenuStyle.value = {}
  attachmentMenuOpen.value = true
  addAttachmentMenuListeners()
  await nextTick()
  if (!attachmentMenuOpen.value || token !== attachmentMenuOpenToken) return
  scheduleAttachmentMenuMeasurement(token, 1)
}

function closeAttachmentMenu() {
  attachmentMenuOpenToken += 1
  clearAttachmentMenuState()
  attachmentMenuOpen.value = false
  removeAttachmentMenuListeners()
}

function requestAttachFiles() {
  closeAttachmentMenu()
  emit('attachFilesRequested')
}

function requestAttachImages() {
  closeAttachmentMenu()
  emit('attachImagesRequested')
}

function requestAttachUrl() {
  closeAttachmentMenu()
  emit('attachUrlRequested', null)
}

function onDrop(event: DragEvent) {
  emit('drop', event)
}

function onPaste(event: ClipboardEvent) {
  emit('paste', event)
}

function onImageChipOption(value: string) {
  const resolutions = imageGenerationSizeOptions.value
  const aspectRatios = imageGenerationAspectRatioOptions.value
  if (showImageGenerationSizeControl.value && (resolutions as readonly string[]).includes(value)) {
    emit('updateImageGenerationResolution', value as ChatSessionConfigImageResolution)
  } else if ((aspectRatios as readonly string[]).includes(value)) {
    emit('updateImageGenerationAspectRatio', value as ChatSessionConfigAspectRatio)
  }
}

function onGoogleThinkingToggle() {
  if (isGoogleImageGenerationModel.value) return
  if (googleThinkingCapability.value.kind === 'unsupported') return
  const current = resolvedSessionConfig.value.generationParams.detail ?? {}
  if (googleThinkingEnabled.value) {
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

function onGoogleThinkingBudgetInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'budget' || !Number.isSafeInteger(raw) || raw <= 0 || !isProjectedGeminiThinkingBudgetValid(capability, raw)) return
  emit('updateGenerationParamsLayer', {
    ...(resolvedSessionConfig.value.generationParams.detail ?? {}),
    thinkingLevel: { mode: 'omit' },
    thinkingBudget: { mode: 'custom', value: raw },
  })
}

function onGoogleThinkingBudgetModeInput(event: Event) {
  const mode = (event.target as HTMLSelectElement).value
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'budget') return
  const current = resolvedSessionConfig.value.generationParams.detail ?? {}
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

function onGoogleThinkingLevelInput(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (isGoogleImageGenerationModel.value) {
    const policy = googleImageGenerationPolicy.value
    if (!(policy.thinkingLevels as readonly string[]).includes(value)) return
    emit('updateGenerationParamsLayer', {
      ...(resolvedSessionConfig.value.generationParams.detail ?? {}),
      thinkingLevel: { mode: 'custom', value: value as GeminiThinkingLevel },
    })
    return
  }
  const capability = googleThinkingCapability.value
  if (capability.kind !== 'level') return
  if (value === 'default') {
    emit('updateGenerationParamsLayer', {
      ...(resolvedSessionConfig.value.generationParams.detail ?? {}),
      thinkingBudget: { mode: 'omit' },
      thinkingLevel: { mode: 'omit' },
    })
    return
  }
  if (!(capability.levels as readonly string[]).includes(value)) return
  const level = value as GeminiThinkingLevel
  emit('updateGenerationParamsLayer', {
    ...(resolvedSessionConfig.value.generationParams.detail ?? {}),
    thinkingBudget: { mode: 'omit' },
    thinkingLevel: { mode: 'custom', value: level },
  })
}

function onGoogleThinkingIncludeThoughtsInput(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked
  emit('updateGenerationParamsLayer', {
    ...(resolvedSessionConfig.value.generationParams.detail ?? {}),
    ...(isGoogleImageGenerationModel.value
      ? { thoughtSummaryMode: { mode: 'custom', value: enabled ? 'auto' : 'none' } as const }
      : { includeThoughts: { mode: 'custom', value: enabled } as const }),
  })
}

async function loadCompatibleRouteSources() {
  try {
    const registry = createCompatibleProviderRegistryClient()
    const catalog = createCompatibleCatalogClient()
    const providers = await registry.list()
    compatibleRouteSources.value = await Promise.all(providers.filter((details) => details.provider.status === 'active').map(async (details) => {
      const result = await catalog.query({ providerInstanceId: details.provider.providerInstanceId, includeStale: true, limit: 200 })
      return {
        providerInstanceId: details.provider.providerInstanceId,
        providerName: details.provider.displayName,
        models: result.items.map((model) => ({
          modelId: model.modelId,
          displayName: model.metadata.displayName ?? model.modelId,
          sourceLabel: model.sourcePresence.manual && model.sourcePresence.remote !== 'absent' ? 'manual + remote' : model.sourcePresence.manual ? 'manual' : model.sourcePresence.remote === 'stale' ? 'remote stale' : 'remote',
          routeIntent: createCompatibleRouteIntent({
            providerInstanceId: details.provider.providerInstanceId,
            modelId: model.modelId,
          }),
        })),
      }
    }))
  } catch {
    compatibleRouteSources.value = []
  }
}

function openModelPicker() {
  if (props.disabled) return
  modelQuickMode.value = null
  modelQuickSelectionError.value = null
  modelPickerOpen.value = true
  void loadCompatibleRouteSources()
}

function closeModelPicker() {
  modelPickerOpen.value = false
}

function setModelQuickMode(mode: 'favorites' | 'recents') {
  if (props.disabled) return
  modelPickerOpen.value = false
  modelQuickSelectionError.value = null
  modelQuickMode.value = modelQuickMode.value === mode ? null : mode
  void hydrateModelPickerPrefs()
}

function rememberModelDisplayName(modelId: string, displayName?: string) {
  const normalized = normalizeModelKey(modelId)
  const name = String(displayName ?? '').trim()
  if (!normalized || !name || name === normalized) return
  modelDisplayNameOverrides.value = {
    ...modelDisplayNameOverrides.value,
    [normalized]: name,
  }
}

function onOpenAIResponsesReasoningSelect(value: string) {
  if (!openAIResponsesReasoningSupported.value) return
  if (!(openAIResponsesReasoningOptions.value as readonly string[]).includes(value)) return
  const current = resolvedSessionConfig.value.generationParams.detail ?? {}
  emit('updateGenerationParamsLayer', {
    ...current,
    reasoningEffort: { mode: 'custom', value: value as OpenAIResponsesReasoningEffortSetting },
  })
}

function onOpenAIResponsesReasoningSummarySelect(value: string) {
  if (!openAIResponsesReasoningSupported.value) return
  if (!(openAIResponsesReasoningSummaryOptions.value as readonly string[]).includes(value)) return
  const current = resolvedSessionConfig.value.generationParams.detail ?? {}
  emit('updateGenerationParamsLayer', {
    ...current,
    reasoningSummary: value === 'off'
      ? { mode: 'omit' }
      : { mode: 'custom', value: value as Exclude<OpenAIResponsesReasoningSummarySetting, 'off'> },
  })
}

function onOpenAIResponsesReasoningToggle() {
  if (!openAIResponsesReasoningSupported.value) return
  onOpenAIResponsesReasoningSelect('auto')
}

function onSelectModelFromPicker(selection: ConversationRouteSelection, displayName?: string) {
  if (selection.kind === 'provider_model') {
    rememberModelDisplayName(selection.modelId, displayName)
  }
  modelPickerOpen.value = false
}

async function onToggleCurrentModelFavorite() {
  const modelId = normalizeModelKey(selectedModel.value)
  const providerId = selectedProvider.value
  if (!modelId || !providerId || (providerId === OPENROUTER_PROVIDER_ID && modelId === DEFAULT_OPENROUTER_MODEL_ID)) return
  await ModelPrefsService.toggleFavorite(
    {
      providerKey: providerId,
      modelId,
    },
    activePrefsScope(),
  )
  await refreshQuickModels()
}

async function onToggleModelPickerFavorite(providerId: RuntimeProviderId, modelId: string) {
  const normalized = normalizeModelKey(modelId)
  if (!normalized) return
  await ModelPrefsService.toggleFavorite(
    {
      providerKey: providerId,
      modelId: normalized,
    },
    activePrefsScope(),
  )
  await refreshQuickModels()
}

async function onReorderModelPickerFavorites(orderedModelKeys: string[]) {
  const scope = activePrefsScope()
  const currentKeys = ownedFavoriteModels.value.map((item) => item.modelKey)
  const orderedSet = new Set(orderedModelKeys)
  const removed = currentKeys.filter((key) => !orderedSet.has(key))
  await Promise.all(
    removed.map((modelKey) => {
      const item = ownedFavoriteModels.value.find((candidate) => candidate.modelKey === modelKey)
      return item
        ? ModelPrefsService.removeFavorite({ providerKey: item.providerKey, modelId: item.modelId }, scope)
        : Promise.resolve({ ok: false, removed: 0, error: 'favorite_not_found' })
    }),
  )
  if (orderedModelKeys.length > 0) {
    await ModelPrefsService.reorderFavorites(orderedModelKeys, scope)
  }
  await refreshQuickModels()
}

async function onSelectQuickModel(providerId: RuntimeProviderId, modelId: string) {
  const command = appIdentity ? catalogModelSelectionCommandV2ForApp(appIdentity) : null
  if (!command) {
    modelQuickSelectionError.value = 'CATALOG_MODEL_SELECTION_COMMAND_UNAVAILABLE'
    return
  }
  const selection = createProviderModelRouteSelection({ providerId, modelId })
  modelQuickSelectionError.value = null
  try {
    await command(selection)
  } catch (error) {
    modelQuickSelectionError.value = error instanceof Error ? error.message : String(error)
  }
}

function shouldRefreshForModelPrefsEvent(event: Readonly<{ scopeType: string; scopeId: string }>): boolean {
  if (event.scopeType === 'global' && event.scopeId === '') return true
  const secondary = secondaryFavoriteScope()
  return Boolean(secondary && event.scopeType === secondary.scopeType && event.scopeId === String(secondary.scopeId ?? ''))
}

function onMaxRecentModelsUpdated(event: Event) {
  const detail = (event as CustomEvent).detail
  maxRecentModels.value = normalizePositiveInteger(detail, maxRecentModels.value)
  recentModels.value = recentModels.value.slice(0, maxRecentModels.value)
}

watch(modelPickerOpen, (open) => {
  if (!open) {
    if (unsubscribeModelPrefs) {
      unsubscribeModelPrefs()
      unsubscribeModelPrefs = null
    }
    window.removeEventListener('settings:maxRecentModelsUpdated', onMaxRecentModelsUpdated)
    return
  }
  void hydrateModelPickerPrefs()
  if (!unsubscribeModelPrefs) {
    unsubscribeModelPrefs = ModelPrefsService.subscribe((event) => {
      if (event.reason === 'refresh') return
      if (!modelPickerOpen.value || !shouldRefreshForModelPrefsEvent(event)) return
      void refreshQuickModels()
    })
  }
  window.addEventListener('settings:maxRecentModelsUpdated', onMaxRecentModelsUpdated)
})

watch(() => compatibleRouteIntent.value?.providerInstanceId ?? null, (providerInstanceId) => {
  if (providerInstanceId) void loadCompatibleRouteSources()
}, { immediate: true })

onMounted(() => {
  void hydrateModelPickerPrefs()
})

onBeforeUnmount(() => {
  removeAttachmentMenuListeners()
  cancelAttachmentMenuFrame()
  window.removeEventListener('settings:maxRecentModelsUpdated', onMaxRecentModelsUpdated)
  if (unsubscribeModelPrefs) {
    unsubscribeModelPrefs()
    unsubscribeModelPrefs = null
  }
})
</script>

<template>
  <div class="space-y-3 px-4 py-3" @dragover.prevent @drop="onDrop" @paste="onPaste">
    <div class="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <textarea
        class="min-h-[96px] w-full resize-none border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
        :disabled="props.disabled"
        :value="props.draft"
        :placeholder="t('composer.placeholder.default')"
        data-testid="composer-draft"
        @input="onDraftInput"
        @keydown="onDraftKeydown"
      />

      <div
        v-if="historyIncompatibleSummary?.hasItems"
        class="mt-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
        data-testid="composer-history-incompatible-warning"
      >
        <span class="truncate">
          {{ historyIncompatibleSummary.warningText }}
        </span>
        <button
          type="button"
          class="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100"
          data-testid="composer-history-incompatible-review"
          @click="emit('reviewHistoryIncompatible')"
        >
          {{ t('composer.status.review') }}
        </button>
        <template v-if="historyIncompatibleSummary.navigationActive">
          <button
            type="button"
            class="shrink-0 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100"
            data-testid="composer-history-incompatible-prev"
            @click="emit('navigateHistoryIncompatiblePrev')"
          >
            &lt;
          </button>
          <span class="shrink-0 font-mono text-[11px]" data-testid="composer-history-incompatible-index">
            {{ `${historyIncompatibleSummary.currentIndex}/${historyIncompatibleSummary.count}` }}
          </span>
          <button
            type="button"
            class="shrink-0 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100"
            data-testid="composer-history-incompatible-next"
            @click="emit('navigateHistoryIncompatibleNext')"
          >
            &gt;
          </button>
        </template>
      </div>

      <div
        v-if="props.attachmentFeedbackMessage"
        class="mt-2 rounded-md border px-3 py-2 text-[11px]"
        :class="attachmentFeedbackClass"
        data-testid="composer-attachment-feedback"
      >
        {{ props.attachmentFeedbackMessage }}
      </div>

      <div
        v-if="attachmentMenuError"
        class="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800"
        role="status"
        aria-live="polite"
        data-testid="composer-attachment-menu-error"
      >
        {{ attachmentMenuError }}
      </div>

      <div class="mt-3 flex items-center justify-between gap-3">
        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
          <button
            ref="attachmentToggleRef"
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="props.disabled || props.isRunning"
            data-testid="composer-attach-toggle"
            @click="toggleAttachmentMenu"
          >
            +
          </button>
          <ComposerCapabilityChip
            v-if="isOpenAIResponsesSelected"
            :enabled="openAIResponsesReasoningSupported"
            :label="t('composer.capabilities.reasoning')"
            :active-label="openAIResponsesReasoningActiveLabel"
            kind="reasoning"
            :disabled="disabled || !openAIResponsesReasoningSupported"
            data-test-id="reasoning-chip"
            @toggle="onOpenAIResponsesReasoningToggle"
          >
            <template #icon>
              <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="8" cy="6" r="3" />
                <path d="M8 9v3" />
                <path d="M5 14h6" />
                <path d="M6 12h4" />
              </svg>
            </template>
            <template #menu="{ close }">
              <div class="w-56 space-y-3 px-3 py-2 text-[11px] text-gray-700" data-testid="composer-openai-responses-reasoning-controls">
                <div class="space-y-1.5">
                  <div class="font-medium text-gray-600">{{ t('chat.generationParams.reasoning.effort') }}</div>
                  <div class="grid grid-cols-2 gap-1">
                    <button
                      v-for="option in openAIResponsesReasoningOptions"
                      :key="option"
                      type="button"
                      class="rounded border px-2 py-1 text-left transition-colors hover:bg-gray-50"
                      :class="openAIResponsesReasoningValue === option ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'"
                      data-testid="composer-openai-responses-reasoning-effort-option"
                      @click="() => { onOpenAIResponsesReasoningSelect(option); close() }"
                    >
                      {{ openAIResponsesReasoningOptionLabels[option] ?? option }}
                    </button>
                  </div>
                </div>
                <div class="space-y-1.5 border-t border-gray-100 pt-2">
                  <div class="font-medium text-gray-600">{{ t('chat.generationParams.reasoning.summary') }}</div>
                  <div class="grid grid-cols-2 gap-1">
                    <button
                      v-for="option in openAIResponsesReasoningSummaryOptions"
                      :key="option"
                      type="button"
                      class="rounded border px-2 py-1 text-left transition-colors hover:bg-gray-50"
                      :class="openAIResponsesReasoningSummaryValue === option ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'"
                      data-testid="composer-openai-responses-reasoning-summary-option"
                      @click="() => { onOpenAIResponsesReasoningSummarySelect(option); close() }"
                    >
                      {{ openAIResponsesReasoningSummaryOptionLabels[option] ?? option }}
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </ComposerCapabilityChip>
          <ComposerCapabilityChip
            v-else-if="!isGoogleAIStudioSelected"
            :enabled="resolvedSessionConfig.reasoning.enabled"
            :label="t('composer.capabilities.reasoning')"
            :active-label="resolvedSessionConfig.reasoning.enabled ? resolvedSessionConfig.reasoning.effort : null"
            kind="reasoning"
            :disabled="disabled || genericReasoningEffortOptions.length === 0"
            :options="genericReasoningEffortOptions"
            :selected-option="resolvedSessionConfig.reasoning.effort"
            data-test-id="reasoning-chip"
            @toggle="emit('updateReasoningEnabled', !resolvedSessionConfig.reasoning.enabled)"
            @select-option="(v) => emit('updateReasoningEffort', v as ChatSessionConfigReasoningEffort)"
          >
            <template #icon>
              <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="8" cy="6" r="3" />
                <path d="M8 9v3" />
                <path d="M5 14h6" />
                <path d="M6 12h4" />
              </svg>
            </template>
          </ComposerCapabilityChip>
          <ComposerCapabilityChip
            v-else-if="!(isGoogleImageGenerationModel && !googleImageGenerationPolicy.supportsThoughtSummaries && googleImageGenerationPolicy.thinkingLevels.length === 0)"
            :enabled="googleThinkingEnabled"
            :label="t('composer.capabilities.reasoning')"
            :active-label="googleThinkingActiveLabel"
            kind="reasoning"
            :disabled="disabled || (isGoogleImageGenerationModel && !googleImageGenerationPolicy.supportsThoughtSummaries && googleImageGenerationPolicy.thinkingLevels.length === 0) || (!isGoogleImageGenerationModel && googleThinkingCapability.kind === 'unsupported')"
            data-test-id="google-thinking-chip"
            @toggle="onGoogleThinkingToggle"
          >
            <template #icon>
              <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="8" cy="6" r="3" />
                <path d="M8 9v3" />
                <path d="M5 14h6" />
                <path d="M6 12h4" />
              </svg>
            </template>
            <template #menu>
              <div
                class="w-52 space-y-2 px-3 py-2 text-[11px] text-gray-700"
                data-testid="composer-google-thinking-controls"
              >
                <template v-if="!isGoogleImageGenerationModel && googleThinkingCapability.kind === 'budget'">
                  <label class="space-y-1">
                    <span class="block font-medium text-gray-600">{{ t('chat.console.reasoning.thinkingBudget') }}</span>
                    <select
                      class="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-800 disabled:opacity-50"
                      :value="googleThinkingBudgetMode"
                      :disabled="disabled"
                      data-testid="composer-google-thinking-budget-mode"
                      @change="onGoogleThinkingBudgetModeInput"
                    >
                      <option value="default">{{ tf('chat.console.reasoning.default', { value: googleThinkingCapability.defaultBudgetMode === 'dynamic' ? t('chat.console.reasoning.dynamic') : t('chat.console.reasoning.off') }) }}</option>
                      <option v-if="googleThinkingCapability.allowDynamic" value="dynamic">{{ t('chat.console.reasoning.dynamic') }}</option>
                      <option v-if="googleThinkingCapability.allowOff" value="off">{{ t('chat.console.reasoning.off') }}</option>
                      <option value="fixed">{{ t('chat.console.reasoning.fixedBudget') }}</option>
                    </select>
                  </label>
                  <label v-if="googleThinkingBudgetMode === 'fixed'" class="space-y-1">
                    <span class="block font-medium text-gray-600">{{ t('chat.console.reasoning.fixedBudget') }}</span>
                    <input
                      type="number"
                      class="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-800 disabled:opacity-50"
                      :min="googleThinkingCapability.minBudget"
                      :max="googleThinkingCapability.maxBudget"
                      :value="googleThinkingBudgetInput"
                      :disabled="disabled"
                      data-testid="composer-google-thinking-budget"
                      @input="onGoogleThinkingBudgetInput"
                    />
                    <span class="block text-[10px] text-gray-500">{{ tf('chat.console.reasoning.allowedRange', { min: googleThinkingCapability.minBudget, max: googleThinkingCapability.maxBudget }) }}</span>
                  </label>
                </template>
                <template v-else-if="isGoogleImageGenerationModel && googleImageGenerationPolicy.thinkingLevels.length > 0">
                  <label class="space-y-1">
                    <span class="block font-medium text-gray-600">{{ t('chat.console.reasoning.thinkingLevel') }}</span>
                    <select
                      class="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-800 disabled:opacity-50"
                      :value="googleThinkingActiveLabel"
                      :disabled="disabled"
                      data-testid="composer-google-thinking-level"
                      @change="onGoogleThinkingLevelInput"
                    >
                      <option v-for="level in googleImageGenerationPolicy.thinkingLevels" :key="level" :value="level">{{ level }}</option>
                    </select>
                  </label>
                </template>
                <template v-else-if="!isGoogleImageGenerationModel && googleThinkingCapability.kind === 'level'">
                  <label class="space-y-1">
                    <span class="block font-medium text-gray-600">{{ t('chat.console.reasoning.thinkingLevel') }}</span>
                    <select
                      class="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-800 disabled:opacity-50"
                      :value="googleThinkingLevelSelection"
                      :disabled="disabled"
                      data-testid="composer-google-thinking-level"
                      @change="onGoogleThinkingLevelInput"
                    >
                      <option value="default">{{ tf('chat.console.reasoning.default', { value: googleThinkingCapability.defaultLevel }) }}</option>
                      <option v-for="level in googleThinkingCapability.levels" :key="level" :value="level">{{ googleThinkingLevelLabel(level) }}</option>
                    </select>
                  </label>
                </template>
                <label
                  v-if="isGoogleImageGenerationModel ? googleImageGenerationPolicy.supportsThoughtSummaries : googleThinkingCapability.kind !== 'unsupported'"
                  class="flex items-center gap-1.5"
                >
                  <input
                    type="checkbox"
                    :checked="googleThinkingConfig.includeThoughts === true"
                    :disabled="disabled"
                    data-testid="composer-google-thinking-include-thoughts"
                    @change="onGoogleThinkingIncludeThoughtsInput"
                  />
                  <span>{{ t('chat.console.reasoning.includeThoughts') }}</span>
                </label>
                <div
                  v-if="isGoogleImageGenerationModel"
                  class="text-[11px] text-gray-500"
                  data-testid="composer-google-thinking-provider-managed"
                >
                  {{ t('chat.console.reasoning.geminiImageProviderManaged') }}
                </div>
              </div>
            </template>
          </ComposerCapabilityChip>
          <ComposerCapabilityChip
            :enabled="resolvedSessionConfig.webSearch.enabled"
            :label="t('composer.capabilities.webSearch')"
            :active-label="resolvedSessionConfig.webSearch.enabled ? resolvedSessionConfig.webSearch.level : null"
            kind="webSearch"
            :disabled="disabled"
            :options="['low', 'high']"
            :selected-option="resolvedSessionConfig.webSearch.level"
            data-test-id="web-search-chip"
            @toggle="emit('updateWebSearchEnabled', !resolvedSessionConfig.webSearch.enabled)"
            @select-option="(v) => emit('updateWebSearchLevel', v as 'low' | 'high')"
          >
            <template #icon>
              <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="8" cy="8" r="5" />
                <path d="M3 8h10" />
                <path d="M8 3c1.5 1.5 2 3 2 5s-.5 3.5-2 5" />
                <path d="M8 3c-1.5 1.5-2 3-2 5s.5 3.5 2 5" />
              </svg>
            </template>
          </ComposerCapabilityChip>
          <ComposerCapabilityChip
            :enabled="effectiveImageGenerationEnabled"
            :label="t('composer.capabilities.image')"
            :active-label="effectiveImageGenerationActiveLabel"
            kind="image"
            :disabled="disabled"
            :options="imageChipOptions"
            :selected-option="null"
            data-test-id="image-chip"
            @toggle="isGoogleImageGenerationModel ? emit('updateImageGenerationEnabled', true) : emit('updateImageGenerationEnabled', !resolvedSessionConfig.imageGeneration.enabled)"
            @select-option="onImageChipOption"
          >
            <template #icon>
              <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="2" width="12" height="12" rx="1.5" />
                <circle cx="5.5" cy="5.5" r="1" />
                <path d="M14 10l-3-3-7 7" />
              </svg>
            </template>
          </ComposerCapabilityChip>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="isSendButtonStop"
            type="button"
            class="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            data-testid="composer-stop"
            @click="emit('abort')"
          >
            {{ t('composer.actions.stop') }}
          </button>
          <button
            v-else
            type="button"
            class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            :disabled="!isSendButtonEnabled"
            :title="sendPlanBlockingSummary ? t(sendPlanBlockingSummary) : undefined"
            data-testid="composer-send"
            @click="emit('send')"
          >
            <span v-if="isSendButtonBusy" class="inline-block animate-spin mr-1">⟳</span>
            {{ t('composer.actions.send') }}
          </button>
        </div>
      </div>

      <div
        v-if="props.isSendPlanLoading"
        class="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-700"
        data-testid="composer-send-gate-loading"
      >
        {{ t('composer.status.updatingSendPlan') }}
      </div>
      <div
        v-else-if="sendPlanBlockingSummary"
        class="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800"
        data-testid="composer-send-gate-block"
      >
        {{ t(sendPlanBlockingSummary) }}
      </div>
      <div
        v-else-if="sendPlanWarningSummary"
        class="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
        data-testid="composer-send-gate-warning"
      >
        {{ t(sendPlanWarningSummary) }}
      </div>
    </div>

    <div class="space-y-2 text-xs text-gray-600">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <div class="font-semibold uppercase tracking-wide text-gray-500">Model</div>
        <button
          type="button"
          class="max-w-[20rem] truncate rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          :disabled="props.disabled"
          data-testid="current-model-pill"
          @click="openModelPicker"
        >
          {{ currentModelDisplayName }}
        </button>
        <button
          type="button"
          class="rounded-md border px-2 py-1 text-[11px] leading-none shadow-sm disabled:opacity-50"
          :class="
            currentModelIsFavorite
              ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          "
          :disabled="props.disabled || props.isRunning || selectedModel === DEFAULT_OPENROUTER_MODEL_ID || selectedProvider !== OPENROUTER_PROVIDER_ID"
          data-testid="current-model-favorite-toggle"
          @click="onToggleCurrentModelFavorite"
        >
          {{ currentModelIsFavorite ? '★' : '☆' }}
        </button>
        <div class="grid w-44 grid-cols-2 gap-1" data-testid="model-quick-mode-tabs">
          <button
            type="button"
            class="flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] shadow-sm disabled:opacity-50"
            :class="modelQuickMode === 'favorites' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'"
            :disabled="props.disabled"
            title="Favorite models"
            data-testid="model-main-tab-favorites"
            @click="setModelQuickMode('favorites')"
          >
            <span aria-hidden="true">★</span>
            <span>Fav</span>
          </button>
          <button
            type="button"
            class="flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] shadow-sm disabled:opacity-50"
            :class="modelQuickMode === 'recents' ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'"
            :disabled="props.disabled"
            title="Recent models in this session"
            data-testid="model-main-tab-recents"
            @click="setModelQuickMode('recents')"
          >
            <span aria-hidden="true">↺</span>
            <span>Rec</span>
          </button>
        </div>
      </div>

      <div
        v-if="modelQuickMode"
        class="flex max-w-full items-center gap-1 overflow-x-auto pl-[3.25rem]"
        data-testid="favorites-strip"
      >
        <div
          v-if="activeQuickModelItems.length === 0"
          class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-500"
          data-testid="model-main-empty-state"
        >
          {{ activeQuickModelEmptyText }}
        </div>
        <template v-else>
          <button
            v-for="item in activeQuickModelItems"
            :key="`${modelQuickMode}-model-${item.modelId}`"
            type="button"
            class="rounded-md border px-2 py-1 text-[11px] shadow-sm disabled:opacity-50"
            :class="modelChipClass(item.modelId)"
            :disabled="disabled"
            :data-testid="`${modelQuickMode === 'favorites' ? 'favorite' : 'recent'}-model-${item.modelId}`"
            :aria-pressed="isSelectedModel(item.modelId)"
            @click="onSelectQuickModel(item.providerId, item.modelId)"
          >
            {{ item.name }}
          </button>
        </template>
      </div>
      <div
        v-if="modelQuickSelectionError"
        class="ml-[3.25rem] mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700"
        data-testid="model-quick-selection-error"
      >
        {{ modelQuickSelectionError }}
      </div>
    </div>
  </div>

    <Teleport to="body">
      <div
        v-if="attachmentMenuOpen"
        ref="attachmentMenuRef"
        class="overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg"
        :style="attachmentMenuReady ? attachmentMenuStyle : attachmentMenuHiddenStyle"
        :aria-hidden="!attachmentMenuReady"
        data-testid="composer-attach-menu"
      >
        <button
          type="button"
          class="block w-full rounded px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          :disabled="props.disabled || props.isRunning"
          data-testid="composer-attach-file"
          @click="requestAttachFiles"
        >
          {{ t('composer.actions.uploadFile') }}
        </button>
        <button
          type="button"
          class="block w-full rounded px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          :disabled="props.disabled || props.isRunning || props.imageInputSupported === false"
          :title="props.imageInputSupported === false ? props.imageInputDisabledReason ?? t('errors.attachment.modelNoImageSupport') : undefined"
          data-testid="composer-attach-image"
          @click="requestAttachImages"
        >
          {{ t('composer.actions.uploadImage') }}
        </button>
        <button
          type="button"
          class="block w-full rounded px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          :disabled="props.disabled || props.isRunning"
          data-testid="composer-attach-url"
          @click="requestAttachUrl"
        >
          {{ t('composer.actions.uploadLink') }}
        </button>
      </div>
    </Teleport>

  <ModelPickerDialog
    :open="modelPickerOpen"
    :disabled="props.disabled"
    :isRunning="props.isRunning"
    :routeSelection="resolvedSessionConfig.routeSelection"
    :providerSources="props.providerModelSources ?? []"
    :compatibleRouteSources="compatibleRouteSources"
    :favoriteModelKeys="favoriteModelKeys"
    :favoriteEditableModelKeys="favoriteEditableModelKeys"
    :recentModelKeys="recentModelKeys"
    :notice="props.modelCatalogNotice"
    :queryFn="props.modelPickerQueryFn"
    @close="closeModelPicker"
    @select="onSelectModelFromPicker"
    @toggleFavorite="onToggleModelPickerFavorite"
    @reorderFavorites="onReorderModelPickerFavorites"
  />
  <div v-if="compatibleRouteIntent" class="mt-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900" data-testid="compatible-send-selection">
    {{ compatibleRouteSources.find((source) => source.providerInstanceId === compatibleRouteIntent?.providerInstanceId)?.providerName ?? compatibleRouteIntent.providerInstanceId }} · {{ compatibleRouteIntent.modelId }}
  </div>
</template>

import { computed, getCurrentInstance, markRaw, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { t, tf } from '@/shared/i18n'
import type { ErrorPanelViewModel } from '@/ui-kit/chat/types'
import type { CompletionOutcome, MessageState, MessageVM, ReasoningEffort, RequestedReasoningMode, ReasoningPrefs, RootState, StreamEndReason } from '@/next/state/types'
import {
  saveConvo,
  type ConvoSummary,
} from '@/next/convo/convoClient'
import {
  getSystemChatTemplate,
  getLastFormalConversationId,
  resetSystemChatTemplate,
  setLastFormalConversationId,
  updateSystemChatTemplateConfig,
  type SystemChatTemplateSnapshot,
} from '@/next/convo/systemChatTemplateClient'
import {
  BranchProjectionRefreshCoordinator,
  buildBranchViewSnapshot,
  emptyBranchViewSnapshot,
  mergePersistedMessageWithRuntimeOverlay,
  type BranchProjectionRefreshLease,
  type BranchViewSnapshot,
} from './branchViewProjection'
import {
  listMessageErrorEnvelopes,
  type PersistedProviderNativeContent,
} from '@/next/message/messageClient'
import { saveProject, type ProjectSummary } from '@/next/project/projectClient'
import { getReasoningPrefs, setReasoningPrefs } from '@/next/settings/reasoningPrefsClient'
import {
  ensureGenerationV2DefaultWorkspace,
  getGenerationV2Config,
  updateGenerationV2Config,
  createGenerationV2Project,
  deleteGenerationV2Branch,
  deleteGenerationV2Conversation,
  deleteGenerationV2Project,
  forkGenerationV2Branch,
  listGenerationV2Branches,
  listGenerationV2Conversations,
  listGenerationV2Projects,
  moveGenerationV2Conversation,
  readGenerationV2Branch,
  renameGenerationV2Conversation,
  renameGenerationV2Project,
  getGenerationV2MessageCandidateNavigation,
  setGenerationV2ContextFilter,
  clearGenerationV2ContextFilter,
  truncateGenerationV2BranchFromQuestion,
  listGenerationV2LocalProfiles,
  createGenerationV2LocalProfile,
  getGenerationV2ConversationRoutePreference,
  updateGenerationV2ConversationRoutePreference,
  clearGenerationV2ConversationRoutePreference,
  type GenerationV2BranchView,
  type GenerationV2BranchCursor,
  type GenerationV2ConfigLayerView,
  type GenerationV2ConversationCursor,
  type GenerationV2ConversationRoutePreferenceSnapshot,
  type GenerationV2MessageCandidateNavigation,
} from '@/next/generation-v2/renderer/generationV2WorkspaceClient'
import { projectGenerationV2BranchForExistingUi } from '@/next/generation-v2/renderer/generationV2BranchProjection'
import { abortGenerationV2, submitGenerationV2EditResend, submitGenerationV2Initial, submitGenerationV2Regenerate, submitGenerationV2Retry, subscribeGenerationV2Runtime,
  type GenerationV2Route, type GenerationV2RuntimeUpdate } from '@/next/generation-v2/renderer/generationV2CommandClient'
import {
  BranchRuntimeCacheV2,
  type BranchRuntimeCacheEntryV2,
} from '@/next/generation-v2/renderer/branchRuntimeCacheV2'
import { projectProviderFailureForUiV2 } from '@/shared/provider/providerFailureUiProjectionV2'
import {
  providerFailureFromUnknownV2,
  providerFailurePrimaryMessageV2,
  type ProviderFailureV2,
} from '@/shared/provider/providerFailureV2'
import {
  getOpenRouterImageEndpointSelectionV2,
  selectOpenRouterImageEndpointV2,
  updateOpenRouterImageEndpointSettingsV2,
  type OpenRouterImageEndpointSelectionClientStateV2,
} from '@/next/generation-v2/renderer/openRouterImageEndpointClientV2'
import { getUserMessageRenderDefault } from '@/next/settings/userMessageRenderDefaultClient'
import { getWebSearchDefaults } from '@/next/settings/webSearchDefaultsClient'
import { getImageGenerationDefault } from '@/next/settings/imageGenerationDefaultClient'
import { getDfcAttachmentDefaults, setDfcAttachmentDefaults } from '@/next/settings/dfcAttachmentDefaultsClient'
import { getGenerationParamsDefaults } from '@/next/settings/generationParamsDefaultsClient'
import {
  getChatReasoningDisplayMode,
  setChatReasoningDisplayMode,
} from '@/next/settings/chatDisplayPrefsClient'
import {
  getChatReasoningPanelAutoCollapseAfterReasoning,
  getChatReasoningPanelDefaultExpanded,
  setChatReasoningPanelAutoCollapseAfterReasoning,
  setChatReasoningPanelDefaultExpanded,
} from '@/next/settings/reasoningPanelDefaultClient'
import { selectModelCatalogAll, selectModelCatalogVisible } from '@/next/modelCatalog/modelCatalogSelectors'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import { CatalogQueryService, type CatalogQueryItem } from '@/next/modelCatalog/catalogQueryService'
import {
  catalogRuntimeStoreV2ForApp,
  registerCatalogModelSelectionCommandV2,
} from '@/next/modelCatalog/catalogRuntimeStoreV2'
import type { OpenRouterImageConfig, OpenRouterOutputModality } from '@/next/openrouter/buildRequest'
import { evaluateImageGenerationModel, type ImageCapabilityClass, type ImageModelFilterReason } from '@/next/openrouter/imageGenerationContract'
import {
  DEFAULT_IMAGE_GENERATION_USER_CONFIG,
  normalizeImageGenerationUserConfig,
  type ConvoImageGenerationMode,
  type ImageGenerationUserConfig,
} from '@/next/openrouter/imageGenerationSettingsPersistence'
import { ModelPrefsService } from '@/next/modelPrefs/modelPrefsService'
import { applyEventsBatch, createInitialState, toggleReasoningPanelState } from '@/next/state/reducer'
import { selectMessage, selectRun } from '@/next/state/selectors'
import type { CompatibleConfigurationSelection } from '@/next/provider/openai-chat-compatible/ui'
import {
  createProviderModelRouteSelection,
  type ConversationRouteSelection,
  type ProviderModelRouteSelection,
} from '@/next/provider/conversationRouteSelection'
import type { RuntimeProviderId } from '@/next/provider/runtimeProviderId'
import {
  DEEPSEEK_OFFICIAL_ENDPOINT_ID,
  DEEPSEEK_OFFICIAL_PROFILE_ID,
  DEEPSEEK_OFFICIAL_PROVIDER_KEY,
  type DeepSeekModelAvailabilityResult,
} from '@/next/provider/deepseek/deepSeekModelSource'
import { isDeepSeekSelectableReasoningEffort } from '@/next/provider/deepseek/deepSeekReasoningPolicy'
import {
  OPENROUTER_PROVIDER_ID,
  DEFAULT_OPENROUTER_MODEL_ID,
} from '@/next/provider/modelSelection'
import {
  OPENAI_RESPONSES_ENDPOINT_ID,
  OPENAI_RESPONSES_PROFILE_ID,
  OPENAI_RESPONSES_PROVIDER_KEY,
  type OpenAIModelAvailabilityResult,
} from '@/next/provider/openai-responses/openAIResponsesModelSource'
import {
  GOOGLE_AI_STUDIO_ENDPOINT_ID,
  GOOGLE_AI_STUDIO_PROFILE_ID,
  GOOGLE_AI_STUDIO_PROVIDER_KEY,
  type GeminiModelAvailabilityResult,
} from '@/next/provider/gemini/geminiModelSource'
import {
  isKnownGeminiImageGenerationModel,
  normalizeGeminiImageGenerationModelId,
  resolveGeminiImageGenerationPolicy,
} from '@/next/provider/gemini/geminiImageGenerationPolicy'
import {
  isGeminiThinkingBudgetValid,
  normalizeGeminiThinkingModelId,
  resolveGeminiThinkingCapability,
  type GeminiThinkingCapability,
} from '@/next/provider/gemini/geminiThinkingPolicy'
import { isGeminiInteractionsImageModelIdV1 } from '@/next/generation-v2/providers/gemini/interactionsImageCapabilityPolicyV1'
import {
  ANTHROPIC_MESSAGES_ENDPOINT_ID,
  ANTHROPIC_MESSAGES_PROFILE_ID,
  ANTHROPIC_MESSAGES_PROVIDER_KEY,
  type AnthropicModelAvailabilityResult,
} from '@/next/provider/anthropic/anthropicModelSource'
import type { ReasoningArtifact } from '@/next/provider/reasoningArtifact'
import {
  removeReasoningArtifactsForMessages,
  retainReasoningArtifactsForMessages,
  type ReasoningArtifactsByMessageId,
} from './reasoningArtifactLifecycle'
import { useExperimentalProviderChatSettings } from './useExperimentalProviderChatSettings'
// file ingestion is owned by the V2 composer client below
import type {
  SendPlan,
  SendPlanAttachment,
  SendPlanAttachmentDetectionSummary,
  SendPlanAttachmentFileTypeSummary,
} from '@/shared/files/sendPlanTypes'
import type { DraftAttachmentSendModePreference, DraftAttachmentUrlRetentionPreference, SendMode } from '@/shared/files/fileTypes'
import type {
  DfcDraftAttachmentOptionsDto,
  DfcDraftAttachmentPreviewDto,
  DfcSendAssetRef,
  DfcSendStrategy,
  DfcTargetKind,
} from '@/shared/files/documentFormatConversion'
import {
  clearDfcAttachmentDefaultTarget,
  normalizeDfcAttachmentDefaults,
  normalizeDfcDefaultFileTypeKey,
  setDfcAttachmentDefaultTarget,
  type DfcAttachmentDefaults,
} from '@/shared/files/dfcAttachmentDefaults'
import type { MessageAttachmentDetectionInfo, MessageAttachmentDisplayStatus, MessageAttachmentFileTypeInfo, MessageAttachmentVM } from '@/ui-kit/chat/types'
import type {
  DecodedConversationDraft,
  DecodedDraftAttachment,
  DecodedFileAsset,
  DecodedPreviewPayload,
} from '@/next/ipc/contracts/dbBridgeContracts'
import {
  clearCommittedGenerationV2ComposerDraft,
  addGenerationV2ComposerUrlReference,
  getGenerationV2ComposerDraft,
  importGenerationV2ComposerLocalFile,
  importGenerationV2ComposerUrlFile,
  projectGenerationV2ComposerAttachments,
  readGenerationV2ComposerPreview,
  replaceGenerationV2ComposerDraft,
  replaceGenerationV2ComposerDraftFromAnswerSnapshot,
  removeGenerationV2ComposerAttachment,
  getGenerationV2ComposerDfcOptions,
  getGenerationV2ComposerDfcPreview,
  selectGenerationV2ComposerDfcOption,
  onGenerationV2ComposerFileTypeDetectionUpdated,
  retryGenerationV2ComposerFileTypeDetection,
  updateGenerationV2ComposerText,
  type GenerationV2ComposerDraft,
  type GenerationV2ComposerManagedFileAttachment,
} from '@/next/generation-v2/renderer/generationV2ComposerClient'
import { normalizeExtension } from '@/shared/files/fileRules'
import { syncProviderCatalogsOnStartupV2 } from './providerCatalogStartupSyncV2'

import {
  extractConvoWebSearchOverride,
  extractProjectWebSearchDefaults,
  mergeProjectWebSearchDefaultsMeta,
  normalizeSearchSettingsLayer,
} from '@/next/openrouter/searchSettingsPersistence'
import {
  resolveSearchSettings,
  type SearchSettingsLayer,
} from '@/next/openrouter/searchSettingsResolver'
import {
  extractConvoGenerationParamsOverride,
  extractProjectGenerationParamsDefaults,
  mergeProjectGenerationParamsDefaultsMeta,
  normalizeGenerationParamsLayer,
} from '@/next/generation-params/generationParamPersistence'
import { resolveGenerationParamsFromLayers } from '@/next/generation-params/generationParamResolver'
import { getDefaultGenerationParamProfile, isReasoningEffortExplicitlyUnsupported,
  unsetGenerationProfile } from '@/next/generation-params/generationParamProfiles'
import type {
  GenerationParamsLayer,
  ProviderGenerationParamProfile,
  ResolvedGenerationParams,
} from '@/next/generation-params/generationParamTypes'
import type { SearchHit } from '@/next/search/searchTypes'
import type { NormalizedErrorEnvelope } from '@/next/errors/normalizeOpenRouterError'
import type { CompletionClass, ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import { createEventScheduler } from '@/next/state/eventScheduler'
import {
  beginCommitMeasure,
  endCommitMeasure,
  recordCommit,
  recordDelta,
  recordUpdatedMessages,
  startPerfReporter,
} from '@/next/state/perfMetrics'
import { useDiagnostics } from './useDiagnostics'
import { useSettingsBindings } from './useSettingsBindings'
import { nextTriState, resolveUserMessageRenderPolicy, type UserMessageRenderMode } from '../prefs/userMessageRenderPolicy'
import type { SearchConvoOption, SearchProjectOption } from '../components/SearchModal.types'
import type { ConversationListItem, ProjectListItem } from '../components/ConversationList.types'
import {
  deserializeChatSessionConfigFromConvoMeta,
  mergeChatSessionConfig,
  serializeChatSessionConfigToConvoMeta,
  type ChatSessionConfig,
  type ChatSessionConfigAspectRatio,
  type ChatSessionConfigPatch,
} from './chatSessionConfig'
import {
  isEmptyGenerationV2SemanticLayer,
  projectGenerationV2SemanticLayerToSessionConfig,
} from './generationV2SessionConfigProjection'
import type { ProviderModelPickerSource } from './providerModelPickerViewModel'
import { deriveSendButtonMode, type SendButtonMode } from './sendButtonMode'
import { createConversationConfigUpdateQueue } from './conversationConfigUpdateQueue'
import {
  resolveNetworkErrorDisplayMessage,
} from './networkErrorDisplay'

type BranchSummary = Readonly<{ id:string;convoId:string;headMessageId:string|null;name:string|null;
  createdAt:number;updatedAt:number;deletedAt:number|null }>

/**
 * Architecture boundary (phase: containment):
 * - Keep this module as app-level orchestration only.
 * - Do not add new domain rules here (model capability, send-plan policy, attachment compatibility, provider-specific rules).
 * - Add new domain logic to domain services / client adapters / pure helpers / dedicated composables first.
 * - Changes in this file must be regression-checked across: model switch, draft/history attachment send-plan, preflight gate, and history incompatible navigation.
 * - This module is pending staged split; follow docs/governance/app-chat-app-logic-boundary.md.
 */
export function useAppChatAppLogic() {

  const appIdentity = getCurrentInstance()?.appContext.app
  if (!appIdentity) throw new Error('CATALOG_RUNTIME_APP_CONTEXT_UNAVAILABLE')
  const catalogRuntimeStore = catalogRuntimeStoreV2ForApp<CatalogQueryItem>(appIdentity)
  const catalogRuntimeSnapshot = shallowRef(catalogRuntimeStore.snapshot())
  const unsubscribeCatalogRuntimeStore = catalogRuntimeStore.subscribe(() => {
    catalogRuntimeSnapshot.value = catalogRuntimeStore.snapshot()
  })
  const unregisterCatalogSelectionCommand = registerCatalogModelSelectionCommandV2(appIdentity, async (selection) => {
    await onUpdateRouteSelection(selection)
  })

  const isReady = ref(false)
  const loadError = ref<string | null>(null)
  const convos = ref<ConvoSummary[]>([])
  const conversationCursorByProjectId = ref<Map<string, GenerationV2ConversationCursor | null>>(new Map())
  const projects = ref<ProjectSummary[]>([])
  const projectCounts = ref<Map<string | null, number>>(new Map())
  const activeProjectId = ref<string | null>(null)
  const inboxId = ref<string | null>(null)
  const activeConvoId = ref<string | null>(null)
  const systemTemplateSnapshot = ref<SystemChatTemplateSnapshot | null>(null)
  const conversationConfigUpdateQueue = createConversationConfigUpdateQueue()
  const projectsOnlyWorkspace = ref(false)
  const activeBranchId = ref<string | null>(null)
  const navigationRevision = ref(0)
  watch([activeConvoId, activeBranchId], () => {
    navigationRevision.value += 1
  }, { flush: 'sync' })
  const branches = ref<BranchSummary[]>([])
  const branchNextCursor = ref<GenerationV2BranchCursor | null>(null)
  const hasMoreConversations = computed(() =>
    [...conversationCursorByProjectId.value.values()].some((cursor) => cursor !== null))
  const hasMoreBranches = computed(() => branchNextCursor.value !== null)
  const draft = ref('')
  const reasoningDisplayMode = ref<'inline' | 'rail'>('inline')
  const rightRailOpen = ref(false)
  const rightRailView = ref<'reasoning' | 'console'>('console')
  const pendingDeleteQuestionId = ref<string | null>(null)
  const requestedReasoningEffort = ref<'auto' | ReasoningEffort>('auto')
  const requestedReasoningExclude = ref(false)
  type ImageGenerationUiState = ImageGenerationUserConfig
  const imageGenerationState = ref<ImageGenerationUiState>(DEFAULT_IMAGE_GENERATION_USER_CONFIG)
  const imageGenerationConvoMode = ref<ConvoImageGenerationMode>('default')
  const globalImageGenerationDefault = ref<ImageGenerationUserConfig>(DEFAULT_IMAGE_GENERATION_USER_CONFIG)
  const selectedModelImageCapabilityClass = ref<ImageCapabilityClass | null>(null)
  const selectedModelImageCapabilityReason = ref<string | null>(null)
  const selectedModelImageCapabilityLoading = ref(false)
  const imageCapabilityQuerySeq = ref(0)
  const openRouterImageEndpointSelection = ref<OpenRouterImageEndpointSelectionClientStateV2 | null>(null)
  const openRouterImageEndpointSelectionLoading = ref(false)
  const openRouterImageEndpointSelectionError = ref<string | null>(null)
  const sessionWebSearchSettingsOpen = ref(false)
  const projectWebSearchSettingsOpen = ref(false)
  const projectWebSearchSettingsProjectId = ref<string | null>(null)
  const sessionWebSearchDraft = ref<SearchSettingsLayer | null>(null)
  const projectWebSearchDraft = ref<SearchSettingsLayer | null>(null)
  const sessionGenerationParamsDraft = ref<GenerationParamsLayer | null>(null)
  const projectGenerationParamsDraft = ref<GenerationParamsLayer | null>(null)
  const sessionWebSearchSettingsSaving = ref(false)
  const projectWebSearchSettingsSaving = ref(false)
  const sessionWebSearchQuickSaving = ref(false)
  const sessionGenerationParamsQuickSaving = ref(false)
  let sessionGenerationParamsPendingLayer: GenerationParamsLayer | null | undefined
  const sessionWebSearchSettingsStatus = ref<string | null>(null)
  const projectWebSearchSettingsStatus = ref<string | null>(null)
  const modelCatalogItems = ref<ModelCatalogItem[]>([])
  const openRouterModelModalitiesById = ref(new Map<string, Readonly<{ input: readonly string[]; output: readonly string[] }>>())
  const modelCatalogListStatus = ref<'unknown' | 'not_synced' | 'syncing' | 'synced' | 'failed'>('unknown')
  const showHiddenModelsInPickers = ref(false)
  const modelCatalogNotice = ref<string | null>(null)
  const modelPrefsScopeForUi = computed(() => ({ scopeType: 'global' as const, scopeId: '' as const }))
  const globalReasoningPrefs = ref<ReasoningPrefs | null>(null)
  const globalReasoningPanelDefaultExpanded = ref(true)
  const globalReasoningPanelAutoCollapseAfterReasoning = ref(false)
  const globalUserMessageRenderDefault = ref<boolean | null>(null)
  const globalWebSearchDefaults = ref<SearchSettingsLayer | null>(null)
  const globalGenerationParamsDefaults = ref<GenerationParamsLayer | null>(null)
  const dfcAttachmentDefaults = ref<DfcAttachmentDefaults>(normalizeDfcAttachmentDefaults(null))
  const skipReasoningPrefSave = ref(false)
  const reasoningPrefSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const isDev = import.meta.env.DEV
  const searchModalOpen = ref(false)
  const draftSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const draftSendPlanRefreshTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const draftAttachmentParsingPollTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const draftFlushPromise = ref<Promise<void> | null>(null)
  const generationV2ComposerDraft = ref<GenerationV2ComposerDraft | null>(null)
  let unsubscribeFileTypeDetectionUpdated: (()=>void)|null=null
  const lastDraftScopeKey = ref<string | null>(null)
  const attachmentFeedbackTone = ref<'info' | 'warning' | 'error' | 'success' | null>(null)
  const attachmentFeedbackMessage = ref<string | null>(null)
  const attachmentFeedbackTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const attachmentUrlDialogOpen = ref(false)
  const attachmentUrlDraft = ref('')
  const attachmentUrlRetentionMode = ref<'default' | 'link_only' | 'link_and_file'>('default')
  const composerImageInputSupported = ref<boolean | null>(null)
  const composerImageInputSupportReason = ref<string | null>(null)
  type DraftAttachmentDisplayStatus =
    | 'parsing'
    | 'detection_pending'
    | 'detection_failed'
    | 'detection_required'
    | 'ready'
    | 'ready_with_warnings'
    | 'incompatible_with_current_model'
    | 'failed'
    | 'unsupported'
  type DraftAttachmentBorderTone = 'green' | 'yellow' | 'red' | 'neutral'
  type DraftAttachmentSendModeOption = Readonly<{
    value: DraftAttachmentSendModePreference
    label: string
    disabled: boolean
    reason: string | null
  }>
  type DraftAttachmentUrlRetentionOption = Readonly<{
    value: DraftAttachmentUrlRetentionPreference
    label: string
    disabled: boolean
    reason: string | null
  }>
  type DraftAttachmentDfcOptionViewModel = Readonly<{
    optionId: string
    targetKind: DfcTargetKind
    sendStrategy: DfcSendStrategy
    status: string
    compatibilityStatus: string | null
    isAvailable: boolean
    selected: boolean
    disabled: boolean
    disabledReason: string | null
    label: string
    detail: string
    explanation: string
    recommended: boolean
    recommendationReason: string | null
    matchesFileTypeDefault: boolean
    matchesGlobalDefault: boolean
    diagnostics: string[]
    sendAssetRefs: readonly DfcSendAssetRef[]
  }>
  type DraftAttachmentDfcOptionsViewModel = Readonly<{
    loading: boolean
    error: string | null
    dfcManaged: boolean
    selectedOptionId: string | null
    decisionStatus: string | null
    decisionReasonCode: string | null
    targetKind: DfcTargetKind | null
    sendStrategy: DfcSendStrategy | null
    recommendedOptionId: string | null
    recommendedReasonCode: string | null
    fileTypeKey: string | null
    fileTypeDefaultTargetKind: DfcTargetKind | null
    globalDefaultTargetKind: DfcTargetKind | null
    fileTypeDefaultOptionId: string | null
    globalDefaultOptionId: string | null
    options: DraftAttachmentDfcOptionViewModel[]
  }>
  type DraftAttachmentDfcPreviewViewModel = Readonly<{
    loading: boolean
    error: string | null
    kind: string
    status: string | null
    targetKind: DfcTargetKind | null
    sendStrategy: DfcSendStrategy | null
    text: string | null
    characterCount: number | null
    byteLength: number | null
    truncated: boolean
    maxCharacters: number | null
    diagnostics: string[]
  }>
  type DraftAttachmentViewModel = Readonly<{
    draftAttachmentId: string
    assetId: string
    filename: string
    extension: string | null
    assetKind: string
    aiPayloadKind: string
    sourceKind: string
    displayStatus: DraftAttachmentDisplayStatus
    borderTone: DraftAttachmentBorderTone
    isParsing: boolean
    warningReason: string | null
    blockingReason: string | null
    fileTypeInfo: MessageAttachmentFileTypeInfo | null
    detectionInfo: MessageAttachmentDetectionInfo | null
    previewDataUrl: string | null
    canRemove: boolean
  }>
  type DraftAttachmentDetailsViewModel = DraftAttachmentViewModel & Readonly<{
    mime: string | null
    createdAt: number
    updatedAt: number
    preferredSendMode: DraftAttachmentSendModePreference
    urlRetentionMode: DraftAttachmentUrlRetentionPreference
    sendPlanStatus: string | null
    currentSendMode: SendMode | null
    currentSendModeLabel: string
    sendModeOptions: DraftAttachmentSendModeOption[]
    urlRetentionOptions: DraftAttachmentUrlRetentionOption[]
    originalUrl: string | null
    resolvedUrl: string | null
    probeStatus: string | null
    materializationStatus: string | null
    lastProbeAt: number | null
    probeWarning: string | null
    contentTypeFromProbe: string | null
    contentLengthFromProbe: string | null
    localCopyExists: boolean
    retryPreviewAvailable: boolean
    retryPreviewReason: string | null
    retryPreviewLabel: string
    dfcOptions: DraftAttachmentDfcOptionsViewModel
    dfcPreview: DraftAttachmentDfcPreviewViewModel
  }>
  type HistoryIncompatibleAttachmentDisplayStatus =
    | 'incompatible_with_current_model'
    | 'excluded_from_current_context'
  type HistoryIncompatibleAttachmentViewModel = Readonly<{
    messageId: string
    attachmentId: string
    assetId: string
    filename: string
    aiPayloadKind: string
    reasonCode: string
    reasonText: string
    source: 'history'
    branchId: string | null
    displayStatus: HistoryIncompatibleAttachmentDisplayStatus
  }>
  type HistoryIncompatibleAttachmentSummary = Readonly<{
    count: number
    currentIndex: number
    items: HistoryIncompatibleAttachmentViewModel[]
    activeItem: HistoryIncompatibleAttachmentViewModel | null
    hasItems: boolean
    warningText: string | null
    navigationActive: boolean
  }>
  type AttachmentDecisionSource = 'history' | 'draft' | 'edit_restored'
  type AttachmentDecisionValue = 'exclude' | 'remove'
  type AttachmentDecision = Readonly<{
    attachmentId: string
    source: AttachmentDecisionSource
    decision: AttachmentDecisionValue
    reasonCode?: string
  }>
  type ConfirmationHistoryAttachmentItem = Readonly<{
    attachmentId: string
    messageId: string
    assetId: string
    filename: string
    detailText: string
    reasonCode: string
    reasonText: string
    previewDataUrl: string | null
    iconKind: MessageAttachmentVM['iconKind']
  }>
  type ConfirmationCurrentAttachmentItem = Readonly<{
    attachmentId: string
    draftAttachmentId: string
    assetId: string
    filename: string
    detailText: string
    reasonCode: string
    reasonText: string
    previewDataUrl: string | null
    source: 'draft' | 'edit_restored'
  }>
  type AttachmentConfirmationSessionKind = 'composer_send' | 'regenerate' | 'retry_replace' | 'retry_as_new' | 'edit_submit'
  type AttachmentConfirmationSession = Readonly<{
    kind: AttachmentConfirmationSessionKind
    title: string
    historyItems: ConfirmationHistoryAttachmentItem[]
    currentItems: ConfirmationCurrentAttachmentItem[]
    historyAllExcluded: boolean
    currentDecisionsByAttachmentId: Record<string, AttachmentDecisionValue | null>
    collapsed: boolean
    historySectionExpanded: boolean
    currentSectionExpanded: boolean
    showHistoryValidation: boolean
    currentValidationAttachmentId: string | null
    validationMessage: string | null
    historyLocateActive: boolean
    historyLocateIndex: number
  }>
  type AttachmentConfirmationResult = Readonly<{
    confirmed: boolean
    decisions: AttachmentDecision[]
  }>
  const draftAttachmentViewModels = ref<DraftAttachmentViewModel[]>([])
  const draftAttachmentRecords = ref<DecodedDraftAttachment[]>([])
  const editRestoredDraftAttachmentAssetIds = ref<Set<string>>(new Set())
  const draftAttachmentAssetsById = ref<Record<string, DecodedFileAsset | null>>({})
  const draftAttachmentPlansByAssetId = ref<Record<string, SendPlanAttachment | null>>({})
  const draftAttachmentSendPlanStatus = ref<string | null>(null)
  const composerSendPlanStatus = ref<SendPlan['status'] | null>(null)
  const composerSendPlanCanProceed = ref(true)
  const composerSendPlanBlockingSummary = ref<string | null>(null)
  const composerSendPlanWarningSummary = ref<string | null>(null)
  const composerSendPlanLoading = ref(false)
  const composerSendPlanIsPartialAllowed = ref(false)
  const draftAttachmentPreviewCache = ref<Record<string, DecodedPreviewPayload | null>>({})
  const selectedDraftAttachmentAssetId = ref<string | null>(null)
  const draftAttachmentDfcOptionsByAssetId = ref<Record<string, DfcDraftAttachmentOptionsDto | null>>({})
  const draftAttachmentDfcOptionsLoadingByAssetId = ref<Record<string, boolean>>({})
  const draftAttachmentDfcOptionsErrorByAssetId = ref<Record<string, string | null>>({})
  const draftAttachmentDfcPreviewByAssetId = ref<Record<string, DfcDraftAttachmentPreviewDto | null>>({})
  const draftAttachmentDfcPreviewLoadingByAssetId = ref<Record<string, boolean>>({})
  const draftAttachmentDfcPreviewErrorByAssetId = ref<Record<string, string | null>>({})
  const historyAttachmentViewModelsByMessageIdBase = ref<Record<string, MessageAttachmentVM[]>>({})
  const historyIncompatibleAttachmentItems = ref<HistoryIncompatibleAttachmentViewModel[]>([])
  const historyIncompatibleAttachmentIndex = ref(0)
  const historyIncompatibleNavigationActive = ref(false)
  const activeHistoryIncompatibleAttachmentId = ref<string | null>(null)
  const historyIncompatibleRefreshTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const historyAttachmentRefreshTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  let historyIncompatibleRefreshSeq = 0
  let historyAttachmentRefreshSeq = 0
  let draftAttachmentRefreshSeq = 0
  let draftAttachmentDfcOptionsSeq = 0
  let draftAttachmentDfcPreviewSeq = 0
  const selectedDraftAttachmentDetails = computed(() =>
    buildDraftAttachmentDetailsViewModel(selectedDraftAttachmentAssetId.value)
  )
  const historyAttachmentViewModelsByMessageId = computed<Record<string, MessageAttachmentVM[]>>(() => {
    const activeAttachmentId = activeHistoryIncompatibleAttachmentId.value
    const base = historyAttachmentViewModelsByMessageIdBase.value
    const incompatibleByAttachmentId = new Map(historyIncompatibleAttachmentItems.value.map((item) => [item.attachmentId, item]))
    const next: Record<string, MessageAttachmentVM[]> = {}
    for (const [messageId, attachments] of Object.entries(base)) {
      next[messageId] = attachments.map((attachment) => {
        const incompatibleItem = incompatibleByAttachmentId.get(attachment.attachmentId) ?? null
        const status = incompatibleItem?.displayStatus ?? attachment.displayStatus
        return {
          ...attachment,
          displayStatus: status,
          borderTone: mapHistoryAttachmentBorderTone(status),
          isHistoryIncompatible: incompatibleItem != null,
          incompatibilityReason: incompatibleItem?.reasonText ?? null,
          isActiveLocatedAttachment: attachment.attachmentId === activeAttachmentId,
        }
      })
    }
    return next
  })
  const historyIncompatibleAttachmentSummary = computed<HistoryIncompatibleAttachmentSummary>(() => {
    const items = historyIncompatibleAttachmentItems.value
    const count = items.length
    const hasItems = count > 0
    if (!hasItems) {
      return {
        count: 0,
        currentIndex: 0,
        items,
        activeItem: null,
        hasItems: false,
        warningText: null,
        navigationActive: false,
      }
    }
    const normalizedIndex = Math.max(0, Math.min(historyIncompatibleAttachmentIndex.value, count - 1))
    const activeItem = items[normalizedIndex] ?? null
    return {
      count,
      currentIndex: normalizedIndex + 1,
      items,
      activeItem,
      hasItems: true,
      warningText: tf('sendPlan.historyAttachmentsExcluded', { count }),
      navigationActive: historyIncompatibleNavigationActive.value,
    }
  })
  const fileDetectionBlockingReason = computed(() => {
    const attachment = generationV2ComposerDraft.value?.attachments.find((item) => item.kind === 'managed_file' && item.include &&
      (item.fileTypeDetection?.status !== 'ready' || item.fileTypeDetection.blocked))
    if (!attachment || attachment.kind !== 'managed_file') return null
    const detection = attachment.fileTypeDetection
    if (!detection) return 'GENERATION_V2_FILE_DETECTION_REQUIRED'
    if (detection.status === 'pending') return 'GENERATION_V2_FILE_DETECTION_PENDING'
    if (detection.status === 'failed') return [detection.errorCode, detection.errorDetail].filter(Boolean).join(': ') || 'GENERATION_V2_FILE_DETECTION_FAILED'
    return detection.blockingReasonCodes.join(', ') || 'GENERATION_V2_FILE_DETECTION_BLOCKED'
  })
  const composerSendGateBlockedReason = computed(() => fileDetectionBlockingReason.value ?? composerSendPlanBlockingSummary.value)
  const composerSendGateWarningReason = computed(() => composerSendPlanWarningSummary.value)
  const attachmentConfirmationSession = ref<AttachmentConfirmationSession | null>(null)
  const attachmentConfirmationResolver = ref<((result: AttachmentConfirmationResult) => void) | null>(null)
  const isAttachmentConfirmationActive = computed(() => attachmentConfirmationSession.value != null)
  const isDraftInteractionLocked = computed(() => isAttachmentConfirmationActive.value)
  const hasSendableDraftAttachment = computed(() =>
    draftAttachmentRecords.value.some((attachment) => attachment.includeInNextRequest)
  )
  const composerCanSend = computed(() => {
    if (isRunning.value) return false
    if (isDraftInteractionLocked.value) return false
    if (isQuestionEditMode.value) return false
    if (composerSendPlanLoading.value) return false
    if (draft.value.trim().length === 0 && !hasSendableDraftAttachment.value) return false
    if (fileDetectionBlockingReason.value !== null) return false
    return composerSendPlanCanProceed.value
  })

  const sendButtonMode = computed<SendButtonMode>(() =>
    deriveSendButtonMode({
      isRunning: isRunning.value,
      isSendPlanLoading: composerSendPlanLoading.value,
      canSend: composerCanSend.value,
    }),
  )

  const attachmentConfirmationVisible = computed(() => {
    const session = attachmentConfirmationSession.value
    return session != null && session.collapsed === false
  })
  const attachmentConfirmationCollapsedBannerVisible = computed(() => {
    const session = attachmentConfirmationSession.value
    return session != null && session.collapsed === true && session.historyLocateActive === false
  })
  const attachmentConfirmationHistoryLocatorVisible = computed(() => {
    const session = attachmentConfirmationSession.value
    return session != null && session.collapsed === true && session.historyLocateActive === true
  })
  const attachmentConfirmationHistoryLocatorLabel = computed(() => {
    const session = attachmentConfirmationSession.value
    if (!session || session.historyItems.length === 0) return '0/0'
    return `${session.historyLocateIndex + 1}/${session.historyItems.length}`
  })

  const state = ref<RootState>(createInitialState())
  type MessageMetaEntry = {
    parentId: string | null
    questionId: string | null
    answerRootId: string | null
    role: string
    status: string
    providerId: RuntimeProviderId | null
    modelId: string | null
    completionOutcome?: CompletionOutcome
  }
    const branchViewSnapshot = shallowRef<BranchViewSnapshot<MessageMetaEntry>>(
    emptyBranchViewSnapshot<MessageMetaEntry>(),
  )
  const runtimeMessageSeqById = ref<Map<string, number>>(new Map())
  const runtimeMessageMetaById = ref<Map<string, MessageMetaEntry>>(new Map())
  const messageMetaById = computed<ReadonlyMap<string, MessageMetaEntry>>(() => new Map([
    ...branchViewSnapshot.value.messageMetaById,
    ...runtimeMessageMetaById.value,
  ]))
  const reasoningArtifactsByMessageId = ref<ReasoningArtifactsByMessageId>({})
  const turnFiltersByQuestionId = computed(() => branchViewSnapshot.value.turnByQuestionId)
  const questionTurnOrder = computed(() => branchViewSnapshot.value.questionTurnOrder)
  const messageCandidateNavigationCache = ref<Map<string, GenerationV2MessageCandidateNavigation>>(new Map())
  const generationV2BranchView = shallowRef<GenerationV2BranchView | null>(null)
  const hasEarlierTranscript = computed(() => generationV2BranchView.value?.hasMoreTurns === true)
  const branchRuntimeCache = new BranchRuntimeCacheV2()
  const branchRuntimeCacheRevision = ref(0)
  const generationV2RoutePreferenceByConversationId = shallowRef<ReadonlyMap<string,
    GenerationV2ConversationRoutePreferenceSnapshot | null>>(new Map())
  const generationV2ConfigByConversationId = shallowRef<ReadonlyMap<string, GenerationV2ConfigLayerView>>(new Map())
  const messageCandidateEpochGlobal = ref(0)
  const messageCandidateLoading = ref<Map<string, string>>(new Map())

  const questionEditSession = ref<{
    questionId: string
    previousDraft: GenerationV2ComposerDraft
  } | null>(null)
  const isQuestionEditMode = computed(() => questionEditSession.value != null)
  const draftPersistenceMode = ref<'compose' | 'edit'>('compose')
  const draftPersistenceEditingSourceMessageId = ref<string | null>(null)
  const draftPersistenceQueuedWhileAttachmentConfirmationActive = ref(false)

  function applyDraftPersistenceState(next: Readonly<{
    draftMode: 'compose' | 'edit'
    editingSourceMessageId: string | null
  }>) {
    draftPersistenceMode.value = next.draftMode
    draftPersistenceEditingSourceMessageId.value = next.editingSourceMessageId
  }

        const {
    diagnosticsFlags,
    diagnosticsLogger,
    diagnosticsBridge,
    isUiDebugEnabled,
    shouldLogDebug,
    shouldLogReasoningDebug,
    isEventSchedulerEnabled,
  } = useDiagnostics()
  type ReasoningProjectionTraceEntry = Readonly<{
    sequence: number
    atMs: number
    stage: 'projection_received' | 'projection_dropped_unknown_answer' | 'reducer_applied' | 'reducer_failed' | 'branch_hydrated'
    operationId: string
    answerRootId: string
    projectionType?: string
    detailType?: string | null
    activeBranchId: string | null
    viewBranchId: string | null
    answerKnownInView: boolean
    rawDetailCount?: number
    reasoningVersion?: number
    hasProjectionContext?: boolean
    displayBlockCount?: number
    visibility?: string
    messagePresentBefore?: boolean
    messagePresentAfter?: boolean
    stateReferenceChanged?: boolean
    messageReferenceChanged?: boolean
    transcriptContainsAnswer?: boolean
    errorCode?: string
  }>
  const reasoningProjectionTrace: ReasoningProjectionTraceEntry[] = []
  let reasoningProjectionTraceSequence = 0

  function recordReasoningProjectionTrace(entry: Omit<ReasoningProjectionTraceEntry, 'sequence' | 'atMs'>) {
    if (!shouldLogReasoningDebug()) return
    const next = Object.freeze({ sequence: ++reasoningProjectionTraceSequence, atMs: Date.now(), ...entry })
    reasoningProjectionTrace.push(next)
    if (reasoningProjectionTrace.length > 80) reasoningProjectionTrace.splice(0, reasoningProjectionTrace.length - 80)
    try {
      ;(globalThis as typeof globalThis & { __svReasoningProjectionTrace?: readonly ReasoningProjectionTraceEntry[] })
        .__svReasoningProjectionTrace = Object.freeze([...reasoningProjectionTrace])
    } catch {
      // Diagnostics must never affect generation.
    }
    console.info('[sv:reasoning-projection]', next)
  }
  const { settingsOpen, openSettings, closeSettings } = useSettingsBindings({ isReady })

  // Latest-wins coordinator for the stable branch projection. Message runtime
  // overlays (streaming, assets, reasoning, errors) may hydrate independently.
  const branchProjectionRefreshCoordinator = new BranchProjectionRefreshCoordinator()
  // Kept as the hydration generation token; core projection ownership lives in
  // branchProjectionRefreshCoordinator.
  const transcriptRefreshToken = ref(0)
  const isBranchProjectionLeaseCurrent = (lease: BranchProjectionRefreshLease) =>
    branchProjectionRefreshCoordinator.isCurrent(lease, activeBranchId.value)
  const inFlightEnvelopeIds = ref<Set<string>>(new Set())
  const errorEnvelopeUnavailableIds = ref<Set<string>>(new Set())
  const pendingEnvelopeIds = new Set<string>()
  let pendingEnvelopeTimer: ReturnType<typeof setTimeout> | null = null

  const runId = computed(() => activeBranchId.value)

  const activeBranch = computed(() => {
    const id = activeBranchId.value
    if (!id) return null
    return branches.value.find((b) => b.id === id) ?? null
  })

  // Branch tip (definition): reachable tail / insertion point. Not a UI cursor.
  const branchTipId = computed(() => activeBranch.value?.headMessageId ?? null)

  // UI-only cursor (selection / highlight) by branch. Does NOT affect branching semantics or persistence.
  const cursorByBranchId = ref<Map<string, string>>(new Map())

  function setCursorForBranch(branchId: string, messageId: string | null) {
    const bid = String(branchId ?? '').trim()
    const mid = messageId ? String(messageId).trim() : ''
    if (!bid) return
    const next = new Map(cursorByBranchId.value)
    if (mid) next.set(bid, mid)
    else next.delete(bid)
    cursorByBranchId.value = next
  }

  function isMessageInTranscript(messageId: string): boolean {
    const id = String(messageId ?? '').trim()
    if (!id) return false
    return transcriptMessageIds.value.includes(id)
  }

  function ensureCursorForActiveBranch() {
    const bid = activeBranchId.value
    if (!bid) return

    const current = cursorByBranchId.value.get(bid) ?? null
    if (current && isMessageInTranscript(current)) return

    const ids = transcriptMessageIds.value
    const fallback = (branchTipId.value && isMessageInTranscript(branchTipId.value) ? branchTipId.value : null) ??
      ids[ids.length - 1] ??
      null
    setCursorForBranch(bid, fallback)
  }

  function onSelectCursor(messageId: string, ev?: MouseEvent) {
    const bid = activeBranchId.value
    if (!bid) return
    const mid = String(messageId ?? '').trim()
    if (!mid) return

    const target = ev?.target as HTMLElement | null
    if (target && target.closest('button,a,input,textarea,select')) return

    setCursorForBranch(bid, mid)
  }

  const runVM = computed(() => {
    const id = runId.value
    if (!id) return null
    return selectRun(state.value, id)
  })

  const transcriptMessageIds = computed<string[]>(() => {
    const id = runId.value
    if (!id) return []
    return state.value.views?.transcriptsByRunId?.[id] ?? []
  })

  const transcriptMessagesById = computed<Record<string, MessageVM>>(() => {
    const ids = transcriptMessageIds.value
    const map: Record<string, MessageVM> = {}
    for (const id of ids) {
      const vm = selectMessage(state.value, id)
      if (vm) map[id] = vm
    }
    return map
  })

      function clearReasoningArtifactsForMessageIds(messageIds: Iterable<string>) {
    reasoningArtifactsByMessageId.value = removeReasoningArtifactsForMessages(
      reasoningArtifactsByMessageId.value,
      messageIds,
    )
  }

  function retainReasoningArtifactsForMessageIds(messageIds: Iterable<string>) {
    reasoningArtifactsByMessageId.value = retainReasoningArtifactsForMessages(
      reasoningArtifactsByMessageId.value,
      messageIds,
    )
  }

  function getMessageIdsForQuestionRemoval(questionId: string): string[] {
    const qid = String(questionId ?? '').trim()
    if (!qid) return []
    const ids: string[] = [qid]
    for (const [messageId, meta] of messageMetaById.value.entries()) {
      if (messageId === qid || meta.questionId === qid || meta.parentId === qid) ids.push(messageId)
    }
    return Array.from(new Set(ids))
  }

  function getReasoningArtifactsForMessage(messageId: string): readonly ReasoningArtifact[] {
    const id = String(messageId ?? '').trim()
    if (!id) return []
    return reasoningArtifactsByMessageId.value[id] ?? []
  }

  const userMessageRenderPolicy = computed(() => {
    const convoMetaValue = extractUserMessageRenderOverride(getActiveConvoRecord()?.meta ?? null)
    return resolveUserMessageRenderPolicy(globalUserMessageRenderDefault.value, convoMetaValue)
  })

  const userMessageRenderModeLabel = computed(() => {
    const policy = userMessageRenderPolicy.value
    if (policy.mode === 'on') return 'User render: On'
    if (policy.mode === 'off') return 'User render: Off'
    return `User render: Follow (${policy.effective ? 'On' : 'Off'})`
  })

  const lastAssistantMessage = computed<MessageState | null>(() => {
    const ids = transcriptMessageIds.value
    const messagesById = state.value.entities?.messagesById ?? state.value.messages
    for (let i = ids.length - 1; i >= 0; i -= 1) {
      const msg = messagesById[ids[i]]
      if (msg?.role === 'assistant') return msg
    }
    return null
  })

  const lastAssistantMessageId = computed(() => lastAssistantMessage.value?.messageId ?? null)

  const showReasoningPanel = computed(() => {
    const m = lastAssistantMessage.value
    if (!m) return false
    return m.reasoningPanelState !== 'collapsed'
  })

  const reasoningInlineMode = computed(() => reasoningDisplayMode.value === 'inline')
  const reasoningRailMode = computed(() => reasoningDisplayMode.value === 'rail')
  const rightRailCanShowReasoning = computed(() => reasoningRailMode.value && !!lastAssistantMessageId.value)
  const effectiveRightRailView = computed<'reasoning' | 'console'>(() =>
    rightRailCanShowReasoning.value ? rightRailView.value : 'console'
  )

  const canToggleReasoningPanel = computed(() => !!lastAssistantMessageId.value)

  watch([activeBranchId, transcriptMessageIds], () => ensureCursorForActiveBranch(), { immediate: true })

  watch(
    [transcriptMessageIds, activeConvoId, activeBranchId],
    () => {
      scheduleHistoryAttachmentRefresh()
    },
    { immediate: true },
  )

  watch(
    activeBranchId,
    (next, prev) => {
      if (!enableEventScheduler) return
      if (prev && prev !== next) {
        eventScheduler.flushNow(prev, 'switch')
        eventScheduler.dispose(prev)
      }
    },
    { flush: 'sync' }
  )

  watch(
    activeConvoId,
    (next, prev) => {
      if (!enableEventScheduler) return
      if (prev && prev !== next) {
        eventScheduler.flushAll('switch')
      }
    },
    { flush: 'sync' }
  )

  watch(
    activeConvoId,
    () => {
      if (!sessionWebSearchSettingsOpen.value) return
      sessionWebSearchDraft.value = getActiveConvoWebSearchLayer()
      sessionGenerationParamsDraft.value = getActiveConvoGenerationParamsLayer()
      sessionWebSearchSettingsStatus.value = null
    },
    { flush: 'sync' }
  )

  watch(requestedReasoningEffort, (value) => {
    if (value === 'auto' || value === 'none') {
      if (requestedReasoningExclude.value) requestedReasoningExclude.value = false
    }
  })

  watch([requestedReasoningEffort, requestedReasoningExclude], () => {
    if (skipReasoningPrefSave.value) {
      skipReasoningPrefSave.value = false
      return
    }
    scheduleReasoningPrefsSave()
  })

  watch([activeConvoId, activeBranchId], async ([nextConvoId, nextBranchId], [prevConvoId, prevBranchId]) => {
    if (nextConvoId !== prevConvoId || nextBranchId !== prevBranchId) {
      branchProjectionRefreshCoordinator.invalidate()
      transcriptRefreshToken.value += 1
    }
    const prevScopeValid = String(prevConvoId ?? '').trim().length > 0 && String(prevBranchId ?? '').trim().length > 0
    if (prevScopeValid) {
      await flushDraftPersistence()
    }
    if (nextBranchId) {
      branchRuntimeCache.get(nextBranchId)
      branchRuntimeCache.prune(nextBranchId)
      branchRuntimeCacheRevision.value += 1
    }
    await restoreDraftForActiveScope()
  }, { flush: 'sync' })

  watch(draft, () => {
    if (!getActiveDraftScope()) return
    scheduleDraftPersistence()
    // Draft text changes can alter whether the composer has sendable current input.
    scheduleDraftSendPlanRefresh()
  })

  watch(
    [activeConvoId, globalReasoningPrefs, globalWebSearchDefaults, globalGenerationParamsDefaults, globalImageGenerationDefault],
    () => {
      hydrateSessionConfigUiFromActiveConvo()
    },
    { immediate: false, flush: 'sync' }
  )

  const activeCursorMessageId = computed(() => {
    // During streaming, prefer highlighting the active assistant message (UI only).
    const streamingId = activeAssistantMessageId.value
    if (streamingId && isMessageInTranscript(streamingId)) return streamingId

    const bid = activeBranchId.value
    if (!bid) return undefined
    const cursor = cursorByBranchId.value.get(bid)
    if (cursor && isMessageInTranscript(cursor)) return cursor

    if (branchTipId.value && isMessageInTranscript(branchTipId.value)) return branchTipId.value
    const ids = transcriptMessageIds.value
    return ids[ids.length - 1]
  })

  const lastAssistantReasoningView = computed(() => {
    const id = lastAssistantMessageId.value
    if (!id) return null
    return selectMessage(state.value, id)?.reasoningView ?? null
  })

  const lastAssistantReasoningVersion = computed(() => lastAssistantMessage.value?.reasoningVersion ?? 0)
  const lastAssistantIsStreaming = computed(() => {
    const s = lastAssistantMessage.value?.streaming
    return Boolean(s && s.isTarget && !s.isComplete)
  })

  const activeGenerationV2Answer = computed(() => {
    const view = generationV2BranchView.value
    if (!view?.headMessageId) return null
    for (let index = view.turns.length - 1; index >= 0; index -= 1) {
      const answer = view.turns[index].answers.find((item) => item.answerRootId === view.headMessageId && item.chosen)
      if (answer) return answer
    }
    return null
  })
  const activeBranchRuntime = computed(() => {
    branchRuntimeCacheRevision.value
    const branchId = activeBranchId.value
    return branchId ? branchRuntimeCache.get(branchId, false) : null
  })
  function getBranchRuntimeStatus(branchId: string): BranchRuntimeCacheEntryV2['status'] | null {
    branchRuntimeCacheRevision.value
    return branchRuntimeCache.get(branchId, false)?.status ?? null
  }
  const activeAssistantMessageId = computed(() => activeBranchRuntime.value?.status === 'generating'
    ? activeBranchRuntime.value.targetAnswerId
    : activeGenerationV2Answer.value?.status === 'streaming'
      ? activeGenerationV2Answer.value.answerRootId
      : null)
  const isRunning = computed(() => activeBranchRuntime.value?.status === 'generating' ||
    activeGenerationV2Answer.value?.status === 'streaming' ||
    runVM.value?.status === 'requesting' || runVM.value?.status === 'streaming' || runVM.value?.status === 'tool_waiting')

  const {
    openRouterChatConfig,
    lmStudioChatConfig,
    ollamaChatConfig,
    localEndpointChatConfig,
    openAIResponsesChatConfig,
    googleAIStudioChatConfig,
    anthropicChatConfig,
    deepSeekChatConfig,
    localEndpointChatUrl,
    readExperimentalProviderChatStorage,
    addExperimentalProviderChatEventListeners,
    removeExperimentalProviderChatEventListeners,
    onUpdateOpenRouterChatEnabled,
    onUpdateLMStudioChatEnabled,
    onUpdateLMStudioEndpointUrl,
    onUpdateLMStudioChatMode,
    onUpdateLMStudioOpenAICompatiblePreferredEndpoint,
    onUpdateLMStudioNativeRestControl,
    onClearLMStudioChat,
    onUpdateOllamaChatEnabled,
    onUpdateOllamaEndpointUrl,
    onUpdateOllamaChatMode,
    onUpdateOllamaNativeRestPreferredEndpoint,
    onUpdateOllamaOpenAICompatiblePreferredEndpoint,
    onUpdateOllamaProfileCapability,
    onUpdateOllamaNativeControl,
    onClearOllamaChat,
    onUpdateLocalEndpointChatEnabled,
    onUpdateLocalEndpointChatUrl,
    onClearLocalEndpointChat,
    onUpdateOpenAIResponsesChatEnabled,
    onClearOpenAIResponsesChat,
    onUpdateGoogleAIStudioChatEnabled,
    onClearGoogleAIStudioChat,
    onUpdateAnthropicChatEnabled,
    onUpdateAnthropicThinkingDisplay: updateAnthropicThinkingDisplayPreference,
    applyAnthropicThinkingDisplayFromConversation,
    onClearAnthropicChat,
    onUpdateDeepSeekChatEnabled,
    onClearDeepSeekChat,
  } = useExperimentalProviderChatSettings({
    isRunning,
    isDraftInteractionLocked,
  })

  const thinkingNowMs = ref(Date.now())
  let thinkingTimer: ReturnType<typeof setInterval> | null = null

  watch(
    [lastAssistantIsStreaming, () => runVM.value?.tAck, () => runVM.value?.localProcessingDurationMs],
    ([streaming, tAck, duration]) => {
      const hasAck = typeof tAck === 'number'
      const isFrozen = typeof duration === 'number' && duration >= 0
      if (streaming && hasAck && !isFrozen) {
        if (!thinkingTimer) {
          thinkingTimer = setInterval(() => {
            thinkingNowMs.value = Date.now()
          }, 250)
        }
        return
      }
      if (thinkingTimer) {
        clearInterval(thinkingTimer)
        thinkingTimer = null
      }
    },
    { immediate: true }
  )

  const lastAssistantThinkingLabel = computed(() => {
    if (!lastAssistantMessageId.value) return null
    const msg = lastAssistantMessage.value
    if (!msg || msg.role !== 'assistant') return null

    const ms = msg.reasoningDurationMs
    if (typeof ms === 'number' && ms >= 0) return `Thinking ${(ms / 1000).toFixed(2)}s`
    if (ms === null && msg.reasoningEndReason) return 'Thinking —'

    const runDuration = runVM.value?.localProcessingDurationMs
    if (typeof runDuration === 'number' && runDuration >= 0) return `Thinking ${(runDuration / 1000).toFixed(2)}s`

    if (runVM.value?.status === 'error') return 'Thinking —'

    if (lastAssistantIsStreaming.value || runVM.value?.status === 'requesting') {
      const tAck = runVM.value?.tAck
      if (typeof tAck === 'number') {
        const liveMs = Math.max(0, thinkingNowMs.value - tAck)
        return `Thinking ${(liveMs / 1000).toFixed(2)}s`
      }
      return 'Thinking…'
    }
    return null
  })

  const modelCatalogForPicker = computed<readonly ModelCatalogItem[]>(() => {
    return showHiddenModelsInPickers.value
      ? selectModelCatalogAll(modelCatalogItems.value)
      : selectModelCatalogVisible(modelCatalogItems.value)
  })

  function getNormalizedErrorEnvelope(error: unknown): NormalizedErrorEnvelope | null {
    if (!error || typeof error !== 'object') return null
    const env = (error as any)?.normalized ?? null
    if (env && typeof env === 'object' && 'normalized' in env) return env as NormalizedErrorEnvelope
    return null
  }

  const normalizedError = computed(() => getNormalizedErrorEnvelope(runVM.value?.error))

  const normalizedErrorSummary = computed(() => {
    const e = normalizedError.value?.normalized
    if (!e) return null
    const bits = [
      e.httpStatus ? `HTTP ${e.httpStatus}` : null,
      typeof e.code === 'string' ? e.code : `code:${e.code}`,
      e.message,
    ].filter(Boolean)
    return bits.join(' — ')
  })

  const normalizedErrorActionHint = computed(() => {
    const a = normalizedError.value?.normalized?.action
    if (!a) return null
    if (a === 'reauth') return t('errors.action.checkApiKey')
    if (a === 'topup_credits') return t('errors.action.topUp')
    if (a === 'modify_input_moderation') return t('errors.action.editPrompt')
    if (a === 'fix_request') return t('errors.action.fixParams')
    if (a === 'backoff_retry') return t('errors.action.retryWithBackoff')
    if (a === 'switch_provider_or_model') return t('errors.action.switchModel')
    if (a === 'relax_routing_constraints') return t('errors.action.relaxConstraints')
    return t('errors.action.unknown')
  })

  async function copyErrorDetails() {
    const env = normalizedError.value
    if (!env) return
    const details = JSON.stringify(env, null, 2)
    try {
      await navigator.clipboard.writeText(details)
    } catch {
      // no-op (clipboard may be unavailable depending on Electron/webPreferences)
    }
  }

  const enableEventScheduler = isEventSchedulerEnabled()
  const eventScheduler = createEventScheduler({
    commit: (runId, events) => {
      if (events.length === 0) return
      const updatedIds = new Set<string>()
      for (const ev of events) {
        if ('messageId' in ev && typeof ev.messageId === 'string') {
          updatedIds.add(ev.messageId)
        }
      }
      const measureId = beginCommitMeasure()
      const next = applyEventsBatch(state.value, runId, events)
      state.value = next
      const duration = endCommitMeasure(measureId)
      recordCommit(duration)
      recordUpdatedMessages(updatedIds.size)
    },
    onEnqueue: (event) => {
      if (event.type === 'MessageDeltaReasoningDetail') recordDelta(1)
      if (event.type === 'MessageDeltaReasoningDetailBatch') {
        const count = Array.isArray(event.details) ? event.details.length : 0
        if (count > 0) recordDelta(count)
      }
    },
  })

  let stopPerfReporter: (() => void) | null = null
  let refAuditTimer: ReturnType<typeof setInterval> | null = null
  const refAuditCache = new Map<string, MessageVM>()
  const refAuditSeenAt = new Map<string, number>()
  const refAuditRecentWindowMs = 1500
  let lastTranscriptIdsRef: string[] | null = null
  let idsRefStableCount = 0
  let idsRefChangedCount = 0

  function handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.hidden) {
      void flushDraftPersistence()
    }
    if (!enableEventScheduler) return
    if (typeof document !== 'undefined' && document.hidden) {
      eventScheduler.flushAll('visibility')
    }
  }

  function handlePageHide() {
    void flushDraftPersistence()
  }

      function metaStatusFromCompletionClass(
    completionClass: CompletionClass | null
  ): 'final' | 'error' | 'aborted' | null {
    if (!completionClass) return null
    if (completionClass === 'error') return 'error'
    if (completionClass === 'aborted') return 'aborted'
    return 'final'
  }

          function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null
    return value as Record<string, unknown>
  }

        function extractReasoningDetailsFromMeta(meta: unknown): unknown[] {
    const obj = asRecord(meta)
    const raw = obj?.reasoningDetailsRaw
    if (Array.isArray(raw)) return raw as unknown[]
    return []
  }

  function extractProviderNativeContentsFromMeta(meta: unknown): PersistedProviderNativeContent[] {
    const obj = asRecord(meta)
    const raw = obj?.providerNativeContents
    if (!Array.isArray(raw)) return []
    return raw
      .filter((item): item is PersistedProviderNativeContent => !!item && typeof item === 'object')
      .map((item) => item as PersistedProviderNativeContent)
  }

  function extractAnnotationsFromMeta(meta: unknown): unknown[] {
    const obj = asRecord(meta)
    const raw = obj?.annotations
    if (!Array.isArray(raw)) return []
    return raw.filter((item) => !!item && typeof item === 'object')
  }

                function extractRequestReasoningConfigFromMeta(meta: unknown): { mode: RequestedReasoningMode; effort?: ReasoningEffort; exclude?: boolean } | null {
    const obj = asRecord(meta)
    const config = asRecord(obj?.requestReasoningConfig)
    const resolved = asRecord(config?.resolved) ?? asRecord(config?.normalized)
    if (!resolved) return null

    const mode = resolved?.mode === 'effort' ? 'effort' : 'auto'
    const effortRaw = resolved?.effort
    const effort = typeof effortRaw === 'string' && effortRaw !== 'auto' ? (effortRaw as ReasoningEffort) : undefined
    const exclude = mode === 'auto' || effort === 'none' ? false : resolved?.exclude === true
    return { mode, effort, exclude }
  }

  function extractReasoningTimingFromMeta(meta: unknown): {
    durationMs?: number | null
    endReason?: StreamEndReason
    isFallback?: boolean
  } {
    const obj = asRecord(meta)
    const rawDuration = obj?.reasoningDurationMs
    let durationMs: number | null | undefined

    if (rawDuration === null) {
      durationMs = null
    } else if (typeof rawDuration === 'number' && Number.isFinite(rawDuration)) {
      durationMs = rawDuration
    } else if (typeof rawDuration === 'string' && rawDuration.trim().length > 0) {
      const parsed = Number(rawDuration)
      if (Number.isFinite(parsed)) durationMs = parsed
    }

    const endReason = typeof obj?.reasoningEndReason === 'string' ? (obj.reasoningEndReason as StreamEndReason) : undefined
    const isFallback = obj?.reasoningDurationIsFallback === true

    return { durationMs, endReason, isFallback }
  }

  function extractCompletionOutcomeFromMeta(meta: unknown): CompletionOutcome | undefined {
    const obj = asRecord(meta)
    const value = obj?.completionOutcome
    if (value === 'complete' || value === 'truncated' || value === 'filtered' || value === 'tool_calls' || value === 'unknown') {
      return value
    }
    return undefined
  }

  function extractErrorEnvelopeFromMeta(meta: unknown): ErrorEnvelope | null {
    const obj = asRecord(meta)
    const raw = obj?.errorEnvelope
    if (!raw || typeof raw !== 'object') return null
    if (!('completionClass' in (raw as any)) || !('phase' in (raw as any))) return null
    return raw as ErrorEnvelope
  }

  type ErrorSummary = Readonly<{
    completionClass?: string | null
    phase?: string | null
    code?: string | null
    message?: string | null
    provider?: string | null
    source?: string | null
    raw?: unknown
    networkError?: unknown
  }>

  function toErrorPanelView(message: MessageVM): ErrorPanelViewModel | null {
    const envelope = message.errorEnvelope ?? null
    const summary = (message.errorSummary ?? null) as ErrorSummary | null
    if (!envelope && !summary) return null

    const completionClass = envelope?.completionClass ?? summary?.completionClass ?? 'error'
    const phase = envelope?.phase ?? summary?.phase ?? 'unknown'

    const metadata = envelope?.openrouter?.metadata as Record<string, unknown> | undefined
    const metadataProvider =
      metadata && typeof metadata === 'object' && typeof metadata.provider_name === 'string'
        ? metadata.provider_name
        : undefined
    const provider = envelope?.openrouter?.provider ?? metadataProvider ?? summary?.provider ?? 'unknown'
    const code = envelope?.openrouter?.code ?? summary?.code ?? 'error'
    const networkErrorMessage = resolveNetworkErrorDisplayMessage(metadata?.networkError ?? summary?.networkError)
    const text = networkErrorMessage ?? envelope?.openrouter?.message ?? summary?.message ?? 'Unknown error'

    return {
      completionClass,
      phase,
      code,
      message: text,
      provider,
      truncated: envelope?.truncated === true,
      details: envelope ?? summary?.raw ?? null,
    }
  }

  function extractErrorSummaryFromMeta(meta: unknown): ErrorSummary | null {
    const obj = asRecord(meta)
    const raw = obj?.error_summary
    if (!raw || typeof raw !== 'object') return null
    const record = raw as Record<string, unknown>
    const completionClass = record.completionClass === null || typeof record.completionClass === 'string' ? record.completionClass as string | null | undefined : undefined
    const phase = record.phase === null || typeof record.phase === 'string' ? record.phase as string | null | undefined : undefined
    const code = record.code === null || typeof record.code === 'string' ? record.code as string | null | undefined : undefined
    const message = record.message === null || typeof record.message === 'string' ? record.message as string | null | undefined : undefined
    const provider = record.provider === null || typeof record.provider === 'string' ? record.provider as string | null | undefined : undefined
    const source = record.source === null || typeof record.source === 'string' ? record.source as string | null | undefined : undefined
    const rawValue = record.raw
    const networkError = record.networkError
    if (!completionClass && !phase && !code && !message && !provider && !source && rawValue === undefined && networkError === undefined) return null
    return { completionClass, phase, code, message, provider, source, raw: rawValue, networkError }
  }

  function extractReasoningProjectionContextFromMeta(meta: unknown): Readonly<{
    providerId: string
    protocolContractId: string
    modelId: string
  }> | null {
    const obj = asRecord(meta)
    if (typeof obj?.providerId !== 'string' || typeof obj.protocolContractId !== 'string' ||
        typeof obj.modelId !== 'string') return null
    return Object.freeze({
      providerId: obj.providerId,
      protocolContractId: obj.protocolContractId,
      modelId: obj.modelId,
    })
  }

      function applyErrorEnvelopesToState(envelopes: Map<string, ErrorEnvelope>) {
    if (envelopes.size === 0) return
    const messages = state.value.entities?.messagesById ?? state.value.messages
    const nextMessages: Record<string, MessageState> = { ...messages }
    let changed = false

    const nextMeta = new Map(messageMetaById.value)
    let metaChanged = false

    for (const [messageId, envelope] of envelopes.entries()) {
      const msg = nextMessages[messageId]
      if (!msg) continue
      nextMessages[messageId] = { ...msg, errorEnvelope: envelope }
      changed = true

      const meta = nextMeta.get(messageId)
      const metaStatus = metaStatusFromCompletionClass(envelope.completionClass)
      if (!meta) {
        nextMeta.set(messageId, {
          parentId: null,
          questionId: null,
          answerRootId: null,
          role: msg.role ?? 'assistant',
          status: metaStatus ?? 'final',
          providerId: null,
          modelId: null,
        })
        metaChanged = true
        continue
      }
      if (metaStatus && meta.status !== metaStatus) {
        nextMeta.set(messageId, { ...meta, status: metaStatus })
        metaChanged = true
      }
    }

    if (changed) {
      state.value = {
        ...state.value,
        messages: nextMessages,
        runMessageIds: state.value.runMessageIds,
        entities: { messagesById: nextMessages },
        views: state.value.views,
      }
    }
    if (metaChanged) runtimeMessageMetaById.value = new Map(
      [...nextMeta].filter(([messageId, meta]) => branchViewSnapshot.value.messageMetaById.get(messageId) !== meta),
    )

    if (errorEnvelopeUnavailableIds.value.size > 0) {
      const nextUnavailable = new Set(errorEnvelopeUnavailableIds.value)
      let changedUnavailable = false
      for (const messageId of envelopes.keys()) {
        if (nextUnavailable.delete(messageId)) changedUnavailable = true
      }
      if (changedUnavailable) errorEnvelopeUnavailableIds.value = nextUnavailable
    }
  }

  function captureErrorFallbacks(): Map<string, { envelope: ErrorEnvelope | null; summary: ErrorSummary | null }> {
    const messages = state.value.entities?.messagesById ?? state.value.messages
    const out = new Map<string, { envelope: ErrorEnvelope | null; summary: ErrorSummary | null }>()
    for (const [id, msg] of Object.entries(messages)) {
      const envelope = msg?.errorEnvelope ?? null
      const summary = msg?.errorSummary ?? null
      if (envelope || summary) out.set(id, { envelope, summary })
    }
    return out
  }

  function applyErrorFallbacks(fallbacks: Map<string, { envelope: ErrorEnvelope | null; summary: ErrorSummary | null }>) {
    if (!fallbacks || fallbacks.size === 0) return
    const messages = state.value.entities?.messagesById ?? state.value.messages
    const nextMessages: Record<string, MessageState> = { ...messages }
    let changed = false

    for (const [messageId, fallback] of fallbacks.entries()) {
      const msg = nextMessages[messageId]
      if (!msg) continue
      if (msg.errorEnvelope || msg.errorSummary) continue
      if (!fallback.envelope && !fallback.summary) continue
      nextMessages[messageId] = {
        ...msg,
        errorEnvelope: fallback.envelope ?? null,
        errorSummary: fallback.summary ?? null,
      }
      changed = true
    }

    if (!changed) return
    state.value = {
      ...state.value,
      messages: nextMessages,
      runMessageIds: state.value.runMessageIds,
      entities: { messagesById: nextMessages },
      views: state.value.views,
    }

    if (errorEnvelopeUnavailableIds.value.size > 0) {
      const nextUnavailable = new Set(errorEnvelopeUnavailableIds.value)
      let changedUnavailable = false
      for (const [messageId, fallback] of fallbacks.entries()) {
        if (fallback.envelope && nextUnavailable.delete(messageId)) changedUnavailable = true
      }
      if (changedUnavailable) errorEnvelopeUnavailableIds.value = nextUnavailable
    }
  }

          function hasErrorEnvelope(messageId: string): boolean {
    const id = String(messageId ?? '').trim()
    if (!id) return false
    const messages = state.value.entities?.messagesById ?? state.value.messages
    return Boolean(messages[id]?.errorEnvelope)
  }

  function requestErrorEnvelope(messageId: string) {
    const id = String(messageId ?? '').trim()
    if (!id) return
    if (hasErrorEnvelope(id)) return
    if (inFlightEnvelopeIds.value.has(id)) return
    if (pendingEnvelopeIds.has(id)) return
    if (errorEnvelopeUnavailableIds.value.has(id)) return

    pendingEnvelopeIds.add(id)
    if (!inFlightEnvelopeIds.value.has(id)) {
      const nextInFlight = new Set(inFlightEnvelopeIds.value)
      nextInFlight.add(id)
      inFlightEnvelopeIds.value = nextInFlight
    }

    if (!pendingEnvelopeTimer) {
      const token = transcriptRefreshToken.value
      pendingEnvelopeTimer = setTimeout(() => {
        pendingEnvelopeTimer = null
        flushPendingErrorEnvelopes(token)
      }, 0)
    }
  }

  async function flushPendingErrorEnvelopes(token: number) {
    const ids = Array.from(pendingEnvelopeIds)
    pendingEnvelopeIds.clear()
    if (ids.length === 0) return
    let envelopes: Map<string, ErrorEnvelope> | null = null
    try {
      envelopes = await listMessageErrorEnvelopes(ids)
    } catch {
      envelopes = null
    }

    const nextInFlightAfter = new Set(inFlightEnvelopeIds.value)
    ids.forEach((id) => nextInFlightAfter.delete(id))
    inFlightEnvelopeIds.value = nextInFlightAfter

    if (transcriptRefreshToken.value !== token) return
    if (!envelopes) return

    if (envelopes.size > 0) {
      applyErrorEnvelopesToState(envelopes)
    }

    const missing = ids.filter((id) => !envelopes!.has(id))
    if (missing.length > 0) {
      const nextUnavailable = new Set(errorEnvelopeUnavailableIds.value)
      missing.forEach((id) => nextUnavailable.add(id))
      errorEnvelopeUnavailableIds.value = nextUnavailable
    }
  }

  async function syncProviderCatalogsOnStartup() {
    const models = window.generationV2?.models
    const store = (globalThis as typeof globalThis & { electronStore?: { get?: (key: string) => Promise<unknown> } }).electronStore
    if (!models || typeof models.status !== 'function' || typeof models.sync !== 'function' || typeof store?.get !== 'function') return
    await syncProviderCatalogsOnStartupV2({
      models: models as Parameters<typeof syncProviderCatalogsOnStartupV2>[0]['models'],
      store: { get: (key) => store.get!(key) },
    })
  }

  const FIRST_PARTY_CATALOG_PROVIDER_KEYS = Object.freeze([
    OPENROUTER_PROVIDER_ID,
    OPENAI_RESPONSES_PROVIDER_KEY,
    GOOGLE_AI_STUDIO_PROVIDER_KEY,
    ANTHROPIC_MESSAGES_PROVIDER_KEY,
    DEEPSEEK_OFFICIAL_PROVIDER_KEY,
  ] as const)

  function localCatalogFailure(providerKey: string, error: unknown): ProviderFailureV2 {
    return providerFailureFromUnknownV2(error, {
      origin: 'starverse_internal',
      phase: 'response_body',
      providerId: providerKey,
      contractId: 'model-catalog-v2',
      operationId: `catalog-renderer:${providerKey}`,
      requestSequence: 1,
      starverseDiagnosticCode: 'MODEL_CATALOG_RENDERER_HYDRATION_FAILED',
    })
  }

  async function hydrateCatalogProvider(providerKey: string): Promise<void> {
    const token = catalogRuntimeStore.beginQuery(providerKey)
    const items: CatalogQueryItem[] = []
    let cursor: import('@/next/modelCatalog/catalogQueryService').CatalogQueryCursor | null = null
    let first: import('@/next/modelCatalog/catalogQueryService').CatalogQueryResult | null = null
    let pages = 0
    try {
      do {
        const page = await CatalogQueryService.query({
          sourceProviderKey: providerKey,
          ...(cursor?.snapshotDigest ? { snapshotDigest: cursor.snapshotDigest } : {}),
          page: { limit: 500, cursor },
        })
        if (!first) first = page
        if (page.authorityReadSucceeded === false || page.status === 'failed') {
          const failure = page.providerFailure ?? localCatalogFailure(providerKey,
            new Error(page.errorMessage ?? page.errorCode ?? 'MODEL_CATALOG_AUTHORITY_READ_FAILED'))
          catalogRuntimeStore.acceptFailure({ token, failure })
          return
        }
        items.push(...page.items)
        cursor = page.nextCursor
        pages += 1
        if (pages > 100) throw new Error('MODEL_CATALOG_RENDERER_PAGINATION_LIMIT_EXCEEDED')
      } while (cursor)

      catalogRuntimeStore.acceptAuthority({
        token,
        authorityScopeId: first?.scopeId ?? null,
        authorityRevision: first?.authorityRevision,
        displayedSnapshotDigest: first?.catalogRevision ?? null,
        pendingSnapshotDigest: first?.pendingSnapshotDigest ?? null,
        items,
        stale: first?.status === 'not_synced',
        failure: first?.providerFailure ?? null,
      })

      if (providerKey !== OPENROUTER_PROVIDER_ID) return
      modelCatalogItems.value = items.map((item) => ({ ...item, name: item.displayName,
        vendor: item.vendor ?? '', status: 'visible' as const, supportedParameters: [...(item.supportedParameters ?? [])],
        inputModalities: [...(item.inputModalities ?? [])], outputModalities: [...(item.outputModalities ?? [])],
        lastSeenSnapshotId: first?.catalogRevision ?? `catalog:${item.syncedAtMs ?? 0}` })) as ModelCatalogItem[]
      openRouterModelModalitiesById.value = new Map(items.map((item) => [item.modelId,
        Object.freeze({ input: item.inputModalities ?? [], output: item.outputModalities ?? [] })]))
      modelCatalogListStatus.value = first?.status === 'syncing' ? 'syncing'
        : first?.status === 'not_synced' ? 'not_synced' : 'synced'
      modelCatalogNotice.value = items.length === 0 ? t('errors.modelCatalog.notSynced') : null
      applySelectedModelOverrideForActiveConvo()
      await refreshSelectedModelImageCapability()
    } catch (error) {
      catalogRuntimeStore.acceptFailure({ token, failure: localCatalogFailure(providerKey, error) })
      if (providerKey === OPENROUTER_PROVIDER_ID) {
        modelCatalogListStatus.value = 'failed'
        modelCatalogNotice.value = t('errors.modelCatalog.syncFailed')
      }
    }
  }

  async function refreshModelLists() {
    const startupSync = syncProviderCatalogsOnStartup().catch(() => undefined)
    await Promise.all(FIRST_PARTY_CATALOG_PROVIDER_KEYS.map((providerKey) => hydrateCatalogProvider(providerKey)))
    void startupSync.then(() => Promise.all(FIRST_PARTY_CATALOG_PROVIDER_KEYS.map((providerKey) =>
      hydrateCatalogProvider(providerKey)))).catch(() => undefined)
  }

  function runtimeErrorSummary(entry: BranchRuntimeCacheEntryV2): ErrorSummary | null {
    const failure = entry.errorFact
    if (!failure) return null
    const message = failure.providerError?.message ?? failure.providerError?.rawText ??
      failure.transportError?.message ?? failure.starverseDiagnosticCode
    const phase = failure.phase === 'terminal_persistence'
      ? 'post_stream'
      : failure.phase === 'stream_read' || failure.phase === 'stream_decode'
        ? 'mid_stream'
        : 'pre_stream'
    const source = failure.origin === 'http_response'
      ? 'provider_http'
      : failure.origin === 'response_stream'
        ? 'provider_stream'
        : failure.origin === 'network_transport'
          ? 'transport'
          : failure.origin === 'response_decoder'
            ? 'local_decoder'
            : failure.origin === 'starverse_internal'
              ? 'persistence'
              : 'provider'
    return Object.freeze({
      completionClass: entry.status === 'cancelled' ? 'cancelled' : 'error',
      phase,
      code: failure.starverseDiagnosticCode,
      message,
      provider: failure.providerId,
      source,
      raw: projectProviderFailureForUiV2(failure),
    })
  }

  function applyBranchRuntimeOverlayToState(branchId: string): boolean {
    const entry = branchRuntimeCache.get(branchId)
    const targetAnswerId = entry?.targetAnswerId
    if (!entry || !targetAnswerId) return false
    const messages = state.value.entities?.messagesById ?? state.value.messages
    const previous = messages[targetAnswerId]
    if (!previous || previous.role !== 'assistant') return false
    const nonTextBlocks = previous.contentBlocks.filter((block) => block.type !== 'text')
    const contentBlocks = entry.body.length > 0
      ? [{ type: 'text' as const, text: entry.body }, ...nonTextBlocks]
      : nonTextBlocks
    const errorSummary = runtimeErrorSummary(entry) ?? previous.errorSummary
    const nextMessage: MessageState = {
      ...previous,
      contentText: entry.body,
      contentBlocks: markRaw(contentBlocks),
      reasoningDetailsRaw: markRaw([...entry.reasoning]),
      reasoningVersion: previous.reasoningVersion + 1,
      textVersion: previous.textVersion + 1,
      streaming: {
        isTarget: entry.status === 'generating',
        isComplete: entry.status !== 'generating',
      },
      errorSummary,
    }
    const nextMessages = { ...messages, [targetAnswerId]: nextMessage }
    state.value = {
      ...state.value,
      messages: nextMessages,
      entities: { messagesById: nextMessages },
    }
    const currentMeta = messageMetaById.value.get(targetAnswerId)
    if (currentMeta) {
      runtimeMessageMetaById.value = new Map(runtimeMessageMetaById.value).set(targetAnswerId, {
        ...currentMeta,
        status: entry.status === 'generating'
          ? 'streaming'
          : entry.status === 'completed'
            ? 'final'
            : entry.status === 'cancelled'
              ? 'aborted'
              : 'error',
      })
    }
    return true
  }

  function hydrateStateFromPersistedMessages(
    convoId: string,
    rows: ReadonlyArray<Readonly<{ id: string; role: string; seq: number; body: string; meta?: unknown }>>
  ) {
    const previousMessages = state.value.entities?.messagesById ?? state.value.messages
    const s = createInitialState()
    s.runs[convoId] = { runId: convoId, status: 'idle', comments: [] }
    s.runMessageIds[convoId] = []

    for (const r of rows) {
      const messageId = r.id
      const roleRaw = String(r.role ?? '').trim()
      const role = roleRaw === 'user' ? 'user' : roleRaw === 'assistant' ? 'assistant' : roleRaw === 'tool' ? 'tool' : 'tool'
      const body = typeof r.body === 'string' ? r.body : String(r.body ?? '')
      const contentText = roleRaw === role ? body : `[role:${roleRaw}]\n${body}`

      const meta = r.meta ?? null
      const reasoningDetailsRaw = extractReasoningDetailsFromMeta(meta)
      const reasoningProjectionContext = extractReasoningProjectionContextFromMeta(meta)
      const providerNativeContents = extractProviderNativeContentsFromMeta(meta)
      const annotations = extractAnnotationsFromMeta(meta)
      const hasEncryptedReasoning = reasoningDetailsRaw.some((detail) => detail && typeof detail === 'object' && (detail as any).type === 'reasoning.encrypted')
      const requestConfig = extractRequestReasoningConfigFromMeta(meta)
      const timing = extractReasoningTimingFromMeta(meta)
      const errorEnvelope = extractErrorEnvelopeFromMeta(meta)
      const errorSummary = extractErrorSummaryFromMeta(meta)
      const previousPanelState = previousMessages[messageId]?.reasoningPanelState

      const persistedMessage = {
        messageId,
        ...(reasoningProjectionContext ?? {}),
        role,
        contentText,
        contentBlocks: markRaw(contentText.length > 0 ? [{ type: 'text', text: contentText }] : []),
        toolCalls: [],
        ...(annotations.length > 0 ? { annotations: markRaw(annotations) } : {}),
        reasoningDetailsRaw: markRaw(reasoningDetailsRaw),
        reasoningDisplayBlocks: markRaw([]),
        providerNativeContents: markRaw(providerNativeContents),
        reasoningPanelState: previousPanelState ?? 'collapsed',
        hasEncryptedReasoning,
        reasoningDurationMs: timing.durationMs,
        reasoningEndReason: timing.endReason,
        reasoningDurationIsFallback: timing.isFallback,
        streaming: { isTarget: false, isComplete: true },
        textVersion: 0,
        reasoningVersion: 0,
        requestedReasoningMode: requestConfig?.mode === 'effort' ? 'effort' : 'auto',
        ...(requestConfig?.mode === 'effort' ? { requestedReasoningEffort: requestConfig.effort } : {}),
        requestedReasoningExclude: requestConfig?.mode === 'effort' ? requestConfig.exclude === true : false,
        errorEnvelope,
        errorSummary,
      } as MessageState
      s.messages[messageId] = mergePersistedMessageWithRuntimeOverlay(
        persistedMessage,
        previousMessages[messageId],
        activeAssistantMessageId.value === messageId || activeGenerationV2Answer.value?.answerRootId === messageId,
      )

      s.runMessageIds[convoId].push(messageId)
    }

    state.value = s
    inFlightEnvelopeIds.value = new Set()
    errorEnvelopeUnavailableIds.value = new Set()
    pendingEnvelopeIds.clear()
    if (pendingEnvelopeTimer) {
      clearTimeout(pendingEnvelopeTimer)
      pendingEnvelopeTimer = null
    }
  }

  function questionIdForMessage(messageId: string, role: string): string | null {
    if (role === 'user') return messageId
    const meta = messageMetaById.value.get(messageId)
    return meta?.questionId ?? null
  }

  function isAnswerRootMessage(messageId: string): boolean {
    const meta = messageMetaById.value.get(messageId)
    return !!meta && meta.role === 'assistant' && meta.answerRootId === messageId
  }

  function chosenQuestionIdForAnswerRootMessage(answerRootMessageId: string): string | null {
    const answer = branchViewSnapshot.value.answerByRootId.get(answerRootMessageId)
    if (!answer) {
      if (import.meta.env?.DEV) {
        console.log('[ui-app] chosenQuestionIdForAnswerRootMessage: answer missing from branch projection', { answerRootMessageId })
      }
      return null
    }
    return answer.isChosen ? answer.questionId : null
  }

  function hasPersistedVisibleContent(messageId: string): boolean {
    const msg = (state.value as any)?.messages?.[messageId] as { contentText?: string; contentBlocks?: any[] } | undefined
    const text = typeof msg?.contentText === 'string' ? msg.contentText : ''
    if (text.trim().length > 0) return true
    if (Array.isArray(msg?.contentBlocks) && msg.contentBlocks.length > 0) return true
    return false
  }

  function isActiveStreamInAnswerGroup(answerRootId: string): boolean {
    const activeId = activeAssistantMessageId.value
    if (!activeId) return false
    if (activeId === answerRootId) return true
    const activeMeta = messageMetaById.value.get(activeId)
    return !!activeMeta && activeMeta.answerRootId === answerRootId
  }

  function isAnswerGroupStreamingForQuestion(questionId: string): boolean {
    const chosen = turnFiltersByQuestionId.value.get(questionId)?.chosenAnswerRootId
    if (!chosen) {
      const activeId = activeAssistantMessageId.value
      if (activeId) {
        const activeMeta = messageMetaById.value.get(activeId)
        if (activeMeta?.role === 'assistant' && activeMeta.questionId === questionId) return true
      }

      for (const [messageId, meta] of messageMetaById.value.entries()) {
        if (meta?.role !== 'assistant') continue
        if (meta.questionId !== questionId) continue
        if (String(meta.status ?? 'final').trim() !== 'streaming') continue
        if (!hasPersistedVisibleContent(messageId)) return true
      }
      return false
    }

    // Prefer the chosen root's status if we have it.
    const chosenMeta = messageMetaById.value.get(chosen)
    const chosenStatus = String(chosenMeta?.status ?? 'final').trim()
    if (chosenStatus === 'streaming') {
      if (isActiveStreamInAnswerGroup(chosen)) return true

      // Self-heal: if persisted status is still 'streaming' but we already have non-empty content
      // (e.g. after a crash/old build), treat it as non-streaming so controls aren't permanently blocked.
      if (hasPersistedVisibleContent(chosen)) {
        if (import.meta.env?.DEV) {
          console.log('[ui-app] isAnswerGroupStreamingForQuestion: self-heal (has persisted content)', { questionId, chosen, chosenStatus })
        }
        return false
      }
      if (import.meta.env?.DEV) {
        console.log('[ui-app] isAnswerGroupStreamingForQuestion: blocking (status=streaming, no content)', { questionId, chosen, chosenStatus })
      }
      return true
    }

    // Fallback: if we have an active stream, only consider it streaming when the active target belongs to this answer group.
    return isActiveStreamInAnswerGroup(chosen)
  }

  function isTurnExcludedForMessage(messageId: string, role: string): boolean {
    const qid = questionIdForMessage(messageId, role)
    if (!qid) return false
    const t = turnFiltersByQuestionId.value.get(qid)
    return t?.effectiveMode === 'exclude'
  }

  function messageCandidateCacheKey(branchId: string, messageId: string): string {
    return `${branchId}\u001f${messageId}`
  }

  function getMessageCandidatePager(messageId: string): Readonly<{
    index: number
    total: number
    canPrev: boolean
    canNext: boolean
  }> | null {
    const bid = activeBranchId.value
    const mid = String(messageId ?? '').trim()
    if (!bid || !mid) return null
    const navigation = messageCandidateNavigationCache.value.get(messageCandidateCacheKey(bid, mid))
    if (!navigation) return null
    return Object.freeze({
      index: navigation.currentIndex,
      total: navigation.total,
      canPrev: navigation.previous !== null,
      canNext: navigation.next !== null,
    })
  }

  function getQuestionPagerForQuestion(questionId: string) {
    return getMessageCandidatePager(questionId)
  }

  function getCandidatePager(answerId: string) {
    return getMessageCandidatePager(answerId)
  }

  function isMessageCandidateLoading(messageId: string): boolean {
    const bid = activeBranchId.value
    const mid = String(messageId ?? '').trim()
    return Boolean(bid && mid && messageCandidateLoading.value.has(messageCandidateCacheKey(bid, mid)))
  }

  async function ensureMessageCandidateNavigationLoaded(messageId: string): Promise<void> {
    const bid = activeBranchId.value
    const mid = String(messageId ?? '').trim()
    if (!bid || !mid) return
    const key = messageCandidateCacheKey(bid, mid)
    if (messageCandidateNavigationCache.value.has(key)) return
    const token = `${messageCandidateEpochGlobal.value}:${key}`
    if (messageCandidateLoading.value.get(key) === token) return
    messageCandidateLoading.value.set(key, token)
    messageCandidateLoading.value = new Map(messageCandidateLoading.value)
    try {
      const navigation = await getGenerationV2MessageCandidateNavigation(bid, mid)
      if (activeBranchId.value !== bid ||
          token !== `${messageCandidateEpochGlobal.value}:${key}`) return
      messageCandidateNavigationCache.value.set(key, navigation)
      messageCandidateNavigationCache.value = new Map(messageCandidateNavigationCache.value)
    } catch (error) {
      if (activeBranchId.value === bid && token === `${messageCandidateEpochGlobal.value}:${key}`) {
        loadError.value = error instanceof Error ? error.message : String(error)
      }
    } finally {
      if (messageCandidateLoading.value.get(key) === token) {
        messageCandidateLoading.value.delete(key)
        messageCandidateLoading.value = new Map(messageCandidateLoading.value)
      }
    }
  }

  function invalidateMessageCandidateNavigation() {
    resetCandidatesCache()
  }

      async function refreshTurnFilters(branchId: string) {
    const bid = String(branchId ?? '').trim()
    if (!bid) return
    await refreshRenderableBranchView(bid)
  }

  function projectConversationPageItems(
    items: readonly Readonly<{
      conversationId: string
      projectId: string
      title: string
      updatedAtMs: number
    }>[],
  ): ConvoSummary[] {
    return items.map((conversation) => ({
      id: conversation.conversationId,
      projectId: conversation.projectId,
      title: conversation.title,
      createdAt: conversation.updatedAtMs,
      updatedAt: conversation.updatedAtMs,
    }))
  }

  function sortConversationSummaries(items: readonly ConvoSummary[]): ConvoSummary[] {
    return [...items].sort((left, right) =>
      right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
  }

  async function refreshConvos() {
    loadError.value = null
    const filterProjectId = activeProjectId.value
    const projectIds = filterProjectId === null ? projects.value.map((project) => project.id) : [filterProjectId]
    const pages = await Promise.all(projectIds.map(async (projectId) =>
      [projectId, await listGenerationV2Conversations(projectId)] as const))
    if (activeProjectId.value !== filterProjectId) return
    conversationCursorByProjectId.value = new Map(
      pages.map(([projectId, page]) => [projectId, page.nextCursor]),
    )
    convos.value = sortConversationSummaries(
      pages.flatMap(([, page]) => projectConversationPageItems(page.items)),
    )
    if (!projectsOnlyWorkspace.value && !activeConvoId.value && convos.value.length > 0) activeConvoId.value = convos.value[0].id
  }

  async function loadMoreConvos() {
    const filterProjectId = activeProjectId.value
    const requests = [...conversationCursorByProjectId.value.entries()]
      .filter(([, cursor]) => cursor !== null)
      .map(async ([projectId, cursor]) =>
        [projectId, await listGenerationV2Conversations(projectId, cursor)] as const)
    if (requests.length === 0) return
    const pages = await Promise.all(requests)
    if (activeProjectId.value !== filterProjectId) return
    const nextCursors = new Map(conversationCursorByProjectId.value)
    const byId = new Map(convos.value.map((conversation) => [conversation.id, conversation]))
    for (const [projectId, page] of pages) {
      nextCursors.set(projectId, page.nextCursor)
      for (const conversation of projectConversationPageItems(page.items)) {
        byId.set(conversation.id, conversation)
      }
    }
    conversationCursorByProjectId.value = nextCursors
    convos.value = sortConversationSummaries([...byId.values()])
  }

    async function refreshProjects() {
    loadError.value = null
    const workspace = await ensureGenerationV2DefaultWorkspace()
    inboxId.value = workspace.projectId
    const listedProjects = await listGenerationV2Projects()
    projects.value = listedProjects.map((project) => ({ id: project.projectId, name: project.name,
      createdAt: project.createdAtMs, updatedAt: project.updatedAtMs }))
    await refreshProjectCounts()
  }

  async function refreshProjectCounts() {
    if (projects.value.length === 0) {
      projectCounts.value = new Map()
      return
    }

    const counts = await Promise.all(projects.value.map(async (project) =>
      [project.id, (await listGenerationV2Conversations(project.id)).totalCount] as const))
    projectCounts.value = new Map(counts)
  }

  async function refreshBranchesForActiveConvo() {
    const convoId = activeConvoId.value
    if (!convoId) {
      branches.value = []
      branchNextCursor.value = null
      return
    }
    const template = systemTemplateSnapshot.value
    if (template?.conversation.id === convoId) {
      branches.value = [{
        id: template.conversation.branchId,
        convoId,
        headMessageId: null,
        name: null,
        createdAt: template.conversation.createdAt,
        updatedAt: template.conversation.updatedAt,
        deletedAt: null,
      }]
      branchNextCursor.value = null
      return
    }
    const page = await listGenerationV2Branches(convoId)
    if (activeConvoId.value !== convoId) return
    const firstPage = page.items.map((branch) => ({ id: branch.branchId, convoId,
      headMessageId: branch.headMessageId, name: branch.name, createdAt: branch.updatedAtMs,
      updatedAt: branch.updatedAtMs, deletedAt: null }))
    const pinnedActive = branches.value.find((branch) =>
      branch.convoId === convoId && branch.id === activeBranchId.value)
    branches.value = pinnedActive && !firstPage.some((branch) => branch.id === pinnedActive.id)
      ? [...firstPage, pinnedActive]
      : firstPage
    branchNextCursor.value = page.nextCursor
  }

  async function loadMoreBranches() {
    const convoId = activeConvoId.value
    const cursor = branchNextCursor.value
    if (!convoId || !cursor) return
    const page = await listGenerationV2Branches(convoId, cursor)
    if (activeConvoId.value !== convoId || branchNextCursor.value !== cursor) return
    const byId = new Map(branches.value.map((branch) => [branch.id, branch]))
    for (const branch of page.items) {
      byId.set(branch.branchId, {
        id: branch.branchId,
        convoId,
        headMessageId: branch.headMessageId,
        name: branch.name,
        createdAt: branch.updatedAtMs,
        updatedAt: branch.updatedAtMs,
        deletedAt: null,
      })
    }
    branches.value = [...byId.values()]
    branchNextCursor.value = page.nextCursor
  }

  async function ensureGenerationV2BranchForConversation(conversationId: string): Promise<BranchSummary> {
    const template = systemTemplateSnapshot.value
    if (template?.conversation.id === conversationId) {
      return {
        id: template.conversation.branchId,
        convoId: conversationId,
        headMessageId: null,
        name: null,
        createdAt: template.conversation.createdAt,
        updatedAt: template.conversation.updatedAt,
        deletedAt: null,
      }
    }
    const branch = (await listGenerationV2Branches(conversationId)).items[0]
    if (branch) return { id: branch.branchId, convoId: conversationId, headMessageId: branch.headMessageId,
      name: branch.name, createdAt: branch.updatedAtMs, updatedAt: branch.updatedAtMs, deletedAt: null }
    throw new Error('GENERATION_V2_CONVERSATION_BRANCH_MISSING')
  }

  function resetCandidatesCache() {
    messageCandidateEpochGlobal.value += 1
    messageCandidateNavigationCache.value = new Map()
    messageCandidateLoading.value = new Map()
    if (shouldLogDebug()) {
      console.log('[ui-app] resetCandidatesCache', {
        messageCandidateEpochGlobal: messageCandidateEpochGlobal.value,
      })
    }
  }

  async function refreshRenderableBranchView(branchId: string) {
    await loadTranscriptForBranch(branchId)
  }

  function patchBranch(branchId: string, patch: Partial<Omit<BranchSummary, 'id'>>) {
    const bid = String(branchId ?? '').trim()
    if (!bid) return
    branches.value = branches.value.map((b) => (b.id === bid ? ({ ...b, ...patch } satisfies BranchSummary) : b))
  }

  async function loadTranscriptForBranch(
    branchId: string,
    beforeMessageId: string | null = null,
    appendEarlier = false,
  ) {
    const bid = String(branchId ?? '').trim()
    if (!bid) return

    const lease = branchProjectionRefreshCoordinator.begin(bid)
    transcriptRefreshToken.value = lease.revision
    const errorFallbacks = captureErrorFallbacks()
    const debug = isUiDebugEnabled()
    if (shouldLogDebug()) {
      console.log('[ui-app] loadTranscriptForBranch: fetching from DB', { branchId: bid, token: lease.revision, debug })
    }
    const page = await readGenerationV2Branch(bid, beforeMessageId)
    const current = generationV2BranchView.value
    const v2View: GenerationV2BranchView = appendEarlier && current?.branchId === bid
      ? Object.freeze({
          ...page,
          turns: Object.freeze([...page.turns, ...current.turns]),
        })
      : page
    const v2Projection = projectGenerationV2BranchForExistingUi(v2View)
    const rendered = v2Projection.rendered

    // Anti-reordering: discard if a newer refresh has started.
    if (!isBranchProjectionLeaseCurrent(lease)) {
      if (shouldLogDebug()) {
        console.log('[ui-app] loadTranscriptForBranch: discarding stale result', { branchId: bid, token: lease.revision, currentToken: transcriptRefreshToken.value })
      }
      return
    }
    const rows = rendered.messages
    const metaMap = new Map<string, MessageMetaEntry>()
    for (const m of rows) {
      const v2Meta = v2Projection.messageMetaById.get(m.id)
      const completionOutcome = v2Meta?.completionOutcome ?? extractCompletionOutcomeFromMeta(m.meta ?? null)
      metaMap.set(m.id, {
        parentId: m.parentId ?? null,
        questionId: m.questionId ?? null,
        answerRootId: m.answerRootId ?? null,
        role: String(m.role ?? '').trim(),
        status: v2Meta?.status === 'cancelled' ? 'aborted' : v2Meta?.status === 'failed' ? 'error' : String(v2Meta?.status ?? m.status ?? 'final'),
        providerId: v2Meta?.providerId as MessageMetaEntry['providerId'] ?? null,
        modelId: v2Meta?.modelId ?? null,
        completionOutcome,
      })
    }
    const projection = buildBranchViewSnapshot({
      branchId: bid,
      revision: lease.revision,
      rendered,
      messageMetaById: metaMap,
    })
    if (!isBranchProjectionLeaseCurrent(lease)) return

    // Stable branch relationships land as one immutable root replacement before
    // the message runtime overlay exposes the corresponding transcript rows.
    branchViewSnapshot.value = projection
    generationV2BranchView.value = v2View
    // The branch read is the current epoch-2 projection authority. This also
    // gives the promoted system-template branch its committed head immediately;
    // the template shell itself intentionally has no duplicate head field.
    patchBranch(bid, { headMessageId: v2View.headMessageId, updatedAt: Date.now() })
    const persistedIds = new Set(rows.map((row) => row.id))
    runtimeMessageSeqById.value = new Map(
      [...runtimeMessageSeqById.value].filter(([messageId]) => !persistedIds.has(messageId)),
    )
    runtimeMessageMetaById.value = new Map(
      [...runtimeMessageMetaById.value].filter(([messageId]) => !persistedIds.has(messageId)),
    )
    retainReasoningArtifactsForMessageIds(rows.map((m) => m.id))
    hydrateStateFromPersistedMessages(
      bid,
      rows.map((m) => ({ id: m.id, role: m.role, seq: m.seq, body: m.body, meta: m.meta }))
    )
    applyBranchRuntimeOverlayToState(bid)
    for (const row of rows) {
      const hydrated = state.value.entities?.messagesById?.[row.id] ?? state.value.messages[row.id]
      if (!hydrated || hydrated.role !== 'assistant') continue
      recordReasoningProjectionTrace({
        stage: 'branch_hydrated',
        operationId: String((asRecord(row.meta)?.operationId) ?? ''),
        answerRootId: row.id,
        activeBranchId: activeBranchId.value,
        viewBranchId: bid,
        answerKnownInView: true,
        rawDetailCount: hydrated.reasoningDetailsRaw.length,
        reasoningVersion: hydrated.reasoningVersion,
        hasProjectionContext: Boolean(hydrated.providerId && hydrated.protocolContractId),
        messagePresentAfter: true,
        transcriptContainsAnswer: state.value.runMessageIds[bid]?.includes(row.id) === true,
      })
    }
    applyErrorFallbacks(errorFallbacks)
    if (shouldLogDebug()) {
      const statuses = [...metaMap.entries()].map(([id, m]) => ({ id: id.slice(0, 8), status: m.status }))
      console.log('[ui-app] loadTranscriptForBranch: updated messageMetaById', { statuses })
      if (projection.consistencyErrors.length > 0) {
        console.warn('[ui-app] branch projection consistency errors', {
          branchId: bid,
          revision: lease.revision,
          errors: projection.consistencyErrors,
        })
      }
    }
    // Epoch-2 answers carry their persisted terminal/provider projection in the branch view.
    // Provider-native reasoning hydration is handled by the V2 artifact projection, never by the legacy DB bridge.

    for (const row of rows) {
      const meta = metaMap.get(row.id)
      if (meta?.role === 'user' ||
          meta?.role === 'assistant' && meta.answerRootId === row.id) {
        void ensureMessageCandidateNavigationLoaded(row.id)
      }
    }
  }

  // ======== UNIFIED REFRESH ENTRY (Anti-reordering Guard) ========
  // All transcript refreshes MUST use this function to ensure token-based ordering.
  // Note: assertInvariants() is NOT called here to avoid false positives during transient states.
  // Callers should invoke assertInvariants() at stable boundaries (after all state updates complete).
  async function refreshTranscriptLatestOnly() {
    const bid = activeBranchId.value
    if (!bid) return
    await loadTranscriptForBranch(bid)
  }

  async function loadEarlierTranscript() {
    const view = generationV2BranchView.value
    if (!view || view.branchId !== activeBranchId.value || !view.hasMoreTurns || !view.beforeMessageId) return
    await loadTranscriptForBranch(view.branchId, view.beforeMessageId, true)
  }

  // ======== INVARIANT ASSERTION (Development Only) ========
  // Guards against regression: activeStream should never exist when status is 'final'.
  function assertInvariants() {
    const activeId = activeAssistantMessageId.value
    if (import.meta.env.DEV && activeId) {
      const meta = messageMetaById.value.get(activeId)
      if (meta?.status === 'final' || meta?.status === 'error' || meta?.status === 'aborted') {
        console.error('❌ INVARIANT VIOLATION: activeStream exists but message status is final/error/aborted', {
          assistantMessageId: activeId,
          status: meta.status
        })
        // Optional: Uncomment to break in debugger
        // debugger
      }
    }
  }

  // ======== FINALIZATION HELPERS (Enforces Correct Ordering) ========
  // Encapsulates the critical pattern: refresh FIRST, then clear activeStream.
  function cacheGenerationV2RoutePreference(
    conversationId: string,
    snapshot: GenerationV2ConversationRoutePreferenceSnapshot | null,
  ): void {
    const next = new Map(generationV2RoutePreferenceByConversationId.value)
    next.set(conversationId, snapshot)
    generationV2RoutePreferenceByConversationId.value = next
  }

  async function loadGenerationV2RoutePreference(conversationId: string): Promise<void> {
    cacheGenerationV2RoutePreference(
      conversationId,
      await getGenerationV2ConversationRoutePreference(conversationId),
    )
  }

  function cacheGenerationV2Config(conversationId: string, snapshot: GenerationV2ConfigLayerView): void {
    const next = new Map(generationV2ConfigByConversationId.value)
    next.set(conversationId, snapshot)
    generationV2ConfigByConversationId.value = next
  }

  async function loadGenerationV2SemanticConfig(conversationId: string): Promise<void> {
    cacheGenerationV2Config(conversationId, await getGenerationV2Config('conversation', conversationId))
  }

  async function reloadGenerationV2ConversationAuthorities(conversationId: string): Promise<void> {
    await Promise.all([
      loadGenerationV2RoutePreference(conversationId),
      loadGenerationV2SemanticConfig(conversationId),
    ])
  }

      async function loadTranscriptForActiveConvo() {
    const convoId = activeConvoId.value
    if (!convoId) {
      branchProjectionRefreshCoordinator.invalidate()
      transcriptRefreshToken.value += 1
      branchViewSnapshot.value = emptyBranchViewSnapshot<MessageMetaEntry>()
      runtimeMessageSeqById.value = new Map()
      runtimeMessageMetaById.value = new Map()
      state.value = createInitialState()
      activeBranchId.value = null
      branches.value = []
      applyReasoningPrefs(DEFAULT_REASONING_PREFS)
      applyImageGenerationStateForActiveConvo()
      return
    }

    const ensured = await ensureGenerationV2BranchForConversation(convoId)
    await Promise.all([
      loadGenerationV2RoutePreference(convoId),
      loadGenerationV2SemanticConfig(convoId),
    ])
    await refreshBranchesForActiveConvo()
    if (!branches.value.some((b) => b.id === ensured.id)) branches.value = [ensured, ...branches.value]

    const preferredId = activeBranchId.value
    const selected =
      (preferredId ? branches.value.find((b) => b.id === preferredId) : null) ??
      branches.value.find((b) => b.id === ensured.id) ??
      branches.value[0] ??
      ensured
    activeBranchId.value = selected.id
    resetCandidatesCache()
    await refreshTranscriptLatestOnly()
    await loadReasoningPrefsForActiveConvo()
    applySelectedModelOverrideForActiveConvo()
    applyImageGenerationStateForActiveConvo()
  }

  async function onSelectConvo(convoId: string) {
    activeConvoId.value = convoId
    await loadTranscriptForActiveConvo()
    if (convoId !== systemTemplateSnapshot.value?.conversation.id) {
      await setLastFormalConversationId(convoId)
    }
    assertInvariants() // Stable boundary: conversation switched and refreshed
  }

  async function onSelectBranch(branchId: string) {
    const bid = String(branchId ?? '').trim()
    if (!bid || bid === activeBranchId.value) return
    activeBranchId.value = bid
    resetCandidatesCache()
    await refreshTranscriptLatestOnly()
    assertInvariants() // Stable boundary: branch switched and refreshed
  }

  function findRenderedMessageElement(messageId: string): HTMLElement | null {
    const expected = `msg-wrap-${messageId}`
    for (const element of document.querySelectorAll<HTMLElement>('[data-testid]')) {
      if (element.getAttribute('data-testid') === expected) return element
    }
    return null
  }

  async function navigateToBranchMessage(
    targetBranchId: string,
    targetMessageId: string,
    expectedConversationId: string,
    expectedSourceRevision: number,
  ): Promise<void> {
    const bid = String(targetBranchId ?? '').trim()
    const mid = String(targetMessageId ?? '').trim()
    if (!bid || !mid || activeConvoId.value !== expectedConversationId ||
        navigationRevision.value !== expectedSourceRevision) return

    if (activeBranchId.value !== bid) {
      activeBranchId.value = bid
      resetCandidatesCache()
    }
    const targetRevision = navigationRevision.value
    await refreshTranscriptLatestOnly()
    if (activeConvoId.value !== expectedConversationId || activeBranchId.value !== bid ||
        navigationRevision.value !== targetRevision) return

    const loadedView = generationV2BranchView.value
    if (loadedView?.branchId === bid && !branches.value.some((branch) => branch.id === bid)) {
      const now = Date.now()
      branches.value = [...branches.value, {
        id: bid,
        convoId: expectedConversationId,
        headMessageId: loadedView.headMessageId,
        name: loadedView.branchName,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }]
    }

    let pageCount = 0
    while (!isMessageInTranscript(mid)) {
      const view = generationV2BranchView.value
      if (!view || view.branchId !== bid || !view.hasMoreTurns || !view.beforeMessageId) break
      if (pageCount >= 200) {
        throw new Error('GENERATION_V2_MESSAGE_CANDIDATE_ANCHOR_PAGE_LIMIT')
      }
      pageCount += 1
      await loadTranscriptForBranch(bid, view.beforeMessageId, true)
      if (activeConvoId.value !== expectedConversationId || activeBranchId.value !== bid ||
          navigationRevision.value !== targetRevision) return
    }
    if (!isMessageInTranscript(mid)) {
      throw new Error('GENERATION_V2_MESSAGE_CANDIDATE_ANCHOR_NOT_FOUND')
    }

    setCursorForBranch(bid, mid)
    await nextTick()
    if (activeConvoId.value !== expectedConversationId || activeBranchId.value !== bid ||
        navigationRevision.value !== targetRevision) return
    const element = findRenderedMessageElement(mid)
    if (!element) throw new Error('GENERATION_V2_MESSAGE_CANDIDATE_ANCHOR_NOT_RENDERED')
    element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    assertInvariants()
  }

  async function onRenameConvo(convoId: string, title: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      await renameGenerationV2Conversation(convoId, title)
      await refreshConvos()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onDeleteConvo(convoId: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      const deletingActiveConvo = String(activeConvoId.value ?? '') === String(convoId ?? '')
      await deleteGenerationV2Conversation(convoId)
      if (deletingActiveConvo) reasoningArtifactsByMessageId.value = {}
      await refreshConvos()
      await loadTranscriptForActiveConvo()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onMoveConvoToProject(convoId: string, projectId: string | null) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      if (!projectId) throw new Error('GENERATION_V2_PROJECT_REQUIRED')
      await moveGenerationV2Conversation(convoId, projectId)
      await refreshConvos()
      applyImageGenerationStateForActiveConvo()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onBulkDeleteConvos(convoIds: string[]) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      const activeDeleted = convoIds.some((id) => String(id ?? '') === String(activeConvoId.value ?? ''))
      await Promise.all(convoIds.map((id) => deleteGenerationV2Conversation(id)))
      if (activeDeleted) reasoningArtifactsByMessageId.value = {}
      await refreshConvos()
      await loadTranscriptForActiveConvo()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onBulkMoveConvosToProject(convoIds: string[], projectId: string | null) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      if (!projectId) throw new Error('GENERATION_V2_PROJECT_REQUIRED')
      await Promise.all(convoIds.map((id) => moveGenerationV2Conversation(id, projectId)))
      await refreshConvos()
      applyImageGenerationStateForActiveConvo()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  // ========== Project Management ==========

  function onSelectProject(projectId: string | null) {
    if (isDraftInteractionLocked.value) return
    activeProjectId.value = projectId
    // 切换项目后刷新对话列表
    void refreshConvos()
  }

  async function onCreateProject(name: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      const created = await createGenerationV2Project(name)
      await refreshProjects()
      onSelectProject(created.projectId)
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onRenameProject(projectId: string, name: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      await renameGenerationV2Project(projectId, name)
      await refreshProjects()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onDeleteProject(projectId: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      await deleteGenerationV2Project(projectId)
      // 如果删除的是当前选中的项目，切换到全部对话
      if (activeProjectId.value === projectId) {
        activeProjectId.value = null
      }
      await refreshProjects()
      await refreshConvos()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onCreateConvo() {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    const template = await getSystemChatTemplate()
    systemTemplateSnapshot.value = template
    projectsOnlyWorkspace.value = false
    activeProjectId.value = template.conversation.projectId
    activeConvoId.value = template.conversation.id
    activeBranchId.value = template.conversation.branchId
    await loadTranscriptForActiveConvo()
    await restoreDraftForActiveScope()
    assertInvariants() // Stable boundary: New Chat template is active without creating a formal conversation
  }

  const convoListItems = computed<ConversationListItem[]>(() =>
    convos.value.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }))
  )

  const projectListItems = computed<ProjectListItem[]>(() =>
    projects.value.map((p) => ({
      id: p.id,
      name: p.name,
      isSystem: p.id === inboxId.value,
      convoCount: projectCounts.value.get(p.id) ?? undefined,
    }))
  )

  const searchProjectOptions = computed<SearchProjectOption[]>(() =>
    projects.value.map((p) => ({ id: p.id, name: p.name }))
  )

  const searchConvoOptions = computed<SearchConvoOption[]>(() =>
    convos.value.map((c) => ({ id: c.id, title: c.title, projectId: c.projectId ?? null }))
  )

  const activeTitle = computed(() => (
    getActiveConvoRecord()?.title
    ?? (
      generationV2BranchView.value?.conversationId === activeConvoId.value
        ? generationV2BranchView.value.title
        : ''
    )
  ))

  function openSearchModal() {
    searchModalOpen.value = true
  }

  function closeSearchModal() {
    searchModalOpen.value = false
  }

  async function focusMessageAfterSearch(messageId: string): Promise<boolean> {
    const mid = String(messageId ?? '').trim()
    if (!mid) return false
    const bid = activeBranchId.value
    if (!bid) return false

    setCursorForBranch(bid, mid)
    await nextTick()
    if (!isMessageInTranscript(mid)) return false
    const el = document.querySelector(`[data-testid="msg-wrap-${mid}"]`) as HTMLElement | null
    if (el?.scrollIntoView) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    return true
  }

  async function focusHistoryIncompatibleAttachmentAt(index: number): Promise<boolean> {
    const items = historyIncompatibleAttachmentItems.value
    if (items.length === 0) return false
    let probe = normalizeHistoryIncompatibleIndex(index, items.length)
    for (let attempt = 0; attempt < items.length; attempt += 1) {
      const item = items[probe]
      if (item && await focusMessageAfterSearch(item.messageId)) {
        historyIncompatibleAttachmentIndex.value = probe
        activeHistoryIncompatibleAttachmentId.value = item.attachmentId
        return true
      }
      probe = normalizeHistoryIncompatibleIndex(probe + 1, items.length)
    }
    setAttachmentFeedback('warning', t('sendPlan.targetMessageUnavailable'))
    return false
  }

  async function onReviewHistoryIncompatibleAttachments() {
    if (!historyIncompatibleAttachmentSummary.value.hasItems) return
    historyIncompatibleNavigationActive.value = true
    await focusHistoryIncompatibleAttachmentAt(0)
  }

  async function onNavigateHistoryIncompatibleAttachments(delta: -1 | 1) {
    const items = historyIncompatibleAttachmentItems.value
    if (items.length === 0) return
    historyIncompatibleNavigationActive.value = true
    let probe = normalizeHistoryIncompatibleIndex(historyIncompatibleAttachmentIndex.value + delta, items.length)
    for (let attempt = 0; attempt < items.length; attempt += 1) {
      const item = items[probe]
      if (item && await focusMessageAfterSearch(item.messageId)) {
        historyIncompatibleAttachmentIndex.value = probe
        activeHistoryIncompatibleAttachmentId.value = item.attachmentId
        return
      }
      probe = normalizeHistoryIncompatibleIndex(probe + delta, items.length)
    }
    setAttachmentFeedback('warning', t('sendPlan.targetMessageUnavailable'))
  }

  function mutateAttachmentConfirmationSession(
    updater: (prev: AttachmentConfirmationSession) => AttachmentConfirmationSession
  ) {
    const prev = attachmentConfirmationSession.value
    if (!prev) return
    attachmentConfirmationSession.value = updater(prev)
  }

  function closeAttachmentConfirmationSessionWith(result: AttachmentConfirmationResult) {
    const resolve = attachmentConfirmationResolver.value
    attachmentConfirmationResolver.value = null
    attachmentConfirmationSession.value = null
    historyIncompatibleNavigationActive.value = false
    activeHistoryIncompatibleAttachmentId.value = null
    const shouldFlushDraftPersistence = draftPersistenceQueuedWhileAttachmentConfirmationActive.value
    draftPersistenceQueuedWhileAttachmentConfirmationActive.value = false
    if (shouldFlushDraftPersistence) {
      void flushDraftPersistence()
    }
    if (resolve) resolve(result)
  }

            function closeAttachmentConfirmationByCancel() {
    closeAttachmentConfirmationSessionWith({ confirmed: false, decisions: [] })
  }

  function openAttachmentConfirmationPanel() {
    mutateAttachmentConfirmationSession((prev) => ({
      ...prev,
      collapsed: false,
      validationMessage: null,
    }))
  }

  function collapseAttachmentConfirmationPanel() {
    mutateAttachmentConfirmationSession((prev) => ({
      ...prev,
      collapsed: true,
      validationMessage: null,
    }))
  }

  function toggleAttachmentConfirmationHistorySection() {
    mutateAttachmentConfirmationSession((prev) => ({
      ...prev,
      historySectionExpanded: !prev.historySectionExpanded,
    }))
  }

  function toggleAttachmentConfirmationCurrentSection() {
    mutateAttachmentConfirmationSession((prev) => ({
      ...prev,
      currentSectionExpanded: !prev.currentSectionExpanded,
    }))
  }

  function setAttachmentConfirmationHistoryExcludeAll(checked: boolean) {
    mutateAttachmentConfirmationSession((prev) => ({
      ...prev,
      historyAllExcluded: checked,
      showHistoryValidation: checked ? false : prev.showHistoryValidation,
      validationMessage: null,
    }))
  }

  function setAttachmentConfirmationCurrentDecision(attachmentId: string, decision: AttachmentDecisionValue | null) {
    const normalizedAttachmentId = String(attachmentId ?? '').trim()
    if (!normalizedAttachmentId) return
    mutateAttachmentConfirmationSession((prev) => {
      const nextDecisions = {
        ...prev.currentDecisionsByAttachmentId,
        [normalizedAttachmentId]: decision,
      }
      return {
        ...prev,
        currentDecisionsByAttachmentId: nextDecisions,
        currentValidationAttachmentId:
          prev.currentValidationAttachmentId === normalizedAttachmentId && decision
            ? null
            : prev.currentValidationAttachmentId,
        validationMessage: null,
      }
    })
  }

  function setAttachmentConfirmationCurrentDecisionForAll(decision: AttachmentDecisionValue | null) {
    mutateAttachmentConfirmationSession((prev) => {
      const next: Record<string, AttachmentDecisionValue | null> = {}
      for (const item of prev.currentItems) {
        next[item.attachmentId] = decision
      }
      return {
        ...prev,
        currentDecisionsByAttachmentId: next,
        currentValidationAttachmentId: null,
        validationMessage: null,
      }
    })
  }

  async function focusAttachmentConfirmationValidationTarget(target: Readonly<{
    history: boolean
    attachmentId?: string | null
  }>) {
    await nextTick()
    const key = target.history
      ? 'attachment-confirm-history-exclude-all'
      : `attachment-confirm-current-row-${String(target.attachmentId ?? '').trim()}`
    const el = document.querySelector(`[data-testid="${key}"]`) as HTMLElement | null
    if (el?.scrollIntoView) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.focus?.()
    }
  }

  function collectAttachmentConfirmationDecisions(session: AttachmentConfirmationSession): AttachmentDecision[] {
    const decisions: AttachmentDecision[] = []
    if (session.historyItems.length > 0 && session.historyAllExcluded) {
      for (const item of session.historyItems) {
        decisions.push({
          attachmentId: item.attachmentId,
          source: 'history',
          decision: 'exclude',
          reasonCode: item.reasonCode,
        })
      }
    }
    for (const item of session.currentItems) {
      const decision = session.currentDecisionsByAttachmentId[item.attachmentId]
      if (!decision) continue
      decisions.push({
        attachmentId: item.attachmentId,
        source: item.source,
        decision,
        reasonCode: item.reasonCode,
      })
    }
    return decisions
  }

  async function confirmAttachmentConfirmationSession() {
    const session = attachmentConfirmationSession.value
    if (!session) return
    if (session.historyItems.length > 0 && !session.historyAllExcluded) {
      mutateAttachmentConfirmationSession((prev) => ({
        ...prev,
        showHistoryValidation: true,
        validationMessage: t('sendPlan.historyAllExcludedPrompt'),
      }))
      await focusAttachmentConfirmationValidationTarget({ history: true })
      return
    }
    const missingCurrent = session.currentItems.find((item) => !session.currentDecisionsByAttachmentId[item.attachmentId]) ?? null
    if (missingCurrent) {
      mutateAttachmentConfirmationSession((prev) => ({
        ...prev,
        currentValidationAttachmentId: missingCurrent.attachmentId,
        validationMessage: t('sendPlan.currentDecisionRequired'),
      }))
      await focusAttachmentConfirmationValidationTarget({ history: false, attachmentId: missingCurrent.attachmentId })
      return
    }
    closeAttachmentConfirmationSessionWith({
      confirmed: true,
      decisions: collectAttachmentConfirmationDecisions(session),
    })
  }

  async function focusAttachmentConfirmationHistoryAt(index: number): Promise<boolean> {
    const session = attachmentConfirmationSession.value
    if (!session || session.historyItems.length === 0) return false
    const normalized = normalizeHistoryIncompatibleIndex(index, session.historyItems.length)
    const item = session.historyItems[normalized]
    if (!item) return false
    const focused = await focusMessageAfterSearch(item.messageId)
    if (!focused) {
      setAttachmentFeedback('warning', t('sendPlan.targetMessageUnavailable'))
      return false
    }
    activeHistoryIncompatibleAttachmentId.value = item.attachmentId
    mutateAttachmentConfirmationSession((prev) => ({
      ...prev,
      collapsed: true,
      historyLocateActive: true,
      historyLocateIndex: normalized,
      validationMessage: null,
    }))
    return true
  }

  async function locateAttachmentConfirmationHistoryAll() {
    await focusAttachmentConfirmationHistoryAt(0)
  }

  async function locateAttachmentConfirmationHistoryByAttachmentId(attachmentId: string) {
    const session = attachmentConfirmationSession.value
    if (!session) return
    const idx = session.historyItems.findIndex((item) => item.attachmentId === attachmentId)
    if (idx < 0) return
    await focusAttachmentConfirmationHistoryAt(idx)
  }

  async function navigateAttachmentConfirmationHistory(delta: -1 | 1) {
    const session = attachmentConfirmationSession.value
    if (!session || session.historyItems.length === 0) return
    await focusAttachmentConfirmationHistoryAt(session.historyLocateIndex + delta)
  }

  function closeAttachmentConfirmationLocatorBar() {
    mutateAttachmentConfirmationSession((prev) => ({
      ...prev,
      historyLocateActive: false,
    }))
  }

    async function onSelectSearchHit(hit: SearchHit) {
    if (hit.entityType === 'project') {
      onSelectProject(hit.entityId)
      return
    }

    if (hit.entityType === 'convo') {
      if (hit.projectId !== undefined) {
        onSelectProject(hit.projectId ?? null)
      }
      await onSelectConvo(hit.entityId)
      return
    }

    if (hit.entityType === 'message') {
      if (hit.projectId !== undefined) {
        onSelectProject(hit.projectId ?? null)
      }
      const convoId = hit.convoId
      if (!convoId) return
      await onSelectConvo(convoId)
      await focusMessageAfterSearch(hit.entityId)
    }
  }

  async function ensureActiveConvo(): Promise<string> {
    if (activeConvoId.value) return activeConvoId.value
    const template = systemTemplateSnapshot.value ?? await getSystemChatTemplate()
    systemTemplateSnapshot.value = template
    projectsOnlyWorkspace.value = false
    activeConvoId.value = template.conversation.id
    activeBranchId.value = template.conversation.branchId
    await loadTranscriptForActiveConvo()
    return template.conversation.id
  }

  async function onResetSystemTemplate(input: Readonly<{ resetModelConfig: boolean; resetDraftAttachments: boolean }>) {
    if (workspaceMode.value !== 'template' || isRunning.value || isDraftInteractionLocked.value) return
    const current = await getSystemChatTemplate()
    const updated = await resetSystemChatTemplate({
      templateConversationId: current.conversation.id,
      expectedTemplateRevision: current.conversation.templateRevision,
      resetModelConfig: input.resetModelConfig,
      resetDraftAttachments: input.resetDraftAttachments,
    })
    systemTemplateSnapshot.value = updated
    await reloadGenerationV2ConversationAuthorities(updated.conversation.id)
    if (input.resetDraftAttachments) {
      draft.value = ''
      await restoreDraftForActiveScope()
    }
  }

  async function onAbort() {
    const runtime = activeBranchRuntime.value
    if (runtime?.status === 'generating' && runtime.activeOperationId) {
      const snapshot = branchRuntimeCache.snapshotForOperation(runtime.activeOperationId)
      if (!snapshot) {
        loadError.value = 'GENERATION_V2_RUNTIME_OPERATION_UNKNOWN'
        return
      }
      await abortGenerationV2(
        generationV2RouteForPersistedAnswer({ protocolContractId: snapshot.binding.contractId }),
        runtime.activeOperationId,
      )
      if (activeBranchId.value === runtime.branchId) await refreshRenderableBranchView(runtime.branchId)
      return
    }
    const v2Answer = activeGenerationV2Answer.value
    if (v2Answer?.status === 'streaming') {
      await abortGenerationV2(generationV2RouteForPersistedAnswer(v2Answer), v2Answer.operationId)
      if (activeBranchId.value) await refreshRenderableBranchView(activeBranchId.value)
    }
  }

  function onToggleReasoningPanelState(messageId?: string) {
    const targetId = typeof messageId === 'string' && messageId.trim().length > 0 ? messageId : lastAssistantMessageId.value
    if (!targetId) return
    state.value = toggleReasoningPanelState(state.value, targetId)
  }

          function onOpenReasoningDisplayForMessage(messageId?: string) {
    const targetId = typeof messageId === 'string' && messageId.trim().length > 0 ? messageId : lastAssistantMessageId.value
    if (!targetId) return
    if (reasoningRailMode.value) {
      if (rightRailOpen.value && effectiveRightRailView.value === 'reasoning') {
        rightRailOpen.value = false
        return
      }
      rightRailView.value = 'reasoning'
      rightRailOpen.value = true
      return
    }
    onToggleReasoningPanelState(targetId)
  }

  function requestDeleteQuestion(questionId: string) {
    const qid = String(questionId ?? '').trim()
    if (!qid || isRunning.value) return
    const meta = messageMetaById.value.get(qid)
    if (!meta || meta.role !== 'user') return
    pendingDeleteQuestionId.value = qid
  }

  function cancelDeleteQuestion() {
    pendingDeleteQuestionId.value = null
  }

  async function confirmDeleteQuestion(questionId: string) {
    if (isRunning.value) return
    const bid = String(activeBranchId.value ?? '').trim()
    const qid = String(questionId ?? '').trim()
    if (!bid || !qid) return
    const meta = messageMetaById.value.get(qid)
    if (!meta || meta.role !== 'user') return

    pendingDeleteQuestionId.value = null
    loadError.value = null

    try {
      const expectedHeadMessageId = generationV2BranchView.value?.headMessageId
      if (!expectedHeadMessageId) throw new Error('GENERATION_V2_WORKSPACE_QUESTION_TRUNCATE_STALE')
      clearReasoningArtifactsForMessageIds(getMessageIdsForQuestionRemoval(qid))
      const result = await truncateGenerationV2BranchFromQuestion({ branchId: bid, questionId: qid, expectedHeadMessageId })
      patchBranch(bid, {
        headMessageId: result.headMessageId,
        updatedAt: Date.now(),
      })
      setCursorForBranch(bid, result.headMessageId)
      resetCandidatesCache()
      await refreshRenderableBranchView(bid)
      await refreshBranchesForActiveConvo()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  const DEFAULT_REASONING_PREFS: ReasoningPrefs = { mode: 'auto', effort: 'auto', exclude: false }
  const REASONING_EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

  function isReasoningEffort(value: unknown): value is ReasoningEffort {
    return typeof value === 'string' && (REASONING_EFFORTS as string[]).includes(value)
  }

  function normalizeReasoningPrefs(raw: unknown): ReasoningPrefs | null {
    if (!raw || typeof raw !== 'object') return null
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

    function buildReasoningPrefsFromUi(): ReasoningPrefs {
    const mode: RequestedReasoningMode = requestedReasoningEffort.value === 'auto' ? 'auto' : 'effort'
    const effort = requestedReasoningEffort.value
    const exclude = mode === 'auto' || effort === 'none' ? false : requestedReasoningExclude.value
    return { mode, effort, exclude }
  }

  function applyReasoningPrefs(prefs: ReasoningPrefs) {
    skipReasoningPrefSave.value = true
    if (prefs.mode === 'auto') {
      requestedReasoningEffort.value = 'auto'
      requestedReasoningExclude.value = false
      setTimeout(() => {
        skipReasoningPrefSave.value = false
      }, 0)
      return
    }

    const nextEffort = prefs.effort && prefs.effort !== 'auto' ? prefs.effort : 'none'
    requestedReasoningEffort.value = nextEffort
    requestedReasoningExclude.value = nextEffort === 'none' ? false : prefs.exclude === true
    setTimeout(() => {
      skipReasoningPrefSave.value = false
    }, 0)
  }

    function getActiveConvoRecord(): ConvoSummary | null {
    const convoId = activeConvoId.value
    if (!convoId) return null
    if (convoId === systemTemplateSnapshot.value?.conversation.id) {
      return systemTemplateSnapshot.value.conversation
    }
    return convos.value.find((c) => c.id === convoId) ?? null
  }

  function updateLocalConvoMeta(convoId: string, nextMeta: Record<string, unknown> | null) {
    if (convoId === systemTemplateSnapshot.value?.conversation.id) {
      systemTemplateSnapshot.value = {
        ...systemTemplateSnapshot.value,
        conversation: { ...systemTemplateSnapshot.value.conversation, meta: nextMeta },
      }
      return
    }
    convos.value = convos.value.map((c) => (c.id === convoId ? { ...c, meta: nextMeta } : c))
  }

  async function persistConvoMetaUpdate(convo: ConvoSummary, nextMeta: Record<string, unknown> | null) {
    if (convo.id === systemTemplateSnapshot.value?.conversation.id) {
      const current = await getSystemChatTemplate()
      systemTemplateSnapshot.value = await updateSystemChatTemplateConfig({
        templateConversationId: current.conversation.id,
        expectedTemplateRevision: current.conversation.templateRevision,
        meta: nextMeta,
      })
      return
    }
    await saveConvo({
      id: convo.id,
      title: convo.title,
      projectId: convo.projectId ?? null,
      meta: nextMeta,
    })
    updateLocalConvoMeta(convo.id, nextMeta)
  }

  function getChatSessionConfigForConvo(convo: ConvoSummary | null): ChatSessionConfig {
    const projectMeta = convo?.projectId
      ? getProjectByIdLocal(convo.projectId)?.meta ?? null
      : null
    const base = deserializeChatSessionConfigFromConvoMeta({
      convoMeta: convo?.meta ?? null,
      projectMeta,
      globalReasoningPrefs: globalReasoningPrefs.value,
      globalWebSearchDefaults: globalWebSearchDefaults.value,
      globalGenerationParamsDefaults: globalGenerationParamsDefaults.value,
      globalImageGenerationDefault: globalImageGenerationDefault.value,
    })
    if (!convo || !generationV2RoutePreferenceByConversationId.value.has(convo.id)) return base
    const preference = generationV2RoutePreferenceByConversationId.value.get(convo.id) ?? null
    const withRoute = Object.freeze({ ...base, routeSelection: preference?.selection ?? null })
    const persistedConfig = generationV2ConfigByConversationId.value.get(convo.id)
    if (!persistedConfig || isEmptyGenerationV2SemanticLayer(persistedConfig.semanticLayer)) return withRoute
    const projection = projectGenerationV2SemanticLayerToSessionConfig(
      persistedConfig.semanticLayer,
      withRoute.routeSelection?.kind === 'openai_chat_compatible'
        ? 'local_endpoint'
        : withRoute.routeSelection?.providerId ?? null,
    )
    return mergeChatSessionConfig(withRoute, projection.patch)
  }

  function getActiveSessionConfigSnapshot(): ChatSessionConfig {
    return getChatSessionConfigForConvo(getActiveConvoRecord())
  }

  const activeSessionConfig = computed(() => getActiveSessionConfigSnapshot())
  function providerModelRoute(config: ChatSessionConfig = activeSessionConfig.value): ProviderModelRouteSelection | null {
    return config.routeSelection?.kind === 'provider_model' ? config.routeSelection : null
  }
  function routeModelId(config: ChatSessionConfig = activeSessionConfig.value): string {
    const route = config.routeSelection
    return normalizeRuntimeModelId(route?.kind === 'provider_model' ? route.modelId : route?.selection.modelId)
  }
  function executionProviderId(config: ChatSessionConfig = activeSessionConfig.value): RuntimeProviderId | null {
    const route = config.routeSelection
    return route?.kind === 'openai_chat_compatible' ? 'local_endpoint' : route?.providerId ?? null
  }
  const workspaceMode = computed<'none' | 'template' | 'conversation'>(() => {
    if (!activeConvoId.value) return 'none'
    return activeConvoId.value === systemTemplateSnapshot.value?.conversation.id ? 'template' : 'conversation'
  })

  function providerAvailabilityModels(providerKey: string, source: string): readonly Record<string, unknown>[] {
    const state = catalogRuntimeSnapshot.value[providerKey] ?? catalogRuntimeStore.read(providerKey)
    return state.items.map((item) => {
      const raw = item.observation?.rawProviderRecord ?? {}
      const resolution = item.capabilityResolution
      const supportedGenerationMethods = Array.isArray(raw.supportedGenerationMethods)
        ? raw.supportedGenerationMethods.filter((value): value is string => typeof value === 'string') : undefined
      return Object.freeze({
        providerKey,
        nativeModelId: item.modelId,
        modelId: item.modelId,
        displayName: item.displayName,
        description: item.description ?? undefined,
        source,
        confidence: 'provider_reported',
        observedAtMs: item.observation?.observedAtMs ?? item.syncedAtMs ?? 0,
        observation: item.observation ?? undefined,
        resolvedCapabilities: resolution ?? undefined,
        providerSpecific: Object.freeze({
          thinkingOwnProperty: Object.prototype.hasOwnProperty.call(raw, 'thinking'),
          thinkingRawValue: raw.thinking,
          thinkingRawType: Object.prototype.hasOwnProperty.call(raw, 'thinking') ? typeof raw.thinking : 'missing',
          supportedGenerationMethods,
          inputTokenLimit: typeof raw.inputTokenLimit === 'number' ? raw.inputTokenLimit : undefined,
          outputTokenLimit: typeof raw.outputTokenLimit === 'number' ? raw.outputTokenLimit : undefined,
        }),
        warnings: Object.freeze([]),
      })
    })
  }

  function providerCatalogAvailability<T>(input: Readonly<{
    providerKey: string
    endpointId: string
    profileId: string
    source: string
  }>): T | null {
    const state = catalogRuntimeSnapshot.value[input.providerKey] ?? catalogRuntimeStore.read(input.providerKey)
    if (state.hydrationState === 'idle') return null
    if (state.failure) return Object.freeze({
      ok: false,
      providerKey: input.providerKey,
      endpointId: input.endpointId,
      profileId: input.profileId,
      observedAtMs: Date.now(),
      code: 'network_error',
      message: providerFailurePrimaryMessageV2(state.failure),
      providerFailure: state.failure,
    }) as T
    const models = providerAvailabilityModels(input.providerKey, input.source)
    const observedAtMs = models.reduce((latest, model) => Math.max(latest,
      typeof model.observedAtMs === 'number' ? model.observedAtMs : 0), 0)
    return Object.freeze({
      ok: true,
      providerKey: input.providerKey,
      endpointId: input.endpointId,
      profileId: input.profileId,
      observedAtMs,
      models,
      warnings: Object.freeze([]),
      sourceDocuments: Object.freeze([]),
    }) as T
  }

  function catalogProviderLoading(providerKey: string): boolean {
    const state = catalogRuntimeSnapshot.value[providerKey] ?? catalogRuntimeStore.read(providerKey)
    return state.hydrationState === 'loading' || state.syncState === 'syncing'
  }

  const openAIResponsesModelAvailabilityStatus = computed(() => ({
    loading: catalogProviderLoading(OPENAI_RESPONSES_PROVIDER_KEY),
    result: providerCatalogAvailability<OpenAIModelAvailabilityResult>({ providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
      endpointId: OPENAI_RESPONSES_ENDPOINT_ID, profileId: OPENAI_RESPONSES_PROFILE_ID, source: 'openai_models_api' }),
  }))
  const googleAIStudioModelAvailabilityStatus = computed(() => ({
    loading: catalogProviderLoading(GOOGLE_AI_STUDIO_PROVIDER_KEY),
    result: providerCatalogAvailability<GeminiModelAvailabilityResult>({ providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
      endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID, profileId: GOOGLE_AI_STUDIO_PROFILE_ID, source: 'gemini_models_api' }),
  }))
  const anthropicModelAvailabilityStatus = computed(() => ({
    loading: catalogProviderLoading(ANTHROPIC_MESSAGES_PROVIDER_KEY),
    result: providerCatalogAvailability<AnthropicModelAvailabilityResult>({ providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
      endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID, profileId: ANTHROPIC_MESSAGES_PROFILE_ID, source: 'anthropic_models_api' }),
  }))
  const deepSeekModelAvailabilityStatus = computed(() => ({
    loading: catalogProviderLoading(DEEPSEEK_OFFICIAL_PROVIDER_KEY),
    result: providerCatalogAvailability<DeepSeekModelAvailabilityResult>({ providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID, profileId: DEEPSEEK_OFFICIAL_PROFILE_ID, source: 'deepseek_models_api' }),
  }))

  const providerModelPickerSources = computed<readonly ProviderModelPickerSource[]>(() => ([
    [OPENAI_RESPONSES_PROVIDER_KEY, 'OpenAI Responses'],
    [GOOGLE_AI_STUDIO_PROVIDER_KEY, 'Google AI Studio'],
    [ANTHROPIC_MESSAGES_PROVIDER_KEY, 'Anthropic Messages'],
    [DEEPSEEK_OFFICIAL_PROVIDER_KEY, 'DeepSeek'],
  ] as const).map(([providerId, providerName]) => {
    const state = catalogRuntimeSnapshot.value[providerId] ?? catalogRuntimeStore.read(providerId)
    const statusKind = state.failure ? 'unavailable' as const
      : state.hydrationState === 'loading' ? 'loading' as const
        : state.items.length > 0 ? 'ready' as const : 'not_loaded' as const
    return {
      providerId,
      providerName,
      statusKind,
      statusLabel: state.failure?.providerError?.message ?? (state.items.length > 0 ? `${state.items.length} models` : 'catalog'),
      loading: state.hydrationState === 'loading',
      items: state.items.map((item) => ({
        providerId,
        providerName,
        modelId: item.modelId,
        modelKey: item.modelKey,
        displayName: item.displayName,
        description: item.description,
        vendor: item.vendor,
        capabilitySummary: item.capabilityResolution
          ? [
              ...Object.entries(item.capabilityResolution).flatMap(([key, fact]) =>
                fact && typeof fact === 'object' && 'modelSupport' in fact
                  ? [`${key}: ${fact.modelSupport} · ${fact.resolutionSource} · ${fact.wireImplementation}`]
                  : [],
              ),
              ...(item.capabilityResolution.providerSpecific?.kind === 'gemini_image_generation'
                ? ['imageGeneration: supported · verified_contract · implemented']
                : []),
            ].join(' | ')
          : 'capability unknown',
        capabilityResolution: item.capabilityResolution,
        observation: item.observation,
        statusKind: 'ready' as const,
        statusLabel: item.status ?? 'available',
        sourceLabel: 'provider catalog',
        selectable: true,
        inputModalities: [...(item.inputModalities ?? [])],
        outputModalities: [...(item.outputModalities ?? [])],
      })),
    }
  }))

  async function refreshCatalogProvider(providerKey: string): Promise<void> {
    const current = catalogRuntimeSnapshot.value[providerKey] ?? catalogRuntimeStore.read(providerKey)
    if (current.syncState === 'syncing') return
    const token = catalogRuntimeStore.beginMutation(providerKey)
    try {
      const raw = await CatalogQueryService.sync({ sourceProviderKey: providerKey, timeoutMs: 30_000 })
      const result = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
      if (!result || result.ok !== true) {
        const failure = result?.providerFailure && typeof result.providerFailure === 'object'
          ? result.providerFailure as ProviderFailureV2
          : localCatalogFailure(providerKey, new Error(String(result?.message ?? result?.code ?? 'MODEL_CATALOG_SYNC_FAILED')))
        catalogRuntimeStore.acceptFailure({ token, failure })
        return
      }
      CatalogQueryService.invalidateProviderRuntimeCache(providerKey)
      await hydrateCatalogProvider(providerKey)
    } catch (error) {
      catalogRuntimeStore.acceptFailure({ token, failure: localCatalogFailure(providerKey, error) })
    }
  }

  const onRefreshOpenAIResponsesModels = () => refreshCatalogProvider(OPENAI_RESPONSES_PROVIDER_KEY)
  const onRefreshGoogleAIStudioModels = () => refreshCatalogProvider(GOOGLE_AI_STUDIO_PROVIDER_KEY)
  const onRefreshAnthropicModels = () => refreshCatalogProvider(ANTHROPIC_MESSAGES_PROVIDER_KEY)
  const onRefreshDeepSeekModels = () => refreshCatalogProvider(DEEPSEEK_OFFICIAL_PROVIDER_KEY)

  async function persistGenerationV2RoutePreference(
    conversationId: string,
    selection: ConversationRouteSelection | null,
  ): Promise<void> {
    if (!generationV2RoutePreferenceByConversationId.value.has(conversationId)) {
      await loadGenerationV2RoutePreference(conversationId)
    }
    const current = generationV2RoutePreferenceByConversationId.value.get(conversationId) ?? null
    if (selection === null) {
      if (current !== null) await clearGenerationV2ConversationRoutePreference(conversationId, current.revision)
      cacheGenerationV2RoutePreference(conversationId, null)
      return
    }
    cacheGenerationV2RoutePreference(conversationId,
      await updateGenerationV2ConversationRoutePreference({ conversationId,
        expectedRevision: current?.revision ?? 0, selection }))
  }

  async function updateActiveConvoSessionConfig(patch: ChatSessionConfigPatch): Promise<ChatSessionConfig | null> {
    const initialConvo = getActiveConvoRecord()
    if (!initialConvo) return null
    const conversationId = initialConvo.id
    return conversationConfigUpdateQueue.enqueue(conversationId, async () => {
      const convo = getActiveConvoRecord()
      if (!convo || convo.id !== conversationId) return null
      const current = getChatSessionConfigForConvo(convo)
      const nextConfig = mergeChatSessionConfig(current, patch)
      if (patch.routeSelection !== undefined) {
        await persistGenerationV2RoutePreference(convo.id, nextConfig.routeSelection)
      }
      const hasConfigPatch = patch.reasoning !== undefined || patch.webSearch !== undefined ||
        patch.imageGeneration !== undefined || patch.generationParams !== undefined
      if (!hasConfigPatch) return nextConfig
      const nextMeta = serializeChatSessionConfigToConvoMeta({
        baseMeta: convo.meta ?? null,
        config: nextConfig,
        convoProjectId: convo.projectId ?? null,
      })
      if (convo.id === systemTemplateSnapshot.value?.conversation.id) {
        await persistConvoMetaUpdate(convo, nextMeta)
      } else {
        const providerId: RuntimeProviderId | null = nextConfig.routeSelection?.kind === 'openai_chat_compatible'
          ? 'local_endpoint' : nextConfig.routeSelection?.providerId ?? null
        if (providerId) await persistCurrentGenerationV2SemanticLayer(providerId, convo.id, true, nextConfig)
      }
      updateLocalConvoMeta(convo.id, nextMeta)
      return nextConfig
    })
  }

  async function onUpdateReasoningEnabled(nextEnabled: boolean) {
    if (isDraftInteractionLocked.value) return
    const current = activeSessionConfig.value
    const isDeepSeek = current.routeSelection?.kind === 'provider_model' &&
      current.routeSelection.providerId === DEEPSEEK_OFFICIAL_PROVIDER_KEY
    await updateActiveConvoSessionConfig({
      reasoning: {
        enabled: nextEnabled,
        ...(isDeepSeek && nextEnabled && !isDeepSeekSelectableReasoningEffort(current.reasoning.effort)
          ? { effort: 'high' as const } : {}),
      },
    })
    hydrateSessionConfigUiFromActiveConvo()
  }

  async function onUpdateReasoningEffortLevel(nextEffort: ChatSessionConfig['reasoning']['effort']) {
    if (isDraftInteractionLocked.value) return
    const current = activeSessionConfig.value
    const isDeepSeek = current.routeSelection?.kind === 'provider_model' &&
      current.routeSelection.providerId === DEEPSEEK_OFFICIAL_PROVIDER_KEY
    if (isDeepSeek && !isDeepSeekSelectableReasoningEffort(nextEffort)) {
      throw new Error('GENERATION_V2_DEEPSEEK_REASONING_EFFORT_UNSUPPORTED')
    }
    await updateActiveConvoSessionConfig({
      reasoning: {
        enabled: true,
        effort: nextEffort,
      },
    })
    hydrateSessionConfigUiFromActiveConvo()
  }

  async function onUpdateWebSearchEnabled(nextEnabled: boolean) {
    if (isDraftInteractionLocked.value) return
    const current = activeSessionConfig.value.webSearch
    const detail = {
      ...(current.detail ?? {}),
      searchMode: nextEnabled ? 'enable' as const : 'disable' as const,
    }
    await updateActiveConvoSessionConfig({
      webSearch: {
        enabled: nextEnabled,
        level: current.level,
        detail,
      },
    })
  }

  async function onUpdateWebSearchLevel(nextLevel: 'low' | 'high') {
    if (isDraftInteractionLocked.value) return
    const current = activeSessionConfig.value.webSearch
    const detail = {
      ...(current.detail ?? {}),
      searchDepth: nextLevel,
    }
    if ('maxResults' in detail) delete detail.maxResults
    await updateActiveConvoSessionConfig({
      webSearch: {
        enabled: true,
        level: nextLevel,
        detail,
      },
    })
  }

  async function onUpdateImageGenerationEnabled(nextEnabled: boolean) {
    if (isDraftInteractionLocked.value) return
    const current = activeSessionConfig.value.imageGeneration
    await updateActiveConvoSessionConfig({
      imageGeneration: {
        enabled: nextEnabled,
        resolution: current.resolution,
        aspectRatio: current.aspectRatio,
        mode: 'custom',
        detail: current.detail,
      },
    })
    hydrateSessionConfigUiFromActiveConvo()
  }

  async function onUpdateImageGenerationResolution(nextResolution: '512' | '1K' | '2K' | '4K') {
    if (isDraftInteractionLocked.value) return
    const current = activeSessionConfig.value.imageGeneration
    await updateActiveConvoSessionConfig({
      imageGeneration: {
        enabled: true,
        resolution: nextResolution,
        aspectRatio: current.aspectRatio,
        mode: 'custom',
        detail: current.detail,
      },
    })
    hydrateSessionConfigUiFromActiveConvo()
  }

  async function onUpdateImageGenerationAspectRatio(nextAspectRatio: ChatSessionConfigAspectRatio) {
    if (isDraftInteractionLocked.value) return
    const current = activeSessionConfig.value.imageGeneration
    await updateActiveConvoSessionConfig({
      imageGeneration: {
        enabled: true,
        resolution: current.resolution,
        aspectRatio: nextAspectRatio,
        mode: 'custom',
        detail: current.detail,
      },
    })
    hydrateSessionConfigUiFromActiveConvo()
  }

  async function onUpdateReasoningDisplayMode(nextMode: 'inline' | 'rail') {
    if (isDraftInteractionLocked.value) return
    reasoningDisplayMode.value = nextMode
    await setChatReasoningDisplayMode(nextMode)
    if (nextMode === 'inline' && rightRailView.value === 'reasoning') {
      rightRailView.value = 'console'
      rightRailOpen.value = false
    }
  }

  async function onUpdateReasoningPanelDefaultExpanded(nextExpanded: boolean) {
    if (isDraftInteractionLocked.value) return
    const normalized = nextExpanded === true
    globalReasoningPanelDefaultExpanded.value = normalized
    await setChatReasoningPanelDefaultExpanded(normalized)
    try {
      window.dispatchEvent(new CustomEvent('settings:reasoningPanelDefaultExpandedUpdated', { detail: normalized }))
    } catch {
      // no-op
    }
  }

  async function onUpdateReasoningPanelAutoCollapseAfterReasoning(nextEnabled: boolean) {
    if (isDraftInteractionLocked.value) return
    const normalized = nextEnabled === true
    globalReasoningPanelAutoCollapseAfterReasoning.value = normalized
    await setChatReasoningPanelAutoCollapseAfterReasoning(normalized)
    try {
      window.dispatchEvent(new CustomEvent('settings:reasoningPanelAutoCollapseAfterReasoningUpdated', { detail: normalized }))
    } catch {
      // no-op
    }
  }

  function closeRightRailPanel() {
    rightRailOpen.value = false
  }

  function toggleConsolePanel() {
    if (rightRailOpen.value && effectiveRightRailView.value === 'console') {
      rightRailOpen.value = false
      return
    }
    rightRailView.value = 'console'
    rightRailOpen.value = true
  }

  function applySessionConfigToUi(config: ChatSessionConfig) {
    skipReasoningPrefSave.value = true
    const persistedConfig = activeConvoId.value
      ? generationV2ConfigByConversationId.value.get(activeConvoId.value) : undefined
    const semanticProjection = persistedConfig && !isEmptyGenerationV2SemanticLayer(persistedConfig.semanticLayer)
      ? projectGenerationV2SemanticLayerToSessionConfig(
          persistedConfig.semanticLayer,
          executionProviderId(config),
        ) : null
    requestedReasoningEffort.value = semanticProjection?.requestedReasoningEffort ??
      (config.reasoning.enabled ? config.reasoning.effort : 'auto')
    requestedReasoningExclude.value = semanticProjection?.requestedReasoningExclude ?? false
    if (semanticProjection?.anthropicThinkingDisplay) {
      applyAnthropicThinkingDisplayFromConversation(semanticProjection.anthropicThinkingDisplay)
    }
    imageGenerationConvoMode.value = config.imageGeneration.mode
    imageGenerationState.value = normalizeImageGenerationState({
      ...normalizeImageGenerationState(config.imageGeneration.detail),
      enabled: config.imageGeneration.enabled,
      imageSize: config.imageGeneration.resolution,
      aspectRatio: config.imageGeneration.aspectRatio,
    })
    setTimeout(() => {
      skipReasoningPrefSave.value = false
    }, 0)
  }

  function hydrateSessionConfigUiFromActiveConvo() {
    applySessionConfigToUi(activeSessionConfig.value)
  }

  function getActiveDraftScope(): Readonly<{ convoId: string }> | null {
    const convoId = String(activeConvoId.value ?? '').trim()
    if (!convoId) return null
    return { convoId }
  }

  function getDraftScopeKey(scope: Readonly<{ convoId: string }> | null): string | null {
    if (!scope) return null
    return scope.convoId
  }

  type FileSelectionGrant = Readonly<{
    filePath: string
    token: string
    expiresAtMs: number
  }>

  type SelectLocalFilesResult = Readonly<{
    filePaths: string[]
    fileGrants?: FileSelectionGrant[]
  }>

  type LocalFileIngestionTarget = Readonly<{
    filePath: string
    selectionGrantToken?: string
  }>

  function getElectronApi(): Readonly<{
    selectLocalFiles: (options?: { context?: 'file' | 'image'; allowMultiple?: boolean }) => Promise<SelectLocalFilesResult | null>
  }> | null {
    const api = (globalThis as any)?.electronAPI as
      | Readonly<{
        selectLocalFiles: (options?: { context?: 'file' | 'image'; allowMultiple?: boolean }) => Promise<SelectLocalFilesResult | null>
      }>
      | undefined
    return api && typeof api.selectLocalFiles === 'function' ? api : null
  }

  function selectedLocalFilesFromDialogResult(result: SelectLocalFilesResult | null | undefined): LocalFileIngestionTarget[] {
    const filePaths = Array.isArray(result?.filePaths) ? result.filePaths : []
    const grantsByPath = new Map(
      (Array.isArray(result?.fileGrants) ? result.fileGrants : [])
        .map((grant) => [String(grant.filePath ?? '').trim(), String(grant.token ?? '').trim()] as const)
        .filter(([filePath, token]) => filePath.length > 0 && token.length > 0)
    )
    return filePaths
      .map((filePath) => {
        const cleanedPath = String(filePath ?? '').trim()
        const token = grantsByPath.get(cleanedPath)
        return {
          filePath: cleanedPath,
          ...(token ? { selectionGrantToken: token } : {}),
        }
      })
      .filter((file) => file.filePath.length > 0)
  }

  function clearAttachmentFeedback() {
    if (attachmentFeedbackTimer.value) {
      clearTimeout(attachmentFeedbackTimer.value)
      attachmentFeedbackTimer.value = null
    }
    attachmentFeedbackTone.value = null
    attachmentFeedbackMessage.value = null
  }

  function setAttachmentFeedback(
    tone: 'info' | 'warning' | 'error' | 'success',
    message: string,
    timeoutMs = 3500,
  ) {
    clearAttachmentFeedback()
    attachmentFeedbackTone.value = tone
    attachmentFeedbackMessage.value = message
    attachmentFeedbackTimer.value = setTimeout(() => {
      clearAttachmentFeedback()
    }, timeoutMs)
  }

  function clearDraftSendPlanRefreshTimer() {
    if (draftSendPlanRefreshTimer.value) {
      clearTimeout(draftSendPlanRefreshTimer.value)
      draftSendPlanRefreshTimer.value = null
    }
  }

  function scheduleDraftSendPlanRefresh() {
    clearDraftSendPlanRefreshTimer()
    draftSendPlanRefreshTimer.value = setTimeout(() => {
      void refreshDraftAttachmentViewModels()
    }, 220)
  }

  function clearHistoryIncompatibleRefreshTimer() {
    if (historyIncompatibleRefreshTimer.value) {
      clearTimeout(historyIncompatibleRefreshTimer.value)
      historyIncompatibleRefreshTimer.value = null
    }
  }

  function scheduleHistoryIncompatibleRefresh() {
    clearHistoryIncompatibleRefreshTimer()
    historyIncompatibleRefreshTimer.value = setTimeout(() => {
      void refreshHistoryIncompatibleAttachments()
    }, 220)
  }

  function clearHistoryAttachmentRefreshTimer() {
    if (historyAttachmentRefreshTimer.value) {
      clearTimeout(historyAttachmentRefreshTimer.value)
      historyAttachmentRefreshTimer.value = null
    }
  }

  function resetHistoryAttachmentViewModels() {
    historyAttachmentViewModelsByMessageIdBase.value = {}
  }

  function scheduleHistoryAttachmentRefresh() {
    clearHistoryAttachmentRefreshTimer()
    historyAttachmentRefreshTimer.value = setTimeout(() => {
      void refreshHistoryAttachmentViewModels()
    }, 220)
  }

  function clearDraftAttachmentParsingPollTimer() {
    if (draftAttachmentParsingPollTimer.value) {
      clearTimeout(draftAttachmentParsingPollTimer.value)
      draftAttachmentParsingPollTimer.value = null
    }
  }

    function resetComposerSendPlanGateState() {
    composerSendPlanStatus.value = null
    composerSendPlanCanProceed.value = true
    composerSendPlanBlockingSummary.value = null
    composerSendPlanWarningSummary.value = null
    composerSendPlanIsPartialAllowed.value = false
  }

  function normalizeHistoryIncompatibleIndex(index: number, total: number): number {
    if (total <= 0) return 0
    const next = Number.isFinite(index) ? Math.trunc(index) : 0
    const mod = next % total
    return mod >= 0 ? mod : mod + total
  }

  function resetHistoryIncompatibleAttachmentSummary() {
    historyIncompatibleAttachmentItems.value = []
    historyIncompatibleAttachmentIndex.value = 0
    historyIncompatibleNavigationActive.value = false
    activeHistoryIncompatibleAttachmentId.value = null
  }

  function refreshHistoryIncompatibleAttachments() {
    ++historyIncompatibleRefreshSeq
    // V2 validates the selected turn bundles and attachments inside the provider-specific
    // command authority. The removed V1 send-plan IPC must not be used as a second,
    // potentially divergent compatibility authority in the renderer.
    resetHistoryIncompatibleAttachmentSummary()
  }

  async function refreshHistoryAttachmentViewModels() {
    const seq = ++historyAttachmentRefreshSeq
    const convoId = String(activeConvoId.value ?? '').trim()
    const branchId = String(activeBranchId.value ?? '').trim()
    const messagesById = state.value.entities?.messagesById ?? state.value.messages
    const visibleUserMessageIds = transcriptMessageIds.value.filter((messageId) => messagesById[messageId]?.role === 'user')

    if (!convoId || !branchId || visibleUserMessageIds.length === 0) {
      resetHistoryAttachmentViewModels()
      return
    }

    const v2Branch = generationV2BranchView.value
    if (v2Branch?.branchId === branchId && v2Branch.conversationId === convoId) {
      const visibleMessageIds = new Set(visibleUserMessageIds)
      const next: Record<string, MessageAttachmentVM[]> = {}
      for (const turn of v2Branch.turns) {
        if (!visibleMessageIds.has(turn.questionId)) continue
        const answer = turn.answers.find((item) => item.answerRootId === turn.chosenAnswerRootId)
        if (!answer) continue
        next[turn.questionId] = await Promise.all(answer.attachments.map(async (attachment) => {
          const managed = attachment.kind === 'managed_file'
          const isImage = managed && attachment.assetKind === 'image'
          let previewDataUrl: string | null = null
          if (isImage) {
            try {
              const preview = await readGenerationV2ComposerPreview({ assetId: attachment.assetId, assetRevisionId: attachment.assetRevisionId })
              previewDataUrl = preview.status === 'ready' ? preview.dataUrl : null
            } catch { previewDataUrl = null }
          }
          return Object.freeze({
            messageId: turn.questionId,
            attachmentId: managed ? attachment.assetRevisionId : attachment.referenceRevision,
            assetId: managed ? attachment.assetId : attachment.referenceId,
            filename: managed ? attachment.filename : t('chat.message.urlReference'),
            extension: managed ? normalizeExtension(attachment.filename) : null,
            mime: managed ? attachment.mime : null,
            assetKind: managed ? attachment.assetKind : 'url_reference',
            aiPayloadKind: managed ? attachment.sendAs : 'url_reference',
            sourceKind: managed ? attachment.sourceKind : 'url_reference',
            displayStatus: attachment.include ? 'ready' : 'excluded_from_current_context',
            borderTone: attachment.include ? 'green' : 'yellow',
            isHistoryIncompatible: false,
            incompatibilityReason: null,
            isActiveLocatedAttachment: false,
            previewDataUrl,
            iconKind: isImage ? 'image' : attachment.kind === 'url_reference' ? 'link' : 'file',
            createdAt: managed ? answer.createdAtMs : attachment.capturedAtMs,
          } satisfies MessageAttachmentVM)
        }))
      }
      if (seq === historyAttachmentRefreshSeq) historyAttachmentViewModelsByMessageIdBase.value = next
      return
    }

    // epoch-2 has no legacy message-attachment store. If the V2 branch projection is
    // not available yet, keep the UI empty until the branch refresh completes.
    resetHistoryAttachmentViewModels()
  }

  function openAttachmentUrlDialog(prefillUrl = '') {
    if (isDraftInteractionLocked.value) return
    attachmentUrlDraft.value = String(prefillUrl ?? '').trim()
    attachmentUrlRetentionMode.value = 'default'
    attachmentUrlDialogOpen.value = true
  }

  function closeAttachmentUrlDialog() {
    attachmentUrlDialogOpen.value = false
  }

  function resolveAttachmentRetentionMode(mode: 'default' | 'link_only' | 'link_and_file'): 'link_only' | 'link_and_file' {
    return mode === 'link_only' ? 'link_only' : 'link_and_file'
  }

  function isProbablyImageAttachment(file: Pick<File, 'name' | 'type'> & { path?: string | null }): boolean {
    const mime = String(file.type ?? '').trim().toLowerCase()
    if (mime.startsWith('image/')) return true
    const name = String(file.path ?? file.name ?? '')
    const ext = normalizeExtension(name)
    return ext ? ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext) : false
  }

  function getLocalFilePath(file: Pick<File, 'name' | 'type'> & { path?: string | null }): string {
    return String(file.path ?? '').trim()
  }

  function isImageAssetLike(asset: DecodedFileAsset | null | undefined, attachment: DecodedDraftAttachment): boolean {
    if (asset?.assetKind === 'image') return true
    if (attachment.aiPayloadKind === 'image') return true
    const extension = normalizeExtension(asset?.extension ?? asset?.filename ?? '')
    return extension ? ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(extension) : false
  }

  function normalizeDraftAttachmentDisplayStatus(
    plan: SendPlanAttachment | null | undefined,
    attachment: DecodedDraftAttachment,
    asset: DecodedFileAsset | null | undefined,
  ): DraftAttachmentDisplayStatus {
    if (plan?.displayStatus === 'parsing') return 'parsing'
    if (plan?.displayStatus === 'detection_pending') return 'detection_pending'
    if (plan?.displayStatus === 'detection_failed') return 'detection_failed'
    if (plan?.displayStatus === 'detection_required') return 'detection_required'
    if (plan?.displayStatus === 'incompatible_with_current_model') return 'incompatible_with_current_model'
    if (plan?.displayStatus === 'ready_with_warnings') return 'ready_with_warnings'
    if (plan?.displayStatus === 'unsupported') return 'unsupported'
    if (plan?.displayStatus === 'ready') {
      if (plan.eligibility === 'excluded') return 'ready_with_warnings'
      return 'ready'
    }
    if (plan?.displayStatus === 'failed') {
      if (attachment.processingStatus === 'unsupported' || asset?.assetKind === 'binary') return 'unsupported'
      return 'failed'
    }
    if (attachment.processingStatus === 'unsupported') return 'unsupported'
    if (attachment.processingStatus === 'local_only' || attachment.processingStatus === 'convertible') return 'ready_with_warnings'
    if (attachment.processingStatus === 'pending' || attachment.processingStatus === 'probing' || attachment.processingStatus === 'materializing') return 'parsing'
    return asset?.ingestStatus === 'failed' ? 'failed' : 'ready'
  }

  function mapDraftAttachmentBorderTone(status: DraftAttachmentDisplayStatus): DraftAttachmentBorderTone {
    if (status === 'ready') return 'green'
    if (status === 'ready_with_warnings') return 'yellow'
    if (status === 'parsing') return 'neutral'
    return 'red'
  }

  function getDraftAttachmentWarningReason(
    plan: SendPlanAttachment | null | undefined,
    status: DraftAttachmentDisplayStatus,
  ): string | null {
    if (status !== 'ready_with_warnings') return null
    if (plan?.notes?.length) return plan.notes[0] ?? null
    if (plan?.exclusionReason) return plan.exclusionReason
    return 'Attachment may be sent with warnings.'
  }

  function getDraftAttachmentBlockingReason(
    plan: SendPlanAttachment | null | undefined,
    status: DraftAttachmentDisplayStatus,
  ): string | null {
    if (status === 'ready' || status === 'ready_with_warnings') return null
    if (plan?.notes?.length) return plan.notes[0] ?? null
    if (plan?.exclusionReason) return plan.exclusionReason
    if (status === 'parsing') return 'Attachment is still parsing.'
    if (status === 'detection_pending') return 'File type detection is still running.'
    if (status === 'detection_required') return 'File type detection is required before sending.'
    if (status === 'detection_failed') return 'File type detection failed. Retry detection before sending.'
    if (status === 'incompatible_with_current_model') return 'Current model does not support this attachment.'
    if (status === 'unsupported') return 'This attachment type is unsupported.'
    return 'Attachment is not ready to send.'
  }

  function mapSendPlanFileTypeInfo(
    fileType: SendPlanAttachmentFileTypeSummary | null | undefined
  ): MessageAttachmentFileTypeInfo | null {
    if (!fileType) return null
    return {
      formatId: fileType.formatId,
      kind: fileType.kind,
      confidenceLevel: fileType.confidenceLevel,
      recommendedRoute: fileType.recommendedRoute ?? null,
      recommendedRouteLabelCode: fileType.recommendedRouteLabelCode ?? null,
      compatibility: fileType.compatibility,
      blocked: fileType.blocked,
      requiresJob: fileType.requiresJob,
      engineUnavailable: fileType.engineUnavailable,
      hasConflicts: fileType.hasConflicts,
      hasExtensionMimeConflict: fileType.hasExtensionMimeConflict,
      warningLabelCodes: [...fileType.warningLabelCodes],
      blockedLabelCodes: [...fileType.blockedLabelCodes],
      blockedBy: [...fileType.blockedBy],
    }
  }

  function mapSendPlanDetectionInfo(
    detection: SendPlanAttachmentDetectionSummary | null | undefined
  ): MessageAttachmentDetectionInfo | null {
    if (!detection) return null
    return {
      routeEligibility: detection.routeEligibility,
      detectionLevel: detection.detectionLevel ?? null,
      engineMode: detection.engineMode ?? null,
      usedMagika: detection.usedMagika,
      magikaState: detection.magikaState,
      evidenceSources: [...detection.evidenceSources],
      decisiveEvidenceSource: detection.decisiveEvidenceSource ?? null,
      detectionTrigger: detection.detectionTrigger ?? null,
      magikaModelVersion: detection.magikaModelVersion ?? null,
      advancedAttempted: detection.advancedAttempted,
      advancedFailureReason: detection.advancedFailureReason ?? null,
    }
  }

    function buildDraftAttachmentViewModel(
    attachment: DecodedDraftAttachment,
    asset: DecodedFileAsset | null,
    plan: SendPlanAttachment | null,
    previewDataUrl: string | null,
  ): DraftAttachmentViewModel {
    const status = normalizeDraftAttachmentDisplayStatus(plan, attachment, asset)
    const filename = asset?.filename?.trim().length ? asset.filename : attachment.assetId
    const extension = asset?.extension ?? normalizeExtension(filename)
    return {
      draftAttachmentId: attachment.id,
      assetId: attachment.assetId,
      filename,
      extension,
      assetKind: asset?.assetKind ?? attachment.aiPayloadKind,
      aiPayloadKind: attachment.aiPayloadKind,
      sourceKind: asset?.sourceKind ?? 'draft',
      displayStatus: status,
      borderTone: mapDraftAttachmentBorderTone(status),
      isParsing: status === 'parsing',
      warningReason: getDraftAttachmentWarningReason(plan, status),
      blockingReason: getDraftAttachmentBlockingReason(plan, status),
      fileTypeInfo: mapSendPlanFileTypeInfo(plan?.fileType),
      detectionInfo: mapSendPlanDetectionInfo(plan?.detection),
      previewDataUrl: previewDataUrl,
      canRemove: true,
    }
  }

  function readAssetSourceMeta(asset: DecodedFileAsset | null): Record<string, unknown> | null {
    if (!asset?.sourceMetaJson || typeof asset.sourceMetaJson !== 'object') return null
    return asset.sourceMetaJson as Record<string, unknown>
  }

  function readMetaString(meta: Record<string, unknown> | null, key: string): string | null {
    if (!meta) return null
    const value = meta[key]
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  }

  function readMetaNumber(meta: Record<string, unknown> | null, key: string): number | null {
    if (!meta) return null
    const value = meta[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  function mapHistoryAttachmentBorderTone(status: MessageAttachmentDisplayStatus): MessageAttachmentVM['borderTone'] {
    if (status === 'ready') return 'green'
    if (status === 'ready_with_warnings') return 'yellow'
    if (status === 'parsing') return 'neutral'
    return 'red'
  }

  function isUrlAttachment(asset: DecodedFileAsset | null, attachment: DecodedDraftAttachment): boolean {
    if (attachment.urlRetentionMode !== undefined && attachment.urlRetentionMode !== null) return true
    if (asset?.sourceKind === 'url_import') return true
    const meta = readAssetSourceMeta(asset)
    return !!(readMetaString(meta, 'originalUrl') || readMetaString(meta, 'resolvedUrl'))
  }

  function isStoredLocalCopy(asset: DecodedFileAsset | null): boolean {
    return !!asset &&
      asset.storageBackend === 'local_fs' &&
      asset.ingestStatus === 'stored' &&
      asset.deletedAt == null
  }

  function resolveEffectiveUrlRetentionMode(
    asset: DecodedFileAsset | null,
    attachment: DecodedDraftAttachment,
  ): 'link_only' | 'link_and_file' {
    const fromAttachment = attachment.urlRetentionMode ?? null
    if (fromAttachment === 'link_only' || fromAttachment === 'link_and_file') {
      return resolveAttachmentRetentionMode(fromAttachment)
    }
    const fromMeta = readMetaString(readAssetSourceMeta(asset), 'retentionMode')
    if (fromMeta === 'link_only' || fromMeta === 'link_and_file') {
      return resolveAttachmentRetentionMode(fromMeta)
    }
    return resolveAttachmentRetentionMode('default')
  }

  function getUrlSnapshotRetryUrl(asset: DecodedFileAsset | null): string | null {
    const meta = readAssetSourceMeta(asset)
    return readMetaString(meta, 'originalUrl') ?? readMetaString(meta, 'resolvedUrl')
  }

  function isUrlSnapshotRetryAvailable(
    asset: DecodedFileAsset | null,
    attachment: DecodedDraftAttachment,
  ): boolean {
    if (!isUrlAttachment(asset, attachment)) return false
    if (resolveEffectiveUrlRetentionMode(asset, attachment) !== 'link_and_file') return false
    if (isStoredLocalCopy(asset)) return false
    const materializationStatus = readMetaString(readAssetSourceMeta(asset), 'materializationStatus')
    if (materializationStatus === 'materializing') return false
    return getUrlSnapshotRetryUrl(asset) !== null
  }

  function resolveAttachmentSendModeLabel(value: DraftAttachmentSendModePreference): string {
    if (value === 'default') return t('sendPlan.sendMode.default')
    if (value === 'auto') return t('sendPlan.sendMode.auto')
    if (value === 'url_ref') return t('sendPlan.sendMode.urlRef')
    return t('sendPlan.sendMode.inlineBase64')
  }

  function resolveActualSendModeLabel(value: SendMode | null): string {
    if (value === 'url_ref') return t('sendPlan.sendMode.urlRef')
    if (value === 'inline_base64') return t('sendPlan.sendMode.inlineBase64')
    if (value === 'provider_file_ref') return t('sendPlan.sendMode.providerFileRef')
    return '—'
  }

  function resolveAttachmentUrlRetentionLabel(value: DraftAttachmentUrlRetentionPreference): string {
    if (value === 'default') return t('sendPlan.urlRetention.default')
    if (value === 'link_only') return t('sendPlan.urlRetention.linkOnly')
    return t('sendPlan.urlRetention.linkAndFile')
  }

  function getSendModeAvailabilityReason(
    mode: DraftAttachmentSendModePreference,
    attachment: DecodedDraftAttachment,
    asset: DecodedFileAsset | null,
    plan: SendPlanAttachment | null
  ): string | null {
    if (mode === 'default') return null
    if (mode === 'auto') {
      if (plan?.selectedSendMode || (plan?.fallbackSendModes?.length ?? 0) > 0) return null
      return plan?.notes?.[0] ?? t('sendPlan.noSendableRepresentation')
    }
    if (mode === 'url_ref') {
      if (attachment.aiPayloadKind === 'audio') return t('sendPlan.audioNoUrlRef')
      if (!isUrlAttachment(asset, attachment)) return t('sendPlan.noRetainableUrl')
      if (plan?.selectedSendMode === 'url_ref' || (plan?.fallbackSendModes?.includes('url_ref') ?? false)) return null
      if (plan?.exclusionReason) return plan.notes?.[0] ?? t('sendPlan.urlRefNotAllowed')
      return t('sendPlan.urlRefNotAllowed')
    }
    if (!isStoredLocalCopy(asset)) return t('sendPlan.noLocalCopy')
    if (plan?.selectedSendMode === 'inline_base64' || (plan?.fallbackSendModes?.includes('inline_base64') ?? false)) return null
    if (plan?.exclusionReason) return plan.notes?.[0] ?? t('sendPlan.fileCopyNotAllowed')
    return t('sendPlan.fileCopyNotAllowed')
  }

  function buildSendModeOptions(
    attachment: DecodedDraftAttachment,
    asset: DecodedFileAsset | null,
    plan: SendPlanAttachment | null
  ): DraftAttachmentSendModeOption[] {
    const options: DraftAttachmentSendModeOption[] = [
      {
        value: 'default',
        label: resolveAttachmentSendModeLabel('default'),
        disabled: false,
        reason: null,
      },
      {
        value: 'auto',
        label: resolveAttachmentSendModeLabel('auto'),
        disabled: false,
        reason: null,
      },
      {
        value: 'url_ref',
        label: resolveAttachmentSendModeLabel('url_ref'),
        disabled: false,
        reason: null,
      },
      {
        value: 'inline_base64',
        label: resolveAttachmentSendModeLabel('inline_base64'),
        disabled: false,
        reason: null,
      },
    ]

    return options.map((option) => {
      const reason = getSendModeAvailabilityReason(option.value, attachment, asset, plan)
      return {
        ...option,
        disabled: reason !== null,
        reason,
      }
    })
  }

  function buildUrlRetentionOptions(isUrl: boolean): DraftAttachmentUrlRetentionOption[] {
    return [
      {
        value: 'default',
        label: resolveAttachmentUrlRetentionLabel('default'),
        disabled: !isUrl,
        reason: isUrl ? null : t('sendPlan.urlOnlyRetention'),
      },
      {
        value: 'link_only',
        label: resolveAttachmentUrlRetentionLabel('link_only'),
        disabled: !isUrl,
        reason: isUrl ? null : t('sendPlan.urlOnlyRetention'),
      },
      {
        value: 'link_and_file',
        label: resolveAttachmentUrlRetentionLabel('link_and_file'),
        disabled: !isUrl,
        reason: isUrl ? null : t('sendPlan.urlOnlyRetention'),
      },
    ]
  }

  function formatDfcTargetKind(value: DfcTargetKind): string {
    if (value === 'original_file') return t('filePipeline.dfc.targetKind.originalFile')
    if (value === 'plain_text') return t('filePipeline.dfc.targetKind.plainText')
    if (value === 'markdown') return t('filePipeline.dfc.targetKind.markdown')
    if (value === 'code') return t('filePipeline.dfc.targetKind.code')
    if (value === 'table_markdown') return t('filePipeline.dfc.targetKind.tableMarkdown')
    return t('filePipeline.dfc.targetKind.pdfAttachment')
  }

  function formatDfcSendStrategy(value: DfcSendStrategy): string {
    return value === 'file_attachment'
      ? t('filePipeline.dfc.sendStrategy.fileAttachment')
      : t('filePipeline.dfc.sendStrategy.textInPrompt')
  }

  function formatDfcOptionStatus(value: string): string {
    if (value === 'ready') return t('filePipeline.dfc.optionStatus.ready')
    if (value === 'pending') return t('filePipeline.dfc.optionStatus.pending')
    if (value === 'candidate') return t('filePipeline.dfc.optionStatus.candidate')
    if (value === 'failed') return t('filePipeline.dfc.optionStatus.failed')
    if (value === 'stale') return t('filePipeline.dfc.optionStatus.stale')
    if (value === 'blocked') return t('filePipeline.dfc.optionStatus.blocked')
    return t('filePipeline.dfc.optionStatus.unknown')
  }

  function explainDfcTargetKind(value: DfcTargetKind): string {
    if (value === 'original_file') return t('filePipeline.dfc.targetExplanation.originalFile')
    if (value === 'plain_text') return t('filePipeline.dfc.targetExplanation.plainText')
    if (value === 'markdown') return t('filePipeline.dfc.targetExplanation.markdown')
    if (value === 'code') return t('filePipeline.dfc.targetExplanation.code')
    if (value === 'table_markdown') return t('filePipeline.dfc.targetExplanation.tableMarkdown')
    return t('filePipeline.dfc.targetExplanation.pdfAttachment')
  }

  function formatDfcRecommendationReason(value: string | null): string | null {
    if (value === 'backend_recommends_text_preview') return t('filePipeline.dfc.recommendationReason.textPreview')
    if (value === 'backend_recommends_layout_fidelity') return t('filePipeline.dfc.recommendationReason.layoutFidelity')
    if (value === 'backend_recommends_original_file_fallback') return t('filePipeline.dfc.recommendationReason.originalFileFallback')
    return value ? t('filePipeline.dfc.decisionReason.unknown') : null
  }

  function getDfcDefaultFileTypeKey(asset: DecodedFileAsset | null, filename: string | null | undefined): string | null {
    const extension = normalizeDfcDefaultFileTypeKey(asset?.extension ?? normalizeExtension(filename ?? ''))
    if (extension) return extension
    return normalizeDfcDefaultFileTypeKey(asset?.assetKind ?? null)
  }

  function buildDfcOptionDisabledReason(option: DfcDraftAttachmentOptionsDto['options'][number]): string | null {
    if (option.status === 'pending' || option.status === 'candidate' || option.compatibilityStatus === 'pending') return 'pending'
    if (option.status === 'failed') return 'failed'
    if (option.status === 'stale') return 'stale'
    if (option.status === 'blocked' || option.compatibilityStatus === 'blocked') return 'blocked'
    if (option.compatibilityStatus === 'incompatible') return 'incompatible'
    if (!option.isAvailable) return 'unavailable'
    return null
  }

  function buildDfcOptionsViewModel(assetId: string, asset: DecodedFileAsset | null): DraftAttachmentDfcOptionsViewModel {
    const dto = draftAttachmentDfcOptionsByAssetId.value[assetId] ?? null
    const loading = draftAttachmentDfcOptionsLoadingByAssetId.value[assetId] === true
    const error = draftAttachmentDfcOptionsErrorByAssetId.value[assetId] ?? null
    const fileTypeKey = getDfcDefaultFileTypeKey(asset, dto?.filename ?? asset?.filename ?? assetId)
    const fileTypeDefaultTargetKind = fileTypeKey ? dfcAttachmentDefaults.value.fileTypeTargetKinds[fileTypeKey] ?? null : null
    const globalDefaultTargetKind = dfcAttachmentDefaults.value.globalTargetKind
    if (!dto) {
      return {
        loading,
        error,
        dfcManaged: false,
        selectedOptionId: null,
        decisionStatus: null,
        decisionReasonCode: null,
        targetKind: null,
        sendStrategy: null,
        recommendedOptionId: null,
        recommendedReasonCode: null,
        fileTypeKey,
        fileTypeDefaultTargetKind,
        globalDefaultTargetKind,
        fileTypeDefaultOptionId: null,
        globalDefaultOptionId: null,
        options: [],
      }
    }
    const fileTypeDefaultOption = fileTypeDefaultTargetKind
      ? dto.options.find((option) => option.targetKind === fileTypeDefaultTargetKind && option.isAvailable) ?? null
      : null
    const globalDefaultOption = globalDefaultTargetKind
      ? dto.options.find((option) => option.targetKind === globalDefaultTargetKind && option.isAvailable) ?? null
      : null
    return {
      loading,
      error,
      dfcManaged: dto.dfcManaged,
      selectedOptionId: dto.selectedOptionId,
      decisionStatus: dto.decision.status,
      decisionReasonCode: dto.decision.reasonCode,
      targetKind: dto.decision.targetKind,
      sendStrategy: dto.decision.sendStrategy,
      recommendedOptionId: dto.recommendedOptionId,
      recommendedReasonCode: dto.recommendedReasonCode,
      fileTypeKey,
      fileTypeDefaultTargetKind,
      globalDefaultTargetKind,
      fileTypeDefaultOptionId: fileTypeDefaultOption?.optionId ?? null,
      globalDefaultOptionId: globalDefaultOption?.optionId ?? null,
      options: dto.options.map((option) => {
        const disabledReason = buildDfcOptionDisabledReason(option)
        const recommended = option.optionId === dto.recommendedOptionId
        return {
          optionId: option.optionId,
          targetKind: option.targetKind,
          sendStrategy: option.sendStrategy,
          status: option.status,
          compatibilityStatus: option.compatibilityStatus,
          isAvailable: option.isAvailable,
          selected: option.optionId === dto.decision.selectedOptionId && dto.decision.status === 'ready',
          disabled: disabledReason != null,
          disabledReason,
          label: formatDfcTargetKind(option.targetKind),
          detail: `${formatDfcSendStrategy(option.sendStrategy)} · ${formatDfcOptionStatus(option.status)}`,
          explanation: explainDfcTargetKind(option.targetKind),
          recommended,
          recommendationReason: recommended ? formatDfcRecommendationReason(dto.recommendedReasonCode) : null,
          matchesFileTypeDefault: option.optionId === fileTypeDefaultOption?.optionId,
          matchesGlobalDefault: option.optionId === globalDefaultOption?.optionId,
          diagnostics: option.diagnostics.map((item) => item.code),
          sendAssetRefs: option.sendAssetRefs,
        }
      }),
    }
  }

  function buildDfcPreviewViewModel(assetId: string): DraftAttachmentDfcPreviewViewModel {
    const dto = draftAttachmentDfcPreviewByAssetId.value[assetId] ?? null
    const loading = draftAttachmentDfcPreviewLoadingByAssetId.value[assetId] === true
    const error = draftAttachmentDfcPreviewErrorByAssetId.value[assetId] ?? null
    if (!dto) {
      return {
        loading,
        error,
        kind: 'none',
        status: null,
        targetKind: null,
        sendStrategy: null,
        text: null,
        characterCount: null,
        byteLength: null,
        truncated: false,
        maxCharacters: null,
        diagnostics: [],
      }
    }
    return {
      loading,
      error,
      kind: dto.preview.kind,
      status: dto.preview.status,
      targetKind: dto.targetKind,
      sendStrategy: dto.sendStrategy,
      text: dto.preview.text,
      characterCount: dto.preview.characterCount,
      byteLength: dto.preview.byteLength,
      truncated: dto.preview.truncated,
      maxCharacters: dto.preview.maxCharacters,
      diagnostics: dto.preview.diagnostics.map((item) => item.code),
    }
  }

  function buildDraftAttachmentDetailsViewModel(assetId: string | null): DraftAttachmentDetailsViewModel | null {
    const id = String(assetId ?? '').trim()
    if (!id) return null
    const attachment = draftAttachmentRecords.value.find((item) => item.assetId === id) ?? null
    if (!attachment) return null
    const asset = draftAttachmentAssetsById.value[id] ?? null
    const plan = draftAttachmentPlansByAssetId.value[id] ?? null
    const base = draftAttachmentViewModels.value.find((item) => item.assetId === id) ?? null
    if (!base) return null

    const meta = readAssetSourceMeta(asset)
    const urlInfo = isUrlAttachment(asset, attachment)
      ? {
          originalUrl: readMetaString(meta, 'originalUrl'),
          resolvedUrl: readMetaString(meta, 'resolvedUrl'),
          probeStatus: readMetaString(meta, 'probeStatus'),
          materializationStatus: readMetaString(meta, 'materializationStatus'),
          lastProbeAt: readMetaNumber(meta, 'lastProbeAt'),
          probeWarning: readMetaString(meta, 'probeWarning'),
          contentTypeFromProbe: readMetaString(meta, 'contentTypeFromProbe'),
          contentLengthFromProbe: readMetaString(meta, 'contentLengthFromProbe'),
          localCopyExists: isStoredLocalCopy(asset),
        }
      : null

    const currentSendMode = plan?.selectedSendMode ?? null
    const sendModeOptions = buildSendModeOptions(attachment, asset, plan)
    const urlRetentionOptions = buildUrlRetentionOptions(isUrlAttachment(asset, attachment))
    const retrySnapshotAvailable = isUrlSnapshotRetryAvailable(asset, attachment) && base.displayStatus !== 'parsing'
    const detectionRetryAvailable = base.displayStatus === 'detection_failed' || base.displayStatus === 'detection_required'
    const retryPreviewAvailable = detectionRetryAvailable || retrySnapshotAvailable ||
      (isImageAssetLike(asset, attachment) && base.previewDataUrl == null && base.displayStatus !== 'parsing')
    const retryPreviewReason = retryPreviewAvailable ? null : t('filePipeline.attachment.details.retryUnavailable')
    const retryPreviewLabel = detectionRetryAvailable ? 'Retry file detection' : retrySnapshotAvailable
      ? t('filePipeline.attachment.details.retrySnapshot')
      : t('filePipeline.attachment.details.retryPreview')
    return {
      ...base,
      mime: asset?.mime ?? null,
      createdAt: asset?.createdAt ?? attachment.createdAt,
      updatedAt: asset?.updatedAt ?? attachment.updatedAt,
      preferredSendMode: attachment.preferredSendMode ?? 'default',
      urlRetentionMode: attachment.urlRetentionMode ?? 'default',
      sendPlanStatus: draftAttachmentSendPlanStatus.value,
      currentSendMode,
      currentSendModeLabel: resolveActualSendModeLabel(currentSendMode),
      sendModeOptions,
      urlRetentionOptions,
      originalUrl: urlInfo?.originalUrl ?? null,
      resolvedUrl: urlInfo?.resolvedUrl ?? null,
      probeStatus: urlInfo?.probeStatus ?? null,
      materializationStatus: urlInfo?.materializationStatus ?? null,
      lastProbeAt: urlInfo?.lastProbeAt ?? null,
      probeWarning: urlInfo?.probeWarning ?? null,
      contentTypeFromProbe: urlInfo?.contentTypeFromProbe ?? null,
      contentLengthFromProbe: urlInfo?.contentLengthFromProbe ?? null,
      localCopyExists: urlInfo?.localCopyExists ?? false,
      retryPreviewAvailable,
      retryPreviewReason,
      retryPreviewLabel,
      dfcOptions: buildDfcOptionsViewModel(id, asset),
      dfcPreview: buildDfcPreviewViewModel(id),
    }
  }

  async function resolveDraftAttachmentPreview(
    attachment: DecodedDraftAttachment,
    asset: DecodedFileAsset | null,
    seq: number,
    _forceEnsure = false,
  ): Promise<DecodedPreviewPayload | null> {
    if (!isImageAssetLike(asset, attachment)) return null

    const cached = draftAttachmentPreviewCache.value[attachment.assetId]
    if (cached?.status === 'ready') return cached

    try {
      const preview = await readGenerationV2ComposerPreview({
        assetId: attachment.assetId,
        assetRevisionId: attachment.id,
      })
      const resolved: DecodedPreviewPayload = {
        assetId: attachment.assetId,
        status: preview.status === 'ready' ? 'ready' : 'missing',
        derivativeId: null,
        mime: preview.mime ?? null,
        dataUrl: preview.dataUrl ?? null,
        width: null,
        height: null,
        bytes: typeof preview.sizeBytes === 'number' ? preview.sizeBytes : null,
        reused: false,
        errorCode: null,
        errorMessage: null,
      }
      if (seq !== draftAttachmentRefreshSeq) return resolved
      draftAttachmentPreviewCache.value = {
        ...draftAttachmentPreviewCache.value,
        [attachment.assetId]: resolved,
      }
      return resolved
    } catch (error) {
      if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
        console.warn('[ui-app] RESOLVE_DRAFT_ATTACHMENT_PREVIEW_FAILED')
      }
      const failed: DecodedPreviewPayload = {
        assetId: attachment.assetId,
        status: 'failed',
        derivativeId: null,
        mime: null,
        dataUrl: null,
        width: null,
        height: null,
        bytes: null,
        reused: false,
        errorCode: 'preview_read_failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      }
      draftAttachmentPreviewCache.value = {
        ...draftAttachmentPreviewCache.value,
        [attachment.assetId]: failed,
      }
      return failed
    }
  }

  async function refreshDraftAttachmentViewModels(input?: Readonly<{
    restoredDraft?: DecodedConversationDraft | null
    syncDraftText?: boolean
  }>) {
    const scope = getActiveDraftScope()
    if (!scope) {
      clearDraftSendPlanRefreshTimer()
      clearDraftAttachmentParsingPollTimer()
      draftAttachmentViewModels.value = []
      draftAttachmentRecords.value = []
      draftAttachmentAssetsById.value = {}
      draftAttachmentPlansByAssetId.value = {}
      draftAttachmentDfcOptionsByAssetId.value = {}
      draftAttachmentDfcOptionsLoadingByAssetId.value = {}
      draftAttachmentDfcOptionsErrorByAssetId.value = {}
      draftAttachmentDfcPreviewByAssetId.value = {}
      draftAttachmentDfcPreviewLoadingByAssetId.value = {}
      draftAttachmentDfcPreviewErrorByAssetId.value = {}
      draftAttachmentSendPlanStatus.value = null
      selectedDraftAttachmentAssetId.value = null
      resetComposerSendPlanGateState()
      composerSendPlanLoading.value = false
      resetHistoryIncompatibleAttachmentSummary()
      return
    }

    const seq = ++draftAttachmentRefreshSeq
    const current = await getGenerationV2ComposerDraft(scope.convoId)
    if (seq !== draftAttachmentRefreshSeq) return
    generationV2ComposerDraft.value = current
    applyDraftPersistenceState({ draftMode: current.draftMode, editingSourceMessageId: current.editingSourceQuestionId })
    if (input?.syncDraftText === true) draft.value = current.draftText
    const records: DecodedDraftAttachment[] = current.attachments.map((attachment) => {
      const selectedAssetRefs: DfcSendAssetRef[] = attachment.kind === 'managed_file' && attachment.dfcSelection
        ? [{ kind: attachment.dfcSelection.targetKind === 'original_file' ? 'raw_file' : 'derived_asset', assetId: attachment.dfcSelection.effectiveAssetId }]
        : []
      return Object.freeze({
        id: attachment.kind === 'managed_file' ? attachment.assetRevisionId : attachment.referenceRevision,
        conversationId: current.conversationId,
        assetId: attachment.kind === 'managed_file' ? attachment.assetId : attachment.referenceId,
        attachmentOrder: attachment.attachmentOrder,
        aiPayloadKind: attachment.kind === 'managed_file' ? (attachment.assetKind === 'image' ? 'image' : 'file') :
          (attachment.mediaKind === 'image' ? 'image' : 'file'),
        processingStatus: attachment.kind === 'managed_file' && attachment.fileTypeDetection?.status === 'pending' ? 'probing'
          : attachment.kind === 'managed_file' && (!attachment.fileTypeDetection || attachment.fileTypeDetection.status === 'failed') ? 'failed' : 'ready',
        includeInNextRequest: attachment.include,
        excludedReason: attachment.include ? null : 'user_excluded',
        preferredSendMode: attachment.kind === 'managed_file' && attachment.sendAs === 'inline_text' ? 'inline_base64' : 'default',
        urlRetentionMode: attachment.kind === 'url_reference' ? 'link_only' : attachment.sourceKind === 'url_import' ? 'link_and_file' : null,
        dfcManaged: attachment.kind === 'managed_file',
        selectedOptionId: attachment.kind === 'managed_file' ? attachment.dfcSelection?.optionId ?? null : null,
        selectedAssetRefs,
        createdAt: attachment.kind === 'url_reference' ? attachment.capturedAtMs : current.updatedAtMs,
        updatedAt: current.updatedAtMs,
      })
    })
    const assets = Object.fromEntries(current.attachments.map((attachment) => [attachment.kind === 'managed_file' ? attachment.assetId : attachment.referenceId, Object.freeze({
      id: attachment.kind === 'managed_file' ? attachment.assetId : attachment.referenceId,
      filename: attachment.kind === 'managed_file' ? attachment.filename : (() => { try { return new URL(attachment.originalUrl).pathname.split('/').filter(Boolean).pop() || 'remote-url' } catch { return 'remote-url' } })(),
      extension: attachment.kind === 'managed_file' ? normalizeExtension(attachment.filename) : null,
      mime: attachment.kind === 'managed_file' ? attachment.mime : attachment.declaredMediaType,
      sizeBytes: attachment.kind === 'managed_file' ? attachment.sizeBytes : 0,
      assetKind: attachment.kind === 'managed_file' ? attachment.assetKind : (attachment.mediaKind === 'image' ? 'image' : 'document'),
      sourceKind: attachment.kind === 'managed_file' ? attachment.sourceKind : 'url_import',
      storageBackend: attachment.kind === 'managed_file' ? 'epoch2_managed_blob' : 'remote_url',
      ingestStatus: 'ready',
      previewStatus: 'missing',
      sourceMetaJson: attachment.kind === 'managed_file'
        ? (attachment.originalUrl === null ? null : { originalUrl: attachment.originalUrl, retentionMode: 'link_and_file' })
        : { originalUrl: attachment.originalUrl, retentionMode: 'link_only', urlDigest: attachment.urlDigest },
      createdAt: attachment.kind === 'url_reference' ? attachment.capturedAtMs : current.updatedAtMs,
      updatedAt: current.updatedAtMs,
      deletedAt: null,
    } satisfies DecodedFileAsset)]))
    draftAttachmentRecords.value = records
    draftAttachmentAssetsById.value = assets
    const detectionPlans = Object.fromEntries(current.attachments.filter((attachment):attachment is GenerationV2ComposerManagedFileAttachment=>
      attachment.kind==='managed_file').map((attachment)=>[attachment.assetId,buildFileTypeDetectionPlan(attachment)]))
    draftAttachmentPlansByAssetId.value = detectionPlans
    draftAttachmentSendPlanStatus.value = records.length > 0 ? 'sendable' : null
    const previewByRevision = new Map((await Promise.all(current.attachments.map(async (attachment) => {
      if (attachment.kind !== 'managed_file' || attachment.assetKind !== 'image') {
        return [attachment.kind === 'managed_file' ? attachment.assetRevisionId : attachment.referenceRevision, null] as const
      }
      try {
        const preview = await readGenerationV2ComposerPreview({ assetId: attachment.assetId,
          assetRevisionId: attachment.assetRevisionId })
        return [attachment.assetRevisionId, preview.dataUrl] as const
      } catch { return [attachment.assetRevisionId, null] as const }
    })) as readonly (readonly [string,string|null])[]))
    if (seq !== draftAttachmentRefreshSeq) return
    draftAttachmentViewModels.value = records.map((record) => buildDraftAttachmentViewModel(
      record, assets[record.assetId] ?? null, detectionPlans[record.assetId] ?? null, previewByRevision.get(record.id) ?? null,
    ))
    resetComposerSendPlanGateState()
    selectedDraftAttachmentAssetId.value = selectedDraftAttachmentAssetId.value &&
      records.some((record) => record.assetId === selectedDraftAttachmentAssetId.value)
      ? selectedDraftAttachmentAssetId.value : null
    composerSendPlanLoading.value = false
    resetHistoryIncompatibleAttachmentSummary()
    return
  }

  function buildFileTypeDetectionPlan(attachment:GenerationV2ComposerManagedFileAttachment):SendPlanAttachment {
    const detection=attachment.fileTypeDetection
    const status = !detection?'detection_required':detection.status==='pending'?'detection_pending':
      detection.status==='failed'?'detection_failed':detection.blocked?'failed':detection.warning||detection.warnings.length>0?'ready_with_warnings':'ready'
    const blocked=status==='detection_required'||status==='detection_pending'||status==='detection_failed'||detection?.blocked===true
    const preciseError=detection?.status==='failed'?[detection.errorCode,detection.errorDetail].filter(Boolean).join(': '):''
    const warningDetails=detection?.warnings.map((value)=>[value.code,value.detail].filter(Boolean).join(': '))??[]
    const notes=blocked
      ? [preciseError||detection?.blockingReasonCodes.join(', ')||status]
      : [...warningDetails,...(detection?.warningReasonCodes??[])]
    const magikaState:SendPlanAttachmentDetectionSummary['magikaState'] = detection?.magikaState==='not_installed'||detection?.magikaState==='disabled'||detection?.magikaState==='unavailable'||
      detection?.magikaState==='available'||detection?.magikaState==='failed'||detection?.magikaState==='not_requested'
      ? detection.magikaState:'not_requested'
    return Object.freeze({assetId:attachment.assetId,attachmentId:attachment.assetRevisionId,source:'draft',messageId:null,
      aiPayloadKind:attachment.assetKind==='image'?'image':'binary',semantic:{targetKind:'original_file' as const,sendStrategy:'file_attachment' as const,mappedFromLegacy:false},
      sendAssetRefs:[],selectedSendMode:null,fallbackSendModes:[],eligibility:blocked?'blocked':notes.length>0?'warning':'included',
      exclusionReason:blocked?(notes[0]??status):null,displayStatus:status,needsUserAttention:blocked||notes.length>0,notes,
      lineage:{state:'ok' as const,stale:false,staleReason:null,sourceHash:attachment.assetSha256,previewContentHash:null,sendContentHash:attachment.assetSha256,conversionSettingsHash:null},
      fileType:detection?.formatId&&detection.kind&&detection.confidence?{formatId:detection.formatId,kind:detection.kind,
        confidenceLevel:detection.confidence,recommendedRoute:null,recommendedRouteLabelCode:null,
        compatibility:detection.blocked?'blocked' as const:detection.warning?'warning' as const:'compatible' as const,blocked:detection.blocked,requiresJob:false,
        engineUnavailable:magikaState!=='available',hasConflicts:detection.blockingReasonCodes.some((code)=>code.includes('polyglot')),
        hasExtensionMimeConflict:[...detection.blockingReasonCodes,...detection.warningReasonCodes].some((code)=>code.includes('mismatch')),
        warningLabelCodes:[...detection.warningReasonCodes],blockedLabelCodes:[...detection.blockingReasonCodes],blockedBy:[...detection.blockingReasonCodes]}:null,
      detection:{routeEligibility:(!detection?'detection_required':detection.status==='pending'?'detection_pending':
        detection.status==='failed'?'detection_failed':'verdict_ready') as SendPlanAttachmentDetectionSummary['routeEligibility'],detectionLevel:detection?.status==='ready'?(magikaState==='available'?'advanced' as const:'basic' as const):null,
        engineMode:detection?.status==='ready'?(magikaState==='available'?'core_plus_magika' as const:'core_only' as const):null,usedMagika:magikaState==='available',
        magikaState,evidenceSources:[],decisiveEvidenceSource:null,detectionTrigger:'upload',magikaModelVersion:detection?.magikaModelVersion??null,
        advancedAttempted:magikaState==='available'||magikaState==='failed'||magikaState==='unavailable',advancedFailureReason:warningDetails[0]??null}})
  }

  async function onUpdateAnthropicThinkingDisplay(value: 'provider_default' | 'summarized' | 'omitted') {
    updateAnthropicThinkingDisplayPreference(value)
    await updateActiveConvoSessionConfig({})
  }

  async function ingestLocalFiles(
    filePaths: readonly (string | LocalFileIngestionTarget)[],
    options?: Readonly<{ mimeType?: string | null; sourceKind?: 'local_upload' | 'generated' }>,
  ) {
    void options
    const cleaned = filePaths
      .map((value) => {
        if (typeof value === 'string') return { filePath: value.trim() }
        return {
          filePath: String(value.filePath ?? '').trim(),
          ...(value.selectionGrantToken ? { selectionGrantToken: value.selectionGrantToken } : {}),
        }
      })
      .filter((value) => value.filePath.length > 0)
    if (cleaned.length === 0) return
    const convoId = await ensureActiveConvo()
    await flushDraftPersistence({ failOnError: true })

    let successCount = 0
    let failureCount = 0
    let lastSuccessLabel: string | null = null

    for (const file of cleaned) {
      try {
        if (!file.selectionGrantToken) throw new Error('GENERATION_V2_FILE_SELECTION_GRANT_INVALID')
        const current = generationV2ComposerDraft.value?.conversationId === convoId
          ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(convoId)
        const updated = await importGenerationV2ComposerLocalFile({ conversationId: convoId,
          expectedRevision: current.revision, filePath: file.filePath, selectionGrantToken: file.selectionGrantToken })
        generationV2ComposerDraft.value = updated
        successCount += 1
        lastSuccessLabel = normalizeExtension(file.filePath) ?? 'attachment'
      } catch {
        failureCount += 1
        if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
          console.warn('[ui-app] ingestLocalFiles failed for one file (non-fatal)')
        }
      }
    }

    if (successCount > 0) {
      void refreshDraftAttachmentViewModels()
      const label = successCount === 1 ? 'attachment' : 'attachments'
      setAttachmentFeedback('success', tf('errors.attachment.addedCount', { count: successCount, label }))
    } else if (failureCount > 0) {
      setAttachmentFeedback('error', t('errors.attachment.importFailed'))
    }
    if (successCount > 0 && lastSuccessLabel && shouldLogDebug()) {
      console.info('[ui-app] attachment import completed:', { successCount, failureCount, lastSuccessLabel })
    }
  }

  async function ingestUrlAttachment(url: string, retentionMode: 'default' | 'link_only' | 'link_and_file') {
    const trimmed = String(url ?? '').trim()
    if (!trimmed) {
      setAttachmentFeedback('error', t('errors.attachment.urlRequired'))
      return
    }
    try {
      const convoId = await ensureActiveConvo()
      const current = generationV2ComposerDraft.value?.conversationId === convoId
        ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(convoId)
      const resolvedRetention = resolveAttachmentRetentionMode(retentionMode)
      generationV2ComposerDraft.value = resolvedRetention === 'link_only'
        ? await addGenerationV2ComposerUrlReference({ conversationId: convoId, expectedRevision: current.revision, url: trimmed })
        : await importGenerationV2ComposerUrlFile({ conversationId: convoId, expectedRevision: current.revision, url: trimmed })
      void refreshDraftAttachmentViewModels()
      setAttachmentFeedback('success', t('errors.attachment.urlAdded'))
    } catch (error) {
      setAttachmentFeedback('error', error instanceof Error ? error.message : 'URL import failed.')
      if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
        console.warn('[ui-app] INGEST_URL_ATTACHMENT_FAILED')
      }
    }
  }

  function parseAttachmentUrlText(raw: string): string | null {
    const trimmed = String(raw ?? '').trim()
    if (!trimmed) return null
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
      if (parsed.username || parsed.password) return null
      return parsed.toString()
    } catch {
      return null
    }
  }

  async function flushDraftPersistence(options: Readonly<{ failOnError?: boolean }> = {}): Promise<void> {
    if (draftFlushPromise.value) await draftFlushPromise.value
    const scope = getActiveDraftScope()
    const text = draft.value
    if (!scope) return
    if (isAttachmentConfirmationActive.value) {
      draftPersistenceQueuedWhileAttachmentConfirmationActive.value = true
      if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
        console.warn('[ui-app] flushDraftPersistence deferred while attachment confirmation is active', {
          draftMode: draftPersistenceMode.value,
          draftLength: text.length,
          draftAttachmentCount: draftAttachmentRecords.value.length,
          hasEditingSourceMessageId: String(draftPersistenceEditingSourceMessageId.value ?? '').trim().length > 0,
        })
      }
      if (options.failOnError) throw new Error('draft_persistence_deferred_during_attachment_confirmation')
      return
    }
    if (draftSaveTimer.value) {
      clearTimeout(draftSaveTimer.value)
      draftSaveTimer.value = null
    }
    draftFlushPromise.value = (async () => {
      try {
        const current = generationV2ComposerDraft.value?.conversationId === scope.convoId
          ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(scope.convoId)
        const updated = await updateGenerationV2ComposerText({ conversationId: scope.convoId,
          expectedRevision: current.revision, draftText: text, draftMode: draftPersistenceMode.value,
          editingSourceQuestionId: draftPersistenceEditingSourceMessageId.value })
        generationV2ComposerDraft.value = updated
        applyDraftPersistenceState({ draftMode: updated.draftMode, editingSourceMessageId: updated.editingSourceQuestionId })
      } catch (err) {
        if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
          console.warn('[ui-app] flushDraftPersistence failed (non-fatal):', {
            err,
            draftMode: draftPersistenceMode.value,
            draftLength: text.length,
            draftAttachmentCount: draftAttachmentRecords.value.length,
            hasEditingSourceMessageId: String(draftPersistenceEditingSourceMessageId.value ?? '').trim().length > 0,
          })
        }
        if (options.failOnError) throw err
      }
    })()
    try {
      await draftFlushPromise.value
    } finally {
      draftFlushPromise.value = null
    }
  }

  function scheduleDraftPersistence() {
    if (isAttachmentConfirmationActive.value) {
      draftPersistenceQueuedWhileAttachmentConfirmationActive.value = true
      if (draftSaveTimer.value) {
        clearTimeout(draftSaveTimer.value)
        draftSaveTimer.value = null
      }
      return
    }
    if (draftSaveTimer.value) clearTimeout(draftSaveTimer.value)
    draftSaveTimer.value = setTimeout(() => {
      void flushDraftPersistence()
    }, 250)
  }

  async function restoreDraftForActiveScope() {
    const scope = getActiveDraftScope()
    if (!scope) {
      lastDraftScopeKey.value = null
      generationV2ComposerDraft.value = null
      draft.value = ''
      applyDraftPersistenceState({ draftMode: 'compose', editingSourceMessageId: null })
      editRestoredDraftAttachmentAssetIds.value = new Set()
      draftAttachmentViewModels.value = []
      resetHistoryIncompatibleAttachmentSummary()
      return
    }
    lastDraftScopeKey.value = getDraftScopeKey(scope)
    try {
      const restored = await getGenerationV2ComposerDraft(scope.convoId)
      generationV2ComposerDraft.value = restored
      applyDraftPersistenceState({ draftMode: restored.draftMode, editingSourceMessageId: restored.editingSourceQuestionId })
      draft.value = restored.draftText
      editRestoredDraftAttachmentAssetIds.value = restored.draftMode === 'edit'
        ? new Set(restored.attachments.map((attachment) =>
            attachment.kind === 'managed_file' ? attachment.assetId : attachment.referenceId))
        : new Set()
      await refreshDraftAttachmentViewModels()
      scheduleHistoryIncompatibleRefresh()
    } catch (err) {
      if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
        console.warn('[ui-app] RESTORE_DRAFT_FOR_ACTIVE_SCOPE_FAILED')
      }
      draft.value = ''
      applyDraftPersistenceState({ draftMode: 'compose', editingSourceMessageId: null })
      editRestoredDraftAttachmentAssetIds.value = new Set()
      draftAttachmentViewModels.value = []
      resetHistoryIncompatibleAttachmentSummary()
    }
  }

  async function onAttachFilesRequested() {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    const api = getElectronApi()
    if (!api) {
      setAttachmentFeedback('error', t('errors.attachment.filePickerUnavailable'))
      return
    }
    const result = await api.selectLocalFiles({ context: 'file', allowMultiple: true })
    const files = selectedLocalFilesFromDialogResult(result)
    if (files.length === 0) return
    await ingestLocalFiles(files, { sourceKind: 'local_upload' })
  }

  async function onAttachImagesRequested() {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    if (composerImageInputSupported.value === false) {
      setAttachmentFeedback('error', composerImageInputSupportReason.value ?? t('errors.attachment.modelNoImageSupport'))
      return
    }
    const api = getElectronApi()
    if (!api) {
      setAttachmentFeedback('error', t('errors.attachment.filePickerUnavailable'))
      return
    }
    const result = await api.selectLocalFiles({ context: 'image', allowMultiple: true })
    const files = selectedLocalFilesFromDialogResult(result)
    if (files.length === 0) return
    await ingestLocalFiles(files, { sourceKind: 'local_upload' })
  }

  function onAttachUrlRequested(prefillUrl?: string | null) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    openAttachmentUrlDialog(prefillUrl ?? '')
  }

  async function submitAttachmentUrl() {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    const url = attachmentUrlDraft.value.trim()
    if (!url) {
      setAttachmentFeedback('error', t('errors.attachment.urlRequired'))
      return
    }
    const retentionMode = attachmentUrlRetentionMode.value
    attachmentUrlDialogOpen.value = false
    await ingestUrlAttachment(url, retentionMode)
  }

  async function handleRemoveDraftAttachment(assetId: string) {
    if (isDraftInteractionLocked.value) return
    const convoId = String(activeConvoId.value ?? '').trim()
    if (!convoId || !assetId) return
    try {
      const current = generationV2ComposerDraft.value?.conversationId === convoId
        ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(convoId)
      const target = current.attachments.find((attachment) =>
        (attachment.kind === 'managed_file' ? attachment.assetId : attachment.referenceId) === assetId)
      if (!target) { setAttachmentFeedback('warning', t('errors.attachment.alreadyRemoved')); return }
      generationV2ComposerDraft.value = await removeGenerationV2ComposerAttachment({ conversationId: convoId,
        expectedRevision: current.revision, assetRevisionId: target.kind === 'managed_file' ? target.assetRevisionId : target.referenceRevision })
      await refreshDraftAttachmentViewModels()
      setAttachmentFeedback('success', t('errors.attachment.removedFromDraft'))
    } catch (error) {
      setAttachmentFeedback('error', error instanceof Error ? error.message : t('errors.attachment.removeFailed'))
    }
  }

  function openDraftAttachmentDetails(assetId: string) {
    const id = String(assetId ?? '').trim()
    if (!id) return
    selectedDraftAttachmentAssetId.value = id
    void refreshDraftAttachmentDfcOptions(id)
    void refreshDraftAttachmentDfcPreview(id)
  }

  function closeDraftAttachmentDetails() {
    selectedDraftAttachmentAssetId.value = null
  }

  async function refreshDraftAttachmentDfcOptions(assetId: string) {
    const id = String(assetId ?? '').trim()
    const scope = getActiveDraftScope()
    if (!id || !scope) return
    const seq = ++draftAttachmentDfcOptionsSeq
    draftAttachmentDfcOptionsLoadingByAssetId.value = {
      ...draftAttachmentDfcOptionsLoadingByAssetId.value,
      [id]: true,
    }
    draftAttachmentDfcOptionsErrorByAssetId.value = {
      ...draftAttachmentDfcOptionsErrorByAssetId.value,
      [id]: null,
    }
    try {
      const input = {
        conversationId: scope.convoId,
        assetId: id,
        providerId: executionProviderId() ?? 'unset',
        operation: executionProviderId() === 'openai_responses' ? 'responses' as const
          : activeSessionConfig.value.imageGeneration.enabled ? 'images' as const : 'chat_completions' as const,
      }
      const dto = await getGenerationV2ComposerDfcOptions(input)
      if (seq !== draftAttachmentDfcOptionsSeq) return
      draftAttachmentDfcOptionsByAssetId.value = {
        ...draftAttachmentDfcOptionsByAssetId.value,
        [id]: dto,
      }
    } catch (error) {
      if (seq !== draftAttachmentDfcOptionsSeq) return
      draftAttachmentDfcOptionsErrorByAssetId.value = {
        ...draftAttachmentDfcOptionsErrorByAssetId.value,
        [id]: error instanceof Error ? error.message : t('filePipeline.dfc.feedback.loadOptionsFailed'),
      }
    } finally {
      if (seq === draftAttachmentDfcOptionsSeq) {
        draftAttachmentDfcOptionsLoadingByAssetId.value = {
          ...draftAttachmentDfcOptionsLoadingByAssetId.value,
          [id]: false,
        }
      }
    }
  }

  async function refreshDraftAttachmentDfcPreview(assetId: string) {
    const id = String(assetId ?? '').trim()
    const scope = getActiveDraftScope()
    if (!id || !scope) return
    const seq = ++draftAttachmentDfcPreviewSeq
    draftAttachmentDfcPreviewLoadingByAssetId.value = {
      ...draftAttachmentDfcPreviewLoadingByAssetId.value,
      [id]: true,
    }
    draftAttachmentDfcPreviewErrorByAssetId.value = {
      ...draftAttachmentDfcPreviewErrorByAssetId.value,
      [id]: null,
    }
    try {
      const dto = await getGenerationV2ComposerDfcPreview({
        conversationId: scope.convoId,
        assetId: id,
        maxCharacters: 2048,
      })
      if (seq !== draftAttachmentDfcPreviewSeq) return
      draftAttachmentDfcPreviewByAssetId.value = {
        ...draftAttachmentDfcPreviewByAssetId.value,
        [id]: dto,
      }
    } catch (error) {
      if (seq !== draftAttachmentDfcPreviewSeq) return
      draftAttachmentDfcPreviewErrorByAssetId.value = {
        ...draftAttachmentDfcPreviewErrorByAssetId.value,
        [id]: t('filePipeline.dfc.feedback.loadPreviewFailed'),
      }
    } finally {
      if (seq === draftAttachmentDfcPreviewSeq) {
        draftAttachmentDfcPreviewLoadingByAssetId.value = {
          ...draftAttachmentDfcPreviewLoadingByAssetId.value,
          [id]: false,
        }
      }
    }
  }

  async function updateSelectedDraftAttachmentSettings(input: Readonly<{
    preferredSendMode?: DraftAttachmentSendModePreference | null
    urlRetentionMode?: DraftAttachmentUrlRetentionPreference | null
    dfcManaged?: boolean
    selectedOptionId?: string | null
    selectedAssetRefs?: readonly DfcSendAssetRef[]
  }>) {
    if (isDraftInteractionLocked.value) return
    const convoId = String(activeConvoId.value ?? '').trim()
    const assetId = String(selectedDraftAttachmentAssetId.value ?? '').trim()
    if (!convoId || !assetId) return
    try {
      const current = generationV2ComposerDraft.value?.conversationId === convoId
        ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(convoId)
      const attachment = current.attachments.find((item) =>
        (item.kind === 'managed_file' ? item.assetId : item.referenceId) === assetId)
      if (attachment) {
        if (input.dfcManaged !== undefined || input.selectedOptionId !== undefined || input.selectedAssetRefs !== undefined) {
          if (input.dfcManaged !== true || typeof input.selectedOptionId !== 'string' || input.selectedAssetRefs === undefined) {
            throw new Error('GENERATION_V2_ATTACHMENT_SETTING_INVALID')
          }
          generationV2ComposerDraft.value = await selectGenerationV2ComposerDfcOption({
            conversationId: convoId, expectedRevision: current.revision, assetId, optionId: input.selectedOptionId,
            providerId: executionProviderId() ?? 'unset',
            operation: executionProviderId() === 'openai_responses' ? 'responses' as const
              : activeSessionConfig.value.imageGeneration.enabled ? 'images' as const : 'chat_completions' as const,
          })
          await refreshDraftAttachmentViewModels()
          selectedDraftAttachmentAssetId.value = assetId
          return
        }
        if (input.preferredSendMode !== undefined) {
          throw new Error('GENERATION_V2_ATTACHMENT_SEND_MODE_NOT_SUPPORTED')
        }
        if (input.urlRetentionMode !== undefined && input.urlRetentionMode !== null) {
          const wanted = resolveAttachmentRetentionMode(input.urlRetentionMode)
          const currentMode = attachment.kind === 'url_reference' ? 'link_only' : attachment.sourceKind === 'url_import' ? 'link_and_file' : null
          if (currentMode === wanted) return
          const originalUrl = attachment.originalUrl
          if (!originalUrl) throw new Error('GENERATION_V2_URL_PROVENANCE_UNAVAILABLE')
          const updated = wanted === 'link_only'
            ? await addGenerationV2ComposerUrlReference({ conversationId: convoId, expectedRevision: current.revision, url: originalUrl })
            : await importGenerationV2ComposerUrlFile({ conversationId: convoId, expectedRevision: current.revision, url: originalUrl })
          const oldRevision = attachment.kind === 'managed_file' ? attachment.assetRevisionId : attachment.referenceRevision
          generationV2ComposerDraft.value = await removeGenerationV2ComposerAttachment({ conversationId: convoId,
            expectedRevision: updated.revision, assetRevisionId: oldRevision })
          await refreshDraftAttachmentViewModels()
          selectedDraftAttachmentAssetId.value = assetId
          return
        }
        return
      }
      throw new Error('GENERATION_V2_DRAFT_ATTACHMENT_NOT_FOUND')
    } catch (error) {
      setAttachmentFeedback('error', error instanceof Error ? error.message : t('errors.attachment.updateFailed'))
    }
  }

  async function updateSelectedDraftAttachmentSendMode(preferredSendMode: DraftAttachmentSendModePreference) {
    await updateSelectedDraftAttachmentSettings({ preferredSendMode })
  }

  async function updateSelectedDraftAttachmentUrlRetentionMode(urlRetentionMode: DraftAttachmentUrlRetentionPreference) {
    await updateSelectedDraftAttachmentSettings({ urlRetentionMode })
  }

  async function updateSelectedDraftAttachmentDfcOption(optionId: string) {
    const assetId = String(selectedDraftAttachmentAssetId.value ?? '').trim()
    if (!assetId) return
    const dto = draftAttachmentDfcOptionsByAssetId.value[assetId] ?? null
    const option = dto?.options.find((item) => item.optionId === optionId) ?? null
    if (!option) {
      setAttachmentFeedback('error', t('filePipeline.dfc.feedback.optionUnavailable'))
      void refreshDraftAttachmentDfcOptions(assetId)
      return
    }
    const disabledReason = buildDfcOptionDisabledReason(option)
    if (disabledReason) {
      setAttachmentFeedback('warning', tf('filePipeline.dfc.feedback.optionDisabled', { reason: t(`filePipeline.dfc.disabledReason.${disabledReason}`) }))
      return
    }
    await updateSelectedDraftAttachmentSettings({
      dfcManaged: true,
      selectedOptionId: option.optionId,
      selectedAssetRefs: option.sendAssetRefs,
    })
    void refreshDraftAttachmentDfcOptions(assetId)
    void refreshDraftAttachmentDfcPreview(assetId)
  }

  async function saveSelectedDraftAttachmentDfcDefault(input: Readonly<{
    scope: 'file_type' | 'global'
    targetKind: DfcTargetKind
  }>) {
    const assetId = String(selectedDraftAttachmentAssetId.value ?? '').trim()
    const details = buildDraftAttachmentDetailsViewModel(assetId)
    const fileTypeKey = details?.dfcOptions.fileTypeKey ?? null
    if (input.scope === 'file_type' && !fileTypeKey) {
      setAttachmentFeedback('warning', t('filePipeline.dfc.feedback.fileTypeDefaultUnavailable'))
      return
    }
    const next = setDfcAttachmentDefaultTarget(dfcAttachmentDefaults.value, {
      scope: input.scope,
      targetKind: input.targetKind,
      fileTypeKey,
    })
    const saved = await setDfcAttachmentDefaults(next)
    if (!saved) {
      setAttachmentFeedback('error', t('filePipeline.dfc.feedback.saveDefaultFailed'))
      return
    }
    dfcAttachmentDefaults.value = next
    setAttachmentFeedback('success', input.scope === 'file_type' ? t('filePipeline.dfc.feedback.fileTypeDefaultSaved') : t('filePipeline.dfc.feedback.globalDefaultSaved'))
  }

  async function clearSelectedDraftAttachmentDfcDefault(scope: 'file_type' | 'global') {
    const assetId = String(selectedDraftAttachmentAssetId.value ?? '').trim()
    const details = buildDraftAttachmentDetailsViewModel(assetId)
    const fileTypeKey = details?.dfcOptions.fileTypeKey ?? null
    if (scope === 'file_type' && !fileTypeKey) {
      setAttachmentFeedback('warning', t('filePipeline.dfc.feedback.fileTypeDefaultUnavailable'))
      return
    }
    const next = clearDfcAttachmentDefaultTarget(dfcAttachmentDefaults.value, {
      scope,
      fileTypeKey,
    })
    const saved = await setDfcAttachmentDefaults(next)
    if (!saved) {
      setAttachmentFeedback('error', t('filePipeline.dfc.feedback.clearDefaultFailed'))
      return
    }
    dfcAttachmentDefaults.value = next
    setAttachmentFeedback('success', scope === 'file_type' ? t('filePipeline.dfc.feedback.fileTypeDefaultCleared') : t('filePipeline.dfc.feedback.globalDefaultCleared'))
  }

  async function retrySelectedDraftAttachmentPreview() {
    const assetId = String(selectedDraftAttachmentAssetId.value ?? '').trim()
    if (!assetId) return
    const attachment = draftAttachmentRecords.value.find((item) => item.assetId === assetId) ?? null
    const asset = draftAttachmentAssetsById.value[assetId] ?? null
    const composerAttachment=generationV2ComposerDraft.value?.attachments.find((item)=>item.kind==='managed_file'&&item.assetId===assetId)
    if(composerAttachment?.kind==='managed_file'&&(!composerAttachment.fileTypeDetection||composerAttachment.fileTypeDetection.status==='failed')){
      const conversationId=generationV2ComposerDraft.value?.conversationId
      if(!conversationId)return
      generationV2ComposerDraft.value=await retryGenerationV2ComposerFileTypeDetection({conversationId,assetRevisionId:composerAttachment.assetRevisionId})
      await refreshDraftAttachmentViewModels()
      selectedDraftAttachmentAssetId.value=assetId
      return
    }
    if (attachment && isUrlSnapshotRetryAvailable(asset, attachment)) {
      await retrySelectedDraftAttachmentUrlSnapshot(assetId, attachment, asset)
      return
    }
    if (!attachment || !asset || !isImageAssetLike(asset, attachment)) {
      setAttachmentFeedback('warning', t('errors.attachment.previewRetryImageOnly'))
      return
    }
    const seq = ++draftAttachmentRefreshSeq
    const preview = await resolveDraftAttachmentPreview(attachment, asset, seq, true)
    if (preview?.status === 'ready') {
      setAttachmentFeedback('success', t('errors.attachment.previewRefreshed'))
    } else {
      setAttachmentFeedback('warning', t('errors.attachment.previewRetryNoReady'))
    }
    await refreshDraftAttachmentViewModels()
    selectedDraftAttachmentAssetId.value = assetId
  }

  async function retrySelectedDraftAttachmentUrlSnapshot(
    previousAssetId: string,
    attachment: DecodedDraftAttachment,
    asset: DecodedFileAsset | null,
  ) {
    const retryUrl = getUrlSnapshotRetryUrl(asset)
    if (!retryUrl) {
      setAttachmentFeedback('warning', t('filePipeline.attachment.details.retrySnapshotUnavailable'))
      return
    }
    const convoId = String(activeConvoId.value ?? attachment.conversationId ?? '').trim()
    if (!convoId) {
      setAttachmentFeedback('warning', t('errors.attachment.draftLocked'))
      return
    }
    try {
      const current = generationV2ComposerDraft.value?.conversationId === convoId
        ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(convoId)
      const replacement = await importGenerationV2ComposerUrlFile({ conversationId: convoId,
        expectedRevision: current.revision, url: retryUrl })
      const previous = current.attachments.find((item) =>
        (item.kind === 'managed_file' ? item.assetId : item.referenceId) === previousAssetId)
      if (!previous) throw new Error('GENERATION_V2_DRAFT_ATTACHMENT_NOT_FOUND')
      generationV2ComposerDraft.value = await removeGenerationV2ComposerAttachment({ conversationId: convoId,
        expectedRevision: replacement.revision,
        assetRevisionId: previous.kind === 'managed_file' ? previous.assetRevisionId : previous.referenceRevision })
      await refreshDraftAttachmentViewModels()
      const replacementAsset = replacement.attachments.find((item) => item.kind === 'managed_file' && item.sourceKind === 'url_import')
      selectedDraftAttachmentAssetId.value = replacementAsset?.kind === 'managed_file' ? replacementAsset.assetId : null
      setAttachmentFeedback('success', t('filePipeline.attachment.details.retrySnapshotReady'))
    } catch {
      setAttachmentFeedback('warning', t('filePipeline.attachment.details.retrySnapshotStillBlocked'))
    }
  }

  async function handleDropFiles(event: DragEvent) {
    if (isDraftInteractionLocked.value) {
      event.preventDefault()
      setAttachmentFeedback('warning', t('errors.attachment.draftLocked'))
      return
    }
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length === 0) return
    event.preventDefault()
    if (isRunning.value) {
      setAttachmentFeedback('warning', t('errors.attachment.disabledWhileRunning'))
      return
    }
    const imageFiles = files.filter((file) => isProbablyImageAttachment(file))
    if (composerImageInputSupported.value === false && imageFiles.length > 0) {
      setAttachmentFeedback('error', composerImageInputSupportReason.value ?? t('errors.attachment.modelNoImageSupport'))
      const allowedFiles = files.filter((file) => !isProbablyImageAttachment(file))
      if (allowedFiles.length === 0) return
      const allowedPaths = allowedFiles.map((file) => getLocalFilePath(file)).filter((value) => value.length > 0)
      if (allowedPaths.length === 0) return
      await ingestLocalFiles(allowedPaths, { sourceKind: 'local_upload' })
      return
    }

    event.preventDefault()
    const paths = files.map((file) => getLocalFilePath(file)).filter((value) => value.length > 0)
    if (paths.length === 0) {
      setAttachmentFeedback('error', t('errors.attachment.droppedNotAccessible'))
      return
    }
    await ingestLocalFiles(paths, { sourceKind: 'local_upload' })
  }

  async function handlePasteAttachment(event: ClipboardEvent) {
    if (isDraftInteractionLocked.value) {
      event.preventDefault()
      setAttachmentFeedback('warning', t('errors.attachment.draftLocked'))
      return
    }
    const clipboard = event.clipboardData
    if (!clipboard) return

    const files = Array.from(clipboard.files ?? [])
    if (files.length > 0) {
      event.preventDefault()
      if (isRunning.value) {
        setAttachmentFeedback('warning', t('errors.attachment.disabledWhileRunning'))
        return
      }
      const imageFiles = files.filter((file) => isProbablyImageAttachment(file))
      if (composerImageInputSupported.value === false && imageFiles.length > 0) {
        setAttachmentFeedback('error', composerImageInputSupportReason.value ?? t('errors.attachment.modelNoImageSupport'))
        const allowedFiles = files.filter((file) => !isProbablyImageAttachment(file))
        const allowedPaths = allowedFiles.map((file) => getLocalFilePath(file)).filter((value) => value.length > 0)
        if (allowedPaths.length > 0) {
          await ingestLocalFiles(allowedPaths, { sourceKind: 'local_upload' })
        }
        return
      }

      event.preventDefault()
      const paths = files.map((file) => getLocalFilePath(file)).filter((value) => value.length > 0)
      if (paths.length === 0) {
        setAttachmentFeedback('error', t('errors.attachment.pastedNotAccessible'))
        return
      }
      await ingestLocalFiles(paths, { sourceKind: 'local_upload' })
      return
    }

    const pastedText = String(clipboard.getData('text/plain') || clipboard.getData('text/uri-list') || '').trim()
    const attachmentUrl = parseAttachmentUrlText(pastedText)
    if (isRunning.value) {
      if (attachmentUrl || files.length > 0) {
        event.preventDefault()
        setAttachmentFeedback('warning', t('errors.attachment.disabledWhileRunning'))
      }
      return
    }
    if (!attachmentUrl) return
    openAttachmentUrlDialog(attachmentUrl)
    event.preventDefault()
  }

  const ACCOUNT_DEFAULT_WEB_SEARCH_ENABLED = false
    type SearchModeSource = 'conversation' | 'project' | 'global' | 'account'

  function resolveModeSource(
    convoLayer: SearchSettingsLayer | null | undefined,
    projectLayer: SearchSettingsLayer | null | undefined,
    globalLayer: SearchSettingsLayer | null | undefined
  ): SearchModeSource {
    const convoMode = convoLayer?.searchMode ?? 'default'
    if (convoMode !== 'default') return 'conversation'
    const projectMode = projectLayer?.searchMode ?? 'default'
    if (projectMode !== 'default') return 'project'
    const globalMode = globalLayer?.searchMode ?? 'default'
    if (globalMode !== 'default') return 'global'
    return 'account'
  }

  function formatSearchModeSource(source: SearchModeSource): string {
    if (source === 'conversation') return 'session'
    if (source === 'project') return 'project'
    if (source === 'global') return 'global'
    return 'account'
  }

    function getProjectByIdLocal(projectId: string | null | undefined): ProjectSummary | null {
    const id = String(projectId ?? '').trim()
    if (!id) return null
    return projects.value.find((p) => p.id === id) ?? null
  }

  function getConvoGenerationParamsLayer(convo: ConvoSummary | null): GenerationParamsLayer | null {
    return normalizeGenerationParamsLayer(extractConvoGenerationParamsOverride(convo?.meta ?? null))
  }

  function getProjectGenerationParamsLayerForConvo(convo: ConvoSummary | null): GenerationParamsLayer | null {
    const project = getProjectByIdLocal(convo?.projectId)
    return normalizeGenerationParamsLayer(extractProjectGenerationParamsDefaults(project?.meta ?? null))
  }

  function getActiveConvoGenerationParamsLayer(): GenerationParamsLayer | null {
    return getConvoGenerationParamsLayer(getActiveConvoRecord())
  }

  function getActiveProjectGenerationParamsLayer(): GenerationParamsLayer | null {
    return getProjectGenerationParamsLayerForConvo(getActiveConvoRecord())
  }

  function getConvoWebSearchLayer(convo: ConvoSummary | null): SearchSettingsLayer | null {
    return normalizeSearchSettingsLayer(extractConvoWebSearchOverride(convo?.meta ?? null))
  }

  function getProjectWebSearchLayerForConvo(convo: ConvoSummary | null): SearchSettingsLayer | null {
    const project = getProjectByIdLocal(convo?.projectId)
    return normalizeSearchSettingsLayer(extractProjectWebSearchDefaults(project?.meta ?? null))
  }

  function getActiveConvoWebSearchLayer(): SearchSettingsLayer | null {
    return getConvoWebSearchLayer(getActiveConvoRecord())
  }

  function getActiveProjectWebSearchLayer(): SearchSettingsLayer | null {
    return getProjectWebSearchLayerForConvo(getActiveConvoRecord())
  }

  const activeSessionWebSearchLayer = computed<SearchSettingsLayer | null>(() =>
    activeSessionConfig.value.webSearch.detail
  )

  function generationParamProfileForProvider(
    providerId: RuntimeProviderId | null | undefined,
    modelId?: string | null,
  ): ProviderGenerationParamProfile {
    if (!providerId) return unsetGenerationProfile
    const requestKind = providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && isKnownGeminiImageGenerationModel(modelId)
      ? 'image_generation'
      : 'text'
    return getDefaultGenerationParamProfile(providerId, { requestKind }) ?? unsetGenerationProfile
  }

  function geminiThinkingCapabilityForModel(modelId: string | null | undefined): GeminiThinkingCapability {
    const normalized = normalizeGeminiThinkingModelId(modelId)
    const state = catalogRuntimeSnapshot.value[GOOGLE_AI_STUDIO_PROVIDER_KEY] ??
      catalogRuntimeStore.read(GOOGLE_AI_STUDIO_PROVIDER_KEY)
    const model = state.items.find((candidate) => normalizeGeminiThinkingModelId(candidate.modelId) === normalized)
    const raw = model?.observation?.rawProviderRecord ?? null
    const thinkingOwnProperty = Boolean(raw && Object.prototype.hasOwnProperty.call(raw, 'thinking'))
    const supportedGenerationMethods = raw && Array.isArray(raw.supportedGenerationMethods)
      ? raw.supportedGenerationMethods.filter((value): value is string => typeof value === 'string') : undefined
    return resolveGeminiThinkingCapability({
      model: normalized,
      thinking: thinkingOwnProperty ? raw?.thinking : undefined,
      thinkingOwnProperty,
      supportedGenerationMethods,
    })
  }

  const activeSessionGenerationParamsLayer = computed<GenerationParamsLayer | null>(() =>
    activeSessionConfig.value.generationParams.detail
  )

  const activeSessionGenerationParamsProfile = computed(() =>
    generationParamProfileForProvider(
      executionProviderId(),
      routeModelId(),
    )
  )

  const activeSessionGenerationParamsModelId = computed(() =>
    routeModelId() || DEFAULT_OPENROUTER_MODEL_ID
  )

  const activeSessionGenerationParamsResolved = computed<ResolvedGenerationParams>(() =>
    resolveGenerationParamsFromLayers({
      profile: activeSessionGenerationParamsProfile.value,
      modelId: activeSessionGenerationParamsModelId.value,
      geminiThinkingCapability: executionProviderId() === GOOGLE_AI_STUDIO_PROVIDER_KEY &&
        !isKnownGeminiImageGenerationModel(activeSessionGenerationParamsModelId.value)
        ? geminiThinkingCapabilityForModel(activeSessionGenerationParamsModelId.value) : undefined,
      layers: {
        conversation: getActiveConvoGenerationParamsLayer(),
        project: getActiveProjectGenerationParamsLayer(),
        global: globalGenerationParamsDefaults.value,
      },
    })
  )

  const activeSessionWebSearchResolved = computed(() =>
    resolveSearchSettings(
      {
        convo: getActiveConvoWebSearchLayer(),
        project: getActiveProjectWebSearchLayer(),
        global: globalWebSearchDefaults.value,
      },
      { accountDefaultEnabled: ACCOUNT_DEFAULT_WEB_SEARCH_ENABLED }
    )
  )

  const activeSessionWebSearchSource = computed(() =>
    resolveModeSource(
      getActiveConvoWebSearchLayer(),
      getActiveProjectWebSearchLayer(),
      globalWebSearchDefaults.value
    )
  )

  const sessionWebSearchToolbarLabel = computed(() => {
    const status = activeSessionWebSearchResolved.value.effectiveMode ? 'On' : 'Off'
    const source = formatSearchModeSource(activeSessionWebSearchSource.value)
    return `Web: ${status} (${source})`
  })

  const sessionWebSearchDraftResolved = computed(() =>
    resolveSearchSettings(
      {
        convo: sessionWebSearchDraft.value,
        project: getActiveProjectWebSearchLayer(),
        global: globalWebSearchDefaults.value,
      },
      { accountDefaultEnabled: ACCOUNT_DEFAULT_WEB_SEARCH_ENABLED }
    )
  )

  const sessionGenerationParamsDraftResolved = computed<ResolvedGenerationParams>(() =>
    resolveGenerationParamsFromLayers({
      profile: activeSessionGenerationParamsProfile.value,
      modelId: activeSessionGenerationParamsModelId.value,
      geminiThinkingCapability: executionProviderId() === GOOGLE_AI_STUDIO_PROVIDER_KEY &&
        !isKnownGeminiImageGenerationModel(activeSessionGenerationParamsModelId.value)
        ? geminiThinkingCapabilityForModel(activeSessionGenerationParamsModelId.value) : undefined,
      layers: {
        conversation: sessionGenerationParamsDraft.value,
        project: getActiveProjectGenerationParamsLayer(),
        global: globalGenerationParamsDefaults.value,
      },
    })
  )

  const projectGenerationParamsResolved = computed<ResolvedGenerationParams>(() =>
    resolveGenerationParamsFromLayers({
      profile: activeSessionGenerationParamsProfile.value,
      modelId: activeSessionGenerationParamsModelId.value,
      geminiThinkingCapability: executionProviderId() === GOOGLE_AI_STUDIO_PROVIDER_KEY &&
        !isKnownGeminiImageGenerationModel(activeSessionGenerationParamsModelId.value)
        ? geminiThinkingCapabilityForModel(activeSessionGenerationParamsModelId.value) : undefined,
      layers: {
        project: projectGenerationParamsDraft.value,
        global: globalGenerationParamsDefaults.value,
      },
    })
  )

  const sessionWebSearchDraftHint = computed(() => {
    const mode = sessionWebSearchDraft.value?.searchMode ?? 'default'
    if (mode !== 'default') return 'Session mode is explicit and overrides project/global.'
    const source = resolveModeSource(
      sessionWebSearchDraft.value,
      getActiveProjectWebSearchLayer(),
      globalWebSearchDefaults.value
    )
    return `Session mode=default, currently inherited from ${formatSearchModeSource(source)}.`
  })

  const projectWebSearchResolved = computed(() =>
    resolveSearchSettings(
      {
        project: projectWebSearchDraft.value,
        global: globalWebSearchDefaults.value,
      },
      { accountDefaultEnabled: ACCOUNT_DEFAULT_WEB_SEARCH_ENABLED }
    )
  )

  const projectWebSearchDraftHint = computed(() => {
    const mode = projectWebSearchDraft.value?.searchMode ?? 'default'
    if (mode !== 'default') return 'Project mode is explicit and overrides global defaults.'
    const source = resolveModeSource(null, projectWebSearchDraft.value, globalWebSearchDefaults.value)
    return `Project mode=default, currently inherited from ${formatSearchModeSource(source)}.`
  })

  const projectWebSearchSettingsTarget = computed(() =>
    projectWebSearchSettingsProjectId.value
      ? getProjectByIdLocal(projectWebSearchSettingsProjectId.value)
      : null
  )

  async function refreshGlobalWebSearchDefaults(): Promise<SearchSettingsLayer | null> {
    try {
      globalWebSearchDefaults.value = normalizeSearchSettingsLayer(await getWebSearchDefaults())
      return globalWebSearchDefaults.value
    } catch (err) {
      globalWebSearchDefaults.value = null
      if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
        console.warn('[ui-app] REFRESH_GLOBAL_WEB_SEARCH_DEFAULTS_FAILED')
      }
      return null
    }
  }

  function handleGlobalWebSearchDefaultsUpdated(event: Event) {
    globalWebSearchDefaults.value = normalizeSearchSettingsLayer((event as CustomEvent).detail)
  }

  async function refreshGlobalGenerationParamsDefaults(): Promise<GenerationParamsLayer | null> {
    try {
      globalGenerationParamsDefaults.value = normalizeGenerationParamsLayer(await getGenerationParamsDefaults())
      return globalGenerationParamsDefaults.value
    } catch (err) {
      globalGenerationParamsDefaults.value = null
      if (shouldLogDebug()) {
        console.warn('[ui-app] REFRESH_GLOBAL_GENERATION_PARAMS_DEFAULTS_FAILED')
      }
      return null
    }
  }

  function handleGlobalGenerationParamsDefaultsUpdated(event: Event) {
    globalGenerationParamsDefaults.value = normalizeGenerationParamsLayer((event as CustomEvent).detail)
  }

  function openSessionWebSearchSettings() {
    if (isRunning.value) return
    if (!activeConvoId.value) return
    sessionWebSearchSettingsStatus.value = null
    sessionWebSearchDraft.value = getActiveConvoWebSearchLayer()
    sessionGenerationParamsDraft.value = getActiveConvoGenerationParamsLayer()
    sessionWebSearchSettingsOpen.value = true
  }

  function closeSessionWebSearchSettings() {
    sessionWebSearchSettingsOpen.value = false
    sessionWebSearchSettingsStatus.value = null
    sessionGenerationParamsDraft.value = null
  }

  function onOpenProjectWebSearchSettings(projectId: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    const project = getProjectByIdLocal(projectId)
    if (!project) return
    projectWebSearchSettingsStatus.value = null
    projectWebSearchSettingsProjectId.value = project.id
    projectWebSearchDraft.value = normalizeSearchSettingsLayer(extractProjectWebSearchDefaults(project.meta ?? null))
    projectGenerationParamsDraft.value = normalizeGenerationParamsLayer(extractProjectGenerationParamsDefaults(project.meta ?? null))
    projectWebSearchSettingsOpen.value = true
  }

  function closeProjectWebSearchSettings() {
    projectWebSearchSettingsOpen.value = false
    projectWebSearchSettingsProjectId.value = null
    projectWebSearchDraft.value = null
    projectGenerationParamsDraft.value = null
    projectWebSearchSettingsStatus.value = null
  }

  async function persistActiveConvoWebSearchOverride(nextLayer: SearchSettingsLayer | null) {
    const normalizedNext = normalizeSearchSettingsLayer(nextLayer)
    await updateActiveConvoSessionConfig({
      webSearch: {
        detail: normalizedNext,
        enabled: normalizedNext?.searchMode === 'disable' ? false : true,
        level: normalizedNext?.searchDepth === 'low' ? 'low' : 'high',
      },
    })
  }

  async function persistActiveConvoGenerationParamsOverride(nextLayer: GenerationParamsLayer | null) {
    const normalizedNext = normalizeGenerationParamsLayer(nextLayer)
    await updateActiveConvoSessionConfig({
      generationParams: {
        detail: normalizedNext,
      },
    })
  }

  async function onComposerUpdateWebSearchLayer(nextLayer: SearchSettingsLayer | null) {
    if (isRunning.value || sessionWebSearchQuickSaving.value) return
    if (isDraftInteractionLocked.value) return
    sessionWebSearchQuickSaving.value = true
    try {
      await persistActiveConvoWebSearchOverride(nextLayer)
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    } finally {
      sessionWebSearchQuickSaving.value = false
    }
  }

  async function onComposerUpdateGenerationParamsLayer(nextLayer: GenerationParamsLayer | null) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    if (sessionGenerationParamsQuickSaving.value) {
      sessionGenerationParamsPendingLayer = normalizeGenerationParamsLayer(nextLayer)
      return
    }
    sessionGenerationParamsQuickSaving.value = true
    try {
      let layerToSave = normalizeGenerationParamsLayer(nextLayer)
      while (true) {
        await persistActiveConvoGenerationParamsOverride(layerToSave)
        if (sessionGenerationParamsPendingLayer === undefined) break
        layerToSave = sessionGenerationParamsPendingLayer
        sessionGenerationParamsPendingLayer = undefined
      }
    } catch (err: any) {
      sessionGenerationParamsPendingLayer = undefined
      loadError.value = err?.message ? String(err.message) : String(err)
    } finally {
      sessionGenerationParamsQuickSaving.value = false
    }
  }

  function onComposerOpenWebSearchSettings() {
    if (isDraftInteractionLocked.value) return
    openSessionWebSearchSettings()
  }

  async function saveSessionWebSearchSettings() {
    if (isDraftInteractionLocked.value) return
    if (!getActiveConvoRecord() || sessionWebSearchSettingsSaving.value) return
    sessionWebSearchSettingsSaving.value = true
    sessionWebSearchSettingsStatus.value = null
    try {
      await persistActiveConvoWebSearchOverride(sessionWebSearchDraft.value)
      await persistActiveConvoGenerationParamsOverride(sessionGenerationParamsDraft.value)
      sessionWebSearchSettingsStatus.value = 'Saved.'
    } catch (err: any) {
      sessionWebSearchSettingsStatus.value = err?.message ? String(err.message) : String(err)
    } finally {
      sessionWebSearchSettingsSaving.value = false
    }
  }

  async function saveProjectWebSearchSettings() {
    if (isDraftInteractionLocked.value) return
    const project = projectWebSearchSettingsTarget.value
    if (!project || projectWebSearchSettingsSaving.value) return
    projectWebSearchSettingsSaving.value = true
    projectWebSearchSettingsStatus.value = null
    try {
      const nextLayer = normalizeSearchSettingsLayer(projectWebSearchDraft.value)
      const nextMeta = mergeProjectWebSearchDefaultsMeta(project.meta ?? null, nextLayer)
      const nextGenerationParamsLayer = normalizeGenerationParamsLayer(projectGenerationParamsDraft.value)
      const nextMetaWithGenerationParams = mergeProjectGenerationParamsDefaultsMeta(nextMeta, nextGenerationParamsLayer)
      await saveProject({
        id: project.id,
        name: project.name,
        meta: nextMetaWithGenerationParams,
      })
      projects.value = projects.value.map((p) => (p.id === project.id ? { ...p, meta: nextMetaWithGenerationParams } : p))
      projectWebSearchSettingsStatus.value = 'Saved.'
    } catch (err: any) {
      projectWebSearchSettingsStatus.value = err?.message ? String(err.message) : String(err)
    } finally {
      projectWebSearchSettingsSaving.value = false
    }
  }

                function normalizeModelKey(value: unknown): string {
    const normalized = String(value ?? '').trim()
    return normalized.length > 0 ? normalized : DEFAULT_OPENROUTER_MODEL_ID
  }

  function normalizeRuntimeModelId(value: unknown): string {
    return String(value ?? '').trim()
  }

              function normalizeImageGenerationState(value: unknown): ImageGenerationUiState {
    return normalizeImageGenerationUserConfig(value)
  }

  function mapImageModelFilterReason(reason: ImageModelFilterReason): string {
    if (reason === 'missing_image_output') return 'selected model output_modalities does not include image.'
    if (reason === 'missing_text_input') return 'selected model cannot take text input for text-to-image.'
    if (reason === 'inactive_status') return 'selected model is not active.'
    if (reason === 'hidden_visibility') return 'selected model is hidden.'
    if (reason === 'expired_model') return 'selected model is expired.'
    return 'selected model endpoint is unavailable.'
  }

  const imageGenerationSupported = computed(() => selectedModelImageCapabilityClass.value !== null)

  const imageGenerationSupportHint = computed(() => {
    if (selectedModelImageCapabilityLoading.value) return 'checking model image capability...'
    if (selectedModelImageCapabilityClass.value === 'text_and_image') {
      return 'selected model supports text+image output.'
    }
    if (selectedModelImageCapabilityClass.value === 'image_only') {
      return 'selected model supports image-only output.'
    }
    return selectedModelImageCapabilityReason.value ?? 'selected model is not image-capable.'
  })

  async function refreshSelectedModelImageCapability() {
    const seq = ++imageCapabilityQuerySeq.value
    const currentSessionConfig = getActiveSessionConfigSnapshot()
    const selectedProvider = providerModelRoute(currentSessionConfig)?.providerId ?? null
    const modelId = selectedProvider === OPENROUTER_PROVIDER_ID
      ? normalizeModelKey(routeModelId(currentSessionConfig))
      : DEFAULT_OPENROUTER_MODEL_ID
    selectedModelImageCapabilityLoading.value = true

    if (selectedProvider !== OPENROUTER_PROVIDER_ID || modelId === DEFAULT_OPENROUTER_MODEL_ID) {
      selectedModelImageCapabilityClass.value = null
      selectedModelImageCapabilityReason.value = selectedProvider === OPENROUTER_PROVIDER_ID
        ? 'select a concrete model to enable image generation.'
        : 'OpenRouter catalog image generation checks are unavailable for the selected provider.'
      composerImageInputSupported.value = null
      composerImageInputSupportReason.value = null
      selectedModelImageCapabilityLoading.value = false
      return
    }

    try {
      const modalities = openRouterModelModalitiesById.value.get(modelId) ?? null
      if (seq !== imageCapabilityQuerySeq.value) return
      if (!modalities) {
        selectedModelImageCapabilityClass.value = null
        selectedModelImageCapabilityReason.value = 'model detail unavailable for image capability detection.'
        composerImageInputSupported.value = null
        composerImageInputSupportReason.value = null
        return
      }
      composerImageInputSupported.value = modalities.input.includes('image')
      composerImageInputSupportReason.value = composerImageInputSupported.value
        ? null
        : 'Current model does not support image inputs.'
      const eligibility = evaluateImageGenerationModel({
        modelId,
        inputModalities: modalities.input,
        outputModalities: modalities.output,
        status: 'active',
        visibility: 'visible',
      })
      if (eligibility.eligible && eligibility.capabilityClass) {
        selectedModelImageCapabilityClass.value = eligibility.capabilityClass
        selectedModelImageCapabilityReason.value = null
        return
      }
      selectedModelImageCapabilityClass.value = null
      selectedModelImageCapabilityReason.value =
        eligibility.reasons.length > 0
          ? mapImageModelFilterReason(eligibility.reasons[0]!)
          : 'selected model cannot be used for image generation.'
    } catch (err) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] REFRESH_SELECTED_MODEL_IMAGE_CAPABILITY_FAILED')
      }
      if (seq !== imageCapabilityQuerySeq.value) return
      selectedModelImageCapabilityClass.value = null
      selectedModelImageCapabilityReason.value = 'failed to detect image capability.'
      composerImageInputSupported.value = null
      composerImageInputSupportReason.value = null
    } finally {
      if (seq === imageCapabilityQuerySeq.value) {
        selectedModelImageCapabilityLoading.value = false
      }
    }
  }

  const activeRouteIdentity = computed(() => {
    const route = activeSessionConfig.value.routeSelection
    if (!route) return ''
    return route.kind === 'provider_model'
      ? `${route.kind}\0${route.providerId}\0${route.modelId}`
      : `${route.kind}\0${route.selection.providerInstanceId}\0${route.selection.modelId}\0${route.selection.endpointRevisionId}`
  })
  watch(activeRouteIdentity, (next, previous) => {
    openRouterImageEndpointSelection.value = null
    openRouterImageEndpointSelectionError.value = null
    void refreshSelectedModelImageCapability()
    if (previous !== undefined && next !== previous && draftAttachmentRecords.value.length > 0) {
      scheduleDraftSendPlanRefresh()
    }
    scheduleHistoryIncompatibleRefresh()
    scheduleHistoryAttachmentRefresh()
  }, { immediate: true })

  const imageGenerationFollowDefault = computed(() => imageGenerationConvoMode.value === 'default')

  async function refreshGlobalImageGenerationDefault(): Promise<ImageGenerationUserConfig> {
    try {
      const value = await getImageGenerationDefault()
      globalImageGenerationDefault.value = normalizeImageGenerationState(value)
    } catch (err) {
      globalImageGenerationDefault.value = DEFAULT_IMAGE_GENERATION_USER_CONFIG
      if (shouldLogDebug()) {
        console.warn('[ui-app] REFRESH_GLOBAL_IMAGE_GENERATION_DEFAULT_FAILED')
      }
    }
    return globalImageGenerationDefault.value
  }

  async function refreshDfcAttachmentDefaults(): Promise<DfcAttachmentDefaults> {
    try {
      dfcAttachmentDefaults.value = await getDfcAttachmentDefaults()
    } catch (err) {
      dfcAttachmentDefaults.value = normalizeDfcAttachmentDefaults(null)
      if (shouldLogDebug()) {
        console.warn('[ui-app] REFRESH_DFC_ATTACHMENT_DEFAULTS_FAILED')
      }
    }
    return dfcAttachmentDefaults.value
  }

  function handleGlobalImageGenerationDefaultUpdated(event: Event) {
    globalImageGenerationDefault.value = normalizeImageGenerationState((event as CustomEvent).detail)
    if (imageGenerationConvoMode.value === 'default') {
      applyImageGenerationStateForActiveConvo()
    }
  }

  function applyImageGenerationStateForActiveConvo() {
    hydrateSessionConfigUiFromActiveConvo()
  }

  async function persistImageGenerationConfigForActiveConvo(input: Readonly<{
    mode: ConvoImageGenerationMode
    custom: ImageGenerationUiState | null
  }>): Promise<void> {
    const normalized = normalizeImageGenerationState(input.custom)
    const resolution =
      normalized.imageSize === '512' || normalized.imageSize === '1K' || normalized.imageSize === '2K' || normalized.imageSize === '4K'
        ? normalized.imageSize
        : '1K'
    const aspectRatio =
      normalized.aspectRatio === 'auto' ||
      normalized.aspectRatio === '1:1' ||
      normalized.aspectRatio === '9:16' ||
      normalized.aspectRatio === '16:9' ||
      normalized.aspectRatio === '3:4' ||
      normalized.aspectRatio === '4:3' ||
      normalized.aspectRatio === '3:2' ||
      normalized.aspectRatio === '2:3' ||
      normalized.aspectRatio === '5:4' ||
      normalized.aspectRatio === '4:5' ||
      normalized.aspectRatio === '21:9' ||
      normalized.aspectRatio === '4:1' ||
      normalized.aspectRatio === '1:4' ||
      normalized.aspectRatio === '8:1' ||
      normalized.aspectRatio === '1:8'
        ? normalized.aspectRatio as ChatSessionConfigAspectRatio
        : '1:1'
    await updateActiveConvoSessionConfig({
      imageGeneration: {
        mode: input.mode,
        detail: input.mode === 'custom' ? normalized : null,
        enabled: normalized.enabled,
        resolution,
        aspectRatio,
      },
    })
  }

  async function onUpdateImageGenerationFollowDefault(nextFollowDefault: boolean) {
    const normalizedFollowDefault = nextFollowDefault === true
    const targetMode: ConvoImageGenerationMode = normalizedFollowDefault ? 'default' : 'custom'
    if (imageGenerationConvoMode.value === targetMode) return

    const custom = normalizedFollowDefault ? null : imageGenerationState.value
    imageGenerationConvoMode.value = targetMode
    try {
      await persistImageGenerationConfigForActiveConvo({ mode: targetMode, custom })
    } catch (err) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] PERSIST_IMAGE_GENERATION_MODE_FAILED')
      }
    }

    if (normalizedFollowDefault) {
      applyImageGenerationStateForActiveConvo()
    }
  }

  async function onUpdateImageGeneration(next: ImageGenerationUiState) {
    const normalized = normalizeImageGenerationState(next)
    imageGenerationState.value = normalized
    const targetMode: ConvoImageGenerationMode = 'custom'
    imageGenerationConvoMode.value = targetMode
    try {
      await persistImageGenerationConfigForActiveConvo({
        mode: targetMode,
        custom: normalized,
      })
    } catch (err) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] PERSIST_IMAGE_GENERATION_CUSTOM_CONFIG_FAILED')
      }
    }
  }

  function resolveImageGenerationConfigForRequest(
    providerKey: RuntimeProviderId,
    sessionConfig: ChatSessionConfig = activeSessionConfig.value,
  ): Readonly<{
    capabilityClass?: ImageCapabilityClass
    modalities?: ReadonlyArray<OpenRouterOutputModality>
    outputMode?: ImageGenerationUserConfig['outputMode']
    aspectRatio?: string
    imageSize?: ImageGenerationUserConfig['imageSize']
    imageConfig?: OpenRouterImageConfig
  }> | null {
    const ui = normalizeImageGenerationState({
      ...normalizeImageGenerationState(sessionConfig.imageGeneration.detail),
      enabled: sessionConfig.imageGeneration.enabled,
      imageSize: sessionConfig.imageGeneration.resolution,
      aspectRatio: sessionConfig.imageGeneration.aspectRatio,
    })
    const selectedModelId = routeModelId(sessionConfig)
    const isGeminiImageModel = providerKey === GOOGLE_AI_STUDIO_PROVIDER_KEY && isKnownGeminiImageGenerationModel(selectedModelId)
    if (!ui.enabled && !isGeminiImageModel) return null

    const aspectRatio = String(ui.aspectRatio ?? '').trim()
    const imageSize = String(ui.imageSize ?? '').trim()

    if (providerKey === OPENAI_RESPONSES_PROVIDER_KEY || providerKey === GOOGLE_AI_STUDIO_PROVIDER_KEY) {
      if (isGeminiImageModel) {
        const policy = resolveGeminiImageGenerationPolicy(selectedModelId)
        const resolvedAspectRatio = aspectRatio || policy.defaultAspectRatio
        if (!(policy.supportedAspectRatios as readonly string[]).includes(resolvedAspectRatio)) {
          throw new Error(`Google AI Studio aspect ratio ${resolvedAspectRatio || '(empty)'} is not supported for ${selectedModelId}. Supported aspect ratios: ${policy.supportedAspectRatios.join(', ')}.`)
        }
        let resolvedImageSize: ImageGenerationUserConfig['imageSize'] = ''
        if (policy.imageSizeMode !== 'hidden') {
          resolvedImageSize = (imageSize || policy.defaultImageSize) as ImageGenerationUserConfig['imageSize']
          if (!(policy.supportedImageSizes as readonly string[]).includes(resolvedImageSize)) {
            throw new Error(`Google AI Studio image size ${resolvedImageSize || '(empty)'} is not supported for ${selectedModelId}. Supported sizes: ${policy.supportedImageSizes.join(', ')}.`)
          }
        }
        const outputMode = ui.outputMode === 'image_only' || ui.outputMode === 'image_and_text'
          ? ui.outputMode
          : policy.defaultOutputMode
        return {
          outputMode,
          aspectRatio: resolvedAspectRatio,
          imageSize: resolvedImageSize,
        }
      }
      return {
        outputMode: ui.outputMode,
        aspectRatio,
        imageSize: ui.imageSize,
      }
    }

    if (providerKey !== OPENROUTER_PROVIDER_ID) return null

    const capabilityClass = selectedModelImageCapabilityClass.value
    if (!capabilityClass) return null

    let modalities: OpenRouterOutputModality[] | undefined
    if (ui.outputMode === 'image_only') {
      modalities = ['image']
    } else if (ui.outputMode === 'image_and_text') {
      modalities = ['image', 'text']
    }
    if (capabilityClass === 'image_only' && modalities?.includes('text')) {
      modalities = ['image']
    }

    const imageConfigPatch: Record<string, unknown> = {}
    if (aspectRatio && aspectRatio !== 'auto') imageConfigPatch.aspect_ratio = aspectRatio
    if (imageSize) imageConfigPatch.image_size = imageSize
    const imageConfig =
      Object.keys(imageConfigPatch).length > 0
        ? (imageConfigPatch as OpenRouterImageConfig)
        : undefined

    return {
      capabilityClass,
      ...(modalities ? { modalities } : {}),
      ...(imageConfig ? { imageConfig } : {}),
    }
  }

  function resolveSelectedModelAvailability(modelKey: string): 'available' | 'hidden' | 'missing' | 'unknown' {
    const normalized = normalizeModelKey(modelKey)
    if (!normalized) return 'unknown'

    if (modelCatalogItems.value.length === 0) {
      return modelCatalogListStatus.value === 'unknown' || modelCatalogListStatus.value === 'syncing'
        ? 'unknown'
        : 'missing'
    }

    const inCatalog = modelCatalogItems.value.find((item) => item.modelId === normalized) ?? null
    if (inCatalog) {
      return inCatalog.status === 'hidden' ? 'hidden' : 'available'
    }

    return 'missing'
  }

  function applySelectedModelOverrideForActiveConvo() {
    const currentSessionConfig = getActiveSessionConfigSnapshot()
    const selectedProvider = providerModelRoute(currentSessionConfig)?.providerId ?? null
    const normalized = selectedProvider === OPENROUTER_PROVIDER_ID
      ? normalizeModelKey(routeModelId(currentSessionConfig))
      : DEFAULT_OPENROUTER_MODEL_ID

    const availability = resolveSelectedModelAvailability(normalized)
    if ((availability === 'hidden' || availability === 'missing') && shouldLogDebug()) {
      console.warn('[ui-app] selected route model is not currently visible in local catalog; keep using the persisted session selection', {
        convoId: getActiveConvoRecord()?.id,
          modelId: normalized,
        availability,
      })
    }
  }

  async function persistProviderModelRouteForActiveConvo(selection: ProviderModelRouteSelection) {
    const convo = getActiveConvoRecord()
    if (!convo) throw new Error('ACTIVE_CONVERSATION_UNAVAILABLE')

    const normalized = normalizeRuntimeModelId(selection.modelId)
    if (!normalized) throw new Error('GENERATION_V2_MODEL_SELECTION_REQUIRED')
    const currentRoute = providerModelRoute(getActiveSessionConfigSnapshot())
    if (currentRoute?.modelId === normalized && currentRoute.providerId === selection.providerId) return

    const current = getActiveSessionConfigSnapshot()
    const routeSelection = createProviderModelRouteSelection({ providerId: selection.providerId, modelId: normalized })
    const auxiliaryPatch: {
      imageGeneration?: NonNullable<ChatSessionConfigPatch['imageGeneration']>
      reasoning?: NonNullable<ChatSessionConfigPatch['reasoning']>
      generationParams?: NonNullable<ChatSessionConfigPatch['generationParams']>
    } = {}
      if (selection.providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && isKnownGeminiImageGenerationModel(normalized)) {
        const policy = resolveGeminiImageGenerationPolicy(normalized)
        const imageSize = policy.imageSizeMode === 'hidden' ? '' : policy.defaultImageSize
        auxiliaryPatch.imageGeneration = {
          enabled: true,
          resolution: policy.defaultImageSize,
          aspectRatio: policy.defaultAspectRatio,
          mode: 'custom',
          detail: normalizeImageGenerationState({
            ...normalizeImageGenerationState(current.imageGeneration.detail),
            enabled: true,
            outputMode: policy.defaultOutputMode,
            imageSize,
            aspectRatio: policy.defaultAspectRatio,
          }),
        }
      }
      const profile = getDefaultGenerationParamProfile(selection.providerId, {
        requestKind: selection.providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && isKnownGeminiImageGenerationModel(normalized)
          ? 'image_generation' : 'text',
      })
      if (selection.providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && !isKnownGeminiImageGenerationModel(normalized)) {
        const thinkingCapability = geminiThinkingCapabilityForModel(normalized)
        const detail = { ...(current.generationParams.detail ?? {}) }
        if (thinkingCapability.kind === 'level') {
          delete detail.thinkingBudget
          const level = detail.thinkingLevel
          if (level?.mode === 'custom' && !(thinkingCapability.levels as readonly string[]).includes(String(level.value))) {
            detail.thinkingLevel = { mode: 'omit' }
          }
        } else if (thinkingCapability.kind === 'budget') {
          delete detail.thinkingLevel
          const budget = detail.thinkingBudget
          if (budget?.mode === 'custom' && !isGeminiThinkingBudgetValid(thinkingCapability, budget.value)) {
            detail.thinkingBudget = { mode: 'omit' }
          }
        } else {
          delete detail.thinkingBudget
          delete detail.thinkingLevel
          delete detail.includeThoughts
        }
        if (thinkingCapability.kind !== 'level' && thinkingCapability.kind !== 'budget') {
          delete detail.thinkingEnabled
          delete detail.reasoningEffort
        }
        auxiliaryPatch.generationParams = { detail: Object.freeze(detail) }
      }
      if (selection.providerId === DEEPSEEK_OFFICIAL_PROVIDER_KEY) {
        if (current.reasoning.enabled && !isDeepSeekSelectableReasoningEffort(current.reasoning.effort)) {
          auxiliaryPatch.reasoning = { enabled: true, effort: 'high' }
        }
      }
      const persistedEffort = current.generationParams.detail?.reasoningEffort
      const hasExplicitMax = current.reasoning.enabled && current.reasoning.effort === 'max' ||
        selection.providerId !== DEEPSEEK_OFFICIAL_PROVIDER_KEY &&
          persistedEffort?.mode === 'custom' && persistedEffort.value === 'max'
      if (hasExplicitMax && isReasoningEffortExplicitlyUnsupported(profile, normalized, 'max', {
        geminiThinkingCapability: selection.providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && !isKnownGeminiImageGenerationModel(normalized)
          ? geminiThinkingCapabilityForModel(normalized) : undefined,
      })) {
        auxiliaryPatch.reasoning = { enabled: false, effort: 'medium' }
        auxiliaryPatch.generationParams = { detail: Object.freeze({
          ...(current.generationParams.detail ?? {}),
          reasoningEffort: Object.freeze({ mode: 'omit' as const }),
        }) }
        requestedReasoningEffort.value = 'auto'
        requestedReasoningExclude.value = false
      }
    const updated = await updateActiveConvoSessionConfig({ routeSelection })
    if (!updated) throw new Error('ACTIVE_CONVERSATION_UNAVAILABLE')
    if (Object.keys(auxiliaryPatch).length > 0) {
      try {
        await updateActiveConvoSessionConfig(auxiliaryPatch)
      } catch {
        if (shouldLogDebug()) console.warn('[ui-app] MODEL_SELECTION_AUXILIARY_CONFIG_UPDATE_FAILED')
      }
    }
  }

  async function onUpdateRouteSelection(nextRouteSelection: ConversationRouteSelection) {
    if (isDraftInteractionLocked.value) throw new Error('MODEL_SELECTION_LOCKED')
    if (nextRouteSelection.kind === 'openai_chat_compatible') {
      const updated = await updateActiveConvoSessionConfig({
        routeSelection: nextRouteSelection,
      })
      if (!updated) throw new Error('ACTIVE_CONVERSATION_UNAVAILABLE')
      void refreshDraftAttachmentViewModels()
      scheduleHistoryIncompatibleRefresh()
      return
    }
    await persistProviderModelRouteForActiveConvo(nextRouteSelection)
    void refreshDraftAttachmentViewModels()
    scheduleHistoryIncompatibleRefresh()
  }

  async function recordRecentModelUsage(modelId: string, providerId: RuntimeProviderId) {
    const normalized = normalizeModelKey(modelId)
    if (!normalized) return
    const result = await ModelPrefsService.recordRecent(
      {
        providerKey: providerId,
        modelId: normalized,
      },
      {
        scopeType: 'global',
        scopeId: '',
      },
    )
    if (!result && shouldLogDebug()) {
      console.warn('[ui-app] recordRecentModelUsage failed (non-fatal)', {
        modelId: normalized,
      })
    }
  }

  function extractUserMessageRenderOverride(meta: unknown): boolean | undefined {
    if (!meta || typeof meta !== 'object') return undefined
    const raw = (meta as Record<string, unknown>).renderUserMessageRichText
    if (raw === true) return true
    if (raw === false) return false
    return undefined
  }

  function finalizeMetaObject(base: Record<string, unknown>): Record<string, unknown> | null {
    return Object.keys(base).length > 0 ? base : null
  }

  function mergeUserMessageRenderModeIntoMeta(meta: unknown, mode: UserMessageRenderMode): Record<string, unknown> | null {
    const base = meta && typeof meta === 'object' ? { ...(meta as Record<string, unknown>) } : {}
    if (mode === 'follow') {
      delete base.renderUserMessageRichText
    } else {
      base.renderUserMessageRichText = mode === 'on'
    }
    return finalizeMetaObject(base)
  }

  async function refreshGlobalUserMessageRenderDefault(): Promise<boolean | null> {
    const value = await getUserMessageRenderDefault()
    globalUserMessageRenderDefault.value = value
    return value
  }

  function handleGlobalUserMessageRenderDefaultUpdated(event: Event) {
    const detail = (event as CustomEvent).detail
    globalUserMessageRenderDefault.value = detail === true
  }

  async function cycleUserMessageRenderMode() {
    const convo = getActiveConvoRecord()
    if (!convo || isRunning.value) return

    const nextMode = nextTriState(userMessageRenderPolicy.value.mode)
    const nextMeta = mergeUserMessageRenderModeIntoMeta(convo.meta ?? null, nextMode)

    try {
      await saveConvo({
        id: convo.id,
        title: convo.title,
        projectId: convo.projectId ?? null,
        meta: nextMeta,
      })
      convos.value = convos.value.map((c) => (c.id === convo.id ? { ...c, meta: nextMeta } : c))
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] CYCLE_USER_MESSAGE_RENDER_MODE_FAILED')
    }
  }

  function getUserMessageRawText(message: MessageVM): string {
    if (message.role !== 'user') return ''
    const parts: string[] = []
    for (const block of message.contentBlocks) {
      if (block.type === 'text') parts.push(block.text)
    }
    return parts.join('')
  }

  function getAssistantVisibleText(message: MessageVM): string {
    if (message.role !== 'assistant') return ''
    const parts: string[] = []
    for (const block of message.contentBlocks) {
      if (block.type === 'text') parts.push(block.text)
    }
    return parts.join('')
  }

  function getAssistantImageBlockCount(message: MessageVM): number {
    if (message.role !== 'assistant') return 0
    let count = 0
    for (const block of message.contentBlocks) {
      if (block.type === 'image') count += 1
    }
    return count
  }

  function getAssistantCitationLines(message: MessageVM): string[] {
    const raw = Array.isArray(message.annotations) ? message.annotations : []
    const lines: string[] = []
    const seen = new Set<string>()

    const toUrlHost = (url: string): string => {
      try {
        const parsed = new URL(url)
        return parsed.hostname.replace(/^www\./, '')
      } catch {
        return url
      }
    }

    for (const annotation of raw) {
      if (!annotation || typeof annotation !== 'object') continue
      const ann = annotation as Record<string, unknown>
      if (ann.type !== 'url_citation') continue
      const citation = ann.url_citation && typeof ann.url_citation === 'object'
        ? (ann.url_citation as Record<string, unknown>)
        : null
      if (!citation) continue

      const url = typeof citation.url === 'string' ? citation.url.trim() : ''
      const title = typeof citation.title === 'string' ? citation.title.trim() : ''
      const label = title || (url ? toUrlHost(url) : '')
      const key = `${url}|${label}`
      if (seen.has(key)) continue
      seen.add(key)

      if (url && label) lines.push(`${label} - ${url}`)
      else if (url) lines.push(url)
      else if (label) lines.push(label)
    }

    return lines
  }

  function hasAssistantCitations(message: MessageVM): boolean {
    return getAssistantCitationLines(message).length > 0
  }

  async function copyAssistantMessage(message: MessageVM, mode: 'plain' | 'with_refs') {
    const text = getAssistantVisibleText(message)
    if (!text) return

    let payload = text
    if (mode === 'with_refs') {
      const refs = getAssistantCitationLines(message)
      if (refs.length > 0) {
        payload += `\n\nReferences:\n${refs.map((line, idx) => `[${idx + 1}] ${line}`).join('\n')}`
      }
    }

    try {
      await navigator.clipboard.writeText(payload)
    } catch {
      // no-op
    }
  }

  async function copyUserMessageRaw(message: MessageVM) {
    const raw = getUserMessageRawText(message)
    if (!raw) return
    try {
      await navigator.clipboard.writeText(raw)
    } catch {
      // no-op
    }
  }

  async function refreshGlobalReasoningPrefs(): Promise<ReasoningPrefs | null> {
    try {
      const raw = await getReasoningPrefs()
      const normalized = normalizeReasoningPrefs(raw)
      globalReasoningPrefs.value = normalized
      return normalized
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] REFRESH_GLOBAL_REASONING_PREFS_FAILED')
      globalReasoningPrefs.value = null
      return null
    }
  }

  async function refreshGlobalReasoningPanelDefaultExpanded(): Promise<boolean> {
    try {
      const value = await getChatReasoningPanelDefaultExpanded()
      globalReasoningPanelDefaultExpanded.value = value
      return value
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] REFRESH_REASONING_PANEL_DEFAULT_EXPANDED_FAILED')
      globalReasoningPanelDefaultExpanded.value = true
      return true
    }
  }

  async function refreshGlobalReasoningPanelAutoCollapseAfterReasoning(): Promise<boolean> {
    try {
      const value = await getChatReasoningPanelAutoCollapseAfterReasoning()
      globalReasoningPanelAutoCollapseAfterReasoning.value = value
      return value
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] REFRESH_REASONING_PANEL_AUTO_COLLAPSE_FAILED')
      globalReasoningPanelAutoCollapseAfterReasoning.value = false
      return false
    }
  }

    async function loadReasoningPrefsForActiveConvo() {
    const convo = getActiveConvoRecord()
    if (!convo) {
      applyReasoningPrefs(DEFAULT_REASONING_PREFS)
      return
    }
    if (!globalReasoningPrefs.value) {
      await refreshGlobalReasoningPrefs()
    }
    hydrateSessionConfigUiFromActiveConvo()
  }

  function scheduleReasoningPrefsSave() {
    if (reasoningPrefSaveTimer.value) clearTimeout(reasoningPrefSaveTimer.value)
    reasoningPrefSaveTimer.value = setTimeout(() => {
      reasoningPrefSaveTimer.value = null
      void persistReasoningPrefs()
    }, 500)
  }

  function handleGlobalReasoningPrefsUpdated(event: Event) {
    const detail = (event as CustomEvent).detail
    const normalized = normalizeReasoningPrefs(detail) ?? DEFAULT_REASONING_PREFS
    globalReasoningPrefs.value = normalized
    hydrateSessionConfigUiFromActiveConvo()
  }

  function handleGlobalReasoningPanelDefaultExpandedUpdated(event: Event) {
    globalReasoningPanelDefaultExpanded.value = (event as CustomEvent).detail !== false
  }

  function handleGlobalReasoningPanelAutoCollapseAfterReasoningUpdated(event: Event) {
    globalReasoningPanelAutoCollapseAfterReasoning.value = (event as CustomEvent).detail === true
  }

  async function persistReasoningPrefs() {
    const convo = getActiveConvoRecord()
    if (!convo) return
    const prefs = buildReasoningPrefsFromUi()

    try {
      await updateActiveConvoSessionConfig({
        reasoning: {
          enabled: prefs.mode === 'effort' && prefs.effort !== 'none',
          effort:
            prefs.effort === 'auto' || prefs.effort === 'none' ? 'medium' : prefs.effort,
        },
      })
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] PERSIST_REASONING_PREFS_FAILED')
    }

    if (!convo.projectId) {
      try {
        await setReasoningPrefs(prefs)
        globalReasoningPrefs.value = prefs
      } catch (err) {
        if (shouldLogDebug()) console.warn('[ui-app] SET_REASONING_PREFS_FAILED')
      }
    }
  }

              let sendOrchestrationLocked = false

  async function onSend() {
    if (sendOrchestrationLocked || isRunning.value || isDraftInteractionLocked.value) return
    if (!draft.value.trim() && draftAttachmentRecords.value.length === 0) return
    sendOrchestrationLocked = true
    try {
      await flushDraftPersistence({ failOnError: true })
      await onSendUnlocked()
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : 'send_orchestration_failed'
    } finally {
      sendOrchestrationLocked = false
    }
  }

  function finiteGenerationNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }

  function buildCurrentGenerationV2SemanticLayer(
    providerId: RuntimeProviderId,
    sessionConfig: ChatSessionConfig = activeSessionConfig.value,
  ): Readonly<Record<string, unknown>> {
    const modelId = routeModelId(sessionConfig) || DEFAULT_OPENROUTER_MODEL_ID
    const resolved = resolveGenerationParamsFromLayers({
      profile: generationParamProfileForProvider(providerId, modelId),
      modelId,
      geminiThinkingCapability: providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && !isGeminiInteractionsImageModelIdV1(normalizeGeminiImageGenerationModelId(modelId))
        ? geminiThinkingCapabilityForModel(modelId) : undefined,
      layers: {
        conversation: sessionConfig.generationParams.detail,
        project: getActiveProjectGenerationParamsLayer(),
        global: globalGenerationParamsDefaults.value,
      },
    })
    if (resolved.errors.length > 0) throw new Error(resolved.errors[0]?.message ?? 'GENERATION_V2_CONFIG_INVALID')
    const params = resolved.requestParams
    const imageConfig = resolveImageGenerationConfigForRequest(providerId, sessionConfig)
    const geminiInteractionsImage = providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY &&
      isGeminiInteractionsImageModelIdV1(normalizeGeminiImageGenerationModelId(routeModelId(sessionConfig))) && imageConfig !== null
    const geminiGenerateThinkingCapability = providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && !geminiInteractionsImage
      ? geminiThinkingCapabilityForModel(modelId) : null
    if (providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && !geminiInteractionsImage) {
      for (const key of ['thinkingBudget', 'thinkingLevel', 'includeThoughts'] as const) {
        if (sessionConfig.generationParams.detail?.[key]?.mode === 'custom' && resolved.decisions[key]?.state === 'unsupported') {
          throw new Error(`GENERATION_V2_GEMINI_THINKING_UNSUPPORTED_${key.toUpperCase()}`)
        }
      }
    }
    const mappedParamKeys = new Set([
      'temperature', 'topP', 'topK', 'minP', 'topA', 'frequencyPenalty', 'presencePenalty',
      'repetitionPenalty', 'seed', 'maxOutputTokens', 'stopSequences', 'reasoningEffort',
      'reasoningSummary', 'thinkingEnabled', 'thinkingBudget', 'thinkingLevel', 'includeThoughts',
      'thoughtSummaryMode', 'googleSearch', 'imageSearch', 'verbosity',
    ])
    const unmappedParam = Object.keys(params).find((key) => !mappedParamKeys.has(key))
    if (unmappedParam) throw new Error(`GENERATION_V2_EXPLICIT_PARAMETER_UNMAPPED_${unmappedParam.toUpperCase()}`)
    const generationEntries: [string, unknown][] = [
      ['temperature', finiteGenerationNumber(params.temperature)],
      ['topP', finiteGenerationNumber(params.topP)],
      ['topK', finiteGenerationNumber(params.topK)],
      ['minP', finiteGenerationNumber(params.minP)],
      ['topA', finiteGenerationNumber(params.topA)],
      ['frequencyPenalty', finiteGenerationNumber(params.frequencyPenalty)],
      ['presencePenalty', finiteGenerationNumber(params.presencePenalty)],
      ['repetitionPenalty', finiteGenerationNumber(params.repetitionPenalty)],
      ['seed', finiteGenerationNumber(params.seed)],
      ['maxOutputTokens', finiteGenerationNumber(params.maxOutputTokens)],
      ['stop', Array.isArray(params.stopSequences) ? [...params.stopSequences] : undefined],
    ]
    const generation = Object.fromEntries(generationEntries.filter((entry) => entry[1] !== undefined))

    const openRouterReasoning = providerId === OPENROUTER_PROVIDER_ID ? {
      requestedReasoningMode: sessionConfig.reasoning.enabled ? 'effort' as const : 'auto' as const,
      requestedReasoningEffortValue: sessionConfig.reasoning.enabled ? sessionConfig.reasoning.effort : undefined,
      requestedReasoningExclude: sessionConfig.reasoning.enabled && requestedReasoningExclude.value,
    } : null
    const deepSeekReasoning = providerId === DEEPSEEK_OFFICIAL_PROVIDER_KEY ? sessionConfig.reasoning : null
    const thinkingEnabled = deepSeekReasoning ? deepSeekReasoning.enabled : params.thinkingEnabled
    const rawEffort = String(deepSeekReasoning
      ? (deepSeekReasoning.enabled ? deepSeekReasoning.effort : '')
      : openRouterReasoning?.requestedReasoningEffortValue ??
        (geminiInteractionsImage ? params.thinkingLevel : undefined) ?? params.thinkingLevel ?? params.reasoningEffort ?? '').trim()
    const explicitReasoningDisabled = deepSeekReasoning
      ? !deepSeekReasoning.enabled
      : rawEffort === 'none' || thinkingEnabled === false
    const effort = rawEffort === 'none' ? '' : rawEffort
    const summary = String(deepSeekReasoning ? '' : geminiInteractionsImage && params.thoughtSummaryMode === 'auto'
      ? 'auto' : params.reasoningSummary ?? '').trim()
    if (effort && !['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
      throw new Error('GENERATION_V2_REASONING_EFFORT_UNSUPPORTED')
    }
    if (summary && !['auto', 'concise', 'detailed'].includes(summary)) {
      throw new Error('GENERATION_V2_REASONING_SUMMARY_UNSUPPORTED')
    }
    const reasoningEnabled = deepSeekReasoning
      ? deepSeekReasoning.enabled
      : openRouterReasoning?.requestedReasoningMode === 'auto' || thinkingEnabled === true || effort.length > 0 || summary.length > 0 ||
        geminiGenerateThinkingCapability?.thinkingSupported === 'supported' ||
        params.thinkingLevel !== undefined || params.thinkingBudget !== undefined
    const reasoning = explicitReasoningDisabled || !reasoningEnabled
      ? { mode: 'disabled' as const }
      : {
          mode: 'enabled' as const,
          ...(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? { effort } : {}),
          ...(['auto', 'concise', 'detailed'].includes(summary) ? { summary } : {}),
          ...(openRouterReasoning?.requestedReasoningExclude ? { exclude: true } : {}),
        }

    const search = resolveSearchSettings({
      convo: sessionConfig.webSearch.detail,
      project: getActiveProjectWebSearchLayer(),
      global: globalWebSearchDefaults.value,
    }, { accountDefaultEnabled: ACCOUNT_DEFAULT_WEB_SEARCH_ENABLED })
    if (search.effectiveMode && search.effectiveSearchPrompt) {
      throw new Error('GENERATION_V2_WEB_SEARCH_PROMPT_UNSUPPORTED')
    }
    const requestedWeb = search.effectiveMode || params.googleSearch === true || params.imageSearch === true
    const webTypes = Object.freeze([
      ...(search.effectiveMode || params.googleSearch === true ? ['web' as const] : []),
      ...(params.imageSearch === true ? ['image' as const] : []),
    ])
    const web = requestedWeb
      ? {
          mode: 'provider_search' as const,
          types: webTypes,
          ...(geminiInteractionsImage ? {} : {
            ...(search.effectiveEngine ? { engine: search.effectiveEngine } : {}),
            maxResults: search.effectiveMaxResults,
            searchContextSize: search.effectiveSearchContextSize,
          }),
        }
      : { mode: 'disabled' as const }

    let image: Readonly<Record<string, unknown>> = { mode: 'disabled' }
    if (imageConfig) {
      if (providerId === OPENROUTER_PROVIDER_ID && imageConfig.modalities?.includes('text')) {
        throw new Error('OPENROUTER_IMAGES_OUTPUT_MODE_UNSUPPORTED')
      }
      if (providerId === OPENAI_RESPONSES_PROVIDER_KEY && imageConfig.outputMode === 'image_only') {
        throw new Error('OPENAI_RESPONSES_IMAGE_ONLY_OUTPUT_UNSUPPORTED')
      }
      if (providerId === OPENAI_RESPONSES_PROVIDER_KEY) {
        const ratio = String(imageConfig.aspectRatio ?? '')
        const size = ratio === '3:4' ? { width: 1024, height: 1536 }
          : ratio === '4:3' || ratio === '16:9' ? { width: 1536, height: 1024 }
            : { width: 1024, height: 1024 }
        image = { mode: 'generate', size }
      } else image = {
        mode: 'generate',
        ...(geminiInteractionsImage ? { outputMode: imageConfig.outputMode } : {}),
        ...(imageConfig.aspectRatio && imageConfig.aspectRatio !== 'auto' ? { aspectRatio: imageConfig.aspectRatio } : {}),
        ...(['512', '1K', '2K', '4K'].includes(String(imageConfig.imageSize)) ? { resolution: imageConfig.imageSize } : {}),
      }
    }

    let providerExtension: Readonly<Record<string, unknown>> = { kind: 'none' }
    if (providerId === OPENAI_RESPONSES_PROVIDER_KEY) {
      providerExtension = {
        kind: 'openai_responses',
        ...(['low', 'medium', 'high'].includes(String(params.verbosity)) ? { verbosity: params.verbosity } : {}),
      }
    } else if (providerId === ANTHROPIC_MESSAGES_PROVIDER_KEY) {
      providerExtension = { kind: 'anthropic_messages', thinkingDisplay: anthropicChatConfig.value.thinkingDisplay,
        thinkingMode: 'model_recommended' }
    } else if (providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && !geminiInteractionsImage) {
      const includeThoughts = params.includeThoughts === true || params.thoughtSummaryMode === 'auto' ? 'enabled'
        : params.includeThoughts === false || params.thoughtSummaryMode === 'none' ? 'disabled' : 'provider_default'
      if (typeof params.thinkingBudget === 'number') providerExtension = {
        kind: 'gemini_generate_content', thinkingMode: 'budget', thinkingBudget: params.thinkingBudget, includeThoughts,
      }
      else if (['minimal', 'low', 'medium', 'high'].includes(String(params.thinkingLevel))) providerExtension = {
        kind: 'gemini_generate_content', thinkingMode: 'level', thinkingLevel: params.thinkingLevel, includeThoughts,
      }
      else providerExtension = { kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts }
    }

    return Object.freeze({ schemaVersion: 2, generation, reasoning, web, image,
      tools: Object.freeze({ mode: 'disabled' }), providerExtension })
  }

  async function persistCurrentGenerationV2SemanticLayer(
    providerId: RuntimeProviderId,
    conversationId: string,
    force = false,
    sessionConfig: ChatSessionConfig = activeSessionConfig.value,
  ): Promise<void> {
    let current = generationV2ConfigByConversationId.value.get(conversationId)
    if (!current) {
      current = await getGenerationV2Config('conversation', conversationId)
      cacheGenerationV2Config(conversationId, current)
    }
    if (!force && !isEmptyGenerationV2SemanticLayer(current.semanticLayer)) return
    cacheGenerationV2Config(conversationId, await updateGenerationV2Config({ ownerKind: 'conversation', ownerId: conversationId,
      expectedConfigRevision: current.configRevision, semanticLayer: buildCurrentGenerationV2SemanticLayer(providerId, sessionConfig) }))
  }

  function currentOpenRouterImageEndpointSelectionInput(): Readonly<{ modelId: string; semanticIntent: unknown }> {
    const config = activeSessionConfig.value
    if (providerModelRoute(config)?.providerId !== OPENROUTER_PROVIDER_ID || !config.imageGeneration.enabled) {
      throw new Error('GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_NOT_ACTIVE')
    }
    const modelId = routeModelId(config)
    if (!modelId) throw new Error('GENERATION_V2_MODEL_SELECTION_REQUIRED')
    const draftSnapshot = generationV2ComposerDraft.value?.conversationId === activeConvoId.value
      ? generationV2ComposerDraft.value : null
    return Object.freeze({
      modelId,
      semanticIntent: Object.freeze({
        ...buildCurrentGenerationV2SemanticLayer(OPENROUTER_PROVIDER_ID),
        attachments: draftSnapshot ? projectGenerationV2ComposerAttachments(draftSnapshot) : Object.freeze([]),
      }),
    })
  }

  async function refreshOpenRouterImageEndpointSelection(): Promise<void> {
    if (openRouterImageEndpointSelectionLoading.value) return
    openRouterImageEndpointSelectionLoading.value = true
    openRouterImageEndpointSelectionError.value = null
    try {
      openRouterImageEndpointSelection.value = await getOpenRouterImageEndpointSelectionV2(
        currentOpenRouterImageEndpointSelectionInput(),
      )
    } catch (error) {
      openRouterImageEndpointSelectionError.value = error instanceof Error
        ? error.message : 'GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_COMMAND_FAILED'
    } finally {
      openRouterImageEndpointSelectionLoading.value = false
    }
  }

  async function chooseOpenRouterImageEndpoint(providerTag: string): Promise<void> {
    if (openRouterImageEndpointSelectionLoading.value) return
    openRouterImageEndpointSelectionLoading.value = true
    openRouterImageEndpointSelectionError.value = null
    try {
      const selection = currentOpenRouterImageEndpointSelectionInput()
      openRouterImageEndpointSelection.value = await selectOpenRouterImageEndpointV2({ ...selection, providerTag })
    } catch (error) {
      openRouterImageEndpointSelectionError.value = error instanceof Error
        ? error.message : 'GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_COMMAND_FAILED'
    } finally {
      openRouterImageEndpointSelectionLoading.value = false
    }
  }

  async function updateOpenRouterImageEndpointFreshness(input: Readonly<{
    refreshAfterMs: number
    hardExpireAfterMs: number
    expectedRevision: number
  }>): Promise<void> {
    if (openRouterImageEndpointSelectionLoading.value) return
    openRouterImageEndpointSelectionLoading.value = true
    openRouterImageEndpointSelectionError.value = null
    try {
      await updateOpenRouterImageEndpointSettingsV2(input)
      openRouterImageEndpointSelection.value = await getOpenRouterImageEndpointSelectionV2(
        currentOpenRouterImageEndpointSelectionInput(),
      )
    } catch (error) {
      openRouterImageEndpointSelectionError.value = error instanceof Error
        ? error.message : 'GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_COMMAND_FAILED'
    } finally {
      openRouterImageEndpointSelectionLoading.value = false
    }
  }

  function canonicalEndpointBase(value: string): string {
    const url = new URL(value)
    url.hash = ''; url.search = ''; url.pathname = url.pathname.replace(/\/+$/u, '') || '/'
    return url.toString().replace(/\/$/u, '')
  }

  let genericLocalProfileSync: Promise<string> | null = null
  function ensureGenerationV2GenericLocalProfileFromSavedSettings(): Promise<string> {
    if (genericLocalProfileSync) return genericLocalProfileSync
    const work = (async () => {
      const baseUrl = canonicalEndpointBase(new URL(localEndpointChatUrl.value.trim()).origin)
      const matches = (await listGenerationV2LocalProfiles()).filter((profile) =>
        profile.providerId === 'generic_local' &&
        profile.protocolContractId === 'generic-local-openai-chat-completions' &&
        canonicalEndpointBase(profile.baseUrl) === baseUrl)
      if (matches.length === 1) return matches[0].endpointProfileId
      if (matches.length > 1) throw new Error('GENERATION_V2_LOCAL_PROFILE_AMBIGUOUS')
      const created = await createGenerationV2LocalProfile({
        providerId: 'generic_local',
        protocolContractId: 'generic-local-openai-chat-completions',
        baseUrl,
      })
      return created.endpointProfileId
    })()
    genericLocalProfileSync = work
    void work.then(
      () => { if (genericLocalProfileSync === work) genericLocalProfileSync = null },
      () => { if (genericLocalProfileSync === work) genericLocalProfileSync = null },
    )
    return work
  }

  function handleGenerationV2GenericLocalSettingsUpdated(): void {
    if (!window.generationV2) return
    void ensureGenerationV2GenericLocalProfileFromSavedSettings().catch((error) => {
      loadError.value = error instanceof Error ? error.message : 'GENERATION_V2_LOCAL_PROFILE_SYNC_FAILED'
    })
  }

  async function ensureGenerationV2LmStudioProfileFromSavedSettings(): Promise<string> {
    if (!lmStudioChatConfig.value.enabled || lmStudioChatConfig.value.chatMode !== 'openai_compatible' ||
        lmStudioChatConfig.value.openAICompatiblePreferredEndpoint !== 'responses') {
      throw new Error('GENERATION_V2_LMSTUDIO_OPENRESPONSES_NOT_SELECTED')
    }
    const baseUrl = canonicalEndpointBase(lmStudioChatConfig.value.endpointUrl.trim())
    const matches = (await listGenerationV2LocalProfiles()).filter((profile) =>
      profile.providerId === 'lmstudio' && profile.protocolContractId === 'lmstudio-openresponses' &&
      canonicalEndpointBase(profile.baseUrl) === baseUrl)
    if (matches.length === 1) return matches[0].endpointProfileId
    if (matches.length > 1) throw new Error('GENERATION_V2_LOCAL_PROFILE_AMBIGUOUS')
    return (await createGenerationV2LocalProfile({
      providerId: 'lmstudio', protocolContractId: 'lmstudio-openresponses', baseUrl,
    })).endpointProfileId
  }

  async function ensureGenerationV2OllamaProfileFromSavedSettings(modelId: string): Promise<string> {
    if (!ollamaChatConfig.value.enabled || ollamaChatConfig.value.chatMode !== 'native_rest' ||
        ollamaChatConfig.value.nativeRestPreferredEndpoint !== 'chat') {
      throw new Error('GENERATION_V2_OLLAMA_NATIVE_CHAT_NOT_SELECTED')
    }
    if (ollamaChatConfig.value.thinkingControl === null || ollamaChatConfig.value.toolsSupported === null) {
      throw new Error('GENERATION_V2_OLLAMA_PROFILE_CAPABILITY_REQUIRED')
    }
    const baseUrl = canonicalEndpointBase(ollamaChatConfig.value.endpointUrl.trim())
    const matches = (await listGenerationV2LocalProfiles()).filter((profile) =>
      profile.providerId === 'ollama' && profile.protocolContractId === 'ollama-chat-v1' &&
      canonicalEndpointBase(profile.baseUrl) === baseUrl && profile.protocolConfig.modelId === modelId &&
      profile.protocolConfig.thinkingControl === ollamaChatConfig.value.thinkingControl &&
      profile.protocolConfig.tools === ollamaChatConfig.value.toolsSupported)
    if (matches.length === 1) return matches[0].endpointProfileId
    if (matches.length > 1) throw new Error('GENERATION_V2_LOCAL_PROFILE_AMBIGUOUS')
    return (await createGenerationV2LocalProfile({
      providerId: 'ollama', protocolContractId: 'ollama-chat-v1', baseUrl,
      protocolConfig: { modelId, thinkingControl: ollamaChatConfig.value.thinkingControl, tools: ollamaChatConfig.value.toolsSupported },
    })).endpointProfileId
  }

  function handleGenerationV2LmStudioSettingsUpdated(): void {
    if (!window.generationV2) return
    void ensureGenerationV2LmStudioProfileFromSavedSettings().catch(() => {
      if (shouldLogDebug()) console.warn('[ui-app] V2_LM_STUDIO_PROFILE_SYNC_FAILED')
    })
  }

  function canonicalSendSelection(): Readonly<{
    routeSelection: ConversationRouteSelection
    providerId: RuntimeProviderId
    modelId: string
    compatibleSelection: CompatibleConfigurationSelection | null
  }> | null {
    const routeSelection = activeSessionConfig.value.routeSelection
    if (!routeSelection) return null
    const compatibleSelection = routeSelection.kind === 'openai_chat_compatible'
      ? routeSelection.selection : null
    const providerId = routeSelection.kind === 'provider_model'
      ? routeSelection.providerId : 'local_endpoint'
    const modelId = routeSelection.kind === 'provider_model'
      ? normalizeRuntimeModelId(routeSelection.modelId)
      : normalizeRuntimeModelId(routeSelection.selection.modelId)
    return modelId ? Object.freeze({ routeSelection, providerId, modelId, compatibleSelection }) : null
  }

  function handleGenerationV2OllamaSettingsUpdated(): void {
    const selection = canonicalSendSelection()
    if (!window.generationV2 || selection?.routeSelection.kind !== 'provider_model' ||
        selection.providerId !== 'ollama_local') return
    void ensureGenerationV2OllamaProfileFromSavedSettings(selection.modelId).catch(() => {
      if (shouldLogDebug()) console.warn('[ui-app] V2_OLLAMA_PROFILE_SYNC_FAILED')
    })
  }

  async function resolveGenerationV2LocalProfileForSend(route: GenerationV2Route, modelId: string): Promise<string> {
    if (route.kind === 'lmstudio_openresponses' &&
        (lmStudioChatConfig.value.chatMode !== 'openai_compatible' ||
         lmStudioChatConfig.value.openAICompatiblePreferredEndpoint !== 'responses')) {
      throw new Error('GENERATION_V2_LMSTUDIO_OPENRESPONSES_NOT_SELECTED')
    }
    if (route.kind === 'ollama_chat' &&
        (ollamaChatConfig.value.chatMode !== 'native_rest' || ollamaChatConfig.value.nativeRestPreferredEndpoint !== 'chat')) {
      throw new Error('GENERATION_V2_OLLAMA_NATIVE_CHAT_NOT_SELECTED')
    }
    if (route.kind === 'ollama_chat' &&
        (ollamaChatConfig.value.thinkingControl === null || ollamaChatConfig.value.toolsSupported === null)) {
      throw new Error('GENERATION_V2_OLLAMA_PROFILE_CAPABILITY_REQUIRED')
    }
    const expectation = route.kind === 'lmstudio_openresponses'
      ? { providerId: 'lmstudio', protocol: 'lmstudio-openresponses', baseUrl: lmStudioChatConfig.value.endpointUrl }
      : route.kind === 'generic_local_openai_chat'
        ? { providerId: 'generic_local', protocol: 'generic-local-openai-chat-completions', baseUrl: new URL(localEndpointChatUrl.value).origin }
        : route.kind === 'ollama_chat'
          ? { providerId: 'ollama', protocol: 'ollama-chat-v1', baseUrl: ollamaChatConfig.value.endpointUrl }
          : null
    if (!expectation) throw new Error('GENERATION_V2_LOCAL_PROFILE_ROUTE_INVALID')
    const baseUrl = canonicalEndpointBase(String(expectation.baseUrl ?? '').trim())
    const matches = (await listGenerationV2LocalProfiles()).filter((profile) =>
      profile.providerId === expectation.providerId && profile.protocolContractId === expectation.protocol &&
      canonicalEndpointBase(profile.baseUrl) === baseUrl && (route.kind !== 'ollama_chat' ||
        profile.protocolConfig.modelId === modelId &&
        profile.protocolConfig.thinkingControl === ollamaChatConfig.value.thinkingControl &&
        profile.protocolConfig.tools === ollamaChatConfig.value.toolsSupported))
    if (route.kind === 'generic_local_openai_chat' && matches.length === 0) {
      throw new Error('GENERATION_V2_LOCAL_PROFILE_REQUIRED')
    }
    if (matches.length !== 1) throw new Error(matches.length === 0
      ? 'GENERATION_V2_LOCAL_PROFILE_REQUIRED'
      : 'GENERATION_V2_LOCAL_PROFILE_AMBIGUOUS')
    return matches[0].endpointProfileId
  }

  async function onSendUnlocked() {
    if (isRunning.value || isDraftInteractionLocked.value) return
    const text = draft.value.trim()
    if (!text && draftAttachmentRecords.value.length === 0) return
    const selection = canonicalSendSelection()
    if (!selection) throw new Error('GENERATION_V2_MODEL_SELECTION_REQUIRED')
    const { compatibleSelection, providerId, modelId } = selection
    const view = generationV2BranchView.value
    if (!view || view.branchId !== activeBranchId.value || view.conversationId !== activeConvoId.value) {
      throw new Error('GENERATION_V2_BRANCH_PROJECTION_STALE')
    }
    await flushDraftPersistence({ failOnError: true })
    const composerDraft = generationV2ComposerDraft.value?.conversationId === view.conversationId
      ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(view.conversationId)
    const commandAttachments = projectGenerationV2ComposerAttachments(composerDraft)
    const route: GenerationV2Route = compatibleSelection ? { kind: 'openai_chat_compatible' }
      : providerId === OPENROUTER_PROVIDER_ID && resolveImageGenerationConfigForRequest(providerId)
        ? { kind: 'openrouter_images' }
        : generationV2RouteForProvider(providerId, modelId)
    if ((route.kind === 'openrouter_images' || route.kind === 'gemini_interactions_image') && !text) {
      throw new Error('GENERATION_V2_IMAGE_PROMPT_REQUIRED')
    }
    await persistCurrentGenerationV2SemanticLayer(providerId, view.conversationId)
    const endpointProfileId = route.kind === 'lmstudio_openresponses' || route.kind === 'generic_local_openai_chat' || route.kind === 'ollama_chat'
      ? await resolveGenerationV2LocalProfileForSend(route, modelId) : null
    const commandModelId = route.kind === 'gemini_interactions_image'
      ? normalizeGeminiImageGenerationModelId(modelId) : modelId
    const operationId = crypto.randomUUID()
    const sendingFromTemplate = view.conversationId === systemTemplateSnapshot.value?.conversation.id
    const result = await submitGenerationV2Initial(route, route.kind === 'openrouter_images'
      ? { operationId, branchId: view.branchId, expectedHeadMessageId: view.headMessageId,
          prompt: text, modelId: commandModelId, requestedProviderTag: null, commandAttachments }
      : route.kind === 'gemini_interactions_image'
        ? { operationId, branchId: view.branchId, expectedHeadMessageId: view.headMessageId,
            prompt: text, modelId: commandModelId, commandAttachments }
      : { operationId, branchId: view.branchId, expectedHeadMessageId: view.headMessageId,
          userBody: text, modelId: commandModelId, commandAttachments,
          ...(compatibleSelection ? { providerInstanceId: compatibleSelection.providerInstanceId, extraBody: compatibleSelection.extraBody } : {}),
          ...(endpointProfileId === null ? {} : { endpointProfileId }) })
    if (!result.ok) throw new Error(result.code)
    if (sendingFromTemplate) {
      systemTemplateSnapshot.value = await getSystemChatTemplate()
      await reloadGenerationV2ConversationAuthorities(systemTemplateSnapshot.value.conversation.id)
      activeConvoId.value = view.conversationId
      activeBranchId.value = view.branchId
      projectsOnlyWorkspace.value = false
      await refreshConvos()
      await refreshBranchesForActiveConvo()
    }
    try {
      generationV2ComposerDraft.value = await clearCommittedGenerationV2ComposerDraft({
        conversationId: view.conversationId, expectedRevision: composerDraft.revision,
      })
      draft.value = generationV2ComposerDraft.value.draftText
      await refreshDraftAttachmentViewModels()
    } catch (error) {
      if (shouldLogDebug()) console.warn('[ui-app] COMMITTED_V2_SEND_DRAFT_CLEAR_FAILED')
    }
    await refreshRenderableBranchView(view.branchId)
    if (!compatibleSelection) void recordRecentModelUsage(modelId, providerId)
  }

  async function onForkFromHead() {
    if (isRunning.value) return
    const convoId = activeConvoId.value
    const branch = activeBranch.value
    if (!convoId || !branch?.id || !branch.headMessageId) return

    try {
      const created = await forkGenerationV2Branch(branch.id, branch.headMessageId, null)
      await refreshBranchesForActiveConvo()
      activeBranchId.value = created.branchId
      resetCandidatesCache()
      await refreshRenderableBranchView(created.branchId)
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onDeleteActiveBranch() {
    if (isRunning.value) return
    const convoId = activeConvoId.value
    const bid = activeBranchId.value
    if (!convoId || !bid) return
    if (branches.value.length <= 1) return

    try {
      await deleteGenerationV2Branch(bid)
      await refreshBranchesForActiveConvo()
      const next = branches.value[0] ?? (await ensureGenerationV2BranchForConversation(convoId))
      activeBranchId.value = next.id
      resetCandidatesCache()
      await refreshRenderableBranchView(next.id)
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onMessageCandidateShift(messageId: string, delta: -1 | 1) {
    const bid = activeBranchId.value
    const mid = String(messageId ?? '').trim()
    const conversationId = activeConvoId.value
    if (!bid || !mid || !conversationId) return
    const sourceRevision = navigationRevision.value
    const key = messageCandidateCacheKey(bid, mid)
    try {
      const navigation = await getGenerationV2MessageCandidateNavigation(bid, mid)
      if (activeConvoId.value !== conversationId || activeBranchId.value !== bid ||
          navigationRevision.value !== sourceRevision) return
      messageCandidateNavigationCache.value.set(key, navigation)
      messageCandidateNavigationCache.value = new Map(messageCandidateNavigationCache.value)
      const target = delta < 0 ? navigation.previous : navigation.next
      if (!target) return
      await navigateToBranchMessage(
        target.branchId,
        target.messageId,
        conversationId,
        sourceRevision,
      )
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : String(error)
    }
  }

  async function onRegenerateFromQuestion(questionId: string) {
    if (isRunning.value || isDraftInteractionLocked.value || activeAssistantMessageId.value) return
    const branch = activeBranch.value
    const qid = String(questionId ?? '').trim()
    const chosen = turnFiltersByQuestionId.value.get(qid)?.chosenAnswerRootId
    if (!branch?.id || !qid || !chosen) return
    const selection = canonicalSendSelection()
    if (!selection) return
    const { compatibleSelection, modelId } = selection
    loadError.value = null
    try {
      const view = generationV2BranchView.value
      if (!view || view.branchId !== branch.id || view.conversationId !== activeConvoId.value) throw new Error('GENERATION_V2_BRANCH_PROJECTION_STALE')
      const sourceTurn = view.turns.find((turn) => turn.questionId === qid)
      if (!sourceTurn) throw new Error('GENERATION_V2_BRANCH_PROJECTION_STALE')
      const sourceNavigationRevision = navigationRevision.value
      const sourceConversationId = view.conversationId
      const sourceBranchId = view.branchId
      const nativeProviderId = selection.providerId
      const route: GenerationV2Route = compatibleSelection ? { kind: 'openai_chat_compatible' }
        : nativeProviderId === OPENROUTER_PROVIDER_ID && resolveImageGenerationConfigForRequest(nativeProviderId)
          ? { kind: 'openrouter_images' } : generationV2RouteForProvider(nativeProviderId, modelId)
      await persistCurrentGenerationV2SemanticLayer(nativeProviderId, view.conversationId)
      const endpointProfileId = route.kind === 'lmstudio_openresponses' || route.kind === 'generic_local_openai_chat' || route.kind === 'ollama_chat'
        ? await resolveGenerationV2LocalProfileForSend(route, modelId) : null
      const operationId = crypto.randomUUID()
      const common = { operationId, clientActionId: operationId, sourceBranchId: branch.id, questionId: qid,
        sourceAnswerId: chosen, expectedHeadMessageId: view.headMessageId, modelId: route.kind === 'gemini_interactions_image'
          ? normalizeGeminiImageGenerationModelId(modelId) : modelId }
      const composerDraft = generationV2ComposerDraft.value?.conversationId === view.conversationId
        ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(view.conversationId)
      const commandAttachments = projectGenerationV2ComposerAttachments(composerDraft)
      const result = await submitGenerationV2Regenerate(route, route.kind === 'openrouter_images'
        ? { ...common, requestedProviderTag: null, commandAttachments }
        : route.kind === 'gemini_interactions_image'
          ? { ...common, commandAttachments }
        : { ...common, commandAttachments, ...(compatibleSelection ? { providerInstanceId: compatibleSelection.providerInstanceId, extraBody: compatibleSelection.extraBody } : {}),
          ...(endpointProfileId === null ? {} : { endpointProfileId }) })
      if (!result.ok) throw new Error(result.code)
      invalidateMessageCandidateNavigation()
      if (activeConvoId.value === sourceConversationId) await refreshBranchesForActiveConvo()
      const shouldFollow = navigationRevision.value === sourceNavigationRevision &&
        activeConvoId.value === sourceConversationId && activeBranchId.value === sourceBranchId
      if (shouldFollow) {
        activeBranchId.value = result.branch.branchId
        resetCandidatesCache()
        await refreshRenderableBranchView(result.branch.branchId)
      }
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : String(error)
      await refreshRenderableBranchView(branch.id)
    }
  }

  async function openQuestionEdit(questionId: string) {
    if (isDraftInteractionLocked.value) return
    const qid = String(questionId ?? '').trim()
    if (!qid) return
    const meta = messageMetaById.value.get(qid)
    if (!meta || meta.role !== 'user') return
    const convoId = String(activeConvoId.value ?? '').trim()
    if (!convoId) return
    try {
      await flushDraftPersistence({ failOnError: true })
      const previousDraft = generationV2ComposerDraft.value?.conversationId === convoId
        ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(convoId)
      const turn = generationV2BranchView.value?.turns.find((candidate) => candidate.questionId === qid)
      const chosen = turn?.answers.find((answer) => answer.answerRootId === turn.chosenAnswerRootId)
      if (!turn || !chosen) throw new Error('GENERATION_V2_EDIT_TARGET_STALE')
      const cloned = await replaceGenerationV2ComposerDraftFromAnswerSnapshot({ conversationId: convoId,
        expectedRevision: previousDraft.revision, questionId: qid, answerRootId: chosen.answerRootId, draftText: turn.questionBody })
      generationV2ComposerDraft.value = cloned
      applyDraftPersistenceState({ draftMode: cloned.draftMode, editingSourceMessageId: cloned.editingSourceQuestionId })
      draft.value = cloned.draftText
      editRestoredDraftAttachmentAssetIds.value = new Set(cloned.attachments.map((attachment) =>
        attachment.kind === 'managed_file' ? attachment.assetId : attachment.referenceId))
      await refreshDraftAttachmentViewModels()
      questionEditSession.value = { questionId: qid, previousDraft }
    } catch (err) {
      editRestoredDraftAttachmentAssetIds.value = new Set()
      questionEditSession.value = null
      setAttachmentFeedback('error', err instanceof Error ? err.message : 'Failed to open edit draft.')
    }
  }

  async function closeQuestionEdit() {
    if (isDraftInteractionLocked.value) return
    const session = questionEditSession.value
    questionEditSession.value = null
    if (!session) return
    try {
      const current = generationV2ComposerDraft.value?.conversationId === session.previousDraft.conversationId
        ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(session.previousDraft.conversationId)
      generationV2ComposerDraft.value = await replaceGenerationV2ComposerDraft({
        conversationId: session.previousDraft.conversationId, expectedRevision: current.revision,
        draftText: session.previousDraft.draftText, draftMode: session.previousDraft.draftMode,
        editingSourceQuestionId: session.previousDraft.editingSourceQuestionId,
        attachments: projectGenerationV2ComposerAttachments(session.previousDraft),
      })
      draft.value = generationV2ComposerDraft.value.draftText
      applyDraftPersistenceState({ draftMode: generationV2ComposerDraft.value.draftMode,
        editingSourceMessageId: generationV2ComposerDraft.value.editingSourceQuestionId })
      await refreshDraftAttachmentViewModels()
    } catch (err) {
      setAttachmentFeedback('error', err instanceof Error ? err.message : 'Failed to restore draft after cancel.')
    }
  }

  async function submitQuestionEdit() {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    if (activeAssistantMessageId.value) return

    const convoId = activeConvoId.value
    const branch = activeBranch.value
    const editSession = questionEditSession.value
    if (!convoId || !branch?.id || !editSession) return

    const oldQuestionId = String(editSession.questionId ?? '').trim()
    const newText = draft.value.trim()
    if (!oldQuestionId || !newText) return

    const v2View = generationV2BranchView.value
    const sourceTurn = v2View?.turns.find((turn) => turn.questionId === oldQuestionId) ?? null
    if (!v2View || v2View.branchId !== branch.id || !sourceTurn || !v2View.headMessageId) {
      loadError.value = 'GENERATION_V2_EDIT_TARGET_STALE'
      return
    }
    const selection = canonicalSendSelection()
    if (!selection) { loadError.value = 'GENERATION_V2_MODEL_SELECTION_REQUIRED'; return }
    const { compatibleSelection, providerId: v2ProviderId, modelId: v2ModelId } = selection
    const v2Route: GenerationV2Route = compatibleSelection ? { kind: 'openai_chat_compatible' }
      : v2ProviderId === OPENROUTER_PROVIDER_ID && resolveImageGenerationConfigForRequest(v2ProviderId)
        ? { kind: 'openrouter_images' } : generationV2RouteForProvider(v2ProviderId, v2ModelId)
    try {
      await flushDraftPersistence({ failOnError: true })
      const composerDraft = generationV2ComposerDraft.value?.conversationId === convoId
        ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(convoId)
      const commandAttachments = projectGenerationV2ComposerAttachments(composerDraft)
      await persistCurrentGenerationV2SemanticLayer(v2ProviderId, v2View.conversationId)
      const endpointProfileId = v2Route.kind === 'lmstudio_openresponses' || v2Route.kind === 'generic_local_openai_chat' || v2Route.kind === 'ollama_chat'
        ? await resolveGenerationV2LocalProfileForSend(v2Route, v2ModelId) : null
      const operationId = crypto.randomUUID()
      const sourceNavigationRevision = navigationRevision.value
      const sourceConversationId = v2View.conversationId
      const sourceBranchId = v2View.branchId
      const common = { operationId, clientActionId: operationId, sourceBranchId: v2View.branchId,
        sourceQuestionId: oldQuestionId, sourceAnswerRootId: sourceTurn.chosenAnswerRootId,
        expectedHeadMessageId: v2View.headMessageId, modelId: v2Route.kind === 'gemini_interactions_image'
          ? normalizeGeminiImageGenerationModelId(v2ModelId) : v2ModelId, commandAttachments }
      const result = await submitGenerationV2EditResend(v2Route, v2Route.kind === 'openrouter_images'
        ? { ...common, prompt: newText, requestedProviderTag: null }
        : v2Route.kind === 'gemini_interactions_image'
          ? { ...common, prompt: newText }
        : { ...common, userBody: newText,
            ...(compatibleSelection ? { providerInstanceId: compatibleSelection.providerInstanceId, extraBody: compatibleSelection.extraBody } : {}),
            ...(endpointProfileId === null ? {} : { endpointProfileId }) })
      if (!result.ok) throw new Error(result.code)
      questionEditSession.value = null
      try {
        generationV2ComposerDraft.value = await clearCommittedGenerationV2ComposerDraft({ conversationId: convoId,
          expectedRevision: composerDraft.revision })
        draft.value = generationV2ComposerDraft.value.draftText
        await refreshDraftAttachmentViewModels()
      } catch (error) {
        if (shouldLogDebug()) console.warn('[ui-app] COMMITTED_V2_EDIT_RESEND_DRAFT_CLEAR_FAILED')
      }
      if (activeConvoId.value === sourceConversationId) await refreshBranchesForActiveConvo()
      const shouldFollow = navigationRevision.value === sourceNavigationRevision &&
        activeConvoId.value === sourceConversationId && activeBranchId.value === sourceBranchId
      if (shouldFollow) {
        activeBranchId.value = result.branch.branchId
        resetCandidatesCache()
        await refreshRenderableBranchView(result.branch.branchId)
      }
      if (!compatibleSelection) void recordRecentModelUsage(v2ModelId, v2ProviderId)
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : 'GENERATION_V2_EDIT_RESEND_FAILED'
    }
  }

  const retryReplaceUiDebugOnce = new Set<string>()

  function canRetryReplaceInUi(questionId: string, answerRootId: string): boolean {
    const qid = String(questionId ?? '').trim()
    const ar = String(answerRootId ?? '').trim()
    if (!qid || !ar) return false

    const debug = isUiDebugEnabled()
    const baseKey = `${qid}:${ar}`
    const logBlock = (reason: string, data: Record<string, unknown>) => {
      if (!debug) return
      const k = `${baseKey}:${reason}`
      if (retryReplaceUiDebugOnce.has(k)) return
      retryReplaceUiDebugOnce.add(k)
      console.warn('[ui-app] canRetryReplaceInUi blocked', { reason, ...data })
    }

    const lastQ = questionTurnOrder.value.length > 0 ? questionTurnOrder.value[questionTurnOrder.value.length - 1] : null
    if (lastQ !== qid) {
      logBlock('not_last_question', { qid, lastQ, orderLen: questionTurnOrder.value.length })
      return false
    }

    const chosen = turnFiltersByQuestionId.value.get(qid)?.chosenAnswerRootId
    if (chosen !== ar) {
      logBlock('choice_mismatch', { qid, chosen, ar })
      return false
    }

    const tipId = activeBranch.value?.headMessageId
    // Tip should be within this answer group. If we can't resolve tip meta from the current projection,
    // defer strict validation to the backend (UI keeps the button enabled).
    if (tipId) {
      const tipMeta = messageMetaById.value.get(tipId)
      const tipAnswerRoot = tipMeta?.answerRootId ?? null
      // If we can't resolve head's answer root from the current projection, defer strict validation to the backend.
      if (tipMeta && tipAnswerRoot && tipId !== ar && tipAnswerRoot !== ar) {
        logBlock('head_not_within_answer_group', { qid, ar, tipId, tipAnswerRoot })
        return false
      }
    }

    return true
  }

  function generationV2RouteForProvider(providerId: RuntimeProviderId, modelId?: string): GenerationV2Route {
    switch (providerId) {
      case 'openrouter': return { kind: 'openrouter_chat' }
      case 'openai_responses': return { kind: 'openai_responses' }
      case 'anthropic_messages': return { kind: 'anthropic' }
      case 'deepseek': return { kind: 'deepseek' }
      case 'google_ai_studio': {
        const image = resolveImageGenerationConfigForRequest(GOOGLE_AI_STUDIO_PROVIDER_KEY)
        if (!image) return { kind: 'gemini_generate_content' }
        const normalizedModelId = normalizeGeminiImageGenerationModelId(modelId)
        if (isGeminiInteractionsImageModelIdV1(normalizedModelId)) return { kind: 'gemini_interactions_image' }
        if (isKnownGeminiImageGenerationModel(normalizedModelId)) throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_MODEL_UNVERIFIED')
        return { kind: 'gemini_generate_content' }
      }
      case 'lm_studio': return { kind: 'lmstudio_openresponses' }
      case 'local_endpoint': return { kind: 'generic_local_openai_chat' }
      case 'ollama_local': return { kind: 'ollama_chat' }
      default: throw new Error('GENERATION_V2_PROVIDER_ROUTE_UNAVAILABLE')
    }
  }

  function generationV2RouteForPersistedAnswer(answer: Readonly<{ protocolContractId: string }>): GenerationV2Route {
    switch (answer.protocolContractId) {
      case 'openrouter-chat-completions-v1': return { kind: 'openrouter_chat' }
      case 'openrouter-images-v1': return { kind: 'openrouter_images' }
      case 'openai-responses-v1': return { kind: 'openai_responses' }
      case 'anthropic-messages-2023-06-01': return { kind: 'anthropic' }
      case 'deepseek-stable-chat-v1': return { kind: 'deepseek' }
      case 'gemini-generate-content-v1beta': return { kind: 'gemini_generate_content' }
      case 'gemini-interactions-v1beta': return { kind: 'gemini_interactions_image' }
      case 'openai_chat_compatible': return { kind: 'openai_chat_compatible' }
      case 'lmstudio-openresponses': return { kind: 'lmstudio_openresponses' }
      case 'generic-local-openai-chat-completions': return { kind: 'generic_local_openai_chat' }
      case 'ollama-chat-v1': return { kind: 'ollama_chat' }
      default: throw new Error('GENERATION_V2_PERSISTED_OPERATION_ROUTE_UNAVAILABLE')
    }
  }

  async function onRetryAnswer(questionId: string, currentAnswerRootId: string, mode: 'replace' | 'as_new') {
    if (isRunning.value || isDraftInteractionLocked.value || activeAssistantMessageId.value) return
    const branch = activeBranch.value
    const qid = String(questionId ?? '').trim()
    const current = String(currentAnswerRootId ?? '').trim()
    const view = generationV2BranchView.value
    const turn = view?.turns.find((item) => item.questionId === qid)
    const answer = turn?.answers.find((item) => item.answerRootId === current)
    if (!branch?.id || !qid || !current || !turn || !answer || turn.chosenAnswerRootId !== current ||
        answer.status === 'streaming' || !view?.headMessageId ||
        (mode === 'replace' && branch.headMessageId !== current)) return
    loadError.value = null
    try {
      const operationId = crypto.randomUUID()
      const sourceNavigationRevision = navigationRevision.value
      const sourceConversationId = view.conversationId
      const sourceBranchId = view.branchId
      const result = await submitGenerationV2Retry(generationV2RouteForPersistedAnswer(answer), {
        actionKind: mode === 'replace' ? 'retry_replace' : 'retry_as_new',
        operationId,
        clientActionId: operationId,
        sourceBranchId: branch.id,
        questionId: qid,
        sourceAnswerId: current,
        expectedHeadMessageId: view.headMessageId,
      })
      if (!result.ok) throw new Error(result.code)
      invalidateMessageCandidateNavigation()
      if (activeConvoId.value === sourceConversationId) await refreshBranchesForActiveConvo()
      const shouldFollow = navigationRevision.value === sourceNavigationRevision &&
        activeConvoId.value === sourceConversationId && activeBranchId.value === sourceBranchId
      if (shouldFollow) {
        activeBranchId.value = result.branch.branchId
        resetCandidatesCache()
        await refreshRenderableBranchView(result.branch.branchId)
      }
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : String(error)
      await refreshRenderableBranchView(branch.id)
    }
  }

  const onRetryReplaceAnswer = (questionId: string, currentAnswerRootId: string) =>
    onRetryAnswer(questionId, currentAnswerRootId, 'replace')

  const onRetryAnswerAsNew = (questionId: string, currentAnswerRootId: string) =>
    onRetryAnswer(questionId, currentAnswerRootId, 'as_new')

  async function onToggleQuestionExclude(questionId: string) {
    const bid = activeBranchId.value
    if (!bid) return
    const current = turnFiltersByQuestionId.value.get(questionId)
    if (current?.questionMode === 'exclude') {
      await clearGenerationV2ContextFilter({ branchId: bid, targetType: 'question', targetId: questionId })
    } else {
      await setGenerationV2ContextFilter({ branchId: bid, targetType: 'question', targetId: questionId, mode: 'exclude' })
    }
    await refreshTurnFilters(bid)
  }

  async function onToggleAnswerExclude(questionId: string, answerRootId: string) {
    const bid = activeBranchId.value
    if (!bid) return
    const current = turnFiltersByQuestionId.value.get(questionId)
    if (!current || current.chosenAnswerRootId !== answerRootId) return
    if (current.lockedByQuestionExclude) return

    if (current.answerMode === 'exclude') {
      await clearGenerationV2ContextFilter({ branchId: bid, targetType: 'answer', targetId: answerRootId })
    } else {
      await setGenerationV2ContextFilter({ branchId: bid, targetType: 'answer', targetId: answerRootId, mode: 'exclude' })
    }
    await refreshTurnFilters(bid)
  }

  onMounted(async () => {
    isReady.value = false
    loadError.value = null
    readExperimentalProviderChatStorage()

    if (!window.generationV2) {
      isReady.value = true
      loadError.value = 'Missing Generation Compiler V2 bridge (run in Electron via `npm run electron:dev`)'
      return
    }

    try {
      // 基线同步：先加载所有数据
      const defaultWorkspace = await ensureGenerationV2DefaultWorkspace()
      let template = await getSystemChatTemplate()
      const startupReset = template.settings.startupTemplateReset
      if (startupReset.modelConfig || startupReset.draftAttachments) {
        template = await resetSystemChatTemplate({
          templateConversationId: template.conversation.id,
          expectedTemplateRevision: template.conversation.templateRevision,
          resetModelConfig: startupReset.modelConfig,
          resetDraftAttachments: startupReset.draftAttachments,
        })
      }
      systemTemplateSnapshot.value = template
      await reloadGenerationV2ConversationAuthorities(template.conversation.id)
      await refreshProjects()
      await refreshConvos()
      const startupNavigation = template.settings.startupNavigation
      if (startupNavigation === 'projects_only') {
        projectsOnlyWorkspace.value = true
        activeConvoId.value = null
        activeBranchId.value = null
      } else if (startupNavigation === 'restore_last_formal') {
        const lastFormalConversationId = await getLastFormalConversationId()
        projectsOnlyWorkspace.value = false
        activeConvoId.value = lastFormalConversationId ?? template.conversation.id
        activeBranchId.value = lastFormalConversationId === null ? template.conversation.branchId : null
      } else {
        projectsOnlyWorkspace.value = false
        activeProjectId.value = template.conversation.projectId
        activeConvoId.value = template.conversation.id
        activeBranchId.value = template.conversation.branchId
      }
      if (defaultWorkspace.conversationId !== template.conversation.id ||
          defaultWorkspace.branchId !== template.conversation.branchId) {
        throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
      }
      await refreshGlobalReasoningPrefs()
      await refreshGlobalReasoningPanelDefaultExpanded()
      await refreshGlobalReasoningPanelAutoCollapseAfterReasoning()
      await refreshGlobalWebSearchDefaults()
      await refreshGlobalGenerationParamsDefaults()
      await refreshGlobalUserMessageRenderDefault()
      await refreshGlobalImageGenerationDefault()
      await refreshDfcAttachmentDefaults()
      if (localEndpointChatConfig.value.enabled) {
        try {
          await ensureGenerationV2GenericLocalProfileFromSavedSettings()
        } catch (error) {
          if (shouldLogDebug()) console.warn('[ui-app] V2_GENERIC_LOCAL_PROFILE_SYNC_FAILED')
        }
      }
      if (lmStudioChatConfig.value.enabled) {
        try {
          await ensureGenerationV2LmStudioProfileFromSavedSettings()
        } catch (error) {
          if (shouldLogDebug()) console.warn('[ui-app] V2_LM_STUDIO_PROFILE_SYNC_FAILED')
        }
      }
      handleGenerationV2OllamaSettingsUpdated()
      reasoningDisplayMode.value = await getChatReasoningDisplayMode()
      try {
        await loadTranscriptForActiveConvo()
      } catch (error) {
        if (startupNavigation !== 'restore_last_formal' ||
            activeConvoId.value === template.conversation.id ||
            !(error instanceof Error) ||
            error.message !== 'GENERATION_V2_CONVERSATION_BRANCH_MISSING') throw error
        activeConvoId.value = template.conversation.id
        activeBranchId.value = template.conversation.branchId
        await loadTranscriptForActiveConvo()
      }
      await restoreDraftForActiveScope()

      assertInvariants() // Stable boundary: initial load complete
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    } finally {
      isReady.value = true
    }
  })

  onMounted(() => {
    unsubscribeFileTypeDetectionUpdated=onGenerationV2ComposerFileTypeDetectionUpdated((event)=>{
      const active=activeConvoId.value
      if(!active)return
      const draftValue=generationV2ComposerDraft.value
      const belongs=event.conversationId===active||draftValue?.attachments.some((attachment)=>
        attachment.kind==='managed_file'&&attachment.assetRevisionId===event.assetRevisionId)===true
      if(!belongs)return
      void refreshDraftAttachmentViewModels().catch((error)=>{
        composerSendPlanCanProceed.value=false
        composerSendPlanBlockingSummary.value=`GENERATION_V2_FILE_DETECTION_REFRESH_FAILED: ${error instanceof Error?error.message:String(error)}`
      })
    })
  })

  onMounted(() => {
    window.addEventListener('settings:reasoningPrefsUpdated', handleGlobalReasoningPrefsUpdated)
    window.addEventListener('settings:reasoningPanelDefaultExpandedUpdated', handleGlobalReasoningPanelDefaultExpandedUpdated)
    window.addEventListener('settings:reasoningPanelAutoCollapseAfterReasoningUpdated', handleGlobalReasoningPanelAutoCollapseAfterReasoningUpdated)
    window.addEventListener('settings:userMessageRenderDefaultUpdated', handleGlobalUserMessageRenderDefaultUpdated)
    window.addEventListener('settings:webSearchDefaultsUpdated', handleGlobalWebSearchDefaultsUpdated)
    window.addEventListener('settings:generationParamsDefaultsUpdated', handleGlobalGenerationParamsDefaultsUpdated)
    window.addEventListener('settings:imageGenerationDefaultUpdated', handleGlobalImageGenerationDefaultUpdated)
    window.addEventListener('settings:localEndpointTextChatUpdated', handleGenerationV2GenericLocalSettingsUpdated)
    window.addEventListener('settings:lmStudioLocalProviderUpdated', handleGenerationV2LmStudioSettingsUpdated)
    window.addEventListener('settings:ollamaLocalProviderUpdated', handleGenerationV2OllamaSettingsUpdated)
    addExperimentalProviderChatEventListeners()
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handlePageHide)
  })

  watch(
    () => {
      const selection = canonicalSendSelection()
      return selection?.routeSelection.kind === 'provider_model' && selection.providerId === 'ollama_local'
        ? selection.modelId : null
    },
    (modelId) => {
      if (modelId) handleGenerationV2OllamaSettingsUpdated()
    },
    { immediate: true },
  )

  onMounted(() => {
    if (diagnosticsFlags.perf) {
      const logger = isDev
        ? (snapshot: Record<string, unknown>) => {
            diagnosticsBridge?.setPerfSnapshot(snapshot)
            diagnosticsLogger.log('perf', snapshot)
          }
        : undefined
      stopPerfReporter = startPerfReporter({ intervalMs: 1000, enabled: true, ...(logger ? { logger } : {}) })
    }
    if (diagnosticsFlags.refAudit) {
      refAuditTimer = setInterval(() => {
        const ids = transcriptMessageIds.value
        if (ids.length === 0) return

        const now = Date.now()

        const idsSet = new Set(ids)
        for (const id of ids) {
          if (!refAuditSeenAt.has(id)) refAuditSeenAt.set(id, now)
        }
        for (const id of refAuditSeenAt.keys()) {
          if (!idsSet.has(id)) {
            refAuditSeenAt.delete(id)
            refAuditCache.delete(id)
          }
        }

        if (lastTranscriptIdsRef === ids) idsRefStableCount += 1
        else idsRefChangedCount += 1
        lastTranscriptIdsRef = ids

        const excludeId = activeAssistantMessageId.value ?? activeCursorMessageId.value
        const candidates = excludeId ? ids.filter((id) => id !== excludeId) : ids.slice()
        const eligibleCandidates = candidates.filter((id) => {
          const seenAt = refAuditSeenAt.get(id)
          return typeof seenAt === 'number' && now - seenAt >= refAuditRecentWindowMs
        })
        const recentExcluded = candidates.length - eligibleCandidates.length
        const sampleSize = Math.min(20, eligibleCandidates.length)
        if (sampleSize === 0) return

        const messagesById = transcriptMessagesById.value as Record<string, MessageVM | undefined>
        let stable = 0
        let changed = 0

        for (let i = 0; i < sampleSize; i += 1) {
          const idx = Math.floor(Math.random() * eligibleCandidates.length)
          const id = eligibleCandidates[idx]
          const current = messagesById[id]
          if (!current) continue
          const prev = refAuditCache.get(id)
          if (prev && prev === current) stable += 1
          else if (prev && prev !== current) {
            changed += 1
            refAuditSeenAt.set(id, now)
          }
          refAuditCache.set(id, current)
        }

        const total = stable + changed
        const stableRatio = total > 0 ? Math.round((stable / total) * 1000) / 1000 : 1
        const idsRefChangeRate = idsRefChangedCount + idsRefStableCount > 0
          ? Math.round((idsRefChangedCount / (idsRefChangedCount + idsRefStableCount)) * 1000) / 1000
          : 0

        const refAuditSnapshot = {
          idsLength: ids.length,
          sampleSize,
          recentExcluded,
          stable,
          changed,
          stableRatio,
          idsRefChanged: idsRefChangedCount,
          idsRefStable: idsRefStableCount,
          idsRefChangeRate,
        }

        if (isDev) {
          diagnosticsBridge?.setRefAuditSnapshot(refAuditSnapshot)
        }

        diagnosticsLogger.log('ref-audit', refAuditSnapshot)
      }, 1000)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
  })

  let unsubscribeGenerationV2Runtime: (() => void) | null = null
  let generationV2RuntimeRefreshTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleCurrentRuntimeRefresh(branchId: string) {
    if (generationV2RuntimeRefreshTimer) return
    generationV2RuntimeRefreshTimer = setTimeout(() => {
      generationV2RuntimeRefreshTimer = null
      if (activeBranchId.value === branchId) void refreshRenderableBranchView(branchId)
    }, 40)
  }

  onMounted(() => {
    unsubscribeGenerationV2Runtime = subscribeGenerationV2Runtime((update: GenerationV2RuntimeUpdate) => {
      if (update.type === 'sync_error') {
        console.error('[ui-app] generation V2 runtime synchronization failed', {
          operationId: update.operationId,
          code: update.code,
        })
        loadError.value = update.code
        return
      }
      const snapshot = update.snapshot
      const entry = branchRuntimeCache.upsert(snapshot, activeBranchId.value)
      branchRuntimeCacheRevision.value += 1
      patchBranch(snapshot.binding.branchId, { updatedAt: snapshot.updatedAtMs })
      const current = activeBranchId.value === snapshot.binding.branchId
      const applied = current && applyBranchRuntimeOverlayToState(snapshot.binding.branchId)
      if (update.type === 'event' && update.event.payload.type === 'reasoning_detail') {
        const detail = update.event.payload.detail
        const detailType = typeof detail.type === 'string' ? detail.type : null
        recordReasoningProjectionTrace({
          stage: applied ? 'reducer_applied' : 'projection_received',
          operationId: update.event.operationId,
          answerRootId: snapshot.binding.targetAnswerId,
          projectionType: 'reasoning_detail',
          detailType,
          activeBranchId: activeBranchId.value,
          viewBranchId: generationV2BranchView.value?.branchId ?? null,
          answerKnownInView: applied,
          rawDetailCount: entry.reasoning.length,
          reasoningVersion: applied
            ? (state.value.entities?.messagesById?.[snapshot.binding.targetAnswerId]?.reasoningVersion ?? 0)
            : 0,
          messagePresentAfter: applied,
          transcriptContainsAnswer: state.value.runMessageIds[snapshot.binding.branchId]
            ?.includes(snapshot.binding.targetAnswerId) === true,
        })
      }
      if (!current) return
      if (!applied || snapshot.status !== 'generating' || (update.type === 'event' &&
          update.event.payload.type === 'image_output')) {
        scheduleCurrentRuntimeRefresh(snapshot.binding.branchId)
      }
    })
  })

  onUnmounted(() => {
    unsubscribeFileTypeDetectionUpdated?.()
    unsubscribeFileTypeDetectionUpdated=null
    unregisterCatalogSelectionCommand()
    unsubscribeCatalogRuntimeStore()
    branchProjectionRefreshCoordinator.invalidate()
    transcriptRefreshToken.value += 1
    void flushDraftPersistence()
    window.removeEventListener('settings:reasoningPrefsUpdated', handleGlobalReasoningPrefsUpdated)
    window.removeEventListener('settings:reasoningPanelDefaultExpandedUpdated', handleGlobalReasoningPanelDefaultExpandedUpdated)
    window.removeEventListener('settings:reasoningPanelAutoCollapseAfterReasoningUpdated', handleGlobalReasoningPanelAutoCollapseAfterReasoningUpdated)
    window.removeEventListener('settings:userMessageRenderDefaultUpdated', handleGlobalUserMessageRenderDefaultUpdated)
    window.removeEventListener('settings:webSearchDefaultsUpdated', handleGlobalWebSearchDefaultsUpdated)
    window.removeEventListener('settings:generationParamsDefaultsUpdated', handleGlobalGenerationParamsDefaultsUpdated)
    window.removeEventListener('settings:imageGenerationDefaultUpdated', handleGlobalImageGenerationDefaultUpdated)
    window.removeEventListener('settings:localEndpointTextChatUpdated', handleGenerationV2GenericLocalSettingsUpdated)
    window.removeEventListener('settings:lmStudioLocalProviderUpdated', handleGenerationV2LmStudioSettingsUpdated)
    window.removeEventListener('settings:ollamaLocalProviderUpdated', handleGenerationV2OllamaSettingsUpdated)
    removeExperimentalProviderChatEventListeners()
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('beforeunload', handlePageHide)
    unsubscribeGenerationV2Runtime?.()
    unsubscribeGenerationV2Runtime = null
    if (generationV2RuntimeRefreshTimer) clearTimeout(generationV2RuntimeRefreshTimer)
    generationV2RuntimeRefreshTimer = null

    diagnosticsBridge?.dispose()

    if (stopPerfReporter) {
      stopPerfReporter()
      stopPerfReporter = null
    }
    if (refAuditTimer) {
      clearInterval(refAuditTimer)
      refAuditTimer = null
    }
    if (thinkingTimer) {
      clearInterval(thinkingTimer)
      thinkingTimer = null
    }
    if (attachmentFeedbackTimer.value) {
      clearTimeout(attachmentFeedbackTimer.value)
      attachmentFeedbackTimer.value = null
    }
    clearDraftSendPlanRefreshTimer()
    clearHistoryIncompatibleRefreshTimer()
    clearHistoryAttachmentRefreshTimer()
    clearDraftAttachmentParsingPollTimer()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    if (enableEventScheduler) {
      eventScheduler.flushAll('dispose')
      eventScheduler.disposeAll()
    }
  })

  onMounted(() => {
    void refreshModelLists()
  })

  const lastTranscriptSig = ref('')
  watch(
    transcriptMessageIds,
    (ids) => {
      if (!shouldLogDebug()) return
      const uniq = new Set(ids)

      const sig = `${runId.value ?? ''}:${ids.length}:${uniq.size}:${ids.slice(-6).join(',')}`
      if (sig === lastTranscriptSig.value) return
      lastTranscriptSig.value = sig

      if (ids.length !== uniq.size) {
        const seen = new Set<string>()
        const dupes: string[] = []
        for (const id of ids) {
          if (seen.has(id)) dupes.push(id)
          else seen.add(id)
        }
        console.warn('[ui-app] transcript has duplicate messageIds (Vue keys unstable)', { runId: runId.value, dupes, ids })
      }
    },
    { deep: false }
  )

  return {
    isReady,
    loadError,
    convoListItems,
    activeConvoId,
    workspaceMode,
    activeProjectId,
    inboxId,
    projectListItems,
    openSearchModal,
    onSelectProject,
    onOpenProjectWebSearchSettings,
    onCreateProject,
    onRenameProject,
    onDeleteProject,
    onSelectConvo,
    onCreateConvo,
    onResetSystemTemplate,
    refreshConvos,
    loadMoreConvos,
    hasMoreConversations,
    onRenameConvo,
    onDeleteConvo,
    onMoveConvoToProject,
    onBulkDeleteConvos,
    onBulkMoveConvosToProject,
    searchModalOpen,
    searchProjectOptions,
    searchConvoOptions,
    closeSearchModal,
    onSelectSearchHit,
    showReasoningPanel,
    reasoningDisplayMode,
    reasoningPanelDefaultExpanded: globalReasoningPanelDefaultExpanded,
    reasoningPanelAutoCollapseAfterReasoning: globalReasoningPanelAutoCollapseAfterReasoning,
    reasoningInlineMode,
    reasoningRailMode,
    rightRailOpen,
    rightRailCanShowReasoning,
    closeRightRailPanel,
    toggleConsolePanel,
    rightRailView,
    effectiveRightRailView,
    runVM,
    isRunning,
    activeTitle,
    branches,
    hasMoreBranches,
    activeBranchId,
    onSelectBranch,
    loadMoreBranches,
    getBranchRuntimeStatus,
    activeBranch,
    onForkFromHead,
    onDeleteActiveBranch,
    openSessionWebSearchSettings,
    sessionWebSearchToolbarLabel,
    openSettings,
    cycleUserMessageRenderMode,
    userMessageRenderModeLabel,
    canToggleReasoningPanel,
    onToggleReasoningPanelState,
    onOpenReasoningDisplayForMessage,
    normalizedErrorSummary,
    normalizedErrorActionHint,
    copyErrorDetails,
    transcriptMessageIds,
    transcriptMessagesById,
    hasEarlierTranscript,
    loadEarlierTranscript,
    getReasoningArtifactsForMessage,
    activeCursorMessageId,
    isTurnExcludedForMessage,
    onSelectCursor,
    userMessageRenderPolicy,
    toErrorPanelView,
    inFlightEnvelopeIds,
    errorEnvelopeUnavailableIds,
    requestErrorEnvelope,
    lastAssistantMessageId,
    lastAssistantThinkingLabel,
    getUserMessageRawText,
    copyUserMessageRaw,
    onToggleQuestionExclude,
    turnFiltersByQuestionId,
    activeAssistantMessageId,
    isAnswerGroupStreamingForQuestion,
    onRegenerateFromQuestion,
    openQuestionEdit,
    getQuestionPagerForQuestion,
    onMessageCandidateShift,
    isAnswerRootMessage,
    getAssistantVisibleText,
    copyAssistantMessage,
    hasAssistantCitations,
    chosenQuestionIdForAnswerRootMessage,
    getAssistantImageBlockCount,
    onToggleAnswerExclude,
    canRetryReplaceInUi,
    onRetryReplaceAnswer,
    onRetryAnswerAsNew,
    getCandidatePager,
    isMessageCandidateLoading,
    questionIdForMessage,
    lastAssistantReasoningView,
    lastAssistantReasoningVersion,
    lastAssistantIsStreaming,
    lastAssistantMessage,
    draft,
    draftAttachmentViewModels,
    selectedDraftAttachmentDetails,
    composerCanSend,
    sendButtonMode,
    composerSendPlanStatus,
    composerSendPlanLoading,
    composerSendGateBlockedReason,
    composerSendGateWarningReason,
    isDraftInteractionLocked,
    attachmentConfirmationSession,
    attachmentConfirmationVisible,
    attachmentConfirmationCollapsedBannerVisible,
    attachmentConfirmationHistoryLocatorVisible,
    attachmentConfirmationHistoryLocatorLabel,
    openAttachmentConfirmationPanel,
    collapseAttachmentConfirmationPanel,
    closeAttachmentConfirmationByCancel,
    confirmAttachmentConfirmationSession,
    toggleAttachmentConfirmationHistorySection,
    toggleAttachmentConfirmationCurrentSection,
    setAttachmentConfirmationHistoryExcludeAll,
    setAttachmentConfirmationCurrentDecision,
    setAttachmentConfirmationCurrentDecisionForAll,
    locateAttachmentConfirmationHistoryAll,
    locateAttachmentConfirmationHistoryByAttachmentId,
    navigateAttachmentConfirmationHistory,
    closeAttachmentConfirmationLocatorBar,
    historyIncompatibleAttachmentSummary,
    activeHistoryIncompatibleAttachmentId,
    historyAttachmentViewModelsByMessageId,
    onReviewHistoryIncompatibleAttachments,
    onNavigateHistoryIncompatibleAttachments,
    attachmentFeedbackTone,
    attachmentFeedbackMessage,
    attachmentUrlDialogOpen,
    attachmentUrlDraft,
    attachmentUrlRetentionMode,
    composerImageInputSupported,
    composerImageInputSupportReason,
    activeSessionConfig,
    openRouterChatConfig,
    lmStudioChatConfig,
    ollamaChatConfig,
    localEndpointChatConfig,
    openAIResponsesChatConfig,
    googleAIStudioChatConfig,
    anthropicChatConfig,
    deepSeekChatConfig,
    openAIResponsesModelAvailabilityStatus,
    googleAIStudioModelAvailabilityStatus,
    anthropicModelAvailabilityStatus,
    deepSeekModelAvailabilityStatus,
    requestedReasoningEffort,
    requestedReasoningExclude,
    modelCatalogForPicker,
    providerModelPickerSources,
    showHiddenModelsInPickers,
    modelCatalogNotice,
    modelPrefsScopeForUi,
    activeSessionGenerationParamsLayer,
    activeSessionGenerationParamsResolved,
    sessionGenerationParamsQuickSaving,
    sessionWebSearchSettingsSaving,
    activeSessionWebSearchLayer,
    activeSessionWebSearchResolved,
    sessionWebSearchQuickSaving,
    imageGenerationState,
    imageGenerationSupported,
    imageGenerationFollowDefault,
    selectedModelImageCapabilityClass,
    imageGenerationSupportHint,
    openRouterImageEndpointSelection,
    openRouterImageEndpointSelectionLoading,
    openRouterImageEndpointSelectionError,
    refreshOpenRouterImageEndpointSelection,
    chooseOpenRouterImageEndpoint,
    updateOpenRouterImageEndpointFreshness,
    onUpdateRouteSelection,
    onUpdateReasoningEnabled,
    onUpdateReasoningEffortLevel,
    onUpdateReasoningPanelDefaultExpanded,
    onUpdateReasoningPanelAutoCollapseAfterReasoning,
    onUpdateWebSearchEnabled,
    onUpdateWebSearchLevel,
    onUpdateImageGenerationEnabled,
    onUpdateImageGenerationResolution,
    onUpdateImageGenerationAspectRatio,
    onUpdateReasoningDisplayMode,
    onComposerUpdateGenerationParamsLayer,
    onComposerUpdateWebSearchLayer,
    onUpdateImageGeneration,
    onUpdateImageGenerationFollowDefault,
    onUpdateOpenRouterChatEnabled,
    onUpdateLMStudioChatEnabled,
    onUpdateLMStudioEndpointUrl,
    onUpdateLMStudioChatMode,
    onUpdateLMStudioOpenAICompatiblePreferredEndpoint,
    onUpdateLMStudioNativeRestControl,
    onClearLMStudioChat,
    onUpdateOllamaChatEnabled,
    onUpdateOllamaEndpointUrl,
    onUpdateOllamaChatMode,
    onUpdateOllamaNativeRestPreferredEndpoint,
    onUpdateOllamaOpenAICompatiblePreferredEndpoint,
    onUpdateOllamaProfileCapability,
    onUpdateOllamaNativeControl,
    onClearOllamaChat,
    onUpdateLocalEndpointChatEnabled,
    onUpdateLocalEndpointChatUrl,
    onClearLocalEndpointChat,
    onUpdateOpenAIResponsesChatEnabled,
    onClearOpenAIResponsesChat,
    onRefreshOpenAIResponsesModels,
    onUpdateGoogleAIStudioChatEnabled,
    onClearGoogleAIStudioChat,
    onRefreshGoogleAIStudioModels,
    onUpdateAnthropicChatEnabled,
    onUpdateAnthropicThinkingDisplay,
    onClearAnthropicChat,
    onRefreshAnthropicModels,
    onUpdateDeepSeekChatEnabled,
    onClearDeepSeekChat,
    onRefreshDeepSeekModels,
    onComposerOpenWebSearchSettings,
    onAttachFilesRequested,
    onAttachImagesRequested,
    onAttachUrlRequested,
    handleDropFiles,
    handlePasteAttachment,
    handleRemoveDraftAttachment,
    openDraftAttachmentDetails,
    closeDraftAttachmentDetails,
    updateSelectedDraftAttachmentSendMode,
    updateSelectedDraftAttachmentUrlRetentionMode,
    updateSelectedDraftAttachmentDfcOption,
    saveSelectedDraftAttachmentDfcDefault,
    clearSelectedDraftAttachmentDfcDefault,
    retrySelectedDraftAttachmentPreview,
    openAttachmentUrlDialog,
    closeAttachmentUrlDialog,
    submitAttachmentUrl,
    onSend,
    onAbort,
    settingsOpen,
    closeSettings,
    sessionWebSearchSettingsOpen,
    closeSessionWebSearchSettings,
    sessionGenerationParamsDraft,
    sessionGenerationParamsDraftResolved,
    sessionWebSearchDraft,
    sessionWebSearchDraftResolved,
    sessionWebSearchDraftHint,
    sessionWebSearchSettingsStatus,
    saveSessionWebSearchSettings,
    projectWebSearchSettingsOpen,
    projectWebSearchSettingsTarget,
    closeProjectWebSearchSettings,
    projectGenerationParamsDraft,
    projectGenerationParamsResolved,
    projectWebSearchDraft,
    projectWebSearchResolved,
    projectWebSearchDraftHint,
    projectWebSearchSettingsStatus,
    saveProjectWebSearchSettings,
    projectWebSearchSettingsSaving,
    questionEditSession,
    isQuestionEditMode,
    closeQuestionEdit,
    submitQuestionEdit,
    pendingDeleteQuestionId,
    requestDeleteQuestion,
    cancelDeleteQuestion,
    confirmDeleteQuestion,
  }
}

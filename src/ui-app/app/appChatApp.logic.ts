import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { t, tf } from '@/shared/i18n'
import type { ErrorPanelViewModel } from '@/ui-kit/chat/types'
import type { CompletionOutcome, DomainEvent, MessageState, MessageVM, ReasoningEffort, RequestedReasoningMode, ReasoningPrefs, RootState, StreamEndReason } from '@/next/state/types'
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
  listGenerationV2Conversations,
  listGenerationV2QuestionCandidates,
  listGenerationV2Projects,
  moveGenerationV2Conversation,
  readGenerationV2Branch,
  renameGenerationV2Conversation,
  renameGenerationV2Project,
  selectGenerationV2Answer,
  selectGenerationV2QuestionCandidate,
  setGenerationV2ContextFilter,
  clearGenerationV2ContextFilter,
  truncateGenerationV2BranchFromQuestion,
  listGenerationV2LocalProfiles,
  createGenerationV2LocalProfile,
  listGenerationV2OpenRouterModels,
  getGenerationV2ConversationRoutePreference,
  updateGenerationV2ConversationRoutePreference,
  clearGenerationV2ConversationRoutePreference,
  type GenerationV2BranchView,
  type GenerationV2ConfigLayerView,
  type GenerationV2ConversationRoutePreferenceSnapshot,
  type GenerationV2ConversationRoutePreferenceSelection,
} from '@/next/generation-v2/renderer/generationV2WorkspaceClient'
import { projectGenerationV2BranchForExistingUi } from '@/next/generation-v2/renderer/generationV2BranchProjection'
import { abortGenerationV2, submitGenerationV2EditResend, submitGenerationV2Initial, submitGenerationV2Regenerate, submitGenerationV2Retry, subscribeGenerationV2Projections,
  type GenerationV2Route } from '@/next/generation-v2/renderer/generationV2CommandClient'
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
  DEEPSEEK_OFFICIAL_ENDPOINT_ID,
  DEEPSEEK_OFFICIAL_PROFILE_ID,
  DEEPSEEK_OFFICIAL_PROVIDER_KEY,
  type DeepSeekModelAvailabilityResult,
} from '@/next/provider/deepseek/deepSeekModelSource'
import {
  OPENROUTER_PROVIDER_ID,
  DEFAULT_OPENROUTER_MODEL_ID,
  buildProviderModelKey,
  normalizeChatModelSelection,
  normalizeRuntimeProviderId,
  type ChatModelSelection,
} from '@/next/provider/modelSelection'
import {
  type CurrentRuntimeSelection,
  type RuntimeProviderKey,
} from '@/next/provider/runtimeSelection'
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
  updateGenerationV2ComposerText,
  type GenerationV2ComposerDraft,
} from '@/next/generation-v2/renderer/generationV2ComposerClient'
import { normalizeExtension } from '@/shared/files/fileRules'
import {
  OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  OPENROUTER_CATALOG_RETENTION_MS_KEY,
  OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY,
  isCatalogStatusStale,
  normalizeCatalogAutoSyncPolicy,
  normalizeCatalogFreshnessMs,
  normalizeCatalogRetentionMs,
} from '@/shared/modelCatalog/catalogSyncSettings'

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
import {
  resolveNetworkErrorDisplayMessage,
} from './networkErrorDisplay'

type BranchSummary = Readonly<{ id:string;convoId:string;headMessageId:string|null;name:string|null;
  createdAt:number;updatedAt:number;deletedAt:number|null }>
type BranchCandidate = Readonly<{ answerRootId:string;createdAt:number;status:string }>
type QuestionCandidate = Readonly<{ questionId:string;createdAt:number;status:string }>

/**
 * Architecture boundary (phase: containment):
 * - Keep this module as app-level orchestration only.
 * - Do not add new domain rules here (model capability, send-plan policy, attachment compatibility, provider-specific rules).
 * - Add new domain logic to domain services / client adapters / pure helpers / dedicated composables first.
 * - Changes in this file must be regression-checked across: model switch, draft/history attachment send-plan, preflight gate, and history incompatible navigation.
 * - This module is pending staged split; follow docs/governance/app-chat-app-logic-boundary.md.
 */
export function useAppChatAppLogic() {

  const isReady = ref(false)
  const loadError = ref<string | null>(null)
  const convos = ref<ConvoSummary[]>([])
  const projects = ref<ProjectSummary[]>([])
  const projectCounts = ref<Map<string | null, number>>(new Map())
  const activeProjectId = ref<string | null>(null)
  const inboxId = ref<string | null>(null)
  const activeConvoId = ref<string | null>(null)
  const systemTemplateSnapshot = ref<SystemChatTemplateSnapshot | null>(null)
  const projectsOnlyWorkspace = ref(false)
  const activeBranchId = ref<string | null>(null)
  const branches = ref<BranchSummary[]>([])
  const draft = ref('')
  const reasoningDisplayMode = ref<'inline' | 'rail'>('inline')
  const rightRailOpen = ref(false)
  const rightRailView = ref<'reasoning' | 'console'>('console')
  const pendingDeleteQuestionId = ref<string | null>(null)
  const model = ref(DEFAULT_OPENROUTER_MODEL_ID)
  const requestedReasoningEffort = ref<'auto' | ReasoningEffort>('auto')
  const requestedReasoningExclude = ref(false)
  type DeepSeekModelAvailabilityFailureCode = Extract<DeepSeekModelAvailabilityResult, { ok: false }>['code']
  type DeepSeekModelsBridge = Readonly<{
    listAvailability: (payload?: unknown) => Promise<DeepSeekModelAvailabilityResult>
    syncAvailability: (payload?: unknown) => Promise<Readonly<{ ok: boolean; code?: string }>>
  }>
  type OpenAIModelAvailabilityFailureCode = Extract<OpenAIModelAvailabilityResult, { ok: false }>['code']
  type OpenAIResponsesModelsBridge = Readonly<{
    listAvailability: (payload?: unknown) => Promise<OpenAIModelAvailabilityResult>
    syncAvailability: (payload?: unknown) => Promise<Readonly<{ ok: boolean; code?: string }>>
  }>
  type GeminiModelAvailabilityFailureCode = Extract<GeminiModelAvailabilityResult, { ok: false }>['code']
  type GoogleAIStudioModelsBridge = Readonly<{
    listAvailability: (payload?: unknown) => Promise<GeminiModelAvailabilityResult>
    syncAvailability: (payload?: unknown) => Promise<Readonly<{ ok: boolean; code?: string }>>
  }>
  type AnthropicModelAvailabilityFailureCode = Extract<AnthropicModelAvailabilityResult, { ok: false }>['code']
  type AnthropicModelsBridge = Readonly<{
    listAvailability: (payload?: unknown) => Promise<AnthropicModelAvailabilityResult>
    syncAvailability: (payload?: unknown) => Promise<Readonly<{ ok: boolean; code?: string }>>
  }>
  const openAIResponsesModelAvailabilityLoading = ref(false)
  const openAIResponsesModelAvailabilityResult = ref<OpenAIModelAvailabilityResult | null>(null)
  const googleAIStudioModelAvailabilityLoading = ref(false)
  const googleAIStudioModelAvailabilityResult = ref<GeminiModelAvailabilityResult | null>(null)
  const anthropicModelAvailabilityLoading = ref(false)
  const anthropicModelAvailabilityResult = ref<AnthropicModelAvailabilityResult | null>(null)
  const deepSeekModelAvailabilityLoading = ref(false)
  const deepSeekModelAvailabilityResult = ref<DeepSeekModelAvailabilityResult | null>(null)
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
  const composerSendGateBlockedReason = computed(() => composerSendPlanBlockingSummary.value)
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
    providerId: ChatModelSelection['providerId'] | null
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
  const candidatesCache = ref<Map<string, BranchCandidate[]>>(new Map())
  const generationV2BranchView = shallowRef<GenerationV2BranchView | null>(null)
  const generationV2RoutePreferenceByConversationId = shallowRef<ReadonlyMap<string,
    GenerationV2ConversationRoutePreferenceSnapshot | null>>(new Map())
  const generationV2ConfigByConversationId = shallowRef<ReadonlyMap<string, GenerationV2ConfigLayerView>>(new Map())
  const candidatesEpochGlobal = ref(0)
  const candidatesEpochByQuestionId = ref<Map<string, number>>(new Map())
  const candidatesLoading = ref<Map<string, string>>(new Map())
  const questionCandidatesCache = ref<Map<string, QuestionCandidate[]>>(new Map())
  const questionCandidatesEpochGlobal = ref(0)
  const questionCandidatesEpochBySlot = ref<Map<string, number>>(new Map())
  const questionCandidatesLoading = ref<Map<string, string>>(new Map())

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
    isEventSchedulerEnabled,
  } = useDiagnostics()
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
    [transcriptMessageIds, activeConvoId, activeBranchId, model],
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

  watch(
    () => model.value,
    (next, prev) => {
      openRouterImageEndpointSelection.value = null
      openRouterImageEndpointSelectionError.value = null
      void refreshSelectedModelImageCapability()
      if (prev === undefined || next === prev) return
      if (draftAttachmentRecords.value.length > 0) {
        scheduleDraftSendPlanRefresh()
      }
      scheduleHistoryIncompatibleRefresh()
      scheduleHistoryAttachmentRefresh()
    },
    { immediate: true },
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
  const activeAssistantMessageId = computed(() => activeGenerationV2Answer.value?.status === 'streaming'
    ? activeGenerationV2Answer.value.answerRootId
    : null)
  const isRunning = computed(() => activeGenerationV2Answer.value?.status === 'streaming' ||
    runVM.value?.status === 'requesting' || runVM.value?.status === 'streaming' || runVM.value?.status === 'tool_waiting')

  const {
    lmStudioProviderConfig,
    ollamaProviderConfig,
    openRouterChatConfig,
    lmStudioChatConfig,
    ollamaChatConfig,
    localEndpointChatConfig,
    openAIResponsesChatConfig,
    googleAIStudioChatConfig,
    anthropicChatConfig,
    deepSeekChatConfig,
    currentRuntimeSelection,
    currentRuntimeCapability,
    currentRuntimeStatus,
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
    model,
    isRunning,
    isDraftInteractionLocked,
    normalizeModelKey,
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

  function commitImmediate(runId: string, event: DomainEvent) {
    if (event.type === 'MessageDeltaReasoningDetail') recordDelta(1)
    if (event.type === 'MessageDeltaReasoningDetailBatch') {
      const count = Array.isArray(event.details) ? event.details.length : 0
      if (count > 0) recordDelta(count)
    }
    if ('messageId' in event && typeof event.messageId === 'string') {
      recordUpdatedMessages(1)
    }
    const measureId = beginCommitMeasure()
    const next = applyEventsBatch(state.value, runId, [event])
    state.value = next
    const duration = endCommitMeasure(measureId)
    recordCommit(duration)
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
    completionClass?: string
    phase?: string
    code?: string
    message?: string
    provider?: string
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
      details: envelope ?? null,
    }
  }

  function extractErrorSummaryFromMeta(meta: unknown): ErrorSummary | null {
    const obj = asRecord(meta)
    const raw = obj?.error_summary
    if (!raw || typeof raw !== 'object') return null
    const record = raw as Record<string, unknown>
    const completionClass = typeof record.completionClass === 'string' ? record.completionClass : undefined
    const phase = typeof record.phase === 'string' ? record.phase : undefined
    const code = typeof record.code === 'string' ? record.code : undefined
    const message = typeof record.message === 'string' ? record.message : undefined
    const provider = typeof record.provider === 'string' ? record.provider : undefined
    const networkError = record.networkError
    if (!completionClass && !phase && !code && !message && !provider && networkError === undefined) return null
    return { completionClass, phase, code, message, provider, networkError }
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

  async function syncOpenRouterCatalogOnStartup() {
    const models = window.generationV2?.models
    const store = (globalThis as typeof globalThis & { electronStore?: { get?: (key: string) => Promise<unknown> } }).electronStore
    if (!models || typeof models.status !== 'function' || typeof models.sync !== 'function' || typeof store?.get !== 'function') return
    const [policyValue, freshnessValue, retentionValue] = await Promise.all([
      store.get(OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY),
      store.get(OPENROUTER_CATALOG_FRESHNESS_MS_KEY),
      store.get(OPENROUTER_CATALOG_RETENTION_MS_KEY),
    ])
    const policy = normalizeCatalogAutoSyncPolicy(policyValue)
    if (policy === 'never') return
    const current = await models.status({ providerKey: 'openrouter' }) as Record<string, unknown>
    const stale = current.ok !== true || isCatalogStatusStale({
      status: current.status === 'synced' ? 'synced' : 'not_synced',
      lastSyncAtMs: current.observedAtMs,
      freshnessMs: normalizeCatalogFreshnessMs(freshnessValue),
    })
    if (policy === 'stale_only' && !stale) return
    await models.sync({ providerKey: 'openrouter', timeoutMs: 30_000,
      retentionMs: normalizeCatalogRetentionMs(retentionValue) })
  }

  async function refreshModelLists() {
    try {
      await syncOpenRouterCatalogOnStartup()
      const catalog = await listGenerationV2OpenRouterModels()
      if (!catalog.ok) throw new Error(catalog.code)
      modelCatalogItems.value = catalog.items.map((item) => ({ ...item, name: item.displayName,
        vendor: item.vendor ?? '', status: 'visible' as const, supportedParameters: [...(item.supportedParameters ?? [])],
        inputModalities: [...(item.inputModalities ?? [])], outputModalities: [...(item.outputModalities ?? [])],
        lastSeenSnapshotId: catalog.responseDigest ?? `catalog:${item.syncedAtMs ?? 0}` }))
      openRouterModelModalitiesById.value = new Map(catalog.items.map((item) => [item.modelId,
        Object.freeze({ input: item.inputModalities ?? [], output: item.outputModalities ?? [] })]))
      modelCatalogListStatus.value = catalog.status === 'failed' ? 'failed' : catalog.status === 'syncing' ? 'syncing'
        : catalog.status === 'not_synced' ? 'not_synced' : 'synced'

      if (catalog.items.length === 0) {
        modelCatalogNotice.value = t('errors.modelCatalog.notSynced')
      } else {
        modelCatalogNotice.value = null
      }
      applySelectedModelOverrideForActiveConvo()
      await refreshSelectedModelImageCapability()
    } catch (err) {
      modelCatalogItems.value = []
      openRouterModelModalitiesById.value = new Map()
      modelCatalogListStatus.value = 'failed'
      modelCatalogNotice.value = t('errors.modelCatalog.syncFailed')
      selectedModelImageCapabilityClass.value = null
      selectedModelImageCapabilityReason.value = 'model catalog sync failed.'
      if (shouldLogDebug()) {
        console.warn('[ui-app] REFRESH_MODEL_LISTS_FAILED')
      }
    }
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

  function getOrderedCandidatesOldToNew(questionId: string): BranchCandidate[] | null {
    const cached = candidatesCache.value.get(questionId)
    if (!cached) return null
    return [...cached].reverse()
  }

  function getCandidatePager(questionId: string): Readonly<{ index: number; total: number; canPrev: boolean; canNext: boolean }> | null {
    const ordered = getOrderedCandidatesOldToNew(questionId)
    if (!ordered) return null
    const chosen = turnFiltersByQuestionId.value.get(questionId)?.chosenAnswerRootId
    const total = ordered.length
    if (!chosen || total <= 0) return { index: 0, total: Math.max(0, total), canPrev: false, canNext: false }
    const idx = ordered.findIndex((c) => c.answerRootId === chosen)
    if (idx < 0) return { index: 0, total, canPrev: false, canNext: false }
    return { index: idx, total, canPrev: idx > 0, canNext: idx < total - 1 }
  }

  function getCandidateLoadToken(questionId: string): string {
    const qid = String(questionId ?? '').trim()
    const qEpoch = candidatesEpochByQuestionId.value.get(qid) ?? 0
    return `${candidatesEpochGlobal.value}:${qEpoch}`
  }

  function getQuestionSlotKey(baseMessageId: string | null): string {
    const base = baseMessageId === null ? null : String(baseMessageId ?? '').trim() || null
    return base ?? '__root__'
  }

  function getQuestionCandidateLoadToken(slotKey: string): string {
    const key = String(slotKey ?? '').trim()
    const epoch = questionCandidatesEpochBySlot.value.get(key) ?? 0
    return `${questionCandidatesEpochGlobal.value}:${epoch}`
  }

    async function ensureQuestionCandidatesLoadedForQuestion(questionId: string) {
    const qid = String(questionId ?? '').trim()
    const meta = qid ? messageMetaById.value.get(qid) : null
    if (!qid || !meta || String(meta.role ?? '').trim() !== 'user') return
    await ensureQuestionCandidatesLoadedForSlot(meta.parentId ?? null)
  }

  async function ensureQuestionCandidatesLoadedForSlot(baseMessageId: string | null) {
    const bid = activeBranchId.value
    if (!bid) return

    const slotKey = getQuestionSlotKey(baseMessageId)
    if (questionCandidatesCache.value.has(slotKey)) return

    const token = getQuestionCandidateLoadToken(slotKey)
    if (questionCandidatesLoading.value.get(slotKey) === token) return

    questionCandidatesLoading.value.set(slotKey, token)
    questionCandidatesLoading.value = new Map(questionCandidatesLoading.value)
    try {
      const rows = await listGenerationV2QuestionCandidates(bid, baseMessageId, 200)
      const list: QuestionCandidate[] = rows.map((row) => Object.freeze({
        questionId: row.questionId, createdAt: row.createdAtMs, status: row.status,
      }))

      if (activeBranchId.value !== bid) return
      if (getQuestionCandidateLoadToken(slotKey) !== token) return

      questionCandidatesCache.value.set(slotKey, list)
      questionCandidatesCache.value = new Map(questionCandidatesCache.value)
    } finally {
      if (questionCandidatesLoading.value.get(slotKey) === token) {
        questionCandidatesLoading.value.delete(slotKey)
        questionCandidatesLoading.value = new Map(questionCandidatesLoading.value)
      }
    }
  }

  function getOrderedQuestionCandidatesOldToNew(baseMessageId: string | null): QuestionCandidate[] | null {
    const key = getQuestionSlotKey(baseMessageId)
    const cached = questionCandidatesCache.value.get(key)
    if (!cached) return null
    return [...cached].reverse()
  }

  function getQuestionPagerForQuestion(questionId: string): Readonly<{ index: number; total: number; canPrev: boolean; canNext: boolean }> | null {
    const qid = String(questionId ?? '').trim()
    if (!qid) return null
    const meta = messageMetaById.value.get(qid)
    if (!meta || meta.role !== 'user') return null

    const ordered = getOrderedQuestionCandidatesOldToNew(meta.parentId ?? null)
    if (!ordered) return null
    const total = ordered.length
    if (total <= 0) return { index: 0, total: 0, canPrev: false, canNext: false }

    const idx = ordered.findIndex((c) => c.questionId === qid)
    if (idx < 0) return { index: 0, total, canPrev: false, canNext: false }
    return { index: idx, total, canPrev: idx > 0, canNext: idx < total - 1 }
  }

  function isQuestionSlotLoadingForQuestion(questionId: string): boolean {
    const qid = String(questionId ?? '').trim()
    if (!qid) return false
    const meta = messageMetaById.value.get(qid)
    if (!meta || meta.role !== 'user') return false
    const slotKey = getQuestionSlotKey(meta.parentId ?? null)
    return questionCandidatesLoading.value.has(slotKey)
  }

  function invalidateCandidatesForQuestion(questionId: string) {
    const qid = String(questionId ?? '').trim()
    if (!qid) return

    // Cancel any in-flight fetch and bump epoch so stale async results won't overwrite.
    const nextEpoch = (candidatesEpochByQuestionId.value.get(qid) ?? 0) + 1
    candidatesEpochByQuestionId.value.set(qid, nextEpoch)
    candidatesEpochByQuestionId.value = new Map(candidatesEpochByQuestionId.value)

    if (candidatesLoading.value.has(qid)) {
      candidatesLoading.value.delete(qid)
      candidatesLoading.value = new Map(candidatesLoading.value)
    }

    if (candidatesCache.value.has(qid)) {
      candidatesCache.value.delete(qid)
      candidatesCache.value = new Map(candidatesCache.value)
    }

    if (shouldLogDebug()) {
      console.log('[ui-app] invalidateCandidatesForQuestion', { questionId: qid, epochGlobal: candidatesEpochGlobal.value, questionEpoch: nextEpoch })
    }
  }

  async function ensureCandidatesLoaded(questionId: string) {
    const qid = String(questionId ?? '').trim()
    const bid = activeBranchId.value
    if (!qid || !bid) return
    if (candidatesCache.value.has(qid)) return

    const token = getCandidateLoadToken(qid)
    if (candidatesLoading.value.get(qid) === token) return

    candidatesLoading.value.set(qid, token)
    candidatesLoading.value = new Map(candidatesLoading.value)
    try {
      let view = generationV2BranchView.value
      if (!view || view.branchId !== bid) view = await readGenerationV2Branch(bid)
      const turn = view.turns.find((item) => item.questionId === qid)
      const list: BranchCandidate[] = turn
        ? [...turn.answers]
          .sort((left, right) => right.createdAtMs - left.createdAtMs || right.answerRootId.localeCompare(left.answerRootId))
          .map((answer) => ({ answerRootId: answer.answerRootId, createdAt: answer.createdAtMs, status: answer.status }))
        : []

      // Drop stale async results (regenerate/retry can invalidate cache while a fetch is in-flight).
      if (activeBranchId.value !== bid) {
        if (shouldLogDebug()) console.warn('[ui-app] ensureCandidatesLoaded discard (branch changed)', { questionId: qid, branchId: bid, token })
        return
      }
      if (getCandidateLoadToken(qid) !== token) {
        if (shouldLogDebug()) console.warn('[ui-app] ensureCandidatesLoaded discard (token mismatch)', { questionId: qid, branchId: bid, token })
        return
      }

      if (shouldLogDebug()) {
        console.log('[ui-app] ensureCandidatesLoaded', {
          questionId: qid,
          branchId: bid,
          token,
          candidateCount: list.length,
          candidates: list.map(c => ({ answerRootId: c.answerRootId, status: c.status })),
        })
      }
      candidatesCache.value.set(qid, list)
      candidatesCache.value = new Map(candidatesCache.value)
    } finally {
      if (candidatesLoading.value.get(qid) === token) {
        candidatesLoading.value.delete(qid)
        candidatesLoading.value = new Map(candidatesLoading.value)
      }
    }
  }

      async function refreshTurnFilters(branchId: string) {
    const bid = String(branchId ?? '').trim()
    if (!bid) return
    await refreshRenderableBranchView(bid)
  }

    async function refreshConvos() {
    loadError.value = null
    const filterProjectId = activeProjectId.value
    const projectIds = filterProjectId === null ? projects.value.map((project) => project.id) : [filterProjectId]
    const listed = (await Promise.all(projectIds.map((projectId) => listGenerationV2Conversations(projectId)))).flat()
    convos.value = listed
      .map((conversation) => ({ id: conversation.conversationId, projectId: conversation.projectId,
        title: conversation.title, createdAt: conversation.updatedAtMs, updatedAt: conversation.updatedAtMs }))
      .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
    const active = activeConvoId.value
    const activeIsTemplate = active === systemTemplateSnapshot.value?.conversation.id
    if (active && !activeIsTemplate && !convos.value.some((c) => c.id === active)) {
      activeConvoId.value = convos.value[0]?.id ?? null
    }
    if (!projectsOnlyWorkspace.value && !activeConvoId.value && convos.value.length > 0) activeConvoId.value = convos.value[0].id
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
      [project.id, (await listGenerationV2Conversations(project.id)).length] as const))
    projectCounts.value = new Map(counts)
  }

  async function refreshBranchesForActiveConvo() {
    const convoId = activeConvoId.value
    if (!convoId) {
      branches.value = []
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
      return
    }
    for (const project of projects.value) {
      const conversation = (await listGenerationV2Conversations(project.id))
        .find((item) => item.conversationId === convoId)
      if (conversation) {
        branches.value = conversation.branches.map((branch) => ({ id: branch.branchId, convoId,
          headMessageId: branch.headMessageId, name: branch.name, createdAt: branch.updatedAtMs,
          updatedAt: branch.updatedAtMs, deletedAt: null }))
        return
      }
    }
    branches.value = []
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
    for (const project of projects.value) {
      const conversation = (await listGenerationV2Conversations(project.id))
        .find((item) => item.conversationId === conversationId)
      const branch = conversation?.branches[0]
      if (branch) return { id: branch.branchId, convoId: conversationId, headMessageId: branch.headMessageId,
        name: branch.name, createdAt: branch.updatedAtMs, updatedAt: branch.updatedAtMs, deletedAt: null }
    }
    throw new Error('GENERATION_V2_CONVERSATION_BRANCH_MISSING')
  }

  function resetCandidatesCache() {
    // Invalidate all candidate loads so in-flight requests can't repopulate after resets (e.g. end-of-stream reloads).
    candidatesEpochGlobal.value += 1
    candidatesCache.value = new Map()
    candidatesLoading.value = new Map()
    candidatesEpochByQuestionId.value = new Map()
    questionCandidatesEpochGlobal.value += 1
    questionCandidatesCache.value = new Map()
    questionCandidatesLoading.value = new Map()
    questionCandidatesEpochBySlot.value = new Map()
    if (shouldLogDebug()) {
      console.log('[ui-app] resetCandidatesCache', { answerEpochGlobal: candidatesEpochGlobal.value, questionEpochGlobal: questionCandidatesEpochGlobal.value })
    }
  }

  async function refreshRenderableBranchView(branchId: string) {
    await loadTranscriptForBranch(branchId)
    // Candidate cache can be stale after operations that add/hide candidates (regenerate/retryReplace);
    // for switchCandidate we keep cache.
    for (const qid of turnFiltersByQuestionId.value.keys()) {
      void ensureCandidatesLoaded(qid)
    }
  }

  function patchBranch(branchId: string, patch: Partial<Omit<BranchSummary, 'id'>>) {
    const bid = String(branchId ?? '').trim()
    if (!bid) return
    branches.value = branches.value.map((b) => (b.id === bid ? ({ ...b, ...patch } satisfies BranchSummary) : b))
  }

  async function loadTranscriptForBranch(branchId: string) {
    const bid = String(branchId ?? '').trim()
    if (!bid) return

    const lease = branchProjectionRefreshCoordinator.begin(bid)
    transcriptRefreshToken.value = lease.revision
    const errorFallbacks = captureErrorFallbacks()
    const debug = isUiDebugEnabled()
    if (shouldLogDebug()) {
      console.log('[ui-app] loadTranscriptForBranch: fetching from DB', { branchId: bid, token: lease.revision, debug })
    }
    const v2View = await readGenerationV2Branch(bid)
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
      const runtimeMeta = v2Meta ?? extractRuntimeSelectionFromMessageMeta(m.meta ?? null)
      metaMap.set(m.id, {
        parentId: m.parentId ?? null,
        questionId: m.questionId ?? null,
        answerRootId: m.answerRootId ?? null,
        role: String(m.role ?? '').trim(),
        status: v2Meta?.status === 'cancelled' ? 'aborted' : v2Meta?.status === 'failed' ? 'error' : String(v2Meta?.status ?? m.status ?? 'final'),
        providerId: runtimeMeta.providerId as MessageMetaEntry['providerId'],
        modelId: runtimeMeta.modelId,
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

    // Self-heal: candidate cache may become stale after operations that add/hide candidates
    // (regenerate/retryReplace). If the cached candidate list no longer contains the chosen answer root,
    // drop the cache for that question so the next ensureCandidatesLoaded() re-fetches.
    let invalidated = false
    for (const [qid, t] of projection.turnByQuestionId.entries()) {
      const cached = candidatesCache.value.get(qid)
      if (!cached) continue
      if (cached.some((c) => c.answerRootId === t.chosenAnswerRootId)) continue
      candidatesCache.value.delete(qid)
      invalidated = true
    }
    if (invalidated) candidatesCache.value = new Map(candidatesCache.value)

    // Self-heal: question candidate cache may become stale after question replace (branch_question_hide).
    // If the cached question variants no longer contain the currently-visible question, drop the cache for that slot.
    let qInvalidated = false
    for (const qid of projection.questionTurnOrder) {
      const base = messageMetaById.value.get(qid)?.parentId ?? null
      const slotKey = getQuestionSlotKey(base)
      const cached = questionCandidatesCache.value.get(slotKey)
      if (!cached) continue
      if (cached.some((c) => c.questionId === qid)) continue
      questionCandidatesCache.value.delete(slotKey)
      qInvalidated = true
    }
    if (qInvalidated) questionCandidatesCache.value = new Map(questionCandidatesCache.value)

    for (const qid of projection.turnByQuestionId.keys()) {
      void ensureCandidatesLoaded(qid)
    }

    for (const qid of projection.questionTurnOrder) {
      void ensureQuestionCandidatesLoadedForQuestion(qid)
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
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    activeConvoId.value = convoId
    await loadTranscriptForActiveConvo()
    if (convoId !== systemTemplateSnapshot.value?.conversation.id) {
      await setLastFormalConversationId(convoId)
    }
    assertInvariants() // Stable boundary: conversation switched and refreshed
  }

  async function onSelectBranch(branchId: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    const bid = String(branchId ?? '').trim()
    if (!bid || bid === activeBranchId.value) return
    activeBranchId.value = bid
    resetCandidatesCache()
    await refreshTranscriptLatestOnly()
    assertInvariants() // Stable boundary: branch switched and refreshed
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
    if (isRunning.value) return
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

  const activeTitle = computed(() => getActiveConvoRecord()?.title ?? '')

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
    if (input.resetDraftAttachments) {
      draft.value = ''
      await restoreDraftForActiveScope()
    }
  }

  async function onAbort() {
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
      defaultModelKey: DEFAULT_OPENROUTER_MODEL_ID,
    })
    if (!convo || !generationV2RoutePreferenceByConversationId.value.has(convo.id)) return base
    const preference = generationV2RoutePreferenceByConversationId.value.get(convo.id) ?? null
    const withRoute = preference === null ? Object.freeze({ ...base, model: Object.freeze({
      selectedProviderId: null, selectedModelKey: null, compatibleSelection: null,
    }) }) : (() => {
      const selection = preference.selection
      return Object.freeze({ ...base, model: selection.kind === 'provider_model'
        ? Object.freeze({ selectedProviderId: selection.providerId,
            selectedModelKey: selection.modelId, compatibleSelection: null })
        : Object.freeze({ selectedProviderId: null, selectedModelKey: selection.selection.modelId,
            compatibleSelection: selection.selection }) })
    })()
    const persistedConfig = generationV2ConfigByConversationId.value.get(convo.id)
    if (!persistedConfig || isEmptyGenerationV2SemanticLayer(persistedConfig.semanticLayer)) return withRoute
    const projection = projectGenerationV2SemanticLayerToSessionConfig(
      persistedConfig.semanticLayer,
      withRoute.model.compatibleSelection ? 'local_endpoint' : withRoute.model.selectedProviderId ?? null,
    )
    return mergeChatSessionConfig(withRoute, projection.patch)
  }

  function getActiveSessionConfigSnapshot(): ChatSessionConfig {
    return getChatSessionConfigForConvo(getActiveConvoRecord())
  }

  const activeSessionConfig = computed(() => getActiveSessionConfigSnapshot())
  const workspaceMode = computed<'none' | 'template' | 'conversation'>(() => {
    if (!activeConvoId.value) return 'none'
    return activeConvoId.value === systemTemplateSnapshot.value?.conversation.id ? 'template' : 'conversation'
  })
  const openAIResponsesModelAvailabilityStatus = computed(() => ({
    loading: openAIResponsesModelAvailabilityLoading.value,
    result: openAIResponsesModelAvailabilityResult.value,
  }))
  const googleAIStudioModelAvailabilityStatus = computed(() => ({
    loading: googleAIStudioModelAvailabilityLoading.value,
    result: googleAIStudioModelAvailabilityResult.value,
  }))
  const anthropicModelAvailabilityStatus = computed(() => ({
    loading: anthropicModelAvailabilityLoading.value,
    result: anthropicModelAvailabilityResult.value,
  }))
  const deepSeekModelAvailabilityStatus = computed(() => ({
    loading: deepSeekModelAvailabilityLoading.value,
    result: deepSeekModelAvailabilityResult.value,
  }))

  const providerModelPickerSources = computed<readonly ProviderModelPickerSource[]>(() => [
    {
      providerId: OPENAI_RESPONSES_PROVIDER_KEY,
      providerName: 'OpenAI Responses',
      statusKind: 'not_loaded',
      statusLabel: 'catalog',
      loading: false,
      items: [],
    },
    {
      providerId: GOOGLE_AI_STUDIO_PROVIDER_KEY,
      providerName: 'Google AI Studio',
      statusKind: 'not_loaded',
      statusLabel: 'catalog',
      loading: false,
      items: [],
    },
    {
      providerId: ANTHROPIC_MESSAGES_PROVIDER_KEY,
      providerName: 'Anthropic Messages',
      statusKind: 'not_loaded',
      statusLabel: 'catalog',
      loading: false,
      items: [],
    },
    {
      providerId: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      providerName: 'DeepSeek',
      statusKind: 'not_loaded',
      statusLabel: 'catalog',
      loading: false,
      items: [],
    },
  ])

  async function onRefreshProviderModelPickerSources() {
    await Promise.allSettled([
      onRefreshOpenAIResponsesModels(),
      onRefreshGoogleAIStudioModels(),
      onRefreshAnthropicModels(),
      onRefreshDeepSeekModels(),
    ])
  }

  function getOpenAIResponsesModelsBridge(): OpenAIResponsesModelsBridge | null {
    const bridge = window.generationV2?.models
    return typeof bridge?.listOpenAIResponses === 'function' && typeof bridge.sync === 'function'
      ? { listAvailability: (payload) => bridge.listOpenAIResponses(payload) as Promise<OpenAIModelAvailabilityResult>,
          syncAvailability: (payload) => bridge.sync({ providerKey: 'openai_responses', ...(payload as object ?? {}) }) as Promise<Readonly<{ ok: boolean; code?: string }>> }
      : null
  }

  function buildOpenAIResponsesModelAvailabilityFailure(
    code: OpenAIModelAvailabilityFailureCode,
    message: string,
  ): OpenAIModelAvailabilityResult {
    return {
      ok: false,
      providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
      endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
      profileId: OPENAI_RESPONSES_PROFILE_ID,
      observedAtMs: Date.now(),
      code,
      message,
    }
  }

  async function onRefreshOpenAIResponsesModels() {
    if (openAIResponsesModelAvailabilityLoading.value) return
    const bridge = getOpenAIResponsesModelsBridge()
    if (!bridge) {
      openAIResponsesModelAvailabilityResult.value = buildOpenAIResponsesModelAvailabilityFailure(
        'invalid_payload',
        'OpenAI Responses model availability bridge is unavailable.',
      )
      return
    }

    openAIResponsesModelAvailabilityLoading.value = true
    try {
      const sync = await bridge.syncAvailability({ timeoutMs: 30_000 })
      if (!sync.ok) throw new Error(sync.code ?? 'provider_catalog_sync_failed')
      openAIResponsesModelAvailabilityResult.value = await bridge.listAvailability({ timeoutMs: 30000 })
    } catch {
      openAIResponsesModelAvailabilityResult.value = buildOpenAIResponsesModelAvailabilityFailure(
        'network_error',
        t('errors.network.reason.networkUnknown'),
      )
    } finally {
      openAIResponsesModelAvailabilityLoading.value = false
    }
  }

  function getGoogleAIStudioModelsBridge(): GoogleAIStudioModelsBridge | null {
    const bridge = window.generationV2?.models
    return typeof bridge?.listGoogleAIStudio === 'function' && typeof bridge.sync === 'function'
      ? { listAvailability: (payload) => bridge.listGoogleAIStudio(payload) as Promise<GeminiModelAvailabilityResult>,
          syncAvailability: (payload) => bridge.sync({ providerKey: 'google_ai_studio', ...(payload as object ?? {}) }) as Promise<Readonly<{ ok: boolean; code?: string }>> }
      : null
  }

  function buildGoogleAIStudioModelAvailabilityFailure(
    code: GeminiModelAvailabilityFailureCode,
    message: string,
  ): GeminiModelAvailabilityResult {
    return {
      ok: false,
      providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
      endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID,
      profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
      observedAtMs: Date.now(),
      code,
      message,
    }
  }

  async function onRefreshGoogleAIStudioModels() {
    if (googleAIStudioModelAvailabilityLoading.value) return
    const bridge = getGoogleAIStudioModelsBridge()
    if (!bridge) {
      googleAIStudioModelAvailabilityResult.value = buildGoogleAIStudioModelAvailabilityFailure(
        'invalid_payload',
        'Google AI Studio model availability bridge is unavailable.',
      )
      return
    }

    googleAIStudioModelAvailabilityLoading.value = true
    try {
      const sync = await bridge.syncAvailability({ timeoutMs: 30_000 })
      if (!sync.ok) throw new Error(sync.code ?? 'provider_catalog_sync_failed')
      googleAIStudioModelAvailabilityResult.value = await bridge.listAvailability({ timeoutMs: 30000 })
    } catch {
      googleAIStudioModelAvailabilityResult.value = buildGoogleAIStudioModelAvailabilityFailure(
        'network_error',
        t('errors.network.reason.networkUnknown'),
      )
    } finally {
      googleAIStudioModelAvailabilityLoading.value = false
    }
  }

  function getAnthropicModelsBridge(): AnthropicModelsBridge | null {
    const bridge = window.generationV2?.models
    return typeof bridge?.listAnthropic === 'function' && typeof bridge.sync === 'function'
      ? { listAvailability: (payload) => bridge.listAnthropic(payload) as Promise<AnthropicModelAvailabilityResult>,
          syncAvailability: (payload) => bridge.sync({ providerKey: 'anthropic_messages', ...(payload as object ?? {}) }) as Promise<Readonly<{ ok: boolean; code?: string }>> }
      : null
  }

  function buildAnthropicModelAvailabilityFailure(
    code: AnthropicModelAvailabilityFailureCode,
    message: string,
  ): AnthropicModelAvailabilityResult {
    return {
      ok: false,
      providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
      endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
      profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
      observedAtMs: Date.now(),
      code,
      message,
    }
  }

  async function onRefreshAnthropicModels() {
    if (anthropicModelAvailabilityLoading.value) return
    const bridge = getAnthropicModelsBridge()
    if (!bridge) {
      anthropicModelAvailabilityResult.value = buildAnthropicModelAvailabilityFailure(
        'invalid_payload',
        'Anthropic model availability bridge is unavailable.',
      )
      return
    }

    anthropicModelAvailabilityLoading.value = true
    try {
      const sync = await bridge.syncAvailability({ timeoutMs: 30_000 })
      if (!sync.ok) throw new Error(sync.code ?? 'provider_catalog_sync_failed')
      anthropicModelAvailabilityResult.value = await bridge.listAvailability({ timeoutMs: 30000 })
    } catch {
      anthropicModelAvailabilityResult.value = buildAnthropicModelAvailabilityFailure(
        'network_error',
        t('errors.network.reason.networkUnknown'),
      )
    } finally {
      anthropicModelAvailabilityLoading.value = false
    }
  }

  function getDeepSeekModelsBridge(): DeepSeekModelsBridge | null {
    const bridge = window.generationV2?.models
    return typeof bridge?.listDeepSeek === 'function' && typeof bridge.sync === 'function'
      ? { listAvailability: (payload) => bridge.listDeepSeek(payload) as Promise<DeepSeekModelAvailabilityResult>,
          syncAvailability: (payload) => bridge.sync({ providerKey: 'deepseek', ...(payload as object ?? {}) }) as Promise<Readonly<{ ok: boolean; code?: string }>> }
      : null
  }

  function buildDeepSeekModelAvailabilityFailure(
    code: DeepSeekModelAvailabilityFailureCode,
    message: string,
  ): DeepSeekModelAvailabilityResult {
    return {
      ok: false,
      providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
      profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
      observedAtMs: Date.now(),
      code,
      message,
    }
  }

  async function onRefreshDeepSeekModels() {
    if (deepSeekModelAvailabilityLoading.value) return
    const bridge = getDeepSeekModelsBridge()
    if (!bridge) {
      deepSeekModelAvailabilityResult.value = buildDeepSeekModelAvailabilityFailure(
        'invalid_payload',
        'DeepSeek model availability bridge is unavailable.',
      )
      return
    }

    deepSeekModelAvailabilityLoading.value = true
    try {
      const sync = await bridge.syncAvailability({ timeoutMs: 30_000 })
      if (!sync.ok) throw new Error(sync.code ?? 'provider_catalog_sync_failed')
      deepSeekModelAvailabilityResult.value = await bridge.listAvailability({ timeoutMs: 30000 })
    } catch {
      deepSeekModelAvailabilityResult.value = buildDeepSeekModelAvailabilityFailure(
        'network_error',
        t('errors.network.reason.networkUnknown'),
      )
    } finally {
      deepSeekModelAvailabilityLoading.value = false
    }
  }

  async function persistGenerationV2RoutePreference(
    conversationId: string,
    modelConfig: ChatSessionConfig['model'],
  ): Promise<void> {
    if (!generationV2RoutePreferenceByConversationId.value.has(conversationId)) {
      await loadGenerationV2RoutePreference(conversationId)
    }
    const current = generationV2RoutePreferenceByConversationId.value.get(conversationId) ?? null
    let selection: GenerationV2ConversationRoutePreferenceSelection | null = null
    if (modelConfig.compatibleSelection) {
      selection = { schemaVersion: 1, kind: 'openai_chat_compatible', selection: modelConfig.compatibleSelection }
    } else if (modelConfig.selectedProviderId && modelConfig.selectedModelKey) {
      selection = { schemaVersion: 1, kind: 'provider_model',
        providerId: modelConfig.selectedProviderId, modelId: modelConfig.selectedModelKey }
    }
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
    const convo = getActiveConvoRecord()
    if (!convo) return null
    const current = getChatSessionConfigForConvo(convo)
    const nextConfig = mergeChatSessionConfig(current, patch)
    if (patch.model) await persistGenerationV2RoutePreference(convo.id, nextConfig.model)
    const nextMeta = serializeChatSessionConfigToConvoMeta({
      baseMeta: convo.meta ?? null,
      config: { ...nextConfig, model: {
        selectedProviderId: null, selectedModelKey: null, compatibleSelection: null,
      } },
      convoProjectId: convo.projectId ?? null,
      defaultModelKey: DEFAULT_OPENROUTER_MODEL_ID,
    })
    updateLocalConvoMeta(convo.id, nextMeta)
    if (convo.id === systemTemplateSnapshot.value?.conversation.id) {
      await persistConvoMetaUpdate(convo, nextMeta)
    } else {
      const providerId: RuntimeProviderKey | null = nextConfig.model.compatibleSelection
        ? 'local_endpoint' : nextConfig.model.selectedProviderId ?? null
      if (!providerId) throw new Error('GENERATION_V2_MODEL_SELECTION_REQUIRED')
      await persistCurrentGenerationV2SemanticLayer(providerId, convo.id, true, nextConfig)
    }
    return nextConfig
  }

  async function onUpdateReasoningEnabled(nextEnabled: boolean) {
    if (isDraftInteractionLocked.value) return
    await updateActiveConvoSessionConfig({
      reasoning: {
        enabled: nextEnabled,
      },
    })
    hydrateSessionConfigUiFromActiveConvo()
  }

  async function onUpdateReasoningEffortLevel(nextEffort: ChatSessionConfig['reasoning']['effort']) {
    if (isDraftInteractionLocked.value) return
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
        enabled: current.enabled,
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
        enabled: current.enabled,
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
        enabled: current.enabled,
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
    const selectedProviderId = config.model.selectedProviderId
    model.value = selectedProviderId === OPENROUTER_PROVIDER_ID
      ? normalizeModelKey(config.model.selectedModelKey)
      : DEFAULT_OPENROUTER_MODEL_ID
    const persistedConfig = activeConvoId.value
      ? generationV2ConfigByConversationId.value.get(activeConvoId.value) : undefined
    const semanticProjection = persistedConfig && !isEmptyGenerationV2SemanticLayer(persistedConfig.semanticLayer)
      ? projectGenerationV2SemanticLayerToSessionConfig(
          persistedConfig.semanticLayer,
          config.model.compatibleSelection ? 'local_endpoint' : config.model.selectedProviderId ?? null,
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
    const retryPreviewAvailable = retrySnapshotAvailable ||
      (isImageAssetLike(asset, attachment) && base.previewDataUrl == null && base.displayStatus !== 'parsing')
    const retryPreviewReason = retryPreviewAvailable ? null : t('filePipeline.attachment.details.retryUnavailable')
    const retryPreviewLabel = retrySnapshotAvailable
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
        processingStatus: 'ready',
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
    draftAttachmentPlansByAssetId.value = {}
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
      record, assets[record.assetId] ?? null, null, previewByRevision.get(record.id) ?? null,
    ))
    resetComposerSendPlanGateState()
    selectedDraftAttachmentAssetId.value = selectedDraftAttachmentAssetId.value &&
      records.some((record) => record.assetId === selectedDraftAttachmentAssetId.value)
      ? selectedDraftAttachmentAssetId.value : null
    composerSendPlanLoading.value = false
    resetHistoryIncompatibleAttachmentSummary()
    return
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
        providerId: activeSessionConfig.value.model.selectedProviderId ?? 'unset',
        operation: activeSessionConfig.value.model.selectedProviderId === 'openai_responses' ? 'responses' as const
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
            providerId: activeSessionConfig.value.model.selectedProviderId ?? 'unset',
            operation: activeSessionConfig.value.model.selectedProviderId === 'openai_responses' ? 'responses' as const
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
    providerId: RuntimeProviderKey | null | undefined,
    modelId?: string | null,
  ): ProviderGenerationParamProfile {
    if (!providerId) return unsetGenerationProfile
    const requestKind = providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && isKnownGeminiImageGenerationModel(modelId)
      ? 'image_generation'
      : 'text'
    return getDefaultGenerationParamProfile(providerId, { requestKind }) ?? unsetGenerationProfile
  }

  const activeSessionGenerationParamsLayer = computed<GenerationParamsLayer | null>(() =>
    activeSessionConfig.value.generationParams.detail
  )

  const activeSessionGenerationParamsProfile = computed(() =>
    generationParamProfileForProvider(
      activeSessionConfig.value.model.selectedProviderId,
      activeSessionConfig.value.model.selectedModelKey,
    )
  )

  const activeSessionGenerationParamsModelId = computed(() =>
    activeSessionConfig.value.model.selectedModelKey ?? DEFAULT_OPENROUTER_MODEL_ID
  )

  const activeSessionGenerationParamsResolved = computed<ResolvedGenerationParams>(() =>
    resolveGenerationParamsFromLayers({
      profile: activeSessionGenerationParamsProfile.value,
      modelId: activeSessionGenerationParamsModelId.value,
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

  function extractRuntimeSelectionFromMessageMeta(meta: unknown): Readonly<{
    providerId: ChatModelSelection['providerId'] | null
    modelId: string | null
  }> {
    const record = asRecord(meta)
    const request = asRecord(record?.request)
    const providerId = normalizeRuntimeProviderId(record?.providerId ?? record?.providerKey)
    const modelId = normalizeRuntimeModelId(record?.modelId ?? record?.model ?? request?.model)
    return {
      providerId,
      modelId: modelId.length > 0 ? modelId : null,
    }
  }

  function normalizeSelectionInput(value: unknown): ChatModelSelection | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>
      return normalizeChatModelSelection({
        providerId: normalizeRuntimeProviderId(record.providerId) ?? undefined,
        modelId: normalizeRuntimeModelId(record.modelId),
      })
    }
    return null
  }

  function runtimeEndpointIdForProvider(providerId: ChatModelSelection['providerId']): string {
    const current = currentRuntimeSelection.value
    if (current.state === 'selected' && current.providerKey === providerId) return current.endpointId
    if (providerId === OPENROUTER_PROVIDER_ID) return 'openrouter-official'
    if (providerId === OPENAI_RESPONSES_PROVIDER_KEY) return OPENAI_RESPONSES_ENDPOINT_ID
    if (providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY) return GOOGLE_AI_STUDIO_ENDPOINT_ID
    if (providerId === ANTHROPIC_MESSAGES_PROVIDER_KEY) return ANTHROPIC_MESSAGES_ENDPOINT_ID
    if (providerId === DEEPSEEK_OFFICIAL_PROVIDER_KEY) return DEEPSEEK_OFFICIAL_ENDPOINT_ID
    if (providerId === 'lm_studio') return lmStudioProviderConfig.value.endpointUrl.trim() || 'lm-studio-loopback-local-storage'
    if (providerId === 'ollama_local') return ollamaProviderConfig.value.endpointUrl.trim() || 'ollama-loopback-local-storage'
    return localEndpointChatUrl.value.trim() || 'local-endpoint-loopback-local-storage'
  }

  function runtimeProfileIdForProvider(providerId: ChatModelSelection['providerId']): string {
    const current = currentRuntimeSelection.value
    if (current.state === 'selected' && current.providerKey === providerId) return current.profileId
    if (providerId === OPENROUTER_PROVIDER_ID) return 'openrouter_v1_chat'
    if (providerId === OPENAI_RESPONSES_PROVIDER_KEY) return OPENAI_RESPONSES_PROFILE_ID
    if (providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY) return GOOGLE_AI_STUDIO_PROFILE_ID
    if (providerId === ANTHROPIC_MESSAGES_PROVIDER_KEY) return ANTHROPIC_MESSAGES_PROFILE_ID
    if (providerId === DEEPSEEK_OFFICIAL_PROVIDER_KEY) return DEEPSEEK_OFFICIAL_PROFILE_ID
    if (providerId === 'lm_studio') {
      return lmStudioChatConfig.value.chatMode === 'native_rest'
        ? 'lm_studio_native_rest_chat_v1'
        : lmStudioChatConfig.value.openAICompatiblePreferredEndpoint === 'responses'
          ? 'lm_studio_openai_responses_v1'
          : 'lm_studio_openai_chat_completions_v1'
    }
    if (providerId === 'ollama_local') {
      return ollamaChatConfig.value.chatMode === 'native_rest'
        ? ollamaChatConfig.value.nativeRestPreferredEndpoint === 'generate'
          ? 'ollama_native_rest_generate_v1'
          : 'ollama_native_rest_chat_v1'
        : ollamaChatConfig.value.openAICompatiblePreferredEndpoint === 'responses'
          ? 'ollama_openai_responses_v1'
          : 'ollama_openai_chat_completions_v1'
    }
    return 'local_endpoint_openai_compat_text_v1'
  }

  function buildCurrentRuntimeSelectionForChatModel(selection: ChatModelSelection): CurrentRuntimeSelection {
    const providerId = selection.providerId
    const modelId = providerId === OPENROUTER_PROVIDER_ID
      ? normalizeModelKey(selection.modelId)
      : normalizeRuntimeModelId(selection.modelId)
    return {
      state: 'selected',
      providerKey: providerId,
      providerId,
      endpointId: runtimeEndpointIdForProvider(providerId),
      profileId: runtimeProfileIdForProvider(providerId),
      modelId,
      modelKey: modelId,
      nativeModelId: modelId,
      source: 'explicit_user_selection',
      mode: providerId === OPENROUTER_PROVIDER_ID ? 'production' : 'experimental',
      credentialStatus: providerId === 'local_endpoint' || providerId === 'lm_studio' || providerId === 'ollama_local'
        ? 'not_required'
        : 'unknown',
    }
  }

  function resolveCurrentRuntimeSelectionForSend(): CurrentRuntimeSelection {
    const sessionSelection = activeSessionConfig.value.model
    const providerId = sessionSelection.selectedProviderId
    if (!providerId) return { state: 'unset', source: 'unset' }
    const selectedModel = normalizeRuntimeModelId(
      sessionSelection.selectedModelKey,
    )
    if (!selectedModel) return { state: 'unset', source: 'unset' }
    return buildCurrentRuntimeSelectionForChatModel({ providerId, modelId: selectedModel })
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
    const selectedProviderId = currentSessionConfig.model.selectedProviderId
    const modelId = selectedProviderId === OPENROUTER_PROVIDER_ID
      ? normalizeModelKey(currentSessionConfig.model.selectedModelKey)
      : DEFAULT_OPENROUTER_MODEL_ID
    selectedModelImageCapabilityLoading.value = true

    if (selectedProviderId !== OPENROUTER_PROVIDER_ID || modelId === DEFAULT_OPENROUTER_MODEL_ID) {
      selectedModelImageCapabilityClass.value = null
      selectedModelImageCapabilityReason.value = selectedProviderId === OPENROUTER_PROVIDER_ID
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
    providerKey: RuntimeProviderKey,
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
    const selectedModelId = normalizeRuntimeModelId(sessionConfig.model.selectedModelKey ?? '')
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
    const selectedProviderId = currentSessionConfig.model.selectedProviderId
    const normalized = selectedProviderId === OPENROUTER_PROVIDER_ID
      ? normalizeModelKey(currentSessionConfig.model.selectedModelKey)
      : DEFAULT_OPENROUTER_MODEL_ID
    model.value = normalized

    const availability = resolveSelectedModelAvailability(normalized)
    if ((availability === 'hidden' || availability === 'missing') && shouldLogDebug()) {
      console.warn('[ui-app] selected route model is not currently visible in local catalog; keep using the persisted session selection', {
        convoId: getActiveConvoRecord()?.id,
        selectedModelKey: normalized,
        availability,
      })
    }
  }

  async function persistSelectedModelForActiveConvo(nextModelKey: ChatModelSelection | string) {
    const convo = getActiveConvoRecord()
    if (!convo) return

    const selection = normalizeSelectionInput(nextModelKey)
    if (!selection) {
      loadError.value = 'A provider and model must be selected together.'
      return
    }
    const normalized = selection.modelId
    const currentModel = getActiveSessionConfigSnapshot().model
    const currentPersisted = currentModel.selectedModelKey
    const currentProvider = currentModel.selectedProviderId ?? null
    if (currentPersisted === normalized && currentProvider === selection.providerId) return

    try {
      const current = getActiveSessionConfigSnapshot()
      const patch: {
        model: NonNullable<ChatSessionConfigPatch['model']>
        imageGeneration?: NonNullable<ChatSessionConfigPatch['imageGeneration']>
        reasoning?: NonNullable<ChatSessionConfigPatch['reasoning']>
        generationParams?: NonNullable<ChatSessionConfigPatch['generationParams']>
      } = {
        model: {
          selectedProviderId: selection.providerId,
          selectedModelKey: normalized,
          compatibleSelection: null,
        },
      }
      if (selection.providerId === GOOGLE_AI_STUDIO_PROVIDER_KEY && isKnownGeminiImageGenerationModel(normalized)) {
        const policy = resolveGeminiImageGenerationPolicy(normalized)
        const imageSize = policy.imageSizeMode === 'hidden' ? '' : policy.defaultImageSize
        patch.imageGeneration = {
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
      const persistedEffort = current.generationParams.detail?.reasoningEffort
      const hasExplicitMax = current.reasoning.enabled && current.reasoning.effort === 'max' ||
        persistedEffort?.mode === 'custom' && persistedEffort.value === 'max'
      if (hasExplicitMax && isReasoningEffortExplicitlyUnsupported(profile, normalized, 'max')) {
        patch.reasoning = { enabled: false, effort: 'medium' }
        patch.generationParams = { detail: Object.freeze({
          ...(current.generationParams.detail ?? {}),
          reasoningEffort: Object.freeze({ mode: 'omit' as const }),
        }) }
        requestedReasoningEffort.value = 'auto'
        requestedReasoningExclude.value = false
      }
      await updateActiveConvoSessionConfig(patch)
    } catch (err) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] PERSIST_SELECTED_MODEL_FOR_ACTIVE_CONVO_FAILED', {
          convoId: convo.id,
          selectedModelKey: normalized,
        })
      }
    }
  }

  async function onUpdateModel(nextModelKey: ChatModelSelection | CompatibleConfigurationSelection | string) {
    if (isDraftInteractionLocked.value) return
    if (typeof nextModelKey === 'object' && 'kind' in nextModelKey && nextModelKey.kind === 'openai_chat_compatible_configuration') {
      await updateActiveConvoSessionConfig({
        model: {
          selectedProviderId: null,
          selectedModelKey: nextModelKey.modelId,
          compatibleSelection: nextModelKey,
        },
      })
      return
    }
    const selection = normalizeSelectionInput(nextModelKey)
    if (!selection) {
      loadError.value = 'A provider and model must be selected together.'
      return
    }
    const normalized = selection.modelId
    if (selection.providerId === OPENROUTER_PROVIDER_ID) {
      model.value = normalized
    }
    await persistSelectedModelForActiveConvo(selection)
    // Contract: this is the commit path for a manual model selection.
    // Do not rehydrate from active session state here; that would overwrite
    // the just-submitted model with stale convo meta and can snap back to auto.
    void refreshDraftAttachmentViewModels()
    scheduleHistoryIncompatibleRefresh()
  }

  async function recordRecentModelUsage(modelId: string, providerId: ChatModelSelection['providerId']) {
    const normalized = normalizeModelKey(modelId)
    if (!normalized) return
    const result = await ModelPrefsService.recordRecent(
      {
        providerKey: providerId,
        modelId: normalized,
        modelKey: buildProviderModelKey({ providerId, modelId: normalized }),
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
    providerId: RuntimeProviderKey,
    sessionConfig: ChatSessionConfig = activeSessionConfig.value,
  ): Readonly<Record<string, unknown>> {
    const modelId = sessionConfig.model.selectedModelKey ?? DEFAULT_OPENROUTER_MODEL_ID
    const resolved = resolveGenerationParamsFromLayers({
      profile: generationParamProfileForProvider(providerId, modelId),
      modelId,
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
      isGeminiInteractionsImageModelIdV1(normalizeGeminiImageGenerationModelId(sessionConfig.model.selectedModelKey)) && imageConfig !== null
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
    const thinkingEnabled = params.thinkingEnabled
    const rawEffort = String(openRouterReasoning?.requestedReasoningEffortValue ??
      (geminiInteractionsImage ? params.thinkingLevel : undefined) ?? params.reasoningEffort ?? '').trim()
    const explicitReasoningDisabled = rawEffort === 'none' || thinkingEnabled === false
    const effort = rawEffort === 'none' ? '' : rawEffort
    const summary = String(geminiInteractionsImage && params.thoughtSummaryMode === 'auto'
      ? 'auto' : params.reasoningSummary ?? '').trim()
    if (effort && !['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
      throw new Error('GENERATION_V2_REASONING_EFFORT_UNSUPPORTED')
    }
    if (summary && !['auto', 'concise', 'detailed'].includes(summary)) {
      throw new Error('GENERATION_V2_REASONING_SUMMARY_UNSUPPORTED')
    }
    const reasoningEnabled = openRouterReasoning?.requestedReasoningMode === 'auto' || thinkingEnabled === true || effort.length > 0 || summary.length > 0 ||
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
      else providerExtension = { kind: 'gemini_generate_content', thinkingMode: 'provider_default', includeThoughts }
    }

    return Object.freeze({ schemaVersion: 2, generation, reasoning, web, image,
      tools: Object.freeze({ mode: 'disabled' }), providerExtension })
  }

  async function persistCurrentGenerationV2SemanticLayer(
    providerId: RuntimeProviderKey,
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
    if (config.model.selectedProviderId !== OPENROUTER_PROVIDER_ID || !config.imageGeneration.enabled) {
      throw new Error('GENERATION_V2_OPENROUTER_IMAGE_ENDPOINT_NOT_ACTIVE')
    }
    const modelId = normalizeRuntimeModelId(config.model.selectedModelKey)
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

  function handleGenerationV2OllamaSettingsUpdated(): void {
    const selection = resolveCurrentRuntimeSelectionForSend()
    if (!window.generationV2 || selection.state !== 'selected' ||
        selection.providerKey !== 'ollama_local') return
    const modelId = normalizeRuntimeModelId(selection.modelId ?? selection.modelKey ?? selection.nativeModelId)
    if (!modelId) return
    void ensureGenerationV2OllamaProfileFromSavedSettings(modelId).catch(() => {
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
    const compatibleSelection = activeSessionConfig.value.model.compatibleSelection
    const selection = compatibleSelection ? null : resolveCurrentRuntimeSelectionForSend()
    const selectedRuntime = selection?.state === 'selected' ? selection : null
    if (!compatibleSelection && !selectedRuntime) throw new Error('GENERATION_V2_MODEL_SELECTION_REQUIRED')
    const providerId: RuntimeProviderKey = compatibleSelection ? 'local_endpoint' : selectedRuntime!.providerId
    const modelId = normalizeRuntimeModelId(compatibleSelection?.modelId ?? selectedRuntime?.modelId ?? selectedRuntime?.modelKey ?? selectedRuntime?.nativeModelId)
    if (!modelId) throw new Error('GENERATION_V2_MODEL_SELECTION_REQUIRED')
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

  async function onCandidateShift(questionId: string, delta: -1 | 1) {
    if (isDraftInteractionLocked.value) return
    const bid = activeBranchId.value
    if (!bid) return
    if (activeAssistantMessageId.value) return

    const ordered = getOrderedCandidatesOldToNew(questionId)
    if (!ordered) {
      if (import.meta.env?.DEV) {
        console.log('[ui-app] onCandidateShift: no cached candidates, triggering load', { questionId })
      }
      await ensureCandidatesLoaded(questionId)
      return
    }

    const current = turnFiltersByQuestionId.value.get(questionId)
    const chosen = current?.chosenAnswerRootId
    const idx = chosen ? ordered.findIndex((c) => c.answerRootId === chosen) : -1
    const targetIndex = idx + delta

    if (import.meta.env?.DEV) {
      console.log('[ui-app] onCandidateShift', {
        questionId,
        delta,
        orderedCount: ordered.length,
        orderedIds: ordered.map(c => c.answerRootId),
        chosenAnswerRootId: chosen,
        currentIndex: idx,
        targetIndex,
        canShift: idx >= 0 && targetIndex >= 0 && targetIndex < ordered.length,
      })
    }

    if (idx < 0 || targetIndex < 0 || targetIndex >= ordered.length) return

    const target = ordered[targetIndex]
    try {
      if (import.meta.env?.DEV) {
        console.log('[ui-app] switchCandidate', {
          branchId: bid,
          questionId,
          from: `${idx + 1}/${ordered.length}`,
          to: `${targetIndex + 1}/${ordered.length}`,
          oldAnswerRootId: chosen,
          newAnswerRootId: target.answerRootId,
        })
      }
      await selectGenerationV2Answer({ branchId: bid, questionId,
        expectedChosenAnswerRootId: chosen!, targetAnswerRootId: target.answerRootId })
      await refreshRenderableBranchView(bid)
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
      await refreshRenderableBranchView(bid)
    }
  }

  async function onQuestionCandidateShift(questionId: string, delta: -1 | 1) {
    if (isDraftInteractionLocked.value) return
    const bid = activeBranchId.value
    if (!bid) return
    if (activeAssistantMessageId.value) return

    const qid = String(questionId ?? '').trim()
    const meta = qid ? messageMetaById.value.get(qid) : null
    if (!qid || !meta || meta.role !== 'user') return

    const baseMessageId = meta.parentId ?? null
    const ordered = getOrderedQuestionCandidatesOldToNew(baseMessageId)
    if (!ordered) {
      await ensureQuestionCandidatesLoadedForSlot(baseMessageId)
      return
    }

    const idx = ordered.findIndex((c) => c.questionId === qid)
    const targetIndex = idx + delta
    if (idx < 0 || targetIndex < 0 || targetIndex >= ordered.length) return
    const target = ordered[targetIndex]

    try {
      const expectedHeadMessageId = activeBranch.value?.headMessageId
      if (!expectedHeadMessageId) return
      const res = await selectGenerationV2QuestionCandidate({ branchId: bid, baseMessageId,
        expectedCurrentQuestionId: qid, targetQuestionId: target.questionId, expectedHeadMessageId })
      // Branch tip update (definition): backend returns the new insertion point after switching question candidate.
      patchBranch(bid, { headMessageId: res.headMessageId, updatedAt: Date.now() })
      await refreshRenderableBranchView(bid)
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
      await refreshRenderableBranchView(bid)
    }
  }

  async function onRegenerateFromQuestion(questionId: string) {
    if (isRunning.value || isDraftInteractionLocked.value || activeAssistantMessageId.value) return
    const branch = activeBranch.value
    const qid = String(questionId ?? '').trim()
    const chosen = turnFiltersByQuestionId.value.get(qid)?.chosenAnswerRootId
    if (!branch?.id || !qid || !chosen || branch.headMessageId !== chosen) return
    const compatibleSelection = activeSessionConfig.value.model.compatibleSelection
    const currentSelection = compatibleSelection ? null : resolveCurrentRuntimeSelectionForSend()
    const selectedRuntime = currentSelection?.state === 'selected' ? currentSelection : null
    if (!compatibleSelection && !selectedRuntime) return
    const modelId = normalizeRuntimeModelId(compatibleSelection?.modelId ?? selectedRuntime?.modelId ?? selectedRuntime?.modelKey ?? selectedRuntime?.nativeModelId)
    if (!modelId) return
    loadError.value = null
    try {
      const view = generationV2BranchView.value
      if (!view || view.branchId !== branch.id || view.conversationId !== activeConvoId.value) throw new Error('GENERATION_V2_BRANCH_PROJECTION_STALE')
      const sourceTurn = view.turns.find((turn) => turn.questionId === qid)
      if (!sourceTurn) throw new Error('GENERATION_V2_BRANCH_PROJECTION_STALE')
      const nativeProviderId: RuntimeProviderKey = compatibleSelection ? 'local_endpoint' : selectedRuntime!.providerId
      const route: GenerationV2Route = compatibleSelection ? { kind: 'openai_chat_compatible' }
        : nativeProviderId === OPENROUTER_PROVIDER_ID && resolveImageGenerationConfigForRequest(nativeProviderId)
          ? { kind: 'openrouter_images' } : generationV2RouteForProvider(nativeProviderId, modelId)
      await persistCurrentGenerationV2SemanticLayer(nativeProviderId, view.conversationId)
      const endpointProfileId = route.kind === 'lmstudio_openresponses' || route.kind === 'generic_local_openai_chat' || route.kind === 'ollama_chat'
        ? await resolveGenerationV2LocalProfileForSend(route, modelId) : null
      const common = { operationId: crypto.randomUUID(), branchId: branch.id, questionId: qid,
        expectedHeadMessageId: chosen, modelId: route.kind === 'gemini_interactions_image'
          ? normalizeGeminiImageGenerationModelId(modelId) : modelId }
      const result = await submitGenerationV2Regenerate(route, route.kind === 'openrouter_images'
        ? { ...common, requestedProviderTag: null }
        : route.kind === 'gemini_interactions_image'
          ? common
        : { ...common, commandAttachments: projectGenerationV2ComposerAttachments(
          generationV2ComposerDraft.value?.conversationId === view.conversationId
            ? generationV2ComposerDraft.value : await getGenerationV2ComposerDraft(view.conversationId),
        ), ...(compatibleSelection ? { providerInstanceId: compatibleSelection.providerInstanceId, extraBody: compatibleSelection.extraBody } : {}),
          ...(endpointProfileId === null ? {} : { endpointProfileId }) })
      if (!result.ok) throw new Error(result.code)
      invalidateCandidatesForQuestion(qid)
      patchBranch(branch.id, { headMessageId: result.branch.headMessageId, updatedAt: Date.now() })
      await refreshRenderableBranchView(branch.id)
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

  function canReplaceQuestionInUi(questionId: string): boolean {
    const qid = String(questionId ?? '').trim()
    if (!qid) return false
    const meta = messageMetaById.value.get(qid)
    if (!meta || meta.role !== 'user') return false
    const lastQ = questionTurnOrder.value.length > 0 ? questionTurnOrder.value[questionTurnOrder.value.length - 1] : null
    return lastQ === qid
  }

  async function submitQuestionEdit(mode: 'new' | 'replace') {
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
    if (!v2View || v2View.branchId !== branch.id || !sourceTurn ||
        v2View.headMessageId !== sourceTurn.chosenAnswerRootId) {
      loadError.value = 'GENERATION_V2_EDIT_TARGET_STALE'
      return
    }
    const compatibleSelection = activeSessionConfig.value.model.compatibleSelection
    const currentSelection = compatibleSelection ? null : resolveCurrentRuntimeSelectionForSend()
    const selectedRuntime = currentSelection?.state === 'selected' ? currentSelection : null
    if (!compatibleSelection && !selectedRuntime) { loadError.value = 'GENERATION_V2_MODEL_SELECTION_REQUIRED'; return }
    const v2ProviderId: RuntimeProviderKey = compatibleSelection ? 'local_endpoint' : selectedRuntime!.providerId
    const v2ModelId = normalizeRuntimeModelId(compatibleSelection?.modelId ?? selectedRuntime?.modelId ?? selectedRuntime?.modelKey ?? selectedRuntime?.nativeModelId)
    if (!v2ModelId) { loadError.value = 'GENERATION_V2_MODEL_SELECTION_REQUIRED'; return }
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
      const common = { operationId, mode: mode === 'new' ? 'fork' : 'replace', branchId: v2View.branchId,
        sourceQuestionId: oldQuestionId, sourceAnswerRootId: sourceTurn.chosenAnswerRootId,
        expectedHeadMessageId: sourceTurn.chosenAnswerRootId, modelId: v2Route.kind === 'gemini_interactions_image'
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
      await refreshRenderableBranchView(v2View.branchId)
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

  function generationV2RouteForProvider(providerId: string, modelId?: string): GenerationV2Route {
    switch (providerId) {
      case 'openrouter': return { kind: 'openrouter_chat' }
      case 'openai_responses': return { kind: 'openai_responses' }
      case 'anthropic':
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
      case 'lmstudio':
      case 'lm_studio': return { kind: 'lmstudio_openresponses' }
      case 'generic_local':
      case 'local_endpoint': return { kind: 'generic_local_openai_chat' }
      case 'ollama':
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
    if (!branch?.id || !qid || !current || !turn || !answer || turn.chosenAnswerRootId !== current || branch.headMessageId !== current) return
    loadError.value = null
    try {
      const result = await submitGenerationV2Retry(generationV2RouteForPersistedAnswer(answer), {
        actionKind: mode === 'replace' ? 'retry_replace' : 'retry_as_new',
        operationId: crypto.randomUUID(),
        branchId: branch.id,
        questionId: qid,
        targetAnswerRootId: current,
        expectedHeadMessageId: current,
      })
      if (!result.ok) throw new Error(result.code)
      invalidateCandidatesForQuestion(qid)
      patchBranch(branch.id, { headMessageId: result.branch.headMessageId, updatedAt: Date.now() })
      await refreshRenderableBranchView(branch.id)
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
      await refreshProjects()
      await refreshConvos()
      const startupNavigation = template.settings.startupNavigation
      if (startupNavigation === 'projects_only') {
        projectsOnlyWorkspace.value = true
        activeConvoId.value = null
        activeBranchId.value = null
      } else if (startupNavigation === 'restore_last_formal') {
        const lastFormalConversationId = await getLastFormalConversationId()
        const available = lastFormalConversationId !== null && convos.value.some((convo) => convo.id === lastFormalConversationId)
        projectsOnlyWorkspace.value = false
        activeConvoId.value = available ? lastFormalConversationId : template.conversation.id
        activeBranchId.value = available ? null : template.conversation.branchId
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
      await loadTranscriptForActiveConvo()
      await restoreDraftForActiveScope()

      assertInvariants() // Stable boundary: initial load complete
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    } finally {
      isReady.value = true
    }
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
      const selection = resolveCurrentRuntimeSelectionForSend()
      return selection.state === 'selected' && selection.providerKey === 'ollama_local'
        ? normalizeRuntimeModelId(selection.modelId ?? selection.modelKey ?? selection.nativeModelId)
        : null
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

  let unsubscribeGenerationV2Projection: (() => void) | null = null
  let generationV2ProjectionRefreshTimer: ReturnType<typeof setTimeout> | null = null

  onMounted(() => {
    unsubscribeGenerationV2Projection = subscribeGenerationV2Projections((projection) => {
      const view = generationV2BranchView.value
      if (!view || !view.turns.some((turn) => turn.answers.some((answer) => answer.answerRootId === projection.answerRootId))) return
      if (projection.type === 'reasoning_detail') {
        commitImmediate(view.conversationId, { type: 'MessageDeltaReasoningDetail', messageId: projection.answerRootId,
          choiceIndex: 0, detail: projection.detail })
        return
      }
      if (generationV2ProjectionRefreshTimer) return
      generationV2ProjectionRefreshTimer = setTimeout(() => {
        generationV2ProjectionRefreshTimer = null
        const branchId = activeBranchId.value
        if (branchId) void refreshRenderableBranchView(branchId)
      }, 40)
    })
  })

  onUnmounted(() => {
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
    unsubscribeGenerationV2Projection?.()
    unsubscribeGenerationV2Projection = null
    if (generationV2ProjectionRefreshTimer) clearTimeout(generationV2ProjectionRefreshTimer)
    generationV2ProjectionRefreshTimer = null

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
    activeBranchId,
    onSelectBranch,
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
    isQuestionSlotLoadingForQuestion,
    onQuestionCandidateShift,
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
    candidatesLoading,
    onCandidateShift,
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
    currentRuntimeSelection,
    currentRuntimeCapability,
    currentRuntimeStatus,
    model,
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
    onUpdateModel,
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
    onRefreshProviderModelPickerSources,
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
    canReplaceQuestionInUi,
    pendingDeleteQuestionId,
    requestDeleteQuestion,
    cancelDeleteQuestion,
    confirmDeleteQuestion,
  }
}

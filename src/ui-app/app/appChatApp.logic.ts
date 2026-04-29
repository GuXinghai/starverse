import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ErrorPanelViewModel } from '@/ui-kit/chat/types'
import type { CompletionOutcome, DomainEvent, MessageState, MessageVM, ReasoningEffort, RequestedReasoningMode, ReasoningPrefs, RootState, StreamEndReason } from '@/next/state/types'
import {
  createConvo,
  deleteConvo,
  deleteConvos,
  listConvos,
  renameConvo,
  saveConvo,
  setConvoProject,
  setConvoProjectMany,
  type ConvoSummary,
} from '@/next/convo/convoClient'
import {
  clearBranchFilter,
  createBranchFromMessage,
  beginTurn,
  forkQuestion,
  regenerateFromQuestion,
  retryReplaceAnswer,
  retryReplaceQuestion,
  getBranchCandidates,
  getQuestionCandidates,
  deleteBranch,
  ensureDefaultBranch,
  listBranches,
  switchCandidate,
  switchQuestionCandidate,
  setBranchFilter,
  truncateBranchFromQuestion,
  type BranchSummary,
  type BranchCandidate,
  type QuestionCandidate,
  type EffectiveFilterResult,
} from '@/next/branch/branchClient'
import {
  appendMessageDelta,
  appendReasoningDetailSegments,
  finalizeReasoningDetails,
  getReasoningSegmentsStats,
  listMessageErrorEnvelopes,
  listMessageImageAssetsByMessageIds,
  persistMessageImageAssetsFromDataUrls,
  setMessageAnnotations,
  setMessageReasoningRequestConfig,
  setMessageStatus,
  upsertMessageErrorEnvelope,
  type PersistedMessageImageAsset,
} from '@/next/message/messageClient'
import { findProjectById, listProjects, saveProject, getInbox, createProject, deleteProject, countConversationsBatch, type ProjectSummary } from '@/next/project/projectClient'
import { getReasoningPrefs, setReasoningPrefs } from '@/next/settings/reasoningPrefsClient'
import {
  deleteChatDraftsForConvo,
} from '@/next/settings/chatDraftClient'
import { getUserMessageRenderDefault } from '@/next/settings/userMessageRenderDefaultClient'
import { getWebSearchDefaults } from '@/next/settings/webSearchDefaultsClient'
import { getImageGenerationDefault } from '@/next/settings/imageGenerationDefaultClient'
import { getSamplingParamsDefaults } from '@/next/settings/samplingParamsDefaultsClient'
import {
  getChatReasoningDisplayMode,
  setChatReasoningDisplayMode,
} from '@/next/settings/chatDisplayPrefsClient'
import { listModelCatalog } from '@/next/modelCatalog/modelCatalogClient'
import { selectModelCatalogAll, selectModelCatalogVisible } from '@/next/modelCatalog/modelCatalogSelectors'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import { getModelCatalogModelDetail } from '@/next/modelCatalog/modelDetailService'
import { listReasoningModelIndex } from '@/next/modelIndex/reasoningModelIndexClient'
import { selectReasoningModelIndexAll, selectReasoningModelIndexVisible } from '@/next/modelIndex/reasoningModelIndexSelectors'
import type { ReasoningModelIndexItem } from '@/next/modelIndex/reasoningModelIndexTypes'
import type { OpenRouterImageConfig, OpenRouterOutputModality } from '@/next/openrouter/buildRequest'
import { evaluateImageGenerationModel, type ImageCapabilityClass, type ImageModelFilterReason } from '@/next/openrouter/imageGenerationContract'
import {
  DEFAULT_IMAGE_GENERATION_USER_CONFIG,
  normalizeImageGenerationUserConfig,
  type ConvoImageGenerationMode,
  type ImageGenerationUserConfig,
} from '@/next/openrouter/imageGenerationSettingsPersistence'
import { ModelPrefsService } from '@/next/modelPrefs/modelPrefsService'
import { getNetExpSettings } from '@/next/netExp/netExpClient'
import { startNetExpRunReport } from '@/next/netExp/netExpRunReport'
import { applyEventsBatch, createInitialState, startGeneration, toggleReasoningPanelState } from '@/next/state/reducer'
import { selectMessage, selectRun } from '@/next/state/selectors'
import { streamOpenRouterChatAsEvents } from '@/next/live/openRouterLiveStream'
import {
  prepareOpenRouterReplayFromMessage,
  prepareOpenRouterSendFromDraft,
  type PreparedOpenRouterReplay,
  type PreparedOpenRouterSend,
} from '@/next/openrouter/openRouterSendPreparation'
import { capturePdfAnnotationDerivatives } from '@/next/files/derivativeJobClient'
import {
  addConversationDraftAttachment,
  attachConversationDraftToMessage,
  cloneConversationDraftFromMessage,
  removeConversationDraftAttachment,
  restoreConversationDraft,
  updateConversationDraftAttachmentSettings,
  updateConversationDraftText,
} from '@/next/files/conversationDraftClient'
import { listFileAssetsByIds } from '@/next/files/fileAssetClient'
import { ingestLocalFile, ingestUrl } from '@/next/files/fileIngestionClient'
import { listMessageAttachmentsByMessageId } from '@/next/files/messageAttachmentClient'
import { buildCurrentSendPlan } from '@/next/files/sendPlanClient'
import type { SendPlan, SendPlanAttachment, SendPlanModelDescriptor, SendPlanProviderContext } from '@/shared/files/sendPlanTypes'
import type { DraftAttachmentSendModePreference, DraftAttachmentUrlRetentionPreference, SendMode } from '@/shared/files/fileTypes'
import type { MessageAttachmentVM, MessageAttachmentDisplayStatus } from '@/ui-kit/chat/types'
import type {
  DecodedConversationDraft,
  DecodedDraftAttachment,
  DecodedFileAsset,
  DecodedMessageAttachment,
  DecodedPreviewPayload,
} from '@/next/ipc/contracts/dbBridgeContracts'
import { decodePreviewPayloadResponse } from '@/next/ipc/contracts/dbBridgeContracts'
import { ensurePreview, getLatestReadyPreview } from '@/next/files/previewClient'
import { normalizeExtension } from '@/shared/files/fileRules'
import {
  extractConvoWebSearchOverride,
  extractProjectWebSearchDefaults,
  mergeProjectWebSearchDefaultsMeta,
  normalizeSearchSettingsLayer,
  resolveSearchSettingsFromStoredLayers,
} from '@/next/openrouter/searchSettingsPersistence'
import {
  resolveSearchSettings,
  type SearchMode as WebSearchMode,
  type OpenRouterWebRequestPatch,
  type SearchSettingsLayer,
} from '@/next/openrouter/searchSettingsResolver'
import {
  resolveSamplingParams,
  hasSamplingParamsPatch,
  type OpenRouterSamplingParamsPatch,
  type SamplingParamsLayer,
} from '@/next/openrouter/samplingParamsResolver'
import {
  extractConvoSamplingParamsOverride,
  extractProjectSamplingParamsDefaults,
  mergeProjectSamplingParamsDefaultsMeta,
  normalizeSamplingParamsLayer,
  resolveSamplingParamsFromStoredLayers,
} from '@/next/openrouter/samplingParamsPersistence'
import type { SearchHit } from '@/next/search/searchTypes'
import { buildContextForBranchInternalMessages, getRenderableTurnsForBranch } from '@/next/context/contextClient'
import type { InternalMessage } from '@/next/context/buildMessages'
import { toInternalMessagesFromBranchPath } from '@/next/context/loadBranchContext'
import type { NormalizedErrorEnvelope } from '@/next/errors/normalizeOpenRouterError'
import { normalizeTransportError, toNormalizedErrorEnvelope } from '@/next/errors/normalizeOpenRouterError'
import type { AppErrorPhase } from '@/next/errors/appError'
import type { CompletionClass, ErrorEnvelope, ErrorPhase } from '@/next/errors/openRouterErrorEnvelope'
import { buildAbortEnvelope, buildTransportErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import { destroyDbEventBus, subscribeDbEvent, flushBuffer, type DbEvent } from '@/next/db/dbEventBus'
import { createEventScheduler } from '@/next/state/eventScheduler'
import {
  beginCommitMeasure,
  endCommitMeasure,
  recordCommit,
  recordDelta,
  recordUpdatedMessages,
  startPerfReporter,
} from '@/next/state/perfMetrics'
import type { ActiveStream } from './useLiveStreamController'
import { useChatSession } from './useChatSession'
import { useDiagnostics } from './useDiagnostics'
import { useLiveStreamController } from './useLiveStreamController'
import { useSettingsBindings } from './useSettingsBindings'
import { nextTriState, resolveUserMessageRenderPolicy, type UserMessageRenderMode } from '../prefs/userMessageRenderPolicy'
import type { SearchConvoOption, SearchProjectOption } from '../components/SearchModal.vue'
import type { ConversationListItem, ProjectListItem } from '../components/ConversationList.vue'
import {
  deserializeChatSessionConfigFromConvoMeta,
  mergeChatSessionConfig,
  serializeChatSessionConfigToConvoMeta,
  type ChatSessionConfig,
  type ChatSessionConfigPatch,
} from './chatSessionConfig'

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
  const activeBranchId = ref<string | null>(null)
  const branches = ref<BranchSummary[]>([])
  const draft = ref('')
  const reasoningDisplayMode = ref<'inline' | 'rail'>('inline')
  const rightRailOpen = ref(true)
  const rightRailView = ref<'reasoning' | 'console'>('console')
  const pendingDeleteQuestionId = ref<string | null>(null)
  const DEFAULT_CHAT_MODEL_ID = 'openrouter/auto'
  const CONVO_META_SELECTED_MODEL_KEY = 'selectedModelKey'
  const model = ref(DEFAULT_CHAT_MODEL_ID)
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
  const sessionWebSearchSettingsOpen = ref(false)
  const projectWebSearchSettingsOpen = ref(false)
  const projectWebSearchSettingsProjectId = ref<string | null>(null)
  const sessionWebSearchDraft = ref<SearchSettingsLayer | null>(null)
  const projectWebSearchDraft = ref<SearchSettingsLayer | null>(null)
  const sessionSamplingParamsDraft = ref<SamplingParamsLayer | null>(null)
  const projectSamplingParamsDraft = ref<SamplingParamsLayer | null>(null)
  const sessionWebSearchSettingsSaving = ref(false)
  const projectWebSearchSettingsSaving = ref(false)
  const sessionWebSearchQuickSaving = ref(false)
  const sessionSamplingParamsQuickSaving = ref(false)
  const sessionWebSearchSettingsStatus = ref<string | null>(null)
  const projectWebSearchSettingsStatus = ref<string | null>(null)
  const modelCatalogItems = ref<ModelCatalogItem[]>([])
  const reasoningModelIndexItems = ref<ReasoningModelIndexItem[]>([])
  const showHiddenModelsInPickers = ref(false)
  const modelCatalogNotice = ref<string | null>(null)
  const modelPrefsScopeForUi = computed(() => ({ scopeType: 'global' as const, scopeId: '' as const }))
  const globalReasoningPrefs = ref<ReasoningPrefs | null>(null)
  const globalUserMessageRenderDefault = ref<boolean | null>(null)
  const globalWebSearchDefaults = ref<SearchSettingsLayer | null>(null)
  const globalSamplingParamsDefaults = ref<SamplingParamsLayer | null>(null)
  const skipReasoningPrefSave = ref(false)
  const reasoningPrefSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const isDev = import.meta.env.DEV
  const searchModalOpen = ref(false)
  const draftSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const draftSendPlanRefreshTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const draftAttachmentParsingPollTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const draftFlushPromise = ref<Promise<void> | null>(null)
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
  type HistoryAttachmentPreviewState = DecodedPreviewPayload | null
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
  type AttachmentConfirmationSessionKind = 'composer_send' | 'regenerate' | 'retry_replace' | 'edit_submit'
  type AttachmentConfirmationResumePayload = Readonly<{
    kind: AttachmentConfirmationSessionKind
    decisions: AttachmentDecision[]
  }>
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
  type AttachmentConfirmationRequestInput = Readonly<{
    kind: AttachmentConfirmationSessionKind
    historyItems: ConfirmationHistoryAttachmentItem[]
    currentItems: ConfirmationCurrentAttachmentItem[]
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
  const historyAttachmentViewModelsByMessageIdBase = ref<Record<string, MessageAttachmentVM[]>>({})
  const historyAttachmentPreviewCache = ref<Record<string, HistoryAttachmentPreviewState>>({})
  const historyAttachmentPreviewEnsuring = new Set<string>()
  const historyIncompatibleAttachmentItems = ref<HistoryIncompatibleAttachmentViewModel[]>([])
  const historyIncompatibleAttachmentIndex = ref(0)
  const historyIncompatibleNavigationActive = ref(false)
  const activeHistoryIncompatibleAttachmentId = ref<string | null>(null)
  const historyIncompatibleRefreshTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const historyAttachmentRefreshTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  let historyIncompatibleRefreshSeq = 0
  let historyAttachmentRefreshSeq = 0
  let draftAttachmentRefreshSeq = 0
  const draftAttachmentPreviewEnsuring = new Set<string>()
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
      warningText: `${count} 个历史附件不会纳入当前模型上下文。`,
      navigationActive: historyIncompatibleNavigationActive.value,
    }
  })
  const composerSendGateBlockedReason = computed(() => composerSendPlanBlockingSummary.value)
  const composerSendGateWarningReason = computed(() => composerSendPlanWarningSummary.value)
  const attachmentConfirmationSession = ref<AttachmentConfirmationSession | null>(null)
  const attachmentConfirmationResolver = ref<((result: AttachmentConfirmationResult) => void) | null>(null)
  const isAttachmentConfirmationActive = computed(() => attachmentConfirmationSession.value != null)
  const isDraftInteractionLocked = computed(() => isAttachmentConfirmationActive.value)
  const composerCanSend = computed(() => {
    if (isRunning.value) return false
    if (isDraftInteractionLocked.value) return false
    if (isQuestionEditMode.value) return false
    if (composerSendPlanLoading.value) return false
    if (draft.value.trim().length === 0) return false
    return composerSendPlanCanProceed.value
  })
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
  const messageSeqById = ref<Map<string, number>>(new Map())
  type MessageMetaEntry = {
    parentId: string | null
    questionId: string | null
    answerRootId: string | null
    role: string
    status: string
    completionOutcome?: CompletionOutcome
  }
  const messageMetaById = ref<
    Map<string, MessageMetaEntry>
  >(new Map())
  const turnFiltersByQuestionId = ref<Map<string, Readonly<EffectiveFilterResult & { chosenAnswerRootId: string }>>>(new Map())
  const questionTurnOrder = ref<string[]>([])
  const candidatesCache = ref<Map<string, BranchCandidate[]>>(new Map())
  const candidatesEpochGlobal = ref(0)
  const candidatesEpochByQuestionId = ref<Map<string, number>>(new Map())
  const candidatesLoading = ref<Map<string, string>>(new Map())
  const questionCandidatesCache = ref<Map<string, QuestionCandidate[]>>(new Map())
  const questionCandidatesEpochGlobal = ref(0)
  const questionCandidatesEpochBySlot = ref<Map<string, number>>(new Map())
  const questionCandidatesLoading = ref<Map<string, string>>(new Map())

  const questionEditSession = ref<{
    questionId: string
    previousDraft: DecodedConversationDraft
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

  function applyDraftPersistenceStateFromDraft(next: Pick<DecodedConversationDraft, 'draftMode' | 'editingSourceMessageId'> | null | undefined) {
    if (!next) {
      applyDraftPersistenceState({ draftMode: 'compose', editingSourceMessageId: null })
      return
    }
    applyDraftPersistenceState({
      draftMode: next.draftMode,
      editingSourceMessageId: next.editingSourceMessageId ?? null,
    })
  }

  function isEditingDraftForMessage(messageId: string): boolean {
    const normalized = String(messageId ?? '').trim()
    if (!normalized) return false
    return (
      draftPersistenceMode.value === 'edit' &&
      String(draftPersistenceEditingSourceMessageId.value ?? '').trim() === normalized
    )
  }

  async function restoreDraftSnapshot(snapshot: DecodedConversationDraft): Promise<void> {
    const convoId = String(activeConvoId.value ?? '').trim()
    if (!convoId) return
    const current = await restoreConversationDraft(convoId)
    const targetByAssetId = new Map(
      snapshot.attachments.map((item) => [String(item.assetId ?? '').trim(), item]).filter(([assetId]) => assetId.length > 0),
    )
    const currentByAssetId = new Map(
      current.attachments.map((item) => [String(item.assetId ?? '').trim(), item]).filter(([assetId]) => assetId.length > 0),
    )

    for (const [assetId] of currentByAssetId) {
      if (targetByAssetId.has(assetId)) continue
      await removeConversationDraftAttachment({ conversationId: convoId, assetId })
    }
    for (const [assetId, target] of targetByAssetId) {
      const existing = currentByAssetId.get(assetId)
      if (!existing) {
        await addConversationDraftAttachment({
          conversationId: convoId,
          assetId,
          attachmentOrder: target.attachmentOrder,
          includeInNextRequest: target.includeInNextRequest,
          excludedReason: target.excludedReason,
          preferredSendMode: target.preferredSendMode,
          urlRetentionMode: target.urlRetentionMode,
        })
        continue
      }
      if (
        existing.preferredSendMode !== target.preferredSendMode ||
        existing.urlRetentionMode !== target.urlRetentionMode ||
        existing.includeInNextRequest !== target.includeInNextRequest ||
        existing.excludedReason !== target.excludedReason
      ) {
        await updateConversationDraftAttachmentSettings({
          conversationId: convoId,
          assetId,
          preferredSendMode: target.preferredSendMode,
          urlRetentionMode: target.urlRetentionMode,
          includeInNextRequest: target.includeInNextRequest,
          excludedReason: target.excludedReason,
        })
      }
    }

    const restored = await updateConversationDraftText({
      conversationId: convoId,
      draftText: snapshot.draftText,
      draftMode: snapshot.draftMode,
      editingSourceMessageId: snapshot.editingSourceMessageId ?? null,
    })
    applyDraftPersistenceStateFromDraft(restored)
    draft.value = restored.draftText
    editRestoredDraftAttachmentAssetIds.value = restored.draftMode === 'edit'
      ? new Set(restored.attachedAssetIds.map((assetId) => String(assetId ?? '').trim()).filter(Boolean))
      : new Set()
    await refreshDraftAttachmentViewModels({ restoredDraft: restored })
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
  const { hasDbBridge, getIpcRenderer, getOpenRouterApiKey, getOpenRouterBaseUrl, randomId } = useChatSession()
  const { activeStream, activeAssistantMessageId, createActiveStream } = useLiveStreamController()
  const { settingsOpen, openSettings, closeSettings } = useSettingsBindings({ isReady })

  // Anti-reordering guard for transcript refresh: only the latest request's result lands.
  const transcriptRefreshToken = ref(0)
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
      sessionSamplingParamsDraft.value = getActiveConvoSamplingParamsLayer()
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

  watch([activeConvoId, activeBranchId], async (_next, [prevConvoId, prevBranchId]) => {
    const prevScopeValid = String(prevConvoId ?? '').trim().length > 0 && String(prevBranchId ?? '').trim().length > 0
    if (prevScopeValid) {
      await flushDraftPersistence()
    }
    await restoreDraftForActiveScope()
  }, { flush: 'sync' })

  watch(draft, () => {
    if (!getActiveDraftScope()) return
    scheduleDraftPersistence()
    if (draftAttachmentRecords.value.length > 0) {
      scheduleDraftSendPlanRefresh()
    }
  })

  watch(
    [activeConvoId, globalReasoningPrefs, globalWebSearchDefaults, globalSamplingParamsDefaults, globalImageGenerationDefault],
    () => {
      hydrateSessionConfigUiFromActiveConvo()
    },
    { immediate: false, flush: 'sync' }
  )

  watch(
    () => model.value,
    (next, prev) => {
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
  const lastAssistantPanelState = computed(() => lastAssistantMessage.value?.reasoningPanelState ?? 'collapsed')
  const lastAssistantIsStreaming = computed(() => {
    const s = lastAssistantMessage.value?.streaming
    return Boolean(s && s.isTarget && !s.isComplete)
  })
  const lastAssistantReasoningPieces = computed(() => lastAssistantReasoningView.value?.reasoningPieces ?? null)

  const isRunning = computed(() => runVM.value?.status === 'requesting' || runVM.value?.status === 'streaming' || runVM.value?.status === 'tool_waiting')

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
    const catalog = showHiddenModelsInPickers.value
      ? selectModelCatalogAll(modelCatalogItems.value)
      : selectModelCatalogVisible(modelCatalogItems.value)

    if (catalog.length > 0) return catalog

    const fallback = showHiddenModelsInPickers.value
      ? selectReasoningModelIndexAll(reasoningModelIndexItems.value)
      : selectReasoningModelIndexVisible(reasoningModelIndexItems.value)

    return fallback.map((item): ModelCatalogItem => ({
      modelId: item.modelId,
      name: item.name,
      vendor: 'openrouter',
      status: item.status === 'hidden' ? 'hidden' : 'visible',
      supportedParameters: ['reasoning'],
      lastSeenSnapshotId: item.lastSyncedSnapshot,
    }))
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
    if (a === 'reauth') return 'Action: API key invalid/expired; update key and retry.'
    if (a === 'topup_credits') return 'Action: credits insufficient; top up or switch model.'
    if (a === 'modify_input_moderation') return 'Action: input flagged; revise prompt and retry.'
    if (a === 'fix_request') return 'Action: fix request parameters and retry.'
    if (a === 'backoff_retry') return 'Action: retry with backoff.'
    if (a === 'switch_provider_or_model') return 'Action: switch provider/model and retry.'
    if (a === 'relax_routing_constraints') return 'Action: relax routing constraints or switch model.'
    return 'Action: unknown.'
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

  function completionClassFromEvent(event: DomainEvent): CompletionClass | null {
    if (event.type === 'StreamError') return event.error?.completionClass ?? 'error'
    if (event.type === 'StreamAbort') return event.envelope?.completionClass ?? 'aborted'
    return null
  }

  function persistStatusFromCompletionClass(completionClass: CompletionClass | null): 'final' | 'error' {
    return completionClass === 'error' ? 'error' : 'final'
  }

  function metaStatusFromCompletionClass(
    completionClass: CompletionClass | null
  ): 'final' | 'error' | 'aborted' | null {
    if (!completionClass) return null
    if (completionClass === 'error') return 'error'
    if (completionClass === 'aborted') return 'aborted'
    return 'final'
  }

  function mapAppPhaseToEnvelopePhase(appPhase: AppErrorPhase, fallback: ErrorPhase): ErrorPhase {
    if (appPhase === 'pre_stream_request_error') return 'pre_stream'
    if (appPhase === 'mid_stream_error') return 'mid_stream'
    return fallback
  }

  function mapAppPhaseToEndReason(appPhase: AppErrorPhase, fallback: StreamEndReason): StreamEndReason {
    if (appPhase === 'pre_stream_request_error') return 'pre_stream_error'
    if (appPhase === 'mid_stream_error') return 'mid_stream_error'
    if (appPhase === 'local_transport_error' || appPhase === 'local_protocol_error' || appPhase === 'internal_bug') {
      return 'transport_error'
    }
    if (appPhase === 'user_cancelled') return 'user_abort'
    return fallback
  }

  function ensureMessageMetaEntry(
    messageId: string,
    patch: Partial<MessageMetaEntry>
  ) {
    const id = String(messageId ?? '').trim()
    if (!id) return
    const next = new Map(messageMetaById.value)
    const prev = next.get(id)
    if (!prev) {
      next.set(id, {
        parentId: patch.parentId ?? null,
        questionId: patch.questionId ?? null,
        answerRootId: patch.answerRootId ?? null,
        role: patch.role ?? 'assistant',
        status: patch.status ?? 'streaming',
      })
    } else {
      next.set(id, { ...prev, ...patch })
    }
    messageMetaById.value = next
  }

  function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null
    return value as Record<string, unknown>
  }

  function parseNumberLike(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return null
  }

  function normalizeUsageForMeta(usage: unknown): Record<string, unknown> | null {
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null
    return { ...(usage as Record<string, unknown>) }
  }

  function extractUsageCostForLog(usage: Record<string, unknown>): { cost: number | null; currency: string | null } {
    const rawCost = usage.cost
    let cost = parseNumberLike(rawCost)
    if (cost == null && rawCost && typeof rawCost === 'object') {
      const obj = rawCost as Record<string, unknown>
      cost =
        parseNumberLike(obj.amount) ??
        parseNumberLike(obj.value) ??
        parseNumberLike(obj.total) ??
        parseNumberLike(obj.usd)
    }
    const rawCurrency =
      (rawCost && typeof rawCost === 'object' ? (rawCost as Record<string, unknown>).currency : undefined) ??
      usage.cost_currency ??
      usage.currency
    const currency = typeof rawCurrency === 'string' && rawCurrency.trim().length > 0 ? rawCurrency.trim().toUpperCase() : null
    return { cost, currency }
  }

  function extractReasoningDetailsFromMeta(meta: unknown): unknown[] {
    const obj = asRecord(meta)
    const raw = obj?.reasoningDetailsRaw
    if (Array.isArray(raw)) return raw as unknown[]
    return []
  }

  function extractAnnotationsFromMeta(meta: unknown): unknown[] {
    const obj = asRecord(meta)
    const raw = obj?.annotations
    if (!Array.isArray(raw)) return []
    return raw.filter((item) => !!item && typeof item === 'object')
  }

  function isDataImageUrl(value: unknown): boolean {
    return typeof value === 'string' && value.startsWith('data:image/')
  }

  function resolveImageRenderUrl(asset: PersistedMessageImageAsset): string {
    const assetUrl = typeof asset.assetUrl === 'string' ? asset.assetUrl.trim() : ''
    if (assetUrl.length > 0) return assetUrl
    const fileUrl = typeof asset.fileUrl === 'string' ? asset.fileUrl.trim() : ''
    if (fileUrl.length > 0) return fileUrl
    return typeof asset.path === 'string' ? asset.path.trim() : ''
  }

  function collectMessageImageDataUrls(messageId: string): string[] {
    const id = String(messageId ?? '').trim()
    if (!id) return []
    const messages = state.value.entities?.messagesById ?? state.value.messages
    const message = messages[id]
    if (!message) return []
    const out: string[] = []
    for (const block of message.contentBlocks) {
      if (block.type !== 'image') continue
      if (!isDataImageUrl((block as any).url)) continue
      out.push(String((block as any).url))
    }
    return out
  }

  function replaceMessageDataImageBlocks(messageId: string, assets: ReadonlyArray<PersistedMessageImageAsset>) {
    const id = String(messageId ?? '').trim()
    if (!id) return

    const sortedAssets = assets
      .filter((asset) => String(asset.messageId ?? '').trim() === id)
      .sort((a, b) => a.ordinal - b.ordinal)
    if (sortedAssets.length === 0) return

    const replacementUrls = sortedAssets
      .map((asset) => resolveImageRenderUrl(asset))
      .filter((url) => url.length > 0)
    if (replacementUrls.length === 0) return

    const messages = state.value.entities?.messagesById ?? state.value.messages
    const message = messages[id]
    if (!message) return

    let changed = false
    let imageIndex = 0
    const nextBlocks = message.contentBlocks.map((block) => {
      if (block.type !== 'image') return block
      const currentUrl = String((block as any).url ?? '')
      if (!isDataImageUrl(currentUrl)) return block
      const nextUrl = replacementUrls[imageIndex] ?? replacementUrls[replacementUrls.length - 1]
      imageIndex += 1
      if (!nextUrl || nextUrl === currentUrl) return block
      changed = true
      return markRaw({ type: 'image', url: nextUrl }) as any
    })

    if (!changed) return
    const nextMessages: Record<string, MessageState> = {
      ...(state.value.entities?.messagesById ?? state.value.messages),
    }
    nextMessages[id] = { ...message, contentBlocks: markRaw(nextBlocks) }
    state.value = {
      ...state.value,
      messages: nextMessages,
      runMessageIds: state.value.runMessageIds,
      entities: { messagesById: nextMessages },
      views: state.value.views,
    }
  }

  function applyHydratedImageAssetsToState(assets: ReadonlyArray<PersistedMessageImageAsset>) {
    if (assets.length === 0) return
    const grouped = new Map<string, PersistedMessageImageAsset[]>()
    for (const asset of assets) {
      const messageId = String(asset.messageId ?? '').trim()
      if (!messageId) continue
      const list = grouped.get(messageId) ?? []
      list.push(asset)
      grouped.set(messageId, list)
    }
    if (grouped.size === 0) return

    const messages = state.value.entities?.messagesById ?? state.value.messages
    const nextMessages: Record<string, MessageState> = { ...messages }
    let changed = false

    for (const [messageId, refs] of grouped.entries()) {
      const message = nextMessages[messageId]
      if (!message) continue

      const imageBlocks = refs
        .slice()
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((asset) => resolveImageRenderUrl(asset))
        .filter((url) => url.length > 0)
        .map((url) => markRaw({ type: 'image', url }) as any)
      if (imageBlocks.length === 0) continue

      const baseBlocks = message.contentBlocks.filter((block) => block.type !== 'image')
      const nextBlocks = markRaw([...baseBlocks, ...imageBlocks])

      const currentImageUrls = message.contentBlocks
        .filter((block) => block.type === 'image')
        .map((block) => String((block as any).url ?? ''))
      const nextImageUrls = imageBlocks.map((block) => String((block as any).url ?? ''))
      const sameImages =
        currentImageUrls.length === nextImageUrls.length &&
        currentImageUrls.every((url, idx) => url === nextImageUrls[idx])
      if (sameImages && baseBlocks.length === message.contentBlocks.length - currentImageUrls.length) {
        continue
      }

      nextMessages[messageId] = { ...message, contentBlocks: nextBlocks }
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
  }

  function normalizeAnnotationForMerge(input: unknown): Record<string, unknown> | null {
    if (!input || typeof input !== 'object') return null
    return input as Record<string, unknown>
  }

  function annotationMergeKey(annotation: Record<string, unknown>): string {
    const type = typeof annotation.type === 'string' ? annotation.type : ''
    const citation =
      annotation.url_citation && typeof annotation.url_citation === 'object'
        ? (annotation.url_citation as Record<string, unknown>)
        : null

    if (type === 'url_citation' && citation) {
      const url = typeof citation.url === 'string' ? citation.url : ''
      const start = typeof citation.start_index === 'number' ? citation.start_index : ''
      const end = typeof citation.end_index === 'number' ? citation.end_index : ''
      return `url_citation|${url}|${start}|${end}`
    }

    try {
      return `raw|${JSON.stringify(annotation)}`
    } catch {
      return `raw|${String(annotation)}`
    }
  }

  function mergeAnnotationLists(
    prev: ReadonlyArray<Record<string, unknown>> | undefined,
    incoming: ReadonlyArray<unknown>,
    mergeStrategy: 'append' | 'replace'
  ): Record<string, unknown>[] | undefined {
    const normalized = incoming
      .map(normalizeAnnotationForMerge)
      .filter((item): item is Record<string, unknown> => !!item)

    if (mergeStrategy === 'replace') {
      if (normalized.length === 0) return undefined
      const out: Record<string, unknown>[] = []
      const indexByKey = new Map<string, number>()
      for (const ann of normalized) {
        const key = annotationMergeKey(ann)
        const existingIndex = indexByKey.get(key)
        if (typeof existingIndex === 'number') {
          out[existingIndex] = ann
          continue
        }
        indexByKey.set(key, out.length)
        out.push(ann)
      }
      return out.length > 0 ? out : undefined
    }

    const base = Array.isArray(prev) ? [...prev] : []
    if (normalized.length === 0) return base.length > 0 ? base : undefined

    const indexByKey = new Map<string, number>()
    for (let i = 0; i < base.length; i += 1) {
      indexByKey.set(annotationMergeKey(base[i]), i)
    }
    for (const ann of normalized) {
      const key = annotationMergeKey(ann)
      const existingIndex = indexByKey.get(key)
      if (typeof existingIndex === 'number') {
        base[existingIndex] = ann
        continue
      }
      indexByKey.set(key, base.length)
      base.push(ann)
    }
    return base.length > 0 ? base : undefined
  }

  function extractReasoningTextFromDetails(details: ReadonlyArray<unknown> | null | undefined): {
    reasoningText?: string
    summaryText?: string
    encryptedData?: string
    isEncrypted: boolean
  } {
    const items = Array.isArray(details) ? details : []
    let summaryText: string | undefined
    let encryptedData: string | undefined
    const reasoningTextParts: string[] = []
    let isEncrypted = false

    for (const detail of items) {
      if (!detail || typeof detail !== 'object') continue
      const type = (detail as any).type
      if (type === 'reasoning.text') {
        const text = (detail as any).text
        if (typeof text === 'string' && text.length > 0) reasoningTextParts.push(text)
        continue
      }
      if (type === 'reasoning.summary') {
        const summary = (detail as any).summary ?? (detail as any).text
        if (typeof summary === 'string' && summary.length > 0) summaryText = summary
        continue
      }
      if (type === 'reasoning.encrypted') {
        isEncrypted = true
        const data = (detail as any).data
        if (typeof data === 'string' && data.length > 0) {
          encryptedData = encryptedData ? encryptedData + data : data
        }
        continue
      }
    }

    const reasoningText = reasoningTextParts.length > 0 ? reasoningTextParts.join('') : undefined
    return { reasoningText, summaryText, encryptedData, isEncrypted }
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
  }>

  function toErrorPanelView(message: MessageVM): ErrorPanelViewModel | null {
    const envelope = message.errorEnvelope ?? null
    const summary = message.errorSummary ?? null
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
    const text = envelope?.openrouter?.message ?? summary?.message ?? 'Unknown error'

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
    if (!completionClass && !phase && !code && !message && !provider) return null
    return { completionClass, phase, code, message, provider }
  }

  async function persistMessageErrorEnvelope(messageId: string, envelope: ErrorEnvelope) {
    const id = String(messageId ?? '').trim()
    if (!id) return
    try {
      await upsertMessageErrorEnvelope({ messageId: id, envelope })
    } catch (err) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] persistMessageErrorEnvelope failed (non-fatal):', err)
      }
    }
  }

  const MAX_ERROR_HYDRATE = 200

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
    if (metaChanged) messageMetaById.value = nextMeta

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

  async function hydrateErrorEnvelopesForRows(
    rows: ReadonlyArray<Readonly<{ id: string; role: string; meta?: unknown }>>,
    token: number
  ) {
    const candidates: string[] = []
    for (const row of rows) {
      const id = String(row.id ?? '').trim()
      if (!id) continue
      const role = String((row as any)?.role ?? '').trim()
      if (role && role !== 'assistant') continue
      const meta = asRecord(row.meta)
      const hasSummary = !!meta?.error_summary
      const status = String((row as any)?.status ?? '').trim()
      const needsFallback = !hasSummary && (status === 'error' || status === 'aborted')
      if ((meta?.error_ref === true && !hasSummary) || needsFallback) {
        candidates.push(id)
      }
    }

    const ids = candidates.length > MAX_ERROR_HYDRATE
      ? candidates.slice(candidates.length - MAX_ERROR_HYDRATE)
      : candidates

    if (ids.length === 0) return

    const envelopes = await listMessageErrorEnvelopes(ids)
    if (transcriptRefreshToken.value !== token) return
    applyErrorEnvelopesToState(envelopes)
  }

  async function hydrateMessageAssetsForRows(
    rows: ReadonlyArray<Readonly<{ id: string; role: string }>>,
    token: number
  ) {
    const ids: string[] = []
    for (const row of rows) {
      const messageId = String(row.id ?? '').trim()
      if (!messageId) continue
      if (String(row.role ?? '').trim() !== 'assistant') continue
      ids.push(messageId)
    }
    if (ids.length === 0) return

    const assets = await listMessageImageAssetsByMessageIds(ids)
    if (transcriptRefreshToken.value !== token) return
    applyHydratedImageAssetsToState(assets)
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

  function getMessageTimingForPersist(messageId: string): {
    reasoningDurationMs?: number | null
    reasoningEndReason?: StreamEndReason | null
    reasoningDurationIsFallback?: boolean
  } {
    const id = String(messageId ?? '').trim()
    if (!id) return {}
    const messages = state.value.entities?.messagesById ?? state.value.messages
    const msg = messages[id]
    if (!msg) return {}
    return {
      reasoningDurationMs: msg.reasoningDurationMs ?? null,
      reasoningEndReason: msg.reasoningEndReason ?? null,
      reasoningDurationIsFallback: msg.reasoningDurationIsFallback === true,
    }
  }

  async function refreshModelLists() {
    if (!hasDbBridge()) {
      modelCatalogItems.value = []
      reasoningModelIndexItems.value = []
      modelCatalogNotice.value = '模型目录不可用（dbBridge 未就绪）'
      selectedModelImageCapabilityClass.value = null
      selectedModelImageCapabilityReason.value = 'dbBridge unavailable.'
      return
    }

    try {
      const [catalog, reasoningIndex] = await Promise.all([listModelCatalog('openrouter'), listReasoningModelIndex()])
      modelCatalogItems.value = catalog
      reasoningModelIndexItems.value = reasoningIndex

      if (catalog.length === 0 && reasoningIndex.length === 0) {
        modelCatalogNotice.value = '模型目录尚未同步（稍后自动刷新）'
      } else if (catalog.length === 0 && reasoningIndex.length > 0) {
        modelCatalogNotice.value = '模型目录为空（已回退到推理模型索引）'
      } else if (reasoningIndex.length === 0) {
        modelCatalogNotice.value = '推理模型索引尚未同步（仅显示目录）'
      } else {
        modelCatalogNotice.value = null
      }
      applySelectedModelOverrideForActiveConvo()
      await refreshSelectedModelImageCapability()
    } catch (err) {
      modelCatalogItems.value = []
      reasoningModelIndexItems.value = []
      modelCatalogNotice.value = '模型目录不可用（同步失败）'
      selectedModelImageCapabilityClass.value = null
      selectedModelImageCapabilityReason.value = 'model catalog sync failed.'
      if (shouldLogDebug()) {
        console.warn('[ui-app] refreshModelLists failed (non-fatal):', err)
      }
    }
  }

  const onModelsSynced = async () => {
    await refreshModelLists()
  }

  function hydrateStateFromPersistedMessages(
    convoId: string,
    rows: ReadonlyArray<Readonly<{ id: string; role: string; seq: number; body: string; meta?: unknown }>>
  ) {
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
      const annotations = extractAnnotationsFromMeta(meta)
      const hasEncryptedReasoning = reasoningDetailsRaw.some((detail) => detail && typeof detail === 'object' && (detail as any).type === 'reasoning.encrypted')
      const requestConfig = extractRequestReasoningConfigFromMeta(meta)
      const timing = extractReasoningTimingFromMeta(meta)
      const errorEnvelope = extractErrorEnvelopeFromMeta(meta)
      const errorSummary = extractErrorSummaryFromMeta(meta)

      s.messages[messageId] = {
        messageId,
        role,
        contentText,
        contentBlocks: markRaw(contentText.length > 0 ? [{ type: 'text', text: contentText }] : []),
        toolCalls: [],
        ...(annotations.length > 0 ? { annotations: markRaw(annotations) } : {}),
        reasoningDetailsRaw: markRaw(reasoningDetailsRaw),
        reasoningStreamingText: '',
        reasoningPieces: markRaw([]),
        reasoningLastPieceLen: 0,
        reasoningPanelState: 'collapsed',
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
    const qid = questionIdForMessage(answerRootMessageId, 'assistant')
    if (!qid) {
      if (import.meta.env?.DEV) {
        console.log('[ui-app] chosenQuestionIdForAnswerRootMessage: missing questionId (meta not ready?)', { answerRootMessageId })
      }
      return null
    }
    const chosen = turnFiltersByQuestionId.value.get(qid)?.chosenAnswerRootId
    if (!chosen || chosen !== answerRootMessageId) return null
    return qid
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

  function invalidateQuestionCandidatesForSlot(baseMessageId: string | null) {
    const slotKey = getQuestionSlotKey(baseMessageId)

    const nextEpoch = (questionCandidatesEpochBySlot.value.get(slotKey) ?? 0) + 1
    questionCandidatesEpochBySlot.value.set(slotKey, nextEpoch)
    questionCandidatesEpochBySlot.value = new Map(questionCandidatesEpochBySlot.value)

    if (questionCandidatesLoading.value.has(slotKey)) {
      questionCandidatesLoading.value.delete(slotKey)
      questionCandidatesLoading.value = new Map(questionCandidatesLoading.value)
    }

    if (questionCandidatesCache.value.has(slotKey)) {
      questionCandidatesCache.value.delete(slotKey)
      questionCandidatesCache.value = new Map(questionCandidatesCache.value)
    }
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
      const list = await getQuestionCandidates(bid, baseMessageId, { limit: 200 })

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
      const list = await getBranchCandidates(bid, qid, { limit: 200 })

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

  function getUserQuestionText(questionId: string): string {
    const qid = String(questionId ?? '').trim()
    if (!qid) return ''
    const msg = (state.value as any)?.messages?.[qid] as { contentText?: string } | undefined
    const text = typeof msg?.contentText === 'string' ? msg.contentText : ''
    return text.trim()
  }

  async function buildContextMessagesBeforeQuestion(branchId: string, questionId: string): Promise<InternalMessage[]> {
    const bid = String(branchId ?? '').trim()
    const qid = String(questionId ?? '').trim()
    if (!bid || !qid) return []

    const questionSeq = messageSeqById.value.get(qid)
    if (typeof questionSeq !== 'number' || !Number.isFinite(questionSeq)) return []

    const built = await buildContextForBranchInternalMessages(bid, { limit: 200, debug: !!import.meta.env?.DEV })
    const rowsBefore = built.rawMessages.filter((m) => typeof m.seq === 'number' && m.seq < questionSeq)
    return toInternalMessagesFromBranchPath(rowsBefore as any)
  }

  async function refreshTurnFilters(branchId: string) {
    const bid = String(branchId ?? '').trim()
    if (!bid) return

    const next = new Map<string, Readonly<EffectiveFilterResult & { chosenAnswerRootId: string }>>()

    try {
      const rendered = await getRenderableTurnsForBranch(bid, { limit: 5000, debug: !!import.meta.env?.DEV })
      if (import.meta.env?.DEV && rendered.debug) console.log('[ui-app] context.getRenderableTurns debug', rendered.debug)
      for (const t of rendered.turns) {
        if (!t.chosenAnswerRootId) continue
        next.set(t.questionId, {
          questionMode: t.questionMode,
          answerMode: t.answerMode,
          effectiveMode: t.effectiveMode,
          lockedByQuestionExclude: t.lockedByQuestionExclude,
          chosenAnswerRootId: t.chosenAnswerRootId,
        })
      }
    } catch (err) {
      if (import.meta.env?.DEV) console.warn('[ui-app] context.getRenderableTurns failed (filters UI may be incomplete)', err)
    }

    turnFiltersByQuestionId.value = next
  }

  async function flushPending(convoId: string, stream: ActiveStream) {
    if (stream.flushing.value) return
    const chunk = stream.pendingAppendText.value
    if (!chunk) return
    stream.flushing.value = true
    stream.pendingAppendText.value = ''
    try {
      await appendMessageDelta({ convoId, seq: stream.assistantSeq, appendBody: chunk })
    } finally {
      stream.flushing.value = false
    }
  }

  function clearFlushTimer(stream: ActiveStream) {
    if (!stream.flushTimer.id) return
    clearTimeout(stream.flushTimer.id)
    stream.flushTimer.id = null
  }

  function scheduleFlush(convoId: string, stream: ActiveStream, delayMs = 80) {
    if (stream.flushTimer.id) return
    stream.flushTimer.id = setTimeout(async () => {
      stream.flushTimer.id = null
      try {
        await flushPending(convoId, stream)
      } finally {
        if (stream.pendingAppendText.value.length > 0) scheduleFlush(convoId, stream, delayMs)
      }
    }, delayMs)
  }

  function clearReasoningFlushTimer(stream: ActiveStream) {
    if (!stream.reasoningFlushTimer.id) return
    clearTimeout(stream.reasoningFlushTimer.id)
    stream.reasoningFlushTimer.id = null
  }

  async function flushReasoningDetailSegments(stream: ActiveStream, assistantMessageId: string) {
    const pending = stream.pendingReasoningDetails.value
    if (!pending || pending.length === 0) return
    const batch = pending.splice(0, pending.length)
    try {
      const result = await appendReasoningDetailSegments({ messageId: assistantMessageId, details: batch })
      // 累加 DB 统计到 diagnosticTracker
      stream.diagnosticTracker.dbInserted += result.inserted
      stream.diagnosticTracker.dbSkipped += result.skipped
      stream.diagnosticTracker.dbIgnored += result.ignored
      stream.diagnosticTracker.dbSumDeltaLenInserted += result.sumDeltaLenInserted
      if (shouldLogReasoningDebug() && (result.ignored > 0 || result.skipped > 0)) {
        console.log('[reasoning-flush] batch stats', {
          received: result.received,
          inserted: result.inserted,
          skipped: result.skipped,
          ignored: result.ignored,
          sumDeltaLenInserted: result.sumDeltaLenInserted,
        })
      }
    } catch (err) {
      if (shouldLogReasoningDebug()) console.warn('[ui-app] appendReasoningDetailSegments failed (non-fatal):', err)
    }
  }

  function scheduleReasoningDetailFlush(stream: ActiveStream, assistantMessageId: string, delayMs = 250) {
    if (stream.reasoningFlushTimer.id) return
    stream.reasoningFlushTimer.id = setTimeout(async () => {
      stream.reasoningFlushTimer.id = null
      try {
        await flushReasoningDetailSegments(stream, assistantMessageId)
      } finally {
        if (stream.pendingReasoningDetails.value.length > 0) {
          scheduleReasoningDetailFlush(stream, assistantMessageId, delayMs)
        }
      }
    }, delayMs)
  }

  function buildReasoningRequestConfigSnapshot(input: Readonly<{
    requestedReasoningMode: RequestedReasoningMode
    requestedReasoningEffortValue?: ReasoningEffort
    requestedReasoningExclude: boolean
  }>): Readonly<{ raw: unknown; normalized: unknown; resolved: unknown }> {
    const { requestedReasoningMode, requestedReasoningEffortValue, requestedReasoningExclude } = input
    const effort = requestedReasoningMode === 'auto' ? 'auto' : (requestedReasoningEffortValue ?? 'none')
    const exclude = requestedReasoningMode === 'auto' || effort === 'none' ? false : requestedReasoningExclude
    const rawReasoning =
      requestedReasoningMode === 'auto'
        ? null
        : {
            effort: requestedReasoningEffortValue ?? 'none',
            ...(exclude ? { exclude: true } : {}),
          }

    const normalized = {
      mode: requestedReasoningMode,
      effort,
      exclude,
    }

    const resolved =
      requestedReasoningMode === 'auto'
        ? { mode: 'auto', effort: 'auto', exclude: false }
        : { mode: 'effort', effort: requestedReasoningEffortValue ?? 'none', exclude }

    return {
      raw: { reasoning: rawReasoning },
      normalized,
      resolved,
    }
  }

  async function refreshConvos() {
    loadError.value = null
    // 根据当前选中的项目进行 DB 端筛选
    // activeProjectId === null 表示"全部对话"，不传 projectId 参数
    const filterProjectId = activeProjectId.value
    convos.value = await listConvos({
      order: 'updatedAt',
      limit: 200,
      ...(filterProjectId !== null ? { projectId: filterProjectId } : {}),
    })
    const active = activeConvoId.value
    if (active && !convos.value.some((c) => c.id === active)) {
      activeConvoId.value = convos.value[0]?.id ?? null
    }
    if (!activeConvoId.value && convos.value.length > 0) activeConvoId.value = convos.value[0].id
  }

  function isLegacyPseudoProjectId(projectId: string): boolean {
    const id = String(projectId ?? '').trim().toLowerCase()
    return id === 'unassigned' || id === 'all'
  }

  async function refreshProjects() {
    loadError.value = null
    // 获取 Inbox
    const inbox = await getInbox()
    if (inbox) {
      inboxId.value = inbox.id
    }
    // 获取所有项目
    const listedProjects = await listProjects({ order: 'name', limit: 500 })
    projects.value = listedProjects.filter((p) => !isLegacyPseudoProjectId(p.id))
    // 更新项目计数（避免 N+1：批量获取）
    await refreshProjectCounts()
  }

  async function refreshProjectCounts() {
    if (projects.value.length === 0) {
      projectCounts.value = new Map()
      return
    }
    
    const projectIds = projects.value.map(p => p.id)
    projectCounts.value = await countConversationsBatch(projectIds)
  }

  async function refreshBranchesForActiveConvo() {
    const convoId = activeConvoId.value
    if (!convoId) {
      branches.value = []
      return
    }
    branches.value = await listBranches(convoId)
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

    // Anti-reordering: capture token before async operation.
    const myToken = ++transcriptRefreshToken.value
    const errorFallbacks = captureErrorFallbacks()
    const debug = isUiDebugEnabled()
    if (shouldLogDebug()) {
      console.log('[ui-app] loadTranscriptForBranch: fetching from DB', { branchId: bid, token: myToken, debug })
    }
    const rendered = await getRenderableTurnsForBranch(bid, { limit: 5000, debug })

    // Anti-reordering: discard if a newer refresh has started.
    if (transcriptRefreshToken.value !== myToken) {
      if (shouldLogDebug()) {
        console.log('[ui-app] loadTranscriptForBranch: discarding stale result', { branchId: bid, myToken, currentToken: transcriptRefreshToken.value })
      }
      return
    }
    if (debug && rendered.debug) console.log('[ui-app] context.getRenderableTurns debug', rendered.debug)
    const rows = rendered.messages
    hydrateStateFromPersistedMessages(
      bid,
      rows.map((m) => ({ id: m.id, role: m.role, seq: m.seq, body: m.body, meta: m.meta }))
    )
    applyErrorFallbacks(errorFallbacks)
    const seqMap = new Map<string, number>()
    for (const m of rows) seqMap.set(m.id, m.seq)
    messageSeqById.value = seqMap

    const metaMap = new Map<string, MessageMetaEntry>()
    for (const m of rows) {
      const completionOutcome = extractCompletionOutcomeFromMeta(m.meta ?? null)
      metaMap.set(m.id, {
        parentId: m.parentId ?? null,
        questionId: m.questionId ?? null,
        answerRootId: m.answerRootId ?? null,
        role: String(m.role ?? '').trim(),
        status: String(m.status ?? 'final'),
        completionOutcome,
      })
    }
    messageMetaById.value = metaMap
    if (shouldLogDebug()) {
      const statuses = [...metaMap.entries()].map(([id, m]) => ({ id: id.slice(0, 8), status: m.status }))
      console.log('[ui-app] loadTranscriptForBranch: updated messageMetaById', { statuses })
    }
    await hydrateErrorEnvelopesForRows(rows, myToken)
    await hydrateMessageAssetsForRows(rows, myToken)
    const next = new Map<string, Readonly<EffectiveFilterResult & { chosenAnswerRootId: string }>>()
    const order: string[] = []
    for (const t of rendered.turns) {
      order.push(t.questionId)
      if (!t.chosenAnswerRootId) continue
      next.set(t.questionId, {
        questionMode: t.questionMode,
        answerMode: t.answerMode,
        effectiveMode: t.effectiveMode,
        lockedByQuestionExclude: t.lockedByQuestionExclude,
        chosenAnswerRootId: t.chosenAnswerRootId,
      })
    }
    turnFiltersByQuestionId.value = next
    questionTurnOrder.value = order

    // Self-heal: candidate cache may become stale after operations that add/hide candidates
    // (regenerate/retryReplace). If the cached candidate list no longer contains the chosen answer root,
    // drop the cache for that question so the next ensureCandidatesLoaded() re-fetches.
    let invalidated = false
    for (const [qid, t] of next.entries()) {
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
    for (const qid of order) {
      const base = messageMetaById.value.get(qid)?.parentId ?? null
      const slotKey = getQuestionSlotKey(base)
      const cached = questionCandidatesCache.value.get(slotKey)
      if (!cached) continue
      if (cached.some((c) => c.questionId === qid)) continue
      questionCandidatesCache.value.delete(slotKey)
      qInvalidated = true
    }
    if (qInvalidated) questionCandidatesCache.value = new Map(questionCandidatesCache.value)

    for (const qid of next.keys()) {
      void ensureCandidatesLoaded(qid)
    }

    for (const qid of order) {
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
  async function finalizeRun(assistantMessageId: string) {
    // ① Refresh from DB first (get latest status into messageMetaById)
    try {
      await refreshTranscriptLatestOnly()
      if (import.meta.env?.DEV) {
        const meta = messageMetaById.value.get(assistantMessageId)
        console.log('[ui-app] finalizeRun: after refresh', { assistantMessageId, statusInMeta: meta?.status })
      }
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.warn('[ui-app] finalizeRun: refresh failed', err)
      }
    }
    
    // ② Then clear activeStream (single re-render with consistent state)
    clearActiveIfMatch(assistantMessageId)
    
    // ③ Assert invariants at stable boundary (after both refresh and clear complete)
    assertInvariants()
  }

  function clearActiveIfMatch(assistantMessageId: string) {
    const shouldClear = activeStream.value?.assistantMessageId === assistantMessageId
    if (import.meta.env?.DEV) {
      console.log('[ui-app] clearActiveIfMatch: checking', {
        currentActiveStream: activeStream.value?.assistantMessageId,
        targetMessageId: assistantMessageId,
        shouldClear
      })
    }
    if (shouldClear) {
      activeStream.value = null
      if (import.meta.env?.DEV) {
        console.log('[ui-app] clearActiveIfMatch: cleared activeStream')
      }
    } else if (import.meta.env?.DEV && activeStream.value) {
      console.warn('[ui-app] clearActiveIfMatch: activeStream mismatch, NOT clearing')
    }
  }

  async function loadTranscriptForActiveConvo() {
    const convoId = activeConvoId.value
    if (!convoId) {
      state.value = createInitialState()
      messageSeqById.value = new Map()
      activeBranchId.value = null
      branches.value = []
      messageMetaById.value = new Map()
      turnFiltersByQuestionId.value = new Map()
      questionTurnOrder.value = []
      applyReasoningPrefs(DEFAULT_REASONING_PREFS)
      applyImageGenerationStateForActiveConvo()
      return
    }

    const ensured = await ensureDefaultBranch(convoId, { name: 'Main' })
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
      await renameConvo(convoId, title)
      await refreshConvos()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onDeleteConvo(convoId: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      await deleteChatDraftsForConvo(convoId)
      await deleteConvo(convoId)
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
      await setConvoProject(convoId, projectId)
      await ensureProjectReasoningPrefsInitialized(projectId)
      await refreshConvos()
      await loadReasoningPrefsForActiveConvo()
      applyImageGenerationStateForActiveConvo()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onBulkDeleteConvos(convoIds: string[]) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      await Promise.all(convoIds.map((id) => deleteChatDraftsForConvo(id)))
      await deleteConvos(convoIds)
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
      await setConvoProjectMany(convoIds, projectId)
      await ensureProjectReasoningPrefsInitialized(projectId)
      await refreshConvos()
      await loadReasoningPrefsForActiveConvo()
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
      const created = await createProject({ name })
      
      // 如果是已存在的项目，直接选中，不刷新列表（避免不必要的 DB 查询）
      if (created.alreadyExists) {
        // 对系统项目（Inbox）给出特殊提示
        if ((created as any).isSystemProject) {
          console.info('[ui-app] Inbox is a system project, selected existing instance')
        }
        onSelectProject(created.id)
        return
      }
      
      // 仅在真正创建新项目时刷新列表
      await refreshProjects()
      onSelectProject(created.id)
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onRenameProject(projectId: string, name: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      await saveProject({ id: projectId, name })
      await refreshProjects()
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    }
  }

  async function onDeleteProject(projectId: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    try {
      const result = await deleteProject(projectId)
      if (!result.ok && result.error) {
        loadError.value = result.error.message
        return
      }
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
    const created = await createConvo({ title: `New chat ${new Date().toLocaleString()}` })
    await refreshConvos()
    if (created) activeConvoId.value = created.id
    await loadTranscriptForActiveConvo()
    assertInvariants() // Stable boundary: new conversation created and active
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

  const activeTitle = computed(() => convos.value.find((c) => c.id === activeConvoId.value)?.title ?? '')

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
    setAttachmentFeedback('warning', '目标历史附件对应的消息当前不可见。')
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
    setAttachmentFeedback('warning', '目标历史附件对应的消息当前不可见。')
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

  function historyAttachmentDetailText(item: MessageAttachmentVM | null): string {
    if (!item) return 'history attachment'
    const parts: string[] = []
    if (item.sourceKind && item.sourceKind !== 'unknown') parts.push(item.sourceKind)
    if (item.extension) parts.push(item.extension)
    if (parts.length === 0 && item.assetKind) parts.push(item.assetKind)
    return parts.join(' · ')
  }

  function buildHistoryConfirmationItemsFromReplayPrepared(
    prepared: PreparedOpenRouterReplay | null | undefined
  ): ConfirmationHistoryAttachmentItem[] {
    if (!prepared) return []
    const excluded = Array.isArray(prepared.excludedAttachments) ? prepared.excludedAttachments : []
    if (excluded.length === 0) return []
    const viewMap = new Map<string, MessageAttachmentVM>()
    for (const attachments of Object.values(historyAttachmentViewModelsByMessageId.value)) {
      for (const attachment of attachments) {
        viewMap.set(attachment.attachmentId, attachment)
      }
    }
    const out: ConfirmationHistoryAttachmentItem[] = []
    for (const row of excluded) {
      const attachmentId = String((row as any)?.attachmentId ?? '').trim()
      const messageId = String((row as any)?.messageId ?? '').trim()
      const assetId = String((row as any)?.assetId ?? '').trim()
      if (!attachmentId || !messageId) continue
      const vm = viewMap.get(attachmentId) ?? null
      const reasonCode = String((row as any)?.exclusionReason ?? 'history_attachment_excluded').trim() || 'history_attachment_excluded'
      out.push({
        attachmentId,
        messageId,
        assetId: assetId || (vm?.assetId ?? ''),
        filename: vm?.filename ?? (assetId || attachmentId),
        detailText: historyAttachmentDetailText(vm),
        reasonCode,
        reasonText: sanitizeHistoryAttachmentReason(String((row as any)?.reason ?? (row as any)?.message ?? reasonCode)),
        previewDataUrl: vm?.previewDataUrl ?? null,
        iconKind: vm?.iconKind ?? 'file',
      })
    }
    return out
  }

  function buildCurrentConfirmationItemsFromSendPlan(sendPlan: SendPlan): ConfirmationCurrentAttachmentItem[] {
    const draftByAssetId = new Map(draftAttachmentRecords.value.map((item) => [item.assetId, item]))
    const viewByAssetId = new Map(draftAttachmentViewModels.value.map((item) => [item.assetId, item]))
    const restoredAssetIdSet = editRestoredDraftAttachmentAssetIds.value
    const out: ConfirmationCurrentAttachmentItem[] = []
    for (const plan of sendPlan.attachmentPlans) {
      if (plan.source !== 'draft') continue
      if (plan.eligibility === 'included' || plan.eligibility === 'warning') continue
      const draftRecord = draftByAssetId.get(plan.assetId)
      if (!draftRecord) continue
      const view = viewByAssetId.get(plan.assetId)
      const reasonCode = String(plan.exclusionReason ?? plan.displayStatus ?? 'unsupported_attachment').trim() || 'unsupported_attachment'
      const source: 'draft' | 'edit_restored' =
        restoredAssetIdSet.has(plan.assetId) ? 'edit_restored' : 'draft'
      const detailParts: string[] = []
      if (view?.sourceKind) detailParts.push(view.sourceKind)
      if (view?.extension) detailParts.push(view.extension)
      if (detailParts.length === 0) detailParts.push(view?.assetKind ?? 'attachment')
      out.push({
        attachmentId: draftRecord.id,
        draftAttachmentId: draftRecord.id,
        assetId: plan.assetId,
        filename: view?.filename ?? plan.assetId,
        detailText: detailParts.join(' · '),
        reasonCode,
        reasonText: sanitizeSendPlanSummaryMessage(plan.notes?.[0] ?? '') ?? 'Current model or send gate cannot include this attachment.',
        previewDataUrl: view?.previewDataUrl ?? null,
        source,
      })
    }
    return out
  }

  function buildHistoryConfirmationItemsFromSendPlan(sendPlan: SendPlan): ConfirmationHistoryAttachmentItem[] {
    const viewMap = new Map<string, MessageAttachmentVM>()
    for (const attachments of Object.values(historyAttachmentViewModelsByMessageId.value)) {
      for (const attachment of attachments) {
        viewMap.set(attachment.attachmentId, attachment)
      }
    }
    const out: ConfirmationHistoryAttachmentItem[] = []
    for (const plan of sendPlan.attachmentPlans) {
      if (plan.source !== 'history') continue
      if (plan.eligibility === 'included' || plan.eligibility === 'warning') continue
      const messageId = String(plan.messageId ?? '').trim()
      if (!messageId) continue
      const vm = viewMap.get(plan.attachmentId) ?? null
      const reasonCode = String(plan.exclusionReason ?? plan.displayStatus ?? 'history_attachment_excluded').trim() || 'history_attachment_excluded'
      out.push({
        attachmentId: plan.attachmentId,
        messageId,
        assetId: plan.assetId,
        filename: vm?.filename ?? plan.assetId,
        detailText: historyAttachmentDetailText(vm),
        reasonCode,
        reasonText: sanitizeHistoryAttachmentReason(plan.notes?.[0] ?? reasonCode),
        previewDataUrl: vm?.previewDataUrl ?? null,
        iconKind: vm?.iconKind ?? 'file',
      })
    }
    return out
  }

  function buildAttachmentConfirmationSession(input: AttachmentConfirmationRequestInput): AttachmentConfirmationSession | null {
    if (input.historyItems.length === 0 && input.currentItems.length === 0) return null
    const titleByKind: Record<AttachmentConfirmationSessionKind, string> = {
      composer_send: '发送前确认附件',
      regenerate: '重新生成前确认附件',
      retry_replace: '替换重试前确认附件',
      edit_submit: '提交编辑前确认附件',
    }
    return {
      kind: input.kind,
      title: titleByKind[input.kind],
      historyItems: input.historyItems,
      currentItems: input.currentItems,
      historyAllExcluded: input.historyItems.length === 0,
      currentDecisionsByAttachmentId: Object.fromEntries(input.currentItems.map((item) => [item.attachmentId, null])),
      collapsed: false,
      historySectionExpanded: true,
      currentSectionExpanded: true,
      showHistoryValidation: false,
      currentValidationAttachmentId: null,
      validationMessage: null,
      historyLocateActive: false,
      historyLocateIndex: 0,
    }
  }

  async function requestAttachmentConfirmation(input: AttachmentConfirmationRequestInput): Promise<AttachmentConfirmationResult> {
    if (attachmentConfirmationSession.value) {
      return { confirmed: false, decisions: [] }
    }
    const session = buildAttachmentConfirmationSession(input)
    if (!session) return { confirmed: true, decisions: [] }
    return await new Promise<AttachmentConfirmationResult>((resolve) => {
      attachmentConfirmationResolver.value = resolve
      attachmentConfirmationSession.value = session
    })
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
        validationMessage: '请先确认：历史附件全部从本次模型上下文中排除。',
      }))
      await focusAttachmentConfirmationValidationTarget({ history: true })
      return
    }
    const missingCurrent = session.currentItems.find((item) => !session.currentDecisionsByAttachmentId[item.attachmentId]) ?? null
    if (missingCurrent) {
      mutateAttachmentConfirmationSession((prev) => ({
        ...prev,
        currentValidationAttachmentId: missingCurrent.attachmentId,
        validationMessage: '请为每个当前不受支持附件选择 exclude 或 remove。',
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
      setAttachmentFeedback('warning', '目标历史附件对应的消息当前不可见。')
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

  async function applyDraftAttachmentDecisions(decisions: ReadonlyArray<AttachmentDecision>): Promise<void> {
    const convoId = String(activeConvoId.value ?? '').trim()
    if (!convoId) return
    for (const decision of decisions) {
      if (decision.source === 'history') continue
      const draftRecord = draftAttachmentRecords.value.find((item) => item.id === decision.attachmentId)
      if (!draftRecord) continue
      if (decision.decision === 'remove') {
        await removeConversationDraftAttachment({
          conversationId: convoId,
          assetId: draftRecord.assetId,
        })
        if (editRestoredDraftAttachmentAssetIds.value.has(draftRecord.assetId)) {
          const next = new Set(editRestoredDraftAttachmentAssetIds.value)
          next.delete(draftRecord.assetId)
          editRestoredDraftAttachmentAssetIds.value = next
        }
        continue
      }
      await updateConversationDraftAttachmentSettings({
        conversationId: convoId,
        assetId: draftRecord.assetId,
        includeInNextRequest: false,
        excludedReason: 'manually_excluded',
      })
    }
    await refreshDraftAttachmentViewModels()
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
    const pendingImageGenerationCustom =
      imageGenerationConvoMode.value === 'custom'
        ? normalizeImageGenerationState(imageGenerationState.value)
        : null
    const created = await createConvo({ title: `New chat ${new Date().toLocaleString()}` })
    await refreshConvos()
    if (!created?.id) throw new Error('Failed to create conversation')
    activeConvoId.value = created.id
    await loadTranscriptForActiveConvo()
    if (pendingImageGenerationCustom) {
      imageGenerationConvoMode.value = 'custom'
      imageGenerationState.value = pendingImageGenerationCustom
      try {
        await persistImageGenerationConfigForActiveConvo({
          mode: 'custom',
          custom: pendingImageGenerationCustom,
        })
      } catch (err) {
        if (shouldLogDebug()) {
          console.warn('[ui-app] ensureActiveConvo persist pending image generation config failed (non-fatal):', err)
        }
      }
    }
    return created.id
  }

  async function ensureActiveBranch(convoId: string): Promise<BranchSummary> {
    const current = activeBranch.value
    if (current && current.convoId === convoId && current.deletedAt == null) return current
    const ensured = await ensureDefaultBranch(convoId, { name: 'Main' })
    await refreshBranchesForActiveConvo()
    if (!branches.value.some((b) => b.id === ensured.id)) branches.value = [ensured, ...branches.value]
    activeBranchId.value = ensured.id
    return ensured
  }

  async function onAbort() {
    const s = activeStream.value
    if (!s) return
    if (enableEventScheduler && activeBranchId.value) {
      eventScheduler.flushNow(activeBranchId.value, 'flush')
    }
    s.abort.abort('abort')
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
      rightRailOpen.value = true
      rightRailView.value = 'reasoning'
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
      const result = await truncateBranchFromQuestion(bid, qid)
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

  function getRequestedReasoningConfig(): Readonly<{
    requestedReasoningMode: RequestedReasoningMode
    requestedReasoningEffortValue?: ReasoningEffort
    requestedReasoningExclude: boolean
  }> {
    const requestedReasoningMode: RequestedReasoningMode = requestedReasoningEffort.value === 'auto' ? 'auto' : 'effort'
    const requestedReasoningEffortValue: ReasoningEffort | undefined =
      requestedReasoningMode === 'auto' ? undefined : (requestedReasoningEffort.value as ReasoningEffort)
    const requestedReasoningExcludeValue =
      requestedReasoningMode === 'auto' || requestedReasoningEffortValue === 'none' ? false : requestedReasoningExclude.value
    return {
      requestedReasoningMode,
      requestedReasoningEffortValue,
      requestedReasoningExclude: requestedReasoningExcludeValue,
    }
  }

  const DEFAULT_REASONING_PREFS: ReasoningPrefs = { mode: 'auto', effort: 'auto', exclude: false }
  const REASONING_EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']

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

  function extractReasoningPrefs(meta: unknown): ReasoningPrefs | null {
    if (!meta || typeof meta !== 'object') return null
    return normalizeReasoningPrefs((meta as any).reasoningPrefs)
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

  function mergeReasoningPrefsIntoMeta(meta: unknown, prefs: ReasoningPrefs): Record<string, unknown> {
    const base = meta && typeof meta === 'object' ? { ...(meta as Record<string, unknown>) } : {}
    return { ...base, reasoningPrefs: prefs }
  }

  function getActiveConvoRecord(): ConvoSummary | null {
    const convoId = activeConvoId.value
    if (!convoId) return null
    return convos.value.find((c) => c.id === convoId) ?? null
  }

  function updateLocalConvoMeta(convoId: string, nextMeta: Record<string, unknown> | null) {
    convos.value = convos.value.map((c) => (c.id === convoId ? { ...c, meta: nextMeta } : c))
  }

  async function persistConvoMetaUpdate(convo: ConvoSummary, nextMeta: Record<string, unknown> | null) {
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
    return deserializeChatSessionConfigFromConvoMeta({
      convoMeta: convo?.meta ?? null,
      projectMeta,
      globalReasoningPrefs: globalReasoningPrefs.value,
      globalWebSearchDefaults: globalWebSearchDefaults.value,
      globalSamplingParamsDefaults: globalSamplingParamsDefaults.value,
      globalImageGenerationDefault: globalImageGenerationDefault.value,
      defaultModelKey: DEFAULT_CHAT_MODEL_ID,
    })
  }

  const activeSessionConfig = computed(() => getChatSessionConfigForConvo(getActiveConvoRecord()))

  async function updateActiveConvoSessionConfig(patch: ChatSessionConfigPatch): Promise<ChatSessionConfig | null> {
    const convo = getActiveConvoRecord()
    if (!convo) return null
    const current = getChatSessionConfigForConvo(convo)
    const nextConfig = mergeChatSessionConfig(current, patch)
    const nextMeta = serializeChatSessionConfigToConvoMeta({
      baseMeta: convo.meta ?? null,
      config: nextConfig,
      convoProjectId: convo.projectId ?? null,
      defaultModelKey: DEFAULT_CHAT_MODEL_ID,
    })
    updateLocalConvoMeta(convo.id, nextMeta)
    await persistConvoMetaUpdate(convo, nextMeta)
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

  async function onUpdateReasoningEffortLevel(nextEffort: 'low' | 'medium' | 'high') {
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
    await updateActiveConvoSessionConfig({
      webSearch: {
        enabled: nextEnabled,
        level: current.level,
        detail: current.detail,
      },
    })
  }

  async function onUpdateWebSearchLevel(nextLevel: 'low' | 'high') {
    if (isDraftInteractionLocked.value) return
    const current = activeSessionConfig.value.webSearch
    await updateActiveConvoSessionConfig({
      webSearch: {
        enabled: current.enabled,
        level: nextLevel,
        detail: current.detail,
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

  async function onUpdateImageGenerationResolution(nextResolution: '1K' | '2K' | '4K') {
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

  async function onUpdateImageGenerationAspectRatio(nextAspectRatio: '16:9' | '3:4' | '1:1' | '4:3') {
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
    }
  }

  function toggleRightRailOpen() {
    rightRailOpen.value = !rightRailOpen.value
  }

  function setRightRailView(view: 'reasoning' | 'console') {
    rightRailView.value = view
  }

  function applySessionConfigToUi(config: ChatSessionConfig) {
    skipReasoningPrefSave.value = true
    model.value = normalizeModelKey(config.model.selectedModelKey ?? DEFAULT_CHAT_MODEL_ID)
    requestedReasoningEffort.value = config.reasoning.enabled ? config.reasoning.effort : 'auto'
    requestedReasoningExclude.value = false
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

  function getElectronApi(): Readonly<{
    selectLocalFiles: (options?: { context?: 'file' | 'image'; allowMultiple?: boolean }) => Promise<{ filePaths: string[] } | null>
  }> | null {
    const api = (globalThis as any)?.electronAPI as
      | Readonly<{
        selectLocalFiles: (options?: { context?: 'file' | 'image'; allowMultiple?: boolean }) => Promise<{ filePaths: string[] } | null>
      }>
      | undefined
    return api && typeof api.selectLocalFiles === 'function' ? api : null
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
    historyAttachmentPreviewCache.value = {}
    historyAttachmentPreviewEnsuring.clear()
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

  function scheduleDraftAttachmentParsingPoll() {
    clearDraftAttachmentParsingPollTimer()
    if (!draftAttachmentViewModels.value.some((item) => item.isParsing)) return
    draftAttachmentParsingPollTimer.value = setTimeout(() => {
      void refreshDraftAttachmentViewModels()
    }, 1400)
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

  function sanitizeHistoryAttachmentReason(reason: string | null | undefined): string {
    const sanitized = sanitizeSendPlanSummaryMessage(reason)
    if (sanitized) return sanitized
    return '当前模型不会纳入此历史附件。'
  }

  function buildHistoryIncompatibleAttachmentItem(
    plan: SendPlanAttachment,
    assetById: ReadonlyMap<string, DecodedFileAsset>,
    branchId: string | null,
  ): HistoryIncompatibleAttachmentViewModel {
    const asset = assetById.get(plan.assetId)
    const filename = String(asset?.filename ?? '').trim() || plan.assetId
    const incompatible = plan.displayStatus === 'incompatible_with_current_model'
    return {
      messageId: String(plan.messageId ?? '').trim(),
      attachmentId: plan.attachmentId,
      assetId: plan.assetId,
      filename,
      aiPayloadKind: plan.aiPayloadKind,
      reasonCode: incompatible
        ? 'incompatible_with_current_model'
        : String(plan.exclusionReason ?? 'excluded_from_current_context'),
      reasonText: sanitizeHistoryAttachmentReason(plan.notes?.[0] ?? null),
      source: 'history',
      branchId,
      displayStatus: incompatible ? 'incompatible_with_current_model' : 'excluded_from_current_context',
    }
  }

  function applyHistoryIncompatibleAttachmentItems(items: HistoryIncompatibleAttachmentViewModel[]) {
    const next = items.filter((item) => item.messageId.length > 0)
    const prevActiveAttachmentId = activeHistoryIncompatibleAttachmentId.value
    historyIncompatibleAttachmentItems.value = next
    if (next.length === 0) {
      historyIncompatibleAttachmentIndex.value = 0
      historyIncompatibleNavigationActive.value = false
      activeHistoryIncompatibleAttachmentId.value = null
      return
    }
    const matchedIndex = prevActiveAttachmentId
      ? next.findIndex((item) => item.attachmentId === prevActiveAttachmentId)
      : -1
    const nextIndex = matchedIndex >= 0 ? matchedIndex : normalizeHistoryIncompatibleIndex(historyIncompatibleAttachmentIndex.value, next.length)
    historyIncompatibleAttachmentIndex.value = nextIndex
    activeHistoryIncompatibleAttachmentId.value = next[nextIndex]?.attachmentId ?? null
  }

  async function computeHistoryScopeMessageIds(branchId: string): Promise<string[]> {
    const built = await buildContextForBranchInternalMessages(branchId, { limit: 200, debug: !!import.meta.env?.DEV })
    return built.rawMessages.map((message) => message.id)
  }

  async function refreshHistoryIncompatibleAttachments() {
    const seq = ++historyIncompatibleRefreshSeq
    const convoId = String(activeConvoId.value ?? '').trim()
    const branchId = String(activeBranchId.value ?? '').trim()
    if (!convoId || !branchId) {
      resetHistoryIncompatibleAttachmentSummary()
      return
    }
    try {
      const historyMessageIds = await computeHistoryScopeMessageIds(branchId)
      if (seq !== historyIncompatibleRefreshSeq) return
      if (historyMessageIds.length === 0) {
        resetHistoryIncompatibleAttachmentSummary()
        return
      }
      const [modelDescriptor, baseUrl] = await Promise.all([
        buildSendPlanModelDescriptor(model.value),
        getOpenRouterBaseUrl().catch(() => null),
      ])
      if (seq !== historyIncompatibleRefreshSeq) return
      const response = await buildCurrentSendPlan({
        conversationId: convoId,
        draftText: draft.value,
        historyScope: { messageIds: historyMessageIds },
        model: modelDescriptor,
        providerContext: buildSendPlanProviderContext(baseUrl),
      })
      if (seq !== historyIncompatibleRefreshSeq) return
      const assetById = new Map(response.assets.map((asset) => [asset.id, asset]))
      const editingSourceMessageId = String(draftPersistenceEditingSourceMessageId.value ?? '').trim()
      const editingAssetIdSet = editRestoredDraftAttachmentAssetIds.value
      const items = response.sendPlan.attachmentPlans
        .filter((plan) => plan.source === 'history')
        .filter((plan) => {
          if (draftPersistenceMode.value !== 'edit') return true
          if (editingSourceMessageId && String(plan.messageId ?? '').trim() === editingSourceMessageId) return false
          if (editingAssetIdSet.has(String(plan.assetId ?? '').trim())) return false
          return true
        })
        .filter((plan) => plan.displayStatus === 'incompatible_with_current_model' || plan.eligibility === 'excluded')
        .map((plan) => buildHistoryIncompatibleAttachmentItem(plan, assetById, branchId))
      applyHistoryIncompatibleAttachmentItems(items)
    } catch (error) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] refreshHistoryIncompatibleAttachments failed (non-fatal):', error)
      }
      resetHistoryIncompatibleAttachmentSummary()
    }
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

    try {
      const attachmentResults = await Promise.all(
        visibleUserMessageIds.map(async (messageId) => {
          try {
            const attachments = await listMessageAttachmentsByMessageId(messageId)
            return { messageId, attachments, failed: false as const }
          } catch (error) {
            if (shouldLogDebug()) {
              console.warn('[ui-app] listMessageAttachmentsByMessageId failed (non-fatal):', { messageId, error })
            }
            return { messageId, attachments: [] as DecodedMessageAttachment[], failed: true as const }
          }
        }),
      )
      if (seq !== historyAttachmentRefreshSeq) return

      const allAttachments = attachmentResults.flatMap((row) => row.attachments)
      const assetIds = Array.from(new Set(allAttachments.map((attachment) => attachment.assetId).filter((assetId) => String(assetId ?? '').trim().length > 0)))
      let assets: DecodedFileAsset[] = []
      if (assetIds.length > 0) {
        try {
          assets = await listFileAssetsByIds(assetIds)
        } catch (error) {
          if (shouldLogDebug()) {
            console.warn('[ui-app] listFileAssetsByIds failed (non-fatal):', error)
          }
          assets = []
        }
      }
      if (seq !== historyAttachmentRefreshSeq) return

      const assetById = new Map(assets.map((asset) => [asset.id, asset]))
      const next: Record<string, MessageAttachmentVM[]> = {}

      for (const result of attachmentResults) {
        if (seq !== historyAttachmentRefreshSeq) return

        if (result.failed) {
          next[result.messageId] = [buildHistoryAttachmentFailureViewModel(result.messageId, '附件加载失败。')]
          continue
        }

        const sortedAttachments = [...result.attachments].sort((left, right) => {
          if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt
          if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt
          return left.id.localeCompare(right.id)
        })

        const views = await Promise.all(
          sortedAttachments.map(async (attachment) => {
            if (seq !== historyAttachmentRefreshSeq) {
              return buildHistoryAttachmentFailureViewModel(result.messageId, '附件加载失败。')
            }
            const asset = assetById.get(attachment.assetId) ?? null
            const preview = await resolveHistoryAttachmentPreview(attachment, asset, seq)
            if (seq !== historyAttachmentRefreshSeq) {
              return buildHistoryAttachmentFailureViewModel(result.messageId, '附件加载失败。')
            }
            return buildHistoryAttachmentViewModel(
              attachment,
              asset,
              preview?.status === 'ready' ? preview.dataUrl ?? null : null,
            )
          }),
        )
        next[result.messageId] = views
      }

      if (seq !== historyAttachmentRefreshSeq) return
      historyAttachmentViewModelsByMessageIdBase.value = next
    } catch (error) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] refreshHistoryAttachmentViewModels failed (non-fatal):', error)
      }
      resetHistoryAttachmentViewModels()
    }
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
    return mode === 'link_and_file' ? 'link_and_file' : 'link_only'
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
    if (status === 'incompatible_with_current_model') return 'Current model does not support this attachment.'
    if (status === 'unsupported') return 'This attachment type is unsupported.'
    return 'Attachment is not ready to send.'
  }

  function buildFallbackDraftAttachmentViewModel(
    attachment: DecodedDraftAttachment,
    asset: DecodedFileAsset | null,
  ): DraftAttachmentViewModel {
    const status = normalizeDraftAttachmentDisplayStatus(null, attachment, asset)
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
      warningReason: getDraftAttachmentWarningReason(null, status),
      blockingReason: getDraftAttachmentBlockingReason(null, status),
      previewDataUrl: null,
      canRemove: true,
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

  function isImageHistoryAttachment(asset: DecodedFileAsset | null, attachment: DecodedMessageAttachment): boolean {
    if (asset?.assetKind === 'image') return true
    if (attachment.aiPayloadKind === 'image') return true
    const extension = normalizeExtension(asset?.extension ?? asset?.filename ?? '')
    return extension ? ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(extension) : false
  }

  function isHistoryAttachmentUrlBased(asset: DecodedFileAsset | null): boolean {
    if (!asset) return false
    if (asset.sourceKind === 'url_import') return true
    const meta = readAssetSourceMeta(asset)
    return !!(readMetaString(meta, 'originalUrl') || readMetaString(meta, 'resolvedUrl'))
  }

  function resolveHistoryAttachmentIconKind(asset: DecodedFileAsset | null, attachment: DecodedMessageAttachment): MessageAttachmentVM['iconKind'] {
    if (isImageHistoryAttachment(asset, attachment)) return 'image'
    if (attachment.aiPayloadKind === 'pdf') return 'pdf'
    if (attachment.aiPayloadKind === 'text') return 'text'
    if (attachment.aiPayloadKind === 'audio') return 'audio'
    if (attachment.aiPayloadKind === 'video') return 'video'
    if (asset?.assetKind === 'archive' || asset?.assetKind === 'binary' || attachment.aiPayloadKind === 'binary') return 'file'
    if (isHistoryAttachmentUrlBased(asset)) return 'link'
    return 'file'
  }

  function resolveHistoryAttachmentDisplayStatus(
    attachment: DecodedMessageAttachment,
    asset: DecodedFileAsset | null,
    incompatibleDisplayStatus: HistoryIncompatibleAttachmentDisplayStatus | null,
  ): MessageAttachmentDisplayStatus {
    if (incompatibleDisplayStatus) {
      return incompatibleDisplayStatus
    }
    if (attachment.processingStatus === 'pending' || attachment.processingStatus === 'probing' || attachment.processingStatus === 'materializing') {
      return 'parsing'
    }
    if (attachment.processingStatus === 'unsupported' || asset?.assetKind === 'archive' || asset?.assetKind === 'binary' || attachment.aiPayloadKind === 'binary') {
      return 'unsupported'
    }
    if (!asset || asset.deletedAt != null || asset.ingestStatus === 'failed') {
      return 'failed'
    }
    if (attachment.processingStatus === 'local_only' || attachment.processingStatus === 'convertible') {
      return 'ready_with_warnings'
    }
    if (isHistoryAttachmentUrlBased(asset)) {
      return 'ready_with_warnings'
    }
    return 'ready'
  }

  function mapHistoryAttachmentBorderTone(status: MessageAttachmentDisplayStatus): MessageAttachmentVM['borderTone'] {
    if (status === 'ready') return 'green'
    if (status === 'ready_with_warnings') return 'yellow'
    if (status === 'parsing') return 'neutral'
    return 'red'
  }

  function buildHistoryAttachmentFailureViewModel(messageId: string, reason: string): MessageAttachmentVM {
    const normalizedMessageId = String(messageId ?? '').trim()
    const attachmentId = `history-attachment-load-${normalizedMessageId || 'unknown'}`
    return {
      messageId: normalizedMessageId,
      attachmentId,
      assetId: attachmentId,
      filename: reason,
      extension: null,
      mime: null,
      assetKind: 'binary',
      aiPayloadKind: 'binary',
      sourceKind: 'unknown',
      displayStatus: 'failed',
      borderTone: 'red',
      isHistoryIncompatible: false,
      incompatibilityReason: reason,
      isActiveLocatedAttachment: false,
      previewDataUrl: null,
      iconKind: 'file',
      createdAt: Date.now(),
    }
  }

  function buildHistoryAttachmentViewModel(
    attachment: DecodedMessageAttachment,
    asset: DecodedFileAsset | null,
    previewDataUrl: string | null,
  ): MessageAttachmentVM {
    const filename = asset?.filename?.trim().length ? asset.filename : attachment.assetId
    const extension = asset?.extension ?? normalizeExtension(filename)
    const displayStatus = resolveHistoryAttachmentDisplayStatus(attachment, asset, null)
    return {
      messageId: attachment.messageId,
      attachmentId: attachment.id,
      assetId: attachment.assetId,
      filename,
      extension,
      mime: asset?.mime ?? null,
      assetKind: asset?.assetKind ?? attachment.aiPayloadKind,
      aiPayloadKind: attachment.aiPayloadKind,
      sourceKind: asset?.sourceKind ?? 'unknown',
      displayStatus,
      borderTone: mapHistoryAttachmentBorderTone(displayStatus),
      isHistoryIncompatible: false,
      incompatibilityReason: null,
      isActiveLocatedAttachment: false,
      previewDataUrl,
      iconKind: resolveHistoryAttachmentIconKind(asset, attachment),
      createdAt: asset?.createdAt ?? attachment.createdAt,
    }
  }

  async function resolveHistoryAttachmentPreview(
    attachment: DecodedMessageAttachment,
    asset: DecodedFileAsset | null,
    seq: number,
  ): Promise<HistoryAttachmentPreviewState> {
    if (!isImageHistoryAttachment(asset, attachment)) return null

    const cached = historyAttachmentPreviewCache.value[attachment.assetId]
    if (cached?.status === 'ready') return cached

    try {
      const latest = await getLatestReadyPreview(attachment.assetId)
      if (seq !== historyAttachmentRefreshSeq) return latest
      historyAttachmentPreviewCache.value = {
        ...historyAttachmentPreviewCache.value,
        [attachment.assetId]: latest,
      }
      if (latest.status === 'ready') return latest
      if (latest.status !== 'missing') return latest

      if (historyAttachmentPreviewEnsuring.has(attachment.assetId)) return latest
      historyAttachmentPreviewEnsuring.add(attachment.assetId)
      try {
        const ensured = await ensurePreview({ assetId: attachment.assetId })
        if (seq !== historyAttachmentRefreshSeq) return ensured
        historyAttachmentPreviewCache.value = {
          ...historyAttachmentPreviewCache.value,
          [attachment.assetId]: ensured,
        }
        return ensured
      } finally {
        historyAttachmentPreviewEnsuring.delete(attachment.assetId)
      }
    } catch (error) {
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
      historyAttachmentPreviewCache.value = {
        ...historyAttachmentPreviewCache.value,
        [attachment.assetId]: failed,
      }
      return failed
    }
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

  function resolveAttachmentSendModeLabel(value: DraftAttachmentSendModePreference): string {
    if (value === 'default') return '跟随默认设定'
    if (value === 'auto') return '自动'
    if (value === 'url_ref') return '链接'
    return '文件副本'
  }

  function resolveActualSendModeLabel(value: SendMode | null): string {
    if (value === 'url_ref') return '链接'
    if (value === 'inline_base64') return '文件副本'
    if (value === 'provider_file_ref') return '提供方文件'
    return '—'
  }

  function resolveAttachmentUrlRetentionLabel(value: DraftAttachmentUrlRetentionPreference): string {
    if (value === 'default') return '跟随默认设定'
    if (value === 'link_only') return '仅保留链接'
    return '保留链接并尝试保存本地副本'
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
      return plan?.notes?.[0] ?? 'No sendable representation is available for this attachment.'
    }
    if (mode === 'url_ref') {
      if (attachment.aiPayloadKind === 'audio') return '音频附件不支持链接发送。'
      if (!isUrlAttachment(asset, attachment)) return '当前附件没有可保留的链接。'
      if (plan?.selectedSendMode === 'url_ref' || (plan?.fallbackSendModes?.includes('url_ref') ?? false)) return null
      if (plan?.exclusionReason) return plan.notes?.[0] ?? '当前模型或提供方不允许链接发送。'
      return '当前模型或提供方不允许链接发送。'
    }
    if (!isStoredLocalCopy(asset)) return '当前附件没有可用的本地副本。'
    if (plan?.selectedSendMode === 'inline_base64' || (plan?.fallbackSendModes?.includes('inline_base64') ?? false)) return null
    if (plan?.exclusionReason) return plan.notes?.[0] ?? '当前模型或提供方不允许文件副本发送。'
    return '当前模型或提供方不允许文件副本发送。'
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
        reason: isUrl ? null : '仅 URL 附件支持保留方式设置。',
      },
      {
        value: 'link_only',
        label: resolveAttachmentUrlRetentionLabel('link_only'),
        disabled: !isUrl,
        reason: isUrl ? null : '仅 URL 附件支持保留方式设置。',
      },
      {
        value: 'link_and_file',
        label: resolveAttachmentUrlRetentionLabel('link_and_file'),
        disabled: !isUrl,
        reason: isUrl ? null : '仅 URL 附件支持保留方式设置。',
      },
    ]
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
    const retryPreviewAvailable = isImageAssetLike(asset, attachment) && base.previewDataUrl == null && base.displayStatus !== 'parsing'
    const retryPreviewReason = retryPreviewAvailable ? null : '仅在图片预览缺失或失败时可重试。'
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
    }
  }

  async function resolveDraftAttachmentPreview(
    attachment: DecodedDraftAttachment,
    asset: DecodedFileAsset | null,
    seq: number,
    forceEnsure = false,
  ): Promise<DecodedPreviewPayload | null> {
    if (!isImageAssetLike(asset, attachment)) return null

    const cached = draftAttachmentPreviewCache.value[attachment.assetId]
    if (cached?.status === 'ready') return cached

    try {
      const previewBridge = (globalThis as any).dbBridge as { invoke?: (method: string, params?: unknown) => Promise<unknown> } | undefined
      if (!previewBridge?.invoke) {
        throw new Error('Missing dbBridge for preview lookup')
      }
      const latestRaw = await previewBridge.invoke('preview.getLatestReady', { assetId: attachment.assetId })
      const latest = decodePreviewPayloadResponse('preview.getLatestReady', latestRaw)
      if (seq !== draftAttachmentRefreshSeq) return latest
      draftAttachmentPreviewCache.value = {
        ...draftAttachmentPreviewCache.value,
        [attachment.assetId]: latest,
      }
      if (latest.status === 'ready') return latest
      if (latest.status !== 'missing' && !forceEnsure) return latest

      if (draftAttachmentPreviewEnsuring.has(attachment.assetId)) return latest
      draftAttachmentPreviewEnsuring.add(attachment.assetId)
      try {
        const ensuredRaw = await previewBridge.invoke('preview.ensure', { assetId: attachment.assetId })
        const ensured = decodePreviewPayloadResponse('preview.ensure', ensuredRaw)
        if (seq !== draftAttachmentRefreshSeq) return ensured
        draftAttachmentPreviewCache.value = {
          ...draftAttachmentPreviewCache.value,
          [attachment.assetId]: ensured,
        }
        return ensured
      } finally {
        draftAttachmentPreviewEnsuring.delete(attachment.assetId)
      }
    } catch (error) {
      if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
        console.warn('[ui-app] resolveDraftAttachmentPreview failed (non-fatal):', error)
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
      draftAttachmentSendPlanStatus.value = null
      selectedDraftAttachmentAssetId.value = null
      resetComposerSendPlanGateState()
      composerSendPlanLoading.value = false
      resetHistoryIncompatibleAttachmentSummary()
      return
    }

    const seq = ++draftAttachmentRefreshSeq
    const shouldToggleComposerSendPlanLoading =
      composerSendPlanStatus.value == null &&
      composerSendPlanBlockingSummary.value == null &&
      composerSendPlanWarningSummary.value == null
    if (shouldToggleComposerSendPlanLoading) {
      composerSendPlanLoading.value = true
    }
    const restored = input?.restoredDraft ?? await restoreConversationDraft(scope.convoId)
    if (seq !== draftAttachmentRefreshSeq) return
    applyDraftPersistenceStateFromDraft(restored)

    if (input?.syncDraftText === true) {
      draft.value = restored.draftText
    }

    const attachments = [...restored.attachments].sort((left, right) => left.attachmentOrder - right.attachmentOrder)
    draftAttachmentRecords.value = attachments
    try {
      const [modelDescriptor, baseUrl] = await Promise.all([
        buildSendPlanModelDescriptor(model.value),
        getOpenRouterBaseUrl().catch(() => null),
      ])
      if (seq !== draftAttachmentRefreshSeq) return

      const sendPlanResponse = await buildCurrentSendPlan({
        conversationId: scope.convoId,
        draftText: draft.value,
        model: modelDescriptor,
        providerContext: buildSendPlanProviderContext(baseUrl),
      })
      if (seq !== draftAttachmentRefreshSeq) return

      const assetById = new Map(sendPlanResponse.assets.map((asset) => [asset.id, asset]))
      const draftPlans = new Map(
        sendPlanResponse.sendPlan.attachmentPlans
          .filter((plan) => plan.source === 'draft')
          .map((plan) => [plan.assetId, plan]),
      )
      draftAttachmentAssetsById.value = Object.fromEntries(assetById.entries())
      draftAttachmentPlansByAssetId.value = Object.fromEntries(draftPlans.entries())
      draftAttachmentSendPlanStatus.value = sendPlanResponse.sendPlan.status
      applyComposerSendPlanGateState(sendPlanResponse.sendPlan)

      const next: DraftAttachmentViewModel[] = []
      for (const attachment of attachments) {
        if (seq !== draftAttachmentRefreshSeq) return
        const asset = assetById.get(attachment.assetId) ?? null
        const plan = draftPlans.get(attachment.assetId) ?? null
        const preview = await resolveDraftAttachmentPreview(attachment, asset, seq)
        if (seq !== draftAttachmentRefreshSeq) return
        next.push(buildDraftAttachmentViewModel(attachment, asset, plan, preview?.dataUrl ?? null))
      }
      draftAttachmentViewModels.value = next
      if (selectedDraftAttachmentAssetId.value && !next.some((item) => item.assetId === selectedDraftAttachmentAssetId.value)) {
        selectedDraftAttachmentAssetId.value = null
      }
      scheduleDraftAttachmentParsingPoll()
      if (seq === draftAttachmentRefreshSeq && shouldToggleComposerSendPlanLoading) {
        composerSendPlanLoading.value = false
      }
      scheduleHistoryIncompatibleRefresh()
      return
    } catch (error) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] refreshDraftAttachmentViewModels send-plan fallback (non-fatal):', error)
      }
    }

    const fallback: DraftAttachmentViewModel[] = attachments.map((attachment) => {
      const asset = null
      return buildFallbackDraftAttachmentViewModel(attachment, asset)
    })
    if (seq !== draftAttachmentRefreshSeq) return
    draftAttachmentAssetsById.value = {}
    draftAttachmentPlansByAssetId.value = {}
    draftAttachmentSendPlanStatus.value = null
    draftAttachmentViewModels.value = fallback
    const fallbackBlocking = fallback
      .map((item) => item.blockingReason)
      .find((value) => typeof value === 'string' && value.trim().length > 0) ?? null
    const fallbackWarning = fallback
      .map((item) => item.warningReason)
      .find((value) => typeof value === 'string' && value.trim().length > 0) ?? null
    composerSendPlanStatus.value = null
    composerSendPlanCanProceed.value = fallbackBlocking == null
    composerSendPlanBlockingSummary.value = fallbackBlocking
    composerSendPlanWarningSummary.value = fallbackBlocking ? null : fallbackWarning
    composerSendPlanIsPartialAllowed.value = false
    if (selectedDraftAttachmentAssetId.value && !fallback.some((item) => item.assetId === selectedDraftAttachmentAssetId.value)) {
      selectedDraftAttachmentAssetId.value = null
    }
    scheduleDraftAttachmentParsingPoll()
    if (seq === draftAttachmentRefreshSeq && shouldToggleComposerSendPlanLoading) {
      composerSendPlanLoading.value = false
    }
    scheduleHistoryIncompatibleRefresh()
    return
  }

  async function ingestLocalFiles(
    filePaths: readonly string[],
    options?: Readonly<{ mimeType?: string | null; sourceKind?: 'local_upload' | 'generated' }>,
  ) {
    const cleaned = filePaths.map((value) => String(value ?? '').trim()).filter((value) => value.length > 0)
    if (cleaned.length === 0) return
    const convoId = await ensureActiveConvo()

    let successCount = 0
    let failureCount = 0
    let lastSuccessLabel: string | null = null

    for (const filePath of cleaned) {
      try {
        const result = await ingestLocalFile({
          filePath,
          mimeType: options?.mimeType ?? null,
          sourceKind: options?.sourceKind ?? 'local_upload',
        })
        if (!result.success || !result.assetId) {
          failureCount += 1
          continue
        }
        await addConversationDraftAttachment({
          conversationId: convoId,
          assetId: result.assetId,
        })
        successCount += 1
        lastSuccessLabel = result.normalizedExtension ?? result.assetKind ?? 'attachment'
      } catch (error) {
        failureCount += 1
        if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
          console.warn('[ui-app] ingestLocalFiles failed for one file (non-fatal):', error)
        }
      }
    }

    if (successCount > 0) {
      void refreshDraftAttachmentViewModels()
      const label = successCount === 1 ? 'attachment' : 'attachments'
      setAttachmentFeedback('success', `Added ${successCount} ${label}.`)
    } else if (failureCount > 0) {
      setAttachmentFeedback('error', 'Attachment import failed.')
    }
    if (successCount > 0 && lastSuccessLabel && shouldLogDebug()) {
      console.info('[ui-app] attachment import completed:', { successCount, failureCount, lastSuccessLabel })
    }
  }

  async function ingestUrlAttachment(url: string, retentionMode: 'default' | 'link_only' | 'link_and_file') {
    const trimmed = String(url ?? '').trim()
    if (!trimmed) {
      setAttachmentFeedback('error', 'URL is required.')
      return
    }
    try {
      const convoId = await ensureActiveConvo()
      const result = await ingestUrl({
        url: trimmed,
        retentionMode: resolveAttachmentRetentionMode(retentionMode),
      })
      if (!result.success || !result.assetId) {
        setAttachmentFeedback('error', 'URL import failed.')
        return
      }
      await addConversationDraftAttachment({
        conversationId: convoId,
        assetId: result.assetId,
        urlRetentionMode: retentionMode,
      })
      void refreshDraftAttachmentViewModels()
      setAttachmentFeedback('success', 'URL added to draft.')
    } catch (error) {
      setAttachmentFeedback('error', error instanceof Error ? error.message : 'URL import failed.')
      if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
        console.warn('[ui-app] ingestUrlAttachment failed:', error)
      }
    }
  }

  function parseAttachmentUrlText(raw: string): string | null {
    const trimmed = String(raw ?? '').trim()
    if (!trimmed) return null
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
      return parsed.toString()
    } catch {
      return null
    }
  }

  async function flushDraftPersistence(): Promise<void> {
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
      return
    }
    if (draftSaveTimer.value) {
      clearTimeout(draftSaveTimer.value)
      draftSaveTimer.value = null
    }
    draftFlushPromise.value = (async () => {
      try {
        const updated = await updateConversationDraftText({
          conversationId: scope.convoId,
          draftText: text,
          draftMode: draftPersistenceMode.value,
          editingSourceMessageId: draftPersistenceEditingSourceMessageId.value,
        })
        applyDraftPersistenceStateFromDraft(updated)
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
      draft.value = ''
      applyDraftPersistenceState({ draftMode: 'compose', editingSourceMessageId: null })
      editRestoredDraftAttachmentAssetIds.value = new Set()
      draftAttachmentViewModels.value = []
      resetHistoryIncompatibleAttachmentSummary()
      return
    }
    lastDraftScopeKey.value = getDraftScopeKey(scope)
    try {
      const restored = await restoreConversationDraft(scope.convoId)
      applyDraftPersistenceStateFromDraft(restored)
      draft.value = restored.draftText
      editRestoredDraftAttachmentAssetIds.value = restored.draftMode === 'edit'
        ? new Set(restored.attachedAssetIds.map((assetId) => String(assetId ?? '').trim()).filter(Boolean))
        : new Set()
      await refreshDraftAttachmentViewModels({ restoredDraft: restored })
      scheduleHistoryIncompatibleRefresh()
    } catch (err) {
      if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
        console.warn('[ui-app] restoreDraftForActiveScope failed (non-fatal):', err)
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
      setAttachmentFeedback('error', 'File picker is unavailable.')
      return
    }
    const result = await api.selectLocalFiles({ context: 'file', allowMultiple: true })
    const filePaths = Array.isArray(result?.filePaths) ? result.filePaths : []
    if (filePaths.length === 0) return
    await ingestLocalFiles(filePaths, { sourceKind: 'local_upload' })
  }

  async function onAttachImagesRequested() {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    if (composerImageInputSupported.value === false) {
      setAttachmentFeedback('error', composerImageInputSupportReason.value ?? 'Current model does not support image inputs.')
      return
    }
    const api = getElectronApi()
    if (!api) {
      setAttachmentFeedback('error', 'File picker is unavailable.')
      return
    }
    const result = await api.selectLocalFiles({ context: 'image', allowMultiple: true })
    const filePaths = Array.isArray(result?.filePaths) ? result.filePaths : []
    if (filePaths.length === 0) return
    await ingestLocalFiles(filePaths, { sourceKind: 'local_upload' })
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
      setAttachmentFeedback('error', 'URL is required.')
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
      const result = await removeConversationDraftAttachment({
        conversationId: convoId,
        assetId,
      })
      await refreshDraftAttachmentViewModels()
      if (result.removed) {
        setAttachmentFeedback('success', 'Attachment removed from draft.')
      } else {
        setAttachmentFeedback('warning', 'Attachment was already removed.')
      }
    } catch (error) {
      setAttachmentFeedback('error', error instanceof Error ? error.message : 'Failed to remove attachment.')
    }
  }

  function openDraftAttachmentDetails(assetId: string) {
    const id = String(assetId ?? '').trim()
    if (!id) return
    selectedDraftAttachmentAssetId.value = id
  }

  function closeDraftAttachmentDetails() {
    selectedDraftAttachmentAssetId.value = null
  }

  async function updateSelectedDraftAttachmentSettings(input: Readonly<{
    preferredSendMode?: DraftAttachmentSendModePreference | null
    urlRetentionMode?: DraftAttachmentUrlRetentionPreference | null
  }>) {
    if (isDraftInteractionLocked.value) return
    const convoId = String(activeConvoId.value ?? '').trim()
    const assetId = String(selectedDraftAttachmentAssetId.value ?? '').trim()
    if (!convoId || !assetId) return
    try {
      await updateConversationDraftAttachmentSettings({
        conversationId: convoId,
        assetId,
        ...input,
      })
      await refreshDraftAttachmentViewModels()
      selectedDraftAttachmentAssetId.value = assetId
    } catch (error) {
      setAttachmentFeedback('error', error instanceof Error ? error.message : 'Failed to update attachment settings.')
    }
  }

  async function updateSelectedDraftAttachmentSendMode(preferredSendMode: DraftAttachmentSendModePreference) {
    await updateSelectedDraftAttachmentSettings({ preferredSendMode })
  }

  async function updateSelectedDraftAttachmentUrlRetentionMode(urlRetentionMode: DraftAttachmentUrlRetentionPreference) {
    await updateSelectedDraftAttachmentSettings({ urlRetentionMode })
  }

  async function retrySelectedDraftAttachmentPreview() {
    const assetId = String(selectedDraftAttachmentAssetId.value ?? '').trim()
    if (!assetId) return
    const attachment = draftAttachmentRecords.value.find((item) => item.assetId === assetId) ?? null
    const asset = draftAttachmentAssetsById.value[assetId] ?? null
    if (!attachment || !asset || !isImageAssetLike(asset, attachment)) {
      setAttachmentFeedback('warning', 'Preview retry is only available for image attachments.')
      return
    }
    const seq = ++draftAttachmentRefreshSeq
    const preview = await resolveDraftAttachmentPreview(attachment, asset, seq, true)
    if (preview?.status === 'ready') {
      setAttachmentFeedback('success', 'Preview refreshed.')
    } else {
      setAttachmentFeedback('warning', 'Preview retry completed, but no ready preview was available.')
    }
    await refreshDraftAttachmentViewModels()
    selectedDraftAttachmentAssetId.value = assetId
  }

  async function handleDropFiles(event: DragEvent) {
    if (isDraftInteractionLocked.value) {
      event.preventDefault()
      setAttachmentFeedback('warning', '附件确认面板处理中，当前草稿已锁定。')
      return
    }
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length === 0) return
    event.preventDefault()
    if (isRunning.value) {
      setAttachmentFeedback('warning', 'Attachments are disabled while a response is running.')
      return
    }
    const imageFiles = files.filter((file) => isProbablyImageAttachment(file))
    if (composerImageInputSupported.value === false && imageFiles.length > 0) {
      setAttachmentFeedback('error', composerImageInputSupportReason.value ?? 'Current model does not support image inputs.')
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
      setAttachmentFeedback('error', 'Dropped files are not accessible from this build.')
      return
    }
    await ingestLocalFiles(paths, { sourceKind: 'local_upload' })
  }

  async function handlePasteAttachment(event: ClipboardEvent) {
    if (isDraftInteractionLocked.value) {
      event.preventDefault()
      setAttachmentFeedback('warning', '附件确认面板处理中，当前草稿已锁定。')
      return
    }
    const clipboard = event.clipboardData
    if (!clipboard) return

    const files = Array.from(clipboard.files ?? [])
    if (files.length > 0) {
      event.preventDefault()
      if (isRunning.value) {
        setAttachmentFeedback('warning', 'Attachments are disabled while a response is running.')
        return
      }
      const imageFiles = files.filter((file) => isProbablyImageAttachment(file))
      if (composerImageInputSupported.value === false && imageFiles.length > 0) {
        setAttachmentFeedback('error', composerImageInputSupportReason.value ?? 'Current model does not support image inputs.')
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
        setAttachmentFeedback('error', 'Pasted files are not accessible from this build.')
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
        setAttachmentFeedback('warning', 'Attachments are disabled while a response is running.')
      }
      return
    }
    if (!attachmentUrl) return
    openAttachmentUrlDialog(attachmentUrl)
    event.preventDefault()
  }

  const ACCOUNT_DEFAULT_WEB_SEARCH_ENABLED = false
  const FALLBACK_WEB_SEARCH_PATCH: OpenRouterWebRequestPatch = {
    plugins: [{ id: 'web', enabled: false }],
  }

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

  function getConvoById(convoId: string): ConvoSummary | null {
    const id = String(convoId ?? '').trim()
    if (!id) return null
    return convos.value.find((c) => c.id === id) ?? null
  }

  function getProjectByIdLocal(projectId: string | null | undefined): ProjectSummary | null {
    const id = String(projectId ?? '').trim()
    if (!id) return null
    return projects.value.find((p) => p.id === id) ?? null
  }

  function getConvoSamplingParamsLayer(convo: ConvoSummary | null): SamplingParamsLayer | null {
    return normalizeSamplingParamsLayer(extractConvoSamplingParamsOverride(convo?.meta ?? null))
  }

  function getProjectSamplingParamsLayerForConvo(convo: ConvoSummary | null): SamplingParamsLayer | null {
    const project = getProjectByIdLocal(convo?.projectId)
    return normalizeSamplingParamsLayer(extractProjectSamplingParamsDefaults(project?.meta ?? null))
  }

  function getActiveConvoSamplingParamsLayer(): SamplingParamsLayer | null {
    return getConvoSamplingParamsLayer(getActiveConvoRecord())
  }

  function getActiveProjectSamplingParamsLayer(): SamplingParamsLayer | null {
    return getProjectSamplingParamsLayerForConvo(getActiveConvoRecord())
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

  const activeSessionSamplingParamsLayer = computed<SamplingParamsLayer | null>(() =>
    activeSessionConfig.value.samplingParams.detail
  )

  const activeSessionSamplingParamsResolved = computed(() =>
    resolveSamplingParams({
      convo: getActiveConvoSamplingParamsLayer(),
      project: getActiveProjectSamplingParamsLayer(),
      global: globalSamplingParamsDefaults.value,
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

  const sessionSamplingParamsDraftResolved = computed(() =>
    resolveSamplingParams({
      convo: sessionSamplingParamsDraft.value,
      project: getActiveProjectSamplingParamsLayer(),
      global: globalSamplingParamsDefaults.value,
    })
  )

  const projectSamplingParamsResolved = computed(() =>
    resolveSamplingParams({
      project: projectSamplingParamsDraft.value,
      global: globalSamplingParamsDefaults.value,
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
        console.warn('[ui-app] refreshGlobalWebSearchDefaults failed:', err)
      }
      return null
    }
  }

  function handleGlobalWebSearchDefaultsUpdated(event: Event) {
    globalWebSearchDefaults.value = normalizeSearchSettingsLayer((event as CustomEvent).detail)
  }

  async function refreshGlobalSamplingParamsDefaults(): Promise<SamplingParamsLayer | null> {
    try {
      globalSamplingParamsDefaults.value = normalizeSamplingParamsLayer(await getSamplingParamsDefaults())
      return globalSamplingParamsDefaults.value
    } catch (err) {
      globalSamplingParamsDefaults.value = null
      if (shouldLogDebug()) {
        console.warn('[ui-app] refreshGlobalSamplingParamsDefaults failed:', err)
      }
      return null
    }
  }

  function handleGlobalSamplingParamsDefaultsUpdated(event: Event) {
    globalSamplingParamsDefaults.value = normalizeSamplingParamsLayer((event as CustomEvent).detail)
  }

  function openSessionWebSearchSettings() {
    if (isRunning.value) return
    if (!activeConvoId.value) return
    sessionWebSearchSettingsStatus.value = null
    sessionWebSearchDraft.value = getActiveConvoWebSearchLayer()
    sessionSamplingParamsDraft.value = getActiveConvoSamplingParamsLayer()
    sessionWebSearchSettingsOpen.value = true
  }

  function closeSessionWebSearchSettings() {
    sessionWebSearchSettingsOpen.value = false
    sessionWebSearchSettingsStatus.value = null
    sessionSamplingParamsDraft.value = null
  }

  function onOpenProjectWebSearchSettings(projectId: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    const project = getProjectByIdLocal(projectId)
    if (!project) return
    projectWebSearchSettingsStatus.value = null
    projectWebSearchSettingsProjectId.value = project.id
    projectWebSearchDraft.value = normalizeSearchSettingsLayer(extractProjectWebSearchDefaults(project.meta ?? null))
    projectSamplingParamsDraft.value = normalizeSamplingParamsLayer(extractProjectSamplingParamsDefaults(project.meta ?? null))
    projectWebSearchSettingsOpen.value = true
  }

  function closeProjectWebSearchSettings() {
    projectWebSearchSettingsOpen.value = false
    projectWebSearchSettingsProjectId.value = null
    projectWebSearchDraft.value = null
    projectSamplingParamsDraft.value = null
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

  async function persistActiveConvoSamplingParamsOverride(nextLayer: SamplingParamsLayer | null) {
    const normalizedNext = normalizeSamplingParamsLayer(nextLayer)
    await updateActiveConvoSessionConfig({
      samplingParams: {
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

  async function onComposerUpdateSamplingParamsLayer(nextLayer: SamplingParamsLayer | null) {
    if (isRunning.value || sessionSamplingParamsQuickSaving.value) return
    if (isDraftInteractionLocked.value) return
    sessionSamplingParamsQuickSaving.value = true
    try {
      await persistActiveConvoSamplingParamsOverride(nextLayer)
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    } finally {
      sessionSamplingParamsQuickSaving.value = false
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
      await persistActiveConvoSamplingParamsOverride(sessionSamplingParamsDraft.value)
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
      const nextSamplingLayer = normalizeSamplingParamsLayer(projectSamplingParamsDraft.value)
      const nextMetaWithSampling = mergeProjectSamplingParamsDefaultsMeta(nextMeta, nextSamplingLayer)
      await saveProject({
        id: project.id,
        name: project.name,
        meta: nextMetaWithSampling,
      })
      projects.value = projects.value.map((p) => (p.id === project.id ? { ...p, meta: nextMetaWithSampling } : p))
      projectWebSearchSettingsStatus.value = 'Saved.'
    } catch (err: any) {
      projectWebSearchSettingsStatus.value = err?.message ? String(err.message) : String(err)
    } finally {
      projectWebSearchSettingsSaving.value = false
    }
  }

  function buildExplicitWebSearchPatch(input: ReturnType<typeof resolveSearchSettingsFromStoredLayers>): OpenRouterWebRequestPatch {
    if (!input.effectiveMode) {
      return { plugins: [{ id: 'web', enabled: false }] }
    }

    const pluginFromResolver = input.requestPatch.plugins?.find((row) => row.id === 'web')
    const plugin = pluginFromResolver
      ? {
        ...pluginFromResolver,
        enabled: true,
      }
      : {
        id: 'web' as const,
        enabled: true,
        max_results: input.effectiveMaxResults,
        ...(input.effectiveEngine ? { engine: input.effectiveEngine } : {}),
        ...(input.effectiveSearchPrompt ? { search_prompt: input.effectiveSearchPrompt } : {}),
      }

    return {
      plugins: [plugin],
      ...(input.requestPatch.web_search_options
        ? { web_search_options: input.requestPatch.web_search_options }
        : {}),
    }
  }

  async function resolveWebSearchConfigForConvoId(convoId: string): Promise<Readonly<{
    requestPatch: OpenRouterWebRequestPatch
    resolvedMode: WebSearchMode
  }>> {
    const convo = getConvoById(convoId)
    const projectMeta = convo?.projectId
      ? getProjectByIdLocal(convo.projectId)?.meta ?? null
      : null

    try {
      const resolved = resolveSearchSettingsFromStoredLayers({
        convoMeta: convo?.meta ?? null,
        projectMeta,
        globalDefaults: globalWebSearchDefaults.value,
        options: { accountDefaultEnabled: ACCOUNT_DEFAULT_WEB_SEARCH_ENABLED },
      })
      return {
        requestPatch: buildExplicitWebSearchPatch(resolved),
        resolvedMode: resolved.resolvedMode,
      }
    } catch (err) {
      if (shouldLogDebug() && import.meta.env.MODE !== 'test') {
        console.warn('[ui-app] resolveWebSearchConfigForConvoId failed, fallback disable:', err)
      }
      return {
        requestPatch: FALLBACK_WEB_SEARCH_PATCH,
        resolvedMode: 'default',
      }
    }
  }

  async function resolveSamplingParamsConfigForConvoId(convoId: string): Promise<Readonly<{
    requestPatch: OpenRouterSamplingParamsPatch
  }>> {
    const convo = getConvoById(convoId)
    const projectMeta = convo?.projectId
      ? getProjectByIdLocal(convo.projectId)?.meta ?? null
      : null
    try {
      const resolved = resolveSamplingParamsFromStoredLayers({
        convoMeta: convo?.meta ?? null,
        projectMeta,
        globalDefaults: globalSamplingParamsDefaults.value,
      })
      return { requestPatch: resolved.requestPatch }
    } catch (err) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] resolveSamplingParamsConfigForConvoId failed, fallback empty:', err)
      }
      return { requestPatch: {} }
    }
  }

  function normalizeModelKey(value: unknown): string {
    const normalized = String(value ?? '').trim()
    return normalized.length > 0 ? normalized : DEFAULT_CHAT_MODEL_ID
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

  function parseImageGenerationAdvancedJson(
    raw: string
  ): Readonly<{ value: Record<string, unknown> | null; error: string | null }> {
    const text = String(raw ?? '').trim()
    if (!text) return { value: null, error: null }
    try {
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { value: null, error: 'advanced JSON must be an object.' }
      }
      return { value: parsed as Record<string, unknown>, error: null }
    } catch {
      return { value: null, error: 'advanced JSON is invalid.' }
    }
  }

  const parsedImageGenerationAdvanced = computed(() =>
    parseImageGenerationAdvancedJson(imageGenerationState.value.advancedJson)
  )

  const imageGenerationAdvancedError = computed(() => parsedImageGenerationAdvanced.value.error)

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
    const modelId = normalizeModelKey(model.value)
    selectedModelImageCapabilityLoading.value = true

    if (modelId === DEFAULT_CHAT_MODEL_ID) {
      selectedModelImageCapabilityClass.value = null
      selectedModelImageCapabilityReason.value = 'select a concrete model to enable image generation.'
      composerImageInputSupported.value = null
      composerImageInputSupportReason.value = null
      selectedModelImageCapabilityLoading.value = false
      return
    }

    try {
      const result = await getModelCatalogModelDetail({ providerKey: 'openrouter', modelId })
      if (seq !== imageCapabilityQuerySeq.value) return
      const item = result.item
      if (!item) {
        selectedModelImageCapabilityClass.value = null
        selectedModelImageCapabilityReason.value = 'model detail unavailable for image capability detection.'
        composerImageInputSupported.value = null
        composerImageInputSupportReason.value = null
        return
      }
      composerImageInputSupported.value = Array.isArray(item.inputModalities) && item.inputModalities.includes('image')
      composerImageInputSupportReason.value = composerImageInputSupported.value
        ? null
        : 'Current model does not support image inputs.'
      const eligibility = evaluateImageGenerationModel({
        modelId: item.modelId,
        inputModalities: item.inputModalities,
        outputModalities: item.outputModalities,
        status: item.status,
        visibility: item.visibility,
        expirationAtSec: item.expirationAtSec,
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
        console.warn('[ui-app] refreshSelectedModelImageCapability failed:', err)
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
        console.warn('[ui-app] refreshGlobalImageGenerationDefault failed:', err)
      }
    }
    return globalImageGenerationDefault.value
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
      normalized.imageSize === '1K' || normalized.imageSize === '2K' || normalized.imageSize === '4K'
        ? normalized.imageSize
        : '1K'
    const aspectRatio =
      normalized.aspectRatio === '16:9' || normalized.aspectRatio === '3:4' || normalized.aspectRatio === '1:1' || normalized.aspectRatio === '4:3'
        ? normalized.aspectRatio
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
        console.warn('[ui-app] persist image generation mode failed (non-fatal):', err)
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
        console.warn('[ui-app] persist image generation custom config failed (non-fatal):', err)
      }
    }
  }

  function resolveImageGenerationConfigForRequest(): Readonly<{
    capabilityClass?: ImageCapabilityClass
    modalities?: ReadonlyArray<OpenRouterOutputModality>
    imageConfig?: OpenRouterImageConfig
  }> | null {
    const ui = imageGenerationState.value
    if (!ui.enabled) return null
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
    const aspectRatio = String(ui.aspectRatio ?? '').trim()
    const imageSize = String(ui.imageSize ?? '').trim()
    const advanced = parsedImageGenerationAdvanced.value
    if (advanced.value) {
      Object.assign(imageConfigPatch, advanced.value)
    }
    if (aspectRatio) imageConfigPatch.aspect_ratio = aspectRatio
    if (imageSize) imageConfigPatch.image_size = imageSize
    else delete imageConfigPatch.image_size

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

  function extractSelectedModelKey(meta: unknown): string | null {
    if (!meta || typeof meta !== 'object') return null
    const raw = (meta as Record<string, unknown>)[CONVO_META_SELECTED_MODEL_KEY]
    const normalized = String(raw ?? '').trim()
    return normalized.length > 0 ? normalized : null
  }

  function resolveSelectedModelAvailability(modelKey: string): 'available' | 'hidden' | 'missing' | 'unknown' {
    const normalized = normalizeModelKey(modelKey)
    if (!normalized) return 'unknown'

    const hasCatalogSignals = modelCatalogItems.value.length > 0 || reasoningModelIndexItems.value.length > 0
    if (!hasCatalogSignals) return 'unknown'

    const inCatalog = modelCatalogItems.value.find((item) => item.modelId === normalized) ?? null
    if (inCatalog) {
      return inCatalog.status === 'hidden' ? 'hidden' : 'available'
    }

    const inReasoningIndex = reasoningModelIndexItems.value.some((item) => item.modelId === normalized)
    return inReasoningIndex ? 'available' : 'missing'
  }

  function applySelectedModelOverrideForActiveConvo() {
    const normalized = normalizeModelKey(activeSessionConfig.value.model.selectedModelKey ?? DEFAULT_CHAT_MODEL_ID)
    model.value = normalized

    const availability = resolveSelectedModelAvailability(normalized)
    if ((availability === 'hidden' || availability === 'missing') && shouldLogDebug()) {
      console.warn('[ui-app] selected model from convo meta is not currently visible in local catalog; keep using session override', {
        convoId: getActiveConvoRecord()?.id,
        selectedModelKey: normalized,
        availability,
      })
    }
  }

  async function persistSelectedModelForActiveConvo(nextModelKey: string) {
    const convo = getActiveConvoRecord()
    if (!convo) return

    const normalized = normalizeModelKey(nextModelKey)
    const currentPersisted = extractSelectedModelKey(convo.meta ?? null)
    const shouldPersist = normalized === DEFAULT_CHAT_MODEL_ID ? null : normalized
    if (currentPersisted === shouldPersist) return

    try {
      await updateActiveConvoSessionConfig({
        model: {
          selectedModelKey: normalized === DEFAULT_CHAT_MODEL_ID ? null : normalized,
        },
      })
    } catch (err) {
      if (shouldLogDebug()) {
        console.warn('[ui-app] persistSelectedModelForActiveConvo failed (non-fatal):', err, {
          convoId: convo.id,
          selectedModelKey: normalized,
        })
      }
    }
  }

  async function onUpdateModel(nextModelKey: string) {
    if (isDraftInteractionLocked.value) return
    const normalized = normalizeModelKey(nextModelKey)
    model.value = normalized
    await persistSelectedModelForActiveConvo(normalized)
    void refreshDraftAttachmentViewModels()
    scheduleHistoryIncompatibleRefresh()
  }

  async function recordRecentModelUsage(modelId: string) {
    const normalized = normalizeModelKey(modelId)
    if (!normalized) return
    const result = await ModelPrefsService.recordRecent(
      {
        providerKey: 'openrouter',
        modelId: normalized,
        modelKey: `openrouter::${normalized}`,
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
      if (shouldLogDebug()) console.warn('[ui-app] cycleUserMessageRenderMode failed (non-fatal):', err)
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
      if (shouldLogDebug()) console.warn('[ui-app] refreshGlobalReasoningPrefs failed (non-fatal):', err)
      globalReasoningPrefs.value = null
      return null
    }
  }

  async function loadProjectReasoningPrefs(projectId: string): Promise<ReasoningPrefs | null> {
    const cached = projects.value.find((p) => p.id === projectId)
    const cachedPrefs = extractReasoningPrefs(cached?.meta ?? null)
    if (cachedPrefs) return cachedPrefs

    const found = await findProjectById(projectId)
    if (found) {
      projects.value = projects.value.some((p) => p.id === found.id)
        ? projects.value.map((p) => (p.id === found.id ? found : p))
        : [...projects.value, found]
      return extractReasoningPrefs(found.meta ?? null)
    }

    return null
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

  async function persistReasoningPrefs() {
    const convo = getActiveConvoRecord()
    if (!convo) return
    const prefs = buildReasoningPrefsFromUi()

    try {
      await updateActiveConvoSessionConfig({
        reasoning: {
          enabled: prefs.mode === 'effort' && prefs.effort !== 'none',
          effort:
            prefs.effort === 'high' || prefs.effort === 'xhigh'
              ? 'high'
              : prefs.effort === 'low' || prefs.effort === 'minimal'
                ? 'low'
                : 'medium',
        },
      })
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] persistReasoningPrefs failed (non-fatal):', err)
    }

    if (!convo.projectId) {
      try {
        await setReasoningPrefs(prefs)
        globalReasoningPrefs.value = prefs
      } catch (err) {
        if (shouldLogDebug()) console.warn('[ui-app] setReasoningPrefs failed (non-fatal):', err)
      }
    }
  }

  async function ensureProjectReasoningPrefsInitialized(projectId: string | null) {
    if (!projectId) return
    const existing = await loadProjectReasoningPrefs(projectId)
    if (existing) return

    const project = await findProjectById(projectId)
    if (!project) return

    const prefs = buildReasoningPrefsFromUi()
    const nextMeta = mergeReasoningPrefsIntoMeta(project.meta ?? null, prefs)

    try {
      await saveProject({ id: project.id, name: project.name, meta: nextMeta })
      projects.value = projects.value.some((p) => p.id === project.id)
        ? projects.value.map((p) => (p.id === project.id ? { ...p, meta: nextMeta } : p))
        : [...projects.value, { ...project, meta: nextMeta }]
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] ensureProjectReasoningPrefsInitialized failed (non-fatal):', err)
    }
  }

  type AssistantStreamSessionTelemetry = Readonly<{
    onEvent?: (event: DomainEvent) => void
    onEnd?: (status: 'done' | 'error' | 'aborted', error: unknown) => void
  }>

  type AssistantStreamSessionInput = Readonly<{
    convoId: string
    branchId: string
    requestId: string
    assistantMessageId: string
    assistantSeq: number
    modelId: string
    createEvents: (signal: AbortSignal) => AsyncIterable<DomainEvent>
    pdfAnnotationCaptureAssetIds?: ReadonlyArray<string>
    replayManifestDraft?: Record<string, unknown> | null
    telemetry?: AssistantStreamSessionTelemetry
  }>

  type FinalizeAssistantStreamSessionInput = Readonly<{
    convoId: string
    assistantMessageId: string
    assistantSeq: number
    stream: ActiveStream
    errorPersistPromise: Promise<void> | null
  }>

  function processReasoningDetailEvent(ev: DomainEvent, stream: ActiveStream, assistantMessageId: string) {
    if (ev.type !== 'MessageDeltaReasoningDetail' || ev.messageId !== assistantMessageId) return
    // 使用 Merger 处理快照语义，提取真正的后缀增量
    const merged = stream.reasoningMerger.merge(ev.detail)
    const key = merged?.key ?? 'unknown'
    const chunkNo = typeof ev.chunkNo === 'number' ? ev.chunkNo : -1

    if (merged) {
      const deltaLen = (merged.deltaText?.length ?? 0) + (merged.deltaSummary?.length ?? 0) + (merged.deltaData?.length ?? 0)
      // 构建带有真正 delta 和 offset 信息的对象用于存储
      const detailWithDelta = {
        ...merged.originalDetail,
        __deltaText: merged.deltaText,
        __deltaSummary: merged.deltaSummary,
        __deltaData: merged.deltaData,
        __isSnapshot: merged.isSnapshot,
        __hasNewMetadata: merged.hasNewMetadata,
        __key: merged.key,
        __offsetBefore: merged.offsetBefore,
        __offsetAfter: merged.offsetAfter,
        __metadataDigest: merged.metadataDigest,
      }
      stream.pendingReasoningDetails.value.push(detailWithDelta)
      scheduleReasoningDetailFlush(stream, assistantMessageId)

      // 追踪诊断信息
      stream.diagnosticTracker.events.push({ chunkNo, key, offsetBefore: merged.offsetBefore, deltaLen, action: 'queued' })
      stream.diagnosticTracker.totalQueued++
      stream.diagnosticTracker.totalDeltaLen += deltaLen
      // 记录 offset 到文本区间的映射 [start, end)
      const start = stream.diagnosticTracker.textCursor
      const end = start + deltaLen
      stream.diagnosticTracker.chunkRanges.push({ chunkNo, key, offsetBefore: merged.offsetBefore, start, end })
      stream.diagnosticTracker.textCursor = end

      if (shouldLogReasoningDebug()) {
        const snapshotTail = merged.isSnapshot && typeof (merged.originalDetail as any)?.text === 'string'
          ? (merged.originalDetail as any).text.slice(-30)
          : undefined
        console.log('[reasoning-chunk]', { key, offsetBefore: merged.offsetBefore, deltaLen, hasNewMetadata: merged.hasNewMetadata, isSnapshot: merged.isSnapshot, deltaHead: merged.deltaText?.slice(0, 30), snapshotTail })
      }
      return
    }

    // Merger 返回 null，记录跳过
    stream.diagnosticTracker.events.push({ chunkNo, key, deltaLen: 0, action: 'skipped', reason: 'merger_null' })
    stream.diagnosticTracker.totalSkipped++
    if (shouldLogReasoningDebug()) {
      console.log('[reasoning-chunk] SKIPPED (merger returned null)', { key })
    }
  }

  /* eslint-disable max-depth */
  async function finalizeAssistantStreamSession(input: FinalizeAssistantStreamSessionInput) {
    const { convoId, assistantMessageId, assistantSeq, stream, errorPersistPromise } = input
    clearFlushTimer(stream)
    clearReasoningFlushTimer(stream)
    // 输出 Merger 诊断统计
    if (shouldLogReasoningDebug()) {
      const stats = stream.reasoningMerger.getStats()
      console.log('[reasoning-merger] stream stats:', stats)
      if (stats.isLikelySnapshot) {
        console.log('[reasoning-merger] ⚠️ 检测到快照语义 (>50% prefixMatch)，已自动提取后缀增量')
      }
    }
    // Use unified finalization to enforce: refresh FIRST, then clear activeStream.
    try {
      // 记录 flush 前的队列信息
      const pendingCountBeforeFlush = stream.pendingReasoningDetails.value.length
      await flushReasoningDetailSegments(stream, assistantMessageId)
      await finalizeReasoningDetails({ messageId: assistantMessageId })

      if (shouldLogReasoningDebug()) {
        const mergerStats = stream.reasoningMerger.getStats()
        const mergerSnapshot = stream.reasoningMerger.getMergedSnapshots()
        const mergerExtracted = extractReasoningTextFromDetails(mergerSnapshot)
        const mergerFinalText = mergerExtracted.reasoningText
        const isEncryptedModel = mergerExtracted.isEncrypted

        let dbReplaySnapshot: unknown[] | null = null
        let dbFinalText: string | undefined
        let dbExtracted: ReturnType<typeof extractReasoningTextFromDetails> | null = null
        let dbSegmentsCount: number | undefined
        try {
          const bridge = (globalThis as any).dbBridge as { invoke?: (method: string, params?: unknown) => Promise<any> } | undefined
          if (bridge?.invoke) {
            const rows = await bridge.invoke('message.list', { convoId, fromSeq: assistantSeq, limit: 1 })
            const row = Array.isArray(rows)
              ? (rows.find((r) => r && typeof r === 'object' && (r as any).id === assistantMessageId) ?? rows[0])
              : null
            const meta = row && typeof (row as any).meta === 'object' ? (row as any).meta : null
            const reasoningDetailsRaw = Array.isArray(meta?.reasoningDetailsRaw) ? meta.reasoningDetailsRaw : null
            if (reasoningDetailsRaw) {
              dbReplaySnapshot = reasoningDetailsRaw
              dbExtracted = extractReasoningTextFromDetails(dbReplaySnapshot)
              dbFinalText = dbExtracted.reasoningText
            }
            // 尝试获取 segments count（如果 meta 中有的话）
            dbSegmentsCount = typeof meta?.reasoningSegmentsCount === 'number' ? meta.reasoningSegmentsCount : undefined
          }
        } catch (err) {
          console.warn('[reasoning-verify] failed to load db replay snapshot:', err)
        }

        const uiFinalText = selectMessage(state.value, assistantMessageId)?.reasoningView?.reasoningText

        // 输出 diagnosticTracker 摘要（包含 DB 统计）
        const tracker = stream.diagnosticTracker
        console.log('[reasoning-diag] tracker summary', {
          // UI 侧统计
          totalQueued: tracker.totalQueued,
          totalSkipped: tracker.totalSkipped,
          totalDeltaLen: tracker.totalDeltaLen,
          eventCount: tracker.events.length,
          // DB 侧统计
          dbInserted: tracker.dbInserted,
          dbSkipped: tracker.dbSkipped,
          dbIgnored: tracker.dbIgnored,
          dbSumDeltaLenInserted: tracker.dbSumDeltaLenInserted,
        })

        // 一次性 DB 统计查询（作为对照）
        const dbRealStats = await getReasoningSegmentsStats(assistantMessageId)
        if (dbRealStats) {
          const matchCnt = dbRealStats.cnt === tracker.dbInserted
          const matchSum = dbRealStats.sumLen === tracker.dbSumDeltaLenInserted
          console.log('[reasoning-diag] DB real stats', {
            segmentsInDb: dbRealStats.cnt,
            sumDeltaTextLenInDb: dbRealStats.sumLen,
            trackerDbInserted: tracker.dbInserted,
            trackerDbSumDeltaLenInserted: tracker.dbSumDeltaLenInserted,
            matchCnt,
            matchSum,
          })
          // 失败时输出差异诊断
          if (!matchCnt || !matchSum) {
            console.warn('[reasoning-diag] MISMATCH', {
              messageId: assistantMessageId,
              cntDiff: dbRealStats.cnt - tracker.dbInserted,
              sumDiff: dbRealStats.sumLen - tracker.dbSumDeltaLenInserted,
              trackerIgnored: tracker.dbIgnored,
              trackerSkipped: tracker.dbSkipped,
            })
          }
        } else {
          console.warn('[reasoning-diag] failed to get DB real stats for', assistantMessageId)
        }

        // 恒等式验证
        const eventCountExpected = tracker.dbInserted + tracker.dbIgnored + tracker.dbSkipped
        const invariant1 = tracker.totalQueued === eventCountExpected
        console.log('[reasoning-diag] invariants', {
          'eventCount == dbInserted + dbIgnored + dbSkipped': invariant1,
          totalQueued: tracker.totalQueued,
          eventCountExpected,
          'totalDeltaLen == dbSumDeltaLenInserted': tracker.totalDeltaLen === tracker.dbSumDeltaLenInserted,
          totalDeltaLen: tracker.totalDeltaLen,
          dbSumDeltaLenInserted: tracker.dbSumDeltaLenInserted,
          deltaLenDiff: tracker.totalDeltaLen - tracker.dbSumDeltaLenInserted,
        })

        // 详细诊断日志
        console.log('[reasoning-verify] diagnostic info', {
          messageId: assistantMessageId,
          mergerChunkCount: mergerStats.chunkCount,
          mergerDeltaCount: mergerStats.deltaCount,
          mergerSnapshotCount: mergerStats.snapshotCount,
          mergerUniqueKeys: mergerStats.uniqueKeys,
          pendingCountBeforeFlush,
          dbSegmentsCount,
          isLikelySnapshot: mergerStats.isLikelySnapshot,
          isEncryptedModel,
        })

        // 对于加密模型，比较 encryptedData；否则比较 reasoningText
        const mergerCompareText = isEncryptedModel ? mergerExtracted.encryptedData : mergerFinalText
        const dbCompareText = isEncryptedModel ? dbExtracted?.encryptedData : dbFinalText

        console.log('[reasoning-verify] text compare', {
          messageId: assistantMessageId,
          isEncryptedModel,
          mergerFinalTextLen: mergerCompareText?.length ?? 0,
          dbFinalTextLen: dbCompareText?.length ?? 0,
          uiFinalTextLen: uiFinalText?.length ?? 0,
          // 加密模型不输出原文（避免日志过大）
          mergerFinalText: isEncryptedModel ? `[encrypted ${mergerCompareText?.length ?? 0} bytes]` : mergerFinalText,
          dbFinalText: isEncryptedModel ? `[encrypted ${dbCompareText?.length ?? 0} bytes]` : dbFinalText,
          uiFinalText: isEncryptedModel ? '[encrypted - see UI]' : uiFinalText,
        })

        // 加密模型：比较 encryptedData；非加密模型：比较 reasoningText
        const textMismatch = mergerCompareText !== dbCompareText
        // UI 文本对于加密模型无法直接比较（UI 可能解密显示），跳过 UI 比较
        const uiMismatch = !isEncryptedModel && dbFinalText !== uiFinalText

        if (textMismatch || uiMismatch) {
          // 找出具体差异位置（使用比较用的文本）
          let diffPos = -1
          const shorter = mergerCompareText && dbCompareText
            ? (mergerCompareText.length <= dbCompareText.length ? mergerCompareText : dbCompareText)
            : ''
          const longer = mergerCompareText && dbCompareText
            ? (mergerCompareText.length > dbCompareText.length ? mergerCompareText : dbCompareText)
            : ''
          for (let i = 0; i < shorter.length; i++) {
            if (shorter[i] !== longer[i]) {
              diffPos = i
              break
            }
          }
          if (diffPos === -1 && shorter.length !== longer.length) {
            diffPos = shorter.length
          }

          console.warn('[reasoning-verify] MISMATCH DETECTED', {
            messageId: assistantMessageId,
            isEncryptedModel,
            textMismatch,
            uiMismatch,
            diffPos,
            diffContext: diffPos >= 0 && !isEncryptedModel ? {
              mergerAround: mergerCompareText?.slice(Math.max(0, diffPos - 20), diffPos + 20),
              dbAround: dbCompareText?.slice(Math.max(0, diffPos - 20), diffPos + 20),
            } : null,
            mergerSnapshotCount: mergerSnapshot.length,
            dbSnapshotCount: dbReplaySnapshot?.length ?? 0,
          })

          // 用 diffPos 映射到 chunkNo（精确定位被吞的 chunk）
          const affectedChunk = tracker.chunkRanges.find(r => r.start <= diffPos && diffPos < r.end)
          console.warn('[reasoning-verify] diffPos → chunkNo mapping', {
            diffPos,
            affectedChunkNo: affectedChunk?.chunkNo ?? 'not found',
            affectedChunkRange: affectedChunk ? `[${affectedChunk.start}, ${affectedChunk.end})` : null,
            nearbyChunks: tracker.chunkRanges.filter(r =>
              Math.abs(r.start - diffPos) < 50 || Math.abs(r.end - diffPos) < 50
            ).slice(0, 5),
          })

          // 输出每个 snapshot 的 text 长度对比
          console.warn('[reasoning-verify] snapshot details', {
            mergerSnapshots: mergerSnapshot.map((s: any) => ({
              key: `${s.id ?? ''}|${s.index ?? ''}|${s.type ?? ''}`,
              textLen: s.text?.length ?? 0,
              textPreview: s.text?.slice(0, 50),
            })),
            dbSnapshots: dbReplaySnapshot?.map((s: any) => ({
              key: `${s.id ?? ''}|${s.index ?? ''}|${s.type ?? ''}`,
              textLen: s.text?.length ?? 0,
              textPreview: s.text?.slice(0, 50),
            })),
          })
        }
      }
    } catch (err) {
      if (shouldLogReasoningDebug()) console.warn('[ui-app] finalizeReasoningDetails failed (non-fatal):', err)
    }
    if (errorPersistPromise) {
      try {
        await errorPersistPromise
      } catch {
        // no-op
      }
    }
    await finalizeRun(assistantMessageId)
  }
  /* eslint-enable max-depth */

  async function runAssistantStreamSession(input: AssistantStreamSessionInput) {
    const { convoId, branchId, assistantMessageId, assistantSeq, modelId, requestId } = input
    const stream = createActiveStream(assistantMessageId, assistantSeq)
    activeStream.value = stream

    let finalStatus: 'final' | 'error' = 'final'
    let finalMetaStatus: 'final' | 'error' | 'aborted' = 'final'
    let finalCompletionOutcome: CompletionOutcome | undefined
    let terminalSeen = false
    let streamDrained = false
    let imageAssetsPersisted = false
    let statusPersisted = false
    let annotationsPersisted = false
    let errorPersisted = false
    let errorPersistPromise: Promise<void> | null = null
    let sawAnyEvent = false
    let latestUsageSnapshot: Record<string, unknown> | null = null

    let telemetryTerminalStatus: 'done' | 'error' | 'aborted' = 'done'
    let telemetryTerminalError: unknown = null
    let telemetryFinalized = false
    const finalizeTelemetry = (status: 'done' | 'error' | 'aborted', error: unknown) => {
      if (telemetryFinalized) return
      telemetryFinalized = true
      input.telemetry?.onEnd?.(status, error)
    }

    const ensureTerminalDrainOnce = async () => {
      if (streamDrained) return
      streamDrained = true
      if (enableEventScheduler) {
        eventScheduler.flushNow(branchId, 'flush')
      }
      clearFlushTimer(stream)
      await flushPending(convoId, stream)
      clearReasoningFlushTimer(stream)
      await flushReasoningDetailSegments(stream, assistantMessageId)
    }

    const ensurePersistStatusOnce = async () => {
      if (statusPersisted) return
      statusPersisted = true
      const metaPatch: Record<string, unknown> = {}
      if (finalCompletionOutcome) {
        metaPatch.completionOutcome = finalCompletionOutcome
      }
      if (latestUsageSnapshot) {
        metaPatch.usage = latestUsageSnapshot
      }
      if (input.replayManifestDraft && typeof input.replayManifestDraft === 'object') {
        metaPatch.currentReplayManifestDraft = input.replayManifestDraft
      }
      await setMessageStatus({
        messageId: assistantMessageId,
        status: finalStatus,
        ...getMessageTimingForPersist(assistantMessageId),
        ...(Object.keys(metaPatch).length > 0 ? { metaPatch } : {}),
      })
    }

    const ensurePersistAnnotationsOnce = async () => {
      if (annotationsPersisted) return
      annotationsPersisted = true
      if (!stream.annotationsTouched.value) return
      try {
        await setMessageAnnotations({
          messageId: assistantMessageId,
          annotations: stream.annotationsBuffer.value ?? [],
        })
        const pdfAssetIds = Array.from(new Set((input.pdfAnnotationCaptureAssetIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)))
        if (pdfAssetIds.length > 0) {
          await capturePdfAnnotationDerivatives({
            messageId: assistantMessageId,
            assetIds: pdfAssetIds,
          })
        }
      } catch (err) {
        if (shouldLogDebug()) console.warn('[ui-app] setMessageAnnotations failed (non-fatal):', err)
      }
    }

    const ensurePersistImageAssetsOnce = async () => {
      if (imageAssetsPersisted) return
      imageAssetsPersisted = true
      const imageDataUrls = collectMessageImageDataUrls(assistantMessageId)
      if (imageDataUrls.length === 0) return
      try {
        const assets = await persistMessageImageAssetsFromDataUrls({
          messageId: assistantMessageId,
          imageDataUrls,
        })
        replaceMessageDataImageBlocks(assistantMessageId, assets)
      } catch (err) {
        if (shouldLogDebug()) {
          console.warn('[ui-app] persistMessageImageAssetsFromDataUrls failed (non-fatal):', err)
        }
      }
    }

    const ensurePersistErrorEnvelopeOnce = (envelope: ErrorEnvelope | null | undefined) => {
      if (errorPersisted) return
      if (!envelope || !envelope.completionClass || envelope.completionClass === 'ok') return
      errorPersisted = true
      errorPersistPromise = persistMessageErrorEnvelope(assistantMessageId, envelope)
    }

    try {
      for await (const ev of input.createEvents(stream.abort.signal)) {
        sawAnyEvent = true
        input.telemetry?.onEvent?.(ev)

        if (ev.type === 'StreamError' || ev.type === 'StreamAbort') {
          const completionClass = completionClassFromEvent(ev) ?? 'error'
          if (completionClass === 'aborted') {
            telemetryTerminalStatus = 'aborted'
          } else if (completionClass === 'error' && telemetryTerminalStatus !== 'aborted') {
            telemetryTerminalStatus = 'error'
            telemetryTerminalError = ev.type === 'StreamError' ? ev.error : ev.envelope
          }
          const envelope = ev.type === 'StreamError' ? ev.error : ev.envelope
          ensurePersistErrorEnvelopeOnce(envelope)
        }

        if (enableEventScheduler) {
          eventScheduler.enqueue(branchId, ev)
        } else {
          commitImmediate(branchId, ev)
        }

        if (ev.type === 'MessageDeltaText' && ev.messageId === assistantMessageId) {
          stream.pendingAppendText.value += ev.text
          scheduleFlush(convoId, stream)
        }
        if (ev.type === 'MessageAppendContentBlock' && ev.messageId === assistantMessageId && ev.block?.type === 'text') {
          stream.pendingAppendText.value += String((ev.block as any).text ?? '')
          scheduleFlush(convoId, stream)
        }

        processReasoningDetailEvent(ev, stream, assistantMessageId)
        if (ev.type === 'MessageDeltaAnnotationBatch' && ev.messageId === assistantMessageId) {
          stream.annotationsTouched.value = true
          stream.annotationsBuffer.value = mergeAnnotationLists(
            stream.annotationsBuffer.value,
            Array.isArray(ev.annotations) ? ev.annotations : [],
            ev.mergeStrategy
          )
        }
        if (ev.type === 'UsageDelta') {
          const normalizedUsage = normalizeUsageForMeta(ev.usage)
          if (normalizedUsage) {
            latestUsageSnapshot = normalizedUsage
            if (import.meta.env?.DEV) {
              const promptTokens = parseNumberLike(normalizedUsage.prompt_tokens)
              const completionTokens = parseNumberLike(normalizedUsage.completion_tokens)
              const totalTokens = parseNumberLike(normalizedUsage.total_tokens)
              const costInfo = extractUsageCostForLog(normalizedUsage)
              console.info('[openrouter][usage]', {
                requestId,
                assistantMessageId,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: totalTokens,
                cost: costInfo.cost,
                currency: costInfo.currency ?? 'USD',
              })
            }
          }
        }

        if (ev.type === 'StreamError') {
          if (String(globalThis?.localStorage?.getItem('sv_debug_stream_error') ?? '').trim() === '1') {
            console.error('[ui-app] stream error event', ev)
          }
        }
        if (ev.type === 'StreamDone' || ev.type === 'StreamAbort' || ev.type === 'StreamError') {
          terminalSeen = true
          const completionClass = completionClassFromEvent(ev)
          const metaStatus = metaStatusFromCompletionClass(completionClass)
          if (metaStatus) {
            finalMetaStatus = metaStatus
            finalStatus = persistStatusFromCompletionClass(completionClass)
            ensureMessageMetaEntry(assistantMessageId, { status: finalMetaStatus, completionOutcome: undefined })
          }
          await ensureTerminalDrainOnce()
          await ensurePersistImageAssetsOnce()
          await ensurePersistAnnotationsOnce()
          if (ev.type === 'StreamDone') {
            const terminalRun = selectRun(state.value, branchId)
            finalCompletionOutcome = terminalRun?.completionOutcome
            if (finalCompletionOutcome) {
              ensureMessageMetaEntry(assistantMessageId, { completionOutcome: finalCompletionOutcome })
            }
          } else {
            finalCompletionOutcome = undefined
          }
        }
      }

      await ensureTerminalDrainOnce()
      await ensurePersistImageAssetsOnce()
      await ensurePersistAnnotationsOnce()
      await ensurePersistStatusOnce()
      finalizeTelemetry(telemetryTerminalStatus, telemetryTerminalError)
    } catch (err: any) {
      if (terminalSeen) {
        finalizeTelemetry(telemetryTerminalStatus, telemetryTerminalError)
      } else {
        const appError = normalizeTransportError(err)
        const completionClass: CompletionClass = appError.phase === 'user_cancelled' ? 'aborted' : 'error'
        const fallbackPhase: ErrorPhase = sawAnyEvent ? 'mid_stream' : 'pre_stream'
        const fallbackEndReason: StreamEndReason = sawAnyEvent ? 'mid_stream_error' : 'pre_stream_error'
        const envelopePhase = mapAppPhaseToEnvelopePhase(appError.phase, fallbackPhase)
        const endReason = mapAppPhaseToEndReason(appError.phase, fallbackEndReason)

        finalStatus = persistStatusFromCompletionClass(completionClass)
        finalMetaStatus = metaStatusFromCompletionClass(completionClass) ?? 'error'
        finalizeTelemetry(completionClass === 'aborted' ? 'aborted' : 'error', err)
        if (completionClass === 'error') {
          loadError.value = appError.message
        }

        let envelope: ErrorEnvelope
        let terminalEvent: DomainEvent
        if (completionClass === 'aborted') {
          envelope = buildAbortEnvelope({
            phase: envelopePhase,
            completionClass: 'aborted',
            reason: appError.message,
            request: { model: modelId, stream: true },
          })
          terminalEvent = { type: 'StreamAbort', reason: 'aborted', envelope }
        } else {
          const normalized = toNormalizedErrorEnvelope({
            appError,
            endpoint: 'chat.completions',
            transport: 'sse',
            phase: envelopePhase === 'pre_stream' ? 'request' : 'generation',
            raw: {
              type: 'ui_run_stream_session_catch',
              ...(err && typeof err === 'object' ? { details: err as Record<string, unknown> } : {}),
            },
          })
          envelope = buildTransportErrorEnvelope({
            phase: envelopePhase,
            completionClass: 'error',
            message: appError.message,
            normalized,
            request: { model: modelId, stream: true },
            kind: appError.phase === 'local_protocol_error' ? 'parse_error' : 'transport_error',
          })
          terminalEvent = { type: 'StreamError', error: envelope, terminal: true }
        }

        if (enableEventScheduler) {
          eventScheduler.flushNow(branchId, 'flush')
        }
        try {
          commitImmediate(branchId, { type: 'TimingSnapshot', tEnd: Date.now(), endReason } as DomainEvent)
          commitImmediate(branchId, terminalEvent)
          finalCompletionOutcome = undefined
          ensureMessageMetaEntry(assistantMessageId, { status: finalMetaStatus, completionOutcome: undefined })
        } catch {
          // no-op
        }
        ensurePersistErrorEnvelopeOnce(envelope)
      }
      try {
        await ensurePersistImageAssetsOnce()
      } catch {
        // no-op
      }
      try {
        await ensurePersistAnnotationsOnce()
      } catch {
        // no-op
      }
      try {
        if (errorPersistPromise) await errorPersistPromise
      } catch {
        // no-op
      }
      try {
        await ensurePersistStatusOnce()
      } catch {
        // no-op
      }
    } finally {
      await finalizeAssistantStreamSession({
        convoId,
        assistantMessageId,
        assistantSeq,
        stream,
        errorPersistPromise,
      })
    }
  }

  async function startStreamingForAssistantTurn(input: Readonly<{
    convoId: string
    branchId: string
    questionId: string
    questionText: string
    assistantMessageId: string
    assistantSeq: number
    contextMessages: ReadonlyArray<InternalMessage>
    replayPrepared?: PreparedOpenRouterReplay | null
  }>) {
    const convoId = String(input.convoId ?? '').trim()
    const branchId = String(input.branchId ?? '').trim()
    const questionId = String(input.questionId ?? '').trim()
    const assistantMessageId = String(input.assistantMessageId ?? '').trim()
    const assistantSeq = Number(input.assistantSeq ?? NaN)
    const questionText = typeof input.questionText === 'string' ? input.questionText : String(input.questionText ?? '')
    if (!convoId || !branchId || !questionId || !assistantMessageId || !Number.isFinite(assistantSeq) || !questionText.trim()) return
    const replayPrepared = input.replayPrepared ?? null

    // Invariant: while streaming a regenerate/retry answer, the UI should already be projected onto the new chosen answer root.
    // If not, force a single DB-backed rehydrate before we begin streaming to avoid temporarily rendering both old+new variants.
    if (activeBranchId.value === branchId) {
      const chosen = turnFiltersByQuestionId.value.get(questionId)?.chosenAnswerRootId ?? null
      if (chosen && chosen !== assistantMessageId) {
        if (shouldLogDebug()) {
          console.warn('[ui-app] startStreamingForAssistantTurn: chosen mismatch; reloading transcript', {
            branchId,
            questionId,
            chosenAnswerRootId: chosen,
            assistantMessageId,
          })
        }
        // Refresh through unified entry if this is the active branch, else direct call
        if (branchId === activeBranchId.value) {
          await refreshTranscriptLatestOnly()
        } else {
          await loadTranscriptForBranch(branchId)
        }
      }
    }

    const apiKey = await getOpenRouterApiKey()
    if (!apiKey) {
      loadError.value = 'Missing OpenRouter API key (set electron-store openRouterApiKey or VITE_OPENROUTER_API_KEY)'
      try {
        await setMessageStatus({ messageId: assistantMessageId, status: 'error', ...getMessageTimingForPersist(assistantMessageId) })
      } catch {
        // no-op
      }
      await refreshTranscriptLatestOnly()
      return
    }

    const baseUrl = await getOpenRouterBaseUrl()
    const modelId = normalizeModelKey(model.value)

    const { requestedReasoningMode, requestedReasoningEffortValue, requestedReasoningExclude } = getRequestedReasoningConfig()
    const webSearchConfig = await resolveWebSearchConfigForConvoId(convoId)
    const samplingParamsConfig = await resolveSamplingParamsConfigForConvoId(convoId)
    const imageGenerationConfig = resolveImageGenerationConfigForRequest()

    const requestId = randomId('req')
    const netExpSettings = await getNetExpSettings()
    const netExpRunTracker = startNetExpRunReport({
      runId: branchId,
      requestId,
      streamMode: netExpSettings.streamInMainProcess ? 'main' : 'renderer',
      model: modelId,
      baseUrl: baseUrl ?? undefined,
      settings: netExpSettings,
    })

    const started = startGeneration(state.value, {
      runId: branchId,
      requestId,
      model: modelId,
      userMessageId: questionId,
      userMessageText: questionText,
      assistantMessageId,
      ...(imageGenerationConfig ? { requestedImageGeneration: true } : {}),
      requestedReasoningMode,
      ...(requestedReasoningEffortValue ? { requestedReasoningEffort: requestedReasoningEffortValue } : {}),
      ...(requestedReasoningExclude ? { requestedReasoningExclude: true } : {}),
    })
    state.value = started.state
    ensureMessageMetaEntry(assistantMessageId, {
      parentId: questionId,
      questionId,
      answerRootId: assistantMessageId,
      role: 'assistant',
      status: 'streaming',
    })

    const requestReasoningConfig = buildReasoningRequestConfigSnapshot({
      requestedReasoningMode,
      requestedReasoningEffortValue,
      requestedReasoningExclude,
    })
    try {
      await setMessageReasoningRequestConfig({ messageId: assistantMessageId, value: requestReasoningConfig })
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] setMessageReasoningRequestConfig failed (non-fatal):', err)
    }
    void recordRecentModelUsage(modelId)

    await runAssistantStreamSession({
      convoId,
      branchId,
      requestId,
      assistantMessageId,
      assistantSeq,
      modelId,
      replayManifestDraft: replayPrepared?.manifestDraft ?? null,
      createEvents: (signal) => streamOpenRouterChatAsEvents({
        requestId,
        assistantMessageId,
        userText: questionText,
        contextMessages: input.contextMessages,
        ...(replayPrepared?.currentUserContentBlocks.length ? { currentUserContentBlocks: replayPrepared.currentUserContentBlocks } : {}),
        signal,
        config: {
          apiKey,
          model: modelId,
          requestedReasoningMode,
          webSearch: webSearchConfig,
          ...(hasSamplingParamsPatch(samplingParamsConfig.requestPatch) ? { samplingParams: samplingParamsConfig.requestPatch } : {}),
          ...(imageGenerationConfig ? { imageGeneration: imageGenerationConfig } : {}),
          ...(requestedReasoningEffortValue ? { requestedReasoningEffort: requestedReasoningEffortValue } : {}),
          ...(requestedReasoningExclude ? { requestedReasoningExclude: true } : {}),
          ...(baseUrl ? { baseUrl } : {}),
        },
      }),
      telemetry: {
        onEvent: (event) => netExpRunTracker.onEvent(event),
        onEnd: (status, error) => netExpRunTracker.onEnd(status, error),
      },
    })
  }

  async function prepareReplayForHistoricalUserMessage(input: Readonly<{
    branchId: string
    userMessageId: string
    userText: string
    attachmentDecisions?: ReadonlyArray<AttachmentDecision>
  }>): Promise<PreparedOpenRouterReplay | null> {
    const baseUrl = await getOpenRouterBaseUrl()
    const modelDescriptor = await buildSendPlanModelDescriptor(normalizeModelKey(model.value))
    const prepared = await prepareOpenRouterReplayFromMessage({
      branchId: input.branchId,
      userMessageId: input.userMessageId,
      model: modelDescriptor,
      providerContext: buildSendPlanProviderContext(baseUrl),
      replayMode: 'current',
      editedUserText: input.userText,
      attachmentDecisions: input.attachmentDecisions?.map((item) => ({
        attachmentId: item.attachmentId,
        source: item.source,
        decision: item.decision,
        ...(item.reasonCode ? { reasonCode: item.reasonCode } : {}),
      })),
    })
    return prepared
  }

  function buildAttachmentConfirmationRequestFromSendPlan(
    kind: AttachmentConfirmationSessionKind,
    sendPlan: SendPlan | null | undefined
  ): AttachmentConfirmationRequestInput | null {
    if (!sendPlan) return null
    const historyItems = buildHistoryConfirmationItemsFromSendPlan(sendPlan)
    const currentItems = buildCurrentConfirmationItemsFromSendPlan(sendPlan)
    if (historyItems.length === 0 && currentItems.length === 0) return null
    return {
      kind,
      historyItems,
      currentItems,
    }
  }

  function buildAttachmentConfirmationRequestFromReplay(
    kind: AttachmentConfirmationSessionKind,
    replayPrepared: PreparedOpenRouterReplay | null | undefined
  ): AttachmentConfirmationRequestInput | null {
    if (!replayPrepared) return null
    const historyItems = buildHistoryConfirmationItemsFromReplayPrepared(replayPrepared)
    if (historyItems.length === 0) return null
    return {
      kind,
      historyItems,
      currentItems: [],
    }
  }

  function buildReplayBlockedMessage(prepared: PreparedOpenRouterReplay | null | undefined): string {
    const status = prepared?.status ?? 'blocked'
    const reasons = Array.isArray(prepared?.blockingReasons) ? prepared!.blockingReasons : []
    const reasonText = reasons
      .map((item: any) => String(item?.message ?? item?.code ?? '').trim())
      .find((value) => value.length > 0)
    const normalizedReason = sanitizeSendPlanSummaryMessage(reasonText) ?? 'historical attachments require confirmation or remediation before resend.'
    if (status === 'needs_confirmation') {
      return `Current replay blocked (needs_confirmation): ${normalizedReason}`
    }
    return `Current replay blocked (${status}): ${normalizedReason}`
  }

  async function buildSendPlanModelDescriptor(modelId: string): Promise<SendPlanModelDescriptor> {
    const normalized = normalizeModelKey(modelId)
    try {
      if (normalized !== DEFAULT_CHAT_MODEL_ID) {
        const detail = await getModelCatalogModelDetail({ providerKey: 'openrouter', modelId: normalized })
        if (detail.item) {
          return {
            providerKey: 'openrouter',
            modelId: detail.item.modelId,
            modelKey: detail.item.modelKey,
            inputModalities: detail.item.inputModalities,
            outputModalities: detail.item.outputModalities,
          }
        }
      }
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] model detail unavailable for file send planning', err)
    }
    return {
      providerKey: 'openrouter',
      modelId: normalized,
      modelKey: `openrouter::${normalized}`,
      inputModalities: ['text'],
      outputModalities: ['text'],
    }
  }

  function buildSendPlanProviderContext(baseUrl: string | null): SendPlanProviderContext {
    return {
      providerKey: 'openrouter',
      ...(baseUrl ? { baseUrl } : {}),
      supportsImageUrlRef: true,
      supportsPdfInputs: true,
      supportsPdfUrlRef: true,
      supportsTextUrlRef: true,
      supportsVideoUrlRef: false,
      supportsInlineData: true,
      supportsProviderFileRef: false,
      preferredDraftSendModes: ['url_ref', 'inline_base64'],
    }
  }

  function sanitizeSendPlanSummaryMessage(raw: string | null | undefined): string | null {
    const input = String(raw ?? '').trim()
    if (!input) return null
    const hasInlineBase64 = /data:[^\s]{0,120};base64,/i.test(input) || /base64/i.test(input)
    if (hasInlineBase64) {
      return '检测到附件内容风险，请处理附件后重试。'
    }
    const redacted = input
      .replace(/[A-Za-z]:[\\/][^\s"''<>]+/g, '[local path]')
      .replace(/\/(?:Users|home|var|tmp|private|mnt|opt)\/[^ "''<>]+/g, '[local path]')
      .replace(/\s+/g, ' ')
      .trim()
    if (!redacted) return null
    if (redacted.length <= 140) return redacted
    return `${redacted.slice(0, 137)}...`
  }

  function resolveSendPlanBlockingMessage(sendPlan: SendPlan): string {
    const reasonFromIssues = sendPlan.blockingReasons
      .map((item) => String(item.message ?? '').trim())
      .find((value) => value.length > 0 && value.toLowerCase() !== 'blocked')
    const sanitizedReasonFromIssues = sanitizeSendPlanSummaryMessage(reasonFromIssues)
    if (sanitizedReasonFromIssues) return sanitizedReasonFromIssues
    const reasonFromPlans = sendPlan.attachmentPlans
      .filter((item) => item.eligibility === 'blocked')
      .flatMap((item) => item.notes ?? [])
      .map((item) => String(item ?? '').trim())
      .find((value) => value.length > 0)
    const sanitizedReasonFromPlans = sanitizeSendPlanSummaryMessage(reasonFromPlans)
    if (sanitizedReasonFromPlans) return sanitizedReasonFromPlans
    return '当前请求无法发送，请处理附件或更换模型。'
  }

  function resolveSendPlanWarningMessage(sendPlan: SendPlan): string | null {
    const reasonFromIssues = sendPlan.warnings
      .map((item) => String(item.message ?? '').trim())
      .find((value) => value.length > 0)
    const sanitizedReasonFromIssues = sanitizeSendPlanSummaryMessage(reasonFromIssues)
    if (sanitizedReasonFromIssues) return sanitizedReasonFromIssues
    const reasonFromPlans = sendPlan.attachmentPlans
      .filter((item) => item.eligibility === 'warning')
      .flatMap((item) => item.notes ?? [])
      .map((item) => String(item ?? '').trim())
      .find((value) => value.length > 0)
    const sanitizedReasonFromPlans = sanitizeSendPlanSummaryMessage(reasonFromPlans)
    if (sanitizedReasonFromPlans) return sanitizedReasonFromPlans
    if (sendPlan.status === 'sendable_with_warnings' || sendPlan.status === 'partially_sendable') {
      return '部分附件存在警告，但可以发送。'
    }
    return null
  }

  function canProceedForPartiallySendable(sendPlan: SendPlan): boolean {
    if (sendPlan.status !== 'partially_sendable') return false
    if (!sendPlan.canProceedAfterDroppingExcluded) return false
    if (sendPlan.includedAttachments.length === 0) return false
    const hasExcludedDraft = sendPlan.excludedAttachments.some((item) => item.source === 'draft')
    if (hasExcludedDraft) return false
    const hasBlockedDraft = sendPlan.attachmentPlans.some((item) =>
      item.source === 'draft' && (item.eligibility === 'blocked' || item.displayStatus === 'parsing')
    )
    if (hasBlockedDraft) return false
    return true
  }

  function evaluateComposerSendPlanGate(sendPlan: SendPlan): Readonly<{
    status: SendPlan['status']
    canProceed: boolean
    blockingReason: string | null
    warningReason: string | null
    partialAllowed: boolean
  }> {
    const hasParsingDraft = sendPlan.attachmentPlans.some((item) => item.source === 'draft' && item.displayStatus === 'parsing')
    if (hasParsingDraft) {
      return {
        status: sendPlan.status,
        canProceed: false,
        blockingReason: '附件仍在解析中，完成后才能发送。',
        warningReason: null,
        partialAllowed: false,
      }
    }

    const hasResolvableConfirmationItems = sendPlan.attachmentPlans.some((item) =>
      (item.source === 'draft' || item.source === 'history') &&
      item.displayStatus !== 'parsing' &&
      (item.eligibility === 'excluded' || item.eligibility === 'blocked')
    )

    const hasBlockingDraft = sendPlan.attachmentPlans.some((item) => item.source === 'draft' && item.eligibility === 'blocked')
    if (sendPlan.status === 'blocked' || sendPlan.blockingReasons.length > 0 || hasBlockingDraft) {
      if (hasResolvableConfirmationItems) {
        return {
          status: sendPlan.status,
          canProceed: true,
          blockingReason: null,
          warningReason: '检测到无法直接纳入模型上下文的附件，发送前需要确认处理方式。',
          partialAllowed: false,
        }
      }
      return {
        status: sendPlan.status,
        canProceed: false,
        blockingReason: resolveSendPlanBlockingMessage(sendPlan),
        warningReason: null,
        partialAllowed: false,
      }
    }

    if (sendPlan.status === 'partially_sendable') {
      if (hasResolvableConfirmationItems) {
        return {
          status: sendPlan.status,
          canProceed: true,
          blockingReason: null,
          warningReason: '检测到无法直接纳入模型上下文的附件，发送前需要确认处理方式。',
          partialAllowed: false,
        }
      }
      const partialAllowed = canProceedForPartiallySendable(sendPlan)
      if (!partialAllowed) {
        return {
          status: sendPlan.status,
          canProceed: false,
          blockingReason: '部分附件无法发送，请处理附件后再发送。',
          warningReason: null,
          partialAllowed: false,
        }
      }
      return {
        status: sendPlan.status,
        canProceed: true,
        blockingReason: null,
        warningReason: '部分附件不会发送，仍可继续。',
        partialAllowed: true,
      }
    }

    const warningReason = resolveSendPlanWarningMessage(sendPlan)
    return {
      status: sendPlan.status,
      canProceed: true,
      blockingReason: null,
      warningReason,
      partialAllowed: false,
    }
  }

  function applyComposerSendPlanGateState(sendPlan: SendPlan | null) {
    if (!sendPlan) {
      resetComposerSendPlanGateState()
      return
    }
    const evaluated = evaluateComposerSendPlanGate(sendPlan)
    composerSendPlanStatus.value = evaluated.status
    composerSendPlanCanProceed.value = evaluated.canProceed
    composerSendPlanBlockingSummary.value = evaluated.blockingReason
    composerSendPlanWarningSummary.value = evaluated.warningReason
    composerSendPlanIsPartialAllowed.value = evaluated.partialAllowed
  }

  async function preflightDraftAttachmentSendGate(input: Readonly<{
    conversationId: string
    draftText: string
    modelId: string
    baseUrl: string | null
    historyMessageIds: ReadonlyArray<string>
  }>): Promise<Readonly<{
    status: SendPlan['status'] | null
    canProceed: boolean
    blockingReason: string | null
    warningReason: string | null
    sendPlan: SendPlan | null
  }>> {
    if (draftAttachmentRecords.value.length === 0) {
      return {
        status: null,
        canProceed: true,
        blockingReason: null,
        warningReason: null,
        sendPlan: null,
      }
    }
    const modelDescriptor = await buildSendPlanModelDescriptor(input.modelId)
    const response = await buildCurrentSendPlan({
      conversationId: input.conversationId,
      draftText: input.draftText,
      historyScope: input.historyMessageIds.length > 0 ? { messageIds: Array.from(input.historyMessageIds) } : null,
      model: modelDescriptor,
      providerContext: buildSendPlanProviderContext(input.baseUrl),
    })
    const sendPlan = response.sendPlan
    const evaluated = evaluateComposerSendPlanGate(sendPlan)
    return {
      status: evaluated.status,
      canProceed: evaluated.canProceed,
      blockingReason: evaluated.blockingReason,
      warningReason: evaluated.warningReason,
      sendPlan,
    }
  }

  async function prepareFileSend(input: Readonly<{
    conversationId: string
    userText: string
    modelId: string
    baseUrl: string | null
    historyMessageIds?: ReadonlyArray<string>
  }>): Promise<PreparedOpenRouterSend | null> {
    const modelDescriptor = await buildSendPlanModelDescriptor(input.modelId)
    const prepared = await prepareOpenRouterSendFromDraft({
      conversationId: input.conversationId,
      userText: input.userText,
      model: modelDescriptor,
      providerContext: buildSendPlanProviderContext(input.baseUrl),
      historyMessageIds: input.historyMessageIds,
      pdfFileParser: { enabled: true, engine: 'native' },
    })
    if (prepared && shouldLogDebug()) {
      console.info('[ui-app] file send plan prepared', {
        status: prepared.sendPlan.status,
        includedAttachmentCount: prepared.diagnostics.includedAttachmentCount,
        excludedAttachmentCount: prepared.diagnostics.excludedAttachmentCount,
        injectedPlugins: prepared.diagnostics.injectedPlugins,
      })
    }
    return prepared
  }

  async function onSend() {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    const text = draft.value.trim()
    if (!text) return

    const convoId = await ensureActiveConvo()
    const branch = await ensureActiveBranch(convoId)
    loadError.value = null

    const apiKey = await getOpenRouterApiKey()
    if (!apiKey) {
      loadError.value = 'Missing OpenRouter API key (set electron-store openRouterApiKey or VITE_OPENROUTER_API_KEY)'
      return
    }

    const baseUrl = await getOpenRouterBaseUrl()
    const modelId = normalizeModelKey(model.value)

    let contextMessages: any[] = []
    let contextMessageIds: string[] = []
    try {
      const built = await buildContextForBranchInternalMessages(branch.id, { limit: 200, debug: !!import.meta.env?.DEV })
      contextMessages = built.contextMessages as any[]
      contextMessageIds = built.rawMessages.map((message) => message.id)
    } catch (err) {
      if (import.meta.env?.DEV) console.warn('[ui-app] context.buildForBranch failed; using empty context', err)
    }

    composerSendPlanLoading.value = true
    let gate: Readonly<{
      status: SendPlan['status'] | null
      canProceed: boolean
      blockingReason: string | null
      warningReason: string | null
      sendPlan: SendPlan | null
    }> = {
      status: null,
      canProceed: true,
      blockingReason: null,
      warningReason: null,
      sendPlan: null,
    }
    try {
      gate = await preflightDraftAttachmentSendGate({
        conversationId: convoId,
        draftText: text,
        modelId,
        baseUrl,
        historyMessageIds: contextMessageIds,
      })
      applyComposerSendPlanGateState(gate.sendPlan)
      const confirmationRequest = buildAttachmentConfirmationRequestFromSendPlan('composer_send', gate.sendPlan)
      if (confirmationRequest) {
        const result = await requestAttachmentConfirmation(confirmationRequest)
        if (!result.confirmed) return
        const draftDecisions = result.decisions.filter((item) => item.source !== 'history')
        if (draftDecisions.length > 0) {
          await applyDraftAttachmentDecisions(draftDecisions)
          gate = await preflightDraftAttachmentSendGate({
            conversationId: convoId,
            draftText: text,
            modelId,
            baseUrl,
            historyMessageIds: contextMessageIds,
          })
          applyComposerSendPlanGateState(gate.sendPlan)
        }
      }
      if (!gate.canProceed) {
        setAttachmentFeedback('error', gate.blockingReason ?? '当前请求无法发送，请处理附件或更换模型。')
        return
      }
      if (gate.warningReason) {
        setAttachmentFeedback('warning', gate.warningReason)
      }
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
      return
    } finally {
      composerSendPlanLoading.value = false
    }

    let preparedFileSend: PreparedOpenRouterSend | null = null
    try {
      preparedFileSend = await prepareFileSend({
        conversationId: convoId,
        userText: text,
        modelId,
        baseUrl,
        historyMessageIds: contextMessageIds,
      })
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
      return
    }

    const begun = await beginTurn(branch.id, text, {
      ...(preparedFileSend?.hasDraftAttachmentPlans ? { attachConversationDraft: true } : {}),
      ...(preparedFileSend ? { sentAssetIds: collectSentAssetIds(preparedFileSend.sendPlan) } : {}),
    })
    draft.value = ''
    const cleared = await updateConversationDraftText({
      conversationId: convoId,
      draftText: '',
      draftMode: 'compose',
      editingSourceMessageId: null,
    })
    applyDraftPersistenceStateFromDraft(cleared)
    void refreshDraftAttachmentViewModels()
    // Branch tip update (definition): the new assistant becomes the insertion point for the next turn.
    patchBranch(branch.id, { headMessageId: begun.assistantId, updatedAt: Date.now() })

    const userMessageId = begun.questionId
    const assistantMessageId = begun.assistantId
    const assistantSeq = begun.assistantSeq

    messageSeqById.value.set(userMessageId, begun.questionSeq)
    messageSeqById.value.set(assistantMessageId, assistantSeq)

    ensureMessageMetaEntry(userMessageId, { role: 'user', status: 'final' })
    ensureMessageMetaEntry(assistantMessageId, {
      parentId: userMessageId,
      questionId: userMessageId,
      answerRootId: assistantMessageId,
      role: 'assistant',
      status: 'streaming',
    })

    const { requestedReasoningMode, requestedReasoningEffortValue, requestedReasoningExclude } = getRequestedReasoningConfig()
    const webSearchConfig = await resolveWebSearchConfigForConvoId(convoId)
    const samplingParamsConfig = await resolveSamplingParamsConfigForConvoId(convoId)
    const imageGenerationConfig = resolveImageGenerationConfigForRequest()
    const requestId = randomId('req')

    const started = startGeneration(state.value, {
      runId: branch.id,
      requestId,
      model: modelId,
      userMessageId,
      userMessageText: text,
      assistantMessageId,
      ...(imageGenerationConfig ? { requestedImageGeneration: true } : {}),
      requestedReasoningMode,
      ...(requestedReasoningEffortValue ? { requestedReasoningEffort: requestedReasoningEffortValue } : {}),
      ...(requestedReasoningExclude ? { requestedReasoningExclude: true } : {}),
    })
    state.value = started.state

    const requestReasoningConfig = buildReasoningRequestConfigSnapshot({
      requestedReasoningMode,
      requestedReasoningEffortValue,
      requestedReasoningExclude,
    })
    try {
      await setMessageReasoningRequestConfig({ messageId: assistantMessageId, value: requestReasoningConfig })
    } catch (err) {
      if (shouldLogDebug()) console.warn('[ui-app] setMessageReasoningRequestConfig failed (non-fatal):', err)
    }
    void recordRecentModelUsage(modelId)

    await runAssistantStreamSession({
      convoId,
      branchId: branch.id,
      requestId,
      assistantMessageId,
      assistantSeq,
      modelId,
      ...(preparedFileSend ? { pdfAnnotationCaptureAssetIds: getPreparedPdfAssetIds(preparedFileSend) } : {}),
      createEvents: (signal) => streamOpenRouterChatAsEvents({
        requestId,
        assistantMessageId,
        userText: text,
        contextMessages,
        ...(preparedFileSend?.contentParts.length ? { currentUserContentBlocks: preparedFileSend.contentParts } : {}),
        signal,
        config: {
          apiKey,
          model: modelId,
          requestedReasoningMode,
          webSearch: webSearchConfig,
          ...(hasSamplingParamsPatch(samplingParamsConfig.requestPatch) ? { samplingParams: samplingParamsConfig.requestPatch } : {}),
          ...(imageGenerationConfig ? { imageGeneration: imageGenerationConfig } : {}),
          ...(requestedReasoningEffortValue ? { requestedReasoningEffort: requestedReasoningEffortValue } : {}),
          ...(requestedReasoningExclude ? { requestedReasoningExclude: true } : {}),
          ...(preparedFileSend?.additionalPlugins.length ? { openRouterAdditionalPlugins: preparedFileSend.additionalPlugins } : {}),
          ...(baseUrl ? { baseUrl } : {}),
        },
      }),
    })
  }

  function getPreparedPdfAssetIds(prepared: PreparedOpenRouterSend): string[] {
    return Array.from(
      new Set(
        prepared.sendPlan.attachmentPlans
          .filter((plan) => (plan.eligibility === 'included' || plan.eligibility === 'warning') && plan.aiPayloadKind === 'pdf')
          .map((plan) => plan.assetId)
      )
    )
  }

  function collectSentAssetIds(sendPlan: PreparedOpenRouterSend['sendPlan']): string[] {
    return Array.from(new Set(sendPlan.includedAttachments.map((attachment) => attachment.assetId)))
  }

  async function onForkFromHead() {
    if (isRunning.value) return
    const convoId = activeConvoId.value
    const branch = activeBranch.value
    if (!convoId || !branch?.id || !branch.headMessageId) return

    try {
      const created = await createBranchFromMessage({
        sourceBranchId: branch.id,
        // Fork base is the branch tip (definition), not a UI cursor.
        baseMessageId: branch.headMessageId,
        copyChoices: true,
        copyFilters: true,
        requireOnSourcePath: true,
      })
      await refreshBranchesForActiveConvo()
      activeBranchId.value = created.id
      resetCandidatesCache()
      await refreshRenderableBranchView(created.id)
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
      await deleteBranch(bid)
      await refreshBranchesForActiveConvo()
      const next = branches.value[0] ?? (await ensureDefaultBranch(convoId, { name: 'Main' }))
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
      await switchCandidate(bid, questionId, target.answerRootId)
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
      const res = await switchQuestionCandidate(bid, baseMessageId, target.questionId)
      // Branch tip update (definition): backend returns the new insertion point after switching question candidate.
      patchBranch(bid, { headMessageId: res.headMessageId, updatedAt: Date.now() })
      await refreshRenderableBranchView(bid)
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
      await refreshRenderableBranchView(bid)
    }
  }

  async function onRegenerateFromQuestion(questionId: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    if (activeAssistantMessageId.value) return

    const convoId = activeConvoId.value
    const branch = activeBranch.value
    const qid = String(questionId ?? '').trim()
    if (!convoId || !branch?.id || !qid) return

    const questionText = getUserQuestionText(qid)
    if (!questionText) return

    // Capture old chosen answer root for debugging
    const oldChosenAnswerRootId = turnFiltersByQuestionId.value.get(qid)?.chosenAnswerRootId
    if (import.meta.env?.DEV) {
      console.log('[ui-app] onRegenerateFromQuestion START', {
        questionId: qid,
        branchId: branch.id,
        oldChosenAnswerRootId,
      })
    }

    loadError.value = null
    const contextMessages = await buildContextMessagesBeforeQuestion(branch.id, qid)
    let replayPrepared: PreparedOpenRouterReplay | null = null
    try {
      replayPrepared = await prepareReplayForHistoricalUserMessage({
        branchId: branch.id,
        userMessageId: qid,
        userText: questionText,
      })
      const confirmationRequest = buildAttachmentConfirmationRequestFromReplay('regenerate', replayPrepared)
      if (confirmationRequest) {
        const result = await requestAttachmentConfirmation(confirmationRequest)
        if (!result.confirmed) return
        replayPrepared = await prepareReplayForHistoricalUserMessage({
          branchId: branch.id,
          userMessageId: qid,
          userText: questionText,
          attachmentDecisions: result.decisions,
        })
      } else if (replayPrepared?.status === 'needs_confirmation') {
        throw new Error(buildReplayBlockedMessage(replayPrepared))
      }
      if (!replayPrepared || replayPrepared.status !== 'sendable') {
        throw new Error(buildReplayBlockedMessage(replayPrepared))
      }
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
      return
    }

    try {
      const regen = await regenerateFromQuestion(branch.id, qid)
      if (import.meta.env?.DEV) {
        console.log('[ui-app] onRegenerateFromQuestion after regenerate', {
          newAnswerRootId: regen.newAnswerRootId,
          newAssistantSeq: regen.newAssistantSeq,
        })
      }
      invalidateCandidatesForQuestion(qid)
      // Branch tip update (definition): regeneration chooses a new answer root and moves insertion point.
      patchBranch(branch.id, { headMessageId: regen.newAnswerRootId, updatedAt: Date.now() })
      await refreshRenderableBranchView(branch.id)
      
      // Log candidates after refresh
      if (import.meta.env?.DEV) {
        const cachedCandidates = candidatesCache.value.get(qid)
        console.log('[ui-app] onRegenerateFromQuestion after refresh', {
          cachedCandidatesCount: cachedCandidates?.length ?? 0,
          cachedCandidateIds: cachedCandidates?.map(c => c.answerRootId) ?? [],
          newChosenAnswerRootId: turnFiltersByQuestionId.value.get(qid)?.chosenAnswerRootId,
        })
      }
      
      await startStreamingForAssistantTurn({
        convoId,
        branchId: branch.id,
        questionId: qid,
        questionText,
        assistantMessageId: regen.newAnswerRootId,
        assistantSeq: regen.newAssistantSeq,
        contextMessages,
        replayPrepared,
      })
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
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
      const previousDraft = await restoreConversationDraft(convoId)
      const cloned = await cloneConversationDraftFromMessage({
        conversationId: convoId,
        sourceMessageId: qid,
      })
      applyDraftPersistenceStateFromDraft(cloned)
      draft.value = cloned.draftText
      editRestoredDraftAttachmentAssetIds.value = new Set(cloned.attachedAssetIds.map((assetId) => String(assetId ?? '').trim()).filter(Boolean))
      await refreshDraftAttachmentViewModels({ restoredDraft: cloned })
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
      await restoreDraftSnapshot(session.previousDraft)
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
    const useDraftClone = isEditingDraftForMessage(oldQuestionId)
    const newText = draft.value.trim()
    if (!oldQuestionId || !newText) return

    const baseMessageId = messageMetaById.value.get(oldQuestionId)?.parentId ?? null
    if (mode === 'replace' && !canReplaceQuestionInUi(oldQuestionId)) return

    loadError.value = null
    let replayPreparedForEdit: PreparedOpenRouterReplay | null = null
    let confirmedAttachmentDecisions: AttachmentDecision[] = []
    if (!useDraftClone) {
      loadError.value = 'Edit Question fallback path is blocked: historical attachments could not be restored into draft for current replay.'
      setAttachmentFeedback('error', '无法恢复历史附件，已阻断本次编辑重发（避免静默纯文本发送）。')
      return
    }

    const modelId = normalizeModelKey(model.value)
    const baseUrl = await getOpenRouterBaseUrl()
    let historyMessageIdsForGate: string[] = []
    try {
      const built = await buildContextForBranchInternalMessages(branch.id, { limit: 200, debug: !!import.meta.env?.DEV })
      historyMessageIdsForGate = built.rawMessages.map((message) => message.id)
    } catch {
      historyMessageIdsForGate = []
    }
    const runEditPreflight = async () => await preflightDraftAttachmentSendGate({
      conversationId: convoId,
      draftText: newText,
      modelId,
      baseUrl,
      historyMessageIds: historyMessageIdsForGate,
    })
    let editGate = await runEditPreflight()
    applyComposerSendPlanGateState(editGate.sendPlan)
    const confirmationRequest = buildAttachmentConfirmationRequestFromSendPlan('edit_submit', editGate.sendPlan)
    if (confirmationRequest) {
      const result = await requestAttachmentConfirmation(confirmationRequest)
      if (!result.confirmed) return
      confirmedAttachmentDecisions = result.decisions
      const draftDecisions = result.decisions.filter((item) => item.source !== 'history')
      if (draftDecisions.length > 0) {
        await applyDraftAttachmentDecisions(draftDecisions)
        editGate = await runEditPreflight()
        applyComposerSendPlanGateState(editGate.sendPlan)
      }
    }
    if (!editGate.canProceed) {
      setAttachmentFeedback('error', editGate.blockingReason ?? '当前编辑请求无法发送，请处理附件后重试。')
      return
    }

    try {
      const res =
        mode === 'replace'
          ? await retryReplaceQuestion(branch.id, oldQuestionId, newText)
          : await forkQuestion(branch.id, oldQuestionId, newText)

      if (useDraftClone) {
        const attached = await attachConversationDraftToMessage({
          conversationId: convoId,
          messageId: res.newQuestionId,
        })
        applyDraftPersistenceStateFromDraft(attached.draft)
        draft.value = attached.draft.draftText
        editRestoredDraftAttachmentAssetIds.value = new Set()
        await refreshDraftAttachmentViewModels({ restoredDraft: attached.draft })
        replayPreparedForEdit = await prepareReplayForHistoricalUserMessage({
          branchId: branch.id,
          userMessageId: res.newQuestionId,
          userText: newText,
          attachmentDecisions: confirmedAttachmentDecisions,
        })
        if (!replayPreparedForEdit || replayPreparedForEdit.status !== 'sendable') {
          throw new Error(buildReplayBlockedMessage(replayPreparedForEdit))
        }
      }

      invalidateQuestionCandidatesForSlot(baseMessageId)
      // Branch tip update (definition): fork/replace creates a new assistant and moves insertion point.
      patchBranch(branch.id, { headMessageId: res.assistantId, updatedAt: Date.now() })

      // Build context off the NEW head (branch is now pointed at the new assistant),
      // then slice to messages strictly before the new question.
      const built = await buildContextForBranchInternalMessages(branch.id, { limit: 200, debug: !!import.meta.env?.DEV })
      const rowsBefore = built.rawMessages.filter((m) => typeof m.seq === 'number' && m.seq < res.newQuestionSeq)
      const contextMessages = toInternalMessagesFromBranchPath(rowsBefore as any)

      messageSeqById.value.set(res.newQuestionId, res.newQuestionSeq)
      messageSeqById.value.set(res.assistantId, res.assistantSeq)

      questionEditSession.value = null
      await refreshRenderableBranchView(branch.id)

      await startStreamingForAssistantTurn({
        convoId,
        branchId: branch.id,
        questionId: res.newQuestionId,
        questionText: newText,
        assistantMessageId: res.assistantId,
        assistantSeq: res.assistantSeq,
        contextMessages,
        replayPrepared: replayPreparedForEdit,
      })
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
      await refreshRenderableBranchView(branch.id)
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

  async function onRetryReplaceAnswer(questionId: string, currentAnswerRootId: string) {
    if (isRunning.value) return
    if (isDraftInteractionLocked.value) return
    if (activeAssistantMessageId.value) return

    const convoId = activeConvoId.value
    const branch = activeBranch.value
    const qid = String(questionId ?? '').trim()
    const current = String(currentAnswerRootId ?? '').trim()
    if (!convoId || !branch?.id || !qid || !current) return

    const questionText = getUserQuestionText(qid)
    if (!questionText) return

    loadError.value = null
    const contextMessages = await buildContextMessagesBeforeQuestion(branch.id, qid)
    let replayPrepared: PreparedOpenRouterReplay | null = null
    try {
      replayPrepared = await prepareReplayForHistoricalUserMessage({
        branchId: branch.id,
        userMessageId: qid,
        userText: questionText,
      })
      const confirmationRequest = buildAttachmentConfirmationRequestFromReplay('retry_replace', replayPrepared)
      if (confirmationRequest) {
        const result = await requestAttachmentConfirmation(confirmationRequest)
        if (!result.confirmed) return
        replayPrepared = await prepareReplayForHistoricalUserMessage({
          branchId: branch.id,
          userMessageId: qid,
          userText: questionText,
          attachmentDecisions: result.decisions,
        })
      } else if (replayPrepared?.status === 'needs_confirmation') {
        throw new Error(buildReplayBlockedMessage(replayPrepared))
      }
      if (!replayPrepared || replayPrepared.status !== 'sendable') {
        throw new Error(buildReplayBlockedMessage(replayPrepared))
      }
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
      return
    }

    try {
      const res = await retryReplaceAnswer(branch.id, qid, current)
      invalidateCandidatesForQuestion(qid)
      // Branch tip update (definition): retry-replace moves insertion point to the new answer root.
      patchBranch(branch.id, { headMessageId: res.newAnswerRootId, updatedAt: Date.now() })
      await refreshRenderableBranchView(branch.id)
      await startStreamingForAssistantTurn({
        convoId,
        branchId: branch.id,
        questionId: qid,
        questionText,
        assistantMessageId: res.newAnswerRootId,
        assistantSeq: res.newAssistantSeq,
        contextMessages,
        replayPrepared,
      })
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
      await refreshRenderableBranchView(branch.id)
    }
  }

  async function onToggleQuestionExclude(questionId: string) {
    const bid = activeBranchId.value
    if (!bid) return
    const current = turnFiltersByQuestionId.value.get(questionId)
    if (current?.questionMode === 'exclude') {
      await clearBranchFilter({ branchId: bid, targetType: 'question', targetId: questionId })
    } else {
      await setBranchFilter({ branchId: bid, targetType: 'question', targetId: questionId, mode: 'exclude' })
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
      await clearBranchFilter({ branchId: bid, targetType: 'answer', targetId: answerRootId })
    } else {
      await setBranchFilter({ branchId: bid, targetType: 'answer', targetId: answerRootId, mode: 'exclude' })
    }
    await refreshTurnFilters(bid)
  }

  onMounted(async () => {
    isReady.value = false
    loadError.value = null

    if (!hasDbBridge()) {
      isReady.value = true
      loadError.value = 'Missing dbBridge (run in Electron via `npm run electron:dev`)'
      return
    }

    // 注意：dbEventBus 在模块导入时已自动初始化并开始缓冲
    // 这里只需要在基线同步完成后 flush

    try {
      // 基线同步：先加载所有数据
      await refreshProjects()
      await refreshConvos()
      await refreshGlobalReasoningPrefs()
      await refreshGlobalWebSearchDefaults()
      await refreshGlobalSamplingParamsDefaults()
      await refreshGlobalUserMessageRenderDefault()
      await refreshGlobalImageGenerationDefault()
      reasoningDisplayMode.value = await getChatReasoningDisplayMode()
      await loadTranscriptForActiveConvo()
      await restoreDraftForActiveScope()
      
      // 基线同步完成，flush 缓冲的事件
      flushBuffer()
      
      assertInvariants() // Stable boundary: initial load complete
    } catch (err: any) {
      loadError.value = err?.message ? String(err.message) : String(err)
    } finally {
      isReady.value = true
    }
  })

  onMounted(() => {
    window.addEventListener('settings:reasoningPrefsUpdated', handleGlobalReasoningPrefsUpdated)
    window.addEventListener('settings:userMessageRenderDefaultUpdated', handleGlobalUserMessageRenderDefaultUpdated)
    window.addEventListener('settings:webSearchDefaultsUpdated', handleGlobalWebSearchDefaultsUpdated)
    window.addEventListener('settings:samplingParamsDefaultsUpdated', handleGlobalSamplingParamsDefaultsUpdated)
    window.addEventListener('settings:imageGenerationDefaultUpdated', handleGlobalImageGenerationDefaultUpdated)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handlePageHide)
  })

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

  // DB 事件订阅
  let unsubscribeDbEvent: (() => void) | null = null

  onMounted(() => {
    unsubscribeDbEvent = subscribeDbEvent(handleDbEvent)
  })

  function handleDbEvent(event: DbEvent) {
    switch (event.type) {
      case 'project.created':
      case 'project.updated':
      case 'project.deleted':
        // 项目变更：刷新项目列表
        void refreshProjects()
        break
      case 'conversation.moved':
        // 对话移动：刷新对话列表和项目计数
        void refreshConvos()
        void refreshProjectCounts()
        break
      case 'conversation.activity_updated':
        // 对话活动更新：如果是当前显示的对话列表，可能需要重新排序
        // 优化：仅在 "全部对话" 或当前项目匹配时刷新
        void refreshConvos()
        break
    }
  }

  onUnmounted(() => {
    void flushDraftPersistence()
    window.removeEventListener('settings:reasoningPrefsUpdated', handleGlobalReasoningPrefsUpdated)
    window.removeEventListener('settings:userMessageRenderDefaultUpdated', handleGlobalUserMessageRenderDefaultUpdated)
    window.removeEventListener('settings:webSearchDefaultsUpdated', handleGlobalWebSearchDefaultsUpdated)
    window.removeEventListener('settings:samplingParamsDefaultsUpdated', handleGlobalSamplingParamsDefaultsUpdated)
    window.removeEventListener('settings:imageGenerationDefaultUpdated', handleGlobalImageGenerationDefaultUpdated)
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('beforeunload', handlePageHide)
    // 清理 DB 事件订阅
    if (unsubscribeDbEvent) {
      unsubscribeDbEvent()
      unsubscribeDbEvent = null
    }
    destroyDbEventBus()

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
    const ipc = getIpcRenderer()
    if (!ipc) return
    ipc.on('db:modelCatalogSynced', onModelsSynced)
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
    reasoningInlineMode,
    reasoningRailMode,
    rightRailOpen,
    rightRailCanShowReasoning,
    toggleRightRailOpen,
    rightRailView,
    effectiveRightRailView,
    setRightRailView,
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
    getCandidatePager,
    candidatesLoading,
    onCandidateShift,
    questionIdForMessage,
    lastAssistantReasoningView,
    lastAssistantReasoningVersion,
    lastAssistantPanelState,
    lastAssistantIsStreaming,
    lastAssistantReasoningPieces,
    lastAssistantMessage,
    draft,
    draftAttachmentViewModels,
    selectedDraftAttachmentDetails,
    composerCanSend,
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
    model,
    requestedReasoningEffort,
    requestedReasoningExclude,
    modelCatalogForPicker,
    showHiddenModelsInPickers,
    modelCatalogNotice,
    modelPrefsScopeForUi,
    activeSessionSamplingParamsLayer,
    activeSessionSamplingParamsResolved,
    sessionSamplingParamsQuickSaving,
    sessionWebSearchSettingsSaving,
    activeSessionWebSearchLayer,
    activeSessionWebSearchResolved,
    sessionWebSearchQuickSaving,
    imageGenerationState,
    imageGenerationSupported,
    imageGenerationFollowDefault,
    selectedModelImageCapabilityClass,
    imageGenerationSupportHint,
    imageGenerationAdvancedError,
    onUpdateModel,
    onUpdateReasoningEnabled,
    onUpdateReasoningEffortLevel,
    onUpdateWebSearchEnabled,
    onUpdateWebSearchLevel,
    onUpdateImageGenerationEnabled,
    onUpdateImageGenerationResolution,
    onUpdateImageGenerationAspectRatio,
    onUpdateReasoningDisplayMode,
    onComposerUpdateSamplingParamsLayer,
    onComposerUpdateWebSearchLayer,
    onUpdateImageGeneration,
    onUpdateImageGenerationFollowDefault,
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
    sessionSamplingParamsDraft,
    sessionSamplingParamsDraftResolved,
    sessionWebSearchDraft,
    sessionWebSearchDraftResolved,
    sessionWebSearchDraftHint,
    sessionWebSearchSettingsStatus,
    saveSessionWebSearchSettings,
    projectWebSearchSettingsOpen,
    projectWebSearchSettingsTarget,
    closeProjectWebSearchSettings,
    projectSamplingParamsDraft,
    projectSamplingParamsResolved,
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

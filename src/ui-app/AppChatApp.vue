<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ChatTranscript from '@/ui-kit/chat/ChatTranscript.vue'
import ChatMessageBubble from '@/ui-kit/chat/ChatMessageBubble.vue'
import ChatAppReasoningPanel from './components/ChatAppReasoningPanel.vue'
import ReasoningArtifactDiagnostics from './components/ReasoningArtifactDiagnostics.vue'
import ChatWorkspaceShell from './components/ChatWorkspaceShell.vue'
import WorkspaceIcon from './components/WorkspaceIcon.vue'
import ChatTopSummaryBar from './components/ChatTopSummaryBar.vue'
import WorkspaceStartupRecovery from './components/WorkspaceStartupRecovery.vue'
import ChatRightRail from './components/ChatRightRail.vue'
import ChatSessionConsole from './components/ChatSessionConsole.vue'
import ChatInlineReasoning from './components/ChatInlineReasoning.vue'
import ConversationList from './components/ConversationList.vue'
import DraftAttachmentStrip from './components/DraftAttachmentStrip.vue'
import DraftAttachmentDetailsDialog from './components/DraftAttachmentDetailsDialog.vue'
import MessageAttachmentList from '@/ui-kit/chat/MessageAttachmentList.vue'
import ChatAppComposer from './components/ChatAppComposer.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SettingsModal from './components/SettingsModal.vue'
import WebSearchSettingsEditor from './components/WebSearchSettingsEditor.vue'
import GenerationParamsSettingsEditor from './components/GenerationParamsSettingsEditor.vue'
import SearchModal from './components/SearchModal.vue'
import { useAppChatAppLogic } from './app/appChatApp.logic'
import { formatModelIndicatorName } from './components/modelIndicatorName'
import { OPENROUTER_PROVIDER_ID } from '@/next/provider/modelSelection'
import { t, tf } from '@/shared/i18n'
import { createCompatibleProviderRegistryClient } from '@/next/provider/openai-chat-compatible/ui'
import type { CanonicalModelSubjectV1 } from '@/core/generation-v2/model-facts/canonicalSourceFactsV1'

const workspaceMenuOpen = ref(false)
const workspaceMenuTrigger = ref<HTMLButtonElement | null>(null)
function closeWorkspaceMenu() {
  workspaceMenuOpen.value = false
  workspaceMenuTrigger.value?.focus()
}
function openWorkspaceSettings() {
  closeWorkspaceMenu()
  openSettings()
}
function dismissWorkspaceMenu(event: PointerEvent) {
  if (!(event.target as Element | null)?.closest('.sv-workspace-footer')) workspaceMenuOpen.value = false
}

const {
  isReady,
  startupState,
  retryStartup,
  settingsAllowed,
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
  onRefreshWorkspace,
  activeDraftConflict,
  draftConflictReloadConfirmation,
  cancelDraftConflictReload,
  confirmDraftConflictReload,
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
  searchNameHighlight,
  searchMessageNavLabel,
  onNavigateSearchMessage,
  runVM,
  isRunning,
  activeTitle,
  branches,
  hasMoreBranches,
  activeBranchId,
  activeBranch,
  onSelectBranch,
  onForkFromHead,
  onDeleteActiveBranch,
  onRenameActiveBranch,
  loadMoreBranches,
  getBranchRuntimeStatus,
  reasoningDisplayMode,
  reasoningPanelDefaultExpanded,
  reasoningPanelAutoCollapseAfterReasoning,
  reasoningRailMode,
  rightRailOpen,
  closeRightRailPanel,
  toggleConsolePanel,
  openImageSettings,
  imageMaskOptions,
  effectiveRightRailView,
  normalizedErrorSummary,
  normalizedErrorActionHint,
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
  historyAttachmentViewModelsByMessageId,
  onReviewHistoryIncompatibleAttachments,
  onNavigateHistoryIncompatibleAttachments,
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
  modelCatalogForPicker,
  providerModelPickerSources,
  modelCatalogNotice,
  modelPrefsScopeForUi,
  activeSessionGenerationParamsResolved,
  activeSessionCapabilityProjection,
  activeSessionCapabilityExplanations,
  activeSessionWebSearchResolved,
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
  attachmentFeedbackTone,
  attachmentFeedbackMessage,
  attachmentUrlDialogOpen,
  attachmentUrlDraft,
  attachmentUrlRetentionMode,
  composerImageInputSupported,
  composerImageInputSupportReason,
  closeAttachmentUrlDialog,
  submitAttachmentUrl,
  onSend,
  onAbort,
  settingsOpen,
  openSettings,
  closeSettings,
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
  onOpenReasoningDisplayForMessage,
} = useAppChatAppLogic()
const effectiveIsRunning = computed(() => isRunning.value)
const modelFactsInspectorSubject = ref<CanonicalModelSubjectV1 | null>(null)
const modelFactsInspectorPath = ref<string | null>(null)
function openModelFactsInspector(subject: CanonicalModelSubjectV1, path: string | null = null) {
  modelFactsInspectorSubject.value = subject
  modelFactsInspectorPath.value = path
  openSettings()
}
/** Opens the Inspector at the exact Model Facts path behind a capability-aware control. */
function openModelFactsInspectorPath(path: string) {
  const subject = activeSessionCapabilityExplanations.value?.subject
  if (subject) openModelFactsInspector(subject, path)
}
/** Search's display-limit and pagination-capacity notices deep-link to the Search settings section. */
const searchSettingsTarget = ref(false)
function openSearchSettings() {
  closeSearchModal()
  searchSettingsTarget.value = true
  openSettings()
}
watch(settingsOpen, (open) => {
  if (!open) {
    modelFactsInspectorSubject.value = null
    modelFactsInspectorPath.value = null
    searchSettingsTarget.value = false
  }
})
const templateResetOpen = ref(false)
const resetTemplateModelConfig = ref(true)
const resetTemplateDraftAttachments = ref(true)
function onComposerSend() {
  void onSend()
}

const branchRenameOpen = ref(false)
const branchRenameText = ref('')
const branchDeleteConfirmOpen = ref(false)
const branchActionBusy = ref(false)
const canDeleteBranch = computed(() => isReady.value && !isRunning.value && !branchActionBusy.value &&
  (branches.value.length > 1 || hasMoreBranches.value))
const canForkBranch = computed(() => isReady.value && !isRunning.value && !branchActionBusy.value &&
  !!activeBranch.value?.headMessageId)
watch(activeBranchId, () => { branchRenameOpen.value = false; branchDeleteConfirmOpen.value = false })
function openBranchRename() {
  branchDeleteConfirmOpen.value = false
  branchRenameText.value = activeBranch.value?.name ?? ''
  branchRenameOpen.value = true
}
async function runBranchAction(action: () => Promise<unknown>) {
  if (branchActionBusy.value) return
  branchActionBusy.value = true
  try { await action() } finally { branchActionBusy.value = false }
}
async function submitBranchRename() {
  await runBranchAction(async () => { if (await onRenameActiveBranch(branchRenameText.value)) branchRenameOpen.value = false })
}
async function confirmBranchDelete() {
  branchDeleteConfirmOpen.value = false
  await runBranchAction(onDeleteActiveBranch)
}

const branchSummary = computed(() => {
  if (!activeBranch.value) return 'Branch unavailable'
  return activeBranch.value.name?.trim()
    ? `Branch ${activeBranch.value.name}`
    : `Branch ${activeBranch.value.id.slice(0, 8)}`
})

const runSummary = computed(() => {
  if (isRunning.value) return `Running · ${runVM.value?.status ?? 'streaming'}`
  if (runVM.value?.status) return `Status · ${runVM.value.status}`
  return 'Idle'
})

const compatibleProviderName = ref<string | null>(null)
let compatibleProviderNameRequest = 0
watch(() => activeSessionConfig.value.routeSelection?.kind === 'openai_chat_compatible'
  ? activeSessionConfig.value.routeSelection.providerInstanceId : null, async (providerInstanceId) => {
  const request = ++compatibleProviderNameRequest
  compatibleProviderName.value = null
  if (!providerInstanceId) return
  try {
    const details = await createCompatibleProviderRegistryClient().get(providerInstanceId)
    if (request === compatibleProviderNameRequest) compatibleProviderName.value = details.provider.displayName
  } catch {
    if (request === compatibleProviderNameRequest) compatibleProviderName.value = null
  }
}, { immediate: true })

const modelSummary = computed(() => {
  const route = activeSessionConfig.value.routeSelection
  if (route?.kind === 'openai_chat_compatible') {
    return tf('chat.topBar.modelSummaryWithProvider', {
      provider: compatibleProviderName.value ?? route.providerInstanceId,
      model: formatModelIndicatorName(route.modelId),
    })
  }
  const selectedProvider = route?.providerId
  const selected = route?.modelId
  if (!selectedProvider || !selected) return t('chat.console.runtime.noProviderSelected')
  const match = modelCatalogForPicker.value.find((item) => item.modelId === selected)
  const modelLabel = formatModelIndicatorName(match?.name ?? selected)
  return selectedProvider === OPENROUTER_PROVIDER_ID
    ? tf('chat.topBar.modelSummary', { model: modelLabel })
    : tf('chat.topBar.modelSummaryWithProvider', { provider: selectedProvider, model: modelLabel })
})

const webSummary = computed(() => {
  if (!activeSessionConfig.value.webSearch.enabled) return 'Web · off'
  return `Web · ${activeSessionConfig.value.webSearch.level}`
})

function shouldShowInlineReasoning(message: any): boolean {
  if (!message || message.role !== 'assistant') return false
  const view = message.reasoningView
  if (!view) return false
  if (view.visibility === 'shown' || view.visibility === 'excluded') return true
  if (view.hasEncrypted === true) return true
  if (Array.isArray(view.displayBlocks) && view.displayBlocks.length > 0) return true
  return false
}

type RawRequestRecord = Readonly<{
  id: string; requestSequence: number; providerId: string; modelId: string
  serializedBody: string; bodyBytes: number; bodySha256: string; capturedAtMs: number
}>
type RawProviderErrorRecord = Readonly<{
  id: string; requestSequence: number; providerId: string; modelId: string
  phase: 'http_response' | 'sse_event'; httpStatus: number; contentType: string | null
  providerRequestId: string | null; payloadBase64: string; payloadText: string | null
  payloadBytes: number; payloadSha256: string; capturedAtMs: number
}>
const rawDataOpen = ref(false)
const rawDataLoading = ref(false)
const rawDataAnswerRootId = ref('')
const rawDataRecords = ref<readonly RawRequestRecord[]>([])
const rawProviderErrorRecords = ref<readonly RawProviderErrorRecord[]>([])
const rawDataError = ref<string | null>(null)

async function openRawData(answerRootId: string) {
  rawDataAnswerRootId.value = answerRootId
  rawDataOpen.value = true
  rawDataLoading.value = true
  rawDataError.value = null
  try {
    const debugBridge = window.rawGenerationDebug
    if (!debugBridge) throw new Error('RAW_DEBUG_BRIDGE_UNAVAILABLE')
    const status = await debugBridge.getStatus()
    if (!status.available || !status.schemaReady) {
      throw new Error(status.errorCode ?? 'RAW_DEBUG_STORE_UNAVAILABLE')
    }
    ;[rawDataRecords.value, rawProviderErrorRecords.value] = await Promise.all([
      debugBridge.listByAnswerRootId(answerRootId),
      debugBridge.listProviderErrorsByAnswerRootId(answerRootId),
    ])
  } catch (error) {
    rawDataRecords.value = []
    rawProviderErrorRecords.value = []
    rawDataError.value = error instanceof Error ? error.message : String(error)
  } finally {
    rawDataLoading.value = false
  }
}

function closeRawData() { rawDataOpen.value = false }
function formatRawRequestBody(body: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2) } catch { return body }
}
function formatRawProviderError(record: RawProviderErrorRecord): string {
  if (record.payloadText === null) return record.payloadBase64
  try { return JSON.stringify(JSON.parse(record.payloadText), null, 2) } catch { return record.payloadText }
}
</script>

<template>
  <div class="flex h-full min-h-0 w-full overflow-hidden bg-white" @pointerdown="dismissWorkspaceMenu">
    <ChatWorkspaceShell
      :rightRailOpen="rightRailOpen"
      :composer-centered="isReady && workspaceMode !== 'none' && transcriptMessageIds.length === 0"
      @closeRightRail="closeRightRailPanel"
    >
      <template #sidebar>
        <div class="flex h-full min-h-0 flex-col">
          <header class="flex flex-none items-center gap-2 px-4 pb-2 pt-4">
            <WorkspaceIcon name="orbit" :size="20" class="flex-none" />
            <span class="text-[15px] font-semibold tracking-tight">Starverse</span>
            <button type="button" class="sv-icon-btn ml-auto" :aria-label="t('common.new')" :title="t('common.new')" :disabled="!isReady || isDraftInteractionLocked"
              data-testid="workspace-new-conversation" @click="onCreateConvo"><WorkspaceIcon name="edit" :size="16" /></button>
          </header>
          <div class="min-h-0 flex-1">
            <SearchModal
              :open="searchModalOpen"
              variant="sidebar"
              :projects="searchProjectOptions"
              :convos="searchConvoOptions"
              :activeProjectId="activeProjectId"
              :activeConvoId="activeConvoId"
              :disabled="!isReady || isDraftInteractionLocked"
              :selectHit="onSelectSearchHit"
              @close="closeSearchModal"
              @open-settings="openSearchSettings"
            />
        <ConversationList
          v-show="!searchModalOpen"
          :items="convoListItems"
          :activeId="activeConvoId"
          :activeProjectId="activeProjectId"
          :inboxId="inboxId"
          :projects="projectListItems"
          :mutationDisabled="isRunning"
          :disabled="!isReady || isDraftInteractionLocked"
          :hasMore="hasMoreConversations"
          :highlightedProjectIds="searchNameHighlight.projectIds"
          :highlightedConvoIds="searchNameHighlight.convoIds"
          @openSearch="openSearchModal"
          @selectProject="onSelectProject"
          @openProjectSettings="onOpenProjectWebSearchSettings"
          @createProject="onCreateProject"
          @renameProject="onRenameProject"
          @deleteProject="onDeleteProject"
          @select="onSelectConvo"
          @create="onCreateConvo"
          @refresh="onRefreshWorkspace"
          @loadMore="loadMoreConvos"
          @rename="onRenameConvo"
          @delete="onDeleteConvo"
          @moveToProject="onMoveConvoToProject"
          @bulkDelete="onBulkDeleteConvos"
          @bulkMoveToProject="onBulkMoveConvosToProject"
        />
          </div>
          <footer class="sv-workspace-footer relative flex-none p-2" @keydown.esc.stop="closeWorkspaceMenu">
            <div v-if="workspaceMenuOpen" class="sv-popover absolute inset-x-2 bottom-[calc(100%-2px)] z-30" data-testid="workspace-menu">
              <button type="button" class="sv-menu-item" :disabled="!settingsAllowed" data-testid="workspace-open-settings"
                @click="openWorkspaceSettings"><WorkspaceIcon name="sliders" :size="16" class="flex-none" />{{ t('common.settings') }}</button>
            </div>
            <button ref="workspaceMenuTrigger" type="button" class="flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-black/5 aria-expanded:bg-black/[0.08]" :aria-expanded="workspaceMenuOpen" data-testid="workspace-menu-trigger"
              @click="workspaceMenuOpen = !workspaceMenuOpen">
              <span class="grid size-6 flex-none place-items-center rounded-full bg-black/[0.08] text-xs font-medium">S</span>
              <span class="min-w-0 flex-1 truncate"><span>{{ t('navigation.workspace.local') }}</span><span class="sv-meta ml-1.5">Starverse</span></span>
              <WorkspaceIcon name="sliders" :size="15" class="flex-none text-gray-500" />
            </button>
          </footer>
        </div>
      </template>

      <template #topbar>
        <div v-if="activeDraftConflict" class="sv-notice sv-notice-warning mx-6 mt-3 flex-col gap-2" role="alert" data-testid="draft-conflict">
          <p>{{ t('errors.draftConflict.message') }}</p>
          <textarea readonly :value="activeDraftConflict.captured.text" class="sv-textarea w-full" :aria-label="t('errors.draftConflict.retainedText')" data-testid="draft-conflict-retained-text" />
          <div><button type="button" class="sv-btn sv-btn-sm" @click="onRefreshWorkspace">{{ t('errors.draftConflict.reload') }}</button></div>
          <div v-if="draftConflictReloadConfirmation" role="alertdialog" :aria-label="t('errors.draftConflict.reload')" class="sv-divider-t flex flex-col gap-2 pt-2" data-testid="draft-conflict-confirmation">
            <p>{{ t('errors.draftConflict.discardConfirm') }}</p>
            <div class="flex gap-2">
              <button type="button" class="sv-btn sv-btn-sm" @click="cancelDraftConflictReload">{{ t('common.cancel') }}</button>
              <button type="button" class="sv-btn sv-btn-sm sv-btn-danger" @click="confirmDraftConflictReload">{{ t('errors.draftConflict.discardAndReload') }}</button>
            </div>
          </div>
        </div>
        <WorkspaceStartupRecovery :state="startupState" :empty="isReady && workspaceMode === 'none'"
          @retry="retryStartup" @openSettings="openSettings" />
        <ChatTopSummaryBar
          v-if="isReady && workspaceMode !== 'none'"
          :title="activeTitle"
          :branchSummary="branchSummary"
          :runSummary="runSummary"
          :modelSummary="modelSummary"
          :webSummary="webSummary"
          :loadError="loadError"
          :normalizedErrorSummary="normalizedErrorSummary"
          :normalizedErrorActionHint="normalizedErrorActionHint"
          :consolePanelOpen="rightRailOpen && effectiveRightRailView === 'console'"
          @openSettings="openSettings"
          @toggleConsolePanel="toggleConsolePanel"
        />
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-6 pb-2 text-xs text-gray-600 empty:hidden">
        <div
          v-if="workspaceMode === 'conversation'"
          class="min-w-[16rem] flex-1"
          data-testid="branch-bar"
        >
          <div class="flex flex-wrap items-center gap-x-1 gap-y-1">
          <label v-if="branches.length > 1 || hasMoreBranches" class="flex min-w-0 flex-1 basis-44 items-center gap-2 text-xs text-gray-600">
            <span class="flex-none">{{ t('chat.topBar.branch') }}</span>
            <select
              :value="activeBranchId ?? ''"
              :disabled="!isReady"
              class="sv-select sv-select-sm min-w-0 max-w-[16rem] flex-1 border-[var(--sv-line-strong)]"
              data-testid="branch-selector"
              @change="onSelectBranch(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                {{ branch.name?.trim() || branch.id.slice(0, 8) }}
                {{ getBranchRuntimeStatus(branch.id) ? ` · ${getBranchRuntimeStatus(branch.id)}` : '' }}
              </option>
            </select>
          </label>
          <button
            v-if="hasMoreBranches"
            type="button"
            class="sv-btn sv-btn-sm sv-btn-ghost"
            :disabled="!isReady"
            data-testid="branch-load-more"
            @click="loadMoreBranches"
          >
            {{ t('chat.pagination.loadMore') }}
          </button>
          <span v-if="!(branches.length > 1 || hasMoreBranches)" class="min-w-0 flex-1 basis-44 truncate text-xs text-gray-600">{{ branchSummary }}</span>
          <button type="button" class="sv-btn sv-btn-sm sv-btn-ghost"
            :disabled="!canForkBranch" data-testid="branch-fork" @click="runBranchAction(onForkFromHead)"><WorkspaceIcon name="branch" :size="14" />{{ t('chat.branchActions.fork') }}</button>
          <button type="button" class="sv-btn sv-btn-sm sv-btn-ghost"
            :disabled="!isReady || !activeBranch || branchActionBusy" data-testid="branch-rename" @click="openBranchRename"><WorkspaceIcon name="edit" :size="14" />{{ t('chat.branchActions.rename') }}</button>
          <button type="button" class="sv-btn sv-btn-sm sv-btn-ghost"
            :disabled="!canDeleteBranch" :title="canDeleteBranch ? undefined : t('chat.branchActions.lastBranch')" data-testid="branch-delete"
            @click="branchRenameOpen = false; branchDeleteConfirmOpen = true"><WorkspaceIcon name="trash" :size="14" />{{ t('chat.branchActions.delete') }}</button>
          </div>
          <form v-if="branchRenameOpen" class="mt-2 flex items-center gap-2 text-xs" data-testid="branch-rename-form" @submit.prevent="submitBranchRename">
            <input v-model="branchRenameText" type="text" maxlength="4096" class="sv-input sv-input-sm min-w-0 flex-1"
              :aria-label="t('chat.branchActions.renameLabel')" :placeholder="t('chat.branchActions.renamePlaceholder')" data-testid="branch-rename-input" />
            <button type="submit" class="sv-btn sv-btn-sm sv-btn-primary" :disabled="branchActionBusy" data-testid="branch-rename-save">{{ t('chat.branchActions.save') }}</button>
            <button type="button" class="sv-btn sv-btn-sm" data-testid="branch-rename-cancel" @click="branchRenameOpen = false">{{ t('chat.branchActions.cancel') }}</button>
          </form>
          <div v-if="branchDeleteConfirmOpen" role="alertdialog" :aria-label="t('chat.branchActions.delete')" class="sv-notice sv-notice-danger mt-2 flex-wrap items-center" data-testid="branch-delete-confirmation">
            <p class="min-w-0 flex-1 basis-48">{{ t('chat.branchActions.deleteConfirm') }}</p>
            <div class="flex gap-2">
              <button type="button" class="sv-btn sv-btn-sm" data-testid="branch-delete-cancel" @click="branchDeleteConfirmOpen = false">{{ t('chat.branchActions.cancel') }}</button>
              <button type="button" class="sv-btn sv-btn-sm sv-btn-danger" data-testid="branch-delete-confirm" @click="confirmBranchDelete">{{ t('chat.branchActions.confirmDelete') }}</button>
            </div>
          </div>
        </div>
        <div
          v-if="isReady && workspaceMode !== 'none' && searchMessageNavLabel"
          class="flex flex-none items-center gap-1 text-xs"
          data-testid="search-match-nav"
        >
          <span class="w-[7ch] text-center tabular-nums" data-testid="search-match-nav-index">{{ searchMessageNavLabel }}</span>
          <button type="button" class="sv-icon-btn" :aria-label="t('search.matchNav.previous')" :title="t('search.matchNav.previous')" data-testid="search-match-nav-prev" @click="onNavigateSearchMessage(-1)"><WorkspaceIcon name="up" :size="15" /></button>
          <button type="button" class="sv-icon-btn" :aria-label="t('search.matchNav.next')" :title="t('search.matchNav.next')" data-testid="search-match-nav-next" @click="onNavigateSearchMessage(1)"><WorkspaceIcon name="down" :size="15" /></button>
        </div>
        </div>
        <div v-if="workspaceMode === 'template'" class="relative px-6 pb-2 pt-1">
          <button type="button" class="sv-btn sv-btn-sm sv-btn-ghost" :aria-expanded="templateResetOpen" data-testid="new-template-reset-open" @click="templateResetOpen = !templateResetOpen">
            <WorkspaceIcon name="refresh" :size="14" />{{ t('chat.newTemplate.reset') }}
          </button>
          <div v-if="templateResetOpen" class="sv-popover absolute left-6 top-9 z-30 flex w-64 flex-col gap-2 p-3 text-xs" data-testid="new-template-reset-panel">
            <label class="flex items-center gap-2"><input v-model="resetTemplateModelConfig" type="checkbox" />{{ t('chat.newTemplate.modelConfig') }}</label>
            <label class="flex items-center gap-2"><input v-model="resetTemplateDraftAttachments" type="checkbox" />{{ t('chat.newTemplate.draftAttachments') }}</label>
            <div class="flex justify-end gap-2">
              <button type="button" class="sv-btn sv-btn-sm" @click="templateResetOpen = false">{{ t('chat.newTemplate.cancel') }}</button>
              <button type="button" class="sv-btn sv-btn-sm sv-btn-primary" :disabled="!resetTemplateModelConfig && !resetTemplateDraftAttachments" data-testid="new-template-reset-confirm" @click="void onResetSystemTemplate({ resetModelConfig: resetTemplateModelConfig, resetDraftAttachments: resetTemplateDraftAttachments }).then(() => { templateResetOpen = false })">{{ t('chat.newTemplate.confirmReset') }}</button>
            </div>
          </div>
        </div>
      </template>

      <template #transcript>
        <div v-if="isReady && workspaceMode !== 'none' && transcriptMessageIds.length === 0" class="px-5 pt-6 text-center" data-testid="new-chat-welcome">
          <WorkspaceIcon name="orbit" :size="30" class="mx-auto mb-4" />
          <h1 class="text-[26px] font-medium tracking-tight">{{ t('chat.newTemplate.welcome') }}</h1>
          <p class="mt-2 text-[13px] text-gray-500">{{ t('chat.newTemplate.welcomeHint') }}</p>
        </div>
        <div
          v-if="isReady && workspaceMode !== 'none' && hasEarlierTranscript"
          class="flex justify-center border-b border-gray-100 bg-white px-3 py-2"
        >
          <button
            type="button"
            class="sv-btn sv-btn-sm"
            :disabled="!isReady"
            data-testid="transcript-load-earlier"
            @click="loadEarlierTranscript"
          >
            {{ t('chat.pagination.loadEarlier') }}
          </button>
        </div>
        <ChatTranscript
          v-if="isReady && workspaceMode !== 'none'"
          :messageIds="transcriptMessageIds"
          :messagesById="transcriptMessagesById"
          :activeMessageId="activeCursorMessageId"
          :error="runVM?.error"
          v-show="!(transcriptMessageIds.length === 0 && !runVM?.error)"
          emptyText="No messages in this conversation yet."
        >
          <template #message="{ message }">
            <div
              class="rounded-2xl"
              :class="[
                isTurnExcludedForMessage(message.messageId, message.role) ? 'opacity-45 grayscale' : '',
                historyIncompatibleAttachmentSummary.activeItem?.messageId === message.messageId ? 'ring-2 ring-amber-200 ring-offset-2 ring-offset-gray-50' : '',
              ]"
              :data-testid="`msg-wrap-${message.messageId}`"
              tabindex="-1"
              @click="onSelectCursor(message.messageId, $event)"
            >
              <ChatMessageBubble
                :message="message"
                :renderUserMessageRichText="userMessageRenderPolicy.effective"
                :errorView="toErrorPanelView(message as any)"
                :errorEnvelopeLoading="inFlightEnvelopeIds.has(message.messageId)"
                :errorEnvelopeUnavailable="errorEnvelopeUnavailableIds.has(message.messageId)"
                :onRequestErrorEnvelope="requestErrorEnvelope"
              >
                <template #before-content>
                  <ChatInlineReasoning
                    v-if="message.role === 'assistant' && shouldShowInlineReasoning(message)"
                    :messageId="message.messageId"
                    :reasoningView="message.reasoningView"
                    :collapsed="reasoningRailMode ? !(rightRailOpen && effectiveRightRailView === 'reasoning') : message.reasoningView.panelState === 'collapsed'"
                    :display-mode="reasoningRailMode ? 'rail' : 'inline'"
                    :isStreaming="message.streaming?.isTarget === true && message.streaming?.isComplete !== true"
                    @toggle="onOpenReasoningDisplayForMessage(message.messageId)"
                  />
                </template>
              </ChatMessageBubble>

              <ReasoningArtifactDiagnostics
                v-if="message.role === 'assistant' && getReasoningArtifactsForMessage(message.messageId).length > 0"
                :artifacts="getReasoningArtifactsForMessage(message.messageId)"
              />

              <div
                v-if="message.role === 'user' && (historyAttachmentViewModelsByMessageId[message.messageId]?.length ?? 0) > 0"
                class="mt-2 flex justify-end"
              >
                <MessageAttachmentList
                  :attachments="historyAttachmentViewModelsByMessageId[message.messageId] ?? []"
                />
              </div>

              <div v-if="message.role === 'user'" class="mt-1 flex flex-wrap items-center justify-end gap-x-1 gap-y-0.5 text-xs text-gray-500">
                <button
                  type="button"
                  class="sv-btn sv-btn-sm sv-btn-ghost"
                  :disabled="getUserMessageRawText(message as any).length === 0"
                  :data-testid="`copy-raw-q-${message.messageId}`"
                  @click="copyUserMessageRaw(message as any)"
                >
                  {{ t('chat.message.actions.copyRaw') }}
                </button>

                <button
                  type="button"
                  class="sv-btn sv-btn-sm sv-btn-ghost"
                  :data-testid="`toggle-q-${message.messageId}`"
                  @click="onToggleQuestionExclude(message.messageId)"
                >
                  {{ turnFiltersByQuestionId.get(message.messageId)?.questionMode === 'exclude' ? t('chat.message.actions.restoreQuestion') : t('chat.message.actions.excludeQuestion') }}
                </button>

                <button
                  type="button"
                  class="sv-btn sv-btn-sm sv-btn-ghost"
                  :disabled="activeAssistantMessageId != null || isAnswerGroupStreamingForQuestion(message.messageId)"
                  :data-testid="`regen-q-${message.messageId}`"
                  @click="onRegenerateFromQuestion(message.messageId)"
                >
                  {{ t('chat.message.actions.regenerate') }}
                </button>

                <button
                  type="button"
                  class="sv-btn sv-btn-sm sv-btn-ghost"
                  :disabled="activeAssistantMessageId != null || isAnswerGroupStreamingForQuestion(message.messageId)"
                  :data-testid="`edit-q-${message.messageId}`"
                  @click="openQuestionEdit(message.messageId)"
                >
                  {{ t('chat.message.actions.edit') }}
                </button>

                <template v-if="pendingDeleteQuestionId === message.messageId">
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm sv-btn-ghost text-[color:var(--sv-danger)]"
                    :disabled="activeAssistantMessageId != null || isAnswerGroupStreamingForQuestion(message.messageId)"
                    :data-testid="`confirm-delete-q-${message.messageId}`"
                    @click="confirmDeleteQuestion(message.messageId)"
                  >
                    {{ t('chat.message.actions.confirmDelete') }}
                  </button>
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm sv-btn-ghost"
                    @click="cancelDeleteQuestion"
                  >
                    {{ t('common.cancel') }}
                  </button>
                </template>
                <button
                  v-else
                  type="button"
                  class="sv-btn sv-btn-sm sv-btn-ghost text-[color:var(--sv-danger)]"
                  :disabled="activeAssistantMessageId != null || isAnswerGroupStreamingForQuestion(message.messageId)"
                  :data-testid="`delete-q-${message.messageId}`"
                  @click="requestDeleteQuestion(message.messageId)"
                >
                  {{ t('common.delete') }}
                </button>

                <div class="ml-auto flex items-center gap-3 text-gray-600">
                  <div v-if="(getQuestionPagerForQuestion(message.messageId)?.total ?? 0) > 1" class="flex items-center gap-1">
                    <button
                      type="button"
                      class="sv-btn sv-btn-sm sv-btn-ghost"
                      :disabled="
                        isMessageCandidateLoading(message.messageId) ||
                        !getQuestionPagerForQuestion(message.messageId)?.canPrev
                      "
                      :data-testid="`qvar-prev-${message.messageId}`"
                      @click="onMessageCandidateShift(message.messageId, -1)"
                    >
                      &lt;
                    </button>
                    <div :data-testid="`qvar-pos-${message.messageId}`" class="min-w-[56px] text-center">
                      {{
                        `${(getQuestionPagerForQuestion(message.messageId)?.index ?? 0) + 1}/${getQuestionPagerForQuestion(message.messageId)?.total ?? 1}`
                      }}
                    </div>
                    <button
                      type="button"
                      class="sv-btn sv-btn-sm sv-btn-ghost"
                      :disabled="
                        isMessageCandidateLoading(message.messageId) ||
                        !getQuestionPagerForQuestion(message.messageId)?.canNext
                      "
                      :data-testid="`qvar-next-${message.messageId}`"
                      @click="onMessageCandidateShift(message.messageId, 1)"
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-else-if="message.role === 'assistant' && isAnswerRootMessage(message.messageId)"
                class="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-gray-500"
              >
                <button
                  type="button"
                  class="sv-btn sv-btn-sm sv-btn-ghost"
                  :disabled="getAssistantVisibleText(message as any).length === 0"
                  :data-testid="`copy-assistant-text-${message.messageId}`"
                  @click="copyAssistantMessage(message as any, 'plain')"
                >
                  {{ t('chat.message.actions.copyText') }}
                </button>
                <button
                  type="button"
                  class="sv-btn sv-btn-sm sv-btn-ghost"
                  :data-testid="`raw-data-a-${message.messageId}`"
                  @click="openRawData(message.messageId)"
                >
                  Raw Data
                </button>
                <button
                  v-if="hasAssistantCitations(message as any)"
                  type="button"
                  class="sv-btn sv-btn-sm sv-btn-ghost"
                  :disabled="getAssistantVisibleText(message as any).length === 0"
                  :data-testid="`copy-assistant-with-refs-${message.messageId}`"
                  @click="copyAssistantMessage(message as any, 'with_refs')"
                >
                  {{ t('chat.message.actions.copyWithReferences') }}
                </button>
                <template v-if="chosenQuestionIdForAnswerRootMessage(message.messageId)">
                  <button
                    v-if="getAssistantImageBlockCount(message as any) > 0"
                    type="button"
                    class="sv-btn sv-btn-sm sv-btn-ghost"
                    :disabled="
                      activeAssistantMessageId != null ||
                      isAnswerGroupStreamingForQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!)
                    "
                    :data-testid="`regen-image-a-${message.messageId}`"
                    @click="onRegenerateFromQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!)"
                  >
                    {{ t('chat.message.actions.regenerateImage') }}
                  </button>
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm sv-btn-ghost"
                    :disabled="
                      turnFiltersByQuestionId.get(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.lockedByQuestionExclude === true
                    "
                    :data-testid="`toggle-a-${message.messageId}`"
                    @click="onToggleAnswerExclude(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)"
                  >
                    {{
                      turnFiltersByQuestionId.get(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.answerMode === 'exclude'
                        ? t('chat.message.actions.restoreAnswer')
                        : t('chat.message.actions.excludeAnswer')
                    }}
                  </button>
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm sv-btn-ghost"
                    :disabled="
                      activeAssistantMessageId != null ||
                      isAnswerGroupStreamingForQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!) ||
                      !canRetryReplaceInUi(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)
                    "
                    :data-testid="`retry-a-${message.messageId}`"
                    @click="onRetryReplaceAnswer(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)"
                  >
                    {{ t('chat.message.actions.retryReplace') }}
                  </button>
                  <button
                    type="button"
                    class="sv-btn sv-btn-sm sv-btn-ghost"
                    :disabled="
                      activeAssistantMessageId != null ||
                      isAnswerGroupStreamingForQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!) ||
                      !canRetryReplaceInUi(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)
                    "
                    :data-testid="`retry-new-a-${message.messageId}`"
                    @click="onRetryAnswerAsNew(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)"
                  >
                    {{ t('chat.message.actions.retryAsNew') }}
                  </button>
                  <div v-if="(getCandidatePager(message.messageId)?.total ?? 0) > 1" class="ml-auto flex items-center gap-1 text-gray-600">
                    <button
                      type="button"
                      class="sv-btn sv-btn-sm sv-btn-ghost"
                      :disabled="
                        isMessageCandidateLoading(message.messageId) ||
                        !getCandidatePager(message.messageId)?.canPrev
                      "
                      :data-testid="`cand-prev-${chosenQuestionIdForAnswerRootMessage(message.messageId)!}`"
                      @click="onMessageCandidateShift(message.messageId, -1)"
                    >
                      &lt;
                    </button>
                    <div :data-testid="`cand-pos-${chosenQuestionIdForAnswerRootMessage(message.messageId)!}`" class="min-w-[48px] text-center">
                      {{
                        `${(getCandidatePager(message.messageId)?.index ?? 0) + 1}/${getCandidatePager(message.messageId)?.total ?? 1}`
                      }}
                    </div>
                    <button
                      type="button"
                      class="sv-btn sv-btn-sm sv-btn-ghost"
                      :disabled="
                        isMessageCandidateLoading(message.messageId) ||
                        !getCandidatePager(message.messageId)?.canNext
                      "
                      :data-testid="`cand-next-${chosenQuestionIdForAnswerRootMessage(message.messageId)!}`"
                      @click="onMessageCandidateShift(message.messageId, 1)"
                    >
                      &gt;
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </ChatTranscript>
      </template>

      <template #composer>
        <div class="space-y-2">
          <div
            v-if="attachmentConfirmationHistoryLocatorVisible"
            class="mx-4 sv-notice sv-notice-warning"
            data-testid="attachment-confirm-locator-bar"
          >
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-locator-open-panel" @click="openAttachmentConfirmationPanel">{{ t('chat.attachmentConfirm.openPanel') }}</button>
              <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-locator-close" @click="closeAttachmentConfirmationLocatorBar">{{ t('chat.attachmentConfirm.closeLocator') }}</button>
              <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-locator-prev" @click="navigateAttachmentConfirmationHistory(-1)">{{ t('chat.attachmentConfirm.previous') }}</button>
              <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-locator-next" @click="navigateAttachmentConfirmationHistory(1)">{{ t('chat.attachmentConfirm.next') }}</button>
              <span class="font-mono text-xs" data-testid="attachment-confirm-locator-index">{{ attachmentConfirmationHistoryLocatorLabel }}</span>
            </div>
          </div>
          <div
            v-else-if="attachmentConfirmationCollapsedBannerVisible"
            class="mx-4 sv-notice sv-notice-warning"
            data-testid="attachment-confirm-collapsed-banner"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span>{{ t('chat.attachmentConfirm.pendingLocked') }}</span>
              <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-banner-open-panel" @click="openAttachmentConfirmationPanel">{{ t('chat.attachmentConfirm.openPanel') }}</button>
              <button type="button" class="sv-btn sv-btn-sm sv-btn-danger" data-testid="attachment-confirm-banner-cancel" @click="closeAttachmentConfirmationByCancel">{{ t('chat.attachmentConfirm.cancelSend') }}</button>
            </div>
          </div>
          <div v-if="attachmentConfirmationVisible && attachmentConfirmationSession" class="mx-4 rounded-xl border border-[color:var(--sv-warning-line)] bg-white p-3" data-testid="attachment-confirm-panel">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-semibold text-gray-900">{{ attachmentConfirmationSession.title }}</div>
              <div class="flex items-center gap-2">
                <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-collapse" @click="collapseAttachmentConfirmationPanel">{{ t('chat.attachmentConfirm.collapsePanel') }}</button>
                <button type="button" class="sv-btn sv-btn-sm sv-btn-danger" data-testid="attachment-confirm-cancel" @click="closeAttachmentConfirmationByCancel">{{ t('chat.attachmentConfirm.cancelSend') }}</button>
              </div>
            </div>
            <div v-if="attachmentConfirmationSession.validationMessage" class="mt-2 sv-notice sv-notice-danger" data-testid="attachment-confirm-validation">
              {{ attachmentConfirmationSession.validationMessage }}
            </div>
            <div v-if="attachmentConfirmationSession.historyItems.length > 0" class="mt-3 rounded-md border border-gray-200 p-2" data-testid="attachment-confirm-history-section">
              <button type="button" class="w-full text-left text-sm font-semibold text-gray-900" data-testid="attachment-confirm-history-toggle" @click="toggleAttachmentConfirmationHistorySection">{{ t('chat.attachmentConfirm.historyUnsupportedTitle') }}</button>
              <p class="mt-1 text-xs text-gray-600">{{ t('chat.attachmentConfirm.historyUnsupportedDesc') }}</p>
              <div v-if="attachmentConfirmationSession.historySectionExpanded" class="mt-2 space-y-2">
                <div class="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1" :class="attachmentConfirmationSession.showHistoryValidation ? 'ring-2 ring-red-300' : ''" data-testid="attachment-confirm-history-exclude-all">
                  <div class="flex items-center gap-3 text-xs text-gray-700">
                    <span class="font-medium text-gray-900">{{ t('chat.attachmentConfirm.allAttachments') }}</span>
                    <label class="flex items-center gap-1">
                      <input
                        type="checkbox"
                        :checked="attachmentConfirmationSession.historyAllExcluded"
                        data-testid="attachment-confirm-history-exclude-all-checkbox"
                        @change="setAttachmentConfirmationHistoryExcludeAll(($event.target as HTMLInputElement).checked)"
                      />
                      {{ t('chat.attachmentConfirm.excludeCheckbox') }}
                    </label>
                  </div>
                  <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-history-locate-all" @click="locateAttachmentConfirmationHistoryAll">{{ t('chat.attachmentConfirm.locate') }}</button>
                </div>
                <div v-for="item in attachmentConfirmationSession.historyItems" :key="item.attachmentId" class="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-2 py-1" :data-testid="`attachment-confirm-history-row-${item.attachmentId}`">
                  <div class="min-w-0">
                    <div class="truncate text-xs font-medium text-gray-900">{{ item.filename }}</div>
                    <div class="text-xs text-gray-500">{{ item.detailText }}</div>
                    <div class="text-xs text-red-700">{{ item.reasonText }}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <img v-if="item.previewDataUrl" :src="item.previewDataUrl" class="h-8 w-8 rounded-md border border-gray-200 object-cover" alt="" />
                    <button type="button" class="sv-btn sv-btn-sm" :data-testid="`attachment-confirm-history-locate-${item.attachmentId}`" @click="locateAttachmentConfirmationHistoryByAttachmentId(item.attachmentId)">{{ t('chat.attachmentConfirm.locate') }}</button>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="attachmentConfirmationSession.currentItems.length > 0" class="mt-3 rounded-md border border-gray-200 p-2" data-testid="attachment-confirm-current-section">
              <button type="button" class="w-full text-left text-sm font-semibold text-gray-900" data-testid="attachment-confirm-current-toggle" @click="toggleAttachmentConfirmationCurrentSection">{{ t('chat.attachmentConfirm.currentUnsupportedTitle') }}</button>
              <p class="mt-1 text-xs text-gray-600">{{ t('chat.attachmentConfirm.currentUnsupportedDesc') }}</p>
              <div v-if="attachmentConfirmationSession.currentSectionExpanded" class="mt-2 space-y-2">
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-current-exclude-all" @click="setAttachmentConfirmationCurrentDecisionForAll('exclude')">{{ t('chat.attachmentConfirm.excludeAll') }}</button>
                  <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-current-exclude-none" @click="setAttachmentConfirmationCurrentDecisionForAll(null)">{{ t('chat.attachmentConfirm.excludeNone') }}</button>
                  <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-current-remove-all" @click="setAttachmentConfirmationCurrentDecisionForAll('remove')">{{ t('chat.attachmentConfirm.removeAll') }}</button>
                  <button type="button" class="sv-btn sv-btn-sm" data-testid="attachment-confirm-current-remove-none" @click="setAttachmentConfirmationCurrentDecisionForAll(null)">{{ t('chat.attachmentConfirm.removeNone') }}</button>
                </div>
                <div v-for="item in attachmentConfirmationSession.currentItems" :key="item.attachmentId" class="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-2 py-1" :class="attachmentConfirmationSession.currentValidationAttachmentId === item.attachmentId ? 'ring-2 ring-red-300' : ''" :data-testid="`attachment-confirm-current-row-${item.attachmentId}`">
                  <div class="min-w-0">
                    <div class="truncate text-xs font-medium text-gray-900">{{ item.filename }}</div>
                    <div class="text-xs text-gray-500">{{ item.detailText }}</div>
                    <div class="text-xs text-red-700">{{ item.reasonText }}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <img v-if="item.previewDataUrl" :src="item.previewDataUrl" class="h-8 w-8 rounded-md border border-gray-200 object-cover" alt="" />
                    <label class="flex items-center gap-1 text-xs text-gray-700">
                      <input type="checkbox" :checked="attachmentConfirmationSession.currentDecisionsByAttachmentId[item.attachmentId] === 'exclude'" :data-testid="`attachment-confirm-current-exclude-${item.attachmentId}`" @change="setAttachmentConfirmationCurrentDecision(item.attachmentId, ($event.target as HTMLInputElement).checked ? 'exclude' : null)" />
                      {{ t('chat.attachmentConfirm.exclude') }}
                    </label>
                    <label class="flex items-center gap-1 text-xs text-gray-700">
                      <input type="checkbox" :checked="attachmentConfirmationSession.currentDecisionsByAttachmentId[item.attachmentId] === 'remove'" :data-testid="`attachment-confirm-current-remove-${item.attachmentId}`" @change="setAttachmentConfirmationCurrentDecision(item.attachmentId, ($event.target as HTMLInputElement).checked ? 'remove' : null)" />
                      {{ t('chat.attachmentConfirm.remove') }}
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div class="mt-3 flex justify-end">
              <button type="button" class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800" data-testid="attachment-confirm-confirm" @click="confirmAttachmentConfirmationSession">{{ t('chat.attachmentConfirm.confirmAndContinue') }}</button>
            </div>
          </div>
          <DraftAttachmentStrip
            :attachments="draftAttachmentViewModels"
            @openImageSettings="openImageSettings"
            @remove="handleRemoveDraftAttachment"
            @open-details="openDraftAttachmentDetails"
          />
          <div
            v-if="isQuestionEditMode && questionEditSession"
            class="mx-4 mt-2 rounded-xl border border-[color:var(--sv-line-strong)] bg-white p-3"
            data-testid="question-edit-controls"
          >
            <div class="text-sm font-semibold">{{ t('chat.message.editingQuestion') }}</div>
            <div class="mt-2 flex items-center justify-end gap-2">
              <button type="button" class="sv-btn" :disabled="isDraftInteractionLocked" @click="closeQuestionEdit">
                {{ t('common.cancel') }}
              </button>
              <button
                type="button"
                class="sv-btn"
                :disabled="isDraftInteractionLocked || isRunning || draft.trim().length === 0"
                data-testid="question-edit-new"
                @click="submitQuestionEdit()"
              >
                {{ t('chat.message.actions.newQuestion') }}
              </button>
            </div>
          </div>
          <ChatAppComposer
            v-if="workspaceMode !== 'none'"
            v-model:draft="draft"
            :disabled="!isReady || isDraftInteractionLocked"
            :isRunning="isRunning"
            :sessionConfig="activeSessionConfig"
            :modelCatalog="modelCatalogForPicker"
            :providerModelSources="providerModelPickerSources"
            :modelCatalogNotice="modelCatalogNotice"
            :modelPrefsScope="modelPrefsScopeForUi"
            :imageInputSupported="composerImageInputSupported"
            :imageInputDisabledReason="composerImageInputSupportReason"
            :attachmentFeedbackTone="attachmentFeedbackTone"
            :attachmentFeedbackMessage="attachmentFeedbackMessage"
            :canSend="composerCanSend"
            :sendButtonMode="sendButtonMode"
            :sendPlanStatus="composerSendPlanStatus"
            :sendPlanBlockingSummary="composerSendGateBlockedReason"
            :sendPlanWarningSummary="composerSendGateWarningReason"
            :isSendPlanLoading="composerSendPlanLoading"
            :historyIncompatibleSummary="historyIncompatibleAttachmentSummary"
            :generationParamsResolved="activeSessionGenerationParamsResolved"
            :capabilityProjection="activeSessionCapabilityProjection"
            :controlExplanations="activeSessionCapabilityExplanations"
            :googleAIStudioModelAvailability="googleAIStudioModelAvailabilityStatus"
            @updateReasoningEnabled="onUpdateReasoningEnabled"
            @updateReasoningEffort="onUpdateReasoningEffortLevel"
            @updateGenerationParamsLayer="onComposerUpdateGenerationParamsLayer"
            @updateWebSearchEnabled="onUpdateWebSearchEnabled"
            @updateWebSearchLevel="onUpdateWebSearchLevel"
            @updateImageGenerationEnabled="onUpdateImageGenerationEnabled"
            @updateImageGenerationResolution="onUpdateImageGenerationResolution"
            @updateImageGenerationAspectRatio="onUpdateImageGenerationAspectRatio"
            @send="onComposerSend"
            @abort="onAbort"
            @attachFilesRequested="onAttachFilesRequested"
            @attachImagesRequested="onAttachImagesRequested"
            @attachUrlRequested="onAttachUrlRequested"
            @drop="handleDropFiles"
            @paste="handlePasteAttachment"
            @reviewHistoryIncompatible="onReviewHistoryIncompatibleAttachments"
            @navigateHistoryIncompatiblePrev="onNavigateHistoryIncompatibleAttachments(-1)"
            @navigateHistoryIncompatibleNext="onNavigateHistoryIncompatibleAttachments(1)"
            @inspectModelFacts="openModelFactsInspector"
          />
        </div>
      </template>

      <template #right-rail="{ rightRailMode }">
        <ChatRightRail
          v-if="workspaceMode !== 'none'"
          :floating="rightRailMode === 'floating'"
          @close="closeRightRailPanel"
        >
          <ChatAppReasoningPanel
            v-if="effectiveRightRailView === 'reasoning'"
            :messageId="lastAssistantMessageId"
            :reasoningView="lastAssistantReasoningView"
            :reasoningVersion="lastAssistantReasoningVersion"
            :isStreaming="lastAssistantIsStreaming"
            :localProcessingDurationMs="lastAssistantMessage?.reasoningDurationMs ?? undefined"
          />
          <ChatSessionConsole
            v-else
            :disabled="!isReady || isDraftInteractionLocked"
            :isRunning="effectiveIsRunning"
            :sessionConfig="activeSessionConfig"
            :openRouterChat="openRouterChatConfig"
            :lmStudioChat="lmStudioChatConfig"
            :ollamaChat="ollamaChatConfig"
            :localEndpointChat="localEndpointChatConfig"
            :openAIResponsesChat="openAIResponsesChatConfig"
            :imageMaskOptions="imageMaskOptions"
            :googleAIStudioChat="googleAIStudioChatConfig"
            :anthropicChat="anthropicChatConfig"
            :deepSeekChat="deepSeekChatConfig"
            :openAIResponsesModelAvailability="openAIResponsesModelAvailabilityStatus"
            :googleAIStudioModelAvailability="googleAIStudioModelAvailabilityStatus"
            :anthropicModelAvailability="anthropicModelAvailabilityStatus"
            :deepSeekModelAvailability="deepSeekModelAvailabilityStatus"
            :reasoningDisplayMode="reasoningDisplayMode"
            :reasoningPanelDefaultExpanded="reasoningPanelDefaultExpanded"
            :reasoningPanelAutoCollapseAfterReasoning="reasoningPanelAutoCollapseAfterReasoning"
            :modelCatalog="modelCatalogForPicker"
            :webSearchResolved="activeSessionWebSearchResolved"
            :generationParamsResolved="activeSessionGenerationParamsResolved"
            :capabilityProjection="activeSessionCapabilityProjection"
            :controlExplanations="activeSessionCapabilityExplanations"
            :openRouterImageEndpointSelection="openRouterImageEndpointSelection"
            :openRouterImageEndpointSelectionLoading="openRouterImageEndpointSelectionLoading"
            :openRouterImageEndpointSelectionError="openRouterImageEndpointSelectionError"
            @updateRouteSelection="onUpdateRouteSelection"
            @updateReasoningEnabled="onUpdateReasoningEnabled"
            @updateReasoningEffort="onUpdateReasoningEffortLevel"
            @updateWebSearchEnabled="onUpdateWebSearchEnabled"
            @updateWebSearchLevel="onUpdateWebSearchLevel"
            @inspectModelFactsPath="openModelFactsInspectorPath"
            @updateWebSearchLayer="onComposerUpdateWebSearchLayer"
            @updateGenerationParamsLayer="onComposerUpdateGenerationParamsLayer"
            @updateImageGenerationEnabled="onUpdateImageGenerationEnabled"
            @updateImageGenerationResolution="onUpdateImageGenerationResolution"
            @updateImageGenerationAspectRatio="onUpdateImageGenerationAspectRatio"
            @updateImageGeneration="onUpdateImageGeneration"
            @refreshOpenRouterImageEndpoints="refreshOpenRouterImageEndpointSelection"
            @selectOpenRouterImageEndpoint="chooseOpenRouterImageEndpoint"
            @updateOpenRouterImageEndpointFreshness="updateOpenRouterImageEndpointFreshness"
            @updateOpenRouterChatEnabled="onUpdateOpenRouterChatEnabled"
            @updateLMStudioChatEnabled="onUpdateLMStudioChatEnabled"
            @updateLMStudioEndpointUrl="onUpdateLMStudioEndpointUrl"
            @updateLMStudioChatMode="onUpdateLMStudioChatMode"
            @updateLMStudioOpenAICompatiblePreferredEndpoint="onUpdateLMStudioOpenAICompatiblePreferredEndpoint"
            @updateLMStudioNativeRestControl="onUpdateLMStudioNativeRestControl"
            @clearLMStudioChat="onClearLMStudioChat"
            @updateOllamaChatEnabled="onUpdateOllamaChatEnabled"
            @updateOllamaEndpointUrl="onUpdateOllamaEndpointUrl"
            @updateOllamaChatMode="onUpdateOllamaChatMode"
            @updateOllamaNativeRestPreferredEndpoint="onUpdateOllamaNativeRestPreferredEndpoint"
            @updateOllamaOpenAICompatiblePreferredEndpoint="onUpdateOllamaOpenAICompatiblePreferredEndpoint"
            @updateOllamaProfileCapability="onUpdateOllamaProfileCapability"
            @updateOllamaNativeControl="onUpdateOllamaNativeControl"
            @clearOllamaChat="onClearOllamaChat"
            @updateLocalEndpointChatEnabled="onUpdateLocalEndpointChatEnabled"
            @updateLocalEndpointChatUrl="onUpdateLocalEndpointChatUrl"
            @clearLocalEndpointChat="onClearLocalEndpointChat"
            @updateOpenAIResponsesChatEnabled="onUpdateOpenAIResponsesChatEnabled"
            @clearOpenAIResponsesChat="onClearOpenAIResponsesChat"
            @refreshOpenAIResponsesModels="onRefreshOpenAIResponsesModels"
            @updateGoogleAIStudioChatEnabled="onUpdateGoogleAIStudioChatEnabled"
            @clearGoogleAIStudioChat="onClearGoogleAIStudioChat"
            @refreshGoogleAIStudioModels="onRefreshGoogleAIStudioModels"
            @updateAnthropicChatEnabled="onUpdateAnthropicChatEnabled"
            @updateAnthropicThinkingDisplay="onUpdateAnthropicThinkingDisplay"
            @clearAnthropicChat="onClearAnthropicChat"
            @refreshAnthropicModels="onRefreshAnthropicModels"
            @updateDeepSeekChatEnabled="onUpdateDeepSeekChatEnabled"
            @clearDeepSeekChat="onClearDeepSeekChat"
            @refreshDeepSeekModels="onRefreshDeepSeekModels"
            @updateReasoningDisplayMode="onUpdateReasoningDisplayMode"
            @updateReasoningPanelDefaultExpanded="onUpdateReasoningPanelDefaultExpanded"
            @updateReasoningPanelAutoCollapseAfterReasoning="onUpdateReasoningPanelAutoCollapseAfterReasoning"
            @openSettings="openSettings"
          />
        </ChatRightRail>
      </template>
    </ChatWorkspaceShell>

    <DraftAttachmentDetailsDialog
      :open="selectedDraftAttachmentDetails != null"
      :attachment="selectedDraftAttachmentDetails"
      @close="closeDraftAttachmentDetails"
      @remove="handleRemoveDraftAttachment"
      @update-send-mode="updateSelectedDraftAttachmentSendMode"
      @update-url-retention="updateSelectedDraftAttachmentUrlRetentionMode"
      @update-dfc-option="updateSelectedDraftAttachmentDfcOption"
      @save-dfc-default="saveSelectedDraftAttachmentDfcDefault"
      @clear-dfc-default="clearSelectedDraftAttachmentDfcDefault"
      @retry="retrySelectedDraftAttachmentPreview"
    />

    <div
      v-if="attachmentUrlDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      data-testid="attachment-url-dialog"
      @keydown.esc="closeAttachmentUrlDialog"
    >
      <div class="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
        <div class="text-sm font-semibold text-gray-900">{{ t('chat.attachmentUrl.addTitle') }}</div>
        <div class="mt-2 space-y-3">
          <input
            class="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="url"
            placeholder="https://example.com/file.pdf"
            :value="attachmentUrlDraft"
            @input="attachmentUrlDraft = ($event.target as HTMLInputElement).value"
          />
          <div class="flex flex-wrap items-center gap-3 text-xs text-gray-700">
            <label class="flex items-center gap-2">
              <input
                type="radio"
                value="default"
                :checked="attachmentUrlRetentionMode === 'default'"
                @change="attachmentUrlRetentionMode = 'default'"
              />
              {{ t('chat.attachmentUrl.followDefault') }}
            </label>
            <label class="flex items-center gap-2">
              <input
                type="radio"
                value="link_only"
                :checked="attachmentUrlRetentionMode === 'link_only'"
                @change="attachmentUrlRetentionMode = 'link_only'"
              />
              {{ t('chat.message.linkOnly') }}
            </label>
            <label class="flex items-center gap-2">
              <input
                type="radio"
                value="link_and_file"
                :checked="attachmentUrlRetentionMode === 'link_and_file'"
                @change="attachmentUrlRetentionMode = 'link_and_file'"
              />
              {{ t('chat.message.linkWithLocalCopy') }}
            </label>
          </div>
        </div>
        <div class="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            class="sv-btn"
            @click="closeAttachmentUrlDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            :disabled="attachmentUrlDraft.trim().length === 0"
            data-testid="attachment-url-confirm"
            @click="submitAttachmentUrl"
          >
            {{ t('chat.attachmentUrl.addUrl') }}
          </button>
        </div>
      </div>
    </div>

    <SettingsModal
      :open="settingsOpen"
      :disabled="!settingsAllowed"
      :isRunning="effectiveIsRunning"
      variant="categorized"
      @close="closeSettings"
    >
      <SettingsPanel
        :disabled="!settingsAllowed"
        :isRunning="effectiveIsRunning"
        :initialCategory="modelFactsInspectorSubject ? 'models-capabilities' : searchSettingsTarget ? 'general' : undefined"
        :focusSection="searchSettingsTarget ? 'search' : undefined"
        :inspectorSubject="modelFactsInspectorSubject"
        :inspectorPath="modelFactsInspectorPath"
      />
    </SettingsModal>

    <SettingsModal
      :open="projectWebSearchSettingsOpen"
      :disabled="!isReady"
      :isRunning="effectiveIsRunning"
      :title="projectWebSearchSettingsTarget ? tf('chat.projectWebSearch.titleWithTarget', { name: projectWebSearchSettingsTarget.name }) : t('chat.projectWebSearch.title')"
      @close="closeProjectWebSearchSettings"
    >
      <div class="space-y-3 p-4">
        <div class="rounded-md border border-gray-100 bg-gray-50/60 p-3">
          <GenerationParamsSettingsEditor
            v-model="projectGenerationParamsDraft"
            :disabled="!isReady || isRunning || projectWebSearchSettingsSaving || !projectWebSearchSettingsTarget"
            :resolved="projectGenerationParamsResolved"
            :defaultCollapsed="true"
          />
        </div>
        <WebSearchSettingsEditor
          v-model="projectWebSearchDraft"
          :disabled="!isReady || isRunning || projectWebSearchSettingsSaving || !projectWebSearchSettingsTarget"
          :resolved="projectWebSearchResolved"
          :inheritanceHint="projectWebSearchDraftHint"
        />
        <div
          v-if="projectWebSearchSettingsStatus"
          class="sv-notice"
          :class="projectWebSearchSettingsStatus === 'Saved.' ? '' : 'sv-notice-danger'"
          data-testid="project-web-search-status"
        >
          {{ projectWebSearchSettingsStatus }}
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="sv-btn"
            :disabled="projectWebSearchSettingsSaving"
            @click="closeProjectWebSearchSettings"
          >
            Close
          </button>
          <button
            type="button"
            class="sv-btn sv-btn-primary"
            :disabled="!isReady || isRunning || projectWebSearchSettingsSaving || !projectWebSearchSettingsTarget"
            data-testid="project-web-search-save"
            @click="saveProjectWebSearchSettings"
          >
            {{ projectWebSearchSettingsSaving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </SettingsModal>

    <div v-if="rawDataOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6" data-testid="raw-data-dialog">
      <div class="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
        <div class="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div class="font-semibold">Raw Data</div>
            <div class="text-xs text-gray-500">Answer {{ rawDataAnswerRootId }}</div>
          </div>
          <button type="button" class="rounded-md border px-3 py-1 text-sm" data-testid="raw-data-close" @click="closeRawData">Close</button>
        </div>
        <div class="min-h-0 flex-1 overflow-auto p-4">
          <div v-if="rawDataLoading" class="text-sm text-gray-500">Loading...</div>
          <div v-else-if="rawDataError" class="text-sm text-red-700">{{ rawDataError }}</div>
          <div v-else-if="rawDataRecords.length === 0 && rawProviderErrorRecords.length === 0" class="text-sm text-gray-500">No persisted raw data for this answer.</div>
          <div v-else class="space-y-4">
            <section v-for="record in rawDataRecords" :key="record.id" class="rounded-md border">
              <div class="border-b bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Request #{{ record.requestSequence }} · {{ record.providerId }} · {{ record.modelId }} · {{ record.bodyBytes }} bytes · SHA-256 {{ record.bodySha256 }}
              </div>
              <pre class="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all p-3 text-xs" :data-testid="`raw-data-request-${record.requestSequence}`">{{ formatRawRequestBody(record.serializedBody) }}</pre>
            </section>
            <section v-for="record in rawProviderErrorRecords" :key="record.id" class="rounded-md border border-[color:var(--sv-danger-line)]">
              <div class="border-b border-[color:var(--sv-danger-line)] px-3 py-2 text-xs text-[color:var(--sv-danger)]">
                Provider Error #{{ record.requestSequence }} · {{ record.phase }} · HTTP {{ record.httpStatus }} · {{ record.providerId }} · {{ record.modelId }} · {{ record.payloadBytes }} bytes · SHA-256 {{ record.payloadSha256 }}
                <span v-if="record.providerRequestId"> · Request {{ record.providerRequestId }}</span>
              </div>
              <pre class="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all p-3 text-xs" :data-testid="`raw-data-provider-error-${record.requestSequence}`">{{ formatRawProviderError(record) }}</pre>
            </section>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

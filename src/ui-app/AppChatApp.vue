<script setup lang="ts">
import { computed } from 'vue'
import ChatTranscript from '@/ui-kit/chat/ChatTranscript.vue'
import ChatMessageBubble from '@/ui-kit/chat/ChatMessageBubble.vue'
import ChatAppReasoningPanel from './components/ChatAppReasoningPanel.vue'
import ChatWorkspaceShell from './components/ChatWorkspaceShell.vue'
import ChatTopSummaryBar from './components/ChatTopSummaryBar.vue'
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
import SamplingParamsSettingsEditor from './components/SamplingParamsSettingsEditor.vue'
import SearchModal from './components/SearchModal.vue'
import { useAppChatAppLogic } from './app/appChatApp.logic'

const {
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
  runVM,
  isRunning,
  activeTitle,
  activeBranch,
  reasoningDisplayMode,
  reasoningRailMode,
  rightRailOpen,
  rightRailCanShowReasoning,
  toggleRightRailOpen,
  effectiveRightRailView,
  setRightRailView,
  normalizedErrorSummary,
  normalizedErrorActionHint,
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
  modelCatalogForPicker,
  activeSessionSamplingParamsResolved,
  activeSessionWebSearchResolved,
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
  onToggleReasoningPanelState,
  onOpenReasoningDisplayForMessage,
} = useAppChatAppLogic()

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

const modelSummary = computed(() => {
  const selected = activeSessionConfig.value.model.selectedModelKey ?? 'openrouter/auto'
  const match = modelCatalogForPicker.value.find((item) => item.modelId === selected)
  return `Model · ${match?.name ?? selected}`
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
  if (typeof view.summaryText === 'string' && view.summaryText.trim().length > 0) return true
  if (typeof view.reasoningText === 'string' && view.reasoningText.trim().length > 0) return true
  return false
}
</script>

<template>
  <div class="flex h-full min-h-0 w-full overflow-hidden">
    <SearchModal
      :open="searchModalOpen"
      :projects="searchProjectOptions"
      :convos="searchConvoOptions"
      :activeProjectId="activeProjectId"
      :activeConvoId="activeConvoId"
      :disabled="!isReady || isRunning || isDraftInteractionLocked"
      @close="closeSearchModal"
      @select="onSelectSearchHit"
    />

    <ChatWorkspaceShell :rightRailOpen="rightRailOpen">
      <template #sidebar>
        <ConversationList
          :items="convoListItems"
          :activeId="activeConvoId"
          :activeProjectId="activeProjectId"
          :inboxId="inboxId"
          :projects="projectListItems"
          :disabled="!isReady || isRunning || isDraftInteractionLocked"
          @openSearch="openSearchModal"
          @selectProject="onSelectProject"
          @openProjectSettings="onOpenProjectWebSearchSettings"
          @createProject="onCreateProject"
          @renameProject="onRenameProject"
          @deleteProject="onDeleteProject"
          @select="onSelectConvo"
          @create="onCreateConvo"
          @refresh="refreshConvos"
          @rename="onRenameConvo"
          @delete="onDeleteConvo"
          @moveToProject="onMoveConvoToProject"
          @bulkDelete="onBulkDeleteConvos"
          @bulkMoveToProject="onBulkMoveConvosToProject"
        />
      </template>

      <template #topbar>
        <ChatTopSummaryBar
          :title="activeTitle || 'No active conversation'"
          :branchSummary="branchSummary"
          :runSummary="runSummary"
          :modelSummary="modelSummary"
          :webSummary="webSummary"
          :loadError="loadError"
          :normalizedErrorSummary="normalizedErrorSummary"
          :normalizedErrorActionHint="normalizedErrorActionHint"
          :rightRailOpen="rightRailOpen"
          @openSettings="openSettings"
          @toggleRightRail="toggleRightRailOpen"
        />
      </template>

      <template #transcript>
        <ChatTranscript
          :messageIds="transcriptMessageIds"
          :messagesById="transcriptMessagesById"
          :activeMessageId="activeCursorMessageId"
          :error="runVM?.error"
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
              @click="onSelectCursor(message.messageId, $event)"
            >
              <ChatInlineReasoning
                v-if="message.role === 'assistant' && shouldShowInlineReasoning(message)"
                :reasoningView="message.reasoningView"
                :reasoningPieces="message.messageId === lastAssistantMessageId ? lastAssistantReasoningPieces : null"
                :collapsed="reasoningRailMode || message.reasoningView.panelState === 'collapsed'"
                @toggle="onOpenReasoningDisplayForMessage(message.messageId)"
              />

              <ChatMessageBubble
                :message="message"
                :renderUserMessageRichText="userMessageRenderPolicy.effective"
                :errorView="toErrorPanelView(message as any)"
                :errorEnvelopeLoading="inFlightEnvelopeIds.has(message.messageId)"
                :errorEnvelopeUnavailable="errorEnvelopeUnavailableIds.has(message.messageId)"
                :onRequestErrorEnvelope="requestErrorEnvelope"
              />

              <div
                v-if="message.role === 'user' && (historyAttachmentViewModelsByMessageId[message.messageId]?.length ?? 0) > 0"
                class="mt-2 flex justify-end"
              >
                <MessageAttachmentList
                  :attachments="historyAttachmentViewModelsByMessageId[message.messageId] ?? []"
                />
              </div>

              <div v-if="message.role === 'user'" class="mt-2 flex items-center gap-2 pl-11 text-[11px] text-gray-500">
                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                  :disabled="getUserMessageRawText(message as any).length === 0"
                  :data-testid="`copy-raw-q-${message.messageId}`"
                  @click="copyUserMessageRaw(message as any)"
                >
                  Copy raw
                </button>

                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                  :data-testid="`toggle-q-${message.messageId}`"
                  @click="onToggleQuestionExclude(message.messageId)"
                >
                  {{ turnFiltersByQuestionId.get(message.messageId)?.questionMode === 'exclude' ? 'Restore question' : 'Exclude question' }}
                </button>

                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="activeAssistantMessageId != null || isAnswerGroupStreamingForQuestion(message.messageId)"
                  :data-testid="`regen-q-${message.messageId}`"
                  @click="onRegenerateFromQuestion(message.messageId)"
                >
                  Regenerate
                </button>

                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="activeAssistantMessageId != null || isAnswerGroupStreamingForQuestion(message.messageId)"
                  :data-testid="`edit-q-${message.messageId}`"
                  @click="openQuestionEdit(message.messageId)"
                >
                  Edit
                </button>

                <template v-if="pendingDeleteQuestionId === message.messageId">
                  <button
                    type="button"
                    class="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100 disabled:opacity-50"
                    :disabled="activeAssistantMessageId != null || isAnswerGroupStreamingForQuestion(message.messageId)"
                    :data-testid="`confirm-delete-q-${message.messageId}`"
                    @click="confirmDeleteQuestion(message.messageId)"
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                    @click="cancelDeleteQuestion"
                  >
                    Cancel
                  </button>
                </template>
                <button
                  v-else
                  type="button"
                  class="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100 disabled:opacity-50"
                  :disabled="activeAssistantMessageId != null || isAnswerGroupStreamingForQuestion(message.messageId)"
                  :data-testid="`delete-q-${message.messageId}`"
                  @click="requestDeleteQuestion(message.messageId)"
                >
                  Delete
                </button>

                <div class="ml-auto flex items-center gap-3 text-gray-600">
                  <div v-if="(getQuestionPagerForQuestion(message.messageId)?.total ?? 0) > 1" class="flex items-center gap-1">
                    <button
                      type="button"
                      class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      :disabled="
                        activeAssistantMessageId != null ||
                        isQuestionSlotLoadingForQuestion(message.messageId) ||
                        !getQuestionPagerForQuestion(message.messageId)?.canPrev ||
                        isAnswerGroupStreamingForQuestion(message.messageId)
                      "
                      :data-testid="`qvar-prev-${message.messageId}`"
                      @click="onQuestionCandidateShift(message.messageId, -1)"
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
                      class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      :disabled="
                        activeAssistantMessageId != null ||
                        isQuestionSlotLoadingForQuestion(message.messageId) ||
                        !getQuestionPagerForQuestion(message.messageId)?.canNext ||
                        isAnswerGroupStreamingForQuestion(message.messageId)
                      "
                      :data-testid="`qvar-next-${message.messageId}`"
                      @click="onQuestionCandidateShift(message.messageId, 1)"
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-else-if="message.role === 'assistant' && isAnswerRootMessage(message.messageId)"
                class="mt-2 flex items-center gap-2 pl-11 text-[11px] text-gray-500"
              >
                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                  :disabled="getAssistantVisibleText(message as any).length === 0"
                  :data-testid="`copy-assistant-text-${message.messageId}`"
                  @click="copyAssistantMessage(message as any, 'plain')"
                >
                  Copy text
                </button>
                <button
                  v-if="hasAssistantCitations(message as any)"
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                  :disabled="getAssistantVisibleText(message as any).length === 0"
                  :data-testid="`copy-assistant-with-refs-${message.messageId}`"
                  @click="copyAssistantMessage(message as any, 'with_refs')"
                >
                  Copy + refs
                </button>
                <template v-if="chosenQuestionIdForAnswerRootMessage(message.messageId)">
                  <button
                    v-if="getAssistantImageBlockCount(message as any) > 0"
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="
                      activeAssistantMessageId != null ||
                      isAnswerGroupStreamingForQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!)
                    "
                    :data-testid="`regen-image-a-${message.messageId}`"
                    @click="onRegenerateFromQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!)"
                  >
                    Regenerate image
                  </button>
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="
                      turnFiltersByQuestionId.get(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.lockedByQuestionExclude === true
                    "
                    :data-testid="`toggle-a-${message.messageId}`"
                    @click="onToggleAnswerExclude(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)"
                  >
                    {{
                      turnFiltersByQuestionId.get(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.answerMode === 'exclude'
                        ? 'Restore answer'
                        : 'Exclude answer'
                    }}
                  </button>
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="
                      activeAssistantMessageId != null ||
                      isAnswerGroupStreamingForQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!) ||
                      !canRetryReplaceInUi(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)
                    "
                    :data-testid="`retry-a-${message.messageId}`"
                    @click="onRetryReplaceAnswer(chosenQuestionIdForAnswerRootMessage(message.messageId)!, message.messageId)"
                  >
                    Retry replace
                  </button>

                  <div v-if="(getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.total ?? 0) > 1" class="ml-auto flex items-center gap-1 text-gray-600">
                    <button
                      type="button"
                      class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      :disabled="
                        activeAssistantMessageId != null ||
                        candidatesLoading.has(chosenQuestionIdForAnswerRootMessage(message.messageId)!) ||
                        !getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.canPrev ||
                        isAnswerGroupStreamingForQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!)
                      "
                      :data-testid="`cand-prev-${chosenQuestionIdForAnswerRootMessage(message.messageId)!}`"
                      @click="onCandidateShift(chosenQuestionIdForAnswerRootMessage(message.messageId)!, -1)"
                    >
                      &lt;
                    </button>
                    <div :data-testid="`cand-pos-${chosenQuestionIdForAnswerRootMessage(message.messageId)!}`" class="min-w-[48px] text-center">
                      {{
                        `${(getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.index ?? 0) + 1}/${getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.total ?? 1}`
                      }}
                    </div>
                    <button
                      type="button"
                      class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      :disabled="
                        activeAssistantMessageId != null ||
                        candidatesLoading.has(chosenQuestionIdForAnswerRootMessage(message.messageId)!) ||
                        !getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.canNext ||
                        isAnswerGroupStreamingForQuestion(chosenQuestionIdForAnswerRootMessage(message.messageId)!)
                      "
                      :data-testid="`cand-next-${chosenQuestionIdForAnswerRootMessage(message.messageId)!}`"
                      @click="onCandidateShift(chosenQuestionIdForAnswerRootMessage(message.messageId)!, 1)"
                    >
                      &gt;
                    </button>
                  </div>
                </template>
                <div v-else-if="questionIdForMessage(message.messageId, message.role)" class="text-[11px] text-gray-400">
                  answer not selected for context
                </div>
              </div>
            </div>
          </template>
        </ChatTranscript>
      </template>

      <template #composer>
        <div class="space-y-2">
          <div
            v-if="attachmentConfirmationHistoryLocatorVisible"
            class="mx-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            data-testid="attachment-confirm-locator-bar"
          >
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] hover:bg-amber-100" data-testid="attachment-confirm-locator-open-panel" @click="openAttachmentConfirmationPanel">打开面板</button>
              <button type="button" class="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] hover:bg-amber-100" data-testid="attachment-confirm-locator-close" @click="closeAttachmentConfirmationLocatorBar">关闭定位条</button>
              <button type="button" class="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] hover:bg-amber-100" data-testid="attachment-confirm-locator-prev" @click="navigateAttachmentConfirmationHistory(-1)">上一个</button>
              <button type="button" class="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] hover:bg-amber-100" data-testid="attachment-confirm-locator-next" @click="navigateAttachmentConfirmationHistory(1)">下一个</button>
              <span class="font-mono text-[11px]" data-testid="attachment-confirm-locator-index">{{ attachmentConfirmationHistoryLocatorLabel }}</span>
            </div>
          </div>
          <div
            v-else-if="attachmentConfirmationCollapsedBannerVisible"
            class="mx-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            data-testid="attachment-confirm-collapsed-banner"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span>附件确认待处理，草稿已锁定。</span>
              <button type="button" class="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] hover:bg-amber-100" data-testid="attachment-confirm-banner-open-panel" @click="openAttachmentConfirmationPanel">打开面板</button>
              <button type="button" class="rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50" data-testid="attachment-confirm-banner-cancel" @click="closeAttachmentConfirmationByCancel">取消发送</button>
            </div>
          </div>
          <div v-if="attachmentConfirmationVisible && attachmentConfirmationSession" class="mx-4 rounded-xl border border-amber-300 bg-white p-3 shadow-sm" data-testid="attachment-confirm-panel">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-semibold text-gray-900">{{ attachmentConfirmationSession.title }}</div>
              <div class="flex items-center gap-2">
                <button type="button" class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50" data-testid="attachment-confirm-collapse" @click="collapseAttachmentConfirmationPanel">收起面板</button>
                <button type="button" class="rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50" data-testid="attachment-confirm-cancel" @click="closeAttachmentConfirmationByCancel">取消发送</button>
              </div>
            </div>
            <div v-if="attachmentConfirmationSession.validationMessage" class="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" data-testid="attachment-confirm-validation">
              {{ attachmentConfirmationSession.validationMessage }}
            </div>
            <div v-if="attachmentConfirmationSession.historyItems.length > 0" class="mt-3 rounded border border-gray-200 p-2" data-testid="attachment-confirm-history-section">
              <button type="button" class="w-full text-left text-sm font-semibold text-gray-900" data-testid="attachment-confirm-history-toggle" @click="toggleAttachmentConfirmationHistorySection">不受支持的历史消息附件</button>
              <p class="mt-1 text-xs text-gray-600">这些附件仍会显示在历史消息中，但无法纳入本次发送给模型的上下文。继续发送前，你必须确认将该类目下全部附件从本次模型上下文中排除。</p>
              <div v-if="attachmentConfirmationSession.historySectionExpanded" class="mt-2 space-y-2">
                <div class="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1" :class="attachmentConfirmationSession.showHistoryValidation ? 'ring-2 ring-red-300' : ''" data-testid="attachment-confirm-history-exclude-all">
                  <div class="flex items-center gap-3 text-xs text-gray-700">
                    <span class="font-medium text-gray-900">所有附件</span>
                    <label class="flex items-center gap-1">
                      <input
                        type="checkbox"
                        :checked="attachmentConfirmationSession.historyAllExcluded"
                        data-testid="attachment-confirm-history-exclude-all-checkbox"
                        @change="setAttachmentConfirmationHistoryExcludeAll(($event.target as HTMLInputElement).checked)"
                      />
                      exclude 勾选项
                    </label>
                  </div>
                  <button type="button" class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50" data-testid="attachment-confirm-history-locate-all" @click="locateAttachmentConfirmationHistoryAll">定位</button>
                </div>
                <div v-for="item in attachmentConfirmationSession.historyItems" :key="item.attachmentId" class="flex items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1" :data-testid="`attachment-confirm-history-row-${item.attachmentId}`">
                  <div class="min-w-0">
                    <div class="truncate text-xs font-medium text-gray-900">{{ item.filename }}</div>
                    <div class="text-[11px] text-gray-500">{{ item.detailText }}</div>
                    <div class="text-[11px] text-red-700">{{ item.reasonText }}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <img v-if="item.previewDataUrl" :src="item.previewDataUrl" class="h-8 w-8 rounded border border-gray-200 object-cover" alt="" />
                    <button type="button" class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50" :data-testid="`attachment-confirm-history-locate-${item.attachmentId}`" @click="locateAttachmentConfirmationHistoryByAttachmentId(item.attachmentId)">定位</button>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="attachmentConfirmationSession.currentItems.length > 0" class="mt-3 rounded border border-gray-200 p-2" data-testid="attachment-confirm-current-section">
              <button type="button" class="w-full text-left text-sm font-semibold text-gray-900" data-testid="attachment-confirm-current-toggle" @click="toggleAttachmentConfirmationCurrentSection">当前不受支持的用户消息附件</button>
              <p class="mt-1 text-xs text-gray-600">这些附件属于当前将要发送的用户消息，但当前模型或发送规则无法纳入它们。你必须选择排除它们，或从当前草稿中移除它们。</p>
              <div v-if="attachmentConfirmationSession.currentSectionExpanded" class="mt-2 space-y-2">
                <div class="flex flex-wrap items-center gap-2 text-[11px]">
                  <button type="button" class="rounded border border-gray-200 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50" data-testid="attachment-confirm-current-exclude-all" @click="setAttachmentConfirmationCurrentDecisionForAll('exclude')">exclude 全选</button>
                  <button type="button" class="rounded border border-gray-200 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50" data-testid="attachment-confirm-current-exclude-none" @click="setAttachmentConfirmationCurrentDecisionForAll(null)">exclude 全不选</button>
                  <button type="button" class="rounded border border-gray-200 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50" data-testid="attachment-confirm-current-remove-all" @click="setAttachmentConfirmationCurrentDecisionForAll('remove')">delete/remove 全选</button>
                  <button type="button" class="rounded border border-gray-200 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50" data-testid="attachment-confirm-current-remove-none" @click="setAttachmentConfirmationCurrentDecisionForAll(null)">delete/remove 全不选</button>
                </div>
                <div v-for="item in attachmentConfirmationSession.currentItems" :key="item.attachmentId" class="flex items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1" :class="attachmentConfirmationSession.currentValidationAttachmentId === item.attachmentId ? 'ring-2 ring-red-300' : ''" :data-testid="`attachment-confirm-current-row-${item.attachmentId}`">
                  <div class="min-w-0">
                    <div class="truncate text-xs font-medium text-gray-900">{{ item.filename }}</div>
                    <div class="text-[11px] text-gray-500">{{ item.detailText }}</div>
                    <div class="text-[11px] text-red-700">{{ item.reasonText }}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <img v-if="item.previewDataUrl" :src="item.previewDataUrl" class="h-8 w-8 rounded border border-gray-200 object-cover" alt="" />
                    <label class="flex items-center gap-1 text-[11px] text-gray-700">
                      <input type="checkbox" :checked="attachmentConfirmationSession.currentDecisionsByAttachmentId[item.attachmentId] === 'exclude'" :data-testid="`attachment-confirm-current-exclude-${item.attachmentId}`" @change="setAttachmentConfirmationCurrentDecision(item.attachmentId, ($event.target as HTMLInputElement).checked ? 'exclude' : null)" />
                      exclude
                    </label>
                    <label class="flex items-center gap-1 text-[11px] text-gray-700">
                      <input type="checkbox" :checked="attachmentConfirmationSession.currentDecisionsByAttachmentId[item.attachmentId] === 'remove'" :data-testid="`attachment-confirm-current-remove-${item.attachmentId}`" @change="setAttachmentConfirmationCurrentDecision(item.attachmentId, ($event.target as HTMLInputElement).checked ? 'remove' : null)" />
                      remove
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div class="mt-3 flex justify-end">
              <button type="button" class="rounded bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800" data-testid="attachment-confirm-confirm" @click="confirmAttachmentConfirmationSession">确认并继续</button>
            </div>
          </div>
          <DraftAttachmentStrip
            :attachments="draftAttachmentViewModels"
            @remove="handleRemoveDraftAttachment"
            @open-details="openDraftAttachmentDetails"
          />
          <div
            v-if="isQuestionEditMode && questionEditSession"
            class="mx-4 mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3"
            data-testid="question-edit-controls"
          >
            <div class="text-sm font-semibold text-blue-900">Editing question</div>
            <div class="mt-2 flex items-center justify-end gap-2">
              <button type="button" class="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50" :disabled="isDraftInteractionLocked" @click="closeQuestionEdit">
                Cancel
              </button>
              <button
                type="button"
                class="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                :disabled="isDraftInteractionLocked || isRunning || draft.trim().length === 0"
                data-testid="question-edit-new"
                @click="submitQuestionEdit('new')"
              >
                New question
              </button>
              <button
                type="button"
                class="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                :disabled="isDraftInteractionLocked || isRunning || draft.trim().length === 0 || !canReplaceQuestionInUi(questionEditSession.questionId)"
                data-testid="question-edit-replace"
                @click="submitQuestionEdit('replace')"
              >
                Replace question
              </button>
            </div>
          </div>
          <ChatAppComposer
            v-model:draft="draft"
            :disabled="!isReady || isDraftInteractionLocked"
            :isRunning="isRunning"
            :sessionConfig="activeSessionConfig"
            :modelCatalog="modelCatalogForPicker"
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
            @updateModel="onUpdateModel"
            @updateReasoningEnabled="onUpdateReasoningEnabled"
            @updateReasoningEffort="onUpdateReasoningEffortLevel"
            @updateWebSearchEnabled="onUpdateWebSearchEnabled"
            @updateWebSearchLevel="onUpdateWebSearchLevel"
            @updateImageGenerationEnabled="onUpdateImageGenerationEnabled"
            @updateImageGenerationResolution="onUpdateImageGenerationResolution"
            @updateImageGenerationAspectRatio="onUpdateImageGenerationAspectRatio"
            @send="onSend"
            @abort="onAbort"
            @attachFilesRequested="onAttachFilesRequested"
            @attachImagesRequested="onAttachImagesRequested"
            @attachUrlRequested="onAttachUrlRequested"
            @drop="handleDropFiles"
            @paste="handlePasteAttachment"
            @reviewHistoryIncompatible="onReviewHistoryIncompatibleAttachments"
            @navigateHistoryIncompatiblePrev="onNavigateHistoryIncompatibleAttachments(-1)"
            @navigateHistoryIncompatibleNext="onNavigateHistoryIncompatibleAttachments(1)"
          />
        </div>
      </template>

      <template #right-rail>
        <ChatRightRail
          :open="rightRailOpen"
          :activeView="effectiveRightRailView"
          :canShowReasoning="rightRailCanShowReasoning"
          @toggleOpen="toggleRightRailOpen"
          @setView="setRightRailView"
        >
          <ChatAppReasoningPanel
            v-if="effectiveRightRailView === 'reasoning'"
            :messageId="lastAssistantMessageId"
            :reasoningView="lastAssistantReasoningView"
            :reasoningVersion="lastAssistantReasoningVersion"
            :panelState="lastAssistantPanelState"
            :isStreaming="lastAssistantIsStreaming"
            :reasoningPieces="lastAssistantReasoningPieces"
            :localProcessingDurationMs="lastAssistantMessage?.reasoningDurationMs ?? undefined"
            @toggle-panel-state="onToggleReasoningPanelState"
          />
          <ChatSessionConsole
            v-else
            :disabled="!isReady || isDraftInteractionLocked"
            :isRunning="isRunning"
            :sessionConfig="activeSessionConfig"
            :reasoningDisplayMode="reasoningDisplayMode"
            :modelCatalog="modelCatalogForPicker"
            :webSearchResolved="activeSessionWebSearchResolved"
            :samplingParamsResolved="activeSessionSamplingParamsResolved"
            @updateModel="onUpdateModel"
            @updateReasoningEnabled="onUpdateReasoningEnabled"
            @updateReasoningEffort="onUpdateReasoningEffortLevel"
            @updateWebSearchEnabled="onUpdateWebSearchEnabled"
            @updateWebSearchLevel="onUpdateWebSearchLevel"
            @updateWebSearchLayer="onComposerUpdateWebSearchLayer"
            @updateSamplingParamsLayer="onComposerUpdateSamplingParamsLayer"
            @updateImageGenerationEnabled="onUpdateImageGenerationEnabled"
            @updateImageGenerationResolution="onUpdateImageGenerationResolution"
            @updateImageGenerationAspectRatio="onUpdateImageGenerationAspectRatio"
            @updateImageGeneration="onUpdateImageGeneration"
            @updateReasoningDisplayMode="onUpdateReasoningDisplayMode"
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
      @retry="retrySelectedDraftAttachmentPreview"
    />

    <div
      v-if="attachmentUrlDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      data-testid="attachment-url-dialog"
      @keydown.esc="closeAttachmentUrlDialog"
    >
      <div class="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
        <div class="text-sm font-semibold text-gray-900">Add URL attachment</div>
        <div class="mt-2 space-y-3">
          <input
            class="w-full rounded border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              Follow default
            </label>
            <label class="flex items-center gap-2">
              <input
                type="radio"
                value="link_only"
                :checked="attachmentUrlRetentionMode === 'link_only'"
                @change="attachmentUrlRetentionMode = 'link_only'"
              />
              Link only
            </label>
            <label class="flex items-center gap-2">
              <input
                type="radio"
                value="link_and_file"
                :checked="attachmentUrlRetentionMode === 'link_and_file'"
                @change="attachmentUrlRetentionMode = 'link_and_file'"
              />
              Link + local copy
            </label>
          </div>
        </div>
        <div class="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            class="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            @click="closeAttachmentUrlDialog"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            :disabled="attachmentUrlDraft.trim().length === 0"
            data-testid="attachment-url-confirm"
            @click="submitAttachmentUrl"
          >
            Add URL
          </button>
        </div>
      </div>
    </div>

    <SettingsModal :open="settingsOpen" :disabled="!isReady" :isRunning="isRunning" @close="closeSettings">
      <SettingsPanel :disabled="!isReady" :isRunning="isRunning" />
    </SettingsModal>

    <SettingsModal
      :open="projectWebSearchSettingsOpen"
      :disabled="!isReady"
      :isRunning="isRunning"
      :title="`Project Web Search${projectWebSearchSettingsTarget ? `: ${projectWebSearchSettingsTarget.name}` : ''}`"
      @close="closeProjectWebSearchSettings"
    >
      <div class="space-y-3 p-4">
        <div class="rounded-md border border-gray-100 bg-gray-50/60 p-3">
          <SamplingParamsSettingsEditor
            v-model="projectSamplingParamsDraft"
            :disabled="!isReady || isRunning || projectWebSearchSettingsSaving || !projectWebSearchSettingsTarget"
            :resolved="projectSamplingParamsResolved"
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
          class="rounded-md border px-3 py-2 text-xs"
          :class="projectWebSearchSettingsStatus === 'Saved.' ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900'"
          data-testid="project-web-search-status"
        >
          {{ projectWebSearchSettingsStatus }}
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            :disabled="projectWebSearchSettingsSaving"
            @click="closeProjectWebSearchSettings"
          >
            Close
          </button>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="!isReady || isRunning || projectWebSearchSettingsSaving || !projectWebSearchSettingsTarget"
            data-testid="project-web-search-save"
            @click="saveProjectWebSearchSettings"
          >
            {{ projectWebSearchSettingsSaving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </SettingsModal>

  </div>
</template>

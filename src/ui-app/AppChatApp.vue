<script setup lang="ts">
import ChatLayout from '@/ui-kit/chat/ChatLayout.vue'
import ChatStatusBar from '@/ui-kit/chat/ChatStatusBar.vue'
import ChatTranscript from '@/ui-kit/chat/ChatTranscript.vue'
import ChatMessageBubble from '@/ui-kit/chat/ChatMessageBubble.vue'
import ChatAppReasoningPanel from './components/ChatAppReasoningPanel.vue'
import ConversationList from './components/ConversationList.vue'
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
  showReasoningPanel,
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
  onComposerUpdateSamplingParamsLayer,
  onComposerUpdateWebSearchLayer,
  onUpdateImageGeneration,
  onUpdateImageGenerationFollowDefault,
  onComposerOpenWebSearchSettings,
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
  questionEditDialog,
  closeQuestionEdit,
  submitQuestionEdit,
  canReplaceQuestionInUi,
} = useAppChatAppLogic()
</script>

<template>
  <div class="flex h-full min-h-0 w-full overflow-hidden">
    <!-- 对话列表 -->
    <ConversationList
      :items="convoListItems"
      :activeId="activeConvoId"
      :activeProjectId="activeProjectId"
      :inboxId="inboxId"
      :projects="projectListItems"
      :disabled="!isReady || isRunning"
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

    <SearchModal
      :open="searchModalOpen"
      :projects="searchProjectOptions"
      :convos="searchConvoOptions"
      :activeProjectId="activeProjectId"
      :activeConvoId="activeConvoId"
      :disabled="!isReady || isRunning"
      @close="closeSearchModal"
      @select="onSelectSearchHit"
    />

    <div class="min-h-0 flex-1 overflow-hidden">
      <ChatLayout :sidePanel="showReasoningPanel ? 'right' : 'none'">
        <template #header>
          <ChatStatusBar
            title="Starverse"
            :run="runVM"
            :isRunning="isRunning"
            :showAbort="false"
            :showReset="false"
          />
        </template>
        <template #status>
          <div class="flex items-center justify-between gap-2 px-4 py-2 text-xs text-gray-600">
            <div class="min-w-0">
              <div class="truncate font-semibold uppercase tracking-wide">ui-app</div>
              <div class="truncate text-[11px] text-gray-500">
                {{ activeTitle || 'No active conversation' }}
              </div>
            </div>
            <div class="flex items-center gap-2 text-[11px] text-gray-500">
              <label class="sr-only" for="branch-select">Branch</label>
              <select
                id="branch-select"
                class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm disabled:opacity-50"
                :disabled="!isReady || isRunning || branches.length === 0"
                :value="activeBranchId ?? ''"
                data-testid="branch-select"
                @change="onSelectBranch(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="b in branches" :key="b.id" :value="b.id">
                  {{ b.name ?? b.id.slice(0, 8) }}
                </option>
              </select>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!isReady || isRunning || !activeBranch?.headMessageId"
                data-testid="branch-fork-head"
                @click="onForkFromHead"
              >
                Fork
              </button>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!isReady || isRunning || branches.length <= 1"
                data-testid="branch-delete"
                @click="onDeleteActiveBranch"
              >
                Delete
              </button>
              <div>Phase 3</div>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!isReady || isRunning || !activeConvoId"
                data-testid="session-web-search-open"
                @click="openSessionWebSearchSettings"
              >
                {{ sessionWebSearchToolbarLabel }}
              </button>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!isReady || isRunning"
                aria-label="Open settings"
                @click="openSettings"
              >
                Settings
              </button>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!isReady || isRunning || !activeConvoId"
                data-testid="user-render-mode-toggle"
                @click="cycleUserMessageRenderMode"
              >
                {{ userMessageRenderModeLabel }}
              </button>
              <button
                type="button"
                class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                :disabled="!canToggleReasoningPanel"
                @click="onToggleReasoningPanelState()"
              >
                {{ showReasoningPanel ? 'Hide reasoning' : 'Show reasoning' }}
              </button>
            </div>
          </div>
          <div v-if="loadError" class="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900">
            {{ loadError }}
          </div>
          <div v-else-if="normalizedErrorSummary" class="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="break-words">{{ normalizedErrorSummary }}</div>
                <div v-if="normalizedErrorActionHint" class="mt-1 text-[11px] text-amber-800">{{ normalizedErrorActionHint }}</div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-900 hover:bg-amber-100"
                @click="copyErrorDetails"
              >
                Copy details
              </button>
            </div>
          </div>
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
                :class="isTurnExcludedForMessage(message.messageId, message.role) ? 'opacity-45 grayscale' : ''"
                :data-testid="`msg-wrap-${message.messageId}`"
                @click="onSelectCursor(message.messageId, $event)"
              >
                <ChatMessageBubble
                  :message="message"
                  :renderUserMessageRichText="userMessageRenderPolicy.effective"
                  :errorView="toErrorPanelView(message)"
                  :errorEnvelopeLoading="inFlightEnvelopeIds.has(message.messageId)"
                  :errorEnvelopeUnavailable="errorEnvelopeUnavailableIds.has(message.messageId)"
                  :onRequestErrorEnvelope="requestErrorEnvelope"
                >
                  <template #header-right>
                    <button
                      v-if="message.role === 'assistant' && message.messageId === lastAssistantMessageId && lastAssistantThinkingLabel"
                      type="button"
                      class="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-900 hover:bg-blue-200"
                      title="点击查看推理详情"
                      @click="onToggleReasoningPanelState(message.messageId)"
                    >
                      {{ lastAssistantThinkingLabel }}
                    </button>
                  </template>
                </ChatMessageBubble>

                <div v-if="message.role === 'user'" class="mt-2 flex items-center gap-2 pl-11 text-[11px] text-gray-500">
                  <button
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                    :disabled="getUserMessageRawText(message).length === 0"
                    :data-testid="`copy-raw-q-${message.messageId}`"
                    @click="copyUserMessageRaw(message)"
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
                    :disabled="getAssistantVisibleText(message).length === 0"
                    :data-testid="`copy-assistant-text-${message.messageId}`"
                    @click="copyAssistantMessage(message, 'plain')"
                  >
                    Copy text
                  </button>
                  <button
                    v-if="hasAssistantCitations(message)"
                    type="button"
                    class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                    :disabled="getAssistantVisibleText(message).length === 0"
                    :data-testid="`copy-assistant-with-refs-${message.messageId}`"
                    @click="copyAssistantMessage(message, 'with_refs')"
                  >
                    Copy + refs
                  </button>
                  <template v-if="chosenQuestionIdForAnswerRootMessage(message.messageId)">
                    <button
                      v-if="getAssistantImageBlockCount(message) > 0"
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
                          `${(getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.index ?? 0) + 1}/${
                            getCandidatePager(chosenQuestionIdForAnswerRootMessage(message.messageId)!)?.total ?? 1
                          }`
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

        <template #side>
          <ChatAppReasoningPanel
            :messageId="lastAssistantMessageId"
            :reasoningView="lastAssistantReasoningView"
            :reasoningVersion="lastAssistantReasoningVersion"
            :panelState="lastAssistantPanelState"
            :isStreaming="lastAssistantIsStreaming"
            :reasoningPieces="lastAssistantReasoningPieces"
            :localProcessingDurationMs="lastAssistantMessage?.reasoningDurationMs ?? null"
            @toggle-panel-state="onToggleReasoningPanelState"
          />
        </template>

        <template #composer>
          <ChatAppComposer
            v-model:draft="draft"
            :model="model"
            v-model:requestedReasoningEffort="requestedReasoningEffort"
            v-model:requestedReasoningExclude="requestedReasoningExclude"
            :disabled="!isReady"
            :isRunning="isRunning"
            :modelCatalog="modelCatalogForPicker"
            :showHiddenModelsInPickers="showHiddenModelsInPickers"
            :modelCatalogNotice="modelCatalogNotice"
            :modelPrefsScope="modelPrefsScopeForUi"
            :samplingParamsLayer="activeSessionSamplingParamsLayer"
            :samplingParamsResolved="activeSessionSamplingParamsResolved"
            :samplingParamsSaving="sessionSamplingParamsQuickSaving || sessionWebSearchSettingsSaving"
            :webSearchLayer="activeSessionWebSearchLayer"
            :webSearchResolved="activeSessionWebSearchResolved"
            :webSearchSaving="sessionWebSearchQuickSaving || sessionWebSearchSettingsSaving"
            :imageGeneration="imageGenerationState"
            :imageGenerationSupported="imageGenerationSupported"
            :imageGenerationVisible="imageGenerationSupported"
            :imageGenerationFollowDefault="imageGenerationFollowDefault"
            :imageGenerationCapabilityClass="selectedModelImageCapabilityClass"
            :imageGenerationSupportHint="imageGenerationSupportHint"
            :imageGenerationAdvancedError="imageGenerationAdvancedError"
            @update:model="onUpdateModel"
            @update:samplingParamsLayer="onComposerUpdateSamplingParamsLayer"
            @update:webSearchLayer="onComposerUpdateWebSearchLayer"
            @update:imageGeneration="onUpdateImageGeneration"
            @update:imageGenerationFollowDefault="onUpdateImageGenerationFollowDefault"
            @openWebSearchSettings="onComposerOpenWebSearchSettings"
            @toggleShowHiddenModelsInPickers="showHiddenModelsInPickers = !showHiddenModelsInPickers"
            @send="onSend"
            @abort="onAbort"
          />
        </template>
      </ChatLayout>

      <SettingsModal :open="settingsOpen" :disabled="!isReady" :isRunning="isRunning" @close="closeSettings">
        <SettingsPanel :disabled="!isReady" :isRunning="isRunning" />
      </SettingsModal>

      <SettingsModal
        :open="sessionWebSearchSettingsOpen"
        :disabled="!isReady"
        :isRunning="isRunning"
        title="Session Web Search"
        @close="closeSessionWebSearchSettings"
      >
        <div class="space-y-3 p-4">
          <div class="rounded-md border border-gray-100 bg-gray-50/60 p-3">
            <SamplingParamsSettingsEditor
              v-model="sessionSamplingParamsDraft"
              :disabled="!isReady || isRunning || sessionWebSearchSettingsSaving"
              :resolved="sessionSamplingParamsDraftResolved"
              :defaultCollapsed="true"
            />
          </div>
          <WebSearchSettingsEditor
            v-model="sessionWebSearchDraft"
            :disabled="!isReady || isRunning || sessionWebSearchSettingsSaving"
            :resolved="sessionWebSearchDraftResolved"
            :inheritanceHint="sessionWebSearchDraftHint"
          />
          <div
            v-if="sessionWebSearchSettingsStatus"
            class="rounded-md border px-3 py-2 text-xs"
            :class="sessionWebSearchSettingsStatus === 'Saved.' ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900'"
            data-testid="session-web-search-status"
          >
            {{ sessionWebSearchSettingsStatus }}
          </div>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              :disabled="sessionWebSearchSettingsSaving"
              @click="closeSessionWebSearchSettings"
            >
              Close
            </button>
            <button
              type="button"
              class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="!isReady || isRunning || sessionWebSearchSettingsSaving || !activeConvoId"
              data-testid="session-web-search-save"
              @click="saveSessionWebSearchSettings"
            >
              {{ sessionWebSearchSettingsSaving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>
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

      <div
        v-if="questionEditDialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        data-testid="question-edit-dialog"
        @keydown.esc="closeQuestionEdit"
      >
        <div class="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl">
          <div class="text-sm font-semibold text-gray-900">Edit question</div>
          <div class="mt-2">
            <textarea
              class="h-28 w-full rounded border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              :value="questionEditDialog.draft"
              @input="questionEditDialog = { ...questionEditDialog, draft: ($event.target as HTMLTextAreaElement).value }"
            />
            <div class="mt-1 text-[11px] text-gray-500">
              New question creates a new question variant. Replace question hides the current question variant (branch-local) and is only allowed on the last question.
            </div>
          </div>
          <div class="mt-3 flex items-center justify-end gap-2">
            <button type="button" class="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50" @click="closeQuestionEdit">
              Cancel
            </button>
            <button
              type="button"
              class="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="isRunning || questionEditDialog.draft.trim().length === 0"
              data-testid="question-edit-new"
              @click="submitQuestionEdit('new')"
            >
              New question
            </button>
            <button
              type="button"
              class="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              :disabled="
                isRunning ||
                questionEditDialog.draft.trim().length === 0 ||
                !canReplaceQuestionInUi(questionEditDialog.questionId)
              "
              data-testid="question-edit-replace"
              @click="submitQuestionEdit('replace')"
            >
              Replace question
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

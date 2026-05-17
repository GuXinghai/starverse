<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type CSSProperties } from 'vue'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import { ModelPrefsService, type ModelPrefsFavorite, type ModelPrefsRecent } from '@/next/modelPrefs/modelPrefsService'
import type { ChatSessionConfig } from '../app/chatSessionConfig'
import ComposerCapabilityChip from './ComposerCapabilityChip.vue'
import ModelPickerDialog from './ModelPickerDialog.vue'

const props = defineProps<{
  draft: string
  disabled: boolean
  isRunning: boolean
  model?: string | null
  sessionConfig?: ChatSessionConfig | null
  modelCatalog: readonly ModelCatalogItem[]
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
}>()

const defaultSessionConfig: ChatSessionConfig = {
  model: {
    selectedModelKey: null,
  },
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
  samplingParams: {
    detail: null,
  },
}

const emit = defineEmits<{
  (e: 'update:draft', value: string): void
  (e: 'updateModel', value: string): void
  (e: 'update:model', value: string): void
  (e: 'updateReasoningEnabled', value: boolean): void
  (e: 'updateReasoningEffort', value: 'low' | 'medium' | 'high'): void
  (e: 'updateWebSearchEnabled', value: boolean): void
  (e: 'updateWebSearchLevel', value: 'low' | 'high'): void
  (e: 'updateImageGenerationEnabled', value: boolean): void
  (e: 'updateImageGenerationResolution', value: '1K' | '2K' | '4K'): void
  (e: 'updateImageGenerationAspectRatio', value: '16:9' | '3:4' | '1:1' | '4:3'): void
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

const favoriteModels = ref<ModelPrefsFavorite[]>([])
const recentModels = ref<ModelPrefsRecent[]>([])
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
  attachmentMenuError.value = '附件菜单暂时无法打开，请重试'
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
const isSendButtonEnabled = computed(() => resolvedSendButtonMode.value === 'enabled_arrow')
const historyIncompatibleSummary = computed(() => props.historyIncompatibleSummary ?? null)
const selectedModel = computed(() => {
  const normalized = normalizeModelKey(resolvedSessionConfig.value.model.selectedModelKey)
  return normalized || 'openrouter/auto'
})
const modelNameById = computed(() => {
  const map = new Map<string, string>()
  map.set('openrouter/auto', 'openrouter/auto')
  for (const item of props.modelCatalog) {
    map.set(normalizeModelKey(item.modelId), item.name)
  }
  return map
})
const favoriteModelKeySet = computed(() => new Set(favoriteModels.value.map((item) => item.modelKey)))
const currentModelKey = computed(() => {
  const normalized = normalizeModelKey(selectedModel.value)
  return normalized.length > 0 ? `openrouter::${normalized}` : ''
})
const attachmentFeedbackClass = computed(() => {
  if (props.attachmentFeedbackTone === 'error') return 'border-red-200 bg-red-50 text-red-800'
  if (props.attachmentFeedbackTone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (props.attachmentFeedbackTone === 'success') return 'border-green-200 bg-green-50 text-green-800'
  if (props.attachmentFeedbackTone === 'info') return 'border-blue-200 bg-blue-50 text-blue-800'
  return 'border-gray-200 bg-gray-50 text-gray-700'
})
const currentModelIsFavorite = computed(() => favoriteModelKeySet.value.has(currentModelKey.value))
const favoriteDisplayItems = computed(() =>
  favoriteModels.value.map((item) => ({
    modelId: normalizeModelKey(item.modelId),
    name: modelNameById.value.get(normalizeModelKey(item.modelId)) ?? item.modelId,
  })),
)
const recentDisplayItems = computed(() =>
  recentModels.value
    .filter((item) => !favoriteModelKeySet.value.has(item.modelKey))
    .map((item) => ({
      modelId: normalizeModelKey(item.modelId),
      name: modelNameById.value.get(normalizeModelKey(item.modelId)) ?? item.modelId,
    })),
)
const currentModelDisplayName = computed(() => modelNameById.value.get(selectedModel.value) ?? selectedModel.value)

function isSelectedModel(modelId: string): boolean {
  return normalizeModelKey(modelId) === selectedModel.value
}

function modelChipClass(modelId: string): string {
  return isSelectedModel(modelId)
    ? 'border-blue-300 bg-blue-50 text-blue-700'
    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
}

async function refreshQuickModels() {
  favoriteModels.value = await ModelPrefsService.listFavorites({ scopeType: 'global', scopeId: '' })
  recentModels.value = await ModelPrefsService.listRecents({ scopeType: 'global', scopeId: '' })
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
  const resolutions = ['1K', '2K', '4K']
  const aspectRatios = ['16:9', '3:4', '1:1', '4:3']
  if (resolutions.includes(value)) {
    emit('updateImageGenerationResolution', value as '1K' | '2K' | '4K')
    emit('updateImageGenerationEnabled', true)
  } else if (aspectRatios.includes(value)) {
    emit('updateImageGenerationAspectRatio', value as '16:9' | '3:4' | '1:1' | '4:3')
    emit('updateImageGenerationEnabled', true)
  }
}

function openModelPicker() {
  if (props.disabled) return
  modelPickerOpen.value = true
}

function closeModelPicker() {
  modelPickerOpen.value = false
}

function onSelectModelFromPicker(modelId: string) {
  emit('updateModel', modelId)
  emit('update:model', modelId)
  modelPickerOpen.value = false
}

function onUpdateModel(modelId: string) {
  emit('updateModel', modelId)
  emit('update:model', modelId)
}

async function onToggleCurrentModelFavorite() {
  const modelId = normalizeModelKey(selectedModel.value)
  if (!modelId || modelId === 'openrouter/auto') return
  await ModelPrefsService.toggleFavorite(
    {
      providerKey: 'openrouter',
      modelId,
      modelKey: `openrouter::${modelId}`,
    },
    { scopeType: 'global', scopeId: '' },
  )
  await refreshQuickModels()
}

async function onToggleModelPickerFavorite(modelId: string) {
  const normalized = normalizeModelKey(modelId)
  if (!normalized) return
  await ModelPrefsService.toggleFavorite(
    {
      providerKey: 'openrouter',
      modelId: normalized,
      modelKey: `openrouter::${normalized}`,
    },
    { scopeType: 'global', scopeId: '' },
  )
  await refreshQuickModels()
}

onMounted(() => {
  void refreshQuickModels()
  unsubscribeModelPrefs = ModelPrefsService.subscribe(() => {
    void refreshQuickModels()
  })
})

onBeforeUnmount(() => {
  removeAttachmentMenuListeners()
  cancelAttachmentMenuFrame()
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
        placeholder="Type a message..."
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
          查看
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
        <div class="flex items-center gap-2 text-[11px] text-gray-500">
          <div>Drafts are restored per conversation and branch.</div>
          <div>
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
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="isSendButtonStop"
            type="button"
            class="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            data-testid="composer-stop"
            @click="emit('abort')"
          >
            Stop
          </button>
          <button
            v-else
            type="button"
            class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            :disabled="!isSendButtonEnabled"
            :title="sendPlanBlockingSummary ?? undefined"
            data-testid="composer-send"
            @click="emit('send')"
          >
            <span v-if="isSendButtonBusy" class="inline-block animate-spin mr-1">⟳</span>
            Send
          </button>
        </div>
      </div>

      <div
        v-if="props.isSendPlanLoading"
        class="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-700"
        data-testid="composer-send-gate-loading"
      >
        正在更新发送计划...
      </div>
      <div
        v-else-if="sendPlanBlockingSummary"
        class="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800"
        data-testid="composer-send-gate-block"
      >
        {{ sendPlanBlockingSummary }}
      </div>
      <div
        v-else-if="sendPlanWarningSummary"
        class="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
        data-testid="composer-send-gate-warning"
      >
        {{ sendPlanWarningSummary }}
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3 text-xs text-gray-600">
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
          :disabled="props.disabled || props.isRunning || selectedModel === 'openrouter/auto'"
          data-testid="current-model-favorite-toggle"
          @click="onToggleCurrentModelFavorite"
        >
          {{ currentModelIsFavorite ? '★' : '☆' }}
        </button>
        <div class="flex max-w-full items-center gap-1 overflow-x-auto">
          <button
            v-for="item in favoriteDisplayItems"
            :key="`favorite-model-${item.modelId}`"
            type="button"
            class="rounded-md border px-2 py-1 text-[11px] shadow-sm disabled:opacity-50"
            :class="modelChipClass(item.modelId)"
            :disabled="disabled"
            :data-testid="`favorite-model-${item.modelId}`"
            :aria-pressed="isSelectedModel(item.modelId)"
            @click="onUpdateModel(item.modelId)"
          >
            {{ item.name }}
          </button>
          <button
            v-for="item in recentDisplayItems.slice(0, 4)"
            :key="`recent-model-${item.modelId}`"
            type="button"
            class="rounded-md border px-2 py-1 text-[11px] shadow-sm disabled:opacity-50"
            :class="modelChipClass(item.modelId)"
            :disabled="disabled"
            :data-testid="`recent-model-${item.modelId}`"
            :aria-pressed="isSelectedModel(item.modelId)"
            @click="onUpdateModel(item.modelId)"
          >
            {{ item.name }}
          </button>
        </div>
      </div>

      <ComposerCapabilityChip
        :enabled="resolvedSessionConfig.reasoning.enabled"
        label="Think"
        :active-label="resolvedSessionConfig.reasoning.enabled ? resolvedSessionConfig.reasoning.effort : null"
        kind="reasoning"
        :disabled="disabled"
        :options="['low', 'medium', 'high']"
        :selected-option="resolvedSessionConfig.reasoning.effort"
        data-test-id="reasoning-chip"
        @toggle="emit('updateReasoningEnabled', !resolvedSessionConfig.reasoning.enabled)"
        @select-option="(v) => { emit('updateReasoningEffort', v as 'low' | 'medium' | 'high'); emit('updateReasoningEnabled', true) }"
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
        :enabled="resolvedSessionConfig.webSearch.enabled"
        label="Search"
        :active-label="resolvedSessionConfig.webSearch.enabled ? resolvedSessionConfig.webSearch.level : null"
        kind="webSearch"
        :disabled="disabled"
        :options="['low', 'high']"
        :selected-option="resolvedSessionConfig.webSearch.level"
        data-test-id="web-search-chip"
        @toggle="emit('updateWebSearchEnabled', !resolvedSessionConfig.webSearch.enabled)"
        @select-option="(v) => { emit('updateWebSearchLevel', v as 'low' | 'high'); emit('updateWebSearchEnabled', true) }"
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
        :enabled="resolvedSessionConfig.imageGeneration.enabled"
        label="Image"
        :active-label="resolvedSessionConfig.imageGeneration.enabled ? `${resolvedSessionConfig.imageGeneration.resolution} · ${resolvedSessionConfig.imageGeneration.aspectRatio}` : null"
        kind="image"
        :disabled="disabled"
        :options="['1K', '2K', '4K', '—', '16:9', '3:4', '1:1', '4:3']"
        :selected-option="null"
        data-test-id="image-chip"
        @toggle="emit('updateImageGenerationEnabled', !resolvedSessionConfig.imageGeneration.enabled)"
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
          Upload file
        </button>
        <button
          type="button"
          class="block w-full rounded px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          :disabled="props.disabled || props.isRunning || props.imageInputSupported === false"
          :title="props.imageInputSupported === false ? props.imageInputDisabledReason ?? 'Current model does not support image inputs.' : undefined"
          data-testid="composer-attach-image"
          @click="requestAttachImages"
        >
          Upload image
        </button>
        <button
          type="button"
          class="block w-full rounded px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          :disabled="props.disabled || props.isRunning"
          data-testid="composer-attach-url"
          @click="requestAttachUrl"
        >
          Upload link
        </button>
      </div>
    </Teleport>

  <ModelPickerDialog
    :open="modelPickerOpen"
    :disabled="props.disabled"
    :isRunning="props.isRunning"
    :selectedModelId="selectedModel"
    :favoriteModelKeys="favoriteModels.map((item) => item.modelKey)"
    :fallbackModels="props.modelCatalog"
    @close="closeModelPicker"
    @select="onSelectModelFromPicker"
    @toggleFavorite="onToggleModelPickerFavorite"
  />
</template>

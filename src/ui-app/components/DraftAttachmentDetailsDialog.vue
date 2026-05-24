<script setup lang="ts">
import type { DraftAttachmentSendModePreference, DraftAttachmentUrlRetentionPreference } from '@/shared/files/fileTypes'

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

type DraftAttachmentDfcOption = Readonly<{
  optionId: string
  targetKind: string
  sendStrategy: string
  status: string
  compatibilityStatus: string | null
  isAvailable: boolean
  selected: boolean
  disabled: boolean
  disabledReason: string | null
  label: string
  detail: string
}>

type DraftAttachmentDfcOptions = Readonly<{
  loading: boolean
  error: string | null
  dfcManaged: boolean
  selectedOptionId: string | null
  decisionStatus: string | null
  decisionReasonCode: string | null
  targetKind: string | null
  sendStrategy: string | null
  options: readonly DraftAttachmentDfcOption[]
}>

type DraftAttachmentDetectionInfo = Readonly<{
  routeEligibility: 'verdict_ready' | 'detection_pending' | 'detection_failed' | 'detection_required'
  detectionLevel: 'basic' | 'advanced' | 'parser_validated' | null
  engineMode: 'core_only' | 'core_plus_magika' | 'core_plus_parser' | 'core_plus_external' | null
  usedMagika: boolean
  magikaState: 'not_installed' | 'disabled' | 'unavailable' | 'available' | 'failed' | 'not_requested'
  evidenceSources: readonly string[]
  decisiveEvidenceSource: string | null
  detectionTrigger: string | null
  magikaModelVersion: string | null
  advancedAttempted: boolean
  advancedFailureReason: string | null
}>

type DraftAttachmentDetailsViewModel = Readonly<{
  draftAttachmentId: string
  assetId: string
  filename: string
  extension: string | null
  assetKind: string
  aiPayloadKind: string
  sourceKind: string
  displayStatus: 'parsing' | 'detection_pending' | 'detection_failed' | 'detection_required' | 'ready' | 'ready_with_warnings' | 'incompatible_with_current_model' | 'failed' | 'unsupported'
  borderTone: 'green' | 'yellow' | 'red' | 'neutral'
  isParsing: boolean
  warningReason: string | null
  blockingReason: string | null
  previewDataUrl: string | null
  canRemove: boolean
  mime: string | null
  createdAt: number
  updatedAt: number
  preferredSendMode: DraftAttachmentSendModePreference
  urlRetentionMode: DraftAttachmentUrlRetentionPreference
  sendPlanStatus: string | null
  currentSendMode: string | null
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
  detectionInfo: DraftAttachmentDetectionInfo | null
  dfcOptions: DraftAttachmentDfcOptions
}> 

const props = defineProps<{
  open: boolean
  attachment: DraftAttachmentDetailsViewModel | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'remove', assetId: string): void
  (e: 'update-send-mode', value: DraftAttachmentSendModePreference): void
  (e: 'update-url-retention', value: DraftAttachmentUrlRetentionPreference): void
  (e: 'update-dfc-option', optionId: string): void
  (e: 'retry'): void
}>()

function formatSendModePreference(value: DraftAttachmentSendModePreference): string {
  if (value === 'default') return '跟随默认设定'
  if (value === 'auto') return '自动'
  if (value === 'url_ref') return '链接'
  return '文件副本'
}

function formatUrlRetentionPreference(value: DraftAttachmentUrlRetentionPreference): string {
  if (value === 'default') return '跟随默认设定'
  if (value === 'link_only') return '仅保留链接'
  return '保留链接并尝试保存本地副本'
}

function close() {
  emit('close')
}

function updateSendMode(value: DraftAttachmentSendModePreference) {
  emit('update-send-mode', value)
}

function updateUrlRetention(value: DraftAttachmentUrlRetentionPreference) {
  emit('update-url-retention', value)
}

function updateDfcOption(option: DraftAttachmentDfcOption) {
  if (option.disabled) return
  emit('update-dfc-option', option.optionId)
}

function removeAttachment() {
  if (!props.attachment?.canRemove) return
  emit('remove', props.attachment.assetId)
}
</script>

<template>
  <div
    v-if="props.open && props.attachment"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
    data-testid="draft-attachment-details-dialog"
    @click.self="close"
    @keydown.esc="close"
  >
    <div class="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-4 shadow-xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-gray-900">Attachment details</div>
          <div class="mt-1 text-xs text-gray-500">{{ props.attachment.filename }}</div>
        </div>
        <button
          type="button"
          class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          data-testid="draft-attachment-details-close"
          @click="close"
        >
          Close
        </button>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <section class="space-y-2 rounded border border-gray-200 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Basic</div>
          <dl class="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt class="text-gray-500">File name</dt><dd class="min-w-0 break-words text-gray-900">{{ props.attachment.filename }}</dd>
            <dt class="text-gray-500">Extension</dt><dd class="text-gray-900">{{ props.attachment.extension ?? '-' }}</dd>
            <dt class="text-gray-500">MIME</dt><dd class="break-words text-gray-900">{{ props.attachment.mime ?? '-' }}</dd>
            <dt class="text-gray-500">File type</dt><dd class="text-gray-900">{{ props.attachment.assetKind }}</dd>
            <dt class="text-gray-500">Asset kind</dt><dd class="text-gray-900">{{ props.attachment.assetKind }}</dd>
            <dt class="text-gray-500">AI payload</dt><dd class="text-gray-900">{{ props.attachment.aiPayloadKind }}</dd>
            <dt class="text-gray-500">Source</dt><dd class="text-gray-900">{{ props.attachment.sourceKind }}</dd>
            <dt class="text-gray-500">Status</dt><dd class="text-gray-900">{{ props.attachment.displayStatus }}</dd>
            <dt class="text-gray-500">Detection</dt><dd class="text-gray-900">{{ props.attachment.detectionInfo?.detectionLevel ?? props.attachment.detectionInfo?.routeEligibility ?? '-' }}</dd>
            <dt class="text-gray-500">Send plan</dt><dd class="text-gray-900">{{ props.attachment.sendPlanStatus ?? '-' }}</dd>
            <dt class="text-gray-500">Current send</dt><dd class="text-gray-900">{{ props.attachment.currentSendModeLabel }}</dd>
            <dt class="text-gray-500">Send mode</dt><dd class="text-gray-900">{{ formatSendModePreference(props.attachment.preferredSendMode) }}</dd>
            <dt class="text-gray-500">URL retention</dt><dd class="text-gray-900">{{ formatUrlRetentionPreference(props.attachment.urlRetentionMode) }}</dd>
            <dt class="text-gray-500">Can remove</dt><dd class="text-gray-900">{{ props.attachment.canRemove ? 'yes' : 'no' }}</dd>
            <dt class="text-gray-500">Created</dt><dd class="text-gray-900">{{ props.attachment.createdAt }}</dd>
            <dt class="text-gray-500">Updated</dt><dd class="text-gray-900">{{ props.attachment.updatedAt }}</dd>
          </dl>
        </section>

        <section class="space-y-2 rounded border border-gray-200 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Reasons</div>
          <div class="space-y-2 text-sm">
            <div v-if="props.attachment.warningReason" class="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
              {{ props.attachment.warningReason }}
            </div>
            <div v-if="props.attachment.blockingReason" class="rounded border border-red-200 bg-red-50 p-2 text-red-800">
              {{ props.attachment.blockingReason }}
            </div>
            <div v-if="!props.attachment.warningReason && !props.attachment.blockingReason" class="text-gray-500">
              No warnings or blocking reasons.
            </div>
            <div v-if="props.attachment.sendPlanStatus" class="text-xs text-gray-500">
              Send plan: {{ props.attachment.sendPlanStatus }}
            </div>
          </div>

          <div class="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Operations</div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!props.attachment.retryPreviewAvailable"
              :title="props.attachment.retryPreviewReason ?? ''"
              data-testid="draft-attachment-details-retry"
              @click="emit('retry')"
            >
              Retry preview
            </button>
            <button
              v-if="props.attachment.canRemove"
              type="button"
              class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              data-testid="draft-attachment-details-remove"
              @click="removeAttachment"
            >
              Remove
            </button>
          </div>
        </section>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <section class="space-y-2 rounded border border-gray-200 p-3" data-testid="draft-attachment-dfc-options">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Format</div>
          <div v-if="props.attachment.dfcOptions.loading" class="text-sm text-gray-500" data-testid="draft-attachment-dfc-options-loading">
            Loading...
          </div>
          <div v-else-if="props.attachment.dfcOptions.error" class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800" data-testid="draft-attachment-dfc-options-error">
            {{ props.attachment.dfcOptions.error }}
          </div>
          <div v-else-if="props.attachment.dfcOptions.options.length > 0" class="space-y-2">
            <button
              v-for="option in props.attachment.dfcOptions.options"
              :key="option.optionId"
              type="button"
              class="w-full rounded border px-3 py-2 text-left text-sm"
              :class="option.disabled ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400' : option.selected ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'"
              :disabled="option.disabled"
              :data-testid="`draft-attachment-dfc-option-${option.targetKind}`"
              @click="updateDfcOption(option)"
            >
              <div class="flex items-center justify-between gap-2">
                <span>{{ option.label }}</span>
                <span v-if="option.selected" class="text-[11px] text-blue-700">selected</span>
              </div>
              <div class="mt-1 text-[11px] text-gray-500">{{ option.detail }}</div>
              <div v-if="option.disabledReason" class="mt-1 text-[11px] text-gray-500">{{ option.disabledReason }}</div>
            </button>
          </div>
          <div v-else class="text-sm text-gray-500" data-testid="draft-attachment-dfc-options-empty">
            No format options.
          </div>
          <div v-if="props.attachment.dfcOptions.decisionStatus" class="text-[11px] text-gray-500">
            {{ props.attachment.dfcOptions.decisionStatus }}
            <span v-if="props.attachment.dfcOptions.decisionReasonCode"> · {{ props.attachment.dfcOptions.decisionReasonCode }}</span>
          </div>
        </section>

        <section class="space-y-2 rounded border border-gray-200 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Send mode</div>
          <div class="text-[11px] text-gray-500">Defaults resolve in order: attachment, conversation, project, global.</div>
          <div class="space-y-2">
            <button
              v-for="option in props.attachment.sendModeOptions"
              :key="option.value"
              type="button"
              class="w-full rounded border px-3 py-2 text-left text-sm"
              :class="option.disabled ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400' : option.value === props.attachment.preferredSendMode ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'"
              :disabled="option.disabled"
              :data-testid="`draft-attachment-send-mode-${option.value}`"
              @click="updateSendMode(option.value)"
            >
              <div class="flex items-center justify-between gap-2">
                <span>{{ option.label }}</span>
                <span v-if="option.value === props.attachment.preferredSendMode" class="text-[11px] text-blue-700">selected</span>
              </div>
              <div v-if="option.reason" class="mt-1 text-[11px] text-gray-500">{{ option.reason }}</div>
            </button>
          </div>
        </section>

        <section class="space-y-2 rounded border border-gray-200 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">URL retention</div>
          <div v-if="props.attachment.sourceKind === 'url_import' || props.attachment.originalUrl || props.attachment.resolvedUrl" class="space-y-2">
            <button
              v-for="option in props.attachment.urlRetentionOptions"
              :key="option.value"
              type="button"
              class="w-full rounded border px-3 py-2 text-left text-sm"
              :class="option.disabled ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400' : option.value === props.attachment.urlRetentionMode ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'"
              :disabled="option.disabled"
              :data-testid="`draft-attachment-url-retention-${option.value}`"
              @click="updateUrlRetention(option.value)"
            >
              <div class="flex items-center justify-between gap-2">
                <span>{{ option.label }}</span>
                <span v-if="option.value === props.attachment.urlRetentionMode" class="text-[11px] text-blue-700">selected</span>
              </div>
              <div v-if="option.reason" class="mt-1 text-[11px] text-gray-500">{{ option.reason }}</div>
            </button>
          </div>
          <div v-else class="text-sm text-gray-500">This attachment is not URL-based.</div>
        </section>
      </div>

      <section v-if="props.attachment.sourceKind === 'url_import' || props.attachment.originalUrl || props.attachment.resolvedUrl" class="mt-4 space-y-2 rounded border border-gray-200 p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">URL info</div>
        <dl class="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt class="text-gray-500">Original URL</dt><dd class="break-words text-gray-900">{{ props.attachment.originalUrl ?? '-' }}</dd>
          <dt class="text-gray-500">Resolved URL</dt><dd class="break-words text-gray-900">{{ props.attachment.resolvedUrl ?? '-' }}</dd>
          <dt class="text-gray-500">Probe status</dt><dd class="text-gray-900">{{ props.attachment.probeStatus ?? '-' }}</dd>
          <dt class="text-gray-500">Materialization</dt><dd class="text-gray-900">{{ props.attachment.materializationStatus ?? '-' }}</dd>
          <dt class="text-gray-500">Last probe</dt><dd class="text-gray-900">{{ props.attachment.lastProbeAt ?? '-' }}</dd>
          <dt class="text-gray-500">Probe warning</dt><dd class="break-words text-gray-900">{{ props.attachment.probeWarning ?? '-' }}</dd>
          <dt class="text-gray-500">Probe type</dt><dd class="break-words text-gray-900">{{ props.attachment.contentTypeFromProbe ?? '-' }}</dd>
          <dt class="text-gray-500">Probe length</dt><dd class="text-gray-900">{{ props.attachment.contentLengthFromProbe ?? '-' }}</dd>
          <dt class="text-gray-500">Local copy</dt><dd class="text-gray-900">{{ props.attachment.localCopyExists ? 'exists' : 'not available' }}</dd>
        </dl>
        <div v-if="props.attachment.probeStatus === 'probe_failed' || props.attachment.materializationStatus === 'materialization_failed'" class="text-xs text-amber-700">
          Current device could not finish probing or saving a local copy; the URL can still be kept and sent as a link.
        </div>
      </section>
    </div>
  </div>
</template>

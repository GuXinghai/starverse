<script setup lang="ts">
import { t, tf } from '@/shared/i18n'
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
  explanation: string
  recommended: boolean
  recommendationReason: string | null
  matchesFileTypeDefault: boolean
  matchesGlobalDefault: boolean
  diagnostics: readonly string[]
}>

type DraftAttachmentDfcOptions = Readonly<{
  loading: boolean
  error: string | null
  selectedOptionId: string | null
  decisionStatus: string | null
  decisionReasonCode: string | null
  targetKind: string | null
  sendStrategy: string | null
  recommendedOptionId: string | null
  recommendedReasonCode: string | null
  fileTypeKey: string | null
  fileTypeDefaultTargetKind: string | null
  globalDefaultTargetKind: string | null
  fileTypeDefaultOptionId: string | null
  globalDefaultOptionId: string | null
  options: readonly DraftAttachmentDfcOption[]
}>

type DraftAttachmentDfcPreview = Readonly<{
  loading: boolean
  error: string | null
  kind: string
  status: string | null
  targetKind: string | null
  sendStrategy: string | null
  text: string | null
  characterCount: number | null
  byteLength: number | null
  truncated: boolean
  maxCharacters: number | null
  diagnostics: readonly string[]
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
  retryPreviewLabel: string
  detectionInfo: DraftAttachmentDetectionInfo | null
  dfcOptions: DraftAttachmentDfcOptions
  dfcPreview: DraftAttachmentDfcPreview
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
  (e: 'save-dfc-default', input: { scope: 'file_type' | 'global'; targetKind: any }): void
  (e: 'clear-dfc-default', scope: 'file_type' | 'global'): void
  (e: 'retry'): void
}>()

function formatSendModePreference(value: DraftAttachmentSendModePreference): string {
  if (value === 'default') return t('sendPlan.sendMode.default')
  if (value === 'auto') return t('sendPlan.sendMode.auto')
  if (value === 'url_ref') return t('sendPlan.sendMode.urlRef')
  return t('sendPlan.sendMode.inlineBase64')
}

function formatUrlRetentionPreference(value: DraftAttachmentUrlRetentionPreference): string {
  if (value === 'default') return t('sendPlan.urlRetention.default')
  if (value === 'link_only') return t('sendPlan.urlRetention.linkOnly')
  return t('sendPlan.urlRetention.linkAndFile')
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

function formatDfcTargetKind(value: string | null): string {
  if (value === 'original_file') return t('filePipeline.dfc.targetKind.originalFile')
  if (value === 'plain_text') return t('filePipeline.dfc.targetKind.plainText')
  if (value === 'markdown') return t('filePipeline.dfc.targetKind.markdown')
  if (value === 'code') return t('filePipeline.dfc.targetKind.code')
  if (value === 'table_markdown') return t('filePipeline.dfc.targetKind.tableMarkdown')
  if (value === 'pdf_attachment') return t('filePipeline.dfc.targetKind.pdfAttachment')
  return t('filePipeline.dfc.targetKind.notSet')
}

function explainDfcTargetKind(value: string | null): string {
  if (value === 'original_file') return t('filePipeline.dfc.targetExplanation.originalFile')
  if (value === 'plain_text') return t('filePipeline.dfc.targetExplanation.plainText')
  if (value === 'markdown') return t('filePipeline.dfc.targetExplanation.markdown')
  if (value === 'code') return t('filePipeline.dfc.targetExplanation.code')
  if (value === 'table_markdown') return t('filePipeline.dfc.targetExplanation.tableMarkdown')
  if (value === 'pdf_attachment') return t('filePipeline.dfc.targetExplanation.pdfAttachment')
  return ''
}

function formatDfcSendStrategy(value: string | null): string {
  if (value === 'file_attachment') return t('filePipeline.dfc.sendStrategy.fileAttachment')
  if (value === 'text_in_prompt') return t('filePipeline.dfc.sendStrategy.textInPrompt')
  return '-'
}

function formatDisplayStatus(value: DraftAttachmentDetailsViewModel['displayStatus'] | string | null): string {
  if (value === 'parsing') return t('filePipeline.displayStatus.parsing')
  if (value === 'detection_pending') return t('filePipeline.displayStatus.detectionPending')
  if (value === 'detection_failed') return t('filePipeline.displayStatus.detectionFailed')
  if (value === 'detection_required') return t('filePipeline.displayStatus.detectionRequired')
  if (value === 'ready') return t('filePipeline.displayStatus.ready')
  if (value === 'ready_with_warnings') return t('filePipeline.displayStatus.readyWithWarnings')
  if (value === 'incompatible_with_current_model') return t('filePipeline.displayStatus.incompatible')
  if (value === 'failed') return t('filePipeline.displayStatus.failed')
  if (value === 'unsupported') return t('filePipeline.displayStatus.unsupported')
  return '-'
}

function formatMediaLabel(attachment: DraftAttachmentDetailsViewModel): string {
  if (attachment.sourceKind.trim() === 'url_import') return t('filePipeline.attachment.media.url')
  if (attachment.aiPayloadKind === 'pdf') return t('filePipeline.attachment.media.pdf')
  if (attachment.aiPayloadKind === 'text') return t('filePipeline.attachment.media.text')
  if (attachment.aiPayloadKind === 'audio') return t('filePipeline.attachment.media.audio')
  if (attachment.aiPayloadKind === 'video') return t('filePipeline.attachment.media.video')
  if (attachment.aiPayloadKind === 'binary') return t('filePipeline.attachment.media.binary')
  return t('filePipeline.attachment.media.file')
}

function formatDetectionLabel(detection: DraftAttachmentDetectionInfo | null): string {
  if (!detection) return '-'
  if (detection.routeEligibility === 'detection_pending' || detection.routeEligibility === 'detection_required') return t('filePipeline.route.detectionPending')
  if (detection.routeEligibility === 'detection_failed') return t('filePipeline.route.detectionFailed')
  if (detection.detectionLevel === 'advanced' && detection.usedMagika) return t('filePipeline.attachment.detectionLabel.advancedMagika')
  if (detection.detectionLevel === 'parser_validated') return t('filePipeline.attachment.detectionLabel.parserValidated')
  if (detection.detectionLevel === 'advanced') return t('filePipeline.attachment.detectionLabel.advanced')
  if (detection.detectionLevel === 'basic') return t('filePipeline.attachment.detectionLabel.basic')
  return t('filePipeline.route.eligible')
}

function formatCompatibilityStatus(value: string | null): string {
  if (value === 'compatible') return t('filePipeline.attachment.compatibility.compatible')
  if (value === 'warning') return t('filePipeline.attachment.compatibility.warning')
  if (value === 'blocked') return t('filePipeline.attachment.compatibility.blocked')
  if (value === 'pending') return t('filePipeline.attachment.compatibility.pending')
  if (value === 'incompatible') return t('filePipeline.attachment.compatibility.incompatible')
  return t('filePipeline.attachment.compatibility.unknown')
}

function formatDfcOptionStatus(value: string | null): string {
  if (value === 'ready') return t('filePipeline.dfc.optionStatus.ready')
  if (value === 'pending') return t('filePipeline.dfc.optionStatus.pending')
  if (value === 'candidate') return t('filePipeline.dfc.optionStatus.candidate')
  if (value === 'failed') return t('filePipeline.dfc.optionStatus.failed')
  if (value === 'stale') return t('filePipeline.dfc.optionStatus.stale')
  if (value === 'blocked') return t('filePipeline.dfc.optionStatus.blocked')
  return t('filePipeline.dfc.optionStatus.unknown')
}

function formatDfcPreviewStatus(value: string | null): string {
  if (value === 'ready') return t('filePipeline.dfc.previewStatus.ready')
  if (value === 'blocked') return t('filePipeline.dfc.previewStatus.blocked')
  if (value === 'pending') return t('filePipeline.dfc.previewStatus.pending')
  if (value === 'failed') return t('filePipeline.dfc.previewStatus.failed')
  if (value === null) return t('filePipeline.dfc.previewStatus.none')
  return t('filePipeline.dfc.previewStatus.unknown')
}

function formatDfcDecisionStatus(value: string | null): string {
  if (value === 'ready') return t('filePipeline.dfc.decisionStatus.ready')
  if (value === 'needs_user_selection') return t('filePipeline.dfc.decisionStatus.needsUserSelection')
  if (value === 'blocked') return t('filePipeline.dfc.decisionStatus.blocked')
  if (value === 'pending') return t('filePipeline.dfc.decisionStatus.pending')
  if (value === 'failed') return t('filePipeline.dfc.decisionStatus.failed')
  return t('filePipeline.dfc.decisionStatus.unknown')
}

function formatDfcDecisionReason(value: string | null): string | null {
  if (!value) return null
  if (value === 'selected_option_missing') return t('filePipeline.dfc.decisionReason.selectedOptionMissing')
  if (value === 'selected_option_not_found') return t('filePipeline.dfc.decisionReason.selectedOptionNotFound')
  return t('filePipeline.dfc.decisionReason.unknown')
}

function formatDfcRecommendationReason(value: string | null): string | null {
  if (value === 'backend_recommends_text_preview') return t('filePipeline.dfc.recommendationReason.textPreview')
  if (value === 'backend_recommends_layout_fidelity') return t('filePipeline.dfc.recommendationReason.layoutFidelity')
  if (value === 'backend_recommends_original_file_fallback') return t('filePipeline.dfc.recommendationReason.originalFileFallback')
  return value ? t('filePipeline.dfc.decisionReason.unknown') : null
}

function formatDfcDisabledReason(value: string | null): string | null {
  if (value === 'pending') return t('filePipeline.dfc.disabledReason.pending')
  if (value === 'failed') return t('filePipeline.dfc.disabledReason.failed')
  if (value === 'stale') return t('filePipeline.dfc.disabledReason.stale')
  if (value === 'blocked') return t('filePipeline.dfc.disabledReason.blocked')
  if (value === 'incompatible') return t('filePipeline.dfc.disabledReason.incompatible')
  if (value === 'unavailable') return t('filePipeline.dfc.disabledReason.unavailable')
  return value ? t('filePipeline.dfc.disabledReason.unknown') : null
}

function formatDfcDiagnostic(value: string): string {
  if (value === 'dfc_selection_refs_mismatch') return t('filePipeline.dfc.diagnostic.selectionRefsMismatch')
  return t('filePipeline.dfc.diagnostic.generic')
}

function recommendedDfcTargetKind(): string | null {
  const dfcOptions = props.attachment?.dfcOptions
  if (!dfcOptions) return null
  return dfcOptions.options.find((option) => option.optionId === dfcOptions.recommendedOptionId)?.targetKind ?? null
}

function saveDfcDefault(scope: 'file_type' | 'global', option: DraftAttachmentDfcOption) {
  if (option.disabled) return
  emit('save-dfc-default', { scope, targetKind: option.targetKind })
}

function applyDfcDefault(optionId: string | null) {
  if (!optionId) return
  emit('update-dfc-option', optionId)
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
          <div class="text-sm font-semibold text-gray-900">{{ t('filePipeline.attachment.details.title') }}</div>
          <div class="mt-1 text-xs text-gray-500">{{ props.attachment.filename }}</div>
        </div>
        <button
          type="button"
          class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          data-testid="draft-attachment-details-close"
          @click="close"
        >
          {{ t('common.close') }}
        </button>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <section class="space-y-2 rounded border border-gray-200 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('filePipeline.attachment.details.basic') }}</div>
          <dl class="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt class="text-gray-500">{{ t('filePipeline.attachment.details.fileName') }}</dt><dd class="min-w-0 break-words text-gray-900">{{ props.attachment.filename }}</dd>
            <dt class="text-gray-500">{{ t('filePipeline.attachment.details.extension') }}</dt><dd class="text-gray-900">{{ props.attachment.extension ?? '-' }}</dd>
            <dt class="text-gray-500">{{ t('filePipeline.attachment.details.mime') }}</dt><dd class="break-words text-gray-900">{{ props.attachment.mime ?? '-' }}</dd>
            <dt class="text-gray-500">{{ t('filePipeline.attachment.details.fileType') }}</dt><dd class="text-gray-900">{{ formatMediaLabel(props.attachment) }}</dd>
            <dt class="text-gray-500">{{ t('filePipeline.attachment.details.status') }}</dt><dd class="text-gray-900">{{ formatDisplayStatus(props.attachment.displayStatus) }}</dd>
            <dt class="text-gray-500">{{ t('filePipeline.attachment.details.detection') }}</dt><dd class="text-gray-900">{{ formatDetectionLabel(props.attachment.detectionInfo) }}</dd>
            <dt class="text-gray-500">{{ t('filePipeline.attachment.details.currentSend') }}</dt><dd class="text-gray-900">{{ props.attachment.currentSendModeLabel }}</dd>
            <dt class="text-gray-500">{{ t('filePipeline.attachment.details.sendMode') }}</dt><dd class="text-gray-900">{{ formatSendModePreference(props.attachment.preferredSendMode) }}</dd>
            <dt class="text-gray-500">{{ t('filePipeline.attachment.details.urlRetention') }}</dt><dd class="text-gray-900">{{ formatUrlRetentionPreference(props.attachment.urlRetentionMode) }}</dd>
            <dt class="text-gray-500">{{ t('filePipeline.attachment.details.canRemove') }}</dt><dd class="text-gray-900">{{ props.attachment.canRemove ? t('common.yes') : t('common.no') }}</dd>
          </dl>
        </section>

        <section class="space-y-2 rounded border border-gray-200 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('filePipeline.attachment.details.reasons') }}</div>
          <div class="space-y-2 text-sm">
            <div v-if="props.attachment.warningReason" class="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
              {{ props.attachment.warningReason }}
            </div>
            <div v-if="props.attachment.blockingReason" class="rounded border border-red-200 bg-red-50 p-2 text-red-800">
              {{ props.attachment.blockingReason }}
            </div>
            <div v-if="!props.attachment.warningReason && !props.attachment.blockingReason" class="text-gray-500">
              {{ t('filePipeline.attachment.details.noReasons') }}
            </div>
          </div>

          <div class="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('filePipeline.attachment.details.operations') }}</div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="!props.attachment.retryPreviewAvailable"
              :title="props.attachment.retryPreviewReason ?? ''"
              data-testid="draft-attachment-details-retry"
              @click="emit('retry')"
            >
              {{ props.attachment.retryPreviewLabel }}
            </button>
            <button
              v-if="props.attachment.canRemove"
              type="button"
              class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              data-testid="draft-attachment-details-remove"
              @click="removeAttachment"
            >
              {{ t('common.remove') }}
            </button>
          </div>
        </section>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <section class="space-y-3 rounded border border-gray-200 p-3" data-testid="draft-attachment-dfc-options">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('filePipeline.attachment.details.targetFormat') }}</div>
              <div class="mt-1 text-[11px] text-gray-500">
                {{ t('filePipeline.attachment.details.targetFormatHint') }}
              </div>
            </div>
          </div>
          <div v-if="props.attachment.dfcOptions.loading" class="text-sm text-gray-500" data-testid="draft-attachment-dfc-options-loading">
            {{ t('filePipeline.attachment.details.loading') }}
          </div>
          <div v-else-if="props.attachment.dfcOptions.error" class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800" data-testid="draft-attachment-dfc-options-error">
            {{ props.attachment.dfcOptions.error }}
          </div>
          <div v-else-if="props.attachment.dfcOptions.options.length > 0" class="space-y-2">
            <div class="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600" data-testid="draft-attachment-dfc-defaults">
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <span>{{ t('filePipeline.attachment.details.recommended') }}：{{ formatDfcTargetKind(recommendedDfcTargetKind()) }}</span>
                <span>{{ t('filePipeline.attachment.details.fileTypeDefault') }}<span v-if="props.attachment.dfcOptions.fileTypeKey">（{{ props.attachment.dfcOptions.fileTypeKey }}）</span>：{{ formatDfcTargetKind(props.attachment.dfcOptions.fileTypeDefaultTargetKind) }}</span>
                <span>{{ t('filePipeline.attachment.details.globalDefault') }}：{{ formatDfcTargetKind(props.attachment.dfcOptions.globalDefaultTargetKind) }}</span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="!props.attachment.dfcOptions.fileTypeDefaultOptionId"
                  data-testid="draft-attachment-dfc-apply-file-type-default"
                  @click="applyDfcDefault(props.attachment.dfcOptions.fileTypeDefaultOptionId)"
                >
                  {{ t('filePipeline.attachment.details.useFileTypeDefault') }}
                </button>
                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="!props.attachment.dfcOptions.globalDefaultOptionId"
                  data-testid="draft-attachment-dfc-apply-global-default"
                  @click="applyDfcDefault(props.attachment.dfcOptions.globalDefaultOptionId)"
                >
                  {{ t('filePipeline.attachment.details.useGlobalDefault') }}
                </button>
                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="!props.attachment.dfcOptions.fileTypeDefaultTargetKind"
                  data-testid="draft-attachment-dfc-clear-file-type-default"
                  @click="emit('clear-dfc-default', 'file_type')"
                >
                  {{ t('filePipeline.attachment.details.clearFileTypeDefault') }}
                </button>
                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="!props.attachment.dfcOptions.globalDefaultTargetKind"
                  data-testid="draft-attachment-dfc-clear-global-default"
                  @click="emit('clear-dfc-default', 'global')"
                >
                  {{ t('filePipeline.attachment.details.clearGlobalDefault') }}
                </button>
              </div>
            </div>
            <div
              v-for="option in props.attachment.dfcOptions.options"
              :key="option.optionId"
              class="rounded border p-3 text-sm"
              :class="option.disabled ? 'border-gray-200 bg-gray-50 text-gray-400' : option.selected ? 'border-blue-300 bg-blue-50 text-blue-900' : option.recommended ? 'border-green-300 bg-green-50 text-gray-900' : 'border-gray-200 bg-white text-gray-800'"
              :data-testid="`draft-attachment-dfc-option-${option.targetKind}`"
              role="button"
              :tabindex="option.disabled ? -1 : 0"
              @click="updateDfcOption(option)"
              @keydown.enter.prevent="updateDfcOption(option)"
              @keydown.space.prevent="updateDfcOption(option)"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="font-medium">{{ formatDfcTargetKind(option.targetKind) }}</div>
                  <div class="mt-1 text-[11px] text-gray-500">{{ explainDfcTargetKind(option.targetKind) }}</div>
                </div>
                <div class="flex shrink-0 flex-wrap justify-end gap-1 text-[10px]">
                  <span v-if="option.selected" class="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">{{ t('filePipeline.attachment.details.selected') }}</span>
                  <span v-if="option.recommended" class="rounded-full bg-green-100 px-2 py-0.5 text-green-700">{{ t('filePipeline.attachment.details.recommended') }}</span>
                  <span v-if="option.matchesFileTypeDefault" class="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{{ t('filePipeline.attachment.details.fileTypeDefault') }}</span>
                  <span v-if="option.matchesGlobalDefault" class="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{{ t('filePipeline.attachment.details.globalDefault') }}</span>
                </div>
              </div>
              <div class="mt-2 text-[11px] text-gray-500">
                {{ formatDfcSendStrategy(option.sendStrategy) }} · {{ formatDfcOptionStatus(option.status) }}
                <span v-if="option.compatibilityStatus"> · {{ formatCompatibilityStatus(option.compatibilityStatus) }}</span>
              </div>
              <div v-if="option.recommendationReason" class="mt-1 text-[11px] text-green-700">
                {{ formatDfcRecommendationReason(props.attachment.dfcOptions.recommendedReasonCode) }}
              </div>
              <div v-if="option.disabledReason" class="mt-1 text-[11px] text-gray-500">{{ formatDfcDisabledReason(option.disabledReason) }}</div>
              <div
                v-for="diagnostic in option.diagnostics"
                :key="diagnostic"
                class="mt-1 text-[11px] text-amber-700"
                :data-testid="`draft-attachment-dfc-option-${option.targetKind}-diagnostic`"
              >
                {{ formatDfcDiagnostic(diagnostic) }}
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="option.disabled"
                  :data-testid="`draft-attachment-dfc-use-option-${option.targetKind}`"
                  @click.stop="updateDfcOption(option)"
                >
                  {{ t('filePipeline.attachment.details.useThisFormat') }}
                </button>
                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="option.disabled || !props.attachment.dfcOptions.fileTypeKey"
                  :data-testid="`draft-attachment-dfc-save-file-type-default-${option.targetKind}`"
                  @click.stop="saveDfcDefault('file_type', option)"
                >
                  {{ t('filePipeline.attachment.details.setFileTypeDefault') }}
                </button>
                <button
                  type="button"
                  class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  :disabled="option.disabled"
                  :data-testid="`draft-attachment-dfc-save-global-default-${option.targetKind}`"
                  @click.stop="saveDfcDefault('global', option)"
                >
                  {{ t('filePipeline.attachment.details.setGlobalDefault') }}
                </button>
              </div>
            </div>
          </div>
          <div v-else class="text-sm text-gray-500" data-testid="draft-attachment-dfc-options-empty">
            {{ t('filePipeline.attachment.details.noFormatOptions') }}
          </div>
          <div v-if="props.attachment.dfcOptions.decisionStatus" class="text-[11px] text-gray-500">
            {{ t('filePipeline.attachment.details.selectionStatus') }}：{{ formatDfcDecisionStatus(props.attachment.dfcOptions.decisionStatus) }}
            <span v-if="formatDfcDecisionReason(props.attachment.dfcOptions.decisionReasonCode)"> · {{ formatDfcDecisionReason(props.attachment.dfcOptions.decisionReasonCode) }}</span>
          </div>
        </section>

        <section class="space-y-2 rounded border border-gray-200 p-3" data-testid="draft-attachment-dfc-preview">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('filePipeline.attachment.details.sendPreview') }}</div>
            <div class="mt-1 text-[11px] text-gray-500">{{ t('filePipeline.attachment.details.sendPreviewHint') }}</div>
          </div>
          <div v-if="props.attachment.dfcPreview.loading" class="text-sm text-gray-500" data-testid="draft-attachment-dfc-preview-loading">
            {{ t('filePipeline.attachment.details.loading') }}
          </div>
          <div v-else-if="props.attachment.dfcPreview.error" class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800" data-testid="draft-attachment-dfc-preview-error">
            {{ props.attachment.dfcPreview.error }}
          </div>
          <div v-else class="space-y-2">
            <div class="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
              <span class="text-gray-500">{{ t('filePipeline.attachment.details.status') }}</span>
              <span class="min-w-0 break-words text-gray-900" data-testid="draft-attachment-dfc-preview-status">{{ formatDfcPreviewStatus(props.attachment.dfcPreview.status) }}</span>
              <span class="text-gray-500">{{ t('filePipeline.attachment.details.target') }}</span>
              <span class="min-w-0 break-words text-gray-900">{{ formatDfcTargetKind(props.attachment.dfcPreview.targetKind) }}</span>
              <span class="text-gray-500">{{ t('filePipeline.attachment.details.strategy') }}</span>
              <span class="min-w-0 break-words text-gray-900">{{ formatDfcSendStrategy(props.attachment.dfcPreview.sendStrategy) }}</span>
            </div>
            <pre
              v-if="props.attachment.dfcPreview.kind === 'text' && props.attachment.dfcPreview.text !== null"
              class="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-900"
              data-testid="draft-attachment-dfc-preview-text"
            >{{ props.attachment.dfcPreview.text }}</pre>
            <div
              v-else-if="props.attachment.dfcPreview.kind === 'raw_file'"
              class="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700"
              data-testid="draft-attachment-dfc-preview-raw"
            >
              <span v-if="props.attachment.dfcPreview.targetKind === 'pdf_attachment'">
                {{ t('filePipeline.attachment.details.pdfMetadataPreview') }}
              </span>
              <span v-else>
                {{ t('filePipeline.attachment.details.rawMetadataPreview') }}
              </span>
            </div>
            <div v-else class="text-sm text-gray-500" data-testid="draft-attachment-dfc-preview-empty">
              {{ t('filePipeline.attachment.details.noSelectedPreview') }}
            </div>
            <div v-if="props.attachment.dfcPreview.kind === 'text'" class="text-[11px] text-gray-500">
              {{ tf('filePipeline.attachment.details.chars', { count: props.attachment.dfcPreview.characterCount ?? 0 }) }}
              <span v-if="props.attachment.dfcPreview.byteLength !== null"> · {{ tf('filePipeline.attachment.details.bytes', { count: props.attachment.dfcPreview.byteLength }) }}</span>
              <span v-if="props.attachment.dfcPreview.truncated"> · {{ t('filePipeline.attachment.details.truncated') }}</span>
            </div>
            <div v-if="props.attachment.dfcPreview.diagnostics.length > 0" class="space-y-1">
              <div
                v-for="diagnostic in props.attachment.dfcPreview.diagnostics"
                :key="diagnostic"
                class="text-[11px] text-amber-700"
              >
                {{ formatDfcDiagnostic(diagnostic) }}
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-2 rounded border border-gray-200 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('filePipeline.attachment.details.sendMode') }}</div>
          <div class="text-[11px] text-gray-500">{{ t('filePipeline.attachment.details.sendModeHint') }}</div>
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
                <span v-if="option.value === props.attachment.preferredSendMode" class="text-[11px] text-blue-700">{{ t('filePipeline.attachment.details.selected') }}</span>
              </div>
              <div v-if="option.reason" class="mt-1 text-[11px] text-gray-500">{{ option.reason }}</div>
            </button>
          </div>
        </section>

        <section class="space-y-2 rounded border border-gray-200 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('filePipeline.attachment.details.urlRetention') }}</div>
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
                <span v-if="option.value === props.attachment.urlRetentionMode" class="text-[11px] text-blue-700">{{ t('filePipeline.attachment.details.selected') }}</span>
              </div>
              <div v-if="option.reason" class="mt-1 text-[11px] text-gray-500">{{ option.reason }}</div>
            </button>
          </div>
          <div v-else class="text-sm text-gray-500">{{ t('filePipeline.attachment.details.notUrlBased') }}</div>
        </section>
      </div>

      <section v-if="props.attachment.sourceKind === 'url_import' || props.attachment.originalUrl || props.attachment.resolvedUrl" class="mt-4 space-y-2 rounded border border-gray-200 p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('filePipeline.attachment.details.urlInfo') }}</div>
        <dl class="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt class="text-gray-500">{{ t('filePipeline.attachment.details.originalUrl') }}</dt><dd class="break-words text-gray-900">{{ props.attachment.originalUrl ?? '-' }}</dd>
          <dt class="text-gray-500">{{ t('filePipeline.attachment.details.resolvedUrl') }}</dt><dd class="break-words text-gray-900">{{ props.attachment.resolvedUrl ?? '-' }}</dd>
          <dt class="text-gray-500">{{ t('filePipeline.attachment.details.probeStatus') }}</dt><dd class="text-gray-900">{{ props.attachment.probeStatus ?? '-' }}</dd>
          <dt class="text-gray-500">{{ t('filePipeline.attachment.details.materialization') }}</dt><dd class="text-gray-900">{{ props.attachment.materializationStatus ?? '-' }}</dd>
          <dt class="text-gray-500">{{ t('filePipeline.attachment.details.probeWarning') }}</dt><dd class="break-words text-gray-900">{{ props.attachment.probeWarning ?? '-' }}</dd>
          <dt class="text-gray-500">{{ t('filePipeline.attachment.details.probeType') }}</dt><dd class="break-words text-gray-900">{{ props.attachment.contentTypeFromProbe ?? '-' }}</dd>
          <dt class="text-gray-500">{{ t('filePipeline.attachment.details.probeLength') }}</dt><dd class="text-gray-900">{{ props.attachment.contentLengthFromProbe ?? '-' }}</dd>
          <dt class="text-gray-500">{{ t('filePipeline.attachment.details.localCopy') }}</dt><dd class="text-gray-900">{{ props.attachment.localCopyExists ? t('filePipeline.attachment.details.localCopyExists') : t('filePipeline.attachment.details.localCopyUnavailable') }}</dd>
        </dl>
        <div v-if="props.attachment.probeStatus === 'probe_failed' || props.attachment.materializationStatus === 'materialization_failed'" class="text-xs text-amber-700">
          {{ t('filePipeline.attachment.details.urlProbeFailed') }}
        </div>
      </section>

      <details class="mt-4 rounded border border-gray-200 bg-gray-50 p-3" data-testid="draft-attachment-debug-info">
        <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-600">
          {{ t('filePipeline.attachment.details.advancedInfo') }}
        </summary>
        <div class="mt-2 text-[11px] text-gray-500">{{ t('filePipeline.attachment.details.advancedInfoHint') }}</div>
        <dl class="mt-3 grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <dt class="text-gray-500">assetKind</dt><dd class="break-words text-gray-800">{{ props.attachment.assetKind }}</dd>
          <dt class="text-gray-500">aiPayloadKind</dt><dd class="break-words text-gray-800">{{ props.attachment.aiPayloadKind }}</dd>
          <dt class="text-gray-500">sourceKind</dt><dd class="break-words text-gray-800">{{ props.attachment.sourceKind }}</dd>
          <dt class="text-gray-500">displayStatus</dt><dd class="break-words text-gray-800">{{ props.attachment.displayStatus }}</dd>
          <dt class="text-gray-500">detectionLevel</dt><dd class="break-words text-gray-800">{{ props.attachment.detectionInfo?.detectionLevel ?? '-' }}</dd>
          <dt class="text-gray-500">sendPlanStatus</dt><dd class="break-words text-gray-800">{{ props.attachment.sendPlanStatus ?? '-' }}</dd>
          <dt class="text-gray-500">createdAt</dt><dd class="break-words text-gray-800">{{ props.attachment.createdAt }}</dd>
          <dt class="text-gray-500">updatedAt</dt><dd class="break-words text-gray-800">{{ props.attachment.updatedAt }}</dd>
          <dt class="text-gray-500">lastProbeAt</dt><dd class="break-words text-gray-800">{{ props.attachment.lastProbeAt ?? '-' }}</dd>
          <dt class="text-gray-500">decisionStatus</dt><dd class="break-words text-gray-800">{{ props.attachment.dfcOptions.decisionStatus ?? '-' }}</dd>
          <dt class="text-gray-500">decisionReasonCode</dt><dd class="break-words text-gray-800">{{ props.attachment.dfcOptions.decisionReasonCode ?? '-' }}</dd>
          <dt class="text-gray-500">recommendedReasonCode</dt><dd class="break-words text-gray-800">{{ props.attachment.dfcOptions.recommendedReasonCode ?? '-' }}</dd>
          <dt class="text-gray-500">previewStatus</dt><dd class="break-words text-gray-800">{{ props.attachment.dfcPreview.status ?? '-' }}</dd>
          <dt class="text-gray-500">previewDiagnostics</dt><dd class="break-words text-gray-800">{{ props.attachment.dfcPreview.diagnostics.join(', ') || '-' }}</dd>
        </dl>
        <div v-if="props.attachment.dfcOptions.options.length > 0" class="mt-3 space-y-2">
          <div class="text-xs font-semibold text-gray-600">{{ t('filePipeline.attachment.details.targetFormat') }}</div>
          <div
            v-for="option in props.attachment.dfcOptions.options"
            :key="`debug-${option.optionId}`"
            class="rounded border border-gray-200 bg-white p-2 text-xs text-gray-700"
          >
            <div class="font-medium">{{ formatDfcTargetKind(option.targetKind) }}</div>
            <dl class="mt-1 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-2 gap-y-1">
              <dt class="text-gray-500">targetKind</dt><dd class="break-words">{{ option.targetKind }}</dd>
              <dt class="text-gray-500">sendStrategy</dt><dd class="break-words">{{ option.sendStrategy }}</dd>
              <dt class="text-gray-500">status</dt><dd class="break-words">{{ option.status }}</dd>
              <dt class="text-gray-500">compatibilityStatus</dt><dd class="break-words">{{ option.compatibilityStatus ?? '-' }}</dd>
              <dt class="text-gray-500">disabledReason</dt><dd class="break-words">{{ option.disabledReason ?? '-' }}</dd>
              <dt class="text-gray-500">diagnostics</dt><dd class="break-words">{{ option.diagnostics.join(', ') || '-' }}</dd>
            </dl>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

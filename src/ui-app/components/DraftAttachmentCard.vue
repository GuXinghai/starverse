<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/shared/i18n'

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

type DraftAttachmentCardViewModel = Readonly<{
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
  fileTypeInfo: Readonly<{
    formatId: string
    kind: string
    confidenceLevel: string
    recommendedRoute: string | null
    recommendedRouteLabelCode: string | null
    compatibility: 'compatible' | 'warning' | 'blocked' | 'unknown'
    blocked: boolean
    requiresJob: boolean
    engineUnavailable: boolean
    hasConflicts: boolean
    hasExtensionMimeConflict: boolean
    warningLabelCodes: string[]
    blockedLabelCodes: string[]
    blockedBy: string[]
  }> | null
  detectionInfo: Readonly<{
    routeEligibility: 'verdict_ready' | 'detection_pending' | 'detection_failed' | 'detection_required'
    detectionLevel: 'basic' | 'advanced' | 'parser_validated' | null
    engineMode: 'core_only' | 'core_plus_magika' | 'core_plus_parser' | 'core_plus_external' | null
    usedMagika: boolean
    magikaState: 'not_installed' | 'disabled' | 'unavailable' | 'available' | 'failed' | 'not_requested'
    evidenceSources: string[]
    decisiveEvidenceSource: string | null
    detectionTrigger: string | null
    magikaModelVersion: string | null
    advancedAttempted: boolean
    advancedFailureReason: string | null
  }> | null
  previewDataUrl: string | null
  canRemove: boolean
}>

const props = defineProps<{
  attachment: DraftAttachmentCardViewModel
}>()

const emit = defineEmits<{
  (e: 'remove', assetId: string): void
  (e: 'open-details', assetId: string): void
}>()

const statusLabel = computed(() => {
  if (props.attachment.displayStatus === 'detection_pending') return t('filePipeline.displayStatus.detectionPending')
  if (props.attachment.displayStatus === 'detection_required') return t('filePipeline.displayStatus.detectionRequired')
  if (props.attachment.displayStatus === 'detection_failed') return t('filePipeline.displayStatus.detectionFailed')
  if (props.attachment.displayStatus === 'parsing') return t('filePipeline.displayStatus.parsing')
  if (props.attachment.displayStatus === 'ready') return t('filePipeline.displayStatus.ready')
  if (props.attachment.displayStatus === 'ready_with_warnings') return t('filePipeline.displayStatus.readyWithWarnings')
  if (props.attachment.displayStatus === 'incompatible_with_current_model') return t('filePipeline.displayStatus.incompatible')
  if (props.attachment.displayStatus === 'failed') return t('filePipeline.displayStatus.failed')
  if (props.attachment.displayStatus === 'unsupported') return t('filePipeline.displayStatus.unsupported')
  return t('filePipeline.displayStatus.ready')
})

const toneClass = computed(() => {
  if (props.attachment.borderTone === 'green') return 'border-green-300 bg-green-50'
  if (props.attachment.borderTone === 'yellow') return 'border-amber-300 bg-amber-50'
  if (props.attachment.borderTone === 'red') return 'border-red-300 bg-red-50'
  return 'border-gray-200 bg-white'
})

const textToneClass = computed(() => {
  if (props.attachment.borderTone === 'green') return 'text-green-700'
  if (props.attachment.borderTone === 'yellow') return 'text-amber-700'
  if (props.attachment.borderTone === 'red') return 'text-red-700'
  return 'text-gray-600'
})

const dotToneClass = computed(() => {
  if (props.attachment.borderTone === 'green') return 'bg-green-500'
  if (props.attachment.borderTone === 'yellow') return 'bg-amber-500'
  if (props.attachment.borderTone === 'red') return 'bg-red-500'
  return 'bg-gray-400'
})

const mediaLabel = computed(() => {
  if (props.attachment.sourceKind.trim() === 'url_import') return t('filePipeline.attachment.media.url')
  if (props.attachment.aiPayloadKind === 'pdf') return t('filePipeline.attachment.media.pdf')
  if (props.attachment.aiPayloadKind === 'text') return t('filePipeline.attachment.media.text')
  if (props.attachment.aiPayloadKind === 'audio') return t('filePipeline.attachment.media.audio')
  if (props.attachment.aiPayloadKind === 'video') return t('filePipeline.attachment.media.video')
  if (props.attachment.aiPayloadKind === 'binary') return t('filePipeline.attachment.media.binary')
  return t('filePipeline.attachment.media.file')
})

function normalizeLabelCode(value: string | null): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const lastDot = normalized.lastIndexOf('.')
  return lastDot >= 0 ? normalized.slice(lastDot + 1) : normalized
}

const fileTypeHint = computed(() => props.attachment.fileTypeInfo)
const detectionInfo = computed(() => props.attachment.detectionInfo)
const recommendedRouteLabel = computed(() => formatRouteLabel(fileTypeHint.value?.recommendedRouteLabelCode ?? fileTypeHint.value?.recommendedRoute ?? null))
const compatibilityLabel = computed(() => {
  const compatibility = fileTypeHint.value?.compatibility ?? 'unknown'
  if (compatibility === 'blocked') return t('filePipeline.attachment.compatibility.blocked')
  if (compatibility === 'warning') return t('filePipeline.attachment.compatibility.warning')
  if (compatibility === 'compatible') return t('filePipeline.attachment.compatibility.compatible')
  return t('filePipeline.attachment.compatibility.unknown')
})

function formatRouteLabel(value: string | null): string | null {
  const code = normalizeLabelCode(value)
  if (!code) return null
  if (code === 'direct_text') return t('filePipeline.attachment.routeLabel.directText')
  if (code === 'direct_image') return t('filePipeline.attachment.routeLabel.directImage')
  if (code === 'direct_audio') return t('filePipeline.attachment.routeLabel.directAudio')
  if (code === 'direct_video') return t('filePipeline.attachment.routeLabel.directVideo')
  if (code === 'direct_file') return t('filePipeline.attachment.routeLabel.directFile')
  if (code === 'converted_markdown') return t('filePipeline.attachment.routeLabel.convertedMarkdown')
  if (code === 'converted_plain_text') return t('filePipeline.attachment.routeLabel.convertedPlainText')
  if (code === 'converted_csv') return t('filePipeline.attachment.routeLabel.convertedCsv')
  if (code === 'converted_tsv') return t('filePipeline.attachment.routeLabel.convertedTsv')
  if (code === 'converted_pdf') return t('filePipeline.attachment.routeLabel.convertedPdf')
  if (code === 'rendered_images') return t('filePipeline.attachment.routeLabel.renderedImages')
  if (code === 'extracted_text') return t('filePipeline.attachment.routeLabel.extractedText')
  if (code === 'extracted_audio') return t('filePipeline.attachment.routeLabel.extractedAudio')
  if (code === 'selected_frames') return t('filePipeline.attachment.routeLabel.selectedFrames')
  if (code === 'blocked') return t('filePipeline.attachment.routeLabel.blocked')
  if (code === 'ask_user') return t('filePipeline.attachment.routeLabel.askUser')
  if (code === 'skip') return t('filePipeline.attachment.routeLabel.skip')
  return null
}

const tooltipText = computed(() => {
  const lines = [
    props.attachment.filename,
    `${t('filePipeline.attachment.tooltip.type')}：${mediaLabel.value}${props.attachment.extension ? ` / ${props.attachment.extension}` : ''}`,
    `${t('filePipeline.attachment.tooltip.status')}：${statusLabel.value}`,
  ]
  if (recommendedRouteLabel.value) lines.push(`${t('filePipeline.attachment.tooltip.recommendedRoute')}：${recommendedRouteLabel.value}`)
  if (fileTypeHint.value && fileTypeHint.value.compatibility !== 'unknown') lines.push(`${t('filePipeline.attachment.tooltip.compatibility')}：${compatibilityLabel.value}`)
  if (props.attachment.warningReason) lines.push(`${t('filePipeline.attachment.tooltip.warning')}：${props.attachment.warningReason}`)
  if (props.attachment.blockingReason) lines.push(`${t('filePipeline.attachment.tooltip.blocked')}：${props.attachment.blockingReason}`)
  if (detectionLabel.value) lines.push(`${t('filePipeline.attachment.tooltip.detection')}：${detectionLabel.value}`)
  return lines.join('\n')
})

const detectionLabel = computed(() => {
  const detection = detectionInfo.value
  if (!detection) return null
  if (detection.routeEligibility === 'detection_pending' || detection.routeEligibility === 'detection_required') return t('filePipeline.attachment.detectionLabel.pending')
  if (detection.routeEligibility === 'detection_failed') {
    return detection.advancedAttempted ? t('filePipeline.attachment.detectionLabel.advancedFailed') : t('filePipeline.attachment.detectionLabel.failed')
  }
  if (detection.detectionLevel === 'advanced' && detection.usedMagika) return t('filePipeline.attachment.detectionLabel.advancedMagika')
  if (detection.detectionLevel === 'parser_validated') return t('filePipeline.attachment.detectionLabel.parserValidated')
  if (detection.detectionLevel === 'advanced') return t('filePipeline.attachment.detectionLabel.advanced')
  if (detection.detectionLevel === 'basic') return t('filePipeline.attachment.detectionLabel.basic')
  return t('filePipeline.attachment.detectionLabel.pending')
})

function removeAttachment() {
  if (!props.attachment.canRemove) return
  emit('remove', props.attachment.assetId)
}

function openDetails() {
  emit('open-details', props.attachment.assetId)
}
</script>

<template>
  <div
    class="group relative flex min-w-0 max-w-[14rem] cursor-pointer items-center gap-2 overflow-visible rounded-full border px-2.5 py-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    :class="[toneClass, props.attachment.isParsing ? 'opacity-70 grayscale' : '']"
    :data-testid="`draft-attachment-card-${props.attachment.assetId}`"
    role="button"
    tabindex="0"
    :title="tooltipText"
    :aria-label="tooltipText"
    @click="openDetails"
    @keydown.enter.prevent="openDetails"
    @keydown.space.prevent="openDetails"
  >
    <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="dotToneClass" aria-hidden="true"></span>
    <div class="flex min-w-0 items-center gap-2">
      <div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-white">
        <img
          v-if="props.attachment.previewDataUrl"
          :src="props.attachment.previewDataUrl"
          class="h-full w-full object-cover"
          alt=""
          draggable="false"
          data-testid="draft-attachment-preview"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-gray-500"
          data-testid="draft-attachment-placeholder"
        >
          {{ mediaLabel }}
        </div>
      </div>

      <div class="min-w-0">
        <div class="truncate text-xs font-semibold uppercase tracking-wide text-gray-900">
          {{ mediaLabel }}<span v-if="props.attachment.extension"> / {{ props.attachment.extension }}</span>
        </div>
        <div class="truncate text-[10px]" :class="textToneClass">{{ statusLabel }}</div>
      </div>
    </div>
    <button
      v-if="props.attachment.canRemove"
      type="button"
      class="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-xs leading-none text-gray-700 hover:bg-gray-50"
      :data-testid="`draft-attachment-remove-${props.attachment.assetId}`"
      :title="t('composer.actions.removeAttachment')"
      @click.stop="removeAttachment"
    >
      x
    </button>
    <div
      class="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 whitespace-pre-line rounded border border-gray-200 bg-white p-2 text-xs leading-5 text-gray-700 shadow-lg group-hover:block group-focus:block"
      data-testid="draft-attachment-tooltip"
    >
      {{ tooltipText }}
    </div>
  </div>
</template>

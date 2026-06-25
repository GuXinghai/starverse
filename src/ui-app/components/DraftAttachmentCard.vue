<script setup lang="ts">
import { computed } from 'vue'

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
  if (props.attachment.displayStatus === 'detection_pending') return '待检测'
  if (props.attachment.displayStatus === 'detection_required') return '待检测'
  if (props.attachment.displayStatus === 'detection_failed') return '检测失败'
  const value = props.attachment.displayStatus.replace(/_/g, ' ')
  return value.length > 0 ? value : 'ready'
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
  if (props.attachment.sourceKind.trim() === 'url_import') return 'URL'
  if (props.attachment.aiPayloadKind === 'pdf') return 'PDF'
  if (props.attachment.aiPayloadKind === 'text') return 'TXT'
  if (props.attachment.aiPayloadKind === 'audio') return 'AUDIO'
  if (props.attachment.aiPayloadKind === 'video') return 'VIDEO'
  if (props.attachment.aiPayloadKind === 'binary') return 'FILE'
  return props.attachment.aiPayloadKind.toUpperCase()
})

function normalizeLabelCode(value: string | null): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const lastDot = normalized.lastIndexOf('.')
  return lastDot >= 0 ? normalized.slice(lastDot + 1) : normalized
}

const fileTypeHint = computed(() => props.attachment.fileTypeInfo)
const detectionInfo = computed(() => props.attachment.detectionInfo)
const recommendedRouteLabel = computed(() => normalizeLabelCode(fileTypeHint.value?.recommendedRouteLabelCode ?? null))
const compatibilityLabel = computed(() => {
  const compatibility = fileTypeHint.value?.compatibility ?? 'unknown'
  if (compatibility === 'blocked') return 'blocked'
  if (compatibility === 'warning') return 'warning'
  if (compatibility === 'compatible') return 'compatible'
  return 'unknown'
})

const tooltipText = computed(() => {
  const lines = [
    props.attachment.filename,
    `Type: ${mediaLabel.value}${props.attachment.extension ? ` / ${props.attachment.extension}` : ''}`,
    `Status: ${statusLabel.value}`,
  ]
  if (recommendedRouteLabel.value) lines.push(`Recommended route: ${recommendedRouteLabel.value}`)
  if (compatibilityLabel.value !== 'unknown') lines.push(`Compatibility: ${compatibilityLabel.value}`)
  if (props.attachment.warningReason) lines.push(`Warning: ${props.attachment.warningReason}`)
  if (props.attachment.blockingReason) lines.push(`Blocked: ${props.attachment.blockingReason}`)
  if (detectionLabel.value) lines.push(`Detection: ${detectionLabel.value}`)
  return lines.join('\n')
})

const detectionLabel = computed(() => {
  const detection = detectionInfo.value
  if (!detection) return null
  if (detection.routeEligibility === 'detection_pending' || detection.routeEligibility === 'detection_required') return '待检测'
  if (detection.routeEligibility === 'detection_failed') {
    return detection.advancedAttempted ? '高级检测失败 / Magika 检测失败' : '检测失败'
  }
  if (detection.detectionLevel === 'advanced' && detection.usedMagika) return '高级检测 · Magika'
  if (detection.detectionLevel === 'basic') return '基础检测'
  return '待检测'
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
      title="Remove attachment"
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

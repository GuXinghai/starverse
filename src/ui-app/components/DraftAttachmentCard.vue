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

const detectionDetail = computed(() => {
  const detection = detectionInfo.value
  if (!detection) return null
  const parts = [
    `detectionLevel=${detection.detectionLevel ?? 'n/a'}`,
    `usedMagika=${String(detection.usedMagika)}`,
    `magikaState=${detection.magikaState}`,
    `evidenceSources=${detection.evidenceSources.length ? detection.evidenceSources.join(',') : 'none'}`,
    `decisiveEvidenceSource=${detection.decisiveEvidenceSource ?? 'n/a'}`,
  ]
  if (detection.magikaModelVersion) parts.push(`magikaModelVersion=${detection.magikaModelVersion}`)
  if (detection.advancedFailureReason) parts.push(`advancedFailureReason=${detection.advancedFailureReason}`)
  return parts.join(' · ')
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
    class="relative flex w-[18rem] min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    :class="[toneClass, props.attachment.isParsing ? 'opacity-70 grayscale' : '']"
    :data-testid="`draft-attachment-card-${props.attachment.assetId}`"
    role="button"
    tabindex="0"
    @click="openDetails"
    @keydown.enter.prevent="openDetails"
    @keydown.space.prevent="openDetails"
  >
    <div class="flex items-start gap-3 p-2.5">
      <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white">
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
          class="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500"
          data-testid="draft-attachment-placeholder"
        >
          <div class="text-sm leading-none">▣</div>
          <div>{{ mediaLabel }}</div>
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate text-xs font-semibold text-gray-900" :title="props.attachment.filename">
              {{ props.attachment.filename }}
            </div>
            <div class="mt-0.5 text-[11px] text-gray-500">
              {{ props.attachment.sourceKind }}
              <span v-if="props.attachment.extension"> · {{ props.attachment.extension }}</span>
            </div>
          </div>
          <button
            v-if="props.attachment.canRemove"
            type="button"
            class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
            :data-testid="`draft-attachment-remove-${props.attachment.assetId}`"
            @click.stop="removeAttachment"
          >
            Remove
          </button>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span class="rounded-full border px-2 py-0.5 font-medium uppercase tracking-wide" :class="textToneClass">
            {{ statusLabel }}
          </span>
          <span class="text-gray-500">#{{ props.attachment.assetId }}</span>
        </div>

        <div v-if="props.attachment.warningReason" class="mt-1 text-[11px] text-amber-700">
          {{ props.attachment.warningReason }}
        </div>
        <div v-else-if="props.attachment.blockingReason" class="mt-1 text-[11px] text-red-700">
          {{ props.attachment.blockingReason }}
        </div>
        <div
          v-if="detectionLabel"
          class="mt-1.5 text-[11px]"
          :class="detectionInfo?.routeEligibility === 'detection_failed' ? 'text-red-700' : 'text-gray-600'"
          :title="detectionDetail ?? undefined"
        >
          {{ detectionLabel }}
        </div>
        <div v-if="fileTypeHint" class="mt-1.5 space-y-0.5 text-[11px] text-gray-600">
          <div>
            type: {{ fileTypeHint.formatId }} · {{ fileTypeHint.confidenceLevel }}
          </div>
          <div>
            route: {{ recommendedRouteLabel ?? 'n/a' }} · {{ compatibilityLabel }}
            <span v-if="fileTypeHint.requiresJob"> · needs-job</span>
            <span v-if="fileTypeHint.engineUnavailable"> · engine-unavailable</span>
          </div>
          <div v-if="fileTypeHint.hasConflicts || fileTypeHint.hasExtensionMimeConflict" class="text-amber-700">
            type conflict detected
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

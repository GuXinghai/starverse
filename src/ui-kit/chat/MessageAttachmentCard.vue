<script setup lang="ts">
import { computed } from 'vue'
import type { MessageAttachmentVM } from './types'
import { t } from '@/shared/i18n'

const props = defineProps<{
  attachment: MessageAttachmentVM
}>()

const statusLabel = computed(() => {
  if (props.attachment.displayStatus === 'parsing') return t('filePipeline.displayStatus.parsing')
  if (props.attachment.displayStatus === 'detection_pending') return t('filePipeline.displayStatus.detectionPending')
  if (props.attachment.displayStatus === 'detection_failed') return t('filePipeline.displayStatus.detectionFailed')
  if (props.attachment.displayStatus === 'detection_required') return t('filePipeline.displayStatus.detectionRequired')
  if (props.attachment.displayStatus === 'ready') return t('filePipeline.displayStatus.ready')
  if (props.attachment.displayStatus === 'ready_with_warnings') return t('filePipeline.displayStatus.readyWithWarnings')
  if (props.attachment.displayStatus === 'incompatible_with_current_model') return t('filePipeline.displayStatus.incompatible')
  if (props.attachment.displayStatus === 'failed') return t('filePipeline.displayStatus.failed')
  if (props.attachment.displayStatus === 'unsupported') return t('filePipeline.displayStatus.unsupported')
  if (props.attachment.displayStatus === 'excluded_from_current_context') return t('chat.attachment.excluded')
  return String(props.attachment.displayStatus).replace(/_/g, ' ')
})

const toneClass = computed(() => {
  if (props.attachment.borderTone === 'yellow') return 'border-[var(--sv-warning-line)]'
  if (props.attachment.borderTone === 'red') return 'border-[var(--sv-danger-line)]'
  return 'border-gray-200'
})

const textToneClass = computed(() => {
  if (props.attachment.borderTone === 'yellow') return 'text-[var(--sv-warning)]'
  if (props.attachment.borderTone === 'red') return 'text-[var(--sv-danger)]'
  return 'text-gray-600'
})

const activeClass = computed(() =>
  props.attachment.isActiveLocatedAttachment ? 'ring-2 ring-gray-900 ring-offset-2' : '',
)

const iconLabel = computed(() => {
  switch (props.attachment.iconKind) {
    case 'image':
      return 'IMG'
    case 'pdf':
      return 'PDF'
    case 'text':
      return 'TXT'
    case 'link':
      return 'URL'
    case 'audio':
      return 'AUD'
    case 'video':
      return 'VID'
    default:
      return 'FILE'
  }
})

const subtitle = computed(() => {
  const parts: string[] = []
  if (props.attachment.iconKind === 'link') parts.push(t('chat.attachment.link'))
  if (props.attachment.sourceKind === 'url_import') parts.push('URL')
  else if (props.attachment.sourceKind && props.attachment.sourceKind !== 'unknown') parts.push(props.attachment.sourceKind)
  if (props.attachment.extension) parts.push(props.attachment.extension)
  if (parts.length === 0) parts.push(props.attachment.assetKind)
  return parts.join(' · ')
})

function normalizeLabelCode(value: string | null): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const lastDot = normalized.lastIndexOf('.')
  return lastDot >= 0 ? normalized.slice(lastDot + 1) : normalized
}

const fileTypeHint = computed(() => props.attachment.fileTypeInfo ?? null)
const recommendedRouteLabel = computed(() => normalizeLabelCode(fileTypeHint.value?.recommendedRouteLabelCode ?? null))
const compatibilityLabel = computed(() => {
  const compatibility = fileTypeHint.value?.compatibility ?? 'unknown'
  if (compatibility === 'blocked') return t('chat.attachment.compatibility.blocked')
  if (compatibility === 'warning') return t('chat.attachment.compatibility.warning')
  if (compatibility === 'compatible') return t('chat.attachment.compatibility.compatible')
  return t('chat.attachment.compatibility.unknown')
})
</script>

<template>
  <button
    type="button"
    class="relative flex w-[18rem] min-w-0 max-w-full cursor-default flex-col overflow-hidden rounded-xl border bg-white text-left"
    :class="[toneClass, activeClass, props.attachment.displayStatus === 'parsing' ? 'opacity-80 grayscale' : '']"
    :data-testid="`history-attachment-card-${props.attachment.attachmentId}`"
    @click.stop
  >
    <div class="flex items-start gap-3 p-2.5">
      <div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
        <img
          v-if="props.attachment.previewDataUrl && props.attachment.iconKind === 'image'"
          :src="props.attachment.previewDataUrl"
          class="h-full w-full object-cover"
          alt=""
          draggable="false"
          :data-testid="`history-attachment-preview-${props.attachment.attachmentId}`"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center text-xs font-medium text-gray-500"
          :data-testid="`history-attachment-placeholder-${props.attachment.attachmentId}`"
        >
          {{ iconLabel }}
        </div>
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="min-w-0">
          <div class="truncate text-[13px] font-medium text-gray-900" :title="props.attachment.filename">
            {{ props.attachment.filename }}
          </div>
          <div class="text-xs text-gray-500">
            {{ subtitle }}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span :class="textToneClass">
            {{ statusLabel }}
          </span>
          <span v-if="props.attachment.isHistoryIncompatible" class="text-[var(--sv-danger)]">
            {{ t('chat.attachment.history') }}
          </span>
        </div>

        <div v-if="props.attachment.incompatibilityReason" class="text-xs text-[var(--sv-danger)]">
          {{ props.attachment.incompatibilityReason }}
        </div>
        <div v-if="fileTypeHint" class="flex flex-col gap-0.5 text-xs text-gray-500">
          <div>
            {{ t('chat.attachment.type') }}: {{ fileTypeHint.formatId }} · {{ fileTypeHint.confidenceLevel }}
          </div>
          <div>
            {{ t('chat.attachment.route') }}: {{ recommendedRouteLabel ?? t('chat.attachment.notAvailable') }} · {{ compatibilityLabel }}
            <span v-if="fileTypeHint.requiresJob"> · {{ t('chat.attachment.needsJob') }}</span>
            <span v-if="fileTypeHint.engineUnavailable"> · {{ t('chat.attachment.engineUnavailable') }}</span>
          </div>
          <div v-if="fileTypeHint.hasConflicts || fileTypeHint.hasExtensionMimeConflict" class="text-[var(--sv-warning)]">
            {{ t('chat.attachment.typeConflictDetected') }}
          </div>
        </div>
      </div>
    </div>
  </button>
</template>

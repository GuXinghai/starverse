<script setup lang="ts">
import { computed } from 'vue'
import type { MessageAttachmentVM } from './types'

const props = defineProps<{
  attachment: MessageAttachmentVM
}>()

const statusLabel = computed(() => props.attachment.displayStatus.replace(/_/g, ' '))

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

const activeClass = computed(() =>
  props.attachment.isActiveLocatedAttachment
    ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-gray-50 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]'
    : '',
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
  if (props.attachment.iconKind === 'link') parts.push('Link')
  if (props.attachment.sourceKind === 'url_import') parts.push('URL')
  else if (props.attachment.sourceKind && props.attachment.sourceKind !== 'unknown') parts.push(props.attachment.sourceKind)
  if (props.attachment.extension) parts.push(props.attachment.extension)
  if (parts.length === 0) parts.push(props.attachment.assetKind)
  return parts.join(' · ')
})
</script>

<template>
  <button
    type="button"
    class="relative flex w-[18rem] min-w-0 cursor-default flex-col overflow-hidden rounded-lg border text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    :class="[toneClass, activeClass, props.attachment.displayStatus === 'parsing' ? 'opacity-80 grayscale' : '']"
    :data-testid="`history-attachment-card-${props.attachment.attachmentId}`"
    @click.stop
  >
    <div class="flex items-start gap-3 p-2.5">
      <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white">
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
          class="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500"
          :data-testid="`history-attachment-placeholder-${props.attachment.attachmentId}`"
        >
          <div class="text-sm leading-none">{{ iconLabel }}</div>
          <div>{{ props.attachment.iconKind }}</div>
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <div class="min-w-0">
          <div class="truncate text-xs font-semibold text-gray-900" :title="props.attachment.filename">
            {{ props.attachment.filename }}
          </div>
          <div class="mt-0.5 text-[11px] text-gray-500">
            {{ subtitle }}
          </div>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span class="rounded-full border px-2 py-0.5 font-medium uppercase tracking-wide" :class="textToneClass">
            {{ statusLabel }}
          </span>
          <span v-if="props.attachment.isHistoryIncompatible" class="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-medium uppercase tracking-wide text-red-700">
            history
          </span>
        </div>

        <div v-if="props.attachment.incompatibilityReason" class="mt-1 text-[11px] text-red-700">
          {{ props.attachment.incompatibilityReason }}
        </div>
      </div>
    </div>
  </button>
</template>

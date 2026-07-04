<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import type { ReasoningDisplayBlock, ReasoningView, ReasoningPiece } from '@/next/state/types'
import ReasoningRichText from '@/ui-kit/chat/ReasoningRichText.vue'
import { t } from '@/shared/i18n'

const props = withDefaults(
  defineProps<{
    messageId?: string | null
    reasoningView: ReasoningView | null
    reasoningPieces?: ReasoningPiece[] | null
    collapsed: boolean
    displayMode?: 'inline' | 'rail'
    isStreaming?: boolean
  }>(),
  {
    displayMode: 'inline',
    isStreaming: false,
  },
)

const emit = defineEmits<{
  (e: 'toggle'): void
}>()

const pressStartedAt = ref<number | null>(null)
const LONG_PRESS_MS = 450

function onPressStart() {
  pressStartedAt.value = Date.now()
}

function onPressEnd() {
  const startedAt = pressStartedAt.value
  pressStartedAt.value = null
  if (startedAt === null) return
  if (Date.now() - startedAt >= LONG_PRESS_MS) return
  emit('toggle')
}

function onPressCancel() {
  pressStartedAt.value = null
}

const indicator = computed(() => {
  if (props.displayMode === 'rail') return props.collapsed ? '<' : '>'
  return props.collapsed ? 'v' : '^'
})

const reasoningPieces = computed(() => {
  const pieces = props.reasoningPieces ?? props.reasoningView?.reasoningPieces
  if (!Array.isArray(pieces)) return []
  return pieces.filter((piece) => {
    if (piece?.type === 'text') return piece.text.trim().length > 0
    if (piece?.type === 'image') return piece.url.trim().length > 0
    return false
  })
})

const displayBlocks = computed(() => {
  const blocks = props.reasoningView?.displayBlocks
  if (!Array.isArray(blocks)) return []
  return blocks.filter((block) => {
    if (block?.type === 'text') return block.text.trim().length > 0
    if (block?.type === 'image') return block.url.trim().length > 0
    if (block?.type === 'opaque') return block.label.trim().length > 0
    return false
  })
})

const hasReasoningPayload = computed(() => {
  return Boolean(
    displayBlocks.value.length > 0 ||
    props.reasoningView?.summaryText ||
    props.reasoningView?.reasoningText ||
    reasoningPieces.value.length > 0
  )
})

const shouldRenderStandaloneText = computed(() => reasoningPieces.value.length === 0 && displayBlocks.value.length === 0)

const reasoningBodyText = computed(() => {
  if (!shouldRenderStandaloneText.value) return ''
  const parts: string[] = []
  const reasoningText = props.reasoningView?.reasoningText
  if (typeof reasoningText === 'string' && reasoningText.trim().length > 0) {
    parts.push(reasoningText)
  }
  return parts.join('\n\n')
})

function summarizeReasoningPiece(piece: ReasoningPiece, index: number) {
  if (piece.type === 'image') {
    return {
      index,
      id: piece.id,
      type: piece.type,
      urlKind: piece.url.startsWith('asset://') ? 'asset' : piece.url.startsWith('data:image/') ? 'data-image' : 'other',
      mimeType: piece.mimeType,
    }
  }
  return {
    index,
    id: piece.id,
    type: piece.type,
    textLen: piece.text.length,
    textPreview: piece.text.slice(0, 80),
  }
}

function summarizeDisplayBlock(block: ReasoningDisplayBlock, index: number) {
  if (block.type === 'text') {
    return { index, blockId: block.blockId, ordinal: block.ordinal, type: block.type, textLen: block.text.length, textPreview: block.text.slice(0, 80) }
  }
  if (block.type === 'image') {
    return {
      index,
      blockId: block.blockId,
      ordinal: block.ordinal,
      type: block.type,
      urlKind: block.url.startsWith('asset://') ? 'asset' : block.url.startsWith('data:image/') ? 'data-image' : 'other',
      mimeType: block.mimeType,
    }
  }
  return { index, blockId: block.blockId, ordinal: block.ordinal, type: block.type, label: block.label }
}

watchEffect(() => {
  if (typeof import.meta !== 'undefined' && !(import.meta as any).env?.DEV) return
  const pieces = reasoningPieces.value
  const blocks = displayBlocks.value
  const hasImagePiece = pieces.some((piece) => piece.type === 'image')
  const hasImageBlock = blocks.some((block) => block.type === 'image')
  const summaryText = props.reasoningView?.summaryText ?? ''
  if (!hasImagePiece && !hasImageBlock && !(summaryText.length > 0 && (pieces.length > 0 || blocks.length > 0))) return
  console.warn('[reasoning-render-trace]', {
    component: 'ChatInlineReasoning',
    messageId: props.messageId ?? null,
    collapsed: props.collapsed,
    displayMode: props.displayMode,
    isStreaming: props.isStreaming,
    visibility: props.reasoningView?.visibility,
    summaryTextLen: summaryText.length,
    summaryTextPreview: summaryText.slice(0, 120),
    reasoningTextLen: props.reasoningView?.reasoningText?.length ?? 0,
    piecesSource: props.reasoningPieces ? 'prop' : 'reasoningView',
    displayBlocks: blocks.map(summarizeDisplayBlock),
    pieces: pieces.map(summarizeReasoningPiece),
  })
})
</script>

<template>
  <div class="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 text-left text-[11px] font-medium text-gray-700"
      @mousedown="onPressStart"
      @mouseup="onPressEnd"
      @mouseleave="onPressCancel"
      @touchstart.passive="onPressStart"
      @touchend="onPressEnd"
      @touchcancel="onPressCancel"
    >
      <span>{{ t('chat.reasoning.title') }}</span>
      <span aria-hidden="true">{{ indicator }}</span>
    </button>

    <div v-if="props.displayMode === 'inline' && !props.collapsed" class="mt-2 space-y-2 text-xs text-gray-600">
      <ReasoningRichText
        v-if="shouldRenderStandaloneText && props.reasoningView?.summaryText"
        :text="props.reasoningView.summaryText"
        :streaming="props.isStreaming"
      />
      <ReasoningRichText
        v-if="reasoningBodyText"
        :text="reasoningBodyText"
        :streaming="props.isStreaming"
      />
      <template v-for="block in displayBlocks" :key="block.blockId">
        <ReasoningRichText
          v-if="block.type === 'text'"
          :text="block.text"
          :streaming="props.isStreaming"
        />
        <img
          v-if="block.type === 'image'"
          :src="block.url"
          class="max-h-72 max-w-full rounded border border-gray-200 object-contain"
          alt=""
        />
        <div
          v-if="block.type === 'opaque'"
          class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
        >
          {{ block.label }}
        </div>
      </template>
      <template v-if="displayBlocks.length === 0" v-for="piece in reasoningPieces" :key="piece.id">
        <ReasoningRichText
          v-if="piece.type === 'text'"
          :text="piece.text"
          :streaming="props.isStreaming"
        />
        <img
          v-if="piece.type === 'image'"
          :src="piece.url"
          class="max-h-72 max-w-full rounded border border-gray-200 object-contain"
          alt=""
        />
      </template>
      <div v-if="!hasReasoningPayload">
        {{ t('chat.reasoning.emptyPayload') }}
      </div>
    </div>
  </div>
</template>

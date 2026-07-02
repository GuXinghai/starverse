<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ReasoningView, ReasoningPiece } from '@/next/state/types'
import ReasoningRichText from '@/ui-kit/chat/ReasoningRichText.vue'

const props = withDefaults(
  defineProps<{
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
  return pieces.filter((piece) => typeof piece?.text === 'string' && piece.text.trim().length > 0)
})

const hasReasoningPayload = computed(() => {
  return Boolean(
    props.reasoningView?.summaryText ||
    props.reasoningView?.reasoningText ||
    reasoningPieces.value.length > 0
  )
})

const reasoningBodyText = computed(() => {
  const parts: string[] = []
  const reasoningText = props.reasoningView?.reasoningText
  if (typeof reasoningText === 'string' && reasoningText.trim().length > 0) {
    parts.push(reasoningText)
  }
  if (reasoningPieces.value.length > 0) {
    parts.push(reasoningPieces.value.map((piece) => piece.text).join(''))
  }
  return parts.join('\n\n')
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
      <span>Reasoning</span>
      <span aria-hidden="true">{{ indicator }}</span>
    </button>

    <div v-if="props.displayMode === 'inline' && !props.collapsed" class="mt-2 space-y-2 text-xs text-gray-600">
      <ReasoningRichText
        v-if="props.reasoningView?.summaryText"
        :text="props.reasoningView.summaryText"
        :streaming="props.isStreaming"
      />
      <ReasoningRichText
        v-if="reasoningBodyText"
        :text="reasoningBodyText"
        :streaming="props.isStreaming"
      />
      <div v-if="!hasReasoningPayload">
        No reasoning payload.
      </div>
    </div>
  </div>
</template>

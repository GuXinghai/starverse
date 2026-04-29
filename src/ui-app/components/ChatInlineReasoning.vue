<script setup lang="ts">
import { ref } from 'vue'
import type { ReasoningView, ReasoningPiece } from '@/next/state/types'

const props = defineProps<{
  reasoningView: ReasoningView | null
  reasoningPieces?: ReasoningPiece[] | null
  collapsed: boolean
}>()

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
      <span aria-hidden="true">{{ props.collapsed ? '↓' : '↑' }}</span>
    </button>

    <div v-if="!props.collapsed" class="mt-2 space-y-2 text-xs text-gray-600">
      <div v-if="props.reasoningView?.summaryText">{{ props.reasoningView.summaryText }}</div>
      <div v-if="props.reasoningView?.reasoningText" class="whitespace-pre-wrap">{{ props.reasoningView.reasoningText }}</div>
      <div v-for="piece in props.reasoningPieces ?? []" :key="piece.id" class="whitespace-pre-wrap">{{ piece.text }}</div>
      <div v-if="!props.reasoningView?.summaryText && !props.reasoningView?.reasoningText && !(props.reasoningPieces?.length)">
        No reasoning payload.
      </div>
    </div>
  </div>
</template>

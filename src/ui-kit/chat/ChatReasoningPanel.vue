<script setup lang="ts">
import { computed } from 'vue'
import type { ReasoningPiece, ReasoningView } from './types'

const props = withDefaults(
  defineProps<{
    reasoningView: ReasoningView | null
    reasoningPieces?: ReasoningPiece[] | null
    title?: string
    emptyText?: string
    localProcessingDurationMs?: number
  }>(),
  {
    title: 'Reasoning',
    emptyText: 'No assistant message yet.',
  },
)

const emit = defineEmits<{
  'toggle-panel-state': []
}>()

const visibilityLabel = computed(() => {
  if (!props.reasoningView) return null
  switch (props.reasoningView.visibility) {
    case 'shown':
      return 'shown'
    case 'excluded':
      return 'excluded'
    case 'not_returned':
      return 'not_returned'
  }
})

const reasoningPieces = computed(() => {
  const pieces = props.reasoningPieces ?? props.reasoningView?.reasoningPieces
  if (!Array.isArray(pieces)) return null
  const normalized = pieces.filter((piece) => typeof piece?.text === 'string' && piece.text.trim().length > 0)
  return normalized.length > 0 ? normalized : null
})

const hasPieces = computed(() => Array.isArray(reasoningPieces.value) && reasoningPieces.value.length > 0)

const hasAnyReasoningText = computed(() => {
  if (!props.reasoningView) return false
  const hasText = Boolean(props.reasoningView.summaryText || props.reasoningView.reasoningText)
  return hasText || hasPieces.value
})

const showEncryptedBadge = computed(() => props.reasoningView?.hasEncrypted === true)

const isCollapsed = computed(() => props.reasoningView?.panelState === 'collapsed')

const formattedDuration = computed(() => {
  const ms = props.localProcessingDurationMs
  if (typeof ms !== 'number' || ms < 0) return null
  // 仅在展开时显示推理时间
  if (isCollapsed.value) return null
  return `${(ms / 1000).toFixed(2)}s`
})
</script>

<template>
  <div class="h-full overflow-auto bg-white p-4">
    <div class="mb-2 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <div class="text-sm font-semibold text-gray-800">{{ props.title }}</div>
          <span
            v-if="showEncryptedBadge"
            class="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900"
          >
            encrypted
          </span>
          <span
            v-if="formattedDuration"
            class="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-900"
          >
            {{ formattedDuration }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <slot name="actions" />
        <button
          class="rounded-lg bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
          type="button"
          :aria-label="isCollapsed ? 'Expand' : 'Collapse'"
          :title="isCollapsed ? 'Expand' : 'Collapse'"
          @click="emit('toggle-panel-state')"
        >
          {{ isCollapsed ? 'Expand' : '×' }}
        </button>
      </div>
    </div>

    <slot v-if="!props.reasoningView" name="empty">
      <div class="text-sm text-gray-500">{{ props.emptyText }}</div>
    </slot>

    <div v-else class="space-y-2">
      <div v-if="isCollapsed" class="text-sm text-gray-500">
        (collapsed)
      </div>

      <div v-else class="space-y-2 text-sm">
        <template v-if="props.reasoningView.visibility === 'shown'">
          <div v-if="props.reasoningView.hasEncrypted === true" class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <div class="text-xs font-semibold uppercase tracking-wide">Encrypted reasoning</div>
            <div class="mt-1 text-sm">本次推理内容被提供方加密/不可见（encrypted）。</div>
          </div>

          <div v-if="props.reasoningView.summaryText" class="rounded border border-gray-200 bg-white p-2">
            <div class="mb-1 text-xs font-semibold text-gray-700">Summary</div>
            <div>{{ props.reasoningView.summaryText }}</div>
          </div>
          <div v-if="props.reasoningView.reasoningText" class="rounded border border-gray-200 bg-white p-2">
            <div class="mb-1 text-xs font-semibold text-gray-700">Reasoning</div>
            <div class="whitespace-pre-wrap">{{ props.reasoningView.reasoningText }}</div>
          </div>

          <div v-if="hasPieces" class="rounded border border-gray-200 bg-white p-2">
            <div class="mb-1 text-xs font-semibold text-gray-700">Reasoning (pieces)</div>
            <div class="space-y-2">
              <div v-for="piece in reasoningPieces" :key="piece.id" class="whitespace-pre-wrap">
                {{ piece.text }}
              </div>
            </div>
          </div>

          <div v-if="!hasAnyReasoningText" class="text-sm text-gray-500">(no reasoning payload)</div>
        </template>

        <template v-else-if="props.reasoningView.visibility === 'excluded'">
          <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            本次请求已要求不返回推理内容（excluded）
          </div>
        </template>

        <template v-else-if="props.reasoningView.visibility === 'not_returned'">
          <div class="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            模型未返回推理内容 / 或该模型不支持
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ReasoningView } from './types'

const props = withDefaults(
  defineProps<{
    reasoningView: ReasoningView | null
    showDebug?: boolean
    title?: string
    emptyText?: string
  }>(),
  {
    title: 'Reasoning',
    emptyText: 'No assistant message yet.',
    showDebug: false,
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

const hasAnyReasoningText = computed(() => {
  if (!props.reasoningView) return false
  return Boolean(props.reasoningView.summaryText || props.reasoningView.reasoningText)
})

const showEncryptedBadge = computed(() => props.reasoningView?.hasEncrypted === true)

const isCollapsed = computed(() => props.reasoningView?.panelState === 'collapsed')
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
        </div>
        <div v-if="props.reasoningView" class="mt-1 text-xs text-gray-600">
          visibility: <span class="font-mono">{{ visibilityLabel }}</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <slot name="actions" />
        <button
          class="rounded-lg bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
          type="button"
          @click="emit('toggle-panel-state')"
        >
          {{ isCollapsed ? 'Expand' : 'Collapse' }}
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

        <div v-if="props.showDebug" class="rounded border border-gray-200 bg-white p-2">
          <div class="mb-1 text-xs font-semibold text-gray-700">Debug</div>
          <pre class="whitespace-pre-wrap text-xs">{{ JSON.stringify(props.reasoningView, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

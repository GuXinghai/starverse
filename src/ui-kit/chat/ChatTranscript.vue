<script setup lang="ts">
import { computed } from 'vue'
import type { MessageVM } from './types'
import ChatMessageBubble from './ChatMessageBubble.vue'

const props = withDefaults(
  defineProps<{
    messages: MessageVM[]
    activeMessageId?: string
    error?: unknown
    emptyText?: string
    showDebug?: boolean
  }>(),
  {
    emptyText: 'No messages yet.',
    showDebug: false,
  },
)

const errorText = computed(() => {
  if (!props.error) return null
  if (typeof props.error === 'string') return props.error
  if (props.error instanceof Error) return props.error.message
  try {
    return JSON.stringify(props.error, null, 2)
  } catch {
    return String(props.error)
  }
})
</script>

<template>
  <div class="h-full overflow-auto bg-gradient-to-b from-gray-50 to-white p-4">
    <div v-if="props.messages.length === 0" class="text-sm text-gray-500">
      {{ props.emptyText }}
    </div>
    <div v-else class="mx-auto max-w-3xl space-y-4">
      <template v-for="m in props.messages" :key="m.messageId">
        <div
          class="rounded-2xl"
          :class="
            props.activeMessageId && m.messageId === props.activeMessageId
              ? 'ring-2 ring-blue-200 ring-offset-2 ring-offset-gray-50'
              : ''
          "
        >
          <slot name="message" :message="m">
            <ChatMessageBubble :message="m" :showDebug="props.showDebug" />
          </slot>

          <div
            v-if="
              props.activeMessageId &&
              m.messageId === props.activeMessageId &&
              m.role === 'assistant' &&
              !m.streaming.isComplete &&
              !m.streaming.isTarget
            "
            class="mt-2 pl-11 text-[11px] font-medium text-blue-700"
          >
            正在生成<span class="font-mono">▍</span>
          </div>
        </div>
      </template>

      <div v-if="props.error" class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide">Error</div>
          <div class="text-[11px] text-red-700">run terminated</div>
        </div>
        <pre class="whitespace-pre-wrap text-xs">{{ errorText }}</pre>
      </div>
    </div>
  </div>
</template>

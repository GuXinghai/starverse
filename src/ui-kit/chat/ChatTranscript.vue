<script setup lang="ts">
import { computed } from 'vue'
import type { MessageVM } from './types'
import ChatMessageBubble from './ChatMessageBubble.vue'
import { t } from '@/shared/i18n'

const props = withDefaults(
  defineProps<{
    messageIds: string[]
    messagesById: Record<string, MessageVM | undefined>
    activeMessageId?: string
    error?: unknown
    emptyText?: string
    showDebug?: boolean
  }>(),
  {
    emptyText: '',
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
  <div class="h-full overflow-auto overscroll-contain px-6 py-6">
    <div v-if="props.messageIds.length === 0" class="text-sm text-[var(--sv-text-3)]">
      {{ props.emptyText || t('navigation.empty.noConversations') }}
    </div>
    <div v-else class="mx-auto flex max-w-[760px] flex-col gap-5">
      <template v-for="id in props.messageIds" :key="id">
        <div
          v-if="props.messagesById[id]"
          class="rounded-2xl"
          :class="
            props.activeMessageId && props.messagesById[id]?.messageId === props.activeMessageId
              ? 'ring-1 ring-black/[0.08] ring-offset-8 ring-offset-white'
              : ''
          "
        >
          <slot name="message" :message="props.messagesById[id]">
            <ChatMessageBubble :message="props.messagesById[id]!" :showDebug="props.showDebug" />
          </slot>

          <div
            v-if="
              props.activeMessageId &&
              props.messagesById[id]?.messageId === props.activeMessageId &&
              props.messagesById[id]?.role === 'assistant' &&
              !props.messagesById[id]?.streaming.isComplete &&
              !props.messagesById[id]?.streaming.isTarget
            "
            class="mt-2 flex items-center gap-1.5 text-xs text-[var(--sv-text-3)]"
          >
            {{ t('common.generating') }}<span class="sv-stream-caret" aria-hidden="true" />
          </div>
        </div>
      </template>

      <div v-if="props.error" class="sv-notice sv-notice-danger flex-col items-stretch gap-1 p-3 text-sm">
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-medium">{{ t('chat.transcript.error') }}</div>
          <div class="text-xs opacity-80">{{ t('chat.transcript.runTerminated') }}</div>
        </div>
        <pre class="whitespace-pre-wrap break-words text-xs">{{ errorText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sv-stream-caret {
  display: inline-block;
  width: 6px;
  height: 12px;
  border-radius: 1px;
  background: currentColor;
  animation: sv-transcript-caret-pulse 1s ease-in-out infinite;
}
@keyframes sv-transcript-caret-pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.9; }
}
@media (prefers-reduced-motion: reduce) {
  .sv-stream-caret { animation: none; opacity: 0.6; }
}
</style>

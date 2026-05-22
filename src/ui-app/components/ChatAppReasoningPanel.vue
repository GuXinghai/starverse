<script setup lang="ts">
import { computed } from 'vue'
import type { ReasoningView, ReasoningPiece } from '@/next/state/types'
import ChatReasoningPanel from '@/ui-kit/chat/ChatReasoningPanel.vue'

const props = defineProps<{
  messageId?: string | null
  reasoningView: ReasoningView | null
  reasoningVersion?: number
  isStreaming?: boolean
  reasoningPieces?: ReasoningPiece[] | null
  localProcessingDurationMs?: number
}>()

const reasoningView = computed(() => props.reasoningView ?? null)

const memoKey = computed(() => {
  const messageId = typeof props.messageId === 'string' ? props.messageId : ''
  return [messageId, props.reasoningVersion ?? 0, props.isStreaming ?? false, props.localProcessingDurationMs]
})
</script>

<template>
  <ChatReasoningPanel
    v-memo="memoKey"
    :messageId="props.messageId"
    :reasoningView="reasoningView"
    :reasoningPieces="props.reasoningPieces"
    :reasoningVersion="props.reasoningVersion"
    :localProcessingDurationMs="props.localProcessingDurationMs"
    emptyText="No assistant message yet."
  >
  </ChatReasoningPanel>
</template>

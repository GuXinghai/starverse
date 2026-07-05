<script setup lang="ts">
import { computed } from 'vue'
import type { ReasoningView, LegacyReasoningPiece } from '@/next/state/types'
import ChatReasoningPanel from '@/ui-kit/chat/ChatReasoningPanel.vue'
import { t } from '@/shared/i18n'

const props = defineProps<{
  messageId?: string | null
  reasoningView: ReasoningView | null
  reasoningVersion?: number
  isStreaming?: boolean
  legacyReasoningPieces?: LegacyReasoningPiece[] | null
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
    :legacyReasoningPieces="props.legacyReasoningPieces"
    :reasoningVersion="props.reasoningVersion"
    :isStreaming="props.isStreaming"
    :localProcessingDurationMs="props.localProcessingDurationMs"
    :emptyText="t('chat.reasoning.emptyAssistant')"
  >
  </ChatReasoningPanel>
</template>

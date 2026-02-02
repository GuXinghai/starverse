<script setup lang="ts">
import { computed } from 'vue'
import type { ReasoningPanelState, ReasoningView, ReasoningPiece } from '@/next/state/types'
import ChatReasoningPanel from '@/ui-kit/chat/ChatReasoningPanel.vue'

const props = defineProps<{
  messageId?: string | null
  reasoningView: ReasoningView | null
  reasoningVersion?: number
  panelState?: ReasoningPanelState
  isStreaming?: boolean
  reasoningPieces?: ReasoningPiece[] | null
  localProcessingDurationMs?: number
}>()

const emit = defineEmits<{
  'toggle-panel-state': [messageId: string]
}>()

const reasoningView = computed(() => props.reasoningView ?? null)

const memoKey = computed(() => {
  const messageId = typeof props.messageId === 'string' ? props.messageId : ''
  const panelState = props.panelState ?? props.reasoningView?.panelState ?? 'collapsed'
  return [messageId, props.reasoningVersion ?? 0, panelState, props.isStreaming ?? false, props.localProcessingDurationMs]
})

function onTogglePanelState() {
  const id = typeof props.messageId === 'string' ? props.messageId : null
  if (!id) return
  emit('toggle-panel-state', id)
}
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
    @toggle-panel-state="onTogglePanelState"
  >
  </ChatReasoningPanel>
</template>

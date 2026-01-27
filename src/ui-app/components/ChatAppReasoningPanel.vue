<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MessageVM } from '@/next/state/types'
import ChatReasoningPanel from '@/ui-kit/chat/ChatReasoningPanel.vue'

const props = defineProps<{
  messages: MessageVM[]
}>()

const showDebug = ref(false)

const emit = defineEmits<{
  'toggle-panel-state': [messageId: string]
}>()

const lastAssistant = computed(() => [...props.messages].reverse().find((m) => m.role === 'assistant') || null)
const reasoningView = computed(() => lastAssistant.value?.reasoningView ?? null)

function onTogglePanelState() {
  if (!lastAssistant.value) return
  emit('toggle-panel-state', lastAssistant.value.messageId)
}
</script>

<template>
  <ChatReasoningPanel
    :reasoningView="reasoningView"
    :showDebug="showDebug"
    emptyText="No assistant message yet."
    @toggle-panel-state="onTogglePanelState"
  >
    <template #actions>
      <button
        class="rounded-lg bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
        type="button"
        @click="showDebug = !showDebug"
      >
        {{ showDebug ? 'Hide debug' : 'Show debug' }}
      </button>
    </template>
  </ChatReasoningPanel>
</template>

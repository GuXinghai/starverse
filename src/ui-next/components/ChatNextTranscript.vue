<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MessageVM } from '@/next/state/types'
import ChatTranscript from '@/ui-kit/chat/ChatTranscript.vue'
import ChatNextMessageBubble from './ChatNextMessageBubble.vue'
import { useStickToBottom } from '@/ui-next/composables/useStickToBottom'

const props = defineProps<{
  messages: MessageVM[]
  activeMessageId?: string
  error?: unknown
}>()

const transcriptRef = ref<any>(null)

const stick = useStickToBottom({ nearBottomThreshold: 40, lockCooldownMs: 800 })

onMounted(() => {
  stick.setContainer((transcriptRef.value?.$el as HTMLElement | undefined) ?? null)
})

onBeforeUnmount(() => stick.dispose())

const contentSignature = computed(() => {
  let blocksLen = 0
  let toolCalls = 0
  let streamingTargets = 0
  for (const m of props.messages) {
    toolCalls += m.toolCalls.length
    if (m.streaming.isTarget && !m.streaming.isComplete) streamingTargets += 1
    for (const b of m.contentBlocks) {
      if (b.type === 'text') blocksLen += b.text.length
      else if (b.type === 'image') blocksLen += b.url.length
      else blocksLen += 1
    }
  }
  const errFlag = props.error ? 1 : 0
  return `${props.messages.length}:${blocksLen}:${toolCalls}:${streamingTargets}:${props.activeMessageId ?? ''}:${errFlag}`
})

watch(
  contentSignature,
  () => {
    void stick.onNewContent()
  },
  { flush: 'sync' },
)
</script>

<template>
  <div class="relative h-full">
    <ChatTranscript
      ref="transcriptRef"
      :messages="messages"
      :activeMessageId="activeMessageId"
      :error="error"
      emptyText="ui-next demo: send a message to replay fixtures."
    >
      <template #message="{ message }">
        <ChatNextMessageBubble :message="message" />
      </template>
    </ChatTranscript>

    <button
      v-if="stick.showScrollToBottom"
      class="absolute bottom-4 right-4 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-blue-700"
      type="button"
      @click="stick.scrollToBottom()"
    >
      回到底部
    </button>
  </div>
</template>

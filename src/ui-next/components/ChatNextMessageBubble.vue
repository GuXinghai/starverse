<script setup lang="ts">
import type { MessageVM } from '@/next/state/types'
import ChatMessageBubble from '@/ui-kit/chat/ChatMessageBubble.vue'

const props = withDefaults(
  defineProps<{
    message: MessageVM
    showDebug?: boolean
  }>(),
  {
    showDebug: false,
  },
)
</script>

<template>
  <ChatMessageBubble :message="props.message" :showDebug="props.showDebug" />
</template>


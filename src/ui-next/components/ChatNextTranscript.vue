<script setup lang="ts">
import type { MessageVM } from '@/next/state/types'
import ChatNextMessageBubble from './ChatNextMessageBubble.vue'

defineProps<{
  messages: MessageVM[]
}>()
</script>

<template>
  <div class="h-full overflow-auto p-4">
    <div v-if="messages.length === 0" class="text-sm text-gray-500">
      ui-next demo: send a message to replay fixtures.
    </div>
    <div v-else class="space-y-3">
      <ChatNextMessageBubble v-for="m in messages" :key="m.messageId" :message="m" />
    </div>
  </div>
</template>


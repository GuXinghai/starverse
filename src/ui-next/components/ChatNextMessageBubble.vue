<script setup lang="ts">
import type { MessageVM } from '@/next/state/types'

defineProps<{
  message: MessageVM
}>()
</script>

<template>
  <div class="flex" :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
    <div
      class="max-w-[80%] rounded-lg px-3 py-2 text-sm"
      :class="message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'"
    >
      <div v-for="(b, idx) in message.contentBlocks" :key="idx">
        <template v-if="b.type === 'text'">{{ b.text }}</template>
        <template v-else-if="b.type === 'image'">
          <img :src="b.url" class="max-h-40 rounded" />
        </template>
        <template v-else>
          <pre class="whitespace-pre-wrap text-xs">{{ JSON.stringify(b, null, 2) }}</pre>
        </template>
      </div>

      <div v-if="message.toolCalls.length" class="mt-2 text-xs opacity-80">
        tool_calls: {{ message.toolCalls.length }}
      </div>

      <div v-if="message.streaming.isTarget" class="mt-1 text-[11px] opacity-70">
        target: {{ message.streaming.isComplete ? 'complete' : 'streaming' }}
      </div>
    </div>
  </div>
</template>


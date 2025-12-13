<script setup lang="ts">
import type { SessionVM } from '@/next/state/types'

defineProps<{
  session: SessionVM | null
  isRunning: boolean
}>()

const emit = defineEmits<{
  abort: []
  reset: []
}>()
</script>

<template>
  <div class="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 text-xs text-gray-700">
    <div class="font-semibold">Chat Next (isolated)</div>
    <div v-if="session" class="flex flex-wrap items-center gap-3">
      <div>status: <span class="font-mono">{{ session.status }}</span></div>
      <div v-if="session.generationId">gen: <span class="font-mono">{{ session.generationId }}</span></div>
      <div v-if="session.finishReason">finish: <span class="font-mono">{{ session.finishReason }}</span></div>
      <div v-if="session.usage">usage: <span class="font-mono">{{ JSON.stringify(session.usage) }}</span></div>
      <div v-if="session.error" class="text-red-700">error: {{ JSON.stringify(session.error) }}</div>
    </div>
    <div class="ml-auto flex gap-2">
      <button class="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200 disabled:opacity-50" :disabled="!isRunning" @click="emit('abort')">
        Abort
      </button>
      <button class="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200" @click="emit('reset')">
        Reset
      </button>
    </div>
  </div>
</template>


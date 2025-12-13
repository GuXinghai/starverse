<script setup lang="ts">
import type { RunVM } from '@/next/state/types'

defineProps<{
  run: RunVM | null
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
    <div v-if="run" class="flex flex-wrap items-center gap-3">
      <div>status: <span class="font-mono">{{ run.status }}</span></div>
      <div v-if="run.generationId">gen: <span class="font-mono">{{ run.generationId }}</span></div>
      <div v-if="run.finishReason">finish: <span class="font-mono">{{ run.finishReason }}</span></div>
      <div v-if="run.usage">usage: <span class="font-mono">{{ JSON.stringify(run.usage) }}</span></div>
      <div v-if="run.error" class="text-red-700">error: {{ JSON.stringify(run.error) }}</div>
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

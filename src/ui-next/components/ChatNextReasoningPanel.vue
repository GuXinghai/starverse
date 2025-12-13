<script setup lang="ts">
import type { MessageVM } from '@/next/state/types'

const props = defineProps<{
  messages: MessageVM[]
}>()

const lastAssistant = () => [...props.messages].reverse().find((m) => m.role === 'assistant') || null
</script>

<template>
  <div class="h-full overflow-auto p-4">
    <div class="mb-2 text-sm font-semibold text-gray-800">Reasoning</div>
    <div v-if="!lastAssistant()" class="text-sm text-gray-500">No assistant message yet.</div>
    <div v-else class="space-y-2 text-sm">
      <div class="text-xs text-gray-600">
        visibility: {{ lastAssistant()!.reasoningView.visibility }}
        <span v-if="lastAssistant()!.reasoningView.hasEncrypted"> (encrypted)</span>
      </div>
      <div v-if="lastAssistant()!.reasoningView.summaryText" class="rounded border border-gray-200 bg-white p-2">
        <div class="mb-1 text-xs font-semibold text-gray-700">summary</div>
        <div>{{ lastAssistant()!.reasoningView.summaryText }}</div>
      </div>
      <div v-if="lastAssistant()!.reasoningView.reasoningText" class="rounded border border-gray-200 bg-white p-2">
        <div class="mb-1 text-xs font-semibold text-gray-700">stream</div>
        <div class="whitespace-pre-wrap">{{ lastAssistant()!.reasoningView.reasoningText }}</div>
      </div>
      <div v-if="!lastAssistant()!.reasoningView.summaryText && !lastAssistant()!.reasoningView.reasoningText" class="text-sm text-gray-500">
        (no reasoning payload in demo fixtures)
      </div>
    </div>
  </div>
</template>


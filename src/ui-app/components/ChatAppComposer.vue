<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  draft: string
  disabled: boolean
  isRunning: boolean
}>()

const emit = defineEmits<{
  'update:draft': [value: string]
  send: []
  abort: []
}>()

const canSend = computed(() => !props.disabled && !props.isRunning && props.draft.trim().length > 0)
</script>

<template>
  <div class="flex items-end gap-3 px-4 py-3">
    <textarea
      class="min-h-[44px] flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
      :disabled="props.disabled || props.isRunning"
      :value="props.draft"
      placeholder="Type a message..."
      rows="2"
      @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
      @keydown.enter.exact.prevent="canSend ? emit('send') : null"
    />

    <button
      v-if="props.isRunning"
      type="button"
      class="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
      :disabled="props.disabled"
      @click="emit('abort')"
    >
      Abort
    </button>

    <button
      v-else
      type="button"
      class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
      :disabled="!canSend"
      @click="emit('send')"
    >
      Send
    </button>
  </div>
</template>


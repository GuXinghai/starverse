<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    draft: string
    disabled: boolean
    placeholder?: string
    sendLabel?: string
    abortLabel?: string
    showAbort?: boolean
    canAbort?: boolean
  }>(),
  {
    placeholder: 'Type a message...',
    sendLabel: 'Send',
    abortLabel: 'Abort',
    showAbort: true,
    canAbort: true,
  },
)

const emit = defineEmits<{
  'update:draft': [value: string]
  send: []
  abort: []
}>()

const canSend = computed(() => !props.disabled && props.draft.trim().length > 0)
</script>

<template>
  <div class="bg-white p-4">
    <div v-if="$slots.controls" class="mb-3">
      <slot name="controls" />
    </div>

    <div class="mb-3 flex items-center justify-end gap-2">
      <button
        v-if="props.showAbort"
        class="rounded-lg bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        :disabled="!props.canAbort"
        @click="emit('abort')"
      >
        {{ props.abortLabel }}
      </button>
      <button
        class="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        :disabled="!canSend"
        @click="emit('send')"
      >
        {{ props.sendLabel }}
      </button>
    </div>

    <textarea
      class="h-24 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none focus:border-blue-300 focus:bg-white disabled:opacity-60"
      :value="props.draft"
      :disabled="props.disabled"
      :placeholder="props.placeholder"
      @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
      @keydown.enter.exact.prevent="emit('send')"
    />
  </div>
</template>

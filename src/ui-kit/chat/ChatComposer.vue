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
        type="button"
        class="sv-btn sv-btn-sm"
        :disabled="!props.canAbort"
        @click="emit('abort')"
      >
        {{ props.abortLabel }}
      </button>
      <button
        type="button"
        class="sv-btn sv-btn-sm sv-btn-primary"
        :disabled="!canSend"
        @click="emit('send')"
      >
        {{ props.sendLabel }}
      </button>
    </div>

    <textarea
      class="sv-textarea h-24 resize-none text-sm"
      :value="props.draft"
      :disabled="props.disabled"
      :placeholder="props.placeholder"
      @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
      @keydown.enter.exact.prevent="emit('send')"
    />
  </div>
</template>

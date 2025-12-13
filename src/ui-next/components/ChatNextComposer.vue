<script setup lang="ts">
import { computed } from 'vue'
import type { DemoScenario } from '../useChatRun'

const props = defineProps<{
  draft: string
  scenario: DemoScenario
  disabled: boolean
}>()

const emit = defineEmits<{
  'update:draft': [value: string]
  'update:scenario': [value: DemoScenario]
  send: []
  abort: []
}>()

const canSend = computed(() => !props.disabled && props.draft.trim().length > 0)
</script>

<template>
  <div class="p-3">
    <div class="mb-2 flex items-center gap-2">
      <label class="text-xs text-gray-600">Scenario</label>
      <select
        class="rounded border border-gray-300 px-2 py-1 text-xs"
        :value="scenario"
        :disabled="disabled"
        @change="emit('update:scenario', ($event.target as HTMLSelectElement).value as DemoScenario)"
      >
        <option value="normal">normal</option>
        <option value="usage">usage tail</option>
        <option value="midstream_error">mid-stream error</option>
        <option value="excluded">excluded (reasoning.exclude=true)</option>
        <option value="reasoning_details">reasoning_details</option>
        <option value="encrypted">encrypted</option>
        <option value="debug">debug choices=[]</option>
      </select>
      <div class="ml-auto flex gap-2">
        <button
          class="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          :disabled="!disabled"
          @click="emit('abort')"
        >
          Abort
        </button>
        <button
          class="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="!canSend"
          @click="emit('send')"
        >
          Send
        </button>
      </div>
    </div>

    <textarea
      class="h-20 w-full resize-none rounded border border-gray-300 p-2 text-sm outline-none focus:border-blue-400"
      :value="draft"
      :disabled="disabled"
      placeholder="Type a message (ui-next demo)..."
      @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
      @keydown.enter.exact.prevent="emit('send')"
    />
  </div>
</template>

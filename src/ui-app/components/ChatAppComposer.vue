<script setup lang="ts">
import { computed } from 'vue'
import type { ReasoningEffort } from '@/next/state/types'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import type { ReasoningModelIndexItem } from '@/next/modelIndex/reasoningModelIndexTypes'

const props = defineProps<{
  draft: string
  disabled: boolean
  isRunning: boolean
  model: string
  modelCatalog: readonly ModelCatalogItem[]
  reasoningModelIndex: readonly ReasoningModelIndexItem[]
  showHiddenModelsInPickers: boolean
  modelCatalogNotice?: string | null
  requestedReasoningExclude: boolean
  requestedReasoningEffort: 'auto' | ReasoningEffort
}>()

const emit = defineEmits<{
  'update:draft': [value: string]
  'update:model': [value: string]
  'update:requestedReasoningExclude': [value: boolean]
  'update:requestedReasoningEffort': [value: 'auto' | ReasoningEffort]
  toggleShowHiddenModelsInPickers: []
  send: []
  abort: []
}>()

const canSend = computed(() => !props.disabled && !props.isRunning && props.draft.trim().length > 0)
const isDev = (import.meta as any).env?.DEV === true
const selectedReasoningModelId = computed(() =>
  props.reasoningModelIndex.some((m) => m.modelId === props.model) ? props.model : ''
)
const modelOptionExists = computed(() => props.modelCatalog.some((m) => m.modelId === props.model))
const modelSelectValue = computed(() => (props.model.trim().length > 0 ? props.model : 'openrouter/auto'))
</script>

<template>
  <div class="flex flex-col gap-3 px-4 py-3">
    <div class="flex items-end gap-3">
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

    <div class="flex flex-wrap items-center gap-3 text-xs text-gray-600">
      <div class="flex items-center gap-2">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Model</div>
        <select
          class="w-56 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm"
          :value="modelSelectValue"
          :disabled="props.disabled || props.isRunning"
          @change="emit('update:model', ($event.target as HTMLSelectElement).value)"
        >
          <option v-if="!modelOptionExists" :value="modelSelectValue">
            {{ modelSelectValue }}
          </option>
          <option v-for="m in props.modelCatalog" :key="m.modelId" :value="m.modelId">
            {{ m.name }}
          </option>
        </select>
        <button
          v-if="isDev"
          type="button"
          class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm"
          :disabled="props.disabled || props.isRunning"
          @click="emit('toggleShowHiddenModelsInPickers')"
        >
          {{ props.showHiddenModelsInPickers ? 'hide hidden' : 'show hidden' }}
        </button>
      </div>

      <div class="flex items-center gap-2">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Reasoning</div>
        <select
          class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm"
          :value="props.requestedReasoningEffort"
          :disabled="props.disabled || props.isRunning"
          @change="emit('update:requestedReasoningEffort', ($event.target as HTMLSelectElement).value as any)"
        >
          <option value="auto">auto</option>
          <option value="none">none</option>
          <option value="minimal">minimal</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="xhigh">xhigh</option>
        </select>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-gray-300"
            :checked="props.requestedReasoningExclude"
            :disabled="props.disabled || props.isRunning || props.requestedReasoningEffort === 'auto'"
            @change="emit('update:requestedReasoningExclude', ($event.target as HTMLInputElement).checked)"
          />
          exclude
        </label>
      </div>

      <div v-if="props.reasoningModelIndex.length > 0" class="flex items-center gap-2">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Reasoning Models</div>
        <select
          class="w-56 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm"
          :disabled="props.disabled || props.isRunning"
          :value="selectedReasoningModelId"
          @change="emit('update:model', ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>(pick from reasoning index)</option>
          <option v-for="m in props.reasoningModelIndex" :key="m.modelId" :value="m.modelId">
            {{ m.name }}
          </option>
        </select>
      </div>

      <div v-else class="flex items-center gap-2 text-[11px] text-gray-400">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Reasoning Models</div>
        <span>(unavailable)</span>
      </div>

      <div v-if="props.requestedReasoningEffort !== 'auto' && props.requestedReasoningEffort !== 'none'" class="text-[11px] text-gray-500">
        Tip: medium is the recommended default when enabling reasoning.
      </div>

      <div v-if="props.modelCatalogNotice" class="text-[11px] text-gray-500">
        {{ props.modelCatalogNotice }}
      </div>
    </div>
  </div>
</template>


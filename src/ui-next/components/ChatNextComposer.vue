<script setup lang="ts">
import type { DemoScenario, RunMode } from '../useChatRun'
import ChatComposer from '@/ui-kit/chat/ChatComposer.vue'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import type { ReasoningModelIndexItem } from '@/next/modelIndex/reasoningModelIndexTypes'

const props = defineProps<{
  draft: string
  scenario: DemoScenario
  mode: RunMode
  model: string
  apiKey: string
  requestedReasoningExclude: boolean
  requestedReasoningEffort: 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  modelCatalog: readonly ModelCatalogItem[]
  reasoningModelIndex: readonly ReasoningModelIndexItem[]
  showHiddenModelsInPickers: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  'update:draft': [value: string]
  'update:scenario': [value: DemoScenario]
  'update:mode': [value: RunMode]
  'update:model': [value: string]
  'update:apiKey': [value: string]
  'update:requestedReasoningExclude': [value: boolean]
  'update:requestedReasoningEffort': [value: 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh']
  toggleShowHiddenModelsInPickers: []
  send: []
  abort: []
}>()

const isDev = (import.meta as any).env?.DEV === true
</script>

<template>
  <ChatComposer
    :draft="props.draft"
    :disabled="props.disabled"
    :canAbort="props.disabled"
    placeholder="Type a message (ui-next demo)..."
    @update:draft="(v) => emit('update:draft', v)"
    @send="emit('send')"
    @abort="emit('abort')"
  >
    <template #controls>
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Mode</div>
          <select
            class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs shadow-sm"
            :value="props.mode"
            :disabled="props.disabled"
            @change="emit('update:mode', ($event.target as HTMLSelectElement).value as RunMode)"
          >
            <option value="live">live</option>
            <option v-if="isDev" value="demo">demo</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Model</div>
          <input
            class="w-56 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs shadow-sm"
            :value="props.model"
            :disabled="props.disabled"
            placeholder="openrouter/auto"
            list="model-catalog-datalist"
            @input="emit('update:model', ($event.target as HTMLInputElement).value)"
          />
          <datalist id="model-catalog-datalist">
            <option v-for="m in props.modelCatalog" :key="m.modelId" :value="m.modelId" :label="m.name" />
          </datalist>
          <button
            v-if="isDev"
            type="button"
            class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm"
            :disabled="props.disabled"
            @click="emit('toggleShowHiddenModelsInPickers')"
          >
            {{ props.showHiddenModelsInPickers ? 'hide hidden' : 'show hidden' }}
          </button>
        </div>

        <div class="flex items-center gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Reasoning</div>
          <select
            class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs shadow-sm"
            :value="props.requestedReasoningEffort"
            :disabled="props.disabled"
            @change="emit('update:requestedReasoningEffort', ($event.target as HTMLSelectElement).value as any)"
          >
            <option value="auto">auto (omit reasoning field)</option>
            <option value="none">none (explicit disable)</option>
            <option value="minimal">minimal</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="xhigh">xhigh</option>
          </select>
          <label class="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300"
              :checked="props.requestedReasoningExclude"
              :disabled="props.disabled || props.requestedReasoningEffort === 'auto' || props.requestedReasoningEffort === 'none'"
              @change="emit('update:requestedReasoningExclude', ($event.target as HTMLInputElement).checked)"
            />
            exclude
          </label>
          <div v-if="props.requestedReasoningEffort !== 'auto' && props.requestedReasoningEffort !== 'none'" class="text-[11px] text-gray-500">
            Tip: medium is the recommended default when enabling reasoning.
          </div>
        </div>

        <div v-if="props.reasoningModelIndex.length > 0" class="flex items-center gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Reasoning Models</div>
          <select
            class="w-56 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs shadow-sm"
            :disabled="props.disabled"
            :value="''"
            @change="emit('update:model', ($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>(pick from reasoning index)</option>
            <option v-for="m in props.reasoningModelIndex" :key="m.modelId" :value="m.modelId">
              {{ m.name }}
            </option>
          </select>
        </div>

        <div v-if="isDev && props.mode === 'demo'" class="flex items-center gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Scenario</div>
          <select
            class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs shadow-sm"
            :value="props.scenario"
            :disabled="props.disabled"
            @change="emit('update:scenario', ($event.target as HTMLSelectElement).value as DemoScenario)"
          >
            <option value="normal">normal</option>
            <option value="usage">usage tail</option>
            <option value="midstream_error">mid-stream error</option>
            <option value="excluded">excluded (reasoning.exclude=true)</option>
            <option value="reasoning_details">reasoning_details</option>
            <option value="encrypted">encrypted</option>
            <option value="tool_calls">tool_calls</option>
            <option value="debug">debug choices=[]</option>
          </select>
        </div>

        <div v-if="isDev && props.mode === 'live'" class="flex items-center gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">API key</div>
          <input
            class="w-72 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs shadow-sm"
            :value="props.apiKey"
            :disabled="props.disabled"
            placeholder="VITE_OPENROUTER_API_KEY (optional in dev UI)"
            @input="emit('update:apiKey', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </template>
  </ChatComposer>
</template>

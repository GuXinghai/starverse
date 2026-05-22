<script setup lang="ts">
import { computed } from 'vue'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import type { SearchSettingsLayer, ResolvedSearchSettings } from '@/next/openrouter/searchSettingsResolver'
import type { SamplingParamsLayer, ResolvedSamplingParams } from '@/next/openrouter/samplingParamsResolver'
import type { ImageGenerationUserConfig } from '@/next/openrouter/imageGenerationSettingsPersistence'
import type { ChatSessionConfig } from '../app/chatSessionConfig'
import WebSearchSettingsEditor from './WebSearchSettingsEditor.vue'
import SamplingParamsSettingsEditor from './SamplingParamsSettingsEditor.vue'
import ImageGenerationSettingsEditor from './ImageGenerationSettingsEditor.vue'

const props = defineProps<{
  disabled: boolean
  isRunning: boolean
  sessionConfig: ChatSessionConfig
  reasoningDisplayMode: 'inline' | 'rail'
  modelCatalog: readonly ModelCatalogItem[]
  webSearchResolved: ResolvedSearchSettings | null
  samplingParamsResolved: ResolvedSamplingParams | null
}>()

const emit = defineEmits<{
  (e: 'updateModel', modelKey: string): void
  (e: 'updateReasoningEnabled', enabled: boolean): void
  (e: 'updateReasoningEffort', effort: 'low' | 'medium' | 'high'): void
  (e: 'updateWebSearchEnabled', enabled: boolean): void
  (e: 'updateWebSearchLevel', level: 'low' | 'high'): void
  (e: 'updateWebSearchLayer', layer: SearchSettingsLayer | null): void
  (e: 'updateSamplingParamsLayer', layer: SamplingParamsLayer | null): void
  (e: 'updateImageGenerationEnabled', enabled: boolean): void
  (e: 'updateImageGenerationResolution', value: '1K' | '2K' | '4K'): void
  (e: 'updateImageGenerationAspectRatio', value: '16:9' | '3:4' | '1:1' | '4:3'): void
  (e: 'updateImageGeneration', value: ImageGenerationUserConfig): void
  (e: 'updateReasoningDisplayMode', mode: 'inline' | 'rail'): void
  (e: 'openSettings'): void
}>()

const disabled = computed(() => props.disabled || props.isRunning)
const modelValue = computed(() => props.sessionConfig.model.selectedModelKey ?? 'openrouter/auto')
const imageValue = computed<ImageGenerationUserConfig>(() => ({
  enabled: props.sessionConfig.imageGeneration.enabled,
  outputMode: props.sessionConfig.imageGeneration.detail?.outputMode ?? 'auto',
  aspectRatio: props.sessionConfig.imageGeneration.aspectRatio,
  imageSize: props.sessionConfig.imageGeneration.resolution,
  advancedJson: props.sessionConfig.imageGeneration.detail?.advancedJson ?? '',
}))

function chipClass(active: boolean): string {
  return active
    ? 'border-gray-900 bg-gray-900 text-white'
    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
}
</script>

<template>
  <div class="h-full overflow-auto p-3">
    <div class="space-y-4">
      <section class="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Display</div>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.reasoningDisplayMode === 'inline')"
            @click="emit('updateReasoningDisplayMode', 'inline')"
          >
            Inline reasoning
          </button>
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.reasoningDisplayMode === 'rail')"
            @click="emit('updateReasoningDisplayMode', 'rail')"
          >
            Right rail reasoning
          </button>
        </div>
      </section>

      <section class="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Model</div>
        <select
          class="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
          :disabled="disabled"
          :value="modelValue"
          @change="emit('updateModel', ($event.target as HTMLSelectElement).value)"
        >
          <option value="openrouter/auto">openrouter/auto</option>
          <option v-for="item in props.modelCatalog" :key="item.modelId" :value="item.modelId">
            {{ item.name }}
          </option>
        </select>
      </section>

      <section class="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Reasoning</div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="props.sessionConfig.reasoning.enabled"
              :disabled="disabled"
              @change="emit('updateReasoningEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="effort in ['low', 'medium', 'high']"
            :key="effort"
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.reasoning.effort === effort)"
            :disabled="disabled || !props.sessionConfig.reasoning.enabled"
            @click="emit('updateReasoningEffort', effort as 'low' | 'medium' | 'high')"
          >
            {{ effort }}
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Web Search</div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="props.sessionConfig.webSearch.enabled"
              :disabled="disabled"
              @change="emit('updateWebSearchEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.webSearch.level === 'low')"
            :disabled="disabled || !props.sessionConfig.webSearch.enabled"
            @click="emit('updateWebSearchLevel', 'low')"
          >
            low
          </button>
          <button
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.webSearch.level === 'high')"
            :disabled="disabled || !props.sessionConfig.webSearch.enabled"
            @click="emit('updateWebSearchLevel', 'high')"
          >
            high
          </button>
        </div>
        <WebSearchSettingsEditor
          :model-value="props.sessionConfig.webSearch.detail"
          :disabled="disabled"
          :resolved="props.webSearchResolved"
          @update:model-value="emit('updateWebSearchLayer', $event)"
        />
      </section>

      <section class="min-w-0 space-y-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Sampling</div>
        <SamplingParamsSettingsEditor
          :model-value="props.sessionConfig.samplingParams.detail"
          :disabled="disabled"
          :resolved="props.samplingParamsResolved"
          :collapsible="false"
          compact
          @update:model-value="emit('updateSamplingParamsLayer', $event)"
        />
      </section>

      <section class="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Image Generation</div>
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              :checked="props.sessionConfig.imageGeneration.enabled"
              :disabled="disabled"
              @change="emit('updateImageGenerationEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="resolution in ['1K', '2K', '4K']"
            :key="resolution"
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.imageGeneration.resolution === resolution)"
            :disabled="disabled || !props.sessionConfig.imageGeneration.enabled"
            @click="emit('updateImageGenerationResolution', resolution as '1K' | '2K' | '4K')"
          >
            {{ resolution }}
          </button>
        </div>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="ratio in ['16:9', '3:4', '1:1', '4:3']"
            :key="ratio"
            type="button"
            class="rounded-md border px-2 py-1.5 text-sm"
            :class="chipClass(props.sessionConfig.imageGeneration.aspectRatio === ratio)"
            :disabled="disabled || !props.sessionConfig.imageGeneration.enabled"
            @click="emit('updateImageGenerationAspectRatio', ratio as '16:9' | '3:4' | '1:1' | '4:3')"
          >
            {{ ratio }}
          </button>
        </div>
        <ImageGenerationSettingsEditor
          :model-value="imageValue"
          :disabled="disabled || !props.sessionConfig.imageGeneration.enabled"
          @update:model-value="emit('updateImageGeneration', { ...$event, enabled: props.sessionConfig.imageGeneration.enabled })"
        />
      </section>

      <section class="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
        <button
          type="button"
          class="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          :disabled="props.disabled"
          @click="emit('openSettings')"
        >
          Open global settings
        </button>
      </section>
    </div>
  </div>
</template>

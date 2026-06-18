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
  localEndpointChat?: Readonly<{
    enabled: boolean
    endpointUrl: string
    model: string
    experimentalLabel: string
  }> | null
  openAIResponsesChat?: Readonly<{
    enabled: boolean
    model: string
    experimentalLabel: string
  }> | null
  googleAIStudioChat?: Readonly<{
    enabled: boolean
    model: string
    experimentalLabel: string
  }> | null
  anthropicChat?: Readonly<{
    enabled: boolean
    model: string
    experimentalLabel: string
  }> | null
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
  (e: 'updateLocalEndpointChatEnabled', enabled: boolean): void
  (e: 'updateLocalEndpointChatUrl', value: string): void
  (e: 'updateLocalEndpointChatModel', value: string): void
  (e: 'clearLocalEndpointChat'): void
  (e: 'updateOpenAIResponsesChatEnabled', enabled: boolean): void
  (e: 'updateOpenAIResponsesChatModel', value: string): void
  (e: 'clearOpenAIResponsesChat'): void
  (e: 'updateGoogleAIStudioChatEnabled', enabled: boolean): void
  (e: 'updateGoogleAIStudioChatModel', value: string): void
  (e: 'clearGoogleAIStudioChat'): void
  (e: 'updateAnthropicChatEnabled', enabled: boolean): void
  (e: 'updateAnthropicChatModel', value: string): void
  (e: 'clearAnthropicChat'): void
  (e: 'updateReasoningDisplayMode', mode: 'inline' | 'rail'): void
  (e: 'openSettings'): void
}>()

const disabled = computed(() => props.disabled || props.isRunning)
const modelValue = computed(() => props.sessionConfig.model.selectedModelKey ?? 'openrouter/auto')
const localEndpointChat = computed(() => props.localEndpointChat ?? {
  enabled: false,
  endpointUrl: 'http://localhost:1234/v1',
  model: '',
  experimentalLabel: 'Experimental · LocalEndpoint text-only · not OpenRouter',
})
const localEndpointChatStatusLabel = computed(() => localEndpointChat.value.enabled ? 'active' : 'inactive')
const openAIResponsesChat = computed(() => props.openAIResponsesChat ?? {
  enabled: false,
  model: '',
  experimentalLabel: 'Experimental · OpenAI Responses text-only · not OpenRouter',
})
const openAIResponsesChatStatusLabel = computed(() => openAIResponsesChat.value.enabled ? 'active' : 'inactive')
const googleAIStudioChat = computed(() => props.googleAIStudioChat ?? {
  enabled: false,
  model: '',
  experimentalLabel: 'Experimental · Google AI Studio Gemini text-only · not OpenRouter',
})
const googleAIStudioChatStatusLabel = computed(() => googleAIStudioChat.value.enabled ? 'active' : 'inactive')
const anthropicChat = computed(() => props.anthropicChat ?? {
  enabled: false,
  model: '',
  experimentalLabel: 'Experimental · Anthropic Messages text-only · not OpenRouter',
})
const anthropicChatStatusLabel = computed(() => anthropicChat.value.enabled ? 'active' : 'inactive')
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

      <section class="space-y-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3" data-testid="openai-responses-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-blue-800">OpenAI Responses Chat</div>
            <div class="mt-1 text-[11px] text-blue-700">{{ openAIResponsesChat.experimentalLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-blue-900">
            <input
              type="checkbox"
              :checked="openAIResponsesChat.enabled"
              :disabled="disabled"
              data-testid="openai-responses-chat-enabled"
              @change="emit('updateOpenAIResponsesChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-blue-900">Manual Responses model id</label>
          <input
            class="w-full rounded border border-blue-200 bg-white px-2 py-1.5 text-sm disabled:bg-blue-50"
            :value="openAIResponsesChat.model"
            :disabled="disabled || !openAIResponsesChat.enabled"
            placeholder="gpt-4.1-mini"
            data-testid="openai-responses-chat-model"
            @input="emit('updateOpenAIResponsesChatModel', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="text-[11px] text-blue-800" data-testid="openai-responses-chat-warning">
          Native OpenAI Responses API text-only streaming. Attachments, web, tools, image generation, reasoning, and Generic compatibility routing are disabled.
        </div>
        <div class="rounded border border-blue-100 bg-white px-2 py-1.5 text-[11px] text-blue-900" data-testid="openai-responses-chat-selected-status">
          <div>Experimental OpenAI Responses chat is {{ openAIResponsesChatStatusLabel }}.</div>
          <div>Selected Responses model: {{ openAIResponsesChat.model || 'none' }}</div>
          <div>OpenAI Responses chat uses a main-process credential bridge and does not expose API keys to this console.</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
            :disabled="disabled || !openAIResponsesChat.enabled"
            data-testid="openai-responses-chat-disable"
            @click="emit('updateOpenAIResponsesChatEnabled', false)"
          >
            Disable OpenAI Responses chat
          </button>
          <button
            type="button"
            class="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="openai-responses-chat-clear"
            @click="emit('clearOpenAIResponsesChat')"
          >
            Clear OpenAI Responses chat settings
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-rose-200 bg-rose-50/70 p-3" data-testid="anthropic-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-rose-800">Anthropic Messages Chat</div>
            <div class="mt-1 text-[11px] text-rose-700">{{ anthropicChat.experimentalLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-rose-900">
            <input
              type="checkbox"
              :checked="anthropicChat.enabled"
              :disabled="disabled"
              data-testid="anthropic-chat-enabled"
              @change="emit('updateAnthropicChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-rose-900">Manual Claude model id</label>
          <input
            class="w-full rounded border border-rose-200 bg-white px-2 py-1.5 text-sm disabled:bg-rose-50"
            :value="anthropicChat.model"
            :disabled="disabled || !anthropicChat.enabled"
            placeholder="claude-sonnet-4-5"
            data-testid="anthropic-chat-model"
            @input="emit('updateAnthropicChatModel', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="text-[11px] text-rose-800" data-testid="anthropic-chat-warning">
          Native Anthropic Messages API text-only streaming. Attachments, web, tools, image generation, reasoning/thinking, signatures, and Generic compatibility routing are disabled.
        </div>
        <div class="rounded border border-rose-100 bg-white px-2 py-1.5 text-[11px] text-rose-900" data-testid="anthropic-chat-selected-status">
          <div>Experimental Anthropic Messages chat is {{ anthropicChatStatusLabel }}.</div>
          <div>Selected Claude model: {{ anthropicChat.model || 'none' }}</div>
          <div>Anthropic chat uses a main-process credential bridge and does not expose API keys to this console.</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
            :disabled="disabled || !anthropicChat.enabled"
            data-testid="anthropic-chat-disable"
            @click="emit('updateAnthropicChatEnabled', false)"
          >
            Disable Anthropic Messages chat
          </button>
          <button
            type="button"
            class="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="anthropic-chat-clear"
            @click="emit('clearAnthropicChat')"
          >
            Clear Anthropic Messages chat settings
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3" data-testid="google-ai-studio-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-emerald-800">Google AI Studio Chat</div>
            <div class="mt-1 text-[11px] text-emerald-700">{{ googleAIStudioChat.experimentalLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-emerald-900">
            <input
              type="checkbox"
              :checked="googleAIStudioChat.enabled"
              :disabled="disabled"
              data-testid="google-ai-studio-chat-enabled"
              @change="emit('updateGoogleAIStudioChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-emerald-900">Manual Gemini model id</label>
          <input
            class="w-full rounded border border-emerald-200 bg-white px-2 py-1.5 text-sm disabled:bg-emerald-50"
            :value="googleAIStudioChat.model"
            :disabled="disabled || !googleAIStudioChat.enabled"
            placeholder="gemini-2.5-flash"
            data-testid="google-ai-studio-chat-model"
            @input="emit('updateGoogleAIStudioChatModel', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="text-[11px] text-emerald-800" data-testid="google-ai-studio-chat-warning">
          Native Google AI Studio Gemini text-only streaming. Attachments, web, tools, image generation, reasoning, legacy Gemini runtime, and Generic compatibility routing are disabled.
        </div>
        <div class="rounded border border-emerald-100 bg-white px-2 py-1.5 text-[11px] text-emerald-900" data-testid="google-ai-studio-chat-selected-status">
          <div>Experimental Google AI Studio chat is {{ googleAIStudioChatStatusLabel }}.</div>
          <div>Selected Gemini model: {{ googleAIStudioChat.model || 'none' }}</div>
          <div>Google AI Studio chat uses a main-process credential bridge and does not expose API keys to this console.</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            :disabled="disabled || !googleAIStudioChat.enabled"
            data-testid="google-ai-studio-chat-disable"
            @click="emit('updateGoogleAIStudioChatEnabled', false)"
          >
            Disable Google AI Studio chat
          </button>
          <button
            type="button"
            class="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="google-ai-studio-chat-clear"
            @click="emit('clearGoogleAIStudioChat')"
          >
            Clear Google AI Studio chat settings
          </button>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3" data-testid="local-endpoint-chat-controls">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-amber-800">LocalEndpoint Chat</div>
            <div class="mt-1 text-[11px] text-amber-700">{{ localEndpointChat.experimentalLabel }}</div>
          </div>
          <label class="flex items-center gap-2 text-sm text-amber-900">
            <input
              type="checkbox"
              :checked="localEndpointChat.enabled"
              :disabled="disabled"
              data-testid="local-endpoint-chat-enabled"
              @change="emit('updateLocalEndpointChatEnabled', ($event.target as HTMLInputElement).checked)"
            />
            enabled
          </label>
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-amber-900">Loopback endpoint URL</label>
          <input
            class="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-sm disabled:bg-amber-50"
            :value="localEndpointChat.endpointUrl"
            :disabled="disabled || !localEndpointChat.enabled"
            placeholder="http://localhost:1234/v1"
            data-testid="local-endpoint-chat-url"
            @input="emit('updateLocalEndpointChatUrl', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-amber-900">Manual model id</label>
          <input
            class="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-sm disabled:bg-amber-50"
            :value="localEndpointChat.model"
            :disabled="disabled || !localEndpointChat.enabled"
            placeholder="local-model"
            data-testid="local-endpoint-chat-model"
            @input="emit('updateLocalEndpointChatModel', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="text-[11px] text-amber-800" data-testid="local-endpoint-chat-warning">
          Text-only loopback OpenAI-compatible streaming. Attachments, web, tools, image generation, reasoning, secrets, and model-picker publication are disabled.
        </div>
        <div class="rounded border border-amber-100 bg-white px-2 py-1.5 text-[11px] text-amber-900" data-testid="local-endpoint-chat-selected-status">
          <div>Experimental LocalEndpoint chat is {{ localEndpointChatStatusLabel }}.</div>
          <div>Selected endpoint: {{ localEndpointChat.endpointUrl || 'none' }}</div>
          <div>Selected local model: {{ localEndpointChat.model || 'none' }}</div>
          <div>Experimental local chat is separate from OpenRouter and does not use API keys or custom headers.</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            :disabled="disabled || !localEndpointChat.enabled"
            data-testid="local-endpoint-chat-disable"
            @click="emit('updateLocalEndpointChatEnabled', false)"
          >
            Disable LocalEndpoint chat
          </button>
          <button
            type="button"
            class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            :disabled="disabled"
            data-testid="local-endpoint-chat-clear"
            @click="emit('clearLocalEndpointChat')"
          >
            Clear LocalEndpoint chat settings
          </button>
        </div>
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

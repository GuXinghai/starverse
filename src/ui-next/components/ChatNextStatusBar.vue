<script setup lang="ts">
import { computed } from 'vue'
import type { RunVM } from '@/next/state/types'
import ChatStatusBar from '@/ui-kit/chat/ChatStatusBar.vue'
import type { TokenUsage } from '@/next/state/selectors'

const props = defineProps<{
  run: RunVM | null
  isRunning: boolean
  usageThisTurn: TokenUsage | null
  usageSessionTotalDerived: TokenUsage | null
  showDerivedUsage: boolean
  canFetchGenerationInfo: boolean
  fetchingGenerationInfo: boolean
  generationInfo: unknown | null
  generationInfoError: string | null
}>()

const emit = defineEmits<{
  abort: []
  reset: []
  toggleDerivedUsage: []
  fetchGenerationInfo: []
  clearGenerationInfo: []
}>()

const isDev = (import.meta as any).env?.DEV === true
const showDerived = computed(() => isDev && props.showDerivedUsage)
</script>

<template>
  <div>
    <ChatStatusBar
      title="Chat Next"
      :run="props.run"
      :isRunning="props.isRunning"
      :showReset="true"
      :usageThisTurn="props.usageThisTurn"
      :usageSessionTotalDerived="props.usageSessionTotalDerived"
      :showSessionTotalDerived="showDerived"
      @abort="emit('abort')"
      @reset="emit('reset')"
    >
      <template v-if="isDev" #actions>
        <button
          class="rounded-lg bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200"
          type="button"
          @click="emit('toggleDerivedUsage')"
        >
          {{ props.showDerivedUsage ? 'Hide session total' : 'Show session total' }}
        </button>
        <button
          class="rounded-lg bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 disabled:opacity-50"
          type="button"
          :disabled="!props.canFetchGenerationInfo || props.fetchingGenerationInfo"
          @click="emit('fetchGenerationInfo')"
        >
          {{ props.fetchingGenerationInfo ? 'Fetching...' : 'Fetch generation metadata' }}
        </button>
        <button
          v-if="props.generationInfo"
          class="rounded-lg bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200"
          type="button"
          @click="emit('clearGenerationInfo')"
        >
          Hide
        </button>
      </template>
    </ChatStatusBar>

    <div v-if="isDev && props.generationInfoError" class="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900">
      <span class="font-semibold">generation fetch error:</span> {{ props.generationInfoError }}
    </div>

    <div v-if="isDev && props.generationInfo" class="border-b border-gray-200 bg-gray-50 px-4 py-3">
      <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Generation metadata</div>
      <pre class="whitespace-pre-wrap text-xs text-gray-800">{{ JSON.stringify(props.generationInfo, null, 2) }}</pre>
    </div>
  </div>
</template>

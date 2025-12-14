<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChatRun, type DemoScenario, type RunMode } from './useChatRun'
import ChatLayout from '@/ui-kit/chat/ChatLayout.vue'
import ChatNextComposer from './components/ChatNextComposer.vue'
import ChatNextTranscript from './components/ChatNextTranscript.vue'
import ChatNextReasoningPanel from './components/ChatNextReasoningPanel.vue'
import ChatNextStatusBar from './components/ChatNextStatusBar.vue'
import { fetchGenerationInfo, type GenerationInfo } from '@/next/transport/fetchGeneration'

const {
  runVM,
  transcript,
  isRunning,
  usageThisTurn,
  usageSessionTotalDerived,
  dispatchSend,
  dispatchAbort,
  dispatchToggleReasoningPanelState,
  resetRun,
} = useChatRun()

const draft = ref('')
const scenario = ref<DemoScenario>('normal')
const mode = ref<RunMode>('live')
const model = ref('openrouter/auto')
const reasoningExclude = ref(false)
const reasoningEffort = ref<'auto' | 'none' | 'medium' | 'high' | 'xhigh'>('auto')
const apiKey = ref((import.meta as any).env?.VITE_OPENROUTER_API_KEY ?? '')
const showDerivedUsage = ref(false)

const generationInfo = ref<GenerationInfo | null>(null)
const generationInfoError = ref<string | null>(null)
const fetchingGenerationInfo = ref(false)

const canSend = computed(() => !isRunning.value && draft.value.trim().length > 0)
const activeMessageId = computed(() => transcript.value.find((m) => m.streaming.isTarget)?.messageId)
const isDev = (import.meta as any).env?.DEV === true

const canFetchGenerationInfo = computed(() => {
  if (!isDev) return false
  if (mode.value !== 'live') return false
  if (!runVM.value?.generationId) return false
  return apiKey.value.trim().length > 0
})

async function onSend() {
  if (!canSend.value) return
  const text = draft.value
  draft.value = ''
  await dispatchSend({
    text,
    scenario: scenario.value,
    mode: mode.value,
    live: {
      apiKey: apiKey.value,
      model: model.value,
      reasoningExclude: reasoningExclude.value,
      ...(reasoningEffort.value === 'auto' ? {} : { reasoningEffort: reasoningEffort.value }),
    },
  })
}

async function onFetchGenerationInfo() {
  if (!runVM.value?.generationId) return
  if (apiKey.value.trim().length === 0) {
    generationInfoError.value = 'Missing apiKey (set VITE_OPENROUTER_API_KEY or input in dev UI)'
    return
  }

  fetchingGenerationInfo.value = true
  generationInfoError.value = null
  try {
    generationInfo.value = await fetchGenerationInfo(runVM.value.generationId, apiKey.value)
  } catch (err: any) {
    generationInfoError.value = err?.message ? String(err.message) : String(err)
  } finally {
    fetchingGenerationInfo.value = false
  }
}

function onClearGenerationInfo() {
  generationInfo.value = null
  generationInfoError.value = null
}
</script>

<template>
  <ChatLayout sidePanel="right">
    <template #status>
      <ChatNextStatusBar
        :run="runVM"
        :isRunning="isRunning"
        :usageThisTurn="usageThisTurn"
        :usageSessionTotalDerived="usageSessionTotalDerived"
        :showDerivedUsage="showDerivedUsage"
        :canFetchGenerationInfo="canFetchGenerationInfo"
        :fetchingGenerationInfo="fetchingGenerationInfo"
        :generationInfo="generationInfo"
        :generationInfoError="generationInfoError"
        @toggleDerivedUsage="showDerivedUsage = !showDerivedUsage"
        @fetchGenerationInfo="onFetchGenerationInfo"
        @clearGenerationInfo="onClearGenerationInfo"
        @abort="dispatchAbort"
        @reset="resetRun"
      />
    </template>

    <template #transcript>
      <ChatNextTranscript :messages="transcript" :activeMessageId="activeMessageId" :error="runVM?.error" />
    </template>

    <template #side>
      <ChatNextReasoningPanel :messages="transcript" @toggle-panel-state="dispatchToggleReasoningPanelState" />
    </template>

    <template #composer>
      <ChatNextComposer
        v-model:draft="draft"
        v-model:scenario="scenario"
        v-model:mode="mode"
        v-model:model="model"
        v-model:apiKey="apiKey"
        v-model:reasoningExclude="reasoningExclude"
        v-model:reasoningEffort="reasoningEffort"
        :disabled="isRunning"
        @send="onSend"
        @abort="dispatchAbort"
      />
    </template>
  </ChatLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useChatRun, type DemoScenario, type RunMode } from './useChatRun'
import ChatLayout from '@/ui-kit/chat/ChatLayout.vue'
import ChatNextComposer from './components/ChatNextComposer.vue'
import ChatNextTranscript from './components/ChatNextTranscript.vue'
import ChatNextReasoningPanel from './components/ChatNextReasoningPanel.vue'
import ChatNextStatusBar from './components/ChatNextStatusBar.vue'
import { fetchGenerationInfo, type GenerationInfo } from '@/next/transport/fetchGeneration'
import { listModelCatalog } from '@/next/modelCatalog/modelCatalogClient'
import { selectModelCatalogVisible, selectModelCatalogAll } from '@/next/modelCatalog/modelCatalogSelectors'
import type { ModelCatalogItem } from '@/next/modelCatalog/modelCatalogTypes'
import { listReasoningModelIndex } from '@/next/modelIndex/reasoningModelIndexClient'
import { selectReasoningModelIndexVisible, selectReasoningModelIndexAll } from '@/next/modelIndex/reasoningModelIndexSelectors'
import type { ReasoningModelIndexItem } from '@/next/modelIndex/reasoningModelIndexTypes'
import type { ReasoningEffort, RequestedReasoningMode } from '@/next/state/types'

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
const requestedReasoningExclude = ref(false)
const requestedReasoningEffort = ref<'auto' | ReasoningEffort>('none')
const apiKey = ref((import.meta as any).env?.VITE_OPENROUTER_API_KEY ?? '')
const showDerivedUsage = ref(false)

const modelCatalogItems = ref<ModelCatalogItem[]>([])
const reasoningModelIndexItems = ref<ReasoningModelIndexItem[]>([])
const showHiddenModelsInPickers = ref(false)

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

const modelCatalogForPicker = computed(() =>
  showHiddenModelsInPickers.value ? selectModelCatalogAll(modelCatalogItems.value) : selectModelCatalogVisible(modelCatalogItems.value)
)

const reasoningModelIndexForPicker = computed(() =>
  showHiddenModelsInPickers.value
    ? selectReasoningModelIndexAll(reasoningModelIndexItems.value)
    : selectReasoningModelIndexVisible(reasoningModelIndexItems.value)
)

type IpcRendererLike = Readonly<{
  on: (channel: string, listener: (...args: any[]) => void) => any
}>

function getIpcRenderer(): IpcRendererLike | null {
  const ipc = (globalThis as any).ipcRenderer as IpcRendererLike | undefined
  return ipc && typeof ipc.on === 'function' ? ipc : null
}

async function refreshModelLists() {
  modelCatalogItems.value = await listModelCatalog('openrouter')
  reasoningModelIndexItems.value = await listReasoningModelIndex()
}

const onModelsSynced = async () => {
  await refreshModelLists()
}

onMounted(() => {
  void refreshModelLists()
  const ipc = getIpcRenderer()
  if (!ipc) return
  ipc.on('db:modelCatalogSynced', onModelsSynced)
})

async function onSend() {
  if (!canSend.value) return
  const text = draft.value
  draft.value = ''

  const requestedReasoningMode: RequestedReasoningMode = requestedReasoningEffort.value === 'auto' ? 'auto' : 'effort'
  const requestedReasoningEffortValue: ReasoningEffort | undefined =
    requestedReasoningMode === 'auto' ? undefined : (requestedReasoningEffort.value as ReasoningEffort)
  const exclude = requestedReasoningMode === 'auto' ? false : requestedReasoningExclude.value

  await dispatchSend({
    text,
    scenario: scenario.value,
    mode: mode.value,
    live: {
      apiKey: apiKey.value,
      model: model.value,
      requestedReasoningMode,
      ...(requestedReasoningEffortValue ? { requestedReasoningEffort: requestedReasoningEffortValue } : {}),
      ...(exclude ? { requestedReasoningExclude: true } : {}),
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
        v-model:requestedReasoningExclude="requestedReasoningExclude"
        v-model:requestedReasoningEffort="requestedReasoningEffort"
        :modelCatalog="modelCatalogForPicker"
        :reasoningModelIndex="reasoningModelIndexForPicker"
        :showHiddenModelsInPickers="showHiddenModelsInPickers"
        :disabled="isRunning"
        @toggleShowHiddenModelsInPickers="showHiddenModelsInPickers = !showHiddenModelsInPickers"
        @send="onSend"
        @abort="dispatchAbort"
      />
    </template>
  </ChatLayout>
</template>

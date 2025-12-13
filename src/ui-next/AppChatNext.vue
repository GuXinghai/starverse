<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChatRun, type DemoScenario } from './useChatRun'
import ChatNextComposer from './components/ChatNextComposer.vue'
import ChatNextTranscript from './components/ChatNextTranscript.vue'
import ChatNextReasoningPanel from './components/ChatNextReasoningPanel.vue'
import ChatNextStatusBar from './components/ChatNextStatusBar.vue'

const { runVM, transcript, isRunning, dispatchSend, dispatchAbort, resetRun } = useChatRun()

const draft = ref('')
const scenario = ref<DemoScenario>('normal')

const canSend = computed(() => !isRunning.value && draft.value.trim().length > 0)

async function onSend() {
  if (!canSend.value) return
  const text = draft.value
  draft.value = ''
  await dispatchSend({ text, scenario: scenario.value })
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <ChatNextStatusBar :run="runVM" :isRunning="isRunning" @abort="dispatchAbort" @reset="resetRun" />

    <div class="flex min-h-0 flex-1">
      <div class="min-h-0 flex-1 border-r border-gray-200">
        <ChatNextTranscript :messages="transcript" />
      </div>
      <div class="w-80 flex-shrink-0">
        <ChatNextReasoningPanel :messages="transcript" />
      </div>
    </div>

    <div class="border-t border-gray-200">
      <ChatNextComposer
        v-model:draft="draft"
        v-model:scenario="scenario"
        :disabled="isRunning"
        @send="onSend"
        @abort="dispatchAbort"
      />
    </div>
  </div>
</template>

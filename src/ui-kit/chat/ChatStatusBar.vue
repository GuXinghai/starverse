<script setup lang="ts">
import { computed } from 'vue'
import type { RunVM } from './types'

type TokenUsage = Readonly<{
  promptTokens: number
  completionTokens: number
  totalTokens: number
}>

const props = withDefaults(
  defineProps<{
    title?: string
    run: RunVM | null
    isRunning: boolean
    showAbort?: boolean
    showReset?: boolean
    showUsage?: boolean
    usageThisTurn?: TokenUsage | null
    usageSessionTotalDerived?: TokenUsage | null
    showSessionTotalDerived?: boolean
  }>(),
  {
    title: 'Chat',
    showAbort: true,
    showReset: false,
    showUsage: true,
    showSessionTotalDerived: false,
  },
)

const emit = defineEmits<{
  abort: []
  reset: []
}>()

type Tone = 'gray' | 'blue' | 'green' | 'red' | 'amber'

const statusTone = computed<Tone>(() => {
  const s = props.run?.status
  switch (s) {
    case 'requesting':
    case 'streaming':
      return 'blue'
    case 'done':
      return 'green'
    case 'error':
      return 'red'
    case 'aborted':
      return 'amber'
    default:
      return 'gray'
  }
})

const statusPillClass = computed(() => {
  switch (statusTone.value) {
    case 'blue':
      return 'bg-blue-50 text-blue-800 ring-blue-200'
    case 'green':
      return 'bg-green-50 text-green-800 ring-green-200'
    case 'red':
      return 'bg-red-50 text-red-800 ring-red-200'
    case 'amber':
      return 'bg-amber-50 text-amber-900 ring-amber-200'
    default:
      return 'bg-gray-100 text-gray-800 ring-gray-200'
  }
})

const errorText = computed(() => {
  const err = props.run?.error
  if (!err) return null
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err, null, 2)
  } catch {
    return String(err)
  }
})

const usageSummary = computed(() => {
  const direct = props.usageThisTurn
  if (direct) return { pt: direct.promptTokens, ct: direct.completionTokens, tt: direct.totalTokens }

  if (!props.run?.usage || typeof props.run.usage !== 'object') return null
  const u = props.run.usage as any
  const pt = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : null
  const ct = typeof u.completion_tokens === 'number' ? u.completion_tokens : null
  const tt = typeof u.total_tokens === 'number' ? u.total_tokens : null
  if (pt == null && ct == null && tt == null) return null
  return { pt: pt ?? 0, ct: ct ?? 0, tt: tt ?? 0 }
})

const derivedUsageSummary = computed(() => {
  const u = props.usageSessionTotalDerived
  if (!u) return null
  return { pt: u.promptTokens, ct: u.completionTokens, tt: u.totalTokens }
})
</script>

<template>
  <div class="border-b border-gray-200 bg-white">
    <div class="flex flex-wrap items-center gap-3 px-4 py-3 text-xs text-gray-700">
      <div class="flex items-center gap-2">
        <div class="font-semibold text-gray-900">{{ props.title }}</div>
        <span
          v-if="props.run"
          class="rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1"
          :class="statusPillClass"
        >
          {{ props.run.status }}
        </span>
      </div>

      <div v-if="props.run" class="flex flex-wrap items-center gap-3">
        <div v-if="props.run.model">
          model: <span class="font-mono">{{ props.run.model }}</span>
        </div>
        <div v-if="props.run.provider">
          provider: <span class="font-mono">{{ props.run.provider }}</span>
        </div>
        <div v-if="props.run.generationId">
          gen: <span class="font-mono">{{ props.run.generationId }}</span>
        </div>
        <div v-if="props.run.finishReason">
          finish: <span class="font-mono">{{ props.run.finishReason }}</span>
        </div>
        <div v-if="props.showUsage && usageSummary" class="flex flex-wrap items-center gap-2">
          <span class="text-gray-500">This turn</span>
          <span class="rounded bg-black/5 px-2 py-0.5 font-mono">p={{ usageSummary.pt }}</span>
          <span class="rounded bg-black/5 px-2 py-0.5 font-mono">c={{ usageSummary.ct }}</span>
          <span class="rounded bg-black/5 px-2 py-0.5 font-mono">t={{ usageSummary.tt }}</span>
        </div>
        <div
          v-if="props.showUsage && props.showSessionTotalDerived && derivedUsageSummary"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="text-gray-500">Session total (derived)</span>
          <span class="rounded bg-black/5 px-2 py-0.5 font-mono">p={{ derivedUsageSummary.pt }}</span>
          <span class="rounded bg-black/5 px-2 py-0.5 font-mono">c={{ derivedUsageSummary.ct }}</span>
          <span class="rounded bg-black/5 px-2 py-0.5 font-mono">t={{ derivedUsageSummary.tt }}</span>
        </div>
      </div>

      <div class="ml-auto flex gap-2">
        <slot name="actions" />
        <button
          v-if="props.showAbort"
          class="rounded-lg bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 disabled:opacity-50"
          :disabled="!props.isRunning"
          @click="emit('abort')"
        >
          Abort
        </button>
        <button
          v-if="props.showReset"
          class="rounded-lg bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200"
          @click="emit('reset')"
        >
          Reset
        </button>
      </div>
    </div>

    <div v-if="errorText" class="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900">
      <span class="font-semibold">error:</span> <span class="font-mono">{{ errorText }}</span>
    </div>
  </div>
</template>

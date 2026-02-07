<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ErrorPanelViewModel } from './types'

const props = defineProps<{
  messageId: string
  errorView?: ErrorPanelViewModel | null
  bytes?: number | null
  loading?: boolean
  detailsUnavailable?: boolean
  onRequestEnvelope?: (messageId: string) => void
}>()

const expanded = ref(false)

const completionClass = computed(() => props.errorView?.completionClass ?? 'error')
const phase = computed(() => props.errorView?.phase ?? 'unknown')
const isTruncatedClass = computed(() => completionClass.value === 'truncated')

const provider = computed(() => props.errorView?.provider ?? 'unknown')
const code = computed(() => props.errorView?.code ?? 'error')
const message = computed(() => props.errorView?.message ?? 'Unknown error')

const summaryText = computed(() => {
  return `phase:${phase.value} · code:${code.value} · ${message.value} · provider:${provider.value}`
})

const panelTone = computed(() => {
  switch (completionClass.value) {
    case 'aborted':
      return 'border-gray-200 bg-gray-50 text-gray-700'
    case 'truncated':
      return 'border-amber-200 bg-amber-50 text-amber-900'
    case 'error':
    default:
      return 'border-red-200 bg-red-50 text-red-900'
  }
})

const jsonText = computed(() => {
  if (!props.errorView?.details) return ''
  try {
    return JSON.stringify(props.errorView.details, null, 2)
  } catch {
    return String(props.errorView.details)
  }
})

const jsonBytes = computed(() => {
  if (typeof props.bytes === 'number' && Number.isFinite(props.bytes)) return props.bytes
  if (!props.errorView?.details) return null
  try {
    return new TextEncoder().encode(jsonText.value).length
  } catch {
    return jsonText.value.length
  }
})

function toggleExpanded() {
  const next = !expanded.value
  expanded.value = next
  if (next && !props.errorView?.details && props.onRequestEnvelope) {
    props.onRequestEnvelope(props.messageId)
  }
}

async function copyJson() {
  if (!props.errorView?.details) return
  try {
    await navigator.clipboard.writeText(jsonText.value)
  } catch {
    // no-op
  }
}
</script>

<template>
  <div class="mt-3 rounded-xl border p-3 text-xs" :class="panelTone">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <div class="truncate font-semibold uppercase tracking-wide">
            {{ completionClass }}
          </div>
          <span
            v-if="isTruncatedClass"
            class="rounded-full border border-amber-300/80 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800"
          >
            Truncated<span v-if="props.errorView?.truncated" class="ml-1 opacity-70">trimmed</span>
          </span>
        </div>
        <div class="mt-1 break-words">{{ summaryText }}</div>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
          @click="toggleExpanded"
        >
          {{ expanded ? 'Collapse' : 'Expand' }}
        </button>
      </div>
    </div>

    <div v-if="expanded" class="mt-2 space-y-2">
      <div class="flex items-center justify-between">
        <div class="text-[11px] font-semibold uppercase tracking-wide opacity-70">Details</div>
        <div class="flex items-center gap-2">
          <div v-if="jsonBytes != null" class="text-[10px] uppercase tracking-wide opacity-60">bytes: {{ jsonBytes }}</div>
          <button
            v-if="props.errorView?.details"
            type="button"
            class="rounded border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
            @click="copyJson"
          >
            Copy
          </button>
        </div>
      </div>
      <div v-if="!props.errorView?.details" class="rounded border border-black/10 bg-black/5 p-2 text-[11px] text-gray-600">
        <div v-if="props.loading">Details loading…</div>
        <div v-else-if="props.detailsUnavailable">Details unavailable.</div>
        <div v-else>Details pending.</div>
      </div>
      <pre
        v-else-if="props.errorView?.details"
        class="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-black/10 bg-black/5 p-2 font-mono text-[11px]"
      >{{ jsonText }}</pre>
    </div>
  </div>
</template>

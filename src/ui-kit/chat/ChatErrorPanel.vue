<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'

const props = defineProps<{
  messageId: string
  envelope?: ErrorEnvelope | null
  summary?: Readonly<{
    completionClass?: string
    phase?: string
    code?: string
    message?: string
    provider?: string
  }> | null
  completionClass?: string
  bytes?: number | null
  loading?: boolean
  detailsUnavailable?: boolean
  onRequestEnvelope?: (messageId: string) => void
}>()

const expanded = ref(false)

const completionClass = computed(
  () => props.envelope?.completionClass ?? props.summary?.completionClass ?? props.completionClass ?? 'error'
)
const phase = computed(() => props.envelope?.phase ?? props.summary?.phase ?? 'unknown')
const isTruncatedClass = computed(() => completionClass.value === 'truncated')

const provider = computed(() => {
  const direct = props.envelope?.openrouter?.provider
  if (direct && direct.trim().length > 0) return direct
  const meta = props.envelope?.openrouter?.metadata as any
  const name = meta && typeof meta === 'object' ? meta.provider_name : undefined
  if (typeof name === 'string' && name.trim().length > 0) return name
  const summaryProvider = props.summary?.provider
  if (typeof summaryProvider === 'string' && summaryProvider.trim().length > 0) return summaryProvider
  return 'unknown'
})

const code = computed(() => props.envelope?.openrouter?.code ?? props.summary?.code ?? 'error')
const message = computed(() => props.envelope?.openrouter?.message ?? props.summary?.message ?? 'Unknown error')

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
  if (!props.envelope) return ''
  try {
    return JSON.stringify(props.envelope, null, 2)
  } catch {
    return String(props.envelope)
  }
})

const jsonBytes = computed(() => {
  if (typeof props.bytes === 'number' && Number.isFinite(props.bytes)) return props.bytes
  if (!props.envelope) return null
  try {
    return new TextEncoder().encode(jsonText.value).length
  } catch {
    return jsonText.value.length
  }
})

function toggleExpanded() {
  const next = !expanded.value
  expanded.value = next
  if (next && !props.envelope && props.onRequestEnvelope) {
    props.onRequestEnvelope(props.messageId)
  }
}

async function copyJson() {
  if (!props.envelope) return
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
            Truncated<span v-if="props.envelope?.truncated" class="ml-1 opacity-70">trimmed</span>
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
            v-if="props.envelope"
            type="button"
            class="rounded border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
            @click="copyJson"
          >
            Copy
          </button>
        </div>
      </div>
      <div v-if="!props.envelope" class="rounded border border-black/10 bg-black/5 p-2 text-[11px] text-gray-600">
        <div v-if="props.loading">Details loading…</div>
        <div v-else-if="props.detailsUnavailable">Details unavailable.</div>
        <div v-else>Details pending.</div>
      </div>
      <pre
        v-else
        class="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-black/10 bg-black/5 p-2 font-mono text-[11px]"
      >{{ jsonText }}</pre>
    </div>
  </div>
</template>

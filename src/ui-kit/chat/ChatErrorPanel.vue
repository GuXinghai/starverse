<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ErrorPanelViewModel } from './types'
import { t, tf } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'

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
const message = computed(() => props.errorView?.message ?? t('chat.errorPanel.unknownError'))

const summaryText = computed(() => {
  return tf('chat.errorPanel.summary', {
    phase: phase.value,
    code: code.value,
    message: message.value,
    provider: provider.value,
  })
})

const panelTone = computed(() => {
  switch (completionClass.value) {
    case 'aborted':
      return 'sv-notice'
    case 'truncated':
      return 'sv-notice sv-notice-warning'
    case 'error':
    default:
      return 'sv-notice sv-notice-danger'
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
  <div class="mt-3 flex-col items-stretch gap-0 p-3 text-xs" :class="panelTone">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2">
          <div class="truncate font-medium">
            {{ completionClass }}
          </div>
          <span
            v-if="isTruncatedClass"
            class="shrink-0 opacity-80"
          >
            {{ t('chat.errorPanel.truncated') }}<span v-if="props.errorView?.truncated" class="ml-1 opacity-70">{{ t('chat.errorPanel.trimmed') }}</span>
          </span>
        </div>
        <div class="mt-1 break-words">{{ summaryText }}</div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="sv-btn sv-btn-sm sv-btn-ghost w-[88px] justify-end gap-1 px-1.5"
          :aria-expanded="expanded"
          @click="toggleExpanded"
        >
          {{ expanded ? t('chat.errorPanel.collapse') : t('chat.errorPanel.expand') }}
          <span class="inline-flex h-3.5 w-3.5 items-center justify-center"><UiIcon :name="expanded ? 'chevronUp' : 'chevronDown'" :size="14" /></span>
        </button>
      </div>
    </div>

    <div v-if="expanded" class="mt-2 flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <div class="font-medium opacity-80">{{ t('chat.errorPanel.details') }}</div>
        <div class="flex items-center gap-2">
          <div v-if="jsonBytes != null" class="opacity-70">{{ tf('chat.errorPanel.bytes', { count: jsonBytes }) }}</div>
          <button
            v-if="props.errorView?.details"
            type="button"
            class="sv-btn sv-btn-sm sv-btn-ghost"
            @click="copyJson"
          >
            {{ t('common.copy') }}
          </button>
        </div>
      </div>
      <div v-if="!props.errorView?.details" class="rounded-md bg-[var(--sv-sunken)] p-2 text-xs text-[var(--sv-text-2)]">
        <div v-if="props.loading">{{ t('chat.errorPanel.detailsLoading') }}</div>
        <div v-else-if="props.detailsUnavailable">{{ t('chat.errorPanel.detailsUnavailable') }}</div>
        <div v-else>{{ t('chat.errorPanel.detailsPending') }}</div>
      </div>
      <pre
        v-else-if="props.errorView?.details"
        class="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--sv-sunken)] p-2 font-mono text-xs text-[var(--sv-text-2)]"
      >{{ jsonText }}</pre>
    </div>
  </div>
</template>

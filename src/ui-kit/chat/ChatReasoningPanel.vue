<script setup lang="ts">
import { computed } from 'vue'
import type { ReasoningPiece, ReasoningView } from './types'
import ReasoningRichText from './ReasoningRichText.vue'
import { t } from '@/shared/i18n'

const props = withDefaults(
  defineProps<{
    reasoningView: ReasoningView | null
    reasoningPieces?: ReasoningPiece[] | null
    isStreaming?: boolean
    title?: string
    emptyText?: string
    localProcessingDurationMs?: number
  }>(),
  {
    title: '',
    emptyText: '',
  },
)

const reasoningPieces = computed(() => {
  const pieces = props.reasoningPieces ?? props.reasoningView?.reasoningPieces
  if (!Array.isArray(pieces)) return null
  const normalized = pieces.filter((piece) => typeof piece?.text === 'string' && piece.text.trim().length > 0)
  return normalized.length > 0 ? normalized : null
})

const hasPieces = computed(() => Array.isArray(reasoningPieces.value) && reasoningPieces.value.length > 0)

const hasAnyReasoningText = computed(() => {
  if (!props.reasoningView) return false
  const hasText = Boolean(props.reasoningView.summaryText || props.reasoningView.reasoningText)
  return hasText || hasPieces.value
})

const reasoningBodyText = computed(() => {
  const parts: string[] = []
  const reasoningText = props.reasoningView?.reasoningText
  if (typeof reasoningText === 'string' && reasoningText.trim().length > 0) {
    parts.push(reasoningText)
  }
  if (reasoningPieces.value && reasoningPieces.value.length > 0) {
    parts.push(reasoningPieces.value.map((piece) => piece.text).join(''))
  }
  return parts.join('\n\n')
})

const showEncryptedBadge = computed(() => props.reasoningView?.hasEncrypted === true)

const formattedDuration = computed(() => {
  const ms = props.localProcessingDurationMs
  if (typeof ms !== 'number' || ms < 0) return null
  return `${(ms / 1000).toFixed(2)}s`
})
</script>

<template>
  <div class="h-full overflow-auto bg-white p-4">
    <div class="mb-2 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <div class="text-sm font-semibold text-gray-800">{{ props.title || t('common.summary') }}</div>
          <span
            v-if="showEncryptedBadge"
            class="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900"
          >
            {{ t('common.encrypted') }}
          </span>
          <span
            v-if="formattedDuration"
            class="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-900"
          >
            {{ formattedDuration }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

      <slot v-if="!props.reasoningView" name="empty">
        <div class="text-sm text-gray-500">{{ props.emptyText || t('common.loading') }}</div>
      </slot>

    <div v-else class="space-y-2">
      <div class="space-y-2 text-sm">
        <template v-if="props.reasoningView.visibility === 'shown'">
          <div v-if="props.reasoningView.hasEncrypted === true" class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <div class="text-xs font-semibold uppercase tracking-wide">{{ t('chat.reasoning.encryptedTitle') }}</div>
            <div class="mt-1 text-sm">{{ t('chat.reasoning.encryptedDescription') }}</div>
          </div>

          <div v-if="props.reasoningView.summaryText" class="rounded border border-gray-200 bg-white p-2">
            <div class="mb-1 text-xs font-semibold text-gray-700">{{ t('common.summary') }}</div>
            <ReasoningRichText
              :text="props.reasoningView.summaryText"
              :streaming="props.isStreaming === true"
            />
          </div>

          <div v-if="reasoningBodyText" class="rounded border border-gray-200 bg-white p-2">
            <ReasoningRichText
              :text="reasoningBodyText"
              :streaming="props.isStreaming === true"
            />
          </div>

          <div v-if="!hasAnyReasoningText" class="text-sm text-gray-500">{{ t('chat.reasoning.noPayloadShort') }}</div>
        </template>

        <template v-else-if="props.reasoningView.visibility === 'excluded'">
          <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {{ t('chat.reasoning.excluded') }}
          </div>
        </template>

        <template v-else-if="props.reasoningView.visibility === 'not_returned'">
          <div class="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            {{ t('chat.reasoning.notReturned') }}
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

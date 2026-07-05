<script setup lang="ts">
import { computed } from 'vue'
import type { LegacyReasoningPiece, ReasoningView } from './types'
import ReasoningRichText from './ReasoningRichText.vue'
import { t } from '@/shared/i18n'

const props = withDefaults(
  defineProps<{
    messageId?: string | null
    reasoningView: ReasoningView | null
    legacyReasoningPieces?: LegacyReasoningPiece[] | null
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

const legacyReasoningPieces = computed(() => {
  const pieces = props.legacyReasoningPieces ?? props.reasoningView?.reasoningPieces
  if (!Array.isArray(pieces)) return null
  const normalized = pieces.filter((piece) => {
    if (piece?.type === 'text') return piece.text.trim().length > 0
    if (piece?.type === 'image') return piece.url.trim().length > 0
    return false
  })
  return normalized.length > 0 ? normalized : null
})

const displayBlocks = computed(() => {
  const blocks = props.reasoningView?.displayBlocks
  if (!Array.isArray(blocks)) return null
  const normalized = blocks.filter((block) => {
    if (block?.type === 'text') return block.text.trim().length > 0
    if (block?.type === 'image') return block.url.trim().length > 0
    if (block?.type === 'opaque') return block.label.trim().length > 0
    return false
  })
  return normalized.length > 0 ? normalized : null
})

const hasDisplayBlocks = computed(() => Array.isArray(displayBlocks.value) && displayBlocks.value.length > 0)
const hasLegacyPieces = computed(() => Array.isArray(legacyReasoningPieces.value) && legacyReasoningPieces.value.length > 0)

const hasAnyReasoningText = computed(() => {
  if (!props.reasoningView) return false
  const hasText = Boolean(props.reasoningView.summaryText || props.reasoningView.reasoningText)
  return hasText || hasLegacyPieces.value || hasDisplayBlocks.value
})

const shouldRenderStandaloneText = computed(() => !hasLegacyPieces.value && !hasDisplayBlocks.value)

const reasoningBodyText = computed(() => {
  if (!shouldRenderStandaloneText.value) return ''
  const parts: string[] = []
  const reasoningText = props.reasoningView?.reasoningText
  if (typeof reasoningText === 'string' && reasoningText.trim().length > 0) {
    parts.push(reasoningText)
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

          <div v-if="shouldRenderStandaloneText && props.reasoningView.summaryText" class="rounded border border-gray-200 bg-white p-2">
            <div class="mb-1 text-xs font-semibold text-gray-700">{{ t('common.summary') }}</div>
            <ReasoningRichText
              :text="props.reasoningView.summaryText"
              :streaming="props.isStreaming === true"
            />
          </div>

          <div v-if="hasDisplayBlocks" class="space-y-2 rounded border border-gray-200 bg-white p-2">
            <template v-for="block in displayBlocks ?? []" :key="block.blockId">
              <ReasoningRichText
                v-if="block.type === 'text'"
                :text="block.text"
                :streaming="props.isStreaming === true"
              />
              <img
                v-if="block.type === 'image'"
                :src="block.url"
                class="max-h-96 max-w-full rounded border border-gray-200 object-contain"
                alt=""
              />
              <div
                v-if="block.type === 'opaque'"
                class="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600"
              >
                {{ block.label }}
              </div>
            </template>
          </div>

          <div v-else-if="reasoningBodyText || hasLegacyPieces" class="space-y-2 rounded border border-gray-200 bg-white p-2">
            <ReasoningRichText
              v-if="reasoningBodyText"
              :text="reasoningBodyText"
              :streaming="props.isStreaming === true"
            />
            <template v-for="piece in legacyReasoningPieces ?? []" :key="piece.id">
              <ReasoningRichText
                v-if="piece.type === 'text'"
                :text="piece.text"
                :streaming="props.isStreaming === true"
              />
              <img
                v-if="piece.type === 'image'"
                :src="piece.url"
                class="max-h-96 max-w-full rounded border border-gray-200 object-contain"
                alt=""
              />
            </template>
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

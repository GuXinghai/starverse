<script setup lang="ts">
import { computed } from 'vue'
import type { ReasoningView } from './types'
import ReasoningRichText from './ReasoningRichText.vue'
import { t } from '@/shared/i18n'

const props = withDefaults(
  defineProps<{
    messageId?: string | null
    reasoningView: ReasoningView | null
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

const showEncryptedBadge = computed(() => props.reasoningView?.hasEncrypted === true)

function semanticLabel(role: string | undefined): string | null {
  if (role === 'summary') return t('chat.reasoning.summaryTitle')
  if (role === 'reasoning') return t('chat.reasoning.processTitle')
  if (role === 'thinking' || role === 'thought') return t('chat.reasoning.thinkingTitle')
  return null
}

function opaqueLabel(block: Readonly<{ label: string; opaqueKind?: string }>): string {
  if (block.opaqueKind === 'encrypted') return t('chat.reasoning.opaqueEncrypted')
  if (block.opaqueKind === 'omitted') return t('chat.reasoning.opaqueOmitted')
  if (block.opaqueKind === 'redacted') return t('chat.reasoning.opaqueRedacted')
  return block.label
}

const formattedDuration = computed(() => {
  const ms = props.localProcessingDurationMs
  if (typeof ms !== 'number' || ms < 0) return null
  return `${(ms / 1000).toFixed(2)}s`
})

</script>

<template>
  <div class="h-full overflow-auto bg-white p-4">
    <div class="mb-3 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <div class="text-sm font-medium text-[var(--sv-text)]">{{ props.title || t('common.summary') }}</div>
          <span v-if="showEncryptedBadge" class="sv-meta">
            {{ t('common.encrypted') }}
          </span>
          <span v-if="formattedDuration" class="sv-meta font-mono">
            {{ formattedDuration }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

    <slot v-if="!props.reasoningView" name="empty">
      <div class="text-sm text-[var(--sv-text-3)]">{{ props.emptyText || t('common.loading') }}</div>
    </slot>

    <div v-else class="flex flex-col gap-3">
      <div class="flex flex-col gap-3 text-sm">
        <template v-if="props.reasoningView.visibility === 'shown'">
          <div v-if="props.reasoningView.hasEncrypted === true" class="sv-notice flex-col items-stretch gap-1 p-3">
            <div class="text-xs font-medium text-[var(--sv-text)]">{{ t('chat.reasoning.encryptedTitle') }}</div>
            <div class="text-sm">{{ t('chat.reasoning.encryptedDescription') }}</div>
          </div>

          <div v-if="hasDisplayBlocks" class="flex flex-col gap-3 border-l border-[var(--sv-line-strong)] pl-3">
            <template v-for="block in displayBlocks ?? []" :key="block.blockId">
              <div v-if="block.type === 'text'" class="flex flex-col gap-1">
                <div v-if="semanticLabel(block.semanticRole)" class="sv-label">
                  {{ semanticLabel(block.semanticRole) }}
                </div>
                <ReasoningRichText
                  :text="block.text"
                  :streaming="props.isStreaming === true"
                />
              </div>
              <div v-if="block.type === 'image'" class="flex flex-col gap-1">
                <div v-if="semanticLabel(block.semanticRole)" class="sv-label">
                  {{ semanticLabel(block.semanticRole) }}
                </div>
                <img
                  :src="block.url"
                  class="max-h-96 max-w-full rounded-md border border-[var(--sv-line)] object-contain"
                  alt=""
                />
              </div>
              <div
                v-if="block.type === 'opaque'"
                class="sv-meta"
              >
                {{ opaqueLabel(block) }}
              </div>
            </template>
          </div>

          <div v-if="!hasDisplayBlocks" class="text-sm text-[var(--sv-text-3)]">{{ t('chat.reasoning.noPayloadShort') }}</div>
        </template>

        <template v-else-if="props.reasoningView.visibility === 'excluded'">
          <div class="sv-notice p-3 text-sm">
            {{ t('chat.reasoning.excluded') }}
          </div>
        </template>

        <template v-else-if="props.reasoningView.visibility === 'not_returned'">
          <div class="text-sm text-[var(--sv-text-3)]">
            {{ t('chat.reasoning.notReturned') }}
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

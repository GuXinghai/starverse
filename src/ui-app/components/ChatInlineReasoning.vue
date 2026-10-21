<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ReasoningView } from '@/next/state/types'
import ReasoningRichText from '@/ui-kit/chat/ReasoningRichText.vue'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import { t } from '@/shared/i18n'

const props = withDefaults(
  defineProps<{
    messageId?: string | null
    reasoningView: ReasoningView | null
    collapsed: boolean
    displayMode?: 'inline' | 'rail'
    isStreaming?: boolean
  }>(),
  {
    displayMode: 'inline',
    isStreaming: false,
  },
)

const emit = defineEmits<{
  (e: 'toggle'): void
}>()

const pressStartedAt = ref<number | null>(null)
const LONG_PRESS_MS = 450

function onPressStart() {
  pressStartedAt.value = Date.now()
}

function onPressEnd() {
  const startedAt = pressStartedAt.value
  pressStartedAt.value = null
  if (startedAt === null) return
  if (Date.now() - startedAt >= LONG_PRESS_MS) return
  emit('toggle')
}

function onPressCancel() {
  pressStartedAt.value = null
}

const indicator = computed(() => {
  if (props.displayMode === 'rail') return props.collapsed ? '<' : '>'
  return props.collapsed ? 'v' : '^'
})

const indicatorIcon = computed(() => {
  switch (indicator.value) {
    case '<':
      return 'chevronLeft'
    case '>':
      return 'chevronRight'
    case 'v':
      return 'chevronDown'
    default:
      return 'chevronUp'
  }
})

const displayBlocks = computed(() => {
  const blocks = props.reasoningView?.displayBlocks
  if (!Array.isArray(blocks)) return []
  return blocks.filter((block) => {
    if (block?.type === 'text') return block.text.trim().length > 0
    if (block?.type === 'image') return block.url.trim().length > 0
    if (block?.type === 'opaque') return block.label.trim().length > 0
    return false
  })
})

const hasReasoningPayload = computed(() => displayBlocks.value.length > 0)

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

</script>

<template>
  <div>
    <button
      type="button"
      class="-ml-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-left text-[13px] text-[var(--sv-text-3)] hover:bg-[var(--sv-hover)] hover:text-[var(--sv-text)]"
      :aria-expanded="!props.collapsed"
      @mousedown="onPressStart"
      @mouseup="onPressEnd"
      @mouseleave="onPressCancel"
      @touchstart.passive="onPressStart"
      @touchend="onPressEnd"
      @touchcancel="onPressCancel"
    >
      <span>{{ t('chat.reasoning.title') }}</span>
      <span class="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true" :data-indicator="indicator">
        <UiIcon :name="indicatorIcon" :size="14" />
      </span>
    </button>

    <div
      v-if="props.displayMode === 'inline' && !props.collapsed"
      class="mt-1 flex flex-col gap-2 border-l border-[var(--sv-line-strong)] pl-3 text-xs text-[var(--sv-text-2)]"
    >
      <template v-for="block in displayBlocks" :key="block.blockId">
        <div v-if="block.type === 'text'" class="flex flex-col gap-1">
          <div v-if="semanticLabel(block.semanticRole)" class="sv-label">
            {{ semanticLabel(block.semanticRole) }}
          </div>
          <ReasoningRichText
            :text="block.text"
            :streaming="props.isStreaming"
          />
        </div>
        <div v-if="block.type === 'image'" class="flex flex-col gap-1">
          <div v-if="semanticLabel(block.semanticRole)" class="sv-label">
            {{ semanticLabel(block.semanticRole) }}
          </div>
          <img
            :src="block.url"
            class="max-h-72 max-w-full rounded-md border border-[var(--sv-line)] object-contain"
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
      <div v-if="!hasReasoningPayload">
        {{ t('chat.reasoning.emptyPayload') }}
      </div>
    </div>
  </div>
</template>

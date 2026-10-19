<script setup lang="ts">
import { computed } from 'vue'
import {
  reasoningArtifactPreviewText,
  type ReasoningArtifact,
  type ReasoningArtifactKind,
} from '@/next/provider/reasoningArtifact'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import { t, tf } from '@/shared/i18n'

const props = defineProps<{
  artifacts: readonly ReasoningArtifact[]
}>()

const visibleArtifacts = computed(() => props.artifacts.slice(0, 20))

function kindLabel(kind: ReasoningArtifactKind): string {
  switch (kind) {
    case 'reasoning_text':
      return t('diagnostics.reasoningArtifacts.kind.reasoningText')
    case 'reasoning_summary':
      return t('diagnostics.reasoningArtifacts.kind.reasoningSummary')
    case 'thinking_text':
      return t('diagnostics.reasoningArtifacts.kind.thinkingText')
    case 'thought_text':
      return t('diagnostics.reasoningArtifacts.kind.thoughtText')
    case 'signature':
      return t('diagnostics.reasoningArtifacts.kind.signature')
    case 'opaque_reasoning':
      return t('diagnostics.reasoningArtifacts.kind.opaqueReasoning')
    case 'provider_metadata':
      return t('diagnostics.reasoningArtifacts.kind.providerMetadata')
  }
}

function preview(artifact: ReasoningArtifact): string {
  return reasoningArtifactPreviewText(artifact)
}
</script>

<template>
  <details
    v-if="artifacts.length > 0"
    class="group/diag mt-2 text-xs text-[var(--sv-text-3)]"
    data-testid="reasoning-artifact-diagnostics"
  >
    <summary class="flex cursor-pointer select-none items-center gap-1 [&::-webkit-details-marker]:hidden font-medium text-[var(--sv-text-3)] hover:text-[var(--sv-text)]">
      <span class="inline-flex h-3.5 w-3.5 flex-none items-center justify-center transition-transform group-open/diag:rotate-90"><UiIcon name="chevronRight" :size="14" /></span>
      <span>{{ t('diagnostics.reasoningArtifacts.title') }} · {{ artifacts.length }}</span>
    </summary>

    <div class="mt-2 flex flex-col gap-2 border-l border-[var(--sv-line-strong)] pl-3">
      <div
        v-for="artifact in visibleArtifacts"
        :key="artifact.id"
        :data-testid="`reasoning-artifact-${artifact.sequence}`"
      >
        <div class="flex flex-wrap items-center gap-x-2 font-medium text-[var(--sv-text-2)]">
          <span>{{ artifact.providerKey }}</span>
          <span>{{ kindLabel(artifact.kind) }}</span>
          <span>#{{ artifact.sequence }}</span>
        </div>
        <div class="mt-1 whitespace-pre-wrap break-words text-[var(--sv-text-3)]">
          {{ preview(artifact) }}
        </div>
        <div
          v-if="artifact.warnings.length > 0"
          class="mt-1 text-[var(--sv-warning)]"
        >
          {{ artifact.warnings.join(' ') }}
        </div>
      </div>

      <div
        v-if="artifacts.length > visibleArtifacts.length"
        class="text-[var(--sv-text-3)]"
      >
        {{ tf('diagnostics.reasoningArtifacts.hiddenCount', { count: artifacts.length - visibleArtifacts.length }) }}
      </div>
    </div>
  </details>
</template>

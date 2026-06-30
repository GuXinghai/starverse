<script setup lang="ts">
import { computed } from 'vue'
import {
  reasoningArtifactPreviewText,
  type ReasoningArtifact,
  type ReasoningArtifactKind,
} from '@/next/provider/reasoningArtifact'
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
    class="mt-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600"
    data-testid="reasoning-artifact-diagnostics"
  >
    <summary class="cursor-pointer select-none font-medium text-gray-700">
      {{ t('diagnostics.reasoningArtifacts.title') }} · {{ artifacts.length }}
    </summary>

    <div class="mt-2 space-y-2">
      <div
        v-for="artifact in visibleArtifacts"
        :key="artifact.id"
        class="rounded border border-gray-200 bg-white px-2 py-1"
        :data-testid="`reasoning-artifact-${artifact.sequence}`"
      >
        <div class="flex flex-wrap items-center gap-2 font-medium text-gray-700">
          <span>{{ artifact.providerKey }}</span>
          <span>{{ kindLabel(artifact.kind) }}</span>
          <span>#{{ artifact.sequence }}</span>
        </div>
        <div class="mt-1 whitespace-pre-wrap break-words text-gray-600">
          {{ preview(artifact) }}
        </div>
        <div
          v-if="artifact.warnings.length > 0"
          class="mt-1 text-amber-700"
        >
          {{ artifact.warnings.join(' ') }}
        </div>
      </div>

      <div
        v-if="artifacts.length > visibleArtifacts.length"
        class="text-gray-500"
      >
        {{ tf('diagnostics.reasoningArtifacts.hiddenCount', { count: artifacts.length - visibleArtifacts.length }) }}
      </div>
    </div>
  </details>
</template>
